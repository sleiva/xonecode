import { describe, expect, it } from "vitest";
import { lineasDelChat, lineasSinChat, nombreDelPaquete, repartirPorTope, viajaEnSoporte } from "./paqueteDeSoporte.js";

describe("paquete de soporte: qué viaja", () => {
  it("el proyecto y su .xonecode viajan", () => {
    expect(viajaEnSoporte("colecciones/Login.xne")).toBe(true);
    expect(viajaEnSoporte(".xonecode/sesiones/indice.json")).toBe(true);
    expect(viajaEnSoporte(".xonecode/traza-tools.jsonl")).toBe(true);
  });

  it("git, el .env, las credenciales y el checkpoint en bruto NUNCA", () => {
    for (const ruta of [
      ".git/config",
      "sub/.git/HEAD",
      "node_modules/x/index.js",
      ".env",
      "sub/.env.local",
      ".xonecode/auth.json",
      "cloudstudio-oauth.json",
      "a/conectores-oauth.json",
      ".xonecode/checkpoint.sqlite",
      ".xonecode/checkpoint.sqlite-wal",
      ".xonecode/checkpoint.sqlite-shm",
      "",
    ]) {
      expect(viajaEnSoporte(ruta), ruta).toBe(false);
    }
  });

  it("un nombre parecido a un secreto pero distinto sí viaja", () => {
    expect(viajaEnSoporte("docs/.envoltorio.md")).toBe(true);
    expect(viajaEnSoporte("config/auth.json.ejemplo")).toBe(true);
  });
});

describe("paquete de soporte: líneas de un chat", () => {
  const lineas = [{ chat: "a" }, { chat: "b" }, {}, { chat: "a" }, { chat: 3 }];
  it("solo las que traen SU id; nada por fechas", () => {
    expect(lineasDelChat(lineas, "a")).toHaveLength(2);
    expect(lineasDelChat(lineas, "c")).toEqual([]);
  });
  it("cuenta las que no se pueden atribuir", () => {
    expect(lineasSinChat(lineas)).toBe(2);
  });
});

describe("paquete de soporte: el nombre y el tope", () => {
  it("el nombre lo compone el código y no deja pasar separadores ni comillas", () => {
    const nombre = nombreDelPaquete("chat", 'Mi "chat" / ñandú\\..', new Date("2026-09-29T10:11:12Z"));
    expect(nombre).toBe("soporte-chat-Mi-chat-nandu-..-2026-09-29-10-11-12.zip");
    expect(nombre).not.toMatch(/["/\\]/);
    expect(nombreDelPaquete("proyecto", "///", new Date(0))).toContain("sin-nombre");
  });

  it("sin pasarse, entra todo; pasándose, sale lo más grande primero y se dice", () => {
    const c = [
      { ruta: "a", bytes: 10 },
      { ruta: "grande", bytes: 100 },
      { ruta: "b", bytes: 20 },
    ];
    expect(repartirPorTope(c, 1000)).toEqual({ entran: c, omitidos: [] });
    const r = repartirPorTope(c, 50);
    expect(r.entran.map((x) => x.ruta)).toEqual(["a", "b"]);
    expect(r.omitidos).toEqual([{ ruta: "grande", motivo: expect.stringContaining("100 bytes") }]);
  });
});
