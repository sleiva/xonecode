/**
 * El registro de lo que se traga un `catch`.
 *
 * **Por qué hace falta.** Este harness tiene 123 `catch` y casi todos callan a propósito: que
 * no se pueda leer un adjunto, que falle el validador, que `git` no esté — ninguna de esas
 * cosas puede tumbar un turno, y por eso se devuelven en vez de lanzarse. El precio es que
 * cuando algo va mal **no queda rastro de nada**. Medido sobre una sesión que se colgó: el
 * proceso estaba vivo y OCIOSO —`kevent`, sin un socket abierto, sin trabajo—, el `.jsonl`
 * acababa en el mensaje de la persona sin su `fin`, y desde fuera no había forma de saber
 * dónde se quedó. No es que el registro fuera pobre: es que no existía.
 *
 * **Es la misma pieza que `XONECODE_TRACE_TOOLS`** (`agent/turno/diagnosticoDeTools.ts`) y por
 * la misma razón: apagado no cuesta nada, encendido deja un `.jsonl` que se puede leer después.
 * Lo que cambia es qué anota — allí a dónde se fueron los tokens, aquí qué se calló.
 *
 * **Y el sumidero entra por PARÁMETRO**, como el de `core/bitacora.ts`: este módulo vive en
 * `core/` y no toca disco, así que `npm test` no escribe nada y quien lo prueba ve lo que se
 * anotó sin abrir un fichero.
 */

/**
 * Un HITO: «empecé esto» / «lo acabé». No es un error, y es lo que de verdad encuentra un
 * cuelgue.
 *
 * **Una excepción tragada no explica un proceso que se queda parado**, y eso se midió: el
 * proceso colgado estaba OCIOSO —event loop en `kevent`, sin sockets, sin trabajo—, así que no
 * había ninguna excepción que anotar. Lo que faltaba era saber qué fue lo último que EMPEZÓ y
 * nunca terminó. Con pares `inicio`/`fin` eso se lee de un vistazo: el hito sin pareja es el
 * sitio.
 */
export interface PasoAnotado {
  donde: string;
  fase: "inicio" | "fin";
  /** Lo justo para distinguir dos pasos del mismo sitio. Nunca contenido ni rutas absolutas. */
  detalle?: string;
  /** Cuánto duró, solo en el `fin`. */
  ms?: number;
}

/** Lo que se guarda de una excepción. Nunca el `stack`: ver `mensajeSeguro`. */
export interface ErrorAnotado {
  /** Dónde se tragó, en la forma `modulo#funcion`. Lo escribe quien llama, no se adivina. */
  donde: string;
  /** El `name` del error, que es lo que distingue un ENOENT de un fallo de parseo. */
  nombre: string;
  /** El `code` de un error de Node, cuando lo hay: es lo ÚNICO específico que se puede contar. */
  codigo?: string;
  /** El mensaje, ya sin rutas de la máquina. */
  mensaje: string;
}

/**
 * El mensaje de un error, sin lo que no puede salir de la máquina.
 *
 * **Un error de Node lleva la ruta absoluta dentro del mensaje** —«ENOENT: no such file or
 * directory, open '/Users/alguien/…'»— y este registro acaba en un `.jsonl` que una persona
 * puede mirar por un túnel. Es la misma regla que ya obliga a `codigoDe` y a quedarse con el
 * `error.name` en las guardas: de un error de Node, solo lo que no identifica a nadie.
 *
 * Las rutas se SUSTITUYEN en vez de tirar el mensaje entero, porque lo que queda —«ENOENT: no
 * such file or directory, open '<ruta>'»— sigue diciendo qué pasó.
 */
export function mensajeSeguro(mensaje: string): string {
  return mensaje
    .replace(/(['"`])\/(?:[^'"`\s]|\\ )*\1/g, "$1<ruta>$1")
    .replace(/(?<![\w'"`/])\/(?:Users|home|private|Volumes|tmp|var|opt)\/[^\s'"`,;)]*/g, "<ruta>");
}

/** De un error, lo que se puede contar. */
export function anotable(donde: string, error: unknown): ErrorAnotado {
  if (error instanceof Error) {
    const codigo = (error as { code?: unknown }).code;
    return {
      donde,
      nombre: error.name,
      ...(typeof codigo === "string" ? { codigo } : {}),
      mensaje: mensajeSeguro(error.message),
    };
  }
  return { donde, nombre: "desconocido", mensaje: mensajeSeguro(String(error)) };
}

/** A dónde van los anotados. Uno solo por proceso: ver `anotarError`. */
export type SumideroDeErrores = (anotado: ErrorAnotado | PasoAnotado) => void;

let sumidero: SumideroDeErrores | undefined;

/**
 * Enchufa el sumidero. Sin esto, anotar no hace NADA — que es lo que debe pasar apagado.
 *
 * Es global a propósito, y es la única forma que funciona aquí: los sitios que se tragan una
 * excepción están repartidos por todo el árbol —`core/`, `agent/`, `web/`— y muchos viven en
 * funciones puras sin sitio donde inyectar nada. Pasarlo por parámetro habría obligado a
 * cambiar la firma de medio harness para añadir una línea de diagnóstico, y eso es justo el
 * cambio que nadie hace.
 */
export function ponerSumideroDeErrores(nuevo: SumideroDeErrores | undefined): void {
  sumidero = nuevo;
}

/**
 * Anota lo que un `catch` acaba de tragarse. **No cambia lo que pasa después.**
 *
 * Quien la llama sigue haciendo exactamente lo mismo que hacía: devolver `undefined`, seguir
 * adelante, tragarse el fallo. Esto es un testigo, no una decisión — si además cambiara el
 * control, cada sitio habría que volver a medirlo.
 *
 * Y NUNCA lanza: un registro de diagnóstico que rompe lo que observa es peor que no tenerlo.
 */
export function anotarError(donde: string, error: unknown): void {
  if (sumidero === undefined) return;
  emitir(anotable(donde, error));
}

/**
 * Anota que algo EMPIEZA, y devuelve la función que anota que acabó.
 *
 * Se usa envolviendo, no con dos llamadas sueltas: `const fin = anotarPaso(...); try { … }
 * finally { fin(); }`. Así el `fin` no se puede olvidar en la rama del error, que es
 * justamente la rama que interesa.
 *
 * Apagado no cuesta nada —ni una fecha— porque se sale antes de mirar el reloj.
 */
export function anotarPaso(donde: string, detalle?: string): () => void {
  if (sumidero === undefined) return () => {};
  const t0 = Date.now();
  emitir({ donde, fase: "inicio", ...(detalle === undefined ? {} : { detalle }) });
  let cerrado = false;
  return () => {
    if (cerrado) return;
    cerrado = true;
    emitir({ donde, fase: "fin", ...(detalle === undefined ? {} : { detalle }), ms: Date.now() - t0 });
  };
}

function emitir(anotado: ErrorAnotado | PasoAnotado): void {
  if (sumidero === undefined) return;
  try {
    sumidero(anotado);
  } catch {
    // Ni el testigo puede tumbar a quien observa.
  }
}
