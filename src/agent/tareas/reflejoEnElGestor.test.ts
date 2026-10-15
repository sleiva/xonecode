import { describe, expect, it } from "vitest";
import { conReflejoAlGuardar, crearReflejoEnElGestor } from "./reflejoEnElGestor.js";
import type { TareasEnDisco } from "./tareasEnDisco.js";
import { GestorDeTareasEnMemoria } from "../../core/ports.js";
import type { Tarea, TicketDeTarea } from "../../core/tareas.js";

const TRANSICIONES = [
  { id: "21", nombre: "En curso", destino: "En curso", categoria: "en-curso" as const },
  { id: "31", nombre: "In Review", destino: "En revisión", categoria: "en-curso" as const },
  { id: "41", nombre: "Listo", destino: "Finalizada", categoria: "terminada" as const },
];

function montar(estadoDelTicket: { estado: string; categoria: "por-hacer" | "en-curso" | "terminada" }) {
  const gestor = new GestorDeTareasEnMemoria({
    tareas: [{ clave: "KAN-1", titulo: "t", descripcion: "", ...estadoDelTicket }],
    transiciones: { "KAN-1": TRANSICIONES },
  });
  const avisos: (string | undefined)[] = [];
  const reflejar = crearReflejoEnElGestor({
    gestorDe: () => gestor,
    datosDeCierre: async () => ({ ficheros: [], commits: [] }),
    anotarAviso: (_id, a) => avisos.push(a),
    motivoDe: String,
  });
  return { gestor, avisos, reflejar };
}

const tarea = (estado: Tarea["estado"], ticket: Partial<TicketDeTarea> = {}): Tarea & { ticket: TicketDeTarea } => ({
  id: "t1",
  proyecto: { id: "p1", raiz: "/w/x", nombre: "x" },
  titulo: "t",
  peticion: "p",
  encargo: "e",
  adjuntos: [],
  estado,
  creada: "2026-10-15T10:00:00Z",
  ticket: { conector: "jira", sitio: "c", proyecto: "KAN", clave: "KAN-1", ...ticket },
});

describe("el reflejo con el MAPEO de estados", () => {
  it("al terminar va al estado mapeado (En revisión), no al «terminada» de la regla por categoría", async () => {
    const { gestor, reflejar } = montar({ estado: "En curso", categoria: "en-curso" });
    reflejar([{ tarea: tarea("terminada", { estados: { terminar: "En revisión" } }), escritura: "cerrar" }]);
    await reflejar.enCurso();
    expect(gestor.transicionesAplicadas).toEqual([{ clave: "KAN-1", transicion: "31" }]);
  });

  it("al empezar no mueve un ticket que YA está en el estado de lanzar (lo movió la persona: eso lo lanzó)", async () => {
    const { gestor, reflejar } = montar({ estado: "En curso", categoria: "en-curso" });
    reflejar([{ tarea: tarea("en-proceso", { estados: { lanzar: "En curso" } }), escritura: "empezar" }]);
    await reflejar.enCurso();
    expect(gestor.transicionesAplicadas).toEqual([]);
  });

  it("con un estado mapeado al que su flujo no lleva, no adivina otro: lo deja dicho", async () => {
    const { gestor, avisos, reflejar } = montar({ estado: "En curso", categoria: "en-curso" });
    reflejar([{ tarea: tarea("terminada", { estados: { terminar: "PROBAR" } }), escritura: "cerrar" }]);
    await reflejar.enCurso();
    expect(gestor.transicionesAplicadas).toEqual([]);
    expect(gestor.comentariosAplicados).toHaveLength(1);
    expect(avisos.at(-1)).toMatch(/no ofrece una transición a PROBAR/);
  });
});

describe("descartar una tarea con ticket", () => {
  /** Un almacén en memoria con la forma de `TareasEnDisco` (solo lo que el envoltorio toca). */
  const almacen = (tareas: Tarea[]): TareasEnDisco => {
    let lista = tareas;
    return {
      listar: () => lista,
      guardar: (t: readonly Tarea[]) => void (lista = [...t]),
      borrarTarea: (id: string) => void (lista = lista.filter((x) => x.id !== id)),
    } as unknown as TareasEnDisco;
  };

  it("devuelve el ticket al estado de PREPARAR y lo comenta: si no, el sondeo la resucitaría", async () => {
    const gestor = new GestorDeTareasEnMemoria({
      tareas: [{ clave: "KAN-1", titulo: "t", descripcion: "", estado: "En curso", categoria: "en-curso" }],
      transiciones: { "KAN-1": [{ id: "11", nombre: "Por hacer", destino: "Tareas por hacer", categoria: "por-hacer" }, ...TRANSICIONES] },
    });
    const reflejar = crearReflejoEnElGestor({ gestorDe: () => gestor, datosDeCierre: async () => ({ ficheros: [], commits: [] }), anotarAviso: () => {}, motivoDe: String });
    const disco = conReflejoAlGuardar(almacen([tarea("en-proceso", { estados: { preparar: "Tareas por hacer", lanzar: "En curso" } })]), reflejar);
    disco.borrarTarea("t1");
    await reflejar.enCurso();
    expect(gestor.transicionesAplicadas).toEqual([{ clave: "KAN-1", transicion: "11" }]);
    expect(gestor.comentariosAplicados[0]!.texto).toMatch(/descartada en xonecode: el ticket vuelve a «Tareas por hacer»/);
  });

  it("una TERMINADA, o un borrador sin tarea, no tocan el gestor", async () => {
    const gestor = new GestorDeTareasEnMemoria({ transiciones: { "KAN-1": TRANSICIONES } });
    const reflejar = crearReflejoEnElGestor({ gestorDe: () => gestor, datosDeCierre: async () => ({ ficheros: [], commits: [] }), anotarAviso: () => {}, motivoDe: String });
    const disco = conReflejoAlGuardar(almacen([tarea("terminada")]), reflejar);
    disco.borrarTarea("t1");
    disco.borrarTarea("borrador-sin-tarea");
    await reflejar.enCurso();
    expect(gestor.comentariosAplicados).toEqual([]);
    expect(gestor.transicionesAplicadas).toEqual([]);
  });
});
