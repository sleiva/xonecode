import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CloudStudioEnMemoria, type CloudStudioPort } from "../core/ports.js";
import { prepararRepo, cambiosPendientes, REMOTO } from "./gitSync.js";
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
});
