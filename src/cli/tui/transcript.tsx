/**
 * El viewport del transcript: una ventana de actos con scroll PROPIO (PgUp/PgDn).
 *
 * La TUI es dueña del terminal, así que el scrollback del terminal ya no sirve: el
 * scroll es este componente. La ventana vive al fondo —donde pasa lo que importa— y
 * PgUp la sube; cualquier acto nuevo devuelve la ventana al fondo, porque leer lo
 * nuevo importa más que conservar la posición de lectura.
 *
 * Los cálculos de ventana y de desfase viven en funciones PURAS exportadas
 * (`ventanaDe`, `moverDesfase`): el scroll es lógica con reglas (acotada, sin actos
 * inventados) y así se prueba sin montar Ink ni emular teclado.
 */
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { crearStore, type Acto, type EstadoDeTui } from "./store.js";
import { segmentosDe } from "../markdown.js";
import { temaInk } from "./temaInk.js";
import { barra } from "./barra.js";

type Store = ReturnType<typeof crearStore>;

/** Cuántos actos salta una pulsación: una página de lectura, no un acto. */
const PASO_DE_PAGINA = 10;

/**
 * Los actos visibles: los ÚLTIMOS `altura`, subidos `desfase` hacia arriba.
 *
 * Pura y total: un desfase mayor que el contenido da una ventana VACÍA antes que
 * repetir o inventar actos; el acotado lo hace `moverDesfase`.
 */
export function ventanaDe<T extends Acto>(actos: readonly T[], altura: number, desfase: number): T[] {
  const fin = Math.max(0, actos.length - desfase);
  const inicio = Math.max(0, fin - altura);
  return actos.slice(inicio, fin);
}

/** El desfase tras moverse `delta` actos, acotado a [0, total]: no salirse del transcript. */
export function moverDesfase(desfase: number, total: number, delta: number): number {
  return Math.min(Math.max(0, desfase + delta), total);
}

/** Una línea de markdown a nodos de Ink: cabecera, viñeta y segmentos inline. */
function LineaMarkdown({ texto }: { texto: string }): ReactNode {
  const cabecera = /^(#{1,3})\s+(.*)$/.exec(texto);
  if (cabecera) {
    return (
      <Text bold color={temaInk.negrita}>
        {cabecera[2]}
      </Text>
    );
  }
  const vineta = /^[-*]\s+(.*)$/.exec(texto);
  const cuerpo = vineta !== null ? vineta[1]! : texto;
  return (
    <Text>
      {vineta !== null ? <Text color={temaInk.acento}>{"• "}</Text> : null}
      {segmentosDe(cuerpo).map((seg, i) => (
        <Text
          key={i}
          bold={seg.estilo === "negrita"}
          color={seg.estilo === "negrita" ? temaInk.negrita : seg.estilo === "mudo" ? temaInk.mudo : undefined}
        >
          {seg.texto}
        </Text>
      ))}
    </Text>
  );
}

/** Un acto del store, pintado por su tipo: cada uno con su icono y su color semántico. */
function ActoVista({ acto }: { acto: Acto }): ReactNode {
  switch (acto.tipo) {
    case "usuario":
      // Un bloque con barra navy, UNA fila: la forma que comparte con la Entrada.
      return (
        <Box {...barra(temaInk.marca)}>
          <Text>{acto.texto}</Text>
        </Box>
      );
    case "asistente":
      return <LineaMarkdown texto={acto.texto} />;
    case "fase":
      return (
        <Text color={temaInk.fase}>
          {`+ ${acto.texto}: ${(acto.ms / 1000).toFixed(1)}s`}
        </Text>
      );
    case "fin":
      // «■ modelo · 1.8s»: el cuadrado en acento, el modelo en texto, la duración en mudo.
      return (
        <Text>
          <Text color={temaInk.acento}>{"■ "}</Text>
          {acto.modelo !== undefined ? (
            <>
              <Text>{acto.modelo}</Text>
              <Text color={temaInk.mudo}>{" · "}</Text>
            </>
          ) : null}
          <Text color={temaInk.mudo}>{`${(acto.ms / 1000).toFixed(1)}s`}</Text>
        </Text>
      );
    case "error":
      return <Text color={temaInk.grave}>{acto.texto}</Text>;
    default:
      // tool y sistema: mudo e indentados — son el paisaje, no la conversación.
      return <Text color={temaInk.mudo}>{`  ${acto.texto}`}</Text>;
  }
}

export function Transcript({ store, altura }: { store: Store; altura: number }): ReactNode {
  const [estado, setEstado] = useState<EstadoDeTui>(store.estado());
  const [desfase, setDesfase] = useState(0); // 0 = al fondo; N = N actos hacia arriba

  useEffect(() => {
    // `suscribir` devuelve la baja: el cleanup la usa — suscribir sin desuscribir
    // era un suscriptor filtrado por cada montaje del componente.
    const baja = store.suscribir(() => setEstado({ ...store.estado() }));
    return baja;
  }, [store]);

  // Cualquier acto nuevo ancla la ventana al fondo, haya scroll o no.
  useEffect(() => setDesfase(0), [estado.actos.length]);

  useInput((_entrada, tecla) => {
    if (tecla.pageUp) setDesfase((d) => moverDesfase(d, estado.actos.length, PASO_DE_PAGINA));
    if (tecla.pageDown) setDesfase((d) => moverDesfase(d, estado.actos.length, -PASO_DE_PAGINA));
  });

  const visibles = ventanaDe(estado.actos, altura, desfase);
  return (
    // La ÚNICA pieza elástica de la columna: la fila de columnas tiene altura fija
    // (`rows - 1`, la reserva del borrado total de Ink) y Entrada, Pregunta y pie no
    // encogen, así que lo que sobra —o lo que falta— lo pone y lo paga el transcript.
    // `overflow="hidden"` + `justifyContent="flex-end"`: con pocos actos la Entrada
    // queda anclada abajo (la maqueta) y, cuando el contenido no cabe (una línea que
    // envuelve, el colchón vivo), se recorta por ARRIBA — lo más nuevo, que es lo que
    // hay que leer, se queda. `altura` ya no es la altura de la caja (la pone el flex):
    // es el tamaño de la rebanada que pide `ventanaDe`.
    <Box flexDirection="column" flexGrow={1} flexBasis={0} overflow="hidden" justifyContent="flex-end">
      {/* Cada fila en un Box que NO encoge. Sin esto, cuando el contenido no cabe Ink
          reparte el recorte entre todos los hijos (que encogen por omisión) y los
          redondea sobre las mismas filas: MEDIDO, un transcript de 10 actos en 5 filas
          pintaba «c1 c3 c5 c7 c9» — se perdían actos del MEDIO, y con ellos el colchón
          vivo del final. Con `flexShrink 0` el recorte es limpio y por arriba: se pierde
          lo viejo, que es lo que se puede perder. */}
      {visibles.map((acto, i) => (
        <Box key={`${i}-${acto.tipo}`} flexShrink={0} flexDirection="column">
          <ActoVista acto={acto} />
        </Box>
      ))}
      {/* El colchón solo es «en curso» si se ve el fondo: subido a leer, no estorba. */}
      {desfase === 0 && estado.colchon !== "" ? (
        <Box flexShrink={0} flexDirection="column">
          <LineaMarkdown texto={estado.colchon} />
        </Box>
      ) : null}
      {/* El separador elástico: con pocos actos se estira y los empuja ARRIBA (la
          conversación nace arriba, como en OpenCode, y la Entrada se queda abajo con el
          hueco en medio); cuando el contenido no cabe mide cero y el `flex-end` de la caja
          sigue recortando por arriba. Un solo Box, sin medir nada. */}
      <Box flexGrow={1} />
    </Box>
  );
}
