/**
 * Qué motor de agente corre una sesión: `deepagents` (el de siempre) o `trueforge` (el segundo,
 * `docs/VARIANTE-TRUEFORGE-HARNESS.md`).
 *
 * **Se elige por CONFIGURACIÓN y no se enseña**: decisión suya —«la conexión que sea por
 * configuración no visible para el usuario»—. La interfaz es la misma con los dos: el motor solo
 * cambia quién produce los eventos de dominio que las pieles pintan.
 *
 * **Y una sesión conserva el motor con el que nació**: la memoria de una conversación de
 * deepagents (su checkpoint) no la puede continuar TrueForge ni al revés, así que cambiar la
 * configuración con sesiones abiertas no puede cambiarles el motor por debajo — las nuevas
 * toman el de la configuración, y las viejas siguen con el suyo.
 *
 * Puro: ni disco ni entorno; quien llama pasa las fuentes.
 */
export const MOTORES = ["deepagents", "trueforge"] as const;
export type MotorDeAgente = (typeof MOTORES)[number];

/**
 * El de omisión, el que corre sin configurar nada: **TrueForge**, decisión suya (24-09-2026) tras el
 * banco entre motores, que los dio equivalentes en coste dentro del ruido y a TrueForge sin peor
 * calidad (`docs/VARIANTE-TRUEFORGE-HARNESS.md`, «El banco entre motores»). deepagents sigue a un
 * `"motor": "deepagents"` de distancia, y una sesión que nació con él sigue con él: el vestíbulo la
 * reabre con el suyo, y a una sin motor guardado —de antes de que hubiera dos— le pone deepagents a
 * mano, sin pasar por aquí.
 */
export const MOTOR_POR_OMISION: MotorDeAgente = "trueforge";

export function esMotor(valor: unknown): valor is MotorDeAgente {
  return typeof valor === "string" && (MOTORES as readonly string[]).includes(valor);
}

/**
 * El motor de una sesión. Precedencia, del más concreto al menos: el de la SESIÓN (con el que
 * nació), la variable `XONECODE_MOTOR`, el `config.json` del proyecto, el global y la omisión. Un
 * valor que no es un motor se salta, que es lo mismo que no haberlo puesto.
 */
export function resolverMotor(fuentes: {
  sesion?: unknown;
  entorno?: unknown;
  proyecto?: unknown;
  global?: unknown;
}): MotorDeAgente {
  for (const candidato of [fuentes.sesion, fuentes.entorno, fuentes.proyecto, fuentes.global]) {
    if (esMotor(candidato)) return candidato;
  }
  return MOTOR_POR_OMISION;
}
