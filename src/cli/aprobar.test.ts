import { describe, it, expect } from "vitest";
import { pedirDecisiones, type Preguntar } from "./aprobar.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import type { LineaDeDiff } from "../core/diff.js";

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

  describe("el EOF no se hace pasar por un Enter", () => {
    /**
     * El Enter a secas SÍ aprueba con el diff delante y un TTY detrás: es un rasgo
     * deliberado del repo, y quien lo pulsa está mirando el cambio. Pero `crearPreguntar`
     * (`cli/stdio.ts`) resuelve **cadena vacía** también cuando el readline ya está
     * cerrado —un Ctrl-D, un stdin agotado a mitad de turno—, y `""` está dentro de
     * `APPROVALS_TTY`. Sin el detector, ese EOF entraba por la puerta del Enter y APROBABA
     * una escritura de fichero que nadie llegó a ver.
     */
    it("con TTY, una respuesta vacía y el rl CERRADO rechaza", async () => {
      const { trozos, escribir } = acumulador();
      const { preguntar } = preguntadorGuionizado([""]);

      const d = await pedirDecisiones([pendiente("x")], preguntar, escribir, {
        interactive: true,
        eof: () => true,
      });

      expect(d.get("x")?.type).toBe("reject");
      expect(trozos.join("")).toContain("no se ha aplicado nada");
    });

    it("con TTY y el rl VIVO, la misma respuesta vacía aprueba: el Enter sigue valiendo", async () => {
      const { escribir } = acumulador();
      const { preguntar } = preguntadorGuionizado([""]);

      const d = await pedirDecisiones([pendiente("x")], preguntar, escribir, {
        interactive: true,
        eof: () => false,
      });

      expect(d.get("x")?.type).toBe("approve");
    });

    it("el prompt también deja de mentir: con EOF enseña [s/N], no [S/n]", async () => {
      const { escribir } = acumulador();
      const { prompts, preguntar } = preguntadorGuionizado([""]);

      await pedirDecisiones([pendiente("x")], preguntar, escribir, { interactive: true, eof: () => true });

      expect(prompts[0]).toBe("¿Aprobar? [s/N] ");
    });

    it("un rl que se cierra A MEDIA pregunta también rechaza", async () => {
      // El caso que `crearPreguntar` documenta aparte del ya-cerrado: se preguntó con el
      // rl vivo y el EOF llegó mientras el usuario no contestaba. Si `eof` solo se mirara
      // ANTES de preguntar, esta respuesta vacía volvería a aprobar.
      const { escribir } = acumulador();
      let cerrado = false;
      const preguntar: Preguntar = async () => {
        cerrado = true;
        return "";
      };

      const d = await pedirDecisiones([pendiente("x")], preguntar, escribir, {
        interactive: true,
        eof: () => cerrado,
      });

      expect(d.get("x")?.type).toBe("reject");
    });

    it("sin `eof`, nada cambia: los 21 llamadores que no lo pasan siguen igual", async () => {
      const { escribir } = acumulador();
      const { preguntar } = preguntadorGuionizado([""]);

      const d = await pedirDecisiones([pendiente("x")], preguntar, escribir, { interactive: true });

      expect(d.get("x")?.type).toBe("approve");
    });
  });

  describe("bloque de diff", () => {
    const diff: LineaDeDiff[] = [
      { tipo: "igual", texto: "<app>" },
      { tipo: "quitado", texto: "viejo" },
      { tipo: "anadido", texto: "nuevo" },
      { tipo: "igual", texto: "</app>" },
    ];

    it("con diff, pinta los cambios con -/+ y su contexto, antes de decidir", async () => {
      const { trozos, escribir } = acumulador();
      const { preguntar } = preguntadorGuionizado(["s"]);

      await pedirDecisiones([pendiente("x")], preguntar, escribir, {
        fichero: () => "app.xml",
        diff: () => diff,
      });

      const salida = trozos.join("");
      // El diff va ANTES de la decisión: se aprueba mirándolo, no recordándolo.
      expect(salida.indexOf("    <app>")).toBeLessThan(salida.indexOf("APROBADO"));
      expect(salida).toContain("  - viejo");
      expect(salida).toContain("  + nuevo");
      expect(salida).toContain("    </app>");
    });

    it("las rachas de «igual» largas no se pintan enteras: contexto alrededor del cambio", async () => {
      const largo: LineaDeDiff[] = [
        ...Array.from({ length: 20 }, (_, i): LineaDeDiff => ({ tipo: "igual", texto: `línea ${i}` })),
        { tipo: "anadido", texto: "NUEVA" },
      ];
      const { trozos, escribir } = acumulador();
      const { preguntar } = preguntadorGuionizado(["s"]);

      await pedirDecisiones([pendiente("x")], preguntar, escribir, { diff: () => largo });

      const salida = trozos.join("");
      expect(salida).toContain("  + NUEVA");
      // Las primeras del fichero no aportan nada a la decisión: fuera del contexto.
      expect(salida).not.toContain("línea 0");
      expect(salida).toContain("línea 19");
    });

    it("más allá del techo de líneas, se declara cuántas faltan", async () => {
      const enorme: LineaDeDiff[] = Array.from({ length: 40 }, (_, i): LineaDeDiff => ({
        tipo: "anadido",
        texto: `línea ${i}`,
      }));
      const { trozos, escribir } = acumulador();
      const { preguntar } = preguntadorGuionizado(["s"]);

      await pedirDecisiones([pendiente("x")], preguntar, escribir, { diff: () => enorme });

      expect(trozos.join("")).toContain("… y 15 líneas más");
    });

    it("sin diff para ese id no hay bloque — la pregunta queda igual", async () => {
      const { trozos, escribir } = acumulador();
      const { prompts, preguntar } = preguntadorGuionizado(["s"]);

      await pedirDecisiones([pendiente("x")], preguntar, escribir, { diff: () => undefined });

      expect(trozos.join("")).not.toContain("+ ");
      // La pregunta viaja por `preguntar`, no por `escribir`: el doble la registra.
      expect(prompts[0]).toBe("¿Aprobar? [s/N] ");
    });
  });
});
