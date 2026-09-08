// src/agent/tareasEnDisco.test.ts
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync, renameSync, statSync } from "node:fs";
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

  it("otro proceso gana la RECOGIDA del cerrojo muerto: el renombrar que falla con ENOENT no nos deja creernos dueños", () => {
    // El orden que la relectura por sí sola no cerraba: A ve al mismo dueño muerto (pid 999)
    // y va a recogerlo con `renameSync`; pero justo en ese instante OTRO proceso ya completó
    // su propia recogida entera —su `rename` + su `wx`— y escribió su cerrojo. Apartar un
    // inodo (renombrarlo) lo consigue un SOLO proceso: el `rename` de A llega tarde y recibe
    // `ENOENT`, porque el fichero de origen ya no está donde A lo vio.
    //
    // Aquí no hay dos procesos de verdad: se inyecta `renombrar` —el parámetro que existe
    // justo para esto, con `renameSync` real por omisión— con un doble que representa la
    // situación completa: deja escrito el cerrojo del "ganador" (como si su `rename`+`wx` ya
    // hubieran corrido) y lanza `ENOENT`, en vez de renombrar nada de verdad.
    mkdirSync(join(base, "tareas"), { recursive: true });
    const rutaCerrojo = join(base, "tareas", "corredor.lock");
    writeFileSync(rutaCerrojo, `${JSON.stringify({ pid: 999 })}\n`);

    const renombrarQueOtroGana = (): never => {
      writeFileSync(rutaCerrojo, `${JSON.stringify({ pid: 555 })}\n`);
      const error = new Error("simulado: otro proceso ganó la recogida") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    };

    const disco = crearTareasEnDisco({ base, pid: 100, vivo: () => false, renombrar: renombrarQueOtroGana });
    expect(disco.tomarCerrojo()).toEqual({ tomado: false, dePid: 555 });
    // Y el fichero en disco sigue siendo el del ganador: nosotros no lo tocamos.
    expect(JSON.parse(readFileSync(rutaCerrojo, "utf8"))).toMatchObject({ pid: 555 });
  });

  it("B no se lleva por delante el cerrojo VIVO de A: la restitución con link lo devuelve tal cual estaba", () => {
    // El orden que ni el `rename` ni la relectura, por separado, cerraban (medido antes con
    // un script de fuera de la suite; aquí como test de verdad): A y B ven los dos al mismo
    // dueño muerto (pid 999). B ya ha decidido apartarlo y llama a `renombrar`; justo en ese
    // instante, A completa su PROPIA recogida entera — de verdad, con `renameSync` — y deja
    // su cerrojo VIVO escrito en la ruta. B, con su decisión ya tomada sobre una foto vieja,
    // aparta lo que haya AHORA: se lleva el cerrojo de A, no el de 999. `rename` arbitra
    // quién aparta un inodo dado, no si ese inodo se podía apartar — por eso el `rename` de
    // B tiene éxito igual. Lo que lo cierra es la lectura AUTORITATIVA de después: B lee el
    // `.caduco` que acaba de crear, ve el pid de A (vivo, no el suyo) y lo restituye con
    // `linkSync` antes de decir que no lo tomó.
    mkdirSync(join(base, "tareas"), { recursive: true });
    const rutaCerrojo = join(base, "tareas", "corredor.lock");
    writeFileSync(rutaCerrojo, `${JSON.stringify({ pid: 999 })}\n`);

    const a = crearTareasEnDisco({ base, pid: 100, vivo: () => false });

    const renombrarDeB = (origen: string, destino: string): void => {
      // A completa su recogida ENTERA (rename real + wx + confirmar + limpieza) justo
      // cuando B, que ya había leído al mismo dueño muerto, ejecuta su propio `renombrar`.
      a.tomarCerrojo();
      // Y ahora sigue el `rename` de B de verdad: la ruta de origen ya no tiene al 999 que B
      // vio, tiene el cerrojo VIVO que A acaba de escribir — y `rename` no lo sabe ni le
      // importa, así que tiene éxito igual.
      renameSync(origen, destino);
    };

    // Para B, 999 está muerto (lo que vio) y CUALQUIER OTRO pid está vivo — en particular el
    // de A, que es lo que hace falta para que la restitución dispare.
    const b = crearTareasEnDisco({ base, pid: 200, vivo: (p) => p !== 999, renombrar: renombrarDeB });
    const deB = b.tomarCerrojo();

    // Las DOS mitades del aserto importan: que B no se crea dueño, y que el cerrojo de A
    // sigue siendo de A. Sin la segunda, «B no lo tomó» se cumpliría igual habiéndose
    // llevado el cerrojo de A por delante sin devolverlo — que es peor que la carrera
    // original, no mejor.
    expect(deB).toEqual({ tomado: false, dePid: 100 });
    expect(JSON.parse(readFileSync(rutaCerrojo, "utf8"))).toMatchObject({ pid: 100 });
  });

  it("la limpieza de A no se lleva su PROPIO cerrojo: la cuarentena es por proceso", () => {
    // El tercer orden, y el que ni el `rename` ni la restitución cerraban: la cuarentena era
    // una ruta COMPARTIDA (`corredor.lock.caduco` a secas), y POSIX `rename` reemplaza el
    // destino sin chistar. Con B ya decidido a recoger sobre una foto vieja:
    //   1. A recoge entero: `rename` del muerto a la cuarentena, `wx`, confirma.
    //   2. el `rename` de B mete el cerrojo VIVO de A en esa MISMA ruta compartida.
    //   3. la limpieza de A borra la cuarentena — que ya no es el muerto, es el cerrojo de A.
    //   4. B lee su cuarentena, no encuentra nada, da la recogida por legítima y se lo queda.
    // A devolvía `{tomado:true}` sin fichero en disco y B se lo llevaba: dos dueños.
    //
    // Ese orden exige que la limpieza de A caiga DESPUÉS del `rename` de B, así que los dos
    // dobles se anidan: el `renombrar` de B corre a A entero, y la costura `borrar` de A
    // —el único punto entre su confirmación y su limpieza— es la que deja pasar el `rename`
    // de verdad de B. Comprobado que distingue: con la cuarentena compartida, este test sale
    // rojo por las dos mitades.
    mkdirSync(join(base, "tareas"), { recursive: true });
    const rutaCerrojo = join(base, "tareas", "corredor.lock");
    writeFileSync(rutaCerrojo, `${JSON.stringify({ pid: 999 })}\n`);

    let renameDeB: (() => void) | undefined;
    const borrarDeA = (ruta: string): void => {
      renameDeB?.();
      renameDeB = undefined;
      rmSync(ruta, { force: true });
    };
    const a = crearTareasEnDisco({ base, pid: 100, vivo: () => false, borrar: borrarDeA });

    let deA: { tomado: boolean } | undefined;
    const renombrarDeB = (origen: string, destino: string): void => {
      renameDeB = () => renameSync(origen, destino);
      deA = a.tomarCerrojo();
    };

    // Para B, 999 está muerto (la foto que leyó) y cualquier otro pid está vivo — en
    // particular el 100 de A, que es lo que hace disparar la restitución.
    const b = crearTareasEnDisco({ base, pid: 200, vivo: (p) => p !== 999, renombrar: renombrarDeB });
    const deB = b.tomarCerrojo();

    // A tomó el cerrojo y sigue siendo suyo EN DISCO: ni su propia limpieza ni el `rename`
    // de B se lo llevaron. Y B no se lo quedó.
    expect(deA).toEqual({ tomado: true });
    expect(JSON.parse(readFileSync(rutaCerrojo, "utf8"))).toMatchObject({ pid: 100 });
    expect(deB).toEqual({ tomado: false, dePid: 100 });
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
