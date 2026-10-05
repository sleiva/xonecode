import type { FicheroDelProyecto, MensajeDelCliente } from "./tipos.js";

/**
 * Las reglas PURAS del editor de la pestaña Ficheros que no necesitan CodeMirror: qué se puede
 * editar, los finales de línea y si un guardado cabe por el cable. Viven fuera de `editor/` a
 * propósito: las usa `App` (`usarEdicion.ts`), y a `editor/` solo se llega con `import()`.
 */

/**
 * Un fichero se edita si y solo si llegó como texto ENTERO, en UTF-8 o latin1, y con huella: uno
 * recortado se guardaría cortado, y sin huella no hay forma de saber si el disco cambió. El latin1
 * se edita porque el SERVIDOR lo guarda en la codificación que ya tenía —windows-1252, decidido por
 * los bytes del disco y no por el cliente— y niega lo que no cabe en ella. Una imagen tampoco —ni el
 * SVG, que tiene texto—: así lo pide el diseño, y su visor enseña el dibujo, que no se repintaría al
 * teclear.
 */
export function esEditable(f: FicheroDelProyecto | undefined): f is FicheroDelProyecto & { texto: string; huella: string } {
  return (
    f !== undefined &&
    f.error === undefined &&
    typeof f.texto === "string" &&
    typeof f.huella === "string" &&
    !f.recortado &&
    !f.binario &&
    (f.codificacion === undefined || f.codificacion === "utf-8" || f.codificacion === "latin1") &&
    f.mime === undefined
  );
}

/**
 * Por qué NO hay «Editar», para decirlo en la cabecera en vez de esconder el botón sin más. Sin
 * motivo cuando sí se edita, cuando no hay fichero, o cuando la lectura dio un error: ese ya lo
 * enseña el visor, y repetirlo aquí sería decirlo dos veces.
 */
export function motivoParaNoEditar(f: FicheroDelProyecto | undefined): string | undefined {
  if (f === undefined || f.error !== undefined || esEditable(f)) return undefined;
  if (f.mime !== undefined) return "No se puede editar: es una imagen";
  if (f.binario) return "No se puede editar: es binario";
  if (f.recortado) return "No se puede editar: el fichero pasa del tope de tamaño";
  return undefined;
}

export type FinDeLinea = "\n" | "\r\n";

/**
 * El final de línea DOMINANTE. El editor trabaja siempre con «\n» y se le devuelve al fichero el
 * suyo al guardar: un `.xne` hecho en Windows sigue en CRLF. Un fichero con los dos mezclados sale
 * con el dominante —límite declarado—, que es lo que haría cualquier editor que normaliza.
 */
export function finDeLineaDe(texto: string): FinDeLinea {
  const crlf = (texto.match(/\r\n/g) ?? []).length;
  const lf = (texto.match(/\n/g) ?? []).length - crlf;
  return crlf > lf ? "\r\n" : "\n";
}

/** Todo a «\n»: también el «\r» suelto, que CodeMirror ya trata como salto. */
export function normalizarFinesDeLinea(texto: string): string {
  return texto.replace(/\r\n?/g, "\n");
}

export function conFinDeLinea(texto: string, fin: FinDeLinea): string {
  return fin === "\n" ? texto : texto.replace(/\n/g, "\r\n");
}

/**
 * El tope del cuerpo de `POST /accion` en el servidor (`arranque.ts#TOPE_DE_CUERPO`), copiado
 * porque la frontera no deja importarlo y atado por test. Pasarlo da un 400 sin mensaje que
 * pintar, así que se comprueba ANTES de mandar y se dice.
 */
export const TOPE_DEL_CUERPO_DEL_CABLE = 1_000_000;

/** En BYTES del mensaje ya serializado: el JSON escapa saltos y tabuladores, y eso también viaja. */
export function cabeEnElCable(mensaje: MensajeDelCliente): boolean {
  return new TextEncoder().encode(JSON.stringify(mensaje)).length <= TOPE_DEL_CUERPO_DEL_CABLE;
}
