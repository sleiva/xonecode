import { describe, expect, it } from "vitest";
import { crearBusquedaRegex, LIMITES_REGEX, llamadaDeBusqueda, NOMBRE_BUSQUEDA_REGEX } from "./busquedaRegex.js";

function backendFalso() {
  const leidos: string[] = [];
  return {
    leidos,
    backend: {
      async glob() {
        return {
          files: [
            { path: "/.env", is_dir: false, size: 20 },
            { path: "/login.js", is_dir: false, size: 200 },
            { path: "/Clientes.xne", is_dir: false, size: 200 },
          ],
        };
      },
      async readRaw(path: string) {
        leidos.push(path);
        return {
          data: {
            content: path === "/login.js" ? "function MTLogin(self) {}\nfunction auxiliar() {}" : '<prop onclick="MTLogin(self)" />',
            mimeType: "text/plain",
            created_at: "",
            modified_at: "",
          },
        };
      },
    },
  };
}

describe("regex_search", () => {
  it("localiza patrones por línea sin leer rutas protegidas", async () => {
    const { backend, leidos } = backendFalso();
    const resultado = await crearBusquedaRegex(backend as never).invoke({
      pattern: "function\\s+(MT\\w+)",
      glob: "**/*.js",
    });

    expect(resultado).toContain("/login.js:1: function MTLogin");
    expect(resultado).not.toContain("/.env");
    expect(leidos).toEqual(["/login.js", "/Clientes.xne"]);
  });

  it("rechaza una expresión inválida y limita el número solicitado", async () => {
    const { backend } = backendFalso();
    const herramienta = crearBusquedaRegex(backend as never);
    await expect(herramienta.invoke({ pattern: "(" })).resolves.toContain("Regex inválida");
    await expect(herramienta.invoke({ pattern: "x", max_count: LIMITES_REGEX.coincidencias + 1 })).rejects.toThrow();
  });
});

describe("llamadaDeBusqueda", () => {
  it("un nombre de colección va con `\\b` a los dos lados", () => {
    // Sin ellas, buscar `Clientes` encontraría también `ClientesViejos`.
    expect(llamadaDeBusqueda("Clientes")).toContain('"pattern":"\\\\bClientes\\\\b"');
  });

  it("el `\\b` se pone LADO A LADO, según el extremo sea palabra o no", () => {
    // `\b` es una frontera palabra/no-palabra, así que `\bcoll name=\b` no encuentra nada: el
    // `=` final ya no es palabra y la frontera cae donde no hay nada que delimitar. Delante sí
    // corresponde, porque `c` sí lo es. Salió de un test que EJECUTÓ la sugerencia.
    const p = JSON.parse(llamadaDeBusqueda("coll name=").split(" ").slice(1).join(" ")) as { pattern: string };
    expect(p.pattern).toBe("\\bcoll name=");
    expect(new RegExp(p.pattern).test('<coll name="Clientes">')).toBe(true);
  });

  it("y lo que en una regex significaría otra cosa se escapa", () => {
    const p = JSON.parse(llamadaDeBusqueda("Coll(rara)").split(" ").slice(1).join(" ")) as { pattern: string };
    expect(new RegExp(p.pattern).test("Coll(rara)")).toBe(true);
  });

  it("nombra la tool por su constante, no por una cadena copiada", () => {
    expect(llamadaDeBusqueda("X").startsWith(NOMBRE_BUSQUEDA_REGEX)).toBe(true);
  });
});
