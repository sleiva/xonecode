import { describe, it, expect } from "vitest";
import { Colapsador, type EventoTool } from "./notify.js";

const ok = (nombre: string, detalle?: string): EventoTool =>
  detalle === undefined ? { nombre } : { nombre, detalle };

describe("Colapsador", () => {
  it("cada tool conocida abre su línea con icono, verbo y fichero, y calla las siguientes", () => {
    const c = new Colapsador();
    expect(c.lineas(ok("read_file", "app.xne"))).toEqual(["→ lee app.xne"]);
    expect(c.lineas(ok("read_file", "Login.xne"))).toEqual([]);
    expect(c.lineas(ok("read_file", "MenuPrincipal.xne"))).toEqual([]);

    // El resto de las conocidas: mismo icono por familia, verbo propio.
    const una = (nombre: string, detalle: string): string[] => new Colapsador().lineas(ok(nombre, detalle));
    expect(una("write_file", "app.xne")).toEqual(["← escribe app.xne"]);
    expect(una("edit_file", "Login.xne")).toEqual(["← edita Login.xne"]);
    expect(una("ls", "/")).toEqual(["→ lista /"]);
    expect(una("glob", "*.xne")).toEqual(["✱ busca *.xne"]);
    expect(una("grep", "realizarLogin")).toEqual(["✱ busca realizarLogin"]);
    expect(una("regex_search", "function\\s+(MT\\w+)")).toEqual(["✱ regex function\\s+(MT\\w+)"]);
  });

  it("una tool desconocida no se disfraza: icono genérico y su nombre tal cual", () => {
    const c = new Colapsador();
    expect(c.lineas(ok("studio_edit_file"))).toEqual(["⚙ studio_edit_file"]);
  });

  it("al cerrar la racha dice la cuenta y los ficheros, en línea APARTE de la apertura", () => {
    const c = new Colapsador();
    c.lineas(ok("read_file", "app.xne"));
    c.lineas(ok("read_file", "Login.xne"));
    c.lineas(ok("read_file", "MenuPrincipal.xne"));
    // La apertura ya está pintada y no se puede reescribir (append-only): el cierre
    // es OTRA línea con el resumen completo. Este es el caso que se pagó: devolver las
    // dos pegadas en una cadena hacía que quien pinta escribiera basura en medio.
    expect(c.lineas(ok("glob", "*.xne"))).toEqual([
      "→ lee ×3 — app.xne, Login.xne, MenuPrincipal.xne",
      "✱ busca *.xne",
    ]);
  });

  it("más de tres ficheros: lista los tres primeros y «y N más»", () => {
    const c = new Colapsador();
    for (const f of ["a.xne", "b.xne", "c.xne", "d.xne", "e.xne"]) c.lineas(ok("read_file", f));
    expect(c.cierre()).toBe("→ lee ×5 — a.xne, b.xne, c.xne y 2 más");
  });

  it("el mismo fichero leído tres veces se cuenta una: «×3», fichero solo una vez", () => {
    const c = new Colapsador();
    c.lineas(ok("read_file", "app.xne"));
    c.lineas(ok("read_file", "app.xne"));
    c.lineas(ok("read_file", "app.xne"));
    expect(c.cierre()).toBe("→ lee ×3 — app.xne");
  });

  it("una racha sin detalle se cierra con la cuenta pelada", () => {
    const c = new Colapsador();
    c.lineas(ok("read_file"));
    c.lineas(ok("read_file"));
    expect(c.cierre()).toBe("→ lee ×2");

    const sinIcono = new Colapsador();
    sinIcono.lineas(ok("studio_read"));
    sinIcono.lineas(ok("studio_read"));
    expect(sinIcono.cierre()).toBe("⚙ studio_read ×2");
  });

  it("una racha de UNA no se repite como ×1", () => {
    const c = new Colapsador();
    expect(c.lineas(ok("glob", "*.xne"))).toEqual(["✱ busca *.xne"]);
    expect(c.cierre()).toBeNull();
  });

  it("un error NUNCA se colapsa y cierra la racha en curso", () => {
    const c = new Colapsador();
    c.lineas(ok("grep", "realizarLogin"));
    c.lineas(ok("grep", "validarRequerido"));
    expect(c.lineas({ nombre: "grep", detalle: "app.xml", error: "ENOENT" })).toEqual([
      "✱ busca ×2 — realizarLogin, validarRequerido",
      "✗ busca app.xml: ENOENT",
    ]);
  });

  it("un error de una tool desconocida sale con su nombre tal cual", () => {
    const c = new Colapsador();
    expect(c.lineas({ nombre: "x", error: "a" })).toEqual(["✗ x: a"]);
    expect(c.lineas({ nombre: "x", error: "b" })).toEqual(["✗ x: b"]);
  });
});
