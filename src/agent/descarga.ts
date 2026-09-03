/**
 * Traerse el proyecto: ZIP si se puede, fichero a fichero si no.
 *
 * La vía degradada no es «otra descarga»: es una descarga PARCIAL, porque el servidor no
 * sirve binarios por fichero (medido: `studio_get_file` rechaza `.jpg` por extensión).
 * Por eso se escribe siempre qué se pudo traer: es lo que después impide borrar en Studio
 * lo que aquí no llegó.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CloudStudioPort } from "../core/ports.js";
import type { EstadoDeSync } from "../core/cloudstudio.js";
import { EXTENSIONES_DE_TEXTO } from "../core/planDeSubida.js";
import { NOMBRE_CARPETA } from "./configEnDisco.js";
import { extraerZipBase64 } from "./zip.js";
import { enumerarRemoto } from "./manifiesto.js";

/** Bastante para que la espera de red se solape; poco para no parecer un ataque. */
export const CONCURRENCIA = 6;

export interface OpcionesDeDescarga {
  puerto: CloudStudioPort;
  raiz: string;
  proyecto: { id: string; nombre: string };
  informar?: (texto: string) => void;
}

const extensionDe = (ruta: string): string => {
  const punto = ruta.lastIndexOf(".");
  return punto === -1 ? "" : ruta.slice(punto).toLowerCase();
};

/** Pool acotado. No hay `worker_threads`: esto es espera de red, no CPU. */
async function enParalelo<T>(tareas: Array<() => Promise<T>>, tope: number): Promise<void> {
  let siguiente = 0;
  const obreros = Array.from({ length: Math.min(tope, tareas.length) }, async () => {
    while (siguiente < tareas.length) {
      const mia = tareas[siguiente++]!;
      await mia();
    }
  });
  await Promise.all(obreros);
}

function escribir(raiz: string, ruta: string, contenido: string): void {
  const destino = join(raiz, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  // Se escriben los bytes tal cual: normalizar finales de línea produce diffs fantasma
  // en cada sync y subidas que no cambian nada.
  writeFileSync(destino, contenido, { encoding: "utf8" });
}

export function rutaSyncJson(raiz: string): string {
  return join(raiz, NOMBRE_CARPETA, "cloudstudio", "sync.json");
}

/**
 * Borra del disco las vistas aplanadas y las quita de la lista de descargados.
 *
 * De colecciones solo se trabaja con el `.xne` y con `app.xml`: el `X.xml` lo REGENERA
 * Studio. Hasta ahora solo se le ocultaba al agente con un Proxy; borrarlo de verdad hace
 * que la regla valga también para el usuario, su editor y su `grep`.
 *
 * **El momento es lo que importa**: esto corre tras extraer y ANTES del commit de baseline
 * (`prepararRepo`). Al revés, git vería esos `.xml` como borrados y —al haberse descargado,
 * el candado no los frenaría— la primera subida los borraría EN STUDIO.
 *
 * Que no entren en `descargados` es el segundo cierre: aunque algún día alguien reordene
 * las guardas de `planDeSubida`, el candado sigue impidiendo su borrado remoto.
 */
export function retirarVistasAplanadas(raiz: string, rutas: string[]): string[] {
  // Las extensiones se comparan en minúsculas: un proyecto que viene de Windows puede
  // traer `Foo.XML` junto a `Foo.xne`, y es la misma vista aplanada.
  const fuentes = new Set(
    rutas.filter((r) => r.toLowerCase().endsWith(".xne")).map((r) => r.slice(0, -4).toLowerCase())
  );
  const quedan: string[] = [];
  for (const ruta of rutas) {
    const esVista = ruta.toLowerCase().endsWith(".xml") && fuentes.has(ruta.slice(0, -4).toLowerCase());
    if (!esVista) {
      quedan.push(ruta);
      continue;
    }
    // `app.xml` no tiene hermano `.xne`, así que el propio predicado lo conserva: es fuente.
    rmSync(join(raiz, ruta), { force: true });
  }
  return quedan;
}

export async function descargarProyecto(opciones: OpcionesDeDescarga): Promise<EstadoDeSync> {
  const { puerto, raiz, proyecto, informar = () => {} } = opciones;

  await puerto.abrir(proyecto.nombre);
  const { rama } = await puerto.contexto();
  const { manifiesto, noEnumerados, raizTruncada } = await enumerarRemoto(puerto);
  if (noEnumerados.length > 0) {
    informar(`no se pudo listar: ${noEnumerados.join(", ")}\n`);
  }
  // El inventario es lo que impide borrar en Studio lo que no se pudo bajar. Si viene
  // incompleto, se avisa por consola Y se deja escrito en el propio `sync.json`
  // (`estado.raizTruncada`): un aviso que solo vive en el transcript del turno no
  // sobrevive para la subida que lo lee después.
  if (raizTruncada) {
    informar("el servidor truncó el listado del proyecto: el inventario puede estar incompleto\n");
  }

  let via: EstadoDeSync["via"] = "zip";
  let motivo: string | undefined;
  let descargados: string[] = [];

  try {
    descargados = retirarVistasAplanadas(raiz, extraerZipBase64(await puerto.descargarZip(), raiz));
  } catch (error) {
    // Un solo intento: si el ZIP falla por un fichero roto en Studio, volverá a fallar.
    via = "parcial";
    motivo = (error as Error).message;
    informar(`el ZIP falló (${motivo}); bajando fichero a fichero\n`);

    const candidatos = manifiesto.filter((e) => EXTENSIONES_DE_TEXTO.has(extensionDe(e.ruta)));
    const traidos: string[] = [];
    await enParalelo(candidatos.map((entrada) => async () => {
      try {
        escribir(raiz, entrada.ruta, await puerto.leerTexto(entrada.ruta));
        traidos.push(entrada.ruta);
      } catch (error) {
        // Un fichero que falla no tumba la descarga: simplemente no estará, y por no
        // estar en `descargados` queda protegido contra el borrado. Pero mudo no: los
        // avisos son código, no prompt, y un usuario al que le fallan varios ficheros
        // tiene que saber CUÁLES para poder hacer algo con eso.
        informar(`no se pudo bajar «${entrada.ruta}»: ${(error as Error).message}\n`);
      }
    }), CONCURRENCIA);
    // Misma regla en la vía degradada: si bajó un `.xml` con su `.xne` al lado, fuera.
    descargados = retirarVistasAplanadas(raiz, traidos);
  }

  const estado: EstadoDeSync = {
    proyecto,
    rama,
    fecha: new Date().toISOString(),
    via,
    manifiesto,
    descargados: [...descargados].sort(),
    ...(motivo === undefined ? {} : { motivo }),
    ...(raizTruncada ? { raizTruncada: true } : {}),
  };

  const ruta = rutaSyncJson(raiz);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(estado, null, 2) + "\n");
  return estado;
}
