import { describe, it, expect } from "vitest";
import { permisosDe, toolsDe, hitlDe, TOOLS_ESCRITURA } from "./perfiles.js";
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
