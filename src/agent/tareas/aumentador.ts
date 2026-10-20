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
import type { AumentadorPort, ModelosPort, Papel, PeticionDeTarea } from "../../core/ports.js";
import { proyectoDePantalla } from "../../core/stitch.js";
import { textoDe } from "../turno/puente.js";

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
 * Es hermano de `invocarConModelos` (`agent/tareas/juezDeTarea.ts`) y **no se reutiliza aquél a
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
    ...(peticion.pantallasDeStitch === undefined || peticion.pantallasDeStitch.length === 0
      ? []
      : peticion.pantallasDeStitch.length === 1
        ? [
            // Decisión suya: el diseño se ELIGE y va en el contexto de la tarea con sus ids. Medido en Maset: con solo el
            // nombre, «Menu Listado Entregas» no era el título de ninguna y la tarea construyó con otra maqueta.
            `MAQUETA ELEGIDA por el desarrollador: la pantalla de Stitch «${peticion.pantallasDeStitch[0]!.titulo}», id \`${peticion.pantallasDeStitch[0]!.name}\`, ` +
              `del proyecto de Stitch ${peticion.pantallasDeStitch[0]!.proyecto === undefined ? "" : `«${peticion.pantallasDeStitch[0]!.proyecto}» `}(id \`${proyectoDePantalla(peticion.pantallasDeStitch[0]!.name)}\`).`,
            "El encargo la nombra así, CON esos dos ids, como LA referencia de diseño: el harness la deja en /artefactos/diseno/",
            "antes de empezar. No digas que se busque por su título ni propongas otra pantalla.",
            "",
          ]
        : [
            // IXCODE-63: varias, cada una una PANTALLA distinta a construir (decisión suya).
            `MAQUETAS ELEGIDAS por el desarrollador (${peticion.pantallasDeStitch.length}), del proyecto de Stitch ` +
              `${peticion.pantallasDeStitch[0]!.proyecto === undefined ? "" : `«${peticion.pantallasDeStitch[0]!.proyecto}» `}(id \`${proyectoDePantalla(peticion.pantallasDeStitch[0]!.name)}\`):`,
            ...peticion.pantallasDeStitch.map((p, i) => `${i + 1}. «${p.titulo}», id \`${p.name}\``),
            "Cada una es una PANTALLA distinta que esta tarea tiene que construir. El encargo las nombra así, CON sus ids, como",
            "LAS referencias de diseño: el harness las deja en /artefactos/diseno/ (la primera) y /artefactos/diseno/2/… antes",
            "de empezar. No digas que se busquen por su título ni propongas otras pantallas.",
            "",
          ]),
    ...(peticion.conectores === undefined || peticion.conectores.length === 0
      ? []
      : [
          `CONECTORES del proyecto, que el agente PUEDE usar: ${peticion.conectores.join(", ")}.`,
          "Si la petición nombra uno —aunque venga mal escrito («Stish» es Stitch)—, lo que pide está EN ese",
          "conector: el encargo dice que lo traiga de ahí (una pantalla de Stitch se trae con su nombre), nunca que",
          "lo busque en el repo.",
          "",
        ]),
    ...(peticion.memoria === undefined || peticion.memoria.trim() === ""
      ? []
      : ["Memoria del proyecto: decisiones ya tomadas que el encargo no debe contradecir.", peticion.memoria, ""]),
    ...(adjuntos.length === 0
      ? []
      : [
          `Ha anexado ${adjuntos.length} fichero(s), que el agente verá en «/adjuntos/» de solo lectura:`,
          ...adjuntos.map((a) => `- ${a.nombre}${a.mime === undefined ? "" : ` (${a.mime})`}`),
          "Di para qué sirve cada uno. Si una imagen es una MAQUETA, di que es la referencia: el agente",
          "la VE con `describe_image`, y compara una captura del aparato contra ella con",
          "`comparar_capturas` y `xone_critica_visual`. Escribe el criterio visual MEDIBLE contra",
          "esa maqueta («comparada con /adjuntos/x.png, sin diferencias de forma»), no «que se vea bien».",
          "",
        ]),
    "CÓMO SE EJECUTA ESTE ENCARGO, y esto cambia cómo hay que redactarlo:",
    "la tarea corre SOLA, sin nadie delante, y APLICA sus escrituras sin pedir aprobación —la",
    "autorización fue el acto de crear la tarea—. Así que el encargo describe un trabajo que se",
    "hace ENTERO de una vez: una funcionalidad nueva, un refactor, un arreglo, documentación.",
    "NO escribas ningún paso que espere a una persona («cuando lo apruebes», «pide",
    "confirmación», «espera el visto bueno»): ese paso no existe y el agente se quedaría",
    "esperando a alguien que no está. Tampoco condiciones de PARADA («si no lo encuentras, para y",
    "pregunta»): di DÓNDE buscar lo que haga falta. Si hay una decisión que solo puede tomar el",
    "desarrollador, el agente la pregunta con su opción recomendada —en una tarea se contesta sola",
    "con ella— y sigue; dilo así, nunca «para».",
    "",
    "NO AÑADAS lo que la petición no pide. Ampliar es concretar el CÓMO de lo pedido, no sumar funcionalidad:",
    "ni dar de alta la ventana en el menú, ni cambiar otras pantallas, ni rediseñar lo que ya existe, si la petición",
    "no lo dice. Medido en Maset: «Hacer -> Menu Listado Entregas» salió como «accesible desde el menú de la",
    "aplicación», y la tarea metió otra tarjeta en el menú principal. Si algo así parece necesario, va como decisión",
    "abierta con la recomendada «no tocarlo», nunca como requisito.",
    "",
    "PERO LO PEDIDO SE HACE ENTERO, también cuando una parte vive en una pieza COMPARTIDA (una rejilla o un contents",
    "que embeben varias pantallas, una clase de CSS común). Eso no es añadir: es el CÓMO. El encargo dice que se haga",
    "SIN cambiar cómo se ven ni cómo funcionan las demás pantallas que la usan: con una colección propia de esta",
    "pantalla que herede de la compartida (`inherits`) y la sustituya solo aquí, o con clases propias. Medido en",
    "Maset: «rediseña la pantalla de Stitch» salió con «no tocar colecciones compartidas» y «no crear colecciones»;",
    "las filas de la maqueta vivían en una rejilla compartida, el agente encontró el `inherits` y no pudo usarlo, y",
    "la tarea acabó con la mitad del diseño sin hacer. Así que en «Qué NO hay que tocar» va lo que no hay que",
    "CAMBIAR (las otras pantallas, su aspecto, su lógica), nunca el medio para hacer lo pedido, y no prohíbas crear",
    "una colección o una clase si lo pedido puede necesitarla. Una decisión abierta nunca tiene como recomendada",
    "dejar sin hacer una parte de lo pedido.",
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
