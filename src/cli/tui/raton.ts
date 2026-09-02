/**
 * El ratón y los modos de terminal de la TUI. TypeScript puro: sin ink.
 *
 * La rueda del ratón la recibe el TERMINAL, no la aplicación, y mueve el scrollback
 * entero — «todo scrollea», medido con el usuario. Para que mueva el panel central hay que
 * pedirle al terminal los eventos de ratón (seguimiento SGR) y, como Ink lee stdin y
 * trataría esas secuencias como teclas (acabarían como texto en la Entrada), el filtro
 * va DELANTE de Ink: `crearStdinSinRaton` envuelve el stdin real con la superficie que
 * Ink usa, quita el ratón y entrega las muescas de rueda por un emisor.
 *
 * La pantalla alternativa (la de vim o htop) va en el mismo sitio porque persigue lo
 * mismo: mientras xonecode corre no hay scrollback que mover, y al salir el terminal
 * recupera lo que tenía. Los modos SOLO se escriben con stdout TTY: sin él, ni un escape.
 */
import { EventEmitter } from "node:events";
// Las secuencias viven en tema.ts: es el ÚNICO fichero de producción con escapes ANSI
// (tema.test.ts lo vigila), y estas son control de terminal como `arriba` o `limpiarLinea`.
import { MODOS_DE_TERMINAL } from "../tema.js";

/** Las secuencias de modo, tal cual se escriben en stdout. */
export const MODOS = MODOS_DE_TERMINAL;

/** Una secuencia SGR completa (`ESC [ < b ; x ; y M|m`) o una X10 (`ESC [ M` + 3 bytes). */
const SECUENCIA = /\x1b\[<(\d+);\d+;\d+[Mm]|\x1b\[M[\s\S]{3}/g;
/** Un prefijo de secuencia SGR o X10 que se quedó a medias al final del chunk. */
const PREFIJO_INCOMPLETO = /\x1b(\[(<[\d;]*|M[\s\S]{0,2})?)?$/;
/** Los bits de modificador que el terminal suma al botón: shift 4, alt 8, ctrl 16. */
const MODIFICADORES = 4 | 8 | 16;

/**
 * Separa un chunk de stdin en teclas (lo que Ink debe ver), muescas de rueda (+1 arriba,
 * -1 abajo, sumadas) y el prefijo incompleto que hay que pegar al chunk siguiente.
 * Pura y total: lo que no es ratón pasa tal cual, incluidos un ESC solo y las flechas.
 */
export function separarRaton(entrada: string): { teclas: string; rueda: number; resto: string } {
  let rueda = 0;
  const sinRaton = entrada.replace(SECUENCIA, (_, boton?: string) => {
    if (boton !== undefined) {
      const base = Number(boton) & ~MODIFICADORES;
      if (base === 64) rueda += 1;
      else if (base === 65) rueda -= 1;
    }
    return "";
  });
  // Un ESC a secas es la tecla Escape, y `ESC [ A` una flecha: solo es prefijo de ratón lo
  // que ya ha abierto `ESC [ <` o `ESC [ M` — el grupo 2 del patrón.
  const m = PREFIJO_INCOMPLETO.exec(sinRaton);
  const resto = m !== null && m[2] !== undefined ? m[0] : "";
  return { teclas: sinRaton.slice(0, sinRaton.length - resto.length), rueda, resto };
}

/** Un emisor mínimo de muescas: quien monta lo crea, el filtro emite, el Transcript se suscribe. */
export function crearEmisorDeRueda() {
  const suscriptores: ((delta: number) => void)[] = [];
  return {
    emitir(delta: number): void {
      for (const s of [...suscriptores]) s(delta);
    },
    suscribir(f: (delta: number) => void): () => void {
      suscriptores.push(f);
      return () => {
        const i = suscriptores.lastIndexOf(f);
        if (i !== -1) suscriptores.splice(i, 1);
      };
    },
  };
}

export type EmisorDeRueda = ReturnType<typeof crearEmisorDeRueda>;

/** La superficie de stdin que Ink 5 usa (ink.js y components/App.js), y nada más. */
export interface StdinParaInk extends EventEmitter {
  isTTY?: boolean;
  read(): string | null;
  setRawMode(modo: boolean): void;
  setEncoding(codificacion: string): void;
  resume(): void;
  pause(): void;
  ref(): void;
  unref(): void;
}

/**
 * El stdin que se le da a Ink: el real, con el ratón quitado. Lee del real en cada
 * `readable`, guarda las teclas en una cola y emite su propio `readable` SOLO si hay
 * teclas (un chunk que era solo ratón no despierta a Ink). Todo lo demás se delega.
 */
export function crearStdinSinRaton(real: StdinParaInk, alRueda: (delta: number) => void): StdinParaInk {
  const cola: string[] = [];
  let resto = "";
  const filtrado = new EventEmitter() as StdinParaInk;
  Object.defineProperty(filtrado, "isTTY", { get: () => real.isTTY, enumerable: true });
  filtrado.read = () => cola.shift() ?? null;
  filtrado.setRawMode = (modo) => real.setRawMode(modo);
  filtrado.setEncoding = (c) => real.setEncoding(c);
  filtrado.resume = () => real.resume();
  filtrado.pause = () => real.pause();
  filtrado.ref = () => real.ref();
  filtrado.unref = () => real.unref();
  real.on("readable", () => {
    let hayTeclas = false;
    let chunk: string | null;
    while ((chunk = real.read()) !== null) {
      const separado = separarRaton(resto + String(chunk));
      resto = separado.resto;
      if (separado.rueda !== 0) alRueda(separado.rueda);
      if (separado.teclas !== "") {
        cola.push(separado.teclas);
        hayTeclas = true;
      }
    }
    if (hayTeclas) filtrado.emit("readable");
  });
  return filtrado;
}

/**
 * Entra en los modos (pantalla alternativa y, si se pide, ratón) y devuelve la salida,
 * idempotente. Sin `isTTY` no escribe nada: los tests con stdout falso y las tuberías
 * siguen byte-idénticos. La salida deshace en orden inverso, y quien la llama debe
 * hacerlo DESPUÉS de desmontar Ink, para que el último frame no caiga fuera de la pantalla
 * alternativa.
 */
export function entrarEnModos(
  stdout: { isTTY?: boolean; write: (texto: string) => boolean },
  opciones: { raton: boolean }
): () => void {
  if (stdout.isTTY !== true) return () => {};
  stdout.write(MODOS.entrarPantallaAlternativa);
  if (opciones.raton) stdout.write(MODOS.activarRaton);
  let salido = false;
  return () => {
    if (salido) return;
    salido = true;
    if (opciones.raton) stdout.write(MODOS.desactivarRaton);
    stdout.write(MODOS.salirPantallaAlternativa);
  };
}
