import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearIncorporarAdjunto, recibeIncorporarAdjunto, NOMBRE_INCORPORAR_ADJUNTO } from "./incorporarAdjunto.js";
import { seDetieneEn } from "./perfiles.js";
import { AGENTES_DE_SERIE } from "../subagentes/agentesEnDisco.js";

/** Un «PNG» con CEROS: lo que no sobrevive a una tool de texto. Si la copia lo toca, `equals` lo dice. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1]);
const DEV = AGENTES_DE_SERIE.find((a) => a.nombre === "developer-xone")!;

function escenario() {
  const base = mkdtempSync(join(tmpdir(), "incorporar-adj-"));
  const raiz = join(base, "proyecto");
  const carpetaDeAdjuntos = join(base, "adjuntos");
  mkdirSync(raiz, { recursive: true });
  mkdirSync(carpetaDeAdjuntos, { recursive: true });
  writeFileSync(join(raiz, "app.xml"), "<app/>");
  writeFileSync(join(carpetaDeAdjuntos, "ic.png"), PNG);
  const tool = crearIncorporarAdjunto({ raiz, carpetaDeAdjuntos, perfil: DEV });
  const incorporar = (adjunto: string, file_path: string): Promise<string> =>
    (tool as unknown as { invoke: (x: unknown) => Promise<string> }).invoke({ adjunto, file_path });
  /** Lo que hay en la base entera: para comprobar que un rechazo no dejó NADA en ningún sitio. */
  const arbol = (): string[] => readdirSync(base, { recursive: true }).map(String).sort();
  return { base, raiz, carpetaDeAdjuntos, incorporar, arbol };
}

describe("incorporar_adjunto — copia los BYTES", () => {
  it("copia exacto a file_path, creando las carpetas, y dice ruta y bytes", async () => {
    const { raiz, incorporar } = escenario();
    const r = await incorporar("/adjuntos/ic.png", "/icons/menu/ic_add.png");
    expect(readFileSync(join(raiz, "icons", "menu", "ic_add.png")).equals(PNG)).toBe(true);
    expect(r).toContain("/icons/menu/ic_add.png");
    expect(r).toContain(`${PNG.length} bytes`);
    expect(r).not.toContain(raiz);
  });

  it("acepta el nombre a secas y REEMPLAZA un fichero que ya existe (lo dice la tarjeta)", async () => {
    const { raiz, incorporar } = escenario();
    mkdirSync(join(raiz, "icons"));
    writeFileSync(join(raiz, "icons", "ic.png"), "viejo");
    await incorporar("ic.png", "icons/ic.png");
    expect(readFileSync(join(raiz, "icons", "ic.png")).equals(PNG)).toBe(true);
  });

  it("se llama como dicen el HITL y la tarjeta", () => {
    expect(crearIncorporarAdjunto({ raiz: "/x", carpetaDeAdjuntos: "/y", perfil: DEV }).name).toBe(NOMBRE_INCORPORAR_ADJUNTO);
  });
});

describe("incorporar_adjunto — rechaza, DEVUELVE el motivo y no crea nada", () => {
  const casos: [string, string, string][] = [
    ["origen fuera de /adjuntos/ (..)", "/adjuntos/../proyecto/app.xml", "/icons/x.png"],
    ["origen con barra dentro", "/adjuntos/sub/ic.png", "/icons/x.png"],
    ["origen que no es un nombre aceptable", "/adjuntos/.", "/icons/x.png"],
    ["adjunto inexistente", "/adjuntos/no.png", "/icons/x.png"],
    ["destino .env (puedeEscribirRuta)", "ic.png", "/.env"],
    ["destino .git", "ic.png", "/.git/hooks/pre-commit"],
    ["destino .xonecode", "ic.png", "/.xonecode/sesiones/x/ic.png"],
    ["destino /skills/", "ic.png", "/skills/mia/ic.png"],
    ["destino artefacto mal puesto", "ic.png", "/artifacts/ic.png"],
    ["destino /artifact.html", "ic.png", "/artifact.html"],
    ["destino /artefactos/", "ic.png", "/artefactos/ic.png"],
    ["destino /planes/", "ic.png", "/planes/p/ic.png"],
    ["destino /adjuntos/", "ic.png", "/adjuntos/otro.png"],
    ["destino /Adjuntos/ (APFS)", "ic.png", "/Adjuntos/otro.png"],
    ["destino /hotswap/", "ic.png", "/hotswap/ic.png"],
    ["destino /large_tool_results/", "ic.png", "/large_tool_results/ic.png"],
    ["destino /MEMORIA_PROYECTO.md", "ic.png", "/MEMORIA_PROYECTO.md"],
    ["destino con ..", "ic.png", "/icons/../../fuera.png"],
    ["destino carpeta", "ic.png", "/icons/"],
  ];
  for (const [que, adjunto, destino] of casos) {
    it(que, async () => {
      const { incorporar, arbol } = escenario();
      const antes = arbol();
      const r = await incorporar(adjunto, destino);
      expect(typeof r).toBe("string");
      expect(r).not.toMatch(/^Incorporado/);
      expect(arbol()).toEqual(antes);
    });
  }

  it("la carpeta de adjuntos que aún no existe es «no existe», no una excepción", async () => {
    const base = mkdtempSync(join(tmpdir(), "incorporar-adj-"));
    const tool = crearIncorporarAdjunto({ raiz: base, carpetaDeAdjuntos: join(base, "nada"), perfil: DEV });
    const r = await (tool as unknown as { invoke: (x: unknown) => Promise<string> }).invoke({ adjunto: "ic.png", file_path: "/icons/ic.png" });
    expect(r).toContain("No existe el adjunto");
    expect(existsSync(join(base, "icons"))).toBe(false);
  });

  it("una vista APLANADA (X.xml con su X.xne) no se pisa", async () => {
    const { raiz, incorporar } = escenario();
    writeFileSync(join(raiz, "menu.xne"), "<coll/>");
    const r = await incorporar("ic.png", "/menu.xml");
    expect(r).toContain("APLANADA");
    expect(existsSync(join(raiz, "menu.xml"))).toBe(false);
  });

  it("un enlace en la CARPETA destino que sale del proyecto: rechazo, y nada creado fuera", async () => {
    const { base, raiz, incorporar } = escenario();
    const fuera = join(base, "fuera");
    mkdirSync(fuera);
    symlinkSync(fuera, join(raiz, "icons"));
    const r = await incorporar("ic.png", "/icons/sub/ic.png");
    expect(r).toContain("fuera del proyecto");
    expect(readdirSync(fuera)).toEqual([]);
  });

  it("un enlace en la carpeta destino que va a .xonecode/: el camino real se vuelve a juzgar", async () => {
    const { raiz, incorporar } = escenario();
    mkdirSync(join(raiz, ".xonecode"));
    symlinkSync(join(raiz, ".xonecode"), join(raiz, "icons"));
    const r = await incorporar("ic.png", "/icons/ic.png");
    expect(r).not.toMatch(/^Incorporado/);
    expect(readdirSync(join(raiz, ".xonecode"))).toEqual([]);
  });

  it("un enlace en el FICHERO destino (copyFileSync lo seguiría): rechazo, el de fuera intacto", async () => {
    const { base, raiz, incorporar } = escenario();
    const victima = join(base, "victima.txt");
    writeFileSync(victima, "intacto");
    mkdirSync(join(raiz, "icons"));
    symlinkSync(victima, join(raiz, "icons", "ic.png"));
    const r = await incorporar("ic.png", "/icons/ic.png");
    expect(r).not.toMatch(/^Incorporado/);
    expect(readFileSync(victima, "utf8")).toBe("intacto");
  });

  it("un enlace en el fichero destino, aunque apunte DENTRO del proyecto: no se sigue", async () => {
    // La tarjeta diría «/icons/ic.png» y se reescribiría `app.xml`: aprobar una ruta y escribir
    // otra. Con el realpath dentro de la raíz, lo único que lo para es el `lstat`.
    const { raiz, incorporar } = escenario();
    mkdirSync(join(raiz, "icons"));
    symlinkSync(join(raiz, "app.xml"), join(raiz, "icons", "ic.png"));
    const r = await incorporar("ic.png", "/icons/ic.png");
    expect(r).not.toMatch(/^Incorporado/);
    expect(readFileSync(join(raiz, "app.xml"), "utf8")).toBe("<app/>");
  });

  it("un ADJUNTO que es un enlace hacia fuera de su carpeta no se copia", async () => {
    const { base, raiz, carpetaDeAdjuntos, incorporar } = escenario();
    writeFileSync(join(base, "secreto.txt"), "clave");
    symlinkSync(join(base, "secreto.txt"), join(carpetaDeAdjuntos, "trampa.txt"));
    const r = await incorporar("trampa.txt", "/doc/trampa.txt");
    expect(r).not.toMatch(/^Incorporado/);
    expect(existsSync(join(raiz, "doc"))).toBe(false);
  });

  it("un mensaje de error no lleva la ruta de la máquina", async () => {
    const { raiz, carpetaDeAdjuntos, incorporar } = escenario();
    for (const [a, d] of [["no.png", "/x.png"], ["ic.png", "/.env"], ["ic.png", "/icons/"]] as const) {
      const r = await incorporar(a, d);
      expect(r).not.toContain(raiz);
      expect(r).not.toContain(carpetaDeAdjuntos);
    }
  });
});

/**
 * Lo que sostiene a `seDetieneEn`: por `/artefactos/`, `/planes/` y un artefacto mal puesto NO
 * se pregunta —ni en deepagents (`when: false`) ni en TrueForge (se aprueba sin anotar)—, así
 * que para esta tool la ÚNICA barrera en esas rutas es su propio rechazo. Si un día la tool
 * aceptara una de ellas, escribiría en el proyecto sin que nadie lo aprobara.
 */
describe("donde no se pregunta, la tool rechaza", () => {
  const rutas = ["/artefactos/a.png", "/planes/p/a.png", "/artifacts/a.png", "/Artifacts/a.png", "/artifact.html", "/icons/a.png", "/a.png"];
  for (const ruta of rutas) {
    it(ruta, async () => {
      const { incorporar, arbol } = escenario();
      if (seDetieneEn({ toolCall: { args: { adjunto: "ic.png", file_path: ruta } } })) return;
      const antes = arbol();
      expect(await incorporar("ic.png", ruta)).not.toMatch(/^Incorporado/);
      expect(arbol()).toEqual(antes);
    });
  }
});

describe("quién la recibe", () => {
  it("de los de serie, exactamente designer-xone y developer-xone", () => {
    const reciben = AGENTES_DE_SERIE.filter(recibeIncorporarAdjunto).map((a) => a.nombre).sort();
    expect(reciben).toEqual(["designer-xone", "developer-xone"]);
  });

  it("es regla de DATO: solo lectura, ejecución o `escribeEn` la quitan", () => {
    const base = { soloLectura: false, escribeEn: [] as string[] };
    expect(recibeIncorporarAdjunto(base)).toBe(true);
    expect(recibeIncorporarAdjunto({ ...base, soloLectura: true })).toBe(false);
    expect(recibeIncorporarAdjunto({ ...base, ejecucion: true })).toBe(false);
    expect(recibeIncorporarAdjunto({ ...base, escribeEn: ["/doc/"] })).toBe(false);
  });
});
