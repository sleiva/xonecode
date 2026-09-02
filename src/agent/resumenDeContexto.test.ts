import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ crear: vi.fn(() => ({ name: "SummarizationMiddleware" })) }));
vi.mock("deepagents", () => ({ createSummarizationMiddleware: mocks.crear }));

import {
  CONTEXTO_RECIENTE_TOKENS,
  resumenDeContexto,
  UMBRAL_RESUMEN_TOKENS,
} from "./resumenDeContexto.js";
import { RUTA_HISTORIAL_RESUMIDO } from "./memoriaDeProyecto.js";

describe("resumenDeContexto", () => {
  it("comprime antes del límite inseguro de 170k y conserva el trabajo reciente", () => {
    const backend = {} as never;
    resumenDeContexto(backend);
    expect(mocks.crear).toHaveBeenCalledWith(expect.objectContaining({
      backend,
      trigger: { type: "tokens", value: UMBRAL_RESUMEN_TOKENS },
      keep: { type: "tokens", value: CONTEXTO_RECIENTE_TOKENS },
      trimTokensToSummarize: 12_000,
      historyPathPrefix: RUTA_HISTORIAL_RESUMIDO,
    }));
    expect(UMBRAL_RESUMEN_TOKENS).toBeLessThan(170_000);
  });
});
