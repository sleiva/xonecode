import { describe, expect, it } from "vitest";
import {
  idsDeBusqueda, motivoDeColorInaceptable, motivoDeIdInaceptable, motivoDeSvgInaceptable,
  nombreDeFicheroDeIcono, rutaDeIcono, TOPE_DE_SVG_BYTES, urlDeBusqueda, urlDeSvg,
} from "./iconos.js";

describe("iconos: qué se pide", () => {
  it("un id es prefijo:nombre y nada que salga de esa ruta", () => {
    expect(motivoDeIdInaceptable("lucide:home")).toBeUndefined();
    expect(motivoDeIdInaceptable("mdi:arrow-right")).toBeUndefined();
    for (const mal of ["home", "lucide:", ":home", "lucide:../x", "a/b:c", "Lucide:Home", "lucide:home?x=1", "lucide:a:b"]) {
      expect(motivoDeIdInaceptable(mal), mal).toBeDefined();
    }
  });

  it("el color es hexadecimal: currentColor y los nombres CSS se rechazan", () => {
    expect(motivoDeColorInaceptable("#1a73e8")).toBeUndefined();
    expect(motivoDeColorInaceptable("#fff")).toBeUndefined();
    for (const mal of ["currentColor", "red", "#12", "#1a73e8ff", "1a73e8", "rgb(0,0,0)"]) {
      expect(motivoDeColorInaceptable(mal), mal).toBeDefined();
    }
  });

  it("la URL del SVG lleva SIEMPRE color y altura, y el # va codificado", () => {
    const url = new URL(urlDeSvg("lucide:home", "#1a73e8", 24));
    expect(url.origin).toBe("https://api.iconify.design");
    expect(url.pathname).toBe("/lucide/home.svg");
    expect(url.searchParams.get("color")).toBe("#1a73e8");
    expect(url.searchParams.get("height")).toBe("24");
    expect(url.toString()).toContain("color=%231a73e8");
  });

  it("la búsqueda lleva la consulta codificada y el prefijo solo si hay", () => {
    const con = new URL(urlDeBusqueda("arrow & co", 5, "lucide"));
    expect(con.searchParams.get("query")).toBe("arrow & co");
    expect(con.searchParams.get("prefix")).toBe("lucide");
    expect(new URL(urlDeBusqueda("home", 5)).searchParams.has("prefix")).toBe(false);
  });
});

describe("iconos: qué se acepta de vuelta", () => {
  it("de la búsqueda solo salen ids con forma de id", () => {
    expect(idsDeBusqueda({ icons: ["lucide:home", "../etc", 3, "mdi:home-outline"] })).toEqual([
      "lucide:home", "mdi:home-outline",
    ]);
    expect(idsDeBusqueda(null)).toEqual([]);
    expect(idsDeBusqueda({ icons: "no" })).toEqual([]);
  });

  it("un SVG de Iconify vale; lo que no es SVG, lo activo y lo enorme no", () => {
    expect(motivoDeSvgInaceptable('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')).toBeUndefined();
    expect(motivoDeSvgInaceptable("Not found")).toBeDefined();
    expect(motivoDeSvgInaceptable("<svg><script>alert(1)</script></svg>")).toBeDefined();
    expect(motivoDeSvgInaceptable('<svg onload="x()"></svg>')).toBeDefined();
    expect(motivoDeSvgInaceptable('<svg><a href="javascript:x"/></svg>')).toBeDefined();
    expect(motivoDeSvgInaceptable(`<svg>${"a".repeat(TOPE_DE_SVG_BYTES)}</svg>`)).toBeDefined();
  });

  it("el destino sale del id, dentro de icons/", () => {
    expect(rutaDeIcono("lucide:home")).toBe("/icons/ic_home.svg");
  });

  it("el nombre sigue la convención ic_ con guiones bajos, y se referencia a secas", () => {
    expect(nombreDeFicheroDeIcono("lucide:arrow-right")).toBe("ic_arrow_right.svg");
    expect(nombreDeFicheroDeIcono("mdi:home")).toBe("ic_home.svg");
    expect(nombreDeFicheroDeIcono("lucide:home")).not.toContain("icons/");
  });
});
