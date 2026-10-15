import { describe, expect, it } from "vitest";
import { respuestaEnChinoSinPedirlo, textoDeReescritura, TOPE_DE_CITA_DEL_USUARIO, textoDeRecordatorioDeIdioma, textoEnInglesSinPedirlo } from "./idiomaDeLaRespuesta.js";

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

describe("lo que el raíz escribe entre herramientas, en inglés", () => {
  const PETICION = "Rediseña el menú principal de la app con la maqueta de Stitch que está en el ticket";

  it("el de Maset: «Round 2 written. Let me validate…» con una petición en español", () => {
    const texto =
      "Round 2 written. Let me validate the files myself and read what changed, then drive the device for a fresh capture. " +
      "The developer made the changes but couldn't validate them, so I will do it now.";
    expect(textoEnInglesSinPedirlo(texto, PETICION)).toBe(true);
  });

  it("en español, no; con nombres de código en inglés dentro, tampoco", () => {
    expect(textoEnInglesSinPedirlo("Ya está escrito el menú. Ahora voy a validar los ficheros y a sacar una captura para comparar con la maqueta.", PETICION)).toBe(false);
    expect(textoEnInglesSinPedirlo("Ya tengo `the_value_of_this` y `let me` en el código; voy a revisar el fichero de estilos de la app.", PETICION)).toBe(false);
  });

  it("si quien pide escribe en inglés, no se toca; y un mensaje corto no se juzga", () => {
    expect(textoEnInglesSinPedirlo("Now let me read the file and then I will validate it with the tool.", "Redesign the main menu with the mockup in the ticket")).toBe(false);
    expect(textoEnInglesSinPedirlo("Let me check.", PETICION)).toBe(false);
  });

  it("el recordatorio cita la petición y deja libre el razonamiento", () => {
    const t = textoDeRecordatorioDeIdioma(PETICION);
    expect(t).toContain("en su idioma");
    expect(t).toContain("«Rediseña el menú");
  });
});

describe("el recordatorio de idioma no se comenta", () => {
  it("pide seguir sin comentar el aviso", async () => {
    const { textoDeRecordatorioDeIdioma } = await import("./idiomaDeLaRespuesta.js");
    expect(textoDeRecordatorioDeIdioma("Hola")).toMatch(/No comentes este aviso/);
  });
});
