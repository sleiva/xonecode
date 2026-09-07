/**
 * Todo offline: no hay puerto, ni navegador, ni CloudStudio, ni disco del usuario. El
 * servidor entra como doble que solo apunta las rutas registradas, el vestíbulo se
 * construye con los mismos dobles que usa `vestibulo.test.ts`, y los manejadores se
 * invocan con una petición y una respuesta de mentira — que es lo que permite afirmar
 * sobre el CABLE (qué se emite, en qué orden, a qué consola) sin abrir un socket.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  arrancarConsolaWeb,
  comandosDelRegistro, descripcionParaLaWeb,
  montarRutas,
  FALTA_EL_BUILD,
  RUTA_ACCION,
  RUTA_ARTEFACTO,
  RUTA_EVENTOS,
} from "./arranque.js";
import { crearVestibulo, type Vestibulo } from "./vestibulo.js";
import { COMANDOS } from "../../cli/consola.js";
import { CatalogoModelosEnMemoria } from "../../core/ports.js";
import type { Entorno } from "../../core/settings.js";
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

        expect(pedidos).toEqual(["custom:mi-llm"]);
        const fila = ultimoModelos(cliente).proveedores.find((p) => p.id === "custom:mi-llm")!;
        expect(fila.modelos).toEqual([{ id: "qwen3-coder" }]);

        // Y uno que NO está dado de alta se ignora: no se le pide catálogo a un endpoint
        // que no existe.
        await enviarMensaje(accion, { clase: "catalogo", proveedor: "custom:fantasma" });
        await asentar();
        expect(pedidos).toEqual(["custom:mi-llm"]);
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
      expect(consultados).toEqual([]);
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
