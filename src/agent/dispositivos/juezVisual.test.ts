import { describe, expect, it } from "vitest";
import {
  ErrorDelJuezVisual,
  juzgarPantalla,
  invocarVisualConModelos,
  PROMPT_VISUAL,
  PROMPT_VISUAL_CON_REFERENCIA,
  TOPE_DE_OBSERVACIONES,
  TOPE_DE_PETICIONES,
  type InvocarVisual,
} from "./juezVisual.js";

const PANTALLA = { base64: "/9j/4AAQ", mime: "image/jpeg" };
const contesta = (texto: string): InvocarVisual => async () => texto;

describe("juzgarPantalla", () => {
  it("lee el veredicto y las observaciones", async () => {
    const v = await juzgarPantalla(
      PANTALLA,
      { pantalla: "Calculadora" },
      contesta('{"veredicto":"rojo","hallazgos":["el texto de los botones sale cortado"]}'),
    );

    expect(v.veredicto).toBe("rojo");
    expect(v.observaciones).toEqual(["el texto de los botones sale cortado"]);
  });

  /** Los modelos envuelven el JSON en una valla aunque se les pida crudo. Medido tres veces. */
  it("tolera la valla de código ```json", async () => {
    const v = await juzgarPantalla(
      PANTALLA,
      { pantalla: "Calculadora" },
      contesta('```json\n{"veredicto":"verde","hallazgos":[]}\n```'),
    );

    expect(v.veredicto).toBe("verde");
  });

  /**
   * Fail-closed, igual que el juez de tareas: lo que no se entiende NO es un verde. Y aquí
   * importa más todavía, porque este veredicto puede acabar frenando una entrega.
   */
  it("lo que no parsea es INDETERMINADO, nunca verde", async () => {
    for (const basura of ["", "no sé qué decirte", '{"veredicto":"quizá"}', "{roto"]) {
      const v = await juzgarPantalla(PANTALLA, { pantalla: "X" }, contesta(basura));
      expect(v.veredicto, `«${basura}» no puede ser verde`).toBe("indeterminado");
    }
  });

  /**
   * Un rojo sin nada que enseñar no se puede actuar: nadie sabe qué mirar. Es la misma regla
   * que «un verde sin resumen» del juez de tareas.
   */
  it("un ROJO sin observaciones es indeterminado", async () => {
    const v = await juzgarPantalla(PANTALLA, { pantalla: "X" }, contesta('{"veredicto":"rojo","hallazgos":[]}'));

    expect(v.veredicto).toBe("indeterminado");
  });

  /**
   * MEDIDO tres veces sobre la MISMA captura: 4, 2 y 4 observaciones, con redacción distinta.
   * No es una huella, y por eso esto se acota como se acota el resumen de un juez: para que
   * quepa en una tarjeta, no para compararlo.
   */
  it("acota cuántas observaciones y cuánto ocupa cada una", async () => {
    const muchas = Array.from({ length: 30 }, (_, i) => `observación ${i} ${"x".repeat(500)}`);
    const v = await juzgarPantalla(
      PANTALLA,
      { pantalla: "X" },
      contesta(JSON.stringify({ veredicto: "rojo", hallazgos: muchas })),
    );

    expect(v.observaciones).toHaveLength(TOPE_DE_OBSERVACIONES);
    for (const o of v.observaciones) expect(o.length).toBeLessThanOrEqual(200);
  });

  /**
   * El prompt pide lo que SE VE y no la causa. **Ojo con lo que este test NO afirma**: se midió
   * y la instrucción NO evita la falsa explicación — con ella puesta, las tres vueltas
   * siguieron diciendo «girado 180°» de un texto que está CORTADO. Se queda porque acota el
   * resto (nada de gustos ni de paleta), no porque funcione para esto. El remedio vive en
   * quien enseñe las observaciones, avisando de que la redacción no es fiable.
   */
  it("el prompt pide lo que SE VE y prohíbe diagnosticar la causa", () => {
    expect(PROMPT_VISUAL).toMatch(/no digas la causa|no expliques por qué|sin diagnosticar/i);
    expect(PROMPT_VISUAL).toMatch(/lo que se ve/i);
  });

  /** Y el tipo lo dice también: son OBSERVACIONES, no hallazgos con fichero y línea. */
  it("no se pudo preguntar es fallo del ENTORNO, no un veredicto", async () => {
    const invocar: InvocarVisual = async () => {
      throw new Error("sin red");
    };

    await expect(juzgarPantalla(PANTALLA, { pantalla: "X" }, invocar)).rejects.toThrow(ErrorDelJuezVisual);
  });

  /**
   * **Lo que le faltaba para ser útil: poder PEDIR.** Juzga la captura que le den, así que si
   * el conductor fotografió el login, dictamina sobre el login. Pedir por NOMBRE es lo que le
   * deja cerrar el bucle sin tocar el aparato — que es de lo que se trata: la shell la lleva
   * uno solo.
   */
  it("puede pedir otras pantallas, por nombre", async () => {
    const v = await juzgarPantalla(
      PANTALLA,
      { pantalla: "Calculadora" },
      contesta('{"veredicto":"rojo","hallazgos":["el texto sale cortado"],"necesito":["Productos","Clientes"]}'),
    );

    expect(v.necesito).toEqual(["Productos", "Clientes"]);
  });

  /**
   * **Un VERDE que pide más no es un verde.** Es la misma dirección que «un verificador que no
   * corrió no es verde» de `condicionesDeEntrega`: lo que deja pasar algo no puede decirse
   * sobre lo que no se ha visto.
   */
  it("un verde que aún pide pantallas es INDETERMINADO", async () => {
    const v = await juzgarPantalla(
      PANTALLA,
      { pantalla: "X" },
      contesta('{"veredicto":"verde","hallazgos":[],"necesito":["Calculadora"]}'),
    );

    expect(v.veredicto).toBe("indeterminado");
    // Pero lo que pide NO se tira: es lo que hay que ir a buscar.
    expect(v.necesito).toEqual(["Calculadora"]);
  });

  /**
   * Su salida no es estable —6 vueltas sobre la MISMA captura dieron 4, 2, 4, 5, 3 y 5
   * observaciones—, así que sin tope pediría pantallas indefinidamente.
   */
  it("acota cuántas pantallas puede pedir, y descarta la prosa", async () => {
    const v = await juzgarPantalla(
      PANTALLA,
      { pantalla: "X" },
      contesta(
        JSON.stringify({
          veredicto: "rojo",
          hallazgos: ["algo"],
          necesito: ["A", "B", "C", "D", "E", "F", " ", "mándame otra foto de la pantalla anterior por favor"],
        }),
      ),
    );

    expect(v.necesito.length).toBeLessThanOrEqual(TOPE_DE_PETICIONES);
    expect(v.necesito).not.toContain(" ");
    // Un nombre de colección, no una frase: lo que no lo parece se descarta.
    expect(v.necesito.some((n) => n.includes(" "))).toBe(false);
  });

  it("sin `necesito` la lista está vacía, no ausente", async () => {
    const v = await juzgarPantalla(PANTALLA, { pantalla: "X" }, contesta('{"veredicto":"verde","hallazgos":[]}'));

    expect(v.necesito).toEqual([]);
  });

  it("la imagen y la pantalla llegan al modelo", async () => {
    let vistos: unknown;
    const invocar: InvocarVisual = async (_papel, prompt, imagen) => {
      vistos = { prompt, imagen };
      return '{"veredicto":"verde","hallazgos":[]}';
    };

    await juzgarPantalla(PANTALLA, { pantalla: "Calculadora" }, invocar);

    expect(vistos).toMatchObject({ imagen: PANTALLA });
    expect((vistos as { prompt: string }).prompt).toContain("Calculadora");
  });
});


/**
 * **La maqueta, y por qué el prompt cambia con ella.** El modelo VE las imágenes de sobra —
 * medido: acertó que una captura era el login y no la pantalla pedida. Lo que decide qué ve
 * es qué se le pide describir, y `PROMPT_VISUAL` le prohíbe expresamente opinar de la paleta
 * y de los gustos, donde cae entera la fidelidad a un diseño.
 */
describe("el crítico con una maqueta delante", () => {
  const MAQUETA = { base64: "iVBORw0KGgo", mime: "image/png" };

  it("con referencia cambia el prompt, y sin ella no se toca nada", async () => {
    const vistos: string[] = [];
    const espia: InvocarVisual = async (_p, prompt) => {
      vistos.push(prompt);
      return '{"veredicto":"verde","hallazgos":[]}';
    };

    await juzgarPantalla(PANTALLA, { pantalla: "X" }, espia);
    expect(vistos[0]).toContain(PROMPT_VISUAL);

    await juzgarPantalla(PANTALLA, { pantalla: "X" }, espia, MAQUETA);
    expect(vistos[1]).toContain(PROMPT_VISUAL_CON_REFERENCIA);
    expect(vistos[1]).not.toContain(PROMPT_VISUAL);
  });

  /** La maqueta llega a quien juzga; sin ella, `undefined` y no un hueco raro. */
  it("pasa la referencia al invocador, y solo cuando la hay", async () => {
    const vistas: (typeof MAQUETA | undefined)[] = [];
    const espia: InvocarVisual = async (_p, _t, _i, referencia) => {
      vistas.push(referencia);
      return '{"veredicto":"verde","hallazgos":[]}';
    };

    await juzgarPantalla(PANTALLA, { pantalla: "X" }, espia);
    await juzgarPantalla(PANTALLA, { pantalla: "X" }, espia, MAQUETA);

    expect(vistas[0]).toBeUndefined();
    expect(vistas[1]).toEqual(MAQUETA);
  });

  /**
   * **El prompt NOMBRA qué comparar.** Una pregunta abierta («¿se parecen?») devuelve
   * impresiones; ésta tiene que devolver sitios. Y el color entra SOLO comparado contra la
   * maqueta, mientras que el gusto sigue fuera — sin referencia no se pueden distinguir, y
   * por eso allí se excluyen los dos.
   */
  it("el prompt con referencia pide forma, tamaños y colocación, y conserva lo medido", () => {
    for (const q of ["FORMA", "TAMAÑOS Y JERARQUÍA", "COLOR", "COLOCACIÓN"]) {
      expect(PROMPT_VISUAL_CON_REFERENCIA).toContain(q);
    }
    // Lo medido seis veces: acierta DÓNDE y falla en el PORQUÉ. Sigue vigente con maqueta.
    expect(PROMPT_VISUAL_CON_REFERENCIA).toMatch(/no la causa/);
    // El gusto sigue fuera.
    expect(PROMPT_VISUAL_CON_REFERENCIA).toMatch(/NO\s+opines de si la paleta/);
    // Y el mismo contrato de salida que sin ella: `objetoDe` lee lo mismo.
    expect(PROMPT_VISUAL_CON_REFERENCIA).toContain('"hallazgos"');
    expect(PROMPT_VISUAL_CON_REFERENCIA).toContain('"necesito"');
  });

  /**
   * **COSTURA contra el cliente real**: cada imagen va detrás de la línea que dice cuál es.
   * Con dos adjuntas, cuál es la maqueta y cuál el aparato dependería del orden en que el
   * proveedor las numere, y eso es una suposición, no un contrato. Si se invirtieran, el
   * crítico contaría las diferencias al revés y se leerían igual de bien.
   */
  it("manda DOS imágenes, en orden y cada una rotulada", async () => {
    let contenido: { type: string; text?: string; image_url?: { url: string } }[] = [];
    const modelos = {
      paraPapel: () => ({
        invoke: async (mensajes: { content: typeof contenido }[]) => {
          contenido = mensajes[0]!.content;
          return '{"veredicto":"verde","hallazgos":[]}';
        },
      }),
    };

    await invocarVisualConModelos(modelos)("afilado", "el prompt", PANTALLA, MAQUETA);

    const tipos = contenido.map((b) => b.type);
    expect(tipos).toEqual(["text", "text", "image_url", "text", "image_url"]);
    // La maqueta va PRIMERO y rotulada; la captura, DESPUÉS.
    expect(contenido[1]!.text).toMatch(/MAQUETA/);
    expect(contenido[2]!.image_url!.url).toContain(MAQUETA.base64);
    expect(contenido[3]!.text).toMatch(/CAPTURA/);
    expect(contenido[4]!.image_url!.url).toContain(PANTALLA.base64);
  });

  /** Sin maqueta, el mensaje es EXACTAMENTE el de antes: una sola imagen y sin rótulos. */
  it("sin referencia el mensaje no cambia", async () => {
    let contenido: { type: string }[] = [];
    const modelos = {
      paraPapel: () => ({
        invoke: async (mensajes: { content: typeof contenido }[]) => {
          contenido = mensajes[0]!.content;
          return '{"veredicto":"verde","hallazgos":[]}';
        },
      }),
    };

    await invocarVisualConModelos(modelos)("afilado", "el prompt", PANTALLA);

    expect(contenido.map((b) => b.type)).toEqual(["text", "image_url"]);
  });
});
