/**
 * La MAQUETA DESCRITA: lo que el modelo ve en la imagen de una maqueta, mirándola SOLA y en dos fases
 * —primero la geometría, después el estilo— con un vocabulario cerrado. Pura.
 *
 * Existe porque no toda maqueta trae `code.html`: un diseño puede ser solo un PNG, y entonces no hay cajas
 * que medir. Y porque, aunque lo traiga, la imagen es lo que la persona aprobó: si el HTML y la imagen no
 * cuentan lo mismo, alguien tiene que decirlo.
 *
 * Tres reglas:
 *
 * - **La maqueta se describe SOLA, nunca al lado de la captura.** Con las dos delante, el modelo compara de
 *   memoria y lo que «ve» en una se contagia a la otra. Sola, su descripción es una especificación, y como
 *   la maqueta no cambia entre rondas se pide UNA vez (quien la llama la guarda por huella): cada ronda se
 *   compara contra la MISMA descripción, no contra una nueva que varía.
 * - **Las filas descritas se comparan por CÓDIGO** contra el árbol medido del aparato
 *   (`compararConMaqueta` en modo `aproximada`): fila, orden y ancho en unidades. El lado del aparato es
 *   exacto; el de la maqueta, lo que el modelo dijo ver. Por eso **nunca es bloqueante**: lo que decide el
 *   rojo es solo lo medido, o el crítico vuelve a ser tan ruidoso como antes.
 * - **Vocabulario CERRADO** (formas, tamaños de letra, color en `#RRGGBB`): lo que no está en la lista se
 *   tira, no se interpreta. Es lo que lo hace comparable.
 */
import { textoParaEmparejar, type GeometriaDelAparato, type MaquetaMedida } from "./geometriaDePantalla.js";

export const FORMAS = ["pildora", "redondeada", "recta", "circulo"] as const;
export const LETRAS = ["pequena", "normal", "grande", "enorme"] as const;
export type Forma = (typeof FORMAS)[number];
export type Letra = (typeof LETRAS)[number];

export interface ControlDescrito {
  /** El texto VISIBLE; un icono sin texto va entre corchetes: `[borrar]`. */
  texto: string;
  /** Su ancho respecto al más estrecho de su fila (1, 2…). Ausente: no se compara su ancho. */
  unidades?: number;
}

export interface EstiloDescrito {
  texto: string;
  forma?: Forma;
  relleno?: string;
  letra?: Letra;
}

export interface MaquetaDescrita {
  /** De arriba abajo; cada fila de izquierda a derecha. */
  filas: ControlDescrito[][];
  estilo: EstiloDescrito[];
}

const TOPE_DE_FILAS = 30;
const TOPE_POR_FILA = 12;
const TOPE_DE_UNIDADES = 6;

export const PROMPT_DESCRIBIR_MAQUETA = [
  "Te doy UNA imagen: la MAQUETA de una pantalla de app móvil, cómo tendría que verse. NO la compares con",
  "nada: descríbela, en DOS FASES y en este orden.",
  "",
  "FASE 1, GEOMETRÍA. Las filas de controles de ARRIBA ABAJO; en cada fila, los controles de IZQUIERDA A",
  "DERECHA, cada uno con:",
  "- `texto`: el texto visible EXACTO (respeta los signos: «÷», «×», «−», «√»). Un icono sin texto, su",
  "  nombre entre corchetes: «[borrar]», «[historial]».",
  "- `unidades`: su ancho en unidades respecto al control MÁS ESTRECHO de su fila (1, 2, 3…). Si todos",
  "  miden igual, todos 1.",
  "Un bloque que ocupa la fila entera (un visor, una cabecera, un título) es una fila de un solo elemento.",
  "",
  "FASE 2, ESTILO. Para cada control con texto:",
  `- \`forma\`: una de ${FORMAS.join(", ")}.`,
  "- `relleno`: el color de fondo aproximado, como #RRGGBB.",
  `- \`letra\`: el tamaño del texto, uno de ${LETRAS.join(", ")}.`,
  "",
  "Describe SOLO lo que se ve. No inventes controles que no estén.",
  "",
  'Contesta SOLO este JSON: {"filas":[[{"texto":"AC","unidades":1}, …], …],"estilo":[{"texto":"AC","forma":"pildora","relleno":"#333333","letra":"grande"}, …]}',
].join("\n");

const esTexto = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";

/** La descripción que devolvió el modelo, o `undefined` si no trae al menos una fila. Lo que no encaja se tira. */
export function interpretarDescripcion(objeto: Record<string, unknown> | undefined): MaquetaDescrita | undefined {
  if (objeto === undefined || !Array.isArray(objeto["filas"])) return undefined;
  const filas = (objeto["filas"] as unknown[])
    .filter(Array.isArray)
    .slice(0, TOPE_DE_FILAS)
    .map((fila) =>
      (fila as unknown[])
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null && esTexto((c as Record<string, unknown>)["texto"]))
        .slice(0, TOPE_POR_FILA)
        .map((c): ControlDescrito => {
          const u = c["unidades"];
          const valida = typeof u === "number" && Number.isFinite(u) && u >= 1 && u <= TOPE_DE_UNIDADES;
          return { texto: (c["texto"] as string).trim(), ...(valida ? { unidades: u } : {}) };
        })
    )
    .filter((fila) => fila.length > 0);
  if (filas.length === 0) return undefined;
  const estilo = (Array.isArray(objeto["estilo"]) ? (objeto["estilo"] as unknown[]) : [])
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null && esTexto((e as Record<string, unknown>)["texto"]))
    .slice(0, TOPE_DE_FILAS * TOPE_POR_FILA)
    .map((e): EstiloDescrito => {
      const forma = FORMAS.find((f) => f === e["forma"]);
      const letra = LETRAS.find((l) => l === e["letra"]);
      const relleno = typeof e["relleno"] === "string" && /^#[0-9a-fA-F]{6}$/.test(e["relleno"]) ? e["relleno"].toUpperCase() : undefined;
      return {
        texto: (e["texto"] as string).trim(),
        ...(forma === undefined ? {} : { forma }),
        ...(relleno === undefined ? {} : { relleno }),
        ...(letra === undefined ? {} : { letra }),
      };
    })
    .filter((e) => e.forma !== undefined || e.relleno !== undefined || e.letra !== undefined);
  return { filas, estilo };
}

const UNIDAD = 10;

/**
 * La descripción como cajas de una REJILLA: cada fila a su altura, cada control a lo ancho de sus unidades.
 * Solo sirven para decir fila, orden y ancho relativo (`compararConMaqueta` en modo `aproximada`); un
 * control sin unidades —o todos, con `conAnchos: false`— va marcado `sinAncho`.
 */
export function maquetaDeLaDescripcion(d: MaquetaDescrita, conAnchos = true): MaquetaMedida {
  const elementos: MaquetaMedida["elementos"] = [];
  let anchoMaximo = 0;
  d.filas.forEach((fila, f) => {
    let x = 0;
    for (const c of fila) {
      const unidades = c.unidades ?? 1;
      elementos.push({
        texto: c.texto,
        caja: { x, y: f * UNIDAD, ancho: unidades * UNIDAD, alto: UNIDAD * 0.8 },
        ...(conAnchos && c.unidades !== undefined ? {} : { sinAncho: true as const }),
      });
      x += unidades * UNIDAD;
    }
    anchoMaximo = Math.max(anchoMaximo, x);
  });
  return { ancho: Math.max(anchoMaximo, UNIDAD), alto: d.filas.length * UNIDAD, elementos };
}

/** La maqueta MEDIDA (las cajas del `code.html`) vista como si fuera un aparato, para compararla con la descrita. */
export function htmlComoAparato(m: MaquetaMedida): GeometriaDelAparato {
  return {
    pantalla: { ancho: m.ancho, alto: m.alto },
    controles: m.elementos.map((e) => ({ ...(textoParaEmparejar(e.texto) === "" ? {} : { texto: e.texto }), caja: e.caja })),
  };
}

/** El estilo descrito, en líneas para el crítico: la especificación contra la que mira la captura. */
export function lineasDeEstilo(d: MaquetaDescrita): string[] {
  return d.estilo.map((e) => {
    const partes = [
      e.forma === undefined ? undefined : `forma ${e.forma === "pildora" ? "píldora" : e.forma === "circulo" ? "círculo" : e.forma}`,
      e.relleno === undefined ? undefined : `fondo ${e.relleno}`,
      e.letra === undefined ? undefined : `letra ${e.letra === "pequena" ? "pequeña" : e.letra}`,
    ].filter((p): p is string => p !== undefined);
    return `«${e.texto}»: ${partes.join(", ")}`;
  });
}
