/**
 * Lo que deepagents DESCARGA fuera del contexto, y dónde tiene que caer.
 *
 * Cuando la salida de una tool pasa de su tope (`toolTokenLimitBeforeEvict`, 20k tokens por
 * omisión) el `FilesystemMiddleware` no la mete en el hilo: la escribe en
 * `/large_tool_results/<tool_call_id>.txt` y deja en su sitio un mensaje que le dice al
 * modelo dónde mirar. Lo mismo hace con un mensaje de usuario enorme
 * (`humanMessageTokenLimitBeforeEvict`, 50k tokens), que va a `/conversation_history/<id>`.
 * Las dos rutas están **a fuego** en la librería —comprobado en deepagents 1.13.2: no hay
 * opción para cambiarlas— y las escribe llamando al backend DIRECTAMENTE, así que no pasan
 * por ninguna tool: ni por el HITL ni por `permissions`.
 *
 * **Y ese es el problema que este módulo cierra.** Medido el 10-09-2026 en el AppDemo real
 * del usuario: `large_tool_results/call_866999.txt`, 26 KB, DENTRO del proyecto XOne y
 * commiteado — ninguna de las dos rutas estaba montada, así que caían en el
 * `FilesystemBackend` de la raíz. Es exactamente la forma del problema de `/artifacts/` que
 * ya documenta `core/artefactos.ts`: una salida interna del agente dentro de la app del
 * cliente, que el siguiente `/sync subir` se lleva a CloudStudio porque el plan son «los
 * ficheros CAMBIADOS». Y de paso ensuciaba la atribución de Revisión, apareciendo como un
 * fichero que escribió la sesión.
 *
 * Este módulo es `core/`: los nombres, dónde va la carpeta y la barrera. Quién la monta es
 * de `agent/` (`agent/proyecto.ts#backendConDescargas`).
 */
import { dirname, join } from "node:path";

/**
 * Los dos prefijos virtuales, con barra final: `CompositeBackend` la exige para no
 * reconstruir `//nombre` fuera de la raíz montada — la misma trampa medida con `/skills/`.
 *
 * Los nombres son los de la librería y no una elección nuestra: cambiarlos aquí no cambiaría
 * dónde escribe ella, solo dejaría el montaje sin usar.
 */
export const RUTA_RESULTADOS_GRANDES = "/large_tool_results/";
export const RUTA_HISTORIAL_DE_MENSAJES = "/conversation_history/";

/** Las dos, para montarlas de una vez. */
export const RUTAS_DE_DESCARGA = [RUTA_RESULTADOS_GRANDES, RUTA_HISTORIAL_DE_MENSAJES] as const;

/**
 * Dónde cae en DISCO una de esas carpetas: al LADO de la de artefactos de la sesión.
 *
 * Se deriva de la carpeta de artefactos en vez de recibir su propio parámetro, y no es
 * pereza: esa carpeta ya lleva dentro la única decisión que hace falta —¿hay una sesión con
 * IDENTIDAD?—, que `turnoReal.ts` resuelve pasando `.xonecode/sesiones/<id>/artefactos` en
 * la web y cayendo a `.xonecode/artefactos` en el terminal, donde el hilo es un uuid nuevo
 * en cada arranque y no habría nada que reabrir. Dos parámetros serían dos sitios donde
 * contestar la misma pregunta, y el segundo es justo el que se cae en un cableado de ocho
 * saltos — el patrón de fallo que este repo ya ha medido seis veces.
 *
 * Y de vivir AHÍ cuelga gratis lo que si no habría que escribir: `borrarSesion` ya borra la
 * carpeta `<id>` entera (`rmSync(dirname(carpetaDeArtefactosDeSesion(...)))`), así que
 * borrar una conversación se lleva también sus descargas — que es lo correcto, por el mismo
 * motivo que se lleva su checkpoint: ahí dentro está la salida entera de tools que se
 * ejecutaron en ella.
 *
 * En el terminal la carpeta es del PROYECTO y no de un hilo, y eso hay que decirlo: esos
 * ficheros se acumulan entre arranques y nada los poda. Es la misma deuda declarada del
 * checkpointer — en este repo no hay barrido de nada todavía.
 */
export function carpetaDeDescargas(carpetaDeArtefactos: string, ruta: string): string {
  return join(dirname(carpetaDeArtefactos), nombreDeCarpeta(ruta));
}

/** El nombre llano del prefijo: `/large_tool_results/` → `large_tool_results`. */
function nombreDeCarpeta(ruta: string): string {
  return ruta.replace(/^\/+/, "").replace(/\/+$/, "");
}

/** Los nombres de las dos carpetas, en minúsculas, para la barrera de abajo. */
const CARPETAS = new Set(RUTAS_DE_DESCARGA.map((r) => nombreDeCarpeta(r).toLowerCase()));

/**
 * ¿Es esta ruta una descarga del agente escrita en el PROYECTO? Y si lo es, dónde iba.
 *
 * Existe para que la regla no dependa del montaje. Con las dos raíces montadas esto no
 * salta nunca —`CompositeBackend.getBackendAndKey` enruta por PREFIJO de texto y sin mirar
 * si la carpeta destino existe (leído en deepagents 1.13.2), así que el backend del proyecto
 * no llega a ver esas rutas—, y ahí está el sentido: el día que el montaje falte (una
 * consola construida sin carpeta de artefactos, un cableado que se cae en silencio) la
 * escritura falla CERRADO en vez de aterrizar en la app del cliente. Es la misma lección
 * que la fila incondicional de `/adjuntos/` en `permisosDe`, y por el mismo camino: medido,
 * sin ella la ruta se convertía en un fichero del proyecto.
 *
 * **Se mira el PRIMER segmento y nada más**, igual que `artefactoFueraDeSitio`, y con el
 * mismo precio dicho: un proyecto que de verdad tuviera una carpeta `large_tool_results/`
 * en su raíz no podría escribir ahí con el agente. Se acepta — ninguna convención de XOne
 * usa esos nombres, y el otro lado del error es la salida cruda de una tool subida a la app
 * del cliente. Sin distinguir mayúsculas, que es la lección de APFS.
 */
export function descargaFueraDeSitio(ruta: string): string | undefined {
  const segmentos = ruta.split(/[\\/]+/).filter((s) => s.length > 0);
  if (segmentos.length < 2) return undefined;
  const primero = segmentos[0]!.toLowerCase();
  if (!CARPETAS.has(primero)) return undefined;
  return `/${primero}/`;
}

/**
 * El motivo con el que se rechaza. Dice QUÉ es y por qué no va ahí, como `porQueNoAhi`: un
 * error seco haría que el modelo probara otra ruta o diera el trabajo por hecho.
 *
 * Aquí quien lee el mensaje casi nunca es el modelo —estas escrituras las hace la librería,
 * y su hueco en el contexto es un «no se pudo guardar»— así que el destinatario de verdad
 * es quien esté leyendo un log. Por eso nombra la causa probable.
 */
export const porQueNoEsDelProyecto = (ruta: string, destino: string): string =>
  `«${ruta}» es una descarga interna del agente, no un fichero del proyecto: ahí acabaría ` +
  `dentro de la app XOne del usuario y subiría a CloudStudio. Va en «${destino}», que se ` +
  `monta fuera del proyecto; si no está montada, esta consola se construyó sin carpeta de ` +
  `sesión y eso es lo que hay que arreglar.`;
