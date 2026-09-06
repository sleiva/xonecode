import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import type { Acto } from "../tipos.js";
import { Trazas, filasDeTrazas, gruposDeTrazas } from "./Trazas.js";

afterEach(cleanup);

/** Dos turnos completos, con una racha de tools y un `fin` solo en el primero. */
const ACTOS: Acto[] = [
  { tipo: "sistema", texto: "consola lista" },
  { tipo: "usuario", texto: "lista las colecciones" },
  { tipo: "herramientas", lineas: ["grep  coleccion", "read_file  src/app.xne"] },
  { tipo: "asistente", texto: "hay tres" },
  { tipo: "fin", ms: 1200, modelo: "gemini/gemini-flash-latest" },
  { tipo: "usuario", texto: "y las vistas" },
  { tipo: "asistente", texto: "dos" },
];

describe("Trazas", () => {
  it("una fila por acto, etiquetada por tipo", () => {
    const filas = filasDeTrazas([
      { tipo: "usuario", texto: "haz algo" },
      { tipo: "herramientas", lineas: ["read_file  src/app.xne", "grep  coleccion"] },
      { tipo: "asistente", texto: "hecho" },
    ]);
    expect(filas.map((f) => f.etiqueta)).toEqual(["USUARIO", "TOOL", "TOOL", "ASISTENTE"]);
  });

  it("NINGUNA fila lleva argumentos de tool: deepseek los enseña, nosotros no podemos", () => {
    const filas = filasDeTrazas([
      { tipo: "herramientas", lineas: ["write_file  src/app.xne", "grep  ^function"] },
    ]);
    for (const f of filas) {
      expect(f.texto).not.toMatch(/[{}]/);
      expect(f.texto).not.toMatch(/"(command|content|file_text)"/);
    }
  });

  it("cada fila se trunca a una línea: las trazas es paisaje, no lectura", () => {
    const filas = filasDeTrazas([{ tipo: "asistente", texto: "a".repeat(500) }]);
    expect(filas[0].texto.length).toBeLessThanOrEqual(200);
  });

  it("pero el texto COMPLETO se conserva: es lo que el panel de detalle enseña", () => {
    // El recorte es de la TABLA. Si la fila se quedara solo con lo recortado, el panel no
    // tendría de dónde sacar el resto y abrirlo no aportaría nada sobre la propia fila.
    const filas = filasDeTrazas([{ tipo: "asistente", texto: "a".repeat(500) }]);
    expect(filas[0].completo.length).toBe(500);
  });

  it("un turno empieza en cada acto de USUARIO, y lo de antes no es de nadie", () => {
    // La frontera es el `usuario` y no el `fin`: un turno que revienta no siempre deja
    // `fin` —es el mismo motivo por el que el compositor no deduce de ahí si hay turno en
    // vuelo—, así que abrir por la petición es lo robusto. Y el saludo del arranque llega
    // ANTES de la primera, así que cae en el turno 0: llamarlo «Turno 1» le inventaría dueño.
    const grupos = gruposDeTrazas(filasDeTrazas(ACTOS));
    expect(grupos.map((g) => g.turno)).toEqual([0, 1, 2]);
    expect(grupos[0].filas.map((f) => f.etiqueta)).toEqual(["SISTEMA"]);
  });

  it("el total del turno es el `ms` del `fin`, y el turno sin `fin` no lo afirma", () => {
    // No se suman las fases: no cubren el turno entero, así que su suma no es ningún tiempo
    // real. Y `undefined` no es cero — el segundo turno sigue en curso.
    const grupos = gruposDeTrazas(filasDeTrazas(ACTOS));
    expect(grupos[1].ms).toBe(1200);
    expect(grupos[2].ms).toBeUndefined();
  });

  it("el buscador mira el texto COMPLETO, no el recortado", () => {
    // Si filtrara por lo que se ve, una palabra que cae más allá del carácter 200 no se
    // encontraría nunca: el buscador mentiría justo en las filas largas, que son las que se
    // vienen a buscar aquí.
    const largo = `${"a".repeat(400)} AGUJA`;
    render(<Trazas actos={[{ tipo: "asistente", texto: largo }]} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "aguja" } });
    expect(screen.queryByText(/Ninguna fila contiene/)).toBeNull();
  });

  it("elegir una fila abre el detalle con el texto entero, y el tiempo solo si lo hay", () => {
    render(<Trazas actos={ACTOS} />);
    fireEvent.click(screen.getByRole("button", { name: /hay tres/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Tiempos" }));
    // Un acto de asistente no trae `ms`. Poner «0 ms» sería una cifra inventada, y este
    // panel prefiere decir por qué no la tiene.
    expect(screen.getByText(/no lleva tiempo/)).not.toBeNull();
  });

  it("la etiqueta es el NOMBRE de la tool, y la que falló va aparte", () => {
    // Antes todas las líneas ponían «TOOL» y no distinguían una lectura de una escritura.
    // El nombre lo traía el evento desde siempre; lo que pasaba es que el acto lo tiraba al
    // componer el texto de la línea, y «→ lee app.xne» no dice `read_file` en ninguna parte.
    const filas = filasDeTrazas([
      {
        tipo: "herramientas",
        lineas: ["→ lee app.xne", "✗ busca x: ENOENT", "📋 plan de 2 tarea(s):"],
        detalles: [{ nombre: "read_file" }, { nombre: "grep", error: "ENOENT" }, {}],
      },
    ]);
    expect(filas.map((f) => f.etiqueta)).toEqual(["read_file", "grep", "PASO"]);
    expect(filas.map((f) => f.tipo)).toEqual(["tool", "toolError", "paso"]);
    expect(filas[1].error).toBe("ENOENT");
  });

  it("una línea que NO es de una tool se dice «PASO», no «TOOL»", () => {
    // Por el mismo canal que las tools viajan el plan, las tareas y la verificación
    // (`core/turno.ts` las escribe con el mismo `escribirLinea`). Etiquetarlas como
    // herramienta era afirmar que el agente llamó a algo que no llamó.
    const filas = filasDeTrazas([
      { tipo: "herramientas", lineas: ["▶  tarea 1/2"], detalles: [{}] },
    ]);
    expect(filas[0].etiqueta).toBe("PASO");
    expect(filas[0].nombre).toBeUndefined();
  });

  it("una sesión GUARDADA antes de esto no miente: se queda con la etiqueta genérica", () => {
    // La trampa de este cambio. Los `.jsonl` de las sesiones anteriores no traen `detalles`,
    // y `reabrirSesion` los relee con un `JSON.parse` a pelo — así que llegan sin el campo.
    // Ausente NO es «ninguna línea vino de una tool»: es «no se sabe». Tratarlo como vacío
    // marcaría como pasos del motor todas las herramientas de todo lo anterior.
    const filas = filasDeTrazas([{ tipo: "herramientas", lineas: ["→ lee app.xne"] }]);
    expect(filas[0].etiqueta).toBe("TOOL");
    expect(filas[0].tipo).toBe("tool");
  });

  it("la fase lleva su categoría, y sin ella se queda en la genérica", () => {
    const con = filasDeTrazas([{ tipo: "fase", texto: "verificando el proyecto", ms: 10, fase: "verificando" }]);
    expect(con[0].etiqueta).toBe("VERIFICANDO");
    // Sin categoría —sesión anterior— no se deduce del texto: la prosa vive en
    // `TEXTO_DE_FASE` y reescribirla rompería el filtro sin que nada avisara.
    const sin = filasDeTrazas([{ tipo: "fase", texto: "verificando el proyecto", ms: 10 }]);
    expect(sin[0].etiqueta).toBe("FASE");
  });

  it("se busca por el nombre de la tool aunque no salga en el texto de la línea", () => {
    // «→ lee app.xne» no contiene `read_file`. Buscar solo en el texto haría que el nombre
    // de la tool —que es justo lo que se teclea al venir aquí— no encontrara nada.
    render(
      <Trazas
        actos={[
          { tipo: "herramientas", lineas: ["→ lee app.xne"], detalles: [{ nombre: "read_file" }] },
        ]}
      />
    );
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "read_file" } });
    expect(screen.queryByText(/Ninguna fila contiene/)).toBeNull();
  });

  it("sin actos no pinta una tabla vacía: dice que no ha pasado nada", () => {
    render(<Trazas actos={[]} />);
    expect(screen.getByText(/no ha hecho nada/)).not.toBeNull();
  });
});
