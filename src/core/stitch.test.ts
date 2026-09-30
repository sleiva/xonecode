import { describe, expect, it } from "vitest";
import {
  designMdDeProyecto, esDeLaMaqueta, leerPantalla, motivoDeDescargaInaceptable, motivoDePantallaInaceptable, proyectoDePantalla, RUTA_DE_DISENO, urlDeImagenCompleta,
} from "./stitch.js";

describe("traer una pantalla de Stitch: las reglas", () => {
  it("la pantalla se da por su `name`; cualquier otra cosa se rechaza con la forma buena", () => {
    expect(motivoDePantallaInaceptable("projects/142/screens/67c6ab")).toBeUndefined();
    expect(motivoDePantallaInaceptable("67c6ab")).toContain("projects/<id>/screens/<id>");
    expect(motivoDePantallaInaceptable("projects/142/screens/../x")).toBeDefined();
    expect(proyectoDePantalla("projects/142/screens/67c6ab")).toBe("projects/142");
  });

  it("solo se baja HTTPS limpio de los dos hosts medidos: una URL de la respuesta también se comprueba", () => {
    expect(motivoDeDescargaInaceptable("https://lh3.googleusercontent.com/aida/x")).toBeUndefined();
    expect(motivoDeDescargaInaceptable("https://contribution.usercontent.google.com/download?c=x")).toBeUndefined();
    expect(motivoDeDescargaInaceptable("http://lh3.googleusercontent.com/x")).toBeDefined();
    expect(motivoDeDescargaInaceptable("https://evil.example/x")).toContain("evil.example");
    expect(motivoDeDescargaInaceptable("https://u:p@lh3.googleusercontent.com/x")).toBeDefined();
    expect(motivoDeDescargaInaceptable("no es url")).toBeDefined();
  });

  it("la imagen de `lh3` se pide a tamaño REAL (`=s0`; sin él, una miniatura), salvo que ya traiga tamaño", () => {
    expect(urlDeImagenCompleta("https://lh3.googleusercontent.com/aida/AB12")).toBe("https://lh3.googleusercontent.com/aida/AB12=s0");
    expect(urlDeImagenCompleta("https://lh3.googleusercontent.com/aida/AB12=w780")).toBe("https://lh3.googleusercontent.com/aida/AB12=w780");
    expect(urlDeImagenCompleta("https://contribution.usercontent.google.com/download?c=x")).toBe("https://contribution.usercontent.google.com/download?c=x");
  });

  it("de `get_screen` se leen título, medidas y los dos enlaces; sin imagen es un motivo", () => {
    const texto = JSON.stringify({
      name: "projects/1/screens/a", title: "Ajustes", width: "780", height: "1768",
      screenshot: { downloadUrl: "https://lh3.googleusercontent.com/i" }, htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/h" },
    });
    expect(leerPantalla(texto)).toEqual({ titulo: "Ajustes", ancho: 780, alto: 1768, imagen: "https://lh3.googleusercontent.com/i", html: "https://contribution.usercontent.google.com/h" });
    expect(leerPantalla(JSON.stringify({ title: "x" }))).toContain("no dio la imagen");
    expect(leerPantalla("no json")).toContain("no es JSON");
  });

  it("el DESIGN.md sale de `designTheme.designMd`, y vacío es que no hay", () => {
    expect(designMdDeProyecto(JSON.stringify({ designTheme: { designMd: "---\nname: X" } }))).toBe("---\nname: X");
    expect(designMdDeProyecto(JSON.stringify({ designTheme: { designMd: "  " } }))).toBeUndefined();
    expect(designMdDeProyecto("{}")).toBeUndefined();
  });

  it("lo de `/artefactos/diseno/` es la maqueta, no una captura", () => {
    expect(esDeLaMaqueta(`${RUTA_DE_DISENO}screen.png`)).toBe(true);
    expect(esDeLaMaqueta("/artefactos/captura-1.png")).toBe(false);
  });
});
