import { describe, expect, it, vi } from "vitest";
import { crearGestorDeCopias, type ClienteDelCanal } from "./releDeGranja.js";
import type { CanalDeGranja, FalloDeCanal } from "./granjaEnRed.js";
import type { CopiaDeGranja } from "../../core/canalDeGranja.js";

const CONEXION = { direccion: "https://g:8090", token: "xfarm_AbCdEf123456" };
const HOLA = JSON.stringify({ command: "server_hello", protocol_version: 6 });
const ESTADO = {
  devices: [
    {
      serial: "P3",
      state: "ready",
      info: { model: "Pixel 3" },
      slots: [
        { number: 1, owner: null, state: "running" },
        { number: 2, owner: null, state: "running" },
      ],
    },
  ],
};

/** Un canal de mentira: saluda al abrirse, contesta con eco y apunta lo que recibe. */
function canalFalso(opciones: { saluda?: boolean } = {}) {
  const enviados: string[] = [];
  let alMensaje: ((t: string) => void) | undefined;
  let alCerrar: (() => void) | undefined;
  let cerrado = false;
  const canal: CanalDeGranja = {
    enviar: (t) => {
      enviados.push(t);
      queueMicrotask(() => alMensaje?.(JSON.stringify({ result: true, eco: JSON.parse(t) })));
    },
    alMensaje: (o) => {
      alMensaje = o;
      if (opciones.saluda !== false) queueMicrotask(() => o(HOLA));
    },
    alCerrar: (o) => void (alCerrar = o),
    cerrar: () => {
      if (cerrado) return;
      cerrado = true;
      alCerrar?.();
    },
  };
  return { canal, enviados, caer: () => canal.cerrar(), estaCerrado: () => cerrado };
}

function cliente() {
  const recibidos: string[] = [];
  const cierres: string[] = [];
  const c: ClienteDelCanal = { enviar: (t) => void recibidos.push(t), cerrar: (m) => void cierres.push(m) };
  return { c, recibidos, cierres };
}

const asentar = () => new Promise((r) => setTimeout(r, 0));

function gestor(abrir: (copia: CopiaDeGranja) => Promise<CanalDeGranja | FalloDeCanal>, extra: Partial<Parameters<typeof crearGestorDeCopias>[0]> = {}) {
  const informes: string[] = [];
  const liberadas: CopiaDeGranja[] = [];
  const cambios: (CopiaDeGranja | undefined)[] = [];
  const g = crearGestorDeCopias({
    conexion: () => CONEXION,
    pedirEstado: async () => ESTADO,
    abrirCanal: async (_c, copia) => abrir(copia),
    liberar: async (_c, copia) => {
      liberadas.push(copia);
      return { ok: true };
    },
    informar: (t) => void informes.push(t),
    alCambiarCopia: (_s, copia) => void cambios.push(copia),
    topeDeSaludo: 50,
    ...extra,
  });
  return { g, informes, liberadas, cambios };
}

describe("el gestor de copias de la granja", () => {
  it("no coge nada hasta que un cliente se conecta; entonces pide una libre y le da el saludo", async () => {
    const f = canalFalso();
    const abrir = vi.fn(async () => f.canal);
    const { g, cambios } = gestor(abrir);
    g.claveDe("s1");
    expect(abrir).not.toHaveBeenCalled();
    expect(g.copiaDe("s1")).toBeUndefined();
    const a = cliente();
    await g.conectarCliente("s1", a.c);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(g.copiaDe("s1")).toEqual({ serial: "P3", numero: 1, telefono: "Pixel 3" });
    expect(a.recibidos).toEqual([HOLA]);
    expect(cambios).toEqual([{ serial: "P3", numero: 1, telefono: "Pixel 3" }]);
  });

  it("dos scripts comparten UNA conexión y cada uno recibe SU respuesta", async () => {
    const f = canalFalso();
    const abrir = vi.fn(async () => f.canal);
    const { g } = gestor(abrir);
    const a = cliente();
    const b = cliente();
    await g.conectarCliente("s1", a.c);
    await g.conectarCliente("s1", b.c);
    expect(abrir).toHaveBeenCalledTimes(1);
    g.mensajeDelCliente("s1", a.c, JSON.stringify({ command: "getLog" }));
    g.mensajeDelCliente("s1", b.c, JSON.stringify({ command: "getAllElements" }));
    await asentar();
    expect(a.recibidos.at(-1)).toContain("getLog");
    expect(b.recibidos.at(-1)).toContain("getAllElements");
  });

  it("si otro coge la copia entre la foto y la conexión (403), prueba la siguiente", async () => {
    const f = canalFalso();
    const { g } = gestor(async (copia) => (copia.numero === 1 ? { tipo: "ocupada" } : f.canal));
    const a = cliente();
    await g.conectarCliente("s1", a.c);
    expect(g.copiaDe("s1")?.numero).toBe(2);
  });

  it("sin copias libres, o sin granja configurada, el cliente se cierra con el motivo", async () => {
    const sinLibres = gestor(async () => ({ tipo: "ocupada" }), { pedirEstado: async () => ({ devices: [] }) });
    const a = cliente();
    await sinLibres.g.conectarCliente("s1", a.c);
    expect(a.cierres[0]).toMatch(/ninguna copia libre/);
    const sinGranja = gestor(async () => ({ tipo: "ocupada" }), { conexion: () => undefined });
    const b = cliente();
    await sinGranja.g.conectarCliente("s1", b.c);
    expect(b.cierres[0]).toMatch(/Ajustes/);
  });

  // Medido el 05-11-2026: tres teléfonos `ready` con 0 copias, y cada despliegue era «no hay ninguna copia libre».
  it("sin copias libres, CREA una en el teléfono que más admite, espera a que arranque y la coge (y la libera al acabar)", async () => {
    const telefonos = (slots: unknown[]) => ({
      devices: [
        { serial: "A", state: "ready", info: { model: "Pixel 3" }, copies: 0, copiesMax: 20, copiesFit: 6, slots: [] },
        { serial: "B", state: "ready", info: { model: "Pixel 8" }, copies: 2, copiesMax: 20, copiesFit: 35, slots },
        { serial: "E", state: "emulator-off", copies: 0, copiesMax: 20, slots: [] },
      ],
    });
    const fotos = [telefonos([]), telefonos([]), telefonos([{ number: 3, owner: "yo", state: "starting" }]), telefonos([{ number: 3, owner: "yo", state: "running" }])];
    const pedidas: [string, number][] = [];
    const f = canalFalso();
    const abiertas: CopiaDeGranja[] = [];
    const { g, informes, liberadas } = gestor(async (copia) => (abiertas.push(copia), f.canal), {
      pedirEstado: async () => fotos.shift() ?? telefonos([{ number: 3, owner: "yo", state: "running" }]),
      crearCopia: async (_c, serial, count) => (pedidas.push([serial, count]), { ok: true }),
      pausaDeReintento: 1,
    });
    const a = cliente();
    await g.conectarCliente("s1", a.c);
    expect(pedidas).toEqual([["B", 3]]);
    expect(abiertas).toEqual([{ serial: "B", numero: 3, telefono: "Pixel 8" }]);
    expect(a.recibidos[0]).toBe(HOLA);
    expect(informes.join("\n")).toContain("no había copias libres; se crea la copia 3 en Pixel 8");
    await g.liberar("s1");
    expect(liberadas).toEqual([{ serial: "B", numero: 3, telefono: "Pixel 8" }]);
  });

  it("si la copia no se puede crear (507) o no arranca a tiempo, se dice el motivo", async () => {
    const estado = { devices: [{ serial: "B", state: "ready", info: { model: "Pixel 8" }, copies: 0, copiesMax: 20, slots: [] }] };
    const sinRam = gestor(async () => ({ tipo: "ocupada" }), {
      pedirEstado: async () => estado,
      crearCopia: async () => ({ ok: false, motivo: "la copia nueva no cabe en la memoria del teléfono" }),
    });
    const a = cliente();
    await sinRam.g.conectarCliente("s1", a.c);
    expect(a.cierres[0]).toMatch(/no se pudo crear otra en Pixel 8: la copia nueva no cabe en la memoria/);
    const lenta = gestor(async () => ({ tipo: "ocupada" }), { pedirEstado: async () => estado, crearCopia: async () => ({ ok: true }), topeDeCrearCopia: 5, pausaDeReintento: 1 });
    const b = cliente();
    await lenta.g.conectarCliente("s1", b.c);
    expect(b.cierres[0]).toMatch(/la copia nueva de Pixel 8 no arrancó a tiempo/);
  });

  it("una copia que se abre sin saludar YA es nuestra: se apunta (para liberarla) y se reintenta sobre la misma", async () => {
    const muda = canalFalso({ saluda: false });
    const buena = canalFalso();
    const abrir = vi.fn().mockResolvedValueOnce(muda.canal).mockResolvedValueOnce(buena.canal);
    const { g, liberadas } = gestor(abrir, { pausaDeReintento: 1 });
    const a = cliente();
    await g.conectarCliente("s1", a.c);
    expect(abrir).toHaveBeenCalledTimes(2);
    expect(abrir.mock.calls[1]).toEqual([{ serial: "P3", numero: 1, telefono: "Pixel 3" }]);
    expect(a.recibidos).toEqual([HOLA]);
    expect(g.copiaDe("s1")?.numero).toBe(1);
    await g.liberar("s1");
    expect(liberadas).toHaveLength(1);
  });

  it("si nunca saluda se dice, y la copia queda apuntada para liberarla igual", async () => {
    const { g, liberadas } = gestor(async () => canalFalso({ saluda: false }).canal, { pausaDeReintento: 1 });
    const a = cliente();
    await g.conectarCliente("s1", a.c);
    expect(a.cierres[0]).toMatch(/no saludó/);
    expect(g.copiaDe("s1")?.numero).toBe(1);
    await g.liberar("s1");
    expect(liberadas).toEqual([{ serial: "P3", numero: 1, telefono: "Pixel 3" }]);
  });

  it("si el canal cae, el siguiente cliente lo reabre sobre la MISMA copia", async () => {
    const primero = canalFalso();
    const segundo = canalFalso();
    const abrir = vi.fn().mockResolvedValueOnce(primero.canal).mockResolvedValueOnce(segundo.canal);
    const { g } = gestor(abrir);
    const a = cliente();
    await g.conectarCliente("s1", a.c);
    primero.caer();
    expect(a.cierres).toEqual(["el canal con la granja se cerró"]);
    const b = cliente();
    await g.conectarCliente("s1", b.c);
    expect(abrir).toHaveBeenCalledTimes(2);
    expect(abrir.mock.calls[1]).toEqual([{ serial: "P3", numero: 1, telefono: "Pixel 3" }]);
    expect(g.copiaDe("s1")?.numero).toBe(1);
  });

  it("liberar: solo si se cogió; cierra el canal y los clientes, hace reset y lo dice", async () => {
    const f = canalFalso();
    const { g, liberadas, informes, cambios } = gestor(async () => f.canal);
    await g.liberar("s1");
    expect(liberadas).toEqual([]);
    const a = cliente();
    await g.conectarCliente("s1", a.c);
    await g.liberar("s1");
    expect(f.estaCerrado()).toBe(true);
    expect(liberadas).toEqual([{ serial: "P3", numero: 1, telefono: "Pixel 3" }]);
    expect(g.copiaDe("s1")).toBeUndefined();
    expect(cambios.at(-1)).toBeUndefined();
    expect(informes.at(-1)).toMatch(/liberada Pixel 3 · copia 1/);
    // Liberar otra vez no hace nada.
    await g.liberar("s1");
    expect(liberadas).toHaveLength(1);
  });

  it("un reset que falla se dice, y la copia deja de ser de la sesión igual", async () => {
    const f = canalFalso();
    const { g, informes } = gestor(async () => f.canal, { liberar: async () => ({ ok: false, motivo: "la granja contestó 500" }) });
    await g.conectarCliente("s1", cliente().c);
    await g.liberar("s1");
    expect(informes.at(-1)).toMatch(/no se pudo liberar.*500.*sola/);
    expect(g.copiaDe("s1")).toBeUndefined();
  });

  it("cada sesión tiene su clave y su copia: dos tareas, dos copias", async () => {
    const { g } = gestor(async () => canalFalso().canal, {
      pedirEstado: async () => ({
        devices: [{ serial: "P3", state: "ready", info: { model: "Pixel 3" }, slots: [{ number: 1, owner: null, state: "running" }, { number: 2, owner: null, state: "running" }] }],
      }),
    });
    expect(g.claveDe("s1")).not.toBe(g.claveDe("s2"));
    expect(g.sesionDeClave(g.claveDe("s2"))).toBe("s2");
    await g.conectarCliente("s1", cliente().c);
    // La foto de la granja de mentira no cambia; la segunda sesión empieza por la misma y en la real recibiría 403.
    expect(g.copiaDe("s1")).toBeDefined();
    expect(g.copiaDe("s2")).toBeUndefined();
  });
});
