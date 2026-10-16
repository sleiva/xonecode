import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { decodificar8Bits, tablaDeLosBytes } from "./codificacion.js";

type Lib = {
  esUtf8: (b: Uint8Array) => boolean;
  tablaDe: (b: Uint8Array) => string;
  aUtf8: (b: Uint8Array) => { yaUtf8: true } | { yaUtf8: false; texto: string; tabla: string; prologo: boolean; noAscii: number };
  motivoDeRuta: (r: unknown) => string | undefined;
};

// La skill no puede importar TypeScript: la regla de la tabla vive dos veces, y esto impide que diverjan.
const lib = (await import(pathToFileURL(resolve(__dirname, "../../skills/xone-development/lib/aUtf8.mjs")).href)) as Lib;
const SCRIPT = resolve(__dirname, "../../skills/xone-development/scripts/xone-a-utf8");

const latin = (texto: string, tabla: "iso-8859-15" | "windows-1252" = "iso-8859-15") =>
  Uint8Array.from([...texto].map((c) => {
    if (c === "€") return tabla === "iso-8859-15" ? 0xa4 : 0x80;
    return c.charCodeAt(0);
  }));

describe("xone-a-utf8 (skill xone-development)", () => {
  const ISO = '<?xml version="1.0" encoding="iso-8859-15"?>\n<coll title="LIQUIDACIÓN €"/>\n';

  it("lee con la MISMA tabla que xonecode, la declarada o windows-1252", () => {
    for (const [texto, tabla] of [
      [ISO, "iso-8859-15"],
      ['<?xml version="1.0" encoding="windows-1252"?>\n<a t="Año €"/>', "windows-1252"],
      ['<a t="Año"/>', "windows-1252"],
    ] as const) {
      const bytes = latin(texto, tabla);
      expect(lib.tablaDe(bytes)).toBe(tablaDeLosBytes(bytes));
      const r = lib.aUtf8(bytes);
      if (r.yaUtf8) throw new Error("no es UTF-8");
      const comoXonecode = decodificar8Bits(bytes, tablaDeLosBytes(bytes));
      expect(r.texto).toBe(r.prologo ? comoXonecode.replace(/encoding="[^"]*"/, 'encoding="UTF-8"') : comoXonecode);
    }
  });

  it("cambia el prólogo a UTF-8 y conserva cada tilde y el €", () => {
    const r = lib.aUtf8(latin(ISO));
    expect(r).toEqual({ yaUtf8: false, tabla: "iso-8859-15", prologo: true, noAscii: 2, texto: ISO.replace("iso-8859-15", "UTF-8") });
  });

  it("un fichero que ya es UTF-8 no se toca", () => {
    expect(lib.aUtf8(new TextEncoder().encode(ISO))).toEqual({ yaUtf8: true });
  });

  it("solo .xne del proyecto: ni rutas absolutas, ni subir, ni .git/.xonecode, ni .xml", () => {
    expect(lib.motivoDeRuta("EntryPoint.xne")).toBeUndefined();
    expect(lib.motivoDeRuta("./colls/Pedidos.xne")).toBeUndefined();
    for (const mala of ["/etc/x.xne", "../x.xne", "a/../../x.xne", ".git/x.xne", ".xonecode/x.xne", "EntryPoint.xml", "C:\\x.xne", "", undefined]) {
      expect(lib.motivoDeRuta(mala), String(mala)).toBeTypeOf("string");
    }
  });

  describe("el script, de punta a punta", () => {
    let dir: string | undefined;
    afterEach(() => {
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    });
    const correr = (cwd: string, arg: string) => {
      try {
        return { codigo: 0, salida: execFileSync(process.execPath, [SCRIPT, arg], { cwd, encoding: "utf8", stdio: "pipe" }) };
      } catch (e) {
        const err = e as { status: number; stderr: string };
        return { codigo: err.status, salida: err.stderr };
      }
    };

    it("convierte en el sitio y lo dice; una segunda vez no hace nada", () => {
      dir = mkdtempSync(join(tmpdir(), "a-utf8-"));
      writeFileSync(join(dir, "EntryPoint.xne"), latin(ISO));
      const primera = correr(dir, "EntryPoint.xne");
      expect(primera.codigo).toBe(0);
      expect(primera.salida).toContain("ISO-8859-15 a UTF-8");
      expect(readFileSync(join(dir, "EntryPoint.xne"), "utf8")).toBe(ISO.replace("iso-8859-15", "UTF-8"));
      expect(correr(dir, "EntryPoint.xne").salida).toContain("ya está en UTF-8");
    });

    it("niega lo que no es un .xne del proyecto, sin tocarlo", () => {
      dir = mkdtempSync(join(tmpdir(), "a-utf8-"));
      mkdirSync(join(dir, ".xonecode"));
      writeFileSync(join(dir, ".xonecode", "x.xne"), latin(ISO));
      expect(correr(dir, ".xonecode/x.xne").codigo).toBe(1);
      expect(correr(dir, "../fuera.xne").codigo).toBe(1);
      expect(readFileSync(join(dir, ".xonecode", "x.xne"))).toEqual(Buffer.from(latin(ISO)));
    });
  });
});
