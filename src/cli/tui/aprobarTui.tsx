/**
 * El modal de aprobación de la TUI: el reductor puro, la promesa del puerto
 * `pedirAprobacion` y el componente Ink. Mismo espíritu que `cli/aprobar.ts` (las
 * mismas constantes de diff, el mismo fail-closed) pero el destino es el store de la
 * TUI y no un `preguntar` de stdin.
 */
import { type Decision } from "../../vendor/hitl.js";
import type { PendienteDeAprobacion } from "../../core/events.js";
import { conContexto, recortar, type LineaDeDiff } from "../../core/diff.js";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { ReactNode } from "react";
import { temaInk } from "./temaInk.js";

/** Contexto alrededor de cada cambio y techo de líneas: los MISMOS que `cli/aprobar.ts`, porque decidir es decidir en cualquier piel. */
const CONTEXTO_DEL_DIFF = 2;
const TECHO_DEL_DIFF = 25;

export interface EstadoDeAprobacion {
  pendientes: PendienteDeAprobacion[];
  indice: number;
  decisiones: Map<string, Decision>;
  /** Solo al agotar la lista: una decisión POR CADA pendiente. */
  terminado?: Map<string, Decision>;
}

export function estadoInicial(pendientes: PendienteDeAprobacion[]): EstadoDeAprobacion {
  return { pendientes, indice: 0, decisiones: new Map() };
}

/**
 * Puro: una respuesta («aprobar» | «rechazar») avanza el índice y acumula la decisión
 * del pendiente actual. Al agotar la lista, `terminado` lleva el Map completo — el
 * fail-closed de los pendientes sin responder vive en `pedirDecisionesTui`, que rellena
 * con RECHAZO lo que falte, pero el contrato aquí es que lo agotado está decidido entero.
 */
export function reductorDeAprobacion(s: EstadoDeAprobacion, respuesta: "aprobar" | "rechazar"): EstadoDeAprobacion {
  const p = s.pendientes[s.indice];
  if (p === undefined) return s;
  const decisiones = new Map(s.decisiones).set(p.id, { type: respuesta === "aprobar" ? "approve" : "reject" });
  const terminado = s.indice + 1 >= s.pendientes.length ? decisiones : undefined;
  return { ...s, indice: s.indice + 1, decisiones, terminado };
}

/** Las props que `montar` recibe para pintar el modal: lo que mira y a quién avisa. */
export interface PropsDelModal {
  pendientes: PendienteDeAprobacion[];
  fichero: (id: string) => string | undefined;
  diff: (id: string) => LineaDeDiff[] | undefined;
  alTerminar: (d: Map<string, Decision>) => void;
}

/**
 * El puerto `pedirAprobacion` en TUI — MISMA firma que `abrirSesionReal` espera. `montar`
 * lo pone en el store de la app (el modal se pinta); la promesa resuelve con TODAS las
 * decisiones. **Desmontar el modal sin responder es rechazo de los restantes** — la
 * costura del fail-closed está aquí, porque aprobar ESCRIBE y lo que no se entiende no
 * toca nada.
 */
export function pedirDecisionesTui(
  pendientes: PendienteDeAprobacion[],
  ficheros: Map<string, string>,
  diffs: Map<string, LineaDeDiff[]>,
  montar: (props: PropsDelModal) => void
): Promise<Map<string, Decision>> {
  return new Promise((resolver) => {
    if (pendientes.length === 0) return resolver(new Map());
    montar({
      pendientes,
      fichero: (id) => ficheros.get(id),
      diff: (id) => diffs.get(id),
      alTerminar: (decisiones) => {
        // Los pendientes sin decisión explícita: RECHAZO. Nunca silencio ni aprobación.
        for (const p of pendientes) {
          if (!decisiones.has(p.id)) decisiones.set(p.id, { type: "reject" });
        }
        resolver(decisiones);
      },
    });
  });
}

/**
 * El modal: enseña el pendiente actual con su diff coloreado (el ÚNICO sitio donde el
 * contenido de una escritura se enseña, porque aquí se DECIDE sobre él) y lee el teclado.
 * **Fail-closed por tecla**: solo «s»/«S» aprueba; «n», Enter, Escape y Ctrl-C rechazan.
 */
export function ModalAprobacion({ pendientes, fichero, diff, alTerminar }: PropsDelModal): ReactNode {
  const [estado, setEstado] = useState(() => estadoInicial(pendientes));

  useInput((entrada, tecla) => {
    if (estado.terminado !== undefined) return;
    const esSi = entrada === "s" || entrada === "S";
    // Todo lo demás —incluido Enter a secas y Ctrl-C— es rechazo: aprobar es un acto
    // explícito, no un default.
    const esNo = entrada === "n" || entrada === "N" || tecla.return || tecla.escape || tecla.ctrl;
    if (!esSi && !esNo) return;
    const siguiente = reductorDeAprobacion(estado, esSi ? "aprobar" : "rechazar");
    setEstado(siguiente);
    if (siguiente.terminado !== undefined) alTerminar(siguiente.terminado);
  });

  const p = estado.pendientes[estado.indice];
  if (p === undefined) return null;
  const lineas = diff(p.id);
  const visibles = lineas !== undefined ? recortar(conContexto(lineas, CONTEXTO_DEL_DIFF), TECHO_DEL_DIFF) : undefined;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={temaInk.aviso} paddingX={1}>
      <Text bold color={temaInk.aviso}>{`APROBACIÓN ${estado.indice + 1}/${pendientes.length}`}</Text>
      <Text>{`  ${p.descripcion}`}</Text>
      {fichero(p.id) !== undefined ? <Text>{`  fichero: ${fichero(p.id)}`}</Text> : null}
      <Text color={temaInk.mudo}>{`  quién: ${p.origen}`}</Text>
      {visibles?.lineas.map((l, i) => (
        <Text
          key={i}
          color={l.tipo === "anadido" ? temaInk.anadido : l.tipo === "quitado" ? temaInk.quitado : temaInk.mudo}
        >
          {`  ${l.tipo === "anadido" ? "+ " : l.tipo === "quitado" ? "- " : "  "}${l.texto}`}
        </Text>
      ))}
      {visibles !== undefined && visibles.recortadas > 0 ? (
        <Text color={temaInk.mudo}>{`  … y ${visibles.recortadas} líneas más`}</Text>
      ) : null}
      <Text bold>{"  ¿Aprobar? [S/n]"}</Text>
    </Box>
  );
}