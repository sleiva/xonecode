/**
 * Codex como subagente: un turno contra `codex app-server --stdio`.
 *
 * **Todo lo que hay aquí está MEDIDO contra el binario real (0.152.1), no deducido de una
 * documentación.** El encuadre es JSON por línea sin campo `jsonrpc`; `initialize` contesta
 * con el `userAgent` y el `codexHome`; `thread/start` acepta `{cwd, ephemeral, approvalPolicy,
 * sandbox}` y devuelve `{thread:{id}}`; `turn/start` toma
 * `{threadId, input:[{type:"text", text, text_elements:[]}]}`; y la respuesta final llega en
 * un `item/completed` cuyo `item.type` es `agentMessage` con `phase: "final_answer"`. Los
 * valores de sandbox son exactamente tres, y los enumeró el propio servidor al rechazar uno
 * mal escrito: `read-only`, `workspace-write` y `danger-full-access`.
 *
 * **Se usa el `codex` del PATH, no un paquete npm.** El harness de deepseek se trae
 * `@openai/codex` para no depender del PATH; aquí se prefiere el que el usuario ya tiene
 * instalado y autenticado, porque ese paquete son ~100 MB de binario por plataforma y
 * traerlo obligaría a todo el mundo a bajarlo para una capacidad opcional. `CODEX_BIN`
 * permite apuntar a otro.
 *
 * **La escritura la deniega el SANDBOX, no un prompt.** `sandbox: "read-only"` es la caja
 * del sistema operativo: no depende de que el modelo colabore, que es la diferencia entre
 * una política y una petición. Y `approvalPolicy: "never"` evita que el hijo se quede
 * esperando a alguien. Si aun así llegara una petición de aprobación, el turno se ABORTA con
 * su motivo en vez de contestarla: xonecode no concede escrituras a un agente externo, y
 * adivinar la forma de una respuesta que no se ha medido sería peor que fallar.
 *
 * Y una consecuencia que hay que saber: el hijo es el Codex DEL USUARIO, con su
 * configuración —sus MCP, sus plugins, sus hooks y sus skills—. Medido: al abrir el hilo
 * arrancan los servidores MCP que tenga puestos. xonecode no los filtra ni los toca.
 */

import { spawn } from "node:child_process";
import type { PeticionExterna } from "../core/ports.js";

/** El binario. `CODEX_BIN` gana, para poder apuntar a una versión concreta o a un envoltorio. */
export function binarioDeCodex(): string {
  const puesto = process.env["CODEX_BIN"];
  return puesto !== undefined && puesto.trim() !== "" ? puesto : "codex";
}

/**
 * Cuánto se espera a que el turno termine.
 *
 * Existe porque un hijo colgado colgaría el turno de xonecode para siempre, y el usuario
 * vería el compositor apagado sin nada que lo explique. Diez minutos es holgado para una
 * revisión de código y corto comparado con «nunca».
 */
const TOPE_MS = 10 * 60 * 1000;

/** Los eventos de ruido: llegan a docenas y no dicen nada del resultado. */
const RUIDO = new Set([
  "remoteControl/status/changed",
  "mcpServer/startupStatus/updated",
  "thread/tokenUsage/updated",
  "account/rateLimits/updated",
  "hook/started",
  "hook/completed",
  "item/agentMessage/delta",
  "thread/status/changed",
]);

/** Un mensaje del app-server. Solo se nombra lo que se usa. */
interface Mensaje {
  id?: number;
  method?: string;
  result?: unknown;
  error?: { message?: string };
  params?: Record<string, unknown>;
}

/** ¿Está el binario? Se pregunta lanzándolo, que es la única respuesta que no miente. */
export async function codexDisponible(): Promise<boolean> {
  return new Promise((resolver) => {
    let hijo: ReturnType<typeof spawn>;
    try {
      hijo = spawn(binarioDeCodex(), ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      resolver(false);
      return;
    }
    // El `error` del spawn hay que escucharlo: sin escucha, un binario que no existe emite
    // ese evento y se lleva el proceso por delante — la misma trampa que `abrirEnSistema`
    // documenta con `xdg-open`.
    hijo.on("error", () => resolver(false));
    hijo.on("close", (codigo) => resolver(codigo === 0));
  });
}

export async function correrCodex(peticion: PeticionExterna): Promise<string> {
  const hijo = spawn(binarioDeCodex(), ["app-server", "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: peticion.cwd,
  });

  return new Promise<string>((cumplir, fallar) => {
    let buffer = "";
    let hilo: string | undefined;
    let respuesta: string | undefined;
    let terminado = false;

    const acabar = (error?: Error, texto?: string): void => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      hijo.kill();
      if (error !== undefined) fallar(error);
      else cumplir(texto ?? "");
    };

    const reloj = setTimeout(
      () => acabar(new Error(`codex no terminó en ${Math.round(TOPE_MS / 60000)} minutos`)),
      TOPE_MS
    );

    const mandar = (objeto: unknown): void => {
      if (!terminado) hijo.stdin.write(`${JSON.stringify(objeto)}\n`);
    };

    hijo.on("error", (e) => acabar(new Error(`no se pudo lanzar codex: ${e.message}`)));
    hijo.on("close", () => {
      // Si el proceso muere sin habernos dado la respuesta, es un fallo: devolver cadena
      // vacía la haría pasar por «el especialista no tenía nada que decir».
      if (!terminado) acabar(new Error("codex terminó sin devolver ninguna respuesta"));
    });

    hijo.stdout.on("data", (trozo: Buffer) => {
      buffer += trozo.toString();
      let corte: number;
      while ((corte = buffer.indexOf("\n")) >= 0) {
        const linea = buffer.slice(0, corte);
        buffer = buffer.slice(corte + 1);
        if (linea.trim() === "") continue;
        let m: Mensaje;
        try {
          m = JSON.parse(linea) as Mensaje;
        } catch {
          // Una línea que no es JSON no tumba el turno: el app-server mezcla trazas suyas
          // por stdout en algunas versiones y descartarla es lo que hace el cliente oficial.
          continue;
        }
        atender(m);
      }
    });

    const atender = (m: Mensaje): void => {
      if (m.error !== undefined) {
        acabar(new Error(`codex: ${m.error.message ?? "error sin mensaje"}`));
        return;
      }
      // Respuesta del `initialize`: se confirma y se abre el hilo.
      if (m.id === 1) {
        mandar({ method: "initialized" });
        mandar({
          id: 2,
          method: "thread/start",
          params: {
            cwd: peticion.cwd,
            // Efímero: no queda una conversación suelta en el historial de Codex del
            // usuario por cada delegación que haga el orquestador.
            ephemeral: true,
            // Nadie va a contestar una aprobación, así que no se piden.
            approvalPolicy: "never",
            // La caja del sistema operativo. `permitirEscritura` está aquí para el día que
            // la aprobación se conecte; hoy nadie lo pone a `true` (`core/ports.ts`).
            sandbox: peticion.permitirEscritura ? "workspace-write" : "read-only",
          },
        });
        return;
      }
      // Respuesta del `thread/start`: se manda el turno.
      if (m.id === 2) {
        const r = m.result as { thread?: { id?: string } } | undefined;
        hilo = r?.thread?.id;
        if (hilo === undefined) {
          acabar(new Error("codex abrió el hilo sin devolver su id"));
          return;
        }
        mandar({
          id: 3,
          method: "turn/start",
          params: {
            threadId: hilo,
            // Las instrucciones van DELANTE de la tarea, en el mismo turno: el app-server
            // no expone un prompt de sistema por hilo, así que el papel del subagente y las
            // reglas de XOne entran como el primer bloque de texto de la petición.
            input: [
              { type: "text", text: peticion.instrucciones, text_elements: [] },
              { type: "text", text: peticion.tarea, text_elements: [] },
            ],
          },
        });
        return;
      }
      if (m.method === undefined || RUIDO.has(m.method)) return;

      // Una aprobación no se contesta: se aborta. xonecode no concede escrituras a un agente
      // externo, y adivinar la forma de una respuesta que no se ha medido sería peor que
      // fallar con el motivo delante.
      if (m.method.endsWith("/requestApproval") || m.method === "item/tool/requestUserInput") {
        acabar(
          new Error(
            "codex pidió permiso para algo que xonecode no concede a un agente externo: sus escrituras todavía no pasan por la aprobación humana"
          )
        );
        return;
      }

      if (m.method === "item/completed") {
        const item = (m.params as { item?: { type?: string; phase?: string; text?: string } } | undefined)?.item;
        // La respuesta es el `agentMessage` de fase `final_answer`. Los otros items del turno
        // —el mensaje del usuario, el razonamiento, las lecturas— no son la contestación, y
        // quedarse con el último de todos devolvería cualquier cosa.
        if (item?.type === "agentMessage" && item.phase === "final_answer" && typeof item.text === "string") {
          respuesta = item.text;
        }
        return;
      }

      if (m.method === "turn/completed") {
        if (respuesta === undefined) {
          acabar(new Error("codex terminó el turno sin dar una respuesta final"));
          return;
        }
        acabar(undefined, respuesta);
      }
    };

    mandar({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "xonecode", title: "xonecode", version: "0.5.0" },
        capabilities: { experimentalApi: false, requestAttestation: false },
      },
    });
  });
}
