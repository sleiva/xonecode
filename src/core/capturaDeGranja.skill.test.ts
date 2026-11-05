import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// La skill no puede importar TypeScript: se prueba su módulo tal cual.
const lib = (await import(pathToFileURL(resolve(__dirname, "../../skills/xone-hotswap/lib/granja.mjs")).href)) as {
  capturaDeGranja: (canal: string, opciones?: { anchura?: number }) => Promise<Buffer>;
  ANCHO_DE_CAPTURA_DE_GRANJA: number;
};

describe("la captura de una copia de la granja", () => {
  // Medido el 05-11-2026: sin `width` la granja la daba a 360 px y el crítico confundía el `÷` con un `+`.
  it("pide siempre el ancho, 1080 por omisión, por el relé de la sesión", async () => {
    const pedidas: string[] = [];
    const servidor = createServer((q, r) => (pedidas.push(q.url ?? ""), r.writeHead(200, { "content-type": "image/jpeg" }).end("JPG")));
    await new Promise<void>((x) => servidor.listen(0, "127.0.0.1", x));
    const puerto = (servidor.address() as { port: number }).port;
    const canal = `ws://127.0.0.1:${puerto}/granja/clave/hotswap`;
    expect(String(await lib.capturaDeGranja(canal))).toBe("JPG");
    await lib.capturaDeGranja(canal, { anchura: 540 });
    await new Promise((x) => servidor.close(x));
    expect(pedidas).toEqual(["/granja/clave/screenshot?width=1080&quality=85", "/granja/clave/screenshot?width=540&quality=85"]);
    expect(lib.ANCHO_DE_CAPTURA_DE_GRANJA).toBe(1080);
  });
});
