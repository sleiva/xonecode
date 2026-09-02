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
import { ANCHO_DE_SIDEBAR, BarraDeEstado, Sidebar, cabeSidebar, type DatosDeSidebar } from "./sidebar.js";
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
    // `flexShrink={0}`: mientras vive, la pregunta ES lo único contestable — la fila de
    // columnas tiene altura fija y quien cede es el transcript, nunca ella.
    <Box flexShrink={0} {...barra(temaInk.aviso)}>
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
 * número cambia con ella. La pista de Tab añade una fila transitoria, y no pasa nada:
 * la fila de columnas sigue midiendo lo mismo y la pista sale de una fila del
 * transcript, que es la ÚNICA pieza elástica (Entrada, Pregunta y pie no encogen).
 *
 * Con eso, `alturaTranscript` ya NO es la altura de la caja del transcript —esa la pone
 * el flex— sino el tamaño de la rebanada que `ventanaDe` corta del historial: cuántos
 * actos se piden. Si sobran, el transcript los recorta por arriba.
 */
const FILAS_FIJAS = 3;

/**
 * Una fila que la TUI NUNCA ocupa. Ink (`build/ink.js`, `outputHeight >= stdout.rows`)
 * borra el terminal entero y repinta el frame completo cuando la salida llega a las
 * filas de la pantalla; y la fila de columnas mide SIEMPRE lo que se le dice, así que
 * con `height = rows` TODOS los frames caerían ahí — un borrado por token y por tecla.
 * Con la reserva, el frame normal es `rows - 1` y el repintado es incremental. El modal de
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
  const columnas = stdout.columns ?? 80;
  const conSidebar = cabeSidebar(columnas);

  // Ink escucha el `resize` del terminal, pero su manejador (`ink.js`, `resized`) solo
  // recalcula Yoga y repinta el árbol YA montado: no re-renderiza React. Sin esto,
  // `stdout.columns` no se volvería a leer y la sidebar no aparecería ni se iría al
  // cambiar la anchura hasta el siguiente acto del transcript. `app.test.tsx` lo prueba.
  const [, alRedimensionar] = useState(0);
  useEffect(() => {
    const f = (): void => alRedimensionar((n) => n + 1);
    stdout.on("resize", f);
    return () => {
      stdout.off("resize", f);
    };
  }, [stdout]);

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
        {/* `flexBasis={0}`: la columna crece desde cero por flex, así que un prompt
            largo no infla su base y no le roba anchura a la sidebar (el logotipo, de
            anchura fija, se envolvería en garabatos). */}
        <Box flexDirection="column" flexGrow={1} flexBasis={0} paddingRight={1}>
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
          {/* Sin sidebar, la rama no está en ninguna otra parte: va al pie. */}
          <BarraDeEstado
            ruta={datos.ruta}
            rama={conSidebar ? undefined : datos.rama}
            contexto={datos.contexto}
            tope={datos.tope}
          />
        </Box>
        {/* La regla de OpenCode: la sidebar mide 42 fijas (2 de padding por lado, como
            allí) y solo se monta con MÁS de 120 columnas; por debajo, el transcript se
            queda con todo el ancho. `flexShrink={0}`: no negocia — el logotipo y las
            cifras están dibujados para esa anchura. */}
        {conSidebar ? (
          <Box
            width={ANCHO_DE_SIDEBAR}
            flexShrink={0}
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            flexDirection="column"
          >
            <Sidebar {...datos} />
          </Box>
        ) : null}
      </Box>
      {vista.modal !== null ? <ModalAprobacion {...vista.modal} /> : null}
    </Box>
  );
}
