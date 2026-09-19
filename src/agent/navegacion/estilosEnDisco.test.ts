import { describe, expect, it } from "vitest";
import { estilosEnDisco } from "./estilosEnDisco.js";
import { DEL_XML } from "../../core/estilos.js";

/** El CSS del esqueleto, recortado: el `prop` global pone 10 y la clase pone 14. */
const CSS = `
prop { fontsize: 10; labelbox: false; }
.btnPrimario { fontsize: 14; bgcolor: #2196F3; forecolor: #FFFFFF; }
.textoTitulo { fontsize: 18; }
`;

const modelo = (extra: Record<string, unknown> = {}) => ({
  app: { attributes: {}, styles: [{ url: "default.css" }] },
  colls: [
    {
      name: "MenuPrincipal",
      attributes: {},
      groups: [
        {
          props: [
            { name: "btnSaludo", type: "B", attributes: { class: "btnPrimario", title: "Saludar" } as Record<string, string> },
            { name: "lblLibre", type: "T", attributes: {} },
          ],
        },
      ],
    },
  ],
  cssFiles: new Map([["default.css", CSS]]),
  ...extra,
});

const cargar = (m = modelo()) => estilosEnDisco(async () => m as never);

describe("estilosEnDisco", () => {
  it("resuelve la CASCADA: la clase gana al `prop` global", async () => {
    // Es el error caro de quien lee la hoja de arriba abajo: `prop { fontsize: 10 }` aparece
    // primero en el fichero y la respuesta buena es 14. Quien resuelve esto es el linter, no
    // nosotros — aquí solo se comprueba que se le pregunta bien.
    const e = await cargar()("MenuPrincipal", "btnSaludo");
    const fontsize = e?.deLaHoja.find((a) => a.atributo === "fontsize");
    expect(fontsize?.valor).toBe("14");
    expect(fontsize?.de).toContain("btnPrimario");
  });

  it("trae lo que solo existe en la clase", async () => {
    const e = await cargar()("MenuPrincipal", "btnSaludo");
    expect(e?.deLaHoja.find((a) => a.atributo === "bgcolor")?.valor).toBe("#2196F3");
  });

  it("el atributo del XML GANA, y la hoja se calla", async () => {
    // Enseñar los dos como si compitieran haría dudar de cuál se aplica. El XML gana
    // (`materialize.ts`), así que el de la hoja no se pinta.
    const m = modelo();
    (m.colls[0].groups[0].props[0].attributes as Record<string, string>) = { class: "btnPrimario", fontsize: "22" };
    const e = await cargar(m)("MenuPrincipal", "btnSaludo");
    expect(e?.delXml.find((a) => a.atributo === "fontsize")).toMatchObject({ valor: "22", de: DEL_XML });
    expect(e?.deLaHoja.find((a) => a.atributo === "fontsize")).toBeUndefined();
  });

  it("dice en QUÉ fichero se declara el selector que aportó", async () => {
    // La mitad del turno se iba en esto: cazar dónde vive la clase, a greps con variantes.
    const e = await cargar()("MenuPrincipal", "btnSaludo");
    expect(e?.declaradoEn.some((d) => d.fichero === "default.css")).toBe(true);
  });

  it("un prop SIN clase sigue recibiendo lo del `prop` global", async () => {
    const e = await cargar()("MenuPrincipal", "lblLibre");
    expect(e?.deLaHoja.find((a) => a.atributo === "fontsize")?.valor).toBe("10");
  });

  it("un prop CON clase no cae al `prop` global, y eso no es que la clase «gane»", async () => {
    // Lo esperable sería «la clase gana al global». No es eso: con `css-extends-default-nodes`
    // apagado —la omisión— el selector `prop` NI SIQUIERA está entre los candidatos, así que la
    // regla global no llega a competir. Fiel a `FieldPropertyValue`
    // (`CXoneDataCollection.mm:1830-1871`). La diferencia importa al explicar un estilo: decir
    // «gana la clase» manda a mirar una regla que no participa.
    const e = await cargar()("MenuPrincipal", "btnSaludo");
    expect(e!.selectores).not.toContain("prop");
    expect(e!.selectores.some((s) => s.includes("btnPrimario"))).toBe(true);
  });

  it("y con `css-extends-default-nodes` puesto, sí cae", async () => {
    // La bandera solo es cierta con exactamente `"true"`, y esa asimetría se copia a propósito.
    const m = modelo();
    (m.app.attributes as Record<string, string>) = { "css-extends-default-nodes": "true" };
    const e = await cargar(m)("MenuPrincipal", "btnSaludo");
    expect(e!.selectores).toContain("prop");
  });

  it("los selectores van de MÁS a MENOS prioridad", async () => {
    // El de clase CON tipo antes que el de clase a secas, y ése antes que el `.clase` pelado.
    const e = await cargar()("MenuPrincipal", "btnSaludo");
    const conTipo = e!.selectores.indexOf("prop.btnPrimario:B");
    const sinTipo = e!.selectores.indexOf("prop.btnPrimario");
    const pelado = e!.selectores.indexOf(".btnPrimario");
    expect(conTipo).toBe(0);
    expect(sinTipo).toBeGreaterThan(conTipo);
    expect(pelado).toBeGreaterThan(sinTipo);
  });

  it("una colección o un prop que no existen devuelven `undefined`, que es un DATO", async () => {
    expect(await cargar()("NoExiste", "x")).toBeUndefined();
    expect(await cargar()("MenuPrincipal", "noExiste")).toBeUndefined();
  });

  it("`extends` no se pinta como atributo: es el mecanismo, no el resultado", async () => {
    const e = await cargar()("MenuPrincipal", "btnSaludo");
    expect(e?.deLaHoja.some((a) => a.atributo === "extends" || a.atributo === "extend")).toBe(false);
  });
});
