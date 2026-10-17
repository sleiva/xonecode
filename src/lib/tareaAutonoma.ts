/**
 * UNA tarea autónoma de punta a punta, sin cola, sin vestíbulo y sin web.
 *
 * Es lo que el corredor (`web/servidor/corredorDeTareas.ts`) hace con cada tarea, compuesto con
 * las MISMAS piezas: el ejecutor real (`crearEjecutorReal`), la consola de tarea
 * (`crearConsolaDeTarea`: escribe sin preguntar y resuelve sus dudas sola), el commit sellado
 * del turno (`commitDeTurno`), y las funciones PURAS de la entrega (`core/entrega.ts`), que son
 * las que cambian a menudo y aquí no se copian. Lo que sí se repite es el pegamento de
 * `puertaDeEntrega` del corredor —el juez con plazo y el motivo de su fallo—, porque allí es un
 * cierre privado y el corredor no se toca. **Si cambias `puertaDeEntrega`, mira si esto tiene
 * que cambiar igual.**
 *
 * Quien lo usa hoy es xonecode-copilot, a través de `xonecode/lib`. El corredor NO lo usa.
 */
import { randomUUID } from "node:crypto";
import { crearEjecutorReal } from "../cli/main.js";
import { crearPielStdio, type Escribir } from "../cli/stdio.js";
import { crearTema } from "../cli/tema.js";
import type { EjecutorDeTurno } from "../cli/consola.js";
import { crearConsolaDeTarea, ErrorDeTareaSinHumano } from "../web/servidor/consolaDeTarea.js";
import { revisionConGit, TOPE_DEL_JUEZ_MS } from "../web/servidor/corredorDeTareas.js";
import { rutaRelativaDeTarea, TOPE_DE_RONDAS_DE_TAREA } from "../core/tareas.js";
import {
  cierreDeLaEntrega,
  condicionesDeEntrega,
  decisionDeEntrega,
  medidaDeEntrega,
  motivoDePreguntaPendiente,
  type CierreDeTarea,
  type Entrega,
  type ResultadoDeTurno,
  type VeredictoDeTarea,
} from "../core/entrega.js";
import { comentarioDeCierre } from "../core/gestorDeTareas.js";
import type { FuentesDeEleccion } from "../core/modelos.js";
import type { MotorDeAgente } from "../core/motor.js";
import type { JuezDeTareaPort } from "../core/ports.js";
import type { Piel } from "../core/turno.js";
import type { SesionReal } from "../agent/turno/sesionReal.js";
import { cambiosDeSesion, commitsDeSesion, marcarSesion } from "../agent/sesiones/sesionGit.js";
import { commitDeTurno } from "../agent/sesiones/gitSync.js";
import { crearJuezDeTarea, ErrorDelJuezDeTarea, invocarConModelos } from "../agent/tareas/juezDeTarea.js";
import { Modelos } from "../agent/config/modelos.js";

export interface OpcionesDeTareaAutonoma {
  raiz: string;
  encargo: string;
  /** Los modelos por papel, como objetos: nada se lee de `~/.xonecode/config.json`. */
  fuentes: FuentesDeEleccion;
  motor?: MotorDeAgente;
  /** Omisión: `TOPE_DE_RONDAS_DE_TAREA`, el mismo de una tarea de la web. */
  topeDeRondas?: number;
  /** Omisión: `TOPE_DEL_JUEZ_MS`, el mismo del corredor. */
  topeDelJuezMs?: number;
  /** Por dónde sale el recorrido del turno (texto). Omisión: a ningún sitio. */
  informar?: Escribir;
  /** Costuras de test. Omisión: el ejecutor real y el juez real con el papel `afilado`. */
  ejecutor?: EjecutorDeTurno;
  juez?: JuezDeTareaPort;
}

export interface ResultadoDeTareaAutonoma {
  sesion: string;
  resultado?: ResultadoDeTurno;
  entrega: Entrega;
  veredicto?: VeredictoDeTarea;
  cierre: CierreDeTarea;
  /** Markdown con `## CRITICAL` / `## Observaciones`, el mismo que va al ticket en la web. */
  comentario: string;
  /** Lo último que dijo el agente, si dijo algo. */
  resumen?: string;
  /** Rutas autorizadas sin aprobación (relativas, sin repetidos). */
  autorizadas: string[];
}

/**
 * La piel del turno que, además de pintar, se queda con lo ÚLTIMO que dijo el agente: la
 * última tanda de `token` seguidos. Es lo que la web saca del último acto `asistente`; aquí no
 * hay actos.
 *
 * Una `linea` (una tool, un aviso) NO borra lo dicho: solo hace que el siguiente `token` empiece
 * una tanda nueva. Si la borrara, las líneas que llegan DESPUÉS de la respuesta final —la del
 * verificador, el juez del turno, una reparación— dejarían el resumen vacío justo cuando el turno
 * acabó bien.
 *
 * El tema va SIN color a propósito: quien llama puede tener un TTY, y el de omisión instalaría el
 * panel que se repinta con escapes ANSI dentro de un texto que es para leer o para guardar.
 */
function pielQueRecuerda(escribir: Escribir): { piel: Piel; ultimo: () => string | undefined } {
  const base = crearPielStdio(escribir, crearTema(false));
  let actual = "";
  let tandaCerrada = true;
  const piel: Piel = {
    ...base,
    token: (texto) => {
      if (tandaCerrada) {
        actual = "";
        tandaCerrada = false;
      }
      actual += texto;
      base.token(texto);
    },
    linea: (texto, detalle) => {
      tandaCerrada = true;
      base.linea(texto, detalle);
    },
  };
  return { piel, ultimo: () => (actual.trim() === "" ? undefined : actual.trim()) };
}

/**
 * El motivo de un juez que REVENTÓ, con la regla del corredor (`puertaDeEntrega#motivoDelJuez`):
 * un `ErrorDelJuezDeTarea` ya dice qué pasó y se usa tal cual; cualquier otra cosa se nombra
 * desde aquí, con el `code` si es un error de Node (su mensaje lleva rutas de la máquina) o la
 * primera línea del mensaje si es nuestro.
 */
function motivoDelJuez(error: unknown): string {
  return error instanceof ErrorDelJuezDeTarea
    ? unaLinea(error)
    : `no se pudo consultar al juez de QA (${sinRutas(error)})`;
}

function unaLinea(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : String(error);
  return mensaje.split(/\r?\n/)[0]!.slice(0, 160);
}

function sinRutas(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : error instanceof Error ? error.name : "error";
  }
  return unaLinea(error);
}

/** Espera la promesa como mucho `ms`. Limpia el temporizador: si no, el proceso de quien llama
 *  no podría salir hasta que venciera el plazo, aunque el juez hubiera contestado ya. */
async function conPlazo(promesa: Promise<unknown>, ms: number): Promise<boolean> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const plazo = new Promise<false>((resuelto) => {
    temporizador = setTimeout(() => resuelto(false), ms);
  });
  try {
    return await Promise.race([promesa.then(() => true), plazo]);
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
  }
}

/** El asunto del commit, como el del vestíbulo (`xonecode: <título> [tarea …]`): aquí no hay
 *  índice de sesiones del que sacar un título, así que sale de la primera línea del encargo. */
function mensajeDeCommit(encargo: string): string {
  const titulo = (encargo.split("\n")[0] ?? "").trim().slice(0, 72);
  return `xonecode: ${titulo === "" ? "tarea sin título" : titulo} [tarea autónoma]`;
}

export async function ejecutarTareaAutonoma(opciones: OpcionesDeTareaAutonoma): Promise<ResultadoDeTareaAutonoma> {
  const { raiz, encargo } = opciones;
  const escribir: Escribir = opciones.informar ?? (() => {});
  const sesion = randomUUID();
  // La foto del ANTES, ahora: es lo que permite decir después qué cambió esta sesión aunque el
  // commit no se pudiera sellar (`desde-apertura`).
  await marcarSesion(raiz, sesion);

  let aparcada: string | undefined;
  /**
   * Lo autorizado, normalizado por la MISMA regla que el corredor guarda en la tarea
   * (`conAutorizadas` → `rutaRelativaDeTarea`): relativas, sin repetidos y sin huecos. De esta
   * lista sale la cuenta que mide «autorizó y no aterrizó nada» y lo que ve el juez, así que
   * tiene que ser la misma que en la web.
   */
  const autorizadas: string[] = [];
  const anotar = (ficheros: readonly string[]): void => {
    for (const cruda of ficheros) {
      const ruta = rutaRelativaDeTarea(cruda).trim();
      if (ruta !== "" && !autorizadas.includes(ruta)) autorizadas.push(ruta);
    }
  };
  const { piel, ultimo } = pielQueRecuerda(escribir);
  const consola = {
    ...crearConsolaDeTarea({
      aparcar: (motivo) => void (aparcada ??= motivo),
      autorizado: anotar,
      escribir,
      piel: () => piel,
      // Una tarea no elige modelos: estos dos solo los usan los comandos de barra.
      catalogoModelos: { listar: async () => [] },
      guardarModeloGlobal: () => ({ ruta: "", id: "" }),
    }),
    topeDeAprobaciones: opciones.topeDeRondas ?? TOPE_DE_RONDAS_DE_TAREA,
  };
  // La sesión real se guarda para CERRARLA al acabar: quien llama es un proceso que sigue vivo
  // después de la tarea, y una llamada al modelo colgada no tiene por qué sobrevivirle.
  let sesionAbierta: SesionReal | undefined;
  const ejecutor = opciones.ejecutor ?? crearEjecutorReal((s) => void (sesionAbierta = s));

  let resultado: ResultadoDeTurno | undefined;
  try {
    resultado =
      (await ejecutor(
        encargo,
        { hilo: sesion, raiz, fuentes: opciones.fuentes, ...(opciones.motor === undefined ? {} : { motor: opciones.motor }) },
        consola
      )) ?? undefined;
  } catch (error) {
    // Pedir a una persona es la forma de aparcar de esta consola (ver `ErrorDeTareaSinHumano`):
    // se convierte en motivo. Cualquier otro error SÍ sale, pero después del `finally`.
    if (!(error instanceof ErrorDeTareaSinHumano)) throw error;
    aparcada ??= error.message;
  } finally {
    sesionAbierta?.cerrar();
    /**
     * El commit SIEMPRE, como en el `finally` del turno del vestíbulo: también si se aparcó o si
     * el turno reventó. Lo escrito está en el disco, y sin commit el árbol queda sucio y nada se
     * puede atribuir a esta sesión. Se ESPERA: la entrega le pregunta a git justo después.
     */
    try {
      const hecho = await commitDeTurno(raiz, mensajeDeCommit(encargo), sesion);
      // El motivo de git no se repite: puede llevar rutas de la máquina.
      if (hecho.via === "fallo") escribir("\naviso: no se pudo commitear el turno de la tarea\n");
    } catch {
      escribir("\naviso: no se pudo commitear el turno de la tarea\n");
    }
  }

  let entrega: Entrega;
  let veredicto: VeredictoDeTarea | undefined;
  if (resultado?.preguntaPendiente !== undefined) {
    // Un turno que acaba esperando una respuesta no ha terminado nada: sin juez (core/entrega.ts).
    entrega = { entregable: false, motivo: motivoDePreguntaPendiente(resultado.preguntaPendiente) };
  } else if (aparcada !== undefined || resultado === undefined) {
    entrega = { entregable: false, motivo: aparcada ?? "el turno no devolvió resultado" };
  } else {
    // A partir de aquí, `puertaDeEntrega` del corredor: medir, comprobar por código, y solo
    // entonces preguntar al juez, con plazo.
    const revision = await revisionConGit(cambiosDeSesion)(raiz, sesion).catch(() => ({ revisable: false }));
    const medida = medidaDeEntrega(resultado, revision, autorizadas.length);
    const condiciones = condicionesDeEntrega(medida);
    if (!condiciones.entregable) {
      entrega = condiciones;
    } else {
      const juez = opciones.juez ?? crearJuezDeTarea({ invocar: invocarConModelos(new Modelos(opciones.fuentes)) });
      const tope = opciones.topeDelJuezMs ?? TOPE_DEL_JUEZ_MS;
      // La respuesta va a una variable PROPIA y solo pasa a `veredicto` si llegó a tiempo: una
      // respuesta tardía, que sigue viva en segundo plano, no puede contradecir al motivo.
      let respuesta: VeredictoDeTarea | undefined;
      let fallo: unknown;
      let reventó = false;
      const consulta = juez
        .juzgar({
          encargo,
          raiz,
          autorizadas,
          verificador: medida.verificador,
          ...(medida.hallazgos === undefined ? {} : { hallazgos: medida.hallazgos }),
          ...(medida.preexistentes === undefined ? {} : { preexistentes: medida.preexistentes }),
          ...(medida.cambiados === undefined ? {} : { cambiados: medida.cambiados }),
          ...(medida.comprobacionesVisuales === undefined ? {} : { comprobacionesVisuales: medida.comprobacionesVisuales }),
        })
        .then((v) => void (respuesta = v))
        .catch((error: unknown) => {
          reventó = true;
          fallo = error;
        });
      if (!(await conPlazo(consulta, tope))) {
        // La consulta se abandona: no hay con qué abortarla desde aquí.
        entrega = { entregable: false, motivo: `el juez de QA no contestó en ${Math.round(tope / 1000)} s` };
      } else if (reventó) {
        entrega = { entregable: false, motivo: motivoDelJuez(fallo) };
      } else {
        veredicto = respuesta;
        entrega = decisionDeEntrega(medida, veredicto);
      }
    }
  }

  const cierre = cierreDeLaEntrega(entrega, veredicto);
  const [cambios, commits] = await Promise.all([
    cambiosDeSesion(raiz, sesion).catch(() => ({ via: "sin-marca" as const, ficheros: [] })),
    commitsDeSesion(raiz, sesion).catch(() => [] as string[]),
  ]);
  const errores = (resultado?.hallazgos ?? []).filter((h) => h.severidad === "error").length;
  const avisos = (resultado?.hallazgos ?? []).length - errores;
  const resumen = ultimo();
  const comentario = comentarioDeCierre({
    ficheros: cambios.ficheros.map((f) => ({ ruta: f.ruta, clase: f.clase })),
    commits,
    atribucion: cambios.via,
    // «no corrió» no es verde: sin veredicto, `comentarioDeCierre` lo dice así.
    ...(resultado === undefined || resultado.verificador === "no-corrio"
      ? {}
      : { veredicto: { verde: resultado.verificador === "verde", errores, avisos } }),
    ...(resumen === undefined ? {} : { resumen }),
    criticos: cierre.criticos,
    observaciones: cierre.observaciones,
  });

  return {
    sesion,
    ...(resultado === undefined ? {} : { resultado }),
    entrega,
    ...(veredicto === undefined ? {} : { veredicto }),
    cierre,
    comentario,
    ...(resumen === undefined ? {} : { resumen }),
    autorizadas,
  };
}
