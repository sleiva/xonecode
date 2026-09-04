import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CloudStudioEnMemoria, type CloudStudioPort } from "../core/ports.js";
import { prepararRepo, cambiosPendientes, REMOTO } from "./gitSync.js";
import { rutaSyncJson } from "./descarga.js";
import { subir, rutaSyncLog } from "./subida.js";
import type { OperacionDeSubida } from "../core/cloudstudio.js";

/** `politicaDeAprobacion` es obligatoria (fail-closed por tipo): estos tests no la
 * prueban, así que autorizan siempre y dejan el resto del comportamiento tal cual
 * estaba. Los tests de la política de verdad viven más abajo, en su propio describe. */
const autorizaSiempre = async () => true;

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
      proyecto: { id: "96fe", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre
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

    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});

    expect(llamadasCrearRama).toEqual([]);
  });

  it("con todo bien, la ref se mueve y no queda nada pendiente", async () => {
    const raiz = await proyectoConCambios();
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");
    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});

    // La ref lleva el nombre de la rama a la que se ESCRIBIÓ («t»), no el de la origen:
    // en Studio `master` no tiene nada de esto. Y el diff pendiente se calcula contra esa
    // misma ref, así que después de subir no queda nada.
    expect(await cambiosPendientes(raiz, "master", "t")).toEqual([]);
    expect(git(raiz, "reflog", "show", `${REMOTO}/t`)).toContain("sync:");
  });

  it("la ref se llama como la rama a la que se ESCRIBIÓ, no como la origen", async () => {
    // El libro de cuentas mentía: se escribía en `xonecode/master` y se movía la ref de
    // `master`. Después de subir, `git status` decía que ibas al día con `master`, pero
    // en Studio `master` no tenía nada de eso; y un `/sync bajar` posterior reintroducía
    // todo como si el trabajo se hubiera revertido.
    const raiz = await proyectoConCambios();
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");

    const baseAntes = git(raiz, "rev-parse", `refs/remotes/${REMOTO}/master`);
    await subir({
      puerto, raiz, ramaOrigen: "master", ramaTrabajo: "xonecode/master",
      proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre,
    });

    // La ref de la rama ORIGEN sigue exactamente donde estaba: en Studio `master` no ha
    // cambiado, y afirmar lo contrario es lo que hacía irrecuperable el siguiente bajar.
    expect(git(raiz, "rev-parse", `refs/remotes/${REMOTO}/master`)).toBe(baseAntes);
    // Y la de la rama de trabajo, que es donde se escribió, apunta a HEAD.
    expect(git(raiz, "rev-parse", `refs/remotes/${REMOTO}/xonecode/master`)).toBe(git(raiz, "rev-parse", "HEAD"));
    // Con esa ref ya existiendo, «lo que falta por subir» se mide contra ELLA: nada.
    expect(await cambiosPendientes(raiz, "master")).toEqual([]);
  });

  it("antes de la primera subida, lo pendiente se mide contra la rama ORIGEN", async () => {
    // La otra mitad: sin ref de trabajo todavía, la referencia buena es la origen —de la
    // que parte la rama de trabajo—. Si `cambiosPendientes` solo mirara la de trabajo, la
    // primera subida no encontraría nada que subir.
    const raiz = await proyectoConCambios();
    expect(await cambiosPendientes(raiz, "master")).toEqual([{ clase: "modificado", ruta: "app.xml" }]);
  });

  it("con un fallo a mitad, la ref NO se mueve", async () => {
    const raiz = await proyectoConCambios();
    const base = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await base.abrir("AppForTest");
    const puerto = conEscrituraDeTextoQueFalla(base);

    const informe = await subir({
      puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t",
      proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre
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
      proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre
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
    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});
    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});

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
    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});

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
    // El `sync.json` lleva proyecto y rama porque el candado los COMPRUEBA: uno de otro
    // proyecto no cuenta (ver el test de más abajo).
    writeFileSync(rutaSyncJson(raiz), JSON.stringify({
      proyecto: { id: "1", nombre: "AppForTest" },
      rama: "master",
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

    const informe = await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});

    expect(informe.ok.slice().sort()).toEqual(["app.xml", "viejo.js"]);
    expect(puerto.escrituras).toContainEqual({ tipo: "borrado", ruta: "viejo.js" });
  });

  it("el candado bloquea el borrado cuando la ruta NO estaba en `descargados`", async () => {
    const raiz = await proyectoConBorrado(false);
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");

    const informe = await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});

    // `app.xml` sí sube (no lo protege el candado); `viejo.js` no se toca en absoluto,
    // ni en el informe ni en el servidor: la copia era incompleta y no se puede afirmar
    // que "viejo.js" no siga existiendo en Studio.
    expect(informe.ok).toEqual(["app.xml"]);
    expect(puerto.escrituras.some((e) => e.ruta === "viejo.js")).toBe(false);
  });

  it("una operación IMPOSIBLE no atasca la subida: sale del plan, se declara y la ref avanza", async () => {
    // El caso que dejaba `/sync subir` inútil de forma PERMANENTE: el borrado de un
    // binario se emitía como `borrarTexto`, el servidor lo rechazaba, `fallos` nunca
    // quedaba vacío, la ref no se movía, y el siguiente `/sync` recalculaba el mismo
    // plan y volvía a fallar. La primera imagen borrada bastaba.
    const raiz = mkdtempSync(join(tmpdir(), "xc-sub-"));
    writeFileSync(join(raiz, "app.xml"), "<app/>");
    mkdirSync(join(raiz, "icons"), { recursive: true });
    writeFileSync(join(raiz, "icons", "viejo.png"), "PNG");
    await prepararRepo(raiz, "master");

    // El binario SÍ se descargó: el candado no lo protege, así que sin la escapatoria
    // este borrado se emitiría de verdad.
    mkdirSync(dirname(rutaSyncJson(raiz)), { recursive: true });
    writeFileSync(rutaSyncJson(raiz), JSON.stringify({
      proyecto: { id: "1", nombre: "AppForTest" },
      rama: "master",
      descargados: ["app.xml", "icons/viejo.png"],
    }));

    writeFileSync(join(raiz, "app.xml"), "<app cambiada/>");
    execFileSync("git", ["rm", "-q", "icons/viejo.png"], { cwd: raiz });
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "borro el icono"], { cwd: raiz });

    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");
    const avisos: string[] = [];
    const informe = await subir({
      puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t",
      proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre,
      informar: (t) => avisos.push(t),
    });

    // 1. La operación imposible NO se intenta contra el servidor.
    expect(puerto.escrituras.some((e) => e.ruta === "icons/viejo.png")).toBe(false);
    // 2. El resto sí sube, y sin fallos.
    expect(informe.ok).toEqual(["app.xml"]);
    expect(informe.fallos).toEqual([]);
    // 3. Se declara, en el informe y por consola, con un motivo accionable.
    expect(informe.omitidas).toEqual([
      { ruta: "icons/viejo.png", motivo: expect.stringMatching(/no borra binarios/) },
    ]);
    expect(avisos.join("")).toContain("icons/viejo.png");
    // 4. Y queda en `sync.log`, que es lo único que sobrevive al turno.
    const lineas = readFileSync(rutaSyncLog(raiz), "utf8").trim().split("\n");
    expect(JSON.parse(lineas[lineas.length - 1]!).omitidas).toEqual([
      { ruta: "icons/viejo.png", motivo: expect.stringMatching(/no borra binarios/) },
    ]);
    // 5. LA PRUEBA DURA: la ref avanzó, así que el siguiente `/sync` no reintenta lo
    //    imposible. Antes se quedaba clavada y el atasco era permanente.
    expect(await cambiosPendientes(raiz, "master", "t")).toEqual([]);
  });

  it("un sync.json de OTRO proyecto no vale como candado: no se borra nada", async () => {
    // `descargados` es la única pata del candado que puede MENTIR: es un fichero en
    // disco que sobrevive a un `/connect-studio` a otro proyecto o a un cambio de rama
    // origen. Sus rutas afirmarían «esto lo bajamos» sobre un Studio en el que nunca
    // entramos, y el candado autorizaría borrados en el proyecto del cliente equivocado.
    const raiz = await proyectoConBorrado(true);
    // Mismo contenido, otro proyecto: solo cambia la identidad, no lo que dice haber bajado.
    writeFileSync(rutaSyncJson(raiz), JSON.stringify({
      proyecto: { id: "OTRO", nombre: "OtraApp" },
      rama: "master",
      descargados: ["viejo.js"],
    }));

    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");
    const avisos: string[] = [];
    const informe = await subir({
      puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t",
      proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre,
      informar: (t) => avisos.push(t),
    });

    expect(puerto.escrituras.some((e) => e.ruta === "viejo.js")).toBe(false);
    expect(informe.ok).toEqual(["app.xml"]);
    expect(avisos.join("")).toMatch(/no es de este proyecto/);
  });

  it("un sync.json de otra RAMA tampoco vale", async () => {
    const raiz = await proyectoConBorrado(true);
    writeFileSync(rutaSyncJson(raiz), JSON.stringify({
      proyecto: { id: "1", nombre: "AppForTest" },
      rama: "dev",
      descargados: ["viejo.js"],
    }));

    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");
    await subir({
      puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t",
      proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre,
    });

    expect(puerto.escrituras.some((e) => e.ruta === "viejo.js")).toBe(false);
  });

  describe("politicaDeAprobacion", () => {
    it("si autoriza, sube todo y la ref se mueve — invocada con el plan YA CONSTRUIDO", async () => {
      const raiz = await proyectoConCambios();
      const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
      await puerto.abrir("AppForTest");
      let planRecibido: readonly OperacionDeSubida[] | undefined;
      const politica = async (plan: readonly OperacionDeSubida[]) => {
        planRecibido = [...plan];
        return true;
      };

      const informe = await subir({
        puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t",
        proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: politica,
      });

      // Ve EXACTAMENTE lo que se va a escribir, ni más ni menos.
      expect(planRecibido).toEqual([{ tipo: "texto", ruta: "app.xml" }]);
      expect(informe.ok).toEqual(["app.xml"]);
      expect(await cambiosPendientes(raiz, "master", "t")).toEqual([]);
      expect(git(raiz, "reflog", "show", `${REMOTO}/t`)).toContain("sync:");
    });

    it("si NO autoriza, no escribe nada en el puerto, la ref no se mueve, y lo dice", async () => {
      const raiz = await proyectoConCambios();
      // Sin `puerto.abrir()` de antemano, A PROPÓSITO: si `subir()` llegara a abrir el
      // proyecto antes de mirar la política, `contexto()` no reventaría más abajo y este
      // test no distinguiría «se miró la política y se abrió igual» de «no se llegó ni a
      // abrir» — que es justo lo que hace falta demostrar.
      const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
      const avisos: string[] = [];

      const informe = await subir({
        puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t",
        proyecto: { id: "1", nombre: "AppForTest" },
        politicaDeAprobacion: async () => false,
        informar: (t) => avisos.push(t),
      });

      expect(informe).toEqual({ ok: [], fallos: [], omitidas: [] });
      expect(puerto.escrituras).toEqual([]);
      // Ni siquiera se abrió el proyecto: la política decide ANTES de tocar el puerto.
      await expect(puerto.contexto()).rejects.toThrow("No project is open");
      expect(await cambiosPendientes(raiz, "master")).toHaveLength(1);
      expect(avisos.join("")).toContain("no se ha aplicado nada");
    });
  });
});
