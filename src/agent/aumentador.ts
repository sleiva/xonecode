/**
 * El AUMENTADOR: convierte la frase de una persona en un encargo que una tarea autónoma
 * pueda ejecutar sola.
 *
 * **Por qué existe, y no es cosmético** (§7 del diseño): es lo que hace que
 * «esperando feedback» sea raro en vez de constante. Una tarea autónoma que arranca de una
 * frase ambigua se bloquea enseguida; una que arranca de un encargo revisado, no. Y en una
 * tarea que va a escribir sin nadie delante, ejecutar algo que nadie ha leído es justo lo que
 * la aprobación existía para evitar — así que el encargo **se le enseña a la persona para que
 * lo edite antes de encolar**, y ese paso es el que ocupa el sitio del diff.
 *
 * Tres reglas, y la tercera es la que gobierna el prompt:
 * - **Entra por PUERTO** (`core/ports.ts#AumentadorPort`) con un `invocar` inyectado, así
 *   que `npm test` no le pregunta a ningún modelo. La producción monta `invocarParaAumentar`.
 * - **Usa el papel `trabajo`**, no `rapido`: es una tarea de REDACCIÓN con el proyecto
 *   delante, no una clasificación.
 * - **El encargo describe un trabajo que se hace ENTERO sin volver a preguntar** — §0 del
 *   diseño: una tarea aplica sus escrituras y la autorización fue el acto de crearla. Un
 *   encargo redactado con un paso de aprobación humana por medio describe algo que no existe,
 *   y el agente se quedaría esperando a alguien que no está.
 *
 * Y **el fallo es recuperable por diseño**: `ErrorDelAumentador` es un fallo del ENTORNO, y
 * quien lo recoge encola la tarea con el texto original y lo dice. Perder lo que una persona
 * acaba de escribir porque un modelo no contestó sería lo peor que puede hacer esa ventana.
 */
import type { AumentadorPort, ModelosPort, Papel, PeticionDeTarea } from "../core/ports.js";
import { textoDe } from "./puente.js";

/** El papel del aumentador. Redacción con el proyecto delante: `trabajo`. */
export const PAPEL_DEL_AUMENTADOR: Papel = "trabajo";

/**
 * Cuánto encargo se guarda.
 *
 * De este texto salen tres cosas: el `<textarea>` que una persona edita, el `encargo` que se
 * escribe en el índice de la cola (que lleva ya el encargo entero de cada tarea) y la
 * petición del turno. Un modelo que se venga arriba puede contestar veinte kilobytes de
 * prosa; el tope es generoso porque esto ES un documento con apartados —al contrario que el
 * resumen del juez, que es una frase— pero existe, y cuando muerde se DICE en el propio
 * texto: un encargo cortado en seco parecería que la persona lo dejó a medias.
 */
export const TOPE_DE_ENCARGO = 8_000;

/**
 * No se pudo PREGUNTAR, o lo que contestó no es un encargo.
 *
 * Es fallo del ENTORNO y no del proyecto —la misma familia que `ErrorDelSimulador` y
 * `ErrorDelJuezDeTarea`—, y es un tipo propio por lo mismo: quien lo recoge tiene que poder
 * distinguirlo para encolar la tarea con el texto original en vez de dar el fallo por un
 * encargo.
 */
export class ErrorDelAumentador extends Error {
  constructor(motivo: string) {
    super(`no se pudo preparar el encargo (papel «${PAPEL_DEL_AUMENTADOR}»): ${motivo}`);
    this.name = "ErrorDelAumentador";
  }
}

/** Cómo se le habla al modelo: un papel, un prompt y la RAÍZ con la que resolver el papel. */
export type InvocarParaAumentar = (papel: Papel, prompt: string, raiz: string) => Promise<string>;

/**
 * El `invocar` de PRODUCCIÓN, sobre `ModelosPort`.
 *
 * Es hermano de `invocarConModelos` (`agent/juezDeTarea.ts`) y **no se reutiliza aquél a
 * propósito**: su error dice «no se pudo consultar al juez de QA», que aquí sería falso — y
 * ese mensaje es lo que la ventana de crear le enseña a una persona. Dos frases distintas
 * para dos operaciones distintas; lo que sí es idéntico, porque es la regla del repo, es el
 * reparto entre los dos sitios de envoltura:
 *
 * - **Construir** el modelo del papel falla ANTES de tocar la red y con un mensaje escrito
 *   para leerse («falta la credencial para nvidia (NVIDIA_API_KEY); usa /provider nvidia»).
 *   Ese mensaje SÍ se conserva: es la única línea que dice qué hacer.
 * - **Llamar** es otra cosa: ahí los SDK devuelven el cuerpo remoto, y ahí van claves
 *   redactadas y cabeceras. De esa solo se conserva el NOMBRE del error — la misma regla que
 *   `ErrorCatalogoModelos`: nunca la clave ni el cuerpo remoto. No es ser opaco, es no
 *   filtrar secretos.
 */
export function invocarParaAumentar(modelos: ModelosPort): InvocarParaAumentar {
  return async (papel, prompt) => {
    let modelo: unknown;
    try {
      modelo = modelos.paraPapel(papel);
    } catch (error) {
      throw new ErrorDelAumentador(error instanceof Error ? error.message : String(error));
    }
    if (
      typeof modelo !== "object" ||
      modelo === null ||
      typeof (modelo as { invoke?: unknown }).invoke !== "function"
    ) {
      // Un doble de modelos (`ModeloGuionizado`) devuelve `{guion}` y no sabe invocar.
      throw new ErrorDelAumentador(`el modelo del papel «${papel}» no se puede invocar aquí`);
    }
    try {
      const respuesta = await (modelo as { invoke: (p: unknown) => Promise<unknown> }).invoke(prompt);
      // El MISMO extractor que el puente del stream, no una copia: dos reglas para sacar el
      // texto de un mensaje son dos reglas que divergen — y una de ellas metería el
      // razonamiento del modelo dentro del encargo.
      return textoDe(respuesta);
    } catch (error) {
      throw new ErrorDelAumentador(error instanceof Error ? error.name : "error de la llamada");
    }
  };
}

/**
 * El prompt del aumentador.
 *
 * Lleva la petición, el proyecto y su rama, los adjuntos POR NOMBRE y la memoria del proyecto
 * si existe. **No lleva la raíz** —es una ruta de la máquina, y está en la petición para
 * resolver el papel `trabajo` contra el `config.json` del proyecto, no para el prompt— ni el
 * árbol del proyecto, que sería contexto por gastar en una llamada cuyo trabajo es redactar.
 *
 * Y lo que le PROHÍBE es lo que este repo prohíbe en todas partes: inventarse nada de XOne
 * (lo desconocido no da error, da un bug mudo) y dar por hecho un paso de aprobación humana
 * que ya no existe.
 */
export function promptDelAumentador(peticion: PeticionDeTarea): string {
  const { proyecto, adjuntos } = peticion;
  return [
    "Eres el jefe de proyecto de un equipo que desarrolla aplicaciones XOne. Un desarrollador",
    "ha apuntado lo que quiere en una frase, y tu trabajo es convertirla en un ENCARGO que",
    "otro agente pueda ejecutar SOLO, de principio a fin.",
    "",
    `El proyecto es «${proyecto.nombre}»${proyecto.rama === undefined ? "" : `, rama «${proyecto.rama}»`}.`,
    "",
    "LO QUE HA PEDIDO, tal cual:",
    peticion.texto,
    "",
    ...(peticion.memoria === undefined || peticion.memoria.trim() === ""
      ? []
      : ["Memoria del proyecto: decisiones ya tomadas que el encargo no debe contradecir.", peticion.memoria, ""]),
    ...(adjuntos.length === 0
      ? []
      : [
          `Ha anexado ${adjuntos.length} fichero(s), que el agente verá en «/adjuntos/» de solo lectura:`,
          ...adjuntos.map((a) => `- ${a.nombre}${a.mime === undefined ? "" : ` (${a.mime})`}`),
          "Di para qué sirve cada uno. Y AVISO que tienes que trasladarle: el agente puede LEER",
          "una imagen como fichero, pero no la VE — no hay visión en este harness. No escribas un",
          "criterio que dependa de mirar una captura.",
          "",
        ]),
    "CÓMO SE EJECUTA ESTE ENCARGO, y esto cambia cómo hay que redactarlo:",
    "la tarea corre SOLA, sin nadie delante, y APLICA sus escrituras sin pedir aprobación —la",
    "autorización fue el acto de crear la tarea—. Así que el encargo describe un trabajo que se",
    "hace ENTERO de una vez: una funcionalidad nueva, un refactor, un arreglo, documentación.",
    "NO escribas ningún paso que espere a una persona («cuando lo apruebes», «pide",
    "confirmación», «espera el visto bueno»): ese paso no existe y el agente se quedaría",
    "esperando a alguien que no está. Si de verdad hace falta una decisión que solo puede tomar",
    "el desarrollador, dile al agente que PARE y la pregunte, en vez de inventarse la respuesta.",
    "",
    "REGLAS DE XONE que el encargo no puede romper: XOne no es desarrollo web. Es XML en",
    "ficheros `.xne`, JavaScript ES5 y un CSS propio; no hay DOM, ni async/await, ni React. Los",
    "`.xml` los genera XOne Studio a partir del `.xne` y NO se tocan. XOne ignora en silencio lo",
    "que no conoce, así que un atributo o una función inventada no da error: da un bug mudo.",
    "No te inventes nombres de colecciones, de campos ni de funciones que no aparezcan en lo",
    "que te han dado: si hace falta averiguarlos, el encargo dice que se averigüen leyendo el",
    "proyecto.",
    "",
    "Contesta SOLO con el encargo, en markdown, con estos cuatro apartados y nada más:",
    "## Qué hay que conseguir",
    "## Criterios de aceptación (comprobables, uno por línea)",
    "## Qué NO hay que tocar",
    adjuntos.length === 0 ? "## Cómo empezar" : "## Adjuntos y para qué sirve cada uno",
  ].join("\n");
}

/**
 * El encargo tal como se guarda: sin caracteres de control, acotado, y nunca vacío.
 *
 * **Los saltos de línea y los tabuladores se conservan**, al contrario que en el resumen del
 * juez (`unaFrase`): esto es un documento con apartados que se pinta en un `<textarea>`, no
 * un rótulo de una tarjeta. Lo que se va es el resto de los controles, por lo mismo de
 * siempre — acaban en el cable y en el índice.
 *
 * **Una respuesta vacía es un FALLO y no un encargo.** Encolar con el encargo en blanco
 * mandaría al agente a trabajar sin nada que hacer; y el camino de reserva ya existe y es
 * mejor: el texto original de la persona.
 */
export function encargoDeTexto(texto: string): string {
  const limpio = texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g, "").trim();
  if (limpio === "") throw new ErrorDelAumentador("el modelo contestó en blanco");
  if (limpio.length <= TOPE_DE_ENCARGO) return limpio;
  // Cortado y DICHO: en seco parecería que la persona lo dejó a medias.
  return `${limpio.slice(0, TOPE_DE_ENCARGO)}\n\n[el encargo propuesto se recortó aquí: no cabía entero]`;
}

export function crearAumentador(opciones: { invocar: InvocarParaAumentar }): AumentadorPort {
  return {
    augmentar: async (peticion) => {
      let texto: string;
      try {
        texto = await opciones.invocar(PAPEL_DEL_AUMENTADOR, promptDelAumentador(peticion), peticion.proyecto.raiz);
      } catch (error) {
        // Lo que ya viene envuelto se deja: `invocarParaAumentar` distingue el fallo de
        // CONSTRUIR (cuyo mensaje es el accionable) del de LLAMAR (cuyo cuerpo no se
        // repite). Cualquier otro `invocar` puede lanzar lo que sea, y entonces solo se
        // conserva el nombre del error — la regla de `ErrorCatalogoModelos`.
        if (error instanceof ErrorDelAumentador) throw error;
        throw new ErrorDelAumentador(error instanceof Error ? error.name : "error al preguntar");
      }
      return encargoDeTexto(texto);
    },
  };
}
