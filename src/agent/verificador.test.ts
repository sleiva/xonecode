import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { aInforme, ErrorDelSimulador, type SalidaDelSimulador } from "./verificador.js";
import { esDoble } from "../core/ports.js";
import { SimuladorVerifier } from "./verificador.js";

const ORO = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "core", "__oro__", "validate-con-hallazgos.json"
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
