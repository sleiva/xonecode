import type { ReactNode } from "react";
import estilos from "./Splash.module.css";

/**
 * El lienzo del primer arranque, separado a propósito del contenido que se pinta encima
 * (`Wizard.tsx`, `Selector.tsx`, `Pregunta.tsx`, montados por `App.tsx`).
 *
 * Hoy es un color sólido y PROVISIONAL: el usuario diseñará el splash de verdad para
 * xonecode más adelante, y que sea un componente aparte es lo que hace que ese rediseño
 * sea cambiar `Splash.module.css` (o esta función entera) y nada de lo que ya sabe
 * pintarse encima. Nada de degradados ni composición mientras tanto — color y punto, tal
 * cual se pidió.
 */
export function Splash({ children }: { children: ReactNode }) {
  return <div className={estilos.splash}>{children}</div>;
}
