import { describe, expect, it } from "vitest";
import type { Acto } from "./actos.js";
import { analizarSesion, LLAMADAS_IGUALES_PARA_BUCLE, type ReglaDeAnalisis } from "./analisisDeSesion.js";

const usuario = (texto = "haz algo"): Acto => ({ tipo: "usuario", texto });
const fin: Acto = { tipo: "fin", ms: 10 };
const reglas = (actos: Acto[], extra: Omit<Parameters<typeof analizarSesion>[0], "actos"> = {}): ReglaDeAnalisis[] =>
  analizarSesion({ actos, ...extra }).hallazgos.map((h) => h.regla);

describe("análisis previo de un chat", () => {
  it("un chat limpio sale ok y sin hallazgos", () => {
    const a = analizarSesion({ actos: [usuario(), { tipo: "asistente", texto: "hecho" }, fin] });
    expect(a).toEqual({ gravedad: "ok", hallazgos: [] });
  });

  it("un acto de error es un error, con el número de turno", () => {
    const a = analizarSesion({ actos: [usuario(), fin, usuario(), { tipo: "error", texto: "400 Bad Request" }] });
    expect(a.gravedad).toBe("error");
    expect(a.hallazgos[0]).toMatchObject({ regla: "turno-con-error", turno: 2 });
    expect(a.hallazgos[0]!.mensaje).toContain("400 Bad Request");
  });

  it("el verificador cuenta por su ÚLTIMO veredicto del turno", () => {
    const rojo: Acto = { tipo: "verificacion", verde: false, errores: 2, avisos: 0 };
    const verde: Acto = { tipo: "verificacion", verde: true, errores: 0, avisos: 0 };
    expect(reglas([usuario(), rojo, verde, fin])).toEqual([]);
    const a = analizarSesion({ actos: [usuario(), rojo, rojo, rojo, fin] });
    expect(a.hallazgos[0]).toMatchObject({ regla: "verificador-en-rojo", gravedad: "error" });
    expect(a.hallazgos[0]!.mensaje).toContain("3 veredictos en rojo");
  });

  it("escribir sin veredicto es un aviso, y una escritura FALLIDA no cuenta como escrita", () => {
    const escribe: Acto = { tipo: "herramientas", lineas: ["escribe x"], detalles: [{ nombre: "write_file" }] };
    const falla: Acto = { tipo: "herramientas", lineas: ["escribe x"], detalles: [{ nombre: "write_file", error: "denegado" }] };
    expect(reglas([usuario(), escribe, fin])).toEqual(["escritura-sin-verificar"]);
    expect(reglas([usuario(), falla, fin])).toEqual(["tools-fallidas"]);
  });

  it("un bucle es la MISMA línea repetida, no la misma tool", () => {
    const leer = (linea: string) => ({ linea, detalle: { nombre: "read_file" } });
    const iguales = Array.from({ length: LLAMADAS_IGUALES_PARA_BUCLE }, () => leer("lee /a.xne"));
    const distintas = Array.from({ length: LLAMADAS_IGUALES_PARA_BUCLE }, (_, i) => leer(`lee /a.xne ${i}`));
    const acto = (xs: typeof iguales): Acto => ({ tipo: "herramientas", lineas: xs.map((x) => x.linea), detalles: xs.map((x) => x.detalle) });
    expect(reglas([usuario(), acto(iguales), fin])).toEqual(["tool-en-bucle"]);
    expect(reglas([usuario(), acto(distintas), fin])).toEqual([]);
  });

  it("NUNCA lee el texto de un acto de sistema: su clase es lo único que cuenta", () => {
    // Un aviso que diga exactamente lo que una regla buscaría no dispara nada: la clase viaja
    // con el acto para que nadie deduzca nada de la redacción.
    const aviso: Acto = { tipo: "sistema", clase: "aviso", texto: "error: el verificador no ha corrido; turno con error" };
    expect(reglas([usuario(), aviso, fin])).toEqual([]);
    const permiso: Acto = { tipo: "sistema", clase: "permiso", texto: "cualquier cosa" };
    const a = analizarSesion({ actos: [usuario(), permiso, fin] });
    expect(a.hallazgos.map((h) => [h.regla, h.gravedad])).toEqual([["escrituras-sin-preguntar", "info"]]);
    expect(a.gravedad).toBe("ok");
  });

  it("una pregunta sin contestar se dice; contestada, no", () => {
    const consulta: Acto = { tipo: "consulta", pregunta: "¿A o B?", opciones: ["A", "B"] };
    expect(reglas([usuario(), consulta, fin])).toEqual(["pregunta-sin-contestar"]);
    expect(reglas([usuario(), consulta, fin, usuario("A"), fin])).toEqual([]);
  });

  it("un turno sin cierre es un aviso, salvo el último con el turno EN VUELO", () => {
    expect(reglas([usuario(), { tipo: "asistente", texto: "…" }])).toEqual(["turno-sin-terminar"]);
    expect(reglas([usuario(), { tipo: "asistente", texto: "…" }], { enVuelo: true })).toEqual([]);
    expect(reglas([usuario(), usuario(), fin], { enVuelo: true })).toEqual(["turno-sin-terminar"]);
  });

  it("la ventana cerca del tope solo se mide con tope", () => {
    const lleno: Acto = { tipo: "fin", ms: 1, consumo: { modelo: { entrada: 0, salida: 0, cache: 0 }, externo: { entrada: 0, salida: 0, cache: 0 }, ventana: 95_000 } } as Acto;
    expect(reglas([usuario(), lleno])).toEqual([]);
    expect(reglas([usuario(), lleno], { topeDeContexto: 100_000 })).toEqual(["contexto-cerca-del-tope"]);
    expect(reglas([usuario(), lleno], { topeDeContexto: 200_000 })).toEqual([]);
  });

  it("cortes de la traza y fallos registrados", () => {
    const a = analizarSesion({
      actos: [usuario(), fin],
      trazas: [{ tipo: "modelo" }, { tipo: "corte", origen: "developer-xone", limite: 15 }, { tipo: "corte", origen: "developer-xone", limite: 15 }],
      fallos: [{ v: 1, at: "2026-01-01T00:00:00Z", causas: [{ nombre: "MiddlewareError", mensaje: "envuelve" }, { nombre: "Error", mensaje: "400 de verdad" }] }],
    });
    expect(a.hallazgos.map((h) => h.regla)).toEqual(["corte-por-tope", "fallo-registrado"]);
    expect(a.hallazgos[0]!.mensaje).toContain("2 veces");
    // La causa del FONDO, que es la de verdad, no el envoltorio.
    expect(a.hallazgos[1]!.mensaje).toContain("400 de verdad");
    expect(a.gravedad).toBe("error");
  });

  it("una tarea aparcada o con el juez en rojo", () => {
    expect(reglas([], { tarea: { estado: "requiere-atencion", motivo: "falta X" } })).toEqual(["tarea-requiere-atencion"]);
    const a = analizarSesion({ actos: [], tarea: { estado: "terminada", veredicto: { veredicto: "rojo", resumen: "no cumple" } } });
    expect(a.hallazgos[0]).toMatchObject({ regla: "juez-no-verde", gravedad: "error" });
    expect(reglas([], { tarea: { estado: "terminada", veredicto: { veredicto: "verde", resumen: "ok" } } })).toEqual([]);
  });
});
