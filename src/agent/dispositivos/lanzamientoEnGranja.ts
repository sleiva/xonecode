/**
 * «Ejecutar» en la GRANJA de dispositivos: la mitad que lanza cuando el aparato de la sesión es la granja
 * (`core/granja.ts`). Mismo contrato que `lanzamientoEnMaquina.ts` —fases, nunca lanza, cancelable— y sin `adb`:
 *
 *  1. `comprobando`: la copia de la SESIÓN (`releDeGranja.ts#asegurarCopia`). Si el agente ya cogió una en este turno,
 *     es ésa; si no, se pide ahora. Fuera de un turno se queda hasta que acabe el siguiente turno de la sesión o se
 *     cierre (decisión suya: la app tiene que seguir viva para mirarla).
 *  2. `empaquetando`: el proyecto CON `bd/` (`empaquetarProyecto({conBase})`): la copia empieza vacía en cada turno.
 *  3. `subiendo`: `file_upload` de la copia, por la API de la granja con el token y la huella.
 *  4. `lanzando` + `comprobando-arranque`: `lanzarYComprobar` por el canal LOCAL de la sesión, el mismo que usan los
 *     scripts (una sola conexión hacia la granja). Medido: sin reiniciar nada; con la app abierta, subir y lanzar la recarga.
 *
 * «Copiar solo los modificados» no aplica: la copia es nueva en cada turno y se sube entera (se dice en el recorrido).
 */
import type { CopiaDeGranja } from "../../core/canalDeGranja.js";
import { nombreDeCopia } from "../../core/canalDeGranja.js";
import { lanzarYComprobar, type ArranqueDeApp } from "./hotswap.js";
import { pedirAGranja, rutaDeCopia, type ConexionDeGranja } from "./granjaEnRed.js";
import type { FaseDeLanzamiento, LanzamientoEnCurso, ResultadoDeLanzamiento } from "./lanzamientoEnMaquina.js";
import { empaquetarProyecto, enMegas } from "./paqueteDelProyecto.js";
import type { GestorDeCopias } from "./releDeGranja.js";

/** Lo que tarda como mucho la subida de una app a la copia. */
const TOPE_DE_SUBIDA_MS = 10 * 60_000;

export interface EntradaDeLanzamientoEnGranja {
  /** El hilo de la sesión: de él es la copia y el canal. */
  sesion: string;
  raiz: string;
  app: string;
  modo?: "todo" | "modificados";
}

export interface DependenciasDeLanzamientoEnGranja {
  copias: GestorDeCopias;
  conexion: () => ConexionDeGranja | undefined;
  /** El canal local de la sesión (`ws://127.0.0.1:…/hotswap`). */
  canal: (sesion: string) => string;
  empaquetar?: (raiz: string) => Uint8Array;
  subir?: (conexion: ConexionDeGranja, copia: CopiaDeGranja, zip: Uint8Array, app: string) => Promise<{ ok: true } | { ok: false; motivo: string }>;
  lanzar?: (app: string, destino: string) => Promise<ArranqueDeApp>;
}

/** La subida real: `file_upload` de la copia. Nunca lanza. */
async function subirDeVerdad(conexion: ConexionDeGranja, copia: CopiaDeGranja, zip: Uint8Array, app: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const r = await pedirAGranja(conexion, {
    metodo: "POST",
    ruta: `${rutaDeCopia(copia)}/file_upload?file=debug_app_update.zip&appName=${encodeURIComponent(app)}`,
    cabeceras: { "content-type": "application/zip", "content-length": String(zip.length) },
    cuerpo: Buffer.from(zip),
    tope: TOPE_DE_SUBIDA_MS,
  });
  if (r.tipo === "huella-distinta") return { ok: false, motivo: "el certificado de la granja ha cambiado: revísalo en Ajustes → Dispositivos → Granja" };
  if (r.tipo === "sin-respuesta") return { ok: false, motivo: `la granja no responde${r.codigo === undefined ? "" : ` (${r.codigo})`}` };
  r.respuesta.resume();
  return r.http === 200 ? { ok: true } : { ok: false, motivo: `la granja no aceptó la subida (${r.http})` };
}

export function lanzarEnGranja(
  deps: DependenciasDeLanzamientoEnGranja,
  entrada: EntradaDeLanzamientoEnGranja,
  { alFase }: { alFase: (fase: FaseDeLanzamiento, linea: string) => void },
): LanzamientoEnCurso {
  const t0 = Date.now();
  let cancelado = false;
  let fase: FaseDeLanzamiento = "comprobando";
  const paso = (nueva: FaseDeLanzamiento, linea: string): void => {
    fase = nueva;
    alFase(nueva, linea);
  };
  const acabar = (estado: ResultadoDeLanzamiento["estado"], motivo?: string): ResultadoDeLanzamiento => ({
    estado,
    fase,
    ms: Date.now() - t0,
    ...(motivo === undefined ? {} : { motivo }),
  });
  const terminado = (async (): Promise<ResultadoDeLanzamiento> => {
    try {
      paso("comprobando", "pidiendo la copia de la granja de esta sesión");
      const copia = await deps.copias.asegurarCopia(entrada.sesion);
      if ("motivo" in copia) return acabar("fallo", copia.motivo);
      const conexion = deps.conexion();
      if (conexion === undefined) return acabar("fallo", "la granja no está configurada: Ajustes → Dispositivos → Granja");
      alFase("comprobando", `copia: ${nombreDeCopia(copia)} (se libera al acabar el siguiente turno de esta sesión, o al cerrarla)`);
      if (cancelado) return acabar("cancelada");

      paso("empaquetando", "empaquetando el proyecto con su base (bd/): la copia empieza vacía");
      if (entrada.modo === "modificados") alFase("empaquetando", "en la granja se sube entero: la copia es nueva en cada turno");
      const zip = (deps.empaquetar ?? ((raiz: string) => empaquetarProyecto(raiz, undefined, { conBase: true }).bytes))(entrada.raiz);
      alFase("empaquetando", `paquete de ${enMegas(zip.length)}`);
      if (cancelado) return acabar("cancelada");

      paso("subiendo", `subiendo a ${nombreDeCopia(copia)}`);
      const subida = await (deps.subir ?? subirDeVerdad)(conexion, copia, zip, entrada.app);
      if (!subida.ok) return acabar("fallo", subida.motivo);
      if (cancelado) return acabar("cancelada");

      paso("lanzando", `lanzando ${entrada.app}`);
      const lanzar = deps.lanzar ?? ((app: string, destino: string) => lanzarYComprobar(app, { destino }));
      paso("comprobando-arranque", "esperando a que la app conteste");
      const arranque = await lanzar(entrada.app, deps.canal(entrada.sesion));
      if (cancelado) return acabar("cancelada");
      return arranque.viva ? acabar("ok") : acabar("fallo", arranque.motivo ?? "la app no llegó a contestar");
    } catch (error) {
      // El contrato es no lanzar: un fallo del disco al empaquetar, por ejemplo, vuelve como motivo.
      return acabar("fallo", error instanceof Error ? error.message : String(error));
    }
  })();
  return {
    cancelar: () => {
      cancelado = true;
    },
    terminado,
  };
}
