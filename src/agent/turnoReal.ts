import { readdirSync, lstatSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, sep, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { HumanMessage } from "@langchain/core/messages";
import { Command, MemorySaver } from "@langchain/langgraph";
import { collectPending, type Decision, MAX_APPROVAL_ROUNDS } from "../vendor/hitl.js";

/**
 * Cuántas veces se le devuelven los hallazgos al agente para que los corrija. Dos: tres
 * verificaciones en total. Un modelo que no arregla algo en dos intentos con el error
 * delante no lo arregla al quinto, y cada intento son escrituras que pasan por aprobación
 * humana — o sea, tiempo de una persona. La guarda de «no progresa» (misma huella dos
 * veces) corta antes de llegar aquí cuando el modelo repite el mismo cambio.
 */
export const TOPE_REPARACIONES = 2;
import { aPendiente, ficheroDe, cambioDe, buildResume } from "./interrupts.js";
import { cargarAgentes } from "./agentesEnDisco.js";
import { crearSubagenteExterno } from "./subagenteExterno.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import type { LineaDeDiff } from "../core/diff.js";
import type { Piel } from "../core/turno.js";
import { Bitacora } from "../core/bitacora.js";
import { correrTurno } from "../core/turno.js";
import type { ModelosPort, SkillsPort, VerifierPort } from "../core/ports.js";
import type { DomainEvent, HallazgoDelTurno } from "../core/events.js";
import { relative, resolve as resolverRuta } from "node:path";
import type { Entorno } from "./entorno.js";
import { tomarInstantanea, type Instantanea, type Cambio } from "./instantanea.js";
import { construirAgente } from "./xoneAgent.js";
import { asegurarMemoriaDeProyecto } from "./memoriaDeProyecto.js";
import { aEventos } from "./puente.js";
import { createTokenTracker, type TokenTracker } from "../vendor/tokenTracking.js";
import { crearDiagnosticoDeTools } from "./diagnosticoDeTools.js";

/**
 * Una sesión de turno real: varios turnos sobre el MISMO agente y el MISMO hilo.
 *
 * Es la extracción de `correrReal` (`cli/run.ts`), reescrita de disparo único a reutilizable:
 * el agente, el checkpointer, el tracker y el `thread_id` viven en el cierre de
 * `abrirSesionReal` y se conservan entre llamadas. Lo que cada `turno()` renueva es la foto
 * del ANTES, porque el diff es del TURNO y no de la sesión: si la foto fuese una por sesión,
 * el turno 3 reportaría también lo que escribió el turno 1.
 */
export interface SesionReal {
  /** Un turno. Devuelve la bitácora y los cambios que dejó en el proyecto. */
  turno(
    peticion: string,
    piel: Piel
  ): Promise<{
    bitacora: Bitacora;
    cambios: Cambio[];
    /** Se agotó `MAX_APPROVAL_ROUNDS` con aprobaciones sin resolver. */
    cortadoPorTope: boolean;
  }>;
  /** Rehace el agente con modelos nuevos, CONSERVANDO el hilo. Para `/modelo`. */
  cambiarModelos(modelos: ModelosPort): Promise<void>;
  /** Abre un hilo nuevo. Para `/nuevo`. */
  /**
   * Abre un hilo nuevo. **Acepta el id** porque quien lo pide puede ya tener uno.
   *
   * Sin el parámetro había DOS ids para un mismo hilo: la consola generaba el suyo en su
   * `/nuevo` y la sesión otro aquí, así que `/hilo` enseñaba un `thread_id` que no era el
   * que usaba el grafo. Un identificador que no identifica es peor que no darlo.
   */
  nuevoHilo(id?: string): void;
  /** Aborta de inmediato la llamada al modelo que está en curso, si la hay. */
  cancelar(): void;
  /**
   * Termina la sesión: aborta lo que esté en curso y la deja inservible.
   *
   * Hace falta para CAMBIAR de proyecto (`web/servidor/vestibulo.ts`): la consola web abre
   * una consola de proyecto a la vez, y cerrar la anterior es agotar sus `lineas` para que
   * `correrConsola` retorne. Sin esto, un turno en vuelo mantendría el lazo dentro del
   * `await` durante minutos y la apertura del proyecto siguiente se quedaría esperando.
   *
   * Qué libera y qué no, dicho entero porque una fuga callada es peor que una declarada:
   * el `MemorySaver`, el agente construido y el tracker viven en el CIERRE de
   * `abrirSesionReal` y no exponen ningún `close()` —no hay sockets ni descriptores, el
   * cliente del modelo es por llamada—, así que se recogen con la referencia a la sesión
   * en cuanto quien la abrió la suelta. Lo único que hay que soltar activamente es la
   * llamada en curso, y eso es exactamente `cancelar()`. La bandera de cerrada existe para
   * que un `turno()` tardío falle en vez de revivir un hilo que ya nadie mira.
   */
  cerrar(): void;
  readonly tracker: TokenTracker;
  /** El `thread_id` ACTUAL: tras `nuevoHilo()` cambia, y hay que leerlo, no cachearlo. */
  readonly hilo: string;
}

/**
 * Recorre la raíz y devuelve las rutas en el ESPACIO VIRTUAL del backend.
 *
 * Exportada porque la consola la usa para el completado de «@ficheros» (cli puede
 * importar de agent; al revés no). El recorrido se hace EN CADA llamada a propósito:
 * la lista no se cachea porque los ficheros cambian durante la sesión.
 */
/** Hasta dónde baja el completado del Tab. El árbol de la consola web pide más (`arbolDeProyecto.ts`). */
export const PROFUNDIDAD_DEL_TAB = 4;

export function ficherosDelProyecto(raiz: string, prof = 0, tope = PROFUNDIDAD_DEL_TAB): ReadonlySet<string> {
  if (prof > tope || !existsSync(raiz)) return new Set();
  const salida = new Set<string>();
  for (const entrada of readdirSync(raiz)) {
    if (entrada === "node_modules" || entrada === ".git") continue;
    const ruta = join(raiz, entrada);
    try {
      // `lstatSync` y no `statSync`: una CARPETA detrás de un enlace simbólico no se
      // recorre. Medido en la pestaña Ficheros de la consola web: «carpeta-enlazada» →
      // «.xonecode» listaba la carpeta denegada bajo otro nombre, y «dir-fuera» →
      // «/algo/de/fuera» listaba nombres de ficheros que no son del proyecto (un
      // «dir-fuera/id_rsa»). Tampoco se lista el enlace en sí: la carpeta a la que apunta
      // o ya está en el árbol por su nombre real, o está fuera del proyecto y no debe
      // salir — y una hoja que al abrirse dice «no se enseña» es un botón muerto.
      // Un enlace a FICHERO sí se queda como hoja: quién decide si se puede leer es la
      // barrera del lector (`arbolDeProyecto.ts`), que recomprueba sobre el `realpath`.
      // Esta función alimenta a TRES consumidores y el cambio es correcto para los tres:
      // el completado de «@ficheros» del Tab (no completa a carpetas ajenas), el universo
      // que consulta `esVistaAplanada` (una vista aplanada de fuera del proyecto no es
      // asunto nuestro) y el árbol de la consola web.
      const info = lstatSync(ruta);
      if (info.isSymbolicLink() && statSync(ruta).isDirectory()) continue;
      if (info.isDirectory()) {
        // La recursión devuelve rutas relativas al SUBDIRECTORIO: sin recoserle el
        // nombre, «app/Clientes.xne» saldría como «/Clientes.xne» y el Set dejaría de
        // responder por las vistas aplanadas ANIDADAS (este universo es el que consulta
        // `esVistaAplanada`).
        for (const f of ficherosDelProyecto(ruta, prof + 1, tope)) salida.add(`/${entrada}${f}`);
      } else {
        salida.add("/" + ruta.slice(raiz.length + 1).split(sep).join("/"));
      }
    } catch {
      // Un enlace roto o un permiso no tumba el arranque; el agente vivirá sin ese fichero.
    }
  }
  return salida;
}

/**
 * Abre una sesión real: agente, checkpointer, hilo y tracker se construyen UNA vez aquí, y
 * viven en el cierre. Todo lo que sobreviva al primer turno tiene que salir de este cierre:
 * reconstruir el agente fuera (o un `MemorySaver` nuevo por llamada) tiraría la conversación.
 */
export async function abrirSesionReal(opciones: {
  raiz: string;
  modelos: ModelosPort;
  skills: SkillsPort;
  entorno: Entorno;
  /** Para las aprobaciones. Sin él, una escritura pendiente termina el turno diciéndolo. */
  pedirAprobacion?: (
    pendientes: PendienteDeAprobacion[],
    ficheros: Map<string, string>,
    diffs: Map<string, LineaDeDiff[]>
  ) => Promise<Map<string, Decision>>;
  /**
   * El simulador, para verificar lo que el turno escribió. OPCIONAL, y su ausencia no se
   * disimula: sin él, un turno que escribió termina con el aviso de que no se verificó y el
   * motivo. Es un puerto por lo de siempre —`npm test` no puede necesitar el binario— y
   * porque quien construye el turno no tiene por qué saber cómo se verifica.
   */
  verifier?: VerifierPort;
}): Promise<SesionReal> {
  const { raiz, entorno } = opciones;

  // Persiste fuera del checkpointer (que es solo de la sesión), pero no sobrescribe nunca
  // una memoria ya creada por el usuario o por otra sesión.
  asegurarMemoriaDeProyecto(raiz);

  const checkpointer = new MemorySaver();
  const tracker = createTokenTracker();
  const diagnostico = crearDiagnosticoDeTools(raiz);
  let modelos = opciones.modelos;
  let hilo = `xonecode-${randomUUID()}`;
  let cancelarEnCurso: (() => void) | undefined;
  let cerrada = false;

  const construir = async (): Promise<unknown> =>
    construirAgente({
      raiz,
      ficheros: ficherosDelProyecto(raiz),
      // Se releen en CADA construcción del agente y no una vez al abrir la sesión: el
      // usuario puede tocar un `.md` —o guardarlo desde Ajustes— con la consola abierta, y
      // una lista congelada al arrancar le haría creer que su cambio no se aplicó.
      agentes: cargarAgentes(raiz).agentes,
      // El adaptador real. Su import del SDK es dinámico, así que traerlo aquí no carga
      // nada hasta que un agente externo esté dado de alta Y disponible.
      subagenteExterno: crearSubagenteExterno(),
      modelos,
      skills: opciones.skills,
      checkpointer: checkpointer,
      tracker,
      diagnostico,
    });

  let agente = await construir();

  /**
   * Los pendientes de aprobación, del ESTADO y no del resultado del stream.
   *
   * Se leen los crudos (`collectPending`) y no solo los traducidos, porque de ellos sale la
   * RUTA del fichero que se va a tocar (`ficheroDe`). Los argumentos NO se publican
   * —`write_file` lleva el contenido entero—, pero aprobar a ciegas es peor que no aprobar,
   * así que la ruta sí. Una sola llamada a `getState` para las dos cosas.
   */
  const leerPendientes = async (): Promise<{
    lista: PendienteDeAprobacion[];
    ficheros: Map<string, string>;
    diffs: Map<string, LineaDeDiff[]>;
  }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const crudos = collectPending(await (agente as any).getState({
      configurable: { thread_id: hilo },
    }));
    const ficheros = new Map<string, string>();
    const diffs = new Map<string, LineaDeDiff[]>();
    for (const c of crudos) {
      const f = ficheroDe(c);
      if (f) ficheros.set(c.id, f);
      // El ANTES es el disco: el interrupt pausa ANTES de escribir. La ruta viene del
      // backend, que es relativo a la raíz del proyecto — y si no está en el disco, el
      // fichero es nuevo y su «antes» es la cadena vacía, no un error.
      const vista = cambioDe(c, (ruta) => {
        try {
          return readFileSync(resolve(raiz, ruta), "utf8");
        } catch {
          return "";
        }
      });
      if (vista) diffs.set(c.id, vista.lineas);
    }
    return { lista: crudos.map(aPendiente), ficheros, diffs };
  };

  /**
   * Un turno: foto del ANTES → stream con bucle de aprobación → diff contra esa foto.
   *
   * La foto es POR TURNO, no por sesión: con una sola, el diff del turno 3 incluiría lo que
   * escribió el turno 1.
   */
  const turno = async (
    peticion: string,
    piel: Piel
  ): Promise<{ bitacora: Bitacora; cambios: Cambio[]; cortadoPorTope: boolean }> => {
    // Un turno sobre una sesión ya cerrada reviviría un hilo que su dueño soltó al cambiar
    // de proyecto. Falla en vez de trabajar en silencio sobre la raíz equivocada.
    if (cerrada) throw new Error("la sesión ya está cerrada");
    // El reloj del turno ENTERO. Se le pasa a cada pasada de `correrTurno` como `desde`:
    // solo la última cierra, y su `fin` tiene que contar desde aquí y no desde que empezó
    // ella — si no, un turno largo con aprobación por medio diría solo lo que tardó la
    // reanudación.
    const t0 = Date.now();
    const instantanea: Instantanea = await tomarInstantanea(raiz, entorno.git);

    let payload: unknown = { messages: [new HumanMessage(peticion)] };
    let bitacora = null as Awaited<ReturnType<typeof correrTurno>> | null;
    let ronda = 0;

    // El bucle de aprobación, tal como está en `correrReal` (`cli/run.ts`): una pausa
    // TERMINA la ronda, el interrupt queda en el estado, y se reanuda con un `Command`
    // con las decisiones — también con rejects, que si no se resumen dejan el interrupt
    // colgado para siempre y el modelo nunca llega a saber que se rechazó.
    let cortadoPorTope = false;

    /**
     * El estado del lazo, compartido entre el generador y el bucle de rondas.
     *
     * Lo escribe `conVerificacion` mientras la pasada corre, y lo leen el aviso determinista
     * y la decisión de cierre de ESA misma pasada, más el bucle de fuera para saber si hay
     * que reparar. Es la única forma de que quien cierra el turno sepa algo que solo se
     * conoce al agotarse el flujo: si detrás viene otra ronda, otro intento, o nada.
     */
    let rondaEscribio = false;
    let motivoSinVerificar: string | undefined;
    /** Si esta pasada cierra el turno. `false` = detrás viene otra ronda o un intento. */
    let cerrarRonda = true;
    /** Si tras esta pasada hay que lanzar un intento de reparación. */
    let reparar = false;
    /** Intentos de reparación ya lanzados en este turno. */
    let intento = 0;
    /** Los hallazgos del último veredicto rojo, para redactar la petición de reparación. */
    let ultimosHallazgos: HallazgoDelTurno[] = [];
    /** La huella del veredicto anterior, para detectar que reparar no avanza. */
    let huellaPrevia: string | undefined;

    /**
     * El lazo de verificación, cosido al FINAL del flujo de eventos y no después del turno.
     *
     * Tiene que ir dentro del flujo porque `correrTurno` cierra el turno en su `finally`
     * —el aviso «no ha corrido», y `piel.fin()`— en cuanto el flujo se agota. Verificar
     * después de eso pintaría el veredicto detrás del fin del turno, y en la web el
     * compositor ya se habría encendido con el turno «terminado».
     *
     * Solo verifica la ronda FINAL: la que termina sin escrituras pendientes. En una ronda
     * con aprobaciones por resolver las escrituras no se han aplicado todavía, así que no
     * hay nada que medir — se medirá en la ronda que las aplique.
     *
     * Y solo si el turno tocó ficheros del PROYECTO. Los de `.xonecode/` no cuentan: ahí
     * escribe el propio harness (la memoria, los resúmenes de contexto) y contarlos haría
     * que un turno de pura conversación pasara por el simulador — y que el aviso de «no se
     * verificó» saltara en un «cuéntame un chiste», que es exactamente lo que la bitácora
     * de turno existe para evitar.
     */
    async function* conVerificacion(eventos: AsyncIterable<DomainEvent>): AsyncIterable<DomainEvent> {
      // Un intento de reparación se anuncia al EMPEZAR su pasada, no al final de la anterior:
      // así el «🔁 reparando» abre el tramo de trabajo que viene, en vez de cerrar el que
      // acaba. Es el orden que `guionizado.ts` ya recorre.
      if (intento > 0) yield { tipo: "reparacion", intento, tope: TOPE_REPARACIONES };
      reparar = false;

      yield* eventos;

      if ((await leerPendientes()).lista.length > 0) {
        // Quedan escrituras por aprobar. Si el bucle va a seguir —hay quien apruebe y no se
        // ha agotado el tope de rondas— esta pasada NO es el final del turno y no cierra.
        // Son las mismas dos condiciones del `break` del bucle, y tienen que serlo: si
        // divergen, un turno se queda sin `fin` o cierra dos veces.
        cerrarRonda = !(ronda < MAX_APPROVAL_ROUNDS && opciones.pedirAprobacion !== undefined);
        return;
      }
      cerrarRonda = true;

      const cambios = (await instantanea.cambios()).filter(
        (c) => c.clase !== "borrado" && !c.ruta.startsWith(".xonecode/") && c.ruta !== ".xonecode"
      );
      rondaEscribio = cambios.length > 0;
      if (!rondaEscribio) return;

      if (opciones.verifier === undefined) {
        motivoSinVerificar = "esta ejecución no tiene verificador";
        return;
      }

      yield { tipo: "fase", fase: "verificando" };
      let informe;
      try {
        informe = await opciones.verifier.verificar(raiz);
      } catch (e) {
        // Que no esté el binario NO es un fallo del proyecto, y se dice como tal. El aviso
        // determinista del final saldrá igualmente: «no ha corrido» sigue siendo verdad.
        motivoSinVerificar = e instanceof Error ? e.message : String(e);
        yield { tipo: "aviso", texto: `⚠ no se pudo verificar: ${motivoSinVerificar}`, severidad: "aviso" };
        return;
      }

      // Los hallazgos se reparten entre los ficheros que ESTE turno tocó y los demás. El
      // simulador mira el proyecto entero —es su API—, y un error que ya estaba en un
      // fichero que el agente no abrió no es del agente. Un hallazgo sin fichero no se
      // puede atribuir: se enseña con los del turno, que es el lado conservador.
      const tocados = new Set(cambios.map((c) => resolverRuta(raiz, c.ruta)));
      const delTurno = informe.hallazgos.filter(
        (h) => h.fichero === undefined || tocados.has(resolverRuta(h.fichero))
      );
      const preexistentes = informe.hallazgos.length - delTurno.length;
      const errores = delTurno.filter((h) => h.severidad === "error").length;

      const hallazgos: HallazgoDelTurno[] = delTurno.map((h) => ({
        code: h.code,
        severidad: h.severidad,
        mensaje: h.mensaje,
        ...(h.fichero === undefined ? {} : { fichero: relative(raiz, h.fichero) }),
        ...(h.linea === undefined ? {} : { linea: h.linea }),
      }));

      yield {
        tipo: "verificacion",
        verde: errores === 0,
        errores,
        avisos: delTurno.length - errores,
        hallazgos,
        ...(preexistentes > 0 ? { preexistentes } : {}),
      };
      if (errores === 0) return;

      // Rojo. Tres salidas, y solo una de ellas es «inténtalo otra vez».
      //
      // La huella son los ERRORES, no todos los hallazgos: un aviso que va y viene no dice
      // nada de si el error se está arreglando. Y se compara con la del veredicto anterior
      // y no con «¿bajó el número?»: dos errores distintos en vez de dos iguales también es
      // avance, y un modelo que arregla uno y rompe otro no debe quedarse bloqueado como si
      // no hubiera hecho nada.
      const huella = hallazgos
        .filter((h) => h.severidad === "error")
        .map((h) => `${h.code}|${h.fichero ?? ""}|${h.linea ?? ""}`)
        .sort()
        .join("\n");

      if (huella === huellaPrevia) {
        // Corregir no cambió nada: el mismo error, en el mismo sitio. Seguir sería gastar
        // el tope —y aprobaciones humanas— en repetir el mismo cambio.
        yield {
          tipo: "bloqueado",
          motivo: "no-progreso",
          explicacion: `el intento ${intento} dejó los mismos ${errores} error(es) en los mismos sitios`,
        };
        return;
      }
      if (intento >= TOPE_REPARACIONES) {
        yield {
          tipo: "bloqueado",
          motivo: "tope-reparaciones",
          explicacion: `tras ${intento} intento(s) siguen ${errores} error(es); se deja como está para que lo mires`,
        };
        return;
      }

      // Se intenta otra vez. Esta pasada NO cierra el turno: el `fin` y los avisos van al
      // final del intento que viene, o del que corte.
      huellaPrevia = huella;
      ultimosHallazgos = hallazgos;
      intento += 1;
      reparar = true;
      cerrarRonda = false;
    }

    /**
     * La petición de reparación: los hallazgos tal cual, sin más interpretación.
     *
     * Va como un mensaje de USUARIO en el mismo hilo, no como un prompt de sistema nuevo:
     * es la única forma de que el especialista vea lo que acaba de escribir y el error
     * juntos. Y no se le dice CÓMO arreglarlo —eso lo sabe él o no lo sabe—, se le recuerda
     * lo único que importa aquí: que no se invente nada para que el error desaparezca, que
     * es justo lo que XOne no le va a reprochar y el simulador sí.
     */
    const peticionDeReparacion = (): string =>
      [
        `El simulador de XOne ha revisado lo que acabas de escribir y ha encontrado ${ultimosHallazgos.filter((h) => h.severidad === "error").length} error(es):`,
        ...ultimosHallazgos.map(
          (h) =>
            `- ${h.severidad === "error" ? "ERROR" : "aviso"} ${h.code}${h.fichero === undefined ? "" : ` en ${h.fichero}${h.linea === undefined ? "" : `:${h.linea}`}`}: ${h.mensaje}`
        ),
        "",
        "Corrige los errores. No inventes atributos, funciones ni propiedades para que",
        "desaparezcan: XOne ignora lo desconocido en silencio y el simulador lo detecta.",
        "Si algún error no sabes cómo corregirlo, dilo en vez de intentar otra cosa.",
      ].join("\n");

    // Dos bucles anidados y a propósito: el de dentro son las RONDAS de aprobación de una
    // petición (una pausa termina la ronda, se reanuda con las decisiones); el de fuera son
    // los INTENTOS de reparación, cada uno una petición nueva en el mismo hilo. Quién
    // decide si hay intento es el generador, que es quien ve el veredicto.
    do {
    if (intento > 0) payload = { messages: [new HumanMessage(peticionDeReparacion())] };
    ronda = 0;
    while (true) {
      ronda += 1;
      rondaEscribio = false;
      motivoSinVerificar = undefined;
      cerrarRonda = true;
      const aborto = new AbortController();
      cancelarEnCurso = () => aborto.abort(new Error("turno cancelado por el usuario"));
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream = await (agente as any).stream(payload, {
          configurable: { thread_id: hilo },
          signal: aborto.signal,
          streamMode: ["updates", "messages"],
          subgraphs: true,
        });

        bitacora = await correrTurno(
          conVerificacion(
            aEventos(
              stream,
              async () => (await leerPendientes()).lista,
              ({ nombre, detalle, parametros }) => diagnostico?.herramienta(nombre, detalle, parametros, tracker)
            )
          ),
          piel,
          {
            // El aviso solo si el turno ESCRIBIÓ y aun así no se verificó. Antes saltaba en
            // todos los turnos, incluido «cuéntame un chiste» — y un aviso que salta cuando
            // no ha pasado nada enseña a ignorarlo, que es lo contrario de lo que se compra
            // con él. Con el motivo, porque «no ha corrido» sin más manda a adivinar.
            avisos: (b) =>
              b.corrio("verify") || !rondaEscribio
                ? []
                : [
                    `⚠ el verificador no ha corrido en este turno${motivoSinVerificar === undefined ? "" : ` (${motivoSinVerificar})`}`,
                  ],
            // Solo la ÚLTIMA pasada cierra el turno. Lo decide el generador al agotar el
            // flujo: si quedan rondas o viene un intento, no hay `fin` todavía.
            cerrar: () => cerrarRonda,
            desde: t0,
          }
        );
      } finally {
        cancelarEnCurso = undefined;
      }

      const { lista, ficheros, diffs } = await leerPendientes();
      if (lista.length === 0) break;

      // El tope existe porque un modelo que insiste tras cada rechazo convierte esto en un
      // ciclo automático de ~200k tokens por ronda (medido en da04). Sin resumir: nada se
      // aplica, pero el interrupt queda en el estado.
      if (ronda >= MAX_APPROVAL_ROUNDS) {
        piel.linea(`\n⚠ tope de ${MAX_APPROVAL_ROUNDS} rondas de aprobación agotado.`);
        piel.linea(`  quedaban ${lista.length} sin resolver, y NO se han aplicado.`);
        cortadoPorTope = true;
        break;
      }

      if (!opciones.pedirAprobacion) {
        piel.linea(`\n⏸  ${lista.length} escritura(s) piden aprobación, y no hay quién apruebe.`);
        piel.linea("   Nada se ha aprobado y nada se ha aplicado.");
        break;
      }

      let decisiones: Map<string, Decision>;
      try {
        decisiones = await opciones.pedirAprobacion(lista, ficheros, diffs);
      } catch (e) {
        // La ronda que acaba de pasar no cerró el turno —predijo que habría reanudación— y
        // la aprobación ha reventado en vez de contestar (el «sin humano» de `run.ts`, que
        // corta desde dentro). Sin esto, ese turno se quedaba sin `fin`: sin línea de tiempo
        // en stdio y sin plegar en la web. Los avisos no se pierden: con escrituras
        // pendientes ninguno aplica. Se cierra y se propaga, que sigue siendo un fallo.
        if (!cerrarRonda) piel.fin(Date.now() - t0);
        throw e;
      }
      payload = new Command({ resume: buildResume(decisiones) });
    }
    } while (reparar);

    // El diff contra la foto de ESTE turno. Un turno que no tocó nada TIENE que verse igual.
    const cambios = await instantanea.cambios();
    // `cortadoPorTope` viaja en el retorno y no en la bitácora porque es lo que decide el
    // CÓDIGO DE SALIDA de quien invoca: un turno que se quedó con escrituras sin resolver
    // no es un éxito, y CI no puede leerlo como tal.
    return { bitacora: bitacora!, cambios, cortadoPorTope };
  };

  return {
    turno,
    cancelar: () => cancelarEnCurso?.(),
    cerrar: () => {
      cerrada = true;
      cancelarEnCurso?.();
    },
    /** Para `/modelo`: agente nuevo con los mismos hilo, checkpointer y tracker. */
    async cambiarModelos(nuevos: ModelosPort): Promise<void> {
      modelos = nuevos;
      agente = await construir();
    },
    /** Para `/nuevo`: solo cambia el hilo. El agente no se reconstruye. */
    nuevoHilo(id?: string): void {
      hilo = id ?? `xonecode-${randomUUID()}`;
    },
    tracker,
    get hilo(): string {
      return hilo;
    },
  };
}
