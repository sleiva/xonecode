/**
 * La sidebar: lo que conviene tener delante sin pedirlo. Los datos entran por props —
 * quien compone la sesión los resuelve (tope por `topeResuelto`, rama por git) y este
 * componente solo pinta. El porcentaje SOLO con tope: la regla de `core/contextos.ts`.
 */
import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { temaInk } from "./temaInk.js";
import type { Papel } from "../../core/ports.js";

const compacto = (n: number): string =>
  n < 1000 ? `${n}` : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${(n / 1000).toFixed(1)}K`;

export interface DatosDeSidebar {
  contexto: number;
  tope?: number;
  modelo: string;
  modelosPorPapel: Partial<Record<Papel, string>>;
  proyecto: string;
  rama?: string;
  version: string;
}

export function Sidebar(d: DatosDeSidebar): ReactNode {
  return (
    <Box flexDirection="column" gap={1}>
      {d.contexto > 0 ? (
        <Box flexDirection="column">
          <Text bold color={temaInk.acento}>Context</Text>
          <Text>
            {compacto(d.contexto)}
            {d.tope !== undefined ? `/${compacto(d.tope)} (${Math.round((d.contexto / d.tope) * 100)}%)` : " tokens"}
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
      <Box flexDirection="column">
        <Text bold color={temaInk.acento}>Proyecto</Text>
        <Text>{d.proyecto}</Text>
        {d.rama !== undefined ? <Text color={temaInk.mudo}>{d.rama}</Text> : null}
        <Text color={temaInk.mudo}>xonecode {d.version}</Text>
      </Box>
    </Box>
  );
}

/**
 * La línea inferior de estado, en mudo: lo que ya se sabe, recordado sin gritar.
 * El texto vive en una función PURA (`lineaDeEstado`) para probar la composición
 * sin montar Ink, mismo patrón que `ventanaDe` en transcript.tsx.
 */
export function lineaDeEstado(modelo: string, ruta: string): string {
  return `${modelo} · ${ruta} · /ayuda`;
}

export function BarraDeEstado({ modelo, ruta }: { modelo: string; ruta: string }): ReactNode {
  return <Text color={temaInk.mudo}>{lineaDeEstado(modelo, ruta)}</Text>;
}