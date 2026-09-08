// src/agent/tareasEnDisco.test.ts
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearTareasEnDisco } from "./tareasEnDisco.js";
import type { Tarea } from "../core/tareas.js";

/**
 * Gancho para simular, en UN solo test, que otro proceso escribe el cerrojo justo después de
 * que el nuestro gane su `wx` — el único punto donde una carrera de verdad puede colarse (ver
 * el test de la relectura de confirmación, más abajo). `node:fs` no se puede espiar
 * directamente (`vi.spyOn` falla con «Module namespace is not configurable in ESM»), así que
 * se envuelve con `vi.mock`; el valor mutable vive en `vi.hoisted` porque la factoría de abajo
 * se resuelve antes que el resto del módulo y necesita que ya exista. El resto de los tests
 * no lo tocan (queda `undefined`) y ven el comportamiento real de `node:fs` sin diferencia.
 */
const gancho = vi.hoisted(() => ({ trasEscribir: undefined as ((ruta: unknown) => void) | undefined }));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    writeFileSync: (...args: Parameters<typeof real.writeFileSync>) => {
      const resultado = real.writeFileSync(...args);
      gancho.trasEscribir?.(args[0]);
      return resultado;
    },
  };
});

const TAREA: Tarea = {
  id: "t1",
  proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
  titulo: "Arregla el login",
  peticion: "Arregla el login",
  encargo: "Arregla el login",
  adjuntos: [],
  estado: "nuevo",
  creada: "2026-09-08T10:00:00.000Z",
};

describe("tareasEnDisco", () => {
  let base: string;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "xonecode-tareas-"));
  });
  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
    gancho.trasEscribir = undefined;
  });

  it("escribe y lee el índice", () => {
    const disco = crearTareasEnDisco({ base });
    disco.guardar([TAREA]);
    expect(crearTareasEnDisco({ base }).listar()).toEqual([TAREA]);
  });

  it("sin índice todavía, la lista es VACÍA y no un error", () => {
    expect(crearTareasEnDisco({ base }).listar()).toEqual([]);
  });

  it("un índice corrupto no tumba la consola: se dice y se sigue con lista vacía", () => {
    // La misma postura que una línea corrupta del `.jsonl` de una sesión.
    mkdirSync(join(base, "tareas"), { recursive: true });
    writeFileSync(join(base, "tareas", "indice.json"), "{ esto no es json");
    const dichos: string[] = [];
    const disco = crearTareasEnDisco({ base, informar: (t) => dichos.push(t) });
    expect(disco.listar()).toEqual([]);
    expect(dichos.join(" ")).toMatch(/índice/i);
    // Y NO se sobrescribe solo: perder la cola de alguien por leerla mal sería peor.
    expect(readFileSync(join(base, "tareas", "indice.json"), "utf8")).toContain("esto no es json");
  });

  it("el cerrojo se concede una vez, y el segundo sabe de quién es", () => {
    const primero = crearTareasEnDisco({ base, pid: 100, vivo: () => true });
    expect(primero.tomarCerrojo()).toEqual({ tomado: true });
    const segundo = crearTareasEnDisco({ base, pid: 200, vivo: () => true });
    expect(segundo.tomarCerrojo()).toEqual({ tomado: false, dePid: 100 });
  });

  it("un cerrojo de un proceso MUERTO se recoge: si no, un cuelgue deja la cola parada para siempre", () => {
    crearTareasEnDisco({ base, pid: 100, vivo: () => true }).tomarCerrojo();
    const otro = crearTareasEnDisco({ base, pid: 200, vivo: (pid) => pid !== 100 });
    expect(otro.tomarCerrojo()).toEqual({ tomado: true });
  });

  it("un adjunto se guarda en la carpeta de SU tarea, y el nombre pasa la misma barrera que un artefacto", () => {
    const disco = crearTareasEnDisco({ base });
    expect(disco.guardarAdjunto("t1", "mockup.png", Buffer.from("x"))).toMatchObject({ ok: true });
    expect(existsSync(join(base, "tareas", "t1", "adjuntos", "mockup.png"))).toBe(true);
    for (const malo of ["../fuera.png", "sub/dentro.png", "", ".", "con espacio.png"]) {
      expect(disco.guardarAdjunto("t1", malo, Buffer.from("x")).ok, malo).toBe(false);
    }
  });

  it("los dos topes: por fichero y por tarea", () => {
    const disco = crearTareasEnDisco({ base, topeDeAdjunto: 10, topePorTarea: 15 });
    expect(disco.guardarAdjunto("t1", "a.bin", Buffer.alloc(11))).toMatchObject({ ok: false, motivo: expect.stringMatching(/grande/) });
    expect(disco.guardarAdjunto("t1", "b.bin", Buffer.alloc(8))).toMatchObject({ ok: true });
    expect(disco.guardarAdjunto("t1", "c.bin", Buffer.alloc(8))).toMatchObject({ ok: false, motivo: expect.stringMatching(/tarea/) });
  });

  it("borrar una tarea se lleva sus adjuntos: un secreto en un fichero que nadie va a ver sigue siendo un secreto", () => {
    const disco = crearTareasEnDisco({ base });
    disco.guardar([TAREA]);
    disco.guardarAdjunto("t1", "doc.pdf", Buffer.from("x"));
    disco.borrarTarea("t1");
    expect(existsSync(join(base, "tareas", "t1"))).toBe(false);
    expect(disco.listar()).toEqual([]);
  });

  it("ningún error lleva una ruta de la máquina", () => {
    const disco = crearTareasEnDisco({ base });
    const r = disco.guardarAdjunto("t1", "../fuera.png", Buffer.from("x"));
    expect(JSON.stringify(r)).not.toContain(base);
  });

  it("borrar una tarea con el índice CORRUPTO no lo toca: se avisa, pero no se sobrescribe lo que no se entiende", () => {
    mkdirSync(join(base, "tareas"), { recursive: true });
    writeFileSync(join(base, "tareas", "indice.json"), "{ esto no es json");
    const dichos: string[] = [];
    const disco = crearTareasEnDisco({ base, informar: (t) => dichos.push(t) });
    disco.borrarTarea("t1");
    // La carpeta de adjuntos de "t1" sí se intenta borrar (siempre es seguro); el índice no.
    expect(readFileSync(join(base, "tareas", "indice.json"), "utf8")).toBe("{ esto no es json");
    expect(dichos.join(" ")).toMatch(/índice/i);
  });

  it("un índice válido pero que no es una lista se trata como ilegible: avisa y no se sobrescribe", () => {
    mkdirSync(join(base, "tareas"), { recursive: true });
    writeFileSync(join(base, "tareas", "indice.json"), "{}");
    const dichos: string[] = [];
    const disco = crearTareasEnDisco({ base, informar: (t) => dichos.push(t) });
    expect(disco.listar()).toEqual([]);
    expect(dichos.join(" ")).toMatch(/índice/i);
    // Ni `listar` ni el `borrarTarea` que sigue tocan un índice que no se entiende.
    disco.borrarTarea("t1");
    expect(readFileSync(join(base, "tareas", "indice.json"), "utf8")).toBe("{}");
  });

  it("dos instancias SECUENCIALES no consiguen las dos el cerrojo: la segunda encuentra el fichero que dejó la primera", () => {
    const primero = crearTareasEnDisco({ base, pid: 100, vivo: () => true });
    const segundo = crearTareasEnDisco({ base, pid: 200, vivo: () => true });
    // Esta secuencia por sí sola NO demuestra atomicidad frente a una concurrencia de
    // verdad — dos llamadas seguidas en el mismo hilo son indistinguibles de un
    // `existsSync` + escritura si nadie se cuela entre medias, y aquí nadie lo hace. Lo que
    // de verdad hace atómica la toma es el `flag: "wx"` del sistema de ficheros al escribir
    // (falla con `EEXIST` si el fichero ya existe), que este test no puede provocar sin
    // dos procesos —o dos hilos— reales. Lo que SÍ prueba esta secuencia es el resultado
    // correcto del camino normal: quien llega después de que el primero ya tiene el
    // cerrojo lee su pid y no el suyo.
    expect(primero.tomarCerrojo()).toEqual({ tomado: true });
    expect(segundo.tomarCerrojo()).toEqual({ tomado: false, dePid: 100 });
    // Y soltar el propio deja hueco para el siguiente.
    primero.soltarCerrojo();
    expect(segundo.tomarCerrojo()).toEqual({ tomado: true });
  });

  it("la relectura de confirmación cierra la carrera del cerrojo MUERTO: quien gana el wx pero lo pierde después no se cree dueño", () => {
    // La secuencia real que esto cierra: A ve al dueño muerto y lo borra; B ve al mismo
    // dueño muerto y también lo borra; A crea el suyo con `wx` y gana; y entonces B —que ya
    // había decidido reclamar y solo le faltaba ejecutarlo— borra el fichero que A ACABA de
    // crear y crea el suyo encima. Los dos `wx` tienen éxito EN SU PROPIO PROCESO, y sin la
    // relectura los dos se creerían dueños.
    //
    // Aquí no hay dos procesos de verdad: se usa el gancho de `writeFileSync` (arriba del
    // fichero) para que, justo cuando "A" gana el `wx` de la recogida, "B" se cuele y lo
    // pise ANTES de que A vuelva a leer para confirmar.
    const rutaCerrojo = join(base, "tareas", "corredor.lock");
    mkdirSync(join(base, "tareas"), { recursive: true });
    // Un cerrojo de un pid muerto ya en disco: es el que A (pid 100) va a recoger.
    writeFileSync(rutaCerrojo, `${JSON.stringify({ pid: 999 })}\n`);

    let vecesEscritoElCerrojo = 0;
    gancho.trasEscribir = (ruta) => {
      if (ruta !== rutaCerrojo) return;
      vecesEscritoElCerrojo++;
      // La 1ª vez que se dispara aquí es la escritura de A recogiendo el cerrojo muerto (su
      // primer intento falló por EEXIST y ni siquiera dispara el gancho, porque el `throw`
      // ocurre dentro de la propia escritura real, antes de llegar a esta línea). En cuanto
      // esa recogida tiene éxito, "B" se cuela y escribe el suyo encima, ANTES de que A relea
      // para confirmar.
      if (vecesEscritoElCerrojo === 1) {
        writeFileSync(rutaCerrojo, `${JSON.stringify({ pid: 777 })}\n`);
      }
    };

    const a = crearTareasEnDisco({ base, pid: 100, vivo: () => false });
    expect(a.tomarCerrojo()).toEqual({ tomado: false, dePid: 777 });
    // Y el fichero en disco es el de "B": A no lo tocó después de perder la carrera.
    expect(JSON.parse(readFileSync(rutaCerrojo, "utf8"))).toMatchObject({ pid: 777 });
  });

  it.skipIf(process.platform === "win32")(
    "el índice, el cerrojo y un adjunto se escriben en 0600: llevan el encargo y los documentos de una persona",
    () => {
      const disco = crearTareasEnDisco({ base });
      disco.guardar([TAREA]);
      disco.tomarCerrojo();
      disco.guardarAdjunto("t1", "doc.pdf", Buffer.from("x"));
      const modo = (ruta: string) => statSync(ruta).mode & 0o777;
      expect(modo(join(base, "tareas", "indice.json"))).toBe(0o600);
      expect(modo(join(base, "tareas", "corredor.lock"))).toBe(0o600);
      expect(modo(join(base, "tareas", "t1", "adjuntos", "doc.pdf"))).toBe(0o600);
    }
  );
});
