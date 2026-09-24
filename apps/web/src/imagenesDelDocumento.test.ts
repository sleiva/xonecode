import { describe, expect, it } from "vitest";
import { RUTA_IMAGEN_DEL_PROYECTO, vistaParaElVisor } from "./imagenesDelDocumento.js";

describe("la vista de un markdown con imágenes, para el visor", () => {
  it("pone el origen delante de cada imagen del proyecto, y deja lo demás igual", () => {
    const vista = "![Login](/imagen-del-proyecto?ruta=doc%2Fimg%2Flogin.png)\n![Web](https://x.com/a.png)\n[enlace](/otra)";
    expect(vistaParaElVisor(vista, "http://127.0.0.1:4173")).toBe(
      "![Login](http://127.0.0.1:4173/imagen-del-proyecto?ruta=doc%2Fimg%2Flogin.png)\n![Web](https://x.com/a.png)\n[enlace](/otra)"
    );
  });

  it("la ruta copiada es la del host", () => {
    expect(RUTA_IMAGEN_DEL_PROYECTO).toBe("/imagen-del-proyecto");
  });
});
