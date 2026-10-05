/**
 * ¿Lo lee el motor JavaScript de XOne en Android (Rhino 1.7.12-1.7.13)? Pura y sin llamar a nadie:
 * `acorn` es una librería en JS puro, sin red ni procesos.
 *
 * La regla es la MEDIDA ejecutando en el emulador (`docs/DECISIONES.md`, la matriz de `REGLAS_XONE`):
 * ningún `ecmaVersion` de acorn sirve solo —a 5 da por malo lo que Rhino sí lee (arrow, `let`,
 * `const`, destructuring, `for…of`, método abreviado); a 2015 deja pasar lo que Rhino rechaza—. Así
 * que se parsea a **2015** (lo que es más nuevo, como `?.`, `??`, `**`, `async` o `1n`, ya falla ahí)
 * y se niega por tipo de nodo la rodaja de ES2015 que a Rhino le falta.
 *
 * Por qué no `new Function` / `vm.Script`: V8 acepta todo ES2022, y en modo laxo deja pasar un `=`
 * donde iba `==` (`if (a = 0)`), que Rhino rechaza al compilar.
 */
import { parse, type Node } from "acorn";
import type { ResultadoXml } from "./xmlBienFormado.js";

export type ResultadoJs = ResultadoXml;

type Nodo = Node & Record<string, unknown>;

/** El primer nodo que Rhino no lee, con su motivo. `padre` hace falta para el `{a}` abreviado. */
function noSoportado(nodo: Nodo, padre: Nodo | undefined): string | undefined {
  switch (nodo.type) {
    case "TemplateLiteral":
    case "TaggedTemplateExpression":
      return "una template literal (`…${}`): Rhino no las lee; concatena con «+»";
    case "ClassDeclaration":
    case "ClassExpression":
      return "«class»: Rhino no la lee; usa una función constructora";
    case "SpreadElement":
      return "el spread «...»: Rhino no lo lee";
    case "RestElement":
      return "el rest «...»: Rhino no lo lee; usa «arguments»";
    case "AssignmentPattern":
      return "un valor por defecto («a = 1» en parámetros o destructuring): Rhino no lo lee";
    case "FunctionDeclaration":
    case "FunctionExpression":
      return nodo["generator"] === true ? "un generador «function*»: Rhino no lo lee" : undefined;
    case "Property":
      if (padre?.type !== "ObjectExpression") return undefined; // en un destructuring, `{a}` SÍ vale (medido)
      if (nodo["shorthand"] === true) return "una propiedad abreviada «{a}»: Rhino no la lee; escribe «{a: a}»";
      if (nodo["computed"] === true) return "una clave calculada «{[k]: v}»: Rhino no la lee";
      return undefined;
    default:
      return undefined;
  }
}

function recorrer(nodo: Nodo, padre: Nodo | undefined): { nodo: Nodo; motivo: string } | undefined {
  const motivo = noSoportado(nodo, padre);
  if (motivo !== undefined) return { nodo, motivo };
  for (const valor of Object.values(nodo)) {
    const hijos = Array.isArray(valor) ? valor : [valor];
    for (const hijo of hijos) {
      if (hijo !== null && typeof hijo === "object" && typeof (hijo as Nodo).type === "string") {
        const encontrado = recorrer(hijo as Nodo, nodo);
        if (encontrado !== undefined) return encontrado;
      }
    }
  }
  return undefined;
}

export function comprobarJs(entrada: string): ResultadoJs {
  const texto = entrada.startsWith("﻿") ? entrada.slice(1) : entrada;
  let arbol: Nodo;
  try {
    arbol = parse(texto, { ecmaVersion: 2015, sourceType: "script", locations: true }) as unknown as Nodo;
  } catch (error) {
    const e = error as { loc?: { line: number; column: number }; message?: string };
    const motivo = String(e.message ?? error).replace(/\s*\(\d+:\d+\)$/, "");
    let masNuevo = false;
    try {
      parse(texto, { ecmaVersion: "latest", sourceType: "script" });
      masNuevo = true;
    } catch {
      // También es error en lo más nuevo: es un error de sintaxis de verdad.
    }
    return {
      ok: false,
      linea: e.loc?.line ?? 1,
      columna: (e.loc?.column ?? 0) + 1,
      motivo: masNuevo
        ? `sintaxis más nueva que la que lee Rhino (${motivo}): ?. ?? ** async/await y 1n no existen en el motor`
        : `error de sintaxis: ${motivo}`,
    };
  }
  const malo = recorrer(arbol, undefined);
  if (malo === undefined) return { ok: true };
  const loc = (malo.nodo as unknown as { loc?: { start: { line: number; column: number } } }).loc;
  return { ok: false, linea: loc?.start.line ?? 1, columna: (loc?.start.column ?? 0) + 1, motivo: malo.motivo };
}
