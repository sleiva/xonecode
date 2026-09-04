import estilos from "./Splash.module.css";

/**
 * SOLO el fondo del primer arranque — ni centra, ni envuelve nada. Antes este mismo
 * componente hacía las dos cosas (pintaba Y centraba lo que se le pasara como
 * `children`), pero eso mezclaba dos trabajos distintos: el usuario pidió separar el
 * LIENZO (esto) de la INTERFAZ que va encima (`PantallaDeArranque.tsx`, que apila los
 * dos). Quien rediseñe el splash de verdad para xonecode toca solo este fichero (o
 * `estilos/splash.css`) y nunca `PantallaDeArranque`, `Bienvenida` ni `Wizard`.
 *
 * Sigue siendo un color sólido y PROVISIONAL — `estilos/splash.css` explica el porqué de
 * la variable propia—, y sigue sin logos, degradados ni composición.
 */
export function Splash() {
  return <div className={estilos.splash} />;
}
