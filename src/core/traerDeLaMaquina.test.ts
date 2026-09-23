import { describe, expect, it } from "vitest";
import { motivoDeTraidaInaceptable, nombreParaTraer, TOPE_DE_TRAIDA } from "./traerDeLaMaquina.js";

describe("motivoDeTraidaInaceptable", () => {
  it("una ruta absoluta normal se acepta", () => {
    expect(motivoDeTraidaInaceptable("/Users/a/Downloads/diseno.zip")).toBeUndefined();
    expect(motivoDeTraidaInaceptable("/tmp/captura.png")).toBeUndefined();
  });

  /** Una relativa no se resuelve contra nada fiable: el `cwd` no es el proyecto. */
  it("una relativa no", () => {
    expect(motivoDeTraidaInaceptable("Downloads/x.zip")).toMatch(/absoluta/i);
    expect(motivoDeTraidaInaceptable("./x.zip")).toMatch(/absoluta/i);
  });

  it("con `..` tampoco: el destino lo elegiría quien escribe la ruta", () => {
    expect(motivoDeTraidaInaceptable("/Users/a/../../etc/passwd")).toMatch(/\.\./);
  });

  /**
   * Las dos del harness. No discuten el «cualquier fichero mío» de quien lo pidió: lo que
   * queda fuera no son ficheros suyos. `auth.json` guarda las claves en claro y cualquier
   * `.xonecode/` lleva la conversación entera — traerlos los metería en el contexto y en el
   * `.jsonl`.
   */
  it("ni las credenciales ni la memoria del harness", () => {
    expect(motivoDeTraidaInaceptable("/Users/a/.xonecode/auth.json")).toBeDefined();
    expect(motivoDeTraidaInaceptable("/Users/a/ws/P/.xonecode/checkpoint.sqlite")).toBeDefined();
    expect(motivoDeTraidaInaceptable("/otro/sitio/auth.json")).toBeDefined();
  });

  /** Se mira por SEGMENTO: un fichero que solo lleve el nombre dentro no es del harness. */
  it("no rechaza por parecerse el nombre", () => {
    expect(motivoDeTraidaInaceptable("/Users/a/notas-sobre-.xonecode.md")).toBeUndefined();
    expect(motivoDeTraidaInaceptable("/Users/a/auth.json.bak")).toBeUndefined();
  });
});

describe("nombreParaTraer", () => {
  /**
   * **Es lo que impide que el destino salga de la carpeta.** El destino no se recibe: se
   * deriva, y quedándose con el último segmento no hay forma de escribir fuera.
   */
  it("se queda con el último segmento y nada más", () => {
    expect(nombreParaTraer("/Users/a/Downloads/diseno.zip")).toBe("diseno.zip");
    expect(nombreParaTraer("/a/b/c/../x.png")).toBe("x.png");
    expect(nombreParaTraer("/x.png")).toBe("x.png");
  });
});

describe("TOPE_DE_TRAIDA", () => {
  /** El área de trabajo no es un almacén, y un `.mov` se copia tan callado como un `.png`. */
  it("deja pasar una maqueta y corta lo que ya no es eso", () => {
    expect(TOPE_DE_TRAIDA).toBeGreaterThan(10 * 1024 * 1024);
    expect(TOPE_DE_TRAIDA).toBeLessThan(200 * 1024 * 1024);
  });
});
