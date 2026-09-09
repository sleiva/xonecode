import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearTransporte, filaDeTarea, type MensajeAlCliente } from "./transporte.js";
import type { Acto } from "../../core/actos.js";
import type { Tarea } from "../../core/tareas.js";
import type { VeredictoDeTarea } from "../../core/entrega.js";

const RAIZ = join(import.meta.dirname, "..", "..", "..");
const RUTA_TAREAS = join(RAIZ, "src", "core", "tareas.ts");
const RUTA_TRANSPORTE = join(RAIZ, "src", "web", "servidor", "transporte.ts");

/**
 * Los campos declarados de una interfaz, por TEXTO.
 *
 * Los tipos se borran al compilar, así que un test que solo mirase un objeto de ejemplo no
 * vería nunca un campo NUEVO — y ese es exactamente el fallo que este fichero existe para
 * cerrar (F1 de la revisión final: `veredicto` se añadió a `Tarea` y se cayó en las tres
 * capas del cable sin que ningún test se pusiera rojo).
 *
 * Cuenta las llaves para quedarse SOLO con el primer nivel: `proyecto: { id, raiz, nombre }`
 * es UN campo, y `veredicto?: { … }` no puede colar `resumen` como si fuera de la tarea. Y
 * quita los comentarios antes de contar, porque los docblocks de este repo llevan llaves
 * dentro (`{clase:"tareas"}`) y sin eso el recuento se descuadra.
 */
export function camposDeInterfaz(ruta: string, nombre: string): string[] {
  const fuente = readFileSync(ruta, "utf8");
  const declaracion = new RegExp(`export interface ${nombre}\\s*\\{`).exec(fuente);
  if (declaracion === null) throw new Error(`no se encontró «export interface ${nombre}» en ${ruta}`);
  const cuerpo = sinComentarios(fuente.slice(declaracion.index + declaracion[0].length));
  const campos: string[] = [];
  let profundidad = 0;
  for (const linea of cuerpo.split("\n")) {
    if (profundidad === 0) {
      const campo = /^\s*([A-Za-z_][A-Za-z0-9_]*)\??\s*:/.exec(linea);
      if (campo !== null) campos.push(campo[1]);
    }
    for (const caracter of linea) {
      if (caracter === "{") profundidad += 1;
      else if (caracter === "}") {
        if (profundidad === 0) return campos.sort();
        profundidad -= 1;
      }
    }
  }
  throw new Error(`la interfaz ${nombre} de ${ruta} no cierra`);
}

const sinComentarios = (fuente: string): string =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/**
 * **Qué campo de `Tarea` produce qué campos del cable, con decisión explícita para TODOS.**
 *
 * Es el remedio que este repo ya conoce (`proyectosDeResultado` tiene un test que compara
 * las claves EXACTAS «para que un "ya que estamos, llevemos también la fecha" no cuele el
 * correo de camino»), aplicado por fin a la traducción del cable: un campo nuevo en `Tarea`
 * no está en este mapa, y entonces el test se pone rojo obligando a DECIDIR si viaja — en
 * vez de caerse en silencio, que es lo que le pasó a `veredicto`.
 *
 * `[]` significa «no viaja», y el motivo va al lado.
 */
const DECISIONES: Readonly<Record<string, readonly string[]>> = {
  id: ["id"],
  // La RAÍZ no viaja: es una ruta de la máquina y el cable puede ir por un túnel. El id es
  // con lo que la interfaz filtra; el nombre, para leer.
  proyecto: ["proyecto", "proyectoNombre"],
  titulo: ["titulo"],
  peticion: ["peticion"],
  encargo: ["encargo"],
  adjuntos: ["adjuntos"],
  estado: ["estado"],
  motivo: ["motivo"],
  sesion: ["sesion"],
  creada: ["creada"],
  empezada: ["empezada"],
  acabada: ["acabada"],
  // El pid es del proceso, no de la tarea: en la pantalla no se puede hacer nada con él, y
  // ya se dice con palabras cuándo la ejecuta otro proceso (`corriendoAqui`).
  pid: [],
  autorizadas: ["autorizadas"],
  feedback: ["feedback"],
  veredicto: ["veredicto"],
  terminadaAMano: ["terminadaAMano"],
};

const TAREA_COMPLETA: Required<Tarea> = {
  id: "t1",
  proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
  titulo: "Arregla el login",
  peticion: "arregla el login",
  encargo: "Arregla el login, con estos pasos…",
  adjuntos: [{ nombre: "captura.png", bytes: 12, mime: "image/png" }],
  estado: "terminada",
  motivo: "un motivo",
  sesion: "s1",
  creada: "2026-09-08T10:00:00.000Z",
  empezada: "2026-09-08T10:01:00.000Z",
  acabada: "2026-09-08T10:09:00.000Z",
  pid: 4242,
  autorizadas: ["app.xne"],
  feedback: [{ texto: "sí, con histórico", creado: "2026-09-08T10:05:00.000Z", consumido: true }],
  veredicto: {
    veredicto: "verde",
    resumen: "hace lo que se pedía",
    hallazgos: ["falta un título en la lista"],
    salvedad: "el turno no cambió ningún fichero",
  },
  terminadaAMano: true,
};

describe("filaDeTarea", () => {
  it("todo campo de `Tarea` tiene una decisión: viaja, o no viaja y por qué", () => {
    expect(camposDeInterfaz(RUTA_TAREAS, "Tarea")).toEqual(Object.keys(DECISIONES).sort());
  });

  it("produce EXACTAMENTE los campos que `TareaDelCable` declara", () => {
    const producidos = [...new Set(Object.values(DECISIONES).flat())].sort();
    expect(camposDeInterfaz(RUTA_TRANSPORTE, "TareaDelCable")).toEqual(producidos);
    // Y de verdad los produce, no solo los declara: con una tarea que trae TODOS los campos
    // puestos, la fila no puede quedarse ninguno por el camino.
    expect(Object.keys(filaDeTarea(TAREA_COMPLETA)).sort()).toEqual(producidos);
  });

  it("la raíz del proyecto NO viaja, ni suelta ni dentro de nada", () => {
    expect(JSON.stringify(filaDeTarea(TAREA_COMPLETA))).not.toContain("/w/AppDemo");
    expect(filaDeTarea(TAREA_COMPLETA).proyecto).toBe("p1");
  });

  /**
   * Ausente y vacío no son lo mismo, y aquí la traducción tiene que conservarlo: `[]` en
   * `autorizadas` es «corrió y no autorizó ninguna» y ausente es «no consta».
   */
  it("un campo ausente no se sintetiza", () => {
    const fila = filaDeTarea({ ...TAREA_COMPLETA, motivo: undefined, veredicto: undefined, autorizadas: [] });
    expect("motivo" in fila).toBe(false);
    expect("veredicto" in fila).toBe(false);
    expect(fila.autorizadas).toEqual([]);
  });

  /**
   * Campo a campo también DENTRO del veredicto: un campo nuevo en `VeredictoDeTarea` no
   * puede viajar sin que nadie lo haya nombrado — es la misma regla que hace que esta
   * función sea una copia explícita y no un `...tarea`.
   */
  it("el veredicto viaja campo a campo, y su salvedad con él", () => {
    expect(filaDeTarea(TAREA_COMPLETA).veredicto).toEqual({
      veredicto: "verde",
      resumen: "hace lo que se pedía",
      hallazgos: ["falta un título en la lista"],
      salvedad: "el turno no cambió ningún fichero",
    });
    const sinExtras = filaDeTarea({
      ...TAREA_COMPLETA,
      veredicto: { veredicto: "rojo", resumen: "falta el campo" },
    });
    expect(sinExtras.veredicto).toEqual({ veredicto: "rojo", resumen: "falta el campo" });
    // Y un campo que nadie ha nombrado NO viaja: es lo que distingue esta copia de un
    // `...tarea.veredicto`, que dejaría pasar lo que alguien le añada mañana a
    // `VeredictoDeTarea` sin que ninguna capa lo declarara.
    const conColado = filaDeTarea({
      ...TAREA_COMPLETA,
      veredicto: { veredicto: "verde", resumen: "vale", colado: "no debería viajar" } as VeredictoDeTarea,
    });
    expect(conColado.veredicto).toEqual({ veredicto: "verde", resumen: "vale" });
  });
});

/**
 * **Los MIRONES: quien mira una tarea de fondo no cuenta como cliente.**
 *
 * Task 16. La vista en vivo de una tarea se hace enganchando un sumidero al transporte de
 * SU consola, y ahí hay dos trampas medidas que este bloque fija:
 *
 * 1. **`conectar()` habría vuelto `eof()` mentiroso.** Medido antes de escribir nada: con
 *    un sumidero enganchado por `conectar`, el `eof()` de esa consola de proyecto pasa de
 *    `true` a `false` — o sea, «hay un humano al que preguntar». Y no lo hay: la vista es
 *    de SOLO lectura (decisión 2 del diseño), no hay compositor, y nadie puede contestar
 *    una pregunta ni aprobar nada desde ahí. El turno de la tarea no se entera hoy porque
 *    corre con `crearConsolaDeTarea` (`eof: () => true` a fuego, medido), pero apoyarse en
 *    eso sería dejar puesta la trampa para el día que un mensaje del cliente llegue a esa
 *    consola. Por eso `mirar` es un conjunto APARTE que no toca `hayCliente`.
 * 2. **Al mirón NO se le manda todo lo que se emite.** Por el transporte de una consola de
 *    tarea viajan además del transcript el `{clase:"turno"}` de los flancos —lo emite el
 *    envoltorio de `vestibulo.ts` sin mirar `alCable`, medido— y en teoría cualquier otra
 *    clase. Si eso llegara al cliente por el mismo cable que su propia sesión, el
 *    compositor de quien esté trabajando se apagaría por un turno que no es suyo. Al mirón
 *    va SOLO el transcript: `acto`, `sustitucion` y `reemision`.
 */
describe("mirar — la vista en vivo de una tarea", () => {
  it("un mirón NO cuenta como cliente: `conectado()` sigue diciendo que no hay nadie", () => {
    const t = crearTransporte(() => []);
    const visto: MensajeAlCliente[] = [];
    expect(t.conectado()).toBe(false);
    t.mirar((m) => visto.push(m));
    // Lo que sostiene el fail-closed de la consola de tarea: `eof()` es `!conectado()`.
    expect(t.conectado()).toBe(false);
  });

  it("al mirón le llega el transcript, y NADA más: ni `turno`, ni aprobaciones, ni preguntas", () => {
    const t = crearTransporte(() => []);
    const visto: MensajeAlCliente[] = [];
    t.mirar((m) => visto.push(m));
    t.emitir({ clase: "acto", acto: { tipo: "asistente", texto: "voy" } });
    t.emitir({ clase: "sustitucion", acto: { tipo: "asistente", texto: "voy allá" } });
    t.emitir({ clase: "reemision", actos: [{ tipo: "asistente", texto: "voy allá" }] });
    // Lo que NO puede pasar: el `turno` apagaría el compositor de quien mira, y la
    // aprobación es el ÚNICO mensaje con contenido de fichero y diff dentro.
    t.emitir({ clase: "turno", activo: true });
    t.emitir({ clase: "pregunta", texto: "¿qué rama?" });
    t.emitir({ clase: "secreto", pregunta: "la clave de openai" });
    t.emitir({ clase: "selector", selector: { titulo: "elige", opciones: [] } });
    t.emitir({ clase: "aprobacion", pendientes: [], ficheros: {}, diffs: {} });
    expect(visto.map((m) => m.clase)).toEqual(["acto", "sustitucion", "reemision"]);
  });

  it("`mirar` devuelve el transcript de ese instante, y no lo emite a nadie más", () => {
    const actos: Acto[] = [{ tipo: "usuario", texto: "arregla el login" }];
    const t = crearTransporte(() => actos);
    const delCliente: MensajeAlCliente[] = [];
    t.conectar((m) => delCliente.push(m));
    const delMiron: MensajeAlCliente[] = [];
    expect(t.mirar((m) => delMiron.push(m))).toEqual(actos);
    // Empezar a mirar no le manda nada a nadie: quien mira recibe su transcript por el
    // valor de retorno, igual que hace `conectar`.
    expect(delCliente).toEqual([]);
    expect(delMiron).toEqual([]);
  });

  it("dejar de mirar desengancha ESE sumidero y no los demás", () => {
    const t = crearTransporte(() => []);
    const uno: MensajeAlCliente[] = [];
    const otro: MensajeAlCliente[] = [];
    const sumideroUno = (m: MensajeAlCliente): void => {
      uno.push(m);
    };
    const sumideroOtro = (m: MensajeAlCliente): void => {
      otro.push(m);
    };
    t.mirar(sumideroUno);
    t.mirar(sumideroOtro);
    t.emitir({ clase: "acto", acto: { tipo: "fase", texto: "planificando", ms: 1, fase: "planificando" } });
    expect(uno).toHaveLength(1);
    expect(otro).toHaveLength(1);
    t.dejarDeMirar(sumideroUno);
    t.emitir({ clase: "acto", acto: { tipo: "asistente", texto: "listo" } });
    // Dos personas mirando la misma tarea: que una cierre no puede dejar muda a la otra.
    expect(uno).toHaveLength(1);
    expect(otro).toHaveLength(2);
  });

  it("irse el último mirón NO despierta a quien esperaba respuesta: no era un humano", () => {
    const t = crearTransporte(() => []);
    let cortes = 0;
    t.alDesconectar(() => cortes++);
    const sumidero = (): void => {};
    t.mirar(sumidero);
    t.dejarDeMirar(sumidero);
    // `alDesconectar` es lo que responde cadena vacía a cada pregunta y resuelve la
    // aprobación en vuelo. Un mirón que se va no ha dejado a nadie sin contestar.
    expect(cortes).toBe(0);
  });

  it("`desconectar()` sin sumidero se lleva también a los mirones: la consola se abandona", () => {
    const t = crearTransporte(() => []);
    const visto: MensajeAlCliente[] = [];
    t.mirar((m) => visto.push(m));
    // Es lo que hace `ConsolaWeb.cerrar()` y lo que hace mudarse de consola: no queda nadie
    // a quien escribirle, y un sumidero de una consola cerrada es un socket que ya se fue.
    t.desconectar();
    t.emitir({ clase: "acto", acto: { tipo: "asistente", texto: "listo" } });
    expect(visto).toEqual([]);
  });
});
