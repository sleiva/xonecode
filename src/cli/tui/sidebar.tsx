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
import { LOGO_XONE } from "./logo.js";

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
 * La regla de anchura, copiada de OpenCode (`packages/tui/src/routes/session/index.tsx`):
 * la sidebar NO se redimensiona — mide fijo y aparece solo con MÁS de 120 columnas de
 * terminal (estricto, como allí). Por debajo, el transcript se queda con todo el ancho y
 * el pie enseña `ruta:rama`. Quien decide es `App`, que es quien conoce `stdout.columns`;
 * la sidebar, si está montada, es que cabe — y con ella el logotipo (26 columnas en 38
 * de contenido), que por eso ya no tiene umbral propio.
 */
export const ANCHO_DE_SIDEBAR = 42;
export const ANCHO_MINIMO_PARA_SIDEBAR = 120;

export function cabeSidebar(columnas: number): boolean {
  return columnas > ANCHO_MINIMO_PARA_SIDEBAR;
}

export function Sidebar(d: DatosDeSidebar): ReactNode {
  const pct = porcentaje(d.contexto, d.tope);
  return (
    // flexGrow para llenar la columna: el separador de abajo empuja el pie al fondo.
    <Box flexDirection="column" flexGrow={1}>
      {/* Ink solo pinta fondos en Text, no en Box. Esta franja llena el ancho útil de
          la columna y, junto con el borde azul de App, deja la sidebar inequívocamente
          separada del transcript sin introducir escapes ANSI. */}
      <Text backgroundColor={temaInk.fondoSidebar} color={temaInk.acento} bold>
        {"  SESIÓN XONE".padEnd(38, " ")}
      </Text>
      <Box flexDirection="column" marginBottom={1}>
        {LOGO_XONE.map((fila, i) => (
          <Text key={i} color={temaInk.acento}>{fila}</Text>
        ))}
      </Box>
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
        {/* «trabajo» no se lista: la línea principal de arriba YA es ese (medido: salía
            el mismo valor dos veces). `correrTui.ts` mantiene `papeles.trabajo` y
            `modeloTrabajo` sincronizados en las dos ramas de /modelo, así que ocultarlo no
            esconde ninguna discrepancia. Los demás papeles sí, en mudo. */}
        {Object.entries(d.modelosPorPapel)
          .filter(([papel]) => papel !== "trabajo")
          .map(([papel, m]) => (
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
 * reglas de `core/contextos.ts` y de la sidebar. `rama` llega solo cuando NO hay
 * sidebar que la enseñe (terminal estrecho): entonces la izquierda es `ruta:rama`.
 */
export function pie(d: { ruta: string; rama?: string; contexto: number; tope?: number }): {
  izquierda: string;
  cifras: string;
  derecha: string;
} {
  let cifras = "";
  if (d.contexto > 0) {
    const pct = porcentaje(d.contexto, d.tope);
    cifras = pct !== undefined ? `${compacto(d.contexto)} (${pct}%)` : `${compacto(d.contexto)} tokens`;
  }
  const izquierda = d.rama !== undefined ? `${d.ruta}:${d.rama}` : d.ruta;
  return { izquierda, cifras, derecha: cifras === "" ? "/ayuda" : `${cifras}  /ayuda` };
}

export function BarraDeEstado(d: { ruta: string; rama?: string; contexto: number; tope?: number }): ReactNode {
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
      {/* Dos Text HERMANOS en un Box, no anidados en un Text. MEDIDO en terminal real: al
          arrancar no hay cifras y el Text medía las 6 columnas de «/ayuda»; cuando llegaban,
          se insertaban DELANTE en el mismo Text y ink 5.2.1 no remide en ese caso (CLAUDE.md,
          «Trampas verificadas»): envolvía y «tokens  /ayuda» caía a una fila recortada.
          Insertar un hijo en un Box sí remide. `app.test.tsx` lo vigila. */}
      <Box flexShrink={0} marginLeft={1}>
        {p.cifras !== "" ? <Text color={temaInk.mudo}>{`${p.cifras}  `}</Text> : null}
        <Text color={temaInk.texto}>/ayuda</Text>
      </Box>
    </Box>
  );
}
