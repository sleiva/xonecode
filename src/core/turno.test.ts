import { describe, it, expect } from "vitest";
import { correrTurno, type Piel } from "./turno.js";
import type { DomainEvent } from "./events.js";

/** Piel de prueba: apunta las llamadas en vez de pintarlas. */
function pielDePrueba() {
  const actos: string[] = [];
  const piel: Piel = {
    token: (t) => actos.push(`token:${t}`),
    cerrarLinea: () => actos.push("cerrar"),
    linea: (t) => actos.push(`linea:${t}`),
    pausa: (p) => actos.push(`pausa:${p.length}`),
    fin: () => actos.push("fin"),
  };
  return { piel, actos };
}

async function* flujo(...eventos: DomainEvent[]): AsyncIterable<DomainEvent> {
  for (const e of eventos) yield e;
}

describe("correrTurno", () => {
  it("los trozos de una respuesta salen pegados, sin cerrar línea entre ellos", async () => {
    const { piel, actos } = pielDePrueba();
    await correrTurno(
      flujo(
        { tipo: "token", texto: "Hola", msgId: "r1" },
        { tipo: "token", texto: " qué tal", msgId: "r1" }
      ),
      piel
    );
    expect(actos).toEqual(["token:Hola", "token: qué tal", "cerrar", "fin"]);
  });

  it("una línea de progreso CIERRA la línea de tokens abierta", async () => {
    // Sin esto queda pegada al final de la respuesta en vez de empezar la suya.
    const { piel, actos } = pielDePrueba();
    await correrTurno(
      flujo(
        { tipo: "token", texto: "escribiendo", msgId: "r1" },
        { tipo: "fase", fase: "verificando" }
      ),
      piel
    );
    expect(actos.slice(0, 3)).toEqual([
      "token:escribiendo",
      "cerrar",
      "linea:·  verificando con el simulador",
    ]);
  });

  it("una piel que sabe de fases recibe la fase delegada, y también con la línea cerrada", async () => {
    // La fase es lo único del turno que DURA: la piel de terminal la anima (spinner) y
    // la de pega la registra. El motor solo dicta el TEXTO — la decoración es de la piel.
    const { piel, actos } = pielDePrueba();
    piel.fase = (t) => actos.push(`fase:${t}`);
    await correrTurno(
      flujo(
        { tipo: "token", texto: "escribiendo", msgId: "r1" },
        { tipo: "fase", fase: "verificando" },
        { tipo: "fase", fase: "respondiendo", detalle: "resumen" }
      ),
      piel
    );
    expect(actos).toEqual([
      "token:escribiendo",
      "cerrar",
      "fase:verificando con el simulador",
      "fase:redactando la respuesta — resumen",
      "fin",
    ]);
  });

  it("un mensaje con OTRO id cierra la línea del anterior", async () => {
    const { piel, actos } = pielDePrueba();
    await correrTurno(
      flujo(
        { tipo: "token", texto: "ya está.", msgId: "r1" },
        { tipo: "token", texto: "⚠ VERIFICADOR DE PEGA", msgId: "aviso-1" }
      ),
      piel
    );
    expect(actos).toEqual([
      "token:ya está.",
      "cerrar",
      "token:⚠ VERIFICADOR DE PEGA",
      "cerrar",
      "fin",
    ]);
  });

  it("las tools se colapsan por racha y la cuenta sale al final, con el detalle de la lista blanca", async () => {
    const { piel, actos } = pielDePrueba();
    await correrTurno(
      flujo(
        { tipo: "tool", nombre: "grep", detalle: "realizarLogin" },
        { tipo: "tool", nombre: "grep" },
        { tipo: "tool", nombre: "grep" }
      ),
      piel
    );
    expect(actos).toEqual(["linea:✱ busca realizarLogin", "linea:✱ busca ×3 — realizarLogin", "fin"]);
  });

  it("la bitácora recoge lo que ha corrido, y solo eso", async () => {
    const { piel } = pielDePrueba();
    const b = await correrTurno(
      flujo({ tipo: "verificacion", verde: false, errores: 3, avisos: 1 }),
      piel
    );
    expect(b.corrio("verify")).toBe(true);
    expect(b.corrio("executor")).toBe(false);
  });

  it("los avisos deterministas se calculan al FINAL, sobre la bitácora", async () => {
    const { piel, actos } = pielDePrueba();
    await correrTurno(
      flujo({ tipo: "verificacion", verde: true, errores: 0, avisos: 0 }),
      piel,
      { avisos: (b) => (b.corrio("verify") ? ["⚠ VERIFICADOR DE PEGA"] : []) }
    );
    expect(actos).toContain("linea:⚠ VERIFICADOR DE PEGA");
    expect(actos.indexOf("linea:⚠ VERIFICADOR DE PEGA")).toBeLessThan(actos.indexOf("fin"));
  });

  it("un aviso NO sale si su nodo no ha corrido en este turno", async () => {
    // El defecto medido: el aviso colgaba de un dato del hilo y salía en todos los
    // turnos posteriores al primero, incluido «cuéntame un chiste».
    const { piel, actos } = pielDePrueba();
    await correrTurno(flujo({ tipo: "fase", fase: "entendiendo" }), piel, {
      avisos: (b) => (b.corrio("verify") ? ["⚠ VERIFICADOR DE PEGA"] : []),
    });
    expect(actos).not.toContain("linea:⚠ VERIFICADOR DE PEGA");
  });

  it("una pasada que NO cierra (`cerrar: () => false`) ni avisa ni emite fin — pero cierra su línea", async () => {
    // Un turno puede tener varias pasadas —rondas de aprobación, intentos de reparación— y
    // solo la última es el final. Antes cada pasada cerraba: stdio imprimía el tiempo una
    // vez por ronda y el chat plegaba el tramo una vez por ronda. La línea abierta sí se
    // cierra siempre: lo que venga detrás empieza la suya.
    const { piel, actos } = pielDePrueba();
    await correrTurno(flujo({ tipo: "token", texto: "a medio", msgId: "r1" }), piel, {
      avisos: () => ["⚠ NO DEBE SALIR"],
      cerrar: () => false,
    });
    expect(actos).toEqual(["token:a medio", "cerrar"]);
  });

  it("el tiempo del fin cuenta desde `desde`, no desde que empezó la pasada", async () => {
    // Con varias pasadas y una sola que cierra, el fin de la última tiene que decir lo que
    // tardó el TURNO. Un `desde` de hace un segundo largo da un fin mayor que la pasada.
    const tiempos: number[] = [];
    const piel: Piel = {
      token: () => {},
      cerrarLinea: () => {},
      linea: () => {},
      pausa: () => {},
      fin: (ms) => tiempos.push(ms),
    };
    await correrTurno(flujo(), piel, { desde: Date.now() - 1500 });
    expect(tiempos).toHaveLength(1);
    expect(tiempos[0]!).toBeGreaterThanOrEqual(1500);
  });

  it("una verificación con hallazgos los pinta uno por línea, con dónde, y cuenta aparte los ajenos", async () => {
    // El resumen solo dice cuántos, y cuántos no se arregla. El fichero y la línea son lo
    // que el humano abre — y lo que el paso de reparación necesitará después.
    const { piel, actos } = pielDePrueba();
    await correrTurno(
      flujo({
        tipo: "verificacion",
        verde: false,
        errores: 1,
        avisos: 1,
        hallazgos: [
          { code: "XONE001", severidad: "error", mensaje: "atributo desconocido", fichero: "Clientes.xne", linea: 12 },
          { code: "XONE100", severidad: "warning", mensaje: "sin usar" },
        ],
        preexistentes: 2,
      }),
      piel
    );
    expect(actos).toEqual([
      "linea:✗  verificación: 1 error(es), 1 aviso(s)",
      "linea:   ✗ XONE001 Clientes.xne:12 — atributo desconocido",
      "linea:   △ XONE100 — sin usar",
      "linea:   (y 2 hallazgo(s) más en ficheros que este turno no tocó)",
      "fin",
    ]);
  });

  it("los avisos de sistema van delegados a la piel que sabe de notificaciones, con la línea cerrada", async () => {
    // Mismo pacto que la fase: el motor dicta el TEXTO y no decide decoración. La piel
    // de terminal manda el aviso al panel reciclado; la que no sabe, pinta la línea
    // estática de siempre (los tests de arriba).
    const { piel, actos } = pielDePrueba();
    piel.notificacion = (t) => actos.push(`notificacion:${t}`);
    await correrTurno(
      flujo(
        { tipo: "token", texto: "a medio", msgId: "r1" },
        { tipo: "aviso", texto: "△ el verificador no ha corrido en este turno", severidad: "aviso" },
        { tipo: "aviso", texto: "otro aviso", severidad: "info" }
      ),
      piel
    );
    expect(actos).toEqual([
      "token:a medio",
      "cerrar",
      "notificacion:△ el verificador no ha corrido en este turno",
      "notificacion:otro aviso",
      "fin",
    ]);
  });

  it("los avisos DETERMINISTAS del final también van delegados — no solo los eventos aviso", async () => {
    // El fallo medido en real: el △ del verificador sale del `finally` y no del flujo
    // de eventos; si ese camino no enruta por `notificacion`, el panel nunca lo ve y el
    // aviso vuelve a acumularse en el scrollback pegado a su propio tiempo final.
    const { piel, actos } = pielDePrueba();
    piel.notificacion = (t) => actos.push(`notificacion:${t}`);
    await correrTurno(flujo(), piel, {
      avisos: () => ["△ el verificador no ha corrido en este turno"],
    });
    expect(actos).toEqual([
      "notificacion:△ el verificador no ha corrido en este turno",
      "fin",
    ]);
  });

  it("si el flujo revienta, la línea se cierra y la cuenta de tools NO se pierde", async () => {
    const { piel, actos } = pielDePrueba();
    async function* explota(): AsyncIterable<DomainEvent> {
      yield { tipo: "tool", nombre: "grep" };
      yield { tipo: "tool", nombre: "grep" };
      yield { tipo: "token", texto: "a medio", msgId: "r1" };
      throw new Error("se cayó");
    }
    await expect(correrTurno(explota(), piel)).rejects.toThrow("se cayó");

    // La secuencia exacta, porque el ORDEN es la garantía y no un detalle:
    // el `cerrar` va ANTES de la cuenta de tools, no después. Pedir lo contrario
    // —que `cerrar` fuese lo último antes de `fin`— obligaría a escribir «×2»
    // DENTRO de la línea de token todavía abierta, que es exactamente el pegado
    // que este mecanismo existe para evitar: «a medio🔧 grep ×2».
    expect(actos).toEqual([
      "linea:✱ busca",
      "token:a medio",
      "cerrar",           // la línea a medio escribir se cierra...
      "linea:✱ busca ×2", // ...y solo entonces sale la cuenta, en su propia línea
      "fin",
    ]);
  });

  it("una pausa cierra la línea antes de preguntar", async () => {
    const { piel, actos } = pielDePrueba();
    await correrTurno(
      flujo(
        { tipo: "token", texto: "propongo esto", msgId: "r1" },
        {
          tipo: "pausa",
          pendientes: [
            { id: "i1", origen: "dev", descripcion: "escribir Clientes.xne", decisionesPermitidas: ["approve", "reject"] },
          ],
        }
      ),
      piel
    );
    expect(actos).toEqual(["token:propongo esto", "cerrar", "pausa:1", "fin"]);
  });
});