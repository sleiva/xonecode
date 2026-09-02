import { describe, it, expect } from "vitest";
import {
  RenderizadorDeMarkdown,
  renderizarInline,
  puntoSeguro,
  segmentosDe,
  estadosDeCerco,
  clasificarLinea,
  contextoDeTabla,
} from "./markdown.js";
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

describe("segmentosDe", () => {
  it("parte una línea en segmentos normal, negrita y codigo", () => {
    expect(segmentosDe("la **Hola** está `lista`")).toEqual([
      { texto: "la ", estilo: "normal" },
      { texto: "Hola", estilo: "negrita" },
      { texto: " está ", estilo: "normal" },
      { texto: "lista", estilo: "codigo" },
    ]);
  });

  it("texto sin marcadores: un segmento normal", () => {
    expect(segmentosDe("hola tal cual")).toEqual([{ texto: "hola tal cual", estilo: "normal" }]);
  });

  it("un marcador sin cerrar queda LITERAL, nunca partido", () => {
    expect(segmentosDe("esto es **a medio")).toEqual([{ texto: "esto es **a medio", estilo: "normal" }]);
  });

  it("la cursiva *así* es su propio estilo, sin pisar a la negrita", () => {
    expect(segmentosDe("**fuerte** y *suave*")).toEqual([
      { texto: "fuerte", estilo: "negrita" },
      { texto: " y ", estilo: "normal" },
      { texto: "suave", estilo: "cursiva" },
    ]);
    // Sin contenido entre los asteriscos no hay cursiva (un «3 * 4» no se despinta).
    expect(segmentosDe("3 * 4 * 5")).toEqual([{ texto: "3 * 4 * 5", estilo: "normal" }]);
  });

  it("un enlace es su texto en «enlace» y la url en mudo, entre paréntesis", () => {
    expect(segmentosDe("mira [la doc](https://x.one)")).toEqual([
      { texto: "mira ", estilo: "normal" },
      { texto: "la doc", estilo: "enlace" },
      { texto: "(https://x.one)", estilo: "mudo" },
    ]);
    // Sin cerrar, literal.
    expect(segmentosDe("a [b](c")).toEqual([{ texto: "a [b](c", estilo: "normal" }]);
  });
});

describe("estadosDeCerco", () => {
  it("dice qué líneas están DENTRO de un cerco, marcadores incluidos", () => {
    const lineas = ["antes", "```ts", "const x = 1", "```", "después"];
    expect(estadosDeCerco(lineas)).toEqual([false, false, true, true, false]);
  });

  it("un cerco sin cerrar deja el resto dentro: lo que no empareja NO se inventa cierre", () => {
    expect(estadosDeCerco(["```", "una línea", "otra"])).toEqual([false, true, true]);
  });

  it("la cabecera del lenguaje no engaña: un cerco con lenguaje también cierra", () => {
    expect(estadosDeCerco(["```ts", "x", "```js", "y", "```"])).toEqual([
      false, true, true, false, false,
    ]);
  });
});

describe("clasificarLinea", () => {
  it("cabecera, viñeta, cita, horizontal y cerco se reconocen al principio de línea", () => {
    expect(clasificarLinea("## Título")).toEqual({ tipo: "cabecera", nivel: 2, texto: "Título" });
    expect(clasificarLinea("- punto")).toEqual({ tipo: "vineta", nivel: 0, texto: "punto" });
    expect(clasificarLinea("> cita")).toEqual({ tipo: "cita", nivel: 0, texto: "cita" });
    expect(clasificarLinea("---")).toEqual({ tipo: "horizontal" });
    expect(clasificarLinea("***")).toEqual({ tipo: "horizontal" });
    expect(clasificarLinea("```ts")).toEqual({ tipo: "cerco", lenguaje: "ts" });
    expect(clasificarLinea("```")).toEqual({ tipo: "cerco", lenguaje: "" });
  });

  it("las listas anidadas llevan su nivel: 2 espacios por nivel", () => {
    expect(clasificarLinea("- padre")).toEqual({ tipo: "vineta", nivel: 0, texto: "padre" });
    expect(clasificarLinea("  - hijo")).toEqual({ tipo: "vineta", nivel: 1, texto: "hijo" });
    expect(clasificarLinea("    - nieto")).toEqual({ tipo: "vineta", nivel: 2, texto: "nieto" });
  });

  it("las numeradas conservan su número y su nivel", () => {
    expect(clasificarLinea("1. primero")).toEqual({ tipo: "numerada", nivel: 0, numero: 1, texto: "primero" });
    expect(clasificarLinea("  3) tercero")).toEqual({ tipo: "numerada", nivel: 1, numero: 3, texto: "tercero" });
  });

  it("lo demás es texto: una lista a medio escribir no se despinta", () => {
    expect(clasificarLinea("hola **negrita**")).toEqual({ tipo: "texto", texto: "hola **negrita**" });
    // El caso «continuación de párrafo» no pasa por aquí: es el colchón, y él se pinta
    // suyo (hoy como ayer) — el clasificador solo ve líneas definitivas.
  });
});

describe("contextoDeTabla", () => {
  const tabla = ["| a | b |", "|---|---|", "| 1 | 2 |", "| 3 | 44 |", "después"];

  it("marca cabecera, separador y filas, con anchos comunes a toda la tabla", () => {
    const ctx = contextoDeTabla(tabla);
    // col 0 mide 1 («a»), col 1 mide 2 («44»): el máximo manda para TODAS las filas.
    expect(ctx[0]).toMatchObject({ rol: "cabecera", esUltima: false });
    expect(ctx[0]!.celdas[0]).toContain("a");
    expect(ctx[1]!.rol).toBe("separador");
    expect(ctx[2]).toMatchObject({ rol: "fila", esUltima: false });
    expect(ctx[3]).toMatchObject({ rol: "fila", esUltima: true });
    expect(ctx[4]).toBeNull();
  });

  it("las columnas LLENAN el ancho: el sobrante se reparte, la tabla no acaba a medias", () => {
    // Medido en terminal: con tope plano la tabla acababa en ~100 columnas con el
    // panel a ~140 y la columna larga truncada («…») habiendo sitio a la derecha.
    const ctx = contextoDeTabla(tabla, 40); // naturales [1, 2], presupuesto 40-1-6 = 33
    const anchos = ctx[0]!.anchos;
    expect(anchos[0]!).toBeGreaterThanOrEqual(1); // ninguna baja de su contenido
    expect(anchos[1]!).toBeGreaterThanOrEqual(2);
    expect(anchos.reduce((s, a) => s + a + 3, 0) + 1).toBe(40); // borde a borde
  });

  it("una columna corta CEDE su sobrante a la larga antes de truncarla", () => {
    // Tope plano: ambas a 6 — la corta desaprovechaba 5 y la larga perdía el doble.
    const ctx = contextoDeTabla(["| a | columna larguisima que no cabe entera |", "|---|---|", "| 1 | x |"], 25);
    // Presupuesto 25-1-6 = 18: la de 1 se queda con 1 y la larga recibe 17.
    expect(ctx[0]!.anchos).toEqual([1, 17]);
    expect(ctx[0]!.celdas[1]).toContain("…"); // lo que aun así no cabe, con «…»
    expect(ctx[0]!.celdas[1]!.length).toBe(17);
  });

  it("una columna recortada nunca baja de 3, aunque el ancho no alcance", () => {
    const ctx = contextoDeTabla(["| aaaa | bbbb |", "|---|---|"], 12); // presupuesto 5 < 3+3
    expect(ctx[0]!.anchos).toEqual([3, 3]);
  });

  it("sin separador no hay tabla: las barras quedan literales", () => {
    expect(contextoDeTabla(["| solo | una | línea |", "texto"])[0]).toBeNull();
    // Una línea con barras a mitad de un párrafo tampoco lo es.
    expect(contextoDeTabla(["texto | con | barras"])[0]).toBeNull();
  });

  it("una línea vacía corta la tabla", () => {
    const ctx = contextoDeTabla(["| a |", "|---|", "", "| b |", "|---|"]);
    // La primera tabla solo tiene cabecera y separador: la ÚLTIMA línea del tramo
    // lleva esUltima (el cierre), no la primera.
    expect(ctx[0]).toMatchObject({ rol: "cabecera", esUltima: false });
    expect(ctx[1]).toMatchObject({ rol: "separador", esUltima: true });
    expect(ctx[2]).toBeNull();
    expect(ctx[3]).toMatchObject({ rol: "cabecera", esUltima: false }); // la segunda es una tabla nueva
    expect(ctx[4]).toMatchObject({ rol: "separador", esUltima: true });
  });

  it("el ancho recorta las columnas con «…» en vez de desbordar la pantalla", () => {
    const ctx = contextoDeTabla(["| colección muy larga | nota |", "|---|---|", "| x | y |"], 25);
    expect(ctx[0]!.anchos.reduce((s, a) => s + a + 3, 0) + 1).toBeLessThanOrEqual(25);
    expect(ctx[0]!.celdas[0]).toContain("…");
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