/**
 * Todo con dobles salvo la última batería, que es la MEDIDA del volcado y necesita las
 * piezas de verdad: el vestíbulo, el índice de sesiones en disco y un git real (el mismo
 * trato que `agent/sesionGit.test.ts`, que también prueba git y no un doble de git). Ni
 * red, ni clave, ni simulador, ni un agente: el ejecutor entra inyectado.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AVISO_SIN_HILO_REANUDABLE,
  MOTIVO_CORTADA_POR_CIERRE,
  motivoDeCorteAMitad,
  consolaParaTarea,
  crearCorredorDeTareas,
  peticionDeFeedback,
  revisionConGit,
  type ConsolaParaTarea,
  type RevisionDeSesion,
} from "./corredorDeTareas.js";
import { crearVestibulo, type ConsolaDeProyecto } from "./vestibulo.js";
import { cambiosDeSesion, fotoDeApertura } from "../../agent/sesionGit.js";
import { CatalogoModelosEnMemoria } from "../../core/ports.js";
import type { Consola } from "../../cli/consola.js";
import type { Acto } from "../../core/actos.js";
import type { MensajeAlCliente } from "./transporte.js";
import { TOPE_DE_RONDAS_DE_TAREA, type Tarea } from "../../core/tareas.js";
import { MAX_APPROVAL_ROUNDS } from "../../vendor/hitl.js";
import { SALVEDAD_SIN_ESCRITURAS, type ResultadoDeTurno, type VeredictoDeTarea } from "../../core/entrega.js";
import type { CasoDeJuez, JuezDeTareaPort } from "../../core/ports.js";
import { ErrorDelJuezDeTarea } from "../../agent/juezDeTarea.js";
import { aplicarFeedback, type TareasEnDisco } from "../../agent/tareasEnDisco.js";

/** Un juez de mentira que siempre dice lo mismo, apuntando lo que se le preguntó. */
function juezQueDice(veredicto: VeredictoDeTarea): JuezDeTareaPort & { casos: CasoDeJuez[] } {
  const casos: CasoDeJuez[] = [];
  return {
    casos,
    juzgar: async (caso) => {
      casos.push(caso);
      return veredicto;
    },
  };
}

/**
 * Las dos piezas de la ENTREGA en verde, que se le pasan a todos los corredores de este
 * fichero salvo a los de la batería que las prueba.
 *
 * Son OBLIGATORIAS en el tipo a propósito —fail-closed por tipo, como
 * `PoliticaDeAprobacion`—, así que sin ellas ninguna tarea se entregaría y todos estos
 * tests, que son sobre el lazo y no sobre la puerta, dirían «requiere-atencion».
 */
const ENTREGA_VERDE = {
  juez: juezQueDice({ veredicto: "verde" as const, resumen: "hace lo que pide" }),
  revisable: async () => ({ revisable: true, escribio: true }),
};

/** La cola en memoria, con el cerrojo y su dueño controlables desde el test. */
function discoDeMentira(
  inicial: Tarea[],
  cerrojo: { tomado: true } | { tomado: false; dePid: number } = { tomado: true }
) {
  let lista = [...inicial];
  let dueño = cerrojo.tomado;
  let soltado = 0;
  const disco: TareasEnDisco = {
    listar: () => lista.map((t) => ({ ...t })),
    guardar: (t) => void (lista = t.map((x) => ({ ...x }))),
    tomarCerrojo: () => cerrojo,
    // Lo que hace verdad «un solo corredor»: el cerrojo deja un residuo declarado en el que
    // dos procesos pueden creerse dueños, y esto es lo que hace que el que perdió se entere
    // ANTES de arrancar una tarea (ver `recoger` en `agent/tareasEnDisco.ts`).
    sigoSiendoDueño: () => dueño,
    soltarCerrojo: () => void (soltado += 1),
    guardarAdjunto: () => ({ ok: true }),
    listarAdjuntos: () => [],
    carpetaDeAdjuntos: (id) => `/tmp/${id}/adjuntos`,
    borrarTarea: (id) => void (lista = lista.filter((t) => t.id !== id)),
  };
  return {
    disco,
    estado: () => lista,
    /** El disco cambia por debajo: otra pestaña, o el otro corredor. */
    poner: (t: Tarea[]) => void (lista = t.map((x) => ({ ...x }))),
    perderElCerrojo: () => void (dueño = false),
    soltados: () => soltado,
  };
}

const TAREA = (extra: Partial<Tarea> = {}): Tarea => ({
  id: "t1",
  proyecto: { id: "pa", raiz: "/w/A", nombre: "A" },
  titulo: "t",
  peticion: "p",
  encargo: "e",
  adjuntos: [],
  estado: "nuevo",
  creada: "2026-09-08T10:00:00.000Z",
  ...extra,
});

/** Una consola de proyecto de mentira: apunta el encargo y deja controlar el final. */
function proyectoDeMentira() {
  const encargos: string[] = [];
  const cierres: string[] = [];
  const aparcadores: ((motivo: string) => void)[] = [];
  const autorizadores: ((ficheros: readonly string[]) => void)[] = [];
  interface Viva {
    resolver: (resultado: ResultadoDeTurno | undefined) => void;
    rechazar: (error: unknown) => void;
  }
  const vivas: Viva[] = [];
  return {
    encargos,
    cierres,
    /**
     * El turno acaba, informando de cómo acabó. Por omisión, como un turno que fue bien:
     * verificador en verde y nada pendiente — porque casi todos estos tests son sobre el
     * LAZO (el cerrojo, la reconciliación, el registro) y no sobre la puerta de la entrega,
     * que tiene su propia batería. Lo importante es que **`undefined` sigue siendo posible**
     * y significa «no informó»: es lo que devuelve el ejecutor guionizado, y por eso hay un
     * test suyo.
     */
    acabar: (resultado: ResultadoDeTurno = { verificador: "verde", pendientes: 0 }) =>
      vivas.pop()?.resolver(resultado),
    /**
     * El turno acaba SIN informar de nada, que es lo que hace el ejecutor guionizado y
     * cualquier piel que no reenvíe el retorno. Es un método aparte y no un `acabar(undefined)`
     * porque un parámetro por omisión se aplica también al `undefined` explícito: con eso,
     * el caso que hay que probar —«no se sabe» no es «todo bien»— se convertía en el verde
     * de al lado sin que nada chistara.
     */
    acabarMudo: () => vivas.pop()?.resolver(undefined),
    romper: (error: unknown) => vivas.pop()?.rechazar(error),
    aparcar: (motivo: string) => aparcadores.at(-1)?.(motivo),
    /** Lo que la consola de tarea apunta al AUTORIZAR una escritura sin aprobación. */
    autorizar: (ficheros: readonly string[]) => autorizadores.at(-1)?.(ficheros),
    abrir: async (raiz: string): Promise<ConsolaParaTarea> => {
      let viva: Viva | undefined;
      return {
        raiz,
        idDeHilo: `hilo-${raiz}`,
        correrTarea: async (encargo, aparcar, autorizado) => {
          encargos.push(encargo);
          aparcadores.push(aparcar);
          if (autorizado !== undefined) autorizadores.push(autorizado);
          return await new Promise<ResultadoDeTurno | undefined>((resolver, rechazar) => {
            viva = { resolver, rechazar };
            vivas.push(viva);
          });
        },
        cerrar: async () => {
          cierres.push(raiz);
          // Cerrar la consola ABORTA el turno: en producción `ConsolaDeProyecto.cerrar`
          // aborta el stream del grafo y `ejecutarTurno` rechaza. Un doble que resolviera
          // limpio esconderia justo el caso que `parar()` tiene que saber contar.
          viva?.rechazar(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
        },
      };
    },
  };
}

/**
 * Los ADJUNTOS, y las dos mitades del trabajo del corredor con ellos: **decir DÓNDE están**
 * (la carpeta, que se le pasa a `abrirParaTarea` para montarla) y **decir QUE están** (el
 * inventario que se le añade a la petición del turno). Las dos hacen falta: sin la primera el
 * agente no puede abrirlos, y sin la segunda no sabe que existen — `/adjuntos/` es una raíz
 * virtual que ninguna instrucción suya nombra.
 */
describe("los adjuntos de una tarea llegan a su turno", () => {
  /** Como `proyectoDeMentira`, pero apuntando además los TRES argumentos de la apertura. */
  function conAperturas() {
    const p = proyectoDeMentira();
    const aperturas: { raiz: string; sesion?: string; adjuntos?: string }[] = [];
    return {
      ...p,
      aperturas,
      abrir: async (raiz: string, sesion?: string, adjuntos?: string) => {
        aperturas.push({ raiz, ...(sesion === undefined ? {} : { sesion }), ...(adjuntos === undefined ? {} : { adjuntos }) });
        return p.abrir(raiz);
      },
    };
  }

  it("con adjuntos: se monta su carpeta y el encargo dice qué hay y dónde", async () => {
    const { disco } = discoDeMentira([TAREA({ adjuntos: [{ nombre: "mockup.png", bytes: 2048, mime: "image/png" }] })]);
    const p = conAperturas();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    expect(p.aperturas).toEqual([{ raiz: "/w/A", adjuntos: "/tmp/t1/adjuntos" }]);
    expect(p.encargos[0]).toContain("e");
    expect(p.encargos[0]).toContain("/adjuntos/mockup.png");
    // Y la limitación declarada: se leen, no se ven.
    expect(p.encargos[0]).toMatch(/no las ves|no la ves/i);
    p.acabar();
    await corredor.asentar();
    await corredor.parar();
  });

  it("sin adjuntos: no se monta nada y el encargo va tal cual", async () => {
    // La carpeta se monta solo cuando hay algo dentro: una raíz vacía mandaría al agente a
    // mirar un sitio donde no hay nada, y el encargo hablaría de ficheros que no existen.
    const { disco } = discoDeMentira([TAREA()]);
    const p = conAperturas();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    expect(p.aperturas).toEqual([{ raiz: "/w/A" }]);
    expect(p.encargos).toEqual(["e"]);
    p.acabar();
    await corredor.asentar();
    await corredor.parar();
  });

  it("y el inventario acompaña también al FEEDBACK, no solo al primer encargo", async () => {
    // Una tarea que se reanuda con feedback sigue teniendo sus adjuntos montados, así que el
    // aviso tiene que ir con lo que se mande esa vuelta: si solo fuera con el encargo, la
    // segunda pasada le hablaría de `/adjuntos/` a un agente que ya no sabe que existe (un
    // hilo nuevo, o una reanudación donde el encargo no se repite).
    const { disco } = discoDeMentira([
      TAREA({
        estado: "requiere-atencion",
        motivo: "¿la lista lleva histórico?",
        adjuntos: [{ nombre: "notas.md", bytes: 12, mime: "text/markdown" }],
      }),
    ]);
    const p = conAperturas();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    aplicarFeedback(disco, "t1", "sí, con histórico");
    corredor.revisar();
    await corredor.asentar();
    expect(p.encargos[0]).toContain("sí, con histórico");
    expect(p.encargos[0]).toContain("/adjuntos/notas.md");
    p.acabar();
    await corredor.asentar();
    await corredor.parar();
  });

  it("una carpeta que el puerto NO puede resolver no se monta: falla cerrado", async () => {
    // `carpetaDeAdjuntos` devuelve `undefined` cuando el id no es un segmento llano o su
    // camino real se sale de la cola (un enlace simbólico plantado ahí). Entonces no se monta
    // nada — nunca se compone una ruta a mano para salir del paso.
    const { disco } = discoDeMentira([TAREA({ adjuntos: [{ nombre: "x.md", bytes: 1 }] })]);
    const p = conAperturas();
    const corredor = crearCorredorDeTareas({
      ...ENTREGA_VERDE,
      disco: { ...disco, carpetaDeAdjuntos: () => undefined },
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(p.aperturas).toEqual([{ raiz: "/w/A" }]);
    p.acabar();
    await corredor.asentar();
    await corredor.parar();
  });
});

describe("lo que una tarea AUTORIZÓ se guarda con su estado", () => {
  /**
   * Desde §0 del diseño una tarea aplica sus escrituras sin aprobación, y su autorización
   * es el acto de crearla. Lo que queda entonces es el REGISTRO: nadie vio el diff antes,
   * así que la única pista de qué tocó es lo que se apunte aquí. Con los NOMBRES y no un
   * contador, igual que el aviso de honestidad de `seAplicaSinAprobacion`.
   */
  it("una tarea que autoriza y termina deja los ficheros en el índice, RELATIVOS", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    // Dos tandas, como un turno de verdad: se autoriza en varias rondas de aprobación.
    p.autorizar(["/src/lista.js"]);
    p.autorizar(["/app.xne", "/src/lista.js"]);
    p.acabar();
    await corredor.asentar();

    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("terminada");
    // Sin repetidos, en orden, y sin la barra del backend virtual: de aquí sale lo que el
    // juez de la entrega lee, y estas cadenas viven en un fichero del usuario.
    expect(tarea.autorizadas).toEqual(["src/lista.js", "app.xne"]);
    for (const ruta of tarea.autorizadas!) {
      expect(ruta.startsWith("/")).toBe(false);
      expect(ruta).not.toContain(tarea.proyecto.raiz);
    }
    await corredor.parar();
  });

  it("y también al APARCAR: lo que se autorizó antes de pararse no se pierde", async () => {
    // El caso de verdad: la tarea escribe dos ficheros y DESPUÉS pregunta algo que necesita
    // a una persona. El motivo explica por qué paró; lo autorizado dice qué dejó tocado, y
    // las dos cosas hacen falta para poder atenderla.
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    p.autorizar(["/app.xne"]);
    p.aparcar("el agente preguntó y no había nadie");
    p.acabar();
    await corredor.asentar();

    expect(estado()[0]).toMatchObject({
      estado: "requiere-atencion",
      motivo: expect.stringMatching(/preguntó/),
      autorizadas: ["app.xne"],
    });
    await corredor.parar();
  });

  it("un turno que no autorizó nada lo dice con `[]`, que NO es lo mismo que no constar", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar();
    await corredor.asentar();
    expect(estado()[0]!.autorizadas).toEqual([]);
    await corredor.parar();
  });

  it("una tarea que ni pudo ABRIR su proyecto se queda sin el campo: ausente es «no se sabe»", async () => {
    /**
     * La trampa de siempre, y aquí la dirección importa: esta tarea no corrió ningún turno
     * —su carpeta se movió—, así que no se puede afirmar que no autorizara nada. Escribir
     * `[]` sería contar como medido lo que nadie midió, y el juez de la entrega lo leería
     * como «corrió y no tocó nada».
     */
    const { disco, estado } = discoDeMentira([TAREA()]);
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: async () => {
        throw new Error("falta su .xonecode/config.json");
      },
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await corredor.asentar();
    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("requiere-atencion");
    expect("autorizadas" in tarea).toBe(false);
    await corredor.parar();
  });

  it("el ÚLTIMO RECURSO también lo guarda: era el único de los cuatro caminos que lo perdía", async () => {
    /**
     * El `.catch` que envuelve a `correr` es el último recurso: se toma cuando `correr` se
     * rompe por su cuenta DESPUÉS del turno. El registro de unas escrituras que nadie
     * aprobó no puede perderse justo ahí — es el mismo argumento de la regla de `sesion`:
     * lo que se pierde cuando algo falla es lo que nadie podrá revisar después.
     *
     * Se llega con un índice que falla A RATOS, que es la forma real de llegar: la
     * escritura final revienta, `aparcar` no puede escribir tampoco, y el `listar` de
     * `renunciarSiSigueNueva` —que no está envuelto en nada— se lleva la excepción fuera de
     * `correr`. Con el disco recuperado un instante después, este camino sí puede escribir,
     * y lo que escriba tiene que llevar lo autorizado.
     */
    const base = discoDeMentira([TAREA()]);
    let guardadas = 0;
    /** Lecturas que quedan por reventar. Se arma al fallar la escritura final. */
    let listadosRotos = 0;
    const disco: TareasEnDisco = {
      ...base.disco,
      listar: () => {
        if (listadosRotos > 0) {
          listadosRotos -= 1;
          throw Object.assign(new Error("EIO: no se puede leer el índice"), { code: "EIO" });
        }
        return base.disco.listar();
      },
      guardar: (t) => {
        guardadas += 1;
        // La primera es la marca de «en proceso»; la segunda es el estado final.
        if (guardadas === 2) {
          listadosRotos = 2;
          throw Object.assign(new Error("EIO: no se puede escribir el índice"), { code: "EIO" });
        }
        base.disco.guardar(t);
      },
    };
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    p.autorizar(["/app.xne", "/src/lista.js"]);
    p.acabar();
    await corredor.asentar();

    // Aparcada por el último recurso —no «terminada», que sería mentira— y CON el registro.
    expect(base.estado()[0]).toMatchObject({
      estado: "requiere-atencion",
      motivo: expect.stringMatching(/no pudo con ella/),
      autorizadas: ["app.xne", "src/lista.js"],
    });
    await corredor.parar();
  });

  it("el corte por cierre también lo guarda: la consola se fue, lo escrito sigue escrito", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      esperaAlParar: 50,
    });
    await corredor.arrancar();
    await corredor.asentar();
    p.autorizar(["/app.xne"]);
    await corredor.parar();
    expect(estado()[0]).toMatchObject({
      estado: "requiere-atencion",
      motivo: MOTIVO_CORTADA_POR_CIERRE,
      autorizadas: ["app.xne"],
    });
  });
});

/**
 * Task 14: `descartar` corta el turno en vuelo ANTES de borrar — medido a partir de lo que
 * `parar()` ya sabía hacer (`entrada.cortar`), no inventado. La razón: sin cortar, el turno
 * de una tarea `en-proceso` seguía corriendo —y escribiendo en el proyecto— después de que
 * la tarea desapareciera del kanban, y su carpeta de adjuntos (montada viva como
 * `/adjuntos/`) se borraba por debajo mientras el turno la seguía usando.
 */
describe("Corredor.cortar(id): la salida que usa `descartar` antes de borrar", () => {
  it("sin nada en vuelo con ese id, no hay nada que cortar: resuelve `true` en el acto", async () => {
    const { disco } = discoDeMentira([TAREA({ estado: "nuevo" })]);
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: async () => {
      throw new Error("no debería llamarse: nada corre todavía");
    }, pid: 1, concurrencia: () => 1 });
    await expect(corredor.cortar("t1")).resolves.toBe(true);
    await corredor.parar();
  });

  /**
   * El caso común: la tarea ya está corriendo (la consola está abierta), así que cortar
   * ABORTA el turno de verdad — la misma `AbortError` que `parar()` ya sabe contar — y solo
   * ESA tarea se ve afectada.
   */
  it("con la tarea en vuelo, corta SU turno —y solo el suyo— y resuelve `true`", async () => {
    const { disco, estado } = discoDeMentira([TAREA({ id: "t1" }), TAREA({ id: "t2", proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } })]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 2 });
    await corredor.arrancar();
    await corredor.asentar();
    expect(p.encargos.length).toBe(2);

    await expect(corredor.cortar("t1")).resolves.toBe(true);

    // La cortada quedó aparcada CON el motivo de un corte, no de un fallo — es la
    // comprobación exacta que el docblock de `entrada.cortarPedido` promete: sin ella,
    // `motivo` habría salido «el turno falló (AbortError)», que es falso.
    expect(estado().find((t) => t.id === "t1")).toMatchObject({
      estado: "requiere-atencion",
      motivo: MOTIVO_CORTADA_POR_CIERRE,
    });
    // La OTRA tarea ni se enteró: sigue en vuelo, sin motivo ni marca de corte.
    expect(estado().find((t) => t.id === "t2")).toMatchObject({ estado: "en-proceso" });
    expect(p.cierres).toEqual(["/w/A"]);

    await corredor.parar();
  });

  /**
   * La carrera MEDIDA: `cortar(id)` llega mientras `abrirParaTarea` todavía no ha resuelto
   * —la consola no existe, `entrada.cortar` sigue siendo el de mentira—. Sin `cortarPedido`,
   * ese corte no haría nada y el turno arrancaría un instante después de haber sido
   * «cortado». Con él, `correr()` lo ve en cuanto abre y nunca llega a marcar «en proceso»
   * ni a mandar el encargo.
   */
  it("pedir el corte MIENTRAS la consola se abre igual impide que el turno arranque", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    let dejarAbrir: (() => void) | undefined;
    const p = proyectoDeMentira();
    const abriendo = new Promise<void>((r) => void (dejarAbrir = r));
    const corredor = crearCorredorDeTareas({
      ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: async (raiz) => {
        await abriendo; // se queda aquí hasta que el test suelte el cerrojo
        return p.abrir(raiz);
      },
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    // La tarea sigue en «nuevo»: `abrirParaTarea` está bloqueada, así que `correr()` no ha
    // llegado ni a reasignar `entrada.cortar`.
    expect(estado()[0]).toMatchObject({ estado: "nuevo" });

    const cortando = corredor.cortar("t1");
    dejarAbrir!();
    await expect(cortando).resolves.toBe(true);

    // Nunca llegó a correr: cero encargos mandados, y sigue en «nuevo» — no «requiere-
    // atencion» con un motivo inventado, porque nunca se marcó «en proceso».
    expect(p.encargos).toEqual([]);
    expect(estado()[0]).toMatchObject({ estado: "nuevo" });

    await corredor.parar();
  });

  /**
   * El plazo, igual que `parar()`: si la consola no suelta a tiempo, `cortar` dice que NO se
   * puede seguir en vez de fingir que sí. Es la única señal con la que `atenderAccionDeTarea`
   * (`arranque.ts`) puede negarse a borrar una tarea cuyo turno sigue de verdad en marcha.
   */
  it("si la consola no suelta a tiempo, resuelve `false`: no está seguro borrar todavía", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    const encargos: string[] = [];
    const corredor = crearCorredorDeTareas({
      ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: async (raiz) => ({
        raiz,
        idDeHilo: "hilo",
        correrTarea: async (encargo) => {
          encargos.push(encargo);
          return new Promise(() => {}); // nunca devuelve
        },
        cerrar: async () => new Promise(() => {}), // nunca suelta
      }),
      pid: 1,
      concurrencia: () => 1,
      esperaAlParar: 20,
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(encargos.length).toBe(1);

    await expect(corredor.cortar("t1")).resolves.toBe(false);
    // Y no se mintió tampoco en el índice: sigue «en proceso», no una «requiere-atencion»
    // que no ha pasado todavía.
    expect(estado()[0]).toMatchObject({ estado: "en-proceso" });
  });
});

/**
 * Task 12: «requiere-atencion» dejó de ser terminal — se resuelve editando la tarea para
 * añadir el feedback del usuario, y la tarea sigue **en su mismo hilo** (§0 del diseño).
 *
 * Lo que hace que esto no sea de mentira es que `abrirParaTarea` recibe la `sesion` de la
 * tarea y la REENVÍA — la costura real está en `vestibulo.ts#construirConsolaDeProyecto`
 * (`idSesion = sesion ?? randomUUID()`), y esta batería solo prueba el CONTRATO desde este
 * lado: qué se le pide a `abrirParaTarea` y qué se le manda al turno. La MEDIDA de punta a
 * punta —que la conversación de verdad continúa, no solo que el id coincide— vive en
 * `describe("el volcado de la sesión de una tarea", …)`, con git y el vestíbulo reales.
 */
describe("el feedback reanuda una tarea, en su mismo hilo", () => {
  it("añadir feedback devuelve la tarea al lazo, en su mismo hilo", async () => {
    // `requiere-atencion` dejó de ser terminal: es una pregunta al desarrollador. Y la
    // respuesta entra como mensaje de USUARIO en el hilo que ya existe, igual que los
    // hallazgos del verificador — un encargo nuevo perdería todo lo que la tarea ya sabe.
    const d = discoDeMentira([
      TAREA({ estado: "requiere-atencion", motivo: "¿la colección lleva histórico?", sesion: "s1" }),
    ]);
    const recibidos: string[] = [];
    const corredor = crearCorredorDeTareas({
      ...ENTREGA_VERDE,
      disco: d.disco,
      abrirParaTarea: async (raiz) => ({
        raiz,
        idDeHilo: "s1",
        correrTarea: async (p) => {
          recibidos.push(p);
          return { verificador: "verde", pendientes: 0 };
        },
        cerrar: async () => {},
      }),
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    aplicarFeedback(d.disco, "t1", "sí, con histórico");
    corredor.revisar();
    await corredor.asentar();
    expect(recibidos.join(" ")).toContain("sí, con histórico");
    expect(d.estado()[0]!.sesion).toBe("s1");
    await corredor.parar();
  });

  it("un feedback vacío se rechaza: devolvería la tarea al lazo sin nada nuevo", () => {
    const d = discoDeMentira([TAREA({ estado: "requiere-atencion", motivo: "?" })]);
    expect(aplicarFeedback(d.disco, "t1", "   ")).toEqual({ hecho: false, motivo: expect.any(String) });
    expect(d.estado()[0]!.estado).toBe("requiere-atencion");
  });

  it("reanuda pidiendo la MISMA sesión a `abrirParaTarea` — no se pierde al reanudar (mutación: pasar `undefined` siempre)", async () => {
    const recibidas: (string | undefined)[] = [];
    const d = discoDeMentira([TAREA({ estado: "requiere-atencion", motivo: "?", sesion: "s1" })]);
    const corredor = crearCorredorDeTareas({
      ...ENTREGA_VERDE,
      disco: d.disco,
      abrirParaTarea: async (raiz, sesion) => {
        recibidas.push(sesion);
        return {
          raiz,
          idDeHilo: sesion ?? "una-nueva",
          correrTarea: async () => ({ verificador: "verde", pendientes: 0 }),
          cerrar: async () => {},
        };
      },
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    aplicarFeedback(d.disco, "t1", "sigue así");
    corredor.revisar();
    await corredor.asentar();
    // El `undefined` es de la primera vez que se despacha «nuevo» a secas, sin feedback —
    // el arranque normal de la tarea, antes de aparcarla — y no está aquí porque la
    // fixture ya nace `requiere-atencion`: solo se pide UNA vez, y es con «s1».
    expect(recibidas).toEqual(["s1"]);
    expect(d.estado()[0]!.sesion).toBe("s1");
    await corredor.parar();
  });

  it("sin sesión que reanudar, el feedback se manda con el ENCARGO delante y lo DICE: no finge que continúa", async () => {
    // El caso de la regla de `sesion`: se aparcó ANTES de tener nada abrible —el proyecto
    // no se pudo abrir, o el turno se cortó a mitad y `sesion` ya se limpió— y aun así
    // llega un feedback. El hilo que se abre es uno EN BLANCO, así que mandarle solo el
    // feedback sería una frase sin sujeto.
    const recibidos: string[] = [];
    const d = discoDeMentira([
      TAREA({ estado: "requiere-atencion", motivo: "no se pudo abrir el proyecto", encargo: "arregla el login" }),
    ]);
    const corredor = crearCorredorDeTareas({
      ...ENTREGA_VERDE,
      disco: d.disco,
      abrirParaTarea: async (raiz, sesion) => ({
        raiz,
        idDeHilo: sesion ?? "hilo-nuevo",
        correrTarea: async (p) => {
          recibidos.push(p);
          return { verificador: "verde", pendientes: 0 };
        },
        cerrar: async () => {},
      }),
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    aplicarFeedback(d.disco, "t1", "sí, con histórico");
    corredor.revisar();
    await corredor.asentar();
    expect(recibidos).toEqual([peticionDeFeedback("arregla el login", "sí, con histórico", false)]);
    expect(recibidos[0]).toContain(AVISO_SIN_HILO_REANUDABLE);
    expect(recibidos[0]).toContain("arregla el login");
    expect(recibidos[0]).toContain("sí, con histórico");
    // Y de verdad se abrió un hilo NUEVO — no el que ya no existía.
    expect(d.estado()[0]!.sesion).toBe("hilo-nuevo");
    await corredor.parar();
  });

  it("dos feedbacks seguidos: el segundo no borra el primero, y no se REPROCESA el ya consumido", async () => {
    const recibidos: string[] = [];
    const d = discoDeMentira([TAREA({ estado: "requiere-atencion", motivo: "primera", sesion: "s1" })]);
    const corredor = crearCorredorDeTareas({
      ...ENTREGA_VERDE,
      disco: d.disco,
      abrirParaTarea: async (raiz, sesion) => ({
        raiz,
        idDeHilo: sesion ?? "nueva",
        correrTarea: async (p) => {
          recibidos.push(p);
          // La primera vuelta vuelve a aparcar (verificador rojo), para poder comprobar el
          // SEGUNDO feedback sobre una tarea que ya consumió el primero.
          return recibidos.length === 1 ? { verificador: "rojo", pendientes: 0 } : { verificador: "verde", pendientes: 0 };
        },
        cerrar: async () => {},
      }),
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    aplicarFeedback(d.disco, "t1", "primero");
    corredor.revisar();
    await corredor.asentar();
    expect(d.estado()[0]!.estado).toBe("requiere-atencion");
    expect(d.estado()[0]!.sesion).toBe("s1");
    expect(d.estado()[0]!.feedback).toEqual([{ texto: "primero", creado: expect.any(String), consumido: true }]);

    aplicarFeedback(d.disco, "t1", "segundo");
    corredor.revisar();
    await corredor.asentar();

    // Sin marcar «primero» como consumido, esta segunda vuelta lo habría vuelto a mandar
    // en vez de avanzar a «segundo» — es la mutación que este test caza.
    expect(recibidos).toEqual(["primero", "segundo"]);
    expect(d.estado()[0]!.feedback).toEqual([
      { texto: "primero", creado: expect.any(String), consumido: true },
      { texto: "segundo", creado: expect.any(String), consumido: true },
    ]);
    expect(d.estado()[0]!.estado).toBe("terminada");
    await corredor.parar();
  });
});

describe("crearCorredorDeTareas", () => {
  it("al arrancar, una tarea «en proceso» de otro proceso se APARCA", async () => {
    // Dejarla diciendo «en proceso» sin nadie ejecutándola sería afirmar lo que no se sabe.
    const { disco, estado } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 999 })]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    expect(estado()[0]).toMatchObject({ estado: "requiere-atencion", motivo: expect.stringMatching(/cerró/i) });
    await corredor.parar();
  });

  it("MEDIDO: se reconcilia TODA «en proceso», también una con NUESTRO pid", async () => {
    /**
     * El pid se REUSA —tras un reinicio los contadores vuelven a empezar—, así que
     * `t.pid !== pid` deja pasar la tarea del proceso muerto que casualmente tenía este
     * número, y esa se queda «en proceso» para siempre: nadie la ejecuta, no se puede
     * reintentar (no hay transición desde `en-proceso`) y su proyecto queda ocupado para
     * el planificador. La comprobación buena no es el pid: es que al ARRANCAR este proceso
     * no tiene ninguna tarea en vuelo por construcción, así que toda «en proceso» es vieja.
     */
    const { disco, estado } = discoDeMentira([
      TAREA({ id: "ajena", estado: "en-proceso", pid: 999 }),
      TAREA({ id: "mia", estado: "en-proceso", pid: 1, proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } }),
    ]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 2 });
    await corredor.arrancar();
    expect(estado().map((t) => t.estado)).toEqual(["requiere-atencion", "requiere-atencion"]);
    // Y la sesión se CONSERVA: es lo que deja abrir la conversación para ver por dónde iba.
    await corredor.parar();
  });

  it("la reconciliación deja el motivo ACCIONABLE y con el pid, no un «Error:» de Node", async () => {
    const { disco, estado } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 999, sesion: "s7" })]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    const motivo = estado()[0]!.motivo!;
    // MEDIDO (ver el informe): un turno cortado a mitad no deja NADA en el índice de
    // sesiones —`volcar()` corre en el `finally`— pero el hilo del checkpointer sí existe.
    // El motivo tiene que decir las dos cosas, que es lo que hace accionable la tarjeta.
    expect(motivo).toMatch(/pid 999/);
    expect(motivo).toMatch(/reintenta/i);
    expect(motivo).not.toMatch(/^Error/);
    // La sesión sobrevive al aparcado: sin ella no se puede abrir el hilo a medias.
    expect(estado()[0]!.sesion).toBe("s7");
    await corredor.parar();
  });

  it("un hilo que no nombra nada ABRIBLE se olvida, y `sesion` se limpia", async () => {
    /**
     * La regla: `sesion` sobrevive si y solo si hay algo que una persona pueda abrir. En el
     * corte a mitad de turno que medí no hay transcript —`volcar()` corre en el `finally`,
     * así que no hay ni entrada en el índice— pero el hilo del checkpointer sí está: un id
     * que no lleva a ninguna parte y decenas de megas que nadie puede alcanzar ni borrar
     * desde la interfaz. Se olvida el hilo y se quita el campo.
     */
    const { disco, estado } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 999, sesion: "s9" })]);
    const olvidados: string[] = [];
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      sesionAbrible: () => false,
      olvidarHilo: async (raiz, sesion) => void olvidados.push(`${raiz}|${sesion}`),
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(olvidados).toEqual(["/w/A|s9"]);
    expect(estado()[0]!.estado).toBe("requiere-atencion");
    expect(estado()[0]!.sesion).toBeUndefined();
    await corredor.parar();
  });

  it("y si la conversación SÍ se puede abrir, no se toca ni el hilo ni el campo", async () => {
    // Es la mitad que hace que la regla no sea «borra siempre»: con transcript volcado, la
    // sesión está en el índice del proyecto y se lee desde la barra lateral.
    const { disco, estado } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 999, sesion: "s9" })]);
    const olvidados: string[] = [];
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      sesionAbrible: () => true,
      olvidarHilo: async (raiz, sesion) => void olvidados.push(`${raiz}|${sesion}`),
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(olvidados).toEqual([]);
    expect(estado()[0]!.sesion).toBe("s9");
    await corredor.parar();
  });

  /**
   * F2 de la revisión final. `MOTIVO_CORTADA_POR_CIERRE` afirmaba «aunque el agente recuerda
   * el hilo» y se escribía TAMBIÉN en la rama donde `olvidarSiNoSePuedeAbrir` acaba de
   * BORRAR el checkpoint: era cierto cuando se escribió (`5ba53c8`) y dos commits después
   * (`7ad4962`) dejó de serlo, sin que nadie revisara el texto. Los dos commits eran
   * correctos contra su propio brief; la contradicción solo se ve leyéndolos juntos.
   *
   * La tarjeta miente entonces sobre lo que pasó Y sobre lo que va a pasar al reintentar:
   * el agente NO recuerda nada, y ese turno arranca un hilo nuevo con el encargo entero
   * (`AVISO_SIN_HILO_REANUDABLE`, que sí dice la verdad… pero al modelo, no a la persona
   * que tiene que decidir).
   */
  it("si el hilo se OLVIDÓ, el motivo no dice que el agente lo recuerda", async () => {
    const { disco, estado } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 999, sesion: "s9" })]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      sesionAbrible: () => false,
      olvidarHilo: async () => undefined,
    });
    await corredor.arrancar();
    await corredor.asentar();
    const motivo = estado()[0]!.motivo!;
    expect(motivo).not.toMatch(/recuerda/);
    expect(motivo).toMatch(/de cero|desde el principio|el encargo entero/);
    expect(motivo).toBe(motivoDeCorteAMitad(true) + " (era el pid 999)");
    await corredor.parar();
  });

  it("y si el hilo SOBREVIVIÓ, sigue diciendo que el agente lo recuerda", async () => {
    // La otra mitad: aquí el texto viejo es la verdad, y por eso no se cambió por uno
    // genérico — un texto que valga para las dos situaciones no diría ninguna de las dos.
    const { disco, estado } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 999, sesion: "s9" })]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      sesionAbrible: () => true,
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(estado()[0]!.motivo).toBe(MOTIVO_CORTADA_POR_CIERRE + " (era el pid 999)");
    await corredor.parar();
  });

  /**
   * Y el mismo texto se escribe por el OTRO camino —el turno cortado al parar el proceso—,
   * así que también ahí tiene que depender de si el hilo sobrevivió.
   */
  it("al PARAR con el hilo olvidado, el mismo motivo corregido", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      esperaAlParar: 50,
      sesionAbrible: () => false,
      olvidarHilo: async () => undefined,
    });
    await corredor.arrancar();
    await corredor.asentar();
    await corredor.parar();
    expect(estado()[0]!.motivo).toBe(motivoDeCorteAMitad(true));
    expect(estado()[0]!.sesion).toBeUndefined();
  });

  it("sin puerto que lo diga NO se borra nada: «no se sabe» no es «no hay»", async () => {
    // Quitar la `sesion` y olvidar un hilo son destructivos, así que sin nadie que pueda
    // afirmar que no hay nada abrible se conserva — la misma dirección conservadora que
    // `historica` cuando no se puede preguntar al checkpointer.
    const { disco, estado } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 999, sesion: "s9" })]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    expect(estado()[0]!.sesion).toBe("s9");
    await corredor.parar();
  });

  it("la misma regla al ACABAR: un turno que no dejó conversación no deja `sesion`", async () => {
    // No es solo de la reconciliación: un turno que revienta antes de emitir un solo acto
    // cierra sin volcar nada, y su id tampoco nombraría nada abrible.
    const olvidados: string[] = [];
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      sesionAbrible: () => false,
      olvidarHilo: async (raiz, sesion) => void olvidados.push(`${raiz}|${sesion}`),
    });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar();
    await corredor.asentar();
    expect(estado()[0]!.estado).toBe("terminada");
    expect(estado()[0]!.sesion).toBeUndefined();
    expect(olvidados).toEqual(["/w/A|hilo-/w/A"]);
    await corredor.parar();
  });

  /**
   * «No soy yo» y «no hay nadie» son la diferencia entre ESPERAR y que no vaya a pasar nada:
   * un aviso que manda a esperar a un proceso que no existe es peor que uno mudo. El
   * corredor ya lo sabe —`tomarCerrojo` distingue las dos— y lo dice sin el pid, que es un
   * dato de la máquina y no le aporta nada a quien lee.
   */
  describe("quién ejecuta las tareas de la máquina", () => {
    it("con el cerrojo NUESTRO: aquí, y no hay ningún otro dueño", async () => {
      const { disco } = discoDeMentira([]);
      const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: proyectoDeMentira().abrir, pid: 1, concurrencia: () => 1 });
      await corredor.arrancar();
      expect(corredor.corriendoAqui()).toBe(true);
      expect(corredor.ejecutaOtroProceso()).toBe(false);
      await corredor.parar();
    });

    it("con el cerrojo de OTRO: no aquí, y sí hay dueño", async () => {
      const { disco } = discoDeMentira([], { tomado: false, dePid: 77 });
      const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: proyectoDeMentira().abrir, pid: 1, concurrencia: () => 1 });
      await corredor.arrancar();
      expect(corredor.corriendoAqui()).toBe(false);
      expect(corredor.ejecutaOtroProceso()).toBe(true);
      await corredor.parar();
    });

    it("antes de arrancar no se afirma nada: no se ha mirado", () => {
      const { disco } = discoDeMentira([]);
      const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: proyectoDeMentira().abrir, pid: 1, concurrencia: () => 1 });
      expect(corredor.ejecutaOtroProceso()).toBeUndefined();
    });

    it("si el cerrojo ni se pudo mirar, tampoco se afirma nada", async () => {
      // `tomarCerrojo` lanza con lo que no es EEXIST/ENOENT: un `~/.xonecode/tareas` que no
      // se puede escribir. Entonces no se sabe si otro proceso las ejecuta — y decir «nadie»
      // sería afirmar lo que no se ha podido leer.
      const { disco } = discoDeMentira([]);
      const roto: TareasEnDisco = {
        ...disco,
        tomarCerrojo: () => {
          throw new Error("EACCES");
        },
      };
      const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco: roto, abrirParaTarea: proyectoDeMentira().abrir, pid: 1, concurrencia: () => 1 });
      await corredor.arrancar();
      expect(corredor.corriendoAqui()).toBe(false);
      expect(corredor.ejecutaOtroProceso()).toBeUndefined();
    });

    it("y si lo TOMAMOS pero el arranque revienta después, no hay dueño: nadie las ejecuta", async () => {
      // Este es el caso que hace que «nadie» sea alcanzable y no una rama muerta: el cerrojo
      // era nuestro, se ha soltado, y nadie más lo tenía. Una tarea creada aquí no va a
      // arrancar hasta que alguna consola tome el relevo, y eso NO es «espera a que el otro
      // proceso mire».
      const { disco } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 9 })]);
      const roto: TareasEnDisco = {
        ...disco,
        guardar: () => {
          throw new Error("EACCES");
        },
      };
      const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco: roto, abrirParaTarea: proyectoDeMentira().abrir, pid: 1, concurrencia: () => 1 });
      await corredor.arrancar();
      expect(corredor.corriendoAqui()).toBe(false);
      expect(corredor.ejecutaOtroProceso()).toBe(false);
    });

    it("perder el cerrojo en marcha es que lo tiene OTRO", async () => {
      const { disco, perderElCerrojo } = discoDeMentira([]);
      const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: proyectoDeMentira().abrir, pid: 1, concurrencia: () => 1 });
      await corredor.arrancar();
      perderElCerrojo();
      corredor.revisar();
      expect(corredor.corriendoAqui()).toBe(false);
      expect(corredor.ejecutaOtroProceso()).toBe(true);
      await corredor.parar();
    });
  });

  it("sin cerrojo no ejecuta, y lo dice", async () => {
    const dichos: string[] = [];
    const { disco, estado } = discoDeMentira([TAREA()], { tomado: false, dePid: 77 });
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 2,
      informar: (t) => dichos.push(t),
    });
    await corredor.arrancar();
    expect(corredor.corriendoAqui()).toBe(false);
    expect(p.encargos).toEqual([]);
    expect(estado()[0]!.estado).toBe("nuevo");
    expect(dichos.join(" ")).toMatch(/77/);
    await corredor.parar();
  });

  it("sin cerrojo NO se reconcilia: las «en proceso» de quien manda están corriendo de verdad", async () => {
    // Aparcar la tarea de otro proceso vivo la mataría desde fuera: el kanban diría
    // «requiere atención» de algo que está escribiendo ficheros en este mismo instante.
    const { disco, estado } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 77 })], {
      tomado: false,
      dePid: 77,
    });
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 2 });
    await corredor.arrancar();
    expect(estado()[0]).toMatchObject({ estado: "en-proceso", pid: 77 });
    await corredor.parar();
  });

  it("una tarea que acaba limpia queda TERMINADA, y se le manda el ENCARGO", async () => {
    const { disco, estado } = discoDeMentira([TAREA({ encargo: "El encargo augmentado" })]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    expect(p.encargos).toEqual(["El encargo augmentado"]);
    expect(estado()[0]).toMatchObject({ estado: "en-proceso", pid: 1, sesion: "hilo-/w/A" });
    p.acabar();
    await corredor.asentar();
    expect(estado()[0]!.estado).toBe("terminada");
    await corredor.parar();
  });

  it("si la consola aparca, la tarea acaba en «requiere atención» con SU motivo", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    p.aparcar("2 escritura(s) esperando la aprobación de una persona: src/app.xne");
    p.acabar();
    await corredor.asentar();
    expect(estado()[0]).toMatchObject({
      estado: "requiere-atencion",
      motivo: "2 escritura(s) esperando la aprobación de una persona: src/app.xne",
    });
    await corredor.parar();
  });

  it("la consola se CIERRA antes de escribir el estado final", async () => {
    // Solo las `en-proceso` ocupan su proyecto, así que aparcar con la sesión abierta
    // dejaría arrancar otra tarea sobre el mismo — dos turnos sobre el mismo disco.
    const orden: string[] = [];
    const { disco } = discoDeMentira([TAREA()]);
    const original = disco.guardar.bind(disco);
    disco.guardar = (t) => {
      orden.push("guardar");
      original(t);
    };
    let acabar: (() => void) | undefined;
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: async (raiz) => ({
        raiz,
        idDeHilo: "h",
        correrTarea: async () => new Promise<void>((r) => (acabar = r)),
        cerrar: async () => void orden.push("cerrar"),
      }),
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await corredor.asentar();
    acabar!();
    await corredor.asentar();
    // El último `guardar` (el estado final) va DESPUÉS del `cerrar`.
    expect(orden.lastIndexOf("cerrar")).toBeLessThan(orden.lastIndexOf("guardar"));
    await corredor.parar();
  });

  it("un proyecto que ya no está se aparca SIN ejecutarlo", async () => {
    // La tarea referencia su proyecto por ruta absoluta: mover la carpeta la deja huérfana,
    // y la dirección de fallo es no ejecutar — nunca ejecutar contra otra carpeta.
    const { disco, estado } = discoDeMentira([TAREA()]);
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: async () => {
        throw new Error("esa raíz no es un proyecto de xonecode: falta su .xonecode/config.json");
      },
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(estado()[0]).toMatchObject({
      estado: "requiere-atencion",
      motivo: expect.stringMatching(/no se pudo abrir/i),
    });
    expect(estado()[0]!.motivo).toMatch(/config\.json/);
    await corredor.parar();
  });

  it("y si lo que falla al abrir es de NODE, el motivo lleva el código y no la ruta", async () => {
    /**
     * La guarda de `abrirParaTarea` (`vestibulo.ts`) tiene un mensaje escrito para leerse en
     * el kanban y sin rutas a propósito — el del test de arriba. Pero DETRÁS de esa guarda
     * corren `dependenciasDeProyecto`, `crearEjecutor` y la foto de git, y cualquiera de
     * esos puede lanzar un error de Node con el home del usuario dentro. Se distinguen por
     * lo que los distingue de verdad: un error del sistema trae `code`.
     */
    const { disco, estado } = discoDeMentira([TAREA()]);
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: async () => {
        throw Object.assign(new Error("EACCES: permission denied, scandir '/Users/x/w/A/.xonecode'"), {
          code: "EACCES",
        });
      },
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await corredor.asentar();
    const motivo = estado()[0]!.motivo!;
    expect(motivo).toMatch(/no se pudo abrir el proyecto: EACCES/);
    expect(motivo).not.toContain("/Users/x/w/A");
    await corredor.parar();
  });

  it("un error del turno aparca con el motivo y NO lleva rutas de la máquina", async () => {
    /**
     * El mensaje de un error de Node lleva la ruta absoluta («ENOENT: … open
     * '/Users/quien-sea/w/A/app.xne'»), y el motivo se pinta en el kanban, que viaja por el
     * cable — que puede ir por un túnel. Se dice el CÓDIGO, como `codigoDe` en
     * `arranque.ts`, no el mensaje.
     */
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    const enoent = Object.assign(new Error("ENOENT: no such file or directory, open '/Users/x/w/A/app.xne'"), {
      code: "ENOENT",
    });
    p.romper(enoent);
    await corredor.asentar();
    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("requiere-atencion");
    expect(tarea.motivo).toMatch(/ENOENT/);
    expect(tarea.motivo).not.toContain("/Users/x/w/A/app.xne");
    // Y el corredor sigue en pie: la siguiente tarea se puede coger.
    expect(corredor.corriendoAqui()).toBe(true);
    await corredor.parar();
  });

  it("nunca dos del mismo proyecto, aunque haya hueco de concurrencia", async () => {
    const { disco } = discoDeMentira([
      TAREA({ id: "a", creada: "2026-09-08T10:00:01.000Z" }),
      TAREA({ id: "b", creada: "2026-09-08T10:00:02.000Z" }),
    ]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 5 });
    await corredor.arrancar();
    await corredor.asentar();
    expect(p.encargos).toHaveLength(1);
    await corredor.parar();
  });

  it("dos revisiones en el mismo tick no despachan la MISMA tarea dos veces", async () => {
    /**
     * La marca de «en proceso» se escribe DESPUÉS de abrir la consola (que es asíncrono),
     * así que entre elegir y marcar hay una ventana en la que el disco sigue diciendo
     * «nuevo». Dos revisiones en esa ventana —el arranque y un `crear` que llega del
     * cable— eligirían la misma tarea y abrirían dos consolas sobre el mismo proyecto.
     */
    const { disco } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 3 });
    await corredor.arrancar();
    corredor.revisar();
    corredor.revisar();
    await corredor.asentar();
    expect(p.encargos).toHaveLength(1);
    await corredor.parar();
  });

  it("`sigoSiendoDueño` se pregunta antes de CADA tarea, y al perderlo el lazo para", async () => {
    /**
     * La recogida de un cerrojo caduco no se puede hacer atómica con primitivas de
     * ficheros y deja un residuo declarado (`agent/tareasEnDisco.ts#recoger`): dos procesos
     * pueden creerse dueños. Lo que hace verdad «un solo corredor» es esta pregunta antes
     * de cada despacho — no la del arranque, que ya pasó.
     */
    const d = discoDeMentira([
      TAREA({ id: "a", creada: "2026-09-08T10:00:01.000Z" }),
      TAREA({ id: "b", creada: "2026-09-08T10:00:02.000Z", proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } }),
    ]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco: d.disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 2,
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(p.encargos).toHaveLength(2);

    // Nos lo quitan. La siguiente pasada no arranca nada más y el lazo se declara parado.
    d.perderElCerrojo();
    d.poner([...d.estado(), TAREA({ id: "c", creada: "2026-09-08T10:00:03.000Z", proyecto: { id: "pc", raiz: "/w/C", nombre: "C" } })]);
    corredor.revisar();
    await corredor.asentar();
    expect(p.encargos).toHaveLength(2);
    expect(corredor.corriendoAqui()).toBe(false);

    // Y NO se suelta el cerrojo: el fichero ya es de otro, y `soltarCerrojo` borraría el suyo.
    await corredor.parar();
    expect(d.soltados()).toBe(0);
  });

  it("y se pregunta A MITAD de la pasada: la segunda tarea ya no se despacha", async () => {
    // La comprobación de la pasada no basta: entre despachar una tarea y la siguiente, el
    // cerrojo puede haber cambiado de manos (la ventana de `recoger` es de un instante,
    // pero el residuo está declarado). La cuenta de llamadas es la única forma de medir
    // que se pregunta por CADA una y no una vez por pasada.
    const d = discoDeMentira([
      TAREA({ id: "a", creada: "2026-09-08T10:00:01.000Z" }),
      TAREA({ id: "b", creada: "2026-09-08T10:00:02.000Z", proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } }),
    ]);
    let preguntas = 0;
    // Cierta para la pasada y para la primera tarea; falsa a partir de la segunda.
    d.disco.sigoSiendoDueño = () => (preguntas += 1) <= 2;
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco: d.disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 5,
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(preguntas).toBeGreaterThanOrEqual(3);
    expect(p.encargos).toEqual(["e"]);
    expect(corredor.corriendoAqui()).toBe(false);
    await corredor.parar();
  });

  it("si el índice no se puede ESCRIBIR, se renuncia a la tarea en vez de reintentarla en bucle", async () => {
    /**
     * `revisar()` se dispara al terminar cada tarea y no hay ningún temporizador que frene
     * el lazo: una tarea que se queda en `nuevo` porque el índice no se puede escribir
     * —disco lleno, permisos— se volvería a elegir en el acto, y otra vez, y otra. Eso no
     * es un error que se lee: es una CPU al 100% sin decir nada. Medido con la transición
     * que faltaba (`nuevo → requiere-atencion`), que producía exactamente este lazo.
     */
    const dichos: string[] = [];
    const d = discoDeMentira([TAREA()]);
    d.disco.guardar = () => {
      throw Object.assign(new Error("EACCES: permission denied, open '/Users/x/.xonecode/tareas/indice.json'"), {
        code: "EACCES",
      });
    };
    let aperturas = 0;
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco: d.disco,
      abrirParaTarea: async (raiz) => {
        aperturas += 1;
        return { raiz, idDeHilo: "h", correrTarea: async () => {}, cerrar: async () => {} };
      },
      pid: 1,
      concurrencia: () => 1,
      informar: (t) => dichos.push(t),
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(aperturas).toBe(1);
    expect(d.estado()[0]!.estado).toBe("nuevo");
    // Y se dice, porque este fallo es del PROCESO —su cola no se puede escribir— y por eso
    // ni el motivo llegaría al kanban. Sin la ruta de la máquina, como todo lo que sale.
    expect(dichos.join(" ")).toMatch(/EACCES/);
    expect(dichos.join(" ")).not.toContain("/Users/x/.xonecode");
    // UNA vez, y con el código de verdad. Este camino pasaba por la renuncia dos veces —con
    // el error y, más abajo, sin él— y el segundo aviso decía «error» en vez del `EACCES`,
    // que es justo el dato con el que una persona arregla esto. Dos avisos para un hecho, y
    // el segundo peor que el primero, es cómo se aprende a no leerlos.
    expect(dichos.filter((t) => t.includes("no se pudo escribir el estado"))).toHaveLength(1);
    expect(dichos.join(" ")).not.toMatch(/\(error\)/);
    // Y una revisión más tampoco la vuelve a coger.
    corredor.revisar();
    await corredor.asentar();
    expect(aperturas).toBe(1);
    await corredor.parar();
  });

  it("si la COLA no se puede ni abrir, `arrancar` lo dice y la consola sigue en pie", async () => {
    /**
     * `tomarCerrojo` lanza ante cualquier cosa que no sea `EEXIST`/`ENOENT` — un
     * `~/.xonecode/tareas` sin permisos. Las tareas de fondo son una pieza más de la consola
     * web, así que un fallo aquí no puede tumbarla: es la misma regla que la conexión con
     * CloudStudio y la apertura del navegador. Quien está delante viene a trabajar en su
     * proyecto.
     */
    const dichos: string[] = [];
    const d = discoDeMentira([TAREA()]);
    d.disco.tomarCerrojo = () => {
      throw Object.assign(new Error("EACCES: permission denied, open '/Users/x/.xonecode/tareas/corredor.lock'"), {
        code: "EACCES",
      });
    };
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco: d.disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      informar: (t) => dichos.push(t),
    });
    await expect(corredor.arrancar()).resolves.toBeUndefined();
    expect(corredor.corriendoAqui()).toBe(false);
    expect(p.encargos).toEqual([]);
    expect(dichos.join(" ")).toMatch(/EACCES/);
    expect(dichos.join(" ")).not.toContain("/Users/x/.xonecode");
    // Y se intenta soltar igualmente, que es lo correcto y es seguro: `soltarCerrojo` solo
    // borra el cerrojo cuyo pid es el nuestro, así que un fallo ANTES de tomarlo no puede
    // llevarse el de otro proceso por delante. Lo que no puede pasar es lo contrario —
    // olvidarlo en memoria y dejarlo en disco—, que congela las tareas de toda la máquina.
    expect(d.soltados()).toBe(1);
    await corredor.parar();
    expect(d.soltados()).toBe(1);
  });

  it("`parar` lleva PLAZO: un cierre que no devuelve no cuelga el Ctrl-C, y se dice", async () => {
    /**
     * Un Ctrl-C que se queda esperando para siempre es lo peor que puede hacer este camino,
     * y el repo ya trata esta clase con tope (`TOPE_MS` de Codex, los `TOPES_MS` de adb).
     * Al agotarse NO se miente: la tarea se queda «en proceso» y el siguiente proceso la
     * reconcilia, que es exactamente para lo que existe la reconciliación.
     */
    const dichos: string[] = [];
    const d = discoDeMentira([TAREA()]);
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco: d.disco,
      // Una consola que se queda colgada al cerrar: el turno nunca devuelve.
      abrirParaTarea: async (raiz) => ({
        raiz,
        idDeHilo: "h",
        correrTarea: async () => new Promise<void>(() => {}),
        cerrar: () => new Promise<void>(() => {}),
      }),
      pid: 1,
      concurrencia: () => 1,
      // El plazo entra por parámetro, como `msDeEspera` de la consola web: `npm test` no
      // puede esperar un tope de verdad.
      esperaAlParar: 5,
      informar: (t) => dichos.push(t),
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(d.estado()[0]!.estado).toBe("en-proceso");

    await corredor.parar();
    // Se queda «en proceso» a propósito, y el aviso lo DICE.
    expect(d.estado()[0]!.estado).toBe("en-proceso");
    expect(dichos.join(" ")).toMatch(/en proceso/i);
    expect(dichos.join(" ")).toMatch(/reconcili/i);
    // El cerrojo se suelta igual: este proceso se va.
    expect(d.soltados()).toBe(1);
  });

  it("si la RECONCILIACIÓN revienta, el cerrojo se SUELTA: si no, se congela la máquina", async () => {
    /**
     * El peor fallo posible de esta pieza. Poner `miCerrojo = false` en memoria y dejar el
     * fichero en disco hace que `corriendoAqui()` mienta, que `parar()` no suelte nada
     * —cree que no lo tiene— y que las tareas de TODA la máquina se queden congeladas hasta
     * que el proceso muera: un cerrojo que existe para que no haya dos corredores acabando
     * con que no haya ninguno. Se suelta al dejar de ser corredor, no al creer que se dejó.
     */
    const dichos: string[] = [];
    const d = discoDeMentira([TAREA({ estado: "en-proceso", pid: 999 })]);
    d.disco.guardar = () => {
      throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    };
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco: d.disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      informar: (t) => dichos.push(t),
    });
    await corredor.arrancar();
    expect(corredor.corriendoAqui()).toBe(false);
    expect(d.soltados()).toBe(1);
    expect(dichos.join(" ")).toMatch(/EACCES/);
    // Y `parar` no lo suelta otra vez: ya se soltó.
    await corredor.parar();
    expect(d.soltados()).toBe(1);
  });

  it("con el cerrojo propio, `parar` SÍ lo suelta", async () => {
    const d = discoDeMentira([]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco: d.disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.parar();
    expect(d.soltados()).toBe(1);
  });

  it("una tarea que dejó de ser nuestra en disco NO se sobrescribe al acabar", async () => {
    /**
     * El otro lado de `sigoSiendoDueño`: la comprobación del despacho no cubre la
     * ESCRITURA final. Si entre medias el otro corredor reconcilió esta tarea y una persona
     * pulsó reintentar, ahora hay otro proceso corriéndola — y escribir «terminada» encima
     * la daría por buena sin que nadie la haya hecho, o peor, dejaría en `nuevo` una que ya
     * corre. Se relee por id y solo se escribe si sigue siendo la nuestra.
     */
    const d = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco: d.disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    // Otro proceso se la ha llevado.
    d.poner([TAREA({ estado: "en-proceso", pid: 999, sesion: "otro-hilo" })]);
    p.acabar();
    await corredor.asentar();
    expect(d.estado()[0]).toMatchObject({ estado: "en-proceso", pid: 999, sesion: "otro-hilo" });
    await corredor.parar();
  });

  it("una tarea DESCARTADA a mitad no resucita al acabar", async () => {
    const d = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco: d.disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    d.disco.borrarTarea("t1");
    p.acabar();
    await corredor.asentar();
    expect(d.estado()).toEqual([]);
    await corredor.parar();
  });

  it("si PREGUNTAR por la sesión lanza, la tarea acaba aparcada y la consola se cierra", async () => {
    /**
     * El bloque final de `correr` no puede quedarse sin guarda: una excepción ahí —el propio
     * `sesionAbrible`, que en producción lee el índice del proyecto— caía al `catch` genérico
     * del lazo, que aparcaba SIN pasar por la regla de `sesion` y sin cerrar la consola. Una
     * regla que se cumple salvo cuando algo falla no es una regla: es lo que pasa cuando todo
     * va bien.
     *
     * Y al no poder saber si hay algo abrible, NO se borra nada: «no se sabe» no es «no hay»,
     * la misma dirección que el puerto ausente.
     */
    const olvidados: string[] = [];
    const d = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco: d.disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      sesionAbrible: () => {
        throw Object.assign(new Error("EACCES: permission denied, open '/Users/x/w/A/.xonecode'"), {
          code: "EACCES",
        });
      },
      olvidarHilo: async (raiz, sesion) => void olvidados.push(`${raiz}|${sesion}`),
    });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar();
    await corredor.asentar();
    // No se queda «en proceso» —eso ocuparía su proyecto para siempre— y la consola no se
    // queda abierta: un handle por tarea que falle así.
    expect(d.estado()[0]!.estado).toBe("terminada");
    expect(d.estado()[0]!.sesion).toBe("hilo-/w/A");
    expect(olvidados).toEqual([]);
    expect(p.cierres).toEqual(["/w/A"]);
    await corredor.parar();
  });

  it("y si revienta la ESCRITURA del final, lo que se aparca DESPUÉS pasa por la misma regla", async () => {
    /**
     * El último recurso del bloque final también tiene que aplicar la regla de `sesion`: si
     * no, el único camino que se la salta es justo el de error.
     *
     * Y el test tiene que MIRAR LO ESCRITO, no que la regla se haya evaluado: la primera
     * versión comprobaba `olvidarHilo`, que corre ANTES de la escritura y por tanto pasaba
     * igual con la regla aplicada o no — comprobado por mutación, salía verde. Así que aquí
     * revienta SOLO la escritura de «terminada» y se deja pasar la de aparcado, que es la que
     * deja algo que leer.
     */
    const olvidados: string[] = [];
    const d = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    let escrituras = 0;
    const original = d.disco.guardar.bind(d.disco);
    d.disco.guardar = (t) => {
      escrituras += 1;
      // 1) la marca de «en proceso»; 2) la de «terminada», que revienta; 3) el aparcado.
      if (escrituras === 2) throw Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
      original(t);
    };
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco: d.disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      sesionAbrible: () => false,
      olvidarHilo: async (raiz, sesion) => void olvidados.push(`${raiz}|${sesion}`),
    });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar();
    await corredor.asentar();
    // Ni se queda «en proceso» sin nadie detrás, ni deja escrito un `sesion` que no nombra
    // nada abrible — y el hilo se olvidó una sola vez.
    expect(d.estado()[0]!.estado).toBe("requiere-atencion");
    expect(d.estado()[0]!.motivo).toMatch(/EIO/);
    expect(d.estado()[0]!.sesion).toBeUndefined();
    expect(olvidados).toEqual(["/w/A|hilo-/w/A"]);
    expect(p.cierres).toEqual(["/w/A"]);
    await corredor.parar();
  });

  it("una marca de «en proceso» que no se puede escribir tampoco deja la consola abierta", async () => {
    // El tercer camino sin guarda: la marca se escribe ANTES del `try` del turno, así que su
    // excepción se saltaba el `cortar()` del `finally`.
    const d = discoDeMentira([TAREA()]);
    d.disco.guardar = () => {
      throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    };
    let cerrados = 0;
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco: d.disco,
      abrirParaTarea: async (raiz) => ({
        raiz,
        idDeHilo: "h",
        correrTarea: async () => {},
        cerrar: async () => void (cerrados += 1),
      }),
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(cerrados).toBe(1);
    await corredor.parar();
  });

  /**
   * Este test EXIGÍA «terminada», y desde la puerta de la entrega ya no puede.
   *
   * Lo que protege sigue en pie y es lo que se comprueba: un turno que terminó su trabajo no
   * puede llevar el motivo de «cortada a mitad», que sería falso en el kanban —`volcar()` ya
   * escribió su conversación—. Lo que cambia es la otra mitad: «terminada» significa ahora
   * que las condiciones se midieron en verde Y que el juez dijo que el trabajo hace lo que
   * se pedía, y con el proceso cerrándose al juez no se le puede preguntar. Dar la tarea por
   * buena ahí sería entregar sin juez, que es justo lo que esta tanda impide. Así que se
   * aparca, con el motivo que dice exactamente qué pasó.
   */
  it("un turno que acaba LIMPIO justo al parar no se cuenta como cortado, pero tampoco se entrega", async () => {
    const d = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const juez = juezQueDice({ veredicto: "verde", resumen: "bien" });
    const corredor = crearCorredorDeTareas({
      disco: d.disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      juez,
      revisable: async () => ({ revisable: true, escribio: true }),
    });
    await corredor.arrancar();
    await corredor.asentar();
    /**
     * El turno resuelve y, en el mismo tick, alguien para el proceso. El orden es
     * load-bearing: `acabar()` resuelve la promesa del turno (una microtarea) y `parar()`
     * pone `parando` de forma SÍNCRONA antes de su primer `await`, así que `correr` sigue
     * con `terminoLimpio` y `parando` a la vez — la ventana exacta que la guarda cubre.
     */
    p.acabar();
    await corredor.parar();
    expect(d.estado()[0]!.estado).toBe("requiere-atencion");
    expect(d.estado()[0]!.motivo).toContain("antes de evaluar la entrega");
    // Y NO el de la reconciliación, que aquí mentiría: la conversación sí se guardó.
    expect(d.estado()[0]!.motivo).not.toContain(MOTIVO_CORTADA_POR_CIERRE);
    // Al juez no se le preguntó: el proceso se va, y una llamada de modelo que nadie va a
    // esperar es tiempo y dinero por nada.
    expect(juez.casos).toHaveLength(0);
  });

  it("GANA LA PERSONA: no arranca nada en un proyecto cuya consola está abierta", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    let abiertoPorAlguien: string | undefined = "/w/A";
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 2,
      bloqueados: () => (abiertoPorAlguien === undefined ? [] : [abiertoPorAlguien]),
    });
    await corredor.arrancar();
    await corredor.asentar();
    // Espera: sigue en `nuevo`, sin motivo — no es un fallo, es que no le toca todavía.
    expect(p.encargos).toEqual([]);
    expect(estado()[0]!.estado).toBe("nuevo");
    expect(estado()[0]!.motivo).toBeUndefined();

    // La persona cierra el proyecto y alguien vuelve a revisar: ahora sí.
    abiertoPorAlguien = undefined;
    corredor.revisar();
    await corredor.asentar();
    expect(p.encargos).toHaveLength(1);
    await corredor.parar();
  });

  it("`parar` corta lo que esté en vuelo y lo aparca diciendo lo que pasó", async () => {
    /**
     * `parar` no puede «dejar acabar» lo que esté en vuelo: un turno tarda minutos y quien
     * pulsa Ctrl-C espera que el proceso se vaya. Y no puede dejar la tarea «en proceso»:
     * al arrancar de nuevo, la reconciliación la aparcaría con el mismo motivo pero después
     * de haber enseñado un estado falso todo ese tiempo. Se corta, y se dice — con las
     * MISMAS palabras que la reconciliación, porque es la misma situación.
     */
    const d = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco: d.disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    expect(d.estado()[0]!.estado).toBe("en-proceso");

    // El cierre de la consola es lo que hace que el turno devuelva (abortando el stream del
    // grafo): el doble rechaza al cerrar, como el de verdad.
    await corredor.parar();
    expect(p.cierres).toEqual(["/w/A"]);
    expect(d.estado()[0]).toMatchObject({ estado: "requiere-atencion", motivo: MOTIVO_CORTADA_POR_CIERRE });
    expect(d.soltados()).toBe(1);
  });
});

/**
 * La MEDIDA del volcado, con las piezas de verdad.
 *
 * La nota del plan avisaba de que el `MEDIDO:` de `vestibulo.test.ts` NO es el semáforo de
 * esto: el arreglo va en el adaptador, así que ese test se queda verde con el agujero
 * abierto o cerrado. Esto es lo que lo mide de verdad — un turno de tarea tiene que dejar
 * su `.jsonl` con actos Y su `refs/xonecode/sesion/<id>` nombrada, o el kanban enseñaría
 * una conversación vacía y Revisión diría `sin-marca` para siempre: un agente autónomo
 * escribiendo sin diff que revisar.
 */
describe("el volcado de la sesión de una tarea", () => {
  /** Un proyecto de verdad, con git: esto prueba git, no un doble de git. */
  function proyectoConGit(): { base: string; raiz: string } {
    const base = mkdtempSync(join(tmpdir(), "xonecode-corredor-"));
    const raiz = join(base, "webstudio", "A");
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    writeFileSync(join(raiz, "app.xml"), "<app/>\n");
    execFileSync("git", ["init", "-q", "."], { cwd: raiz });
    execFileSync("git", ["config", "user.email", "x@y.z"], { cwd: raiz });
    execFileSync("git", ["config", "user.name", "x"], { cwd: raiz });
    return { base, raiz };
  }

  /**
   * A propósito SIN `correr: async () => 0`, al revés que el resto de los tests del
   * vestíbulo: aquí corre el `correrConsola` de verdad, que es lo que hace de esto una
   * medida y no una maqueta. Comprobado en `cli/consola.ts`: su arranque no escribe nada
   * en disco (cero `writeFileSync`/`appendFileSync`/`mkdirSync`), así que lo único que se
   * escribe es lo que vuelca la sesión, dentro del proyecto temporal.
   */
  /**
   * Un asidero para esperar la COSA y no el reloj: se resuelve con la promesa del marcado en
   * cuanto `volcar()` aplica la foto de git. Sin él, la única forma de saber que la ref ya
   * está sería sondear el disco cada pocos milisegundos — y entonces el test dependería de lo
   * cargada que esté la máquina. Si nunca se resuelve, el plazo del test es el que avisa: eso
   * significa que nadie aplicó la foto, que es justo lo que se está midiendo.
   */
  /**
   * Espera con RELOJ REAL a que la tarea salga de la cola de trabajo.
   *
   * `asentar()` drena microtareas y con eso bastaba mientras el corredor no tocaba disco.
   * Ya no: la puerta de la entrega mide con `cambiosDeSesion` y cerrar la consola espera a
   * que la ref de la sesión esté escrita — las dos cosas son procesos hijos de git. Con
   * tope, para que un fallo dé un `expect` que se lee y no un test colgado.
   */
  async function esperarAQueAcabe(estado: () => Tarea[]): Promise<void> {
    for (let i = 0; i < 300 && ["nuevo", "en-proceso"].includes(estado()[0]!.estado); i += 1) {
      await new Promise<void>((r) => setTimeout(r, 10));
    }
  }

  function asidero<T>(): { promesa: Promise<T>; cumplir: (valor: T) => void } {
    let cumplir!: (valor: T) => void;
    const promesa = new Promise<T>((r) => (cumplir = r));
    return { promesa, cumplir };
  }

  function vestibuloReal(
    base: string,
    escritos: string[],
    marcada: { cumplir: (p: Promise<boolean>) => void },
    /** El turno, si el test necesita otro. Por omisión, el que pinta por la piel. */
    ejecutor?: (
      peticion: string,
      estado: unknown,
      consola: Consola
    ) => Promise<ResultadoDeTurno | void>
  ) {
    return crearVestibulo({
      origenDeTrabajo: "global",
      catalogoModelos: new CatalogoModelosEnMemoria(),
      guardarCredencial: () => ({ ruta: "/casa/.xonecode/auth.json" }),
      guardarEntorno: () => ({ ruta: "/casa/.xonecode/settings.json" }),
      descargar: async () => {},
      guardarConfigDeProyecto: () => ({ ruta: "/x/config.json" }),
      guardarModeloGlobal: (_papel, id) => ({ ruta: "/casa/.xonecode/config.json", id }),
      baseDeWorkspace: base,
      entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" }],
      /**
       * La marca de la sesión, con `fotoDeApertura` de verdad y git de verdad: es lo que hace
       * que Revisión tenga con qué comparar el trabajo de la tarea.
       *
       * Lo único que añade el envoltorio es GUARDAR la promesa del marcado, para poder
       * esperar la COSA y no el reloj: `volcar()` lanza la foto sin aguardarla —abrir un
       * proyecto no puede quedarse esperando a git— así que sin este asidero la única
       * alternativa sería sondear el disco cada 50 ms, y entonces el test dependería de lo
       * cargada que esté la máquina.
       */
      marcarSesion: async (raiz) => {
        const apuntar = await fotoDeApertura(raiz);
        return (id) => {
          const puesta = apuntar(id);
          marcada.cumplir(puesta);
          return puesta;
        };
      },
      // Un ejecutor que NO es doble (si lo fuera, `volcar` saldría por `esDoble`) y que
      // pinta por la PIEL, como el real: `crearEjecutorReal` hace `consola.piel?.() ??
      // crearPielStdio(consola.escribir)`.
      crearEjecutor: () => async (peticion, estado, consola) => {
        if (ejecutor !== undefined) return ejecutor(peticion, estado, consola);
        escritos.push(peticion);
        const piel = consola.piel?.();
        if (piel === undefined) {
          // Sin piel rica, el turno solo sabe escribir texto: es el camino degradado que
          // esta medida existe para descartar.
          consola.escribir("respuesta por stdio\n");
          return;
        }
        piel.token("ya está hecho");
        piel.cerrarLinea();
        piel.fin(1);
        // Como el real: el turno DICE cómo acabó. Un ejecutor que no informa se trata como
        // «no se sabe» (`medidaDeEntrega`), y esta medida es sobre un turno que fue bien.
        return { verificador: "verde", pendientes: 0 };
      },
      informar: () => {},
    });
  }

  it("MEDIDO: deja el `.jsonl` con actos de CONVERSACIÓN y nombra su ref de git", async () => {
    const { base, raiz } = proyectoConGit();
    const escritos: string[] = [];
    // El asidero del marcado: se cumple cuando `volcar()` aplica la foto de git.
    const marcada = asidero<Promise<boolean>>();
    const v = vestibuloReal(base, escritos, marcada);
    const { disco, estado } = discoDeMentira([
      TAREA({ proyecto: { id: "pa", raiz, nombre: "A" }, encargo: "arregla el login" }),
    ]);
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      // EL adaptador de producción, no una copia: es la costura que junta las tres piezas.
      abrirParaTarea: async (r) => consolaParaTarea(await v.abrirParaTarea(r)),
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    // El turno de este ejecutor termina solo, así que basta con asentar.
    await esperarAQueAcabe(estado);

    expect(escritos).toEqual(["arregla el login"]);
    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("terminada");
    const sesion = tarea.sesion!;
    expect(sesion).not.toBe("");

    // 1) El transcript, con un acto de ASISTENTE y no una pared de líneas de sistema.
    const jsonl = join(raiz, ".xonecode", "sesiones", `${sesion}.jsonl`);
    expect(existsSync(jsonl)).toBe(true);
    const actos = readFileSync(jsonl, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as { tipo: string; texto?: string });
    expect(actos.map((a) => a.tipo)).toContain("asistente");
    expect(actos.find((a) => a.tipo === "asistente")!.texto).toBe("ya está hecho");

    // 2) Y la marca de git, o Revisión diría `sin-marca` para siempre.
    //
    // Se espera la COSA y no el reloj: `volcar()` lanza la foto sin aguardarla, así que el
    // asidero de `marcarSesion` es la única forma de saber que ya terminó sin sondear el
    // disco. Y esperarlo es además parte de la medida: si nadie aplicara la foto, aquí no se
    // resolvería nunca.
    expect(await (await marcada.promesa)).toBe(true);
    const ref = execFileSync("git", ["rev-parse", "--verify", `refs/xonecode/sesion/${sesion}`], {
      cwd: raiz,
      encoding: "utf8",
    }).trim();
    expect(ref).toMatch(/^[0-9a-f]{40}$/);

    await corredor.parar();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  /**
   * **La vista en vivo y el transcript guardado son LO MISMO** (Task 16, decisión 3 del
   * diseño), y esto lo MIDE con las piezas de producción: el vestíbulo de verdad,
   * `consolaParaTarea` de verdad y el `.jsonl` que `volcar()` escribe en disco.
   *
   * Sin esta medida, «no hay un segundo registro» sería una afirmación de un docblock: los
   * tests de las piezas usan dobles de consola, así que un `mirar` que enganchara a otra
   * fuente —una lista propia del corredor, un log paralelo— pasaría en verde. Lo que aquí se
   * compara es exactamente eso: lo que el mirón recibió, aplicado como el cliente lo aplica,
   * contra lo que quedó escrito en la sesión.
   */
  it("MEDIDO: lo que ve quien MIRA es, acto por acto, el transcript que se guarda", async () => {
    const { base, raiz } = proyectoConGit();
    const marcada = asidero<Promise<boolean>>();
    // El turno espera a que el mirón esté enganchado, pinta y termina: sin la pausa, el
    // turno acabaría antes de que hubiera nada que mirar.
    const dentro = asidero<void>();
    const seguir = asidero<void>();
    const v = vestibuloReal(base, [], marcada, async (_peticion, _estado, consola) => {
      const piel = consola.piel!();
      piel.token("empiezo");
      piel.cerrarLinea();
      dentro.cumplir();
      await seguir.promesa;
      piel.fase?.("desarrollando", "ejecutando");
      // DOS líneas de tool seguidas a propósito: la segunda no es un acto nuevo, sustituye
      // al primero dentro del mismo acto `herramientas` (`core/actos.ts#conLineaDeTool`), así
      // que esto es lo que hace pasar por el camino de `sustitucion`. Sin ella, el mirón
      // podría estar perdiéndose ese mensaje y el transcript seguiría cuadrando.
      piel.linea("→ lee app.xne", { nombre: "read_file" });
      piel.linea("← edita app.xne", { nombre: "edit_file" });
      piel.token("ya está hecho");
      piel.cerrarLinea();
      piel.fin(1);
      return { verificador: "verde", pendientes: 0 };
    });
    const { disco, estado } = discoDeMentira([
      TAREA({ proyecto: { id: "pa", raiz, nombre: "A" }, encargo: "arregla el login" }),
    ]);
    const corredor = crearCorredorDeTareas({
      ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: async (r) => consolaParaTarea(await v.abrirParaTarea(r)),
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await dentro.promesa;

    /**
     * El cliente, reconstruyendo su lista con las MISMAS tres reglas del cable: `acto`
     * anexa, `sustitucion` cambia el último y `reemision` sustituye todo (`store.ts`, el
     * `case "mirada"`). Aquí llegan sin etiquetar porque etiquetar es de `arranque.ts`.
     */
    let vistos: Acto[] = [];
    const sumidero = (m: MensajeAlCliente): void => {
      if (m.clase === "acto") vistos = [...vistos, m.acto];
      else if (m.clase === "sustitucion") vistos = [...vistos.slice(0, -1), m.acto];
      else if (m.clase === "reemision") vistos = [...m.actos];
    };
    const iniciales = corredor.mirar("t1", sumidero);
    expect(iniciales).toBeDefined();
    vistos = [...iniciales!];
    // Ya hay algo: el turno pintó antes de que nadie mirara, y el transcript de ese instante
    // llega por el valor de retorno — sin él, el mirón empezaría a media conversación.
    expect(vistos.length).toBeGreaterThan(0);

    seguir.cumplir();
    await esperarAQueAcabe(estado);

    const sesion = estado()[0]!.sesion!;
    const jsonl = join(raiz, ".xonecode", "sesiones", `${sesion}.jsonl`);
    const guardados = readFileSync(jsonl, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as Acto);
    // **La igualdad es el test.** No «contiene» ni «tiene la misma longitud»: acto por acto,
    // porque cualquier holgura dejaría pasar justo lo que esto vigila — una segunda fuente
    // que se parece a la conversación y no lo es.
    expect(vistos).toEqual(guardados);
    // Y que no sea la lista trivial: si el turno no hubiera pintado nada, dos vacíos
    // también serían iguales.
    expect(guardados.map((a) => a.tipo)).toContain("asistente");
    expect(guardados.map((a) => a.tipo)).toContain("herramientas");
    // Y que ese acto llegó SUSTITUIDO y no duplicado: las dos líneas viven en uno solo.
    expect(guardados.filter((a) => a.tipo === "herramientas")).toHaveLength(1);

    await corredor.parar();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  }, 20000);

  it("MEDIDO de punta a punta: aprobar dentro del turno deja los ficheros en el ÍNDICE", async () => {
    /**
     * La costura entera y con las piezas de producción: el vestíbulo de verdad,
     * `consolaParaTarea` de verdad y la consola de tarea de verdad. Lo que mide es que la
     * decisión que toma la POLÍTICA (aprobar, en `consolaDeTarea.ts`) llega hasta el índice
     * de tareas — que es el único sitio donde queda constancia de una escritura que nadie
     * aprobó. Los tests de arriba usan un doble de consola, así que el día que
     * `consolaParaTarea` deje de reenviar el canal se quedarían todos en verde.
     *
     * El turno de mentira hace lo que hace el de verdad: llamar a `aprobacionesTui` con lo
     * que el interrupt trae. No hay agente, ni modelo, ni backend.
     */
    const { base, raiz } = proyectoConGit();
    const marcada = asidero<Promise<boolean>>();
    const v = vestibuloReal(base, [], marcada, async (_peticion, _estado, consola) => {
      const decisiones = await consola.aprobacionesTui!(
        [
          {
            id: "i1",
            origen: "dev",
            descripcion: "[dev] quiere escribir un fichero del proyecto",
            decisionesPermitidas: ["approve", "reject"],
          },
        ],
        new Map([["i1", "/Clientes.xne"]]),
        new Map()
      );
      // Y es aprobar: si esto fuera un rechazo, el resto del test no significaría nada.
      expect(decisiones.get("i1")).toEqual({ type: "approve" });
      const piel = consola.piel?.();
      piel?.token("hecho");
      piel?.cerrarLinea();
      piel?.fin(1);
      return { verificador: "verde", pendientes: 0 };
    });
    const { disco, estado } = discoDeMentira([
      TAREA({ proyecto: { id: "pa", raiz, nombre: "A" }, encargo: "crea la colección Clientes" }),
    ]);
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE,
      disco,
      abrirParaTarea: async (r) => consolaParaTarea(await v.abrirParaTarea(r)),
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await esperarAQueAcabe(estado);

    expect(estado()[0]).toMatchObject({ estado: "terminada", autorizadas: ["Clientes.xne"] });
    // Y en el transcript, con el nombre: es lo que lee quien abra la sesión después.
    const sesion = estado()[0]!.sesion!;
    const jsonl = readFileSync(join(raiz, ".xonecode", "sesiones", `${sesion}.jsonl`), "utf8");
    expect(jsonl).toMatch(/Clientes\.xne/);
    expect(jsonl).toMatch(/sin aprobaci/i);

    await corredor.parar();
    await v.cerrar();
    // Se espera la foto de git ANTES de borrar la carpeta: `volcar()` la lanza sin
    // aguardarla, así que borrar el proyecto a media escritura de `.git/objects` daba un
    // `ENOTEMPTY` que no es del código medido. Es el mismo asidero que el test de al lado.
    await (await marcada.promesa);
    rmSync(base, { recursive: true, force: true });
  });

  /**
   * **MEDIDO: la condición «revisable» con el git de verdad, no con un doble.**
   *
   * Es la única forma de descartar una carrera real: `volcar()` (`vestibulo.ts`) apunta la
   * ref con `void foto?.then(...)`, o sea sin aguardar un `git update-ref` que es un
   * proceso hijo — mientras el corredor mide la condición justo después de `cortar()`. Si
   * la ref llegara tarde, `cambiosDeSesion` diría `sin-marca` y la tarea se aparcaría
   * diciendo que nadie puede revisarla, en un proyecto donde sí se puede.
   *
   * Se usa `cambiosDeSesion` a pelo, que es la misma función que pinta la pestaña Revisión:
   * «revisable» tiene que significar «Revisión lo enseña» y no algo parecido.
   */
  /**
   * `revisionConGit`, la derivación de PRODUCCIÓN, contra git de verdad y en sus tres
   * respuestas. Está en su propia función y con test propio porque dentro de un cierre de
   * `arrancarConsolaWeb` no se podía llamar: una mutación que ponía `escribio: true` a fuego
   * sobrevivió a las 25 mutaciones de la tanda anterior justo por eso.
   */
  it("MEDIDO: `revisionConGit` distingue las TRES respuestas de git", async () => {
    const { base, raiz } = proyectoConGit();
    const revision = revisionConGit(cambiosDeSesion);

    // 1) Sin marca: no hay con qué mirarlo, así que no se afirma NADA sobre si escribió.
    expect(await revision(raiz, "sesion-sin-ref")).toEqual({ revisable: false });

    // 2) Con marca y sin cambios: la sesión no escribió nada, y eso SÍ se puede afirmar.
    writeFileSync(join(raiz, "app.xml"), "<app/>");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });
    const apuntar = await fotoDeApertura(raiz);
    expect(await apuntar("s1")).toBe(true);
    expect(await revision(raiz, "s1")).toEqual({ revisable: true, escribio: false });

    // 3) Con marca y con cambios: escribió, y el verificador se exige.
    writeFileSync(join(raiz, "Clientes.xne"), '<collection name="Clientes"/>');
    expect(await revision(raiz, "s1")).toEqual({ revisable: true, escribio: true });

    rmSync(base, { recursive: true, force: true });
  });

  it("MEDIDO: la condición de revisable, con `cambiosDeSesion` de verdad y sin doble de git", async () => {
    const { base, raiz } = proyectoConGit();
    const marcada = asidero<Promise<boolean>>();
    // El turno escribe un fichero de verdad: sin escritura no habría nada que revisar, y la
    // condición se cumpliría por vacío.
    const v = vestibuloReal(base, [], marcada, async (_peticion, _estado, consola) => {
      writeFileSync(join(raiz, "Clientes.xne"), '<collection name="Clientes"/>');
      const piel = consola.piel?.();
      piel?.token("hecho");
      piel?.cerrarLinea();
      piel?.fin(1);
      return { verificador: "verde", pendientes: 0 };
    });
    const { disco, estado } = discoDeMentira([
      TAREA({ proyecto: { id: "pa", raiz, nombre: "A" }, encargo: "crea la colección Clientes" }),
    ]);
    /** Lo que la condición contestó cada vez, para poder decir POR QUÉ si falla. */
    const medidas: boolean[] = [];
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: async (r) => consolaParaTarea(await v.abrirParaTarea(r)),
      pid: 1,
      concurrencia: () => 1,
      juez: juezQueDice({ veredicto: "verde", resumen: "la colección está creada" }),
      revisable: async (r, sesion) => {
        const cambios = await cambiosDeSesion(r, sesion);
        medidas.push(cambios.via === "git");
        if (cambios.via !== "git") return { revisable: false };
        return { revisable: true, escribio: cambios.ficheros.length > 0 };
      },
    });
    await corredor.arrancar();
    /**
     * Aquí NO basta con `asentar()`: la condición de revisable lanza `git` de verdad, o sea
     * procesos hijos con E/S, y `asentar` solo drena microtareas. Se espera por el HECHO —que
     * la tarea salga de «en proceso»— con reloj real y tope, que es lo que hacen los tests
     * del repo que tocan git.
     */
    await esperarAQueAcabe(estado);

    // La medida: la condición se preguntó UNA vez y contestó que sí. Antes de esperar la ref
    // en `cerrar()` (`vestibulo.ts`), esto era `[false]` y la tarea acababa aparcada
    // diciendo que nadie podía revisarla — en un proyecto donde sí se podía.
    expect(medidas).toEqual([true]);
    expect(estado()[0]!.estado).toBe("terminada");
    // Y hay «antes» con el que comparar, que es lo que «revisable» promete. QUÉ ficheros
    // lista es cosa de `cambiosDeSesion`, que tiene sus propios tests: aquí el turno de
    // mentira escribe en el mismo tick en que se toma la foto de apertura, así que exigir
    // la lista sería medir esa carrera del doble y no la condición.
    expect((await cambiosDeSesion(raiz, estado()[0]!.sesion!)).via).toBe("git");

    await corredor.parar();
    await v.cerrar();
    await (await marcada.promesa);
    rmSync(base, { recursive: true, force: true });
  });

  /**
   * **MEDIDO de punta a punta: el feedback reanuda el MISMO hilo, con las piezas de
   * producción.** No un doble que HARDCODEA el mismo id de las dos veces —eso solo
   * demostraría que dos cadenas iguales son iguales—: aquí `abrirParaTarea` es
   * `consolaParaTarea(await v.abrirParaTarea(r, sesion))`, la MISMA composición que
   * `construirCorredorDeTareasCableado` monta en producción, contra un vestíbulo y un git
   * de verdad. Lo que se mide es que la SEGUNDA vuelta —el turno del feedback— escribe en
   * el `.jsonl` de la MISMA sesión que la primera, con los actos de las DOS vueltas
   * presentes: es la prueba de que es una conversación que CRECE, no una sesión nueva que
   * por casualidad se llama igual.
   */
  it("MEDIDO: el feedback reanuda el MISMO hilo — el transcript de la sesión trae las DOS vueltas", async () => {
    const { base, raiz } = proyectoConGit();
    const escritos: string[] = [];
    /**
     * Esta tarea abre el proyecto DOS veces (turno 1, y el reanudado del feedback), y cada
     * apertura lanza su propia foto de git sin esperarla (`volcar()`, fire-and-forget). El
     * `asidero` de las demás pruebas de este describe solo captura la PRIMERA —una promesa
     * solo se resuelve una vez—, así que aquí se acumulan las de las DOS para poder
     * esperarlas a las dos antes de borrar la carpeta: sin eso, el `rmSync` de al final
     * carrera con el `git update-ref` de la segunda apertura y sale `ENOTEMPTY` — medido.
     */
    const marcas: Promise<boolean>[] = [];
    const marcada = { cumplir: (p: Promise<boolean>) => void marcas.push(p) };
    let vuelta = 0;
    const v = vestibuloReal(base, escritos, marcada, async (peticion, _estado, consola) => {
      vuelta += 1;
      escritos.push(peticion);
      const piel = consola.piel?.();
      piel?.token(`respuesta ${vuelta}`);
      piel?.cerrarLinea();
      piel?.fin(1);
      // La PRIMERA vuelta sale en rojo A PROPÓSITO: es lo que fuerza «esperando feedback»
      // sin tocar el juez ni `revisable`, y `sesion` se queda puesta —nadie le pasa
      // `sesionAbrible` a este corredor, así que la regla de `sesion` nunca la limpia—.
      return { verificador: vuelta === 1 ? "rojo" : "verde", pendientes: 0 };
    });
    const { disco, estado } = discoDeMentira([
      TAREA({ proyecto: { id: "pa", raiz, nombre: "A" }, encargo: "arregla el login" }),
    ]);
    const corredor = crearCorredorDeTareas({
      ...ENTREGA_VERDE,
      disco,
      // El adaptador de PRODUCCIÓN, con la `sesion` reenviada — la misma composición que
      // `construirCorredorDeTareasCableado` (`arranque.ts`).
      abrirParaTarea: async (r, sesion) => consolaParaTarea(await v.abrirParaTarea(r, sesion)),
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await esperarAQueAcabe(estado);

    const tras1 = estado()[0]!;
    expect(tras1.estado).toBe("requiere-atencion");
    const sesion = tras1.sesion!;
    expect(sesion).not.toBe("");

    expect(aplicarFeedback(disco, tras1.id, "sí, con histórico").hecho).toBe(true);
    corredor.revisar();
    await esperarAQueAcabe(estado);

    const tras2 = estado()[0]!;
    expect(tras2.estado).toBe("terminada");
    // LA MEDIDA #1: el mismo hilo, no uno nuevo.
    expect(tras2.sesion).toBe(sesion);
    // Y lo que de verdad se le mandó al turno en la segunda vuelta es el FEEDBACK, no el
    // encargo repetido — el mismo patrón que los hallazgos del verificador.
    expect(escritos).toEqual(["arregla el login", "sí, con histórico"]);

    // LA MEDIDA #2, y la que de verdad descarta la coincidencia de nombres: el `.jsonl` de
    // ESA sesión trae los actos de asistente de las DOS vueltas, en orden — la prueba de
    // que `volcar()` AÑADIÓ al mismo fichero en vez de que alguien abriera uno nuevo con
    // el mismo id por casualidad.
    const jsonl = join(raiz, ".xonecode", "sesiones", `${sesion}.jsonl`);
    const textos = readFileSync(jsonl, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as { tipo: string; texto?: string })
      .filter((a) => a.tipo === "asistente")
      .map((a) => a.texto);
    expect(textos).toEqual(["respuesta 1", "respuesta 2"]);

    // Y solo hay UNA entrada en el índice de sesiones del proyecto: si el feedback hubiera
    // abierto una sesión nueva, habría dos.
    expect(v.sesionesDe(raiz)).toHaveLength(1);

    await corredor.parar();
    await v.cerrar();
    // La foto de la PRIMERA apertura, que es la única que este arnés puede esperar (ver el
    // comentario de `marcas`). La foto de la SEGUNDA sigue en vuelo sin ningún asidero
    // —al reabrir, `vestibulo.ts` no vuelve a NOMBRAR la ref (`anotada` ya es cierto), así
    // que su cierre nunca invoca el `apuntar` que dispararía `marcada.cumplir`, aunque el
    // `write-tree` de fondo sí corre—: por eso el `rmSync` de abajo lleva reintentos.
    await Promise.all(marcas.map((p) => p.catch(() => undefined)));
    // La escritura de git de la SEGUNDA apertura puede seguir en vuelo (arriba) y chocar
    // con `rmSync` — medido, y más seguido con la máquina cargada: `maxRetries`/
    // `retryDelay` de la propia API de Node no bastó (agotó sus reintentos y siguió dando
    // `ENOTEMPTY`). Con espera de RELOJ REAL entre intentos —que sí le da vueltas de verdad
    // al bucle de eventos, y con ellas al proceso hijo de git— sí converge.
    for (let intento = 0; ; intento += 1) {
      try {
        rmSync(base, { recursive: true, force: true });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOTEMPTY" || intento >= 20) throw error;
        await new Promise<void>((r) => setTimeout(r, 100));
      }
    }
  });
});
/**
 * LA PUERTA DE LA ENTREGA. «Terminada» dejó de significar «el turno acabó».
 *
 * Desde §0 del diseño una tarea aplica sus escrituras sin que nadie vea el diff, así que el
 * sitio del modal lo ocupan dos piezas: el verificador —que ya corre dentro del turno— y un
 * juez de QA. Y con la regla que este repo ya tenía escrita para la subida autónoma
 * (`core/cloudstudio.ts#PoliticaDeAprobacion`): **el veredicto del juez no basta solo**,
 * porque a un modelo se le puede pedir que avise y a veces no avisa.
 */
describe("una tarea se entrega por condiciones MEDIDAS más el juez", () => {
  /** El corredor con las dos piezas de la entrega elegidas por el test. */
  function conEntrega(
    tareas: Tarea[],
    entrega: {
      juez: JuezDeTareaPort;
      revisable?: (raiz: string, sesion: string) => Promise<RevisionDeSesion>;
    }
  ) {
    const { disco, estado } = discoDeMentira(tareas);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      juez: entrega.juez,
      revisable: entrega.revisable ?? (async () => ({ revisable: true, escribio: true })),
    });
    return { corredor, estado, p };
  }

  it("las tres condiciones y el juez en verde: terminada, y con el veredicto guardado", async () => {
    const juez = juezQueDice({ veredicto: "verde", resumen: "la colección está creada" });
    const { corredor, estado, p } = conEntrega([TAREA()], { juez });
    await corredor.arrancar();
    await corredor.asentar();
    p.autorizar(["/Clientes.xne"]);
    p.acabar({ verificador: "verde", pendientes: 0 });
    await corredor.asentar();

    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("terminada");
    // El veredicto se guarda también en verde: si no, una tarea terminada no podría
    // distinguir «el juez la aprobó» de «se entregó sin que nadie la juzgara».
    expect(tarea.veredicto).toEqual({ veredicto: "verde", resumen: "la colección está creada" });
  });

  it("el juez en verde con una condición en rojo NO entrega, y el motivo dice cuál falló", async () => {
    const juez = juezQueDice({ veredicto: "verde", resumen: "por mí bien" });
    const { corredor, estado, p } = conEntrega([TAREA()], { juez });
    await corredor.arrancar();
    await corredor.asentar();
    // Un turno cortado por el tope: quedó una escritura sin aplicar.
    p.acabar({ verificador: "verde", pendientes: 1 });
    await corredor.asentar();

    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("requiere-atencion");
    expect(tarea.motivo).toContain("aprobación");
    /**
     * Y al juez NO se le pregunta: cada consulta es una llamada del modelo más caro del
     * reparto (`afilado`), y ya se sabe que no se entrega. Esta cuenta es además lo que
     * detecta la mutación de preguntar antes de medir.
     */
    expect(juez.casos).toHaveLength(0);
  });

  it("las tres condiciones en verde y el juez en rojo tampoco entrega, y lleva lo que dijo", async () => {
    const juez = juezQueDice({ veredicto: "rojo", resumen: "falta el campo NOMBRE en la colección" });
    const { corredor, estado, p } = conEntrega([TAREA()], { juez });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar({ verificador: "verde", pendientes: 0 });
    await corredor.asentar();

    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("requiere-atencion");
    expect(tarea.motivo).toContain("falta el campo NOMBRE en la colección");
    // Y el veredicto queda guardado, que es lo que hace la tarjeta accionable al reintentar.
    expect(tarea.veredicto?.veredicto).toBe("rojo");
  });

  it("un verificador en rojo no se entrega aunque el juez esté encantado", async () => {
    const juez = juezQueDice({ veredicto: "verde", resumen: "a mí me parece bien" });
    const { corredor, estado, p } = conEntrega([TAREA()], { juez });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar({
      verificador: "rojo",
      pendientes: 0,
      hallazgos: [{ code: "COLL_MISSING_PROGID", severidad: "error", mensaje: "falta progid" }],
    });
    await corredor.asentar();

    expect(estado()[0]!.estado).toBe("requiere-atencion");
    expect(estado()[0]!.motivo).toContain("verificador");
    expect(juez.casos).toHaveLength(0);
  });

  /**
   * La tercera condición NO es «árbol de git limpio», y está MEDIDO: una tarea que escribe
   * un fichero deja `git status --porcelain` con `?? Clientes.xne`, así que con esa
   * condición ninguna tarea se entregaría jamás. Lo que se exige es que lo escrito se pueda
   * REVISAR — sin aprobación previa, ese diff es el único momento en que alguien puede
   * mirar lo que hizo una tarea.
   */
  it("sin marca de git no se entrega: nadie podría revisar lo que escribió", async () => {
    const juez = juezQueDice({ veredicto: "verde", resumen: "bien" });
    const { corredor, estado, p } = conEntrega([TAREA()], { juez, revisable: async () => ({ revisable: false }) });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar({ verificador: "verde", pendientes: 0 });
    await corredor.asentar();

    expect(estado()[0]!.estado).toBe("requiere-atencion");
    expect(estado()[0]!.motivo).toContain("revisar");
  });

  it("si ni se puede preguntar por la marca, se falla CERRADO", async () => {
    const juez = juezQueDice({ veredicto: "verde", resumen: "bien" });
    const { corredor, estado, p } = conEntrega([TAREA()], {
      juez,
      revisable: async () => {
        throw Object.assign(new Error("ENOENT: no such file or directory, open '/casa/.git'"), { code: "ENOENT" });
      },
    });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar({ verificador: "verde", pendientes: 0 });
    await corredor.asentar();

    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("requiere-atencion");
    // Y sin la ruta absoluta del mensaje de Node: el motivo se pinta en el kanban y viaja
    // por el cable, que puede ir por un túnel.
    expect(tarea.motivo).not.toContain("/casa");
  });

  /**
   * Un ejecutor que no informa —el guionizado, o una piel que no reenvíe el retorno— no ha
   * dicho que el verificador esté verde: ha dicho nada. Y «no se sabe» no se entrega.
   */
  it("un turno que no informa de nada no se entrega, y lo dice", async () => {
    const juez = juezQueDice({ veredicto: "verde", resumen: "bien" });
    const { corredor, estado, p } = conEntrega([TAREA()], { juez });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabarMudo();
    await corredor.asentar();

    expect(estado()[0]!.estado).toBe("requiere-atencion");
    expect(estado()[0]!.motivo).toContain("no informa");
  });

  /**
   * AC de la tarea: que el juez no se pueda usar (sin modelo, sin clave, sin red) es fallo
   * del ENTORNO, no un veredicto. Se dice, la tarea queda esperando feedback, y NO se
   * entrega en silencio.
   */
  it("que el juez no se pueda usar es fallo del entorno: se dice y NO se entrega", async () => {
    const juez: JuezDeTareaPort = {
      juzgar: async () => {
        throw new ErrorDelJuezDeTarea("falta la credencial para nvidia (NVIDIA_API_KEY); usa /provider nvidia");
      },
    };
    const { corredor, estado, p } = conEntrega([TAREA()], { juez });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar({ verificador: "verde", pendientes: 0 });
    await corredor.asentar();

    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("requiere-atencion");
    expect(tarea.motivo).toContain("juez");
    // El mensaje del fallo de CONSTRUIR sí se conserva: es la única línea que dice qué hacer.
    expect(tarea.motivo).toContain("NVIDIA_API_KEY");
    expect(tarea.veredicto).toBeUndefined();
  });

  it("al juez se le cuentan los HECHOS: encargo, ficheros autorizados y el verificador", async () => {
    const juez = juezQueDice({ veredicto: "verde", resumen: "bien" });
    const { corredor, p } = conEntrega([TAREA({ encargo: "crea la colección Clientes" })], { juez });
    await corredor.arrancar();
    await corredor.asentar();
    p.autorizar(["/Clientes.xne", "/src/lista.js"]);
    p.acabar({
      verificador: "verde",
      pendientes: 0,
      hallazgos: [{ code: "ATTR_UNKNOWN", severidad: "warning", mensaje: "atributo raro", fichero: "Clientes.xne" }],
      preexistentes: 22,
    });
    await corredor.asentar();

    expect(juez.casos).toHaveLength(1);
    expect(juez.casos[0]).toEqual({
      encargo: "crea la colección Clientes",
      // La raíz SÍ va, y es la única ruta de máquina del caso: sirve para resolver el papel
      // `afilado` con el `config.json` del proyecto —en la web nadie rellena
      // `FuentesDeEleccion.proyecto`, así que hay que preguntarle al disco por la raíz— y se
      // queda en el host, porque el caso del juez no viaja por el cable. Este aserto es de
      // claves EXACTAS a propósito: es lo que impide que un «ya que estamos, llevemos
      // también…» cuele un dato de más camino del prompt de un modelo.
      raiz: "/w/A",
      // RELATIVAS, como las guarda el índice: de aquí no sale ninguna otra ruta de la máquina.
      autorizadas: ["Clientes.xne", "src/lista.js"],
      verificador: "verde",
      hallazgos: [{ code: "ATTR_UNKNOWN", severidad: "warning", mensaje: "atributo raro", fichero: "Clientes.xne" }],
      /**
       * Y las DOS cosas que el juez necesita para no atribuirle al turno lo que no es suyo:
       * cuántos hallazgos quedaron FUERA del reparto —la lista de arriba ya está filtrada, y
       * sin este número el juez no sabe que lo está— y lo que dice GIT de si la sesión
       * cambió algo, que es el único hecho sobre el disco que hay aquí (`autorizadas` es una
       * pista de lo que el agente quiso escribir). Medido: sin ellos, el juez dictó rojo
       * acusando al turno de modificar ficheros de los que solo hablaban los hallazgos.
       */
      preexistentes: 22,
      escribio: true,
    });
  });

  /**
   * Una tarea de SOLO LECTURA se entrega, y quién dice que no escribió importa: lo dice
   * GIT y nunca `autorizadas`. Aquello es una pista de lo que el agente quiso hacer —puede
   * llevar rutas que las guardas rechazaron—, y decidir con ella sería decidir con la
   * intención en vez de con el hecho.
   */
  it("una tarea que no cambió nada se entrega, con la salvedad guardada", async () => {
    const juez = juezQueDice({ veredicto: "verde", resumen: "no había nada que escribir" });
    const { corredor, estado, p } = conEntrega([TAREA({ encargo: "explícame la colección Clientes" })], {
      juez,
      revisable: async () => ({ revisable: true, escribio: false }),
    });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar({ verificador: "no-corrio", pendientes: 0, motivoSinVerificar: "el turno no escribió ningún fichero del proyecto" });
    await corredor.asentar();

    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("terminada");
    // Con el verificador fuera de juego, al juez SÍ se le pregunta: es la única condición
    // de contenido que queda, así que manda entero.
    expect(juez.casos).toHaveLength(1);
    // Y la entrega no puede parecer una entrega normal: la salvedad va con el veredicto,
    // porque el `motivo` de una tarea terminada no existe (`conEstado` lo borra).
    expect(tarea.veredicto?.salvedad).toBe(SALVEDAD_SIN_ESCRITURAS);
  });

  it("y si git dice que SÍ cambió algo, el verificador se exige aunque `autorizadas` esté vacía", async () => {
    const juez = juezQueDice({ veredicto: "verde", resumen: "bien" });
    const { corredor, estado, p } = conEntrega([TAREA()], {
      juez,
      // Git vio cambios; el turno no llegó a apuntar ninguna autorización (una escritura
      // aplicada por otro camino, o un `autorizado` que no se cableó).
      revisable: async () => ({ revisable: true, escribio: true }),
    });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar({ verificador: "no-corrio", pendientes: 0 });
    await corredor.asentar();

    expect(estado()[0]!.estado).toBe("requiere-atencion");
    expect(estado()[0]!.motivo).toContain("verificador");
    expect(juez.casos).toHaveLength(0);
  });

  /**
   * Y sin MARCA no se afirma que no escribiera: eso es «no se sabe», y ahí la condición del
   * verificador se exige como siempre. Colapsar las dos sería un camino para entregar sin
   * verificar — el agujero que este caso abriría si se hiciera mal.
   */
  it("sin marca de git no se entrega ni con el turno diciendo que no verificó", async () => {
    const juez = juezQueDice({ veredicto: "verde", resumen: "bien" });
    const { corredor, estado, p } = conEntrega([TAREA()], { juez, revisable: async () => ({ revisable: false }) });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar({ verificador: "no-corrio", pendientes: 0 });
    await corredor.asentar();

    expect(estado()[0]!.estado).toBe("requiere-atencion");
    expect(estado()[0]!.motivo).toContain("verificador");
    expect(estado()[0]!.motivo).toContain("revisar");
  });

  /**
   * La marca de git se ESPERA antes de medir, y la espera es de quien la necesita.
   *
   * Sin ella la medida llegaba antes que el `update-ref` que `volcar()` lanza sin aguardar,
   * y toda tarea se aparcaba diciendo que nadie podía revisarla (medido con git de verdad,
   * ver la batería del final). Lo que este test fija es el ORDEN: primero esperar, después
   * preguntar.
   */
  it("espera la marca de git ANTES de medir si se puede revisar", async () => {
    const orden: string[] = [];
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: async (raiz) => ({
        ...(await p.abrir(raiz)),
        esperarMarca: async () => void orden.push("esperar"),
      }),
      pid: 1,
      concurrencia: () => 1,
      juez: juezQueDice({ veredicto: "verde", resumen: "bien" }),
      revisable: async () => {
        orden.push("medir");
        return { revisable: true, escribio: true };
      },
    });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar({ verificador: "verde", pendientes: 0 });
    await corredor.asentar();

    expect(orden).toEqual(["esperar", "medir"]);
    expect(estado()[0]!.estado).toBe("terminada");
  });

  it("una espera que revienta no tumba la tarea: se mide igual y la medida decide", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: async (raiz) => ({
        ...(await p.abrir(raiz)),
        esperarMarca: async () => {
          throw new Error("git se atragantó");
        },
      }),
      pid: 1,
      concurrencia: () => 1,
      juez: juezQueDice({ veredicto: "verde", resumen: "bien" }),
      revisable: async () => ({ revisable: true, escribio: true }),
    });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar({ verificador: "verde", pendientes: 0 });
    await corredor.asentar();

    expect(estado()[0]!.estado).toBe("terminada");
  });

  /**
   * El veredicto entra por el MISMO camino que la regla de `sesion` y la de `autorizadas`,
   * y eso incluye el camino de error: una regla que se cumple salvo cuando algo falla no es
   * una regla. Aquí revienta la escritura del estado final y el aparcado que viene detrás
   * tiene que llevar las tres cosas.
   */
  it("si la escritura final revienta, el aparcado sigue llevando veredicto y autorizadas", async () => {
    const juez = juezQueDice({ veredicto: "verde", resumen: "bien" });
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    let escrituras = 0;
    const guardar = disco.guardar.bind(disco);
    disco.guardar = (lista) => {
      escrituras += 1;
      // 1) la marca de «en proceso»; 2) la de «terminada», que revienta; 3) el aparcado.
      if (escrituras === 2) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      guardar(lista);
    };
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      juez,
      revisable: async () => ({ revisable: true, escribio: true }),
    });
    await corredor.arrancar();
    await corredor.asentar();
    p.autorizar(["/Clientes.xne"]);
    p.acabar({ verificador: "verde", pendientes: 0 });
    await corredor.asentar();

    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("requiere-atencion");
    expect(tarea.autorizadas).toEqual(["Clientes.xne"]);
    expect(tarea.veredicto?.veredicto).toBe("verde");
  });

  /**
   * El TERCER modo de «el juez no se puede usar» —el proceso se está yendo— vive con los
   * tests de `parar()`: ver «un turno que acaba LIMPIO justo al parar…», que es la misma
   * ventana y donde estaba ya la afirmación que este cambio tuvo que corregir.
   */

  /**
   * Un juez colgado no puede dejar la tarea diciendo «en proceso» durante el plazo del SDK
   * —del orden de diez minutos— con su hueco y su proyecto ocupados. Es la regla de siempre:
   * cada proceso lleva tope, y un cuelgue se DICE.
   */
  it("un juez que no contesta se corta por plazo, y la tarea lo dice", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      // Nunca resuelve: es el cuelgue.
      juez: { juzgar: () => new Promise(() => {}) },
      revisable: async () => ({ revisable: true, escribio: true }),
      esperaDelJuez: 20,
    });
    await corredor.arrancar();
    await corredor.asentar();
    p.acabar({ verificador: "verde", pendientes: 0 });
    for (let i = 0; i < 100 && estado()[0]!.estado === "en-proceso"; i += 1) {
      await new Promise<void>((r) => setTimeout(r, 5));
    }

    expect(estado()[0]!.estado).toBe("requiere-atencion");
    expect(estado()[0]!.motivo).toContain("no contestó");
    await corredor.parar();
  });

  /**
   * Un turno que se aparcó por su cuenta —una pregunta sin nadie a quien preguntar— no pasa
   * por la puerta: ya hay un motivo, y es el bueno. Preguntarle al juez sobre un trabajo que
   * se cortó a mitad sería gastar una llamada para tapar el motivo que sí explica qué pasó.
   */
  it("una tarea que ya se aparcó no pasa por el juez: su motivo es el que explica de verdad", async () => {
    const juez = juezQueDice({ veredicto: "verde", resumen: "bien" });
    const { corredor, estado, p } = conEntrega([TAREA()], { juez });
    await corredor.arrancar();
    await corredor.asentar();
    p.aparcar("el agente preguntó y no había nadie");
    p.acabar({ verificador: "verde", pendientes: 0 });
    await corredor.asentar();

    expect(estado()[0]!.motivo).toBe("el agente preguntó y no había nadie");
    expect(juez.casos).toHaveLength(0);
  });
});

/**
 * `consolaParaTarea`: el punto de MONTAJE, y lo que solo se puede comprobar aquí.
 *
 * Los tests de arriba entran por un doble de `ConsolaParaTarea`, así que el día que este
 * adaptador deje de reenviar algo se quedarían todos en verde — es la misma razón por la que
 * la batería de git de más abajo usa las piezas de producción.
 */
describe("consolaParaTarea monta la consola con la que corre una tarea", () => {
  /** Lo mínimo que `consolaParaTarea` le pide a una consola de proyecto. */
  function proyectoAbierto() {
    const recibidas: Consola[] = [];
    const dentro = {
      escribir: () => {},
      catalogoModelos: new CatalogoModelosEnMemoria(),
      guardarModeloGlobal: () => ({ ruta: "/x", id: "y" }),
    };
    const consola = {
      raiz: "/w/A",
      idDeHilo: "hilo-1",
      estadoDeSesion: { hilo: "hilo-1", raiz: "/w/A", fuentes: {} },
      consola: { consola: dentro },
      ejecutarTurno: async (_peticion: string, _estado: unknown, deTarea: Consola) => {
        recibidas.push(deTarea);
        return { verificador: "verde" as const, pendientes: 0 };
      },
      cerrar: async () => {},
      esperarMarca: async () => {},
    };
    return { recibidas, consola: consola as unknown as ConsolaDeProyecto };
  }

  /**
   * **Una tarea lleva su PROPIO tope de rondas.** El de la persona son cinco y se
   * dimensionaron para alguien pulsando; en una tarea una ronda no es una pregunta, es una
   * tanda que se autoriza sola — y medido, un turno se cortó con cuatro ficheros escritos y
   * una escritura abandonada porque cada tanda gastaba ronda. Sin este cableado el campo
   * existiría y no haría nada.
   */
  it("le pone el tope de rondas de una TAREA, no el de la persona", async () => {
    const { recibidas, consola } = proyectoAbierto();
    await consolaParaTarea(consola).correrTarea("haz algo", () => {});
    expect(recibidas).toHaveLength(1);
    expect(recibidas[0]!.topeDeAprobaciones).toBe(TOPE_DE_RONDAS_DE_TAREA);
    expect(TOPE_DE_RONDAS_DE_TAREA).not.toBe(MAX_APPROVAL_ROUNDS);
  });

  it("y DEVUELVE lo que el turno informó: es con lo que se mide la entrega", async () => {
    const { consola } = proyectoAbierto();
    expect(await consolaParaTarea(consola).correrTarea("haz algo", () => {})).toEqual({
      verificador: "verde",
      pendientes: 0,
    });
  });
});

/**
 * **Mirar en vivo lo que hace una tarea** (Task 16).
 *
 * El corredor es el único que sabe qué consola es de qué tarea —el registro es `enVuelo`,
 * el mismo que `cortar(id)` usa—, así que es él quien engancha y desengancha al mirón. Lo
 * que NO hace es inventar un registro: lo que se mira son los actos de la consola de esa
 * tarea, los mismos que se vuelcan a su `.jsonl`.
 *
 * La ventana que hay que cubrir: entre que `revisar()` registra la entrada y que
 * `abrirParaTarea` resuelve hay un `await` de verdad (git y disco) y la tarea ya se ve
 * «en proceso» en el kanban. Pulsar «Ver lo que hace» ahí no puede perderse — es la misma
 * carrera que `cortarPedido` cubre para el corte.
 */
describe("mirar en vivo lo que hace una tarea", () => {
  /** Como `proyectoDeMentira`, pero con una consola que sabe de mirones. */
  function conMirones() {
    const p = proyectoDeMentira();
    const emitir: ((mensaje: unknown) => void)[] = [];
    const mirones = new Set<(mensaje: unknown) => void>();
    const actos: unknown[] = [];
    let abierta: (() => void) | undefined;
    return {
      ...p,
      mirones,
      actos,
      /** El turno pinta un acto: le llega a todos los mirones enganchados. */
      pintar: (acto: unknown) => {
        actos.push(acto);
        for (const m of mirones) m({ clase: "acto", acto });
      },
      /** Deja que `abrirParaTarea` resuelva, para poder pulsar «ver» antes. */
      dejarAbrir: () => abierta?.(),
      abrir: async (raiz: string): Promise<ConsolaParaTarea> => {
        await new Promise<void>((resolver) => {
          abierta = resolver;
        });
        const base = await p.abrir(raiz);
        return {
          ...base,
          mirar: (enviar) => {
            mirones.add(enviar as (mensaje: unknown) => void);
            return actos as never;
          },
          dejarDeMirar: (enviar) => void mirones.delete(enviar as (mensaje: unknown) => void),
        };
      },
      emitir,
    };
  }

  it("engancha al mirón a la consola de ESA tarea y devuelve su transcript", async () => {
    const { disco } = discoDeMentira([TAREA()]);
    const p = conMirones();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    p.dejarAbrir();
    await corredor.asentar();
    p.pintar({ tipo: "usuario", texto: "arregla el login" });

    const visto: unknown[] = [];
    const actos = corredor.mirar("t1", (m) => visto.push(m));
    // El transcript de ese instante llega por el valor de retorno, no emitido.
    expect(actos).toEqual([{ tipo: "usuario", texto: "arregla el login" }]);
    expect(visto).toEqual([]);
    // Y lo que venga después, en vivo.
    p.pintar({ tipo: "fase", texto: "planificando", ms: 1, fase: "planificando" });
    expect(visto).toEqual([{ clase: "acto", acto: { tipo: "fase", texto: "planificando", ms: 1, fase: "planificando" } }]);

    p.acabar();
    await corredor.asentar();
    await corredor.parar();
  });

  it("una tarea que no corre AQUÍ contesta `undefined`: no se finge un transcript vacío", async () => {
    const { disco } = discoDeMentira([TAREA()]);
    const p = conMirones();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    p.dejarAbrir();
    await corredor.asentar();
    // `[]` diría «está corriendo y todavía no ha hecho nada», que es otra cosa.
    expect(corredor.mirar("otra", () => {})).toBeUndefined();
    p.acabar();
    await corredor.asentar();
    await corredor.parar();
  });

  it("pulsar «ver» ANTES de que la consola exista no se pierde: se engancha al abrirse", async () => {
    const { disco } = discoDeMentira([TAREA()]);
    const p = conMirones();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    // La entrada ya está en `enVuelo` (el kanban la ve «en proceso») y la consola aún no.
    const visto: { clase: string }[] = [];
    expect(corredor.mirar("t1", (m) => visto.push(m))).toEqual([]);
    p.dejarAbrir();
    await corredor.asentar();
    // Al abrirse, se le manda el transcript que hubiera: sin esto, el mirón se quedaría
    // esperando el primer acto NUEVO y se perdería todo lo anterior.
    expect(visto.map((m) => m.clase)).toEqual(["reemision"]);
    p.pintar({ tipo: "asistente", texto: "listo" });
    expect(visto.map((m) => m.clase)).toEqual(["reemision", "acto"]);
    p.acabar();
    await corredor.asentar();
    await corredor.parar();
  });

  it("dejar de mirar desengancha ESE sumidero y no el de la otra persona", async () => {
    const { disco } = discoDeMentira([TAREA()]);
    const p = conMirones();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    p.dejarAbrir();
    await corredor.asentar();
    const uno: unknown[] = [];
    const otro: unknown[] = [];
    const sumideroUno = (m: unknown): void => {
      uno.push(m);
    };
    corredor.mirar("t1", sumideroUno);
    corredor.mirar("t1", (m) => otro.push(m));
    p.pintar({ tipo: "asistente", texto: "voy" });
    corredor.dejarDeMirar("t1", sumideroUno);
    p.pintar({ tipo: "asistente", texto: "listo" });
    expect(uno).toHaveLength(1);
    expect(otro).toHaveLength(2);
    p.acabar();
    await corredor.asentar();
    await corredor.parar();
  });

  it("`dejarDeMirar` de una tarea que ya no corre no lanza", async () => {
    const { disco } = discoDeMentira([]);
    const p = conMirones();
    const corredor = crearCorredorDeTareas({ ...ENTREGA_VERDE, disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    expect(() => corredor.dejarDeMirar("fantasma", () => {})).not.toThrow();
    await corredor.parar();
  });
});

/**
 * `consolaParaTarea` reenvía el mirar a la consola WEB de esa consola de proyecto, y ahí
 * está el punto delicado: tiene que ser `mirar` y **no** `conectar`. Con `conectar`, el
 * `eof()` de esa consola pasaría a decir que hay un humano al que preguntar (medido), y esa
 * consola es justo la que no puede tener a nadie.
 */
describe("consolaParaTarea: el mirar se reenvía a la consola web, y no como cliente", () => {
  it("delega en `consola.mirar` y no toca `conectar`", () => {
    const llamadas: string[] = [];
    const falsa = {
      raiz: "/w/A",
      idDeHilo: "h1",
      estadoDeSesion: { hilo: "h1", raiz: "/w/A", fuentes: {} },
      ejecutarTurno: async () => undefined,
      cerrar: async () => {},
      esperarMarca: async () => {},
      consola: {
        consola: {},
        mirar: (_enviar: unknown) => {
          llamadas.push("mirar");
          return [{ tipo: "usuario", texto: "x" }];
        },
        dejarDeMirar: () => void llamadas.push("dejarDeMirar"),
        conectar: () => void llamadas.push("conectar"),
      },
    } as unknown as ConsolaDeProyecto;
    const para = consolaParaTarea(falsa);
    expect(para.mirar!(() => {})).toEqual([{ tipo: "usuario", texto: "x" }]);
    para.dejarDeMirar!(() => {});
    expect(llamadas).toEqual(["mirar", "dejarDeMirar"]);
  });
});
