import { describe, expect, it } from "vitest";
import { crearMedirMaqueta } from "./medirMaqueta.js";

const medidas = () => ({ ancho: 390, alto: 746 });

describe("medir_maqueta", () => {
  it("con code.html devuelve las filas medidas", async () => {
    const t = crearMedirMaqueta({
      leer: async () => Buffer.from("png"),
      medidas,
      cajas: async () => ({ ancho: 390, alto: 746, elementos: [{ texto: "AC", caja: { x: 24, y: 350, ancho: 76, alto: 64 }, boton: true }] }),
    });
    const r = String(await t.invoke({ maqueta: "/diseno/screen.png" }));
    expect(r).toContain("MEDIDA en su code.html");
    expect(r).toContain("«AC» (botón)");
  });

  it("sin code.html, sin abrir o con una ruta mala lo DICE, y manda a mirarla, no a medir píxeles", async () => {
    const sinHtml = crearMedirMaqueta({ leer: async () => Buffer.from("png"), medidas, cajas: async () => undefined });
    expect(String(await sinHtml.invoke({ maqueta: "/diseno/screen.png" }))).toMatch(/sin code.html.*describe_image.*no midas píxeles/s);
    const rota = crearMedirMaqueta({ leer: async () => { throw Object.assign(new Error("/Users/x/ENOENT"), { code: "ENOENT" }); }, medidas, cajas: async () => undefined });
    const r = String(await rota.invoke({ maqueta: "/diseno/screen.png" }));
    expect(r).toContain("ENOENT");
    expect(r).not.toContain("/Users/");
    expect(String(await sinHtml.invoke({ maqueta: "diseno/screen.png" }))).toMatch(/^No se mide/);
  });
});
