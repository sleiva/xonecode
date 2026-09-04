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
 * **Aquí NO se llama a `interpretAnswer`**, y no es un descuido. Esa función interpreta
 * TEXTO QUE TECLEA UN HUMANO: todo lo que la hace sutil —el conjunto `{s, si, sí, y, yes}`,
 * el corte entre TTY y no-TTY, el Enter a secas valiendo por un sí— va de teclear. Por este
 * socket no llega texto tecleado: llega el enum `Decision["type"]` que el propio pendiente
 * declara en `decisionesPermitidas`, porque el cliente son botones. Un enum no tiene nada
 * que interpretar. Traducirlo a `"s"` para hacerle pasar por `interpretAnswer` no aportaba
 * ni un bit de decisión —el predicado de aquí abajo ya la había tomado— y engañaba a quien
 * auditara: leería `interpretAnswer` y creería que el vocabulario aceptado es `{s, si, sí,
 * y, yes}`, cuando es exactamente `"approve"`. Y ataba este fichero a que `"s"` siguiera
 * dentro de `APPROVALS_NO_TTY`. El fail-closed no se mueve un milímetro por esto: vive en
 * el prellenado del mapa, no en quién compara la cadena.
 */
import { crearPielWeb } from "./pielWeb.js";
import { crearTransporte, type MensajeAlCliente, type MensajeDelCliente, type Sumidero } from "./transporte.js";
import type { Acto } from "../../core/actos.js";
import type { PendienteDeAprobacion } from "../../core/events.js";
import type { LineaDeDiff } from "../../core/diff.js";
import type { Piel } from "../../core/turno.js";
import type { Consola, SelectorDeConsola } from "../../cli/consola.js";
import { CatalogoModelosEnMemoria, type CatalogoModelosPort, type Papel } from "../../core/ports.js";
import { REJECT_MESSAGE, type Decision } from "../../vendor/hitl.js";

/**
 * Plazo de TODO lo que espera a un humano: la aprobación, la pregunta de texto libre, el
 * secreto y la selección. Generoso porque al otro lado hay una persona leyendo un diff, y
 * corto comparado con «para siempre»: un turno que se queda esperando a una pestaña que ya
 * nadie mira bloquea la sesión entera. Vencer es RECHAZAR (o contestar cadena vacía, o
 * cancelar, que aguas abajo es lo mismo), y un rechazo se puede volver a pedir; una
 * aprobación por cansancio, no.
 *
 * Es UN plazo y no cuatro porque las cuatro esperas son la misma espera —una persona que
 * decide— y cuatro números distintos serían cuatro cosas que mantener de acuerdo sin ninguna
 * razón que las separe.
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

/**
 * Una espera de humano, con plazo. Las tres —la pregunta de texto libre, el secreto y la
 * selección— son la MISMA espera, y por eso comparten función en vez de tres copias: con la
 * pestaña abierta ninguna vencía, y el lazo de `correrConsola` se quedaba `await`-ado ahí
 * dentro para siempre. Y no son hipotéticas: `/modelos`, `/themes` y `/provider` llegan a
 * `seleccionar` y a `leerSecreto` desde el compositor, con el registro de comandos que este
 * mismo servidor manda por el cable.
 *
 * `alVencer` es lo que cada una responde ya al desconectarse (cadena vacía, o `undefined`
 * para cancelar el selector): vencer y quedarse sin cliente son la misma respuesta, porque
 * en los dos casos no hay nadie contestando.
 *
 * La trampa que obliga a sacar el resolutor de la cola: `cola` es FIFO, así que uno muerto
 * en cabeza se comería la respuesta de la espera SIGUIENTE —que sí está viva— y la dejaría
 * colgada hasta su propio plazo.
 */
function esperarAUnHumano<T>(cola: ((valor: T) => void)[], alVencer: T, ms: number): Promise<T> {
  return new Promise<T>((resuelto) => {
    const responder = (valor: T): void => {
      clearTimeout(temporizador);
      resuelto(valor);
    };
    const temporizador = setTimeout(() => {
      const indice = cola.indexOf(responder);
      if (indice >= 0) cola.splice(indice, 1);
      resuelto(alVencer);
    }, ms);
    cola.push(responder);
  });
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

    /**
     * Sin cliente no hay humano, y decirlo aquí NO es redundante con `aprobacionesTui`.
     * `pedirDecisiones` calcula lo interactivo como `interactive && !eof()`, o sea que
     * «ausente» significa «hay alguien» — la dirección insegura. Y esta piel es la única
     * que cumple las DOS precondiciones de la fuga que arregló `crearDetectorDeEof`:
     * `interactivo: true` y un `preguntar` que devuelve cadena vacía al desconectarse, que
     * con TTY aprueba. Hoy no llega ahí porque `main.ts` prefiere `aprobacionesTui` cuando
     * existe; eso es dónde cae un `if`, no un diseño, y otra tarea puede moverlo sin
     * enterarse. Esto es la red debajo.
     */
    eof: () => !transporte.conectado(),

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
      // El MISMO plazo que `aprobacionesTui`, que era el único que lo tenía: la pregunta de
      // texto libre la ponen `politicaInteractiva` antes de subir y `/connect-studio` sin
      // URL, y sin plazo colgaban la sesión web entera. Cadena vacía al vencer, que es lo
      // que `interpretAnswer` trata como rechazo.
      const espera = esperarAUnHumano(esperandoTexto, "", msDeEspera);
      transporte.emitir({ clase: "pregunta", texto: pregunta });
      return espera;
    },

    leerSecreto: async (pregunta) => {
      // Solo la PREGUNTA entra en el transcript. El valor viaja del navegador a quien
      // llamó y a ningún sitio más: ni acto, ni traza de emisión, ni sesión en disco.
      anotar({ tipo: "sistema", texto: pregunta });
      if (!transporte.conectado()) return "";
      const espera = esperarAUnHumano(esperandoSecreto, "", msDeEspera);
      transporte.emitir({ clase: "secreto", pregunta });
      return espera;
    },

    seleccionar: async (selector: SelectorDeConsola) => {
      if (!transporte.conectado()) return undefined;
      const espera = esperarAUnHumano<string | undefined>(esperandoSeleccion, undefined, msDeEspera);
      transporte.emitir({ clase: "selector", selector });
      return espera;
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
      // La traducción de CANCELAR, y vive solo aquí: sin `id` —o con `null`— el humano se
      // echó atrás, y eso es `undefined`, lo mismo que responden el plazo y la desconexión.
      // Un id vacío o desconocido NO pasa por aquí: es una cadena, se entrega tal cual, y
      // quien llamó descubrirá que no casa con ninguna opción. Confundir las dos cosas
      // convertiría el bug de un cliente en un usuario que dijo «déjalo».
      esperandoSeleccion.shift()?.(typeof mensaje.id === "string" ? mensaje.id : undefined);
      return;
    }
    // Los pasos del alta no son de esta consola: los atiende el vestíbulo desde
    // `web/servidor/arranque.ts`, que los aparta antes de llegar aquí. La guarda existe
    // igual porque este `recibir` es público y lo que no se entiende no puede caer en la
    // rama de aprobación — sería una decisión inventada sobre escrituras reales.
    if (mensaje.clase !== "decision") return;
    // Decisión de aprobación.
    const enVuelo = aprobacionEnVuelo;
    if (enVuelo === undefined) return;
    // El `try/finally` es el fail-closed llevado hasta el final: pase lo que pase ahí
    // dentro, la aprobación TERMINA con lo que tenga —y lo que tiene es el prellenado de
    // rechazos—. Sin él, un lanzamiento dejaba la aprobación sin resolver hasta que
    // venciera el plazo (diez minutos en producción) y sin forma de reintentar, porque la
    // aprobación no se reemite al reconectar: acababa en rechazo por AGOTAMIENTO en vez de
    // por decisión, que es la misma respuesta contada como si nadie hubiera fallado.
    try {
      // `decisiones` viene de un `JSON.parse` de la red: el tipo es una promesa que el
      // cable no está obligado a cumplir. Medido: `Object.entries(null)` lanza
      // «Cannot convert undefined or null to object» y `{clase:"decision"}` a secas
      // tampoco trae la clave.
      for (const [id, valor] of Object.entries(mensaje.decisiones ?? {})) {
        const pendiente = enVuelo.pendientes.get(id);
        // Un id que no pedimos no puede aprobar nada, y tampoco entra en el mapa: el
        // resume de langgraph se construye con estas claves.
        if (pendiente === undefined) continue;
        // La comparación es EXACTA y contra lo que el propio pendiente declara permitido:
        // el cliente son botones, no hay erratas que perdonar, y todo lo demás es rechazo
        // porque el mapa ya nació rechazado.
        if (valor === "approve" && pendiente.decisionesPermitidas.includes("approve")) {
          enVuelo.decisiones.set(id, { type: "approve" });
        }
      }
    } finally {
      // Se termina AUNQUE la respuesta sea parcial o basura: los pendientes que no venían
      // siguen rechazados, que es la respuesta correcta a «no me contestaste sobre esto».
      enVuelo.terminar();
    }
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
