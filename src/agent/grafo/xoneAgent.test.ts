import { describe, it, expect } from "vitest";
import { alContarDelTracker,
  DESCRIPCIONES_FICHEROS,
  OPCIONES_BUSQUEDA_FICHEROS,
  promptOrquestador,
  rutasDeSkills,
} from "./xoneAgent.js";
import { SkillsEnMemoria, type SkillsPort } from "../../core/ports.js";
import { promptDeAgente, repartirSkills, type Agente } from "../../core/agentes.js";
import { AGENTES_DE_SERIE } from "../subagentes/agentesEnDisco.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ_SKILLS } from "./skills.js";

/** Los nombres del catálogo de un puerto de skills. */
const disponibles = (skills: SkillsPort): ReadonlySet<string> =>
  new Set(skills.catalogo().map((s) => s.nombre));

/** Uno de los cuatro sembrados, por nombre. */
const deSerie = (nombre: string): Agente => AGENTES_DE_SERIE.find((a) => a.nombre === nombre)!;

describe("promptOrquestador", () => {
  const CUATRO = AGENTES_DE_SERIE;
  const PROMPT_ORQUESTADOR = promptOrquestador(CUATRO);

  it("nombra a los especialistas que HAY, no a una lista escrita a mano", () => {
    // Era una constante que nombraba a los cuatro a pelo. Desde que son ficheros que el
    // usuario escribe y borra, eso se queda mintiendo el primer día.
    expect(promptOrquestador([deSerie("consultant-xone")])).toContain("consultant-xone");
    expect(promptOrquestador([deSerie("consultant-xone")])).not.toContain("designer-xone");
  });

  it("sin ningún especialista lo DICE, en vez de mandar delegar en nadie", () => {
    // Un orquestador sin tools al que se le pide delegar y no tiene en quién se pondría a
    // inventar la respuesta él mismo, que es lo peor que puede pasar aquí.
    expect(promptOrquestador([])).toMatch(/no hay ningún especialista/);
  });

  /**
   * «Crea una pantalla y pruébala» son DOS encargos. Sin esta regla se leía como uno solo al
   * desarrollador —que no tiene `execute`—, así que «probar» se quedaba en que lo dijera.
   */
  it("escribir y PROBAR EN UN APARATO se encadena, y con destino", () => {
    expect(PROMPT_ORQUESTADOR).toContain("device-controller");
    expect(PROMPT_ORQUESTADOR).toMatch(/PROBARLO en un móvil o emulador/);
    // Lo que distingue esta regla de un «pruébalo»: el conductor necesita saber A DÓNDE ir.
    expect(PROMPT_ORQUESTADOR).toMatch(/a qué pantalla o colección tiene que llegar/);
    // Y qué hacer con la captura: el crítico visual ve lo que nada estático ve, y puede PEDIR.
    expect(PROMPT_ORQUESTADOR).toContain("xone_critica_visual");
    expect(PROMPT_ORQUESTADOR).toMatch(/te pide otra pantalla/);
  });

  it("y esa regla tampoco se escribe si falta uno de los dos", () => {
    const soloUno = promptOrquestador([deSerie("developer-xone")]);

    expect(soloUno).not.toMatch(/PROBARLO en un móvil o emulador/);
  });

  it("la regla del encadenado solo se escribe si existen los DOS de los que habla", () => {
    // Una instrucción sobre un especialista que no está no la puede seguir nadie: es el
    // mismo botón muerto que la interfaz lleva semanas quitando, pero en un prompt.
    expect(promptOrquestador([deSerie("analyst-xone")])).not.toMatch(/delega en `designer-xone`/);
  });

  it("dice que no MODIFICA, y que sí lee y busca", () => {
    // «NO tienes herramientas» era falso: tiene las seis de fichero, y hasta que se le
    // pusieron permisos podía escribir con ellas. Ahora son de solo lectura y la frase lo
    // dice — ver `xoneAgent.orquestador.test.ts`.
    expect(PROMPT_ORQUESTADOR).toMatch(/NO tienes herramientas para MODIFICAR nada/);
    expect(PROMPT_ORQUESTADOR).toMatch(/LEER y BUSCAR/);
  });

  it("le dice CUÁNDO contestar él y cuándo delegar, en las dos direcciones", () => {
    // Decía «tu único trabajo es entender la petición y delegar», y eso costaba dinero
    // medido: la misma pregunta de estructura, 9.462 tokens contestada por él y 38.198
    // delegada, con la misma respuesta buena (`docs/bancos/2026-09-17-base.json`). Las DOS
    // direcciones, porque «puedes leer» a secas no le quitaba la orden de delegar siempre.
    expect(PROMPT_ORQUESTADOR).toMatch(/CONTÉSTALA TÚ/);
    expect(PROMPT_ORQUESTADOR).toMatch(/Delega cuando haya que ESCRIBIR/);
  });

  it("pide paralelismo explícito para las tareas independientes", () => {
    expect(PROMPT_ORQUESTADOR).toMatch(/EN EL MISMO mensaje/);
  });

  it("reserva los diagramas de la app para designer-xone y el análisis real para analyst-xone", () => {
    expect(PROMPT_ORQUESTADOR).toMatch(/diagramas o esquemas.*`designer-xone`/s);
    expect(PROMPT_ORQUESTADOR).toMatch(/PRIMERO el análisis a `analyst-xone`/s);
    expect(PROMPT_ORQUESTADOR).toContain("HANDOFF DE ANÁLISIS");
    expect(PROMPT_ORQUESTADOR).toMatch(/no comparten el transcript/i);
  });
});

describe("el prompt de un especialista sembrado", () => {
  const conSkills = new SkillsEnMemoria({
    "xone-development": "…",
    "xone-debugging": "…",
    "xone-spec-builder": "…",
    "xone-plan-builder": "…",
    archify: "…",
    "artifacts-builder": "…",
  });

  it("un especialista de solo lectura lo dice", () => {
    expect(promptDeAgente(deSerie("consultant-xone"), repartirSkills(deSerie("consultant-xone"), disponibles(conSkills)))).toContain("No modificas nada");
  });

  it("uno que escribe avisa de que sus cambios se aprueban", () => {
    expect(promptDeAgente(deSerie("developer-xone"), repartirSkills(deSerie("developer-xone"), disponibles(conSkills)))).toMatch(/aprobación humana/);
  });

  it("usa la fachada de memoria para tareas de proyecto sin exponer .xonecode", () => {
    const p = promptDeAgente(deSerie("developer-xone"), repartirSkills(deSerie("developer-xone"), disponibles(conSkills)));
    expect(p).toContain("/MEMORIA_PROYECTO.md");
    expect(p).not.toContain("/.xonecode/memoria.md");
  });

  it("lleva las reglas duras de XOne, no solo su papel", () => {
    const p = promptDeAgente(deSerie("developer-xone"), repartirSkills(deSerie("developer-xone"), disponibles(conSkills)));
    expect(p).toMatch(/no existen DOM/);
    expect(p).toMatch(/\.xne/);
    expect(p).toMatch(/bug mudo/);
  });

  it("la regla de los artefactos ya NO va en el prompt: va donde se lee de verdad", () => {
    /**
     * Iba en el prompt de CUATRO especialistas —~1.400 caracteres en cada una de sus
     * llamadas, hablaran o no de diagramas— y el inspector midió lo que eso significa: la
     * cabecera es el 87 % de una petición normal.
     *
     * Nació de una lección buena: un turno leyó `archify/SKILL.md` y una referencia, se saltó
     * `estilo.md` —donde estaba la regla— y escribió un artefacto con `localStorage` que se
     * mató solo. Pero la conclusión de eso no era «repítelo en todos los prompts», era
     * ponerlo en el fichero que SÍ se abre. Este test vigila las dos mitades: que salió del
     * prompt, y que está al principio del cuerpo de las dos skills.
     */
    const p = promptDeAgente(deSerie("analyst-xone"), repartirSkills(deSerie("analyst-xone"), disponibles(conSkills)));
    expect(p).not.toContain("`archify`");
    expect(p).not.toContain("allow-same-origin");
    expect(p).not.toContain("/artefactos/<nombre>.html");

    for (const skill of ["archify", "artifacts-builder"]) {
      const cuerpo = readFileSync(join(RAIZ_SKILLS, skill, "SKILL.md"), "utf8");
      // Sin el «sin» delante: el texto del fichero envuelve justo ahí, y un test que dependa
      // de dónde cae un salto de línea se rompe al reflowear un párrafo.
      expect(cuerpo).toContain("`allow-same-origin`");
      expect(cuerpo).toContain("`localStorage`, `sessionStorage` e `indexedDB` **LANZAN**");
      expect(cuerpo).toContain("`matchMedia`");
      expect(cuerpo).toContain("/artefactos/<nombre>.html");
      expect(cuerpo).not.toContain("/artifacts/");
    }
  });

  it("describe en las tools de escritura el destino y la skill correctos", () => {
    // `read_file` NO lleva descripción nuestra, a propósito: la suya REEMPLAZARÍA la de la
    // librería, que trae el aviso de no reinyectar la cabecera al editar —corrección, no
    // ahorro— y que cambió entre dos parches suyos. Cómo queremos que lea es política, y vive
    // en el prompt (`promptDeAgente`). Si alguien la reintroduce aquí, esto se pone rojo.
    expect("read_file" in DESCRIPCIONES_FICHEROS).toBe(false);
    expect(DESCRIPCIONES_FICHEROS.grep).toContain("ALREDEDOR de esa línea");
    expect(DESCRIPCIONES_FICHEROS.write_file).toContain("`archify`");
    // La carpeta de la SESIÓN, no la del proyecto: esta descripción llega a todos los
    // agentes y era el último sitio que seguía mandando el HTML a la raíz.
    expect(DESCRIPCIONES_FICHEROS.write_file).toContain("/artefactos/<nombre>.html");
    expect(DESCRIPCIONES_FICHEROS.write_file).not.toContain("/artifacts/");
    expect(DESCRIPCIONES_FICHEROS.edit_file).toContain("/MEMORIA_PROYECTO.md");
  });

  it("da al planner un criterio explícito para cerrar un reconocimiento rápido", () => {
    const p = promptDeAgente(deSerie("analyst-xone"), repartirSkills(deSerie("analyst-xone"), disponibles(conSkills)));
    expect(p).toContain("RECONOCIMIENTO RÁPIDO DEL PROYECTO");
    expect(p).toContain("como máximo, tres ficheros representativos");
    expect(p).toContain("offset=0` y `limit=50");
    expect(p).toContain("deja de llamar tools y responde");
    expect(p).toContain("No repitas una lectura de la misma ruta y rango");
    expect(p).toContain("HANDOFF DE ANÁLISIS");
    expect(p).toContain("aristas `origen → destino`");
  });

  it("hace que mockup reutilice el handoff del planner sin reinspeccionar el proyecto", () => {
    const p = promptDeAgente(deSerie("designer-xone"), repartirSkills(deSerie("designer-xone"), disponibles(conSkills)));
    expect(p).toContain("HANDOFF PARA DIAGRAMAS");
    expect(p).toContain("NO vuelvas a leer, buscar ni reconstruir");
    expect(p).toContain("solo si la tarea NO incluye un `HANDOFF DE ANÁLISIS`");
  });

  it("hace que grep localice antes de leer y conserva su presupuesto", () => {
    expect(DESCRIPCIONES_FICHEROS.grep).toContain("LITERAL");
    expect(DESCRIPCIONES_FICHEROS.grep).toContain("files_with_matches");
    expect(DESCRIPCIONES_FICHEROS.grep).toContain("max_count");
    expect(OPCIONES_BUSQUEDA_FICHEROS).toEqual({
      grepMaxCount: 100,
      toolTokenLimitBeforeEvict: 6_000,
    });
  });

  it("NO nombra las que sí tiene: de eso se encarga la librería, y mejor", () => {
    /**
     * `SkillsMiddleware` de deepagents ya añade al mensaje de sistema una sección con cada skill
     * que el agente tiene —su descripción, su ruta— y con su propia regla de progressive
     * disclosure: se leen CUANDO hacen falta. El subconjunto por agente también es suyo: se le
     * pasa en el campo `skills` del `SubAgent` (`rutasDeSkills`).
     *
     * La nuestra decía «Cárgalas antes de responder», o sea que duplicaba lo que ya estaba y
     * encima lo contradecía. Costaba dinero medido: el consultor cargaba sus TRES skills para
     * contestar cuántas colecciones tiene el proyecto, y su turno se fue a 406k.
     */
    const p = promptDeAgente(deSerie("developer-xone"), repartirSkills(deSerie("developer-xone"), disponibles(conSkills)));
    expect(p).not.toContain("Tus skills:");
    expect(p).not.toContain("Cárgalas");
  });

  it("y AVISA de las que le faltan en vez de callarlo", () => {
    // Patrón 4: un doble nunca se disfraza. Un especialista sin su skill responde
    // de memoria, y sin este aviso nadie sabría por qué empeoró.
    const sin = new SkillsEnMemoria({});
    const p = promptDeAgente(deSerie("developer-xone"), repartirSkills(deSerie("developer-xone"), disponibles(sin)));
    expect(p).toMatch(/AVISO/);
    // La que FALTA sí se nombra: eso la librería no lo sabe, porque para ella no existe.
    expect(p).toContain("xone-development");
  });

  it("sin skills que falten no mete ningún aviso de relleno", () => {
    expect(promptDeAgente(deSerie("consultant-xone"), repartirSkills(deSerie("consultant-xone"), disponibles(conSkills)))).not.toMatch(/AVISO/);
  });

  it("expone cada skill disponible como una ruta que carga Deep Agents", () => {
    expect(rutasDeSkills(deSerie("developer-xone"), disponibles(conSkills))).toEqual([
      "/skills/xone-development/",
      "/skills/xone-debugging/",
      // Sin `archify`: los diagramas son de `designer-xone`, y cada skill asignada mete su
      // descripción en el prompt de sistema EN CADA llamada (la suya son ~650 caracteres).
      // Conserva `artifacts-builder` porque sí escribe documentos e informes.
      "/skills/artifacts-builder/",
    ]);
  });
});

describe("el aviso de que el tracker ha contado", () => {
  /**
   * Existe porque uno de los dos avisos se cayó, y en verde: el callback nació llamando solo
   * al diagnóstico, así que el aviso de consumo tenía un ÚNICO disparador —el de un agente
   * externo— y una sesión normal subía sus tokens en silencio. Medido en la pantalla del
   * usuario: el contador de la web no apareció nunca. Dentro de `construirAgente`, que todos
   * sus tests doblan, no había dónde cazarlo.
   */
  it("avisa a los DOS: al diagnóstico y a quien lleva la cuenta de la sesión", () => {
    const vistos: string[] = [];
    const contar = alContarDelTracker(
      "trabajo",
      { modelo: (origen: string) => vistos.push(`diagnostico:${origen}`) } as never,
      () => vistos.push("consumo")
    );
    contar({ input: 10, output: 2, cache: 0, llamadas: 1, contexto: 10 });
    expect(vistos).toEqual(["diagnostico:trabajo", "consumo"]);
  });

  it("y funciona con cualquiera de los dos ausente", () => {
    // Los dos son opcionales: el diagnóstico solo existe con `--diagnostico`, y la cuenta de
    // sesión solo cuando quien montó la sesión la lleva.
    expect(() => alContarDelTracker("trabajo")({ input: 1, output: 1, cache: 0, llamadas: 1, contexto: 1 })).not.toThrow();
  });
});
