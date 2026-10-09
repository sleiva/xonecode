import { describe, expect, it } from "vitest";
import { SERVIDOR_REMOTO_POR_OMISION, remotoEnVigor, validarSettings } from "./settings.js";

describe("el interruptor de la sesión remota", () => {
  it("conserva un remoto válido", () => {
    const { settings } = validarSettings({ entornos: [], remoto: { habilitado: true, servidor: "ws://127.0.0.1:8787/ws" } });
    expect(settings.remoto).toEqual({ habilitado: true, servidor: "ws://127.0.0.1:8787/ws" });
  });

  it("descarta un servidor inaceptable y un habilitado que no es booleano", () => {
    for (const servidor of ["ws://remoto.xone.dev/ws", "http://127.0.0.1:8787", 42]) {
      const { settings, avisos } = validarSettings({ entornos: [], remoto: { habilitado: true, servidor } });
      expect(settings.remoto).toEqual({ habilitado: true });
      expect(avisos.length).toBeGreaterThan(0);
    }
    expect(validarSettings({ entornos: [], remoto: { habilitado: "sí" } }).settings.remoto).toBeUndefined();
  });

  it("apagado por omisión, y XONECODE_REMOTO=1 lo enciende para un arranque", () => {
    expect(remotoEnVigor(undefined, {})).toEqual({ habilitado: false, servidor: SERVIDOR_REMOTO_POR_OMISION });
    expect(SERVIDOR_REMOTO_POR_OMISION).toBe("wss://remoto.xone.dev/ws");
    expect(remotoEnVigor(undefined, { XONECODE_REMOTO: "1" }).habilitado).toBe(true);
    expect(remotoEnVigor(undefined, { XONECODE_REMOTO: "0" }).habilitado).toBe(false);
    expect(remotoEnVigor({ habilitado: true, servidor: "ws://localhost:9/ws" }, {})).toEqual({ habilitado: true, servidor: "ws://localhost:9/ws" });
  });
});
