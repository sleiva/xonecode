import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Barra } from "./Barra.js";

afterEach(cleanup);

/**
 * El comportamiento de `Barra` en sí —`Barra.test.tsx` es la disciplina de estilos
 * compartida por TODOS los `.module.css` del directorio, no un test de este componente—.
 *
 * Los tres niveles pueden llegar vacíos (`entornos`/`proyectos` SÍ llegan poblados desde
 * `App.tsx` cuando hay algo que contar — `sesiones` de cada proyecto sigue vacía siempre,
 * ver el comentario de cabecera de `Barra.tsx`), y cada nivel tiene que decir por qué en
 * vez de no pintar nada — que es indistinguible de una barra rota.
 */
describe("Barra: los tres niveles vacíos se explican solos", () => {
  function montar(proyectos: Parameters<typeof Barra>[0]["proyectos"] = []) {
    return render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={proyectos}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
  }

  it("sin entornos no hay `<select>` desnudo: hay un texto que dice por qué", () => {
    montar();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText(/sin entorno que enseñar/i)).toBeTruthy();
  });

  it("sin proyectos, lo mismo en su nivel", () => {
    montar();
    expect(screen.getByText(/sin proyectos que enseñar/i)).toBeTruthy();
  });

  it("un proyecto sin sesiones lo dice EN su propia fila, no calla", () => {
    montar([{ id: "p1", nombre: "harnees", sesiones: [] }]);
    expect(screen.getByText("harnees")).toBeTruthy();
    expect(screen.getByText(/sin sesiones todavía/i)).toBeTruthy();
  });

  it("«nueva sesión» viaja con el id del proyecto de su propia fila", () => {
    const alNuevaSesion = vi.fn();
    render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={[{ id: "p1", nombre: "harnees", sesiones: [] }]}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={alNuevaSesion}
        alAbrirAjustes={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /nueva sesión en harnees/i }));
    expect(alNuevaSesion).toHaveBeenCalledWith("p1");
  });

  it("el nombre del proyecto ES el botón que lo abre: viaja con SU id, no el del primero de la lista", () => {
    const alAbrirProyecto = vi.fn();
    render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={[
          { id: "p1", nombre: "harnees", sesiones: [] },
          { id: "p2", nombre: "tienda", sesiones: [] },
        ]}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={alAbrirProyecto}
        alNuevaSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "tienda" }));
    expect(alAbrirProyecto).toHaveBeenCalledWith("p2");
    expect(alAbrirProyecto).not.toHaveBeenCalledWith("p1");
  });

  it("«Ajustes» es una ENTRADA de verdad, no un rótulo: se pulsa y avisa", () => {
    // Cambio de rumbo del usuario: antes el pie eran dos líneas de texto suelto
    // («/config y /modelo, desde el compositor»), que se leían como una nota al pie y no
    // como algo que se pueda pulsar. Ahora ocupa el mismo asiento que el «Settings» de
    // la referencia (`estilos/SettingsRoot.module.css`) y es un botón. Que un botón
    // exista no basta: este test exige que LLAME a alguien — un botón que no hace nada
    // es el fallo mudo que este repo persigue.
    const alAbrirAjustes = vi.fn();
    render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={[]}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAbrirAjustes={alAbrirAjustes}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    expect(alAbrirAjustes).toHaveBeenCalledTimes(1);
  });

  it("con entorno y proyecto reales, el select y la lista de sesiones siguen ahí", () => {
    render(
      <Barra
        entornos={[{ id: "e1", nombre: "XOne WebStudio" }]}
        entornoActivo="e1"
        proyectos={[{ id: "p1", nombre: "harnees", sesiones: [{ id: "s1", titulo: "Hola", historica: false }] }]}
        sesionActiva="s1"
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hola" })).toBeTruthy();
  });
});
