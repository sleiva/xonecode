import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSandboxBackend } from "deepagents";
import type { Agente } from "../../core/agentes.js";
import {
  TOPE_DE_LLAMADAS_DEL_CONDUCTOR,
  TOPE_DE_LLAMADAS_DEL_ESPECIALISTA,
} from "../turno/resumenDeContexto.js";

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

/**
 * Y el PRESUPUESTO de llamadas, mirado en el middleware que de verdad se montó.
 *
 * `perfiles.test.ts` prueba la función pura, y eso no dice que llegue al agente: es
 * exactamente el patrón de fallo de este repo —la regla compuesta dentro de
 * `construirAgente`, que todos los tests doblan—, y el síntoma sería el de partida, con el
 * conductor cortado a las 15 y todo en verde.
 *
 * No hace falta gastar sesenta llamadas para comprobarlo: el middleware decide en
 * `beforeModel` mirando el contador, así que se le pregunta con el contador puesto en el
 * tope corto. Quien conduce tiene que seguir; quien escribe, cortar.
 */
describe("el presupuesto de llamadas, cableado", () => {
  const hookDelTope = (nombre: string) => {
    const subagentes = (capturado.opciones?.["subagents"] ?? []) as {
      name: string;
      middleware?: { name?: string; beforeModel?: { hook?: (e: unknown) => unknown } }[];
    }[];
    const m = subagentes
      .find((s) => s.name === nombre)
      ?.middleware?.find((x) => x?.name === "TopeDeLlamadasMiddleware");
    return m?.beforeModel?.hook;
  };

  it("el conductor SIGUE donde el resto se corta", async () => {
    await construirCon([
      agente({ nombre: "device-controller", ejecucion: true }),
      agente({ nombre: "developer-xone", soloLectura: false }),
    ]);
    const estado = { llamadasDelEspecialista: TOPE_DE_LLAMADAS_DEL_ESPECIALISTA, messages: [] };

    // `undefined` es «no cortes»; un objeto con `jumpTo` es el corte.
    expect(hookDelTope("device-controller")!(estado)).toBeUndefined();
    expect(hookDelTope("developer-xone")!(estado)).toMatchObject({ jumpTo: "end" });
  });

  it("y el conductor también acaba cortándose: sigue habiendo freno, más arriba", async () => {
    await construirCon([agente({ nombre: "device-controller", ejecucion: true })]);

    const alTope = { llamadasDelEspecialista: TOPE_DE_LLAMADAS_DEL_CONDUCTOR, messages: [] };
    expect(hookDelTope("device-controller")!(alTope)).toMatchObject({ jumpTo: "end" });
  });
});
