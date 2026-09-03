import { describe, expect, it } from "vitest";
import { crearBusquedaRegex, LIMITES_REGEX } from "./busquedaRegex.js";

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
