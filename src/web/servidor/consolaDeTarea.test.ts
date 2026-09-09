import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFilesystemMiddleware } from "deepagents";
import {
  crearConsolaDeTarea,
  ErrorDeTareaSinHumano,
  MENSAJE_DE_RECHAZO_DE_TAREA,
} from "./consolaDeTarea.js";
import { backendDeAgente } from "../../agent/proyecto.js";
import { permisosDe } from "../../agent/perfiles.js";
import { CatalogoModelosEnMemoria } from "../../core/ports.js";
import type { PendienteDeAprobacion } from "../../core/events.js";
import type { Piel } from "../../core/turno.js";

const PENDIENTE: PendienteDeAprobacion = {
  id: "1",
  origen: "dev",
  descripcion: "[dev] quiere escribir un fichero del proyecto",
  decisionesPermitidas: ["approve", "reject"],
};
const OTRO: PendienteDeAprobacion = { ...PENDIENTE, id: "2", origen: "mockup" };

function montar() {
  const aparcado: string[] = [];
  const escrito: string[] = [];
  const autorizado: string[][] = [];
  const consola = crearConsolaDeTarea({
    aparcar: (motivo) => aparcado.push(motivo),
    autorizado: (ficheros) => autorizado.push([...ficheros]),
    escribir: (texto) => escrito.push(texto),
    catalogoModelos: new CatalogoModelosEnMemoria(),
    guardarModeloGlobal: (_papel, id) => ({ ruta: "/casa/.xonecode/config.json", id }),
  });
  return { consola, aparcado, escrito, autorizado };
}

describe("crearConsolaDeTarea", () => {
  it("una escritura de una tarea se APLICA: la autorización fue crear la tarea", async () => {
    /**
     * El comportamiento que este test describía antes era el rechazo, y **cambió por
     * decisión expresa del usuario** (§0 del diseño). La aprobación no estaba por la
     * propiedad del repo: estaba porque XOne ignora en silencio lo desconocido, así que un
     * atributo inventado no da error sino un bug mudo, y el diff era el único momento en
     * que alguien lo veía antes de que existiera. Quien ocupa ese sitio ahora son el
     * verificador del turno (`turnoReal.ts#conVerificacion`, que corre igual por este
     * camino) y el juez de QA, no un modal que nadie va a ver.
     *
     * Y esto NO es `seAplicaSinAprobacion`: ese ajuste dice «el humano que está aquí ha
     * decidido no pulsar», y aquí no hay nadie aquí. La autorización es el acto de CREAR
     * la tarea — elegir un proyecto y escribir un encargo es decir «trabaja en esto sin
     * preguntarme».
     */
    const { consola, aparcado } = montar();
    const decisiones = await consola.aprobacionesTui!(
      [PENDIENTE],
      new Map([["1", "/src/app.xne"]]),
      new Map()
    );
    expect(decisiones.get("1")).toEqual({ type: "approve" });
    // Y no se aparca: aplicar no es toparse con algo que necesita a una persona.
    expect(aparcado).toEqual([]);
  });

  it("lo autorizado se APUNTA, con ruta relativa y por el canal de la tarea", async () => {
    // «Lo que la tarea escribe se DICE», y con los NOMBRES: es el mismo criterio del aviso
    // de honestidad de `seAplicaSinAprobacion`, que saca los ficheros y no un contador,
    // porque un contador a secas es el aviso que enseña a ignorar los avisos. Se llama
    // «autorizado» y no «aplicado» porque esto se apunta ANTES de que el backend escriba:
    // el nombre no puede prometer un hecho sobre el disco (la verdad la da Revisión).
    const { consola, autorizado } = montar();
    await consola.aprobacionesTui!([PENDIENTE], new Map([["1", "/src/app.xne"]]), new Map());
    expect(autorizado).toEqual([["src/app.xne"]]);
  });

  it("aplicar no se consulta con `seAplicaSinAprobacion`: es otra decisión, de otro humano", async () => {
    /**
     * Reutilizar ese ajuste habría hecho dos cosas mal: un proyecto CONECTADO no aplicaría
     * nada (el ajuste lo rechaza a propósito), y la marca del `settings.json` de un
     * proyecto offline decidiría sobre las tareas de todos los demás. Son dos
     * autorizaciones distintas y con alcances distintos.
     *
     * Se comprueba sobre el FUENTE porque es donde se puede afirmar: esta consola no
     * recibe ningún ajuste ni ninguna raíz, así que no hay parámetro que espiar — lo que
     * hay que vigilar es que nadie le añada uno. (El ejecutor sí evalúa
     * `seAplicaSinAprobacion` en cada ronda, `cli/main.ts`, y con esta consola devuelve
     * `false` siempre: `interactivo && !eof()` es falso. O sea que no aporta nada, ni
     * puede: la política es esta.)
     */
    const fuente = readFileSync(new URL("./consolaDeTarea.ts", import.meta.url), "utf8");
    // Ni se importa el módulo de los ajustes…
    expect(fuente).not.toMatch(/from\s+"[^"]*settings/);
    // …ni se llama a la función (el docblock la NOMBRA, y a propósito: explica por qué no).
    expect(fuente).not.toMatch(/seAplicaSinAprobacion\s*\(/);
    // Y la política aplica sin que nadie le haya dado un ajuste ni una raíz.
    const { consola } = montar();
    const decisiones = await consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    expect(decisiones.get("1")).toEqual({ type: "approve" });
  });

  it("una pendiente que NO admite `approve` se rechaza y APARCA: fail-closed por decisión", async () => {
    /**
     * `decisionesPermitidas` viene del `reviewConfigs` del interrupt, y hay tools que solo
     * ofrecen rechazo (`consolaWeb.test.ts` ya prueba ese caso). Aprobar lo que no admite
     * aprobación sería inventarse una decisión que la librería no acepta; y como no se
     * puede resolver sin una persona, la tarea se aparca con el motivo. Es también lo que
     * mantiene vivo `MENSAJE_DE_RECHAZO_DE_TAREA`, que sigue siendo el único texto que
     * evita que el modelo remate el turno como si hubiera escrito.
     */
    const soloRechazable: PendienteDeAprobacion = { ...PENDIENTE, decisionesPermitidas: ["reject"] };
    const { consola, aparcado, autorizado } = montar();
    const decisiones = await consola.aprobacionesTui!(
      [soloRechazable],
      new Map([["1", "/src/app.xne"]]),
      new Map()
    );
    expect(decisiones.get("1")).toEqual({ type: "reject", message: MENSAJE_DE_RECHAZO_DE_TAREA });
    expect(aparcado).toHaveLength(1);
    expect(aparcado[0]).toMatch(/src\/app\.xne/);
    expect(aparcado[0]).toMatch(/persona/i);
    // Y no se apunta como autorizada: no se autorizó.
    expect(autorizado).toEqual([]);
  });

  it("una tanda MIXTA aplica lo que puede y aparca por lo que no", async () => {
    const soloRechazable: PendienteDeAprobacion = { ...OTRO, decisionesPermitidas: ["reject"] };
    const { consola, aparcado, autorizado } = montar();
    const decisiones = await consola.aprobacionesTui!(
      [PENDIENTE, soloRechazable],
      new Map([
        ["1", "/a.xne"],
        ["2", "/b.xne"],
      ]),
      new Map()
    );
    expect(decisiones.get("1")).toEqual({ type: "approve" });
    expect(decisiones.get("2")).toMatchObject({ type: "reject" });
    expect(autorizado).toEqual([["a.xne"]]);
    // El motivo nombra SOLO lo que quedó sin resolver: decir «a.xne» ahí mandaría a mirar
    // un fichero que ya está escrito.
    expect(aparcado[0]).toMatch(/b\.xne/);
    expect(aparcado[0]).not.toMatch(/a\.xne/);
  });

  it("el rechazo lleva el MENSAJE: sin él el modelo remata como si hubiera escrito", async () => {
    // `vendor/hitl.ts` documenta este modo de fallo en el propio `REJECT_MESSAGE`: un
    // rechazo pelado deja al modelo sintetizar la respuesta final como si la escritura
    // hubiese quedado lista. En una tarea de fondo el transcript es lo ÚNICO que una
    // persona leerá después, así que ahí esa mentira es la que cuenta.
    const soloRechazable: PendienteDeAprobacion = { ...PENDIENTE, decisionesPermitidas: ["reject"] };
    const { consola } = montar();
    const decisiones = await consola.aprobacionesTui!([soloRechazable], new Map(), new Map());
    const mensaje = decisiones.get("1")?.message ?? "";
    expect(mensaje).toBe(MENSAJE_DE_RECHAZO_DE_TAREA);
    expect(mensaje).toMatch(/NO se ha ejecutado/);
    // Y no dice «por el usuario»: en una tarea de fondo nadie rechazó nada, y esa
    // atribución acabaría en la respuesta final como un rechazo que nunca hubo.
    expect(mensaje).not.toMatch(/por el usuario/i);
  });

  it("la ruta va RELATIVA a la raíz, como los hallazgos del verificador", async () => {
    // Las rutas del interrupt son las del backend virtual (`/app.xne`): nunca de la
    // máquina, pero con una barra delante que las hace parecer absolutas. Lo apuntado se
    // guarda en el índice de tareas —y de ahí lo lee el juez de la entrega—, así que una
    // barra de más viajaría con ella.
    const { consola, escrito, autorizado } = montar();
    await consola.aprobacionesTui!([PENDIENTE], new Map([["1", "/app.xne"]]), new Map());
    expect(autorizado).toEqual([["app.xne"]]);
    expect(escrito.join("")).toMatch(/\bapp\.xne\b/);
    expect(escrito.join("")).not.toMatch(/\/app\.xne/);
  });

  it("sin ruta conocida se dice la DESCRIPCIÓN, no un hueco", async () => {
    // Mismo trato que `aplicadasSinPreguntar` en `turnoReal.ts`: sin `file_path` no hay
    // nombre que dar, y un hueco haría desaparecer del registro una escritura que se
    // aplicó. La descripción del interrupt es texto fijo del harness, no una ruta.
    const { consola, autorizado, escrito } = montar();
    await consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    expect(autorizado).toEqual([["[dev] quiere escribir un fichero del proyecto"]]);
    expect(escrito.join("")).toContain("[dev] quiere escribir un fichero del proyecto");
  });

  it("una pregunta APARCA y CORTA: cualquier cadena sería una respuesta inventada", async () => {
    // Medido: `preguntar` no tiene valor de «rechazo» —16 de sus 18 llamadores leen la
    // cadena vacía como «cancela / usa el valor por omisión», que es una decisión que aquí
    // nadie ha tomado—. Cortar desde dentro es el camino que este repo ya usa para el «sin
    // humano» de `run.ts`, y el motivo queda puesto ANTES de cortar. **Esto NO cambia con
    // que las escrituras se apliquen**: aplicar una escritura no es contestar por una
    // persona, y son dos cosas distintas.
    const { consola, aparcado } = montar();
    await expect(consola.preguntar("¿Sigo?")).rejects.toBeInstanceOf(ErrorDeTareaSinHumano);
    expect(aparcado).toHaveLength(1);
    expect(aparcado[0]).toMatch(/¿Sigo\?/);
  });

  it("una credencial APARCA y CORTA: una clave vacía es una clave equivocada", async () => {
    const { consola, aparcado } = montar();
    await expect(consola.leerSecreto("clave de anthropic:")).rejects.toBeInstanceOf(
      ErrorDeTareaSinHumano
    );
    expect(aparcado).toHaveLength(1);
    expect(aparcado[0]).toMatch(/credencial/i);
    // El enunciado sí; el valor no existe. Y de la pregunta no se copia nada más.
    expect(aparcado[0]).not.toMatch(/clave de anthropic/);
  });

  it("cuatro tandas seguidas se autorizan TODAS, y ninguna aparca", async () => {
    // Medido en `turnoReal.ts` con un agente que vuelve a proponer: `pedirAprobacion` se
    // llama una vez por ronda. Antes cada ronda era un rechazo y el motivo se guardaba solo
    // de la primera; ahora cada una se autoriza, y lo apuntado tiene que llevarlas todas —
    // un registro que se quedara con la primera escondería tres ficheros escritos.
    const { consola, aparcado, autorizado } = montar();
    for (let i = 0; i < 4; i += 1) {
      const decisiones = await consola.aprobacionesTui!(
        [PENDIENTE],
        new Map([["1", `/ronda${i}.xne`]]),
        new Map()
      );
      expect(decisiones.get("1")).toEqual({ type: "approve" });
    }
    expect(aparcado).toEqual([]);
    expect(autorizado).toEqual([["ronda0.xne"], ["ronda1.xne"], ["ronda2.xne"], ["ronda3.xne"]]);
  });

  it("se aparca UNA vez por turno, aunque antes se hayan autorizado escrituras", async () => {
    // El «una vez» sigue valiendo, y ahora tiene un caso nuevo: una tarea que escribe dos
    // ficheros y DESPUÉS pregunta. El motivo bueno es el de la pregunta —es lo que la
    // paró—, y lo autorizado no se pierde: va por su propio canal.
    const { consola, aparcado, autorizado } = montar();
    await consola.aprobacionesTui!([PENDIENTE], new Map([["1", "/a.xne"]]), new Map());
    await expect(consola.preguntar("¿la borro?")).rejects.toBeInstanceOf(ErrorDeTareaSinHumano);
    await expect(consola.leerSecreto("clave:")).rejects.toBeInstanceOf(ErrorDeTareaSinHumano);
    expect(aparcado).toHaveLength(1);
    expect(aparcado[0]).toMatch(/¿la borro\?/);
    expect(autorizado).toEqual([["a.xne"]]);
  });

  it("dos pendientes en la MISMA tanda se autorizan las dos, en un solo apunte", async () => {
    const { consola, aparcado, autorizado } = montar();
    const decisiones = await consola.aprobacionesTui!(
      [PENDIENTE, OTRO],
      new Map([
        ["1", "/a.xne"],
        ["2", "/b.xne"],
      ]),
      new Map()
    );
    expect([...decisiones.keys()]).toEqual(["1", "2"]);
    expect([...decisiones.values()]).toEqual([{ type: "approve" }, { type: "approve" }]);
    expect(aparcado).toEqual([]);
    expect(autorizado).toEqual([["a.xne", "b.xne"]]);
  });

  it("`eof` dice la verdad —no hay humano— y no se usa para aprobar ni rechazar por detrás", () => {
    const { consola } = montar();
    expect(consola.eof!()).toBe(true);
    expect(consola.interactivo).toBe(false);
  });

  it("lo que se escribe va al transcript", async () => {
    const { consola, escrito } = montar();
    consola.escribir("hola\n");
    expect(escrito).toEqual(["hola\n"]);
  });

  it("aparcar no es MUDO en el transcript: quien lea la sesión ve por qué paró", async () => {
    // El estado de la tarea lo lee el kanban; el transcript lo lee la persona que abre la
    // sesión para atenderla, y ahí un turno que se corta sin decir nada se lee como que el
    // agente se quedó callado.
    const { consola, escrito } = montar();
    await expect(consola.preguntar("¿Sigo?")).rejects.toBeInstanceOf(ErrorDeTareaSinHumano);
    expect(escrito.join("")).toMatch(/¿Sigo\?/);
    expect(escrito.join("")).toMatch(/aparcad/i);
  });

  it("autorizar TAMPOCO es mudo, y es lo que más falta hace decir", async () => {
    /**
     * Una escritura que nadie aprueba no puede ser además muda — es la regla del evento
     * `artefacto` y la del aviso de honestidad de `seAplicaSinAprobacion`, y aquí es el
     * único aviso que hay: el de `turnoReal.ts` solo sale por la rama `todoAutomatico`, que
     * este camino no toma. Con los NOMBRES, no con un contador.
     */
    const { consola, escrito } = montar();
    await consola.aprobacionesTui!(
      [PENDIENTE, OTRO],
      new Map([
        ["1", "/app.xne"],
        ["2", "/Clientes.xne"],
      ]),
      new Map()
    );
    const texto = escrito.join("");
    expect(texto).toMatch(/app\.xne/);
    expect(texto).toMatch(/Clientes\.xne/);
    expect(texto).toMatch(/sin aprobaci/i);
    // Y dice que es porque es una TAREA: sin eso se lee como que la aprobación se rompió.
    expect(texto).toMatch(/tarea/i);
  });

  it("la piel se REENVÍA si se le da, y no está si no", () => {
    // Sin piel, `crearEjecutorReal` cae en `crearPielStdio(escribir)` y el turno entero
    // entra en el transcript como actos `sistema`: se guarda, pero sin actos de asistente
    // ni de razonamiento. Quien monta esta consola tiene que poder darle la de su proyecto,
    // y `piel: undefined` no vale — un `"piel" in consola` diría que sí.
    const { consola } = montar();
    expect(consola.piel).toBeUndefined();
    expect("piel" in consola).toBe(false);

    const piel = {} as unknown as Piel;
    const conPiel = crearConsolaDeTarea({
      aparcar: () => {},
      escribir: () => {},
      piel: () => piel,
      catalogoModelos: new CatalogoModelosEnMemoria(),
      guardarModeloGlobal: (_papel, id) => ({ ruta: "/casa/.xonecode/config.json", id }),
    });
    expect(conPiel.piel!()).toBe(piel);
  });

  it("las líneas se agotan en cuanto se pide una: una tarea es UN turno, no una conversación", async () => {
    const { consola } = montar();
    const leidas: string[] = [];
    for await (const linea of consola.lineas) leidas.push(linea);
    expect(leidas).toEqual([]);
  });
});

/**
 * **MEDIDO: aplicar no abre ninguna de las guardas de RUTA.**
 *
 * Estas guardas nunca fueron parte de la aprobación —viven en el backend
 * (`agent/proyecto.ts#backendDeAgente`) y en los permisos del middleware
 * (`agent/perfiles.ts#permisosDe`)—, y una tarea entra por el MISMO backend con los MISMOS
 * permisos. Pero eso era una lectura del código, y lo que esta tarea cambia es justo quién
 * decide sobre una escritura: así que se monta la pieza de verdad y se mira el disco.
 *
 * Las dos mitades hacen falta y no son la misma: `/artifacts/` y una vista aplanada las
 * corta el BACKEND (devolviendo `{error}`, que la librería convierte en el resultado de la
 * tool), y `/.env`, `/.git` y `/.xonecode` los corta `permissions`, que es una opción del
 * middleware. Un test que solo montara el backend daría por buenas las tres últimas sin
 * haberlas probado.
 *
 * No hay red, ni clave, ni modelo: se invocan las tools a mano, que es lo que hace
 * `agent/proyecto.test.ts` con la otra mitad de esta costura.
 */
describe("una tarea aplica, y aun así estas rutas NO se escriben", () => {
  /** El texto que el modelo vería, venga como cadena o dentro de un `ToolMessage`. */
  function textoDeResultado(resultado: unknown): string {
    if (typeof resultado === "string") return resultado;
    const contenido = (resultado as { content?: unknown }).content;
    return typeof contenido === "string" ? contenido : JSON.stringify(resultado);
  }

  /** El proyecto y las tools tal como las monta el agente de un turno de tarea. */
  function proyecto() {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-tarea-guardas-"));
    writeFileSync(join(raiz, "app.xml"), "<app/>");
    writeFileSync(join(raiz, "Clientes.xne"), "<coll/>");
    writeFileSync(join(raiz, "Clientes.xml"), "<coll/>");
    writeFileSync(join(raiz, ".env"), "CLAVE=secreta");
    const backend = backendDeAgente({
      raiz,
      ficheros: new Set(["/app.xml", "/Clientes.xne", "/Clientes.xml", "/.env"]),
    });
    const middleware = createFilesystemMiddleware({
      backend,
      // Los MISMOS que `xoneAgent.ts` le pone a cada especialista que escribe. Escritos a
      // mano serían otra regla; por eso se pide la función.
      permissions: permisosDe({ nombre: "dev", soloLectura: false }),
    } as never) as unknown as {
      tools: { name: string; invoke: (entrada: unknown) => Promise<unknown> }[];
    };
    return {
      raiz,
      write: middleware.tools.find((x) => x.name === "write_file")!,
    };
  }

  it.each([
    ["/artifacts/x.html", "artifacts"],
    ["/Clientes.xml", "Clientes.xml"],
    ["/.env", ".env"],
    ["/.git/config", ".git"],
    ["/.xonecode/memoria.md", ".xonecode"],
  ])("aplicar no escribe en %s", async (ruta, huella) => {
    const { raiz, write } = proyecto();
    // La consola de la tarea APRUEBA esta escritura: es lo que esta tarea introduce.
    const { consola } = montar();
    const decisiones = await consola.aprobacionesTui!(
      [PENDIENTE],
      new Map([["1", ruta]]),
      new Map()
    );
    expect(decisiones.get("1")).toEqual({ type: "approve" });

    // Y aun así el disco no se toca. Quien lo corta no es la consola: si lo fuera, habría
    // DOS reglas sobre la misma ruta y podrían divergir.
    const antes = existsSync(join(raiz, huella)) ? readFileSync(join(raiz, huella), "utf8") : undefined;
    /**
     * Un RESULTADO y no una excepción, que es lo que deja al modelo enterarse y reintentar
     * en vez de llevarse el turno por delante. **MEDIDO: las dos capas contestan con
     * formas distintas**, y por eso se mira el texto y no el tipo — las guardas del backend
     * devuelven una CADENA (deepagents convierte su `{error}` en el resultado de la tool) y
     * `permissions` devuelve un `ToolMessage` con `status: "error"` y el motivo en
     * `content`. Un test que exigiera cadena daría por roto el camino de los permisos.
     */
    const resultado = await write.invoke({ file_path: ruta, content: "PWN" });
    expect(textoDeResultado(resultado)).toMatch(/aplanada|artefacto|permission denied/i);

    if (antes === undefined) {
      expect(existsSync(join(raiz, huella))).toBe(false);
    } else {
      expect(readFileSync(join(raiz, huella), "utf8")).toBe(antes);
    }
  });

  it("y lo que sí es del proyecto se escribe: la guarda no está de más en el camino bueno", async () => {
    // El otro lado de la medida. Sin esto, un backend que rechazara TODO pasaría los cinco
    // casos de arriba y este test sería el único que lo notaría.
    const { raiz, write } = proyecto();
    await write.invoke({ file_path: "/Clientes.xne", content: "<coll nuevo/>" });
    expect(readFileSync(join(raiz, "Clientes.xne"), "utf8")).toBe("<coll nuevo/>");
  });
});
