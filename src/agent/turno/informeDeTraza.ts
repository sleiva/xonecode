/**
 * El LECTOR de `.xonecode/traza-tools.jsonl`: a dónde se fueron los tokens.
 *
 * La traza la escribe `diagnosticoDeTools.ts` y hasta ahora no la leía nadie — un fichero
 * que solo se escribe es un fichero que no contesta nada. Esto la agrega por ORIGEN (el
 * orquestador y cada especialista) y por TOOL, que son las dos preguntas con las que se
 * decide qué recortar: quién gasta, y qué se está leyendo dos veces.
 *
 * Es código PURO —recibe líneas, devuelve un resumen— y por eso lleva test: un contador que
 * cuenta mal invalida en silencio todo lo que se decida mirándolo, igual que un juez de los
 * evals. Quien toca disco es `cli/traza.ts`.
 *
 * **La trampa del formato, y es la razón de la primera prueba**: en una línea `modelo`,
 * `input`, `output` y `cache` son los de ESA llamada, pero `llamadas` es el acumulado del
 * tracker en ese instante (1, 2, 3…) y además es GLOBAL, no del origen. Sumarlo daría seis
 * llamadas donde hubo tres. Las llamadas se cuentan por línea.
 */

import type { ConsumoDeSesion, ConsumoDeSesionPorCuenta } from "../../core/ports.js";

/** Lo que gastó un origen: el orquestador, o un especialista por su nombre. */
export interface GastoDeOrigen {
  origen: string;
  llamadas: number;
  input: number;
  output: number;
  cache: number;
  /** La MAYOR ventana alcanzada, no la última: tras un resumen el contexto baja. */
  contexto: number;
}

/** Una tool, cuántas veces y con qué detalle se repitió. */
export interface UsoDeTool {
  nombre: string;
  veces: number;
  /** Solo lo que salió MÁS DE UNA VEZ: una relectura es lo que se viene a buscar. */
  repetidos: Array<{ detalle: string; veces: number }>;
}

export interface SesionDeTraza {
  id: string;
  llamadas: number;
  input: number;
  output: number;
  cache: number;
  contexto: number;
  origenes: GastoDeOrigen[];
  tools: UsoDeTool[];
  /** Líneas que no se pudieron leer. Se dicen: una traza a medias no se disimula. */
  ilegibles: number;
}

/**
 * Tokens EQUIVALENTES para comparar dos ejecuciones del mismo modelo, no una factura.
 *
 * Asume la caché a un décimo, que es el orden de magnitud que declaran los proveedores que
 * la cobran. La misma cuenta que imprime el corredor de evals, y vive aquí para que sea UNA:
 * dos fórmulas para el mismo número son dos números que acaban divergiendo.
 */
export function costeEfectivo(uso: { input: number; output: number; cache: number }): number {
  return Math.round(uso.input - 0.9 * uso.cache + uso.output);
}

interface EnConstruccion {
  sesion: SesionDeTraza;
  porOrigen: Map<string, GastoDeOrigen>;
  porTool: Map<string, { uso: UsoDeTool; detalles: Map<string, number> }>;
}

function numero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor !== "" ? valor : undefined;
}

/**
 * Agrupa las líneas por sesión, en el orden en que aparece cada una.
 *
 * El fichero es append-only y una máquina acumula varias ejecuciones: sin partir por
 * `sesion` el informe sumaría el turno de ayer al de ahora y nadie lo notaría, porque la
 * cifra resultante es perfectamente plausible.
 */
export function resumirTraza(lineas: Iterable<string>): SesionDeTraza[] {
  const sesiones = new Map<string, EnConstruccion>();
  let ultima: EnConstruccion | undefined;
  /**
   * Lo ilegible no trae `sesion`, así que se apunta en la última abierta — y si aún no hay
   * ninguna, ESPERA a la siguiente. Abrir una sesión «?» para alojarlo metería en la lista
   * una ejecución que nunca ocurrió, y una traza se lee contando sesiones.
   */
  let ilegiblesSinDueño = 0;

  const abrir = (id: string): EnConstruccion => {
    const ya = sesiones.get(id);
    if (ya !== undefined) return ya;
    const nueva: EnConstruccion = {
      sesion: { id, llamadas: 0, input: 0, output: 0, cache: 0, contexto: 0, origenes: [], tools: [], ilegibles: 0 },
      porOrigen: new Map(),
      porTool: new Map(),
    };
    sesiones.set(id, nueva);
    nueva.sesion.ilegibles += ilegiblesSinDueño;
    ilegiblesSinDueño = 0;
    return nueva;
  };

  for (const linea of lineas) {
    if (linea.trim() === "") continue;
    let evento: Record<string, unknown>;
    try {
      const leido: unknown = JSON.parse(linea);
      if (typeof leido !== "object" || leido === null) throw new Error("no es un objeto");
      evento = leido as Record<string, unknown>;
    } catch {
      if (ultima === undefined) ilegiblesSinDueño += 1;
      else ultima.sesion.ilegibles += 1;
      continue;
    }

    const actual = abrir(texto(evento.sesion) ?? ultima?.sesion.id ?? "?");
    ultima = actual;

    if (evento.tipo === "modelo") {
      const input = numero(evento.input);
      const output = numero(evento.output);
      const cache = numero(evento.cache);
      const contexto = numero(evento.contexto);
      const origen = texto(evento.origen) ?? "(sin origen)";

      actual.sesion.llamadas += 1;
      actual.sesion.input += input;
      actual.sesion.output += output;
      actual.sesion.cache += cache;
      actual.sesion.contexto = Math.max(actual.sesion.contexto, contexto);

      const gasto = actual.porOrigen.get(origen) ?? { origen, llamadas: 0, input: 0, output: 0, cache: 0, contexto: 0 };
      gasto.llamadas += 1;
      gasto.input += input;
      gasto.output += output;
      gasto.cache += cache;
      gasto.contexto = Math.max(gasto.contexto, contexto);
      actual.porOrigen.set(origen, gasto);
      continue;
    }

    if (evento.tipo === "tool") {
      const nombre = texto(evento.nombre) ?? "(sin nombre)";
      const entrada = actual.porTool.get(nombre) ?? { uso: { nombre, veces: 0, repetidos: [] }, detalles: new Map<string, number>() };
      entrada.uso.veces += 1;
      const detalle = texto(evento.detalle);
      if (detalle !== undefined) entrada.detalles.set(detalle, (entrada.detalles.get(detalle) ?? 0) + 1);
      actual.porTool.set(nombre, entrada);
    }
  }

  // Un fichero ENTERO ilegible sí tiene que decir algo: ahí la sesión sin nombre no compite
  // con ninguna de verdad, y devolver una lista vacía se leería como «no hay traza».
  if (ilegiblesSinDueño > 0 && sesiones.size === 0) abrir("?");

  return [...sesiones.values()].map(({ sesion, porOrigen, porTool }) => ({
    ...sesion,
    origenes: [...porOrigen.values()].sort((a, b) => costeEfectivo(b) - costeEfectivo(a)),
    tools: [...porTool.values()].map(({ uso, detalles }) => ({
      ...uso,
      repetidos: [...detalles.entries()]
        .filter(([, veces]) => veces > 1)
        .map(([detalle, veces]) => ({ detalle, veces }))
        .sort((a, b) => b.veces - a.veces),
    })),
  }));
}

function cifra(n: number): string {
  return n.toLocaleString("es-ES");
}

function porcentajeDeCache(uso: { input: number; cache: number }): number {
  return uso.input === 0 ? 0 : Math.round((100 * uso.cache) / uso.input);
}

/** Una línea por origen y una por tool. Sin colores: esto es un informe, no una piel. */
export function pintarSesion(sesion: SesionDeTraza): string[] {
  const lineas: string[] = [];
  lineas.push(`--- traza ${sesion.id} ---`);
  lineas.push(
    `  ${sesion.llamadas} llamada(s) · entrada ${cifra(sesion.input)} · salida ${cifra(sesion.output)} · ` +
      `caché ${porcentajeDeCache(sesion)}% · efectivo ≈${cifra(costeEfectivo(sesion))} · ventana máx ${cifra(sesion.contexto)}`
  );

  if (sesion.origenes.length > 0) {
    lineas.push("  por origen (lo que más cuesta, primero)");
    for (const o of sesion.origenes) {
      const parte = sesion.input + sesion.output === 0 ? 0 : Math.round((100 * costeEfectivo(o)) / costeEfectivo(sesion));
      lineas.push(
        `    ${o.origen.padEnd(18)} ${String(o.llamadas).padStart(3)} llam · entrada ${cifra(o.input)} · salida ${cifra(o.output)} · ` +
          `caché ${porcentajeDeCache(o)}% · efectivo ≈${cifra(costeEfectivo(o))} (${parte}%)`
      );
    }
  }

  if (sesion.tools.length > 0) {
    lineas.push("  tools");
    for (const t of sesion.tools) {
      const repes = t.repetidos.map((r) => `${r.detalle} ×${r.veces}`).join(", ");
      lineas.push(`    ${t.nombre.padEnd(18)} ×${t.veces}${repes === "" ? "" : `   repetido: ${repes}`}`);
    }
  }

  if (sesion.ilegibles > 0) lineas.push(`  ${sesion.ilegibles} línea(s) ilegibles, no contadas`);
  return lineas;
}

/**
 * Lo que costó UN turno, para cerrarlo con una cifra en vez de con un silencio.
 *
 * **Las dos cuentas no se suman**, y por eso son dos filas: los tokens del grafo van contra
 * la clave de API de quien corre y los del agente EXTERNO contra su suscripción. Un token es
 * un token, pero su precio no, así que un total sería una cifra que no significa nada.
 *
 * La cuenta externa **ausente se calla**: una fila de ceros afirma que se midió un agente
 * externo que no corrió. Y una `ventana` de cero es «no se pudo medir», no «cabe todo»:
 * misma regla que `consumoPersistible`, que tampoco la estampa.
 *
 * Vive aquí y no en `cli/run.ts` por el patrón de fallo de este repo: compuesta dentro de
 * `correrReal` —que todos sus tests doblan— la regla quedaría escrita y sin nadie mirándola.
 */
export function pintarGasto(consumo: ConsumoDeSesionPorCuenta, llamadas: number): string[] {
  const fila = (nombre: string, c: ConsumoDeSesion, llam?: number): string =>
    `  ${nombre.padEnd(8)}${llam === undefined ? "        " : `${String(llam).padStart(3)} llam `}· ` +
    `entrada ${cifra(c.entrada)} · salida ${cifra(c.salida)} · caché ${porcentajeDeCache({ input: c.entrada, cache: c.cache })}% · ` +
    `efectivo ≈${cifra(costeEfectivo({ input: c.entrada, output: c.salida, cache: c.cache }))}`;

  const lineas = ["--- gasto del turno ---", fila("modelo", consumo.modelo, llamadas)];
  const e = consumo.externo;
  if (e.entrada > 0 || e.salida > 0) lineas.push(fila("externo", e));
  if (consumo.contexto > 0) lineas.push(`  ventana  ${cifra(consumo.contexto)} de entrada en la última llamada`);
  return lineas;
}
