import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessageChunk } from "@langchain/core/messages";
import type { Piel } from "../../../core/turno.js";
import type { DetalleDeLinea } from "../../../core/actos.js";
import type { ModelosPort, PeticionExterna } from "../../../core/ports.js";
import { abrirSesionTrueforge, LIMITE_DE_LLAMADAS_DEL_RAIZ } from "./sesionTrueforge.js";
import { TOPE_DE_LLAMADAS_DEL_ESPECIALISTA } from "../../turno/resumenDeContexto.js";
import { topeAgotadoDe, traducirEvento } from "./eventosTrueforge.js";
import { cargarMemoria, rutaDeMemoria } from "./memoriaTrueforge.js";
import { abrirSesionReal } from "../../turno/turnoReal.js";
import { pintarSesion, resumirTraza } from "../../turno/informeDeTraza.js";
import { anotarPaso, ponerSumideroDeErrores } from "../../../core/trazaDeErrores.js";
import type { HechosDelTurno } from "../../../core/juezDelTurno.js";

/**
 * Un modelo de pega con el guion de una ESCRITURA delegada: el orquestador delega en
 * `developer-xone`, éste pide escribir `/nota.txt`, informa, y el orquestador contesta. El
 * raíz no puede escribir —es de solo lectura—, así que escribir es siempre cosa de un hijo, y
 * la aprobación tiene que volver al hilo de ESE hijo.
 *
 * Apunta lo que ve cada llamada: los mensajes y las tools que se le ataron.
 */
function modelosConGuion(guiones: AIMessageChunk[][]) {
  const vistos: string[][] = [];
  const toolsPorLlamada: string[][] = [];
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
  return { m, vistos, toolsPorLlamada };
}

const guionDeEscritura = (): AIMessageChunk[][] => [
  [
    new AIMessageChunk({
      content: "",
      tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "escribe la nota" }) }],
      usage_metadata: { input_tokens: 50, output_tokens: 9, total_tokens: 59 },
    }),
  ],
  [
    new AIMessageChunk({
      content: "Escribo la nota.",
      tool_call_chunks: [{ index: 0, id: "w1", name: "write_file", args: JSON.stringify({ file_path: "/nota.txt", content: "hola\n" }) }],
      usage_metadata: { input_tokens: 30, output_tokens: 5, total_tokens: 35 },
    }),
  ],
  [new AIMessageChunk({ content: "Nota escrita." })],
  [new AIMessageChunk({ content: "Listo.", usage_metadata: { input_tokens: 70, output_tokens: 2, total_tokens: 72 } })],
];

const modelos = (): ModelosPort => modelosConGuion(guionDeEscritura()).m;

const CATALOGO = [
  { nombre: "xone-development", descripcion: "reglas de XOne", tokens: 1 },
  { nombre: "xone-hotswap", descripcion: "manda al aparato", tokens: 1 },
];

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
  it("con aprobación: el HIJO que escribe pausa, se aprueba en SU hilo, se ESCRIBE y el turno lo cuenta", async () => {
    const raiz = proyecto();
    const preguntadas: string[] = [];
    const origenes: string[] = [];
    const s = await abrirSesionTrueforge({
      raiz,
      modelos: modelos(),
      entorno: ENTORNO,
      skills: CATALOGO,
      pedirAprobacion: async (pendientes, ficheros) => {
        for (const p of pendientes) preguntadas.push(ficheros.get(p.id) ?? "?");
        for (const p of pendientes) origenes.push(p.origen);
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
    // La tarjeta dice QUIÉN quiere escribir: el especialista, no el motor.
    expect(origenes).toEqual(["developer-xone"]);
    // Los tokens de TODOS los hilos, sumados; la ventana es la del raíz, no la del hijo.
    expect(s.consumo().modelo).toMatchObject({ entrada: 150, salida: 16 });
    expect(s.consumo().contexto).toBe(70);
  }, 20_000);

  it("cada tool dice QUIÉN la pidió: el orquestador delega, el especialista escribe con su nombre", async () => {
    const s = await abrirSesionTrueforge({
      raiz: proyecto(),
      modelos: modelos(),
      entorno: ENTORNO,
      skills: CATALOGO,
      pedirAprobacion: async (ps) => new Map(ps.map((p) => [p.id, { type: "approve" as const }])),
    });
    const vistas: { texto: string; detalle: DetalleDeLinea }[] = [];
    await s.turno("escribe una nota", { ...piel().p, linea: (texto, detalle) => void vistas.push({ texto, detalle: detalle ?? {} }) });
    const de = (tool: string) => vistas.filter((v) => v.detalle.nombre === tool).map((v) => v.detalle.origen);
    expect(de("create_sub_agent")).toEqual([{ rol: "orquestador" }]);
    // El nombre sale del hilo que abrió la delegación —la COMPOSICIÓN de la sesión, no la
    // función pura—: el hijo tiene que estar apuntado antes de que se traduzca su primera tool.
    expect(de("write_file")).toEqual([{ rol: "especialista", nombre: "developer-xone" }]);
  }, 20_000);

  it("un especialista que hace artefactos recibe OpenUI montado de verdad; el orquestador, no", async () => {
    const { m, toolsPorLlamada, vistos } = modelosConGuion(guionDeEscritura());
    const s = await abrirSesionTrueforge({
      raiz: proyecto(),
      modelos: m,
      entorno: ENTORNO,
      skills: CATALOGO,
      pedirAprobacion: async (ps) => new Map(ps.map((p) => [p.id, { type: "approve" as const }])),
    });
    await s.turno("escribe una nota", piel().p);
    // La primera llamada es del orquestador; la segunda, del hijo `developer-xone`.
    expect(toolsPorLlamada[0]).not.toContain("get_openui_instructions");
    expect(toolsPorLlamada[1]).toContain("get_openui_instructions");
    // Y su prompt de sistema lleva nuestras reglas, no solo la línea de la librería.
    expect(vistos[1]!.join("\n")).toContain("/artefactos/<nombre>.openui");
  }, 20_000);

  it("un hijo con un nombre que no es de ningún especialista sale SIN nombre, no con el que inventó el modelo", async () => {
    const { m } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "ayudante-inventado", input: "mira" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "r1", name: "read_file", args: JSON.stringify({ file_path: "/app.xml" }) }] })],
      [new AIMessageChunk({ content: "Visto." })],
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const detalles: DetalleDeLinea[] = [];
    await s.turno("mira", { ...piel().p, linea: (_t, d) => void detalles.push(d ?? {}) });
    expect(detalles.filter((d) => d.nombre === "read_file").map((d) => d.origen)).toEqual([{ rol: "especialista" }]);
  }, 20_000);

  it("RECHAZADA: el disco no se toca", async () => {
    const raiz = proyecto();
    const s = await abrirSesionTrueforge({
      raiz,
      modelos: modelos(),
      entorno: ENTORNO,
      skills: CATALOGO,
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
      skills: CATALOGO,
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
    const s = await abrirSesionTrueforge({ raiz, modelos: modelos(), entorno: ENTORNO, skills: CATALOGO });
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
      skills: CATALOGO,
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

  it("por `abrirSesionReal` SIN carpeta de artefactos —terminal, `run --real`—, `/artefactos/` cae en `.xonecode/artefactos` y no en la app", async () => {
    // El agujero medido: TrueForge no recibía carpeta y la escritura acababa en `artefactos/`
    // de la raíz del proyecto, sin aprobación. Aquí sin `artefactos` en las opciones, como abren
    // el terminal y `run --real`.
    const raiz = proyecto();
    const { m } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "haz el panel" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "w1", name: "write_file", args: JSON.stringify({ file_path: "/artefactos/panel.openui", content: "root = A" }) }] })],
      [new AIMessageChunk({ content: "Hecho." })],
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    const s = await abrirSesionReal({
      raiz,
      modelos: m,
      skills: { catalogo: () => [], cargar: async () => [] } as never,
      entorno: ENTORNO,
      motor: "trueforge",
      sinAprobacion: () => true,
    });
    await s.turno("haz un panel", piel().p);
    expect(existsSync(join(raiz, "artefactos"))).toBe(false);
    expect(readFileSync(join(raiz, ".xonecode", "artefactos", "panel.openui"), "utf8")).toBe("root = A");
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
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
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
    // Y va en su prompt de SISTEMA —que la compactación no toca—; el primer mensaje es solo el encargo.
    expect(vistos[1]![0]).toMatch(/NO tienes las mismas tools/);
    expect(vistos[1]![1]).toBe("di hola por la shell");
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
    // Y el raíz es el ORQUESTADOR: lee pero no escribe, sabe delegar por `create_sub_agent`, y no
    // recibe NINGUNA skill — son de cada especialista.
    expect(toolsPorLlamada[0]).toContain("read_file");
    expect(toolsPorLlamada[0]).not.toContain("write_file");
    expect(toolsPorLlamada[0]).toContain("create_sub_agent");
    expect(vistos[0]!.join("\n")).toMatch(/create_sub_agent/);
    expect(vistos[0]!.join("\n")).not.toMatch(/\/skills\//);
    // El conductor recibe las SUYAS del catálogo, y no las de otro.
    expect(vistos[1]!.join("\n")).toContain("/skills/xone-hotswap/SKILL.md");
    expect(vistos[1]!.join("\n")).not.toContain("/skills/xone-development/SKILL.md");
  }, 30_000);

  it("cancelar el turno mientras `execute` corre un comando largo LIBERA el turno rápido, sin esperar a que termine", async () => {
    const raiz = proyecto();
    const guiones = [
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "device-controller", input: "espera" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "x1", name: "execute", args: JSON.stringify({ command: "sleep 5" }) }] })],
    ];
    const modelo = {
      bindTools: (tools: unknown[]) => {
        void tools;
        return modelo;
      },
      stream: async () => {
        const g = guiones.shift() ?? [new AIMessageChunk({ content: "" })];
        return (async function* () {
          for (const t of g) yield t;
        })();
      },
    };
    const m = { paraPapel: () => modelo, paraModelo: () => modelo, descripcion: () => ({}) } as unknown as ModelosPort;
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });

    const empieza = Date.now();
    const turno = s.turno("espera", piel().p);
    // Deja que `sh -c "sleep 5"` arranque de verdad antes de cancelar.
    await new Promise((r) => setTimeout(r, 300));
    s.cancelar();
    // A diferencia de deepagents (`turnoReal.ts`), cuyo `agent.stream({signal})` de LangGraph
    // RECHAZA con el motivo del abort, el `AgentThreadOrchestrator.execute()` real de TrueForge
    // solo apaga `shouldStopExecution` y termina LIMPIO — otros dos tests de este mismo fichero
    // («cancelar MIENTRAS se decide una aprobación…», «CANCELAR aborta la señal que recibió el
    // hijo…») ya dependen de que `turno()` RESUELVA tras cancelar. Lo que aquí se prueba es que
    // se libera RÁPIDO, no que rechace.
    await turno;
    expect(Date.now() - empieza).toBeLessThan(4000);
  }, 10_000);

  it("cada especialista sale de SU `.md`: el que solo lee escribe SOLO fuera del proyecto y sin preguntar, el que escribe pide aprobación", async () => {
    const raiz = proyecto();
    const { m, vistos, toolsPorLlamada } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "c1", name: "create_sub_agent", args: JSON.stringify({ name: "consultant-xone", input: "¿qué es un mapcol?" }) }] })],
      // El consultor —soloLectura— intenta tocar el proyecto y deja un plan.
      [
        new AIMessageChunk({
          content: "",
          tool_call_chunks: [
            { index: 0, id: "e1", name: "write_file", args: JSON.stringify({ file_path: "/app.xml", content: "<roto/>" }) },
            { index: 1, id: "e2", name: "write_file", args: JSON.stringify({ file_path: "/planes/demo/plan.md", content: "# plan\n" }) },
          ],
        }),
      ],
      [new AIMessageChunk({ content: "Una referencia a otra colección." })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "c2", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "mira app.xml" }) }] })],
      [new AIMessageChunk({ content: "Mirado." })],
      [new AIMessageChunk({ content: "Hecho." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const pi = piel();
    await s.turno("pregunta y mira", pi.p);
    // Lo mismo que deepagents: `permisosDe` lo confina y no hay nada que aprobar.
    expect(toolsPorLlamada[1]).toContain("write_file");
    expect(pi.pausas()).toBe(0);
    expect(readFileSync(join(raiz, "app.xml"), "utf8")).toBe("<app/>\n");
    expect(readFileSync(join(raiz, ".xonecode", "planes", "demo", "plan.md"), "utf8")).toBe("# plan\n");
    // El desarrollador escribe (con aprobación) y no ejecuta.
    expect(toolsPorLlamada[4]).toContain("write_file");
    expect(toolsPorLlamada[4]).not.toContain("execute");
    // Su prompt es el de su `.md` —con las reglas de XOne delante— y le llegan SUS skills.
    expect(vistos[1]!.join("\n")).toContain("/skills/xone-development/SKILL.md");
    // Las tools PROPIAS, con el reparto de deepagents: los especialistas llevan las dos, y su
    // nota las NOMBRA — sale de lo que se monta, no de una frase escrita a mano.
    expect(toolsPorLlamada[1]).toEqual(expect.arrayContaining(["xone_navegacion", "regex_search"]));
    expect(vistos[1]!.join("\n")).toContain("`xone_navegacion`");
    expect(vistos[4]!.join("\n")).toMatch(/cada escritura la aprueba una persona/i);
  }, 30_000);

  it("el ORQUESTADOR lleva `xone_navegacion` y la usa de verdad; `regex_search` no, es de los especialistas", async () => {
    const raiz = proyecto();
    const { m, vistos, toolsPorLlamada } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "n1", name: "xone_navegacion", args: JSON.stringify({ operacion: "inventario" }) }] })],
      [new AIMessageChunk({ content: "Hay una: Clientes." })],
    ]);
    const s = await abrirSesionTrueforge({
      raiz,
      modelos: m,
      entorno: ENTORNO,
      skills: CATALOGO,
      // Doblado: se mide que la tool está MONTADA y su respuesta vuelve al modelo.
      navegacion: async () =>
        ({
          inventario: () => [{ clase: "coleccion", nombre: "Clientes", fichero: "/clientes.xne" }],
          definicion: () => [],
          referencias: () => [],
          campos: () => [],
          app: () => ({ entrada: [], login: [], estilos: [], conexiones: [] }),
          detalle: () => undefined,
          problemas: () => ({ rotas: [], huerfanas: [] }),
        }) as never,
    });
    const pi = piel();
    await s.turno("¿qué colecciones hay?", pi.p);
    expect(toolsPorLlamada[0]).toContain("xone_navegacion");
    expect(toolsPorLlamada[0]).not.toContain("regex_search");
    // La fecha de la librería, sin tocar el disco.
    expect(toolsPorLlamada[0]).toContain("get_current_datetime");
    expect(vistos[1]!.join("\n")).toContain("Clientes  /clientes.xne");
    expect(pi.tokens.join("")).toBe("Hay una: Clientes.");
  }, 30_000);

  it("una salida GRANDE de `execute` se desaloja a `/large_tool_results/`: al hijo le llega la ruta, no el volcado", async () => {
    const raiz = proyecto();
    const artefactos = join(raiz, ".xonecode", "sesiones", "s1", "artefactos");
    const { m, vistos } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "device-controller", input: "saca el log" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "x1", name: "execute", args: JSON.stringify({ command: "head -c 60000 /dev/zero | tr '\\0' a" }) }] })],
      [new AIMessageChunk({ content: "Log revisado." })],
      [new AIMessageChunk({ content: "Hecho." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, artefactos });
    await s.turno("saca el log", piel().p);
    const visto = vistos[2]!.join("\n");
    expect(visto).toMatch(/se guardó en \/large_tool_results\//);
    expect(visto).not.toContain("a".repeat(30_000));
  }, 30_000);

  it("el raíz se COMPACTA al umbral de deepagents, y el resumen también cuenta en el gasto", async () => {
    const raiz = proyecto();
    const { m, vistos } = modelosConGuion([
      [
        new AIMessageChunk({
          content: "",
          tool_call_chunks: [{ index: 0, id: "n1", name: "ls", args: JSON.stringify({ path: "/" }) }],
          usage_metadata: { input_tokens: 40_000, output_tokens: 10, total_tokens: 40_010 },
        }),
      ],
      // La compactación: una llamada entera, antes de la siguiente del raíz.
      [new AIMessageChunk({ content: "RESUMEN-DE-LA-CONVERSACION", usage_metadata: { input_tokens: 900, output_tokens: 50, total_tokens: 950 } })],
      [new AIMessageChunk({ content: "Listo.", usage_metadata: { input_tokens: 1_000, output_tokens: 2, total_tokens: 1_002 } })],
    ]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("mira la raíz", piel().p);
    expect(vistos[1]!.join("\n")).toMatch(/summary of the conversation/);
    expect(vistos[2]!.join("\n")).toContain("RESUMEN-DE-LA-CONVERSACION");
    // Las tres llamadas pagan, la del resumen incluida; la ventana es la de la ÚLTIMA normal.
    expect(s.consumo().modelo).toMatchObject({ entrada: 41_900, salida: 62 });
    expect(s.consumo().contexto).toBe(1_000);
  }, 30_000);

  it("un ROJO del simulador se REPARA en el mismo hilo, con el objetivo delante, y el turno cierra en VERDE", async () => {
    const raiz = proyecto();
    const escritura = (id: string, contenido: string) =>
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: "write_file", args: JSON.stringify({ file_path: "/nota.txt", content: contenido }) }] });
    const delegar = (id: string) =>
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "escribe la nota" }) }] });
    const { m, vistos } = modelosConGuion([
      [delegar("d1")],
      [escritura("w1", "mal\n")],
      [new AIMessageChunk({ content: "Escrita." })],
      [new AIMessageChunk({ content: "Listo." })],
      // La reparación: el orquestador vuelve a delegar y el hijo corrige.
      [delegar("d2")],
      [escritura("w2", "bien\n")],
      [new AIMessageChunk({ content: "Corregida." })],
      [new AIMessageChunk({ content: "Arreglado." })],
    ]);
    const veredictos = [
      { hallazgos: [{ code: "XNE001", severidad: "error" as const, mensaje: "mal", fichero: join(raiz, "nota.txt"), linea: 1 }] },
      { hallazgos: [] },
    ];
    let verificaciones = 0;
    const s = await abrirSesionTrueforge({
      raiz,
      modelos: m,
      entorno: ENTORNO,
      skills: CATALOGO,
      sinAprobacion: () => true,
      verifier: { verificar: async () => ({ ...veredictos[verificaciones++]!, ok: true }) as never },
    });
    const eventos: string[] = [];
    const r = await s.turno("escribe una nota", { ...piel().p, linea: (t) => void eventos.push(t) });
    expect(verificaciones).toBe(2);
    expect(readFileSync(join(raiz, "nota.txt"), "utf8")).toBe("bien\n");
    // La petición de reparación llegó al orquestador, con los hallazgos Y el objetivo.
    const reparacion = vistos[4]!.join("\n");
    expect(reparacion).toMatch(/XNE001 en nota\.txt:1/);
    expect(reparacion).toContain("escribe una nota");
    expect(r.verificador).toBe("verde");
    expect(eventos.join("\n")).not.toMatch(/no ha corrido/);
  }, 30_000);

  it("sin verificador, un turno que ESCRIBIÓ lo DICE con el motivo; uno que no escribió, no", async () => {
    const raiz = proyecto();
    const s = await abrirSesionTrueforge({ raiz, modelos: modelos(), entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true });
    const lineas: string[] = [];
    const r = await s.turno("escribe una nota", { ...piel().p, linea: (t) => void lineas.push(t) });
    expect(r.verificador).toBe("no-corrio");
    expect(lineas.join("\n")).toMatch(/el verificador no ha corrido en este turno \(esta ejecución no tiene verificador\)/);
  }, 30_000);

  it("`abrirSesionReal` le PASA el verificador a TrueForge: es la puerta de todas las pieles", async () => {
    const raiz = proyecto();
    let verificaciones = 0;
    const s = await abrirSesionReal({
      raiz,
      modelos: modelos(),
      skills: { catalogo: () => [], cargar: async () => [] } as never,
      entorno: ENTORNO,
      motor: "trueforge",
      sinAprobacion: () => true,
      verifier: { verificar: async () => (verificaciones++, { hallazgos: [], ok: true }) as never },
    });
    const r = await s.turno("escribe una nota", piel().p);
    expect(verificaciones).toBe(1);
    expect(r.verificador).toBe("verde");
  }, 30_000);

  it("REABRIR una sesión continúa la conversación: la foto del raíz sobrevive al proceso", async () => {
    const raiz = proyecto();
    const abrir = (m: ModelosPort) =>
      abrirSesionReal({
        raiz,
        modelos: m,
        skills: { catalogo: () => [], cargar: async () => [] } as never,
        entorno: ENTORNO,
        motor: "trueforge",
        hilo: "sesion-1",
      });
    const primera = await abrir(modelosConGuion([[new AIMessageChunk({ content: "Me llamo XOneCode." })]]).m);
    await primera.turno("¿cómo te llamas?", piel().p);
    primera.cerrar();

    const { m, vistos } = modelosConGuion([[new AIMessageChunk({ content: "Te lo dije antes." })]]);
    const segunda = await abrir(m);
    await segunda.turno("¿qué me dijiste?", piel().p);
    const visto = vistos[0]!.join("\n");
    expect(visto).toContain("¿cómo te llamas?");
    expect(visto).toContain("Me llamo XOneCode.");
    expect(visto).toContain("¿qué me dijiste?");
  }, 30_000);

  it("una conversación CON aprobación y delegación se guarda, pasa la lectura estricta y se reabre", async () => {
    // Lo que la librería mete de verdad en el contexto del raíz —la delegación, su respuesta, las
    // decisiones— tiene que pasar `interpretarFoto`: si no, las sesiones que más importan se
    // abrirían sin memoria.
    const raiz = proyecto();
    const abrir = (m: ModelosPort) =>
      abrirSesionReal({
        raiz,
        modelos: m,
        skills: { catalogo: () => [], cargar: async () => [] } as never,
        entorno: ENTORNO,
        motor: "trueforge",
        hilo: "sesion-escrita",
        pedirAprobacion: async (pendientes) => new Map(pendientes.map((p) => [p.id, { type: "approve" as const }])),
      });
    const primera = await abrir(modelosConGuion(guionDeEscritura()).m);
    await primera.turno("escribe una nota", piel().p);
    primera.cerrar();
    expect(readFileSync(join(raiz, "nota.txt"), "utf8")).toBe("hola\n");
    expect(cargarMemoria(raiz, "sesion-escrita").estado).toBe("ok");

    const { m, vistos } = modelosConGuion([[new AIMessageChunk({ content: "La escribí antes." })]]);
    const segunda = await abrir(m);
    const pi = piel();
    await segunda.turno("¿qué hiciste?", pi.p);
    expect(vistos[0]!.join("\n")).toContain("escribe una nota");
    expect(pi.lineas.join("\n")).not.toMatch(/no se pudo cargar/);
  }, 30_000);

  it("una foto que NO se entiende no tumba la sesión: se abre sin memoria, se APARTA y el PRIMER turno lo dice", async () => {
    const raiz = proyecto();
    const carpeta = join(raiz, ".xonecode", "sesiones", "sesion-rota");
    mkdirSync(carpeta, { recursive: true });
    const ilegible = JSON.stringify({ version: 99, context: [{ role: "user", content: "de un XOneCode futuro" }] });
    writeFileSync(join(carpeta, "memoria-trueforge.json"), ilegible);
    const { m, vistos } = modelosConGuion([[new AIMessageChunk({ content: "Empiezo de cero." })], [new AIMessageChunk({ content: "Sigo." })]]);
    const s = await abrirSesionReal({
      raiz,
      modelos: m,
      skills: { catalogo: () => [], cargar: async () => [] } as never,
      entorno: ENTORNO,
      motor: "trueforge",
      hilo: "sesion-rota",
    });
    const primero = piel();
    await s.turno("hola", primero.p);
    expect(vistos[0]!.join("\n")).not.toContain("de un XOneCode futuro");
    const aviso = primero.lineas.join("\n");
    expect(aviso).toMatch(/memoria guardada de esta sesión no se pudo cargar \(la escribió un XOneCode más nuevo \(versión 99/);
    expect(aviso).not.toContain(raiz);
    // No se ha destruido: está apartada, byte a byte, y el guardado del turno no la pisó.
    const apartadas = readdirSync(carpeta).filter((n) => n.startsWith("memoria-trueforge.incompatible-"));
    expect(apartadas).toHaveLength(1);
    expect(readFileSync(join(carpeta, apartadas[0]!), "utf8")).toBe(ilegible);
    // Y se dice UNA vez: el segundo turno ya continúa la conversación nueva.
    const segundo = piel();
    await s.turno("¿sigues?", segundo.p);
    expect(segundo.lineas.join("\n")).not.toMatch(/no se pudo cargar/);
  }, 30_000);

  it("un turno CORTADO con un hijo esperando no deja la sesión atascada: la colgada se salda y el siguiente turno corre", async () => {
    const raiz = proyecto();
    const { m, vistos } = modelosConGuion([
      ...guionDeEscritura().slice(0, 2),
      // El turno siguiente: el raíz contesta.
      [new AIMessageChunk({ content: "Sigo aquí." })],
    ]);
    // Sin `pedirAprobacion`: la escritura del hijo se queda sin resolver y el turno se corta.
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const r1 = await s.turno("escribe una nota", piel().p);
    expect(r1.pendientes).toBe(1);
    const pi = piel();
    await s.turno("¿sigues?", pi.p);
    expect(pi.tokens.join("")).toBe("Sigo aquí.");
    // La delegación que quedó a medias llega al modelo con una respuesta que dice la verdad.
    expect(vistos[2]!.join("\n")).toMatch(/No se completó: el turno se cortó antes/);
  }, 30_000);

  it("el PRESUPUESTO del paso está montado: tres salidas en paralelo que caben solas no entran juntas", async () => {
    const raiz = proyecto();
    const artefactos = join(raiz, ".xonecode", "sesiones", "s1", "artefactos");
    const comando = (id: string, i: number) => ({ index: i, id, name: "execute", args: JSON.stringify({ command: "head -c 20000 /dev/zero | tr '\\0' b" }) });
    const { m, vistos } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "device-controller", input: "tres logs" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [comando("x1", 0), comando("x2", 1), comando("x3", 2)] })],
      [new AIMessageChunk({ content: "Revisados." })],
      [new AIMessageChunk({ content: "Hecho." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, artefactos });
    await s.turno("tres logs", piel().p);
    const visto = vistos[2]!.join("\n");
    expect(visto).toMatch(/se guardó en \/large_tool_results\//);
    expect((visto.match(/b{1000}/g) ?? []).length * 1000).toBeLessThan(45_000);
  }, 30_000);

  it("con `XONECODE_TRACE_TOOLS=1` deja la MISMA traza que deepagents, y `xonecode traza` la lee por origen", async () => {
    const raiz = proyecto();
    const antes = process.env.XONECODE_TRACE_TOOLS;
    process.env.XONECODE_TRACE_TOOLS = "1";
    try {
      const { m } = modelosConGuion([
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "consultant-xone", input: "mira app.xml" }) }], usage_metadata: { input_tokens: 100, output_tokens: 5, total_tokens: 105 } })],
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "r1", name: "read_file", args: JSON.stringify({ file_path: "/app.xml" }) }], usage_metadata: { input_tokens: 40, output_tokens: 3, total_tokens: 43 } })],
        [new AIMessageChunk({ content: "Es <app/>.", usage_metadata: { input_tokens: 50, output_tokens: 4, total_tokens: 54 } })],
        [new AIMessageChunk({ content: "Hecho.", usage_metadata: { input_tokens: 120, output_tokens: 2, total_tokens: 122 } })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
      await s.turno("mira app.xml", piel().p);
    } finally {
      if (antes === undefined) delete process.env.XONECODE_TRACE_TOOLS;
      else process.env.XONECODE_TRACE_TOOLS = antes;
    }
    const [sesion] = resumirTraza(readFileSync(join(raiz, ".xonecode", "traza-tools.jsonl"), "utf8").split("\n"));
    expect(sesion!.llamadas).toBe(4);
    expect(sesion!.origenes.map((o) => o.origen).sort()).toEqual(["consultant-xone", "orquestador"]);
    expect(sesion!.tools.map((t) => t.nombre).sort()).toEqual(["create_sub_agent", "read_file"]);
    expect(sesion!.pesos.some((p) => p.nombre === "read_file" && p.chars > 0)).toBe(true);
    // Y el contraste con las métricas del motor llega a la traza REAL y al informe.
    expect(sesion!.contraste).toEqual({ turnos: 1, conDiferencias: 0, diferencias: [] });
    expect(pintarSesion(sesion!).join("\n")).toContain("contraste con el motor: 1 turno(s), las dos cuentas coinciden");
  }, 30_000);

  it("con depurar:true deja traza-tools.jsonl aunque el proceso no tenga XONECODE_TRACE_TOOLS", async () => {
    const raiz = proyecto();
    try {
      await abrirSesionTrueforge({ raiz, modelos: modelos(), entorno: ENTORNO, skills: CATALOGO, depurar: true });
      expect(existsSync(join(raiz, ".xonecode", "traza-tools.jsonl"))).toBe(true);
    } finally {
      // `depurar:true` enciende TAMBIÉN el sumidero GLOBAL de la traza de errores/hitos.
      ponerSumideroDeErrores(undefined);
    }
  });

  it("con depurar:true enciende TAMBIÉN la traza de hitos/errores, que aquí faltaba", async () => {
    const raiz = proyecto();
    try {
      await abrirSesionTrueforge({ raiz, modelos: modelos(), entorno: ENTORNO, skills: CATALOGO, depurar: true });
      anotarPaso("test#paso")();
      const lineas = readFileSync(join(raiz, ".xonecode", "traza-errores.jsonl"), "utf8").trim().split("\n");
      expect(lineas.some((l) => JSON.parse(l).donde === "test#paso")).toBe(true);
    } finally {
      // El sumidero es GLOBAL (core/trazaDeErrores.ts): sin esto, un test más adelante en el
      // mismo worker seguiría escribiendo en ESTE `raiz`, que ya no le pertenece a nadie.
      ponerSumideroDeErrores(undefined);
    }
  });

  it("sin pasar depurar (como cualquier test de siempre) no deja nada: npm test sigue sin necesitarlo", async () => {
    const raiz = proyecto();
    await abrirSesionTrueforge({ raiz, modelos: modelos(), entorno: ENTORNO, skills: CATALOGO });
    expect(existsSync(join(raiz, ".xonecode", "traza-tools.jsonl"))).toBe(false);
  });

  it("el orquestador PREGUNTA: el turno acaba con la pregunta en el chat y el siguiente mensaje la CONTESTA en su hilo", async () => {
    const raiz = proyecto();
    const { m, vistos, toolsPorLlamada } = modelosConGuion([
      [
        new AIMessageChunk({
          content: "",
          tool_call_chunks: [
            { index: 0, id: "q1", name: "ask_user_question", args: JSON.stringify({ question: "¿Qué pantalla toco?", options: ["Login", "Menú"] }) },
          ],
        }),
      ],
      [new AIMessageChunk({ content: "Vale, el menú." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const uno = piel();
    await s.turno("arregla la pantalla", uno.p);
    expect(toolsPorLlamada[0]).toContain("ask_user_question");
    expect(uno.tokens.join("")).toMatch(/¿Qué pantalla toco\?[\s\S]*1\. Login[\s\S]*2\. Menú/);
    // Solo UNA llamada al modelo: la pregunta cierra el turno, no sigue sola.
    expect(vistos).toHaveLength(1);

    const dos = piel();
    await s.turno("2", dos.p);
    // El «2» vuelve como la respuesta de la tool, traducido a la opción, y no como otro mensaje suelto.
    expect(vistos[1]!).toContain("Menú");
    expect(vistos[1]!.filter((c) => c === "2")).toHaveLength(0);
    expect(dos.tokens.join("")).toBe("Vale, el menú.");
  }, 30_000);

  it("solo el ORQUESTADOR puede preguntar: un hijo no tiene a nadie delante", async () => {
    const raiz = proyecto();
    const { m, toolsPorLlamada } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "consultant-xone", input: "mira" }) }] })],
      [new AIMessageChunk({ content: "Mirado." })],
      [new AIMessageChunk({ content: "Hecho." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("mira", piel().p);
    expect(toolsPorLlamada[0]).toContain("ask_user_question");
    expect(toolsPorLlamada[1]).not.toContain("ask_user_question");
  }, 30_000);
});

describe("la pregunta del orquestador, como texto", () => {
  it("un número dentro de las opciones se traduce; fuera de rango o texto libre pasan tal cual", async () => {
    const { respuestaAPregunta, textoDePregunta } = await import("./sesionTrueforge.js");
    const args = { question: "¿Cuál?", options: ["A", "B"] };
    expect(respuestaAPregunta(args, "1")).toBe("A");
    expect(respuestaAPregunta(args, " 2. ")).toBe("B");
    expect(respuestaAPregunta(args, "3")).toBe("3");
    expect(respuestaAPregunta(args, "ninguna, la C")).toBe("ninguna, la C");
    // Sin opciones: la pregunta sola, sin la línea de «contesta con el número».
    expect(textoDePregunta({ question: "¿Seguro?", options: [] })).not.toMatch(/número/);
  });
});

describe("el tope de llamadas es POR TURNO, no de toda la conversación", () => {
  it("más turnos que el tope del raíz sobre la MISMA sesión: todos contestan", async () => {
    const raiz = proyecto();
    const turnos = LIMITE_DE_LLAMADAS_DEL_RAIZ + 5;
    const { m } = modelosConGuion(Array.from({ length: turnos }, (_, i) => [new AIMessageChunk({ content: `r${i}` })]));
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
    let ultimo: string[] = [];
    for (let i = 0; i < turnos; i += 1) {
      const pi = piel();
      await s.turno(`hola ${i}`, pi.p);
      ultimo = pi.tokens;
    }
    // Con el contador acumulado, el turno 101 moría con «iteration limit»; rehecho cada turno, contesta.
    expect(ultimo.join("")).toBe(`r${turnos - 1}`);
  }, 60_000);

  it("un especialista con más de 25 pasos útiles —el 25 del core de TrueForge— TERMINA", async () => {
    const raiz = proyecto();
    const pasos = 27;
    expect(pasos).toBeLessThan(TOPE_DE_LLAMADAS_DEL_ESPECIALISTA);
    const { m } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "consultant-xone", input: "mira mucho" }) }] })],
      ...Array.from({ length: pasos }, (_, i) => [
        new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: `l${i}`, name: "ls", args: JSON.stringify({ path: "/" }) }] }),
      ]),
      [new AIMessageChunk({ content: "Mirado todo." })],
      [new AIMessageChunk({ content: "Hecho." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const pi = piel();
    await s.turno("mira mucho", pi.p);
    expect(pi.tokens.join("")).toBe("Hecho.");
    expect(pi.lineas.join("\n")).not.toMatch(/tope|falló/);
  }, 60_000);

  it("un especialista que AGOTA su tope queda anotado en la traza como corte, con su nombre", async () => {
    // Medido: la traza decía «cortes: 0» con un documentador parado en exactamente 30 llamadas.
    const cortes: { origen: string; limite: number }[] = [];
    const pasos = TOPE_DE_LLAMADAS_DEL_ESPECIALISTA + 2;
    const { m } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "consultant-xone", input: "mira sin fin" }) }] })],
      ...Array.from({ length: pasos }, (_, i) => [
        new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: `l${i}`, name: "ls", args: JSON.stringify({ path: "/" }) }] }),
      ]),
      [new AIMessageChunk({ content: "Se cortó." })],
    ]);
    const s = await abrirSesionTrueforge({
      raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO,
      diagnostico: { modelo: () => {}, herramienta: () => {}, corte: (origen, limite) => void cortes.push({ origen, limite }) },
    });
    await s.turno("mira sin fin", piel().p);
    expect(cortes).toEqual([{ origen: "consultant-xone", limite: TOPE_DE_LLAMADAS_DEL_ESPECIALISTA }]);
  }, 120_000);

  it("`traducirEvento`: el raíz es el orquestador, y un hijo que la sesión no conoce sale sin nombre, nunca con el id del hilo", () => {
    const append = (thread_id?: string) => ({
      type: "internal.agent.context.append",
      ...(thread_id === undefined ? {} : { thread_id }),
      output: [{ tool_calls: [{ function: { name: "grep", arguments: "{}" } }] }],
    });
    const origen = (e: unknown, quien?: (h: string) => string | undefined) =>
      traducirEvento(e, quien).eventos.map((ev) => (ev.tipo === "tool" ? ev.origen : undefined));
    expect(origen(append())).toEqual([{ rol: "orquestador" }]);
    expect(origen(append("hilo-7"))).toEqual([{ rol: "especialista" }]);
    expect(origen(append("hilo-7"), () => undefined)).toEqual([{ rol: "especialista" }]);
    expect(origen(append("hilo-7"), (h) => (h === "hilo-7" ? "analyst-xone" : undefined))).toEqual([
      { rol: "especialista", nombre: "analyst-xone" },
    ]);
  });

  it("`traducirEvento`: el razonamiento de un HIJO sale ENTERO al completarse su mensaje, delante de sus tools, y sin mezclarse con el de otro", () => {
    const pensamientos = new Map<string, string>();
    const quien = (h: string) => ({ "h-1": "developer-xone", "h-2": "designer-xone" })[h];
    const delta = (thread_id: string, reasoning_content: string) =>
      traducirEvento({ type: "model.message.delta", thread_id, reasoning_content }, quien, pensamientos).eventos;
    // Los trozos de dos especialistas en paralelo, intercalados: no sale NADA mientras llegan.
    expect([...delta("h-1", "Leo "), ...delta("h-2", "Miro "), ...delta("h-1", "el app."), ...delta("h-2", "el CSS.")]).toEqual([]);
    const cierre = traducirEvento(
      { type: "internal.agent.context.append", thread_id: "h-1", output: [{ tool_calls: [{ function: { name: "grep", arguments: "{}" } }] }] },
      quien,
      pensamientos
    ).eventos;
    expect(cierre.map((e) => e.tipo)).toEqual(["razonamiento", "tool"]);
    expect(cierre[0]).toEqual({ tipo: "razonamiento", texto: "Leo el app.", origen: { rol: "especialista", nombre: "developer-xone" } });
    // El del otro sigue esperando a SU mensaje, entero.
    const otro = traducirEvento({ type: "internal.agent.context.append", thread_id: "h-2", output: [] }, quien, pensamientos).eventos;
    expect(otro).toEqual([{ tipo: "razonamiento", texto: "Miro el CSS.", origen: { rol: "especialista", nombre: "designer-xone" } }]);
    // El del raíz va a trozos, en vivo, y dice que es del orquestador.
    expect(traducirEvento({ type: "model.message.delta", reasoning_content: "Delego." }, quien, pensamientos).eventos).toEqual([
      { tipo: "razonamiento", texto: "Delego.", origen: { rol: "orquestador" } },
    ]);
  });

  it("el razonamiento de DeepSeek (additional_kwargs) llega al CHAT con quién pensó, y NO entra en la memoria del hilo", async () => {
    const raiz = proyecto();
    const pensado = (texto: string, extra: Partial<ConstructorParameters<typeof AIMessageChunk>[0] & object> = {}) =>
      new AIMessageChunk({ content: "", additional_kwargs: { reasoning_content: texto }, ...(extra as object) });
    const { m } = modelosConGuion([
      [
        pensado("PIENSA-EL-ORQUESTADOR "),
        new AIMessageChunk({
          content: "",
          tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "analyst-xone", input: "mira el app" }) }],
        }),
      ],
      [pensado("PIENSA-EL-"), pensado("ANALISTA"), new AIMessageChunk({ content: "Tiene una colección." })],
      [new AIMessageChunk({ content: "Una colección." })],
    ]);
    const s = await abrirSesionReal({
      raiz,
      modelos: m,
      skills: { catalogo: () => [], cargar: async () => [] } as never,
      entorno: ENTORNO,
      motor: "trueforge",
      hilo: "sesion-pensada",
    });
    const razonado: { texto: string; origen?: unknown }[] = [];
    const pi = piel();
    await s.turno("¿qué tiene?", { ...pi.p, razonamiento: (texto, origen) => void razonado.push({ texto, ...(origen === undefined ? {} : { origen }) }) });
    s.cerrar();
    expect(razonado).toEqual([
      { texto: "PIENSA-EL-ORQUESTADOR ", origen: { rol: "orquestador" } },
      { texto: "PIENSA-EL-ANALISTA", origen: { rol: "especialista", nombre: "analyst-xone" } },
    ]);
    const foto = readFileSync(rutaDeMemoria(raiz, "sesion-pensada")!, "utf8");
    expect(foto).toContain("Una colección.");
    expect(foto).not.toContain("PIENSA-EL");
  }, 30_000);

  it("`topeAgotadoDe` reconoce el corte y nada más", () => {
    expect(topeAgotadoDe({ type: "internal.agent.done", status: "error", error: "You have reached iteration limit of 100, please request again" })).toBe(100);
    expect(topeAgotadoDe({ type: "internal.agent.done", status: "error", error: "otra cosa" })).toBeUndefined();
    expect(topeAgotadoDe({ type: "internal.agent.done", status: "completed" })).toBeUndefined();
  });

  it("el corte por tope se DICE como corte, en castellano y con el número", () => {
    const { eventos } = traducirEvento({ type: "internal.agent.done", status: "error", error: "You have reached iteration limit of 100, please request again" });
    expect(eventos).toEqual([expect.objectContaining({ tipo: "aviso", texto: expect.stringMatching(/agotó su tope de 100 llamadas/) })]);
  });
});

describe("la pregunta sobrevive a CERRAR y REABRIR", () => {
  it("el agente pregunta, se cierra la consola, y al reabrir la respuesta vuelve como la de ESA pregunta", async () => {
    const raiz = proyecto();
    const abrir = (m: ModelosPort) =>
      abrirSesionReal({ raiz, modelos: m, skills: { catalogo: () => [], cargar: async () => [] } as never, entorno: ENTORNO, motor: "trueforge", hilo: "s-pregunta" });
    const primera = await abrir(
      modelosConGuion([
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "q1", name: "ask_user_question", args: JSON.stringify({ question: "¿Cuál?", options: ["Login", "Menú"] }) }] })],
      ]).m
    );
    await primera.turno("arregla la pantalla", piel().p);
    primera.cerrar();

    const { m, vistos } = modelosConGuion([[new AIMessageChunk({ content: "Vale, el menú." })]]);
    const segunda = await abrir(m);
    const pi = piel();
    await segunda.turno("2", pi.p);
    expect(vistos[0]!).toContain("Menú");
    expect(vistos[0]!.join("\n")).not.toMatch(/No se completó/);
    expect(pi.tokens.join("")).toBe("Vale, el menú.");
  }, 30_000);
});

describe("los hechos del proyecto van DELANTE del turno, también en TrueForge", () => {
  // La composición vive dentro de `turno()`, el cierre que todos los tests doblan: sin estos
  // tres, la foto podía dejar de montarse en este motor con todo en verde.
  const indice = async () =>
    ({
      inventario: () => [
        { nombre: "EntradaApp", clase: "coleccion", fichero: "/EntradaApp.xne" },
        { nombre: "Calculadora", clase: "coleccion", fichero: "/Calculadora.xne" },
      ],
      app: () => ({ entrada: ["EntradaApp"], login: [], estilos: ["default.css"], conexiones: [] }),
    }) as never;
  const mensajeDelUsuario = (vistos: string[][], i: number): string => vistos[i]!.find((c) => c.includes("arregla el visor"))!;

  it("la petición llega con el inventario detrás, y la petición va PRIMERO", async () => {
    const { m, vistos } = modelosConGuion([[new AIMessageChunk({ content: "Hecho." })]]);
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO, navegacion: indice });
    await s.turno("arregla el visor", piel().p);
    const texto = mensajeDelUsuario(vistos, 0);
    expect(texto.startsWith("arregla el visor")).toBe(true);
    expect(texto).toContain("Calculadora");
    expect(texto).toContain("Entrada: EntradaApp");
  }, 30_000);

  it("un índice que revienta NO tumba el turno: va la petición sola", async () => {
    const { m, vistos } = modelosConGuion([[new AIMessageChunk({ content: "Hecho." })]]);
    const s = await abrirSesionTrueforge({
      raiz: proyecto(),
      modelos: m,
      entorno: ENTORNO,
      skills: CATALOGO,
      navegacion: async () => {
        throw new Error("no es un proyecto XOne");
      },
    });
    const pi = piel();
    await s.turno("arregla el visor", pi.p);
    expect(vistos[0]!).toContain("arregla el visor");
    expect(pi.tokens.join("")).toBe("Hecho.");
  }, 30_000);

  it("la RESPUESTA a una pregunta no es un encargo nuevo: vuelve sin la foto", async () => {
    const { m, vistos } = modelosConGuion([
      [
        new AIMessageChunk({
          content: "",
          tool_call_chunks: [{ index: 0, id: "q1", name: "ask_user_question", args: JSON.stringify({ question: "¿Cuál?", options: ["Login", "Menú"] }) }],
        }),
      ],
      [new AIMessageChunk({ content: "Vale." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO, navegacion: indice });
    await s.turno("arregla el visor", piel().p);
    await s.turno("2", piel().p);
    // La foto va UNA vez, con el encargo; la respuesta no la repite.
    expect(vistos[1]!.filter((c) => c.includes("Calculadora"))).toHaveLength(1);
  }, 30_000);
});

describe("el juez del turno y el crítico de pantalla, enganchados en TrueForge", () => {
  const delegar = (id: string) =>
    new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "escribe la nota" }) }] });
  const escribir = (id: string, contenido: string, captura = false) =>
    new AIMessageChunk({
      content: "",
      tool_call_chunks: [
        { index: 0, id, name: "write_file", args: JSON.stringify({ file_path: "/nota.txt", content: contenido }) },
        ...(captura ? [{ index: 1, id: `${id}c`, name: "write_file", args: JSON.stringify({ file_path: "/artefactos/pantalla.png", content: "PNG" }) }] : []),
      ],
    });
  const verde = { verificar: async () => ({ hallazgos: [], ok: true }) as never };
  type Caso = { objetivo: string; respuesta: string; hechos: HechosDelTurno };
  const juezQueApunta = (veredicto: { cumplimiento: "cumplido" | "no-cumplido" | "dudoso"; motivo: string }) => {
    const casos: Caso[] = [];
    return { casos, juez: async (c: Caso) => (casos.push(c), veredicto) };
  };
  const lineasDe = () => {
    const lineas: string[] = [];
    return { lineas, p: { ...piel().p, linea: (t: string) => void lineas.push(t) } };
  };

  it("el juez recibe el ENCARGO tal cual —sin los hechos precargados— y los hechos MEDIDOS", async () => {
    const { casos, juez } = juezQueApunta({ cumplimiento: "no-cumplido", motivo: "falta el botón" });
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: modelos(), entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true, verifier: verde, juezDelTurno: juez });
    const l = lineasDe();
    await s.turno("escribe una nota", l.p);
    expect(casos).toHaveLength(1);
    expect(casos[0]!.objetivo).toBe("escribe una nota");
    expect(casos[0]!.respuesta).toBe("Listo.");
    expect(casos[0]!.hechos).toEqual({ verificador: "verde" });
    expect(l.lineas.join("\n")).toMatch(/no parece que esto cumpla lo que pediste: falta el botón/);
  }, 30_000);

  it("con una reparación por medio se juzga UNA vez, al final, y contra el encargo", async () => {
    const { m } = modelosConGuion([
      [delegar("d1")], [escribir("w1", "mal\n")], [new AIMessageChunk({ content: "Escrita." })], [new AIMessageChunk({ content: "Listo." })],
      [delegar("d2")], [escribir("w2", "bien\n")], [new AIMessageChunk({ content: "Corregida." })], [new AIMessageChunk({ content: "Arreglado." })],
    ]);
    const raiz = proyecto();
    const veredictos = [{ hallazgos: [{ code: "XNE001", severidad: "error" as const, mensaje: "mal", fichero: join(raiz, "nota.txt"), linea: 1 }] }, { hallazgos: [] }];
    let n = 0;
    const { casos, juez } = juezQueApunta({ cumplimiento: "cumplido", motivo: "ok" });
    const s = await abrirSesionTrueforge({
      raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true,
      verifier: { verificar: async () => ({ ...veredictos[n++]!, ok: true }) as never },
      juezDelTurno: juez,
    });
    await s.turno("escribe una nota", piel().p);
    expect(casos).toHaveLength(1);
    expect(casos[0]!).toMatchObject({ objetivo: "escribe una nota", respuesta: "Arreglado.", hechos: { verificador: "verde" } });
  }, 30_000);

  it("un juez que REVIENTA es un aviso, no un turno caído", async () => {
    const s = await abrirSesionTrueforge({
      raiz: proyecto(), modelos: modelos(), entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true, verifier: verde,
      juezDelTurno: async () => {
        throw new TypeError("sin red");
      },
    });
    const l = lineasDe();
    const r = await s.turno("escribe una nota", l.p);
    expect(r.verificador).toBe("verde");
    expect(l.lineas.join("\n")).toMatch(/no se pudo consultar al juez del turno: TypeError/);
  }, 30_000);

  it("un turno que acaba PREGUNTANDO no se juzga; su respuesta se juzga contra el encargo que la provocó", async () => {
    const { m } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "q1", name: "ask_user_question", args: JSON.stringify({ question: "¿Cuál?", options: ["Login", "Menú"] }) }] })],
      [new AIMessageChunk({ content: "Hecho en el menú." })],
    ]);
    const { casos, juez } = juezQueApunta({ cumplimiento: "cumplido", motivo: "ok" });
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO, juezDelTurno: juez });
    await s.turno("arregla la pantalla", piel().p);
    expect(casos).toHaveLength(0);
    await s.turno("2", piel().p);
    expect(casos).toHaveLength(1);
    expect(casos[0]!.respuesta).toBe("Hecho en el menú.");
    // El encargo, y que hubo pregunta y respuesta: sin eso el juez lee solo este turno y
    // concluye que no se preguntó (medido en el navegador).
    expect(casos[0]!.objetivo.startsWith("arregla la pantalla")).toBe(true);
    expect(casos[0]!.objetivo).toContain("«¿Cuál?»");
    expect(casos[0]!.objetivo).toContain("«Menú»");
  }, 30_000);

  it("`abrirSesionReal` le PASA el juez y el crítico a TrueForge", async () => {
    const carpeta = mkdtempSync(join(tmpdir(), "xc-tf-art-"));
    const { m } = modelosConGuion([[delegar("d1")], [escribir("w1", "hola\n", true)], [new AIMessageChunk({ content: "Escrita." })], [new AIMessageChunk({ content: "Listo." })]]);
    const { casos, juez } = juezQueApunta({ cumplimiento: "cumplido", motivo: "ok" });
    let criticas = 0;
    const s = await abrirSesionReal({
      raiz: proyecto(), modelos: m, skills: { catalogo: () => [], cargar: async () => [] } as never, entorno: ENTORNO, motor: "trueforge",
      sinAprobacion: () => true, artefactos: carpeta, verifier: verde, juezDelTurno: juez,
      criticaVisual: async () => (criticas++, { veredicto: "verde", observaciones: [] }),
    });
    await s.turno("escribe una nota", piel().p);
    expect(casos).toHaveLength(1);
    expect(criticas).toBe(1);
  }, 30_000);

  it("el crítico mira la CAPTURA del turno: con el simulador en VERDE solo AVISA y no repara", async () => {
    const carpeta = mkdtempSync(join(tmpdir(), "xc-tf-art-"));
    const { m } = modelosConGuion([[delegar("d1")], [escribir("w1", "hola\n", true)], [new AIMessageChunk({ content: "Escrita." })], [new AIMessageChunk({ content: "Listo." })]]);
    const vistas: { base64: string; pantalla: string }[] = [];
    let verificaciones = 0;
    const s = await abrirSesionTrueforge({
      raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true, artefactos: carpeta,
      verifier: { verificar: async () => (verificaciones++, { hallazgos: [], ok: true }) as never },
      criticaVisual: async (c, pantalla) => (vistas.push({ base64: c.base64, pantalla }), { veredicto: "rojo", observaciones: ["texto cortado", "botón fuera"] }),
    });
    const l = lineasDe();
    await s.turno("escribe una nota", l.p);
    // Los BYTES que hay en el disco, no lo que el modelo tecleó: la imagen es la que quedó.
    expect(vistas).toEqual([{ base64: readFileSync(join(carpeta, "pantalla.png")).toString("base64"), pantalla: "pantalla.png" }]);
    expect(l.lineas.join("\n")).toMatch(/la captura de esta sesión enseña 2 defecto\(s\) de pantalla/);
    expect(verificaciones).toBe(1);
  }, 30_000);

  it("con el simulador en ROJO, las observaciones del crítico van DENTRO de la reparación", async () => {
    const carpeta = mkdtempSync(join(tmpdir(), "xc-tf-art-"));
    const raiz = proyecto();
    const { m, vistos } = modelosConGuion([
      [delegar("d1")], [escribir("w1", "mal\n", true)], [new AIMessageChunk({ content: "Escrita." })], [new AIMessageChunk({ content: "Listo." })],
      [new AIMessageChunk({ content: "Arreglado." })],
    ]);
    const veredictos = [{ hallazgos: [{ code: "XNE001", severidad: "error" as const, mensaje: "mal", fichero: join(raiz, "nota.txt"), linea: 1 }] }, { hallazgos: [] }];
    let n = 0;
    let criticas = 0;
    const s = await abrirSesionTrueforge({
      raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true, artefactos: carpeta,
      verifier: { verificar: async () => ({ ...veredictos[Math.min(n++, 1)]!, ok: true }) as never },
      criticaVisual: async () => (criticas++, { veredicto: "rojo", observaciones: ["el rótulo OBS-7Q se sale de su celda"] }),
    });
    await s.turno("escribe una nota", piel().p);
    // Una marca que no puede venir de otro sitio: el prompt de sistema ya dice «cortado».
    expect(vistos[4]!.join("\n")).toContain("OBS-7Q");
    // Una vez por turno: sus observaciones no son una huella con la que medir si avanza.
    expect(criticas).toBe(1);
  }, 30_000);
});

describe("la pregunta del orquestador, también como DATO", () => {
  it("con opciones, la piel recibe la pregunta y sus opciones además del texto; sin opciones, solo el texto", async () => {
    const preguntar = (args: Record<string, unknown>) => [
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "q1", name: "ask_user_question", args: JSON.stringify(args) }] }),
    ];
    const consultas: { pregunta: string; opciones: string[] }[] = [];
    const { m } = modelosConGuion([preguntar({ question: "¿Qué pantalla toco?", options: ["Login", "Menú"] })]);
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const pi = piel();
    await s.turno("arregla la pantalla", { ...pi.p, consulta: (c) => void consultas.push(c) });
    expect(consultas).toEqual([{ pregunta: "¿Qué pantalla toco?", opciones: ["Login", "Menú"] }]);
    // El texto sigue saliendo: es lo que ven el terminal y la TUI.
    expect(pi.tokens.join("")).toMatch(/1\. Login/);

    const sin: unknown[] = [];
    const otro = modelosConGuion([preguntar({ question: "¿Algo más?" })]);
    const s2 = await abrirSesionTrueforge({ raiz: proyecto(), modelos: otro.m, entorno: ENTORNO, skills: CATALOGO });
    await s2.turno("hola", { ...piel().p, consulta: (c) => void sin.push(c) });
    expect(sin).toEqual([]);
  }, 30_000);
});

describe("el encargo de una pregunta, contra el que se juzga y se repara", () => {
  const preguntar = (id: string, question: string) => [
    new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: "ask_user_question", args: JSON.stringify({ question, options: ["A", "B"] }) }] }),
  ];
  type Caso = { objetivo: string; respuesta: string; hechos: HechosDelTurno };

  it("dos preguntas ENCADENADAS: el objetivo lleva el encargo una vez y solo la ÚLTIMA pregunta", async () => {
    const casos: Caso[] = [];
    const { m } = modelosConGuion([preguntar("q1", "¿Primera?"), preguntar("q2", "¿Segunda?"), [new AIMessageChunk({ content: "Hecho." })]]);
    const s = await abrirSesionTrueforge({
      raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO,
      juezDelTurno: async (c) => (casos.push(c), { cumplimiento: "cumplido", motivo: "ok" }),
    });
    await s.turno("arregla la pantalla", piel().p);
    await s.turno("1", piel().p);
    await s.turno("2", piel().p);
    expect(casos).toHaveLength(1);
    const objetivo = casos[0]!.objetivo;
    expect(objetivo.startsWith("arregla la pantalla\n\n[")).toBe(true);
    expect(objetivo.match(/En un turno anterior/g)).toHaveLength(1);
    expect(objetivo).toContain("«¿Segunda?»");
    expect(objetivo).toContain("«B»");
    expect(objetivo).not.toContain("¿Primera?");
  }, 30_000);

  it("tras CERRAR y REABRIR, la respuesta se sigue juzgando contra el encargo: viaja en la foto", async () => {
    const raiz = proyecto();
    const casos: Caso[] = [];
    const abrir = (m: ModelosPort) =>
      abrirSesionReal({
        raiz, modelos: m, skills: { catalogo: () => [], cargar: async () => [] } as never, entorno: ENTORNO, motor: "trueforge", hilo: "s-encargo",
        juezDelTurno: async (c) => (casos.push(c), { cumplimiento: "cumplido", motivo: "ok" }),
      });
    const primera = await abrir(modelosConGuion([preguntar("q1", "¿Cuál?")]).m);
    await primera.turno("arregla la pantalla", piel().p);
    primera.cerrar();
    const segunda = await abrir(modelosConGuion([[new AIMessageChunk({ content: "Vale." })]]).m);
    await segunda.turno("2", piel().p);
    expect(casos).toHaveLength(1);
    expect(casos[0]!.objetivo.startsWith("arregla la pantalla")).toBe(true);
  }, 30_000);
});

describe("Claude Code, Codex y OpenCode como hijos de TrueForge", () => {
  type Compuestas = ReturnType<typeof import("../../subagentes/escrituraExterna.js").opcionesDeSubagenteExterno>;
  /** Un proyecto con un especialista EXTERNO en su `.md`, como los escribe una persona. */
  const conExterno = (motor = "codex", soloLectura = false) => {
    const raiz = proyecto();
    mkdirSync(join(raiz, ".xonecode", "agentes"), { recursive: true });
    writeFileSync(
      join(raiz, ".xonecode", "agentes", "refactor-ext.md"),
      `---\ndescripcion: Refactoriza con otro producto\nmotor: ${motor}\nmodelo: gpt-5.6-sol\nsoloLectura: ${soloLectura}\nskills: [xone-development]\n---\nTrabaja solo dentro del proyecto y explica los cambios.\n`
    );
    return raiz;
  };
  /** La fábrica de mentira: captura lo que la sesión COMPONE y deja guionizar `correr`. */
  const fabrica = (disponibles: string[], correr: (p: PeticionExterna, c: Compuestas) => Promise<string>) => {
    const peticiones: PeticionExterna[] = [];
    let compuestas: Compuestas | undefined;
    return {
      peticiones,
      compuestas: () => compuestas!,
      subagenteExterno: (o: Compuestas) => {
        compuestas = o;
        return {
          disponible: async (m: string) => disponibles.includes(m),
          correr: async (p: PeticionExterna) => (peticiones.push(p), correr(p, o)),
        };
      },
    };
  };
  const delegar = () => [
    new AIMessageChunk({
      content: "",
      tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "refactor-ext", input: "refactoriza el menú" }) }],
    }),
  ];

  it("aparece en el prompt del orquestador SOLO si su motor está disponible", async () => {
    const con = modelosConGuion([[new AIMessageChunk({ content: "ok" })]]);
    await (await abrirSesionTrueforge({ raiz: conExterno(), modelos: con.m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: fabrica(["codex"], async () => "").subagenteExterno })).turno("hola", piel().p);
    expect(con.vistos[0]!.join("\n")).toContain("refactor-ext");
    const sin = modelosConGuion([[new AIMessageChunk({ content: "ok" })]]);
    await (await abrirSesionTrueforge({ raiz: conExterno(), modelos: sin.m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: fabrica([], async () => "").subagenteExterno })).turno("hola", piel().p);
    expect(sin.vistos[0]!.join("\n")).not.toContain("refactor-ext");
  }, 30_000);

  it("se delega por el nombre del `.md`: la petición es la de deepagents y la respuesta vuelve al orquestador", async () => {
    const raiz = conExterno();
    const f = fabrica(["codex"], async () => "hecho por codex");
    const { m, vistos } = modelosConGuion([delegar(), [new AIMessageChunk({ content: "Listo." })]]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: f.subagenteExterno });
    const pi = piel();
    await s.turno("refactoriza", pi.p);
    expect(f.peticiones).toHaveLength(1);
    const p = f.peticiones[0]!;
    expect(p).toMatchObject({ motor: "codex", cwd: raiz, tarea: "refactoriza el menú", modelo: "gpt-5.6-sol", permitirEscritura: true, agente: "refactor-ext" });
    expect(p.instrucciones).toContain("Trabaja solo dentro del proyecto");
    // El inventario del proyecto, que un hijo externo no puede sacar solo.
    expect(p.instrucciones).toContain("/app.xml");
    // Y la cancelación del turno, para que Parar lo mate.
    expect(p.senal).toBeInstanceOf(AbortSignal);
    expect(vistos[1]!.join("\n")).toContain("hecho por codex");
    expect(pi.tokens.join("")).toBe("Listo.");
    // Su «llamada» no es una llamada de NUESTRO modelo: solo cuentan las dos del orquestador.
    expect(s.tracker.calls).toBe(2);
  }, 30_000);

  it("solo lectura en el `.md` es `permitirEscritura: false`", async () => {
    const f = fabrica(["claude-code"], async () => "leído");
    const { m } = modelosConGuion([delegar(), [new AIMessageChunk({ content: "Listo." })]]);
    const s = await abrirSesionTrueforge({ raiz: conExterno("claude-code", true), modelos: m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: f.subagenteExterno });
    await s.turno("mira", piel().p);
    expect(f.peticiones[0]).toMatchObject({ motor: "claude-code", permitirEscritura: false });
  }, 30_000);

  it("lo que hace MIENTRAS trabaja se ve, y sus tokens van a `externo`, nunca a `modelo`", async () => {
    const f = fabrica(["codex"], async (p, c) => {
      c.alUsarTool({ nombre: "read_file", detalle: "/menu.xne", agente: p.agente });
      c.alRazonar("mirando el menú");
      c.alConsumir?.({ motor: "codex", entrada: 900, salida: 40, cache: 300 });
      await new Promise((r) => setTimeout(r, 20));
      return "hecho";
    });
    const { m } = modelosConGuion([delegar(), [new AIMessageChunk({ content: "Listo." })]]);
    const s = await abrirSesionTrueforge({ raiz: conExterno(), modelos: m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: f.subagenteExterno });
    const lineas: string[] = [];
    const detalles: DetalleDeLinea[] = [];
    await s.turno("refactoriza", { ...piel().p, linea: (t, d) => void (lineas.push(t), detalles.push(d ?? {})) });
    expect(lineas.join("\n")).toContain("/menu.xne");
    // Y dice de QUIÉN es: el nombre del `.md` del hijo, no el de su motor.
    expect(detalles[lineas.findIndex((l) => l.includes("/menu.xne"))]).toEqual({
      nombre: "read_file",
      origen: { rol: "especialista", nombre: "refactor-ext" },
    });
    expect(s.consumo().externo).toEqual({ entrada: 900, salida: 40, cache: 300 });
    expect(s.consumo().modelo.entrada).toBeLessThan(900);
  }, 30_000);

  it("la política es la de la sesión: sin `pedirAprobacion` no escribe; en autónomo aplica y el aviso nombra las rutas", async () => {
    const sinPolitica = fabrica(["codex"], async () => "");
    await abrirSesionTrueforge({ raiz: conExterno(), modelos: modelos(), entorno: ENTORNO, skills: CATALOGO, subagenteExterno: sinPolitica.subagenteExterno });
    expect(sinPolitica.compuestas().aprobarEscritura).toBeUndefined();

    let concedida: boolean | undefined;
    const f = fabrica(["codex"], async (_p, c) => {
      concedida = await c.aprobarEscritura!([{ agente: "refactor-ext", ruta: "menu.xne", lineas: [] }]);
      return "escrito";
    });
    const { m } = modelosConGuion([delegar(), [new AIMessageChunk({ content: "Listo." })]]);
    const s = await abrirSesionTrueforge({
      raiz: conExterno(), modelos: m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: f.subagenteExterno,
      pedirAprobacion: async () => {
        throw new Error("en autónomo no se pregunta");
      },
      sinAprobacion: () => true,
    });
    const lineas: string[] = [];
    await s.turno("refactoriza", { ...piel().p, linea: (t) => void lineas.push(t) });
    expect(concedida).toBe(true);
    expect(lineas.join("\n")).toMatch(/escritura\(s\) aplicadas SIN aprobación: menu\.xne/);
  }, 30_000);

  it("en SUPERVISADO la escritura del hijo pasa por la aprobación con su diff, y un NO es un no", async () => {
    let vistaLaEscritura = false;
    let concedida: boolean | undefined;
    const f = fabrica(["codex"], async (_p, c) => {
      concedida = await c.aprobarEscritura!([{ agente: "refactor-ext", ruta: "menu.xne", lineas: [{ tipo: "anadido", texto: "<boton/>" }] as never }]);
      return "intentado";
    });
    const { m } = modelosConGuion([delegar(), [new AIMessageChunk({ content: "Listo." })]]);
    const s = await abrirSesionTrueforge({
      raiz: conExterno(), modelos: m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: f.subagenteExterno,
      pedirAprobacion: async (pendientes, _ficheros, diffs) => {
        vistaLaEscritura = pendientes.length === 1 && [...diffs.values()].flat().length > 0;
        return new Map(pendientes.map((p) => [p.id, { type: "reject" as const }]));
      },
    });
    await s.turno("refactoriza", piel().p);
    expect(vistaLaEscritura).toBe(true);
    expect(concedida).toBe(false);
  }, 30_000);

  it("un motor que FALLA no tumba el turno: el orquestador lee que falló", async () => {
    const f = fabrica(["codex"], async () => {
      throw new Error("codex no terminó en 10 minutos");
    });
    const { m, vistos } = modelosConGuion([delegar(), [new AIMessageChunk({ content: "Lo intento de otra forma." })]]);
    const s = await abrirSesionTrueforge({ raiz: conExterno(), modelos: m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: f.subagenteExterno });
    const pi = piel();
    await s.turno("refactoriza", pi.p);
    expect(vistos[1]!.join("\n")).toMatch(/no terminó su encargo: codex no terminó en 10 minutos/);
    expect(pi.tokens.join("")).toBe("Lo intento de otra forma.");
  }, 30_000);

  it("el verificador VE lo que el hijo escribió en el disco", async () => {
    const raiz = conExterno();
    const f = fabrica(["codex"], async () => (writeFileSync(join(raiz, "menu.xne"), "<coll/>\n"), "escrito"));
    const { m } = modelosConGuion([delegar(), [new AIMessageChunk({ content: "Listo." })]]);
    let verificaciones = 0;
    const s = await abrirSesionTrueforge({
      raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: f.subagenteExterno,
      verifier: { verificar: async () => (verificaciones++, { hallazgos: [], ok: true }) as never },
    });
    const r = await s.turno("refactoriza", piel().p);
    expect(verificaciones).toBe(1);
    expect(r.verificador).toBe("verde");
  }, 30_000);

  it("CANCELAR aborta la señal que recibió el hijo, y el turno se cierra", async () => {
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    let abortada = false;
    const f = fabrica(["codex"], (p) => {
      setTimeout(() => s!.cancelar(), 10);
      return new Promise<string>((_ok, mal) =>
        p.senal!.addEventListener("abort", () => {
          abortada = true;
          mal(new Error("matado"));
        })
      );
    });
    const { m } = modelosConGuion([delegar(), [new AIMessageChunk({ content: "Sigo aquí." })]]);
    s = await abrirSesionTrueforge({ raiz: conExterno(), modelos: m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: f.subagenteExterno });
    const pi = piel();
    await s.turno("refactoriza", pi.p);
    expect(abortada).toBe(true);
    expect(pi.tokens.join("")).not.toContain("Sigo aquí.");
    // Y la sesión no queda atascada con el `create_sub_agent` sin respuesta: el siguiente turno corre.
    const otro = piel();
    await s.turno("otra cosa", otro.p);
    expect(otro.tokens.join("")).toBe("Sigo aquí.");
  }, 30_000);

  it("`/nuevo` reinicia las DOS cuentas: lo de la conversación de antes no es de ésta", async () => {
    const f = fabrica(["codex"], async (_p, c) => (c.alConsumir?.({ motor: "codex", entrada: 900, salida: 40, cache: 300 }), "hecho"));
    const { m } = modelosConGuion([delegar(), [new AIMessageChunk({ content: "Listo.", usage_metadata: { input_tokens: 70, output_tokens: 2, total_tokens: 72 } })]]);
    const s = await abrirSesionTrueforge({ raiz: conExterno(), modelos: m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: f.subagenteExterno });
    await s.turno("refactoriza", piel().p);
    expect(s.consumo().externo.entrada).toBe(900);
    expect(s.consumo().modelo.entrada).toBeGreaterThan(0);
    s.nuevoHilo();
    expect(s.consumo()).toEqual({ modelo: { entrada: 0, salida: 0, cache: 0 }, externo: { entrada: 0, salida: 0, cache: 0 }, contexto: 0 });
  }, 30_000);

  it("REABRIR continúa con la respuesta del hijo en la conversación, sin ningún proceso que resucitar", async () => {
    const raiz = conExterno();
    const abrir = (m: ModelosPort, f: ReturnType<typeof fabrica>) =>
      abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: f.subagenteExterno, hilo: "s-externo" });
    const f1 = fabrica(["codex"], async () => "hecho por codex");
    const primera = await abrir(modelosConGuion([delegar(), [new AIMessageChunk({ content: "Listo." })]]).m, f1);
    await primera.turno("refactoriza", piel().p);
    primera.cerrar();
    const f2 = fabrica(["codex"], async () => "no se llama");
    const { m, vistos } = modelosConGuion([[new AIMessageChunk({ content: "Sigo." })]]);
    const segunda = await abrir(m, f2);
    await segunda.turno("¿qué hizo?", piel().p);
    expect(vistos[0]!.join("\n")).toContain("hecho por codex");
    expect(f2.peticiones).toHaveLength(0);
  }, 30_000);
});

describe("el contraste con las métricas PROPIAS de TrueForge, en la traza", () => {
  type Contraste = Parameters<NonNullable<import("../../turno/diagnosticoDeTools.js").DiagnosticoDeTools["contraste"]>>[0];
  const conTraza = () => {
    const vistos: Contraste[] = [];
    return { vistos, diagnostico: { modelo: () => {}, herramienta: () => {}, contraste: (c: Contraste) => void vistos.push(c) } };
  };

  it("una delegación con escritura: las dos cuentas COINCIDEN, y es del turno y no de la sesión", async () => {
    const t = conTraza();
    const guion = () => guionDeEscritura();
    const { m } = modelosConGuion([...guion(), ...guion()]);
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true, diagnostico: t.diagnostico });
    await s.turno("escribe una nota", piel().p);
    await s.turno("otra vez", piel().p);
    expect(t.vistos).toHaveLength(2);
    for (const c of t.vistos) {
      expect(c.diferencias).toEqual([]);
      expect(c.nuestras).toEqual({ entrada: 150, salida: 16, cache: 0, llamadas: 4 });
      expect(c.motor).toMatchObject({ entrada: 150, salida: 16, iteraciones: 4, subagentes: 1 });
    }
  }, 30_000);

  it("con la compactación del raíz por medio", async () => {
    const t = conTraza();
    const { m } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "n1", name: "ls", args: JSON.stringify({ path: "/" }) }], usage_metadata: { input_tokens: 40_000, output_tokens: 10, total_tokens: 40_010 } })],
      [new AIMessageChunk({ content: "RESUMEN", usage_metadata: { input_tokens: 900, output_tokens: 50, total_tokens: 950 } })],
      [new AIMessageChunk({ content: "Listo.", usage_metadata: { input_tokens: 1_000, output_tokens: 2, total_tokens: 1_002 } })],
    ]);
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO, diagnostico: t.diagnostico });
    await s.turno("mira la raíz", piel().p);
    expect(t.vistos[0]!.motor).toMatchObject({ entrada: 41_900, salida: 62, iteraciones: 2, resumenes: 1 });
    expect(t.vistos[0]!.nuestras.llamadas).toBe(3);
    expect(t.vistos[0]!.diferencias).toEqual([]);
  }, 30_000);

  it("con un hijo EXTERNO: su iteración se descuenta y no hay diferencia", async () => {
    const t = conTraza();
    const raiz = proyecto();
    mkdirSync(join(raiz, ".xonecode", "agentes"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "agentes", "ext.md"), "---\ndescripcion: externo\nmotor: codex\nsoloLectura: true\n---\nhola\n");
    const { m } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "ext", input: "mira" }) }], usage_metadata: { input_tokens: 50, output_tokens: 9, total_tokens: 59 } })],
      [new AIMessageChunk({ content: "Listo.", usage_metadata: { input_tokens: 70, output_tokens: 2, total_tokens: 72 } })],
      [new AIMessageChunk({ content: "Sin delegar.", usage_metadata: { input_tokens: 90, output_tokens: 3, total_tokens: 93 } })],
    ]);
    const s = await abrirSesionTrueforge({
      raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, diagnostico: t.diagnostico,
      subagenteExterno: () => ({ disponible: async () => true, correr: async () => "visto" }),
    });
    await s.turno("mira", piel().p);
    expect(t.vistos[0]).toMatchObject({ externos: 1, nuestras: { llamadas: 2 }, motor: { iteraciones: 3 }, diferencias: [] });
    // El recuento es del TURNO: el siguiente, sin delegar, no arrastra el hijo del anterior.
    await s.turno("y ahora sin delegar", piel().p);
    expect(t.vistos[1]).toMatchObject({ externos: 0, nuestras: { llamadas: 1 }, motor: { iteraciones: 1 }, diferencias: [] });
  }, 30_000);
});

describe("los clientes de modelo duran la sesión, y `/modelo` los renueva", () => {
  it("un cliente por papel en toda la sesión; tras `cambiarModelos`, el del modelo nuevo", async () => {
    const contar = (guion: AIMessageChunk[][]) => {
      const g = modelosConGuion(guion);
      let construidos = 0;
      const base = g.m as unknown as { paraPapel: (...a: unknown[]) => unknown };
      const m = { ...base, paraPapel: (...a: unknown[]) => (construidos++, base.paraPapel(...a)) } as unknown as ModelosPort;
      return { m, vistos: g.vistos, construidos: () => construidos };
    };
    const a = contar([[new AIMessageChunk({ content: "uno" })], [new AIMessageChunk({ content: "dos" })]]);
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: a.m, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("hola", piel().p);
    await s.turno("otra", piel().p);
    // Dos llamadas del orquestador, UN cliente: su memoria de eco es la de toda la conversación.
    expect(a.construidos()).toBe(1);
    const b = contar([[new AIMessageChunk({ content: "del nuevo" })]]);
    await s.cambiarModelos(b.m);
    const pi = piel();
    await s.turno("y ahora", pi.p);
    expect(b.construidos()).toBe(1);
    expect(pi.tokens.join("")).toBe("del nuevo");
  }, 30_000);
});

describe("unir_secciones en TrueForge, con el reparto de deepagents", () => {
  it("el especialista con `escribeEn` la recibe; uno sin él, no", async () => {
    const raiz = proyecto();
    mkdirSync(join(raiz, ".xonecode", "agentes"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "agentes", "doc-a.md"), "---\ndescripcion: documenta\nmotor: modelo\nsoloLectura: false\nescribeEn: [/doc/]\n---\nhola\n");
    writeFileSync(join(raiz, ".xonecode", "agentes", "doc-b.md"), "---\ndescripcion: escribe\nmotor: modelo\nsoloLectura: false\n---\nhola\n");
    const delegar = (nombre: string) => [
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: `d-${nombre}`, name: "create_sub_agent", args: JSON.stringify({ name: nombre, input: "x" }) }] }),
    ];
    const { m, toolsPorLlamada } = modelosConGuion([delegar("doc-a"), [new AIMessageChunk({ content: "a" })], [new AIMessageChunk({ content: "ok" })], delegar("doc-b"), [new AIMessageChunk({ content: "b" })], [new AIMessageChunk({ content: "ok" })]]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("uno", piel().p);
    await s.turno("otro", piel().p);
    expect(toolsPorLlamada[1]).toContain("unir_secciones");
    expect(toolsPorLlamada[4]).not.toContain("unir_secciones");
  }, 30_000);
});
