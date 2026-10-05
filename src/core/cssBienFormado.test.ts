import { describe, expect, it } from "vitest";
import { comprobarCss } from "./cssBienFormado.js";

const HOJA = `/* ====== TEMA ====== */
:root {
    --base: 8;
}
// comentario de línea, que XOne acepta
.tarjeta {
    // y dentro de un bloque
    bgcolor: #FFFFFF;
    /* color de marca */
    forecolor: #1565C0;
    imgbk: http://servidor/fondo.png;
    height: calc(var(--base) * 20);
}
.a, .b { extends: .tarjeta; }

/* Un comentario de varias líneas

   con una línea en blanco dentro (el caso de APPSalud) */
.c { width: 10%; }
@import "otra.css";
`;

const motivo = (css: string): string => {
  const r = comprobarCss(css);
  return r.ok ? "ok" : `${r.linea}:${r.columna} ${r.motivo}`;
};

describe("comprobarCss", () => {
  it("la gramática de la skill: dos tipos de comentario, :root, calc, selectores múltiples, @import, // en un valor", () => {
    expect(comprobarCss(HOJA)).toEqual({ ok: true });
    expect(comprobarCss(`﻿${HOJA}`)).toEqual({ ok: true });
  });

  it("lo que rompe la estructura, con su línea", () => {
    expect(motivo(".a {\n  bgcolor: #FFF;\n")).toBe("1:4 un bloque «{» que no se cierra antes de que acabe el fichero");
    expect(motivo(".a { bgcolor: #FFF; }\n}")).toContain("2:1 un «}» que no cierra ningún bloque");
    expect(motivo("/* sin cerrar\n.a { }")).toContain("1:1 un comentario «/*» que no se cierra");
    expect(motivo(".a {\n  bgcolor #FFF;\n}")).toContain("2:3 «bgcolor #FFF» no es una declaración: le falta el «:»");
    expect(motivo(".a { bgcolor: #FFF }\nsuelto;\n")).toContain("2:1 «suelto» está fuera de cualquier bloque");
    expect(motivo(".a { bgcolor: #FFF }\n.b\n")).toContain("al final del fichero, sin bloque");
    expect(motivo("{ bgcolor: #FFF }")).toContain("un «{» sin selector delante");
  });

  it("una hoja guardada como cadena JSON (el fallo de la descarga) no pasa", () => {
    expect(comprobarCss(JSON.stringify(".a {\n\tbgcolor: #FFF;\n}\n")).ok).toBe(false);
  });
});
