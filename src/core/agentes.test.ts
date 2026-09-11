import { describe, it, expect } from "vitest";
import {
  escribirAgente,
  fusionarAgentes,
  leerAgente,
  promptDeAgente,
  REGLAS_XONE,
  type Agente,
} from "./agentes.js";

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
    expect(prompt).toContain("Tus skills: archify");
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
  it("un agente de Claude Code YA puede pedir escribir, y el papel se conserva", () => {
    // La guarda que lo rechazaba existía porque sus escrituras se denegaban siempre, así que
    // aceptarlo prometía una capacidad que no iba a tener. Se levantó CON el cableado de
    // `PoliticaDeEscrituraExterna`, no antes — al revés habría creado el caso que la guarda
    // existía para evitar. Y no tenía ningún test: estaba escrita y nada más.
    const r = leerAgente("dev-externo", "---\ndescripcion: d\nmotor: claude-code\nsoloLectura: false\n---\ncuerpo\n", "proyecto");
    expect("agente" in r && r.agente.soloLectura).toBe(false);
    expect("agente" in r && r.agente.motor).toBe("claude-code");
  });

  it("pero uno de CODEX con escritura se sigue rechazando, y por otro motivo", () => {
    // Ahí la escritura la bloquea el SANDBOX del sistema operativo (`sandbox: "read-only"`),
    // que es más fuerte que un callback porque no depende de que el modelo colabore — pero
    // también significa que sus escrituras no pasarían por las guardas de ruta de xonecode.
    // Concederlas es otra decisión, y mientras no se tome esto no puede prometerla.
    const r = leerAgente("x", "---\ndescripcion: d\nmotor: codex\nsoloLectura: false\n---\n", "proyecto");
    expect("error" in r && r.error).toMatch(/sandbox del sistema operativo/);
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
