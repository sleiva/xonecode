import { describe, expect, it } from "vitest";
import { ficheroQueFaltaEnElAparato, ficherosDistintos } from "./comparacionConAparato.js";

describe("ficheroQueFaltaEnElAparato", () => {
  it("saca la ruta del ENOENT del framework", () => {
    const mensaje =
      "/data/user/0/com.xone.android/app_miapp/colls/Nueva.xne: open failed: ENOENT (No such file or directory)";
    expect(ficheroQueFaltaEnElAparato(mensaje)).toBe("colls/Nueva.xne");
  });

  it("normaliza las barras invertidas", () => {
    expect(ficheroQueFaltaEnElAparato("C:\\x\\app_miapp\\a\\b.js: open failed")).toBe("a/b.js");
  });

  it("otro fallo no es un fichero que falta", () => {
    expect(ficheroQueFaltaEnElAparato("Unknown command")).toBeUndefined();
  });
});

describe("ficherosDistintos", () => {
  const locales = new Map([
    ["app.ini", 1],
    ["a.xne", 2],
    ["b.js", 3],
    ["c.css", 4],
  ]);

  it("sube lo nuevo, lo de otro CRC y lo que el aparato no nombra, en el orden local", () => {
    const remotos = { "app.ini": 1, "a.xne": "99", "c.css": "4" };
    expect(ficherosDistintos(locales, remotos, new Set(["c.css"]))).toEqual(["a.xne", "b.js", "c.css"]);
  });

  it("todo igual es nada que subir", () => {
    expect(ficherosDistintos(locales, { "app.ini": 1, "a.xne": 2, "b.js": "3", "c.css": 4 }, new Set())).toEqual([]);
  });
});
