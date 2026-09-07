import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { IconoDeEntorno } from "./IconoDeEntorno.js";

afterEach(cleanup);

const svgDe = (entorno: string) =>
  render(<IconoDeEntorno entorno={entorno} />).container.querySelector("svg")!;

describe("IconoDeEntorno", () => {
  it("un oficial lleva su marca; un on-premise, la marca XOne sin glifo", () => {
    // El id sale de `identidadDeEntorno` (la URL decide), así que esto es un dato y no una
    // suposición. Un servidor del que solo se conoce el host no puede llevar la marca de un
    // producto concreto: sería decir de qué producto es sin saberlo.
    const oficial = svgDe("webstudio").innerHTML;
    const propio = svgDe("mi-servidor.interno").innerHTML;
    expect(oficial).not.toBe(propio);
    expect(svgDe("otro-host-cualquiera").innerHTML).toBe(propio);
  });

  it("no se anuncia: el nombre del entorno está al lado en texto", () => {
    const svg = svgDe("webstudio");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("title")).toBeNull();
  });

  it("no trae fondo propio: el `<rect>` blanco del fichero de origen se quitó", () => {
    // Con él, la marca llevaría un cuadrado blanco encima del azul de la barra.
    for (const id of ["webstudio", "cloudstudio", "on-premise"]) {
      const blancos = [...svgDe(id).querySelectorAll("rect")].filter(
        (r) => (r.getAttribute("fill") ?? "").toLowerCase() === "#fff",
      );
      expect(blancos).toHaveLength(0);
    }
  });
});
