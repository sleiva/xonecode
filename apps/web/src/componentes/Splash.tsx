import estilos from "./Splash.module.css";

/**
 * SOLO el lienzo del primer arranque — ni centra, ni envuelve nada, ni pinta marca
 * alguna. Antes este mismo componente hacía las dos cosas (pintaba Y centraba lo que se
 * le pasara como `children`), pero eso mezclaba dos trabajos distintos: el usuario pidió
 * separar el LIENZO (esto) de la INTERFAZ que va encima (`Marca.tsx` y
 * `PantallaDeArranque.tsx`, que las apila junto al paso del alta). Quien retoque el
 * diseño de xonecode toca solo este fichero (o `estilos/splash.css`, donde viven los
 * valores) y nunca `PantallaDeArranque`, `Marca`, `Bienvenida` ni `Wizard`.
 *
 * Ya NO es un color sólido provisional: `estilos/splash.css` trae el diseño de verdad
 * del usuario (gradiente radial + cuadrícula), y sigue sin logos ni composición — eso es
 * `Marca.tsx`, que se pinta encima, no aquí dentro.
 */
export function Splash() {
  return <div className={estilos.splash} />;
}
