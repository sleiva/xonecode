/**
 * El diagnóstico de Node de Ajustes → General: lo que hace falta en ESTA máquina para que el agente pueda probar en el
 * aparato y verificar el proyecto. Existe por un paquete de soporte de un usuario en Windows: el desarrollador en Claude
 * Code no tenía ningún script (Windows no da bit de ejecución) y cada turno cerraba con «xone-simulator no está
 * instalado (ENOENT)» aunque venía dentro del paquete. Las dos cosas se ven aquí en un clic.
 *
 * Una FOTO con hora, pedida a mano (el patrón de Dispositivos y Motores locales). **Ninguna ruta de la máquina viaja**:
 * cada línea dice si funciona, una versión y, si falla, un motivo corto sin rutas (el `code` de Node o una frase fija).
 */

/** Una comprobación: si funciona, lo que se midió (una versión, una cuenta) y, si no, por qué. */
export interface LineaDeDiagnostico {
  ok: boolean;
  /** Lo medido: una versión («v22.11.0», «2.1.301»), o lo que se comprobó. */
  valor?: string;
  /** Solo si `ok` es falso: por qué, sin rutas. */
  motivo?: string;
}

export interface DiagnosticoDeNode {
  /** ISO de cuando se midió. */
  cuando: string;
  /** El Node que corre xonecode: siempre funciona (si no, no habría servidor). */
  servidor: { version: string; plataforma: string; arquitectura: string };
  /** Si el comando `node` responde desde una shell, que es como lanzan los scripts en Windows. */
  nodeEnPath: LineaDeDiagnostico;
  /** Cuántos scripts de las skills se detectan y si uno arranca con la MISMA llamada que haría el agente. */
  scripts: LineaDeDiagnostico & { cuantos: number };
  /** `xone-simulator` (de `xone-linter`), el verificador del proyecto. */
  simulador: LineaDeDiagnostico;
  /** El Claude Code que trae el SDK: su versión y si su binario arranca. */
  claudeCode: LineaDeDiagnostico;
}

/** Los sistemas con su nombre de persona; lo que no se reconoce va tal cual. */
export function nombreDeSistema(plataforma: string): string {
  return ({ win32: "Windows", darwin: "macOS", linux: "Linux" } as Record<string, string>)[plataforma] ?? plataforma;
}

/**
 * El motivo de un fallo al lanzar un proceso, SIN rutas: el `code` de Node (ENOENT, EACCES…), el tope, o el código de
 * salida. El mensaje de Node no se usa nunca: lleva la ruta absoluta del programa.
 */
export function motivoDeFallo(error: unknown): string {
  const e = error as { code?: unknown; killed?: unknown; signal?: unknown };
  if (e?.killed === true || e?.signal === "SIGTERM") return "no contestó a tiempo";
  if (e?.code === "ENOENT") return "no se encuentra el programa (ENOENT)";
  if (typeof e?.code === "string" && /^E[A-Z]+$/.test(e.code)) return `no se pudo lanzar (${e.code})`;
  if (typeof e?.code === "number") return `salió con código ${e.code}`;
  return "falló al lanzarlo";
}

/** Si TODO lo que el agente necesita funciona. */
export function todoBien(d: DiagnosticoDeNode): boolean {
  return d.nodeEnPath.ok && d.scripts.ok && d.simulador.ok && d.claudeCode.ok;
}
