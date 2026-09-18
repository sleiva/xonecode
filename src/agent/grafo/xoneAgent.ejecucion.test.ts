import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSandboxBackend } from "deepagents";
import type { Agente } from "../../core/agentes.js";

/**
 * A QUIÉN se le cablea la SHELL, mirado desde fuera.
 *
 * Mismo motivo que `xoneAgent.navegacion.test.ts`: el patrón de fallo que este repo ha pagado
 * nueve veces es una composición de producción viviendo en un cierre que todos los tests
 * doblan. Aquí el síntoma sería el peor de todos —todo en verde con un especialista corriente
 * llevando una shell, o el de dispositivos sin ella y sin error que leer—, porque deepagents
 * **filtra `execute` en silencio** cuando el backend resuelto no sabe ejecutar.
 *
 * Y no vale mirar `middleware.tools`: medido contra la librería, ahí salen las ocho tools de
 * fichero —`execute` incluida— tenga shell el backend o no. El filtrado ocurre en tiempo de
 * petición, contra el backend resuelto. Así que lo que se espía es el BACKEND que recibe
 * `createFilesystemMiddleware`, y se le pregunta a la propia librería si ejecuta.
 */
const capturado: {
  opciones?: Record<string, unknown>;
  ficheros: Record<string, unknown>[];
} = { ficheros: [] };

vi.mock("deepagents", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    createDeepAgent: (opciones: Record<string, unknown>) => {
      capturado.opciones = opciones;
      return { grafo: "de mentira" };
    },
    createFilesystemMiddleware: (opciones: Record<string, unknown>) => {
      capturado.ficheros.push(opciones);
      return (real["createFilesystemMiddleware"] as (o: unknown) => unknown)(opciones);
    },
  };
});

const { construirAgente } = await import("./xoneAgent.js");
const { SkillsEnMemoria, ModeloGuionizado, SubagenteExternoGuionizado } = await import(
  "../../core/ports.js"
);

function proyecto(): string {
  const raiz = mkdtempSync(join(tmpdir(), "ejecucion-cableado-"));
  writeFileSync(join(raiz, "app.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<app name="D"></app>\n`);
  return raiz;
}

const agente = (extra: Partial<Agente>): Agente => ({
  nombre: "uno",
  descripcion: "hace cosas",
  motor: "modelo",
  soloLectura: true,
  skills: [],
  instrucciones: "",
  origen: "global",
  ...extra,
});

async function construirCon(agentes: Agente[]): Promise<void> {
  capturado.ficheros = [];
  await construirAgente({
    raiz: proyecto(),
    ficheros: new Set(["/app.xml"]),
    agentes,
    modelos: new ModeloGuionizado(),
    skills: new SkillsEnMemoria(),
    subagenteExterno: new SubagenteExternoGuionizado(),
  });
}

/** Los montajes de fichero, por si hace falta distinguir el del orquestador. */
const conShell = (): Record<string, unknown>[] =>
  capturado.ficheros.filter((o) => isSandboxBackend(o["backend"]));

describe("el cableado de la ejecución", () => {
  it("quien declara `ejecucion` recibe un backend que la librería REAL reconoce como ejecutable", async () => {
    await construirCon([agente({ nombre: "device-controller", ejecucion: true })]);

    expect(conShell()).toHaveLength(1);
  });

  it("y quien no la declara, NO — ni él ni el orquestador", async () => {
    await construirCon([agente({ nombre: "analyst-xone" }), agente({ nombre: "developer-xone", soloLectura: false })]);

    expect(conShell()).toHaveLength(0);
  });

  it("con dos agentes, la shell llega a UNO y el otro conserva sus permisos", async () => {
    await construirCon([
      agente({ nombre: "device-controller", ejecucion: true }),
      agente({ nombre: "analyst-xone" }),
    ]);

    const subagentes = (capturado.opciones?.["subagents"] ?? []) as {
      name: string;
      permissions?: unknown;
    }[];
    const conductor = subagentes.find((s) => s.name === "device-controller");
    const analista = subagentes.find((s) => s.name === "analyst-xone");

    // Sin `permissions`: no es una omisión, es que deepagents LANZA si se combinan con un
    // backend ejecutable. Y con ellos el otro, que es lo que había que no romper.
    expect(conductor?.permissions).toBeUndefined();
    expect(analista?.permissions).toBeDefined();
    expect(conShell()).toHaveLength(1);
  });

  it("un MOTOR EXTERNO que lo declare no se lleva ninguna shell", async () => {
    // Ahí la shell está cerrada a propósito (Bash denegada, tool retirada, sandbox read-only)
    // y el hijo corre en otro proceso: honrarlo sería prometer lo que no llega.
    await construirCon([agente({ nombre: "externo", motor: "claude-code", ejecucion: true })]);

    expect(conShell()).toHaveLength(0);
  });
});
