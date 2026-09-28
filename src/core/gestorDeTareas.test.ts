import { describe, expect, it } from "vitest";
import {
  categoriaDeEstado,
  comentarioDeCierre,
  jqlDePendientes,
  motivoDeClaveDeProyecto,
  transicionPropuesta,
  type DatosDeCierre,
  type TransicionDelGestor,
} from "./gestorDeTareas.js";

describe("jqlDePendientes", () => {
  it("las pendientes de un proyecto, lo último tocado arriba", () => {
    expect(jqlDePendientes({ proyecto: "IXCODE" })).toBe('project = "IXCODE" AND statusCategory != Done ORDER BY updated DESC');
  });
  it("el texto de búsqueda entra ESCAPADO: es una JQL", () => {
    expect(jqlDePendientes({ proyecto: "IXCODE" }, 'menú "x" \\ y')).toBe(
      'project = "IXCODE" AND statusCategory != Done AND text ~ "menú \\"x\\" \\\\ y" ORDER BY updated DESC'
    );
  });
  it("un texto vacío o de espacios no añade nada", () => {
    expect(jqlDePendientes({ proyecto: "IXCODE" }, "   ")).toBe(jqlDePendientes({ proyecto: "IXCODE" }));
  });
  it("«asignadas a mí» añade currentUser(), junto con el texto ESCAPADO", () => {
    expect(jqlDePendientes({ proyecto: "IXCODE" }, undefined, { mias: true })).toBe(
      'project = "IXCODE" AND statusCategory != Done AND assignee = currentUser() ORDER BY updated DESC'
    );
    expect(jqlDePendientes({ proyecto: "IXCODE" }, 'a"b', { mias: true })).toBe(
      'project = "IXCODE" AND statusCategory != Done AND assignee = currentUser() AND text ~ "a\\"b" ORDER BY updated DESC'
    );
    expect(jqlDePendientes({ proyecto: "IXCODE" }, undefined, { mias: false })).toBe(jqlDePendientes({ proyecto: "IXCODE" }));
  });
});

describe("motivoDeClaveDeProyecto", () => {
  it.each(["IXCODE", "HUB", "A1_B"])("%s vale", (c) => expect(motivoDeClaveDeProyecto(c)).toBeUndefined());
  it.each(["ixcode", "IX CODE", 'X" OR 1=1', "", "1ABC"])("%s no", (c) => expect(motivoDeClaveDeProyecto(c)).toBeTypeOf("string"));
});

describe("categoriaDeEstado", () => {
  it("new → por-hacer", () => expect(categoriaDeEstado("new")).toBe("por-hacer"));
  it("indeterminate → en-curso", () => expect(categoriaDeEstado("indeterminate")).toBe("en-curso"));
  it("done → terminada", () => expect(categoriaDeEstado("done")).toBe("terminada"));
  it("lo desconocido, y lo ausente, caen en por-hacer", () => {
    expect(categoriaDeEstado("otra-cosa")).toBe("por-hacer");
    expect(categoriaDeEstado(undefined)).toBe("por-hacer");
  });
});

const t = (id: string, nombre: string, destino: string, categoria: "por-hacer" | "en-curso" | "terminada"): TransicionDelGestor => ({ id, nombre, destino, categoria });
describe("transicionPropuesta", () => {
  const ts = [t("11", "Volver", "PROBLEMA", "por-hacer"), t("21", "Empezar", "EN CURSO", "en-curso"), t("2", "PROBAR", "PROBAR", "en-curso"), t("31", "Hecho", "TERMINADO", "terminada")];
  it("al empezar, la que lleva a EN CURSO", () => expect(transicionPropuesta(ts, "empezar")?.id).toBe("21"));
  it("al cerrar, PROBAR si existe", () => expect(transicionPropuesta(ts, "cerrar")?.id).toBe("2"));
  it("al cerrar sin PROBAR, la primera terminada", () => expect(transicionPropuesta(ts.filter((x) => x.id !== "2"), "cerrar")?.id).toBe("31"));
  it("sin candidata, nada", () => expect(transicionPropuesta([ts[0]!], "cerrar")).toBeUndefined());
  it("al empezar, un destino EN CURSO sin distinguir mayúsculas también vale", () => {
    const ts2 = [t("1", "x", "en curso", "por-hacer")];
    expect(transicionPropuesta(ts2, "empezar")?.id).toBe("1");
  });
  it("al empezar sin candidata, nada", () => {
    expect(transicionPropuesta([t("1", "Volver", "PROBLEMA", "por-hacer")], "empezar")).toBeUndefined();
  });
  it("al empezar, EN CURSO gana aunque PROBAR (también en-curso) venga primero en la lista", () => {
    const ts2 = [t("2", "PROBAR", "PROBAR", "en-curso"), t("21", "Empezar", "EN CURSO", "en-curso")];
    expect(transicionPropuesta(ts2, "empezar")?.id).toBe("21");
  });
  it("al cerrar, PROBAR gana aunque una terminada venga primero en la lista", () => {
    const ts2 = [t("31", "Hecho", "TERMINADO", "terminada"), t("2", "PROBAR", "PROBAR", "en-curso")];
    expect(transicionPropuesta(ts2, "cerrar")?.id).toBe("2");
  });
});

describe("comentarioDeCierre", () => {
  const base: DatosDeCierre = {
    ficheros: [
      { ruta: "colecciones/Clientes.xne", clase: "nuevo" },
      { ruta: "app.xne", clase: "modificado" },
    ],
    commits: ["abcdef1234567890", "0123456789abcdef"],
  };

  it("lista los ficheros con su clase y los commits en hash corto de 7", () => {
    const texto = comentarioDeCierre(base);
    expect(texto).toContain("## Qué cambió");
    expect(texto).toContain("- `colecciones/Clientes.xne` (nuevo)");
    expect(texto).toContain("- `app.xne` (modificado)");
    expect(texto).toContain("Commits: `abcdef1`, `0123456`");
  });

  it("sin ficheros ni commits, lo dice y no rompe el formato", () => {
    const texto = comentarioDeCierre({ ficheros: [], commits: [] });
    expect(texto).toContain("## Qué cambió\n\n_(sin ficheros)_");
    expect(texto).not.toContain("Commits:");
  });

  it("sin `atribucion`, se comporta como antes de que existiera: la lista tal cual", () => {
    const texto = comentarioDeCierre(base);
    expect(texto).not.toContain("Cambios en la copia");
    expect(texto).not.toContain("No se pudo comprobar");
    expect(texto).toContain("## Qué cambió\n\n- `colecciones/Clientes.xne` (nuevo)");
  });

  it("atribución `git`: igual que ausente, la lista sin avisos", () => {
    const texto = comentarioDeCierre({ ...base, atribucion: "git" });
    expect(texto).not.toContain("Cambios en la copia");
    expect(texto).toContain("## Qué cambió\n\n- `colecciones/Clientes.xne` (nuevo)");
  });

  it("atribución `desde-apertura`: la lista sale, pero con el aviso de que no está confirmada", () => {
    const texto = comentarioDeCierre({ ...base, atribucion: "desde-apertura" });
    expect(texto).toContain(
      "## Qué cambió\n\nCambios en la copia desde que se abrió la sesión (sin confirmar que sean todos de esta sesión):\n\n- `colecciones/Clientes.xne` (nuevo)"
    );
    expect(texto).toContain("- `app.xne` (modificado)");
  });

  it("atribución `sin-marca`: ni lista ni «sin ficheros», solo que no se pudo comprobar", () => {
    const texto = comentarioDeCierre({ ficheros: [], commits: [], atribucion: "sin-marca" });
    expect(texto).toContain("## Qué cambió\n\nNo se pudo comprobar qué cambió.");
    expect(texto).not.toContain("_(sin ficheros)_");
    expect(texto).not.toContain("Commits:");
  });

  it("sin veredicto, «no corrió» — NUNCA «verde» sin dato", () => {
    expect(comentarioDeCierre(base)).toContain("## Verificación\n\nno corrió");
  });

  it("con veredicto verde, dice verde", () => {
    const texto = comentarioDeCierre({ ...base, veredicto: { verde: true, errores: 0, avisos: 0 } });
    expect(texto).toContain("## Verificación\n\nverde");
  });

  it("con veredicto en rojo, cuenta los errores con el formato literal del criterio", () => {
    const texto = comentarioDeCierre({ ...base, veredicto: { verde: false, errores: 3, avisos: 2 } });
    expect(texto).toContain("## Verificación\n\nen rojo: 3 errores");
  });

  it("el plan solo sale si hay algo que decir", () => {
    expect(comentarioDeCierre(base)).not.toContain("## Plan");
    expect(comentarioDeCierre({ ...base, plan: "   " })).not.toContain("## Plan");
    expect(comentarioDeCierre({ ...base, plan: "Falta el paso 3" })).toContain("## Plan\n\nFalta el paso 3");
  });

  it("el resumen se recorta a 1500 caracteres, con «…» que dice que se cortó", () => {
    const largo = "x".repeat(2000);
    const texto = comentarioDeCierre({ ...base, resumen: largo });
    expect(texto).toContain(`## Resumen\n\n${"x".repeat(1500)}…`);
    expect(texto).not.toContain("x".repeat(1501));
  });

  it("un resumen que YA cabe en 1500 no lleva «…»", () => {
    const texto = comentarioDeCierre({ ...base, resumen: "corto y ya" });
    expect(texto).toContain("## Resumen\n\ncorto y ya");
    expect(texto).not.toContain("corto y ya…");
  });

  it("sin resumen, no sale la sección", () => {
    expect(comentarioDeCierre(base)).not.toContain("## Resumen");
  });

  it("siempre cierra con la firma del harness", () => {
    expect(comentarioDeCierre(base).endsWith("— escrito por xonecode")).toBe(true);
  });
});
