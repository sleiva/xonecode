/**
 * Escapa los dólares del texto del asistente para que `MarkdownText` no los lea como TeX.
 *
 * Medido en vivo: se pidió al agente que escribiera «en XOne se usa $http para peticiones
 * y el objeto $ui no existe» y el chat pintó «en XOne se usa *httpparapeticionesyelobjeto*ui
 * no existe» — todo lo que había entre los dos dólares se convirtió en fórmula, en cursiva
 * y sin espacios. El renderizador de deepseek monta `micromark-extension-math` con el dólar
 * simple activado y no expone ningún interruptor (sus props son `text`, `streaming`,
 * `codeLabels` y `fileMentions`). Y por sus propios tipos, la gramática de streaming NO
 * tiene matemáticas y la asentada sí: la frase se veía bien mientras llegaba y mutaba al
 * terminar el turno.
 *
 * En XOne `$http` es un objeto real y `$` aparece en SQL y en scripts; LaTeX no lo necesita
 * nadie aquí, y el único que se vio (un `$$\mathbf{<coll>}$$` del modelo) salió como letras
 * sueltas en cajas de 7 px. Así que se escapan TODOS los dólares fuera de código: `\$` es
 * un escape de CommonMark que las dos gramáticas respetan, y pinta un `$` literal.
 *
 * **Dentro de código no se toca.** En una valla o un tramo entre acentos graves el `$` ya
 * es literal, y el escape se vería como una barra de más — justo en los ejemplos de código,
 * que es donde más dólares hay.
 *
 * Solo para lo que se le da a `MarkdownText`: el botón de copiar y el panel de Trazas
 * siguen con el texto original, que es el que el modelo escribió.
 */
export function protegerDolares(texto: string): string {
  if (!texto.includes("$")) return texto;
  const lineas = texto.split("\n");
  let valla: string | undefined;
  return lineas
    .map((linea) => {
      const apertura = /^\s*(`{3,}|~{3,})/.exec(linea);
      if (valla !== undefined) {
        // Cierra la valla una línea que empieza por la misma marca, igual o más larga.
        if (apertura !== undefined && apertura !== null && apertura[1]![0] === valla[0] && apertura[1]!.length >= valla.length) {
          valla = undefined;
        }
        return linea;
      }
      if (apertura !== null) {
        valla = apertura[1]!;
        return linea;
      }
      return escaparFueraDeCodigo(linea);
    })
    .join("\n");
}

/** Escapa los `$` de una línea de prosa, saltando los tramos entre acentos graves. */
function escaparFueraDeCodigo(linea: string): string {
  let salida = "";
  let i = 0;
  while (i < linea.length) {
    if (linea[i] === "`") {
      // Un tramo de código abre con N acentos y cierra con exactamente N.
      let n = 0;
      while (linea[i + n] === "`") n++;
      const marca = "`".repeat(n);
      const cierre = linea.indexOf(marca, i + n);
      if (cierre >= 0) {
        salida += linea.slice(i, cierre + n);
        i = cierre + n;
        continue;
      }
      // Sin cierre: no es código, son acentos sueltos.
      salida += marca;
      i += n;
      continue;
    }
    if (linea[i] === "\\" && i + 1 < linea.length) {
      // Lo ya escapado (`\$` incluido) se copia tal cual, para no doblar la barra.
      salida += linea.slice(i, i + 2);
      i += 2;
      continue;
    }
    salida += linea[i] === "$" ? "\\$" : linea[i];
    i++;
  }
  return salida;
}
