import { describe, expect, it } from "vitest";
import {
  claseDeRecarga,
  codificacionParaElAparato,
  destinoEnElAparato,
  textoDeRecarga,
  xmlParaCargarEnMemoria,
} from "./recargaEnCaliente.js";

const b = (texto: string): Uint8Array => new TextEncoder().encode(texto);

describe("claseDeRecarga", () => {
  it("la regla MEDIDA del script: colección, js, relanzar, y lo que no viaja suelto", () => {
    expect(claseDeRecarga("Inicio.xne", b('<coll name="Inicio">'))).toBe("coleccion");
    expect(claseDeRecarga("sub/Inicio.xne", b("<coll>"))).toBe("coleccion");
    expect(claseDeRecarga("Vacia.xne", b("<coll/>"))).toBe("coleccion");
    expect(claseDeRecarga("mappings.xne", b("<mappings/>"))).toBe("relanzar");
    expect(claseDeRecarga("js/a.js", b(""))).toBe("js");
    expect(claseDeRecarga("estilos.css", b(""))).toBe("css");
    expect(claseDeRecarga("app.ini", b(""))).toBe("relanzar");
    expect(claseDeRecarga("app.xml", b(""))).toBe("relanzar");
    expect(claseDeRecarga("icons/a.svg", b(""))).toBe("no-aplica");
    expect(claseDeRecarga("icons/a.xml", b(""))).toBe("no-aplica");
    expect(claseDeRecarga("bd/a.xml", b(""))).toBe("no-aplica");
    expect(claseDeRecarga("README.md", b(""))).toBe("no-aplica");
    expect(claseDeRecarga("logo.png", b(""))).toBe("no-aplica");
  });

  it("`<collection` o `<coll_x` no son una colección", () => {
    expect(claseDeRecarga("A.xne", b("<collection>"))).toBe("relanzar");
  });
});

describe("codificacionParaElAparato", () => {
  it("UTF-8 si lo es; si no, la tabla que declare el prólogo, o windows-1252", () => {
    expect(codificacionParaElAparato(b("<coll title=\"España\">"))).toBe("UTF-8");
    expect(codificacionParaElAparato(b("ascii"))).toBe("UTF-8");
    const latin = (prologo: string): Uint8Array => new Uint8Array([...b(prologo), 0xf1]);
    expect(codificacionParaElAparato(latin('<?xml version="1.0" encoding="iso-8859-15"?>'))).toBe("ISO-8859-15");
    expect(codificacionParaElAparato(latin('<?xml version="1.0" encoding="iso-8859-1"?>'))).toBe("windows-1252");
    expect(codificacionParaElAparato(latin(""))).toBe("windows-1252");
  });
});

describe("xmlParaCargarEnMemoria", () => {
  const leer = (b: Uint8Array): string => new TextDecoder().decode(b);
  it("un Latin-1 declarado pasa a UTF-8 y su prólogo lo dice", () => {
    const latin = new Uint8Array([...b("<?xml version='1.0' encoding='ISO-8859-15'?>\n<coll title=\"A"), 0xf1, ...b('o"/>')]);
    expect(leer(xmlParaCargarEnMemoria(latin))).toBe("<?xml version='1.0' encoding='UTF-8'?>\n<coll title=\"Año\"/>");
  });
  it("un UTF-8 sin prólogo sale igual, y el BOM se quita", () => {
    expect(leer(xmlParaCargarEnMemoria(b("\uFEFF<coll title=\"Año\"/>")))).toBe('<coll title="Año"/>');
  });
});

describe("destinoEnElAparato", () => {
  it("app_<nombre en minúsculas>/<ruta>", () => {
    expect(destinoEnElAparato("MiApp", "/js/a.js")).toBe("app_miapp/js/a.js");
  });
});

describe("textoDeRecarga", () => {
  it("dice lo que se comprobó, no «cambiado»", () => {
    expect(textoDeRecarga({ estado: "aplicada", clase: "coleccion" })).toContain("viva");
    expect(textoDeRecarga({ estado: "fallo", motivo: "X" })).toContain("(X)");
  });
});
