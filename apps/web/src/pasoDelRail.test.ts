import { describe, it, expect } from "vitest";
import { pasoDelRail } from "./pasoDelRail.js";

describe("pasoDelRail", () => {
  it("una llamada: verbo en pasado y su blanco", () => {
    expect(pasoDelRail({ nombre: "read_file", blanco: "/login.js" })).toEqual({
      verbo: "Leyó",
      blanco: "/login.js",
      esNombre: false,
      delegacion: false,
    });
  });

  it("una delegación: el blanco es un NOMBRE y el nodo es de otro color", () => {
    expect(pasoDelRail({ nombre: "task", blanco: "developer-xone" })).toMatchObject({
      verbo: "Delegó en",
      blanco: "developer-xone",
      esNombre: true,
      delegacion: true,
    });
  });

  it("una racha: las veces, los blancos y cuántos más", () => {
    expect(pasoDelRail({ nombre: "read_file", veces: 6, blancos: ["a", "b", "c"], masBlancos: 2 })).toMatchObject({
      verbo: "Leyó",
      veces: 6,
      blancos: ["a", "b", "c"],
      masBlancos: 2,
    });
  });

  it("un fallo lleva su motivo", () => {
    expect(pasoDelRail({ nombre: "edit_file", blanco: "/x", error: "rechazada" })?.error).toBe("rechazada");
  });

  it("sin nombre, o con una tool que no está en la tabla, no hay paso: se pinta la línea de antes", () => {
    expect(pasoDelRail(undefined)).toBeUndefined();
    expect(pasoDelRail({})).toBeUndefined();
    expect(pasoDelRail({ nombre: "studio_edit_file", blanco: "x" })).toBeUndefined();
  });

  it("con nombre pero SIN blanco ni veces (una sesión de antes) tampoco: perdería la ruta del texto", () => {
    expect(pasoDelRail({ nombre: "read_file" })).toBeUndefined();
    // Una racha sin blancos sí: las veces son el dato nuevo.
    expect(pasoDelRail({ nombre: "grep", veces: 2 })).toMatchObject({ verbo: "Buscó", veces: 2 });
  });
});
