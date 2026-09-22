import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backendDeAgente } from "./proyecto.js";

const temporales: string[] = [];
function proyecto(): string {
  const d = mkdtempSync(join(tmpdir(), "xonecode-disco-"));
  temporales.push(d);
  writeFileSync(join(d, "app.xml"), "<xml/>");
  return d;
}
afterEach(() => {
  for (const d of temporales.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("/disco/: la máquina, de solo lectura", () => {
  it("lee un fichero de FUERA del proyecto", async () => {
    const raiz = proyecto();
    const fuera = mkdtempSync(join(tmpdir(), "xonecode-fuera-"));
    temporales.push(fuera);
    writeFileSync(join(fuera, "diseno.txt"), "la maqueta");

    const b = backendDeAgente({ raiz, ficheros: new Set() }) as never as {
      read(p: string): Promise<{ content?: string; error?: string }>;
    };

    expect((await b.read(`/disco${join(fuera, "diseno.txt")}`)).content).toBe("la maqueta");
  });

  /** Y sin estorbar a lo de siempre: el proyecto se sigue leyendo por su ruta de siempre. */
  it("no cambia cómo se lee el proyecto", async () => {
    const raiz = proyecto();
    const b = backendDeAgente({ raiz, ficheros: new Set() }) as never as {
      read(p: string): Promise<{ content?: string }>;
    };
    expect((await b.read("/app.xml")).content).toBe("<xml/>");
  });

  /**
   * **El caso que lo motivó.** Una ruta de máquina escrita a pelo se resolvía DENTRO del
   * proyecto y contestaba «no such file or directory» sobre un fichero que sí existe, así que
   * el orquestador concluyó que estaba enjaulado y delegó en el agente con shell.
   */
  it("una ruta absoluta a pelo se contesta con la buena ya escrita", async () => {
    const raiz = proyecto();
    const b = backendDeAgente({ raiz, ficheros: new Set() }) as never as {
      read(p: string): Promise<{ error?: string }>;
    };

    const { error } = await b.read("/Users/alguien/Downloads/d.zip");

    expect(error).toContain("/disco/Users/alguien/Downloads/d.zip");
    expect(error).not.toMatch(/no such file|ENOENT/i);
    // Y no filtra la raíz del proyecto, que es lo que el ENOENT de Node sí llevaba.
    expect(error).not.toContain(raiz);
  });

  /**
   * **LA REGRESIÓN QUE HAY QUE VIGILAR, y fue real.** El «solo lectura» de `permisosDe` lo
   * aplica el middleware de TOOLS, y el agente con `ejecucion` NO lo recibe —deepagents lanza
   * si se combinan `permissions` con un backend ejecutable—. Medido antes de arreglarlo: un
   * `write` a `/disco/tmp/…` creaba el fichero en la máquina de verdad. Por eso la guarda
   * está también en el backend, con lista BLANCA de operación.
   */
  it("NO se escribe, ni siquiera con el perfil que ejecuta comandos", async () => {
    const raiz = proyecto();
    const fuera = mkdtempSync(join(tmpdir(), "xonecode-fuera-"));
    temporales.push(fuera);
    const destino = join(fuera, "colado.txt");

    const b = backendDeAgente({ raiz, ficheros: new Set(), ejecucion: { entorno: {} } }) as never as {
      write(p: string, c: string): Promise<{ error?: string }>;
    };

    const { error } = await b.write(`/disco${destino}`, "x");

    expect(error).toMatch(/SOLO LECTURA/i);
    expect(existsSync(destino)).toBe(false);
  });

  it("tampoco se edita", async () => {
    const raiz = proyecto();
    const fuera = mkdtempSync(join(tmpdir(), "xonecode-fuera-"));
    temporales.push(fuera);
    writeFileSync(join(fuera, "suyo.txt"), "original");

    const b = backendDeAgente({ raiz, ficheros: new Set(), ejecucion: { entorno: {} } }) as never as {
      edit(p: string, a: string, n: string): Promise<{ error?: string }>;
    };

    expect((await b.edit(`/disco${join(fuera, "suyo.txt")}`, "original", "tocado")).error).toMatch(/SOLO LECTURA/i);
  });

  /** Las dos excepciones del harness, por la puerta nueva. */
  it("ni por aquí se leen las credenciales ni un .xonecode", async () => {
    const raiz = proyecto();
    const casa = mkdtempSync(join(tmpdir(), "xonecode-casa-"));
    temporales.push(casa);
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(join(casa, ".xonecode", "auth.json"), '{"clave":"secreta"}');

    const b = backendDeAgente({ raiz, ficheros: new Set() }) as never as {
      read(p: string): Promise<{ content?: string; error?: string }>;
    };

    const r = await b.read(`/disco${join(casa, ".xonecode", "auth.json")}`);
    expect(r.content).toBeUndefined();
    expect(r.error).toMatch(/\.xonecode|credenciales/i);
  });
});
