/**
 * El arranque de la consola web: las comprobaciones, el servidor, las RUTAS y el navegador.
 *
 * Vive aquí y no en `cli/main.ts` —que ya pasa de mil líneas— por lo mismo que
 * `cli/tui/correrTui.ts`: el despachador decide QUÉ piel arranca, y la piel se monta en su
 * propia casa. `main.ts` lo carga con un import dinámico, así que `run`, `describe` y
 * cualquier tubería no pagan el vestíbulo entero.
 *
 * **Aquí es donde `registrarRuta` deja de ser código muerto.** `web/servidor/servidor.ts`
 * la exportaba desde la Task 5 y hasta ahora no la llamaba nadie fuera de sus tests: los
 * dos extremos del cable estaban escritos y sin conectar, de modo que la consola web no se
 * podía abrir aunque `decidirPiel` devolviera «web». Las dos rutas son las que el cliente
 * ya pedía (`apps/web/src/conexion.ts`): el SSE de `/eventos` y el `POST /accion`.
 *
 * **A qué consola habla el cable, y por qué se re-adjunta.** El vestíbulo tiene DOS
 * consolas: la suya (sin raíz, la del alta) y la del proyecto abierto. `consolaWeb.eof()`
 * es `!transporte.conectado()`, y sin cliente conectado toda aprobación sale rechazada y
 * todo `preguntar` responde cadena vacía. Si el SSE se quedara enganchado a la consola del
 * vestíbulo después de abrir un proyecto, el usuario vería su transcript y NADA de lo que
 * decidiera llegaría: fail-closed mudo. Por eso al abrir proyecto se desconecta la anterior
 * y se conecta la nueva, con reemisión entera del transcript.
 *
 * **La clave de API no pasa por el mensaje de alta.** El paso de cuenta lo conduce
 * `vestibulo.pasoDeCuenta()` —o sea `cli/wizardInicial.ts#asistenteDeModelo` sin tocar—
 * sobre `seleccionar` y `leerSecreto`, que el cliente ya pinta. Así la clave sigue viajando
 * por el único mensaje del cable que la lleva y, de propina, el asistente elige TAMBIÉN el
 * modelo y lo guarda: un paso de cuenta que solo guardara la credencial dejaría `trabajo`
 * en la omisión (Ollama local) con una clave de Anthropic recién escrita al lado.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Acto } from "../../core/actos.js";
import {
  parsear,
  PROVEEDORES,
  resolver,
  SIN_CREDENCIAL,
  type FuentesDeEleccion,
  type Proveedor,
} from "../../core/modelos.js";
import { COMANDOS, hayCredencial, type Consola, type EjecutorDeTurno } from "../../cli/consola.js";
import { motivoDeClaveInaceptable } from "../../core/config.js";
import {
  aplicarAuth,
  aplicarCredencialAlProceso,
  cargar,
  guardarModeloGlobal,
} from "../../agent/configEnDisco.js";
import { borrarCredencial, guardarCredencial } from "../../agent/authEnDisco.js";
import { cargarSettings, guardarEntorno as guardarEntornoEnDisco } from "../../agent/settingsEnDisco.js";
import { abrirEnSistema } from "../../agent/cloudstudioMcp.js";
import { nombreDePersona } from "../../agent/persona.js";
import { CatalogoModelos } from "../../agent/catalogoModelos.js";
import type { Entorno } from "../../core/settings.js";
import { arrancarServidor, type ServidorWeb } from "./servidor.js";
import {
  conexionDeVestibulo,
  crearVestibulo,
  escribirProyectoEnDisco,
  type OpcionDeEntorno,
  type PasoDelVestibulo,
  type OpcionesDelVestibulo,
  type SesionCerrable,
  type Vestibulo,
} from "./vestibulo.js";
import type { MensajeAlCliente, MensajeDelCliente, Sumidero } from "./transporte.js";

/** Las dos rutas del cable. El cliente las tiene escritas en `apps/web/src/conexion.ts`. */
export const RUTA_EVENTOS = "/eventos";
export const RUTA_ACCION = "/accion";

/** Lo que se sirve: el build del cliente. Tres niveles arriba tanto desde `src/web/servidor/`
 *  como desde `dist/web/servidor/`, que es la disposición que se publica en npm. */
export function raizDelClientePorOmision(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "web", "dist");
}

export const FALTA_EL_BUILD = "falta el build del cliente: ejecuta «npm run build:web»";

/** Tope del cuerpo de `POST /accion`. Generoso para una prosa larga, finito porque el
 *  cuerpo se acumula en memoria y un cliente roto no puede llenarla. */
const TOPE_DE_CUERPO = 1_000_000;

/**
 * El registro de comandos de barra, para el compositor del navegador.
 *
 * Se GENERA recorriendo `COMANDOS` (`cli/consola.ts`), igual que `/ayuda`, la cabecera de
 * stdio y el completador de Tab: una lista escrita a mano se queda vieja en cuanto alguien
 * añade un comando, y el compositor lo sugeriría todo menos el nuevo.
 */
export function comandosDelRegistro(): { nombre: string; descripcion: string }[] {
  return Object.entries(COMANDOS).map(([nombre, c]) => ({ nombre: `/${nombre}`, descripcion: c.descripcion }));
}

/** Lo mínimo que el cable necesita de una consola, la del vestíbulo o la del proyecto. */
interface DestinoDelCable {
  recibir(mensaje: MensajeDelCliente): void;
  conectar(enviar?: Sumidero): readonly Acto[];
  /** Con sumidero se va ESE cliente; sin él, todos (es lo que hace mudarse de consola). */
  desconectar(enviar?: Sumidero): void;
}

export interface OpcionesDeMontaje {
  /** A dónde van los avisos que no caben en el transcript. Por omisión, a ningún sitio. */
  informar?: (texto: string) => void;
  /**
   * ¿Está confirmada la credencial de ese proveedor? Por omisión NADIE la tiene, que es la
   * dirección honesta: decir «puesta» sin haberlo comprobado es pintar un punto verde que
   * no significa nada. Los que no necesitan credencial (`SIN_CREDENCIAL`) no pasan por
   * aquí.
   */
  hayCredencial?: (proveedor: Proveedor) => boolean;
  /** ¿Está esa credencial en `auth.json`? Solo esas se pueden borrar desde la interfaz. */
  credencialEnFichero?: (proveedor: Proveedor) => boolean;
  /**
   * Borra la credencial de `auth.json`. Ausente = esta ejecución no puede borrar, y la
   * interfaz no ofrece el botón en vez de ofrecer uno que no hace nada.
   */
  borrarCredencial?: (proveedor: Proveedor) => { ruta: string; borrada: boolean; quedaEnEntorno: boolean };
  /**
   * Escribe la credencial en `auth.json`. Entra por opción y no se importa aquí por lo
   * mismo que todo lo que toca el disco en este repo: un valor por omisión que escribiera
   * de verdad convertiría cualquier test de este cable en una escritura en el
   * `~/.xonecode` de quien los corre.
   */
  guardarCredencial?: (proveedor: Proveedor, clave: string) => { ruta: string };
  /**
   * El catálogo VIVO de un proveedor. Ausente = esta ejecución no puede consultarlo, y el
   * menú lo dice en vez de quedarse cargando para siempre.
   */
  catalogoDeModelos?: (proveedor: Proveedor) => Promise<{ id: string; nombre?: string }[]>;
}

/**
 * Monta `/eventos` y `/accion` sobre un servidor ya levantado.
 *
 * Separada de `arrancarConsolaWeb` para poder probar el cable entero —conexión, registro
 * de comandos, alta, cambio de proyecto— sin puerto, sin disco y sin navegador: los
 * manejadores se invocan con dobles de petición y respuesta.
 */
export function montarRutas(
  servidor: Pick<ServidorWeb, "registrarRuta">,
  vestibulo: Vestibulo,
  opciones: OpcionesDeMontaje = {}
): void {
  const informar = opciones.informar ?? (() => {});
  const hayCredencialDe = opciones.hayCredencial ?? (() => false);

  /** Los tres estados que se pueden AFIRMAR de una credencial. Ver `ProveedorDeModelos`. */
  const credencialDe = (proveedor: Proveedor): "puesta" | "falta" | "nativa" =>
    SIN_CREDENCIAL.has(proveedor) ? "nativa" : hayCredencialDe(proveedor) ? "puesta" : "falta";

  /**
   * Los clientes vivos. Fue una sola ranura y era un fallo: el último en conectar dejaba
   * mudos a los anteriores sin decírselo —medido con una pestaña local y otra por un túnel—.
   * Emitir es escribirle a todos; el transporte hace lo mismo por su lado.
   */
  const clientes = new Set<Sumidero>();
  /**
   * La consola a la que está ENGANCHADO el cable ahora mismo. No se recalcula al cerrar:
   * hay que desconectar la que se conectó, no la que sea la actual en ese momento — entre
   * medias puede haberse abierto un proyecto.
   */
  let adjunto: DestinoDelCable | undefined;

  /** Lo elegido en el wizard hasta ahora. Ninguno se inventa: sin elección, no hay lista. */
  let entornoElegido: string | undefined;
  let proyectoElegido: string | undefined;
  let proyectos: { id: string; nombre: string }[] = [];
  let ramas: string[] = [];
  /**
   * El paso de cuenta ya conducido en ESTE proceso. Hace falta porque `origenDeTrabajo` se
   * congela al construir el vestíbulo: `pasosPendientes()` seguiría diciendo «cuenta»
   * después de haberla dado, y el wizard volvería a pedirla en cada reconexión.
   *
   * Se marca cuando `pasoDeCuenta()` TERMINA, no cuando se lanza — medido: marcarlo antes
   * de esperar significaba que recargar a mitad del selector (o de teclear la clave) daba
   * por «hecho» un paso que en realidad ni se había contestado ni se iba a volver a
   * ofrecer, y el usuario se quedaba con el modelo por omisión sin que nada se lo dijera.
   */
  /**
   * Si hay turno en vuelo AHORA. Se lleva aquí, además de emitirse, porque quien conecta a
   * mitad de turno tiene que enterarse: el mensaje que lo anunció ya pasó.
   */
  let turnoEnVuelo = false;
  let cuentaHecha = false;
  /**
   * El propio `pasoDeCuenta()` en vuelo, compartido entre conexiones. Sin esto, dos
   * conexiones solapadas (dos pestañas, o la reconexión que llega antes de que la vieja
   * se haya desenganchado del todo) verían las dos `cuentaHecha` en `false` y llamarían
   * a `pasoDeCuenta()` cada una la suya — dos `asistenteDeModelo` a la vez apilando DOS
   * resolutores en la MISMA cola FIFO de `consolaWeb.ts#seleccionar`, de forma que la
   * respuesta de una pestaña resolvería la pregunta de la OTRA. Una sola llamada real,
   * y la segunda conexión se limita a esperar la que ya está en marcha.
   */
  let cuentaEnCurso: Promise<void> | undefined;
  /**
   * Lo que falló en el último paso del alta. Viaja en el propio mensaje del alta porque el
   * fallo pertenece al paso que lo produjo: el acto de sistema que `informar` deja aterriza
   * en la Trayectoria —la otra pestaña—, y el wizard repintaba el mismo paso sin decir nada.
   */
  let aviso: string | undefined;

  const destinoActual = (): DestinoDelCable => vestibulo.proyectoAbierto() ?? vestibulo.consola;

  const emitir = (mensaje: MensajeAlCliente): void => {
    for (const cliente of clientes) cliente(mensaje);
  };

  /**
   * El mensaje de alta: qué falta, y con qué elegirlo.
   *
   * Con proyecto YA abierto no falta nada, y se dice con `pasos` vacío SIN mirar
   * `pasosPendientes()` — es el comportamiento de siempre (el atajo de `--guion` sobre un
   * proyecto offline, por ejemplo, abre directo y nunca debería enseñar el alta, tenga o
   * no cuenta/entorno resueltos) y no algo que este cambio deba tocar.
   *
   * Cambio de rumbo del usuario, para cuando NO hay proyecto abierto: el paso de proyecto
   * salió del alta, así que `pasos` sale DIRECTO de `pasosPendientes()` —que ya nunca
   * incluye «proyecto»— en vez de esperar a que se abra uno. Antes de este cambio
   * `pasos: []` solo pasaba con un proyecto abierto, y el cliente usaba esa implicación
   * para pintar la maqueta completa; ahora también pasa sin proyecto (con cuenta y
   * entorno resueltos), así que la implicación ya no basta y `proyectoAbierto` viaja
   * aparte (`transporte.ts` lo documenta) para que el cliente sepa si esperar una
   * elección en la barra o pintar la sesión de verdad.
   *
   * «cuenta» NO se anuncia nunca al wizard: ese paso lo conduce `conducirCuenta` sobre el
   * selector y el secreto, que es lo que mantiene la clave en su único mensaje y lo que
   * hace que se elija TAMBIÉN el modelo. El wizard sigue sabiendo pintarlo por si otra
   * piel se lo manda; esta no.
   */
  const anunciarAlta = async (): Promise<void> => {
    const abierto = vestibulo.proyectoAbierto();
    const proyectoAbierto = abierto !== undefined;
    // Se lee del disco EN CADA anuncio y no se cachea al abrir: `configurarModoInicial`
    // puede escribirlo después de abrir (el alta de un proyecto cloud), y una copia
    // tomada antes se quedaría diciendo lo de antes.
    const modo = abierto === undefined ? undefined : modoDeProyecto(abierto.raiz);
    // CUÁL es el abierto, deducido de su raíz: la que le tocaría a cada proyecto de la
    // lista se calcula con la misma función que la creó. Guardar el id aparte al abrirlo
    // sería una segunda fuente de verdad que se queda vieja el día que alguien abra por
    // otro camino.
    // El `entorno` se copia a una constante porque TypeScript no puede saber que
    // `entornoElegido` —una variable del cierre, que otro mensaje puede cambiar— sigue
    // definida dentro del callback.
    const entorno = entornoElegido;
    const activo =
      abierto === undefined || entorno === undefined
        ? undefined
        : proyectos.find((p) => {
            try {
              return vestibulo.raizDeProyecto(entorno, p.nombre) === abierto.raiz;
            } catch {
              return false;
            }
          })?.id;
    const pendientes = proyectoAbierto ? [] : await vestibulo.pasosPendientes();
    const pasos: PasoDelVestibulo[] = pendientes.includes("entorno") ? ["entorno"] : [];
    emitir({
      clase: "alta",
      pasos,
      proveedores: PROVEEDORES.map((p) => ({ id: p, nombre: p })),
      entornos: [...vestibulo.opcionesDeEntorno()],
      // Los registrados de verdad, además de los ofrecidos: la ventana de ajustes los
      // lista, y la barra lateral llevaba enseñando la lista OFRECIDA como si fuera ésta.
      registrados: vestibulo.entornosRegistrados().map((e) => ({
        id: e.id,
        nombre: e.nombre,
        url: e.url,
        // Solo si el entorno lo dice: ausente es «no lo he elegido», y el cliente aplica su
        // omisión. Mandar `[]` en su lugar sería decir «ninguno», que es otra cosa.
        ...(e.proyectos === undefined ? {} : { proyectos: [...e.proyectos] }),
      })),
      // Cada proyecto con las sesiones de su copia local. Se recalcula en cada anuncio: una
      // sesión nueva aparece en cuanto se abre, sin que nadie recargue.
      proyectos: proyectos.map((p) => {
        const sesiones = entornoElegido === undefined ? [] : sesionesDelProyecto(p.nombre);
        return {
          ...p,
          ...(sesiones.length === 0 ? {} : { sesiones }),
          // Si ya está bajado, abrirlo no necesita ni rama ni descarga: es lo que decide
          // qué enseña la ventana de sesión nueva, y decidirlo en el cliente exigiría
          // que supiera dónde vive la copia local.
          ...(hayCopiaLocal(p.nombre) ? { local: true } : {}),
        };
      }),
      ramas,
      proyectoAbierto,
      ...(modo === undefined ? {} : { modo }),
      ...(entornoElegido === undefined ? {} : { entornoActivo: entornoElegido }),
      ...(activo === undefined ? {} : { proyectoActivo: activo }),
      ...(abierto?.sesion === undefined ? {} : { sesionActiva: abierto.sesion }),
      ...(vestibulo.nombre === undefined ? {} : { nombre: vestibulo.nombre }),
      ...(aviso === undefined ? {} : { aviso }),
    });
  };

  /**
   * Los catálogos ya consultados en ESTE proceso, por proveedor. Se guardan porque cada
   * uno es una llamada de red: abrir el menú dos veces no la repite. Un fallo también se
   * recuerda —como fallo— hasta que alguien lo vuelva a pedir a propósito.
   */
  const catalogos = new Map<string, { modelos?: { id: string; nombre?: string }[]; error?: string }>();

  /**
   * El estado de modelos: qué está en vigor y qué se puede elegir.
   *
   * `actual` sale del estado de sesión de la consola ABIERTA y de ningún sitio más. Sin
   * proyecto abierto no hay sesión y por tanto no hay modelo que afirmar: el campo se va
   * y el cliente pinta «Elige modelo» en vez de una fila muerta.
   */
  const emitirModelos = (): void => emitir(mensajeDeModelos());

  /** El mensaje de modelos, compuesto pero sin mandar: `adjuntar` se lo da SOLO al cliente
   *  que acaba de llegar, y el resto de sitios lo emite a todos. */
  const mensajeDeModelos = (): MensajeAlCliente => {
    const abierto = vestibulo.proyectoAbierto();
    const trabajo = abierto === undefined ? undefined : resolver(abierto.estadoDeSesion.fuentes).trabajo;
    return {
      clase: "modelos",
      ...(trabajo === undefined ? {} : { actual: `${trabajo.proveedor}/${trabajo.modelo}` }),
      proveedores: PROVEEDORES.map((p) => ({
        id: p,
        credencial: credencialDe(p),
        // Solo se marca lo que se puede afirmar: sin puerto para mirarlo, no se dice que
        // esté en el fichero (y la interfaz no ofrecerá borrarla).
        ...(opciones.credencialEnFichero?.(p) === true && opciones.borrarCredencial !== undefined
          ? { enFichero: true }
          : {}),
        ...(catalogos.get(p) ?? {}),
      })),
    };
  };

  /**
   * Engancha el cable a la consola que toque, con el transcript entero por delante.
   *
   * **La invariante es que TODOS los clientes vivos están registrados en `adjunto`**, y por
   * eso hay dos casos y no uno:
   *
   * - Llega un cliente nuevo (`recien`): se registra ÉL en la consola actual y la ráfaga
   *   —transcript, comandos, modelos— es suya sola. Mandársela a todos repetiría el
   *   transcript en las pestañas que ya lo tienen.
   * - Cambia la consola (se abre un proyecto): se registran TODOS los clientes en la nueva
   *   y la ráfaga va a todos, porque todos cambian de transcript.
   *
   * Registrar solo al recién llegado en el primer caso y a nadie en el segundo fue un fallo
   * MEDIDO: al abrir un proyecto, la consola nueva se quedaba sin ningún sumidero, así que
   * el turno corría —el agente trabajaba de verdad— y no salía nada por pantalla. Escribir
   * y que no pasara nada.
   */
  const adjuntar = (recien?: Sumidero): void => {
    const destino = destinoActual();
    const cambiaDeConsola = adjunto !== destino;
    if (adjunto !== undefined && cambiaDeConsola) adjunto.desconectar();
    adjunto = destino;

    // A quién hay que registrar y a quién hay que darle la ráfaga: al recién llegado, o a
    // todos si lo que cambió fue la consola.
    const destinatarios = recien !== undefined ? [recien] : cambiaDeConsola ? [...clientes] : [];
    let actos: readonly Acto[] = destino.conectar();
    for (const cliente of destinatarios) actos = destino.conectar(cliente);

    const modelos = mensajeDeModelos();
    for (const cliente of destinatarios) {
      // El orden importa: primero el transcript, luego lo que el compositor necesita para
      // sugerir, y al final el estado de modelos que pinta su disparador. Al reconectar se
      // manda entero: el cliente tira sus proyecciones al caerse el SSE
      // (`store.ts#marcarDesconectado`), así que hay que repoblarlas.
      cliente({ clase: "reemision", actos: [...actos] });
      cliente({ clase: "comandos", comandos: comandosDelRegistro() });
      cliente(modelos);
      // Y si hay turno corriendo, se dice: quien conecta a mitad no vio el mensaje que lo
      // anunció, y sin esto vería el compositor encendido y sin borde —«no pasa nada»—
      // mientras lo que escribiera se quedaba en la cola.
      cliente({ clase: "turno", activo: turnoEnVuelo });
    }
  };

  /**
   * El paso de cuenta, conducido por el asistente de siempre sobre esta consola. Se lanza
   * suelto (no se espera) porque el manejador del SSE tiene que devolver para que el
   * navegador reciba las preguntas que este asistente va a emitir.
   */
  const conducirCuenta = async (porPeticion = false): Promise<void> => {
    const pendientes = await vestibulo.pasosPendientes();
    // Que este alta NO conduzca el modelo es distinto de que ya esté conducido: lo primero
    // pasa cuando el modelo viene de fuera (una bandera, la config global) y entonces no
    // hay nada que volver a preguntar. Callarlo dejaría un botón «Modelo ✓» que al pulsarlo
    // no hace nada — el fallo mudo de siempre.
    const noProcede = !pendientes.includes("cuenta") || vestibulo.proyectoAbierto() !== undefined;
    if (noProcede && porPeticion) {
      aviso =
        "el modelo de esta sesión no lo decide el alta: viene de una bandera o de la configuración. Cámbialo con «/modelo» cuando entres.";
      informar(aviso);
    }
    if (noProcede || cuentaHecha) return;
    if (cuentaEnCurso === undefined) {
      cuentaEnCurso = vestibulo
        .pasoDeCuenta()
        .then((resultado) => {
          // «Hecho» solo si de verdad se resolvió. `cancelado` es lo que devuelve el
          // asistente cuando ya no queda nadie a quien preguntar —con `exigirEleccion`
          // no sale por cancelar, solo por `eof()`—, o sea el silencio de una pestaña
          // que se fue a mitad del selector: la SIGUIENTE conexión tiene que poder
          // intentarlo de verdad, no heredar un «ya se preguntó» que nadie contestó.
          //
          // `sin-preguntar` SÍ cuenta como hecho: significa que no había nada que
          // preguntar (la piel no tiene selector, o ya había elección). Tratarlo como
          // pendiente dejaría fuera para siempre a quien no puede contestar.
          if (resultado !== "cancelado") cuentaHecha = true;
        })
        .finally(() => {
          cuentaEnCurso = undefined;
        });
    }
    await cuentaEnCurso;
  };

  const contar = (error: unknown): void => {
    informar(error instanceof Error ? error.message : String(error));
  };

  /**
   * Quien entra DIRECTO al Dashboard (las tres condiciones ya cumplidas) se salta el paso
   * "entorno" del wizard entero, y con él la única línea que hasta ahora rellenaba
   * `proyectos` (`atenderAlta`, más abajo). Sin esto la barra se quedaba con "Sin
   * proyectos que enseñar aquí todavía" aunque el entorno estuviera registrado de sobra —
   * la puerta que se acaba de abrir dejaba al usuario dentro y sin nada que hacer, peor
   * que el wizard que se quitó. Se resuelve el PRIMERO de `entornosRegistrados()`: la
   * misma asunción que ya hace `App.tsx` del lado cliente para `entornoActivo`, con el
   * mismo motivo — no hay señal de «cuál es el activo» cuando hay más de uno registrado.
   *
   * `entornoElegido` SOLO se fija si `proyectosDe` sale bien: con un token muerto sin
   * refresco o la red caída, la siguiente reconexión tiene que poder reintentarlo, no
   * heredar un «ya se intentó» que se quedó en `proyectos: []` para siempre. Esto puede
   * abrir el navegador de verdad si el token necesita reautenticar —`conectarCloudStudio`
   * ya lo hace así—, y es lo correcto: un token vivo no toca el puerto de callback en
   * absoluto (arreglado en `agent/cloudstudioMcp.ts#abrirCliente`), así que dos conexiones
   * seguidas no chocan por intentarlo cada una.
   */
  const poblarProyectosSiProcede = async (): Promise<void> => {
    if (vestibulo.proyectoAbierto() !== undefined) return;
    if (entornoElegido !== undefined) return;
    const [primero] = vestibulo.entornosRegistrados();
    if (primero === undefined) return;
    try {
      proyectos = await vestibulo.proyectosDe(primero.id);
      entornoElegido = primero.id;
    } catch (error) {
      aviso = error instanceof Error ? error.message : String(error);
      contar(error);
    }
  };

  /**
   * «Dime qué sirve este proveedor.» Una llamada de red por proveedor, cacheada, y el
   * fallo de uno se guarda como suyo: el menú lo lista inservible y los demás siguen
   * elegibles. Nunca lanza — quien pide un catálogo no puede tumbar el cable.
   */
  const atenderCatalogo = async (proveedor: string): Promise<void> => {
    if (!(PROVEEDORES as readonly string[]).includes(proveedor)) return;
    const id = proveedor as Proveedor;
    if (opciones.catalogoDeModelos === undefined) {
      catalogos.set(id, { error: "esta ejecución no puede consultar catálogos de modelos" });
      emitirModelos();
      return;
    }
    try {
      const modelos = await opciones.catalogoDeModelos(id);
      catalogos.set(id, { modelos: modelos.map((m) => ({ id: m.id, ...(m.nombre === undefined ? {} : { nombre: m.nombre }) })) });
    } catch (error) {
      // `ErrorCatalogoModelos` es publicable por contrato: nunca lleva la clave ni el
      // cuerpo remoto (`agent/catalogoModelos.ts`).
      catalogos.set(id, { error: error instanceof Error ? error.message : String(error) });
    }
    emitirModelos();
  };

  /**
   * Las sesiones guardadas de un proyecto de este entorno. Sin entorno elegido no hay raíz
   * que calcular, y sin copia local la lista es vacía — que es la verdad, no un fallo.
   */
  const sesionesDelProyecto = (nombre: string): { id: string; titulo: string }[] => {
    if (entornoElegido === undefined) return [];
    try {
      return vestibulo.sesionesDe(vestibulo.raizDeProyecto(entornoElegido, nombre));
    } catch {
      return [];
    }
  };

  /** ¿Existe ya la copia local de ese proyecto? Es `.xonecode/config.json` en su raíz: lo
   *  que `completarProyecto` escribe ENTERO antes de bajar nada. */
  const hayCopiaLocal = (nombre: string): boolean => {
    if (entornoElegido === undefined) return false;
    try {
      return existsSync(join(vestibulo.raizDeProyecto(entornoElegido, nombre), ".xonecode", "config.json"));
    } catch {
      return false;
    }
  };

  /**
   * Cambiar de entorno activo: el de cuyos proyectos se habla. Trae su listado consigo
   * —eso es una conexión con CloudStudio— y limpia lo del anterior: dejar los proyectos del
   * entorno viejo bajo el nombre del nuevo sería la peor mentira posible en esta barra.
   */
  const atenderEntornoActivo = async (entorno: string): Promise<void> => {
    aviso = undefined;
    try {
      const nuevos = await vestibulo.proyectosDe(entorno);
      entornoElegido = entorno;
      proyectoElegido = undefined;
      ramas = [];
      proyectos = nuevos;
    } catch (error) {
      // `entornoElegido` NO se toca si falla: con un token muerto o la red caída, seguir
      // enseñando lo del entorno anterior es la verdad, y el aviso dice qué pasó.
      aviso = error instanceof Error ? error.message : String(error);
      contar(error);
    } finally {
      await anunciarAlta().catch(contar);
    }
  };

  /**
   * Abrir una sesión: la nombrada, o una nueva.
   *
   * Con copia local ya bajada no hay nada que dar de alta —ni rama que preguntar—, así que
   * se abre directamente y el cable se muda a su consola. Sin copia local se cae al camino
   * del alta, que es el único que sabe bajarla: se contestan las ramas y el cliente elige.
   */
  const atenderSesion = async (peticion: Extract<MensajeDelCliente, { clase: "sesion" }>): Promise<void> => {
    aviso = undefined;
    try {
      if (entornoElegido === undefined) {
        aviso = "elige antes el entorno del que sale el proyecto";
        informar(aviso);
        return;
      }
      const identidad = proyectos.find((p) => p.id === peticion.proyecto);
      const nombre = identidad?.nombre ?? peticion.proyecto;
      const raiz = vestibulo.raizDeProyecto(entornoElegido, nombre);
      if (!existsSync(join(raiz, ".xonecode", "config.json"))) {
        // Todavía no está bajado: el alta es quien sabe hacerlo, y necesita la rama.
        proyectoElegido = peticion.proyecto;
        // La identidad ENTERA, no el id: el servidor abre por nombre. `identidad` ya está
        // resuelta unas líneas más arriba contra el listado.
        ramas = await vestibulo.ramasDe(entornoElegido, identidad ?? peticion.proyecto);
        return;
      }
      await vestibulo.abrirProyecto({ raiz, ...(peticion.sesion === undefined ? {} : { sesion: peticion.sesion }) });
      // El cable se muda a la consola del proyecto, como en el alta: sin esto el usuario
      // mira un transcript vivo cuyas aprobaciones se rechazan solas al otro lado.
      adjuntar();
    } catch (error) {
      aviso = error instanceof Error ? error.message : String(error);
      contar(error);
    } finally {
      await anunciarAlta().catch(contar);
    }
  };

  /**
   * «Ponme este modelo.»
   *
   * Lo que llega del cliente es la intención —`proveedor/modelo`— y no un comando: la
   * interfaz no habla en la sintaxis de otra piel ni se apunta actos de usuario que nadie
   * tecleó. Aplicarlo SÍ reusa el manejador de `/modelo` (`COMANDOS`, `cli/consola.ts`),
   * porque la precedencia entre banderas, ficheros y elecciones en caliente vive ahí y una
   * segunda implementación divergiría el primer día. Se encola la línea en el lazo, que es
   * el único que puede adoptar el estado nuevo, y el acuse que escribe el manejador es lo
   * que el usuario ve.
   *
   * Sin proyecto abierto no hay lazo, y se dice: el disparador vive en el compositor, que
   * solo existe con sesión, pero un mensaje que llegara igual no puede quedarse en una cola
   * que nadie lee.
   */
  const atenderModelo = (id: string): void => {
    try {
      parsear(id);
    } catch (error) {
      informar(error instanceof Error ? error.message : String(error));
      return;
    }
    const abierto = vestibulo.proyectoAbierto();
    if (abierto === undefined) {
      informar("no hay ninguna sesión abierta a la que cambiarle el modelo");
      return;
    }
    abierto.consola.encolar(`/modelo ${id}`);
  };

  /**
   * Pide la clave de un proveedor y la guarda, con la MISMA disciplina que el asistente de
   * cuenta: la criba de balde primero (`motivoDeClaveInaceptable`), y nada se escribe si no
   * pasa. La pregunta sale por la consola a la que está enganchado el cable —la del
   * proyecto si hay uno, la del vestíbulo si no—, así que llega como `clase: "secreto"` y
   * la clave vuelve por ese mismo mensaje y por ninguno más.
   *
   * Lo que NO se hace aquí es probarla contra el catálogo antes de escribir, como sí hace
   * el alta: ahí la elección de modelo obliga a listar de todos modos, y aquí el usuario
   * puede estar poniendo la clave de un proveedor que no va a usar todavía. El menú del
   * compositor la probará cuando toque, y su error se enseña donde se elige.
   */
  const pedirCredencial = async (proveedor: Proveedor): Promise<void> => {
    if (opciones.guardarCredencial === undefined) {
      informar("esta ejecución no puede guardar credenciales");
      return;
    }
    const consola = vestibulo.proyectoAbierto()?.consola.consola ?? vestibulo.consola.consola;
    const clave = (await consola.leerSecreto(`clave de ${proveedor}: `)).trim();
    // Cadena vacía es lo que responde una consola sin nadie al otro lado, y también el
    // usuario que da a Enter sin escribir: en los dos casos no se guarda nada y no se dice
    // nada más — quien canceló no necesita un sermón.
    if (clave === "") return;
    const motivo = motivoDeClaveInaceptable(clave);
    if (motivo !== undefined) {
      informar(`no se guardó nada: ${motivo}`);
      return;
    }
    try {
      const { ruta } = opciones.guardarCredencial(proveedor, clave);
      informar(`credencial de ${proveedor} guardada en ${ruta}`);
    } catch (error) {
      informar(error instanceof Error ? error.message : String(error));
    }
    emitirModelos();
  };

  /**
   * Borrar una credencial. Se DICE lo que pasó por el transcript —incluido el caso en que
   * el fichero ya no la tenía— y se reemite el estado de modelos, que es lo que repinta el
   * punto. Si la variable de entorno la sigue llevando, eso también se dice: el punto se
   * quedará verde y callarlo parecería un fallo del botón.
   */
  const atenderCredencial = (mensaje: Extract<MensajeDelCliente, { clase: "credencial" }>): void => {
    if (!(PROVEEDORES as readonly string[]).includes(mensaje.proveedor)) return;
    const proveedor = mensaje.proveedor as Proveedor;
    if (mensaje.accion === "pedir") {
      void pedirCredencial(proveedor).catch(contar);
      return;
    }
    if (opciones.borrarCredencial === undefined) {
      informar("esta ejecución no puede borrar credenciales");
      return;
    }
    try {
      const { ruta, borrada, quedaEnEntorno } = opciones.borrarCredencial(proveedor);
      informar(
        borrada
          ? `credencial de ${proveedor} borrada de ${ruta}`
          : `${proveedor} no tenía credencial en ${ruta}`
      );
      if (quedaEnEntorno) {
        informar(`ojo: ${proveedor} sigue con credencial puesta por una variable de entorno`);
      }
    } catch (error) {
      informar(error instanceof Error ? error.message : String(error));
    }
    emitirModelos();
  };

  /** Un paso del alta resuelto en el navegador. Cada rama termina volviendo a anunciar. */
  const atenderAlta = async (mensaje: Extract<MensajeDelCliente, { clase: "alta" }>): Promise<void> => {
    // Se limpia al empezar: un aviso viejo pegado a un paso que ya salió bien mentiría.
    aviso = undefined;
    try {
      if (mensaje.paso === "cuenta") {
        // Volver al paso de modelo desde la progresión del alta. Se re-arma `cuentaHecha`
        // —lo que impide preguntar dos veces es justo esa marca— y se relanza el asistente
        // SUELTO: pintarlo es cosa suya (`selector` y `secreto`), y el `POST` no puede
        // quedarse abierto mientras un humano elige. Cuando termine, `anunciarAlta` cuenta
        // cómo quedó todo.
        cuentaHecha = false;
        void conducirCuenta(true)
          .catch(contar)
          .finally(() => void anunciarAlta().catch(contar));
        return;
      }
      if (mensaje.paso === "entorno") {
        const elegido = mensaje.entorno;
        if (elegido === undefined || elegido.url.trim() === "") {
          aviso = "el entorno necesita una URL";
          informar(aviso);
          return;
        }
        // SIEMPRE se registra, aunque el entorno ya esté en la lista. La versión anterior
        // se lo saltaba comparando contra `opcionesDeEntorno()`, que es la lista OFRECIDA
        // (los dos oficiales más «otro») y no la registrada: con un `settings.json` recién
        // nacido, elegir WebStudio casaba con el oficial, no se registraba nada, y el
        // `proyectosDe` siguiente moría con «el entorno no está registrado». Registrar dos
        // veces no cuesta nada: en disco `guardarEntorno` sustituye por id y en memoria el
        // vestíbulo hace lo mismo.
        // El id con el que quedó REGISTRADO, no el que llegó: el formulario solo pide la
        // URL, y de un «otro» el vestíbulo deduce id y nombre del host
        // (`identidadDeEntorno`). Con el id de la lista, el `proyectosDe` de la línea
        // siguiente moriría con «el entorno «otro» no está registrado».
        const { entorno: registrado } = await vestibulo.registrarEntorno({
          id: elegido.id,
          nombre: elegido.nombre,
          url: elegido.url,
        });
        entornoElegido = registrado.id;
        proyectoElegido = undefined;
        ramas = [];
        proyectos = await vestibulo.proyectosDe(registrado.id);
        return;
      }

      if (entornoElegido === undefined) {
        aviso = "elige antes el entorno del que sale el proyecto";
        informar(aviso);
        return;
      }
      const proyecto = mensaje.proyecto;
      if (proyecto === undefined || proyecto === "") {
        aviso = "el paso de proyecto necesita un proyecto";
        informar(aviso);
        return;
      }
      if (mensaje.rama === undefined || mensaje.rama === "") {
        // Sin rama todavía no se abre nada: se contestan las ramas de ese proyecto. Es la
        // alternativa a inventarse las del primero de la lista antes de que nadie elija.
        proyectoElegido = proyecto;
        // Igual que arriba: el servidor abre por NOMBRE, y el cable trae el id.
        ramas = await vestibulo.ramasDe(entornoElegido, proyectos.find((p) => p.id === proyecto) ?? proyecto);
        return;
      }
      // El proyecto que viene en ESTE mensaje, no el cacheado: lo enviado es la verdad y
      // `proyectoElegido` puede haberse quedado atrás.
      const identidad = proyectos.find((p) => p.id === proyecto) ?? proyecto;
      const { raiz } = await vestibulo.completarProyecto({
        entorno: entornoElegido,
        proyecto: identidad,
        rama: mensaje.rama,
      });
      await vestibulo.abrirProyecto({ raiz });
      // El cable se muda a la consola del proyecto. Sin esto el usuario mira un transcript
      // vivo cuyas aprobaciones se rechazan solas al otro lado. `adjuntar` reemite también
      // el estado de modelos, que hasta ahora no tenía `actual` que dar: sin sesión abierta
      // no hay modelo en vigor.
      adjuntar();
    } catch (error) {
      // El aviso se fija ANTES de anunciar: el `finally` de abajo es quien lo lleva al paso.
      aviso = error instanceof Error ? error.message : String(error);
      contar(error);
    } finally {
      await anunciarAlta().catch(contar);
    }
  };

  // El modelo en vigor cambia DENTRO del lazo de la consola (`/modelo` y `/modelos` no
  // tocan disco), así que la única forma de enterarse es que el vestíbulo lo diga. Sin
  // esto, el disparador del compositor seguiría enseñando el modelo con el que se abrió la
  // sesión después de haberlo cambiado — una cifra con forma de verdad.
  vestibulo.alCambiarEstadoDeSesion(() => emitirModelos());
  // El turno se emite solo (`consolaWeb.turno`), pero además hay que RECORDARLO: una pestaña
  // que conecta a mitad no vio ese mensaje, y necesita saberlo para apagar su compositor.
  vestibulo.alCambiarTurno((activo) => {
    turnoEnVuelo = activo;
  });

  servidor.registrarRuta("GET", RUTA_EVENTOS, (peticion, respuesta) => {
    respuesta.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Sin esto un proxy intermedio bufferiza el stream y el transcript llega a tirones.
      "X-Accel-Buffering": "no",
    });
    const sumidero: Sumidero = (mensaje) => {
      // El socket se puede haber ido entre el último acto y este: escribir en él lanza, y
      // ese lanzamiento subiría por el emisor del acto hasta el motor de turno.
      try {
        respuesta.write(`data: ${JSON.stringify(mensaje)}\n\n`);
      } catch {
        /* el cliente se fue; el `close` de abajo ya desconecta */
      }
    };
    clientes.add(sumidero);
    // Un comentario SSE abre el stream de verdad: sin nada escrito, algunos navegadores no
    // disparan `onopen` hasta el primer dato.
    respuesta.write(": xonecode\n\n");
    adjuntar(sumidero);
    // ANTES de `conducirCuenta()`, no después: el nombre ya está resuelto (es local, no
    // depende de ninguna cuenta) y el paso de cuenta puede tardar lo que tarde un humano
    // en elegir modelo y teclear una clave. Mandarlo solo dentro de `alta` —al final de
    // TODO esto— dejaba el saludo en «Hola» a secas mientras tanto (`transporte.ts`
    // documenta la medida).
    // Solo al recién llegado: los demás ya recibieron su saludo al conectar.
    sumidero({ clase: "bienvenida", ...(vestibulo.nombre === undefined ? {} : { nombre: vestibulo.nombre }) });
    void conducirCuenta()
      .catch(contar)
      .then(() => poblarProyectosSiProcede())
      .finally(() => void anunciarAlta().catch(contar));

    peticion.on("close", () => {
      // Se va ESTE cliente, no «el cliente». La guarda de antes (`enviar !== sumidero`)
      // existía porque el `close` de una pestaña recargada puede llegar DESPUÉS de que el
      // SSE nuevo se enganche, y con una sola ranura eso desconectaba al recién llegado;
      // con un conjunto, quitar el suyo es exacto y esa carrera desaparece.
      clientes.delete(sumidero);
      // Y la consola solo se da por sola cuando se va el ÚLTIMO: el transporte lo decide
      // mirando sus sumideros. Cortar a la primera baja rechazaría la aprobación que otra
      // pestaña todavía tiene delante.
      adjunto?.desconectar(sumidero);
      if (clientes.size === 0) adjunto = undefined;
    });
  });

  servidor.registrarRuta("POST", RUTA_ACCION, async (peticion, respuesta) => {
    let mensaje: MensajeDelCliente;
    try {
      mensaje = JSON.parse(await leerCuerpo(peticion)) as MensajeDelCliente;
    } catch {
      // Cuerpo ilegible o demasiado grande. NO se devuelve nada de lo recibido: por aquí
      // pasa la clave de API del paso de cuenta, y un eco la dejaría en el log del cliente.
      respuesta.writeHead(400);
      respuesta.end();
      return;
    }
    if (
      typeof mensaje === "object" &&
      mensaje !== null &&
      mensaje.clase === "entorno" &&
      mensaje.accion === "activo"
    ) {
      void atenderEntornoActivo(mensaje.entorno);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (
      typeof mensaje === "object" &&
      mensaje !== null &&
      mensaje.clase === "entorno" &&
      mensaje.accion === "visibles"
    ) {
      void vestibulo
        .guardarProyectosVisibles(mensaje.entorno, mensaje.proyectos)
        .catch(contar)
        .finally(() => void anunciarAlta().catch(contar));
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "cancelar") {
      // Parar ESTE turno, no cerrar la conversación. Sin proyecto abierto no hay turno que
      // parar y se dice: un botón que no puede cumplir no puede callar.
      const abierto = vestibulo.proyectoAbierto();
      if (abierto === undefined || !abierto.cancelarTurno()) {
        informar("no hay ningún turno en vuelo que parar");
      }
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "sesion") {
      // Suelto: abrir un proyecto arranca una consola entera y el `POST` no se queda
      // esperando. Lo que pase se cuenta por el cable.
      void atenderSesion(mensaje);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "modelo") {
      atenderModelo(mensaje.id);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "credencial") {
      atenderCredencial(mensaje);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "catalogo") {
      // Suelto, como el alta: consultar un catálogo es una petición de red y el `POST` no
      // se queda abierto esperándola. La respuesta viaja por el SSE.
      void atenderCatalogo(mensaje.proveedor).catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "alta") {
      // Suelto y sin esperar: el alta hace dos viajes a CloudStudio y una descarga entera,
      // y el `POST` no puede quedarse abierto minutos. Lo que pase se cuenta por el cable.
      void atenderAlta(mensaje);
    } else {
      destinoActual().recibir(mensaje);
    }
    respuesta.writeHead(204);
    respuesta.end();
  });
}

async function leerCuerpo(peticion: IncomingMessage): Promise<string> {
  const trozos: Buffer[] = [];
  let total = 0;
  for await (const trozo of peticion) {
    const buffer = Buffer.from(trozo as Buffer);
    total += buffer.length;
    if (total > TOPE_DE_CUERPO) throw new Error("cuerpo demasiado grande");
    trozos.push(buffer);
  }
  return Buffer.concat(trozos).toString("utf8");
}

export interface OpcionesDeArranque {
  puerto: number;
  abrir: boolean;
  cwd: string;
  /** `--guion`: el agente de pega también en la web, para verla correr sin gastar. */
  guion?: boolean;
  /**
   * `--anfitrion <host>`: un nombre EXTRA que el servidor acepta en la cabecera `Host`,
   * para servir a través de un túnel (ngrok, Tailscale) que apunte a este proceso.
   *
   * Sin esto, un túnel recibe 403 en todas las peticiones y hace bien: la comprobación de
   * `Host` es la única defensa contra el DNS rebinding. Abrirla es una decisión, se pide a
   * mano, y se DICE al arrancar — detrás de esta puerta hay un agente que escribe ficheros
   * en el disco del usuario.
   */
  anfitrion?: string;
  /**
   * La fábrica del ejecutor real (`cli/main.ts#crearEjecutorReal`). Entra por parámetro y
   * no se importa: `cli/main.ts` ya carga este módulo, e importarlo de vuelta sería un
   * ciclo entre el despachador y la piel que monta.
   */
  crearEjecutor?: (alAbrirSesion: (sesion: SesionCerrable) => void) => EjecutorDeTurno;
  /** Lo que la consola de proyecto necesita y depende de la raíz (`/sync`, los escritores). */
  dependenciasDeProyecto?: (raiz: string) => Partial<Consola>;
  /** Costuras de test: nada de esto toca disco, red ni navegador cuando se inyecta. */
  raizDelCliente?: string;
  escribir?: (texto: string) => void;
  abrirNavegador?: (url: URL) => void;
  crearServidor?: typeof arrancarServidor;
  vestibulo?: Vestibulo;
  /** Cuándo termina. Por omisión, con la primera señal de interrupción. */
  esperarCierre?: () => Promise<void>;
}

/**
 * Levanta la consola web y se queda. Devuelve el código de salida del proceso.
 *
 * El orden de las comprobaciones no es casual: primero lo que hace IMPOSIBLE arrancar
 * (falta el build del cliente → 70, fallo del entorno y no del proyecto), y después lo que
 * solo hay que DECIR (un proyecto offline en el cwd). Lo segundo informa y sigue, porque no
 * es un error: quien abrió aquí un proyecto offline puede querer la web para otro.
 *
 * **`--guion` sobre un proyecto offline lo abre solo, sin pasar por el alta.** Es la única
 * vía para ver la maqueta completa —barra con datos, transcript, compositor— sin
 * credenciales de CloudStudio: el alta de la web solo sabe de entornos y proyectos
 * REMOTOS (`vestibulo.ts`), así que un proyecto offline nunca llega a `proyectoAbierto()`
 * por ese camino, con o sin `--guion`. `vestibulo.abrirProyecto` (`vestibulo.ts#abrirDeVerdad`)
 * no toca red —es local, el mismo turno que corre `--cli`—, así que abrirlo aquí no es un
 * doble de nada: es la operación real, disparada por una bandera que ya existe y ya
 * significa «sin gastar ni conectar». Sin `--guion` esto NO se abre solo —sería magia, no
 * un modo declarado—, y el aviso de abajo sigue mandando a `--cli`.
 */
export async function arrancarConsolaWeb(opciones: OpcionesDeArranque): Promise<number> {
  const escribir = opciones.escribir ?? ((texto: string) => void process.stdout.write(texto));
  const raizDelCliente = opciones.raizDelCliente ?? raizDelClientePorOmision();

  if (!existsSync(join(raizDelCliente, "index.html"))) {
    process.stderr.write(`${FALTA_EL_BUILD}\n`);
    return 70; // EX_SOFTWARE: falta una pieza del entorno, el proyecto no tiene la culpa
  }

  const offline = esProyectoOffline(opciones.cwd);
  if (offline && opciones.guion !== true) {
    escribir("este directorio es un proyecto offline: ábrelo con «xonecode --cli»\n");
  }

  const arrancar = opciones.crearServidor ?? arrancarServidor;
  const servidor = await arrancar({
    puerto: opciones.puerto,
    raizEstaticos: raizDelCliente,
    ...(opciones.anfitrion === undefined ? {} : { anfitrion: opciones.anfitrion }),
  });

  /**
   * El aviso que se ve por los DOS sitios, y es el mismo para el vestíbulo y para las rutas.
   *
   * El vestíbulo se captura perezosamente porque esta función se construye antes que él.
   * Medido antes de este arreglo: `montarRutas` recibía un `informar` que solo escribía en
   * el terminal, así que una URL rechazada o un `fetch failed` durante el alta salían por la
   * consola del proceso y NO llegaban al navegador — el `finally` re-anunciaba el alta, el
   * wizard repintaba el mismo paso, y el usuario no leía ni una palabra. En la piel que
   * ahora es la de omisión, y que vive en un navegador donde el terminal puede ni verse, eso
   * es un fallo mudo. Al revés también hace falta: en cuanto hay proyecto abierto, la consola
   * del vestíbulo ya no la mira nadie, y ahí caería «la consola del proyecto terminó con un
   * error».
   */
  let vestibulo: Vestibulo | undefined;
  const informar = (texto: string): void => {
    escribir(`${texto}\n`);
    vestibulo?.consola.consola.escribir(`${texto}\n`);
  };

  vestibulo = opciones.vestibulo ?? vestibuloReal(opciones, servidor, escribir, informar);

  if (offline && opciones.guion === true) {
    const abierto = await vestibulo.abrirProyecto({ raiz: opciones.cwd });
    // Por los DOS sitios, como el resto de `informar` un poco más abajo: el terminal
    // (quien lanzó el proceso) Y el transcript del proyecto (la Trayectoria, que es
    // donde aterriza un acto de sistema — `anunciarAlta` más arriba documenta el mismo
    // reparto). Es la evidencia de que esto es de pega, por el mismo motivo por el que
    // la marca de doble (`core/ports.ts#ES_DOBLE`) es un símbolo que no se puede omitir
    // por descuido: un aviso que solo viviera en un sitio que nadie mira no avisa nada.
    const aviso =
      "proyecto offline abierto solo, por --guion: el agente que responde es de pega " +
      "(`ejecutarTurnoGuionizado`) y no hubo CloudStudio de por medio — nadie eligió " +
      "este proyecto en un alta.";
    escribir(`${aviso}\n`);
    abierto.consola.consola.escribir(`${aviso}\n`);
  }

  montarRutas(servidor, vestibulo, {
    informar,
    // Los dos puertos del selector de modelos, con las piezas reales: quién tiene
    // credencial (`auth.json` o el entorno, leído desde el cwd) y el catálogo VIVO.
    hayCredencial: (proveedor) => hayCredencial(proveedor, opciones.cwd),
    // «Está en auth.json» es una pregunta distinta de «¿puedo usarlo?»: se lee el fichero,
    // sin mirar el entorno, porque es lo único que un botón de borrar puede cumplir.
    credencialEnFichero: (proveedor) => cargar(opciones.cwd).auth[proveedor] !== undefined,
    borrarCredencial,
    guardarCredencial,
    catalogoDeModelos: async (proveedor) => {
      const modelos = await new CatalogoModelos().listar(proveedor);
      return modelos.map((m) => ({ id: m.id, ...(m.nombre === undefined ? {} : { nombre: m.nombre }) }));
    },
  });

  escribir(`consola web en ${servidor.url}\n`);
  if (opciones.anfitrion !== undefined) {
    // Se dice SIEMPRE y con lo que hay detrás nombrado. Una puerta abierta que solo consta
    // en la línea de comandos que alguien tecleó hace media hora no consta.
    escribir(
      `ATENCIÓN: también se acepta «${opciones.anfitrion}» como Host, así que esta consola es alcanzable por ese túnel.\n` +
        `Detrás hay un agente que escribe ficheros en este equipo y las credenciales de ~/.xonecode. ` +
        `Lo único que lo separa de quien tenga la URL es el token.\n`
    );
  }
  if (opciones.abrir) {
    // Lo accesorio: la URL ya está impresa, así que un fallo aquí no puede tumbar nada.
    // `abrirEnSistema` escucha el `error` del spawn justo por esto.
    try {
      (opciones.abrirNavegador ?? abrirEnSistema)(new URL(servidor.url));
    } catch (error) {
      escribir(`no se pudo abrir el navegador (${error instanceof Error ? error.message : String(error)}); abre la URL a mano\n`);
    }
  }

  await (opciones.esperarCierre ?? esperarInterrupcion)();
  await vestibulo.cerrar();
  await servidor.cerrar();
  return 0;
}

/**
 * El `modo` que declara el `.xonecode/config.json` de una raíz, o `undefined`.
 *
 * `undefined` es «no se sabe», no «offline»: cubre el fichero que no está, el JSON roto y
 * el valor que no es ninguno de los dos. Quien pregunta decide qué hacer con no saber —
 * `esProyectoOffline` lo trata como «no es offline» y la cabecera de la consola web no
 * pinta pastilla—, y ninguno de los dos afirma sobre lo que no ha leído.
 *
 * Del config no sale nada más: ni la URL del entorno, ni el proyecto, ni la rama. Es lo
 * mismo que ya hace `proyectosDeResultado` con la respuesta de CloudStudio (CLAUDE.md),
 * quedarse SOLO con lo que hace falta enseñar.
 */
export function modoDeProyecto(raiz: string): "offline" | "cloud" | undefined {
  try {
    const crudo: unknown = JSON.parse(readFileSync(join(raiz, ".xonecode", "config.json"), "utf8"));
    if (typeof crudo !== "object" || crudo === null) return undefined;
    const modo = (crudo as { modo?: unknown }).modo;
    return modo === "offline" || modo === "cloud" ? modo : undefined;
  } catch {
    return undefined;
  }
}

/** Un `.xonecode/config.json` con `modo: "offline"` en el cwd. Lo que no se pueda leer no
 *  es un proyecto offline: no se afirma sobre lo que no se sabe. */
function esProyectoOffline(cwd: string): boolean {
  return modoDeProyecto(cwd) === "offline";
}

/**
 * La espera por omisión: hasta que alguien interrumpa. Sin ella `arrancarConsolaWeb`
 * devolvería en cuanto el servidor está en pie, y `bin.ts` hace `process.exit(codigo)` —
 * o sea que el servidor recién levantado moriría antes de servir una sola petición.
 */
function esperarInterrupcion(): Promise<void> {
  return new Promise<void>((resolver) => {
    process.once("SIGINT", () => resolver());
    process.once("SIGTERM", () => resolver());
  });
}

/** El vestíbulo con todas sus piezas reales. Se construye DESPUÉS del servidor porque el
 *  callback de OAuth necesita saber a qué URL devolver al navegador. */
function vestibuloReal(
  opciones: OpcionesDeArranque,
  servidor: ServidorWeb,
  escribir: (texto: string) => void,
  informar: (texto: string) => void
): Vestibulo {
  // Lo PRIMERO, antes de leer nada de disco: si esto va a fallar, que falle sin haber
  // aplicado credenciales al proceso ni construido medio vestíbulo.
  const ejecutor = banderaDeEjecutor(opciones);
  const cargado = cargar(opciones.cwd);
  aplicarAuth(cargado.auth);
  const fuentes: FuentesDeEleccion = {
    global: cargado.config.global,
    entorno: { XONECODE_MODELO: process.env.XONECODE_MODELO },
  };
  const settings = cargarSettings().settings;
  const dependenciasDeProyecto = opciones.dependenciasDeProyecto;
  return crearVestibulo({
    informar,
    origenDeTrabajo: resolver(fuentes).trabajo.origen,
    fuentes,
    // Se resuelve UNA vez, aquí, y no en cada `anunciarAlta`: `git config`/`os.userInfo`
    // no cambian a media conexión, y repetir el subproceso en cada anuncio del alta sería
    // gastar sin motivo. Nunca viaja hacia CloudStudio ni hacia ningún acto —
    // `agent/persona.ts` lo documenta—.
    nombre: nombreDePersona(opciones.cwd),
    catalogoModelos: new CatalogoModelos(),
    guardarCredencial,
    aplicarCredencial: aplicarCredencialAlProceso,
    // Los proveedores que YA tienen clave no se vuelven a pedir. Sin esto la omisión del
    // vestíbulo es `false` para todos —la dirección segura, pero molesta— y el asistente
    // pediría de nuevo una credencial que está escrita.
    hayCredencial: (proveedor) => hayCredencial(proveedor, opciones.cwd),
    guardarEntorno: (entorno: Entorno) => guardarEntornoEnDisco(undefined, entorno),
    guardarModeloGlobal,
    guardarConfigDeProyecto: escribirProyectoEnDisco,
    entornos: settings.entornos,
    ...(settings.workspace === undefined ? {} : { baseDeWorkspace: settings.workspace }),
    // La URL de la web para que la página del callback devuelva AQUÍ y no diga «vuelve a
    // la terminal», que en un navegador es falso.
    ...conexionDeVestibulo(servidor.url),
    // La descarga es la de siempre, la del `/sync bajar` del proyecto ya dado de alta:
    // `completarProyecto` escribe el `config.json` ENTERO antes de llamar aquí, así que el
    // sincronizador lee del disco exactamente lo que leería después. Nada de la
    // sincronización se toca ni se duplica.
    descargar: async ({ raiz }) => {
      const sincronizar = dependenciasDeProyecto?.(raiz).sincronizar;
      // Un `return` a secas aquí sería el no-op silencioso que este repo evita en todas
      // partes: el alta quedaría escrita y el usuario creyendo que su proyecto está bajado.
      if (sincronizar === undefined) {
        throw new Error("esta consola web se montó sin `dependenciasDeProyecto`: no hay con qué descargar");
      }
      const bajada = await sincronizar("bajar", raiz, undefined, escribir);
      if (bajada.tipo === "texto") {
        escribir(bajada.texto);
        return;
      }
      // El árbol sucio para la copia local. Bajar SOBRESCRIBE el disco, así que se dice
      // qué hay y no se baja nada — igual que en el alta de terminal.
      throw new Error(
        `hay trabajo local sin commitear (${bajada.pendientes.join(", ")}); la descarga sobrescribe el disco`
      );
    },
    // Sin `crearEjecutor` el vestíbulo cae en `ejecutarTurnoGuionizado` — el agente de
    // PEGA— y no habría forma de notarlo desde el navegador: los turnos correrían, las
    // fases se pintarían y nada de lo que dijera sería de un modelo. Se exige, igual que
    // `descargar` exige su sincronizador. `--guion` es la única forma de pedir el de pega,
    // y ahí se pide a propósito.
    ...ejecutor,
    ...(dependenciasDeProyecto === undefined ? {} : { dependenciasDeProyecto }),
  });
}

/**
 * O el ejecutor real, o el de pega PEDIDO con `--guion`, o un error. Lo que no hay es una
 * tercera opción muda.
 */
function banderaDeEjecutor(opciones: OpcionesDeArranque): Pick<OpcionesDelVestibulo, "crearEjecutor"> {
  if (opciones.guion === true) return {};
  if (opciones.crearEjecutor === undefined) {
    throw new Error(
      "esta consola web se montó sin `crearEjecutor`: correría el agente de pega sin decirlo (usa --guion si es lo que quieres)"
    );
  }
  return { crearEjecutor: opciones.crearEjecutor };
}

/** Los pasos, reexportados para quien monte otra piel sobre el mismo vestíbulo. */
export type { OpcionDeEntorno, PasoDelVestibulo };
