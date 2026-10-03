import estilos from "./BotonSubir.module.css";

/**
 * Lo que el botón «Subir» necesita saber, lo calcula `App` —que es quien ve el cable—: el
 * MISMO para la banda de CloudStudio en Revisión y para la tarjeta del Resumen, porque los
 * dos mandan la misma intención (`{clase:"sync", accion:"subir"}`).
 */
export interface EstadoDeSubida {
  /**
   * Se pulsó y todavía no ha salido el diálogo (ni ha terminado la operación): el servidor
   * mide git antes de preguntar, y eso tarda. Sin esto, un clic que no hace nada visible.
   */
  esperando: boolean;
  /** Por qué no se puede pulsar ahora (un turno en marcha). Ausente = se puede. */
  motivoParaNo?: string;
  alSubir: () => void;
}

/**
 * «Subir», con su espera DENTRO del botón: girando y apagado desde el clic hasta que sale el
 * diálogo con el plan. Cuándo deja de esperar lo decide `App`, que es quien ve llegar la
 * pregunta, el acto de la operación o el fallo — no un temporizador que adivine.
 */
export function BotonSubir({
  subida,
  className,
  apagado = false,
}: {
  subida: EstadoDeSubida;
  /** La clase de quien lo monta: el botón azul de la banda o el secundario del Resumen. */
  className?: string;
  /** Sin cable no se pide nada: la petición se perdería sin decirlo. */
  apagado?: boolean;
}) {
  const bloqueado = apagado || subida.esperando || subida.motivoParaNo !== undefined;
  return (
    <button
      type="button"
      className={className === undefined ? estilos.boton : `${className} ${estilos.boton}`}
      disabled={bloqueado}
      aria-busy={subida.esperando}
      title={
        subida.esperando
          ? "Preparando el plan de la subida…"
          : (subida.motivoParaNo ?? "Sube a CloudStudio los cambios commiteados; antes eliges qué ficheros")
      }
      onClick={subida.alSubir}
    >
      {subida.esperando ? <span className={estilos.girando} aria-hidden="true" /> : null}
      Subir
    </button>
  );
}
