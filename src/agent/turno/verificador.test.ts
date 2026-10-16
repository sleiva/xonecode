import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { aInforme, ErrorDelSimulador, type SalidaDelSimulador } from "./verificador.js";
import { esDoble } from "../../core/ports.js";
import { SimuladorVerifier } from "./verificador.js";

const ORO = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "core", "__oro__", "validate-con-hallazgos.json"
);

describe("aInforme", () => {
  const salida = JSON.parse(readFileSync(ORO, "utf8")) as SalidaDelSimulador;
  const informe = aInforme(salida);

  it("`success: false` hace el informe rojo", () => {
    expect(informe.verde).toBe(false);
  });

  it("traduce los tres hallazgos conservando el `code`", () => {
    expect(informe.hallazgos.map((h) => h.code)).toEqual([
      "XML_PARSE",
      "COLL_MISSING_PROGID",
      "INVALID_PROP_TYPE",
    ]);
  });

  it("la línea se queda undefined cuando no viene, sin inventar un 0", () => {
    expect(informe.hallazgos[0]!.linea).toBeUndefined();
    expect(informe.hallazgos[1]!.linea).toBeUndefined();
    expect(informe.hallazgos[2]!.linea).toBe(42);
  });

  it("prefiere el fichero de `location` y cae al de primer nivel", () => {
    expect(informe.hallazgos[0]!.fichero).toBe("/ruta/al/proyecto/app.xml");
    expect(informe.hallazgos[1]!.fichero).toBe("/ruta/al/proyecto/ListaClientes.xne");
  });

  it("un proyecto limpio da verde y sin hallazgos", () => {
    const limpio: SalidaDelSimulador = {
      success: true,
      path: "/x",
      summary: { total: 0, errors: 0, warnings: 0 },
      issues: [],
    };
    expect(aInforme(limpio)).toEqual({ verde: true, hallazgos: [] });
  });
});

describe("SimuladorVerifier", () => {
  it("NO lleva la marca de doble: es el verificador de verdad", () => {
    expect(esDoble(new SimuladorVerifier())).toBe(false);
  });
});
describe("la forma de FALLO del simulador", () => {
  it("una ruta inexistente da el mensaje del simulador, no un TypeError", async () => {
    // Medido: ante `/no/existe` el binario devuelve {"success":false,"error":"..."} SIN
    // `issues` y saliendo con código 0. Antes, `.map` de undefined le llegaba al usuario
    // como «Cannot read properties of undefined (reading 'map')», tapando el mensaje
    // bueno que el simulador ya daba.
    const salida = {
      success: false,
      error: "No existe el directorio del proyecto: /no/existe",
    } as SalidaDelSimulador;
    expect(() => aInforme(salida)).toThrow(ErrorDelSimulador);
    expect(() => aInforme(salida)).toThrow(/No existe el directorio del proyecto/);
  });

  it("sin `issues` y sin `error` tampoco inventa un informe vacío", () => {
    // Un informe vacío se leería como «verde»: el peor desenlace posible para algo
    // que en realidad no se pudo medir.
    expect(() => aInforme({ success: false } as SalidaDelSimulador)).toThrow(ErrorDelSimulador);
  });

  it("un proyecto con CERO hallazgos sí es un informe verde de verdad", () => {
    // La frontera del test anterior: `issues: []` es un resultado, `issues` ausente no.
    const r = aInforme({ success: true, path: "/x", issues: [] } as SalidaDelSimulador);
    expect(r).toEqual({ verde: true, hallazgos: [] });
  });
});

describe("SimuladorVerifier sin el binario (IXCODE-27)", () => {
  it("dice que el programa no está instalado, con su nombre y el `code`, sin el mensaje de Node", async () => {
    const v = new SimuladorVerifier("xone-simulator-que-no-existe-ixcode-27");
    const fallo = await v.verificar("/no/importa").then(
      () => undefined,
      (e: unknown) => e
    );
    expect(fallo).toBeInstanceOf(ErrorDelSimulador);
    expect((fallo as Error).message).toBe("xone-simulator-que-no-existe-ixcode-27 no está instalado en esta máquina (ENOENT)");
  });
});

describe("comoLanzarElSimulador: el xone-linter del PAQUETE, no el del PATH", () => {
  it("usa el cli.js de nuestra dependencia con el Node que corre xonecode", async () => {
    const { comoLanzarElSimulador } = await import("./verificador.js");
    const c = comoLanzarElSimulador();
    expect(c.programa).toBe(process.execPath);
    expect(c.previos[0]).toMatch(/xone-linter[\\/]dist[\\/]cli\.js$/);
  });

  it("sin la dependencia, cae al `xone-simulator` del PATH", async () => {
    const { comoLanzarElSimulador } = await import("./verificador.js");
    const c = comoLanzarElSimulador(() => {
      throw new Error("no está");
    });
    expect(c).toEqual({ programa: "xone-simulator", previos: [], nombre: "xone-simulator" });
  });

  it("y de verdad valida un proyecto con ese camino (sin el del PATH)", async () => {
    // El caso medido en Windows: con el del PATH ausente, el del paquete tiene que bastar.
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const vacio = mkdtempSync(join(tmpdir(), "sim-"));
    const fallo = await new SimuladorVerifier().verificar(join(vacio, "no-existe")).then(
      () => undefined,
      (e: unknown) => e
    );
    rmSync(vacio, { recursive: true, force: true });
    // Ante una ruta que no existe el simulador contesta su forma de fallo: es que ARRANCÓ (no un ENOENT).
    expect(fallo).toBeInstanceOf(ErrorDelSimulador);
    expect((fallo as Error).message).not.toContain("ENOENT");
  });
});
