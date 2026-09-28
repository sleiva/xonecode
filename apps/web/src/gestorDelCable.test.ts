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
});
