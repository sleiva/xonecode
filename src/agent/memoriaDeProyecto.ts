/**
 * La memoria que pertenece al proyecto, no a una sesión ni a la cuenta del usuario.
 *
 * Se guarda en `.xonecode/memoria.md` para viajar con el proyecto si el usuario quiere
 * versionarla, pero el agente la conoce mediante una sola ruta virtual segura. Ni
 * `config.json` ni otros ficheros internos quedan expuestos por esta costura.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NOMBRE_CARPETA } from "./configEnDisco.js";

export const NOMBRE_ARCHIVO_MEMORIA = "memoria.md";
/** Ruta que ve el agente dentro de su backend virtual. */
export const RUTA_MEMORIA_VIRTUAL = "/MEMORIA_PROYECTO.md";
/** Ruta real dentro del backend virtual; nunca se enseña al agente. */
export const RUTA_MEMORIA_INTERNA = `/${NOMBRE_CARPETA}/${NOMBRE_ARCHIVO_MEMORIA}`;
/** Almacén interno de los historiales que DeepAgents ya ha resumido. */
export const RUTA_HISTORIAL_RESUMIDO = `/${NOMBRE_CARPETA}/conversation_history`;

export function rutaMemoriaDeProyecto(raiz: string): string {
  return join(raiz, NOMBRE_CARPETA, NOMBRE_ARCHIVO_MEMORIA);
}

export const PLANTILLA_MEMORIA = `# Memoria del proyecto

Esta memoria recoge solo hechos confirmados, decisiones acordadas y riesgos que ayudan a
continuar el trabajo. No es un transcript ni guarda secretos, credenciales o contenido de
ficheros completos.

## Decisiones

- Aún no hay decisiones registradas.

## Estado y convenciones

- Aún no hay estado persistente registrado.

## Riesgos y pendientes

- Aún no hay riesgos o pendientes registrados.
`;

/**
 * Crea la memoria inicial una sola vez. `flag: wx` es la barrera contra pisar una
 * memoria existente, incluso si dos sesiones arrancan a la vez.
 */
export function asegurarMemoriaDeProyecto(raiz: string): boolean {
  const ruta = rutaMemoriaDeProyecto(raiz);
  if (existsSync(ruta)) return false;
  mkdirSync(join(raiz, NOMBRE_CARPETA), { recursive: true });
  try {
    writeFileSync(ruta, PLANTILLA_MEMORIA, { encoding: "utf8", flag: "wx" });
    return true;
  } catch (error: unknown) {
    // Otra sesión pudo ganarnos entre existsSync y writeFileSync: su memoria es la que
    // manda. Cualquier otro fallo (permiso, ruta inválida) debe llegar al llamador.
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") return false;
    throw error;
  }
}
