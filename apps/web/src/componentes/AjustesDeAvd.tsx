import { useEffect, useRef, useState } from "react";
import { motivoDePuertoInaceptable } from "../reglasDeAvd.js";
import type { AjustesDeDispositivos } from "../tipos.js";
import estilos from "./AjustesDeAvd.module.css";

/**
 * Lo que se decide de UN AVD: el puerto local de su túnel y si arranca sin ventana.
 *
 * **El puerto solo con dos o más AVD** (`conPuerto`): con uno es el de siempre y no hay nada
 * que decidir. **Se comprueba ANTES de enviar** con las reglas del host (`reglasDeAvd.ts`),
 * porque las negativas del servidor no llegan al navegador; lo que no vale no se manda y se
 * dice por qué al lado del campo.
 */
export function AjustesDeAvd({
  avd,
  ajuste,
  conPuerto,
  conectado,
  ajustes,
  alCambiar,
}: {
  avd: string;
  ajuste: { puerto?: number; sinVentana?: true } | undefined;
  conPuerto: boolean;
  conectado?: boolean;
  /** Todos los ajustes de AVD, para saber qué puertos ya tienen dueño. */
  ajustes?: AjustesDeDispositivos;
  alCambiar: (cambio: { puerto?: number; sinVentana?: boolean }) => void;
}) {
  const [borrador, setBorrador] = useState(String(ajuste?.puerto ?? ""));
  const [motivo, setMotivo] = useState<string | undefined>(undefined);
  // Enter y luego blur confirman dos veces el mismo valor antes de que vuelva la foto: se
  // recuerda lo último enviado para no mandarlo dos.
  const enviado = useRef<number | undefined>(undefined);
  useEffect(() => {
    enviado.current = undefined;
    setBorrador(String(ajuste?.puerto ?? ""));
    setMotivo(undefined);
  }, [ajuste?.puerto]);
  const confirmar = (): void => {
    const n = borrador.trim() === "" ? Number.NaN : Number(borrador);
    if (Number.isInteger(n) && n === ajuste?.puerto) {
      setMotivo(undefined);
      return;
    }
    const porQue = motivoDePuertoInaceptable(n, avd, ajustes);
    setMotivo(porQue);
    if (porQue !== undefined || enviado.current === n) return;
    enviado.current = n;
    alCambiar({ puerto: n });
  };
  return (
    <span className={estilos.envoltura}>
      <span className={estilos.celdaDePuerto}>
        {conPuerto ? (
          <>
            <label className={estilos.campo}>
              Puerto
              <input
                type="number"
                inputMode="numeric"
                className={estilos.puerto}
                value={borrador}
                disabled={conectado !== true}
                aria-label={`Puerto del túnel de ${avd}`}
                title="El puerto de este Mac que lleva al 8443 del aparato. Cada emulador, el suyo."
                onChange={(e) => {
                  // Editar es querer volver a intentarlo: si el servidor rechazó lo anterior (su
                  // negativa no llega aquí), el mismo valor tecleado de nuevo tiene que reenviarse.
                  enviado.current = undefined;
                  setBorrador(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmar();
                }}
                onBlur={confirmar}
              />
            </label>
            {motivo === undefined ? null : (
              <span className={estilos.motivo} role="alert">
                {motivo}
              </span>
            )}
          </>
        ) : null}
      </span>
      <span className={estilos.celdaDeCasilla}>
        <label className={estilos.campo}>
          <input
            type="checkbox"
            checked={ajuste?.sinVentana === true}
            disabled={conectado !== true}
            aria-label={`Arrancar ${avd} sin ventana`}
            onChange={(e) => alCambiar({ sinVentana: e.target.checked })}
          />
          Sin ventana
        </label>
      </span>
    </span>
  );
}
