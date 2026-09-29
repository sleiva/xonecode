import { describe, expect, it } from "vitest";
import { iconosEnRed } from "./iconosEnRed.js";

const respuesta = (cuerpo: string, status = 200): Response => new Response(cuerpo, { status });

describe("iconosEnRed (con fetch doblado: sin red)", () => {
  it("busca y devuelve solo ids con forma de id", async () => {
    const vistas: string[] = [];
    const iconos = iconosEnRed(async (url) => {
      vistas.push(String(url));
      return respuesta(JSON.stringify({ icons: ["lucide:home", "../x"] }));
    });
    expect(await iconos.buscar("home", { limite: 3, prefijo: "lucide" })).toEqual(["lucide:home"]);
    expect(vistas[0]).toContain("prefix=lucide");
  });

  it("recorta al límite pedido: Iconify sube el mínimo a 32 y el doble ya recortaba", async () => {
    const muchos = Array.from({ length: 32 }, (_, i) => `lucide:icono-${i}`);
    const iconos = iconosEnRed(async () => respuesta(JSON.stringify({ icons: muchos, limit: 32 })));
    expect(await iconos.buscar("icono", { limite: 5 })).toEqual(muchos.slice(0, 5));
  });

  it("pide el SVG con color y altura, y lo devuelve", async () => {
    const vistas: string[] = [];
    const iconos = iconosEnRed(async (url) => {
      vistas.push(String(url));
      return respuesta('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    });
    expect(await iconos.svg("lucide:home", { color: "#000000", tamano: 24 })).toContain("<svg");
    expect(vistas[0]).toContain("color=%23000000");
    expect(vistas[0]).toContain("height=24");
  });

  it("un 404 dice el código y no la URL", async () => {
    const iconos = iconosEnRed(async () => respuesta("Not found", 404));
    await expect(iconos.svg("lucide:nope", { color: "#000", tamano: 24 })).rejects.toThrow("404");
    await expect(iconos.svg("lucide:nope", { color: "#000", tamano: 24 })).rejects.not.toThrow(/iconify\.design/);
  });

  it("sin red lo dice, sin filtrar el error de fondo", async () => {
    const iconos = iconosEnRed(async () => {
      throw new Error("getaddrinfo ENOTFOUND api.iconify.design /Users/x/secreto");
    });
    const error = await iconos.buscar("home", { limite: 3 }).catch((e: Error) => e);
    expect((error as Error).message).toBe("no hay red o Iconify no responde");
  });

  it("un SVG con contenido activo se rechaza", async () => {
    const iconos = iconosEnRed(async () => respuesta("<svg><script>x</script></svg>"));
    await expect(iconos.svg("lucide:home", { color: "#000", tamano: 24 })).rejects.toThrow("contenido activo");
  });

  it("un JSON ilegible es «incompatible», no una excepción cruda", async () => {
    const iconos = iconosEnRed(async () => respuesta("<html>"));
    await expect(iconos.buscar("home", { limite: 3 })).rejects.toThrow("incompatible");
  });
});
