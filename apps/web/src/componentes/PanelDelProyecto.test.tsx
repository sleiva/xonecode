import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { PanelDelProyecto } from "./PanelDelProyecto.js";
import type { EstadoDelCliente } from "../store.js";
import type { PlanDelCable } from "../tipos.js";

afterEach(cleanup);

type Props = ComponentProps<typeof PanelDelProyecto>;

const VINCULADO: NonNullable<EstadoDelCliente["gestor"]> = {
  estado: { conectores: ["jira"], vinculo: { conector: "jira", sitio: "s1", proyecto: "IXCODE", nombreDelSitio: "xone" } },
};

const CONECTORES: NonNullable<EstadoDelCliente["conectores"]> = {
  catalogo: [
    { id: "jira", nombre: "Jira", descripcion: "", autenticacion: "oauth" },
    { id: "github", nombre: "GitHub", descripcion: "", autenticacion: "oauth" },
  ],
  conectores: [
    { id: "jira", estado: "autorizado", prueba: { cuando: 1, ok: true, tools: [] } },
    { id: "github", estado: "falta-autorizar" },
  ],
  desconocidos: [],
};

const PLAN: PlanDelCable = {
  nombre: "visitas",
  ficheros: ["TASKS.md"],
  modificado: 1,
  tareas: {
    titulo: "Plan de visitas",
    tareas: [
      { numero: "01", titulo: "A", bloqueadaPor: [], criterios: { hechos: 2, total: 2 }, progreso: "finalizada", cuerpo: "" },
      { numero: "02", titulo: "B", bloqueadaPor: [], criterios: { hechos: 0, total: 2 }, progreso: "pendiente", cuerpo: "" },
    ],
  },
};

function montar(extra: Partial<Props> = {}) {
  const alGestor = vi.fn();
  const props: Props = {
    nombre: "AppDemo",
    alAbrirSesion: vi.fn(),
    alNuevaSesion: vi.fn(),
    conectado: true,
    empezarEnVuelo: false,
    alGestor,
    alAbrirAjustesDeConectores: vi.fn(),
    ...extra,
  };
  const vista = render(<PanelDelProyecto {...props} />);
  return { ...vista, props, alGestor, rerender: (mas: Partial<Props>) => vista.rerender(<PanelDelProyecto {...props} {...mas} />) };
}

const pestana = (nombre: string) => fireEvent.click(screen.getByRole("tab", { name: nombre }));

describe("PanelDelProyecto", () => {
  it("tres pestañas con el patrón del panel lateral, Resumen delante, y pide el estado del gestor al montar", () => {
    const { alGestor } = montar();
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Resumen", "Tareas", "Conectores"]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(alGestor).toHaveBeenCalledWith({ accion: "estado" });
    expect(alGestor).toHaveBeenCalledTimes(1);
  });

  it("Resumen: entorno, sesiones (las ligadas con su ticket), planes con su barra y la ranura de tareas", () => {
    const { props } = montar({
      entorno: "XOne WebStudio",
      sesiones: [
        { id: "s1", titulo: "Menú lateral", ticket: "IXCODE-12" },
        { id: "s2", titulo: "Prueba suelta" },
      ],
      planes: [PLAN],
      tareasEnFondo: <p>la ranura de tareas</p>,
    });
    expect(screen.getByRole("heading", { level: 1, name: "AppDemo" })).toBeTruthy();
    expect(screen.getByText("Entorno: XOne WebStudio")).toBeTruthy();
    // La rama no viajó: no se pinta, ni vacía.
    expect(screen.queryByText(/Rama:/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "IXCODE-12 · Menú lateral" }));
    expect(props.alAbrirSesion).toHaveBeenCalledWith("s1");
    expect(screen.getByRole("button", { name: "Prueba suelta" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión" }));
    expect(props.alNuevaSesion).toHaveBeenCalled();
    expect(screen.getByText("Plan de visitas")).toBeTruthy();
    expect(screen.getByText("Según el plan: 1 de 2 finalizadas · 1 pendientes.")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    expect(screen.getByText("la ranura de tareas")).toBeTruthy();
  });

  it("Resumen sin datos no pinta secciones inventadas", () => {
    montar();
    expect(screen.queryByText(/Entorno:/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Planes" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Tareas en background" })).toBeNull();
  });

  it("Tareas sin estado todavía: consultando, sin pedir pendientes", () => {
    const { alGestor } = montar();
    pestana("Tareas");
    expect(screen.getByText("Consultando el gestor de tareas…")).toBeTruthy();
    expect(alGestor).not.toHaveBeenCalledWith({ accion: "pendientes" });
  });

  it("Tareas SIN vínculo lo dice y lleva a Conectores; nunca una lista vacía", () => {
    const { alGestor } = montar({ gestor: { estado: { conectores: [] } }, conectores: CONECTORES });
    pestana("Tareas");
    expect(screen.getByText("Este proyecto no tiene gestor de tareas.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(alGestor).not.toHaveBeenCalledWith({ accion: "pendientes" });
    fireEvent.click(screen.getByRole("button", { name: "Vincular en Conectores" }));
    expect(screen.getByRole("tab", { name: "Conectores" }).getAttribute("aria-selected")).toBe("true");
  });

  it("Tareas con vínculo: pide las pendientes al abrir, las pinta con la hora de la foto, busca y reintenta", () => {
    const cuando = new Date(2026, 8, 28, 10, 42).getTime();
    const { alGestor, rerender } = montar({ gestor: VINCULADO });
    pestana("Tareas");
    expect(alGestor).toHaveBeenCalledWith({ accion: "pendientes" });
    expect(screen.getByText("Consultando las tareas…")).toBeTruthy();
    rerender({
      gestor: {
        ...VINCULADO,
        pendientes: {
          cuando,
          lista: [
            { clave: "IXCODE-12", titulo: "Menú lateral", estado: "Por hacer", categoria: "por-hacer", asignado: "Ana", url: "https://xone.atlassian.net/browse/IXCODE-12" },
          ],
        },
      },
    });
    const fila = screen.getByText("IXCODE-12").closest("li")!;
    expect(within(fila).getByText("Menú lateral")).toBeTruthy();
    expect(within(fila).getByText("Por hacer")).toBeTruthy();
    expect(within(fila).getByText("Ana")).toBeTruthy();
    const enlace = within(fila).getByRole("link", { name: "Abrir en Jira" });
    expect(enlace.getAttribute("href")).toBe("https://xone.atlassian.net/browse/IXCODE-12");
    expect(enlace.getAttribute("target")).toBe("_blank");
    expect(enlace.getAttribute("rel")).toBe("noreferrer");
    expect(screen.getByText("Consultado a las 10:42")).toBeTruthy();

    alGestor.mockClear();
    const campo = screen.getByRole("searchbox", { name: "Buscar tareas" });
    fireEvent.change(campo, { target: { value: "  menú " } });
    fireEvent.submit(campo.closest("form")!);
    expect(alGestor).toHaveBeenCalledWith({ accion: "pendientes", texto: "menú" });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(alGestor).toHaveBeenCalledTimes(2);

    alGestor.mockClear();
    rerender({ gestor: { ...VINCULADO, pendientes: { cuando, texto: "menú", lista: [] } } });
    expect(screen.getByText("No hay tareas pendientes que coincidan con «menú».")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "pendientes", texto: "menú" });
  });

  it("un error de pendientes se ve en su pestaña", () => {
    montar({ gestor: { ...VINCULADO, errores: { pendientes: { motivo: "Jira no contesta" } } } });
    pestana("Tareas");
    expect(screen.getByRole("alert").textContent).toBe("Jira no contesta");
    expect(screen.queryByText("Consultando las tareas…")).toBeNull();
  });

  it("«Nueva sesión con esta tarea» pide transiciones y abre la tarjeta «Empezar», en vez de `empezar` directo", () => {
    const pendientes = {
      cuando: 1,
      lista: [
        { clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" as const },
        { clave: "IXCODE-13", titulo: "Login", estado: "Por hacer", categoria: "por-hacer" as const },
      ],
    };
    const { alGestor, rerender } = montar({ gestor: { ...VINCULADO, pendientes } });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "transiciones", clave: "IXCODE-12", para: "empezar" });
    expect(alGestor).not.toHaveBeenCalledWith(expect.objectContaining({ accion: "empezar" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText("Consultando las transiciones de IXCODE-12…")).toBeTruthy();
    // Mientras la tarjeta está abierta, ninguna otra fila lanza una segunda.
    expect((screen.getByRole("button", { name: "Nueva sesión con IXCODE-13" }) as HTMLButtonElement).disabled).toBe(true);

    rerender({
      gestor: { ...VINCULADO, pendientes, transiciones: { clave: "IXCODE-12", para: "empezar", lista: [], propuesta: undefined } },
    });
    expect(within(screen.getByRole("dialog")).getByText("No hay transiciones disponibles para IXCODE-12.")).toBeTruthy();
    alGestor.mockClear();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Empezar sin tocar Jira" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "empezar", clave: "IXCODE-12" }, { destino: undefined });

    rerender({
      gestor: {
        ...VINCULADO,
        pendientes,
        transiciones: { clave: "IXCODE-12", para: "empezar", lista: [] },
        errores: { empezar: { motivo: "no se pudo abrir una sesión nueva" } },
      },
    });
    // El error se ve DENTRO de la tarjeta, que sigue abierta: no en la lista de pendientes.
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toBe("no se pudo abrir una sesión nueva");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  /**
   * R8 (IXCODE-11): el `destino` de la transición elegida se captura en el momento del envío
   * y viaja como SEGUNDO argumento de `alGestor`, que no cruza el cable — es lo que permite
   * componer «No se pudo pasar IXCODE-12 a EN CURSO…» en el chat DESPUÉS de que la sesión ya
   * se haya mudado, cuando `gestor.transiciones` puede ser ya el de otra clave.
   */
  it("«Pasar y empezar» manda el `destino` de la transición elegida, fuera del cable", () => {
    const pendientes = { cuando: 1, lista: [{ clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" as const }] };
    const transiciones = {
      clave: "IXCODE-12",
      para: "empezar" as const,
      propuesta: "11",
      lista: [{ id: "11", nombre: "Empezar a hacer", destino: "EN CURSO", categoria: "en-curso" as const }],
    };
    const { alGestor, rerender } = montar({ gestor: { ...VINCULADO, pendientes } });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }));
    rerender({ gestor: { ...VINCULADO, pendientes, transiciones } });
    alGestor.mockClear();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Pasar y empezar" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "empezar", clave: "IXCODE-12", transicion: "11" }, { destino: "EN CURSO" });
  });

  it("la tarjeta «Empezar» se cierra SOLA con el borrador, que es lo que dice que la sesión se abrió", () => {
    const pendientes = { cuando: 1, lista: [{ clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" as const }] };
    const { rerender } = montar({ gestor: { ...VINCULADO, pendientes } });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    rerender({ gestor: { ...VINCULADO, pendientes, borrador: { clave: "IXCODE-12", texto: "t", id: 1 } } });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("un re-render por algo AJENO (turnoEnVuelo, la misma lista de transiciones) no pisa lo que la persona eligió en el desplegable", () => {
    const pendientes = { cuando: 1, lista: [{ clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" as const }] };
    const transiciones = {
      clave: "IXCODE-12",
      para: "empezar" as const,
      propuesta: "11",
      lista: [
        { id: "11", nombre: "Empezar a hacer", destino: "EN CURSO", categoria: "en-curso" as const },
        { id: "31", nombre: "Marcar como probada", destino: "PROBAR", categoria: "en-curso" as const },
      ],
    };
    const { rerender } = montar({ gestor: { ...VINCULADO, pendientes } });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }));
    rerender({ gestor: { ...VINCULADO, pendientes, transiciones } });
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("combobox", { name: "Transición" }), { target: { value: "31" } });
    expect(screen.getByRole("dialog", { name: "¿Pasar IXCODE-12 a PROBAR?" })).toBeTruthy();
    // MISMA identidad de `transiciones` (App se re-renderiza por consumo/turno/dispositivos…
    // sin que llegue un `gestor.transiciones` nuevo): la elección tiene que sobrevivir.
    rerender({ gestor: { ...VINCULADO, pendientes, transiciones }, turnoEnVuelo: false });
    expect(screen.getByRole("dialog", { name: "¿Pasar IXCODE-12 a PROBAR?" })).toBeTruthy();
  });

  /**
   * El candado de envío («¿sigue en vuelo un `empezar`?») lo decide `App` —no este panel, que
   * se DESMONTA con «Volver al chat»— y llega como prop `empezarEnVuelo`; aquí solo se
   * comprueba que la tarjeta lo OBEDECE, sea cual sea el motivo por el que `App` lo puso.
   * El PORQUÉ de cuándo se suelta —ni «llegó un error» basta, por `g.ficha()` fallando antes
   * de la transición— vive en `App.test.tsx`, donde está el dato que lo decide (`estado.alta`).
   */
  it("`empezarEnVuelo` (de App) es el candado de la tarjeta: deshabilita los botones que ESCRIBEN, nunca «Cancelar»", () => {
    const pendientes = { cuando: 1, lista: [{ clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" as const }] };
    const transiciones = {
      clave: "IXCODE-12",
      para: "empezar" as const,
      propuesta: "11",
      lista: [{ id: "11", nombre: "Empezar a hacer", destino: "EN CURSO", categoria: "en-curso" as const }],
    };
    const { rerender } = montar({ gestor: { ...VINCULADO, pendientes, transiciones } });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }));
    const dialogo = screen.getByRole("dialog");
    for (const nombre of ["Pasar y empezar", "Empezar sin tocar Jira", "Cancelar"]) {
      expect((within(dialogo).getByRole("button", { name: nombre }) as HTMLButtonElement).disabled).toBe(false);
    }
    rerender({ gestor: { ...VINCULADO, pendientes, transiciones }, empezarEnVuelo: true });
    for (const nombre of ["Pasar y empezar", "Empezar sin tocar Jira"]) {
      expect((within(dialogo).getByRole("button", { name: nombre }) as HTMLButtonElement).disabled).toBe(true);
    }
    // Cancelar sigue vivo: no manda nada, así que no hay envío que doblar cerrando la tarjeta.
    expect((within(dialogo).getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  /**
   * Cancelar mientras `empezarEnVuelo` está puesto: cierra la tarjeta (ya no hay diálogo que
   * mostrar el error dentro), no manda ninguna petición al gestor, y la FILA se queda
   * deshabilitada igual —el candado real es `empezarEnVuelo`, que sigue en `true` porque
   * cerrar el diálogo no cancela lo que el servidor sigue resolviendo.
   */
  it("«Cancelar» con `empezarEnVuelo` puesto cierra la tarjeta sin mandar nada, y la fila sigue deshabilitada", () => {
    const pendientes = { cuando: 1, lista: [{ clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" as const }] };
    const transiciones = {
      clave: "IXCODE-12",
      para: "empezar" as const,
      propuesta: "11",
      lista: [{ id: "11", nombre: "Empezar a hacer", destino: "EN CURSO", categoria: "en-curso" as const }],
    };
    const { alGestor, rerender } = montar({ gestor: { ...VINCULADO, pendientes, transiciones } });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }));
    rerender({ gestor: { ...VINCULADO, pendientes, transiciones }, empezarEnVuelo: true });
    alGestor.mockClear();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(alGestor).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }) as HTMLButtonElement).disabled).toBe(true);
  });

  /**
   * `empezarEnVuelo` también apaga TODAS las filas, no solo la tarjeta abierta: cubre el
   * remonte —«Volver al chat» y volver desmonta `PanelDelProyecto`, y `tarjetaEmpezar` local
   * vuelve a `undefined`— sin que eso reabra la puerta a un segundo `empezar` mientras el
   * primero sigue resolviendo en el servidor.
   */
  it("`empezarEnVuelo` deshabilita TODAS las filas, con o sin tarjeta abierta (sobrevive al remonte del panel)", () => {
    const pendientes = {
      cuando: 1,
      lista: [
        { clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" as const },
        { clave: "IXCODE-13", titulo: "Login", estado: "Por hacer", categoria: "por-hacer" as const },
      ],
    };
    montar({ gestor: { ...VINCULADO, pendientes }, empezarEnVuelo: true });
    pestana("Tareas");
    expect((screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Nueva sesión con IXCODE-13" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("un error VIEJO no se enseña en una tarjeta recién abierta (R6): solo el que llega DESPUÉS de abrirla", () => {
    const pendientes = { cuando: 1, lista: [{ clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" as const }] };
    montar({ gestor: { ...VINCULADO, pendientes, errores: { empezar: { motivo: "fallo de un intento anterior" } } } });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }));
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
  });

  /**
   * R8: mientras `empezarEnVuelo` sigue puesto, el error de `empezar` NO se enseña dentro de
   * la tarjeta —ese motivo es justo el de la sesión que se abre IGUAL, y pintarlo como fallo
   * mentiría dos veces (aquí dentro y otra vez en el aviso del chat al cerrarse). Solo
   * aparece cuando `App` suelta el candado sin que haya llegado ningún borrador: el fallo
   * TOTAL.
   */
  it("con `empezarEnVuelo` puesto, el error de `empezar` NO se enseña (R8); se suelta y aparece", () => {
    const pendientes = { cuando: 1, lista: [{ clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" as const }] };
    const transiciones = {
      clave: "IXCODE-12",
      para: "empezar" as const,
      propuesta: "11",
      lista: [{ id: "11", nombre: "Empezar a hacer", destino: "EN CURSO", categoria: "en-curso" as const }],
    };
    const { rerender } = montar({ gestor: { ...VINCULADO, pendientes, transiciones }, empezarEnVuelo: false });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }));
    rerender({
      gestor: { ...VINCULADO, pendientes, transiciones, errores: { empezar: { motivo: "no se pudo transicionar" } } },
      empezarEnVuelo: true,
    });
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
    // `App` suelta el candado (sin borrador: el fallo fue TOTAL) y el motivo aparece entonces.
    rerender({
      gestor: { ...VINCULADO, pendientes, transiciones, errores: { empezar: { motivo: "no se pudo transicionar" } } },
      empezarEnVuelo: false,
    });
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toBe("no se pudo transicionar");
  });

  it("un fallo al CONSULTAR las transiciones se enseña dentro de la tarjeta (R6)", () => {
    const pendientes = { cuando: 1, lista: [{ clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" as const }] };
    const { rerender } = montar({ gestor: { ...VINCULADO, pendientes } });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }));
    rerender({ gestor: { ...VINCULADO, pendientes, errores: { transiciones: { motivo: "Jira no contesta" } } } });
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toBe("No se pudieron consultar las transiciones: Jira no contesta");
  });

  it("con un turno en vuelo «Nueva sesión con esta tarea» se apaga y dice por qué", () => {
    montar({
      gestor: { ...VINCULADO, pendientes: { cuando: 1, lista: [{ clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" }] } },
      turnoEnVuelo: true,
    });
    pestana("Tareas");
    const b = screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toMatch(/turno en marcha/);
  });

  it("Conectores: el conectado con su casilla, el vinculado atado con su motivo, y el sin conectar con el camino a Ajustes", () => {
    const { alGestor, props } = montar({ gestor: VINCULADO, conectores: CONECTORES });
    pestana("Conectores");
    const casilla = screen.getByRole("checkbox", { name: "Usar en este proyecto" }) as HTMLInputElement;
    expect(casilla.checked).toBe(true);
    expect(casilla.disabled).toBe(true);
    expect(screen.getByText("Está vinculado: desvincula antes de dejar de usarlo.")).toBeTruthy();
    expect(screen.getByText("Vinculado a IXCODE en xone.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Desvincular" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "desvincular" });
    // GitHub está añadido pero no conectado: no tiene casilla, se cuenta y se manda a Ajustes.
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByText(/Un conector añadido no está conectado: GitHub/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Ajustes" }));
    expect(props.alAbrirAjustesDeConectores).toHaveBeenCalled();
  });

  it("Conectores sin vínculo: pide sitios, con uno solo se elige solo y pide sus proyectos; Vincular manda los tres", () => {
    const { alGestor, rerender } = montar({ gestor: { estado: { conectores: [] } }, conectores: CONECTORES });
    pestana("Conectores");
    const casilla = screen.getByRole("checkbox", { name: "Usar en este proyecto" }) as HTMLInputElement;
    expect(casilla.checked).toBe(false);
    expect(casilla.disabled).toBe(false);
    fireEvent.click(casilla);
    expect(alGestor).toHaveBeenCalledWith({ accion: "usarConector", conector: "jira", usar: true });
    expect(alGestor).toHaveBeenCalledWith({ accion: "sitios", conector: "jira" });

    const gestor1 = { estado: { conectores: [] }, sitios: { conector: "jira", lista: [{ id: "s1", nombre: "xone" }] } };
    rerender({ gestor: gestor1 });
    expect((screen.getByRole("combobox", { name: "Sitio" }) as HTMLSelectElement).value).toBe("s1");
    expect(alGestor).toHaveBeenCalledWith({ accion: "proyectos", conector: "jira", sitio: "s1" });
    const vincular = screen.getByRole("button", { name: "Vincular" }) as HTMLButtonElement;
    expect(vincular.disabled).toBe(true);

    rerender({ gestor: { ...gestor1, proyectos: { sitio: "s1", lista: [{ clave: "IXCODE", nombre: "XOneCode" }] } } });
    fireEvent.change(screen.getByRole("combobox", { name: "Proyecto de Jira" }), { target: { value: "IXCODE" } });
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "vincular", conector: "jira", sitio: "s1", proyecto: "IXCODE" });
  });

  it("el vinculado SIN probar (tras un reinicio) sigue enseñando su vínculo y «Desvincular»", () => {
    montar({
      gestor: VINCULADO,
      conectores: { ...CONECTORES, conectores: [{ id: "jira", estado: "autorizado" }] },
    });
    pestana("Conectores");
    expect(screen.getByText("Vinculado a IXCODE en xone.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desvincular" })).toBeTruthy();
    // Y se sigue contando como sin conectar, con el camino para probarlo.
    expect(screen.getByText(/Un conector añadido no está conectado: Jira/)).toBeTruthy();
  });

  it("un conector sin conectar y sin usar no se ofrece: ni casilla ni sitios", () => {
    const { alGestor } = montar({
      gestor: { estado: { conectores: [] } },
      conectores: { ...CONECTORES, conectores: [{ id: "jira", estado: "autorizado" }] },
    });
    pestana("Conectores");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(alGestor).not.toHaveBeenCalledWith({ accion: "sitios", conector: "jira" });
  });

  it("los errores de configuración se ven en Conectores", () => {
    montar({
      gestor: { estado: { conectores: [] }, errores: { vincular: { motivo: "«X» no está entre los proyectos de ese sitio" } } },
      conectores: CONECTORES,
    });
    pestana("Conectores");
    expect(screen.getByRole("alert").textContent).toBe("«X» no está entre los proyectos de ese sitio");
  });
});
