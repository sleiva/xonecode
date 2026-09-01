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
import { temaInk } from "./temaInk.js";

export function Entrada({
  alEnviar,
  completa,
  ocupado,
  historial,
}: {
  alEnviar: (linea: string) => void;
  /** El completer puro de `consola.ts`: `(linea) => [candidatos, linea]`. */
  completa: (linea: string) => [string[], string];
  ocupado: boolean;
  historial: readonly string[];
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
    <Box flexDirection="column" borderStyle="round" borderColor={temaInk.borde} paddingX={1}>
      {ocupado ? (
        <Text color={temaInk.mudo}>turno en curso… (Ctrl-C para cancelar el turno)</Text>
      ) : (
        <Text color={temaInk.texto}>
          {valor}
          <Text color={temaInk.acento}>{"▏"}</Text>
        </Text>
      )}
      {pista.length > 0 ? <Text color={temaInk.mudo}>{`  ${pista.join("   ")}`}</Text> : null}
    </Box>
  );
}
