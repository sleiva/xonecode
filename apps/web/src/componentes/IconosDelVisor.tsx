/**
 * Los glifos de los mandos del visor de artefactos (Vista, Fuente, Pantalla completa,
 * Descargar), copiados de Lucide 0.575.0 (`eye`, `code`, `maximize`, `download`; ISC, ver
 * `THIRD_PARTY_NOTICES.md`).
 *
 * **Copiados y no importados**, como los del compositor (`IconosDelCompositor.tsx`): nada de
 * un CDN, y `lucide-react` solo está en `node_modules` porque lo arrastra otra dependencia —
 * importarlo sería depender de algo que nadie declaró.
 *
 * Pintan con `currentColor` y van `aria-hidden`: aquí SÍ son lo único que se ve, así que el
 * nombre del control lo lleva el botón (`aria-label`) y lo que hace, su `title`.
 */

const LADO = 14;

function Trazo({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={LADO}
      height={LADO}
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
