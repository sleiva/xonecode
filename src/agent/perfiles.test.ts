import { describe, it, expect } from "vitest";
import { PERFILES, permisosDe, toolsDe, hitlDe, TOOLS_ESCRITURA } from "./perfiles.js";

const TODOS = Object.values(PERFILES);

describe("permisosDe", () => {
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
    }
  });

  it("un perfil de solo lectura deniega TODA escritura", () => {
    const deniegos = permisosDe(PERFILES.docs).filter((p) => p.mode === "deny");
    expect(deniegos.some((p) => p.operations.includes("write") && p.paths.includes("/**"))).toBe(true);
  });

  it("un perfil que escribe NO deniega toda escritura, pero sigue sin tocar .env", () => {
    const permisos = permisosDe(PERFILES.dev);
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
    expect(toolsDe(PERFILES.dev)).toContain("write_file");
    expect(toolsDe(PERFILES.dev)).toContain("read_file");
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
    expect(hitlDe(PERFILES.docs)).toEqual({});
  });

  it("la descripción dice QUIÉN pide: el interrupt no lo trae", () => {
    // `dev` y `mockup` comparten `write_file`, así que sin esto el usuario no sabría
    // cuál de los dos le está pidiendo permiso.
    expect(hitlDe(PERFILES.dev).write_file!.description).toContain("[dev]");
    expect(hitlDe(PERFILES.mockup).write_file!.description).toContain("[mockup]");
  });

  it("no se ofrece `edit`: no hay interfaz para editar los argumentos", () => {
    expect(hitlDe(PERFILES.dev).write_file!.allowedDecisions).toEqual(["approve", "reject"]);
  });
});