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
import {
  segmentosDe,
  clasificarLinea,
  estadosDeCerco,
  contextoDeTabla,
  type EstiloDeSegmento,
  type LineaDeTabla,
} from "../markdown.js";
import { temaInk } from "./temaInk.js";
import { barra } from "./barra.js";
import { filasDe } from "./filas.js";
import { Fila } from "./tarjeta.js";
import type { EmisorDeRueda } from "./raton.js";

type Store = ReturnType<typeof crearStore>;

/** Cuántos actos salta una pulsación: una página de lectura, no un acto. */
const PASO_DE_PAGINA = 10;

/** Cuántos actos mueve una muesca de la rueda del ratón: menos que una página, más que uno. */
export const PASO_DE_RUEDA = 3;

/** Cuántas líneas de un grupo de herramientas se enseñan: las últimas. Medido con el usuario: 4. */
export const LINEAS_DE_HERRAMIENTAS = 4;

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

/** El desfase tras moverse `delta` actos, acotado sin vaciar nunca el transcript. */
export function moverDesfase(desfase: number, total: number, delta: number): number {
  return Math.min(Math.max(0, desfase + delta), Math.max(0, total - 1));
}

/** El color de un segmento inline. Pura: los tests no ven color, y esta decisión sí se prueba. */
export function colorDeSegmento(estilo: EstiloDeSegmento): string | undefined {
  if (estilo === "negrita") return temaInk.negrita;
  // Código inline y enlaces comparten acento: lo que responde al modelo es lo azul.
  if (estilo === "codigo" || estilo === "enlace") return temaInk.acento;
  if (estilo === "mudo") return temaInk.mudo;
  return undefined; // normal y cursiva: color del texto, la cursiva es forma, no tinta
}

/** Los segmentos inline de un texto: negrita, código, cursiva y enlaces — significado, no ANSI. */
function Segmentos({ texto }: { texto: string }): ReactNode {
  return (
    <>
      {segmentosDe(texto).map((seg, i) => (
        <Text
          key={i}
          bold={seg.estilo === "negrita"}
          italic={seg.estilo === "cursiva"}
          color={colorDeSegmento(seg.estilo)}
        >
          {seg.texto}
        </Text>
      ))}
    </>
  );
}

/**
 * Una línea de markdown a nodos de Ink. El parseo vive en `clasificarLinea` (puro, en
 * `cli/markdown.ts`); aquí solo se pinta. `enCerco` es el estado de la línea: dentro de
 * un cerco todo sale en mudo, y su marcador de cierre no se pinta (igual que stdio:
 * el cerco es formato, no conversación).
 */
function LineaMarkdown({
  texto,
  enCerco,
  ancho,
  tabla,
}: {
  texto: string;
  enCerco: boolean;
  ancho: number;
  /** Si la línea es de una tabla, el skin pinta GRID y no la línea: ya viene parseada. */
  tabla?: LineaDeTabla;
}): ReactNode {
  // El grid del TextTable de OpenTUI con borderStyle «single»: ┌┬┐ cabecera, ├┼┤
  // separador, └┴┘ cierre; bordes en tenue (su «conceal»), celdas ya rellenas y
  // recortadas por el módulo puro. El aire alrededor vive aquí: la tabla es un bloque.
  if (tabla) {
    const borde = (izq: string, medio: string, der: string): string =>
      izq + tabla.anchos.map((a) => "─".repeat(a + 2)).join(medio) + der;
    if (tabla.rol === "separador") {
      return <Text color={temaInk.tenue}>{borde("├", "┼", "┤")}</Text>;
    }
    // Las celdas parsean INLINE como el resto del texto: «**NO SE USA**» y `código`
    // crudos dentro del grid eran el bug medido en terminal. El borde va tenue como
    // las líneas del grid, y la cabecera lleva la tinta de las cabeceras de texto.
    // Hermanos Text dentro del Box del acto: contenido estático, sin inserciones
    // que desmidan (la trampa de ink 5.2.1).
    const cabecera = tabla.rol === "cabecera";
    // Una fila NO puede depender de los espacios al final de un Text: Ink los recorta
    // al medir y el borde derecho acaba justo tras el contenido, distinto en cada fila.
    // Cada celda es una caja de ancho fijo (texto + dos márgenes), como TextTable de
    // OpenTUI; el separador queda por tanto en la misma columna siempre.
    const fila = (
      <Box flexDirection="row" flexShrink={0}>
        <Text color={temaInk.tenue}>{"│"}</Text>
        {tabla.celdas.flatMap((celda, j) => [
          <Box key={`celda-${j}`} width={(tabla.anchos[j] ?? 0) + 2} paddingLeft={1} paddingRight={1} flexShrink={0}>
            <Text bold={cabecera} color={cabecera ? temaInk.negrita : undefined} wrap="truncate-end">
              <Segmentos texto={celda.trimEnd()} />
            </Text>
          </Box>,
          ...(j === tabla.celdas.length - 1 ? [] : [<Text key={`borde-${j}`} color={temaInk.tenue}>{"│"}</Text>]),
        ])}
        <Text color={temaInk.tenue}>{"│"}</Text>
      </Box>
    );
    if (cabecera) {
      return (
        <>
          <Text>{" "}</Text>
          <Text color={temaInk.tenue}>{borde("┌", "┬", "┐")}</Text>
          {fila}
        </>
      );
    }
    return (
      <>
        {fila}
        {tabla.esUltima ? (
          <>
            <Text color={temaInk.tenue}>{borde("└", "┴", "┘")}</Text>
            <Text>{" "}</Text>
          </>
        ) : null}
      </>
    );
  }

  const clasificada = clasificarLinea(texto);

  if (clasificada.tipo === "cerco") {
    // El estado es ANTES de la línea: marcador + dentro = cierre (no se pinta); marcador
    // + fuera = apertura, que enseña el lenguaje si lo trae.
    if (enCerco) return null;
    return clasificada.lenguaje === "" ? null : <Text color={temaInk.mudo}>{clasificada.lenguaje}</Text>;
  }
  if (enCerco) return <Text color={temaInk.mudo}>{texto}</Text>;

  switch (clasificada.tipo) {
    case "cabecera":
      return (
        <Text bold color={temaInk.negrita}>
          {clasificada.texto}
        </Text>
      );
    case "horizontal":
      return <Text color={temaInk.tenue}>{"─".repeat(Math.max(3, ancho))}</Text>;
    case "cita":
      // Un «>» suelto del modelo no es una cita: sin contenido, sin barra.
      if (clasificada.texto.trim() === "") return null;
      return (
        <Box {...barra(temaInk.tenue)}>
          <Text color={temaInk.mudo}>
            <Segmentos texto={clasificada.texto} />
          </Text>
        </Box>
      );
    case "vineta":
    case "numerada": {
      // El marcador en acento, la sangría por nivel (2 espacios por nivel, lo que
      // emiten los modelos). Hermanos dentro del Text: el contenido de un acto no
      // cambia después de creado, así que no hay inserción que desmida (ink 5.2.1).
      const marcador =
        clasificada.tipo === "vineta" ? "• " : `${clasificada.numero}. `;
      return (
        <Text>
          {"  ".repeat(clasificada.nivel)}
          <Text color={temaInk.acento}>{marcador}</Text>
          <Segmentos texto={clasificada.texto} />
        </Text>
      );
    }
    default:
      return (
        <Text>
          <Segmentos texto={clasificada.texto} />
        </Text>
      );
  }
}

/** Un acto del store, pintado por su tipo: cada uno con su icono y su color semántico. */
function ActoVista({
  acto,
  previo,
  ancho,
  enCerco,
  tabla,
}: {
  acto: Acto;
  previo?: Acto;
  ancho: number;
  enCerco: boolean;
  tabla?: LineaDeTabla;
}): ReactNode {
  switch (acto.tipo) {
    case "usuario":
      // La tarjeta de OpenCode, igual que la Entrada: barra navy (lo que EScribiste se
      // distingue de lo que escribes, que lleva acento), una fila de aire, el texto
      // partido en filas y otra de aire — todo con fondo (Ink 5.2.1: solo `Text` lo
      // lleva). El aire vive DENTRO de la tarjeta, como el `paddingTop/Bottom` suyo.
      return (
        <Box flexDirection="column" flexShrink={0} {...barra(temaInk.marca)} paddingLeft={0}>
          <Fila ancho={ancho} visible={0} />
          {filasDe(acto.texto, Math.max(1, ancho - 2)).map((fila, i) => (
            <Fila key={i} ancho={ancho} visible={Array.from(fila).length}>
              {fila}
            </Fila>
          ))}
          {acto.enCola ? <Text color={temaInk.fase}>{"  EN COLA"}</Text> : null}
          <Fila ancho={ancho} visible={0} />
        </Box>
      );
    case "asistente":
      return <LineaMarkdown texto={acto.texto} enCerco={enCerco} ancho={ancho} tabla={tabla} />;
    case "fase":
      return (
        <Text color={temaInk.fase}>
          {`+ ${acto.texto}: ${(acto.ms / 1000).toFixed(1)}s`}
        </Text>
      );
    case "fin":
      // «■ modelo · 1.8s»: el cuadrado en acento, el modelo en texto, la duración en mudo.
      // El cierre lleva su aire DELANTE (el `marginTop` del «▣» de OpenCode) — salvo
      // cuando viene del grupo de herramientas, que ya deja el suyo detrás: no se dobla.
      return (
        <>
          {previo?.tipo !== "herramientas" ? <Text>{" "}</Text> : null}
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
        </>
      );
    case "error":
      return <Text color={temaInk.grave}>{acto.texto}</Text>;
    case "herramientas": {
      // Paisaje: una fila de aire que lo separe del texto, la cuenta de lo que no se ve y
      // las ÚLTIMAS líneas, en tenue, con sangría y truncadas a la anchura — una línea
      // de tool es UNA fila, nunca envuelve (un patrón de grep puede medir 200 columnas).
      // Y aire también DETRÁS: en OpenCode cada bloque lleva su `marginTop 1`, y sin él
      // el texto siguiente se pegaba al paisaje.
      const sobran = acto.lineas.length - LINEAS_DE_HERRAMIENTAS;
      const ultimas = acto.lineas.slice(-LINEAS_DE_HERRAMIENTAS);
      return (
        <>
          <Text>{" "}</Text>
          {sobran > 0 ? <Text color={temaInk.tenue}>{`  … ${sobran} pasos antes`}</Text> : null}
          {ultimas.map((linea, i) => (
            <Text key={i} color={temaInk.tenue} wrap="truncate-end">{`  ${linea}`}</Text>
          ))}
          <Text>{" "}</Text>
        </>
      );
    }
    default:
      // sistema: mudo e indentado — un aviso, no la conversación.
      return <Text color={temaInk.mudo}>{`  ${acto.texto}`}</Text>;
  }
}

export function Transcript({
  store,
  altura,
  rueda,
  ancho = 80,
}: {
  store: Store;
  altura: number;
  /** Las muescas de la rueda del ratón (+ arriba, − abajo), ya filtradas de stdin por `raton.ts`. */
  rueda?: EmisorDeRueda;
  /**
   * Columnas que rellena de fondo la tarjeta de usuario — el MISMO ancho que la Entrada,
   * que es quien lo mide (`App`). Con omisión (tests que no hablan de tarjetas), 80.
   */
  ancho?: number;
}): ReactNode {
  const [estado, setEstado] = useState<EstadoDeTui>(store.estado());
  const [desfase, setDesfase] = useState(0); // 0 = al fondo; N = N actos hacia arriba

  // La rueda: el mismo `moverDesfase` que PgUp/PgDn, en pasos más cortos. El total se
  // lee del store en el momento, no del estado del render, para no acotar con un valor viejo.
  useEffect(() => {
    if (rueda === undefined) return;
    return rueda.suscribir((delta) =>
      setDesfase((d) => moverDesfase(d, store.estado().actos.length, delta * PASO_DE_RUEDA))
    );
  }, [rueda, store]);

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

  // `altura` es la altura física del panel, pero un acto no equivale a una fila: una
  // tarjeta ocupa tres, una tabla varias y el markdown puede envolver. Recortar con
  // `ventanaDe(..., altura)` mezclaba ambas unidades y daba saltos al hacer scroll.
  // Dejamos que Ink recorte por altura REAL; al subir, solo quitamos del final los actos
  // más nuevos para que el borde inferior de la ventana se desplace hacia el pasado.
  const visibles = estado.actos.slice(0, Math.max(0, estado.actos.length - desfase));

  // El cerco es estado GLOBAL de la conversación: una ventana que empiece a mitad de un
  // cerco abierto tiene que saberlo. Un pase sobre TODOS los actos asistente (en orden,
  // que es como llegaron) da el estado de cada uno; el colchón hereda el estado final
  // — el truco del centinela: una última línea que no es cerco, cuyo estado previo es
  // el que queda tras toda la lista.
  const textosAsistente = estado.actos
    .filter((a): a is Extract<Acto, { tipo: "asistente" }> => a.tipo === "asistente")
    .map((a) => a.texto);
  const estados = estadosDeCerco(textosAsistente);
  // Cada respuesta se pinta con dos columnas de sangría (igual que OpenCode). La
  // tabla ha de repartir sus columnas con ESE ancho útil: calcularla con `ancho`
  // exterior hacía que su borde derecho se envolviera dentro del bloque.
  const tablas = contextoDeTabla(textosAsistente, Math.max(3, ancho - 2));
  const cercoDeActo = new Map<Acto, boolean>();
  const tablaDeActo = new Map<Acto, LineaDeTabla>();
  let i = 0;
  for (const acto of estado.actos) {
    if (acto.tipo !== "asistente") continue;
    cercoDeActo.set(acto, estados[i] ?? false);
    const tabla = tablas[i];
    if (tabla) tablaDeActo.set(acto, tabla);
    i++;
  }
  const enCercoColchon = estadosDeCerco([...textosAsistente, ""]).at(-1) ?? false;

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
      {visibles.map((acto, i) => {
        const esRespuesta = acto.tipo === "asistente";
        // OpenCode separa cada parte de texto, no cada línea: el streaming sigue unido,
        // pero al llegar desde una tarjeta, herramientas o sistema respira una fila.
        const empiezaRespuesta = esRespuesta && i > 0 && visibles[i - 1]?.tipo !== "asistente";
        const contenido = (
          <ActoVista
            acto={acto}
            previo={i > 0 ? visibles[i - 1] : undefined}
            // La sangría ocupa dos columnas. Las tablas y separadores se calculan con
            // el ancho útil para que nunca empujen la columna derecha.
            ancho={esRespuesta ? Math.max(3, ancho - 2) : ancho}
            enCerco={cercoDeActo.get(acto) ?? false}
            tabla={tablaDeActo.get(acto)}
          />
        );
        return (
          <Box key={`${i}-${acto.tipo}`} flexShrink={0} flexDirection="column">
            {esRespuesta ? (
              // Como OpenCode, una respuesta es Markdown sangrado y con aire antes del
              // bloque, no una sucesión de barras de color. Las líneas del streaming
              // permanecen juntas y siguen leyéndose como una sola respuesta.
              <Box
                flexDirection="column"
                paddingLeft={2}
                marginTop={empiezaRespuesta ? 1 : 0}
              >
                {contenido}
              </Box>
            ) : (
              contenido
            )}
          </Box>
        );
      })}
      {/* El colchón solo es «en curso» si se ve el fondo: subido a leer, no estorba. */}
      {desfase === 0 && estado.colchon !== "" ? (
        <Box flexShrink={0} flexDirection="column">
          <LineaMarkdown texto={estado.colchon} enCerco={enCercoColchon} ancho={ancho} />
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
