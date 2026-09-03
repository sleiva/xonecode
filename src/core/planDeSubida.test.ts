import { describe, expect, it } from "vitest";
import { planDeSubida, TOPE_BASE64 } from "./planDeSubida.js";

const base = {
  descargados: new Set(["app.xml", "BuscarFarmacias.xne", "icons/icon_check.svg", "AlquilerCoches.js"]),
  tamanos: new Map<string, number>(),
};

describe("planDeSubida", () => {
  it("traduce el diff a operaciones por tipo", () => {
    expect(planDeSubida({
      ...base,
      cambios: [
        { clase: "modificado", ruta: "BuscarFarmacias.xne" },
        { clase: "nuevo", ruta: "icons/icon_nuevo.png" },
      ],
      tamanos: new Map([["icons/icon_nuevo.png", 1024]]),
    })).toEqual([
      { tipo: "texto", ruta: "BuscarFarmacias.xne" },
      { tipo: "binario", ruta: "icons/icon_nuevo.png", bytes: 1024, modo: "base64" },
    ]);
  });

  it("un binario por encima del tope va en trozos", () => {
    const plan = planDeSubida({
      ...base,
      cambios: [{ clase: "nuevo", ruta: "bd/gestion.db" }],
      tamanos: new Map([["bd/gestion.db", TOPE_BASE64 + 1]]),
    });
    expect(plan).toEqual([
      { tipo: "binario", ruta: "bd/gestion.db", bytes: TOPE_BASE64 + 1, modo: "chunked" },
    ]);
  });

  it("EL CANDADO: no borra lo que nunca se pudo bajar", () => {
    // Copia parcial: las fuentes no se descargaron, así que git las ve como borradas.
    const plan = planDeSubida({
      descargados: new Set(["app.xml"]),
      tamanos: new Map(),
      cambios: [
        { clase: "borrado", ruta: "fonts/PlusJakartaSans-Bold.ttf" },
        { clase: "borrado", ruta: "app.xml" },
      ],
    });
    expect(plan).toEqual([{ tipo: "borrado", ruta: "app.xml" }]);
  });

  it("nunca sube nada de .xonecode, ni siquiera si alguien lo commiteó", () => {
    expect(planDeSubida({
      ...base,
      descargados: new Set(["app.xml", ".xonecode/memoria.md"]),
      cambios: [
        { clase: "nuevo", ruta: ".xonecode/memoria.md" },
        { clase: "modificado", ruta: ".xonecode/cloudstudio/sync.json" },
        { clase: "borrado", ruta: ".xonecode/sesiones/a.json" },
      ],
    })).toEqual([]);
  });

  it("excluye la vista aplanada cuando existe su .xne, y conserva app.xml", () => {
    expect(planDeSubida({
      ...base,
      cambios: [
        { clase: "modificado", ruta: "BuscarFarmacias.xml" },
        { clase: "modificado", ruta: "app.xml" },
      ],
      fuentesXne: new Set(["BuscarFarmacias.xne"]),
    })).toEqual([{ tipo: "texto", ruta: "app.xml" }]);
  });

  it("un binario sin tamaño conocido no se inventa: se omite y se declara", () => {
    const plan = planDeSubida({
      ...base,
      cambios: [{ clase: "nuevo", ruta: "icons/sin_tamano.png" }],
    });
    expect(plan).toEqual([]);
  });
});
