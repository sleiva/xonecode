import type { ReactNode } from "react";
import { tipoDeFichero, type TipoDeFichero } from "../tipoDeFichero.js";
import estilos from "./IconoDeFichero.module.css";

/**
 * El icono de un fichero por su TIPO (`tipoDeFichero.ts`), o el de una carpeta, para el árbol que
 * comparten Ficheros y Revisión, la cabecera de cada bloque de Revisión y la del fichero abierto.
 *
 * Las formas son las de la maqueta aprobada, SVG de 16×16 escritos aquí y no traídos de un CDN
 * (modo offline de primera clase, como `IconosDelCompositor.tsx`). **El color no está en este
 * fichero**: cada icono pinta con `currentColor` y la clase de su tipo pone ese color desde un
 * token (`--xonecode-icono-*`, `estilos/marca.css`), porque la regla de «ningún color literal» la
 * vigilan las hojas CSS y un `fill="#…"` aquí se la saltaría sin que ningún test lo viera. Los
 * pocos trazos que van ENCIMA del relleno (el aspa del `.xne`, la almohadilla del CSS, las letras
 * del JS) llevan su propia clase por lo mismo.
 *
 * Siempre `aria-hidden`: es decoración del nombre que va al lado. Sin eso, el «JS» o el «Aa» de
 * dentro del dibujo entrarían en el nombre accesible de la fila del árbol.
 */
export function IconoDeFichero({
  ruta,
  carpeta = false,
  abierta = false,
  tamano = 16,
}: {
  ruta: string;
  carpeta?: boolean;
  abierta?: boolean;
  tamano?: number;
}) {
  const tipo: TipoDeFichero | "carpeta" | "carpeta-abierta" = carpeta ? (abierta ? "carpeta-abierta" : "carpeta") : tipoDeFichero(ruta);
  return (
    <svg
      className={`${estilos.icono} ${estilos[claseDe(tipo)] ?? ""}`}
      width={tamano}
      height={tamano}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-icono={tipo}
    >
      {FORMAS[tipo]}
    </svg>
  );
}

/** La clase CSS del tipo: el nombre del módulo no admite guiones sin comillas, así que se traduce. */
function claseDe(tipo: TipoDeFichero | "carpeta" | "carpeta-abierta"): string {
  return tipo === "carpeta-abierta" ? "carpeta" : tipo;
}

const C = "currentColor";

const FORMAS: Record<TipoDeFichero | "carpeta" | "carpeta-abierta", ReactNode> = {
  xne: (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill={C} />
      <path className={estilos.sobre} d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  js: (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill={C} />
      <text className={estilos.sobreJs} x="8" y="11.6" textAnchor="middle" fontWeight="700" fontSize="6.6">
        JS
      </text>
    </>
  ),
  css: (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill={C} />
      <path className={estilos.sobre} d="M6.2 4.5l-1 7M10.2 4.5l-1 7M4.4 6.6h7.4M4 9.4h7.4" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  xml: <path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9 3.5l-2 9" stroke={C} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
  config: (
    <>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke={C} strokeWidth="1.5" strokeLinecap="round" />
      {/* El hueco de cada mando, con el fondo del panel: en una fila resaltada no casa del todo
          con su fondo, y se acepta antes que inventar un token para eso. */}
      <circle className={estilos.hueco} cx="5.5" cy="4.5" r="1.6" stroke={C} strokeWidth="1.3" />
      <circle className={estilos.hueco} cx="10.5" cy="8" r="1.6" stroke={C} strokeWidth="1.3" />
      <circle className={estilos.hueco} cx="6.5" cy="11.5" r="1.6" stroke={C} strokeWidth="1.3" />
    </>
  ),
  imagen: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="2" stroke={C} strokeWidth="1.4" />
      <circle cx="6" cy="6.3" r="1.3" fill={C} />
      <path d="M2.6 12l3.6-3.4 2.4 2.2 2-1.8 2.8 2.6" stroke={C} strokeWidth="1.4" strokeLinejoin="round" />
    </>
  ),
  bd: (
    <>
      <ellipse cx="8" cy="4" rx="5" ry="2" stroke={C} strokeWidth="1.4" />
      <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" stroke={C} strokeWidth="1.4" />
    </>
  ),
  markdown: (
    <>
      <rect x="1.5" y="3.5" width="13" height="9" rx="2" stroke={C} strokeWidth="1.3" />
      <path d="M4 10.2V5.8l1.8 2 1.8-2v4.4M10.6 5.8v4.2M9.2 8.8l1.4 1.4 1.4-1.4" stroke={C} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  fuente: (
    <text x="8" y="12" textAnchor="middle" fontFamily="Georgia, serif" fontSize="10" fill={C}>
      Aa
    </text>
  ),
  // La hoja con la esquina doblada: «un documento» sin decir de qué.
  otro: (
    <>
      <path d="M4 1.5h5l3.5 3.5v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z" stroke={C} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9 1.5V5h3.5" stroke={C} strokeWidth="1.3" strokeLinejoin="round" />
    </>
  ),
  carpeta: <path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.4 1.5h6a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill={C} />,
  // Abierta: la trasera más tenue y la tapa levantada por delante.
  "carpeta-abierta": (
    <>
      <path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.4 1.5h5a1 1 0 0 1 1 1v1H4.3a1 1 0 0 0-.95.7L1.5 12.5z" fill={C} opacity="0.6" />
      <path d="M3.4 7.2a1 1 0 0 1 .95-.7h10.3a.6.6 0 0 1 .57.8l-1.8 5.2a1 1 0 0 1-.95.7H2.3a.6.6 0 0 1-.57-.8z" fill={C} />
    </>
  ),
};
