import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hidratarFuentesDeDisco } from "./fuentesDeDisco.js";

/** El HOME ya está mudado para TODO el suite (`src/casaDePruebas.ts`). */
function conAuth(clave: string): void {
  mkdirSync(join(homedir(), ".xonecode"), { recursive: true });
  writeFileSync(join(homedir(), ".xonecode", "auth.json"), JSON.stringify({ gemini: { key: clave } }), "utf8");
}

function proyectoCon(config: unknown): string {
  const raiz = mkdtempSync(join(tmpdir(), "xc-fuentes-"));
  mkdirSync(join(raiz, ".xonecode"), { recursive: true });
  writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify(config), "utf8");
  return raiz;
}

const previa = process.env.GOOGLE_API_KEY;
afterEach(() => {
  if (previa === undefined) delete process.env.GOOGLE_API_KEY;
  else process.env.GOOGLE_API_KEY = previa;
});

describe("hidratar las fuentes desde el disco", () => {
  it("trae el config del PROYECTO y el GLOBAL, que es lo que decide el modelo", () => {
    const raiz = proyectoCon({ modelos: { trabajo: "ollama/uno" } });
    const { fuentes } = hidratarFuentesDeDisco(raiz, {});
    expect(fuentes.proyecto?.modelos?.trabajo).toBe("ollama/uno");
  });

  it("lo que venga por bandera se CONSERVA: la precedencia la decide `resolver`, no esto", () => {
    const raiz = proyectoCon({ modelos: { trabajo: "ollama/uno" } });
    const { fuentes } = hidratarFuentesDeDisco(raiz, { bandera: "gemini/dos" });
    expect(fuentes.bandera).toBe("gemini/dos");
    expect(fuentes.proyecto?.modelos?.trabajo).toBe("ollama/uno");
  });

  it("aplica las CREDENCIALES al proceso: sin esto, un proveedor con clave no se alcanza", () => {
    delete process.env.GOOGLE_API_KEY;
    conAuth("clave-de-prueba");
    hidratarFuentesDeDisco(proyectoCon({}), {});
    expect(process.env.GOOGLE_API_KEY).toBe("clave-de-prueba");
  });

  it("devuelve lo cargado, para quien además necesite el tema o los avisos", () => {
    const { cargado } = hidratarFuentesDeDisco(proyectoCon({ tema: "xone" }), {});
    expect(cargado.config.proyecto?.tema).toBe("xone");
  });
});
