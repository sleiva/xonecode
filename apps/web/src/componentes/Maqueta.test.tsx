import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { Maqueta } from "./Maqueta.js";

afterEach(cleanup);

const AQUI = dirname(fileURLToPath(import.meta.url));
const ESTILOS = join(AQUI, "..", "..", "estilos");

describe("Maqueta", () => {
  it("la barra va PRIMERO en el DOM: a la izquierda, como pidió el usuario al final — no a la derecha, que fue lo que pidió antes", () => {
    const { container } = render(
      <Maqueta centro={<div data-testid="centro">centro</div>} barra={<div data-testid="barra">barra</div>} />
    );
    const raiz = container.firstElementChild;
    expect(raiz?.children[0]?.querySelector("[data-testid='barra']")).not.toBeNull();
    expect(raiz?.children[1]?.querySelector("[data-testid='centro']")).not.toBeNull();
  });

  it("escribe las pistas del grid: el `.frame` copiado no las trae, y sin ellas la barra se apila ENCIMA del centro", () => {
    // No es cosmética. `AppFrame.module.css` declara `display: grid` y NINGUNA columna
    // —en el original las escribe su componente en línea—, así que un grid sin pistas
    // resuelve a una sola columna y las dos cajas quedan una debajo de otra. Es
    // exactamente el tipo de fallo mudo que este repo persigue: nada da error.
    const { container } = render(<Maqueta centro={<div />} barra={<div />} />);
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.style.gridTemplateColumns).toBe("280px minmax(0, 1fr)");
  });

  it("NO pone `data-phase`: con él, ni el chat ni la trayectoria pueden scrollear", () => {
    // Regresión medida en pantalla, no teórica: `data-phase="active"` enciende
    // `.root[data-phase='active'] .viewArea { flex: 1 0 auto; min-height: auto }`, que en
    // el original convive con un `.scrollBody` que aquí no existe. Sin ese envoltorio la
    // vista crecía hasta el alto del contenido y `.centerCol` la recortaba DEBAJO del
    // compositor — las últimas líneas tapadas y sin barra de scroll. Nada da error, así
    // que solo un test que mire el atributo lo impide.
    const { container } = render(<Maqueta centro={<div />} barra={<div />} />);
    const columna = container.firstElementChild?.children[1] as HTMLElement;
    expect(columna.getAttribute("data-phase")).toBeNull();
  });

  it("el borde que separa las dos columnas lo pinta la COLUMNA de la barra, no la barra", () => {
    // Una posición es una propiedad tan comprobable como un color: mover la barra sin
    // mover el borde deja un borde duplicado o ausente en el lado nuevo, y eso un test
    // de DOM no lo ve — solo mirar el CSS lo pilla. Ahora el CSS es el de deepseek, y
    // este test vigila que siga siendo `border-right` sobre `.sidebarCol` (la barra a la
    // izquierda) y no se cuele un `border-left` de una copia posterior.
    const css = readFileSync(join(ESTILOS, "AppFrame.module.css"), "utf8");
    expect(css).toMatch(/\.sidebarCol\s*\{[^}]*border-right/);
    expect(css).not.toMatch(/\.sidebarCol\s*\{[^}]*border-left/);
  });

  it("la columna central declara el eje de ancho compartido, que es lo que centra la conversación y la alinea con el compositor", () => {
    // `--dsh-chat-content-width` vive en `.root` de `ConversationRoot.module.css`, y
    // `Maqueta` monta esa clase sobre la columna central. Si esa hoja dejara de
    // montarse, la variable no existiría, `max-width` de la columna de mensajes
    // resolvería a nada y la conversación volvería a pegarse a la barra — sin error.
    const css = readFileSync(join(ESTILOS, "ConversationRoot.module.css"), "utf8");
    expect(css).toMatch(/--dsh-chat-content-width:/);
    expect(css).toMatch(/--dsh-composer-card-max-width:/);
  });
});
