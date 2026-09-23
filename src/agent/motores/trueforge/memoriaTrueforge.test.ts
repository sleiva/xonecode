import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  apartarMemoria,
  cargarMemoria,
  guardarMemoria,
  hayMemoria,
  interpretarFoto,
  leerMemoria,
  MIGRACIONES,
  olvidarMemoria,
  RESPUESTA_A_UNA_COLGADA,
  rutaDeMemoria,
  saldarColgadas,
  textoDeMemoriaDescartada,
  VERSION_DE_MEMORIA,
} from "./memoriaTrueforge.js";
import { VERSION_DE_TRUEFORGE } from "./trueforge.js";

const raiz = () => mkdtempSync(join(tmpdir(), "xc-tf-memoria-"));

describe("la memoria de TrueForge en disco", () => {
  it("guarda y lee la foto, con modo 0600: lleva los mensajes enteros", () => {
    const r = raiz();
    guardarMemoria(r, "s1", { context: [{ role: "user", content: "hola" }] });
    expect(leerMemoria(r, "s1")?.context).toEqual([{ role: "user", content: "hola" }]);
    expect(statSync(rutaDeMemoria(r, "s1")!).mode & 0o777).toBe(0o600);
    expect(hayMemoria(r, "s1")).toBe(true);
  });

  it("olvidar la borra, y sin fichero no hay memoria", () => {
    const r = raiz();
    guardarMemoria(r, "s1", { context: [] });
    olvidarMemoria(r, "s1");
    expect(hayMemoria(r, "s1")).toBe(false);
  });

  it("un id que no es un segmento llano no se convierte en ruta: ni se guarda ni se lee", () => {
    expect(rutaDeMemoria("/p", "../fuera")).toBeUndefined();
    expect(rutaDeMemoria("/p", "a/b")).toBeUndefined();
    const r = raiz();
    guardarMemoria(r, "../fuera", { context: [] });
    expect(hayMemoria(r, "../fuera")).toBe(false);
  });

  it("una foto ilegible no tumba nada: no hay memoria, y la sesión empieza de cero", () => {
    const r = raiz();
    guardarMemoria(r, "s1", { context: [] });
    writeFileSync(rutaDeMemoria(r, "s1")!, "{roto");
    expect(leerMemoria(r, "s1")).toBeUndefined();
  });

  it("las tool calls del último mensaje sin respuesta se SALDAN, las respondidas no", () => {
    const contexto = [
      { role: "user", content: "hazlo" },
      { role: "assistant", content: "", tool_calls: [{ id: "a" }, { id: "b" }] },
      { role: "tool", tool_call_id: "a", content: "hecho" },
    ];
    const saldado = saldarColgadas(contexto);
    expect(saldado).toHaveLength(4);
    expect(saldado[3]).toEqual({ role: "tool", tool_call_id: "b", content: RESPUESTA_A_UNA_COLGADA });
    // Puro: no toca lo que recibe.
    expect(contexto).toHaveLength(3);
    expect(saldarColgadas(saldado)).toHaveLength(4);
  });

  it("guardar ya sanea: lo que llega a disco nunca tiene una colgada", () => {
    const r = raiz();
    guardarMemoria(r, "s1", { context: [{ role: "assistant", content: "", tool_calls: [{ id: "x" }] }] });
    expect(leerMemoria(r, "s1")?.context).toHaveLength(2);
  });
});

/** Una foto v0 tal como la dejaba el código de antes de versionar: `toSnapshot()` + la pregunta. */
const fotoV0 = () => ({
  thread_id: "main",
  context: [
    { role: "user", content: "hola" },
    { role: "assistant", content: "", tool_calls: [{ id: "q1" }] },
  ],
  current_context_usage: { total_tokens: 12 },
  parent: null,
  agent_info: null,
  completion: null,
  capability_state: { "tfy.algo": 1 },
  pregunta_pendiente: { hilo: "main", id: "q1", args: { question: "¿A o B?" } },
});

describe("la foto lleva VERSIÓN y se lee de forma estricta", () => {
  it("lo que se escribe lleva la versión del formato y la de la librería, SELLADAS por quien escribe", () => {
    const r = raiz();
    guardarMemoria(r, "s1", { context: [{ role: "user", content: "hola" }] });
    const crudo = JSON.parse(readFileSync(rutaDeMemoria(r, "s1")!, "utf8")) as Record<string, unknown>;
    expect(crudo.version).toBe(VERSION_DE_MEMORIA);
    expect(crudo.version).toBe(1);
    expect(crudo.trueforge).toBe(VERSION_DE_TRUEFORGE);
  });

  it("los campos de `toSnapshot()` que el raíz no recibe NO llegan a disco, y lo escrito se vuelve a leer", () => {
    const r = raiz();
    guardarMemoria(r, "s1", { ...fotoV0(), context: [{ role: "user", content: "hola" }] } as never);
    const crudo = JSON.parse(readFileSync(rutaDeMemoria(r, "s1")!, "utf8")) as Record<string, unknown>;
    expect(Object.keys(crudo).sort()).toEqual(["capability_state", "context", "current_context_usage", "pregunta_pendiente", "trueforge", "version"]);
    expect(cargarMemoria(r, "s1").estado).toBe("ok");
  });

  it("una foto v0 (las que ya hay en disco) se MIGRA a v1 y se carga entera, pregunta incluida", () => {
    const lectura = interpretarFoto(JSON.stringify(fotoV0()));
    expect(lectura).toEqual({
      estado: "ok",
      foto: {
        context: fotoV0().context,
        current_context_usage: { total_tokens: 12 },
        capability_state: { "tfy.algo": 1 },
        pregunta_pendiente: { hilo: "main", id: "q1", args: { question: "¿A o B?" } },
      },
    });
  });

  it("la migración v0 → v1 es pura: añade la versión, retira lo del raíz y no inventa la librería", () => {
    const v0 = fotoV0();
    const v1 = MIGRACIONES[0]!(v0);
    expect(v1).toMatchObject({ version: 1 });
    expect(v1).not.toHaveProperty("thread_id");
    expect(v1).not.toHaveProperty("trueforge");
    expect(v0).toHaveProperty("thread_id");
    // Hay una migración por cada versión por debajo de la actual.
    for (let v = 0; v < VERSION_DE_MEMORIA; v += 1) expect(MIGRACIONES[v], `falta la migración desde ${v}`).toBeTypeOf("function");
  });

  it("una v0 que no es la de un raíz (con `parent` o `completion`) NO se carga a medias", () => {
    expect(interpretarFoto(JSON.stringify({ ...fotoV0(), parent: { thread_id: "main" } }))).toMatchObject({ estado: "incompatible" });
    expect(interpretarFoto(JSON.stringify({ ...fotoV0(), completion: { type: "done" } }))).toMatchObject({ estado: "incompatible" });
  });

  it("una versión MÁS NUEVA que la que se sabe leer es incompatible, y el motivo la nombra", () => {
    const lectura = interpretarFoto(JSON.stringify({ version: 99, context: [] }));
    expect(lectura).toEqual({ estado: "incompatible", motivo: expect.stringContaining("versión 99") });
    expect(interpretarFoto(JSON.stringify({ version: "1", context: [] }))).toMatchObject({ estado: "incompatible" });
    expect(interpretarFoto(JSON.stringify({ version: 1.5, context: [] }))).toMatchObject({ estado: "incompatible" });
    // `null` no es «sin versión»: no lo escribe nadie.
    expect(interpretarFoto(JSON.stringify({ version: null, context: [] }))).toMatchObject({ estado: "incompatible" });
  });

  it("un campo desconocido en una v1 es un NO, no un campo que se ignora", () => {
    expect(interpretarFoto(JSON.stringify({ version: 1, context: [], otra_cosa: 1 }))).toEqual({
      estado: "incompatible",
      motivo: "campo desconocido «otra_cosa»",
    });
  });

  it("un campo conocido y MAL formado se lleva la foto ENTERA: no se suelta solo ese campo", () => {
    const base = { version: 1, trueforge: "0.2.1", context: [{ role: "user", content: "hola" }] };
    for (const mala of [
      { ...base, pregunta_pendiente: { hilo: "main", id: 7, args: {} } },
      { ...base, pregunta_pendiente: { hilo: "main", id: "q", args: {}, extra: true } },
      { ...base, capability_state: [1] },
      { ...base, current_context_usage: 3 },
      { ...base, context: [{ content: "sin role ni type" }] },
      { ...base, context: "no es lista" },
      { ...base, trueforge: 2 },
    ]) {
      expect(interpretarFoto(JSON.stringify(mala)), JSON.stringify(mala)).toMatchObject({ estado: "incompatible" });
    }
    expect(interpretarFoto(JSON.stringify(base)).estado).toBe("ok");
    // Una decisión de aprobación va en el contexto SIN `role`: la librería la marca con `type`
    // (`AgentApprovalDecisionMessage`), y rechazarla dejaría sin memoria las sesiones que escribieron.
    const decision = { type: "user.tool_approval", tool_call_id: "w1", approval: { status: "allow" } };
    expect(interpretarFoto(JSON.stringify({ ...base, context: [...base.context, decision] })).estado).toBe("ok");
  });

  it("el motivo no repite el contenido del fichero ni ninguna ruta", () => {
    const r = raiz();
    guardarMemoria(r, "s1", { context: [] });
    // Un token inesperado: es el caso en que el mensaje de `JSON.parse` CITA el fichero.
    writeFileSync(rutaDeMemoria(r, "s1")!, "SECRETO_DEL_FICHERO y más");
    const lectura = cargarMemoria(r, "s1");
    expect(lectura.estado).toBe("incompatible");
    const motivo = (lectura as { motivo: string }).motivo;
    expect(motivo).not.toContain("SECRETO");
    expect(motivo).not.toContain(r);
    expect(textoDeMemoriaDescartada(motivo, apartarMemoria(r, "s1", 1))).not.toContain(r);
  });

  it("una foto incompatible NO es memoria, y preguntar no la mueve", () => {
    const r = raiz();
    guardarMemoria(r, "s1", { context: [] });
    writeFileSync(rutaDeMemoria(r, "s1")!, JSON.stringify({ version: 99, context: [] }));
    expect(hayMemoria(r, "s1")).toBe(false);
    expect(leerMemoria(r, "s1")).toBeUndefined();
    expect(existsSync(rutaDeMemoria(r, "s1")!)).toBe(true);
  });

  it("apartar la mueve INTACTA a otro nombre, nunca pisa uno que ya existe, y olvidar se lleva las apartadas", () => {
    const r = raiz();
    const ruta = rutaDeMemoria(r, "s1")!;
    guardarMemoria(r, "s1", { context: [] });
    writeFileSync(ruta, "{roto");
    expect(apartarMemoria(r, "s1", 5)).toBe("memoria-trueforge.incompatible-5.json");
    expect(existsSync(ruta)).toBe(false);
    expect(readFileSync(join(dirname(ruta), "memoria-trueforge.incompatible-5.json"), "utf8")).toBe("{roto");
    writeFileSync(ruta, "{otra");
    expect(apartarMemoria(r, "s1", 5)).toBe("memoria-trueforge.incompatible-5-1.json");
    expect(readFileSync(join(dirname(ruta), "memoria-trueforge.incompatible-5.json"), "utf8")).toBe("{roto");
    // Sin foto no hay nada que apartar.
    expect(apartarMemoria(r, "s1", 6)).toBeUndefined();
    olvidarMemoria(r, "s1");
    expect(readdirSync(dirname(ruta)).filter((n) => n.startsWith("memoria-trueforge"))).toEqual([]);
  });
});
