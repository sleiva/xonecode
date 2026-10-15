import { describe, expect, it } from "vitest";
import {
  CABECERA_DEL_ENCARGO,
  cerrarTicket,
  comentarioDeEncargo,
  escrituraEnElGestor,
  hayQueTransicionar,
  reflejosPendientes,
  vinculoDelTicket,
} from "./tareasEnElGestor.js";
import type { Tarea } from "./tareas.js";
import { GestorDeTareasEnMemoria } from "./ports.js";

const tarea = (extra: Partial<Tarea> = {}): Tarea => ({
  id: "t1",
  proyecto: { id: "p1", raiz: "/w/Maset", nombre: "Maset" },
  titulo: "Versión en el login",
  peticion: "p",
  encargo: "e",
  adjuntos: [],
  estado: "nuevo",
  creada: "2026-10-15T10:00:00.000Z",
  ...extra,
});
const ticket = { conector: "jira", sitio: "cloud-1", proyecto: "KAN", clave: "KAN-7" };

describe("escrituraEnElGestor", () => {
  it("empezar al pasar a en-proceso, cerrar al terminar, y nada más", () => {
    expect(escrituraEnElGestor("nuevo", "en-proceso")).toBe("empezar");
    expect(escrituraEnElGestor("en-proceso", "terminada")).toBe("cerrar");
    expect(escrituraEnElGestor("requiere-atencion", "terminada")).toBe("cerrar");
    expect(escrituraEnElGestor("en-proceso", "requiere-atencion")).toBeUndefined();
    expect(escrituraEnElGestor("requiere-atencion", "nuevo")).toBeUndefined();
    expect(escrituraEnElGestor("en-proceso", "en-proceso")).toBeUndefined();
  });
});

describe("reflejosPendientes", () => {
  it("solo las tareas CON ticket y solo cuando cambió su estado", () => {
    const antes = [tarea({ id: "a", ticket }), tarea({ id: "b" }), tarea({ id: "c", ticket, estado: "en-proceso" })];
    const despues = [
      tarea({ id: "a", ticket, estado: "en-proceso" }),
      tarea({ id: "b", estado: "en-proceso" }),
      // Guardar un aviso en el ticket no cambia el estado: no vuelve a disparar.
      tarea({ id: "c", ticket: { ...ticket, aviso: "x" }, estado: "en-proceso" }),
    ];
    expect(reflejosPendientes(antes, despues).map((r) => [r.tarea.id, r.escritura])).toEqual([["a", "empezar"]]);
  });

  it("una tarea que aparece ya en marcha cuenta como antes ausente; una descartada no escribe", () => {
    expect(reflejosPendientes([], [tarea({ ticket, estado: "en-proceso" })]).map((r) => r.escritura)).toEqual(["empezar"]);
    expect(reflejosPendientes([tarea({ ticket, estado: "en-proceso" })], [])).toEqual([]);
  });
});

describe("hayQueTransicionar", () => {
  it("al empezar, no si el ticket ya está en curso o hecho; al cerrar, siempre", () => {
    expect(hayQueTransicionar("empezar", "por-hacer")).toBe(true);
    expect(hayQueTransicionar("empezar", "en-curso")).toBe(false);
    expect(hayQueTransicionar("empezar", "terminada")).toBe(false);
    expect(hayQueTransicionar("cerrar", "en-curso")).toBe(true);
  });
});

describe("el encargo y el vínculo del ticket", () => {
  it("el comentario lleva la cabecera FIJA, que la fase 2 buscará", () => {
    const c = comentarioDeEncargo("  Añade la versión al login.  ");
    expect(c.startsWith(`**${CABECERA_DEL_ENCARGO}**`)).toBe(true);
    expect(c).toContain("Añade la versión al login.");
  });

  it("se escribe con el vínculo COPIADO en el ticket, nunca con el del proyecto ahora", () => {
    expect(vinculoDelTicket(ticket)).toEqual({ conector: "jira", sitio: "cloud-1", proyecto: "KAN" });
  });
});

describe("cerrarTicket", () => {
  const v = { conector: "jira", sitio: "cloud-1", proyecto: "KAN" };

  it("comenta y luego transiciona", async () => {
    const g = new GestorDeTareasEnMemoria();
    expect(await cerrarTicket(g, v, "KAN-7", "hecho", "31", String)).toEqual({});
    expect(g.comentariosAplicados).toEqual([{ clave: "KAN-7", texto: "hecho" }]);
    expect(g.transicionesAplicadas).toEqual([{ clave: "KAN-7", transicion: "31" }]);
  });

  it("si comentar falla, LANZA y no transiciona", async () => {
    const g = new GestorDeTareasEnMemoria();
    g.comentar = async () => {
      throw new Error("sin permiso");
    };
    await expect(cerrarTicket(g, v, "KAN-7", "hecho", "31", String)).rejects.toThrow("sin permiso");
    expect(g.transicionesAplicadas).toEqual([]);
  });

  it("si la transición falla, el comentario ya está: no lanza, devuelve el motivo", async () => {
    const g = new GestorDeTareasEnMemoria();
    g.transicionar = async () => {
      throw new Error("transición no válida");
    };
    expect(await cerrarTicket(g, v, "KAN-7", "hecho", "31", (e) => `limpio: ${(e as Error).message}`)).toEqual({
      falloDeTransicion: "limpio: transición no válida",
    });
    expect(g.comentariosAplicados).toHaveLength(1);
  });
});

describe("GestorDeTareasEnMemoria.crear", () => {
  it("solo existe si se pide, y lo creado se puede leer como ficha", async () => {
    expect(new GestorDeTareasEnMemoria().crear).toBeUndefined();
    const g = new GestorDeTareasEnMemoria({ creaConPrefijo: "KAN" });
    const v = { conector: "jira", sitio: "cloud-1", proyecto: "KAN" };
    const creada = await g.crear!(v, { titulo: "Versión", descripcion: "en el login" });
    expect(creada).toMatchObject({ clave: "KAN-1", categoria: "por-hacer" });
    expect((await g.ficha(v, "KAN-1")).descripcion).toBe("en el login");
  });
});
