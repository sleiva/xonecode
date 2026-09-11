import { describe, it, expect } from "vitest";
import { crearSubagenteExterno, decisionDeTool, MOTORES_CABLEADOS } from "./subagenteExterno.js";
import { binarioDeCodex } from "./subagenteCodex.js";

const PETICION = {
  motor: "claude-code" as const,
  cwd: "/proyecto",
  instrucciones: "",
  tarea: "haz algo",
  agente: "dev",
  permitirEscritura: false,
};

/** Las guardas de ruta y el disco, doblados: aquí se prueba la DECISIÓN, no el disco. */
const SIN_DISCO = {
  ficheros: new Set<string>(),
  real: (r: string) => r,
  leer: () => "antes\n",
};

describe("decisionDeTool — la regla de seguridad de los agentes externos", () => {
  const decidir = (nombre: string, extra: Partial<Parameters<typeof decisionDeTool>[0]> = {}) =>
    decisionDeTool({ nombre, entrada: {}, peticion: PETICION, ...SIN_DISCO, ...extra });

  it("permite leer y buscar, que es para lo que se llama a uno de estos", async () => {
    for (const tool of ["Read", "Glob", "Grep", "NotebookRead", "TodoWrite"]) {
      expect((await decidir(tool)).behavior, tool).toBe("allow");
    }
  });

  it("y no toca `updatedInput`, que por el contrato del SDK es «sustituye la entrada»", async () => {
    // Antes se contestaba `updatedInput: {}`, que por el tipo del SDK se lee como «la entrada
    // es este objeto vacío». Qué hacía con aquello NO está medido —nunca se ha lanzado un
    // hijo de Claude Code desde este repo—, así que se manda la forma que su contrato declara
    // para «sin cambios», que es omitirlo.
    expect(await decidir("Read")).toEqual({ behavior: "allow" });
  });

  it("si el SDK ABORTA mientras se decide, se deniega en el acto", async () => {
    // Sin esto había un «aprobé y no pasó nada»: el hijo ya no está, `pedirAprobacion` sigue
    // esperando su plazo con el modal delante, la persona aprueba, y lo que resuelve es una
    // promesa que ya nadie lee. Peor que un rechazo, porque se cree que se escribió.
    const control = new AbortController();
    const d = await decidir("Write", {
      peticion: { ...PETICION, permitirEscritura: true },
      entrada: { file_path: "/proyecto/app/x.js", content: "hola" },
      signal: control.signal,
      politica: () =>
        new Promise<boolean>((resuelto) => {
          // La decisión que nunca llega: el humano no contesta y el hijo se muere.
          control.abort();
          setTimeout(() => resuelto(true), 10_000);
        }),
    });
    expect(d.behavior).toBe("deny");
    expect(d.behavior === "deny" && d.message).toMatch(/se canceló/);
  });

  it("y abortado ANTES no se le pregunta a nadie", async () => {
    // Sacar un modal para una escritura que ya no va a ocurrir enseña a aprobar sin mirar.
    const control = new AbortController();
    control.abort();
    let preguntas = 0;
    const d = await decidir("Write", {
      peticion: { ...PETICION, permitirEscritura: true },
      entrada: { file_path: "/proyecto/app/x.js", content: "hola" },
      signal: control.signal,
      politica: async () => {
        preguntas += 1;
        return true;
      },
    });
    expect(d.behavior).toBe("deny");
    expect(preguntas).toBe(0);
  });

  it("pero LEER también lleva guarda de ruta, y eso salió de correrlo de verdad", async () => {
    // Medido en la segunda ejecución viva (11-09-2026), dicho por el propio hijo: «`.env` —
    // sí pude leerlo: contiene una línea `CLAVE=secreta`». La lista blanca permitía `Read` a
    // secas, sin mirar la ruta, y era así desde el primer día: este agujero no lo abrió la
    // escritura, ya estaba. Dentro de `.xonecode` vive además el `checkpoint.sqlite`, que
    // lleva la lista de mensajes ENTERA de cada conversación.
    for (const ruta of ["/proyecto/.env", "/proyecto/.git/config", "/proyecto/.xonecode/checkpoint.sqlite", "/etc/passwd"]) {
      const d = await decidir("Read", { entrada: { file_path: ruta } });
      expect(d.behavior, ruta).toBe("deny");
    }
    // Y un fichero del proyecto se lee con normalidad.
    expect((await decidir("Read", { entrada: { file_path: "/proyecto/app/x.js" } })).behavior).toBe("allow");
  });

  it("una vista APLANADA tampoco se lee: el backend se las retira al agente entero", async () => {
    // Si las ve, edita el fichero equivocado — la razón de `sinVistasAplanadas`.
    const d = await decidir("Read", {
      entrada: { file_path: "/proyecto/app/Clientes.xml" },
      ficheros: new Set(["/app/Clientes.xne", "/app/Clientes.xml"]),
    });
    expect(d.behavior).toBe("deny");
  });

  it("LISTAR la raíz del proyecto se permite: rechazarla dejaba al agente CIEGO", async () => {
    // Medido en vivo, y lo dijo el propio hijo: «el proyecto está prácticamente vacío para
    // mí, porque no puedo listarlo» — y a cambio hizo SESENTA Y CINCO lecturas a ciegas
    // probando nombres que no existían. `rutaVirtualDeEscritura` descarta la raíz a propósito
    // (no es un fichero que escribir), y eso es cierto para escribir y falso para listar.
    expect((await decidir("Glob", { entrada: { pattern: "**/*", path: "/proyecto" } })).behavior).toBe("allow");
    expect((await decidir("Grep", { entrada: { pattern: "self", path: "/proyecto/" } })).behavior).toBe("allow");
    // Y escribir SOBRE la raíz sigue sin tener sentido, así que se sigue denegando.
    const d = await decidir("Write", {
      peticion: { ...PETICION, permitirEscritura: true },
      entrada: { file_path: "/proyecto", content: "x" },
      politica: async () => true,
    });
    expect(d.behavior).toBe("deny");
  });

  it("`Glob` y `Grep` llevan `path` OPCIONAL: ausente es la raíz y no hay nada que comprobar", async () => {
    expect((await decidir("Grep", { entrada: { pattern: "self\\." } })).behavior).toBe("allow");
    expect((await decidir("Glob", { entrada: { pattern: "**/*.xne", path: "/proyecto/app" } })).behavior).toBe("allow");
    expect((await decidir("Grep", { entrada: { pattern: "x", path: "/proyecto/.git" } })).behavior).toBe("deny");
    expect((await decidir("Glob", { entrada: { pattern: "*", path: "/etc" } })).behavior).toBe("deny");
  });

  it("y leer SÍ alcanza a `/skills/`, `/adjuntos/` y un artefacto mal puesto de antes", async () => {
    // No es la misma lista que para escribir: esas carpetas existen PARA leerse, y un
    // artefacto mal puesto hay que poder leerlo para poder moverlo.
    for (const ruta of ["/proyecto/skills/archify/SKILL.md", "/proyecto/adjuntos/nota.txt", "/proyecto/artifacts/viejo.html"]) {
      expect((await decidir("Read", { entrada: { file_path: ruta } })).behavior, ruta).toBe("allow");
    }
  });

  it("DENIEGA la shell y la red aunque la escritura esté CONCEDIDA", async () => {
    // Este es el test del arreglo. La decisión era `permitirEscritura || esDeLectura`, así
    // que conceder la escritura concedía TODO: `Bash` sola basta para escribir el proyecto
    // entero saltándose la política, el diff y las guardas de ruta de un solo salto.
    const conceder = { peticion: { ...PETICION, permitirEscritura: true }, politica: async () => true };
    for (const tool of ["Bash", "BashOutput", "KillShell", "WebFetch", "WebSearch", "NotebookEdit"]) {
      expect((await decidir(tool, conceder)).behavior, tool).toBe("deny");
    }
  });

  it("deniega lo que NO reconoce, que es el caso que de verdad importa", async () => {
    // Lista blanca y no negra. Con una negra, la tool que Claude Code añada en su próxima
    // versión llegaría aquí PERMITIDA sin que nadie hubiera tocado este fichero — y su unión
    // de tools ya enumera cuarenta y cuatro.
    const conceder = { peticion: { ...PETICION, permitirEscritura: true }, politica: async () => true };
    for (const tool of ["UnaToolQueNoExisteTodavia", "REPL", "Workflow", "Artifact", "Agent"]) {
      expect((await decidir(tool, conceder)).behavior, tool).toBe("deny");
    }
  });

  it("un agente de SOLO LECTURA no escribe, y no se le pregunta a nadie", async () => {
    let preguntas = 0;
    const d = await decidir("Write", {
      entrada: { file_path: "/proyecto/app/x.js", content: "hola" },
      politica: async () => {
        preguntas += 1;
        return true;
      },
    });
    expect(d.behavior).toBe("deny");
    // Preguntar por una escritura que el `.md` no autoriza sería un modal cuyo único final
    // posible es un rechazo, y eso enseña a aprobar sin mirar.
    expect(preguntas).toBe(0);
  });

  it("SIN POLÍTICA no se escribe: fail-closed por tipo", async () => {
    // El patrón de `core/cloudstudio.ts#PoliticaDeAprobacion`. Y el modo de fallo del
    // cableado es este: si alguien se deja la política en un cierre, el hijo no puede
    // escribir y lo dice — nunca escribe sin que nadie lo autorice.
    const d = await decidir("Write", {
      peticion: { ...PETICION, permitirEscritura: true },
      entrada: { file_path: "/proyecto/app/x.js", content: "hola" },
    });
    expect(d.behavior).toBe("deny");
    expect(d.behavior === "deny" && d.message).toMatch(/no tiene a quién pedir/);
  });

  it("con la escritura concedida y la política diciendo SÍ, se permite", async () => {
    const d = await decidir("Write", {
      peticion: { ...PETICION, permitirEscritura: true },
      entrada: { file_path: "/proyecto/app/x.js", content: "hola" },
      politica: async () => true,
    });
    expect(d.behavior).toBe("allow");
  });

  it("y la política recibe la ruta VIRTUAL y el diff, nunca la ruta de la máquina", async () => {
    let visto: { agente: string; ruta: string; lineas: unknown[] } | undefined;
    await decisionDeTool({
      nombre: "Write",
      entrada: { file_path: "/proyecto/app/x.js", content: "antes\ndespues\n" },
      peticion: { ...PETICION, permitirEscritura: true },
      ...SIN_DISCO,
      politica: async (e) => {
        visto = e;
        return true;
      },
    });
    expect(visto?.ruta).toBe("/app/x.js");
    expect(visto?.agente).toBe("dev");
    expect(visto?.lineas).toEqual([
      { tipo: "igual", texto: "antes" },
      { tipo: "anadido", texto: "despues" },
    ]);
  });

  it("la política que dice NO deniega, y el motivo no invita a insistir", async () => {
    const d = await decidir("Write", {
      peticion: { ...PETICION, permitirEscritura: true },
      entrada: { file_path: "/proyecto/app/x.js", content: "hola" },
      politica: async () => false,
    });
    expect(d.behavior).toBe("deny");
    expect(d.behavior === "deny" && d.message).toMatch(/No la intentes por otro camino/);
  });

  it("una ruta que las guardas rechazan NO llega a preguntarse", async () => {
    // El orden es el de `seDetieneEn`: si el único final posible es el rechazo, no se saca el
    // modal. Y de paso, una escritura fuera del proyecto no se puede autorizar ni queriendo.
    for (const ruta of ["/proyecto/.env", "/proyecto/skills/pwn.md", "/etc/passwd", "app/relativa.js"]) {
      let preguntas = 0;
      const d = await decidir("Write", {
        peticion: { ...PETICION, permitirEscritura: true },
        entrada: { file_path: ruta, content: "hola" },
        politica: async () => {
          preguntas += 1;
          return true;
        },
      });
      expect(d.behavior, ruta).toBe("deny");
      expect(preguntas, ruta).toBe(0);
    }
  });

  it("una política que LANZA deniega, y la excepción no sale hacia el SDK", async () => {
    // El comportamiento del SDK ante un `canUseTool` que revienta no está medido, y «no
    // medido» no es una barrera. El envoltorio de `correr` cierra el mismo caso para todo lo
    // demás que pueda lanzar aquí dentro.
    const d = await decidir("Write", {
      peticion: { ...PETICION, permitirEscritura: true },
      entrada: { file_path: "/proyecto/app/x.js", content: "hola" },
      politica: async () => {
        throw new Error("el humano se fue");
      },
    }).catch(() => ({ behavior: "LANZÓ" as const }));
    expect(d.behavior).toBe("deny");
  });
});

describe("los dos motores externos", () => {
  it("los dos están cableados: Claude Code por su SDK, Codex por su app-server", () => {
    expect([...MOTORES_CABLEADOS].sort()).toEqual(["claude-code", "codex"]);
  });

  it("`CODEX_BIN` manda sobre el `codex` del PATH", () => {
    // Existe para poder apuntar a una versión concreta o a un envoltorio, y es lo que
    // permite probar el camino de «no está» sin depender de qué haya instalado.
    const previo = process.env["CODEX_BIN"];
    try {
      delete process.env["CODEX_BIN"];
      expect(binarioDeCodex()).toBe("codex");
      process.env["CODEX_BIN"] = "/ruta/a/otro/codex";
      expect(binarioDeCodex()).toBe("/ruta/a/otro/codex");
      // Una variable vacía no cuenta como puesta: dejaría el binario en cadena vacía y el
      // `spawn` fallaría con un error que no dice nada.
      process.env["CODEX_BIN"] = "   ";
      expect(binarioDeCodex()).toBe("codex");
    } finally {
      if (previo === undefined) delete process.env["CODEX_BIN"];
      else process.env["CODEX_BIN"] = previo;
    }
  });

  it("un binario que no existe da «no disponible», no una excepción", async () => {
    // `npm test` no puede depender de que Codex esté instalado, así que aquí se comprueba el
    // camino contrario: se apunta a algo que seguro NO está. Sin la escucha del evento
    // `error` del spawn, un binario inexistente se lleva el proceso por delante — la misma
    // trampa que `abrirEnSistema` documenta con `xdg-open`.
    const previo = process.env["CODEX_BIN"];
    process.env["CODEX_BIN"] = "/no/existe/este/codex-de-mentira";
    try {
      await expect(crearSubagenteExterno({}).disponible("codex")).resolves.toBe(false);
    } finally {
      if (previo === undefined) delete process.env["CODEX_BIN"];
      else process.env["CODEX_BIN"] = previo;
    }
  });

  it("con el motor no disponible, `correr` falla en vez de quedarse colgado", async () => {
    const previo = process.env["CODEX_BIN"];
    process.env["CODEX_BIN"] = "/no/existe/este/codex-de-mentira";
    try {
      await expect(
        crearSubagenteExterno({}).correr({
          motor: "codex",
          cwd: "/tmp",
          instrucciones: "",
          tarea: "haz algo",
          agente: "dev",
          permitirEscritura: false,
        })
      ).rejects.toThrow(/no se pudo lanzar codex|terminó sin devolver/);
    } finally {
      if (previo === undefined) delete process.env["CODEX_BIN"];
      else process.env["CODEX_BIN"] = previo;
    }
  });
});
