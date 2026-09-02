import { describe, it, expect, vi } from "vitest";
import { abreviarHome, crearConsolaTui, envolverConOcupacion } from "./correrTui.js";
import { acuseDeModelo } from "../acuseDeModelo.js";
import { correrConsola, type EjecutorDeTurno } from "../consola.js";
import type { SesionReal } from "../../agent/turnoReal.js";
import { CatalogoModelosEnMemoria, type CatalogoModelosPort } from "../../core/ports.js";

function crearMontajeTui(
  opciones: Omit<Parameters<typeof crearConsolaTui>[0], "catalogoModelos" | "guardarModeloGlobal">
) {
  return crearConsolaTui({
    ...opciones,
    catalogoModelos: new CatalogoModelosEnMemoria(),
    guardarModeloGlobal: (_papel, id) => ({ ruta: "/tmp/config.json", id }),
  });
}

async function esperarPregunta(
  montaje: ReturnType<typeof crearConsolaTui>,
  texto: string
): Promise<void> {
  for (let intento = 0; intento < 20; intento++) {
    if (montaje.vista.ver().pregunta?.texto === texto) return;
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
  throw new Error(`la TUI no mostró la pregunta «${texto}»`);
}

async function esperarSelector(
  montaje: ReturnType<typeof crearConsolaTui>,
  titulo: string
): Promise<void> {
  for (let intento = 0; intento < 20; intento++) {
    if (montaje.vista.ver().selector?.titulo === titulo) return;
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
  throw new Error(`la TUI no mostró el selector «${titulo}»`);
}

describe("la consola TUI", () => {
  it("implementa Consola: lineas es la cola de lo enviado, escribir y piel comparten store", async () => {
    const { consola, enviar, actos } = crearMontajeTui({ raiz: "/tmp/proyecto" });
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
    // `escribir` es sistema y `piel.linea` es tool (grupo «herramientas») — tipos distintos, el MISMO store.
    expect(vistos.some((a) => a.tipo === "sistema" && a.texto.includes("hola"))).toBe(true);
    expect(vistos.some((a) => a.tipo === "herramientas" && a.lineas.some((l) => l.includes("app.xne")))).toBe(true);
    expect(vistos.some((a) => a.tipo === "fase")).toBe(true);

    // aprobar por defecto: fail-closed sin modal montado.
    await expect(consola.aprobacionesTui!([], new Map(), new Map())).resolves.toEqual(new Map());
  });

  it("preguntar y leerSecreto se responden por la misma ranura y devuelven la respuesta", async () => {
    const { consola, responder } = crearMontajeTui({ raiz: "/tmp/proyecto" });

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
    const { consola, cancelar } = crearMontajeTui({ raiz: "/tmp/proyecto" });
    const piel = consola.piel!();

    piel.token("hola"); // sin cancelación: fluye
    cancelar();
    expect(() => piel.token("más")).toThrow(/cancelado/);
    // La cancelación es de TURNO, no de sesión: el punto de cancelación se consume.
    expect(() => piel.token("otro turno")).not.toThrow();
  });

  it("una Ctrl-C que aterriza tarde no mata el turno siguiente (cada piel nueva rearma)", () => {
    const { consola, cancelar } = crearMontajeTui({ raiz: "/tmp/proyecto" });

    // Turno 1: la Ctrl-C llega DESPUÉS del último acto — el turno termina sin consumir
    // el flag, y la piel vieja no vuelve a usarse.
    const pielUno = consola.piel!();
    pielUno.token("hola");
    cancelar();

    // Turno 2: una piel nueva es un turno nuevo — arranca limpio, sin «turno cancelado».
    const pielDos = consola.piel!();
    expect(() => pielDos.token("primer acto del turno 2")).not.toThrow();

    // Y la cancelación DURANTE el turno 2 sigue funcionando igual.
    cancelar();
    expect(() => pielDos.token("más")).toThrow(/cancelado/);
  });

  it("escribir no crea actos vacíos: «\\n» solo no deja acto (el guard cubre whitespace, no solo \"\")", () => {
    const { consola, actos } = crearMontajeTui({ raiz: "/tmp/proyecto" });
    consola.escribir("\n");
    expect(actos()).toEqual([]);
  });

  it("el acuse de /modelo (compartido con consola.ts) actualiza la sidebar en caliente", () => {
    const { consola, datosSidebar } = crearMontajeTui({ raiz: "/tmp/proyecto" });
    consola.escribir(acuseDeModelo(undefined, "ollama/nuevo"));
    expect(datosSidebar().modelo).toBe("ollama/nuevo");
    consola.escribir(acuseDeModelo("trabajo", "ollama/otro"));
    expect(datosSidebar().modelo).toBe("ollama/otro");
    // El pie enseña la RUTA completa (la maqueta), no solo el basename.
    expect(datosSidebar().ruta).toBe("/tmp/proyecto");
  });

  it("el fin del turno lleva el modelo de trabajo vigente, y un /modelo posterior no lo reetiqueta", () => {
    // Capturar al cerrar el turno, no al pintar: si el transcript leyera el modelo
    // actual en el render, un /modelo cambiaría la etiqueta de turnos ya cerrados.
    const { consola, actos, datosSidebar } = crearMontajeTui({ raiz: "/tmp/proyecto" });
    const antes = datosSidebar().modelo;
    consola.piel!().fin(1800);
    consola.escribir(acuseDeModelo(undefined, "ollama/nuevo"));
    const fin = actos().find((a) => a.tipo === "fin");
    expect(fin).toEqual({ tipo: "fin", ms: 1800, modelo: antes });
    expect(datosSidebar().modelo).toBe("ollama/nuevo");
  });

  it("el envoltorio de ocupación sube antes del turno y baja al final — también para el guionizado", async () => {
    // El bug que fija esto: el envoltorio solo se aplicaba con `crearEjecutor`
    // definido, y `--guion` lo fuerza a undefined — el camino del default
    // (ejecutarTurnoGuionizado) corría SIN la envoltura y la Entrada nunca se
    // no marcaba el turno activo. Ahora las dos rutas pasan por aquí.
    const marcas: string[] = [];
    let soltar: () => void = () => {};
    const base: EjecutorDeTurno = async () => {
      marcas.push("turno-arranca");
      await new Promise<void>((r) => (soltar = r));
      marcas.push("turno-acaba");
    };
    const envuelto = envolverConOcupacion(base, (ocupado) => marcas.push(`ocupado=${ocupado}`));
    const turno = envuelto("hola", { hilo: "t", raiz: "/tmp", fuentes: {} }, {} as Parameters<EjecutorDeTurno>[2]);
    await new Promise((r) => setTimeout(r, 0));
    soltar();
    await turno;
    expect(marcas).toEqual(["ocupado=true", "turno-arranca", "turno-acaba", "ocupado=false"]);
  });

  // El `home` va explícito: el HOME de quien corre los tests no puede decidir el
  // resultado. (Por eso la aserción de `/tmp/proyecto` de más arriba sigue valiendo:
  // nadie tiene `/tmp` por home.)
  it("el pie abrevia el HOME a «~», y solo cuando es el prefijo de verdad", () => {
    expect(abreviarHome("/Users/x/dev/MinitMT", "/Users/x")).toBe("~/dev/MinitMT");
    expect(abreviarHome("/Users/x", "/Users/x")).toBe("~");
    // Prefijo de TEXTO pero no de carpeta: `/Users/xy` no vive dentro de `/Users/x`.
    expect(abreviarHome("/Users/xy/z", "/Users/x")).toBe("/Users/xy/z");
    expect(abreviarHome("/tmp/proyecto", "/Users/x")).toBe("/tmp/proyecto");
  });

  it("el historial deja la más reciente en el índice 0 (contrato de Entrada)", () => {
    const { enviar, historial } = crearMontajeTui({ raiz: "/tmp/proyecto" });
    enviar("primera");
    enviar("segunda");
    expect(historial[0]).toBe("segunda");
    expect(historial[1]).toBe("primera");
  });

  it("una petición enviada mientras está ocupado queda marcada y sale en orden al terminar", async () => {
    const { consola, enviar, vista, actos } = crearMontajeTui({ raiz: "/tmp/proyecto" });
    vista.mutar({ ocupado: true });
    enviar("segunda petición");
    expect(vista.ver().enCola).toEqual(["segunda petición"]);
    expect(actos()).not.toContainEqual({ tipo: "usuario", texto: "segunda petición" });

    const lector = consola.lineas[Symbol.asyncIterator]();
    await expect(lector.next()).resolves.toEqual({ value: "segunda petición", done: false });
    expect(vista.ver().enCola).toEqual([]);
    expect(actos()).toContainEqual({ tipo: "usuario", texto: "segunda petición" });
  });

  it("/salir durante un turno aborta de inmediato y adelanta la salida a la cola", async () => {
    const cancelar = vi.fn();
    const { consola, enviar, vista, alAbrirSesion } = crearMontajeTui({ raiz: "/tmp/proyecto" });
    alAbrirSesion({ cancelar } as unknown as SesionReal);
    vista.mutar({ ocupado: true, enCola: ["petición que ya esperaba"] });

    enviar("/salir");

    expect(cancelar).toHaveBeenCalledOnce();
    expect(vista.ver().enCola).toEqual([]);
    await expect(consola.lineas[Symbol.asyncIterator]().next()).resolves.toEqual({ value: "/salir", done: false });
  });

  it("inyecta el catálogo sin consultarlo al montar y solo lista al ejecutar /modelos", async () => {
    const listar = vi.fn<CatalogoModelosPort["listar"]>(async () => []);
    const catalogoModelos: CatalogoModelosPort = { listar };
    const montaje = crearConsolaTui({
      raiz: "/tmp/proyecto",
      catalogoModelos,
      guardarModeloGlobal: (_papel, id) => ({ ruta: "/tmp/config.json", id }),
    });

    expect(montaje.consola.catalogoModelos).toBe(catalogoModelos);
    expect(listar).not.toHaveBeenCalled();
    await montaje.consola.catalogoModelos.listar("ollama");
    expect(listar).toHaveBeenCalledWith("ollama");
  });

  it("/modelos usa selectores TUI y actualiza la sidebar al elegir trabajo", async () => {
    const catalogoModelos = new CatalogoModelosEnMemoria({
      ollama: [{ proveedor: "ollama", id: "qwen3", nombre: "Qwen 3" }],
    });
    const guardarModeloGlobal = vi.fn((_papel, id: string) => ({
      ruta: "/tmp/config.json",
      id,
    }));
    const montaje = crearConsolaTui({
      raiz: "/tmp/proyecto",
      catalogoModelos,
      guardarModeloGlobal,
    });
    expect(montaje.consola.catalogoModelos).toBe(catalogoModelos);

    const ejecucion = correrConsola(montaje.consola, {
      hilo: "tui-modelos",
      raiz: "/tmp/proyecto",
      fuentes: {},
    });
    montaje.enviar("/modelos ollama");
    await esperarSelector(montaje, "Modelos de ollama");
    expect(montaje.vista.ver().selector?.opciones).toEqual([
      expect.objectContaining({ id: "qwen3", etiqueta: "Qwen 3" }),
    ]);
    montaje.seleccionar("qwen3");
    await esperarSelector(montaje, "Asignar modelo a");
    montaje.seleccionar("trabajo");
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(guardarModeloGlobal).toHaveBeenCalledWith("trabajo", "ollama/qwen3");
    expect(montaje.datosSidebar().modelo).toBe("ollama/qwen3");
    montaje.enviar("/salir");
    await ejecucion;
  });
});
