/**
 * La memoria de cada ESPECIALISTA dentro de una sesión (opción 3 del análisis de la calculadora).
 *
 * Cada `create_sub_agent` crea un hilo NUEVO y la librería no sabe reanudar uno: el que ya había
 * leído la hoja de estilos y descubierto cómo se lanza la app volvía a leerla y a descubrirlo en la
 * delegación siguiente. Medido en una sesión real de 10 delegaciones: de 362 lecturas y búsquedas,
 * 88 eran del MISMO especialista que ya las había hecho en una delegación anterior —el doble que
 * las de otro agente—, y ese es exactamente el hueco que esto cierra.
 *
 * **Lo que se recuerda es la conversación PROPIA del especialista**, nunca lo que leyeron otros: la
 * siguiente encarnación arranca con su historial entero (`definition.messages`) seguido del encargo
 * nuevo. No se inyecta nada ajeno, y por eso no es «el paquete de contexto» que se descartó.
 *
 * Reglas, y de dónde salen:
 *
 * - **Tope** (`TOPE_DE_MEMORIA_TOKENS`): un hijo no se compacta, por una medida (resumirlo costaba
 *   más que reenviarlo), así que su historial solo crece. Pasado el tope se arranca de cero y se
 *   OLVIDA lo anterior; se dice en la traza. Es un número provisional: 48.000 es el orden al que
 *   llegan los conductores y diseñadores en una sesión larga antes de terminar.
 * - **Un hilo vivo por especialista**: si ya hay una encarnación corriendo (delegaciones en
 *   paralelo), la segunda arranca de cero. Una memoria no se reparte entre dos hilos vivos.
 * - **Saneada**: un hijo cortado o que acaba con una tool call sin respuesta daría un 400 del
 *   proveedor; se salda con el mismo texto que el raíz (`saldarColgadas`).
 * - **Solo si acabó BIEN**: un hijo que falló, o al que se cortó con «Detener» (su historial lleva la
 *   orden de parar y la heredaría la siguiente encarnación), no deja memoria y borra la que hubiera.
 * - **En memoria y por sesión**: no va a la foto en disco (habría que subir `VERSION_DE_MEMORIA`) y
 *   se olvida al abrir otra conversación. **Límite declarado**: reabrir una sesión no la recupera.
 */
import { saldarColgadas } from "./memoriaTrueforge.js";

export const TOPE_DE_MEMORIA_TOKENS = 48_000;

export interface EncarnacionPrevia {
  /** Los mensajes con los que arranca el hijo nuevo, ya saneados. */
  mensajes: unknown[];
  tokens: number;
}

/** Por qué una encarnación arranca sin memoria, para la traza. */
export type SinMemoria = "primera" | "hilo-vivo" | "olvidada-por-tope" | "olvidada-por-fallo";

export interface MemoriaDeEspecialistas {
  /** Abre una encarnación de `nombre`: su memoria si la hay y se puede usar, o el motivo de no. */
  abrir(nombre: string, hilo: string): { previa: EncarnacionPrevia } | { sin: SinMemoria };
  /** La encarnación `hilo` terminó: guarda su historial completo (o lo olvida si falló o pasó el tope). */
  cerrar(hilo: string, resultado: { bien: boolean; mensajes: readonly unknown[]; tokens: number }): SinMemoria | "guardada";
  /** Los hilos vivos se dieron por muertos (turno cortado, orquestador rehecho). La memoria se queda. */
  darPorMuertos(): void;
  /** Otra conversación: se olvida todo. */
  olvidar(): void;
}

export function crearMemoriaDeEspecialistas(tope: number = TOPE_DE_MEMORIA_TOKENS): MemoriaDeEspecialistas {
  const guardada = new Map<string, EncarnacionPrevia>();
  const vivos = new Map<string, string>(); // hilo → nombre
  const perdidas = new Map<string, SinMemoria>(); // por qué no hay memoria de `nombre`
  const hayVivo = (nombre: string): boolean => [...vivos.values()].includes(nombre);
  return {
    abrir(nombre, hilo) {
      const vivo = hayVivo(nombre);
      vivos.set(hilo, nombre);
      if (vivo) return { sin: "hilo-vivo" };
      const previa = guardada.get(nombre);
      if (previa !== undefined) return { previa };
      return { sin: perdidas.get(nombre) ?? "primera" };
    },
    cerrar(hilo, { bien, mensajes, tokens }) {
      const nombre = vivos.get(hilo);
      if (nombre === undefined) return "primera";
      vivos.delete(hilo);
      if (!bien) {
        guardada.delete(nombre);
        perdidas.set(nombre, "olvidada-por-fallo");
        return "olvidada-por-fallo";
      }
      if (tokens > tope) {
        guardada.delete(nombre);
        perdidas.set(nombre, "olvidada-por-tope");
        return "olvidada-por-tope";
      }
      guardada.set(nombre, { mensajes: saldarColgadas(mensajes), tokens });
      perdidas.delete(nombre);
      return "guardada";
    },
    darPorMuertos() {
      vivos.clear();
    },
    olvidar() {
      guardada.clear();
      vivos.clear();
      perdidas.clear();
    },
  };
}
