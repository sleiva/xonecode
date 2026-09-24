/**
 * El DOCUMENTO de un artefacto `.openui`: el visor (renderer + librería de componentes, que el
 * build de `apps/web` deja en `dist/openui/`) y el programa, en UNA página autocontenida.
 *
 * **Todo va dentro, y no por comodidad.** El iframe de un artefacto tiene un origen opaco
 * (`sandbox="allow-scripts"` sin `allow-same-origin`), y una petición suya al servidor sale con
 * `Origin: null` y recibe un 403 (`servidor.ts`). Un `<script src>` al visor no llegaría nunca.
 *
 * **La CSP es más estricta que la de un artefacto HTML**, y se puede: un HTML de una skill carga
 * tipografías y Mermaid de un CDN, y por eso aquel no cierra la red; esto no carga NADA de fuera,
 * así que se cierra entera. Corta también lo que la librería de componentes trae dentro sin que
 * nadie lo pida —una imagen de relleno de `picsum.photos`, los favicons de Google en una cita—:
 * medido en el bundle, sin esta cabecera saldrían de la máquina al pintar.
 *
 * Puro: quien lee el disco pasa el visor ya leído, y un test prueba el documento sin build.
 */

/** La política del documento de un `.openui`: aislado como un artefacto y SIN red. */
export const CSP_DE_OPENUI = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** ¿Este artefacto es un programa de OpenUI? Por la extensión, como todo mime de artefacto. */
export function esArtefactoOpenui(nombre: string): boolean {
  return nombre.toLowerCase().endsWith(".openui");
}

/**
 * Lo que no puede aparecer tal cual dentro de un `<script>` o un `<style>` sin cerrarlo antes
 * de tiempo. En JavaScript `<\/script` es la misma cadena y la misma expresión regular; en CSS,
 * `<\/style` dentro de una cadena también.
 */
function sinCierre(texto: string, etiqueta: "script" | "style"): string {
  return texto.replace(new RegExp(`</${etiqueta}`, "gi"), `<\\/${etiqueta}`);
}

/**
 * El documento entero. El programa viaja como JSON dentro de un `<script type="application/json">`
 * —que el navegador NO ejecuta— con el `<` escapado, así que un programa que contenga
 * `</script>` no puede salirse de su sitio: lo lee el visor con `JSON.parse`, nunca se inyecta.
 */
export function documentoDeOpenui(programa: string, visor: { js: string; css: string }, titulo: string): string {
  const datos = JSON.stringify(programa).replace(/</g, "\\u003c");
  const tituloSeguro = titulo.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  return [
    "<!doctype html>",
    '<html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${tituloSeguro}</title>`,
    `<style>${sinCierre(visor.css, "style")}</style>`,
    "<style>body{margin:0;padding:16px;background:#fff}.xonecode-openui-errores{margin:0 0 12px;padding:8px 12px;border-left:3px solid #b42318;background:#fef3f2;font:13px/1.5 system-ui}.xonecode-openui-errores ul{margin:4px 0 0;padding-left:18px}</style>",
    "</head><body>",
    '<div id="xonecode-raiz"></div>',
    `<script type="application/json" id="xonecode-programa">${datos}</script>`,
    `<script>${sinCierre(visor.js, "script")}</script>`,
    "</body></html>",
  ].join("\n");
}
