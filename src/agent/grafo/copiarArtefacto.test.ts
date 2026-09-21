import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearCopiarArtefacto, rutaRealDeDestino } from "./copiarArtefacto.js";
import type { QuienDecidePermisos } from "./perfiles.js";

/** Un PNG de un píxel: BYTES de verdad, con el NUL de su cabecera, que es lo que no
 *  sobrevive a las tools de texto. Si la copia lo estropea, la comparación lo dice. */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex",
);

function escenario(perfil: Partial<QuienDecidePermisos> = {}) {
  const base = mkdtempSync(join(tmpdir(), "copiar-art-"));
  const raiz = join(base, "proyecto");
  const carpetaDeArtefactos = join(base, "artefactos");
  mkdirSync(raiz, { recursive: true });
  mkdirSync(carpetaDeArtefactos, { recursive: true });
  writeFileSync(join(carpetaDeArtefactos, "login.png"), PNG);
  const tool = crearCopiarArtefacto({
    raiz,
    carpetaDeArtefactos,
    perfil: { nombre: "document-writer", soloLectura: true, escribeEn: ["/doc/"], ...perfil },
  });
  const copiar = (artefacto: string, destino: string): Promise<string> =>
    (tool as unknown as { invoke: (x: unknown) => Promise<string> }).invoke({ artefacto, destino });
  return { base, raiz, carpetaDeArtefactos, copiar };
}

describe("copiar_artefacto", () => {
  it("copia los BYTES, que es lo que `read_file` no puede hacer", async () => {
    const { raiz, copiar } = escenario();
    const dicho = await copiar("login.png", "/doc/img/login.png");
    expect(dicho).toMatch(/Copiado/);
    // Byte a byte: un PNG que pase por una tool de texto sale distinto.
    expect(readFileSync(rutaRealDeDestino(raiz, "/doc/img/login.png"))).toEqual(PNG);
  });

  it("acepta el nombre a secas o la ruta virtual: da igual cómo lo escriba el modelo", async () => {
    const { raiz, copiar } = escenario();
    await copiar("/artefactos/login.png", "/doc/a.png");
    expect(readFileSync(rutaRealDeDestino(raiz, "/doc/a.png"))).toEqual(PNG);
  });

  /**
   * La guarda que impide que esto sea una puerta trasera. Una tool propia NO pasa por el
   * middleware de permisos, así que sin reaplicarlos aquí un agente de solo lectura metería
   * ficheros en el proyecto — justo lo que `permisosDe` existe para impedir.
   */
  describe("los permisos de quien llama, reaplicados", () => {
    it("fuera de su `escribeEn` NO copia, y dice dónde sí puede", async () => {
      const { copiar } = escenario();
      const dicho = await copiar("login.png", "/Menu.xne");
      expect(dicho).toMatch(/No puedes escribir/i);
      expect(dicho).toContain("/doc/");
    });

    it("sin ninguna carpeta abierta no copia a ningún sitio del proyecto", async () => {
      const { copiar } = escenario({ escribeEn: [] });
      expect(await copiar("login.png", "/doc/img/x.png")).toMatch(/No puedes escribir/i);
    });

    it("quien NO es de solo lectura copia donde quiera: ya podía escribir ahí", async () => {
      const { raiz, copiar } = escenario({ soloLectura: false, escribeEn: [] });
      await copiar("login.png", "/img/x.png");
      expect(readFileSync(rutaRealDeDestino(raiz, "/img/x.png"))).toEqual(PNG);
    });

    it("y lo denegado a TODO el mundo sigue denegado aunque se declare", async () => {
      // Un `.md` puede cambiar el prompt de un agente; no puede concederle `/.git`.
      const { copiar } = escenario({ escribeEn: ["/.git/"] });
      expect(await copiar("login.png", "/.git/hooks/x")).toMatch(/No puedes escribir/i);
    });
  });

  describe("el origen tiene que ser un artefacto de verdad", () => {
    it("no se sale de la carpeta con `..`", async () => {
      const { copiar } = escenario();
      expect(await copiar("../../.env", "/doc/x")).toMatch(/no es un artefacto/i);
    });

    it("un artefacto que no existe se dice, y se dice dónde mirar", async () => {
      const { copiar } = escenario();
      const dicho = await copiar("no-esta.png", "/doc/x.png");
      expect(dicho).toMatch(/No existe/i);
      expect(dicho).toContain("/artefactos/");
    });

    /** La SEGUNDA comprobación: el texto pasa, el camino real no. */
    it("un enlace que apunta fuera de la carpeta se deniega", async () => {
      const { base, carpetaDeArtefactos, copiar } = escenario();
      const secreto = join(base, "secreto.png");
      writeFileSync(secreto, PNG);
      symlinkSync(secreto, join(carpetaDeArtefactos, "trampa.png"));
      expect(await copiar("trampa.png", "/doc/x.png")).toMatch(/fuera de la carpeta/i);
    });
  });

  it("no deja recrear la carpeta de artefactos DENTRO del proyecto", async () => {
    // `artefactoFueraDeSitio` existe para eso, y esta tool no puede ser su excepción.
    const { copiar } = escenario({ escribeEn: ["/"] });
    expect(await copiar("login.png", "/artifacts/login.png")).toMatch(/no vale como destino/i);
  });
});
