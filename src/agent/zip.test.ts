import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { extraerZipBase64 } from "./zip.js";

const enBase64 = (ficheros: Record<string, string>): string =>
  Buffer.from(zipSync(Object.fromEntries(
    Object.entries(ficheros).map(([ruta, texto]) => [ruta, strToU8(texto)])
  ))).toString("base64");

describe("extraerZipBase64", () => {
  it("escribe el árbol completo y devuelve las rutas en POSIX", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-zip-"));
    const rutas = extraerZipBase64(enBase64({
      "app.xml": "<app/>",
      "icons/icon_check.svg": "<svg/>",
    }), raiz);

    expect(rutas.sort()).toEqual(["app.xml", "icons/icon_check.svg"]);
    expect(readFileSync(join(raiz, "app.xml"), "utf8")).toBe("<app/>");
    expect(readFileSync(join(raiz, "icons", "icon_check.svg"), "utf8")).toBe("<svg/>");
  });

  it("rechaza una entrada que se sale de la raíz, sin escribir nada", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-zip-"));
    expect(() => extraerZipBase64(enBase64({ "../fuera.txt": "no" }), raiz))
      .toThrow(/fuera de la raíz/);
    expect(existsSync(join(raiz, "..", "fuera.txt"))).toBe(false);
  });

  it("rechaza una ruta absoluta", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-zip-"));
    expect(() => extraerZipBase64(enBase64({ "/etc/passwd": "no" }), raiz))
      .toThrow(/fuera de la raíz/);
  });

  it("un base64 que no es un ZIP da un error nombrado, no un volcado", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-zip-"));
    expect(() => extraerZipBase64(Buffer.from("esto no es un zip").toString("base64"), raiz))
      .toThrow(/no es un ZIP válido/);
  });
});
