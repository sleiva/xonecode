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

  it("un «modelo» con un motor que no lo usa se rechaza en vez de ignorarse", () => {
    // Quien lo escribió cree que está eligiendo el modelo del hijo, y no es así: Claude
    // Code usa el suyo. Tragárselo en silencio le dejaría creyendo una cosa falsa.
    const r = leerAgente("x", "---\ndescripcion: d\nmotor: claude-code\nmodelo: openai/gpt-4o\n---\n", "proyecto");
    expect("error" in r && r.error).toMatch(/solo vale con/);
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

  it("las instrucciones del usuario van al FINAL, que es donde más pesan", () => {
    const prompt = promptDeAgente(agente({ instrucciones: "MI REGLA" }));
    expect(prompt.trimEnd().endsWith("MI REGLA")).toBe(true);
  });

  it("sin instrucciones no deja un hueco: la descripción cierra el prompt", () => {
    const prompt = promptDeAgente(agente({ descripcion: "Revisa cosas.", instrucciones: "   " }));
    expect(prompt.trimEnd().endsWith("Revisa cosas.")).toBe(true);
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
