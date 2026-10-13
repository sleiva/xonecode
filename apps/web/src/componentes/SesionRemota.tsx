import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import QRCode from "qrcode";
import type { EstadoRemoto } from "../store.js";
import { BotonDeCopiar } from "./BotonDeCopiar.js";
import estilos from "./SesionRemota.module.css";
import coraza from "./NuevaSesion.module.css";

type Via = "servidor" | "ngrok";
type Enviar = (
  m: { clase: "remoto"; accion: "encender" | "revocar" | "apagar" } | { clase: "remoto"; accion: "via"; via: Via },
) => Promise<unknown> | void;

const VIAS: readonly { via: Via; etiqueta: string; que: string }[] = [
  { via: "servidor", etiqueta: "Servidor de XOne", que: "La sesión pasa por el servidor de XOne: no necesitas instalar nada" },
  { via: "ngrok", etiqueta: "Túnel local (ngrok)", que: "La sesión sale por un túnel de ngrok de esta máquina: necesita ngrok instalado y su authtoken" },
];

/** Qué le falta a ngrok para encender, o `undefined` si está listo (o no se sabe y no se bloquea). */
function faltaDeNgrok(remoto: EstadoRemoto): string | undefined {
  if (remoto.via !== "ngrok") return undefined;
  if (remoto.ngrok === undefined) return "ngrok todavía no se ha medido en esta máquina.";
  if (!remoto.ngrok.instalado) return "ngrok no está instalado en esta máquina.";
  if (!remoto.ngrok.cuenta) return "A ngrok le falta el authtoken de tu cuenta.";
  return undefined;
}

/**
 * El botón «Sesión remota» y su diálogo. Sin `remoto` (el interruptor está apagado y el
 * servidor no lo dice) no se pinta nada. El QR es un SVG en un `<img>` de data URL: nunca
 * marcado inyectado. El diálogo se pliega DESMONTANDO, y se cierra solo al apagarse la
 * sesión o perderse el estado, para no reaparecer tras una reconexión.
 *
 * Este diálogo no decide nada: Escape y el clic en el velo lo CIERRAN y no mandan ninguna
 * `accion` (la regla de «Escape no hace nada» es de los diálogos de decisión).
 */
export function SesionRemota({
  remoto,
  enviar,
  abierto: abiertoInicial = false,
  alAbrirAjustes,
}: {
  remoto: EstadoRemoto | undefined;
  enviar: Enviar;
  abierto?: boolean;
  /** Lleva a Ajustes → Sesión remota. Ausente = no se ofrece el botón. */
  alAbrirAjustes?: () => void;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [qr, setQr] = useState<string | undefined>(undefined);
  const boton = useRef<HTMLButtonElement>(null);
  const url = remoto !== undefined && "url" in remoto ? remoto.url : undefined;
  const estado = remoto?.estado;
  const antes = useRef(estado);

  useEffect(() => {
    // Solo el FLANCO: abrir con «apagada» (el botón la enciende) no es apagarse.
    const venia = antes.current;
    antes.current = estado;
    if (estado === undefined || (estado === "apagada" && venia !== "apagada" && venia !== undefined)) setAbierto(false);
  }, [estado]);

  useEffect(() => {
    let vivo = true;
    if (url === undefined) {
      setQr(undefined);
      return;
    }
    void QRCode.toString(url, { type: "svg", margin: 1 })
      .then((svg) => {
        if (vivo) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (vivo) setQr(undefined);
      });
    return () => {
      vivo = false;
    };
  }, [url]);

  if (remoto === undefined) return null;

  const cerrar = (): void => {
    setAbierto(false);
    boton.current?.focus();
  };

  return (
    <>
      <button
        ref={boton}
        type="button"
        className={estilos.boton}
        // Abrir el diálogo NO enciende: la vía solo se puede elegir mientras está apagada, y
        // encender al abrir la dejaba ya en «abriendo» cuando la persona llegaba al conmutador.
        onClick={() => setAbierto(true)}
      >
        Sesión remota
      </button>
      {abierto ? (
        <Modal open onClose={cerrar} title="Sesión remota" headless className={coraza.capa}>
          <div
            className={coraza.velo}
            onClick={(evento: MouseEvent<HTMLDivElement>) => {
              if (evento.target === evento.currentTarget) cerrar();
            }}
          >
            <div className={`${coraza.ventana} ${estilos.ventana}`}>
              <h2 className={coraza.titulo}>Sesión remota</h2>
              {remoto.estado === "abriendo" ? <p className={coraza.nota}>Abriendo la sesión remota…</p> : null}
              {remoto.estado === "reconectando" && remoto.url === undefined ? (
                <p className={coraza.nota}>No se puede llegar al puente; se sigue intentando…</p>
              ) : null}
              {remoto.estado === "apagada" ? <p className={coraza.nota}>La sesión remota está apagada.</p> : null}
              {remoto.estado === "error" ? <p className={estilos.error}>{remoto.motivo}</p> : null}
              {/* La vía se elige con la sesión parada: el servidor la rechaza en cualquier otro estado. */}
              {remoto.estado === "apagada" || remoto.estado === "error" ? (
                <>
                  <div className={estilos.pista} role="group" aria-label="vía de la sesión remota">
                    {VIAS.map(({ via, etiqueta, que }) => {
                      const puesta = (remoto.via ?? "servidor") === via;
                      return (
                        <button
                          key={via}
                          type="button"
                          className={estilos.mitad}
                          aria-pressed={puesta}
                          data-puesto={puesta ? "" : undefined}
                          title={que}
                          onClick={() => {
                            if (puesta) return;
                            void enviar({ clase: "remoto", accion: "via", via });
                          }}
                        >
                          {etiqueta}
                        </button>
                      );
                    })}
                  </div>
                  {faltaDeNgrok(remoto) !== undefined ? (
                    <>
                      <p className={estilos.aviso}>{faltaDeNgrok(remoto)} Prepáralo en Ajustes antes de encender la sesión por este túnel.</p>
                      {alAbrirAjustes !== undefined ? (
                        <div className={coraza.acciones}>
                          <button
                            type="button"
                            className={estilos.secundario}
                            onClick={() => {
                              cerrar();
                              alAbrirAjustes();
                            }}
                          >
                            Abrir Ajustes
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className={coraza.acciones}>
                      <button type="button" className={estilos.primario} onClick={() => void enviar({ clase: "remoto", accion: "encender" })}>
                        Encender
                      </button>
                    </div>
                  )}
                </>
              ) : null}
              {/* Sin enlace todavía, lo único que se puede hacer es dejar de intentarlo. */}
              {remoto.estado === "abriendo" || (remoto.estado === "reconectando" && remoto.url === undefined) ? (
                <div className={coraza.acciones}>
                  <button type="button" className={estilos.peligro} onClick={() => void enviar({ clase: "remoto", accion: "apagar" })}>
                    Apagar
                  </button>
                </div>
              ) : null}
              {(remoto.estado === "activa" || remoto.estado === "reconectando") && remoto.url !== undefined ? (
                <>
                  {qr !== undefined ? <img className={estilos.qr} src={qr} alt="Código QR de la sesión remota" /> : null}
                  <p className={estilos.url}>{remoto.url}</p>
                  <BotonDeCopiar texto={remoto.url} etiqueta="Copiar enlace" />
                  <p>
                    {remoto.moviles} aparato{remoto.moviles === 1 ? "" : "s"} conectado{remoto.moviles === 1 ? "" : "s"}
                  </p>
                  {remoto.estado === "reconectando" ? <p>Reconectando…</p> : null}
                  <p className={estilos.aviso}>
                    {remoto.via === "ngrok" ? "Sale por un túnel de ngrok de esta máquina." : "Sale por el servidor de XOne."}
                  </p>
                  {remoto.via === "ngrok" ? (
                    <p className={estilos.aviso}>
                      La primera vez, el móvil enseña un aviso de ngrok: pulsa «Visit Site» para continuar.
                    </p>
                  ) : null}
                  <p className={estilos.aviso}>Quien tenga este enlace controla esta sesión hasta que lo revoques o la apagues.</p>
                  <div className={coraza.acciones}>
                    <button type="button" className={estilos.secundario} onClick={() => void enviar({ clase: "remoto", accion: "revocar" })}>
                      Revocar enlace
                    </button>
                    <button type="button" className={estilos.peligro} onClick={() => void enviar({ clase: "remoto", accion: "apagar" })}>
                      Apagar
                    </button>
                  </div>
                </>
              ) : null}
              <div className={coraza.acciones}>
                <button type="button" className={estilos.secundario} onClick={cerrar} autoFocus>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
