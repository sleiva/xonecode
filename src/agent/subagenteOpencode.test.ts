/**
 * El adaptador de OpenCode, contra un `opencode acp` de PEGA.
 *
 * El guion del doble es el volcado de una ejecución real (opencode 1.18.27, 11-09-2026): la
 * petición de permiso trae `toolCall` con `locations` y `content:[{type:"diff",oldText,newText}]`
 * en el MISMO mensaje, y el resultado de `session/prompt` trae el `usage`.
 *
 * Se prueba por `OPENCODE_BIN`: `npm test` no lanza el binario, no pide red y no usa cuenta.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { correrOpencode, configuracionDeOpencode, carpetaDeConfigDeOpencode } from "./subagenteOpencode.js";
import { crearSubagenteExterno, vistasAplanadasDe } from "./subagenteExterno.js";
import type { EscrituraExternaPedida, PeticionExterna } from "../core/ports.js";

const DOBLE = `#!/usr/bin/env node
const guion = JSON.parse(process.env.STUB_GUION);
const salida = process.env.STUB_SALIDA;
const apuntar = (o) => require("node:fs").appendFileSync(salida, JSON.stringify(o) + "\\n");
const mandar = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
apuntar({ que: "entorno", dir: process.env.OPENCODE_CONFIG_DIR, sinProyecto: process.env.OPENCODE_DISABLE_PROJECT_CONFIG, args: process.argv.slice(2) });
let buffer = "";
process.stdin.on("data", (t) => {
  buffer += t.toString();
  let corte;
  while ((corte = buffer.indexOf("\\n")) >= 0) {
    const linea = buffer.slice(0, corte);
    buffer = buffer.slice(corte + 1);
    if (!linea.trim()) continue;
    const m = JSON.parse(linea);
    if (m.method === "initialize") { mandar({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: 1 } }); continue; }
    if (m.method === "session/new") { mandar({ jsonrpc: "2.0", id: m.id, result: { sessionId: "ses_1" } }); continue; }
    if (m.method === "session/prompt") {
      apuntar({ que: "prompt", params: m.params });
      if (guion.tool) mandar({ jsonrpc: "2.0", method: "session/update", params: { update: guion.tool } });
      if (guion.tool2) mandar({ jsonrpc: "2.0", method: "session/update", params: { update: guion.tool2 } });
      mandar({ jsonrpc: "2.0", id: 0, method: guion.peticion ?? "session/request_permission", params: guion.params });
      continue;
    }
    if (m.method === "session/cancel") { apuntar({ que: "cancel" }); continue; }
    if (m.id !== undefined && (m.result !== undefined || m.error !== undefined)) {
      apuntar({ que: "respuesta", result: m.result, error: m.error });
      for (const t of guion.dice ?? []) {
        mandar({ jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "agent_message_chunk", content: { text: t } } } });
      }
      mandar({ jsonrpc: "2.0", id: 3, result: { stopReason: "end_turn", usage: guion.usage } });
      continue;
    }
  }
});
process.stdin.on("end", () => process.exit(0));
`;

let raiz: string;
let casa: string;
let salida: string;
const antes = process.env["OPENCODE_BIN"];
/**
 * `HOME` se muda al temporal en TODO el fichero. Tres tests van por `crearSubagenteExterno`,
 * que no lleva `casa` y resuelve la carpeta de configuración con `homedir()`: sin esto, correr
 * el suite escribe en la casa de quien lo corre.
 */
const casaDeVerdad = process.env["HOME"];

beforeEach(() => {
  raiz = realpathSync(mkdtempSync(join(tmpdir(), "xc-oc-")));
  process.env["HOME"] = raiz;
  casa = join(raiz, "casa");
  salida = join(raiz, "visto.jsonl");
  const bin = join(raiz, "opencode-de-pega.js");
  writeFileSync(bin, DOBLE);
  chmodSync(bin, 0o755);
  process.env["OPENCODE_BIN"] = bin;
});

afterEach(() => {
  if (casaDeVerdad === undefined) delete process.env["HOME"];
  else process.env["HOME"] = casaDeVerdad;
  if (antes === undefined) delete process.env["OPENCODE_BIN"];
  else process.env["OPENCODE_BIN"] = antes;
  rmSync(raiz, { recursive: true, force: true });
});

const edicion = (path: string, oldText: string, newText: string) => ({
  kind: "edit",
  locations: [{ path }],
  content: [{ type: "diff", path, oldText, newText }],
});

function guion(g: { toolCall?: unknown; peticion?: string; dice?: string[]; usage?: unknown; tool?: unknown; tool2?: unknown }): void {
  process.env["STUB_GUION"] = JSON.stringify({
    params: { sessionId: "ses_1", toolCall: g.toolCall, options: [] },
    ...(g.peticion === undefined ? {} : { peticion: g.peticion }),
    dice: g.dice ?? ["listo"],
    usage: g.usage,
    tool: g.tool,
    tool2: g.tool2,
  });
  process.env["STUB_SALIDA"] = salida;
}

const apuntado = (): Array<Record<string, any>> =>
  existsSync(salida) ? readFileSync(salida, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];

const elegida = (): string | undefined => apuntado().find((x) => x.que === "respuesta")?.result?.outcome?.optionId;

const peticionDe = (permitirEscritura: boolean, modelo?: string): PeticionExterna => ({
  motor: "opencode",
  cwd: raiz,
  instrucciones: "eres dev",
  tarea: "haz algo",
  permitirEscritura,
  agente: "dev",
  ...(modelo === undefined ? {} : { modelo }),
});

describe("la configuración con la que corre el hijo", () => {
  it("deniega shell, red, fuera del proyecto, subagentes y preguntas; y pregunta por cada edición", () => {
    const c = JSON.parse(configuracionDeOpencode({}));
    expect(c.permission.edit).toBe("ask");
    for (const k of ["bash", "webfetch", "websearch", "external_directory", "task", "question"]) {
      expect(c.permission[k], k).toBe("deny");
    }
  });

  it("la LECTURA va por patrones, porque su permiso no trae la ruta", () => {
    const c = JSON.parse(configuracionDeOpencode({ vistasAplanadas: ["/app/Cosa.xml"] }));
    expect(c.permission.read["**/.env"]).toBe("deny");
    expect(c.permission.read["**/.git/**"]).toBe("deny");
    expect(c.permission.read["**/.xonecode/**"]).toBe("deny");
    // Las vistas aplanadas van UNA A UNA: «un .xml con un .xne al lado» no es un patrón.
    expect(c.permission.read["**/app/Cosa.xml"]).toBe("deny");
  });

  it("el modelo solo aparece si el `.md` lo pide", () => {
    expect(JSON.parse(configuracionDeOpencode({})).model).toBeUndefined();
    expect(JSON.parse(configuracionDeOpencode({ modelo: "opencode/x" })).model).toBe("opencode/x");
  });
});

describe("cómo se lanza el hijo", () => {
  it("con las DOS variables que cierran las tres puertas del proyecto", async () => {
    /**
     * Es la prueba más importante de este fichero. Sin `OPENCODE_CONFIG_DIR` apuntando a una
     * carpeta NUESTRA gana la configuración global del usuario, y sin
     * `OPENCODE_DISABLE_PROJECT_CONFIG` ganan el `opencode.json` y los PLUGINS del proyecto —
     * medido las tres veces: leyó el `.env`, corrió shell y escribió sin pedir permiso.
     */
    guion({ toolCall: edicion(join(raiz, "x.js"), "", "hola") });
    await correrOpencode(peticionDe(true), { casa, ficheros: () => new Set(), aprobar: async () => true });
    const e = apuntado().find((x) => x.que === "entorno")!;
    expect(e.dir).toBe(carpetaDeConfigDeOpencode(casa));
    expect(e.sinProyecto).toBe("1");
    expect(e.args).toEqual(["acp", "--cwd", raiz]);
    // Y la configuración queda escrita donde la variable dice.
    expect(existsSync(join(carpetaDeConfigDeOpencode(casa), "opencode.json"))).toBe(true);
  });

  it("las instrucciones van DELANTE de la tarea, en el mismo turno", async () => {
    guion({ toolCall: edicion(join(raiz, "x.js"), "", "hola") });
    await correrOpencode(peticionDe(true), { casa, ficheros: () => new Set(), aprobar: async () => true });
    const p = apuntado().find((x) => x.que === "prompt")!;
    expect(p.params.prompt.map((x: { text: string }) => x.text)).toEqual(["eres dev", "haz algo"]);
  });
});

describe("qué se contesta a una petición de escribir", () => {
  it("concediendo, `once` — y NUNCA `always`, que es la pre-aprobación de sesión", async () => {
    guion({ toolCall: edicion(join(raiz, "x.js"), "", "hola") });
    let visto: readonly EscrituraExternaPedida[] | undefined;
    const texto = await correrOpencode(peticionDe(true), {
      casa,
      ficheros: () => new Set(),
      aprobar: async (e) => {
        visto = e;
        return true;
      },
    });
    expect(elegida()).toBe("once");
    expect(texto).toBe("listo");
    expect(visto?.map((e) => e.ruta)).toEqual(["/x.js"]);
    expect(visto?.[0]?.lineas).toEqual([{ tipo: "anadido", texto: "hola" }]);
  });

  it("rechazando, `reject`", async () => {
    guion({ toolCall: edicion(join(raiz, "x.js"), "", "hola") });
    await correrOpencode(peticionDe(true), { casa, ficheros: () => new Set(), aprobar: async () => false });
    expect(elegida()).toBe("reject");
  });

  it("sin política, `reject`", async () => {
    guion({ toolCall: edicion(join(raiz, "x.js"), "", "hola") });
    await correrOpencode(peticionDe(true), { casa, ficheros: () => new Set() });
    expect(elegida()).toBe("reject");
  });

  it("a un agente de SOLO LECTURA no se le pregunta a nadie", async () => {
    guion({ toolCall: edicion(join(raiz, "x.js"), "", "hola") });
    let preguntado = false;
    await correrOpencode(peticionDe(false), {
      casa,
      ficheros: () => new Set(),
      aprobar: async () => {
        preguntado = true;
        return true;
      },
    });
    expect(elegida()).toBe("reject");
    expect(preguntado).toBe(false);
  });

  it("una ruta de fuera del proyecto se rechaza sin preguntar", async () => {
    guion({ toolCall: edicion("/etc/hosts", "", "x") });
    let preguntado = false;
    await correrOpencode(peticionDe(true), {
      casa,
      ficheros: () => new Set(),
      aprobar: async () => {
        preguntado = true;
        return true;
      },
    });
    expect(elegida()).toBe("reject");
    expect(preguntado).toBe(false);
  });

  it("y lo que no es una edición, también: no hay diff con el que decidir", async () => {
    guion({ toolCall: { kind: "execute", locations: [] } });
    await correrOpencode(peticionDe(true), { casa, ficheros: () => new Set(), aprobar: async () => true });
    expect(elegida()).toBe("reject");
  });
});

describe("lo que el turno devuelve y cuenta", () => {
  it("tras un rechazo sin palabras, se DICE lo que pasó en vez de devolver vacío", async () => {
    // Medido: al rechazar, el turno acaba bien y a veces sin una sola palabra. Devolver «» lo
    // haría pasar por «el especialista no tenía nada que decir», y lanzar tumbaría un turno
    // que fue correcto.
    guion({ toolCall: edicion(join(raiz, "x.js"), "", "hola"), dice: [] });
    const texto = await correrOpencode(peticionDe(true), { casa, ficheros: () => new Set(), aprobar: async () => false });
    expect(texto).toMatch(/sin decir nada/);
    expect(texto).toMatch(/1 escritura/);
  });

  it("el consumo sale del `usage` de `session/prompt`, con la caché APARTE", async () => {
    guion({
      toolCall: edicion(join(raiz, "x.js"), "", "hola"),
      usage: { inputTokens: 8756, outputTokens: 141, totalTokens: 10689, cachedReadTokens: 1792 },
    });
    let visto: { entrada: number; salida: number; cache: number } | undefined;
    await correrOpencode(peticionDe(true), {
      casa,
      ficheros: () => new Set(),
      aprobar: async () => true,
      alConsumir: (c) => {
        visto = c;
      },
    });
    expect(visto).toEqual({ entrada: 8756, salida: 141, cache: 1792 });
  });

  it("lo que hace el hijo se cuenta MIENTRAS, con el nombre canónico y la ruta virtual", async () => {
    // La ruta se toma del `in_progress`: el `completed` trae `locations: null`.
    guion({
      toolCall: edicion(join(raiz, "x.js"), "", "hola"),
      tool: { sessionUpdate: "tool_call_update", toolCallId: "c1", status: "in_progress", title: "read", locations: [{ path: join(raiz, "app", "y.js") }] },
      tool2: { sessionUpdate: "tool_call_update", toolCallId: "c1", status: "completed", title: join(raiz, "app", "y.js"), locations: null },
    });
    const tools: Array<{ nombre: string; detalle?: string }> = [];
    await correrOpencode(peticionDe(true), {
      casa,
      ficheros: () => new Set(),
      aprobar: async () => true,
      alUsarTool: (t) => tools.push(t),
    });
    expect(tools).toContainEqual({ nombre: "read_file", detalle: "/app/y.js" });
  });
});

describe("una tool que FALLA no se anuncia", () => {
  it("porque la línea diría que el hijo hizo algo que no hizo", async () => {
    // Medido en vivo: con una lectura de `.env` denegada por patrón salía «lee /.env», y el
    // `.env` no se leyó. Es el invariante de `core/entrelazar.ts`.
    guion({
      toolCall: edicion(join(raiz, "x.js"), "", "hola"),
      tool: { sessionUpdate: "tool_call_update", toolCallId: "c1", status: "in_progress", title: "read", locations: [{ path: join(raiz, ".env") }] },
      tool2: { sessionUpdate: "tool_call_update", toolCallId: "c1", status: "failed", title: "read", locations: [{ path: join(raiz, ".env") }] },
    });
    const tools: Array<{ nombre: string }> = [];
    await correrOpencode(peticionDe(true), {
      casa,
      ficheros: () => new Set(),
      aprobar: async () => true,
      alUsarTool: (t) => tools.push(t),
    });
    expect(tools).toEqual([]);
  });
});

describe("las vistas aplanadas del proyecto", () => {
  it("son cada `.xml` que tiene su `.xne` al lado, y solo ésas", () => {
    expect(vistasAplanadasDe(new Set(["/a/C.xml", "/a/C.xne", "/a/suelto.xml", "/a/z.xne"]))).toEqual(["/a/C.xml"]);
  });
});

/**
 * El CABLEADO, que es donde este repo ha fallado nueve veces. Los tres argumentos son
 * OPCIONALES, así que olvidar uno deja los dos `tsc` limpios.
 */
describe("y que el puerto le pase de verdad lo que le da la sesión", () => {
  it("`aprobarEscritura` LLEGA", async () => {
    guion({ toolCall: edicion(join(raiz, "x.js"), "", "hola") });
    let preguntado = false;
    await crearSubagenteExterno({
      aprobarEscritura: async () => {
        preguntado = true;
        return true;
      },
      ficherosDelProyecto: () => new Set(),
    }).correr(peticionDe(true));
    expect(preguntado).toBe(true);
    expect(elegida()).toBe("once");
  });

  it("`ficherosDelProyecto` LLEGA: sin él se ESCRIBE una vista aplanada", async () => {
    guion({ toolCall: edicion(join(raiz, "Cosa.xml"), "a", "b") });
    await crearSubagenteExterno({
      aprobarEscritura: async () => true,
      ficherosDelProyecto: () => new Set(["/Cosa.xml", "/Cosa.xne"]),
    }).correr(peticionDe(true));
    expect(elegida()).toBe("reject");
  });

  it("y las vistas aplanadas llegan a la CONFIGURACIÓN: sin eso el hijo las LEE", async () => {
    // Leerlas ya es el fallo: si las ve, edita el fichero equivocado y el cambio se pierde en
    // la siguiente compilación de Studio. Aquí la guarda es la configuración, no el código,
    // porque su permiso de lectura no trae la ruta.
    guion({ toolCall: edicion(join(raiz, "x.js"), "", "hola") });
    await crearSubagenteExterno({
      aprobarEscritura: async () => true,
      ficherosDelProyecto: () => new Set(["/Cosa.xml", "/Cosa.xne"]),
    }).correr({ ...peticionDe(true), cwd: raiz });
    const escrita = JSON.parse(readFileSync(join(carpetaDeConfigDeOpencode(), "opencode.json"), "utf8"));
    expect(escrita.permission.read["**/Cosa.xml"]).toBe("deny");
  });
});
