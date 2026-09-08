/**
 * `crearEjecutorReal`, con `abrirSesionReal` y `inspeccionar` doblados.
 *
 * En su propio fichero y no en `main.test.ts` porque estos dos `vi.mock` son de MÓDULO:
 * puestos allí, los 67 tests de al lado correrían con un `abrirSesionReal` de mentira sin
 * pedirlo. Aquí no hay agente, ni modelo, ni disco.
 *
 * Lo que mide es el CANAL que esta tanda abrió, y que era una deuda medida: el ejecutor
 * devolvía `void` y tiraba el retorno de `sesion.turno`, así que el `cortadoPorTope` —y con
 * él el veredicto del verificador y las escrituras que quedaron sin aplicar— morían en esa
 * línea. Con las tareas de fondo aplicando escrituras solas, eso se leía en el kanban:
 * cuatro ficheros escritos, una escritura abandonada, nada verificado, y «terminada».
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const dobles = vi.hoisted(() => ({
  abrirSesionReal: vi.fn(),
  inspeccionar: vi.fn(),
}));

vi.mock("../agent/turnoReal.js", () => ({
  abrirSesionReal: dobles.abrirSesionReal,
  // `main.ts` la importa para el completado de «@ficheros» del Tab.
  ficherosDelProyecto: () => new Set<string>(),
  PROFUNDIDAD_DEL_TAB: 4,
}));
vi.mock("../agent/entorno.js", () => ({ inspeccionar: dobles.inspeccionar }));

const { crearEjecutorReal } = await import("./main.js");
const { crearConsolaDeTarea } = await import("../web/servidor/consolaDeTarea.js");
const { CatalogoModelosEnMemoria } = await import("../core/ports.js");

/** Lo mínimo que `crearEjecutorReal` le pide a una consola. */
function consolaDeMentira(extra: Record<string, unknown> = {}) {
  return {
    lineas: (async function* () {})(),
    escribir: () => {},
    preguntar: async () => "",
    interactivo: false,
    leerSecreto: async () => "",
    catalogoModelos: new CatalogoModelosEnMemoria(),
    guardarModeloGlobal: () => ({ ruta: "/x", id: "y" }),
    ...extra,
  };
}

const ESTADO = { hilo: "h1", raiz: "/tmp/proyecto-de-mentira", fuentes: {} };

beforeEach(() => {
  dobles.abrirSesionReal.mockReset();
  dobles.inspeccionar.mockReset();
  dobles.inspeccionar.mockImplementation(async (raiz: string) => ({
    raiz,
    esProyectoXone: true,
    colecciones: 1,
    vistasAplanadas: [],
    git: { dentro: false, esRaiz: false, tieneCommits: false, prefijo: "", usable: false },
    simulador: { ruta: "x", responde: false },
  }));
});

describe("el ejecutor real DEVUELVE lo que el turno informó", () => {
  it("reenvía el estado del verificador, las pendientes, los hallazgos y el motivo", async () => {
    dobles.abrirSesionReal.mockImplementation(async () => ({
      turno: async () => ({
        bitacora: { todo: [] },
        cambios: [],
        cortadoPorTope: true,
        verificador: "rojo" as const,
        pendientes: 3,
        hallazgos: [{ code: "COLL_MISSING_PROGID", severidad: "error" as const, mensaje: "falta progid" }],
        motivoSinVerificar: undefined,
      }),
    }));
    const ejecutor = crearEjecutorReal(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await ejecutor("haz algo", ESTADO, consolaDeMentira() as any);
    expect(r).toEqual({
      verificador: "rojo",
      pendientes: 3,
      hallazgos: [{ code: "COLL_MISSING_PROGID", severidad: "error", mensaje: "falta progid" }],
    });
  });

  it("un motivo de «no se verificó» también viaja: es lo que distingue los tres no-corrió", async () => {
    dobles.abrirSesionReal.mockImplementation(async () => ({
      turno: async () => ({
        bitacora: { todo: [] },
        cambios: [],
        cortadoPorTope: false,
        verificador: "no-corrio" as const,
        pendientes: 0,
        motivoSinVerificar: "no está xone-simulator en el PATH",
      }),
    }));
    const ejecutor = crearEjecutorReal(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await ejecutor("haz algo", ESTADO, consolaDeMentira() as any);
    expect(r).toEqual({
      verificador: "no-corrio",
      pendientes: 0,
      motivoSinVerificar: "no está xone-simulator en el PATH",
    });
  });

  /**
   * Lo que NO se reenvía, y a propósito: la bitácora y los `Cambio` son piezas de `agent/`
   * que no tienen por qué cruzar hasta el corredor de tareas, y `cambios` lleva rutas del
   * proyecto que nadie de ahí necesita.
   */
  it("no reenvía la bitácora ni los cambios del turno", async () => {
    dobles.abrirSesionReal.mockImplementation(async () => ({
      turno: async () => ({
        bitacora: { todo: ["verify: verde"] },
        cambios: [{ ruta: "Clientes.xne", clase: "nuevo" }],
        cortadoPorTope: false,
        verificador: "verde" as const,
        pendientes: 0,
      }),
    }));
    const ejecutor = crearEjecutorReal(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await ejecutor("haz algo", ESTADO, consolaDeMentira() as any);
    expect(Object.keys(r ?? {}).sort()).toEqual(["pendientes", "verificador"]);
  });

  it("un sitio que no es un proyecto XOne no informa de nada: no se sabe, no está verde", async () => {
    dobles.inspeccionar.mockImplementation(async (raiz: string) => ({
      raiz,
      esProyectoXone: false,
      colecciones: 0,
      vistasAplanadas: [],
      git: { dentro: false, esRaiz: false, tieneCommits: false, prefijo: "", usable: false },
      simulador: { ruta: "x", responde: false },
    }));
    const ejecutor = crearEjecutorReal(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await ejecutor("haz algo", ESTADO, consolaDeMentira() as any);
    expect(r).toBeUndefined();
    expect(dobles.abrirSesionReal).not.toHaveBeenCalled();
  });
});

describe("el tope de rondas de la consola llega hasta la sesión", () => {
  /**
   * `Consola.topeDeAprobaciones` es la costura por la que una tarea de fondo pide su propio
   * tope: sin este reenvío, el campo existiría, se pondría y no haría nada — y la tarea
   * seguiría cortándose a las cinco tandas de la persona, que es el fallo medido.
   */
  it("`topeDeAprobaciones` se reenvía como `topeDeRondas` a `abrirSesionReal`", async () => {
    dobles.abrirSesionReal.mockImplementation(async () => ({
      turno: async () => ({ bitacora: { todo: [] }, cambios: [], cortadoPorTope: false, verificador: "verde" as const, pendientes: 0 }),
    }));
    const ejecutor = crearEjecutorReal(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ejecutor("haz algo", ESTADO, consolaDeMentira({ topeDeAprobaciones: 20 }) as any);
    expect(dobles.abrirSesionReal.mock.calls[0]![0]).toMatchObject({ topeDeRondas: 20 });
  });

  it("sin él, no se pasa nada: `abrirSesionReal` se queda con el tope de siempre", async () => {
    dobles.abrirSesionReal.mockImplementation(async () => ({
      turno: async () => ({ bitacora: { todo: [] }, cambios: [], cortadoPorTope: false, verificador: "verde" as const, pendientes: 0 }),
    }));
    const ejecutor = crearEjecutorReal(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ejecutor("haz algo", ESTADO, consolaDeMentira() as any);
    // Ausente y no `undefined` explícito, que es la regla de todo el repo: un
    // `"topeDeRondas" in opciones` tiene que decir que NO.
    expect("topeDeRondas" in (dobles.abrirSesionReal.mock.calls[0]![0] as object)).toBe(false);
  });

  /**
   * Y la consola de una TAREA lo trae puesto. Se comprueba sobre el objeto que monta
   * `consolaParaTarea` en el corredor —ver su test—, pero aquí se ata el otro extremo: una
   * consola de tarea sin este campo dejaría el reenvío de arriba sin nadie que lo use.
   */
  it("la consola de tarea es una `Consola` como las demás: el campo es el mismo", async () => {
    const deTarea = crearConsolaDeTarea({
      aparcar: () => {},
      escribir: () => {},
      catalogoModelos: new CatalogoModelosEnMemoria(),
      guardarModeloGlobal: () => ({ ruta: "/x", id: "y" }),
    });
    // `crearConsolaDeTarea` no decide el tope —lo pone quien MONTA, que es el corredor—, y
    // eso es justo lo que este test fija: aquí no está.
    expect(deTarea.topeDeAprobaciones).toBeUndefined();
  });
});
