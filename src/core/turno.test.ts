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