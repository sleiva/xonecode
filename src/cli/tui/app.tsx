/**
 * La raíz Ink: dos columnas (transcript+entrada | sidebar), entrada abajo, barra al pie
 * y el modal de aprobación por encima de todo cuando toca decidir. Solo pinta y reparte
 * el teclado: la semántica vive en el store y en `correrTui.ts`.
 */
import { Box, Text, useInput, useStdout } from "ink";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { crearStore, type Ranura, type VistaDeTui } from "./store.js";
import { Transcript } from "./transcript.js";
import { Entrada } from "./entrada.js";
import { BarraDeEstado, Sidebar, type DatosDeSidebar } from "./sidebar.js";
import { ModalAprobacion } from "./aprobarTui.js";
import { barra } from "./barra.js";
import { temaInk } from "./temaInk.js";

type Store = ReturnType<typeof crearStore>;

/**
 * Sincroniza un trozo de estado observable con React: el store manda y la app repinta.
 * Igual que `Transcript` hace con su propio `useState`, pero reutilizable para la
 * ranura de la vista (ocupado/pregunta/modal).
 */
function useSincronizado<T extends object>(obtener: () => T, suscribir: (f: () => void) => void): T {
  const [valor, setValor] = useState<T>(obtener);
  useEffect(() => {
    suscribir(() => setValor({ ...obtener() }));
  }, [obtener, suscribir]);
  return valor;
}

/**
 * La pregunta de la consola (asistente de creación, clave de /provider): un input
 * propio, en lugar de la Entrada, porque mientras vive ES lo único que el teclado
 * puede contestar. Con `oculto` muestra asteriscos: el valor real viaja en el estado,
 * nunca en pantalla.
 */
function PreguntaInk({
  pregunta,
  alResponder,
}: {
  pregunta: { texto: string; oculto: boolean };
  alResponder: (respuesta: string) => void;
}): ReactNode {
  const [valor, setValor] = useState("");
  useInput((entrada, tecla) => {
    if (tecla.return) {
      alResponder(valor);
      return;
    }
    if (tecla.backspace || tecla.delete) {
      setValor((v) => v.slice(0, -1));
      return;
    }
    if (entrada && !tecla.ctrl && !tecla.meta && !tecla.escape) setValor((v) => v + entrada);
  });
  return (
    <Box {...barra(temaInk.aviso)}>
      <Text>
        {pregunta.texto}
        {pregunta.oculto ? "*".repeat(valor.length) : valor}
        <Text color={temaInk.prompt}>{"▏"}</Text>
      </Text>
    </Box>
  );
}

/**
 * Las filas que NO son transcript: las 2 de la Entrada (línea en edición + modelo; la
 * barra izquierda no añade filas) y 1 del pie. Si la Entrada cambia de forma, este
 * número cambia con ella. La pista de Tab añade una fila transitoria que se acepta:
 * ese frame toca el borrado total de Ink (ver FILA_DE_RESERVA) y vuelve al soltar.
 */
const FILAS_FIJAS = 3;

/**
 * Una fila que la TUI NUNCA ocupa. Ink (`build/ink.js`, `outputHeight >= stdout.rows`)
 * borra el terminal entero y repinta el frame completo cuando la salida llega a las
 * filas de la pantalla; con la fila de columnas a `rows` y el transcript con
 * `minHeight`, TODOS los frames caerían ahí — un borrado por token y por tecla. Con la
 * reserva, el frame normal es `rows - 1` y el repintado es incremental. El modal de
 * aprobación (montado debajo de la fila) sí supera `rows` mientras está abierto: es el
 * comportamiento previo y está anotado en la spec como riesgo asumido.
 */
const FILA_DE_RESERVA = 1;

export function App({
  store,
  vista: ranuraVista,
  alEnviar,
  responder,
  completa,
  historial,
  datosSidebar,
  alCancelarTurno,
}: {
  store: Store;
  vista: Ranura<VistaDeTui>;
  alEnviar: (linea: string) => void;
  /** La respuesta a la pregunta viva (la ranura la enruta a quien preguntó). */
  responder: (linea: string) => void;
  completa: (linea: string) => [string[], string];
  /** Contrato de Entrada: la MÁS RECIENTE en el índice 0. */
  historial: readonly string[];
  /** Se lee en CADA render: los tokens y el modelo cambian mientras corre el turno. */
  datosSidebar: () => DatosDeSidebar;
  alCancelarTurno: () => void;
}): ReactNode {
  const vista = useSincronizado(ranuraVista.ver, ranuraVista.suscribir);
  const datos = datosSidebar();
  const { stdout } = useStdout();
  const filas = (stdout.rows ?? 24) - FILA_DE_RESERVA;
  const alturaTranscript = Math.max(5, filas - FILAS_FIJAS);

  // El transcript se repinta por su cuenta (Transcript está suscrito al store); la app
  // necesita re-render por los DATOS (sidebar, modelo), no por los actos. `suscribir`
  // devuelve la baja: el cleanup del useEffect la usa al desmontar.
  const [, repintar] = useState(0);
  useEffect(() => store.suscribir(() => repintar((n) => n + 1)), [store]);

  useInput((entrada, tecla) => {
    if (!(tecla.ctrl && entrada === "c")) return;
    // Con modal montado, el modal ya recibe el Ctrl-C y RECHAZA (fail-closed): aquí no
    // se toca nada, o habría dos lectores para la misma tecla.
    if (vista.modal !== null) return;
    if (vista.ocupado) {
      alCancelarTurno();
    } else {
      // El mínimo honesto: Ctrl-C inactivo no mata la app (un dedo torpe no debe
      // cerrar una sesión con hilo vivo) — el aviso, y /salir sigue siendo la salida.
      store.linea("· Ctrl-C no cierra la consola: usa /salir", "sistema");
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" height={filas}>
        <Box flexDirection="column" flexGrow={1} paddingRight={1}>
          <Transcript store={store} altura={alturaTranscript} />
          {vista.pregunta !== null ? (
            <PreguntaInk pregunta={vista.pregunta} alResponder={responder} />
          ) : (
            <Entrada
              alEnviar={alEnviar}
              completa={completa}
              ocupado={vista.ocupado}
              historial={historial}
              modelo={datos.modelo}
            />
          )}
          <BarraDeEstado ruta={datos.ruta} contexto={datos.contexto} tope={datos.tope} />
        </Box>
        <Box width={30} paddingLeft={1} flexDirection="column">
          <Sidebar {...datos} columnas={stdout.columns ?? 80} />
        </Box>
      </Box>
      {vista.modal !== null ? <ModalAprobacion {...vista.modal} /> : null}
    </Box>
  );
}
