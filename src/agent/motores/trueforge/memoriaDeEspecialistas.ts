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
 * - **Dos niveles, y por qué** (`TOPE_COMPLETA_TOKENS`, `TOPE_REDUCIDA_TOKENS`). Un hijo no se compacta,
 *   por una medida (resumirlo costaba más que reenviarlo), así que su historial solo crece, y al
 *   cerrar cada delegación de una sesión real medía: consultor y analista 62-81 mil tokens,
 *   desarrollador 96-122 mil, diseñador 124-198 mil, conductor 16-83 mil. Un tope único de 48.000 —la
 *   primera versión— olvidaba a casi todos, justo a los que más leen, y la primera prueba real lo
 *   delató. Y guardar el historial ENTERO de un diseñador reenvía 200 mil tokens en cada llamada.
 *   Así que: si cabe entero, se guarda entero (el especialista conserva lo que leyó); si no, se
 *   guarda REDUCIDO —lo que dijo, lo que pidió y qué contestó cada tool, recortado— y sabe QUÉ hizo y
 *   descubrió aunque tenga que releer un fichero si lo necesita; y si ni reducido cabe, se arranca de
 *   cero y se dice en la traza.
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

/** Hasta aquí se guarda el historial ENTERO. Provisional: el orden de un conductor o un consultor. */
export const TOPE_COMPLETA_TOKENS = 48_000;
/** Hasta aquí se guarda REDUCIDO; por encima se olvida. Provisional. */
export const TOPE_REDUCIDA_TOKENS = 40_000;
/** Lo que se conserva de lo que devolvió cada tool en la versión reducida. */
export const MAX_CARACTERES_DE_RESULTADO = 500;

/** Tokens por carácter: la misma aproximación que usa el resto del harness donde no hay medida. */
const CARACTERES_POR_TOKEN = 4;

/** Lo que se conserva de cada argumento largo de una llamada a tool (el contenido de un `write_file`, el texto de un `edit_file`). */
export const MAX_CARACTERES_DE_ARGUMENTO = 300;

type LlamadaAMensaje = { function?: { arguments?: unknown; [k: string]: unknown }; [k: string]: unknown };
type Mensaje = { role?: string; content?: unknown; reasoning_content?: unknown; tool_calls?: LlamadaAMensaje[]; [k: string]: unknown };

/**
 * Los argumentos de una llamada con los valores de texto largos recortados. Un escritor que produce cien mil
 * tokens de salida los lleva ahí (el código entero de cada `edit_file` y `write_file`), y con solo recortar lo que
 * devuelven las tools su historial seguía sin caber: la segunda prueba real lo perdió a 211 mil tokens. La ruta y
 * el resto de campos cortos se conservan, que es lo que dice QUÉ hizo. Si no se entiende el JSON, se deja.
 */
function recortarArgumentos(argumentos: unknown, max: number): unknown {
  if (typeof argumentos !== "string") return argumentos;
  try {
    const valor = JSON.parse(argumentos) as Record<string, unknown>;
    if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return argumentos;
    let cambio = false;
    const recortado = Object.fromEntries(
      Object.entries(valor).map(([k, v]) => {
        if (typeof v === "string" && v.length > max) {
          cambio = true;
          return [k, `${v.slice(0, max)}… [recortado: eran ${String(v.length)} caracteres]`];
        }
        return [k, v];
      })
    );
    return cambio ? JSON.stringify(recortado) : argumentos;
  } catch {
    return argumentos;
  }
}

const tokensDe = (mensajes: readonly unknown[]): number => Math.ceil(JSON.stringify(mensajes).length / CARACTERES_POR_TOKEN);

/**
 * El historial sin lo voluminoso: lo que devolvió cada tool se recorta (con la marca de que se recortó, para
 * que el modelo sepa que puede releerlo), los argumentos largos de sus llamadas también, y el razonamiento de
 * las vueltas viejas se quita. Lo que el especialista DIJO y a qué fichero o búsqueda apuntó cada llamada se
 * conservan. Puro.
 */
export function reducirHistorial(
  mensajes: readonly unknown[],
  maxResultado: number = MAX_CARACTERES_DE_RESULTADO,
  maxArgumento: number = MAX_CARACTERES_DE_ARGUMENTO
): unknown[] {
  return (mensajes as readonly Mensaje[]).map((m) => {
    if (m.role === "tool" && typeof m.content === "string" && m.content.length > maxResultado) {
      return { ...m, content: `${m.content.slice(0, maxResultado)}\n[recortado: eran ${String(m.content.length)} caracteres; vuelve a leerlo si lo necesitas]` };
    }
    if (m.role === "assistant") {
      const { reasoning_content: _r, ...resto } = m;
      void _r;
      if (resto.tool_calls === undefined) return resto;
      return {
        ...resto,
        tool_calls: resto.tool_calls.map((t) =>
          t.function === undefined ? t : { ...t, function: { ...t.function, arguments: recortarArgumentos(t.function.arguments, maxArgumento) } }
        ),
      };
    }
    return m;
  });
}

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
  cerrar(hilo: string, resultado: { bien: boolean; mensajes: readonly unknown[]; tokens: number }): SinMemoria | "guardada" | "guardada-reducida";
  /** Los hilos vivos se dieron por muertos (turno cortado, orquestador rehecho). La memoria se queda. */
  darPorMuertos(): void;
  /** Otra conversación: se olvida todo. */
  olvidar(): void;
}

export function crearMemoriaDeEspecialistas(topes: { completa?: number; reducida?: number } = {}): MemoriaDeEspecialistas {
  const completa = topes.completa ?? TOPE_COMPLETA_TOKENS;
  const reducida = topes.reducida ?? TOPE_REDUCIDA_TOKENS;
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
      const saneados = saldarColgadas(mensajes);
      if (tokens <= completa) {
        guardada.set(nombre, { mensajes: saneados, tokens });
        perdidas.delete(nombre);
        return "guardada";
      }
      const recortados = reducirHistorial(saneados);
      const tokensReducidos = tokensDe(recortados);
      if (tokensReducidos > reducida) {
        guardada.delete(nombre);
        perdidas.set(nombre, "olvidada-por-tope");
        return "olvidada-por-tope";
      }
      guardada.set(nombre, { mensajes: recortados, tokens: tokensReducidos });
      perdidas.delete(nombre);
      return "guardada-reducida";
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
