import { describe, it, expect, vi } from "vitest";
import {
  collectPending,
  buildResume,
  promptForDecisions,
  interpretAnswer,
  MAX_APPROVAL_ROUNDS,
  REJECT_MESSAGE,
} from "./hitl.js";

/** La forma real de getState(), tomada de la verificación en vivo. */
const stateWithTwo = {
  next: ["tools", "tools"],
  tasks: [
    {
      id: "0e38648b",
      name: "tools",
      path: ["__pregel_push", 0],
      interrupts: [
        {
          id: "7c7765967e67b914",
          value: {
            actionRequests: [
              { name: "studio_edit_file", args: { path: "a.js" }, description: "[dev] quiere modificar un fichero del proyecto" },
            ],
            reviewConfigs: [{ actionName: "studio_edit_file", allowedDecisions: ["approve", "edit", "reject"] }],
          },
        },
      ],
    },
    {
      id: "95997704",
      name: "tools",
      path: ["__pregel_push", 1],
      interrupts: [
        {
          id: "5762126ed321a7cd",
          value: {
            actionRequests: [
              { name: "studio_edit_css", args: { path: "main.css" }, description: "[mockup] quiere modificar el CSS del proyecto" },
            ],
            reviewConfigs: [{ actionName: "studio_edit_css", allowedDecisions: ["approve", "edit", "reject"] }],
          },
        },
      ],
    },
  ],
};

describe("collectPending", () => {
  it("recoge los DOS interrupts concurrentes, no solo el primero", () => {
    const pending = collectPending(stateWithTwo);
    expect(pending).toHaveLength(2);
    expect(pending.map((p) => p.tool)).toEqual(["studio_edit_file", "studio_edit_css"]);
  });

  it("conserva el id, que es lo único con lo que se puede reanudar", () => {
    expect(collectPending(stateWithTwo).map((p) => p.id)).toEqual([
      "7c7765967e67b914",
      "5762126ed321a7cd",
    ]);
  });

  // La atribución al subagente viaja en la description, porque el interrupt no la trae.
  it("trae la descripción con el subagente que pide", () => {
    const pending = collectPending(stateWithTwo);
    expect(pending[0].description).toContain("[dev]");
    expect(pending[1].description).toContain("[mockup]");
  });

  it("trae los args, que la description propia ya no incluye", () => {
    expect(collectPending(stateWithTwo)[0].args).toEqual({ path: "a.js" });
  });

  it("devuelve vacío si no hay interrupts", () => {
    expect(collectPending({ next: [], tasks: [] })).toEqual([]);
    expect(collectPending({})).toEqual([]);
    expect(collectPending(null)).toEqual([]);
  });
});

describe("buildResume", () => {
  // La forma que costó encontrar: un array pelado falla con "decisions must be a
  // non-empty array". Tiene que ser un mapa id → { decisions: [...] }.
  it("construye el mapa por id que espera Command", () => {
    const decisions = new Map([
      ["id-a", { type: "approve" as const }],
      ["id-b", { type: "reject" as const, message: "no" }],
    ]);
    expect(buildResume(decisions)).toEqual({
      "id-a": { decisions: [{ type: "approve" }] },
      "id-b": { decisions: [{ type: "reject", message: "no" }] },
    });
  });

  it("cada entrada lleva un array no vacío", () => {
    const resume = buildResume(new Map([["id-a", { type: "approve" as const }]]));
    expect(Array.isArray(resume["id-a"].decisions)).toBe(true);
    expect(resume["id-a"].decisions.length).toBeGreaterThan(0);
  });
});

describe("promptForDecisions", () => {
  const pending = collectPending(stateWithTwo);

  it("pregunta una vez por cada interrupt pendiente", async () => {
    const ask = vi.fn(async () => "s");
    const decisions = await promptForDecisions(pending, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(decisions.size).toBe(2);
  });

  // El Enter a secas ("") solo aprueba con `interactive: true` (un TTY de verdad
  // detrás) desde el fix de fail-closed; ver el describe de abajo. Se pasa aquí
  // explícito para no depender del default.
  it("trata s/y/si/yes/enter como aprobar", async () => {
    for (const answer of ["s", "S", "si", "y", "yes", ""]) {
      const decisions = await promptForDecisions([pending[0]], async () => answer, {
        interactive: true,
      });
      expect(decisions.get(pending[0].id)).toEqual({ type: "approve" });
    }
  });

  // Por defecto NO aprobar ante una respuesta que no se entiende: es una escritura
  // sobre un proyecto real.
  it("trata cualquier otra cosa como rechazar", async () => {
    for (const answer of ["n", "no", "qué", "x"]) {
      const decisions = await promptForDecisions([pending[0]], async () => answer);
      expect(decisions.get(pending[0].id)?.type).toBe("reject");
    }
  });

  it("el rechazo lleva un mensaje para que el modelo sepa qué pasó", async () => {
    const decisions = await promptForDecisions([pending[0]], async () => "n");
    expect(decisions.get(pending[0].id)?.message).toBeTruthy();
  });

  // El Enter a secas solo demuestra que hay un humano mirando si hay un terminal de
  // verdad detrás. Fuera de un TTY (pipe, CI, cron) una línea en blanco no prueba nada
  // y no puede aprobar una escritura real.
  describe("Enter a secas fuera de un TTY", () => {
    it("aprueba SOLO con interactive true explícito", async () => {
      const decisions = await promptForDecisions([pending[0]], async () => "", {
        interactive: true,
      });
      expect(decisions.get(pending[0].id)).toEqual({ type: "approve" });
    });

    // El default tiene que fallar CERRADO: quien olvida pasar `opts` —o llama desde
    // un cron, un test, un pipe— no debe recibir gratis el conjunto permisivo. Antes
    // del fix, `opts` omitido o `{}` aprobaban un Enter a secas igual que
    // `interactive: true`; ahora deben rechazarlo, como `interactive: false`.
    it("rechaza el Enter a secas si se omite `opts` o se pasa `{}` (fail closed)", async () => {
      for (const opts of [{}, undefined]) {
        const decisions = await promptForDecisions([pending[0]], async () => "", opts);
        expect(decisions.get(pending[0].id)?.type).toBe("reject");
      }
    });

    it("rechaza con interactive false, aunque un 's' explícito sigue aprobando", async () => {
      const vacio = await promptForDecisions([pending[0]], async () => "", {
        interactive: false,
      });
      expect(vacio.get(pending[0].id)?.type).toBe("reject");

      const explicito = await promptForDecisions([pending[0]], async () => "s", {
        interactive: false,
      });
      expect(explicito.get(pending[0].id)).toEqual({ type: "approve" });
    });
  });

  // La única línea entre el humano y aprobar a ciegas: si se borra, los tests de
  // arriba (que solo miran el Map devuelto) seguirían en verde.
  it("imprime la tool, los args y el subagente que pide, para no aprobar a ciegas", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await promptForDecisions([pending[0]], async () => "s");
      const salida = log.mock.calls.map((c) => String(c[0])).join("\n");
      expect(salida).toContain("studio_edit_file"); // la tool
      expect(salida).toContain("a.js"); // los args
      expect(salida).toContain("[dev]"); // quién lo pide
    } finally {
      log.mockRestore();
    }
  });
});

describe("interpretAnswer", () => {
  it("aprueba con s/si/y/yes en cualquier capitalización", () => {
    for (const answer of ["s", "S", "si", "SÍ", "y", "YES", "  s  "]) {
      expect(interpretAnswer(answer, { interactive: true })).toEqual({ type: "approve" });
    }
  });

  it("el Enter a secas aprueba SOLO con interactive true", () => {
    expect(interpretAnswer("", { interactive: true })).toEqual({ type: "approve" });
    expect(interpretAnswer("", { interactive: false }).type).toBe("reject");
    expect(interpretAnswer("").type).toBe("reject"); // fail closed sin opts
  });

  it("rechaza cualquier cosa que no se entienda, con el mensaje estándar", () => {
    for (const answer of ["n", "no", "qué", "x"]) {
      const d = interpretAnswer(answer, { interactive: true });
      expect(d.type).toBe("reject");
      expect(d.message).toBe(REJECT_MESSAGE);
    }
  });
});

describe("MAX_APPROVAL_ROUNDS", () => {
  it("es 5, el tope que da04 ya aplicaba", () => {
    expect(MAX_APPROVAL_ROUNDS).toBe(5);
  });
});
