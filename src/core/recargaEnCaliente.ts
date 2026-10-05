/**
 * Qué hace el aparato con un fichero recién guardado en el editor: la regla de la recarga en
 * caliente, pura.
 *
 * La regla es la de `skills/xone-hotswap/scripts/xone-recargar-android`, MEDIDA contra el
 * framework 5.0.5.5dev, y no se inventa una nueva:
 *
 *   colección (`.xne` con `<coll`)  →  `uploadFile` + `loadCollection`: se repinta en el acto. Solo
 *                                      en memoria, y por eso se sube también a disco — sin eso,
 *                                      relanzar la app la devuelve a la versión anterior.
 *   JavaScript (`.js`)              →  `uploadFile` + `loadIncludeFile` con `compile: true`.
 *   CSS, `.ini`, `app.xml`, un `.xne` sin colección (mappings)
 *                                   →  `uploadFile`, y hace falta RELANZAR la app. Medido:
 *                                      `setCssAttribute`, `relayout` y `refresh` contestan
 *                                      `result:true` y no cambian nada.
 *   todo lo demás (iconos, `bd/`, `files/`)  →  no se recarga: lo lleva el despliegue entero.
 *
 * **Relanzar no se hace solo**: se pierde el estado de la pantalla en que está la persona, así
 * que lo que se devuelve es «hace falta relanzar» y la pantalla lo OFRECE.
 */
import { decodificarComoTexto, esUtf8Valido, tablaDeLosBytes } from "./codificacion.js";

export type ClaseDeRecarga = "coleccion" | "js" | "relanzar" | "no-aplica";

/** Las extensiones que el aparato sabe tomar sueltas. Las mismas del script. */
const EXTENSIONES = new Set([".xne", ".js", ".css", ".ini", ".xml"]);

/** Carpetas que nunca viajan sueltas. Las mismas del script. */
const FUERA = ["bd", "files", "icons"];

/** Una colección se declara con `<coll`: lo mismo que mira el script, sobre la cabeza del texto. */
const DECLARA_COLECCION = /<coll[\s>/]/;

function extension(ruta: string): string {
  const nombre = ruta.slice(ruta.lastIndexOf("/") + 1);
  const punto = nombre.lastIndexOf(".");
  return punto <= 0 ? "" : nombre.slice(punto).toLowerCase();
}

/**
 * Cómo se aplica `ruta` (relativa, con `/`) con estos `bytes`. El texto se mira byte a byte: la
 * etiqueta `<coll` es ASCII en cualquier tabla.
 */
export function claseDeRecarga(ruta: string, bytes: Uint8Array): ClaseDeRecarga {
  const limpia = ruta.replace(/^\/+/, "");
  if (FUERA.some((f) => limpia === f || limpia.startsWith(`${f}/`))) return "no-aplica";
  const ext = extension(limpia);
  if (!EXTENSIONES.has(ext)) return "no-aplica";
  if (ext === ".js") return "js";
  if (ext === ".xne") {
    let cabeza = "";
    for (const b of bytes) cabeza += String.fromCharCode(b);
    return DECLARA_COLECCION.test(cabeza) ? "coleccion" : "relanzar";
  }
  return "relanzar";
}

/**
 * El nombre de la codificación que se le dice al framework para que lea ESTOS bytes. Es la misma
 * regla que la lectura del agente y del editor (`core/codificacion.ts`): UTF-8 si lo es; si no, la
 * tabla de 8 bits que declare el prólogo (ISO-8859-15) o windows-1252. Mandar `UTF-8` a secas
 * —lo que hace el script— enseñaba en el aparato un «�» en cada tilde de un `.xne` Latin-1.
 * Los nombres son los de `java.nio.charset`, que es quien los lee al otro lado.
 */
export function codificacionParaElAparato(bytes: Uint8Array): "UTF-8" | "ISO-8859-15" | "windows-1252" {
  if (esUtf8Valido(bytes)) return "UTF-8";
  return tablaDeLosBytes(bytes) === "iso-8859-15" ? "ISO-8859-15" : "windows-1252";
}

/**
 * Lo que se le da a `loadCollection`: el MISMO XML, en UTF-8 y con el prólogo diciendo UTF-8.
 *
 * MEDIDO en el emulador (framework 5.0.5.5dev) con un `.xne` en ISO-8859-15 y «Año ñá»: con sus
 * bytes y `encoding: "ISO-8859-15"` el aparato pintaba «AÃ±o Ã±Ã¡» —y estropeaba también el
 * «Contraseña» que ya estaba—; con el texto en UTF-8 y el prólogo cambiado a UTF-8 se ve bien. El
 * framework decodifica con `encoding` y su analizador vuelve a leer el prólogo: si los dos no dicen
 * lo mismo que los bytes, cada tilde sale doble. Solo para la copia EN MEMORIA: lo que se sube a
 * disco (`uploadFile`) son los bytes tal cual, que es lo que el framework lee al relanzar.
 */
export function xmlParaCargarEnMemoria(bytes: Uint8Array): Uint8Array {
  const texto = decodificarComoTexto(bytes).replace(/^\uFEFF/, "");
  const conPrologoUtf8 = texto.replace(
    /^(\s*<\?xml[^?]*?encoding\s*=\s*)(["'])[^"']*\2/i,
    (_todo, antes: string, comilla: string) => `${antes}${comilla}UTF-8${comilla}`
  );
  return new TextEncoder().encode(conPrologoUtf8);
}

/** Dónde guarda el framework lo que se le sube: `app_<nombre en minúsculas>/<ruta>` (medido). */
export function destinoEnElAparato(app: string, ruta: string): string {
  return `app_${app.toLowerCase()}/${ruta.replace(/^\/+/, "")}`;
}

/**
 * En qué acabó una recarga. Cada estado es un hecho distinto y se pinta distinto:
 * - `aplicada`: subido, aplicado, y la app CONTESTA su árbol después (no «cambiado»: `result:true`
 *   es «aceptado», y lo que se cambió lo comprueba quien mira la pantalla).
 * - `relanzar`: subido; para verse hay que relanzar la app, y eso se ofrece, no se hace.
 * - `relanzada`: se relanzó a petición y la app volvió a contestar.
 * - `sin-app`: no hay a dónde recargar —la app no contesta, o no hay aparato, o no está en la medida—;
 *   `motivo` dice cuál. No se tocó nada.
 * - `desplegando`: se pidió PROBAR y la app no corría, así que se lanzó el despliegue entero (el de
 *   Ejecutar); su recorrido se cuenta allí.
 * - `desplegada`: el despliegue que lanzó «Probar» acabó con la app viva.
 * - `ocupado`: hay un despliegue en curso; no se recarga encima de él.
 * - `no-aplica`: este fichero no se lleva suelto.
 * - `fallo`: algo dijo que no; `motivo` es la frase literal.
 */
export type EstadoDeRecarga =
  | "aplicada"
  | "relanzar"
  | "relanzada"
  | "sin-app"
  | "desplegando"
  | "desplegada"
  | "ocupado"
  | "no-aplica"
  | "fallo";

export interface ResultadoDeRecarga {
  estado: EstadoDeRecarga;
  /** Qué se hizo, cuando se hizo algo: la clase con que se aplicó. */
  clase?: ClaseDeRecarga;
  /** UNA línea: lo que dijo el framework, o por qué no hay a dónde recargar. En `fallo` y `sin-app`. */
  motivo?: string;
}

/** La frase que enseña la cabecera del editor. Pura para que el test la fije. */
export function textoDeRecarga(r: ResultadoDeRecarga): string {
  switch (r.estado) {
    case "aplicada":
      return r.clase === "js"
        ? "Aparato: JavaScript recargado; la app sigue viva"
        : "Aparato: pantalla recargada en caliente; la app sigue viva";
    case "relanzar":
      return "Aparato: subido; para verlo hay que relanzar la app";
    case "relanzada":
      return "Aparato: app relanzada y viva";
    case "sin-app":
      // El motivo, si se sabe: «no hay aparato elegido» y «no está en la medida» no se arreglan
      // en el mismo sitio que «la app no corre».
      return r.motivo !== undefined && !r.motivo.includes("App is not running")
        ? `Aparato: no se recarga (${r.motivo})`
        : "Aparato: la app no está corriendo; lánzala desde Ejecutar o pulsa Probar";
    case "desplegada":
      return "Aparato: proyecto desplegado y la app viva";
    case "desplegando":
      return "Aparato: la app no corría; desplegando el proyecto (el recorrido, en Ejecutar)";
    case "ocupado":
      return "Aparato: hay un despliegue en curso; no se recarga encima";
    case "no-aplica":
      return "Aparato: este fichero no se recarga suelto; hace falta desplegar entero";
    case "fallo":
      return `Aparato: no se pudo recargar (${r.motivo ?? "sin motivo"})`;
  }
}
