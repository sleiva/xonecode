import { describe, it, expect } from "vitest";
import { plegarIguales, CONTEXTO_DEL_DIFF, MINIMO_PLEGABLE, type LineaDeDiff } from "./plegarIguales.js";

const igual = (texto: string): LineaDeDiff => ({ tipo: "igual", texto });
const anadido = (texto: string): LineaDeDiff => ({ tipo: "anadido", texto });
const quitado = (texto: string): LineaDeDiff => ({ tipo: "quitado", texto });
const iguales = (cuantas: number, desde = 0): LineaDeDiff[] =>
  Array.from({ length: cuantas }, (_, i) => igual(`i${i + desde}`));

/** Lo que se pinta a la vista, en orden, para poder afirmar sobre el resultado sin
 *  reproducir la estructura de tramos en cada test. */
const visibles = (lineas: readonly LineaDeDiff[]): string[] =>
  plegarIguales(lineas)
    .filter((t) => t.clase === "lineas")
    .flatMap((t) => t.lineas.map((l) => l.texto));

const plegadas = (lineas: readonly LineaDeDiff[]): number[] =>
  plegarIguales(lineas)
    .filter((t) => t.clase === "plegado")
    .map((t) => t.lineas.length);

describe("plegarIguales", () => {
  /**
   * El caso que lo motivó: un fichero largo con un cambio en medio. Antes se volcaban las
   * cien líneas y el cambio había que buscarlo a ojo.
   */
  it("pliega el medio de una racha larga y deja el contexto a los dos lados", () => {
    const d = [anadido("nuevo"), ...iguales(40), quitado("viejo")];
    expect(plegadas(d)).toEqual([40 - CONTEXTO_DEL_DIFF * 2]);
    expect(visibles(d)).toEqual(["nuevo", "i0", "i1", "i2", "i37", "i38", "i39", "viejo"]);
  });

  /**
   * Los EXTREMOS no son una excepción, son el caso más común: el cambio de un `.xne` está
   * casi siempre por el medio, con toda la cabecera delante. Una racha al principio no
   * envuelve nada por arriba, así que ahí no se reserva contexto — sin esto, un fichero con
   * el único cambio en la línea 300 seguía abriendo con 300 líneas a la vista.
   */
  it("la racha del PRINCIPIO solo conserva el contexto de abajo", () => {
    const d = [...iguales(20), anadido("el cambio")];
    expect(plegadas(d)).toEqual([20 - CONTEXTO_DEL_DIFF]);
    expect(visibles(d)).toEqual(["i17", "i18", "i19", "el cambio"]);
  });

  it("y la del FINAL solo el de arriba", () => {
    const d = [anadido("el cambio"), ...iguales(20)];
    expect(plegadas(d)).toEqual([20 - CONTEXTO_DEL_DIFF]);
    expect(visibles(d)).toEqual(["el cambio", "i0", "i1", "i2"]);
  });

  /**
   * Nada se PIERDE: las líneas plegadas viajan dentro del tramo, que es lo que permite
   * abrirlo sin pedirle nada a nadie. La suma tiene que dar el diff entero.
   */
  it("no se pierde ni una línea: los tramos suman el diff completo", () => {
    const d = [...iguales(10), anadido("a"), ...iguales(30, 100), quitado("q"), ...iguales(8, 200)];
    const todas = plegarIguales(d).flatMap((t) => t.lineas.map((l) => l.texto));
    expect(todas).toEqual(d.map((l) => l.texto));
  });

  /**
   * Un fichero NUEVO es todo `anadido`: no hay racha que plegar y no se toca nada. Es la
   * regla que sostiene el test de «un diff de 40 líneas se enseña ENTERO» del modal.
   */
  it("un diff sin líneas iguales se queda tal cual: ni un plegado", () => {
    const d = Array.from({ length: 40 }, (_, i) => anadido(`linea-${i}`));
    expect(plegadas(d)).toEqual([]);
    expect(visibles(d)).toHaveLength(40);
  });

  /**
   * Plegar dos líneas para poner un «… 2 líneas sin cambios» en su sitio no ahorra nada y
   * cambia contenido por un control: sale peor. El mínimo se mide sobre lo que se PLEGARÍA,
   * no sobre la racha entera.
   */
  it("una racha corta no se pliega: el control ocuparía más que las líneas", () => {
    const d = [anadido("a"), ...iguales(CONTEXTO_DEL_DIFF * 2 + MINIMO_PLEGABLE - 1), quitado("q")];
    expect(plegadas(d)).toEqual([]);
  });

  it("justo en el mínimo sí se pliega", () => {
    const d = [anadido("a"), ...iguales(CONTEXTO_DEL_DIFF * 2 + MINIMO_PLEGABLE), quitado("q")];
    expect(plegadas(d)).toEqual([MINIMO_PLEGABLE]);
  });

  it("varias rachas dan varios plegados, cada uno con su cuenta", () => {
    const d = [...iguales(15), anadido("a"), ...iguales(25, 100), quitado("q"), ...iguales(9, 200)];
    expect(plegadas(d)).toEqual([15 - CONTEXTO_DEL_DIFF, 25 - CONTEXTO_DEL_DIFF * 2, 9 - CONTEXTO_DEL_DIFF]);
  });

  it("un diff vacío no da tramos", () => {
    expect(plegarIguales([])).toEqual([]);
  });

  /**
   * Un diff SIN un solo cambio no debería llegar aquí —no habría nada que aprobar— pero si
   * llega se pliega entero en vez de volcar el fichero: es lo que dice la verdad, «aquí no
   * hay nada que decidir», y sigue abriéndose con un clic.
   */
  it("un diff sin ningún cambio se pliega entero", () => {
    const d = iguales(30);
    expect(plegadas(d)).toEqual([30]);
    expect(visibles(d)).toEqual([]);
  });
});
