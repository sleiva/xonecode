import { describe, it, expect } from "vitest";
import { pedirDecisiones, type Preguntar } from "./aprobar.js";
import type { PendienteDeAprobacion } from "../core/events.js";

/** Registra los textos que se le pasan a escribir, igual que en stdio.test.ts. */
function acumulador() {
  const trozos: string[] = [];
  return { trozos, escribir: (t: string) => trozos.push(t) };
}

/**
 * Un `preguntar` de pega que devuelve respuestas de una lista predefinida, y registra
 * cuántas veces se le llamó y con qué prompt — el nº de llamadas y el prompt son dos
 * de las cosas que esta suite comprueba.
 */
function preguntadorGuionizado(respuestas: string[]) {
  const prompts: string[] = [];
  let i = 0;
  const preguntar: Preguntar = async (pregunta: string) => {
    prompts.push(pregunta);
    // Si se pregunta más de lo guionizado, devuelve basura: debería rechazar, nunca
    // aprobar — el fail-closed también protege un guion mal escrito.
    return respuestas[i++] ?? "basura-sin-guion";
  };
  return { prompts, preguntar };
}

function pendiente(id: string, origen = "dev"): PendienteDeAprobacion {
  return {
    id,
    origen,
    descripcion: `[${origen}] quiere escribir un fichero del proyecto`,
    decisionesPermitidas: ["approve", "reject"],
  };
}

describe("pedirDecisiones", () => {
  it("un «s» aprueba; una «n» rechaza", async () => {
    const { trozos, escribir } = acumulador();
    const { preguntar } = preguntadorGuionizado(["s", "n"]);

    const decisiones = await pedirDecisiones(
      [pendiente("a"), pendiente("b")],
      preguntar,
      escribir
    );

    expect(decisiones.get("a")?.type).toBe("approve");
    expect(decisiones.get("b")?.type).toBe("reject");
    expect(trozos.join("")).toContain("APROBADO");
  });

  it("el Enter a secas RECHAZA sin `interactive: true`, y APRUEBA con él — la regla que protege CI", async () => {
    // Sin interactive (o sin pasar la opción): "" es rechazo. Es el default seguro.
    for (const sinOpciones of [undefined, {}, { interactive: false }]) {
      const { escribir } = acumulador();
      const { preguntar } = preguntadorGuionizado([""]);
      const d = await pedirDecisiones([pendiente("x")], preguntar, escribir, sinOpciones);
      expect(d.get("x")?.type, `con opciones ${JSON.stringify(sinOpciones)}`).toBe("reject");
    }

    // Con un TTY de verdad detrás, Enter es el default conveniente: aprueba.
    const { escribir } = acumulador();
    const { preguntar } = preguntadorGuionizado([""]);
    const d = await pedirDecisiones(
      [pendiente("x")],
      preguntar,
      escribir,
      { interactive: true }
    );
    expect(d.get("x")?.type).toBe("approve");
  });

  it("cualquier respuesta que no se entiende RECHAZA", async () => {
    for (const rara of ["quizá", "espera", "?"]) {
      const { escribir } = acumulador();
      const { preguntar } = preguntadorGuionizado([rara]);
      // Incluso con interactive: true — lo único que cambia es el Enter a secas.
      const d = await pedirDecisiones(
        [pendiente("x")],
        preguntar,
        escribir,
        { interactive: true }
      );
      expect(d.get("x")?.type, `respuesta «${rara}»`).toBe("reject");
    }
  });

  it("con dos pendientes pregunta DOS veces y el mapa sale con los dos ids", async () => {
    const { escribir } = acumulador();
    const { prompts, preguntar } = preguntadorGuionizado(["s", "s"]);

    const decisiones = await pedirDecisiones(
      [pendiente("uno"), pendiente("dos")],
      preguntar,
      escribir
    );

    expect(prompts.length).toBe(2);
    expect([...decisiones.keys()].sort()).toEqual(["dos", "uno"]);
  });

  it("un rechazo dice explícitamente que NO se ha aplicado nada", async () => {
    // Sin esta frase el usuario no sabe si la escritura llegó a medio camino.
    const { trozos, escribir } = acumulador();
    const { preguntar } = preguntadorGuionizado(["n"]);

    await pedirDecisiones([pendiente("x")], preguntar, escribir);

    expect(trozos.join("")).toContain("no se ha aplicado nada");
  });

  it("pinta la RUTA del fichero cuando fichero() la da, y nada más que ella", async () => {
    const { trozos, escribir } = acumulador();
    const { preguntar } = preguntadorGuionizado(["s"]);

    await pedirDecisiones([pendiente("x")], preguntar, escribir, {
      fichero: (id) => (id === "x" ? "app/Clientes.xne" : undefined),
    });

    const salida = trozos.join("");
    expect(salida).toContain("fichero: app/Clientes.xne");
    // PendienteDeAprobacion no lleva args: esto asegura que solo sale la ruta, sin
    // ningún objeto de argumentos serializado al lado.
    expect(salida).not.toContain("args");
    expect(salida).not.toContain("{");
  });

  it("el prompt cambia entre [S/n] y [s/N] según `interactive` — el default visible coincide con el real", async () => {
    // Si la mayúscula no casara con el default real, la interfaz MENTIRÍA en el paso
    // que aprueba escrituras: peor sitio no hay.
    const conTty = preguntadorGuionizado(["s"]);
    const { escribir: e1 } = acumulador();
    await pedirDecisiones([pendiente("x")], conTty.preguntar, e1, { interactive: true });
    expect(conTty.prompts[0]).toBe("¿Aprobar? [S/n] ");

    const sinTty = preguntadorGuionizado(["s"]);
    const { escribir: e2 } = acumulador();
    await pedirDecisiones([pendiente("x")], sinTty.preguntar, e2);
    expect(sinTty.prompts[0]).toBe("¿Aprobar? [s/N] ");
  });
});
