import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NOMBRES_DE_SEMILLA, TEMAS, contraste, temaPorId, temasDe, type Semillas } from "./temas.js";

describe("el catálogo de temas", () => {
  it("cuatro por modo, XOneCode primero", () => {
    expect(temasDe("oscuro").map((t) => t.id)).toEqual(["xonecode-oscuro", "github-oscuro", "one-oscuro", "dracula"]);
    expect(temasDe("claro").map((t) => t.id)).toEqual(["xonecode-claro", "github-claro", "one-claro", "ayu-claro"]);
  });

  it("los dos XOneCode traen `muestra` y los demás no", () => {
    expect(TEMAS.filter((t) => t.muestra !== undefined).map((t) => t.id)).toEqual(["xonecode-oscuro", "xonecode-claro"]);
  });

  it("los ids son únicos", () => {
    expect(new Set(TEMAS.map((t) => t.id)).size).toBe(TEMAS.length);
  });

  it("XOneCode no lleva semillas: se ve como hoy por construcción", () => {
    for (const modo of ["claro", "oscuro"] as const) expect(temasDe(modo)[0]!.semillas).toBeUndefined();
  });

  it("cada tema con semillas trae TODAS las semillas, todas #rrggbb", () => {
    for (const t of TEMAS) {
      if (t.semillas === undefined) continue;
      expect(Object.keys(t.semillas).sort(), t.id).toEqual([...NOMBRES_DE_SEMILLA].sort());
      for (const [k, v] of Object.entries(t.semillas)) expect(v, `${t.id}.${k}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("un id desconocido, o de otro modo, cae en el XOneCode de ese modo", () => {
    expect(temaPorId("dracula", "claro").id).toBe("xonecode-claro");
    expect(temaPorId("no-existe", "oscuro").id).toBe("xonecode-oscuro");
    expect(temaPorId(undefined, "oscuro").id).toBe("xonecode-oscuro");
    expect(temaPorId("dracula", "oscuro").id).toBe("dracula");
  });

  it("el cálculo de contraste es el de WCAG: blanco sobre negro es 21", () => {
    expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contraste("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});

/**
 * El contraste se COMPRUEBA, no se confía en que la paleta oficial lo cumpla: varias no lo
 * cumplen tal cual (el azul de One Light con letra blanca, el verde y el ámbar de Ayu sobre su
 * fondo), y sus semillas van oscurecidas. Si un tema no llega, se corrige su semilla; el umbral
 * no se toca.
 */
describe("contraste WCAG de cada tema", () => {
  const pares = (s: Semillas): Array<[string, string, string, number]> => {
    const lista: Array<[string, string, string, number]> = [];
    for (const [k, minimo] of [["texto", 4.5], ["texto2", 4.5], ["texto3", 3]] as const) {
      for (const f of ["fondo", "capa1", "capa2"] as const) lista.push([`${k}/${f}`, s[k], s[f], minimo]);
    }
    lista.push(["sobreAcento/acento", s.sobreAcento, s.acento, 4.5]);
    for (const k of ["peligro", "exito", "aviso"] as const) lista.push([`${k}/fondo`, s[k], s.fondo, 3]);
    return lista;
  };
  for (const t of TEMAS) {
    if (t.semillas === undefined) continue;
    const semillas = t.semillas;
    it(`${t.nombre} se lee`, () => {
      const fallos = pares(semillas)
        .filter(([, a, b, minimo]) => contraste(a, b) < minimo)
        .map(([par, a, b, minimo]) => `${t.id} ${par} = ${contraste(a, b).toFixed(2)} < ${minimo}`);
      expect(fallos).toEqual([]);
    });
  }
});

/**
 * La marca «cambiada» del editor y la `M` del árbol van en AZUL en todos los temas (decisión del
 * usuario): en XOneCode por `--xonecode-marca-cambiada` de `marca.css`, y en los demás por la
 * semilla `cambio`, que el puente reparte al mismo token.
 */
describe("la marca «cambiada», azul en todos los temas", () => {
  const AQUI = dirname(fileURLToPath(import.meta.url));
  const leer = (...partes: string[]): string => readFileSync(join(AQUI, ...partes), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("cada tema con semillas trae su azul en `cambio`", () => {
    const azules = Object.fromEntries(TEMAS.filter((t) => t.semillas !== undefined).map((t) => [t.id, t.semillas!.cambio]));
    expect(azules).toEqual({
      "github-oscuro": "#1f6feb",
      "one-oscuro": "#61afef",
      dracula: "#8be9fd",
      "github-claro": "#0969da",
      "one-claro": "#4078f2",
      "ayu-claro": "#399ee6",
    });
  });

  it("XOneCode lo declara en claro y en oscuro, el puente lo toma de `cambio`, y el editor y el árbol lo usan", () => {
    const marca = leer("..", "estilos", "marca.css");
    expect(marca).toMatch(/:root\s*\{[^}]*--xonecode-marca-cambiada:\s*#3b82f6;/);
    expect(marca).toMatch(/body\[data-ds-dark-theme\]\s*\{[^}]*--xonecode-marca-cambiada:\s*#60a5fa;/);
    expect(leer("..", "estilos", "temas.css")).toMatch(/--xonecode-marca-cambiada:\s*var\(--tema-cambio\);/);
    expect(leer("editor", "EditorDeFichero.module.css")).toMatch(/\.marca\[data-marca~="cambiada"\]\s*\{[^}]*var\(--xonecode-marca-cambiada\)/);
    expect(leer("componentes", "Ficheros.module.css")).toMatch(/\.marcaDelArbol\[data-marca="cambiada"\]\s*\{[^}]*var\(--xonecode-marca-cambiada\)/);
  });
});
