import { describe, expect, it } from "vitest";
import { renombrarSobre, renombrarSobreSync, type OpcionesDeRenombrado } from "./renombrarSobre.js";

/** Un error de Node con su `code`, como los que lanza `fs`. */
function errorDe(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: operation not permitted, rename 'a' -> 'b'`), { code });
}

/** Un `rename` que falla con `codes` en orden y después funciona; cuenta las llamadas. */
function renameQueFalla(codes: string[]) {
  const llamadas: Array<[string, string]> = [];
  let i = 0;
  return {
    llamadas,
    sync: (origen: string, destino: string): void => {
      llamadas.push([origen, destino]);
      const code = codes[i++];
      if (code !== undefined) throw errorDe(code);
    },
    async: async (origen: string, destino: string): Promise<void> => {
      llamadas.push([origen, destino]);
      const code = codes[i++];
      if (code !== undefined) throw errorDe(code);
    },
  };
}

const esperas: number[] = [];
const base = (extra: Partial<OpcionesDeRenombrado> = {}): OpcionesDeRenombrado => ({
  plataforma: "win32",
  dormir: (ms) => void esperas.push(ms),
  ...extra,
});

/**
 * En Windows, renombrar ENCIMA de un fichero falla con `EPERM` si otro proceso lo tiene abierto
 * en ese instante —Defender o el indexador escaneando el `indice.json` recién escrito—. Visto en
 * una máquina real: `EPERM: operation not permitted, rename '…\.indice.json.<uuid>.tmp' ->
 * '…\indice.json'`. Es transitorio: reintentar un momento basta, como hace `graceful-fs`.
 */
describe("renombrarSobreSync", () => {
  it("en Windows, un EPERM pasajero se reintenta y acaba renombrando", () => {
    esperas.length = 0;
    const r = renameQueFalla(["EPERM", "EBUSY", "EACCES"]);
    renombrarSobreSync("tmp", "destino", base({ rename: r.sync }));
    expect(r.llamadas).toHaveLength(4);
    expect(esperas).toHaveLength(3);
    // La espera crece: no se martillea el disco mientras el otro proceso lo suelta.
    expect(esperas[1]!).toBeGreaterThan(esperas[0]!);
  });

  it("si nunca se suelta, lanza el ERROR ORIGINAL tras un tope de intentos", () => {
    esperas.length = 0;
    const r = renameQueFalla(Array(50).fill("EPERM"));
    expect(() => renombrarSobreSync("tmp", "destino", base({ rename: r.sync }))).toThrow(/EPERM/);
    expect(r.llamadas.length).toBeLessThan(50);
    // El total de espera es acotado: un fallo de verdad no puede colgar la consola.
    expect(esperas.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2000);
  });

  it("otro código (ENOENT) no se reintenta: no es un bloqueo pasajero", () => {
    esperas.length = 0;
    const r = renameQueFalla(["ENOENT"]);
    expect(() => renombrarSobreSync("tmp", "destino", base({ rename: r.sync }))).toThrow(/ENOENT/);
    expect(r.llamadas).toHaveLength(1);
    expect(esperas).toHaveLength(0);
  });

  it("fuera de Windows no se reintenta: allí un EPERM es un permiso de verdad", () => {
    esperas.length = 0;
    const r = renameQueFalla(["EPERM"]);
    expect(() => renombrarSobreSync("tmp", "destino", base({ plataforma: "darwin", rename: r.sync }))).toThrow(/EPERM/);
    expect(r.llamadas).toHaveLength(1);
  });

  it("sin opciones renombra de verdad con node:fs", async () => {
    const { mkdtempSync, writeFileSync, readFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "renombrar-"));
    writeFileSync(join(dir, "a"), "nuevo");
    writeFileSync(join(dir, "b"), "viejo");
    renombrarSobreSync(join(dir, "a"), join(dir, "b"));
    expect(readFileSync(join(dir, "b"), "utf8")).toBe("nuevo");
    expect(existsSync(join(dir, "a"))).toBe(false);
  });
});

describe("renombrarSobre (asíncrono)", () => {
  it("en Windows, reintenta un EPERM pasajero", async () => {
    const r = renameQueFalla(["EPERM", "EPERM"]);
    await renombrarSobre("tmp", "destino", { plataforma: "win32", dormir: async () => {}, rename: r.async });
    expect(r.llamadas).toHaveLength(3);
  });

  it("otro código se lanza a la primera", async () => {
    const r = renameQueFalla(["EXDEV"]);
    await expect(
      renombrarSobre("tmp", "destino", { plataforma: "win32", dormir: async () => {}, rename: r.async })
    ).rejects.toThrow(/EXDEV/);
    expect(r.llamadas).toHaveLength(1);
  });
});
