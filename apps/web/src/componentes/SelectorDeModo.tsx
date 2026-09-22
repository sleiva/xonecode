import type { ModoDeEscritura } from "../tipos.js";
import { IconoDeEscudo, IconoDeRayo } from "./IconosDelCompositor.js";
import estilos from "./SelectorDeModo.module.css";

/**
 * Quién aprueba las escrituras de esta sesión: un control SEGMENTADO con las dos mitades a
 * la vista.
 *
 * Nació como pastilla con menú, igual que el modelo y el dispositivo, y pasó a segmentado
 * con la maqueta de Stitch delante. La diferencia no es de gusto: **con dos valores y
 * ninguno oculto, el estado se lee sin abrir nada**, y aquí el estado es «¿lo próximo que
 * escriba se va a aplicar solo?». Un desplegable obliga a abrirlo para saberlo, y es la
 * pregunta que más caro sale contestar mal.
 *
 * Tiene HOJA PROPIA y no la de `PastillaDeModelo`, que sí comparten las otras tres: aquella
 * es la de una pastilla con menú, y esto ya no lo es. Compartirla habría dejado las dos
 * formas atadas, que es justo lo que esa hoja evita entre las pastillas de verdad.
 *
 * Cuatro reglas, y ninguna es de forma:
 *
 * - **Sin modo no se pinta.** Ausente significa que no hay sesión abierta, no
 *   «supervisado»: un control sin dato detrás no se pinta, y aquí pintarlo diciendo
 *   «supervisado» afirmaría algo de una sesión que no existe.
 * - **Cada mitad DICE lo que hace, en su `title`.** La maqueta lo ponía en un tooltip de
 *   hover, que no alcanzan ni el teclado ni el táctil — y esto es la palanca que decide si
 *   los ficheros se escriben sin enseñar el diff. El `title` lo lee el hover Y el lector de
 *   pantalla; lo que el modo NO concede (subir sigue preguntando) lo cuenta la nota
 *   permanente del chat en cuanto está encendido.
 * - **`aria-pressed` y no `aria-current`**: son dos botones de un conmutador, no dos
 *   destinos de una navegación. Sin él, quien escucha la página oiría dos botones idénticos
 *   sin saber cuál está puesto — el color no le llega.
 * - **La etiqueta lleva la tilde y el valor no.** Lo que viaja y se compara es `autonomo` a
 *   secas (`core/modoDeEscritura.ts`); meter la tilde en el dato habría sido un segundo
 *   vocabulario para lo mismo.
 */
export function SelectorDeModo({
  actual,
  conectado = true,
  alElegir,
}: {
  /** El modo de la sesión abierta. Ausente = no hay sesión, y entonces no se pinta. */
  actual?: ModoDeEscritura;
  conectado?: boolean;
  alElegir: (modo: ModoDeEscritura) => void;
}) {
  if (actual === undefined) return null;

  const MITADES: readonly {
    modo: ModoDeEscritura;
    etiqueta: string;
    que: string;
    icono: () => JSX.Element;
  }[] = [
    {
      modo: "supervisado",
      etiqueta: "Supervisado",
      que: "Cada escritura para y te enseña su diff antes de aplicarse",
      icono: IconoDeEscudo,
    },
    {
      modo: "autonomo",
      etiqueta: "Autónomo",
      que: "Las escrituras se aplican solas; cada turno dirá qué ficheros tocó. Subir a CloudStudio sigue pidiéndote permiso",
      icono: IconoDeRayo,
    },
  ];

  return (
    <div className={estilos.pista} role="group" aria-label="modo de escritura">
      {MITADES.map(({ modo, etiqueta, que, icono: Icono }) => (
        <button
          key={modo}
          type="button"
          className={estilos.mitad}
          // Puesto SIEMPRE, también en la que no lo está: `aria-pressed="false"` es lo que
          // convierte los dos botones en un conmutador. Omitirlo en una los dejaría como
          // dos acciones sueltas de las que no se sabe cuál rige.
          aria-pressed={modo === actual}
          data-puesto={modo === actual ? "" : undefined}
          disabled={!conectado}
          title={que}
          onClick={() => {
            // Volver a pulsar la que ya está puesta no manda nada: sería un mensaje por el
            // cable, un `/aprobacion` encolado y una línea en el transcript para dejar todo
            // como estaba.
            if (modo !== actual) alElegir(modo);
          }}
        >
          <Icono />
          <span>{etiqueta}</span>
        </button>
      ))}
    </div>
  );
}
