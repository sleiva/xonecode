import clsx from "clsx";
import { IconoDeChevron } from "./IconosDelCompositor.js";
import estilos from "./Desplegable.module.css";

/**
 * Un `<select>` con la flecha NUESTRA en vez de la del navegador.
 *
 * La nativa la pinta cada navegador donde quiere, y en Chromium iba pegada al filo de la caja
 * —el `padding-right` no la mueve de forma fiable—; se señaló dos veces mirando la pantalla.
 * Aquí el control sigue siendo el `<select>` de siempre (teclado, lector de pantalla y la
 * lista del sistema intactos) con `appearance: none`, y la flecha es el chevron del compositor
 * encima, con su hueco y sin recibir clics.
 *
 * `cargando` cambia la flecha por la señal que gira, dentro de la propia caja.
 *
 * `className` va al `<select>` —es donde cada sitio ya tenía su caja—, y el envoltorio solo
 * pone la flecha: ocupa el ancho que le deje su padre. SIN `className` el `<select>` toma el
 * aspecto común (`.aspecto`, el de los campos de Ajustes); con él manda el sitio y no se
 * combinan, porque el orden de dos clases en el bundle no está garantizado.
 */
export function Desplegable({
  className,
  children,
  cargando,
  ...resto
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  /**
   * Lo que el combo va a ofrecer todavía no ha llegado. La carga se enseña DENTRO del combo,
   * en el sitio de la flecha —es de él de lo que se espera—, y el `<select>` lo dice con
   * `aria-busy`. Quien lo usa lo bloquea además: no hay nada que elegir.
   */
  cargando?: boolean;
}) {
  return (
    <span className={estilos.caja}>
      <select
        {...resto}
        {...(cargando === true ? { "aria-busy": "true" as const } : {})}
        className={clsx(className ?? estilos.aspecto, estilos.select)}
      >
        {children}
      </select>
      <span className={estilos.flecha} aria-hidden="true">
        {cargando === true ? <span className={estilos.girando} /> : <IconoDeChevron />}
      </span>
    </span>
  );
}
