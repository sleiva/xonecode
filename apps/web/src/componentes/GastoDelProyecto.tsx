import { useState } from "react";
import { abreviar } from "../cifras.js";
import { selloDeFecha } from "../selloDeFecha.js";
import type { GastoDelProyecto as Datos, BarraDeGasto } from "../gastoDelProyecto.js";
import estilos from "./GastoDelProyecto.module.css";

/**
 * El gasto de un proyecto, en TOKENS: una columna por sesión y el total arriba.
 *
 * Lo que decide qué se afirma es `gastoDelProyecto.ts` (puro, con test); esto solo lo pinta,
 * siguiendo el procedimiento del skill `dataviz`:
 *
 * - **Dos series que NO se suman**, el grafo y un agente externo, apiladas en la misma columna
 *   con un hueco de 2 px entre ellas y el extremo redondeado. Sus colores (`--xonecode-gasto-*`,
 *   `estilos/marca.css`) están VALIDADOS con el validador del skill, en claro y en oscuro, cada
 *   uno contra su fondo.
 * - **La identidad nunca va solo por color**: con dos series hay leyenda con palabras; con una,
 *   ni leyenda — el título ya la nombra. Las cifras van en tinta de texto, nunca del color de la
 *   serie.
 * - **Cada columna se lee al pasar o al ENFOCAR** (el teclado también llega): un tooltip con la
 *   sesión, su fecha y sus cifras. Y está la tabla con todo, que es además lo que el aviso de
 *   contraste del naranja exige.
 *
 * Columnas HTML y no un SVG: se estiran al ancho sin deformar el texto, y cada una es un
 * elemento enfocable de verdad.
 */
export function GastoDelProyecto({ datos }: { datos: Datos }) {
  const [enfocada, setEnfocada] = useState<string | undefined>(undefined);
  const { barras, total, conGasto, sinGasto, hayExterno } = datos;
  const maximo = Math.max(1, ...barras.map((b) => b.modelo.tokens + b.externo.tokens));
  const laEnfocada = barras.find((b) => b.id === enfocada);

  return (
    <div className={estilos.gasto}>
      {/* El total, por cuenta y sin sumarlas, y SOBRE CUÁNTAS sesiones está hecho. */}
      <dl className={estilos.totales}>
        <div className={estilos.total}>
          <dt className={estilos.rotulo}>{hayExterno ? "Modelo" : "Total"}</dt>
          <dd className={estilos.cifra}>
            {abreviar(total.modelo.tokens)} <span className={estilos.unidad}>tokens</span>
            {total.modelo.cache > 0 ? (
              <span className={estilos.cache}> · {abreviar(total.modelo.cache)} de caché</span>
            ) : null}
          </dd>
        </div>
        {hayExterno ? (
          <div className={estilos.total}>
            <dt className={estilos.rotulo}>Agente externo</dt>
            <dd className={estilos.cifra}>
              {abreviar(total.externo.tokens)} <span className={estilos.unidad}>tokens</span>
              {total.externo.cache > 0 ? (
                <span className={estilos.cache}> · {abreviar(total.externo.cache)} de caché</span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className={estilos.alcance}>
        de {conGasto} {conGasto === 1 ? "sesión" : "sesiones"}
        {sinGasto > 0 ? ` · ${sinGasto} sin gasto que conste, fuera del total` : ""}
      </p>

      {hayExterno ? (
        <ul className={estilos.leyenda} aria-label="leyenda">
          <li>
            <span className={estilos.muestra} data-serie="modelo" aria-hidden="true" />
            Modelo
          </li>
          <li>
            <span className={estilos.muestra} data-serie="externo" aria-hidden="true" />
            Agente externo
          </li>
        </ul>
      ) : null}

      <div className={estilos.lienzo}>
        <span className={estilos.maximo} aria-hidden="true">
          {abreviar(maximo)}
        </span>
        <div
          className={estilos.columnas}
          role="img"
          aria-label={`Tokens de las ${barras.length} últimas sesiones con gasto: la mayor, ${abreviar(maximo)}.`}
        >
          {barras.map((b) => (
            <Columna
              key={b.id}
              barra={b}
              maximo={maximo}
              hayExterno={hayExterno}
              alEnfocar={() => setEnfocada(b.id)}
              alSoltar={() => setEnfocada((actual) => (actual === b.id ? undefined : actual))}
            />
          ))}
        </div>
        {laEnfocada === undefined ? null : (
          <div className={estilos.tooltip} role="status">
            <strong className={estilos.tituloTooltip}>{tituloDe(laEnfocada)}</strong>
            {laEnfocada.ultimoTurno === undefined ? null : (
              <span className={estilos.fechaTooltip}>{selloDeFecha(laEnfocada.ultimoTurno)}</span>
            )}
            <span>{lineaDeCifras(laEnfocada, hayExterno)}</span>
          </div>
        )}
      </div>

      <details className={estilos.tabla}>
        <summary>Ver como tabla</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Sesión</th>
              <th scope="col">Último turno</th>
              <th scope="col">{hayExterno ? "Modelo" : "Tokens"}</th>
              {hayExterno ? <th scope="col">Agente externo</th> : null}
              <th scope="col">Caché</th>
            </tr>
          </thead>
          <tbody>
            {[...barras].reverse().map((b) => (
              <tr key={b.id}>
                <td>{tituloDe(b)}</td>
                <td>{b.ultimoTurno === undefined ? "—" : selloDeFecha(b.ultimoTurno)}</td>
                <td>{abreviar(b.modelo.tokens)}</td>
                {hayExterno ? <td>{abreviar(b.externo.tokens)}</td> : null}
                <td>{abreviar(b.modelo.cache + b.externo.cache)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function tituloDe(b: BarraDeGasto): string {
  return b.titulo === "" ? "Sin título" : b.titulo;
}

function lineaDeCifras(b: BarraDeGasto, hayExterno: boolean): string {
  const cache = b.modelo.cache + b.externo.cache;
  const partes = hayExterno
    ? [`modelo ${abreviar(b.modelo.tokens)}`, `externo ${abreviar(b.externo.tokens)}`]
    : [`${abreviar(b.modelo.tokens)} tokens`];
  return [...partes, ...(cache > 0 ? [`${abreviar(cache)} de caché`] : [])].join(" · ");
}

/** Una columna: su zona de toque es la columna ENTERA, más ancha que la barra. */
function Columna({
  barra,
  maximo,
  hayExterno,
  alEnfocar,
  alSoltar,
}: {
  barra: BarraDeGasto;
  maximo: number;
  hayExterno: boolean;
  alEnfocar: () => void;
  alSoltar: () => void;
}) {
  const alto = (tokens: number): string => `${(tokens / maximo) * 100}%`;
  return (
    <span
      className={estilos.columna}
      tabIndex={0}
      aria-label={`${tituloDe(barra)}: ${lineaDeCifras(barra, hayExterno)}`}
      onMouseEnter={alEnfocar}
      onMouseLeave={alSoltar}
      onFocus={alEnfocar}
      onBlur={alSoltar}
    >
      <span className={estilos.pila}>
        {barra.externo.tokens > 0 ? (
          <span className={estilos.segmento} data-serie="externo" style={{ height: alto(barra.externo.tokens) }} />
        ) : null}
        {barra.modelo.tokens > 0 ? (
          <span className={estilos.segmento} data-serie="modelo" style={{ height: alto(barra.modelo.tokens) }} />
        ) : null}
      </span>
    </span>
  );
}
