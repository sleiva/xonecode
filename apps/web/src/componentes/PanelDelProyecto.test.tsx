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

  it("«Nueva sesión con esta tarea» pide empezar, dice «Abriendo…» y lo suelta con el error de empezar", () => {
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
    expect(alGestor).toHaveBeenCalledWith({ accion: "empezar", clave: "IXCODE-12" });
    const abriendo = screen.getByRole("button", { name: "Abriendo la sesión de IXCODE-12…" });
    expect(abriendo.textContent).toBe("Abriendo…");
    expect((abriendo as HTMLButtonElement).disabled).toBe(true);
    // Mientras se abre una, no se lanza otra.
    expect((screen.getByRole("button", { name: "Nueva sesión con IXCODE-13" }) as HTMLButtonElement).disabled).toBe(true);

    rerender({ gestor: { ...VINCULADO, pendientes, errores: { empezar: { motivo: "no se pudo abrir una sesión nueva" } } } });
    expect(screen.getByRole("alert").textContent).toBe("no se pudo abrir una sesión nueva");
    expect((screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }) as HTMLButtonElement).disabled).toBe(false);
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
