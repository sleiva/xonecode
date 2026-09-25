import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { IconoDeConector } from "./IconoDeConector.js";

afterEach(cleanup);

function pintar(id: string, nombre = id): SVGElement | HTMLImageElement {
  const { container } = render(<IconoDeConector id={id} nombre={nombre} />);
  return container.firstElementChild as SVGElement | HTMLImageElement;
}

/** El monograma es el único carril con la letra dentro: los otros dos son una marca. */
function esMonograma(nodo: SVGElement | HTMLImageElement): boolean {
  return nodo.tagName === "svg" && nodo.querySelector("text") !== null;
}

describe("IconoDeConector", () => {
  it("los TRES del catálogo traen su marca: ninguno cae en el monograma", () => {
    // Los ids, nombrados uno a uno a propósito: son la clave de los dos carriles, y si uno
    // cambia en `core/conectores.ts` la marca no llega y el icono cae al monograma en
    // silencio. Aquí eso es un rojo.
    for (const id of ["deepwiki", "jira", "notion"]) {
      expect(esMonograma(pintar(id)), `«${id}» cayó en el monograma`).toBe(false);
    }
  });

  it("Jira y DeepWiki se sirven como fichero empaquetado, con `alt` vacío y su hueco reservado", () => {
    for (const id of ["jira", "deepwiki"]) {
      const img = pintar(id) as HTMLImageElement;
      expect(img.tagName.toLowerCase()).toBe("img");
      // El fichero, empaquetado: `/iconos/` es de `public/`, nunca un CDN — esta consola
      // declara un modo offline de primera clase.
      expect(img.getAttribute("src")).toBe(`/iconos/conectores/${id}.png`);
      // `alt=""` es la forma que un `<img>` tiene de `aria-hidden`: el nombre ya está al lado
      // como texto, y un `<title>` lo haría anunciarse dos veces.
      expect(img.getAttribute("alt")).toBe("");
      // Sin `width`/`height` el navegador no reserva el hueco y la fila salta al cargar.
      expect(img.getAttribute("width")).toBe("20");
      expect(img.getAttribute("height")).toBe("20");
    }
  });

  it("Notion es un TRAZADO con `currentColor`: monocromo, sin ningún color dentro", () => {
    // Dentro de un `<img>` su `fill="black"` a fuego sería un cuadrado negro invisible en el
    // tema de noche; heredando el color, se pinta con el alias de la fila y funciona en los dos.
    const svg = pintar("notion") as SVGElement;
    expect(svg.tagName).toBe("svg");
    const trazado = svg.querySelector("path")!;
    expect(trazado.getAttribute("d")!.length).toBeGreaterThan(100);
    expect(svg.outerHTML.toLowerCase()).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/);
  });

  it("la marca la ata el ID: retocar el nombre no la cambia", () => {
    // Los ids no se escriben con mayúsculas ni acentos —son de la tabla del catálogo— y el
    // nombre sí: atar el logo al nombre lo rompería en cuanto alguien lo retocara.
    expect((pintar("jira", "Incidencias") as HTMLImageElement).getAttribute("src")).toBe(
      "/iconos/conectores/jira.png"
    );
  });

  it("un conector sin marca cae en el monograma, no en un hueco", () => {
    // Es el caso de un conector añadido a mano: no tiene marca que copiar, y un logo inventado
    // sería peor que la letra de su nombre.
    const svg = pintar("linear") as SVGElement;
    const letra = svg.querySelector("text")!;
    expect(letra.textContent).toBe("L");
    expect(letra.getAttribute("fill")).toBe("currentColor");
  });

  it("el monograma sale del NOMBRE, y un nombre vacío no deja el icono en blanco", () => {
    expect((pintar("custom:mi-servidor", "Mi servidor") as SVGElement).querySelector("text")!.textContent).toBe("M");
    expect((pintar("x", "   ") as SVGElement).querySelector("text")!.textContent).toBe("?");
  });

  it("no se anuncia: el nombre del conector ya está en la fila como texto", () => {
    const svg = pintar("notion") as SVGElement;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("title")).toBeNull();
  });
});
