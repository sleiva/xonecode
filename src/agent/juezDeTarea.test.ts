import { describe, expect, it } from "vitest";
import {
  ErrorDelJuezDeTarea,
  PAPEL_DEL_JUEZ,
  TOPE_DE_RESUMEN,
  crearJuezDeTarea,
  invocarConModelos,
} from "./juezDeTarea.js";
import type { Papel } from "../core/ports.js";

describe("el juez entra por PUERTO y usa el papel afilado", () => {
  it("`npm test` no habla con ningún modelo: el `invocar` es un doble en línea", async () => {
    const pedidos: Papel[] = [];
    const juez = crearJuezDeTarea({
      invocar: async (papel) => {
        pedidos.push(papel);
        return JSON.stringify({ veredicto: "verde", resumen: "hace lo que pide" });
      },
    });
    const v = await juez.juzgar({ encargo: "añade una colección Clientes", autorizadas: ["Clientes.xne"] });
    // `afilado` está RESERVADO al juez (`core/modelos.ts`): es el suyo y no otro.
    expect(pedidos).toEqual([PAPEL_DEL_JUEZ]);
    expect(PAPEL_DEL_JUEZ).toBe("afilado");
    expect(v).toEqual({ veredicto: "verde", resumen: "hace lo que pide" });
  });

  it("una respuesta que no se entiende NO es un verde", async () => {
    // Fail-closed por la misma razón que la aprobación: lo que no se entiende no se aprueba.
    const juez = crearJuezDeTarea({ invocar: async () => "no soy json" });
    const v = await juez.juzgar({ encargo: "x", autorizadas: [] });
    expect(v.veredicto).toBe("indeterminado");
    // Y lo dice, porque de aquí sale lo que se lee en la tarjeta.
    expect(v.resumen).not.toBe("");
  });

  it("un veredicto que no es ninguno de los dos tampoco es verde", async () => {
    const juez = crearJuezDeTarea({
      invocar: async () => JSON.stringify({ veredicto: "quizá", resumen: "pues no sé" }),
    });
    expect((await juez.juzgar({ encargo: "x", autorizadas: [] })).veredicto).toBe("indeterminado");
  });

  it("un verde sin resumen no es un verde: un veredicto que no se puede leer no vale", async () => {
    const juez = crearJuezDeTarea({ invocar: async () => JSON.stringify({ veredicto: "verde" }) });
    expect((await juez.juzgar({ encargo: "x", autorizadas: [] })).veredicto).toBe("indeterminado");
  });

  it("acepta la respuesta metida en una valla de código, que es como contestan de verdad", async () => {
    const juez = crearJuezDeTarea({
      invocar: async () =>
        "Aquí va:\n```json\n{\"veredicto\":\"rojo\",\"resumen\":\"falta el campo\",\"hallazgos\":[\"no hay NOMBRE\"]}\n```\n",
    });
    expect(await juez.juzgar({ encargo: "x", autorizadas: [] })).toEqual({
      veredicto: "rojo",
      resumen: "falta el campo",
      hallazgos: ["no hay NOMBRE"],
    });
  });
});

describe("el prompt lleva los HECHOS y nunca contenido de ficheros", () => {
  it("lleva el encargo, los ficheros autorizados y el veredicto del verificador", async () => {
    let prompt = "";
    const juez = crearJuezDeTarea({
      invocar: async (_papel, p) => {
        prompt = p;
        return JSON.stringify({ veredicto: "verde", resumen: "ok" });
      },
    });
    await juez.juzgar({
      encargo: "añade una colección Clientes",
      autorizadas: ["Clientes.xne", "src/lista.js"],
      verificador: "verde",
      hallazgos: [{ code: "ATTR_UNKNOWN", severidad: "warning", mensaje: "atributo raro", fichero: "Clientes.xne", linea: 3 }],
    });
    expect(prompt).toContain("añade una colección Clientes");
    expect(prompt).toContain("Clientes.xne");
    expect(prompt).toContain("src/lista.js");
    expect(prompt).toContain("ATTR_UNKNOWN");
    // La línea es un dato del hallazgo, no una ruta de la máquina.
    expect(prompt).toContain(":3");
  });

  /**
   * El juez juzga si el trabajo hace lo que se pedía, y para eso no necesita ni un byte de
   * ningún fichero: el brief se lo da el encargo, y los hechos se los da el verificador.
   * Es la misma regla que gobierna los eventos de dominio.
   */
  it("lo que se le pasa son NOMBRES y hallazgos: por aquí no entra contenido", async () => {
    let prompt = "";
    const juez = crearJuezDeTarea({
      invocar: async (_papel, p) => {
        prompt = p;
        return JSON.stringify({ veredicto: "verde", resumen: "ok" });
      },
    });
    await juez.juzgar({ encargo: "x", autorizadas: ["/Users/quien-sea/p/app.xne"] });
    // Las rutas se dan tal cual llegan (el corredor ya las guarda relativas), pero el
    // prompt no ABRE ninguna: no hay `readFile` en este módulo. Se comprueba lo contrario
    // de lo esperable: que no aparece nada que el juez no le haya dado.
    expect(prompt).not.toContain("<coll");
    expect(prompt).toContain("/Users/quien-sea/p/app.xne");
  });

  it("un turno sin verificador se le DICE, en vez de callarlo", async () => {
    let prompt = "";
    const juez = crearJuezDeTarea({
      invocar: async (_papel, p) => {
        prompt = p;
        return JSON.stringify({ veredicto: "verde", resumen: "ok" });
      },
    });
    await juez.juzgar({ encargo: "x", autorizadas: [], verificador: "no-corrio" });
    expect(prompt).toContain("NO HA CORRIDO");
  });
});

describe("el texto del modelo se ACOTA antes de guardarse", () => {
  it("un resumen kilométrico se recorta, y los saltos de línea se van", async () => {
    const largo = `linea uno\nlinea dos ${"x".repeat(TOPE_DE_RESUMEN * 2)}`;
    const juez = crearJuezDeTarea({
      invocar: async () => JSON.stringify({ veredicto: "rojo", resumen: largo }),
    });
    const v = await juez.juzgar({ encargo: "x", autorizadas: [] });
    // Este texto acaba en el `motivo` de la tarea, que se pinta en el kanban y viaja por el
    // cable: un salto de línea ahí parte la tarjeta y un resumen de 4 KB la llena entera.
    expect(v.resumen.length).toBeLessThanOrEqual(TOPE_DE_RESUMEN);
    expect(v.resumen).not.toContain("\n");
  });

  it("los hallazgos se acotan en número, y lo que no es texto se descarta", async () => {
    const juez = crearJuezDeTarea({
      invocar: async () =>
        JSON.stringify({
          veredicto: "rojo",
          resumen: "mal",
          hallazgos: [...Array(50).keys()].map((i) => `hallazgo ${i}`).concat([{ raro: true } as never]),
        }),
    });
    const v = await juez.juzgar({ encargo: "x", autorizadas: [] });
    expect(v.hallazgos!.length).toBeLessThanOrEqual(10);
    for (const h of v.hallazgos!) expect(typeof h).toBe("string");
  });
});

describe("que el juez no se pueda usar es fallo del ENTORNO", () => {
  /**
   * Sin modelo, sin clave o sin red no hay veredicto — y eso no es un veredicto rojo ni
   * mucho menos un verde: es que no se pudo preguntar. Se LANZA para que quien lo llame
   * aparque la tarea diciéndolo, en vez de tratarlo como una opinión del juez.
   */
  it("un `invocar` que revienta se propaga como ErrorDelJuezDeTarea", async () => {
    const juez = crearJuezDeTarea({
      invocar: async () => {
        throw new Error("Anthropic API key not found");
      },
    });
    await expect(juez.juzgar({ encargo: "x", autorizadas: [] })).rejects.toThrow(ErrorDelJuezDeTarea);
  });

  /**
   * MEDIDO contra `agent/modelos.ts`: construir el modelo del papel sin credencial lanza
   * ANTES de tocar la red, con un mensaje escrito para leerse («falta la credencial para
   * nvidia (NVIDIA_API_KEY); usa /provider nvidia», o el «Anthropic API key not found» del
   * SDK). Ese mensaje SÍ se conserva: es la única línea que dice qué hacer.
   */
  it("el fallo al CONSTRUIR el modelo conserva su mensaje, que es el accionable", async () => {
    const invocar = invocarConModelos({
      paraPapel: () => {
        throw new Error("falta la credencial para nvidia (NVIDIA_API_KEY); usa /provider nvidia");
      },
      paraModelo: () => undefined,
      descripcion: () => ({ rapido: "", trabajo: "", afilado: "" }),
    });
    await expect(invocar("afilado", "prompt")).rejects.toThrow(/NVIDIA_API_KEY/);
    await expect(invocar("afilado", "prompt")).rejects.toThrow(ErrorDelJuezDeTarea);
  });

  /**
   * Y el fallo de la LLAMADA no conserva el mensaje, a propósito: los SDK devuelven el
   * cuerpo remoto y ahí van claves redactadas y cabeceras. Es la misma regla que
   * `ErrorCatalogoModelos`, que «nunca lleva la clave ni el cuerpo remoto».
   */
  it("el fallo de la LLAMADA se queda en el nombre del error, sin cuerpo remoto", async () => {
    const invocar = invocarConModelos({
      paraPapel: () => ({
        invoke: async () => {
          throw Object.assign(new Error("401 Incorrect API key provided: sk-abc...XYZ"), {
            name: "AuthenticationError",
          });
        },
      }),
      paraModelo: () => undefined,
      descripcion: () => ({ rapido: "", trabajo: "", afilado: "" }),
    });
    await expect(invocar("afilado", "prompt")).rejects.toThrow(/AuthenticationError/);
    await expect(invocar("afilado", "prompt")).rejects.not.toThrow(/sk-abc/);
  });

  it("un modelo que no sabe invocar es fallo del entorno, no un veredicto", async () => {
    const invocar = invocarConModelos({
      paraPapel: () => ({ noSoyUnModelo: true }),
      paraModelo: () => undefined,
      descripcion: () => ({ rapido: "", trabajo: "", afilado: "" }),
    });
    await expect(invocar("afilado", "prompt")).rejects.toThrow(ErrorDelJuezDeTarea);
  });

  it("el texto de la respuesta sale del `content`, venga como cadena o por bloques", async () => {
    const conContenido = (content: unknown) =>
      invocarConModelos({
        paraPapel: () => ({ invoke: async () => ({ content }) }),
        paraModelo: () => undefined,
        descripcion: () => ({ rapido: "", trabajo: "", afilado: "" }),
      });
    expect(await conContenido("hola")("afilado", "p")).toBe("hola");
    // Gemini y Anthropic mandan bloques; el pensamiento NO es texto y no entra.
    expect(
      await conContenido([{ type: "thinking", thinking: "mmm" }, { type: "text", text: "hola" }])("afilado", "p")
    ).toBe("hola");
  });
});
