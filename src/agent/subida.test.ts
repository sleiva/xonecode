import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CloudStudioEnMemoria, type CloudStudioPort } from "../core/ports.js";
import { prepararRepo, cambiosPendientes, REMOTO } from "./gitSync.js";
import { rutaSyncJson } from "./descarga.js";
import { subir, rutaSyncLog } from "./subida.js";

async function proyectoConCambios() {
  const raiz = mkdtempSync(join(tmpdir(), "xc-sub-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>");
  await prepararRepo(raiz, "master");
  writeFileSync(join(raiz, "app.xml"), "<app cambiada/>");
  execFileSync("git", ["add", "-A"], { cwd: raiz });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "cambio"], { cwd: raiz });
  return raiz;
}

const git = (raiz: string, ...a: string[]) =>
  execFileSync("git", a, { cwd: raiz, encoding: "utf8" }).trim();

/**
 * `{ ...base, escribirTexto: ... }` NO sirve (medido, igual que en `descarga.test.ts`):
 * los métodos de `CloudStudioEnMemoria` viven en el PROTOTIPO y el spread de un objeto
 * solo copia sus propiedades PROPIAS — el resultado pierde `abrir`, `contexto`, etc. y
 * revienta con «is not a function». `Object.create` conserva la cadena de prototipos.
 */
function conEscrituraDeTextoQueFalla(base: CloudStudioEnMemoria): CloudStudioEnMemoria {
  const prototipo = Object.getPrototypeOf(base) as CloudStudioEnMemoria;
  const puerto: CloudStudioEnMemoria = Object.assign(Object.create(prototipo), base);
  puerto.escribirTexto = async () => { throw new Error("503"); };
  return puerto;
}

/**
 * Falla justo al posicionar la rama de TRABAJO (`cambiarRama(ramaTrabajo)`), no al
 * restaurar la de origen — por eso comprueba el NOMBRE y solo intercepta esa llamada,
 * delegando la del `finally` (con la rama de origen) en el método original.
 *
 * El punto fino: el doble ya mueve `ramaActual` a `ramaTrabajo` dentro de `crearRama`
 * (que no se toca aquí y corre antes, sin fallar), así que en el momento del throw la
 * rama activa YA es la de trabajo. Si el `finally` de `subir()` desapareciera, esta
 * función se quedaría con `ramaActual` en `ramaTrabajo` — que es justo lo que el test
 * comprueba que NO pasa.
 */
function conCambioARamaDeTrabajoQueFalla(
  base: CloudStudioEnMemoria, ramaTrabajo: string
): CloudStudioEnMemoria {
  const prototipo = Object.getPrototypeOf(base) as CloudStudioEnMemoria;
  const puerto: CloudStudioEnMemoria = Object.assign(Object.create(prototipo), base);
  const original = prototipo.cambiarRama.bind(puerto);
  puerto.cambiarRama = async (nombre: string) => {
    if (nombre === ramaTrabajo) throw new Error("no se pudo posicionar la rama de trabajo");
    return original(nombre);
  };
  return puerto;
}

/**
 * Mismo patrón (`Object.create`) para instrumentar `escribirTexto` y `crearRama` sin
 * perder el resto de la clase: registra en QUÉ rama estaba el puerto al escribir cada
 * fichero, y con qué argumentos se llamó a `crearRama`, delegando siempre en el método
 * ORIGINAL ligado al envoltorio (`prototipo.x.bind(puerto)`, no a `base`) para que el
 * estado (`ramaActual`, `escrituras`) quede donde `subir()` lo puede leer después.
 */
function conRamaInstrumentada(base: CloudStudioEnMemoria) {
  // Tipado como `CloudStudioPort` (la interfaz, con `crearRama(nombre, desde)` de DOS
  // argumentos) y no como `CloudStudioEnMemoria`: la clase implementa `crearRama` con un
  // solo parámetro formal (le basta con el nombre), y TS no deja asignarle luego una
  // función de dos.
  const prototipo = Object.getPrototypeOf(base) as CloudStudioPort;
  const puerto = Object.assign(Object.create(prototipo), base) as CloudStudioPort;
  const ramasAlEscribir: string[] = [];
  const llamadasCrearRama: Array<[string, string]> = [];
  const escribirOriginal = prototipo.escribirTexto.bind(puerto);
  const crearRamaOriginal = prototipo.crearRama.bind(puerto);
  puerto.escribirTexto = async (ruta: string, contenido: string) => {
    ramasAlEscribir.push((await puerto.contexto()).rama);
    return escribirOriginal(ruta, contenido);
  };
  puerto.crearRama = async (nombre: string, desde: string) => {
    llamadasCrearRama.push([nombre, desde]);
    return crearRamaOriginal(nombre, desde);
  };
  return { puerto, ramasAlEscribir, llamadasCrearRama };
}

describe("subir", () => {
  it("posiciona la rama de trabajo y devuelve la que estaba", async () => {
    const raiz = await proyectoConCambios();
    const base = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await base.abrir("AppForTest");
    const { puerto, ramasAlEscribir, llamadasCrearRama } = conRamaInstrumentada(base);

    const informe = await subir({
      puerto, raiz, ramaOrigen: "master", ramaTrabajo: "xonecode/sergio",
      proyecto: { id: "96fe", nombre: "AppForTest" },
    });

    expect(informe.ok).toEqual(["app.xml"]);
    // AC1: get_context → cambiarRama(trabajo) → operar → cambiarRama(la que estaba).
    expect(ramasAlEscribir).toEqual(["xonecode/sergio"]);
    expect((await puerto.contexto()).rama).toBe("master");
    // AC2: la rama de trabajo se crea, y con la rama origen como base.
    expect(llamadasCrearRama).toEqual([["xonecode/sergio", "master"]]);
  });

  it("no crea la rama de trabajo si el servidor ya la tiene", async () => {
    const raiz = await proyectoConCambios();
    const base = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await base.abrir("AppForTest");
    const { puerto, llamadasCrearRama } = conRamaInstrumentada(base);
    // El doble solo recuerda UNA rama activa (`ramaActual`); para simular que el
    // servidor ya tiene "t" (sin haberla creado en esta sesión) hace falta forzar la
    // respuesta de `ramas()` — si no, no hay forma de distinguir "ya existe" de "recién
    // creada" y la creación perezosa quedaría sin cubrir.
    puerto.ramas = async () => ["master", "t"];

    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" } });

    expect(llamadasCrearRama).toEqual([]);
  });

  it("con todo bien, la ref se mueve y no queda nada pendiente", async () => {
    const raiz = await proyectoConCambios();
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");
    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" } });

    expect(await cambiosPendientes(raiz, "master")).toEqual([]);
    expect(git(raiz, "reflog", "show", `${REMOTO}/master`)).toContain("sync:");
  });

  it("con un fallo a mitad, la ref NO se mueve", async () => {
    const raiz = await proyectoConCambios();
    const base = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await base.abrir("AppForTest");
    const puerto = conEscrituraDeTextoQueFalla(base);

    const informe = await subir({
      puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t",
      proyecto: { id: "1", nombre: "AppForTest" },
    });

    expect(informe.fallos).toHaveLength(1);
    expect(await cambiosPendientes(raiz, "master")).toHaveLength(1);
    // AC1 también en el camino de fallo: la rama activa del servidor se restaura pase
    // lo que pase, porque `switch` le mueve el suelo a quien tenga Studio abierto.
    expect((await puerto.contexto()).rama).toBe("master");
  });

  it("con un fallo posicionando la rama, restaura, registra y rechaza", async () => {
    // A diferencia del test anterior (un FICHERO falla, y lo atrapa el try/catch
    // interno del bucle), aquí falla POSICIONAR la rama, antes de llegar al plan: ese
    // fallo escapa al try/catch exterior, y es el camino para el que existe el
    // `finally` que restaura la rama. Un mutante que lo quite pasa el resto de tests de
    // este fichero sin problema — solo este lo detecta.
    const raiz = await proyectoConCambios();
    const base = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await base.abrir("AppForTest");
    const puerto = conCambioARamaDeTrabajoQueFalla(base, "t");

    await expect(subir({
      puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t",
      proyecto: { id: "1", nombre: "AppForTest" },
    })).rejects.toThrow("no se pudo posicionar la rama de trabajo");

    // (a) subir() rechaza — comprobado arriba.
    // (b) la rama activa del servidor sigue siendo la que estaba.
    expect((await puerto.contexto()).rama).toBe("master");
    // (c) el intento queda registrado en sync.log: un fallo de red o de servidor —la
    // clase para la que existe el log— no puede dejar el JSONL sin rastro.
    const lineas = readFileSync(rutaSyncLog(raiz), "utf8").trim().split("\n");
    const ultima = JSON.parse(lineas[lineas.length - 1]!);
    expect(ultima.dir).toBe("subida");
    expect(ultima.error).toContain("no se pudo posicionar la rama de trabajo");
  });

  it("deja el registro en JSONL, añadiendo", async () => {
    const raiz = await proyectoConCambios();
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");
    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" } });
    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" } });

    const lineas = readFileSync(rutaSyncLog(raiz), "utf8").trim().split("\n");
    expect(lineas).toHaveLength(2);
    expect(JSON.parse(lineas[0]!).dir).toBe("subida");
  });

  it("no sube nada de .xonecode aunque esté commiteado", async () => {
    const raiz = await proyectoConCambios();
    // Forzamos su presencia en el diff saltándonos el exclude.
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "memoria.md"), "# m");
    execFileSync("git", ["add", "-f", ".xonecode/memoria.md"], { cwd: raiz });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "memoria"], { cwd: raiz });

    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");
    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" } });

    expect(puerto.escrituras.some((e) => e.ruta.startsWith(".xonecode"))).toBe(false);
    expect(existsSync(rutaSyncLog(raiz))).toBe(true);
  });

  /**
   * Un proyecto con un `sync.json` DE VERDAD (el que escribiría `descargarProyecto`) y
   * un fichero borrado en local: `viejo.js` decide si `subir()` deja pasar ese borrado
   * según si estaba, o no, en `descargados`. Ningún test anterior de este fichero corre
   * con un `sync.json` en disco, así que el candado —el código de mayor consecuencia de
   * todo el plan— nunca se había visto fluir entero por `subir()`.
   */
  async function proyectoConBorrado(descargado: boolean) {
    const raiz = mkdtempSync(join(tmpdir(), "xc-sub-"));
    writeFileSync(join(raiz, "app.xml"), "<app/>");
    writeFileSync(join(raiz, "viejo.js"), "// viejo");
    await prepararRepo(raiz, "master");

    mkdirSync(dirname(rutaSyncJson(raiz)), { recursive: true });
    writeFileSync(rutaSyncJson(raiz), JSON.stringify({
      descargados: descargado ? ["viejo.js"] : [],
    }));

    writeFileSync(join(raiz, "app.xml"), "<app cambiada/>");
    execFileSync("git", ["rm", "-q", "viejo.js"], { cwd: raiz });
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "cambios"], { cwd: raiz });
    return raiz;
  }

  it("el candado deja pasar el borrado cuando la ruta SÍ estaba en `descargados`", async () => {
    const raiz = await proyectoConBorrado(true);
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");

    const informe = await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" } });

    expect(informe.ok.slice().sort()).toEqual(["app.xml", "viejo.js"]);
    expect(puerto.escrituras).toContainEqual({ tipo: "borrado", ruta: "viejo.js" });
  });

  it("el candado bloquea el borrado cuando la ruta NO estaba en `descargados`", async () => {
    const raiz = await proyectoConBorrado(false);
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");

    const informe = await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" } });

    // `app.xml` sí sube (no lo protege el candado); `viejo.js` no se toca en absoluto,
    // ni en el informe ni en el servidor: la copia era incompleta y no se puede afirmar
    // que "viejo.js" no siga existiendo en Studio.
    expect(informe.ok).toEqual(["app.xml"]);
    expect(puerto.escrituras.some((e) => e.ruta === "viejo.js")).toBe(false);
  });
});
