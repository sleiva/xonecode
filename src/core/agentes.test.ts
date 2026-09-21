import { describe, it, expect } from "vitest";
import {
  escribirAgente,
  fusionarAgentes,
  leerAgente,
  MAPA_DEL_PROYECTO,
  motivoDeNombreInaceptable,
  nombreSugerido,
  promptDeAgente,
  REGLAS_XONE,
  type Agente,
} from "./agentes.js";
import { generarEsqueleto } from "./esqueleto.js";

const FICHERO = [
  "---",
  "descripcion: Revisa un .xne y lista los problemas.",
  "motor: modelo",
  "soloLectura: true",
  "skills: [xone-development, archify]",
  "---",
  "Empieza siempre por leer app.xml.",
].join("\n");

function agente(extra: Partial<Agente> = {}): Agente {
  return {
    nombre: "revisor",
    descripcion: "Revisa cosas.",
    motor: "modelo",
    soloLectura: true,
    skills: [],
    instrucciones: "",
    origen: "proyecto",
    ...extra,
  };
}

describe("las skills en el prompt", () => {
  const conSkills = (suyas: string[], faltan: string[] = []) =>
    promptDeAgente(
      { nombre: "x", descripcion: "d", motor: "modelo", soloLectura: true, instrucciones: "", skills: suyas, origen: "global" },
      { suyas, faltan }
    );

  it("las que TIENE no se nombran: ya lo hace deepagents, y decíamos lo contrario", () => {
    /**
     * `SkillsMiddleware` añade una sección «## Skills System» con cada skill, su ruta y su regla
     * de progressive disclosure («you only read the full instructions when needed»). La nuestra
     * decía «Cárgalas antes de responder», o sea que contradecía a la librería — y costaba
     * dinero medido: el consultor cargaba sus TRES skills para contestar cuántas colecciones
     * tiene el proyecto.
     */
    const prompt = conSkills(["archify", "xone-development"]);
    expect(prompt).not.toContain("Cárgalas");
    expect(prompt).not.toContain("Tus skills:");
  });

  it("pero las que FALTAN sí, porque eso la librería no lo sabe", () => {
    // Sin este aviso el agente intenta cargar algo que no existe y no entiende por qué falla.
    expect(conSkills(["archify"], ["inventada"])).toContain("te faltan estas skills");
  });
});

describe("el mapa del proyecto", () => {
  it("dice dónde mirar, y lo que dice es CIERTO contra el esqueleto de verdad", () => {
    // Un mapa inventado sería el bug mudo que este producto existe para evitar, así que se
    // comprueba contra los ficheros que genera `crearProyecto`, no contra el recuerdo.
    const esqueleto = new Map(
      generarEsqueleto({ nombre: "X", titulo: "X", orientacion: "portrait", login: true }).map((f) => [f.ruta, f.contenido])
    );
    expect(MAPA_DEL_PROYECTO).toContain("<entry-point>");
    expect(esqueleto.get("app.xml")).toContain("<entry-point>");
    expect(MAPA_DEL_PROYECTO).toContain("<login-coll>");
    expect(esqueleto.get("app.xml")).toContain("<login-coll>");
    expect(MAPA_DEL_PROYECTO).toContain("`app.ini`");
    expect(esqueleto.has("app.ini")).toBe(true);
    expect(MAPA_DEL_PROYECTO).toContain("mappings.xne");
    expect(esqueleto.get("mappings.xne")).toContain("<coll ");
  });

  it("va en el prompt de un especialista, detrás de las reglas", () => {
    const prompt = promptDeAgente({
      nombre: "x",
      descripcion: "d",
      motor: "modelo",
      soloLectura: true,
      instrucciones: "",
      skills: [],
      origen: "global",
    });
    expect(prompt.indexOf(REGLAS_XONE)).toBeLessThan(prompt.indexOf(MAPA_DEL_PROYECTO));
  });
});

describe("leerAgente", () => {
  it("lee el frontmatter y deja el cuerpo como instrucciones", () => {
    const r = leerAgente("revisor", FICHERO, "proyecto");
    expect(r).toMatchObject({
      agente: {
        nombre: "revisor",
        motor: "modelo",
        soloLectura: true,
        skills: ["xone-development", "archify"],
        instrucciones: "Empieza siempre por leer app.xml.",
      },
    });
  });

  it("el nombre sale del FICHERO, no del frontmatter", () => {
    // La unicidad la garantiza el sistema de ficheros en vez de una comprobación nuestra
    // que hay que acordarse de hacer, y renombrar el agente es renombrar el fichero — sin
    // dos sitios que puedan discrepar sobre cómo se llama. Un `nombre:` en el frontmatter
    // es un campo más que se ignora, no una segunda fuente de verdad.
    const con = FICHERO.replace("motor: modelo", "motor: modelo\nnombre: otro");
    const r = leerAgente("revisor", con, "proyecto");
    expect("agente" in r && r.agente.nombre).toBe("revisor");
  });

  it("sin descripción NO se carga, y no se le inventa una", () => {
    // Es lo que el orquestador lee para decidir cuándo delegar: sin ella, el agente o no se
    // usaría nunca o se usaría para todo. Las dos cosas son peores que no tenerlo.
    const r = leerAgente("x", "---\nmotor: modelo\n---\ncuerpo", "proyecto");
    expect("error" in r && r.error).toMatch(/descripcion/);
  });

  it("un motor que no existe se dice, con la lista de los que hay", () => {
    const r = leerAgente("x", "---\ndescripcion: d\nmotor: gpt\n---\n", "proyecto");
    expect("error" in r && r.error).toMatch(/modelo, claude-code, codex/);
  });

  it("un «modelo» vale con los TRES motores: los dos externos también lo aceptan", () => {
    // Esto se rechazaba, con el argumento de que ahí el modelo lo elige el agente. Era falso
    // y está medido: el SDK de Claude Code acepta `options.model` —y documenta los alias
    // `opus`, `sonnet`, `haiku`, `fable`— y el `ThreadStartParams` de Codex acepta `model`,
    // cuyos valores da su propio `model/list`. Rechazarlo dejaba fuera justo lo que el
    // usuario quiere decidir: con qué modelo corre cada especialista.
    // `soloLectura: true` porque los dos externos lo exigen, que es otra regla y sigue viva.
    const claude = leerAgente("x", "---\ndescripcion: d\nmotor: claude-code\nsoloLectura: true\nmodelo: opus\n---\n", "proyecto");
    expect("agente" in claude && claude.agente.modelo).toBe("opus");

    const codex = leerAgente("x", "---\ndescripcion: d\nmotor: codex\nsoloLectura: true\nmodelo: gpt-5.6-sol\n---\n", "proyecto");
    expect("agente" in codex && codex.agente.modelo).toBe("gpt-5.6-sol");
  });

  it("`soloLectura` solo es cierto con exactamente «true»", () => {
    // La misma trampa que `compartido` con el `"false"` de CloudStudio: cualquier cadena no
    // vacía es verdadera en JavaScript, y aquí eso concedería ESCRITURA por escribir mal
    // el valor. Se compara contra el literal, no se convierte.
    for (const valor of ["quizá", "false", "1", "sí", ""]) {
      const r = leerAgente("x", `---\ndescripcion: d\nsoloLectura: ${valor}\n---\n`, "proyecto");
      expect("agente" in r && r.agente.soloLectura, valor).toBe(false);
    }
    const si = leerAgente("x", "---\ndescripcion: d\nsoloLectura: true\n---\n", "proyecto");
    expect("agente" in si && si.agente.soloLectura).toBe(true);
  });

  it("un fichero roto devuelve el motivo en vez de lanzar", () => {
    // Un `.md` mal escrito no puede tumbar el arranque de la consola: se salta, se dice
    // cuál y por qué, y los demás siguen. Misma postura que `sesiones.ts` con una línea
    // corrupta del `.jsonl`.
    const r = leerAgente("x", "esto no tiene frontmatter", "proyecto");
    expect("error" in r && r.error).toMatch(/frontmatter/);
  });

  it("las comillas del valor se quitan: las dos formas se escriben a mano", () => {
    const r = leerAgente("x", '---\ndescripcion: "Con comillas"\n---\n', "proyecto");
    expect("agente" in r && r.agente.descripcion).toBe("Con comillas");
  });
});

describe("promptDeAgente", () => {
  it("las reglas de XOne van SIEMPRE, y no salen del fichero", () => {
    // Un subagente que no sepa que XOne ignora en silencio lo desconocido escribirá un
    // atributo inventado y no dará error: dará un bug mudo, que es la razón de ser de este
    // producto. Poder quitarlas editando un `.md` convertiría el invariante en una
    // preferencia — el mismo principio por el que los avisos de honestidad son código.
    const prompt = promptDeAgente(agente({ instrucciones: "haz lo que quieras" }));
    expect(prompt).toContain(REGLAS_XONE);
    expect(prompt.indexOf(REGLAS_XONE)).toBe(0);
  });

  it("las reglas nombran lo que el motor de Android RECHAZA, y también lo que acepta", () => {
    // La matriz de Rhino está MEDIDA ejecutando en el aparato, y este es el único sitio de
    // xonecode donde vive. Sin este test, «acortar» la lista —que es lo que pide el comentario
    // de arriba sobre no hacer un preámbulo largo— se lleva por delante la medida sin que nada
    // se ponga rojo: el prompt seguiría siendo un prompt válido. Y lo que se pierde no falla
    // ruidosamente, falla MUDO y para la app entera al arrancar.
    //
    // Se comprueban las dos mitades a propósito. La de «NO» evita el bug; la de «SÍ» evita el
    // otro fallo, que ya ocurrió una vez: un modelo al que solo se le dice «ES5» se pone a
    // «arreglar» `let` y arrow functions, que funcionan.
    for (const rechazado of ["${}", "class", "spread", "a=1", "function*", "async/await", "?.", "??"]) {
      expect(REGLAS_XONE).toContain(rechazado);
    }
    for (const aceptado of ["let", "const", "arrow functions", "destructuring", "for...of"]) {
      expect(REGLAS_XONE).toContain(aceptado);
    }
    // Estos no son de sintaxis: existen y valen `undefined`, así que el fallo llega en
    // ejecución y no al parsear. Se nombran por separado en la regla y aquí también.
    for (const ausente of ["Map", "Set", "Array.prototype.includes"]) {
      expect(REGLAS_XONE).toContain(ausente);
    }
  });

  it("las instrucciones del usuario van DESPUÉS de la descripción, que es donde más pesan", () => {
    const prompt = promptDeAgente(agente({ descripcion: "DESC", instrucciones: "MI REGLA" }));
    expect(prompt.indexOf("MI REGLA")).toBeGreaterThan(prompt.indexOf("DESC"));
  });

  it("sin instrucciones no deja un hueco de tres saltos", () => {
    // Tres saltos seguidos no separan nada: solo gastan tokens y hacen que el prompt se lea
    // como si faltara un trozo.
    const prompt = promptDeAgente(agente({ instrucciones: "   " }));
    expect(prompt).not.toMatch(/\n{3,}/);
  });

  it("la línea de escritura es ESTRUCTURAL: sale de `soloLectura`, no del fichero", () => {
    // Un agente que escribe sin saber que sus escrituras se aprueban insiste al ver un
    // rechazo. Y no puede depender de que el usuario se acuerde de escribirlo en su `.md`.
    expect(promptDeAgente(agente({ soloLectura: true }))).toContain("No modificas nada.");
    expect(promptDeAgente(agente({ soloLectura: false }))).toMatch(/aprobación humana/);
  });

  it("las skills que FALTAN se avisan: un doble nunca se disfraza", () => {
    // Una skill declarada en el `.md` que no está en el catálogo haría que el modelo
    // intentara cargarla y fallara sin saber por qué. Se dice, no se calla.
    const prompt = promptDeAgente(agente({ skills: ["archify", "inventada"] }), {
      suyas: ["archify"],
      faltan: ["inventada"],
    });
    // Las que TIENE ya no se nombran: lo hace `SkillsMiddleware` de deepagents, y nuestra
    // línea además le contradecía su progressive disclosure. Ver el describe de arriba.
    expect(prompt).not.toContain("Tus skills:");
    expect(prompt).toMatch(/AVISO: te faltan.*inventada/);
  });
});

describe("fusionarAgentes", () => {
  it("el de proyecto gana sobre el global con el mismo nombre", () => {
    // Misma precedencia que los modelos, y por lo mismo: un «revisor de XOne» se quiere en
    // todos los proyectos, y un «experto en esta app» solo en uno — y el segundo tiene que
    // poder pisar al primero sin borrarlo.
    const fusion = fusionarAgentes(
      [agente({ nombre: "revisor", descripcion: "global", origen: "global" })],
      [agente({ nombre: "revisor", descripcion: "de proyecto" })]
    );
    expect(fusion).toHaveLength(1);
    expect(fusion[0]!.descripcion).toBe("de proyecto");
  });

  it("los que no chocan se conservan los dos, ordenados por nombre", () => {
    const fusion = fusionarAgentes(
      [agente({ nombre: "zeta", origen: "global" })],
      [agente({ nombre: "alfa" })]
    );
    expect(fusion.map((a) => a.nombre)).toEqual(["alfa", "zeta"]);
  });
});

describe("escribirAgente", () => {
  it("a un agente EXTERNO se le dice que sus rutas son del DISCO, no del backend virtual", () => {
    // El detalle que más fácil se cuela: un `.md` que diga «guarda en /doc» describe la
    // carpeta `doc` del PROYECTO con motor `modelo` —ahí «/» es la raíz montada— y la
    // carpeta `/doc` del SISTEMA con Claude Code, que está fuera y se deniega. Quien escribe
    // el `.md` no tiene por qué saber de qué lado cae, así que se dice desde código en vez
    // de esperar a que lo aprenda por un rechazo.
    expect(promptDeAgente(agente({ motor: "claude-code", soloLectura: false }))).toMatch(/RUTAS:/);
    expect(promptDeAgente(agente({ motor: "codex" }))).toMatch(/RUTAS:/);
    // Y al de motor `modelo` NO se le dice, porque para él sería falso: su «/» sí es la raíz
    // del proyecto.
    expect(promptDeAgente(agente({ motor: "modelo" }))).not.toMatch(/RUTAS:/);
  });

  it("un agente de Claude Code YA puede pedir escribir, y el papel se conserva", () => {
    // La guarda que lo rechazaba existía porque sus escrituras se denegaban siempre, así que
    // aceptarlo prometía una capacidad que no iba a tener. Se levantó CON el cableado de
    // `PoliticaDeEscrituraExterna`, no antes — al revés habría creado el caso que la guarda
    // existía para evitar. Y no tenía ningún test: estaba escrita y nada más.
    const r = leerAgente("dev-externo", "---\ndescripcion: d\nmotor: claude-code\nsoloLectura: false\n---\ncuerpo\n", "proyecto");
    expect("agente" in r && r.agente.soloLectura).toBe(false);
    expect("agente" in r && r.agente.motor).toBe("claude-code");
  });

  it("y uno de CODEX también, desde que su escritura pasa por la misma aprobación", () => {
    // Su guarda se levantó igual: CON el cableado. Estuvo cerrada mientras fue cierto que
    // abrirla exigía `sandbox: "workspace-write"` —y entonces las guardas de ruta de
    // xonecode no verían ni una escritura—. La medida contra el binario real enseñó que la
    // palanca es el `approvalPolicy` y no el sandbox: con `read-only` + `on-request` la
    // denegación la sigue poniendo el sistema operativo y cada escritura se pregunta.
    const r = leerAgente("x", "---\ndescripcion: d\nmotor: codex\nsoloLectura: false\n---\n", "proyecto");
    expect("agente" in r && r.agente.soloLectura).toBe(false);
    expect("agente" in r && r.agente.motor).toBe("codex");
  });

  it("lo que escribe se vuelve a leer igual: es el ciclo que usa la ventana de ajustes", () => {
    // Sin esta ida y vuelta, guardar desde la interfaz podría producir un fichero que el
    // cargador rechaza — y el agente desaparecería al siguiente arranque sin que nadie
    // hubiera hecho nada raro.
    const original = agente({
      descripcion: "Revisa un .xne",
      motor: "modelo",
      modelo: "anthropic/claude",
      soloLectura: false,
      skills: ["archify"],
      instrucciones: "Cuerpo\ncon dos líneas.",
    });
    const releido = leerAgente("revisor", escribirAgente(original), "proyecto");
    expect("agente" in releido && releido.agente).toEqual(original);
  });
});

/**
 * El nombre de un subagente es un slug, y se valida AL GUARDAR.
 *
 * Al cargar solo se DICE (`leerCarpetaDeAgentes`): rechazar ahí haría desaparecer un agente
 * que funciona. Guardar es el único momento con alguien delante que lo puede arreglar, y
 * desde que el nombre de uno propio se puede cambiar, tiene con qué.
 */
describe("motivoDeNombreInaceptable", () => {
  it("acepta un slug: minúsculas, dígitos y guiones sencillos", () => {
    for (const bueno of ["docs", "consultant-xone", "tester-xone", "a", "v2", "mi-agente-3"]) {
      expect(motivoDeNombreInaceptable(bueno)).toBeUndefined();
    }
  });

  it("la MAYÚSCULA se dice aparte, porque es el caso que de verdad pasa", () => {
    // Un `Documentador.md` escrito a mano es lo que hay en las carpetas de verdad, y «solo
    // vale minúsculas, dígitos y guiones» no señala cuál de las tres reglas ha roto.
    expect(motivoDeNombreInaceptable("Documentador")).toMatch(/mayúsculas/);
  });

  it("rechaza lo que rompería una ruta, un `git` o un sistema de ficheros", () => {
    // Los acentos, por la cita en octal de `core.quotePath` con bytes ≥ 0x80; el guion bajo y
    // el espacio, por convención; el guion al borde y el doble, porque no son un slug.
    for (const malo of ["", "  ", "mi_agente", "mi agente", "diseñador", "-x", "x-", "a--b", "."]) {
      expect(motivoDeNombreInaceptable(malo)).toBeDefined();
    }
  });
});

describe("nombreSugerido", () => {
  it("propone el que valdría, para que el aviso se pueda obedecer", () => {
    expect(nombreSugerido("Documentador")).toBe("documentador");
    expect(nombreSugerido("Mi Agente")).toBe("mi-agente");
    expect(nombreSugerido("mi_agente")).toBe("mi-agente");
  });

  it("los acentos se DESCOMPONEN, no se tiran", () => {
    // `dise-ador` sería una propuesta que el usuario tiene que corregir; `disenador` se
    // acepta tal cual. Es la diferencia entre ofrecer un arreglo y ofrecer otro problema.
    expect(nombreSugerido("diseñador")).toBe("disenador");
    expect(nombreSugerido("revisión")).toBe("revision");
  });

  it("y si no hay nada que proponer, no propone: una sugerencia inválida es peor que ninguna", () => {
    expect(nombreSugerido("///")).toBeUndefined();
    expect(nombreSugerido("")).toBeUndefined();
  });

  it("lo que propone SIEMPRE vale: se comprueba con la misma función", () => {
    for (const bruto of ["Documentador", "Mi Agente", "diseñador", "  raro  ", "a__b", "ÑU"]) {
      const s = nombreSugerido(bruto);
      if (s !== undefined) expect(motivoDeNombreInaceptable(s)).toBeUndefined();
    }
  });
});

describe("ejecucion: la capacidad de correr comandos", () => {
  it("ausente es que NO: lo que no se declara, no se concede", () => {
    const { agente } = leerAgente("mio", "---\ndescripcion: x\n---\n", "global") as { agente: Agente };
    expect(agente.ejecucion).toBeUndefined();
  });

  it("solo con exactamente «true» — la trampa del \"false\" de CloudStudio", () => {
    const de = (v: string) =>
      (leerAgente("mio", `---\ndescripcion: x\nejecucion: ${v}\n---\n`, "global") as { agente: Agente }).agente
        .ejecucion;
    expect(de("true")).toBe(true);
    expect(de("false")).toBeUndefined();
    expect(de("quizá")).toBeUndefined();
    expect(de("True")).toBeUndefined();
  });

  it("va y vuelve por el `.md` sin perderse, y no ensucia a quien no la tiene", () => {
    const base: Agente = {
      nombre: "mio",
      descripcion: "x",
      motor: "modelo",
      soloLectura: true,
      skills: [],
      instrucciones: "",
      origen: "global",
    };
    expect(escribirAgente(base)).not.toContain("ejecucion");
    const texto = escribirAgente({ ...base, ejecucion: true });
    expect(texto).toContain("ejecucion: true");
    expect((leerAgente("mio", texto, "global") as { agente: Agente }).agente.ejecucion).toBe(true);
  });
});

/**
 * `escribeEn`: dónde puede escribir un agente de solo lectura.
 *
 * Nace del que documenta — su entregable es un manual en `doc/`—, y lo que defiende es que
 * darle esa carpeta NO sea lo mismo que quitarle el `soloLectura`.
 */
describe("escribeEn en el frontmatter", () => {
  const conFrontmatter = (linea: string) =>
    leerAgente("writer-xone", `---\ndescripcion: documenta\nmotor: modelo\nsoloLectura: true\n${linea}\nskills: []\n---\ncuerpo`, "global");

  it("se lee como lista y se normaliza a ruta absoluta", () => {
    const leido = conFrontmatter("escribeEn: [doc, /doc2/]");
    expect("error" in leido).toBe(false);
    if ("error" in leido) return;
    // `doc`, `/doc` y `/doc/` dicen lo mismo: quien escribe el `.md` no tiene por qué saber
    // cuál esperamos.
    expect(leido.agente.escribeEn).toEqual(["/doc", "/doc2/"]);
  });

  it("ausente es AUSENTE, no una lista vacía", () => {
    const leido = leerAgente("x", "---\ndescripcion: d\nmotor: modelo\nsoloLectura: true\nskills: []\n---\n", "global");
    if ("error" in leido) throw new Error(leido.error);
    expect(leido.agente.escribeEn).toBeUndefined();
  });

  it("se conserva al volver a escribir el fichero", () => {
    const leido = conFrontmatter("escribeEn: [/doc/]");
    if ("error" in leido) throw new Error(leido.error);
    const vuelta = leerAgente("writer-xone", escribirAgente(leido.agente), "global");
    if ("error" in vuelta) throw new Error(vuelta.error);
    expect(vuelta.agente.escribeEn).toEqual(["/doc/"]);
  });
});
