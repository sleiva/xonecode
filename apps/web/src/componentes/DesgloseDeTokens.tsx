import { useEffect, useRef, type MouseEvent } from "react";
import { Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import { abreviar } from "../cifras.js";
import { filasPorModelo } from "../consumoPintable.js";
import type { ConsumoPorModelo } from "../tipos.js";
import coraza from "./Pregunta.module.css";
import estilos from "./DesgloseDeTokens.module.css";

/**
 * Los tokens de la conversación POR MODELO: un especialista puede correr en otro modelo que el
 * raíz (el `modelo:` de su `.md`), y el total del compositor no dice cuál gastó qué.
 *
 * Tres reglas, las del contador:
 * - Se suman TOKENS, nunca coste: cada modelo es de su proveedor, y un agente externo va contra su
 *   suscripción. Por eso la fila de un externo lo DICE.
 * - Las cifras van ya en la misma convención (`filasPorModelo`): nueva, caché y salida.
 * - Lo gastado antes de medir por modelo sale en su propia fila, «sin desglose», al final: así las
 *   filas suman el total sin inventar de quién fue.
 *
 * Solo LEE: cerrar (botón, Escape o clic fuera) no decide nada.
 */
export function DesgloseDeTokens({ porModelo, alCerrar }: { porModelo: ConsumoPorModelo; alCerrar: () => void }): React.ReactElement {
  const filas = filasPorModelo(porModelo);
  // El foco va a «Cerrar» al abrir, como en el visor de imágenes: es la única acción, y con el
  // teclado se cierra sin tener que ir a buscarla.
  const cerrar = useRef<HTMLButtonElement>(null);
  useEffect(() => cerrar.current?.focus(), []);
  const total = filas.reduce((t, f) => ({ nueva: t.nueva + f.nueva, cache: t.cache + f.cache, salida: t.salida + f.salida }), { nueva: 0, cache: 0, salida: 0 });
  const hayExterno = filas.some((f) => f.cuenta === "externo");
  const haySinDesglose = filas.some((f) => f.sinDesglose);
  return (
    <Modal open onClose={alCerrar} title="Tokens por modelo" headless className={coraza.capa}>
      <div
        className={coraza.velo}
        onClick={(evento: MouseEvent<HTMLDivElement>) => {
          if (evento.target === evento.currentTarget) alCerrar();
        }}
      >
        <div className={estilos.tarjeta}>
          <header className={estilos.cabecera}>
            <p className={estilos.titulo}>Tokens por modelo</p>
            <p className={estilos.subtitulo}>Lo que lleva gastado esta conversación, modelo a modelo.</p>
          </header>
          <table className={estilos.tabla}>
            <thead>
              <tr>
                <th scope="col">Modelo</th>
                <th scope="col">Nueva</th>
                <th scope="col">Caché</th>
                <th scope="col">Salida</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} data-sin-desglose={f.sinDesglose ? "" : undefined}>
                  <th scope="row" className={estilos.modelo}>
                    {f.id}
                    {f.cuenta === "externo" && !f.sinDesglose ? <span className={estilos.marca}>externo</span> : null}
                  </th>
                  <td title={String(f.nueva)}>{abreviar(f.nueva)}</td>
                  <td title={String(f.cache)}>{abreviar(f.cache)}</td>
                  <td title={String(f.salida)}>{abreviar(f.salida)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={estilos.total}>
                <th scope="row">Total</th>
                <td title={String(total.nueva)}>{abreviar(total.nueva)}</td>
                <td title={String(total.cache)}>{abreviar(total.cache)}</td>
                <td title={String(total.salida)}>{abreviar(total.salida)}</td>
              </tr>
            </tfoot>
          </table>
          {haySinDesglose ? (
            <p className={estilos.nota}>«Sin desglose» es lo gastado en turnos de antes de medir por modelo.</p>
          ) : null}
          {hayExterno ? (
            <p className={estilos.nota}>Un agente externo va contra su propia suscripción: se suman tokens, no coste.</p>
          ) : null}
          <div className={estilos.acciones}>
            {/* El primario de la app (`Boton.module.css`, por la coraza de `Pregunta`), como el
                «Cerrar» del visor de imágenes: el `Button` del paquete no lleva nuestro estilo. */}
            <button ref={cerrar} type="button" className={coraza.accion} onClick={alCerrar}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
