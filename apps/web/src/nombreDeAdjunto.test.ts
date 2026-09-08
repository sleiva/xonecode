import { describe, it, expect } from "vitest";
import { nombreDeAdjuntoSeguro } from "./nombreDeAdjunto.js";

describe("nombreDeAdjuntoSeguro", () => {
  it("un nombre que ya vale no se toca", () => {
    expect(nombreDeAdjuntoSeguro("mockup.png")).toBe("mockup.png");
    expect(nombreDeAdjuntoSeguro("informe_v2-final.md")).toBe("informe_v2-final.md");
  });

  it("la captura del sistema, que es el caso NORMAL, se convierte en algo aceptable", () => {
    // Medido en el propio sistema: una captura de macOS se llama «Screenshot 2026-09-08 at
    // 17.03.12.png». El servidor exige un segmento LLANO —de él se compone una ruta de
    // disco—, así que sin esta conversión el caso más común de todos daría 403.
    expect(nombreDeAdjuntoSeguro("Screenshot 2026-09-08 at 17.03.12.png")).toBe(
      "Screenshot_2026-09-08_at_17.03.12.png"
    );
  });

  it("se queda con el ÚLTIMO segmento: un nombre con barras no puede subir por carpetas", () => {
    // Un `<input type=file>` con carpetas (`webkitdirectory`) da rutas relativas.
    expect(nombreDeAdjuntoSeguro("sub/dir/mockup.png")).toBe("mockup.png");
    expect(nombreDeAdjuntoSeguro("..\\..\\fuera.png")).toBe("fuera.png");
  });

  it("los acentos y lo que no es ASCII llano se sustituyen, no se dejan pasar", () => {
    expect(nombreDeAdjuntoSeguro("diseño ñu.png")).toBe("dise_o__u.png");
  });

  it("lo que se queda en nada devuelve `undefined`: no se inventa un nombre", () => {
    // Un nombre inventado («adjunto.bin») escondería que el fichero que la persona eligió
    // no se puede nombrar aquí. Se dice, y ella elige otro.
    expect(nombreDeAdjuntoSeguro("")).toBeUndefined();
    expect(nombreDeAdjuntoSeguro("/")).toBeUndefined();
    expect(nombreDeAdjuntoSeguro("..")).toBeUndefined();
  });

  it("`...` sí es un nombre: raro, pero un segmento llano que el servidor acepta", () => {
    expect(nombreDeAdjuntoSeguro("...")).toBe("...");
  });

  it("y se acota CONSERVANDO la extensión, que es de donde sale el mime", () => {
    const largo = nombreDeAdjuntoSeguro(`${"a".repeat(400)}.png`)!;
    expect(largo.length).toBeLessThanOrEqual(120);
    expect(largo.endsWith(".png")).toBe(true);
  });
});
