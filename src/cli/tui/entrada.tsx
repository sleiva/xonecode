/**
 * El cuadro de entrada: el único sitio donde el usuario escribe.
 *
 * A mano y sin `ink-text-input`: el contrato es pequeño (texto, historial, Tab de
 * comandos y @ficheros reutilizando el completer puro de `consola.ts`) y una
 * dependencia más no lo acorta.
 */
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { ReactNode } from "react";
import { barra } from "./barra.js";
import { temaInk } from "./temaInk.js";
import { filasDe } from "./filas.js";

/** El cursor: un carácter que viaja DENTRO del texto para que el partido en filas lo cuente. */
const CURSOR = "▏";

/**
 * Una fila de la tarjeta, rellena de espacios hasta `ancho` para que el fondo sea un
 * bloque sólido: Ink 5.2.1 solo da fondo a `Text`, y un Text pinta fondo solo bajo sus
 * caracteres. Una celda de aire a la izquierda (y la que sobre a la derecha) hace de
 * padding lateral. `visible` es lo que ocupa `children`, en puntos de código.
 */
function Fila({ ancho, visible, color, children }: { ancho: number; visible: number; color?: string; children?: ReactNode }): ReactNode {
  return (
    <Text backgroundColor={temaInk.fondoInput} color={color}>
      {" "}
      {children}
      {" ".repeat(Math.max(0, ancho - 1 - visible))}
    </Text>
  );
}

export function Entrada({
  alEnviar,
  completa,
  ocupado,
  historial,
  modelo,
  ancho,
}: {
  alEnviar: (linea: string) => void;
  /** El completer puro de `consola.ts`: `(linea) => [candidatos, linea]`. */
  completa: (linea: string) => [string[], string];
  ocupado: boolean;
  historial: readonly string[];
  /** El modelo de trabajo vigente: la última fila de la tarjeta, en mudo (la maqueta). */
  modelo: string;
  /** Columnas DESPUÉS de la barra: lo que cada fila rellena de fondo. La conoce `App`. */
  ancho: number;
}): ReactNode {
  const [valor, setValor] = useState("");
  const [indiceHistorial, setIndice] = useState(-1); // -1 = la línea en edición
  const [pista, setPista] = useState<string[]>([]);

  useInput(
    (entrada, tecla) => {
      if (tecla.return) {
        if (valor.trim() === "") return;
        alEnviar(valor);
        setValor("");
        setIndice(-1);
        setPista([]);
        return;
      }
      if (tecla.upArrow) {
        const siguiente = Math.min(historial.length - 1, indiceHistorial + 1);
        if (historial[siguiente] !== undefined) {
          setIndice(siguiente);
          setValor(historial[siguiente]!);
        }
        return;
      }
      if (tecla.downArrow) {
        const siguiente = indiceHistorial - 1;
        // Ya estás en la línea en edición (-1): no hay nada más abajo. Sin este guard,
        // siguiente === -2 y `historial[-2]` es undefined — y lo tecleado después se
        // pegaría detrás («undefinedhola») hasta llegar al modelo por Enter.
        if (siguiente < -1) return;
        setIndice(siguiente);
        setValor(siguiente === -1 ? "" : historial[siguiente]!);
        return;
      }
      if (tecla.tab) {
        const [candidatos, base] = completa(valor);
        if (candidatos.length === 1) {
          setValor(candidatos[0]!);
          setPista([]);
        } else if (candidatos.length > 1) {
          setPista(candidatos.slice(0, 8).map((c) => c.replace(base, "")));
        }
        return;
      }
      if (tecla.backspace || tecla.delete) {
        setValor((v) => v.slice(0, -1));
        setPista([]);
        return;
      }
      if (entrada && !tecla.ctrl && !tecla.meta && !tecla.escape) {
        setValor((v) => v + entrada);
        setPista([]);
      }
    },
    { isActive: !ocupado }
  );

  // Una celda de aire por lado: el texto se parte a `ancho - 2`.
  const interior = Math.max(1, ancho - 2);
  const filasDeTexto = filasDe(valor + CURSOR, interior);
  const largo = (t: string): number => Array.from(t).length;

  return (
    // La tarjeta de OpenCode: barra izquierda en acento (el navy casi no se ve sobre fondo
    // oscuro, y esto es lo que hay que ver: dónde escribes), una fila de aire, el texto,
    // otra de aire y el modelo. Los bloques de usuario del transcript siguen en navy: lo
    // que escribes se distingue de lo que escribiste. Sin borde arriba/abajo: cuatro
    // filas de contenido, y app.tsx cuenta con ellas en FILAS_FIJAS.
    // `paddingLeft={0}`: el aire lo pone cada Fila por dentro, para que lleve fondo.
    // `flexShrink={0}`: la fila de columnas tiene altura fija, y sin esto Ink encoge la
    // Entrada antes que el transcript — la fila del modelo pisaba la línea en edición y
    // el cursor desaparecía en cuanto había pista de Tab o el transcript se llenaba.
    //
    // El texto se parte AQUÍ (`filasDe`) y cada fila es su propio Text: no hay ningún
    // Text que envuelva, y con eso sobra el `key={valor}` que remediaba la trampa de
    // remedida de ink 5.2.1 (CLAUDE.md, «Trampas verificadas»); `app.test.tsx` la sigue
    // vigilando con un prompt de dos filas.
    <Box flexDirection="column" flexShrink={0} {...barra(temaInk.acento)} paddingLeft={0}>
      <Fila ancho={ancho} visible={0} />
      {ocupado ? (
        filasDe("turno en curso… (Ctrl-C para cancelar el turno)", interior).map((fila, i) => (
          <Fila key={i} ancho={ancho} visible={largo(fila)} color={temaInk.mudo}>{fila}</Fila>
        ))
      ) : (
        filasDeTexto.map((fila, i) => {
          const conCursor = i === filasDeTexto.length - 1;
          return (
            <Fila key={i} ancho={ancho} visible={largo(fila)} color={temaInk.texto}>
              {conCursor ? fila.slice(0, -CURSOR.length) : fila}
              {conCursor ? <Text color={temaInk.prompt}>{CURSOR}</Text> : null}
            </Fila>
          );
        })
      )}
      <Fila ancho={ancho} visible={0} />
      {filasDe(modelo, interior).map((fila, i) => (
        <Fila key={i} ancho={ancho} visible={largo(fila)} color={temaInk.mudo}>{fila}</Fila>
      ))}
      {pista.length > 0
        ? filasDe(`  ${pista.join("   ")}`, interior).map((fila, i) => (
            <Fila key={i} ancho={ancho} visible={largo(fila)} color={temaInk.mudo}>{fila}</Fila>
          ))
        : null}
    </Box>
  );
}
