/**
 * El adaptador que lanza un agente de OTRO producto sobre la carpeta del proyecto.
 *
 * Dos motores, y cada uno por su camino porque no se parecen en nada. **Claude Code** va
 * por su SDK oficial (`@anthropic-ai/claude-agent-sdk`) y se le deniegan las escrituras con
 * `canUseTool`, un callback nuestro. **Codex** va por su `app-server --stdio`
 * (`subagenteCodex.ts`), y ahí la denegación la hace el SANDBOX del sistema operativo
 * (`sandbox: "read-only"`) — que es más fuerte, porque no depende de que el modelo colabore.
 * En los dos casos entra una tarea autocontenida y sale la respuesta final, y el hijo es una
 * sesión del producto de verdad: su autenticación, sus ajustes y su modelo.
 *
 * **La escritura está DENEGADA, y no por precaución vaga.** El SDK trae `canUseTool`, un
 * callback que recibe cada tool con su entrada entera y contesta permitir o denegar; es
 * exactamente el contrato de nuestra aprobación. Lo que no encaja todavía es el otro lado:
 * el HITL de xonecode son `interrupt()` de LangGraph recogidos por `collectPending`, y
 * reanudar uno reejecuta el nodo desde el principio — o sea, relanzaría el proceso hijo.
 * Hasta que eso esté resuelto, aquí se deniega por LISTA BLANCA: se permiten las tools de
 * lectura conocidas y se deniega todo lo demás, incluido lo que no se reconoce. Una lista
 * negra habría dejado pasar la tool que Claude Code añada mañana.
 *
 * El import del SDK es DINÁMICO a propósito: así `npm test` no lo carga nunca —los tests
 * usan el doble del puerto— y una instalación sin el paquete sigue arrancando, con
 * `disponible` contestando que no en vez de reventar al importar.
 */

import type {
  MotorExterno,
  PeticionExterna,
  SubagenteExternoPort,
} from "../core/ports.js";
import { codexDisponible, correrCodex } from "./subagenteCodex.js";

/**
 * Las tools del hijo que SÍ puede usar: leer y buscar, y nada más.
 *
 * Lista blanca y no negra. Con una negra, cada tool nueva de Claude Code entraría permitida
 * por omisión —y `Bash` sola ya basta para escribir el proyecto entero—; con esta, lo que
 * no se reconoce se deniega y como mucho el hijo se queda corto y lo dice.
 *
 * `TodoWrite` está dentro pese al nombre: es la lista de tareas del propio hijo, vive en su
 * memoria y no toca el disco del proyecto. `WebFetch` y `WebSearch` NO están: no es que
 * escriban, es que sacan el contenido del proyecto fuera de la máquina, y eso no lo decide
 * un especialista.
 */
const TOOLS_DE_LECTURA: ReadonlySet<string> = new Set([
  "Read",
  "Glob",
  "Grep",
  "LS",
  "NotebookRead",
  "TodoWrite",
  "Task",
]);

const MOTIVO_DE_DENEGACION =
  "xonecode solo te deja leer: sus escrituras pasan por una aprobación humana que todavía no " +
  "está conectada a los agentes externos. Explica qué harías en vez de intentar hacerlo.";

/**
 * La decisión sobre una tool del hijo. **Pura y exportada para poder probarla**: es la
 * regla de seguridad de toda esta integración, y probarla llamando al SDK exigiría lanzar
 * un Claude Code de verdad en `npm test` — que es justo lo que este repo no consiente.
 *
 * Deniega por omisión: lo que no está en la lista blanca, no pasa. Incluye lo que no se
 * reconoce, que es el caso que importa — la tool que Claude Code añada en la próxima
 * versión llegará aquí sin que nadie haya tocado este fichero.
 */
export function decisionDeTool(
  nombre: string,
  permitirEscritura: boolean
): { behavior: "allow"; updatedInput: Record<string, unknown> } | { behavior: "deny"; message: string } {
  if (permitirEscritura || TOOLS_DE_LECTURA.has(nombre)) {
    return { behavior: "allow", updatedInput: {} };
  }
  return { behavior: "deny", message: MOTIVO_DE_DENEGACION };
}

/** Si el motor se puede usar de verdad. Sin cachear: el que cachea es quien lo llama. */
async function medirDisponible(motor: MotorExterno): Promise<boolean> {
  if (motor === "codex") return codexDisponible();
  try {
    await import("@anthropic-ai/claude-agent-sdk");
    return true;
  } catch {
    // Sin el paquete no hay motor. No se lanza: quien pregunta está decidiendo si monta el
    // especialista, y una excepción ahí tumbaría la construcción del agente entera por una
    // capacidad opcional.
    return false;
  }
}

export function crearSubagenteExterno(): SubagenteExternoPort {
  const cache = new Map<MotorExterno, boolean>();
  return {
    async disponible(motor: MotorExterno): Promise<boolean> {
      // Se cachea por proceso: `disponible` se pregunta una vez por agente y por
      // construcción del grafo, y comprobar Codex cuesta un `spawn`. La respuesta no cambia
      // a mitad de una sesión salvo que alguien instale el binario con la consola abierta,
      // que es un caso que se arregla reiniciando.
      const visto = cache.get(motor);
      if (visto !== undefined) return visto;
      const hay = await medirDisponible(motor);
      cache.set(motor, hay);
      return hay;
    },

    async correr(peticion: PeticionExterna): Promise<string> {
      if (peticion.motor === "codex") return correrCodex(peticion);
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      const respuesta = query({
        prompt: peticion.tarea,
        options: {
          // La carpeta del proyecto y ninguna otra. El hijo lee de aquí sus propios ajustes
          // (`CLAUDE.md`, `.claude/`) si los hay; xonecode no se los escribe ni se los filtra.
          cwd: peticion.cwd,
          // Sus instrucciones se AÑADEN al preset de Claude Code en vez de sustituirlo: lo
          // que sabe hacer como producto —leer código, buscar, razonar sobre un repo— es la
          // razón de llamarlo, y reemplazar su prompt entero lo dejaría sin ello. Lo que
          // añadimos son las reglas de XOne y su papel, que es lo que no puede saber.
          systemPrompt: { type: "preset", preset: "claude_code", append: peticion.instrucciones },
          // Doble llave. `permissionMode` es la política del propio hijo y `canUseTool` es
          // la nuestra: la primera puede cambiar de significado con una versión del SDK, la
          // segunda la decidimos aquí y es la que manda.
          permissionMode: "dontAsk",
          canUseTool: async (nombre: string) => decisionDeTool(nombre, peticion.permitirEscritura),
        },
      });

      // Se recorre hasta el `result`, que es el cierre del turno. El texto final está ahí y
      // no en el último `assistant`: un turno puede terminar por error y entonces el último
      // mensaje del modelo no es la respuesta.
      for await (const mensaje of respuesta) {
        if (mensaje.type !== "result") continue;
        if (mensaje.subtype !== "success") {
          throw new Error(`${peticion.motor} terminó sin respuesta (${mensaje.subtype})`);
        }
        // `is_error` con subtype «success» significa que el turno acabó en un error de API y
        // el texto ES el error. Devolverlo como si fuera la respuesta del especialista
        // haría que el orquestador se lo creyera.
        if (mensaje.is_error) throw new Error(`${peticion.motor}: ${mensaje.result}`);
        return mensaje.result;
      }
      throw new Error(`${peticion.motor} no devolvió ningún resultado`);
    },
  };
}

/** Los que están cableados de verdad. Los dos, desde que Codex habla por su app-server. */
export const MOTORES_CABLEADOS: ReadonlySet<MotorExterno> = new Set<MotorExterno>([
  "claude-code",
  "codex",
]);
