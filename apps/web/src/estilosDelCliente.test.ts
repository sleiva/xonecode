import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NOMBRES_DE_SEMILLA } from "./temas.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ESTILOS = join(AQUI, "..", "estilos");

/** Todas las hojas del cliente, `estilos/` y `src/` enteros. */
function hojasDelCliente(): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string): void => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (nombre.endsWith(".css")) salida.push(ruta);
    }
  };
  recorrer(ESTILOS);
  recorrer(AQUI);
  return salida;
}

function sinComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Los alias USADOS sin fallback: `var(--dsw-alias-x)`. Uno con fallback no se cuenta aquí (las familias tipográficas, abajo). */
function aliasUsados(css: string): Set<string> {
  const usados = new Set<string>();
  for (const m of sinComentarios(css).matchAll(/var\(\s*--dsw-alias-([a-z0-9-]+)\s*\)/g)) usados.add(m[1]!);
  return usados;
}

function aliasDefinidos(css: string): Set<string> {
  const definidos = new Set<string>();
  for (const m of sinComentarios(css).matchAll(/--dsw-alias-([a-z0-9-]+)\s*:/g)) definidos.add(m[1]!);
  return definidos;
}

/**
 * Un alias que no existe no da error: resuelve a nada, y el borde no se pinta, el fondo sale
 * transparente y la letra se hereda. Es el fallo mudo contra el que este cliente escribe sus
 * tests de estilo. Se mira aquí y no en `Barra.test.tsx` porque aquello es sobre LITERALES.
 */
describe("los alias que usa el cliente existen", () => {
  it("todo var(--dsw-alias-…) sin fallback está definido en alguna hoja", () => {
    const hojas = hojasDelCliente().map((r) => ({ ruta: r, css: readFileSync(r, "utf8") }));
    const definidos = new Set<string>();
    for (const h of hojas) for (const a of aliasDefinidos(h.css)) definidos.add(a);
    const faltan: string[] = [];
    for (const h of hojas) {
      for (const a of aliasUsados(h.css)) if (!definidos.has(a)) faltan.push(`${a} (${h.ruta.split("apps/web/")[1]})`);
    }
    expect(faltan).toEqual([]);
  });
});

/**
 * Una familia tipográfica se lee de UNO de los dos tokens de `estilos/tipografia.css`, nunca de
 * un alias inventado ni de una pila escrita a mano. Medido el 05-11-2026: 13 reglas leían
 * `--dsw-font-mono`, `--dsw-alias-font-mono` o `--dsw-font-family-mono`, que NO existen en
 * ninguna hoja. Sin fallback la regla se invalida y la letra se HEREDA (Inter donde se quería
 * monoespaciada); con fallback cae en la `monospace` del sistema, no en JetBrains Mono. Ninguno
 * de los dos da error: es el fallo mudo de siempre, y el test de alias de arriba no lo veía
 * porque solo mira `--dsw-alias-*` SIN fallback.
 */
describe("la tipografía sale de sus dos tokens", () => {
  it("cada font-family de una hoja del cliente lee --dsw-font-family, --ds-font-family-code o la de títulos", () => {
    // `--xonecode-fuente-titulo` es la tercera, declarada en el mismo sitio: en el clásico vale `--dsw-font-family`
    // y un estilo la cambia (Neo brutalist, Space Grotesk).
    const permitidas = /^(var\(--dsw-font-family\)|var\(--ds-font-family-code\)|var\(--xonecode-fuente-titulo\)|inherit)$/;
    const sueltas: string[] = [];
    for (const ruta of hojasDelCliente().filter((r) => r.endsWith(".module.css"))) {
      const css = sinComentarios(readFileSync(ruta, "utf8"));
      for (const m of css.matchAll(/(?<![-\w])font-family\s*:\s*([^;}]+)/g)) {
        const valor = m[1]!.trim();
        if (!permitidas.test(valor)) sueltas.push(`${ruta.split("apps/web/")[1]}: ${valor}`);
      }
    }
    expect(sueltas).toEqual([]);
  });
});

/**
 * La escala tipográfica (`estilos/tipografia.css`): un tamaño y un peso salen de sus tokens.
 * Medido el 05-11-2026 antes de tenerla: 16 tamaños distintos en el CSS y 17 combinaciones de
 * tamaño, peso y familia en UNA pantalla. Lo que se queda fuera de la escala va aquí con su
 * motivo; uno nuevo sin motivo da rojo.
 */
const TAMANOS_FUERA_DE_ESCALA: Record<string, string> = {
  "Marca.module.css: 44px": "el logotipo grande del splash: es la marca, no texto",
  "Marca.module.css: 20px": "el nombre junto al logotipo: va con la marca, no con la escala",
  "Marca.module.css: 15px": "el eslogan del splash, con la marca",
  "Turno.module.css: 15px": "glifo: las flechas de turno anterior/siguiente",
  "Pregunta.module.css: 18px": "glifo: el ✓ o ! de una pregunta contestada",
  "Pestanas.module.css: 18px": "glifo: la × de cerrar el panel",
  "RejillaDeAdjuntos.module.css: 20px": "glifo: el + de añadir un fichero",
  "LoAprendido.module.css: 0.92em": "código en línea: relativo al texto que lo rodea",
  "Barra.module.css: inherit": "hereda del contexto a propósito",
};

const PESOS_FUERA_DE_ESCALA: Record<string, string> = {
  "Marca.module.css: 800": "el logotipo: la marca lleva su propio peso",
};

function declaracionesDe(propiedad: string): Array<{ fichero: string; valor: string }> {
  const salida: Array<{ fichero: string; valor: string }> = [];
  for (const ruta of hojasDelCliente().filter((r) => r.includes("/src/") && r.endsWith(".module.css"))) {
    const css = sinComentarios(readFileSync(ruta, "utf8"));
    for (const m of css.matchAll(new RegExp(`(?<![-\\w])${propiedad}\\s*:\\s*([^;}]+)`, "g"))) {
      salida.push({ fichero: ruta.split("/").pop()!, valor: m[1]!.trim() });
    }
  }
  return salida;
}

describe("la escala tipográfica", () => {
  it("cada font-size de src/ lee un --tipo-* o está en la lista de excepciones con su motivo", () => {
    const sueltos = declaracionesDe("font-size")
      .filter((d) => !/^var\(--tipo-[a-z]+\)$/.test(d.valor))
      .map((d) => `${d.fichero}: ${d.valor}`)
      .filter((clave) => !(clave in TAMANOS_FUERA_DE_ESCALA));
    expect(sueltos).toEqual([]);
  });

  it("cada font-weight de src/ lee un --peso-* (400, 500, 600: sin 700 ni 800)", () => {
    const sueltos = declaracionesDe("font-weight")
      .filter((d) => !/^(var\(--peso-[a-z]+\)|inherit)$/.test(d.valor))
      .map((d) => `${d.fichero}: ${d.valor}`)
      .filter((clave) => !(clave in PESOS_FUERA_DE_ESCALA));
    expect(sueltos).toEqual([]);
  });

  it("cada token que se usa está declarado en tipografia.css", () => {
    const tipografia = sinComentarios(readFileSync(join(ESTILOS, "tipografia.css"), "utf8"));
    const usados = new Set(
      [...declaracionesDe("font-size"), ...declaracionesDe("font-weight")]
        .flatMap((d) => [...d.valor.matchAll(/var\((--(?:tipo|peso)-[a-z]+)\)/g)].map((m) => m[1]!)),
    );
    const faltan = [...usados].filter((t) => !new RegExp(`${t}\\s*:`).test(tipografia));
    expect(faltan).toEqual([]);
  });

  it("una etiqueta en mayúsculas es SIEMPRE la misma: --tipo-mini y --peso-fuerte", () => {
    const distintas: string[] = [];
    for (const ruta of hojasDelCliente().filter((r) => r.includes("/src/") && r.endsWith(".module.css"))) {
      const css = sinComentarios(readFileSync(ruta, "utf8"));
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const cuerpo = m[2]!;
        if (!/text-transform:\s*uppercase/.test(cuerpo)) continue;
        if (!/font-size:\s*var\(--tipo-mini\)/.test(cuerpo) || !/font-weight:\s*var\(--peso-fuerte\)/.test(cuerpo)) {
          distintas.push(`${ruta.split("/").pop()} ${m[1]!.trim()}`);
        }
      }
    }
    expect(distintas).toEqual([]);
  });

  it("ni los encabezados ni <strong>/<b> se llevan el bold (700) del navegador", () => {
    const tipografia = sinComentarios(readFileSync(join(ESTILOS, "tipografia.css"), "utf8"));
    expect(tipografia).toMatch(/h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6,\s*strong,\s*b\s*\{\s*font-weight:\s*var\(--peso-fuerte\)/);
  });

  /**
   * Un `<h2>` es el título de una tarjeta, de una sección o de un diálogo: lee `--tipo-titulo`
   * (o `--tipo-display`). Medido el 05-11-2026: «Copia local», «Tu equipo», «Tareas», el nombre de
   * cada proyecto del Escritorio… iban a 14, el tamaño del TEXTO, y no se distinguían de él. Lo
   * que va en mayúsculas es un rótulo, no un título, y tiene su propia regla (arriba). Un `<h2>`
   * cuya regla no fija tamaño ni compone otra hereda: eso también es un fallo.
   */
  it("cada <h2> con clase lee --tipo-titulo o --tipo-display, o es un rótulo en mayúsculas", () => {
    const componentes = join(AQUI, "componentes");
    const reglaDe = (hoja: string, clase: string): string | undefined => {
      const css = sinComentarios(readFileSync(join(componentes, hoja), "utf8"));
      return new RegExp(`^\\.${clase}\\s*\\{([^}]*)\\}`, "m").exec(css)?.[1];
    };
    const fuera: string[] = [];
    for (const nombre of readdirSync(componentes).filter((n) => n.endsWith(".tsx") && !n.includes(".test."))) {
      const tsx = readFileSync(join(componentes, nombre), "utf8");
      const hojas = new Map([...tsx.matchAll(/import\s+(\w+)\s+from\s+"\.\/([\w.]+\.module\.css)"/g)].map((m) => [m[1]!, m[2]!]));
      for (const m of tsx.matchAll(/<h2\b[^>]*className=\{([^}]*)\}/g)) {
        for (const [, alias, clase] of m[1]!.matchAll(/(\w+)\.(\w+)/g)) {
          const hoja = hojas.get(alias!);
          if (hoja === undefined) continue;
          let regla = reglaDe(hoja, clase!);
          // Una clase que compone otra de otra hoja: el tamaño lo pone la compuesta.
          const compuesta = regla === undefined ? undefined : /composes:\s*(\w+)\s+from\s+"\.\/([\w.]+)"/.exec(regla);
          if (compuesta) regla = reglaDe(compuesta[2]!, compuesta[1]!);
          if (regla === undefined) continue;
          if (/text-transform:\s*uppercase/.test(regla)) continue;
          if (!/font-size:\s*var\(--tipo-(titulo|display)\)/.test(regla)) fuera.push(`${nombre}: ${hoja.split(".")[0]}.${clase}`);
        }
      }
    }
    expect([...new Set(fuera)]).toEqual([]);
  });

  /**
   * Un px suelto MAYOR de 24 y fuera de la escala no es espaciado sino ALINEACIÓN: la sangría
   * que deja sitio a un icono (28px a la izquierda) o que cuadra con una columna (52px, 72px).
   * Llevarlo al paso más cercano montaba el texto sobre el icono; se queda literal. Lo pequeño
   * suelto (un 5px, un 14px) sí es el desorden que esta escala quita.
   */
  const esAlineacion = (pieza: string): boolean => {
    const m = /^(\d+)px$/.exec(pieza);
    return m !== null && Number(m[1]) > 24 && ![32].includes(Number(m[1]));
  };

  it("el espaciado (padding, gap) de src/ lee un --espacio-*: ningún px suelto salvo 0 y las alineaciones", () => {
    const sueltos: string[] = [];
    for (const propiedad of ["padding(?:-[a-z]+)?", "gap", "row-gap", "column-gap"]) {
      for (const d of declaracionesDe(propiedad)) {
        for (const pieza of d.valor.split(/\s+/)) {
          if (pieza === "0" || esAlineacion(pieza) || /^var\(--(espacio-\d+|dsh-[a-z-]+)\)$/.test(pieza)) continue;
          sueltos.push(`${d.fichero}: ${d.valor}`);
          break;
        }
      }
    }
    expect([...new Set(sueltos)]).toEqual([]);
  });

  const RADIOS_FUERA_DE_ESCALA: Record<string, string> = {
    "Compositor.module.css: 20px": "la caja del chat: su forma redondeada es la de la marca, no la de un campo",
    "Marca.module.css: 12px": "la placa del logotipo",
    "Marca.module.css: 20px": "la placa del logotipo grande del splash",
  };

  it("el radio de src/ lee un --radio-* (o es un círculo, 50%, o 0), salvo la marca", () => {
    const sueltos = declaracionesDe("border-radius")
      .filter((d) => !d.valor.split(/\s+/).every((p) => /^(0|50%|inherit|var\(--radio-[a-z]+\))$/.test(p)))
      .map((d) => `${d.fichero}: ${d.valor}`)
      .filter((clave) => !(clave in RADIOS_FUERA_DE_ESCALA));
    expect([...new Set(sueltos)]).toEqual([]);
  });

  it("los tokens de espacio y radio que se usan están declarados en tipografia.css", () => {
    const tipografia = sinComentarios(readFileSync(join(ESTILOS, "tipografia.css"), "utf8"));
    const usados = new Set(
      ["padding(?:-[a-z]+)?", "gap", "row-gap", "column-gap", "border-radius"]
        .flatMap((p) => declaracionesDe(p))
        .flatMap((d) => [...d.valor.matchAll(/var\((--(?:espacio|radio)-[a-z0-9]+)\)/g)].map((m) => m[1]!)),
    );
    expect([...usados].filter((t) => !new RegExp(`${t}\\s*:`).test(tipografia))).toEqual([]);
  });

  it("las excepciones siguen existiendo: una que ya no está no se queda en la lista", () => {
    const presentes = new Set([...declaracionesDe("font-size")].map((d) => `${d.fichero}: ${d.valor}`));
    expect(Object.keys(TAMANOS_FUERA_DE_ESCALA).filter((k) => !presentes.has(k))).toEqual([]);
  });
});

const PUENTE = (): string => sinComentarios(readFileSync(join(ESTILOS, "temas.css"), "utf8"));
const declarados = (prefijo: string, css: string): Set<string> =>
  new Set([...css.matchAll(new RegExp(`--${prefijo}([a-z0-9-]+)\\s*:`, "g"))].map((m) => m[1]!));

/**
 * Un tema que deja un alias sin redefinir lo pinta con el color de XOneCode, sin avisar: un
 * borde navy en Dracula, un fondo blanco en One Dark. Por eso no basta con «se ve bien»: el
 * puente tiene que cubrir CADA alias que la interfaz usa, y uno nuevo que alguien use mañana
 * da rojo aquí.
 */
describe("el puente de temas", () => {
  it("redefine cada alias --dsw-alias-* que usa el cliente", () => {
    const enElPuente = declarados("dsw-alias-", PUENTE());
    const faltan = new Set<string>();
    for (const ruta of hojasDelCliente()) {
      if (ruta.endsWith("temas.css")) continue;
      for (const a of aliasUsados(readFileSync(ruta, "utf8"))) if (!enElPuente.has(a)) faltan.add(a);
    }
    expect([...faltan].sort()).toEqual([]);
  });

  it("redefine cada --dsw-specific-* que usa el cliente (el fondo de la barra lateral, por ejemplo)", () => {
    const enElPuente = declarados("dsw-specific-", PUENTE());
    const faltan = new Set<string>();
    let alias = 0;
    for (const ruta of hojasDelCliente()) {
      if (ruta.endsWith("temas.css")) continue;
      const css = readFileSync(ruta, "utf8");
      alias += aliasUsados(css).size;
      for (const m of sinComentarios(css).matchAll(/var\(\s*--dsw-specific-([a-z0-9-]+)\s*\)/g)) {
        if (!enElPuente.has(m[1]!)) faltan.add(m[1]!);
      }
    }
    // Guarda contra el vacío: si el recorrido no encuentra hojas, «no falta nada» no prueba nada.
    expect(alias).toBeGreaterThan(0);
    expect([...faltan].sort()).toEqual([]);
  });

  it("redefine cada --xonecode-* que usa el cliente, salvo las excepciones declaradas", () => {
    // Un `--xonecode-*` con color que el puente no toca se queda con el valor de XOneCode
    // dentro de un tema: la misma trampa muda que los alias, con otro prefijo.
    const EXCEPCIONES: Record<string, string> = {
      "gasto-": "validados con dataviz contra el fondo de cada modo: no se puentean (límite declarado)",
      "splash-": "presentación de marca, ajena al tema",
      "barra-placa": "la placa del símbolo es blanca siempre, resuelve en :root",
      angulo: "un ángulo de degradado, no es un color",
      "icono-": "colores de tipo de fichero (y la máscara de `icono-copiar`): son de la marca, no del tema; validados en claro y oscuro",
      "relieve-": "derivados declarados en `estilos/relieve.css` sobre `body`: se recalculan con los colores del tema, sin puente propio",
      mascara: "el canal alfa de una máscara (`Superficie.module.css`): no se pinta, solo recorta",
      "fuente-titulo": "una familia tipográfica (`tipografia.css`), no un color: el tema no la toca",
    };
    const excepcion = (n: string): boolean =>
      Object.keys(EXCEPCIONES).some((k) => (k.endsWith("-") ? n.startsWith(k) : n === k));
    const enElPuente = declarados("xonecode-", PUENTE());
    const faltan = new Set<string>();
    let vistos = 0;
    for (const ruta of hojasDelCliente()) {
      if (ruta.endsWith("temas.css")) continue;
      for (const m of sinComentarios(readFileSync(ruta, "utf8")).matchAll(/var\(\s*--xonecode-([a-z0-9-]+)\s*\)/g)) {
        vistos++;
        if (!enElPuente.has(m[1]!) && !excepcion(m[1]!)) faltan.add(m[1]!);
      }
    }
    expect(vistos).toBeGreaterThan(0);
    expect([...faltan].sort()).toEqual([]);
  });

  it("redefine el resaltado de código entero", () => {
    const shiki = declarados("shiki-", sinComentarios(readFileSync(join(ESTILOS, "shiki.css"), "utf8")));
    const enElPuente = declarados("shiki-", PUENTE());
    expect([...shiki].filter((v) => !enElPuente.has(v))).toEqual([]);
  });

  it("no lleva colores literales: solo semillas, color-mix y transparent", () => {
    const css = PUENTE();
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/);
    const palabras = css.replace(/--[\w-]+/g, "").match(/\b[a-z]+\b/g) ?? [];
    const colores = palabras.filter((p) => ["white", "black", "red", "green", "blue", "gray", "grey", "currentcolor"].includes(p));
    expect(colores).toEqual([]);
  });

  it("solo usa semillas que existen", () => {
    const usadas = new Set([...PUENTE().matchAll(/var\(--tema-([a-zA-Z0-9]+)\)/g)].map((m) => m[1]!));
    const nombres = new Set<string>(NOMBRES_DE_SEMILLA);
    expect([...usadas].filter((u) => !nombres.has(u))).toEqual([]);
  });
});

describe("el texto del tema llega a todo", () => {
  it("el `body` declara el color del texto del tema, no solo el fondo: lo heredan los portales y lo que no lleva clase", () => {
    const hoja = readFileSync(join(AQUI, "..", "estilos", "tipografia.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const body = /(^|\n)body\s*\{([^}]*)\}/.exec(hoja)?.[2] ?? "";
    expect(body).toMatch(/background:\s*var\(--dsw-alias-bg-base\)/);
    expect(body).toMatch(/(^|\s|;)color:\s*var\(--dsw-alias-label-primary\)/);
  });
});

/**
 * Los ESTILOS (`estilos/estilosVisuales.css`): la forma, no el color. Dos trampas que se ven tarde: un color literal
 * (se queda igual dentro de cualquier tema) y un token que el oscuro de `relieve.css` también define y el oscuro del
 * estilo no repite — con la MISMA especificidad, ganaría el que se cargue después, y eso se rompe en silencio el día
 * que alguien reordene los `import`.
 */
describe("los estilos de la consola", () => {
  const hoja = (n: string): string => sinComentarios(readFileSync(join(ESTILOS, n), "utf8"));
  const bloque = (css: string, selector: string): Set<string> => {
    const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`${escapado}\\s*\\{([^}]*)\\}`).exec(css);
    return new Set([...(m?.[1] ?? "").matchAll(/(--[a-z0-9-]+)\s*:/g)].map((x) => x[1]!));
  };

  it("no lleva colores literales: solo alias, `--xonecode-*`, color-mix y transparent", () => {
    const css = hoja("estilosVisuales.css");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/);
    const palabras = css.replace(/--[\w-]+/g, "").replace(/"[^"]*"/g, "").match(/\b[a-z]+\b/g) ?? [];
    expect(palabras.filter((p) => ["white", "black", "red", "green", "blue", "gray", "grey"].includes(p))).toEqual([]);
  });

  it("cada estilo repite en su oscuro lo que el oscuro de relieve.css también redefine", () => {
    const oscuroDelRelieve = bloque(hoja("relieve.css"), "body[data-ds-dark-theme]");
    const css = hoja("estilosVisuales.css");
    const faltan: string[] = [];
    for (const id of ["glass", "neo", "consola"]) {
      const claro = bloque(css, `body[data-estilo="${id}"]`);
      const oscuro = bloque(css, `body[data-estilo="${id}"][data-ds-dark-theme]`);
      expect(claro.size, id).toBeGreaterThan(0);
      for (const t of claro) if (oscuroDelRelieve.has(t) && !oscuro.has(t)) faltan.push(`${id}: ${t}`);
    }
    expect(faltan).toEqual([]);
  });

  it("los tokens de forma que leen los papeles tienen su valor del clásico en relieve.css", () => {
    const base = bloque(hoja("relieve.css"), "body");
    for (const t of ["--xonecode-relieve-filtro", "--xonecode-relieve-boton-borde", "--xonecode-relieve-secundario-sombra"]) {
      expect(base.has(t), t).toBe(true);
    }
  });
});
