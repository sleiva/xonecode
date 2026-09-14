import { describe, it, expect } from "vitest";
import {
  esDoble,
  McpVacio,
  SkillsEnMemoria,
  ModeloGuionizado,
  StubVerifier,
  VerifierGuionizado,
  CatalogoModelosEnMemoria,
  AumentadorGuionizado,
  consumoDeLaSesion,
  consumoPersistible,
  type McpPort,
  type VerifierPort,
} from "./ports.js";

describe("la marca de doble", () => {
  it("todos los dobles la llevan", () => {
    expect(esDoble(new McpVacio())).toBe(true);
    expect(esDoble(new SkillsEnMemoria())).toBe(true);
    expect(esDoble(new ModeloGuionizado())).toBe(true);
    expect(esDoble(new StubVerifier())).toBe(true);
    expect(esDoble(new VerifierGuionizado([]))).toBe(true);
    expect(esDoble(new AumentadorGuionizado())).toBe(true);
  });

  it("una implementación real NO la lleva, y no puede fingirla con un campo", () => {
    // Lo que hace que el mecanismo sea honesto: alguien que escriba un puerto real y le
    // ponga un campo `esStub: false` (o `true`) no cambia nada — la marca es un Symbol.
    const real: VerifierPort & { esStub?: boolean } = {
      esStub: false,
      async verificar() {
        return { verde: false, hallazgos: [] };
      },
    };
    expect(esDoble(real)).toBe(false);
  });

  it("no confunde null ni un primitivo con un puerto", () => {
    expect(esDoble(null)).toBe(false);
    expect(esDoble(undefined)).toBe(false);
    expect(esDoble("StubVerifier")).toBe(false);
    expect(esDoble(42)).toBe(false);
  });
});

describe("McpVacio", () => {
  it("publica un catálogo vacío en vez de fingir tools", async () => {
    const c = await new McpVacio().catalogo();
    expect(c.cloudstudio).toEqual([]);
    expect(c.ide).toEqual([]);
  });

  it("al invocar una tool falla diciendo que NO se ha tocado el proyecto", async () => {
    // Importa el TEXTO: un doble que falla con "not implemented" deja al modelo
    // interpretando si el cambio se aplicó o no.
    const mcp: McpPort = new McpVacio();
    await expect(mcp.invocar("studio_edit_file", {})).rejects.toThrow(/NO se ha tocado/);
    await expect(mcp.invocar("studio_edit_file", {})).rejects.toThrow(/studio_edit_file/);
  });
});

describe("CatalogoModelosEnMemoria", () => {
  it("el catálogo en memoria conserva proveedor, id y contexto", async () => {
    const catalogo = new CatalogoModelosEnMemoria({
      openai: [{ proveedor: "openai", id: "gpt-test", nombre: "GPT Test", contexto: 128000 }],
    });
    expect(esDoble(catalogo)).toBe(true);
    await expect(catalogo.listar("openai")).resolves.toEqual([
      { proveedor: "openai", id: "gpt-test", nombre: "GPT Test", contexto: 128000 },
    ]);
    await expect(catalogo.listar("ollama")).resolves.toEqual([]);
  });
});

describe("VerifierGuionizado", () => {
  it("recorre el guion y se queda en el último", async () => {
    const rojo = { verde: false, hallazgos: [] };
    const verde = { verde: true, hallazgos: [] };
    const v = new VerifierGuionizado([rojo, rojo, verde]);
    expect((await v.verificar()).verde).toBe(false);
    expect((await v.verificar()).verde).toBe(false);
    expect((await v.verificar()).verde).toBe(true);
    expect((await v.verificar()).verde).toBe(true);
  });
});

describe("AumentadorGuionizado", () => {
  const PETICION = {
    texto: "Arregla el login",
    proyecto: { nombre: "AppDemo", raiz: "/w/AppDemo" },
    adjuntos: [],
  };

  it("se DICE que es de pega en el propio encargo", async () => {
    // La misma disciplina que `McpVacio` y `SkillsEnMemoria`: un doble que produce texto que
    // una persona va a leer —y que además se le manda al agente— tiene que decir que no lo
    // escribió ningún modelo. Aquí el precio de callarlo es alto: el encargo se enseña en la
    // ventana para editarlo, así que sin la marca parecería una redacción de verdad.
    const encargo = await new AumentadorGuionizado().augmentar(PETICION);
    expect(encargo).toContain("[DOBLE]");
    expect(encargo).toContain("Arregla el login");
  });

  it("la plantilla entra por parámetro: un test no necesita la marca de por medio", async () => {
    const a = new AumentadorGuionizado((t) => `ENCARGO: ${t}`);
    expect(await a.augmentar(PETICION)).toBe("ENCARGO: Arregla el login");
  });
});

/**
 * Los dos traductores entre «lo que el ejecutor cuenta» y «lo que el acto guarda».
 *
 * Son una función cada uno y no un par de spreads en línea porque el viaje es de IDA y
 * VUELTA: la piel lee el consumo vivo por uno, y lo releído del `.jsonl` vuelve por el otro.
 * En línea, cada sitio elegiría un nombre distinto para la misma cosa —el de la piel es
 * `contexto` y el del acto es `ventana`— y un desajuste ahí no rompe nada: pinta un
 * denominador que falta o un porcentaje sobre nada.
 */
describe("el consumo va y vuelve entre las dos formas", () => {
  const porCuenta = {
    modelo: { entrada: 700, salida: 30, cache: 40 },
    externo: { entrada: 7, salida: 3, cache: 0 },
    contexto: 3000,
  };

  it("ida y vuelta devuelve lo mismo, con las dos cuentas separadas", () => {
    expect(consumoDeLaSesion(consumoPersistible(porCuenta))).toEqual(porCuenta);
  });

  it("los nombres cambian: `contexto` en la sesión, `ventana` en el acto", () => {
    // El nombre que se lee en pantalla es «cuánto ocupa el historial AHORA»; el que viaja en
    // el acto es el de la medición. Que sean dos es deliberado, y por eso el traductor existe.
    expect(consumoPersistible(porCuenta).ventana).toBe(3000);
    expect("contexto" in consumoPersistible(porCuenta)).toBe(false);
  });

  it("sin contexto medido, cero NO es un nivel: el acto sale sin `ventana`", () => {
    // `ConsumoDeSesionPorCuenta.contexto` es un número —así lo declara el ejecutor—, pero un
    // cero ahí significa «no se midió»: un historial con turnos dentro nunca ocupa nada.
    // Estamparlo afirmaría lo contrario y, peor, borraría el nivel del turno anterior —
    // `consumoDeLosActos` se queda con la última ventana que CONSTA, cero incluido.
    const sinMedir = { ...porCuenta, contexto: 0 };
    expect("ventana" in consumoPersistible(sinMedir)).toBe(false);
    // Y al volver, un acto sin `ventana` cae otra vez en cero, que es su «no consta» en este
    // lado: quien pinta distingue los dos casos por el `> 0` de siempre.
    const sinVentana = { modelo: { entrada: 1, salida: 1, cache: 0 }, externo: { entrada: 0, salida: 0, cache: 0 } };
    expect(consumoDeLaSesion(sinVentana).contexto).toBe(0);
  });

  it("lo que sale es una COPIA: el acto que va al `.jsonl` no comparte objeto con el tracker", () => {
    // El tracker vivo mutaría el acto ya escrito, y el total de la conversación cambiaría
    // solo con seguir trabajando — sin que nadie escriba nada.
    const acto = consumoPersistible(porCuenta);
    acto.modelo.entrada = 9;
    acto.externo.salida = 9;
    expect(porCuenta.modelo.entrada).toBe(700);
    expect(porCuenta.externo.salida).toBe(3);
  });
});
