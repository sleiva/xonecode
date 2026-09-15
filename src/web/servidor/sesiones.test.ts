import { mkdtempSync, writeFileSync, readFileSync, existsSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import type { Acto } from "../../core/actos.js";
import { tituloDesde,
  crearSesion,
  anotarActo,
  listarSesiones,
  reabrirSesion,
  borrarSesion,
  renombrarSesion,
  elegirDispositivo,
  IndiceDeSesionesRoto,
  marcarTareaDeSesion,
  sembrarConsumosPendientes,
  SESIONES_A_SEMBRAR,
  TOPE_DE_BYTES_DE_SIEMBRA,
} from "./sesiones.js";

const proyecto = () => mkdtempSync(join(tmpdir(), "xonecode-proyecto-"));

/** Quita el acumulado del índice a mano: es el estado de una sesión anterior a que se
 *  estampara, que es justo cuando la siembra tiene algo que hacer. */
const quitarConsumo = (raiz: string): void => {
  const ruta = join(raiz, ".xonecode", "sesiones", "indice.json");
  const entradas = JSON.parse(readFileSync(ruta, "utf8"));
  for (const e of entradas) delete e.consumo;
  writeFileSync(ruta, JSON.stringify(entradas));
};

describe("sesiones por proyecto", () => {
  it("el título sale de la primera prosa del usuario", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "añade una colección de clientes" });
    expect(listarSesiones(raiz)[0].titulo).toBe("añade una colección de clientes");
  });

  it("se guarda UN ACTO POR LÍNEA y se anexa, no se reescribe", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "hola" });
    anotarActo(raiz, id, { tipo: "asistente", texto: "qué tal" });
    const bruto = readFileSync(join(raiz, ".xonecode", "sesiones", `${id}.jsonl`), "utf8");
    expect(bruto.trimEnd().split("\n")).toHaveLength(2);
  });

  it("reabrir devuelve los actos en orden y la marca como histórica", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "uno" });
    anotarActo(raiz, id, { tipo: "asistente", texto: "dos" });
    const abierta = reabrirSesion(raiz, id);
    expect(abierta.actos.map((a) => ("texto" in a ? a.texto : ""))).toEqual(["uno", "dos"]);
    expect(abierta.historica).toBe(true);
  });

  it("una línea corrupta se SALTA y las demás siguen: no tumba la reapertura", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "uno" });
    const ruta = join(raiz, ".xonecode", "sesiones", `${id}.jsonl`);
    writeFileSync(ruta, readFileSync(ruta, "utf8") + "{esto no es json\n");
    anotarActo(raiz, id, { tipo: "asistente", texto: "tres" });
    expect(reabrirSesion(raiz, id).actos).toHaveLength(2);
  });

  it("una sesión reabierta no vuelve a nacer: el id se conserva", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    expect(reabrirSesion(raiz, id).id).toBe(id);
  });

  it("un indice.json roto para la escritura sin sobrescribirlo: no borra sesiones que nombraba", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    const rutaIndice = join(raiz, ".xonecode", "sesiones", "indice.json");
    const indiceRoto = "{esto no es json";
    writeFileSync(rutaIndice, indiceRoto);
    expect(() => anotarActo(raiz, id, { tipo: "usuario", texto: "uno" })).toThrow(IndiceDeSesionesRoto);
    // El acto se escribió en el .jsonl aunque el índice esté roto: lo prescindible (el
    // índice, reconstruible barriendo los .jsonl) no puede tumbar lo irrecuperable (el acto).
    expect(reabrirSesion(raiz, id).actos).toEqual([{ tipo: "usuario", texto: "uno" }]);
    // Y el indice.json roto se queda EXACTAMENTE como estaba: nadie lo sobrescribió con [].
    expect(readFileSync(rutaIndice, "utf8")).toBe(indiceRoto);
  });
});

describe("de quién es la sesión: persona o tarea", () => {
  it("la de una tarea queda MARCADA con su id, y sobrevive al índice", () => {
    // Medido en el proyecto real del usuario: la sesión de la tarea de ayer está en el
    // índice como una más y con el título VACÍO —una tarea no manda ningún acto de
    // `usuario`, que es de donde sale el título—, así que en la barra es una fila en
    // blanco indistinguible de una conversación. Sin esta marca no hay forma de saberlo:
    // cruzarla con la cola no vale, porque la cola es OPCIONAL en las dos capas
    // (`OpcionesDeMontaje.colaDeTareas` y el mensaje `tareas`) y un proceso que no corre
    // tareas pintaría todas las sesiones de tarea como conversaciones, en silencio.
    const raiz = proyecto();
    crearSesion(raiz, "s-tarea", "669c9b79");
    expect(listarSesiones(raiz)[0].tarea).toBe("669c9b79");
  });

  it("la de una persona no lleva marca: ausente es «no consta», no «es un chat»", () => {
    // La distinción importa por las sesiones de ANTES de que la marca existiera: se leen
    // igual que una conversación porque pintar liso es lo conservador, no porque conste
    // que lo sean. Misma forma que `compartido` ausente en un proyecto.
    const raiz = proyecto();
    crearSesion(raiz, "s-humana");
    expect(listarSesiones(raiz)[0].tarea).toBeUndefined();
  });
});

describe("marcarTareaDeSesion: la siembra de las sesiones de tarea que ya existían", () => {
  it("marca la entrada que no lo estaba y dice que la tocó", () => {
    const raiz = proyecto();
    crearSesion(raiz, "s9");
    expect(marcarTareaDeSesion(raiz, "s9", "669c9b79")).toBe(true);
    expect(listarSesiones(raiz)[0].tarea).toBe("669c9b79");
  });

  it("es MONOTÓNICA: no pisa una marca puesta ni la quita", () => {
    // La siembra corre en cada arranque del corredor. Solo puede AÑADIR: así no hay forma
    // de que convierta una sesión de tarea en una conversación, que es el único fallo
    // abierto posible por aquí.
    const raiz = proyecto();
    crearSesion(raiz, "s9", "la-de-verdad");
    expect(marcarTareaDeSesion(raiz, "s9", "otra")).toBe(false);
    expect(listarSesiones(raiz)[0].tarea).toBe("la-de-verdad");
  });

  it("una sesión que no está no se inventa", () => {
    // La cola de tareas vive en `~/.xonecode/tareas` y el índice en el proyecto: una tarea
    // puede nombrar una sesión que alguien borró, y crear la entrada la resucitaría en la
    // barra apuntando a un `.jsonl` que ya no existe.
    const raiz = proyecto();
    expect(marcarTareaDeSesion(raiz, "fantasma", "t1")).toBe(false);
    expect(listarSesiones(raiz)).toEqual([]);
  });
});

describe("lo que ha gastado la sesión, estampado en el índice", () => {
  const cuenta = (entrada: number, salida: number, cache = 0) => ({ entrada, salida, cache });
  const fin = (entrada: number, salida: number, ventana?: number): Acto => ({
    tipo: "fin",
    ms: 10,
    consumo: {
      modelo: cuenta(entrada, salida),
      externo: cuenta(0, 0),
      ...(ventana === undefined ? {} : { ventana }),
    },
  });

  it("un `fin` con consumo lo estampa, sin la ventana", () => {
    // La ventana NO viaja: es «cuánto ocupa el historial AHORA» y en una sesión cerrada
    // sería un «ahora» de hace días que alguien leería como el de hoy. Sigue en el `.jsonl`.
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, fin(100, 10, 5000));
    expect(listarSesiones(raiz)[0].consumo).toEqual({ modelo: cuenta(100, 10), externo: cuenta(0, 0) });
  });

  it("dos `fin` SUMAN: el acumulado es la sesión, no el último turno", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, fin(100, 10));
    anotarActo(raiz, id, fin(50, 5));
    expect(listarSesiones(raiz)[0].consumo?.modelo).toEqual(cuenta(150, 15));
  });

  it("un consumo a CERO se estampa: es una medida, no una ausencia", () => {
    // `{0,0}` es lo que devuelve un turno que se midió y no gastó —o que gastó tan poco que
    // redondea a cero—, y es un dato. Lo que no se estampa es «no consta», que es no tener
    // el acto o no tener el campo.
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, fin(0, 0));
    expect(listarSesiones(raiz)[0].consumo).toEqual({ modelo: cuenta(0, 0), externo: cuenta(0, 0) });
  });

  it("sin `fin` con consumo no se escribe el campo: ausente es «no consta»", () => {
    // Ni con actos de otra clase, ni con un `fin` de una sesión anterior a que se midiera.
    // Un `{0,0}` aquí afirmaría que la sesión salió gratis, y con él la barra pintaría un
    // `↑0 ↓0` que nadie ha medido.
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "hola" });
    anotarActo(raiz, id, { tipo: "fin", ms: 5 });
    expect(listarSesiones(raiz)[0].consumo).toBeUndefined();
    expect("consumo" in JSON.parse(readFileSync(join(raiz, ".xonecode", "sesiones", "indice.json"), "utf8"))[0]).toBe(
      false
    );
  });

  it("un acto de otra clase después NO borra el acumulado", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, fin(100, 10));
    anotarActo(raiz, id, { tipo: "usuario", texto: "y ahora otra cosa" });
    expect(listarSesiones(raiz)[0].consumo?.modelo).toEqual(cuenta(100, 10));
  });

  it("una sesión anterior a esto que recibe un turno suma la SESIÓN ENTERA, no solo ese turno", () => {
    // La trampa que decide el diseño: la entrada existe pero NO trae acumulado —es de antes
    // de que esto se estampara—, y sumarle el delta de este turno dejaría en el índice el
    // gasto del ÚLTIMO turno con la forma de un total. Una sesión de 11k que hace un turno
    // de 3k quedaría en 3k, y nadie lo notaría porque el número es plausible. Por eso ahí se
    // relee el `.jsonl` —que ya lleva este acto dentro— y se suma entero.
    const raiz = proyecto();
    const id = crearSesion(raiz);
    // Una sesión "vieja": sus actos están en el `.jsonl` y su entrada no tiene el acumulado.
    anotarActo(raiz, id, fin(7000, 4000));
    const indice = join(raiz, ".xonecode", "sesiones", "indice.json");
    const entradas = JSON.parse(readFileSync(indice, "utf8"));
    delete entradas[0].consumo;
    writeFileSync(indice, JSON.stringify(entradas));
    // Y ahora un turno nuevo, con su delta.
    anotarActo(raiz, id, fin(3000, 200));
    expect(listarSesiones(raiz)[0].consumo?.modelo).toEqual(cuenta(10_000, 4_200));
  });

  it("anotar sin entrada previa también estampa la sesión entera, no solo el acto suelto", () => {
    // El camino defensivo (índice perdido a mitad): la entrada se crea aquí, así que no hay
    // acumulado del que partir y vale la misma regla.
    const raiz = proyecto();
    anotarActo(raiz, "s-suelta", fin(400, 40));
    expect(listarSesiones(raiz)[0].consumo?.modelo).toEqual(cuenta(400, 40));
  });
});

describe("sembrarConsumosPendientes: el acumulado de las sesiones que ya existían", () => {
  const cuenta = (entrada: number, salida: number, cache = 0) => ({ entrada, salida, cache });
  const fin = (entrada: number, salida: number, ventana?: number): Acto => ({
    tipo: "fin",
    ms: 10,
    consumo: {
      modelo: cuenta(entrada, salida),
      externo: cuenta(0, 0),
      ...(ventana === undefined ? {} : { ventana }),
    },
  });

  it("rellena lo que falta y dice cuántas tocó", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, fin(100, 10));
    quitarConsumo(raiz);
    expect(sembrarConsumosPendientes(raiz)).toBe(1);
    expect(listarSesiones(raiz)[0].consumo?.modelo).toEqual(cuenta(100, 10));
  });

  /**
   * El mismo invariante que el estampado, y el que se escapó: los dos caminos que escriben
   * `EntradaIndice.consumo` tienen que normalizar igual, porque `consumoDeLosActos` —que es de
   * quien tira la siembra— se queda a propósito con la ventana del último `fin` que la traiga.
   * La siembra la escribía tal cual, y como hoy NADIE pinta ese campo (la ventana va en su
   * propio mensaje, `contexto`), el índice se quedaba con un «cuánto ocupa el historial ahora»
   * de un turno de anteayer sin que nada se pusiera rojo. Se vio leyendo un `indice.json` real.
   */
  it("la ventana del `.jsonl` NO se cuela en el acumulado sembrado", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, fin(100, 10, 5000));
    anotarActo(raiz, id, fin(20, 2, 4482));
    quitarConsumo(raiz);
    expect(sembrarConsumosPendientes(raiz)).toBe(1);
    expect(listarSesiones(raiz)[0].consumo).toEqual({ modelo: cuenta(120, 12), externo: cuenta(0, 0) });
  });

  it("es MONOTÓNICA: la segunda pasada no toca nada y devuelve 0", () => {
    // Corre en la primera lista de cada raíz, y podría volver a correr. Solo puede AÑADIR:
    // no pisa un acumulado puesto —el que escribió `anotarActo` es el que consta— y por eso
    // correrla de más no puede estropear nada.
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, fin(100, 10));
    quitarConsumo(raiz);
    expect(sembrarConsumosPendientes(raiz)).toBe(1);
    expect(sembrarConsumosPendientes(raiz)).toBe(0);
    expect(listarSesiones(raiz)[0].consumo?.modelo).toEqual(cuenta(100, 10));
  });

  it("no pisa el acumulado que ya consta, aunque el `.jsonl` diga otra cosa", () => {
    // El del índice es el que escribió quien cerró el turno; el `.jsonl` podría estar
    // incompleto (una línea truncada por un crash). Gana el que consta, y no se recalcula.
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, fin(100, 10));
    anotarActo(raiz, id, fin(50, 5));
    expect(sembrarConsumosPendientes(raiz)).toBe(0);
    expect(listarSesiones(raiz)[0].consumo?.modelo).toEqual(cuenta(150, 15));
  });

  it("una sesión sin ningún `fin` con consumo se queda sin el campo: no se estampa un cero", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "hola" });
    expect(sembrarConsumosPendientes(raiz)).toBe(0);
    expect(listarSesiones(raiz)[0].consumo).toBeUndefined();
  });

  it("no da de alta la entrada que falte: un `.jsonl` suelto no resucita en la barra", () => {
    // Igual que `marcarTareaDeSesion`: un `.jsonl` sin entrada en el índice es una sesión
    // que alguien borró —o una a medio borrar—, y devolverla a la barra la dejaría apuntando
    // a un fichero que puede no estar.
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, fin(100, 10));
    writeFileSync(
      join(raiz, ".xonecode", "sesiones", "s-fantasma.jsonl"),
      JSON.stringify(fin(9999, 9999)) + "\n"
    );
    quitarConsumo(raiz);
    expect(sembrarConsumosPendientes(raiz)).toBe(1);
    expect(listarSesiones(raiz).map((e) => e.id)).toEqual([id]);
  });

  it("un `.jsonl` que no está se salta sin tumbar la siembra de los demás", () => {
    // El índice nombra sesiones cuyo fichero puede haberse ido por debajo (borrado a mano).
    const raiz = proyecto();
    const viva = crearSesion(raiz, "s-viva");
    anotarActo(raiz, viva, fin(100, 10));
    const perdida = crearSesion(raiz, "s-perdida");
    anotarActo(raiz, perdida, fin(7, 7));
    quitarConsumo(raiz);
    rmSync(join(raiz, ".xonecode", "sesiones", `${perdida}.jsonl`));
    expect(sembrarConsumosPendientes(raiz)).toBe(1);
    const porId = new Map(listarSesiones(raiz).map((e) => [e.id, e]));
    expect(porId.get(viva)?.consumo?.modelo).toEqual(cuenta(100, 10));
    expect(porId.get(perdida)?.consumo).toBeUndefined();
  });

  it("va de las MÁS RECIENTES hacia atrás: el tope de número se queda con lo último", () => {
    // El tope tiene que ELEGIR, y lo que se mira en la barra es lo último que se hizo. Se
    // fijan los `ultimoTurno` a mano y no con el reloj: `new Date()` con resolución de
    // milisegundo empata entre iteraciones de un bucle, y entonces el orden sería el de
    // inserción y el test diría otra cosa que la que cree.
    const raiz = proyecto();
    for (let i = 0; i < 14; i++) {
      const id = crearSesion(raiz, `s-${i}`);
      anotarActo(raiz, id, fin(i + 1, 0));
    }
    const indice = join(raiz, ".xonecode", "sesiones", "indice.json");
    const entradas = JSON.parse(readFileSync(indice, "utf8"));
    for (const e of entradas) {
      delete e.consumo;
      e.ultimoTurno = `2026-09-01T00:${String(59 - Number(String(e.id).slice(2))).padStart(2, "0")}:00.000Z`;
    }
    writeFileSync(indice, JSON.stringify(entradas));

    expect(sembrarConsumosPendientes(raiz)).toBe(SESIONES_A_SEMBRAR);
    // `s-0` es la más reciente; `s-12` y `s-13` las dos más viejas, y son las que se quedan
    // sin sembrar.
    const sinConsumo = listarSesiones(raiz)
      .filter((e) => e.consumo === undefined)
      .map((e) => e.id);
    expect(sinConsumo.sort()).toEqual(["s-12", "s-13"]);
  });

  it("un `.jsonl` por encima del tope de bytes no se lee, y no se estampa un parcial", () => {
    // La siembra es SÍNCRONA y corre en el bucle de eventos: sin este tope, un fichero
    // enorme congelaría el servidor mientras lo lee. Lo que se pierde es una cifra en la
    // barra hasta que esa sesión se use — y entonces la pondrá `anotarActo`, entera—, así
    // que no se estampa a medias ni se inventa nada: el campo se queda ausente.
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, fin(100, 10));
    appendFileSync(
      join(raiz, ".xonecode", "sesiones", `${id}.jsonl`),
      JSON.stringify({ tipo: "usuario", texto: "x".repeat(TOPE_DE_BYTES_DE_SIEMBRA) }) + "\n"
    );
    quitarConsumo(raiz);
    expect(sembrarConsumosPendientes(raiz)).toBe(0);
    expect(listarSesiones(raiz)[0].consumo).toBeUndefined();
  });

  it("con el índice roto no escribe nada, en vez de recuperarlo por su cuenta", () => {
    // La lectura que alimenta una escritura PARA ante un JSON roto (`leerIndiceOAbortar`):
    // recuperarlo aquí borraría del disco todas las sesiones que el índice todavía nombraba.
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, fin(100, 10));
    const indice = join(raiz, ".xonecode", "sesiones", "indice.json");
    writeFileSync(indice, "{roto");
    expect(() => sembrarConsumosPendientes(raiz)).toThrow(IndiceDeSesionesRoto);
    expect(readFileSync(indice, "utf8")).toBe("{roto");
  });
});

describe("borrar y renombrar una sesión", () => {
  it("borrar se lleva la entrada del índice Y el fichero", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "haz algo" });
    expect(existsSync(join(raiz, ".xonecode", "sesiones", `${id}.jsonl`))).toBe(true);

    expect(borrarSesion(raiz, id)).toBe(true);
    expect(listarSesiones(raiz).map((s) => s.id)).not.toContain(id);
    expect(existsSync(join(raiz, ".xonecode", "sesiones", `${id}.jsonl`))).toBe(false);
  });

  /**
   * Dos pestañas abiertas, o un doble clic en «Eliminar»: la segunda llamada no puede ser
   * un error. Lo único que hay que saber es si quedaba algo.
   */
  it("borrar un id desconocido no lanza: devuelve que no había nada", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "x" });
    expect(borrarSesion(raiz, id)).toBe(true);
    expect(borrarSesion(raiz, id)).toBe(false);
    expect(borrarSesion(raiz, "nunca-existio")).toBe(false);
  });

  it("borrar una sesión no toca a las demás", () => {
    const raiz = proyecto();
    const a = crearSesion(raiz);
    const b = crearSesion(raiz);
    anotarActo(raiz, a, { tipo: "usuario", texto: "la de A" });
    anotarActo(raiz, b, { tipo: "usuario", texto: "la de B" });
    borrarSesion(raiz, a);
    expect(listarSesiones(raiz).map((s) => s.titulo)).toEqual(["la de B"]);
    expect(reabrirSesion(raiz, b).actos).toHaveLength(1);
  });

  /**
   * LA regresión que importa: `anotarActo` fija el título en el primer acto de usuario y
   * solo mientras esté vacío. Un renombrado que no sobreviva al siguiente turno es peor que
   * no poder renombrar, porque el nombre se pierde sin decir nada.
   */
  it("el nombre puesto a mano SOBREVIVE a los turnos siguientes", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "arregla el login" });
    expect(listarSesiones(raiz)[0]!.titulo).toBe("arregla el login");

    expect(renombrarSesion(raiz, id, "Login de la demo")).toBe(true);
    anotarActo(raiz, id, { tipo: "usuario", texto: "y ahora el registro" });
    anotarActo(raiz, id, { tipo: "asistente", texto: "hecho" });
    expect(listarSesiones(raiz)[0]!.titulo).toBe("Login de la demo");
  });

  /**
   * Un título vacío devolvería la sesión al régimen automático (`entrada.titulo === ""`), y
   * el siguiente turno la rebautizaría con la primera frase: el nombre que puso una persona
   * desaparecería sin que nadie lo dijera.
   */
  it("un título vacío o en blanco se rechaza, no se guarda", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "algo" });
    renombrarSesion(raiz, id, "Nombre bueno");
    expect(renombrarSesion(raiz, id, "   ")).toBe(false);
    expect(renombrarSesion(raiz, id, "")).toBe(false);
    expect(listarSesiones(raiz)[0]!.titulo).toBe("Nombre bueno");
  });

  it("renombrar una sesión que no existe dice que no, en vez de crearla", () => {
    const raiz = proyecto();
    crearSesion(raiz);
    expect(renombrarSesion(raiz, "nunca-existio", "Hola")).toBe(false);
    expect(listarSesiones(raiz)).toHaveLength(1);
  });
});

describe("tituloDesde: el título automático es la primera frase, entera", () => {
  it("una petición corta se queda tal cual", () => {
    expect(tituloDesde("añade una colección de clientes")).toBe("añade una colección de clientes");
  });

  it("se queda con la PRIMERA frase y suelta la puntuación final", () => {
    expect(tituloDesde("Arregla el login. Después revisa el menú y dime qué ves.")).toBe("Arregla el login");
    expect(tituloDesde("¿Cómo se hace una ventana en XOne? Explícalo con un ejemplo.")).toBe("Cómo se hace una ventana en XOne");
  });

  it("el caso medido: corta antes de los dos puntos y no deja una comilla a medias", () => {
    expect(tituloDesde("Escribe literalmente esta frase, sin cambiar nada: «en XOne se usa $http para peticiones»")).toBe(
      "Escribe literalmente esta frase, sin cambiar nada"
    );
  });

  it("una frase larga se corta en una palabra entera, con puntos suspensivos", () => {
    const t = tituloDesde("Necesito que revises todas las colecciones del proyecto buscando props sin el prefijo MAP_ que no estén en la tabla");
    expect(t.endsWith("…")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t).not.toMatch(/\s…$/);
    expect(t).toBe("Necesito que revises todas las colecciones del proyecto…");
  });

  it("solo la primera línea, sin la comilla de apertura", () => {
    expect(tituloDesde("«hola»\notra línea")).toBe("hola»");
  });
});

describe("el dispositivo preferido de una sesión", () => {
  const GALAXY = { id: "R58", nombre: "Galaxy S21", plataforma: "android" as const, clase: "fisico" as const };

  it("se guarda con la sesión y vuelve al reabrirla", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ses-"));
    const id = crearSesion(raiz);
    expect(elegirDispositivo(raiz, id, GALAXY)).toBe(true);
    expect(listarSesiones(raiz)[0]!.dispositivo).toEqual(GALAXY);
    // Reabrir lo devuelve: es un dato de la SESIÓN, no uno de sus actos, así que sale del
    // índice y no del `.jsonl`.
    expect(reabrirSesion(raiz, id).dispositivo).toEqual(GALAXY);
  });

  it("se guarda la FOTO y no solo el id: los ids no son estables", () => {
    // `emulator-5554` es un puerto y un teléfono se desenchufa. Con solo el id, al reabrir
    // la pastilla enseñaría un serial crudo en vez de «Galaxy S21 · no está ahora».
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ses-"));
    const id = crearSesion(raiz);
    elegirDispositivo(raiz, id, GALAXY);
    expect(Object.keys(listarSesiones(raiz)[0]!.dispositivo!).sort()).toEqual(["clase", "id", "nombre", "plataforma"]);
  });

  it("con `undefined` se quita, sin dejar el campo puesto a nada", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ses-"));
    const id = crearSesion(raiz);
    elegirDispositivo(raiz, id, GALAXY);
    elegirDispositivo(raiz, id, undefined);
    expect("dispositivo" in listarSesiones(raiz)[0]!).toBe(false);
  });

  it("una sesión que todavía no está en el índice se dice con `false`, no se inventa", () => {
    // El id nace al volcar el primer acto: elegir dispositivo antes no tiene entrada que
    // tocar, y crear una aquí la enseñaría en la barra como una sesión vacía.
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ses-"));
    expect(elegirDispositivo(raiz, "todavia-no", GALAXY)).toBe(false);
    expect(listarSesiones(raiz)).toEqual([]);
  });

  it("anotar un acto después NO borra el dispositivo elegido", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ses-"));
    const id = crearSesion(raiz);
    elegirDispositivo(raiz, id, GALAXY);
    anotarActo(raiz, id, { tipo: "usuario", texto: "hola" });
    expect(listarSesiones(raiz)[0]!.dispositivo).toEqual(GALAXY);
  });
});
