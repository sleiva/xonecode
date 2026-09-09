import { describe, it, expect } from "vitest";
import { permisosDe, toolsDe, hitlDe, seDetieneEn, TOOLS_ESCRITURA } from "./perfiles.js";
import { sinArtefactosEnElProyecto } from "./proyecto.js";
import { AIMessage } from "@langchain/core/messages";
import { humanInTheLoopMiddleware } from "langchain";
import { AGENTES_DE_SERIE } from "./agentesEnDisco.js";

/* Las fixtures son los subagentes SEMBRADOS y ya no un `Record` a fuego: desde que los
   especialistas son ficheros (`core/agentes.ts`), ese `Record` no existe — y probar estas
   funciones contra una copia suya habría dejado de probar lo que corre de verdad. */
const PERFILES = Object.fromEntries(AGENTES_DE_SERIE.map((a) => [a.nombre, a]));

const TODOS = [...AGENTES_DE_SERIE];

describe("permisosDe", () => {
  /**
   * `archify` y `artifacts-builder` van SIEMPRE juntas, y esa es la regla — no «todos las
   * llevan».
   *
   * Se afirmaba lo segundo mientras los cuatro especialistas eran de desarrollo y dibujaban
   * diagramas. `probador` no dibuja ninguno: darle dos skills que no va a usar sería prompt
   * en TODAS sus llamadas, que es justo el coste que este repo mide antes de añadir una
   * línea. Lo que sí se rompe solo es tener una de las dos: el bloque `SKILLS_VISUALES` que
   * va en el cuerpo habla de las dos y manda usar `archify` antes que la otra, así que un
   * perfil con `artifacts-builder` a secas leería instrucciones sobre una tool que no tiene.
   */
  it("archify y artifacts-builder viajan juntas: ninguna sin la otra", () => {
    for (const perfil of TODOS) {
      expect(perfil.skills.includes("archify"), perfil.nombre).toBe(perfil.skills.includes("artifacts-builder"));
    }
  });

  it("los especialistas de DESARROLLO sí las llevan las dos", () => {
    for (const perfil of TODOS.filter((p) => ["docs", "planner", "dev", "mockup"].includes(p.nombre))) {
      expect(perfil.skills, perfil.nombre).toContain("archify");
      expect(perfil.skills, perfil.nombre).toContain("artifacts-builder");
    }
  });

  it("TODO perfil deniega .env y .git — incluido el que se añada mañana", () => {
    // El fallo que esto cierra: `SubAgent.permissions` REEMPLAZA las del padre. Un perfil
    // que declarase solo «no escribas» perdería la denegación de .env y podría leer las
    // claves del usuario.
    for (const perfil of TODOS) {
      const rutas = permisosDe(perfil).flatMap((p) => p.paths);
      expect(rutas, perfil.nombre).toContain("/.env");
      expect(rutas, perfil.nombre).toContain("/.git/**");
      expect(rutas, perfil.nombre).toContain("/.xonecode");
      expect(rutas, perfil.nombre).toContain("/.xonecode/**");
      expect(rutas, perfil.nombre).toContain("/skills/**");
      // Los ADJUNTOS de una tarea son documentos de la PERSONA que la creó: material de
      // entrada, no ficheros que reescribir. Misma denegación que las skills y por lo
      // mismo. Y es INCONDICIONAL a propósito: la carpeta solo se monta cuando la tarea
      // trae adjuntos, así que sin esta regla un `write_file` a `/adjuntos/x` con la
      // carpeta sin montar escribiría un fichero del PROYECTO (medido).
      expect(rutas, perfil.nombre).toContain("/adjuntos/**");
    }
  });

  it("la denegación de los adjuntos es de ESCRITURA, no de lectura: leerlos es su razón de ser", () => {
    // Si esto se colara como `["read","write"]` —copiando la fila de `/.env`— el agente no
    // podría abrir la captura que le adjuntaron, y el montaje de `/adjuntos/` se quedaría
    // siendo una carpeta que existe y no se puede mirar.
    for (const perfil of TODOS) {
      const deAdjuntos = permisosDe(perfil).filter((p) => p.paths.includes("/adjuntos/**"));
      expect(deAdjuntos.length, perfil.nombre).toBeGreaterThan(0);
      for (const regla of deAdjuntos) {
        expect(regla.operations, perfil.nombre).toContain("write");
        expect(regla.operations, perfil.nombre).not.toContain("read");
      }
    }
  });

  it("un perfil de solo lectura deniega TODA escritura", () => {
    const deniegos = permisosDe(PERFILES["docs"]!).filter((p) => p.mode === "deny");
    expect(deniegos.some((p) => p.operations.includes("write") && p.paths.includes("/**"))).toBe(true);
  });

  it("un perfil que escribe NO deniega toda escritura, pero sigue sin tocar .env", () => {
    const permisos = permisosDe(PERFILES["dev"]!);
    expect(permisos.some((p) => p.paths.includes("/**"))).toBe(false);
    expect(permisos.flatMap((p) => p.paths)).toContain("/.env");
  });
});

describe("toolsDe", () => {
  it("los de solo lectura no reciben ninguna tool de escritura", () => {
    for (const perfil of TODOS.filter((p) => p.soloLectura)) {
      for (const t of TOOLS_ESCRITURA) expect(toolsDe(perfil), perfil.nombre).not.toContain(t);
    }
  });

  it("los que desarrollan sí, y además conservan las de lectura", () => {
    expect(toolsDe(PERFILES["dev"]!)).toContain("write_file");
    expect(toolsDe(PERFILES["dev"]!)).toContain("read_file");
  });
});

describe("hitlDe", () => {
  it("TODA tool de escritura de TODO perfil está gateada", () => {
    // Si esto falla, la aprobación humana ha desaparecido en silencio.
    for (const perfil of TODOS) {
      const gateadas = Object.keys(hitlDe(perfil));
      for (const t of toolsDe(perfil).filter((x) => (TOOLS_ESCRITURA as readonly string[]).includes(x))) {
        expect(gateadas, `${perfil.nombre}/${t}`).toContain(t);
      }
    }
  });

  it("un perfil de solo lectura no tiene nada que aprobar", () => {
    expect(hitlDe(PERFILES["docs"]!)).toEqual({});
  });

  it("la descripción dice QUIÉN pide: el interrupt no lo trae", () => {
    // `dev` y `mockup` comparten `write_file`, así que sin esto el usuario no sabría
    // cuál de los dos le está pidiendo permiso.
    expect(hitlDe(PERFILES["dev"]!).write_file!.description).toContain("[dev]");
    expect(hitlDe(PERFILES["mockup"]!).write_file!.description).toContain("[mockup]");
  });

  it("no se ofrece `edit`: no hay interfaz para editar los argumentos", () => {
    expect(hitlDe(PERFILES["dev"]!).write_file!.allowedDecisions).toEqual(["approve", "reject"]);
  });
});

/**
 * El modal que solo podía acabar en rechazo.
 *
 * Medido en el navegador: pedir un artefacto en `/artifacts/` sacaba la ventana de
 * aprobación con el diff entero, y aprobarla no escribía nada —la guarda del backend lo
 * rechaza después—. Un modal cuyo único final posible es un rechazo enseña a aprobar sin
 * mirar, que es cómo se rompe la aprobación el día que importa.
 */
describe("seDetieneEn — a qué escrituras se para el turno a preguntar", () => {
  const peticion = (file_path: unknown) => ({ toolCall: { args: { file_path } } });

  it("no pregunta por lo que el backend va a rechazar", () => {
    expect(seDetieneEn(peticion("/artifacts/x.html"))).toBe(false);
    expect(seDetieneEn(peticion("/artifact/x.html"))).toBe(false);
  });

  it("sigue preguntando por CUALQUIER fichero del proyecto", () => {
    expect(seDetieneEn(peticion("/app.xml"))).toBe(true);
    expect(seDetieneEn(peticion("/src/Clientes.xne"))).toBe(true);
    // Parecidos que NO son la carpeta inventada: se pregunta, como siempre.
    expect(seDetieneEn(peticion("/src/artifacts.js"))).toBe(true);
    expect(seDetieneEn(peticion("/artifactsviejos/x.html"))).toBe(true);
  });

  it("ante la duda PREGUNTA: sin ruta, o con una que no es cadena", () => {
    expect(seDetieneEn(peticion(undefined))).toBe(true);
    expect(seDetieneEn(peticion(42))).toBe(true);
    expect(seDetieneEn({})).toBe(true);
    expect(seDetieneEn(null)).toBe(true);
  });

  it("y va PUESTO en las dos tools de escritura de quien escribe", () => {
    for (const tool of TOOLS_ESCRITURA) {
      expect(typeof hitlDe(PERFILES["dev"]!)[tool]!.when).toBe("function");
    }
  });

  /**
   * **El único fallo abierto posible por aquí, atado.**
   *
   * Saltarse la pregunta para NO escribir es correcto; saltársela para escribir sería una
   * escritura al proyecto que nadie aprobó. Las dos barreras usan la misma función sobre la
   * misma cadena, así que no pueden discrepar — y esto lo comprueba en vez de confiarlo:
   * para cada ruta, si no se pregunta, la guarda del backend TIENE que rechazarla.
   */
  it("no preguntar implica que el backend lo rechaza — nunca al revés", async () => {
    const escrituras: string[] = [];
    const guardado = sinArtefactosEnElProyecto({
      async write(ruta: string) { escrituras.push(ruta); return { ok: true }; },
    });
    const rutas = [
      "/artifacts/x.html", "/artifact/x.html", "/artifact.html", "/ARTIFACTS/x.html",
      "/artifacts/sub/x.html", "/app.xml", "/src/artifacts.js", "/artifactsviejos/x.html",
      "/artefactos/x.html", "/Clientes.xne",
    ];
    for (const ruta of rutas) {
      const sePregunta = seDetieneEn(peticion(ruta));
      const resultado = (await guardado.write(ruta)) as { error?: string };
      if (!sePregunta) {
        expect(resultado.error, `«${ruta}» no se pregunta y el backend NO la rechaza`).toBeDefined();
      }
    }
    // Y de propina: lo que sí se escribió es exactamente lo que el backend dejó pasar.
    expect(escrituras).toEqual([
      "/app.xml", "/src/artifacts.js", "/artifactsviejos/x.html", "/artefactos/x.html", "/Clientes.xne",
    ]);
  });
});

/**
 * La COSTURA con el middleware de HITL, que es lo único que prueba que el modal no sale.
 *
 * `seDetieneEn` se prueba arriba como función; esto prueba lo que de ella depende: que
 * `humanInTheLoopMiddleware` respeta el predicado y no llega a llamar a `interrupt()`. Es un
 * contrato de una dependencia —leído en `langchain/agents/middleware/hitl`, «a tool call is
 * interrupted only when it has a resolved config and its optional `when` predicate doesn't
 * opt it out»— y de él depende que la aprobación siga saliendo para TODO lo demás: el día que
 * el `when` deje de mirarse, este test cae en el lado que hay que vigilar.
 *
 * Fuera de un grafo, `interrupt()` lanza «Called interrupt() outside the context of a graph»:
 * esa excepción es justo la señal de que el modal habría salido.
 */
describe("la costura con el HITL: el modal sale para el proyecto y NO para /artifacts/", () => {
  const middleware = humanInTheLoopMiddleware({
    interruptOn: hitlDe({ nombre: "mockup", soloLectura: false }) as never,
  }) as unknown as { afterModel: { hook: (estado: unknown, runtime: unknown) => Promise<unknown> } };

  const conEscrituraDe = (file_path: string) => ({
    messages: [
      new AIMessage({
        content: "",
        tool_calls: [{ name: "write_file", args: { file_path, content: "x" }, id: "1" }],
      }),
    ],
  });

  /** ¿Llegó a pedir la aprobación? Fuera de un grafo, pedirla lanza. */
  const pidioAprobacion = async (file_path: string): Promise<boolean> => {
    try {
      await middleware.afterModel.hook(conEscrituraDe(file_path), { context: {} });
      return false;
    } catch (error) {
      expect(String((error as Error).message)).toContain("interrupt()");
      return true;
    }
  };

  it("un fichero del proyecto la pide, como siempre", async () => {
    expect(await pidioAprobacion("/app.xml")).toBe(true);
    expect(await pidioAprobacion("/src/Clientes.xne")).toBe(true);
  });

  it("una escritura a `/artifacts/` no la pide: ese modal solo podía acabar en rechazo", async () => {
    expect(await pidioAprobacion("/artifacts/modal.html")).toBe(false);
    expect(await pidioAprobacion("/artifact.html")).toBe(false);
  });
});
