import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { separarRaton, crearEmisorDeRueda, crearStdinSinRaton, entrarEnModos, MODOS } from "./raton.js";

describe("separarRaton: quita las secuencias de ratón y cuenta las muescas de rueda", () => {
  it("texto sin ratón pasa tal cual", () => {
    expect(separarRaton("hola")).toEqual({ teclas: "hola", rueda: 0, resto: "" });
  });

  it("rueda arriba (botón 64) es +1 y rueda abajo (65) es -1; las teclas alrededor se conservan", () => {
    expect(separarRaton("ho\x1b[<64;12;5Mla")).toEqual({ teclas: "hola", rueda: 1, resto: "" });
    expect(separarRaton("\x1b[<65;12;5M\x1b[<65;12;6M")).toEqual({ teclas: "", rueda: -2, resto: "" });
  });

  it("los modificadores (shift 4, alt 8, ctrl 16) no cambian la muesca", () => {
    expect(separarRaton("\x1b[<68;1;1M").rueda).toBe(1); // 64 + shift
    expect(separarRaton("\x1b[<81;1;1M").rueda).toBe(-1); // 65 + ctrl
  });

  it("clics, arrastres y sueltas (m) se descartan sin dejar rastro en las teclas", () => {
    expect(separarRaton("\x1b[<0;3;4M\x1b[<32;3;5M\x1b[<0;3;5m")).toEqual({ teclas: "", rueda: 0, resto: "" });
    // X10 (por si el terminal ignora el modo SGR): ESC [ M + 3 bytes.
    expect(separarRaton("a\x1b[M !!b")).toEqual({ teclas: "ab", rueda: 0, resto: "" });
  });

  it("una secuencia partida entre dos chunks: el prefijo incompleto vuelve en `resto`", () => {
    const primero = separarRaton("x\x1b[<64;1");
    expect(primero).toEqual({ teclas: "x", rueda: 0, resto: "\x1b[<64;1" });
    expect(separarRaton(primero.resto + "0;3My")).toEqual({ teclas: "y", rueda: 1, resto: "" });
  });

  it("un ESC solo (Escape de verdad) o una flecha NO son ratón y pasan como teclas", () => {
    expect(separarRaton("\x1b")).toEqual({ teclas: "\x1b", rueda: 0, resto: "" });
    expect(separarRaton("\x1b[A")).toEqual({ teclas: "\x1b[A", rueda: 0, resto: "" });
  });
});

describe("el emisor de rueda", () => {
  it("entrega cada muesca a los suscritos y la baja deja de entregar", () => {
    const e = crearEmisorDeRueda();
    const vistas: number[] = [];
    const baja = e.suscribir((d) => vistas.push(d));
    e.emitir(1);
    e.emitir(-1);
    baja();
    e.emitir(1);
    expect(vistas).toEqual([1, -1]);
  });
});

/** Un stdin de mentira con la superficie que Ink usa: `write` empuja lo que `read` devolverá. */
class StdinFalso extends EventEmitter {
  isTTY = true;
  crudo: boolean[] = [];
  private pendiente: string | null = null;
  write(datos: string): void {
    this.pendiente = datos;
    this.emit("readable");
  }
  read(): string | null {
    const d = this.pendiente;
    this.pendiente = null;
    return d;
  }
  setRawMode(v: boolean): void {
    this.crudo.push(v);
  }
  setEncoding(): void {}
  resume(): void {}
  pause(): void {}
  ref(): void {}
  unref(): void {}
}

describe("crearStdinSinRaton: lo que Ink lee ya no lleva ratón", () => {
  it("las teclas llegan por readable/read, la rueda por el callback, y el modo crudo se delega", () => {
    const real = new StdinFalso();
    const muescas: number[] = [];
    const filtrado = crearStdinSinRaton(real, (d) => muescas.push(d));
    const leido: string[] = [];
    filtrado.on("readable", () => {
      let chunk: string | null;
      while ((chunk = filtrado.read()) !== null) leido.push(chunk);
    });
    real.write("ho\x1b[<64;1;1Mla");
    expect(leido).toEqual(["hola"]);
    expect(muescas).toEqual([1]);
    filtrado.setRawMode(true);
    expect(real.crudo).toEqual([true]);
    expect(filtrado.isTTY).toBe(true);
  });

  it("un chunk que es SOLO ratón no despierta a Ink: ni readable ni texto vacío", () => {
    const real = new StdinFalso();
    const filtrado = crearStdinSinRaton(real, () => {});
    let despertares = 0;
    filtrado.on("readable", () => despertares++);
    real.write("\x1b[<65;1;1M");
    expect(despertares).toBe(0);
    expect(filtrado.read()).toBeNull();
  });

  it("junta un prefijo partido con el chunk siguiente", () => {
    const real = new StdinFalso();
    const muescas: number[] = [];
    const filtrado = crearStdinSinRaton(real, (d) => muescas.push(d));
    const leido: string[] = [];
    filtrado.on("readable", () => {
      let chunk: string | null;
      while ((chunk = filtrado.read()) !== null) leido.push(chunk);
    });
    real.write("a\x1b[<64;");
    real.write("2;2Mb");
    expect(leido).toEqual(["a", "b"]);
    expect(muescas).toEqual([1]);
  });
});

describe("entrarEnModos: pantalla alternativa y ratón, SOLO con TTY", () => {
  const stdoutFalso = (isTTY: boolean | undefined) => {
    const escrito: string[] = [];
    return { escrito, stdout: { isTTY, write: (t: string) => (escrito.push(t), true) } };
  };

  it("con TTY entra en pantalla alternativa y activa el ratón; salir lo deshace en orden inverso", () => {
    const { escrito, stdout } = stdoutFalso(true);
    const salir = entrarEnModos(stdout, { raton: true });
    expect(escrito.join("")).toBe(MODOS.entrarPantallaAlternativa + MODOS.activarRaton);
    salir();
    expect(escrito.slice(1).join("").endsWith(MODOS.desactivarRaton + MODOS.salirPantallaAlternativa)).toBe(true);
  });

  it("con --sin-raton no toca el ratón pero sí la pantalla alternativa", () => {
    const { escrito, stdout } = stdoutFalso(true);
    const salir = entrarEnModos(stdout, { raton: false });
    salir();
    expect(escrito.join("")).toBe(MODOS.entrarPantallaAlternativa + MODOS.salirPantallaAlternativa);
  });

  it("sin TTY no escribe NADA: los tests con stdout falso y las tuberías siguen limpios", () => {
    const { escrito, stdout } = stdoutFalso(undefined);
    entrarEnModos(stdout, { raton: true })();
    expect(escrito).toEqual([]);
  });

  it("salir es idempotente: dos llamadas no salen dos veces", () => {
    const { escrito, stdout } = stdoutFalso(true);
    const salir = entrarEnModos(stdout, { raton: true });
    salir();
    salir();
    expect(escrito.join("").split(MODOS.salirPantallaAlternativa).length - 1).toBe(1);
  });
});
