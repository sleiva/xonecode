import { describe, expect, it } from "vitest";
import {
  condicionesDeEntrega,
  decisionDeEntrega,
  medidaDeEntrega,
  SALVEDAD_SIN_ESCRITURAS,
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
    const medida = medidaDeEntrega(undefined, { revisable: true });
    expect(medida.verificador).toBe("no-corrio");
    expect(condicionesDeEntrega(medida).entregable).toBe(false);
    // Y lo dice: «no se sabe» tiene que distinguirse de «el simulador no está».
    expect(condicionesDeEntrega(medida).motivo).toContain("no informa");
  });

  it("lo que el turno informó se conserva tal cual, con el revisable de fuera", () => {
    expect(medidaDeEntrega({ verificador: "verde", pendientes: 0 }, { revisable: false })).toEqual({
      verificador: "verde",
      pendientes: 0,
      revisable: false,
    });
  });
});

/**
 * **Una tarea de SOLO LECTURA sí se entrega, y no es relajar la regla.**
 *
 * «Un verificador que no corrió no es verde» existe porque una tarea que ESCRIBIÓ sin
 * verificarse está sin verificar. Una que no cambió ningún fichero no tiene nada que
 * verificar: el dominio del verificador son las escrituras, así que ahí la condición **no
 * aplica** en vez de fallar. Lo que sostiene que esto no sea un agujero son tres cosas, y
 * las tres tienen test aquí.
 */
describe("cuando el turno no escribió nada, el verificador no APLICA", () => {
  it("un turno sin escrituras se entrega aunque el verificador no corriera", () => {
    const medida: MedidaDeEntrega = {
      verificador: "no-corrio",
      pendientes: 0,
      revisable: true,
      escribio: false,
      motivoSinVerificar: "el turno no escribió ningún fichero del proyecto",
    };
    expect(condicionesDeEntrega(medida).entregable).toBe(true);
  });

  /** Y se DICE: una entrega con una condición menos no puede parecer una entrega normal. */
  it("y lo DICE, con la salvedad — que llega hasta la decisión final", () => {
    const medida: MedidaDeEntrega = { verificador: "no-corrio", pendientes: 0, revisable: true, escribio: false };
    expect(condicionesDeEntrega(medida).salvedad).toBe(SALVEDAD_SIN_ESCRITURAS);
    expect(decisionDeEntrega(medida, { veredicto: "verde", resumen: "no había nada que hacer" })).toEqual({
      entregable: true,
      salvedad: SALVEDAD_SIN_ESCRITURAS,
    });
    // La salvedad nombra las dos cosas: que no cambió nada, y quién decide entonces.
    expect(SALVEDAD_SIN_ESCRITURAS).toContain("juez");
  });

  /**
   * **El juez manda entero.** Con el verificador fuera de juego, su veredicto es la única
   * condición de contenido que queda — así que un rojo suyo tumba la entrega igual, y sin
   * él tampoco se entrega.
   */
  it("con el verificador fuera de juego, un juez en rojo sigue tumbando la entrega", () => {
    const medida: MedidaDeEntrega = { verificador: "no-corrio", pendientes: 0, revisable: true, escribio: false };
    expect(decisionDeEntrega(medida, { veredicto: "rojo", resumen: "no ha hecho lo que se pedía" })).toEqual({
      entregable: false,
      motivo: expect.stringContaining("no ha hecho lo que se pedía"),
    });
    expect(decisionDeEntrega(medida, undefined).entregable).toBe(false);
  });

  /**
   * **Y no aplica solo cuando GIT dice que no escribió**: `undefined` es «no se sabe» —sin
   * marca no es que no escribiera, es que no hay con qué mirarlo— y ahí la condición se
   * exige como siempre. Colapsar las dos sería un camino para entregar sin verificar.
   */
  it("«no se sabe» no es «no escribió»: sin marca, el verificador se exige igual", () => {
    const sinSaber: MedidaDeEntrega = { verificador: "no-corrio", pendientes: 0, revisable: true };
    expect(condicionesDeEntrega(sinSaber).entregable).toBe(false);
    expect(condicionesDeEntrega(sinSaber).motivo).toContain("verificador");
    expect(condicionesDeEntrega(sinSaber).salvedad).toBeUndefined();
  });

  it("las otras dos condiciones siguen enteras: pendientes y revisable", () => {
    // Unas escrituras esperando aprobación son escrituras que el turno QUISO hacer y no
    // hizo: eso no es una tarea de solo lectura, es una tarea a medias.
    expect(
      condicionesDeEntrega({ verificador: "no-corrio", pendientes: 2, revisable: true, escribio: false }).entregable
    ).toBe(false);
    expect(
      condicionesDeEntrega({ verificador: "no-corrio", pendientes: 0, revisable: false, escribio: false }).entregable
    ).toBe(false);
  });

  /**
   * **Autorizó escrituras y git dice que NADA cambió: eso no es una tarea de solo lectura.**
   *
   * `Tarea.autorizadas` se apunta al AUTORIZAR cada escritura, o sea ANTES de que el backend
   * escriba, así que una ruta que las guardas rechazan —`/artifacts/`, una vista aplanada,
   * `/.env`— sale ahí sin tocar el disco. Si git no ve ni un cambio y el turno autorizó
   * escrituras, TODAS se quedaron por el camino: la tarea se cree que trabajó y no aterrizó
   * nada. Es un hecho comprobable, así que es una condición del CÓDIGO y no una frase en el
   * prompt del juez — por lo mismo que el veredicto del juez no basta solo.
   */
  it("autorizó escrituras y git no ve ningún cambio: NO se entrega, y el motivo lo dice", () => {
    const medida: MedidaDeEntrega = {
      verificador: "no-corrio",
      pendientes: 0,
      revisable: true,
      escribio: false,
      autorizadas: 2,
      motivoSinVerificar: "el turno no escribió ningún fichero del proyecto",
    };
    const entrega = condicionesDeEntrega(medida);
    expect(entrega.entregable).toBe(false);
    expect(entrega.motivo).toContain("2 escritura(s)");
    expect(entrega.motivo).toContain("ningún cambio");
    /**
     * Y el motivo nombra TAMBIÉN que el verificador no corrió, que es la regla de esta
     * función: «nombra TODAS las que fallaron y no la primera». Aquí las dos son cara y
     * cruz de lo mismo —no aterrizó nada, así que no había nada que verificar— y leerlas
     * juntas es lo que cuenta la historia entera; quedarse con una manda a adivinar la otra.
     */
    expect(entrega.motivo).toContain("verificador");
    // Y NO se cuela por la puerta de la tarea de solo lectura: la salvedad diría que no
    // había nada que verificar, cuando lo que pasa es que no llegó nada al disco.
    expect(entrega.salvedad).toBeUndefined();
  });

  it("no autorizó ninguna y git dice que nada cambió: eso SÍ es una tarea de solo lectura", () => {
    const entrega = condicionesDeEntrega({
      verificador: "no-corrio",
      pendientes: 0,
      revisable: true,
      escribio: false,
      autorizadas: 0,
    });
    expect(entrega.entregable).toBe(true);
    expect(entrega.salvedad).toBe(SALVEDAD_SIN_ESCRITURAS);
  });

  it("cuántas autorizó AUSENTE no acusa a nadie: sin ese dato no se puede afirmar", () => {
    // Ausente es «no consta» —una tarea de antes de que esto existiera, o un ejecutor que no
    // lo informa—, y acusar con un dato que no se tiene es justo lo que este arreglo quita.
    const entrega = condicionesDeEntrega({
      verificador: "no-corrio",
      pendientes: 0,
      revisable: true,
      escribio: false,
    });
    expect(entrega.entregable).toBe(true);
    expect(entrega.salvedad).toBe(SALVEDAD_SIN_ESCRITURAS);
  });

  it("y con marca ausente tampoco: «no se sabe» qué cambió no es «no cambió nada»", () => {
    // Sin `escribio` no hay nada que contradiga a `autorizadas`, así que la condición no
    // aplica y el verificador se exige como siempre.
    const entrega = condicionesDeEntrega({ verificador: "verde", pendientes: 0, revisable: true, autorizadas: 3 });
    expect(entrega.entregable).toBe(true);
    expect(entrega.motivo).toBeUndefined();
  });

  it("un verificador que sí corrió y salió ROJO no se tapa con esto", () => {
    // No puede pasar por construcción (si escribió, `escribio` es cierto), pero si pasara,
    // la dirección tiene que ser la conservadora: la salvedad no es una amnistía.
    const medida: MedidaDeEntrega = { verificador: "rojo", pendientes: 0, revisable: true, escribio: true };
    expect(condicionesDeEntrega(medida).entregable).toBe(false);
  });
});

describe("medidaDeEntrega conserva lo que git supo, y solo eso", () => {
  it("`escribio` viaja cuando se sabe, y no se pone cuando no", () => {
    expect(medidaDeEntrega({ verificador: "verde", pendientes: 0 }, { revisable: true, escribio: false })).toEqual({
      verificador: "verde",
      pendientes: 0,
      revisable: true,
      escribio: false,
    });
    expect("escribio" in medidaDeEntrega({ verificador: "verde", pendientes: 0 }, { revisable: false })).toBe(false);
  });

  /** Un ejecutor mudo no informa del turno, pero de git sí se sabe lo que se sabe. */
  it("un turno que no informa conserva igual lo que dijo git", () => {
    expect(medidaDeEntrega(undefined, { revisable: true, escribio: false })).toMatchObject({
      verificador: "no-corrio",
      revisable: true,
      escribio: false,
    });
  });

  /**
   * La LISTA de lo que cambió, que es el hecho del que sale «no puedo comprobar si existe X»
   * en el juez. **Ausente y vacía no son lo mismo**: ausente es «no se pudo preguntar a git»
   * y `[]` es «git dice que no cambió nada» — la misma distinción que `escribio`, y aquí
   * colapsarla haría que un proyecto sin marca pareciera un proyecto intacto.
   */
  it("la lista de lo que cambió viaja, y ausente NO es vacía", () => {
    expect(
      medidaDeEntrega({ verificador: "verde", pendientes: 0 }, { revisable: true, escribio: true, cambiados: ["a.xne"] })
    ).toMatchObject({ cambiados: ["a.xne"] });
    // Vacía se conserva vacía: es una afirmación, no un hueco.
    const vacia = medidaDeEntrega({ verificador: "verde", pendientes: 0 }, { revisable: true, escribio: false, cambiados: [] });
    expect(vacia.cambiados).toEqual([]);
    // Y ausente no se rellena con nada.
    expect("cambiados" in medidaDeEntrega({ verificador: "verde", pendientes: 0 }, { revisable: false })).toBe(false);
  });

  it("cuántas escrituras autorizó el turno entra por su parámetro, y ausente sigue ausente", () => {
    expect(medidaDeEntrega({ verificador: "verde", pendientes: 0 }, { revisable: true }, 2)).toMatchObject({
      autorizadas: 2,
    });
    // Cero es un dato («corrió y no autorizó ninguna»), y se conserva.
    expect(medidaDeEntrega({ verificador: "verde", pendientes: 0 }, { revisable: true }, 0)).toMatchObject({
      autorizadas: 0,
    });
    expect("autorizadas" in medidaDeEntrega({ verificador: "verde", pendientes: 0 }, { revisable: true })).toBe(false);
  });
});
