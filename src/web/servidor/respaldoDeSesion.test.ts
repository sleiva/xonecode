import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guardarRespaldoDeSesion, hayRespaldoDeSesion, restaurarRespaldoDeSesion } from "./respaldoDeSesion.js";

const SESION = "s-orig";

function proyecto() {
  const raiz = mkdtempSync(join(tmpdir(), "xonecode-respaldo-"));
  const sesiones = join(raiz, ".xonecode", "sesiones");
  const carpeta = join(sesiones, SESION);
  mkdirSync(join(carpeta, "artefactos"), { recursive: true });
  return { raiz, chat: join(sesiones, `${SESION}.jsonl`), carpeta, memoria: join(carpeta, "memoria-trueforge.json") };
}

describe("el respaldo de una conversación al reencolar", () => {
  it("revertir la continuación deja el chat, la memoria y los artefactos como estaban", () => {
    const p = proyecto();
    writeFileSync(p.chat, '{"tipo":"usuario","texto":"rediseña el menú"}\n{"tipo":"asistente","texto":"hecho"}\n');
    writeFileSync(p.memoria, '{"version":1,"lo":"de la tarea padre"}');
    writeFileSync(join(p.carpeta, "artefactos", "captura-padre.png"), "x");
    guardarRespaldoDeSesion(p.raiz, SESION, "t-cont");
    expect(hayRespaldoDeSesion(p.raiz, SESION, "t-cont")).toBe(true);

    // La continuación trabaja en la MISMA conversación.
    writeFileSync(p.chat, readFileSync(p.chat, "utf8") + '{"tipo":"usuario","texto":"acaba lo pendiente"}\n{"tipo":"asistente","texto":"acabado"}\n');
    writeFileSync(p.memoria, '{"version":1,"lo":"de la continuación"}');
    writeFileSync(join(p.carpeta, "artefactos", "captura-cont.png"), "y");
    mkdirSync(join(p.carpeta, "hotswap"), { recursive: true });
    writeFileSync(join(p.carpeta, "hotswap", "medida.json"), "{}");

    expect(restaurarRespaldoDeSesion(p.raiz, SESION, "t-cont")).toBe(true);
    expect(readFileSync(p.chat, "utf8")).toBe('{"tipo":"usuario","texto":"rediseña el menú"}\n{"tipo":"asistente","texto":"hecho"}\n');
    expect(readFileSync(p.memoria, "utf8")).toContain("de la tarea padre");
    expect(existsSync(join(p.carpeta, "artefactos", "captura-padre.png"))).toBe(true);
    expect(existsSync(join(p.carpeta, "artefactos", "captura-cont.png"))).toBe(false);
    expect(existsSync(join(p.carpeta, "hotswap", "medida.json"))).toBe(false);
    // Y el respaldo se va: es de un solo uso.
    expect(hayRespaldoDeSesion(p.raiz, SESION, "t-cont")).toBe(false);
    rmSync(p.raiz, { recursive: true, force: true });
  });

  it("sin memoria al respaldar, restaurar la quita; y sin respaldo no se toca nada", () => {
    const p = proyecto();
    writeFileSync(p.chat, '{"tipo":"usuario","texto":"a"}\n');
    guardarRespaldoDeSesion(p.raiz, SESION, "t");
    writeFileSync(p.memoria, "{}");
    restaurarRespaldoDeSesion(p.raiz, SESION, "t");
    expect(existsSync(p.memoria)).toBe(false);

    writeFileSync(p.chat, '{"tipo":"usuario","texto":"a"}\n{"tipo":"usuario","texto":"b"}\n');
    expect(restaurarRespaldoDeSesion(p.raiz, SESION, "otra")).toBe(false);
    expect(readFileSync(p.chat, "utf8")).toContain('"b"');
    rmSync(p.raiz, { recursive: true, force: true });
  });
});
