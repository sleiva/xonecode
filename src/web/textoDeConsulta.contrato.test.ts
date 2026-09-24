import { describe, expect, it } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { textoDePregunta } from "../agent/motores/trueforge/sesionTrueforge.js";

/**
 * La copia declarada del cliente (`apps/web/src/textoDeConsulta.ts`), atada a la función de
 * verdad. Se carga por RUTA y en tiempo de ejecución: el código del host no puede importar el
 * cliente (`web/frontera.test.ts`) y el `rootDir` del host tampoco deja que lo haga un test con
 * un import estático. Un `import()` con la ruta calculada lo transforma vitest y no lo sigue `tsc`.
 */
const aqui = dirname(fileURLToPath(import.meta.url));
const cliente = (await import(pathToFileURL(join(aqui, "../../apps/web/src/textoDeConsulta.ts")).href)) as {
  textoDeConsulta: (pregunta: string, opciones: readonly string[]) => string;
  sinTextoDeConsulta: (texto: string, pregunta: string, opciones: readonly string[]) => string;
};

describe("el texto de una pregunta del agente: la copia del cliente es la del servidor", () => {
  const args = { question: "  ¿Qué color pongo?  ", options: ["Negro (#000000)", "Dejarlo como está"] };

  it("recompone EXACTAMENTE lo que escribe el servidor", () => {
    expect(cliente.textoDeConsulta(args.question, args.options)).toBe(textoDePregunta(args));
  });

  it("y por eso lo quita del mensaje que lo lleva detrás, y solo a ese", () => {
    const mensaje = "El cambio no se aplicó." + textoDePregunta(args);
    expect(cliente.sinTextoDeConsulta(mensaje, args.question, args.options)).toBe("El cambio no se aplicó.");
    // Otro texto, aunque se parezca, se queda como está.
    expect(cliente.sinTextoDeConsulta("¿Qué color pongo?", args.question, args.options)).toBe("¿Qué color pongo?");
  });
});
