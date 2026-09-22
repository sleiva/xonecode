/**
 * Los glifos de los controles del compositor, copiados de la maqueta de Stitch
 * (`stitch_chat_layout_controls_redesign/code.html`).
 *
 * **Copiados y no enlazados**: aquí no se trae nada de un CDN —esta consola escucha en
 * loopback y declara un modo offline de primera clase—, así que los trazados viven en el
 * repositorio como los del juego de marca (`IconoDeEntorno.tsx`).
 *
 * **Y de la maqueta se toma la FORMA, nunca el color**: los suyos venían con `text-blue-600`
 * y `text-gray-400` encima. Aquí todos pintan con `currentColor` y el color lo pone el
 * botón que los lleva, que ya sale de los alias por tema y de los tokens de marca. Es la
 * misma regla que vigila `Barra.test.tsx` recorriendo los `.module.css`.
 *
 * Son DECORATIVOS: van con `aria-hidden` y sin `<title>`, porque al lado siempre hay texto
 * que dice lo mismo. Un icono que repite en voz alta lo que el rótulo ya dice es ruido para
 * quien escucha la página, y uno que fuera la ÚNICA etiqueta sería un control sin nombre.
 *
 * **Lo que NO se copió: el rayo del selector de modelo.** En la maqueta el mismo glifo está
 * en la pastilla del modelo y en la mitad «Autónomo» del modo, que son dos cosas que no
 * tienen nada que ver; reusarlo enseñaría a no mirarlo. Se queda donde significa algo —«va
 * solo»— y el modelo se identifica por su nombre, que es lo más largo de la fila y no
 * necesita un dibujo delante.
 */

/** Tamaño en píxeles de todos: caben en la caja de 28 de alto de una pastilla. */
const LADO = 14;

function Trazo({ children, lado = LADO }: { children: React.ReactNode; lado?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={lado}
      height={lado}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** El desplegable de una pastilla. Más pequeño que el resto, como en la maqueta. */
export function IconoDeChevron() {
  return (
    <Trazo lado={12}>
      <path d="M19 9l-7 7-7-7" />
    </Trazo>
  );
}

/** Un teléfono: el dispositivo con el que trabaja la sesión. */
export function IconoDeDispositivo() {
  return (
    <Trazo>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </Trazo>
  );
}

/** Un escudo con su visto: el modo SUPERVISADO, donde cada escritura se mira antes. */
export function IconoDeEscudo() {
  return (
    <Trazo>
      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </Trazo>
  );
}

/** Un rayo: el modo AUTÓNOMO, donde las escrituras se aplican solas. */
export function IconoDeRayo() {
  return (
    <Trazo>
      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
    </Trazo>
  );
}

/** La flecha de enviar. Sustituye al carácter `↑`, que dependía de la fuente del sistema. */
export function IconoDeEnviar() {
  return (
    <Trazo lado={16}>
      <path d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </Trazo>
  );
}
