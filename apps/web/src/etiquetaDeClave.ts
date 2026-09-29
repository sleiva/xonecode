/**
 * Lo que se ENSEÑA de la clave de una tarea del gestor (IXCODE-15), REDECLARADO de
 * `src/core/gestorDeTareas.ts#etiquetaDeClave` (el cliente no importa `src/`): el UUID de una
 * página de Notion (con o sin guiones) se enseña por sus 8 primeros caracteres; cualquier otra
 * clave (la de Jira, `IXCODE-11`) no tiene etiqueta. Se pinta `etiquetaDeClave(clave) ?? clave`
 * donde una clave cruza SIN su fila: el `ticket` de una sesión, `cierre.clave`, `transiciones.clave`.
 * `etiquetaDeClave.test.ts` comprueba que coincide con la del host.
 */
export function etiquetaDeClave(clave: string): string | undefined {
  const sinGuiones = clave.toLowerCase().replace(/-/g, "");
  return /^[0-9a-f]{32}$/.test(sinGuiones) ? sinGuiones.slice(0, 8) : undefined;
}
