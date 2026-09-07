import { Bitacora } from "./bitacora.js";
import { Colapsador } from "./notify.js";
import type { Artefacto, DomainEvent, Fase, PendienteDeAprobacion } from "./events.js";
import type { DetalleDeLinea } from "./actos.js";

/**
 * Lo que hace falta para pintar un turno. La implementan el renderizador de stdio y la TUI.
 *
 * `cerrarLinea` existe porque los tokens se escriben SIN salto —son la misma frase
 * creciendo— y cualquier otra cosa que se pinte tiene que empezar en su propia línea. El
 * motor lleva la cuenta de si hay una línea abierta; la piel decide qué significa cerrarla
 * (en stdio es un `\n`, en la TUI es cerrar la burbuja del mensaje).
 */
export interface Piel {
  token(texto: string): void;
  cerrarLinea(): void;
  /**
   * El razonamiento del modelo, en trozos, como `token`. OPCIONAL: la piel que no lo
   * implemente no lo verá, y la salida de stdio sigue siendo la de siempre —byte-idéntica
   * por una tubería, que es lo que sostiene el e2e—. Hoy solo la web lo pinta.
   */
  razonamiento?(texto: string): void;
  /**
   * Cualquier cosa que no sea un token. El segundo parámetro es OPCIONAL y solo lo manda el
   * motor cuando la línea viene de una tool: dice cuál y si falló. Una piel que implemente
   * `linea(texto)` con un solo parámetro lo ignora sin enterarse —así stdio y la TUI no
   * cambian y la salida por una tubería sigue siendo byte-idéntica—, y la que quiera
   * distinguir una lectura de una escritura ya no tiene que re-parsear la prosa de la línea.
   *
   * Sin detalle la línea NO es de una tool: por aquí pasan también el plan, las tareas y la
   * verificación. Marcarlas como herramienta sería etiquetar mal un paso del motor.
   */
  linea(texto: string, detalle?: DetalleDeLinea): void;
  pausa(pendientes: PendienteDeAprobacion[]): void;
  fin(ms: number): void;
  /**
   * Si la piel sabe animar fases (el spinner del terminal), el motor le delega la fase
   * y le dicta SOLO el texto — la decoración es cosa de la piel. Sin este método, la
   * fase es una línea estática más.
   */
  fase?(texto: string, fase?: Fase): void;
  /**
   * Si la piel sabe reciclar avisos de sistema (el panel de notificaciones del
   * terminal), el motor le delega los `aviso` — con la línea de tokens cerrada, como
   * cualquier otra cosa que empieza su propia línea. Sin este método, el aviso es una
   * línea estática más.
   */
  notificacion?(texto: string): void;
  /**
   * Si la piel sabe enseñar un artefacto —un diagrama, un panel—, el motor le da el dato
   * entero en vez de solo la línea. OPCIONAL, como `razonamiento` y `fase`: la piel que no
   * lo implemente se queda con la línea de siempre, así que stdio y la TUI no cambian y la
   * salida por una tubería sigue siendo byte-idéntica. Hoy solo la web lo implementa.
   *
   * La línea se escribe SIEMPRE, la implemente o no: el artefacto no pasa por aprobación,
   * así que la constancia de que se escribió no puede depender de qué piel esté delante.
   */
  artefacto?(artefacto: Artefacto): void;
}

/** Cómo se le cuenta cada fase al usuario. En un solo sitio, no repartido por el motor. */
const TEXTO_DE_FASE: Record<Fase, string> = {
  entendiendo: "entendiendo la petición",
  planificando: "planificando",
  "esperando-aprobacion": "esperando tu aprobación",
  ejecutando: "desarrollando",
  verificando: "verificando con el simulador",
  juzgando: "revisando el resultado",
  subiendo: "publicando",
  respondiendo: "redactando la respuesta",
};

export interface OpcionesDelTurno {
  /**
   * Los avisos deterministas del final, calculados a partir de la bitácora.
   *
   * Es una función y no una lista porque las condiciones se evalúan CUANDO el turno
   * termina, no cuando empieza: «¿ha corrido el verificador de pega en este turno?» solo
   * se puede contestar al final. Y son CÓDIGO y no prompt porque a un modelo al que le
   * pides que avise, a veces no avisa — y es justo el aviso que no puede faltar.
   */
  avisos?: (bitacora: Bitacora) => string[];
  /**
   * Si ESTA pasada cierra el turno: los avisos deterministas y `piel.fin()`.
   *
   * Existe porque un turno puede tener varias pasadas por `correrTurno` —una por ronda de
   * aprobación, una por intento de reparación— y solo la última es el final. Antes cada
   * pasada cerraba: stdio imprimía el tiempo una vez por ronda y el chat de la web plegaba
   * el tramo una vez por ronda, medido. Es una función y no un booleano porque quien lo
   * sabe es el flujo de eventos, y solo lo sabe al AGOTARSE — antes de eso no hay forma de
   * decir si detrás viene otra pasada. Por omisión cierra, que es lo seguro: una pasada que
   * revienta cierra igual, para que el tiempo y el aviso no se pierdan.
   */
  cerrar?: () => boolean;
  /**
   * Desde cuándo cuenta el tiempo del `fin`. Por omisión, desde que empezó ESTA pasada — que
   * es lo correcto cuando el turno es una sola. Con varias pasadas y una sola que cierra,
   * sin esto el `fin` diría solo lo que tardó la última: un turno de cuarenta segundos de
   * trabajo, una aprobación y cinco de reanudación saldría como «5.0s». Quien encadena
   * pasadas pasa aquí el `t0` del turno entero.
   */
  desde?: number;
}

/**
 * Un turno completo: consume los eventos, cuenta lo que hay que contar, devuelve la
 * bitácora.
 *
 * Nunca deja la línea de tokens abierta: el `finally` la cierra tanto si el turno termina
 * bien como si el flujo revienta a mitad. Sin eso, el mensaje de error se pegaría al final
 * de una respuesta a medio escribir.
 */
export async function correrTurno(
  eventos: AsyncIterable<DomainEvent>,
  piel: Piel,
  opciones: OpcionesDelTurno = {}
): Promise<Bitacora> {
  const bitacora = new Bitacora();
  const colapsador = new Colapsador();
  const t0 = Date.now();
  let abierta = false;
  let ultimoId: string | undefined;

  /** Cualquier cosa que no sea un token empieza su propia línea. */
  const escribirLinea = (texto: string, detalle?: DetalleDeLinea): void => {
    if (abierta) {
      piel.cerrarLinea();
      abierta = false;
    }
    if (detalle === undefined) piel.linea(texto);
    else piel.linea(texto, detalle);
  };

  try {
    for await (const ev of eventos) {
      switch (ev.tipo) {
        case "token":
          if (abierta && ev.msgId !== undefined && ev.msgId !== ultimoId) {
            piel.cerrarLinea();
            abierta = false;
          }
          ultimoId = ev.msgId;
          abierta = true;
          piel.token(ev.texto);
          break;

        case "razonamiento":
          // La piel que no lo implementa no se entera de que existe: ni cierra la línea de
          // tokens ni pinta nada, así que stdio y la TUI siguen dando lo mismo que antes.
          if (piel.razonamiento !== undefined) {
            // Cierra la línea de respuesta abierta, como cualquier otra cosa que empieza la
            // suya: el razonamiento no es continuación de la frase que se estaba diciendo.
            if (abierta) {
              piel.cerrarLinea();
              abierta = false;
            }
            piel.razonamiento(ev.texto);
          }
          break;

        case "fase": {
          bitacora.anota(ev.fase, ev.detalle ?? "");
          const texto = `${TEXTO_DE_FASE[ev.fase]}${ev.detalle ? ` — ${ev.detalle}` : ""}`;
          // La fase DURA: la piel que sabe animarla la recibe delegada (con la línea de
          // tokens cerrada, como cualquier otra cosa que empieza su propia línea); la
          // que no, la pinta como la línea estática de siempre.
          if (piel.fase) {
            if (abierta) {
              piel.cerrarLinea();
              abierta = false;
            }
            piel.fase(texto, ev.fase);
          } else {
            escribirLinea(`·  ${texto}`);
          }
          break;
        }

        case "tool":
          bitacora.anota("tool", ev.nombre);
          for (const l of colapsador.lineas({ nombre: ev.nombre, detalle: ev.detalle, error: ev.error })) {
            escribirLinea(l.texto, { nombre: l.nombre, ...(l.error === undefined ? {} : { error: l.error }) });
          }
          break;

        case "plan":
          bitacora.anota("plan", `${ev.tareas.length} tareas`);
          escribirLinea(`📋 plan de ${ev.tareas.length} tarea(s):`);
          ev.tareas.forEach((t, i) => escribirLinea(`   ${i + 1}. ${t.descripcion}`));
          break;

        case "tarea":
          bitacora.anota("tarea", `${ev.id} ${ev.estado}`);
          escribirLinea(`▶  tarea ${ev.indice}/${ev.total}: ${ev.id} — ${ev.estado}`);
          break;

        case "verificacion": {
          bitacora.anota("verify", ev.verde ? "verde" : `${ev.errores} errores`);
          escribirLinea(
            ev.verde
              ? "✓  verificación en verde"
              : `✗  verificación: ${ev.errores} error(es), ${ev.avisos} aviso(s)`
          );
          // Uno por línea, con dónde: el resumen solo dice cuántos, y cuántos no se
          // arregla. La marca va por severidad y no por color, que aquí no hay.
          for (const h of ev.hallazgos ?? []) {
            const marca = h.severidad === "error" ? "✗" : h.severidad === "warning" ? "△" : "·";
            const donde = h.fichero === undefined ? "" : ` ${h.fichero}${h.linea === undefined ? "" : `:${h.linea}`}`;
            escribirLinea(`   ${marca} ${h.code}${donde} — ${h.mensaje}`);
          }
          // Lo que ya estaba mal ANTES de este turno se dice aparte y sin detalle:
          // atribuírselo al agente sería falso, callarlo sería fingir un proyecto limpio.
          if (ev.preexistentes !== undefined && ev.preexistentes > 0) {
            escribirLinea(`   (y ${ev.preexistentes} hallazgo(s) más en ficheros que este turno no tocó)`);
          }
          break;
        }

        case "reparacion":
          bitacora.anota("reparacion", `${ev.intento}/${ev.tope}`);
          escribirLinea(`🔁 reparando (intento ${ev.intento} de ${ev.tope})`);
          break;

        case "artefacto": {
          // Se ANUNCIA porque no se aprueba. Un artefacto se escribe sin preguntar —no es
          // del proyecto—, así que la línea es lo único que evita que sea una escritura
          // muda. Lleva el tamaño porque un panel de 400 KB y un SVG de 2 KB no son la
          // misma noticia, y la ruta virtual porque es con la que se pide después.
          const { nombre, bytes, ruta } = ev.artefacto;
          bitacora.anota("artefacto", nombre);
          escribirLinea(`🖼  artefacto: ${nombre} (${Math.max(1, Math.round(bytes / 1024))} KB) · ${ruta}`);
          piel.artefacto?.(ev.artefacto);
          break;
        }

        case "bloqueado":
          bitacora.anota("bloqueado", ev.motivo);
          escribirLinea(`⛔ bloqueado (${ev.motivo}): ${ev.explicacion}`);
          break;

        case "pausa":
          if (abierta) {
            piel.cerrarLinea();
            abierta = false;
          }
          bitacora.anota("pausa", `${ev.pendientes.length} pendiente(s)`);
          piel.pausa(ev.pendientes);
          break;

        case "aviso":
          bitacora.anota("aviso", ev.texto);
          // La piel que recicla avisos recibe el aviso delegado (la línea de tokens
          // cerrada primero, para que el repintado del panel caiga en línea propia);
          // la que no, lo pinta como la línea estática de siempre.
          if (piel.notificacion) {
            if (abierta) {
              piel.cerrarLinea();
              abierta = false;
            }
            piel.notificacion(ev.texto);
          } else {
            escribirLinea(ev.texto);
          }
          break;

        case "fin":
          break;
      }
    }
  } finally {
    // La cuenta de la última racha de tools, aunque el turno reviente: si se cayó a
    // mitad, el «×17» es justo el dato que explica dónde se quedó.
    const cierre = colapsador.cierre();
    if (cierre) escribirLinea(cierre.texto, { nombre: cierre.nombre });

    // Una pasada intermedia —hay otra ronda o un intento de reparación detrás— NO cierra:
    // ni avisos ni `fin`. La línea abierta sí se cierra siempre, porque lo que venga
    // detrás empieza la suya.
    if (!(opciones.cerrar?.() ?? true)) {
      if (abierta) piel.cerrarLinea();
      return bitacora;
    }

    // Los avisos deterministas van DESPUÉS de todo, y también si hubo excepción.
    // Por el MISMO camino que los eventos `aviso`: la piel que recicla los recibe
    // delegados, la que no los pinta como líneas estáticas.
    for (const aviso of opciones.avisos?.(bitacora) ?? []) {
      if (piel.notificacion) {
        if (abierta) {
          piel.cerrarLinea();
          abierta = false;
        }
        piel.notificacion(aviso);
      } else {
        escribirLinea(aviso);
      }
    }

    if (abierta) piel.cerrarLinea();
    piel.fin(Date.now() - (opciones.desde ?? t0));
  }

  return bitacora;
}