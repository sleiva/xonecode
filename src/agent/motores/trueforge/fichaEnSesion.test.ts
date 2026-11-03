import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearFichaDeSesion } from "./fichaEnSesion.js";

const TASKS = `# Plan

## 01 — La calculadora
**Estado:** en curso
- [ ] suma
- [ ] resta
`;
const CASOS = '{"comando":"caso","caso":1,"pasos":"AC 7 ADD 8 EQ","nuevos":["15"]}';

function proyecto() {
  const raiz = mkdtempSync(join(tmpdir(), "xc-ficha-"));
  writeFileSync(join(raiz, "Calc.xne"), "<coll/>\n");
  mkdirSync(join(raiz, ".xonecode", "planes", "calc"), { recursive: true });
  writeFileSync(join(raiz, ".xonecode", "planes", "calc", "TASKS.md"), TASKS);
  return raiz;
}
const tasks = (raiz: string) => readFileSync(join(raiz, ".xonecode", "planes", "calc", "TASKS.md"), "utf8");

describe("la ficha viva de una sesión", () => {
  it("el objetivo es la petición literal; lo que llega después son aclaraciones", () => {
    const f = crearFichaDeSesion({ raiz: proyecto(), continuar: true });
    f.alEmpezarTurno("Crea la calculadora");
    f.alEmpezarTurno("y que reste");
    expect(f.ficha().objetivo?.texto).toBe("Crea la calculadora");
    expect(f.ficha().aclaraciones.map((a) => a.texto)).toEqual(["y que reste"]);
  });

  it("sin prueba en el aparato posterior al último cambio no se marca; con ella, sí", () => {
    const raiz = proyecto();
    const f = crearFichaDeSesion({ raiz, continuar: true });
    f.alResultado("write_file", { file_path: "/Calc.xne" }, "ok", "developer-xone");
    expect("motivo" in f.respaldo()).toBe(true);
    f.alResultado("ejecutar_script", { command: "xone-hotswap click name=K_7 --- click name=K_8" }, CASOS, "developer-xone");
    const r = f.respaldo();
    expect("evidencia" in r).toBe(true);
    // Editar después la caduca: otra vez sin respaldo.
    writeFileSync(join(raiz, "Calc.xne"), "<coll cambiada/>\n");
    f.alResultado("edit_file", { file_path: "/Calc.xne" }, "ok", "developer-xone");
    expect("motivo" in f.respaldo()).toBe(true);
  });

  it("lo de fuera del proyecto (planes, artefactos) no forma parte de la versión", () => {
    const f = crearFichaDeSesion({ raiz: proyecto(), continuar: true });
    f.alResultado("write_file", { file_path: "/planes/calc/TASKS.md" }, "ok", "analyst-xone");
    expect(f.ficha().escritos).toEqual({});
  });

  it("al cerrar, el estado de la tarea lo calcula el código y se escribe en su TASKS.md", () => {
    const raiz = proyecto();
    const f = crearFichaDeSesion({ raiz, continuar: true });
    f.alResultado("write_file", { file_path: "/Calc.xne" }, "ok", "developer-xone");
    f.alResultado("ejecutar_script", { command: "xone-hotswap click name=K_7 --- click name=K_8" }, CASOS, "developer-xone");
    const r = f.respaldo() as { evidencia: string };
    // Las dos casillas marcadas (como haría la tool) y respaldadas.
    writeFileSync(join(raiz, ".xonecode", "planes", "calc", "TASKS.md"), TASKS.replace(/- \[ \]/g, "- [x]"));
    f.alMarcar("calc", "01", [1, 2], r.evidencia);
    expect(f.alCerrar("verde").join("\n")).toContain("tarea 01: hecha");
    expect(tasks(raiz)).toContain("**Estado:** hecha");
  });

  it("si se editó después de comprobar, no es «hecha»: implementada, y lo dice", () => {
    const raiz = proyecto();
    const f = crearFichaDeSesion({ raiz, continuar: true });
    f.alResultado("write_file", { file_path: "/Calc.xne" }, "ok", "developer-xone");
    f.alResultado("ejecutar_script", { command: "xone-captura-android" }, "guardada /artefactos/captura-1.png", "developer-xone");
    const r = f.respaldo() as { evidencia: string };
    writeFileSync(join(raiz, ".xonecode", "planes", "calc", "TASKS.md"), TASKS.replace(/- \[ \]/g, "- [x]"));
    f.alMarcar("calc", "01", [1, 2], r.evidencia);
    writeFileSync(join(raiz, "Calc.xne"), "<coll otra/>\n");
    const cierre = f.alCerrar("verde").join("\n");
    expect(cierre).toContain("tarea 01: implementada");
    expect(cierre).toContain("2 comprobado(s) antes del último cambio");
    expect(tasks(raiz)).toContain("**Estado:** implementada");
  });

  it("se guarda y se retoma en la misma sesión; sin sesión, empieza de cero", () => {
    const raiz = proyecto();
    const ruta = join(raiz, ".xonecode", "sesiones", "s1", "ficha.json");
    const a = crearFichaDeSesion({ raiz, ruta, continuar: true });
    a.alEmpezarTurno("Crea la calculadora");
    expect(crearFichaDeSesion({ raiz, ruta, continuar: true }).ficha().objetivo?.texto).toBe("Crea la calculadora");
    expect(crearFichaDeSesion({ raiz, ruta, continuar: false }).ficha().objetivo).toBeUndefined();
  });
});
