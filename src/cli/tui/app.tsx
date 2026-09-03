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
import type { EmisorDeRueda } from "./raton.js";

type Store = ReturnType<typeof crearStore>;

/**
 * Sincroniza un trozo de estado observable con React: el store manda y la app repinta.
 * Igual que `Transcript` hace con su propio `useState`, pero reutilizable para la
 * ranura de la vista (ocupado/pregunta/modal).
 */
function useSincronizado<T extends object>(
  obtener: () => T,
  suscribir: (f: () => void) => () => void
): T {
  const [valor, setValor] = useState<T>(obtener);
  useEffect(() => {
    const sincronizar = (): void => setValor({ ...obtener() });
    const baja = suscribir(sincronizar);
    // `render()` devuelve antes de que React instale este efecto. El asistente de
    // arranque puede abrir un selector exactamente en ese intervalo; sin esta lectura
    // posterior, la ranura ya contiene el selector pero nadie vuelve a pintar la App.
    sincronizar();
    return baja;
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

const FILAS_SELECTOR = 6;

/** Selector pequeño y filtrable: no vuelca el catálogo completo al transcript. */
function SelectorInk({
  selector,
  alResponder,
  ancho,
}: {
  selector: NonNullable<VistaDeTui["selector"]>;
  alResponder: (id: string | undefined) => void;
  ancho: number;
}): ReactNode {
  const [filtro, setFiltro] = useState("");
  const [seleccion, setSeleccion] = useState(0);
  const opciones = selector.opciones.filter((opcion) => {
    const texto = `${opcion.etiqueta} ${opcion.id} ${opcion.detalle ?? ""}`.toLowerCase();
    return texto.includes(filtro.toLowerCase());
  });
  const inicio = Math.max(0, Math.min(seleccion - Math.floor(FILAS_SELECTOR / 2), opciones.length - FILAS_SELECTOR));
  const visibles = opciones.slice(inicio, inicio + FILAS_SELECTOR);

  useEffect(() => setSeleccion(0), [filtro]);
  useInput((entrada, tecla) => {
    if (tecla.escape) return alResponder(undefined);
    if (tecla.return) return alResponder(opciones[seleccion]?.id);
    if (tecla.upArrow && opciones.length > 0) {
      setSeleccion((actual) => (actual - 1 + opciones.length) % opciones.length);
      return;
    }
    if (tecla.downArrow && opciones.length > 0) {
      setSeleccion((actual) => (actual + 1) % opciones.length);
      return;
    }
    if (tecla.backspace || tecla.delete) {
      setFiltro((actual) => actual.slice(0, -1));
      return;
    }
    if (entrada && !tecla.ctrl && !tecla.meta) setFiltro((actual) => actual + entrada);
  });

  const recortar = (texto: string): string => Array.from(texto).slice(0, Math.max(1, ancho - 2)).join("");
  return (
    <Box flexDirection="column" flexShrink={0} {...barra(temaInk.acento)}>
      <Text color={temaInk.negrita}>{recortar(selector.titulo)}</Text>
      <Text color={temaInk.mudo}>{recortar(`filtra · ↑↓ elige · Enter confirma · Esc cancela  ${filtro}▏`)}</Text>
      {Array.from({ length: FILAS_SELECTOR }, (_, indice) => {
        const opcion = visibles[indice];
        if (opcion === undefined) return <Text key={indice}> </Text>;
        const posicion = inicio + indice;
        const activa = posicion === seleccion;
        const detalle = opcion.detalle === undefined ? "" : ` — ${opcion.detalle}`;
        return (
          <Text key={opcion.id} color={activa ? temaInk.fondoCola : temaInk.texto} backgroundColor={activa ? temaInk.fase : undefined}>
            {recortar(`${activa ? "›" : " "} ${opcion.etiqueta}${detalle}`)}
          </Text>
        );
      })}
    </Box>
  );
}

/**
 * Las filas que NO son transcript: las 4 de la Entrada (aire, línea en edición, aire,
 * modelo; la barra izquierda no añade filas) y 1 del pie. Si la Entrada cambia de forma,
 * este número cambia con ella. La pista de Tab añade una fila transitoria, y no pasa nada:
 * la fila de columnas sigue midiendo lo mismo y la pista sale de una fila del
 * transcript, que es la ÚNICA pieza elástica (Entrada, Pregunta y pie no encogen).
 *
 * Con eso, `alturaTranscript` ya NO es la altura de la caja del transcript —esa la pone
 * el flex— sino el tamaño de la rebanada que `ventanaDe` corta del historial: cuántos
 * actos se piden. Si sobran, el transcript los recorta por arriba.
 */
const FILAS_FIJAS = 5;

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
  responderSelector,
  completa,
  historial,
  datosSidebar,
  alCancelarTurno,
  rueda,
}: {
  store: Store;
  vista: Ranura<VistaDeTui>;
  alEnviar: (linea: string) => void;
  /** La respuesta a la pregunta viva (la ranura la enruta a quien preguntó). */
  responder: (linea: string) => void;
  /** La respuesta del selector vivo (Enter entrega id; Escape cancela). */
  responderSelector: (id: string | undefined) => void;
  completa: (linea: string) => [string[], string];
  /** Contrato de Entrada: la MÁS RECIENTE en el índice 0. */
  historial: readonly string[];
  /** Se lee en CADA render: los tokens y el modelo cambian mientras corre el turno. */
  datosSidebar: () => DatosDeSidebar;
  alCancelarTurno: () => void;
  /** Las muescas de la rueda del ratón para el transcript; sin ratón, no hay emisor. */
  rueda?: EmisorDeRueda;
}): ReactNode {
  const vista = useSincronizado(ranuraVista.ver, ranuraVista.suscribir);
  const datos = datosSidebar();
  const { stdout } = useStdout();
  const filas = (stdout.rows ?? 24) - FILA_DE_RESERVA;
  const alturaTranscript = Math.max(
    5,
    filas - FILAS_FIJAS - (vista.enCola.length > 0 ? 1 : 0) - (vista.selector === null ? 0 : FILAS_SELECTOR + 2 - 4)
  );
  const columnas = stdout.columns ?? 80;
  const conSidebar = cabeSidebar(columnas);
  // Lo que la Entrada rellena de fondo: la columna izquierda (total menos sidebar, su
  // borde izquierdo y el paddingRight de 1) menos la barra `▌`. El borde cuenta como
  // una columna real de Ink; si no se descuenta, las filas de fondo de la Entrada
  // invaden una celda y sus bandas dejan de formar un rectángulo.
  const anchoEntrada = columnas - (conSidebar ? ANCHO_DE_SIDEBAR + 1 : 0) - 1 - 1;

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
          <Transcript store={store} altura={alturaTranscript} rueda={rueda} ancho={anchoEntrada} />
          {vista.selector !== null ? (
            <SelectorInk selector={vista.selector} alResponder={responderSelector} ancho={anchoEntrada} />
          ) : vista.pregunta !== null ? (
            <PreguntaInk pregunta={vista.pregunta} alResponder={responder} />
          ) : (
            <Entrada
              alEnviar={alEnviar}
              completa={completa}
              ocupado={vista.ocupado}
              pendientes={vista.enCola}
              historial={historial}
              modelo={datos.modelo}
              ancho={anchoEntrada}
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
            borderLeft
            borderLeftColor={temaInk.acento}
          >
            <Sidebar {...datos} altura={Math.max(0, filas - 1)} />
          </Box>
        ) : null}
      </Box>
      {vista.modal !== null ? <ModalAprobacion {...vista.modal} /> : null}
    </Box>
  );
}
