import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leerArtefactoDeSesion, leerArtefactoCrudo, TOPE_DE_ARTEFACTO } from "./artefactosEnDisco.js";

const SESION = "11111111-2222-3333-4444-555555555555";

describe("los artefactos de una sesión, leídos de disco", () => {
  let raiz: string;
  let carpeta: string;

  beforeEach(() => {
    raiz = mkdtempSync(join(tmpdir(), "xonecode-artefactos-"));
    carpeta = join(raiz, ".xonecode", "sesiones", SESION, "artefactos");
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, "diagrama.html"), "<!doctype html><p>hola</p>");
    // Un secreto FUERA de la carpeta, para que los intentos de fuga tengan algo que robar.
    writeFileSync(join(raiz, ".xonecode", "auth.json"), '{"clave":"secreto"}');
  });

  afterEach(() => rmSync(raiz, { recursive: true, force: true }));

  it("lee el HTML con su mime y devuelve la ruta VIRTUAL, no la del disco", async () => {
    const leido = await leerArtefactoDeSesion(raiz, SESION, "diagrama.html");
    expect(leido.error).toBeUndefined();
    expect(leido.texto).toContain("hola");
    expect(leido.ruta).toBe("/artefactos/diagrama.html");
    expect(JSON.stringify(leido)).not.toContain(raiz);
  });

  it("una imagen viaja en base64 y sin texto", async () => {
    // PNG mínimo: la firma basta, aquí solo importa el camino que toma.
    writeFileSync(join(carpeta, "captura.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
    const leido = await leerArtefactoDeSesion(raiz, SESION, "captura.png");
    expect(leido.mime).toBe("image/png");
    expect(leido.base64).toBeTypeOf("string");
    expect(leido.texto).toBeUndefined();
  });

  it.each([
    ["sube un nivel", "../auth.json"],
    ["sube dos niveles", "../../auth.json"],
    ["absoluta", "/etc/passwd"],
    ["con espacio", "un nombre.html"],
    ["barra invertida", "..\\auth.json"],
    ["vacío", ""],
    ["un punto", "."],
    ["porcentaje sin decodificar", "%2e%2e/auth.json"],
  ])("rechaza un nombre que %s", async (_que, nombre) => {
    const leido = await leerArtefactoDeSesion(raiz, SESION, nombre);
    expect(leido.error).toBeDefined();
    expect(leido.texto).toBeUndefined();
    expect(JSON.stringify(leido)).not.toContain("secreto");

    const crudo = await leerArtefactoCrudo(raiz, SESION, nombre);
    expect(crudo.ok).toBe(false);
  });

  it("un enlace simbólico DENTRO de la carpeta que apunta fuera se queda fuera", async () => {
    symlinkSync(join(raiz, ".xonecode", "auth.json"), join(carpeta, "fuga.txt"));
    const leido = await leerArtefactoDeSesion(raiz, SESION, "fuga.txt");
    expect(leido.error).toBeDefined();
    expect(JSON.stringify(leido)).not.toContain("secreto");
  });

  it("un id de sesión con separadores no compone ninguna ruta", async () => {
    const leido = await leerArtefactoDeSesion(raiz, "../..", "diagrama.html");
    expect(leido.error).toBeDefined();
  });

  it("lo que no existe se dice, sin delatar el disco", async () => {
    const leido = await leerArtefactoDeSesion(raiz, SESION, "no-esta.html");
    expect(leido.error).toBe("no existe");
    expect(JSON.stringify(leido)).not.toContain(raiz);
  });

  describe("la lectura CRUDA, la que alimenta el iframe", () => {
    it("devuelve los bytes tal cual y su mime, sin base64", async () => {
      const crudo = await leerArtefactoCrudo(raiz, SESION, "diagrama.html");
      expect(crudo).toMatchObject({ ok: true, mime: "text/html" });
      if (!crudo.ok) throw new Error("debería haber leído");
      expect(crudo.datos.toString("utf8")).toContain("hola");
    });

    it("un mime que no conocemos NO se inventa", async () => {
      writeFileSync(join(carpeta, "cosa.xyz"), "lo que sea");
      const crudo = await leerArtefactoCrudo(raiz, SESION, "cosa.xyz");
      if (!crudo.ok) throw new Error("debería haber leído");
      expect(crudo.mime).toBeUndefined();
    });

    it("lo que pasa del tope no se sirve: se dice, y no se lee a memoria", async () => {
      writeFileSync(join(carpeta, "gordo.html"), Buffer.alloc(TOPE_DE_ARTEFACTO + 1));
      const crudo = await leerArtefactoCrudo(raiz, SESION, "gordo.html");
      expect(crudo).toEqual({ ok: false, motivo: "demasiado-grande" });
    });

    it("lo que no existe se distingue de lo que se rechaza", async () => {
      expect(await leerArtefactoCrudo(raiz, SESION, "no-esta.html")).toEqual({ ok: false, motivo: "no-existe" });
      expect(await leerArtefactoCrudo(raiz, SESION, "../auth.json")).toEqual({ ok: false, motivo: "rechazado" });
    });
  });
});
