import { describe, expect, it } from "vitest";
import { respuestaEnChinoSinPedirlo, textoDeReescritura, TOPE_DE_CITA_DEL_USUARIO } from "./idiomaDeLaRespuesta.js";

const CHINO =
  "已封闭。主菜单已重新制作，入口保持不变。重新制作了 `EntryPoint.xne` 的界面（入口集合），未改动它下面的任何内容：卡片仍然使用原来的方法和名称。";

describe("una respuesta que se fue al chino", () => {
  it("la del caso medido (chino con nombres de fichero en medio) a una petición en español: sí", () => {
    expect(respuestaEnChinoSinPedirlo(CHINO, "Rediseña el menú principal de la app")).toBe(true);
  });

  it("en español con un nombre suelto en chino: no", () => {
    expect(respuestaEnChinoSinPedirlo("He cambiado el título a 主菜单 como pediste, y el resto queda igual.", "pon el título")).toBe(false);
  });

  it("si quien pide escribe en chino (o con ideogramas), no se corrige", () => {
    expect(respuestaEnChinoSinPedirlo(CHINO, "请重新设计主菜单")).toBe(false);
  });

  it("vacía o sin letras: no", () => {
    expect(respuestaEnChinoSinPedirlo("", "hola")).toBe(false);
    expect(respuestaEnChinoSinPedirlo("123 — 456", "hola")).toBe(false);
  });

  it("la orden de reescribir cita el principio del mensaje, recortado", () => {
    const largo = "a".repeat(TOPE_DE_CITA_DEL_USUARIO + 50);
    const texto = textoDeReescritura(`  ${largo}  `);
    expect(texto).toContain(`«${"a".repeat(TOPE_DE_CITA_DEL_USUARIO)}»`);
    expect(texto).toMatch(/sin llamar a ninguna herramienta/);
  });
});
