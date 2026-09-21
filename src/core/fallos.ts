/**
 * Qué se guarda cuando un turno revienta, y por qué justo eso.
 *
 * ## De dónde sale la lista
 *
 * De una sesión entera diagnosticando fallos reales a partir de lo que el usuario podía
 * pegar. Cada cosa que hay aquí es una que hizo falta y no estaba:
 *
 * - **La CADENA de causas.** El error que llega arriba suele ser un envoltorio:
 *   `MiddlewareError` guarda el de verdad en `cause`, y lo único que se veía era su
 *   mensaje. Saber que el envoltorio lo puso `wrapToolCall` —o sea, que reventó dentro de
 *   un subagente— fue lo que cerró el caso de DeepSeek, y hubo que deducirlo del prefijo
 *   del nombre.
 * - **El MODELO de cada papel.** Tres de los fallos del día eran de un proveedor concreto
 *   y el informe no lo decía; se preguntó a mano cada vez.
 * - **Los últimos PASOS.** Un `400` no dice nada; «tras delegar en dos subagentes» sí.
 *   Solo los NOMBRES, nunca los argumentos — la misma regla que `core/events.ts`.
 *
 * ## Lo que NO se guarda, y es deliberado
 *
 * Ni el contenido de un fichero, ni los argumentos de una tool, ni los mensajes mandados
 * al modelo. Un registro de fallos que copie el prompt es una copia del proyecto en el
 * disco, y además crece sin control. Lo que se guarda cabe en una pantalla y se puede
 * pegar entero en una conversación, que es exactamente para lo que existe.
 *
 * **Y esto sí puede llevar rutas de la máquina**, a diferencia de todo lo que viaja por el
 * cable (`sinRutas`): el fichero vive en el proyecto de quien lo genera y nunca cruza un
 * túnel. La regla de las rutas es del transporte, no del disco.
 */

/** Un eslabón de la cadena: el envoltorio y lo que envolvía. */
export interface CausaDeFallo {
  nombre: string;
  mensaje: string;
}

export interface RegistroDeFallo {
  v: 1;
  at: string;
  /** El encargo, recortado: sirve para reconocer el turno, no para reproducirlo. */
  peticion?: string;
  /** Del envoltorio hacia dentro. El PRIMERO es el que llegó arriba. */
  causas: CausaDeFallo[];
  /** Papel → «proveedor/modelo». Sin él, «falla con DeepSeek» hay que preguntarlo. */
  modelos?: Record<string, string>;
  /** Los últimos pasos, por NOMBRE. Nunca argumentos. */
  pasos?: string[];
}

/** Lo que cabe de la petición: suficiente para reconocerla de un vistazo. */
export const TOPE_DE_PETICION = 200;
/** Cuántos eslabones se siguen. Una cadena más larga que esto es un ciclo o un bug ajeno. */
export const TOPE_DE_CAUSAS = 8;
/** Cuántos pasos se recuerdan: los que caben en una pantalla. */
export const TOPE_DE_PASOS = 20;

function recortar(texto: string, tope: number): string {
  const limpio = texto.trim().replace(/\s+/g, " ");
  return limpio.length <= tope ? limpio : `${limpio.slice(0, tope)}…`;
}

/**
 * Desenvuelve un error hasta el fondo, siguiendo `cause`.
 *
 * **Con tope y con guarda de ciclo.** Una `cause` que apunte a un ancestro es raro pero
 * posible —y un bucle aquí se come el proceso justo cuando ya algo ha ido mal—, así que se
 * recuerdan los objetos vistos. Lo que no sea un `Error` se describe por lo que es: un
 * `throw "texto"` también llega aquí, y perderlo por no ser una instancia sería tirar la
 * única pista.
 */
export function cadenaDeCausas(error: unknown): CausaDeFallo[] {
  const cadena: CausaDeFallo[] = [];
  const vistos = new Set<unknown>();
  let actual: unknown = error;
  while (actual !== undefined && actual !== null && cadena.length < TOPE_DE_CAUSAS) {
    if (vistos.has(actual)) break;
    vistos.add(actual);
    if (actual instanceof Error) {
      cadena.push({ nombre: actual.name, mensaje: recortar(actual.message, 600) });
      actual = (actual as { cause?: unknown }).cause;
      continue;
    }
    cadena.push({ nombre: typeof actual, mensaje: recortar(String(actual), 600) });
    break;
  }
  // Un error sin nada que contar sigue siendo un fallo: no se devuelve una lista vacía,
  // porque un registro sin causas se lee como «no se guardó» y no como «no dijo nada».
  return cadena.length > 0 ? cadena : [{ nombre: "desconocido", mensaje: "(sin mensaje)" }];
}

/** El registro entero, listo para una línea de JSONL. Puro: el reloj entra. */
export function registroDeFallo(
  fallo: {
    error: unknown;
    peticion?: string;
    modelos?: Record<string, string>;
    pasos?: readonly string[];
  },
  ahora: Date = new Date(),
): RegistroDeFallo {
  return {
    v: 1,
    at: ahora.toISOString(),
    ...(fallo.peticion === undefined || fallo.peticion.trim() === ""
      ? {}
      : { peticion: recortar(fallo.peticion, TOPE_DE_PETICION) }),
    causas: cadenaDeCausas(fallo.error),
    // Ausente es «no consta», como en todas partes: un `{}` afirmaría que no había modelos.
    ...(fallo.modelos === undefined || Object.keys(fallo.modelos).length === 0
      ? {}
      : { modelos: fallo.modelos }),
    ...(fallo.pasos === undefined || fallo.pasos.length === 0
      ? {}
      : { pasos: fallo.pasos.slice(-TOPE_DE_PASOS) }),
  };
}

/**
 * El registro en texto, para pegarlo en una conversación.
 *
 * Existe porque el JSONL es para las máquinas y lo que de verdad pasa es que alguien copia
 * el fallo y lo pega. Una línea de JSON de 600 caracteres se pega igual pero no se LEE, y
 * quien la recibe pierde el tiempo desenrollándola en vez de mirando el error.
 */
export function falloLegible(registro: RegistroDeFallo): string {
  const lineas: string[] = [`fallo · ${registro.at}`];
  if (registro.peticion !== undefined) lineas.push(`encargo: ${registro.peticion}`);
  if (registro.modelos !== undefined) {
    lineas.push(`modelos: ${Object.entries(registro.modelos).map(([p, m]) => `${p}=${m}`).join(" ")}`);
  }
  // La cadena con sangría creciente: se ve de un vistazo quién envolvió a quién, que es
  // justo el dato que hubo que deducir a mano.
  registro.causas.forEach((c, i) => lineas.push(`${"  ".repeat(i + 1)}${i === 0 ? "" : "↳ "}${c.nombre}: ${c.mensaje}`));
  if (registro.pasos !== undefined) lineas.push(`pasos: ${registro.pasos.join(" → ")}`);
  return lineas.join("\n");
}
