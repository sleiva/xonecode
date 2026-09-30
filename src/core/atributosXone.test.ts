import { describe, expect, it } from "vitest";
import { consultarAtributos, indiceDeAtributos, interpretarReferenciaDeAtributos } from "./atributosXone.js";

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

  it("la consulta sin atributo ni nodo explica qué preguntar", () => {
    expect(consultarAtributos(indiceDeAtributos(e), {})).toContain("Pregunta por `atributo`");
    expect(consultarAtributos(indiceDeAtributos(e), { nodo: "vista" })).toContain("Las tablas indexadas no traen el nodo <vista>");
  });
});
