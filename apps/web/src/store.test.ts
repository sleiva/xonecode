import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";
import { crearStoreDelCliente } from "./store.js";

describe("store del cliente", () => {
  it("un acto se anexa", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } });
    expect(s.leer().actos).toHaveLength(1);
  });

  it("una reemisión SUSTITUYE el transcript: es lo que hace idempotente reconectar", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } });
    const lote = [{ tipo: "usuario", texto: "hola" }, { tipo: "asistente", texto: "qué tal" }] as const;
    s.aplicar({ clase: "reemision", actos: [...lote] });
    s.aplicar({ clase: "reemision", actos: [...lote] });
    expect(s.leer().actos).toHaveLength(2);
  });

  it("desconectado se refleja en el estado, para poder deshabilitar el compositor", () => {
    const s = crearStoreDelCliente();
    s.marcarDesconectado();
    expect(s.leer().conectado).toBe(false);
    s.marcarConectado();
    expect(s.leer().conectado).toBe(true);
  });

  it("no importa React: es estado, no presentación", async () => {
    // `new URL("./store.ts", import.meta.url)` —la forma del brief— es el patrón que el
    // plugin de Vite para assets reescribe en el entorno jsdom del proyecto «cliente»
    // (ver el comentario de `tipos.test.ts`); `fileURLToPath` lo esquiva.
    const aqui = dirname(fileURLToPath(import.meta.url));
    const fuente = await import("node:fs").then((fs) =>
      fs.readFileSync(join(aqui, "store.ts"), "utf8"));
    expect(fuente).not.toMatch(/from ["']react["']/);
  });

  it("una sustitución reemplaza el ÚLTIMO acto, no lo anexa: dos líneas para una racha es el bug que evita", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "acto", acto: { tipo: "herramientas", lineas: ["→ lee src/app.xne"] } });
    s.aplicar({ clase: "sustitucion", acto: { tipo: "herramientas", lineas: ["→ lee ×3 — a, b, c"] } });
    expect(s.leer().actos).toHaveLength(1);
    expect(s.leer().actos[0]).toEqual({ tipo: "herramientas", lineas: ["→ lee ×3 — a, b, c"] });
  });

  it("una sustitución sobre un transcript vacío cae a anexar, no lanza: F2 de la revisión — antes solo lo razonaba un comentario", () => {
    const s = crearStoreDelCliente();
    // El servidor nunca manda `sustitucion` sin un último acto que sustituir
    // (`transporte.ts`): esto es solo la red bajo un mensaje del que ya no se fía nada.
    s.aplicar({ clase: "sustitucion", acto: { tipo: "asistente", texto: "huérfano" } });
    expect(s.leer().actos).toEqual([{ tipo: "asistente", texto: "huérfano" }]);
  });

  it("un mensaje malformado no lanza y no muta el estado", () => {
    const s = crearStoreDelCliente();
    expect(() => s.aplicar(null)).not.toThrow();
    expect(() => s.aplicar("texto suelto")).not.toThrow();
    expect(() => s.aplicar({ clase: "acto", acto: { tipo: "fantasma" } })).not.toThrow();
    expect(() => s.aplicar({ clase: "reemision", actos: "no es una lista" })).not.toThrow();
    expect(s.leer().actos).toHaveLength(0);
  });

  it("marcarDesconectado limpia los apartados de espera: el servidor ya los resolvió al caer el SSE", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "pregunta", texto: "¿nombre?" });
    s.aplicar({ clase: "selector", selector: { titulo: "elige", opciones: [{ id: "a", etiqueta: "A" }] } });
    s.aplicar({ clase: "secreto", pregunta: "clave" });
    s.aplicar({ clase: "aprobacion", pendientes: [], ficheros: {}, diffs: {} });
    s.marcarDesconectado();
    const estado = s.leer();
    expect(estado.pregunta).toBeUndefined();
    expect(estado.selector).toBeUndefined();
    expect(estado.secreto).toBeUndefined();
    expect(estado.aprobacion).toBeUndefined();
  });

  it("contestarPregunta y cerrarAprobacion retiran solo lo suyo: el servidor no manda ningún «ya está»", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "pregunta", texto: "¿nombre?" });
    s.aplicar({ clase: "aprobacion", pendientes: [], ficheros: {}, diffs: {} });
    s.contestarPregunta();
    expect(s.leer().pregunta).toBeUndefined();
    // La aprobación sigue: contestar una pregunta no zanja lo otro que estuviera esperando.
    expect(s.leer().aprobacion).toBeDefined();
    s.cerrarAprobacion();
    expect(s.leer().aprobacion).toBeUndefined();
  });

  it("el secreto y el selector también se retiran uno a uno", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "secreto", pregunta: "clave" });
    s.aplicar({ clase: "selector", selector: { titulo: "elige", opciones: [{ id: "a", etiqueta: "A" }] } });
    s.contestarSecreto();
    expect(s.leer().secreto).toBeUndefined();
    expect(s.leer().selector).toBeDefined();
    s.contestarSelector();
    expect(s.leer().selector).toBeUndefined();
  });

  it("las cuatro avisan a los suscriptores: si no, lo contestado se quedaría pintado", () => {
    const s = crearStoreDelCliente();
    let avisos = 0;
    s.suscribir(() => { avisos += 1; });
    s.contestarPregunta();
    s.contestarSecreto();
    s.contestarSelector();
    s.cerrarAprobacion();
    expect(avisos).toBe(4);
  });

  it("el registro de comandos llega entero y sobrevive a la desconexión: es un catálogo, no una espera", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "comandos", comandos: [{ nombre: "/sync", descripcion: "sincroniza" }] });
    expect(s.leer().comandos).toEqual([{ nombre: "/sync", descripcion: "sincroniza" }]);
    s.marcarDesconectado();
    expect(s.leer().comandos).toEqual([{ nombre: "/sync", descripcion: "sincroniza" }]);
    expect(() => s.aplicar({ clase: "comandos", comandos: [{ nombre: "/sync" }] })).not.toThrow();
    expect(s.leer().comandos).toEqual([{ nombre: "/sync", descripcion: "sincroniza" }]);
  });

  it("suscribir avisa de cada mutación y la baja para de avisar, tolerante a doble baja", () => {
    const s = crearStoreDelCliente();
    let avisos = 0;
    const baja = s.suscribir(() => { avisos += 1; });
    s.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } });
    expect(avisos).toBe(1);
    baja();
    baja();
    s.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "de nuevo" } });
    expect(avisos).toBe(1);
  });
});
