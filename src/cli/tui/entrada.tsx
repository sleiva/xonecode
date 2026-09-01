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

export function Entrada({
  alEnviar,
  completa,
  ocupado,
  historial,
  modelo,
}: {
  alEnviar: (linea: string) => void;
  /** El completer puro de `consola.ts`: `(linea) => [candidatos, linea]`. */
  completa: (linea: string) => [string[], string];
  ocupado: boolean;
  historial: readonly string[];
  /** El modelo de trabajo vigente: la segunda fila del cuadro, en mudo (la maqueta). */
  modelo: string;
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

  return (
    // La misma barra navy que el bloque de usuario: lo que escribes y lo que escribiste
    // tienen la misma forma. Sin borde arriba/abajo: dos filas de contenido, y app.tsx
    // cuenta con ellas en FILAS_FIJAS.
    <Box flexDirection="column" {...barra(temaInk.marca)}>
      {ocupado ? (
        <Text color={temaInk.mudo}>turno en curso… (Ctrl-C para cancelar el turno)</Text>
      ) : (
        <Text color={temaInk.texto}>
          {valor}
          <Text color={temaInk.prompt}>{"▏"}</Text>
        </Text>
      )}
      <Text color={temaInk.mudo}>{modelo}</Text>
      {pista.length > 0 ? <Text color={temaInk.mudo}>{`  ${pista.join("   ")}`}</Text> : null}
    </Box>
  );
}
