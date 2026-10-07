import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessageChunk } from "@langchain/core/messages";
import { PNG } from "pngjs";
import type { Piel } from "../../../core/turno.js";
import type { DetalleDeLinea } from "../../../core/actos.js";
import type { ModelosPort, PeticionExterna } from "../../../core/ports.js";
import { ConectoresEnMemoria } from "../../../core/ports.js";
import { TOPE_DE_LLAMADA_MS } from "../../../core/conectores.js";
import { abrirSesionTrueforge, LIMITE_DE_LLAMADAS_DEL_RAIZ, notaDeDelegacion, textoDelBucle } from "./sesionTrueforge.js";
import { TOPE_DE_LLAMADAS_DEL_ESPECIALISTA } from "../../turno/resumenDeContexto.js";
import { topeAgotadoDe, traducirEvento } from "./eventosTrueforge.js";
import { cargarMemoria, interpretarFoto, rutaDeMemoria } from "./memoriaTrueforge.js";
import { RESUMEN_DE_RELLENO, textoDeDetencionParaHijo, textoDeDetencionParaRaiz } from "./detencion.js";
import { textoDeNota, textoDeNotaParaHijo, textoDeNotaYaEntregada } from "./notas.js";
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
 *
 * `alLlamar`, si se pasa, corre justo tras registrar la llamada N-ésima (1-indexado) y ANTES de
 * devolver la respuesta guionizada. Existe por una medida (Task 5, IXCODE-4): el mock resuelve
 * `stream` enteramente en microtareas —sin fs real ni red—, así que un `setTimeout(fn, 0)` en el
 * test nunca alcanza a interponerse entre dos llamadas contiguas cuando no hay una de verdad
 * (una tool de disco, un `setTimeout` real) en medio. Empujar desde AQUÍ, en cambio, ocurre
 * justo después de que el `preLLMProcessor` de esa llamada ya haya leído sus notas pendientes,
 * así que la siguiente sí las recogerá.
 */
function modelosConGuion(guiones: AIMessageChunk[][], alLlamar?: (n: number) => void) {
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
      alLlamar?.(vistos.length);
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

/** Un PNG oscuro con un bloque claro entre `desde` y `hasta` (fracciones del alto): una «pantalla» que medir. */
function pngConBloque(desde: number, hasta: number, ancho = 108, alto = 240): Buffer {
  const png = new PNG({ width: ancho, height: alto });
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const claro = y >= desde * alto && y < hasta * alto && x > ancho * 0.1 && x < ancho * 0.9;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = claro ? 230 : 20;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
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

  it("un .xne Latin-1: el hijo lo edita por un ancla CON tilde, la tarjeta enseña el diff real y el disco sigue en windows-1252", async () => {
    // De punta a punta por la composición de producción: el backend lee el Latin-1 con sus tildes,
    // la tarjeta de aprobación lee el ANTES con la misma codificación, y la escritura vuelve en
    // windows-1252. Con el ANTES en UTF-8, el ancla «Tamaño» no calzaba y la tarjeta enseñaba solo
    // las dos piezas sueltas.
    const raiz = proyecto();
    const enLatin1 = (t: string) => Buffer.from([...t].map((c) => (c === "€" ? 0x80 : c.charCodeAt(0))));
    writeFileSync(join(raiz, "Datos.xne"), enLatin1('<coll name="Tamaño" title="€">\n<prop name="uno"/>\n</coll>\n'));
    const { m } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "renombra" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "e1", name: "edit_file", args: JSON.stringify({ file_path: "/Datos.xne", old_string: 'name="Tamaño"', new_string: 'name="Año"' }) }] })],
      [new AIMessageChunk({ content: "Hecho." })],
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    const vistas: { tipo: string; texto: string }[][] = [];
    const s = await abrirSesionTrueforge({
      raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO,
      pedirAprobacion: async (pendientes, _f, diffs) => {
        for (const p of pendientes) vistas.push(diffs?.get(p.id) ?? []);
        return new Map(pendientes.map((p) => [p.id, { type: "approve" as const }]));
      },
    });
    await s.turno("renombra la colección", piel().p);
    expect(vistas[0]).toEqual([
      { tipo: "quitado", texto: '<coll name="Tamaño" title="€">' },
      { tipo: "anadido", texto: '<coll name="Año" title="€">' },
      { tipo: "igual", texto: '<prop name="uno"/>' },
      { tipo: "igual", texto: "</coll>" },
    ]);
    expect(readFileSync(join(raiz, "Datos.xne")).equals(enLatin1('<coll name="Año" title="€">\n<prop name="uno"/>\n</coll>\n'))).toBe(true);
  }, 20_000);

  it("al terminar el hijo, el ORQUESTADOR recibe lo que escribió contado por el harness, no solo su informe", async () => {
    const { m, vistos } = modelosConGuion(guionDeEscritura());
    const s = await abrirSesionTrueforge({
      raiz: proyecto(),
      modelos: m,
      entorno: ENTORNO,
      skills: CATALOGO,
      pedirAprobacion: async (ps) => new Map(ps.map((p) => [p.id, { type: "approve" as const }])),
    });
    await s.turno("escribe una nota", piel().p);
    // La cuarta llamada es la del orquestador tras volver el hijo: lleva el informe del harness, con la escritura
    // aprobada en OTRO paso (la respuesta de una aprobada no llega en el paso que la pidió).
    const tras = vistos[3]!.join("\n");
    expect(tras).toContain("Lo que ESCRIBIÓ developer-xone");
    expect(tras).toContain("- /nota.txt: nuevo, +1 −0 líneas");
    expect(tras).not.toContain("hola");
    // Y el hijo no lo recibe de sí mismo.
    expect(vistos[2]!.join("\n")).not.toContain("Lo que ESCRIBIÓ");
  }, 20_000);

  it("un hijo que intenta REESCRIBIR un .xne existente lo tiene rechazado, el disco queda igual y el orquestador lo sabe", async () => {
    const raiz = proyecto();
    writeFileSync(join(raiz, "Menu.xne"), "<coll name=\"Menu\"/>\n");
    const { m, vistos } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "rehaz el menú" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "w1", name: "write_file", args: JSON.stringify({ file_path: "/Menu.xne", content: "<coll/>\n" }) }] })],
      [new AIMessageChunk({ content: "No pude." })],
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    const s = await abrirSesionTrueforge({
      raiz,
      modelos: m,
      entorno: ENTORNO,
      skills: CATALOGO,
      pedirAprobacion: async (ps) => new Map(ps.map((p) => [p.id, { type: "approve" as const }])),
    });
    await s.turno("rehaz el menú", piel().p);
    expect(readFileSync(join(raiz, "Menu.xne"), "utf8")).toBe("<coll name=\"Menu\"/>\n");
    expect(vistos[2]!.join("\n")).toContain("Cámbialo con edit_file");
    expect(vistos[3]!.join("\n")).toContain("developer-xone ha terminado su encargo SIN escribir ningún fichero");
  }, 20_000);

  it("cuando vuelve el conductor con una captura, quien lo llamó recibe la MEDIDA contra la maqueta hecha por el harness", async () => {
    const raiz = proyecto();
    mkdirSync(join(raiz, "diseno"));
    writeFileSync(join(raiz, "diseno", "screen.png"), pngConBloque(0.1, 0.9));
    const fuera = mkdtempSync(join(tmpdir(), "xc-cap-"));
    writeFileSync(join(fuera, "cap.png"), pngConBloque(0.1, 0.5));
    const artefactos = mkdtempSync(join(tmpdir(), "xc-art-"));
    const { m, vistos } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "device-controller", input: "captura la pantalla" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "x1", name: "execute", args: JSON.stringify({ command: `cp '${join(fuera, "cap.png")}' "$XONECODE_ARTEFACTOS/cap.png"` }) }] })],
      [new AIMessageChunk({ content: "Capturada." })],
      [new AIMessageChunk({ content: "Hecho." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, artefactos });
    await s.turno("mira la pantalla", piel().p);
    const tras = vistos[3]!.join("\n");
    expect(tras).toContain("Medida AUTOMÁTICA de la última captura que dejó device-controller (/artefactos/cap.png) contra la maqueta /diseno/screen.png");
    expect(tras).toContain("NO cumple el criterio");
    // Nadie pasó el crítico: se le recuerda.
    expect(tras).toContain("pásala con pantalla=/artefactos/cap.png");
  }, 30_000);

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

  it("con puedeProponerTareas el raíz propone el reparto y la piel lo recibe; un hijo nunca tiene la tool", async () => {
    const propuesta = {
      motivo: "son dos ventanas",
      tareas: [
        { titulo: "Ventana A", peticion: "Crea la ventana A", adjuntos: ["/adjuntos/a.png"] },
        { titulo: "Ventana B", peticion: "Crea la ventana B" },
      ],
    };
    const { m, toolsPorLlamada, vistos } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "p1", name: "proponer_tareas", args: JSON.stringify(propuesta) }] })],
      [new AIMessageChunk({ content: "Te propongo dos tareas." })],
    ]);
    // En modo AUTÓNOMO también: el modo gobierna las escrituras locales; encolar es de la persona.
    const s = await abrirSesionTrueforge({
      raiz: proyecto(),
      modelos: m,
      entorno: ENTORNO,
      skills: CATALOGO,
      puedeProponerTareas: true,
      sinAprobacion: () => true,
    });
    const recibidas: unknown[] = [];
    const { p } = piel();
    await s.turno("diseña dos ventanas", { ...p, propuestaDeTareas: (x) => void recibidas.push(x) });
    expect(toolsPorLlamada[0]).toContain("proponer_tareas");
    expect(vistos[0]![0]).toContain("REPARTIR UN ENCARGO GRANDE");
    expect(recibidas).toEqual([propuesta]);
    // Lo que el agente ve tras proponer: que no lo haga en este turno.
    expect(vistos[1]!.join("\n")).toContain("NO las hagas en este turno");
  }, 20_000);

  it("cuando un hijo deja un plan GRANDE, el harness le recuerda al raíz que puede repartirlo; solo si la sesión puede proponer", async () => {
    // Sesión real (Maset): con el plan de seis tareas ya escrito, el orquestador siguió preguntando sin volver sobre el
    // reparto. El recordatorio va en el informe del hijo, en código, justo cuando el plan existe.
    const PLAN = "# Plan\n\n## T1 — Datos\n\n- [ ] tabla\n\n## T2 — Pantalla\n\n- [ ] lista\n\n## T3 — Menú\n\n- [ ] tarjeta\n";
    const guion = () => [
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "c1", name: "create_sub_agent", args: JSON.stringify({ name: "consultant-xone", input: "planifica" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "e1", name: "write_file", args: JSON.stringify({ file_path: "/planes/menu/TASKS.md", content: PLAN }) }] })],
      [new AIMessageChunk({ content: "Plan escrito." })],
      [new AIMessageChunk({ content: "Hecho." })],
    ];
    const con = modelosConGuion(guion());
    const s1 = await abrirSesionTrueforge({ raiz: proyecto(), modelos: con.m, entorno: ENTORNO, skills: CATALOGO, puedeProponerTareas: true });
    await s1.turno("rediseña el menú y crea la pantalla", piel().p);
    const delRaiz = con.vistos[3]!.join("\n");
    expect(delRaiz).toContain("/planes/menu/TASKS.md (3 tareas)");
    expect(delRaiz).toContain("proponer_tareas");
    const sin = modelosConGuion(guion());
    const s2 = await abrirSesionTrueforge({ raiz: proyecto(), modelos: sin.m, entorno: ENTORNO, skills: CATALOGO });
    await s2.turno("rediseña el menú y crea la pantalla", piel().p);
    expect(sin.vistos[3]!.join("\n")).not.toContain("El plan que acaba de quedar escrito es grande");
  }, 30_000);

  it("sin puedeProponerTareas el raíz no tiene la tool ni su párrafo, y un hijo tampoco con ella", async () => {
    const sin = modelosConGuion([[new AIMessageChunk({ content: "Hola." })]]);
    const s1 = await abrirSesionTrueforge({ raiz: proyecto(), modelos: sin.m, entorno: ENTORNO, skills: CATALOGO });
    await s1.turno("hola", piel().p);
    expect(sin.toolsPorLlamada[0]).not.toContain("proponer_tareas");
    expect(sin.vistos[0]![0]).not.toContain("REPARTIR UN ENCARGO GRANDE");
    const con = modelosConGuion(guionDeEscritura());
    const s2 = await abrirSesionTrueforge({
      raiz: proyecto(),
      modelos: con.m,
      entorno: ENTORNO,
      skills: CATALOGO,
      puedeProponerTareas: true,
      pedirAprobacion: async (ps) => new Map(ps.map((x) => [x.id, { type: "approve" as const }])),
    });
    await s2.turno("escribe una nota", piel().p);
    expect(con.toolsPorLlamada[0]).toContain("proponer_tareas");
    expect(con.toolsPorLlamada[1]).not.toContain("proponer_tareas");
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
    // `xone_atributos` va a los dos, montada de verdad (la composición de la sesión, no la tool suelta).
    expect(toolsPorLlamada[0]).toContain("xone_atributos");
    expect(toolsPorLlamada[1]).toContain("xone_atributos");
    // El idioma de la SALIDA lo dicen el prompt del raíz y el del hijo, desde código: el del usuario, no uno fijo, y el
    // razonamiento libre. El raíz lo lee de su mensaje; el hijo, que no lo ve, sigue el de su encargo.
    expect(vistos[0]![0]).toContain("IDIOMA: contesta en el idioma en que te escribe el usuario");
    expect(vistos[1]![0]).toContain("IDIOMA: lo que devuelves y lo que entregas");
    expect(vistos[0]![0]).not.toContain("SIEMPRE en español");
    // Al desarrollador no se le cuenta la maquinaria: lo dice el raíz, que es quien le habla; el hijo no lo necesita.
    expect(vistos[0]![0]).toContain("CON QUIÉN HABLAS");
    expect(vistos[1]![0]).not.toContain("CON QUIÉN HABLAS");
    // Y el hijo sabe CUÁNDO usarla: junto a su lista de tools, en su prompt de sistema.
    expect(vistos[1]![0]).toContain("pregunta PRIMERO a `xone_atributos`");
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

  it("agotado el tope de rondas, el resultado dice CUÁL (topeAgotado) para que el motivo sea verdad; sin aprobador, no", async () => {
    const raiz = proyecto();
    const s = await abrirSesionTrueforge({
      raiz,
      modelos: modelos(),
      entorno: ENTORNO,
      skills: CATALOGO,
      topeDeRondas: 0,
      pedirAprobacion: async (ps) => new Map(ps.map((p) => [p.id, { type: "approve" as const }])),
    });
    const r = await s.turno("escribe una nota", piel().p);
    expect(r).toMatchObject({ pendientes: 1, topeAgotado: 0, motivoSinVerificar: "se agotó el tope de 0 rondas de escritura" });
    const sinNadie = await (await abrirSesionTrueforge({ raiz: proyecto(), modelos: modelos(), entorno: ENTORNO, skills: CATALOGO })).turno("escribe una nota", piel().p);
    expect(sinNadie.topeAgotado).toBeUndefined();
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
    expect(toolsPorLlamada[1]).toEqual(expect.arrayContaining(["xone_navegacion", "regex_search", "validar_fichero_xone"]));
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

  it("el ORQUESTADOR lleva `validar_fichero_xone` y contesta desde el proyecto de VERDAD: bien formado, o la línea del fallo", async () => {
    const raiz = proyecto();
    writeFileSync(join(raiz, "Roto.xne"), '<coll name="Roto">\n  <prop visible name="A"/>\n</coll>\n');
    const { m, vistos, toolsPorLlamada } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "v1", name: "validar_fichero_xone", args: JSON.stringify({ path: "/app.xml" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "v2", name: "validar_fichero_xone", args: JSON.stringify({ path: "/Roto.xne" }) }] })],
      [new AIMessageChunk({ content: "app.xml está bien; Roto.xne no." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("¿está bien formado?", piel().p);
    expect(toolsPorLlamada[0]).toContain("validar_fichero_xone");
    expect(vistos[1]!.join("\n")).toContain("/app.xml está bien.");
    expect(vistos[2]!.join("\n")).toContain("/Roto.xne:2:17: al atributo «visible» le falta el «=» y su valor");
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
    // Qué pensamiento pidió quien construyó el cliente de CADA llamada: la de resumir va sin pensar.
    const pensamientoDeLlamada: (string | undefined)[] = [];
    const conPensamiento = {
      ...m,
      paraPapel: (papel: string, esfuerzo?: string, clase?: string, pensamiento?: string) => {
        const base = (m.paraPapel as (...a: unknown[]) => { stream: (x: unknown) => unknown; bindTools: (t: unknown) => unknown })(papel, esfuerzo, clase, pensamiento);
        const propio = {
          bindTools: (t: unknown) => (base.bindTools(t), propio),
          stream: (x: unknown) => (pensamientoDeLlamada.push(pensamiento), base.stream(x)),
        };
        return propio;
      },
    } as unknown as ModelosPort;
    const s = await abrirSesionTrueforge({ raiz, modelos: conPensamiento, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("mira la raíz", piel().p);
    expect(pensamientoDeLlamada).toEqual([undefined, "apagado", undefined]);
    expect(vistos[1]!.join("\n")).toMatch(/summary of the conversation/);
    expect(vistos[2]!.join("\n")).toContain("RESUMEN-DE-LA-CONVERSACION");
    // Las tres llamadas pagan, la del resumen incluida; la ventana es la de la ÚLTIMA normal.
    expect(s.consumo().modelo).toMatchObject({ entrada: 41_900, salida: 62 });
    expect(s.consumo().contexto).toBe(1_000);
  }, 30_000);

  it("con un modelo de ventana GRANDE (DeepSeek) el raíz NO se compacta a 40.000: el umbral sale de su ventana", async () => {
    const raiz = proyecto();
    const { m, vistos } = modelosConGuion([
      [
        new AIMessageChunk({
          content: "",
          tool_call_chunks: [{ index: 0, id: "n1", name: "ls", args: JSON.stringify({ path: "/" }) }],
          usage_metadata: { input_tokens: 40_000, output_tokens: 10, total_tokens: 40_010 },
        }),
      ],
      [new AIMessageChunk({ content: "Listo.", usage_metadata: { input_tokens: 41_000, output_tokens: 2, total_tokens: 41_002 } })],
    ]);
    const conVentana = { ...m, idDePapel: () => "deepseek/deepseek-flash" } as unknown as ModelosPort;
    const s = await abrirSesionTrueforge({ raiz, modelos: conVentana, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("mira la raíz", piel().p);
    // Dos llamadas y ninguna de resumen: con un millón de ventana el umbral es 128.000.
    expect(vistos).toHaveLength(2);
    expect(vistos.join("\n")).not.toMatch(/summary of the conversation/);
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

  /**
   * Un corte DURO (el proceso muere) no pasa por el `finally` del turno: lo único que queda es lo
   * que se guardó A MITAD. Medido en el incidente que lo motiva: un turno de 45 minutos se perdió
   * entero, mensaje de la persona incluido. Por eso el disco se mira DESDE DENTRO del turno —en la
   * llamada del desarrollador que sigue a su escritura—: mirarlo al acabar vería la foto del
   * `finally`, y aprobaría aunque a mitad no se guardara nada.
   */
  it("A MITAD de turno el disco ya tiene el mensaje, la delegación cerrada como INTERRUPCIÓN y lo que escribió el hijo", async () => {
    const raiz = proyecto();
    let aMitad: string | undefined;
    const { m } = modelosConGuion(guionDeEscritura(), (n) => {
      // La 3.ª llamada es la del desarrollador DESPUÉS de su `write_file`: el hijo sigue vivo.
      if (n === 3) aMitad = readFileSync(rutaDeMemoria(raiz, "sesion-a-mitad")!, "utf8");
    });
    const sesion = await abrirSesionReal({
      raiz,
      modelos: m,
      skills: { catalogo: () => [], cargar: async () => [] } as never,
      entorno: ENTORNO,
      motor: "trueforge",
      hilo: "sesion-a-mitad",
      pedirAprobacion: async (pendientes) => new Map(pendientes.map((p) => [p.id, { type: "approve" as const }])),
    });
    await sesion.turno("escribe una nota", piel().p);
    sesion.cerrar();

    expect(aMitad).toBeDefined();
    const foto = interpretarFoto(aMitad!);
    expect(foto.estado).toBe("ok");
    const contexto = (foto as { foto: { context: { role?: string; content?: unknown; tool_call_id?: string }[] } }).foto.context;
    expect(contexto.some((c) => c.role === "user" && String(c.content).includes("escribe una nota"))).toBe(true);
    const cierre = contexto.find((c) => c.role === "tool" && c.tool_call_id === "d1");
    expect(String(cierre?.content)).toMatch(/developer-xone se interrumpió/);
    expect(String(cierre?.content)).toMatch(/\/nota\.txt/);
    expect(String(cierre?.content)).not.toMatch(/vuelve a pedirlo/);
    // Y el turno que acaba bien PISA la de a mitad: lo de después es la conversación normal.
    expect(JSON.stringify(cargarMemoria(raiz, "sesion-a-mitad"))).not.toMatch(/se interrumpió/);
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

  it("la traza lleva el CHAT: el id de la sesión con que se abrió, el mismo del índice", async () => {
    const raiz = proyecto();
    try {
      await abrirSesionTrueforge({ raiz, modelos: modelos(), entorno: ENTORNO, skills: CATALOGO, depurar: true, hilo: "sesion-del-indice" });
      const [primera] = readFileSync(join(raiz, ".xonecode", "traza-tools.jsonl"), "utf8").trim().split("\n");
      expect(JSON.parse(primera!)).toMatchObject({ tipo: "sesion", chat: "sesion-del-indice" });
    } finally {
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

  describe("en modo autónomo, lo que el agente ya recomendó se contesta solo", () => {
    const pregunta = (id: string, question: string, options: string[]) =>
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: "ask_user_question", args: JSON.stringify({ question, options }) }] });

    it("con una recomendada: no llega a la persona, vuelve a su hilo y el turno sigue", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion([
        [pregunta("q1", "¿Qué alcance?", ["Básica", "Científica (Recommended)"])],
        [new AIMessageChunk({ content: "Hecho, científica." })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true });
      const uno = piel();
      await s.turno("haz la calculadora", uno.p);
      expect(vistos).toHaveLength(2);
      expect(vistos[1]!.join("\n")).toContain("Científica (Recommended)");
      expect(uno.tokens.join("")).toContain("Hecho, científica.");
      expect(uno.tokens.join("")).not.toContain("1. Básica");
    }, 30_000);

    it("en supervisado la pregunta llega a la persona, aunque lleve recomendada", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion([[pregunta("q1", "¿Qué alcance?", ["Básica", "Científica (Recommended)"])]]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
      const uno = piel();
      await s.turno("haz la calculadora", uno.p);
      expect(vistos).toHaveLength(1);
      expect(uno.tokens.join("")).toMatch(/1\. Básica/);
    }, 30_000);

    it("sin recomendada NO llega a la persona: vuelve al agente pidiéndole que decida él, y se dice en el chat", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion([
        [pregunta("q1", "¿Qué pantalla?", ["Login", "Menú"])],
        [new AIMessageChunk({ content: "Elegí el menú." })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true });
      const uno = piel();
      await s.turno("arregla", uno.p);
      expect(vistos).toHaveLength(2);
      expect(vistos[1]!.join("\n")).toContain("Modo autónomo: no hay nadie a quien preguntar");
      expect(uno.tokens.join("")).not.toMatch(/1\. Login/);
      expect(uno.lineas.join("\n")).toContain("«¿Qué pantalla?» no se pregunta; lo decide el agente");
    }, 30_000);

    it("DOS preguntas a la vez, una con recomendada y otra sin ella (MyAllXOne): se contestan las dos y el turno sigue", async () => {
      const raiz = proyecto();
      const dos = new AIMessageChunk({
        content: "",
        tool_call_chunks: [
          { index: 0, id: "q1", name: "ask_user_question", args: JSON.stringify({ question: "¿Alcance?", options: ["Todo (Recommended)", "Básica"] }) },
          { index: 1, id: "q2", name: "ask_user_question", args: JSON.stringify({ question: "¿Formato?", options: ["4,850.50", "4.850,50"] }) },
        ],
      });
      const { m, vistos } = modelosConGuion([[dos], [new AIMessageChunk({ content: "Todo, y formato español." })]]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true });
      const uno = piel();
      await s.turno("haz la calculadora", uno.p);
      expect(vistos).toHaveLength(2);
      const contexto = vistos[1]!.join("\n");
      expect(contexto).toContain("Todo (Recommended)");
      expect(contexto).toContain("Modo autónomo: no hay nadie a quien preguntar");
      expect(uno.tokens.join("")).toContain("Todo, y formato español.");
    }, 30_000);
  });

  describe("el bucle del desarrollador: quien escribe llama a quien prueba", () => {
    const delega = (id: string, nombre: string, input: string) =>
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: "create_sub_agent", args: JSON.stringify({ name: nombre, input }) }] });
    // raíz → developer-xone → (developer llama a) device-controller → vuelve → vuelve → raíz cierra.
    const guion = (quienLlama = "device-controller") => [
      [delega("d1", "developer-xone", "escribe la calculadora")],
      [delega("n1", quienLlama, "despliega y comprueba")],
      [new AIMessageChunk({ content: "Vi la app arrancar." })],
      [new AIMessageChunk({ content: "Escrito y comprobado." })],
      [new AIMessageChunk({ content: "Hecho." })],
    ];

    it("encendido, el desarrollador recibe `create_sub_agent` y el nieto trabaja y responde al desarrollador", async () => {
      const raiz = proyecto();
      const { m, vistos, toolsPorLlamada } = modelosConGuion(guion());
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, bucleDelDesarrollador: true });
      const r = piel();
      await s.turno("haz la calculadora", r.p);
      // El desarrollador (2ª llamada) ve la tool y el texto del bucle en su sistema.
      expect(toolsPorLlamada[1]).toContain("create_sub_agent");
      expect(vistos[1]!.join("\n")).toContain("PUEDES LLAMAR A: device-controller");
      // El nieto (3ª llamada) recibe el encargo del desarrollador y NO puede llamar a nadie.
      expect(vistos[2]!.join("\n")).toContain("despliega y comprueba");
      expect(toolsPorLlamada[2]).not.toContain("create_sub_agent");
      // Lo que vio el nieto llega al desarrollador, y el turno cierra con la respuesta del raíz.
      expect(vistos[3]!.join("\n")).toContain("Vi la app arrancar.");
      expect(r.tokens.join("")).toContain("Hecho.");
    }, 30_000);

    it("encendido y con carpeta de artefactos, el desarrollador recibe el crítico y la medida, y se lo dice; el conductor, no", async () => {
      const raiz = proyecto();
      const { m, vistos, toolsPorLlamada } = modelosConGuion(guion());
      const s = await abrirSesionTrueforge({
        raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, bucleDelDesarrollador: true,
        artefactos: mkdtempSync(join(tmpdir(), "xc-tf-bucle-")),
      });
      await s.turno("haz la calculadora", piel().p);
      expect(toolsPorLlamada[1]).toEqual(expect.arrayContaining(["xone_critica_visual", "comparar_capturas"]));
      expect(vistos[1]!.join("\n")).toContain("PARA JUZGAR UNA PANTALLA");
      // El de pruebas no juzga: saca las capturas.
      expect(toolsPorLlamada[2]).not.toContain("xone_critica_visual");
      expect(toolsPorLlamada[2]).not.toContain("comparar_capturas");
    }, 30_000);

    it("sin carpeta de artefactos no hay capturas que juzgar, y el texto no las nombra", async () => {
      const raiz = proyecto();
      const { m, vistos, toolsPorLlamada } = modelosConGuion(guion());
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, bucleDelDesarrollador: true });
      await s.turno("haz", piel().p);
      expect(toolsPorLlamada[1]).not.toContain("xone_critica_visual");
      expect(vistos[1]!.join("\n")).not.toContain("PARA JUZGAR UNA PANTALLA");
    }, 30_000);

    it("el desarrollador sabe cuándo TERMINA: el criterio de aceptación, tres vueltas, y que devolver antes es dejarlo a medias", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion(guion());
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, bucleDelDesarrollador: true });
      await s.turno("haz la calculadora", piel().p);
      const sistema = vistos[1]!.join("\n");
      expect(sistema).toContain("NO TERMINAS hasta que se cumpla el CRITERIO DE ACEPTACIÓN");
      expect(sistema).toContain("TRES vueltas");
      expect(sistema).toContain("diciendo QUÉ falta");
      // El umbral es ALCANZABLE: mide con la herramienta y deja fuera lo que XOne no reproduce.
      expect(sistema).toContain("por debajo del 10 %");
      expect(sistema).toContain("las tipografías del diseño");
    }, 30_000);

    it("y sabe que el LAYOUT es suyo y el diseñador solo hace RECURSOS: puede llamarlo, y el nieto diseñador trabaja y responde a él", async () => {
      const raiz = proyecto();
      const { m, vistos, toolsPorLlamada } = modelosConGuion(guion("designer-xone"));
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, bucleDelDesarrollador: true });
      const r = piel();
      await s.turno("haz la calculadora", r.p);
      expect(vistos[1]!.join("\n")).toContain("El LAYOUT y el CSS son TUYOS");
      expect(vistos[1]!.join("\n")).toContain("solo hace RECURSOS");
      // El nieto es el diseñador de verdad (escribe: recibe las tools de fichero), no el ayudante genérico de lectura.
      expect(toolsPorLlamada[2]).toContain("write_file");
      expect(toolsPorLlamada[2]).not.toContain("create_sub_agent");
      expect(r.tokens.join("")).toContain("Hecho.");
    }, 30_000);

    it("el orquestador, con el bucle, recibe la orden de escribir el criterio medible en cada encargo al desarrollador", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion(guion());
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, bucleDelDesarrollador: true });
      await s.turno("haz la calculadora", piel().p);
      expect(vistos[0]!.join("\n")).toContain("CRITERIO ESCRITO y MEDIBLE");
      expect(vistos[0]!.join("\n")).toContain("por debajo del 10 %");
    }, 30_000);

    it("apagado (por omisión), el desarrollador no recibe la tool", async () => {
      const raiz = proyecto();
      const { m, toolsPorLlamada, vistos } = modelosConGuion([
        [delega("d1", "developer-xone", "escribe")],
        [new AIMessageChunk({ content: "Escrito." })],
        [new AIMessageChunk({ content: "Hecho." })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, bucleDelDesarrollador: false });
      await s.turno("haz", piel().p);
      expect(toolsPorLlamada[1]).not.toContain("create_sub_agent");
      expect(vistos[1]!.join("\n")).not.toContain("PUEDES LLAMAR A");
    }, 30_000);

    it("un nombre que no está en su lista cae al ayudante genérico de solo lectura, sin shell", async () => {
      const raiz = proyecto();
      const { m, toolsPorLlamada } = modelosConGuion(guion("consultant-xone"));
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, bucleDelDesarrollador: true });
      await s.turno("haz", piel().p);
      expect(toolsPorLlamada[2]).not.toContain("execute");
      expect(toolsPorLlamada[2]).not.toContain("write_file");
    }, 30_000);
  });

  describe("el conductor y sus capturas: aviso al pasarse", () => {
    const orden = (id: string, comando: string) =>
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: "execute", args: JSON.stringify({ command: comando }) }] });
    const delega = new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "device-controller", input: "comprueba" }) }] });
    const todo = (vistos: string[][], i: number): string => vistos[i]!.join("\n");

    it("tras DOS capturas el conductor recibe el aviso (y otro a las cuatro): para valores, el log de la app y los campos", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion([
        [delega],
        [orden("c1", "echo xone-captura-android 1")],
        [orden("c2", "echo xone-hotswap shot name=uno")],
        [orden("c3", "echo hola")],
        [new AIMessageChunk({ content: "Comprobado." })],
        [new AIMessageChunk({ content: "Listo." })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
      await s.turno("comprueba", piel().p);
      // La llamada del conductor DESPUÉS de la segunda captura (la 4ª de todas) lleva el aviso; las anteriores, no.
      expect(todo(vistos, 3)).toContain("LLEVAS 2 CAPTURAS");
      expect(todo(vistos, 3)).toContain("xone-log-android --app");
      expect(vistos.slice(0, 3).some((_, i) => todo(vistos, i).includes("CAPTURAS en este encargo"))).toBe(false);
    }, 30_000);

    it("un comando que no saca captura no cuenta", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion([
        [delega],
        [orden("c1", "echo hola")],
        [orden("c2", "echo getText name=X")],
        [orden("c3", "echo xone-log-android")],
        [orden("c4", "echo xone-hotswap elements")],
        [new AIMessageChunk({ content: "Comprobado." })],
        [new AIMessageChunk({ content: "Listo." })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
      await s.turno("comprueba", piel().p);
      expect(vistos.some((_, i) => todo(vistos, i).includes("CAPTURAS en este encargo"))).toBe(false);
    }, 30_000);
  });

  describe("el lazo del desarrollador: primero lo mínimo, y aviso tras varias comprobaciones seguidas", () => {
    const llama = (id: string) =>
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: "create_sub_agent", args: JSON.stringify({ name: "device-controller", input: "comprueba" }) }] });
    const texto = (vistos: string[][], i: number): string => vistos[i]!.join("\n");

    it("el desarrollador recibe la orden de empezar por lo mínimo (arranque, display y un botón)", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion([
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "escribe" }) }] })],
        [new AIMessageChunk({ content: "Hecho." })],
        [new AIMessageChunk({ content: "Listo." })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, bucleDelDesarrollador: true });
      await s.turno("haz", piel().p);
      expect(texto(vistos, 1)).toContain("EMPIEZA POR LO MÍNIMO");
      expect(texto(vistos, 1)).toContain("UN botón");
    }, 30_000);

    it("tras TRES comprobaciones seguidas al de pruebas, el desarrollador recibe el aviso de cambiar de procedimiento (una sola vez)", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion([
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "escribe" }) }] })],
        [llama("n1")],
        [new AIMessageChunk({ content: "Falla A." })],
        [llama("n2")],
        [new AIMessageChunk({ content: "Falla B." })],
        [llama("n3")],
        [new AIMessageChunk({ content: "Falla C." })],
        [new AIMessageChunk({ content: "Devuelvo." })],
        [new AIMessageChunk({ content: "Todo." })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, bucleDelDesarrollador: true });
      await s.turno("haz", piel().p);
      const todo = vistos.map((_, i) => texto(vistos, i));
      // La llamada del desarrollador DESPUÉS de la tercera comprobación (la 8ª de todas) lleva el aviso; las de antes, no.
      expect(todo[7]).toContain("LLEVAS 3 COMPROBACIONES SEGUIDAS");
      expect(todo[7]).toContain("MISMA FAMILIA");
      expect(todo.slice(0, 7).some((t) => t.includes("COMPROBACIONES SEGUIDAS"))).toBe(false);
      // Una vez: en las llamadas que le siguen, el aviso ya está en el contexto y no se añade otro.
      expect((todo[7]!.match(/LLEVAS 3 COMPROBACIONES SEGUIDAS/g) ?? []).length).toBe(1);
    }, 30_000);

    it("sin el interruptor del bucle no hay contador ni aviso", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion([
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "escribe" }) }] })],
        [new AIMessageChunk({ content: "Hecho." })],
        [new AIMessageChunk({ content: "Listo." })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, bucleDelDesarrollador: false });
      await s.turno("haz", piel().p);
      expect(vistos.map((_, i) => texto(vistos, i)).some((t) => t.includes("EMPIEZA POR LO MÍNIMO") || t.includes("COMPROBACIONES SEGUIDAS"))).toBe(false);
    }, 30_000);
  });

  describe("un hijo no arranca hasta que termine el otro del que depende", () => {
    const pide = (id: string, nombre: string, input: string, indice: number) => ({ index: indice, id, name: "create_sub_agent", args: JSON.stringify({ name: nombre, input }) });
    const alaVez = (primero: "designer-xone" | "developer-xone") =>
      new AIMessageChunk({
        content: "",
        tool_call_chunks:
          primero === "designer-xone"
            ? [pide("d1", "designer-xone", "haz los recursos", 0), pide("v1", "developer-xone", "escribe la pantalla", 1)]
            : [pide("v1", "developer-xone", "escribe la pantalla", 0), pide("d1", "designer-xone", "haz los recursos", 1)],
      });
    const conRecursos = () => {
      const raiz = proyecto();
      mkdirSync(join(raiz, "icons"), { recursive: true });
      writeFileSync(join(raiz, "icons", "bg_key_num.svg"), "<svg/>");
      return raiz;
    };
    // raíz lanza a los dos → (el desarrollador vuelve al instante) el diseñador trabaja → raíz vuelve a llamar al desarrollador → raíz cierra.
    const guion = (primero: "designer-xone" | "developer-xone") => [
      [alaVez(primero)],
      [new AIMessageChunk({ content: "Recursos hechos." })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [pide("v2", "developer-xone", "escribe la pantalla con estos recursos: bg_key_num.svg", 0)] })],
      [new AIMessageChunk({ content: "Pantalla escrita." })],
      [new AIMessageChunk({ content: "Todo listo." })],
    ];

    for (const primero of ["designer-xone", "developer-xone"] as const) {
      it(`lanzados a la vez (${primero} primero): el desarrollador NO arranca, se le devuelve al orquestador diciéndolo, y al volver a llamarlo ya sabe qué dejó el diseñador`, async () => {
        const raiz = conRecursos();
        const { m, vistos } = modelosConGuion(guion(primero));
        const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
        const r = piel();
        await s.turno("haz la calculadora", r.p);
        const texto = vistos.map((v) => v.join("\n"));
        // 2ª llamada: solo el diseñador trabaja (el desarrollador no llamó al modelo).
        expect(texto[1]).toContain("haz los recursos");
        // 3ª llamada: el RAÍZ ve que el desarrollador no arrancó y por qué.
        expect(texto[2]).toContain("developer-xone NO HA ARRANCADO");
        expect(texto[2]).toContain("espera a que termine designer-xone");
        // 4ª: el desarrollador, ya llamado de nuevo, sabe qué hay en icons/.
        expect(texto[3]).toContain("escribe la pantalla con estos recursos");
        expect(texto[3]).toContain("bg_key_num.svg");
        expect(r.tokens.join("")).toContain("Todo listo.");
      }, 30_000);
    }

    it("con el diseñador PIDIENDO APROBACIÓN de escritura, el turno termina: no hay bloqueo mutuo (lo que atascó una pasada real)", async () => {
      const raiz = conRecursos();
      const { m } = modelosConGuion([
        [alaVez("designer-xone")],
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "w1", name: "write_file", args: JSON.stringify({ file_path: "/icons/ic_x.svg", content: "<svg/>" }) }] })],
        [new AIMessageChunk({ content: "Recursos hechos." })],
        [new AIMessageChunk({ content: "", tool_call_chunks: [pide("v2", "developer-xone", "escribe la pantalla", 0)] })],
        [new AIMessageChunk({ content: "Pantalla escrita." })],
        [new AIMessageChunk({ content: "Todo listo." })],
      ]);
      const s = await abrirSesionTrueforge({
        raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO,
        pedirAprobacion: async (ps) => new Map(ps.map((p) => [p.id, { type: "approve" as const }])),
      });
      const r = piel();
      await s.turno("haz la calculadora", r.p);
      expect(r.tokens.join("")).toContain("Todo listo.");
      expect(existsSync(join(raiz, "icons", "ic_x.svg"))).toBe(true);
    }, 30_000);

    it("con las esperas apagadas, el desarrollador arranca a la vez y sin el aviso", async () => {
      const raiz = conRecursos();
      const { m, vistos } = modelosConGuion([
        [alaVez("designer-xone")],
        [new AIMessageChunk({ content: "A." })],
        [new AIMessageChunk({ content: "B." })],
        [new AIMessageChunk({ content: "Listo." })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, esperasEntreHijos: false });
      await s.turno("haz", piel().p);
      expect(vistos.map((v) => v.join("\n")).some((t) => t.includes("NO HA ARRANCADO"))).toBe(false);
    }, 30_000);

    it("el orquestador sabe cómo funciona: lo simple es lanzar primero al diseñador", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion([[new AIMessageChunk({ content: "ok" })]]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
      await s.turno("hola", piel().p);
      expect(vistos[0]!.join("\n")).toContain("ESPERAS ENTRE ESPECIALISTAS");
    }, 30_000);
  });

  describe("la memoria de cada especialista en la sesión", () => {
    const delega = (id: string, input: string) =>
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: "create_sub_agent", args: JSON.stringify({ name: "consultant-xone", input }) }] });
    const guion = () => [
      [delega("d1", "mira A")],
      [new AIMessageChunk({ content: "Mirado A." })],
      [delega("d2", "mira B")],
      [new AIMessageChunk({ content: "Mirado B." })],
      [new AIMessageChunk({ content: "Hecho." })],
    ];

    it("la segunda delegación al mismo especialista arranca con SU conversación anterior y el encargo nuevo", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion(guion());
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
      await s.turno("mira", piel().p);
      const segundo = vistos[3]!.join("\n");
      expect(segundo).toContain("mira A");
      expect(segundo).toContain("Mirado A.");
      expect(segundo).toContain("NUEVO ENCARGO");
      expect(segundo).toContain("mira B");
    }, 30_000);

    it("apagada, la segunda arranca de cero, como antes", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion(guion());
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, memoriaDeEspecialistas: false });
      await s.turno("mira", piel().p);
      const segundo = vistos[3]!.join("\n");
      expect(segundo).toContain("mira B");
      expect(segundo).not.toContain("mira A");
      expect(segundo).not.toContain("NUEVO ENCARGO");
    }, 30_000);

    it("otra conversación (`nuevoHilo`) la olvida", async () => {
      const raiz = proyecto();
      const { m, vistos } = modelosConGuion([
        [delega("d1", "mira A")],
        [new AIMessageChunk({ content: "Mirado A." })],
        [new AIMessageChunk({ content: "Hecho." })],
        [delega("d2", "mira B")],
        [new AIMessageChunk({ content: "Mirado B." })],
        [new AIMessageChunk({ content: "Hecho de nuevo." })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
      await s.turno("mira", piel().p);
      s.nuevoHilo();
      await s.turno("mira otra vez", piel().p);
      expect(vistos[4]!.join("\n")).not.toContain("mira A");
    }, 30_000);
  });

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

  it("agregarNota mientras un hijo EXTERNO trabaja no revienta y no sale como sobrante: la raíz la recoge en su siguiente llamada", async () => {
    // Contra lo que un borrador anterior de este test asumía, la raíz SÍ vuelve a llamar al
    // modelo tras recibir la respuesta del hijo externo (lo prueba, en este mismo describe,
    // «se delega por el nombre del `.md`…», con `vistos[1]` y `s.tracker.calls === 2`), así que
    // la nota SÍ llega a alguien —la raíz, en su llamada siguiente— y NO sale como
    // `notasSobrantes`. Lo único verdaderamente propio de un hijo externo es que ÉL no puede
    // recibirla: no tiene `capabilities`, así que `agregarNota` mientras `correr()` está en
    // marcha no debe reventar el turno, y el texto no debe colarse en sus instrucciones (esas
    // ya se compusieron antes de que la nota existiera).
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const f = fabrica(["codex"], async () => {
      s!.agregarNota("esto no le puede llegar a un hijo externo");
      return "hecho por codex";
    });
    const { m, vistos } = modelosConGuion([delegar(), [new AIMessageChunk({ content: "Listo." })]]);
    s = await abrirSesionTrueforge({ raiz: conExterno(), modelos: m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: f.subagenteExterno });
    const r = await s.turno("refactoriza", piel().p);
    expect(r.notasSobrantes).toBeUndefined();
    expect(f.peticiones[0]!.instrucciones).not.toContain("esto no le puede llegar");
    expect(vistos[1]!.some((t) => t.includes("esto no le puede llegar a un hijo externo"))).toBe(true);
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

describe("agregarNota: una nota mientras el agente trabaja llega al hilo que trabaja", () => {
  it("no lanza aunque no haya turno en marcha", async () => {
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: modelos(), entorno: ENTORNO, skills: CATALOGO });
    expect(() => s.agregarNota("nadie está trabajando todavía")).not.toThrow();
  });

  it("empujada mientras un especialista trabaja, llega a SU siguiente llamada, no a la primera", async () => {
    let sesion: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m, vistos } = modelosConGuion([
      // 1) la raíz delega
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "arregla el login" }) }] })],
      // 2) la PRIMERA llamada del hijo: una tool call de VERDAD (`read_file`, sobre el
      //    `app.xml` que `proyecto()` ya escribe) — no un texto suelto. Verificado contra la
      //    librería real: una respuesta SIN tool_calls termina el hilo ahí mismo
      //    (`AGENT_DONE`), así que con dos textos sueltos el hijo nunca llegaría a una
      //    segunda llamada. El mismo patrón que ya usa el test «un hijo con un nombre que no
      //    es de ningún especialista…», unas líneas más arriba en este fichero.
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "r1", name: "read_file", args: JSON.stringify({ file_path: "/app.xml" }) }] })],
      // 3) la SEGUNDA llamada del hijo — aquí debe llegar la nota (se empuja tras la 2)
      [new AIMessageChunk({ content: "Hecho." })],
      // 4) la raíz cierra
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    sesion = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    // Empuja la nota justo cuando el hijo ya hizo su PRIMERA llamada (vistos.length === 2: la
    // de la raíz delegando, y la primera del hijo).
    const original = m.paraPapel;
    // No hace falta interceptar nada más: basta con llamar `agregarNota` DESPUÉS de que la
    // sesión exista y ANTES de esperar el turno, porque `modelosConGuion` resuelve cada
    // `stream` de forma síncrona en microtareas — la propia promesa de `s.turno` no ha
    // arrancado el hilo del hijo todavía. Se comprueba con el contenido de `vistos`, no con
    // el orden de las llamadas a `agregarNota`.
    void original;
    const turnoPromesa = sesion.turno("arregla el login", piel().p);
    // Espera a que el hijo haga su primera llamada (dos entradas en `vistos`: raíz + hijo#1)
    // antes de anotar, para que la nota caiga ENTRE la primera y la segunda del hijo.
    await new Promise<void>((resuelto) => {
      const comprobar = () => (vistos.length >= 2 ? resuelto() : setTimeout(comprobar, 0));
      comprobar();
    });
    sesion.agregarNota("cambia de idea: usa el login antiguo");
    await turnoPromesa;

    // vistos[0] = raíz delegando, vistos[1] = 1ª del hijo, vistos[2] = 2ª del hijo, vistos[3] = raíz cerrando.
    expect(vistos[1]!.some((t) => t.includes("cambia de idea"))).toBe(false);
    expect(vistos[2]!.some((t) => t.includes("cambia de idea"))).toBe(true);
  }, 20_000);

  it("una nota que el raíz se queda NO le llega también al hijo que delega después (dueño único)", async () => {
    const { m, vistos } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "arregla el login" }) }] })],
      [new AIMessageChunk({ content: "Hecho." })],
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    s.agregarNota("una nota para el plan");
    await s.turno("arregla el login", piel().p);
    expect(vistos[0]!.some((t) => t.includes("una nota para el plan"))).toBe(true);
    expect(vistos[1]!.some((t) => t.includes("una nota para el plan"))).toBe(false);
  }, 20_000);

  it("el DIAGRAMA DOBLE, medido: nota escrita mientras el raíz delega → la hace el hijo, y el raíz la ve como ya encargada", async () => {
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m, vistos } = modelosConGuion(
      [
        // 1) el raíz decide delegar… y en plena llamada la persona escribe
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "analyst-xone", input: "analiza las colecciones" }) }] })],
        // 2) el hijo (el ÚNICO que trabaja) se la queda
        [new AIMessageChunk({ content: "Análisis y diagrama hechos." })],
        // 3) el raíz vuelve
        [new AIMessageChunk({ content: "Listo." })],
      ],
      (n) => {
        if (n === 1) s!.agregarNota("y créame un diagrama");
      }
    );
    s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const r = await s.turno("analiza las colecciones", piel().p);
    expect(vistos[1]!.join("\n")).toContain(textoDeNotaParaHijo("y créame un diagrama"));
    const delRaiz = vistos[2]!.join("\n");
    expect(delRaiz).toContain(textoDeNotaYaEntregada("y créame un diagrama", "analyst-xone"));
    expect(delRaiz).not.toContain(textoDeNota("y créame un diagrama"));
    expect(r.notasSobrantes).toBeUndefined();
  }, 20_000);

  it("con DOS hijos en paralelo ninguno se la queda: la recibe el raíz al volver, como encargo", async () => {
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m, vistos } = modelosConGuion(
      [
        [
          new AIMessageChunk({
            content: "",
            tool_call_chunks: [
              { index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "analyst-xone", input: "uno" }) },
              { index: 1, id: "d2", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "dos" }) },
            ],
          }),
        ],
        [new AIMessageChunk({ content: "a" })],
        [new AIMessageChunk({ content: "b" })],
        [new AIMessageChunk({ content: "Listo." })],
      ],
      (n) => {
        if (n === 1) s!.agregarNota("añade el menú");
      }
    );
    s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("dos cosas", piel().p);
    expect(vistos[1]!.join("\n")).not.toContain("añade el menú");
    expect(vistos[2]!.join("\n")).not.toContain("añade el menú");
    expect(vistos[3]!.join("\n")).toContain(textoDeNota("añade el menú"));
  }, 20_000);

  it("una nota que NADIE recibe antes de que el turno cierre sale como sobrante, y avisa", async () => {
    // Un solo texto, SIN tool_calls: verificado contra la librería real que eso cierra el hilo
    // ahí mismo (`AGENT_DONE`) — no hay una segunda llamada que la pudiera recibir. Empujar la
    // nota DESDE EL MOCK, justo tras registrar la ÚNICA llamada (`alLlamar`, ver su porqué en
    // `modelosConGuion`): con un solo texto de respuesta no hay ninguna E/S real entre la
    // llamada y el cierre del turno, así que un `setTimeout` en el test nunca llega a tiempo —
    // esto la deja sin nadie a quien entregársela de forma determinista.
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m } = modelosConGuion([[new AIMessageChunk({ content: "Listo." })]], (n) => {
      if (n === 1) s!.agregarNota("esto llega tarde");
    });
    s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const pi = piel();
    const r = await s.turno("escribe una nota", pi.p);
    expect(r.notasSobrantes).toBe("esto llega tarde");
    // El aviso por la piel, el mismo patrón que el de «SIN aprobación» (más abajo en este
    // fichero): una línea que lo dice, no un silencio.
    expect(pi.lineas.join("\n")).toMatch(/se manda como el turno siguiente/);
  }, 20_000);

  it("una nota que SÍ se entrega no sale como sobrante", async () => {
    // La PRIMERA respuesta lleva una tool call de verdad (`get_current_datetime`, que la raíz
    // ya tiene montada por `capacidadDeFecha()`): verificado contra la librería real que una
    // respuesta sin tool_calls termina el hilo ahí mismo, así que dos textos sueltos nunca
    // llegarían a una segunda llamada — que es justo donde tiene que aparecer la nota. Se
    // empuja desde `alLlamar` tras la PRIMERA llamada, para que la SEGUNDA la recoja.
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m, vistos } = modelosConGuion(
      [
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "f1", name: "get_current_datetime", args: "{}" }] })],
        [new AIMessageChunk({ content: "Listo." })],
      ],
      (n) => {
        if (n === 1) s!.agregarNota("a tiempo");
      }
    );
    s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const r = await s.turno("mira algo", piel().p);
    expect(r.notasSobrantes).toBeUndefined();
    expect(vistos[1]!.some((t) => t.includes("a tiempo"))).toBe(true);
  }, 20_000);
});

describe("detener: la persona para a los especialistas y el orquestador replanifica (IXCODE-4)", () => {
  const leer = (id: string) => [
    new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: "read_file", args: JSON.stringify({ file_path: "/app.xml" }) }] }),
  ];
  const delegar = (id: string, input: string) => [
    new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input }) }] }),
  ];

  it("el hijo que trabajaba cierra con su resumen, SIN ejecutar lo que pidió, y el raíz re-delega UNA vez con un hijo que corre normal", async () => {
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m, vistos } = modelosConGuion(
      [
        // 1) raíz delega
        delegar("d1", "revisa el login"),
        // 2) 1ª del hijo: lee de verdad. Tras ella la persona pulsa DETENER.
        leer("r1"),
        // 3) 2ª del hijo: ya lleva la orden de parar, y AUN ASÍ pide otra tool — que se filtra.
        [
          new AIMessageChunk({
            content: "Leí /app.xml; me quedaba el menú.",
            tool_call_chunks: [{ index: 0, id: "r2", name: "read_file", args: JSON.stringify({ file_path: "/app.xml" }) }],
          }),
        ],
        // 4) raíz: ve el resumen y la orden, y re-delega con lo hecho dentro.
        delegar("d2", "revisa el menú; ya hecho: leí /app.xml"),
        // 5) y 6) el hijo NUEVO corre normal: su tool se ejecuta y hace una segunda llamada.
        leer("r3"),
        [new AIMessageChunk({ content: "Menú revisado." })],
        // 7) raíz cierra.
        [new AIMessageChunk({ content: "Listo." })],
      ],
      (n) => {
        if (n === 2) s!.detener("mejor revisa el menú");
      }
    );
    s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const r = await s.turno("revisa el login", piel().p);

    const orden = (i: number) => vistos[i]!.join("\n");
    expect(vistos).toHaveLength(7);
    // El hijo recibe la orden en su SIGUIENTE llamada, no en la que ya estaba en curso.
    expect(orden(1)).not.toContain(textoDeDetencionParaHijo("mejor revisa el menú"));
    expect(orden(2)).toContain(textoDeDetencionParaHijo("mejor revisa el menú"));
    // La 4ª llamada ya es del RAÍZ: la tool que el hijo pidió tras la orden NO se ejecutó (si no,
    // el hijo habría hecho una 3ª llamada aquí). Y el raíz ve el resumen y la orden.
    expect(orden(3)).toContain("Leí /app.xml; me quedaba el menú.");
    expect(orden(3)).toContain(textoDeDetencionParaRaiz("mejor revisa el menú"));
    // El hijo re-delegado NO se detiene: su tool se ejecutó y siguió con una 2ª llamada limpia.
    expect(orden(4)).toContain("revisa el menú; ya hecho");
    expect(orden(4)).not.toContain("DETENER");
    expect(orden(5)).toContain("<app/>");
    expect(orden(5)).not.toContain("DETENER");
    // Y el raíz no recibe la orden dos veces.
    expect(orden(6).split(textoDeDetencionParaRaiz("mejor revisa el menú")).length - 1).toBe(1);
    expect(r.notasSobrantes).toBeUndefined();
  }, 20_000);

  it("pulsado mientras el raíz decide delegar: el hijo que sale de ESA decisión también se detiene", async () => {
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m, vistos } = modelosConGuion(
      [delegar("d1", "revisa el login"), [new AIMessageChunk({ content: "No empecé." })], [new AIMessageChunk({ content: "Vale, paro." })]],
      (n) => {
        if (n === 1) s!.detener("");
      }
    );
    s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("revisa el login", piel().p);
    expect(vistos[1]!.join("\n")).toContain(textoDeDetencionParaHijo(""));
    expect(vistos[2]!.join("\n")).toContain(textoDeDetencionParaRaiz(""));
  }, 20_000);

  it("si tras filtrar no queda texto, el padre recibe un resumen de relleno, no un vacío", async () => {
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m, vistos } = modelosConGuion(
      [delegar("d1", "revisa el login"), leer("r1"), leer("r2"), [new AIMessageChunk({ content: "Vale." })]],
      (n) => {
        if (n === 2) s!.detener("para");
      }
    );
    s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("revisa el login", piel().p);
    expect(vistos).toHaveLength(4);
    expect(vistos[3]!.join("\n")).toContain(RESUMEN_DE_RELLENO);
  }, 20_000);

  it("una orden que nadie llega a recibir sale como sobrante, igual que una nota", async () => {
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m } = modelosConGuion([[new AIMessageChunk({ content: "Listo." })]], (n) => {
      if (n === 1) s!.detener("cambia de plan");
    });
    s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const r = await s.turno("algo", piel().p);
    expect(r.notasSobrantes).toBe("cambia de plan");
  }, 20_000);
});

describe("detener CORTA la llamada en curso del especialista (IXCODE-4)", () => {
  /**
   * Un modelo cuyo guion puede incluir una llamada LENTA: emite un trozo y se queda esperando
   * hasta que le aborten la señal —como un informe de 60 s a medio generar—. Respeta la señal
   * como la respeta LangChain: lanza al abortarse.
   */
  function modeloConLlamadaLenta(guiones: (AIMessageChunk[] | "lenta")[], alLlamar?: (n: number) => void) {
    const vistos: string[][] = [];
    const senales: (AbortSignal | undefined)[] = [];
    const modelo = {
      bindTools: () => modelo,
      stream: async (mensajes: { content: unknown }[], opciones?: { signal?: AbortSignal }) => {
        vistos.push(mensajes.map((m) => String(m.content)));
        senales.push(opciones?.signal);
        alLlamar?.(vistos.length);
        const g = guiones.shift() ?? [new AIMessageChunk({ content: "" })];
        const senal = opciones?.signal;
        return (async function* () {
          if (g === "lenta") {
            yield new AIMessageChunk({ content: "Empiezo el informe…" });
            await new Promise<void>((_, rechazar) => {
              if (senal?.aborted) return rechazar(new Error("AbortError"));
              senal?.addEventListener("abort", () => rechazar(new Error("AbortError")));
            });
            // Lo que habría seguido si nadie cortara: la tool que escribe el informe.
            yield new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "w1", name: "write_file", args: "{}" }] });
            return;
          }
          for (const t of g) yield t;
        })();
      },
    };
    const m = { paraPapel: () => modelo, paraModelo: () => modelo, descripcion: () => ({}) } as unknown as ModelosPort;
    return { m, vistos, senales };
  }
  const delegar = (id: string, input: string) => [
    new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input }) }] }),
  ];

  it("pulsado a MITAD de una llamada del hijo: se corta, el hijo resume en una llamada sin tools, y el turno sigue vivo", async () => {
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m, vistos } = modeloConLlamadaLenta(
      [
        delegar("d1", "escribe el informe"),
        "lenta", // 2) el hijo genera el informe… y la persona pulsa mientras
        // 3) la llamada de RESUMEN del hijo: pide otra tool, que se tira
        [
          new AIMessageChunk({
            content: "No llegué a escribir el informe; había leído el login.",
            tool_call_chunks: [{ index: 0, id: "w2", name: "write_file", args: "{}" }],
          }),
        ],
        // 4) el raíz replanifica
        [new AIMessageChunk({ content: "Vale, cambio de plan." })],
      ],
      (n) => {
        if (n === 2) setTimeout(() => s!.detener("mejor un diagrama"), 5);
      }
    );
    s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const r = await s.turno("escribe el informe", piel().p);

    expect(vistos).toHaveLength(4);
    // La llamada de resumen lleva la orden al FINAL y lo que el hijo ya había dicho.
    expect(vistos[2]!.at(-1)).toBe(textoDeDetencionParaHijo("mejor un diagrama"));
    expect(vistos[2]!.join("\n")).toContain("Empiezo el informe…");
    // Al raíz le llega el resumen como resultado del hijo, y la orden de replanificar.
    expect(vistos[3]!.join("\n")).toContain("No llegué a escribir el informe");
    expect(vistos[3]!.join("\n")).toContain(textoDeDetencionParaRaiz("mejor un diagrama"));
    // Nada se escribió: ni la tool de la llamada cortada ni la del resumen.
    expect(r.cambios).toEqual([]);
    expect(r.notasSobrantes).toBeUndefined();
  }, 20_000);

  it("tras PARAR, lo escrito mientras trabajaba NO arranca un turno solo: se dice, con su texto, y se descarta", async () => {
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    // La llamada lenta es la del RAÍZ: a él no se le corta, así que nadie lee lo escrito antes de Parar.
    const { m } = modeloConLlamadaLenta(["lenta"], (n) => {
      if (n === 1) {
        s!.agregarNota("una nota que nadie leyó");
        s!.detener("un cambio de plan que nadie leyó");
        setTimeout(() => s!.cancelar(), 5);
      }
    });
    s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const pi = piel();
    const r = await s.turno("escribe el informe", pi.p);
    expect(r.notasSobrantes).toBeUndefined();
    const dicho = pi.lineas.join("\n");
    expect(dicho).not.toMatch(/se manda como el turno siguiente/);
    expect(dicho).toContain("una nota que nadie leyó");
    expect(dicho).toContain("un cambio de plan que nadie leyó");
  }, 20_000);

  it("sin Parar, lo que nadie leyó SÍ sale como sobrante (el camino de siempre)", async () => {
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m } = modeloConLlamadaLenta([[new AIMessageChunk({ content: "Listo." })]], (n) => {
      if (n === 1) s!.agregarNota("llega tarde");
    });
    s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    const r = await s.turno("algo", piel().p);
    expect(r.notasSobrantes).toBe("llega tarde");
  }, 20_000);

  it("Parar (cancelar el turno) sigue cortándolo TODO: el corte del hijo no se traga la cancelación", async () => {
    let s: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m, vistos } = modeloConLlamadaLenta([delegar("d1", "escribe el informe"), "lenta"], (n) => {
      if (n === 2) setTimeout(() => s!.cancelar(), 5);
    });
    s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("escribe el informe", piel().p).catch(() => undefined);
    // Sin llamada de resumen ni vuelta al raíz.
    expect(vistos).toHaveLength(2);
  }, 20_000);
});

describe("`/adjuntos/` en TrueForge (IXCODE-7): el agujero que deepagents ya tenía cerrado", () => {
  it("con `adjuntos`: un hijo que lee /adjuntos/a.txt recibe su contenido", async () => {
    const raiz = proyecto();
    const carpeta = mkdtempSync(join(tmpdir(), "xc-tf-adjuntos-"));
    writeFileSync(join(carpeta, "a.txt"), "contenido del adjunto\n");
    const { m, vistos } = modelosConGuion([
      // 1) el raíz delega.
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "lee el adjunto" }) }] })],
      // 2) el hijo lee /adjuntos/a.txt.
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "r1", name: "read_file", args: JSON.stringify({ file_path: "/adjuntos/a.txt" }) }] })],
      // 3) el hijo, con el contenido ya en sus mensajes, contesta.
      [new AIMessageChunk({ content: "Leído." })],
      // 4) el raíz cierra.
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, adjuntos: carpeta });
    await s.turno("lee el adjunto", piel().p);
    expect(vistos[2]!.join("\n")).toContain("contenido del adjunto");
  }, 20_000);

  it("con `adjuntos`: escribir en /adjuntos/ se deniega — INCONDICIONAL, ni aprobándola", async () => {
    const raiz = proyecto();
    const carpeta = mkdtempSync(join(tmpdir(), "xc-tf-adjuntos-"));
    writeFileSync(join(carpeta, "a.txt"), "original\n");
    const { m, vistos, toolsPorLlamada } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "toca el adjunto" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "w1", name: "write_file", args: JSON.stringify({ file_path: "/adjuntos/a.txt", content: "x" }) }] })],
      [new AIMessageChunk({ content: "No he podido." })],
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    // `write_file` es de las que piden aprobación por NOMBRE (`developer-xone` escribe), así
    // que la petición SÍ pausa; lo que se prueba es que la denegación de `/adjuntos/` es del
    // BACKEND y no de la pregunta — sobrevive a un «sí» humano.
    const s = await abrirSesionTrueforge({
      raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, adjuntos: carpeta,
      pedirAprobacion: async (ps) => new Map(ps.map((p) => [p.id, { type: "approve" as const }])),
    });
    const pi = piel();
    await s.turno("toca el adjunto", pi.p);
    expect(toolsPorLlamada[1]).toContain("write_file");
    expect(pi.pausas()).toBe(1);
    expect(readFileSync(join(carpeta, "a.txt"), "utf8")).toBe("original\n");
    expect(vistos[2]!.join("\n")).toMatch(/permission denied/i);
  }, 20_000);

  it("sin `adjuntos`: /adjuntos/a.txt no lee el CWD del proceso — cae al backend normal del proyecto", async () => {
    // Discriminante entre dos lecturas posibles de «no montado»: (a) lo correcto, que
    // `/adjuntos/a.txt` sin mount especial es una ruta CUALQUIERA del proyecto (si el
    // proyecto tiene de verdad una carpeta `adjuntos/`, se lee ESA); (b) el bug que este
    // test existe para impedir — `adjuntos: ""` haría que `backendConAdjuntos` montara
    // `/adjuntos/` sobre el CWD del proceso. Un ENOENT suelto no distingue las dos: un
    // proyecto SIN esa carpeta da ENOENT en los dos casos. Así que se crean AMBOS ficheros,
    // con contenido distinto, y se comprueba de cuál de los dos viene la lectura.
    const raiz = proyecto();
    mkdirSync(join(raiz, "adjuntos"));
    writeFileSync(join(raiz, "adjuntos", "a.txt"), "esto es del PROYECTO, no un adjunto\n");
    // El CWD se muda a una carpeta temporal EXCLUSIVA de este test —nunca al cwd real del
    // proceso que corre la suite— para no tocar la casa de quien la corre.
    const cwdDePega = mkdtempSync(join(tmpdir(), "xc-tf-cwd-"));
    writeFileSync(join(cwdDePega, "a.txt"), "esto es del CWD, si algo lo monta por error\n");
    const cwdDeAntes = process.cwd();
    process.chdir(cwdDePega);
    try {
      const { m, vistos } = modelosConGuion([
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "lee /adjuntos/a.txt" }) }] })],
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "r1", name: "read_file", args: JSON.stringify({ file_path: "/adjuntos/a.txt" }) }] })],
        [new AIMessageChunk({ content: "Leído." })],
        [new AIMessageChunk({ content: "Listo." })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
      await s.turno("lee /adjuntos/a.txt", piel().p);
      const visto = vistos[2]!.join("\n");
      expect(visto).toContain("esto es del PROYECTO");
      expect(visto).not.toContain("esto es del CWD");
    } finally {
      process.chdir(cwdDeAntes);
    }
  }, 20_000);
});

/**
 * `incorporar_adjunto` en TrueForge (IXCODE-7), con el orquestador REAL: el hijo `developer-xone`
 * pide copiar un adjunto al proyecto y el turno se PARA como con `write_file` —la tool está en
 * `requireApprovalForTools` de su conjunto de propias—, con la ruta y la línea binaria en la tarjeta.
 */
describe("`incorporar_adjunto` en TrueForge (IXCODE-7): pide aprobación y solo copia con el «sí»", () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1]);
  const guion = (): AIMessageChunk[][] => [
    [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "pon el icono" }) }] })],
    [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "i1", name: "incorporar_adjunto", args: JSON.stringify({ adjunto: "/adjuntos/ic.png", file_path: "/icons/x.png" }) }] })],
    [new AIMessageChunk({ content: "Hecho." })],
    [new AIMessageChunk({ content: "Listo." })],
  ];
  const escenario = () => {
    const raiz = proyecto();
    const carpeta = mkdtempSync(join(tmpdir(), "xc-tf-inc-"));
    writeFileSync(join(carpeta, "ic.png"), PNG);
    return { raiz, carpeta };
  };

  it("supervisado: la tarjeta lleva la ruta y la línea binaria; con «allow» se escribe", async () => {
    const { raiz, carpeta } = escenario();
    const vistas: { fichero?: string; lineas?: { tipo: string; texto: string }[]; origen: string; descripcion: string }[] = [];
    const { m, toolsPorLlamada } = modelosConGuion(guion());
    const s = await abrirSesionTrueforge({
      raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, adjuntos: carpeta,
      pedirAprobacion: async (pendientes, ficheros, diffs) => {
        for (const p of pendientes) {
          const fichero = ficheros.get(p.id);
          const lineas = diffs?.get(p.id);
          vistas.push({ origen: p.origen, descripcion: p.descripcion, ...(fichero === undefined ? {} : { fichero }), ...(lineas === undefined ? {} : { lineas }) });
        }
        return new Map(pendientes.map((p) => [p.id, { type: "approve" as const }]));
      },
    });
    const pi = piel();
    await s.turno("pon el icono adjunto", pi.p);
    expect(pi.pausas()).toBe(1);
    expect(vistas).toHaveLength(1);
    expect(vistas[0]!.fichero).toBe("/icons/x.png");
    expect(vistas[0]!.origen).toBe("developer-xone");
    expect(vistas[0]!.descripcion).toBe("quiere copiar un adjunto al proyecto");
    expect(vistas[0]!.lineas).toHaveLength(1);
    expect(vistas[0]!.lineas![0]!.texto.startsWith("[fichero binario]")).toBe(true);
    expect(vistas[0]!.lineas![0]!.texto).toContain("/adjuntos/ic.png");
    expect(readFileSync(join(raiz, "icons", "x.png")).equals(PNG)).toBe(true);
    // La tiene el HIJO (llamada 2) y no el raíz (llamada 1), que es de solo lectura.
    expect(toolsPorLlamada[1]).toContain("incorporar_adjunto");
    expect(toolsPorLlamada[0]).not.toContain("incorporar_adjunto");
  }, 20_000);

  it("supervisado y rechazado: no se escribe", async () => {
    const { raiz, carpeta } = escenario();
    const s = await abrirSesionTrueforge({
      raiz, modelos: modelosConGuion(guion()).m, entorno: ENTORNO, skills: CATALOGO, adjuntos: carpeta,
      pedirAprobacion: async (pendientes) => new Map(pendientes.map((p) => [p.id, { type: "reject" as const }])),
    });
    await s.turno("pon el icono adjunto", piel().p);
    expect(existsSync(join(raiz, "icons", "x.png"))).toBe(false);
  }, 20_000);

  it("autónomo: se aplica sola y queda en «aplicadas SIN aprobación» por su ruta", async () => {
    const { raiz, carpeta } = escenario();
    let preguntada = false;
    const s = await abrirSesionTrueforge({
      raiz, modelos: modelosConGuion(guion()).m, entorno: ENTORNO, skills: CATALOGO, adjuntos: carpeta,
      sinAprobacion: () => true,
      pedirAprobacion: async (pendientes) => {
        preguntada = true;
        return new Map(pendientes.map((p) => [p.id, { type: "reject" as const }]));
      },
    });
    const pi = piel();
    await s.turno("pon el icono adjunto", pi.p);
    expect(preguntada).toBe(false);
    expect(readFileSync(join(raiz, "icons", "x.png")).equals(PNG)).toBe(true);
    expect(pi.lineas.join("\n")).toMatch(/aplicadas SIN aprobación: \/icons\/x\.png/);
  }, 20_000);

  it("sin carpeta de adjuntos, el hijo no la tiene", async () => {
    const raiz = proyecto();
    const { m, toolsPorLlamada } = modelosConGuion(guion());
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true });
    await s.turno("pon el icono adjunto", piel().p);
    expect(toolsPorLlamada[1]).not.toContain("incorporar_adjunto");
    expect(existsSync(join(raiz, "icons"))).toBe(false);
  }, 20_000);
});

/**
 * Las fuentes de Google Fonts en TrueForge, con el orquestador REAL: el diseñador busca y trae, y
 * `traer_fuente` para el turno como `write_file` —está en `PROPIAS_QUE_ESCRIBEN`— con su tarjeta
 * de fichero binario. Compuesto dentro de `propiasDe` y `capacidadesDelEspecialista`: sin esto el
 * reparto y la aprobación quedarían escritos y sin probar.
 */
describe("las fuentes de Google Fonts en TrueForge: el diseñador las trae a fonts/ con aprobación", () => {
  const CATALOGO_DE_FUENTES = [{ familia: "Inter", categoria: "Sans Serif", estilos: ["400", "700"] }];
  const guion = (quien = "designer-xone"): AIMessageChunk[][] => [
    [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: quien, input: "trae Inter 700" }) }] })],
    [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "f1", name: "traer_fuente", args: JSON.stringify({ familia: "Inter", peso: 700, file_path: "/fonts/Inter-Bold.ttf" }) }] })],
    [new AIMessageChunk({ content: "Hecho." })],
    [new AIMessageChunk({ content: "Listo." })],
  ];

  it("supervisado: la tarjeta dice qué se descarga y adónde; con «allow» se escribe; el raíz no la tiene", async () => {
    const { FuentesEnMemoria } = await import("../../../core/ports.js");
    const raiz = proyecto();
    const vistas: { fichero?: string; lineas?: { texto: string }[]; descripcion: string; origen: string }[] = [];
    const { m, toolsPorLlamada, vistos } = modelosConGuion(guion());
    const s = await abrirSesionTrueforge({
      raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, fuentes: new FuentesEnMemoria(CATALOGO_DE_FUENTES),
      pedirAprobacion: async (pendientes, ficheros, diffs) => {
        for (const p of pendientes) {
          const fichero = ficheros.get(p.id);
          const lineas = diffs?.get(p.id);
          vistas.push({ origen: p.origen, descripcion: p.descripcion, ...(fichero === undefined ? {} : { fichero }), ...(lineas === undefined ? {} : { lineas }) });
        }
        return new Map(pendientes.map((p) => [p.id, { type: "approve" as const }]));
      },
    });
    const pi = piel();
    await s.turno("usa la tipografía de la maqueta", pi.p);
    expect(pi.pausas()).toBe(1);
    expect(vistas[0]!.fichero).toBe("/fonts/Inter-Bold.ttf");
    expect(vistas[0]!.origen).toBe("designer-xone");
    expect(vistas[0]!.descripcion).toBe("quiere traer una fuente de Google Fonts al proyecto");
    expect(vistas[0]!.lineas![0]!.texto).toMatch(/^\[fichero binario\] se descarga Inter 700 de Google Fonts/);
    expect(Array.from(readFileSync(join(raiz, "fonts", "Inter-Bold.ttf")).subarray(0, 4))).toEqual([0, 1, 0, 0]);
    expect(toolsPorLlamada[1]).toEqual(expect.arrayContaining(["buscar_fuente", "traer_fuente"]));
    expect(toolsPorLlamada[0]).not.toContain("traer_fuente");
    // El orquestador sabe a quién encargar la tipografía: la ficha del diseñador lo dice.
    expect(vistos[0]!.join("\n")).toContain("trae las fuentes de la maqueta");
    // Y al volver el diseñador, el informe del harness cuenta la fuente (antes decía «SIN escribir ningún fichero»).
    const delRaiz = vistos.map((v) => v.join("\n")).find((t) => t.includes("Lo que ESCRIBIÓ designer-xone"));
    expect(delRaiz).toContain("/fonts/Inter-Bold.ttf: fichero binario");
  }, 20_000);

  it("rechazada: no se escribe", async () => {
    const { FuentesEnMemoria } = await import("../../../core/ports.js");
    const raiz = proyecto();
    const s = await abrirSesionTrueforge({
      raiz, modelos: modelosConGuion(guion()).m, entorno: ENTORNO, skills: CATALOGO, fuentes: new FuentesEnMemoria(CATALOGO_DE_FUENTES),
      pedirAprobacion: async (pendientes) => new Map(pendientes.map((p) => [p.id, { type: "reject" as const }])),
    });
    await s.turno("usa la tipografía", piel().p);
    expect(existsSync(join(raiz, "fonts"))).toBe(false);
  }, 20_000);

  it("el desarrollador también la tiene; quien ejecuta, no", async () => {
    const { FuentesEnMemoria } = await import("../../../core/ports.js");
    const dev = modelosConGuion(guion("developer-xone"));
    await (await abrirSesionTrueforge({ raiz: proyecto(), modelos: dev.m, entorno: ENTORNO, skills: CATALOGO, fuentes: new FuentesEnMemoria(CATALOGO_DE_FUENTES), sinAprobacion: () => true }))
      .turno("x", piel().p);
    expect(dev.toolsPorLlamada[1]).toContain("traer_fuente");
    const con = modelosConGuion(guion("device-controller"));
    await (await abrirSesionTrueforge({ raiz: proyecto(), modelos: con.m, entorno: ENTORNO, skills: CATALOGO, fuentes: new FuentesEnMemoria(CATALOGO_DE_FUENTES), sinAprobacion: () => true }))
      .turno("x", piel().p).catch(() => undefined);
    expect(con.toolsPorLlamada[1]).not.toContain("traer_fuente");
  }, 30_000);

  it("con el puerto, los textos del bucle ya no dan la tipografía por irreproducible; sin él, sí", () => {
    const con = textoDelBucle(["designer-xone"], { conFuentes: true });
    expect(con).toContain("La TIPOGRAFÍA del diseño sí");
    expect(con).not.toContain("no hay .ttf");
    expect(textoDelBucle(["designer-xone"])).toContain("las tipografías del diseño (no hay .ttf)");
    const agentes = [{ nombre: "developer-xone", descripcion: "d", motor: "modelo", soloLectura: false, skills: [], instrucciones: "", origen: "semilla" }] as never;
    expect(notaDeDelegacion(agentes, { conBucle: true, conFuentes: true })).toContain("la tipografía del diseño sí");
    expect(notaDeDelegacion(agentes, { conBucle: true })).toContain("las tipografías del diseño, el desenfoque");
  });

  it("sin el puerto, nadie la tiene ni la ficha la promete", async () => {
    const { m, toolsPorLlamada, vistos } = modelosConGuion(guion());
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true });
    await s.turno("x", piel().p).catch(() => undefined);
    expect(toolsPorLlamada[1]).not.toContain("traer_fuente");
    expect(vistos[0]!.join("\n")).not.toContain("trae las fuentes de la maqueta");
  }, 20_000);
});

/**
 * `marcar_criterios_del_plan` en TrueForge, con el orquestador REAL: quien comprueba en el aparato
 * (`device-controller`) marca en el plan lo que vio. Compuesto dentro de `propiasDe`, sin esto el
 * reparto quedaría escrito y sin probar.
 */
describe("`marcar_criterios_del_plan` en TrueForge: el conductor marca lo que comprobó", () => {
  it("el hijo que EJECUTA la tiene y el TASKS.md cambia; el raíz no la tiene", async () => {
    const raiz = proyecto();
    const dir = join(raiz, ".xonecode", "planes", "hoteles");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "TASKS.md"), "# T\n\n## T1 — Uno\n\n- [ ] abre\n- [ ] vuelve\n");
    const { m, toolsPorLlamada } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "device-controller", input: "comprueba T1 del plan hoteles" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "m1", name: "marcar_criterios_del_plan", args: JSON.stringify({ plan: "hoteles", tarea: "T1", criterios: [1] }) }] })],
      [new AIMessageChunk({ content: "Comprobado el 1." })],
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true });
    await s.turno("comprueba la T1", piel().p);
    expect(toolsPorLlamada[1]).toContain("marcar_criterios_del_plan");
    expect(toolsPorLlamada[0]).not.toContain("marcar_criterios_del_plan");
    expect(readFileSync(join(dir, "TASKS.md"), "utf8")).toBe("# T\n\n## T1 — Uno\n\n- [x] abre\n- [ ] vuelve\n");
  }, 20_000);

  it("el DESARROLLADOR también la tiene y marca al cerrar la tarea; quien solo lee, no", async () => {
    const raiz = proyecto();
    const dir = join(raiz, ".xonecode", "planes", "hoteles");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "TASKS.md"), "# T\n\n## T1 — Uno\n\n- [ ] abre\n- [ ] vuelve\n");
    const { m, toolsPorLlamada } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "haz la T1 del plan hoteles" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "m1", name: "marcar_criterios_del_plan", args: JSON.stringify({ plan: "hoteles", tarea: "T1", criterios: [1, 2] }) }] })],
      [new AIMessageChunk({ content: "T1 cerrada." })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d2", name: "create_sub_agent", args: JSON.stringify({ name: "consultant-xone", input: "¿qué es un mapcol?" }) }] })],
      [new AIMessageChunk({ content: "Es una referencia." })],
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO, sinAprobacion: () => true });
    await s.turno("haz la T1", piel().p);
    expect(toolsPorLlamada[1]).toContain("marcar_criterios_del_plan");
    expect(toolsPorLlamada[4]).not.toContain("marcar_criterios_del_plan");
    expect(readFileSync(join(dir, "TASKS.md"), "utf8")).toBe("# T\n\n## T1 — Uno\n\n- [x] abre\n- [x] vuelve\n");
  }, 20_000);
});

describe("`describe_image` en TrueForge (IXCODE-23): la tienen el raíz y cada especialista", () => {
  it("el raíz la ve en su primera llamada y el hijo en la suya", async () => {
    const { m, toolsPorLlamada } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "consultant-xone", input: "¿qué es esto?" }) }] })],
      [new AIMessageChunk({ content: "Un icono." })],
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("describe la imagen", piel().p);
    expect(toolsPorLlamada[0]).toContain("describe_image");
    expect(toolsPorLlamada[1]).toContain("describe_image");
  }, 20_000);
});

describe("`buscar_icono` en TrueForge (IXCODE-18): el mismo reparto que deepagents", () => {
  const guionDeIcono = () => [
    [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "designer-xone", input: "busca un icono de casa" }) }] })],
    [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "i1", name: "buscar_icono", args: JSON.stringify({ operacion: "obtener", id: "lucide:home", color: "#1a73e8", tamano: 32 }) }] })],
    [new AIMessageChunk({ content: "Ahí lo tienes." })],
    [new AIMessageChunk({ content: "Listo." })],
  ];

  it("con `iconos`: el especialista la ve, la llama y el SVG llega a sus mensajes con color y tamaño", async () => {
    const { IconosEnMemoria } = await import("../../../core/ports.js");
    const iconos = new IconosEnMemoria(["lucide:home"]);
    const { m, vistos, toolsPorLlamada } = modelosConGuion(guionDeIcono());
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO, iconos });
    await s.turno("pon un icono de casa", piel().p);
    expect(toolsPorLlamada[1]).toContain("buscar_icono");
    expect(iconos.peticiones).toEqual([{ id: "lucide:home", color: "#1a73e8", tamano: 32 }]);
    expect(vistos[2]!.join("\n")).toContain('height="32"');
  }, 20_000);

  it("sin `iconos`: nadie la ve", async () => {
    const { m, toolsPorLlamada } = modelosConGuion(guionDeIcono());
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("pon un icono de casa", piel().p).catch(() => undefined);
    expect(toolsPorLlamada[1]).not.toContain("buscar_icono");
    // Los fondos SVG no dependen del puerto: pura y sin red, van igual.
    expect(toolsPorLlamada[1]).toContain("generar_fondo_svg");
  }, 20_000);
});

describe("`comparar_capturas` en TrueForge (IXCODE-18): con el raíz, como la crítica visual", () => {
  const guion = () => [[new AIMessageChunk({ content: "Listo." })]];

  it("con carpeta de artefactos el RAÍZ la ve", async () => {
    const { m, toolsPorLlamada } = modelosConGuion(guion());
    const s = await abrirSesionTrueforge({
      raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO,
      artefactos: mkdtempSync(join(tmpdir(), "xc-tf-comparar-")),
    });
    await s.turno("hola", piel().p).catch(() => undefined);
    expect(toolsPorLlamada[0]).toContain("comparar_capturas");
    expect(toolsPorLlamada[0]).toContain("xone_critica_visual");
  }, 20_000);

  it("sin carpeta no se monta", async () => {
    const { m, toolsPorLlamada } = modelosConGuion(guion());
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("hola", piel().p).catch(() => undefined);
    expect(toolsPorLlamada[0]).not.toContain("comparar_capturas");
  }, 20_000);
});

describe("`diferencia_de_capturas` en TrueForge (IXCODE-18): al conductor, no al orquestador", () => {
  it("con carpeta de artefactos la ve quien EJECUTA y no el raíz ni los demás", async () => {
    const guion = [
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "device-controller", input: "mira" }) }] })],
      [new AIMessageChunk({ content: "Hecho." })],
      [new AIMessageChunk({ content: "Listo." })],
    ];
    const { m, toolsPorLlamada } = modelosConGuion(guion);
    const s = await abrirSesionTrueforge({
      raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO,
      artefactos: mkdtempSync(join(tmpdir(), "xc-tf-dif-")),
    });
    await s.turno("mira", piel().p).catch(() => undefined);
    expect(toolsPorLlamada[0]).not.toContain("diferencia_de_capturas");
    expect(toolsPorLlamada[1]).toContain("diferencia_de_capturas");
  }, 20_000);
});

describe("el bucle de calidad de un diseño en la nota del orquestador (IXCODE-18)", () => {
  it("con carpeta de artefactos la nota lo trae; sin ella no", async () => {
    const { notaDeDelegacion } = await import("./sesionTrueforge.js");
    const { AGENTES_DE_SERIE } = await import("../../subagentes/agentesEnDisco.js");
    const con = notaDeDelegacion(AGENTES_DE_SERIE, { conComparacion: true });
    expect(con).toMatch(/SER FIEL A ÉL/);
    expect(con).toMatch(/comparar_capturas/);
    expect(con).toMatch(/TRES vueltas/);
    expect(notaDeDelegacion(AGENTES_DE_SERIE)).not.toMatch(/SER FIEL A ÉL/);
  });
});

describe("la traza de TrueForge dice QUIÉN llamó a qué y qué se le pidió (IXCODE-18)", () => {
  it("escribe el nombre del especialista en sus tools y la delegación con su encargo", async () => {
    const { readFileSync } = await import("node:fs");
    const { rutaTrazaDeTools, VARIABLE_TRAZA_TOOLS } = await import("../../turno/diagnosticoDeTools.js");
    const raiz = proyecto();
    const previo = process.env[VARIABLE_TRAZA_TOOLS];
    process.env[VARIABLE_TRAZA_TOOLS] = "1";
    try {
      const { m } = modelosConGuion([
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "Añade un botón Guardar" }) }] })],
        [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "r1", name: "ls", args: JSON.stringify({ path: "/" }) }] })],
        [new AIMessageChunk({ content: "Hecho." })],
        [new AIMessageChunk({ content: "Listo." })],
      ]);
      const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });
      await s.turno("añade un botón", piel().p);
      const l = readFileSync(rutaTrazaDeTools(raiz), "utf8").trim().split("\n").map((x) => JSON.parse(x) as Record<string, unknown>);
      expect(l.find((x) => x["tipo"] === "delegacion")).toMatchObject({ de: "orquestador", a: "developer-xone", encargo: "Añade un botón Guardar" });
      expect(l.find((x) => x["tipo"] === "tool" && x["nombre"] === "ls")).toMatchObject({ origen: "especialista", agente: "developer-xone" });
      expect(l.find((x) => x["tipo"] === "tool" && x["nombre"] === "create_sub_agent")).toMatchObject({ agente: "orquestador" });
    } finally {
      if (previo === undefined) delete process.env[VARIABLE_TRAZA_TOOLS];
      else process.env[VARIABLE_TRAZA_TOOLS] = previo;
    }
  }, 20_000);
});

describe("el razonamiento del uso de una llamada llega al evento (IXCODE-18)", () => {
  const evento = (usage: Record<string, number>) =>
    ({ type: "internal.agent.context.append", thread_id: "main", output: [{ role: "assistant", content: "hola", usage }] }) as never;

  it("`reasoning_tokens` del mensaje sale como `razonamiento` del uso", () => {
    const { uso } = traducirEvento(evento({ input_tokens: 10, output_tokens: 900, reasoning_tokens: 750 }), () => undefined, new Map());
    expect(uso).toMatchObject({ input: 10, output: 900, razonamiento: 750 });
  });

  it("sin `reasoning_tokens` NO hay `razonamiento`: ausente no es cero", () => {
    const { uso } = traducirEvento(evento({ input_tokens: 10, output_tokens: 900 }), () => undefined, new Map());
    expect(uso).toMatchObject({ input: 10, output: 900 });
    expect(uso).not.toHaveProperty("razonamiento");
  });
});

describe("los conectores MCP en una sesión de TrueForge", () => {
  const ESQUEMA = { type: "object", properties: { prompt: { type: "string" } } };
  const stitch = () =>
    new ConectoresEnMemoria({
      stitch: {
        nombre: "Stitch",
        respuesta: "{\"screens\":[]}",
        tools: [
          { nombre: "list_projects", soloLectura: true, esquema: ESQUEMA },
          { nombre: "generate_screen_from_text", soloLectura: false, esquema: ESQUEMA },
          // Sin anotación: lo que no se declara de lectura, ESCRIBE.
          { nombre: "sin_anotar", esquema: ESQUEMA },
        ],
      },
    });
  const alDiseñador = (tool: string, id: string): AIMessageChunk[][] => [
    [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "designer-xone", input: "rediseña en Stitch" }) }] })],
    [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id, name: tool, args: JSON.stringify({ prompt: "una calculadora" }) }] })],
    [new AIMessageChunk({ content: "Hecho." })],
    [new AIMessageChunk({ content: "Listo." })],
  ];

  it("en AUTÓNOMO, una tool que ESCRIBE en Stitch llega a la persona igual, con conector, tool y argumentos; aprobada, se llama con el tope largo", async () => {
    const conectores = stitch();
    const vistas: { remota?: true; descripcion: string; diff: string }[] = [];
    const { m } = modelosConGuion(alDiseñador("stitch__generate_screen_from_text", "g1"));
    const s = await abrirSesionTrueforge({
      raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO, conectores,
      sinAprobacion: () => true,
      pedirAprobacion: async (pendientes, _f, diffs) => {
        for (const p of pendientes) vistas.push({ ...(p.remota ? { remota: p.remota } : {}), descripcion: p.descripcion, diff: (diffs.get(p.id) ?? []).map((l) => l.texto).join("\n") });
        return new Map(pendientes.map((p) => [p.id, { type: "approve" as const }]));
      },
    });
    await s.turno("rediseña la calculadora", piel().p);
    expect(vistas).toHaveLength(1);
    expect(vistas[0]).toMatchObject({ remota: true, descripcion: expect.stringContaining("Stitch: generate_screen_from_text") });
    expect(vistas[0]?.diff).toContain("una calculadora");
    expect(conectores.llamadas).toEqual([{ id: "stitch", nombre: "generate_screen_from_text", args: { prompt: "una calculadora" }, topeMs: TOPE_DE_LLAMADA_MS }]);
  }, 20_000);

  it("RECHAZADA, Stitch no recibe nada", async () => {
    const conectores = stitch();
    const { m } = modelosConGuion(alDiseñador("stitch__sin_anotar", "g2"));
    const s = await abrirSesionTrueforge({
      raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO, conectores,
      pedirAprobacion: async (pendientes) => new Map(pendientes.map((p) => [p.id, { type: "reject" as const }])),
    });
    await s.turno("rediseña", piel().p);
    expect(conectores.llamadas).toEqual([]);
  }, 20_000);

  it("una de LECTURA no pregunta; el raíz recibe solo las de lectura y el desarrollador ninguna", async () => {
    const conectores = stitch();
    let preguntas = 0;
    const { m, toolsPorLlamada } = modelosConGuion(alDiseñador("stitch__list_projects", "l1"));
    const s = await abrirSesionTrueforge({
      raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO, conectores,
      pedirAprobacion: async (pendientes) => { preguntas += 1; return new Map(pendientes.map((p) => [p.id, { type: "reject" as const }])); },
    });
    await s.turno("lista", piel().p);
    expect(preguntas).toBe(0);
    expect(conectores.llamadas.map((l) => l.nombre)).toEqual(["list_projects"]);
    const delRaiz = toolsPorLlamada[0] ?? [];
    expect(delRaiz).toContain("stitch__list_projects");
    expect(delRaiz).not.toContain("stitch__generate_screen_from_text");
    const delDiseñador = toolsPorLlamada[1] ?? [];
    expect(delDiseñador).toEqual(expect.arrayContaining(["stitch__list_projects", "stitch__generate_screen_from_text", "stitch__sin_anotar"]));
  }, 20_000);

  it("sin conectores marcados no se monta nada ni se pregunta a la red", async () => {
    const vacio = new ConectoresEnMemoria({});
    const { m, toolsPorLlamada } = modelosConGuion([[new AIMessageChunk({ content: "Listo." })]]);
    const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO, conectores: vacio });
    await s.turno("hola", piel().p);
    expect((toolsPorLlamada[0] ?? []).some((t) => t.includes("__"))).toBe(false);
  }, 20_000);
});

describe("el consumo POR MODELO de una sesión de TrueForge", () => {
  it("el raíz apunta al modelo de su papel y un especialista con `modelo:` en su `.md`, al SUYO", async () => {
    const raiz = proyecto();
    mkdirSync(join(raiz, ".xonecode", "agentes"), { recursive: true });
    writeFileSync(
      join(raiz, ".xonecode", "agentes", "consultor-gemini.md"),
      "---\ndescripcion: responde dudas\nmotor: modelo\nsoloLectura: true\nmodelo: gemini/gemini-3.8-flash\n---\nContesta.\n"
    );
    const { m } = modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "consultor-gemini", input: "¿existe imgbk?" }) }], usage_metadata: { input_tokens: 100, output_tokens: 10, total_tokens: 110 } })],
      [new AIMessageChunk({ content: "Sí existe.", usage_metadata: { input_tokens: 40, output_tokens: 4, total_tokens: 44 } })],
      [new AIMessageChunk({ content: "Existe.", usage_metadata: { input_tokens: 120, output_tokens: 3, total_tokens: 123 } })],
    ]);
    const modelos = Object.assign(m, { idDePapel: (p: string) => (p === "trabajo" ? "deepseek/deepseek-chat" : "deepseek/rapido") });
    const s = await abrirSesionTrueforge({ raiz, modelos, entorno: ENTORNO, skills: CATALOGO });
    await s.turno("¿existe imgbk?", piel().p);
    const c = s.consumo();
    expect(c.porModelo).toEqual({
      "deepseek/deepseek-chat": { cuenta: "modelo", entrada: 220, salida: 13, cache: 0 },
      "gemini/gemini-3.8-flash": { cuenta: "modelo", entrada: 40, salida: 4, cache: 0 },
    });
    // Y las filas suman el total de la cuenta.
    expect(Object.values(c.porModelo ?? {}).reduce((t, f) => t + f.entrada, 0)).toBe(c.modelo.entrada);
  }, 20_000);
});

describe("un device-controller en Claude Code: la shell ESTRECHA llega al hijo", () => {
  const conConductorExterno = (motor: string) => {
    const raiz = proyecto();
    mkdirSync(join(raiz, ".xonecode", "agentes"), { recursive: true });
    writeFileSync(
      join(raiz, ".xonecode", "agentes", "conductor-ext.md"),
      `---\ndescripcion: Maneja el aparato\nmotor: ${motor}\nsoloLectura: false\nejecucion: true\nskills: [xone-hotswap]\n---\nPrueba la app.\n`
    );
    return raiz;
  };
  const guion = () =>
    modelosConGuion([
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "conductor-ext", input: "saca una captura" }) }] })],
      [new AIMessageChunk({ content: "Hecho." })],
    ]).m;
  const abrir = async (motor: string, artefactos: string | undefined, correr: (p: PeticionExterna) => Promise<string>) => {
    const peticiones: PeticionExterna[] = [];
    const artefactosAnunciados: string[] = [];
    const s = await abrirSesionTrueforge({
      raiz: conConductorExterno(motor), modelos: guion(), entorno: ENTORNO, skills: CATALOGO,
      ...(artefactos === undefined ? {} : { artefactos }),
      subagenteExterno: () => ({ disponible: async () => true, correr: async (p: PeticionExterna) => (peticiones.push(p), correr(p)) }),
    });
    await s.turno("saca una captura", { ...piel().p, artefacto: (a: { ruta: string }) => void artefactosAnunciados.push(a.ruta) } as never);
    return { peticiones, artefactosAnunciados };
  };

  it("Claude Code recibe sus scripts, el entorno de NUESTRA shell (sin claves, con los scripts en el PATH) y la lectura de SUS carpetas", async () => {
    const artefactos = mkdtempSync(join(tmpdir(), "xc-art-"));
    process.env["DEEPSEEK_API_KEY"] = "sk-no-debe-llegar";
    try {
      const { peticiones } = await abrir("claude-code", artefactos, async () => "hecho");
      const e = peticiones[0]?.ejecucion;
      expect(e?.scripts).toEqual(expect.arrayContaining(["xone-hotswap", "xone-log-android", "xone-captura-android"]));
      expect(e?.entorno["DEEPSEEK_API_KEY"]).toBeUndefined();
      expect(e?.entorno["PATH"]).toContain(join("xone-hotswap", "scripts"));
      expect(e?.entorno["XONECODE_ARTEFACTOS"]).toBe(artefactos);
      expect(e?.lecturas).toEqual([artefactos, expect.stringContaining("hotswap")]);
    } finally {
      delete process.env["DEEPSEEK_API_KEY"];
    }
  }, 20_000);

  it("lo que el hijo deja en /artefactos/ se ANUNCIA al volver, como con nuestra shell", async () => {
    const artefactos = mkdtempSync(join(tmpdir(), "xc-art-"));
    const { artefactosAnunciados } = await abrir("claude-code", artefactos, async () => {
      writeFileSync(join(artefactos, "captura-1.png"), "png");
      return "hecho";
    });
    expect(artefactosAnunciados).toContain("/artefactos/captura-1.png");
  }, 20_000);

  it("Codex y OpenCode siguen SIN shell, y sin carpeta de artefactos tampoco se concede", async () => {
    const artefactos = mkdtempSync(join(tmpdir(), "xc-art-"));
    for (const motor of ["codex", "opencode"]) {
      const { peticiones } = await abrir(motor, artefactos, async () => "hecho");
      expect(peticiones[0]).not.toHaveProperty("ejecucion");
    }
    const { peticiones } = await abrir("claude-code", undefined, async () => "hecho");
    expect(peticiones[0]).not.toHaveProperty("ejecucion");
  }, 30_000);
});
