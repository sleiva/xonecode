import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { conEscriturasAnotadas, conGuardaDelProyecto, crearGuardaDelProyecto, textoDeCambiosDeshechos } from "./proyectoSinShell.js";

/** Un proyecto pequeño en disco: una colección, un estilo, un icono y la carpeta de xonecode. */
function proyecto(): string {
  const raiz = mkdtempSync(join(tmpdir(), "xc-guarda-"));
  writeFileSync(join(raiz, "Menu.xne"), "<coll name=\"Menu\"/>\n");
  writeFileSync(join(raiz, "estilo.css"), "a{}\n");
  mkdirSync(join(raiz, "icons"));
  writeFileSync(join(raiz, "icons", "ic.svg"), "<svg/>");
  mkdirSync(join(raiz, ".xonecode", "artefactos"), { recursive: true });
  return raiz;
}

/**
 * Medido en la prueba grande de la calculadora (30-10-2026): el device-controller copió con `cp` la colección al proyecto
 * y dejó un `Menu.xne.bak`, saltándose la aprobación. Lo que la shell cambia en el proyecto se deshace.
 */
describe("la shell no escribe el proyecto", () => {
  it("lo que una orden cambia, crea o borra en el proyecto se DESHACE; lo de .xonecode/ se queda", () => {
    const raiz = proyecto();
    const g = crearGuardaDelProyecto(raiz);
    g.empezar();
    // Lo que haría la orden.
    writeFileSync(join(raiz, "Menu.xne"), "<coll name=\"Menu\">CAMBIADO</coll>\n");
    writeFileSync(join(raiz, "Menu.xne.bak"), "copia");
    rmSync(join(raiz, "estilo.css"));
    mkdirSync(join(raiz, "nueva", "honda"), { recursive: true });
    writeFileSync(join(raiz, "nueva", "honda", "Calc.xne"), "<coll/>");
    writeFileSync(join(raiz, ".xonecode", "artefactos", "captura.png"), "png");
    const c = g.terminar();
    expect(c).toEqual({ deshechos: ["Menu.xne", "Menu.xne.bak", "estilo.css", "nueva/honda/Calc.xne"], sinDeshacer: [] });
    expect(readFileSync(join(raiz, "Menu.xne"), "utf8")).toBe("<coll name=\"Menu\"/>\n");
    expect(readFileSync(join(raiz, "estilo.css"), "utf8")).toBe("a{}\n");
    expect(existsSync(join(raiz, "Menu.xne.bak"))).toBe(false);
    expect(existsSync(join(raiz, "nueva"))).toBe(false);
    expect(readFileSync(join(raiz, ".xonecode", "artefactos", "captura.png"), "utf8")).toBe("png");
  });

  it("lo escrito ENTRE órdenes es estado bueno; una orden que no toca nada no dice nada", () => {
    const raiz = proyecto();
    const g = crearGuardaDelProyecto(raiz);
    g.empezar();
    expect(g.terminar()).toEqual({ deshechos: [], sinDeshacer: [] });
    writeFileSync(join(raiz, "Menu.xne"), "<coll name=\"Menu\">del desarrollador</coll>\n");
    g.empezar();
    expect(g.terminar()).toEqual({ deshechos: [], sinDeshacer: [] });
    expect(readFileSync(join(raiz, "Menu.xne"), "utf8")).toContain("del desarrollador");
  });

  it("una escritura ANOTADA mientras corre una orden no se deshace; lo que la orden cambió, sí", () => {
    const raiz = proyecto();
    const g = crearGuardaDelProyecto(raiz);
    g.empezar();
    writeFileSync(join(raiz, "Menu.xne"), "<coll name=\"Menu\">del desarrollador</coll>\n");
    g.anotar("/Menu.xne");
    writeFileSync(join(raiz, "estilo.css"), "b{}\n");
    expect(g.terminar().deshechos).toEqual(["estilo.css"]);
    expect(readFileSync(join(raiz, "Menu.xne"), "utf8")).toContain("del desarrollador");
  });

  it("con DOS órdenes en vuelo, la segunda no da por bueno lo que cambió la primera", () => {
    const raiz = proyecto();
    const g = crearGuardaDelProyecto(raiz);
    g.empezar();
    writeFileSync(join(raiz, "Menu.xne"), "de la primera orden");
    g.empezar();
    g.terminar();
    expect(readFileSync(join(raiz, "Menu.xne"), "utf8")).toBe("<coll name=\"Menu\"/>\n");
  });

  it("la orden envuelta devuelve lo deshecho en su salida, con un código distinto de 0", async () => {
    const raiz = proyecto();
    const backend = {
      execute: async (c: string) => {
        if (c === "cp") writeFileSync(join(raiz, "Menu.xne"), "copiado");
        return { output: "hecho", exitCode: 0 };
      },
    };
    const shell = conGuardaDelProyecto(backend, crearGuardaDelProyecto(raiz));
    expect(await shell.execute("ls")).toEqual({ output: "hecho", exitCode: 0 });
    const r = (await shell.execute("cp")) as { output: string; exitCode: number };
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("Se han DESHECHO: /Menu.xne");
    expect(r.output).toContain("developer-xone");
    expect(readFileSync(join(raiz, "Menu.xne"), "utf8")).toBe("<coll name=\"Menu\"/>\n");
  });

  it("las escrituras del backend de los agentes se anotan solas", async () => {
    const raiz = proyecto();
    const g = crearGuardaDelProyecto(raiz);
    const backend = conEscriturasAnotadas(
      { write: async (r: string, t: string) => writeFileSync(join(raiz, r), t), edit: async () => ({}) },
      g
    );
    g.empezar();
    await backend.write("/Menu.xne", "escrito con write_file");
    expect(g.terminar().deshechos).toEqual([]);
  });

  it("sin cambios el texto es vacío", () => {
    expect(textoDeCambiosDeshechos({ deshechos: [], sinDeshacer: [] })).toBe("");
  });
});
