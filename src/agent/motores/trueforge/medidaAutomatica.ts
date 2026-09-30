/**
 * La MEDIDA de la pantalla, puesta por el harness tras cada prueba en el aparato.
 *
 * Existe por tres pasadas de la misma calculadora: en la mejor (calc9) el desarrollador midió su pantalla con
 * `comparar_capturas` y el crítico diez veces; en la siguiente (calc10), una, y quien acabó juzgando fue el
 * orquestador, con dos rondas de rediseño que no convergieron. El prompt del bucle ya le daba las herramientas y el
 * criterio del 10 %; era texto, y un texto no se cumple solo. Así que cuando vuelve quien EJECUTA con una captura
 * nueva, el harness la mide contra la maqueta —la misma aritmética de `comparar_capturas`, sin modelo— y se la da a
 * quien lo llamó: el desarrollador tiene el número delante sin acordarse de pedirlo, y el orquestador no tiene que
 * volver a medir para saber cómo quedó.
 *
 * Lo cualitativo —texto cortado, formas, colores— sigue siendo del crítico, que cuesta una llamada de visión: aquí
 * solo se le RECUERDA pasarlo si la medida no llega y no lo ha pasado desde su última escritura.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { compararPantallas, desajusteDeEncaje, informeDeComparacion, TOLERANCIA_DE_ENCAJE, type Comparacion } from "../../../core/compararCapturas.js";
import { decodificarImagen } from "../../dispositivos/decodificarImagen.js";

/**
 * Rondas VISUALES por encargo: una por captura medida. calc9, calc12 y calc13 sacaron 20-25 capturas cada una, retocando
 * una o dos cosas por despliegue. Con el aviso, la tercera se DICE la última: después se devuelve con lo que falta.
 */
export const RONDAS_VISUALES = 3;

/** El criterio de aceptación por omisión del bucle (`textoDelBucle`): por debajo, en vertical Y en horizontal. */
export const CRITERIO_DE_DISTANCIA = 0.1;

const ES_IMAGEN = /\.(png|jpe?g)$/i;

/** La maqueta de la sesión: `/diseno/screen.png` si está, si no la primera imagen de `/diseno/` y después la de los adjuntos. */
export function buscarMaqueta(raiz: string, adjuntos?: string): { virtual: string; disco: string } | undefined {
  const diseno = join(raiz, "diseno");
  const preferida = join(diseno, "screen.png");
  if (existsSync(preferida)) return { virtual: "/diseno/screen.png", disco: preferida };
  for (const [carpeta, prefijo] of [
    [diseno, "/diseno/"],
    ...(adjuntos === undefined ? [] : [[adjuntos, "/adjuntos/"]]),
  ] as const) {
    try {
      const nombre = readdirSync(carpeta).filter((n) => ES_IMAGEN.test(n)).sort()[0];
      if (nombre !== undefined) return { virtual: `${prefijo}${nombre}`, disco: join(carpeta, nombre) };
    } catch {
      // Sin esa carpeta no hay maqueta ahí.
    }
  }
  return undefined;
}

/** La captura MÁS RECIENTE de la carpeta de artefactos escrita desde `desdeMs`, con su nombre relativo (dos niveles). */
export function ultimaCaptura(carpeta: string, desdeMs: number): string | undefined {
  let mejor: { nombre: string; t: number } | undefined;
  const mirar = (dir: string, nivel: number): void => {
    let entradas: string[];
    try {
      entradas = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of entradas) {
      const ruta = join(dir, n);
      let st;
      try {
        st = statSync(ruta);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (nivel < 1) mirar(ruta, nivel + 1);
      } else if (ES_IMAGEN.test(n) && st.mtimeMs >= desdeMs && (mejor === undefined || st.mtimeMs > mejor.t)) {
        mejor = { nombre: relative(carpeta, ruta).split(sep).join("/"), t: st.mtimeMs };
      }
    }
  };
  mirar(carpeta, 0);
  return mejor?.nombre;
}

/** Mide una captura contra la maqueta. Lanza si alguna no se puede abrir o decodificar: quien llama lo traga. */
export function medirContraMaqueta(captura: string, maqueta: string): Comparacion {
  return compararPantallas(decodificarImagen(readFileSync(maqueta)), decodificarImagen(readFileSync(captura)));
}

const pct = (x: number): string => `${Math.round(x * 100)} %`;

/** ¿Cumple el criterio? En las DOS direcciones Y encajando en la pantalla: cada borde del contenido cerca del de la maqueta. */
export function cumpleElCriterio(c: Pick<Comparacion, "distanciaVertical" | "distanciaHorizontal" | "encaje">): boolean {
  return (
    c.distanciaVertical < CRITERIO_DE_DISTANCIA &&
    c.distanciaHorizontal < CRITERIO_DE_DISTANCIA &&
    desajusteDeEncaje(c.encaje) <= TOLERANCIA_DE_ENCAJE
  );
}

/** La cifra corta, para el informe al orquestador. */
export function resumenDeMedida(c: Pick<Comparacion, "distanciaVertical" | "distanciaHorizontal" | "encaje">, captura: string): string {
  return `vertical ${pct(c.distanciaVertical)}, horizontal ${pct(c.distanciaHorizontal)}, encaje ${pct(desajusteDeEncaje(c.encaje))} en el peor borde (${cumpleElCriterio(c) ? "cumple" : "NO cumple"} el ${pct(CRITERIO_DE_DISTANCIA)} y el ${pct(TOLERANCIA_DE_ENCAJE)} de encaje; captura /artefactos/${captura})`;
}

/** El mensaje para quien llamó a quien ejecuta. `pedirCritica`: no ha pasado el crítico desde su última escritura. */
export function textoDeMedidaAutomatica(opciones: {
  quien: string;
  captura: string;
  maqueta: string;
  comparacion: Comparacion;
  pedirCritica: boolean;
  /** Qué ronda visual es esta para quien la recibe (1, 2…). Ausente: no se cuenta. */
  ronda?: number;
}): string {
  const { comparacion: c } = opciones;
  const cumple = cumpleElCriterio(c);
  return [
    `[harness] Medida AUTOMÁTICA de la última captura que dejó ${opciones.quien} (/artefactos/${opciones.captura}) contra la maqueta ${opciones.maqueta}:`,
    ...informeDeComparacion(c),
    cumple
      ? `La estructura CUMPLE el criterio (< ${pct(CRITERIO_DE_DISTANCIA)} en vertical y en horizontal, y cada borde a ${pct(TOLERANCIA_DE_ENCAJE)} o menos del de la maqueta). Queda lo que esto no mide: el crítico.`
      : `NO cumple el criterio (< ${pct(CRITERIO_DE_DISTANCIA)} en vertical y en horizontal, y que ENCAJE en la pantalla: cada borde del contenido a ${pct(TOLERANCIA_DE_ENCAJE)} o menos del de la maqueta). No lo des por terminado ni lo devuelvas así: ` +
        "corrige tú, o encarga al diseñador las diferencias CONCRETAS de arriba (qué franja, qué falta o sobra), y vuelve a comprobar.",
    ...(opciones.ronda !== undefined && !cumple
      ? [
          opciones.ronda >= RONDAS_VISUALES
            ? `Es tu ronda visual ${opciones.ronda} de ${RONDAS_VISUALES}: arregla lo que puedas en ESTA y devuelve el trabajo diciendo qué falta, con esta medida. No pidas otra captura para retocar.`
            : `Ronda visual ${opciones.ronda} de ${RONDAS_VISUALES}: junta TODAS las diferencias en un solo cambio antes de pedir la siguiente captura.`,
        ]
      : []),
    ...(opciones.pedirCritica
      ? [`Desde tu última escritura no has pasado xone_critica_visual: pásala con pantalla=/artefactos/${opciones.captura} y referencia=${opciones.maqueta}.`]
      : []),
  ].join("\n");
}
