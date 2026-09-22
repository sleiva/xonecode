import { useCallback, useRef, useState } from "react";
import { useCerrarAlPulsarFuera } from "../cerrarAlPulsarFuera.js";
import type { ModoDeEscritura } from "../tipos.js";
import estilos from "./PastillaDeModelo.module.css";

/**
 * Quién aprueba las escrituras de esta sesión, al lado del modelo y del dispositivo.
 *
 * Comparte la hoja de estilos con `PastillaDeModelo` —igual que la de esfuerzo y la de
 * dispositivo— porque es el mismo objeto: una elección DE LA SESIÓN que decide el servidor
 * y el cliente pinta. Una hoja propia solo serviría para que las cuatro pastillas de la
 * misma fila divergieran.
 *
 * Cuatro reglas, y ninguna es de forma:
 *
 * - **Sin modo no se pinta.** Ausente significa que no hay sesión abierta, no
 *   «supervisado»: un control sin dato detrás no se pinta, y aquí pintarlo diciendo
 *   «supervisado» afirmaría algo sobre una sesión que no existe.
 * - **Es un MENÚ y no un interruptor**, aunque sean dos valores. Encenderlo cambia lo que
 *   va a pasar con los ficheros del proyecto, y un interruptor no tiene dónde decir eso;
 *   el menú lleva la frase que explica qué se concede y qué NO —la subida sigue
 *   preguntando—, que es justo lo que alguien necesita leer antes de pulsarlo.
 * - **La etiqueta lleva la tilde y el valor no.** Lo que viaja y se compara es `autonomo`
 *   a secas (`core/modoDeEscritura.ts`); «autónomo» es cómo se escribe en castellano, y
 *   meter la tilde en el dato habría sido un segundo vocabulario para lo mismo.
 * - **Lo que NO dice es que sea del proyecto.** Es de esta conversación, y la frase del
 *   menú lo dice: una sesión nueva vuelve a preguntar.
 */
export function PastillaDeModoDeEscritura({
  actual,
  conectado = true,
  alElegir,
}: {
  /** El modo de la sesión abierta. Ausente = no hay sesión, y entonces no se pinta. */
  actual?: ModoDeEscritura;
  conectado?: boolean;
  alElegir: (modo: ModoDeEscritura) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const envoltura = useRef<HTMLDivElement>(null);
  const cerrarMenu = useCallback(() => setAbierta(false), []);
  // El hook va SIEMPRE, antes de cualquier return: las reglas de hooks no admiten que
  // desaparezca cuando la pastilla no se pinta.
  useCerrarAlPulsarFuera(abierta, envoltura, cerrarMenu);

  if (actual === undefined) return null;

  const elegir = (modo: ModoDeEscritura): void => {
    setAbierta(false);
    alElegir(modo);
  };

  const OPCIONES: readonly { modo: ModoDeEscritura; etiqueta: string; que: string }[] = [
    {
      modo: "supervisado",
      etiqueta: "supervisado",
      que: "cada escritura para y te enseña su diff",
    },
    {
      modo: "autonomo",
      etiqueta: "autónomo",
      que: "las escrituras se aplican solas y el turno te dice qué ficheros tocó",
    },
  ];

  return (
    <div className={estilos.envoltura} ref={envoltura}>
      <button
        type="button"
        className={estilos.pastilla}
        aria-expanded={abierta}
        aria-haspopup="menu"
        disabled={!conectado}
        title="Quién aprueba las escrituras en esta sesión"
        onClick={() => setAbierta((v) => !v)}
      >
        {actual === "autonomo" ? "autónomo" : "supervisado"}
      </button>
      {abierta ? (
        <div className={estilos.menu} role="menu" aria-label="modo de escritura">
          <div className={estilos.titulo} role="presentation">
            Modo de escritura
          </div>
          <div className={estilos.modelos}>
            {OPCIONES.map(({ modo, etiqueta, que }) => (
              <button
                key={modo}
                type="button"
                role="menuitem"
                className={estilos.modelo}
                data-actual={modo === actual ? "" : undefined}
                {...(modo === actual ? { "aria-current": "true" as const } : {})}
                title={que}
                onClick={() => elegir(modo)}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          <p className={estilos.espera}>
            Es de esta conversación: una sesión nueva vuelve a preguntar. Subir a CloudStudio
            sigue enseñando su plan en los dos modos.
          </p>
        </div>
      ) : null}
    </div>
  );
}
