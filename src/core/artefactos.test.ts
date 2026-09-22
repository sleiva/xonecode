import { describe, expect, it } from "vitest";
import {
  artefactoFueraDeSitio,
  esBasuraDeArtefacto,
  esRutaDeArtefacto,
  mimeDeArtefacto,
  nombreDeArtefacto,
  RUTA_ARTEFACTOS,
} from "./artefactos.js";

describe("la barrera de `/artefactos/`", () => {
  it("acepta lo que es un artefacto, en la raíz y en subcarpeta", () => {
    expect(esRutaDeArtefacto("/artefactos/flujo.html")).toBe(true);
    expect(esRutaDeArtefacto("/artefactos/2026-09/arquitectura.svg")).toBe(true);
    expect(esRutaDeArtefacto("/artefactos/informe_v2.md")).toBe(true);
  });

  /**
   * Esto no es validación de formato: de esta función depende que una escritura NO pida
   * aprobación humana. Un `..` que colara sería una escritura al proyecto aprobada sola.
   */
  it("rechaza todo lo que podría no ser un artefacto", () => {
    expect(esRutaDeArtefacto("/artefactos/../app.xml")).toBe(false);
    expect(esRutaDeArtefacto("/artefactos/sub/../../app.xml")).toBe(false);
    expect(esRutaDeArtefacto("/artefactos/./x.html")).toBe(false);
    expect(esRutaDeArtefacto("/artefactos//x.html")).toBe(false);
    expect(esRutaDeArtefacto("/artefactos/sub\\..\\app.xml")).toBe(false);
    // El NUL va como ESCAPE y no como byte literal, que es lo que había: un `.ts` con un NUL
    // dentro es «binario» para git, y sus diffs no se pueden revisar. Mismo carácter para el
    // runtime, fichero de texto para las herramientas.
    expect(esRutaDeArtefacto("/artefactos/x\u0000.html")).toBe(false);
    // Sin decodificar: si algún día alguien decodifica antes, que no pase por aquí ya.
    expect(esRutaDeArtefacto("/artefactos/%2e%2e/app.xml")).toBe(false);
    // Ni la carpeta a secas, ni un vecino con el mismo prefijo.
    expect(esRutaDeArtefacto("/artefactos")).toBe(false);
    expect(esRutaDeArtefacto("/artefactos/")).toBe(false);
    expect(esRutaDeArtefacto("/artefactos-de-mentira/x.html")).toBe(false);
    // Y lo normal: un fichero del proyecto no es un artefacto.
    expect(esRutaDeArtefacto("/app.xml")).toBe(false);
    expect(esRutaDeArtefacto(undefined)).toBe(false);
  });

  it("el prefijo lleva barra final, que es lo que `CompositeBackend` exige", () => {
    expect(RUTA_ARTEFACTOS).toBe("/artefactos/");
  });
});

describe("cómo se enseña un artefacto", () => {
  it("el nombre es el último segmento", () => {
    expect(nombreDeArtefacto("/artefactos/flujo.html")).toBe("flujo.html");
    expect(nombreDeArtefacto("/artefactos/2026-09/arq.svg")).toBe("arq.svg");
  });

  it("el mime sale de la EXTENSIÓN, y lo que no está en la tabla no se afirma", () => {
    expect(mimeDeArtefacto("flujo.html")).toBe("text/html");
    expect(mimeDeArtefacto("ARQ.SVG")).toBe("image/svg+xml");
    expect(mimeDeArtefacto("captura.png")).toBe("image/png");
    // «No lo sé» no es «es binario»: quien lo pinte decide, y no sobre una suposición.
    expect(mimeDeArtefacto("cosa.xyz")).toBeUndefined();
    expect(mimeDeArtefacto("sinpunto")).toBeUndefined();
    expect(mimeDeArtefacto(".oculto")).toBeUndefined();
  });
});

describe("artefactoFueraDeSitio", () => {
  it("reconoce la carpeta que el modelo se inventa, y dice dónde iba", () => {
    // Medido el 2026-09-07 en AppDemo: dos delegaciones consecutivas al `mockup`, y la
    // primera escribió `/artifacts/login_flow.html` — la RAÍZ del proyecto, con aprobación
    // humana de por medio— aunque su `.md`, la skill, `archify` y la descripción de
    // `write_file` dicen las cuatro `/artefactos/`. No falta ninguna instrucción: es deriva
    // del modelo, y contra eso el prompt ya se agotó.
    expect(artefactoFueraDeSitio("/artifacts/login_flow.html")).toBe("/artefactos/login_flow.html");
    expect(artefactoFueraDeSitio("artifacts/login_flow.html")).toBe("/artefactos/login_flow.html");
    // El singular, que es el que nombra el contrato de `publish_artifact`.
    expect(artefactoFueraDeSitio("/artifact/panel.html")).toBe("/artefactos/panel.html");
    expect(artefactoFueraDeSitio("/artifact.html")).toBe("/artefactos/artifact.html");
  });

  it("no distingue mayúsculas, que es la lección de APFS", () => {
    expect(artefactoFueraDeSitio("/Artifacts/x.html")).toBe("/artefactos/x.html");
    expect(artefactoFueraDeSitio("/ARTIFACTS/x.html")).toBe("/artefactos/x.html");
  });

  it("de una subcarpeta propone el último segmento: la carpeta de la sesión es plana", () => {
    expect(artefactoFueraDeSitio("/artifacts/sub/x.html")).toBe("/artefactos/x.html");
  });

  it("no se mete donde no la llaman", () => {
    // La ruta BUENA, obviamente.
    expect(artefactoFueraDeSitio("/artefactos/x.html")).toBeUndefined();
    // Nada de esto es la carpeta de la raíz: el PRIMER segmento es lo que se mira, para no
    // denegar un fichero del proyecto que solo se llame parecido.
    expect(artefactoFueraDeSitio("/app.xml")).toBeUndefined();
    expect(artefactoFueraDeSitio("/src/artifacts.js")).toBeUndefined();
    expect(artefactoFueraDeSitio("/scripts/artifacts/util.js")).toBeUndefined();
    expect(artefactoFueraDeSitio("/artifactsviejos/x.html")).toBeUndefined();
    expect(artefactoFueraDeSitio("/artifacts")).toBeUndefined();
    expect(artefactoFueraDeSitio("")).toBeUndefined();
  });
});

describe("lo que un zip arrastra y no es un artefacto", () => {
  it("la basura del SO no se anuncia, esté en la raíz o dentro", () => {
    expect(esBasuraDeArtefacto(".DS_Store")).toBe(true);
    expect(esBasuraDeArtefacto("stitch/.DS_Store")).toBe(true);
    expect(esBasuraDeArtefacto("Thumbs.db")).toBe(true);
    expect(esBasuraDeArtefacto("desktop.ini")).toBe(true);
  });

  it("el envoltorio de un zip de Finder tampoco, ni sus sombras `._`", () => {
    // Un `.zip` hecho desde el Finder trae `__MACOSX/<carpeta>/._<fichero>`: ficheros de
    // doscientos bytes con la MISMA extensión que el bueno, así que sin esto salían tres
    // tarjetas con `mime: image/png` y una imagen rota dentro.
    expect(esBasuraDeArtefacto("__MACOSX/stitch/._screen.png")).toBe(true);
    expect(esBasuraDeArtefacto("__MACOSX")).toBe(true);
    expect(esBasuraDeArtefacto("stitch/._code.html")).toBe(true);
  });

  it("y un artefacto de verdad pasa, aunque se llame parecido", () => {
    expect(esBasuraDeArtefacto("screen.png")).toBe(false);
    expect(esBasuraDeArtefacto("stitch/stitch_screen_complex/DESIGN.md")).toBe(false);
    // Empieza por punto, pero no es una sombra `._`.
    expect(esBasuraDeArtefacto(".perfil.json")).toBe(false);
    // Contiene el nombre, no lo es.
    expect(esBasuraDeArtefacto("notas-sobre-__MACOSX.md")).toBe(false);
  });
});
