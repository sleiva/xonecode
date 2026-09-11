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
 * **El sandbox es `read-only` SIEMPRE, y lo que abre la escritura es el `approvalPolicy`.**
 * Esa es la decisión central y está medida (11-09-2026, tres ejecuciones): con
 * `sandbox: "workspace-write"` las escrituras dentro del cwd ocurren solas y no vuelven a
 * xonecode, o sea que ninguna de sus guardas de ruta las vería. Con `read-only` la caja del
 * sistema operativo sigue siendo la denegación —no depende de que el modelo colabore— y
 * `approvalPolicy: "on-request"` convierte cada escritura en una PETICIÓN que contestamos
 * nosotros: el mismo papel que el `ask` del hook `PreToolUse` en Claude Code. Medido:
 * contestando `accept` el fichero se escribe, y contestando `decline` no queda fichero, el
 * item queda `declined` y el turno SIGUE, así que el agente puede contarlo. Sin escritura
 * concedida se manda `never`, que evita que el hijo se quede esperando a alguien.
 *
 * **Lo que se decide y lo que se pregunta llegan en mensajes DISTINTOS.** La petición
 * (`item/fileChange/requestApproval`) trae solo un `itemId`; los ficheros vinieron antes, en
 * el `item/started` de ese id. De ahí el registro de items de aquí abajo: sin él no hay diff
 * que enseñar, y sin diff no hay decisión que tomar. La traducción de esos cambios a lo que
 * las pieles pintan, y las guardas de ruta reaplicadas, viven en `escrituraDeCodex.ts`.
 *
 * **Lo que no se sabe decir que no, se ABORTA.** Se contestan las peticiones cuyo «no» está
 * en su esquema (`{decision:"decline"}` para fichero, comando y permisos;
 * `{action:"decline"}` para una elicitación de MCP). `item/tool/requestUserInput` no tiene
 * «no» —su respuesta es `{answers:{…}}` y nada más—, así que ahí se aborta, igual que ante
 * cualquier petición que no esté nombrada. Lo que NUNCA se puede hacer es dejarla sin
 * contestar: eso deja a codex bloqueado hasta que el tope lo mate.
 *
 * Y una consecuencia que hay que saber: el hijo es el Codex DEL USUARIO, con su
 * configuración —sus MCP, sus plugins, sus hooks y sus skills—. Medido: al abrir el hilo
 * arrancan los servidores MCP que tenga puestos. xonecode no los filtra ni los toca.
 */

import { spawn } from "node:child_process";
import type { PeticionExterna, PoliticaDeEscrituraExterna } from "../core/ports.js";
import { consumoDeCodex } from "./consumoExterno.js";
import { decisionDeEscrituraDeCodex } from "./escrituraDeCodex.js";

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

export async function correrCodex(
  peticion: PeticionExterna,
  opciones: {
    /** Lo que el hilo lleva consumido. Se avisa al terminar, con el último total visto. */
    alConsumir?: (consumo: { entrada: number; salida: number; cache: number }) => void;
    /** Quién autoriza cada escritura. Ausente = no se escribe ninguna, y se dice por qué. */
    aprobar?: PoliticaDeEscrituraExterna;
    /**
     * Los del proyecto AHORA, para reconocer una vista aplanada. Es una FUNCIÓN y no una
     * lista por lo mismo que en `crearSubagenteExterno`: el hijo escribe durante el turno.
     */
    ficheros?: () => ReadonlySet<string>;
    /** El `realpath`, inyectado para poder probar la guarda sin tocar disco. */
    real?: (ruta: string) => string;
  } = {}
): Promise<string> {
  const { alConsumir } = opciones;
  const hijo = spawn(binarioDeCodex(), ["app-server", "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: peticion.cwd,
  });

  return new Promise<string>((cumplir, fallar) => {
    let buffer = "";
    let hilo: string | undefined;
    let respuesta: string | undefined;
    let terminado = false;
    /** El último `tokenUsage.total` visto: es acumulado, así que el último es el bueno. */
    let consumo: { entrada: number; salida: number; cache: number } | undefined;
    /**
     * Los cambios de cada item de fichero, por su id.
     *
     * Existe porque `item/fileChange/requestApproval` trae un `itemId` y NADA más: las rutas
     * y los diffs llegaron antes, en el `item/started` de ese id. Un id del que no consta
     * item es un `decline`: decidir a ciegas sobre una escritura es justo lo que este camino
     * existe para impedir.
     */
    const cambiosPorItem = new Map<string, unknown>();

    /**
     * Cuántas aprobaciones están ahora mismo delante de alguien.
     *
     * **Con una pendiente el reloj se PARA**, y no es un detalle: el tope mide «codex no
     * contesta», y el tiempo que tarda una persona en mirar un diff no es eso. Sin esto, un
     * humano que se levanta a por un café vuelve a un «codex no terminó en 10 minutos» y a
     * un modal huérfano cuyo turno ya está muerto.
     */
    let aprobando = 0;
    let reloj: ReturnType<typeof setTimeout> | undefined;

    const pararReloj = (): void => {
      if (reloj !== undefined) clearTimeout(reloj);
      reloj = undefined;
    };
    const armarReloj = (): void => {
      if (terminado || aprobando > 0) return;
      pararReloj();
      reloj = setTimeout(
        () => acabar(new Error(`codex no terminó en ${Math.round(TOPE_MS / 60000)} minutos`)),
        TOPE_MS
      );
    };

    const acabar = (error?: Error, texto?: string): void => {
      if (terminado) return;
      terminado = true;
      pararReloj();
      hijo.kill();
      // El consumo se dice SIEMPRE que se sepa, también cuando el turno acaba en error o se
      // agota el tope: esos tokens se gastaron igual, y contar solo los éxitos haría que la
      // cifra bajara justo en los turnos que más cuestan.
      if (consumo !== undefined) alConsumir?.(consumo);
      if (error !== undefined) fallar(error);
      else cumplir(texto ?? "");
    };

    armarReloj();

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

    /**
     * Una petición del SERVIDOR: lleva `id` **y** `method`, y hay que contestarla.
     *
     * **Va antes que todo lo demás, y eso importa**: medido, los ids del servidor empiezan
     * en 0 y viven en el mismo espacio de números que los nuestros, así que una petición con
     * `id: 1` caería en la rama del `initialize` si esto se mirara después. Nuestras
     * respuestas llevan `id` y NO llevan `method`; esa es la única diferencia fiable.
     */
    const atenderPeticion = (id: number, metodo: string, params: Record<string, unknown> | undefined): void => {
      if (metodo === "item/fileChange/requestApproval") {
        const itemId = params?.["itemId"];
        const cambios = typeof itemId === "string" ? cambiosPorItem.get(itemId) : undefined;
        if (cambios === undefined) {
          // Un id del que no consta item: no hay diff que enseñar, así que no hay decisión
          // que tomar y la respuesta es NO.
          mandar({ id, result: { decision: "decline" } });
          return;
        }
        aprobando += 1;
        pararReloj();
        void decisionDeEscrituraDeCodex({
          cwd: peticion.cwd,
          agente: peticion.agente,
          cambios,
          ficheros: opciones.ficheros?.() ?? new Set<string>(),
          ...(opciones.real === undefined ? {} : { real: opciones.real }),
          // La primera puerta es el papel del `.md`: a un agente de solo lectura no se le
          // pregunta a nadie, se le dice que no.
          ...(peticion.permitirEscritura && opciones.aprobar !== undefined ? { aprobar: opciones.aprobar } : {}),
        })
          .then(
            ({ concedida }) => mandar({ id, result: { decision: concedida ? "accept" : "decline" } }),
            // `decisionDeEscrituraDeCodex` no lanza, pero si algún día lo hiciera, dejar la
            // petición sin contestar colgaría a codex hasta el tope: el «no» es la
            // respuesta, nunca el silencio.
            () => mandar({ id, result: { decision: "decline" } })
          )
          .finally(() => {
            aprobando -= 1;
            armarReloj();
          });
        return;
      }
      /**
       * El análogo de `Bash`, y por eso se deniega siempre: un `cat > fichero` escribe el
       * proyecto entero y no hay diff que componer con el que decidir. Es la misma razón por
       * la que `Bash` está en las tools DENEGADAS del otro motor.
       *
       * Nunca `acceptForSession` ni `grantRoot`: los dos son una pre-aprobación de sesión, y
       * lo que aquí se autoriza es una escritura concreta con su diff delante.
       */
      if (metodo === "item/commandExecution/requestApproval") {
        mandar({ id, result: { decision: "decline" } });
        return;
      }
      // Una elicitación de un MCP del usuario: su esquema sí tiene un «no» limpio.
      if (metodo === "mcpServer/elicitation/request") {
        mandar({ id, result: { action: "decline" } });
        return;
      }
      /**
       * Lo que no se sabe decir que no, se ABORTA con su motivo — y lo que no está nombrado
       * arriba entra aquí. `item/tool/requestUserInput` no tiene «no» en su esquema (su
       * respuesta es `{answers:{…}}` y nada más) y `item/permissions/requestApproval` tampoco
       * (`{permissions, scope, strictAutoReview}`), así que contestarles exigiría inventarse
       * una forma que nadie ha medido. Abortar es la denegación honesta: el proceso muere y
       * no se ha concedido nada.
       */
      acabar(new Error(`codex pidió algo que xonecode no sabe denegar sin inventarse la respuesta: ${metodo}`));
    };

    const atender = (m: Mensaje): void => {
      if (m.error !== undefined) {
        acabar(new Error(`codex: ${m.error.message ?? "error sin mensaje"}`));
        return;
      }
      if (m.id !== undefined && m.method !== undefined) {
        atenderPeticion(m.id, m.method, m.params);
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
            /**
             * **La palanca de la escritura es ESTA, no el sandbox.** Con `on-request` cada
             * escritura llega como una petición que contestamos; con `never` el hijo no
             * pide nada y el sandbox se lo deniega sin que nadie espere a nadie.
             */
            approvalPolicy: peticion.permitirEscritura ? "on-request" : "never",
            /**
             * **`read-only` SIEMPRE**, también con la escritura concedida. Es la caja del
             * sistema operativo, y dejarla en `workspace-write` haría que las escrituras de
             * dentro del cwd ocurrieran solas: sin petición, sin diff y sin pasar por
             * ninguna guarda de ruta de xonecode. Medido: con `read-only` y un `accept`, el
             * fichero se escribe igual.
             */
            sandbox: "read-only",
            // El modelo, si el `.md` lo pide. `ThreadStartParams.model` existe —comprobado
            // contra el esquema que el propio binario genera (`app-server
            // generate-json-schema`)—, y sus valores son los que devuelve `model/list`.
            ...(peticion.modelo === undefined ? {} : { model: peticion.modelo }),
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
      /**
       * El consumo del hilo. **Estaba en la lista de RUIDO**, o sea que este dato llevaba
       * llegando desde el primer día y se tiraba. Se guarda el ÚLTIMO y no se suman: por el
       * esquema del propio binario, `tokenUsage.total` es acumulado del hilo.
       */
      if (m.method === "thread/tokenUsage/updated") {
        const c = consumoDeCodex(m.params);
        if (c !== undefined) consumo = c;
        return;
      }
      if (m.method === undefined || RUIDO.has(m.method)) return;

      /**
       * El registro de items de fichero. Se apunta en los TRES flancos y no solo en
       * `item/started`: el que trae los cambios es ése —llega antes que la petición—, pero
       * un `item/updated` puede corregirlos y quedarse con el último es lo correcto.
       */
      if (m.method === "item/started" || m.method === "item/updated" || m.method === "item/completed") {
        const item = (m.params as { item?: { type?: string; id?: string; changes?: unknown } } | undefined)?.item;
        if (item?.type === "fileChange" && typeof item.id === "string" && Array.isArray(item.changes)) {
          cambiosPorItem.set(item.id, item.changes);
        }
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
