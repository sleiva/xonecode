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
import { destinoSeguro, extraerZipBase64 } from "./zip.js";
import { enumerarRemoto } from "./manifiesto.js";

/** Bastante para que la espera de red se solape; poco para no parecer un ataque. */
export const CONCURRENCIA = 6;

export interface OpcionesDeDescarga {
  puerto: CloudStudioPort;
  raiz: string;
  proyecto: { id: string; nombre: string };
  /**
   * La rama ORIGEN: de la que se baja. Sin fijarla aquí, `descargarProyecto` trae lo que
   * sea que esté ACTIVO en la sesión de Studio —que no tiene por qué ser esta—, y una
   * subida posterior firmaría ese contenido como si fuera de `ramaOrigen`, en silencio.
   */
  ramaOrigen: string;
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
  // La ruta viene del JSON del servidor tal cual. `join(raiz, ruta)` con un `../` escribe
  // FUERA del proyecto: la misma guarda que el ZIP ya tenía (`zip.ts#destinoSeguro`), en
  // el camino que no la tenía. Lanza, y el llamador lo cuenta como fichero no bajado.
  const destino = destinoSeguro(raiz, ruta);
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
    // Y se BORRA por la ruta contenida, no por `join` a secas: aquí las rutas también
    // vienen del servidor, y un `rmSync` fuera de la raíz es peor que una escritura.
    rmSync(destinoSeguro(raiz, ruta), { force: true });
  }
  return quedan;
}

export async function descargarProyecto(opciones: OpcionesDeDescarga): Promise<EstadoDeSync> {
  const { puerto, raiz, proyecto, ramaOrigen, informar = () => {} } = opciones;

  await puerto.abrir(proyecto.nombre);
  // Mismo patrón que `agent/subida.ts#subir`: leer la rama ACTIVA, posicionarse en la
  // ORIGEN si hace falta, operar, y restaurar SIEMPRE la que estaba en un `finally`
  // —`switch` le mueve el suelo a quien tenga Studio abierto en el navegador—. Sin este
  // posicionamiento explícito se bajaba lo que estuviera activo en la sesión (no
  // necesariamente `ramaOrigen`), y una subida posterior atribuía ese contenido a
  // `ramaOrigen` sin comprobarlo: rama B bajada, firmada y subida como si fuera la A.
  const antes = await puerto.contexto();
  if (antes.rama !== ramaOrigen) await puerto.cambiarRama(ramaOrigen);
  try {
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

    // La rama del estado es la ORIGEN pedida, no una que se vuelva a leer de `contexto()`:
    // es la que se acaba de fijar arriba (o la que ya estaba, si coincidían), así que
    // «lo que se bajó» y «lo que dice `sync.json`» nunca pueden divergir.
    const estado: EstadoDeSync = {
      proyecto,
      rama: ramaOrigen,
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
  } finally {
    if (antes.rama !== ramaOrigen) await puerto.cambiarRama(antes.rama);
  }
}
