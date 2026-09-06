import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

import { abrirSesionReal, ficherosDelProyecto, TOPE_REPARACIONES } from "./turnoReal.js";
import { ModeloGuionizado, SkillsEnMemoria, type VerifierPort } from "../core/ports.js";
import type { Piel } from "../core/turno.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import type { LineaDeDiff } from "../core/diff.js";
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

function agenteFalso(opts: { escribe?: boolean; interruptArgs?: Record<string, unknown> } = {}) {
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
                      args: opts.interruptArgs ?? { file_path: "/a.xne" },
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
  opts: {
    escribe?: boolean;
    interruptArgs?: Record<string, unknown>;
    raiz?: string;
    pedir?: (
      pendientes: PendienteDeAprobacion[],
      ficheros: Map<string, string>,
      diffs: Map<string, LineaDeDiff[]>
    ) => Promise<Map<string, Decision>>;
    /** Lo que la instantánea dirá que cambió el turno. */
    cambios?: Cambio[];
    verifier?: VerifierPort;
  } = {}
) {
  mocks.construirAgente.mockImplementation(() =>
    agenteFalso({ escribe: opts.escribe, interruptArgs: opts.interruptArgs })
  );
  if (opts.cambios !== undefined) {
    const cambios = opts.cambios;
    mocksInstantanea.tomarInstantanea.mockImplementation(async () => instantaneaFalsa(cambios));
  }
  return abrirSesionReal({
    raiz: opts.raiz ?? "/tmp/turno-real-test", // no existe: `ficherosDelProyecto` devuelve Set vacío
    modelos: new ModeloGuionizado(),
    skills: new SkillsEnMemoria(),
    entorno: entornoFalso,
    pedirAprobacion: opts.pedir,
    ...(opts.verifier === undefined ? {} : { verifier: opts.verifier }),
  });
}

/** Las líneas que la piel falsa recibió, en orden. */
function lineasDe(piel: Piel): string[] {
  return (piel.linea as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
}

const RAIZ = "/tmp/turno-real-test";
const XNE = { ruta: "Clientes.xne", clase: "modificado" as const };

beforeEach(() => {
  mocks.construirAgente.mockReset();
  mocks.construirAgente.mockImplementation(() => agenteFalso());
  mocksInstantanea.tomarInstantanea.mockReset();
  mocksInstantanea.tomarInstantanea.mockImplementation(async () => instantaneaFalsa());
});

describe("abrirSesionReal", () => {
  it("expone una cancelación de sesión para desatascar un stream sin eventos", async () => {
    const sesion = await abrirSesionReal({
      raiz: "/tmp/turno-real-test",
      modelos: new ModeloGuionizado(),
      skills: new SkillsEnMemoria(),
      entorno: entornoFalso,
    });
    expect((sesion as unknown as { cancelar?: unknown }).cancelar).toEqual(expect.any(Function));
  });

  it("cancela el stream real aunque el modelo no emita otro evento", async () => {
    let senal: AbortSignal | undefined;
    mocks.construirAgente.mockImplementation(() => ({
      stream: vi.fn(async (_payload: unknown, config: { signal?: AbortSignal }) => {
        senal = config.signal;
        async function* flujo() {
          await new Promise<void>((_resolver, rechazar) => {
            if (senal?.aborted) return rechazar(senal.reason);
            senal?.addEventListener("abort", () => rechazar(senal?.reason), { once: true });
          });
        }
        return flujo();
      }),
      getState: vi.fn(async () => ({ tasks: [] })),
    }));
    const sesion = await abrirSesionReal({
      raiz: "/tmp/turno-real-test",
      modelos: new ModeloGuionizado(),
      skills: new SkillsEnMemoria(),
      entorno: entornoFalso,
    });
    const enCurso = sesion.turno("analiza", pielFalsa());
    await vi.waitFor(() => expect(senal).toBeDefined());
    sesion.cancelar();
    await expect(enCurso).rejects.toThrow(/turno cancelado por el usuario/);
  });

  it("cerrar aborta el turno en vuelo: es lo que desatasca un cambio de proyecto", async () => {
    let senal: AbortSignal | undefined;
    mocks.construirAgente.mockImplementation(() => ({
      stream: vi.fn(async (_payload: unknown, config: { signal?: AbortSignal }) => {
        senal = config.signal;
        async function* flujo() {
          await new Promise<void>((_resolver, rechazar) => {
            if (senal?.aborted) return rechazar(senal.reason);
            senal?.addEventListener("abort", () => rechazar(senal?.reason), { once: true });
          });
        }
        return flujo();
      }),
      getState: vi.fn(async () => ({ tasks: [] })),
    }));
    // `abrirSesionReal` directo y no el ayudante `abrir()`: ese reinstala su propio
    // agente falso y se llevaría por delante el stream que aquí hay que dejar colgado.
    const sesion = await abrirSesionReal({
      raiz: "/tmp/turno-real-test",
      modelos: new ModeloGuionizado(),
      skills: new SkillsEnMemoria(),
      entorno: entornoFalso,
    });
    const enCurso = sesion.turno("analiza", pielFalsa());
    await vi.waitFor(() => expect(senal).toBeDefined());
    sesion.cerrar();
    await expect(enCurso).rejects.toThrow(/turno cancelado por el usuario/);
  });

  it("un turno sobre una sesión ya cerrada FALLA en vez de revivir el hilo", async () => {
    const sesion = await abrir();
    sesion.cerrar();
    await expect(sesion.turno("otra cosa", pielFalsa())).rejects.toThrow(/ya está cerrada/);
  });

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

    it("el que aprueba recibe las LÍNEAS DE DIFF de cada pendiente (disco contra contenido)", async () => {
      // Un raíz REAL con un fichero en el disco: el ANTES del diff tiene que ser lo que
      // hay en el disco, y eso no se puede doblar — el interrupt pausa ANTES de escribir.
      const dir = mkdtempSync(join(tmpdir(), "turnoreal-"));
      writeFileSync(join(dir, "app.xne"), "<coll>\nviejo\n</coll>\n");
      const vistos: Array<Map<string, LineaDeDiff[]> | undefined> = [];

      const sesion = await abrir({
        escribe: true,
        raiz: dir,
        interruptArgs: { file_path: "app.xne", content: "<coll>\nnuevo\n</coll>\n" },
        pedir: async (pendientes, _ficheros, diffs) => {
          vistos.push(diffs);
          return rechazarTodo()(pendientes);
        },
      });
      await sesion.turno("escribe algo", pielFalsa());

      expect(vistos[0]?.get("int-1")).toEqual([
        { tipo: "igual", texto: "<coll>" },
        { tipo: "quitado", texto: "viejo" },
        { tipo: "anadido", texto: "nuevo" },
        { tipo: "igual", texto: "</coll>" },
      ]);
      rmSync(dir, { recursive: true, force: true });
    });

    it("un pendiente sin vista (tool que no escribe) no aparece en el mapa de diffs", async () => {
      const vistos: Array<Map<string, LineaDeDiff[]> | undefined> = [];
      const sesion = await abrir({
        escribe: true,
        interruptArgs: { file_path: "/a.xne" }, // write_file sin content: sin vista
        pedir: async (pendientes, _ficheros, diffs) => {
          vistos.push(diffs);
          return rechazarTodo()(pendientes);
        },
      });
      await sesion.turno("escribe algo", pielFalsa());

      expect(vistos[0]?.size).toBe(0);
    });
  });
});

describe("ficherosDelProyecto", () => {
  it("conserva el SUBDIRECTORIO en las rutas anidadas (espacio virtual del backend)", () => {
    // Defecto medido al montar el completado de «@ficheros»: la recursión devolvía
    // rutas relativas al SUBDIRECTORIO y la llamada de arriba las añadía tal cual,
    // con lo que «app/Clientes.xne» salía como «/Clientes.xne». Eso no solo
    // despistaba al completer: `sinVistasAplanadas` usa este Set como universo de
    // ficheros, y sin el prefijo un «app/Clientes.xml» anidado NO era retirado del
    // backend — justo el fichero que la regla de las vistas existe para proteger.
    const raiz = mkdtempSync(join(tmpdir(), "xc-ficheros-"));
    try {
      writeFileSync(join(raiz, "app.xml"), "<app/>");
      const dirApp = join(raiz, "app");
      mkdirSync(dirApp);
      writeFileSync(join(dirApp, "Clientes.xne"), "<rep/>");
      writeFileSync(join(dirApp, "Clientes.xml"), "<vistas/>"); // la vista aplanada TAMBIÉN está en el árbol

      expect([...ficherosDelProyecto(raiz)].sort()).toEqual(["/app.xml", "/app/Clientes.xml", "/app/Clientes.xne"]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});


describe("el lazo de verificación", () => {
  it("un turno que escribió ficheros del proyecto pasa por el verificador, y el aviso calla", async () => {
    // Es el cable que faltaba: el simulador solo se llamaba desde `xonecode verify`, y el
    // agente escribía sin que nadie mirara. Con el verificador presente y verde, el turno
    // termina en verde y el aviso de honestidad no sale — porque ya no es verdad.
    const sesion = await abrir({
      cambios: [XNE],
      verifier: { verificar: async () => ({ verde: true, hallazgos: [] }) },
    });
    const piel = pielFalsa();
    const { bitacora } = await sesion.turno("añade un campo", piel);
    expect(lineasDe(piel)).toContain("✓  verificación en verde");
    expect(lineasDe(piel).some((l) => l.includes("no ha corrido"))).toBe(false);
    expect(bitacora.corrio("verify")).toBe(true);
  });

  it("los hallazgos del turno se listan con fichero y línea, y los de otros ficheros se cuentan aparte", async () => {
    // El simulador mira el proyecto entero —es su API—, así que hay que repartir: un error
    // que ya estaba en un fichero que el agente no abrió no es del agente. Atribuírselo
    // sería falso; callarlo, fingir un proyecto limpio. Se dice aparte y sin detalle.
    const sesion = await abrir({
      cambios: [XNE],
      verifier: {
        verificar: async () => ({
          verde: false,
          hallazgos: [
            { code: "XONE001", severidad: "error", mensaje: "atributo desconocido", fichero: join(RAIZ, "Clientes.xne"), linea: 12 },
            { code: "XONE009", severidad: "error", mensaje: "ya estaba", fichero: join(RAIZ, "Otro.xne"), linea: 3 },
          ],
        }),
      },
    });
    const piel = pielFalsa();
    await sesion.turno("añade un campo", piel);
    const lineas = lineasDe(piel);
    expect(lineas).toContain("✗  verificación: 1 error(es), 0 aviso(s)");
    expect(lineas).toContain("   ✗ XONE001 Clientes.xne:12 — atributo desconocido");
    expect(lineas.some((l) => l.includes("Otro.xne"))).toBe(false);
    expect(lineas).toContain("   (y 1 hallazgo(s) más en ficheros que este turno no tocó)");
  });

  it("sin verificador, un turno que escribió lo AVISA — con el motivo", async () => {
    const sesion = await abrir({ cambios: [XNE] });
    const piel = pielFalsa();
    await sesion.turno("añade un campo", piel);
    expect(lineasDe(piel)).toContain(
      "⚠ el verificador no ha corrido en este turno (esta ejecución no tiene verificador)"
    );
  });

  it("un turno que NO escribió nada ni verifica ni avisa", async () => {
    // Antes el aviso saltaba en TODOS los turnos, incluido «cuéntame un chiste». Un aviso
    // que salta cuando no ha pasado nada enseña a ignorarlo, que es lo contrario de lo que
    // se compra con él.
    const verificar = vi.fn(async () => ({ verde: true, hallazgos: [] }));
    const sesion = await abrir({ cambios: [], verifier: { verificar } });
    const piel = pielFalsa();
    await sesion.turno("cuéntame un chiste", piel);
    expect(verificar).not.toHaveBeenCalled();
    expect(lineasDe(piel).some((l) => l.includes("verific"))).toBe(false);
  });

  it("lo que escribe el propio harness en `.xonecode/` no cuenta como escritura del turno", async () => {
    // Ahí van la memoria y los resúmenes de contexto. Contarlos haría que un turno de pura
    // conversación pasara por el simulador, y que el aviso saltara por algo que el agente
    // no hizo sobre la app.
    const verificar = vi.fn(async () => ({ verde: true, hallazgos: [] }));
    const sesion = await abrir({
      cambios: [{ ruta: ".xonecode/conversation_history/1.md", clase: "nuevo" }],
      verifier: { verificar },
    });
    const piel = pielFalsa();
    await sesion.turno("hola", piel);
    expect(verificar).not.toHaveBeenCalled();
    expect(lineasDe(piel).some((l) => l.includes("no ha corrido"))).toBe(false);
  });

  it("si el simulador no está, se dice como fallo del ENTORNO y el aviso sigue siendo verdad", async () => {
    // Que no esté el binario no es un fallo del proyecto: se avisa con el motivo y el turno
    // termina. Y «no ha corrido» sale igualmente, porque no ha corrido.
    const sesion = await abrir({
      cambios: [XNE],
      verifier: {
        verificar: async () => {
          throw new Error("spawn xone-simulator ENOENT");
        },
      },
    });
    const piel = pielFalsa();
    await sesion.turno("añade un campo", piel);
    const lineas = lineasDe(piel);
    expect(lineas).toContain("⚠ no se pudo verificar: spawn xone-simulator ENOENT");
    expect(lineas.some((l) => l.startsWith("⚠ el verificador no ha corrido"))).toBe(true);
  });

  it("con aprobaciones por medio, solo verifica la ronda FINAL — la que aplicó las escrituras", async () => {
    // En la primera ronda las escrituras están pendientes y no aplicadas: no hay nada que
    // medir. Verificar ahí daría un veredicto sobre un proyecto que aún no ha cambiado.
    const verificar = vi.fn(async () => ({ verde: true, hallazgos: [] }));
    const sesion = await abrir({
      escribe: true,
      pedir: aprobarTodo(),
      cambios: [XNE],
      verifier: { verificar },
    });
    const piel = pielFalsa();
    await sesion.turno("añade un campo", piel);
    expect(verificar).toHaveBeenCalledTimes(1);
    expect(lineasDe(piel)).toContain("✓  verificación en verde");
  });
});


/** Un verificador que contesta, en orden, los informes que se le den; el último se repite. */
function verificadorConGuion(informes: Array<{ verde: boolean; hallazgos: Parameters<VerifierPort["verificar"]>[0] extends never ? never : { code: string; severidad: "error" | "warning" | "info"; mensaje: string; fichero?: string; linea?: number }[] }>) {
  let i = 0;
  const verificar = vi.fn(async () => informes[Math.min(i++, informes.length - 1)]!);
  return { verificar };
}

const ERROR_A = { code: "XONE001", severidad: "error" as const, mensaje: "atributo desconocido", fichero: join(RAIZ, "Clientes.xne"), linea: 12 };
const ERROR_B = { code: "XONE002", severidad: "error" as const, mensaje: "función inexistente", fichero: join(RAIZ, "Clientes.xne"), linea: 40 };

describe("el lazo de reparación", () => {
  it("un veredicto rojo lanza un intento: se anuncia, se le devuelven los hallazgos, y se vuelve a verificar", async () => {
    // La segunda mitad del lazo. Sin esto el veredicto se enseñaba y ahí se quedaba; ahora
    // los hallazgos vuelven al agente como una petición en el MISMO hilo, y el simulador
    // vuelve a mirar lo que corrigió.
    const verificador = verificadorConGuion([{ verde: false, hallazgos: [ERROR_A] }, { verde: true, hallazgos: [] }]);
    const sesion = await abrir({ cambios: [XNE], verifier: verificador });
    const piel = pielFalsa();
    await sesion.turno("añade un campo", piel);

    const lineas = lineasDe(piel);
    expect(lineas).toContain(`🔁 reparando (intento 1 de ${TOPE_REPARACIONES})`);
    expect(lineas).toContain("✓  verificación en verde");
    expect(verificador.verificar).toHaveBeenCalledTimes(2);

    // La petición de reparación es un mensaje de usuario con el hallazgo dentro: código,
    // fichero relativo y línea. Sin contenido de ningún fichero.
    const agente = agenteDeLLamada(0);
    expect(agente.stream).toHaveBeenCalledTimes(2);
    const segundo = agente.stream.mock.calls[1]![0] as { messages: Array<{ content: string }> };
    expect(segundo.messages[0]!.content).toContain("XONE001 en Clientes.xne:12");
    expect(segundo.messages[0]!.content).toMatch(/No inventes atributos/);
  });

  it("el turno cierra UNA sola vez aunque tenga varias pasadas", async () => {
    // Antes cada pasada por `correrTurno` cerraba: stdio imprimía el tiempo por ronda y el
    // chat plegaba el tramo por ronda. Con reparaciones eso se multiplicaba.
    const verificador = verificadorConGuion([{ verde: false, hallazgos: [ERROR_A] }, { verde: true, hallazgos: [] }]);
    const sesion = await abrir({ cambios: [XNE], verifier: verificador });
    const piel = pielFalsa();
    await sesion.turno("añade un campo", piel);
    expect(piel.fin).toHaveBeenCalledTimes(1);
  });

  it("y también con rondas de aprobación por medio: un turno, un fin", async () => {
    const sesion = await abrir({ escribe: true, pedir: aprobarTodo(), cambios: [XNE] });
    const piel = pielFalsa();
    await sesion.turno("añade un campo", piel);
    expect(agenteDeLLamada(0).stream).toHaveBeenCalledTimes(2);
    expect(piel.fin).toHaveBeenCalledTimes(1);
  });

  it("si corregir no cambia nada, se BLOQUEA por no-progreso antes de gastar el tope", async () => {
    // El mismo error en el mismo sitio dos veces seguidas es la señal de que el modelo
    // repite el mismo cambio. Seguir sería gastar intentos —y aprobaciones humanas— en nada.
    const verificador = verificadorConGuion([{ verde: false, hallazgos: [ERROR_A] }]);
    const sesion = await abrir({ cambios: [XNE], verifier: verificador });
    const piel = pielFalsa();
    await sesion.turno("añade un campo", piel);
    const lineas = lineasDe(piel);
    expect(lineas.some((l) => l.startsWith("⛔ bloqueado (no-progreso)"))).toBe(true);
    // Un intento, dos veredictos: el original y el que repitió la huella.
    expect(verificador.verificar).toHaveBeenCalledTimes(2);
    expect(piel.fin).toHaveBeenCalledTimes(1);
  });

  it("si cada intento cambia el error pero nunca queda verde, se para en el tope y se dice", async () => {
    // Errores DISTINTOS cada vez es avance, así que no-progreso no salta; lo que corta es el
    // tope. Y se dice con la cifra para que quien lo lea sepa que se dejó como está.
    const verificador = verificadorConGuion([
      { verde: false, hallazgos: [ERROR_A] },
      { verde: false, hallazgos: [ERROR_B] },
      { verde: false, hallazgos: [ERROR_A] },
    ]);
    const sesion = await abrir({ cambios: [XNE], verifier: verificador });
    const piel = pielFalsa();
    await sesion.turno("añade un campo", piel);
    const lineas = lineasDe(piel);
    expect(lineas.some((l) => l.startsWith("⛔ bloqueado (tope-reparaciones)"))).toBe(true);
    expect(verificador.verificar).toHaveBeenCalledTimes(TOPE_REPARACIONES + 1);
    expect(piel.fin).toHaveBeenCalledTimes(1);
  });

  it("un aviso que va y viene NO cuenta como progreso ni como estancamiento: la huella son los errores", async () => {
    const aviso = { code: "XONE100", severidad: "warning" as const, mensaje: "sin usar", fichero: join(RAIZ, "Clientes.xne") };
    const verificador = verificadorConGuion([
      { verde: false, hallazgos: [ERROR_A, aviso] },
      { verde: false, hallazgos: [ERROR_A] },
    ]);
    const sesion = await abrir({ cambios: [XNE], verifier: verificador });
    const piel = pielFalsa();
    await sesion.turno("añade un campo", piel);
    expect(lineasDe(piel).some((l) => l.startsWith("⛔ bloqueado (no-progreso)"))).toBe(true);
  });

  it("verde a la primera: ni intento ni bloqueo", async () => {
    const verificador = verificadorConGuion([{ verde: true, hallazgos: [] }]);
    const sesion = await abrir({ cambios: [XNE], verifier: verificador });
    const piel = pielFalsa();
    await sesion.turno("añade un campo", piel);
    expect(verificador.verificar).toHaveBeenCalledTimes(1);
    expect(lineasDe(piel).some((l) => l.includes("reparando") || l.includes("bloqueado"))).toBe(false);
  });
});


describe("el cierre del turno cuando la aprobación revienta", () => {
  it("si `pedirAprobacion` lanza tras una ronda que no cerró, el turno cierra igual y el error se propaga", async () => {
    // Es el «sin humano» de `run.ts`, que corta desde DENTRO de la aprobación. La ronda
    // anterior predijo reanudación y no emitió `fin`; sin este cierre, ese turno se quedaba
    // sin línea de tiempo en stdio y sin plegar en la web. Y sigue siendo un fallo: se
    // propaga, no se traga.
    class Corte extends Error {}
    const sesion = await abrir({
      escribe: true,
      pedir: async () => {
        throw new Corte("sin humano");
      },
    });
    const piel = pielFalsa();
    await expect(sesion.turno("añade un campo", piel)).rejects.toBeInstanceOf(Corte);
    expect(piel.fin).toHaveBeenCalledTimes(1);
  });

  it("el tiempo del fin es el del turno entero, no el de la última pasada", async () => {
    // Dos pasadas —ronda con aprobación y reanudación—: el `fin` único cuenta desde que
    // empezó el turno. Se comprueba que no es menor que lo que duró la primera pasada, que
    // aquí se alarga a propósito en la aprobación.
    const sesion = await abrir({
      escribe: true,
      pedir: async (pendientes) => {
        await new Promise((r) => setTimeout(r, 120));
        return aprobarTodo()(pendientes);
      },
    });
    const piel = pielFalsa();
    await sesion.turno("añade un campo", piel);
    const [ms] = (piel.fin as ReturnType<typeof vi.fn>).mock.calls[0] as [number];
    expect(ms).toBeGreaterThanOrEqual(120);
  });
});
