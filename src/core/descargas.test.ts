import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  RUTAS_DE_DESCARGA,
  RUTA_HISTORIAL_DE_MENSAJES,
  RUTA_RESULTADOS_GRANDES,
  carpetaDeDescargas,
  descargaFueraDeSitio,
  porQueNoEsDelProyecto,
} from "./descargas.js";

describe("las rutas", () => {
  /**
   * Los nombres son los que deepagents lleva A FUEGO (comprobado en 1.13.2: no hay opción
   * para cambiarlos), así que cambiarlos aquí no cambiaría dónde escribe ella — dejaría el
   * montaje sin usar y las descargas volverían al proyecto en silencio. Este test es lo que
   * hace que ese cambio se note.
   */
  it("son las dos que la librería escribe, con su nombre exacto", () => {
    expect(RUTA_RESULTADOS_GRANDES).toBe("/large_tool_results/");
    expect(RUTA_HISTORIAL_DE_MENSAJES).toBe("/conversation_history/");
    expect(RUTAS_DE_DESCARGA).toEqual([RUTA_RESULTADOS_GRANDES, RUTA_HISTORIAL_DE_MENSAJES]);
  });

  /** La barra final no es estética: `CompositeBackend` la retira antes de delegar, y sin
   *  ella reconstruye `//fichero` fuera de la raíz montada. */
  it("todas llevan barra al principio y al final", () => {
    for (const ruta of RUTAS_DE_DESCARGA) {
      expect(ruta.startsWith("/")).toBe(true);
      expect(ruta.endsWith("/")).toBe(true);
    }
  });
});

describe("carpetaDeDescargas", () => {
  /**
   * Al LADO de la carpeta de artefactos, que es lo que hace que herede su única decisión
   * —¿hay sesión con identidad?— y que `borrarSesion` se las lleve gratis: ya borra la
   * carpeta `<id>` entera.
   */
  it("cuelga de la carpeta de la sesión, junto a los artefactos", () => {
    const artefactos = join("/w/AppDemo", ".xonecode", "sesiones", "s1", "artefactos");
    expect(carpetaDeDescargas(artefactos, RUTA_RESULTADOS_GRANDES)).toBe(
      join("/w/AppDemo", ".xonecode", "sesiones", "s1", "large_tool_results")
    );
    expect(carpetaDeDescargas(artefactos, RUTA_HISTORIAL_DE_MENSAJES)).toBe(
      join("/w/AppDemo", ".xonecode", "sesiones", "s1", "conversation_history")
    );
  });

  /**
   * Y con el respaldo del terminal —donde no hay sesión que reabrir— cae dentro de
   * `.xonecode/`, que es lo que importa: fuera del árbol del proyecto y de git.
   */
  it("con el respaldo del terminal cae en `.xonecode/`, no en la raíz", () => {
    const artefactos = join("/w/AppDemo", ".xonecode", "artefactos");
    expect(carpetaDeDescargas(artefactos, RUTA_RESULTADOS_GRANDES)).toBe(
      join("/w/AppDemo", ".xonecode", "large_tool_results")
    );
  });
});

describe("descargaFueraDeSitio", () => {
  it("reconoce las dos carpetas en la raíz del proyecto y dice dónde iban", () => {
    expect(descargaFueraDeSitio("/large_tool_results/call_1.txt")).toBe("/large_tool_results/");
    expect(descargaFueraDeSitio("/conversation_history/abc")).toBe("/conversation_history/");
  });

  /** Sin distinguir mayúsculas, que es la lección de APFS: `/Large_Tool_Results/` abre el
   *  mismo sitio. */
  it("no distingue mayúsculas", () => {
    expect(descargaFueraDeSitio("/Large_Tool_Results/call_1.txt")).toBe("/large_tool_results/");
  });

  /**
   * Se mira el PRIMER segmento y nada más, igual que `artefactoFueraDeSitio`: eso acota el
   * falso positivo a propósito, y un fichero del proyecto que solo se PAREZCA pasa sin
   * enterarse.
   */
  it("un fichero del proyecto con un nombre parecido pasa sin enterarse", () => {
    expect(descargaFueraDeSitio("/src/large_tool_results.js")).toBeUndefined();
    expect(descargaFueraDeSitio("/scripts/large_tool_results/util.js")).toBeUndefined();
    expect(descargaFueraDeSitio("/Clientes.xne")).toBeUndefined();
  });

  /** La carpeta a secas no es una escritura: hace falta algo dentro. */
  it("la carpeta sin fichero dentro no cuenta", () => {
    expect(descargaFueraDeSitio("/large_tool_results")).toBeUndefined();
    expect(descargaFueraDeSitio("/large_tool_results/")).toBeUndefined();
  });

  /** La barra invertida cuenta como separador: es la de Windows, y sin ella
   *  `\\large_tool_results\\x` se colaría como un nombre de fichero rarísimo. */
  it("la barra invertida también separa", () => {
    expect(descargaFueraDeSitio("\\large_tool_results\\call_1.txt")).toBe("/large_tool_results/");
  });
});

describe("porQueNoEsDelProyecto", () => {
  /**
   * Dice QUÉ es y por qué no va ahí, como `porQueNoAhi`. Aquí el lector de verdad casi
   * nunca es el modelo —la escritura la hace la librería—, así que nombra además la causa
   * probable: un montaje que falta.
   */
  it("nombra la ruta, el destino y la consecuencia", () => {
    const m = porQueNoEsDelProyecto("/large_tool_results/x.txt", "/large_tool_results/");
    expect(m).toContain("/large_tool_results/x.txt");
    expect(m).toContain("app XOne");
    expect(m).toContain("CloudStudio");
    expect(m).toContain("montada");
  });
});
