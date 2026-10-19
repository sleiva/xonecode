import { describe, expect, it } from "vitest";
import { agotadoHasta, esAgotamiento, TOPE_DE_AGOTAMIENTO_MS } from "./agotamientoExterno.js";

// 12:37 UTC del 19-10-2026 = 14:37 en Madrid (CEST): el momento de las tareas de soporte.
const AHORA = Date.parse("2026-10-19T12:37:20.000Z");

describe("agotamiento de un motor externo", () => {
  it("reconoce el mensaje REAL de Claude Code, y no un fallo cualquiera", () => {
    expect(esAgotamiento("claude-code: You've hit your session limit · resets 4:30pm (Europe/Madrid)")).toBe(true);
    expect(esAgotamiento("You've hit your usage limit. Upgrade to Pro or try again in 2 hours 5 minutes.")).toBe(true);
    expect(esAgotamiento("claude-code terminó sin respuesta (error_max_turns)")).toBe(false);
    expect(esAgotamiento("spawn codex ENOENT")).toBe(false);
  });

  it("hasta la hora que dice, en SU zona: «resets 4:30pm (Europe/Madrid)» a las 14:37 de Madrid son las 14:30 UTC", () => {
    expect(new Date(agotadoHasta("You've hit your session limit · resets 4:30pm (Europe/Madrid)", AHORA)!).toISOString()).toBe("2026-10-19T14:30:00.000Z");
    // Una hora que ya pasó hoy es la de mañana.
    expect(new Date(agotadoHasta("hit your session limit · resets 9am (Europe/Madrid)", AHORA)!).toISOString()).toBe("2026-10-20T07:00:00.000Z");
  });

  it("«try again in …» relativo a ahora; sin hora, el tope; y lo que no es agotamiento, nada", () => {
    expect(agotadoHasta("You've hit your usage limit. Try again in 2 hours 5 minutes.", AHORA)).toBe(AHORA + 125 * 60_000);
    expect(agotadoHasta("You've hit your weekly limit", AHORA)).toBe(AHORA + TOPE_DE_AGOTAMIENTO_MS);
    expect(agotadoHasta("hit your session limit · resets 4:30pm (Marte/Olimpo)", AHORA)).toBe(AHORA + TOPE_DE_AGOTAMIENTO_MS);
    expect(agotadoHasta("se cortó la conexión", AHORA)).toBeUndefined();
  });
});
