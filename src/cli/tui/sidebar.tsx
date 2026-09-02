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
  /** La raíz del proyecto (con el `$HOME` ya abreviado a `~`) para el pie; `proyecto` es su basename. */
  ruta: string;
  rama?: string;
  version: string;
}

/**
 * El porcentaje de contexto, o `undefined` si no hay tope que dividir. La regla de
 * `core/contextos.ts` («porcentaje SOLO con tope») en UNA función: la sidebar y el pie
 * la enseñan en dos sitios, y dos copias de la misma cuenta se separan tarde o temprano.
 * Un tope 0 es un tope que no se sabe: dividir daría `Infinity`, no un dato. Un
 * porcentaje definido implica, pues, un tope definido: por eso los llamadores pueden
 * afirmarlo al formatear el denominador.
 */
export function porcentaje(contexto: number, tope: number | undefined): number | undefined {
  if (tope === undefined || tope <= 0) return undefined;
  return Math.round((contexto / tope) * 100);
}

/**
 * `columnas` es la anchura TOTAL del terminal, y llega aparte de los datos: los datos
 * los compone `correrTui.ts` (que no mira stdout) y la anchura la conoce `App`.
 */
export function Sidebar({ columnas, ...d }: DatosDeSidebar & { columnas: number }): ReactNode {
  const pct = porcentaje(d.contexto, d.tope);
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
            {pct !== undefined ? `/${formatearTope(d.tope!)} (${pct}%)` : " tokens"}
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
    const pct = porcentaje(d.contexto, d.tope);
    cifras = pct !== undefined ? `${compacto(d.contexto)} (${pct}%)` : `${compacto(d.contexto)} tokens`;
  }
  return { izquierda: d.ruta, cifras, derecha: cifras === "" ? "/ayuda" : `${cifras}  /ayuda` };
}

export function BarraDeEstado(d: { ruta: string; contexto: number; tope?: number }): ReactNode {
  const p = pie(d);
  return (
    // `flexShrink={0}` en el pie: la fila de columnas tiene altura fija y el pie NO es
    // lo que cede — cede el transcript. Dentro, al revés: la ruta encoge (y se trunca
    // por DELANTE, que la cola es la que identifica el proyecto) y las cifras no, para
    // que un pie estrecho no se coma «/ayuda». El `marginLeft` deja el hueco que evita
    // que una ruta truncada quede pegada a las cifras.
    <Box justifyContent="space-between" flexShrink={0}>
      <Box flexShrink={1} minWidth={0}>
        <Text color={temaInk.mudo} wrap="truncate-start">
          {p.izquierda}
        </Text>
      </Box>
      <Box flexShrink={0} marginLeft={1}>
        <Text>
          {p.cifras !== "" ? <Text color={temaInk.mudo}>{`${p.cifras}  `}</Text> : null}
          <Text color={temaInk.texto}>/ayuda</Text>
        </Text>
      </Box>
    </Box>
  );
}
