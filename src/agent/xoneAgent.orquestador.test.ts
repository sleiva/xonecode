import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { construirAgente } from "./xoneAgent.js";
import { RAIZ_SKILLS } from "./skills.js";
import { SkillsEnMemoria } from "../core/ports.js";
import type { ModelosPort, SubagenteExternoPort } from "../core/ports.js";

/**
 * El ORQUESTADOR va de solo lectura, y esto lo mide.
 *
 * Fue un agujero declarado en `CLAUDE.md` durante toda una tanda: su
 * `createFilesystemMiddleware` se montaba SIN `permissions` —eso solo lo recibían los
 * subagentes—, así que sus seis tools de fichero corrían sin ninguna de las tres
 * denegaciones estructurales. Medido entonces: contestaba «Successfully wrote» a `/.env`, a
 * `/adjuntos/pwn.txt` y a `/skills/pwn.txt`, y este último aterrizaba en la carpeta `skills/`
 * de ESTE repo —o sea en las instrucciones del propio harness—, porque la raíz montada ahí es
 * `RAIZ_SKILLS`. Lo único que lo tapaba era su prompt, que es exactamente lo que este repo no
 * acepta como barrera.
 *
 * No había test a propósito, y el argumento era bueno: uno que afirmara que puede escribir
 * `/.env` habría convertido el agujero en comportamiento esperado. Este afirma lo contrario.
 *
 * Se mide por COMPORTAMIENTO —se construye el agente de verdad, con un modelo de mentira y
 * sin red, y se le invoca la tool— y no leyendo la forma del objeto: la librería no expone
 * sus tools por API, así que se busca igual que en `xoneAgent.adjuntos.test.ts`. La primera
 * que casa en el recorrido es la del orquestador, que es la de arriba del todo.
 */
function toolDelAgente(agente: unknown, nombre: string): { invoke: (e: unknown) => Promise<unknown> } | undefined {
  const vistos = new Set<unknown>();
  let encontrada: { invoke: (e: unknown) => Promise<unknown> } | undefined;
  const recorrer = (o: unknown, prof = 0): void => {
    if (encontrada !== undefined || !o || prof > 8 || typeof o !== "object" || vistos.has(o)) return;
    vistos.add(o);
    const r = o as Record<string, unknown>;
    if (r["name"] === nombre && typeof r["invoke"] === "function") {
      encontrada = r as unknown as { invoke: (e: unknown) => Promise<unknown> };
      return;
    }
    for (const v of Object.values(r)) recorrer(v, prof + 1);
  };
  recorrer(agente);
  return encontrada;
}

const modelos: ModelosPort = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paraPapel: () => new FakeListChatModel({ responses: ["ok"] }) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paraModelo: () => new FakeListChatModel({ responses: ["ok"] }) as any,
  descripcion: () => ({ rapido: "falso", trabajo: "falso", afilado: "falso" }),
};

const sinExternos: SubagenteExternoPort = {
  disponible: async () => false,
  correr: async () => "",
};

describe("el orquestador NO puede escribir: sus tools llevan permisos", () => {
  const comun = { agentes: [], subagenteExterno: sinExternos, modelos, skills: new SkillsEnMemoria() };

  async function orquestador() {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-orq-"));
    writeFileSync(join(raiz, "app.xml"), "<app/>");
    const agente = await construirAgente({ ...comun, raiz, ficheros: new Set(["/app.xml"]) });
    return { raiz, agente };
  }

  it("un `write_file` a `/.env` se DENIEGA y el fichero no aparece", async () => {
    const { raiz, agente } = await orquestador();
    try {
      const write = toolDelAgente(agente, "write_file");
      expect(write, "no se encontró la tool `write_file`").toBeDefined();
      const dicho = JSON.stringify(await write!.invoke({ file_path: "/.env", content: "CLAVE=1" }));
      expect(dicho).toMatch(/permission denied/i);
      expect(existsSync(join(raiz, ".env"))).toBe(false);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("y a `/skills/`, que aterrizaba en las instrucciones de ESTE repo", async () => {
    const { raiz, agente } = await orquestador();
    const intruso = join(RAIZ_SKILLS, "pwn.txt");
    try {
      const write = toolDelAgente(agente, "write_file");
      const dicho = JSON.stringify(await write!.invoke({ file_path: "/skills/pwn.txt", content: "x" }));
      expect(dicho).toMatch(/permission denied/i);
      // La comprobación que de verdad importa: la raíz montada en `/skills/` es
      // `RAIZ_SKILLS`, o sea la carpeta del harness, no nada del proyecto temporal.
      expect(existsSync(intruso)).toBe(false);
    } finally {
      rmSync(intruso, { force: true });
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("tampoco puede escribir un fichero del PROYECTO: para eso están los especialistas", async () => {
    // Es lo que su propio prompt afirma desde siempre. Sin esta línea, «solo lectura» sería
    // solo «no toca las tres carpetas prohibidas», que es otra cosa mucho más floja.
    const { raiz, agente } = await orquestador();
    try {
      const write = toolDelAgente(agente, "write_file");
      const dicho = JSON.stringify(await write!.invoke({ file_path: "/nuevo.xne", content: "<c/>" }));
      expect(dicho).toMatch(/permission denied/i);
      expect(existsSync(join(raiz, "nuevo.xne"))).toBe(false);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("LEER `/.env` tampoco: la denegación estructural es de lectura y de escritura", async () => {
    const { raiz, agente } = await orquestador();
    try {
      writeFileSync(join(raiz, ".env"), "CLAVE=secreta");
      const read = toolDelAgente(agente, "read_file");
      const leido = JSON.stringify(await read!.invoke({ file_path: "/.env", offset: 0, limit: 20 }));
      expect(leido).not.toContain("secreta");
      expect(leido).toMatch(/permission denied/i);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("pero sigue LEYENDO el proyecto: solo lectura no es a ciegas", async () => {
    const { raiz, agente } = await orquestador();
    try {
      const read = toolDelAgente(agente, "read_file");
      const leido = JSON.stringify(await read!.invoke({ file_path: "/app.xml", offset: 0, limit: 20 }));
      expect(leido).toContain("<app/>");
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});
