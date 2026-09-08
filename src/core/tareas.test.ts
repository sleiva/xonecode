import { describe, expect, it } from "vitest";
import { conEstado, siguientesAEjecutar, tituloDeTarea, type Tarea } from "./tareas.js";

function tarea(extra: Partial<Tarea> = {}): Tarea {
  return {
    id: extra.id ?? "t1",
    proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
    titulo: "Arregla el login",
    peticion: "Arregla el login",
    encargo: "Arregla el login",
    adjuntos: [],
    estado: "nuevo",
    creada: "2026-09-08T10:00:00.000Z",
    ...extra,
  };
}

describe("siguientesAEjecutar", () => {
  it("FIFO por fecha de creación, y nunca más que el tope", () => {
    const lista = [
      tarea({ id: "b", creada: "2026-09-08T10:00:02.000Z", proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } }),
      tarea({ id: "a", creada: "2026-09-08T10:00:01.000Z", proyecto: { id: "pa", raiz: "/w/A", nombre: "A" } }),
      tarea({ id: "c", creada: "2026-09-08T10:00:03.000Z", proyecto: { id: "pc", raiz: "/w/C", nombre: "C" } }),
    ];
    expect(siguientesAEjecutar(lista, { concurrencia: 2 }).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("NUNCA dos del mismo proyecto: comparten disco, git y checkpointer", () => {
    const lista = [
      tarea({ id: "a", creada: "2026-09-08T10:00:01.000Z" }),
      tarea({ id: "b", creada: "2026-09-08T10:00:02.000Z" }),
    ];
    expect(siguientesAEjecutar(lista, { concurrencia: 5 }).map((t) => t.id)).toEqual(["a"]);
  });

  it("las que ya corren gastan hueco Y ocupan su proyecto", () => {
    const lista = [
      tarea({ id: "corriendo", estado: "en-proceso", empezada: "2026-09-08T10:00:00.000Z" }),
      tarea({ id: "mismo", creada: "2026-09-08T10:00:01.000Z" }),
      tarea({ id: "otro", creada: "2026-09-08T10:00:02.000Z", proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } }),
    ];
    expect(siguientesAEjecutar(lista, { concurrencia: 2 }).map((t) => t.id)).toEqual(["otro"]);
    expect(siguientesAEjecutar(lista, { concurrencia: 1 })).toEqual([]);
  });

  it("aparcadas y terminadas no se vuelven a coger solas", () => {
    const lista = [
      tarea({ id: "a", estado: "requiere-atencion", motivo: "una escritura sin aprobar" }),
      tarea({ id: "b", estado: "terminada" }),
    ];
    expect(siguientesAEjecutar(lista, { concurrencia: 2 })).toEqual([]);
  });

  it("un tope de cero no arranca nada: es cómo se pausa la cola entera", () => {
    expect(siguientesAEjecutar([tarea()], { concurrencia: 0 })).toEqual([]);
  });

  it("GANA LA PERSONA: en un proyecto bloqueado no arranca nada, y el hueco lo coge otro", () => {
    // Una tarea y una persona sobre el mismo árbol no tienen aislamiento de ninguna clase:
    // se pisan las ediciones y la foto por turno de `instantanea.ts` le atribuiría a la
    // persona lo que escribió el agente. Y el hueco NO se desperdicia: la siguiente de otro
    // proyecto entra, o una tarea esperando a que alguien cierre una pestaña pararía la cola
    // entera.
    const lista = [
      tarea({ id: "a", creada: "2026-09-08T10:00:01.000Z" }),
      tarea({ id: "b", creada: "2026-09-08T10:00:02.000Z", proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } }),
    ];
    expect(siguientesAEjecutar(lista, { concurrencia: 2, bloqueados: ["/w/AppDemo"] }).map((t) => t.id)).toEqual(["b"]);
    // Y sin bloqueados, ausente vale lo mismo que la lista vacía: no hay nada que bloquear.
    expect(siguientesAEjecutar(lista, { concurrencia: 2, bloqueados: [] }).map((t) => t.id)).toEqual(["a", "b"]);
    expect(siguientesAEjecutar(lista, { concurrencia: 2 }).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("un proyecto bloqueado NO gasta hueco de concurrencia: no está corriendo nada", () => {
    // La cuenta de huecos es de lo que CORRE. Descontar lo bloqueado dejaría la cola sin
    // arrancar nada con el tope a uno y una pestaña abierta en otro proyecto.
    const lista = [
      tarea({ id: "a", creada: "2026-09-08T10:00:01.000Z" }),
      tarea({ id: "b", creada: "2026-09-08T10:00:02.000Z", proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } }),
    ];
    expect(siguientesAEjecutar(lista, { concurrencia: 1, bloqueados: ["/w/AppDemo"] }).map((t) => t.id)).toEqual(["b"]);
  });
});

describe("conEstado", () => {
  it("aparcar EXIGE motivo: «requiere atención» sin decir por qué no es accionable", () => {
    expect(() => conEstado(tarea({ estado: "en-proceso" }), "requiere-atencion")).toThrow(/motivo/i);
    const aparcada = conEstado(tarea({ estado: "en-proceso" }), "requiere-atencion", "la consola se cerró a mitad");
    expect(aparcada).toMatchObject({ estado: "requiere-atencion", motivo: "la consola se cerró a mitad" });
  });

  it("MEDIDO: una tarea que nunca arrancó SE PUEDE aparcar, y hace falta que se pueda", () => {
    /**
     * Su proyecto ya no está donde dice —la carpeta se movió— así que no se puede ni abrir
     * la consola: nunca pasa por `en-proceso`. Sin esta transición, `conEstado` LANZA, la
     * tarea se queda en `nuevo` y el corredor la vuelve a elegir en la siguiente pasada…
     * que él mismo dispara al acabar cada tarea. Medido: no es un error que se lee, es un
     * lazo caliente que se come una CPU sin decir nada.
     */
    const sinArrancar = tarea();
    expect(conEstado(sinArrancar, "requiere-atencion", "no se pudo abrir el proyecto")).toMatchObject({
      estado: "requiere-atencion",
      motivo: "no se pudo abrir el proyecto",
    });
    // Y sigue exigiendo motivo: aparcar sin decir por qué no es accionable.
    expect(() => conEstado(sinArrancar, "requiere-atencion")).toThrow(/motivo/i);
    // Lo que NO se abre es el atajo: de `nuevo` no se salta a `terminada` sin correr nada.
    expect(() => conEstado(sinArrancar, "terminada")).toThrow();
  });

  it("una transición imposible se rechaza: un estado inventado en disco es peor de depurar", () => {
    expect(() => conEstado(tarea({ estado: "terminada" }), "en-proceso")).toThrow(/terminada/);
    expect(() => conEstado(tarea({ estado: "nuevo" }), "terminada")).toThrow();
  });

  it("reintentar y dar por bueno son las dos salidas de «requiere atención»", () => {
    const aparcada = tarea({ estado: "requiere-atencion", motivo: "x" });
    expect(conEstado(aparcada, "nuevo").estado).toBe("nuevo");
    expect(conEstado(aparcada, "terminada").estado).toBe("terminada");
    // Y al reintentar el motivo se va: dejarlo pegado enseñaría un problema ya resuelto.
    expect(conEstado(aparcada, "nuevo").motivo).toBeUndefined();
  });

  it("empezar sella el pid y la hora; acabar sella la hora", () => {
    const empezada = conEstado(tarea(), "en-proceso", undefined, { pid: 42, ahora: "2026-09-08T11:00:00.000Z" });
    expect(empezada).toMatchObject({ estado: "en-proceso", pid: 42, empezada: "2026-09-08T11:00:00.000Z" });
    const acabada = conEstado(empezada, "terminada", undefined, { ahora: "2026-09-08T11:05:00.000Z" });
    expect(acabada.acabada).toBe("2026-09-08T11:05:00.000Z");
    // El pid se va al dejar de correr: un pid pegado a una tarea parada haría creer que vive.
    expect(acabada.pid).toBeUndefined();
  });
});

describe("tituloDeTarea", () => {
  it("es la primera frase de la petición, como el de una sesión", () => {
    expect(tituloDeTarea("Arregla el login. Y de paso el menú.")).toBe("Arregla el login");
  });
});
