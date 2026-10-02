import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Ficheros } from "./Ficheros.js";
import type { ControlDeEdicion, EstadoDeEdicion } from "../usarEdicion.js";
import { prepararJsdomParaElEditor } from "../editor/jsdomParaElEditor.js";

afterEach(cleanup);
const NADA = () => {};
const ARBOL = { rutas: ["app.xml", "src/Clientes.xne", "src/Pedidos.xne"], recortado: false };
const AQUI = dirname(fileURLToPath(import.meta.url));

describe("Ficheros", () => {
  it("pide el árbol al montar: entrar a mirar ES la petición", () => {
    const recargar = vi.fn();
    render(<Ficheros contenidos={{}} alElegir={NADA} alRecargar={recargar} />);
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/consultando el árbol/i)).toBeTruthy();
  });

  it("vuelve a pedir el árbol si se queda SIN él: cambiar de proyecto no deja la pestaña colgada", () => {
    // Al cambiar de proyecto el store tira el árbol (es del anterior) y este componente NO
    // se desmonta: con la petición solo en el montaje, la pestaña se quedaba en
    // «Consultando el árbol…» para siempre. Medido en el navegador.
    const recargar = vi.fn();
    const { rerender } = render(<Ficheros arbol={ARBOL} contenidos={{}} alElegir={NADA} alRecargar={recargar} />);
    expect(recargar).not.toHaveBeenCalled(); // ya lo tiene: no hay nada que pedir
    rerender(<Ficheros contenidos={{}} alElegir={NADA} alRecargar={recargar} />);
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/consultando el árbol/i)).toBeTruthy();
  });

  it("sin cable no se pide nada, y la reconexión lo recupera", () => {
    const recargar = vi.fn();
    const { rerender } = render(<Ficheros contenidos={{}} alElegir={NADA} alRecargar={recargar} conectado={false} />);
    // Pedirlo con el cable caído sería perder la petición sin decirlo.
    expect(recargar).not.toHaveBeenCalled();
    rerender(<Ficheros contenidos={{}} alElegir={NADA} alRecargar={recargar} conectado={true} />);
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("un árbol con error lo dice, y no enseña un proyecto vacío", () => {
    render(<Ficheros arbol={{ rutas: [], recortado: false, error: "disco roto" }} contenidos={{}} alElegir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/disco roto/)).toBeTruthy();
    expect(screen.queryByRole("tree")).toBeNull();
  });

  it("un árbol recortado lo dice", () => {
    render(<Ficheros arbol={{ ...ARBOL, recortado: true }} contenidos={{}} alElegir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/recortado/i)).toBeTruthy();
  });

  it("el filtro deja ver lo que casa y esconde lo demás", () => {
    render(<Ficheros arbol={ARBOL} contenidos={{}} alElegir={NADA} alRecargar={NADA} />);
    fireEvent.change(screen.getByPlaceholderText(/filtrar/i), { target: { value: "cli" } });
    expect(screen.getByRole("treeitem", { name: "Clientes.xne" })).toBeTruthy();
    expect(screen.queryByRole("treeitem", { name: "Pedidos.xne" })).toBeNull();
  });

  it("pulsar una hoja la elige; sin elegido se invita a elegir", () => {
    const alElegir = vi.fn();
    render(<Ficheros arbol={ARBOL} contenidos={{}} alElegir={alElegir} alRecargar={NADA} />);
    expect(screen.getByText(/elige un fichero/i)).toBeTruthy();
    // El árbol del PROYECTO nace todo plegado, así que hay que abrir la carpeta primero.
    fireEvent.click(screen.getByRole("treeitem", { name: "src" }));
    fireEvent.click(screen.getByRole("treeitem", { name: "Clientes.xne" }));
    expect(alElegir).toHaveBeenCalledWith("src/Clientes.xne");
  });

  it("el árbol del proyecto nace PLEGADO: las carpetas del primer nivel también", () => {
    render(<Ficheros arbol={ARBOL} contenidos={{}} alElegir={NADA} alRecargar={NADA} />);
    expect(screen.getByRole("treeitem", { name: "src" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("treeitem", { name: "Clientes.xne" })).toBeNull();
  });

  it("elegido sin contenido todavía: «trayendo»", () => {
    render(<Ficheros arbol={ARBOL} contenidos={{}} elegido="app.xml" alElegir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/trayendo/i)).toBeTruthy();
  });

  it("un binario dice que lo es y su tamaño, sin visor", () => {
    render(
      <Ficheros arbol={ARBOL} contenidos={{ "app.xml": { ruta: "app.xml", recortado: false, binario: true, bytes: 2048 } }} elegido="app.xml" alElegir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/binario/i)).toBeTruthy();
    expect(screen.getByText(/2 KB/)).toBeTruthy();
    expect(screen.queryByText("Copiar")).toBeNull();
  });

  it("latin1 y recorte se dicen encima del contenido", () => {
    render(
      <Ficheros
        arbol={ARBOL}
        contenidos={{ "app.xml": { ruta: "app.xml", texto: "<app/>", recortado: true, binario: false, bytes: 500000, codificacion: "latin1" } }}
        elegido="app.xml"
        alElegir={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText(/leído como latin1/i)).toBeTruthy();
    expect(screen.getByText(/recortado a/i)).toBeTruthy();
  });

  it("una ruta rechazada dice el motivo", () => {
    render(
      <Ficheros arbol={ARBOL} contenidos={{ "app.xml": { ruta: "app.xml", recortado: false, binario: false, bytes: 0, error: "está fuera del proyecto" } }} elegido="app.xml" alElegir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/no se puede enseñar este fichero/i)).toBeTruthy();
    expect(screen.getByText(/fuera del proyecto/)).toBeTruthy();
  });

  it("si el elegido desaparece del árbol nuevo, se cierra", () => {
    const alElegir = vi.fn();
    render(<Ficheros arbol={ARBOL} contenidos={{}} elegido="borrado.xne" alElegir={alElegir} alRecargar={NADA} />);
    expect(alElegir).toHaveBeenCalledWith(undefined);
  });

  it("con el árbol RECORTADO el elegido NO se cierra aunque no esté en la lista", () => {
    // Un fichero real más allá del tope de entradas no sale en la lista, y cerrarlo por
    // eso haría desaparecer lo que se estaba leyendo sin ningún motivo.
    const alElegir = vi.fn();
    render(<Ficheros arbol={{ ...ARBOL, recortado: true }} contenidos={{}} elegido="mas-alla.xne" alElegir={alElegir} alRecargar={NADA} />);
    expect(alElegir).not.toHaveBeenCalled();
  });

  it("una imagen se PINTA con una url de datos, y su alt es la ruta", () => {
    render(
      <Ficheros
        arbol={{ rutas: ["logo.png"], recortado: false }}
        contenidos={{ "logo.png": { ruta: "logo.png", recortado: false, binario: true, bytes: 3072, mime: "image/png", base64: "QUJD" } }}
        elegido="logo.png"
        alElegir={NADA}
        alRecargar={NADA}
      />
    );
    const img = screen.getByAltText("logo.png") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("data:image/png;base64,QUJD");
    // Es una imagen, no «un fichero binario»: la palabra ya no aparece.
    expect(screen.queryByText(/binario/i)).toBeNull();
    // Y no hay interruptor: un PNG no tiene fuente que leer.
    expect(screen.queryByRole("button", { name: "Fuente" })).toBeNull();
  });

  it("una imagen que no cupo se dice COMO IMAGEN, no como un binario cualquiera", () => {
    render(
      <Ficheros
        arbol={{ rutas: ["mapa.png"], recortado: false }}
        contenidos={{ "mapa.png": { ruta: "mapa.png", recortado: false, binario: true, bytes: 9_000_000, mime: "image/png" } }}
        elegido="mapa.png"
        alElegir={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText(/es una imagen de/i)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("un markdown se enseña RENDERIZADO, y el interruptor lleva a su fuente", () => {
    render(
      <Ficheros
        arbol={{ rutas: ["LEEME.md"], recortado: false }}
        contenidos={{ "LEEME.md": { ruta: "LEEME.md", texto: "# Título\n\ncon $http dentro", recortado: false, binario: false, bytes: 30 } }}
        elegido="LEEME.md"
        alElegir={NADA}
        alRecargar={NADA}
      />
    );
    // Renderizado: hay un encabezado de verdad, no una almohadilla.
    expect(screen.getByRole("heading", { name: "Título" })).toBeTruthy();
    // Y el dólar de XOne sobrevive: `protegerDolares` impide que se lo coma el lector de TeX.
    expect(screen.getByText(/\$http/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fuente" }));
    expect(screen.queryByRole("heading", { name: "Título" })).toBeNull();
  });

  it("un markdown con imágenes del proyecto las PINTA: su vista, con la URL absoluta de la ruta que las sirve", () => {
    // El visor solo pinta imágenes `http(s)` absolutas: con el enlace relativo del `.md`, lo que
    // salía era el texto alternativo.
    render(
      <Ficheros
        arbol={{ rutas: ["doc/m.md"], recortado: false }}
        contenidos={{
          "doc/m.md": {
            ruta: "doc/m.md",
            texto: "![Pantalla de login](img/login.png)",
            vista: "![Pantalla de login](/imagen-del-proyecto?ruta=doc%2Fimg%2Flogin.png)",
            recortado: false,
            binario: false,
            bytes: 35,
          },
        }}
        elegido="doc/m.md"
        alElegir={NADA}
        alRecargar={NADA}
      />
    );
    const img = screen.getByRole("img", { name: "Pantalla de login" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(`${window.location.origin}/imagen-del-proyecto?ruta=doc%2Fimg%2Flogin.png`);
    // Y la fuente sigue siendo el fichero tal cual.
    fireEvent.click(screen.getByRole("button", { name: "Fuente" }));
    expect(screen.getByText(/img\/login\.png/)).toBeTruthy();
  });

  it("un SVG enseña el dibujo Y el código a la vez, sin interruptor", () => {
    render(
      <Ficheros
        arbol={{ rutas: ["icono.svg"], recortado: false }}
        contenidos={{
          "icono.svg": { ruta: "icono.svg", texto: "<svg viewBox=\"0 0 1 1\"/>", recortado: false, binario: false, bytes: 6, mime: "image/svg+xml", base64: "PHN2Zy8+" },
        }}
        elegido="icono.svg"
        alElegir={NADA}
        alRecargar={NADA}
      />
    );
    // El dibujo, por una url de datos y nunca inyectando el marcado en el DOM.
    expect((screen.getByAltText("icono.svg") as HTMLImageElement).getAttribute("src")).toBe("data:image/svg+xml;base64,PHN2Zy8+");
    // Y el código debajo, en el mismo pantallazo.
    expect(screen.getByText(/Código/)).toBeTruthy();
    expect(screen.getByText(/viewBox/)).toBeTruthy();
    // Nada de alternar: no hay interruptor que esconda una de las dos mitades.
    expect(screen.queryByRole("button", { name: "Fuente" })).toBeNull();
  });

  it("un SVG que hubo que recortar se queda solo con el código, y lo dice", () => {
    render(
      <Ficheros
        arbol={{ rutas: ["mapa.svg"], recortado: false }}
        contenidos={{
          "mapa.svg": { ruta: "mapa.svg", texto: "<svg", recortado: true, binario: false, bytes: 900000, mime: "image/svg+xml" },
        }}
        elegido="mapa.svg"
        alElegir={NADA}
        alRecargar={NADA}
      />
    );
    // Sin `base64` no hay dibujo que pintar: uno a medias no abre.
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/recortado a/i)).toBeTruthy();
  });

  it("en estrecho el árbol sube por encima del visor con order, sin reordenar el DOM", () => {
    // El DOM se queda con el visor primero (Tab en el layout ancho); en estrecho es
    // `order: -1` sobre `.arbol` quien lo pone visualmente arriba.
    const hoja = readFileSync(join(AQUI, "Ficheros.module.css"), "utf8");
    expect(hoja).toMatch(/@container[^{]*\{[\s\S]*?\.arbol\s*\{[^}]*order:\s*-1/);
  });
});

describe("Ficheros: editar", () => {
  beforeAll(prepararJsdomParaElEditor);
  const UTF8 = { ruta: "src/Clientes.xne", texto: "<coll/>", recortado: false, binario: false, bytes: 7, codificacion: "utf-8" as const, huella: "h1" };
  const EDITANDO: EstadoDeEdicion = { ruta: "src/Clientes.xne", proyecto: "p1", original: "<coll/>", huella: "h1", finDeLinea: "\n", sucio: false, guardando: false, generacion: 1 };
  function control(parcial: Partial<ControlDeEdicion> = {}): ControlDeEdicion {
    return {
      actual: undefined,
      base: undefined,
      baseElegida: "sesion",
      textoVivo: () => "<coll/>",
      haySinGuardar: () => false,
      abrir: vi.fn(),
      cerrar: vi.fn(),
      cambiar: vi.fn(),
      guardar: vi.fn(),
      elegirBase: vi.fn(),
      pedirBase: vi.fn(),
      recargar: vi.fn(),
      seguirConLosMios: vi.fn(),
      descartar: vi.fn(),
      ...parcial,
    };
  }
  const pintar = (contenido: Record<string, unknown>, edicion?: ControlDeEdicion, cambiados?: ReadonlySet<string>) =>
    render(
      <Ficheros
        arbol={ARBOL}
        contenidos={{ "src/Clientes.xne": { ...UTF8, ...contenido } }}
        elegido="src/Clientes.xne"
        alElegir={NADA}
        alRecargar={NADA}
        {...(edicion === undefined ? {} : { edicion })}
        {...(cambiados === undefined ? {} : { cambiados })}
      />
    );

  it("«Editar» solo para texto entero en UTF-8 con huella, y nunca sin `edicion`", () => {
    const c = control();
    pintar({}, c);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(c.abrir).toHaveBeenCalledWith({ ...UTF8 });
    cleanup();
    for (const distinto of [{ codificacion: "latin1" }, { recortado: true }, { huella: undefined }, { mime: "image/svg+xml" }]) {
      pintar(distinto, control());
      expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
      cleanup();
    }
    pintar({});
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
  });

  it("editando: «Guardar» sin cambios está deshabilitado; con cambios, «●» y guarda", () => {
    const limpio = control({ actual: EDITANDO });
    pintar({}, limpio);
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("Hay cambios sin guardar")).toBeNull();
    cleanup();
    const sucio = control({ actual: { ...EDITANDO, sucio: true } });
    pintar({}, sucio);
    expect(screen.getByLabelText("Hay cambios sin guardar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(sucio.guardar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(sucio.cerrar).toHaveBeenCalledTimes(1);
  });

  it("guardando: el botón lo dice y no se deja pulsar", () => {
    pintar({}, control({ actual: { ...EDITANDO, sucio: true, guardando: true } }));
    const boton = screen.getByRole("button", { name: "Guardando…" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });

  it("una versión nueva del disco con cambios saca la banda con sus dos salidas", () => {
    const c = control({ actual: { ...EDITANDO, sucio: true, versionNueva: { original: "otro", huella: "h3", finDeLinea: "\n" } } });
    pintar({}, c);
    expect(screen.getByText(/ha cambiado en el disco/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Recargar (pierdes los tuyos)" }));
    expect(c.recargar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Seguir con los míos" }));
    expect(c.seguirConLosMios).toHaveBeenCalledTimes(1);
  });

  it("con el proyecto cambiado: la banda lo dice, «Guardar» no se deja pulsar y «Descartar» suelta", () => {
    const c = control({ actual: { ...EDITANDO, sucio: true, proyectoCambiado: true } });
    pintar({}, c);
    expect(screen.getByText("El proyecto abierto ya no es este: guardar está desactivado. Copia tus cambios o descártalos.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(c.descartar).toHaveBeenCalledTimes(1);
  });

  it("el error de guardar se enseña", () => {
    pintar({}, control({ actual: { ...EDITANDO, sucio: true, error: "el fichero cambió desde que lo abriste: recárgalo antes de guardar" } }));
    expect(screen.getByRole("alert").textContent).toContain("el fichero cambió desde que lo abriste");
  });

  it("el árbol lleva «M» para lo cambiado en la sesión y «●» para lo que no se ha guardado", () => {
    pintar({}, control({ actual: { ...EDITANDO, sucio: true } }), new Set(["app.xml"]));
    expect(within(screen.getByRole("treeitem", { name: /app\.xml/ })).getByLabelText("Cambiado en la sesión")).toBeTruthy();
    fireEvent.click(screen.getByRole("treeitem", { name: "src" }));
    expect(within(screen.getByRole("treeitem", { name: /Clientes\.xne/ })).getByLabelText("Sin guardar en el editor")).toBeTruthy();
  });

  it("sin `cambiados` y sin edición, ninguna insignia en el árbol", () => {
    pintar({});
    expect(screen.queryByLabelText("Cambiado en la sesión")).toBeNull();
    expect(screen.queryByLabelText("Sin guardar en el editor")).toBeNull();
  });

  it("pide los cambios de la sesión al montar si no los tiene", () => {
    const pedir = vi.fn();
    render(<Ficheros arbol={ARBOL} contenidos={{}} alElegir={NADA} alRecargar={NADA} alPedirCambios={pedir} conectado={true} />);
    expect(pedir).toHaveBeenCalledTimes(1);
  });
});
