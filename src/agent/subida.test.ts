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
 * Falla al posicionar la rama a la que hay que mudarse (`cambiarRama(rama)`), no al
 * restaurar la que estaba — por eso comprueba el NOMBRE y solo intercepta esa llamada,
 * delegando la del `finally` (con la otra rama) en el método original.
 *
 * Las dos ramas tienen que ser DISTINTAS para que el test diga algo: si el puerto ya
 * estuviera en `rama`, el `finally` llamaría al mismo nombre que falla y la restauración
 * quedaría sin comprobar. Por eso el doble arranca en otra rama.
 */
function conCambioARamaQueFalla(
  base: CloudStudioEnMemoria, rama: string
): CloudStudioEnMemoria {
  const prototipo = Object.getPrototypeOf(base) as CloudStudioEnMemoria;
  const puerto: CloudStudioEnMemoria = Object.assign(Object.create(prototipo), base);
  const original = prototipo.cambiarRama.bind(puerto);
  puerto.cambiarRama = async (nombre: string) => {
    if (nombre === rama) throw new Error("no se pudo posicionar la rama del proyecto");
    return original(nombre);
  };
  return puerto;
}

/**
 * Mismo patrón (`Object.create`) para instrumentar `escribirTexto` sin perder el resto de
 * la clase: registra en QUÉ rama estaba el puerto al escribir cada fichero, delegando
 * siempre en el método ORIGINAL ligado al envoltorio (`prototipo.x.bind(puerto)`, no a
 * `base`) para que el estado (`ramaActual`, `escrituras`) quede donde `subir()` lo puede
 * leer después.
 */
function conRamaInstrumentada(base: CloudStudioEnMemoria) {
  const prototipo = Object.getPrototypeOf(base) as CloudStudioPort;
  const puerto = Object.assign(Object.create(prototipo), base) as CloudStudioPort;
  const ramasAlEscribir: string[] = [];
  const escribirOriginal = prototipo.escribirTexto.bind(puerto);
  puerto.escribirTexto = async (ruta: string, contenido: string) => {
    ramasAlEscribir.push((await puerto.contexto()).rama);
    return escribirOriginal(ruta, contenido);
  };
  return { puerto, ramasAlEscribir };
}

describe("subir", () => {
  it("se muda a la rama del proyecto, escribe ahí, y devuelve la que estaba", async () => {
    // El puerto arranca en OTRA rama a propósito: si ya estuviera en `master`, «se mudó y
    // volvió» sería indistinguible de «no tocó nada», y lo que hay que demostrar es que
    // las escrituras caen en la rama del proyecto y que el suelo se devuelve como estaba
    // —`switch` se lo mueve a quien tenga Studio abierto en el navegador—.
    const raiz = await proyectoConCambios();
    const base = new CloudStudioEnMemoria({ rama: "otra", textos: { "app.xml": "<app/>" } });
    await base.abrir("AppForTest");
    const { puerto, ramasAlEscribir } = conRamaInstrumentada(base);

    const informe = await subir({
      puerto, raiz, ramaOrigen: "master",
      proyecto: { id: "96fe", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre
    });

    expect(informe.ok).toEqual(["app.xml"]);
    // AC1: get_context → cambiarRama(proyecto) → operar → cambiarRama(la que estaba).
    expect(ramasAlEscribir).toEqual(["master"]);
    expect((await puerto.contexto()).rama).toBe("otra");
  });

  it("con todo bien, la ref se mueve y no queda nada pendiente", async () => {
    const raiz = await proyectoConCambios();
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");
    await subir({ puerto, raiz, ramaOrigen: "master", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});

    // La ref es la de la MISMA rama de la que se bajó, así que el diff pendiente se
    // calcula contra ella y después de subir no queda nada.
    expect(await cambiosPendientes(raiz, "master")).toEqual([]);
    expect(git(raiz, "reflog", "show", `${REMOTO}/master`)).toContain("sync:");
  });

  it("sube a la rama de la que se bajó: una sola ref, y ninguna rama de trabajo", async () => {
    // Lo que se pide es aplicar cambios y subirlos a la rama del proyecto. Hubo una rama
    // de trabajo (`xonecode/<origen>`, con su propia ref y su `crearRama` en el servidor)
    // para no escribir en la rama que el cliente tuviera abierta en Studio; el precio era
    // que lo subido vivía en un sitio que nadie mira mientras la rama del proyecto se
    // quedaba quieta. Este test es la guarda de esa decisión: la ref que se mueve es la de
    // `master`, y `refs/remotes/cloudstudio/xonecode/master` no existe.
    const raiz = await proyectoConCambios();
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");

    await subir({
      puerto, raiz, ramaOrigen: "master",
      proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre,
    });

    // La ref de la rama del proyecto apunta a HEAD: es lo que se acaba de subir.
    expect(git(raiz, "rev-parse", `refs/remotes/${REMOTO}/master`)).toBe(git(raiz, "rev-parse", "HEAD"));
    // Y no hay ninguna ref de rama de trabajo: ni la del envío de antes, ni una nueva.
    const refs = git(raiz, "for-each-ref", "--format=%(refname)", `refs/remotes/${REMOTO}/`);
    expect(refs.split("\n").filter((r) => r.includes("xonecode/"))).toEqual([]);
    expect(await cambiosPendientes(raiz, "master")).toEqual([]);
  });

  it("lo pendiente se mide contra la ref que dejó la descarga, y solo contra esa", async () => {
    // `prepararRepo` escribe `refs/remotes/cloudstudio/<rama>` con el estado bajado, así
    // que la referencia de «qué falta por subir» existe desde la primera bajada. Si esto
    // se calculara contra otra ref —la de una rama de trabajo— o contra nada, la primera
    // subida no encontraría qué subir o subiría de más.
    const raiz = await proyectoConCambios();
    expect(await cambiosPendientes(raiz, "master")).toEqual([{ clase: "modificado", ruta: "app.xml" }]);
  });

  it("con un fallo a mitad, la ref NO se mueve", async () => {
    const raiz = await proyectoConCambios();
    const base = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await base.abrir("AppForTest");
    const puerto = conEscrituraDeTextoQueFalla(base);

    const informe = await subir({
      puerto, raiz, ramaOrigen: "master",
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
    const base = new CloudStudioEnMemoria({ rama: "otra", textos: { "app.xml": "<app/>" } });
    await base.abrir("AppForTest");
    const puerto = conCambioARamaQueFalla(base, "master");

    await expect(subir({
      puerto, raiz, ramaOrigen: "master",
      proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre
    })).rejects.toThrow("no se pudo posicionar la rama del proyecto");

    // (a) subir() rechaza — comprobado arriba.
    // (b) la rama activa del servidor sigue siendo la que estaba.
    expect((await puerto.contexto()).rama).toBe("otra");
    // (c) el intento queda registrado en sync.log: un fallo de red o de servidor —la
    // clase para la que existe el log— no puede dejar el JSONL sin rastro.
    const lineas = readFileSync(rutaSyncLog(raiz), "utf8").trim().split("\n");
    const ultima = JSON.parse(lineas[lineas.length - 1]!);
    expect(ultima.dir).toBe("subida");
    expect(ultima.error).toContain("no se pudo posicionar la rama del proyecto");
  });

  it("deja el registro en JSONL, añadiendo", async () => {
    const raiz = await proyectoConCambios();
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");
    await subir({ puerto, raiz, ramaOrigen: "master", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});
    await subir({ puerto, raiz, ramaOrigen: "master", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});

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
    await subir({ puerto, raiz, ramaOrigen: "master", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});

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

    const informe = await subir({ puerto, raiz, ramaOrigen: "master", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});

    expect(informe.ok.slice().sort()).toEqual(["app.xml", "viejo.js"]);
    expect(puerto.escrituras).toContainEqual({ tipo: "borrado", ruta: "viejo.js" });
  });

  it("el candado bloquea el borrado cuando la ruta NO estaba en `descargados`", async () => {
    const raiz = await proyectoConBorrado(false);
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");

    const informe = await subir({ puerto, raiz, ramaOrigen: "master", proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: autorizaSiempre});

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
      puerto, raiz, ramaOrigen: "master",
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
    expect(await cambiosPendientes(raiz, "master")).toEqual([]);
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
      puerto, raiz, ramaOrigen: "master",
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
      puerto, raiz, ramaOrigen: "master",
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
        puerto, raiz, ramaOrigen: "master",
        proyecto: { id: "1", nombre: "AppForTest" }, politicaDeAprobacion: politica,
      });

      // Ve EXACTAMENTE lo que se va a escribir, ni más ni menos — y con la clase del cambio,
      // que es lo que quien decide mira para saber si un fichero es nuevo o ya estaba (aquí
      // el commit de baseline ya tenía `app.xml`, así que es una modificación).
      expect(planRecibido).toEqual([{ tipo: "texto", ruta: "app.xml", clase: "modificado" }]);
      expect(informe.ok).toEqual(["app.xml"]);
      expect(await cambiosPendientes(raiz, "master")).toEqual([]);
      expect(git(raiz, "reflog", "show", `${REMOTO}/master`)).toContain("sync:");
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
        puerto, raiz, ramaOrigen: "master",
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
