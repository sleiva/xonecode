import { describe, expect, it } from "vitest";
import { costeEfectivo, pintarGasto, pintarSesion, resumirTraza } from "./informeDeTraza.js";

/** Una línea de traza tal y como la escribe `crearDiagnosticoDeTools`. */
const linea = (evento: Record<string, unknown>, sesion = "s1"): string =>
  JSON.stringify({ v: 1, sesion, at: "2026-09-17T10:00:00.000Z", ...evento });

const modelo = (origen: string, input: number, output: number, cache = 0, llamadas = 1, sesion = "s1"): string =>
  linea({ tipo: "modelo", origen, input, output, cache, llamadas, contexto: input }, sesion);

const tool = (nombre: string, detalle?: string, parametros?: Record<string, unknown>, sesion = "s1"): string =>
  linea(
    { tipo: "tool", nombre, ...(detalle === undefined ? {} : { detalle }), ...(parametros === undefined ? {} : { parametros }) },
    sesion
  );

const leer = (fichero: string, offset = 0, limit = 50): string => tool("read_file", fichero, { file_path: fichero, offset, limit });

describe("informe de traza", () => {
  it("cuenta las llamadas por LÍNEA, nunca sumando el campo `llamadas`", () => {
    // El campo es el acumulado del tracker en ese instante (1, 2, 3…): sumarlo daría 6
    // donde hubo 3 llamadas. Es el único número de la traza que no es de la línea.
    const [sesion] = resumirTraza([
      modelo("orquestador", 100, 10, 0, 1),
      modelo("orquestador", 200, 20, 0, 2),
      modelo("orquestador", 300, 30, 0, 3),
    ]);
    expect(sesion.llamadas).toBe(3);
    expect(sesion.input).toBe(600);
    expect(sesion.output).toBe(60);
  });

  it("reparte por origen y ordena por lo que costó, no por el orden de llegada", () => {
    const [sesion] = resumirTraza([
      modelo("orquestador", 100, 10),
      modelo("developer-xone", 5000, 500),
      modelo("orquestador", 100, 10),
    ]);
    expect(sesion.origenes.map((o) => o.origen)).toEqual(["developer-xone", "orquestador"]);
    expect(sesion.origenes[0]).toMatchObject({ llamadas: 1, input: 5000, output: 500 });
    expect(sesion.origenes[1]).toMatchObject({ llamadas: 2, input: 200, output: 20 });
  });

  it("de la ventana se queda con la MAYOR alcanzada, que no es la última", () => {
    // `contexto` es el input de esa llamada: cuánto ocupaba el historial entonces. Tras un
    // resumen baja, así que la última diría que nunca se pasó de ahí.
    const [sesion] = resumirTraza([modelo("orquestador", 1000, 10), modelo("orquestador", 32000, 10), modelo("orquestador", 900, 10)]);
    expect(sesion.contexto).toBe(32000);
  });

  it("agrupa las tools por nombre y dice sobre QUÉ y cuántos distintos", () => {
    const [sesion] = resumirTraza([leer("/app/app.xml"), leer("/app/app.xml"), leer("/app/otra.xne"), tool("grep", "function MT")]);
    expect(sesion.tools.map((t) => [t.nombre, t.veces])).toEqual([
      ["read_file", 3],
      ["grep", 1],
    ]);
    expect(sesion.tools[0]).toMatchObject({ distintos: 2 });
    // Lo repetido primero: es lo que se viene a buscar.
    expect(sesion.tools[0].blancos).toEqual([
      { detalle: "/app/app.xml", rango: "0+50", veces: 2 },
      { detalle: "/app/otra.xne", rango: "0+50", veces: 1 },
    ]);
  });

  it("el RANGO sale de los parámetros, y otro rango del mismo fichero NO es una relectura", () => {
    // La instrucción que el agente recibe es «no releas la misma ruta y el mismo rango»: una
    // página distinta del mismo fichero es trabajo nuevo, y colapsarla la disfrazaría de
    // desperdicio. Por eso el blanco es ruta + rango, no la ruta.
    const [sesion] = resumirTraza([leer("/app/largo.xne", 0, 50), leer("/app/largo.xne", 50, 50)]);
    expect(sesion.tools[0].distintos).toBe(2);
    expect(sesion.tools[0].blancos.map((b) => b.rango)).toEqual(["0+50", "50+50"]);
    expect(sesion.tools[0].blancos.every((b) => b.veces === 1)).toBe(true);
  });

  it("sin `limit` no se inventa un rango", () => {
    const [sesion] = resumirTraza([tool("grep", "entry-point", { pattern: "entry-point", path: "/" })]);
    expect(sesion.tools[0].blancos).toEqual([{ detalle: "entry-point", veces: 1 }]);
  });

  it("una tool sin detalle no inventa uno", () => {
    const [sesion] = resumirTraza([tool("ls"), tool("ls")]);
    expect(sesion.tools[0]).toMatchObject({ nombre: "ls", veces: 2, blancos: [], distintos: 0 });
  });

  it("parte el fichero por sesión: dos ejecuciones no se suman en una", () => {
    const sesiones = resumirTraza([
      linea({ tipo: "sesion" }, "s1"),
      modelo("orquestador", 100, 10, 0, 1, "s1"),
      linea({ tipo: "sesion" }, "s2"),
      modelo("orquestador", 700, 70, 0, 1, "s2"),
    ]);
    expect(sesiones.map((s) => [s.id, s.input])).toEqual([
      ["s1", 100],
      ["s2", 700],
    ]);
  });

  it("una línea rota se cuenta y no tumba el informe", () => {
    const [sesion] = resumirTraza(["{ no es json", "", modelo("orquestador", 100, 10)]);
    expect(sesion.ilegibles).toBe(1);
    expect(sesion.llamadas).toBe(1);
  });

  it("una traza sin ninguna llamada al modelo no se inventa una sesión", () => {
    expect(resumirTraza([])).toEqual([]);
  });

  it("un fichero ENTERO ilegible sí dice algo: lista vacía se leería como «no hay traza»", () => {
    const sesiones = resumirTraza(["{ roto", "tampoco"]);
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]).toMatchObject({ ilegibles: 2, llamadas: 0 });
  });

  it("el coste efectivo descuenta la caché a un décimo", () => {
    expect(costeEfectivo({ input: 1000, output: 100, cache: 1000 })).toBe(200);
    expect(costeEfectivo({ input: 1000, output: 100, cache: 0 })).toBe(1100);
  });

  it("lo pintado enseña cada fichero con su rango, que es la pregunta que se le hace", () => {
    const [sesion] = resumirTraza([leer("/app/app.xml"), leer("/app/otra.xne", 50, 50)]);
    const texto = pintarSesion(sesion).join("\n");
    expect(texto).toContain("/app/app.xml 0+50");
    expect(texto).toContain("/app/otra.xne 50+50");
    expect(texto).toContain("2 distintos");
  });

  it("una lista larga se RECORTA y dice cuántos quedan fuera", () => {
    const [sesion] = resumirTraza(Array.from({ length: 14 }, (_, i) => leer(`/app/f${i}.xne`)));
    const texto = pintarSesion(sesion).join("\n");
    expect(texto).toContain("14 distintos");
    expect(texto).toContain("4 más");
    expect(texto).not.toContain("/app/f13.xne");
  });

  it("lo pintado dice los orígenes y los totales, y sin un solo escape ANSI", () => {
    const [sesion] = resumirTraza([modelo("orquestador", 100, 10, 50), leer("/app/app.xml")]);
    const texto = pintarSesion(sesion).join("\n");
    expect(texto).toContain("orquestador");
    expect(texto).toContain("read_file");
    // `cli/tema.ts` es el ÚNICO fichero de producción con escapes: esto es un informe, no una piel.
    expect(texto).not.toContain("\u001b[");
  });

  it("el gasto de un turno dice las DOS cuentas por separado", () => {
    const texto = pintarGasto(
      { modelo: { entrada: 1000, salida: 100, cache: 500 }, externo: { entrada: 40, salida: 4, cache: 0 }, contexto: 900 },
      3
    ).join("\n");
    expect(texto).toContain("modelo");
    expect(texto).toContain("externo");
    // Un token es un token, pero su precio no: los del grafo van contra la clave del
    // usuario y los del hijo contra su suscripción. No se suman en una cifra.
    expect(texto).not.toContain("1.144");
    expect(texto).toContain("3 llam");
  });

  it("sin agente externo no se pinta una fila de ceros", () => {
    const texto = pintarGasto(
      { modelo: { entrada: 1000, salida: 100, cache: 0 }, externo: { entrada: 0, salida: 0, cache: 0 }, contexto: 900 },
      1
    ).join("\n");
    expect(texto).not.toContain("externo");
  });

  it("una ventana sin medir no se pinta como cero", () => {
    const texto = pintarGasto(
      { modelo: { entrada: 10, salida: 1, cache: 0 }, externo: { entrada: 0, salida: 0, cache: 0 }, contexto: 0 },
      1
    ).join("\n");
    expect(texto).not.toContain("ventana");
  });
});


describe("un corte por tope se CUENTA y se VE", () => {
  // El dato que faltaba: «15 llamadas» se lee exactamente igual viniendo de un agente que
  // terminó que de uno al que cortaron. Esa confusión costó una sesión entera de diagnóstico.
  const linea = (o: Record<string, unknown>) => JSON.stringify({ v: 1, sesion: "s1", ...o });

  it("suma los cortes al origen y los pinta en SU línea", () => {
    const [sesion] = resumirTraza([
      linea({ tipo: "sesion" }),
      linea({ tipo: "modelo", origen: "designer-xone", input: 100, output: 10, cache: 0, llamadas: 1, contexto: 50 }),
      linea({ tipo: "corte", origen: "designer-xone", limite: 15 }),
    ]);
    expect(sesion.origenes[0].cortes).toBe(1);
    expect(pintarSesion(sesion).join("\n")).toContain("CORTADO por tope");
  });

  it("un origen que NO se cortó no dice nada", () => {
    const [sesion] = resumirTraza([
      linea({ tipo: "sesion" }),
      linea({ tipo: "modelo", origen: "developer-xone", input: 100, output: 10, cache: 0, llamadas: 1, contexto: 50 }),
    ]);
    expect(sesion.origenes[0].cortes).toBe(0);
    expect(pintarSesion(sesion).join("\n")).not.toContain("CORTADO");
  });

  it("dos cortes del mismo origen se cuentan, que es lo que pasa con dos delegaciones", () => {
    const [sesion] = resumirTraza([
      linea({ tipo: "sesion" }),
      linea({ tipo: "modelo", origen: "designer-xone", input: 1, output: 1, cache: 0, llamadas: 1, contexto: 1 }),
      linea({ tipo: "corte", origen: "designer-xone", limite: 15 }),
      linea({ tipo: "corte", origen: "designer-xone", limite: 15 }),
    ]);
    expect(sesion.origenes[0].cortes).toBe(2);
    expect(pintarSesion(sesion).join("\n")).toContain("×2");
  });

  it("un corte que llega ANTES que su primera línea de modelo no se pierde", () => {
    // El fichero es append-only y el orden lo pone el tiempo, no nosotros. Si la entrada solo
    // se creara en la rama `modelo`, un corte madrugador desaparecería sin dejar rastro.
    const [sesion] = resumirTraza([
      linea({ tipo: "sesion" }),
      linea({ tipo: "corte", origen: "consultant-xone", limite: 15 }),
    ]);
    expect(sesion.origenes.find((o) => o.origen === "consultant-xone")?.cortes).toBe(1);
  });
});


describe("el reparto de tools entre orquestador y especialistas", () => {
  const linea = (o: Record<string, unknown>) => JSON.stringify({ v: 1, sesion: "s1", ...o });

  it("cuenta las del ORQUESTADOR y lo dice", () => {
    const [sesion] = resumirTraza([
      linea({ tipo: "sesion" }),
      linea({ tipo: "tool", nombre: "grep", origen: "orquestador" }),
      linea({ tipo: "tool", nombre: "grep", origen: "orquestador" }),
      linea({ tipo: "tool", nombre: "read_file", origen: "especialista" }),
    ]);
    expect(sesion.toolsDelOrquestador).toBe(2);
    expect(pintarSesion(sesion).join("\n")).toContain("orquestador 2 de 3");
  });

  it("una traza SIN origen no dice cero: se calla", () => {
    // Un cero medido y un cero por ausencia no se distinguirían. Una traza de antes de que el
    // origen se registrara afirmaría que el orquestador no gastó ninguna tool, que es falso.
    const [sesion] = resumirTraza([
      linea({ tipo: "sesion" }),
      linea({ tipo: "tool", nombre: "grep" }),
    ]);
    expect(sesion.toolsDelOrquestador).toBe(0);
    const pintado = pintarSesion(sesion).join("\n");
    expect(pintado).toContain("tools");
    expect(pintado).not.toContain("orquestador 0");
  });

  it("un origen desconocido no se imputa al orquestador", () => {
    const [sesion] = resumirTraza([
      linea({ tipo: "sesion" }),
      linea({ tipo: "tool", nombre: "grep", origen: "vete a saber" }),
    ]);
    expect(sesion.toolsDelOrquestador).toBe(0);
  });
});

/**
 * **El paralelismo, que es lo que la traza no sabia contestar.**
 *
 * La pregunta —¿cuantas tools pidio el modelo A LA VEZ?— se contesto dos veces con dos
 * metodos y dieron dos numeros: por el reloj exacto, 18 de 69; por los contadores del
 * tracker, 38 de 69 con grupos de 1.000 ms de span. Faltaba el dato, y el dato es de que
 * MENSAJE salio cada tool.
 */
describe("paralelismo", () => {
  const linea = (o: Record<string, unknown>) => JSON.stringify({ v: 1, sesion: "s1", at: "2026-09-22T00:00:00.000Z", ...o });
  const tool = (nombre: string, respuesta: string | undefined, detalle?: string) =>
    linea({ tipo: "tool", nombre, ...(respuesta === undefined ? {} : { respuesta }), ...(detalle === undefined ? {} : { detalle }), ...(detalle === undefined ? {} : { parametros: { file_path: detalle } }) });

  it("dos tools del MISMO mensaje van en paralelo; las de otro, no", () => {
    const [s] = resumirTraza([
      linea({ tipo: "sesion" }),
      tool("read_file", "m1", "/a.js"),
      tool("grep", "m1"),
      tool("read_file", "m2", "/b.js"),
    ]);
    expect(s?.paralelismo.respuestas).toBe(1);
    expect(s?.paralelismo.tools).toBe(2);
    expect(s?.paralelismo.maximo).toBe(2);
  });

  /** El hallazgo que esto vino a buscar: ahi es donde se pierden cambios. */
  it("dos escrituras del mismo mensaje sobre el MISMO fichero se avisan", () => {
    const [s] = resumirTraza([
      linea({ tipo: "sesion" }),
      tool("edit_file", "m1", "/funciones.js"),
      tool("edit_file", "m1", "/funciones.js"),
      tool("edit_file", "m1", "/otro.js"),
    ]);
    expect(s?.paralelismo.escriturasALaVez).toEqual([{ detalle: "/funciones.js", veces: 2 }]);
    expect(pintarSesion(s!).join("\n")).toContain("2 escrituras sobre /funciones.js en UNA respuesta");
  });

  /** Dos ficheros distintos en la misma respuesta no chocan: cada uno tiene su contenido. */
  it("dos escrituras a la vez sobre ficheros DISTINTOS no son un choque", () => {
    const [s] = resumirTraza([linea({ tipo: "sesion" }), tool("edit_file", "m1", "/a.js"), tool("edit_file", "m1", "/b.js")]);
    expect(s?.paralelismo.escriturasALaVez).toEqual([]);
    expect(s?.paralelismo.respuestas).toBe(1);
  });

  /**
   * Se queda el MAXIMO de una respuesta, no la suma: lo que se cuenta es cuantas a la vez, y
   * sumar dos respuestas de dos daria cuatro —un numero que nunca ocurrio—.
   */
  it("dos respuestas de dos escrituras no se suman a cuatro", () => {
    const [s] = resumirTraza([
      linea({ tipo: "sesion" }),
      tool("edit_file", "m1", "/f.js"), tool("edit_file", "m1", "/f.js"),
      tool("edit_file", "m2", "/f.js"), tool("edit_file", "m2", "/f.js"),
    ]);
    expect(s?.paralelismo.escriturasALaVez).toEqual([{ detalle: "/f.js", veces: 2 }]);
  });

  /** Ausente no es `sola`: una traza vieja diria cero paralelismo, que no es lo medido. */
  it("una traza SIN el campo no dice cero: dice cuantas no constan", () => {
    const [s] = resumirTraza([linea({ tipo: "sesion" }), tool("read_file", undefined, "/a.js"), tool("edit_file", undefined, "/a.js")]);
    expect(s?.paralelismo.respuestas).toBe(0);
    expect(s?.paralelismo.sinRespuesta).toBe(2);
    const pintado = pintarSesion(s!).join("\n");
    expect(pintado).toContain("2 tool(s) sin respuesta anotada");
    expect(pintado).not.toContain("en paralelo");
  });

  it("sin paralelismo no se pinta la seccion", () => {
    const [s] = resumirTraza([linea({ tipo: "sesion" }), tool("read_file", "m1", "/a.js")]);
    expect(pintarSesion(s!).join("\n")).not.toContain("en paralelo");
  });
});

/**
 * **Cuánto METIÓ cada tool en el contexto, que es lo que se paga.**
 *
 * El reparto por tool cuenta LLAMADAS: dos `read_file` son dos líneas iguales y pueden ser
 * doscientos caracteres o veinte mil. Se echó de menos buscando por qué un turno costaba
 * mucho más que el mismo turno de por la mañana — se podía contar cuántas veces se leía el
 * `SKILL.md` de una skill, pero no lo que pesaba, y por eliminación no se llega.
 */
describe("el peso en contexto", () => {
  const linea = (o: Record<string, unknown>) => JSON.stringify({ v: 1, sesion: "s1", at: "2026-09-22T00:00:00.000Z", ...o });
  const res = (nombre: string, detalle: string, chars: number) => linea({ tipo: "resultado", nombre, detalle, chars });

  it("suma por tool y BLANCO, y lo más gordo sale primero", () => {
    const [s] = resumirTraza([
      linea({ tipo: "sesion" }),
      res("read_file", "/skills/x/SKILL.md", 12000),
      res("read_file", "/skills/x/SKILL.md", 12000),
      res("execute", "xone-log-android", 30000),
      res("read_file", "/a.js", 500),
    ]);
    expect(s?.charsDeTools).toBe(54500);
    expect(s?.pesos[0]).toEqual({ nombre: "execute", detalle: "xone-log-android", chars: 30000, veces: 1 });
    expect(s?.pesos[1]).toEqual({ nombre: "read_file", detalle: "/skills/x/SKILL.md", chars: 24000, veces: 2 });
    expect(s?.pesos[2]?.detalle).toBe("/a.js");
  });

  it("se pinta con la MEDIA solo cuando hubo más de una", () => {
    const [s] = resumirTraza([linea({ tipo: "sesion" }), res("read_file", "/f", 100), res("read_file", "/f", 300), res("execute", "ls", 50)]);
    const pintado = pintarSesion(s!).join("\n");
    expect(pintado).toContain("lo que METIÓ en el contexto");
    expect(pintado).toMatch(/400\s+read_file\s+\/f\s+×2\s+\(media 200\)/);
    // Con una sola, la media no aporta nada y sería ruido.
    expect(pintado).toMatch(/50\s+execute\s+ls$/m);
  });

  /** Ausente no es cero: una traza anterior al campo no dice «no metió nada». */
  it("sin resultados no se pinta la sección", () => {
    const [s] = resumirTraza([
      JSON.stringify({ v: 1, sesion: "s1", at: "2026-09-22T00:00:00.000Z", tipo: "sesion" }),
      JSON.stringify({ v: 1, sesion: "s1", at: "2026-09-22T00:00:00.000Z", tipo: "tool", nombre: "read_file", detalle: "/f" }),
    ]);
    expect(s?.pesos).toEqual([]);
    expect(s?.charsDeTools).toBe(0);
    expect(pintarSesion(s!).join("\n")).not.toContain("METIÓ en el contexto");
  });

  it("un resultado sin nombre se cuenta igual, y lo dice", () => {
    const [s] = resumirTraza([linea({ tipo: "sesion" }), linea({ tipo: "resultado", chars: 900 })]);
    expect(s?.charsDeTools).toBe(900);
    expect(pintarSesion(s!).join("\n")).toContain("(sin nombre)");
  });
});
