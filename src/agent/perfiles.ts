/**
 * Los PERMISOS de un especialista, con tools de FICHERO (la v1 no usa MCP).
 *
 * Este fichero ya no tiene la lista de especialistas: los cuatro que vivían aquí a fuego
 * son ahora ficheros `.md` (`core/agentes.ts`, `agent/agentesEnDisco.ts`), sembrados la
 * primera vez y editables por el usuario. Lo que se queda es lo que NO puede salir de un
 * fichero: qué se le deniega a todo el mundo, qué tools le tocan a quien escribe y cómo se
 * monta su aprobación humana. Un `.md` puede cambiar el prompt de un agente; no puede
 * concederle leer `/.env`.
 */
import { artefactoFueraDeSitio } from "../core/artefactos.js";
/** Las tools de fichero que monta deepagents sobre el backend. */
export const TOOLS_LECTURA = ["ls", "read_file", "glob", "grep"] as const;
export const TOOLS_ESCRITURA = ["write_file", "edit_file"] as const;

/**
 * Lo que estas tres funciones MIRAN de verdad, y nada más.
 *
 * Antes pedían un `Perfil` entero. Desde que los subagentes son ficheros
 * (`core/agentes.ts`) quien llega aquí es un `Agente`, y las dos formas comparten
 * exactamente estos dos campos: el nombre para poder decirlo en la petición de aprobación,
 * y si escribe o no. Pedir el tipo grande obligaría a convertir un `Agente` en un `Perfil`
 * —o sea a inventarle campos— solo para preguntarle si puede escribir.
 */
export interface QuienDecidePermisos {
  nombre: string;
  soloLectura: boolean;
}

/** Lo que estructuralmente da igual quién seas: nunca se lee ni se escribe. */
export const DENEGADO_SIEMPRE = [
  {
    operations: ["read", "write"] as const,
    paths: ["/.env", "/.env.*", "/.git", "/.git/**", "/.xonecode", "/.xonecode/**"],
    mode: "deny" as const,
  },
  // Las skills son instrucciones del harness, nunca ficheros que el agente pueda alterar.
  { operations: ["write"] as const, paths: ["/skills", "/skills/**"], mode: "deny" as const },
  /**
   * Los ADJUNTOS de una tarea (`core/adjuntos.ts`), de solo lectura por lo mismo que las
   * skills: son material de ENTRADA —los documentos que anexó la persona que creó la
   * tarea—, no ficheros que reescribir. Leerlos es justamente su razón de ser, así que la
   * denegación es solo de `write`.
   *
   * **Y es incondicional, no «solo si están montados».** Medido contra deepagents 1.13.2:
   * sin esta fila, un `write_file` a `/adjuntos/x.txt` en una consola donde la carpeta NO
   * está montada escribe `<raiz>/adjuntos/x.txt` — o sea un fichero del proyecto, con un
   * nombre que la interfaz presenta como «lo que te adjuntaron». Con la fila puesta, las dos
   * situaciones contestan «permission denied» y el disco no se toca (también medido).
   *
   * Esta lista alcanza también al ORQUESTADOR desde el 9-09-2026, y antes no: su
   * `createFilesystemMiddleware` se montaba sin `permissions`, así que las tres denegaciones
   * de aquí eran decorativas para él y su `write_file` contestaba «Successfully wrote» a
   * `/adjuntos/pwn.txt`, a `/skills/pwn.txt` y a `/.env`. Hoy recibe
   * `permisosDe(PERFIL_DEL_ORQUESTADOR)`, que es de solo lectura; lo mide
   * `xoneAgent.orquestador.test.ts`.
   */
  { operations: ["write"] as const, paths: ["/adjuntos", "/adjuntos/**"], mode: "deny" as const },
];

/**
 * Los permisos de un perfil. **Nunca los escribas a mano.**
 *
 * `SubAgent.permissions` REEMPLAZA los del padre, no los fusiona. Así que cada perfil que
 * declare permisos propios tiene que traerse las denegaciones base consigo o las pierde —
 * y perder la de `.env` significa que un especialista «de solo lectura» puede leer las
 * claves del usuario. Esta función es lo único que evita ese olvido.
 */
export function permisosDe(perfil: QuienDecidePermisos) {
  const base = [...DENEGADO_SIEMPRE];
  if (!perfil.soloLectura) return base;
  // OJO para cuando el `probador` sepa hablar con el móvil: este `/**` también deniega
  // `/artefactos/**`, así que un agente de SOLO LECTURA no puede dejar una captura. Hoy no
  // hay ningún productor de solo lectura, así que no se abre un hueco por si acaso — pero
  // el día que lo haya, la excepción va aquí y antes hay que medir el orden de reglas de
  // deepagents (¿gana la primera que casa, o gana la denegación?), porque de eso depende que
  // un `allow` sobre `/artefactos/**` haga algo o sea decorativo.
  return [...base, { operations: ["write"] as const, paths: ["/**"], mode: "deny" as const }];
}

/**
 * Barrera de lectura para tools propias.
 *
 * `FilesystemMiddleware` aplica `permisosDe()` a sus seis herramientas, pero
 * una tool de LangChain añadida por xonecode no pasa por ese middleware. Las
 * rutas protegidas se concentran aquí para que esas tools no abran por accidente
 * `.env`, `.git` ni la carpeta interna del proyecto.
 */
export function puedeLeerRuta(ruta: string): boolean {
  return !(
    ruta === "/.env" ||
    ruta.startsWith("/.env.") ||
    // También `.env` como CARPETA (`/.env/algo`), que no es lo mismo que `/.env.algo` y se
    // caía por el hueco entre los dos: el punto y la barra son caracteres distintos. Salió de
    // atar esta función con `DENEGADO_SIEMPRE` en `escrituraExterna.test.ts`. Raro, sí — pero
    // de esta función depende también que `busquedaRegex` no lea ahí dentro, y denegar una
    // carpeta que nadie tiene no cuesta nada.
    ruta.startsWith("/.env/") ||
    ruta === "/.git" ||
    ruta.startsWith("/.git/") ||
    ruta === "/.xonecode" ||
    ruta.startsWith("/.xonecode/")
  );
}

/**
 * Las tools de fichero que le corresponden a un perfil.
 *
 * **No se le pasa a `SubAgent.tools`**: ese campo es `StructuredTool[]` —objetos, para
 * tools propias— y darle nombres deja al especialista sin capacidades. Las de fichero las
 * monta el `FilesystemMiddleware` desde el backend, y el solo-lectura se impone con
 * `permisosDe()`, que la librería aplica sobre las seis.
 *
 * Esta función se conserva porque describe la intención y la comprueban los tests. El día
 * que se quiera OCULTAR las de escritura (en vez de denegarlas), el sitio es la opción
 * `tools` del `FilesystemMiddleware` — y ahí `read_file` es obligatorio en la lista.
 */
export function toolsDe(perfil: QuienDecidePermisos): string[] {
  return perfil.soloLectura
    ? [...TOOLS_LECTURA]
    : [...TOOLS_LECTURA, ...TOOLS_ESCRITURA];
}

/** Texto de la petición de aprobación, por tool. */
const TEXTO_HITL: Record<string, string> = {
  write_file: "escribir un fichero del proyecto",
  edit_file: "modificar un fichero del proyecto",
};

/**
 * El HITL de un perfil: **sobre las tools de FICHERO**, no sobre las de MCP.
 *
 * Con MCP las escrituras iban a CloudStudio y el disco local estaba denegado entero; ahora
 * las escrituras SON el mecanismo. Si esto no se mueve, la aprobación humana desaparece en
 * silencio y la promesa de que «las escrituras se aprueban» se queda escrita y falsa.
 *
 * `edit` no se ofrece como decisión: no hay interfaz para editar los argumentos antes de
 * aprobar, así que anunciarla sería mentirle al modelo.
 */
export function hitlDe(perfil: QuienDecidePermisos): Record<string, ConfigDeInterrupt> {
  if (perfil.soloLectura) return {};
  const salida: Record<string, ConfigDeInterrupt> = {};
  for (const tool of TOOLS_ESCRITURA) {
    salida[tool] = {
      allowedDecisions: ["approve", "reject"],
      // El nombre del perfil va DENTRO de la descripción por necesidad: el interrupt que
      // llega al runner no dice de qué subagente viene, y `dev` y `mockup` comparten tools.
      description: `[${perfil.nombre}] quiere ${TEXTO_HITL[tool] ?? tool}`,
      when: seDetieneEn,
    };
  }
  return salida;
}

/**
 * ¿Se para el turno a preguntar por ESTA escritura?
 *
 * El predicado `when` de `InterruptOnConfig` (leído en `langchain/agents/middleware/hitl`:
 * «Returns `true` to interrupt or `false` to auto-approve the tool call»), y aquí existe
 * para una sola cosa: **una escritura que el backend va a rechazar de todas formas no puede
 * sacar un modal de aprobación.** Pasaba, y medido: pedir un artefacto en `/artifacts/`
 * enseñaba el diff entero con Aprobar y Rechazar, y aprobarlo no escribía nada —
 * `sinArtefactosEnElProyecto` lo rechaza después—. Un modal cuyo único final posible es un
 * rechazo enseña a aprobar sin mirar, que es exactamente cómo se rompe la aprobación el día
 * que importa.
 *
 * **Esto NO relaja la aprobación, y esa es la parte delicada.** No se salta la pregunta para
 * escribir: se salta para NO escribir. La condición es la MISMA función que usa la guarda del
 * backend —`artefactoFueraDeSitio`, sobre la misma cadena—, así que las dos no pueden
 * discrepar; si discreparan, una escritura al proyecto pasaría sin que nadie la aprobara, que
 * es el único fallo abierto posible por aquí. `perfiles.test.ts` lo ata: para cada ruta,
 * saltarse la pregunta implica que la guarda la rechaza.
 *
 * Lo que pasa después es lo que se busca: la tool corre, el backend devuelve su `{error}` con
 * la ruta buena, y el modelo reintenta en `/artefactos/`.
 */
export function seDetieneEn(peticion: unknown): boolean {
  const args = (peticion as { toolCall?: { args?: Record<string, unknown> } } | null)?.toolCall?.args;
  const ruta = args?.["file_path"];
  if (typeof ruta !== "string") return true;
  // Ante la duda, se PREGUNTA: es la dirección conservadora de siempre.
  return artefactoFueraDeSitio(ruta) === undefined;
}

/**
 * La forma del `interruptOn` de una tool, declarada aquí porque deepagents la reenvía tal
 * cual a `humanInTheLoopMiddleware` sin tipar el `when` en su propia interfaz.
 */
export interface ConfigDeInterrupt {
  allowedDecisions: string[];
  description: string;
  /** Ver `seDetieneEn`. */
  when: (peticion: unknown) => boolean;
}
