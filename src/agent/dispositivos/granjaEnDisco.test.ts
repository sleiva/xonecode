import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { guardarTokenDeGranja, quitarTokenDeGranja, rutaDeTokenDeGranja, tokenDeGranja } from "./granjaEnDisco.js";

const casa = (): string => mkdtempSync(join(tmpdir(), "xc-granja-"));

describe("token de la granja en disco", () => {
  it("se guarda recortado en ~/.xonecode/granja.json con 0600, se lee y se quita", () => {
    const c = casa();
    expect(tokenDeGranja({ casa: c })).toBeUndefined();
    expect(guardarTokenDeGranja("  xfarm_AbCdEf123456  ", { casa: c })).toEqual({ ok: true });
    expect(tokenDeGranja({ casa: c })).toBe("xfarm_AbCdEf123456");
    if (process.platform !== "win32") expect(statSync(rutaDeTokenDeGranja(c)).mode & 0o777).toBe(0o600);
    quitarTokenDeGranja({ casa: c });
    expect(tokenDeGranja({ casa: c })).toBeUndefined();
    // Quitar sin token no es un fallo.
    expect(() => quitarTokenDeGranja({ casa: c })).not.toThrow();
  });

  it("uno sin forma xfarm_ no se escribe, y el motivo no lleva la ruta", () => {
    const c = casa();
    const r = guardarTokenDeGranja("sk-ant-123", { casa: c });
    expect(r.ok).toBe(false);
    expect(tokenDeGranja({ casa: c })).toBeUndefined();
  });

  it("un fallo al escribir devuelve un texto fijo, sin la ruta ni el token", () => {
    const r = guardarTokenDeGranja("xfarm_AbCdEf123456", {
      casa: "/casa/ana",
      escribir: () => {
        throw new Error("EACCES /casa/ana/.xonecode/granja.json");
      },
    });
    expect(r).toEqual({ ok: false, motivo: "no se pudo guardar el token en este equipo" });
  });

  it("un fichero roto, o un token dentro sin forma, es «no hay token»", () => {
    expect(tokenDeGranja({ casa: "/x", leer: () => "{roto" })).toBeUndefined();
    expect(tokenDeGranja({ casa: "/x", leer: () => JSON.stringify({ token: "otro" }) })).toBeUndefined();
    expect(tokenDeGranja({ casa: "/x", leer: () => JSON.stringify({ token: "xfarm_AbCdEf123456" }) })).toBe("xfarm_AbCdEf123456");
  });

  it("el fichero lleva versión, y nada más que el token", () => {
    const c = casa();
    guardarTokenDeGranja("xfarm_AbCdEf123456", { casa: c });
    expect(JSON.parse(readFileSync(rutaDeTokenDeGranja(c), "utf8"))).toEqual({ version: 1, token: "xfarm_AbCdEf123456" });
  });
});
