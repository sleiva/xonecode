/**
 * La `Consola` (`cli/consola.ts:38`) alimentada por el navegador: la MISMA que implementan
 * stdio y la TUI, con el SSE como salida y `POST /accion` como entrada. El lazo de
 * `correrConsola`, los comandos de barra y el motor de turno no se enteran de que hay una
 * web al otro lado — es una piel más.
 *
 * **La aprobación es fail-closed POR TRANSPORTE, y ese es el motivo de existir de este
 * fichero.** En la TUI el fail-closed es por TECLA (solo `s`/`S` aprueba; `n`, Enter,
 * Escape, Ctrl-C y desmontar sin responder son rechazo). Aquí las formas de fallar son
 * otras y son más: el SSE se cae, la pestaña se cierra, el plazo expira, llega una
 * decisión ilegible, llega una respuesta que solo cubre parte de los pendientes, o no
 * llega nunca nada. Ninguna de esas tiene rama propia: el mapa de decisiones **nace
 * rechazado entero** y una entrada solo se ASCIENDE con una aprobación explícita para ese
 * id. Así no existe camino que deje un pendiente sin rechazar — no hay que acordarse de
 * cubrirlos, porque el valor por omisión ya los cubre.
 *
 * Qué cuenta como aprobación lo decide `interpretAnswer` (`vendor/hitl.ts`), la misma
 * función que usa `cli/aprobar.ts`: dos criterios de «esto aprueba» divergen, y este es el
 * único sitio del producto donde divergir significa escribir ficheros que nadie autorizó.
 * El cliente habla en el alfabeto de `Decision["type"]` (lo que el pendiente declara en
 * `decisionesPermitidas`), no en el de una respuesta tecleada, así que el valor del cable
 * se TRADUCE a una respuesta antes de preguntarle: `"approve"` → `"s"`, y cualquier otra
 * cosa → cadena vacía, que es exactamente lo que devuelve un readline cerrado y lo que
 * `aprobar.ts` ya trata como rechazo. `interactive` no se pasa NUNCA: significa «hay un
 * TTY de verdad detrás», y aquí no lo hay jamás — con él, el Enter a secas aprobaría.
 */
import { crearPielWeb } from "./pielWeb.js";
import { crearTransporte, type MensajeAlCliente, type MensajeDelCliente, type Sumidero } from "./transporte.js";
import type { Acto } from "../../core/actos.js";
import type { PendienteDeAprobacion } from "../../core/events.js";
import type { LineaDeDiff } from "../../core/diff.js";
import type { Piel } from "../../core/turno.js";
import type { Consola, SelectorDeConsola } from "../../cli/consola.js";
import { CatalogoModelosEnMemoria, type CatalogoModelosPort, type Papel } from "../../core/ports.js";
import { interpretAnswer, REJECT_MESSAGE, type Decision } from "../../vendor/hitl.js";

/**
 * La respuesta afirmativa canónica que `interpretAnswer` acepta sin TTY
 * (`APPROVALS_NO_TTY`). Si alguien la sacara de ese conjunto, esto empezaría a rechazar
 * todo — que es la dirección segura de romperse.
 */
const RESPUESTA_AFIRMATIVA = "s";

/**
 * Plazo de una aprobación. Generoso porque al otro lado hay una persona leyendo un diff,
 * y corto comparado con «para siempre»: un turno que se queda esperando a una pestaña que
 * ya nadie mira bloquea la sesión entera. Vencer es RECHAZAR, y un rechazo se puede
 * volver a pedir; una aprobación por cansancio, no.
 */
const MS_DE_ESPERA_POR_OMISION = 10 * 60_000;

export interface OpcionesDeConsolaWeb {
  /** Inyectable para poder probar el vencimiento sin esperarlo de verdad. */
  msDeEspera?: number;
  catalogoModelos?: CatalogoModelosPort;
  guardarModeloGlobal?: Consola["guardarModeloGlobal"];
}

export interface ConsolaWeb {
  consola: Consola;
  /** Un mensaje del navegador, tal cual llega por `POST /accion`. */
  recibir(mensaje: MensajeDelCliente): void;
  /** El cliente abre el SSE; devuelve los actos con los que hay que reemitirle el transcript. */
  conectar(enviar?: Sumidero): readonly Acto[];
  desconectar(): void;
  /** Agota `lineas` (EOF) para que el lazo de `correrConsola` RETORNE, y corta el cliente. */
  cerrar(): void;
  actos(): readonly Acto[];
  eventosEmitidos(): readonly MensajeAlCliente[];
  /**
   * Las aprobaciones EN VUELO, y solo esas. Es el único sitio con contenido de fichero y
   * diff, y se suelta en cuanto hay decisión: pasado ese momento nada de lo que el humano
   * miró sigue en memoria, ni se persiste, ni se reemite al reconectar.
   */
  mensajesDeAprobacion(): readonly MensajeAlCliente[];
}

interface AprobacionEnVuelo {
  decisiones: Map<string, Decision>;
  pendientes: Map<string, PendienteDeAprobacion>;
  mensaje: MensajeAlCliente;
  terminar: () => void;
}

function comoRegistro<V>(mapa: Map<string, V>): Record<string, V> {
  return Object.fromEntries(mapa);
}

export function crearConsolaWeb(opciones: OpcionesDeConsolaWeb = {}): ConsolaWeb {
  const msDeEspera = opciones.msDeEspera ?? MS_DE_ESPERA_POR_OMISION;

  // El transcript FUSIONADO: lo que pinta la piel del turno y lo que escriben los
  // comandos de barra, en el orden en que ocurrió. La piel lleva su propia lista; aquí se
  // guarda dónde cayó su último acto para poder sustituirlo cuando se ACTUALIZA.
  const actos: Acto[] = [];
  const pielWeb = crearPielWeb();
  const transporte = crearTransporte(() => actos);

  let actosDePiel = 0;
  let indiceDelUltimoDePiel = -1;

  const anotar = (acto: Acto): void => {
    actos.push(acto);
    transporte.emitir({ clase: "acto", acto });
  };

  pielWeb.alActo((acto) => {
    // `alActo` avisa de altas Y de actualizaciones: el cierre de una racha de tools
    // sustituye a su apertura dentro del mismo acto. Distinguirlas por la LONGITUD de la
    // lista de la piel es lo que hace que el cliente no acabe con las dos líneas.
    const total = pielWeb.actos().length;
    if (total > actosDePiel || indiceDelUltimoDePiel < 0) {
      actosDePiel = total;
      indiceDelUltimoDePiel = actos.length;
      actos.push(acto);
      transporte.emitir({ clase: "acto", acto });
      return;
    }
    actos[indiceDelUltimoDePiel] = acto;
    if (indiceDelUltimoDePiel === actos.length - 1) {
      transporte.emitir({ clase: "sustitucion", acto });
      return;
    }
    // Un `escribir` se coló detrás del grupo: «sustituye el último» tocaría el acto
    // equivocado en el cliente, así que se le manda el transcript entero.
    transporte.emitir({ clase: "reemision", actos: [...actos] });
  });

  // La cola de `lineas`. Si nadie espera todavía, la línea aguarda en `cola`; si hay un
  // `next` colgado, se despierta. `cerrada` es EOF: agota el iterador en vez de colgarlo.
  const cola: string[] = [];
  const esperandoLinea: ((r: IteratorResult<string>) => void)[] = [];
  let cerrada = false;

  // Colas FIFO de quien espera respuesta. Son colas y no una ranura única porque dos
  // preguntas encadenadas (el alta de proyecto las hace) no pueden pisarse.
  const esperandoTexto: ((texto: string) => void)[] = [];
  const esperandoSecreto: ((texto: string) => void)[] = [];
  const esperandoSeleccion: ((id: string | undefined) => void)[] = [];

  let aprobacionEnVuelo: AprobacionEnVuelo | undefined;

  // Sin cliente, TODO el que espera responde lo que responde un readline cerrado: cadena
  // vacía (o `undefined`, que es cancelar el selector). Medido en el e2e de un pipe que se
  // agota a mitad de turno: `aprobar.ts` ya trata esa cadena vacía como rechazo.
  transporte.alDesconectar(() => {
    while (esperandoTexto.length > 0) esperandoTexto.shift()!("");
    while (esperandoSecreto.length > 0) esperandoSecreto.shift()!("");
    while (esperandoSeleccion.length > 0) esperandoSeleccion.shift()!(undefined);
    aprobacionEnVuelo?.terminar();
  });

  const consola: Consola = {
    interactivo: true,

    lineas: {
      [Symbol.asyncIterator]() {
        return {
          next: (): Promise<IteratorResult<string>> => {
            if (cola.length > 0) return Promise.resolve({ value: cola.shift()!, done: false });
            if (cerrada) return Promise.resolve({ value: undefined, done: true });
            return new Promise<IteratorResult<string>>((resuelto) => esperandoLinea.push(resuelto));
          },
        };
      },
    },

    escribir: (texto) => {
      // El guard cubre whitespace, no solo la cadena vacía: un `escribir("\n")` (la forma
      // de «línea sin contenido») partía en un acto sistema vacío — medido en la TUI.
      if (texto.trim() === "") return;
      // Un chunk puede traer varias líneas (los comandos escriben bloques): cada una es un
      // acto, como lo sería en el scrollback de stdio.
      for (const linea of texto.replace(/\n$/, "").split("\n")) anotar({ tipo: "sistema", texto: linea });
    },

    preguntar: async (pregunta) => {
      // El enunciado queda en el transcript, como el prompt de stdio; la RESPUESTA no
      // pasa por aquí.
      anotar({ tipo: "sistema", texto: pregunta });
      if (!transporte.conectado()) return "";
      return new Promise<string>((resuelto) => {
        esperandoTexto.push(resuelto);
        transporte.emitir({ clase: "pregunta", texto: pregunta });
      });
    },

    leerSecreto: async (pregunta) => {
      // Solo la PREGUNTA entra en el transcript. El valor viaja del navegador a quien
      // llamó y a ningún sitio más: ni acto, ni traza de emisión, ni sesión en disco.
      anotar({ tipo: "sistema", texto: pregunta });
      if (!transporte.conectado()) return "";
      return new Promise<string>((resuelto) => {
        esperandoSecreto.push(resuelto);
        transporte.emitir({ clase: "secreto", pregunta });
      });
    },

    seleccionar: async (selector: SelectorDeConsola) => {
      if (!transporte.conectado()) return undefined;
      return new Promise<string | undefined>((resuelto) => {
        esperandoSeleccion.push(resuelto);
        transporte.emitir({ clase: "selector", selector });
      });
    },

    piel: (): Piel => pielWeb.piel,

    aprobacionesTui: (
      pendientes: PendienteDeAprobacion[],
      ficheros: Map<string, string>,
      diffs: Map<string, LineaDeDiff[]>
    ): Promise<Map<string, Decision>> => {
      // El mapa NACE rechazado entero. Todo lo que sigue solo puede ascender entradas.
      const decisiones = new Map<string, Decision>(
        pendientes.map((p) => [p.id, { type: "reject", message: REJECT_MESSAGE }])
      );
      if (!transporte.conectado()) return Promise.resolve(decisiones);

      return new Promise<Map<string, Decision>>((resuelto) => {
        const temporizador = setTimeout(() => enVuelo.terminar(), msDeEspera);
        const enVuelo: AprobacionEnVuelo = {
          decisiones,
          pendientes: new Map(pendientes.map((p) => [p.id, p])),
          // El ÚNICO mensaje con contenido de fichero y diff. `transporte.emitir` no lo
          // anota en su traza: vive aquí y solo mientras se decide.
          mensaje: {
            clase: "aprobacion",
            pendientes,
            ficheros: comoRegistro(ficheros),
            diffs: comoRegistro(diffs),
          },
          terminar: () => {
            clearTimeout(temporizador);
            // Soltarlo ANTES de resolver es lo que hace que una decisión tardía no tenga
            // nada que ascender, y que el contenido no sobreviva a la decisión.
            aprobacionEnVuelo = undefined;
            resuelto(decisiones);
          },
        };
        aprobacionEnVuelo = enVuelo;
        transporte.emitir(enVuelo.mensaje);
      });
    },

    // Un catálogo VIVO no se puede inventar: sin uno inyectado queda el doble de
    // `core/ports.ts`, que lleva la marca `ES_DOBLE` y por tanto `describe` lo delata.
    catalogoModelos: opciones.catalogoModelos ?? new CatalogoModelosEnMemoria(),

    // Sin persistencia inyectada esto NO puede fingir que guardó: un no-op silencioso
    // dejaría al usuario creyendo que su elección quedó escrita.
    guardarModeloGlobal:
      opciones.guardarModeloGlobal ??
      ((_papel: Papel, _id: string): { ruta: string; id: string } => {
        throw new Error("consolaWeb sin persistencia: quien la monta debe inyectar guardarModeloGlobal");
      }),
  };

  const recibir = (mensaje: MensajeDelCliente): void => {
    if (mensaje.clase === "prosa") {
      if (cerrada) return;
      // El eco de lo tecleado, como hace la TUI (`store.usuario`): el transcript se lo
      // debe a quien escribió la petición, y de ahí sale el título de la sesión.
      anotar({ tipo: "usuario", texto: mensaje.texto });
      const despertar = esperandoLinea.shift();
      if (despertar !== undefined) despertar({ value: mensaje.texto, done: false });
      else cola.push(mensaje.texto);
      return;
    }
    if (mensaje.clase === "respuesta") {
      esperandoTexto.shift()?.(mensaje.texto);
      return;
    }
    if (mensaje.clase === "secreto") {
      esperandoSecreto.shift()?.(mensaje.valor);
      return;
    }
    if (mensaje.clase === "eleccion") {
      esperandoSeleccion.shift()?.(mensaje.id);
      return;
    }
    // Decisión de aprobación.
    const enVuelo = aprobacionEnVuelo;
    if (enVuelo === undefined) return;
    for (const [id, valor] of Object.entries(mensaje.decisiones)) {
      const pendiente = enVuelo.pendientes.get(id);
      // Un id que no pedimos no puede aprobar nada, y tampoco entra en el mapa: el
      // resume de langgraph se construye con estas claves.
      if (pendiente === undefined) continue;
      const respuesta =
        valor === "approve" && pendiente.decisionesPermitidas.includes("approve") ? RESPUESTA_AFIRMATIVA : "";
      const decision = interpretAnswer(respuesta);
      if (decision.type === "approve") enVuelo.decisiones.set(id, decision);
    }
    // Se termina AUNQUE la respuesta sea parcial: los pendientes que no venían siguen
    // rechazados, que es la respuesta correcta a «no me contestaste sobre esto».
    enVuelo.terminar();
  };

  return {
    consola,
    recibir,
    conectar: (enviar) => transporte.conectar(enviar),
    desconectar: () => transporte.desconectar(),
    cerrar: () => {
      // Primero el corte —despierta a quien esperaba respuesta— y luego el EOF de la
      // cola, para que `correrConsola` retorne en vez de quedarse en el `next`.
      transporte.desconectar();
      cerrada = true;
      while (esperandoLinea.length > 0) esperandoLinea.shift()!({ value: undefined, done: true });
    },
    actos: () => actos,
    eventosEmitidos: () => transporte.emitidos(),
    mensajesDeAprobacion: () => (aprobacionEnVuelo === undefined ? [] : [aprobacionEnVuelo.mensaje]),
  };
}
