/**
 * Los tipos del transcript y del transporte, re-declarados — no importados de
 * `src/core/actos.ts` ni de `src/web/servidor/transporte.ts`. `src/web/frontera.test.ts`
 * prohíbe que `apps/web/` y `src/` compartan un módulo de EJECUCIÓN, y una importación de
 * tipos con `import type` desaparece en tiempo de ejecución pero igual ata el build del
 * cliente a la resolución de módulos de `src/` (su `tsconfig`, sus paths) — exactamente lo
 * que la frontera evita. Los dos ficheros pueden divergir en silencio; `tipos.test.ts`
 * compara los literales de `tipo:` de este fichero con los de `core/actos.ts`, Y los
 * literales de `clase:` de las dos uniones de mensaje con los de
 * `web/servidor/transporte.ts`, para que divergir dé un test en rojo y no un bug mudo en
 * producción. La comparación de `clase:` es la que faltó en la primera versión de este
 * fichero: a `MensajeDelCliente` le faltaba el miembro de clase «secreto» —la respuesta a
 * `leerSecreto`, con un campo `valor`— que `transporte.ts:46` sí declara, y nada lo delató
 * hasta que se amplió el test. (Este párrafo describe ese miembro EN PROSA a propósito: la
 * forma `{ clase: "…" }` en un comentario de este fichero contaría como un literal más
 * para el propio detector de divergencia que unas líneas más abajo se prueba contra
 * `[a-z0-9_-]+` — medido, dio un falso positivo hasta que se reescribió así.)
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
  /**
   * El registro de comandos de barra (`COMANDOS` en `cli/consola.ts`), para que el
   * compositor sugiera sin llevar una copia — `nombre` con la «/» delante, tal cual se
   * teclea.
   */
  | { clase: "comandos"; comandos: { nombre: string; descripcion: string }[] }
  | {
      clase: "aprobacion";
      pendientes: unknown[];
      ficheros: Record<string, string>;
      diffs: Record<string, unknown[]>;
    };

export type MensajeDelCliente =
  | { clase: "prosa"; texto: string }
  | { clase: "respuesta"; texto: string }
  /**
   * La respuesta a `seleccionar`. **Sin `id` (o con `id: null`) es CANCELAR** — la misma
   * salida que en el terminal («número, Enter cancela»). El servidor lo traduce a
   * `undefined`; un id vacío o desconocido NO es cancelar, es un id que no existe. Ver
   * `web/servidor/transporte.ts` para el razonamiento entero: este fichero es su copia
   * declarada, y `tipos.test.ts` solo compara los literales `clase:`, no los CAMPOS de
   * dentro de una variante — o sea que esta pareja hay que cuidarla a mano.
   */
  | { clase: "eleccion"; id?: string | null }
  /** La respuesta a la pregunta secreta de `MensajeAlCliente` — otro mensaje, otra forma: aquel lleva `pregunta`, este `valor`. */
  | { clase: "secreto"; valor: string }
  | { clase: "decision"; decisiones: Record<string, string> };
