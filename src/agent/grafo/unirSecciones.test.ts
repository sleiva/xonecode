import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearUnirSecciones, documentoDeCarpeta } from "./unirSecciones.js";
import type { QuienDecidePermisos } from "./perfiles.js";

function escenario(perfil: Partial<QuienDecidePermisos> = {}) {
  const raiz = join(mkdtempSync(join(tmpdir(), "unir-secciones-")), "proyecto");
  mkdirSync(join(raiz, "doc", "manual-usuario"), { recursive: true });
  const tool = crearUnirSecciones({
    raiz,
    perfil: { nombre: "document-writer", soloLectura: false, escribeEn: ["/doc/"], ...perfil },
  });
  const unir = (carpeta: string): Promise<string> => (tool as unknown as { invoke: (x: unknown) => Promise<string> }).invoke({ carpeta });
  const seccion = (nombre: string, texto: string) => writeFileSync(join(raiz, "doc", "manual-usuario", nombre), texto);
  return { raiz, unir, seccion };
}

describe("unir_secciones", () => {
  it("une las secciones en el orden de su nombre —el 2 antes que el 10— y el documento queda al lado", async () => {
    const { raiz, unir, seccion } = escenario();
    seccion("10-faq.md", "## FAQ\n");
    seccion("02-acceso.md", "## Acceso\n\n");
    seccion("01-portada.md", "# Manual\n");
    const dicho = await unir("/doc/manual-usuario/");
    expect(readFileSync(join(raiz, "doc", "manual-usuario.md"), "utf8")).toBe("# Manual\n\n## Acceso\n\n## FAQ\n");
    expect(dicho).toMatch(/Unidas 3 secciones en \/doc\/manual-usuario\.md/);
  });

  it("NO devuelve el documento: es el ahorro entero", async () => {
    const { unir, seccion } = escenario();
    seccion("01-secreto-largo.md", "TEXTO-QUE-NO-DEBE-VOLVER ".repeat(50));
    expect(await unir("/doc/manual-usuario")).not.toContain("TEXTO-QUE-NO-DEBE-VOLVER");
  });

  it("el destino SALE de la carpeta, no se elige", () => {
    expect(documentoDeCarpeta("/doc/manual-tecnico/")).toBe("/doc/manual-tecnico.md");
    expect(documentoDeCarpeta("/doc/manual-tecnico")).toBe("/doc/manual-tecnico.md");
  });

  it("fuera de sus carpetas abiertas, NO: los permisos de quien llama, reaplicados", async () => {
    const { raiz, unir } = escenario();
    mkdirSync(join(raiz, "src", "trozos"), { recursive: true });
    writeFileSync(join(raiz, "src", "trozos", "01.md"), "x");
    expect(await unir("/src/trozos/")).toMatch(/No puedes escribir «\/src\/trozos\.md»\. Puedes escribir en: \/doc\//);
    expect(existsSync(join(raiz, "src", "trozos.md"))).toBe(false);
    expect(await unir("/.xonecode/")).toMatch(/No puedes/);
  });

  it("ni subcarpetas ni enlaces: solo los `.md` de la propia carpeta", async () => {
    const { raiz, unir, seccion } = escenario();
    seccion("01-a.md", "A");
    mkdirSync(join(raiz, "doc", "manual-usuario", "img"));
    writeFileSync(join(raiz, "doc", "manual-usuario", "img", "no.md"), "SUBCARPETA");
    const fuera = join(raiz, "..", "fuera.md");
    writeFileSync(fuera, "DE-FUERA");
    symlinkSync(fuera, join(raiz, "doc", "manual-usuario", "02-enlace.md"));
    writeFileSync(join(raiz, "doc", "manual-usuario", "notas.txt"), "NO-ES-MD");
    await unir("/doc/manual-usuario/");
    expect(readFileSync(join(raiz, "doc", "manual-usuario.md"), "utf8")).toBe("A\n");
  });

  it("una carpeta que no existe, o sin secciones, se DICE", async () => {
    const { unir } = escenario();
    expect(await unir("/doc/no-existe/")).toMatch(/No existe la carpeta/);
    expect(await unir("/doc/manual-usuario/")).toMatch(/no tiene ninguna sección/);
    expect(await unir("/")).toMatch(/no la raíz/);
  });
});

describe("lo que huele a sección vieja", () => {
  it("una sección VACÍA no entra y se nombra; así se retira una, sin tool de borrar", async () => {
    const { raiz, unir, seccion } = escenario();
    seccion("01-a.md", "A");
    seccion("02-vieja.md", "");
    seccion("03-c.md", "C");
    const dicho = await unir("/doc/manual-usuario/");
    expect(readFileSync(join(raiz, "doc", "manual-usuario.md"), "utf8")).toBe("A\n\nC\n");
    expect(dicho).toMatch(/Unidas 2 secciones/);
    expect(dicho).toMatch(/Saltadas por vacías: 02-vieja\.md\./);
  });

  it("dos secciones con el MISMO número se avisan, con qué hacer", async () => {
    // Medido en un manual real, tras rehacerse media estructura.
    const { unir, seccion } = escenario();
    seccion("06-basico.md", "viejo");
    seccion("06-categoria-basico.md", "nuevo");
    seccion("07-contents.md", "x");
    const dicho = await unir("/doc/manual-usuario/");
    expect(dicho).toMatch(/⚠ Números repetidos: 06 \(06-basico\.md, 06-categoria-basico\.md\)\. Si una de ellas sobra, VACÍALA/);
  });

  it("sin repetidos ni vacías, no dice nada de más", async () => {
    const { unir, seccion } = escenario();
    seccion("01-a.md", "A");
    seccion("02-b.md", "B");
    const dicho = await unir("/doc/manual-usuario/");
    expect(dicho).not.toMatch(/vacías|repetidos/);
  });
});
