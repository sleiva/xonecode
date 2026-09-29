import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { TokenTracker } from "../../vendor/tokenTracking.js";
import type { ParametrosSeguros } from "./resumenDeTool.js";
import type { OrigenDeTool } from "./puente.js";

/**
 * Activa una traza local. Esta variable, por sí sola, sigue siendo la única palanca de este
 * módulo — nunca se cablea nada aquí. Que valga "1" por OMISIÓN en una sesión normal (mientras
 * dure esta etapa de pruebas) es una decisión de `Settings.depurar`, resuelta fuera de este
 * fichero por `agent/turno/depuracion.ts#entornoConDepuracion` antes de que el `entorno` llegue
 * a `crearDiagnosticoDeTools`.
 */
export const VARIABLE_TRAZA_TOOLS = "XONECODE_TRACE_TOOLS";
export const NOMBRE_TRAZA_TOOLS = "traza-tools.jsonl";

/** Cuánto de un encargo se guarda en la traza. Lo demás se cuenta en `chars`, no se guarda. */
export const TOPE_DEL_ENCARGO_EN_TRAZA = 2000;

export interface UsoDeModelo {
  input: number;
  output: number;
  cache: number;
  llamadas: number;
  contexto: number;
  /**
   * Cuántos de los `output` fueron RAZONAMIENTO. **Opcional y ausente-no-es-cero**: un proveedor que no lo
   * declara no piensa cero tokens, simplemente no lo dice, y un cero inventado se leería como «este agente
   * no razona». Existe porque la salida mezcla razonamiento, texto y llamadas a tools, y sin separarlos no
   * se puede decidir dónde bajar el esfuerzo.
   */
  razonamiento?: number;
}

export interface DiagnosticoDeTools {
  modelo(origen: string, uso: UsoDeModelo): void;
  /**
   * Un especialista al que se le agotó el presupuesto de llamadas.
   *
   * **OPCIONAL**, como los métodos nuevos de `Piel`: así ningún doble de los tests se rompe por
   * existir esto, y quien no lo implemente sigue funcionando igual.
   *
   * Existe porque un corte era INDISTINGUIBLE de un agente que termina: la traza decía «15
   * llamadas» en los dos casos. Eso costó una sesión entera de diagnóstico equivocado —se leyó
   * como un fallo de enrutado lo que era el tope cortando— y es el tipo de dato que solo se
   * echa de menos cuando ya te ha engañado.
   */
  corte?(origen: string, limite: number): void;
  /**
   * `origen` distingue el orquestador de un especialista, y es EXACTO (sale del namespace del
   * stream, ver `puente.ts#esDelPadre`). No dice CUÁL especialista: sus segmentos son ids
   * opacos. Dos cubos ciertos en vez de cinco dudosos.
   */
  herramienta(nombre: string, detalle: string | undefined, parametros: ParametrosSeguros | undefined, tracker: TokenTracker, origen?: OrigenDeTool, respuesta?: string, agente?: string): void;
  /**
   * **Quién le pide qué a quién.** Opcional, como `corte`: una delegación del orquestador a un especialista,
   * con el ENCARGO. Existe porque la traza decía «un especialista» y no cuál, y de lo que el orquestador
   * pedía solo dejaba una huella: al analizar cuántas pasadas gasta una tarea, la pregunta es qué pidió a
   * quién y qué hizo cada uno con ello.
   *
   * **Es lo único de la traza que lleva TEXTO LIBRE**, y por eso está acotado: recortado a
   * `TOPE_DEL_ENCARGO_EN_TRAZA` caracteres y solo con la traza encendida. La traza es un fichero local
   * bajo `.xonecode/` —no viaja por el cable, no entra en git ni sube a CloudStudio—, pero un encargo
   * puede citar contenido del proyecto, así que quien enciende «Depurar» tiene que saber que queda escrito.
   */
  delegacion?(de: string, a: string, encargo: string): void;
  /**
   * La memoria de un especialista en la sesión (`memoriaDeEspecialistas.ts`): con cuántos tokens de su
   * conversación anterior arrancó una encarnación, o por qué arrancó sin memoria, y qué se hizo con la
   * suya al terminar. Opcional, como `corte`. Es lo que permite comparar una pasada con y sin ella.
   */
  memoria?(agente: string, evento: "arranca-con" | "arranca-sin" | "cierra", dato: string, tokens?: number): void;
  /**
   * **Cuánto METIÓ en el contexto lo que devolvió una tool.** Opcional, como `corte`.
   *
   * Contar llamadas no dice a donde van los tokens: dos `read_file` son dos líneas iguales y
   * pueden ser doscientos caracteres o veinte mil. Van los CARACTERES y nunca el contenido, y
   * no se convierten a tokens — la razón cambia con el modelo y con lo que haya dentro, así
   * que una cifra de tokens aquí sería una precisión inventada.
   */
  resultado?(nombre: string | undefined, detalle: string | undefined, chars: number): void;
  /**
   * **Las cifras de un turno según NOSOTROS y según el motor**, y en qué difieren. Opcional, como
   * `corte`: solo TrueForge lleva cuentas propias con las que contrastar
   * (`motores/trueforge/metricasTrueforge.ts`). Es diagnóstico: una diferencia es una cuenta que
   * se pierde en un lado, y sin esto no había forma de verla.
   */
  contraste?(contraste: {
    nuestras: { entrada: number; salida: number; cache: number; llamadas: number };
    motor: Record<string, number>;
    externos: number;
    diferencias: string[];
  }): void;
}

/** Ruta pública solo para comunicar al usuario dónde quedó su diagnóstico. */
export function rutaTrazaDeTools(raiz: string): string {
  return join(raiz, ".xonecode", NOMBRE_TRAZA_TOOLS);
}

/**
 * Crea un registro append-only de costes y calls, con solo argumentos de una
 * lista blanca; nunca incluye contenido de tools.
 *
 * JSONL permite analizar una sesión grande sin tener que cargarla entera. Es
 * deliberadamente síncrono: son registros minúsculos de un modo de diagnóstico
 * y así no se pierde la última llamada si el usuario cancela el proceso.
 */
export function crearDiagnosticoDeTools(
  raiz: string,
  entorno: NodeJS.ProcessEnv = process.env,
  chat?: string | (() => string | undefined)
): DiagnosticoDeTools | undefined {
  if (entorno[VARIABLE_TRAZA_TOOLS] !== "1") return undefined;

  const ruta = rutaTrazaDeTools(raiz);
  const sesion = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // `sesion` es la APERTURA (un id aleatorio por construcción de la sesión), no el chat: una
  // conversación reabierta tiene varias. `chat` es el id de la conversación —el `thread_id`—
  // y es lo que permite exportar la traza de UN chat (`core/paqueteDeSoporte.ts`). Opcional:
  // el terminal y `run --real` no tienen conversación con id. Puede ser una FUNCIÓN, que se lee
  // en cada línea, para quien lo sepa más tarde que al construir.
  const delChat = (): { chat?: string } => {
    let id: string | undefined;
    try {
      id = typeof chat === "function" ? chat() : chat;
    } catch {
      // La primera línea se escribe al construir, y quien pasa la función puede declarar su
      // `hilo` después (zona muerta temporal): esa línea sale sin `chat`, no tumba la sesión.
      id = undefined;
    }
    return id === undefined ? {} : { chat: id };
  };
  const escribir = (evento: Record<string, unknown>): void => {
    try {
      mkdirSync(join(raiz, ".xonecode"), { recursive: true });
      appendFileSync(ruta, `${JSON.stringify({ v: 1, sesion, ...delChat(), at: new Date().toISOString(), ...evento })}\n`, "utf8");
    } catch {
      // Diagnosticar no puede impedir que el agente responda. La traza es una
      // comodidad local, no parte del camino de ejecución del turno.
    }
  };

  escribir({ tipo: "sesion" });
  return {
    modelo(origen, uso) {
      escribir({ tipo: "modelo", origen, ...uso });
    },
    corte(origen, limite) {
      escribir({ tipo: "corte", origen, limite });
    },
    contraste(c) {
      escribir({ tipo: "contraste", ...c });
    },
    resultado(nombre, detalle, chars) {
      escribir({
        tipo: "resultado",
        ...(nombre === undefined ? {} : { nombre }),
        ...(detalle === undefined ? {} : { detalle }),
        chars,
      });
    },
    memoria(agente, evento, dato, tokens) {
      escribir({ tipo: "memoria", agente, evento, dato, ...(tokens === undefined ? {} : { tokens }) });
    },
    delegacion(de, a, encargo) {
      escribir({
        tipo: "delegacion",
        de,
        a,
        chars: encargo.length,
        encargo: encargo.length > TOPE_DEL_ENCARGO_EN_TRAZA ? `${encargo.slice(0, TOPE_DEL_ENCARGO_EN_TRAZA)}…` : encargo,
      });
    },
    herramienta(nombre, detalle, parametros, tracker, origen, respuesta, agente) {
      escribir({
        tipo: "tool",
        nombre,
        ...(origen === undefined ? {} : { origen }),
        ...(agente === undefined ? {} : { agente }),
        ...(respuesta === undefined ? {} : { respuesta }),
        ...(detalle === undefined ? {} : { detalle }),
        ...(parametros === undefined ? {} : { parametros }),
        inputAcumulado: tracker.input,
        outputAcumulado: tracker.output,
        llamadasModelo: tracker.calls,
      });
    },
  };
}
