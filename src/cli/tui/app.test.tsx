/**
 * La maqueta completa, montando la App DE VERDAD.
 *
 * Los tests de pieza (transcript, entrada, sidebar) prueban cada componente aislado, y
 * por eso NO pueden ver el fallo que importa: la fila de dos columnas tiene altura fija
 * (`rows - 1`, la fila de reserva del borrado total de Ink) y, si alguna pieza se
 * estira, Ink descarta las filas sobrantes por abajo — el cursor `▏` y el pie
 * desaparecen justo cuando el transcript se llena o la línea envuelve. Solo se ve
 * montando la App entera con una altura conocida.
 *
 * `ink-testing-library` no sirve aquí: fija `columns` en 100 y no expone `rows`, así que
 * la altura —lo único que este test mide— no se puede elegir. Se monta con el `render`
 * de Ink sobre un stdout FALSO (columnas y filas a medida) y `debug: true`, que hace que
 * Ink escriba el frame COMPLETO en cada render: el último trozo escrito es el frame.
 *
 * Sin TTY: el stdout falso no declara `isTTY` (el invariante de `npm test`). El stdin sí
 * lo declara, porque `useInput` llama a `setRawMode` y sin `isTTY` Ink lanza — es un
 * doble de teclado en memoria, no un terminal.
 */
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { render } from "ink";
import { createElement } from "react";
import { App } from "./app.js";
import { crearStore, crearRanura, vistaInicial } from "./store.js";
import type { DatosDeSidebar } from "./sidebar.js";
import { crearEmisorDeRueda, crearStdinSinRaton, type StdinParaInk } from "./raton.js";

/** El terminal falso: solo mide y recoge. Nada de `isTTY`. */
class StdoutFalso extends EventEmitter {
  frames: string[] = [];
  constructor(
    public columns: number,
    public rows: number
  ) {
    super();
  }
  write = (texto: string): boolean => {
    this.frames.push(texto);
    return true;
  };
  ultimo(): string {
    return this.frames.at(-1) ?? "";
  }
}

/** El teclado falso: `write` empuja lo tecleado por donde Ink lo lee. */
class StdinFalso extends EventEmitter {
  isTTY = true;
  private pendiente: string | null = null;
  write = (datos: string): void => {
    this.pendiente = datos;
    this.emit("readable");
    this.emit("data", datos);
  };
  read = (): string | null => {
    const d = this.pendiente;
    this.pendiente = null;
    return d;
  };
  setEncoding(): void {}
  setRawMode(): void {}
  resume(): void {}
  pause(): void {}
  ref(): void {}
  unref(): void {}
}

const esperar = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms));

const FILAS = 24;
/** Anchura por omisión: con sidebar (la regla es «más de 120»). */
const COLUMNAS = 140;

function datosDe(ruta: string): DatosDeSidebar {
  return {
    contexto: 15_400,
    tope: 200_000,
    modelo: "ollama/glm",
    modelosPorPapel: { trabajo: "ollama/glm" },
    proyecto: "MinitMT",
    ruta,
    rama: "main",
    version: "0.3.0",
  };
}

function montar(opciones: {
  columnas?: number;
  ruta?: string;
  completa?: (linea: string) => [string[], string];
  /** Datos de sidebar propios (se leen en cada render): para probar cambios en caliente. */
  datos?: () => DatosDeSidebar;
  responderSelector?: (id: string | undefined) => void;
  /** Con ratón: Ink lee un stdin FILTRADO (`raton.ts`) y el transcript recibe la rueda. */
  raton?: boolean;
}) {
  const store = crearStore();
  const vista = crearRanura(vistaInicial());
  const stdout = new StdoutFalso(opciones.columnas ?? COLUMNAS, FILAS);
  const stdin = new StdinFalso();
  const rueda = opciones.raton ? crearEmisorDeRueda() : undefined;
  const stdinParaInk =
    rueda === undefined ? stdin : crearStdinSinRaton(stdin as unknown as StdinParaInk, rueda.emitir);
  const instancia = render(
    createElement(App, {
      store,
      vista,
      alEnviar: () => {},
      responder: () => {},
      responderSelector: opciones.responderSelector ?? (() => {}),
      completa: opciones.completa ?? ((): [string[], string] => [[], ""]),
      historial: [],
      datosSidebar: opciones.datos ?? (() => datosDe(opciones.ruta ?? "/dev/MinitMT")),
      alCancelarTurno: () => {},
      rueda,
    }),
    {
      stdout: stdout as never,
      stdin: stdinParaInk as never,
      stderr: new StdoutFalso(80, FILAS) as never,
      debug: true,
      exitOnCtrlC: false,
      patchConsole: false,
    }
  );
  // El frame se lee ANTES de desmontar: el desmontaje escribe un frame final propio.
  return { store, vista, stdout, stdin, instancia };
}

/**
 * Las aserciones que la maqueta debe cumplir SIEMPRE, sea cual sea el estado. Con
 * sidebar (más de 120 columnas), «● xonecode» cierra la última fila junto al pie; sin
 * ella, la versión no está en pantalla y el pie es lo único que cierra.
 */
function laMaquetaCabe(frame: string, opciones: { sidebar?: boolean } = {}): void {
  const lineas = frame.split("\n");
  expect(lineas).toHaveLength(FILAS - 1); // la fila de reserva del borrado total de Ink
  expect(lineas.at(-1)).toContain("/ayuda");
  if (opciones.sidebar ?? true) expect(lineas.at(-1)).toContain("● xonecode");
  else expect(frame).not.toContain("● xonecode");
}

describe("la maqueta de la App", () => {
  it("en reposo: 23 filas, pie abajo, cursor visible y título de proyecto con 140 columnas", async () => {
    const m = montar({});
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame);
    expect(frame).toContain("▏");
    expect(frame).toContain("MinitMT");
  });

  it("con un prompt de 60 caracteres el cursor sigue en pantalla", async () => {
    const m = montar({});
    await esperar();
    m.stdin.write("haz que la colección de clientes ordene por apellido y luego");
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame);
    expect(frame).toContain("▏");
  });

  it("con un prompt ENVUELTO (105 chars a 80 columnas) el cursor sigue en pantalla", async () => {
    // A 80 columnas no hay sidebar, y la Entrada tiene 77 columnas de contenido (80 − 1
    // de paddingRight − 2 de la barra), así que 105 caracteres ocupan DOS filas y la
    // Entrada pasa de 2 a 3. Es el primer disparador del fallo: el que no se ve con el
    // prompt de 60 a 140 columnas, donde todavía cabe en una fila.
    //
    // La línea entra de GOLPE (un solo write) y sobre la línea VACÍA, que es como llega
    // de verdad al recuperar del historial con ↑ o al pegar — y es el caso en el que Ink
    // se quedaba con la altura de una fila. Letra a letra, o desde un valor no vacío, el
    // fallo no aparece.
    const m = montar({ columnas: 80 });
    await esperar();
    m.stdin.write("haz que la colección de clientes ordene por apellido y luego por nombre, y que el listado enseñe el total");
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame, { sidebar: false });
    // La segunda fila del prompt está entera y el cursor con ella: la fila del modelo no
    // la ha pisado.
    expect(frame).toContain("total▏");
    expect(frame).toContain("ollama/glm");
  });

  it("con la pista de Tab (3 candidatos) el cursor sigue en pantalla", async () => {
    const m = montar({ completa: () => [["/config", "/conectar", "/conectar2"], "/con"] });
    await esperar();
    m.stdin.write("/con");
    await esperar();
    m.stdin.write("\t");
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    expect(frame).toContain("fig"); // la pista está pintada (/con|fig, |ectar, …)
    laMaquetaCabe(frame);
    expect(frame).toContain("▏");
  });

  it("el selector filtra, se navega con flechas y Enter entrega el modelo activo", async () => {
    const responderSelector = vi.fn();
    const m = montar({ responderSelector });
    await esperar();
    m.vista.mutar({
      selector: {
        titulo: "Modelos de gemini",
        opciones: [
          { id: "flash", etiqueta: "Gemini Flash", detalle: "rápido" },
          { id: "pro", etiqueta: "Gemini Pro", detalle: "razonamiento" },
        ],
        responder: () => {},
      },
    });
    await esperar();
    m.stdin.write("pro");
    await esperar();
    expect(m.stdout.ultimo()).toContain("Gemini Pro");
    expect(m.stdout.ultimo()).not.toContain("Gemini Flash");
    m.stdin.write("\r");
    await esperar();
    m.instancia.unmount();
    expect(responderSelector).toHaveBeenCalledWith("pro");
  });

  it("pinta un selector abierto justo al montar, antes de que React instale sus efectos", async () => {
    const m = montar({});
    // Es la misma carrera que el asistente inicial: `render()` ya devolvió, pero su
    // useEffect aún no ha suscrito la App a la ranura.
    m.vista.mutar({
      selector: {
        titulo: "Elige el modo de trabajo",
        opciones: [{ id: "offline", etiqueta: "Offline", detalle: "Trabajar localmente" }],
        responder: () => {},
      },
    });
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    expect(frame).toContain("Elige el modo de trabajo");
    expect(frame).toContain("Offline");
  });

  it("con el transcript lleno y colchón vivo el cursor sigue en pantalla", async () => {
    const m = montar({});
    await esperar();
    // El transcript se llena por el store y no por el teclado: son actos del agente, no
    // teclas — el camino real por el que se desborda.
    for (let i = 0; i < 40; i++) m.store.linea(`línea ${i}`, "sistema");
    m.store.token("streaming en curso sin salto de línea");
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame);
    expect(frame).toContain("▏");
    expect(frame).toContain("streaming en curso");
  });

  it("cuando el transcript no cabe, el recorte se lleva lo VIEJO y nunca lo del medio", async () => {
    // El caso que más aprieta: transcript lleno, colchón vivo Y pista de Tab (que roba
    // una fila más). Con las filas encogibles, Ink repartía el recorte entre todas y las
    // redondeaba sobre las mismas: se perdían actos del medio y el colchón del final.
    const m = montar({ completa: () => [["/config", "/conectar", "/conectar2"], "/con"] });
    await esperar();
    for (let i = 0; i < 40; i++) m.store.linea(`línea ${i}`, "sistema");
    m.store.token("streaming vivo");
    m.stdin.write("/con");
    await esperar();
    m.stdin.write("\t");
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame);
    expect(frame).toContain("▏");
    // Lo último sigue ahí: el acto más nuevo y el colchón en curso.
    expect(frame).toContain("línea 39");
    expect(frame).toContain("streaming vivo");
    // Y lo que se ve es un tramo CONSECUTIVO: sin huecos en el medio.
    const numeros = [...frame.matchAll(/línea (\d+)/g)].map((c) => Number(c[1]));
    expect(numeros).toEqual(Array.from({ length: numeros.length }, (_, i) => numeros[0]! + i));
    expect(numeros.length).toBeGreaterThan(10);
  });

  it("ocupado: el aviso de turno sustituye al cursor sin romper la maqueta", async () => {
    const m = montar({});
    await esperar();
    m.vista.mutar({ ocupado: true });
    for (let i = 0; i < 40; i++) m.store.linea(`línea ${i}`, "sistema");
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame);
    expect(frame).toContain("turno en curso");
  });

  it("con 50 columnas la ruta larga se trunca por delante, sin sidebar y sin perder el pie", async () => {
    // Sin sidebar el pie enseña `ruta:rama`, y a 50 columnas (49 de pie menos las cifras
    // y /ayuda) no cabe entera: se trunca POR DELANTE — se pierde la cabeza, se conserva
    // la cola, que es la que identifica el proyecto y la rama.
    const m = montar({ columnas: 50, ruta: "/Users/sergioleivaortega/dev/MinitMT" });
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame, { sidebar: false });
    expect(frame).toContain("▏");
    expect(frame).toContain("MinitMT:main");
    expect(frame).not.toContain("/Users/sergioleivaortega");
    expect(frame).not.toContain("█"); // sin sidebar, sin logotipo
  });

  it("con 140 columnas la sidebar muestra el título del proyecto", async () => {
    const m = montar({});
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame);
    expect(frame).toContain("MinitMT");
    expect(frame).toContain("█");
  });

  it("con 120 columnas exactas NO hay sidebar (la regla es estricta) y el pie lleva la rama", async () => {
    const m = montar({ columnas: 120 });
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame, { sidebar: false });
    expect(frame).not.toContain("█");
    expect(frame).toContain("/dev/MinitMT:main");
  });

  it("al ENSANCHAR el terminal aparece la sidebar: el resize re-renderiza App, no solo repinta", async () => {
    // Ink escucha `resize`, pero su manejador solo recalcula Yoga y repinta el árbol ya
    // montado (`ink.js`, `resized`): sin un re-render de React, `stdout.columns` no se
    // vuelve a leer y la sidebar seguiría sin montarse hasta el siguiente acto.
    const m = montar({ columnas: 100 });
    await esperar();
    expect(m.stdout.ultimo()).not.toContain("█");
    m.stdout.columns = 140;
    m.stdout.emit("resize");
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame);
    expect(frame).toContain("MinitMT");
  });

  it("con pocos actos el transcript nace ARRIBA: el primer acto ocupa la primera fila", async () => {
    // Como en OpenCode: la conversación empieza arriba y la Entrada se queda abajo, con el
    // hueco en medio. El recorte cuando NO cabe sigue siendo por arriba (los tests de
    // desborde lo vigilan): esto solo cambia dónde se apoya el contenido cuando sobra sitio.
    const m = montar({});
    await esperar();
    m.store.usuario("hola");
    m.store.linea("respuesta corta", "asistente");
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame);
    const lineas = frame.split("\n");
    // La tarjeta de usuario lleva su aire DENTRO: el texto nace en la fila 1, no en la 0.
    expect(lineas[0]!.replace("┃", "").trim()).toBe("");
    expect(lineas[1]).toContain("hola");
    // La respuesta respira una fila tras la tarjeta de usuario: es un bloque distinto,
    // no texto apilado sobre el prompt.
    expect(lineas[4]).toContain("respuesta corta");
  });

  it("40 líneas de tool en un turno ocupan como mucho 5 filas y no esconden el texto del asistente", async () => {
    // Lo que se veía en el terminal: el transcript inundado de «lee /x» hasta echar la
    // tarjeta fuera. Las tools son paisaje: un grupo, las últimas 4 y la cuenta.
    const m = montar({});
    await esperar();
    m.store.usuario("hazme un diagrama");
    m.store.linea("Voy a inspeccionar el proyecto. Delego en el planner:", "asistente");
    for (let i = 0; i < 40; i++) m.store.linea(`→ lee /fichero_${i}.xne`);
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame);
    expect(frame).toContain("hazme un diagrama");
    expect(frame).toContain("Delego en el planner");
    expect(frame).toContain("… 36 pasos antes");
    expect(frame).toContain("/fichero_39.xne");
    expect((frame.match(/→ lee/g) ?? []).length).toBe(4);
  });

  it("el pie conserva «/ayuda» cuando llegan las primeras cifras de contexto", async () => {
    // MEDIDO en terminal real: tras el primer turno el pie decía «2K» y nada más. Al
    // arrancar no hay medición y el pie pinta solo «/ayuda» (6 columnas); cuando llegan las
    // cifras se INSERTAN delante en el mismo Text, y ese es el caso en que ink 5.2.1 no
    // remide (CLAUDE.md, «Trampas verificadas»): el Text se queda con 6 columnas, envuelve,
    // y «tokens  /ayuda» cae a una fila que la altura fija recorta.
    const datos = { ...datosDe("/dev/MinitMT"), contexto: 0, tope: undefined };
    const m = montar({ datos: () => datos });
    await esperar();
    expect(m.stdout.ultimo().split("\n").at(-1)).toContain("/ayuda");
    datos.contexto = 2000;
    m.store.linea("aviso", "sistema"); // un acto: la App repinta y relee los datos
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame);
    expect(frame.split("\n").at(-1)).toContain("2K tokens  /ayuda");
  });

  it("con ratón: Ink lee el stdin filtrado — la rueda mueve el transcript y NO se cuela como texto", async () => {
    // El montaje real de correrTui.ts, con el stdin falso detrás del filtro: prueba que la
    // superficie que `crearStdinSinRaton` ofrece es la que Ink 5 usa de verdad.
    const m = montar({ raton: true });
    await esperar();
    for (let i = 0; i < 40; i++) m.store.linea(`línea ${i}`, "sistema");
    await esperar();
    m.stdin.write("ho\x1b[<64;10;5Mla"); // «hola» con una muesca de rueda hacia arriba en medio
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame);
    expect(frame).toContain("hola▏");
    expect(frame).not.toContain("64;10");
    // La ventana subió 3 actos: lo último ya no se ve.
    expect(frame).not.toContain("línea 39");
    expect(frame).toContain("línea 36");
  });

  it("al ESTRECHAR el terminal la sidebar se va y la rama pasa al pie", async () => {
    const m = montar({ columnas: 140 });
    await esperar();
    expect(m.stdout.ultimo()).toContain("MinitMT");
    m.stdout.columns = 100;
    m.stdout.emit("resize");
    await esperar();
    const frame = m.stdout.ultimo();
    m.instancia.unmount();
    laMaquetaCabe(frame, { sidebar: false });
    expect(frame).not.toContain("█");
    expect(frame).toContain("/dev/MinitMT:main");
  });
});
