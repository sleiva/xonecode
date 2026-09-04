/**
 * Los tipos del transcript y del transporte, re-declarados — no importados de
 * `src/core/actos.ts` ni de `src/web/servidor/transporte.ts`. `src/web/frontera.test.ts`
 * prohíbe que `apps/web/` y `src/` compartan un módulo de EJECUCIÓN, y una importación de
 * tipos con `import type` desaparece en tiempo de ejecución pero igual ata el build del
 * cliente a la resolución de módulos de `src/` (su `tsconfig`, sus paths) — exactamente lo
 * que la frontera evita. Los dos ficheros pueden divergir en silencio; `tipos.test.ts`
 * compara los literales de `tipo:` de este fichero con los de `core/actos.ts` para que
 * divergir dé un test en rojo y no un bug mudo en producción.
 *
 * Los campos de `aprobacion` van como `unknown[]`/`Record<string, unknown[]>` en vez de
 * traer aquí `PendienteDeAprobacion` y `LineaDeDiff`: esos dos tipos no llevan `tipo:` como
 * discriminante de unión (uno no tiene `tipo` en absoluto, el otro lo usa para OTRA cosa) y
 * duplicarlos no lo exige ningún test de esta tarea — quien pinte el modal de aprobación
 * los necesitará con forma, no aquí.
 */

export type Acto =
  | { tipo: "usuario"; texto: string }
  | { tipo: "asistente"; texto: string }
  | { tipo: "herramientas"; lineas: string[] }
  | { tipo: "sistema"; texto: string }
  | { tipo: "fase"; texto: string; ms: number }
  | { tipo: "fin"; ms: number; modelo?: string }
  | { tipo: "error"; texto: string };

export interface SelectorDeConsola {
  titulo: string;
  opciones: readonly { id: string; etiqueta: string; detalle?: string }[];
}

export type MensajeAlCliente =
  | { clase: "acto"; acto: Acto }
  /** Sustituye el ÚLTIMO acto en vez de anexar: ver `store.ts#aplicar` para el porqué. */
  | { clase: "sustitucion"; acto: Acto }
  /** El transcript completo: lo que trae (re)conectar, y el arreglo de cualquier desajuste. */
  | { clase: "reemision"; actos: Acto[] }
  | { clase: "pregunta"; texto: string }
  | { clase: "selector"; selector: SelectorDeConsola }
  | { clase: "secreto"; pregunta: string }
  | {
      clase: "aprobacion";
      pendientes: unknown[];
      ficheros: Record<string, string>;
      diffs: Record<string, unknown[]>;
    };

export type MensajeDelCliente =
  | { clase: "prosa"; texto: string }
  | { clase: "respuesta"; texto: string }
  | { clase: "eleccion"; id: string }
  | { clase: "decision"; decisiones: Record<string, string> };
