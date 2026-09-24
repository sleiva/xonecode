/**
 * Las métricas PROPIAS de TrueForge (`AgentThreadOrchestrator.getMetrics()`), puestas al lado de
 * las nuestras como CONTRASTE, no como sustituto.
 *
 * Las nuestras salen de traducir cada evento (`eventosTrueforge.ts#traducirEvento`) y son las que
 * se enseñan y se guardan, porque son las mismas cuentas que las de deepagents. Las de la librería
 * las lleva ella por dentro. Si las dos divergen, una de las dos cuenta mal, y hasta ahora no había
 * forma de enterarse: esto lo apunta en la traza (`XONECODE_TRACE_TOOLS=1`) y `xonecode traza` lo
 * dice. Puro, para poder probar la regla sin montar un turno.
 *
 * Se lee al final de CADA turno y es de ESE turno: el raíz se rehace desde su foto al acabar
 * (`sesionTrueforge.ts`), así que el árbol que se mide es el de un solo turno.
 */

/** Lo que dice NUESTRA cuenta de un turno: el delta del tracker. */
export interface CifrasDelTurno {
  entrada: number;
  salida: number;
  cache: number;
  llamadas: number;
}

/** Lo que dice la de TrueForge, con los nombres nuestros. Ausente = la librería no lo trae. */
export interface MetricasDeTrueforge {
  entrada: number;
  salida: number;
  cache?: number;
  iteraciones: number;
  tools: number;
  subagentes: number;
  resumenes: number;
  costeUsd?: number;
}

/** De la forma de la librería (`AgentThreadMetrics`) a la nuestra; lo que no es número no consta. */
export function metricasDeTrueforge(m: Record<string, unknown>): MetricasDeTrueforge {
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const opcional = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const cache = opcional(m["total_cache_read_tokens"]);
  const coste = opcional(m["total_cost_in_usd"]);
  return {
    entrada: n(m["total_input_tokens"]),
    salida: n(m["total_output_tokens"]),
    ...(cache === undefined ? {} : { cache }),
    iteraciones: n(m["iterations"]),
    tools: n(m["total_tool_calls"]),
    subagentes: n(m["total_sub_agents"]),
    resumenes: n(m["total_summarizations"]),
    ...(coste === undefined ? {} : { costeUsd: coste }),
  };
}

/**
 * En qué difieren, dicho con las dos cifras. Vacío = coinciden.
 *
 * Los TOKENS se comparan tal cual: los dos lados suman el mismo `usage` de cada llamada, así que
 * cualquier diferencia es una cuenta que se pierde en uno de ellos. Las LLAMADAS no se cuentan
 * igual, y las dos diferencias están MEDIDAS contra la librería real: un hijo EXTERNO es una
 * iteración para ella y cero llamadas para nosotros —su gasto es del producto, en la cuenta
 * `externo`—; y una COMPACTACIÓN es una llamada para nosotros —se paga— y para ella no es una
 * iteración, la lleva aparte en `resumenes`. Las dos se ajustan antes de comparar. Y la caché solo
 * si la librería la trae: ausente no es cero.
 */
export function diferenciasDelContraste(nuestras: CifrasDelTurno, suyas: MetricasDeTrueforge, hijosExternos: number): string[] {
  const salida: string[] = [];
  const comparar = (que: string, nuestra: number, suya: number): void => {
    if (nuestra !== suya) salida.push(`${que}: nuestra ${nuestra}, TrueForge ${suya}`);
  };
  comparar("entrada", nuestras.entrada, suyas.entrada);
  comparar("salida", nuestras.salida, suyas.salida);
  if (suyas.cache !== undefined) comparar("caché", nuestras.cache, suyas.cache);
  comparar("llamadas", nuestras.llamadas, suyas.iteraciones - hijosExternos + suyas.resumenes);
  return salida;
}
