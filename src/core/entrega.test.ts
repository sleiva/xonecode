import { describe, expect, it } from "vitest";
import {
  condicionesDeEntrega,
  decisionDeEntrega,
  medidaDeEntrega,
  type MedidaDeEntrega,
} from "./entrega.js";

/** Una medida que pasa las tres, para variar una sola cosa por test. */
const VERDE: MedidaDeEntrega = { verificador: "verde", pendientes: 0, revisable: true };

describe("condicionesDeEntrega: lo que comprueba el CÓDIGO", () => {
  /**
   * Es la regla que este repo ya tenía escrita para la subida autónoma
   * (`core/cloudstudio.ts#PoliticaDeAprobacion`), y el motivo es el mismo por el que los
   * avisos de honestidad son código y no prompt: a un modelo se le puede pedir que avise y
   * a veces no avisa. Si el juez pudiera entregar solo, «terminada» valdría lo que valga la
   * buena voluntad de un modelo esa vez.
   */
  it("el veredicto del juez NO basta solo: una condición en rojo lo tumba", () => {
    expect(condicionesDeEntrega({ ...VERDE, verificador: "rojo" })).toEqual({
      entregable: false,
      motivo: expect.stringContaining("verificador"),
    });
  });

  it("con las tres en verde, es entregable — y sigue faltando el juez, que decide aparte", () => {
    expect(condicionesDeEntrega(VERDE)).toEqual({ entregable: true });
  });

  it("nada pendiente de aprobar y trabajo revisable son condiciones, no detalles", () => {
    expect(condicionesDeEntrega({ ...VERDE, pendientes: 2 }).entregable).toBe(false);
    expect(condicionesDeEntrega({ ...VERDE, revisable: false }).entregable).toBe(false);
  });

  it("un verificador que NO CORRIÓ no es verde", () => {
    // La trampa de siempre: «no se sabe» no es «está bien». Un turno que no escribió no
    // corre el simulador, y dar eso por verde entregaría trabajo que nadie midió.
    expect(condicionesDeEntrega({ ...VERDE, verificador: "no-corrio" }).entregable).toBe(false);
  });

  /**
   * El motivo es lo único que una persona va a leer en la tarjeta, así que dice TODAS las
   * que fallaron y no la primera. Y es justo el caso medido de la deuda que esta tarea
   * hereda: un turno cortado por el tope de rondas tiene escrituras pendientes Y un
   * verificador que no corrió — decir solo una de las dos manda a adivinar la otra.
   */
  it("el motivo nombra TODAS las condiciones que fallaron", () => {
    const { motivo } = condicionesDeEntrega({ verificador: "no-corrio", pendientes: 3, revisable: false });
    expect(motivo).toContain("verificador");
    expect(motivo).toContain("3");
    expect(motivo).toContain("revisar");
  });

  it("el motivo del verificador que no corrió dice POR QUÉ, cuando se sabe", () => {
    const { motivo } = condicionesDeEntrega({
      ...VERDE,
      verificador: "no-corrio",
      motivoSinVerificar: "no está xone-simulator en el PATH",
    });
    expect(motivo).toContain("xone-simulator");
  });

  it("el motivo del rojo cuenta los ERRORES del turno, no todos los hallazgos", () => {
    const { motivo } = condicionesDeEntrega({
      ...VERDE,
      verificador: "rojo",
      hallazgos: [
        { code: "COLL_MISSING_PROGID", severidad: "error", mensaje: "falta progid" },
        { code: "X", severidad: "warning", mensaje: "un aviso" },
      ],
    });
    expect(motivo).toContain("1 error");
  });

  /** Un motivo no puede llevar ninguna ruta de la máquina: viaja por el cable. */
  it("el motivo no lleva rutas absolutas aunque el hallazgo traiga fichero", () => {
    const { motivo } = condicionesDeEntrega({
      ...VERDE,
      verificador: "rojo",
      hallazgos: [{ code: "X", severidad: "error", mensaje: "mal", fichero: "app/Clientes.xne" }],
    });
    expect(motivo).not.toContain("/Users/");
  });
});

describe("decisionDeEntrega: las condiciones Y el juez, y hacen falta las dos", () => {
  it("con el juez en verde y una condición en rojo, la tarea NO se entrega", () => {
    const decision = decisionDeEntrega(
      { ...VERDE, pendientes: 1 },
      { veredicto: "verde", resumen: "hace lo que pide" }
    );
    expect(decision.entregable).toBe(false);
    // Y el motivo dice cuál falló, no que el juez tuviera algo que ver.
    expect(decision.motivo).toContain("aprobación");
  });

  it("con las tres condiciones en verde y el juez en rojo, tampoco — y con lo que dijo", () => {
    const decision = decisionDeEntrega(VERDE, {
      veredicto: "rojo",
      resumen: "la colección no tiene el campo que se pedía",
    });
    expect(decision.entregable).toBe(false);
    expect(decision.motivo).toContain("la colección no tiene el campo que se pedía");
  });

  it("un veredicto que no se entendió no entrega", () => {
    const decision = decisionDeEntrega(VERDE, { veredicto: "indeterminado", resumen: "no era JSON" });
    expect(decision.entregable).toBe(false);
  });

  /**
   * Sin veredicto no se entrega, y esto es lo que hace que «que el juez no se pueda usar»
   * sea un fallo del ENTORNO y no una entrega en silencio: quien no pudo preguntar no
   * tiene con qué decidir.
   */
  it("sin veredicto no se entrega, y el motivo dice que falta el juez", () => {
    const decision = decisionDeEntrega(VERDE, undefined);
    expect(decision.entregable).toBe(false);
    expect(decision.motivo).toContain("juez");
  });

  it("las tres condiciones y el juez en verde: entregable", () => {
    expect(decisionDeEntrega(VERDE, { veredicto: "verde", resumen: "bien" })).toEqual({ entregable: true });
  });
});

describe("medidaDeEntrega: ausente NO es vacío", () => {
  /**
   * Un ejecutor que no informa —el guionizado, o cualquier piel que no reenvíe el
   * retorno— no ha dicho que el verificador esté verde: ha dicho nada. Darlo por verde
   * sería la entrega silenciosa que toda esta tarea existe para impedir.
   */
  it("un turno que no informa de nada no es un turno verde", () => {
    const medida = medidaDeEntrega(undefined, true);
    expect(medida.verificador).toBe("no-corrio");
    expect(condicionesDeEntrega(medida).entregable).toBe(false);
    // Y lo dice: «no se sabe» tiene que distinguirse de «el simulador no está».
    expect(condicionesDeEntrega(medida).motivo).toContain("no informa");
  });

  it("lo que el turno informó se conserva tal cual, con el revisable de fuera", () => {
    expect(medidaDeEntrega({ verificador: "verde", pendientes: 0 }, false)).toEqual({
      verificador: "verde",
      pendientes: 0,
      revisable: false,
    });
  });
});
