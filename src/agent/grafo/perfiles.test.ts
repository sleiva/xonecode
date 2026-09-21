import { describe, it, expect } from "vitest";
import { permisosDe, toolsDe, hitlDe, seDetieneEn, TOOLS_ESCRITURA, puedeEjecutar, montajeDeFicheros, puedeEscribirRuta } from "./perfiles.js";
import { sinArtefactosEnElProyecto } from "./proyecto.js";
import { esRutaDeArtefacto } from "../../core/artefactos.js";
import { esRutaDePlan } from "../../core/planes.js";
import { AIMessage } from "@langchain/core/messages";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ_SKILLS } from "./skills.js";
import { humanInTheLoopMiddleware } from "langchain";
import { AGENTES_DE_SERIE } from "../subagentes/agentesEnDisco.js";

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
   * diagramas. `device-controller` no dibuja ninguno: darle dos skills que no va a usar sería prompt
   * en TODAS sus llamadas, que es justo el coste que este repo mide antes de añadir una
   * línea. Lo que sí se rompe solo es tener una de las dos: el bloque `SKILLS_VISUALES` que
   * va en el cuerpo habla de las dos y manda usar `archify` antes que la otra, así que un
   * perfil con `artifacts-builder` a secas leería instrucciones sobre una tool que no tiene.
   */
  it("ninguna de las dos skills visuales NOMBRA a la otra, así que se pueden repartir sueltas", () => {
    /**
     * Antes tenían que ir juntas, y el motivo era nuestro: el bloque `SKILLS_VISUALES` del
     * prompt hablaba de las dos y mandaba usar `archify` primero, así que un perfil con
     * `artifacts-builder` a secas leía instrucciones sobre una tool que no tenía.
     *
     * Ese bloque ya no existe —se fue al cuerpo de cada skill, que es donde se lee—, y con él
     * se va la atadura: `developer-xone` lleva `artifacts-builder` para escribir documentos y
     * NO `archify`, porque los diagramas son de `designer-xone`. Cada skill que se asigna mete
     * su descripción en el prompt de sistema en CADA llamada, y la de `archify` son ~650
     * caracteres.
     *
     * Lo que sí hay que sostener es esto: si un fichero nombrara a la otra, volveríamos al
     * mismo fallo — «no menciones jamás una skill que no tienes».
     */
    for (const [skill, otra] of [
      ["archify", "artifacts-builder"],
      ["artifacts-builder", "archify"],
    ]) {
      const cuerpo = readFileSync(join(RAIZ_SKILLS, skill, "SKILL.md"), "utf8");
      // La CABECERA es la que da las órdenes, y es la que no puede nombrar a la otra. Más
      // abajo sí puede aparecer, pero condicionada («si tienes…»): lo que no vale es mandar
      // usar algo que quizá no está.
      const cabecera = cuerpo.slice(cuerpo.indexOf("## Antes de escribir nada"), cuerpo.indexOf("\n## ", cuerpo.indexOf("## Antes de escribir nada") + 5));
      expect(cabecera.length, skill).toBeGreaterThan(200);
      expect(cabecera, skill).not.toContain(`\`${otra}\``);
      // El resto del fichero SÍ puede nombrarla: su cuerpo se ramifica por qué tools existen
      // en cada harness («si tienes `renderizar_diagrama`…», y una rama es «si no tienes
      // ninguna de las dos (xonecode)»). Lo que no puede es dar la orden desde arriba.
    }
  });

  it("el reparto de las visuales es el DECIDIDO, y cada una cuesta en cada llamada", () => {
    const de = (nombre: string) => TODOS.find((p) => p.nombre === nombre)!.skills;
    expect(de("designer-xone")).toEqual(expect.arrayContaining(["archify", "artifacts-builder"]));
    // Dibuja: puede necesitar diagramas anclados al código real.
    expect(de("analyst-xone")).toContain("archify");
    // Escribe documentos e informes, pero los diagramas los hace `designer-xone`.
    expect(de("developer-xone")).toContain("artifacts-builder");
    expect(de("developer-xone")).not.toContain("archify");
    // Contesta preguntas de la plataforma: ni dibuja ni escribe informes.
    expect(de("consultant-xone")).not.toContain("archify");
    expect(de("consultant-xone")).not.toContain("artifacts-builder");
    // Y el probador no dibuja nada, que es de donde salió toda esta regla.
    expect(de("device-controller")).not.toContain("archify");
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
    const deniegos = permisosDe(PERFILES["consultant-xone"]!).filter((p) => p.mode === "deny");
    expect(deniegos.some((p) => p.operations.includes("write") && p.paths.includes("/**"))).toBe(true);
  });

  it("un perfil que escribe NO deniega toda escritura, pero sigue sin tocar .env", () => {
    const permisos = permisosDe(PERFILES["developer-xone"]!);
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
    expect(toolsDe(PERFILES["developer-xone"]!)).toContain("write_file");
    expect(toolsDe(PERFILES["developer-xone"]!)).toContain("read_file");
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
    expect(hitlDe(PERFILES["consultant-xone"]!)).toEqual({});
  });

  it("la descripción dice QUIÉN pide: el interrupt no lo trae", () => {
    // `developer-xone` y `designer-xone` comparten `write_file`, así que sin esto el usuario no sabría
    // cuál de los dos le está pidiendo permiso.
    expect(hitlDe(PERFILES["developer-xone"]!).write_file!.description).toContain("[developer-xone]");
    expect(hitlDe(PERFILES["designer-xone"]!).write_file!.description).toContain("[designer-xone]");
  });

  it("no se ofrece `edit`: no hay interfaz para editar los argumentos", () => {
    expect(hitlDe(PERFILES["developer-xone"]!).write_file!.allowedDecisions).toEqual(["approve", "reject"]);
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

  /**
   * **Ni por lo que NO ES EL PROYECTO, y eso quita una incoherencia, no una barrera.**
   *
   * Un perfil de SOLO LECTURA ya escribe esas dos rutas sin aprobación ninguna —`hitlDe` le
   * devuelve `{}` y sus `permissions` lo confinan exactamente ahí—, así que la misma ruta no
   * se aprobaba para el analista y sí para el desarrollador. Medido lo que costaba: el
   * desarrollador fue a marcar hecha una tarea del plan, salió un modal, se rechazó, y el plan
   * se quedó viejo en silencio. En una tarea de fondo no hay quien pulse.
   */
  it("ni por lo que no es el proyecto: artefactos y planes", () => {
    expect(seDetieneEn(peticion("/artefactos/informe.html"))).toBe(false);
    expect(seDetieneEn(peticion("/planes/acerca-de/TASKS.md"))).toBe(false);
    expect(seDetieneEn(peticion("/planes/acerca-de/adr/0001-x.md"))).toBe(false);
  });

  /** Y lo que solo se PARECE a esas rutas sigue preguntando: son listas blancas de forma. */
  it("pero un parecido no cuela", () => {
    expect(seDetieneEn(peticion("/planes.md"))).toBe(true);
    expect(seDetieneEn(peticion("/planes/PLAN.md"))).toBe(true);
    expect(seDetieneEn(peticion("/planes/Acerca-De/TASKS.md"))).toBe(true);
    expect(seDetieneEn(peticion("/artefactosviejos/x.html"))).toBe(true);
  });

  /**
   * **La mitad que no se toca, y es la que importa**: por un fichero del PROYECTO siempre se
   * pregunta. Esto se comprueba contra los `.xne`, `.js` y `.css` de verdad del esqueleto, no
   * contra una lista inventada: si alguien ensancha la excepción de arriba, aquí se cae.
   */
  it("por un fichero del proyecto SIEMPRE se pregunta", () => {
    for (const ruta of [
      "/app.xml", "/Calculadora.xne", "/calculadora.js", "/Calculadora.css",
      "/doc/README.md", "/bd/gestion.db", "/MEMORIA_PROYECTO.md", "/.env",
    ]) {
      expect(seDetieneEn(peticion(ruta)), ruta).toBe(true);
    }
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
      expect(typeof hitlDe(PERFILES["developer-xone"]!)[tool]!.when).toBe("function");
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
  it("no preguntar implica que el backend lo rechaza O que no es del proyecto", async () => {
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
        const fuera = esRutaDeArtefacto(ruta) || esRutaDePlan(ruta);
        expect(
          resultado.error !== undefined || fuera,
          `«${ruta}» no se pregunta, el backend NO la rechaza y ES del proyecto`
        ).toBe(true);
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
    interruptOn: hitlDe({ nombre: "designer-xone", soloLectura: false }) as never,
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

describe("puedeEjecutar / montajeDeFicheros", () => {
  const base = { nombre: "x", soloLectura: true };

  it("sin declararlo, no ejecuta", () => {
    expect(puedeEjecutar(base)).toBe(false);
  });

  it("declarado y con motor propio, ejecuta", () => {
    expect(puedeEjecutar({ ...base, ejecucion: true })).toBe(true);
    expect(puedeEjecutar({ ...base, ejecucion: true, motor: "modelo" })).toBe(true);
  });

  it("con un motor EXTERNO no ejecuta, aunque el `.md` lo pida", () => {
    for (const motor of ["claude-code", "codex", "opencode"]) {
      expect(puedeEjecutar({ ...base, ejecucion: true, motor })).toBe(false);
    }
  });

  it("quien NO ejecuta se lleva el backend normal y sus permisos", () => {
    const m = montajeDeFicheros(base, { normal: "normal", conShell: "shell" });
    expect(m.backend).toBe("normal");
    expect(m.permissions).toEqual(permisosDe(base));
    expect(m.tools).toBeUndefined();
  });

  it("quien ejecuta se lleva la shell y NINGÚN `permissions` — la librería lo prohíbe", () => {
    const m = montajeDeFicheros({ ...base, ejecucion: true }, { normal: "normal", conShell: "shell" });
    expect(m.backend).toBe("shell");
    expect(m.permissions).toBeUndefined();
    expect(m.tools).toEqual(["read_file", "ls", "glob", "grep", "execute"]);
  });

  it("sin backend con shell se cae al normal CON permisos, nunca a una shell que no hay", () => {
    const m = montajeDeFicheros({ ...base, ejecucion: true }, { normal: "normal" });
    expect(m.backend).toBe("normal");
    expect(m.permissions).toEqual(permisosDe(base));
  });
});

describe("un productor de SOLO LECTURA puede dejar artefactos", () => {
  /**
   * **La medida que el comentario de `permisosDe` pedía desde hace tiempo, hecha contra la
   * librería**: `decidePathAccess` es *first-match-wins* con default permisivo
   * (`deepagents/dist`, y su propio docstring lo dice). O sea que un `allow` DELANTE del
   * `deny /**` no es decorativo: gana.
   *
   * Y eso desbloquea el caso que el comentario nombraba: un agente que solo LEE el proyecto
   * pero tiene que dejar algo escrito —un análisis, un plan, un informe—. `/artefactos/` es el
   * sitio: no es del proyecto, no entra en git, no sube a CloudStudio, no pasa por aprobación
   * y se ANUNCIA con su evento.
   */
  const reglas = (soloLectura: boolean) => permisosDe({ nombre: "x", soloLectura });

  it("el allow de /artefactos/ va DELANTE del deny general, o no sirve de nada", () => {
    const r = permisosDe({ nombre: "x", soloLectura: true });
    const allow = r.findIndex((x) => x.mode === "allow" && x.paths.some((p) => p.includes("artefactos")));
    const denyTodo = r.findIndex((x) => x.mode === "deny" && x.paths.includes("/**"));

    expect(allow).toBeGreaterThanOrEqual(0);
    expect(denyTodo).toBeGreaterThanOrEqual(0);
    expect(allow).toBeLessThan(denyTodo);
  });

  /**
   * Y DETRÁS de las denegaciones duras, que con first-match-wins es lo que las mantiene
   * ganando. Un `allow` delante de ellas abriría `/.env` el día que alguien escriba un patrón
   * más ancho.
   */
  it("pero DETRÁS de /.env, /.git y /.xonecode, que siguen ganando", () => {
    const r = permisosDe({ nombre: "x", soloLectura: true });
    const allow = r.findIndex((x) => x.mode === "allow" && x.paths.some((p) => p.includes("artefactos")));
    const duras = r.findIndex((x) => x.paths.some((p) => p === "/.env"));

    expect(duras).toBeGreaterThanOrEqual(0);
    expect(duras).toBeLessThan(allow);
  });

  it("y quien NO es de solo lectura no necesita la excepción: ya puede", () => {
    expect(reglas(false).some((x) => x.mode === "allow")).toBe(false);
  });
});

/**
 * `escribeEn` ACOTA aunque el agente no sea de solo lectura.
 *
 * Nace del documentador: `soloLectura` decide los permisos Y el modelo (`rapido` para
 * quien solo lee), así que marcarlo para confinarlo le daba el modelo barato justo a quien
 * más necesita el bueno — la misma trampa que el repo ya tiene escrita para `ejecucion`.
 * Esto separa las dos peticiones: buen modelo y, aun así, confinado.
 */
describe("escribeEn acota sin depender de soloLectura", () => {
  const escritor = { nombre: "document-writer", soloLectura: false, escribeEn: ["/doc/"] };

  it("puede escribir en su carpeta", () => {
    expect(puedeEscribirRuta(escritor, "/doc/manual.md")).toBe(true);
    expect(puedeEscribirRuta(escritor, "/doc/img/login.png")).toBe(true);
  });

  it("y NO en el resto del proyecto, aunque no sea de solo lectura", () => {
    expect(puedeEscribirRuta(escritor, "/Menu.xne")).toBe(false);
    expect(puedeEscribirRuta(escritor, "/funciones.js")).toBe(false);
  });

  /** Por SEGMENTO: conceder `/doc` no puede abrir `/documentos`. */
  it("no abre una carpeta que solo empieza igual", () => {
    expect(puedeEscribirRuta(escritor, "/documentos/x.md")).toBe(false);
  });

  it("lo denegado a todo el mundo sigue denegado", () => {
    expect(puedeEscribirRuta({ ...escritor, escribeEn: ["/"] }, "/.env")).toBe(false);
    expect(puedeEscribirRuta({ ...escritor, escribeEn: ["/"] }, "/.git/config")).toBe(false);
  });

  it("quien no declara nada y no es de solo lectura escribe donde quiera: no cambia nada", () => {
    const dev = { nombre: "developer-xone", soloLectura: false };
    expect(puedeEscribirRuta(dev, "/Menu.xne")).toBe(true);
  });

  /** Y la otra mitad, la que de verdad se arregló: el MODELO que le toca. */
  it("y al no ser soloLectura le toca el papel de trabajo, no el rápido", () => {
    // La regla vive en `xoneAgent.ts` (`perfil.soloLectura ? "rapido" : "trabajo"`), y lo
    // que se fija aquí es el dato del que depende: el documentador NO es soloLectura.
    const writer = AGENTES_DE_SERIE.find((a) => a.nombre === "document-writer");
    expect(writer?.soloLectura).toBe(false);
    expect(writer?.escribeEn).toEqual(["/doc/"]);
  });
});
