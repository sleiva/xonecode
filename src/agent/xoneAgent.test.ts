import { describe, it, expect } from "vitest";
import { alContarDelTracker,
  DESCRIPCIONES_FICHEROS,
  OPCIONES_BUSQUEDA_FICHEROS,
  promptOrquestador,
  rutasDeSkills,
} from "./xoneAgent.js";
import { SkillsEnMemoria, type SkillsPort } from "../core/ports.js";
import { promptDeAgente, repartirSkills, type Agente } from "../core/agentes.js";
import { AGENTES_DE_SERIE } from "./agentesEnDisco.js";

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
    expect(promptOrquestador([deSerie("docs")])).toContain("docs");
    expect(promptOrquestador([deSerie("docs")])).not.toContain("mockup");
  });

  it("sin ningún especialista lo DICE, en vez de mandar delegar en nadie", () => {
    // Un orquestador sin tools al que se le pide delegar y no tiene en quién se pondría a
    // inventar la respuesta él mismo, que es lo peor que puede pasar aquí.
    expect(promptOrquestador([])).toMatch(/no hay ningún especialista/);
  });

  it("la regla del encadenado solo se escribe si existen los DOS de los que habla", () => {
    // Una instrucción sobre un especialista que no está no la puede seguir nadie: es el
    // mismo botón muerto que la interfaz lleva semanas quitando, pero en un prompt.
    expect(promptOrquestador([deSerie("planner")])).not.toMatch(/delega en `mockup`/);
  });

  it("dice que NO tiene herramientas y que solo delega", () => {
    // «NO tienes herramientas» era falso: tiene las seis de fichero, y hasta que se le
    // pusieron permisos podía escribir con ellas. Ahora son de solo lectura y la frase lo
    // dice — ver `xoneAgent.orquestador.test.ts`.
    expect(PROMPT_ORQUESTADOR).toMatch(/NO tienes herramientas para MODIFICAR nada/);
    expect(PROMPT_ORQUESTADOR).toMatch(/delegar/);
  });

  it("pide paralelismo explícito para las tareas independientes", () => {
    expect(PROMPT_ORQUESTADOR).toMatch(/EN EL MISMO mensaje/);
  });

  it("reserva los diagramas de la app para mockup y el análisis real para planner", () => {
    expect(PROMPT_ORQUESTADOR).toMatch(/diagramas o esquemas.*`mockup`/s);
    expect(PROMPT_ORQUESTADOR).toMatch(/PRIMERO el análisis a `planner`/s);
    expect(PROMPT_ORQUESTADOR).toContain("HANDOFF DE PLANNER");
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
    expect(promptDeAgente(deSerie("docs"), repartirSkills(deSerie("docs"), disponibles(conSkills)))).toContain("No modificas nada");
  });

  it("uno que escribe avisa de que sus cambios se aprueban", () => {
    expect(promptDeAgente(deSerie("dev"), repartirSkills(deSerie("dev"), disponibles(conSkills)))).toMatch(/aprobación humana/);
  });

  it("usa la fachada de memoria para tareas de proyecto sin exponer .xonecode", () => {
    const p = promptDeAgente(deSerie("dev"), repartirSkills(deSerie("dev"), disponibles(conSkills)));
    expect(p).toContain("/MEMORIA_PROYECTO.md");
    expect(p).not.toContain("/.xonecode/memoria.md");
  });

  it("lleva las reglas duras de XOne, no solo su papel", () => {
    const p = promptDeAgente(deSerie("dev"), repartirSkills(deSerie("dev"), disponibles(conSkills)));
    expect(p).toMatch(/no existen DOM/);
    expect(p).toMatch(/\.xne/);
    expect(p).toMatch(/bug mudo/);
  });

  it("dirige explícitamente los diagramas y esquemas a archify", () => {
    const p = promptDeAgente(deSerie("planner"), repartirSkills(deSerie("planner"), disponibles(conSkills)));
    expect(p).toMatch(/diagrama, esquema, arquitectura, flujo, secuencia, datos o estados/i);
    expect(p).toContain("`archify`");
    expect(p).toContain("usa solamente `archify`");
    expect(p).toContain("No cargues ni uses `artifacts-builder` como sustituto");
    // La carpeta de la sesión, no la raíz del proyecto: un diagrama escrito ahí acabaría
    // pasando por aprobación, entrando en git y subiendo a CloudStudio.
    expect(p).toContain("/artefactos/<nombre>.html");
    expect(p).not.toContain("/artifacts/");
    // Y lo que NO funciona donde se ve. Va en el prompt y no en la skill porque el modelo no
    // abre la skill: medido, lee `archify/SKILL.md` y `diagramas.md` y nada más. Sin esto, un
    // artefacto con interruptor de tema lanza `SecurityError` dentro del iframe y se lleva el
    // resto de su `<script>` — visto en vivo, con la página perfecta y el botón muerto.
    expect(p).toContain("sin `allow-same-origin`");
    expect(p).toContain("`localStorage`, `sessionStorage` e `indexedDB` LANZAN");
    expect(p).toContain("`matchMedia`");
  });

  it("describe en las tools de escritura el destino y la skill correctos", () => {
    expect(DESCRIPCIONES_FICHEROS.read_file).toContain("offset=0, limit=50");
    expect(DESCRIPCIONES_FICHEROS.write_file).toContain("`archify`");
    // La carpeta de la SESIÓN, no la del proyecto: esta descripción llega a todos los
    // agentes y era el último sitio que seguía mandando el HTML a la raíz.
    expect(DESCRIPCIONES_FICHEROS.write_file).toContain("/artefactos/<nombre>.html");
    expect(DESCRIPCIONES_FICHEROS.write_file).not.toContain("/artifacts/");
    expect(DESCRIPCIONES_FICHEROS.edit_file).toContain("/MEMORIA_PROYECTO.md");
  });

  it("da al planner un criterio explícito para cerrar un reconocimiento rápido", () => {
    const p = promptDeAgente(deSerie("planner"), repartirSkills(deSerie("planner"), disponibles(conSkills)));
    expect(p).toContain("RECONOCIMIENTO RÁPIDO DEL PROYECTO");
    expect(p).toContain("como máximo, tres ficheros representativos");
    expect(p).toContain("offset=0` y `limit=50");
    expect(p).toContain("deja de llamar tools y responde");
    expect(p).toContain("No repitas una lectura de la misma ruta y rango");
    expect(p).toContain("HANDOFF DE PLANNER");
    expect(p).toContain("aristas `origen → destino`");
  });

  it("hace que mockup reutilice el handoff del planner sin reinspeccionar el proyecto", () => {
    const p = promptDeAgente(deSerie("mockup"), repartirSkills(deSerie("mockup"), disponibles(conSkills)));
    expect(p).toContain("HANDOFF PARA DIAGRAMAS");
    expect(p).toContain("NO vuelvas a leer, buscar ni reconstruir");
    expect(p).toContain("solo si la tarea NO incluye un `HANDOFF DE PLANNER`");
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

  it("nombra las skills que SÍ tiene", () => {
    expect(promptDeAgente(deSerie("dev"), repartirSkills(deSerie("dev"), disponibles(conSkills)))).toContain("xone-development");
  });

  it("y AVISA de las que le faltan en vez de callarlo", () => {
    // Patrón 4: un doble nunca se disfraza. Un especialista sin su skill responde
    // de memoria, y sin este aviso nadie sabría por qué empeoró.
    const sin = new SkillsEnMemoria({});
    const p = promptDeAgente(deSerie("dev"), repartirSkills(deSerie("dev"), disponibles(sin)));
    expect(p).toMatch(/AVISO/);
    expect(p).toContain("xone-development");
  });

  it("sin skills que falten no mete ningún aviso de relleno", () => {
    expect(promptDeAgente(deSerie("docs"), repartirSkills(deSerie("docs"), disponibles(conSkills)))).not.toMatch(/AVISO/);
  });

  it("expone cada skill disponible como una ruta que carga Deep Agents", () => {
    expect(rutasDeSkills(deSerie("dev"), disponibles(conSkills))).toEqual([
      "/skills/xone-development/",
      "/skills/xone-debugging/",
      "/skills/archify/",
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
