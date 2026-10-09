import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import QRCode from "qrcode";
import type { EstadoRemoto } from "../store.js";
import { BotonDeCopiar } from "./BotonDeCopiar.js";
import estilos from "./SesionRemota.module.css";
import coraza from "./NuevaSesion.module.css";

type Enviar = (m: { clase: "remoto"; accion: "encender" | "revocar" | "apagar" }) => Promise<unknown> | void;

/**
 * El botón «Sesión remota» y su diálogo. Sin `remoto` (el interruptor está apagado y el
 * servidor no lo dice) no se pinta nada. El QR es un SVG en un `<img>` de data URL: nunca
 * marcado inyectado. El diálogo se pliega DESMONTANDO, y se cierra solo al apagarse la
 * sesión o perderse el estado, para no reaparecer tras una reconexión.
 *
 * Este diálogo no decide nada: Escape y el clic en el velo lo CIERRAN y no mandan ninguna
 * `accion` (la regla de «Escape no hace nada» es de los diálogos de decisión).
 */
export function SesionRemota({ remoto, enviar, abierto: abiertoInicial = false }: { remoto: EstadoRemoto | undefined; enviar: Enviar; abierto?: boolean }) {
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
        onClick={() => {
          if (remoto.estado === "apagada" || remoto.estado === "error") void enviar({ clase: "remoto", accion: "encender" });
          setAbierto(true);
        }}
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
