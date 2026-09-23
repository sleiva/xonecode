import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backendDeAgente } from "../../grafo/proyecto.js";
import { permisosDe } from "../../grafo/perfiles.js";
import { decidirAccesoDeRuta, fuenteDeFicheros, type BackendDeFicheros } from "./toolsDeFichero.js";

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
