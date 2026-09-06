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
export type Motor = "modelo" | "claude-code" | "codex";

export const MOTORES: readonly Motor[] = ["modelo", "claude-code", "codex"] as const;

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
  /** `proveedor/modelo`. Solo con `motor: "modelo"`; ausente = el del papel `trabajo`. */
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
export function promptDeAgente(agente: Agente): string {
  return [REGLAS_XONE, "", agente.descripcion, ...(agente.instrucciones.trim() === "" ? [] : ["", agente.instrucciones.trim()])].join(
    "\n"
  );
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
  // Un `modelo` con `motor: claude-code` no se ignora en silencio: quien lo escribió cree
  // que va a elegir el modelo del hijo, y no es así — Claude Code usa el suyo.
  if (modelo !== "" && motorCrudo !== "modelo") {
    return { error: `«modelo» solo vale con «motor: modelo»; con «${motorCrudo}» lo elige el propio agente` };
  }

  return {
    agente: {
      nombre,
      descripcion,
      motor: motorCrudo,
      ...(modelo === "" ? {} : { modelo }),
      // Cualquier cosa que no sea exactamente «true» es false: un `soloLectura: quizá` no
      // puede acabar concediendo escritura por ser una cadena verdadera en JavaScript —
      // es la misma trampa que `compartido` con el `"false"` de CloudStudio.
      soloLectura: (campos["soloLectura"] ?? "").trim() === "true",
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
