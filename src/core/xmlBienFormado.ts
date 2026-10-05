/**
 * ¿Está bien formado este XML? Puro, sin librerías y sin llamar a nadie.
 *
 * Existe por un turno real (soporte de APPSalud): la persona pegó el error del parser de Studio
 * («'name' is an unexpected token. The expected token is '='. Line 381, position 4») y el agente,
 * sin forma de comprobarlo, revisó el fichero a ojo durante minutos — tenía razón a los dos
 * minutos («está bien formado») y no se lo creyó. Esto contesta la pregunta con un sí o con la
 * línea y la columna, como un parser.
 *
 * Solo la FORMA del XML: etiquetas que abren y cierran en orden, atributos con su `=` y su valor
 * entre comillas, sin repetir, separados por blancos; comentarios (sin `--` dentro), CDATA,
 * instrucciones `<?…?>`, entidades, una sola raíz. **No** sabe nada de XOne: un atributo que XOne
 * no conoce está bien formado (para eso, `xone_atributos`).
 */

export type ResultadoXml = { ok: true } | { ok: false; linea: number; columna: number; motivo: string };

const ENTIDADES = new Set(["amp", "lt", "gt", "quot", "apos"]);

/** Primer carácter de un nombre XML (aproximado a lo que usa un proyecto XOne, con Unicode). */
const INICIO_DE_NOMBRE = /[A-Za-z_:À-￿]/;
const RESTO_DE_NOMBRE = /[A-Za-z0-9_:.\-·À-￿]/;

export function comprobarXml(entrada: string): ResultadoXml {
  const texto = entrada.startsWith("﻿") ? entrada.slice(1) : entrada;
  let i = 0;

  /** Línea y columna (desde 1) de una posición. */
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
  const fallo = (pos: number, motivo: string): ResultadoXml => ({ ok: false, ...donde(pos), motivo });
  const blanco = (c: string | undefined): boolean => c === " " || c === "\t" || c === "\n" || c === "\r";
  const saltarBlancos = (): void => {
    while (blanco(texto[i])) i++;
  };
  const leerNombre = (): string => {
    const desde = i;
    if (i < texto.length && INICIO_DE_NOMBRE.test(texto[i]!)) {
      i++;
      while (i < texto.length && RESTO_DE_NOMBRE.test(texto[i]!)) i++;
    }
    return texto.slice(desde, i);
  };
  /** Una entidad que empieza en `pos` (un `&`). Devuelve el motivo si no vale. */
  const entidadMala = (pos: number): string | undefined => {
    const fin = texto.indexOf(";", pos);
    const cuerpo = fin < 0 ? "" : texto.slice(pos + 1, fin);
    if (fin < 0 || fin - pos > 12 || !/^#?[A-Za-z0-9]+$/.test(cuerpo)) return "un «&» suelto: escríbelo «&amp;»";
    if (/^#[0-9]+$/.test(cuerpo) || /^#x[0-9A-Fa-f]+$/.test(cuerpo) || ENTIDADES.has(cuerpo)) return undefined;
    return `entidad desconocida «&${cuerpo};»: en XML solo valen &amp; &lt; &gt; &quot; &apos; y las numéricas`;
  };

  const abiertas: { nombre: string; pos: number }[] = [];
  let raices = 0;

  while (i < texto.length) {
    const c = texto[i]!;
    if (c !== "<") {
      if (c === "&") {
        const mala = entidadMala(i);
        if (mala !== undefined) return fallo(i, mala);
      } else if (abiertas.length === 0 && !blanco(c)) {
        return fallo(i, raices === 0 ? "hay texto antes del elemento raíz" : "hay texto después de cerrar el elemento raíz");
      }
      i++;
      continue;
    }

    // Comentario.
    if (texto.startsWith("<!--", i)) {
      const fin = texto.indexOf("-->", i + 4);
      if (fin < 0) return fallo(i, "un comentario «<!--» que no se cierra con «-->»");
      const dobleGuion = texto.indexOf("--", i + 4);
      if (dobleGuion >= 0 && dobleGuion < fin) return fallo(dobleGuion, "«--» dentro de un comentario: XML no lo admite");
      i = fin + 3;
      continue;
    }
    // CDATA.
    if (texto.startsWith("<![CDATA[", i)) {
      if (abiertas.length === 0) return fallo(i, "un bloque CDATA fuera del elemento raíz");
      const fin = texto.indexOf("]]>", i + 9);
      if (fin < 0) return fallo(i, "un «<![CDATA[» que no se cierra con «]]>»");
      i = fin + 3;
      continue;
    }
    // DOCTYPE: se salta entero, hasta su «>».
    if (texto.startsWith("<!DOCTYPE", i)) {
      const fin = texto.indexOf(">", i);
      if (fin < 0) return fallo(i, "un «<!DOCTYPE» sin cerrar");
      i = fin + 1;
      continue;
    }
    // Instrucción de proceso (el prólogo `<?xml …?>`).
    if (texto.startsWith("<?", i)) {
      const fin = texto.indexOf("?>", i + 2);
      if (fin < 0) return fallo(i, "un «<?» que no se cierra con «?>»");
      i = fin + 2;
      continue;
    }
    // Cierre.
    if (texto.startsWith("</", i)) {
      const pos = i;
      i += 2;
      const nombre = leerNombre();
      if (nombre === "") return fallo(i, "falta el nombre de la etiqueta tras «</»");
      saltarBlancos();
      if (texto[i] !== ">") return fallo(i, `se esperaba «>» para cerrar «</${nombre}»`);
      const abierta = abiertas.pop();
      if (abierta === undefined) return fallo(pos, `«</${nombre}>» cierra algo que no está abierto`);
      if (abierta.nombre !== nombre) {
        const { linea } = donde(abierta.pos);
        return fallo(pos, `«</${nombre}>» no cierra la etiqueta abierta, que es «<${abierta.nombre}>» (línea ${linea})`);
      }
      i++;
      continue;
    }

    // Apertura.
    const pos = i;
    i++;
    const nombre = leerNombre();
    if (nombre === "") return fallo(i, "un «<» que no empieza ninguna etiqueta: si es texto, escríbelo «&lt;»");
    if (abiertas.length === 0) {
      raices += 1;
      if (raices > 1) return fallo(pos, `un segundo elemento raíz «<${nombre}>»: un XML solo tiene una raíz`);
    }
    const vistos = new Set<string>();
    for (;;) {
      const antes = i;
      saltarBlancos();
      const c2 = texto[i];
      if (c2 === undefined) return fallo(pos, `la etiqueta «<${nombre}» no se cierra`);
      if (c2 === ">") {
        abiertas.push({ nombre, pos });
        i++;
        break;
      }
      if (c2 === "/") {
        if (texto[i + 1] !== ">") return fallo(i, "se esperaba «/>»");
        i += 2;
        break;
      }
      if (i === antes) return fallo(i, `falta un espacio antes del atributo, en «<${nombre}»`);
      const posAtributo = i;
      const atributo = leerNombre();
      if (atributo === "") return fallo(i, `carácter inesperado «${c2}» dentro de «<${nombre}»`);
      saltarBlancos();
      if (texto[i] !== "=") {
        // El caso del soporte: un atributo sin su `=` (el .NET de Studio lo dice al revés: el
        // token que encuentra donde esperaba el `=`).
        return fallo(i, `al atributo «${atributo}» le falta el «=» y su valor`);
      }
      i++;
      saltarBlancos();
      const comilla = texto[i];
      if (comilla !== '"' && comilla !== "'") return fallo(i, `el valor del atributo «${atributo}» tiene que ir entre comillas`);
      const fin = texto.indexOf(comilla, i + 1);
      if (fin < 0) return fallo(i, `el valor del atributo «${atributo}» no cierra su comilla`);
      for (let k = i + 1; k < fin; k++) {
        if (texto[k] === "<") return fallo(k, `un «<» dentro del valor de «${atributo}»: escríbelo «&lt;»`);
        if (texto[k] === "&") {
          const mala = entidadMala(k);
          if (mala !== undefined) return fallo(k, mala);
        }
      }
      if (vistos.has(atributo)) return fallo(posAtributo, `el atributo «${atributo}» está repetido en «<${nombre}»`);
      vistos.add(atributo);
      i = fin + 1;
      if (!blanco(texto[i]) && texto[i] !== ">" && texto[i] !== "/" && texto[i] !== undefined) {
        return fallo(i, `falta un espacio entre el atributo «${atributo}» y lo que sigue`);
      }
    }
  }

  const abierta = abiertas.pop();
  if (abierta !== undefined) return fallo(abierta.pos, `«<${abierta.nombre}>» se abre y no se cierra antes de que acabe el fichero`);
  if (raices === 0) return fallo(texto.length, "no hay ningún elemento raíz");
  return { ok: true };
}
