import { describe, it, expect } from "vitest";
import { crearConsolaTui } from "./correrTui.js";

describe("la consola TUI", () => {
  it("implementa Consola: lineas es la cola de lo enviado, escribir y piel comparten store", async () => {
    const { consola, enviar, actos } = crearConsolaTui({ raiz: "/tmp/proyecto" });
    const leidas: string[] = [];
    const lector = (async () => {
      for await (const linea of consola.lineas) {
        leidas.push(linea);
        break;
      }
    })();
    enviar("hola equipo");
    await lector;
    expect(leidas).toEqual(["hola equipo"]);
    expect(consola.interactivo).toBe(true);

    // La piel y el `escribir` caen en el MISMO store: un turno y un comando se ven
    // en el mismo transcript.
    consola.escribir("·  hola");
    const piel = consola.piel!();
    piel.fase!("planificando");
    piel.linea("→ lee app.xne");
    const vistos = actos();
    // `escribir` es sistema y `piel.linea` es tool — tipos distintos, el MISMO store.
    expect(vistos.some((a) => a.tipo === "sistema" && a.texto.includes("hola"))).toBe(true);
    expect(vistos.some((a) => a.tipo === "tool" && a.texto.includes("app.xne"))).toBe(true);
    expect(vistos.some((a) => a.tipo === "fase")).toBe(true);

    // aprobar por defecto: fail-closed sin modal montado.
    await expect(consola.aprobacionesTui!([], new Map(), new Map())).resolves.toEqual(new Map());
  });

  it("preguntar y leerSecreto se responden por la misma ranura y devuelven la respuesta", async () => {
    const { consola, responder } = crearConsolaTui({ raiz: "/tmp/proyecto" });

    // preguntar deja la pregunta viva en la vista: la app la pinta en cuanto ocurre.
    const respuesta = consola.preguntar("¿nombre? ");
    expect(respuesta).toBeDefined(); // la promesa queda pendiente hasta responder
    responder("MiApp");
    await expect(respuesta).resolves.toBe("MiApp");

    const secreto = consola.leerSecreto("clave: ");
    responder("s3cr3t");
    await expect(secreto).resolves.toBe("s3cr3t");
  });

  it("Ctrl-C en un turno: la piel siguiente lanza (el motor aborta) y el turno nuevo no hereda", () => {
    const { consola, cancelar } = crearConsolaTui({ raiz: "/tmp/proyecto" });
    const piel = consola.piel!();

    piel.token("hola"); // sin cancelación: fluye
    cancelar();
    expect(() => piel.token("más")).toThrow(/cancelado/);
    // La cancelación es de TURNO, no de sesión: el punto de cancelación se consume.
    expect(() => piel.token("otro turno")).not.toThrow();
  });

  it("el historial deja la más reciente en el índice 0 (contrato de Entrada)", () => {
    const { enviar, historial } = crearConsolaTui({ raiz: "/tmp/proyecto" });
    enviar("primera");
    enviar("segunda");
    expect(historial[0]).toBe("segunda");
    expect(historial[1]).toBe("primera");
  });
});
