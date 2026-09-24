import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import type { ConectorDelCable } from "../tipos.js";
import { Conectores } from "./Conectores.js";

afterEach(cleanup);

const CATALOGO = [
  { id: "deepwiki", nombre: "DeepWiki", descripcion: "Lee documentación de GitHub.", autenticacion: "ninguna" as const },
  { id: "jira", nombre: "Jira", descripcion: "Busca y crea incidencias.", autenticacion: "oauth" as const },
  { id: "notion", nombre: "Notion", descripcion: "Busca y lee páginas.", autenticacion: "oauth" as const },
];

const base = (extra: Partial<ConectorDelCable> = {}): ConectorDelCable => ({
  id: "notion",
  estado: "autorizado",
  ...extra,
});

const props = (extra: Partial<Parameters<typeof Conectores>[0]> = {}) => ({
  catalogo: CATALOGO,
  conectores: [] as ConectorDelCable[],
  desconocidos: [] as string[],
  alAccion: vi.fn(),
  ...extra,
});

describe("Conectores", () => {
  it("pinta los dos grupos, cada uno con su cuenta", () => {
    render(
      <Conectores
        {...props({
          conectores: [base({ id: "notion" }), base({ id: "jira", estado: "falta-autorizar" })],
        })}
      />
    );
    expect(screen.getByText("Configurados").textContent).toContain("2");
    // DeepWiki es el único que no se ha añadido: Disponibles trae 1.
    expect(screen.getByText("Disponibles").textContent).toContain("1");
    expect(screen.getByText("DeepWiki")).not.toBeNull();
  });

  it("las dos notas fijas de límite siempre están, con datos o sin ellos", () => {
    render(<Conectores {...props()} />);
    expect(screen.getByText(/todavía no llegan a ningún agente/)).not.toBeNull();
    expect(screen.getByText(/por un túnel no vuelve/)).not.toBeNull();
  });

  it("sin `prueba` la pastilla dice «Sin probar»", () => {
    render(<Conectores {...props({ conectores: [base({ estado: "autorizado" })] })} />);
    expect(screen.getByText("Sin probar")).not.toBeNull();
  });

  it("`autorizando` manda sobre `falta-autorizar`: «Esperando al navegador…»", () => {
    render(
      <Conectores {...props({ conectores: [base({ estado: "falta-autorizar", autorizando: true })] })} />
    );
    expect(screen.getByText("Esperando al navegador…")).not.toBeNull();
  });

  it("`falta-autorizar` sin `autorizando` ni prueba: «Falta autorizar»", () => {
    render(<Conectores {...props({ conectores: [base({ estado: "falta-autorizar" })] })} />);
    expect(screen.getByText("Falta autorizar")).not.toBeNull();
  });

  it("`prueba.ok:true` manda sobre todo: «Conectado · N tools», también mientras autorizando", () => {
    render(
      <Conectores
        {...props({
          conectores: [
            base({
              autorizando: true,
              prueba: { cuando: 1, ok: true, tools: [{ nombre: "search" }, { nombre: "read" }] },
            }),
          ],
        })}
      />
    );
    expect(screen.getByText("Conectado · 2 tools")).not.toBeNull();
  });

  it("`prueba.ok:false` enseña «No responde», con el motivo en el `title` y bajo la fila", () => {
    render(
      <Conectores
        {...props({
          conectores: [base({ prueba: { cuando: 1, ok: false, motivo: "no responde (HTTP 503)" } })],
        })}
      />
    );
    const pastilla = screen.getByText("No responde");
    expect(pastilla.getAttribute("title")).toBe("no responde (HTTP 503)");
    // Y en texto, bajo la fila: un `title` no lo lee nadie que no pase el ratón por encima.
    expect(screen.getByText("no responde (HTTP 503)")).not.toBeNull();
  });

  it("desplegar la fila enseña las tools, con su descripción y «solo lectura»", () => {
    render(
      <Conectores
        {...props({
          conectores: [
            base({
              prueba: {
                cuando: 1,
                ok: true,
                tools: [
                  { nombre: "search", descripcion: "Busca páginas.", soloLectura: true },
                  { nombre: "create_page" },
                ],
              },
            }),
          ],
        })}
      />
    );
    expect(screen.queryByText("search")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(screen.getByText("search")).not.toBeNull();
    expect(screen.getByText("Busca páginas.")).not.toBeNull();
    expect(screen.getByText("solo lectura")).not.toBeNull();
    expect(screen.getByText("create_page")).not.toBeNull();
  });

  it("con `prueba.ok` y cero tools dice «no expone ninguna tool»", () => {
    render(
      <Conectores
        {...props({ conectores: [base({ prueba: { cuando: 1, ok: true, tools: [] } })] })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(screen.getByText("no expone ninguna tool")).not.toBeNull();
  });

  describe("los botones mandan su acción exacta, con el id", () => {
    it("«Probar» y «Quitar» están siempre", () => {
      const alAccion = vi.fn();
      render(<Conectores {...props({ conectores: [base({ id: "deepwiki", estado: "sin-autorizacion" })], alAccion })} />);
      fireEvent.click(screen.getByRole("button", { name: "Probar" }));
      expect(alAccion).toHaveBeenCalledWith("probar", "deepwiki");
      fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
      expect(alAccion).toHaveBeenCalledWith("quitar", "deepwiki");
    });

    it("«Conectar» solo con OAuth sin autorizar, y manda `autorizar`", () => {
      const alAccion = vi.fn();
      render(<Conectores {...props({ conectores: [base({ id: "jira", estado: "falta-autorizar" })], alAccion })} />);
      fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
      expect(alAccion).toHaveBeenCalledWith("autorizar", "jira");
    });

    it("mientras `autorizando` el botón SIGUE, rotulado «Volver a abrir»", () => {
      render(
        <Conectores {...props({ conectores: [base({ id: "jira", estado: "falta-autorizar", autorizando: true })] })} />
      );
      expect(screen.getByRole("button", { name: "Volver a abrir" })).not.toBeNull();
      expect(screen.queryByRole("button", { name: "Conectar" })).toBeNull();
    });

    it("sin autenticación no hay botón «Conectar»", () => {
      render(<Conectores {...props({ conectores: [base({ id: "deepwiki", estado: "sin-autorizacion" })] })} />);
      expect(screen.queryByRole("button", { name: /^Conectar/ })).toBeNull();
    });

    it("«Desconectar» solo con OAuth autorizado, y manda `desconectar`", () => {
      const alAccion = vi.fn();
      render(<Conectores {...props({ conectores: [base({ id: "notion", estado: "autorizado" })], alAccion })} />);
      fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
      expect(alAccion).toHaveBeenCalledWith("desconectar", "notion");
    });

    it("sin autorizar todavía no hay botón «Desconectar»", () => {
      render(<Conectores {...props({ conectores: [base({ id: "notion", estado: "falta-autorizar" })] })} />);
      expect(screen.queryByRole("button", { name: "Desconectar" })).toBeNull();
    });

    it("«Añadir» en Disponibles manda `anadir` con el id del catálogo", () => {
      const alAccion = vi.fn();
      render(<Conectores {...props({ alAccion })} />);
      fireEvent.click(screen.getAllByRole("button", { name: "Añadir" })[0]!);
      expect(alAccion).toHaveBeenCalledWith("anadir", "deepwiki");
    });
  });

  it("`error` sale como una línea con `role=\"status\"` encima de las listas", () => {
    render(<Conectores {...props({ error: "no se pudo guardar" })} />);
    expect(screen.getByRole("status").textContent).toBe("no se pudo guardar");
  });

  it("`ilegible` sustituye a «Configurados · N»: ausente ≠ vacío", () => {
    render(<Conectores {...props({ ilegible: true })} />);
    expect(screen.queryByText("Configurados")).toBeNull();
    expect(screen.getByText(/no se pudo leer/i).textContent).toContain("conectores.json");
    // Disponibles sigue existiendo: con el fichero ilegible no hay nada añadido.
    expect(screen.getByText("Disponibles")).not.toBeNull();
  });

  it("`desconocidos` no vacío se nombra en una línea propia", () => {
    render(<Conectores {...props({ desconocidos: ["slack", "linear"] })} />);
    expect(screen.getByText(/esta versión no conoce/).textContent).toContain("slack, linear");
  });
});
