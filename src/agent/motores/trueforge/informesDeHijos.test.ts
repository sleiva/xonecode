import { describe, expect, it } from "vitest";
import { anotarEscritura, capacidadDeInformesDeHijos, escrituraConExito, textoDelInforme, type CambioDeFichero } from "./informesDeHijos.js";

describe("lo que escribió un hijo, contado por el harness", () => {
  it("suma ediciones y líneas por fichero; un write que crea es «nuevo»", () => {
    const c = new Map<string, CambioDeFichero>();
    anotarEscritura(c, "write_file", { file_path: "/icons/a.svg", content: "<svg>\n</svg>\n" });
    anotarEscritura(c, "edit_file", { file_path: "/Menu.xne", old_string: "a\nb", new_string: "a\nb\nc" });
    anotarEscritura(c, "edit_file", { file_path: "/Menu.xne", old_string: "x", new_string: "" });
    anotarEscritura(c, "read_file", { file_path: "/Menu.xne" });
    expect(c.get("/icons/a.svg")).toEqual({ ediciones: 1, nuevo: true, mas: 2, menos: 0 });
    expect(c.get("/Menu.xne")).toEqual({ ediciones: 2, nuevo: false, mas: 3, menos: 3 });
  });

  it("el informe nombra ficheros y cifras, nunca el contenido", () => {
    const c = new Map<string, CambioDeFichero>();
    anotarEscritura(c, "edit_file", { file_path: "/Menu.xne", old_string: "SECRETO", new_string: "OTRO" });
    const t = textoDelInforme("designer-xone", c, true)!;
    expect(t).toContain("- /Menu.xne: 1 edición(es), +1 −1 líneas");
    expect(t).not.toContain("SECRETO");
    expect(t).not.toContain("OTRO");
  });

  it("quien podía escribir y no escribió se DICE; a quien no podía no se le atribuye nada", () => {
    expect(textoDelInforme("developer-xone", new Map(), true)).toContain("SIN escribir ningún fichero");
    expect(textoDelInforme("device-controller", new Map(), false)).toBeUndefined();
  });

  it("solo cuenta la que salió bien", () => {
    expect(escrituraConExito("Successfully replaced 1 occurrence(s) in /a.js")).toBe(true);
    expect(escrituraConExito("write_file solo crea ficheros nuevos…")).toBe(false);
    expect(escrituraConExito(undefined)).toBe(false);
  });

  it("la capacidad entrega los pendientes de ESE hilo una sola vez", async () => {
    const cola = new Map([["padre", ["uno", "dos"]]]);
    const cap = capacidadDeInformesDeHijos((h) => {
      const t = cola.get(h) ?? [];
      cola.delete(h);
      return t;
    });
    const proc = (cap.capability as { preLLMProcessors: { processPreLLM(e: { threadId: string }): AsyncGenerator<unknown> }[] }).preLLMProcessors[0]!;
    const sacar = async (hilo: string) => {
      const out: unknown[] = [];
      for await (const e of proc.processPreLLM({ threadId: hilo })) out.push(e);
      return out;
    };
    expect(await sacar("otro")).toEqual([]);
    expect(await sacar("padre")).toEqual([{ type: "internal.agent.context.append", context: [{ role: "user", content: "uno\n\ndos" }], output: [] }]);
    expect(await sacar("padre")).toEqual([]);
  });
});
