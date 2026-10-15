import { describe, expect, it } from "vitest";
import { crearSondeoDelGestor, type CopiaConGestor } from "./sondeoDelGestor.js";
import { GestorDeTareasEnMemoria } from "../../core/ports.js";
import type { FichaDelGestor } from "../../core/gestorDeTareas.js";
import type { Tarea } from "../../core/tareas.js";
import { CABECERA_DEL_ENCARGO, comentarioDeEncargo } from "../../core/tareasEnElGestor.js";

const ficha = (clave: string, estado: string, extra: Partial<FichaDelGestor> = {}): FichaDelGestor => ({
  clave,
  titulo: `Título de ${clave}`,
  descripcion: `Descripción de ${clave}`,
  estado,
  categoria: estado === "En curso" ? "en-curso" : "por-hacer",
  asignado: "Sergio",
  ...extra,
});

const COPIA: CopiaConGestor = {
  proyecto: { id: "p1", raiz: "/w/Maset", nombre: "Maset" },
  vinculo: { conector: "jira", sitio: "cloud-1", proyecto: "MAS", automatico: true, estados: { preparar: "Por hacer", lanzar: "En curso", terminar: "Listo" } },
};

function montar(o: { tickets: FichaDelGestor[]; copia?: CopiaConGestor; comentarios?: Record<string, { texto: string; creado: string }[]>; esDueño?: boolean; cola?: Tarea[] }) {
  const gestor = new GestorDeTareasEnMemoria({ tareas: o.tickets, yo: "Sergio", comentarios: o.comentarios ?? {} });
  let cola: Tarea[] = o.cola ?? [];
  let revisadas = 0;
  const aumentadas: string[] = [];
  const sondeo = crearSondeoDelGestor({
    copias: () => [o.copia ?? COPIA],
    gestorDe: () => gestor,
    augmentar: async (p) => {
      aumentadas.push(p.texto);
      return `ENCARGO AMPLIADO de: ${p.texto.split("\n")[0]}`;
    },
    cola: { listar: () => cola, guardar: (t) => void (cola = [...t]) },
    revisar: () => void (revisadas += 1),
    esDueño: () => o.esDueño ?? true,
    motivoDe: (e) => (e as Error).message,
  });
  return { gestor, sondeo, cola: () => cola, revisadas: () => revisadas, aumentadas };
}

describe("el sondeo del gestor (puerta 2)", () => {
  const REVISANDO: CopiaConGestor = { ...COPIA, vinculo: { ...COPIA.vinculo, revisarEncargo: true } };

  it("con «revisar el encargo», PREPARA el de preparar: amplía, lo sube con la cabecera y NO lo lanza ni lo mueve", async () => {
    const { gestor, sondeo, cola, aumentadas } = montar({ tickets: [ficha("MAS-2", "Por hacer")], copia: REVISANDO });
    const r = await sondeo.mirar();
    expect(r.preparadas).toEqual(["MAS-2"]);
    expect(aumentadas[0]).toBe("Título de MAS-2\n\nDescripción de MAS-2");
    expect(gestor.comentariosAplicados[0]!.texto).toContain(CABECERA_DEL_ENCARGO);
    expect(gestor.transicionesAplicadas).toEqual([]);
    expect(cola()).toEqual([]);
  });

  it("SIN revisar (lo de omisión): prepara Y lanza en la misma pasada, con el encargo recién subido", async () => {
    const { gestor, sondeo, cola } = montar({ tickets: [ficha("MAS-2", "Por hacer")] });
    const r = await sondeo.mirar();
    expect(r.preparadas).toEqual(["MAS-2"]);
    expect(r.lanzadas).toEqual(["MAS-2"]);
    expect(gestor.comentariosAplicados).toHaveLength(1);
    expect(cola()[0]!.encargo).toBe("ENCARGO AMPLIADO de: Título de MAS-2");
    // Y no lo vuelve a preparar ni a lanzar en la siguiente.
    const otra = await sondeo.mirar();
    expect([otra.preparadas, otra.lanzadas]).toEqual([[], []]);
  });

  it("SIN revisar, uno de preparar que YA tiene encargo se lanza con él, sin subir otro", async () => {
    const { gestor, sondeo, cola } = montar({
      tickets: [ficha("MAS-2", "Por hacer")],
      comentarios: { "MAS-2": [{ texto: comentarioDeEncargo("El de antes"), creado: "2026-10-15T10:00:00Z" }] },
    });
    expect((await sondeo.mirar()).lanzadas).toEqual(["MAS-2"]);
    expect(gestor.comentariosAplicados).toEqual([]);
    expect(cola()[0]!.encargo).toBe("El de antes");
  });

  it("no vuelve a preparar uno que ya tiene encargo", async () => {
    const { gestor, sondeo } = montar({
      copia: REVISANDO,
      tickets: [ficha("MAS-2", "Por hacer")],
      comentarios: { "MAS-2": [{ texto: comentarioDeEncargo("ya está"), creado: "2026-10-15T10:00:00Z" }] },
    });
    expect((await sondeo.mirar()).preparadas).toEqual([]);
    expect(gestor.comentariosAplicados).toEqual([]);
  });

  it("LANZA el que está en lanzar: tarea con el ÚLTIMO encargo y lo comentado debajo, ligada al ticket con su mapeo", async () => {
    const { sondeo, cola, revisadas } = montar({
      tickets: [ficha("MAS-3", "En curso", { url: "https://x/browse/MAS-3" })],
      comentarios: {
        "MAS-3": [
          { texto: comentarioDeEncargo("Encargo revisado por la persona"), creado: "2026-10-15T10:00:00Z" },
          { texto: "Que el texto vaya en gris", creado: "2026-10-15T11:00:00Z" },
        ],
      },
    });
    const r = await sondeo.mirar();
    expect(r.lanzadas).toEqual(["MAS-3"]);
    const [t] = cola();
    expect(t).toMatchObject({ estado: "nuevo", proyecto: COPIA.proyecto, peticion: "Título de MAS-3\n\nDescripción de MAS-3" });
    expect(t!.encargo).toMatch(/^Encargo revisado por la persona\n\n## Indicaciones añadidas en el ticket\n\n- Que el texto vaya en gris$/);
    expect(t!.ticket).toEqual({ conector: "jira", sitio: "cloud-1", proyecto: "MAS", clave: "MAS-3", url: "https://x/browse/MAS-3", estados: COPIA.vinculo.estados });
    expect(revisadas()).toBe(1);
  });

  it("sin encargo, lanza con el texto del ticket; y no lanza otra si ya tiene tarea", async () => {
    const { sondeo, cola } = montar({ tickets: [ficha("MAS-3", "En curso")] });
    await sondeo.mirar();
    expect(cola()[0]!.encargo).toBe("Título de MAS-3\n\nDescripción de MAS-3");
    expect((await sondeo.mirar()).lanzadas).toEqual([]);
    expect(cola()).toHaveLength(1);
  });

  it("solo los ASIGNADOS a la cuenta del conector", async () => {
    const { sondeo, cola } = montar({ tickets: [ficha("MAS-3", "En curso", { asignado: "Otra persona" })] });
    expect((await sondeo.mirar()).lanzadas).toEqual([]);
    expect(cola()).toEqual([]);
  });

  it("con el disparo APAGADO, o en un proceso que no ejecuta las tareas, no hace nada", async () => {
    const apagado = montar({ tickets: [ficha("MAS-3", "En curso")], copia: { ...COPIA, vinculo: { ...COPIA.vinculo, automatico: false } } });
    expect((await apagado.sondeo.mirar()).lanzadas).toEqual([]);
    const ajeno = montar({ tickets: [ficha("MAS-3", "En curso")], esDueño: false });
    expect((await ajeno.sondeo.mirar()).lanzadas).toEqual([]);
  });

  it("un ticket que falla no para a los demás, y se cuenta", async () => {
    const { gestor, sondeo } = montar({ tickets: [ficha("MAS-2", "Por hacer"), ficha("MAS-3", "En curso")], copia: REVISANDO });
    gestor.comentar = async () => {
      throw new Error("comentarios cerrados");
    };
    const r = await sondeo.mirar();
    expect(r.fallos).toEqual([{ clave: "MAS-2", proyecto: "Maset", motivo: "comentarios cerrados" }]);
    expect(r.lanzadas).toEqual(["MAS-3"]);
  });

  it("dos «Mirar ahora» a la vez son UNA pasada", async () => {
    const { sondeo, cola } = montar({ tickets: [ficha("MAS-3", "En curso")] });
    const [a, b] = await Promise.all([sondeo.mirar(), sondeo.mirar()]);
    expect(a).toBe(b);
    expect(cola()).toHaveLength(1);
  });
});
