import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Artefacto } from "../../../core/artefactos.js";
import type { ConectoresPort } from "../../../core/ports.js";
import { TOPE_DE_LLAMADA_MS } from "../../../core/conectores.js";
import { marcarPantallasElegidas, crearTraerDeStitch, type Descargar } from "./traerDeStitch.js";
import { buscarMaqueta, ultimaCaptura } from "./medidaAutomatica.js";

const PANTALLA = "projects/142/screens/67c6ab";
const IMG = "https://lh3.googleusercontent.com/aida/IMG";
const HTML = "https://contribution.usercontent.google.com/download?c=H";

function montar(opciones: { imagen?: string; tipoImagen?: string; sinDesign?: boolean } = {}) {
  const carpeta = mkdtempSync(join(tmpdir(), "xc-stitch-"));
  const llamadas: { nombre: string; args: Record<string, unknown>; topeMs?: number }[] = [];
  const pedidas: string[] = [];
  const conectores: ConectoresPort = {
    delProyecto: () => [],
    tools: async () => [],
    llamar: async (_id, nombre, args, o) => {
      llamadas.push({ nombre, args, ...(o?.topeMs === undefined ? {} : { topeMs: o.topeMs }) });
      if (nombre === "get_screen") return JSON.stringify({ title: "Ajustes", width: "780", height: "1768", screenshot: { downloadUrl: opciones.imagen ?? IMG }, htmlCode: { downloadUrl: HTML } });
      return JSON.stringify(opciones.sinDesign ? {} : { designTheme: { designMd: "---\nname: Kinetic" } });
    },
  };
  const descargar: Descargar = async (url) => {
    pedidas.push(url);
    return url.startsWith(HTML) ? { bytes: Buffer.from("<html></html>"), tipo: "text/html" } : { bytes: Buffer.from([0x89, 0x50]), tipo: opciones.tipoImagen ?? "image/png" };
  };
  const anunciados: Artefacto[] = [];
  const t = crearTraerDeStitch({ conectores, carpeta, descargar, alEscribir: (a) => void anunciados.push(a) });
  return { t, carpeta, llamadas, pedidas, anunciados };
}

describe("traer_pantalla_de_stitch", () => {
  it("baja imagen a tamaño real, código y DESIGN.md a /artefactos/diseno/, lo ANUNCIA y dice cómo usarla", async () => {
    const { t, carpeta, llamadas, pedidas, anunciados } = montar();
    const r = String(await t.invoke({ pantalla: PANTALLA }));
    expect(llamadas).toEqual([
      { nombre: "get_screen", args: { name: PANTALLA }, topeMs: TOPE_DE_LLAMADA_MS },
      { nombre: "get_project", args: { name: "projects/142" }, topeMs: TOPE_DE_LLAMADA_MS },
    ]);
    expect(pedidas).toEqual([`${IMG}=s0`, HTML]);
    expect(readFileSync(join(carpeta, "diseno", "code.html"), "utf8")).toBe("<html></html>");
    expect(readFileSync(join(carpeta, "diseno", "DESIGN.md"), "utf8")).toContain("Kinetic");
    expect(existsSync(join(carpeta, "diseno", "screen.png"))).toBe(true);
    expect(anunciados.map((a) => a.ruta)).toEqual(["/artefactos/diseno/screen.png", "/artefactos/diseno/code.html", "/artefactos/diseno/DESIGN.md"]);
    // Los BYTES reales, nunca la medida que declara Stitch (no es la de la imagen bajada).
    expect(r).toContain("(2 bytes)");
    expect(r).not.toContain("780");
    expect(r).toContain("referencia");
  });

  it("la extensión la decide el TIPO; una traída nueva borra la imagen vieja de otra extensión", async () => {
    const primero = montar({ tipoImagen: "image/png" });
    await primero.t.invoke({ pantalla: PANTALLA });
    const segundo = crearTraerDeStitch({
      conectores: { delProyecto: () => [], tools: async () => [], llamar: async (_i, n) => (n === "get_screen" ? JSON.stringify({ screenshot: { downloadUrl: IMG } }) : "{}") },
      carpeta: primero.carpeta,
      descargar: async () => ({ bytes: Buffer.from([1]), tipo: "image/jpeg" }),
    });
    await segundo.invoke({ pantalla: PANTALLA });
    expect(existsSync(join(primero.carpeta, "diseno", "screen.jpg"))).toBe(true);
    expect(existsSync(join(primero.carpeta, "diseno", "screen.png"))).toBe(false);
    expect(existsSync(join(primero.carpeta, "diseno", "code.html"))).toBe(false);
  });

  it("no baja lo que no es de los hosts medidos, ni guarda lo que no es imagen", async () => {
    const otro = montar({ imagen: "https://evil.example/x.png" });
    expect(String(await otro.t.invoke({ pantalla: PANTALLA }))).toContain("evil.example");
    expect(otro.pedidas).toEqual([]);
    const html = montar({ tipoImagen: "text/html" });
    expect(String(await html.t.invoke({ pantalla: PANTALLA }))).toContain("no es PNG");
    expect(existsSync(join(html.carpeta, "diseno"))).toBe(false);
  });

  it("una pantalla mal escrita no toca la red", async () => {
    const { t, llamadas } = montar();
    expect(String(await t.invoke({ pantalla: "67c6ab" }))).toContain("projects/<id>/screens/<id>");
    expect(llamadas).toEqual([]);
  });

  it("la maqueta traída MANDA en `buscarMaqueta`, y `ultimaCaptura` no la toma por una captura del aparato", async () => {
    const { t, carpeta } = montar();
    const raiz = mkdtempSync(join(tmpdir(), "xc-stitch-raiz-"));
    mkdirSync(join(raiz, "diseno"));
    writeFileSync(join(raiz, "diseno", "screen.png"), "vieja");
    const antes = Date.now() - 1000;
    await t.invoke({ pantalla: PANTALLA });
    expect(buscarMaqueta(raiz, undefined, carpeta)).toEqual({ virtual: "/artefactos/diseno/screen.png", disco: join(carpeta, "diseno", "screen.png") });
    expect(buscarMaqueta(raiz)).toEqual({ virtual: "/diseno/screen.png", disco: join(raiz, "diseno", "screen.png") });
    expect(ultimaCaptura(carpeta, antes)).toBeUndefined();
    writeFileSync(join(carpeta, "captura-1.png"), "x");
    expect(ultimaCaptura(carpeta, antes)).toBe("captura-1.png");
  });
});

/**
 * Buscar por TÍTULO. Medido en Maset: con solo el `name`, el orquestador listaba las pantallas de todos los proyectos
 * (diecinueve llamadas) y esos listados se quedaban en su contexto. La búsqueda va dentro de la tool, y solo contesta corto.
 */
describe("traer_pantalla_de_stitch por título", () => {
  const PROYECTOS_PROPIOS = JSON.stringify({ projects: [{ name: "projects/1", title: "Otro" }] });
  // Maset es de otra cuenta: solo sale con `view=shared` (medido).
  const COMPARTIDOS = JSON.stringify({ projects: [{ name: "projects/8393", title: "Maset" }] }) + "\n(recortado por el harness: sin metadata)";
  /** El lienzo de Maset: el nombre que ve la persona no es el `title` de la API (medido en Maset, 20-10-2026). */
  const LIENZO: Record<string, string> = {
    "projects/8393": JSON.stringify({
      screenInstances: [
        { id: "i1", label: "Entrega Albaran 1", sourceScreen: "projects/8393/screens/cc" },
        { id: "i2", label: "Entrega Albaran 9", sourceScreen: "projects/8393/screens/bb", hidden: true },
      ],
    }),
  };
  const PANTALLAS: Record<string, string> = {
    "1": JSON.stringify({ screens: [{ name: "projects/1/screens/aa", title: "Menú Principal" }] }),
    "8393": JSON.stringify({
      screens: [
        { name: "projects/8393/screens/bb", title: "Menú Principal - Maset Logística (Rediseño Profesional)" },
        { name: "projects/8393/screens/cc", title: "Login" },
      ],
    }),
  };
  function montarBusqueda(extra: Partial<Parameters<typeof crearTraerDeStitch>[0]> = {}) {
    const carpeta = mkdtempSync(join(tmpdir(), "xc-stitch-titulo-"));
    const llamadas: { nombre: string; args: Record<string, unknown> }[] = [];
    const conectores: ConectoresPort = {
      delProyecto: () => [],
      tools: async () => [],
      llamar: async (_id, nombre, args) => {
        llamadas.push({ nombre, args });
        if (nombre === "list_projects") return args["filter"] === "view=shared" ? COMPARTIDOS : PROYECTOS_PROPIOS;
        if (nombre === "list_screens") return PANTALLAS[String(args["projectId"])] ?? "{}";
        if (nombre === "get_project") return LIENZO[String(args["name"])] ?? "{}";
        if (nombre === "get_screen") return JSON.stringify({ title: "Menú", screenshot: { downloadUrl: IMG } });
        return "{}";
      },
    };
    const t = crearTraerDeStitch({ conectores, carpeta, descargar: async () => ({ bytes: Buffer.from([1]), tipo: "image/png" }), ...extra });
    return { t, llamadas, carpeta };
  }

  it("con proyecto y título (sin tildes ni mayúsculas exactas), encuentra la pantalla en un proyecto COMPARTIDO y la trae", async () => {
    const { t, llamadas, carpeta } = montarBusqueda();
    const r = String(await t.invoke({ proyecto: "maset", titulo: "menu principal - maset logistica (rediseño profesional)" }));
    expect(llamadas.filter((l) => l.nombre === "list_screens")).toEqual([{ nombre: "list_screens", args: { projectId: "8393" } }]);
    expect(llamadas.find((l) => l.nombre === "get_screen")?.args).toEqual({ name: "projects/8393/screens/bb" });
    expect(existsSync(join(carpeta, "diseno", "screen.png"))).toBe(true);
    expect(r).toContain("Traída");
  });

  it("varias que casan: no trae ninguna y da la lista CORTA con su `name`", async () => {
    const { t, llamadas } = montarBusqueda();
    // «principal» no es el título de ninguna, y lo CONTIENEN dos.
    const r = String(await t.invoke({ titulo: "principal" }));
    expect(llamadas.some((l) => l.nombre === "get_screen")).toBe(false);
    expect(r).toMatch(/Hay 2 pantallas/);
    expect(r).toContain("projects/8393/screens/bb");
    expect(r).toContain("projects/1/screens/aa");
  });

  it("en una TAREA, una pantalla que no existe NO se sustituye: lo dice, no trae nada y el harness lo apunta", async () => {
    // Medido en Maset: «Menu Listado Entregas» no salía y la tarea construyó la ventana con «Albaranes Pendientes».
    const faltan: string[] = [];
    const { t, llamadas } = montarBusqueda({ sinPersona: true, alNoEncontrar: (x) => faltan.push(x) });
    const r = String(await t.invoke({ proyecto: "Maset", titulo: "Menu Listado Entregas" }));
    expect(r).toContain("NO se construye con otra pantalla parecida");
    expect(r).toContain("«Login»");
    expect(llamadas.some((l) => l.nombre === "get_screen")).toBe(false);
    expect(faltan).toEqual(["Menu Listado Entregas"]);
  });

  it("con una persona delante sigue ofreciendo la lista, y lo que se TRAE se anuncia por su título", async () => {
    const faltan: string[] = [];
    const traidas: string[] = [];
    const { t } = montarBusqueda({ alNoEncontrar: (x) => faltan.push(x), alTraer: (x) => traidas.push(x) });
    expect(String(await t.invoke({ titulo: "Listado Entregas" }))).toMatch(/vuelve a llamarme con el `name`/);
    expect(faltan).toEqual(["Listado Entregas"]);
    await t.invoke({ pantalla: "projects/8393/screens/bb" });
    expect(traidas).toEqual(["Menú"]);
  });

  it("con la maqueta ELEGIDA (la marca del corredor): ni busca por título ni trae otra id; solo vuelve a traer ESA", async () => {
    // Medido el riesgo: la petición dice «Menu Listado Entregas» y la persona eligió una `image.png`. Sin esto, la búsqueda
    // por título apuntaba un CRITICAL falso, decía «no construyas» y podía sobrescribir la elegida con otra.
    const faltan: string[] = [];
    const { t, llamadas, carpeta } = montarBusqueda({ sinPersona: true, alNoEncontrar: (x) => faltan.push(x) });
    marcarPantallasElegidas(carpeta, [{ name: "projects/8393/screens/cc", titulo: "image.png" }]);
    const porTitulo = String(await t.invoke({ titulo: "Menu Listado Entregas" }));
    expect(porTitulo).toContain("ya tiene su maqueta ELEGIDA: «image.png» (id `projects/8393/screens/cc`)");
    expect(String(await t.invoke({ pantalla: "projects/8393/screens/bb" }))).toContain("ya tiene su maqueta ELEGIDA");
    expect(llamadas).toEqual([]);
    expect(faltan).toEqual([]);
    expect(String(await t.invoke({ pantalla: "projects/8393/screens/cc" }))).toContain("Traída");
  });

  /** IXCODE-63: con VARIAS elegidas, la tool trae cualquiera de ELLAS a SU carpeta, y ninguna otra. */
  it("con varias elegidas trae cualquiera de ellas a su carpeta (`diseno/2/`…) y ninguna otra", async () => {
    const { t, carpeta } = montarBusqueda();
    marcarPantallasElegidas(carpeta, [
      { name: "projects/8393/screens/cc", titulo: "Listado" },
      { name: "projects/8393/screens/dd", titulo: "Detalle" },
    ]);
    const segunda = String(await t.invoke({ pantalla: "projects/8393/screens/dd" }));
    expect(segunda).toContain("/artefactos/diseno/2/screen.png");
    expect(existsSync(join(carpeta, "diseno", "2", "screen.png"))).toBe(true);
    // La primera no se toca al traer la segunda.
    expect(existsSync(join(carpeta, "diseno", "screen.png"))).toBe(false);
    const otra = String(await t.invoke({ pantalla: "projects/8393/screens/zz" }));
    expect(otra).toContain("ya tiene sus maquetas ELEGIDAS");
    expect(otra).toContain("«Detalle» (id `projects/8393/screens/dd`, en /artefactos/diseno/2/)");
  });

  it("la marca de antes (una sola, sin lista) se sigue leyendo", async () => {
    const { t, carpeta } = montarBusqueda();
    mkdirSync(join(carpeta, "diseno"), { recursive: true });
    writeFileSync(join(carpeta, "diseno", ".elegida.json"), JSON.stringify({ name: "projects/8393/screens/cc", titulo: "image.png" }));
    expect(String(await t.invoke({ titulo: "Otra" }))).toContain("ya tiene su maqueta ELEGIDA: «image.png»");
  });

  /** IXCODE: el nombre del LIENZO («Entrega Albaran 1») casa aunque el `title` de la API sea otro. */
  it("encuentra la pantalla por su nombre en el LIENZO de Stitch, y una oculta no presta el suyo", async () => {
    const faltan: string[] = [];
    const { t, llamadas } = montarBusqueda({ sinPersona: true, alNoEncontrar: (x) => faltan.push(x) });
    expect(String(await t.invoke({ titulo: "Entrega Albaran 1", proyecto: "Maset" }))).toContain("Traída");
    expect(llamadas.find((l) => l.nombre === "get_screen")?.args).toEqual({ name: "projects/8393/screens/cc" });
    expect(faltan).toEqual([]);
    // La del título de la API sigue encontrándose por él.
    expect(String(await t.invoke({ titulo: "Menú Principal - Maset Logística (Rediseño Profesional)", proyecto: "Maset" }))).toContain("Traída");
    // Una instancia OCULTA no cuenta: «Entrega Albaran 9» no existe para la búsqueda.
    expect(String(await t.invoke({ titulo: "Entrega Albaran 9", proyecto: "Maset" }))).toContain("Ninguna pantalla");
  });

  it("un proyecto que no existe lo dice con los que hay; sin título ni name, pide uno", async () => {
    const { t } = montarBusqueda();
    expect(String(await t.invoke({ proyecto: "Nada", titulo: "Login" }))).toMatch(/Ningún proyecto de Stitch se llama «Nada»[\s\S]*«Maset»/);
    expect(String(await t.invoke({}))).toMatch(/Dime la pantalla/);
  });
});
