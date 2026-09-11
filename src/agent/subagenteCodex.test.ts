/**
 * El adaptador de Codex, contra un `codex app-server` de PEGA.
 *
 * **El guion del doble es el volcado de una ejecución real** (codex-cli 0.152.1, 11-09-2026):
 * el `item/started` con los cambios llega ANTES que la petición de aprobación, la petición
 * trae solo un `itemId`, y su `id` empieza en **0** — que es justo el detalle que hacía falta
 * medir, porque vive en el mismo espacio de números que los nuestros.
 *
 * Se prueba por `CODEX_BIN`, que existe exactamente para esto: `npm test` no lanza el binario
 * de verdad, no pide red y no necesita una cuenta.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { correrCodex } from "./subagenteCodex.js";
import { crearSubagenteExterno } from "./subagenteExterno.js";
import type { EscrituraExternaPedida, PeticionExterna } from "../core/ports.js";

const DOBLE = `#!/usr/bin/env node
const guion = JSON.parse(process.env.STUB_GUION);
const salida = process.env.STUB_SALIDA;
const apuntar = (o) => require("node:fs").appendFileSync(salida, JSON.stringify(o) + "\\n");
const mandar = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
let buffer = "";
process.stdin.on("data", (t) => {
  buffer += t.toString();
  let corte;
  while ((corte = buffer.indexOf("\\n")) >= 0) {
    const linea = buffer.slice(0, corte);
    buffer = buffer.slice(corte + 1);
    if (!linea.trim()) continue;
    const m = JSON.parse(linea);
    if (m.method === "initialize") { mandar({ id: m.id, result: {} }); continue; }
    if (m.method === "thread/start") {
      apuntar({ que: "thread/start", params: m.params });
      mandar({ id: m.id, result: { thread: { id: "t1" } } });
      continue;
    }
    if (m.method === "turn/start") {
      // El item con los cambios va PRIMERO, como en la medida.
      mandar({ method: "item/started", params: { item: { type: "fileChange", id: "exec-1", status: "inProgress", changes: guion.cambios } } });
      // Y la petición después, con id 0 — el que de verdad manda el binario.
      mandar({ method: guion.peticion, id: 0, params: guion.params });
      continue;
    }
    if (m.id !== undefined && m.result !== undefined) {
      apuntar({ que: "respuesta", result: m.result });
      mandar({ method: "item/completed", params: { item: { type: "agentMessage", phase: "final_answer", text: "listo" } } });
      mandar({ method: "turn/completed", params: {} });
      continue;
    }
  }
});
process.stdin.on("end", () => process.exit(0));
`;

let raiz: string;
let bin: string;
let salida: string;
const antes = process.env["CODEX_BIN"];

beforeEach(() => {
  // El `realpath` importa: en macOS `/tmp` es un enlace a `/private/tmp`, y la guarda de
  // ruta canonicaliza — fue uno de los tres fallos que la primera ejecución viva destapó.
  raiz = realpathSync(mkdtempSync(join(tmpdir(), "xc-codex-")));
  bin = join(raiz, "codex-de-pega.js");
  salida = join(raiz, "visto.jsonl");
  writeFileSync(bin, DOBLE);
  chmodSync(bin, 0o755);
  process.env["CODEX_BIN"] = bin;
});

afterEach(() => {
  if (antes === undefined) delete process.env["CODEX_BIN"];
  else process.env["CODEX_BIN"] = antes;
  rmSync(raiz, { recursive: true, force: true });
});

function guion(g: { cambios?: unknown[]; peticion?: string; params?: unknown }): void {
  process.env["STUB_GUION"] = JSON.stringify({
    cambios: g.cambios ?? [],
    peticion: g.peticion ?? "item/fileChange/requestApproval",
    params: g.params ?? { itemId: "exec-1" },
  });
  process.env["STUB_SALIDA"] = salida;
}

const apuntado = (): Array<{ que: string; params?: { sandbox?: string; approvalPolicy?: string }; result?: { decision?: string; action?: string } }> =>
  existsSync(salida)
    ? readFileSync(salida, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];

const peticionDe = (permitirEscritura: boolean): PeticionExterna => ({
  motor: "codex",
  cwd: raiz,
  instrucciones: "eres dev",
  tarea: "haz algo",
  permitirEscritura,
  agente: "dev",
});

const UN_CAMBIO = (raizDelCambio: string) => [
  { path: join(raizDelCambio, "x.js"), kind: { type: "add" }, diff: "hola\n" },
];

describe("cómo se abre el hilo", () => {
  it("sin escritura: `approvalPolicy: never` y el sandbox en `read-only`", async () => {
    guion({});
    await correrCodex(peticionDe(false), { ficheros: () => new Set() });
    const inicio = apuntado().find((x) => x.que === "thread/start")!;
    expect(inicio.params?.approvalPolicy).toBe("never");
    expect(inicio.params?.sandbox).toBe("read-only");
  });

  it("CON escritura: cambia el `approvalPolicy`, y el sandbox sigue en `read-only`", async () => {
    /**
     * Es la decisión central de todo esto. `workspace-write` haría que las escrituras de
     * dentro del cwd ocurrieran solas: sin petición, sin diff y sin pasar por ninguna guarda
     * de ruta. Este test muere si alguien «arregla» eso creyendo que hace falta para escribir
     * — está medido que no hace falta.
     */
    guion({ cambios: UN_CAMBIO(raiz) });
    await correrCodex(peticionDe(true), { ficheros: () => new Set(), aprobar: async () => true });
    const inicio = apuntado().find((x) => x.que === "thread/start")!;
    expect(inicio.params?.approvalPolicy).toBe("on-request");
    expect(inicio.params?.sandbox).toBe("read-only");
  });
});

describe("qué se contesta a una petición de escribir", () => {
  const decision = () => apuntado().find((x) => x.que === "respuesta")?.result?.decision;

  it("con la política concediendo, `accept` — y la política ve la ruta VIRTUAL", async () => {
    guion({ cambios: UN_CAMBIO(raiz) });
    let visto: readonly EscrituraExternaPedida[] | undefined;
    const texto = await correrCodex(peticionDe(true), {
      ficheros: () => new Set(),
      aprobar: async (e) => {
        visto = e;
        return true;
      },
    });
    expect(texto).toBe("listo");
    expect(decision()).toBe("accept");
    // La ruta de la máquina no viaja: puede ir por un túnel.
    expect(visto?.map((e) => e.ruta)).toEqual(["/x.js"]);
    expect(visto?.[0]?.lineas).toEqual([{ tipo: "anadido", texto: "hola" }]);
  });

  it("con la política rechazando, `decline`", async () => {
    guion({ cambios: UN_CAMBIO(raiz) });
    await correrCodex(peticionDe(true), { ficheros: () => new Set(), aprobar: async () => false });
    expect(decision()).toBe("decline");
  });

  it("SIN política no se escribe, aunque el `.md` diga que este agente escribe", async () => {
    guion({ cambios: UN_CAMBIO(raiz) });
    await correrCodex(peticionDe(true), { ficheros: () => new Set() });
    expect(decision()).toBe("decline");
  });

  it("y a un agente de SOLO LECTURA no se le pregunta a nadie: se le dice que no", async () => {
    guion({ cambios: UN_CAMBIO(raiz) });
    let preguntado = false;
    await correrCodex(peticionDe(false), {
      ficheros: () => new Set(),
      aprobar: async () => {
        preguntado = true;
        return true;
      },
    });
    expect(decision()).toBe("decline");
    expect(preguntado).toBe(false);
  });

  it("una ruta de FUERA del proyecto se deniega sin preguntar", async () => {
    // Es el agujero entero de este camino: el `path` de Codex es absoluto y va al disco
    // directo, así que las guardas hay que reaplicarlas aquí o no las aplica nadie.
    guion({ cambios: [{ path: "/etc/hosts", kind: { type: "add" }, diff: "x\n" }] });
    let preguntado = false;
    await correrCodex(peticionDe(true), {
      ficheros: () => new Set(),
      aprobar: async () => {
        preguntado = true;
        return true;
      },
    });
    expect(decision()).toBe("decline");
    expect(preguntado).toBe(false);
  });

  it("y `.env` también, que es la misma guarda del otro motor", async () => {
    guion({ cambios: [{ path: join(raiz, ".env"), kind: { type: "add" }, diff: "K=1\n" }] });
    await correrCodex(peticionDe(true), { ficheros: () => new Set(), aprobar: async () => true });
    expect(decision()).toBe("decline");
  });

  it("un `itemId` del que no consta item es `decline`: no hay diff que enseñar", async () => {
    guion({ cambios: UN_CAMBIO(raiz), params: { itemId: "exec-que-no-existe" } });
    await correrCodex(peticionDe(true), { ficheros: () => new Set(), aprobar: async () => true });
    expect(decision()).toBe("decline");
  });
});

describe("las otras peticiones del servidor", () => {
  it("un comando se deniega SIEMPRE: es el análogo de `Bash`", async () => {
    guion({ peticion: "item/commandExecution/requestApproval", params: {} });
    let preguntado = false;
    await correrCodex(peticionDe(true), {
      ficheros: () => new Set(),
      aprobar: async () => {
        preguntado = true;
        return true;
      },
    });
    expect(apuntado().find((x) => x.que === "respuesta")?.result?.decision).toBe("decline");
    expect(preguntado).toBe(false);
  });

  it("una elicitación de MCP se declina por su propio campo", async () => {
    guion({ peticion: "mcpServer/elicitation/request", params: {} });
    await correrCodex(peticionDe(true), { ficheros: () => new Set(), aprobar: async () => true });
    expect(apuntado().find((x) => x.que === "respuesta")?.result?.action).toBe("decline");
  });

  it("y lo que no se sabe denegar sin inventarse la respuesta ABORTA el turno", async () => {
    // `item/tool/requestUserInput` no tiene «no» en su esquema: su respuesta es
    // `{answers:{…}}` y nada más. Dejarla sin contestar colgaría a codex hasta el tope.
    guion({ peticion: "item/tool/requestUserInput", params: {} });
    await expect(
      correrCodex(peticionDe(true), { ficheros: () => new Set(), aprobar: async () => true })
    ).rejects.toThrow(/no sabe denegar/);
  });
});

/**
 * El CABLEADO, que es donde este repo ha fallado nueve veces: una regla de producción
 * compuesta dentro de algo que todos los tests doblan. Los tests de arriba llaman a
 * `correrCodex` directamente, así que ninguno se entera si el día de mañana el `correr` de
 * `crearSubagenteExterno` deja de pasarle un argumento — y los dos son OPCIONALES, o sea que
 * los dos `tsc` seguirían limpios. Hay uno por argumento, y los dos mueren con el mutante.
 */
describe("y que el puerto le pase de verdad lo que le da la sesión", () => {
  it("`aprobarEscritura` LLEGA: sin este test, quitarlo deja a Codex sin poder escribir nada", async () => {
    guion({ cambios: UN_CAMBIO(raiz) });
    let preguntado = false;
    const puerto = crearSubagenteExterno({
      aprobarEscritura: async () => {
        preguntado = true;
        return true;
      },
      ficherosDelProyecto: () => new Set(),
    });
    await puerto.correr(peticionDe(true));
    expect(preguntado).toBe(true);
    expect(apuntado().find((x) => x.que === "respuesta")?.result?.decision).toBe("accept");
  });

  it("`ficherosDelProyecto` LLEGA, y este sí es peligroso: sin él se escribe una vista APLANADA", async () => {
    // Una lista vacía no reconoce `Cosa.xml` como la vista de `Cosa.xne`, así que la guarda
    // la dejaría pasar y el agente editaría el fichero que Studio regenera — perdiendo el
    // cambio en la siguiente compilación, en silencio.
    guion({ cambios: [{ path: join(raiz, "Cosa.xml"), kind: { type: "update" }, diff: "@@ -1 +1 @@\n-a\n+b\n" }] });
    const puerto = crearSubagenteExterno({
      aprobarEscritura: async () => true,
      ficherosDelProyecto: () => new Set(["/Cosa.xml", "/Cosa.xne"]),
    });
    await puerto.correr(peticionDe(true));
    expect(apuntado().find((x) => x.que === "respuesta")?.result?.decision).toBe("decline");
  });
});
