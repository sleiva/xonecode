import { describe, expect, it } from "vitest";
import { leerGestorDelCable } from "./gestorDelCable.js";

describe("leerGestorDelCable", () => {
  it("copia cada campo con forma y deja fuera el que no la tiene, sin tirar los demás", () => {
    expect(
      leerGestorDelCable({
        clase: "gestor",
        estado: { conectores: ["jira", 3], vinculo: { conector: "jira", sitio: "s1", proyecto: "IXCODE", colado: 1 } },
        sitios: { conector: "jira", lista: [{ id: "s1", nombre: "xone" }, { id: 2 }] },
        proyectos: { sitio: "s1", lista: [{ clave: "IXCODE", nombre: "XOneCode" }, { clave: "X" }] },
        borrador: { clave: "IXCODE-12" },
        error: { accion: "pendientes", motivo: "no contesta" },
      })
    ).toEqual({
      estado: { conectores: ["jira"], vinculo: { conector: "jira", sitio: "s1", proyecto: "IXCODE" } },
      sitios: { conector: "jira", lista: [{ id: "s1", nombre: "xone" }] },
      proyectos: { sitio: "s1", lista: [{ clave: "IXCODE", nombre: "XOneCode" }] },
      error: { accion: "pendientes", motivo: "no contesta" },
    });
  });

  it("pendientes: `mias` solo con el `true` literal; ficha: clave y descripción, y nada más", () => {
    expect(leerGestorDelCable({ pendientes: { cuando: 1, mias: true, lista: [] } })).toEqual({ pendientes: { cuando: 1, mias: true, lista: [] } });
    expect(leerGestorDelCable({ pendientes: { cuando: 1, mias: "sí", lista: [] } })).toEqual({ pendientes: { cuando: 1, lista: [] } });
    expect(leerGestorDelCable({ pendientes: { cuando: 1, mias: false, lista: [] } })).toEqual({ pendientes: { cuando: 1, lista: [] } });
    expect(
      leerGestorDelCable({ ficha: { clave: "IXCODE-12", descripcion: "**hola**", asignado: { emailAddress: "a@b.es" }, colado: 1 } })
    ).toEqual({ ficha: { clave: "IXCODE-12", descripcion: "**hola**" } });
    expect(leerGestorDelCable({ ficha: { clave: "IXCODE-12" } })).toEqual({});
    // El error de `ficha` lleva la clave (solo como texto).
    expect(leerGestorDelCable({ error: { accion: "ficha", motivo: "x", clave: "IXCODE-12" } })).toEqual({ error: { accion: "ficha", motivo: "x", clave: "IXCODE-12" } });
    expect(leerGestorDelCable({ error: { accion: "ficha", motivo: "x", clave: 3 } })).toEqual({ error: { accion: "ficha", motivo: "x" } });
  });

  it("un vínculo ilegible NO se lee como «sin vínculo»: el estado entero se descarta", () => {
    expect(leerGestorDelCable({ estado: { conectores: [], vinculo: { conector: "jira" } } })).toEqual({});
    expect(leerGestorDelCable({ estado: { conectores: [] } })).toEqual({ estado: { conectores: [] } });
  });

  it("NUNCA deja pasar un correo: ni suelto en la tarea ni dentro de un asignado con la forma de Jira", () => {
    const leido = leerGestorDelCable({
      pendientes: {
        cuando: 7,
        texto: "menú",
        lista: [
          {
            clave: "IXCODE-12",
            titulo: "Menú lateral",
            estado: "Por hacer",
            categoria: "por-hacer",
            asignado: { displayName: "Ana", emailAddress: "ana@xone.es", accountId: "a1" },
            emailAddress: "ana@xone.es",
            url: "https://xone.atlassian.net/browse/IXCODE-12",
          },
          { clave: "IXCODE-13", titulo: "Login", estado: "En curso", categoria: "en-curso", asignado: "Luis", url: "javascript:alert(1)" },
          { clave: "IXCODE-14", titulo: "Rara", estado: "?", categoria: "otra" },
        ],
      },
    });
    expect(leido).toEqual({
      pendientes: {
        cuando: 7,
        texto: "menú",
        lista: [
          { clave: "IXCODE-12", titulo: "Menú lateral", estado: "Por hacer", categoria: "por-hacer", url: "https://xone.atlassian.net/browse/IXCODE-12" },
          { clave: "IXCODE-13", titulo: "Login", estado: "En curso", categoria: "en-curso", asignado: "Luis" },
        ],
      },
    });
    expect(JSON.stringify(leido)).not.toMatch(/emailAddress|@/);
  });

  it("lo que no es un objeto no afirma nada", () => {
    expect(leerGestorDelCable(undefined)).toEqual({});
    expect(leerGestorDelCable({ pendientes: { cuando: "ayer", lista: [] } })).toEqual({});
  });

  /** Task 11 (IXCODE-11): las tres respuestas de las tarjetas que escriben en Jira. */
  it("transiciones: copia la lista, deja fuera la que no tiene forma, y solo con `para` reconocido", () => {
    expect(
      leerGestorDelCable({
        transiciones: {
          clave: "IXCODE-12",
          para: "empezar",
          propuesta: "11",
          lista: [
            { id: "11", nombre: "Empezar a hacer", destino: "EN CURSO", categoria: "en-curso" },
            { id: "22", nombre: "Mal", destino: "X" },
          ],
        },
      })
    ).toEqual({
      transiciones: {
        clave: "IXCODE-12",
        para: "empezar",
        propuesta: "11",
        lista: [{ id: "11", nombre: "Empezar a hacer", destino: "EN CURSO", categoria: "en-curso" }],
      },
    });
    expect(leerGestorDelCable({ transiciones: { clave: "IXCODE-12", para: "otra", lista: [] } })).toEqual({});
  });

  it("cierre: la clave y el comentario propuesto, tal cual", () => {
    expect(leerGestorDelCable({ cierre: { clave: "IXCODE-12", comentario: "Hecho." } })).toEqual({
      cierre: { clave: "IXCODE-12", comentario: "Hecho." },
    });
    expect(leerGestorDelCable({ cierre: { clave: "IXCODE-12" } })).toEqual({});
  });

  it("cerrado: la transición viaja SOLO si es texto, `comento` es obligatorio", () => {
    expect(leerGestorDelCable({ cerrado: { clave: "IXCODE-12", comento: true, transicion: "31" } })).toEqual({
      cerrado: { clave: "IXCODE-12", comento: true, transicion: "31" },
    });
    expect(leerGestorDelCable({ cerrado: { clave: "IXCODE-12", comento: true } })).toEqual({
      cerrado: { clave: "IXCODE-12", comento: true },
    });
    expect(leerGestorDelCable({ cerrado: { clave: "IXCODE-12" } })).toEqual({});
  });

  it("cerrado: `falloDeTransicion` viaja si es texto (el comentario sí se escribió; la transición no)", () => {
    expect(leerGestorDelCable({ cerrado: { clave: "IXCODE-12", comento: true, falloDeTransicion: "no disponible" } })).toEqual({
      cerrado: { clave: "IXCODE-12", comento: true, falloDeTransicion: "no disponible" },
    });
    expect(leerGestorDelCable({ cerrado: { clave: "IXCODE-12", comento: true, falloDeTransicion: 3 } })).toEqual({
      cerrado: { clave: "IXCODE-12", comento: true },
    });
  });

  describe("IXCODE-15: Notion", () => {
    const ESQUEMA = {
      proyecto: "collection://ea517d0b-bf30-4b08-8681-dc9c30f5e783",
      nombre: "Tasks",
      estado: { propiedad: "Status", opciones: [{ nombre: "Not started", categoria: "por-hacer" }, { nombre: "Done", categoria: "terminada" }] },
      titulo: "Name",
      asignado: "Assigned",
    };

    it("estado: `admiteMias` solo como booleano, y el vínculo con su `nombreDelProyecto`", () => {
      const vinculo = { conector: "notion", sitio: "notion", proyecto: ESQUEMA.proyecto, nombreDelProyecto: "Tasks" };
      expect(leerGestorDelCable({ estado: { conectores: ["notion"], vinculo, admiteMias: false } })).toEqual({
        estado: { conectores: ["notion"], vinculo, admiteMias: false },
      });
      expect(leerGestorDelCable({ estado: { conectores: [], admiteMias: "sí" } })).toEqual({ estado: { conectores: [] } });
      expect(leerGestorDelCable({ estado: { conectores: [], vinculo: { ...vinculo, nombreDelProyecto: 3 } } })?.estado?.vinculo).toEqual({
        conector: "notion", sitio: "notion", proyecto: ESQUEMA.proyecto,
      });
    });

    it("una tarea lleva su `etiqueta` solo como texto", () => {
      const t = { clave: "087e117f-9478-4c60-871d-b5d76c2a7e30", titulo: "x", estado: "Not started", categoria: "por-hacer" };
      expect(leerGestorDelCable({ pendientes: { cuando: 1, lista: [{ ...t, etiqueta: "087e117f" }, { ...t, etiqueta: 8 }] } })?.pendientes?.lista).toEqual([
        { ...t, etiqueta: "087e117f" },
        t,
      ]);
    });

    it("busqueda: copia proyecto, nombre y ruta; lo que no tiene forma se queda fuera", () => {
      expect(
        leerGestorDelCable({
          busqueda: { conector: "notion", texto: "task", lista: [{ proyecto: "b1", nombre: "Tasks", ruta: "A / B", url: "x" }, { proyecto: "b2", nombre: "Otra", ruta: 3 }, { nombre: "sin id" }] },
        })
      ).toEqual({ busqueda: { conector: "notion", texto: "task", lista: [{ proyecto: "b1", nombre: "Tasks", ruta: "A / B" }, { proyecto: "b2", nombre: "Otra" }] } });
      expect(leerGestorDelCable({ busqueda: { conector: "notion", lista: [] } })).toEqual({});
    });

    it("descripcion: o el esquema ENTERO o el motivo; a medias, o los dos, se descarta", () => {
      expect(leerGestorDelCable({ descripcion: { conector: "notion", pedido: "b1", esquema: { ...ESQUEMA, fuentes: 2, colado: 1 } } })).toEqual({
        descripcion: { conector: "notion", pedido: "b1", esquema: { ...ESQUEMA, fuentes: 2 } },
      });
      expect(leerGestorDelCable({ descripcion: { conector: "notion", pedido: "b1", motivo: "esta base no tiene una propiedad de estado" } })).toEqual({
        descripcion: { conector: "notion", pedido: "b1", motivo: "esta base no tiene una propiedad de estado" },
      });
      const { asignado: _a, ...sinPersona } = ESQUEMA;
      expect(leerGestorDelCable({ descripcion: { conector: "notion", pedido: "b1", esquema: sinPersona } })?.descripcion).toEqual({ conector: "notion", pedido: "b1", esquema: sinPersona });
      // A medias: una opción con categoría desconocida, o sin propiedad de estado.
      const opcionRara = { ...ESQUEMA, estado: { propiedad: "Status", opciones: [{ nombre: "X", categoria: "rara" }] } };
      expect(leerGestorDelCable({ descripcion: { conector: "notion", pedido: "b1", esquema: opcionRara } })).toEqual({});
      expect(leerGestorDelCable({ descripcion: { conector: "notion", pedido: "b1", esquema: { ...ESQUEMA, estado: { opciones: [] } } } })).toEqual({});
      expect(leerGestorDelCable({ descripcion: { conector: "notion", pedido: "b1", esquema: ESQUEMA, motivo: "x" } })).toEqual({});
      expect(leerGestorDelCable({ descripcion: { conector: "notion", pedido: "b1" } })).toEqual({});
    });
  });
});
