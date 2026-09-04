import type { ReactNode } from "react";
import { Bienvenida } from "./Bienvenida.js";
import { PasosDelAlta, type PasoDeAlta } from "./PasosDelAlta.js";
import estilos from "./TarjetaDeAlta.module.css";

/**
 * La UNA tarjeta del alta: antes eran dos —la bienvenida flotando arriba, el paso actual
 * (`Pregunta`, `Selector` o `Wizard`) suelto debajo, con un hueco entre las dos— y leían
 * como dos cosas sin relación, no como una sola pantalla. Aquí el saludo es la CABECERA
 * (`Bienvenida`, ya sin caja propia — ver su CSS) y el paso actual (`children`) vive
 * DENTRO del mismo borde. Solo esta tarjeta pone el borde y el fondo de la pantalla de
 * arranque; `Bienvenida` y `Wizard` perdieron los suyos a propósito para no quedar dos
 * cajas anidadas con el mismo aspecto.
 *
 * `pasos` es la progresión ya CALCULADA (`App.tsx`), no algo que este componente derive:
 * es presentación pura, como toda la interfaz del alta.
 */
export function TarjetaDeAlta({
  nombre,
  pasos,
  children,
}: {
  nombre?: string;
  pasos: readonly PasoDeAlta[];
  children?: ReactNode;
}) {
  return (
    <div className={estilos.tarjeta}>
      <Bienvenida nombre={nombre} />
      <PasosDelAlta pasos={pasos} />
      {children}
    </div>
  );
}
