/**
 * ¿Está bien formada esta hoja de estilos de XOne? Pura y sin llamar a nadie.
 *
 * Existe por el otro turno de soporte de APPSalud: el framework no arrancaba con un
 * `CssParseException … Expected open brace character` y el agente pasó media hora contando
 * comentarios a mano.
 *
 * **Es PRUDENTE a propósito**: solo marca lo que rompe la ESTRUCTURA de una hoja con la gramática que
 * documenta la skill (`xone-development/references/css/buenas-practicas-y-parser.md` §18), y nada de
 * lo que XOne pueda aceptar: un validador que avisa de algo que funciona manda a reescribir código
 * bueno. Lo que comprueba:
 * - comentarios `/* … *\/` cerrados, y los de línea `// …` (XOne acepta los dos);
 * - llaves que abren y cierran, sin `}` de más ni bloques sin cerrar al acabar;
 * - que lo que hay fuera de un bloque acaba en `{` (un selector) o es una at-rule (`@import …;`);
 * - que cada declaración de un bloque tiene su `:`.
 *
 * NO comprueba propiedades, valores ni selectores: un atributo que XOne no conoce se ignora en
 * silencio, y eso es de `xone_atributos`, no de la forma.
 */
import type { ResultadoXml } from "./xmlBienFormado.js";

export type ResultadoCss = ResultadoXml;

export function comprobarCss(entrada: string): ResultadoCss {
  const texto = entrada.startsWith("﻿") ? entrada.slice(1) : entrada;

  const donde = (pos: number): { linea: number; columna: number } => {
    let linea = 1;
    let inicio = 0;
    for (let k = 0; k < pos && k < texto.length; k++) {
      if (texto[k] === "\n") {
        linea += 1;
        inicio = k + 1;
      }
    }
    return { linea, columna: pos - inicio + 1 };
  };
  const fallo = (pos: number, motivo: string): ResultadoCss => ({ ok: false, ...donde(pos), motivo });

  /** Lo que se va juntando desde el último `{`, `}` o `;`, sin comentarios, y dónde empezó. */
  let pendiente = "";
  let desde = -1;
  /** Bloques abiertos: dónde, para decir cuál no se cierra. */
  const abiertos: number[] = [];

  /** Lo pendiente al llegar a un `;` o a un `}` dentro de un bloque: una declaración. */
  const declaracionMala = (): ResultadoCss | undefined => {
    const d = pendiente.trim();
    if (d === "" || d.startsWith("@")) return undefined;
    if (!d.includes(":")) return fallo(desde, `«${d.slice(0, 60)}» no es una declaración: le falta el «:» entre la propiedad y el valor`);
    return undefined;
  };

  let i = 0;
  while (i < texto.length) {
    const c = texto[i]!;
    // Comentario de bloque.
    if (c === "/" && texto[i + 1] === "*") {
      const fin = texto.indexOf("*/", i + 2);
      if (fin < 0) return fallo(i, "un comentario «/*» que no se cierra con «*/»");
      i = fin + 2;
      continue;
    }
    // Comentario de línea: solo donde empieza un token, nunca dentro de un valor (una URL lleva `//`).
    if (c === "/" && texto[i + 1] === "/" && (abiertos.length === 0 || pendiente.trim() === "" || !pendiente.includes(":"))) {
      const fin = texto.indexOf("\n", i);
      i = fin < 0 ? texto.length : fin + 1;
      continue;
    }
    if (c === "{") {
      if (abiertos.length === 0 && pendiente.trim() === "") return fallo(i, "un «{» sin selector delante");
      if (abiertos.length > 0 && pendiente.includes(":")) {
        return fallo(desde, `falta el «;» antes de abrir otro bloque: «${pendiente.trim().slice(0, 60)}»`);
      }
      abiertos.push(i);
      pendiente = "";
      desde = -1;
      i++;
      continue;
    }
    if (c === "}") {
      if (abiertos.length === 0) return fallo(i, "un «}» que no cierra ningún bloque");
      const mala = declaracionMala();
      if (mala !== undefined) return mala;
      abiertos.pop();
      pendiente = "";
      desde = -1;
      i++;
      continue;
    }
    if (c === ";") {
      if (abiertos.length > 0) {
        const mala = declaracionMala();
        if (mala !== undefined) return mala;
      } else if (!pendiente.trim().startsWith("@") && pendiente.trim() !== "") {
        return fallo(desde, `«${pendiente.trim().slice(0, 60)}» está fuera de cualquier bloque: ¿falta el «{» del selector?`);
      }
      pendiente = "";
      desde = -1;
      i++;
      continue;
    }
    if (desde < 0 && c !== " " && c !== "\t" && c !== "\n" && c !== "\r") desde = i;
    pendiente += c;
    i++;
  }

  const abierto = abiertos.pop();
  if (abierto !== undefined) return fallo(abierto, "un bloque «{» que no se cierra antes de que acabe el fichero");
  if (pendiente.trim() !== "") {
    return fallo(desde, `«${pendiente.trim().slice(0, 60)}» al final del fichero, sin bloque: ¿falta el «{» del selector?`);
  }
  return { ok: true };
}
