/**
 * Del log crudo de un aparato a hallazgos que el bucle de reparación pueda comparar.
 *
 * **POR QUÉ EXISTE, medido sobre AppDemo en un `pixel8` real**: el log del host recién
 * arrancado son 29 líneas de las que UNA es de la app; tras hacer login, 27 líneas de las que
 * 23 son suyas y, al deduplicar, **cinco hallazgos distintos** (`Invalid resource ID` ×10, ×7,
 * ×2, ×2, ×2). Pasarle eso crudo a un modelo es darle veintitantas líneas de las que la mayoría
 * son la misma, más Android quejándose de sí mismo.
 *
 * TRES TRANSFORMACIONES, Y LAS TRES SON DE FORMA — ninguna dice qué hacer:
 *
 *  1. **Quitar fecha, pid y tid.** No es higiene: es lo que hace que haya HUELLA. El pid cambia
 *     en cada arranque de la app, así que sin quitarlo dos vueltas del mismo error son dos
 *     huellas distintas y la guarda de «no progreso» de `turnoReal.ts#conVerificacion` —lo
 *     único que impide que el bucle dé vueltas para siempre— no puede comparar nada.
 *  2. **Deduplicar, contando.** Diez veces el mismo error no son diez hechos. El `veces` se
 *     conserva porque sí dice algo (un error que sale diez veces al pintar una pantalla es otra
 *     cosa que uno que sale una vez), pero no multiplica el texto.
 *  3. **ORDENAR lo de la plataforma detrás, y CONTARLO. Nunca descartarlo.** Esto es una
 *     decisión explícita y no un descuido: una lista negra de etiquetas escrita a fuego
 *     esconde, el día que el fallo de verdad salga por `HWUI`, la única línea que lo explica —
 *     y no hay forma de enterarse. Es el patrón de las «colecciones huérfanas» que este repo ya
 *     midió y tiró: una señal equivocada no se arregla con un aviso al pie. Así que aquí no se
 *     filtra, se PRIORIZA, y lo que queda detrás se cuenta, que es la regla de la casa: «lo que
 *     falta se ROTULA; lo que queda fuera se CUENTA».
 *
 * Y se acaba aquí. Lo que el modelo haga con los hallazgos es suyo: este módulo decide qué VE
 * y cuándo se puede decir que no avanza, no qué piensa ni por dónde empieza.
 */
import type { HallazgoDelTurno } from "./events.js";

/**
 * El `code` con el que estos hallazgos entran en el bucle.
 *
 * Uno solo y no uno por mensaje: el `code` de un hallazgo del simulador es un identificador
 * ESTABLE de familia (`REF_JS_COLL_MISSING`) y el texto va en `mensaje`. Aquí la familia es
 * «lo que el aparato dijo al arrancar la app», y el mensaje es el que distingue.
 */
export const ETIQUETA_DE_ARRANQUE = "DISPOSITIVO_ARRANQUE";

/**
 * El prefijo de `adb logcat -v threadtime`: `MM-DD HH:MM:SS.mmm  PID  TID  N `, donde `N` es
 * el NIVEL.
 *
 * La fecha, el pid y el tid se van. El nivel se captura: lo pone quien escribió la línea, así
 * que es la única clasificación de importancia que no es una opinión nuestra.
 */
const PREFIJO = /^\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+\s+\d+\s+\d+\s+([VDIWEF])\s+/;

/**
 * Del nivel de logcat a la severidad del harness.
 *
 * `F` (fatal) y `E` son errores; `W` es aviso; `V`, `D` e `I` son información. **No se
 * DESCARTA nada** —es la condición que gobierna este módulo— pero solo los errores entran en
 * la huella, exactamente como en `turnoReal.ts#conVerificacion`: «un aviso que va y viene no
 * dice nada de si el error se está arreglando».
 *
 * Y eso no es cosmética: MEDIDO contra el aparato, dos arranques seguidos de la misma app dan
 * líneas `I` y `D` distintas —`Choreographer: Skipped 75 frames` contra `Skipped 33`,
 * `Compiler allocated 5250KB`, ciclos del replicador que solo salen a veces—. Con ellas
 * dentro, la huella cambiaba entre dos vueltas idénticas y la guarda de «no progreso» no
 * habría cortado nunca.
 */
const SEVERIDAD_DE_NIVEL = {
  F: "error",
  E: "error",
  W: "warning",
  I: "info",
  D: "info",
  V: "info",
} as const;

/**
 * El cuerpo de una traza de Java, que NO lleva nivel en cada línea.
 *
 * Se arrastra con la severidad de la línea que la encabeza: partir una excepción en un error
 * y cuatro huérfanas dejaría fuera de la huella justo la parte que la identifica.
 */
const CUERPO_DE_TRAZA = /^\s*(at [\w$.]+\(|Caused by:|\.{3} \d+ more)/;

/** La cabecera que pone `xone-log-android`, que no es una línea del log. */
const CABECERA = /^---/;

/**
 * Lo que es de ANDROID y no de la app.
 *
 * Es una clave de ORDENACIÓN, nunca un descarte (ver la cabecera del módulo). Son las
 * etiquetas que salieron en la medida real sin tener nada que ver con el proyecto: el
 * cargador de clases, Firebase sin configurar, el renderizador, el gesto de «atrás», los
 * avisos de reflexión del propio Android y el Chromium del WebView.
 */
const DE_LA_PLATAFORMA =
  /\b(ziparchive|FirebaseApp|DynamiteModule|ProviderInstaller|HWUI|WindowOnBackDispatcher|chromium|ActivityThread|ApkAssets|OpenGLRenderer)\b|Accessing hidden (method|field)|Cleared Reference was only reachable/;

export interface HallazgoDeDispositivo {
  /** La línea ya sin fecha, sin pid y sin tid: esto es lo que se compara. */
  mensaje: string;
  /** Cuántas veces salió la MISMA línea. */
  veces: number;
  /** Falso para lo que es del sistema y no del proyecto. Ordena, no filtra. */
  deLaApp: boolean;
  /** La que dijo el propio log, degradada si la línea es de la plataforma. */
  severidad: "error" | "warning" | "info";
}

export interface LecturaDeLog {
  /** Todos, los de la app primero. Nada se ha tirado. */
  hallazgos: HallazgoDeDispositivo[];
  /** Cuántos de los de arriba son de la plataforma, para poder DECIRLO. */
  plataforma: number;
  /** La traducción a lo que `conVerificacion` ya consume. */
  aHallazgosDelTurno(): HallazgoDelTurno[];
}

export function hallazgosDeLog(texto: string): LecturaDeLog {
  const cuenta = new Map<string, HallazgoDeDispositivo>();
  /** El nivel de la última línea con nivel, para las continuaciones de una traza. */
  let nivelArrastrado: keyof typeof SEVERIDAD_DE_NIVEL = "I";
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trimEnd();
    if (l.trim() === "" || CABECERA.test(l)) continue;
    const con = PREFIJO.exec(l);
    if (con !== null) nivelArrastrado = con[1] as keyof typeof SEVERIDAD_DE_NIVEL;
    else if (!CUERPO_DE_TRAZA.test(l)) nivelArrastrado = "I";
    const mensaje = l.replace(PREFIJO, "").trim();
    if (mensaje === "") continue;
    const previo = cuenta.get(mensaje);
    if (previo === undefined) {
      const deLaApp = !DE_LA_PLATAFORMA.test(mensaje);
      cuenta.set(mensaje, {
        mensaje,
        veces: 1,
        deLaApp,
        /**
         * **Lo de la plataforma nunca es ERROR, aunque el log diga `E`.** Un
         * `E chromium: Seed missing signature` es un error de verdad — de Android, no de la
         * app— y nadie lo arregla desde un `.xne`. Como error dejaría el bucle sin poder
         * cerrar jamás. Se ve, con su severidad rebajada; no bloquea.
         */
        severidad: deLaApp
          ? SEVERIDAD_DE_NIVEL[nivelArrastrado]
          : SEVERIDAD_DE_NIVEL[nivelArrastrado] === "error"
            ? "warning"
            : SEVERIDAD_DE_NIVEL[nivelArrastrado],
      });
    } else {
      previo.veces += 1;
    }
  }

  // Los de la app delante; dentro de cada grupo, los que más se repiten primero. El orden es
  // ESTABLE (`Map` conserva la inserción y `sort` de V8 es estable), así que dos lecturas del
  // mismo log dan la misma lista — que es media huella.
  const peso = { error: 0, warning: 1, info: 2 } as const;
  const hallazgos = [...cuenta.values()].sort((a, b) => {
    if (peso[a.severidad] !== peso[b.severidad]) return peso[a.severidad] - peso[b.severidad];
    if (a.deLaApp !== b.deLaApp) return a.deLaApp ? -1 : 1;
    return b.veces - a.veces;
  });
  const plataforma = hallazgos.filter((h) => !h.deLaApp).length;

  return {
    hallazgos,
    plataforma,
    /**
     * **Solo lo de la app es ERROR.** Un `Accessing hidden method` de Android entraría en la
     * huella como error, y entonces el bucle se declararía rojo por algo que nadie puede
     * arreglar desde un `.xne` — y no cerraría nunca. Va como `warning`: se ve, no bloquea.
     *
     * Sin `fichero` ni `linea`, y eso es honestidad: el log no los dice. Un fichero adivinado
     * mandaría al agente a abrir el que no es.
     */
    aHallazgosDelTurno: () =>
      hallazgos.map((h) => ({
        code: ETIQUETA_DE_ARRANQUE,
        severidad: h.severidad,
        mensaje: h.veces === 1 ? h.mensaje : `${h.mensaje} (×${h.veces})`,
      })),
  };
}

/**
 * La huella de una lectura, con el MISMO formato que la de `conVerificacion`
 * (`code|fichero|linea`), para que las dos sean intercambiables en la misma guarda.
 *
 * Solo los de la app: un aviso de la plataforma que va y viene no dice nada de si el error se
 * está arreglando — la misma razón por la que allí la huella son los ERRORES y no todos los
 * hallazgos. El `mensaje` entra en la huella porque aquí el `code` es uno solo: sin él, dos
 * excepciones distintas darían la misma huella y el bucle se creería atascado.
 */
export function huellaDeHallazgos(hallazgos: readonly HallazgoDeDispositivo[]): string {
  return hallazgos
    .filter((h) => h.severidad === "error")
    .map((h) => `${ETIQUETA_DE_ARRANQUE}|${h.mensaje}|`)
    .sort()
    .join("\n");
}
