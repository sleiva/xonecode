/**
 * Los subagentes como DATOS: qué es uno, cómo se lee de un fichero y cómo se compone su
 * prompt. TypeScript puro — leer el disco es cosa de `agent/agentesEnDisco.ts`.
 *
 * Hasta ahora los cuatro especialistas (`agent/perfiles.ts`) vivían a fuego en un
 * `Record`, y su prompt lo componía `xoneAgent.ts#promptDe` con un `nombre === "planner"`
 * dentro. Eso ya estaba señalado como provisional ahí mismo («los prompts pasan a ficheros
 * `.md` en la fase 9»); esto es esa fase, y con ella los cuatro dejan de ser un caso
 * especial: son los mismos ficheros que puede escribir el usuario, sembrados la primera vez.
 *
 * **Lo que NO sale del fichero, y es deliberado.** Las reglas de XOne se anteponen SIEMPRE,
 * desde código, a todo subagente venga de donde venga (`REGLAS_XONE`). Un subagente que no
 * sepa que XOne ignora en silencio lo desconocido escribirá un atributo inventado y no dará
 * error — dará un bug mudo, que es la razón de ser de este producto. Poder borrarlas
 * editando un `.md` convertiría el invariante en una preferencia; es el mismo principio por
 * el que los avisos de honestidad son código y no prompt (`core/bitacora.ts`).
 */

/** De qué está hecho un subagente. Los tres van al MISMO sitio: la lista de deepagents. */
export type Motor = "modelo" | "claude-code" | "codex" | "opencode";

export const MOTORES: readonly Motor[] = ["modelo", "claude-code", "codex", "opencode"] as const;

export interface Agente {
  /**
   * Sale del NOMBRE DEL FICHERO, no del frontmatter. Dos razones: la unicidad la garantiza
   * el sistema de ficheros en vez de una comprobación nuestra que hay que acordarse de
   * hacer, y renombrar el agente es renombrar el fichero — sin dos sitios que puedan
   * discrepar sobre cómo se llama.
   */
  nombre: string;
  /**
   * **Es un prompt, no una etiqueta.** Es el texto que el orquestador lee para decidir
   * cuándo delegar en este subagente: una descripción vaga hace que no se use nunca, o que
   * se use para todo. Obligatoria y no vacía por eso.
   */
  descripcion: string;
  motor: Motor;
  /**
   * Qué modelo usa este subagente. Ausente = el que le tocaría por omisión, y lo que eso
   * significa depende del MOTOR — que es justo por lo que este campo vale para los tres:
   *  - `modelo`: `proveedor/modelo` de los nuestros; ausente, el del papel `trabajo`.
   *  - `claude-code`: un alias del producto (`opus`, `sonnet`, `haiku`, `fable`) o un id
   *    entero; ausente, el que Claude Code use por su cuenta.
   *  - `codex`: un id de los que su propio `model/list` devuelve; ausente, el suyo.
   *
   * Este campo se RECHAZABA con los dos motores externos, con el argumento de que ahí el
   * modelo lo elige el agente. Era falso y está medido: el SDK de Claude Code acepta
   * `options.model` —y documenta esos alias— y el `ThreadStartParams` de Codex acepta
   * `model`. Rechazarlo dejaba fuera lo que el usuario quería decidir de verdad: con qué
   * modelo corre cada especialista.
   */
  modelo?: string;
  /** Sin escribir nada. Decide `permisosDe` y si se le monta el HITL. */
  soloLectura: boolean;
  /** Las skills del catálogo que se le cargan, por nombre. */
  skills: string[];
  /** El cuerpo del `.md`: sus instrucciones. Puede estar vacío. */
  instrucciones: string;
  /** De dónde salió, para poder decirlo en la interfaz y al resolver colisiones. */
  origen: "proyecto" | "global" | "semilla";
}

/**
 * Las reglas del dominio, iguales para todos y NO editables desde el fichero.
 *
 * Están aquí y no repetidas en cada `.md` sembrado por lo mismo que `marca.css` tiene los
 * colores en un solo sitio: cuatro copias de esto es como se acaba con una que se queda
 * vieja. Y un agente que el usuario escriba mañana las hereda sin tener que copiarlas.
 */
export const REGLAS_XONE = [
  "REGLAS DE XONE, no negociables:",
  "- No es desarrollo web: no existen DOM, React, Vue, ni `async/await` en el runtime.",
  "- La fuente de una colección es su `.xne`. Los `.xml` los genera Studio y no se tocan.",
  "- No inventes atributos XML, funciones ni propiedades CSS: XOne ignora lo desconocido",
  "  en silencio, así que un invento no da error — da un bug mudo.",
].join("\n");

/**
 * El prompt completo de un subagente: sus reglas, su descripción y sus instrucciones.
 *
 * Las reglas van PRIMERO y las instrucciones al final, en ese orden a propósito: lo último
 * que lee el modelo es lo que más pesa, y lo que el usuario escribió es lo específico de la
 * tarea. Las reglas no se pueden perder por ir arriba — son cinco líneas, no un preámbulo
 * largo del que el modelo se despiste.
 */
export function promptDeAgente(agente: Agente, skills?: EstadoDeSkills): string {
  return [
    REGLAS_XONE,
    "",
    agente.descripcion,
    ...(agente.instrucciones.trim() === "" ? [] : ["", agente.instrucciones.trim()]),
    "",
    // Las skills que tiene, y las que NO. El aviso es la misma disciplina de siempre: un
    // doble nunca se disfraza, y una skill declarada en el `.md` que no está en el catálogo
    // haría que el modelo intentara cargarla y fallara sin saber por qué. Se dice.
    ...(skills === undefined || skills.suyas.length === 0
      ? []
      : [`Tus skills: ${skills.suyas.join(", ")}. Cárgalas antes de responder.`]),
    ...(skills === undefined || skills.faltan.length === 0
      ? []
      : [`AVISO: te faltan estas skills y no las tienes: ${skills.faltan.join(", ")}.`]),
    // La línea de escritura es ESTRUCTURAL y va aquí, no en el cuerpo del fichero: no
    // depende de lo que el usuario escriba, sino de `soloLectura`, y un agente que escribe
    // sin saber que sus escrituras se aprueban insistiría al ver un rechazo.
    agente.soloLectura
      ? "No modificas nada."
      : "Tus escrituras requieren aprobación humana. Si te la rechazan, no insistas: explica qué pretendías y por qué.",
    /**
     * **Un agente EXTERNO no ve el backend virtual: ve el disco.** Y eso cambia lo que
     * significa una ruta, que es el detalle que más fácil se cuela — un `.md` que diga
     * «guarda en /doc» describe la carpeta `doc` del PROYECTO si el motor es `modelo` (ahí
     * `/` es la raíz montada) y la carpeta `/doc` del SISTEMA si es Claude Code, que es
     * fuera del proyecto y se deniega. El usuario que lo escribe no tiene por qué saber de
     * qué lado cae, así que se dice desde código en vez de esperar a que lo aprenda por un
     * rechazo: es la misma disciplina que la línea de las escrituras y la de las skills.
     *
     * Va con `relativas` y no reescribiendo la ruta: adivinar que un `/doc` «quería decir»
     * `doc/` sería inventar la intención de una escritura, que es justo lo que ninguna
     * guarda de este repo hace.
     */
    ...(agente.motor === "modelo"
      ? []
      : [
          "RUTAS: trabajas sobre la carpeta del proyecto directamente, así que una ruta que " +
            "empiece por «/» es la raíz del SISTEMA y está fuera del proyecto. Escribe las rutas " +
            "relativas a la carpeta del proyecto («doc/GUIA.md»), nunca «/doc/GUIA.md».",
        ]),
  ]
    .join("\n")
    // Los huecos que dejan las partes ausentes (sin instrucciones, sin skills) se colapsan
    // a una línea en blanco: tres saltos seguidos en un prompt no separan nada, solo gastan
    // tokens y hacen que el texto se lea como si faltara algo.
    .replace(/\n{3,}/g, "\n\n");
}

/** Qué skills de las que el agente declara existen de verdad en el catálogo, y cuáles no. */
export interface EstadoDeSkills {
  suyas: string[];
  faltan: string[];
}

/** Reparte las skills declaradas entre las que hay y las que no. Puro: el catálogo entra. */
export function repartirSkills(agente: Agente, disponibles: ReadonlySet<string>): EstadoDeSkills {
  return {
    suyas: agente.skills.filter((s) => disponibles.has(s)),
    faltan: agente.skills.filter((s) => !disponibles.has(s)),
  };
}

/** Lo que se pudo leer, y lo que no con su motivo. Nunca se descarta nada en silencio. */
export interface Lectura {
  agentes: Agente[];
  /** Un fichero por línea: qué fichero y qué le pasa. Se dice por consola. */
  problemas: string[];
}

function esMotor(v: string): v is Motor {
  return (MOTORES as readonly string[]).includes(v);
}

/**
 * El frontmatter, en el subconjunto que hace falta: `clave: valor` y listas en línea
 * (`skills: [a, b]`). No se trae un parser de YAML entero por dos motivos: la superficie
 * que aceptamos es la de arriba y nada más —cuanto menos acepte, menos formas hay de
 * escribir algo que parezca válido y no lo sea—, y una dependencia nueva en `core/` hay
 * que justificarla contra la frontera que `imports.test.ts` vigila.
 *
 * Comillas fuera si las hay: `descripcion: "algo"` y `descripcion: algo` son lo mismo, que
 * es lo que espera quien escribe el fichero a mano.
 */
function leerFrontmatter(texto: string): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const linea of texto.split("\n")) {
    const corte = linea.indexOf(":");
    if (corte <= 0) continue;
    const clave = linea.slice(0, corte).trim();
    let valor = linea.slice(corte + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"') && valor.length >= 2) ||
      (valor.startsWith("'") && valor.endsWith("'") && valor.length >= 2)
    ) {
      valor = valor.slice(1, -1);
    }
    campos[clave] = valor;
  }
  return campos;
}

/** `[a, b]` o `a, b` — las dos formas, porque las dos se escriben. Vacío da lista vacía. */
function leerLista(valor: string | undefined): string[] {
  if (valor === undefined) return [];
  const dentro = valor.trim().replace(/^\[/, "").replace(/\]$/, "");
  return dentro
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s !== "");
}

/**
 * Un `.md` con frontmatter, a `Agente`. Devuelve el motivo en vez de lanzar: un fichero
 * roto no puede tumbar el arranque de la consola — se salta, se dice cuál y por qué, y los
 * demás siguen. Es la misma postura que `sesiones.ts` con una línea corrupta del `.jsonl`.
 */
export function leerAgente(
  nombre: string,
  contenido: string,
  origen: Agente["origen"]
): { agente: Agente } | { error: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(contenido);
  if (m === null) return { error: "no tiene frontmatter: hace falta un bloque «---» al principio" };

  const campos = leerFrontmatter(m[1]!);
  const instrucciones = m[2] ?? "";

  const descripcion = (campos["descripcion"] ?? "").trim();
  // Sin descripción NO se carga, y no se le inventa una por el nombre: es lo que el
  // orquestador lee para decidir cuándo delegar, así que un agente sin ella o no se usaría
  // nunca o se usaría para todo. Las dos cosas son peores que no tenerlo.
  if (descripcion === "") return { error: "le falta «descripcion», que es lo que el orquestador lee para elegirlo" };

  const motorCrudo = (campos["motor"] ?? "modelo").trim();
  if (!esMotor(motorCrudo)) {
    return { error: `«motor: ${motorCrudo}» no existe. Los que hay: ${MOTORES.join(", ")}` };
  }

  const modelo = (campos["modelo"] ?? "").trim();

  // Cualquier cosa que no sea exactamente «true» es false — ver abajo.
  const soloLectura = (campos["soloLectura"] ?? "").trim() === "true";
  /**
   * **Un agente EXTERNO ya puede pedir escribir, y esta guarda se levantó CON el cableado y
   * no antes.** Existía porque sus escrituras se denegaban siempre, así que dejar pasar un
   * `soloLectura: false` le prometía a quien escribió el `.md` una capacidad que no iba a
   * tener — y lo habría descubierto cuando el agente le contestara que no pudo tocar nada.
   *
   * El orden importaba en la otra dirección también: levantarla antes de que
   * `PoliticaDeEscrituraExterna` estuviera montada de punta a punta habría creado justo el
   * caso que la guarda existía para evitar. Hoy las dos puertas están puestas —el papel del
   * `.md` y la autorización por escritura, con las guardas de ruta delante— así que la
   * promesa se cumple.
   *
   * Lo que NO cambia: `soloLectura` sigue siendo cierto solo con exactamente «true» (la
   * trampa del `"false"` de CloudStudio).
   *
   * **Codex también escribe ya, y su guarda se levantó igual: CON el cableado, no antes.**
   * Estuvo cerrada mientras el argumento fue cierto —que su escritura la bloqueaba el
   * sandbox del sistema operativo, y que abrirla exigía `sandbox: "workspace-write"`, con lo
   * que las guardas de ruta de xonecode no verían ni una—. Lo que la medida contra el
   * binario real (0.152.1, 11-09-2026) enseñó es que esa disyuntiva era falsa: la palanca no
   * es el sandbox, es el `approvalPolicy`. Con `read-only` + `on-request` el sandbox sigue
   * siendo la denegación del sistema operativo y cada escritura llega como una petición que
   * xonecode contesta, con las mismas guardas de ruta y la misma
   * `PoliticaDeEscrituraExterna` que el otro motor (`agent/escrituraDeCodex.ts`).
   */
  return {
    agente: {
      nombre,
      descripcion,
      motor: motorCrudo,
      ...(modelo === "" ? {} : { modelo }),
      // Cualquier cosa que no sea exactamente «true» es false: un `soloLectura: quizá` no
      // puede acabar concediendo escritura por ser una cadena verdadera en JavaScript —
      // es la misma trampa que `compartido` con el `"false"` de CloudStudio.
      soloLectura,
      skills: leerLista(campos["skills"]),
      instrucciones,
      origen,
    },
  };
}

/**
 * Junta las dos carpetas: el de PROYECTO gana sobre el global con el mismo nombre.
 *
 * Misma precedencia que los modelos (`core/modelos.ts`), y por lo mismo: un «revisor de
 * XOne» se quiere en todos los proyectos, y un «experto en esta app» solo en uno — y el
 * segundo tiene que poder pisar al primero sin borrarlo.
 */
export function fusionarAgentes(global: readonly Agente[], proyecto: readonly Agente[]): Agente[] {
  const porNombre = new Map<string, Agente>();
  for (const a of global) porNombre.set(a.nombre, a);
  for (const a of proyecto) porNombre.set(a.nombre, a);
  return [...porNombre.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** El `.md` de un agente, para escribirlo. Lo inverso de `leerAgente`. */
export function escribirAgente(agente: Agente): string {
  const campos = [
    `descripcion: ${agente.descripcion}`,
    `motor: ${agente.motor}`,
    ...(agente.modelo === undefined ? [] : [`modelo: ${agente.modelo}`]),
    `soloLectura: ${agente.soloLectura}`,
    `skills: [${agente.skills.join(", ")}]`,
  ];
  return `---\n${campos.join("\n")}\n---\n${agente.instrucciones}`;
}
