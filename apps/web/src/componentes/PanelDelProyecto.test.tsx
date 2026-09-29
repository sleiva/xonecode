import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { PENDIENTES_POR_CONSULTA, PanelDelProyecto } from "./PanelDelProyecto.js";
import type { EstadoDelCliente } from "../store.js";
import type { PlanDelCable } from "../tipos.js";

afterEach(cleanup);

type Props = ComponentProps<typeof PanelDelProyecto>;

const VINCULADO: NonNullable<EstadoDelCliente["gestor"]> = {
  estado: { conectores: ["jira"], vinculo: { conector: "jira", sitio: "s1", proyecto: "IXCODE", nombreDelSitio: "xone" }, admiteMias: true },
};

const CONECTORES: NonNullable<EstadoDelCliente["conectores"]> = {
  catalogo: [
    { id: "jira", nombre: "Jira", descripcion: "", autenticacion: "oauth" },
    { id: "github", nombre: "GitHub", descripcion: "", autenticacion: "oauth" },
    { id: "deepwiki", nombre: "DeepWiki", descripcion: "", autenticacion: "ninguna" },
  ],
  conectores: [
    { id: "jira", estado: "autorizado", prueba: { cuando: 1, ok: true, tools: [] } },
    { id: "github", estado: "falta-autorizar" },
    { id: "deepwiki", estado: "autorizado", prueba: { cuando: 1, ok: true, tools: [] } },
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
    alAutorizarConector: vi.fn(),
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

  /**
   * Revisión final (IXCODE-11), hallazgo 3: al caerse el cable el store tira `gestor` entero,
   * pero el panel sigue MONTADO. Si solo pidiera el estado al montar, tras reconectar se quedaría
   * en «Consultando el gestor de tareas…» para siempre.
   */
  it("al RECONECTAR vuelve a pedir el estado del gestor (el store lo tiró al caerse el cable)", () => {
    const { alGestor, rerender } = montar();
    expect(alGestor).toHaveBeenCalledTimes(1);
    rerender({ conectado: false });
    expect(alGestor).toHaveBeenCalledTimes(1);
    rerender({ conectado: true });
    expect(alGestor).toHaveBeenCalledTimes(2);
    expect(alGestor).toHaveBeenLastCalledWith({ accion: "estado" });
  });

  it("y la pestaña Tareas vuelve a pedir las pendientes cuando el estado regresa", () => {
    const { alGestor, rerender } = montar({ gestor: VINCULADO });
    pestana("Tareas");
    expect(alGestor).toHaveBeenCalledWith({ accion: "pendientes" });
    alGestor.mockClear();
    // Cae el cable: el store tira `gestor`.
    rerender({ conectado: false, gestor: undefined });
    rerender({ conectado: true, gestor: undefined });
    expect(alGestor).toHaveBeenCalledWith({ accion: "estado" });
    rerender({ conectado: true, gestor: VINCULADO });
    expect(alGestor).toHaveBeenCalledWith({ accion: "pendientes" });
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
    const { alGestor, rerender } = montar({ gestor: VINCULADO, conectores: CONECTORES });
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
    // «Abrir en Jira» es un icono junto a la clave, con su nombre en `aria-label` y `title`.
    const enlace = within(fila).getByRole("link", { name: "Abrir IXCODE-12 en Jira" });
    expect(enlace.getAttribute("title")).toBe("Abrir IXCODE-12 en Jira");
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
    // Sin un fallo no hay «Reintentar»: se vuelve a consultar con el icono de «Actualizar»,
    // que repite la ÚLTIMA consulta mandada.
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
    const actualizar = screen.getByRole("button", { name: "Actualizar" });
    expect(actualizar.getAttribute("title")).toBeTruthy();
    fireEvent.click(actualizar);
    expect(alGestor).toHaveBeenCalledWith({ accion: "pendientes", texto: "menú" });
  });

  it("un error de pendientes se ve en su pestaña, con «Reintentar» (y sin «Conectar»: no es de credencial)", () => {
    const { alGestor } = montar({ gestor: { ...VINCULADO, errores: { pendientes: { motivo: "Jira no contesta" } } }, conectores: CONECTORES });
    pestana("Tareas");
    expect(screen.getByRole("alert").textContent).toBe("Jira no contesta");
    expect(screen.queryByText("Consultando las tareas…")).toBeNull();
    expect(screen.queryByRole("button", { name: "Conectar Jira" })).toBeNull();
    alGestor.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "pendientes" });
  });

  const IXCODE = [
    { clave: "IXCODE-5", titulo: "Probar el login", estado: "PROBAR", categoria: "en-curso" as const, asignado: "Ana" },
    { clave: "IXCODE-6", titulo: "Un título muy largo que no cabe en una línea del panel del proyecto", estado: "EN CURSO", categoria: "en-curso" as const, asignado: "Ana" },
    { clave: "IXCODE-7", titulo: "Menú", estado: "PROBLEMA", categoria: "por-hacer" as const, asignado: "Luis" },
    { clave: "IXCODE-8", titulo: "Login", estado: "PROBLEMA", categoria: "por-hacer" as const },
  ];

  it("filtros por estado: una pastilla por estado con su número, por categoría, y «esperando prueba» DESMARCADO por omisión", () => {
    const { alGestor } = montar({ gestor: { ...VINCULADO, pendientes: { cuando: 1, lista: IXCODE } } });
    pestana("Tareas");
    const grupo = screen.getByRole("group", { name: "Filtrar por estado" });
    const pastillas = within(grupo).getAllByRole("button");
    expect(pastillas.map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Todas 4", "false"],
      // Por categoría (por hacer antes que en curso), y dentro de una, por orden de aparición.
      ["PROBLEMA 2", "true"],
      ["PROBAR 1", "false"],
      ["EN CURSO 1", "true"],
    ]);
    expect(screen.queryByText("IXCODE-5")).toBeNull();
    expect(screen.getByText("IXCODE-7")).toBeTruthy();
    alGestor.mockClear();
    // Marcar PROBAR la enseña; es filtro de CLIENTE: no sale ninguna petición.
    fireEvent.click(within(grupo).getByRole("button", { name: "PROBAR 1" }));
    expect(screen.getByText("IXCODE-5")).toBeTruthy();
    expect(within(grupo).getByRole("button", { name: "Todas 4" }).getAttribute("aria-pressed")).toBe("true");
    // Desmarcarlas todas lo DICE, no deja una lista vacía muda.
    for (const n of ["PROBLEMA 2", "EN CURSO 1", "PROBAR 1"]) fireEvent.click(within(grupo).getByRole("button", { name: n }));
    expect(screen.getByText("Ninguna pendiente con estos filtros.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    fireEvent.click(within(grupo).getByRole("button", { name: "Todas 4" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(alGestor).not.toHaveBeenCalled();
  });

  it("«Asignadas a mí» vuelve a pedir con `mias`; el asignado deja de pintarse solo cuando la RESPUESTA es la de «mías»", () => {
    const { alGestor, rerender } = montar({ gestor: { ...VINCULADO, pendientes: { cuando: 1, lista: IXCODE } } });
    pestana("Tareas");
    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
    alGestor.mockClear();
    const mias = screen.getByRole("button", { name: "Asignadas a mí" });
    expect(mias.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(mias);
    expect(alGestor).toHaveBeenCalledWith({ accion: "pendientes", mias: true });
    expect(mias.getAttribute("aria-pressed")).toBe("true");
    // Mientras no contesta, la lista de antes sigue diciendo de quién es cada una.
    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
    rerender({ gestor: { ...VINCULADO, pendientes: { cuando: 2, mias: true, lista: IXCODE.slice(0, 2) } } });
    expect(screen.queryByText("Ana")).toBeNull();
    // Buscar conserva el conmutador; «Actualizar» repite la última consulta.
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar tareas" }), { target: { value: "login" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(alGestor).toHaveBeenLastCalledWith({ accion: "pendientes", texto: "login", mias: true });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(alGestor).toHaveBeenLastCalledWith({ accion: "pendientes", texto: "login", mias: true });
  });

  it("dos líneas por fila: clave y título (entero en su `title`) arriba; estado y asignado debajo; la acción aparte y secundaria", () => {
    montar({ gestor: { ...VINCULADO, pendientes: { cuando: 1, lista: IXCODE } } });
    pestana("Tareas");
    const fila = screen.getByText("IXCODE-6").closest("li")!;
    const titulo = within(fila).getByRole("button", { name: IXCODE[1]!.titulo });
    expect(titulo.getAttribute("title")).toBe(IXCODE[1]!.titulo);
    expect(titulo.getAttribute("aria-expanded")).toBe("false");
    const nueva = within(fila).getByRole("button", { name: "Nueva sesión con IXCODE-6" });
    // Secundario (no el azul de antes), y SIEMPRE en el DOM: se ve con hover o con el foco.
    const estilosDelPanel = readFileSync(join(__dirname, "PanelDelProyecto.module.css"), "utf8");
    expect(nueva.className).not.toMatch(/principal/);
    expect(estilosDelPanel).toMatch(/\.tarea:focus-within \.accionesDeTarea/);
    expect(estilosDelPanel).toMatch(/\.tarea:hover \.accionesDeTarea/);
    const bloque = estilosDelPanel.slice(estilosDelPanel.indexOf(".accionesDeTarea {"), estilosDelPanel.indexOf(".tarea:hover"));
    expect(bloque).not.toMatch(/display:\s*none|visibility/);
    // La fila no se parte: el título cede, los botones no bajan.
    expect(estilosDelPanel.slice(estilosDelPanel.indexOf(".filaDeTarea {"))).toMatch(/^[^}]*flex-wrap: nowrap/);
    expect(estilosDelPanel.slice(estilosDelPanel.indexOf(".desplegar {"))).toMatch(/^[^}]*text-overflow: ellipsis/);
  });

  it("pulsar una fila despliega su descripción (ficha, de LECTURA) en markdown; plegarla la desmonta", () => {
    const { alGestor, rerender } = montar({ gestor: { ...VINCULADO, pendientes: { cuando: 1, lista: IXCODE } } });
    pestana("Tareas");
    alGestor.mockClear();
    const fila = screen.getByText("IXCODE-7").closest("li")!;
    // Clic en la fila (no en un control): despliega.
    fireEvent.click(within(fila).getByText("PROBLEMA"));
    expect(alGestor).toHaveBeenCalledWith({ accion: "ficha", clave: "IXCODE-7" });
    expect(alGestor).not.toHaveBeenCalledWith(expect.objectContaining({ accion: "transiciones" }));
    expect(within(fila).getByText("Consultando la descripción…")).toBeTruthy();
    const titulo = within(fila).getByRole("button", { name: "Menú" });
    expect(titulo.getAttribute("aria-expanded")).toBe("true");
    rerender({ gestor: { ...VINCULADO, pendientes: { cuando: 1, lista: IXCODE }, ficha: { clave: "IXCODE-7", descripcion: "Pasos: **uno** y $5" } } });
    expect(within(screen.getByText("IXCODE-7").closest("li")!).getByText("uno").tagName).toBe("STRONG");
    // El título (teclado) pliega, y lo plegado se DESMONTA.
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    expect(screen.queryByText("uno")).toBeNull();
    // «Nueva sesión» no despliega nada: abre su tarjeta.
    alGestor.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-7" }));
    expect(alGestor).not.toHaveBeenCalledWith(expect.objectContaining({ accion: "ficha" }));
  });

  it("la ficha: sin descripción lo dice; un error VIEJO de `ficha` no se pinta en la fila recién desplegada", () => {
    const base = { ...VINCULADO, pendientes: { cuando: 1, lista: IXCODE }, errores: { ficha: { motivo: "viejo" } } };
    const { rerender } = montar({ gestor: base });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    expect(screen.queryByText(/viejo/)).toBeNull();
    rerender({ gestor: { ...base, errores: { ficha: { motivo: "Jira no contesta", clave: "IXCODE-8" } } } });
    expect(screen.getByRole("alert").textContent).toBe("No se pudo leer la descripción: Jira no contesta");
    rerender({ gestor: { ...base, errores: {}, ficha: { clave: "IXCODE-8", descripcion: "  " } } });
    expect(screen.getByText("Esta tarea no tiene descripción.")).toBeTruthy();
  });

  it("el fallo de la ficha de A NO se pinta bajo B: lleva su clave", () => {
    const base = { ...VINCULADO, pendientes: { cuando: 1, lista: IXCODE } };
    const { rerender } = montar({ gestor: base });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    // Llega tarde el fallo de IXCODE-7 (Menú), con B (Login) desplegada.
    rerender({ gestor: { ...base, errores: { ficha: { motivo: "Jira no contesta", clave: "IXCODE-7" } } } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Consultando la descripción…")).toBeTruthy();
    rerender({ gestor: { ...base, errores: { ficha: { motivo: "otro", clave: "IXCODE-8" } } } });
    expect(screen.getByRole("alert").textContent).toBe("No se pudo leer la descripción: otro");
  });

  it("al volver el cable, la fila que seguía desplegada vuelve a pedir su descripción", () => {
    const { alGestor, rerender } = montar({ gestor: { ...VINCULADO, pendientes: { cuando: 1, lista: IXCODE } } });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    alGestor.mockClear();
    rerender({ conectado: false, gestor: undefined });
    rerender({ conectado: true, gestor: undefined });
    expect(alGestor).not.toHaveBeenCalledWith({ accion: "ficha", clave: "IXCODE-7" });
    rerender({ conectado: true, gestor: { ...VINCULADO, pendientes: { cuando: 2, lista: IXCODE } } });
    expect(alGestor).toHaveBeenCalledWith({ accion: "ficha", clave: "IXCODE-7" });
    expect(screen.getByRole("button", { name: "Menú" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("con la lista LLENA (el tope del servidor) lo dice: las cuentas son de un trozo", () => {
    const llena = Array.from({ length: PENDIENTES_POR_CONSULTA }, (_, i) => ({
      clave: `IXCODE-${i + 1}`, titulo: `T${i + 1}`, estado: "PROBLEMA", categoria: "por-hacer" as const,
    }));
    const { rerender } = montar({ gestor: { ...VINCULADO, pendientes: { cuando: 1, lista: llena } } });
    pestana("Tareas");
    expect(screen.getByText(`Se muestran las ${PENDIENTES_POR_CONSULTA} más recientes; afina con la búsqueda.`)).toBeTruthy();
    rerender({ gestor: { ...VINCULADO, pendientes: { cuando: 1, lista: llena.slice(1) } } });
    expect(screen.queryByText(/más recientes; afina/)).toBeNull();
  });

  it("el tope del cliente es el MISMO que pide el adaptador de Jira (redeclarado, no importado)", () => {
    const adaptador = readFileSync(join(__dirname, "../../../../src/agent/conectores/gestorJira.ts"), "utf8");
    expect(adaptador.match(/export const PENDIENTES_POR_CONSULTA = (\d+);/)?.[1]).toBe(String(PENDIENTES_POR_CONSULTA));
  });

  it("«Nueva sesión con esta tarea» pide transiciones y abre la tarjeta «Empezar», en vez de `empezar` directo", () => {
    const pendientes = {
      cuando: 1,
      lista: [
        { clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" as const },
        { clave: "IXCODE-13", titulo: "Login", estado: "Por hacer", categoria: "por-hacer" as const },
      ],
    };
    const { alGestor, rerender } = montar({ gestor: { ...VINCULADO, pendientes }, conectores: CONECTORES });
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
    const { rerender } = montar({ gestor: { ...VINCULADO, pendientes, transiciones }, conectores: CONECTORES });
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

  it("Conectores: Jira (gestor) SIN casilla, solo su vínculo; el resto con su casilla; el sin conectar con su «Conectar»", () => {
    const { alGestor, props } = montar({ gestor: VINCULADO, conectores: CONECTORES });
    pestana("Conectores");
    const filaDe = (nombre: string) => screen.getByText(nombre, { selector: "span" }).closest("li")!;
    // Jira: ni casilla ni la frase de «desvincula antes»; el vínculo y «Desvincular».
    expect(within(filaDe("Jira")).queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/desvincula antes de dejar de usarlo/)).toBeNull();
    expect(screen.getByText("Vinculado a IXCODE en xone.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Desvincular" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "desvincular" });
    // DeepWiki, conectado y no gestor: su casilla de siempre.
    const casilla = within(filaDe("DeepWiki")).getByRole("checkbox", { name: "Usar en este proyecto" }) as HTMLInputElement;
    expect(casilla.checked).toBe(false);
    fireEvent.click(casilla);
    expect(alGestor).toHaveBeenCalledWith({ accion: "usarConector", conector: "deepwiki", usar: true });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    // GitHub, añadido y sin conectar: su fila con «Conectar», el MISMO `autorizar` de Ajustes.
    fireEvent.click(within(filaDe("GitHub")).getByRole("button", { name: "Conectar GitHub" }));
    expect(props.alAutorizarConector).toHaveBeenCalledWith("github");
    expect(screen.queryByText(/no está conectado/)).toBeNull();
    // Añadir uno nuevo sigue siendo cosa de Ajustes.
    fireEvent.click(screen.getByRole("button", { name: "Añadir otro conector en Ajustes" }));
    expect(props.alAbrirAjustesDeConectores).toHaveBeenCalled();
  });

  it("«Conectar» con una autorización abierta dice que espera al navegador y no se repite", () => {
    montar({
      gestor: VINCULADO,
      conectores: { ...CONECTORES, conectores: [{ id: "github", estado: "falta-autorizar", autorizando: true }] },
    });
    pestana("Conectores");
    const b = screen.getByRole("button", { name: "Conectar GitHub" }) as HTMLButtonElement;
    expect(b.textContent).toBe("Esperando al navegador…");
    expect(b.disabled).toBe(true);
  });

  it("Conectores sin vínculo: pide sitios, con uno solo se elige solo y pide sus proyectos; Vincular manda los tres", () => {
    const { alGestor, rerender } = montar({ gestor: { estado: { conectores: [] } }, conectores: CONECTORES });
    pestana("Conectores");
    // Sin casilla para Jira: vincular es lo que lo marca como usado.
    expect(within(screen.getByText("Jira", { selector: "span" }).closest("li")!).queryByRole("checkbox")).toBeNull();
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

  it("el vinculado SIN probar (tras un reinicio) sigue enseñando su vínculo y «Desvincular», con su «Conectar»", () => {
    montar({
      gestor: VINCULADO,
      conectores: { ...CONECTORES, conectores: [{ id: "jira", estado: "autorizado" }] },
    });
    pestana("Conectores");
    expect(screen.getByText("Vinculado a IXCODE en xone.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desvincular" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Conectar Jira" })).toBeTruthy();
  });

  it("un conector sin conectar y sin usar no se ofrece para usar ni pide sitios: solo «Conectar»", () => {
    const { alGestor } = montar({
      gestor: { estado: { conectores: [] } },
      conectores: { ...CONECTORES, conectores: [{ id: "jira", estado: "autorizado" }] },
    });
    pestana("Conectores");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(alGestor).not.toHaveBeenCalledWith({ accion: "sitios", conector: "jira" });
    expect(screen.getByRole("button", { name: "Conectar Jira" })).toBeTruthy();
  });

  /**
   * Punto 9: con la credencial caída, el fallo lleva al lado «Conectar Jira» —en Conectores y en
   * Tareas—, y cuando el mensaje `conectores` lo da por conectado lo que falló se repite SOLO,
   * UNA vez.
   */
  it("«falta autorizar» en sitios: «Conectar Jira» al lado; al conectarse, los sitios se vuelven a pedir UNA vez", () => {
    const { alGestor, props, rerender } = montar({ gestor: { estado: { conectores: [] } }, conectores: CONECTORES });
    pestana("Conectores");
    expect(alGestor).toHaveBeenCalledWith({ accion: "sitios", conector: "jira" });
    // El token murió: la prueba de Jira sigue VIEJA en verde (`llamar` no toca las pruebas).
    const conError = { estado: { conectores: [] }, errores: { sitios: { motivo: "falta autorizar" } } };
    rerender({ gestor: conError });
    expect(screen.getByRole("alert").textContent).toBe("falta autorizar");
    fireEvent.click(screen.getByRole("button", { name: "Conectar Jira" }));
    expect(props.alAutorizarConector).toHaveBeenCalledWith("jira");
    alGestor.mockClear();
    // Vuelve del navegador: `autorizar` acaba en `probar`, y llega una prueba NUEVA.
    const reconectado = {
      ...CONECTORES,
      conectores: CONECTORES.conectores.map((c) => (c.id === "jira" ? { ...c, prueba: { cuando: 2, ok: true as const, tools: [] } } : c)),
    };
    rerender({ gestor: conError, conectores: reconectado });
    expect(alGestor.mock.calls.filter(([p]) => p.accion === "sitios")).toEqual([[{ accion: "sitios", conector: "jira" }]]);
    // Otra foto con la MISMA prueba no lo repite.
    rerender({ gestor: conError, conectores: { ...reconectado, conectores: [...reconectado.conectores] } });
    expect(alGestor.mock.calls.filter(([p]) => p.accion === "sitios")).toHaveLength(1);
  });

  it("y si la fila de Jira se vuelve a montar al conectarse (pide sus sitios ella), no se piden DOS veces", () => {
    const { alGestor, rerender } = montar({ gestor: { estado: { conectores: [] } }, conectores: CONECTORES });
    pestana("Conectores");
    const conError = { estado: { conectores: [] }, errores: { sitios: { motivo: "falta autorizar" } } };
    const caido = { ...CONECTORES, conectores: CONECTORES.conectores.map((c) => (c.id === "jira" ? { id: "jira", estado: "falta-autorizar" as const } : c)) };
    rerender({ gestor: conError, conectores: caido });
    // Con Jira sin conectar, su «Conectar» es el de su fila: uno, no dos.
    expect(screen.getAllByRole("button", { name: "Conectar Jira" })).toHaveLength(1);
    alGestor.mockClear();
    rerender({ gestor: conError, conectores: CONECTORES });
    expect(alGestor.mock.calls.filter(([p]) => p.accion === "sitios")).toHaveLength(1);
  });

  it("«falta autorizar» en pendientes: «Conectar Jira» en Tareas; al conectarse, se repite la consulta, UNA vez", () => {
    const sinProbar = { ...CONECTORES, conectores: [{ id: "jira", estado: "falta-autorizar" as const }] };
    const conError = { ...VINCULADO, errores: { pendientes: { motivo: "falta autorizar" } } };
    const { alGestor, props, rerender } = montar({ gestor: conError, conectores: sinProbar });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Asignadas a mí" }));
    // Esa consulta falla también: el store trae un error NUEVO (un objeto por fallo).
    const otroError = { ...VINCULADO, errores: { pendientes: { motivo: "falta autorizar" } } };
    rerender({ gestor: otroError });
    fireEvent.click(screen.getByRole("button", { name: "Conectar Jira" }));
    expect(props.alAutorizarConector).toHaveBeenCalledWith("jira");
    alGestor.mockClear();
    rerender({ gestor: otroError, conectores: CONECTORES });
    expect(alGestor).toHaveBeenCalledTimes(1);
    expect(alGestor).toHaveBeenCalledWith({ accion: "pendientes", mias: true });
    // Y un conector que ya estaba conectado cuando llegó el fallo no dispara nada.
    alGestor.mockClear();
    rerender({ gestor: { ...VINCULADO, errores: { pendientes: { motivo: "falta autorizar" } } }, conectores: CONECTORES });
    expect(alGestor).not.toHaveBeenCalled();
  });

  it("«no está conectado» (el conector NO está añadido): sin «Conectar», con «Añádelo en Ajustes», en Conectores y en Tareas", () => {
    const errores = { sitios: { motivo: "«jira» no está conectado" }, pendientes: { motivo: "«jira» no está conectado" } };
    const { props } = montar({ gestor: { ...VINCULADO, errores }, conectores: { ...CONECTORES, conectores: [] } });
    pestana("Tareas");
    expect(screen.queryByRole("button", { name: /^Conectar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Añádelo en Ajustes" }));
    expect(props.alAbrirAjustesDeConectores).toHaveBeenCalledTimes(1);
    pestana("Conectores");
    expect(screen.queryByRole("button", { name: /^Conectar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Añádelo en Ajustes" }));
    expect(props.alAbrirAjustesDeConectores).toHaveBeenCalledTimes(2);
  });

  it("«no está conectado» no dispara el reintento automático aunque llegue una prueba buena", () => {
    const conError = { ...VINCULADO, errores: { pendientes: { motivo: "«jira» no está conectado" } } };
    const { alGestor, rerender } = montar({ gestor: conError, conectores: { ...CONECTORES, conectores: [] } });
    pestana("Tareas");
    alGestor.mockClear();
    rerender({ gestor: conError, conectores: CONECTORES });
    expect(alGestor).not.toHaveBeenCalled();
  });

  it("los errores de configuración se ven en Conectores", () => {
    montar({
      gestor: { estado: { conectores: [] }, errores: { vincular: { motivo: "«X» no está entre los proyectos de ese sitio" } } },
      conectores: CONECTORES,
    });
    pestana("Conectores");
    expect(screen.getByRole("alert").textContent).toBe("«X» no está entre los proyectos de ese sitio");
  });
  // ── IXCODE-15: Notion como gestor, y Conectores en dos secciones ──────────────────────────

  const CON_NOTION: NonNullable<EstadoDelCliente["conectores"]> = {
    ...CONECTORES,
    catalogo: [...CONECTORES.catalogo, { id: "notion", nombre: "Notion", descripcion: "", autenticacion: "oauth" }],
    conectores: [...CONECTORES.conectores, { id: "notion", estado: "autorizado", prueba: { cuando: 1, ok: true, tools: [] } }],
  };
  const COLECCION = "collection://ea517d0b-1234-4abc-8def-0123456789ab";
  const VINCULADO_A_NOTION: NonNullable<EstadoDelCliente["gestor"]> = {
    estado: {
      conectores: ["notion"],
      vinculo: { conector: "notion", sitio: "notion", proyecto: COLECCION, nombreDelProyecto: "Tasks" },
      admiteMias: true,
    },
  };
  const UUID = "0687543b-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  const ESQUEMA = {
    proyecto: COLECCION,
    nombre: "Tasks",
    estado: {
      propiedad: "Status",
      opciones: [
        { nombre: "Not started", categoria: "por-hacer" as const },
        { nombre: "In progress", categoria: "en-curso" as const },
        { nombre: "Done", categoria: "terminada" as const },
      ],
    },
    titulo: "Name",
    asignado: "Assigned",
  };
  const seccion = (nombre: string) => screen.getByRole("region", { name: nombre });
  /** La fila de Notion en «Gestor de tareas»: Jira, conectado y sin vínculo, tiene su propio «Vincular». */
  const notion = () => within(within(seccion("Gestor de tareas")).getByText("Notion", { selector: "span" }).closest("li")!);

  it("Conectores en DOS secciones: «Gestor de tareas» solo con Jira y Notion; «Conectores para el chat» con el resto, «Conectar» y casilla", () => {
    const { alGestor, props } = montar({ gestor: { estado: { conectores: ["deepwiki"] } }, conectores: CON_NOTION });
    pestana("Conectores");
    const gestores = seccion("Gestor de tareas");
    const chat = seccion("Conectores para el chat");
    expect(within(gestores).getAllByRole("listitem")).toHaveLength(2);
    expect(within(gestores).getByText("Jira", { selector: "span" })).toBeTruthy();
    expect(within(gestores).getByText("Notion", { selector: "span" })).toBeTruthy();
    expect(within(gestores).queryByText("DeepWiki")).toBeNull();
    expect(within(gestores).queryByRole("checkbox")).toBeNull();
    expect(within(chat).getByText("Los que usará el agente en el chat de este proyecto.")).toBeTruthy();
    expect(within(chat).queryByText("Jira", { selector: "span" })).toBeNull();
    expect(within(chat).queryByText("Notion", { selector: "span" })).toBeNull();
    const casilla = within(chat).getByRole("checkbox", { name: "Usar en este proyecto" }) as HTMLInputElement;
    expect(casilla.checked).toBe(true);
    fireEvent.click(casilla);
    expect(alGestor).toHaveBeenCalledWith({ accion: "usarConector", conector: "deepwiki", usar: false });
    fireEvent.click(within(chat).getByRole("button", { name: "Conectar GitHub" }));
    expect(props.alAutorizarConector).toHaveBeenCalledWith("github");
    // Notion, sin vínculo: nada se pide al montar (buscar necesita texto).
    expect(alGestor).not.toHaveBeenCalledWith(expect.objectContaining({ conector: "notion" }));
  });

  it("Notion: buscar → lista de bases → describir → lo entendido del esquema → «Vincular» con el `collection://` (no el id de la base)", () => {
    const { alGestor, rerender } = montar({ gestor: { estado: { conectores: [] } }, conectores: CON_NOTION });
    pestana("Conectores");
    const campo = screen.getByRole("searchbox", { name: "Buscar una base de Notion" });
    const buscar = within(campo.closest("form")!).getByRole("button", { name: "Buscar" }) as HTMLButtonElement;
    expect(buscar.disabled).toBe(true);
    fireEvent.change(campo, { target: { value: " task " } });
    fireEvent.click(buscar);
    expect(alGestor).toHaveBeenCalledWith({ accion: "buscarProyectos", conector: "notion", texto: "task" });
    expect(screen.getByText("Buscando…")).toBeTruthy();
    // Una respuesta de OTRA búsqueda (llegó tarde) no se pinta.
    const base = { estado: { conectores: [] } };
    rerender({ gestor: { ...base, busqueda: { conector: "notion", texto: "otra", lista: [{ proyecto: "x", nombre: "Otra" }] } } });
    expect(screen.queryByRole("button", { name: /Otra/ })).toBeNull();
    const busqueda = {
      conector: "notion",
      texto: "task",
      lista: [
        { proyecto: "06aeb13b-0000-4000-8000-000000000001", nombre: "Tasks", ruta: "Hypergraph / Projects & Tasks" },
        { proyecto: "06aeb13b-0000-4000-8000-000000000002", nombre: "My tasks" },
      ],
    };
    rerender({ gestor: { ...base, busqueda } });
    const bases = screen.getByRole("list", { name: "Bases de Notion" });
    expect(within(bases).getAllByRole("button")).toHaveLength(2);
    expect(within(bases).getByText("Hypergraph / Projects & Tasks")).toBeTruthy();
    fireEvent.click(within(bases).getByRole("button", { name: /^Tasks/ }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "describir", conector: "notion", proyecto: "06aeb13b-0000-4000-8000-000000000001" });
    expect(within(bases).getByRole("button", { name: /^Tasks/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Leyendo el esquema de la base…")).toBeTruthy();
    expect(notion().queryByRole("button", { name: "Vincular" })).toBeNull();
    rerender({
      gestor: { ...base, busqueda, descripcion: { conector: "notion", pedido: "06aeb13b-0000-4000-8000-000000000001", esquema: ESQUEMA } },
    });
    expect(screen.getByText("Estado: Status (Not started · In progress · Done) · Título: Name · Asignado: Assigned")).toBeTruthy();
    alGestor.mockClear();
    fireEvent.click(notion().getByRole("button", { name: "Vincular" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "vincular", conector: "notion", sitio: "notion", proyecto: COLECCION });
    expect(alGestor).toHaveBeenCalledTimes(1);
  });

  it("Notion: una base que no vale dice su MOTIVO y no ofrece «Vincular»; la descripción de OTRA base no se pinta", () => {
    const { rerender } = montar({ gestor: { estado: { conectores: [] } }, conectores: CON_NOTION });
    pestana("Conectores");
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar una base de Notion" }), { target: { value: "my" } });
    fireEvent.submit(screen.getByRole("searchbox", { name: "Buscar una base de Notion" }).closest("form")!);
    const busqueda = { conector: "notion", texto: "my", lista: [{ proyecto: "b1", nombre: "My Tasks" }] };
    rerender({ gestor: { estado: { conectores: [] }, busqueda, descripcion: { conector: "notion", pedido: "otra", esquema: ESQUEMA } } });
    fireEvent.click(screen.getByRole("button", { name: /My Tasks/ }));
    expect(screen.queryByText(/Estado: Status/)).toBeNull();
    rerender({
      gestor: {
        estado: { conectores: [] },
        busqueda,
        descripcion: { conector: "notion", pedido: "b1", motivo: "esta base no tiene un data source propio (es una vista)" },
      },
    });
    expect(screen.getByText("Esta base no sirve como gestor de tareas: esta base no tiene un data source propio (es una vista)")).toBeTruthy();
    expect(notion().queryByRole("button", { name: "Vincular" })).toBeNull();
    // Sin persona: lo dice antes de vincular (no habrá «Asignadas a mí»).
    const { asignado: _sinAsignado, ...sinPersona } = ESQUEMA;
    rerender({ gestor: { estado: { conectores: [] }, busqueda, descripcion: { conector: "notion", pedido: "b1", esquema: { ...sinPersona, fuentes: 2 } } } });
    expect(screen.getByText("Estado: Status (Not started · In progress · Done) · Título: Name")).toBeTruthy();
    expect(screen.getByText(/no se podrá filtrar por «Asignadas a mí»/)).toBeTruthy();
    expect(screen.getByText("La base tiene 2 orígenes de datos; se usa el primero.")).toBeTruthy();
    expect(notion().getByRole("button", { name: "Vincular" })).toBeTruthy();
  });

  it("con Jira vinculado, Notion AVISA de que lo sustituirá; y con Notion vinculado, lo mismo desde Jira", () => {
    const { alGestor, rerender } = montar({ gestor: VINCULADO, conectores: CON_NOTION });
    pestana("Conectores");
    const gestores = seccion("Gestor de tareas");
    // El vinculado, arriba.
    expect(within(gestores).getAllByRole("listitem")[0]!.textContent).toMatch(/^Jira/);
    expect(within(gestores).getByText("Vinculado a IXCODE en xone.")).toBeTruthy();
    // El formulario del otro no se monta de entrada.
    expect(screen.queryByRole("searchbox", { name: "Buscar una base de Notion" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Vincular Notion en su lugar…" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar una base de Notion" }), { target: { value: "task" } });
    fireEvent.submit(screen.getByRole("searchbox", { name: "Buscar una base de Notion" }).closest("form")!);
    const busqueda = { conector: "notion", texto: "task", lista: [{ proyecto: "b1", nombre: "Tasks" }] };
    rerender({ gestor: { ...VINCULADO, busqueda } });
    fireEvent.click(screen.getByRole("button", { name: /^Tasks/ }));
    rerender({ gestor: { ...VINCULADO, busqueda, descripcion: { conector: "notion", pedido: "b1", esquema: ESQUEMA } } });
    expect(screen.getByText("Vincular Notion sustituirá a Jira (IXCODE) como gestor de este proyecto.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "vincular", conector: "notion", sitio: "notion", proyecto: COLECCION });

    // Ya con Notion vinculado: arriba, con el nombre de la base; Jira ofrece sustituirlo.
    alGestor.mockClear();
    rerender({ gestor: VINCULADO_A_NOTION });
    expect(within(seccion("Gestor de tareas")).getAllByRole("listitem")[0]!.textContent).toMatch(/^Notion/);
    expect(screen.getByText("Vinculado a la base «Tasks» de Notion.")).toBeTruthy();
    expect(alGestor).not.toHaveBeenCalledWith({ accion: "sitios", conector: "jira" });
    fireEvent.click(screen.getByRole("button", { name: "Vincular Jira en su lugar…" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "sitios", conector: "jira" });
    expect(screen.getByText("Vincular Jira sustituirá a Notion (Tasks) como gestor de este proyecto.")).toBeTruthy();
  });

  it("Tareas con Notion: los rótulos dicen «Notion», la clave se ENSEÑA corta y viaja ENTERA", () => {
    const pendientes = {
      cuando: 1,
      lista: [{ clave: UUID, etiqueta: "0687543b", titulo: "Pantalla de login", estado: "Not started", categoria: "por-hacer" as const, url: "https://app.notion.com/0687" }],
    };
    const { alGestor } = montar({ gestor: { ...VINCULADO_A_NOTION, pendientes }, conectores: CON_NOTION });
    pestana("Tareas");
    // Ni la URL `collection://` en el título: el nombre de la base.
    expect(screen.getByRole("heading", { name: "Pendientes de Tasks" })).toBeTruthy();
    expect(screen.queryByText(new RegExp(COLECCION))).toBeNull();
    expect(screen.getByText("0687543b")).toBeTruthy();
    expect(screen.queryByText(UUID)).toBeNull();
    expect(screen.getByRole("link", { name: "Abrir 0687543b en Notion" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con 0687543b" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "transiciones", clave: UUID, para: "empezar" });
    const dialogo = screen.getByRole("dialog", { name: "¿Empezar con 0687543b?" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Empezar sin tocar Notion" }));
    expect(alGestor).toHaveBeenCalledWith({ accion: "empezar", clave: UUID }, { destino: undefined });
  });

  it("sin el nombre de la base (un vínculo guardado antes de que se guardara) no pinta la URL `collection://`", () => {
    const sinNombre = { estado: { ...VINCULADO_A_NOTION.estado!, vinculo: { conector: "notion", sitio: "notion", proyecto: COLECCION } } };
    montar({ gestor: sinNombre, conectores: CON_NOTION });
    pestana("Tareas");
    expect(screen.getByRole("heading", { name: "Pendientes de la base vinculada" })).toBeTruthy();
    pestana("Conectores");
    expect(screen.getByText("Vinculado a una base de Notion.")).toBeTruthy();
  });

  it("«Asignadas a mí» NO se ofrece si el servidor dice que el gestor no lo admite (ni ausente)", () => {
    const pendientes = { cuando: 1, lista: [{ clave: UUID, titulo: "A", estado: "Not started", categoria: "por-hacer" as const }] };
    const { rerender } = montar({ gestor: { estado: { ...VINCULADO_A_NOTION.estado!, admiteMias: false }, pendientes }, conectores: CON_NOTION });
    pestana("Tareas");
    expect(screen.queryByRole("button", { name: "Asignadas a mí" })).toBeNull();
    const { admiteMias: _fuera, ...sinDato } = VINCULADO_A_NOTION.estado!;
    rerender({ gestor: { estado: sinDato, pendientes } });
    expect(screen.queryByRole("button", { name: "Asignadas a mí" })).toBeNull();
    rerender({ gestor: { ...VINCULADO_A_NOTION, pendientes } });
    expect(screen.getByRole("button", { name: "Asignadas a mí" })).toBeTruthy();
  });

  it("cambiar de vínculo olvida la consulta del de antes: un «mías» de Jira no viaja a una base sin persona", () => {
    const { alGestor, rerender } = montar({ gestor: { ...VINCULADO, pendientes: { cuando: 1, lista: IXCODE } }, conectores: CON_NOTION });
    pestana("Tareas");
    fireEvent.click(screen.getByRole("button", { name: "Asignadas a mí" }));
    expect(alGestor).toHaveBeenLastCalledWith({ accion: "pendientes", mias: true });
    alGestor.mockClear();
    rerender({ gestor: { estado: { ...VINCULADO_A_NOTION.estado!, admiteMias: false } } });
    expect(alGestor).toHaveBeenCalledWith({ accion: "pendientes" });
    expect(alGestor).not.toHaveBeenCalledWith(expect.objectContaining({ mias: true }));
  });

  it("«falta autorizar» al buscar en Notion lleva «Conectar Notion», no Jira", () => {
    const caido = { ...CON_NOTION, conectores: CON_NOTION.conectores.map((c) => (c.id === "notion" ? { ...c, prueba: { cuando: 1, ok: true as const, tools: [] } } : c)) };
    const { props, rerender } = montar({ gestor: { estado: { conectores: [] } }, conectores: caido });
    pestana("Conectores");
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar una base de Notion" }), { target: { value: "task" } });
    fireEvent.submit(screen.getByRole("searchbox", { name: "Buscar una base de Notion" }).closest("form")!);
    rerender({ gestor: { estado: { conectores: [] }, errores: { buscarProyectos: { motivo: "falta autorizar", texto: "task" } } } });
    expect(screen.getByRole("alert").textContent).toBe("falta autorizar");
    fireEvent.click(screen.getByRole("button", { name: "Conectar Notion" }));
    expect(props.alAutorizarConector).toHaveBeenCalledWith("notion");
    expect(screen.queryByRole("button", { name: "Conectar Jira" })).toBeNull();
  });

  it("Resumen: una sesión ligada a una tarea de Notion enseña el id CORTO", () => {
    const { props } = montar({ sesiones: [{ id: "s1", titulo: "Login", ticket: UUID }] });
    fireEvent.click(screen.getByRole("button", { name: "0687543b · Login" }));
    expect(props.alAbrirSesion).toHaveBeenCalledWith("s1");
  });
  it("con la lista del de ANTES ya tirada (el store la tira al cambiar de vínculo), Tareas dice «Consultando…» y no pinta filas viejas", () => {
    const { alGestor, rerender } = montar({ gestor: { ...VINCULADO, pendientes: { cuando: 1, lista: IXCODE } }, conectores: CON_NOTION });
    pestana("Tareas");
    expect(screen.getByText("IXCODE-7")).toBeTruthy();
    // Se revincula desde Conectores: Tareas se DESMONTA (su memoria del vínculo, también).
    pestana("Conectores");
    rerender({ gestor: VINCULADO_A_NOTION });
    alGestor.mockClear();
    pestana("Tareas");
    expect(alGestor).toHaveBeenCalledWith({ accion: "pendientes" });
    expect(screen.getByText("Consultando las tareas…")).toBeTruthy();
    expect(screen.queryByText("IXCODE-7")).toBeNull();
  });
  it("Notion: el fallo de OTRA búsqueda o de OTRA base no se pinta; el de la que hay delante, sí", () => {
    const { rerender } = montar({ gestor: { estado: { conectores: [] } }, conectores: CON_NOTION });
    pestana("Conectores");
    const campo = screen.getByRole("searchbox", { name: "Buscar una base de Notion" });
    fireEvent.change(campo, { target: { value: "task" } });
    fireEvent.submit(campo.closest("form")!);
    const base = { estado: { conectores: [] } };
    // El fallo de una búsqueda ANTERIOR («my»): sigue «Buscando…», sin aviso.
    rerender({ gestor: { ...base, errores: { buscarProyectos: { motivo: "Notion no responde", texto: "my" } } } });
    expect(screen.queryByText("Notion no responde")).toBeNull();
    expect(screen.getByText("Buscando…")).toBeTruthy();
    rerender({ gestor: { ...base, errores: { buscarProyectos: { motivo: "Notion no responde", texto: "task" } } } });
    expect(screen.getByRole("alert").textContent).toBe("Notion no responde");
    // Ya con la lista: el fallo de describir OTRA base no se pinta bajo la elegida.
    const busqueda = { conector: "notion", texto: "task", lista: [{ proyecto: "b1", nombre: "Tasks" }, { proyecto: "b2", nombre: "Otra" }] };
    rerender({ gestor: { ...base, busqueda } });
    fireEvent.click(screen.getByRole("button", { name: /^Tasks/ }));
    rerender({ gestor: { ...base, busqueda, errores: { describir: { motivo: "no existe", pedido: "b2" } } } });
    expect(screen.queryByText("no existe")).toBeNull();
    expect(screen.getByText("Leyendo el esquema de la base…")).toBeTruthy();
    rerender({ gestor: { ...base, busqueda, errores: { describir: { motivo: "no existe", pedido: "b1" } } } });
    expect(screen.getByRole("alert").textContent).toBe("no existe");
  });
});
