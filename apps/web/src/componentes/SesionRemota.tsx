import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { EstadoRemoto } from "../store.js";
import estilos from "./SesionRemota.module.css";

type Enviar = (m: { clase: "remoto"; accion: "encender" | "revocar" | "apagar" }) => Promise<unknown> | void;

/**
 * El botón «Sesión remota» y su diálogo. Sin `remoto` (el interruptor está apagado y el
 * servidor no lo dice) no se pinta nada. El QR es un SVG en un `<img>` de data URL: nunca
 * marcado inyectado. El diálogo se pliega DESMONTANDO.
 */
export function SesionRemota({ remoto, enviar, abierto: abiertoInicial = false }: { remoto: EstadoRemoto | undefined; enviar: Enviar; abierto?: boolean }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [qr, setQr] = useState<string | undefined>(undefined);
  const url = remoto !== undefined && "url" in remoto ? remoto.url : undefined;

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

  return (
    <>
      <button
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
        <div role="dialog" aria-label="Sesión remota" className={estilos.dialogo}>
          {remoto.estado === "abriendo" ? <p>Abriendo la sesión remota…</p> : null}
          {remoto.estado === "error" ? <p className={estilos.error}>{remoto.motivo}</p> : null}
          {remoto.estado === "activa" || remoto.estado === "reconectando" ? (
            <>
              {qr !== undefined ? <img className={estilos.qr} src={qr} alt="Código QR de la sesión remota" /> : null}
              <p className={estilos.url}>{remoto.url}</p>
              <button type="button" className={estilos.secundario} onClick={() => void navigator.clipboard?.writeText(remoto.url)}>
                Copiar enlace
              </button>
              <p>
                {remoto.moviles} aparato{remoto.moviles === 1 ? "" : "s"} conectado{remoto.moviles === 1 ? "" : "s"}
              </p>
              {remoto.estado === "reconectando" ? <p>Reconectando…</p> : null}
              <p className={estilos.aviso}>Quien tenga este enlace controla esta sesión hasta que lo revoques o la apagues.</p>
              <button type="button" className={estilos.secundario} onClick={() => void enviar({ clase: "remoto", accion: "revocar" })}>
                Revocar enlace
              </button>
              <button type="button" className={estilos.peligro} onClick={() => void enviar({ clase: "remoto", accion: "apagar" })}>
                Apagar
              </button>
            </>
          ) : null}
          <button type="button" className={estilos.secundario} onClick={() => setAbierto(false)}>
            Cerrar
          </button>
        </div>
      ) : null}
    </>
  );
}
