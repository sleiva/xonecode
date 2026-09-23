/**
 * Cómo se descompone el consumo que se ENSEÑA: entrada nueva, caché y salida.
 *
 * **Existe porque las dos cuentas usan convenciones OPUESTAS**, y sumarlas a pelo daba una
 * cifra que no significa nada:
 *
 * | cuenta | ¿`entrada` incluye la caché? | |
 * |---|---|---|
 * | el grafo (`vendor/tokenTracking.ts`) | **SÍ** | su propio código lo dice: «la caché no puede superar la entrada: es una PARTE de ella» |
 * | Claude Code | no | `inputTokens` va aparte de `cacheReadInputTokens` |
 * | OpenCode | no | comprobado con aritmética real: 8756 + 141 + 1792 = 10689 |
 *
 * Así que la del grafo se RESTA y las externas se copian, y lo que sale de aquí es lo mismo
 * en las tres: **texto que el modelo no había visto**. Es la única cifra sobre la que se puede
 * actuar —lo que se acota es lo que devuelven las tools—, mientras que la caché es
 * consecuencia de cuántas llamadas haya.
 *
 * **Y por qué importaba tanto**: la pastilla enseñaba la entrada del grafo entera con el
 * rótulo «entrada», y su propio `title` afirmaba que la caché «no va sumada a la entrada».
 * Era falso, y en un turno normal la caché es más del noventa por ciento — o sea que el
 * número que se leía era casi todo historial reenviado.
 *
 * Puro y con test aparte porque la frontera prohíbe compartir módulo con el host: esto es la
 * copia DECLARADA de una regla, como la URL de un entorno o el slug de un subagente.
 */

export interface CuentaDeTokens {
  entrada: number;
  salida: number;
  cache: number;
}

export interface DesgloseDeTokens {
  /** Texto que el modelo no había visto. Lo único sobre lo que se puede actuar. */
  nueva: number;
  /** Lo releído del prefijo ya cacheado. */
  cache: number;
  /** Lo que escribió el modelo. */
  salida: number;
  /** `nueva + cache`, que es el volumen que de verdad viajó. */
  entradaTotal: number;
}

/**
 * `modelo` trae la caché DENTRO de su entrada y `externo` no, así que solo se resta la
 * primera. Nunca por debajo de cero: una caché mayor que su entrada es un dato imposible
 * —pasa con Gemini en streaming, ver `vendor/tokenTracking.ts`— y un negativo en pantalla
 * es peor que un cero.
 */
export function desglosarConsumo(modelo: CuentaDeTokens, externo: CuentaDeTokens): DesgloseDeTokens {
  const nueva = Math.max(0, modelo.entrada - modelo.cache) + externo.entrada;
  const cache = modelo.cache + externo.cache;
  return { nueva, cache, salida: modelo.salida + externo.salida, entradaTotal: nueva + cache };
}
