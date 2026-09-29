/**
 * De dónde puede salir la MAQUETA con la que se compara una captura (IXCODE-18).
 *
 * ## Por qué existe, medido
 *
 * Las tools de comparación (`comparar_capturas`, `xone_critica_visual`) solo leían de
 * `/artefactos/`. Pero la maqueta de un encargo no vive ahí: la trae la persona en el CHAT
 * (`/adjuntos/`) o está en el proyecto (`/diseno/`). Rehaciendo una calculadora de Stitch desde cero,
 * el agente lo dijo tal cual —«el proyecto no traía maqueta»— y el crítico corrió sin referencia:
 * su verde significaba «nada roto», y no vio que faltaba la barra superior entera ni que el teclado
 * no llegaba abajo. Comparar contra el diseño era imposible por una ruta, no por falta de tool.
 *
 * ## Qué se acepta
 *
 * Una imagen PNG o JPEG en uno de tres sitios, por su ruta VIRTUAL:
 * - `/artefactos/…`: lo de siempre.
 * - `/adjuntos/…`: lo que la persona adjuntó (de solo lectura).
 * - Un fichero del PROYECTO (`/diseno/screen.png`): cualquier ruta cuyos segmentos sean llanos.
 *
 * **Lista BLANCA de forma, sobre el TEXTO** (como `esRutaDeArtefacto`): letras, cifras, punto, guion y
 * guion bajo; nada de `..`, `.`, segmentos vacíos, barra invertida, NUL. Y en el proyecto **ningún
 * segmento puede empezar por punto**: eso deja fuera `.env`, `.git` y `.xonecode` (la memoria, los
 * planes y `checkpoint.sqlite`) sin depender de una lista de nombres que se quede corta. Lo que
 * compruebe la lectura real (`agent/grafo/lectorDeReferencias.ts`) es lo mismo, dos veces: texto y
 * `realpath`.
 */

export type OrigenDeImagen = "artefactos" | "adjuntos" | "proyecto";

export interface ImagenReferida {
  origen: OrigenDeImagen;
  /** La ruta detrás de la carpeta de su origen (para el proyecto, sin la barra inicial). */
  relativa: string;
  /** El último segmento: lo que se le enseña a una persona. */
  nombre: string;
}

const SEGMENTO = /^[A-Za-z0-9._-]+$/;
const EXTENSIONES = new Set(["png", "jpg", "jpeg"]);

/** La imagen a la que apunta la ruta, o el MOTIVO en palabras. Comprueba el texto y no abre nada. */
export function imagenReferida(ruta: string): ImagenReferida | string {
  if (!ruta.startsWith("/")) return `«${ruta}» no es una ruta virtual: empieza por / (/diseno/screen.png, /artefactos/x.png)`;
  const segmentos = ruta.slice(1).split("/");
  if (segmentos.some((s) => s === "" || s === "." || s === ".." || !SEGMENTO.test(s))) {
    return `«${ruta}» no es una ruta aceptable: solo letras, cifras, punto, guion y guion bajo, sin «..» ni segmentos vacíos`;
  }
  const nombre = segmentos[segmentos.length - 1]!;
  const punto = nombre.lastIndexOf(".");
  const extension = punto > 0 ? nombre.slice(punto + 1).toLowerCase() : "";
  if (!EXTENSIONES.has(extension)) return `«${nombre}» no es un PNG ni un JPEG, así que no hay nada que medir.`;
  const primero = segmentos[0]!;
  if (primero === "artefactos" || primero === "adjuntos") {
    if (segmentos.length < 2) return `«${ruta}» no apunta a ninguna imagen`;
    return { origen: primero, relativa: segmentos.slice(1).join("/"), nombre };
  }
  // Del proyecto: sin dotfiles (`.env`, `.git`, `.xonecode`) ni, por si acaso, las carpetas del harness.
  if (segmentos.some((s) => s.startsWith("."))) return `«${ruta}» no se puede leer: los ficheros y carpetas que empiezan por punto están vedados`;
  if (primero === "skills" || primero === "hotswap") return `«${ruta}» no es una imagen del proyecto`;
  return { origen: "proyecto", relativa: segmentos.join("/"), nombre };
}
