import { describe, expect, it } from "vitest";
import {
  bajoDisco,
  esRutaDeMaquina,
  motivoDeDiscoDenegado,
  porQueNoSuelta,
  RUTA_DISCO,
} from "./discoDeLaMaquina.js";

describe("esRutaDeMaquina", () => {
  it("reconoce lo que una persona pega", () => {
    for (const r of [
      "/Users/alguien/Downloads/diseno.zip",
      "/home/alguien/x.png",
      "/tmp/algo",
      "/Volumes/USB/foto.jpg",
      "/private/var/folders/x",
    ]) {
      expect(esRutaDeMaquina(r), r).toBe(true);
    }
  });

  /**
   * **La lista es CERRADA a propósito.** Una heurística tipo «empieza por `/` y tiene varios
   * segmentos» confundiría un fichero del proyecto con un directorio del sistema, y entonces
   * editar la calculadora contestaría que es una ruta de la máquina.
   */
  it("no confunde una ruta del proyecto ni una raíz virtual", () => {
    for (const r of [
      "/EspecialCalculadora.xne",
      "/app.xml",
      "/artefactos/captura.png",
      "/skills/xone-hotswap/SKILL.md",
      "/adjuntos/informe.pdf",
      "/MEMORIA_PROYECTO.md",
    ]) {
      expect(esRutaDeMaquina(r), r).toBe(false);
    }
  });
});

describe("bajoDisco", () => {
  it("traduce a la raíz virtual sin duplicar la barra", () => {
    expect(bajoDisco("/Users/a/x.zip")).toBe("/disco/Users/a/x.zip");
    expect(bajoDisco("/Users/a/x.zip")).not.toContain("//");
  });
});

describe("porQueNoSuelta", () => {
  /**
   * **El mensaje trae la ruta buena YA ESCRITA.** Medido en una sesión real: el ENOENT de
   * antes decía «no such file or directory» sobre un fichero que SÍ existe, así que el
   * orquestador concluyó que estaba enjaulado y se fue a delegar en el agente con shell —
   * 18 pasos y un `unzip` para leer lo que la persona acababa de nombrar.
   */
  it("dice la ruta que sí funciona", () => {
    const m = porQueNoSuelta("/Users/a/Downloads/d.zip");
    expect(m).toContain("/disco/Users/a/Downloads/d.zip");
    expect(m).toMatch(/solo lectura/i);
  });

  /** El ENOENT de Node filtraba la raíz absoluta del proyecto; esto no lleva ninguna. */
  it("no lleva la raíz del proyecto", () => {
    expect(porQueNoSuelta("/Users/a/x.zip")).not.toMatch(/workspace|\.xonecode/);
  });
});

describe("motivoDeDiscoDenegado", () => {
  /**
   * Las DOS excepciones son del harness, no de la persona: `auth.json` lleva las claves de API
   * en claro —leerlo las mete en el contexto y en el `.jsonl`, que es lo que el invariante de
   * `shellDeAgente` existe para impedir— y `.xonecode/` es lo que `permisosDe` ya deniega
   * dentro del proyecto.
   */
  it("deniega cualquier .xonecode, venga por donde venga", () => {
    expect(motivoDeDiscoDenegado("/disco/Users/a/.xonecode/auth.json")).toBeDefined();
    expect(motivoDeDiscoDenegado("/disco/Users/a/ws/Proy/.xonecode/checkpoint.sqlite")).toBeDefined();
  });

  it("deniega el auth.json esté donde esté", () => {
    expect(motivoDeDiscoDenegado("/disco/otro/sitio/auth.json")).toBeDefined();
  });

  /** Se mira por SEGMENTO: un fichero que solo lleve el nombre dentro no es del harness. */
  it("no deniega por parecerse el nombre", () => {
    expect(motivoDeDiscoDenegado("/disco/Users/a/notas-sobre-.xonecode.md")).toBeUndefined();
    expect(motivoDeDiscoDenegado("/disco/Users/a/auth.json.bak")).toBeUndefined();
  });

  /** Y no dice nada de lo que no cuelga de `/disco/`: ahí manda `permisosDe`. */
  it("no opina fuera de su raíz", () => {
    expect(motivoDeDiscoDenegado("/.xonecode/memoria.md")).toBeUndefined();
    expect(motivoDeDiscoDenegado("/app.xml")).toBeUndefined();
  });

  it("la raíz virtual es la que todos usan", () => {
    expect(RUTA_DISCO).toBe("/disco/");
    expect(RUTA_DISCO.endsWith("/")).toBe(true);
  });
});
