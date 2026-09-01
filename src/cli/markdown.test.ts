import { describe, it, expect } from "vitest";
import { RenderizadorDeMarkdown, renderizarInline, puntoSeguro } from "./markdown.js";
import { crearTema } from "./tema.js";

const CON = crearTema(true);
const SIN = crearTema(false);

describe("renderizarInline", () => {
  it("**negrita** se pinta con el token de negrita", () => {
    expect(renderizarInline("la **colección Hola** está lista", CON)).toBe(
      `la ${CON.negrita}colección Hola${CON.reset} está lista`
    );
  });

  it("`código` se pinta con el token mudo", () => {
    expect(renderizarInline("usa `xone-simulator --json`", CON)).toBe(
      `usa ${CON.mudo}xone-simulator --json${CON.reset}`
    );
  });

  it("sin color, la salida es el texto tal cual: limpio para pipes", () => {
    expect(renderizarInline("la **Hola** y `--json`", SIN)).toBe("la **Hola** y `--json`");
  });

  it("un ** que no empareja queda literal — no se inventa cierre", () => {
    expect(renderizarInline("2 ** 3 no es markdown", CON)).toBe("2 ** 3 no es markdown");
  });
});

describe("RenderizadorDeMarkdown", () => {
  const r = () => new RenderizadorDeMarkdown(CON);

  it("una cabecera pierde las almohadillas y va en negrita", () => {
    expect(r().linea("## Qué he hecho")).toBe(`${CON.negrita}Qué he hecho${CON.reset}`);
  });

  it("una viñeta «- » se pinta con el punto que usan las consolas de verdad", () => {
    expect(r().linea("- crear la colección")).toBe("• crear la colección");
    expect(r().linea("* otra forma de viñeta")).toBe("• otra forma de viñeta");
  });

  it("las listas numeradas van tal cual: el número ya es jerarquía visible", () => {
    expect(r().linea("1. primero")).toBe("1. primero");
  });

  it("dentro de un cerco de código todo va mudo, sin parsear marcadores", () => {
    const rend = r();
    expect(rend.linea("```xml")).toBe(""); // el cerco no se pinta: es ruido del formato
    expect(rend.linea("<coll **literal** name=\"Hola\">")).toBe(
      `${CON.mudo}<coll **literal** name="Hola">${CON.reset}`
    );
    expect(rend.linea("```")).toBe("");
    // El cerco se ha cerrado: lo de después vuelve a parsearse.
    expect(rend.linea("**ya** fuera")).toBe(`${CON.negrita}ya${CON.reset} fuera`);
  });

  it("un trozo que NO empieza línea no se mira como cabecera ni viñeta", () => {
    const rend = r();
    rend.linea("esto es un párrafo largo que");
    // La continuación de esa línea: un «- » o un «##» en medio no son formato.
    expect(rend.linea("contiene - rayas y ## almohadillas", false)).toBe(
      "contiene - rayas y ## almohadillas"
    );
  });

  it("sin color, la línea sale tal cual la escribió el modelo — cabeceras y cercos también", () => {
    // Mismo pacto que renderizarInline: a un pipe no se le despinta el markdown, y
    // quitarle los «##» o el cerco sin dar nada a cambio es quitarle información.
    const rend = new RenderizadorDeMarkdown(SIN);
    expect(rend.linea("## Qué he hecho")).toBe("## Qué he hecho");
    expect(rend.linea("- viñeta")).toBe("- viñeta");
    expect(rend.linea("```xml")).toBe("```xml");
    expect(rend.linea("<coll/>")).toBe("<coll/>");
    expect(rend.linea("```")).toBe("```");
    expect(rend.linea("**ya** fuera")).toBe("**ya** fuera");
  });
});

describe("puntoSeguro", () => {
  it("por debajo del mínimo no se corta: se espera al salto de línea", () => {
    expect(puntoSeguro("un párrafo corto", 80)).toBeUndefined();
  });

  it("corta en un ESPACIO, no en medio de una palabra", () => {
    const punto = puntoSeguro("palabra ".repeat(30).trim(), 40);
    expect(punto).toBeDefined();
    // El carácter del corte es el espacio.
  });

  it("no corta con una **negrita** abierta: espera a que se cierre", () => {
    const texto = "esto es **una negrita muy larga que atraviesa el corte seguro** y sigue";
    const punto = puntoSeguro(texto, 40)!;
    // El prefijo cortado tiene la negrita ENTERA (número par de **) o ninguna.
    const prefijo = texto.slice(0, punto);
    expect(prefijo.split("**").length % 2).toBe(1); // impar trozos = pares de **
  });

  it("no corta con un `código` abierto: el par de comillas debe estar entero", () => {
    const texto = "mira `xone-simulator --json --salida larga` y sigue escribiendo más texto aquí";
    const punto = puntoSeguro(texto, 40)!;
    const prefijo = texto.slice(0, punto);
    expect(prefijo.split("`").length % 2).toBe(1);
  });
});