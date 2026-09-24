/**
 * Los glifos de los artefactos: los mandos del visor (Vista, Fuente, Pantalla completa,
 * Descargar) y el TIPO de cada uno en su tarjeta del chat. Copiados de Lucide 0.575.0 (`eye`,
 * `code`, `maximize`, `download`, `file`, `file-code`, `file-text`, `image`,
 * `layout-dashboard`, `arrow-right`; ISC, ver `THIRD_PARTY_NOTICES.md`).
 *
 * **Copiados y no importados**, como los del compositor (`IconosDelCompositor.tsx`): nada de
 * un CDN, y `lucide-react` solo está en `node_modules` porque lo arrastra otra dependencia —
 * importarlo sería depender de algo que nadie declaró.
 *
 * Pintan con `currentColor` y van `aria-hidden`: aquí SÍ son lo único que se ve, así que el
 * nombre del control lo lleva el botón (`aria-label`) y lo que hace, su `title`.
 */

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

/** Vista: el artefacto tal como se ve. */
export function IconoDeVista() {
  return (
    <Trazo>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </Trazo>
  );
}

/** Fuente: el texto del artefacto. */
export function IconoDeFuente() {
  return (
    <Trazo>
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </Trazo>
  );
}

/** Pantalla completa. */
export function IconoDePantallaCompleta() {
  return (
    <Trazo>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </Trazo>
  );
}

/** Descargar. */
export function IconoDeDescarga() {
  return (
    <Trazo>
      <path d="M12 15V3" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
    </Trazo>
  );
}

/** El contorno de un fichero, que comparten los tres de abajo. */
const HOJA = "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z";
const PICO = "M14 2v5a1 1 0 0 0 1 1h5";

/** Qué DIBUJO lleva la tarjeta de un artefacto. Se decide en `tipoDeArtefacto`. */
export type FormaDeArtefacto = "pagina" | "panel" | "texto" | "imagen" | "fichero";

/** El tipo de un artefacto, en su tarjeta del chat. Más grande que los mandos: es el ancla. */
export function IconoDeArtefacto({ forma }: { forma: FormaDeArtefacto }) {
  const lado = 18;
  switch (forma) {
    case "pagina":
      return (
        <Trazo lado={lado}>
          <path d={HOJA} />
          <path d={PICO} />
          <path d="M10 12.5 8 15l2 2.5" />
          <path d="m14 12.5 2 2.5-2 2.5" />
        </Trazo>
      );
    case "panel":
      return (
        <Trazo lado={lado}>
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </Trazo>
      );
    case "texto":
      return (
        <Trazo lado={lado}>
          <path d={HOJA} />
          <path d={PICO} />
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </Trazo>
      );
    case "imagen":
      return (
        <Trazo lado={lado}>
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </Trazo>
      );
    case "fichero":
      return (
        <Trazo lado={lado}>
          <path d={HOJA} />
          <path d={PICO} />
        </Trazo>
      );
  }
}

/** Abrir: la flecha de la tarjeta. */
export function IconoDeAbrir() {
  return (
    <Trazo>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Trazo>
  );
}
