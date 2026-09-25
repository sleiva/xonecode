import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import type { ConectorDelCable } from "../tipos.js";
import { Conectores } from "./Conectores.js";
import { AVISO_DE_URL } from "./Wizard.js";

afterEach(cleanup);

const CATALOGO = [
  { id: "deepwiki", nombre: "DeepWiki", descripcion: "Lee documentación de GitHub.", autenticacion: "ninguna" as const },
  { id: "jira", nombre: "Jira", descripcion: "Busca y crea incidencias.", autenticacion: "oauth" as const },
  { id: "notion", nombre: "Notion", descripcion: "Busca y lee páginas.", autenticacion: "oauth" as const },
];

const base = (extra: Partial<ConectorDelCable> = {}): ConectorDelCable => ({
  id: "notion",
  estado: "autorizado",
  ...extra,
});

const props = (extra: Partial<Parameters<typeof Conectores>[0]> = {}) => ({
  catalogo: CATALOGO,
  conectores: [] as ConectorDelCable[],
  desconocidos: [] as string[],
  alAccion: vi.fn(),
  alCrear: vi.fn(),
  alResponderSecreto: vi.fn(),
  ...extra,
});

describe("Conectores", () => {
  it("pinta los dos grupos, cada uno con su cuenta", () => {
    render(
      <Conectores
        {...props({
          conectores: [base({ id: "notion" }), base({ id: "jira", estado: "falta-autorizar" })],
        })}
      />
    );
    expect(screen.getByText("Configurados · 2")).not.toBeNull();
    // DeepWiki es el único que no se ha añadido: Disponibles trae 1.
    expect(screen.getByText("Disponibles · 1")).not.toBeNull();
    expect(screen.getByText("DeepWiki")).not.toBeNull();
  });

  it("cada fila lleva la marca de SU conector, en las dos listas", () => {
    // El riesgo que esto vigila es mudo: si la fila le pasara el NOMBRE donde el icono espera el
    // ID, las tres marcas no llegarían y las tres filas caerían al monograma con todo en verde.
    render(<Conectores {...props({ conectores: [base({ id: "jira", estado: "falta-autorizar" })] })} />);
    const marcaDe = (nombre: string) => screen.getByText(nombre).closest("li")!.querySelector("img, svg")!;
    expect(marcaDe("Jira").getAttribute("src")).toBe("/iconos/conectores/jira.png"); // Configurados
    expect(marcaDe("DeepWiki").getAttribute("src")).toBe("/iconos/conectores/deepwiki.png"); // Disponibles
    expect(marcaDe("Notion").querySelector("path")).not.toBeNull(); // Disponibles, el trazado
  });

  it("las dos notas fijas de límite siempre están, con datos o sin ellos", () => {
    render(<Conectores {...props()} />);
    expect(screen.getByText(/todavía no llegan a ningún agente/)).not.toBeNull();
    expect(screen.getByText(/por un túnel no vuelve/)).not.toBeNull();
  });

  it("sin `prueba` la pastilla dice «Sin probar»", () => {
    render(<Conectores {...props({ conectores: [base({ estado: "autorizado" })] })} />);
    expect(screen.getByText("Sin probar")).not.toBeNull();
  });

  it("`autorizando` manda sobre `falta-autorizar`: «Esperando al navegador…»", () => {
    render(
      <Conectores {...props({ conectores: [base({ estado: "falta-autorizar", autorizando: true })] })} />
    );
    expect(screen.getByText("Esperando al navegador…")).not.toBeNull();
  });

  it("`falta-autorizar` sin `autorizando` ni prueba: «Falta autorizar»", () => {
    render(<Conectores {...props({ conectores: [base({ estado: "falta-autorizar" })] })} />);
    expect(screen.getByText("Falta autorizar")).not.toBeNull();
  });

  it("`falta-autorizar` con una prueba VIEJA fallida: gana «Falta autorizar», y su motivo NO se enseña", () => {
    // `probar` sobre un OAuth sin tokens guarda `{ok:false, motivo:"falta autorizar"}` en la
    // FOTO — así que sin esta regla, un Jira que se probó antes de autorizar arrastraba su
    // motivo bajo la fila, repitiendo lo que la propia pastilla ya dice.
    render(
      <Conectores
        {...props({
          conectores: [base({ estado: "falta-autorizar", prueba: { cuando: 1, ok: false, motivo: "falta autorizar" } })],
        })}
      />
    );
    expect(screen.getByText("Falta autorizar")).not.toBeNull();
    // En minúscula: es el motivo de la prueba vieja, y no la pastilla («Falta autorizar»,
    // con mayúscula) que ya ganó.
    expect(screen.queryByText("falta autorizar")).toBeNull();
  });

  it("`autorizando` con una prueba VIEJA fallida: gana «Esperando al navegador…», y su motivo NO se enseña", () => {
    render(
      <Conectores
        {...props({
          conectores: [
            base({ estado: "falta-autorizar", autorizando: true, prueba: { cuando: 1, ok: false, motivo: "no responde (HTTP 503)" } }),
          ],
        })}
      />
    );
    expect(screen.getByText("Esperando al navegador…")).not.toBeNull();
    expect(screen.queryByText("no responde (HTTP 503)")).toBeNull();
  });

  it("`prueba.ok:true` manda sobre todo: «Conectado · N tools», también mientras autorizando", () => {
    render(
      <Conectores
        {...props({
          conectores: [
            base({
              autorizando: true,
              prueba: { cuando: 1, ok: true, tools: [{ nombre: "search" }, { nombre: "read" }] },
            }),
          ],
        })}
      />
    );
    expect(screen.getByText("Conectado · 2 tools")).not.toBeNull();
  });

  it("`prueba.ok:false` enseña «No responde», con el motivo en el `title` y bajo la fila", () => {
    render(
      <Conectores
        {...props({
          conectores: [base({ prueba: { cuando: 1, ok: false, motivo: "no responde (HTTP 503)" } })],
        })}
      />
    );
    const pastilla = screen.getByText("No responde");
    expect(pastilla.getAttribute("title")).toBe("no responde (HTTP 503)");
    // Y en texto, bajo la fila: un `title` no lo lee nadie que no pase el ratón por encima.
    expect(screen.getByText("no responde (HTTP 503)")).not.toBeNull();
  });

  it("desplegar la fila enseña las tools, con su descripción y «solo lectura»", () => {
    render(
      <Conectores
        {...props({
          conectores: [
            base({
              prueba: {
                cuando: 1,
                ok: true,
                tools: [
                  { nombre: "search", descripcion: "Busca páginas.", soloLectura: true },
                  { nombre: "create_page" },
                ],
              },
            }),
          ],
        })}
      />
    );
    expect(screen.queryByText("search")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(screen.getByText("search")).not.toBeNull();
    expect(screen.getByText("Busca páginas.")).not.toBeNull();
    expect(screen.getByText("solo lectura")).not.toBeNull();
    expect(screen.getByText("create_page")).not.toBeNull();
  });

  it("con `prueba.ok` y cero tools dice «no expone ninguna tool»", () => {
    render(
      <Conectores
        {...props({ conectores: [base({ prueba: { cuando: 1, ok: true, tools: [] } })] })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(screen.getByText("no expone ninguna tool")).not.toBeNull();
  });

  describe("los botones mandan su acción exacta, con el id", () => {
    it("«Probar» y «Quitar» están siempre", () => {
      const alAccion = vi.fn();
      render(<Conectores {...props({ conectores: [base({ id: "deepwiki", estado: "sin-autorizacion" })], alAccion })} />);
      fireEvent.click(screen.getByRole("button", { name: "Probar" }));
      expect(alAccion).toHaveBeenCalledWith("probar", "deepwiki");
      fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
      expect(alAccion).toHaveBeenCalledWith("quitar", "deepwiki");
    });

    it("«Conectar» solo con OAuth sin autorizar, y manda `autorizar`", () => {
      const alAccion = vi.fn();
      render(<Conectores {...props({ conectores: [base({ id: "jira", estado: "falta-autorizar" })], alAccion })} />);
      fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
      expect(alAccion).toHaveBeenCalledWith("autorizar", "jira");
    });

    it("mientras `autorizando` el botón SIGUE, rotulado «Volver a abrir»", () => {
      render(
        <Conectores {...props({ conectores: [base({ id: "jira", estado: "falta-autorizar", autorizando: true })] })} />
      );
      expect(screen.getByRole("button", { name: "Volver a abrir" })).not.toBeNull();
      expect(screen.queryByRole("button", { name: "Conectar" })).toBeNull();
    });

    it("sin autenticación no hay botón «Conectar»", () => {
      render(<Conectores {...props({ conectores: [base({ id: "deepwiki", estado: "sin-autorizacion" })] })} />);
      expect(screen.queryByRole("button", { name: /^Conectar/ })).toBeNull();
    });

    it("«Desconectar» solo con OAuth autorizado, y manda `desconectar`", () => {
      const alAccion = vi.fn();
      render(<Conectores {...props({ conectores: [base({ id: "notion", estado: "autorizado" })], alAccion })} />);
      fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
      expect(alAccion).toHaveBeenCalledWith("desconectar", "notion");
    });

    it("sin autorizar todavía no hay botón «Desconectar»", () => {
      render(<Conectores {...props({ conectores: [base({ id: "notion", estado: "falta-autorizar" })] })} />);
      expect(screen.queryByRole("button", { name: "Desconectar" })).toBeNull();
    });

    it("«Añadir» sobre un catálogo SIN autenticación manda solo `anadir`: sin OAuth no hay nada que autorizar", () => {
      const alAccion = vi.fn();
      render(<Conectores {...props({ alAccion })} />);
      fireEvent.click(screen.getAllByRole("button", { name: "Añadir" })[0]!);
      expect(alAccion).toHaveBeenCalledTimes(1);
      expect(alAccion).toHaveBeenCalledWith("anadir", "deepwiki");
    });

    it("«Añadir» sobre un catálogo OAuth manda `anadir` Y `autorizar`, en ese orden: un solo clic hace las dos", () => {
      const alAccion = vi.fn();
      render(<Conectores {...props({ alAccion })} />);
      // Por NOMBRE, no por posición en el catálogo: la fila es la que trae «Jira» en su
      // cabecera, y de ahí sale su botón «Añadir» — no depende del orden del array.
      const filaDeJira = screen.getByText("Jira").closest("li")!;
      fireEvent.click(within(filaDeJira).getByRole("button", { name: "Añadir" }));
      expect(alAccion).toHaveBeenCalledTimes(2);
      expect(alAccion).toHaveBeenNthCalledWith(1, "anadir", "jira");
      expect(alAccion).toHaveBeenNthCalledWith(2, "autorizar", "jira");
    });
  });

  it("`error` sale como una línea con `role=\"status\"` encima de las listas", () => {
    render(<Conectores {...props({ error: "no se pudo guardar" })} />);
    expect(screen.getByRole("status").textContent).toBe("no se pudo guardar");
  });

  it("`ilegible` sustituye a «Configurados · N»: ausente ≠ vacío", () => {
    render(<Conectores {...props({ ilegible: true })} />);
    expect(screen.queryByText(/^Configurados/)).toBeNull();
    expect(screen.getByText(/no se pudo leer/i).textContent).toContain("conectores.json");
    // Disponibles se calcula del mismo `conectores` vacío que trae un fichero ilegible, así
    // que enseña el catálogo ENTERO como si nada estuviera añadido — una aproximación
    // deliberada y no una medida: ver el concern del informe de esta tarea.
    expect(screen.getByText("Disponibles · 3")).not.toBeNull();
  });

  it("`desconocidos` no vacío se nombra en una línea propia", () => {
    render(<Conectores {...props({ desconocidos: ["slack", "linear"] })} />);
    expect(screen.getByText(/esta versión no conoce/).textContent).toContain("slack, linear");
  });

  describe("un servidor escrito a mano", () => {
    const MI_SERVIDOR = {
      id: "custom:mi-servidor",
      nombre: "Mi servidor",
      descripcion: "Lo mío, servido por mí.",
      autenticacion: "api-key" as const,
    };

    const abrir = (): void => {
      fireEvent.click(screen.getByRole("button", { name: "Añadir servidor" }));
    };

    function rellenar(nombre: string, descripcion: string, url: string): void {
      fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: nombre } });
      fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: descripcion } });
      fireEvent.change(screen.getByLabelText("URL"), { target: { value: url } });
    }

    it("el botón abre el formulario y «Cancelar» lo cierra sin mandar nada", () => {
      const alCrear = vi.fn();
      render(<Conectores {...props({ alCrear })} />);
      expect(screen.queryByLabelText("Nombre")).toBeNull();
      abrir();
      expect(screen.getByLabelText("Nombre")).not.toBeNull();
      // Con el formulario delante la lista se va: añadir un servidor es una TAREA, y un
      // formulario al final de la lista queda fuera de la vista justo al abrirlo.
      expect(screen.queryByRole("button", { name: "Añadir servidor" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByLabelText("Nombre")).toBeNull();
      expect(alCrear).not.toHaveBeenCalled();
    });

    it("«Añadir» está apagado mientras falte cualquier campo", () => {
      render(<Conectores {...props()} />);
      abrir();
      const boton = screen.getByRole("button", { name: "Añadir" }) as HTMLButtonElement;
      expect(boton.disabled).toBe(true);
      rellenar("Mi servidor", "Lo mío.", "");
      expect(boton.disabled).toBe(true); // la URL sigue vacía
      fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://mcp.ejemplo.com/mcp" } });
      expect(boton.disabled).toBe(false);
      // Un espacio no es un nombre: el `trim` va en la MISMA condición que el vacío, o un
      // campo con un espacio dejaría mandar una definición que el servidor rechaza.
      fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "   " } });
      expect(boton.disabled).toBe(true);
    });

    it("una URL `http://` fuera de loopback sale como `role=\"alert\"` y NO se manda", () => {
      // La regla es la de `core/modelos.ts`, copiada en el cliente para que el no no sea mudo:
      // el servidor la rechazaría igual —fail-closed—, pero un viaje de ida y vuelta para una
      // frase que ya se sabe es un viaje que no hacía falta.
      const alCrear = vi.fn();
      render(<Conectores {...props({ alCrear })} />);
      abrir();
      rellenar("Mi servidor", "Lo mío.", "http://mcp.ejemplo.com/mcp");
      fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
      expect(screen.getByRole("alert").textContent).toBe(AVISO_DE_URL);
      expect(alCrear).not.toHaveBeenCalled();
    });

    it("el aviso de la URL se retira al corregir ese campo, y no antes", () => {
      // Un aviso de algo que ya no pasa es un aviso que enseña a no mirarlos: con la URL buena
      // tecleada, la frase del `http://` se quedaba en pantalla hasta el siguiente envío.
      render(<Conectores {...props()} />);
      abrir();
      rellenar("Mi servidor", "Lo mío.", "http://mcp.ejemplo.com/mcp");
      fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
      expect(screen.getByRole("alert")).not.toBeNull();
      // Cambiar la DESCRIPCIÓN no dice nada de la URL, que es de lo que habla el aviso.
      fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Otra cosa." } });
      expect(screen.getByRole("alert")).not.toBeNull();
      fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://mcp.ejemplo.com/mcp" } });
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("al enviar manda la definición RECORTADA, con la autenticación elegida y sin id", () => {
      const alCrear = vi.fn();
      render(<Conectores {...props({ alCrear })} />);
      abrir();
      rellenar("  Mi servidor  ", "  Lo mío.  ", "  https://mcp.ejemplo.com/mcp  ");
      fireEvent.change(screen.getByLabelText("Autenticación"), { target: { value: "api-key" } });
      fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
      // Sin `id`: lo DERIVA el servidor del nombre, con la misma regla de slug que un proveedor
      // personalizado. Un id tecleado sería un segundo sitio donde decidirlo.
      expect(alCrear).toHaveBeenCalledWith({
        nombre: "Mi servidor",
        descripcion: "Lo mío.",
        url: "https://mcp.ejemplo.com/mcp",
        autenticacion: "api-key",
      });
    });

    it("el formulario NO se cierra al enviar: se cierra cuando lo añadido CRECE", () => {
      // Cerrar al enviar tiraría los cuatro campos de alguien que acaba de teclearlos cuando el
      // servidor rechaza —un nombre repetido, el fichero ilegible—, y el rechazo no se lee hasta
      // que vuelve. El hecho que cierra esto es que la lista crezca, que es «salió bien».
      const alCrear = vi.fn();
      const { rerender } = render(<Conectores {...props({ alCrear })} />);
      abrir();
      rellenar("Mi servidor", "Lo mío.", "https://mcp.ejemplo.com/mcp");
      fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
      // El servidor lo rechazó: la lista no cambió, y lo tecleado sigue donde estaba.
      rerender(<Conectores {...props({ alCrear, conectores: [] })} />);
      expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Mi servidor");
      rerender(
        <Conectores {...props({ alCrear, conectores: [base({ id: MI_SERVIDOR.id, estado: "falta-autorizar" })] })} />
      );
      expect(screen.queryByLabelText("Nombre")).toBeNull();
    });

    it("elegir «Clave de API» cambia la nota: la clave se pide después, y NO hay campo para ella", () => {
      // El detalle que gobierna el diseño: «Clave de API» es un TIPO de autenticación, y la clave
      // se pide DESPUÉS por `leerSecreto`. Un campo aquí sería un segundo camino para una
      // credencial, y el segundo camino es el que se olvida de la criba.
      render(<Conectores {...props()} />);
      abrir();
      expect(screen.getByText(/se registra solo/)).not.toBeNull();
      fireEvent.change(screen.getByLabelText("Autenticación"), { target: { value: "api-key" } });
      expect(screen.getByText(/se pide después, al añadirlo/)).not.toBeNull();
      expect(screen.queryByLabelText(/clave/i)).toBeNull();
    });

    it("en la lista se pinta como cualquier otro: nombre, descripción y monograma", () => {
      // El id `custom:` no tiene marca que copiar, así que cae en el monograma del nombre — un
      // logo inventado sería peor que la letra—, y la fila no lo distingue de una del catálogo.
      render(
        <Conectores
          {...props({
            catalogo: [...CATALOGO, MI_SERVIDOR],
            conectores: [base({ id: MI_SERVIDOR.id, estado: "autorizado" })],
          })}
        />
      );
      const fila = screen.getByText("Mi servidor").closest("li")!;
      expect(within(fila).getByText("Lo mío, servido por mí.")).not.toBeNull();
      expect(fila.querySelector("svg text")!.textContent).toBe("M");
    });

    it("un `api-key` es un carril de autorización como el OAuth: «Conectar» sin clave, «Desconectar» con ella", () => {
      const alAccion = vi.fn();
      const catalogo = [...CATALOGO, MI_SERVIDOR];
      const { rerender } = render(
        <Conectores
          {...props({ catalogo, conectores: [base({ id: MI_SERVIDOR.id, estado: "falta-autorizar" })], alAccion })}
        />
      );
      expect(screen.getByText("Falta autorizar")).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
      expect(alAccion).toHaveBeenCalledWith("autorizar", MI_SERVIDOR.id);
      rerender(
        <Conectores {...props({ catalogo, conectores: [base({ id: MI_SERVIDOR.id, estado: "autorizado" })], alAccion })} />
      );
      fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
      expect(alAccion).toHaveBeenCalledWith("desconectar", MI_SERVIDOR.id);
    });
  });

  describe("la clave de un conector `api-key`", () => {
    // El carril de la clave es el ÚNICO sitio de esta ventana que pregunta algo a una persona, y
    // su pregunta la pinta el centro del chat salvo con Ajustes abierto —donde el centro la
    // calla—. Si esta sección no la pintara, pulsar «Conectar» no haría NADA visible: la clave
    // se pide al vacío y el conector se queda en «Falta autorizar» sin que nadie sepa por qué.
    const CON_CLAVE = {
      id: "custom:prueba-clave",
      nombre: "Prueba Clave",
      descripcion: "Un servidor que pide clave.",
      autenticacion: "api-key" as const,
    };
    const CATALOGO_CON_CLAVE = [...CATALOGO, CON_CLAVE, { ...CON_CLAVE, id: "custom:otro", nombre: "Otro" }];

    // Y la pregunta de verdad, con su espacio final: la escribe el servidor (en `arranque.ts`,
    // «clave de <id> (sin el «Bearer»): »). Un `getByText` con el literal EXACTO no la encuentra
    // —el normalizador de la librería recorta el espacio del texto del nodo y NO el del matcher—,
    // así que se busca por su etiqueta, que es como lo hace `Pregunta.test.tsx`.
    const PREGUNTA = "clave de custom:prueba-clave (sin el «Bearer»): ";
    const LA_PREGUNTA = /clave de custom:prueba-clave/;

    it("«Conectar» de una fila `api-key` pinta la pregunta, y contestarla la manda", async () => {
      const alAccion = vi.fn();
      const alResponderSecreto = vi.fn();
      render(
        <Conectores
          {...props({
            catalogo: CATALOGO_CON_CLAVE,
            conectores: [base({ id: CON_CLAVE.id, estado: "falta-autorizar" })],
            alAccion,
            alResponderSecreto,
            secreto: PREGUNTA,
          })}
        />
      );
      // Todavía no: la pregunta no es de esta sección hasta que la provoca.
      expect(screen.queryByLabelText(LA_PREGUNTA)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
      expect(alAccion).toHaveBeenCalledWith("autorizar", CON_CLAVE.id);
      expect(screen.getByLabelText(LA_PREGUNTA)).not.toBeNull();
      fireEvent.change(screen.getByLabelText(LA_PREGUNTA), { target: { value: "una-clave" } });
      fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
      expect(alResponderSecreto).toHaveBeenCalledWith("una-clave");
    });

    it("una pregunta que NO ha provocado esta sección no se pinta aquí", () => {
      // El caso real: la clave de un proveedor de modelo, o la de un alta anterior, en vuelo
      // mientras se abre Ajustes en Conectores. Pintarla aquí la atribuiría a un conector.
      render(
        <Conectores
          {...props({
            catalogo: CATALOGO_CON_CLAVE,
            conectores: [base({ id: CON_CLAVE.id, estado: "falta-autorizar" })],
            secreto: PREGUNTA,
          })}
        />
      );
      expect(screen.queryByLabelText(LA_PREGUNTA)).toBeNull();
    });

    it("el alta de un servidor `api-key` es la otra puerta que la pide", () => {
      render(<Conectores {...props({ catalogo: CATALOGO_CON_CLAVE, secreto: PREGUNTA })} />);
      fireEvent.click(screen.getByRole("button", { name: "Añadir servidor" }));
      // Con el formulario delante la sección enseña SOLO el formulario, así que la marca se pone
      // al enviar: lo que se declara es que la clave va a pedirse, no que se haya pedido.
      expect(screen.queryByLabelText(LA_PREGUNTA)).toBeNull();
      fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Prueba Clave" } });
      fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Un servidor que pide clave." } });
      fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://mcp.ejemplo.com/mcp" } });
      fireEvent.change(screen.getByLabelText("Autenticación"), { target: { value: "api-key" } });
      fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
      expect(screen.getByLabelText(LA_PREGUNTA)).not.toBeNull();
    });

    it("un carril que NO pide clave no la espera: «Añadir» un OAuth no pinta la pregunta", () => {
      // La marca se lee de la fila del catálogo, y un `oauth` no la pide por esta costura: abre
      // un navegador. Pintarla aquí dejaría una pregunta que nadie provocó.
      render(<Conectores {...props({ secreto: PREGUNTA })} />);
      // DeepWiki es el único disponible y no autentica; Jira y Notion son `oauth`.
      fireEvent.click(within(screen.getByText("Jira").closest("li")!).getByRole("button", { name: "Añadir" }));
      expect(screen.queryByLabelText(LA_PREGUNTA)).toBeNull();
    });
  });
});
