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
 *   descubrió aunque tenga que releer un fichero si lo necesita; y si ni reducido cabe, se queda con la VENTANA de
 *   lo más reciente (`ventanaDeHistorial`), no con nada: la primera versión olvidaba todo y borró a cuatro
 *   especialistas en una sola pasada.
 * - **Un hilo vivo por especialista**: si ya hay una encarnación corriendo (delegaciones en
 *   paralelo), la segunda arranca de cero. Una memoria no se reparte entre dos hilos vivos.
 * - **Saneada**: un hijo cortado o que acaba con una tool call sin respuesta daría un 400 del
 *   proveedor; se salda con el mismo texto que el raíz (`saldarColgadas`).
 * - **Solo si acabó BIEN**: un hijo que falló, o al que se cortó con «Detener» (su historial lleva la
 *   orden de parar y la heredaría la siguiente encarnación), no deja memoria y borra la que hubiera. Uno cortado
 *   por su PRESUPUESTO sí la deja, sin la orden de parar (`sinOrdenDePresupuesto`).
 * - **CORTA para quien maneja el aparato** (`ejecucion`: el conductor; `TOPE_CORTA_TOKENS`). Lo que devuelven sus órdenes es
 *   el ESTADO de un aparato que ya cambió, y no un fichero que sigue igual: se guarda siempre reducido, con lo devuelto
 *   más recortado (`MAX_CARACTERES_DE_RESULTADO_CORTA`), y si no cabe, la ventana. Medido en tres soportes de Maset: su
 *   memoria de reentrada era de 23 y 43 mil tokens, reenviados en cada una de sus 23-26 llamadas, y las encarnaciones que
 *   arrancaron con la reducida no repitieron ni una orden de descubrimiento (la que arrancó sin memoria, cuatro).
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
/** Hasta aquí se guarda la memoria CORTA (quien maneja el aparato), siempre reducida; por encima, la ventana. Provisional. */
export const TOPE_CORTA_TOKENS = 16_000;
/** Lo que se conserva de lo que devolvió cada orden en la memoria corta: el estado de un aparato caduca. */
export const MAX_CARACTERES_DE_RESULTADO_CORTA = 200;

/** Tokens por carácter: la misma aproximación que usa el resto del harness donde no hay medida. */
const CARACTERES_POR_TOKEN = 4;

/** A partir de cuántos caracteres un argumento de una llamada a tool (el contenido de un `write_file`, el texto de un `edit_file`) hace que esa llamada se CUENTE en vez de guardarse (`reducirHistorial`). */
export const MAX_CARACTERES_DE_ARGUMENTO = 300;

/**
 * Los ENCARGOS que un especialista hizo a otro (`create_sub_agent`) se conservan enteros hasta aquí. Son cortos y son
 * lo que necesita recordar; y recortados le enseñaban a cortar los nuevos (ver `reducirHistorial`).
 */
export const MAX_CARACTERES_DE_ENCARGO = 8_000;

type LlamadaAMensaje = { function?: { arguments?: unknown; [k: string]: unknown }; [k: string]: unknown };
type Mensaje = { role?: string; content?: unknown; reasoning_content?: unknown; tool_calls?: LlamadaAMensaje[]; [k: string]: unknown };

/**
 * El prefijo de los ids de tool call en la memoria REDUCIDA. Quitar `reasoning_content` del mensaje no basta: `@langchain/openai`
 * nunca lo manda, así que el eco (`agent/config/ecoDeRazonamiento.ts`) lo volvía a pegar por id, y DeepSeek lo cobra. Medido en
 * el ejemplo de la calculadora: el desarrollador arrancaba su segundo encargo con 109 mil de entrada cuando la memoria creía
 * mandar 38 mil. Con otro id el eco no lo encuentra. Medido contra la API (30-10-2026): delante del mensaje de usuario del
 * encargo nuevo acepta un asistente sin razonamiento y con un id que no conoce, y no lo repone ella (dentro de un mismo turno
 * sí lo repone por id: allí solo `""` lo deja fuera, pero eso no es asunto de la memoria).
 */
export const PREFIJO_DE_ID_EN_MEMORIA = "mem_";

const enMemoria = (id: unknown): unknown =>
  typeof id === "string" && id !== "" && !id.startsWith(PREFIJO_DE_ID_EN_MEMORIA) ? `${PREFIJO_DE_ID_EN_MEMORIA}${id}` : id;

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
  /**
   * Las llamadas con un argumento LARGO (el contenido de un `write_file`, el texto de un `edit_file`) NO se guardan como
   * llamadas: se CUENTAN en el texto del mensaje («escribiste /planes/x/PLAN.md, 15507 caracteres») y su respuesta se
   * quita. Ni recortadas ni con una nota en su lugar: medido en Maset, con la marca «[recortado…]» el desarrollador cortaba
   * sus encargos nuevos, y con una nota que decía «no lo copies» el analista la COPIÓ como contenido de un `PLAN.md`. El
   * modelo repite la FORMA de sus llamadas anteriores, diga lo que diga su texto: una llamada que no está no se imita.
   */
  const contadas = new Set<string>();
  const contar = (t: LlamadaAMensaje): string | undefined => {
    const nombre = t.function?.name;
    const args = t.function?.arguments;
    if (typeof args !== "string") return undefined;
    let valor: Record<string, unknown>;
    try {
      valor = JSON.parse(args) as Record<string, unknown>;
    } catch {
      return undefined;
    }
    if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return undefined;
    const tope = nombre === "create_sub_agent" ? MAX_CARACTERES_DE_ENCARGO : maxArgumento;
    const largos = Object.entries(valor).filter(([, v]) => typeof v === "string" && v.length > tope);
    if (largos.length === 0) return undefined;
    const ruta = typeof valor["file_path"] === "string" ? ` sobre ${valor["file_path"]}` : typeof valor["name"] === "string" ? ` a ${valor["name"]}` : "";
    const cuanto = largos.map(([k, v]) => `${k}: ${String((v as string).length)} caracteres`).join(", ");
    return `${String(nombre)}${ruta} (${cuanto})`;
  };
  const salida: unknown[] = [];
  for (const m of mensajes as readonly Mensaje[]) {
    if (m.role === "tool") {
      const id = (m as { tool_call_id?: unknown }).tool_call_id;
      if (typeof id === "string" && contadas.has(id)) continue;
      const conId = { ...m, tool_call_id: enMemoria(id) };
      if (typeof m.content === "string" && m.content.length > maxResultado) {
        salida.push({ ...conId, content: `${m.content.slice(0, maxResultado)}\n[recortado: eran ${String(m.content.length)} caracteres; vuelve a leerlo si lo necesitas]` });
        continue;
      }
      salida.push(conId);
      continue;
    }
    if (m.role === "assistant") {
      const { reasoning_content: _r, ...resto } = m;
      void _r;
      if (resto.tool_calls === undefined) {
        salida.push(resto);
        continue;
      }
      const quedan: LlamadaAMensaje[] = [];
      const hechas: string[] = [];
      for (const t of resto.tool_calls) {
        const contada = contar(t);
        // Con el id de la memoria (`PREFIJO_DE_ID_EN_MEMORIA`): con el suyo, el razonamiento quitado volvería por él.
        if (contada === undefined) quedan.push({ ...t, id: enMemoria(t["id"]) });
        else {
          hechas.push(contada);
          if (typeof t["id"] === "string") contadas.add(t["id"]);
        }
      }
      if (hechas.length === 0) {
        salida.push({ ...resto, tool_calls: quedan });
        continue;
      }
      const texto = typeof resto.content === "string" ? resto.content : "";
      const nota = `(Memoria del harness: aquí hiciste ${hechas.join("; ")}. El texto entero no se guarda en la memoria; si lo necesitas, vuelve a leer el fichero.)`;
      const { tool_calls: _t, ...sinLlamadas } = resto;
      void _t;
      salida.push(quedan.length === 0 ? { ...sinLlamadas, content: texto === "" ? nota : `${texto}\n${nota}` } : { ...resto, content: texto === "" ? nota : `${texto}\n${nota}`, tool_calls: quedan });
      continue;
    }
    salida.push(m);
  }
  return salida;
}

/**
 * La VENTANA: lo más reciente que cabe. Cada delegación empieza con un mensaje de usuario (el encargo o el «NUEVO
 * ENCARGO»), así que se descartan delegaciones ENTERAS, las más antiguas primero: una llamada a tool y su respuesta
 * viven dentro de la misma delegación y nunca quedan partidas. Si ni la última cabe sola, se queda con su encargo y
 * lo último que dijo el especialista, que es lo que contó que había hecho.
 *
 * Existe porque en la primera prueba larga «olvidada-por-tope» llegó a borrar la memoria de los cuatro
 * especialistas que más trabajaban, incluido lo reciente: perder lo viejo es aceptable, perder lo que acaba de
 * pasar no. Puro.
 */
export function ventanaDeHistorial(mensajes: readonly unknown[], topeTokens: number): unknown[] {
  const ms = mensajes as readonly Mensaje[];
  const inicios: number[] = [];
  ms.forEach((m, i) => {
    if (m.role === "user") inicios.push(i);
  });
  if (inicios.length === 0) return [...mensajes];
  for (let k = 0; k < inicios.length; k += 1) {
    const cola = ms.slice(inicios[k]!);
    if (tokensDe(cola) <= topeTokens) return [...cola];
  }
  // Ni la última delegación cabe sola: su encargo y lo último que dijo.
  const ultima = ms.slice(inicios[inicios.length - 1]!);
  const dichas = ultima.filter((m) => m.role === "assistant" && typeof m.content === "string" && m.content.trim() !== "");
  const cierre = dichas[dichas.length - 1];
  return cierre === undefined ? [ultima[0]!] : [ultima[0]!, cierre];
}

export interface EncarnacionPrevia {
  /** Los mensajes con los que arranca el hijo nuevo, ya saneados. */
  mensajes: unknown[];
  tokens: number;
}

/** Por qué una encarnación arranca sin memoria, para la traza. */
/** Lo que ocupa el sitio de la orden de parar en la memoria de un hijo cortado por presupuesto. */
export const NOTA_DE_ENCARGO_CORTADO =
  "[Tu encargo anterior se cortó al acabarse su presupuesto de llamadas: lo que hiciste, lo que mediste y lo que te quedaba está en tu última respuesta. Sigue desde ahí.]";

/**
 * La memoria de un hijo CORTADO POR PRESUPUESTO, sin la orden de parar (`presupuesto.ts#textoDePresupuestoAgotado`): heredada,
 * pararía al siguiente sin que nadie se lo pidiera, así que se cambia por `NOTA_DE_ENCARGO_CORTADO`. Lo demás se queda: lo que
 * leyó, escribió y probó, y su resumen forzado. Petición suya (22-10-2026): el encargo cortado era el que más contexto tenía y
 * el que lo perdía entero, y el siguiente empezaba de cero.
 */
export function sinOrdenDePresupuesto(mensajes: readonly unknown[]): unknown[] {
  // La del presupuesto y la del tope de vueltas (`presupuesto.ts#textoDeVueltasAgotadas`): heredadas, cortarían igual.
  const orden = /\[Se acabó tu (?:presupuesto de \d+ llamadas|tope de \d+ vueltas de ajuste[^.]*)\.[^\]]*\]/g;
  const limpiar = (texto: string): string => texto.replace(orden, NOTA_DE_ENCARGO_CORTADO);
  return mensajes.map((m) => {
    if (typeof m !== "object" || m === null || (m as { role?: unknown }).role !== "user") return m;
    const c = (m as { content?: unknown }).content;
    if (typeof c === "string") return { ...m, content: limpiar(c) };
    if (Array.isArray(c)) {
      return { ...m, content: c.map((p) => (typeof p === "object" && p !== null && typeof (p as { text?: unknown }).text === "string" ? { ...p, text: limpiar((p as { text: string }).text) } : p)) };
    }
    return m;
  });
}

export type SinMemoria = "primera" | "hilo-vivo" | "olvidada-por-tope" | "olvidada-por-fallo";

export interface MemoriaDeEspecialistas {
  /** Abre una encarnación de `nombre`: su memoria si la hay y se puede usar, o el motivo de no. */
  abrir(nombre: string, hilo: string, opciones?: { corta?: boolean }): { previa: EncarnacionPrevia } | { sin: SinMemoria };
  /** La encarnación `hilo` terminó: guarda su historial completo (o lo olvida si falló o pasó el tope). */
  cerrar(hilo: string, resultado: { bien: boolean; mensajes: readonly unknown[]; tokens: number }): SinMemoria | "guardada" | "guardada-reducida" | "guardada-ventana";
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
  const cortos = new Set<string>(); // hilos cuya memoria se guarda CORTA
  const perdidas = new Map<string, SinMemoria>(); // por qué no hay memoria de `nombre`
  const hayVivo = (nombre: string): boolean => [...vivos.values()].includes(nombre);
  return {
    abrir(nombre, hilo, opciones = {}) {
      const vivo = hayVivo(nombre);
      vivos.set(hilo, nombre);
      if (opciones.corta === true) cortos.add(hilo);
      if (vivo) return { sin: "hilo-vivo" };
      const previa = guardada.get(nombre);
      if (previa !== undefined) return { previa };
      return { sin: perdidas.get(nombre) ?? "primera" };
    },
    cerrar(hilo, { bien, mensajes, tokens }) {
      const nombre = vivos.get(hilo);
      if (nombre === undefined) return "primera";
      vivos.delete(hilo);
      const corta = cortos.delete(hilo);
      if (!bien) {
        guardada.delete(nombre);
        perdidas.set(nombre, "olvidada-por-fallo");
        return "olvidada-por-fallo";
      }
      const saneados = saldarColgadas(mensajes);
      if (corta) {
        const recortados = reducirHistorial(saneados, MAX_CARACTERES_DE_RESULTADO_CORTA);
        const cabe = tokensDe(recortados) <= TOPE_CORTA_TOKENS;
        const guardar = cabe ? recortados : saldarColgadas(ventanaDeHistorial(recortados, TOPE_CORTA_TOKENS));
        guardada.set(nombre, { mensajes: guardar, tokens: tokensDe(guardar) });
        perdidas.delete(nombre);
        return cabe ? "guardada-reducida" : "guardada-ventana";
      }
      if (tokens <= completa) {
        guardada.set(nombre, { mensajes: saneados, tokens });
        perdidas.delete(nombre);
        return "guardada";
      }
      const recortados = reducirHistorial(saneados);
      const tokensReducidos = tokensDe(recortados);
      if (tokensReducidos <= reducida) {
        guardada.set(nombre, { mensajes: recortados, tokens: tokensReducidos });
        perdidas.delete(nombre);
        return "guardada-reducida";
      }
      // Ni reducido cabe: la ventana con lo más reciente, en vez de olvidarlo todo.
      const ventana = ventanaDeHistorial(recortados, reducida);
      guardada.set(nombre, { mensajes: saldarColgadas(ventana), tokens: tokensDe(ventana) });
      perdidas.delete(nombre);
      return "guardada-ventana";
    },
    darPorMuertos() {
      vivos.clear();
      cortos.clear();
    },
    olvidar() {
      guardada.clear();
      vivos.clear();
      cortos.clear();
      perdidas.clear();
    },
  };
}
