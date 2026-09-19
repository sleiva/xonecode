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
    expect(juez("estilo")("La declara mappings.xne, pero no sé cuál.")).toBe(false);
    expect(juez("login")("No hay login en esta aplicación.")).toBe(false);
  });

  it("el estilo vale desde CUALQUIERA de los dos ficheros que lo declaran", () => {
    // El esqueleto lo declara en `app.xml` y en `mappings.xne`: exigir uno suspendía a quien
    // encontraba el otro con un `grep`, que es el camino más barato y una respuesta cierta.
    expect(esqueleto.get("mappings.xne")).toContain("default.css");
    expect(juez("estilo")("`default.css`, declarada en mappings.xne:4.")).toBe(true);
    expect(juez("estilo")("`default.css`, declarada en app.xml.")).toBe(true);
  });

  it("la de capacidad acepta la respuesta real y caza la degenerada", () => {
    // El texto de arriba es un recorte de la respuesta REAL medida el 17-09-2026, con su «no
    // hay un módulo CRM» incluido: un juez que castigara esa frase suspendería a la buena.
    expect(
      juez("capacidad")(
        "Sí, es viable: modelas contactos y visitas como colecciones `<coll>` en sus `.xne`. No hay un módulo CRM: lo modelas tú."
      )
    ).toBe(true);
    expect(juez("capacidad")("No se puede: XOne no sirve para eso.")).toBe(false);
    // Y sin nombrar el mecanismo no contesta la segunda mitad de la pregunta.
    expect(juez("capacidad")("Sí, claro, XOne vale para cualquier app de gestión.")).toBe(false);
  });

  it("la de cambio pide los hechos que el esqueleto de verdad tiene", () => {
    // Si el hecho no estuviera en el proyecto, el juez suspendería a todo el mundo para
    // siempre y la celda mediría lo contrario de lo que cree.
    expect(esqueleto.get("MenuPrincipal.xne")).toContain("btnSaludo");
    expect(esqueleto.get("MenuPrincipal.xne")).toContain("showToast");
    expect(esqueleto.get("functions.js")).toContain("function confirmar");
  });

  it("la de cambio caza al que propone un msgBox sin mirar lo que ya hay", () => {
    // Es la respuesta degenerada cara: escribir el ayudante de nuevo en vez de encontrar el
    // que existe. Es lo que hace quien no se ha enterado, y sale más barata en tokens.
    expect(
      juez("cambio")(
        "En MenuPrincipal.xne, el `onclick` de btnSaludo. Añade un `ui.msgBox(...)` antes del toast."
      )
    ).toBe(false);
    expect(
      juez("cambio")(
        "El botón está en MenuPrincipal.xne. El proyecto ya tiene `confirmar(mensaje, titulo)` en functions.js: úsala."
      )
    ).toBe(true);
  });

  it("la de cambio no se conforma con nombrar la función sin decir dónde vive", () => {
    // La pregunta tiene dos mitades y esta es la segunda: «en qué fichero está».
    expect(juez("cambio")("Usa `confirmar()` antes del toast de MenuPrincipal.")).toBe(false);
  });

  it("no suspenden por la REDACCIÓN: se juzga el hecho, no el estilo", () => {
    expect(juez("entrypoint")("entradaapp")).toBe(true);
  });

  it("un señuelo nombrado de paso no invalida una respuesta correcta", () => {
    expect(juez("entrypoint")("Es EntradaApp; MenuPrincipal viene después, desde ella.")).toBe(true);
  });
});
