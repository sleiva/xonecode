import { describe, it, expect } from "vitest";
import type { ConsumoDeTurno } from "../../core/actos.js";
import { crearPielWeb } from "./pielWeb.js";
import { correrTurno } from "../../core/turno.js";
import type { DomainEvent } from "../../core/events.js";

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
  it("el resumen de contexto es un acto de SISTEMA con su clase, y su último trozo no se pierde", () => {
    let t = 0;
    const { piel, actos } = crearPielWeb(() => t);
    piel.resumen!("## Resumen\n");
    expect(actos()).toEqual([{ tipo: "sistema", texto: "## Resumen\n", clase: "resumen" }]);
    // Dentro de la ventana no se reemite…
    piel.resumen!("- hecho A");
    // …y aun así el acto siguiente lo vuelca ENTERO antes de entrar: si no, el final del
    // resumen se quedaba fuera cuando la respuesta empezaba en menos de 80 ms.
    piel.token("Sigo");
    piel.cerrarLinea();
    expect(actos()).toEqual([
      { tipo: "sistema", texto: "## Resumen\n- hecho A", clase: "resumen" },
      { tipo: "asistente", texto: "Sigo" },
    ]);
  });

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
      { tipo: "herramientas", lineas: ["read_file  src/app.xne"], detalles: [{}] },
      // «y otra», no «pienso una cosay otra»: entre medias pasó algo.
      { tipo: "razonamiento", texto: "y otra" },
    ]);
  });

  it("cada línea guarda de QUÉ tool es, y las que no son de ninguna lo dicen callando", () => {
    // El motor manda el detalle solo en las líneas de tool: por `linea` pasan también el
    // plan, las tareas y la verificación. El objeto VACÍO no es un hueco — mantiene la
    // lista alineada con la de líneas, que es lo que permite leer `detalles[i]` sin contar.
    const { piel, actos } = crearPielWeb();
    piel.linea("→ lee app.xne", { nombre: "read_file" });
    piel.linea("✗ busca x: ENOENT", { nombre: "grep", error: "ENOENT" });
    piel.linea("📋 plan de 2 tarea(s):");
    const acto = actos()[0];
    expect(acto).toMatchObject({
      tipo: "herramientas",
      detalles: [{ nombre: "read_file" }, { nombre: "grep", error: "ENOENT" }, {}],
    });
  });

  it("las líneas de tool consecutivas van en UN acto de herramientas", () => {
    const { piel, actos } = crearPielWeb();
    piel.linea("read_file  src/app.xne");
    piel.linea("grep  colecciones");
    expect(actos()).toEqual([
      {
        tipo: "herramientas",
        lineas: ["read_file  src/app.xne", "grep  colecciones"],
        detalles: [{}, {}],
      },
    ]);
  });

  it("el cierre de una racha SUSTITUYE su apertura, no se añade detrás", () => {
    const { piel, actos } = crearPielWeb();
    // Lo que el colapsador del motor emite de verdad para tres lecturas seguidas:
    // la apertura al abrir la racha, y el cierre con el ×N al terminarla.
    piel.linea("→ lee src/app.xne");
    piel.linea("→ lee ×3 — src/app.xne, src/b.xne, src/c.xne");
    expect(actos()).toEqual([
      { tipo: "herramientas", lineas: ["→ lee ×3 — src/app.xne, src/b.xne, src/c.xne"], detalles: [{}] },
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
    expect(actos()).toEqual([{ tipo: "herramientas", lineas: ["→ lee ×3 — /a"], detalles: [{}] }]);
    expect(avisos).toHaveLength(2);
    expect(avisos[1]).toEqual({ tipo: "herramientas", lineas: ["→ lee ×3 — /a"], detalles: [{}] });
  });

  it("el token NO se parte por saltos: la web renderiza markdown y el párrafo va entero", () => {
    const { piel, actos } = crearPielWeb();
    piel.token("- uno\n- dos\n");
    piel.cerrarLinea();
    // El store de la TUI daría tres actos aquí (uno por línea); la web da uno.
    expect(actos()).toEqual([{ tipo: "asistente", texto: "- uno\n- dos\n" }]);
  });
});

/**
 * El coste del turno, que es lo que hace que los totales de una conversación sobrevivan a
 * cerrarla y reabrirla.
 *
 * La aritmética es una RESTA y por eso tiene sus propios casos: contra qué se resta, qué
 * pasa en el primer `fin` de un proceso, y qué NO se estampa cuando no hay nada que decir.
 * Una resta mal llevada aquí no rompe nada visible —el número vivo de la pantalla lo pone
 * otro camino— y solo se nota al reabrir, que es dentro de tres días.
 */
describe("pielWeb: el coste del turno en el `fin`", () => {
  const cuenta = (entrada: number, salida: number, cache = 0) => ({ entrada, salida, cache });
  /** Un lector de acumulados que se mueve a mano, como se mueve el tracker de verdad. */
  const lector = () => {
    let actual: ConsumoDeTurno | undefined;
    return {
      pon: (c: ConsumoDeTurno | undefined) => {
        actual = c;
      },
      lee: () => actual,
    };
  };
  const acumulado = (entrada: number, salida: number, cache = 0): ConsumoDeTurno => ({
    modelo: cuenta(entrada, salida, cache),
    externo: cuenta(0, 0),
  });

  it("estampa el DELTA, no el acumulado: es lo único que suma bien entre procesos", () => {
    // El acumulado de cada arranque empieza en cero. Guardarlo tal cual haría que reabrir
    // tres veces contara tres veces lo mismo; los deltas suman igual cerrada que abierta.
    const l = lector();
    const { piel, actos } = crearPielWeb(() => 0, l.lee);
    l.pon(acumulado(100, 10));
    piel.fin(5);
    l.pon(acumulado(150, 12, 40));
    piel.fin(5);
    expect(actos()).toEqual([
      { tipo: "fin", ms: 5, consumo: { modelo: cuenta(100, 10), externo: cuenta(0, 0) } },
      { tipo: "fin", ms: 5, consumo: { modelo: cuenta(50, 2, 40), externo: cuenta(0, 0) } },
    ]);
  });

  it("el primer `fin` de un proceso estampa lo acumulado ENTERO", () => {
    // No se resta contra ceros por comodidad: hasta aquí no había ningún `fin` en este
    // proceso, así que todo lo acumulado es de este turno. Es exactamente el caso de una
    // sesión reabierta en la que el tracker empieza de nuevo.
    const l = lector();
    const { piel, actos } = crearPielWeb(() => 0, l.lee);
    l.pon(acumulado(700, 30));
    piel.fin(5);
    expect(actos()).toEqual([{ tipo: "fin", ms: 5, consumo: { modelo: cuenta(700, 30), externo: cuenta(0, 0) } }]);
  });

  it("un turno que no gastó nada NO estampa: ausente es «no consta»", () => {
    // Un `{0,0,0}` ocuparía sitio en el `.jsonl` y afirmaría una medida que nadie hizo.
    // Y el cero no se estampa pero SÍ se recuerda, que es lo que evita que el turno
    // siguiente se lleve por delante lo que ya se contó.
    const l = lector();
    const { piel, actos } = crearPielWeb(() => 0, l.lee);
    l.pon(acumulado(0, 0));
    piel.fin(5);
    expect(actos()).toEqual([{ tipo: "fin", ms: 5 }]);
    l.pon(acumulado(100, 10));
    piel.fin(5);
    expect(actos()[1]).toEqual({ tipo: "fin", ms: 5, consumo: { modelo: cuenta(100, 10), externo: cuenta(0, 0) } });
  });

  it("la ventana se estampa tal cual, y no se le resta nada", () => {
    // Es un nivel: cuánto ocupaba el historial al cerrar. Restarle el anterior sería
    // convertir en «cuánto creció la ventana», que es otra pregunta que nadie ha hecho.
    const l = lector();
    const { piel, actos } = crearPielWeb(() => 0, l.lee);
    l.pon({ modelo: cuenta(10, 1), externo: cuenta(0, 0), ventana: 3000 });
    piel.fin(5);
    l.pon({ modelo: cuenta(20, 2), externo: cuenta(0, 0), ventana: 9000 });
    piel.fin(5);
    expect(actos()[0]).toMatchObject({ consumo: { ventana: 3000 } });
    expect(actos()[1]).toMatchObject({ consumo: { ventana: 9000 } });
  });

  it("SIN lector, el `fin` sale sin `consumo`: es lo que deja intactas las otras dos pieles", () => {
    // `Piel.fin(ms)` no cambia de firma justo por esto: stdio y la TUI no reciben lector,
    // así que su `fin` es el de siempre, byte a byte.
    const { piel, actos } = crearPielWeb();
    piel.fin(1234);
    expect(actos()).toEqual([{ tipo: "fin", ms: 1234 }]);
  });

  it("un acumulado que BAJA no produce un gasto negativo", () => {
    // Los acumulados del tracker son monótonos mientras el proceso vive. Si bajaran sería
    // que la fuente cambió de escala, y un negativo pintado como gasto es peor que un cero.
    const l = lector();
    const { piel, actos } = crearPielWeb(() => 0, l.lee);
    l.pon(acumulado(100, 10));
    piel.fin(5);
    l.pon(acumulado(4, 1));
    piel.fin(5);
    expect(actos()[1]).toEqual({ tipo: "fin", ms: 5 });
  });

  it("la pregunta del agente es un acto PROPIO con las opciones como dato, detrás de su texto", () => {
    const t = 0;
    const { piel, actos } = crearPielWeb(() => t);
    piel.token("¿Qué pantalla?\n1. Login\n2. Menú");
    piel.consulta?.({ pregunta: "¿Qué pantalla?", opciones: ["Login", "Menú"] });
    expect(actos()).toEqual([
      { tipo: "asistente", texto: "¿Qué pantalla?\n1. Login\n2. Menú" },
      { tipo: "consulta", pregunta: "¿Qué pantalla?", opciones: ["Login", "Menú"] },
    ]);
  });

  it("por el turno ENTERO, la pregunta del agente queda UNA vez: el acto no reabre el mensaje", async () => {
    // Medido en el navegador: el texto de la pregunta se guardaba DOS veces en el `.jsonl`
    // —antes y después de la consulta—, porque el acto llegaba con el mensaje del asistente
    // aún abierto y el `cerrarLinea` del final lo volvía a empujar.
    const { piel, actos } = crearPielWeb(() => 0);
    async function* eventos(): AsyncIterable<DomainEvent> {
      yield { tipo: "token", texto: "¿Qué pantalla?" };
      yield { tipo: "consulta", pregunta: "¿Qué pantalla?", opciones: ["Login", "Menú"] };
    }
    await correrTurno(eventos(), piel);
    expect(actos().filter((a) => a.tipo === "asistente")).toEqual([{ tipo: "asistente", texto: "¿Qué pantalla?" }]);
    expect(actos().map((a) => a.tipo)).toEqual(["asistente", "consulta", "fin"]);
  });
});
