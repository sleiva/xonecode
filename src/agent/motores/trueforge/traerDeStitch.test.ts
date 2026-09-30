import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Artefacto } from "../../../core/artefactos.js";
import type { ConectoresPort } from "../../../core/ports.js";
import { TOPE_DE_LLAMADA_MS } from "../../../core/conectores.js";
import { crearTraerDeStitch, type Descargar } from "./traerDeStitch.js";
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
