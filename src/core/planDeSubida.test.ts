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
    })).toEqual({
      operaciones: [
        { tipo: "texto", ruta: "BuscarFarmacias.xne" },
        { tipo: "binario", ruta: "icons/icon_nuevo.png", bytes: 1024, modo: "base64" },
      ],
      omitidas: [],
    });
  });

  it("un binario por encima del tope es IMPOSIBLE, no pendiente: sale del plan y se declara", () => {
    // El modo `chunked` nunca se ejecutó: `CloudStudioPort.subirBinario` ni lleva el modo
    // y el adaptador manda siempre base64. Dejar la operación en el plan la hacía fallar
    // contra el servidor, y como la ref solo avanza con `fallos` vacío, el siguiente
    // `/sync` recalculaba el MISMO plan: `/sync subir` inútil de forma PERMANENTE.
    const plan = planDeSubida({
      ...base,
      cambios: [{ clase: "nuevo", ruta: "bd/gestion.db" }],
      tamanos: new Map([["bd/gestion.db", TOPE_BASE64 + 1]]),
    });
    expect(plan.operaciones).toEqual([]);
    expect(plan.omitidas).toHaveLength(1);
    expect(plan.omitidas[0]!.ruta).toBe("bd/gestion.db");
    // El motivo tiene que ser accionable: qué hacer, no solo que no se hizo.
    expect(plan.omitidas[0]!.motivo).toMatch(/troceado no está implementado/);
    expect(plan.omitidas[0]!.motivo).toMatch(/Studio/);
  });

  it("el binario que cabe JUSTO en el tope sí sube", () => {
    // El límite exacto: `> TOPE_BASE64`, no `>=`. Un test solo por encima del tope no
    // distinguiría una comparación de la otra.
    const plan = planDeSubida({
      ...base,
      cambios: [{ clase: "nuevo", ruta: "bd/justo.db" }],
      tamanos: new Map([["bd/justo.db", TOPE_BASE64]]),
    });
    expect(plan.operaciones).toEqual([
      { tipo: "binario", ruta: "bd/justo.db", bytes: TOPE_BASE64, modo: "base64" },
    ]);
    expect(plan.omitidas).toEqual([]);
  });

  it("el borrado de un BINARIO es imposible: el servidor solo borra texto", () => {
    // `borrarTexto` es `studio_edit_file` en modo `delete`, una tool de TEXTO. Un icono
    // borrado en local no se puede propagar por MCP, y dejarlo en el plan atascaba la
    // subida entera: la primera imagen borrada dejaba `/sync subir` inútil para siempre.
    const plan = planDeSubida({
      descargados: new Set(["app.xml", "icons/viejo.png"]),
      tamanos: new Map(),
      cambios: [
        { clase: "borrado", ruta: "icons/viejo.png" },
        { clase: "borrado", ruta: "app.xml" },
      ],
    });
    // El de texto SÍ pasa: la escapatoria saca la imposible, no bloquea el resto.
    expect(plan.operaciones).toEqual([{ tipo: "borrado", ruta: "app.xml" }]);
    expect(plan.omitidas).toEqual([
      { ruta: "icons/viejo.png", motivo: expect.stringMatching(/no borra binarios/) },
    ]);
  });

  it("EL CANDADO: no borra lo que nunca se pudo bajar, y lo declara", () => {
    // Copia parcial: las fuentes no se descargaron, así que git las ve como borradas.
    const plan = planDeSubida({
      descargados: new Set(["app.xml"]),
      tamanos: new Map(),
      cambios: [
        { clase: "borrado", ruta: "fonts/PlusJakartaSans-Bold.ttf" },
        { clase: "borrado", ruta: "app.xml" },
      ],
    });
    expect(plan.operaciones).toEqual([{ tipo: "borrado", ruta: "app.xml" }]);
    expect(plan.omitidas).toEqual([
      { ruta: "fonts/PlusJakartaSans-Bold.ttf", motivo: expect.stringMatching(/no consta descargado/) },
    ]);
  });

  it("nunca sube nada de .xonecode, ni siquiera si alguien lo commiteó (y sin ruido)", () => {
    // La carpeta del harness no es «algo que no se pudo subir»: es algo que no se sube
    // NUNCA. Declararla sería ruido en cada `/sync`, así que no entra ni en `omitidas`.
    expect(planDeSubida({
      ...base,
      descargados: new Set(["app.xml", ".xonecode/memoria.md"]),
      cambios: [
        { clase: "nuevo", ruta: ".xonecode/memoria.md" },
        { clase: "modificado", ruta: ".xonecode/cloudstudio/sync.json" },
        { clase: "borrado", ruta: ".xonecode/sesiones/a.json" },
      ],
    })).toEqual({ operaciones: [], omitidas: [] });
  });

  it("excluye la vista aplanada cuando existe su .xne, y conserva app.xml", () => {
    expect(planDeSubida({
      ...base,
      cambios: [
        { clase: "modificado", ruta: "BuscarFarmacias.xml" },
        { clase: "modificado", ruta: "app.xml" },
      ],
      fuentesXne: new Set(["BuscarFarmacias.xne"]),
    })).toEqual({ operaciones: [{ tipo: "texto", ruta: "app.xml" }], omitidas: [] });
  });

  it("un binario sin tamaño conocido no se inventa: se omite Y SE DECLARA", () => {
    // El test anterior solo afirmaba la omisión, que es la mitad que una implementación
    // ingenua ya cumple con un `continue` mudo. Lo que hace falta es que el porqué llegue
    // a quien ejecuta: es lo único que convierte «no pasó nada» en «esto quedó fuera».
    const plan = planDeSubida({
      ...base,
      cambios: [{ clase: "nuevo", ruta: "icons/sin_tamano.png" }],
    });
    expect(plan.operaciones).toEqual([]);
    expect(plan.omitidas).toEqual([
      { ruta: "icons/sin_tamano.png", motivo: expect.stringMatching(/tamaño/) },
    ]);
  });

  it("reconoce la vista aplanada sin importar la mayúscula de la extensión", () => {
    // Bug mudo si esto falla: un `Foo.XML` viejo se subiría junto al `.xne` nuevo y
    // dejaría el proyecto del cliente incoherente sin ningún aviso de XOne.
    expect(planDeSubida({
      ...base,
      cambios: [{ clase: "modificado", ruta: "Foo.XML" }],
      fuentesXne: new Set(["Foo.xne"]),
    })).toEqual({ operaciones: [], omitidas: [] });
  });
});
