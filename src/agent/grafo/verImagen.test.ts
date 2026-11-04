import { describe, expect, it } from "vitest";
import { crearImagenesVistas, crearVerImagen, MARCA_DE_IMAGEN } from "./verImagen.js";

describe("view_image", () => {
  it("lee la imagen, la guarda por el hash de sus bytes y deja la marca en el resultado", async () => {
    const vistas = crearImagenesVistas();
    const ver = crearVerImagen({ leer: async () => Buffer.from("png"), vistas });
    const texto = String(await ver.invoke({ path: "/artefactos/captura-1.png" }));
    const id = [...texto.matchAll(MARCA_DE_IMAGEN)][0]?.[1];
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(vistas.de(id!)).toEqual({ base64: Buffer.from("png").toString("base64"), mime: "image/png", ruta: "/artefactos/captura-1.png" });
  });

  it("lo que no es una imagen, o no se puede leer, vuelve como texto y no deja marca", async () => {
    const vistas = crearImagenesVistas();
    const ver = crearVerImagen({ leer: async () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); }, vistas });
    expect(String(await ver.invoke({ path: "/notas.md" }))).not.toMatch(MARCA_DE_IMAGEN);
    expect(String(await ver.invoke({ path: "/artefactos/no.png" }))).toContain("ENOENT");
  });
});
