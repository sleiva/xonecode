import { describe, expect, it } from "vitest";
import { crearControlDeDetencion, textoDeDetencionParaHijo, textoDeDetencionParaRaiz } from "./detencion.js";

describe("el control de DETENER: a quién se detiene y qué se le dice", () => {
  it("una segunda pulsación NO vuelve a mandar lo que el raíz ya leyó (medido: se relanzaba solo tras Parar)", () => {
    const c = crearControlDeDetencion("main");
    c.antesDeLlamar("main");
    c.detener("cambio de plan");
    expect(c.antesDeLlamar("main")).toBe(textoDeDetencionParaRaiz("cambio de plan"));
    // Segunda pulsación, sin texto: no hay nada nuevo que mandar ni que dejar como sobrante.
    c.detener("");
    expect(c.sobrante()).toBeUndefined();
    // Y con texto nuevo, el raíz recibe SOLO lo nuevo.
    c.detener("y además el menú");
    expect(c.antesDeLlamar("main")).toBe(textoDeDetencionParaRaiz("y además el menú"));
  });

  it("dos pulsaciones antes de que el raíz lea nada se JUNTAN", () => {
    const c = crearControlDeDetencion("main");
    c.antesDeLlamar("main");
    c.detener("a");
    c.detener("b");
    expect(c.sobrante()).toBe("a\n\nb");
  });

  it("se detiene a los hijos nacidos ANTES de la pulsación, no a los del plan nuevo", () => {
    const c = crearControlDeDetencion("main");
    c.antesDeLlamar("main");
    c.nacio("viejo");
    c.detener("para");
    expect(c.antesDeLlamar("viejo")).toBe(textoDeDetencionParaHijo("para"));
    expect(c.soloTexto("viejo")).toBe(true);
    c.antesDeLlamar("main");
    c.nacio("nuevo");
    expect(c.antesDeLlamar("nuevo")).toBeUndefined();
    expect(c.soloTexto("nuevo")).toBe(false);
  });

  it("pulsar aborta el corte de quien está a mitad de llamada, y no el de un hijo del plan nuevo", () => {
    const c = crearControlDeDetencion("main");
    c.antesDeLlamar("main");
    c.nacio("viejo");
    const corte = c.corte("viejo")!;
    c.detener("para");
    expect(corte.senal.aborted).toBe(true);
    expect(corte.orden()).toBe(textoDeDetencionParaHijo("para"));
    // Dada la orden por el corte, el procesador no la repite.
    expect(c.antesDeLlamar("viejo")).toBeUndefined();
    c.antesDeLlamar("main");
    c.nacio("nuevo");
    expect(c.corte("nuevo")!.senal.aborted).toBe(false);
  });
});
