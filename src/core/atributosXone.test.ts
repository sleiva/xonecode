import { describe, expect, it } from "vitest";
import { consultarAtributos, consultarVariosAtributos, indiceDeAtributos, interpretarReferenciaDeAtributos, PIE_DEL_INDICE, TOPE_DE_ATRIBUTOS_POR_CONSULTA } from "./atributosXone.js";

const REF = [
  "## 3. Nodo `<frame>` — Frame",
  "### 3.4 Apariencia",
  "| Atributo | Tipo | Default | Descripción |",
  "|---|---|---|---|",
  "| `bgcolor` | color | heredado | Color de **fondo** del frame. |",
  "| `tmargin` / `bmargin` | medida | `0` | Margenes externos. |",
  "",
  "## 1. Nodo `<coll>` — Pantalla",
  "| Nodo hijo | Descripción |",
  "|---|---|",
  "| `<create>` | Script al crear. |",
].join("\n");

describe("el índice de atributos, desde las tablas de la referencia", () => {
  const e = interpretarReferenciaDeAtributos(REF, "xml-ui/x.md");
  it("lee nodo, sección, tipo, omisión y descripción; una fila con dos nombres da dos; la tabla de nodos hijos se salta", () => {
    expect(e.map((x) => `${x.nodo}.${x.atributo}`)).toEqual(["frame.bgcolor", "frame.tmargin", "frame.bmargin"]);
    expect(e[0]).toMatchObject({ tipo: "color", defecto: "heredado", descripcion: "Color de fondo del frame.", seccion: "§3.4 Apariencia" });
    expect(e[1]!.defecto).toBe("0");
  });

  it("VARIOS atributos en una consulta: cada uno con su respuesta, el pie una vez, sin repetidos y con tope", () => {
    // Medido en Maset: quince consultas de un atributo cada una, en tandas.
    const indice = indiceDeAtributos(e);
    const r = consultarVariosAtributos(indice, { atributos: ["bgcolor", "tmargin", "bgcolor", " ", "inventado"] });
    expect(r).toContain("### bgcolor");
    expect(r).toContain("### tmargin");
    expect(r).toContain("`inventado` no aparece en las tablas");
    expect(r.match(/### bgcolor/g)).toHaveLength(1);
    expect(r.split(PIE_DEL_INDICE)).toHaveLength(2);
    const muchos = consultarVariosAtributos(indice, { atributos: Array.from({ length: TOPE_DE_ATRIBUTOS_POR_CONSULTA + 2 }, (_, i) => `a${i}`) });
    expect(muchos).toContain("(2 más sin contestar");
  });

  it("la consulta sin atributo ni nodo explica qué preguntar", () => {
    expect(consultarAtributos(indiceDeAtributos(e), {})).toContain("Pregunta por `atributo`");
    expect(consultarAtributos(indiceDeAtributos(e), { nodo: "vista" })).toContain("Las tablas indexadas no traen el nodo <vista>");
  });
});
