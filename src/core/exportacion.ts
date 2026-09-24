/**
 * Exportar un documento del proyecto a PDF: las reglas PURAS.
 *
 * **Por qué el harness y no el agente.** Producir un PDF es lo que las skills `pdf`/`docx`
 * de Claude Code hacen ejecutando scripts, y a un motor externo no se le concede shell
 * —`Bash` está denegada, y abrirla dejaría a ese hijo reescribir el proyecto sin diff ni
 * aprobación—. Medido además sobre la máquina real: esas skills asumen el sandbox donde sus
 * dependencias vienen puestas (`reportlab`, `pypdf`, `docx` de npm, `pandoc`), y ahí no
 * estaba ninguna, así que conceder la shell no habría dado el PDF. Lo que sí hay en cualquier
 * máquina que use la consola web es un navegador, y un navegador imprime — así que la
 * conversión la hace el harness con un comando FIJO, y la shell del hijo sigue cerrada.
 *
 * Aquí solo está lo que se puede decidir sin tocar disco. Lanzar el navegador es de
 * `agent/exportarPdf.ts`.
 */

/**
 * Lo que se sabe convertir. Lista CERRADA: lo que no está no se intenta.
 *
 * `.md` porque es lo que el agente escribe cuando se le pide documentación, y `.html` porque
 * es lo que produce la skill de artefactos. Un `.xne` o un `.js` no entran: imprimir código
 * fuente a PDF no es una necesidad que nadie haya tenido, y ofrecerlo sería un botón que
 * nadie pulsa sobre cada fichero del árbol.
 */
export const EXTENSIONES_EXPORTABLES = [".md", ".html", ".htm"] as const;

/** ¿Hace falta convertir Markdown antes, o el fichero ya es HTML? */
export function esMarkdown(ruta: string): boolean {
  return ruta.toLowerCase().endsWith(".md");
}

/**
 * Por qué no se puede exportar esa ruta, o AUSENTE si vale.
 *
 * No comprueba que exista ni que se pueda leer: de eso ya hay una barrera
 * (`motivoDeRutaInaceptable` y el `realpath` de `leerFicheroDeProyecto`), y duplicarla aquí
 * sería un segundo sitio donde decidir sobre una ruta.
 */
export function motivoDeExportacionInaceptable(ruta: string): string | undefined {
  const bajo = ruta.toLowerCase();
  if (!EXTENSIONES_EXPORTABLES.some((e) => bajo.endsWith(e))) {
    return `solo se exportan ${EXTENSIONES_EXPORTABLES.join(", ")} — «${ruta}» no es ninguno`;
  }
  return undefined;
}

/**
 * Dónde queda el PDF: al lado del original y con su mismo nombre.
 *
 * **El destino lo DERIVA el código, nunca se recibe.** Es lo que impide que quien pide la
 * exportación elija dónde escribir: con un destino por parámetro, esta función sería una
 * forma de escribir cualquier fichero del proyecto sin pasar por ninguna aprobación.
 */
export function rutaDePdf(ruta: string): string {
  const punto = ruta.lastIndexOf(".");
  return `${punto <= 0 ? ruta : ruta.slice(0, punto)}.pdf`;
}

/**
 * El documento listo para imprimir: el cuerpo HTML dentro de una hoja de estilos de PÁGINA.
 *
 * Los estilos no son decoración, son lo que hace legible un PDF de doce páginas y se
 * comprobaron imprimiendo uno de verdad: `@page` con márgenes, `break-inside: avoid` en
 * tablas y bloques de código —sin eso una tabla se parte por la mitad entre dos hojas— y
 * `break-after: avoid` en los encabezados, para que un título no se quede solo al pie.
 *
 * **Y una imagen se limita también en ALTO**, no solo en ancho. Medido con una captura de móvil
 * (1080×2400): con solo `max-width: 100%` medía unos 40 cm a todo el ancho de un A4, más que la
 * página, y el PDF salía con el título solo en la primera hoja y la captura partida en las dos
 * siguientes. Con `max-height` se reduce entera, sin deformarse, y cabe en una página.
 *
 * El título va ESCAPADO: sale de un nombre de fichero del proyecto, y un `<` ahí dentro
 * rompería la cabecera del documento.
 */
export function documentoImprimible(cuerpo: string, titulo: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
${POLITICA_SIN_SCRIPTS}
<title>${escaparHtml(titulo)}</title>
<style>
@page { size: A4; margin: 18mm 16mm 20mm; }
body { font: 10.5pt/1.55 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1a1a; }
h1 { font-size: 22pt; border-bottom: 2px solid #0b5fff; padding-bottom: .3em; }
h2 { font-size: 15pt; margin-top: 1.6em; border-bottom: 1px solid #d7dbe0; padding-bottom: .2em; }
h3 { font-size: 12pt; margin-top: 1.2em; }
h1, h2, h3, h4 { break-after: avoid; break-inside: avoid; }
table { border-collapse: collapse; width: 100%; margin: .8em 0; font-size: 9pt; break-inside: avoid; }
th, td { border: 1px solid #c9ced6; padding: 5px 7px; text-align: left; vertical-align: top; }
th { background: #eef2f7; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em;
       background: #f3f5f8; padding: 1px 4px; border-radius: 3px; }
pre { background: #f7f8fa; border: 1px solid #e2e6ec; border-radius: 5px; padding: 10px;
      overflow-x: auto; break-inside: avoid; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #0b5fff; margin: 1em 0; padding: .2em 1em; background: #f5f8ff; }
img { max-width: 100%; max-height: 190mm; width: auto; height: auto; display: block; margin: .6em auto; break-inside: avoid; }
hr { border: 0; border-top: 1px solid #d7dbe0; margin: 1.6em 0; }
a { color: #0b5fff; text-decoration: none; }
</style>
</head>
<body>${cuerpo}</body>
</html>
`;
}

/**
 * La política que impide que imprimir ejecute nada.
 *
 * **Y es una CSP y no un flag del navegador, porque los flags NO lo hacen.** Medido contra
 * el Chrome instalado con un documento que reescribe su propio texto desde un `<script>`:
 * con `--disable-javascript`, con `--blink-settings=scriptEnabled=false` y sin nada, el
 * script se ejecutó en los tres casos; y encima el segundo hace que `--print-to-pdf` no
 * escriba el fichero, en silencio y con código de salida 0. Con esta CSP el script no corre.
 *
 * `default-src 'none'` corta además las peticiones de RED: un documento del proyecto podría
 * llevar un `<img src="https://…">` que se lleve fuera el hecho de que se está imprimiendo.
 * Lo que se deja es lo que un PDF necesita: imágenes locales o embebidas, estilos en línea
 * —los nuestros— y tipografías locales.
 */
export const POLITICA_SIN_SCRIPTS =
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
  `img-src 'self' data: file:; style-src 'unsafe-inline' 'self'; font-src 'self' data:">`;

/**
 * El mismo blindaje para un documento que YA es HTML y no pasa por nuestra plantilla.
 *
 * Se inserta lo antes posible: dentro de su `<head>` si lo tiene, dentro de su `<html>` si
 * no, y al principio si no hay ninguno de los dos. **Inyectarla siempre TENSA y nunca
 * afloja**: cuando un documento trae su propia CSP, el navegador exige que TODAS las
 * políticas permitan cada carga, así que añadir la nuestra no puede ampliar lo que el
 * documento ya se permitía.
 *
 * **Límite declarado**: esto es una transformación de TEXTO, no un parser. Un documento
 * con un `<head` dentro de un comentario o de una cadena puede recibir la meta en un sitio
 * raro; el peor caso es que no aplique, que es exactamente donde estábamos antes.
 */
export function conPoliticaSinScripts(html: string): string {
  const tras = (patron: RegExp): string | undefined => {
    const m = patron.exec(html);
    return m === null ? undefined : `${html.slice(0, m.index + m[0].length)}${POLITICA_SIN_SCRIPTS}${html.slice(m.index + m[0].length)}`;
  };
  return tras(/<head\b[^>]*>/i) ?? tras(/<html\b[^>]*>/i) ?? `${POLITICA_SIN_SCRIPTS}${html}`;
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
