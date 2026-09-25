/**
 * El icono de un conector MCP: la marca del servicio si la hay, y si no un monograma propio.
 *
 * Las marcas del catálogo salen del catálogo de TrueForge
 * (`packages/trueforge/catalog/mcp-catalog.yaml`), donde viven como URL REMOTA de su servidor
 * de assets. Se copian aquí —el fichero, o su trazado— por la misma razón que los logos de
 * `IconoDeProveedor`: esta consola se sirve desde loopback con un modo `offline` de primera
 * clase, y un `<img>` a `assets.production.truefoundry.com` la dejaría sin logos justo en el
 * caso que el producto declara soportar.
 *
 * **Dos carriles, y no es una inconsistencia sino el material de cada marca:**
 *
 * - **`jira` y `deepwiki` se sirven como FICHERO** (`apps/web/public/iconos/conectores/`): su
 *   marca ES el color —el azul de Jira, el teal y el azul de DeepWiki— y no hay monocromo de
 *   dónde copiarla. Sobre fondo transparente, y con el nombre en texto al lado, se leen igual
 *   en claro y en oscuro.
 * - **`notion` es un TRAZADO con `currentColor`**, como los de `IconoDeProveedor`: su marca es
 *   monocroma, y el fichero de TrueForge la trae con `fill="black"` a fuego, que dentro de un
 *   `<img>` es un cuadrado negro invisible en el tema de noche. Se copia su `d` tal cual —sin
 *   redibujar nada— y el color lo pone la fila.
 * - **Sin marca en ninguno de los dos carriles, el MONOGRAMA** —la primera letra del nombre, en
 *   un círculo—: el catálogo es una TABLA que crece (`core/conectores.ts#CATALOGO_DE_CONECTORES`)
 *   y un servidor MCP nuevo no puede esperar a que alguien le dibuje un logo aquí. Es también lo
 *   que llevará un conector añadido a mano, que no tiene marca que copiar.
 *
 * La clave de los dos carriles es el **`id`**, nunca el nombre: el nombre se escribe con
 * mayúsculas, acentos y espacios, y un logo atado a él se rompería al retocarlo. Si un día
 * cambia el id de una fila del catálogo, su marca no llega y cae en el monograma: se degrada a
 * un icono correcto, y los tres ids están nombrados en `IconoDeConector.test.tsx` para que
 * perder uno sea un rojo y no un cambio mudo.
 *
 * El `<img>` no lleva `aria-hidden` porque su forma es `alt=""`, que es lo que un `<img>` tiene
 * para eso —el nombre del conector ya está en la fila como texto—; el `<svg>` sí, y ninguno de
 * los dos lleva `<title>`, que lo haría anunciarse dos veces.
 */

/** El fichero empaquetado de los conectores cuya marca es el color. */
const FICHEROS: Record<string, string> = {
  deepwiki: "/iconos/conectores/deepwiki.png",
  jira: "/iconos/conectores/jira.png",
};

/** El trazado literal de los conectores cuya marca es monocroma (ver la cabecera). */
const TRAZADOS: Record<string, string> = {
  notion: "M3.90973 3.74062C4.41327 4.14967 4.60227 4.11862 5.54862 4.05517L14.4687 3.51989C14.6577 3.51989 14.5005 3.33089 14.4377 3.29984L12.9554 2.22862C12.6719 2.00857 12.2932 1.75612 11.5683 1.8189L2.93165 2.44934C2.6171 2.48039 2.55365 2.63834 2.6792 2.76389L3.90973 3.74062ZM4.445 5.81961V15.2048C4.445 15.709 4.69677 15.898 5.26445 15.8663L15.0675 15.2993C15.6351 15.2682 15.6986 14.9213 15.6986 14.5116V5.18916C15.6986 4.78012 15.5413 4.55939 15.1937 4.59044L4.94922 5.18916C4.57122 5.22089 4.445 5.41056 4.445 5.81961ZM14.1225 6.32249C14.1852 6.60599 14.1225 6.88949 13.839 6.92189L13.3665 7.01639V13.9446C12.9561 14.1653 12.5781 14.2915 12.2628 14.2915C11.7579 14.2915 11.6317 14.1336 11.2537 13.6617L8.16424 8.81121V13.5038L9.14164 13.7252C9.14164 13.7252 9.14164 14.2922 8.35324 14.2922L6.1784 14.4177C6.11562 14.2922 6.1784 13.977 6.39912 13.9142L6.96612 13.7569V7.55166L6.17975 7.48821C6.1163 7.20471 6.27424 6.79566 6.71502 6.76394L9.04781 6.60666L12.2635 11.52V7.17299L11.4434 7.07916C11.3806 6.73221 11.6324 6.48044 11.9476 6.44939L14.1225 6.32249ZM2.2067 1.59885L11.1909 0.937348C12.2939 0.842848 12.5781 0.905623 13.2713 1.40985L16.1393 3.42539C16.6118 3.77167 16.7698 3.86617 16.7698 4.24417V15.2993C16.7698 15.9918 16.518 16.4022 15.6358 16.4643L5.20167 17.0948C4.54017 17.1265 4.22427 17.032 3.87732 16.5906L1.76525 13.8501C1.38726 13.3458 1.22998 12.9685 1.22998 12.5271V2.70044C1.22998 2.13412 1.48243 1.66095 2.2067 1.59885Z",
};

export function IconoDeConector({
  id,
  nombre,
  size = 20,
  className,
}: {
  /** El id del conector: es lo que ata la marca, no el nombre. */
  id: string;
  /** El nombre del conector: de aquí sale el monograma. */
  nombre: string;
  size?: number;
  className?: string;
}) {
  const fichero = FICHEROS[id];
  if (fichero !== undefined) {
    return <img className={className} src={fichero} alt="" width={size} height={size} />;
  }

  const trazado = TRAZADOS[id];
  // El monograma no es un hueco: es la respuesta honesta para un conector sin marca.
  const letra = nombre.trim().charAt(0).toUpperCase() || "?";
  return (
    <svg
      viewBox={trazado === undefined ? "0 0 20 20" : "0 0 18 18"}
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {trazado === undefined ? (
        <>
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.2" />
          <text
            x="10"
            y="14"
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="currentColor"
          >
            {letra}
          </text>
        </>
      ) : (
        <path d={trazado} fill="currentColor" />
      )}
    </svg>
  );
}
