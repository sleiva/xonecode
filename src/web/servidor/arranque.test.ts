/**
 * Todo offline: no hay puerto, ni navegador, ni CloudStudio, ni disco del usuario. El
 * servidor entra como doble que solo apunta las rutas registradas, el vestíbulo se
 * construye con los mismos dobles que usa `vestibulo.test.ts`, y los manejadores se
 * invocan con una petición y una respuesta de mentira — que es lo que permite afirmar
 * sobre el CABLE (qué se emite, en qué orden, a qué consola) sin abrir un socket.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  arrancarConsolaWeb,
  comandosDelRegistro,
  montarRutas,
  FALTA_EL_BUILD,
  RUTA_ACCION,
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
    proyectosDeEntorno: async () => [{ id: "p1", nombre: "Tienda" }],
    ramasDeProyecto: async () => ["master", "pruebas"],
    sesiones: { crear: () => "s1", anotar: () => {}, reabrir: (_r, id) => ({ id, actos: [], historica: true }) },
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
    // La descripción es la MISMA que enseña /ayuda: dos textos para el mismo comando es
    // cómo divergen la consola y la web.
    for (const [nombre, entrada] of Object.entries(COMANDOS)) {
      expect(comandos.find((c) => c.nombre === `/${nombre}`)?.descripcion).toBe(entrada.descripcion);
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
    expect([...servidor.rutas.keys()].sort()).toEqual([`GET ${RUTA_EVENTOS}`, `POST ${RUTA_ACCION}`]);
  });

  it("al conectar manda el transcript, el registro de comandos y el alta pendiente", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba());
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();

    expect(cliente.recibidos.map((m) => m.clase)).toEqual(["reemision", "comandos", "alta"]);
    const comandos = cliente.recibidos[1] as Extract<MensajeAlCliente, { clase: "comandos" }>;
    expect(comandos.comandos).toEqual(comandosDelRegistro());
  });

  it("el alta pide entorno antes que proyecto aunque el entorno ya esté registrado", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba());
    const cliente = clienteDeMentira();
    const eventos = servidor.rutas.get(`GET ${RUTA_EVENTOS}`);
    await eventos!(cliente.peticion, cliente.respuesta);
    await asentar();
    const alta = cliente.recibidos.at(-1) as Extract<MensajeAlCliente, { clase: "alta" }>;
    // `pasosPendientes` diría solo «proyecto» (hay entornos registrados), pero abrir un
    // proyecto exige saber DE QUÉ entorno sale.
    expect(alta.pasos).toEqual(["entorno", "proyecto"]);
    // Nada inventado mientras no se elige: ni proyectos ni ramas.
    expect(alta.proyectos).toEqual([]);
    expect(alta.ramas).toEqual([]);
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
