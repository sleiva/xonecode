import { describe, expect, it } from "vitest";
import { hechosDelProyectoDe } from "./hechosEnDisco.js";
import type { IndiceDeNavegacion } from "../../core/navegacion.js";

const indiceDePega = (): IndiceDeNavegacion =>
  ({
    inventario: () => [
      { nombre: "EntradaApp", clase: "coleccion", fichero: "/EntradaApp.xne" },
      { nombre: "Clientes", clase: "coleccion", fichero: "/Clientes.xne" },
    ],
    app: () => ({ entrada: ["EntradaApp"], login: ["Login"], estilos: ["default.css"], conexiones: [] }),
  }) as unknown as IndiceDeNavegacion;

describe("hechosDelProyectoDe", () => {
  it("traduce el índice a los cuatro hechos", async () => {
    const h = await hechosDelProyectoDe(async () => indiceDePega(), new Set(["/EntradaApp.xne"]));
    expect(h).toEqual({
      entrada: ["EntradaApp"],
      login: ["Login"],
      estilos: ["default.css"],
      colecciones: ["EntradaApp", "Clientes"],
    });
  });

  it("un índice que REVIENTA devuelve `undefined`, no tumba el turno", async () => {
    // Adelantar hechos abarata enterarse; no es una capacidad. Una carpeta que no es un
    // proyecto XOne, un `.xne` ilegible o un fallo de la librería del linter tienen que dejar
    // el turno exactamente como estaba antes de que esto existiera. El mismo trato que el
    // verificador le da a que falte el binario.
    const h = await hechosDelProyectoDe(async () => {
      throw new Error("no es un proyecto XOne");
    }, new Set());
    expect(h).toBeUndefined();
  });

  it("le pasa al índice los ficheros que recibe, no otra cosa", async () => {
    // El índice FILTRA en la fuente lo que el agente no puede abrir: si aquí se le pasara
    // otro conjunto, la foto nombraría colecciones que el agente no puede leer.
    let visto: ReadonlySet<string> | undefined;
    const ficheros = new Set(["/a.xne"]);
    await hechosDelProyectoDe(async (f) => {
      visto = f;
      return indiceDePega();
    }, ficheros);
    expect(visto).toBe(ficheros);
  });
});
