import { describe, expect, it } from "vitest";
import { costeEfectivo, pintarGasto, pintarSesion, resumirTraza } from "./informeDeTraza.js";

/** Una línea de traza tal y como la escribe `crearDiagnosticoDeTools`. */
const linea = (evento: Record<string, unknown>, sesion = "s1"): string =>
  JSON.stringify({ v: 1, sesion, at: "2026-09-17T10:00:00.000Z", ...evento });

const modelo = (origen: string, input: number, output: number, cache = 0, llamadas = 1, sesion = "s1"): string =>
  linea({ tipo: "modelo", origen, input, output, cache, llamadas, contexto: input }, sesion);

const tool = (nombre: string, detalle?: string, sesion = "s1"): string =>
  linea({ tipo: "tool", nombre, ...(detalle === undefined ? {} : { detalle }) }, sesion);

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

  it("agrupa las tools por nombre y saca lo repetido, que es lo que se busca", () => {
    const [sesion] = resumirTraza([
      tool("read_file", "/app/app.xml"),
      tool("read_file", "/app/app.xml"),
      tool("read_file", "/app/otra.xne"),
      tool("grep", "function MT"),
    ]);
    expect(sesion.tools.map((t) => [t.nombre, t.veces])).toEqual([
      ["read_file", 3],
      ["grep", 1],
    ]);
    expect(sesion.tools[0].repetidos).toEqual([{ detalle: "/app/app.xml", veces: 2 }]);
  });

  it("una tool sin detalle no inventa uno", () => {
    const [sesion] = resumirTraza([tool("ls"), tool("ls")]);
    expect(sesion.tools[0]).toMatchObject({ nombre: "ls", veces: 2, repetidos: [] });
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

  it("lo pintado dice los orígenes y los totales, y sin un solo escape ANSI", () => {
    const [sesion] = resumirTraza([modelo("orquestador", 100, 10, 50), tool("read_file", "/app/app.xml")]);
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
