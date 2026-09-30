import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backendDeAgente } from "../../grafo/proyecto.js";
import { permisosDe } from "../../grafo/perfiles.js";
import { CARACTERES_POR_LECTURA, decidirAccesoDeRuta, fuenteDeEjecucion, fuenteDeFicheros, lecturaAcotada, normalizarRuta, seReescribeConEdit, type BackendDeFicheros } from "./toolsDeFichero.js";

/**
 * Contra el backend REAL, con toda su pila de guardas: lo que se prueba es que las tools de
 * TrueForge heredan esas guardas por delegar en él, y que las de `permisosDe` —que en deepagents
 * son middleware y aquí nadie aplicaría— se evalúan igual.
 */
function proyecto() {
  const raiz = mkdtempSync(join(tmpdir(), "xc-tf-tools-"));
  writeFileSync(join(raiz, "app.xml"), "<app>\n  <coll/>\n</app>\n");
  writeFileSync(join(raiz, "Clientes.xne"), "<coll name=\"Clientes\"/>\n");
  writeFileSync(join(raiz, "Clientes.xml"), "<vista-aplanada/>\n");
  writeFileSync(join(raiz, ".env"), "CLAVE=secreta\n");
  mkdirSync(join(raiz, ".xonecode"), { recursive: true });
  const ficheros = new Set(["/app.xml", "/Clientes.xne", "/Clientes.xml"]);
  // Sin validar contra el linter: aquí se prueba la guarda de rutas, no el contenido.
  const backend = backendDeAgente({ raiz, ficheros, validar: async () => undefined }) as unknown as BackendDeFicheros;
  const fuente = fuenteDeFicheros({ backend, reglas: permisosDe({ nombre: "raiz", soloLectura: false }) });
  const llamar = async (name: string, args: Record<string, unknown>) => {
    // La forma de TrueForge: el resultado MCP va dentro de `result`.
    const r = (await fuente.callTool({ name, arguments: args })) as unknown as { result: { content: { text: string }[]; isError?: boolean } };
    return { texto: r.result.content.map((c) => c.text).join(""), error: r.result.isError === true };
  };
  return { raiz, llamar };
}

describe("las tools de fichero de TrueForge, sobre el backend real", () => {
  it("una IMAGEN no se lee como texto: la respuesta trae la llamada a describe_image ya escrita (IXCODE-23)", async () => {
    const { raiz, llamar } = proyecto();
    mkdirSync(join(raiz, "icons"));
    writeFileSync(join(raiz, "icons", "nuevo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]));
    const r = await llamar("read_file", { file_path: "/icons/nuevo.png" });
    expect(r.error).toBe(true);
    expect(r.texto).toContain('describe_image({"ruta": "/icons/nuevo.png"})');
  });

  it("read_file numera como deepagents", async () => {
    const { llamar } = proyecto();
    const r = await llamar("read_file", { file_path: "/app.xml" });
    expect(r.error).toBe(false);
    expect(r.texto).toBe("     1\t<app>\n     2\t  <coll/>\n     3\t</app>");
  });

  it("`/.env` y `/.xonecode` se DENIEGAN aunque el backend los leería: son las reglas de permisosDe", async () => {
    const { llamar } = proyecto();
    expect(await llamar("read_file", { file_path: "/.env" })).toMatchObject({ error: true });
    expect((await llamar("read_file", { file_path: "/.env" })).texto).not.toContain("secreta");
    expect(await llamar("write_file", { file_path: "/.xonecode/x.md", content: "x" })).toMatchObject({ error: true });
    expect(await llamar("write_file", { file_path: "/skills/pwn.md", content: "x" })).toMatchObject({ error: true });
  });

  it("la vista aplanada NO se puede tocar: esa guarda viene gratis del backend", async () => {
    const { raiz, llamar } = proyecto();
    const r = await llamar("write_file", { file_path: "/Clientes.xml", content: "<pisado/>" });
    expect(r.error).toBe(true);
    expect(readFileSync(join(raiz, "Clientes.xml"), "utf8")).toBe("<vista-aplanada/>\n");
  });

  it("escribir y editar un fichero del proyecto funciona, y deja el disco como toca", async () => {
    const { raiz, llamar } = proyecto();
    expect(await llamar("write_file", { file_path: "/nuevo.js", content: "var a = 1;\n" })).toMatchObject({ error: false });
    expect(await llamar("edit_file", { file_path: "/nuevo.js", old_string: "1", new_string: "2" })).toMatchObject({ error: false });
    expect(readFileSync(join(raiz, "nuevo.js"), "utf8")).toBe("var a = 2;\n");
  });

  it("`write_file` NO reescribe un .xne/.js/.css que ya existe: devuelve el error con el camino (edit_file) y el disco no cambia", async () => {
    const { raiz, llamar } = proyecto();
    const r = await llamar("write_file", { file_path: "/Clientes.xne", content: "<coll/>\n" });
    expect(r.error).toBe(true);
    expect(r.texto).toContain("Cámbialo con edit_file");
    expect(readFileSync(join(raiz, "Clientes.xne"), "utf8")).toBe("<coll name=\"Clientes\"/>\n");
    // Editarlo sí.
    expect(await llamar("edit_file", { file_path: "/Clientes.xne", old_string: "Clientes", new_string: "Socios" })).toMatchObject({ error: false });
  });

  it("lo que no es código, o no es del proyecto, se sigue regenerando entero", async () => {
    const { raiz, llamar } = proyecto();
    writeFileSync(join(raiz, "fondo.svg"), "<svg/>\n");
    expect(await llamar("write_file", { file_path: "/fondo.svg", content: "<svg><rect/></svg>\n" })).toMatchObject({ error: false });
    expect(seReescribeConEdit("/planes/demo/app.js")).toBe(false);
    expect(seReescribeConEdit("/artefactos/panel.css")).toBe(false);
    expect(seReescribeConEdit("/default.css")).toBe(true);
    expect(seReescribeConEdit("/js/functions.JS")).toBe(true);
  });

  it("`read_file` sin límite devuelve el fichero entero, no las 100 primeras líneas", async () => {
    const { raiz, llamar } = proyecto();
    writeFileSync(join(raiz, "largo.js"), Array.from({ length: 450 }, (_, i) => `var l${i} = ${i};`).join("\n") + "\n");
    const r = await llamar("read_file", { file_path: "/largo.js" });
    expect(r.texto).toContain("   450\tvar l449 = 449;");
  });

  it("un TASKS.md de un plan sin casillas NO se escribe: vuelve el motivo con el formato", async () => {
    const { raiz, llamar } = proyecto();
    const r = await llamar("write_file", { file_path: "/planes/demo/TASKS.md", content: "### 01 — Uno\n- el display dice 14\n" });
    expect(r.error).toBe(true);
    expect(r.texto).toContain("`- [ ] criterio comprobable`");
    expect(existsSync(join(raiz, ".xonecode", "planes", "demo", "TASKS.md"))).toBe(false);
    expect(await llamar("write_file", { file_path: "/planes/demo/TASKS.md", content: "### 01 — Uno\n- [ ] el display dice 14\n" })).toMatchObject({ error: false });
  });

  it("un rechazo se DEVUELVE como error y no se lanza", async () => {
    const { llamar } = proyecto();
    await expect(llamar("edit_file", { file_path: "/app.xml", old_string: "no-está", new_string: "x" })).resolves.toMatchObject({ error: true });
  });
});

describe("decidirAccesoDeRuta: la semántica de deepagents", () => {
  it("la primera regla que casa decide, y sin ninguna se permite", () => {
    const reglas = [
      { operations: ["read" as const], paths: ["/secreto/**"], mode: "deny" as const },
      { operations: ["read" as const], paths: ["/secreto/**"], mode: "allow" as const },
    ];
    expect(decidirAccesoDeRuta(reglas, "read", "/secreto/a")).toBe("deny");
    expect(decidirAccesoDeRuta(reglas, "read", "/otro")).toBe("allow");
    expect(decidirAccesoDeRuta(reglas, "write", "/secreto/a")).toBe("allow");
  });

  it("con las reglas de SOLO LECTURA, escribir el proyecto se deniega", () => {
    const reglas = permisosDe({ nombre: "consultor", soloLectura: true });
    expect(decidirAccesoDeRuta(reglas, "write", "/app.xml")).toBe("deny");
    expect(decidirAccesoDeRuta(reglas, "read", "/app.xml")).toBe("allow");
  });
});


describe("las rutas que escribe el modelo, normalizadas", () => {
  it("vacía o `.` es la raíz; lo relativo cuelga de ella; `..` no es del proyecto", () => {
    expect(normalizarRuta(".")).toBe("/");
    expect(normalizarRuta("")).toBe("/");
    expect(normalizarRuta("MEMORIA_PROYECTO.md")).toBe("/MEMORIA_PROYECTO.md");
    expect(normalizarRuta("./doc/")).toBe("/doc");
    expect(normalizarRuta("/app.xml")).toBe("/app.xml");
    expect(normalizarRuta("../fuera")).toBeUndefined();
  });

  it("MEDIDO en la primera sesión real: `ls .` y una ruta sin barra ya funcionan", async () => {
    const { llamar } = proyecto();
    expect((await llamar("ls", { path: "." })).texto).toContain("app.xml");
    expect(await llamar("read_file", { file_path: "app.xml" })).toMatchObject({ error: false });
  });

  it("y una ruta sin barra NO se cuela por las reglas: `.env` casa con `/.env` tras normalizar", async () => {
    const { llamar } = proyecto();
    const r = await llamar("read_file", { file_path: ".env" });
    expect(r.error).toBe(true);
    expect(r.texto).not.toContain("secreta");
  });
});

describe("lo que TrueForge le dice al modelo sobre escribir en paralelo", () => {
  /**
   * La cola por ruta hace que dos escrituras al mismo fichero no se pisen; esto es la otra mitad:
   * que el modelo no las pida a la vez. Medido: DeepSeek pidió cinco ediciones del mismo HTML en
   * una respuesta. Se mira en `listTools`, que es lo que TrueForge le entrega al modelo.
   */
  it("`write_file` y `edit_file` lo dicen; las de lectura, no", async () => {
    const fuente = fuenteDeFicheros({ backend: {} as never, reglas: permisosDe({ nombre: "raiz", soloLectura: false }) });
    const { result } = (await fuente.listTools()) as unknown as { result: { tools: { name: string; description: string }[] } };
    const de = (n: string) => result.tools.find((t) => t.name === n)!.description;
    for (const n of ["write_file", "edit_file"]) {
      expect(de(n), n).toContain("MISMO fichero NO las pidas a la vez");
      expect(de(n), n).toContain("ficheros DISTINTOS");
    }
    expect(de("read_file")).not.toContain("MISMO fichero");
  });
});


describe("una lectura que no cabe se corta por una LÍNEA y dice por dónde seguir", () => {
  it("con el tope, el offset siguiente es la primera línea que no entró", () => {
    const contenido = Array.from({ length: 10 }, (_, i) => `linea-${i + 1}`).join("\n");
    const texto = lecturaAcotada(contenido, 1, 40);
    expect(texto.split("\n").at(-1)).toMatch(/sigue con offset=\d+/);
    const n = Number(/offset=(\d+)/.exec(texto)![1]);
    // La última línea que entró es la n (1-based), así que se sigue en offset=n.
    expect(texto).toContain(`\t${"linea-" + n}`);
    expect(texto).not.toContain(`linea-${n + 1}`);
  });

  it("lo que cabe va entero y sin aviso", () => {
    expect(lecturaAcotada("a\nb\n", 1)).toBe("     1\ta\n     2\tb");
    expect(CARACTERES_POR_LECTURA).toBe(50_000);
  });
});

describe("execute no recorre el disco entero", () => {
  it("un `find /` vuelve como error con el camino bueno y NO llega a la shell", async () => {
    let corrio = false;
    const fuente = fuenteDeEjecucion({ execute: () => { corrio = true; return { output: "", exitCode: 0 }; }, write: () => ({}) });
    const r = (await fuente.callTool({ name: "execute", arguments: { command: 'find / -name "xone-validate*"' } })) as unknown as { result: { content: { text: string }[]; isError?: boolean } };
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0]!.text).toContain("recorre el disco entero");
    expect(corrio).toBe(false);
  });
});
