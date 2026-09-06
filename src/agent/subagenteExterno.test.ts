import { describe, it, expect } from "vitest";
import { crearSubagenteExterno, decisionDeTool, MOTORES_CABLEADOS } from "./subagenteExterno.js";

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

describe("crearSubagenteExterno", () => {
  it("codex NO está disponible: su integración es otra y todavía no está", () => {
    // Ofrecer un especialista que revienta en cuanto el orquestador lo elige es un botón
    // muerto dentro del grafo — y peor que uno de interfaz, porque quien lo pulsa es el
    // modelo y se cree el resultado.
    expect(MOTORES_CABLEADOS.has("codex")).toBe(false);
    return expect(crearSubagenteExterno().disponible("codex")).resolves.toBe(false);
  });

  it("correr con un motor no cableado falla diciendo cuál usar", async () => {
    await expect(
      crearSubagenteExterno().correr({
        motor: "codex",
        cwd: "/tmp",
        instrucciones: "",
        tarea: "haz algo",
        permitirEscritura: false,
      })
    ).rejects.toThrow(/todavía no está cableado/);
  });
});
