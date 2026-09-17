import { describe, expect, it } from "vitest";
import { PREGUNTAS } from "./preguntas.js";
import { generarEsqueleto } from "../core/esqueleto.js";

const DATOS = { nombre: "Banco", titulo: "Banco", orientacion: "portrait" as const, login: true };
const esqueleto = new Map(generarEsqueleto(DATOS).map((f) => [f.ruta, f.contenido]));
const juez = (nombre: string) => PREGUNTAS.find((p) => p.nombre === nombre)!.correcta;

describe("las preguntas del banco", () => {
  /**
   * **El hecho tiene que estar en el proyecto**, o el juez suspendería a todo el mundo para
   * siempre y el banco mediría lo contrario de lo que cree. Se comprueba contra el esqueleto
   * de verdad, que es el que el banco copia.
   */
  it("preguntan por hechos que el esqueleto de verdad contiene", () => {
    expect(esqueleto.get("app.xml")).toContain("EntradaApp");
    expect(esqueleto.get("app.xml")).toContain("default.css");
    expect(esqueleto.has("Login.xne")).toBe(true);
  });

  it("aciertan la respuesta buena", () => {
    expect(juez("entrypoint")("El entrypoint es la colección EntradaApp.")).toBe(true);
    expect(juez("estilo")("Usa `default.css`, declarada en app.xml.")).toBe(true);
    expect(juez("login")("Sí: la colección de login está en Login.xne.")).toBe(true);
  });

  it("suspenden la respuesta equivocada, que es para lo que existen", () => {
    expect(juez("entrypoint")("El entrypoint es MenuPrincipal.")).toBe(false);
    // Nombrar el fichero correcto sin decir de dónde sale no contesta la pregunta.
    expect(juez("estilo")("Usa una hoja llamada default.css.")).toBe(false);
    expect(juez("login")("No hay login en esta aplicación.")).toBe(false);
  });

  it("no suspenden por la REDACCIÓN: se juzga el hecho, no el estilo", () => {
    expect(juez("entrypoint")("entradaapp")).toBe(true);
  });

  it("un señuelo nombrado de paso no invalida una respuesta correcta", () => {
    expect(juez("entrypoint")("Es EntradaApp; MenuPrincipal viene después, desde ella.")).toBe(true);
  });
});
