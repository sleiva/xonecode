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
 * **La escritura se CONCEDE por escritura, una por una.** El SDK trae `canUseTool`, un
 * callback que recibe cada tool con su entrada entera y contesta permitir o denegar. Es
 * asíncrono y corre en NUESTRO proceso, así que se puede esperar ahí a que alguien decida
 * mientras el hijo sigue vivo — y eso es lo que hace innecesario el `interrupt()` de
 * LangGraph, cuyo reanudado reejecuta el nodo y relanzaría el proceso hijo.
 *
 * Tres listas y no dos (`escrituraExterna.ts`): lectura, escritura y denegadas, con lo que
 * no se reconoce denegado igual. Antes era `permitirEscritura || esDeLectura(nombre)`, o sea
 * que el día que se concediera la escritura se concedía TODO — y `Bash` sola basta para
 * escribir el proyecto entero saltándose la política, el diff y las guardas de ruta.
 *
 * El import del SDK es DINÁMICO a propósito: así `npm test` no lo carga nunca —los tests
 * usan el doble del puerto— y una instalación sin el paquete sigue arrancando, con
 * `disponible` contestando que no en vez de reventar al importar.
 */

import type {
  ConsumoExterno,
  MotorExterno,
  PeticionExterna,
  PoliticaDeEscrituraExterna,
  SubagenteExternoPort,
} from "../core/ports.js";
import { codexDisponible, correrCodex } from "./subagenteCodex.js";
import { consumoDeClaude } from "./consumoExterno.js";
import {
  claseDeToolExterna,
  decisionDePreToolUse,
  diffDeEscrituraExterna,
  eventoDeToolExterna,
  veredictoDeLectura,
  motivoDeToolDenegada,
  veredictoDeRuta,
  MOTIVO_DE_ESCRITURA_RECHAZADA,
  MOTIVO_DE_ESCRITURA_ABORTADA,
} from "./escrituraExterna.js";

/**
 * La decisión sobre una tool del hijo. **Exportada para poder probarla**: es la regla de
 * seguridad de toda esta integración, y probarla llamando al SDK exigiría lanzar un Claude
 * Code de verdad en `npm test` — que es justo lo que este repo no consiente. Lo único que no
 * es puro son el `realpath` y la lectura del disco, y los dos entran por parámetro.
 *
 * El orden importa y es el conservador:
 * 1. **La clase de la tool** (`claseDeToolExterna`). Lo que no está en las dos listas
 *    blancas se deniega, `Bash` y `WebFetch` incluidos y con escritura concedida.
 * 2. **El papel.** Un agente de solo lectura no llega a la política: no hay nada que
 *    preguntar sobre una escritura que su `.md` no autoriza.
 * 3. **Las guardas de RUTA del proyecto** (`veredictoDeRuta`), y van ANTES de preguntar:
 *    un modal cuyo único final posible es un rechazo enseña a aprobar sin mirar, que es la
 *    misma razón por la que `seDetieneEn` no pregunta por un artefacto mal puesto.
 * 4. **La política**, con el diff delante. Y sin política no hay escritura: fail-closed por
 *    tipo, el patrón de `core/cloudstudio.ts#PoliticaDeAprobacion`.
 *
 * **Nada de aquí puede lanzar hacia el SDK.** El envoltorio de `correr` atrapa lo que
 * escape y deniega: el comportamiento del SDK ante un `canUseTool` que revienta no está
 * medido, y «no medido» no es una barrera.
 */
export async function decisionDeTool(opciones: {
  nombre: string;
  entrada: Record<string, unknown>;
  peticion: PeticionExterna;
  /** Las del proyecto, para reconocer una vista aplanada. Vacío = ninguna conocida. */
  ficheros: ReadonlySet<string>;
  politica?: PoliticaDeEscrituraExterna;
  /**
   * El del SDK. Si aborta mientras se espera una decisión —el hijo se muere, su propio
   * tope— la respuesta es DENEGAR en el acto en vez de seguir esperando el plazo entero.
   *
   * Sin esto había un «aprobé y no pasó nada»: el hijo ya no está, `pedirAprobacion` sigue
   * esperando hasta diez minutos con el modal delante, la persona aprueba, y lo que resuelve
   * es una promesa que ya nadie lee. Peor que un rechazo, porque se cree que se escribió.
   */
  signal?: AbortSignal;
  real?: (ruta: string) => string;
  leer?: (ruta: string) => string;
}): Promise<PermisoDeTool> {
  const { nombre, entrada, peticion, ficheros, politica, signal } = opciones;
  // Abortado antes de empezar: no se pregunta a nadie por una escritura que ya no va a
  // ocurrir. Sacar un modal para eso enseña a aprobar sin mirar.
  if (signal?.aborted === true) return { behavior: "deny", message: MOTIVO_DE_ESCRITURA_ABORTADA };
  const clase = claseDeToolExterna(nombre);
  if (clase === "lectura") {
    /**
     * Leer también lleva guarda de ruta. Medido corriéndolo, y dicho por el propio hijo:
     * «`.env` — sí pude leerlo». La lista blanca permitía `Read` a secas, sin mirar dónde —
     * desde el primer día, o sea que este agujero no lo abrió la escritura: ya estaba.
     */
    const v = veredictoDeLectura({
      cwd: peticion.cwd,
      nombre,
      entrada,
      ficheros,
      ...(opciones.real === undefined ? {} : { real: opciones.real }),
    });
    return v.admitida ? { behavior: "allow" } : { behavior: "deny", message: v.motivo };
  }
  if (clase !== "escritura") {
    return { behavior: "deny", message: motivoDeToolDenegada(nombre, clase) };
  }
  if (!peticion.permitirEscritura) {
    return { behavior: "deny", message: motivoDeToolDenegada(nombre, clase) };
  }
  if (politica === undefined) {
    // Sin política no hay a quién preguntar, y «no hay a quién preguntar» nunca es «sí».
    // Se dice con palabras porque el modo de fallo es que el hijo no pueda escribir: quien
    // lo lea tiene que poder distinguirlo de un rechazo.
    return {
      behavior: "deny",
      message:
        "xonecode no tiene a quién pedir la autorización de esta escritura en esta sesión, así que no se concede. " +
        "Explica qué querías cambiar.",
    };
  }

  const veredicto = veredictoDeRuta({
    cwd: peticion.cwd,
    ruta: entrada["file_path"],
    ficheros,
    ...(opciones.real === undefined ? {} : { real: opciones.real }),
  });
  if (!veredicto.admitida) return { behavior: "deny", message: veredicto.motivo };

  const lineas = diffDeEscrituraExterna(
    nombre,
    entrada,
    veredicto.ruta,
    ...(opciones.leer === undefined ? [] : ([opciones.leer] as const))
  );
  /**
   * **El `catch` va AQUÍ y no solo en el envoltorio de `correr`.** El de allá vive en un
   * cierre que ningún test puede alcanzar sin lanzar un Claude Code de verdad, o sea que
   * sería la regla escrita y no probada — el patrón de fallo que este repo lleva medido
   * siete veces. Aquí sí se prueba: una política que revienta es un NO.
   *
   * Y reventar es alcanzable de verdad, no hipotético: el «sin humano» de `cli/run.ts`
   * corta LANZANDO desde `pedirAprobacion`.
   */
  let concedida = false;
  // Se apunta aparte: después de la guarda de arriba TypeScript ya sabe que `aborted` era
  // falso, así que releerlo al final no distingue «me dijeron que no» de «se canceló».
  let abortada = false;
  try {
    concedida = await (signal === undefined
      ? politica([{ agente: peticion.agente, ruta: veredicto.ruta, lineas }])
      : // Se corre contra el `signal`, y gana el primero. `pedirAprobacion` no tiene
        // cancelación, así que lo que NO se puede hacer todavía es cerrar el modal que se
        // queda huérfano: sigue delante hasta que alguien lo conteste o venza su plazo, y
        // su respuesta no autoriza nada. Deuda declarada; cerrarlo exige un canal nuevo
        // hacia las tres pieles.
        Promise.race([
          politica([{ agente: peticion.agente, ruta: veredicto.ruta, lineas }]),
          new Promise<boolean>((resuelto) => {
            // Se relee AQUÍ, y no es redundante con la guarda de arriba: medido con un test
            // que se colgaba cinco segundos, un `signal` que aborta entre las dos líneas
            // —o durante el propio `politica(...)`, que corre ANTES de que esta promesa se
            // construya— nunca dispara su evento, porque `addEventListener("abort")` sobre
            // uno ya abortado no llama a nadie. Sin esta línea la carrera no resolvía nunca
            // y el turno se quedaba colgado esperando a un hijo muerto.
            if (signal.aborted) {
              abortada = true;
              resuelto(false);
              return;
            }
            signal.addEventListener(
              "abort",
              () => {
                abortada = true;
                resuelto(false);
              },
              { once: true }
            );
          }),
        ]));
  } catch {
    concedida = false;
  }
  if (!concedida) {
    return {
      behavior: "deny",
      message: abortada ? MOTIVO_DE_ESCRITURA_ABORTADA : MOTIVO_DE_ESCRITURA_RECHAZADA,
    };
  }
  // `updatedInput` se OMITE a propósito: por el TIPO del SDK es opcional y ausente
  // significa «no toco la entrada», que es exactamente lo que queremos. Antes se mandaba
  // `{}`, que por ese mismo tipo se lee como «la entrada es este objeto vacío». Qué hacía
  // el SDK con aquello **no está medido** —nunca se ha lanzado un hijo de Claude Code desde
  // este repo—, así que no se afirma que lo ignorara: se manda la forma que su contrato
  // declara para «sin cambios».
  return { behavior: "allow" };
}

/** Lo que `canUseTool` puede contestar. La forma la pone el SDK; se redeclara para no importarlo. */
export type PermisoDeTool =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string };

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

/**
 * El adaptador real, con quien autoriza dentro.
 *
 * **Las opciones son obligatorias aunque sus campos no lo sean**, y eso es deliberado: pedir
 * el objeto obliga a pasar por cada llamador el día que esto cambie, y un campo ausente
 * falla CERRADO —sin política no se escribe— en vez de abrir una puerta en silencio. Es la
 * única dirección aceptable para el patrón de fallo que este repo ya ha medido siete veces:
 * una composición que vive en un cierre que los tests doblan.
 */
export function crearSubagenteExterno(opciones: {
  /**
   * Quién autoriza cada escritura del hijo. Ausente = ninguna escritura, con su motivo.
   *
   * Lo pone quien monta la sesión porque es quien sabe QUIÉN está detrás: una consola de
   * persona pasa su `pedirAprobacion` (el diff y la espera) y una tarea de fondo pasa el
   * suyo, que concede porque la autorización fue crear la tarea. La traducción de uno al
   * otro es `escrituraExterna.ts#politicaDeAprobacionExterna`.
   */
  aprobarEscritura?: PoliticaDeEscrituraExterna;
  /**
   * Los ficheros del proyecto, para reconocer una vista aplanada (`X.xml` con su `X.xne`).
   *
   * Es una FUNCIÓN y no una lista: el hijo escribe durante el turno, así que una lista
   * congelada al construir la sesión no vería el `.xne` que se acaba de crear — y entonces
   * su `.xml` aplanado dejaría de reconocerse como tal.
   */
  ficherosDelProyecto?: () => ReadonlySet<string>;
  /**
   * Qué está haciendo el hijo, MIENTRAS lo hace.
   *
   * Existe por un silencio medido en la pantalla del usuario: el hijo corre en otro proceso
   * y ni una de sus tools cruza el stream del grafo, así que entre la línea de delegación y
   * su respuesta final hay minutos sin nada que mirar — y una pantalla quieta se lee como
   * que se ha colgado. Quien lo recibe lo mete en el MISMO flujo de eventos
   * (`core/entrelazar.ts`), para que el colapsador lo agrupe como cualquier otra tool.
   *
   * Se llama desde el hook `PreToolUse`, que es el único punto por el que pasan TODAS: a
   * `canUseTool` no llegan las lecturas, porque un `allow` del hook es una pre-aprobación y
   * el callback ya no se consulta (medido).
   */
  alUsarTool?: (tool: { nombre: string; detalle?: string }) => void;
  /**
   * Lo que el hijo consumió, al terminar. Los dos motores lo reportan y hasta ahora se
   * tiraba entero (`agent/consumoExterno.ts` explica de dónde sale cada uno).
   *
   * Va por su propio callback y no dentro de la respuesta porque son dos cosas distintas:
   * la respuesta es lo que el especialista contesta, y esto es contabilidad.
   */
  alConsumir?: (consumo: ConsumoExterno) => void;
}): SubagenteExternoPort {
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
      if (peticion.motor === "codex") {
        /**
         * **Las cuatro costuras van aquí, y este es exactamente el sitio donde este repo ha
         * fallado nueve veces**: una regla de producción compuesta dentro de algo que todos
         * los tests doblan. `aprobar` y `ficheros` son opcionales, así que olvidarlos deja
         * los dos `tsc` limpios y el agente sin poder escribir NADA —o, peor, escribiendo
         * sin que las guardas de ruta lo vean—. Por eso la decisión entera vive extraída en
         * `escrituraDeCodex.ts#decisionDeEscrituraDeCodex` y aquí solo queda el cableado,
         * que tiene un test por argumento.
         */
        return correrCodex(peticion, {
          ...(opciones.alConsumir === undefined
            ? {}
            : { alConsumir: (c) => opciones.alConsumir?.({ motor: "codex", ...c }) }),
          ...(opciones.aprobarEscritura === undefined ? {} : { aprobar: opciones.aprobarEscritura }),
          // `real` no se pasa: aquí no hay ninguno que inyectar y el de omisión es
          // `realpathSync`, que es el de producción. Quien lo dobla es el test de
          // `decisionDeEscrituraDeCodex`, que es donde vive la guarda.
          ficheros: () => opciones.ficherosDelProyecto?.() ?? new Set<string>(),
        });
      }
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
          /**
           * **`"default"` y no `"dontAsk"`, y el motivo es que ninguno de los dos es seguro
           * por suposición.** Leídas sus descripciones en el SDK: `dontAsk` es «deny if not
           * pre-approved», así que podría denegar la escritura ANTES de consultar nuestro
           * callback y dejar toda esta función muerta con los tests en verde; `default` es
           * «prompts for dangerous operations», así que podría aprobar una tool «no
           * peligrosa» —`WebSearch`, que saca el proyecto de la máquina— sin consultarnos.
           * El primero falla cerrado y el segundo abierto.
           *
           * Lo que resuelve la elección es que ya no depende del modo: el hook `PreToolUse`
           * de abajo contesta las tres clases explícitamente, así que no queda ninguna tool
           * para que la decida el modo. Con eso se elige `default`, que es el modo donde la
           * decisión `ask` del hook SÍ llega a `canUseTool` («the 'ask' path surfaces via a
           * can_use_tool control_request»), que es donde se puede esperar a una persona.
           */
          permissionMode: "default",
          /**
           * **La denegación de verdad vive aquí**, no en `canUseTool`: una regla `allow` de
           * un `settings.json` puede ensombrecer el callback, y un deny del hook «resuelve
           * antes de que `canUseTool` corra». Las dos citas son del propio SDK.
           *
           * Y las dos llaves siguen puestas, que es lo que hace que esto sea robusto en vez
           * de listo: si el hook no llegara a correr, `canUseTool` aplica las MISMAS tres
           * listas (es la misma función); si `canUseTool` se ensombreciera, el hook ya negó
           * lo que no toca y una escritura quedaría en `ask` sin nadie que la conceda.
           */
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  // El tipo del callback es la unión de TODOS los eventos de hook, así que
                  // el nombre de la tool se lee con cuidado en vez de afirmarlo: por aquí
                  // solo llegan `PreToolUse`, pero una entrada sin `tool_name` no puede
                  // decidir nada — y ante la duda, denegar (cadena vacía no está en ninguna
                  // lista blanca, así que `decisionDePreToolUse` contesta «deny»).
                  async (entrada) => {
                    const nombre = "tool_name" in entrada ? entrada.tool_name : "";
                    const cruda = "tool_input" in entrada ? entrada.tool_input : undefined;
                    const args =
                      typeof cruda === "object" && cruda !== null
                        ? (cruda as Record<string, unknown>)
                        : {};
                    const decision = decisionDePreToolUse({
                      nombre,
                      entrada: args,
                      cwd: peticion.cwd,
                      ficheros: opciones.ficherosDelProyecto?.() ?? new Set<string>(),
                    });
                    /**
                     * **Solo se cuenta lo que va a ocurrir.** Una tool DENEGADA no se
                     * anuncia: la línea diría que el hijo hizo algo que no hizo, y este
                     * repo no tiene ningún sitio donde eso sea aceptable. `ask` sí se
                     * cuenta —es una escritura propuesta—, que es exactamente lo que el
                     * flujo del grafo ya hace con un `write_file` antes de su aprobación.
                     */
                    if (decision.permissionDecision !== "deny") {
                      opciones.alUsarTool?.(eventoDeToolExterna(nombre, args, peticion.cwd));
                    }
                    return { hookSpecificOutput: decision };
                  },
                ],
              },
            ],
          },
          /**
           * **Los ajustes del PROYECTO no se cargan, y esto cierra un agujero que ya estaba
           * abierto.** Medido en el propio SDK (`sdk.mjs`, el aviso
           * `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`): «Allow rules from settings files can also
           * shadow the callback». O sea que una regla `allow` en un `settings.json` hace que
           * `canUseTool` **no se invoque** — y por omisión el SDK carga las tres fuentes,
           * incluida `.claude/settings.json` de dentro del `cwd`. Ese fichero viene de
           * CloudStudio con el proyecto, o sea de fuera: es exactamente el argumento por el
           * que `seAplicaSinAprobacion` vive en `settings.json` y no en el `config.json` del
           * proyecto. Con las tres fuentes cargadas, quien te pasa un proyecto decidía si
           * tus barreras se aplican.
           *
           * Se queda `"user"`: son los ajustes del dueño de la máquina —su autenticación,
           * sus MCP, su modelo—, que es la misma confianza que ya se declara para Codex («el
           * hijo es el Codex DEL USUARIO, con sus MCP, sus plugins y sus hooks»). Lo que se
           * va es lo que puede venir en un zip.
           *
           * Coste dicho: sin `"project"` el hijo tampoco carga el `CLAUDE.md` del proyecto
           * (lo dice su propia documentación de esta opción). No se pierde el papel: sus
           * instrucciones y las reglas de XOne van por `systemPrompt.append`, que es de
           * donde salen de verdad.
           *
           * Y queda DECLARADO lo que esto no cierra: un `allow` en los ajustes GLOBALES del
           * usuario sigue pudiendo ensombrecer el callback. El cierre robusto que el propio
           * SDK nombra es un hook `PreToolUse`, que no se ensombrece; no está puesto todavía.
           */
          settingSources: ["user"],
          // El modelo del PRODUCTO, si el `.md` lo pide. Ausente = el que Claude Code use
          // por su cuenta, que es lo que hacía siempre. Los alias (`opus`, `sonnet`…) son
          // los que su propio SDK documenta, y se prefieren a un id pinchado: sobreviven a
          // la siguiente versión, que es justo para lo que el producto los ofrece.
          ...(peticion.modelo === undefined ? {} : { model: peticion.modelo }),
          /**
           * El envoltorio es el fail-closed llevado al final: **nada de aquí dentro puede
           * lanzar hacia el SDK**. Si la política revienta, si el disco contesta un EACCES
           * al canonicalizar o si alguien introduce un fallo en las guardas, la respuesta es
           * DENEGAR — nunca una excepción, cuyo tratamiento en la máquina de permisos del
           * SDK no está medido, y nunca un permiso.
           */
          canUseTool: async (
            nombre: string,
            entrada: Record<string, unknown>,
            contexto: { signal: AbortSignal }
          ) => {
            try {
              return await decisionDeTool({
                nombre,
                entrada,
                peticion,
                signal: contexto.signal,
                ficheros: opciones.ficherosDelProyecto?.() ?? new Set<string>(),
                ...(opciones.aprobarEscritura === undefined
                  ? {}
                  : { politica: opciones.aprobarEscritura }),
              });
            } catch {
              return {
                behavior: "deny" as const,
                message:
                  "xonecode no pudo decidir sobre esa llamada, así que no se concede. Explica qué querías hacer.",
              };
            }
          },
        },
      });

      // Se recorre hasta el `result`, que es el cierre del turno. El texto final está ahí y
      // no en el último `assistant`: un turno puede terminar por error y entonces el último
      // mensaje del modelo no es la respuesta.
      for await (const mensaje of respuesta) {
        if (mensaje.type !== "result") continue;
        if (mensaje.subtype !== "success") {
          opciones.alConsumir?.({ motor: "claude-code", ...consumoDeClaude(mensaje) });
          throw new Error(`${peticion.motor} terminó sin respuesta (${mensaje.subtype})`);
        }
        // `is_error` con subtype «success» significa que el turno acabó en un error de API y
        // el texto ES el error. Devolverlo como si fuera la respuesta del especialista
        // haría que el orquestador se lo creyera.
        // El consumo se apunta ANTES de contestar, y también cuando el turno acabó en
        // error: esos tokens se gastaron igual. Contar solo los éxitos haría que la cifra
        // bajara justo en los turnos que más cuestan.
        opciones.alConsumir?.({ motor: "claude-code", ...consumoDeClaude(mensaje) });
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
