import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessageChunk } from "@langchain/core/messages";
import type { Piel } from "../../../core/turno.js";
import type { ModelosPort } from "../../../core/ports.js";
import { abrirSesionTrueforge } from "./sesionTrueforge.js";
import { abrirSesionReal } from "../../turno/turnoReal.js";

/** Un modelo de pega que, en su primera llamada, pide escribir `/nota.txt` y luego contesta. */
function modelos(): ModelosPort {
  const guiones = [
    [
      new AIMessageChunk({
        content: "Escribo la nota.",
        tool_call_chunks: [{ index: 0, id: "w1", name: "write_file", args: JSON.stringify({ file_path: "/nota.txt", content: "hola\n" }) }],
        usage_metadata: { input_tokens: 50, output_tokens: 9, total_tokens: 59 },
      }),
    ],
    [new AIMessageChunk({ content: "Listo.", usage_metadata: { input_tokens: 70, output_tokens: 2, total_tokens: 72 } })],
  ];
  const modelo = {
    bindTools: () => modelo,
    stream: async () => {
      const g = guiones.shift() ?? [new AIMessageChunk({ content: "" })];
      return (async function* () {
        for (const t of g) yield t;
      })();
    },
  };
  return { paraPapel: () => modelo, paraModelo: () => modelo, descripcion: () => ({}) } as unknown as ModelosPort;
}

/** Una piel que apunta lo que le llega. */
function piel() {
  const tokens: string[] = [];
  const lineas: string[] = [];
  let pausas = 0;
  const p: Piel = {
    token: (t) => void tokens.push(t),
    cerrarLinea: () => {},
    linea: (t) => void lineas.push(t),
    pausa: () => void (pausas += 1),
    fin: () => {},
  };
  return { p, tokens, lineas, pausas: () => pausas };
}

const proyecto = () => {
  const raiz = mkdtempSync(join(tmpdir(), "xc-tf-sesion-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>\n");
  return raiz;
};
const ENTORNO = { git: { usable: false, prefijo: "" } } as never;

describe("una sesión con el motor TrueForge", () => {
  it("con aprobación: pausa, se aprueba, se ESCRIBE y el turno lo cuenta", async () => {
    const raiz = proyecto();
    const preguntadas: string[] = [];
    const s = await abrirSesionTrueforge({
      raiz,
      modelos: modelos(),
      entorno: ENTORNO,
      instrucciones: "reglas",
      pedirAprobacion: async (pendientes, ficheros) => {
        for (const p of pendientes) preguntadas.push(ficheros.get(p.id) ?? "?");
        return new Map(pendientes.map((p) => [p.id, { type: "approve" as const }]));
      },
    });
    const pi = piel();
    const r = await s.turno("escribe una nota", pi.p);
    expect(preguntadas).toEqual(["/nota.txt"]);
    expect(readFileSync(join(raiz, "nota.txt"), "utf8")).toBe("hola\n");
    expect(r.cambios.map((c) => c.ruta)).toContain("nota.txt");
    expect(pi.tokens.join("")).toContain("Listo.");
    expect(pi.pausas()).toBe(1);
    // Los tokens de las DOS llamadas, sumados, y la ventana es la última.
    expect(s.consumo().modelo).toMatchObject({ entrada: 120, salida: 11 });
    expect(s.consumo().contexto).toBe(70);
  }, 20_000);

  it("RECHAZADA: el disco no se toca", async () => {
    const raiz = proyecto();
    const s = await abrirSesionTrueforge({
      raiz,
      modelos: modelos(),
      entorno: ENTORNO,
      instrucciones: "reglas",
      pedirAprobacion: async (pendientes) => new Map(pendientes.map((p) => [p.id, { type: "reject" as const }])),
    });
    await s.turno("escribe una nota", piel().p);
    expect(existsSync(join(raiz, "nota.txt"))).toBe(false);
  }, 20_000);

  it("en AUTÓNOMO se escribe sin preguntar, y el aviso lo DICE con el nombre", async () => {
    const raiz = proyecto();
    let preguntas = 0;
    const s = await abrirSesionTrueforge({
      raiz,
      modelos: modelos(),
      entorno: ENTORNO,
      instrucciones: "reglas",
      sinAprobacion: () => true,
      pedirAprobacion: async () => {
        preguntas += 1;
        return new Map();
      },
    });
    const pi = piel();
    await s.turno("escribe una nota", pi.p);
    expect(preguntas).toBe(0);
    expect(readFileSync(join(raiz, "nota.txt"), "utf8")).toBe("hola\n");
    expect(pi.lineas.join("\n")).toMatch(/SIN aprobación: \/nota\.txt/);
  }, 20_000);

  it("sin nadie que apruebe, la escritura NO se aplica y queda como pendiente", async () => {
    const raiz = proyecto();
    const s = await abrirSesionTrueforge({ raiz, modelos: modelos(), entorno: ENTORNO, instrucciones: "reglas" });
    const r = await s.turno("escribe una nota", piel().p);
    expect(existsSync(join(raiz, "nota.txt"))).toBe(false);
    expect(r.pendientes).toBe(1);
  }, 20_000);

  it("cancelar MIENTRAS se decide una aprobación no aplica nada", async () => {
    const raiz = proyecto();
    let sesion: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    sesion = await abrirSesionTrueforge({
      raiz,
      modelos: modelos(),
      entorno: ENTORNO,
      instrucciones: "reglas",
      pedirAprobacion: async (pendientes) => {
        // La persona pulsa «parar» con la tarjeta delante, y luego aprueba por inercia.
        sesion!.cancelar();
        return new Map(pendientes.map((p) => [p.id, { type: "approve" as const }]));
      },
    });
    const r = await sesion.turno("escribe una nota", piel().p);
    expect(existsSync(join(raiz, "nota.txt"))).toBe(false);
    expect(r.pendientes).toBe(1);
  }, 20_000);

  it("`abrirSesionReal` con `motor: \"trueforge\"` DELEGA en este motor: el punto único de elección", async () => {
    // Composición de producción: por `abrirSesionReal` pasan la web, el terminal, `run`, el
    // banco y los evals. El modelo de pega solo sabe hacer `stream`, que es lo que usa el
    // adaptador de TrueForge; si esto corriera con deepagents, el turno no llegaría a escribir.
    const raiz = proyecto();
    const s = await abrirSesionReal({
      raiz,
      modelos: modelos(),
      skills: { catalogo: () => [], cargar: async () => [] } as never,
      entorno: ENTORNO,
      motor: "trueforge",
      sinAprobacion: () => true,
    });
    const pi = piel();
    await s.turno("escribe una nota", pi.p);
    expect(readFileSync(join(raiz, "nota.txt"), "utf8")).toBe("hola\n");
    expect(pi.tokens.join("")).toContain("Listo.");
  }, 20_000);

  it("el raíz DELEGA en el device-controller, que EJECUTA de verdad: la shell la tiene solo él", async () => {
    const raiz = proyecto();
    const vistos: string[][] = [];
    const toolsPorLlamada: string[][] = [];
    const guiones = [
      // 1. El raíz delega.
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "device-controller", input: "di hola por la shell" }) }] })],
      // 2. El conductor ejecuta un comando real.
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "x1", name: "execute", args: JSON.stringify({ command: "echo hola-desde-la-shell" }) }] })],
      // 3. El conductor informa.
      [new AIMessageChunk({ content: "La shell dijo hola." })],
      // 4. El raíz contesta.
      [new AIMessageChunk({ content: "Hecho en el dispositivo." })],
    ];
    let atadas: string[] = [];
    const modelo = {
      bindTools: (tools: { function?: { name?: string } }[]) => {
        atadas = tools.map((t) => t.function?.name ?? "");
        return modelo;
      },
      stream: async (mensajes: { content: unknown }[]) => {
        vistos.push(mensajes.map((m) => String(m.content)));
        toolsPorLlamada.push(atadas);
        const g = guiones.shift() ?? [new AIMessageChunk({ content: "" })];
        return (async function* () {
          for (const t of g) yield t;
        })();
      },
    };
    const m = { paraPapel: () => modelo, paraModelo: () => modelo, descripcion: () => ({}) } as unknown as ModelosPort;
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, instrucciones: "reglas" });
    const lineas: string[] = [];
    const tokens: string[] = [];
    await s.turno("lanza el hotswap", {
      token: (t) => void tokens.push(t),
      cerrarLinea: () => {},
      linea: (t) => void lineas.push(t),
      pausa: () => {},
      fin: () => {},
    });
    // El comando CORRIÓ y su salida volvió al conductor en su segunda llamada.
    expect(vistos[2]!.join("\n")).toContain("hola-desde-la-shell");
    // El conductor recibió sus instrucciones corregidas, no la frase de «mismas tools».
    expect(vistos[1]!.join("\n")).toMatch(/NO tienes las mismas tools/);
    // El chat vio la delegación Y el comando, con el comando entero.
    expect(lineas.join("\n")).toMatch(/device-controller/);
    expect(lineas.join("\n")).toMatch(/echo hola-desde-la-shell/);
    // Y solo habla el raíz.
    expect(tokens.join("")).toBe("Hecho en el dispositivo.");
    // LA REGLA: la shell la tiene UNO. Al raíz —llamadas 1 y 4— nunca se le ofrece `execute`;
    // al conductor —2 y 3— sí, y no puede escribir ficheros.
    expect(toolsPorLlamada[0]).not.toContain("execute");
    expect(toolsPorLlamada[3]).not.toContain("execute");
    expect(toolsPorLlamada[1]).toContain("execute");
    expect(toolsPorLlamada[1]).not.toContain("write_file");
  }, 30_000);
});
