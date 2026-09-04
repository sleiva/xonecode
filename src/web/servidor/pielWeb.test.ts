import { describe, it, expect } from "vitest";
import { crearPielWeb } from "./pielWeb.js";

describe("pielWeb", () => {
  it("los tokens se solidifican en un acto de asistente al cerrar la línea", () => {
    const { piel, actos } = crearPielWeb();
    piel.token("Hola");
    piel.token(" mundo");
    expect(actos()).toHaveLength(0); // aún es colchón
    piel.cerrarLinea();
    expect(actos()).toEqual([{ tipo: "asistente", texto: "Hola mundo" }]);
  });

  it("las líneas de tool consecutivas van en UN acto de herramientas", () => {
    const { piel, actos } = crearPielWeb();
    piel.linea("read_file  src/app.xne");
    piel.linea("grep  colecciones");
    expect(actos()).toEqual([{ tipo: "herramientas", lineas: ["read_file  src/app.xne", "grep  colecciones"] }]);
  });

  it("el cierre de una racha SUSTITUYE su apertura, no se añade detrás", () => {
    const { piel, actos } = crearPielWeb();
    // Lo que el colapsador del motor emite de verdad para tres lecturas seguidas:
    // la apertura al abrir la racha, y el cierre con el ×N al terminarla.
    piel.linea("→ lee src/app.xne");
    piel.linea("→ lee ×3 — src/app.xne, src/b.xne, src/c.xne");
    expect(actos()).toEqual([
      { tipo: "herramientas", lineas: ["→ lee ×3 — src/app.xne, src/b.xne, src/c.xne"] },
    ]);
  });

  it("una notificación cierra el grupo de herramientas", () => {
    const { piel, actos } = crearPielWeb();
    piel.linea("read_file  src/app.xne");
    piel.notificacion!("⚠ el verificador es de pega");
    piel.linea("grep  colecciones");
    expect(actos().map((a) => a.tipo)).toEqual(["herramientas", "sistema", "herramientas"]);
  });

  it("una pausa lleva la DESCRIPCIÓN del pendiente y jamás el contenido", () => {
    const { piel, actos } = crearPielWeb();
    piel.pausa([{ id: "1", origen: "dev", descripcion: "escribir src/app.xne", decisionesPermitidas: ["si", "no"] }]);
    const acto = actos()[0];
    expect(acto).toMatchObject({ tipo: "sistema" });
    expect(JSON.stringify(acto)).toContain("escribir src/app.xne");
    expect(JSON.stringify(acto)).not.toMatch(/<\?xml|\+\+\+|---/); // ni fichero ni diff
  });

  it("fin cierra el turno con los milisegundos", () => {
    const { piel, actos } = crearPielWeb();
    piel.fin(1234);
    expect(actos()).toEqual([{ tipo: "fin", ms: 1234 }]);
  });

  it("una fase abierta entre dos tools parte el grupo, igual que en la TUI", () => {
    const { piel, actos } = crearPielWeb();
    piel.linea("→ lee /a");
    piel.fase!("verificando");
    piel.linea("→ lee /b");
    expect(actos().map((a) => a.tipo)).toEqual(["herramientas", "fase", "herramientas"]);
    expect(actos()[1]).toMatchObject({ tipo: "fase", texto: "verificando" });
  });

  it("dos fases seguidas sustituyen la activa sin dejar acto de la primera", () => {
    const { piel, actos } = crearPielWeb();
    piel.fase!("planificando");
    piel.fase!("verificando");
    piel.fin(10);
    // Solo un acto de fase: el de "planificando" nunca llegó a contar nada.
    expect(actos()).toEqual([
      { tipo: "fase", texto: "verificando", ms: expect.any(Number) },
      { tipo: "fin", ms: 10 },
    ]);
  });
  /**
   * El contrato de `alActo` que el transporte necesita y que hasta ahora solo estaba
   * escrito en prosa: dispara también cuando el último acto se ACTUALIZA. Un consumidor
   * que anexara a ciegas dejaría en pantalla la apertura de la racha Y su cierre.
   */
  it("alActo avisa también de la ACTUALIZACIÓN del último acto, no solo de las altas", () => {
    const { piel, actos, alActo } = crearPielWeb();
    const avisos: unknown[] = [];
    alActo((a) => avisos.push(a));
    piel.linea("→ lee /a");
    piel.linea("→ lee ×3 — /a");
    // Un solo acto en la lista, pero DOS avisos: el segundo es la sustitución.
    expect(actos()).toEqual([{ tipo: "herramientas", lineas: ["→ lee ×3 — /a"] }]);
    expect(avisos).toHaveLength(2);
    expect(avisos[1]).toEqual({ tipo: "herramientas", lineas: ["→ lee ×3 — /a"] });
  });

  it("el token NO se parte por saltos: la web renderiza markdown y el párrafo va entero", () => {
    const { piel, actos } = crearPielWeb();
    piel.token("- uno\n- dos\n");
    piel.cerrarLinea();
    // El store de la TUI daría tres actos aquí (uno por línea); la web da uno.
    expect(actos()).toEqual([{ tipo: "asistente", texto: "- uno\n- dos\n" }]);
  });
});
