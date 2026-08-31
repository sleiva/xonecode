import * as readline from "node:readline";
import type { Piel } from "../core/turno.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import type { Preguntar } from "./aprobar.js";

/** Escribe SIN añadir salto de línea. La implementación real hace flush. */
export type Escribir = (texto: string) => void;

/**
 * La piel de terminal.
 *
 * Dos cosas medidas, las dos con el mismo síntoma (el streaming no se ve) y causas
 * distintas:
 *
 * 1. **Un `escribir` por trozo, sin salto.** Juntar los trozos en un buffer y volcarlos al
 *    final también evita que la frase salga partida en una línea por trozo, pero **deja de
 *    ser streaming**: convierte esto en un `ainvoke` disfrazado y el usuario no ve nada
 *    hasta que el turno acaba. El ritmo de aparición ES el punto.
 * 2. **`flush` explícito** (en `escribirEnStdout`). Sin él la salida se queda en el buffer
 *    y no aparece hasta que se vacía sola — un fallo que solo se manifiesta en procesos de
 *    larga duración, o sea justo en el caso de uso real.
 */
export function crearPielStdio(escribir: Escribir): Piel {
  return {
    token: (texto) => escribir(texto),
    cerrarLinea: () => escribir("\n"),
    linea: (texto) => escribir(`  ${texto}\n`),
    pausa: (pendientes: PendienteDeAprobacion[]) => {
      // Quien pinta el detalle de cada pendiente (origen, descripción, fichero) es
      // `pedirDecisiones`, al preguntar una a una. Aquí sería redundante, y el viejo
      // «responde: approve / reject» además mentía: `interpretAnswer` acepta
      // s/si/sí/y/yes, no esas palabras.
      // En el modo de un disparo lo que sigue a la pausa NO es la respuesta del usuario:
      // es la aprobación, que conduce `pedirDecisiones`. Decir «lo siguiente que escribas
      // es la respuesta» sería mentira y despistaría justo en el paso delicado.
      escribir(`\n(turno pausado: ${pendientes.length} aprobación(es) pendiente(s))\n`);
    },
    fin: (ms) => escribir(`\n(${(ms / 1000).toFixed(1)}s)\n`),
  };
}

/**
 * El `escribir` de producción. El `flush` es implícito en Node —`process.stdout.write`
 * escribe ya—, pero se pasa por aquí para que exista UN solo sitio que cambiar si algún
 * día hace falta forzarlo.
 */
export const escribirEnStdout: Escribir = (texto) => {
  process.stdout.write(texto);
};

/**
 * El `preguntar` de producción para la consola: usa el ÚNICO `readline.Interface`
 * compartido con el lazo de líneas y con `leerSecreto`. Tres lectores de stdin no pueden
 * competir por sus eventos `data`; con un solo `rl`, `rl.question` se intercala sin
 * robarle líneas al `for await` del lazo (es readline quien arbitra internamente).
 */
export function crearPreguntar(rl: readline.Interface): Preguntar {
  return (pregunta: string) => new Promise<string>((resolver) => rl.question(pregunta, resolver));
}

/**
 * `leerSecreto` de producción (para `/provider <nombre>`): mismo `rl` que el lazo y
 * `preguntar`, con el eco apagado mientras dura la pregunta.
 *
 * **No hay API pública de readline para silenciar el eco por tecla manteniendo la edición
 * de línea** (backspace, etc.): la única costura es `_writeToOutput`, un método interno y
 * no documentado — verificado contra Node 22 (existe, y es la vía que usan las
 * herramientas de terminal que piden contraseña sin librería aparte). Se sustituye para
 * dejar pasar SOLO el propio prompt (para que se vea la pregunta) y silenciar cualquier
 * otra escritura —el eco de cada tecla— hasta que la pregunta termine. `rl.history`
 * tampoco está en los tipos de esta versión de @types/node aunque existe en runtime
 * (documentado desde Node 15.8), así que comparte el mismo cast justificado.
 *
 * Se restaura SIEMPRE, y por DOS vías, porque un terminal que se queda sin eco obliga al
 * usuario a cerrarlo:
 *   1. En el callback de `rl.question`: el camino normal.
 *   2. En un `close` de `rl` a media pregunta (Ctrl-D/EOF sin dar línea): sin esto la
 *      promesa no se resuelve nunca y el manejador de `/provider` se queda colgado para
 *      siempre dentro del lazo de la consola.
 *
 * Y se borra la clave de `rl.history` tras leerla: readline añade la respuesta de
 * `question` al historial igual que cualquier línea, y una flecha-arriba la recuperaría
 * en claro en la MISMA sesión.
 */
export function crearLeerSecreto(rl: readline.Interface): (pregunta: string) => Promise<string> {
  return (pregunta: string) =>
    new Promise<string>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rlAny = rl as any;
      const escribirOriginal: (cadena: string) => void = rlAny._writeToOutput.bind(rlAny);
      let restaurado = false;
      const restaurar = (): void => {
        if (restaurado) return;
        restaurado = true;
        rlAny._writeToOutput = escribirOriginal;
        rl.off("close", alCerrar);
      };
      const alCerrar = (): void => {
        restaurar();
        resolve("");
      };
      rl.once("close", alCerrar);
      rlAny._writeToOutput = (cadena: string): void => {
        if (cadena === pregunta) escribirOriginal(cadena);
      };
      rl.question(pregunta, (respuesta: string) => {
        restaurar();
        // El eco muteado se comió el '\r\n' que readline escribe al aceptar la línea: sin
        // esto, la salida siguiente aparecería pegada a la pregunta.
        escribirOriginal("\n");
        const indice = (rlAny.history as string[]).indexOf(respuesta);
        if (indice !== -1) (rlAny.history as string[]).splice(indice, 1);
        resolve(respuesta);
      });
    });
}