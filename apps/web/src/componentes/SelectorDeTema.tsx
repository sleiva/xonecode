import type { CSSProperties } from "react";
import { temasDe, type ModoDeTema } from "../temas.js";
import estilos from "./SelectorDeTema.module.css";

/**
 * Los temas de UN modo, como muestras: se ve qué se elige sin aplicarlo.
 *
 * Tres reglas:
 * - **La muestra pinta con los colores del TEMA**, por variables en `style` (`--muestra-*`): el
 *   `.module.css` no lleva ningún literal (`Barra.test.tsx`). XOneCode no tiene semillas
 *   y trae su `muestra` (`temas.ts`): con los alias del modo, dentro de otro tema saldría con
 *   los colores de ESE tema.
 * - **`aria-pressed` en todos**, como `SelectorDeModo`: son botones de un conmutador. Pulsar el
 *   ya elegido no hace nada.
 * - **Si el modo no está en vigor, se DICE qué pasará**: elegir un tema de esa fila pone la
 *   consola en ese modo (`App.tsx#alCambiarTema`), y sin la línea el salto de claro a oscuro
 *   cogería por sorpresa.
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
      <span className={estilos.rotulo}>{rotulo}</span>
      <div role="group" aria-label={rotulo} className={estilos.opciones}>
        {temasDe(modo).map((tema) => {
          const s = tema.semillas;
          const m = s !== undefined ? { fondo: s.fondo, texto: s.texto2, acento: s.acento } : tema.muestra;
          const colores =
            m === undefined
              ? undefined
              : ({ "--muestra-fondo": m.fondo, "--muestra-texto": m.texto, "--muestra-acento": m.acento } as CSSProperties);
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
      {enVigor ? null : <p className={estilos.nota}>Elegirlo pone la consola en {modo}.</p>}
    </div>
  );
}
