import { describe, it, expect } from "vitest";
import { crearPielWeb } from "./pielWeb.js";

describe("pielWeb", () => {
  /**
   * El texto del asistente se ENSEÑA mientras llega. Antes se guardaba entero en el colchón
   * y no salía hasta `cerrarLinea`: la respuesta aparecía de golpe tras segundos de pantalla
   * quieta, con el modelo escribiendo y nadie viéndolo.
   */
  it("los tokens se enseñan mientras llegan, sustituyendo el mismo acto", () => {
    // El reloj entra por parámetro: el ritmo de los parciales no puede depender de lo que
    // tarde la máquina que corre los tests.
    let t = 0;
    const { piel, actos } = crearPielWeb(() => t);
    piel.token("Hola");
    // El PRIMER token ya sale: es lo que convierte «no pasa nada» en «está escribiendo».
    expect(actos()).toEqual([{ tipo: "asistente", texto: "Hola" }]);
    piel.token(" mundo");
    // Dentro de la ventana de 80 ms no se emite otra vez —cada emisión manda el acto
    // entero—, así que el acto sigue siendo uno solo.
    expect(actos()).toHaveLength(1);
    t = 100;
    piel.token(" y más");
    expect(actos()).toEqual([{ tipo: "asistente", texto: "Hola mundo y más" }]);

    piel.cerrarLinea();
    // Y el cierre siempre entra, haya pasado el plazo o no: es el trozo que completa la
    // frase.
    expect(actos()).toEqual([{ tipo: "asistente", texto: "Hola mundo y más" }]);
    expect(actos()).toHaveLength(1);
  });

  it("dos mensajes seguidos son dos actos: el segundo no sustituye al primero", () => {
    let t = 0;
    const { piel, actos } = crearPielWeb(() => t);
    piel.token("uno");
    piel.cerrarLinea();
    piel.token("dos");
    piel.cerrarLinea();
    expect(actos()).toEqual([
      { tipo: "asistente", texto: "uno" },
      { tipo: "asistente", texto: "dos" },
    ]);
  });

  it("un `cerrarLinea` sin texto no deja el parcial abierto para el mensaje siguiente", () => {
    let t = 0;
    const { piel, actos } = crearPielWeb(() => t);
    piel.token("uno");
    piel.cerrarLinea();
    piel.cerrarLinea(); // sin nada nuevo: no debe cambiar el estado
    piel.token("dos");
    piel.cerrarLinea();
    expect(actos()).toHaveLength(2);
  });

  /**
   * El razonamiento va en su PROPIO acto: no es la respuesta, y mezclarlo con ella es lo
   * que hacía el `String(content)` que el puente dejó de usar.
   */
  it("el razonamiento es su propio acto, con el mismo goteo que la respuesta", () => {
    let t = 0;
    const { piel, actos } = crearPielWeb(() => t);
    piel.razonamiento!("Primero ");
    expect(actos()).toEqual([{ tipo: "razonamiento", texto: "Primero " }]);
    piel.razonamiento!("miro el fichero");
    // Dentro de la ventana no se reemite, pero el texto se acumula.
    t = 100;
    piel.razonamiento!(".");
    expect(actos()).toEqual([{ tipo: "razonamiento", texto: "Primero miro el fichero." }]);

    // Y la respuesta va detrás, en su acto, sin arrastrar lo pensado.
    piel.token("Hecho");
    piel.cerrarLinea();
    expect(actos()).toEqual([
      { tipo: "razonamiento", texto: "Primero miro el fichero." },
      { tipo: "asistente", texto: "Hecho" },
    ]);
  });

  it("un acto por medio corta el razonamiento: el bloque siguiente empieza de cero", () => {
    let t = 0;
    const { piel, actos } = crearPielWeb(() => t);
    piel.razonamiento!("pienso una cosa");
    piel.linea("read_file  src/app.xne");
    piel.razonamiento!("y otra");
    expect(actos()).toEqual([
      { tipo: "razonamiento", texto: "pienso una cosa" },
      { tipo: "herramientas", lineas: ["read_file  src/app.xne"] },
      // «y otra», no «pienso una cosay otra»: entre medias pasó algo.
      { tipo: "razonamiento", texto: "y otra" },
    ]);
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
