import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MOTIVO_DEMASIADOS_NUEVOS, TOPE_DE_NUEVOS } from "../../core/comparacionConAparato.js";
import { compararConAparato } from "./comparacionEnAparato.js";
import type { RespuestaHotswap } from "./hotswap.js";

function proyecto(ficheros: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "xc-comparar-"));
  for (const [ruta, texto] of Object.entries(ficheros)) {
    mkdirSync(dirname(join(raiz, ruta)), { recursive: true });
    writeFileSync(join(raiz, ruta), texto);
  }
  return raiz;
}

const crc = (texto: string): number => crc32(Buffer.from(texto));

/** Un aparato de mentira que tiene `enAparato` (ruta → contenido) y contesta como el framework. */
function aparato(enAparato: Record<string, string>) {
  const pedidos: Record<string, unknown>[] = [];
  return {
    pedidos,
    comando: async (nombre: string, extra: Record<string, unknown> = {}): Promise<RespuestaHotswap> => {
      expect(nombre).toBe("getFileChecksum");
      pedidos.push(extra);
      const files = extra["files"] as string[];
      const falta = files.find((f) => !(f in enAparato));
      if (falta !== undefined) {
        return { result: false, exceptionMessage: `/data/user/0/x/app_miapp/${falta}: open failed: ENOENT` };
      }
      return { result: Object.fromEntries(files.map((f) => [f, crc(enAparato[f]!)])) };
    },
  };
}

describe("compararConAparato", () => {
  it("devuelve lo distinto y lo nuevo, y no compara lo que no viaja", async () => {
    const raiz = proyecto({ "app.ini": "a", "Main.xne": "nuevo", "Otra.xne": "igual", "Nueva.js": "x", ".env": "s" });
    const canal = aparato({ "app.ini": "a", "Main.xne": "viejo", "Otra.xne": "igual" });

    const r = await compararConAparato(raiz, "MiApp", canal);

    expect(r).toEqual({ estado: "ok", comparados: 4, distintos: ["Main.xne", "Nueva.js"], nuevos: 1 });
    expect(canal.pedidos[0]).toMatchObject({ appName: "miapp", checksumType: "crc32" });
    expect(canal.pedidos[0]!["files"]).not.toContain(".env");
  });

  it("todo igual es nada que subir", async () => {
    const raiz = proyecto({ "app.ini": "a" });
    expect(await compararConAparato(raiz, "MiApp", aparato({ "app.ini": "a" }))).toMatchObject({ distintos: [] });
  });

  it("con demasiados nuevos se rinde y manda a copiar todos", async () => {
    const ficheros = Object.fromEntries(Array.from({ length: TOPE_DE_NUEVOS + 3 }, (_, i) => [`f${i}.xne`, "x"]));
    const r = await compararConAparato(proyecto(ficheros), "MiApp", aparato({}));
    expect(r).toEqual({ estado: "fallo", motivo: MOTIVO_DEMASIADOS_NUEVOS });
  });

  it("otro fallo del framework, o del canal, vuelve como fallo con una línea", async () => {
    const raiz = proyecto({ "app.ini": "a" });
    const desconocido = await compararConAparato(raiz, "MiApp", {
      comando: async () => ({ result: false, status: "Unknown command" }),
    });
    expect(desconocido).toEqual({ estado: "fallo", motivo: "no se pudo comparar con el aparato: Unknown command" });

    const caido = await compararConAparato(raiz, "MiApp", {
      comando: async () => {
        throw new Error("el canal se cerró\nsegunda línea");
      },
    });
    expect(caido).toEqual({ estado: "fallo", motivo: "no se pudo comparar con el aparato: el canal se cerró" });
  });
});
