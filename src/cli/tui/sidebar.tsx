/**
 * La sidebar: lo que conviene tener delante sin pedirlo. Los datos entran por props —
 * quien compone la sesión los resuelve (tope por `topeResuelto`, rama por git) y este
 * componente solo pinta. El porcentaje SOLO con tope: la regla de `core/contextos.ts`.
 */
import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { temaInk } from "./temaInk.js";
import type { Papel } from "../../core/ports.js";
// El MISMO formato compacto que stdio (`cli/tokens.ts`): dos pieles, una cifra.
import { compacto, formatearTope } from "../tokens.js";
import { LOGO_XONE, cabeLogo } from "./logo.js";

export interface DatosDeSidebar {
  contexto: number;
  tope?: number;
  modelo: string;
  modelosPorPapel: Partial<Record<Papel, string>>;
  proyecto: string;
  /** La raíz completa del proyecto: el pie la enseña entera; `proyecto` es su basename. */
  ruta: string;
  rama?: string;
  version: string;
}

/**
 * `columnas` es la anchura TOTAL del terminal, y llega aparte de los datos: los datos
 * los compone `correrTui.ts` (que no mira stdout) y la anchura la conoce `App`.
 */
export function Sidebar({ columnas, ...d }: DatosDeSidebar & { columnas: number }): ReactNode {
  return (
    // flexGrow para llenar la columna: el separador de abajo empuja el pie al fondo.
    <Box flexDirection="column" flexGrow={1}>
      {cabeLogo(columnas) ? (
        <Box flexDirection="column" marginBottom={1}>
          {LOGO_XONE.map((fila, i) => (
            <Text key={i} color={temaInk.acento}>{fila}</Text>
          ))}
        </Box>
      ) : null}
      {d.contexto > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={temaInk.acento}>Contexto</Text>
          <Text>
            {compacto(d.contexto)}
            {d.tope !== undefined ? `/${formatearTope(d.tope)} (${Math.round((d.contexto / d.tope) * 100)}%)` : " tokens"}
          </Text>
        </Box>
      ) : null}
      <Box flexDirection="column">
        <Text bold color={temaInk.acento}>Modelo</Text>
        <Text>{d.modelo}</Text>
        {Object.entries(d.modelosPorPapel).map(([papel, m]) => (
          <Text key={papel} color={temaInk.mudo}>{`${papel}: ${m}`}</Text>
        ))}
      </Box>
      {/* El separador elástico: lo estable vive al fondo, como en la maqueta. */}
      <Box flexGrow={1} />
      <Box flexDirection="column">
        <Text>
          <Text bold>{d.proyecto}</Text>
          {d.rama !== undefined ? <Text color={temaInk.mudo}>{`:${d.rama}`}</Text> : null}
        </Text>
        <Text>
          <Text color={temaInk.exito}>{"● "}</Text>
          <Text color={temaInk.mudo}>{`xonecode ${d.version}`}</Text>
        </Text>
      </Box>
    </Box>
  );
}

/**
 * El pie a dos extremos: la ruta a la izquierda; a la derecha las cifras de contexto y
 * el recordatorio de `/ayuda`. Pura, para probar la composición sin montar Ink (mismo
 * patrón que `ventanaDe` en transcript.tsx). `cifras` vive aparte de `derecha` porque
 * se pinta en mudo y `/ayuda` en texto; `derecha` es la línea completa, para los tests.
 * Porcentaje SOLO con tope, y sin medición (`contexto === 0`) ninguna cifra: las dos
 * reglas de `core/contextos.ts` y de la sidebar.
 */
export function pie(d: { ruta: string; contexto: number; tope?: number }): {
  izquierda: string;
  cifras: string;
  derecha: string;
} {
  let cifras = "";
  if (d.contexto > 0) {
    cifras =
      d.tope !== undefined && d.tope > 0
        ? `${compacto(d.contexto)} (${Math.round((d.contexto / d.tope) * 100)}%)`
        : `${compacto(d.contexto)} tokens`;
  }
  return { izquierda: d.ruta, cifras, derecha: cifras === "" ? "/ayuda" : `${cifras}  /ayuda` };
}

export function BarraDeEstado(d: { ruta: string; contexto: number; tope?: number }): ReactNode {
  const p = pie(d);
  return (
    <Box justifyContent="space-between">
      <Text color={temaInk.mudo}>{p.izquierda}</Text>
      <Text>
        {p.cifras !== "" ? <Text color={temaInk.mudo}>{`${p.cifras}  `}</Text> : null}
        <Text color={temaInk.texto}>/ayuda</Text>
      </Text>
    </Box>
  );
}
