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
import { PROVEEDORES, resolver, type FuentesDeEleccion } from "../../core/modelos.js";
import { COMANDOS, hayCredencial, type Consola, type EjecutorDeTurno } from "../../cli/consola.js";
import { aplicarAuth, cargar, guardarModeloGlobal } from "../../agent/configEnDisco.js";
import { guardarCredencial } from "../../agent/authEnDisco.js";
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
  desconectar(): void;
}

export interface OpcionesDeMontaje {
  /** A dónde van los avisos que no caben en el transcript. Por omisión, a ningún sitio. */
  informar?: (texto: string) => void;
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

  /** El sumidero del cliente vivo. `undefined` = no hay nadie al otro lado. */
  let enviar: Sumidero | undefined;
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

  const emitir = (mensaje: MensajeAlCliente): void => enviar?.(mensaje);

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
    const pendientes = proyectoAbierto ? [] : await vestibulo.pasosPendientes();
    const pasos: PasoDelVestibulo[] = pendientes.includes("entorno") ? ["entorno"] : [];
    emitir({
      clase: "alta",
      pasos,
      proveedores: PROVEEDORES.map((p) => ({ id: p, nombre: p })),
      entornos: [...vestibulo.opcionesDeEntorno()],
      proyectos,
      ramas,
      proyectoAbierto,
      ...(modo === undefined ? {} : { modo }),
      ...(vestibulo.nombre === undefined ? {} : { nombre: vestibulo.nombre }),
      ...(aviso === undefined ? {} : { aviso }),
    });
  };

  /** Engancha el cable a la consola que toque, con el transcript entero por delante. */
  const adjuntar = (): void => {
    const destino = destinoActual();
    if (adjunto !== undefined && adjunto !== destino) adjunto.desconectar();
    adjunto = destino;
    const actos = destino.conectar(enviar);
    // El orden importa: primero el transcript, luego lo que el compositor necesita para
    // sugerir, y al final lo que el wizard tiene que pedir.
    emitir({ clase: "reemision", actos: [...actos] });
    emitir({ clase: "comandos", comandos: comandosDelRegistro() });
  };

  /**
   * El paso de cuenta, conducido por el asistente de siempre sobre esta consola. Se lanza
   * suelto (no se espera) porque el manejador del SSE tiene que devolver para que el
   * navegador reciba las preguntas que este asistente va a emitir.
   */
  const conducirCuenta = async (): Promise<void> => {
    const pendientes = await vestibulo.pasosPendientes();
    if (!pendientes.includes("cuenta") || cuentaHecha || vestibulo.proyectoAbierto() !== undefined) return;
    if (cuentaEnCurso === undefined) {
      cuentaEnCurso = vestibulo.pasoDeCuenta().finally(() => {
        cuentaEnCurso = undefined;
        // «Hecho» solo si al terminar seguía habiendo alguien conectado. Si terminó
        // porque `desconectar()` canceló la elección en curso (`consolaWeb.ts:178`,
        // sin cliente todo lo pendiente responde como un readline cerrado), no lo
        // decidió ningún humano — fue el silencio — y la SIGUIENTE conexión tiene que
        // poder intentarlo de verdad, no heredar un «ya se preguntó» que nadie contestó.
        if (!(vestibulo.consola.consola.eof?.() ?? false)) cuentaHecha = true;
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

  /** Un paso del alta resuelto en el navegador. Cada rama termina volviendo a anunciar. */
  const atenderAlta = async (mensaje: Extract<MensajeDelCliente, { clase: "alta" }>): Promise<void> => {
    // Se limpia al empezar: un aviso viejo pegado a un paso que ya salió bien mentiría.
    aviso = undefined;
    try {
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
        await vestibulo.registrarEntorno({ id: elegido.id, nombre: elegido.nombre, url: elegido.url });
        entornoElegido = elegido.id;
        proyectoElegido = undefined;
        ramas = [];
        proyectos = await vestibulo.proyectosDe(elegido.id);
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
        ramas = await vestibulo.ramasDe(entornoElegido, proyecto);
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
      // vivo cuyas aprobaciones se rechazan solas al otro lado.
      adjuntar();
    } catch (error) {
      // El aviso se fija ANTES de anunciar: el `finally` de abajo es quien lo lleva al paso.
      aviso = error instanceof Error ? error.message : String(error);
      contar(error);
    } finally {
      await anunciarAlta().catch(contar);
    }
  };

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
    enviar = sumidero;
    // Un comentario SSE abre el stream de verdad: sin nada escrito, algunos navegadores no
    // disparan `onopen` hasta el primer dato.
    respuesta.write(": xonecode\n\n");
    adjuntar();
    // ANTES de `conducirCuenta()`, no después: el nombre ya está resuelto (es local, no
    // depende de ninguna cuenta) y el paso de cuenta puede tardar lo que tarde un humano
    // en elegir modelo y teclear una clave. Mandarlo solo dentro de `alta` —al final de
    // TODO esto— dejaba el saludo en «Hola» a secas mientras tanto (`transporte.ts`
    // documenta la medida).
    emitir({ clase: "bienvenida", ...(vestibulo.nombre === undefined ? {} : { nombre: vestibulo.nombre }) });
    void conducirCuenta()
      .catch(contar)
      .then(() => poblarProyectosSiProcede())
      .finally(() => void anunciarAlta().catch(contar));

    peticion.on("close", () => {
      // El `close` de una pestaña recargada puede llegar DESPUÉS de que el SSE nuevo se
      // haya enganchado. Sin esta guarda desconectaría la consola del cliente que acaba de
      // llegar, y a partir de ahí `eof()` diría que no hay nadie: toda aprobación
      // rechazada en silencio.
      if (enviar !== sumidero) return;
      enviar = undefined;
      // Se desconecta el destino que se ADJUNTÓ, no el actual: entre la conexión y el
      // cierre puede haberse abierto un proyecto, y desconectar a otro dejaría la consola
      // viva creyendo que sigue habiendo alguien mirando.
      adjunto?.desconectar();
      adjunto = undefined;
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
  const servidor = await arrancar({ puerto: opciones.puerto, raizEstaticos: raizDelCliente });

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

  montarRutas(servidor, vestibulo, { informar });

  escribir(`consola web en ${servidor.url}\n`);
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
