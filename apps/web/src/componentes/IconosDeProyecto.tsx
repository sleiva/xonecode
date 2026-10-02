/**
 * Los glifos de una fila de proyecto que la librería de deepseek no trae: «compartido» (varias
 * personas) y la chincheta de fijar. Allí solo hay `IconUserOutline16`, que es UNA persona y
 * se leería como «tuyo» — justo lo contrario.
 *
 * El mismo oficio que `IconosDelCompositor.tsx`: trazo de 2 sobre una caja de 24, extremos
 * redondeados, y en el repositorio en vez de un CDN (modo offline de primera clase). Y la
 * misma regla de color: `currentColor` siempre, el tono lo pone quien lo lleva desde los
 * alias del tema.
 *
 * Son DECORATIVOS (`aria-hidden`, sin `<title>`): el nombre accesible lo lleva el control o el
 * `aria-label` del envoltorio, que es donde se decide qué se dice en cada sitio.
 */

/**
 * El MOLDE de todos los glifos de contorno de la consola: lo usan también los iconos de
 * carpeta y fichero del árbol (`IconosDeFichero.tsx`), para que se lean como de la misma
 * familia que los de la barra de proyectos.
 */
export function Trazo({
  children,
  lado,
  relleno,
  className,
  familia,
}: {
  children: React.ReactNode;
  lado: number;
  relleno?: boolean;
  className?: string;
  /** Una etiqueta del dibujo (p. ej. la familia de un fichero), solo como dato del DOM. */
  familia?: string;
}) {
  return (
    <svg
      {...(className === undefined ? {} : { className })}
      {...(familia === undefined ? {} : { "data-familia": familia })}
      aria-hidden="true"
      focusable="false"
      width={lado}
      height={lado}
      viewBox="0 0 24 24"
      fill={relleno === true ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Dos personas: el proyecto es de otra persona y te lo compartió. */
export function IconoCompartido({ size = 14 }: { size?: number }) {
  return (
    <Trazo lado={size}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Trazo>
  );
}

/**
 * La chincheta. Hueca = sin fijar, RELLENA = fijado: la forma cambia además del color, que es
 * lo que lo dice a quien no distingue los tonos (el `aria-pressed` del botón se lo dice a un
 * lector de pantalla).
 */
export function IconoChincheta({ fijado, size = 14 }: { fijado: boolean; size?: number }) {
  return (
    <Trazo lado={size} relleno={fijado}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </Trazo>
  );
}
