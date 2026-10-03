import estilos from "./GiroDeCarga.module.css";

/**
 * El giro de «estoy en ello», DENTRO del botón que se pulsó: el mismo en todos los botones de
 * refrescar y en «Subir», para que el feedback se lea igual en toda la consola. Decorativo
 * (`aria-hidden`): lo que se anuncia es el `aria-busy` del botón que lo lleva.
 */
export function GiroDeCarga({ className }: { className?: string }) {
  return <span className={className === undefined ? estilos.giro : `${estilos.giro} ${className}`} aria-hidden="true" />;
}
