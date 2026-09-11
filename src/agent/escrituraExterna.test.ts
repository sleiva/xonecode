import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claseDeToolExterna,
  veredictoDeRuta,
  rutaVirtualDeEscritura,
  decisionDePreToolUse,
  politicaDeAprobacionExterna,
  politicaExternaDeSesion,
  opcionesDeSubagenteExterno,
  eventoDeToolExterna,
  inventarioDelProyecto,
  diffDeEscrituraExterna,
  TOOLS_EXTERNAS_DE_LECTURA,
  TOOLS_EXTERNAS_DE_ESCRITURA,
  TOOLS_EXTERNAS_DENEGADAS,
} from "./escrituraExterna.js";
import { DENEGADO_SIEMPRE } from "./perfiles.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import type { Decision } from "../vendor/hitl.js";
import { ColaDeEventos } from "../core/entrelazar.js";

describe("las TRES listas de tools", () => {
  it("una tool no puede estar en dos listas", () => {
    // Si estuviera, el orden de las comprobaciones decidiría el permiso — o sea que la
    // seguridad dependería de en qué línea está escrito el `if`.
    const todas = [...TOOLS_EXTERNAS_DE_LECTURA, ...TOOLS_EXTERNAS_DE_ESCRITURA, ...TOOLS_EXTERNAS_DENEGADAS];
    expect(new Set(todas).size).toBe(todas.length);
  });

  it("leer y buscar son de lectura", () => {
    for (const tool of ["Read", "Glob", "Grep", "NotebookRead", "TodoWrite"]) {
      expect(claseDeToolExterna(tool), tool).toBe("lectura");
    }
  });

  it("`ToolSearch` es de lectura, porque `Glob` y `Grep` vienen DIFERIDAS", () => {
    // Medido espiando el hook en vivo: el hijo intentó `Bash ls`, luego `Bash find`, y
    // después `ToolSearch {"query":"select:Glob,Grep"}` — no las tiene cargadas. Sin esto, el
    // mensaje de denegación le ofrecía buscar con unas tools que no podía alcanzar, y acababa
    // probando nombres de fichero a ciegas: 65 lecturas de ficheros que no existían.
    // No abre nada: devuelve ESQUEMAS, y lo que consiga vuelve a pasar por este mismo hook.
    expect(claseDeToolExterna("ToolSearch")).toBe("lectura");
  });

  it("escribir son DOS tools y ninguna más: las que se pueden enseñar en un diff", () => {
    expect([...TOOLS_EXTERNAS_DE_ESCRITURA].sort()).toEqual(["Edit", "Write"]);
  });

  it("la shell y la red NO son escritura: se deniegan con el permiso de escribir puesto", () => {
    // Aquí está la mitad del arreglo. Antes la decisión era `permitirEscritura || esDeLectura`,
    // así que el día que se concediera la escritura se concedía TODO: `Bash` sola basta para
    // escribir el proyecto entero SALTÁNDOSE la política, el diff y las guardas de ruta.
    for (const tool of ["Bash", "BashOutput", "KillShell", "WebFetch", "WebSearch"]) {
      expect(claseDeToolExterna(tool), tool).toBe("denegada");
    }
  });

  it("`NotebookEdit` y `MultiEdit` quedan fuera de la escritura, y eso es una decisión", () => {
    // `NotebookEdit` lleva `notebook_path` y no `file_path`: no se sabe componer su diff, y
    // conceder una escritura que nadie puede mirar es aprobar a ciegas. `MultiEdit` ya no
    // existe en este SDK, y el día que vuelva es una LISTA de ediciones: una aprobación
    // cubriría N cambios.
    expect(claseDeToolExterna("NotebookEdit")).toBe("denegada");
    expect(claseDeToolExterna("MultiEdit")).toBe("denegada");
  });

  it("lo que NO se reconoce se deniega, que es el caso que de verdad importa", () => {
    // La unión `ToolInputSchemas` del SDK instalado enumera CUARENTA Y CUATRO tools —`REPL`,
    // `Workflow`, `Cron*`, `Artifact`, `RemoteTrigger`, `Mcp`, `EnterWorktree`…— y crece con
    // cada versión. Con una lista negra, la que añadan mañana entraría permitida.
    for (const tool of ["REPL", "Workflow", "CronCreate", "Artifact", "EnterWorktree", "Agent", "LS"]) {
      expect(claseDeToolExterna(tool), tool).toBe("desconocida");
    }
  });
});

describe("las guardas de RUTA, reaplicadas sobre la ruta absoluta del hijo", () => {
  // Un proyecto de pega en un temporal: de estas pruebas la mitad necesitan disco de verdad
  // (los enlaces simbólicos y las mayúsculas del sistema de ficheros no se pueden doblar).
  // `realpathSync` sobre el temporal, y no es cosmético: en macOS `/var` es un enlace a
  // `/private/var`, así que sin canonicalizar la raíz las pruebas de enlace simbólico
  // pasarían por el motivo EQUIVOCADO —la raíz y el destino real no casarían nunca— y
  // seguirían verdes el día que la resolución del enlace dejara de estar.
  const raiz = realpathSync(mkdtempSync(join(tmpdir(), "xonecode-externo-")));
  mkdirSync(join(raiz, "app"), { recursive: true });
  writeFileSync(join(raiz, "app", "Clientes.xne"), "<coll/>");
  writeFileSync(join(raiz, "app", "Clientes.xml"), "<coll/>");
  writeFileSync(join(raiz, ".env"), "CLAVE=secreta");
  symlinkSync(join(raiz, ".env"), join(raiz, "enlace-env.txt"));
  mkdirSync(join(raiz, "fuera-de-la-raiz"), { recursive: true });
  symlinkSync(tmpdir(), join(raiz, "atajo-a-fuera"));

  const ficheros = new Set(["/app/Clientes.xne", "/app/Clientes.xml"]);
  const veredicto = (ruta: unknown) => veredictoDeRuta({ cwd: raiz, ruta, ficheros });

  it("un fichero normal del proyecto pasa, con su ruta VIRTUAL", () => {
    const v = veredicto(join(raiz, "app", "nuevo.js"));
    expect(v).toEqual({ admitida: true, ruta: "/app/nuevo.js" });
  });

  it("deniega `.env`, `.git` y `.xonecode` — las mismas de `DENEGADO_SIEMPRE`", () => {
    for (const ruta of [".env", ".env.local", ".git/config", ".xonecode/config.json"]) {
      expect(veredicto(join(raiz, ruta)).admitida, ruta).toBe(false);
    }
  });

  it("deniega `/skills/` y `/adjuntos/`, que por el otro camino son de solo lectura", () => {
    expect(veredicto(join(raiz, "skills", "pwn.md")).admitida).toBe(false);
    expect(veredicto(join(raiz, "adjuntos", "pwn.txt")).admitida).toBe(false);
  });

  it("y esa lista está ATADA a `DENEGADO_SIEMPRE`, no copiada a mano", () => {
    // Dos formatos de la misma regla —globs para deepagents, prefijos para aquí— son dos
    // copias que divergen. Esto recorre las filas de `write` de la de allá y exige que la de
    // aquí también las rechace: el día que alguien añada una carpeta protegida y se olvide de
    // este fichero, cae por aquí en vez de abrirse un hueco para los agentes externos.
    for (const fila of DENEGADO_SIEMPRE) {
      if (!fila.operations.includes("write")) continue;
      for (const patron of fila.paths) {
        // De `/x/**` y `/x` sale la misma prueba: un fichero dentro.
        const virtual = patron.replace(/\/\*\*$/, "").replace(/\.\*$/, ".local");
        const ruta = join(raiz, `${virtual.slice(1)}`, "dentro.txt");
        expect(veredicto(ruta).admitida, patron).toBe(false);
        expect(veredicto(join(raiz, virtual.slice(1))).admitida, patron).toBe(false);
      }
    }
  });

  it("deniega lo que se sale de la carpeta del proyecto", () => {
    expect(veredicto(join(raiz, "..", "fuera.txt")).admitida).toBe(false);
    expect(veredicto("/etc/passwd").admitida).toBe(false);
    // La raíz misma no es un fichero que escribir.
    expect(veredicto(raiz).admitida).toBe(false);
  });

  it("deniega una ruta RELATIVA en vez de resolverla contra el cwd", () => {
    // El SDK documenta `file_path` como absoluta («must be absolute, not relative»), así que
    // una relativa es algo que no entendemos — y lo que no se entiende se deniega.
    expect(veredicto("app/Clientes.xne").admitida).toBe(false);
    expect(veredicto("").admitida).toBe(false);
    expect(veredicto(undefined).admitida).toBe(false);
    expect(veredicto(42).admitida).toBe(false);
  });

  it("deniega un artefacto escrito DENTRO del proyecto, y dice dónde iba", () => {
    const v = veredicto(join(raiz, "artifacts", "login.html"));
    expect(v.admitida).toBe(false);
    expect(!v.admitida && v.motivo).toContain("/artefactos/login.html");
  });

  it("una escritura en una carpeta que TODAVÍA no existe se admite: `Write` la crea", () => {
    // No es un caso raro y perdía el motivo bueno: canonicalizando solo el padre, una
    // subcarpeta nueva contestaba «no se pudo comprobar dónde cae» — y con ella, un
    // `/artifacts/login.html` en un proyecto sin esa carpeta se quedaba sin el mensaje que
    // le dice al hijo dónde iba de verdad.
    expect(veredicto(join(raiz, "app", "nueva", "honda", "x.js"))).toEqual({
      admitida: true,
      ruta: "/app/nueva/honda/x.js",
    });
  });

  it("deniega las carpetas de descarga del harness", () => {
    expect(veredicto(join(raiz, "large_tool_results", "call_1.txt")).admitida).toBe(false);
    expect(veredicto(join(raiz, "conversation_history", "x.txt")).admitida).toBe(false);
  });

  it("deniega una vista APLANADA: eso lo genera Studio desde su .xne", () => {
    expect(veredicto(join(raiz, "app", "Clientes.xml")).admitida).toBe(false);
    // Y un `.xml` sin `.xne` al lado no es una vista aplanada: pasa.
    expect(veredicto(join(raiz, "app", "app.xml")).admitida).toBe(true);
  });

  it("y la barrera se aplica DOS veces: un enlace dentro de la raíz que apunta a `.env`", () => {
    // Por el TEXTO, `/enlace-env.txt` es un fichero normal del proyecto. Lo que falla no es
    // el sitio, es el destino — la misma lección que `arbolDeProyecto.ts` midió en su día.
    expect(veredicto(join(raiz, "enlace-env.txt")).admitida).toBe(false);
  });

  it("y un enlace a una carpeta de FUERA no deja escribir dentro de ella", () => {
    expect(veredicto(join(raiz, "atajo-a-fuera", "pwn.txt")).admitida).toBe(false);
  });

  it("una raíz con un ENLACE en el camino no rompe la escritura, y eso salió de correrlo", () => {
    /**
     * La primera ejecución VIVA de este camino (11-09-2026): el proyecto estaba en
     * `/tmp/xc-vivo` y el hijo pidió `/private/tmp/xc-vivo/hola.txt` —canonicaliza él, y en
     * macOS `/tmp` es un enlace a `/private/tmp`—. Los dos TEXTOS no casan, así que la
     * primera pasada lo rechazaba como «fuera del proyecto», y el hijo solo se salvó
     * reintentando con la ruta sin canonicalizar; con cualquier componente enlazado en el
     * camino del proyecto la escritura habría sido imposible y sin motivo que lo explicara.
     * Ningún test con dobles lo habría visto: los dos lados los escribe uno mismo.
     */
    const padre = realpathSync(mkdtempSync(join(tmpdir(), "xonecode-enlace-")));
    mkdirSync(join(padre, "de-verdad", "app"), { recursive: true });
    symlinkSync(join(padre, "de-verdad"), join(padre, "atajo"));
    try {
      // La raíz se nombra POR EL ENLACE y el hijo pide la ruta canónica.
      const v = veredictoDeRuta({
        cwd: join(padre, "atajo"),
        ruta: join(padre, "de-verdad", "app", "hola.txt"),
        ficheros: new Set<string>(),
      });
      expect(v).toEqual({ admitida: true, ruta: "/app/hola.txt" });
      // Y al contrario: raíz canónica, ruta por el enlace.
      expect(
        veredictoDeRuta({
          cwd: join(padre, "de-verdad"),
          ruta: join(padre, "atajo", "app", "hola.txt"),
          ficheros: new Set<string>(),
        }).admitida
      ).toBe(true);
      // Lo que NO se relaja: seguir fuera sigue siendo fuera.
      expect(
        veredictoDeRuta({
          cwd: join(padre, "atajo"),
          ruta: join(padre, "otra-cosa.txt"),
          ficheros: new Set<string>(),
        }).admitida
      ).toBe(false);
    } finally {
      rmSync(padre, { recursive: true, force: true });
    }
  });

  it("un `realpath` que no se puede preguntar DENIEGA, no admite", () => {
    const v = veredictoDeRuta({
      cwd: raiz,
      ruta: join(raiz, "app", "x.js"),
      ficheros,
      real: () => {
        throw new Error("EACCES");
      },
    });
    expect(v.admitida).toBe(false);
  });

  afterAll(() => rmSync(raiz, { recursive: true, force: true }));
});

describe("rutaVirtualDeEscritura", () => {
  it("normaliza a la forma que ve el resto del harness", () => {
    expect(rutaVirtualDeEscritura("/p", "/p/app/x.js")).toBe("/app/x.js");
    expect(rutaVirtualDeEscritura("/p", "/p/./app/../app/x.js")).toBe("/app/x.js");
    expect(rutaVirtualDeEscritura("/p", "/p/../p2/x.js")).toBeUndefined();
    expect(rutaVirtualDeEscritura("/p", "/p")).toBeUndefined();
  });
});

describe("la política: el `pedirAprobacion` que ya existe, traducido", () => {
  const pedida = { agente: "dev", ruta: "/app/x.js", lineas: [] };

  it("pregunta con UN pendiente, con la ruta en `ficheros` y el diff en `diffs`", async () => {
    let visto: { pendientes: PendienteDeAprobacion[]; ficheros: Map<string, string>; diffs: Map<string, unknown> } | undefined;
    const politica = politicaDeAprobacionExterna(async (pendientes, ficheros, diffs) => {
      visto = { pendientes, ficheros, diffs };
      return new Map(pendientes.map((p) => [p.id, { type: "approve" } as Decision]));
    });
    await expect(politica({ ...pedida, lineas: [{ tipo: "anadido", texto: "hola" }] })).resolves.toBe(true);
    const p = visto!.pendientes[0]!;
    // El id lleva prefijo para que NO pueda colisionar con el de un interrupt del grafo: de
    // esas claves se construye el `resume`, y una colisión resolvería el interrupt equivocado.
    expect(p.id.startsWith("externo:")).toBe(true);
    // `origen` es el agente, que es el campo que las tres pieles pintan.
    expect(p.origen).toBe("dev");
    expect(p.decisionesPermitidas).toContain("approve");
    expect(visto!.ficheros.get(p.id)).toBe("/app/x.js");
    expect(visto!.diffs.get(p.id)).toEqual([{ tipo: "anadido", texto: "hola" }]);
  });

  it("sin `approve` para NUESTRO id es un NO", async () => {
    // El mapa de la piel interactiva nace rechazado entero, así que este es el caso normal
    // de «la persona dijo que no», de «venció el plazo» y de «no había nadie conectado».
    const politica = politicaDeAprobacionExterna(async () => new Map());
    await expect(politica(pedida)).resolves.toBe(false);
    const otro = politicaDeAprobacionExterna(async () => new Map([["otro-id", { type: "approve" } as Decision]]));
    await expect(otro(pedida)).resolves.toBe(false);
    const rechaza = politicaDeAprobacionExterna(async (ps) =>
      new Map(ps.map((p) => [p.id, { type: "reject" } as Decision]))
    );
    await expect(rechaza(pedida)).resolves.toBe(false);
  });

  it("y si `pedirAprobacion` LANZA, tampoco autoriza", async () => {
    // El «sin humano» de `cli/run.ts` corta lanzando desde ahí. Aquí eso es una respuesta y
    // no un fallo: nadie ha autorizado nada.
    const politica = politicaDeAprobacionExterna(async () => {
      throw new Error("sin humano");
    });
    await expect(politica(pedida)).resolves.toBe(false);
  });

  it("dos escrituras del mismo turno no comparten id", async () => {
    const ids: string[] = [];
    const politica = politicaDeAprobacionExterna(async (ps) => {
      ids.push(ps[0]!.id);
      return new Map();
    });
    await politica(pedida);
    await politica(pedida);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("el diff de una escritura externa lo compone la MISMA función del grafo", () => {
  it("`Write` es un `write_file`: el antes es el disco y el después el argumento", () => {
    const lineas = diffDeEscrituraExterna(
      "Write",
      { file_path: "/p/app/x.js", content: "uno\ndos\n" },
      "/app/x.js",
      () => "uno\n"
    );
    expect(lineas).toEqual([
      { tipo: "igual", texto: "uno" },
      { tipo: "anadido", texto: "dos" },
    ]);
  });

  it("`Edit` es un `edit_file`, con las mismas claves de argumentos", () => {
    const lineas = diffDeEscrituraExterna(
      "Edit",
      { file_path: "/p/app/x.js", old_string: "uno", new_string: "UNO" },
      "/app/x.js",
      () => "uno\ndos\n"
    );
    expect(lineas).toEqual([
      { tipo: "quitado", texto: "uno" },
      { tipo: "anadido", texto: "UNO" },
      { tipo: "igual", texto: "dos" },
    ]);
  });

  it("un fichero que todavía no existe no es un fallo: es un diff todo añadido", () => {
    const lineas = diffDeEscrituraExterna(
      "Write",
      { file_path: "/p/app/nuevo.js", content: "hola\n" },
      "/app/nuevo.js",
      () => ""
    );
    expect(lineas).toEqual([{ tipo: "anadido", texto: "hola" }]);
  });

  it("y unos argumentos incompletos dan lista vacía, no una excepción", () => {
    // Sin diff se pregunta IGUAL: decidir sin diff es peor que decidir con diff, pero
    // escribir sin decisión es lo que todo esto existe para evitar.
    expect(diffDeEscrituraExterna("Write", { file_path: "/p/x" }, "/x", () => "")).toEqual([]);
  });
});

describe("el CABLEADO de la política (el sitio donde este repo lleva siete reglas caídas)", () => {
  it("sin `pedirAprobacion` NO hay política, o sea que el hijo no escribe", () => {
    // `xonecode run` en CI, una tubería, una sesión montada sin aprobación. El modo de fallo
    // es que el agente externo no pueda escribir y lo diga — nunca que escriba sin que nadie
    // lo autorice. Fail-closed por tipo: `undefined` no es una política permisiva.
    expect(politicaExternaDeSesion(undefined)).toBeUndefined();
  });

  it("con él, la política pregunta por ESE camino y no por otro", async () => {
    // La composición vive extraída de `abrirSesionReal` a propósito: dentro de ese cierre,
    // que todos sus tests doblan, un `pedirAprobacion` que se cayera por el camino dejaría
    // al agente externo sin escribir con todo en verde. Es la misma forma del fallo que ya
    // se midió en `abrirParaTarea` tres veces y en `commitDeTurnoCableado`.
    let llamadas = 0;
    const politica = politicaExternaDeSesion(async (pendientes) => {
      llamadas += 1;
      return new Map(pendientes.map((p) => [p.id, { type: "approve" } as Decision]));
    });
    expect(politica).toBeDefined();
    await expect(politica!({ agente: "dev", ruta: "/app/x.js", lineas: [] })).resolves.toBe(true);
    expect(llamadas).toBe(1);
  });
});

describe("el hook `PreToolUse`, que es la denegación que NO se puede ensombrecer", () => {
  const hook = (nombre: string, entrada: Record<string, unknown> = {}) =>
    decisionDePreToolUse({ nombre, entrada, cwd: "/proyecto", ficheros: new Set<string>(), real: (r) => r });

  it("deniega lo que no está en las dos listas blancas, con su motivo", () => {
    for (const tool of ["Bash", "WebFetch", "WebSearch", "NotebookEdit", "REPL", "LoQueVenga", ""]) {
      const d = hook(tool);
      expect(d.permissionDecision, tool).toBe("deny");
      expect(d.permissionDecisionReason.length, tool).toBeGreaterThan(0);
    }
  });

  it("permite leer, pero SOLO con la ruta comprobada aquí dentro", () => {
    /**
     * Medido en vivo dos veces. Con el hook contestando `allow` a secas y la ruta mirada en
     * `canUseTool`, el hijo leyó `.env`, `.xonecode/config.json`, la vista aplanada y
     * `/etc/hosts` — «cinco de cinco, ninguna fue interceptada»—, porque un `allow` del hook
     * es una PRE-APROBACIÓN y el callback ya no se consulta: el mismo mecanismo de
     * ensombrecimiento que el SDK documenta, construido por nosotros.
     */
    expect(hook("Read", { file_path: "/proyecto/app/x.js" }).permissionDecision).toBe("allow");
    expect(hook("Grep", { pattern: "x" }).permissionDecision).toBe("allow");
    for (const ruta of ["/proyecto/.env", "/proyecto/.xonecode/config.json", "/etc/hosts"]) {
      expect(hook("Read", { file_path: ruta }).permissionDecision, ruta).toBe("deny");
    }
    expect(
      decisionDePreToolUse({
        nombre: "Read",
        entrada: { file_path: "/proyecto/app/Clientes.xml" },
        cwd: "/proyecto",
        ficheros: new Set(["/app/Clientes.xne", "/app/Clientes.xml"]),
        real: (r) => r,
      }).permissionDecision
    ).toBe("deny");
  });

  it("y una ESCRITURA la manda a `ask`, nunca a `allow`", () => {
    // `ask` es cómo se llega a `canUseTool` («the 'ask' path surfaces via a can_use_tool
    // control_request», del propio SDK), que es donde se puede esperar a una persona. Un
    // `allow` aquí se saltaría el diff, la política y las guardas de ruta de un solo salto.
    expect(hook("Write", { file_path: "/proyecto/app/x.js" }).permissionDecision).toBe("ask");
    expect(hook("Edit", { file_path: "/proyecto/app/x.js" }).permissionDecision).toBe("ask");
  });

  it("no deja NINGUNA clase sin decidir", () => {
    // Dejar una sin decidir sería dejar que la decida el `permissionMode`, cuyas semánticas
    // exactas no están medidas: `dontAsk` podría denegar la escritura antes del callback
    // (función muerta) y `default` podría aprobar `WebSearch` por su cuenta (fallo abierto).
    for (const tool of [...TOOLS_EXTERNAS_DE_LECTURA, ...TOOLS_EXTERNAS_DE_ESCRITURA, ...TOOLS_EXTERNAS_DENEGADAS]) {
      expect(["allow", "deny", "ask"], tool).toContain(hook(tool, { file_path: "/proyecto/x" }).permissionDecision);
    }
  });
});

describe("lo que el hijo hace, contado como un evento del harness", () => {
  it("el nombre se TRADUCE al canónico y la ruta va VIRTUAL", () => {
    // Se traduce en vez de inventar una familia nueva: así el colapsador de `core/notify.ts`
    // las agrupa con las demás («→ lee ×5 — a, b y 3 más») y no hay dos nombres para lo
    // mismo en las Trazas.
    expect(eventoDeToolExterna("Read", { file_path: "/proyecto/app/x.js" }, "/proyecto")).toEqual({
      nombre: "read_file",
      detalle: "/app/x.js",
    });
    expect(eventoDeToolExterna("Write", { file_path: "/proyecto/doc/G.md" }, "/proyecto")).toEqual({
      nombre: "write_file",
      detalle: "/doc/G.md",
    });
    expect(eventoDeToolExterna("Grep", { pattern: "self\\." }, "/proyecto")).toEqual({
      nombre: "grep",
      detalle: "self\\.",
    });
  });

  it("y tolera una raíz NO canónica, que fue lo que la dejó muda al medirla", () => {
    // Medido en vivo: con el proyecto en `/tmp/x` el hijo pide `/private/tmp/x/...` —
    // canonicaliza él—, los textos no casaban y el pulso decía «→ lee ×65» sin UN SOLO
    // nombre de fichero. Es el mismo tropiezo que ya costó una medida en `veredictoDeRuta`.
    expect(
      eventoDeToolExterna("Read", { file_path: "/real/p/app/x.js" }, "/enlace/p", (r) =>
        r === "/enlace/p" ? "/real/p" : r
      )
    ).toEqual({ nombre: "read_file", detalle: "/app/x.js" });
  });

  it("la ruta de la MÁQUINA no sale, ni siquiera cuando cae fuera del proyecto", () => {
    // La misma regla que `sinRutas`: el cable puede ir por un túnel. Y decir cuál era la
    // ruta de fuera sería decir dónde miró fuera; se dice la tool y nada más.
    expect(eventoDeToolExterna("Read", { file_path: "/etc/hosts" }, "/proyecto", (r) => r)).toEqual({
      nombre: "read_file",
    });
    expect(eventoDeToolExterna("Read", {}, "/proyecto", (r) => r)).toEqual({ nombre: "read_file" });
  });
});

describe("las opciones del subagente externo, extraídas del cierre y probadas", () => {
  const ficheros = () => new Set<string>();

  it("sin `pedirAprobacion` no hay política, o sea que el hijo no escribe", () => {
    const o = opcionesDeSubagenteExterno({ ficherosDelProyecto: ficheros, eventos: new ColaDeEventos() });
    expect(o.aprobarEscritura).toBeUndefined();
  });

  it("con él, la política entra montada", async () => {
    const o = opcionesDeSubagenteExterno({
      pedirAprobacion: async (ps) => new Map(ps.map((p) => [p.id, { type: "approve" } as Decision])),
      ficherosDelProyecto: ficheros,
      eventos: new ColaDeEventos(),
    });
    await expect(o.aprobarEscritura!({ agente: "d", ruta: "/a", lineas: [] })).resolves.toBe(true);
  });

  it("y lo que hace el hijo acaba en la COLA de eventos, que es lo que se cae en un cierre", () => {
    // Es la octava vez que este repo se encuentra el mismo patrón: una composición de
    // producción viviendo en un cierre que todos los tests doblan. Quitando esta línea de
    // `abrirSesionReal`, los dos `tsc` siguen limpios y el agente externo vuelve a ser mudo.
    const eventos = new ColaDeEventos();
    const o = opcionesDeSubagenteExterno({ ficherosDelProyecto: ficheros, eventos });
    o.alUsarTool({ nombre: "read_file", detalle: "/app/x.js" });
    o.alUsarTool({ nombre: "grep" });
    expect(eventos.vaciar()).toEqual([
      { tipo: "tool", nombre: "read_file", detalle: "/app/x.js" },
      { tipo: "tool", nombre: "grep" },
    ]);
  });

  it("la lista de ficheros es una FUNCIÓN, no una foto del momento de abrir la sesión", () => {
    // El hijo escribe DURANTE el turno: con una lista congelada, el `.xne` que se acaba de
    // crear no estaría y su `.xml` aplanado dejaría de reconocerse como tal.
    let actual = new Set<string>();
    const o = opcionesDeSubagenteExterno({ ficherosDelProyecto: () => actual, eventos: new ColaDeEventos() });
    actual = new Set(["/app/Nuevo.xne"]);
    expect([...o.ficherosDelProyecto()]).toEqual(["/app/Nuevo.xne"]);
  });
});

describe("el inventario: lo que el hijo no puede listar, se le DICE", () => {
  it("enumera con rutas VIRTUALES y dice que no adivine", () => {
    /**
     * Medido espiando el hook en vivo: el hijo intentó `Bash ls`, `Bash find`, pidió
     * `ToolSearch select:Glob,Grep` y NO las encontró —no trae ninguna herramienta de
     * listado—, probó las tools MCP del usuario y acabó leyendo nombres inventados
     * (`README.md`, `CLAUDE.md`, `app.ini`, `main.xml`: ninguno existía) para concluir que
     * «el proyecto está prácticamente vacío para mí, porque no puedo listarlo».
     */
    const t = inventarioDelProyecto(new Set(["/app/Clientes.xne", "/app.xml"]));
    expect(t).toContain("- /app.xml");
    expect(t).toContain("- /app/Clientes.xne");
    expect(t).toMatch(/no adivines/);
    expect(t).toContain("2 fichero(s)");
  });

  it("va ACOTADO y con el total al lado", () => {
    // La misma regla que los nombres del aviso de trabajo sin commitear: lo que cabe se
    // enumera, y el total es lo que impide leerlos como si fueran todos.
    const muchos = new Set(Array.from({ length: 50 }, (_, i) => `/f${String(i).padStart(3, "0")}.js`));
    const t = inventarioDelProyecto(muchos, 10);
    expect(t).toContain("50 fichero(s)");
    expect(t).toContain("y 40 fichero(s) más");
    expect(t.split("\n").filter((l) => l.startsWith("- /"))).toHaveLength(10);
  });

  it("vacío es una AFIRMACIÓN, y aquí es cierta", () => {
    // Sale del disco, así que se puede decir — y decirlo es lo que evita que se ponga a
    // adivinar nombres, que es exactamente lo que hacía sin inventario.
    expect(inventarioDelProyecto(new Set())).toMatch(/está vacío/);
  });
});
