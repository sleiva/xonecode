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
export function hitlDe(perfil: QuienDecidePermisos): Record<string, { allowedDecisions: string[]; description: string }> {
  if (perfil.soloLectura) return {};
  const salida: Record<string, { allowedDecisions: string[]; description: string }> = {};
  for (const tool of TOOLS_ESCRITURA) {
    salida[tool] = {
      allowedDecisions: ["approve", "reject"],
      // El nombre del perfil va DENTRO de la descripción por necesidad: el interrupt que
      // llega al runner no dice de qué subagente viene, y `dev` y `mockup` comparten tools.
      description: `[${perfil.nombre}] quiere ${TEXTO_HITL[tool] ?? tool}`,
    };
  }
  return salida;
}
