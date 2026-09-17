import { useEffect, useState } from "react";
import estilos from "./VerificarDispositivo.module.css";

/**
 * El botón de arrancar un AVD, con lo que pasó al lado.
 *
 * Reusa los estilos de `VerificarDispositivo`: las dos son la misma cosa —una acción al final
 * de la fila de un dispositivo, con su resultado en línea— y dos hojas idénticas divergirían.
 *
 * **«Arrancando…» es estado LOCAL y el resultado viene del servidor.** Pulsar no prueba nada:
 * lo que dice si arrancó es la foto nueva, que tarda lo que tarda un emulador (decenas de
 * segundos). Así que el botón se pone a esperar en cuanto se pulsa —si no, se pulsaría tres
 * veces— y se suelta cuando llega un resultado PARA ESTE avd. Un resultado de otro no lo
 * suelta: son dos filas distintas.
 */
export function ArrancarEmulador({
  avd,
  conectado,
  alArrancar,
  resultado,
}: {
  avd: string;
  conectado?: boolean;
  alArrancar: (avd: string) => void;
  /** Lo que contestó el servidor para ESTE avd. Ausente = no consta. */
  resultado?: { avd: string; ok: boolean; detalle: string };
}) {
  const [arrancando, setArrancando] = useState(false);
  // El resultado es el que suelta el botón: mientras no llega, seguimos esperando.
  useEffect(() => {
    if (resultado !== undefined && resultado.avd === avd) setArrancando(false);
  }, [resultado, avd]);
  return (
    <span className={estilos.envoltura}>
      {resultado === undefined || arrancando ? null : (
        <span className={estilos.resultado} data-ok={resultado.ok ? "" : undefined}>
          <span aria-hidden="true">{resultado.ok ? "✓" : "✕"}</span>
          {/* El motivo con palabras: es lo único accionable de un fallo, y quien use un
              lector de pantalla no tiene el icono. */}
          <span>{resultado.detalle}</span>
        </span>
      )}
      <button
        type="button"
        className={estilos.boton}
        disabled={conectado !== true || arrancando}
        title={`Arranca ${avd} y espera a que el aparato aparezca`}
        onClick={() => {
          setArrancando(true);
          alArrancar(avd);
        }}
      >
        {arrancando ? "Arrancando…" : "Arrancar"}
      </button>
    </span>
  );
}
