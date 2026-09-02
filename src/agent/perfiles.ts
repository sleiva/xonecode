/**
 * Los cuatro especialistas, con tools de FICHERO (la v1 no usa MCP).
 *
 * Se mantienen los nombres y los papeles de `deep-agent-xone` a propósito: son los que ya
 * están medidos y los que el orquestador sabe elegir.
 */
export type NombrePerfil = "docs" | "planner" | "dev" | "mockup";

/** Las tools de fichero que monta deepagents sobre el backend. */
export const TOOLS_LECTURA = ["ls", "read_file", "glob", "grep"] as const;
export const TOOLS_ESCRITURA = ["write_file", "edit_file"] as const;

export interface Perfil {
  nombre: NombrePerfil;
  /** Lo que lee el orquestador para elegir a quién delega. */
  descripcion: string;
  soloLectura: boolean;
  /** Qué skills de `lab/skills/` se le cargan. */
  skills: string[];
}

export const PERFILES: Record<NombrePerfil, Perfil> = {
  docs: {
    nombre: "docs",
    descripcion:
      "Responde preguntas técnicas de la plataforma XOne (XML/.xne, JavaScript, CSS, " +
      "eventos, patrones). Puede leer el proyecto para no contradecir el código real. " +
      "No modifica nada.",
    soloLectura: true,
    skills: ["xone-development", "archify", "artifacts-builder"],
  },
  planner: {
    nombre: "planner",
    descripcion:
      "Inspecciona el proyecto real para anclar planes y diagnósticos: estructura, " +
      "colecciones y búsqueda de código. No modifica nada.",
    soloLectura: true,
    skills: ["xone-spec-builder", "xone-plan-builder", "archify", "artifacts-builder"],
  },
  dev: {
    nombre: "dev",
    descripcion:
      "Desarrolla: crea y modifica colecciones, escribe scripts y edita ficheros. " +
      "Las modificaciones requieren aprobación humana.",
    soloLectura: false,
    skills: ["xone-development", "xone-debugging", "archify", "artifacts-builder"],
  },
  mockup: {
    nombre: "mockup",
    descripcion:
      "Trabajo visual: layouts, CSS y recursos. Las modificaciones requieren " +
      "aprobación humana.",
    soloLectura: false,
    skills: ["xone-development", "archify", "artifacts-builder"],
  },
};

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
export function permisosDe(perfil: Perfil) {
  const base = [...DENEGADO_SIEMPRE];
  if (!perfil.soloLectura) return base;
  return [...base, { operations: ["write"] as const, paths: ["/**"], mode: "deny" as const }];
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
export function toolsDe(perfil: Perfil): string[] {
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
export function hitlDe(perfil: Perfil): Record<string, { allowedDecisions: string[]; description: string }> {
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
