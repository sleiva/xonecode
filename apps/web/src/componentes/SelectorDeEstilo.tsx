import { ESTILOS, type EstiloVisual } from "../apariencia.js";
import estilos from "./SelectorDeEstilo.module.css";

/**
 * Los ESTILOS de la consola, como muestras de su FORMA: cada una se dibuja con los colores del tema puesto y la forma
 * de su estilo (radio, filo, sombra), así que se ve qué cambia sin aplicarlo. Mismas reglas que `SelectorDeTema`:
 * `aria-pressed` en todos, pulsar el ya puesto no hace nada, y ningún literal en el `.module.css`.
 */
export function SelectorDeEstilo({ elegido, alElegir }: { elegido: EstiloVisual; alElegir: (estilo: EstiloVisual) => void }) {
  return (
    <div role="group" aria-label="Estilo" className={estilos.opciones}>
      {ESTILOS.map((e) => {
        const puesto = e.id === elegido;
        return (
          <button
            key={e.id}
            type="button"
            aria-label={e.nombre}
            aria-pressed={puesto}
            className={estilos.opcion}
            onClick={() => {
              if (!puesto) alElegir(e.id);
            }}
          >
            <span className={estilos.muestra} data-muestra={e.id} aria-hidden="true">
              <span className={estilos.tarjeta}>
                <span className={estilos.linea} />
                <span className={estilos.boton} />
              </span>
            </span>
            <span className={estilos.nombre}>{e.nombre}</span>
            <span className={estilos.detalle}>{e.detalle}</span>
          </button>
        );
      })}
    </div>
  );
}
