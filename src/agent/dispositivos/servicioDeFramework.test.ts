import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { servicioDeFramework } from "./servicioDeFramework.js";

const casa = (): string => mkdtempSync(join(tmpdir(), "servicio-fw-"));
/** Un paquete con la credencial empaquetada, para que haya catálogo. */
const paqueteConCredencial = (): string => {
  const raiz = mkdtempSync(join(tmpdir(), "paquete-fw-"));
  mkdirSync(join(raiz, "dist"));
  writeFileSync(join(raiz, "dist", "byxone.json"), JSON.stringify({ clientId: "xcode-read", secreto: "s" }));
  return raiz;
};
const contesta = (cuerpo: unknown, status = 200) => (async () => new Response(JSON.stringify(cuerpo), { status })) as typeof fetch;

describe("lo que se ofrece instalar", () => {
  it("sin credencial, solo lo local, y se dice por qué no hay catálogo", async () => {
    const s = servicioDeFramework({ casa: casa(), entorno: {}, raizDelPaquete: casa() });
    const r = await s.ofrecer();
    expect(r.opciones).toEqual([]);
    expect(r.motivoDelCatalogo).toContain("credencial");
  });

  it("con catálogo, sus versiones de Android/Frame, la más nueva preferida si no hay locales", async () => {
    const s = servicioDeFramework({
      casa: casa(), entorno: {}, raizDelPaquete: paqueteConCredencial(),
      fetch: contesta([{ plat: 1, type: 2, title: "v5.0.5.8rel", storedFileId: 8 }, { plat: 1, type: 2, title: "v5.0.5.10rel", storedFileId: 10 }]),
    });
    const r = await s.ofrecer();
    expect(r.motivoDelCatalogo).toBeUndefined();
    expect(r.opciones[0]).toMatchObject({ origen: "catalogo", ficheroId: 10, preferida: true });
  });

  it("un catálogo que contesta y del que NO sale nada se DICE, no es un desplegable vacío mudo", async () => {
    const s = servicioDeFramework({
      casa: casa(), entorno: {}, raizDelPaquete: paqueteConCredencial(),
      fetch: contesta([{ forma: "desconocida" }, { otra: 1 }]),
    });
    const r = await s.ofrecer();
    expect(r.opciones).toEqual([]);
    expect(r.motivoDelCatalogo).toContain("ninguna se reconoce");
  });

  it("un error del servicio llega como motivo y lo local se ofrece igual", async () => {
    const s = servicioDeFramework({
      casa: casa(), entorno: {}, raizDelPaquete: paqueteConCredencial(),
      fetch: contesta({ error: "FIRMA_INVALIDA" }, 401),
    });
    expect((await s.ofrecer()).motivoDelCatalogo).toContain("secreto");
  });

  it("resolver solo acepta lo servido", async () => {
    const s = servicioDeFramework({
      casa: casa(), entorno: {}, raizDelPaquete: paqueteConCredencial(),
      fetch: contesta([{ plat: 1, type: 2, title: "v5.0.5.8rel", storedFileId: 8 }]),
    });
    const { opciones } = await s.ofrecer();
    expect(s.resolver({ catalogo: 8 }, opciones)).toEqual({ origen: "catalogo", ficheroId: 8, titulo: "v5.0.5.8rel" });
    expect(s.resolver({ catalogo: 9 }, opciones)).toBeUndefined();
    expect(s.resolver({ local: "a".repeat(64) }, opciones)).toBeUndefined();
  });
});
