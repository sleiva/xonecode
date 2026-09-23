import { describe, it, expect } from "vitest";
import {
  ANCHO_MINIMO_DEL_CHAT,
  ANCHO_MINIMO_DEL_PANEL,
  ANCHO_PANEL_POR_OMISION,
  ANCHO_PANEL_MAXIMO,
  acotarAnchoDePanel,
  repartoDeColumnas,
} from "./repartoDeColumnas.js";

const BARRA = 320;

function reparto(anchoVentana: number, extra: Partial<Parameters<typeof repartoDeColumnas>[0]> = {}) {
  return repartoDeColumnas({
    anchoVentana,
    anchoBarra: BARRA,
    anchoPanel: ANCHO_PANEL_POR_OMISION,
    barraPlegadaPorElUsuario: false,
    panelAbierto: true,
    ...extra,
  });
}

/** Lo justo para las tres columnas con los valores por omisión: 320 + 560 + 480. */
const CABEN_LAS_TRES = BARRA + ANCHO_MINIMO_DEL_CHAT + ANCHO_PANEL_POR_OMISION;

describe("repartoDeColumnas", () => {
  it("con sitio de sobra, las tres columnas", () => {
    expect(reparto(1920)).toEqual({ barra: "abierta", panel: "columna" });
    expect(reparto(CABEN_LAS_TRES)).toEqual({ barra: "abierta", panel: "columna" });
  });

  it("un píxel menos de lo que hace falta y la barra se pliega SOLA, para que el panel siga al lado", () => {
    // Es la única concesión automática del reparto, y es la que el usuario pidió: «o porque
    // el resize la colapsara automáticamente».
    expect(reparto(CABEN_LAS_TRES - 1)).toEqual({ barra: "plegada", panel: "columna" });
  });

  it("y ese plegado es TRANSITORIO: al volver el sitio, la barra vuelve", () => {
    // El contrato que esto fija no está aquí sino en quien lo consume: `barra: "plegada"`
    // NO se escribe en la preferencia del navegador. Si alguien lo guardara, estrechar la
    // ventana una vez dejaría la barra plegada para siempre — y este test seguiría verde,
    // así que su pareja vive en `App.test.tsx`.
    expect(reparto(CABEN_LAS_TRES - 1).barra).toBe("plegada");
    expect(reparto(CABEN_LAS_TRES).barra).toBe("abierta");
  });

  it("sin sitio ni para el chat y el panel, el panel ocupa el CENTRO: es como se comportaba antes", () => {
    const justo = ANCHO_MINIMO_DEL_CHAT + ANCHO_PANEL_POR_OMISION;
    expect(reparto(justo)).toEqual({ barra: "plegada", panel: "columna" });
    expect(reparto(justo - 1).panel).toBe("centro");
  });

  it("con el panel en el centro, la barra la manda el usuario y nadie más", () => {
    // El panel ya no le disputa el sitio a la barra —ocupa el del chat—, así que no hay
    // motivo para plegarla.
    expect(reparto(900)).toEqual({ barra: "abierta", panel: "centro" });
    expect(reparto(900, { barraPlegadaPorElUsuario: true })).toEqual({ barra: "plegada", panel: "centro" });
    expect(reparto(400)).toEqual({ barra: "abierta", panel: "centro" });
  });

  it("si el usuario la plegó, sigue plegada aunque quepa de sobra", () => {
    expect(reparto(1920, { barraPlegadaPorElUsuario: true })).toEqual({ barra: "plegada", panel: "columna" });
  });

  it("sin panel abierto NO hay concesión ninguna: una ventana estrecha se comporta como siempre", () => {
    // Es deliberado, y el motivo es que el botón de la barra no puede quedarse muerto: si el
    // ancho la plegara por su cuenta sin panel de por medio, pulsar «Mostrar la barra
    // lateral» no haría nada y no habría forma de arreglarlo. Con el panel abierto sí la hay
    // —cerrarlo—, y eso es lo que hace ese botón cuando el reparto le ha quitado el sitio.
    expect(reparto(1920, { panelAbierto: false })).toEqual({ barra: "abierta", panel: "cerrado" });
    expect(reparto(320, { panelAbierto: false })).toEqual({ barra: "abierta", panel: "cerrado" });
    expect(reparto(320, { panelAbierto: false, barraPlegadaPorElUsuario: true }).barra).toBe("plegada");
  });

  it("un panel que alguien encogió por debajo de su suelo no gana sitio: el suelo manda", () => {
    // `anchoPanel` viene de `localStorage`, o sea que puede traer cualquier cosa de una
    // versión anterior o de una mano. Lo que se reparte es el suelo, no lo que diga el dato.
    const conPanelEnano = reparto(ANCHO_MINIMO_DEL_CHAT + ANCHO_MINIMO_DEL_PANEL - 1, { anchoPanel: 10 });
    expect(conPanelEnano.panel).toBe("centro");
  });

  it("sin medida de la ventana se decide como si sobrara sitio, que es el lado que no esconde nada", () => {
    for (const nada of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(reparto(nada)).toEqual({ barra: "abierta", panel: "columna" });
    }
  });
});

describe("acotarAnchoDePanel", () => {
  it("acota al suelo y al techo", () => {
    expect(acotarAnchoDePanel(10)).toBe(ANCHO_MINIMO_DEL_PANEL);
    expect(acotarAnchoDePanel(5000)).toBe(ANCHO_PANEL_MAXIMO);
    expect(acotarAnchoDePanel(500)).toBe(500);
  });

  it("con la ventana delante, el techo es lo que le SOBRA al chat", () => {
    // 1200 de ventana menos los 560 del chat: el panel no puede pasar de 640, y por eso
    // arrastrarlo no puede hacer que el reparto cambie de rama en medio del gesto.
    expect(acotarAnchoDePanel(700, 1200)).toBe(1200 - ANCHO_MINIMO_DEL_CHAT);
    expect(acotarAnchoDePanel(700, 4000)).toBe(700);
  });

  it("y en una ventana donde no cabe ni el suelo, devuelve el suelo", () => {
    expect(acotarAnchoDePanel(700, 600)).toBe(ANCHO_MINIMO_DEL_PANEL);
  });

  it("lo que no es un número cae en la omisión: un NaN acabaría en un `grid-template-columns`", () => {
    expect(acotarAnchoDePanel(Number.NaN)).toBe(ANCHO_PANEL_POR_OMISION);
  });
});


describe("el tope del panel, ensanchado", () => {
  it("deja arrastrarlo muy por encima de los 720 de antes, y sigue sin llevarse el chat", () => {
    // Pedido por él: «el resize tiene un tope, dejarlo más».
    expect(ANCHO_PANEL_MAXIMO).toBeGreaterThanOrEqual(1200);
    expect(acotarAnchoDePanel(1100, 2400)).toBe(1100);
    // En una ventana de 1400 el chat conserva su suelo: el panel no pasa de 1400 − 560.
    expect(acotarAnchoDePanel(1300, 1400)).toBe(1400 - ANCHO_MINIMO_DEL_CHAT);
  });
});
