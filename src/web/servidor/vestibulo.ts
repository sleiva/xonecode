/**
 * El vestíbulo: lo que hay ANTES de que exista ninguna raíz.
 *
 * `correrConsola` es un lazo sobre UNA `raiz`, y la jerarquía entorno → proyecto → sesión
 * necesita un sitio donde vivir mientras no hay proyecto abierto. De ahí las dos clases de
 * consola: el vestíbulo (sin raíz) y la consola de proyecto (con la suya).
 *
 * Los pasos son los mismos del alta de terminal, y cada uno solo aparece si falta lo que
 * decide. El de cuenta se detecta como siempre: si el papel `trabajo` resuelve por
 * `omision`, nadie eligió nunca. **No hay marca de «primer arranque»**: sería una segunda
 * fuente de verdad sobre algo que el sistema ya sabe.
 *
 * Este fichero NO toca disco ni red por su cuenta. Todo lo que escribe o conecta entra por
 * la opción correspondiente, y las que escriben (`guardarCredencial`, `guardarEntorno`,
 * `guardarConfigDeProyecto`, `descargar`) son OBLIGATORIAS: un valor por omisión que
 * escribiera en el `~/.xonecode` de verdad convertiría cualquier test en una escritura en
 * la casa del usuario, y uno que no escribiera sería el no-op silencioso que este repo
 * evita en todas partes.
 */

import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Acto } from "../../core/actos.js";
import type { Eleccion, FuentesDeEleccion, Proveedor } from "../../core/modelos.js";
import type { CatalogoModelosPort } from "../../core/ports.js";
import type { Entorno } from "../../core/settings.js";
import { rutaDeWorkspace } from "../../core/settings.js";
import {
  URL_CLOUDSTUDIO_POR_OMISION,
  SCOPES_CLOUDSTUDIO_AGENTE,
  adoptarLegadoSiProcede,
  conectarCloudStudio,
  rutaAuthPorDefecto,
  sesionCloudStudio,
} from "../../agent/cloudstudioMcp.js";
import { clienteCloudStudio } from "../../agent/cloudstudioClient.js";
import {
  guardarCloudStudioDeProyecto,
  guardarEntornoDeProyecto,
  guardarModeloGlobal as guardarModeloGlobalEnDisco,
  guardarModoDeProyecto,
  guardarProyectoCloudStudioDeProyecto,
  guardarRamaDeProyecto,
} from "../../agent/configEnDisco.js";
import { correrConsola, ejecutarTurnoGuionizado, type Consola, type EjecutorDeTurno } from "../../cli/consola.js";
import { asistenteDeModelo } from "../../cli/wizardInicial.js";
import { crearConsolaWeb, type ConsolaWeb, type OpcionesDeConsolaWeb } from "./consolaWeb.js";
import { anotarActo, crearSesion, reabrirSesion } from "./sesiones.js";
import type { MensajeDelCliente, Sumidero } from "./transporte.js";

/** El paso que todavía falta. El orden de la lista ES el orden en que se presentan. */
export type PasoDelVestibulo = "cuenta" | "entorno" | "proyecto";

/** Un entorno ofrecido en el paso 2. `url` vacía = el usuario la teclea («otro»). */
export interface OpcionDeEntorno {
  id: string;
  nombre: string;
  url: string;
}

/**
 * Los dos CloudStudio oficiales, pre-rellenados.
 *
 * La URL de WebStudio no se repite aquí: se importa de `agent/cloudstudioMcp.ts`, que es
 * donde vive desde que `adoptarLegadoSiProcede` la necesitó (`cli/consola.ts` la reexporta
 * por compatibilidad). Dos literales de la misma dirección es cómo divergen el día que una
 * se corrige y la otra no — el mismo motivo por el que `segmentoSeguro` no se copió.
 */
export const ENTORNOS_OFICIALES: readonly OpcionDeEntorno[] = [
  { id: "webstudio", nombre: "XOne WebStudio", url: URL_CLOUDSTUDIO_POR_OMISION },
  { id: "manager", nombre: "XOne Manager", url: "https://mcp.xonemanager.com/mcp" },
];

/**
 * El tercero de la lista, y no un botón aparte de la interfaz: un on-premise es un entorno
 * como los otros dos, y presentarlo al mismo nivel es lo que evita que la web tenga dos
 * caminos distintos para registrar lo mismo.
 */
export const ENTORNO_OTRO: OpcionDeEntorno = { id: "otro", nombre: "Otro (on-premise)", url: "" };

/** La base del workspace por omisión: `~/.xonecode`. La disposición de dentro la fija
 *  `rutaDeWorkspace` y no es configurable. */
export function baseDeWorkspacePorOmision(): string {
  return join(homedir(), ".xonecode");
}

/** Lo que define a un proyecto ya elegido: entorno, endpoint, identidad remota y rama origen. */
export interface DatosDeProyecto {
  /** El id del entorno de `settings.json`. */
  entorno: string;
  url: string;
  scopes: readonly string[];
  proyecto: { id: string; nombre: string };
  /** La rama ORIGEN: de la que se baja y contra la que se compara. */
  rama: string;
}

/**
 * La persistencia de sesiones, por puerto: los tests no pueden escribir en el proyecto de
 * verdad y el vestíbulo no puede saber si el `raiz` que le dan existe.
 */
export interface PuertoDeSesiones {
  crear(raiz: string): string;
  anotar(raiz: string, id: string, acto: Acto): void;
  reabrir(raiz: string, id: string): { id: string; actos: Acto[]; historica: boolean };
}

const SESIONES_EN_DISCO: PuertoDeSesiones = {
  crear: crearSesion,
  anotar: anotarActo,
  reabrir: reabrirSesion,
};

/** Lo mínimo que el vestíbulo necesita de una `SesionReal` para cambiar de proyecto. */
export interface SesionCerrable {
  cerrar(): void;
}

export interface OpcionesDelVestibulo {
  /**
   * El `origen` con el que resolvió el papel `trabajo`. Es la ÚNICA señal de que nadie ha
   * elegido nunca; no hay marca de primer arranque.
   */
  origenDeTrabajo: Eleccion["origen"];
  catalogoModelos: CatalogoModelosPort;
  /** Escribe en `~/.xonecode/auth.json` y devuelve dónde quedó, como `agent/authEnDisco.ts`. */
  guardarCredencial: (proveedor: Proveedor, clave: string) => { ruta: string };
  /** Registra el entorno en `~/.xonecode/settings.json`. */
  guardarEntorno: (entorno: Entorno) => { ruta: string };
  /** Baja la copia local. Recibe la raíz ya calculada: la sincronización no se toca, solo
   *  cambia QUIÉN calcula el `raiz` que siempre recibió por parámetro. */
  descargar: (datos: DatosDeProyecto & { raiz: string }) => Promise<void>;
  /** Escribe el `config.json` del proyecto ENTERO. Ver `escribirProyectoEnDisco`. */
  guardarConfigDeProyecto: (raiz: string, datos: DatosDeProyecto) => { ruta: string };
  /** A dónde van los avisos del vestíbulo. Por omisión, su propia consola. */
  informar?: (texto: string) => void;
  /** Los entornos YA registrados, tal cual los lee `agent/settingsEnDisco.ts#cargarSettings`. */
  entornos?: readonly Entorno[];
  baseDeWorkspace?: string;
  /**
   * Proveedores que ya tienen credencial. Por omisión `false` para todos, que es la
   * dirección segura: preguntar de más molesta, no preguntar deja al usuario sin clave.
   */
  hayCredencial?: (proveedor: Proveedor) => boolean;
  /**
   * La escritura de la elección de modelo. `consolaWeb` LANZA por omisión a propósito
   * (un no-op silencioso mentiría), así que quien monta la consola tiene que inyectarla:
   * eso es este fichero, y por eso aquí la omisión sí es el escritor real.
   */
  guardarModeloGlobal?: Consola["guardarModeloGlobal"];
  /** Adopta el fichero OAuth plano de antes de los entornos. Por omisión, el real. */
  adoptarLegado?: (entorno: Entorno) => void;
  /** El listado de proyectos de un entorno. Ausente = esta ejecución no habla con CloudStudio. */
  proyectosDeEntorno?: (entorno: Entorno) => Promise<Array<{ id: string; nombre: string }>>;
  ramasDeProyecto?: (entorno: Entorno, proyecto: string) => Promise<string[]>;
  sesiones?: PuertoDeSesiones;
  /** Costura de test: por omisión, la consola web de verdad. */
  crearConsola?: (opciones: OpcionesDeConsolaWeb) => ConsolaWeb;
  /** Costura de test: por omisión, `correrConsola`. */
  correr?: typeof correrConsola;
  /**
   * La fábrica del ejecutor REAL (`crearEjecutorReal` de `main.ts`), con la misma forma que
   * consume `cli/tui/correrTui.ts`. Se llama con un aviso de apertura porque el vestíbulo
   * necesita la `SesionReal` para poder CERRARLA al cambiar de proyecto.
   */
  crearEjecutor?: (alAbrirSesion: (sesion: SesionCerrable) => void) => EjecutorDeTurno;
  /** Fuentes del modelo con las que arranca cada consola de proyecto. */
  fuentes?: FuentesDeEleccion;
  /**
   * Lo que la consola de PROYECTO necesita y `consolaWeb` no puede saber: `/sync`, los
   * escritores de config del proyecto, el tema. Depende de la RAÍZ, que no existe hasta
   * que se abre el proyecto, así que entra como función y no como objeto.
   */
  dependenciasDeProyecto?: (raiz: string) => Partial<Consola>;
  /** Plazo de aprobación de las consolas de proyecto; se pasa tal cual a `consolaWeb`. */
  msDeEspera?: number;
}

/** Una consola de proyecto viva. Solo hay una a la vez. */
export interface ConsolaDeProyecto {
  readonly raiz: string;
  /** El id de la sesión, o `undefined` mientras no se haya volcado ningún acto. */
  readonly sesion: string | undefined;
  /**
   * Reabierta y todavía sin turno nuevo. Deja de serlo en el PRIMER turno nuevo, no al
   * primer acto: un `/ayuda` no convierte en presente una conversación que el modelo no
   * recuerda (el hilo vive en un `MemorySaver` que muere con el proceso).
   */
  readonly historica: boolean;
  readonly cerrada: boolean;
  readonly consola: ConsolaWeb;
  /** Un mensaje del navegador. Está aquí para que la ruta HTTP tenga UN solo objeto con
   *  el que hablar; quien decide el fin de la marca histórica es el envoltorio del
   *  ejecutor, no esto — una prosa que llega a mitad de turno solo entra en la cola. */
  recibir(mensaje: MensajeDelCliente): void;
  conectar(enviar?: Sumidero): readonly Acto[];
  desconectar(): void;
  actos(): readonly Acto[];
  cerrar(): Promise<void>;
  /** El retorno de `correrConsola`. Resuelve cuando el lazo termina (EOF o `/salir`). */
  readonly terminada: Promise<number>;
}

export interface Vestibulo {
  /** La consola SIN raíz. Es la que pinta el asistente de cuenta y las preguntas del alta. */
  readonly consola: ConsolaWeb;
  pasosPendientes(): Promise<PasoDelVestibulo[]>;
  opcionesDeEntorno(): readonly OpcionDeEntorno[];
  /** El paso 1, que es `asistenteDeModelo` SIN TOCAR con la consola web detrás. */
  pasoDeCuenta(): Promise<void>;
  guardarCredencialDe(proveedor: Proveedor, clave: string): Promise<{ ruta: string }>;
  registrarEntorno(entorno: Entorno): Promise<{ ruta: string }>;
  proyectosDe(entorno: string): Promise<Array<{ id: string; nombre: string }>>;
  ramasDe(entorno: string, proyecto: string): Promise<string[]>;
  /** El paso 3 completo: escribe el alta y baja la copia local. */
  completarProyecto(eleccion: {
    entorno: string;
    proyecto: string | { id: string; nombre: string };
    rama: string;
  }): Promise<{ raiz: string; ruta: string }>;
  abrirProyecto(apertura: { raiz: string; sesion?: string }): Promise<ConsolaDeProyecto>;
  proyectoAbierto(): ConsolaDeProyecto | undefined;
  /** El usuario se va sin terminar. No escribe nada; DICE lo que ya quedó escrito. */
  cancelar(): Promise<void>;
  /** Cierra el proyecto abierto y el propio vestíbulo. */
  cerrar(): Promise<void>;
}

/**
 * El `config.json` del proyecto, escrito con los escritores que ya existen.
 *
 * El orden importa y `modo` va el ÚLTIMO a propósito: si algo revienta a mitad, lo que
 * queda en disco es un `cloudstudio` sin `modo`, que es exactamente el caso que
 * `crearSincronizador` ya sabe contar («este proyecto no es cloud…»). Al revés dejaría un
 * proyecto declarado cloud sin saber contra qué sincronizar.
 *
 * `entorno` se escribe ADEMÁS de `cloudstudio.url`, nunca en su lugar: conservar la URL es
 * lo que hace literalmente cierto que la sincronización no se toca — `crearSincronizador`
 * y todo lo que cuelga de él la leen igual que hoy.
 */
export function escribirProyectoEnDisco(raiz: string, datos: DatosDeProyecto): { ruta: string } {
  guardarCloudStudioDeProyecto(raiz, datos.url, datos.scopes);
  guardarProyectoCloudStudioDeProyecto(raiz, datos.proyecto);
  guardarRamaDeProyecto(raiz, datos.rama);
  guardarEntornoDeProyecto(raiz, datos.entorno);
  return { ruta: guardarModoDeProyecto(raiz, "cloud").ruta };
}

/**
 * Los dos cables de CloudStudio del vestíbulo, con el id del entorno y la vuelta a la web
 * ya enhebrados.
 *
 * Las dos cosas son deudas que se pagan aquí: sin `entornoId`, un proyecto ya migrado a
 * `webstudio` reautenticaría en un segundo hueco `legado`; y sin `redirigirA`, la página
 * del callback termina diciendo «vuelve a la terminal», que en un navegador es falso.
 */
export function conexionDeVestibulo(urlDeLaWeb?: string): Pick<
  OpcionesDelVestibulo,
  "proyectosDeEntorno" | "ramasDeProyecto"
> {
  const comunes = (entorno: Entorno) => ({
    scopes: entorno.scopes ?? SCOPES_CLOUDSTUDIO_AGENTE,
    entornoId: entorno.id,
    ...(urlDeLaWeb === undefined ? {} : { redirigirA: urlDeLaWeb }),
  });
  return {
    proyectosDeEntorno: async (entorno) => (await conectarCloudStudio(entorno.url, comunes(entorno))).proyectos,
    ramasDeProyecto: async (entorno, proyecto) => {
      const sesion = await sesionCloudStudio(entorno.url, comunes(entorno));
      try {
        const puerto = clienteCloudStudio(sesion.invocar, proyecto);
        await puerto.abrir(proyecto);
        return await puerto.ramas();
      } finally {
        await sesion.cerrar();
      }
    },
  };
}

/** Una URL de entorno tiene que ser HTTPS y sin credenciales, como la de `cloudstudioMcp`. */
function urlDeEntornoValida(valor: string): boolean {
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

export function crearVestibulo(opciones: OpcionesDelVestibulo): Vestibulo {
  const sesiones = opciones.sesiones ?? SESIONES_EN_DISCO;
  const crearConsola = opciones.crearConsola ?? crearConsolaWeb;
  const correr = opciones.correr ?? correrConsola;
  const base = opciones.baseDeWorkspace ?? baseDeWorkspacePorOmision();
  const adoptarLegado =
    opciones.adoptarLegado ??
    // `rutaAuthPorDefecto` y no un `join` propio: el mismo literal en dos ficheros es lo
    // que esta cabecera condena, y `cloudstudioMcp.ts` la exporta justo para esto.
    ((entorno: Entorno) => adoptarLegadoSiProcede(rutaAuthPorDefecto(), entorno));
  const guardarModeloGlobal = opciones.guardarModeloGlobal ?? guardarModeloGlobalEnDisco;

  const consolaDelVestibulo = crearConsola({
    catalogoModelos: opciones.catalogoModelos,
    guardarModeloGlobal,
    ...(opciones.msDeEspera === undefined ? {} : { msDeEspera: opciones.msDeEspera }),
  });

  const informar = opciones.informar ?? ((texto: string) => consolaDelVestibulo.consola.escribir(`${texto}\n`));

  /** Los registrados al arrancar MÁS los que este vestíbulo acaba de dar de alta: el paso 3
   *  llega justo después del 2 y `settings.json` no se vuelve a leer entre medias. */
  const registrados: Entorno[] = [...(opciones.entornos ?? [])];

  /** Lo ya escrito, para que `cancelar()` pueda decirlo en vez de fingir que no pasó nada. */
  let credencialEscrita: { proveedor: Proveedor; ruta: string } | undefined;
  let proyectoEscrito: { raiz: string; ruta: string } | undefined;

  let abierto: ConsolaDeProyecto | undefined;

  const entornoPorId = (id: string): Entorno => {
    const encontrado = registrados.find((e) => e.id === id);
    if (encontrado === undefined) {
      throw new Error(`el entorno «${id}» no está registrado en settings.json`);
    }
    return encontrado;
  };

  /** Escribe la credencial y la RECUERDA, sin decir nada: quien llama decide si lo dice,
   *  porque `asistenteDeModelo` ya lo dice por su cuenta y decirlo dos veces es ruido. */
  const registrarCredencial = (proveedor: Proveedor, clave: string): { ruta: string } => {
    const guardada = opciones.guardarCredencial(proveedor, clave);
    credencialEscrita = { proveedor, ruta: guardada.ruta };
    return guardada;
  };

  const cerrarProyectoAbierto = async (): Promise<void> => {
    if (abierto === undefined) return;
    // Se ESPERA a que el lazo retorne. Dos `correrConsola` vivos sobre el mismo proceso
    // comparten el ejecutor real y se pisarían el hilo.
    await abierto.cerrar();
    abierto = undefined;
  };

  /**
   * La cola de las operaciones que tocan `abierto`.
   *
   * «Una consola de proyecto a la vez» no se sostiene sin serializar: dos `POST` que
   * lleguen a la vez se entrelazan en el `await` de `cerrarProyectoAbierto`, los dos ven
   * `abierto === undefined`, los dos arrancan un `correrConsola` y el primero se queda vivo
   * y sin nadie que lo pueda cerrar nunca. La cola se traga los rechazos —si no, un fallo
   * dejaría la cadena rota para todo lo que venga detrás— y el rechazo de verdad se
   * devuelve sin tragar a quien llamó.
   */
  let cola: Promise<unknown> = Promise.resolve();
  const enCola = <T>(operacion: () => Promise<T>): Promise<T> => {
    const resultado = cola.then(operacion);
    cola = resultado.catch(() => undefined);
    return resultado;
  };

  const abrirDeVerdad = async ({ raiz, sesion }: { raiz: string; sesion?: string }): Promise<ConsolaDeProyecto> => {
    await cerrarProyectoAbierto();

    const reabierta = sesion === undefined ? undefined : sesiones.reabrir(raiz, sesion);
    const consolaWeb = crearConsola({
      catalogoModelos: opciones.catalogoModelos,
      guardarModeloGlobal,
      ...(opciones.msDeEspera === undefined ? {} : { msDeEspera: opciones.msDeEspera }),
    });
    // `Partial<Consola>` sobre el objeto recién creado: lo que depende de la raíz (`/sync`,
    // los escritores del proyecto) no lo puede saber `consolaWeb`, que no conoce ninguna.
    Object.assign(consolaWeb.consola, opciones.dependenciasDeProyecto?.(raiz) ?? {});

    let idSesion = sesion;
    let historica = reabierta?.historica ?? false;
    let cerrada = false;
    let volcados = 0;
    let sesionReal: SesionCerrable | undefined;
    /**
     * Marcado desde que empieza el cierre. Hace falta porque `crearEjecutorReal` avisa de
     * la sesión DESPUÉS de `inspeccionar` y `abrirSesionReal` —segundos en el primer
     * turno—, así que un cierre en esa ventana encontraba `sesionReal` sin definir, no
     * abortaba nada, y el turno seguía corriendo entero sobre un proyecto que el usuario
     * ya había dejado. La sesión que llega tarde se cierra en cuanto se anuncia.
     */
    let cerrando = false;

    /**
     * Vuelca al `.jsonl` los actos nuevos.
     *
     * Se llama en las FRONTERAS de turno y al cerrar, nunca a mitad: durante un turno el
     * último acto de la piel todavía muta (el cierre de una racha de tools SUSTITUYE a su
     * apertura dentro del mismo acto, `core/actos.ts#conLineaDeTool`), y un `.jsonl` que
     * solo sabe anexar guardaría las dos líneas. El coste, medido y asumido: un cierre
     * abrupto a mitad de turno pierde ese turno, no la sesión.
     *
     * La sesión se crea PEREZOSAMENTE, en el primer volcado: un proyecto que se abre y se
     * cierra sin decir nada no deja una sesión vacía en el índice.
     */
    const volcar = (): void => {
      const todos = consolaWeb.actos();
      if (todos.length <= volcados) return;
      if (idSesion === undefined) idSesion = sesiones.crear(raiz);
      for (const acto of todos.slice(volcados)) sesiones.anotar(raiz, idSesion, acto);
      volcados = todos.length;
    };

    const base = opciones.crearEjecutor?.((s) => {
      sesionReal = s;
      if (cerrando) s.cerrar();
    });

    const ejecutarTurno: EjecutorDeTurno = async (peticion, estado, consola) => {
      // El primer turno NUEVO es lo que deja de ser histórica una sesión reabierta.
      // `sesiones.ts` no puede hacerlo —`reabrirSesion` es una lectura pura sin estado
      // entre llamadas—, así que lo hace quien es dueño de la sesión viva, que es esto.
      historica = false;
      try {
        await (base ?? ejecutarTurnoGuionizado)(peticion, estado, consola);
      } finally {
        volcar();
      }
    };

    const terminada = correr(
      consolaWeb.consola,
      {
        hilo: `xonecode-${randomUUID()}`,
        raiz,
        fuentes: opciones.fuentes ?? {},
      },
      ejecutarTurno
    ).finally(() => {
      cerrada = true;
    });
    // Un lazo que revienta sin que nadie espere `terminada` sería un rechazo sin manejar
    // que tumba el proceso. Se cuenta y se sigue: la consola del vestíbulo sigue viva.
    terminada.catch((error: unknown) => {
      informar(`la consola del proyecto terminó con un error: ${error instanceof Error ? error.message : String(error)}`);
    });

    const consolaDeProyecto: ConsolaDeProyecto = {
      raiz,
      get sesion() {
        return idSesion;
      },
      get historica() {
        return historica;
      },
      get cerrada() {
        return cerrada;
      },
      consola: consolaWeb,
      recibir: (mensaje) => consolaWeb.recibir(mensaje),
      // El transcript del cliente lleva PRIMERO lo releído y después lo de esta ejecución.
      // Lo releído no vuelve a pasar por `volcar`: ya está en el `.jsonl`.
      conectar: (enviar) => [...(reabierta?.actos ?? []), ...consolaWeb.conectar(enviar)],
      desconectar: () => consolaWeb.desconectar(),
      actos: () => [...(reabierta?.actos ?? []), ...consolaWeb.actos()],
      cerrar: async () => {
        // El orden es el que evita que cerrar cuelgue: `consolaWeb.cerrar()` pone el EOF,
        // pero `correrConsola` no lo mira hasta que el turno en vuelo devuelve, y un turno
        // en vuelo puede tardar minutos. Abortar la sesión real primero es lo que lo
        // desbloquea — y es para lo que existe `SesionReal.cerrar()`.
        cerrando = true;
        sesionReal?.cerrar();
        consolaWeb.cerrar();
        await terminada.catch(() => 0);
        volcar();
      },
      terminada,
    };
    abierto = consolaDeProyecto;
    return consolaDeProyecto;
  };

  return {
    consola: consolaDelVestibulo,

    async pasosPendientes(): Promise<PasoDelVestibulo[]> {
      const pasos: PasoDelVestibulo[] = [];
      // La MISMA condición que usa `asistenteDeModelo`: si `trabajo` no resolvió por
      // `omision`, alguien eligió (proyecto, global, bandera o entorno) y no se pregunta.
      if (opciones.origenDeTrabajo === "omision") pasos.push("cuenta");
      if (registrados.length === 0) pasos.push("entorno");
      // El proyecto no tiene condición: mientras no haya uno abierto, falta.
      if (abierto === undefined) pasos.push("proyecto");
      return pasos;
    },

    opcionesDeEntorno: () => [...ENTORNOS_OFICIALES, ENTORNO_OTRO],

    async pasoDeCuenta(): Promise<void> {
      // `cli/wizardInicial.ts` NO se toca: se le pasa la consola web y ya está. Si esto
      // necesitara tocarlo, el diseño se habría desviado.
      await asistenteDeModelo(consolaDelVestibulo.consola, {
        origenDeTrabajo: opciones.origenDeTrabajo,
        hayCredencial: opciones.hayCredencial ?? (() => false),
        guardarCredencial: registrarCredencial,
      });
    },

    async guardarCredencialDe(proveedor, clave) {
      const guardada = registrarCredencial(proveedor, clave);
      // Se dice AQUÍ, en el momento: si el usuario cancela el paso siguiente, un
      // «cancelado» a secas daría a entender que no se tocó nada, y la clave ya está en
      // disco. Es la misma frase que escribe `/provider` y el asistente de terminal.
      informar(`credencial de ${proveedor} guardada en ${guardada.ruta}`);
      return guardada;
    },

    async registrarEntorno(entorno) {
      if (!urlDeEntornoValida(entorno.url)) {
        throw new Error("la URL de un entorno debe ser HTTPS y no puede incluir credenciales");
      }
      const guardado = opciones.guardarEntorno(entorno);
      // Justo después de registrar, y no antes: `adoptarLegadoSiProcede` solo actúa si la
      // URL es la oficial por omisión, que es la única que el fichero plano pudo usar.
      adoptarLegado(entorno);
      registrados.push(entorno);
      informar(`entorno «${entorno.id}» registrado en ${guardado.ruta}`);
      return guardado;
    },

    async proyectosDe(entorno) {
      const registrado = entornoPorId(entorno);
      if (opciones.proyectosDeEntorno === undefined) {
        throw new Error("esta ejecución no tiene conexión con CloudStudio");
      }
      return opciones.proyectosDeEntorno(registrado);
    },

    async ramasDe(entorno, proyecto) {
      const registrado = entornoPorId(entorno);
      if (opciones.ramasDeProyecto === undefined) {
        throw new Error("esta ejecución no tiene conexión con CloudStudio");
      }
      return opciones.ramasDeProyecto(registrado, proyecto);
    },

    async completarProyecto({ entorno, proyecto, rama }) {
      const registrado = entornoPorId(entorno);
      // El listado remoto trae `{id, nombre}`; un nombre suelto vale porque en CloudStudio
      // el proyecto se abre POR NOMBRE (`studio_open_project`) y el id solo identifica.
      const identidad = typeof proyecto === "string" ? { id: proyecto, nombre: proyecto } : proyecto;
      const raiz = rutaDeWorkspace(base, registrado.id, identidad.nombre);
      const datos: DatosDeProyecto = {
        entorno: registrado.id,
        url: registrado.url,
        scopes: registrado.scopes ?? SCOPES_CLOUDSTUDIO_AGENTE,
        proyecto: identidad,
        rama,
      };

      // El alta se escribe ENTERA antes de bajar, y no después. No es un descuido: la
      // frase que se dice cuando la descarga falla es «reintenta con /sync bajar», y
      // `/sync` lee del disco el proyecto y la rama — sin el alta escrita, ese consejo
      // sería mentira. «No a medias» significa completa o nada, no «nada».
      const { ruta } = opciones.guardarConfigDeProyecto(raiz, datos);
      proyectoEscrito = { raiz, ruta };
      informar(`proyecto dado de alta en ${ruta}`);

      try {
        await opciones.descargar({ ...datos, raiz });
      } catch (error) {
        const detalle = error instanceof Error ? error.message : String(error);
        informar(`no se pudo descargar el proyecto: ${detalle}`);
        informar(`el alta quedó completa en ${ruta}; reintenta la descarga con «/sync bajar»`);
        // Se propaga: quien llama decide si vuelve al paso de proyecto o abre igualmente
        // la copia vacía. Tragárselo aquí dejaría creer que el proyecto está bajado.
        throw error;
      }
      return { raiz, ruta };
    },

    abrirProyecto: (apertura) => enCola(() => abrirDeVerdad(apertura)),
    proyectoAbierto: () => abierto,

    cancelar: () => enCola(async () => {
      await cerrarProyectoAbierto();
      informar("alta cancelada");
      // Negar lo que ya está en disco sería mentir. Cancelar no BORRA nada: dice qué quedó.
      if (credencialEscrita !== undefined) {
        informar(`la credencial de ${credencialEscrita.proveedor} sigue escrita en ${credencialEscrita.ruta}`);
      }
      if (proyectoEscrito !== undefined) {
        informar(`el alta del proyecto sigue escrita en ${proyectoEscrito.ruta}`);
      }
    }),

    cerrar: () => enCola(async () => {
      await cerrarProyectoAbierto();
      consolaDelVestibulo.cerrar();
    }),
  };
}
