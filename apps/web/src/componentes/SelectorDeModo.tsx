import { useRef } from "react";
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
 * - **La guarda de «no mandar lo que ya está puesto» mira lo último PEDIDO, no lo último
 *   confirmado.** REPRODUCIDO en el navegador: `actual` llega del servidor por el `alta`, así
 *   que entre el clic y la vuelta la pastilla sigue diciendo lo de antes — y pulsar lo de
 *   antes se leía como «pulsar la que ya está puesta», o sea que **una segunda pulsación
 *   rápida se perdía en silencio**: pulsabas «Autónomo», cambiabas de idea, pulsabas
 *   «Supervisado» y te quedabas en autónomo. Con un turno en vuelo la vuelta tarda lo que
 *   tarde el turno, que es justo cuando más se cambia de opinión. Una intención perdida es
 *   peor que la línea de más que la guarda evita.
 * - **Pero lo que se PINTA sigue siendo lo confirmado.** Pintar lo pedido afirmaría que el
 *   modo ya rige, y no rige: el `/aprobacion` está en la cola del lazo y con un turno en
 *   vuelo no se ejecuta hasta que termine. Ese modo decide si los ficheros se escriben sin
 *   enseñar el diff, así que adelantarlo en pantalla es la clase de mentira que este harness
 *   no se permite. El precio, dicho: durante un turno la pastilla no refleja lo que pediste.
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
  /**
   * Lo último que se pidió, y DESDE qué estado confirmado se pidió.
   *
   * Guardar el `desde` es lo que hace que el pedido CADUQUE solo, sin un efecto: vale
   * mientras `actual` no se mueva, y en cuanto el servidor dice algo —lo pedido o cualquier
   * otra cosa— manda lo confirmado. Un pedido pegado para siempre dejaría el control muerto
   * para ese valor el día que una petición se perdiera.
   *
   * **`useRef` y no `useState`, y eso lo decidió una medida.** Con estado, dos pulsaciones
   * dentro del MISMO tick comparten el closure del render anterior: el segundo manejador
   * leía el pedido viejo y volvía a descartar la pulsación — reproducido en el navegador
   * exactamente igual que el defecto que esto viene a arreglar, y verde en los tests, porque
   * `fireEvent` fuerza el repintado entre dos clics y un navegador no. Aquí no hace falta
   * render: esto no se PINTA, solo decide si se manda.
   */
  const pedido = useRef<{ modo: ModoDeEscritura; desde: ModoDeEscritura }>(undefined);

  if (actual === undefined) return null;
  const confirmado = actual;

  /**
   * Contra qué se decide si MANDAR. Lo que se pinta sigue siendo `actual`.
   *
   * Se calcula DENTRO del manejador y no en el render, y eso es la otra mitad de usar una
   * ref: calculado arriba quedaría capturado en el closure de este render, y dos pulsaciones
   * del mismo tick volverían a compartir el valor viejo — que es exactamente el defecto.
   */
  const vigente = (): ModoDeEscritura =>
    pedido.current !== undefined && pedido.current.desde === confirmado
      ? pedido.current.modo
      : confirmado;

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
            // Volver a pulsar lo que ya se pidió no manda nada: sería un mensaje por el
            // cable, un `/aprobacion` encolado y una línea en el transcript para dejar todo
            // como estaba. Contra `vigente` y no contra `actual`, que es lo que arregla la
            // pulsación perdida — ver el comentario del componente.
            if (modo === vigente()) return;
            pedido.current = { modo, desde: confirmado };
            alElegir(modo);
          }}
        >
          <Icono />
          <span>{etiqueta}</span>
        </button>
      ))}
    </div>
  );
}
