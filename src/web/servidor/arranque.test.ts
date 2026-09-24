/**
 * Todo offline: no hay puerto, ni navegador, ni CloudStudio, ni disco del usuario. El
 * servidor entra como doble que solo apunta las rutas registradas, el vestíbulo se
 * construye con los mismos dobles que usa `vestibulo.test.ts`, y los manejadores se
 * invocan con una petición y una respuesta de mentira — que es lo que permite afirmar
 * sobre el CABLE (qué se emite, en qué orden, a qué consola) sin abrir un socket.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MS_DE_PREPARACION,
  MS_DE_TRABAJO_AL_ABRIR,
  arrancarConsolaWeb,
  montarRutas,
  commitDeTurnoCableado,
  mudarWorkspaceLegadoCableado,
  ajusteDeWorkspaceCableado,
  construirCorredorDeTareasCableado,
  FALTA_EL_BUILD,
  RUTA_ACCION,
  RUTA_ADJUNTO,
  RUTA_SKILL,
  RUTA_ARTEFACTO,
  RUTA_EVENTOS,
  fuentesDelJuez,
  fuentesDeLaConsolaWeb,
  augmentacionCableada,
  contextoDelProyecto,
  lecturaDeSync,
  LINEAS_DE_LOG,
  TOPE_DE_MEMORIA,
  FICHEROS_DEL_AVISO,
} from "./arranque.js";
import { ErrorDelAumentador } from "../../agent/tareas/aumentador.js";
import { leerFicheroDeProyecto, motivoDeRutaInaceptable } from "../../agent/grafo/arbolDeProyecto.js";
import { RUTA_IMAGEN_DEL_PROYECTO } from "../../core/imagenesDeDocumento.js";
import { CLAVE_DE_SELLO, cambiosDeSesion, fotoDeApertura } from "../../agent/sesiones/sesionGit.js";
import type { PeticionDeTarea } from "../../core/ports.js";
import { crearVestibulo, type Vestibulo } from "./vestibulo.js";
import { rutaGlobalDeAgentes } from "../../agent/subagentes/agentesEnDisco.js";
import { strToU8, zipSync } from "fflate";
import { rutaGlobalDeSkills } from "../../agent/grafo/skills.js";
import { crearConsolaWeb, type ConsolaWeb, type OpcionesDeConsolaWeb } from "./consolaWeb.js";
import { PAPELES } from "../../core/modelos.js";
import { crearSesion, listarSesiones } from "./sesiones.js";
import { COMANDOS } from "../../cli/consola.js";
import { CatalogoModelosEnMemoria } from "../../core/ports.js";
import type { Entorno } from "../../core/settings.js";
import type { AdjuntoDeTarea, Tarea } from "../../core/tareas.js";
import { TOPE_DE_ADJUNTO } from "../../agent/tareas/tareasEnDisco.js";
import type { ManejadorRuta } from "./servidor.js";
import { ESTADOS_DEL_LANZAMIENTO, FASES_DEL_LANZAMIENTO } from "./transporte.js";
import {
  FASES_DE_LANZAMIENTO,
  type EstadoDeLanzamiento,
  type FaseDeLanzamiento,
  type PeticionDeLanzamiento,
} from "../../agent/dispositivos/lanzamientoEnMaquina.js";
import type { AgenteDelCable, MensajeAlCliente, MensajeDelCliente, Sumidero } from "./transporte.js";
import type { Acto } from "../../core/actos.js";

/** El servidor visto por `montarRutas`: solo apunta lo que se le registra. */
function servidorDeMentira() {
  const rutas = new Map<string, ManejadorRuta>();
  return {
    rutas,
    registrarRuta: (metodo: string, ruta: string, manejador: ManejadorRuta) => {
      rutas.set(`${metodo} ${ruta}`, manejador);
    },
  };
}

/**
 * El SSE del navegador: apunta cada mensaje ya parseado y sabe avisar del cierre.
 *
 * `id` es el identificador de cliente que el navegador manda en la query (`/eventos?cliente=`)
 * y que después repite en un `{clase:"mirar"}`: sin él el servidor no podría saber a qué
 * pestaña engancharle la mirada de una tarea, porque el SSE y el `POST /accion` son dos
 * peticiones distintas. Ausente = un cliente que no pide mirar nada, que es el caso de casi
 * todos estos tests.
 */
function clienteDeMentira(id?: string) {
  const recibidos: MensajeAlCliente[] = [];
  let alCerrar: (() => void) | undefined;
  const peticion = {
    url: id === undefined ? "/eventos" : `/eventos?cliente=${id}`,
    on: (evento: string, escucha: () => void) => {
      if (evento === "close") alCerrar = escucha;
    },
  } as unknown as IncomingMessage;
  const respuesta = {
    writeHead: () => respuesta,
    write: (trozo: string) => {
      if (trozo.startsWith("data: ")) recibidos.push(JSON.parse(trozo.slice(6)) as MensajeAlCliente);
      return true;
    },
    end: () => respuesta,
  } as unknown as ServerResponse;
  return { peticion, respuesta, recibidos, cerrar: () => alCerrar?.() };
}

/**
 * El último mensaje de ALTA, que no es lo mismo que el último mensaje: desde que abrir una
 * sesión anuncia sus dos flancos (`clase: "abriendo"`), detrás del alta va el de bajada. Los
 * tests que miraban `recibidos.at(-1)` estaban leyendo «el último» y queriendo decir «el
 * alta» — se pusieron rojos todos a la vez, que es como se ve que la afirmación era otra.
 */
function ultimaAlta(cliente: { recibidos: MensajeAlCliente[] }): MensajeAlCliente | undefined {
  return cliente.recibidos.filter((m) => m.clase === "alta").at(-1);
}

/** Un `POST /accion` con su cuerpo. Devuelve el estado con el que se contestó. */
async function postear(manejador: ManejadorRuta, cuerpo: string): Promise<number> {
  const peticion = Readable.from([Buffer.from(cuerpo)]) as unknown as IncomingMessage;
  let estado = 0;
  const respuesta = {
    writeHead: (codigo: number) => {
      estado = codigo;
      return respuesta;
    },
    end: () => respuesta,
  } as unknown as ServerResponse;
  await manejador(peticion, respuesta);
  return estado;
}

function enviarMensaje(manejador: ManejadorRuta, mensaje: MensajeDelCliente): Promise<number> {
  return postear(manejador, JSON.stringify(mensaje));
}

/** Deja correr las promesas sueltas que el cable lanza sin esperarlas. */
const asentar = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function vestibuloDePrueba(extra: Partial<Parameters<typeof crearVestibulo>[0]> = {}): Vestibulo {
  const entornos: Entorno[] = [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" }];
  return crearVestibulo({
    // `omision` haría que el paso de cuenta se conduzca de verdad (catálogo y selector):
    // aquí se prueba el cable del alta, no el asistente, que ya tiene sus tests.
    origenDeTrabajo: "global",
    catalogoModelos: new CatalogoModelosEnMemoria(),
    guardarCredencial: () => ({ ruta: "/casa/.xonecode/auth.json" }),
    guardarEntorno: () => ({ ruta: "/casa/.xonecode/settings.json" }),
    olvidarEntorno: () => ({ ruta: "/casa/.xonecode/settings.json" }),
    guardarConfigDeProyecto: (raiz: string) => ({ ruta: `${raiz}/.xonecode/config.json` }),
    guardarModeloGlobal: (_papel, id) => ({ ruta: "/casa/.xonecode/config.json", id }),
    descargar: async () => {},
    adoptarLegado: () => {},
    entornos,
    baseDeWorkspace: () => "/w",
    proyectosDeEntorno: async () => ({ proyectos: [{ id: "p1", nombre: "Tienda" }] }),
    ramasDeProyecto: async () => ["master", "pruebas"],
    sesiones: {
      crear: () => "s1",
      listar: () => [],
      anotar: () => {},
      reabrir: (_r, id) => ({ id, actos: [], historica: true }),
    },
    // El lazo de consola no se arranca de verdad: `correrConsola` sobre una consola web
    // se quedaría esperando líneas para siempre y el test no terminaría.
    correr: async () => 0,
    ...extra,
  });
}

describe("montarRutas — el cable, por fin conectado", () => {
  it("registra el SSE y la acción: hasta ahora `registrarRuta` no la llamaba nadie", () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba());
    expect([...servidor.rutas.keys()].sort()).toEqual([
      // La tercera es el documento de un artefacto, que un iframe no puede pedir por el cable.
      `GET ${RUTA_ARTEFACTO}`,
      `GET ${RUTA_EVENTOS}`,
      `POST ${RUTA_ACCION}`,
      // Y la cuarta son los BYTES de un adjunto de tarea, por lo mismo: el cable lleva JSON.
      `POST ${RUTA_ADJUNTO}`,
      // Y la quinta, los de un `.zip` con una skill dentro: la misma razón y el mismo molde.
      `POST ${RUTA_SKILL}`,
      // Y la sexta, las imágenes que enlaza un `.md` del proyecto: su visor solo pinta `http(s)`.
      `GET ${RUTA_IMAGEN_DEL_PROYECTO}`,
    ].sort());
  });

  it("al conectar manda el transcript, el estado de modelos, el saludo y el alta", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba());
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();

    // «modelos» va primero por lo mismo que lo demás: es lo que el compositor necesita
    // para pintarse, y al reconectar hay que repoblarlo entero — el cliente tira sus
    // proyecciones al caerse el SSE en vez de recordar un modelo que pudo cambiar.
    expect(cliente.recibidos.map((m) => m.clase)).toEqual([
      "reemision",
      "modelos",
      // Los subagentes van aquí por lo mismo que los modelos: la ventana de ajustes se
      // puede abrir en cuanto conecta, y sin esto enseñaría una lista vacía hasta que algo
      // los cambiara — indistinguible de «no tienes ninguno».
      "agentes",
      // Y las skills, por lo mismo y con una razón más: el editor de un subagente pinta sus
      // skills como casillas, así que sin esto ese formulario se abriría sin ninguna que
      // marcar — indistinguible de «no hay ninguna».
      "skills",
      // Y si hay turno corriendo, se dice: quien conecta a mitad no vio el mensaje que lo
      // anunció, y su compositor se quedaría encendido mientras lo que escriba se encola.
      "turno",
      "bienvenida",
      // DOS altas, y en ese orden a propósito: el primero dice lo que ya se sabe del disco
      // («no falta ningún paso»), y el segundo llega cuando CloudStudio ha contestado, con
      // los proyectos dentro. Fundirlos en uno dejaba al cliente sin saber si hacía falta
      // dar algo de alta durante todo el viaje al MCP, y entonces enseñaba la pantalla del
      // alta a quien no tenía nada que dar de alta.
      "alta",
      "alta",
    ]);
  });

  /**
   * La medida que motivó la clase «bienvenida»: con la cuenta de verdad pendiente
   * (`origenDeTrabajo: "omision"`), `alta` no se manda hasta que `conducirCuenta()`
   * termina —y eso espera a que un humano conteste el selector—, así que sin este
   * mensaje el nombre no tenía por dónde llegar mientras tanto. Se manda ANTES del
   * selector, no después: el nombre ya está resuelto al conectar, no depende de que
   * nadie elija nada.
   */
  it("el saludo llega ANTES de que la cuenta resuelva, no solo dentro del `alta` final", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba({ origenDeTrabajo: "omision", nombre: "Ana" }));
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();

    const clases = cliente.recibidos.map((m) => m.clase);
    expect(clases.indexOf("bienvenida")).toBeGreaterThanOrEqual(0);
    expect(clases.indexOf("bienvenida")).toBeLessThan(clases.indexOf("selector"));
    expect(clases).not.toContain("alta");
    const bienvenida = cliente.recibidos.find((m) => m.clase === "bienvenida") as Extract<
      MensajeAlCliente,
      { clase: "bienvenida" }
    >;
    expect(bienvenida.nombre).toBe("Ana");
  });

  it("con cuenta y entorno resueltos, `pasos` sale vacío, sin proyecto abierto lo dice aparte, y la barra llega con SUS proyectos", async () => {
    // Cambio de rumbo del usuario: el proyecto salió del alta. Con el entorno YA
    // registrado (`vestibuloDePrueba` lo trae de fábrica) y la cuenta resuelta
    // (`origenDeTrabajo: "global"`), ya no falta nada que el wizard tenga que pintar —
    // antes esto habría dicho `["entorno", "proyecto"]` porque abrir un proyecto exigía
    // saber de qué entorno viene; ahora abrir un proyecto no es parte del alta.
    //
    // `proyectos` SÍ llega poblado, sin que nadie elija entorno en esta conexión: es la
    // regresión encontrada al revisar en vivo (`poblarProyectosSiProcede`) — quien entra
    // directo con las tres condiciones cumplidas se salta el paso "entorno" del wizard, y
    // con él la única línea que antes rellenaba `proyectos`. Sin el arreglo, esto habría
    // dicho `[]` con un entorno registrado de sobra: la barra poblada de mentira.
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba());
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();
    const alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.pasos).toEqual([]);
    // Sin proyecto abierto: nadie ha elegido ninguno todavía en ESTA conexión, aunque el
    // entorno ya estuviera registrado de antes.
    expect(alta.proyectoAbierto).toBe(false);
    expect(alta.proyectos).toEqual([{ id: "p1", nombre: "Tienda" }]);
    // Las ramas sí siguen vacías: pedirlas exige saber de qué PROYECTO, y eso solo lo
    // dice quien elige uno en la barra (`paso: "proyecto"`), no la población automática.
    expect(alta.ramas).toEqual([]);
  });

  /**
   * **El alta se anuncia ANTES de preguntar a CloudStudio, igual que al cambiar de entorno.**
   *
   * `pasos` se calcula del DISCO (`pasosPendientes`: de dónde vino el modelo y qué entornos
   * hay registrados), así que en una máquina configurada ya se sabe «no falta nada» antes de
   * tocar la red. Colgado detrás de `poblarProyectosSiProcede` —que abre la sesión MCP— el
   * cliente se quedaba sin saberlo mientras durara ese viaje: medido en la máquina del
   * usuario, con CloudStudio caliente y respondiendo, el `alta` llegaba a los 1436 ms y hasta
   * entonces la pantalla enseñaba el DIÁLOGO DE CONFIGURACIÓN de un proyecto ya configurado,
   * porque `App.tsx` leía `alta === undefined` como «falta el alta» en vez de «no consta».
   * Con el MCP lento, el token caducado o la red caída, esa ventana crece hasta su tope.
   *
   * Por eso la aserción es sobre el PRIMER anuncio y con la conexión colgando: si el arreglo
   * se deshace, esto se queda sin ningún `alta` y muere. Los proyectos llegan en el SEGUNDO
   * anuncio, que es lo que prueba el test de arriba.
   */
  /**
   * **El Escritorio no entra hasta estar preparado, y la espera tiene plazo.**
   *
   * El usuario pidió lo primero: entrar con la sesión MCP abierta y los proyectos listados,
   * porque antes el Escritorio entraba vacío y se rellenaba delante. `proyectos: []` no
   * puede sostener eso —no distingue «no preguntado» de «ninguno»—, así que el primer `alta`
   * lo DICE con `preparando`, y el segundo llega sin el campo.
   *
   * Lo segundo es la otra mitad y no es opcional: con un MCP que no contesta, un `preparando`
   * que nadie quitara deja el lienzo para siempre — medido con un host que descarta paquetes.
   * Por eso se quita en el `finally`, también cuando vence el plazo, y aquí se comprueba sin
   * resolver nunca la conexión.
   */
  it("el arranque DICE lo que prepara, y al vencer el plazo entra igual sin el campo", async () => {
    vi.useFakeTimers();
    try {
      const servidor = servidorDeMentira();
      montarRutas(
        servidor,
        vestibuloDePrueba({
          // El MCP que nunca contesta: el agujero negro, en forma de promesa.
          proyectosDeEntorno: () => new Promise(() => undefined),
        })
      );
      const cliente = clienteDeMentira();
      const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
      await eventos!(cliente.peticion, cliente.respuesta);
      await vi.advanceTimersByTimeAsync(0);
      const primera = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
      // Nombra el entorno al que está llamando: una espera que no dice a qué espera se lee
      // como una pantalla colgada.
      expect(primera.preparando).toContain("XOne WebStudio");
      expect(primera.pasos).toEqual([]);

      // Vencido el plazo, se entra igual: el campo desaparece aunque el MCP siga colgado.
      await vi.advanceTimersByTimeAsync(MS_DE_PREPARACION + 10);
      const segunda = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
      expect(segunda.preparando).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sin ningún entorno registrado no hay nada que preparar: el alta sale sin `preparando`", async () => {
    // El primer arranque de verdad: sin entornos, `poblarProyectosSiProcede` no tiene a quién
    // preguntar, así que esperar sería esperar a nadie — y la tarjeta del alta tiene que salir
    // ya, que es lo único que esa pantalla puede hacer.
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba({ entornos: [] }));
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();
    const alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.preparando).toBeUndefined();
    expect(alta.pasos).toEqual(["entorno"]);
  });

  it("el alta se anuncia sin esperar al MCP: con la conexión colgando, `pasos` ya llega", async () => {
    const servidor = servidorDeMentira();
    let contestar: ((v: { proyectos: { id: string; nombre: string }[] }) => void) | undefined;
    montarRutas(
      servidor,
      vestibuloDePrueba({
        // La sesión de CloudStudio que no contesta: sin resolver, la población queda en vuelo.
        proyectosDeEntorno: () =>
          new Promise((r) => {
            contestar = r;
          }),
      })
    );
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();
    const primera = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(primera).toBeDefined();
    expect(primera.pasos).toEqual([]);
    // Y cuando el MCP contesta, los proyectos llegan en otro anuncio: lo que se adelanta es
    // el «no falta nada», no el dato que todavía no se sabe.
    expect(primera.proyectos).toEqual([]);
    contestar?.({ proyectos: [{ id: "p1", nombre: "Tienda" }] });
    await asentar();
    const segunda = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(segunda.proyectos).toEqual([{ id: "p1", nombre: "Tienda" }]);
  });

  it("sin ningún entorno registrado, la población automática no tiene de dónde sacar proyectos: `proyectos` se queda vacío sin lanzar", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba({ entornos: [] }));
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();
    const alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.pasos).toEqual(["entorno"]);
    expect(alta.proyectos).toEqual([]);
  });

  it("un proyecto abierto por fuera del alta no dispara la población automática: no hay barra que rellenar", async () => {
    // Si `poblarProyectosSiProcede` no mirara `proyectoAbierto()` primero, un proyecto
    // OFFLINE (`--guion --web`) sin ningún entorno CloudStudio de por medio intentaría
    // igual listar proyectos del primer entorno registrado — trabajo de sobra para una
    // barra que ya no se va a enseñar (el centro pinta la sesión, no el Dashboard).
    const servidor = servidorDeMentira();
    let llamadas = 0;
    const vestibulo = vestibuloDePrueba({
      proyectosDeEntorno: async () => {
        llamadas++;
        return { proyectos: [{ id: "p1", nombre: "Tienda" }] };
      },
    });
    await vestibulo.abrirProyecto({ raiz: "/w/a" });
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();
    expect(llamadas).toBe(0);
  });

  it("con un proyecto abierto por fuera del alta (el atajo de `--guion`), `pasos` sale vacío AUNQUE falte el entorno", async () => {
    // La regresión que se vio en vivo y no en el suite: `anunciarAlta` se reescribió para
    // sacar `pasos` directo de `pasosPendientes()` ahora que «proyecto» ya no cuenta como
    // paso pendiente, y eso rompió el atajo de `--guion --web` — un proyecto offline se
    // abre con `vestibulo.abrirProyecto()` DIRECTAMENTE, sin pasar por el paso «entorno»
    // del alta, así que en una máquina sin ningún entorno registrado `pasosPendientes()`
    // sigue diciendo «entorno» pendiente de verdad. Sin el corto-circuito de
    // `proyectoAbierto`, la primera conexión veía el wizard de entorno por encima de la
    // maqueta ya abierta. `entornos: []` es lo que fuerza que «entorno» sea de verdad
    // pendiente aquí; sin él este test no distinguiría el corto-circuito de la vía normal.
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba({ entornos: [] });
    await vestibulo.abrirProyecto({ raiz: "/w/a" });
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();

    const alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.pasos).toEqual([]);
    expect(alta.proyectoAbierto).toBe(true);
  });

  it("el `modo` del proyecto abierto viaja en el alta, leído de su `.xonecode/config.json`", async () => {
    // Es lo que pinta la pastilla de la cabecera (`Cabecera.tsx`). Se lee del disco EN
    // CADA anuncio, no al abrir: `configurarModoInicial` puede escribirlo después.
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-modo-"));
    mkdirSync(join(raiz, ".xonecode"));
    writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "cloud" }));
    // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
    mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");

    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba();
    await vestibulo.abrirProyecto({ raiz });
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();

    const alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.modo).toBe("cloud");
  });

  it("un proyecto cuyo config no se puede leer NO viaja como «offline»: el campo no va", async () => {
    // «No se sabe» y «offline» no son lo mismo, y la diferencia es visible: con el campo
    // ausente la cabecera no pinta pastilla; con «offline» afirmaría en pantalla algo que
    // nadie ha leído. `/w/a` no existe, que es el caso más común de los tres que caen
    // aquí (no hay fichero, JSON roto, valor desconocido).
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba();
    await vestibulo.abrirProyecto({ raiz: "/w/a" });
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();

    const alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.proyectoAbierto).toBe(true);
    expect("modo" in alta).toBe(false);
  });

  it("el saludo de la bienvenida viaja en el alta cuando el vestíbulo trae uno, y no viaja si no", async () => {
    // El wire entero de `agent/config/persona.ts#nombreDePersona`: `arranque.ts` lo resuelve UNA
    // vez y lo pasa como `OpcionesDelVestibulo.nombre`; este test cubre que ese dato SIGUE
    // vivo hasta el mensaje `alta` del cable — lo que `App.test.tsx`/`store.test.ts` prueban
    // por separado es el render y el parseo, no que el vestíbulo lo entregue.
    const servidorConNombre = servidorDeMentira();
    montarRutas(servidorConNombre, vestibuloDePrueba({ nombre: "Ana" }));
    const clienteConNombre = clienteDeMentira();
    await servidorConNombre.rutas.get(`GET ${RUTA_EVENTOS}`)!(clienteConNombre.peticion, clienteConNombre.respuesta);
    await asentar();
    const altaConNombre = clienteConNombre.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(altaConNombre.nombre).toBe("Ana");

    // Sin nombre: ausente del todo, no un `undefined` que un `JSON.stringify` real
    // convertiría en «la clave desaparece» de todos modos — se comprueba aquí para que la
    // omisión sea explícita y no un efecto colateral de cómo se serializa.
    const servidorSinNombre = servidorDeMentira();
    montarRutas(servidorSinNombre, vestibuloDePrueba());
    const clienteSinNombre = clienteDeMentira();
    await servidorSinNombre.rutas.get(`GET ${RUTA_EVENTOS}`)!(clienteSinNombre.peticion, clienteSinNombre.respuesta);
    await asentar();
    const altaSinNombre = clienteSinNombre.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(altaSinNombre.nombre).toBeUndefined();
    expect("nombre" in altaSinNombre).toBe(false);
  });

  it("elegir entorno trae sus proyectos; elegir proyecto SIN rama trae sus ramas y no abre nada", async () => {
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba();
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();

    await enviarMensaje(accion, {
      clase: "alta",
      paso: "entorno",
      entorno: { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
    });
    await asentar();
    let alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.proyectos).toEqual([{ id: "p1", nombre: "Tienda" }]);

    await enviarMensaje(accion, { clase: "alta", paso: "proyecto", proyecto: "p1" });
    await asentar();
    alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.ramas).toEqual(["master", "pruebas"]);
    expect(vestibulo.proyectoAbierto()).toBeUndefined();
  });

  it("con settings.json recién nacido, elegir el entorno oficial lo REGISTRA y trae sus proyectos", async () => {
    // El fallo que esto vigila: la versión anterior se saltaba el registro comparando
    // contra `opcionesDeEntorno()` —la lista OFRECIDA, no la registrada—, así que en un
    // arranque limpio elegir WebStudio no registraba nada y el `proyectosDe` de después
    // moría con «el entorno no está registrado». El resto de tests no lo veían porque el
    // vestíbulo de prueba trae webstudio ya registrado.
    const registrados: string[] = [];
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba({
      entornos: [],
      guardarEntorno: (e) => {
        registrados.push(e.id);
        return { ruta: "/casa/.xonecode/settings.json" };
      },
    });
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();

    await enviarMensaje(accion, {
      clase: "alta",
      paso: "entorno",
      entorno: { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
    });
    await asentar();
    expect(registrados).toEqual(["webstudio"]);
    const alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.proyectos).toEqual([{ id: "p1", nombre: "Tienda" }]);
  });

  it("un «otro» llega SIN nombre y con id «otro»: los proyectos se piden con el id ya deducido", async () => {
    // El formulario del navegador solo pide la URL. Si `atenderAlta` se quedara con el id
    // que llegó, el `proyectosDe` de la línea siguiente moriría con «el entorno «otro» no
    // está registrado» — y el usuario vería un fallo por rellenar bien el único campo que
    // hay.
    const registrados: string[] = [];
    const pedidos: string[] = [];
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba({
      entornos: [],
      guardarEntorno: (entorno) => {
        registrados.push(entorno.id);
        return { ruta: "/casa/.xonecode/settings.json" };
      },
      proyectosDeEntorno: async (entorno) => {
        pedidos.push(entorno.id);
        return { proyectos: [{ id: "p9", nombre: "On-premise" }] };
      },
    });
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();

    await enviarMensaje(accion, {
      clase: "alta",
      paso: "entorno",
      entorno: { id: "otro", nombre: "", url: "https://mcp.casa.local/mcp" },
    });
    await asentar();

    expect(registrados).toEqual(["mcp.casa.local"]);
    expect(pedidos).toEqual(["mcp.casa.local"]);
    const alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.aviso).toBeUndefined();
    expect(alta.proyectos).toEqual([{ id: "p9", nombre: "On-premise" }]);
  });

  /**
   * El selector de modelos del compositor. La regla que lo gobierna es la del harness de
   * DeepSeek: el modelo en vigor lo DICE el servidor, y si no hay sesión abierta no se
   * afirma ninguno — el cliente pone «Elige modelo» en vez de sintetizar una fila.
   */
  describe("el estado de modelos", () => {
    it("sin proyecto abierto no hay `actual`: no se inventa un modelo en vigor", async () => {
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba(), {
        hayCredencial: (p) => p === "anthropic",
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const modelos = cliente.recibidos.find((m) => m.clase === "modelos") as Extract<
        MensajeAlCliente,
        { clase: "modelos" }
      >;
      expect(modelos.actual).toBeUndefined();
      // Los tres estados de credencial, cada uno solo cuando se puede afirmar: ollama no
      // lleva ninguna, anthropic la tiene confirmada, el resto se sabe que no.
      const porId = new Map(modelos.proveedores.map((p) => [p.id, p.credencial]));
      expect(porId.get("ollama")).toBe("nativa");
      expect(porId.get("anthropic")).toBe("puesta");
      expect(porId.get("openai")).toBe("falta");
      // Y ningún catálogo: cada uno es una llamada de red y nadie lo ha pedido.
      expect(modelos.proveedores.every((p) => p.modelos === undefined)).toBe(true);
    });

    it("con proyecto abierto, `actual` sale del estado de sesión, no de un fichero", async () => {
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        fuentes: () => ({ bandera: "anthropic/claude-x" }),
        correr: async () => 0,
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await vestibulo.abrirProyecto({ raiz: "/w/a" });
      await asentar();
      const antes = cliente.recibidos.length;
      // Reconectar reemite el estado entero: el cliente tira sus proyecciones al caerse.
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const modelos = cliente.recibidos
        .slice(antes)
        .find((m) => m.clase === "modelos") as Extract<MensajeAlCliente, { clase: "modelos" }>;
      expect(modelos.actual).toBe("anthropic/claude-x");
    });

    /**
     * El ESFUERZO del modelo en vigor: los niveles que se le pueden pedir y el que hay puesto.
     *
     * Se prueba aquí y no solo en `core/esfuerzo.test.ts` porque son dos preguntas: allí, que
     * la tabla diga la verdad; aquí, que ese dato CRUCE el cable. Es el patrón de fallo de
     * esta arquitectura —una composición de producción dentro de un cierre que los tests
     * doblan—, y sin esto la pastilla podía quedarse sin pintar con todo en verde.
     */
    it("con un modelo que lo admite, viajan sus niveles de esfuerzo", async () => {
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        fuentes: () => ({ bandera: "anthropic/claude-opus-5" }),
        correr: async () => 0,
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await vestibulo.abrirProyecto({ raiz: "/w/a" });
      await asentar();
      const antes = cliente.recibidos.length;
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const modelos = cliente.recibidos
        .slice(antes)
        .find((m) => m.clase === "modelos") as Extract<MensajeAlCliente, { clase: "modelos" }>;
      expect(modelos.esfuerzo?.niveles).toEqual(["low", "medium", "high", "xhigh", "max"]);
      // Nada elegido todavía: ausente, no un nivel inventado.
      expect(modelos.esfuerzo?.actual).toBeUndefined();
      // Y sin nota: la advertencia es de Ollama, donde el efecto no es monótono.
      expect(modelos.esfuerzo?.nota).toBeUndefined();
    });

    it("con un modelo que NO lo admite, el bloque entero va ausente", async () => {
      // Haiku 4.5 da error si se le manda `effort`. Ausente es lo que hace que la pastilla
      // no se pinte — un `{niveles: []}` obligaría al cliente a decidir eso.
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        fuentes: () => ({ bandera: "anthropic/claude-haiku-4-5" }),
        correr: async () => 0,
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await vestibulo.abrirProyecto({ raiz: "/w/a" });
      await asentar();
      const antes = cliente.recibidos.length;
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const modelos = cliente.recibidos
        .slice(antes)
        .find((m) => m.clase === "modelos") as Extract<MensajeAlCliente, { clase: "modelos" }>;
      expect(modelos.esfuerzo).toBeUndefined();
    });

    /**
     * Ollama es el único que se PREGUNTA, y por eso su camino tiene test propio: sin el
     * puerto `capacidadesDeModelo` cableado, sus modelos no ofrecen esfuerzo — y eso es lo
     * correcto, porque pedírselo a uno que no piensa tumba el turno.
     */
    it("un modelo de Ollama no ofrece nada mientras no se le haya preguntado", async () => {
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        fuentes: () => ({ bandera: "ollama/granite4.2:3b" }),
        correr: async () => 0,
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await vestibulo.abrirProyecto({ raiz: "/w/a" });
      await asentar();
      // Reconectar para que la ráfaga se recomponga con el proyecto ya abierto, como en
      // los tests de al lado.
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const modelos = cliente.recibidos.filter((m) => m.clase === "modelos").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "modelos" }
      >;
      expect(modelos.esfuerzo).toBeUndefined();
    });

    it("y cuando el servidor contesta que piensa, llegan sus niveles CON la advertencia", async () => {
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        fuentes: () => ({ bandera: "ollama/granite4.2:3b" }),
        correr: async () => 0,
      });
      montarRutas(servidor, vestibulo, {
        capacidadesDeModelo: async () => ({ piensa: true }),
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await vestibulo.abrirProyecto({ raiz: "/w/a" });
      await asentar();
      // La ráfaga con el proyecto ya abierto es la que dispara la consulta; la respuesta
      // llega en una SEGUNDA emisión, y por eso hacen falta los dos `asentar`.
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();
      await asentar();

      const modelos = cliente.recibidos.filter((m) => m.clase === "modelos").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "modelos" }
      >;
      expect(modelos.esfuerzo?.niveles).toEqual(["low", "medium", "high", "max"]);
      // La advertencia NO es decorativa: en Ollama el efecto lo pone el template de cada
      // modelo y está medido que no es monótono. Sin ella, la pastilla afirmaría una escala.
      expect(modelos.esfuerzo?.nota).toMatch(/lo decide el modelo/i);
    });

    it("una sesión NUEVA resuelve con el modelo de AHORA, no con el del arranque", async () => {
      /**
       * El fallo que esto vigila, medido en la pantalla del usuario: las fuentes se
       * construían UNA vez al construir el vestíbulo, así que elegir modelo en Ajustes y
       * pulsar «nueva sesión» seguía dando el de antes — con Ajustes enseñando ya el
       * elegido. Dos lecturas del mismo dato en instantes distintos, y decide la que se
       * quedó atrás.
       *
       * Aquí el `config.json` global lo hace `enDisco`: lo que se prueba no es que el
       * fichero se lea (eso es de `cargar`), sino que se vuelva a llamar a las fuentes al
       * ABRIR la consola, que es donde estaba la instantánea.
       */
      const servidor = servidorDeMentira();
      let enDisco = "anthropic/claude-x";
      const vestibulo = vestibuloDePrueba({
        fuentes: () => ({ bandera: enDisco }),
        correr: async () => 0,
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await vestibulo.abrirProyecto({ raiz: "/w/a" });
      await asentar();

      // Alguien elige otro modelo en Ajustes: el global cambia mientras el proceso vive.
      enDisco = "ollama/deepseek-v4.1-flash:cloud";
      // «Nueva sesión» es abrir el proyecto sin nombrar sesión: el vestíbulo cierra la
      // consola ociosa y construye otra, que es donde se releen las fuentes.
      await vestibulo.abrirProyecto({ raiz: "/w/a" });
      await asentar();

      const antes = cliente.recibidos.length;
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const modelos = cliente.recibidos
        .slice(antes)
        .find((m) => m.clase === "modelos") as Extract<MensajeAlCliente, { clase: "modelos" }>;
      expect(modelos.actual).toBe("ollama/deepseek-v4.1-flash:cloud");
    });

    it("cambiar el modelo EN CALIENTE se reemite: `/modelo` no toca disco", async () => {
      // El fallo que esto vigila: releer la configuración diría lo de antes para siempre,
      // porque `/modelo` cambia `estado.fuentes` dentro del lazo y no escribe nada.
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        // El aviso llega DESPUÉS de un tic, como en la vida real: `correrConsola` no
        // cambia de estado hasta que alguien manda una línea, y para entonces el
        // proyecto lleva abierto un rato. Avisando síncronamente aquí se probaría un
        // orden que no existe (el vestíbulo aún no ha registrado la consola como
        // abierta, así que no habría `actual` que dar).
        correr: async (consola, estado) => {
          await new Promise((listo) => setTimeout(listo, 0));
          consola.alEstado?.({ ...estado, fuentes: { bandera: "openai/gpt-5" } });
          return 0;
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();
      await vestibulo.abrirProyecto({ raiz: "/w/a" });
      await asentar();

      const ultimo = cliente.recibidos.filter((m) => m.clase === "modelos").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "modelos" }
      >;
      expect(ultimo.actual).toBe("openai/gpt-5");
    });

    it("el catálogo se pide por proveedor, y el que falla no tumba a los demás", async () => {
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba(), {
        catalogoDeModelos: async (proveedor) => {
          if (proveedor === "openai") throw new Error("credencial no autorizada para openai");
          return [{ id: "qwen3", nombre: "Qwen 3" }];
        },
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      await enviarMensaje(accion, { clase: "catalogo", proveedor: "ollama" });
      await asentar();
      await enviarMensaje(accion, { clase: "catalogo", proveedor: "openai" });
      await asentar();

      const ultimo = cliente.recibidos.filter((m) => m.clase === "modelos").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "modelos" }
      >;
      const porId = new Map(ultimo.proveedores.map((p) => [p.id, p]));
      expect(porId.get("ollama")!.modelos).toEqual([{ id: "qwen3", nombre: "Qwen 3" }]);
      expect(porId.get("openai")!.error).toMatch(/no autorizada/);
      // El que falló no arrastra a los demás, y el que nadie pidió sigue sin consultar.
      expect(porId.get("openai")!.modelos).toBeUndefined();
      expect(porId.get("anthropic")!.modelos).toBeUndefined();
      expect(porId.get("anthropic")!.error).toBeUndefined();
    });

    /**
     * La ventana de Ajustes y el lazo con un proyecto abierto.
     *
     * Aquí se prueba una mitad que no se ve en el navegador: `/modelo` escribe la bandera
     * del estado de la SESIÓN, que cambia en caliente y no toca disco. Elegir desde la
     * interfaz y nada más dejaba la elección muriendo con el proceso — se elegía,
     * se reiniciaba, y el modelo era el de antes.
     */
    describe("elegir el modelo por defecto", () => {
      /** Un `montarRutas` con el escritor a la vista, que es lo que se afirma. */
      function conEscritor(extra: Parameters<typeof montarRutas>[2] = {}) {
        const escritos: { papel: string; id: string }[] = [];
        const dichos: string[] = [];
        const encoladas: string[] = [];
        /** Con su CLAVE de sustitución, que es lo que este doble tenía que empezar a mirar:
         *  la lambda de abajo tomaba UN parámetro y se comía el segundo sin que `tsc` dijera
         *  nada — el patrón de fallo que este repo ya tiene contado por argumento. */
        const conClave: { linea: string; sustituye?: string }[] = [];
        const servidor = servidorDeMentira();
        const vestibulo = vestibuloDePrueba({
          // El `encolar` de la consola no se puede mirar desde fuera —la cola la lee el
          // lazo, y aquí el lazo es un doble que retorna enseguida—, así que se envuelve el
          // de verdad por la costura que el vestíbulo ya tiene. Es la ÚNICA forma de
          // afirmar «y además se aplica en caliente» sin abrir un socket.
          crearConsola: (o: OpcionesDeConsolaWeb): ConsolaWeb => {
            const real = crearConsolaWeb(o);
            return {
              ...real,
              encolar: (linea: string, sustituye?: string) => {
                encoladas.push(linea);
                conClave.push({ linea, ...(sustituye === undefined ? {} : { sustituye }) });
                real.encolar(linea, sustituye);
              },
            };
          },
        });
        montarRutas(servidor, vestibulo, {
          informar: (t) => dichos.push(t),
          guardarModeloGlobal: (papel, id) => {
            escritos.push({ papel, id });
            return { ruta: "/casa/.xonecode/config.json", id };
          },
          ...extra,
        });
        return { servidor, vestibulo, escritos, dichos, encoladas, conClave };
      }

      /** Conecta el cable y devuelve la ruta de acción, que es por donde entra la elección. */
      async function conectar(servidor: ReturnType<typeof servidorDeMentira>) {
        const cliente = clienteDeMentira();
        await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
        await asentar();
        const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
        return { cliente, accion };
      }

      it("sin sesión se escribe el DEFECTO de los tres papeles, y se dice", async () => {
        const { servidor, escritos, dichos } = conEscritor();
        const { accion } = await conectar(servidor);

        await enviarMensaje(accion, { clase: "modelo", id: "anthropic/claude-x" });
        await asentar();

        // Uno por PAPEL y el mismo id en los tres: el defecto no es «el del papel trabajo».
        // Se recorre PAPELES en vez de contar tres: un papel nuevo tiene que entrar aquí
        // solo, o este test se pondría verde sobre un defecto que solo cubre la mitad.
        expect(escritos).toEqual(PAPELES.map((papel) => ({ papel, id: "anthropic/claude-x" })));
        // Y se DICE, porque esto funciona con la ventana de Ajustes abierta y sin sesión:
        // un ajuste que parece puesto y no lo está es peor que uno que falta.
        expect(dichos.at(-1)).toContain("anthropic/claude-x");
      });

      it("con sesión abierta, además se aplica EN CALIENTE: es una sola elección, no dos", async () => {
        const { servidor, vestibulo, escritos, encoladas } = conEscritor();
        const { accion } = await conectar(servidor);
        await vestibulo.abrirProyecto({ raiz: "/w/a" });
        await asentar();

        await enviarMensaje(accion, { clase: "modelo", id: "openai/gpt-5" });
        await asentar();

        // La misma línea que teclea `/modelo`, encolada en el lazo: aplicarla REUSA el
        // manejador de COMANDOS en vez de tener una segunda implementación de la
        // precedencia, que divergiría el primer día.
        expect(encoladas).toEqual(["/modelo openai/gpt-5"]);
        // Y las dos cosas a la vez: guardar sin aplicar dejaría la sesión abierta en el
        // modelo de antes, que es justo lo que el usuario acaba de cambiar.
        expect(escritos).toHaveLength(PAPELES.length);
      });

      it("un modelo mal escrito no escribe nada: el fallo se dice y no llega al disco", async () => {
        const { servidor, escritos, dichos } = conEscritor();
        const { accion } = await conectar(servidor);

        // Sin barra: `parsear` lo rechaza por su FORMA, y el motivo nombra los proveedores.
        await enviarMensaje(accion, { clase: "modelo", id: "anthropic" });
        await asentar();

        expect(escritos).toEqual([]);
        expect(dichos).toHaveLength(1);
        expect(dichos[0]).toMatch(/proveedor\/modelo/);
      });

      it("sin escritor se DICE que no se ha guardado, en vez de callarlo", async () => {
        // Es la dirección segura: la elección se aplica a la sesión si la hay, y el usuario
        // lee que el defecto no se ha tocado. Callarlo dejaría un ajuste que parece puesto.
        const { servidor, vestibulo, encoladas, dichos } = conEscritor({ guardarModeloGlobal: undefined });
        const { accion } = await conectar(servidor);
        await vestibulo.abrirProyecto({ raiz: "/w/a" });
        await asentar();

        await enviarMensaje(accion, { clase: "modelo", id: "ollama/qwen3" });
        await asentar();

        expect(encoladas).toEqual(["/modelo ollama/qwen3"]);
        expect(dichos.at(-1)).toMatch(/no lo guarda como defecto/);
      });

    describe("el modo de escritura en el cable", () => {
      /**
       * El cliente manda la INTENCIÓN y el servidor decide cómo se aplica: encolando el
       * MISMO `/aprobacion` que usa el terminal. Un segundo camino para lo mismo es donde
       * el hueco de política podría reabrirse, que es la razón entera de este test.
       */
      it("con sesión abierta encola `/aprobacion`, el manejador de siempre", async () => {
        const { servidor, vestibulo, encoladas } = conEscritor();
        const { accion } = await conectar(servidor);
        await vestibulo.abrirProyecto({ raiz: "/w/a" });
        await asentar();

        await enviarMensaje(accion, { clase: "modoDeEscritura", modo: "autonomo" });
        await asentar();

        expect(encoladas).toEqual(["/aprobacion autonomo"]);
      });

      /**
       * **Y va con CLAVE de sustitución, o dos pulsaciones dejan dos líneas en la cola.**
       *
       * Dos pulsaciones con un turno en vuelo dejarían las dos líneas pendientes, y el lazo
       * las ejecutaría seguidas al terminar. El coalescing vive en `consolaWeb.ts` y tiene su
       * propio test —con la nota de que hoy la guarda del cliente hace ese caso inalcanzable—;
       * lo que ESTO fija es que aquí se PASA la clave, que es justo la mitad que se cae sola:
       * una función de un parámetro se asigna sin que `tsc` diga nada.
       *
       * Los tres controles de estado llevan la suya y son DISTINTAS entre sí: sustituir un
       * `/modelo` pendiente con un `/aprobacion` sería peor que el defecto que esto arregla.
       */
      it("y con su CLAVE, que es lo que impide dos «hecho:» seguidos y contradictorios", async () => {
        const { servidor, vestibulo, conClave } = conEscritor();
        const { accion } = await conectar(servidor);
        await vestibulo.abrirProyecto({ raiz: "/w/a" });
        await asentar();

        await enviarMensaje(accion, { clase: "modoDeEscritura", modo: "autonomo" });
        await enviarMensaje(accion, { clase: "esfuerzo", nivel: "high" });
        await asentar();

        const claves = conClave.map((c) => c.sustituye);
        expect(claves.every((c) => c !== undefined)).toBe(true);
        // Distintas entre sí: son tres controles, no uno.
        expect(new Set(claves).size).toBe(claves.length);
      });

      /**
       * **Y la pastilla se entera SIN esperar a un turno**, que es donde este cableado se
       * cae solo: el modo viaja en el ALTA y el único reemisor que había en
       * `alCambiarEstadoDeSesion` era `emitirModelos()`. Sin esta línea, pulsar «autónomo»
       * dejaba la pastilla diciendo «supervisado» hasta el siguiente flanco de turno — un
       * control que miente durante un turno entero, y justo el que decide si los ficheros
       * se escriben sin enseñarte el diff.
       */
      it("cambiar el modo REEMITE el alta, sin esperar a ningún turno", async () => {
        const { servidor, vestibulo } = conEscritor();
        const { cliente, accion } = await conectar(servidor);
        await vestibulo.abrirProyecto({ raiz: "/w/a" });
        await asentar();
        void accion;

        const abierto = vestibulo.proyectoAbierto()!;
        // Se empuja por la MISMA costura que usa el lazo al aplicar `/aprobacion`
        // (`Consola.alEstado`), en vez de encolar la línea: en este test el lazo no corre.
        abierto.consola.consola.alEstado?.({ ...abierto.estadoDeSesion, modo: "autonomo" });
        await asentar();

        const ultimaAlta = [...cliente.recibidos].reverse().find((m) => m.clase === "alta");
        expect(ultimaAlta).toMatchObject({ modoDeEscritura: "autonomo" });
      });

      it("sin sesión NO se guarda ningún defecto: se dice y ya", async () => {
        // A diferencia del modelo, el modo es de la sesión y solo de la sesión. Un defecto
        // persistido es justo el ajuste por RUTA que se acaba de retirar, y no se vuelve a
        // meter por inercia.
        const { servidor, escritos, dichos, encoladas } = conEscritor();
        const { accion } = await conectar(servidor);

        await enviarMensaje(accion, { clase: "modoDeEscritura", modo: "autonomo" });
        await asentar();

        expect(encoladas).toEqual([]);
        expect(escritos).toEqual([]);
        expect(dichos.at(-1)).toMatch(/no hay ninguna sesión abierta/i);
      });

      it("un modo que no existe no se encola: se criba ANTES, no en el manejador", async () => {
        // El manejador ya lo rechazaría, pero su rechazo se imprimiría como una línea de
        // consola en el transcript en vez de como un aviso. Aquí se dice mejor.
        const { servidor, vestibulo, encoladas, dichos } = conEscritor();
        const { accion } = await conectar(servidor);
        await vestibulo.abrirProyecto({ raiz: "/w/a" });
        await asentar();

        // El `as never` es el dato: el TIPO ya lo prohíbe, y lo que se prueba aquí es lo
        // que pasa cuando llega igual — por el cable entra JSON, no un tipo.
        await enviarMensaje(accion, { clase: "modoDeEscritura", modo: "automatica" as never });
        await asentar();

        expect(encoladas).toEqual([]);
        expect(dichos.at(-1)).toMatch(/no es un modo de escritura/i);
      });
    });
    });

    describe("el modelo por defecto en el cable", () => {
      const ultimoModelos = (cliente: ReturnType<typeof clienteDeMentira>) =>
        [...cliente.recibidos].reverse().find((m) => m.clase === "modelos") as Extract<
          MensajeAlCliente,
          { clase: "modelos" }
        >;

      async function conectar(servidor: ReturnType<typeof servidorDeMentira>) {
        const cliente = clienteDeMentira();
        await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
        await asentar();
        return cliente;
      }

      it("viaja SIN sesión abierta: es la pregunta de las sesiones que aún no existen", async () => {
        // Sin este campo, Ajustes enseñaría «sin elegir» sobre una máquina que sí tiene un
        // defecto escrito, y justo en la pantalla donde se configura.
        const servidor = servidorDeMentira();
        montarRutas(servidor, vestibuloDePrueba(), { modeloPorDefecto: () => "ollama/qwen3" });
        const cliente = await conectar(servidor);

        const modelos = ultimoModelos(cliente);
        expect(modelos.porDefecto).toBe("ollama/qwen3");
        // Y `actual` sigue sin afirmarse: son DOS preguntas. El defecto no es el modelo en
        // vigor, y pintarlo como tal diría que hay una sesión que no hay.
        expect(modelos.actual).toBeUndefined();
      });

      it("sin lector no se afirma ningún defecto: ausente no es «ninguno»", async () => {
        const servidor = servidorDeMentira();
        montarRutas(servidor, vestibuloDePrueba());
        const cliente = await conectar(servidor);

        expect(ultimoModelos(cliente).porDefecto).toBeUndefined();
      });
    });

    it("«pedir» pregunta la clave y la guarda si pasa la criba; una mala no llega al disco", async () => {
      // No pasa por la prosa `/provider`: ese camino necesita el lazo de `correrConsola`,
      // que solo existe con un proyecto abierto, y la ventana de ajustes se abre antes.
      const guardadas: string[] = [];
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba();
      montarRutas(servidor, vestibulo, {
        guardarCredencial: (proveedor, clave) => {
          guardadas.push(`${proveedor}:${clave}`);
          return { ruta: "/casa/.xonecode/auth.json" };
        },
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      await enviarMensaje(accion, { clase: "credencial", accion: "pedir", proveedor: "anthropic" });
      await asentar();
      // La pregunta sale por el cable como cualquier otro secreto.
      expect(cliente.recibidos.some((m) => m.clase === "secreto")).toBe(true);

      // Una línea de entorno pegada entera: ni se guarda.
      await enviarMensaje(accion, { clase: "secreto", valor: "ANTHROPIC_API_KEY=sk-1" });
      await asentar();
      expect(guardadas).toEqual([]);

      await enviarMensaje(accion, { clase: "credencial", accion: "pedir", proveedor: "anthropic" });
      await asentar();
      await enviarMensaje(accion, { clase: "secreto", valor: "sk-buena" });
      await asentar();
      expect(guardadas).toEqual(["anthropic:sk-buena"]);
    });

    describe("proveedores personalizados", () => {
      /** Un registro en memoria, que es lo que el host tiene en disco. */
      function conRegistro(iniciales: { slug: string; nombre: string; baseUrl: string }[] = []) {
        let registro = [...iniciales];
        const borradas: string[] = [];
        const servidor = servidorDeMentira();
        montarRutas(servidor, vestibuloDePrueba(), {
          proveedoresPersonalizados: () => registro,
          guardarProveedor: (d) => {
            registro = [...registro, d];
            return { ruta: "/casa/.xonecode/config.json" };
          },
          borrarProveedor: (slug) => {
            const antes = registro.length;
            registro = registro.filter((d) => d.slug !== slug);
            return { ruta: "/casa/.xonecode/config.json", borrado: registro.length !== antes };
          },
          borrarCredencial: (proveedor) => {
            borradas.push(proveedor);
            return { ruta: "/casa/.xonecode/auth.json", borrada: true, quedaEnEntorno: false };
          },
        });
        return { servidor, borradas, registro: () => registro };
      }

      async function conectar(servidor: ReturnType<typeof servidorDeMentira>) {
        const cliente = clienteDeMentira();
        await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
        await asentar();
        return { cliente, accion: servidor.rutas.get(`POST ${RUTA_ACCION}`)! };
      }

      const ultimoModelos = (cliente: ReturnType<typeof clienteDeMentira>) =>
        [...cliente.recibidos].reverse().find((m) => m.clase === "modelos") as Extract<
          MensajeAlCliente,
          { clase: "modelos" }
        >;

      it("el alta deriva el identificador del NOMBRE y devuelve la fila con su URL", async () => {
        const { servidor, registro } = conRegistro();
        const { cliente, accion } = await conectar(servidor);

        await enviarMensaje(accion, {
          clase: "proveedor",
          accion: "alta",
          nombre: "Mi LM Studio",
          baseUrl: "http://localhost:1234/v1",
        });
        await asentar();

        // El cliente no manda el identificador: lo deriva el servidor, para que esa regla
        // viva en un solo sitio.
        expect(registro()).toEqual([
          { slug: "mi-lm-studio", nombre: "Mi LM Studio", baseUrl: "http://localhost:1234/v1" },
        ]);
        const fila = ultimoModelos(cliente).proveedores.find((p) => p.id === "custom:mi-lm-studio")!;
        expect(fila.nombre).toBe("Mi LM Studio");
        expect(fila.personalizado).toBe(true);
        expect(fila.baseUrl).toBe("http://localhost:1234/v1");
        // Y los de serie NO llevan URL: la suya está en el repo, no hay nada que enseñar.
        expect(ultimoModelos(cliente).proveedores.find((p) => p.id === "openai")!.baseUrl).toBeUndefined();
      });

      it("una URL que la regla no admite se rechaza con su motivo, y no escribe nada", async () => {
        const { servidor, registro } = conRegistro();
        const { cliente, accion } = await conectar(servidor);

        await enviarMensaje(accion, {
          clase: "proveedor",
          accion: "alta",
          nombre: "Ajeno",
          baseUrl: "http://ajeno.example.com/v1",
        });
        await asentar();

        const acuse = [...cliente.recibidos].reverse().find((m) => m.clase === "proveedor") as
          { clase: "proveedor"; hecho: boolean; motivo?: string };
        expect(acuse.hecho).toBe(false);
        expect(acuse.motivo).toMatch(/https/);
        expect(registro()).toEqual([]);
      });

      it("un identificador que ya existe se RECHAZA en vez de pisar al que hay", async () => {
        // Pisarlo dejaría dos endpoints compartiendo entrada en `auth.json`: la clave del
        // segundo viajaría al host del primero.
        const { servidor, registro } = conRegistro([
          { slug: "mi-llm", nombre: "Mi LLM", baseUrl: "https://uno.example.com/v1" },
        ]);
        const { cliente, accion } = await conectar(servidor);

        await enviarMensaje(accion, {
          clase: "proveedor",
          accion: "alta",
          nombre: "Mi LLM",
          baseUrl: "https://dos.example.com/v1",
        });
        await asentar();

        const acuse = [...cliente.recibidos].reverse().find((m) => m.clase === "proveedor") as
          { clase: "proveedor"; hecho: boolean; motivo?: string };
        expect(acuse.hecho).toBe(false);
        expect(acuse.motivo).toMatch(/mi-llm/);
        expect(registro()[0]!.baseUrl).toBe("https://uno.example.com/v1");
      });

      it("un nombre del que no sale identificador se rechaza diciéndolo", async () => {
        const { servidor, registro } = conRegistro();
        const { cliente, accion } = await conectar(servidor);
        await enviarMensaje(accion, { clase: "proveedor", accion: "alta", nombre: "¿?¡!", baseUrl: "https://a.example.com/v1" });
        await asentar();
        const acuse = [...cliente.recibidos].reverse().find((m) => m.clase === "proveedor") as
          { clase: "proveedor"; hecho: boolean; motivo?: string };
        expect(acuse.hecho).toBe(false);
        expect(registro()).toEqual([]);
      });

      it("su catálogo se puede pedir: la puerta es la misma que la de los de serie", async () => {
        // Era el botón muerto de este cambio: la puerta del catálogo miraba solo
        // `PROVEEDORES` y devolvía en silencio para un `custom:…`, así que pulsar un
        // proveedor recién dado de alta en la pastilla se quedaba en «consultando…» para
        // siempre. Y quien lo pulsa acaba siendo el modelo.
        const pedidos: string[] = [];
        const servidor = servidorDeMentira();
        montarRutas(servidor, vestibuloDePrueba(), {
          proveedoresPersonalizados: () => [
            { slug: "mi-llm", nombre: "Mi LLM", baseUrl: "https://uno.example.com/v1" },
          ],
          catalogoDeModelos: async (p) => {
            pedidos.push(p);
            return [{ id: "qwen3-coder" }];
          },
        });
        const { cliente, accion } = await conectar(servidor);

        await enviarMensaje(accion, { clase: "catalogo", proveedor: "custom:mi-llm" });
        await asentar();

        // `ollama` y el personalizado se prueban SOLOS al conectar —no llevan clave—, así
        // que lo que este test afirma es que pedirlo a mano llega igual, no que sea el
        // único pedido. Sin el `custom:…` en la lista, la puerta seguiría siendo un botón
        // muerto para un proveedor recién dado de alta.
        expect(pedidos).toContain("custom:mi-llm");
        const fila = ultimoModelos(cliente).proveedores.find((p) => p.id === "custom:mi-llm")!;
        expect(fila.modelos).toEqual([{ id: "qwen3-coder" }]);

        // Y uno que NO está dado de alta se ignora: no se le pide catálogo a un endpoint
        // que no existe. Lo que se cuenta es que no AÑADE ninguna consulta.
        const antes = pedidos.length;
        await enviarMensaje(accion, { clase: "catalogo", proveedor: "custom:fantasma" });
        await asentar();
        expect(pedidos).toHaveLength(antes);
        expect(pedidos).not.toContain("custom:fantasma");
      });

      it("la baja se lleva también la credencial: una clave huérfana sigue siendo un secreto", async () => {
        const { servidor, borradas, registro } = conRegistro([
          { slug: "mi-llm", nombre: "Mi LLM", baseUrl: "https://uno.example.com/v1" },
        ]);
        const { cliente, accion } = await conectar(servidor);

        await enviarMensaje(accion, { clase: "proveedor", accion: "baja", slug: "mi-llm" });
        await asentar();

        expect(registro()).toEqual([]);
        expect(borradas).toEqual(["custom:mi-llm"]);
        expect(ultimoModelos(cliente).proveedores.some((p) => p.id === "custom:mi-llm")).toBe(false);
      });

      it("sin puerto para escribir se contesta que no se puede, no se calla", async () => {
        const servidor = servidorDeMentira();
        montarRutas(servidor, vestibuloDePrueba(), {});
        const { cliente, accion } = await conectar(servidor);
        await enviarMensaje(accion, { clase: "proveedor", accion: "alta", nombre: "X", baseUrl: "https://a.example.com/v1" });
        await asentar();
        const acuse = [...cliente.recibidos].reverse().find((m) => m.clase === "proveedor") as
          { clase: "proveedor"; hecho: boolean; motivo?: string };
        expect(acuse.hecho).toBe(false);
        expect(acuse.motivo).toMatch(/no puede/);
      });
    });

    it("«borrar» borra, lo dice, y reemite el estado de modelos", async () => {
      const borrados: string[] = [];
      const servidor = servidorDeMentira();
      const dichos: string[] = [];
      montarRutas(servidor, vestibuloDePrueba(), {
        informar: (t) => dichos.push(t),
        credencialEnFichero: () => true,
        borrarCredencial: (proveedor) => {
          borrados.push(proveedor);
          return { ruta: "/casa/.xonecode/auth.json", borrada: true, quedaEnEntorno: true };
        },
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      const antes = cliente.recibidos.filter((m) => m.clase === "modelos").length;

      await enviarMensaje(accion, { clase: "credencial", accion: "borrar", proveedor: "openai" });
      await asentar();

      expect(borrados).toEqual(["openai"]);
      expect(dichos.join("\n")).toMatch(/borrada de/);
      // Y se dice lo que el botón NO puede cumplir: la variable de entorno sigue puesta,
      // así que el punto se quedará verde y callarlo parecería un fallo.
      expect(dichos.join("\n")).toMatch(/variable de entorno/);
      expect(cliente.recibidos.filter((m) => m.clase === "modelos").length).toBeGreaterThan(antes);
    });

    it("sin puerto para borrar, no se marca `enFichero`: no se ofrece un botón que no puede cumplir", async () => {
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba(), { credencialEnFichero: () => true });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();
      const modelos = cliente.recibidos.find((m) => m.clase === "modelos") as Extract<
        MensajeAlCliente,
        { clase: "modelos" }
      >;
      expect(modelos.proveedores.every((p) => p.enFichero === undefined)).toBe(true);
    });

    it("un proveedor que no existe no dispara nada: el cable no se tumba por un id inventado", async () => {
      const servidor = servidorDeMentira();
      const consultados: string[] = [];
      montarRutas(servidor, vestibuloDePrueba(), {
        catalogoDeModelos: async (proveedor) => {
          consultados.push(proveedor);
          return [];
        },
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      expect(await enviarMensaje(accion, { clase: "catalogo", proveedor: "no-existe" })).toBe(204);
      await asentar();
      // `ollama` se prueba solo al conectar; lo que este test afirma es que un id inventado
      // no añade NINGUNA consulta.
      expect(consultados).toEqual(["ollama"]);
    });
  });

  /**
   * Los botones de la barra lateral: hasta este cambio, «nueva sesión» y reabrir una
   * guardada eran manejadores vacíos en `App.tsx` — el usuario pulsaba y no pasaba
   * literalmente nada.
   */
  describe("los ficheros de la sesión", () => {
    /**
     * El fallo mudo que esto vigila: `sin-marca` y «no tocó nada» son la MISMA lista vacía
     * en el cable si no se distinguen, y significan lo contrario. Sin proyecto abierto no
     * hay sesión que comparar, y hay que decirlo con ese `via`.
     */
    it("sin proyecto abierto se contesta «sin-marca», no una lista vacía a secas", async () => {
      const servidor = servidorDeMentira();
      const vaciovestibulo = mkdtempSync(join(tmpdir(), "xonecode-vacio-"));
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => vaciovestibulo });
      montarRutas(servidor, vestibulo, {
        cambiosDeSesion: async () => ({ via: "git", ficheros: [{ ruta: "no.xne", clase: "nuevo" }] }),
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "revision" });
      await asentar();

      const m = cliente.recibidos.filter((x) => x.clase === "revision").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "revision" }
      >;
      expect(m.via).toBe("sin-marca");
      expect(m.ficheros).toEqual([]);
      await vestibulo.cerrar();
    });

    it("sin puerto que sepa mirar el repo tampoco se afirma: «sin-marca» igual", async () => {
      const servidor = servidorDeMentira();
      const vaciovestibulo = mkdtempSync(join(tmpdir(), "xonecode-vacio-"));
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => vaciovestibulo });
      // Sin `cambiosDeSesion`: es lo que pasa con un montaje que no trae ese puerto.
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "revision" });
      await asentar();

      const m = cliente.recibidos.filter((x) => x.clase === "revision").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "revision" }
      >;
      expect(m.via).toBe("sin-marca");
      await vestibulo.cerrar();
    });

    /**
     * Lo destapó el propio test: recién abierto un proyecto la sesión NO tiene id todavía
     * —nace al volcar el primer acto—, y contestar «sin-marca» ahí diagnostica mal: la
     * vista mandaría a comprobar si el proyecto es un repositorio de git cuando lo único
     * que pasa es que la sesión acaba de empezar y no ha tocado nada.
     */
    it("recién abierto el proyecto, sin id de sesión todavía, se dice «sin-empezar» y no «sin-marca»", async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-proy-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => base });
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
      mkdirSync(join(raizDeVerdad, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "cloudstudio", "sync.json"), "{}");
      montarRutas(servidor, vestibulo, {
        cambiosDeSesion: async () => ({ via: "git", ficheros: [{ ruta: "no.xne", clase: "nuevo" }] }),
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();
      expect(vestibulo.proyectoAbierto()?.sesion).toBeUndefined();

      await enviarMensaje(accion, { clase: "revision" });
      await asentar();

      const m = cliente.recibidos.filter((x) => x.clase === "revision").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "revision" }
      >;
      expect(m.via).toBe("sin-empezar");
      expect(m.ficheros).toEqual([]);

      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    /**
     * Cambiar de sesión SUELTA el cable de la anterior; no la desconecta. Y la aprobación
     * que dejó pendiente se le REEMITE al volver.
     *
     * Las dos mitades hacen falta y las dos son de este cambio. Con `desconectar` —lo que
     * hacía `adjuntar` cuando solo podía haber una consola— la escritura de un turno de
     * segundo plano se habría RECHAZADO sola por mirar otra cosa, sin que nadie decidiera
     * nada: `alDesconectar` da por rechazada la aprobación en vuelo. Y sin reemitirla, al
     * volver se vería el compositor apagado delante de un turno parado esperando una
     * decisión que no hay forma de dar — ese mensaje es el ÚNICO que no está en la traza
     * (lleva contenido de fichero), así que la reemisión de `adjuntar` no lo alcanzaba.
     */
    /**
     * El último tramo del contador de tokens: que el número SALGA por el cable.
     *
     * Los tres saltos anteriores ya tienen test —los extractores, el vestíbulo y el
     * componente— y aun así el contador no se pintó nunca, porque el que faltaba era este
     * y el de antes. Cubrirlo aquí es lo que impide que vuelva a caerse en silencio.
     */
    /**
     * Medido en la pantalla del usuario: pulsó una conversación y la barra se quedó en
     * «abriendo…» para siempre, sin poder abrir nada más. El `finally` que apaga ese
     * indicador espera a `anunciarAlta()`, y ésa esperaba SIN PLAZO al aviso de trabajo sin
     * commitear — detrás del cual hay un `git status --untracked-files=all` sobre el
     * proyecto del usuario. Un aviso que «avisa, no frena» no puede ser lo que frena.
     */
    it("un aviso de git que no llega NO deja la apertura colgada", async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-plazo-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: () => base,
        proyectosDeEntorno: async () => ({ proyectos: [{ id: "p1", nombre: "Tienda" }] }),
        sesiones: {
          crear: () => "s1",
          listar: () => [{ id: "s1", titulo: "una" }],
          anotar: () => {},
          reabrir: (_r, id) => ({ id, actos: [], historica: true }),
        },
        // El `git status` que no vuelve nunca.
        sinCommitear: () => new Promise(() => {}),
      });
      const raiz = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raiz, ".xonecode"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
      mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      vi.useFakeTimers();
      try {
        const abriendo = enviarMensaje(accion, { clase: "sesion", proyecto: "p1", sesion: "s1" });
        // El plazo vence y el anuncio sale sin ese campo, en vez de no salir nunca.
        await vi.advanceTimersByTimeAsync(MS_DE_TRABAJO_AL_ABRIR + 10);
        await abriendo;
      } finally {
        vi.useRealTimers();
      }
      const ultimos = cliente.recibidos.filter((m) => m.clase === "abriendo");
      // Lo que importa: el flanco de BAJADA llegó. Sin plazo, este mensaje no existía.
      expect(ultimos.at(-1)).toEqual({ clase: "abriendo", activo: false });
    });

    it("lo consumido por la sesión sale por el cable, y en la ráfaga de quien conecta después", async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-tokens-"));
      const servidor = servidorDeMentira();
      let avisar: (() => void) | undefined;
      const consumo = { modelo: { entrada: 0, salida: 0, cache: 0 }, externo: { entrada: 0, salida: 0, cache: 0 }, contexto: 0 };
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: () => base,
        proyectosDeEntorno: async () => ({ proyectos: [{ id: "p1", nombre: "Tienda" }] }),
        sesiones: {
          crear: () => "s1",
          listar: () => [{ id: "s1", titulo: "una" }],
          anotar: () => {},
          reabrir: (_r, id) => ({ id, actos: [], historica: true }),
        },
        crearEjecutor: (alAbrirSesion) => async (_peticion, _estado, consola) => {
          alAbrirSesion({
            cerrar: () => undefined,
            consumo: () => consumo,
            alCambiarConsumo: (oyente) => {
              avisar = oyente;
              return () => undefined;
            },
          });
          consola.escribir("hecho");
        },
        correr: async (consola, estado, ejecutar) => {
          await ejecutar!("una petición", estado, consola);
          for await (const _linea of consola.lineas) {
            // Hasta el EOF.
          }
          return 0;
        },
      });
      const raiz = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raiz, ".xonecode"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
      mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1", sesion: "s1" });
      for (let i = 0; i < 5; i++) await asentar();

      // Cada llamada al modelo mueve el tracker y avisa: el número tiene que MOVERSE
      // mientras el turno corre, no solo al acabar — un turno largo son minutos.
      consumo.modelo = { entrada: 2100, salida: 152, cache: 0 };
      avisar?.();
      await asentar();
      const consumos = cliente.recibidos.filter((m) => m.clase === "consumo");
      expect(consumos.at(-1)).toEqual({
        clase: "consumo",
        modelo: { entrada: 2100, salida: 152, cache: 0 },
        externo: { entrada: 0, salida: 0, cache: 0 },
        // Sin `topeDeContexto` inyectado no hay denominador, que es lo correcto: el tope se
        // resuelve con la MISMA función que la barra del terminal, y aquí no se le da.
        ventana: { usado: 0 },
      });

      // Y con el tope inyectado viaja el denominador. Es la MISMA función que la barra del
      // terminal (`crearTopeDelModelo`), y entra por opción para no importar `cli/` aquí:
      // dos resoluciones del tope serían dos porcentajes distintos para el mismo modelo.
      const conTope = servidorDeMentira();
      montarRutas(conTope, vestibulo, { topeDeContexto: () => 1_000_000 });
      const tercero = clienteDeMentira();
      await conTope.rutas.get(`GET ${RUTA_EVENTOS}`)!(tercero.peticion, tercero.respuesta);
      await asentar();
      expect(tercero.recibidos.filter((m) => m.clase === "consumo").at(-1)).toMatchObject({
        ventana: { tope: 1_000_000 },
      });

      // Y quien conecta DESPUÉS lo recibe en su ráfaga: no vio los avisos anteriores, y sin
      // esto su contador se quedaría a cero hasta el siguiente token — minutos en un turno
      // largo.
      const segundo = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(segundo.peticion, segundo.respuesta);
      await asentar();
      expect(segundo.recibidos.filter((m) => m.clase === "consumo").at(-1)).toMatchObject({
        modelo: { entrada: 2100, salida: 152, cache: 0 },
      });
      /**
       * **Abrir otra conversación limpia el contador, y lo limpia el SERVIDOR.**
       *
       * `consumo` solo viaja cuando el consumo cambia, y abrir una sesión no cambia el
       * consumo: cambia de quién es la cuenta. Sin la reemisión, la caja seguía enseñando los
       * tokens de la conversación anterior hasta la primera llamada del hilo nuevo — lo que el
       * usuario vio en pantalla. Un cero el cliente no lo pinta, así que el contador
       * desaparece, que es lo correcto para una sesión que no ha gastado nada.
       */
      consumo.modelo = { entrada: 0, salida: 0, cache: 0 };
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1", sesion: "s1" });
      for (let i = 0; i < 5; i++) await asentar();
      expect(cliente.recibidos.filter((m) => m.clase === "consumo").at(-1)).toMatchObject({
        modelo: { entrada: 0, salida: 0, cache: 0 },
      });

      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });

    });

    it("cambiar de sesión no rechaza la aprobación de la que dejas atrás, y al volver se reemite", async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-dos-"));
      const servidor = servidorDeMentira();
      let decididas: Map<string, { type: string }> | undefined;
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: () => base,
        proyectosDeEntorno: async () => ({
          proyectos: [
            { id: "p1", nombre: "Tienda" },
            { id: "p2", nombre: "Almacen" },
          ],
        }),
        sesiones: {
          crear: () => "s1",
          listar: () => [{ id: "s1", titulo: "una" }],
          anotar: () => {},
          reabrir: (_r, id) => ({ id, actos: [], historica: true }),
        },
        // Un turno que se para en una aprobación, que es el único sitio donde esto ocurre:
        // una aprobación en vuelo sin turno en vuelo no existe.
        crearEjecutor: () => async (_peticion, _estado, consola) => {
          decididas = (await consola.aprobacionesTui!(
            [{ id: "a1", origen: "dev", descripcion: "escribir /app.xne", decisionesPermitidas: ["approve"] }],
            new Map([["/app.xne", "hola"]]),
            new Map()
          )) as unknown as Map<string, { type: string }>;
        },
        correr: async (consola) => {
          for await (const _linea of consola.lineas) {
            // Hasta el EOF.
          }
          return 0;
        },
      });
      for (const nombre of ["Tienda", "Almacen"]) {
        const raiz = vestibulo.raizDeProyecto("webstudio", nombre);
        mkdirSync(join(raiz, ".xonecode"), { recursive: true });
        writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
        // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
        mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
        writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");
      }
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1", sesion: "s1" });
      await asentar();
      const deP1 = vestibulo.proyectoAbierto()!;
      const turno = deP1.ejecutarTurno("escribe el login", deP1.estadoDeSesion, deP1.consola.consola);
      await asentar();
      const cuantasAprobaciones = (): number => cliente.recibidos.filter((m) => m.clase === "aprobacion").length;
      expect(cuantasAprobaciones()).toBe(1);

      // Se cambia a la OTRA sesión: la de antes se queda trabajando, con su modal pendiente.
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p2" });
      // Varias vueltas de microtareas: abrir dispara el alta y el flanco del turno, que van
      // sueltos a propósito (el `POST` no se queda abierto esperándolos).
      for (let i = 0; i < 5; i++) await asentar();
      expect(deP1.cerrada).toBe(false);
      expect(deP1.turnoEnVuelo).toBe(true);
      // Y no se le ha reemitido a nadie: el modal de otra sesión no puede aparecer aquí.
      expect(cuantasAprobaciones()).toBe(1);

      // Y al volver, sí: es la única forma de contestarla.
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1", sesion: "s1" });
      for (let i = 0; i < 5; i++) await asentar();
      // La MISMA consola, no una reabierta: el turno sigue dentro.
      expect(vestibulo.proyectoAbierto()).toBe(deP1);
      expect(cuantasAprobaciones()).toBe(2);

      await enviarMensaje(accion, { clase: "decision", decisiones: { a1: "approve" } });
      await turno;
      // Aprobada de verdad: si `adjuntar` la hubiera desconectado, aquí habría un rechazo
      // que nadie pidió.
      expect(decididas?.get("a1")?.type).toBe("approve");
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    /**
     * Y el rechazo se DICE en la conversación que se está mirando.
     *
     * `alta.aviso` por este camino no lo pinta nadie —lo leen el wizard y la ventana de
     * sesión nueva, y pulsar una fila de la barra no abre ninguna—, así que sin esto un
     * proyecto que declina por estar trabajando sería un clic que enseña «abriendo…» y
     * después nada: el botón muerto de siempre.
     */
    it("el rechazo al abrir aterriza como acto de SISTEMA en el chat que se está mirando", async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-rech-"));
      const servidor = servidorDeMentira();
      let soltarElTurno: (() => void) | undefined;
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: () => base,
        sesiones: {
          crear: () => "s1",
          listar: () => [
            { id: "s1", titulo: "la que trabaja" },
            { id: "s2", titulo: "la otra" },
          ],
          anotar: () => {},
          reabrir: (_r, id) => ({ id, actos: [], historica: true }),
        },
        crearEjecutor: () => async () => {
          await new Promise<void>((resuelto) => {
            soltarElTurno = resuelto;
          });
        },
        correr: async (consola) => {
          for await (const _linea of consola.lineas) {
            // Hasta el EOF.
          }
          return 0;
        },
      });
      const raiz = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raiz, ".xonecode"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
      mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1", sesion: "s1" });
      await asentar();
      const abierta = vestibulo.proyectoAbierto()!;
      const turno = abierta.ejecutarTurno("arregla el login", abierta.estadoDeSesion, abierta.consola.consola);
      await asentar();

      // La OTRA sesión del MISMO proyecto, con esa trabajando: se declina.
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1", sesion: "s2" });
      for (let i = 0; i < 5; i++) await asentar();
      const dichos = cliente.recibidos
        .filter((m) => m.clase === "acto")
        .map((m) => (m as Extract<MensajeAlCliente, { clase: "acto" }>).acto)
        .filter((a) => a.tipo === "sistema")
        .map((a) => (a as { texto: string }).texto);
      expect(dichos.filter((t) => t.includes("turno en marcha"))).toHaveLength(1);

      // Y otra vez: un botón que rechaza invita a insistir, y cinco clics dejaban CINCO
      // copias del mismo párrafo en el chat (medido en la pantalla del usuario). Una pared de
      // texto repetido dice menos que una línea.
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1", sesion: "s2" });
      for (let i = 0; i < 5; i++) await asentar();
      const otraVez = cliente.recibidos
        .filter((m) => m.clase === "acto")
        .map((m) => (m as Extract<MensajeAlCliente, { clase: "acto" }>).acto)
        .filter((a) => a.tipo === "sistema" && (a as { texto: string }).texto.includes("turno en marcha"));
      expect(otraVez).toHaveLength(1);
      // Y no se ha cerrado la que trabajaba para negarse después: dos daños en vez de uno.
      expect(abierta.cerrada).toBe(false);
      expect(vestibulo.proyectoAbierto()).toBe(abierta);

      soltarElTurno!();
      await turno;
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    it("con proyecto y sesión, la lista sale del puerto y el parche se pide POR RUTA", async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-proy-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => base });
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
      mkdirSync(join(raizDeVerdad, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "cloudstudio", "sync.json"), "{}");

      const pedidos: string[] = [];
      montarRutas(servidor, vestibulo, {
        cambiosDeSesion: async () => ({
          via: "git",
          ficheros: [{ ruta: "src/app.xne", clase: "modificado", mas: 2, menos: 1 }],
        }),
        parcheDeSesion: async (_raiz, _sesion, ruta) => {
          pedidos.push(ruta);
          return { texto: "@@ -1 +1 @@", recortado: false };
        },
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      // Se REABRE una sesión, no se empieza una: el id nace al volcar el primer acto
      // (`vestibulo.ts#volcar`), y sin id lo que se contesta es «sin-empezar» — que es el
      // caso del test de más abajo, no éste.
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1", sesion: "s1" });
      await asentar();
      expect(vestibulo.proyectoAbierto()?.sesion).toBe("s1");

      await enviarMensaje(accion, { clase: "revision" });
      await asentar();
      const lista = cliente.recibidos.filter((x) => x.clase === "revision").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "revision" }
      >;
      expect(lista.via).toBe("git");
      expect(lista.ficheros).toEqual([{ ruta: "src/app.xne", clase: "modificado", mas: 2, menos: 1 }]);

      await enviarMensaje(accion, { clase: "revision", ruta: "src/app.xne" });
      await asentar();
      expect(pedidos).toEqual(["src/app.xne"]);
      const parche = cliente.recibidos.filter((x) => x.clase === "parche").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "parche" }
      >;
      expect(parche).toMatchObject({ ruta: "src/app.xne", texto: "@@ -1 +1 @@", recortado: false });

      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    /**
     * Un parche que no se puede dar se contesta con el texto vacío, no callando: el cliente
     * tiene la fila desplegada esperando, y el silencio la deja «trayendo el diff…» para
     * siempre. Un cargando eterno es un fallo mudo con animación.
     */
    it("sin puerto de parche se contesta igual, con el texto vacío", async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-proy-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => base });
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
      mkdirSync(join(raizDeVerdad, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "cloudstudio", "sync.json"), "{}");
      montarRutas(servidor, vestibulo, { cambiosDeSesion: async () => ({ via: "git", ficheros: [] }) });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1", sesion: "s1" });
      await asentar();

      await enviarMensaje(accion, { clase: "revision", ruta: "src/app.xne" });
      await asentar();

      const parche = cliente.recibidos.filter((x) => x.clase === "parche").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "parche" }
      >;
      expect(parche).toMatchObject({ ruta: "src/app.xne", texto: "", recortado: false });

      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });
  });

  describe("el árbol del proyecto y el contenido de un fichero", () => {
    const abrirProyecto = async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-arbol-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => base });
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
      mkdirSync(join(raizDeVerdad, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "cloudstudio", "sync.json"), "{}");
      return { base, servidor, vestibulo, raizDeVerdad };
    };

    it("con proyecto abierto, «arbol» contesta lo que dice el puerto y «fichero» pide POR RUTA", async () => {
      const { base, servidor, vestibulo } = await abrirProyecto();
      const pedidos: { raiz: string; ruta: string }[] = [];
      montarRutas(servidor, vestibulo, {
        arbolDelProyecto: async () => ({ rutas: ["app.xml", "src/a.xne"], recortado: false }),
        leerFichero: async (raiz, ruta) => {
          pedidos.push({ raiz, ruta });
          return { ruta, texto: "<a/>", recortado: false, binario: false, bytes: 4, codificacion: "utf-8" };
        },
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();

      expect(await enviarMensaje(accion, { clase: "arbol" })).toBe(204);
      await asentar();
      expect(cliente.recibidos.filter((x) => x.clase === "arbol").at(-1)).toEqual({ clase: "arbol", rutas: ["app.xml", "src/a.xne"], recortado: false });

      expect(await enviarMensaje(accion, { clase: "fichero", ruta: "src/a.xne" })).toBe(204);
      await asentar();
      expect(pedidos).toEqual([{ raiz: vestibulo.proyectoAbierto()!.raiz, ruta: "src/a.xne" }]);
      expect(cliente.recibidos.filter((x) => x.clase === "fichero").at(-1)).toMatchObject({ clase: "fichero", ruta: "src/a.xne", texto: "<a/>", bytes: 4 });

      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    it("si el puerto del árbol lanza, se contesta con error y lista vacía, no con silencio", async () => {
      const { base, servidor, vestibulo, raizDeVerdad } = await abrirProyecto();
      const dichos: string[] = [];
      montarRutas(servidor, vestibulo, {
        informar: (t) => dichos.push(t),
        arbolDelProyecto: async () => {
          throw Object.assign(new Error(`EACCES: permission denied, scandir '${raizDeVerdad}'`), { code: "EACCES" });
        },
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();
      await enviarMensaje(accion, { clase: "arbol" });
      await asentar();
      const m = cliente.recibidos.filter((x) => x.clase === "arbol").at(-1) as Extract<MensajeAlCliente, { clase: "arbol" }>;
      expect(m).toEqual({ clase: "arbol", rutas: [], recortado: false, error: "no se pudo listar el proyecto" });
      // La ruta absoluta no sale por NINGÚN mensaje del cable ni por `informar`: en
      // producción `informar` escribe un acto de sistema, o sea también viaja.
      expect(JSON.stringify(cliente.recibidos)).not.toContain(raizDeVerdad);
      expect(dichos.join("\n")).not.toContain(raizDeVerdad);
      expect(dichos.join("\n")).toContain("EACCES");
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    it("si el lector lanza tras el realpath, «fichero» contesta con error y no con silencio", async () => {
      // El lector devuelve los rechazos como `error`, pero un EACCES al abrir el fichero
      // sale como excepción: sin atraparla, el visor se queda en «Trayendo…» para siempre.
      const { base, servidor, vestibulo, raizDeVerdad } = await abrirProyecto();
      const dichos: string[] = [];
      montarRutas(servidor, vestibulo, {
        informar: (t) => dichos.push(t),
        leerFichero: async () => {
          throw Object.assign(new Error(`EACCES: permission denied, open '${raizDeVerdad}/x.xne'`), { code: "EACCES" });
        },
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();
      await enviarMensaje(accion, { clase: "fichero", ruta: "x.xne" });
      await asentar();
      const m = cliente.recibidos.filter((x) => x.clase === "fichero").at(-1) as Extract<MensajeAlCliente, { clase: "fichero" }>;
      expect(m).toEqual({
        clase: "fichero",
        ruta: "x.xne",
        recortado: false,
        binario: false,
        bytes: 0,
        error: "no se pudo leer el fichero",
      });
      expect(JSON.stringify(cliente.recibidos)).not.toContain(raizDeVerdad);
      expect(dichos.join("\n")).not.toContain(raizDeVerdad);
      expect(dichos.join("\n")).toContain("EACCES");
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    it("sin puerto que liste, «arbol» lo dice con error; sin proyecto abierto, no contesta nada", async () => {
      const { base, servidor, vestibulo } = await abrirProyecto();
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      await enviarMensaje(accion, { clase: "arbol" });
      await enviarMensaje(accion, { clase: "fichero", ruta: "x" });
      await asentar();
      expect(cliente.recibidos.some((x) => x.clase === "arbol" || x.clase === "fichero")).toBe(false);

      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();
      await enviarMensaje(accion, { clase: "arbol" });
      await enviarMensaje(accion, { clase: "fichero", ruta: "x.xne" });
      await asentar();
      const m = cliente.recibidos.filter((x) => x.clase === "arbol").at(-1) as Extract<MensajeAlCliente, { clase: "arbol" }>;
      expect(m.rutas).toEqual([]);
      expect(m.error).toBeTypeOf("string");
      // Sin puerto que lea, «fichero» también lo DICE: el cliente tiene un visor abierto
      // esperando ese contenido, y callar lo deja en «Trayendo…» para siempre.
      const f = cliente.recibidos.filter((x) => x.clase === "fichero").at(-1) as Extract<MensajeAlCliente, { clase: "fichero" }>;
      expect(f.ruta).toBe("x.xne");
      expect(f.error).toBeTypeOf("string");
      expect(f.texto).toBeUndefined();
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });
  });

  describe("la sincronización con CloudStudio", () => {
    /**
     * Un proyecto abierto de verdad, con repo y con la ref que deja la bajada, más la costura
     * para mirar lo que se ENCOLA — que es la única forma de afirmar «esto sale por el camino
     * del terminal» sin abrir un socket: la cola la lee el lazo, y aquí el lazo es un doble.
     */
    async function conProyectoDeCloudStudio() {
      const base = mkdtempSync(join(tmpdir(), "xonecode-sync-cable-"));
      const encoladas: string[] = [];
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: () => base,
        crearConsola: (o: OpcionesDeConsolaWeb): ConsolaWeb => {
          const real = crearConsolaWeb(o);
          return {
            ...real,
            encolar: (linea: string) => {
              encoladas.push(linea);
              real.encolar(linea);
            },
          };
        },
      });
      const raiz = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raiz, ".xonecode"), { recursive: true });
      writeFileSync(
        join(raiz, ".xonecode", "config.json"),
        JSON.stringify({
          modo: "cloud",
          cloudstudio: { url: "https://x/mcp", proyecto: { id: "p1", nombre: "Tienda" }, rama: "main" },
        })
      );
      // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
      mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");
      writeFileSync(join(raiz, "app.xml"), "<app/>");
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: raiz });
      execFileSync("git", ["config", "user.email", "t@t"], { cwd: raiz });
      execFileSync("git", ["config", "user.name", "t"], { cwd: raiz });
      execFileSync("git", ["add", "-A"], { cwd: raiz });
      execFileSync("git", ["commit", "-qm", "inicial"], { cwd: raiz });
      execFileSync("git", ["update-ref", "refs/remotes/cloudstudio/main", "HEAD"], { cwd: raiz });

      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();
      return { base, servidor, vestibulo, cliente, accion, encoladas, raiz };
    }

    const ultimoSync = (cliente: ReturnType<typeof clienteDeMentira>) =>
      cliente.recibidos.filter((m) => m.clase === "sync").at(-1) as Extract<MensajeAlCliente, { clase: "sync" }>;

    /**
     * Espera a que hayan llegado `cuantas` lecturas. La medida es un `git diff` DE VERDAD
     * —spawns y promesas encadenadas—, así que un `asentar()` no basta para verla: hay que
     * esperar a que esté, y con un tope para que un fallo se lea como fallo y no cuelgue.
     */
    async function esperarLecturas(cliente: ReturnType<typeof clienteDeMentira>, cuantas: number): Promise<void> {
      for (let i = 0; i < 300; i++) {
        if (cliente.recibidos.filter((m) => m.clase === "sync").length >= cuantas) return;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`no llegaron ${cuantas} lecturas de sync`);
    }

    /**
     * `estado` se MIDE en el servidor, contra la ref de git, y sin abrir sesión MCP: el
     * número ya está en local, y abrir OAuth para contar lo que se sabe sería pedir red y
     * credenciales para pintar un contador. Aquí la cuenta es la de verdad sobre un repo de
     * verdad — la misma que da `/sync estado` (`agent/sesiones/gitSync.ts#cambiosPendientes`).
     */
    it("«estado» mide lo que falta por subir y contesta con la rama", async () => {
      const { base, cliente, accion, vestibulo, raiz, encoladas } = await conProyectoDeCloudStudio();
      expect(await enviarMensaje(accion, { clase: "sync", accion: "estado" })).toBe(204);
      await esperarLecturas(cliente, 1);
      expect(ultimoSync(cliente)).toEqual({ clase: "sync", proyecto: "Tienda", rama: "main", pendientes: 0 });
      // Y NO se encola nada: medir no es una acción del lazo.
      expect(encoladas).toEqual([]);

      writeFileSync(join(raiz, "app.xml"), "<app cambiada/>");
      await enviarMensaje(accion, { clase: "sync", accion: "estado" });
      await esperarLecturas(cliente, 2);
      expect(ultimoSync(cliente).pendientes).toBe(1);
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    /**
     * Y las dos acciones van por el LAZO, con la misma línea que teclea el terminal. Es la
     * decisión de la que depende todo lo demás: el plan, la guarda de árbol sucio y la
     * aprobación salen por donde ya salían, así que no hay un segundo camino por el que una
     * subida pueda quedar autorizada.
     */
    it("«subir» y «bajar» encolan la MISMA línea que el terminal, y no contestan con una cifra", async () => {
      const { base, cliente, accion, vestibulo, encoladas } = await conProyectoDeCloudStudio();
      expect(await enviarMensaje(accion, { clase: "sync", accion: "subir" })).toBe(204);
      expect(await enviarMensaje(accion, { clase: "sync", accion: "bajar" })).toBe(204);
      await asentar();
      expect(encoladas).toEqual(["/sync subir", "/sync bajar"]);
      // Ni una lectura de más: el servidor no sabe cuándo termina una línea encolada, y una
      // cifra recién emitida tras pulsar Subir sería una medida que nadie ha vuelto a hacer.
      expect(cliente.recibidos.filter((m) => m.clase === "sync")).toEqual([]);
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    /**
     * Una acción que no se entiende NO cae en `estado`: en esta casa lo que no se entiende se
     * rechaza. Y se distingue de la clase desconocida por lo mismo que `arbol` sin puerto:
     * el mensaje no sale, y no hay ni cola ni medida.
     */
    it("una acción que no existe no cae en «estado» ni encola nada", async () => {
      const { base, cliente, accion, vestibulo, encoladas } = await conProyectoDeCloudStudio();
      await enviarMensaje(accion, { clase: "sync", accion: "borrar" } as unknown as MensajeDelCliente);
      await enviarMensaje(accion, { clase: "sync" } as unknown as MensajeDelCliente);
      await asentar();
      expect(cliente.recibidos.filter((m) => m.clase === "sync")).toEqual([]);
      expect(encoladas).toEqual([]);
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    /**
     * Sin proyecto abierto no hay nada que sincronizar, y se DICE: la pestaña existe siempre
     * (`Pestanas.tsx`), así que su estado no puede quedarse en «Consultando…» para siempre.
     */
    it("sin proyecto abierto lo dice, en vez de quedarse en silencio", async () => {
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba());
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "sync", accion: "estado" });
      await asentar();
      expect(ultimoSync(cliente).error).toMatch(/no hay ningún proyecto abierto/);
      expect(ultimoSync(cliente).pendientes).toBeUndefined();
    });

    /**
     * Un fichero del proyecto que no está dado de alta en CloudStudio es un estado, no un
     * cero: la medida no se puede hacer, y la pestaña tiene que poder decir esa frase en vez
     * de «0 ficheros por subir».
     */
    it("un proyecto offline llega SIN proyecto ni rama, no con un cero", async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-sync-off-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => base });
      const raiz = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raiz, ".xonecode"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
      mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();
      await enviarMensaje(accion, { clase: "sync", accion: "estado" });
      await asentar();
      expect(ultimoSync(cliente)).toEqual({ clase: "sync" });
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    /**
     * Y la ruta de la raíz no sale por NINGÚN mensaje del cable: el error de la medida se
     * redacta con palabras, porque el stderr de git la traería entera y esto puede ir por un
     * túnel (`sinRutas`).
     */
    it("el fallo de medida no lleva la ruta del proyecto por el cable", async () => {
      const { base, cliente, accion, vestibulo, raiz } = await conProyectoDeCloudStudio();
      // Sin la ref de la bajada no hay contra qué comparar: `cambiosPendientes` lanza.
      execFileSync("git", ["update-ref", "-d", "refs/remotes/cloudstudio/main"], { cwd: raiz });
      await enviarMensaje(accion, { clase: "sync", accion: "estado" });
      await esperarLecturas(cliente, 1);
      const m = ultimoSync(cliente);
      expect(m.error).toMatch(/no se pudo medir/);
      expect(m.pendientes).toBeUndefined();
      expect(JSON.stringify(cliente.recibidos)).not.toContain(raiz);
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });
  });

  describe("abrir una sesión desde la barra", () => {
    it("con la copia local ya bajada se abre directamente: no hay rama que preguntar", async () => {
      const raiz = mkdtempSync(join(tmpdir(), "xonecode-proy-"));
      mkdirSync(join(raiz, ".xonecode"));
      writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
      mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => dirname(raiz) });
      // `raizDeProyecto` compone `<workspace>/<entorno>/<nombre>`, así que el nombre
      // del proyecto se elige para que caiga en la carpeta que acabamos de preparar.
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
      mkdirSync(join(raizDeVerdad, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "cloudstudio", "sync.json"), "{}");

      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();

      expect(vestibulo.proyectoAbierto()?.raiz).toBe(raizDeVerdad);
      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.proyectoAbierto).toBe(true);
      // No se pidió ninguna rama: no hay nada que bajar.
      expect(alta.ramas).toEqual([]);
      await vestibulo.cerrar();
      rmSync(raiz, { recursive: true, force: true });
    });

    /**
     * Abrir tarda: de unos cientos de milisegundos (una copia local: foto de git,
     * checkpointer, índice de sesiones) a los MINUTOS de una descarga. Entre el clic y el
     * estado nuevo el cliente no tiene nada que pintar, y el usuario lo dijo mirando la
     * pantalla: parecía que el clic no hacía nada. Lo anuncia el SERVIDOR y no lo deduce el
     * cliente, por el mismo motivo que el turno en vuelo: solo este lado sabe cuándo acaba,
     * y un `alta` nuevo llega también cuando abrir FALLA.
     */
    it("abrir una sesión anuncia los DOS flancos, y el de bajada va después del alta", async () => {
      const raiz = mkdtempSync(join(tmpdir(), "xonecode-abriendo-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => raiz });
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
      mkdirSync(join(raizDeVerdad, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "cloudstudio", "sync.json"), "{}");

      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      cliente.recibidos.length = 0;

      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1", sesion: "s-7" });
      await asentar();

      const flancos = cliente.recibidos.filter((m) => m.clase === "abriendo");
      expect(flancos).toEqual([
        { clase: "abriendo", activo: true, proyecto: "p1", sesion: "s-7" },
        { clase: "abriendo", activo: false },
      ]);
      // El orden importa: el alta va ENTRE los dos flancos. Al revés hay un hueco en el que
      // ya no hay indicador y todavía no ha llegado el estado nuevo.
      const clases = cliente.recibidos.map((m) => m.clase);
      expect(clases.indexOf("alta")).toBeGreaterThan(clases.indexOf("abriendo"));
      expect(clases.lastIndexOf("abriendo")).toBeGreaterThan(clases.indexOf("alta"));

      await vestibulo.cerrar();
      rmSync(raiz, { recursive: true, force: true });
    });

    it("un fallo al abrir también APAGA el indicador: va en el `finally`", async () => {
      const servidor = servidorDeMentira();
      // Sin entorno elegido no se puede abrir nada, que es el camino de salida temprana.
      const vaciovestibulo = mkdtempSync(join(tmpdir(), "xonecode-vacio-"));
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => vaciovestibulo });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      cliente.recibidos.length = 0;

      // Un proyecto que no está en la lista: se cae al camino del alta y no abre nada.
      await enviarMensaje(accion, { clase: "sesion", proyecto: "no-existe" });
      await asentar();

      const flancos = cliente.recibidos.filter((m) => m.clase === "abriendo");
      expect(flancos.at(-1)).toEqual({ clase: "abriendo", activo: false });
    });

    it("las ramas se piden con el NOMBRE del proyecto, no con el id que trae el cable", async () => {
      const pedidos: string[] = [];
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: (() => {
          const v = mkdtempSync(join(tmpdir(), "xonecode-vacio-"));
          return () => v;
        })(),
        ramasDeProyecto: async (_entorno, proyecto) => {
          pedidos.push(proyecto);
          return ["master"];
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      // El cliente manda el id, que es lo que tiene; el servidor traduce a nombre.
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();
      await enviarMensaje(accion, { clase: "alta", paso: "proyecto", proyecto: "p1" });
      await asentar();

      expect(pedidos).toEqual(["Tienda", "Tienda"]);
    });

    it("sin copia local se cae al camino del alta: contesta las ramas y no abre nada", async () => {
      const servidor = servidorDeMentira();
      const vaciovestibulo = mkdtempSync(join(tmpdir(), "xonecode-vacio-"));
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => vaciovestibulo });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.ramas).toEqual(["master", "pruebas"]);
      expect(vestibulo.proyectoAbierto()).toBeUndefined();
    });

    it("cambiar de entorno trae SUS proyectos y lo dice: nada del anterior se queda debajo", async () => {
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        entornos: [
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp" },
        ],
        proyectosDeEntorno: async (entorno) => ({
          proyectos:
            entorno.id === "casa" ? [{ id: "c1", nombre: "De casa" }] : [{ id: "p1", nombre: "Tienda" }],
        }),
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      await enviarMensaje(accion, { clase: "entorno", accion: "activo", entorno: "casa" });
      await asentar();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.entornoActivo).toBe("casa");
      expect(alta.proyectos.map((p) => p.id)).toEqual(["c1"]);
    });

    it("si el entorno nuevo no contesta, se sigue en el de antes y se dice", async () => {
      // Cambiar de entorno es una conexión con CloudStudio: con el token muerto o la red
      // caída, dejar los proyectos del anterior bajo el nombre del nuevo sería la peor
      // mentira posible en esta barra.
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        entornos: [
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp" },
        ],
        proyectosDeEntorno: async (entorno) => {
          if (entorno.id === "casa") throw new Error("fetch failed");
          return { proyectos: [{ id: "p1", nombre: "Tienda" }] };
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      await enviarMensaje(accion, { clase: "entorno", accion: "activo", entorno: "casa" });
      await asentar();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.entornoActivo).toBe("webstudio");
      expect(alta.proyectos.map((p) => p.id)).toEqual(["p1"]);
      expect(alta.aviso).toBe("fetch failed");
      // Y el indicador se APAGA: va en el `finally`, así que un cambio que falla no deja el
      // «cambiando…» encendido para siempre —y con él el `<select>` apagado— sobre un
      // entorno que resultó no ser el activo.
      expect(cliente.recibidos.filter((m) => m.clase === "abriendo").at(-1)).toEqual({
        clase: "abriendo",
        activo: false,
      });
    });

    /**
     * Y el cambio de entorno, que es la misma espera con un daño de más.
     *
     * Medido en el navegador antes de esto: 1.480 ms entre elegir y ver el entorno nuevo,
     * con el `<select>` clavado en el VIEJO todo el rato y ni una señal en ninguna parte.
     * Lo dijo el usuario con esas palabras: «hay un delay pero no mostramos un loading o
     * busy animation en ningún lado».
     *
     * Lo que se mide aquí y no en el cliente es lo que solo el servidor puede prometer: que
     * el flanco de subida sale ANTES de preguntarle a CloudStudio. El `finally` que lo apaga
     * espera al alta, así que un anuncio puesto DESPUÉS de la espera no llegaría hasta el
     * final — que es exactamente el fallo que esto arregla, y con `proyectosDe` contestando
     * al instante no se vería: hay que dejarlo colgando a propósito.
     */
    it("cambiar de entorno anuncia ANTES de preguntar a CloudStudio, y trae el entorno pedido", async () => {
      const servidor = servidorDeMentira();
      let contestar: ((v: { proyectos: { id: string; nombre: string }[] }) => void) | undefined;
      const vestibulo = vestibuloDePrueba({
        entornos: [
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp" },
        ],
        // La conexión que tarda: sin resolver, el cambio se queda en vuelo.
        proyectosDeEntorno: () =>
          new Promise((r) => {
            contestar = r;
          }),
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      cliente.recibidos.length = 0;

      const enVuelo = enviarMensaje(accion, { clase: "entorno", accion: "activo", entorno: "casa" });
      await asentar();

      // Todavía NO ha contestado CloudStudio, y el flanco de subida ya está en el cable —
      // con el entorno PEDIDO dentro, que es lo que el `<select>` necesita para enseñarlo.
      expect(cliente.recibidos.filter((m) => m.clase === "abriendo")).toEqual([
        { clase: "abriendo", activo: true, entorno: "casa" },
      ]);

      contestar!({ proyectos: [{ id: "c1", nombre: "De casa" }] });
      await enVuelo;
      await asentar();

      const flancos = cliente.recibidos.filter((m) => m.clase === "abriendo");
      expect(flancos).toEqual([
        { clase: "abriendo", activo: true, entorno: "casa" },
        { clase: "abriendo", activo: false },
      ]);
      // El alta va ENTRE los dos: al revés hay un hueco en el que ya no hay indicador y
      // todavía no ha llegado el estado nuevo, y el `<select>` volvería al valor viejo por
      // un cuadro — el mismo parpadeo de 20 px que el icono.
      const clases = cliente.recibidos.map((m) => m.clase);
      expect(clases.indexOf("alta")).toBeGreaterThan(clases.indexOf("abriendo"));
      expect(clases.lastIndexOf("abriendo")).toBeGreaterThan(clases.indexOf("alta"));
    });

    it("pedir los proyectos de un entorno NO cambia el entorno activo", async () => {
      // La pestaña de un entorno en Ajustes necesita SU lista de proyectos, y pedirla no
      // puede mover la barra lateral a otro servidor: abrir Ajustes a marcar una casilla es
      // mirar, no mudarse. Es la diferencia con `accion: "activo"`, que sí muda —y de ahí
      // que la aserción que importa de este test sea la ÚLTIMA.
      const servidor = servidorDeMentira();
      const pedidos: string[] = [];
      const vestibulo = vestibuloDePrueba({
        entornos: [
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp" },
        ],
        proyectosDeEntorno: async (entorno) => {
          pedidos.push(entorno.id);
          return {
            proyectos:
              entorno.id === "casa"
                ? [{ id: "c1", nombre: "De casa", ultimoAcceso: "2026-09-02T04:41:38" }]
                : [{ id: "p1", nombre: "Tienda" }],
          };
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      await enviarMensaje(accion, { clase: "entorno", accion: "proyectos", entorno: "casa" });
      await asentar();

      // Se le preguntó a CloudStudio por ese entorno...
      expect(pedidos).toContain("casa");
      // ...y la respuesta dice de QUIÉN es la lista, porque el cliente la guarda por entorno.
      const respuesta = cliente.recibidos
        .filter((m) => m.clase === "proyectosDeEntorno")
        .at(-1) as Extract<MensajeAlCliente, { clase: "proyectosDeEntorno" }>;
      expect(respuesta.entorno).toBe("casa");
      expect(respuesta.proyectos?.map((p) => p.id)).toEqual(["c1"]);
      // Y el último acceso viaja con él, para que Ajustes pueda ordenar y pintarlo.
      expect(respuesta.proyectos?.[0]?.ultimoAcceso).toBe("2026-09-02T04:41:38");

      // Y lo que sostiene todo el diseño: el activo sigue siendo el de antes, con SUS
      // proyectos. Sin esto, mirar la pestaña del on-premise le cambiaría la barra a quien
      // está trabajando en WebStudio.
      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.entornoActivo).toBe("webstudio");
      expect(alta.proyectos.map((p) => p.id)).toEqual(["p1"]);
    });

    it("refrescar el entorno ACTIVO sí actualiza `alta.proyectos`: es su única fuente", async () => {
      // La barra lateral (`Barra.tsx#alaVista`) cruza `alta.proyectos` (el listado completo)
      // contra `alta.registrados[].proyectos` (los ids marcados en Ajustes). Si el entorno
      // que se refresca es el ACTIVO, `alta.proyectos` tiene que traer lo nuevo — si no, un
      // proyecto recién aparecido se puede marcar visible en Ajustes y nunca llegar a verse:
      // el `filter` de la barra descarta en silencio un id sin proyecto con el que cruzar.
      const servidor = servidorDeMentira();
      let llamadas = 0;
      const vestibulo = vestibuloDePrueba({
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" }],
        proyectosDeEntorno: async () => {
          llamadas++;
          // La primera llamada es la población automática al arrancar; la segunda, este
          // «Refrescar», que descubre un proyecto que no estaba antes.
          return {
            proyectos:
              llamadas === 1
                ? [{ id: "p1", nombre: "Tienda" }]
                : [{ id: "p1", nombre: "Tienda" }, { id: "p2", nombre: "Nueva" }],
          };
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      const altaInicial = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(altaInicial.entornoActivo).toBe("webstudio");
      expect(altaInicial.proyectos.map((p) => p.id)).toEqual(["p1"]);

      await enviarMensaje(accion, { clase: "entorno", accion: "proyectos", entorno: "webstudio" });
      await asentar();

      // El mensaje de la pestaña de Ajustes también trae lo nuevo...
      const respuesta = cliente.recibidos
        .filter((m) => m.clase === "proyectosDeEntorno")
        .at(-1) as Extract<MensajeAlCliente, { clase: "proyectosDeEntorno" }>;
      expect(respuesta.proyectos?.map((p) => p.id)).toEqual(["p1", "p2"]);

      // ...y lo que arregla el bug: la barra también, porque `alta.proyectos` se refrescó.
      const altaTrasRefrescar = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(altaTrasRefrescar.proyectos.map((p) => p.id)).toEqual(["p1", "p2"]);
      // Sin mudar el activo: sigue siendo el mismo entorno, no uno «recién elegido».
      expect(altaTrasRefrescar.entornoActivo).toBe("webstudio");
    });

    it("el entorno que no contesta lleva su error, y los demás siguen usables", async () => {
      // La regla del catálogo de modelos: «el que falla se lista con su error mientras los
      // demás siguen elegibles — un desvío, no un callejón». Aquí igual, y además no se
      // toca el activo ni se pinta un aviso global: el fallo es de ESA pestaña.
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        entornos: [
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp" },
        ],
        proyectosDeEntorno: async (entorno) => {
          if (entorno.id === "casa") throw new Error("fetch failed");
          return { proyectos: [{ id: "p1", nombre: "Tienda" }] };
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      await enviarMensaje(accion, { clase: "entorno", accion: "proyectos", entorno: "casa" });
      await asentar();

      const respuesta = cliente.recibidos
        .filter((m) => m.clase === "proyectosDeEntorno")
        .at(-1) as Extract<MensajeAlCliente, { clase: "proyectosDeEntorno" }>;
      expect(respuesta.entorno).toBe("casa");
      expect(respuesta.error).toBe("fetch failed");
      // Ausente, no una lista vacía: «no se pudo preguntar» no es «no tiene proyectos».
      expect(respuesta.proyectos).toBeUndefined();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.entornoActivo).toBe("webstudio");
    });

    it("con proyecto abierto se dice CUÁL, deducido de su raíz y no de un id guardado aparte", async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-base-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => base });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      // `p1` se llama «Tienda», y su raíz es la que compone `raizDeProyecto`.
      await vestibulo.abrirProyecto({ raiz: vestibulo.raizDeProyecto("webstudio", "Tienda") });
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.proyectoAbierto).toBe(true);
      expect(alta.proyectoActivo).toBe("p1");
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    it("el trabajo que YA HABÍA al abrir viaja en el alta, con sus nombres", async () => {
      // Un contador a secas es el aviso que enseña a ignorar los avisos: quien lo lee
      // tiene que poder saber si eso es suyo, de otra sesión o de una tarea.
      const base = mkdtempSync(join(tmpdir(), "xonecode-base-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: () => base,
        sinCommitear: async () => ({ via: "git", ficheros: ["app.xml", "js/Clientes.js"] }),
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      await vestibulo.abrirProyecto({ raiz: vestibulo.raizDeProyecto("webstudio", "Tienda") });
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.trabajoAlAbrir).toEqual({ ficheros: ["app.xml", "js/Clientes.js"], total: 2 });
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    it("un árbol limpio no manda nada: el alta no da la enhorabuena", async () => {
      // Ausente es «no hay nada que decir». Un mensaje por cada apertura limpia sería
      // ruido en el 90% de las aperturas, y el aviso dejaría de leerse el día que importe.
      const base = mkdtempSync(join(tmpdir(), "xonecode-base-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: () => base,
        sinCommitear: async () => ({ via: "git", ficheros: [] }),
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await vestibulo.abrirProyecto({ raiz: vestibulo.raizDeProyecto("webstudio", "Tienda") });
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.trabajoAlAbrir).toBeUndefined();
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    it("sin git tampoco se manda nada: no se sabe no es no hay", async () => {
      // Todo proyecto OFFLINE es una carpeta sin git, así que ésta es la respuesta normal
      // en la mitad de los proyectos: afirmar algo aquí sería inventárselo.
      const base = mkdtempSync(join(tmpdir(), "xonecode-base-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: () => base,
        sinCommitear: async () => ({ via: "sin-git" }),
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await vestibulo.abrirProyecto({ raiz: vestibulo.raizDeProyecto("webstudio", "Tienda") });
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.trabajoAlAbrir).toBeUndefined();
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    it("solo viaja lo que se pinta: los nombres se acotan y el TOTAL se dice entero", async () => {
      // El alta se reemite en los dos flancos de cada turno, y el aviso no puede listar
      // trescientos nombres de todas formas. Se manda lo que cabe en la frase y la cifra
      // de verdad al lado, que es lo que impide leer «12» como «solo 12».
      const base = mkdtempSync(join(tmpdir(), "xonecode-base-"));
      const servidor = servidorDeMentira();
      const muchos = Array.from({ length: 30 }, (_, i) => `f${String(i).padStart(2, "0")}.xne`);
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: () => base,
        sinCommitear: async () => ({ via: "git", ficheros: muchos }),
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await vestibulo.abrirProyecto({ raiz: vestibulo.raizDeProyecto("webstudio", "Tienda") });
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.trabajoAlAbrir?.ficheros).toEqual(muchos.slice(0, FICHEROS_DEL_AVISO));
      expect(alta.trabajoAlAbrir?.total).toBe(30);
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    it("sin proyecto abierto no se dice ninguno: la barra no marca nada", async () => {
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba());
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();
      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.proyectoActivo).toBeUndefined();
      expect(alta.sesionActiva).toBeUndefined();
    });

    it("las sesiones guardadas viajan con su proyecto: la barra no puede inventárselas", async () => {
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        sesiones: {
          crear: () => "s1",
          listar: () => [{ id: "s7", titulo: "arreglar el alta" }],
          anotar: () => {},
          reabrir: (_r, id) => ({ id, actos: [], historica: true }),
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.proyectos[0]?.sesiones).toEqual([{ id: "s7", titulo: "arreglar el alta" }]);
    });

    /**
     * Y qué sesión está TRABAJANDO, que es lo que hace visible que cambiar de sesión ya no
     * interrumpe al agente: la conversación que dejaste atrás sigue corriendo su turno y la
     * barra lo dice. Va en el alta porque el alta se reemite en los dos flancos de CUALQUIERA
     * de las consolas vivas, que es exactamente cuando esto cambia.
     *
     * Se mide con el turno EN VUELO —sin esperarlo— porque no hay otra forma de que el caso
     * exista: con un ejecutor que devuelve en el acto no hay ningún instante en que medir.
     */
    it("la sesión con un turno en vuelo viaja MARCADA, esté o no en foco", async () => {
      const servidor = servidorDeMentira();
      let soltarElTurno: (() => void) | undefined;
      const vestibulo = vestibuloDePrueba({
        sesiones: {
          crear: () => "s7",
          listar: () => [{ id: "s7", titulo: "arreglar el alta" }],
          anotar: () => {},
          reabrir: (_r, id) => ({ id, actos: [], historica: true }),
        },
        crearEjecutor: () => async () => {
          await new Promise<void>((resuelto) => {
            soltarElTurno = resuelto;
          });
        },
        // El lazo se queda VIVO consumiendo líneas, como el de verdad: con el
        // `async () => 0` de `vestibuloDePrueba` la consola se da por cerrada en el acto y
        // `proyectosAbiertos()` —que descarta las cerradas— no la vería.
        correr: async (consola) => {
          for await (const _linea of consola.lineas) {
            // Hasta el EOF, que es lo que pone `cerrar()`.
          }
          return 0;
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();
      const sinTurno = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
      // Ausente mientras no trabaja: la marca no se pinta «por si acaso».
      expect(sinTurno.proyectos[0]?.sesiones?.[0]?.trabajando).toBeUndefined();

      const abierta = await vestibulo.abrirProyecto({
        raiz: vestibulo.raizDeProyecto("webstudio", "Tienda"),
        sesion: "s7",
      });
      const turno = abierta.ejecutarTurno("arregla el login", abierta.estadoDeSesion, abierta.consola.consola);
      await asentar();
      const trabajando = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
      expect(trabajando.proyectos[0]?.sesiones?.[0]?.trabajando).toBe(true);
      // Y el proyecto NO lo repite: lo dice la fila, que es la que se abre.
      expect(trabajando.proyectos[0]?.trabajando).toBeUndefined();

      soltarElTurno!();
      await turno;
      await asentar();
      const yaNo = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
      expect(yaNo.proyectos[0]?.sesiones?.[0]?.trabajando).toBeUndefined();
      expect(yaNo.proyectos[0]?.trabajando).toBeUndefined();
      await vestibulo.cerrar();
    });

    /**
     * El PROYECTO se marca solo cuando NO hay fila que marcar, que desde que la prosa del
     * usuario da de alta la sesión en el acto es el caso de una TAREA de fondo antes de su
     * primer volcado. Decirlo en los dos niveles a la vez era la duplicación que el usuario
     * señaló: la marca que importa es la de la fila, que es la que se abre.
     */
    it("el proyecto se marca trabajando solo mientras su sesión no tenga fila en el índice", async () => {
      const servidor = servidorDeMentira();
      let soltarElTurno: (() => void) | undefined;
      const vestibulo = vestibuloDePrueba({
        // Sin ninguna sesión guardada: es una conversación nueva y su fila no existe.
        sesiones: {
          crear: () => "nueva",
          listar: () => [],
          anotar: () => {},
          reabrir: (_r, id) => ({ id, actos: [], historica: true }),
        },
        crearEjecutor: () => async () => {
          await new Promise<void>((resuelto) => {
            soltarElTurno = resuelto;
          });
        },
        correr: async (consola) => {
          for await (const _linea of consola.lineas) {
            // Hasta el EOF.
          }
          return 0;
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const abierta = await vestibulo.abrirProyecto({ raiz: vestibulo.raizDeProyecto("webstudio", "Tienda") });
      expect(abierta.sesion).toBeUndefined();
      const turno = abierta.ejecutarTurno("arregla el login", abierta.estadoDeSesion, abierta.consola.consola);
      await asentar();
      const alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
      expect(alta.proyectos[0]?.trabajando).toBe(true);
      // Y no hay ninguna fila que marcar: es justo por eso que el proyecto lleva la suya.
      expect(alta.proyectos[0]?.sesiones).toBeUndefined();

      soltarElTurno!();
      await turno;
      await asentar();
      expect((ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>).proyectos[0]?.trabajando).toBeUndefined();
      await vestibulo.cerrar();
    });

    it("una sesión de TAREA viaja marcada, y con la hora de su último turno", async () => {
      // Las dos cosas que la barra necesita para distinguir las filas: qué es cada una y
      // cuándo se tocó. La marca viene del ÍNDICE y no de cruzar con la cola de tareas, que
      // es opcional en las dos capas — ver `EntradaIndice.tarea`.
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        sesiones: {
          crear: () => "s1",
          listar: () => [
            { id: "s7", titulo: "arreglar el alta", creada: "2026-09-07T08:00:00.000Z", ultimoTurno: "2026-09-07T10:08:23.790Z" },
            { id: "s9", titulo: "", creada: "2026-09-09T05:34:13.915Z", ultimoTurno: "2026-09-09T06:23:12.784Z", tarea: "669c9b79" },
          ],
          anotar: () => {},
          reabrir: (_r, id) => ({ id, actos: [], historica: true }),
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.proyectos[0]?.sesiones).toEqual([
        { id: "s7", titulo: "arreglar el alta", ultimoTurno: "2026-09-07T10:08:23.790Z" },
        { id: "s9", titulo: "", ultimoTurno: "2026-09-09T06:23:12.784Z", deTarea: true },
      ]);
    });

    it("viaja un booleano y no el id de la tarea: solo cruza el cable lo que se pinta", async () => {
      // La fila lleva una marca, no el nombre de la tarea —en 280 px no cabe— así que el
      // id se queda en el host, como la ruta de una herramienta o el pid del corredor.
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        sesiones: {
          crear: () => "s1",
          listar: () => [{ id: "s9", titulo: "", creada: "x", ultimoTurno: "y", tarea: "669c9b79" }],
          anotar: () => {},
          reabrir: (_r, id) => ({ id, actos: [], historica: true }),
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      expect(JSON.stringify(cliente.recibidos)).not.toContain("669c9b79");
    });

    it("el acumulado de la sesión viaja con su fila, y una que no lo trae no manda un cero", async () => {
      // Es lo que la barra pinta al lado de la fecha. Si el campo se quedara en el host —el
      // fallo número diez de este repo: declarado en el tipo y nunca copiado al objeto—, la
      // barra enseñaría filas sin cifra para siempre y nada se pondría rojo.
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        sesiones: {
          crear: () => "s1",
          listar: () => [
            {
              id: "s7",
              titulo: "con gasto",
              creada: "2026-09-07T08:00:00.000Z",
              ultimoTurno: "2026-09-07T10:08:23.790Z",
              consumo: { modelo: { entrada: 11_000, salida: 300, cache: 900 }, externo: { entrada: 0, salida: 0, cache: 0 } },
            },
            { id: "s8", titulo: "anterior a esto", creada: "2026-09-08T08:00:00.000Z", ultimoTurno: "2026-09-08T10:00:00.000Z" },
          ],
          anotar: () => {},
          reabrir: (_r, id) => ({ id, actos: [], historica: true }),
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.proyectos[0]?.sesiones?.[0]?.consumo).toEqual({
        modelo: { entrada: 11_000, salida: 300, cache: 900 },
        externo: { entrada: 0, salida: 0, cache: 0 },
      });
      // La que no lo trae NO lleva la clave: `{consumo: undefined}` afirmaría que hay una
      // medida, y un JSON con la clave a `null` o a cero es como se cuela un `↑0 ↓0` que
      // nadie ha medido.
      expect("consumo" in (alta.proyectos[0]?.sesiones?.[1] ?? {})).toBe(false);
    });

    it("la siembra corre ANTES de leer la lista: el alta que la dispara ya trae las cifras", async () => {
      // Contra un índice DE VERDAD, y no contra el doble: la siembra es una función real que
      // toca disco y NO pasa por el puerto, así que un doble de sesiones no la ejercita. Es
      // la forma exacta del fallo número diez de este repo —una composición de producción
      // viviendo en un cierre que todos los tests doblan— y por eso se monta aquí un
      // proyecto en un temporal y se lee su `indice.json`.
      //
      // Y lo que se fija no es solo que corra, sino el ORDEN: si sembrara después de leer la
      // lista, este mismo alta no llevaría la cifra y haría falta un reanuncio — una segunda
      // pasada por el cable solo para enseñar un número que ya se tenía.
      const base = mkdtempSync(join(tmpdir(), "xonecode-ws-"));
      const raiz = join(base, "webstudio", "Tienda");
      crearSesion(raiz, "s-vieja");
      // Una sesión anterior a esto: su `.jsonl` tiene el `fin` con su consumo y su entrada
      // del índice no lo trae.
      writeFileSync(
        join(raiz, ".xonecode", "sesiones", "s-vieja.jsonl"),
        JSON.stringify({
          tipo: "fin",
          ms: 10,
          consumo: { modelo: { entrada: 11_000, salida: 300, cache: 0 }, externo: { entrada: 0, salida: 0, cache: 0 } },
        }) + "\n"
      );
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: () => base,
        sesiones: {
          crear: () => "s1",
          listar: (r: string) => listarSesiones(r),
          anotar: () => {},
          reabrir: (_r, id) => ({ id, actos: [], historica: true }),
        },
      });
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();

      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.proyectos[0]?.sesiones?.[0]?.consumo?.modelo).toEqual({ entrada: 11_000, salida: 300, cache: 0 });
      // Y quedó ESCRITO, no solo pintado: la próxima vez que se liste ya está, sin releer.
      expect(listarSesiones(raiz)[0]?.consumo?.modelo.entrada).toBe(11_000);
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    it("y se intenta UNA vez por raíz: el siguiente anuncio no vuelve a medir los `.jsonl`", async () => {
      // El alta se anuncia dos veces por turno y recorre todos los proyectos, así que sin la
      // marca cada anuncio releería el índice de cada raíz y mediría sus ficheros — trabajo
      // síncrono en el bucle de eventos, multiplicado. Lo que se pierde por intentarlo una
      // sola vez no es una cifra: es que salga en la barra un poco antes, porque en cuanto
      // esa sesión se use la pondrá `anotarActo`, entera.
      const base = mkdtempSync(join(tmpdir(), "xonecode-ws-"));
      const raiz = join(base, "webstudio", "Tienda");
      crearSesion(raiz, "s-vieja");
      const jsonl = join(raiz, ".xonecode", "sesiones", "s-vieja.jsonl");
      writeFileSync(
        jsonl,
        JSON.stringify({
          tipo: "fin",
          ms: 10,
          consumo: { modelo: { entrada: 500, salida: 50, cache: 0 }, externo: { entrada: 0, salida: 0, cache: 0 } },
        }) + "\n"
      );
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: () => base,
        sesiones: {
          crear: () => "s1",
          listar: (r: string) => listarSesiones(r),
          anotar: () => {},
          reabrir: (_r, id) => ({ id, actos: [], historica: true }),
        },
      });
      montarRutas(servidor, vestibulo);
      const primera = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(primera.peticion, primera.respuesta);
      await asentar();

      // Se le quita el acumulado al índice por debajo: si la siembra volviera a correr, lo
      // repondría. Que no vuelva es lo que se afirma.
      const indice = join(raiz, ".xonecode", "sesiones", "indice.json");
      const entradas = JSON.parse(readFileSync(indice, "utf8"));
      for (const e of entradas) delete e.consumo;
      writeFileSync(indice, JSON.stringify(entradas));

      const segunda = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(segunda.peticion, segunda.respuesta);
      await asentar();
      const alta = segunda.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect("consumo" in (alta.proyectos[0]?.sesiones?.[0] ?? {})).toBe(false);
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });
  });

  /**
   * Medido en pantalla con una pestaña local y otra por un túnel: el servidor guardaba UNA
   * ranura de sumidero, así que el último en conectar dejaba muda a la anterior sin
   * decírselo. La pestaña vieja se quedaba con el SSE abierto y la interfaz congelada en el
   * último estado que le llegó — el menú de modelos, en «consultando…» para siempre, porque
   * la respuesta se la llevaba la otra.
   */
  describe("varios clientes a la vez", () => {
    it("lo que se emite llega a TODAS las pestañas, no solo a la última", async () => {
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba();
      montarRutas(servidor, vestibulo, { catalogoDeModelos: async () => [{ id: "qwen3" }] });
      const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;

      const una = clienteDeMentira();
      await eventos(una.peticion, una.respuesta);
      const otra = clienteDeMentira();
      await eventos(otra.peticion, otra.respuesta);
      await asentar();
      const antes = una.recibidos.length;

      await enviarMensaje(accion, { clase: "catalogo", proveedor: "ollama" });
      await asentar();

      // La PRIMERA también se entera, que es lo que no pasaba.
      const suyo = una.recibidos.slice(antes).filter((m) => m.clase === "modelos");
      expect(suyo.length).toBeGreaterThan(0);
      expect(otra.recibidos.filter((m) => m.clase === "modelos").length).toBeGreaterThan(0);
    });

    it("la ráfaga de bienvenida es solo para el que llega: no se repite en las demás", async () => {
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba());
      const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;

      const una = clienteDeMentira();
      await eventos(una.peticion, una.respuesta);
      await asentar();

      const otra = clienteDeMentira();
      await eventos(otra.peticion, otra.respuesta);
      await asentar();

      // Repetirle el transcript entero a quien ya lo tiene, cada vez que alguien abre otra
      // pestaña, sería duplicarle la conversación en pantalla. Lo COMPARTIDO —el estado del
      // alta, que cambia para todos— sí le vuelve a llegar, y debe.
      expect(una.recibidos.filter((m) => m.clase === "reemision")).toHaveLength(1);
      expect(una.recibidos.filter((m) => m.clase === "bienvenida")).toHaveLength(1);
      expect(otra.recibidos.map((m) => m.clase)).toContain("reemision");
    });

    /**
     * El fallo MEDIDO que esto vigila: al abrir un proyecto, el cable se muda a su consola
     * y esa consola se quedaba sin ningún sumidero registrado. El turno corría —el agente
     * trabajaba de verdad— y no salía nada por pantalla: escribir y que no pasara nada.
     */
    it("al abrir proyecto, TODOS los clientes quedan enganchados a la consola nueva", async () => {
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba();
      montarRutas(servidor, vestibulo);
      const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;

      const una = clienteDeMentira();
      await eventos(una.peticion, una.respuesta);
      const otra = clienteDeMentira();
      await eventos(otra.peticion, otra.respuesta);
      await asentar();

      await enviarMensaje(accion, { clase: "alta", paso: "proyecto", proyecto: "p1", rama: "master" });
      await asentar();
      const abierto = vestibulo.proyectoAbierto()!;
      una.recibidos.length = 0;
      otra.recibidos.length = 0;

      // Lo que escriba la consola del PROYECTO tiene que llegar a las dos pestañas.
      abierto.consola.consola.escribir("el agente dice algo\n");
      await asentar();

      expect(una.recibidos.some((m) => m.clase === "acto")).toBe(true);
      expect(otra.recibidos.some((m) => m.clase === "acto")).toBe(true);
      await vestibulo.cerrar();
    });

    it("cerrar UNA pestaña no deja sin humano a la consola: eso solo pasa con la última", async () => {
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba();
      montarRutas(servidor, vestibulo);
      const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;

      const una = clienteDeMentira();
      await eventos(una.peticion, una.respuesta);
      const otra = clienteDeMentira();
      await eventos(otra.peticion, otra.respuesta);
      await asentar();

      una.cerrar();
      // Con una pestaña abierta todavía, `eof()` no puede decir que no hay nadie: diría que
      // sí a rechazar la aprobación que la otra tiene delante.
      expect(vestibulo.consola.consola.eof!()).toBe(false);

      otra.cerrar();
      expect(vestibulo.consola.consola.eof!()).toBe(true);
    });
  });

  it("un `close` que llega tarde no desconecta al cliente que acaba de entrar", async () => {
    // Una pestaña recargada: el `close` de la vieja puede llegar DESPUÉS del SSE nuevo.
    // Sin la guarda, desconectaba la consola del cliente recién llegado y a partir de ahí
    // toda aprobación se rechazaba sola.
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba();
    montarRutas(servidor, vestibulo);
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;
    const vieja = clienteDeMentira();
    await eventos(vieja.peticion, vieja.respuesta);
    const nueva = clienteDeMentira();
    await eventos(nueva.peticion, nueva.respuesta);
    await asentar();
    vieja.cerrar();
    expect(vestibulo.consola.consola.eof!()).toBe(false);
  });

  it("con rama abre el proyecto Y el cable se muda a su consola: si no, cada aprobación se rechazaría sola", async () => {
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba();
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();

    await enviarMensaje(accion, {
      clase: "alta",
      paso: "entorno",
      entorno: { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
    });
    await asentar();
    await enviarMensaje(accion, { clase: "alta", paso: "proyecto", proyecto: "p1", rama: "master" });
    await asentar();

    const abierto = vestibulo.proyectoAbierto();
    expect(abierto).toBeDefined();
    // LA comprobación que sostiene todo lo demás: `consolaWeb.eof()` es
    // `!transporte.conectado()`, y con la consola del proyecto sin cliente TODA aprobación
    // sale rechazada y todo `preguntar` responde cadena vacía, sin decir por qué.
    expect(abierto!.consola.consola.eof!()).toBe(false);
    // Y el alta ya no pide nada.
    const alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.clase).toBe("alta");
    expect(alta.pasos).toEqual([]);
  });

  it("la prosa llega a la consola del proyecto abierto, no a la del vestíbulo", async () => {
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba();
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    await enviarMensaje(accion, {
      clase: "alta",
      paso: "entorno",
      entorno: { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
    });
    await asentar();
    await enviarMensaje(accion, { clase: "alta", paso: "proyecto", proyecto: "p1", rama: "master" });
    await asentar();

    await enviarMensaje(accion, { clase: "prosa", texto: "haz un listado" });
    expect(vestibulo.proyectoAbierto()!.actos()).toContainEqual({ tipo: "usuario", texto: "haz un listado" });
    expect(vestibulo.consola.actos()).not.toContainEqual({ tipo: "usuario", texto: "haz un listado" });
  });

  it("un error del alta llega al NAVEGADOR como acto, no solo al terminal", async () => {
    // Medido antes de este arreglo: `montarRutas` recibía un `informar` que solo escribía
    // en el terminal, así que una URL rechazada o un `fetch failed` durante la descarga
    // salían por la consola del proceso y no llegaban por el SSE. El `finally` re-anunciaba
    // el alta, el wizard repintaba el mismo paso, y el usuario no leía ni una palabra —
    // en una piel que vive en un navegador donde el terminal puede ni verse.
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba({
      proyectosDeEntorno: async () => {
        throw new Error("fetch failed");
      },
    });
    const alTerminal: string[] = [];
    montarRutas(servidor, vestibulo, {
      informar: (texto) => {
        alTerminal.push(texto);
        vestibulo.consola.consola.escribir(`${texto}\n`);
      },
    });
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();

    await enviarMensaje(accion, {
      clase: "alta",
      paso: "entorno",
      entorno: { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
    });
    await asentar();

    expect(alTerminal).toContain("fetch failed");
    // Y en el propio paso del alta, que es donde el usuario está mirando: el acto de
    // sistema se ve en la Trayectoria, la OTRA pestaña.
    const alta = ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.aviso).toBe("fetch failed");
    const actos = cliente.recibidos
      .filter((m): m is Extract<MensajeAlCliente, { clase: "acto" }> => m.clase === "acto")
      .map((m) => (m.acto.tipo === "sistema" ? m.acto.texto : ""));
    expect(actos).toContain("fetch failed");
  });

  it("el aviso de un paso fallido no se queda pegado al siguiente que sale bien", async () => {
    let falla = true;
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba({
      proyectosDeEntorno: async () => {
        if (falla) throw new Error("fetch failed");
        return { proyectos: [{ id: "p1", nombre: "Tienda" }] };
      },
    });
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    const entorno = {
      clase: "alta" as const,
      paso: "entorno" as const,
      entorno: { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
    };
    await enviarMensaje(accion, entorno);
    await asentar();
    expect((ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>).aviso).toBe("fetch failed");

    falla = false;
    await enviarMensaje(accion, entorno);
    await asentar();
    // Un aviso viejo pegado a un paso que ya salió bien sería una mentira con forma de error.
    expect((ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>).aviso).toBeUndefined();
  });

  it("un cuerpo ilegible es 400 y no devuelve NADA de lo recibido: por ahí pasa la clave", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba());
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`);
    expect(await postear(accion!, "{no es json")).toBe(400);
  });

  it("al cerrarse el SSE se desconecta la consola: quien esperaba deja de esperar", async () => {
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba();
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();
    expect(vestibulo.consola.consola.eof!()).toBe(false);
    cliente.cerrar();
    expect(vestibulo.consola.consola.eof!()).toBe(true);
  });

  /**
   * `cuentaHecha` (`arranque.ts`) se marcaba ANTES de esperar `pasoDeCuenta()`: recargar a
   * mitad del selector de proveedor —nadie contesta, el SSE se cae— dejaba el paso «hecho»
   * para el resto del proceso sin que ningún humano hubiera elegido nada, y la siguiente
   * conexión saltaba derecho al alta de entorno. `origenDeTrabajo: "omision"` es lo que
   * hace que `pasosPendientes()` incluya «cuenta» de verdad (`vestibuloDePrueba` usa
   * `"global"` en el resto de tests para no conducirla).
   */
  describe("conducirCuenta — lo que nadie contestó no cuenta como hecho", () => {
    it("una conexión que se cae a mitad del selector no le cuesta el paso a la siguiente", async () => {
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba({ origenDeTrabajo: "omision" }));
      const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;

      const primera = clienteDeMentira();
      await eventos(primera.peticion, primera.respuesta);
      await asentar();
      // El selector de «Proveedor de modelos» llegó y se quedó sin contestar.
      expect(primera.recibidos.map((m) => m.clase)).toContain("selector");

      primera.cerrar();
      await asentar();

      const segunda = clienteDeMentira();
      await eventos(segunda.peticion, segunda.respuesta);
      await asentar();

      // Sin el arreglo, `cuentaHecha` ya llevaba en `true` desde que arrancó la primera
      // conexión, y esto habría sido un `alta` con «entorno» de primeras y NINGÚN
      // selector — el paso de cuenta, saltado en silencio.
      expect(segunda.recibidos.map((m) => m.clase)).toContain("selector");
      expect(segunda.recibidos.some((m) => m.clase === "alta")).toBe(false);
    });

    it("«volver al modelo» reconduce el asistente: llega un selector nuevo", async () => {
      // La progresión del alta ofrece volver al paso hecho (`PasosDelAlta`), y lo único que
      // manda el cliente es este mensaje: el asistente lo pinta el servidor, por `selector`
      // y `secreto`.
      const servidor = servidorDeMentira();
      montarRutas(
        servidor,
        vestibuloDePrueba({
          origenDeTrabajo: "omision",
          // Con el catálogo vacío el asistente no daría el paso por bueno (listar es la
          // validación de la conexión): haría falta un modelo de verdad que elegir.
          catalogoModelos: new CatalogoModelosEnMemoria({
            ollama: [{ proveedor: "ollama", id: "qwen3", nombre: "Qwen 3" }],
          }),
        })
      );
      const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      const cliente = clienteDeMentira();
      await eventos(cliente.peticion, cliente.respuesta);
      await asentar();

      // Se contesta el paso ENTERO —proveedor y modelo—, que es lo que lo da por hecho.
      await enviarMensaje(accion, { clase: "eleccion", id: "ollama" });
      await asentar();
      await enviarMensaje(accion, { clase: "eleccion", id: "qwen3" });
      await asentar();
      const antes = cliente.recibidos.filter((m) => m.clase === "selector").length;
      expect(antes).toBe(2);
      // El alta ya se anunció: el paso está hecho y en pantalla tocaría el de entorno.
      expect(cliente.recibidos.some((m) => m.clase === "alta")).toBe(true);

      await enviarMensaje(accion, { clase: "alta", paso: "cuenta" });
      await asentar();

      expect(cliente.recibidos.filter((m) => m.clase === "selector").length).toBeGreaterThan(antes);
      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as
        | Extract<MensajeAlCliente, { clase: "alta" }>
        | undefined;
      // Y no se cuela un aviso: aquí SÍ había algo que volver a preguntar.
      expect(alta?.aviso).toBeUndefined();
    });

    it("si el modelo no lo decide el alta, volver a él lo DICE en vez de no hacer nada", async () => {
      // `origenDeTrabajo: "global"` = alguien ya lo eligió fuera (una bandera, la config).
      // El asistente no pregunta nada en ese caso, así que un botón «Modelo ✓» que no
      // hiciera nada al pulsarlo sería el fallo mudo de siempre.
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba());
      const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      const cliente = clienteDeMentira();
      await eventos(cliente.peticion, cliente.respuesta);
      await asentar();

      await enviarMensaje(accion, { clase: "alta", paso: "cuenta" });
      await asentar();

      expect(cliente.recibidos.some((m) => m.clase === "selector")).toBe(false);
      const alta = cliente.recibidos.filter((m) => m.clase === "alta").at(-1) as Extract<
        MensajeAlCliente,
        { clase: "alta" }
      >;
      expect(alta.aviso).toMatch(/no lo decide el alta/i);
      expect(alta.aviso).toMatch(/\/modelo/);
    });

    it("dos conexiones solapadas comparten el MISMO paso en curso: no hay dos selectores en vuelo", async () => {
      // Dos pestañas, o una reconexión que adelanta al cierre de la vieja: las dos
      // llegan con `cuentaHecha` todavía en `false`. Sin compartir la llamada, cada una
      // lanzaría su propio `asistenteDeModelo`, y las dos apilarían un resolutor en la
      // MISMA cola FIFO de `consolaWeb.ts#seleccionar` — la respuesta de una pestaña
      // resolviendo la pregunta de la otra.
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba({ origenDeTrabajo: "omision" }));
      const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;

      const uno = clienteDeMentira();
      await eventos(uno.peticion, uno.respuesta);
      await asentar(); // el selector de `uno` ya salió y sigue sin contestar

      const dos = clienteDeMentira();
      await eventos(dos.peticion, dos.respuesta);
      await asentar();

      expect(uno.recibidos.filter((m) => m.clase === "selector")).toHaveLength(1);
      expect(dos.recibidos.filter((m) => m.clase === "selector")).toHaveLength(0);
    });
  });

  /**
   * Un borrado DECLINADO no se cuenta como «ya no estaba».
   *
   * `borrarSesion` declina cuando la conversación es la de una tarea en curso (ver
   * `vestibulo.ts`), y el mensaje de siempre para `borrada: false` es «esa sesión ya no
   * estaba» — que ahí sería falso en la dirección peor: la fila sigue en la barra, y al
   * usuario le habríamos dicho que se fue. Se dice el motivo del vestíbulo y nada más.
   */
  it("un borrado declinado dice el MOTIVO, no «esa sesión ya no estaba»", async () => {
    const servidor = servidorDeMentira();
    const dichos: string[] = [];
    const motivo = "esa conversación es la de una tarea en curso: se podrá borrar cuando termine";
    montarRutas(
      servidor,
      {
        ...vestibuloDePrueba(),
        borrarSesion: async () => ({ borrada: false, cerroLaAbierta: false, motivo }),
      },
      { informar: (texto) => dichos.push(texto) }
    );
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();

    await postear(
      servidor.rutas.get(`POST ${RUTA_ACCION}`)!,
      JSON.stringify({ clase: "sesionAccion", accion: "borrar", proyecto: "p1", sesion: "s1" })
    );
    await asentar();

    expect(dichos).toContain(motivo);
    expect(dichos).not.toContain("esa sesión ya no estaba");
    expect(dichos).not.toContain("sesión borrada");
    // Y viaja en el alta como los demás rechazos de este camino, que es lo que la barra
    // pinta sin tener que leer el transcript.
    const altas = cliente.recibidos.filter((m) => m.clase === "alta");
    expect((altas.at(-1) as { aviso?: string }).aviso).toBe(motivo);
  });

  /**
   * Borrar la sesión ABIERTA libera su proyecto, y hay que decírselo a la cola.
   *
   * En un proyecto con la consola de una persona abierta no arranca ninguna tarea (gana la
   * persona, `core/tareas.ts#siguientesAEjecutar`), y el corredor no tiene temporizador: se
   * revisa por evento. Este es el ÚNICO camino en el que la consola humana se cierra sin
   * que se abra otra, así que sin esta llamada una tarea que esperaba a esa persona se
   * quedaría esperando al siguiente evento que no tiene nada que ver — en pantalla, un
   * cuelgue.
   */
  it("borrar la sesión abierta hace REVISAR la cola de tareas", async () => {
    const servidor = servidorDeMentira();
    let revisado = 0;
    montarRutas(
      servidor,
      { ...vestibuloDePrueba(), borrarSesion: async () => ({ borrada: true, cerroLaAbierta: true }) },
      { revisarTareas: () => void (revisado += 1) }
    );
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();

    await postear(
      servidor.rutas.get(`POST ${RUTA_ACCION}`)!,
      JSON.stringify({ clase: "sesionAccion", accion: "borrar", proyecto: "p1", sesion: "s1" })
    );
    await asentar();
    expect(revisado).toBe(1);
  });

  it("y borrar una que NO era la abierta no revisa nada: no se ha liberado ningún proyecto", async () => {
    const servidor = servidorDeMentira();
    let revisado = 0;
    montarRutas(
      servidor,
      { ...vestibuloDePrueba(), borrarSesion: async () => ({ borrada: true, cerroLaAbierta: false }) },
      { revisarTareas: () => void (revisado += 1) }
    );
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();

    await postear(
      servidor.rutas.get(`POST ${RUTA_ACCION}`)!,
      JSON.stringify({ clase: "sesionAccion", accion: "borrar", proyecto: "p1", sesion: "s1" })
    );
    await asentar();
    expect(revisado).toBe(0);
  });
});

/**
 * Los subagentes, por el cable: los dos únicos sitios donde la regla de «de serie» se decide.
 *
 * Con `HOME` mudado a un temporal, y no es higiene: sin eso un `borrar` que dejara de estar
 * guardado se llevaría el `docs.md` REAL del usuario al correr los tests. Un test que puede
 * borrar el trabajo de quien lo corre no prueba la guarda, la usa.
 */
describe("los subagentes, por el cable", () => {
  let casa = "";
  let previo: string | undefined;

  beforeEach(() => {
    casa = mkdtempSync(join(tmpdir(), "xonecode-cable-agentes-"));
    previo = process.env["HOME"];
    process.env["HOME"] = casa;
  });
  afterEach(() => {
    if (previo === undefined) delete process.env["HOME"];
    else process.env["HOME"] = previo;
    rmSync(casa, { recursive: true, force: true });
  });

  /** `undefined` si esta plataforma no respeta `HOME`: ahí el test no puede afirmar nada. */
  const carpeta = (): string | undefined =>
    rutaGlobalDeAgentes().startsWith(casa) ? rutaGlobalDeAgentes() : undefined;

  const conectar = async (): Promise<{
    accion: ManejadorRuta;
    cliente: ReturnType<typeof clienteDeMentira>;
    dichos: string[];
  }> => {
    const dichos: string[] = [];
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { informar: (t) => dichos.push(t) });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    return { accion: servidor.rutas.get(`POST ${RUTA_ACCION}`)!, cliente, dichos };
  };

  const deSerie = (): AgenteDelCable => ({
    nombre: "consultant-xone",
    descripcion: "da igual: el servidor solo mira el nombre y el ámbito",
    motor: "modelo",
    soloLectura: true,
    skills: [],
    instrucciones: "",
  });

  /**
   * La regla se decide en `marcarSemilla` y se prueba ahí; aquí solo se comprueba que LLEGA.
   * Es el patrón de las nueve veces: el campo podía quedarse sin reenviar en el `map` de
   * `mensajeDeAgentes` con todo lo demás en verde, porque es opcional en el tipo del cable.
   */
  it("`semilla` viaja: sin ella el cliente no puede separar los dos grupos", async () => {
    if (carpeta() === undefined) return;
    const { cliente } = await conectar();
    const agentes = cliente.recibidos.filter((m) => m.clase === "agentes").at(-1);
    expect(agentes).toBeDefined();
    const lista = (agentes as { agentes: AgenteDelCable[] }).agentes;
    expect(lista.find((a) => a.nombre === "consultant-xone")?.semilla).toBe("intacta");
  });

  it("un `borrar` de uno de serie se RECHAZA, y su `.md` sigue ahí", async () => {
    // La guarda vive en el servidor y no solo en el cliente, que le esconde el icono:
    // esconderlo es presentación, y este mensaje lo puede mandar cualquiera que hable por el
    // cable. Y el rechazo DICE la alternativa, porque el usuario quería algo y sigue queriéndolo.
    const dir = carpeta();
    if (dir === undefined) return;
    const { accion, dichos } = await conectar();
    expect(existsSync(join(dir, "consultant-xone.md"))).toBe(true);

    await enviarMensaje(accion, { clase: "agente", accion: "borrar", ambito: "global", agente: deSerie() });
    await asentar();

    expect(existsSync(join(dir, "consultant-xone.md"))).toBe(true);
    expect(dichos.join("\n")).toMatch(/no se borra/);
    expect(dichos.join("\n")).toMatch(/restaura/);
  });

  it("uno del USUARIO sí se borra: la guarda es para los de serie, no para todos", async () => {
    const dir = carpeta();
    if (dir === undefined) return;
    const { accion } = await conectar();
    writeFileSync(join(dir, "mio.md"), "---\ndescripcion: el mío\n---\ncuerpo", "utf8");

    await enviarMensaje(accion, {
      clase: "agente",
      accion: "borrar",
      ambito: "global",
      agente: { ...deSerie(), nombre: "mio" },
    });
    await asentar();

    expect(existsSync(join(dir, "mio.md"))).toBe(false);
  });

  it("`restaurar` reescribe el `.md` y vuelve a decir `intacta`", async () => {
    const dir = carpeta();
    if (dir === undefined) return;
    const { accion, cliente, dichos } = await conectar();
    writeFileSync(join(dir, "consultant-xone.md"), "---\ndescripcion: mío\n---\nMÍO", "utf8");

    await enviarMensaje(accion, { clase: "agente", accion: "restaurar", ambito: "global", agente: deSerie() });
    await asentar();

    expect(readFileSync(join(dir, "consultant-xone.md"), "utf8")).not.toContain("MÍO");
    expect(dichos.join("\n")).toMatch(/restaurado/);
    // Y la lista se reemite: el botón desaparece sin recargar, porque ya no hay nada que restaurar.
    const lista = (cliente.recibidos.filter((m) => m.clase === "agentes").at(-1) as {
      agentes: AgenteDelCable[];
    }).agentes;
    expect(lista.find((a) => a.nombre === "consultant-xone")?.semilla).toBe("intacta");
  });

  it("un `restaurar` de algo que no es de serie se dice, no se inventa una versión", async () => {
    if (carpeta() === undefined) return;
    const { accion, dichos } = await conectar();
    await enviarMensaje(accion, {
      clase: "agente",
      accion: "restaurar",
      ambito: "global",
      agente: { ...deSerie(), nombre: "advisor" },
    });
    await asentar();
    expect(dichos.join("\n")).toMatch(/no es uno de los de serie/);
  });

  /**
   * El renombrado, que por el cable es un `guardar` con `renombrandoDe`.
   *
   * `tipos.test.ts` no lo cubre —solo compara los literales `clase:`—, así que esta es la
   * única red del campo nuevo: si se cae del mensaje, renombrar se vuelve un alta y deja los
   * DOS ficheros, que es justo lo que el campo deshabilitado del formulario evitaba.
   */
  it("un `guardar` con `renombrandoDe` MUEVE el `.md`: no deja los dos", async () => {
    const dir = carpeta();
    if (dir === undefined) return;
    const { accion, dichos } = await conectar();
    writeFileSync(join(dir, "advisor.md"), "---\ndescripcion: el mío\n---\ncuerpo", "utf8");

    await enviarMensaje(accion, {
      clase: "agente",
      accion: "guardar",
      ambito: "global",
      agente: { ...deSerie(), nombre: "segunda-opinion", descripcion: "revisada" },
      renombrandoDe: "advisor",
    });
    await asentar();

    expect(existsSync(join(dir, "advisor.md"))).toBe(false);
    expect(readFileSync(join(dir, "segunda-opinion.md"), "utf8")).toContain("revisada");
    expect(dichos.join("\n")).toMatch(/renombrado a/);
  });

  it("con el MISMO nombre no es un renombrado: se guarda y no falla contra sí mismo", async () => {
    // Tratarlo de renombrado lo haría fallar por «destino ocupado» contra su propio fichero.
    const dir = carpeta();
    if (dir === undefined) return;
    const { accion, dichos } = await conectar();
    writeFileSync(join(dir, "advisor.md"), "---\ndescripcion: el mío\n---\ncuerpo", "utf8");

    await enviarMensaje(accion, {
      clase: "agente",
      accion: "guardar",
      ambito: "global",
      agente: { ...deSerie(), nombre: "advisor", descripcion: "afinada" },
      renombrandoDe: "advisor",
    });
    await asentar();

    expect(readFileSync(join(dir, "advisor.md"), "utf8")).toContain("afinada");
    expect(dichos.join("\n")).toMatch(/guardado en global/);
  });

  it("renombrar uno de serie se RECHAZA: su nombre lo ata a la semilla", async () => {
    // Moverlo lo volvería un subagente del usuario y la siembra repondría el de serie al
    // arrancar — dos especialistas donde había uno, y en silencio.
    const dir = carpeta();
    if (dir === undefined) return;
    const { accion, dichos } = await conectar();

    await enviarMensaje(accion, {
      clase: "agente",
      accion: "guardar",
      ambito: "global",
      agente: { ...deSerie(), nombre: "mis-docs" },
      renombrandoDe: "consultant-xone",
    });
    await asentar();

    expect(existsSync(join(dir, "consultant-xone.md"))).toBe(true);
    expect(existsSync(join(dir, "mis-docs.md"))).toBe(false);
    expect(dichos.join("\n")).toMatch(/no se cambia/);
  });

  it("un destino OCUPADO no se pisa, y se dice cuál es el arreglo", async () => {
    // Sin esta guarda, renombrar `advisor` a `docs` se llevaba por delante el `docs.md`
    // sembrado sin decir nada. Y los tres desenlaces se dicen distintos: «ya existe» y «ya no
    // estaba» se arreglan de formas distintas.
    const dir = carpeta();
    if (dir === undefined) return;
    const { accion, dichos } = await conectar();
    writeFileSync(join(dir, "advisor.md"), "---\ndescripcion: el mío\n---\ncuerpo", "utf8");
    const docsAntes = readFileSync(join(dir, "consultant-xone.md"), "utf8");

    await enviarMensaje(accion, {
      clase: "agente",
      accion: "guardar",
      ambito: "global",
      agente: { ...deSerie(), nombre: "consultant-xone", descripcion: "el mío" },
      renombrandoDe: "advisor",
    });
    await asentar();

    expect(readFileSync(join(dir, "consultant-xone.md"), "utf8")).toBe(docsAntes);
    expect(existsSync(join(dir, "advisor.md"))).toBe(true);
    expect(dichos.join("\n")).toMatch(/ya hay un subagente/);
  });
});

describe("arrancarConsolaWeb — las comprobaciones, en orden", () => {
  const conBuild = (): string => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-web-"));
    writeFileSync(join(raiz, "index.html"), "<!doctype html>");
    return raiz;
  };

  it("sin el build del cliente sale 70 con su frase, y NO levanta servidor", async () => {
    let levantado = false;
    const codigo = await arrancarConsolaWeb({
      puerto: 0,
      abrir: false,
      cwd: mkdtempSync(join(tmpdir(), "xonecode-cwd-")),
      raizDelCliente: join(tmpdir(), "no-existe-este-build"),
      crearServidor: (async () => {
        levantado = true;
        throw new Error("no debería llegar aquí");
      }) as never,
      escribir: () => {},
    });
    // 70 y no 1: falta una pieza del ENTORNO, el proyecto no tiene nada roto.
    expect(codigo).toBe(70);
    expect(levantado).toBe(false);
  });

  it("un proyecto offline en el cwd se DICE y se sigue: es un aviso, no un error", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "xonecode-cwd-"));
    mkdirSync(join(cwd, ".xonecode"));
    writeFileSync(join(cwd, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
    mkdirSync(join(cwd, ".xonecode", "cloudstudio"), { recursive: true });
    writeFileSync(join(cwd, ".xonecode", "cloudstudio", "sync.json"), "{}");
    const salida: string[] = [];
    const codigo = await arrancarConsolaWeb({
      puerto: 0,
      abrir: false,
      cwd,
      raizDelCliente: conBuild(),
      crearServidor: async () => servidorLevantado(),
      vestibulo: vestibuloDePrueba(),
      escribir: (t) => salida.push(t),
      esperarCierre: async () => {},
    });
    expect(codigo).toBe(0);
    expect(salida.join("")).toContain("xonecode --cli");
    // Y sigue: la URL se imprime igual.
    expect(salida.join("")).toContain("consola web en http://127.0.0.1:4173/?t=");
  });

  /**
   * Existe por tres rondas perdidas el 11-09-2026: un cambio del SERVIDOR no se ve hasta
   * parar y arrancar el proceso, mientras que el cliente se lee del disco en cada petición
   * y se actualiza con recargar. Una consola puede enseñar a la vez lo nuevo del cliente y
   * lo viejo del servidor, y nadie tenía forma de saber qué había vivo dentro.
   */
  it("dice con qué código corre, ANTES que la URL", async () => {
    const salida: string[] = [];
    await arrancarConsolaWeb({
      puerto: 0,
      abrir: false,
      cwd: mkdtempSync(join(tmpdir(), "xonecode-cwd-")),
      raizDelCliente: conBuild(),
      crearServidor: async () => servidorLevantado(),
      vestibulo: vestibuloDePrueba(),
      escribir: (t) => salida.push(t),
      esperarCierre: async () => {},
      // Entra por parámetro porque leerlo toca disco y lanza `git`: este test no puede
      // depender de que exista un repo donde corra.
      version: () => ({ version: "9.9.9", commit: "abc1234", sucio: true }),
    });
    const texto = salida.join("");
    expect(texto).toContain("XOneCode 9.9.9 · abc1234 + cambios sin commitear");
    // Antes que la URL: es lo que se lee primero cuando uno viene a comprobar qué hay vivo.
    expect(texto.indexOf("XOneCode 9.9.9")).toBeLessThan(texto.indexOf("consola web en"));
  });

  it("y sin saber la versión no se inventa ninguna línea", async () => {
    // Ausente es «no consta», que es lo que hacía siempre: un «versión desconocida» en el
    // arranque sería ruido en el sitio donde menos ruido cabe.
    const salida: string[] = [];
    await arrancarConsolaWeb({
      puerto: 0,
      abrir: false,
      cwd: mkdtempSync(join(tmpdir(), "xonecode-cwd-")),
      raizDelCliente: conBuild(),
      crearServidor: async () => servidorLevantado(),
      vestibulo: vestibuloDePrueba(),
      escribir: (t) => salida.push(t),
      esperarCierre: async () => {},
    });
    expect(salida.join("")).not.toContain("XOneCode 0.");
  });

  /**
   * La vía legítima para ver la maqueta completa sin CloudStudio: el alta de la web solo
   * sabe de entornos y proyectos remotos (`vestibulo.ts`), así que un proyecto offline
   * nunca llega a `proyectoAbierto()` por ESE camino — con o sin `--guion`. Lo que
   * `--guion` añade aquí es abrirlo DIRECTAMENTE (`vestibulo.abrirProyecto`, que no toca
   * red: es local, el mismo turno que corre `--cli`), saltándose el alta entera.
   */
  it("con --guion, un proyecto offline en el cwd se abre solo: la maqueta completa, sin alta", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "xonecode-cwd-"));
    mkdirSync(join(cwd, ".xonecode"));
    writeFileSync(join(cwd, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
    mkdirSync(join(cwd, ".xonecode", "cloudstudio"), { recursive: true });
    writeFileSync(join(cwd, ".xonecode", "cloudstudio", "sync.json"), "{}");
    const vestibulo = vestibuloDePrueba();
    const salida: string[] = [];
    // Lo que hay que mirar vive ENTRE que el proyecto se abre y `vestibulo.cerrar()` lo
    // vuelve a cerrar al final de `arrancarConsolaWeb` — y eso pasa justo cuando
    // `esperarCierre` resuelve. Un `esperarCierre` que solo esperase (como en el test de
    // arriba) miraría el vestíbulo YA cerrado.
    let abiertoDurante: ReturnType<typeof vestibulo.proyectoAbierto>;
    const codigo = await arrancarConsolaWeb({
      puerto: 0,
      abrir: false,
      guion: true,
      cwd,
      raizDelCliente: conBuild(),
      crearServidor: async () => servidorLevantado(),
      vestibulo,
      escribir: (t) => salida.push(t),
      esperarCierre: async () => {
        abiertoDurante = vestibulo.proyectoAbierto();
      },
    });
    expect(codigo).toBe(0);
    // Con --guion no hace falta el aviso de siempre: no hay que abrirlo con `--cli`
    // porque ya se abrió aquí.
    expect(salida.join("")).not.toContain("xonecode --cli");
    expect(abiertoDurante).toBeDefined();
    expect(abiertoDurante!.raiz).toBe(cwd);
    // La evidencia de que es de pega, por los DOS sitios: el terminal (quien lanzó el
    // proceso) y el transcript del proyecto (la Trayectoria, que es adonde aterriza un
    // acto de sistema) — es lo primero que vería quien entrara por el navegador sin
    // haber leído nunca la consola del proceso.
    expect(salida.join("")).toContain("de pega");
    expect(
      abiertoDurante!.consola
        .actos()
        .some((a) => a.tipo === "sistema" && a.texto.includes("de pega"))
    ).toBe(true);
  });

  it("con --no-abrir no se toca el navegador; con abrir, un fallo al abrirlo no tumba nada", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "xonecode-cwd-"));
    let abierto = 0;
    const comun = {
      puerto: 0,
      cwd,
      raizDelCliente: conBuild(),
      crearServidor: async () => servidorLevantado(),
      escribir: () => {},
      esperarCierre: async () => {},
    };
    await arrancarConsolaWeb({ ...comun, abrir: false, vestibulo: vestibuloDePrueba(), abrirNavegador: () => void abierto++ });
    expect(abierto).toBe(0);

    const codigo = await arrancarConsolaWeb({
      ...comun,
      abrir: true,
      vestibulo: vestibuloDePrueba(),
      abrirNavegador: () => {
        throw new Error("aquí no hay navegador");
      },
    });
    // La URL ya está impresa: abrir el navegador es lo accesorio y no puede tumbar el servidor.
    expect(codigo).toBe(0);
  });

  it("sin `crearEjecutor` y sin --guion NO arranca: correr el agente de pega sin decirlo es peor", async () => {
    // El fallo que esto vigila es mudo por naturaleza: los turnos correrían, las fases se
    // pintarían, y nada de lo que dijera el asistente vendría de un modelo. Misma postura
    // que `descargar` sin sincronizador.
    await expect(
      arrancarConsolaWeb({
        puerto: 0,
        abrir: false,
        cwd: mkdtempSync(join(tmpdir(), "xonecode-cwd-")),
        raizDelCliente: conBuild(),
        crearServidor: async () => servidorLevantado(),
        escribir: () => {},
        esperarCierre: async () => {},
      })
    ).rejects.toThrow(/agente de pega/);
  });

  it("la frase del build que falta es accionable y nombra el comando", () => {
    expect(FALTA_EL_BUILD).toContain("npm run build:web");
  });
});

/** Un `ServidorWeb` que no ata ningún puerto. */
/**
 * Que el AUMENTADOR está montado en producción — no solo que `augmentacionCableada`
 * funciona.
 *
 * El hueco que esto cierra es el de siempre en esta tanda: `arrancarConsolaWeb` compone las
 * opciones de `montarRutas` dentro de su cierre, y todos sus tests doblan el servidor y el
 * vestíbulo, así que `augmentar` podía dejar de pasarse y nada chistaría — el botón
 * «Preparar el encargo» simplemente no aparecería.
 *
 * Se mide desde DENTRO, por `esperarCierre`: cuando esa función corre, las rutas están
 * montadas y el cable vivo. Y el proyecto se deja SIN resolver a propósito: entonces el
 * servidor contesta un `augmentado` con su motivo, que es lo que demuestra que el manejador
 * está ahí — sin `augmentar` no se emite ningún mensaje de clase `tarea` (hay un test suyo
 * justo arriba). Con `guion: true` no se le pregunta a ningún modelo.
 */
describe("arrancarConsolaWeb monta el aumentador", () => {
  it("un `augmentar` por el cable recibe respuesta: el puerto está pasado", async () => {
    const raizDelCliente = mkdtempSync(join(tmpdir(), "xonecode-web-aum-"));
    writeFileSync(join(raizDelCliente, "index.html"), "<!doctype html>");
    const rutas = new Map<string, ManejadorRuta>();
    const cliente = clienteDeMentira();
    await arrancarConsolaWeb({
      puerto: 0,
      abrir: false,
      guion: true,
      cwd: mkdtempSync(join(tmpdir(), "xonecode-cwd-aum-")),
      raizDelCliente,
      crearServidor: async () => ({
        puerto: 4173,
        direccion: "127.0.0.1",
        token: "t0k3n",
        url: "http://127.0.0.1:4173/?t=t0k3n",
        registrarRuta: (metodo: string, ruta: string, manejador: ManejadorRuta) => {
          rutas.set(`${metodo} ${ruta}`, manejador);
        },
        cerrar: async () => {},
      }),
      vestibulo: vestibuloDePrueba(),
      escribir: () => {},
      // Aquí dentro todo está montado y el cable vivo: es el único momento en que se puede
      // hablar con las rutas de PRODUCCIÓN de esta función.
      esperarCierre: async () => {
        await rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
        await asentar();
        await enviarMensaje(rutas.get(`POST ${RUTA_ACCION}`)!, {
          clase: "tarea",
          accion: "augmentar",
          proyecto: "no-resoluble",
          peticion: "Arregla el login",
        });
        await asentar();
      },
    });
    const respuestas = cliente.recibidos.filter((m) => m.clase === "tarea");
    expect(respuestas).toHaveLength(1);
    expect(respuestas[0]).toMatchObject({ accion: "augmentado" });
  });
});

function servidorLevantado() {
  const rutas = new Map<string, ManejadorRuta>();
  return {
    puerto: 4173,
    direccion: "127.0.0.1",
    token: "t0k3n",
    url: "http://127.0.0.1:4173/?t=t0k3n",
    registrarRuta: (metodo: string, ruta: string, manejador: ManejadorRuta) => {
      rutas.set(`${metodo} ${ruta}`, manejador);
    },
    cerrar: async () => {},
  };
}

describe("qué hay en la máquina: el mensaje «dispositivos»", () => {
  const informe = {
    sistema: "mac" as const,
    herramientas: [{ nombre: "adb" as const, plataforma: "android" as const, estado: "no-encontrada" as const }],
    dispositivos: [],
    avds: [], recetas: [],
    medido: "2026-09-06T10:00:00.000Z",
  };

  it("al conectar se mide UNA vez y la foto llega por el SSE a quien conectó; la segunda pestaña la recibe en la ráfaga sin volver a medir", async () => {
    let medidas = 0;
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      detectarDispositivos: async () => {
        medidas++;
        return informe;
      },
    });
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;
    const primera = clienteDeMentira();
    await eventos(primera.peticion, primera.respuesta);
    await asentar();
    const foto = primera.recibidos.find((m) => m.clase === "dispositivos") as Extract<MensajeAlCliente, { clase: "dispositivos" }>;
    expect(foto.informe).toEqual(informe);
    expect(medidas).toBe(1);

    const segunda = clienteDeMentira();
    await eventos(segunda.peticion, segunda.respuesta);
    await asentar();
    // La ráfaga de bienvenida ya la lleva: no se lanza adb otra vez por abrir una pestaña.
    expect(segunda.recibidos.filter((m) => m.clase === "dispositivos")).toHaveLength(1);
    expect(medidas).toBe(1);
  });

  /**
   * **El nombre del AVD llega por el CABLE y acaba siendo un argumento de proceso.** Lo único
   * que lo autoriza es que esté en NUESTRA última medida: sin esa guarda, cualquiera que
   * alcance el loopback elige qué se ejecuta. Se contesta con la foto y con el motivo — un
   * botón que no hace nada y no lo dice es lo que esto viene a evitar.
   */
  it("arrancar un AVD que no está en la última medida no ejecuta nada, y lo dice", async () => {
    const conAvd = { ...informe, avds: ["pixel8"] };
    let arranques: string[] = [];
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      detectarDispositivos: async () => conAvd,
      arrancarEmulador: async (avd) => {
        arranques.push(avd);
        return { ok: true, detalle: `${avd} arrancado` };
      },
    });
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;
    const cliente = clienteDeMentira();
    await eventos(cliente.peticion, cliente.respuesta);
    await asentar();
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;

    await enviarMensaje(accion, { clase: "arrancarEmulador", avd: "inventado" });
    await asentar();
    expect(arranques).toEqual([]);
    const fallo = cliente.recibidos.filter((m) => m.clase === "dispositivos").at(-1) as Extract<
      MensajeAlCliente,
      { clase: "dispositivos" }
    >;
    expect(fallo.arranque).toEqual({
      avd: "inventado",
      ok: false,
      detalle: "no consta ningún AVD llamado «inventado» en la última medida",
    });

    // Y el que SÍ está se ejecuta, con su resultado junto a la foto nueva.
    await enviarMensaje(accion, { clase: "arrancarEmulador", avd: "pixel8" });
    await asentar();
    expect(arranques).toEqual(["pixel8"]);
    const bien = cliente.recibidos.filter((m) => m.clase === "dispositivos").at(-1) as Extract<
      MensajeAlCliente,
      { clase: "dispositivos" }
    >;
    expect(bien.arranque).toEqual({ avd: "pixel8", ok: true, detalle: "pixel8 arrancado" });
  });

  /**
   * **El acuse del arranque se OLVIDA en la siguiente medida pedida.**
   *
   * Sin esto se queda pegado: el usuario vio `pixel8 · apagado` con un «✓ pixel8 arrancado» al
   * lado, o sea las dos cosas a la vez en la misma fila. El acuse pertenece a la foto que se
   * tomó justo después de arrancar, y ahora que la sección remide al entrar y al volver a la
   * ventana, las medidas de después son muchas.
   */
  it("una medida pedida después de arrancar llega SIN el acuse", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      detectarDispositivos: async () => ({ ...informe, avds: ["pixel8"] }),
      arrancarEmulador: async (avd) => ({ ok: true, detalle: `${avd} arrancado` }),
    });
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;
    const cliente = clienteDeMentira();
    await eventos(cliente.peticion, cliente.respuesta);
    await asentar();
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;

    await enviarMensaje(accion, { clase: "arrancarEmulador", avd: "pixel8" });
    await asentar();
    const conAcuse = cliente.recibidos.filter((m) => m.clase === "dispositivos").at(-1) as Extract<
      MensajeAlCliente,
      { clase: "dispositivos" }
    >;
    expect(conAcuse.arranque?.ok).toBe(true);

    // La medida siguiente —la que dispara entrar en la sección o volver a la ventana— ya no
    // lo lleva: ausente vuelve a significar «no se ha pedido ningún arranque en esta medida».
    await enviarMensaje(accion, { clase: "dispositivos" });
    await asentar();
    const despues = cliente.recibidos.filter((m) => m.clase === "dispositivos").at(-1) as Extract<
      MensajeAlCliente,
      { clase: "dispositivos" }
    >;
    expect(despues.arranque).toBeUndefined();
  });

  /**
   * Sin el puerto no hay arranque, y se DICE: el botón no se pinta porque `App` no pasa el
   * manejador, pero el servidor no puede quedarse mudo si el mensaje llega igual.
   */
  it("sin `arrancarEmulador` no se promete nada", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { detectarDispositivos: async () => ({ ...informe, avds: ["pixel8"] }) });
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;
    const cliente = clienteDeMentira();
    await eventos(cliente.peticion, cliente.respuesta);
    await asentar();
    await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "arrancarEmulador", avd: "pixel8" });
    await asentar();
    const ultima = cliente.recibidos.filter((m) => m.clase === "dispositivos").at(-1) as Extract<
      MensajeAlCliente,
      { clase: "dispositivos" }
    >;
    expect(ultima.arranque).toBeUndefined();
  });

  it("dos pestañas que conectan A LA VEZ comparten la detección en vuelo", async () => {
    let medidas = 0;
    let soltar: (() => void) | undefined;
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      detectarDispositivos: () => {
        medidas++;
        return new Promise((r) => {
          soltar = () => r(informe);
        });
      },
    });
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;
    const a = clienteDeMentira();
    const b = clienteDeMentira();
    await eventos(a.peticion, a.respuesta);
    await eventos(b.peticion, b.respuesta);
    await asentar();
    expect(medidas).toBe(1);
    soltar!();
    await asentar();
    // Y la foto va a TODOS: la máquina es la misma para las dos.
    expect(a.recibidos.some((m) => m.clase === "dispositivos")).toBe(true);
    expect(b.recibidos.some((m) => m.clase === "dispositivos")).toBe(true);
  });

  it("el cliente pide volver a mirar y se mide de nuevo; es la ÚNICA forma —no hay sondeo—", async () => {
    let medidas = 0;
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      detectarDispositivos: async () => {
        medidas++;
        return { ...informe, medido: `medida-${medidas}` };
      },
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    expect(await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "dispositivos" })).toBe(204);
    await asentar();
    const fotos = cliente.recibidos.filter((m) => m.clase === "dispositivos") as Extract<MensajeAlCliente, { clase: "dispositivos" }>[];
    expect(fotos.map((f) => f.informe.medido)).toEqual(["medida-1", "medida-2"]);
    expect(medidas).toBe(2);
  });

  it("la RUTA de adb/emulator SÍ sale por el cable —la excepción declarada, como el workspace—, y la de xcrun/devicectl no", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      detectarDispositivos: async () => ({
        ...informe,
        herramientas: [
          { nombre: "adb", plataforma: "android", estado: "ok", ruta: "/Users/alguien/Library/Android/sdk/platform-tools/adb" },
          { nombre: "emulator", plataforma: "android", estado: "ok", ruta: "/Users/alguien/Library/Android/sdk/emulator/emulator" },
          { nombre: "xcrun", plataforma: "ios", estado: "ok", ruta: "/usr/bin/xcrun" },
        ],
      }),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    const foto = cliente.recibidos.find((m) => m.clase === "dispositivos") as Extract<MensajeAlCliente, { clase: "dispositivos" }>;
    expect(foto.informe.herramientas).toEqual([
      { nombre: "adb", plataforma: "android", estado: "ok", ruta: "/Users/alguien/Library/Android/sdk/platform-tools/adb" },
      { nombre: "emulator", plataforma: "android", estado: "ok", ruta: "/Users/alguien/Library/Android/sdk/emulator/emulator" },
      { nombre: "xcrun", plataforma: "ios", estado: "ok" },
    ]);
    // La de xcrun no viaja, pero la de adb/emulator sí: solo se comprueba que NO se cuela una
    // ruta que nunca se declaró en el informe de arriba (evita un falso verde si `xcrun`
    // llevara la misma cuenta de usuario en otra parte del mensaje).
    expect(JSON.stringify(foto)).not.toContain("/usr/bin/xcrun");
  });

  /**
   * VERIFICAR la conexión con un dispositivo. Tres reglas que este mensaje sostiene y que
   * `dispositivos` no podía: no vuelve a medir —la verificación vive dentro de la foto, así
   * que una medida nueva se llevaría la que se acaba de hacer—, el id se resuelve contra la
   * última medida, y solo se toca ESE dispositivo.
   */
  describe("verificar la conexión: el mensaje «conexion»", () => {
    const conDispositivos = {
      ...informe,
      dispositivos: [
        { id: "ABC", nombre: "Pixel 8", plataforma: "android" as const, clase: "fisico" as const, estado: "conectado" as const },
        { id: "UDID", nombre: "iPhone 17", plataforma: "ios" as const, clase: "simulador" as const, estado: "apagado" as const },
      ],
    };

    const montar = (verificar: (d: { id: string }) => Promise<{ ok: boolean; detalle: string }>) => {
      let medidas = 0;
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba(), {
        detectarDispositivos: async () => {
          medidas++;
          return conDispositivos;
        },
        verificarDispositivo: verificar,
      });
      return { servidor, medidas: () => medidas };
    };

    const fotos = (cliente: ReturnType<typeof clienteDeMentira>) =>
      cliente.recibidos.filter((m) => m.clase === "dispositivos") as Extract<MensajeAlCliente, { clase: "dispositivos" }>[];

    it("verifica el dispositivo de la MEDIDA y lo emite, sin volver a medir", async () => {
      const vistos: string[] = [];
      const { servidor, medidas } = montar(async (d) => {
        vistos.push(d.id);
        return { ok: true, detalle: "responde: Pixel 8" };
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();
      expect(await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "conexion", id: "ABC" })).toBe(204);
      await asentar();
      // Lo que se le pasa al verificador es el dispositivo del host: de él salen la
      // plataforma y la clase, que deciden qué comando se lanza.
      expect(vistos).toEqual(["ABC"]);
      // UNA sola medida: la de conectar. Remedir habría borrado esta verificación.
      expect(medidas()).toBe(1);
      const ultima = fotos(cliente).at(-1)!;
      expect(ultima.informe.dispositivos[0]!.verificado).toMatchObject({ ok: true, detalle: "responde: Pixel 8" });
      // Y solo ese: el otro sigue sin verificar, que no es «no responde».
      expect(ultima.informe.dispositivos[1]!.verificado).toBeUndefined();
    });

    it("un id que no está en la medida no verifica nada: es una foto vieja del cliente", async () => {
      let llamadas = 0;
      const { servidor } = montar(async () => {
        llamadas++;
        return { ok: true, detalle: "responde" };
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();
      expect(await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "conexion", id: "DESENCHUFADO" })).toBe(204);
      await asentar();
      expect(llamadas).toBe(0);
      expect(fotos(cliente)).toHaveLength(1);
    });

    it("una medida NUEVA se lleva las verificaciones: viven con la foto", async () => {
      // No es limpieza: una verificación de hace media hora pegada a una foto de ahora
      // afirmaría algo que nadie ha comprobado.
      const { servidor } = montar(async () => ({ ok: true, detalle: "responde" }));
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();
      await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "conexion", id: "ABC" });
      await asentar();
      await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "dispositivos" });
      await asentar();
      expect(fotos(cliente).at(-1)!.informe.dispositivos[0]!.verificado).toBeUndefined();
    });

    /**
     * Medido en pantalla: se abre XoneCode con el emulador YA arrancado, se entra en Ajustes →
     * Dispositivos —lo que dispara una remedida (`useMedirAlVolver`) que VACÍA el informe
     * antes de volver a medir— y se pulsa Verificar de inmediato, porque el dispositivo ya
     * está a la vista. Antes de esto el click caía en el hueco: `informeDeDispositivos` era
     * `undefined`, la petición se perdía EN SILENCIO y el botón se quedaba en
     * «Verificando…» para siempre —ni siquiera se podía reintentar, porque el propio botón
     * se desactiva mientras «verifica»—. Ahora espera a que la medida en vuelo termine.
     */
    it("si la conexión llega con una medida en vuelo, espera a que termine en vez de perderla", async () => {
      let llamadas = 0;
      let resolverSegunda: (() => void) | undefined;
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba(), {
        detectarDispositivos: () => {
          llamadas++;
          if (llamadas === 1) return Promise.resolve(conDispositivos);
          return new Promise<typeof conDispositivos>((resolve) => {
            resolverSegunda = () => resolve(conDispositivos);
          });
        },
        verificarDispositivo: async () => ({ ok: true, detalle: "responde: Pixel 8" }),
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();
      // Entrar en la sección: vacía el informe y deja la segunda medida EN VUELO, sin
      // resolver todavía.
      await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "dispositivos" });
      await asentar();
      // El click de Verificar cae justo en el hueco: no hay informe con el que resolver "ABC".
      await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "conexion", id: "ABC" });
      await asentar();
      expect(resolverSegunda).toBeDefined();
      resolverSegunda!();
      await asentar();
      await asentar();
      const ultima = fotos(cliente).at(-1)!;
      expect(ultima.informe.dispositivos[0]!.verificado).toMatchObject({ ok: true, detalle: "responde: Pixel 8" });
    });

    it("un verificador que revienta contesta como respuesta, sin la ruta de nada", async () => {
      const { servidor } = montar(async () => {
        throw Object.assign(new Error("ENOENT: no such file or directory, open '/Users/alguien/x'"), { code: "ENOENT" });
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();
      await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "conexion", id: "ABC" });
      await asentar();
      const v = fotos(cliente).at(-1)!.informe.dispositivos[0]!.verificado!;
      expect(v.ok).toBe(false);
      expect(JSON.stringify(v)).not.toContain("/Users/alguien");
    });

    it("sin la opción no se verifica nada: 204 y silencio", async () => {
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba(), { detectarDispositivos: async () => conDispositivos });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      await asentar();
      expect(await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "conexion", id: "ABC" })).toBe(204);
      await asentar();
      expect(fotos(cliente)).toHaveLength(1);
    });
  });

  it("sin la opción no se manda ningún «dispositivos»: no se afirma una máquina vacía", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba());
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    expect(cliente.recibidos.some((m) => m.clase === "dispositivos")).toBe(false);
    // Y pedirlo tampoco revienta: 204 y silencio.
    expect(await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "dispositivos" })).toBe(204);
  });

  it("guardar `ajustes` con las dos rutas personalizadas las persiste, recortadas", async () => {
    const guardados: unknown[] = [];
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      detectarDispositivos: async () => informe,
      guardarAjustesDeDispositivos: (a) => {
        guardados.push(a);
      },
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, {
      clase: "dispositivos",
      ajustes: { android: false, rutaAdb: "  /opt/adb  ", rutaEmulator: "" },
    });
    await asentar();
    expect(guardados).toEqual([{ android: false, rutaAdb: "/opt/adb" }]);
  });

  it("«abrirRuta» abre la carpeta de la herramienta y NO vuelve a medir", async () => {
    let medidas = 0;
    const abiertas: string[] = [];
    const conRuta = {
      ...informe,
      herramientas: [{ nombre: "adb" as const, plataforma: "android" as const, estado: "ok" as const, ruta: "/opt/sdk/platform-tools/adb" }],
    };
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      detectarDispositivos: async () => {
        medidas++;
        return conRuta;
      },
      abrirCarpetaDeHerramienta: (ruta) => {
        abiertas.push(ruta);
      },
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    expect(medidas).toBe(1);

    expect(
      await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "dispositivos", abrirRuta: "adb" })
    ).toBe(204);
    await asentar();
    expect(abiertas).toEqual(["/opt/sdk/platform-tools/adb"]);
    // No remide: la foto sigue siendo la de la única medida de arriba.
    expect(medidas).toBe(1);
  });

  it("«abrirRuta» de una herramienta sin ruta en la última medida no llama a nada, y responde 204 igual", async () => {
    const abiertas: string[] = [];
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      detectarDispositivos: async () => informe, // adb en "no-encontrada": sin `ruta`.
      abrirCarpetaDeHerramienta: (ruta) => {
        abiertas.push(ruta);
      },
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    expect(
      await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "dispositivos", abrirRuta: "adb" })
    ).toBe(204);
    await asentar();
    expect(abiertas).toEqual([]);
  });
});

/**
 * Los ARTEFACTOS de la sesión, por sus dos caminos: el cable (contenido para los visores)
 * y la ruta HTTP (el documento que pinta el iframe, y la descarga).
 *
 * Aquí no hay disco: los dos lectores entran por opción, igual que `leerFichero`. Lo que se
 * afirma es el CABLE y las CABECERAS, que es donde vive la decisión de seguridad.
 */
describe("los artefactos de la sesión", () => {
  /** Un GET a una ruta registrada, con su query. Apunta estado, cabeceras y cuerpo. */
  async function pedir(manejador: ManejadorRuta, url: string) {
    const peticion = { method: "GET", url, headers: {} } as unknown as IncomingMessage;
    let estado = 0;
    const cabeceras: Record<string, string | number> = {};
    let cuerpo: Buffer | string | undefined;
    const respuesta = {
      writeHead: (codigo: number, extra?: Record<string, string | number>) => {
        estado = codigo;
        Object.assign(cabeceras, extra ?? {});
        return respuesta;
      },
      setHeader: (clave: string, valor: string | number) => {
        cabeceras[clave] = valor;
        return respuesta;
      },
      end: (trozo?: Buffer | string) => {
        cuerpo = trozo;
        return respuesta;
      },
    } as unknown as ServerResponse;
    await manejador(peticion, respuesta);
    return { estado, cabeceras, cuerpo };
  }

  const abrirProyecto = async (opciones: Parameters<typeof montarRutas>[2] = {}) => {
    const base = mkdtempSync(join(tmpdir(), "xonecode-artefacto-"));
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => base });
    const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
    mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
    writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
    mkdirSync(join(raizDeVerdad, ".xonecode", "cloudstudio"), { recursive: true });
    writeFileSync(join(raizDeVerdad, ".xonecode", "cloudstudio", "sync.json"), "{}");
    montarRutas(servidor, vestibulo, opciones);
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
    await asentar();
    return {
      base,
      servidor,
      vestibulo,
      cliente,
      accion,
      artefacto: servidor.rutas.get(`GET ${RUTA_ARTEFACTO}`)!,
      limpiar: async () => {
        await vestibulo.cerrar();
        rmSync(base, { recursive: true, force: true });
      },
    };
  };

  describe("por el cable, para los visores", () => {
    it("se pide por NOMBRE y se contesta con la ruta virtual", async () => {
      const pedidos: { raiz: string; sesion: string; nombre: string }[] = [];
      const { accion, cliente, vestibulo, limpiar } = await abrirProyecto({
        leerArtefacto: async (raiz, sesion, nombre) => {
          pedidos.push({ raiz, sesion, nombre });
          return { ruta: `/artefactos/${nombre}`, texto: "<p/>", recortado: false, binario: false, bytes: 4 };
        },
      });

      expect(await enviarMensaje(accion, { clase: "artefacto", nombre: "d.html" })).toBe(204);
      await asentar();

      // El id que se usa es el del HILO, que existe desde que se abre la sesión: es el que
      // montó la carpeta en disco. Con `sesion` —que espera al índice— este mensaje habría
      // contestado «no existe» durante todo el primer turno.
      expect(pedidos).toEqual([
        { raiz: vestibulo.proyectoAbierto()!.raiz, sesion: vestibulo.proyectoAbierto()!.idDeHilo, nombre: "d.html" },
      ]);
      expect(cliente.recibidos.filter((x) => x.clase === "artefacto").at(-1)).toMatchObject({
        clase: "artefacto",
        ruta: "/artefactos/d.html",
        texto: "<p/>",
      });
      await limpiar();
    });

    it("sin lector se contesta que esta ejecución no puede, no silencio", async () => {
      const { accion, cliente, limpiar } = await abrirProyecto();
      await enviarMensaje(accion, { clase: "artefacto", nombre: "d.html" });
      await asentar();
      expect(cliente.recibidos.filter((x) => x.clase === "artefacto").at(-1)).toMatchObject({
        clase: "artefacto",
        ruta: "/artefactos/d.html",
        error: expect.stringContaining("no puede"),
      });
      await limpiar();
    });

    it("si el lector LANZA, ni el cable ni lo informado llevan la ruta de la máquina", async () => {
      const dichos: string[] = [];
      const { accion, cliente, limpiar } = await abrirProyecto({
        informar: (t) => dichos.push(t),
        leerArtefacto: async () => {
          throw Object.assign(new Error("EACCES: permission denied, open '/Users/alguien/.xonecode/x'"), { code: "EACCES" });
        },
      });
      await enviarMensaje(accion, { clase: "artefacto", nombre: "d.html" });
      await asentar();
      expect(cliente.recibidos.filter((x) => x.clase === "artefacto").at(-1)).toMatchObject({ error: expect.any(String) });
      expect(JSON.stringify(cliente.recibidos)).not.toContain("/Users/alguien");
      expect(dichos.join(" ")).not.toContain("/Users/alguien");
      expect(dichos.join(" ")).toContain("EACCES");
      await limpiar();
    });
  });

  describe("por HTTP, el documento del iframe", () => {
    const html = Buffer.from("<!doctype html><p>hola</p>");
    const lectorDe = (datos: Buffer, mime?: string) => ({
      leerArtefactoCrudo: async () => ({ ok: true as const, nombre: "d.html", datos, ...(mime === undefined ? {} : { mime }) }),
    });

    it("sirve los bytes con el sandbox puesto en la CABECERA, no solo en el atributo", async () => {
      const { artefacto, limpiar } = await abrirProyecto(lectorDe(html, "text/html"));
      const { estado, cabeceras, cuerpo } = await pedir(artefacto, "/artefacto?n=d.html");

      expect(estado).toBe(200);
      expect(cuerpo).toEqual(html);
      expect(cabeceras["Content-Type"]).toBe("text/html; charset=utf-8");
      // La cabecera cubre lo que el atributo del iframe no puede: abrir esta URL en una
      // pestaña sería una navegación de primer nivel en el origen real, CON la cookie.
      expect(cabeceras["Content-Security-Policy"]).toBe("sandbox allow-scripts");
      expect(cabeceras["X-Content-Type-Options"]).toBe("nosniff");
      expect(cabeceras["Cache-Control"]).toBe("no-store");
      await limpiar();
    });

    it("con «descargar» va como adjunto y sin tipo adivinado", async () => {
      const { artefacto, limpiar } = await abrirProyecto(lectorDe(html, "text/html"));
      const { estado, cabeceras } = await pedir(artefacto, "/artefacto?n=d.html&descargar=1");
      expect(estado).toBe(200);
      expect(cabeceras["Content-Disposition"]).toBe('attachment; filename="d.html"');
      expect(cabeceras["Content-Type"]).toBe("application/octet-stream");
      await limpiar();
    });

    it("un mime que no conocemos NO se sirve inline: se descarga", async () => {
      const { artefacto, limpiar } = await abrirProyecto({
        leerArtefactoCrudo: async () => ({ ok: true as const, nombre: "cosa.xyz", datos: Buffer.from("x") }),
      });
      const { cabeceras } = await pedir(artefacto, "/artefacto?n=cosa.xyz");
      expect(cabeceras["Content-Type"]).toBe("application/octet-stream");
      expect(cabeceras["Content-Disposition"]).toBe('attachment; filename="cosa.xyz"');
      await limpiar();
    });

    it("cada motivo tiene su código, y ninguno delata el disco", async () => {
      for (const [motivo, codigo] of [
        ["rechazado", 403],
        ["no-existe", 404],
        ["demasiado-grande", 413],
      ] as const) {
        const { artefacto, limpiar } = await abrirProyecto({
          leerArtefactoCrudo: async () => ({ ok: false as const, motivo }),
        });
        const { estado, cuerpo } = await pedir(artefacto, "/artefacto?n=d.html");
        expect(estado).toBe(codigo);
        expect(String(cuerpo ?? "")).not.toContain("/");
        await limpiar();
      }
    });

    it("sin nombre, sin proyecto abierto o sin lector se rechaza en vez de servir nada", async () => {
      const { artefacto, limpiar } = await abrirProyecto(lectorDe(html, "text/html"));
      expect((await pedir(artefacto, "/artefacto")).estado).toBe(400);
      await limpiar();

      const sinLector = await abrirProyecto();
      expect((await pedir(sinLector.artefacto, "/artefacto?n=d.html")).estado).toBe(404);
      await sinLector.limpiar();

      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba(), lectorDe(html, "text/html"));
      const sinProyecto = servidor.rutas.get(`GET ${RUTA_ARTEFACTO}`)!;
      expect((await pedir(sinProyecto, "/artefacto?n=d.html")).estado).toBe(404);
    });

    it("un nombre con recorrido no llega ni al lector", async () => {
      let llamado = false;
      const { artefacto, limpiar } = await abrirProyecto({
        leerArtefactoCrudo: async () => {
          llamado = true;
          return { ok: false as const, motivo: "rechazado" as const };
        },
      });
      // El lector tiene su propia barrera y está probado aparte; esto afirma que la ruta no
      // se apoya SOLO en ella: `%2e%2e` lo decodifica `searchParams` a `..`.
      for (const n of ["../auth.json", "%2e%2e/auth.json", "un%20nombre.html"]) {
        expect((await pedir(artefacto, `/artefacto?n=${n}`)).estado).toBe(403);
      }
      expect(llamado).toBe(false);
      await limpiar();
    });
  });
});

/**
 * Ejecutar un paso de la receta de instalación: uno a la vez, con su log y su cancelación.
 *
 * El ejecutor entra por opción, como el resto de lo que toca la máquina: aquí no se lanza
 * ningún proceso. Lo que se afirma es el CABLE — qué se emite, en qué orden, y qué NO se
 * lanza dos veces.
 */
describe("los pasos de una receta, ejecutados desde el cable", () => {
  /** Un ejecutor de pega: guarda el `alSalirLinea` para poder hablar por él. */
  function ejecutorDeReceta() {
    const lanzados: { receta: string; paso: number }[] = [];
    let decir: ((linea: string) => void) | undefined;
    let acabar: ((r: { estado: string; motivo?: string; ms: number }) => void) | undefined;
    let cancelado = false;
    return {
      lanzados,
      hablar: (linea: string) => decir?.(linea),
      acabar: (estado: string, motivo?: string) => acabar?.({ estado, ...(motivo === undefined ? {} : { motivo }), ms: 5 }),
      get cancelado() {
        return cancelado;
      },
      correr: (receta: string, paso: number, alSalirLinea: (linea: string) => void) => {
        lanzados.push({ receta, paso });
        decir = alSalirLinea;
        return {
          titulo: "Descargando el emulador",
          cancelar: () => {
            cancelado = true;
          },
          terminado: new Promise<{ estado: string; motivo?: string; ms: number }>((r) => {
            acabar = r;
          }),
        };
      },
    };
  }

  const conectar = async (opciones: Parameters<typeof montarRutas>[2]) => {
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba();
    montarRutas(servidor, vestibulo, opciones);
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    return { cliente, accion: servidor.rutas.get(`POST ${RUTA_ACCION}`)!, vestibulo };
  };
  const progresos = (cliente: ReturnType<typeof clienteDeMentira>) =>
    cliente.recibidos.filter((m) => m.clase === "instalacion") as Extract<MensajeAlCliente, { clase: "instalacion" }>[];

  it("emite «corriendo» al lanzar, el log al hablar, y cómo acabó", async () => {
    const e = ejecutorDeReceta();
    let medidas = 0;
    const { cliente, accion } = await conectar({
      correrPasoDeReceta: e.correr,
      detectarDispositivos: async () => {
        medidas += 1;
        return { sistema: "mac", herramientas: [], dispositivos: [], avds: [], recetas: [], medido: "2026-09-07T10:00:00.000Z" };
      },
    });

    expect(await enviarMensaje(accion, { clase: "receta", id: "android-emulador", paso: 3, accion: "ejecutar" })).toBe(204);
    await asentar();
    expect(e.lanzados).toEqual([{ receta: "android-emulador", paso: 3 }]);
    expect(progresos(cliente).at(-1)).toMatchObject({ estado: "corriendo", titulo: "Descargando el emulador", lineas: [] });

    e.hablar("Downloading 58%");
    e.acabar("ok");
    await asentar();
    const ultimo = progresos(cliente).at(-1)!;
    expect(ultimo.estado).toBe("ok");
    // El último progreso lleva el log aunque no haya pasado el plazo: es el que lo completa.
    expect(ultimo.lineas).toContain("Downloading 58%");
    // Y al terminar se vuelve a MEDIR: la foto es lo que dice si el paso quedó hecho, no lo
    // que conteste el instalador. Una al conectar y otra tras el paso.
    expect(medidas).toBe(2);
  });

  it("un segundo «ejecutar» mientras corre NO lanza otro proceso", async () => {
    // Dos `sdkmanager` sobre el mismo SDK es una carrera con una instalación de por medio, y
    // la máquina es UNA aunque haya dos pestañas. Se reenvía el estado, que es lo que la otra
    // pestaña necesita para pintar el log que ya va por dentro.
    const e = ejecutorDeReceta();
    const { cliente, accion } = await conectar({ correrPasoDeReceta: e.correr });
    await enviarMensaje(accion, { clase: "receta", id: "android-emulador", paso: 3, accion: "ejecutar" });
    await asentar();
    await enviarMensaje(accion, { clase: "receta", id: "android-emulador", paso: 4, accion: "ejecutar" });
    await asentar();
    expect(e.lanzados).toEqual([{ receta: "android-emulador", paso: 3 }]);
    expect(progresos(cliente).at(-1)).toMatchObject({ paso: 3, estado: "corriendo" });
  });

  it("cancelar llega al trabajo, y su estado se cuenta", async () => {
    const e = ejecutorDeReceta();
    const { cliente, accion } = await conectar({ correrPasoDeReceta: e.correr });
    await enviarMensaje(accion, { clase: "receta", id: "android-emulador", paso: 3, accion: "ejecutar" });
    await asentar();
    await enviarMensaje(accion, { clase: "receta", id: "android-emulador", paso: 3, accion: "cancelar" });
    expect(e.cancelado).toBe(true);
    e.acabar("cancelada");
    await asentar();
    expect(progresos(cliente).at(-1)).toMatchObject({ estado: "cancelada" });
  });

  it("cancelar sin nada corriendo no revienta", async () => {
    const { accion } = await conectar({ correrPasoDeReceta: ejecutorDeReceta().correr });
    expect(await enviarMensaje(accion, { clase: "receta", id: "android-emulador", paso: 3, accion: "cancelar" })).toBe(204);
  });

  it("sin ejecutor se DICE y no se emite ningún progreso: el paso se copia igual", async () => {
    const dichos: string[] = [];
    const { cliente, accion } = await conectar({ informar: (x) => dichos.push(x) });
    await enviarMensaje(accion, { clase: "receta", id: "android-emulador", paso: 3, accion: "ejecutar" });
    await asentar();
    expect(progresos(cliente)).toEqual([]);
    expect(dichos.join(" ")).toMatch(/no puede ejecutar/i);
  });

  it("un fallo llega con su motivo de UNA línea, y después se mide igual", async () => {
    const e = ejecutorDeReceta();
    let medidas = 0;
    const { cliente, accion } = await conectar({
      correrPasoDeReceta: e.correr,
      detectarDispositivos: async () => {
        medidas += 1;
        return { sistema: "mac", herramientas: [], dispositivos: [], avds: [], recetas: [], medido: "2026-09-07T10:00:00.000Z" };
      },
    });
    await enviarMensaje(accion, { clase: "receta", id: "android-emulador", paso: 3, accion: "ejecutar" });
    await asentar();
    e.acabar("fallo", "Warning: Failed to find package");
    await asentar();
    expect(progresos(cliente).at(-1)).toMatchObject({ estado: "fallo", motivo: "Warning: Failed to find package" });
    expect(medidas).toBe(2);
  });
});

/**
 * Los proveedores SIN credencial se prueban al conectar, y solo ellos.
 *
 * «¿Puedo usar Ollama?» no la contesta ninguna credencial —no lleva—: la contesta si el
 * demonio responde, y eso solo se sabe pidiéndole el catálogo. Sin esta prueba, el proveedor
 * por omisión de esta consola no aparecería nunca en su propia lista de comprobados.
 *
 * Y solo ellos: cada catálogo de un proveedor de pago es una llamada a Internet, y ahí la
 * credencial ya responde la pregunta. La regla de «bajo demanda» se mantiene para esos.
 */
describe("la comprobación de los proveedores que no llevan clave", () => {
  const catalogoQueApunta = () => {
    const pedidos: string[] = [];
    return {
      pedidos,
      catalogo: async (proveedor: string) => {
        pedidos.push(proveedor);
        if (proveedor === "ollama") return [{ id: "llama3" }];
        throw new Error(`no debería preguntarse por ${proveedor}`);
      },
    };
  };

  it("al conectar se pide el catálogo de ollama, y de NINGÚN otro", async () => {
    const c = catalogoQueApunta();
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      catalogoDeModelos: c.catalogo as never,
      // Con credencial en todos: aun así, a los de pago no se les pregunta.
      hayCredencial: () => true,
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    expect(c.pedidos).toEqual(["ollama"]);
    // Y el resultado llega por el cable: es lo que deja decir que ollama está comprobado.
    const modelos = cliente.recibidos.filter((m) => m.clase === "modelos").at(-1) as Extract<
      MensajeAlCliente,
      { clase: "modelos" }
    >;
    expect(modelos.proveedores.find((p) => p.id === "ollama")?.modelos).toEqual([{ id: "llama3" }]);
  });

  it("una segunda pestaña no vuelve a preguntar: la respuesta ya está", async () => {
    // Es una llamada por proceso, no por cliente: la máquina es la misma para todos.
    const c = catalogoQueApunta();
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { catalogoDeModelos: c.catalogo as never });
    const primera = clienteDeMentira();
    const segunda = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(primera.peticion, primera.respuesta);
    await asentar();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(segunda.peticion, segunda.respuesta);
    await asentar();
    expect(c.pedidos).toEqual(["ollama"]);
  });

  it("si ollama no contesta, se dice: el error viaja y el proveedor NO queda comprobado", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      catalogoDeModelos: async () => {
        throw new Error("no se pudo conectar con ollama en http://127.0.0.1:11434");
      },
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    const modelos = cliente.recibidos.filter((m) => m.clase === "modelos").at(-1) as Extract<
      MensajeAlCliente,
      { clase: "modelos" }
    >;
    const ollama = modelos.proveedores.find((p) => p.id === "ollama")!;
    expect(ollama.modelos).toBeUndefined();
    expect(ollama.error).toContain("ollama");
  });

  it("sin puerto de catálogos no se prueba nada y el cable no se queda a medias", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {});
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    expect(cliente.recibidos.some((m) => m.clase === "modelos")).toBe(true);
  });
});

describe("los modelos de un motor externo, por el cable", () => {
  const conectar = async (opciones: Parameters<typeof montarRutas>[2]) => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), opciones);
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    return { cliente, accion: servidor.rutas.get(`POST ${RUTA_ACCION}`)! };
  };
  const ultimo = (cliente: ReturnType<typeof clienteDeMentira>) =>
    cliente.recibidos.filter((m) => m.clase === "modelosDeMotor").at(-1) as Extract<
      MensajeAlCliente,
      { clase: "modelosDeMotor" }
    >;

  it("se piden bajo demanda y se cachean: el de Codex arranca un proceso", async () => {
    const pedidos: string[] = [];
    const { cliente, accion } = await conectar({
      modelosDeMotor: async (motor) => {
        pedidos.push(motor);
        return { modelos: [{ id: "gpt-5.6-sol", nombre: "GPT-5.6-Sol" }] };
      },
    });
    // No se pregunta al conectar: la ventana de subagentes casi nadie la abre.
    expect(pedidos).toEqual([]);

    await enviarMensaje(accion, { clase: "modelosDeMotor", motor: "codex" });
    await asentar();
    expect(ultimo(cliente)).toMatchObject({ motor: "codex", modelos: [{ id: "gpt-5.6-sol", nombre: "GPT-5.6-Sol" }] });

    // La segunda vez sale de la caché: no se lanza otro proceso.
    await enviarMensaje(accion, { clase: "modelosDeMotor", motor: "codex" });
    await asentar();
    expect(pedidos).toEqual(["codex"]);
  });

  it("un fallo NO se cachea: instalar Codex después tiene que funcionar sin reiniciar", async () => {
    let veces = 0;
    const { cliente, accion } = await conectar({
      modelosDeMotor: async () => {
        veces += 1;
        return veces === 1 ? { modelos: [], error: "codex no está instalado" } : { modelos: [{ id: "gpt-5.5", nombre: "GPT-5.5" }] };
      },
    });
    await enviarMensaje(accion, { clase: "modelosDeMotor", motor: "codex" });
    await asentar();
    expect(ultimo(cliente).error).toMatch(/no está instalado/);

    await enviarMensaje(accion, { clase: "modelosDeMotor", motor: "codex" });
    await asentar();
    expect(ultimo(cliente).modelos).toEqual([{ id: "gpt-5.5", nombre: "GPT-5.5" }]);
  });

  it("sin puerto se DICE, en vez de una lista vacía muda", async () => {
    const { cliente, accion } = await conectar({});
    await enviarMensaje(accion, { clase: "modelosDeMotor", motor: "claude-code" });
    await asentar();
    expect(ultimo(cliente)).toMatchObject({ modelos: [], error: expect.stringContaining("no puede") });
  });
});

/**
 * Una `TareasEnDisco` de mentira COMPLETA — la interfaz entera, no solo lo que
 * `montarRutas` toca (`Pick<…, "listar" | "guardar" | "borrarTarea">`), porque este mismo
 * doble se le pasa también al corredor de VERDAD (`crearCorredorDeTareas`) en el describe
 * de más abajo, y ese sí necesita el cerrojo. El índice se guarda en un array del cierre,
 * no en disco — es la misma disciplina que el resto de los dobles de este fichero.
 */
function colaDeMentira(iniciales: Tarea[] = []) {
  let tareas: Tarea[] = iniciales;
  return {
    listar: (): Tarea[] => tareas,
    guardar: (nuevas: readonly Tarea[]): void => void (tareas = [...nuevas]),
    borrarTarea: (id: string): void => void (tareas = tareas.filter((t) => t.id !== id)),
    // El cerrojo: un solo dueño de mentira, siempre concedido.
    tomarCerrojo: (): { tomado: true } => ({ tomado: true }),
    sigoSiendoDueño: (): boolean => true,
    soltarCerrojo: (): void => {},
    guardarAdjunto: (): { ok: boolean } => ({ ok: true }),
    listarAdjuntos: (): AdjuntoDeTarea[] => [],
    carpetaDeAdjuntos: (): string => "/no-usado-en-estos-tests/adjuntos",
    // Para leer el estado en el test sin pasar por el cable.
    verTareas: (): Tarea[] => tareas,
  };
}

describe("las tareas en background, por el cable", () => {
  const ultimo = (cliente: ReturnType<typeof clienteDeMentira>) =>
    cliente.recibidos.filter((m) => m.clase === "tareas").at(-1) as Extract<MensajeAlCliente, { clase: "tareas" }>;

  it("la cola va en la ráfaga de bienvenida, y sin la raíz del proyecto", async () => {
    const servidor = servidorDeMentira();
    const cola = colaDeMentira([
      {
        id: "t1",
        proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
        titulo: "Arregla el login",
        peticion: "Arregla el login",
        encargo: "Arregla el login",
        adjuntos: [],
        estado: "nuevo" as const,
        creada: "2026-09-08T10:00:00.000Z",
      },
    ]);
    montarRutas(servidor, vestibuloDePrueba(), {
      colaDeTareas: cola,
      corredorDeTareas: { corriendoAqui: () => true, ejecutaOtroProceso: () => false, cortar: async () => true },
      concurrenciaDeTareas: () => 2,
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    const mensaje = ultimo(cliente);
    expect(mensaje.lista[0]).toMatchObject({ id: "t1", proyectoNombre: "AppDemo", estado: "nuevo" });
    expect(mensaje.concurrencia).toBe(2);
    expect(mensaje.corriendoAqui).toBe(true);
    // «No soy yo» y «no hay nadie» son la diferencia entre esperar y que no pase nada nunca,
    // así que la respuesta del corredor viaja tal cual — y sin el pid, que es un dato de la
    // máquina.
    expect(mensaje.ejecutaOtroProceso).toBe(false);
    // La ruta de la máquina NO viaja.
    expect(JSON.stringify(mensaje)).not.toContain("/w/AppDemo");
  });

  it("lo que la tarea AUTORIZÓ viaja, con ruta relativa; ausente cuando no consta", async () => {
    const servidor = servidorDeMentira();
    const cola = colaDeMentira([
      {
        id: "t1",
        proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
        titulo: "Arregla el login",
        peticion: "Arregla el login",
        encargo: "Arregla el login",
        adjuntos: [],
        estado: "requiere-atencion" as const,
        motivo: "el juez marcó el trabajo en rojo",
        sesion: "s1",
        creada: "2026-09-08T10:00:00.000Z",
        autorizadas: ["src/app.xne", "src/Login.xne"],
      },
      {
        id: "t2",
        proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
        titulo: "Sin correr todavía",
        peticion: "Sin correr todavía",
        encargo: "Sin correr todavía",
        adjuntos: [],
        estado: "nuevo" as const,
        creada: "2026-09-08T10:00:00.000Z",
      },
    ]);
    montarRutas(servidor, vestibuloDePrueba(), {
      colaDeTareas: cola,
      corredorDeTareas: { corriendoAqui: () => true, cortar: async () => true },
      concurrenciaDeTareas: () => 2,
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    const mensaje = ultimo(cliente);
    expect(mensaje.lista.find((t) => t.id === "t1")?.autorizadas).toEqual(["src/app.xne", "src/Login.xne"]);
    // La que nunca corrió no lleva el campo: no consta, y no es lo mismo que «ninguna».
    expect(mensaje.lista.find((t) => t.id === "t2")?.autorizadas).toBeUndefined();
  });

  it("el historial de feedback viaja; ausente cuando nunca se le pidió nada", async () => {
    const servidor = servidorDeMentira();
    const cola = colaDeMentira([
      {
        id: "t1",
        proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
        titulo: "Arregla el login",
        peticion: "Arregla el login",
        encargo: "Arregla el login",
        adjuntos: [],
        estado: "nuevo" as const,
        creada: "2026-09-08T10:00:00.000Z",
        feedback: [
          { texto: "primero", creado: "2026-09-08T10:00:00.000Z", consumido: true },
          { texto: "segundo", creado: "2026-09-08T11:00:00.000Z", consumido: false },
        ],
      },
      {
        id: "t2",
        proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
        titulo: "Sin feedback nunca",
        peticion: "x",
        encargo: "x",
        adjuntos: [],
        estado: "nuevo" as const,
        creada: "2026-09-08T10:00:00.000Z",
      },
    ]);
    montarRutas(servidor, vestibuloDePrueba(), { colaDeTareas: cola });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    const mensaje = ultimo(cliente);
    expect(mensaje.lista.find((t) => t.id === "t1")?.feedback).toEqual([
      { texto: "primero", creado: "2026-09-08T10:00:00.000Z", consumido: true },
      { texto: "segundo", creado: "2026-09-08T11:00:00.000Z", consumido: false },
    ]);
    expect(mensaje.lista.find((t) => t.id === "t2")?.feedback).toBeUndefined();
  });

  it("crear una tarea RESUELVE el proyecto con el estado del propio cierre, la encola y hace revisar", async () => {
    let revisado = 0;
    const servidor = servidorDeMentira();
    const cola = colaDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      colaDeTareas: cola,
      revisarTareas: () => void (revisado += 1),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    // Sin ningún «entorno activo» a mano: conectar por SSE ya deja `proyectos`/
    // `entornoElegido` resueltos por su cuenta (`poblarProyectosSiProcede`, el mismo
    // auto-select de quien entra directo al Dashboard con un solo entorno registrado —
    // aquí «webstudio», con «p1» → «Tienda» de fábrica en `vestibuloDePrueba`). Es la
    // resolución REAL que usa `atenderCrearTarea`, no una preparación aparte del test.
    await asentar();
    expect(
      await enviarMensaje(accion, { clase: "tarea", accion: "crear", proyecto: "p1", peticion: "Arregla", encargo: "Arregla bien" })
    ).toBe(204);
    await asentar();
    const creadas = cola.verTareas();
    expect(creadas).toHaveLength(1);
    expect(creadas[0]).toMatchObject({
      proyecto: { id: "p1", nombre: "Tienda" },
      peticion: "Arregla",
      encargo: "Arregla bien",
      estado: "nuevo",
    });
    // La raíz SÍ se resolvió (es lo que hace falta para poder correrla algún día), pero
    // nunca sale por el cable — en ESTE mensaje, el que la propia creación dispara
    // (`emitirTareas()` tras `atenderCrearTarea`), no solo en el de la bienvenida de otro
    // test con otra tarea.
    expect(creadas[0]!.proyecto.raiz).toMatch(/Tienda$/);
    expect(JSON.stringify(ultimo(cliente))).not.toContain(creadas[0]!.proyecto.raiz);
    expect(revisado).toBe(1);
  });

  it("crear con un proyecto que no se puede resolver no escribe nada, y se DICE", async () => {
    // Sin entorno elegido: `atenderCrearTarea` no tiene con qué resolver la raíz.
    const servidor = servidorDeMentira();
    const cola = colaDeMentira();
    const avisos: string[] = [];
    montarRutas(servidor, vestibuloDePrueba(), {
      colaDeTareas: cola,
      informar: (texto) => avisos.push(texto),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    await enviarMensaje(accion, { clase: "tarea", accion: "crear", proyecto: "fantasma", peticion: "x", encargo: "y" });
    await asentar();
    expect(cola.verTareas()).toEqual([]);
    expect(avisos.some((a) => a.includes("fantasma"))).toBe(true);
  });

  it("reintentar y terminar transicionan la tarea; descartar la BORRA sin mirar el estado", async () => {
    const servidor = servidorDeMentira();
    const base = {
      proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
      titulo: "T",
      peticion: "p",
      encargo: "e",
      adjuntos: [],
      creada: "2026-09-08T10:00:00.000Z",
    };
    const cola = colaDeMentira([
      { ...base, id: "t-park", estado: "requiere-atencion", motivo: "algo" },
      { ...base, id: "t-en-curso", estado: "en-proceso" },
    ]);
    let revisado = 0;
    montarRutas(servidor, vestibuloDePrueba(), {
      colaDeTareas: cola,
      revisarTareas: () => void (revisado += 1),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    await enviarMensaje(accion, { clase: "tarea", accion: "reintentar", id: "t-park" });
    await asentar();
    expect(cola.verTareas().find((t) => t.id === "t-park")?.estado).toBe("nuevo");
    expect(cola.verTareas().find((t) => t.id === "t-park")?.motivo).toBeUndefined();

    // Descartar borra aunque esté «en-proceso»: SIN corredor cableado no hay turno que
    // cortar (ver la batería de Task 14 más abajo para el caso CON corredor).
    await enviarMensaje(accion, { clase: "tarea", accion: "descartar", id: "t-en-curso" });
    await asentar();
    expect(cola.verTareas().find((t) => t.id === "t-en-curso")).toBeUndefined();

    expect(revisado).toBeGreaterThan(0);
  });

  /**
   * F1 de la revisión final: «Dar por bueno» es la CUARTA forma de llegar a «Terminada»
   * —sin verificador y sin juez—, y `conEstado` borra el `motivo`, así que sin una marca la
   * tarea resultante es indistinguible de una entregada por la puerta completa. La marca la
   * pone `core/tareas.ts#darPorBuenaAMano`, y esto comprueba que este camino pasa por ahí.
   */
  it("«no lo ejecuta nadie» y «no se sabe» viajan distintos, y ninguno se sintetiza", async () => {
    const base = {
      proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
      titulo: "T",
      peticion: "p",
      encargo: "e",
      adjuntos: [],
      creada: "2026-09-08T10:00:00.000Z",
      estado: "nuevo" as const,
    };
    // Nadie lo ejecuta: el corredor lo AFIRMA (tomó el cerrojo y lo soltó).
    const s1 = servidorDeMentira();
    montarRutas(s1, vestibuloDePrueba(), {
      colaDeTareas: colaDeMentira([{ ...base, id: "t1" }]),
      corredorDeTareas: { corriendoAqui: () => false, ejecutaOtroProceso: () => false, cortar: async () => true },
    });
    const c1 = clienteDeMentira();
    await s1.rutas.get(`GET ${RUTA_EVENTOS}`)!(c1.peticion, c1.respuesta);
    await asentar();
    expect(ultimo(c1).ejecutaOtroProceso).toBe(false);

    // Y un corredor que no sabe contestarlo no manda el campo: ausente es «no se sabe», que
    // no es «nadie» — la interfaz no puede prometer una espera que quizá no acabe nunca.
    const s2 = servidorDeMentira();
    montarRutas(s2, vestibuloDePrueba(), {
      colaDeTareas: colaDeMentira([{ ...base, id: "t1" }]),
      corredorDeTareas: { corriendoAqui: () => false, cortar: async () => true },
    });
    const c2 = clienteDeMentira();
    await s2.rutas.get(`GET ${RUTA_EVENTOS}`)!(c2.peticion, c2.respuesta);
    await asentar();
    expect("ejecutaOtroProceso" in ultimo(c2)).toBe(false);
  });

  it("terminar a mano DEJA LA MARCA, y no toca el veredicto que hubiera", async () => {
    const servidor = servidorDeMentira();
    const cola = colaDeMentira([
      {
        id: "t-park",
        proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
        titulo: "T",
        peticion: "p",
        encargo: "e",
        adjuntos: [],
        creada: "2026-09-08T10:00:00.000Z",
        estado: "requiere-atencion",
        motivo: "el juez de QA dijo «rojo»: falta el campo",
        veredicto: { veredicto: "rojo", resumen: "falta el campo" },
      },
    ]);
    montarRutas(servidor, vestibuloDePrueba(), { colaDeTareas: cola });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    await enviarMensaje(accion, { clase: "tarea", accion: "terminar", id: "t-park" });
    await asentar();
    const terminada = cola.verTareas().find((t) => t.id === "t-park")!;
    expect(terminada.estado).toBe("terminada");
    expect(terminada.terminadaAMano).toBe(true);
    expect(terminada.veredicto).toEqual({ veredicto: "rojo", resumen: "falta el campo" });
  });


  /**
   * Task 14: antes de esto, descartar una tarea `en-proceso` la borraba en el ACTO — el
   * turno seguía corriendo por debajo, escribiendo en el proyecto, sin que ninguna pantalla
   * lo dijera. `atenderAccionDeTarea` ahora espera a `corredorDeTareas.cortar(id)` ANTES de
   * `borrarTarea`: esta batería prueba el CABLEADO (que se llama, en qué orden, qué hace con
   * cada resultado), no el corte de verdad —eso ya lo prueba `corredorDeTareas.test.ts`
   * contra un corredor real—.
   */
  describe("descartar corta el turno en vuelo ANTES de borrar (Task 14)", () => {
    const tareaEnCurso = {
      id: "t-en-curso",
      proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
      titulo: "Arregla el login",
      peticion: "p",
      encargo: "e",
      adjuntos: [],
      estado: "en-proceso" as const,
      creada: "2026-09-08T10:00:00.000Z",
    };

    it("el orden es load-bearing: cortar() se resuelve ANTES de que borrarTarea() se llame", async () => {
      const orden: string[] = [];
      const servidor = servidorDeMentira();
      const cola = colaDeMentira([tareaEnCurso]);
      const colaConOrden = {
        ...cola,
        borrarTarea: (id: string) => {
          orden.push("borrar");
          cola.borrarTarea(id);
        },
      };
      montarRutas(servidor, vestibuloDePrueba(), {
        colaDeTareas: colaConOrden,
        corredorDeTareas: {
          corriendoAqui: () => true,
          cortar: async () => {
            orden.push("cortar");
            return true;
          },
        },
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "tarea", accion: "descartar", id: "t-en-curso" });
      await asentar();
      expect(orden).toEqual(["cortar", "borrar"]);
      expect(colaConOrden.listar().find((t) => t.id === "t-en-curso")).toBeUndefined();
    });

    it("si el corte no llega a tiempo (`cortar` resuelve `false`), NO se borra, y se avisa", async () => {
      const servidor = servidorDeMentira();
      const cola = colaDeMentira([tareaEnCurso]);
      const avisos: string[] = [];
      montarRutas(servidor, vestibuloDePrueba(), {
        colaDeTareas: cola,
        corredorDeTareas: { corriendoAqui: () => true, cortar: async () => false },
        informar: (texto) => avisos.push(texto),
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "tarea", accion: "descartar", id: "t-en-curso" });
      await asentar();
      // Sigue ahí: no se le quitó la carpeta de adjuntos a un turno que sigue de verdad
      // corriendo.
      expect(cola.verTareas().find((t) => t.id === "t-en-curso")).toBeDefined();
      expect(avisos.some((a) => a.includes("sigue en marcha"))).toBe(true);
    });

    it("si la ejecuta OTRO proceso (`corriendoAqui` falso), tampoco se borra: no hay forma de cortarla desde aquí", async () => {
      const servidor = servidorDeMentira();
      const cola = colaDeMentira([tareaEnCurso]);
      const avisos: string[] = [];
      let cortarLlamado = 0;
      montarRutas(servidor, vestibuloDePrueba(), {
        colaDeTareas: cola,
        corredorDeTareas: {
          corriendoAqui: () => false,
          cortar: async () => {
            cortarLlamado += 1;
            return true;
          },
        },
        informar: (texto) => avisos.push(texto),
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "tarea", accion: "descartar", id: "t-en-curso" });
      await asentar();
      expect(cola.verTareas().find((t) => t.id === "t-en-curso")).toBeDefined();
      expect(avisos.some((a) => a.includes("otro proceso"))).toBe(true);
      // Ni se intenta: `cortar` no tiene con qué alcanzar un turno de OTRO proceso.
      expect(cortarLlamado).toBe(0);
    });

    it("descartar una que NO está en proceso también pasa por `cortar` —sin efecto, pero por el mismo camino— y borra igual", async () => {
      const servidor = servidorDeMentira();
      const cola = colaDeMentira([{ ...tareaEnCurso, id: "t-nueva", estado: "nuevo" as const }]);
      let cortarLlamadoCon: string | undefined;
      montarRutas(servidor, vestibuloDePrueba(), {
        colaDeTareas: cola,
        corredorDeTareas: {
          corriendoAqui: () => true,
          cortar: async (id) => {
            cortarLlamadoCon = id;
            return true; // nada en vuelo con ese id: seguro seguir
          },
        },
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "tarea", accion: "descartar", id: "t-nueva" });
      await asentar();
      expect(cortarLlamadoCon).toBe("t-nueva");
      expect(cola.verTareas().find((t) => t.id === "t-nueva")).toBeUndefined();
    });

    it("sin `corredorDeTareas` cableado, descartar borra directo: no hay ningún turno que pueda estar corriendo", async () => {
      const servidor = servidorDeMentira();
      const cola = colaDeMentira([tareaEnCurso]);
      montarRutas(servidor, vestibuloDePrueba(), { colaDeTareas: cola });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "tarea", accion: "descartar", id: "t-en-curso" });
      await asentar();
      expect(cola.verTareas().find((t) => t.id === "t-en-curso")).toBeUndefined();
    });
  });

  /**
   * Task 12: «se edita la tarea y se agrega el feedback del usuario» (§0 del diseño). Es su
   * propia acción del cable (`{clase:"tarea", accion:"feedback", id, texto}`) y no un
   * tercer campo en `reintentar`: lleva `texto`, que las otras tres no llevan.
   */
  it("un feedback devuelve la tarea a `nuevo`, con el texto guardado, y hace revisar", async () => {
    const servidor = servidorDeMentira();
    const cola = colaDeMentira([
      {
        id: "t1",
        proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
        titulo: "T",
        peticion: "p",
        encargo: "e",
        adjuntos: [],
        estado: "requiere-atencion",
        motivo: "¿lleva histórico?",
        sesion: "s1",
        creada: "2026-09-08T10:00:00.000Z",
      },
    ]);
    let revisado = 0;
    montarRutas(servidor, vestibuloDePrueba(), {
      colaDeTareas: cola,
      revisarTareas: () => void (revisado += 1),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    expect(
      await enviarMensaje(accion, { clase: "tarea", accion: "feedback", id: "t1", texto: "sí, con histórico" })
    ).toBe(204);
    await asentar();
    const tarea = cola.verTareas().find((t) => t.id === "t1")!;
    expect(tarea.estado).toBe("nuevo");
    // El motivo de AYER no puede seguir enseñándose: es la misma regla de siempre al salir
    // de `requiere-atencion`.
    expect(tarea.motivo).toBeUndefined();
    // Y el hilo NO se toca aquí: solo lo hace el corredor, al reanudar de verdad.
    expect(tarea.sesion).toBe("s1");
    expect(tarea.feedback).toEqual([
      { texto: "sí, con histórico", creado: expect.any(String), consumido: false },
    ]);
    expect(revisado).toBeGreaterThan(0);
  });

  it("un feedback en blanco se rechaza y se DICE, sin escribir nada", async () => {
    const servidor = servidorDeMentira();
    const cola = colaDeMentira([
      {
        id: "t1",
        proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
        titulo: "T",
        peticion: "p",
        encargo: "e",
        adjuntos: [],
        estado: "requiere-atencion",
        motivo: "¿lleva histórico?",
        creada: "2026-09-08T10:00:00.000Z",
      },
    ]);
    const avisos: string[] = [];
    montarRutas(servidor, vestibuloDePrueba(), {
      colaDeTareas: cola,
      informar: (texto) => avisos.push(texto),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    expect(await enviarMensaje(accion, { clase: "tarea", accion: "feedback", id: "t1", texto: "   " })).toBe(204);
    await asentar();
    expect(cola.verTareas()[0]!.estado).toBe("requiere-atencion");
    expect(cola.verTareas()[0]!.feedback).toBeUndefined();
    expect(avisos.some((a) => a.includes("feedback"))).toBe(true);
  });

  it("sin puerto de tareas, un feedback tampoco hace nada", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {});
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    expect(await enviarMensaje(accion, { clase: "tarea", accion: "feedback", id: "t1", texto: "algo" })).toBe(204);
    await asentar();
    expect(cliente.recibidos.some((m) => m.clase === "tareas")).toBe(false);
  });

  it("una transición imposible se IGNORA y se DICE: nunca se lanza y nunca se escribe", async () => {
    const servidor = servidorDeMentira();
    const cola = colaDeMentira([
      {
        id: "t1",
        proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
        titulo: "T",
        peticion: "p",
        encargo: "e",
        adjuntos: [],
        estado: "nuevo",
        creada: "2026-09-08T10:00:00.000Z",
      },
    ]);
    const avisos: string[] = [];
    montarRutas(servidor, vestibuloDePrueba(), {
      colaDeTareas: cola,
      informar: (texto) => avisos.push(texto),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    // «nuevo» → «terminada» no está en TRANSICIONES: conEstado lanzaría.
    expect(await enviarMensaje(accion, { clase: "tarea", accion: "terminar", id: "t1" })).toBe(204);
    await asentar();
    expect(cola.verTareas()[0]!.estado).toBe("nuevo");
    expect(avisos.some((a) => a.includes("terminar"))).toBe(true);
  });

  it("sin puerto de tareas no se manda ninguna cola, y crear/accionar no hacen nada: no se afirma que no haya", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {});
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    expect(cliente.recibidos.some((m) => m.clase === "tareas")).toBe(false);
    await enviarMensaje(accion, { clase: "tarea", accion: "crear", proyecto: "p1", peticion: "x", encargo: "y" });
    await enviarMensaje(accion, { clase: "tarea", accion: "reintentar", id: "t1" });
    await asentar();
    expect(cliente.recibidos.some((m) => m.clase === "tareas")).toBe(false);
  });

  it("cambiar el tope de concurrencia lo guarda y hace revisar", async () => {
    const concurrencias: number[] = [];
    let revisado = 0;
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      colaDeTareas: colaDeMentira(),
      guardarConcurrencia: (c) => void concurrencias.push(c),
      revisarTareas: () => void (revisado += 1),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    expect(await enviarMensaje(accion, { clase: "tareas", concurrencia: 4 })).toBe(204);
    await asentar();
    expect(concurrencias).toEqual([4]);
    expect(revisado).toBe(1);
  });

  it("el workspace viaja en la ráfaga, y elegirlo LLEGA a guardarWorkspace", async () => {
    // Lo que se fija es el CABLE, no la escritura: `ajusteDeWorkspaceCableado` ya prueba
    // qué se acepta y qué se guarda. Aquí lo que puede caerse es que el mensaje no llegue
    // a nadie, que es el patrón de fallo que este ajuste ya traía de serie.
    const elegidas: string[] = [];
    let enDisco = "/Users/ana/.xonecode/workspace";
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      workspace: () => enDisco,
      guardarWorkspace: (r) => {
        elegidas.push(r);
        enDisco = r;
      },
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    expect(cliente.recibidos.filter((m) => m.clase === "workspace")).toEqual([
      { clase: "workspace", ruta: "/Users/ana/.xonecode/workspace" },
    ]);

    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    expect(await enviarMensaje(accion, { clase: "workspace", ruta: "~/xone-proyectos" })).toBe(204);
    await asentar();
    expect(elegidas).toEqual(["~/xone-proyectos"]);
    // Y se REEMITE: el campo acaba enseñando lo que hay, no lo que se tecleó.
    expect(cliente.recibidos.at(-1)).toEqual({ clase: "workspace", ruta: "~/xone-proyectos" });
  });

  it("el selector de carpeta se OFRECE solo si esta ejecución lo monta", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { workspace: () => "/w" });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    // Ausente ya significa que no: un `false` escrito daría dos formas de decir lo mismo.
    expect(cliente.recibidos.find((m) => m.clase === "workspace")).toEqual({ clase: "workspace", ruta: "/w" });
  });

  it("elegir carpeta contesta en el ACTO y la carpeta llega por el SSE", async () => {
    // El diálogo lo abre una persona: dejar la petición abierta minutos enteros es lo que
    // este servidor no hace en ningún otro sitio.
    let soltar: (r: string | undefined) => void = () => {};
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      workspace: () => "/w",
      elegirCarpeta: () => new Promise((r) => (soltar = r)),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    expect(cliente.recibidos.find((m) => m.clase === "workspace")).toEqual({
      clase: "workspace",
      ruta: "/w",
      puedeElegir: true,
    });

    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    expect(await enviarMensaje(accion, { clase: "elegirCarpeta" })).toBe(204);
    soltar("/Volumes/Externo/xone");
    await asentar();
    expect(cliente.recibidos.at(-1)).toEqual({ clase: "carpetaElegida", ruta: "/Volumes/Externo/xone" });
  });

  it("cancelar el diálogo se ACUSA igual, o el «abriendo…» se queda encendido", async () => {
    let soltar: (r: string | undefined) => void = () => {};
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      workspace: () => "/w",
      elegirCarpeta: () => new Promise((r) => (soltar = r)),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await enviarMensaje(accion, { clase: "elegirCarpeta" });
    soltar(undefined);
    await asentar();
    expect(cliente.recibidos.at(-1)).toEqual({ clase: "carpetaElegida" });
  });

  it("y el diálogo se abre DONDE está la carpeta de ahora, no en un sitio cualquiera", async () => {
    const desdes: (string | undefined)[] = [];
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      workspace: () => "/Users/ana/.xonecode/workspace",
      elegirCarpeta: async (desde) => {
        desdes.push(desde);
        return undefined;
      },
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "elegirCarpeta" });
    await asentar();
    expect(desdes).toEqual(["/Users/ana/.xonecode/workspace"]);
  });

  it("sin puerto de workspace no se manda ninguno: un control sin dato detrás no se pinta", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {});
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    expect(cliente.recibidos.some((m) => m.clase === "workspace")).toBe(false);
  });

  it("sin puerto de augmentar no manda ningún «augmentado»", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      colaDeTareas: colaDeMentira(),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    expect(
      await enviarMensaje(accion, { clase: "tarea", accion: "augmentar", proyecto: "p1", peticion: "Arregla" })
    ).toBe(204);
    await asentar();
    expect(cliente.recibidos.some((m) => m.clase === "tarea")).toBe(false);
  });

  it("con puerto de augmentar manda el encargo, o el error si revienta — nunca los dos", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      colaDeTareas: colaDeMentira(),
      augmentar: async ({ texto }) =>
        texto === "revienta" ? Promise.reject(new Error("boom")) : `encargo: ${texto}`,
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    await enviarMensaje(accion, { clase: "tarea", accion: "augmentar", proyecto: "p1", peticion: "Arregla" });
    await asentar();
    const augmentados = cliente.recibidos.filter(
      (m): m is Extract<MensajeAlCliente, { clase: "tarea" }> => m.clase === "tarea"
    );
    expect(augmentados.at(-1)).toEqual({ clase: "tarea", accion: "augmentado", encargo: "encargo: Arregla" });

    await enviarMensaje(accion, { clase: "tarea", accion: "augmentar", proyecto: "p1", peticion: "revienta" });
    await asentar();
    const ultimoAugmentado = cliente.recibidos.filter(
      (m): m is Extract<MensajeAlCliente, { clase: "tarea" }> => m.clase === "tarea"
    ).at(-1);
    expect(ultimoAugmentado).toMatchObject({ clase: "tarea", accion: "augmentado" });
    expect((ultimoAugmentado as { encargo?: string }).encargo).toBeUndefined();
    expect((ultimoAugmentado as { error?: string }).error).toBeDefined();
  });
});

/**
 * `POST /adjunto`: los BYTES de un adjunto, por HTTP y no por el cable (el SSE lleva JSON).
 *
 * Las comprobaciones de `Host`, `Origin` y token las hace `servidor.ts` antes de llegar
 * aquí, igual que a todas las rutas. Lo que se prueba aquí es lo propio: que el nombre pasa
 * la MISMA barrera de segmento llano que un artefacto —de ella depende que esto no escriba
 * fuera de la carpeta de la tarea—, que los topes se respetan, y que **una subida no puede
 * caer nunca en la carpeta de una tarea que ya existe**.
 */
describe("POST /adjunto", () => {
  /** El manejador y lo que la cola vio. `colaDeMentira` aquí guarda los adjuntos en memoria. */
  function conRutaDeAdjunto(iniciales: Tarea[] = [], topeDeAdjunto = 1_000) {
    const guardados: { tarea: string; nombre: string; bytes: number }[] = [];
    const cola = {
      ...colaDeMentira(iniciales),
      guardarAdjunto: (tarea: string, nombre: string, datos: Buffer) => {
        if (datos.length > topeDeAdjunto) return { ok: false, motivo: "el fichero es demasiado grande (tope 1 MB)" };
        guardados.push({ tarea, nombre, bytes: datos.length });
        return { ok: true };
      },
    };
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { colaDeTareas: cola });
    return { guardados, cola, manejador: servidor.rutas.get(`POST ${RUTA_ADJUNTO}`)! };
  }

  /** Un POST con su query y su cuerpo binario. Devuelve el estado y el texto contestado. */
  async function subir(
    manejador: ManejadorRuta,
    query: string,
    cuerpo: Buffer | string = "unos bytes"
  ): Promise<{ estado: number; texto: string }> {
    const peticion = Readable.from([Buffer.from(cuerpo)]) as unknown as IncomingMessage;
    (peticion as { url?: string }).url = `${RUTA_ADJUNTO}?${query}`;
    let estado = 0;
    let texto = "";
    const respuesta = {
      writeHead: (codigo: number) => {
        estado = codigo;
        return respuesta;
      },
      end: (cuerpoDeSalida?: string) => {
        texto = cuerpoDeSalida ?? "";
        return respuesta;
      },
    } as unknown as ServerResponse;
    await manejador(peticion, respuesta);
    return { estado, texto };
  }

  it("guarda el cuerpo con el nombre dado", async () => {
    const { manejador, guardados } = conRutaDeAdjunto();
    expect((await subir(manejador, "tarea=b1&nombre=mockup.png", "PNGPNGPNG")).estado).toBe(204);
    expect(guardados).toEqual([{ tarea: "b1", nombre: "mockup.png", bytes: 9 }]);
  });

  it("sin `tarea` o sin `nombre`, 400", async () => {
    const { manejador, guardados } = conRutaDeAdjunto();
    expect((await subir(manejador, "nombre=x.png")).estado).toBe(400);
    expect((await subir(manejador, "tarea=b1")).estado).toBe(400);
    expect(guardados).toEqual([]);
  });

  it("un nombre que podría salir de su carpeta, 403 — sobre el TEXTO y ya decodificado", async () => {
    // `URLSearchParams` decodifica una vez, así que un `%2e%2e` llega ya como `..` y lo caza
    // la lista blanca; un `%252e%252e` llega con el `%` dentro, que tampoco es texto llano.
    const { manejador, guardados } = conRutaDeAdjunto();
    for (const nombre of ["..", "%2e%2e", "%252e%252e", "a%2Fb.png", "a%5Cb.png", "con%20espacio.png", "%2e%2e%2Ffuera.png"]) {
      expect((await subir(manejador, `tarea=b1&nombre=${nombre}`)).estado, nombre).toBe(403);
    }
    // Y el id de la tarea pasa la misma barrera: por ahí se compone la carpeta.
    for (const tarea of ["..", "%2e%2e", "a%2Fb"]) {
      expect((await subir(manejador, `tarea=${tarea}&nombre=x.png`)).estado, tarea).toBe(403);
    }
    expect(guardados).toEqual([]);
  });

  it("una subida NUNCA cae en la carpeta de una tarea que ya existe: 409", async () => {
    // Es la regla que hace segura la subida antes de crear: el cliente elige el id del
    // BORRADOR, así que sin esto podría escribir en la carpeta de una tarea viva —una que
    // el corredor puede estar ejecutando ahora mismo, con `/adjuntos/` montada—.
    const ya: Tarea = {
      id: "t1",
      proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
      titulo: "t", peticion: "p", encargo: "e", adjuntos: [],
      estado: "en-proceso", creada: "2026-09-08T10:00:00.000Z",
    };
    const { manejador, guardados } = conRutaDeAdjunto([ya]);
    expect((await subir(manejador, "tarea=t1&nombre=x.png")).estado).toBe(409);
    expect(guardados).toEqual([]);
  });

  it("por encima del tope del PUERTO, 413 con su motivo", async () => {
    const { manejador, guardados } = conRutaDeAdjunto([], 10);
    const r = await subir(manejador, "tarea=b1&nombre=grande.bin", Buffer.alloc(50));
    expect(r.estado).toBe(413);
    expect(guardados).toEqual([]);
  });

  it("y por encima del tope del CUERPO también, con un puerto que lo aceptaría", async () => {
    // Son dos topes distintos y este es el que importa para la MEMORIA de este proceso: el
    // cuerpo se corta al leerlo, no después de acumularlo. Con el tope del puerto puesto muy
    // alto, lo único que puede contestar 413 es el lector.
    const { manejador, guardados } = conRutaDeAdjunto([], Number.MAX_SAFE_INTEGER);
    const r = await subir(manejador, "tarea=b1&nombre=g.bin", Buffer.alloc(TOPE_DE_ADJUNTO + 1));
    expect(r.estado).toBe(413);
    expect(guardados).toEqual([]);
  });

  it("ninguna respuesta lleva una ruta de la máquina", async () => {
    const { manejador } = conRutaDeAdjunto([], 10);
    const respuestas = [
      await subir(manejador, "tarea=b1&nombre=..%2Fx.png"),
      await subir(manejador, "tarea=b1&nombre=g.bin", Buffer.alloc(50)),
      await subir(manejador, "nombre=x.png"),
    ];
    for (const r of respuestas) expect(r.texto).not.toMatch(/[/\\](Users|home|var|tmp|casa)[/\\]/);
  });

  it("sin cola de tareas la ruta contesta 404, no revienta", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {});
    const manejador = servidor.rutas.get(`POST ${RUTA_ADJUNTO}`)!;
    expect(manejador).toBeDefined();
    expect((await subir(manejador, "tarea=b1&nombre=x.png")).estado).toBe(404);
  });
});

describe("crear una tarea con adjuntos", () => {
  /** Una cola que sabe listar adjuntos por id de borrador. */
  function colaConAdjuntos(porTarea: Record<string, AdjuntoDeTarea[]>, iniciales: Tarea[] = []) {
    return { ...colaDeMentira(iniciales), listarAdjuntos: (id: string): AdjuntoDeTarea[] => porTarea[id] ?? [] };
  }

  it("el `borrador` se adopta como id, y los adjuntos salen del DISCO", async () => {
    // Nunca de lo que diga el cliente: el navegador sube los bytes por `POST /adjunto` y
    // después manda «crear», así que la única fuente de qué llegó de verdad es la carpeta.
    const cola = colaConAdjuntos({ b1: [{ nombre: "mockup.png", bytes: 2048, mime: "image/png" }] });
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { colaDeTareas: cola });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    await enviarMensaje(accion, {
      clase: "tarea", accion: "crear", proyecto: "p1", peticion: "Arregla", encargo: "ENCARGO", borrador: "b1",
    });
    await asentar();
    expect(cola.verTareas()[0]).toMatchObject({
      id: "b1",
      adjuntos: [{ nombre: "mockup.png", bytes: 2048, mime: "image/png" }],
    });
  });

  it("sin `borrador` la tarea nace con id propio y sin adjuntos", async () => {
    const cola = colaConAdjuntos({});
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { colaDeTareas: cola });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    await enviarMensaje(accion, { clase: "tarea", accion: "crear", proyecto: "p1", peticion: "Arregla", encargo: "E" });
    await asentar();
    expect(cola.verTareas()[0]!.id).not.toBe("");
    expect(cola.verTareas()[0]!.adjuntos).toEqual([]);
  });

  it("un `borrador` que ya es una tarea NO se pisa: no se crea nada y se DICE", async () => {
    // Fail-closed, y con el mismo argumento que el 409 de la subida: el borrador es un id
    // que elige el cliente. Y no se cae a un id nuevo en silencio — eso perdería los
    // adjuntos que la persona acaba de subir sin decírselo.
    const ya: Tarea = {
      id: "t1", proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
      titulo: "t", peticion: "p", encargo: "e", adjuntos: [], estado: "nuevo",
      creada: "2026-09-08T10:00:00.000Z",
    };
    const dichos: string[] = [];
    const cola = colaConAdjuntos({}, [ya]);
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { colaDeTareas: cola, informar: (t) => dichos.push(t) });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    await enviarMensaje(accion, {
      clase: "tarea", accion: "crear", proyecto: "p1", peticion: "Arregla", encargo: "E", borrador: "t1",
    });
    await asentar();
    expect(cola.verTareas()).toHaveLength(1);
    expect(dichos.join(" ")).toMatch(/borrador/i);
  });

  it("un `borrador` que no es segmento llano tampoco crea nada", async () => {
    const dichos: string[] = [];
    const cola = colaConAdjuntos({});
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { colaDeTareas: cola, informar: (t) => dichos.push(t) });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    await enviarMensaje(accion, {
      clase: "tarea", accion: "crear", proyecto: "p1", peticion: "Arregla", encargo: "E", borrador: "../fuera",
    });
    await asentar();
    expect(cola.verTareas()).toEqual([]);
    expect(dichos.join(" ")).toMatch(/borrador/i);
  });
});

describe("augmentar: lo que se le da y cómo se dice que falló", () => {
  function conAumentador(
    augmentar: NonNullable<NonNullable<Parameters<typeof montarRutas>[2]>["augmentar"]>,
    porTarea: Record<string, AdjuntoDeTarea[]> = {}
  ) {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      colaDeTareas: { ...colaDeMentira(), listarAdjuntos: (id: string) => porTarea[id] ?? [] },
      augmentar,
    });
    return servidor;
  }

  async function pedir(servidor: ReturnType<typeof servidorDeMentira>, mensaje: MensajeDelCliente) {
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, mensaje);
    await asentar();
    return cliente.recibidos.filter(
      (m): m is Extract<MensajeAlCliente, { clase: "tarea" }> => m.clase === "tarea"
    );
  }

  it("recibe el proyecto RESUELTO —nombre y raíz— y los adjuntos del borrador", async () => {
    // La raíz no la manda el cliente (nunca la ha visto): la resuelve el servidor, igual que
    // al crear. Está para resolver el papel `trabajo` con el `config.json` del proyecto.
    const vistas: unknown[] = [];
    const servidor = conAumentador(
      async (p) => {
        vistas.push(p);
        return "ENCARGO";
      },
      { b1: [{ nombre: "notas.md", bytes: 4, mime: "text/markdown" }] }
    );
    await pedir(servidor, { clase: "tarea", accion: "augmentar", proyecto: "p1", peticion: "Arregla", borrador: "b1" });
    expect(vistas).toEqual([
      {
        texto: "Arregla",
        proyecto: { id: "p1", raiz: "/w/webstudio/Tienda", nombre: "Tienda" },
        adjuntos: [{ nombre: "notas.md", mime: "text/markdown" }],
      },
    ]);
  });

  it("un proyecto que no se puede resolver NO se augmenta: se contesta el error", async () => {
    // Falla cerrado, igual que al crear: sin proyecto resoluble no hay raíz con la que
    // resolver el modelo, y no se inventa ninguna.
    const servidor = conAumentador(async () => "ENCARGO");
    const mensajes = await pedir(servidor, { clase: "tarea", accion: "augmentar", proyecto: "no-existe", peticion: "x" });
    expect(mensajes.at(-1)).toMatchObject({ accion: "augmentado" });
    expect((mensajes.at(-1) as { error?: string }).error).toBeDefined();
    expect((mensajes.at(-1) as { encargo?: string }).encargo).toBeUndefined();
  });

  it("el MOTIVO de un fallo nuestro se dice con palabras, no con el nombre de la clase", async () => {
    // Era `codigoDe(error)`, que para un error escrito a mano devuelve su `name`: la ventana
    // habría enseñado «No se pudo preparar el encargo (ErrorDelAumentador)», que no dice
    // nada de lo que hay que arreglar. La regla es la del corredor: el MENSAJE si lo
    // escribimos nosotros, el CÓDIGO si lo escribió el sistema.
    const servidor = conAumentador(async () => {
      const error = new Error("no se pudo preparar el encargo (papel «trabajo»): falta la credencial para openai");
      error.name = "ErrorDelAumentador";
      throw error;
    });
    const mensajes = await pedir(servidor, { clase: "tarea", accion: "augmentar", proyecto: "p1", peticion: "x" });
    expect((mensajes.at(-1) as { error?: string }).error).toContain("falta la credencial");
  });

  it("y un fallo del SISTEMA sigue diciendo solo su código: ahí el mensaje lleva la ruta", async () => {
    const servidor = conAumentador(async () => {
      throw Object.assign(new Error("ENOENT: no such file or directory, open '/Users/quien-sea/.xonecode/auth.json'"), {
        code: "ENOENT",
      });
    });
    const mensajes = await pedir(servidor, { clase: "tarea", accion: "augmentar", proyecto: "p1", peticion: "x" });
    expect((mensajes.at(-1) as { error?: string }).error).toBe("ENOENT");
  });
});

/**
 * El CABLEADO de la augmentación: `augmentacionCableada`.
 *
 * Extraída de `arrancarConsolaWeb` y exportada por el MISMO motivo que `revisionConGit` y
 * `fuentesDelJuez`: en esta tanda, CUATRO veces una composición de producción vivía en un
 * cierre que todos sus tests doblan, y una regla podía dejar de estar montada con todo en
 * verde. Aquí lo que se caería sin síntoma es la mitad del contexto del aumentador: sin la
 * rama y sin la memoria del proyecto, el encargo se redacta a ciegas y nada falla.
 */
describe("augmentacionCableada", () => {
  it("le da al aumentador el texto, el proyecto RESUELTO con su rama, los adjuntos y la memoria", async () => {
    const vistas: PeticionDeTarea[] = [];
    const augmentar = augmentacionCableada({
      aumentador: {
        augmentar: async (p) => {
          vistas.push(p);
          return "ENCARGO";
        },
      },
      contexto: (raiz) => ({ rama: `rama-de-${raiz}`, memoria: `memoria-de-${raiz}` }),
    });
    const encargo = await augmentar({
      texto: "Arregla el login",
      proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
      adjuntos: [{ nombre: "mockup.png", mime: "image/png" }],
    });
    expect(encargo).toBe("ENCARGO");
    expect(vistas).toEqual([
      {
        texto: "Arregla el login",
        // La RAÍZ va dentro: es lo que deja resolver el papel `trabajo` con el `config.json`
        // del proyecto, la misma trampa que `CasoDeJuez.raiz`.
        proyecto: { nombre: "AppDemo", raiz: "/w/AppDemo", rama: "rama-de-/w/AppDemo" },
        adjuntos: [{ nombre: "mockup.png", mime: "image/png" }],
        memoria: "memoria-de-/w/AppDemo",
      },
    ]);
  });

  it("lo que el disco no dice no se pone: ausente es «no hay», no una cadena vacía", async () => {
    // Un `rama: undefined` o un `memoria: ""` en el prompt harían que el modelo hablara de
    // una rama sin nombre y de una memoria en blanco como si fueran datos.
    const vistas: PeticionDeTarea[] = [];
    const augmentar = augmentacionCableada({
      aumentador: {
        augmentar: async (p) => {
          vistas.push(p);
          return "E";
        },
      },
      contexto: () => ({}),
    });
    await augmentar({ texto: "x", proyecto: { id: "p1", raiz: "/w/A", nombre: "A" }, adjuntos: [] });
    // `toEqual` trata `{rama: undefined}` igual que `{}`, así que se miran las CLAVES: un
    // `rama: undefined` que llegue al prompt es lo que hay que cazar aquí.
    expect(Object.keys(vistas[0]!).sort()).toEqual(["adjuntos", "proyecto", "texto"]);
    expect(Object.keys(vistas[0]!.proyecto).sort()).toEqual(["nombre", "raiz"]);
  });

  it("sin `contexto` no se lee el disco: la composición sigue funcionando sin él", async () => {
    const augmentar = augmentacionCableada({ aumentador: { augmentar: async () => "E" } });
    expect(await augmentar({ texto: "x", proyecto: { id: "p", raiz: "/w/A", nombre: "A" }, adjuntos: [] })).toBe("E");
  });

  it("el error del aumentador se PROPAGA: quien lo convierte en palabras es el cable", async () => {
    // `atenderAugmentar` aplica la regla del mensaje-o-código; tragárselo aquí dejaría a la
    // ventana con un encargo vacío y sin motivo.
    const augmentar = augmentacionCableada({
      aumentador: {
        augmentar: () => Promise.reject(new ErrorDelAumentador("falta la credencial para openai")),
      },
    });
    await expect(
      augmentar({ texto: "x", proyecto: { id: "p", raiz: "/w/A", nombre: "A" }, adjuntos: [] })
    ).rejects.toThrow(/falta la credencial/);
  });
});

describe("contextoDelProyecto", () => {
  it("lee la rama de CloudStudio y la memoria del proyecto, del disco y por la raíz", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ctx-"));
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    writeFileSync(
      join(raiz, ".xonecode", "config.json"),
      JSON.stringify({ modo: "cloud", cloudstudio: { url: "https://x/mcp", proyecto: "AppDemo", rama: "master" } })
    );
    writeFileSync(join(raiz, ".xonecode", "memoria.md"), "# Memoria\nEl login usa $http");
    const ctx = contextoDelProyecto(raiz);
    expect(ctx.rama).toBe("master");
    expect(ctx.memoria).toContain("El login usa $http");
    rmSync(raiz, { recursive: true, force: true });
  });

  it("un proyecto offline y sin memoria no afirma ninguna de las dos", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ctx2-"));
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
    mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");
    expect(contextoDelProyecto(raiz)).toEqual({});
    rmSync(raiz, { recursive: true, force: true });
  });

  it("una raíz que no existe no lanza: se queda sin contexto y se redacta igual", () => {
    expect(contextoDelProyecto(join(tmpdir(), "no-existe-xonecode-ctx"))).toEqual({});
  });

  it("una memoria enorme se acota: es contexto de una llamada, no un fichero que servir", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ctx3-"));
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "memoria.md"), "a".repeat(TOPE_DE_MEMORIA + 5_000));
    expect(contextoDelProyecto(raiz).memoria!.length).toBeLessThanOrEqual(TOPE_DE_MEMORIA);
    rmSync(raiz, { recursive: true, force: true });
  });
});

/**
 * La MEDIDA de lo que falta por subir, con un repo de verdad.
 *
 * Es la costura que se extrajo del manejador del cable justo para poder probarla aquí: lo
 * que se cae sin síntoma es la cuenta —una lectura que devolviera siempre cero se vería
 * como un proyecto al día, que es exactamente lo que nadie iría a comprobar—. Y el repo real
 * importa porque la cuenta NO es nuestra: es un `git diff` contra la ref de seguimiento que
 * dejó la última bajada (`agent/sesiones/gitSync.ts#cambiosPendientes`, el mismo que decide qué sube
 * el plan). Con un doble se probaría el doble.
 */
describe("lecturaDeSync — lo que la banda de CloudStudio enseña", () => {
  const git = (raiz: string, ...args: string[]): string =>
    execFileSync("git", args, { cwd: raiz, encoding: "utf8" }).trim();

  /** Un proyecto dado de alta en CloudStudio, con repo, un commit y su ref de seguimiento. */
  function proyectoDeCloudStudio(): string {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-sync-"));
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    writeFileSync(
      join(raiz, ".xonecode", "config.json"),
      JSON.stringify({
        modo: "cloud",
        cloudstudio: { url: "https://x/mcp", proyecto: { id: "p1", nombre: "Tienda" }, rama: "main" },
      })
    );
    writeFileSync(join(raiz, "app.xml"), "<app/>");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: raiz });
    git(raiz, "config", "user.email", "t@t");
    git(raiz, "config", "user.name", "t");
    git(raiz, "add", "-A");
    git(raiz, "commit", "-qm", "inicial");
    // La ref que `prepararRepo` escribe en cada bajada: sin ella no hay contra qué comparar.
    git(raiz, "update-ref", "refs/remotes/cloudstudio/main", "HEAD");
    return raiz;
  }

  it("cuenta los ficheros que no están en la rama, contra la ref de la bajada", async () => {
    const raiz = proyectoDeCloudStudio();
    // Al día: el árbol es el mismo que el de la ref.
    expect(await lecturaDeSync(raiz)).toEqual({ clase: "sync", proyecto: "Tienda", rama: "main", pendientes: 0 });

    writeFileSync(join(raiz, "app.xml"), "<app cambiada/>");
    writeFileSync(join(raiz, "otra.xne"), "<x/>");
    git(raiz, "add", "otra.xne");
    expect(await lecturaDeSync(raiz)).toEqual({ clase: "sync", proyecto: "Tienda", rama: "main", pendientes: 2 });

    // Mover la ref a HEAD NO salda esos dos, y el motivo importa: lo que falta se mide contra
    // lo que CONSTA en la ref, y en HEAD no hay nada de esto —los cambios no están
    // commiteados—. Es lo que hace `marcarSubido` al terminar una subida: mover la ref al
    // commit que se acaba de crear. Nunca es un contador que suba y baje por su cuenta.
    git(raiz, "update-ref", "refs/remotes/cloudstudio/main", "HEAD");
    expect(await lecturaDeSync(raiz)).toEqual({ clase: "sync", proyecto: "Tienda", rama: "main", pendientes: 2 });
    rmSync(raiz, { recursive: true, force: true });
  });

  /**
   * Límite DECLARADO de esta cuenta, y es el de `/sync estado` porque es la MISMA: la medida
   * la da git, y git no ve lo que no está en su índice. Un fichero que nadie ha añadido no
   * cuenta hasta que se añada.
   *
   * No es un agujero en la práctica: el turno commitea lo que deja (`commitDeTurno`, con
   * `add -A`), así que lo que escribe el agente entra por ahí — y este test lo dice para que
   * el día que alguien toque `cambiosPendientes` se encuentre con la decisión escrita en vez
   * de con una pestaña que enseña un número distinto del que da el terminal.
   */
  it("un fichero que git no rastrea no entra en la cuenta: la da git, y es la misma que `/sync estado`", async () => {
    const raiz = proyectoDeCloudStudio();
    writeFileSync(join(raiz, "recien-creado.xne"), "<x/>");
    expect((await lecturaDeSync(raiz)).pendientes).toBe(0);
    rmSync(raiz, { recursive: true, force: true });
  });

  /**
   * Un proyecto offline no es un proyecto con cero pendientes: es uno cuya pregunta no tiene
   * respuesta, y la pestaña tiene que poder decir eso en vez de un contador a cero. Por eso
   * el mensaje sale SIN `proyecto` ni `rama` en vez de con cadenas vacías.
   */
  it("un proyecto que no es de CloudStudio sale sin proyecto ni rama, no con un cero", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-sync-off-"));
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
    mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");
    const leido = await lecturaDeSync(raiz);
    expect(leido).toEqual({ clase: "sync" });
    expect(leido.pendientes).toBeUndefined();
    rmSync(raiz, { recursive: true, force: true });
  });

  /**
   * Y cuando la copia existe pero no se puede comparar —no es un repo, o le falta la ref—,
   * se dice con palabras y SIN `pendientes`: un cero ahí sería la cifra inventada de siempre.
   * El motivo no lleva el stderr de git, que trae rutas absolutas del disco.
   */
  it("si no se puede medir, el error va con palabras y sin cifra", async () => {
    const raiz = proyectoDeCloudStudio();
    git(raiz, "update-ref", "-d", "refs/remotes/cloudstudio/main");
    const leido = await lecturaDeSync(raiz);
    expect(leido.proyecto).toBe("Tienda");
    expect(leido.pendientes).toBeUndefined();
    expect(leido.error).toMatch(/no se pudo medir/);
    expect(leido.error).not.toContain(raiz);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("`error` y `pendientes` no viajan juntos: o hay medida o hay motivo", async () => {
    const raiz = proyectoDeCloudStudio();
    writeFileSync(join(raiz, "app.xml"), "<app cambiada/>");
    const leido = await lecturaDeSync(raiz);
    expect(leido.error).toBeUndefined();
    expect(leido.pendientes).toBe(1);
    rmSync(raiz, { recursive: true, force: true });
  });

  /**
   * Un commit SELLADO con el id de una sesión: es lo que hace atribuible su lista. El nombre
   * del trailer sale de `CLAVE_DE_SELLO`, que es la constante que lo LEE — `commitDeTurno` lo
   * escribe desde ahí, y escribirlo a mano en el test dejaría esto verde el día que el
   * formato cambie de verdad.
   */
  function commitSellado(raiz: string, id: string, mensaje: string): void {
    git(raiz, "add", "-A");
    git(raiz, "commit", "-qm", mensaje, "-m", `${CLAVE_DE_SELLO}: ${id}`);
  }

  /** Un commit de nadie: sin sello, o sea de otra sesión, de una tarea de fondo o de antes. */
  function commitAjeno(raiz: string, mensaje: string): void {
    git(raiz, "add", "-A");
    git(raiz, "commit", "-qm", mensaje);
  }

  /**
   * `deLaSesion`: de los pendientes, cuántos tocó ESTA sesión. Existe porque las dos cifras de
   * la pestaña se miden contra referencias distintas —la banda contra la rama de la bajada, la
   * lista de Revisión contra el sello de la sesión— y sin decirlo parecen contradecirse.
   */
  it("dice cuántos de los pendientes tocó esta sesión", async () => {
    const raiz = proyectoDeCloudStudio();
    writeFileSync(join(raiz, "mio.xne"), "<x/>");
    commitSellado(raiz, "s1", "lo mío");
    expect(await lecturaDeSync(raiz, "s1")).toEqual({
      clase: "sync",
      proyecto: "Tienda",
      rama: "main",
      pendientes: 1,
      deLaSesion: 1,
    });
    rmSync(raiz, { recursive: true, force: true });
  });

  it("y separa lo suyo de lo que venía de antes", async () => {
    const raiz = proyectoDeCloudStudio();
    writeFileSync(join(raiz, "mio.xne"), "<x/>");
    commitSellado(raiz, "s1", "lo mío");
    writeFileSync(join(raiz, "ajeno.xne"), "<x/>");
    commitAjeno(raiz, "de otra sesión");
    expect(await lecturaDeSync(raiz, "s1")).toEqual({
      clase: "sync",
      proyecto: "Tienda",
      rama: "main",
      pendientes: 2,
      deLaSesion: 1,
    });
    rmSync(raiz, { recursive: true, force: true });
  });

  /**
   * Y CERO es un hecho medido, no un hueco: la sesión se atribuyó y NINGUNO de los pendientes
   * es suyo. Es la pantalla que motivó esto, medida el 16-09-2026 en el AppDemo: arriba «3
   * ficheros por subir» y debajo una sesión de un solo cambio —borrar un fichero que una tarea
   * de fondo había creado, así que el alta y el borrado se anulaban— que no estaba entre esos 3
   * ni podía estarlo. Aquí lo pendiente es lo ajeno y lo de la sesión ya consta arriba.
   */
  it("cero es un dato, no una ausencia: lo pendiente no es de la sesión", async () => {
    const raiz = proyectoDeCloudStudio();
    writeFileSync(join(raiz, "suyo.xne"), "<x/>");
    commitSellado(raiz, "s1", "lo suyo");
    // Su trabajo ya consta arriba: es lo que hace `marcarSubido` al terminar una subida.
    git(raiz, "update-ref", "refs/remotes/cloudstudio/main", "HEAD");
    // Y después alguien —otra sesión, una tarea de fondo— dejó lo suyo pendiente.
    writeFileSync(join(raiz, "ajeno.xne"), "<x/>");
    commitAjeno(raiz, "de otra sesión");
    expect(await lecturaDeSync(raiz, "s1")).toEqual({
      clase: "sync",
      proyecto: "Tienda",
      rama: "main",
      pendientes: 1,
      deLaSesion: 0,
    });
    rmSync(raiz, { recursive: true, force: true });
  });

  /**
   * Sin sesión abierta no hay a quién atribuir, y el campo NO viaja. Rellenarlo con un cero
   * diría «esta sesión no ha hecho nada» sobre una sesión que no existe.
   */
  it("sin sesión abierta el campo no viaja, y no va un cero", async () => {
    const raiz = proyectoDeCloudStudio();
    writeFileSync(join(raiz, "mio.xne"), "<x/>");
    commitSellado(raiz, "s1", "lo mío");
    const leido = await lecturaDeSync(raiz);
    expect(leido.pendientes).toBe(1);
    expect(leido.deLaSesion).toBeUndefined();
    // `toEqual` no distingue `undefined` de ausente, y aquí la diferencia ES el dato: la
    // clave no está, así que en el cable no hay nada que alguien pueda leer como un cero.
    expect("deLaSesion" in leido).toBe(false);
    rmSync(raiz, { recursive: true, force: true });
  });

  /**
   * **Una sesión SIN sello no se atribuye, aunque su lista «desde que abriste» traiga lo
   * pendiente.** Es la decisión que este dato no puede saltarse: `desde-apertura` es todo lo
   * que cambió desde que te sentaste —de quien sea: otra sesión, una tarea de fondo, una
   * persona—, así que la intersección con lo pendiente saldría, y sería una autoría afirmada
   * sobre quien escribió lo de dentro.
   *
   * El test comprueba las DOS mitades: que la lista existiría (el mutante de tratar
   * `desde-apertura` como atribución daría 1 aquí) y que el dato sale ausente.
   */
  it("una sesión sin sello no atribuye, aunque su lista incluya lo pendiente", async () => {
    const raiz = proyectoDeCloudStudio();
    // La foto de apertura, como la toma `abrirSesionReal`: hay «antes», así que la medida cae
    // en `desde-apertura` en vez de en `sin-marca`.
    const foto = await fotoDeApertura(raiz);
    expect(await foto("s2")).toBe(true);
    writeFileSync(join(raiz, "lo-que-sea.xne"), "<x/>");
    commitAjeno(raiz, "sin sello");
    // Lo que la intersección daría si alguien la usara: la lista SÍ lo trae.
    const { via, ficheros } = await cambiosDeSesion(raiz, "s2");
    expect(via).toBe("desde-apertura");
    expect(ficheros.map((fichero) => fichero.ruta)).toEqual(["lo-que-sea.xne"]);

    const leido = await lecturaDeSync(raiz, "s2");
    expect(leido.pendientes).toBe(1);
    expect(leido.deLaSesion).toBeUndefined();
    rmSync(raiz, { recursive: true, force: true });
  });

  /**
   * Y una sesión de la que no se sabe NADA —sin sello y sin marca de apertura— tampoco
   * atribuye, y ahí lo que importa es lo que NO pasa: la cuenta de pendientes se queda igual.
   * Tirar el mensaje entero convertiría esto en «no se pudo medir lo que falta por subir», que
   * es una pregunta distinta y ya contestada.
   */
  it("de una sesión sin sello ni marca no se atribuye nada, y la cuenta se queda", async () => {
    const raiz = proyectoDeCloudStudio();
    writeFileSync(join(raiz, "mio.xne"), "<x/>");
    commitSellado(raiz, "s1", "lo mío");
    // Sin commits sellados de `s2` y sin ref de apertura, `cambiosDeSesion` declara `sin-marca`:
    // una lista vacía que NO es «no tocaste nada», y que por eso no puede restar del pendiente.
    expect(await cambiosDeSesion(raiz, "s2")).toEqual({ via: "sin-marca", ficheros: [] });
    const leido = await lecturaDeSync(raiz, "s2");
    expect(leido.pendientes).toBe(1);
    expect(leido.deLaSesion).toBeUndefined();
    expect(leido.error).toBeUndefined();
    rmSync(raiz, { recursive: true, force: true });
  });
});

/**
 * El CABLEADO real, no solo sus piezas — lo que `montarRutas` en solitario no puede
 * vigilar. Aquí se compone `construirCorredorDeTareasCableado` (`arranque.ts`) de VERDAD:
 * la misma función que usa `arrancarConsolaWeb`, con un corredor real
 * (`crearCorredorDeTareas` por debajo) y sin reimplementar su cableado en el test — es la
 * MISMA lección que dejó `backendDeAgente` en `agent/grafo/proyecto.ts`: la composición vivía
 * inline en una función que todos sus tests doblan, así que la costura concreta —aquí, que
 * el puente hacia `emitirTareas` quede armado ANTES de que el corredor pueda disparar
 * `alCambiar`— podía dejar de estar montada con el resto en verde.
 *
 * La RECONCILIACIÓN (`corredorDeTareas.ts#arrancarDeVerdad`) es el disparador: aparca TODA
 * tarea que estuviera «en-proceso» al arrancar, sin mirar el pid ni tocar `abrirParaTarea`
 * —no hay ninguna «nueva» que despachar—, así que sirve para probar el puente sin tener
 * que fabricar un `ConsolaDeProyecto` entero.
 */
describe("las tareas en background, el cableado del corredor con el cable — no solo las piezas", () => {
  /** Un vestíbulo que nunca debería necesitar abrir nada: no hay ninguna tarea «nueva». */
  const vestibuloSinAbrir: Parameters<typeof construirCorredorDeTareasCableado>[0]["vestibulo"] = {
    abrirParaTarea: async () => {
      throw new Error("no debería llamarse: la reconciliación no abre consolas");
    },
    proyectosAbiertos: () => [],
    sesionesDe: () => [],
  };

  /**
   * GANA LA PERSONA, y ahora hay más de una consola humana viva: `bloqueados` tiene que
   * nombrar TODAS las raíces abiertas, no solo la que está en foco.
   *
   * Es el fallo ABIERTO de este cambio, y por eso el test va primero: con
   * `proyectoAbierto()` —una sola— una sesión humana que se quedó en segundo plano dejaría
   * de bloquear su proyecto, y una tarea arrancaría a escribir en la misma copia de trabajo
   * en la que alguien está trabajando. No hay aislamiento de ninguna clase entre las dos, y
   * el síntoma no es un error: es un diff corrompido que nadie atribuye.
   *
   * Se mide por el ÚNICO camino observable desde fuera: si la raíz está bloqueada, el
   * corredor no despacha, así que `abrirParaTarea` no se llama.
   */
  it("una consola humana en SEGUNDO PLANO también bloquea su proyecto para las tareas", async () => {
    const aperturas: string[] = [];
    const cola = colaDeMentira([{ ...tareaEnProceso("t1"), estado: "nuevo" }]);
    const { corredor, arrancarConectado } = construirCorredorDeTareasCableado({
      vestibulo: {
        abrirParaTarea: async (raiz) => {
          aperturas.push(raiz);
          throw new Error("no debería llegar aquí: esa raíz la tiene abierta una persona");
        },
        // En FOCO hay otro proyecto —o ninguno—; el de la tarea sigue abierto detrás con su
        // turno corriendo. Es exactamente el caso que este cambio introduce.
        proyectosAbiertos: () =>
          [{ raiz: "/w/AppDemo" }] as unknown as ReturnType<Vestibulo["proyectosAbiertos"]>,
        sesionesDe: () => [],
      },
      tareasFabrica: () => cola,
      informar: () => {},
      olvidarHiloDeSesion: async () => {},
      ...ENTREGA_DE_TAREAS,
    });
    await arrancarConectado({ emitirTareas: () => {} });
    await corredor!.asentar();
    expect(aperturas).toEqual([]);
    await corredor!.parar();
  });

  /**
   * Las dos piezas de la puerta de la ENTREGA, que el corredor exige por tipo. Estos tests
   * son sobre la costura con el CABLE —una reconciliación que llega al SSE—, no sobre la
   * puerta, que tiene su batería en `corredorDeTareas.test.ts`; aquí basta con que estén
   * montadas. `npm test` no le pregunta a ningún modelo: el juez es este doble.
   */
  const ENTREGA_DE_TAREAS = {
    juez: { juzgar: async () => ({ veredicto: "verde" as const, resumen: "bien" }) },
    revisable: async () => ({ revisable: true, escribio: true }),
  };

  const tareaEnProceso = (id: string): Tarea => ({
    id,
    proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
    titulo: "Arregla el login",
    peticion: "Arregla el login",
    encargo: "Arregla el login",
    adjuntos: [],
    estado: "en-proceso",
    creada: "2026-09-08T10:00:00.000Z",
  });

  /**
   * El ÚLTIMO salto de la cadena de los adjuntos: la costura que le da al vestíbulo lo que
   * el corredor calculó. Vivía inline en `arrancarConsolaWeb` —el sitio donde este plan ha
   * perdido cuatro veces una regla con todo en verde—, así que se comprueba aquí, sobre la
   * MISMA función que usa producción: si el tercer argumento se cae, una tarea con adjuntos
   * corre sin `/adjuntos/` montada y ningún test de las piezas se enteraría.
   */
  it("la costura reenvía al vestíbulo la carpeta de adjuntos que el corredor resolvió", async () => {
    const aperturas: (string | undefined)[] = [];
    const cola = colaDeMentira([
      {
        ...tareaEnProceso("t1"),
        estado: "nuevo",
        adjuntos: [{ nombre: "mockup.png", bytes: 10 }],
      },
    ]);
    const { corredor, arrancarConectado } = construirCorredorDeTareasCableado({
      vestibulo: {
        abrirParaTarea: async (_raiz, _sesion, adjuntos) => {
          aperturas.push(adjuntos);
          // No hace falta una consola de verdad: con que la apertura reviente, la tarea se
          // aparca y el test ya tiene lo único que venía a medir — qué se le pasó.
          throw new Error("no hay proyecto de verdad en este test");
        },
        proyectosAbiertos: () => [],
        sesionesDe: () => [],
      },
      tareasFabrica: () => cola,
      informar: () => {},
      olvidarHiloDeSesion: async () => {},
      ...ENTREGA_DE_TAREAS,
    });
    await arrancarConectado({ emitirTareas: () => {} });
    await corredor!.asentar();
    expect(aperturas).toEqual(["/no-usado-en-estos-tests/adjuntos"]);
    await corredor!.parar();
  });

  /**
   * El CUARTO argumento, y es el mismo fallo que el tercero con otro nombre: la costura es
   * una lambda que reenvía a mano, así que un parámetro que no se nombre se cae en silencio
   * —TypeScript no se queja de una función que ignora argumentos— y la sesión de la tarea
   * entra en el índice del proyecto como una conversación más. Sin síntoma: la tarea corre
   * igual, solo que su fila miente para siempre.
   */
  it("la costura reenvía también el ID DE LA TAREA, que es lo que marca su sesión", async () => {
    const tareas: (string | undefined)[] = [];
    const cola = colaDeMentira([{ ...tareaEnProceso("t1"), estado: "nuevo" }]);
    const { corredor, arrancarConectado } = construirCorredorDeTareasCableado({
      vestibulo: {
        abrirParaTarea: async (_raiz, _sesion, _adjuntos, tarea) => {
          tareas.push(tarea);
          throw new Error("no hay proyecto de verdad en este test");
        },
        proyectosAbiertos: () => [],
        sesionesDe: () => [],
      },
      tareasFabrica: () => cola,
      informar: () => {},
      olvidarHiloDeSesion: async () => {},
      ...ENTREGA_DE_TAREAS,
    });
    await arrancarConectado({ emitirTareas: () => {} });
    await corredor!.asentar();
    expect(tareas).toEqual(["t1"]);
    await corredor!.parar();
  });

  /**
   * Y la SIEMBRA: la marca es nueva, así que la primera sesión de tarea de cada proyecto se
   * quedaría pintada como una conversación para siempre. La costura tiene que darle al
   * corredor con qué sembrarla — sin ella no hay ningún síntoma tampoco, solo una fila que
   * miente.
   */
  it("la costura le da al corredor con qué SEMBRAR la marca en las sesiones viejas", async () => {
    // Contra un índice de sesiones DE VERDAD, que es lo único que prueba que la costura usa
    // el escritor real y no una lambda vacía: se monta un proyecto en un temporal, con una
    // sesión sin marcar, y una tarea terminada que la nombra.
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-siembra-"));
    crearSesion(raiz, "s9");
    const cola = colaDeMentira([
      { ...tareaEnProceso("t1"), proyecto: { id: "p1", raiz, nombre: "AppDemo" }, estado: "terminada", sesion: "s9" },
    ]);
    const { corredor, arrancarConectado } = construirCorredorDeTareasCableado({
      vestibulo: vestibuloSinAbrir,
      tareasFabrica: () => cola,
      informar: () => {},
      olvidarHiloDeSesion: async () => {},
      ...ENTREGA_DE_TAREAS,
    });
    await arrancarConectado({ emitirTareas: () => {} });
    await corredor!.asentar();

    expect(listarSesiones(raiz)[0]?.tarea).toBe("t1");
    await corredor!.parar();
    rmSync(raiz, { recursive: true, force: true });
  });

  /**
   * El corredor llega a `montarRutas` ENTERO y no recortado, así que `mirar`/`dejarDeMirar`
   * están montados en producción. Un `Pick` de más en el camino dejaría el botón «Ver lo que
   * hace» sin nada detrás con todos los tests de las piezas en verde — es la misma lección
   * que este `describe` entero recoge.
   */
  it("el cableado real le pasa al cable un corredor que sabe de mirones", () => {
    const cola = colaDeMentira([]);
    const { opcionesDeMontaje } = construirCorredorDeTareasCableado({
      vestibulo: vestibuloSinAbrir,
      tareasFabrica: () => cola,
      informar: () => {},
      olvidarHiloDeSesion: async () => {},
      ...ENTREGA_DE_TAREAS,
    });
    expect(typeof opcionesDeMontaje.corredorDeTareas?.mirar).toBe("function");
    expect(typeof opcionesDeMontaje.corredorDeTareas?.dejarDeMirar).toBe("function");
  });

  it("arrancarConectado conecta el puente ANTES de arrancar: una reconciliación que aparca por su cuenta llega al `emitirTareas` recibido", async () => {
    const cola = colaDeMentira([tareaEnProceso("t1")]);
    const { corredor, arrancarConectado } = construirCorredorDeTareasCableado({
      vestibulo: vestibuloSinAbrir,
      tareasFabrica: () => cola,
      informar: () => {},
      olvidarHiloDeSesion: async () => {},
      ...ENTREGA_DE_TAREAS,
    });
    expect(corredor).toBeDefined();
    let llamado = 0;
    // NADA de cable ni de servidor de por medio: solo lo que `arrancarConsolaWeb` le pasa
    // a `arrancarConectado`, el `{emitirTareas}` que devuelve `montarRutas`.
    await arrancarConectado({ emitirTareas: () => void (llamado += 1) });
    await corredor!.asentar();

    // La escritura ocurrió (la reconciliación aparca SIEMPRE una «en-proceso» huérfana)...
    expect(cola.verTareas()[0]).toMatchObject({ estado: "requiere-atencion" });
    // ...Y el cambio llegó al `emitirTareas` que se le pasó — es lo que demuestra que el
    // puente estaba armado ANTES de que el corredor arrancara, no después.
    expect(llamado).toBeGreaterThan(0);
  });

  /**
   * El tope de concurrencia PERSISTE en `settings.json` (Task 7) y ya no en una variable
   * del cierre — la composición exacta que este describe existe para vigilar: una regla
   * puede dejar de estar montada con todo lo demás en verde. `cargarSettings`/
   * `guardarConcurrenciaDeTareas` leen `homedir()`, así que aquí se apunta `HOME` a un
   * temporal — el mismo recurso que `cli/main.test.ts` documenta para no depender del
   * disco de quien corre la suite.
   */
  describe("el tope de concurrencia persiste en settings.json, no en memoria", () => {
    const homeOriginal = process.env.HOME;

    beforeEach(() => {
      process.env.HOME = mkdtempSync(join(tmpdir(), "xonecode-home-tareas-"));
    });

    afterEach(() => {
      if (homeOriginal === undefined) delete process.env.HOME;
      else process.env.HOME = homeOriginal;
    });

    it("sin nada guardado, la omisión es CONCURRENCIA_POR_OMISION (2)", () => {
      const { opcionesDeMontaje } = construirCorredorDeTareasCableado({
        vestibulo: vestibuloSinAbrir,
        informar: () => {},
        olvidarHiloDeSesion: async () => {},
        ...ENTREGA_DE_TAREAS,
      });
      expect(opcionesDeMontaje.concurrenciaDeTareas?.()).toBe(2);
    });

    it("guardarConcurrencia escribe en disco, y se relee — no queda solo en un cierre", () => {
      const { opcionesDeMontaje } = construirCorredorDeTareasCableado({
        vestibulo: vestibuloSinAbrir,
        informar: () => {},
        olvidarHiloDeSesion: async () => {},
        ...ENTREGA_DE_TAREAS,
      });
      opcionesDeMontaje.guardarConcurrencia?.(5);
      expect(opcionesDeMontaje.concurrenciaDeTareas?.()).toBe(5);
      // Y la prueba de que es de VERDAD disco y no una variable: una instancia SEGUNDA,
      // construida después de escribir, ve el mismo valor sin que nadie se lo pasara.
      const { opcionesDeMontaje: otraVez } = construirCorredorDeTareasCableado({
        vestibulo: vestibuloSinAbrir,
        informar: () => {},
        olvidarHiloDeSesion: async () => {},
        ...ENTREGA_DE_TAREAS,
      });
      expect(otraVez.concurrenciaDeTareas?.()).toBe(5);
    });
  });

  it("si `emitirTareas` revienta, el corredor NO se tumba: la escritura se queda igual, y se avisa por `informar`", async () => {
    const cola = colaDeMentira([tareaEnProceso("t2")]);
    const avisos: string[] = [];
    const { corredor, arrancarConectado } = construirCorredorDeTareasCableado({
      vestibulo: vestibuloSinAbrir,
      tareasFabrica: () => cola,
      informar: (texto) => avisos.push(texto),
      olvidarHiloDeSesion: async () => {},
      ...ENTREGA_DE_TAREAS,
    });

    await expect(
      arrancarConectado({
        emitirTareas: () => {
          throw new Error("sumidero muerto");
        },
      })
    ).resolves.toBeUndefined();
    await corredor!.asentar();

    // La escritura no se pierde por culpa de un sumidero roto...
    expect(cola.verTareas()[0]).toMatchObject({ estado: "requiere-atencion" });
    // ...y el fallo se dice por el canal del PROCESO, nunca lanzado hacia quien llamó.
    expect(avisos.some((a) => a.includes("sumidero muerto"))).toBe(true);
  });

  it("sin `tareasFabrica`, no hay corredor y `arrancarConectado` no revienta", async () => {
    const { corredor, arrancarConectado, opcionesDeMontaje } = construirCorredorDeTareasCableado({
      vestibulo: vestibuloSinAbrir,
      informar: () => {},
      olvidarHiloDeSesion: async () => {},
      ...ENTREGA_DE_TAREAS,
    });
    expect(corredor).toBeUndefined();
    expect(opcionesDeMontaje.colaDeTareas).toBeUndefined();
    expect(opcionesDeMontaje.corredorDeTareas).toBeUndefined();
    await expect(arrancarConectado({ emitirTareas: () => {} })).resolves.toBeUndefined();
  });

  /**
   * Y el camino ENTERO, cable incluido: `construirCorredorDeTareasCableado` +
   * `montarRutas`, con la misma composición que `arrancarConsolaWeb` hace — el mensaje
   * `tareas` que nace de la reconciliación llega de verdad a un cliente SSE, sin que el
   * cliente haya mandado nada.
   */
  it("de punta a punta: la reconciliación del corredor llega al cliente SSE sin que el cliente toque el cable", async () => {
    const cola = colaDeMentira([tareaEnProceso("t3")]);
    const { corredor, opcionesDeMontaje, arrancarConectado } = construirCorredorDeTareasCableado({
      vestibulo: vestibuloSinAbrir,
      tareasFabrica: () => cola,
      informar: () => {},
      olvidarHiloDeSesion: async () => {},
      ...ENTREGA_DE_TAREAS,
    });
    const servidor = servidorDeMentira();
    const cable = montarRutas(servidor, vestibuloDePrueba(), opcionesDeMontaje);
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    // Una SEGUNDA pestaña, conectada ANTES de que el corredor arranque: «el cable habla con
    // TODOS los clientes, no con el último» (`transporte.ts`, el `Set` de sumideros) es
    // justo lo que este `alCambiar` tiene que respetar — nace del corredor, no de una
    // petición de ESTE cliente, así que no hay ninguna razón para que solo le llegue a uno.
    const segundo = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(segundo.peticion, segundo.respuesta);
    await asentar();
    const mensajesDeTareas = (de: typeof cliente) =>
      de.recibidos.filter((m): m is Extract<MensajeAlCliente, { clase: "tareas" }> => m.clase === "tareas");
    // La bienvenida trajo la cola tal cual estaba: «en-proceso», el punto de partida.
    expect(mensajesDeTareas(cliente).at(-1)?.lista[0]?.estado).toBe("en-proceso");
    expect(mensajesDeTareas(segundo).at(-1)?.lista[0]?.estado).toBe("en-proceso");

    // Igual que `arrancarConsolaWeb`: se arranca CONECTADO al cable recién montado.
    await arrancarConectado(cable);
    await corredor!.asentar();

    expect(cola.verTareas()[0]!.estado).toBe("requiere-atencion");
    expect(mensajesDeTareas(cliente).at(-1)?.lista[0]).toMatchObject({ id: "t3", estado: "requiere-atencion" });
    expect(mensajesDeTareas(segundo).at(-1)?.lista[0]).toMatchObject({ id: "t3", estado: "requiere-atencion" });
  });
});

describe("`fuentesDelJuez` — el papel del juez se resuelve con el `config.json` del PROYECTO", () => {
  /**
   * Esta función está extraída porque vivía dentro del cierre de `arrancarConsolaWeb`, que
   * todos sus tests doblan: quitarle la capa de proyecto no ponía ni un test en rojo, medido
   * por mutación. Es la cuarta vez en esta tanda que una composición de producción escondida
   * en un cierre deja una regla sin montar con todo en verde — la misma lección de
   * `backendDeAgente` y de `revisionConGit`.
   *
   * Y lo que la regla protege: en la consola web `FuentesDeEleccion.proyecto` no se rellena
   * nunca, así que sin preguntarle al disco por la raíz de la tarea, un proyecto que apunte
   * `afilado` a otro modelo se ignora EN SILENCIO. Un ajuste escrito que no hace nada es
   * peor que no poder ponerlo, porque quien lo puso se cree servido.
   */
  it("el `afilado` del proyecto llega a las fuentes, y por eso gana al global", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-juez-"));
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    writeFileSync(
      join(raiz, ".xonecode", "config.json"),
      JSON.stringify({ modelos: { afilado: "anthropic/claude-opus-4-5" } })
    );

    expect(fuentesDelJuez(raiz).proyecto?.modelos?.afilado).toBe("anthropic/claude-opus-4-5");
    rmSync(raiz, { recursive: true, force: true });
  });

  it("un proyecto que no dice nada deja `proyecto` AUSENTE, no un objeto vacío", () => {
    // Ausente es «este proyecto no opina» y con eso cuenta la precedencia de
    // `core/modelos.ts`; un objeto vacío sería una capa que existe y no dice nada, que es
    // otra cosa. La misma distinción que `Entorno.proyectos`.
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-juez-vacio-"));
    expect("proyecto" in fuentesDelJuez(raiz)).toBe(false);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("la variable de entorno viaja, porque manda sobre los ficheros", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-juez-env-"));
    const antes = process.env.XONECODE_MODELO;
    process.env.XONECODE_MODELO = "ollama/qwen3";
    try {
      expect(fuentesDelJuez(raiz).entorno?.XONECODE_MODELO).toBe("ollama/qwen3");
    } finally {
      if (antes === undefined) delete process.env.XONECODE_MODELO;
      else process.env.XONECODE_MODELO = antes;
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

describe("`fuentesDeLaConsolaWeb` — el global se RELEE, porque esta misma consola lo escribe", () => {
  /**
   * Extraída por la misma razón que `fuentesDelJuez`: vivía dentro del cierre de
   * `vestibuloReal`, que todos sus tests doblan, así que dejara de releerse lo que dejara de
   * releerse no ponía ni un test en rojo.
   *
   * Y la regla que protege se midió en la pantalla: el proceso arrancó con `gemini` en el
   * `config.json` global, el fichero pasó a `ollama` desde Ajustes, y una sesión NUEVA
   * seguía diciendo `gemini` — mientras Ajustes, que sí relee, enseñaba ya el elegido. Dos
   * lecturas del mismo dato en instantes distintos, y decide la que se quedó atrás.
   */
  it("dos llamadas con el fichero cambiado en medio dan valores distintos", () => {
    const casa = mkdtempSync(join(tmpdir(), "xonecode-fuentes-web-"));
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-fuentes-web-raiz-"));
    const homeOriginal = process.env.HOME;
    try {
      process.env.HOME = casa;
      mkdirSync(join(casa, ".xonecode"), { recursive: true });
      const global = join(casa, ".xonecode", "config.json");
      writeFileSync(global, JSON.stringify({ modelos: { trabajo: "ollama/uno" } }));
      expect(fuentesDeLaConsolaWeb(raiz).global?.modelos?.trabajo).toBe("ollama/uno");

      // Lo que hace Ajustes: reescribe el MISMO fichero y no reinicia nada.
      writeFileSync(global, JSON.stringify({ modelos: { trabajo: "ollama/dos" } }));
      expect(fuentesDeLaConsolaWeb(raiz).global?.modelos?.trabajo).toBe("ollama/dos");
    } finally {
      if (homeOriginal === undefined) delete process.env.HOME;
      else process.env.HOME = homeOriginal;
      rmSync(casa, { recursive: true, force: true });
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("la capa de PROYECTO no se rellena, ni siquiera teniendo uno delante", () => {
    // El vestíbulo sirve muchos proyectos a la vez y aquí no hay uno del que hablar: meter
    // la capa del cwd sería dejar que UN proyecto mandara sobre el modelo de todos. El
    // `cargar` se llama por el cwd solo para llegar al global. Misma distinción que
    // `fuentesDelJuez` con un proyecto que no opina: ausente, no un objeto vacío.
    const casa = mkdtempSync(join(tmpdir(), "xonecode-fuentes-web-casa-"));
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-fuentes-web-proy-"));
    const homeOriginal = process.env.HOME;
    try {
      process.env.HOME = casa;
      mkdirSync(join(raiz, ".xonecode"), { recursive: true });
      writeFileSync(
        join(raiz, ".xonecode", "config.json"),
        JSON.stringify({ modelos: { trabajo: "ollama/del-proyecto" } })
      );

      const fuentes = fuentesDeLaConsolaWeb(raiz);
      expect("proyecto" in fuentes).toBe(false);
    } finally {
      if (homeOriginal === undefined) delete process.env.HOME;
      else process.env.HOME = homeOriginal;
      rmSync(casa, { recursive: true, force: true });
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

/**
 * **Ver en vivo lo que hace una tarea** (Task 16).
 *
 * Los actos de un turno de tarea ya se guardaban en el transcript de su sesión —medido:
 * `consolaParaTarea` le pasa la piel de su propia consola de proyecto— y ya NO se filtraban
 * al chat de nadie, porque el transporte de una consola de tarea no tiene sumideros
 * enganchados. Lo que faltaba era exactamente el enganche, y es lo que estos tests fijan.
 *
 * Las tres decisiones del diseño, y dónde se ven aquí:
 *  1. **Opt-in**: nada de esto pasa hasta que llega un `{clase:"mirar", ver:true}`. No se
 *     muda el cable ni se abre ningún proyecto.
 *  2. **Solo lectura**: por este camino no entra NADA hacia el turno. El mensaje `mirar` se
 *     ataja antes del `recibir` de la consola, y hay aserto.
 *  3. **La vista en vivo y el transcript son lo MISMO**: lo que viaja son los actos de esa
 *     consola, no un registro paralelo.
 */
describe("mirar en vivo lo que hace una tarea — el cable", () => {
  /** Un corredor de mentira con `mirar`/`dejarDeMirar`, y una tarea en vuelo. */
  function corredorConMirones(actosIniciales: Acto[] = []) {
    const mirones = new Map<string, Set<Sumidero>>();
    return {
      mirones,
      /** El turno de esa tarea pinta un acto: le llega a quien la esté mirando. */
      pintar: (tarea: string, mensaje: MensajeAlCliente) => {
        for (const m of mirones.get(tarea) ?? []) m(mensaje);
      },
      corredor: {
        corriendoAqui: () => true,
        cortar: async () => true,
        mirar: (id: string, enviar: Sumidero) => {
          if (id !== "t1") return undefined;
          const suyos = mirones.get(id) ?? new Set<Sumidero>();
          suyos.add(enviar);
          mirones.set(id, suyos);
          return actosIniciales;
        },
        dejarDeMirar: (id: string, enviar: Sumidero) => void mirones.get(id)?.delete(enviar),
      },
    };
  }

  function montarConCorredor(actosIniciales: Acto[] = []) {
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba();
    const c = corredorConMirones(actosIniciales);
    montarRutas(servidor, vestibulo, { corredorDeTareas: c.corredor });
    return {
      ...c,
      vestibulo,
      eventos: servidor.rutas.get("GET /eventos")!,
      accion: servidor.rutas.get("POST /accion")!,
    };
  }

  it("«ver» trae el transcript de la tarea, etiquetado, y SOLO al cliente que lo pidió", async () => {
    const actos: Acto[] = [
      { tipo: "usuario", texto: "arregla el login" },
      { tipo: "razonamiento", texto: "mirando app.xne" },
    ];
    const m = montarConCorredor(actos);
    const mira = clienteDeMentira("c1");
    const otra = clienteDeMentira("c2");
    m.eventos(mira.peticion, mira.respuesta);
    m.eventos(otra.peticion, otra.respuesta);
    await asentar();
    mira.recibidos.length = 0;
    otra.recibidos.length = 0;

    await enviarMensaje(m.accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c1" });
    expect(mira.recibidos).toEqual([{ clase: "mirada", tarea: "t1", via: "todos", actos }]);
    // La pestaña de al lado está trabajando en otra cosa: los actos de una tarea de fondo no
    // pueden aparecer en su chat. Es el aserto que hay que conservar.
    expect(otra.recibidos).toEqual([]);
  });

  it("lo que el turno pinta después llega en vivo, con `alta` y `sustitucion`", async () => {
    const m = montarConCorredor();
    const mira = clienteDeMentira("c1");
    m.eventos(mira.peticion, mira.respuesta);
    await asentar();
    await enviarMensaje(m.accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c1" });
    mira.recibidos.length = 0;

    m.pintar("t1", { clase: "acto", acto: { tipo: "herramientas", lineas: ["→ lee"], detalles: [{ nombre: "read_file" }] } });
    m.pintar("t1", { clase: "sustitucion", acto: { tipo: "herramientas", lineas: ["→ lee ×3"], detalles: [{ nombre: "read_file" }] } });
    m.pintar("t1", { clase: "reemision", actos: [{ tipo: "asistente", texto: "listo" }] });
    expect(mira.recibidos).toEqual([
      {
        clase: "mirada",
        tarea: "t1",
        via: "alta",
        actos: [{ tipo: "herramientas", lineas: ["→ lee"], detalles: [{ nombre: "read_file" }] }],
      },
      {
        clase: "mirada",
        tarea: "t1",
        via: "sustitucion",
        actos: [{ tipo: "herramientas", lineas: ["→ lee ×3"], detalles: [{ nombre: "read_file" }] }],
      },
      { clase: "mirada", tarea: "t1", via: "todos", actos: [{ tipo: "asistente", texto: "listo" }] },
    ]);
  });

  it("mirar no abre ningún proyecto ni mueve el cable de nadie", async () => {
    const m = montarConCorredor();
    const mira = clienteDeMentira("c1");
    m.eventos(mira.peticion, mira.respuesta);
    await asentar();
    expect(m.vestibulo.proyectoAbierto()).toBeUndefined();
    await enviarMensaje(m.accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c1" });
    // La razón de ser de `abrirParaTarea` («no le cambies la pantalla a quien trabaja») no
    // la puede deshacer esta pantalla.
    expect(m.vestibulo.proyectoAbierto()).toBeUndefined();
  });

  it("el mensaje `mirar` NO llega a la consola: por aquí no entra nada hacia el turno", async () => {
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba();
    const c = corredorConMirones();
    const recibidos: MensajeDelCliente[] = [];
    // La consola del vestíbulo es el destino del cable mientras no hay proyecto abierto:
    // si `mirar` cayera en el `recibir` de abajo, `correrConsola` podría acabar corriendo
    // un turno de verdad sobre esa consola — y con un mirón enganchado su `eof()` diría
    // que hay alguien a quien preguntar. Fail-closed: el mensaje se ataja antes.
    const original = vestibulo.consola.recibir.bind(vestibulo.consola);
    vestibulo.consola.recibir = (mensaje) => {
      recibidos.push(mensaje);
      original(mensaje);
    };
    montarRutas(servidor, vestibulo, { corredorDeTareas: c.corredor });
    const mira = clienteDeMentira("c1");
    servidor.rutas.get("GET /eventos")!(mira.peticion, mira.respuesta);
    await asentar();
    await enviarMensaje(servidor.rutas.get("POST /accion")!, { clase: "mirar", tarea: "t1", ver: true, cliente: "c1" });
    await enviarMensaje(servidor.rutas.get("POST /accion")!, { clase: "mirar", tarea: "t1", ver: false, cliente: "c1" });
    expect(recibidos).toEqual([]);
  });

  it("dos personas pueden mirar la misma tarea, y dejar de mirar corta solo la suya", async () => {
    const m = montarConCorredor();
    const una = clienteDeMentira("c1");
    const otra = clienteDeMentira("c2");
    m.eventos(una.peticion, una.respuesta);
    m.eventos(otra.peticion, otra.respuesta);
    await asentar();
    await enviarMensaje(m.accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c1" });
    await enviarMensaje(m.accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c2" });
    una.recibidos.length = 0;
    otra.recibidos.length = 0;

    m.pintar("t1", { clase: "acto", acto: { tipo: "asistente", texto: "voy" } });
    expect(una.recibidos).toHaveLength(1);
    expect(otra.recibidos).toHaveLength(1);

    await enviarMensaje(m.accion, { clase: "mirar", tarea: "t1", ver: false, cliente: "c1" });
    m.pintar("t1", { clase: "acto", acto: { tipo: "asistente", texto: "listo" } });
    // Que una cierre la vista no puede dejar muda a la otra.
    expect(una.recibidos).toHaveLength(1);
    expect(otra.recibidos).toHaveLength(2);
  });

  it("cerrar la pestaña desengancha sus miradas, y no las de la otra", async () => {
    const m = montarConCorredor();
    const una = clienteDeMentira("c1");
    const otra = clienteDeMentira("c2");
    m.eventos(una.peticion, una.respuesta);
    m.eventos(otra.peticion, otra.respuesta);
    await asentar();
    await enviarMensaje(m.accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c1" });
    await enviarMensaje(m.accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c2" });
    expect(m.mirones.get("t1")!.size).toBe(2);
    // Sin esto, un sumidero de una pestaña cerrada se queda enganchado al turno para
    // siempre: escribiría en un socket que ya no está.
    una.cerrar();
    expect(m.mirones.get("t1")!.size).toBe(1);
    otra.recibidos.length = 0;
    m.pintar("t1", { clase: "acto", acto: { tipo: "asistente", texto: "listo" } });
    expect(otra.recibidos).toHaveLength(1);
  });

  it("una tarea que no corre aquí no emite nada: no se finge un transcript vacío", async () => {
    const m = montarConCorredor();
    const mira = clienteDeMentira("c1");
    m.eventos(mira.peticion, mira.respuesta);
    await asentar();
    mira.recibidos.length = 0;
    await enviarMensaje(m.accion, { clase: "mirar", tarea: "otra", ver: true, cliente: "c1" });
    // `{via:"todos", actos:[]}` diría «corre y no ha hecho nada», que es otra cosa. Lo que
    // esa tarea SÍ es —terminada, o de otro proceso— ya lo dice el mensaje de la cola.
    expect(mira.recibidos).toEqual([]);
  });

  it("un `cliente` desconocido no engancha nada y no lanza", async () => {
    const m = montarConCorredor();
    const mira = clienteDeMentira("c1");
    m.eventos(mira.peticion, mira.respuesta);
    await asentar();
    mira.recibidos.length = 0;
    expect(await enviarMensaje(m.accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "fantasma" })).toBe(204);
    expect(m.mirones.get("t1") ?? new Set()).toHaveLength(0);
    expect(mira.recibidos).toEqual([]);
  });

  it("mirar dos veces la misma tarea no duplica el enganche ni reemite dos veces", async () => {
    const m = montarConCorredor([{ tipo: "usuario", texto: "x" }]);
    const mira = clienteDeMentira("c1");
    m.eventos(mira.peticion, mira.respuesta);
    await asentar();
    await enviarMensaje(m.accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c1" });
    mira.recibidos.length = 0;
    // Idempotente: un doble clic, o un efecto de React que se dispare dos veces, no puede
    // dejar dos sumideros del mismo cliente enganchados al mismo turno.
    await enviarMensaje(m.accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c1" });
    expect(mira.recibidos).toEqual([]);
    m.pintar("t1", { clase: "acto", acto: { tipo: "asistente", texto: "listo" } });
    expect(mira.recibidos).toHaveLength(1);
  });

  it("ninguna ruta de la máquina viaja en esos mensajes", async () => {
    // El acto de una tool lleva ruta RELATIVA por construcción (`agent/turno/resumenDeTool.ts`),
    // y el mensaje que envuelve no añade ninguna: ni la raíz del proyecto, ni la carpeta de
    // la sesión, ni el fichero del checkpointer. El cable puede ir por un túnel.
    const m = montarConCorredor([{ tipo: "usuario", texto: "arregla el login" }]);
    const mira = clienteDeMentira("c1");
    m.eventos(mira.peticion, mira.respuesta);
    await asentar();
    await enviarMensaje(m.accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c1" });
    m.pintar("t1", { clase: "acto", acto: { tipo: "herramientas", lineas: ["← edita app.xne"], detalles: [{ nombre: "edit_file" }] } });
    const texto = JSON.stringify(mira.recibidos);
    for (const sospechosa of ["/w/", "/Users/", ".xonecode", "/tmp/", "C:\\"]) {
      expect(texto).not.toContain(sospechosa);
    }
  });
});

/**
 * **Una reconexión que reclama el mismo id desengancha lo que la conexión vieja miraba.**
 *
 * F2 de la revisión, y la carrera es la que el propio `close` documenta: una pestaña
 * recargada puede cerrar su SSE DESPUÉS de que su reconexión haya reclamado el id, y el
 * `close` viejo se salta la limpieza por la guarda de `enviar === sumidero` — que está bien
 * puesta, porque si no se llevaría por delante las miradas del recién llegado. La
 * consecuencia era que los envoltorios de la conexión vieja se quedaban en el `mirones` del
 * transporte de la tarea hasta que su consola cerrara, escribiendo en un socket que ya no
 * está (el `try/catch` del sumidero se lo traga, así que ni se veía). Se limpia al RECLAMAR
 * el id, que es el único momento en que se sabe con certeza que la conexión anterior murió.
 */
describe("mirar: la reconexión no deja envoltorios huérfanos", () => {
  it("reclamar el mismo id de cliente desengancha las miradas de la conexión anterior", async () => {
    const servidor = servidorDeMentira();
    const mirones = new Map<string, Set<Sumidero>>();
    montarRutas(servidor, vestibuloDePrueba(), {
      corredorDeTareas: {
        corriendoAqui: () => true,
        cortar: async () => true,
        mirar: (id: string, enviar: Sumidero) => {
          const suyos = mirones.get(id) ?? new Set<Sumidero>();
          suyos.add(enviar);
          mirones.set(id, suyos);
          return [];
        },
        dejarDeMirar: (id: string, enviar: Sumidero) => void mirones.get(id)?.delete(enviar),
      },
    });
    const eventos = servidor.rutas.get("GET /eventos")!;
    const accion = servidor.rutas.get("POST /accion")!;

    const vieja = clienteDeMentira("c1");
    eventos(vieja.peticion, vieja.respuesta);
    // Y OTRA persona mirando la misma tarea desde otra pestaña: lo que se limpia es lo del
    // id que se reclama y no «todo», o una recarga dejaría muda a la de al lado.
    const ajena = clienteDeMentira("c2");
    eventos(ajena.peticion, ajena.respuesta);
    await asentar();
    await enviarMensaje(accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c1" });
    await enviarMensaje(accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c2" });
    expect(mirones.get("t1")!.size).toBe(2);

    // La pestaña se recarga: el SSE nuevo llega ANTES de que el `close` de la vieja se
    // dispare, que es el orden que la guarda del `close` existe para sobrevivir.
    const nueva = clienteDeMentira("c1");
    eventos(nueva.peticion, nueva.respuesta);
    await asentar();
    // Solo se fue el de «c1»: el de «c2» sigue enganchado.
    expect(mirones.get("t1")!.size).toBe(1);

    // Y el `close` tardío de la vieja no puede llevarse por delante lo del recién llegado.
    await enviarMensaje(accion, { clase: "mirar", tarea: "t1", ver: true, cliente: "c1" });
    expect(mirones.get("t1")!.size).toBe(2);
    vieja.cerrar();
    expect(mirones.get("t1")!.size).toBe(2);
  });
});

/**
 * **Abrir la sesión de una tarea en curso se DECLINA por el cable, y con el motivo delante.**
 *
 * Task 16, y el arreglo de la duda que la vista en vivo hizo visible: el título de una
 * tarjeta «en proceso» manda `{clase:"sesion", proyecto, sesion}`, y eso ponía dos consolas
 * sobre el mismo `thread_id` del checkpointer. La guarda vive en el vestíbulo
 * (`MOTIVO_SESION_DE_TAREA_EN_CURSO`) porque es quien sabe qué consolas de tarea están vivas;
 * lo que se comprueba aquí es que el cable no se lo come: el motivo llega y NADA se mueve.
 */
describe("abrir la sesión de una tarea en curso, por el cable", () => {
  it("dice el motivo y no muda el cable: el transcript de quien mira no cambia", async () => {
    const servidor = servidorDeMentira();
    const dichos: string[] = [];
    let aperturas = 0;
    const motivo = "esa conversación es la de una tarea en curso: pulsa «Ver lo que hace»";
    // Con copia local DE VERDAD: `atenderSesion` usa `esProyectoEnDisco` del módulo (no un
    // predicado inyectado), y sin la carpeta se iría por la rama de «todavía no está bajado»
    // — el test se quedaría verde sin haber llamado a `abrirProyecto` ni una vez.
    const base = mkdtempSync(join(tmpdir(), "xonecode-abrir-tarea-"));
    mkdirSync(join(base, ".xonecode"), { recursive: true });
    writeFileSync(join(base, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
    mkdirSync(join(base, ".xonecode", "cloudstudio"), { recursive: true });
    writeFileSync(join(base, ".xonecode", "cloudstudio", "sync.json"), "{}");
    montarRutas(
      servidor,
      {
        ...vestibuloDePrueba(),
        raizDeProyecto: () => base,
        abrirProyecto: async () => {
          aperturas += 1;
          throw new Error(motivo);
        },
      },
      { informar: (texto) => dichos.push(texto) }
    );
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();

    expect(
      await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, {
        clase: "sesion",
        proyecto: "p1",
        sesion: "s1",
      })
    ).toBe(204);
    await asentar();

    // Se intentó UNA vez y se negó ahí: la guarda es del vestíbulo, no de este manejador.
    expect(aperturas).toBe(1);
    // El motivo se DICE, por los dos canales que este camino ya usa: el transcript y el
    // alta —que es lo que la barra pinta sin tener que leer el transcript—.
    expect(dichos).toContain(motivo);
    const altas = cliente.recibidos.filter((m) => m.clase === "alta");
    expect((altas.at(-1) as { aviso?: string }).aviso).toBe(motivo);
    // Y el cable sigue donde estaba: sin proyecto abierto, el alta lo dice.
    expect((altas.at(-1) as { proyectoAbierto?: boolean }).proyectoAbierto).toBe(false);
    rmSync(base, { recursive: true, force: true });
  });
});

/**
 * El commit de cada turno, cableado. Está extraído y probado por la lección que este repo ya
 * ha pagado TRES veces en `abrirParaTarea`: una lambda escrita a mano dentro de un cierre
 * que todos los tests doblan se deja un argumento y TypeScript no dice nada, porque una
 * función que ignora parámetros es asignable. Aquí el argumento que se puede caer es el que
 * sostiene la atribución entera de la pestaña Revisión: sin `sesion` el commit sale sin
 * sello y la pestaña se cae al respaldo «desde-apertura» para siempre, sin un solo síntoma.
 */
describe("el ajuste del workspace, cableado", () => {
  it("lo que se ENSEÑA es la ruta ENTERA, no un «~»", () => {
    // Se probó abreviada, para que el caso normal no llevara el nombre de la cuenta del
    // sistema, y no se sostiene: la cabecera de esta misma consola ya saluda por ese nombre.
    // Y a cambio dejaba en pantalla una ruta que no se puede comprobar de un vistazo, que es
    // justo para lo que ese campo existe.
    const { workspace } = ajusteDeWorkspaceCableado({
      casa: "/Users/ana",
      leer: () => "/Users/ana/xone-proyectos",
    });
    expect(workspace()).toBe("/Users/ana/xone-proyectos");
  });

  it("sin nada guardado se enseña la omisión, no un hueco", () => {
    // Un campo en blanco se leería como «no hay ninguno puesto», y sí lo hay.
    const { workspace } = ajusteDeWorkspaceCableado({ casa: "/Users/ana", leer: () => undefined });
    expect(workspace()).toMatch(/workspace$/);
  });

  it("se RELEE en cada emisión: lo que se acaba de guardar es lo que se vuelve a enseñar", () => {
    let enDisco: string | undefined;
    const { workspace, guardarWorkspace } = ajusteDeWorkspaceCableado({
      casa: "/Users/ana",
      leer: () => enDisco,
      guardar: (r) => void (enDisco = r),
    });
    // Y el «~» se sigue aceptando al TECLEAR, que es comodidad de entrada y otra cosa.
    guardarWorkspace("~/xone-proyectos");
    expect(workspace()).toBe("/Users/ana/xone-proyectos");
  });

  it("lo que se GUARDA es la ruta absoluta, nunca el «~»", () => {
    // Un `settings.json` con un `~` dentro sería una ruta que solo significa algo para
    // quien la escribió: la casa cambia de máquina a máquina y de usuario a usuario.
    const guardadas: string[] = [];
    const { guardarWorkspace } = ajusteDeWorkspaceCableado({
      casa: "/Users/ana",
      guardar: (r) => void guardadas.push(r),
    });
    guardarWorkspace("~/xone-proyectos");
    expect(guardadas).toEqual(["/Users/ana/xone-proyectos"]);
  });

  it("y la regla se aplica en el SERVIDOR: una ruta que no vale NO llega al disco", () => {
    // La pantalla lleva su copia declarada para poder explicar el no, pero una pantalla
    // solo esconde un botón.
    const guardadas: string[] = [];
    const { guardarWorkspace } = ajusteDeWorkspaceCableado({
      casa: "/Users/ana",
      guardar: (r) => void guardadas.push(r),
    });
    guardarWorkspace("proyectos");
    guardarWorkspace("   ");
    guardarWorkspace("~otra/cosa");
    expect(guardadas).toEqual([]);
  });
});

describe("la mudanza del reparto viejo, cableada", () => {
  /** Lo que se mira es lo que LLEGA a la mudanza, no que la mudanza funcione: eso ya lo
   *  fija `mudanzaEnDisco.test.ts`. Aquí se puede caer la cuenta de las dos bases. */
  it("con el workspace sin configurar, la base VIEJA es `~/.xonecode` y la de ahora le cuelga", () => {
    const vistas: Record<string, unknown>[] = [];
    mudarWorkspaceLegadoCableado({
      settings: { entornos: [{ id: "webstudio", nombre: "W", url: "https://x/mcp" }] },
      escribir: () => {},
      mudar: (o) => {
        vistas.push({ ...o });
        return { mudadas: 0, chocadas: 0 };
      },
    });
    expect(vistas).toHaveLength(1);
    const vista = vistas[0] as { legado: string; workspace: string; entornos: readonly string[] };
    // La de ahora CUELGA de la vieja: es la mudanza entera en una frase. Si las dos
    // salieran iguales no se encontraría nada y no se diría nada.
    expect(vista.workspace).toBe(join(vista.legado, "workspace"));
    expect(vista.entornos).toEqual(["webstudio"]);
  });

  it("con el workspace configurado, las DOS bases son ese mismo valor", () => {
    // El reparto viejo metía su `workspace/` en medio fuera cual fuera la base, así que
    // quien la había elegido también tiene el nivel de más — y ahí las dos bases coinciden.
    const vistas: Record<string, unknown>[] = [];
    mudarWorkspaceLegadoCableado({
      settings: { entornos: [], workspace: "/u/xone-proyectos" },
      escribir: () => {},
      mudar: (o) => {
        vistas.push({ ...o });
        return { mudadas: 0, chocadas: 0 };
      },
    });
    expect(vistas[0]).toMatchObject({ legado: "/u/xone-proyectos", workspace: "/u/xone-proyectos" });
  });

  it("lo que se cuenta va al TERMINAL, que es el `escribir` que se le pasa", () => {
    const dichos: string[] = [];
    mudarWorkspaceLegadoCableado({
      settings: { entornos: [] },
      escribir: (t) => void dichos.push(t),
      mudar: (o) => {
        o.escribir("una copia mudada\n");
        return { mudadas: 1, chocadas: 0 };
      },
    });
    expect(dichos).toEqual(["una copia mudada\n"]);
  });
});

describe("el commit del turno, cableado", () => {
  it("reenvía la raíz, el mensaje Y LA SESIÓN: el sello sale de ese tercer argumento", async () => {
    const vistos: unknown[][] = [];
    const commitear = commitDeTurnoCableado({
      base: () => "/w",
      commitear: async (...args) => {
        vistos.push(args);
        return { via: "commit" };
      },
    });
    expect(await commitear("/w/entorno/AppDemo", "xonecode: Hola", "s-1")).toBeUndefined();
    expect(vistos).toEqual([["/w/entorno/AppDemo", "xonecode: Hola", "s-1"]]);
  });

  it("fuera del workspace no commitea NADA: ahí el historial es de una persona", async () => {
    let llamado = false;
    const commitear = commitDeTurnoCableado({
      base: () => "/w",
      commitear: async () => {
        llamado = true;
        return { via: "commit" };
      },
    });
    expect(await commitear("/Users/alguien/su-proyecto", "xonecode: Hola", "s-1")).toBeUndefined();
    expect(llamado).toBe(false);
  });

  it("solo el FALLO se dice; no haber nada que commitear no es un aviso", async () => {
    const conVia = async (via: string, motivo?: string): Promise<string | undefined> =>
      commitDeTurnoCableado({
        base: () => "/w",
        commitear: async () => ({ via, ...(motivo === undefined ? {} : { motivo }) }),
      })("/w/e/A", "m", "s");
    expect(await conVia("sin-cambios")).toBeUndefined();
    expect(await conVia("sin-git")).toBeUndefined();
    expect(await conVia("commit")).toBeUndefined();
    expect(await conVia("fallo", "hook rechazado")).toBe("no se pudo commitear el turno: hook rechazado");
  });
});

/**
 * El recorrido por el cable: el veredicto («¿se puede lanzar?»), la intención (lanzar,
 * cancelar) y las fases del lanzamiento.
 *
 * Todo con dobles de las cuatro cosas caras —el framework en el dispositivo, la existencia de
 * un fichero del proyecto, el lanzador y el lector—, que es lo que deja esto sin adb, sin
 * red y sin disco del usuario. Y con el cable de verdad: los mensajes se afirman tal y como
 * salen por el SSE, no sobre el valor que devolvió una función.
 */
describe("el recorrido por el cable — el veredicto, la intención y las fases", () => {
  const APP_INI = "name=AppDemo\n";
  /** El `app.xml` del caso medido: declara una ruta del proyecto que puede faltar. */
  const APP_XML = '<?xml version="1.0"?>\n<app><connection name="main" connstring="bd/gestion.db" /></app>\n';

  const PIXEL = {
    id: "ABC",
    nombre: "Pixel 8",
    plataforma: "android" as const,
    clase: "fisico" as const,
    estado: "conectado" as const,
  };

  type Opciones = Parameters<typeof montarRutas>[2];

  /**
   * El andamio: un proyecto de VERDAD en un temporal (con sus descriptores), abierto desde el
   * cable, un dispositivo medido y elegido por la sesión, y un cliente SSE enganchado.
   *
   * `conBase` decide el caso entero: `bd/gestion.db` es el fichero que declara el `app.xml`, y
   * sin él el veredicto bloquea — que es el caso medido que motivó todo esto.
   */
  const montar = async (montaje: {
    opciones?: Opciones;
    /** Ausente = el proyecto no tiene `app.xml`. */
    xml?: string;
    ini?: string;
    /** Crea `bd/gestion.db`, el fichero que declara la conexión. */
    conBase?: boolean;
    /** El dispositivo guardado por la sesión. Ausente = el de la medida; `null` = ninguno. */
    elegido?: {
      id: string;
      nombre: string;
      plataforma: "android" | "ios";
      clase: "emulador" | "simulador" | "fisico";
    } | null;
  } = {}) => {
    const base = mkdtempSync(join(tmpdir(), "xonecode-lanzar-"));
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => base });
    const raiz = vestibulo.raizDeProyecto("webstudio", "Tienda");
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    // Una copia BAJADA lleva el `sync.json` de su descarga (`esProyectoEnDisco`).
    mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");
    if (montaje.xml !== undefined) writeFileSync(join(raiz, "app.xml"), montaje.xml);
    writeFileSync(join(raiz, "app.ini"), montaje.ini ?? APP_INI);
    if (montaje.conBase === true) {
      mkdirSync(join(raiz, "bd"), { recursive: true });
      writeFileSync(join(raiz, "bd", "gestion.db"), "");
    }

    montarRutas(servidor, vestibulo, {
      // El lector REAL sobre el temporal, con su barrera de rutas y su regla de las vistas
      // aplanadas, y la misma existencia que compone el cableado. Doblar aquí el lector
      // probaría el veredicto contra un doble y no contra el proyecto de verdad.
      leerFichero: leerFicheroDeProyecto,
      existeEnProyecto: (suRaiz, ruta) =>
        motivoDeRutaInaceptable(ruta) !== undefined || existsSync(join(suRaiz, ruta)),
      detectarDispositivos: async () => ({
        sistema: "mac" as const,
        herramientas: [],
        dispositivos: [PIXEL],
        avds: [],
        recetas: [],
        medido: "2026-09-16T10:00:00.000Z",
      }),
      ...montaje.opciones,
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
    // La medida: es la ÚNICA forma de que haya informe — no hay sondeo.
    await enviarMensaje(accion, { clase: "dispositivos" });
    await asentar();

    // La elección de la sesión: por omisión la del dispositivo medido —el camino del
    // cliente—, y `null` deja la sesión SIN ninguno elegido.
    const abierta = vestibulo.proyectoAbierto()!;
    if (montaje.elegido === null) abierta.elegirDispositivo(undefined);
    else if (montaje.elegido !== undefined) abierta.elegirDispositivo(montaje.elegido);
    else await enviarMensaje(accion, { clase: "dispositivo", id: PIXEL.id });
    await asentar();
    cliente.recibidos.length = 0;

    return {
      base,
      servidor,
      vestibulo,
      accion,
      cliente,
      raiz,
      cerrar: async () => {
        await vestibulo.cerrar();
        rmSync(base, { recursive: true, force: true });
      },
    };
  };

  /**
   * Los mensajes del recorrido que llegaron, ya ESTECHADOS a su clase.
   *
   * Genérica a propósito: con `clase: "lanzable" | "lanzamiento"` el `Extract` de abajo se queda
   * con la UNIÓN de las dos —`{clase: "lanzable" | "lanzamiento"}` encaja en las dos— y entonces
   * ni `faltas` ni `estado` existen para `tsc`: el helper parecería estrechar y no estrecharía
   * nada, que es el mismo error que un `as` que no comprueba.
   */
  const dichos = <C extends "lanzable" | "lanzamiento">(
    cliente: ReturnType<typeof clienteDeMentira>,
    clase: C,
  ) => cliente.recibidos.filter((m) => m.clase === clase) as Extract<MensajeAlCliente, { clase: C }>[];

  /**
   * Deja correr lo que el cable lanzó suelto hasta que se cumpla `listo`, con tope de vueltas.
   *
   * Hace falta porque medir un veredicto NO es un tick: lee `app.xml` y `app.ini` del disco de
   * verdad, así que resolverlos cuesta varios turnos del bucle de eventos. Un `asentar()` de un
   * tick dejaba pasar solo las carreras fáciles y el test salía verde o rojo según lo que
   * tardara el disco — que es la peor clase de verde.
   */
  const esperarA = async (listo: () => boolean, vueltas = 200): Promise<void> => {
    for (let i = 0; i < vueltas && !listo(); i++) await new Promise((r) => setTimeout(r, 0));
  };

  it("sin nada que mida el framework, el veredicto dice «no se sabe» y NO promete el botón", async () => {
    // Sin `frameworkEnDispositivo` esta ejecución no sabe si el framework está: la causa es
    // `framework-no-medido`, cuya frase NO se arregla instalando nada.
    const m = await montar({ xml: APP_XML, conBase: true });
    expect(await enviarMensaje(m.accion, { clase: "revisarLanzamiento" })).toBe(204);
    await esperarA(() => dichos(m.cliente, "lanzable").length > 0);

    const lanzable = dichos(m.cliente, "lanzable").at(-1)!;
    expect(lanzable).toMatchObject({ clase: "lanzable", proyecto: "Tienda", listo: false, app: "AppDemo" });
    expect(lanzable.dispositivo).toEqual({ id: "ABC", nombre: "Pixel 8", plataforma: "android", clase: "fisico" });
    expect(lanzable.medido).toBe("2026-09-16T10:00:00.000Z");
    expect(lanzable.faltas).toHaveLength(1);
    expect(lanzable.faltas[0]).toMatch(/no se ha mirado si «Pixel 8» tiene el framework/);
    // Ni una ruta de la máquina por el cable.
    expect(JSON.stringify(m.cliente.recibidos)).not.toContain(m.raiz);
    await m.cerrar();
  });

  it("con el framework medido y la base en su sitio, el veredicto sale LISTO", async () => {
    const m = await montar({
      xml: APP_XML,
      conBase: true,
      opciones: { frameworkEnDispositivo: async () => ({ instalado: true }) },
    });
    await enviarMensaje(m.accion, { clase: "revisarLanzamiento" });
    await esperarA(() => dichos(m.cliente, "lanzable").length > 0);
    expect(dichos(m.cliente, "lanzable").at(-1)).toMatchObject({ listo: true, faltas: [], app: "AppDemo" });
    await m.cerrar();
  });

  /**
   * El caso MEDIDO, y la razón de ser de la frase larga: el `app.xml` declara `bd/gestion.db`,
   * el fichero no está, y el framework contesta `{"result":true}` igual — la app muere detrás
   * en un diálogo «Error opening database». Lo que esta pestaña tiene que decir es QUÉ falta.
   */
  it("la conexión declarada que no está bloquea, y se dice de DÓNDE sale ese fichero", async () => {
    const m = await montar({
      xml: APP_XML,
      opciones: { frameworkEnDispositivo: async () => ({ instalado: true }) },
    });
    await enviarMensaje(m.accion, { clase: "revisarLanzamiento" });
    await esperarA(() => dichos(m.cliente, "lanzable").length > 0);
    const lanzable = dichos(m.cliente, "lanzable").at(-1)!;
    expect(lanzable.listo).toBe(false);
    expect(lanzable.faltas).toHaveLength(1);
    expect(lanzable.faltas[0]).toContain("«bd/gestion.db»");
    expect(lanzable.faltas[0]).toContain("XOne Studio");
    await m.cerrar();
  });

  it("sin `app.xml` lo dice, y con `app.xml` ilegible dice OTRA cosa: no se arreglan en el mismo sitio", async () => {
    const sin = await montar({ opciones: { frameworkEnDispositivo: async () => ({ instalado: true }) } });
    await enviarMensaje(sin.accion, { clase: "revisarLanzamiento" });
    await esperarA(() => dichos(sin.cliente, "lanzable").length > 0);
    expect(dichos(sin.cliente, "lanzable").at(-1)!.faltas[0]).toContain("no tiene app.xml");
    await sin.cerrar();

    // Sin con qué comprobarlo, la existencia NO se afirma que no: el veredicto se queda con el
    // motivo del lector, que es la verdad medida, en vez de inventarse un «no está».
    const roto = await montar({
      xml: APP_XML,
      conBase: true,
      opciones: {
        frameworkEnDispositivo: async () => ({ instalado: true }),
        leerFichero: async (_raiz, ruta) => ({
          ruta,
          recortado: false,
          binario: false,
          bytes: 0,
          error: "no se pudo leer el fichero",
        }),
      },
    });
    await enviarMensaje(roto.accion, { clase: "revisarLanzamiento" });
    await esperarA(() => dichos(roto.cliente, "lanzable").length > 0);
    expect(dichos(roto.cliente, "lanzable").at(-1)!.faltas[0]).toContain("No se pudo leer app.xml");
    await roto.cerrar();
  });

  /**
   * La costura que hace que `dispositivo-desconocido` tenga EMISOR. Las dos situaciones —«no
   * has elegido ninguno» y «elegiste uno que ya no está»— llegan al veredicto con el
   * dispositivo ausente, y lo único que las separa es el `elegido`, que lo sabe la SESIÓN.
   * Sin este cruce, la segunda se contaría como la primera: decirle a alguien que no eligió
   * cuando sí eligió.
   */
  it("no es lo mismo no haber elegido que haber elegido uno que ya no está", async () => {
    const ninguno = await montar({ xml: APP_XML, conBase: true, elegido: null });
    await enviarMensaje(ninguno.accion, { clase: "revisarLanzamiento" });
    await esperarA(() => dichos(ninguno.cliente, "lanzable").length > 0);
    const sinNinguno = dichos(ninguno.cliente, "lanzable").at(-1)!;
    expect(sinNinguno.dispositivo).toBeUndefined();
    expect(sinNinguno.faltas).toEqual([expect.stringContaining("no tiene ningún dispositivo elegido")]);
    await ninguno.cerrar();

    // El caso que la rama `dispositivo` del cable tolera en silencio —una foto vieja del
    // cliente, porque desenchufaron el aparato entre medias— y que aquí se CUENTA, porque es
    // justo lo que decide la frase que se le enseña a quien va a pulsar.
    const ido = await montar({
      xml: APP_XML,
      conBase: true,
      opciones: { frameworkEnDispositivo: async () => ({ instalado: true }) },
      elegido: { id: "YA-NO-ESTA", nombre: "Pixel 6", plataforma: "android", clase: "fisico" },
    });
    await enviarMensaje(ido.accion, { clase: "revisarLanzamiento" });
    await esperarA(() => dichos(ido.cliente, "lanzable").length > 0);
    expect(dichos(ido.cliente, "lanzable").at(-1)!.faltas).toEqual([
      expect.stringContaining("ya no aparece en la última medida"),
    ]);
    await ido.cerrar();
  });

  it("sin proyecto abierto no se contesta NADA: no hay proyecto que nombrar", async () => {
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba();
    montarRutas(servidor, vestibulo, {
      frameworkEnDispositivo: async () => ({ instalado: true }),
      lanzarEnDispositivo: () => {
        throw new Error("no debería llegar aquí");
      },
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    cliente.recibidos.length = 0;
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    expect(await enviarMensaje(accion, { clase: "revisarLanzamiento" })).toBe(204);
    expect(await enviarMensaje(accion, { clase: "lanzarApp" })).toBe(204);
    await asentar();
    expect(cliente.recibidos).toEqual([]);
    await vestibulo.cerrar();
  });

  /**
   * La revalidación de antes de empezar: entre el veredicto y el clic puede pasar cualquier
   * cosa —desenchufar el teléfono, mover el fichero de la conexión, cerrar el proyecto—, así
   * que lo que se lanza es lo que se acaba de medir. Y el aserto que importa no es el mensaje
   * sino que el lanzador **no se llama**: un `fallo` con un lanzamiento detrás sería lo peor
   * de los dos mundos.
   */
  it("un «Ejecutar» sobre un proyecto que ya no cumple contesta `fallo` y NO llama al lanzador", async () => {
    let llamadas = 0;
    const m = await montar({
      xml: APP_XML,
      // Y el fichero de la conexión no está: dejó de cumplir después del veredicto.
      opciones: {
        frameworkEnDispositivo: async () => ({ instalado: true }),
        lanzarEnDispositivo: () => {
          llamadas++;
          return { cancelar: () => {}, terminado: new Promise(() => {}) };
        },
      },
    });
    await enviarMensaje(m.accion, { clase: "lanzarApp" });
    await esperarA(() => dichos(m.cliente, "lanzamiento").length > 0);

    const lanzamiento = dichos(m.cliente, "lanzamiento").at(-1)!;
    expect(lanzamiento).toMatchObject({
      clase: "lanzamiento",
      proyecto: "Tienda",
      fase: "comprobando",
      estado: "fallo",
      ms: 0,
      lineas: [],
    });
    expect(lanzamiento.motivo).toContain("«bd/gestion.db»");
    expect(llamadas).toBe(0);
    await m.cerrar();
  });

  it("sin `lanzarEnDispositivo`, el recorrido lo dice en vez de quedarse en silencio", async () => {
    const m = await montar({
      xml: APP_XML,
      conBase: true,
      opciones: { frameworkEnDispositivo: async () => ({ instalado: true }) },
    });
    await enviarMensaje(m.accion, { clase: "lanzarApp" });
    await esperarA(() => dichos(m.cliente, "lanzamiento").length > 0);
    const lanzamiento = dichos(m.cliente, "lanzamiento").at(-1)!;
    expect(lanzamiento.estado).toBe("fallo");
    expect(lanzamiento.motivo).toBeTypeOf("string");
    await m.cerrar();
  });

  /** El camino bueno: las seis fases dichas, y el desenlace al final. */
  it("un lanzamiento bueno dice `corriendo` en las SEIS fases y cierra en `ok`", async () => {
    let pedido: PeticionDeLanzamiento | undefined;
    const m = await montar({
      xml: APP_XML,
      conBase: true,
      opciones: {
        frameworkEnDispositivo: async () => ({ instalado: true }),
        lanzarEnDispositivo: (peticion, deps) => {
          pedido = peticion;
          for (const fase of FASES_DE_LANZAMIENTO) deps.alFase?.(fase, `línea de ${fase}`);
          return {
            cancelar: () => {},
            terminado: Promise.resolve({ estado: "ok", fase: "comprobando-arranque", ms: 1234 }),
          };
        },
      },
    });
    await enviarMensaje(m.accion, { clase: "lanzarApp" });
    await esperarA(() => dichos(m.cliente, "lanzamiento").at(-1)?.estado === "ok");

    // Al lanzador le llega la MEDIDA, no una preferencia del cliente: el aparato medido, la
    // raíz del proyecto abierto y el nombre que dice su `app.ini`.
    expect(pedido).toEqual({ dispositivo: PIXEL, raiz: m.raiz, app: "AppDemo" });

    const suyos = dichos(m.cliente, "lanzamiento");
    // El PRIMERO ya es `corriendo` con fase `comprobando`: el recorrido empieza ahí, así que la
    // primera `alFase("comprobando", …)` no cambia nada y no gasta un mensaje en repetirlo. Las
    // cinco que cambian sí se emiten —la fase que cambia SIEMPRE se emite: son seis en todo el
    // recorrido, no un flujo— y el último es el desenlace, que es el único que dice `ok`.
    expect(suyos.map((x) => x.estado)).toEqual(["corriendo", "corriendo", "corriendo", "corriendo", "corriendo", "corriendo", "ok"]);
    const vistas = suyos.map((x) => x.fase).filter((f, i, todas) => todas.indexOf(f) === i);
    expect(vistas).toEqual([...FASES_DE_LANZAMIENTO]);
    // `ms` es el reloj del CABLE y no el del resultado de la máquina (1234): lo que la pestaña
    // enseña es cuánto lleva el recorrido que ella está viendo, y ese empezó en el `corriendo`.
    expect(suyos.at(-1)).toMatchObject({ estado: "ok", fase: "comprobando-arranque" });
    expect(suyos.at(-1)!.ms).toBeTypeOf("number");
    expect(suyos[0]).toMatchObject({
      proyecto: "Tienda",
      dispositivo: { id: "ABC", nombre: "Pixel 8", plataforma: "android", clase: "fisico" },
    });
    await m.cerrar();
  });

  it("las líneas del recorrido van como COLA: una subida suelta decenas y no caben todas", async () => {
    const m = await montar({
      xml: APP_XML,
      conBase: true,
      opciones: {
        frameworkEnDispositivo: async () => ({ instalado: true }),
        lanzarEnDispositivo: (_peticion, deps) => {
          for (let i = 0; i < 40; i++) deps.alFase?.("subiendo", `línea ${i}`);
          return { cancelar: () => {}, terminado: Promise.resolve({ estado: "ok", fase: "subiendo", ms: 10 }) };
        },
      },
    });
    await enviarMensaje(m.accion, { clase: "lanzarApp" });
    await esperarA(() => dichos(m.cliente, "lanzamiento").at(-1)?.estado === "ok");
    const ultimo = dichos(m.cliente, "lanzamiento").at(-1)!;
    expect(ultimo.lineas.length).toBeLessThanOrEqual(LINEAS_DE_LOG);
    expect(ultimo.lineas.at(-1)).toBe("línea 39");
    await m.cerrar();
  });

  it("un fallo lleva su motivo; uno que revienta CIERRA el recorrido en vez de dejarlo colgado", async () => {
    const fallo = await montar({
      xml: APP_XML,
      conBase: true,
      opciones: {
        frameworkEnDispositivo: async () => ({ instalado: true }),
        lanzarEnDispositivo: () => ({
          cancelar: () => {},
          terminado: Promise.resolve({ estado: "fallo", fase: "subiendo", motivo: "el ZIP pasa de 512 MiB", ms: 900 }),
        }),
      },
    });
    await enviarMensaje(fallo.accion, { clase: "lanzarApp" });
    await esperarA(() => dichos(fallo.cliente, "lanzamiento").at(-1)?.estado === "fallo");
    expect(dichos(fallo.cliente, "lanzamiento").at(-1)).toMatchObject({
      estado: "fallo",
      motivo: "el ZIP pasa de 512 MiB",
    });
    await fallo.cerrar();

    // El contrato del lanzador es no lanzar nunca, y puede romperse en los dos sitios: al
    // CONSTRUIR el trabajo —antes del primer `await`— y al terminar. Los dos tienen que cerrar
    // el recorrido, o la pestaña se queda en `corriendo` para siempre con el botón muerto.
    const reventado = await montar({
      xml: APP_XML,
      conBase: true,
      opciones: {
        frameworkEnDispositivo: async () => ({ instalado: true }),
        lanzarEnDispositivo: () => {
          throw Object.assign(new Error("EACCES: permission denied, open '/Users/alguien/x'"), { code: "EACCES" });
        },
      },
    });
    await enviarMensaje(reventado.accion, { clase: "lanzarApp" });
    await esperarA(() => dichos(reventado.cliente, "lanzamiento").at(-1)?.estado === "fallo");
    expect(dichos(reventado.cliente, "lanzamiento").at(-1)!.estado).toBe("fallo");
    // De un error de Node solo el `code`: su mensaje lleva la ruta absoluta, y esto puede ir
    // por un túnel.
    expect(dichos(reventado.cliente, "lanzamiento").at(-1)!.motivo).toBe("EACCES");
    expect(JSON.stringify(reventado.cliente.recibidos)).not.toContain("/Users/alguien");
    await reventado.cerrar();
  });

  it("cancelar llama al `cancelar` del trabajo en curso, y sin ninguno no inventa nada", async () => {
    let cancelados = 0;
    let soltar: ((r: { estado: "cancelada"; fase: "subiendo"; ms: number }) => void) | undefined;
    const m = await montar({
      xml: APP_XML,
      conBase: true,
      opciones: {
        frameworkEnDispositivo: async () => ({ instalado: true }),
        lanzarEnDispositivo: () => ({
          cancelar: () => {
            cancelados++;
            soltar?.({ estado: "cancelada", fase: "subiendo", ms: 12 });
          },
          terminado: new Promise((r) => {
            soltar = r;
          }),
        }),
      },
    });
    expect(await enviarMensaje(m.accion, { clase: "cancelarLanzamiento" })).toBe(204);
    await asentar();
    expect(cancelados).toBe(0);
    expect(dichos(m.cliente, "lanzamiento")).toEqual([]);

    await enviarMensaje(m.accion, { clase: "lanzarApp" });
    await esperarA(() => dichos(m.cliente, "lanzamiento").length > 0);
    await enviarMensaje(m.accion, { clase: "cancelarLanzamiento" });
    await esperarA(() => dichos(m.cliente, "lanzamiento").at(-1)?.estado === "cancelada");
    expect(cancelados).toBe(1);

    // Y el recorrido queda CERRADO: un segundo «Cancelar» no encuentra nada que cancelar.
    m.cliente.recibidos.length = 0;
    await enviarMensaje(m.accion, { clase: "cancelarLanzamiento" });
    await asentar();
    expect(cancelados).toBe(1);
    expect(dichos(m.cliente, "lanzamiento")).toEqual([]);
    await m.cerrar();
  });

  /**
   * Uno a la vez para toda la máquina, y no es prudencia: dos lanzamientos al mismo aparato se
   * pisarían en el MISMO directorio del dispositivo, y el ZIP de la subida no limpia el
   * destino —lo que quede de uno se lanzaría como parte del otro—. Un segundo «Ejecutar»
   * reenvía el estado en curso, que es lo que la otra pestaña necesita para pintarlo.
   */
  it("un segundo «Ejecutar» mientras corre no lanza otro: reenvía el estado que ya va", async () => {
    let llamadas = 0;
    const m = await montar({
      xml: APP_XML,
      conBase: true,
      opciones: {
        frameworkEnDispositivo: async () => ({ instalado: true }),
        lanzarEnDispositivo: () => {
          llamadas++;
          return { cancelar: () => {}, terminado: new Promise(() => {}) };
        },
      },
    });
    await enviarMensaje(m.accion, { clase: "lanzarApp" });
    await esperarA(() => llamadas === 1);
    m.cliente.recibidos.length = 0;
    await enviarMensaje(m.accion, { clase: "lanzarApp" });
    await esperarA(() => dichos(m.cliente, "lanzamiento").length > 0);
    expect(llamadas).toBe(1);
    expect(dichos(m.cliente, "lanzamiento").map((x) => x.estado)).toEqual(["corriendo"]);
    await m.cerrar();
  });

  it("lo que no se nombra no sale: ningún mensaje del recorrido lleva una ruta de la máquina", async () => {
    const m = await montar({
      xml: APP_XML,
      conBase: true,
      opciones: {
        frameworkEnDispositivo: async () => ({ instalado: true }),
        lanzarEnDispositivo: (_peticion, deps) => {
          deps.alFase?.("empaquetando", "empaquetado el proyecto");
          return { cancelar: () => {}, terminado: Promise.resolve({ estado: "ok", fase: "empaquetando", ms: 5 }) };
        },
      },
    });
    await enviarMensaje(m.accion, { clase: "revisarLanzamiento" });
    await enviarMensaje(m.accion, { clase: "lanzarApp" });
    await esperarA(() => dichos(m.cliente, "lanzamiento").at(-1)?.estado === "ok");
    expect(dichos(m.cliente, "lanzable").length).toBeGreaterThan(0);
    expect(JSON.stringify(m.cliente.recibidos)).not.toContain(m.raiz);
    await m.cerrar();
  });
});

/**
 * Las dos listas del cable, atadas a las de la máquina. El cable NO importa los tipos de
 * `agent/` a propósito —quien pinta las fases es el cliente, y una fase que la máquina añada
 * sin que nadie decida cómo se enseña no puede entrar por aquí sin más—, así que la
 * comprobación de que las dos no divergan es este test y no el compilador.
 *
 * Las dos mitades muerden en las dos direcciones: el `Record` obliga a que TODO miembro del
 * tipo de la máquina esté nombrado —uno nuevo no compila hasta que alguien mire qué se hace
 * con él— y la igualdad de abajo ata esa lista a la del cable, así que un valor que se añada a
 * un lado y no al otro sale rojo con nombre y apellidos.
 */
describe("las fases y los estados del cable, atados a los de la máquina", () => {
  it("las seis fases son las mismas, y en el mismo orden", () => {
    const fasesDeLaMaquina: Record<FaseDeLanzamiento, true> = {
      comprobando: true,
      empaquetando: true,
      subiendo: true,
      reiniciando: true,
      lanzando: true,
      "comprobando-arranque": true,
    };
    expect([...FASES_DEL_LANZAMIENTO]).toEqual([...FASES_DE_LANZAMIENTO]);
    expect([...FASES_DE_LANZAMIENTO]).toEqual(Object.keys(fasesDeLaMaquina));
  });

  it("los cinco estados del cable son los cuatro desenlaces de la máquina más «corriendo»", () => {
    // `corriendo` existe en el cable y NO en la máquina, y no es un descuido: allí el estado es
    // un DESENLACE —el resultado de un trabajo que ya terminó— y aquí hay además un recorrido
    // en vivo que hay que poder pintar. Sin él, la pestaña no sabría que ha empezado hasta la
    // primera fase, y con un lanzamiento que se queda mudo, hasta nunca.
    const desenlacesDeLaMaquina: Record<EstadoDeLanzamiento, true> = {
      ok: true,
      fallo: true,
      cancelada: true,
      colgada: true,
    };
    expect([...ESTADOS_DEL_LANZAMIENTO]).toEqual(["corriendo", ...Object.keys(desenlacesDeLaMaquina)]);
  });
});

/**
 * El cable de las skills.
 *
 * Lo que se mide aquí es lo que NO se puede medir en `agent/grafo/skills.ts`: que el
 * servidor es quien corta lo que no se puede hacer sobre una de serie, y que la lista viaja
 * con lo que la ventana necesita y sin lo que no —el cuerpo de una de serie, que son decenas
 * de miles de caracteres por la ráfaga de bienvenida—.
 */
describe("montarRutas — las skills por el cable", () => {
  let casa: string;
  let previo: string | undefined;

  beforeEach(() => {
    casa = mkdtempSync(join(tmpdir(), "xonecode-cable-skills-"));
    previo = process.env["HOME"];
    process.env["HOME"] = casa;
  });
  afterEach(() => {
    if (previo === undefined) delete process.env["HOME"];
    else process.env["HOME"] = previo;
    rmSync(casa, { recursive: true, force: true });
  });

  /** `undefined` si esta plataforma no respeta `HOME`: ahí el test no puede afirmar nada. */
  const carpeta = (): string | undefined =>
    rutaGlobalDeSkills().startsWith(casa) ? rutaGlobalDeSkills() : undefined;

  const conectar = async (): Promise<{
    accion: ManejadorRuta;
    cliente: ReturnType<typeof clienteDeMentira>;
    dichos: string[];
  }> => {
    const dichos: string[] = [];
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { informar: (t) => dichos.push(t) });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    return { accion: servidor.rutas.get(`POST ${RUTA_ACCION}`)!, cliente, dichos };
  };

  const ultimoDeSkills = (cliente: ReturnType<typeof clienteDeMentira>) =>
    [...cliente.recibidos].reverse().find((m) => m.clase === "skills") as
      | Extract<MensajeAlCliente, { clase: "skills" }>
      | undefined;

  it("las de serie viajan SIN cuerpo, y las tuyas CON él", async () => {
    // El cuerpo de las nueve de serie en la ráfaga de bienvenida son cientos de kilobytes
    // para rellenar un formulario que nadie puede guardar. El suyo se pide a mano.
    const dir = carpeta();
    if (dir === undefined) return;
    mkdirSync(join(dir, "mia"), { recursive: true });
    writeFileSync(join(dir, "mia", "SKILL.md"), "---\nname: mia\ndescription: la mía\n---\n\nCUERPO\n");

    const { cliente } = await conectar();
    const mensaje = ultimoDeSkills(cliente)!;
    expect(mensaje.skills.find((s) => s.nombre === "archify")?.cuerpo).toBeUndefined();
    // Con su salto final: el cuerpo viaja TAL CUAL está en el fichero. Recortarlo aquí
    // dejaría que guardar desde la ventana le quitara al `.md` un byte que nadie tocó.
    expect(mensaje.skills.find((s) => s.nombre === "mia")?.cuerpo).toBe("CUERPO\n");
    // Y el origen viaja: es lo que separa las dos pestañas y lo que decide si hay papelera.
    expect(mensaje.skills.find((s) => s.nombre === "archify")?.origen).toBe("serie");
    expect(mensaje.skills.find((s) => s.nombre === "mia")?.origen).toBe("global");
  });

  it("`cuerpoDeSkill` da el de una de serie, que es lo que deja verla y copiarla", async () => {
    const { accion, cliente } = await conectar();
    await enviarMensaje(accion, { clase: "cuerpoDeSkill", nombre: "archify" });
    await asentar();

    const respuesta = [...cliente.recibidos].reverse().find((m) => m.clase === "cuerpoDeSkill") as
      | Extract<MensajeAlCliente, { clase: "cuerpoDeSkill" }>
      | undefined;
    expect(respuesta?.nombre).toBe("archify");
    expect(respuesta?.cuerpo ?? "").toContain("Archify");
  });

  it("y una que no está contesta con motivo, no con un cuerpo vacío", async () => {
    // Un cuerpo vacío se leería como que la skill no dice nada, y copiarla daría una copia
    // vacía. Esto es lo que deja decir «no se pudo leer» en la ficha.
    const { accion, cliente } = await conectar();
    await enviarMensaje(accion, { clase: "cuerpoDeSkill", nombre: "no-existe" });
    await asentar();

    const respuesta = [...cliente.recibidos].reverse().find((m) => m.clase === "cuerpoDeSkill") as
      | Extract<MensajeAlCliente, { clase: "cuerpoDeSkill" }>
      | undefined;
    expect(respuesta?.cuerpo).toBeUndefined();
    expect(respuesta?.error).toBeDefined();
  });

  it("guardar escribe la carpeta y reemite la lista", async () => {
    const dir = carpeta();
    if (dir === undefined) return;
    const { accion, cliente, dichos } = await conectar();

    await enviarMensaje(accion, {
      clase: "skill",
      accion: "guardar",
      ambito: "global",
      skill: { nombre: "mia", descripcion: "la mía", origen: "global", tokens: 0, ficheros: [], cuerpo: "HAZ ESTO" },
    });
    await asentar();

    expect(readFileSync(join(dir, "mia", "SKILL.md"), "utf8")).toContain("HAZ ESTO");
    expect(dichos.join("\n")).toMatch(/guardada/);
    expect(ultimoDeSkills(cliente)!.skills.map((s) => s.nombre)).toContain("mia");
  });

  it("un nombre que NO es un slug se rechaza, y se ofrece el que sí valdría", async () => {
    // Se comprueba al GUARDAR y no al cargar: rechazar al cargar haría desaparecer una skill
    // que funciona, y guardar es el único momento con alguien delante para arreglarlo.
    const dir = carpeta();
    if (dir === undefined) return;
    const { accion, dichos } = await conectar();

    await enviarMensaje(accion, {
      clase: "skill",
      accion: "guardar",
      ambito: "global",
      skill: { nombre: "Mi Skill", descripcion: "d", origen: "global", tokens: 0, ficheros: [], cuerpo: "x" },
    });
    await asentar();

    expect(existsSync(join(dir, "Mi Skill"))).toBe(false);
    expect(dichos.join("\n")).toMatch(/mi-skill/);
  });

  it("sin descripción tampoco: el modelo no sabría cuándo cargarla", async () => {
    const dir = carpeta();
    if (dir === undefined) return;
    const { accion, dichos } = await conectar();

    await enviarMensaje(accion, {
      clase: "skill",
      accion: "guardar",
      ambito: "global",
      skill: { nombre: "mia", descripcion: "   ", origen: "global", tokens: 0, ficheros: [], cuerpo: "x" },
    });
    await asentar();

    expect(existsSync(join(dir, "mia"))).toBe(false);
    expect(dichos.join("\n")).toMatch(/descripción/);
  });

  it("el nombre de una de SERIE se rechaza, y el rechazo dice el camino", async () => {
    // La guarda vive en el SERVIDOR y no solo en el cliente, que se limita a no ofrecer el
    // botón: este mensaje lo puede mandar cualquiera que hable por el cable. Y el rechazo
    // DICE la alternativa, porque el usuario quería algo y sigue queriéndolo.
    const dir = carpeta();
    if (dir === undefined) return;
    const { accion, dichos } = await conectar();

    await enviarMensaje(accion, {
      clase: "skill",
      accion: "guardar",
      ambito: "global",
      skill: { nombre: "archify", descripcion: "la mía", origen: "global", tokens: 0, ficheros: [], cuerpo: "x" },
    });
    await asentar();

    expect(existsSync(join(dir, "archify"))).toBe(false);
    expect(dichos.join("\n")).toMatch(/cópiala/);
  });

  it("y BORRAR una de serie también, con su motivo", async () => {
    const { accion, dichos } = await conectar();
    await enviarMensaje(accion, {
      clase: "skill",
      accion: "borrar",
      ambito: "global",
      skill: { nombre: "archify", descripcion: "", origen: "serie", tokens: 0, ficheros: [] },
    });
    await asentar();
    expect(dichos.join("\n")).toMatch(/no se borra/);
  });

  it("una tuya sí se borra: la guarda es para las de serie, no para todas", async () => {
    const dir = carpeta();
    if (dir === undefined) return;
    const { accion, dichos } = await conectar();
    mkdirSync(join(dir, "mia"), { recursive: true });
    writeFileSync(join(dir, "mia", "SKILL.md"), "---\nname: mia\ndescription: d\n---\n\nx\n");

    await enviarMensaje(accion, {
      clase: "skill",
      accion: "borrar",
      ambito: "global",
      skill: { nombre: "mia", descripcion: "", origen: "global", tokens: 0, ficheros: [] },
    });
    await asentar();

    expect(existsSync(join(dir, "mia"))).toBe(false);
    expect(dichos.join("\n")).toMatch(/borrada/);
  });

  it("guardar en el PROYECTO sin proyecto abierto se dice, no se escribe en cualquier sitio", async () => {
    const { accion, dichos } = await conectar();
    await enviarMensaje(accion, {
      clase: "skill",
      accion: "guardar",
      ambito: "proyecto",
      skill: { nombre: "mia", descripcion: "d", origen: "proyecto", tokens: 0, ficheros: [], cuerpo: "x" },
    });
    await asentar();
    expect(dichos.join("\n")).toMatch(/no hay ningún proyecto abierto/);
  });
});

/**
 * El caso que la guarda por NOMBRE se llevaba por delante: una skill del usuario que se
 * llama como una de serie.
 *
 * Taparla es la forma de afinar una nuestra sin editarla donde el `npm install` la pisaría,
 * así que tiene que poder deshacerse. Con la guarda mirando el catálogo del PAQUETE en vez
 * de la carpeta del usuario, esa carpeta no se podía borrar nunca — y el mensaje decía que
 * era nuestra, que encima es falso.
 */
describe("montarRutas — una skill del usuario que TAPA a una de serie", () => {
  let casa: string;
  let previo: string | undefined;

  beforeEach(() => {
    casa = mkdtempSync(join(tmpdir(), "xonecode-cable-skills-tapa-"));
    previo = process.env["HOME"];
    process.env["HOME"] = casa;
  });
  afterEach(() => {
    if (previo === undefined) delete process.env["HOME"];
    else process.env["HOME"] = previo;
    rmSync(casa, { recursive: true, force: true });
  });

  it("sí se borra, y lo que se niega es borrar la NUESTRA", async () => {
    if (!rutaGlobalDeSkills().startsWith(casa)) return;
    const dir = rutaGlobalDeSkills();
    mkdirSync(join(dir, "archify"), { recursive: true });
    writeFileSync(join(dir, "archify", "SKILL.md"), "---\nname: archify\ndescription: la mía\n---\n\nx\n");

    const dichos: string[] = [];
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { informar: (t) => dichos.push(t) });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;

    await enviarMensaje(accion, {
      clase: "skill",
      accion: "borrar",
      ambito: "global",
      skill: { nombre: "archify", descripcion: "", origen: "global", tokens: 0, ficheros: [] },
    });
    await asentar();

    // La carpeta del usuario se fue…
    expect(existsSync(join(dir, "archify"))).toBe(false);
    expect(dichos.join("\n")).toMatch(/borrada/);
    // …y la de serie sigue en el catálogo, que es lo que hace que borrar la copia sea seguro.
    const ultimo = [...cliente.recibidos].reverse().find((m) => m.clase === "skills") as
      | Extract<MensajeAlCliente, { clase: "skills" }>
      | undefined;
    expect(ultimo!.skills.find((s) => s.nombre === "archify")?.origen).toBe("serie");
  });
});

/**
 * `POST /skill` — instalar una skill desde un `.zip`.
 *
 * Lo que se mide aquí es lo que no se puede medir en `core/zipDeSkill.ts` ni en
 * `agent/grafo/skills.ts`: que la ruta existe, que contesta con el motivo del módulo en vez
 * de con un número pelado, y que un rechazo NO deja nada escrito.
 */
describe("montarRutas — instalar una skill desde un .zip", () => {
  let casa: string;
  let previo: string | undefined;

  beforeEach(() => {
    casa = mkdtempSync(join(tmpdir(), "xonecode-zip-skill-"));
    previo = process.env["HOME"];
    process.env["HOME"] = casa;
  });
  afterEach(() => {
    if (previo === undefined) delete process.env["HOME"];
    else process.env["HOME"] = previo;
    rmSync(casa, { recursive: true, force: true });
  });

  const SKILL_MD = "---\nname: mia\ndescription: la mía\n---\n\nCUERPO\n";

  const subir = async (
    zip: Uint8Array,
    nombre: string
  ): Promise<{ codigo: number; cuerpo: string; dichos: string[] }> => {
    const dichos: string[] = [];
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { informar: (t) => dichos.push(t) });
    const manejador = servidor.rutas.get(`POST ${RUTA_SKILL}`)!;
    const cliente = clienteDeMentira();
    // El cuerpo son BYTES: el lector crudo del servidor consume el flujo de la petición.
    const peticion = Readable.from([Buffer.from(zip)]) as unknown as IncomingMessage;
    (peticion as unknown as { url: string }).url = `${RUTA_SKILL}?nombre=${encodeURIComponent(nombre)}&ambito=global`;
    let codigo = 0;
    let cuerpo = "";
    const respuesta = {
      writeHead: (c: number) => {
        codigo = c;
      },
      end: (t?: string) => {
        cuerpo = t ?? "";
      },
    } as unknown as typeof cliente.respuesta;
    await manejador(peticion, respuesta);
    return { codigo, cuerpo, dichos };
  };

  it("instala, lo dice y deja la skill en disco", async () => {
    if (!rutaGlobalDeSkills().startsWith(casa)) return;
    const zip = zipSync({ "mi-skill/SKILL.md": strToU8(SKILL_MD) });
    const { codigo, dichos } = await subir(zip, "descarga(2).zip");

    expect(codigo).toBe(204);
    expect(existsSync(join(rutaGlobalDeSkills(), "mi-skill", "SKILL.md"))).toBe(true);
    expect(dichos.join("\n")).toMatch(/instalada/);
  });

  it("un zip slip se rechaza con el MOTIVO, y no escribe NADA", async () => {
    if (!rutaGlobalDeSkills().startsWith(casa)) return;
    const zip = zipSync({
      "mi-skill/SKILL.md": strToU8(SKILL_MD),
      "../fuera.md": strToU8("pwn"),
    });
    const { codigo, cuerpo } = await subir(zip, "x.zip");

    // 422 y no 400: el zip llegó entero y se entendió — lo que no vale es lo que trae.
    expect(codigo).toBe(422);
    expect(cuerpo).toMatch(/se sale/);
    // Y el motivo NO lleva el nombre de la entrada, que lo eligió quien empaquetó el zip.
    expect(cuerpo).not.toContain("fuera.md");
    expect(existsSync(join(rutaGlobalDeSkills(), "mi-skill"))).toBe(false);
    expect(existsSync(join(casa, "fuera.md"))).toBe(false);
  });

  it("algo que no es un zip se dice con palabras, no con un número pelado", async () => {
    const { codigo, cuerpo } = await subir(strToU8("esto no es un zip"), "x.zip");
    expect(codigo).toBe(422);
    expect(cuerpo).toMatch(/zip/);
  });

  it("sin `nombre` no se instala: de él sale el de respaldo", async () => {
    const dichos: string[] = [];
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), { informar: (t) => dichos.push(t) });
    const peticion = Readable.from([Buffer.from(strToU8("x"))]) as unknown as IncomingMessage;
    (peticion as unknown as { url: string }).url = `${RUTA_SKILL}?ambito=global`;
    let codigo = 0;
    await servidor.rutas.get(`POST ${RUTA_SKILL}`)!(peticion, {
      writeHead: (c: number) => {
        codigo = c;
      },
      end: () => {},
    } as never);
    expect(codigo).toBe(400);
  });

  it("el ámbito «proyecto» sin proyecto abierto se dice, no se escribe en cualquier sitio", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba());
    const peticion = Readable.from([Buffer.from(strToU8("x"))]) as unknown as IncomingMessage;
    (peticion as unknown as { url: string }).url = `${RUTA_SKILL}?nombre=x.zip&ambito=proyecto`;
    let codigo = 0;
    let cuerpo = "";
    await servidor.rutas.get(`POST ${RUTA_SKILL}`)!(peticion, {
      writeHead: (c: number) => {
        codigo = c;
      },
      end: (t?: string) => {
        cuerpo = t ?? "";
      },
    } as never);
    expect(codigo).toBe(409);
    expect(cuerpo).toMatch(/proyecto/);
  });
});


/**
 * Quitar un entorno por el cable. La negativa se decide en el SERVIDOR y viaja en la propia
 * respuesta (409 con su motivo), porque `informar` no llega al navegador desde el vestíbulo.
 */
describe("el cable: quitar un entorno", () => {
  async function postearConCuerpo(manejador: ManejadorRuta, mensaje: MensajeDelCliente) {
    const peticion = Readable.from([Buffer.from(JSON.stringify(mensaje))]) as unknown as IncomingMessage;
    let estado = 0;
    let cuerpo = "";
    const respuesta = {
      writeHead: (codigo: number) => {
        estado = codigo;
        return respuesta;
      },
      end: (texto?: string) => {
        cuerpo = texto ?? "";
        return respuesta;
      },
    } as unknown as ServerResponse;
    await manejador(peticion, respuesta);
    return { estado, cuerpo };
  }

  it("sin nada vivo lo QUITA: 204 y el vestíbulo lo olvida", async () => {
    const olvidados: string[] = [];
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba({ olvidarEntorno: (id) => (olvidados.push(id), { ruta: "/s.json" }) }));
    const r = await postearConCuerpo(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, {
      clase: "entorno",
      accion: "olvidar",
      entorno: "webstudio",
    });
    await asentar();
    expect(r.estado).toBe(204);
    expect(olvidados).toEqual(["webstudio"]);
  });

  it("las copias del entorno se borran SOLO con `borrarCopias`: sin la marca se quedan", async () => {
    const base = mkdtempSync(join(tmpdir(), "xc-quitar-copias-"));
    mkdirSync(join(base, "webstudio", "Tienda"), { recursive: true });
    const quitar = async (borrarCopias: boolean) => {
      const servidor = servidorDeMentira();
      montarRutas(servidor, vestibuloDePrueba(), { workspace: () => base });
      const r = await postearConCuerpo(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, {
        clase: "entorno",
        accion: "olvidar",
        entorno: "webstudio",
        ...(borrarCopias ? { borrarCopias: true } : {}),
      });
      await asentar();
      return r.estado;
    };
    expect(await quitar(false)).toBe(204);
    expect(existsSync(join(base, "webstudio", "Tienda"))).toBe(true);
    expect(await quitar(true)).toBe(204);
    expect(existsSync(join(base, "webstudio"))).toBe(false);
    rmSync(base, { recursive: true, force: true });
  });

  it("con una tarea de fondo sin terminar en ese entorno, 409 con el MOTIVO y no se toca nada", async () => {
    const olvidados: string[] = [];
    const servidor = servidorDeMentira();
    const tarea = {
      estado: "en-proceso",
      proyecto: { id: "p", nombre: "P", raiz: "/ws/webstudio/P" },
    } as unknown as Tarea;
    montarRutas(servidor, vestibuloDePrueba({ olvidarEntorno: (id) => (olvidados.push(id), { ruta: "/s.json" }) }), {
      workspace: () => "/ws",
      colaDeTareas: colaDeMentira([tarea]),
    });
    const r = await postearConCuerpo(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, {
      clase: "entorno",
      accion: "olvidar",
      entorno: "webstudio",
    });
    await asentar();
    expect(r.estado).toBe(409);
    expect(JSON.parse(r.cuerpo).motivo).toMatch(/tarea de fondo sin terminar/);
    expect(olvidados).toEqual([]);
  });
});

/**
 * Un entorno NUEVO cuyo registro no llega a conectar no se queda guardado: registrar escribe
 * antes de hablar con el servidor, y la primera conversación es `proyectosDe`.
 */
describe("el alta: un entorno que no conecta no se guarda", () => {
  async function registrar(vestibulo: Vestibulo, url: string) {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, {
      clase: "alta",
      paso: "entorno",
      entorno: { id: "", nombre: "", url },
    });
    await asentar();
    return ultimaAlta(cliente) as Extract<MensajeAlCliente, { clase: "alta" }>;
  }

  it("si el servidor NUEVO no contesta, se deshace el registro —sin tocar sus credenciales— y se DICE", async () => {
    const olvidados: { id: string; modo?: { credenciales?: boolean } }[] = [];
    const vestibulo = vestibuloDePrueba({
      olvidarEntorno: (id, modo) => (olvidados.push({ id, ...(modo === undefined ? {} : { modo }) }), { ruta: "/s.json" }),
      proyectosDeEntorno: async () => {
        throw new Error("no es un servidor MCP");
      },
    });
    const alta = await registrar(vestibulo, "https://mcp.casa.example/mcp");
    expect(olvidados).toHaveLength(1);
    expect(olvidados[0]!.modo).toEqual({ credenciales: false });
    expect(vestibulo.entornosRegistrados().map((e) => e.url)).not.toContain("https://mcp.casa.example/mcp");
    expect(alta.aviso).toMatch(/no se ha registrado el entorno.*no es un servidor MCP/);
  });

  it("uno que YA estaba registrado no se quita porque hoy no conteste", async () => {
    const olvidados: string[] = [];
    const vestibulo = vestibuloDePrueba({
      olvidarEntorno: (id) => (olvidados.push(id), { ruta: "/s.json" }),
      proyectosDeEntorno: async () => {
        throw new Error("servidor caído");
      },
    });
    const alta = await registrar(vestibulo, "https://mcp.xonewebstudio.com/mcp");
    expect(olvidados).toEqual([]);
    expect(vestibulo.entornosRegistrados().map((e) => e.id)).toContain("webstudio");
    expect(alta.aviso).toMatch(/servidor caído/);
  });
});

/**
 * Las IMÁGENES de un documento del proyecto, por HTTP: el visor de markdown solo pinta `http(s)`
 * absolutas, así que la vista de un `.md` las enlaza aquí (`arbolDeProyecto.ts#vistaDeMarkdown`).
 */
describe("GET /imagen-del-proyecto", () => {
  async function pedir(manejador: ManejadorRuta, url: string) {
    const peticion = { method: "GET", url, headers: {} } as unknown as IncomingMessage;
    let estado = 0;
    const cabeceras: Record<string, string | number> = {};
    let cuerpo: Buffer | string | undefined;
    const respuesta = {
      writeHead: (codigo: number, extra?: Record<string, string | number>) => ((estado = codigo), Object.assign(cabeceras, extra ?? {}), respuesta),
      setHeader: (clave: string, valor: string | number) => ((cabeceras[clave] = valor), respuesta),
      end: (trozo?: Buffer | string) => ((cuerpo = trozo), respuesta),
    } as unknown as ServerResponse;
    await manejador(peticion, respuesta);
    return { estado, cabeceras, cuerpo };
  }
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

  const abrir = async (leerFichero?: Parameters<typeof montarRutas>[2] extends infer O ? (O extends { leerFichero?: infer L } ? L : never) : never) => {
    const base = mkdtempSync(join(tmpdir(), "xonecode-imagen-"));
    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => base });
    const raiz = vestibulo.raizDeProyecto("webstudio", "Tienda");
    mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");
    montarRutas(servidor, vestibulo, leerFichero === undefined ? {} : { leerFichero });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "sesion", proyecto: "p1" });
    await asentar();
    return {
      raiz,
      ruta: servidor.rutas.get(`GET ${RUTA_IMAGEN_DEL_PROYECTO}`)!,
      limpiar: async () => {
        await vestibulo.cerrar();
        rmSync(base, { recursive: true, force: true });
      },
    };
  };

  it("sirve los BYTES de una imagen del proyecto, con su tipo y las cabeceras de seguridad", async () => {
    const pedidas: string[] = [];
    const { ruta, limpiar } = await abrir(async (_raiz, r) => {
      pedidas.push(r);
      return { ruta: r, recortado: false, binario: true, bytes: PNG.length, mime: "image/png", base64: PNG.toString("base64") };
    });
    const r = await pedir(ruta, `${RUTA_IMAGEN_DEL_PROYECTO}?ruta=doc%2Fimg%2Flogin.png`);
    expect(r.estado).toBe(200);
    expect(pedidas).toEqual(["doc/img/login.png"]);
    expect(Buffer.from(r.cuerpo as Buffer)).toEqual(PNG);
    expect(r.cabeceras).toMatchObject({
      "Content-Type": "image/png",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    await limpiar();
  });

  it("SOLO imágenes: otra ruta no llega ni a leerse", async () => {
    let leidas = 0;
    const { ruta, limpiar } = await abrir(async (_raiz, r) => (leidas++, { ruta: r, texto: "CLAVE=x", recortado: false, binario: false, bytes: 7 }));
    expect((await pedir(ruta, `${RUTA_IMAGEN_DEL_PROYECTO}?ruta=.env`)).estado).toBe(403);
    expect((await pedir(ruta, `${RUTA_IMAGEN_DEL_PROYECTO}?ruta=app.xml`)).estado).toBe(403);
    expect((await pedir(ruta, RUTA_IMAGEN_DEL_PROYECTO)).estado).toBe(400);
    expect(leidas).toBe(0);
    await limpiar();
  });

  it("con el lector de VERDAD: lo que su barrera rechaza no se sirve, aunque se llame .png", async () => {
    const { raiz, ruta, limpiar } = await abrir(leerFicheroDeProyecto);
    mkdirSync(join(raiz, "doc", "img"), { recursive: true });
    writeFileSync(join(raiz, "doc", "img", "login.png"), PNG);
    writeFileSync(join(raiz, ".env"), "CLAVE=secreta");
    symlinkSync(join(raiz, ".env"), join(raiz, "doc", "img", "trampa.png"));
    expect((await pedir(ruta, `${RUTA_IMAGEN_DEL_PROYECTO}?ruta=doc%2Fimg%2Flogin.png`)).estado).toBe(200);
    const trampa = await pedir(ruta, `${RUTA_IMAGEN_DEL_PROYECTO}?ruta=doc%2Fimg%2Ftrampa.png`);
    expect(trampa.estado).toBe(403);
    expect(String(trampa.cuerpo)).not.toContain("secreta");
    expect((await pedir(ruta, `${RUTA_IMAGEN_DEL_PROYECTO}?ruta=doc%2Fimg%2Fno.png`)).estado).toBe(404);
    expect((await pedir(ruta, `${RUTA_IMAGEN_DEL_PROYECTO}?ruta=..%2F..%2Ffuera.png`)).estado).toBe(403);
    await limpiar();
  });
});
