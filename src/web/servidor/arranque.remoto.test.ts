/**
 * La sesión remota en el CABLE: el mensaje `remoto` en los dos sentidos y el móvil entrando por
 * la MISMA puerta que una pestaña. Se prueba contra el `montarRutas` REAL —y en la prosa, con el
 * lazo de consola real y un ejecutor que no es un doble del despacho—: el despacho del móvil se
 * compone dentro de `montarRutas`, y una composición de producción que solo ven tests que la
 * doblan no está probada, está escrita.
 *
 * Los ayudantes de arriba son COPIA de los de `arranque.test.ts` (no están exportados y aquí solo
 * hacen falta cinco): son código de prueba, no de producción.
 */
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { CatalogoModelosEnMemoria, PuenteRemotoEnMemoria } from "../../core/ports.js";
import type { Entorno } from "../../core/settings.js";
import { montarRutas, RUTA_ACCION, RUTA_EVENTOS } from "./arranque.js";
import type { ManejadorRuta } from "./servidor.js";
import type { MensajeAlCliente, MensajeDelCliente } from "./transporte.js";
import { crearVestibulo, type Vestibulo } from "./vestibulo.js";

function servidorDeMentira() {
  const rutas = new Map<string, ManejadorRuta>();
  return {
    rutas,
    puerto: 4173,
    registrarRuta: (metodo: string, ruta: string, manejador: ManejadorRuta) => {
      rutas.set(`${metodo} ${ruta}`, manejador);
    },
    registrarRutaPublica: () => {},
  };
}

function clienteDeMentira() {
  const recibidos: MensajeAlCliente[] = [];
  const peticion = { url: "/eventos", on: () => {} } as unknown as IncomingMessage;
  const respuesta = {
    writeHead: () => respuesta,
    write: (trozo: string) => {
      if (trozo.startsWith("data: ")) recibidos.push(JSON.parse(trozo.slice(6)) as MensajeAlCliente);
      return true;
    },
    end: () => respuesta,
  } as unknown as ServerResponse;
  return { peticion, respuesta, recibidos };
}

async function enviarMensaje(manejador: ManejadorRuta, mensaje: MensajeDelCliente): Promise<number> {
  const peticion = Readable.from([Buffer.from(JSON.stringify(mensaje))]) as unknown as IncomingMessage;
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

const asentar = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function vestibuloDePrueba(extra: Partial<Parameters<typeof crearVestibulo>[0]> = {}): Vestibulo {
  const entornos: Entorno[] = [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" }];
  return crearVestibulo({
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
    ramasDeProyecto: async () => ["master"],
    sesiones: {
      crear: () => "s1",
      listar: () => [],
      anotar: () => {},
      reabrir: (_r, id) => ({ id, actos: [], historica: true }),
    },
    correr: async () => 0,
    ...extra,
  });
}

function conRemoto(habilitado: boolean | (() => boolean), extra: Parameters<typeof vestibuloDePrueba>[0] = {}) {
  const servidor = servidorDeMentira();
  const puerto = new PuenteRemotoEnMemoria();
  const cargar = vi.fn(async () => puerto);
  const vestibulo = vestibuloDePrueba(extra);
  const informados: string[] = [];
  const montado = montarRutas(servidor, vestibulo, {
    remoto: { ajustes: () => ({ habilitado: typeof habilitado === "function" ? habilitado() : habilitado, servidor: "ws://127.0.0.1:8787/ws" }), puerto: cargar },
    informar: (t) => void informados.push(t),
  });
  const sse = servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!;
  const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
  return { servidor, puerto, cargar, vestibulo, montado, sse, accion, informados };
}

describe("la sesión remota en el cable", () => {
  it("apagada: ni se anuncia, ni se atiende, ni se carga el paquete", async () => {
    const m = conRemoto(false);
    const c = clienteDeMentira();
    await m.sse(c.peticion, c.respuesta);
    await asentar();
    expect(c.recibidos.some((x) => x.clase === "remoto")).toBe(false);
    expect(await enviarMensaje(m.accion, { clase: "remoto", accion: "encender" })).toBe(204);
    await asentar();
    expect(m.cargar).not.toHaveBeenCalled();
    // Y el cierre ordenado tampoco la anuncia: `arrancarConsolaWeb` monta SIEMPRE la opción, y
    // un `apagar()` a ciegas mandaría `{clase:"remoto", estado:"apagada"}` a cada pestaña.
    await enviarMensaje(m.accion, { clase: "remoto", accion: "apagar" });
    m.montado.cerrarRemoto();
    expect(c.recibidos.some((x) => x.clase === "remoto")).toBe(false);
    expect(m.puerto.cerrados).toBe(0);
  });

  it("sin la opción `remoto` tampoco existe: la acción contesta 204 y no hace nada", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba());
    const c = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(c.peticion, c.respuesta);
    await asentar();
    expect(await enviarMensaje(servidor.rutas.get(`POST ${RUTA_ACCION}`)!, { clase: "remoto", accion: "encender" })).toBe(204);
    await asentar();
    expect(c.recibidos.some((x) => x.clase === "remoto")).toBe(false);
  });

  it("encendida: se anuncia, se enciende y un móvil recibe la ráfaga FILTRADA", async () => {
    const m = conRemoto(true);
    const c = clienteDeMentira();
    await m.sse(c.peticion, c.respuesta);
    await asentar();
    expect(c.recibidos).toContainEqual({ clase: "remoto", estado: "apagada" });

    await enviarMensaje(m.accion, { clase: "remoto", accion: "encender" });
    await asentar();
    expect(m.cargar).toHaveBeenCalledTimes(1);
    expect(m.puerto.aperturas).toEqual(["ws://127.0.0.1:8787/ws"]);
    m.puerto.abierta("https://r/r/S#K");
    expect(c.recibidos.at(-1)).toEqual({ clase: "remoto", estado: "activa", url: "https://r/r/S#K", moviles: 0 });

    m.puerto.presencia("m1");
    await asentar();
    const alMovil = m.puerto.enviados.filter((e) => e.para === "m1").map((e) => (e.mensaje as { clase: string }).clase);
    expect(alMovil).toContain("reemision");
    for (const prohibida of ["modelos", "agentes", "workspace", "skills", "bienvenida", "remoto"]) {
      expect(alMovil).not.toContain(prohibida);
    }
    // Y la pestaña se entera de que hay un móvil: el diálogo lo pinta.
    expect(c.recibidos.at(-1)).toEqual({ clase: "remoto", estado: "activa", url: "https://r/r/S#K", moviles: 1 });
  });

  it("una prosa del móvil llega al turno de la consola en foco por el despachador real", async () => {
    const base = mkdtempSync(join(tmpdir(), "xonecode-remoto-"));
    try {
      const peticiones: string[] = [];
      const m = conRemoto(true, {
        baseDeWorkspace: () => base,
        crearEjecutor: () => async (peticion) => {
          peticiones.push(peticion);
        },
        // El lazo de consola REAL (`correrConsola`): el de `vestibuloDePrueba` no lee líneas,
        // y entonces la prosa no llegaría a ningún ejecutor por mucho que el despacho fuera bien.
        correr: undefined,
      });
      const raiz = m.vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");

      const c = clienteDeMentira();
      await m.sse(c.peticion, c.respuesta);
      await enviarMensaje(m.accion, { clase: "sesion", proyecto: "p1" });
      for (let i = 0; i < 5; i++) await asentar();
      expect(m.vestibulo.proyectoAbierto()).toBeDefined();

      await enviarMensaje(m.accion, { clase: "remoto", accion: "encender" });
      await asentar();
      m.puerto.abierta();
      m.puerto.presencia("m1");
      m.puerto.delMovil("m1", { clase: "prosa", texto: "desde el móvil" });
      await vi.waitFor(() => expect(peticiones.join("\n")).toContain("desde el móvil"));
      await m.vestibulo.cerrar();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  /**
   * Abre «Tienda» (offline, con copia) con el lazo de consola REAL y una pestaña conectada, y
   * enciende el puente. Deja todo ASENTADO: la ruta SSE deja anuncios de `alta` en vuelo
   * (`conducirCuenta().then(anunciarAlta)` y su `finally`), y si llegaran después de enganchar
   * el móvil, el test pasaría sin que el móvil recibiera nada suyo.
   */
  async function abiertoConPestanaYPuente(base: string) {
    const m = conRemoto(true, { baseDeWorkspace: () => base, crearEjecutor: () => async () => {}, correr: undefined });
    const raiz = m.vestibulo.raizDeProyecto("webstudio", "Tienda");
    mkdirSync(join(raiz, ".xonecode", "cloudstudio"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    writeFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "{}");
    const pestana = clienteDeMentira();
    await m.sse(pestana.peticion, pestana.respuesta);
    await enviarMensaje(m.accion, { clase: "sesion", proyecto: "p1" });
    await vi.waitFor(() => expect(m.vestibulo.proyectoAbierto()).toBeDefined());
    await enviarMensaje(m.accion, { clase: "remoto", accion: "encender" });
    for (let i = 0; i < 10; i++) await asentar();
    m.puerto.abierta();
    for (let i = 0; i < 10; i++) await asentar();
    return { m, pestana };
  }

  it("un móvil que entra recibe el `alta` (como `remoto.estado`) solo él, y la pestaña nada de más", async () => {
    const base = mkdtempSync(join(tmpdir(), "xonecode-remoto-"));
    try {
      const { m, pestana } = await abiertoConPestanaYPuente(base);
      const altasDeLaPestana = pestana.recibidos.filter((x) => x.clase === "alta").length;
      // La pestaña SÍ sabe dónde está: el dato existe y lo que falta es dárselo al móvil.
      expect(pestana.recibidos.filter((x) => x.clase === "alta").at(-1)).toMatchObject({ proyectoActivo: "p1" });

      m.puerto.presencia("m1");
      await vi.waitFor(() =>
        expect(m.puerto.enviados.filter((e) => e.para === "m1").map((e) => e.mensaje)).toContainEqual({ clase: "remoto.estado", proyecto: "Tienda" })
      );
      expect(pestana.recibidos.filter((x) => x.clase === "alta").length).toBe(altasDeLaPestana);
      await m.vestibulo.cerrar();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  /**
   * La tarjeta que VOLVÍA al móvil tras decidir (prueba cruzada). El anfitrión le manda UNA
   * `aprobacion` por escritura y ninguna después de la decisión, pase lo que pase en el cable:
   * actos, un `alta` reanunciado, presencia repetida y otro móvil que entra. La causa estaba en
   * la web móvil (dos copias de su estado), y esto es lo que la descarta en este lado.
   */
  it("a un móvil le llega UNA `aprobacion` por escritura, y ninguna tras decidir", async () => {
    const base = mkdtempSync(join(tmpdir(), "xonecode-remoto-"));
    try {
      const { m, pestana } = await abiertoConPestanaYPuente(base);
      m.puerto.presencia("m1");
      for (let i = 0; i < 10; i++) await asentar();

      const abierto = m.vestibulo.proyectoAbierto()!;
      const pendiente = { id: "1", origen: "dev", descripcion: "escribir /a.txt", decisionesPermitidas: ["approve", "reject"] as const };
      const decidido = abierto.consola.consola.aprobacionesTui!([{ ...pendiente, decisionesPermitidas: [...pendiente.decisionesPermitidas] }], new Map([["1", "/a.txt"]]), new Map());
      await asentar();
      const aprobacionesA = (para: string) => m.puerto.enviados.filter((e) => e.para === para && (e.mensaje as { clase: string }).clase === "aprobacion").length;
      expect(aprobacionesA("m1")).toBe(1);

      m.puerto.delMovil("m1", { clase: "decision", decisiones: { "1": "reject" } });
      const decisiones = await decidido;
      expect(decisiones.get("1")?.type).toBe("reject");

      // El tráfico que había en la prueba cruzada mientras el turno seguía.
      const clasesTrasDecidir = (desde: number) =>
        m.puerto.enviados.slice(desde).filter((e) => e.para === "m1").map((e) => (e.mensaje as { clase: string }).clase);
      const desde = m.puerto.enviados.length;
      // Una prosa de la pestaña: reanuncia el `alta` y corre un turno (sus dos flancos).
      await enviarMensaje(m.accion, { clase: "prosa", texto: "otra cosa" });
      m.puerto.presencia("m1");
      m.puerto.presencia("m1", "m2");
      m.puerto.delMovil("m1", { clase: "decision", decisiones: { "1": "reject" } });
      for (let i = 0; i < 10; i++) await asentar();

      // Y el tráfico llegó de verdad al móvil: sin esto, «ninguna más» no diría nada.
      expect(clasesTrasDecidir(desde)).toEqual(expect.arrayContaining(["acto", "remoto.estado", "turno"]));
      expect(aprobacionesA("m1")).toBe(1);
      // El que entra DESPUÉS de decidir tampoco la recibe: ya no está en vuelo.
      expect(aprobacionesA("m2")).toBe(0);
      expect(pestana.recibidos.filter((x) => x.clase === "aprobacion")).toHaveLength(1);
      await m.vestibulo.cerrar();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("la aprobación en vuelo SÍ se reemite al móvil que entra mientras espera", async () => {
    const base = mkdtempSync(join(tmpdir(), "xonecode-remoto-"));
    try {
      const { m } = await abiertoConPestanaYPuente(base);
      const abierto = m.vestibulo.proyectoAbierto()!;
      const decidido = abierto.consola.consola.aprobacionesTui!(
        [{ id: "1", origen: "dev", descripcion: "escribir /a.txt", decisionesPermitidas: ["approve", "reject"] }],
        new Map([["1", "/a.txt"]]),
        new Map()
      );
      m.puerto.presencia("m1");
      for (let i = 0; i < 10; i++) await asentar();
      expect(m.puerto.enviados.filter((e) => e.para === "m1" && (e.mensaje as { clase: string }).clase === "aprobacion")).toHaveLength(1);
      m.puerto.delMovil("m1", { clase: "decision", decisiones: { "1": "approve" } });
      expect((await decidido).get("1")?.type).toBe("approve");
      await m.vestibulo.cerrar();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  /**
   * Al móvil solo le llega una `pregunta` SIN `decision` (`filtrarSalida`): su `respuesta` no
   * puede contestar lo que nunca vio. Con «¿Vaciar la copia…?» o la subida con casillas abiertas
   * en el escritorio, un «s» del móvil las APROBABA (la subida sin `seleccion` es el plan entero).
   */
  it("una `respuesta` del móvil no contesta una decisión del escritorio, y la pestaña sí", async () => {
    const base = mkdtempSync(join(tmpdir(), "xonecode-remoto-"));
    try {
      const { m } = await abiertoConPestanaYPuente(base);
      m.puerto.presencia("m1");
      for (let i = 0; i < 10; i++) await asentar();
      const consola = m.vestibulo.proyectoAbierto()!.consola.consola;

      let vaciar: string | undefined;
      void consola.preguntar("¿Vaciar la copia local?", { lineas: [{ texto: "- a.xne", cambio: "borrado" }], operacion: "bajar" }).then((r) => {
        vaciar = r;
      });
      let subir: { respuesta: string; seleccion?: readonly string[] } | undefined;
      void consola.decidirConSeleccion!("¿Subir a CloudStudio?", { lineas: [{ texto: "~ a.xne", cambio: "modificado", ruta: "a.xne" }], seleccionable: true, operacion: "subir" }).then((r) => {
        subir = r;
      });
      await asentar();

      m.puerto.delMovil("m1", { clase: "respuesta", texto: "s" });
      m.puerto.delMovil("m1", { clase: "respuesta", texto: "s" });
      for (let i = 0; i < 5; i++) await asentar();
      expect(subir).toBeUndefined();
      expect(vaciar).toBeUndefined();
      expect(m.informados.filter((t) => t.includes("una respuesta del móvil no tenía pregunta a la que contestar"))).toHaveLength(2);

      // Las dos siguen vivas para el escritorio, en su orden de siempre.
      await enviarMensaje(m.accion, { clase: "respuesta", texto: "n", seleccion: [] });
      await enviarMensaje(m.accion, { clase: "respuesta", texto: "n" });
      await vi.waitFor(() => expect(subir).toEqual({ respuesta: "n", seleccion: [] }));
      await vi.waitFor(() => expect(vaciar).toBe("n"));
      await m.vestibulo.cerrar();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("una `respuesta` del móvil SÍ contesta una pregunta de texto libre, aunque haya una decisión antes", async () => {
    const base = mkdtempSync(join(tmpdir(), "xonecode-remoto-"));
    try {
      const { m } = await abiertoConPestanaYPuente(base);
      m.puerto.presencia("m1");
      for (let i = 0; i < 10; i++) await asentar();
      const consola = m.vestibulo.proyectoAbierto()!.consola.consola;

      let vaciar: string | undefined;
      void consola.preguntar("¿Vaciar la copia local?", { lineas: [{ texto: "- a.xne", cambio: "borrado" }], operacion: "bajar" }).then((r) => {
        vaciar = r;
      });
      let url: string | undefined;
      void consola.preguntar("¿URL del servidor?").then((r) => {
        url = r;
      });
      await asentar();
      expect(m.puerto.enviados.filter((e) => e.para === "m1").map((e) => e.mensaje)).toContainEqual({ clase: "pregunta", texto: "¿URL del servidor?" });

      m.puerto.delMovil("m1", { clase: "respuesta", texto: "https://x" });
      await vi.waitFor(() => expect(url).toBe("https://x"));
      expect(vaciar).toBeUndefined();
      await enviarMensaje(m.accion, { clase: "respuesta", texto: "n" });
      await vi.waitFor(() => expect(vaciar).toBe("n"));
      await m.vestibulo.cerrar();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("con el interruptor apagado EN CALIENTE y el puente abierto, una pestaña nueva lo ve y lo puede apagar", async () => {
    let encendido = true;
    const m = conRemoto(() => encendido);
    await enviarMensaje(m.accion, { clase: "remoto", accion: "encender" });
    await asentar();
    m.puerto.abierta("https://r/r/S#K");
    encendido = false;
    const c = clienteDeMentira();
    await m.sse(c.peticion, c.respuesta);
    await asentar();
    expect(c.recibidos).toContainEqual({ clase: "remoto", estado: "activa", url: "https://r/r/S#K", moviles: 0 });
    await enviarMensaje(m.accion, { clase: "remoto", accion: "apagar" });
    expect(m.puerto.canales.at(-1)?.cerrado).toBe(true);
    expect(c.recibidos.at(-1)).toEqual({ clase: "remoto", estado: "apagada" });
    // Y ya apagado, con el interruptor apagado, la siguiente pestaña no lo ve.
    const d = clienteDeMentira();
    await m.sse(d.peticion, d.respuesta);
    await asentar();
    expect(d.recibidos.some((x) => x.clase === "remoto")).toBe(false);
  });

  it("cerrarRemoto apaga el puente", async () => {
    const m = conRemoto(true);
    await enviarMensaje(m.accion, { clase: "remoto", accion: "encender" });
    await asentar();
    m.puerto.abierta();
    expect(m.puerto.canales.at(-1)?.cerrado).toBe(false);
    m.montado.cerrarRemoto();
    expect(m.puerto.canales.at(-1)?.cerrado).toBe(true);
    expect(m.puerto.cerrados).toBe(1);
  });
});
