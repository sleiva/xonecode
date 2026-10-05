import { describe, expect, it } from "vitest";
import { diferenciaDeTexto } from "./verificacionDeSubida.js";

/**
 * Las dos transformaciones MEDIDAS contra el servidor real (y solo esas) no son un corte: el
 * salto de línea final que Studio quita y el CRLF que pasa a LF. Todo lo demás sigue siendo
 * «llegó distinto».
 */
describe("diferenciaDeTexto", () => {
  it("CRLF en local y LF en Studio es el mismo fichero", () => {
    expect(diferenciaDeTexto("a\r\nb\r\n", "a\nb")).toBeUndefined();
  });

  it("con salto final en local y sin él en Studio es el mismo fichero", () => {
    expect(diferenciaDeTexto("var x = 'añadir';\n", "var x = 'añadir';")).toBeUndefined();
  });

  it("el BOM se conserva: quitarlo SÍ es una diferencia", () => {
    expect(diferenciaDeTexto("﻿<app/>", "<app/>")).toBeDefined();
  });

  it("si falta la última línea, sigue siendo DISTINTO", () => {
    const d = diferenciaDeTexto("uno\ndos\ntres\n", "uno\ndos\n");
    expect(d?.motivo).toBe("llegó distinto a Studio: 13 B en local, 8 B en Studio (difieren desde el carácter 8)");
  });

  it("un cambio en medio sigue siendo DISTINTO", () => {
    expect(diferenciaDeTexto("uno\ndos\ntres\n", "uno\nDOS\ntres")).toBeDefined();
  });
});
