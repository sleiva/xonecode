import { describe, expect, it } from "vitest";
import { propRepetida } from "./propsRepetidas.js";

describe("una prop repetida en una colección", () => {
  it("la encuentra con sus dos líneas", () => {
    const xne = '<coll name="C">\n<prop name="MAP_A" type="T"/>\n<prop name="MAP_B"/>\n<prop type="B" name="MAP_A"/>\n</coll>';
    expect(propRepetida(xne)).toEqual({ nombre: "MAP_A", linea: 4, primera: 2 });
  });

  it("no cuentan los comentarios, ni `textfont-name`, ni el mismo nombre en OTRA colección", () => {
    expect(propRepetida('<coll name="C">\n<!--<prop name="MAP_A"/>-->\n<prop name="MAP_A"/>\n</coll>')).toBeUndefined();
    expect(propRepetida('<coll name="C"><prop name="A" textfont-name="X.ttf"/><prop name="B" textfont-name="X.ttf"/></coll>')).toBeUndefined();
    expect(propRepetida('<coll name="C"><prop name="A"/></coll>\n<coll name="D"><prop name="A"/></coll>')).toBeUndefined();
  });
});
