import type { CSSProperties } from "react";
import { temasDe, type ModoDeTema } from "../temas.js";
import estilos from "./SelectorDeTema.module.css";

/**
 * Los temas de UN modo, como muestras: se ve qué se elige sin aplicarlo.
 *
 * Tres reglas:
 * - **La muestra pinta con los colores del TEMA**, por variables en `style` (`--muestra-*`): el
 *   `.module.css` no lleva ningún literal (`Barra.test.tsx`). XOneCode no tiene semillas
 *   (`temas.ts`) y su muestra usa los alias del modo, que es lo que XOneCode es.
 * - **`aria-pressed` en todos**, como `SelectorDeModo`: son botones de un conmutador. Pulsar el
 *   ya elegido no hace nada.
 * - **Si el modo no está en vigor, se DICE**: elegir el tema oscuro estando en claro no cambia
 *   nada en pantalla, y sin la línea eso se lee como un botón roto.
 */
export function SelectorDeTema({
  modo,
  elegido,
  enVigor,
  rotulo,
  alElegir,
}: {
  modo: ModoDeTema;
  elegido: string;
  enVigor: boolean;
  rotulo: string;
  alElegir: (id: string) => void;
}) {
  return (
    <div className={estilos.fila}>
      <div role="group" aria-label={rotulo} className={estilos.opciones}>
        {temasDe(modo).map((tema) => {
          const s = tema.semillas;
          const colores =
            s === undefined
              ? undefined
              : ({ "--muestra-fondo": s.fondo, "--muestra-texto": s.texto2, "--muestra-acento": s.acento } as CSSProperties);
          const puesto = tema.id === elegido;
          return (
            <button
              key={tema.id}
              type="button"
              aria-label={tema.nombre}
              aria-pressed={puesto}
              className={estilos.opcion}
              onClick={() => {
                if (!puesto) alElegir(tema.id);
              }}
            >
              <span data-muestra className={estilos.muestra} style={colores}>
                <span className={estilos.linea} />
                <span className={estilos.pastilla} />
              </span>
              <span className={estilos.nombre}>{tema.nombre}</span>
            </button>
          );
        })}
      </div>
      {enVigor ? null : <p className={estilos.nota}>Se aplica cuando la consola esté en {modo}.</p>}
    </div>
  );
}
