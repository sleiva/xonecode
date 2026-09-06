import { describe, it, expect } from "vitest";
import { crearSubagenteExterno, decisionDeTool, MOTORES_CABLEADOS } from "./subagenteExterno.js";
import { binarioDeCodex } from "./subagenteCodex.js";

describe("decisionDeTool — la regla de seguridad de los agentes externos", () => {
  it("permite leer y buscar, que es para lo que se llama a uno de estos", () => {
    for (const tool of ["Read", "Glob", "Grep", "LS", "NotebookRead"]) {
      expect(decisionDeTool(tool, false).behavior, tool).toBe("allow");
    }
  });

  it("DENIEGA escribir, editar y la shell", () => {
    // `Bash` sola basta para escribir el proyecto entero, así que no es una tool «de
    // ejecución» que se pueda tratar aparte: es la escritura por otro camino.
    for (const tool of ["Write", "Edit", "NotebookEdit", "Bash", "MultiEdit"]) {
      expect(decisionDeTool(tool, false).behavior, tool).toBe("deny");
    }
  });

  it("deniega lo que NO reconoce, que es el caso que de verdad importa", () => {
    // Lista blanca y no negra. Con una negra, la tool que Claude Code añada en su próxima
    // versión llegaría aquí PERMITIDA sin que nadie hubiera tocado este fichero. Así llega
    // denegada, y como mucho el hijo se queda corto y lo dice.
    expect(decisionDeTool("UnaToolQueNoExisteTodavia", false).behavior).toBe("deny");
  });

  it("deniega salir a la red, aunque no escriba nada", () => {
    // No es que escriban: es que sacan el contenido del proyecto fuera de la máquina, y eso
    // no lo decide un especialista.
    expect(decisionDeTool("WebFetch", false).behavior).toBe("deny");
    expect(decisionDeTool("WebSearch", false).behavior).toBe("deny");
  });

  it("la denegación dice POR QUÉ, para que el hijo pueda contestar algo útil", () => {
    const d = decisionDeTool("Write", false);
    expect(d.behavior === "deny" && d.message).toMatch(/aprobación humana/);
  });

  it("con la escritura permitida deja pasar todo — el interruptor existe y está apagado", () => {
    // El campo está en el puerto para que el día que la aprobación se conecte no haya que
    // cambiar su forma. Hoy nadie lo pone a `true`; este test fija qué pasaría si alguien lo
    // hiciera, que es lo que lo convierte en una decisión y no en un olvido.
    expect(decisionDeTool("Write", true).behavior).toBe("allow");
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
      await expect(crearSubagenteExterno().disponible("codex")).resolves.toBe(false);
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
        crearSubagenteExterno().correr({
          motor: "codex",
          cwd: "/tmp",
          instrucciones: "",
          tarea: "haz algo",
          permitirEscritura: false,
        })
      ).rejects.toThrow(/no se pudo lanzar codex|terminó sin devolver/);
    } finally {
      if (previo === undefined) delete process.env["CODEX_BIN"];
      else process.env["CODEX_BIN"] = previo;
    }
  });
});
