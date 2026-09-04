import estilos from "./PasosDelAlta.module.css";

/**
 * Los tres estados posibles de un paso del alta, tal y como este componente los PINTA.
 * Quién calcula cuál es cuál vive en `App.tsx` (`estado.alta === undefined` es la señal
 * de que el paso de cuenta sigue en curso — `arranque.ts#anunciarAlta` solo se manda
 * DESPUÉS de que `conducirCuenta()` resuelve, así que si `alta` ya llegó, cuenta ya está
 * hecha): este componente es puro, como pide la costura `suscribir` — nada de él lee el
 * store, todo entra por prop.
 */
export type EstadoDePaso = "hecho" | "actual" | "pendiente";

export interface PasoDeAlta {
  id: string;
  etiqueta: string;
  estado: EstadoDePaso;
}

/**
 * La progresión del alta, visible como tal. Antes la pantalla solo enseñaba el paso en el
 * que estabas — ni cuántos había, ni si alguno ya estaba resuelto—, así que quien llegaba
 * con el modelo ya elegido no tenía forma de saber si el entorno era el único trámite que
 * quedaba o el primero de varios. Un paso ya satisfecho se PINTA hecho, no se oculta: esa
 * es la corrección que se pidió — ocultarlo sería volver a enseñar solo el actual con
 * otro nombre.
 */
export function PasosDelAlta({ pasos }: { pasos: readonly PasoDeAlta[] }) {
  return (
    <ol className={estilos.pasos} aria-label="Pasos del alta">
      {pasos.map((paso, indice) => {
        // El conector ANTES de este paso cuenta la transición desde el anterior: solo se
        // pinta resuelto si el paso previo ya está `hecho`, nunca por estar `actual` (ese
        // sigue en marcha, no puede darse por cruzado).
        const conectorHecho = indice > 0 && pasos[indice - 1]!.estado === "hecho";
        return (
          <li
            key={paso.id}
            className={estilos.paso}
            data-estado={paso.estado}
            data-conector={indice > 0 ? (conectorHecho ? "hecho" : "pendiente") : undefined}
            aria-current={paso.estado === "actual" ? "step" : undefined}
          >
            <span className={estilos.marcador} data-estado={paso.estado} aria-hidden="true">
              {paso.estado === "hecho" ? "✓" : null}
            </span>
            <span className={estilos.etiqueta} data-estado={paso.estado}>
              {paso.etiqueta}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
