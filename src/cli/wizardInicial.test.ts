import { describe, expect, it, vi } from "vitest";
import { CatalogoModelosEnMemoria } from "../core/ports.js";
import type { SelectorDeConsola } from "./consola.js";
import { asistenteDeModelo, ID_VOLVER } from "./wizardInicial.js";

function consolaFalsa(respuestas: string[]) {
  const escrito: string[] = [];
  let i = 0;
  return {
    escrito,
    consola: {
      escribir: (t: string) => { escrito.push(t); },
      preguntar: async () => respuestas[i++] ?? "",
      leerSecreto: async () => "clave-secreta",
      interactivo: true,
      catalogoModelos: new CatalogoModelosEnMemoria({
        ollama: [{ proveedor: "ollama", id: "glm-5.3-flash:cloud", nombre: "GLM 5.3" }],
      }),
      seleccionar: async ({ opciones }: { opciones: Array<{ id: string }> }) => opciones[0]?.id,
    },
  };
}

/**
 * Una consola que contesta los selectores por GUION, en orden, y apunta lo que se le
 * preguntó. Hace falta desde que el asistente es un lazo: `consolaFalsa` contesta siempre
 * lo mismo, que era suficiente para una escalera de dos peldaños y no lo es para probar
 * una vuelta atrás.
 */
function consolaGuionizada(
  guion: (string | undefined)[],
  extra: { catalogo?: CatalogoModelosEnMemoria; eof?: () => boolean; secretos?: string[] } = {}
) {
  const escrito: string[] = [];
  const preguntados: SelectorDeConsola[] = [];
  const secretos = extra.secretos ?? [];
  let i = 0;
  let s = 0;
  return {
    escrito,
    preguntados,
    consola: {
      escribir: (t: string) => { escrito.push(t); },
      preguntar: async () => "",
      leerSecreto: async () => secretos[s++] ?? "clave-secreta",
      interactivo: true,
      ...(extra.eof === undefined ? {} : { eof: extra.eof }),
      catalogoModelos:
        extra.catalogo ??
        new CatalogoModelosEnMemoria({
          ollama: [{ proveedor: "ollama", id: "glm-5.3-flash:cloud", nombre: "GLM 5.3" }],
        }),
      seleccionar: async (selector: SelectorDeConsola) => {
        preguntados.push(selector);
        // Un guion agotado NO cae en «elige el primero»: sería un test que pasa por
        // casualidad en cuanto el lazo dé una vuelta de más. Se acaba cancelando.
        return i < guion.length ? guion[i++] : undefined;
      },
    },
  };
}

describe("asistenteDeModelo", () => {
  it("no hace nada si ya hay un modelo elegido", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const guardar = vi.fn();
    await asistenteDeModelo({ ...consola, guardarModeloGlobal: guardar } as never, { origenDeTrabajo: "global" });
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito).toEqual([]);
  });

  it("sin TTY no pregunta ni escribe", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const guardar = vi.fn();
    await asistenteDeModelo(
      { ...consola, interactivo: false, guardarModeloGlobal: guardar } as never,
      { origenDeTrabajo: "omision" }
    );
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito).toEqual([]);
  });

  it("elige proveedor y modelo, y lo guarda en los TRES papeles", async () => {
    const { consola } = consolaFalsa([]);
    const guardar = vi.fn((_papel: string, id: string) => ({ ruta: "~/.xonecode/config.json", id }));
    await asistenteDeModelo({ ...consola, guardarModeloGlobal: guardar } as never, { origenDeTrabajo: "omision" });

    expect(guardar.mock.calls.map((c) => c[0])).toEqual(["rapido", "trabajo", "afilado"]);
    expect(guardar.mock.calls[0]![1]).toBe("ollama/glm-5.3-flash:cloud");
  });

  it("cancelar no escribe nada", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const guardar = vi.fn();
    await asistenteDeModelo(
      { ...consola, seleccionar: async () => undefined, guardarModeloGlobal: guardar } as never,
      { origenDeTrabajo: "omision" }
    );
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito.join("")).toMatch(/cancelad/i);
  });

  it("un proveedor sin credencial la pide, la guarda por guardarCredencial y lo dice", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const leerSecreto = vi.fn(async () => "clave-de-openai");
    const guardarCredencial = vi.fn(() => ({ ruta: "~/.xonecode/auth.json" }));
    const guardar = vi.fn((_papel: string, id: string) => ({ ruta: "~/.xonecode/config.json", id }));
    await asistenteDeModelo(
      {
        ...consola,
        leerSecreto,
        guardarModeloGlobal: guardar,
        catalogoModelos: new CatalogoModelosEnMemoria({
          openai: [{ proveedor: "openai", id: "gpt-5", nombre: "GPT 5" }],
        }),
        seleccionar: async ({ titulo, opciones }: { titulo: string; opciones: Array<{ id: string }> }) =>
          titulo === "Proveedor de modelos" ? "openai" : opciones[0]?.id,
      } as never,
      { origenDeTrabajo: "omision", hayCredencial: () => false, guardarCredencial }
    );

    expect(leerSecreto).toHaveBeenCalledWith("clave de openai: ");
    expect(guardarCredencial).toHaveBeenCalledWith("openai", "clave-de-openai");
    // Confirma QUÉ se guardó y DÓNDE, igual que `/provider` — no en silencio.
    expect(escrito.join("")).toMatch(/credencial de openai guardada en ~\/\.xonecode\/auth\.json/);
    expect(guardar.mock.calls.map((c) => c[0])).toEqual(["rapido", "trabajo", "afilado"]);
    expect(guardar.mock.calls[0]![1]).toBe("openai/gpt-5");
  });

  it("cancelar en el paso de MODELO tras guardar una credencial de pago: la credencial ya quedó, y se dice", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const leerSecreto = vi.fn(async () => "clave-de-openai");
    const guardarCredencial = vi.fn(() => ({ ruta: "~/.xonecode/auth.json" }));
    const guardar = vi.fn();
    await asistenteDeModelo(
      {
        ...consola,
        leerSecreto,
        guardarModeloGlobal: guardar,
        catalogoModelos: new CatalogoModelosEnMemoria({
          openai: [{ proveedor: "openai", id: "gpt-5", nombre: "GPT 5" }],
        }),
        // Elige "openai" en el paso de PROVEEDOR y cancela (undefined) en el de MODELO.
        seleccionar: async ({ titulo }: { titulo: string }) =>
          titulo === "Proveedor de modelos" ? "openai" : undefined,
      } as never,
      { origenDeTrabajo: "omision", hayCredencial: () => false, guardarCredencial }
    );

    // La credencial SÍ se guardó (hace falta para poder listar el catálogo de pago)...
    expect(guardarCredencial).toHaveBeenCalledWith("openai", "clave-de-openai");
    // ...pero ningún papel se reasignó de modelo: cancelar en MODELO no elige nada.
    expect(guardar).not.toHaveBeenCalled();
    const texto = escrito.join("");
    // Y el aviso final de «cancelado» no es la única frase: antes se dijo la verdad
    // sobre la credencial, así que «cancelado» no puede leerse como «no pasó nada».
    expect(texto).toMatch(/credencial de openai guardada en ~\/\.xonecode\/auth\.json/);
    expect(texto).toMatch(/cancelad/i);
  });

  it("ollama nunca pide credencial aunque hayCredencial diga que falta", async () => {
    const { consola } = consolaFalsa([]);
    const leerSecreto = vi.fn(async () => "no-debería-usarse");
    const guardarCredencial = vi.fn();
    const guardar = vi.fn((_papel: string, id: string) => ({ ruta: "~/.xonecode/config.json", id }));
    await asistenteDeModelo(
      { ...consola, leerSecreto, guardarModeloGlobal: guardar } as never,
      { origenDeTrabajo: "omision", hayCredencial: () => false, guardarCredencial }
    );

    expect(leerSecreto).not.toHaveBeenCalled();
    expect(guardarCredencial).not.toHaveBeenCalled();
    expect(guardar.mock.calls.map((c) => c[0])).toEqual(["rapido", "trabajo", "afilado"]);
  });

  it("una clave vacía en el paso de credencial cancela sin guardar nada", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const leerSecreto = vi.fn(async () => "   ");
    const guardarCredencial = vi.fn();
    const guardar = vi.fn();
    await asistenteDeModelo(
      {
        ...consola,
        leerSecreto,
        guardarModeloGlobal: guardar,
        catalogoModelos: new CatalogoModelosEnMemoria({
          openai: [{ proveedor: "openai", id: "gpt-5", nombre: "GPT 5" }],
        }),
        seleccionar: async ({ titulo, opciones }: { titulo: string; opciones: Array<{ id: string }> }) =>
          titulo === "Proveedor de modelos" ? "openai" : opciones[0]?.id,
      } as never,
      { origenDeTrabajo: "omision", hayCredencial: () => false, guardarCredencial }
    );

    expect(guardarCredencial).not.toHaveBeenCalled();
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito.join("")).toMatch(/cancelad/i);
  });

  it("cancelar en el paso del MODELO tampoco escribe nada, tras elegir proveedor", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const guardar = vi.fn();
    await asistenteDeModelo(
      {
        ...consola,
        guardarModeloGlobal: guardar,
        seleccionar: async ({ titulo }: { titulo: string }) =>
          titulo === "Proveedor de modelos" ? "ollama" : undefined,
      } as never,
      { origenDeTrabajo: "omision" }
    );
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito.join("")).toMatch(/cancelad/i);
  });

  it("devuelve QUÉ pasó, y no solo escribe: elegido, cancelado y sin-preguntar", async () => {
    const guardar = vi.fn((_papel: string, id: string) => ({ ruta: "~/.xonecode/config.json", id }));
    const elegido = consolaGuionizada(["ollama", "glm-5.3-flash:cloud"]);
    expect(
      await asistenteDeModelo({ ...elegido.consola, guardarModeloGlobal: guardar } as never, {
        origenDeTrabajo: "omision",
      })
    ).toBe("elegido");

    const cancelado = consolaGuionizada([undefined]);
    expect(
      await asistenteDeModelo({ ...cancelado.consola, guardarModeloGlobal: vi.fn() } as never, {
        origenDeTrabajo: "omision",
      })
    ).toBe("cancelado");

    const nada = consolaGuionizada([]);
    expect(
      await asistenteDeModelo({ ...nada.consola, guardarModeloGlobal: vi.fn() } as never, {
        origenDeTrabajo: "global",
      })
    ).toBe("sin-preguntar");
  });

  describe("volver atrás: elegir proveedor dejó de ser irreversible", () => {
    it("la lista de modelos ofrece «volver», y volver repite el paso de proveedor sin escribir nada", async () => {
      const guardar = vi.fn((_papel: string, id: string) => ({ ruta: "~/.xonecode/config.json", id }));
      // ollama → volver → ollama otra vez → esta vez sí, el modelo.
      const { consola, preguntados } = consolaGuionizada([
        "ollama",
        ID_VOLVER,
        "ollama",
        "glm-5.3-flash:cloud",
      ]);
      const resultado = await asistenteDeModelo(
        { ...consola, guardarModeloGlobal: guardar } as never,
        { origenDeTrabajo: "omision" }
      );

      expect(resultado).toBe("elegido");
      expect(preguntados.map((p) => p.titulo)).toEqual([
        "Proveedor de modelos",
        "Modelos de ollama",
        "Proveedor de modelos",
        "Modelos de ollama",
      ]);
      // La opción de volver va la ÚLTIMA, detrás de los modelos de verdad: delante se la
      // comería cualquier interfaz (y cualquier test) que elija «la primera».
      const modelos = preguntados[1]!.opciones;
      expect(modelos.at(-1)!.id).toBe(ID_VOLVER);
      expect(modelos.slice(0, -1).map((o) => o.id)).toEqual(["glm-5.3-flash:cloud"]);
      // Volver no es cancelar: no se dice nada de cancelación por el camino.
      expect(guardar.mock.calls.map((c) => c[1])).toEqual([
        "ollama/glm-5.3-flash:cloud",
        "ollama/glm-5.3-flash:cloud",
        "ollama/glm-5.3-flash:cloud",
      ]);
    });
  });

  describe("no se avanza sin conexión con el proveedor", () => {
    it("un catálogo que LANZA no deja pasar: vuelve al proveedor con el motivo en el selector", async () => {
      const catalogo = new CatalogoModelosEnMemoria({
        ollama: [{ proveedor: "ollama", id: "glm-5.3-flash:cloud", nombre: "GLM 5.3" }],
      });
      const roto = {
        listar: vi.fn(async (proveedor: string) => {
          if (proveedor === "openai") throw new Error("credencial no autorizada para openai");
          return catalogo.listar(proveedor as never);
        }),
      };
      const guardar = vi.fn((_papel: string, id: string) => ({ ruta: "~/.xonecode/config.json", id }));
      const guardarCredencial = vi.fn(() => ({ ruta: "~/.xonecode/auth.json" }));
      // openai (falla) → ollama → su modelo.
      const { consola, preguntados, escrito } = consolaGuionizada([
        "openai",
        "ollama",
        "glm-5.3-flash:cloud",
      ]);
      const resultado = await asistenteDeModelo(
        { ...consola, catalogoModelos: roto, guardarModeloGlobal: guardar } as never,
        { origenDeTrabajo: "omision", hayCredencial: () => false, guardarCredencial }
      );

      expect(resultado).toBe("elegido");
      // Nunca se llegó a preguntar por un modelo de openai: el paso no se dio por bueno.
      expect(preguntados.map((p) => p.titulo)).toEqual([
        "Proveedor de modelos",
        "Proveedor de modelos",
        "Modelos de ollama",
      ]);
      // Y el motivo viaja EN el selector, no solo por `escribir`: durante el alta de la
      // web el transcript no está en pantalla.
      expect(preguntados[1]!.aviso).toMatch(/no se pudo conectar con openai/);
      expect(preguntados[1]!.aviso).toMatch(/credencial no autorizada/);
      expect(escrito.join("")).toMatch(/no se pudo conectar con openai/);
      // El primer selector no lleva aviso: no había nada que avisar todavía.
      expect(preguntados[0]!.aviso).toBeUndefined();
      expect(guardar.mock.calls[0]![1]).toBe("ollama/glm-5.3-flash:cloud");
    });

    it("un catálogo VACÍO tampoco pasa: antes escribía una línea y seguía con el modelo de omisión", async () => {
      const guardar = vi.fn((_papel: string, id: string) => ({ ruta: "~/.xonecode/config.json", id }));
      const { consola, preguntados } = consolaGuionizada(["ollama"], {
        catalogo: new CatalogoModelosEnMemoria({}),
      });
      const resultado = await asistenteDeModelo(
        { ...consola, guardarModeloGlobal: guardar } as never,
        { origenDeTrabajo: "omision" }
      );

      // El guion se agota en la segunda vuelta y eso cancela: lo que importa es que NO
      // se guardó ningún modelo y que se volvió a preguntar por el proveedor.
      expect(resultado).toBe("cancelado");
      expect(guardar).not.toHaveBeenCalled();
      expect(preguntados.map((p) => p.titulo)).toEqual(["Proveedor de modelos", "Proveedor de modelos"]);
      expect(preguntados[1]!.aviso).toMatch(/no ofrece ningún modelo/);
    });

    /**
     * La regla nueva: la clave se PRUEBA antes de escribirse. Una que no sirve no llega
     * nunca al disco — no hay nada que confesar porque no se guardó nada. Antes se
     * escribía primero (hacía falta para poder listar) y quedaban claves basura en
     * `auth.json` de cada intento fallido.
     */
    it("la clave solo se escribe si el catálogo contesta: la que no sirve no llega al disco", async () => {
      const aplicadas: string[] = [];
      const guardarCredencial = vi.fn(() => ({ ruta: "~/.xonecode/auth.json" }));
      const listar = vi.fn(async (proveedor: string) => {
        if (proveedor === "openai") throw new Error("credencial no autorizada para openai");
        return [{ proveedor: "ollama", id: "glm-5.3-flash:cloud", nombre: "GLM" }];
      });
      const { consola, escrito } = consolaGuionizada(["openai", "ollama", "glm-5.3-flash:cloud"], {
        secretos: ["sk-mala"],
      });
      await asistenteDeModelo(
        { ...consola, catalogoModelos: { listar }, guardarModeloGlobal: vi.fn(() => ({ ruta: "c", id: "i" })) } as never,
        {
          origenDeTrabajo: "omision",
          hayCredencial: () => false,
          guardarCredencial,
          aplicarCredencial: (p, c) => aplicadas.push(`${p}:${c}`),
        }
      );

      // Se aplicó al proceso para poder preguntar…
      expect(aplicadas).toEqual(["openai:sk-mala"]);
      // …y NO se escribió: el catálogo dijo que no.
      expect(guardarCredencial).not.toHaveBeenCalled();
      expect(escrito.join("")).not.toMatch(/credencial de openai guardada/);
    });

    it("la clave que SÍ sirve se escribe, y solo entonces se dice dónde quedó", async () => {
      const guardarCredencial = vi.fn(() => ({ ruta: "~/.xonecode/auth.json" }));
      const { consola, escrito } = consolaGuionizada(["openai", "gpt-5"], {
        secretos: ["sk-buena"],
        catalogo: new CatalogoModelosEnMemoria({
          openai: [{ proveedor: "openai", id: "gpt-5", nombre: "GPT 5" }],
        }),
      });
      await asistenteDeModelo(
        { ...consola, guardarModeloGlobal: vi.fn(() => ({ ruta: "c", id: "i" })) } as never,
        {
          origenDeTrabajo: "omision",
          hayCredencial: () => false,
          guardarCredencial,
          aplicarCredencial: () => {},
        }
      );

      expect(guardarCredencial).toHaveBeenCalledWith("openai", "sk-buena");
      expect(escrito.join("")).toMatch(/credencial de openai guardada en ~\/\.xonecode\/auth\.json/);
    });

    it("una clave con forma imposible ni se escribe ni gasta una llamada al proveedor", async () => {
      const listar = vi.fn(async () => []);
      const guardarCredencial = vi.fn();
      const { consola, preguntados } = consolaGuionizada(["openai", "ollama"], {
        // La línea entera del `.env`, pegada de un tirón.
        secretos: ["ANTHROPIC_API_KEY=sk-ant-123"],
      });
      await asistenteDeModelo(
        { ...consola, catalogoModelos: { listar }, guardarModeloGlobal: vi.fn() } as never,
        {
          origenDeTrabajo: "omision",
          hayCredencial: () => false,
          guardarCredencial,
          aplicarCredencial: () => {},
        }
      );

      expect(guardarCredencial).not.toHaveBeenCalled();
      expect(listar).not.toHaveBeenCalledWith("openai");
      expect(preguntados[1]!.aviso).toMatch(/línea de entorno/);
    });

    it("la clave a medias es de la VUELTA: no se escribe bajo el proveedor siguiente", async () => {
      // Medido: con `auth.json` roto, la clave tecleada para openai se intentaba guardar
      // en la vuelta siguiente bajo ollama, que ni pide credencial.
      const guardados: string[] = [];
      const guardarCredencial = vi.fn((p: string) => {
        guardados.push(p);
        throw new Error("«auth.json»: el JSON es inválido");
      });
      const { consola } = consolaGuionizada(["openai", "ollama", "glm-5.3-flash:cloud"], {
        secretos: ["sk-buena"],
      });
      const resultado = await asistenteDeModelo(
        { ...consola, guardarModeloGlobal: vi.fn(() => ({ ruta: "c", id: "i" })) } as never,
        { origenDeTrabajo: "omision", hayCredencial: () => false, guardarCredencial }
      );

      expect(resultado).toBe("elegido");
      expect(guardados).toEqual(["openai"]);
    });

    it("una clave mal tecleada se vuelve a pedir: `hayCredencial` diría que ya la hay", async () => {
      const listar = vi.fn(async () => {
        throw new Error("credencial no autorizada para openai");
      });
      const guardarCredencial = vi.fn(() => ({ ruta: "~/.xonecode/auth.json" }));
      const leerSecreto = vi.fn(async () => "otra-clave");
      const { consola } = consolaGuionizada(["openai", "openai"]);
      await asistenteDeModelo(
        {
          ...consola,
          leerSecreto,
          catalogoModelos: { listar },
          guardarModeloGlobal: vi.fn(),
        } as never,
        {
          origenDeTrabajo: "omision",
          // La credencial YA está en disco desde el primer intento; sin la memoria de lo
          // que falló, el segundo intento no volvería a pedirla y fallaría igual para
          // siempre.
          hayCredencial: () => true,
          guardarCredencial,
        }
      );

      expect(leerSecreto).toHaveBeenCalledTimes(1);
      expect(guardarCredencial).toHaveBeenCalledTimes(1);
    });

    it("un `guardarCredencial` que lanza tampoco deja pasar: vuelve al proveedor y lo dice", async () => {
      // El caso real es `AuthRotoEnDisco`: un `auth.json` con el JSON estropeado no se
      // sobrescribe. Sin esto la excepción subía hasta quien conduce el paso, que en la web
      // deja el paso a medias y ANUNCIA el alta igual.
      const guardarCredencial = vi.fn(() => {
        throw new Error("«~/.xonecode/auth.json»: el JSON es inválido; no se sobrescribe.");
      });
      const guardar = vi.fn((_papel: string, id: string) => ({ ruta: "~/.xonecode/config.json", id }));
      const { consola, preguntados } = consolaGuionizada(["openai", "ollama", "glm-5.3-flash:cloud"]);
      const resultado = await asistenteDeModelo(
        { ...consola, guardarModeloGlobal: guardar } as never,
        { origenDeTrabajo: "omision", hayCredencial: () => false, guardarCredencial }
      );

      expect(resultado).toBe("elegido");
      expect(preguntados[1]!.aviso).toMatch(/no se pudo guardar la credencial de openai/);
      expect(preguntados[1]!.aviso).toMatch(/JSON es inválido/);
      expect(guardar.mock.calls[0]![1]).toBe("ollama/glm-5.3-flash:cloud");
    });
  });

  describe("exigirEleccion: en la web el paso de cuenta es una puerta", () => {
    it("cancelar NO sale mientras haya alguien: se vuelve a preguntar con el motivo delante", async () => {
      const guardar = vi.fn((_papel: string, id: string) => ({ ruta: "~/.xonecode/config.json", id }));
      // Cancela una vez y a la segunda elige.
      const { consola, preguntados } = consolaGuionizada(
        [undefined, "ollama", "glm-5.3-flash:cloud"],
        { eof: () => false }
      );
      const resultado = await asistenteDeModelo(
        { ...consola, guardarModeloGlobal: guardar } as never,
        { origenDeTrabajo: "omision", exigirEleccion: true }
      );

      expect(resultado).toBe("elegido");
      expect(preguntados.map((p) => p.titulo)).toEqual([
        "Proveedor de modelos",
        "Proveedor de modelos",
        "Modelos de ollama",
      ]);
      expect(preguntados[1]!.aviso).toMatch(/hace falta/i);
    });

    it("el enunciado del secreto dice cómo se vuelve, y solo donde eso es verdad", async () => {
      const deOpenai = new CatalogoModelosEnMemoria({
        openai: [{ proveedor: "openai", id: "gpt-5", nombre: "GPT 5" }],
      });
      const leerSecreto = vi.fn(async () => "sk-x");
      const conPuerta = consolaGuionizada(["openai", "gpt-5"], { eof: () => false, catalogo: deOpenai });
      await asistenteDeModelo(
        { ...conPuerta.consola, leerSecreto, guardarModeloGlobal: vi.fn(() => ({ ruta: "c", id: "i" })) } as never,
        { origenDeTrabajo: "omision", exigirEleccion: true, hayCredencial: () => false }
      );
      expect(leerSecreto).toHaveBeenCalledWith("clave de openai (en blanco para elegir otro proveedor): ");

      // En el terminal, en blanco cancela el asistente entero: prometer una vuelta atrás
      // que no existe sería mentir.
      const sinPuerta = consolaGuionizada(["openai", "gpt-5"], { catalogo: deOpenai });
      const leerSecretoTerminal = vi.fn(async () => "sk-x");
      await asistenteDeModelo(
        {
          ...sinPuerta.consola,
          leerSecreto: leerSecretoTerminal,
          guardarModeloGlobal: vi.fn(() => ({ ruta: "c", id: "i" })),
        } as never,
        { origenDeTrabajo: "omision", hayCredencial: () => false }
      );
      expect(leerSecretoTerminal).toHaveBeenCalledWith("clave de openai: ");
    });

    it("sin nadie al otro lado (`eof`) no se insiste: cancelar cancela", async () => {
      const guardar = vi.fn();
      const { consola, preguntados } = consolaGuionizada([undefined], { eof: () => true });
      const resultado = await asistenteDeModelo(
        { ...consola, guardarModeloGlobal: guardar } as never,
        { origenDeTrabajo: "omision", exigirEleccion: true }
      );

      expect(resultado).toBe("cancelado");
      expect(guardar).not.toHaveBeenCalled();
      expect(preguntados).toHaveLength(1);
    });

    it("una consola sin `eof` no puede afirmar que hay humano: tampoco se insiste", async () => {
      // Es la dirección segura: un lazo que no sabe si queda alguien es un lazo que no
      // termina. La consola web sí implementa `eof`, que es donde se pide insistir.
      const { consola } = consolaGuionizada([undefined]);
      expect(
        await asistenteDeModelo({ ...consola, guardarModeloGlobal: vi.fn() } as never, {
          origenDeTrabajo: "omision",
          exigirEleccion: true,
        })
      ).toBe("cancelado");
    });

    it("el aviso de quien llama sale en el PRIMER selector", async () => {
      const { consola, preguntados } = consolaGuionizada([undefined]);
      await asistenteDeModelo({ ...consola, guardarModeloGlobal: vi.fn() } as never, {
        origenDeTrabajo: "omision",
        aviso: "se cayó la conexión a mitad del alta",
      });
      expect(preguntados[0]!.aviso).toBe("se cayó la conexión a mitad del alta");
    });
  });

  it("con TTY pero sin selector rico, no pregunta ni escribe (no hay flujo de texto para el asistente)", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const guardar = vi.fn();
    const { seleccionar: _sinUsar, ...sinSelector } = consola;
    await asistenteDeModelo(
      { ...sinSelector, guardarModeloGlobal: guardar } as never,
      { origenDeTrabajo: "omision" }
    );
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito).toEqual([]);
  });
});
