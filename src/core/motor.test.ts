import { describe, expect, it } from "vitest";
import { MOTOR_POR_OMISION, resolverMotor } from "./motor.js";
import { validar } from "./config.js";

describe("el motor de una sesión", () => {
  it("sin nada puesto, deepagents: el de siempre", () => {
    expect(resolverMotor({})).toBe("deepagents");
    expect(MOTOR_POR_OMISION).toBe("deepagents");
  });

  it("la SESIÓN manda sobre todo lo demás: una conversación no cambia de motor por debajo", () => {
    expect(resolverMotor({ sesion: "deepagents", entorno: "trueforge", proyecto: "trueforge" })).toBe("deepagents");
  });

  it("luego la variable, luego el proyecto, luego el global", () => {
    expect(resolverMotor({ entorno: "trueforge", proyecto: "deepagents" })).toBe("trueforge");
    expect(resolverMotor({ proyecto: "trueforge", global: "deepagents" })).toBe("trueforge");
    expect(resolverMotor({ global: "trueforge" })).toBe("trueforge");
  });

  it("un valor que no es un motor se SALTA, como si no estuviera", () => {
    expect(resolverMotor({ entorno: "langgraph", proyecto: "trueforge" })).toBe("trueforge");
  });
});

describe("«motor» en config.json", () => {
  it("se acepta un motor conocido y se descarta otro con aviso", () => {
    expect(validar({ motor: "trueforge" }, "/p/config.json", "proyecto").config.motor).toBe("trueforge");
    const malo = validar({ motor: "otro" }, "/p/config.json", "proyecto");
    expect(malo.config.motor).toBeUndefined();
    expect(malo.avisos.map((a) => a.texto).join("\n")).toMatch(/«motor» debe ser/);
  });
});
