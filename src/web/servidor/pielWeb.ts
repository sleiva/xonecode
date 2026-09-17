/**
 * La piel web: la MISMA `Piel` de `core/turno.ts` que implementan stdio y la TUI, con el
 * transcript como destino en vez de stdout.
 *
 * Es casi la lógica del store de la TUI (`cli/tui/store.ts`) —tokens a colchón, fases en
 * cascada, tools agrupadas—, y eso es a propósito: lo que la TUI pinta es lo que la web
 * recibe, byte por byte del mismo evento. No hay un segundo formato ni un canal crudo.
 * No importa de `cli/tui/`: la frontera que `cli/tui/frontera.test.ts` vigila mantiene ink
 * y react DENTRO de `cli/tui/` —para que pipes y `npm test` corran sin TTY—, y nada de fuera
 * puede depender de ese directorio sin arriesgarse a arrastrarlos. Por eso la lógica
 * compartida —`Acto`, `conLineaDeTool`— vive en `core/actos.ts`, no en el store, y las dos
 * pieles la importan de ahí.
 *
 * Ningún acto lleva argumentos de tool NI diff: las líneas de `herramientas` llegan ya
 * resumidas por `agent/turno/resumenDeTool.ts` (lista blanca de ruta/patrón por nombre de tool,
 * nunca contenido), y `pausa` solo copia `origen` y `descripcion` del pendiente — el
 * `PendienteDeAprobacion` no trae más, y el diff en sí viaja únicamente en el mensaje de
 * aprobación (`transporte.ts`, clase `aprobacion`), nunca por este canal de actos.
 */
import type { Piel } from "../../core/turno.js";
import type { Acto } from "../../core/actos.js";
import { conLlamadaDeTool } from "../../core/actos.js";
import type { ConsumoDeTurno, ConsumoDeUnaCuenta, DetalleDeLinea } from "../../core/actos.js";
import type { Fase, PendienteDeAprobacion } from "../../core/events.js";

export interface PielWeb {
  piel: Piel;
  /** La lista de actos, para el transporte y para la persistencia. */
  actos: () => readonly Acto[];
  /**
   * Se llama con cada acto nuevo: es por donde el transporte lo emite. También se
   * llama cuando el último acto es un `herramientas` que se ACTUALIZA en vez de crecer
   * —el cierre de una racha sustituyendo su apertura, la misma regla de `conLineaDeTool`—:
   * sin ese aviso, un transporte que solo escuchara altas mostraría para siempre la línea
   * de apertura de la racha. Un consumidor que reciba dos `herramientas` seguidos
   * sustituye el último por el nuevo; cualquier otro tipo se añade.
   */
  alActo: (escucha: (acto: Acto) => void) => void;
}

/**
 * Cada cuánto sale un parcial mientras el modelo escribe.
 *
 * No se emite por token porque cada emisión manda el acto ENTERO —así lo sustituye el
 * cliente—, o sea que N tokens costarían N mensajes de tamaño creciente: cuadrático en
 * bytes, y por un túnel eso se nota. No se emite tampoco solo al final, que es lo que hacía
 * y es peor: la respuesta aparecía de golpe después de segundos de nada.
 *
 * 80 ms es el orden de un cuadro de pantalla largo: por debajo de eso nadie distingue el
 * texto creciendo, y por encima se empieza a notar a tirones.
 */
const MS_ENTRE_PARCIALES = 80;

/**
 * `ahora - antes`, cuenta por cuenta. Los acumulados del tracker son monótonos mientras el
 * proceso vive —cada llamada al modelo suma—, así que la resta nunca baja de cero; si
 * bajara sería que la fuente cambió de escala, y un negativo pintado como gasto es peor que
 * un cero. Por eso se acota, no se confía.
 */
function restar(ahora: ConsumoDeUnaCuenta, antes: ConsumoDeUnaCuenta): ConsumoDeUnaCuenta {
  const d = (a: number, b: number): number => Math.max(0, a - b);
  return {
    entrada: d(ahora.entrada, antes.entrada),
    salida: d(ahora.salida, antes.salida),
    cache: d(ahora.cache, antes.cache),
  };
}

export function crearPielWeb(
  ahora: () => number = Date.now,
  /**
   * Lo consumido ACUMULADO por la sesión, si consta. Es el mismo cierre que la consola ya
   * tiene (`ConsolaDeProyecto.consumo`, que pregunta a la sesión real), y entra aquí para
   * que el `fin` pueda llevar el DELTA del turno sin que `core/turno.ts` sepa nada de
   * consumo: la piel lo consulta al cerrar, no el motor al llamarla.
   *
   * Va inyectado y no leído de un cierre propio porque la sesión real llega TARDE —nace
   * dentro del primer turno—, así que lo que se guarda es la PREGUNTA, no la respuesta.
   *
   * Ausente = esta piel no persiste consumo, y entonces el `fin` sale sin `consumo`, que es
   * «no consta». Las otras dos pieles ni lo reciben: por eso `Piel.fin(ms)` no cambia de
   * firma y stdio y la TUI siguen byte-idénticas.
   */
  consumoAcumulado?: () => ConsumoDeTurno | undefined
): PielWeb {
  const lista: Acto[] = [];
  let colchon = "";
  let faseActiva: { texto: string; t0: number; fase?: Fase } | undefined;
  /** Hay un acto de asistente A MEDIAS al final de la lista, que los tokens siguientes
   *  sustituyen en vez de anexar. */
  let parcial = false;
  let ultimoParcial = 0;
  /** Lo mismo para el razonamiento, que es otro acto y por tanto otro colchón: mezclarlos
   *  pondría lo que el modelo piensa dentro de lo que dice. */
  let pensamiento = "";
  let parcialPensado = false;
  let ultimoPensado = 0;
  const escuchas: ((acto: Acto) => void)[] = [];
  /**
   * El acumulado en el ÚLTIMO `fin` estampado, para restarle el de ahora y quedarnos con el
   * delta. Empieza en ceros porque el tracker de la sesión también: son la misma escala
   * mientras el proceso viva, y por eso la resta da el gasto del turno.
   */
  let estampado: ConsumoDeTurno | undefined;

  const notificar = (acto: Acto): void => {
    for (const escucha of escuchas) escucha(acto);
  };

  const empujar = (acto: Acto): void => {
    // Cualquier acto NUEVO cierra los parciales: lo que venga detrás ya no los sustituye.
    parcial = false;
    parcialPensado = false;
    // Y el razonamiento se cierra con el acto que venga: el siguiente bloque de
    // pensamiento, si lo hay, es otro y empieza el suyo.
    pensamiento = "";
    lista.push(acto);
    notificar(acto);
  };

  /**
   * Sustituye el último acto en vez de anexar. El transporte lo distingue por la LONGITUD
   * de la lista (`consolaWeb.ts`): si no creció, manda `sustitucion` y el cliente reemplaza
   * el último — el mismo camino que ya usaba el cierre de una racha de tools.
   */
  const sustituir = (acto: Acto): void => {
    lista[lista.length - 1] = acto;
    notificar(acto);
  };

  /**
   * Cualquier acto que no sea otra `fase` cierra la fase viva con su duración —la
   * cascada del store (`cli/tui/store.ts#cerrarFase`), reproducida aquí porque la web
   * no puede importar de `cli/tui/`. `fase` en sí NO pasa por aquí: dos `fase()`
   * seguidas sustituyen la activa sin dejar rastro de la anterior, igual que el store.
   */
  const cerrarFase = (): void => {
    if (faseActiva === undefined) return;
    const { texto, fase, t0 } = faseActiva;
    faseActiva = undefined;
    // `fase` es la CATEGORÍA (`core/events.ts#Fase`), aparte del texto en español. Va
    // suelta y no deducida del texto porque el texto es prosa para leer —vive en
    // `TEXTO_DE_FASE`, y reescribirlo es cosa de una tarde— y un filtro que dependiera de
    // esa prosa se rompería sin que nada avisara.
    empujar({
      tipo: "fase",
      texto,
      ms: Math.max(0, Date.now() - t0),
      ...(fase === undefined ? {} : { fase }),
    });
  };

  /**
   * Lo que hay que estampar en el `fin`: el DELTA de este turno, o nada.
   *
   * La resta es contra el último acumulado estampado, y por eso `estampado` empieza
   * `undefined` y no en ceros: sin lector no hay nada que estampar, y una vez hay lector el
   * primer delta es el acumulado entero —que es lo correcto, porque hasta ahí no había
   * ningún `fin` en este proceso al que restarle—.
   *
   * Un turno que no gastó nada no estampa: `{0,0,0}` ocuparía sitio en el `.jsonl` y
   * afirmaría una medida que nadie hizo. Ausente ya significa «no consta», y quien lea
   * tiene que poder distinguirlo (es lo que hace `consumoDeLosActos`).
   */
  const deltaDelTurno = (): { consumo?: ConsumoDeTurno } => {
    const ahora = consumoAcumulado?.();
    if (ahora === undefined) return {};
    const antes = estampado;
    estampado = ahora;
    // Sin `antes` el delta es el acumulado ENTERO, no una resta contra ceros: hasta aquí no
    // había ningún `fin` en este proceso, así que todo lo acumulado es de este turno.
    const delta: ConsumoDeTurno =
      antes === undefined
        ? ahora
        : {
            modelo: restar(ahora.modelo, antes.modelo),
            externo: restar(ahora.externo, antes.externo),
            ...(ahora.ventana === undefined ? {} : { ventana: ahora.ventana }),
          };
    const gastado =
      delta.modelo.entrada + delta.modelo.salida + delta.externo.entrada + delta.externo.salida > 0;
    return gastado ? { consumo: delta } : {};
  };

  const piel: Piel = {
    token(texto) {
      // A DIFERENCIA del store de la TUI (`cli/tui/store.ts:74-87`), aquí NO se parte por
      // `\n`: la TUI pinta líneas en un terminal y necesita una por fila, pero la web
      // renderiza markdown, donde un párrafo entero —con sus saltos internos, sus listas
      // y sus bloques de código— tiene que llegar de una pieza para que se pueda parsear.
      // Partirlo daría un acto por línea y el markdown se rompería en trozos sueltos.
      colchon += texto;

      // Y se ENSEÑA mientras llega. Antes el colchón se guardaba entero y no salía hasta
      // `cerrarLinea`, así que la respuesta aparecía de golpe tras segundos de pantalla
      // quieta — el modelo estaba escribiendo y no se veía.
      if (!parcial) {
        cerrarFase();
        empujar({ tipo: "asistente", texto: colchon });
        parcial = true;
        ultimoParcial = ahora();
        return;
      }
      const t = ahora();
      if (t - ultimoParcial < MS_ENTRE_PARCIALES) return;
      ultimoParcial = t;
      sustituir({ tipo: "asistente", texto: colchon });
    },

    razonamiento(texto) {
      // Mismo trato que los tokens de la respuesta —parcial que se sustituye, con su
      // ventana de 80 ms— pero en su propio acto: lo que el modelo PIENSA no es lo que
      // dice, y el transcript tiene que poder distinguirlo.
      if (!parcialPensado) {
        cerrarFase();
        // El orden importa: `empujar` limpia los colchones (cualquier acto nuevo cierra lo
        // que hubiera a medias), así que el bloque nuevo se asigna DESPUÉS. Al revés se
        // perdía el primer trozo y el pensamiento empezaba a contar desde el segundo.
        empujar({ tipo: "razonamiento", texto });
        pensamiento = texto;
        parcialPensado = true;
        ultimoPensado = ahora();
        return;
      }
      pensamiento += texto;
      const t = ahora();
      if (t - ultimoPensado < MS_ENTRE_PARCIALES) return;
      ultimoPensado = t;
      sustituir({ tipo: "razonamiento", texto: pensamiento });
    },

    cerrarLinea() {
      if (colchon === "") {
        // Sin texto no hay nada que cerrar, pero sí que olvidar: un parcial abierto que no
        // se marcara cerrado haría que el siguiente mensaje del modelo SUSTITUYERA a éste
        // en vez de ir detrás.
        parcial = false;
        return;
      }
      // El último trozo entra siempre, aunque no hayan pasado los 80 ms: es el que completa
      // la frase, y perderlo por el reloj dejaría el mensaje cortado en pantalla hasta el
      // siguiente turno.
      if (parcial) sustituir({ tipo: "asistente", texto: colchon });
      else {
        cerrarFase();
        empujar({ tipo: "asistente", texto: colchon });
      }
      parcial = false;
      colchon = "";
      // El razonamiento que hubiera quedado a medias se da por cerrado aquí: la respuesta
      // ya empezó, así que lo pensado antes no va a crecer más.
      parcialPensado = false;
      pensamiento = "";
    },

    linea(texto, detalle: DetalleDeLinea = {}) {
      // La comprobación de fusión va ANTES de cerrar la fase, no después: con una fase
      // viva el grupo no se completa (el acto de fase se intercala primero), igual que
      // en el store — si no, una racha que arranca justo tras `fase()` se fusionaría con
      // el grupo de ANTES de la fase, borrando la frontera que el usuario vio pasar.
      //
      // `detalle` dice de qué tool es la línea, y VACÍO cuando no es de ninguna: por este
      // mismo canal pasan el plan, las tareas y la verificación (`core/turno.ts` las
      // escribe con el mismo `escribirLinea`). Se guarda igual, con el objeto vacío, para
      // que la lista corra en paralelo a la de líneas sin huecos — un array con agujeros y
      // otro sin ellos es cómo se desalinean.
      const ultimo = lista.at(-1);
      if (ultimo?.tipo === "herramientas" && faseActiva === undefined) {
        sustituir({ tipo: "herramientas", ...conLlamadaDeTool(ultimo, texto, detalle) });
        return;
      }
      cerrarFase();
      empujar({ tipo: "herramientas", lineas: [texto], detalles: [detalle] });
    },

    artefacto(a) {
      // Acto PROPIO y no una línea más del grupo de herramientas: es lo único del turno que
      // se escribió sin pasar por la aprobación humana, y desde aquí se abre el fichero.
      // Cierra la fase como cualquier otro acto de conversación.
      cerrarFase();
      empujar({
        tipo: "artefacto",
        ruta: a.ruta,
        nombre: a.nombre,
        bytes: a.bytes,
        ...(a.mime === undefined ? {} : { mime: a.mime }),
      });
    },

    pausa(pendientes: PendienteDeAprobacion[]) {
      cerrarFase();
      // Una línea por pendiente, origen y descripción y NADA más: ni el fichero, ni el
      // diff — eso viaja solo en el mensaje de aprobación (`transporte.ts`).
      const texto = pendientes.map((p) => `${p.origen}: ${p.descripcion}`).join("\n");
      empujar({ tipo: "sistema", texto });
    },

    fin(ms) {
      cerrarFase();
      empujar({ tipo: "fin", ms, ...deltaDelTurno() });
    },

    fase(texto, fase) {
      // Sustituye la activa sin emitir acto por ella: igual que el store, dos `fase()`
      // seguidas sin nada de por medio pierden la duración de la primera a propósito —
      // es una fase que no llegó a contar nada.
      faseActiva = { texto, t0: Date.now(), ...(fase === undefined ? {} : { fase }) };
    },

    notificacion(texto) {
      cerrarFase();
      empujar({ tipo: "sistema", texto });
    },
  };

  return {
    piel,
    actos: () => lista,
    alActo: (escucha) => {
      escuchas.push(escucha);
    },
  };
}
