import { useEffect, useState } from "react";
import type { NgrokDelCable } from "../store.js";
import estilos from "./TunelNgrok.module.css";

export type AccionDeNgrok =
  | { clase: "remoto"; accion: "authtoken"; authtoken: string }
  | { clase: "remoto"; accion: "dominio"; dominio: string };

/**
 * La tarjeta de ngrok de Ajustes → Sesión remota: en qué punto está el túnel local, y lo que
 * falta para que sirva. Tres pantallas que salen de lo MEDIDO por el servidor y no de recordar
 * qué se pulsó: el SDK no carga (viene con xonecode: solo pasa en una plataforma sin su binario), sin cuenta (el botón del
 * authtoken), y listo (con su dominio opcional).
 *
 * **Quién decide qué dominio vale es el SERVIDOR** (`motivoDeDominioInaceptable`): aquí no hay
 * una segunda copia de la regla que pudiera divergir; un rechazo llega como `ngrok.motivo` y se
 * pinta tal cual. **La vía se elige en el diálogo de la sesión, no aquí**: un solo control.
 *
 * **El authtoken SE TECLEA aquí** (petición suya), en un campo de CONTRASEÑA: se manda con la acción
 * y el campo se vacía al instante, sin quedarse en ningún estado de la app. El servidor no lo devuelve
 * nunca —lo que vuelve es la medida, `cuenta`—, así que la tarjeta no puede enseñar cuál hay: solo si
 * hay uno. Con uno puesto, el mismo campo sirve para CAMBIARLO.
 */
export function TunelNgrok({
  ngrok,
  conectado = true,
  alEnviar,
}: {
  ngrok: NgrokDelCable;
  conectado?: boolean;
  alEnviar: (m: AccionDeNgrok) => void;
}) {
  const [dominio, setDominio] = useState(ngrok.dominio ?? "");
  const [authtoken, setAuthtoken] = useState("");
  const guardarAuthtoken = (): void => {
    const limpio = authtoken.trim();
    if (limpio === "") return;
    alEnviar({ clase: "remoto", accion: "authtoken", authtoken: limpio });
    setAuthtoken("");
  };
  const campoDeAuthtoken = (etiqueta: string) => (
    <form
      className={estilos.fila}
      onSubmit={(e) => {
        e.preventDefault();
        guardarAuthtoken();
      }}
    >
      <input
        type="password"
        value={authtoken}
        placeholder={etiqueta}
        aria-label="Authtoken de ngrok"
        autoComplete="off"
        spellCheck={false}
        disabled={!conectado}
        onChange={(e) => setAuthtoken(e.target.value)}
      />
      <button type="submit" className={estilos.boton} disabled={!conectado || authtoken.trim() === ""}>
        Guardar authtoken
      </button>
    </form>
  );
  // Si el servidor confirma otro dominio (o lo quita), el campo lo sigue.
  useEffect(() => setDominio(ngrok.dominio ?? ""), [ngrok.dominio]);

  return (
    <div className={estilos.envoltura}>
      <h3 className={estilos.titulo}>Túnel local (ngrok)</h3>
      {!ngrok.instalado ? (
        <p className={estilos.nota}>El componente de ngrok que trae xonecode no carga en esta máquina: reinstala xonecode.</p>
      ) : !ngrok.cuenta ? (
        <>
          <p className={estilos.nota}>ngrok viene con xonecode; falta tu authtoken (lo da tu cuenta gratuita de ngrok, en dashboard.ngrok.com).</p>
          {campoDeAuthtoken("Pega aquí tu authtoken")}
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
          {/* Con uno puesto, el mismo campo lo CAMBIA: el de ahora no se enseña (no vuelve del servidor). */}
          {campoDeAuthtoken("Cambiar authtoken")}
        </>
      )}
      {ngrok.motivo === undefined ? null : <p className={estilos.motivo}>{ngrok.motivo}</p>}
    </div>
  );
}
