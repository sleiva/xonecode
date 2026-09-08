/**
 * Todo offline: no hay puerto, ni navegador, ni CloudStudio, ni disco del usuario. El
 * servidor entra como doble que solo apunta las rutas registradas, el vestíbulo se
 * construye con los mismos dobles que usa `vestibulo.test.ts`, y los manejadores se
 * invocan con una petición y una respuesta de mentira — que es lo que permite afirmar
 * sobre el CABLE (qué se emite, en qué orden, a qué consola) sin abrir un socket.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  arrancarConsolaWeb,
  comandosDelRegistro, descripcionParaLaWeb,
  montarRutas,
  construirCorredorDeTareasCableado,
  FALTA_EL_BUILD,
  RUTA_ACCION,
  RUTA_ADJUNTO,
  RUTA_ARTEFACTO,
  RUTA_EVENTOS,
  fuentesDelJuez,
  augmentacionCableada,
  contextoDelProyecto,
  TOPE_DE_MEMORIA,
} from "./arranque.js";
import { ErrorDelAumentador } from "../../agent/aumentador.js";
import type { PeticionDeTarea } from "../../core/ports.js";
import { crearVestibulo, type Vestibulo } from "./vestibulo.js";
import { COMANDOS } from "../../cli/consola.js";
import { CatalogoModelosEnMemoria } from "../../core/ports.js";
import type { Entorno } from "../../core/settings.js";
import type { AdjuntoDeTarea, Tarea } from "../../core/tareas.js";
import { TOPE_DE_ADJUNTO } from "../../agent/tareasEnDisco.js";
import type { ManejadorRuta } from "./servidor.js";
import type { MensajeAlCliente, MensajeDelCliente } from "./transporte.js";

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

/** El SSE del navegador: apunta cada mensaje ya parseado y sabe avisar del cierre. */
function clienteDeMentira() {
  const recibidos: MensajeAlCliente[] = [];
  let alCerrar: (() => void) | undefined;
  const peticion = {
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
    guardarConfigDeProyecto: (raiz: string) => ({ ruta: `${raiz}/.xonecode/config.json` }),
    guardarModeloGlobal: (_papel, id) => ({ ruta: "/casa/.xonecode/config.json", id }),
    descargar: async () => {},
    adoptarLegado: () => {},
    entornos,
    baseDeWorkspace: "/w",
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

describe("comandosDelRegistro", () => {
  it("sale de COMANDOS recorrido, no de una lista escrita a mano", () => {
    const comandos = comandosDelRegistro();
    expect(comandos.map((c) => c.nombre)).toEqual(Object.keys(COMANDOS).map((n) => `/${n}`));
    // La descripción SALE de la que enseña /ayuda —una sola fuente— pasada por
    // `descripcionParaLaWeb`, que solo le quita el vocabulario de terminal («como
    // `xonecode config`», las comillas de código). Dos textos escritos a mano para el mismo
    // comando es cómo divergen; un texto derivado del otro no puede.
    for (const [nombre, entrada] of Object.entries(COMANDOS)) {
      expect(comandos.find((c) => c.nombre === `/${nombre}`)?.descripcion).toBe(
        descripcionParaLaWeb(entrada.descripcion)
      );
    }
  });

  it("un comando nuevo aparece solo: no hay copia que actualizar", () => {
    expect(comandosDelRegistro()).toHaveLength(Object.keys(COMANDOS).length);
  });
});

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
    ]);
  });

  it("al conectar manda el transcript, los comandos, el estado de modelos, el saludo y el alta", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba());
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();

    // «modelos» va con los comandos y por el mismo motivo: es lo que el compositor
    // necesita para pintarse, y al reconectar hay que repoblarlo entero — el cliente tira
    // sus proyecciones al caerse el SSE en vez de recordar un modelo que pudo cambiar.
    expect(cliente.recibidos.map((m) => m.clase)).toEqual([
      "reemision",
      "comandos",
      "modelos",
      // Los subagentes van aquí por lo mismo que los modelos: la ventana de ajustes se
      // puede abrir en cuanto conecta, y sin esto enseñaría una lista vacía hasta que algo
      // los cambiara — indistinguible de «no tienes ninguno».
      "agentes",
      // Y si hay turno corriendo, se dice: quien conecta a mitad no vio el mensaje que lo
      // anunció, y su compositor se quedaría encendido mientras lo que escriba se encola.
      "turno",
      "bienvenida",
      "alta",
    ]);
    const comandos = cliente.recibidos[1] as Extract<MensajeAlCliente, { clase: "comandos" }>;
    expect(comandos.comandos).toEqual(comandosDelRegistro());
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
    const alta = cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.pasos).toEqual([]);
    // Sin proyecto abierto: nadie ha elegido ninguno todavía en ESTA conexión, aunque el
    // entorno ya estuviera registrado de antes.
    expect(alta.proyectoAbierto).toBe(false);
    expect(alta.proyectos).toEqual([{ id: "p1", nombre: "Tienda" }]);
    // Las ramas sí siguen vacías: pedirlas exige saber de qué PROYECTO, y eso solo lo
    // dice quien elige uno en la barra (`paso: "proyecto"`), no la población automática.
    expect(alta.ramas).toEqual([]);
  });

  it("sin ningún entorno registrado, la población automática no tiene de dónde sacar proyectos: `proyectos` se queda vacío sin lanzar", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba({ entornos: [] }));
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();
    const alta = cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
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

    const alta = cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.pasos).toEqual([]);
    expect(alta.proyectoAbierto).toBe(true);
  });

  it("el `modo` del proyecto abierto viaja en el alta, leído de su `.xonecode/config.json`", async () => {
    // Es lo que pinta la pastilla de la cabecera (`Cabecera.tsx`). Se lee del disco EN
    // CADA anuncio, no al abrir: `configurarModoInicial` puede escribirlo después.
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-modo-"));
    mkdirSync(join(raiz, ".xonecode"));
    writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "cloud" }));

    const servidor = servidorDeMentira();
    const vestibulo = vestibuloDePrueba();
    await vestibulo.abrirProyecto({ raiz });
    montarRutas(servidor, vestibulo);
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();

    const alta = cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
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

    const alta = cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.proyectoAbierto).toBe(true);
    expect("modo" in alta).toBe(false);
  });

  it("el saludo de la bienvenida viaja en el alta cuando el vestíbulo trae uno, y no viaja si no", async () => {
    // El wire entero de `agent/persona.ts#nombreDePersona`: `arranque.ts` lo resuelve UNA
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
    let alta = cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
    expect(alta.proyectos).toEqual([{ id: "p1", nombre: "Tienda" }]);

    await enviarMensaje(accion, { clase: "alta", paso: "proyecto", proyecto: "p1" });
    await asentar();
    alta = cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
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
    const alta = cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
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
    const alta = cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
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
        fuentes: { bandera: "anthropic/claude-x" },
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
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: mkdtempSync(join(tmpdir(), "xonecode-vacio-")) });
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
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: mkdtempSync(join(tmpdir(), "xonecode-vacio-")) });
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
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: base });
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
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

    it("con proyecto y sesión, la lista sale del puerto y el parche se pide POR RUTA", async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-proy-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: base });
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));

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
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: base });
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
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
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: base });
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
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

  describe("abrir una sesión desde la barra", () => {
    it("con la copia local ya bajada se abre directamente: no hay rama que preguntar", async () => {
      const raiz = mkdtempSync(join(tmpdir(), "xonecode-proy-"));
      mkdirSync(join(raiz, ".xonecode"));
      writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: dirname(raiz) });
      // `raizDeProyecto` compone `<base>/<entorno>/workspace/<nombre>`, así que el nombre
      // del proyecto se elige para que caiga en la carpeta que acabamos de preparar.
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));

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

    it("las ramas se piden con el NOMBRE del proyecto, no con el id que trae el cable", async () => {
      const pedidos: string[] = [];
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({
        baseDeWorkspace: mkdtempSync(join(tmpdir(), "xonecode-vacio-")),
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
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: mkdtempSync(join(tmpdir(), "xonecode-vacio-")) });
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
    });

    it("con proyecto abierto se dice CUÁL, deducido de su raíz y no de un id guardado aparte", async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-base-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: base });
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
    const alta = cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
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
    const alta = cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
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
    expect((cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>).aviso).toBe("fetch failed");

    falla = false;
    await enviarMensaje(accion, entorno);
    await asentar();
    // Un aviso viejo pegado a un paso que ya salió bien sería una mentira con forma de error.
    expect((cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>).aviso).toBeUndefined();
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

describe("descripcionParaLaWeb", () => {
  it("quita el «— como `xonecode …`» y las comillas de código: es vocabulario de terminal", () => {
    expect(descripcionParaLaWeb("config y credenciales, sin claves — como `xonecode config`")).toBe(
      "config y credenciales, sin claves"
    );
    expect(descripcionParaLaWeb("cambia los TRES papeles en caliente: /modelo <proveedor>/<modelo>")).toBe(
      "cambia los TRES papeles en caliente: /modelo <proveedor>/<modelo>"
    );
    expect(descripcionParaLaWeb("lista los comandos de barra")).toBe("lista los comandos");
  });
});

describe("qué hay en la máquina: el mensaje «dispositivos»", () => {
  const informe = {
    sistema: "mac" as const,
    herramientas: [{ nombre: "adb" as const, estado: "no-encontrada" as const }],
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

  it("la RUTA de cada herramienta no sale por el cable: es una ruta del home del usuario", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      detectarDispositivos: async () => ({
        ...informe,
        herramientas: [{ nombre: "adb", estado: "ok", ruta: "/Users/alguien/Library/Android/sdk/platform-tools/adb" }],
      }),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    const foto = cliente.recibidos.find((m) => m.clase === "dispositivos") as Extract<MensajeAlCliente, { clase: "dispositivos" }>;
    expect(foto.informe.herramientas).toEqual([{ nombre: "adb", estado: "ok" }]);
    expect(JSON.stringify(foto)).not.toContain("/Users/alguien");
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
    const vestibulo = vestibuloDePrueba({ baseDeWorkspace: base });
    const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
    mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
    writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
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
        proyecto: { id: "p1", raiz: "/w/webstudio/workspace/Tienda", nombre: "Tienda" },
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
 * El CABLEADO real, no solo sus piezas — lo que `montarRutas` en solitario no puede
 * vigilar. Aquí se compone `construirCorredorDeTareasCableado` (`arranque.ts`) de VERDAD:
 * la misma función que usa `arrancarConsolaWeb`, con un corredor real
 * (`crearCorredorDeTareas` por debajo) y sin reimplementar su cableado en el test — es la
 * MISMA lección que dejó `backendDeAgente` en `agent/proyecto.ts`: la composición vivía
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
    proyectoAbierto: () => undefined,
    sesionesDe: () => [],
  };

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
        proyectoAbierto: () => undefined,
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
