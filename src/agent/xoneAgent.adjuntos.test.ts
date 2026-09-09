import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { construirAgente } from "./xoneAgent.js";
import { SkillsEnMemoria } from "../core/ports.js";
import type { ModelosPort, SubagenteExternoPort } from "../core/ports.js";

/**
 * El HOP que ningún otro test miraba: `construirAgente` → `backendDeAgente`.
 *
 * `backendDeAgente` tiene sus propios tests (`proyecto.test.ts`) y `abrirSesionReal` tiene
 * los suyos con `construirAgente` simulado (`turnoReal.test.ts`), así que **el paso de la
 * carpeta de adjuntos entre los dos no lo comprobaba nadie**: es exactamente la clase de
 * agujero que este plan ha encontrado cuatro veces —una composición de producción que vive
 * donde todos los tests doblan— y por la que `backendDeAgente` se extrajo en su día.
 *
 * Se mide por COMPORTAMIENTO y no leyendo el objeto: se construye el agente de verdad —con
 * un modelo de mentira, sin red— y se busca su tool `read_file` para leer por ella. El
 * recorrido reflexivo es el mismo patrón que `generalPurpose.test.ts` usa para sacar la
 * descripción de `task`: la librería no expone sus tools por API.
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

describe("construirAgente monta la carpeta de adjuntos que le pasan", () => {
  function proyectoConAdjunto() {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ag-adj-"));
    writeFileSync(join(raiz, "app.xml"), "<app/>");
    const adjuntos = mkdtempSync(join(tmpdir(), "xonecode-ag-adjs-"));
    writeFileSync(join(adjuntos, "encargo.md"), "lo que quiero es esto");
    return { raiz, adjuntos };
  }

  const comun = { agentes: [], subagenteExterno: sinExternos, modelos, skills: new SkillsEnMemoria() };

  it("con `adjuntos`, el `read_file` del agente lee `/adjuntos/`", async () => {
    const { raiz, adjuntos } = proyectoConAdjunto();
    const agente = await construirAgente({ ...comun, raiz, ficheros: new Set(["/app.xml"]), adjuntos });
    const read = toolDelAgente(agente, "read_file");
    expect(read, "no se encontró la tool `read_file` en el agente construido").toBeDefined();
    const leido = JSON.stringify(await read!.invoke({ file_path: "/adjuntos/encargo.md", offset: 0, limit: 20 }));
    expect(leido).toContain("lo que quiero es esto");
  });

  it("sin `adjuntos`, esa ruta no es nada: no se monta a espaldas de nadie", async () => {
    const { raiz } = proyectoConAdjunto();
    const agente = await construirAgente({ ...comun, raiz, ficheros: new Set(["/app.xml"]) });
    const read = toolDelAgente(agente, "read_file")!;
    const leido = JSON.stringify(await read.invoke({ file_path: "/adjuntos/encargo.md", offset: 0, limit: 20 }));
    expect(leido).not.toContain("lo que quiero es esto");
  });
});
