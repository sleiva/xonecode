import { useEffect, useState } from "react";
import type { EstadoDelCliente, NgrokDelCable } from "../store.js";
import { Receta } from "./Receta.js";
import estilos from "./TunelNgrok.module.css";

export type AccionDeNgrok = { clase: "remoto"; accion: "authtoken" } | { clase: "remoto"; accion: "dominio"; dominio: string };

/**
 * La tarjeta de ngrok de Ajustes → Sesión remota: en qué punto está el túnel local, y lo que
 * falta para que sirva. Tres pantallas que salen de lo MEDIDO por el servidor y no de recordar
 * qué se pulsó: no instalado (la receta, con su progreso), instalado sin cuenta (el botón del
 * authtoken), y listo (con su dominio opcional).
 *
 * **Quién decide qué dominio vale es el SERVIDOR** (`motivoDeDominioInaceptable`): aquí no hay
 * una segunda copia de la regla que pudiera divergir; un rechazo llega como `ngrok.motivo` y se
 * pinta tal cual. **La vía se elige en el diálogo de la sesión, no aquí**: un solo control.
 *
 * El authtoken NO se teclea aquí: el botón manda la acción y el servidor lo pide por el diálogo
 * de secreto de siempre (`leerSecreto`), el único mensaje del cable que lleva una clave.
 */
export function TunelNgrok({
  ngrok,
  instalacion,
  conectado = true,
  alEnviar,
  alEjecutarPaso,
  alCancelarPaso,
}: {
  ngrok: NgrokDelCable;
  instalacion?: EstadoDelCliente["instalacion"];
  conectado?: boolean;
  alEnviar: (m: AccionDeNgrok) => void;
  alEjecutarPaso?: (numero: number) => void;
  alCancelarPaso?: () => void;
}) {
  const [dominio, setDominio] = useState(ngrok.dominio ?? "");
  // Si el servidor confirma otro dominio (o lo quita), el campo lo sigue.
  useEffect(() => setDominio(ngrok.dominio ?? ""), [ngrok.dominio]);

  return (
    <div className={estilos.envoltura}>
      <h3 className={estilos.titulo}>Túnel local (ngrok)</h3>
      {!ngrok.instalado ? (
        ngrok.receta !== undefined ? (
          <Receta
            receta={ngrok.receta}
            {...(instalacion === undefined ? {} : { instalacion })}
            {...(conectado && alEjecutarPaso !== undefined ? { alEjecutar: alEjecutarPaso } : {})}
            {...(conectado && alCancelarPaso !== undefined ? { alCancelar: alCancelarPaso } : {})}
          />
        ) : (
          <p className={estilos.nota}>ngrok no está instalado en esta máquina.</p>
        )
      ) : !ngrok.cuenta ? (
        <>
          <p className={estilos.nota}>ngrok está instalado, pero falta su authtoken (lo da tu cuenta gratuita de ngrok).</p>
          <button
            type="button"
            className={estilos.boton}
            disabled={!conectado}
            onClick={() => alEnviar({ clase: "remoto", accion: "authtoken" })}
          >
            Poner authtoken
          </button>
        </>
      ) : (
        <>
          <p className={estilos.listo}>ngrok listo{ngrok.dominio === undefined ? "" : ` · dominio ${ngrok.dominio}`}</p>
          <div className={estilos.fila}>
            <input
              type="text"
              value={dominio}
              placeholder="Dominio fijo (opcional)"
              aria-label="Dominio fijo de ngrok"
              disabled={!conectado}
              onChange={(e) => setDominio(e.target.value)}
            />
            <button
              type="button"
              className={estilos.boton}
              disabled={!conectado || dominio.trim() === (ngrok.dominio ?? "")}
              title="Vacío = quitar el dominio y usar uno aleatorio en cada encendido"
              onClick={() => alEnviar({ clase: "remoto", accion: "dominio", dominio: dominio.trim() })}
            >
              Guardar
            </button>
          </div>
        </>
      )}
      {ngrok.motivo === undefined ? null : <p className={estilos.motivo}>{ngrok.motivo}</p>}
    </div>
  );
}
