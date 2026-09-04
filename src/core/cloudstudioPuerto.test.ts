import { describe, expect, it } from "vitest";
import { esDoble } from "./ports.js";
import { CloudStudioEnMemoria } from "./ports.js";

describe("CloudStudioEnMemoria", () => {
  it("se declara doble: el aviso de honestidad no puede depender de un booleano", () => {
    expect(esDoble(new CloudStudioEnMemoria())).toBe(true);
  });

  it("sirve el proyecto que le den, con estructura y textos", async () => {
    const puerto = new CloudStudioEnMemoria({
      rama: "master",
      textos: { "app.xml": "<app/>", "app.ini": "name=Demo" },
    });
    await puerto.abrir("Demo");
    expect((await puerto.contexto()).rama).toBe("master");
    expect(await puerto.leerTexto("app.xml")).toBe("<app/>");
    const estructura = await puerto.estructura();
    expect(estructura.entradas.map((e) => e.ruta).sort()).toEqual(["app.ini", "app.xml"]);
    expect(estructura.truncado).toBe(false);
  });

  it("sin proyecto abierto falla con el texto del servidor real, que otra tarea reconoce", async () => {
    await expect(new CloudStudioEnMemoria().contexto()).rejects.toThrow("No project is open");
  });

  it("trunca la estructura al tope dado, que es el otro caso que obliga a la vía degradada", async () => {
    const puerto = new CloudStudioEnMemoria({
      textos: { "a.js": "1", "b.js": "2", "c.js": "3" },
      topeEstructura: 2,
    });
    await puerto.abrir("Demo");
    const estructura = await puerto.estructura();
    expect(estructura.entradas).toHaveLength(2);
    expect(estructura.truncado).toBe(true);
  });

  it("puede fingir que el ZIP falla, que es el caso que obliga a la vía degradada", async () => {
    const puerto = new CloudStudioEnMemoria({ zipFalla: "colección con error de sintaxis" });
    await puerto.abrir("Demo");
    await expect(puerto.descargarZip()).rejects.toThrow(/error de sintaxis/);
  });

  it("registra las escrituras en vez de hacerlas, para poder afirmar sobre ellas", async () => {
    const puerto = new CloudStudioEnMemoria({ textos: { "a.js": "viejo" } });
    await puerto.abrir("Demo");
    await puerto.escribirTexto("a.js", "nuevo");
    await puerto.borrarTexto("b.js");
    expect(puerto.escrituras).toEqual([
      { tipo: "texto", ruta: "a.js", bytes: 5 },
      { tipo: "borrado", ruta: "b.js" },
    ]);
  });
});
