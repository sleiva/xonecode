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

/** Medido en una pasada real: la escritura por la cola de aprobación llega DESPUÉS de la respuesta de la tool. */
describe("una escritura que se aplica después de contestar la tool", () => {
  it("se recoge cuando llega al disco: la prueba siguiente va con su versión, y editar después la caduca", () => {
    const raiz = proyecto();
    const f = crearFichaDeSesion({ raiz, continuar: true });
    // La tool contesta y el fichero aún no está.
    f.alResultado("write_file", { file_path: "/icons/nuevo.svg" }, "pendiente de aplicar", "designer-xone");
    expect(f.ficha().escritos).toEqual({});
    // Llega al disco; la siguiente evidencia ya lo incluye en su versión.
    mkdirSync(join(raiz, "icons"), { recursive: true });
    writeFileSync(join(raiz, "icons", "nuevo.svg"), "<svg/>");
    f.alResultado("ejecutar_script", { command: "xone-captura-android" }, "guardada /artefactos/c.png", "developer-xone");
    expect(Object.keys(f.ficha().escritos)).toEqual(["/icons/nuevo.svg"]);
    expect("evidencia" in f.respaldo()).toBe(true);
    // Y cambiarlo después deja esa captura sin valer.
    writeFileSync(join(raiz, "icons", "nuevo.svg"), "<svg otro/>");
    expect("motivo" in f.respaldo()).toBe(true);
  });
});

describe("una escritura que pasa por aprobación y no devuelve respuesta", () => {
  it("basta con haberla PEDIDO: al llegar al disco entra en la versión, y la captura de antes ya no vale", () => {
    const raiz = proyecto();
    const f = crearFichaDeSesion({ raiz, continuar: true });
    f.alResultado("ejecutar_script", { command: "xone-captura-android" }, "guardada /artefactos/a.png", "device-controller");
    expect("evidencia" in f.respaldo()).toBe(true);
    f.alPedir("write_file", { file_path: "/icons/tecla.svg" });
    f.alPedir("write_file", { file_path: "/planes/calc/TASKS.md" });
    mkdirSync(join(raiz, "icons"), { recursive: true });
    writeFileSync(join(raiz, "icons", "tecla.svg"), "<svg/>");
    expect("motivo" in f.respaldo()).toBe(true);
    expect(Object.keys(f.ficha().escritos)).toEqual(["/icons/tecla.svg"]);
  });
});

/** F2: la auditoría de cierre solo puede BAJAR lo que calcula la ficha. */
describe("con la auditoría de cierre", () => {
  const preparada = () => {
    const raiz = proyecto();
    const f = crearFichaDeSesion({ raiz, continuar: true });
    f.alResultado("write_file", { file_path: "/Calc.xne" }, "ok", "developer-xone");
    f.alResultado("ejecutar_script", { command: "xone-captura-android" }, "guardada /artefactos/captura-1.png", "developer-xone");
    const r = f.respaldo() as { evidencia: string };
    writeFileSync(join(raiz, ".xonecode", "planes", "calc", "TASKS.md"), TASKS.replace(/- \[ \]/g, "- [x]"));
    f.alMarcar("calc", "01", [1, 2], r.evidencia);
    return { raiz, f };
  };

  it("entrega las casillas marcadas con prueba vigente, con su texto y su captura", () => {
    const { f } = preparada();
    const a = f.paraAuditar();
    expect(a.map((c) => [c.id, c.texto, c.evidencia.resumen])).toEqual([
      ["calc/01/1", "suma", "/artefactos/captura-1.png"],
      ["calc/01/2", "resta", "/artefactos/captura-1.png"],
    ]);
  });

  it("una casilla que su prueba no sostiene deja la tarea en «implementada», y lo dice", () => {
    const { raiz, f } = preparada();
    const cierre = f
      .alCerrar("verde", new Map([
        ["calc/01/1", { veredicto: "cumple" as const, porque: "ok" }],
        ["calc/01/2", { veredicto: "contradice" as const, porque: "resta mal", cita: "7-8=15" }],
      ]))
      .join("\n");
    expect(cierre).toContain("tarea 01: implementada");
    expect(cierre).toContain("1 que su prueba no sostiene");
    expect(tasks(raiz)).toContain("**Estado:** implementada");
  });

  /** Calculadora en la consola (05-11-2026): cada criterio probado con su caso y las ocho casillas respaldadas por la última captura. */
  it("marcar de una vez respalda con TODAS las pruebas vigentes, y el auditor ve los casos de cada una", () => {
    const raiz = proyecto();
    const f = crearFichaDeSesion({ raiz, continuar: true });
    f.alResultado("write_file", { file_path: "/Calc.xne" }, "ok", "developer-xone");
    f.alResultado("ejecutar_script", { command: "xone-hotswap click name=K_7 --- click name=K_8" }, CASOS, "developer-xone");
    f.alResultado("ejecutar_script", { command: "xone-hotswap click name=K_9 --- click name=K_1" }, '{"comando":"caso","caso":1,"pasos":"AC 9 SUB 4 EQ","nuevos":["5"]}', "developer-xone");
    f.alResultado("ejecutar_script", { command: "xone-captura-android" }, "guardada /artefactos/captura-9.png", "developer-xone");
    const r = f.respaldo() as { evidencia: string };
    writeFileSync(join(raiz, ".xonecode", "planes", "calc", "TASKS.md"), TASKS.replace(/- \[ \]/g, "- [x]"));
    f.alMarcar("calc", "01", [1, 2], r.evidencia);
    const a = f.paraAuditar();
    expect(a[0]!.evidencia.resumen).toBe("/artefactos/captura-9.png");
    expect(a[0]!.otras?.map((e) => e.resumen)).toEqual(["1 caso(s): AC 9 SUB 4 EQ → 5", "1 caso(s): AC 7 ADD 8 EQ → 15"]);
    // Editar después las caduca TODAS: ni principal ni otras.
    writeFileSync(join(raiz, "Calc.xne"), "<coll cambiada/>\n");
    f.alResultado("edit_file", { file_path: "/Calc.xne" }, "ok", "developer-xone");
    expect(f.paraAuditar()).toEqual([]);
  });

  it("si todo cumple, «hecha» como sin auditoría: no sube ni baja nada", () => {
    const { f } = preparada();
    const todo = new Map([["calc/01/1", { veredicto: "cumple" as const, porque: "" }], ["calc/01/2", { veredicto: "cumple" as const, porque: "" }]]);
    expect(f.alCerrar("verde", todo).join("\n")).toContain("tarea 01: hecha");
  });
});

/** Medido en la pasada 6: el script dice el NOMBRE, no la ruta, y la auditoría se quedaba sin imagen. */
describe("la captura guarda su ruta aunque el script solo diga el nombre", () => {
  it("«captura guardada como captura-….png» queda como /artefactos/captura-….png", () => {
    const f = crearFichaDeSesion({ raiz: proyecto(), continuar: true });
    f.alResultado(
      "ejecutar_script",
      { command: "xone-captura-android" },
      "captura guardada como captura-1793725650576.png (128000 bytes). Es de la vía nativa: enseña lo que el SISTEMA pinta, no lo que la app host dice.",
      "developer-xone"
    );
    expect(f.ficha().evidencias.at(-1)?.resumen).toBe("/artefactos/captura-1793725650576.png");
  });
});

/** `xone-probar` prueba en UNA orden: sus casos y su captura son dos evidencias, como si hubieran sido dos órdenes. */
describe("xone-probar deja casos y captura", () => {
  it("con --captura, las dos; sin ella, solo los casos", () => {
    const f = crearFichaDeSesion({ raiz: proyecto(), continuar: true });
    const salida = `── casos ──\n${CASOS}\n\n── captura ──\ncaptura guardada como captura-1.png (100 bytes).\n\nxone-probar: 5 paso(s), todos bien`;
    f.alResultado("ejecutar_script", { command: "xone-probar --recargar Calc.xne --captura click name=K_7 --- click name=K_8" }, salida, "developer-xone");
    expect(f.ficha().evidencias.map((e) => [e.tipo, e.resumen])).toEqual([
      ["casos", "1 caso(s): AC 7 ADD 8 EQ → 15"],
      ["captura", "/artefactos/captura-1.png"],
    ]);
    f.alResultado("ejecutar_script", { command: "xone-probar click name=K_7" }, `── casos ──\n${CASOS}`, "developer-xone");
    expect(f.ficha().evidencias.map((e) => e.tipo)).toEqual(["casos", "captura", "casos"]);
  });
});
