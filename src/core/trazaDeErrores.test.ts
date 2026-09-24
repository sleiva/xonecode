import { afterEach, describe, expect, it } from "vitest";
import {
  anotable,
  anotarError,
  anotarPaso,
  mensajeSeguro,
  ponerSumideroDeErrores,
  type ErrorAnotado,
  type PasoAnotado,
} from "./trazaDeErrores.js";

function grabando() {
  const visto: Array<ErrorAnotado | PasoAnotado> = [];
  ponerSumideroDeErrores((a) => visto.push(a));
  return visto;
}
afterEach(() => ponerSumideroDeErrores(undefined));

describe("apagado no hace nada", () => {
  it("anotar sin sumidero no lanza ni cuesta", () => {
    expect(() => anotarError("x#y", new Error("nada"))).not.toThrow();
    expect(() => anotarPaso("x#y")()).not.toThrow();
  });
});

describe("mensajeSeguro", () => {
  /**
   * **Un error de Node lleva la ruta absoluta dentro del mensaje**, y esto acaba en un
   * `.jsonl` que una persona puede mirar por un túnel. Misma regla que `codigoDe`.
   */
  it("quita las rutas de la máquina y deja el resto", () => {
    const m = mensajeSeguro("ENOENT: no such file or directory, open '/Users/alguien/secreto.txt'");
    expect(m).not.toContain("/Users/");
    expect(m).not.toContain("alguien");
    // Y lo que queda sigue diciendo QUÉ pasó.
    expect(m).toContain("ENOENT");
  });

  it("también sin comillas", () => {
    expect(mensajeSeguro("falló en /private/var/folders/x/y")).not.toContain("/private/");
    expect(mensajeSeguro("falló en /home/ana/z")).not.toContain("/home/");
  });

  /** XOneCode corre también en Windows, y ahí la ruta de la máquina tiene otra forma. */
  it("también las rutas de WINDOWS: con unidad, con barras de los dos tipos, entre comillas y UNC", () => {
    const casos = [
      "spawn C:\\Users\\sergio\\.local\\bin\\codex.exe ENOENT",
      "no se pudo abrir 'D:\\Proyectos\\app\\secreto.txt'",
      "falló en C:/Users/sergio/AppData/Roaming/x.json",
      "red: \\\\servidor\\compartido\\sergio\\clave.txt",
    ];
    for (const c of casos) {
      const m = mensajeSeguro(c);
      expect(m, c).not.toContain("sergio");
      expect(m, c).not.toContain("Proyectos");
      expect(m, c).toContain("<ruta>");
    }
    // Lo que queda sigue diciendo qué pasó.
    expect(mensajeSeguro(casos[0]!)).toBe("spawn <ruta> ENOENT");
    // Y lo que NO es una ruta, se queda: una URL lleva «s://» y no es una unidad.
    expect(mensajeSeguro("fetch https://api.deepseek.com/v1 falló")).toBe("fetch https://api.deepseek.com/v1 falló");
  });

  /** Una ruta VIRTUAL no es de la máquina y no estorba: es lo que identifica el sitio. */
  it("no toca las rutas virtuales del agente", () => {
    expect(mensajeSeguro("no pude abrir /EspecialCalculadora.xne")).toContain("/EspecialCalculadora.xne");
    expect(mensajeSeguro("en /artefactos/captura.png")).toContain("/artefactos/captura.png");
  });
});

describe("anotable", () => {
  it("se queda con el nombre y el code de Node", () => {
    const a = anotable("mod#fn", Object.assign(new Error("roto"), { code: "ENOENT" }));
    expect(a).toMatchObject({ donde: "mod#fn", nombre: "Error", codigo: "ENOENT" });
  });

  it("aguanta lo que no es un Error", () => {
    expect(anotable("mod#fn", "una cadena").nombre).toBe("desconocido");
    expect(anotable("mod#fn", undefined).mensaje).toContain("undefined");
  });

  /** Nunca el `stack`: lleva rutas del árbol de ficheros de quien compiló. */
  it("no guarda el stack", () => {
    expect(Object.keys(anotable("m#f", new Error("x")))).not.toContain("stack");
  });
});

describe("anotarPaso", () => {
  /**
   * **La firma de un cuelgue es un `inicio` sin su `fin`**, y eso es lo que encuentra un
   * proceso parado: medido sobre uno real, estaba OCIOSO y sin excepciones que anotar, así
   * que lo único que lo habría situado es qué empezó y no terminó.
   */
  it("deja inicio y fin, y el fin lleva cuánto duró", () => {
    const visto = grabando();
    anotarPaso("mod#fn", "un detalle")();

    expect(visto).toHaveLength(2);
    expect(visto[0]).toMatchObject({ donde: "mod#fn", fase: "inicio", detalle: "un detalle" });
    expect(visto[1]).toMatchObject({ donde: "mod#fn", fase: "fin", detalle: "un detalle" });
    expect((visto[1] as PasoAnotado).ms).toBeGreaterThanOrEqual(0);
  });

  it("un paso sin cerrar deja solo su inicio: eso es el cuelgue", () => {
    const visto = grabando();
    anotarPaso("consolaWeb#aprobacionesTui", "3 pendiente(s)");
    expect(visto).toHaveLength(1);
    expect((visto[0] as PasoAnotado).fase).toBe("inicio");
  });

  /** Cerrar dos veces no duplica: el `finally` de quien llama puede correr tras un `return`. */
  it("cerrar dos veces anota una", () => {
    const visto = grabando();
    const fin = anotarPaso("mod#fn");
    fin();
    fin();
    expect(visto.filter((v) => (v as PasoAnotado).fase === "fin")).toHaveLength(1);
  });
});

describe("el testigo no tumba a quien observa", () => {
  it("un sumidero que lanza no se propaga", () => {
    ponerSumideroDeErrores(() => {
      throw new Error("el sumidero está roto");
    });
    expect(() => anotarError("m#f", new Error("x"))).not.toThrow();
    expect(() => anotarPaso("m#f")()).not.toThrow();
  });
});
