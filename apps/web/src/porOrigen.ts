import type { DetalleDeLinea, OrigenDeLaTool } from "./tipos.js";

/**
 * Cómo se rotula QUIÉN pidió una tool dentro de «Trabajo del agente».
 *
 * Solo lo que consta: un especialista con nombre se rotula con él; uno sin nombre —un hijo de
 * deepagents, que no lo da— se rotula «especialista», que es verdad; y una línea sin origen
 * (una sesión anterior, o una que no es de ninguna tool) no se rotula, porque cualquier rótulo
 * ahí sería inventado.
 */
export function rotuloDeOrigen(origen: OrigenDeLaTool | undefined): string | undefined {
  if (origen === undefined) return undefined;
  if (origen.rol === "orquestador") return "orquestador";
  return origen.nombre ?? "especialista";
}

/** Un trozo de líneas seguidas del MISMO origen. `rotulo` ausente = no se pinta cabecera. */
export interface TrozoPorOrigen {
  rotulo?: string;
  lineas: string[];
}

/**
 * Parte las líneas de un acto de herramientas en trozos seguidos del mismo origen, EN ORDEN.
 *
 * No se reordena por especialista: que dos se alternen es información, y agrupar a cada uno en
 * su bloque la borraría. El rótulo sale solo cuando CAMBIA quién pide, también entre dos actos
 * del mismo tramo —por eso `previo`, el rótulo del último trozo pintado—: un razonamiento en
 * medio no es un cambio de quién trabaja, y repetir el rótulo sería ruido.
 *
 * `detalles` ausente (sesión anterior) es un solo trozo sin rótulo, que es cómo se pintaba.
 */
export function partirPorOrigen(
  lineas: readonly string[],
  detalles: readonly DetalleDeLinea[] | undefined,
  previo: string | undefined
): { trozos: TrozoPorOrigen[]; ultimo: string | undefined } {
  const trozos: TrozoPorOrigen[] = [];
  let actual: string | undefined = previo;
  let abierto: TrozoPorOrigen | undefined;
  lineas.forEach((linea, i) => {
    const rotulo = rotuloDeOrigen(detalles?.[i]?.origen);
    if (abierto === undefined || rotulo !== actual) {
      abierto = { ...(rotulo === undefined || rotulo === actual ? {} : { rotulo }), lineas: [] };
      trozos.push(abierto);
      actual = rotulo;
    }
    abierto.lineas.push(linea);
  });
  return { trozos, ultimo: actual };
}
