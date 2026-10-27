/**
 * Los SECRETOS dentro de un texto: encontrarlos para avisar y taparlos para que no salgan en un paquete de soporte.
 *
 * **Existe por un caso real** (Maset, 27-10-2026): la persona pegó en el chat el bloque de configuración del entorno de
 * pruebas, con el `client_secret` de OAuth dentro, para que el agente lo configurara. Es un uso legítimo —el agente lo
 * necesitaba—, y el valor viajó en la exportación de soporte dos veces: en el chat y en la memoria del motor, que lo
 * guarda entero. Un paquete de soporte se entrega a mano a otra persona.
 *
 * **Se tapa el VALOR, nunca la clave ni lo de alrededor**: quien analiza el paquete necesita ver que había un
 * `client_secret` y dónde, no cuál era. Y se tapa por FORMA —una clave con nombre de secreto y su valor, un `Bearer`, un
 * bloque de clave privada—, no por entropía: un hash o un GUID de colección son datos de soporte, y adivinar por
 * aspecto taparía justo lo que explica el fallo. El precio declarado: un secreto suelto, sin nombre al lado, pasa.
 *
 * Puro: quién lee el disco y escribe el zip es `web/servidor/soporte.ts`.
 */

/** Lo que se pone en lugar del valor. Reconocible, y nunca vuelve a casar: no se tapa dos veces. */
export const TAPADO = "«tapado»";

/** Los nombres de clave que llevan un secreto. Palabra ENTERA y sin mayúsculas: `tokenName` no es `token`. */
const CLAVES = String.raw`client_?secret|secret|password|passwd|pwd|contrase(?:ñ|n)a|api_?key|access_?token|refresh_?token|auth_?token|token`;

/**
 * Las formas. Cada una deja intacto todo menos el grupo `valor`:
 * - `<param name="client_secret" value="…"/>`: la configuración de XOne y la de casi cualquier XML.
 * - `clave = valor`, `clave: valor`, `"clave": "valor"`: cadenas de conexión (`Pwd=…;`), `.ini`, JSON, YAML, cabeceras.
 * - `Bearer …` y los bloques `-----BEGIN … PRIVATE KEY-----`.
 */
const FORMAS: readonly RegExp[] = [
  new RegExp(String.raw`(\bname\s*=\s*["'](?:${CLAVES})["']\s+value\s*=\s*["'])(?<valor>[^"']+)`, "giu"),
  new RegExp(String.raw`((?<![\w-])["']?(?:${CLAVES})["']?\s*[=:]\s*["']?)(?<valor>[^\s"'<>;,&]+)`, "giu"),
  /(\bBearer\s+)(?<valor>[A-Za-z0-9\-._~+/]+=*)/g,
  /(-----BEGIN [A-Z ]*PRIVATE KEY-----)(?<valor>[\s\S]*?)(?=-----END [A-Z ]*PRIVATE KEY-----)/g,
];

/** Lo que no vale la pena tapar: vacío, un ya tapado o una referencia a otra cosa (`${VAR}`, `%VAR%`, `<…>`). */
function esValorDeVerdad(valor: string): boolean {
  return valor.length >= 4 && valor !== TAPADO && !/^(?:\$\{|\$[A-Z_]|%[A-Z_]|\{\{|<)/.test(valor);
}

/** El texto con los secretos tapados y cuántos se taparon. */
export function taparSecretos(texto: string): { texto: string; tapados: number } {
  let tapados = 0;
  let salida = texto;
  for (const forma of FORMAS) {
    salida = salida.replace(forma, (...args) => {
      const entero = args[0] as string;
      const delante = args[1] as string;
      const valor = (args[args.length - 1] as { valor: string }).valor;
      if (!esValorDeVerdad(valor)) return entero;
      tapados++;
      return `${delante}${TAPADO}${entero.slice(delante.length + valor.length)}`;
    });
  }
  return { texto: salida, tapados };
}

/**
 * Lo mismo sobre un valor de JSON, recorriendo sus cadenas: una línea de `actos.jsonl` lleva el XML pegado ESCAPADO
 * (`\"client_secret\"`), y tapar el texto crudo del fichero no casaría. Las claves del objeto no se tocan.
 */
export function taparSecretosEnJson(valor: unknown): { valor: unknown; tapados: number } {
  let tapados = 0;
  const recorrer = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = taparSecretos(v);
      tapados += r.tapados;
      return r.texto;
    }
    if (Array.isArray(v)) return v.map(recorrer);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recorrer(x)]));
    return v;
  };
  return { valor: recorrer(valor), tapados };
}

/** Los NOMBRES de los secretos que lleva un texto, sin repetir y sin valor: para avisar sin repetir el secreto. */
export function secretosQueLleva(texto: string): string[] {
  const nombres = new Set<string>();
  for (const forma of FORMAS) {
    for (const m of texto.matchAll(forma)) {
      const valor = m.groups?.valor ?? "";
      if (!esValorDeVerdad(valor)) continue;
      const delante = m[1] ?? "";
      const nombre = /BEGIN/.test(delante)
        ? "clave privada"
        : /Bearer/i.test(delante)
          ? "token Bearer"
          : (new RegExp(String.raw`(${CLAVES})`, "iu").exec(delante.replace(/^.*\bname\s*=\s*["']/i, ""))?.[1] ?? "secreto");
      nombres.add(nombre.toLowerCase());
    }
  }
  return [...nombres];
}

/**
 * El aviso del chat cuando un mensaje lleva un secreto. No lo bloquea: pegarlo puede ser justo lo que hace falta para
 * que el agente configure un entorno. Dice a dónde va —al modelo, al historial, quizá al proyecto— y qué se tapa.
 */
export function avisoDeSecretosEnElMensaje(nombres: readonly string[]): string {
  return (
    `Tu mensaje lleva lo que parece un secreto (${nombres.join(", ")}). Se envía al modelo y queda en el historial de ` +
    "esta conversación, y si el agente lo escribe en un fichero, en el proyecto. La exportación de Soporte tapa su valor. " +
    "Si es de producción, mejor no pegarlo aquí."
  );
}
