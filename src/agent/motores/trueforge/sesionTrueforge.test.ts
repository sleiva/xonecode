import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessageChunk } from "@langchain/core/messages";
import type { Piel } from "../../../core/turno.js";
import type { ModelosPort } from "../../../core/ports.js";
import { abrirSesionTrueforge } from "./sesionTrueforge.js";
import { abrirSesionReal } from "../../turno/turnoReal.js";
import { resumirTraza } from "../../turno/informeDeTraza.js";

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
  }, 30_000);
});
