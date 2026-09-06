import { describe, it, expect } from "vitest";
import { Colapsador, type EventoTool, type LineaDeTool } from "./notify.js";

const ok = (nombre: string, detalle?: string): EventoTool =>
  detalle === undefined ? { nombre } : { nombre, detalle };

/* Las líneas dejaron de ser cadenas sueltas: cada una dice de qué tool habla, para que la
   piel no tenga que deducirlo del icono. Estos tests siguen mirando el TEXTO, que es su
   asunto; de qué tool es cada línea lo comprueba el bloque del final. */
const textos = (lineas: LineaDeTool[]): string[] => lineas.map((l) => l.texto);

describe("Colapsador", () => {
  it("cada tool conocida abre su línea con icono, verbo y fichero, y calla las siguientes", () => {
    const c = new Colapsador();
    expect(textos(c.lineas(ok("read_file", "app.xne")))).toEqual(["→ lee app.xne"]);
    expect(textos(c.lineas(ok("read_file", "Login.xne")))).toEqual([]);
    expect(textos(c.lineas(ok("read_file", "MenuPrincipal.xne")))).toEqual([]);

    // El resto de las conocidas: mismo icono por familia, verbo propio.
    const una = (nombre: string, detalle: string): string[] =>
      textos(new Colapsador().lineas(ok(nombre, detalle)));
    expect(una("write_file", "app.xne")).toEqual(["← escribe app.xne"]);
    expect(una("edit_file", "Login.xne")).toEqual(["← edita Login.xne"]);
    expect(una("ls", "/")).toEqual(["→ lista /"]);
    expect(una("glob", "*.xne")).toEqual(["✱ busca *.xne"]);
    expect(una("grep", "realizarLogin")).toEqual(["✱ busca realizarLogin"]);
    expect(una("regex_search", "function\\s+(MT\\w+)")).toEqual(["✱ regex function\\s+(MT\\w+)"]);
  });

  it("una tool desconocida no se disfraza: icono genérico y su nombre tal cual", () => {
    const c = new Colapsador();
    expect(textos(c.lineas(ok("studio_edit_file")))).toEqual(["⚙ studio_edit_file"]);
  });

  it("al cerrar la racha dice la cuenta y los ficheros, en línea APARTE de la apertura", () => {
    const c = new Colapsador();
    c.lineas(ok("read_file", "app.xne"));
    c.lineas(ok("read_file", "Login.xne"));
    c.lineas(ok("read_file", "MenuPrincipal.xne"));
    // La apertura ya está pintada y no se puede reescribir (append-only): el cierre
    // es OTRA línea con el resumen completo. Este es el caso que se pagó: devolver las
    // dos pegadas en una cadena hacía que quien pinta escribiera basura en medio.
    expect(textos(c.lineas(ok("glob", "*.xne")))).toEqual([
      "→ lee ×3 — app.xne, Login.xne, MenuPrincipal.xne",
      "✱ busca *.xne",
    ]);
  });

  it("más de tres ficheros: lista los tres primeros y «y N ficheros más»", () => {
    const c = new Colapsador();
    for (const f of ["a.xne", "b.xne", "c.xne", "d.xne", "e.xne"]) c.lineas(ok("read_file", f));
    // «ficheros» y no «más» a secas: el ×N cuenta llamadas y esto cuenta ficheros distintos,
    // y sin la palabra las dos cifras parecían una sola cuenta que no cuadra.
    expect(c.cierre()?.texto).toBe("→ lee ×5 — a.xne, b.xne, c.xne y 2 ficheros más");
  });

  it("el mismo fichero leído tres veces se cuenta una: «×3», fichero solo una vez", () => {
    const c = new Colapsador();
    c.lineas(ok("read_file", "app.xne"));
    c.lineas(ok("read_file", "app.xne"));
    c.lineas(ok("read_file", "app.xne"));
    expect(c.cierre()?.texto).toBe("→ lee ×3 — app.xne");
  });

  it("una racha sin detalle se cierra con la cuenta pelada", () => {
    const c = new Colapsador();
    c.lineas(ok("read_file"));
    c.lineas(ok("read_file"));
    expect(c.cierre()?.texto).toBe("→ lee ×2");

    const sinIcono = new Colapsador();
    sinIcono.lineas(ok("studio_read"));
    sinIcono.lineas(ok("studio_read"));
    expect(sinIcono.cierre()?.texto).toBe("⚙ studio_read ×2");
  });

  it("una racha de UNA no se repite como ×1", () => {
    const c = new Colapsador();
    expect(textos(c.lineas(ok("glob", "*.xne")))).toEqual(["✱ busca *.xne"]);
    expect(c.cierre()).toBeNull();
  });

  it("un error NUNCA se colapsa y cierra la racha en curso", () => {
    const c = new Colapsador();
    c.lineas(ok("grep", "realizarLogin"));
    c.lineas(ok("grep", "validarRequerido"));
    expect(textos(c.lineas({ nombre: "grep", detalle: "app.xml", error: "ENOENT" }))).toEqual([
      "✱ busca ×2 — realizarLogin, validarRequerido",
      "✗ busca app.xml: ENOENT",
    ]);
  });

  it("cada línea dice de QUÉ tool es, y la de cierre es de la racha que se cierra", () => {
    // Es el caso que un `piel.tool(evento)` ingenuo habría etiquetado mal: el evento que
    // provoca las dos líneas es el `glob`, pero la primera cuenta la racha de `read_file`
    // que acaba de terminar. Sin esto, la piel pintaría «glob» sobre una línea de lecturas.
    const c = new Colapsador();
    c.lineas(ok("read_file", "app.xne"));
    c.lineas(ok("read_file", "Login.xne"));
    expect(c.lineas(ok("glob", "*.xne")).map((l) => l.nombre)).toEqual(["read_file", "glob"]);
  });

  it("la línea de un error lleva el motivo, además del nombre", () => {
    // Para que la piel pueda marcarla sin buscar el «✗» en la prosa: el icono es una
    // decisión de presentación y un día puede cambiar; el campo, no.
    const c = new Colapsador();
    expect(c.lineas({ nombre: "grep", error: "ENOENT" })[0]).toMatchObject({
      nombre: "grep",
      error: "ENOENT",
    });
  });

  it("un error de una tool desconocida sale con su nombre tal cual", () => {
    const c = new Colapsador();
    expect(textos(c.lineas({ nombre: "x", error: "a" }))).toEqual(["✗ x: a"]);
    expect(textos(c.lineas({ nombre: "x", error: "b" }))).toEqual(["✗ x: b"]);
  });
});
