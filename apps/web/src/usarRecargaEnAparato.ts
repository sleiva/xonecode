import { useCallback, useState } from "react";
import type { MensajeDelCliente } from "./tipos.js";

/**
 * La recarga en caliente desde el editor: llevar al aparato de la sesión el fichero que se acaba
 * de guardar (`agent/dispositivos/recargaEnAparato.ts`).
 *
 * - **Solo con un Android elegido en la sesión** (`alta.dispositivoActivo`): sin él no hay a dónde
 *   recargar, y un control sin dato detrás no se pinta.
 * - **Es TRANSPARENTE para el guardado**: el servidor contesta el guardado primero y la recarga va
 *   aparte; sin emulador o sin app, guardar sale igual y la cabecera solo lo DICE, en gris.
 * - **«Recargar al guardar» se recuerda en ESTE navegador** (`localStorage`, envuelto en `try`): es
 *   una comodidad de quien edita, no un dato del proyecto.
 */
const CLAVE = "xonecode.recargarAlGuardar";

function leer(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

export interface ControlDeRecarga {
  /** ¿Hay un Android en la sesión? Sin él no se pinta nada. */
  disponible: boolean;
  /** ¿Se recarga al guardar? Solo cierto con `disponible`. */
  alGuardar: boolean;
  alternar: () => void;
  /** Llevar YA el fichero guardado; sin la app corriendo, desplegar el proyecto entero. */
  probar: (ruta: string) => void;
  /** Relanzar la app: lo que pide un CSS o un `app.ini` para verse. */
  relanzar: (ruta: string) => void;
}

export function usarRecargaEnAparato({
  enviar,
  plataforma,
}: {
  enviar: (mensaje: MensajeDelCliente) => Promise<unknown>;
  /** La plataforma del dispositivo de la sesión, o `undefined` sin ninguno. */
  plataforma: "android" | "ios" | undefined;
}): ControlDeRecarga {
  const [activa, setActiva] = useState(leer);
  const disponible = plataforma === "android";

  const alternar = useCallback(() => {
    setActiva((antes) => {
      const ahora = !antes;
      try {
        window.localStorage.setItem(CLAVE, ahora ? "1" : "0");
      } catch {
        // Sin almacenamiento se recuerda hasta recargar la pestaña, que es lo que se puede.
      }
      return ahora;
    });
  }, []);

  const probar = useCallback(
    (ruta: string) => {
      void enviar({ clase: "recargarEnAparato", ruta, probar: true }).catch(() => {});
    },
    [enviar]
  );
  const relanzar = useCallback(
    (ruta: string) => {
      void enviar({ clase: "recargarEnAparato", ruta, relanzar: true }).catch(() => {});
    },
    [enviar]
  );

  return { disponible, alGuardar: disponible && activa, alternar, probar, relanzar };
}
