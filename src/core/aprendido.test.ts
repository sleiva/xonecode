import { describe, expect, it } from "vitest";
import {
  bloqueDeAprendido,
  conAprendizaje,
  interpretarAprendido,
  motivoDeAprendizajeInaceptable,
  aprendidoParaElCable,
  conEntradaEditada,
  estaOculto,
  motivoDeXoneConDatosDelProyecto,
  sinEntrada,
  nombresDelProyecto,
  TOPE_DE_APRENDIZAJES,
  TOPE_DE_COMO_LO_SE,
  TOPE_DE_TEXTO,
  USO_DE_APRENDIDO_EXTERNO,
  USO_DE_APUNTAR_APRENDIZAJE,
} from "./aprendido.js";
import { viajaEnSoporte } from "./paqueteDeSoporte.js";

const a = (tema: string, texto = "x", cuando = "2026-10-15T10:00:00.000Z") => ({ tema, texto, cuando });

describe("lo aprendido en un proyecto", () => {
  it("el mismo tema se SUSTITUYE (sin mirar mayúsculas ni espacios) y pasa al final", () => {
    const lista = conAprendizaje([a("Cómo entrar en la app", "usuario 1"), a("otra")], a("cómo  entrar en la app ", "usuario 08006, pulsar Entrar"));
    expect(lista.map((x) => x.texto)).toEqual(["x", "usuario 08006, pulsar Entrar"]);
  });

  it("pasado el tope se va el más viejo", () => {
    let lista = Array.from({ length: TOPE_DE_APRENDIZAJES }, (_, i) => a(`t${i}`));
    lista = conAprendizaje(lista, a("nuevo"));
    expect(lista).toHaveLength(TOPE_DE_APRENDIZAJES);
    expect(lista[0]!.tema).toBe("t1");
    expect(lista.at(-1)!.tema).toBe("nuevo");
  });

  it("un fichero roto es una lista vacía, y una entrada mala se deja fuera", () => {
    expect(interpretarAprendido("{roto")).toEqual([]);
    expect(interpretarAprendido(JSON.stringify([a("bien"), { tema: 3 }]))).toEqual([a("bien")]);
  });

  it("el bloque lo pone delante; sin nada, nada", () => {
    expect(bloqueDeAprendido([])).toBeUndefined();
    expect(bloqueDeAprendido([a("cómo entrar en la app", "usuario 08006\nsin clave")])).toContain("- cómo entrar en la app: usuario 08006 sin clave");
  });

  it("vacío o demasiado largo no se apunta", () => {
    expect(motivoDeAprendizajeInaceptable({ tema: " ", texto: "x", comoLoSe: "lo probé" })).toBe("falta el tema");
    expect(motivoDeAprendizajeInaceptable({ tema: "t", texto: "x".repeat(TOPE_DE_TEXTO + 1), comoLoSe: "lo probé" })).toContain("demasiado largo");
    expect(motivoDeAprendizajeInaceptable({ tema: "t", texto: "x", comoLoSe: "y".repeat(TOPE_DE_COMO_LO_SE + 1) })).toContain("demasiado largo");
    expect(motivoDeAprendizajeInaceptable({ tema: "t", texto: "x", comoLoSe: "lo probé" })).toBeUndefined();
  });

  it("sin decir CÓMO se comprobó no se apunta: lo supuesto no es un aprendizaje", () => {
    expect(motivoDeAprendizajeInaceptable({ tema: "t", texto: "x", comoLoSe: "  " })).toContain("falta cómo lo sabes");
  });

  it("el bloque dice cómo se comprobó; una entrada de antes, sin ello, sigue valiendo y va sin el paréntesis", () => {
    const nueva = { ...a("cómo entrar en la app", "usuario 08006"), comoLoSe: "entré en el\nemulador" };
    const vieja = a("menú de albaranes", "pulsar Albaranes");
    expect(interpretarAprendido(JSON.stringify([nueva, vieja, { ...vieja, comoLoSe: 3 }]))).toEqual([nueva, vieja]);
    const bloque = bloqueDeAprendido([nueva, vieja])!;
    expect(bloque).toContain("- cómo entrar en la app: usuario 08006 (comprobado: entré en el emulador)");
    expect(bloque.split("\n").at(-1)).toBe("- menú de albaranes: pulsar Albaranes");
  });

  it("el cuándo apuntar pide un HECHO comprobado, y el del externo, cómo lo comprobó", () => {
    expect(USO_DE_APUNTAR_APRENDIZAJE).toContain("CÓMO lo comprobaste");
    expect(USO_DE_APUNTAR_APRENDIZAJE).toContain("Lo que supones no se apunta");
    expect(USO_DE_APRENDIDO_EXTERNO).toContain("comprobado:");
  });

  it("no viaja en un paquete de soporte: puede llevar una contraseña", () => {
    expect(viajaEnSoporte(".xonecode/aprendido.json")).toBe(false);
  });

  it("lo del proyecto y lo de XOne van en dos bloques, cada uno con su cabecera; sin uno, solo el otro", () => {
    const delProyecto = [a("cómo entrar en la app", "usuario 08006")];
    const deXone = [a("imgbk anula border-corner-radius", "en un frame")];
    const ambos = bloqueDeAprendido(delProyecto, deXone)!;
    expect(ambos.indexOf("LO APRENDIDO EN ESTE PROYECTO")).toBeLessThan(ambos.indexOf("LO APRENDIDO DE XONE"));
    expect(ambos).toContain("- imgbk anula border-corner-radius: en un frame");
    expect(bloqueDeAprendido([], deXone)).not.toContain("EN ESTE PROYECTO");
    expect(bloqueDeAprendido([], deXone)).toContain("LO APRENDIDO DE XONE");
    expect(bloqueDeAprendido([], [])).toBeUndefined();
  });

  it("el cuándo apuntar explica los dos alcances, y que en XOne no van datos del proyecto", () => {
    expect(USO_DE_APUNTAR_APRENDIZAJE).toContain("`proyecto`");
    expect(USO_DE_APUNTAR_APRENDIZAJE).toContain("`xone`");
    expect(USO_DE_APUNTAR_APRENDIZAJE).toContain("nunca usuarios, claves ni nombres de este proyecto");
    expect(USO_DE_APRENDIDO_EXTERNO).toContain("«XOne:»");
  });

  it("lo de XOne que NOMBRA el proyecto, una colección o un fichero suyo se rechaza: es de este proyecto", () => {
    const nombres = nombresDelProyecto("Maset", ["EntryPoint.xne", "MenuLiquidacionesGeneral.xne", "icons/liq_card_bg.svg", "app.xml", "default.css"]);
    // Medido el 23-10-2026: el diseñador apuntó como XOne lo que había en /artefactos/diseno de Maset.
    expect(motivoDeXoneConDatosDelProyecto({ tema: "qué hay ahora en /artefactos/diseno", texto: "es la de LIQUIDACIONES (MenuLiquidacionesGeneral)", comoLoSe: "lo leí" }, nombres))
      .toContain("«MenuLiquidacionesGeneral»");
    expect(motivoDeXoneConDatosDelProyecto({ tema: "t", texto: "en Maset el menú", comoLoSe: "x" }, nombres)).toContain("«Maset»");
    expect(motivoDeXoneConDatosDelProyecto({ tema: "t", texto: "x", comoLoSe: "lo vi en EntryPoint.xne" }, nombres)).toContain("«EntryPoint»");
    expect(motivoDeXoneConDatosDelProyecto({ tema: "t", texto: "usa icons/liq_card_bg.svg", comoLoSe: "x" }, nombres)).toContain("liq_card_bg");
    // Lo de XOne de verdad pasa, y los nombres GENÉRICOS de cualquier app (app.xml, default.css) no cuentan.
    expect(motivoDeXoneConDatosDelProyecto({ tema: "imgbk anula border-corner-radius", texto: "en un frame; el estilo en default.css y la resolución en app.xml", comoLoSe: "lo vi en el emulador" }, nombres)).toBeUndefined();
    // Palabra entera: una colección «Menu» no casa dentro de «MenuItem» ni de «menu».
    expect(motivoDeXoneConDatosDelProyecto({ tema: "t", texto: "el menu y el MenuItem", comoLoSe: "x" }, nombresDelProyecto("P", ["Menu.xne"]))).toBeUndefined();
  });

  // La pestaña «Lo aprendido» (diseño A, elegido por él): ver, editar, borrar; lo sensible oculto hasta «Ver».
  describe("para el panel", () => {
    const clave = { tema: "cómo entrar en la app", texto: "usuario 08006, contraseña vacía", cuando: "2026-10-22T16:52:00.000Z", comoLoSe: "entré" };
    const xone = { tema: "alfa en SVG", texto: "#RRGGBBAA", cuando: "2026-10-23T08:44:00.000Z", comoLoSe: "medido" };

    it("lo sensible se oculta: por su marca, o si no la tiene, por lo que dice; lo marcado como no sensible se ve", () => {
      expect(estaOculto(clave)).toBe(true);
      expect(estaOculto({ ...xone, sensible: true })).toBe(true);
      expect(estaOculto(xone)).toBe(false);
      expect(estaOculto({ ...clave, sensible: false })).toBe(false);
    });

    it("al cable lo oculto va SIN texto: el secreto no viaja hasta pedirlo", () => {
      const cable = aprendidoParaElCable([clave, xone]);
      expect(cable[0]).toEqual({ id: "cómo entrar en la app", tema: "cómo entrar en la app", oculto: true, comoLoSe: "entré", cuando: clave.cuando });
      expect(JSON.stringify(cable)).not.toContain("08006");
      expect(cable[1]).toMatchObject({ id: "alfa en svg", texto: "#RRGGBBAA" });
    });

    it("editar respeta las reglas, conserva el texto oculto si no se manda, y no pisa otro tema", () => {
      const lista = [clave, xone];
      const r = conEntradaEditada(lista, "cómo entrar en la app", { tema: "entrar en la app", comoLoSe: "lo probé" });
      expect("lista" in r && r.lista[0]).toMatchObject({ tema: "entrar en la app", texto: clave.texto, comoLoSe: "lo probé" });
      expect(conEntradaEditada(lista, "alfa en svg", { tema: "alfa en SVG", texto: "x", comoLoSe: "" })).toEqual({ motivo: expect.stringContaining("falta cómo lo sabes") });
      expect(conEntradaEditada(lista, "alfa en svg", { tema: "Cómo entrar en la app", texto: "x", comoLoSe: "y" })).toEqual({ motivo: expect.stringContaining("ya hay otra") });
      expect(conEntradaEditada(lista, "no-existe", { tema: "t", texto: "x", comoLoSe: "y" })).toEqual({ motivo: expect.stringContaining("ya no está") });
    });

    it("borrar quita esa y solo esa; una que ya no está se dice", () => {
      expect(sinEntrada([clave, xone], "alfa en svg")).toEqual({ lista: [clave] });
      expect(sinEntrada([clave], "alfa en svg")).toEqual({ motivo: expect.stringContaining("ya no está") });
    });
  });
});
