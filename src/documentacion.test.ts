/**
 * El reparto de la documentación, COMPROBADO en vez de recordado.
 *
 * `CLAUDE.md` es el mapa y los invariantes; `docs/DECISIONES.md` es el porqué medido. Ese reparto
 * se rompió una vez sin que nadie lo notara: el MISMO DÍA del corte, 17 commits metieron 328 líneas
 * netas (+52 %) en el mapa reabsorbiendo el relato de las medidas —porque el reparto era criterio,
 * no comprobación—. Esto es la comprobación; su porqué entero está en `docs/DECISIONES.md`.
 *
 * Las cuatro formas que se vigilan son las cuatro por las que entró aquel relato, no una lista
 * inventada: una fecha (el mapa no tiene cronología), un censo («medido N veces»), un recuento de
 * llamadas o un porcentaje, y una duración suelta en la prosa.
 *
 * Lo que NO se toca: las cifras que sostienen una regla. Son constantes, y van entre paréntesis
 * con el nombre que las declara —(`MS_DE_TRABAJO_AL_ABRIR`, 2 s)—, así que la duración es la única
 * de las cuatro que mira la prosa; las otras tres miran el fichero entero, porque no tienen una
 * forma legítima entre paréntesis. Y «N veces» a secas es legítimo: «se ha caído tres veces, una
 * por argumento» es justo la razón de que exista un test por argumento. Lo que no vale es el acta
 * de la medición.
 *
 * El mapa son VARIOS ficheros: el `CLAUDE.md` de la raíz (lo que cruza todo) y uno por carpeta (lo
 * de su área, que Claude Code carga al leer ahí). Se partió porque el de la raíz, entero, se pagaba
 * en cada sesión. Las reglas valen para TODOS: un trozo no es un sitio donde el relato pueda volver.
 *
 * Al escribir la regla en el mapa, ojo: el enunciado NO lleva ejemplos literales de lo prohibido.
 * Una fecha de ejemplo es una fecha, y el test la leería.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORQUE = "docs/DECISIONES.md";

/** Todos los `CLAUDE.md` del repo, salvo dependencias y árboles de trabajo. */
function mapas(dir: string): string[] {
  const fuera = new Set(["node_modules", ".git", ".worktrees", "dist", ".xonecode"]);
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return fuera.has(e.name) ? [] : mapas(join(dir, e.name));
    return e.name === "CLAUDE.md" ? [join(dir, e.name)] : [];
  });
}

/**
 * El mapa sin sus paréntesis, que es donde viven las constantes. La profundidad es CONTINUA dentro
 * de un fichero a propósito: el mapa parte constantes entre líneas —el propio enunciado de la regla
 * lo hace— y mirar línea a línea dejaría pasar la mitad de un dato por dónde corta el renglón. Y se
 * reinicia en cada fichero: un paréntesis abierto en uno no puede silenciar al siguiente.
 *
 * Se cuentan las DOS orillas a propósito. Un paréntesis sin cerrar dejaría la comprobación muda
 * para el resto del fichero, que es peor que un rojo: un test que no puede fallar no es un test.
 */
function leer(ruta: string) {
  const texto = readFileSync(ruta, "utf8");
  const lineas = texto.split("\n");
  let profundidad = 0;
  let sueltos = 0;
  const prosa = lineas.map((linea) => {
    let fuera = "";
    for (const caracter of linea) {
      if (caracter === "(") profundidad++;
      else if (caracter === ")") {
        if (profundidad > 0) profundidad--;
        else sueltos++;
      } else if (profundidad === 0) fuera += caracter;
    }
    return fuera;
  });
  return { nombre: relative(RAIZ, ruta), texto, lineas, prosa, profundidad, sueltos };
}

const FICHEROS = mapas(RAIZ).map(leer);

/** Las líneas que casan, con fichero y número desde 1: un rojo tiene que decir DÓNDE. */
function infractoras(
  casa: (linea: string) => boolean,
  donde: (f: ReturnType<typeof leer>) => string[] = (f) => f.lineas,
): string[] {
  return FICHEROS.flatMap((f) => {
    const original = f.lineas;
    return donde(f)
      .map((linea, i) => ({ linea, i }))
      .filter(({ linea }) => casa(linea))
      .map(({ i }) => `${f.nombre}:${i + 1}: ${original[i].trim()}`);
  });
}

describe("el mapa no reabsorbe el porqué", () => {
  it("encuentra la raíz y sus trozos", () => {
    expect(FICHEROS.map((f) => f.nombre)).toContain("CLAUDE.md");
    expect(FICHEROS.length).toBeGreaterThan(1);
  });

  it("no cita ni una fecha", () => {
    const FECHA = /\b\d{1,2}-\d{1,2}-\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/;
    expect(infractoras((l) => FECHA.test(l))).toEqual([]);
  });

  it("no dice cuántas veces se midió nada", () => {
    const CENSO =
      /\bmedid[oa]s?\b[^.]*\b(una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\d+)\s+veces\b/i;
    expect(infractoras((l) => CENSO.test(l))).toEqual([]);
  });

  it("no cuenta llamadas, ni tests, ni porcentajes", () => {
    const RECUENTO =
      /\b\d+\s*(lecturas|ejecuciones|llamadas|peticiones|consultas|aciertos|checkpoints|tests)\b/i;
    const PORCENTAJE = /\b\d+(\.\d+)?\s*%/;
    expect(infractoras((l) => RECUENTO.test(l) || PORCENTAJE.test(l))).toEqual([]);
  });

  it("no deja una duración suelta en la prosa", () => {
    const DURACION = /\b\d+(\.\d+)?\s*(ms|s|min|minutos?|segundos?)\b/;
    expect(infractoras((l) => DURACION.test(l), (f) => f.prosa)).toEqual([]);
  });

  it("dice en qué fichero está el porqué", () => {
    expect(FICHEROS.filter((f) => !f.texto.includes(PORQUE)).map((f) => f.nombre)).toEqual([]);
  });

  it("cierra sus paréntesis, o la comprobación de arriba estaría muda", () => {
    const abiertos = FICHEROS.filter((f) => f.sueltos !== 0 || f.profundidad !== 0).map(
      (f) => `${f.nombre}: sueltos ${f.sueltos}, abiertos ${f.profundidad}`,
    );
    expect(abiertos).toEqual([]);
  });
});
