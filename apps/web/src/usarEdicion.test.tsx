import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, type Mock } from "vitest";
import { DEMASIADO_GRANDE, SE_CORTO_EL_CABLE, usarEdicion, type UltimoGuardado } from "./usarEdicion.js";
import { TOPE_DEL_CUERPO_DEL_CABLE } from "./edicion.js";
import type { BaseDelFichero, FicheroDelProyecto } from "./tipos.js";

const FICHERO: FicheroDelProyecto = { ruta: "a.xne", texto: "uno\r\ndos\r\n", recortado: false, binario: false, bytes: 10, codificacion: "utf-8", huella: "h1" };

interface Entrada {
  proyecto: string | undefined;
  contenidos: Record<string, FicheroDelProyecto> | undefined;
  bases: Record<string, BaseDelFichero> | undefined;
  ultimoGuardado: UltimoGuardado | undefined;
  conectado: boolean | undefined;
}

function montar(enviar: Mock<(m: unknown) => Promise<unknown>> = vi.fn(() => Promise.resolve(undefined))) {
  const inicial: Entrada = { proyecto: "p1", contenidos: { "a.xne": FICHERO }, bases: undefined, ultimoGuardado: undefined, conectado: true };
  const vista = renderHook((e: Entrada) => usarEdicion({ enviar, ...e }), { initialProps: inicial });
  return { enviar, vista, inicial };
}
const idMandado = (enviar: Mock<(m: unknown) => Promise<unknown>>): string =>
  (mandados(enviar, "guardarFichero").at(-1) as unknown as { id: string }).id;
const mandados = (enviar: Mock<(m: unknown) => Promise<unknown>>, clase: string) =>
  enviar.mock.calls.map(([m]) => m as { clase: string }).filter((m) => m.clase === clase);

describe("usarEdicion", () => {
  it("abrir un fichero editable pide su base del inicio de la sesión; uno que no lo es no abre nada", () => {
    const { enviar, vista } = montar();
    act(() => vista.result.current.abrir({ ...FICHERO, recortado: true }));
    expect(vista.result.current.actual).toBeUndefined();
    act(() => vista.result.current.abrir(FICHERO));
    expect(vista.result.current.actual).toMatchObject({ ruta: "a.xne", original: "uno\ndos\n", huella: "h1", finDeLinea: "\r\n", sucio: false, guardando: false });
    expect(vista.result.current.textoVivo()).toBe("uno\ndos\n");
    expect(enviar).toHaveBeenCalledWith({ clase: "baseDeFichero", ruta: "a.xne", base: "sesion" });
  });

  it("cambiar marca «sucio», y volver al texto de antes lo desmarca", () => {
    const { vista } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("uno\nDOS\n"));
    expect(vista.result.current.actual?.sucio).toBe(true);
    act(() => vista.result.current.cambiar("uno\ndos\n"));
    expect(vista.result.current.actual?.sucio).toBe(false);
  });

  it("guardar manda la huella y el texto con su CRLF; sin cambios no manda nada", () => {
    const { enviar, vista } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.guardar());
    expect(mandados(enviar, "guardarFichero")).toEqual([]);
    act(() => vista.result.current.cambiar("uno\nDOS\n"));
    act(() => vista.result.current.guardar());
    expect(mandados(enviar, "guardarFichero")).toEqual([{ clase: "guardarFichero", ruta: "a.xne", texto: "uno\r\nDOS\r\n", huella: "h1", id: expect.any(String), proyecto: "p1" }]);
    expect(vista.result.current.actual?.guardando).toBe(true);
  });

  it("lo que no cabe por el cable no se manda: se dice", () => {
    const { enviar, vista } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("\t".repeat(TOPE_DEL_CUERPO_DEL_CABLE)));
    act(() => vista.result.current.guardar());
    expect(mandados(enviar, "guardarFichero")).toEqual([]);
    expect(vista.result.current.actual?.error).toBe(DEMASIADO_GRANDE);
  });

  it("la respuesta con huella deja limpio lo que se mandó, y pide fichero, revisión y base", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("uno\nDOS\n"));
    act(() => vista.result.current.guardar());
    const mio = idMandado(enviar);
    enviar.mockClear();
    vista.rerender({ ...inicial, ultimoGuardado: { ruta: "a.xne", huella: "h2", id: mio, secuencia: 1 } });
    expect(vista.result.current.actual).toMatchObject({ original: "uno\nDOS\n", huella: "h2", sucio: false, guardando: false });
    expect(enviar).toHaveBeenCalledWith({ clase: "fichero", ruta: "a.xne" });
    expect(enviar).toHaveBeenCalledWith({ clase: "revision" });
    expect(enviar).toHaveBeenCalledWith({ clase: "baseDeFichero", ruta: "a.xne", base: "sesion" });
  });

  it("la respuesta con error lo enseña y deja guardar otra vez", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("uno\nDOS\n"));
    act(() => vista.result.current.guardar());
    vista.rerender({ ...inicial, ultimoGuardado: { ruta: "a.xne", id: idMandado(enviar), error: "espera a que termine el turno: el agente está trabajando en este proyecto", secuencia: 1 } });
    expect(vista.result.current.actual).toMatchObject({ guardando: false, sucio: true, error: "espera a que termine el turno: el agente está trabajando en este proyecto" });
  });

  it("un guardado de OTRA pestaña (sin uno en vuelo aquí) es un cambio en disco: se pide el fichero", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    enviar.mockClear();
    vista.rerender({ ...inicial, ultimoGuardado: { ruta: "a.xne", huella: "h9", secuencia: 1 } });
    expect(enviar).toHaveBeenCalledWith({ clase: "fichero", ruta: "a.xne" });
    expect(vista.result.current.actual?.huella).toBe("h1");
  });

  it("la respuesta de OTRA pestaña mientras guardo no es la mía, aunque las dos partan de h1", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("uno\nMIO\n"));
    act(() => vista.result.current.guardar());
    const mio = idMandado(enviar);
    enviar.mockClear();
    // La otra pestaña también partía de h1, y el servidor la aceptó primero.
    vista.rerender({ ...inicial, ultimoGuardado: { ruta: "a.xne", id: "otro", huella: "h2", secuencia: 1 } });
    expect(vista.result.current.actual).toMatchObject({ huella: "h1", sucio: true, guardando: true, original: "uno\ndos\n" });
    expect(enviar).toHaveBeenCalledWith({ clase: "fichero", ruta: "a.xne" });
    // Y ahora MI rechazo, que lleva el id que mandé.
    vista.rerender({ ...inicial, ultimoGuardado: { ruta: "a.xne", id: mio, error: "el fichero cambió desde que lo abriste: recárgalo antes de guardar", secuencia: 2 } });
    expect(vista.result.current.actual).toMatchObject({ guardando: false, sucio: true, huella: "h1", error: "el fichero cambió desde que lo abriste: recárgalo antes de guardar" });
    expect(vista.result.current.textoVivo()).toBe("uno\nMIO\n");
  });

  it("un rechazo de MI guardado vuelve a pedir el fichero: si cambió, sale la banda con mis cambios", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("mío\n"));
    act(() => vista.result.current.guardar());
    const mio = idMandado(enviar);
    enviar.mockClear();
    vista.rerender({ ...inicial, ultimoGuardado: { ruta: "a.xne", id: mio, error: "el fichero cambió desde que lo abriste: recárgalo antes de guardar", secuencia: 1 } });
    expect(enviar).toHaveBeenCalledWith({ clase: "fichero", ruta: "a.xne" });
    vista.rerender({ ...inicial, ultimoGuardado: { ruta: "a.xne", id: mio, error: "x", secuencia: 1 }, contenidos: { "a.xne": { ...FICHERO, texto: "otro\n", huella: "h2" } } });
    expect(vista.result.current.actual?.versionNueva).toEqual({ original: "otro\n", huella: "h2", finDeLinea: "\n" });
    expect(vista.result.current.textoVivo()).toBe("mío\n");
  });

  it("un guardado que el servidor no aceptó (4xx) también vuelve a pedir el fichero", async () => {
    const enviar = vi.fn((m: unknown) => Promise.resolve((m as { clase: string }).clase === "guardarFichero" ? { ok: false } : undefined));
    const { vista } = montar(enviar);
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("mío\n"));
    enviar.mockClear();
    await act(async () => vista.result.current.guardar());
    expect(vista.result.current.actual).toMatchObject({ guardando: false, error: "el servidor no aceptó el guardado" });
    expect(enviar).toHaveBeenCalledWith({ clase: "fichero", ruta: "a.xne" });
  });

  it("«Seguir con los míos» adopta la huella nueva: el siguiente guardado sobrescribe a sabiendas", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("mío\n"));
    vista.rerender({ ...inicial, contenidos: { "a.xne": { ...FICHERO, texto: "otro\n", huella: "h2" } } });
    act(() => vista.result.current.seguirConLosMios());
    expect(vista.result.current.actual).toMatchObject({ huella: "h2", sobrescribe: true });
    expect(vista.result.current.actual?.versionNueva).toBeUndefined();
    act(() => vista.result.current.guardar());
    expect(mandados(enviar, "guardarFichero").at(-1)).toMatchObject({ huella: "h2", texto: "mío\r\n" });
    // Y al guardar bien, el aviso se va.
    vista.rerender({ ...inicial, contenidos: { "a.xne": { ...FICHERO, texto: "otro\n", huella: "h2" } }, ultimoGuardado: { ruta: "a.xne", id: idMandado(enviar), huella: "h3", secuencia: 1 } });
    expect(vista.result.current.actual?.sobrescribe).toBeUndefined();
  });

  it("cada guardado lleva un id distinto", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("a\n"));
    act(() => vista.result.current.guardar());
    const primero = idMandado(enviar);
    vista.rerender({ ...inicial, ultimoGuardado: { ruta: "a.xne", id: primero, huella: "h2", secuencia: 1 } });
    act(() => vista.result.current.cambiar("b\n"));
    act(() => vista.result.current.guardar());
    expect(idMandado(enviar)).not.toBe(primero);
  });

  it("una versión nueva sin cambios propios se recarga sola", () => {
    const { vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    const generacion = vista.result.current.actual!.generacion;
    vista.rerender({ ...inicial, contenidos: { "a.xne": { ...FICHERO, texto: "otro\n", huella: "h3" } } });
    expect(vista.result.current.actual).toMatchObject({ original: "otro\n", huella: "h3", sucio: false, finDeLinea: "\n" });
    expect(vista.result.current.actual!.generacion).toBe(generacion + 1);
    expect(vista.result.current.textoVivo()).toBe("otro\n");
  });

  it("una versión nueva con cambios sin guardar NO los pisa: sale la banda, y se elige", () => {
    const { vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("mío\n"));
    const nueva = { ...inicial, contenidos: { "a.xne": { ...FICHERO, texto: "otro\n", huella: "h3" } } };
    vista.rerender(nueva);
    expect(vista.result.current.actual?.versionNueva).toEqual({ original: "otro\n", huella: "h3", finDeLinea: "\n" });
    expect(vista.result.current.textoVivo()).toBe("mío\n");

    act(() => vista.result.current.seguirConLosMios());
    expect(vista.result.current.actual?.versionNueva).toBeUndefined();
    vista.rerender({ ...nueva, contenidos: { "a.xne": { ...FICHERO, texto: "otro\n", huella: "h3" } } });
    expect(vista.result.current.actual?.versionNueva).toBeUndefined(); // la misma huella no vuelve a salir

    vista.rerender({ ...inicial, contenidos: { "a.xne": { ...FICHERO, texto: "tercero\n", huella: "h4" } } });
    act(() => vista.result.current.recargar());
    expect(vista.result.current.actual).toMatchObject({ original: "tercero\n", huella: "h4", sucio: false });
    expect(vista.result.current.textoVivo()).toBe("tercero\n");
  });

  it("«haySinGuardar» contesta al momento, sin esperar a repintar: tras cerrar ya es falso", () => {
    const { vista } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("mío\n"));
    const control = vista.result.current;
    expect(control.haySinGuardar()).toBe(true);
    act(() => control.cerrar());
    // El mismo objeto, sin repintar entre medias: es lo que ve la acción que sigue a «Descartar».
    expect(control.haySinGuardar()).toBe(false);
  });

  it("cambiar de proyecto SIN cambios suelta la edición: guardar escribe en el ABIERTO", () => {
    const { vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    vista.rerender({ ...inicial, proyecto: "p2" });
    expect(vista.result.current.actual).toBeUndefined();
  });

  it("cambiar de proyecto CON cambios no se los lleva: se conservan, se marca y guardar no manda nada", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("mío\n"));
    enviar.mockClear();
    vista.rerender({ ...inicial, proyecto: "p2" });
    expect(vista.result.current.actual).toMatchObject({ ruta: "a.xne", proyecto: "p1", sucio: true, proyectoCambiado: true });
    expect(vista.result.current.textoVivo()).toBe("mío\n");
    act(() => vista.result.current.guardar());
    expect(mandados(enviar, "guardarFichero")).toEqual([]);
    // Un fichero de la MISMA ruta en el otro proyecto no es una versión nueva de este.
    vista.rerender({ ...inicial, proyecto: "p2", contenidos: { "a.xne": { ...FICHERO, texto: "del otro\n", huella: "h7" } } });
    expect(vista.result.current.actual?.versionNueva).toBeUndefined();
    // «Descartar» lo suelta sin preguntar más.
    act(() => vista.result.current.descartar());
    expect(vista.result.current.actual).toBeUndefined();
  });

  it("si el proyecto vuelve a ser el de la edición, la marca se quita y se puede guardar", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("mío\n"));
    // Un corte del cable vacía el alta: el proyecto pasa por `undefined` y vuelve.
    vista.rerender({ ...inicial, proyecto: undefined });
    expect(vista.result.current.actual?.proyectoCambiado).toBe(true);
    vista.rerender(inicial);
    expect(vista.result.current.actual?.proyectoCambiado).toBeUndefined();
    act(() => vista.result.current.guardar());
    expect(mandados(enviar, "guardarFichero")).toHaveLength(1);
  });

  it("si se cae el cable con un guardado en vuelo, se dice que no se sabe", () => {
    const { vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("mío\n"));
    act(() => vista.result.current.guardar());
    vista.rerender({ ...inicial, conectado: false });
    expect(vista.result.current.actual).toMatchObject({ guardando: false, error: SE_CORTO_EL_CABLE });
  });

  it("elegir «commit» y volver a «sesion» no deja la base de commit: se pide otra vez", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.elegirBase("commit"));
    act(() => vista.result.current.elegirBase("sesion"));
    enviar.mockClear();
    // La respuesta de «commit» llega TARDE, después de haber vuelto a «sesion».
    vista.rerender({ ...inicial, bases: { "a.xne": { ruta: "a.xne", base: "commit", texto: "viejo\n" } } });
    expect(vista.result.current.base).toBeUndefined();
    expect(enviar).toHaveBeenLastCalledWith({ clase: "baseDeFichero", ruta: "a.xne", base: "sesion" });
  });

  it("la base es la de la ruta y la base ELEGIDA; elegir otra la pide", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    vista.rerender({ ...inicial, bases: { "a.xne": { ruta: "a.xne", base: "sesion", texto: "uno\n" } } });
    expect(vista.result.current.base).toEqual({ ruta: "a.xne", base: "sesion", texto: "uno\n" });
    act(() => vista.result.current.elegirBase("commit"));
    expect(vista.result.current.base).toBeUndefined();
    expect(enviar).toHaveBeenCalledWith({ clase: "baseDeFichero", ruta: "a.xne", base: "commit" });
  });
});
