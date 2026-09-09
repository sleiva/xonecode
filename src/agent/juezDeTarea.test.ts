import { describe, expect, it } from "vitest";
import {
  ErrorDelJuezDeTarea,
  PAPEL_DEL_JUEZ,
  TOPE_DE_RESUMEN,
  crearJuezDeTarea,
  invocarConModelos,
} from "./juezDeTarea.js";
import type { JuezDeTareaPort, Papel } from "../core/ports.js";

/** Una raíz cualquiera: `CasoDeJuez.raiz` existe para que el papel `afilado` se resuelva con
 *  el `config.json` del PROYECTO además del global, y aquí el `invocar` está doblado y no
 *  lee disco — así que el valor da igual y lo que importa es que el caso la lleve. */
const RAIZ = "/proyectos/AppDemo";

describe("el juez entra por PUERTO y usa el papel afilado", () => {
  it("`npm test` no habla con ningún modelo: el `invocar` es un doble en línea", async () => {
    const pedidos: Papel[] = [];
    const juez = crearJuezDeTarea({
      invocar: async (papel) => {
        pedidos.push(papel);
        return JSON.stringify({ veredicto: "verde", resumen: "hace lo que pide" });
      },
    });
    const v = await juez.juzgar({ encargo: "añade una colección Clientes", raiz: RAIZ, autorizadas: ["Clientes.xne"] });
    // `afilado` está RESERVADO al juez (`core/modelos.ts`): es el suyo y no otro.
    expect(pedidos).toEqual([PAPEL_DEL_JUEZ]);
    expect(PAPEL_DEL_JUEZ).toBe("afilado");
    expect(v).toEqual({ veredicto: "verde", resumen: "hace lo que pide" });
  });

  it("una respuesta que no se entiende NO es un verde", async () => {
    // Fail-closed por la misma razón que la aprobación: lo que no se entiende no se aprueba.
    const juez = crearJuezDeTarea({ invocar: async () => "no soy json" });
    const v = await juez.juzgar({ encargo: "x", raiz: RAIZ, autorizadas: [] });
    expect(v.veredicto).toBe("indeterminado");
    // Y lo dice, porque de aquí sale lo que se lee en la tarjeta.
    expect(v.resumen).not.toBe("");
  });

  it("un veredicto que no es ninguno de los dos tampoco es verde", async () => {
    const juez = crearJuezDeTarea({
      invocar: async () => JSON.stringify({ veredicto: "quizá", resumen: "pues no sé" }),
    });
    expect((await juez.juzgar({ encargo: "x", raiz: RAIZ, autorizadas: [] })).veredicto).toBe("indeterminado");
  });

  it("un verde sin resumen no es un verde: un veredicto que no se puede leer no vale", async () => {
    const juez = crearJuezDeTarea({ invocar: async () => JSON.stringify({ veredicto: "verde" }) });
    expect((await juez.juzgar({ encargo: "x", raiz: RAIZ, autorizadas: [] })).veredicto).toBe("indeterminado");
  });

  it("acepta la respuesta metida en una valla de código, que es como contestan de verdad", async () => {
    const juez = crearJuezDeTarea({
      invocar: async () =>
        "Aquí va:\n```json\n{\"veredicto\":\"rojo\",\"resumen\":\"falta el campo\",\"hallazgos\":[\"no hay NOMBRE\"]}\n```\n",
    });
    expect(await juez.juzgar({ encargo: "x", raiz: RAIZ, autorizadas: [] })).toEqual({
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
      raiz: RAIZ,
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
    await juez.juzgar({ encargo: "x", raiz: RAIZ, autorizadas: ["/Users/quien-sea/p/app.xne"] });
    // Las rutas se dan tal cual llegan (el corredor ya las guarda relativas), pero el
    // prompt no ABRE ninguna: no hay `readFile` en este módulo. Se comprueba lo contrario
    // de lo esperable: que no aparece nada que el juez no le haya dado.
    expect(prompt).not.toContain("<coll");
    expect(prompt).toContain("/Users/quien-sea/p/app.xne");
  });

  /**
   * EL CASO MEDIDO. Primera ejecución real del juez, con el modelo de verdad y un proyecto
   * del usuario: encargo «documenta las colecciones en DOCUMENTACION.md», el turno escribió
   * `DOCUMENTACION.md` (62 KB) y `MEMORIA_PROYECTO.md`, el verificador acabó en VERDE con
   * dos avisos `REF_JS_COLL_MISSING` —sin fichero, así que el reparto los deja del lado
   * conservador— y 22 hallazgos más en ficheros que el turno no tocó. El juez dictó ROJO con
   * dos hallazgos, los dos falsos:
   *  1. «Se modificaron ficheros de lógica JavaScript durante el turno según los hallazgos
   *     del verificador (REF_JS_COLL_MISSING)». Un hallazgo NO dice quién escribió nada.
   *  2. «No se puede comprobar la existencia ni el contenido de DOCUMENTACION.md con los
   *     datos facilitados», con `autorizadas` llevando ese fichero.
   *
   * Lo que se comprueba aquí es que el prompt ya no admite ninguna de las dos: no que
   * contenga frases nuevas, sino que cada dato que las sostenía esté dicho por lo que es.
   */
  const CASO_MEDIDO = {
    encargo: "documenta las colecciones en DOCUMENTACION.md",
    raiz: RAIZ,
    autorizadas: ["DOCUMENTACION.md", "MEMORIA_PROYECTO.md"],
    verificador: "verde" as const,
    hallazgos: [
      { code: "REF_JS_COLL_MISSING", severidad: "warning" as const, mensaje: "un script referencia una colección no encontrada" },
      { code: "REF_JS_COLL_MISSING", severidad: "warning" as const, mensaje: "un script referencia una colección no encontrada" },
    ],
    preexistentes: 22,
    cambiados: ["DOCUMENTACION.md", "MEMORIA_PROYECTO.md"],
  };

  /** Corre el juez y devuelve el prompt que se le mandó. */
  async function promptDe(caso: Parameters<JuezDeTareaPort["juzgar"]>[0]): Promise<string> {
    let prompt = "";
    const juez = crearJuezDeTarea({
      invocar: async (_papel, p) => {
        prompt = p;
        return JSON.stringify({ veredicto: "verde", resumen: "ok" });
      },
    });
    await juez.juzgar(caso);
    return prompt;
  }

  describe("el caso MEDIDO: verde, dos avisos sin fichero y 22 preexistentes", () => {
    it("los hallazgos se dicen OBSERVACIONES del proyecto, y que no atribuyen autoría", async () => {
      const prompt = await promptDe(CASO_MEDIDO);
      expect(prompt).toContain("no atribuyen autoría");
      expect(prompt).toContain("no dice quién escribió");
      /**
       * Y la frase que INVITABA la conclusión se fue. «Sus hallazgos sobre lo que este turno
       * tocó» era falsa justo para estos dos: el reparto (`agent/turnoReal.ts`) admite del
       * lado del turno los hallazgos SIN fichero, que es el lado conservador, así que la
       * cabecera afirmaba de un aviso sin fichero que era sobre un fichero tocado.
       */
      expect(prompt).not.toContain("sobre lo que este turno tocó");
    });

    it("un hallazgo SIN fichero se dice sin fichero, que es lo que lo hace inatribuible", async () => {
      const prompt = await promptDe(CASO_MEDIDO);
      const lineas = prompt.split("\n").filter((l) => l.includes("REF_JS_COLL_MISSING"));
      expect(lineas).toHaveLength(2);
      // Las DOS, no una: el marcador es por línea y no un párrafo suelto al final.
      for (const l of lineas) expect(l).toContain("el simulador no dijo en qué fichero");
    });

    it("los avisos llegan como AVISOS, distinguibles de los errores, y sin el enum en crudo", async () => {
      const prompt = await promptDe(CASO_MEDIDO);
      expect(prompt).toContain("AVISO");
      // La huella de reparación del verificador usa solo errores por esta razón: un aviso
      // que va y viene no dice nada. Aquí lo mismo: no se le esconde, se le etiqueta.
      expect(prompt).toContain("Avisos");
      expect(prompt).not.toContain("warning");
      // Y con el verificador en verde no hay errores que listar: el encabezado no aparece.
      expect(prompt).not.toContain("Errores");
    });

    it("con el verificador en VERDE se dice que no hay nada que reprochar", async () => {
      const prompt = await promptDe(CASO_MEDIDO);
      expect(prompt).toContain("no hay nada que reprochar");
    });

    it("los 22 de fuera se CUENTAN, diciendo que no son de este turno", async () => {
      const prompt = await promptDe(CASO_MEDIDO);
      expect(prompt).toMatch(/22 hallazgo\(s\) más[^\n]*no tocó/);
    });

    it("`autorizadas` se explica, y al lado va el HECHO de git fichero a fichero", async () => {
      const prompt = await promptDe(CASO_MEDIDO);
      expect(prompt).toContain("DOCUMENTACION.md");
      expect(prompt).toContain("MEMORIA_PROYECTO.md");
      // Lo que `autorizadas` es de verdad: el registro de las escrituras que la tarea aplicó
      // sin que nadie las aprobara. No se promete más (`core/tareas.ts#Tarea.autorizadas`:
      // es una PISTA, la verdad sobre el disco la tiene git).
      expect(prompt).toContain("escribió sin que ninguna persona las aprobara");
      // Y el HECHO, que es lo que quita de raíz el «no puedo comprobar si existe»: la lista
      // de lo que cambió según git, con su nombre y presentada como diff contra el «antes».
      expect(prompt).toContain("según git");
      expect(prompt).toContain("un HECHO sobre el disco");
      expect(prompt).toContain("no es una respuesta válida");
    });

    it("las dos listas no se confunden: una es intención y la otra es lo medido", async () => {
      const prompt = await promptDe(CASO_MEDIDO);
      const autorizadas = prompt.indexOf("LO QUE EL TURNO AUTORIZÓ ESCRIBIR");
      const git = prompt.indexOf("LO QUE CAMBIÓ EN EL PROYECTO");
      expect(autorizadas).toBeGreaterThan(-1);
      expect(git).toBeGreaterThan(autorizadas);
    });

    it("una ruta autorizada que git no ve cambiada se DICE, con su nombre", async () => {
      // Es el otro lado de la misma medida: `autorizadas` se apunta al autorizar, así que
      // una ruta que una guarda rechazó sale ahí y no en git. Callarlo dejaría al juez
      // creyendo que se escribió algo que no aterrizó.
      const prompt = await promptDe({
        ...CASO_MEDIDO,
        autorizadas: ["DOCUMENTACION.md", "artifacts/diagrama.html"],
        cambiados: ["DOCUMENTACION.md"],
      });
      expect(prompt).toContain("git no ve cambio en: artifacts/diagrama.html");
    });

    it("sigue diciendo que no se invente nada, y que sin contenido no se puede juzgar la CALIDAD", async () => {
      const prompt = await promptDe(CASO_MEDIDO);
      // Las dos cláusulas conviven y hay que separarlas: no tener el contenido es un DATO
      // de partida, no un hallazgo. Lo que no se puede juzgar es si lo escrito está bien,
      // nunca si se escribió.
      expect(prompt).toContain("no te inventes nada");
      expect(prompt).toContain("no es un hallazgo");
    });

    it("un aviso, o un defecto que ya estaba, NO son motivo de rojo — y lo dice", async () => {
      const prompt = await promptDe(CASO_MEDIDO);
      expect(prompt).toContain("Un aviso del verificador, o un defecto que ya estaba en el proyecto, no es motivo de «rojo»");
    });
  });

  it("en ROJO los errores y los avisos van en grupos distintos, y no hay párrafo de verde", async () => {
    const prompt = await promptDe({
      encargo: "crea la colección Clientes",
      raiz: RAIZ,
      autorizadas: ["Clientes.xne"],
      verificador: "rojo",
      hallazgos: [
        { code: "COLL_MISSING_PROGID", severidad: "error", mensaje: "falta progid", fichero: "Clientes.xne", linea: 4 },
        { code: "ATTR_UNKNOWN", severidad: "warning", mensaje: "atributo raro", fichero: "Clientes.xne", linea: 9 },
      ],
      preexistentes: 0,
      cambiados: ["Clientes.xne"],
    });
    const errores = prompt.indexOf("Errores");
    const avisos = prompt.indexOf("Avisos");
    expect(errores).toBeGreaterThan(-1);
    expect(avisos).toBeGreaterThan(errores);
    // Cada uno bajo el suyo: un error contado como aviso relajaría la única condición que
    // el código sí tumba (`core/entrega.ts#condicionesDeEntrega` cuenta ERRORES).
    expect(prompt.slice(errores, avisos)).toContain("COLL_MISSING_PROGID");
    expect(prompt.slice(errores, avisos)).not.toContain("ATTR_UNKNOWN");
    expect(prompt.slice(avisos)).toContain("ATTR_UNKNOWN");
    expect(prompt).not.toContain("no hay nada que reprochar");
    // Con cero preexistentes se dice cero y no se calla: «ninguno más» es un dato.
    expect(prompt).toContain("ningún otro");
  });

  it("sin marca de git no se afirma qué cambió: AUSENTE no es vacío", async () => {
    // `cambiados` ausente es «no se pudo preguntar a git» (`revisionConGit`: sin marca no se
    // afirma nada), y colapsarlo en «no cambió nada» sería inventar un hecho contra el
    // agente — la misma distinción que `escribio` guarda en `core/entrega.ts`.
    const prompt = await promptDe({ encargo: "x", raiz: RAIZ, autorizadas: ["a.xne"] });
    expect(prompt).not.toContain("LO QUE CAMBIÓ EN EL PROYECTO");
    expect(prompt).toMatch(/[Nn]o hay marca de git/);
  });

  it("una lista VACÍA de git es una afirmación: no cambió nada, y se dice", async () => {
    // Todas las escrituras se quedaron por el camino. El juez tiene que verlo — y además el
    // CÓDIGO ya no entrega en ese caso (`core/entrega.ts#condicionesDeEntrega`), así que
    // esto es para que su valoración no contradiga la medida.
    const prompt = await promptDe({ encargo: "x", raiz: RAIZ, autorizadas: ["a.xne"], cambiados: [] });
    expect(prompt).toContain("git dice que la sesión no cambió ningún fichero");
    expect(prompt).toContain("git no ve cambio en: a.xne");
  });

  it("un turno sin verificador se le DICE, en vez de callarlo", async () => {
    let prompt = "";
    const juez = crearJuezDeTarea({
      invocar: async (_papel, p) => {
        prompt = p;
        return JSON.stringify({ veredicto: "verde", resumen: "ok" });
      },
    });
    await juez.juzgar({ encargo: "x", raiz: RAIZ, autorizadas: [], verificador: "no-corrio" });
    expect(prompt).toContain("NO HA CORRIDO");
  });
});

describe("el texto del modelo se ACOTA antes de guardarse", () => {
  it("un resumen kilométrico se recorta, y los saltos de línea se van", async () => {
    const largo = `linea uno\nlinea dos ${"x".repeat(TOPE_DE_RESUMEN * 2)}`;
    const juez = crearJuezDeTarea({
      invocar: async () => JSON.stringify({ veredicto: "rojo", resumen: largo }),
    });
    const v = await juez.juzgar({ encargo: "x", raiz: RAIZ, autorizadas: [] });
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
    const v = await juez.juzgar({ encargo: "x", raiz: RAIZ, autorizadas: [] });
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
    await expect(juez.juzgar({ encargo: "x", raiz: RAIZ, autorizadas: [] })).rejects.toThrow(ErrorDelJuezDeTarea);
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
    await expect(invocar("afilado", "prompt", RAIZ)).rejects.toThrow(/NVIDIA_API_KEY/);
    await expect(invocar("afilado", "prompt", RAIZ)).rejects.toThrow(ErrorDelJuezDeTarea);
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
    await expect(invocar("afilado", "prompt", RAIZ)).rejects.toThrow(/AuthenticationError/);
    await expect(invocar("afilado", "prompt", RAIZ)).rejects.not.toThrow(/sk-abc/);
  });

  it("un modelo que no sabe invocar es fallo del entorno, no un veredicto", async () => {
    const invocar = invocarConModelos({
      paraPapel: () => ({ noSoyUnModelo: true }),
      paraModelo: () => undefined,
      descripcion: () => ({ rapido: "", trabajo: "", afilado: "" }),
    });
    await expect(invocar("afilado", "prompt", RAIZ)).rejects.toThrow(ErrorDelJuezDeTarea);
  });

  it("el texto de la respuesta sale del `content`, venga como cadena o por bloques", async () => {
    const conContenido = (content: unknown) =>
      invocarConModelos({
        paraPapel: () => ({ invoke: async () => ({ content }) }),
        paraModelo: () => undefined,
        descripcion: () => ({ rapido: "", trabajo: "", afilado: "" }),
      });
    expect(await conContenido("hola")("afilado", "p", RAIZ)).toBe("hola");
    // Gemini y Anthropic mandan bloques; el pensamiento NO es texto y no entra.
    expect(
      await conContenido([{ type: "thinking", thinking: "mmm" }, { type: "text", text: "hola" }])("afilado", "p", RAIZ)
    ).toBe("hola");
  });
});
