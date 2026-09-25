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

vi.mock("../agent/turno/turnoReal.js", () => ({
  abrirSesionReal: dobles.abrirSesionReal,
}));
vi.mock("../agent/turno/ficherosDelProyecto.js", () => ({
  // `main.ts` la importa para el completado de «@ficheros» del Tab.
  ficherosDelProyecto: () => new Set<string>(),
  PROFUNDIDAD_DEL_TAB: 4,
}));
vi.mock("../agent/config/entorno.js", () => ({ inspeccionar: dobles.inspeccionar }));

const { crearEjecutorReal } = await import("./main.js");
const { TOPE_DE_RONDAS_DE_CONSOLA } = await import("../core/modoDeEscritura.js");
const { MAX_APPROVAL_ROUNDS } = await import("../vendor/hitl.js");
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

describe("la depuración global (Ajustes > General) llega a abrirSesionReal", () => {
  /** Un `cargarSettings` de mentira: los tests no pueden leer el `settings.json` real de
   *  quien corre la suite (compartido por TODO el worker vía `casaDePruebas.ts`). */
  function settingsDeMentira(depurar?: boolean) {
    return () => ({ settings: { entornos: [], ...(depurar === undefined ? {} : { depurar }) }, avisos: [] });
  }

  it("ausente en settings.json (como recién instalado) llega como depurar:true", async () => {
    dobles.abrirSesionReal.mockImplementation(async () => ({
      turno: async () => ({ bitacora: { todo: [] }, cambios: [], cortadoPorTope: false, verificador: "verde" as const, pendientes: 0 }),
    }));
    const ejecutor = crearEjecutorReal(() => {}, undefined, undefined, undefined, settingsDeMentira());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ejecutor("haz algo", ESTADO, consolaDeMentira() as any);
    expect(dobles.abrirSesionReal.mock.calls[0]![0]).toMatchObject({ depurar: true });
  });

  it("depurar:false en settings.json llega tal cual, sin invertirlo", async () => {
    dobles.abrirSesionReal.mockImplementation(async () => ({
      turno: async () => ({ bitacora: { todo: [] }, cambios: [], cortadoPorTope: false, verificador: "verde" as const, pendientes: 0 }),
    }));
    const ejecutor = crearEjecutorReal(() => {}, undefined, undefined, undefined, settingsDeMentira(false));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ejecutor("haz algo", ESTADO, consolaDeMentira() as any);
    expect(dobles.abrirSesionReal.mock.calls[0]![0]).toMatchObject({ depurar: false });
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

  it("sin él y CON alguien delante, va el tope alto: el freno es la persona, no el contador", async () => {
    // `MAX_APPROVAL_ROUNDS` son cinco y se dimensionaron para un modelo que insiste tras
    // cada rechazo. Medido, lo que corta son trabajos legítimos a la mitad: una ronda no es
    // una insistencia, es una TANDA. Con alguien delante el freno es un rechazo o el botón
    // de parar, así que el tope solo tiene que estar donde no llegue.
    dobles.abrirSesionReal.mockImplementation(async () => ({
      turno: async () => ({ bitacora: { todo: [] }, cambios: [], cortadoPorTope: false, verificador: "verde" as const, pendientes: 0 }),
    }));
    const ejecutor = crearEjecutorReal(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ejecutor("haz algo", ESTADO, consolaDeMentira({ interactivo: true }) as any);
    expect(dobles.abrirSesionReal.mock.calls[0]![0]).toMatchObject({
      topeDeRondas: TOPE_DE_RONDAS_DE_CONSOLA,
    });
  });

  it("sin nadie delante se queda el tope BAJO de siempre", async () => {
    // `xonecode run` y una tubería: nadie aprueba nada, así que cada ronda es una llamada
    // al modelo que va a acabar en el mismo rechazo. Ahí el tope bajo sí es lo que corta un
    // bucle que nadie puede parar.
    dobles.abrirSesionReal.mockImplementation(async () => ({
      turno: async () => ({ bitacora: { todo: [] }, cambios: [], cortadoPorTope: false, verificador: "verde" as const, pendientes: 0 }),
    }));
    const ejecutor = crearEjecutorReal(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ejecutor("haz algo", ESTADO, consolaDeMentira({ interactivo: false }) as any);
    expect(dobles.abrirSesionReal.mock.calls[0]![0]).toMatchObject({
      topeDeRondas: MAX_APPROVAL_ROUNDS,
    });
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

/**
 * El HOP de los adjuntos: `crearEjecutorReal` → `abrirSesionReal`.
 *
 * La carpeta la sabe quien ABRIÓ la consola —el corredor de tareas, que es el único que
 * conoce la tarea—, así que llega a la FÁBRICA y no a la llamada del turno: es un dato de la
 * consola, igual que el checkpointer. Y aquí es donde el hilo entero se puede cortar sin que
 * nada chiste, que es por lo que este test existe.
 */
describe("la carpeta de adjuntos llega desde la fábrica del ejecutor", () => {
  beforeEach(() => {
    dobles.abrirSesionReal.mockImplementation(async () => ({ turno: async () => ({ bitacora: { todo: [] }, cambios: [] }) }));
  });

  it("se le pasa a `abrirSesionReal` la que reciba la fábrica", async () => {
    const ejecutor = crearEjecutorReal(() => {}, undefined, undefined, "/casa/.xonecode/tareas/t1/adjuntos");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ejecutor("haz algo", ESTADO, consolaDeMentira() as any);
    expect(dobles.abrirSesionReal).toHaveBeenCalledWith(
      expect.objectContaining({ adjuntos: "/casa/.xonecode/tareas/t1/adjuntos" })
    );
  });

  it("y sin ella el campo NO va: ausente es «no hay adjuntos», no una carpeta vacía", async () => {
    const ejecutor = crearEjecutorReal(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ejecutor("haz algo", ESTADO, consolaDeMentira() as any);
    expect(dobles.abrirSesionReal.mock.calls.at(-1)?.[0]).not.toHaveProperty("adjuntos");
  });
});

/**
 * El CABLEADO del juez del turno, que es donde se queda escrito y no montado.
 *
 * `core/juezDelTurno.ts` tiene sus pruebas y `turnoReal.ts` las suyas del cableado interno,
 * y con las dos en verde el juez podía seguir sin llegar NUNCA a una sesión real: lo que
 * enchufa el puerto vive aquí, en un cierre que el resto de los tests dobla. Es el patrón
 * que este repo ha pagado nueve veces.
 */
describe("el juez del turno llega a la sesión", () => {
  it("se le pasa a `abrirSesionReal`, y es una función", async () => {
    dobles.abrirSesionReal.mockImplementation(async () => ({
      turno: async () => ({
        bitacora: { todo: [] },
        cambios: [],
        cortadoPorTope: false,
        verificador: "verde" as const,
        pendientes: 0,
      }),
    }));
    const ejecutor = crearEjecutorReal(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ejecutor("haz algo", ESTADO, consolaDeMentira() as any);

    const opciones = dobles.abrirSesionReal.mock.calls[0]![0] as { juezDelTurno?: unknown };
    expect(typeof opciones.juezDelTurno).toBe("function");
  });
});
