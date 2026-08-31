import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "@langchain/langgraph";

// vi.mock se eleva al principio del módulo: las factorías no pueden tocar variables de
// arriba salvo que pasen por vi.hoisted (mismo patrón que deep-agent-xone/runtime.test.ts).
const mocks = vi.hoisted(() => ({ construirAgente: vi.fn() }));
vi.mock("./xoneAgent.js", () => ({ construirAgente: mocks.construirAgente }));

const mocksInstantanea = vi.hoisted(() => ({ tomarInstantanea: vi.fn() }));
vi.mock("./instantanea.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./instantanea.js")>();
  return { ...orig, tomarInstantanea: mocksInstantanea.tomarInstantanea };
});

import { abrirSesionReal } from "./turnoReal.js";
import { ModeloGuionizado, SkillsEnMemoria } from "../core/ports.js";
import type { Piel } from "../core/turno.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import type { Decision } from "../vendor/hitl.js";
import type { Entorno } from "./entorno.js";
import type { Cambio } from "./instantanea.js";

/**
 * El agente falso, con el MÍNIMO que `turnoReal.ts` consume:
 *  - `stream(payload)`: dos chunks, la forma de `puente.test.ts`. Si el payload trae
 *    `resume` es la ronda de reanudación: mira las decisiones y marca `ejecuto` solo si
 *    TODAS son approve (un reject se resuelve pero no ejecuta, igual que en real).
 *  - `getState()` con la forma que `collectPending` lee ({tasks:[{interrupts:[…]}]}), para
 *    que `leerPendientes` vea el interrupt pendiente cuando la primera ronda quedó pausada.
 */
type AgenteFalso = ReturnType<typeof agenteFalso>;

function agenteFalso(opts: { escribe?: boolean } = {}) {
  let ejecuto = false;
  let interrumpido = false; // true tras la primera ronda si opts.escribe
  return {
    ejecuto: () => ejecuto,
    stream: vi.fn(async (payload: unknown) => {
      const resume = (payload as { resume?: Record<string, { decisions: Array<{ type: string }> }> })
        ?.resume;
      if (resume !== undefined) {
        const aprobado = Object.values(resume).every((r) => r.decisions[0]?.type === "approve");
        if (aprobado) ejecuto = true;
        interrumpido = false;
      } else if (opts.escribe) {
        interrumpido = true;
      }
      async function* flujo() {
        yield [[], "updates", { agent: { messages: [{ tool_calls: [] }] } }];
        yield [[], "messages", [{ text: "ok", id: "m1" }, {}]];
      }
      return flujo();
    }),
    getState: vi.fn(async () => {
      if (!interrumpido) return { tasks: [] };
      return {
        tasks: [
          {
            interrupts: [
              {
                id: "int-1",
                value: {
                  actionRequests: [
                    {
                      name: "write_file",
                      args: { file_path: "/a.xne" },
                      description: "[dev] quiere escribir un fichero",
                    },
                  ],
                  reviewConfigs: [{ allowedDecisions: ["approve", "reject"] }],
                },
              },
            ],
          },
        ],
      };
    }),
  };
}

/** El agente con el que `construirAgente` respondió en la llamada i-ésima. */
function agenteDeLLamada(i: number): AgenteFalso {
  return mocks.construirAgente.mock.results[i].value as AgenteFalso;
}

function instantaneaFalsa(cambios: Cambio[] = []) {
  return { via: "git" as const, cambios: async () => cambios, diff: async () => "" };
}

const entornoFalso: Entorno = {
  raiz: "/tmp/x",
  esProyectoXone: true,
  colecciones: 0,
  vistasAplanadas: [],
  git: { dentro: false, esRaiz: false, tieneCommits: false, prefijo: "", usable: false },
  simulador: { ruta: "x", responde: false },
};

function pielFalsa(): Piel {
  return {
    token: vi.fn(),
    cerrarLinea: vi.fn(),
    linea: vi.fn(),
    pausa: vi.fn(),
    fin: vi.fn(),
  };
}

/** Dobles de `pedirAprobacion`: deciden igual para todos los pendientes. */
function aprobarTodo() {
  return async (pendientes: PendienteDeAprobacion[]): Promise<Map<string, Decision>> =>
    new Map(pendientes.map((p) => [p.id, { type: "approve" } as Decision]));
}
function rechazarTodo() {
  return async (pendientes: PendienteDeAprobacion[]): Promise<Map<string, Decision>> =>
    new Map(pendientes.map((p) => [p.id, { type: "reject" } as Decision]));
}

async function abrir(
  opts: { escribe?: boolean; pedir?: (pendientes: PendienteDeAprobacion[]) => Promise<Map<string, Decision>> } = {}
) {
  mocks.construirAgente.mockImplementation(() => agenteFalso({ escribe: opts.escribe }));
  return abrirSesionReal({
    raiz: "/tmp/turno-real-test", // no existe: `ficherosDelProyecto` devuelve Set vacío
    modelos: new ModeloGuionizado(),
    skills: new SkillsEnMemoria(),
    entorno: entornoFalso,
    pedirAprobacion: opts.pedir,
  });
}

beforeEach(() => {
  mocks.construirAgente.mockReset();
  mocks.construirAgente.mockImplementation(() => agenteFalso());
  mocksInstantanea.tomarInstantanea.mockReset();
  mocksInstantanea.tomarInstantanea.mockImplementation(async () => instantaneaFalsa());
});

describe("abrirSesionReal", () => {
  it("dos turnos seguidos reusan el mismo agente", async () => {
    const sesion = await abrir();
    await sesion.turno("primera", pielFalsa());
    await sesion.turno("segunda", pielFalsa());
    // La construcción de `abrirSesionReal` es la única: los turnos NO reconstruyen.
    expect(mocks.construirAgente.mock.calls.length).toBe(1);
  });

  it("cambiarModelos reconstruye el agente y CONSERVA hilo y checkpointer", async () => {
    const sesion = await abrir();
    const antes = sesion.hilo;
    await sesion.cambiarModelos(new ModeloGuionizado());

    expect(mocks.construirAgente.mock.calls.length).toBe(2);
    expect(sesion.hilo).toBe(antes);

    // Identidad del checkpointer, no igualdad estructural: es lo que garantiza que la
    // conversación sobrevive a `/modelo`. Con `toEqual` el test pasaría aunque se
    // recreara un MemorySaver vacío.
    const cp1 = (mocks.construirAgente.mock.calls[0][0] as { checkpointer: unknown }).checkpointer;
    const cp2 = (mocks.construirAgente.mock.calls[1][0] as { checkpointer: unknown }).checkpointer;
    expect(cp2).toBe(cp1);
  });

  it("nuevoHilo cambia el hilo sin reconstruir el agente", async () => {
    const sesion = await abrir();
    const antes = sesion.hilo;
    sesion.nuevoHilo();
    expect(sesion.hilo).not.toBe(antes);
    expect(mocks.construirAgente.mock.calls.length).toBe(1);
  });

  it("la foto se toma POR TURNO: el segundo turno no arrastra los cambios del primero", async () => {
    mocksInstantanea.tomarInstantanea
      .mockImplementationOnce(async () => instantaneaFalsa([{ ruta: "/uno.xne", clase: "nuevo" }]))
      .mockImplementationOnce(async () => instantaneaFalsa([{ ruta: "/dos.xne", clase: "nuevo" }]));
    const sesion = await abrir();
    await sesion.turno("primero", pielFalsa());
    const segundo = await sesion.turno("segundo", pielFalsa());

    expect(mocksInstantanea.tomarInstantanea).toHaveBeenCalledTimes(2);
    expect(segundo.cambios).toEqual([{ ruta: "/dos.xne", clase: "nuevo" }]);
  });

  it("sin pedirAprobacion, una pausa termina el turno y no se aplica nada", async () => {
    const sesion = await abrir({ escribe: true }); // el doble deja un interrupt pendiente
    await sesion.turno("escribe algo", pielFalsa());

    const ag = agenteDeLLamada(0);
    expect(ag.stream).toHaveBeenCalledTimes(1); // nunca hubo ronda de resume
    expect((ag.stream.mock.calls[0][0] as { resume?: unknown }).resume).toBeUndefined();
    expect(ag.ejecuto()).toBe(false);
  });

  describe("con pedirAprobacion", () => {
    it("aprobando: hay segunda ronda de stream y la escritura SE aplica", async () => {
      const sesion = await abrir({ escribe: true, pedir: aprobarTodo() });
      await sesion.turno("escribe algo", pielFalsa());

      const ag = agenteDeLLamada(0);
      expect(ag.stream).toHaveBeenCalledTimes(2);
      const reanudacion = ag.stream.mock.calls[1][0] as { resume?: unknown };
      expect(reanudacion).toBeInstanceOf(Command);
      expect((reanudacion as { resume: unknown }).resume).toEqual({
        "int-1": { decisions: [{ type: "approve" }] },
      });
      expect(ag.ejecuto()).toBe(true);
    });

    it("rechazando: TAMBIÉN se reanuda (para que el modelo lo sepa), pero la escritura NO se aplica", async () => {
      const sesion = await abrir({ escribe: true, pedir: rechazarTodo() });
      await sesion.turno("escribe algo", pielFalsa());

      const ag = agenteDeLLamada(0);
      expect(ag.stream).toHaveBeenCalledTimes(2);
      const reanudacion = ag.stream.mock.calls[1][0] as { resume?: unknown };
      expect(reanudacion).toBeInstanceOf(Command);
      expect((reanudacion as { resume: unknown }).resume).toEqual({
        "int-1": { decisions: [{ type: "reject" }] },
      });
      expect(ag.ejecuto()).toBe(false);
    });
  });
});