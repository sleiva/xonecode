/**
 * La sidebar: lo que conviene tener delante sin pedirlo. Los datos entran por props —
 * quien compone la sesión los resuelve (tope por `topeResuelto`, rama por git) y este
 * componente solo pinta. El porcentaje SOLO con tope: la regla de `core/contextos.ts`.
 */
import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { temaInk, temaInkActivo } from "./temaInk.js";
import type { Papel } from "../../core/ports.js";
// El MISMO formato compacto que stdio (`cli/tokens.ts`): dos pieles, una cifra.
import { compacto, formatearTope } from "../tokens.js";
import { LOGOS_XONE } from "./logo.js";

export interface DatosDeSidebar {
  contexto: number;
  /** Tokens de entrada acumulados durante la sesión. */
  tokenIn?: number;
  /** Tokens de salida acumulados durante la sesión. */
  tokenOut?: number;
  tope?: number;
  modelo: string;
  modelosPorPapel: Partial<Record<Papel, string>>;
  proyecto: string;
  /** La raíz del proyecto (con el `$HOME` ya abreviado a `~`) para el pie; `proyecto` es su basename. */
  ruta: string;
  rama?: string;
  version: string;
  /** Alto disponible para extender el fondo diferenciado hasta el pie. */
  altura?: number;
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
 * el pie enseña `ruta:rama`. Quien decide es `App`, que es quien conoce `stdout.columns`.
 */
export const ANCHO_DE_SIDEBAR = 42;
export const ANCHO_MINIMO_PARA_SIDEBAR = 120;

export function cabeSidebar(columnas: number): boolean {
  return columnas > ANCHO_MINIMO_PARA_SIDEBAR;
}

export function Sidebar(d: DatosDeSidebar): ReactNode {
  const pct = porcentaje(d.contexto, d.tope);
  const tokenIn = d.tokenIn ?? 0;
  const tokenOut = d.tokenOut ?? 0;
  const anchoInterior = ANCHO_DE_SIDEBAR - 4;
  const fondo = temaInk.fondoSidebar;
  const logos = LOGOS_XONE[temaInkActivo()];
  const textoContexto =
    `Contexto  ${compacto(d.contexto)}` +
    (pct !== undefined ? `/${formatearTope(d.tope!)} (${pct}%)` : " tokens");
  const lineasTokens = (tokenIn > 0 ? 1 : 0) + (tokenOut > 0 ? 1 : 0) + (d.contexto > 0 ? 1 : 0);
  const lineasRoles = Object.keys(d.modelosPorPapel).filter((papel) => papel !== "trabajo").length;
  // Dos líneas de cabecera, logo, aire tras logo, posible bloque de tokens, bloque de
  // modelo y pie. El resto se pinta explícitamente con fondo: Ink solo permite fondos
  // sobre Text, no sobre Box, y el hueco no puede volver a confundirse con transcript.
  const lineasOcupadas = 2 + logos.length + 1 + (lineasTokens > 0 ? 1 + lineasTokens + 1 : 0) + 2 + lineasRoles + 1;
  const huecos = d.altura === undefined ? 0 : Math.max(0, d.altura - lineasOcupadas);
  return (
    // flexGrow para llenar la columna: el separador de abajo empuja el pie al fondo.
    <Box flexDirection="column" flexGrow={1}>
      {/* La barra abre por el proyecto; debajo va el logotipo XOne completo. Los intentos
          de comprimirlo alteraban sus letras con esta fuente de terminal, así que la
          versión de cinco filas es la única marca legible y estable. */}
      <Box flexDirection="column" marginBottom={1}>
        <Text backgroundColor={temaInk.marca} bold>{` ${d.proyecto}`.padEnd(anchoInterior, " ")}</Text>
        <Text backgroundColor={fondo} color={temaInk.mudo} wrap="truncate-end">{(d.rama !== undefined ? `${d.ruta}:${d.rama}` : d.ruta).padEnd(anchoInterior, " ")}</Text>
        {logos.map((fila, i) => (
          <Text key={i} backgroundColor={fondo} color={temaInk.acento}>{fila.padEnd(anchoInterior, " ")}</Text>
        ))}
      </Box>
      {tokenIn > 0 || tokenOut > 0 || d.contexto > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text backgroundColor={fondo} bold color={temaInk.acento}>{"Tokens".padEnd(anchoInterior, " ")}</Text>
          {tokenIn > 0 ? <Text backgroundColor={fondo}>{`Token In  ${compacto(tokenIn)}`.padEnd(anchoInterior, " ")}</Text> : null}
          {tokenOut > 0 ? <Text backgroundColor={fondo}>{`Token Out  ${compacto(tokenOut)}`.padEnd(anchoInterior, " ")}</Text> : null}
          {d.contexto > 0 ? (
            <Text backgroundColor={fondo} color={temaInk.mudo}>
              {textoContexto.padEnd(anchoInterior, " ")}
            </Text>
          ) : null}
        </Box>
      ) : null}
      <Box flexDirection="column">
        <Text backgroundColor={fondo} bold color={temaInk.acento}>{"Modelo".padEnd(anchoInterior, " ")}</Text>
        <Text backgroundColor={fondo} wrap="truncate-end">{d.modelo.padEnd(anchoInterior, " ")}</Text>
        {/* «trabajo» no se lista: la línea principal de arriba YA es ese (medido: salía
            el mismo valor dos veces). `correrTui.ts` mantiene `papeles.trabajo` y
            `modeloTrabajo` sincronizados en las dos ramas de /modelo, así que ocultarlo no
            esconde ninguna discrepancia. Los demás papeles sí, en mudo. */}
        {Object.entries(d.modelosPorPapel)
          .filter(([papel]) => papel !== "trabajo")
          .map(([papel, m]) => (
            <Text key={papel} backgroundColor={fondo} color={temaInk.mudo} wrap="truncate-end">{`${papel}: ${m}`.padEnd(anchoInterior, " ")}</Text>
          ))}
      </Box>
      {/* El separador elástico: lo estable vive al fondo, como en la maqueta. */}
      <Box flexGrow={1} flexDirection="column">
        {Array.from({ length: huecos }, (_, i) => (
          <Text key={i} backgroundColor={fondo}>{" ".repeat(anchoInterior)}</Text>
        ))}
      </Box>
      <Box flexDirection="column">
        <Text backgroundColor={fondo} wrap="truncate-end">
          <Text color={temaInk.exito}>{"● "}</Text>
          <Text color={temaInk.mudo}>{`xonecode ${d.version}`}</Text>
          {" ".repeat(anchoInterior)}
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
