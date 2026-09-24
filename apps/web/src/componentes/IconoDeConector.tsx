import type { SVGProps } from "react";

/**
 * El icono de un conector MCP: un monograma propio —la primera letra de su nombre, en un
 * círculo— y no el logo del servicio.
 *
 * A diferencia de `IconoDeProveedor` (ocho logos copiados a mano de un paquete de marca), el
 * catálogo de conectores es una TABLA que crece sola (`core/conectores.ts#CATALOGO_DE_CONECTORES`)
 * y no hay licencia que revisar por cada servidor MCP nuevo que se añada ahí: un monograma se
 * deriva del `nombre` que ya viaja por el cable, así que un conector nuevo no necesita tocar
 * este fichero.
 *
 * `currentColor` y `aria-hidden`, la misma disciplina que `IconoDeProveedor`: el nombre del
 * conector ya está en la fila como texto, y el color lo pone la fila —fondo claro u oscuro—,
 * no un literal de este SVG.
 */
export function IconoDeConector({
  nombre,
  size = 20,
  ...resto
}: { nombre: string; size?: number } & SVGProps<SVGSVGElement>) {
  const letra = nombre.trim().charAt(0).toUpperCase() || "?";
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.2" />
      <text
        x="10"
        y="14"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        fill="currentColor"
      >
        {letra}
      </text>
    </svg>
  );
}
