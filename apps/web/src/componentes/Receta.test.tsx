import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Receta } from "./Receta.js";
import type { Receta as RecetaDelCable } from "../tipos.js";

afterEach(cleanup);

const PASO_EJECUTABLE = {
  titulo: "Descargar el emulador",
  comandos: ["sdkmanager --install emulator"],
  nota: "Son 2-3 GB.",
  hecho: false,
  ejecutable: true,
  acepta: "las licencias del SDK de Android de Google",
};

const RECETA: RecetaDelCable = {
  id: "android-emulador",
  titulo: "Instalar el emulador de Android",
  descripcion: "Cuatro pasos, una vez por máquina.",
  pasos: [
    { titulo: "Instalar las herramientas", comandos: ["brew install openjdk@17", "brew install --cask x"], nota: "Puede pedirte la contraseña.", hecho: true, ejecutable: false },
    { titulo: "Declarar las variables", comandos: ['export ANDROID_HOME="$(brew --prefix)/share/x"'], hecho: false, ejecutable: false },
  ],
  completa: false,
  despues: "Para arrancarlo: `emulator -avd pixel8`.",
};

describe("Receta", () => {
  it("enseña cada paso con su estado, numerado", () => {
    render(<Receta receta={RECETA} />);
    const pasos = screen.getAllByRole("listitem");
    expect(pasos).toHaveLength(2);
    // El estado va también en TEXTO y no solo en un color: un punto verde no lo lee nadie
    // con lector de pantalla, y aquí la diferencia entre hecho y pendiente es el dato.
    expect(within(pasos[0]!).getByLabelText("hecho")).toBeTruthy();
    expect(within(pasos[1]!).getByLabelText("pendiente")).toBeTruthy();
  });

  it("los comandos van juntos en un bloque, tal cual se pegan", () => {
    render(<Receta receta={RECETA} />);
    // Los dos `brew` en el MISMO bloque: son un paso, y copiarlos de uno en uno invita a
    // pegar el primero y olvidar el segundo.
    expect(screen.getByText(/brew install openjdk@17/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /copiar/i })).toHaveLength(2);
  });

  it("la nota de un paso se ve: es lo que hay que saber ANTES de pegarlo", () => {
    render(<Receta receta={RECETA} />);
    expect(screen.getByText(/contraseña/i)).toBeTruthy();
  });

  it("cuando está completa NO enseña los pasos, lo dice y ya", () => {
    // Cuatro pasos marcados es ruido en la ventana de quien ya lo tiene instalado.
    render(<Receta receta={{ ...RECETA, completa: true }} />);
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByText(/ya está/i)).toBeTruthy();
  });

  it("y lo que viene después se dice siempre, también completa", () => {
    // Arrancar el emulador no está cableado: el comando es lo único honesto que dar.
    const { unmount } = render(<Receta receta={RECETA} />);
    expect(screen.getByText(/emulator -avd pixel8/)).toBeTruthy();
    unmount();
    render(<Receta receta={{ ...RECETA, completa: true }} />);
    expect(screen.getByText(/emulator -avd pixel8/)).toBeTruthy();
  });

  it("un paso que NO es ejecutable no ofrece botón: solo se copia", () => {
    render(<Receta receta={RECETA} />);
    expect(screen.queryByRole("button", { name: /ejecutar/i })).toBeNull();
  });

  it("uno ejecutable ofrece el botón y DICE qué se acepta al pulsarlo", () => {
    const ejecutar = vi.fn();
    render(<Receta receta={{ ...RECETA, pasos: [PASO_EJECUTABLE] }} alEjecutar={ejecutar} />);
    // Aceptar una licencia en nombre de alguien no puede ser un efecto de rebote: se enseña
    // al lado del botón, y pulsar ES la aceptación.
    expect(screen.getByText(/licencias del SDK de Android/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ejecutar/i }));
    expect(ejecutar).toHaveBeenCalledWith(1);
  });

  it("sin manejador el botón no se pinta: no hay botón muerto", () => {
    render(<Receta receta={{ ...RECETA, pasos: [PASO_EJECUTABLE] }} />);
    expect(screen.queryByRole("button", { name: /ejecutar/i })).toBeNull();
  });

  it("un paso ejecutable que aún no puede DICE por qué, en vez de un botón apagado sin motivo", () => {
    render(
      <Receta
        receta={{ ...RECETA, pasos: [{ ...PASO_EJECUTABLE, ejecutable: false, porQueNo: "hace falta el paso 1" }] }}
        alEjecutar={vi.fn()}
      />
    );
    expect(screen.getByText(/hace falta el paso 1/i)).toBeTruthy();
    // Y ahí «todavía» es cierto: el paso 1 lo desbloquea.
    expect(screen.getByText(/no se puede lanzar todavía/i)).toBeTruthy();
  });

  it("un motivo que NO cambia nunca no dice «todavía»: prometería un botón que no va a venir", () => {
    // La receta de iOS tiene tres: Xcode se instala del App Store, la licencia lleva `sudo`
    // escrito y `-downloadPlatform` pide autorización en una ventana del sistema. Ninguno de
    // los tres se arregla haciendo otro paso.
    render(
      <Receta
        receta={{
          ...RECETA,
          pasos: [{ ...PASO_EJECUTABLE, ejecutable: false, porQueNo: "lleva `sudo`, y la contraseña solo se puede teclear en un terminal" }],
        }}
        alEjecutar={vi.fn()}
      />
    );
    expect(screen.getByText(/no se lanza desde aquí/i)).toBeTruthy();
    expect(screen.queryByText(/todavía/i)).toBeNull();
  });

  it("mientras corre enseña el log, el tiempo y CANCELAR, no el botón de ejecutar", () => {
    const cancelar = vi.fn();
    render(
      <Receta
        receta={{ ...RECETA, pasos: [PASO_EJECUTABLE] }}
        alEjecutar={vi.fn()}
        alCancelar={cancelar}
        instalacion={{ receta: "android-emulador", paso: 1, titulo: "Descargando", estado: "corriendo", lineas: ["58%", "Unzipping"], ms: 65_000 }}
      />
    );
    // El log es UN `<pre>` con las líneas dentro, así que se busca por contenido.
    expect(screen.getByText(/Unzipping/)).toBeTruthy();
    // El tiempo es lo que dice que sigue vivo cuando la última línea lleva un rato quieta.
    expect(screen.getByText(/1 min 5 s/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ejecutar/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(cancelar).toHaveBeenCalled();
  });

  it("el log de OTRO paso no se pinta en este", () => {
    // El estado es uno para toda la máquina: sin comprobar el número, el log del paso 3
    // aparecería también bajo el 4.
    render(
      <Receta
        receta={{ ...RECETA, pasos: [PASO_EJECUTABLE] }}
        alEjecutar={vi.fn()}
        instalacion={{ receta: "android-emulador", paso: 9, titulo: "Otro", estado: "corriendo", lineas: ["58%"], ms: 10 }}
      />
    );
    expect(screen.queryByText(/58%/)).toBeNull();
    expect(screen.getByRole("button", { name: /ejecutar/i })).toBeTruthy();
  });

  it("un fallo se queda a la vista con su motivo, y se puede reintentar", () => {
    render(
      <Receta
        receta={{ ...RECETA, pasos: [PASO_EJECUTABLE] }}
        alEjecutar={vi.fn()}
        instalacion={{ receta: "android-emulador", paso: 1, titulo: "Descargando", estado: "fallo", lineas: [], ms: 10, motivo: "Failed to find package" }}
      />
    );
    expect(screen.getByText(/Failed to find package/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /ejecutar/i })).toBeTruthy();
  });

  it("«terminó bien» y «ya está» son dos cosas: si la medida no lo ve, se dice", () => {
    // Medido con un `sdkmanager` de mentira que no crea nada: el proceso salió con código 0
    // y la marca del paso seguía hueca, con un «Hecho» al lado. Dos afirmaciones que se
    // contradicen dejan al lector eligiendo a cuál creer.
    render(
      <Receta
        receta={{ ...RECETA, pasos: [{ ...PASO_EJECUTABLE, hecho: false }] }}
        alEjecutar={vi.fn()}
        instalacion={{ receta: "android-emulador", paso: 1, titulo: "Descargando", estado: "ok", lineas: [], ms: 10 }}
      />
    );
    expect(screen.getByText(/la medida sigue sin encontrarlo/i)).toBeTruthy();
  });

  it("y si la medida SÍ lo ve, dice «Hecho» y ya", () => {
    render(
      <Receta
        receta={{ ...RECETA, pasos: [{ ...PASO_EJECUTABLE, hecho: true }] }}
        alEjecutar={vi.fn()}
        instalacion={{ receta: "android-emulador", paso: 1, titulo: "Descargando", estado: "ok", lineas: [], ms: 10 }}
      />
    );
    expect(screen.getByText("Hecho")).toBeTruthy();
  });
});
