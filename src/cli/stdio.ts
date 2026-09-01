import * as readline from "node:readline";
import type { Piel } from "../core/turno.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import type { Preguntar } from "./aprobar.js";
import { crearTema, type Tema } from "./tema.js";
import { RenderizadorDeMarkdown, puntoSeguro } from "./markdown.js";
import { AnimadorDeFase } from "./spinner.js";
import { PanelDeAvisos } from "./panel.js";

/** Escribe SIN añadir salto de línea. La implementación real hace flush. */
export type Escribir = (texto: string) => void;

/**
 * Por debajo de esto, un párrafo que aún no ha visto su `\n` puede esperar: fluye al
 * confirmarse la línea. Por encima, se corta por un punto seguro (`puntoSeguro`) para
 * que el streaming siga vivo en los párrafos largos.
 */
const MINIMO_DE_FLUJO = 80;

/**
 * La piel de terminal.
 *
 * El streaming del asistente se suelta por LÍNEA CONFIRMADA (y, en párrafos largos, por
 * cortes que no rompen marcadores), y no por trozo: una consola que NO repinta solo
 * puede escribir una línea cuando su texto es definitivo — un `**` partido entre dos
 * escrituras queda literal para siempre. Sigue siendo streaming: la línea confirmada
 * se pinta en el acto, y un colchón que solo se suelta al final sería un `ainvoke`
 * disfrazado.
 *
 * Las otras dos cosas medidas, con el mismo síntoma (el streaming no se ve) y causas
 * distintas:
 *
 * 1. **`flush` explícito** (en `escribirEnStdout`). Sin él la salida se queda en el
 *    buffer y no aparece hasta que se vacía sola — un fallo que solo se manifiesta en
 *    procesos de larga duración, o sea justo en el caso de uso real.
 * 2. **Un solo `escribir` por línea confirmada**: juntar trozos en un buffer y volcar
 *    al final también evita frases partidas, pero deja de ser streaming.
 */
export function crearPielStdio(
  escribir: Escribir,
  tema: Tema = crearTema(process.stdout.isTTY === true)
): Piel {
  const render = new RenderizadorDeMarkdown(tema);
  let colchon = "";
  let inicioDeLinea = true;

  // El panel de avisos: las notificaciones de sistema viven en un recinto de hasta 5
  // líneas grises que se recicla en sitio, y solo la última queda en el historial. Sin
  // color (pipe, CI) no se instala: el motor cae en las líneas estáticas de siempre y
  // la salida es la de siempre. El disparador de su colapso es esta `firme` — la misma
  // cascada del spinner, por la misma razón: solo una cosa viva al fondo.
  const conPanel = tema.mudo !== "";
  const panel = new PanelDeAvisos(escribir, tema);
  const avisosDelCierre: string[] = [];

  // El spinner de fase: anima la ÚLTIMA línea mientras una fase dura. La cascada es
  // esta `firme`: CUALQUIER otra escritura termina el spinner primero — así solo hay
  // una línea viva al fondo, y el historial queda con la fase como línea estática.
  const animador = new AnimadorDeFase(escribir, tema);
  const firme = (t: string): void => {
    if (conPanel) {
      panel.solidifica();
      // Lo que el panel ya solidificó con contenido real queda en el historial; no
      // vuelve a salir en la fusión del fin.
      avisosDelCierre.length = 0;
    }
    animador.termina();
    escribir(t);
  };

  const volcar = (linea: string, inicio: boolean, conSalto: boolean): void => {
    firme(render.linea(linea, inicio) + (conSalto ? "\n" : ""));
  };

  return {
    token: (texto) => {
      colchon += texto;
      // Las líneas confirmadas se sueltan enteras y en el acto.
      while (true) {
        const salto = colchon.indexOf("\n");
        if (salto === -1) break;
        volcar(colchon.slice(0, salto), inicioDeLinea, true);
        colchon = colchon.slice(salto + 1);
        inicioDeLinea = true;
      }
      // Párrafo largo sin `\n` a la vista: fluir por un corte que no rompa marcadores.
      // **Sin salto final**: la continuación sigue en la MISMA línea de terminal — un
      // salto aquí partiría el párrafo en líneas de la longitud del corte. Y
      // `inicioDeLinea` baja a false para que la continuación no se mire como cabecera
      // ni viñeta: ya no empieza línea.
      const corte = puntoSeguro(colchon, MINIMO_DE_FLUJO);
      if (corte !== undefined) {
        volcar(colchon.slice(0, corte), inicioDeLinea, false);
        colchon = colchon.slice(corte);
        inicioDeLinea = false;
      }
    },
    cerrarLinea: () => {
      // Lo que quede en el colchón es el final de la última línea. Si el mensaje acabó
      // justo en un salto, no hay nada que añadir: esa línea ya se escribió entera.
      if (colchon !== "") volcar(colchon, inicioDeLinea, true);
      colchon = "";
      inicioDeLinea = true;
    },
    linea: (texto) => firme(`  ${texto}\n`),
    /**
     * La fase, animada: sin TTY el propio animador escribe la línea estática de
     * siempre y no arranca nada.
     */
    fase: (texto) => animador.empieza(texto),
    /**
     * Con panel, la pausa entra en él y se solidifica EN EL ACTO: lo que sigue no es
     * salida de la piel, es el bloque de aprobación (`pedirDecisiones` escribe por su
     * lado), y el panel no puede quedar colgando encima de una decisión.
     */
    pausa: (pendientes: PendienteDeAprobacion[]) => {
      // Quien pinta el detalle de cada pendiente (origen, descripción, fichero) es
      // `pedirDecisiones`, al preguntar una a una. Aquí sería redundante, y el viejo
      // «responde: approve / reject» además mentía: `interpretAnswer` acepta
      // s/si/sí/y/yes, no esas palabras.
      // En el modo de un disparo lo que sigue a la pausa NO es la respuesta del usuario:
      // es la aprobación, que conduce `pedirDecisiones`. Decir «lo siguiente que escribas
      // es la respuesta» sería mentira y despistaría justo en el paso delicado.
      const texto = `(turno pausado: ${pendientes.length} aprobación(es) pendiente(s))`;
      if (conPanel) {
        panel.avisa(texto);
        panel.solidifica();
      } else {
        firme(`\n${texto}\n`);
      }
    },
    /**
     * Con panel, el fin FUSIONA los avisos pendientes y el tiempo en UNA línea: es la
     * «última» que solidifica, y así el aviso de honestidad no se lo lleva por delante
     * el tiempo final. Sin panel, la línea de siempre.
     */
    fin: (ms) => {
      if (conPanel) {
        panel.avisa([...avisosDelCierre, `(${(ms / 1000).toFixed(1)}s)`].join(" · "));
        avisosDelCierre.length = 0;
        panel.solidifica();
      } else {
        firme(`\n(${(ms / 1000).toFixed(1)}s)\n`);
      }
    },
    ...(conPanel
      ? {
          notificacion: (texto: string): void => {
            panel.avisa(texto);
            avisosDelCierre.push(texto);
          },
        }
      : {}),
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
 *
 * **Si el rl ya está cerrado (o se cierra a media pregunta), resuelve con cadena vacía
 * y no lanza.** Es el EOF de un pipe que se agota mientras el turno corre — medido en
 * e2e: la aprobación pregunta 20 segundos después de que stdin hiciera EOF, y el
 * `readline was closed` abortaba el turno con el interrupt colgado. Y la cadena vacía
 * es lo correcto además de lo seguro: `interpretAnswer` sin un «s» explícito RECHAZA.
 * Mismo pacto que `leerSecreto` con su `alCerrar`.
 */
export function crearPreguntar(rl: readline.Interface): Preguntar {
  // `rl.closed` existe en runtime pero no está en los tipos de esta versión de
  // @types/node — mismo caso que `rl.history` abajo, y mismo cast justificado.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cerrado = (): boolean => (rl as any).closed === true;
  return (pregunta: string) =>
    new Promise<string>((resolver) => {
      const alCerrar = (): void => resolver("");
      rl.once("close", alCerrar);
      if (cerrado()) {
        rl.off("close", alCerrar);
        resolver("");
        return;
      }
      rl.question(pregunta, (respuesta: string) => {
        rl.off("close", alCerrar);
        resolver(respuesta);
      });
    });
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