import { Bitacora } from "./bitacora.js";
import { Colapsador } from "./notify.js";
import type { DomainEvent, Fase, PendienteDeAprobacion } from "./events.js";

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
  linea(texto: string): void;
  pausa(pendientes: PendienteDeAprobacion[]): void;
  fin(ms: number): void;
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
  const escribirLinea = (texto: string): void => {
    if (abierta) {
      piel.cerrarLinea();
      abierta = false;
    }
    piel.linea(texto);
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

        case "fase":
          bitacora.anota(ev.fase, ev.detalle ?? "");
          escribirLinea(`·  ${TEXTO_DE_FASE[ev.fase]}${ev.detalle ? ` — ${ev.detalle}` : ""}`);
          break;

        case "tool":
          bitacora.anota("tool", ev.nombre);
          for (const linea of colapsador.lineas({ nombre: ev.nombre, error: ev.error })) {
            escribirLinea(linea);
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

        case "verificacion":
          bitacora.anota("verify", ev.verde ? "verde" : `${ev.errores} errores`);
          escribirLinea(
            ev.verde
              ? "✓  verificación en verde"
              : `✗  verificación: ${ev.errores} error(es), ${ev.avisos} aviso(s)`
          );
          break;

        case "reparacion":
          bitacora.anota("reparacion", `${ev.intento}/${ev.tope}`);
          escribirLinea(`🔁 reparando (intento ${ev.intento} de ${ev.tope})`);
          break;

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
          escribirLinea(ev.texto);
          break;

        case "fin":
          break;
      }
    }
  } finally {
    // La cuenta de la última racha de tools, aunque el turno reviente: si se cayó a
    // mitad, el «×17» es justo el dato que explica dónde se quedó.
    const cierre = colapsador.cierre();
    if (cierre) escribirLinea(cierre);

    // Los avisos deterministas van DESPUÉS de todo, y también si hubo excepción.
    for (const aviso of opciones.avisos?.(bitacora) ?? []) escribirLinea(aviso);

    if (abierta) piel.cerrarLinea();
    piel.fin(Date.now() - t0);
  }

  return bitacora;
}