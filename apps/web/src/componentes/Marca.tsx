import estilos from "./Marca.module.css";

/**
 * La marca «xonecode» del primer arranque: el símbolo (el mismo SVG del logo oficial del
 * fichero de diseño del usuario) más el logotipo en texto, «xone» en blanco y «code» en
 * cian. Va en la CABECERA del lienzo (`PantallaDeArranque.tsx` la apila antes de
 * `.contenido`), no centrada en mitad de pantalla como en el diseño de origen: allí no
 * había tarjeta con la que competir por el centro óptico; aquí sí la hay, y es la
 * tarjeta del alta quien tiene que quedarse con ese centro.
 *
 * Lo que el diseño de origen traía ALREDEDOR del símbolo —el anillo exterior rotado, el
 * halo difuminado, el pulso de `pulseGlow`— se deja fuera: son adorno puro sobre el
 * símbolo, no el símbolo en sí, y esta pieza ya tiene bastante superficie nueva sin sumar
 * una animación decorativa más. El informe de la tarea lo lista entre lo omitido.
 *
 * Sin `nombre` ni ningún otro dato: es la MISMA marca en cualquier estado del alta, así
 * que no lee el store — ninguna prop, como corresponde a algo que no varía.
 */
export function Marca() {
  return (
    <div className={estilos.marca}>
      <div className={estilos.fila}>
        <div className={estilos.placa}>
          <svg
            className={estilos.simbolo}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M28 26C34 20 44 20 50 26L74 50C80 56 80 66 74 72C68 78 58 78 52 72L28 48C22 42 22 32 28 26Z"
              className={estilos.trazoCian}
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M72 26C66 20 56 20 50 26L26 50C20 56 20 66 26 72C32 78 42 78 48 72L72 48C78 42 78 32 72 26Z"
              className={estilos.trazoCielo}
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="50" cy="49" r="6" className={estilos.puntoNaranja} />
          </svg>
        </div>
        <span className={estilos.textoDeMarca}>
          <span className={estilos.xone}>xone</span>
          <span className={estilos.code}>code</span>
        </span>
      </div>
      {/* El lema del fichero de origen viene en inglés («AI-Powered Development
          Environment for Native & Cloud Applications»); se traduce aquí porque es la
          única frase en inglés de toda la pantalla — el informe de la tarea lo deja
          como una decisión reversible, no una que el usuario ya haya tomado. */}
      <p className={estilos.eslogan}>
        Entorno de desarrollo con IA para aplicaciones nativas y en la nube
      </p>
    </div>
  );
}
