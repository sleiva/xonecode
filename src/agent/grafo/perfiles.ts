/**
 * Los PERMISOS de un especialista, con tools de FICHERO (la v1 no usa MCP).
 *
 * Este fichero ya no tiene la lista de especialistas: los cuatro que vivían aquí a fuego
 * son ahora ficheros `.md` (`core/agentes.ts`, `agent/subagentes/agentesEnDisco.ts`), sembrados la
 * primera vez y editables por el usuario. Lo que se queda es lo que NO puede salir de un
 * fichero: qué se le deniega a todo el mundo, qué tools le tocan a quien escribe y cómo se
 * monta su aprobación humana. Un `.md` puede cambiar el prompt de un agente; no puede
 * concederle leer `/.env`.
 */
import { esRutaDeArtefacto, RUTA_ARTEFACTOS } from "../../core/artefactos.js";
import { esRutaDePlan, RUTA_PLANES } from "../../core/planes.js";
import { artefactoFueraDeSitio } from "../../core/artefactos.js";
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
  /**
   * Las carpetas del PROYECTO donde este agente sí puede escribir, aunque sea de solo
   * lectura. Ausente o vacía = ninguna, que es como se ha comportado siempre.
   *
   * Nace del documentador: su trabajo es dejar un manual en `doc/`, y sin esto la única
   * forma de dárselo era quitarle el `soloLectura` — o sea, dejarle tocar el código
   * entero para que pudiera escribir un `.md`. Esto parte esas dos cosas: puede escribir
   * DONDE se le diga y en ningún otro sitio.
   *
   * Son rutas VIRTUALES del backend (`/doc/`), no de la máquina, y se comparan por
   * prefijo de SEGMENTO: `/doc` no abre `/documentos`.
   */
  escribeEn?: readonly string[];
}

/**
 * ¿Cae `ruta` dentro de `carpeta`? Por SEGMENTO y no por texto.
 *
 * `"/documentos/x".startsWith("/doc")` es cierto y sería un agujero: conceder `/doc`
 * abriría cualquier carpeta que empiece igual. Se normaliza la carpeta con su barra final
 * y se admite además la ruta exacta, para que `escribeEn: ["/doc"]` y `["/doc/"]` digan
 * lo mismo — quien escribe un `.md` no tiene por qué saber cuál de las dos esperamos.
 */
export function dentroDeCarpeta(ruta: string, carpeta: string): boolean {
  const base = carpeta.endsWith("/") ? carpeta : `${carpeta}/`;
  return ruta === carpeta.replace(/\/$/, "") || ruta.startsWith(base);
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
  /**
   * **`escribeEn` ACOTA aunque el agente no sea de solo lectura, y eso desacopla dos cosas
   * que `soloLectura` tenía pegadas.**
   *
   * Ese campo decide los permisos Y el MODELO: `xoneAgent.ts` da `rapido` a quien solo lee
   * y `trabajo` a quien escribe. Es la trampa que este repo ya tiene escrita para
   * `ejecucion` —«se refiere a los ficheros pero además elige el modelo, así que marcarlo
   * miente dos veces»—, y con el documentador muerde igual: su trabajo ES escribir, y
   * marcarlo `soloLectura` para confinarlo le daba el modelo barato justo a quien más
   * necesita el bueno.
   *
   * Con esto se pueden pedir las dos cosas por separado: `soloLectura: false` para que
   * corra con el modelo de trabajo, y `escribeEn: [/doc/]` para que siga sin poder tocar
   * el código. Quien no declare `escribeEn` se comporta exactamente como antes.
   */
  const acotado = (perfil.escribeEn ?? []).length > 0;
  if (!perfil.soloLectura && !acotado) return base;
  /**
   * **Un agente de SOLO LECTURA sí puede dejar ARTEFACTOS, y la medida que lo permite está
   * hecha.** Este `/**` también denegaba `/artefactos/**`, así que un productor sin shell no
   * podía dejar nada escrito —un análisis, un plan, un informe— aunque no tocara el proyecto.
   * `device-controller` los deja por otro camino, un comando, que no pasa por aquí, y por eso
   * su anuncio vive aparte (`proyecto.ts#anunciarArtefactosDeLaShell`).
   *
   * La duda que quedaba anotada era si un `allow` haría algo o sería decorativo. **Medido
   * contra la librería**: `decidePathAccess` es *first-match-wins* con default permisivo, y su
   * propio docstring lo dice. O sea que la excepción funciona **si va delante** del `deny`
   * general — y por eso el orden de estas tres líneas no es estilo, es la regla.
   *
   * Va DETRÁS de `DENEGADO_SIEMPRE` a propósito: con first-match-wins, eso es lo que mantiene
   * ganando a `/.env`, `/.git` y `/.xonecode`. Delante de ellas, un patrón más ancho escrito
   * mañana los abriría.
   *
   * Y lo que concede está acotado por construcción: `/artefactos/` no es del proyecto, no
   * entra en git, no sube a CloudStudio, no pasa por aprobación —por eso se ANUNCIA con su
   * evento— y `artefactoFueraDeSitio` ya impide que nada de ahí acabe dentro de la app.
   */
  return [
    ...base,
    /**
     * Las carpetas que el agente declara en su `escribeEn`, y van DELANTE del `deny`
     * general por lo mismo que las otras dos: *first-match-wins*. Detrás no harían nada.
     *
     * Siguen DETRÁS de `DENEGADO_SIEMPRE`, así que un `escribeEn: ["/.git"]` escrito en un
     * `.md` no abre nada: lo que un fichero puede cambiar es el prompt de un agente, no
     * concederle `/.env`.
     */
    ...(perfil.escribeEn ?? []).map((carpeta) => ({
      operations: ["write"] as const,
      paths: [`${carpeta.endsWith("/") ? carpeta : `${carpeta}/`}**`],
      mode: "allow" as const,
    })),
    { operations: ["write"] as const, paths: [`${RUTA_ARTEFACTOS}**`], mode: "allow" as const },
    // Y los PLANES, por lo mismo: quien analiza escribe el plan y quien desarrolla marca ahí
    // lo hecho, así que los dos tienen que poder escribir — y ninguno de los dos está tocando
    // el proyecto. `.xonecode/planes/` no entra en git ni sube a CloudStudio.
    { operations: ["write"] as const, paths: [`${RUTA_PLANES}**`], mode: "allow" as const },
    { operations: ["write"] as const, paths: ["/**"], mode: "deny" as const },
  ];
}

/**
 * Las tools de fichero de un agente con EJECUCIÓN.
 *
 * `read_file` tiene que estar siempre (lo exige el middleware). Lo que NO está son
 * `write_file` y `edit_file`: no porque no pueda escribir —con una shell puede, y fingir lo
 * contrario sería peor que no decir nada— sino para que el camino normal de tocar el
 * proyecto siga siendo el que pasa por la aprobación y por el diff. Quien escribe el proyecto
 * es `developer-xone`; éste conduce un aparato.
 */
export const TOOLS_CON_EJECUCION = ["read_file", "ls", "glob", "grep", "execute"] as const;

/** Lo que este módulo mira para decidir si un agente ejecuta. */
export interface QuienDecideEjecucion extends QuienDecidePermisos {
  ejecucion?: boolean;
  motor?: string;
}

/**
 * Si a este agente le toca la shell.
 *
 * Dos condiciones, y la segunda no es una formalidad: en los tres motores EXTERNOS la shell
 * está cerrada a propósito (`Bash` denegada, la tool retirada, el sandbox `read-only`) y el
 * hijo corre en otro proceso donde este campo no manda nada. Honrarlo ahí sería prometer una
 * capacidad que no llega; ignorarlo en silencio, esconder que no llega. Se decide aquí, en un
 * sitio, y la ventana de Ajustes lo cuenta.
 */
export function puedeEjecutar(perfil: QuienDecideEjecucion): boolean {
  return perfil.ejecucion === true && (perfil.motor ?? "modelo") === "modelo";
}

/**
 * Con qué backend y con qué reglas se le montan las tools de fichero a un especialista.
 *
 * Existe como función PURA y exportada por el patrón de fallo de este repo: compuesto dentro
 * de `construirAgente` —que todos sus tests doblan— «este agente lleva shell y aquél no»
 * quedaría escrito y sin probar, y el síntoma sería el peor de todos: todo en verde y un
 * especialista corriente con una shell, o el de dispositivos sin ella y sin error que leer.
 *
 * **Y `permissions` NO se pasa con un backend ejecutable.** No es una elección: deepagents
 * LANZA (`ConfigurationError`) si se combinan, porque «los comandos alcanzan cualquier ruta
 * independientemente de las reglas de ruta». O sea que la biblioteca se niega a sostener una
 * barrera que no sería verdad — y esa negativa es la razón por la que esto se concede a UN
 * agente y se declara en su fichero.
 */
export function montajeDeFicheros<B>(
  perfil: QuienDecideEjecucion,
  backends: { normal: B; conShell?: B },
): { backend: B; permissions?: ReturnType<typeof permisosDe>; tools?: typeof TOOLS_CON_EJECUCION } {
  if (!puedeEjecutar(perfil) || backends.conShell === undefined) {
    return { backend: backends.normal, permissions: permisosDe(perfil) };
  }
  return { backend: backends.conShell, tools: TOOLS_CON_EJECUCION };
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
 * ¿Puede ESTE agente escribir en ESTA ruta? El espejo de `permisosDe`, como predicado.
 *
 * Existe porque **una tool propia no pasa por el middleware de permisos** —ya está dicho de
 * `regex_search` y de `xone_navegacion`, que reaplican `puedeLeerRuta` a mano—, y una tool
 * que escriba tiene el mismo deber con más consecuencias: sin esto, `copiar_artefacto`
 * sería la puerta trasera por la que un agente de solo lectura mete ficheros en el
 * proyecto, que es exactamente lo que `permisosDe` existe para impedir.
 *
 * Se mantiene en el MISMO fichero y al lado de `permisosDe` a propósito: son dos formas de
 * la misma regla, y separarlas es cómo una se queda vieja. Si algún día divergen, lo que
 * hay que hacer es derivar una de la otra, no añadir una tercera.
 */
export function puedeEscribirRuta(perfil: QuienDecidePermisos, ruta: string): boolean {
  // Lo denegado a todo el mundo manda sobre cualquier concesión, igual que en `permisosDe`.
  if (!puedeLeerRuta(ruta)) return false;
  if (ruta === "/skills" || ruta.startsWith("/skills/")) return false;
  const acotado = (perfil.escribeEn ?? []).length > 0;
  // Sin acotar y sin ser de solo lectura, escribe donde quiera: es el caso de siempre.
  if (!perfil.soloLectura && !acotado) return true;
  if (esRutaDeArtefacto(ruta) || esRutaDePlan(ruta)) return true;
  return (perfil.escribeEn ?? []).some((carpeta) => dentroDeCarpeta(ruta, carpeta));
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
 *
 * **Y un SEGUNDO motivo, que es de coherencia y no de relajación**: tampoco se pregunta por lo
 * que NO ES EL PROYECTO —`/artefactos/` y `/planes/`—. No es una excepción nueva: un perfil de
 * SOLO LECTURA ya escribe esas dos rutas sin aprobación ninguna, porque `hitlDe` le devuelve
 * `{}` y sus `permissions` lo confinan exactamente ahí. O sea que la misma ruta no se aprobaba
 * para el analista y sí para el desarrollador, y eso no es una barrera: es una incoherencia que
 * se paga cara — medido, el desarrollador fue a marcar como hecha una tarea de un plan, salió
 * un modal, se rechazó, y el plan se quedó viejo en silencio. En una tarea de fondo no hay
 * nadie que pulse, así que el plan NUNCA se marcaría.
 *
 * Ninguna de las dos rutas es la app del cliente: no entran en el commit del turno, no van a
 * git y no suben a CloudStudio. Lo que sigue intacto es lo único que importa: **por un fichero
 * del PROYECTO siempre se pregunta**, y el test lo comprueba ruta a ruta.
 */
export function seDetieneEn(peticion: unknown): boolean {
  const args = (peticion as { toolCall?: { args?: Record<string, unknown> } } | null)?.toolCall?.args;
  const ruta = args?.["file_path"];
  if (typeof ruta !== "string") return true;
  // (1) Lo que el backend va a rechazar de todas formas: un modal cuyo único final posible es
  //     un rechazo enseña a aprobar sin mirar.
  if (artefactoFueraDeSitio(ruta) !== undefined) return false;
  // (2) Lo que NO es el proyecto. Ver la cabecera: esto quita una incoherencia, no una barrera.
  if (esRutaDeArtefacto(ruta) || esRutaDePlan(ruta)) return false;
  // Ante la duda, se PREGUNTA: es la dirección conservadora de siempre.
  return true;
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
