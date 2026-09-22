import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  esRutaDeArtefacto,
  mimeDeArtefacto,
  nombreDeArtefacto,
  rutaRelativaDeArtefacto,
} from "../../core/artefactos.js";
import {
  juzgarPantalla,
  TOPE_DE_PETICIONES,
  type CapturaDePantalla,
  type InvocarVisual,
} from "../dispositivos/juezVisual.js";

/**
 * `xone_critica_visual`: enseñarle una captura al crítico y traer su veredicto.
 *
 * **Por qué es una TOOL y no un paso del cierre.** El crítico necesita PEDIR pantallas —juzga
 * la captura que le den, así que si el conductor fotografió el login, dictamina sobre el
 * login—, y quien puede ir a buscarlas es el conductor. Las tres formas de resolver eso se
 * midieron contra los invariantes del repo y dos se caen solas:
 *
 *  - Que el conductor haga de crítico es que el que trabaja se puntúe a sí mismo. Es lo que
 *    `juezDeTarea` ya prohíbe por escrito —«a un modelo se le puede pedir que avise y a veces
 *    no avisa»— y lo que el prompt del conductor tiene prohibido («no digas que hiciste un
 *    paso que no hiciste»). Medido el mismo día: un turno describió los 19 botones de una
 *    pantalla leyéndolos del `.xne` y se leía como si los hubiera visto.
 *  - Que el crítico conduzca el aparato es darle una shell, y el invariante es «backend con
 *    shell, exactamente UNO»: una shell no pasa por `permisosDe` ni por el `virtualMode`, o
 *    sea que concederla es conceder la máquina — y precisamente al que existe para ser
 *    independiente.
 *
 * Queda ésta: el crítico **pide por nombre** y el orquestador vuelve a delegar en el
 * conductor. La tool no toca el aparato, no escribe nada y solo lee de la carpeta de
 * artefactos de la sesión.
 *
 * **La guarda de ruta se RE-APLICA a mano**, como en las otras dos tools propias: una tool de
 * LangChain añadida por xonecode NO pasa por el middleware de permisos, así que sin esto sería
 * una forma de leer cualquier fichero de la máquina y mandárselo a un modelo.
 */
const Entrada = z.object({
  captura: z
    .string()
    .describe("La ruta virtual de la captura, siempre bajo /artefactos/ (la que anunció el evento)"),
  pantalla: z
    .string()
    .describe("De qué pantalla o colección es la captura, para que el crítico sepa qué mira"),
  /**
   * La MAQUETA, y su ausencia significa algo — por eso lo dice el `describe`.
   *
   * Sin ella el crítico solo busca ROTURAS y no dice nada de si la pantalla se parece a lo
   * que se pidió. Medido: dio verde sobre una calculadora cuyas teclas eran rectángulos donde
   * la maqueta tenía píldoras, y el verde se leyó como «está bien». Un parámetro que no dice
   * qué pasa cuando falta deja ese malentendido intacto.
   */
  referencia: z
    .string()
    .optional()
    .describe(
      "OPCIONAL. La ruta virtual bajo /artefactos/ de la MAQUETA o diseño de referencia. " +
        "Pásala SIEMPRE que el encargo traiga un diseño: con ella comparo la captura contra " +
        "la maqueta (forma, tamaños, colocación). SIN ella solo busco roturas y NO digo nada " +
        "sobre si se parece al diseño."
    ),
});
type Entrada = z.infer<typeof Entrada>;

export interface DependenciasDeCritica {
  /** Los bytes de un artefacto, por su NOMBRE. Quien la monta sabe dónde está la carpeta. */
  leerArtefacto: (nombre: string) => Promise<Buffer>;
  invocar: InvocarVisual;
}

/**
 * Qué es esta ruta, o el motivo en palabras. **Comprueba y NO lee.**
 *
 * Separada de la lectura a propósito: con dos imágenes en juego, el orden importa. Si se
 * comprobara y abriera cada una por turno, una referencia con la ruta mal escrita se
 * descubriría DESPUÉS de haber leído la captura — y lo que la guarda promete es que no se
 * abre nada hasta que todo lo que se va a abrir está comprobado. Es lo mismo que exige el
 * test de siempre («no se lee NADA antes de comprobarlo»), solo que ahora hay dos.
 *
 * `que` cambia únicamente cómo se nombra en el mensaje: la comprobación es la MISMA para las
 * dos, porque las dos acaban dentro de un modelo.
 */
function veredictoDeImagen(ruta: string, que: string): { mime: string } | string {
  // Lista BLANCA de forma, sobre el TEXTO que escribe el modelo. `esRutaDeArtefacto` no es
  // un `startsWith`: comprueba la forma entera, segmento a segmento.
  if (!esRutaDeArtefacto(ruta)) {
    return `«${ruta}» no es ${que} de esta sesión. Solo puedo mirar lo que hay bajo /artefactos/.`;
  }
  const nombre = nombreDeArtefacto(ruta);
  const mime = mimeDeArtefacto(nombre);
  if (mime === undefined || !mime.startsWith("image/")) {
    return `«${nombre}» no es una imagen, así que no hay nada que mirar.`;
  }
  return { mime };
}

/**
 * Los bytes, ya con la ruta comprobada. Nunca lanza: que falte una imagen no puede llevarse
 * el turno por delante.
 *
 * **Se abre por la ruta RELATIVA y se NOMBRA por el último segmento**, que son dos preguntas
 * distintas y confundirlas era un botón muerto: un `unzip` deja un ÁRBOL, y una maqueta
 * descomprimida vive en `/artefactos/diseno/screen.png`. Con el basename, el `join` de quien
 * lee apuntaba a `<carpeta>/screen.png` y contestaba «no pude abrir» sobre un fichero que
 * estaba ahí y que la propia foto había anunciado.
 */
async function leer(
  ruta: string,
  mime: string,
  deps: DependenciasDeCritica
): Promise<CapturaDePantalla | string> {
  try {
    const bytes = await deps.leerArtefacto(rutaRelativaDeArtefacto(ruta));
    return { base64: bytes.toString("base64"), mime };
  } catch (error) {
    // El mensaje de un error de Node lleva la ruta absoluta y esto va al modelo: solo el
    // NOMBRE del error.
    return `No pude abrir «${nombreDeArtefacto(ruta)}» (${error instanceof Error ? error.name : "error"}).`;
  }
}

/**
 * **Fail-closed: una referencia que se pidió y no se pudo usar es un NO.**
 *
 * Lo tentador es juzgar sin ella y avisar. Es justo el fallo que este parámetro existe para
 * cerrar: un veredicto sin maqueta vuelve como «verde» y se lee como «se parece al diseño».
 * Así que no se juzga nada, y el paso siguiente que se escribe es ARREGLAR LA RUTA — nunca
 * «o llámame sin ella», que sería dejar el modo ciego escrito dentro de la propia tool como
 * alternativa legítima.
 */
function sinJuzgar(motivo: string): string {
  return [
    motivo,
    "NO he juzgado la captura: comparar contra media maqueta no es comparar, y mi veredicto",
    "se leería como que la pantalla se parece al diseño. Comprueba la ruta de la maqueta",
    "—tiene que ser la que anunció su evento `artefacto`, con sus subcarpetas— y vuelve a",
    "llamarme.",
  ].join("\n");
}

export function crearCriticaVisual(deps: DependenciasDeCritica) {
  return tool(
    async (entrada: Entrada) => {
      // Se comprueban las DOS antes de abrir ninguna: ver `veredictoDeImagen`.
      const deLaCaptura = veredictoDeImagen(entrada.captura, "una captura");
      if (typeof deLaCaptura === "string") return deLaCaptura;
      const deLaReferencia =
        entrada.referencia === undefined
          ? undefined
          : veredictoDeImagen(entrada.referencia, "la referencia");
      if (typeof deLaReferencia === "string") return sinJuzgar(deLaReferencia);

      const abierta = await leer(entrada.captura, deLaCaptura.mime, deps);
      if (typeof abierta === "string") return abierta;

      let referencia: CapturaDePantalla | undefined;
      if (entrada.referencia !== undefined && deLaReferencia !== undefined) {
        const abiertaRef = await leer(entrada.referencia, deLaReferencia.mime, deps);
        /**
         * **Fail-closed: una referencia que se pidió y no se pudo abrir es un NO.**
         *
         * Lo tentador es juzgar sin ella y avisar. Es justo el fallo que este parámetro
         * existe para cerrar: un veredicto sin maqueta vuelve como «verde» y se lee como
         * «se parece al diseño». Así que no se juzga nada, y el paso siguiente que se
         * escribe es ARREGLAR LA RUTA — nunca «o llámame sin referencia», que sería dejar
         * el modo ciego escrito dentro de la propia tool como alternativa legítima.
         */
        if (typeof abiertaRef === "string") return sinJuzgar(abiertaRef);
        referencia = abiertaRef;
      }

      let veredicto;
      try {
        veredicto = await juzgarPantalla(
          abierta,
          { pantalla: entrada.pantalla },
          deps.invocar,
          referencia
        );
      } catch (error) {
        // Fallo del ENTORNO —sin modelo, sin clave, sin red—: se dice, y no se convierte en un
        // veredicto. Un rojo inventado culparía al trabajo de un problema de la máquina.
        return `No se pudo consultar al crítico visual: ${error instanceof Error ? error.message : "error"}`;
      }

      /**
       * **La cabecera dice si se COMPARÓ, y no repite la ruta de la referencia.** Lo primero
       * porque «verde» contesta dos preguntas distintas según el modo y quien lo lea tiene
       * que saber cuál le han contestado. Lo segundo porque el argumento lo acaba de escribir
       * quien llama: devolvérselo entero es el eco que ya paga el campo `pantalla`.
       */
      const comparado = referencia === undefined ? "" : " (comparado con la referencia)";
      const lineas = [
        `Veredicto visual de «${entrada.pantalla}»${comparado}: ${veredicto.veredicto}.`,
      ];
      if (veredicto.observaciones.length > 0) {
        /**
         * **El aviso no es cortesía: está medido.** Seis vueltas sobre la misma captura
         * describieron un texto CORTADO como «girado 180°», y pedirle en el prompt que no
         * diagnostique no lo evitó. A dónde apunta sí acertó las seis veces. Sin esta línea,
         * el desarrollador se pone a buscar una rotación que no existe.
         */
        lineas.push(
          "Lo que dice que ve (la REDACCIÓN no es fiable: describe mal la causa. Fíate de QUÉ",
          "control señala, no de su explicación, y míralo tú):"
        );
        for (const o of veredicto.observaciones) lineas.push(`- ${o}`);
      }
      /**
       * **Un rojo tiene que ENTERAR a alguien, y el sitio fuerte es aquí.**
       *
       * La regla de «lo que salga vuelve a `developer-xone`» vive en el prompt del
       * orquestador, o sea a miles de tokens del momento en que llega el veredicto. Eso es
       * una sugerencia. Este repo ya tiene escrito que «los avisos de honestidad son código,
       * no prompt», y el patrón para que un modelo haga lo siguiente es el de
       * `xone_navegacion` cuando no sabe contestar: se devuelve el PASO SIGUIENTE escrito, no
       * un consejo — a un modelo al que se le dice qué hacer sin decirle cómo se le inventa
       * los argumentos.
       *
       * **Pero quién arregla y CUÁNDO no lo decide esta tool, y eso se aprendió caro.** La
       * versión anterior mandaba a `developer-xone` sin condición, y era la CUARTA puerta
       * de la deriva: en una tarea de DOCUMENTAR, el conductor sacó una captura, el crítico
       * la vio en rojo y el turno se fue a arreglar la pantalla — nadie había pedido que se
       * tocara el código. Un paso siguiente escrito es fuerte justamente por eso, así que
       * escrito de más manda igual de fuerte.
       *
       * Lo que la tool NO puede saber es el encargo: se construye por SESIÓN y el encargo
       * es del TURNO. Y deducirlo del texto sería una heurística que falla en silencio, que
       * es lo que este repo no hace. Así que se escriben las DOS ramas y la elige quien sí
       * lo sabe — con la única parte que no depende del encargo dicha aparte: callárselo no
       * vale nunca.
       *
       * **Límite declarado, y es el que queda abierto**: esto no es un tope. No puede serlo
       * desde aquí, porque la tool se construye por SESIÓN y no por turno, así que no tiene
       * dónde contar las vueltas. Lo que acota hoy es que cada arreglo pasa por una
       * aprobación humana. Un tope de verdad exige que el bucle lo lleve el harness
       * (`conVerificacion`), y eso pide conducir el aparato desde código — medido: no se
       * puede, porque llegar a una pantalla necesita abrir cajones y mirar el árbol.
       */
      if (veredicto.veredicto === "rojo") {
        /**
         * **Con referencia, el arreglo es de `designer-xone`.** No es un cambio de criterio:
         * una diferencia contra una maqueta es visual por definición —forma, tamaño,
         * colocación, color— y eso es literalmente lo que su `.md` reclama («del color o del
         * tamaño equivocado… también cuando se arregle en un `.xne`»). Sin referencia el
         * hallazgo puede ser cualquier cosa, así que esa rama se queda como estaba.
         */
        const aQuien = referencia === undefined ? "developer-xone" : "designer-xone";
        lineas.push(
          "Esto es un defecto del proyecto SIN ARREGLAR, y qué hacer con él depende de TU",
          "encargo — que lo sabes tú y no yo:",
          `- Si el encargo incluye ARREGLAR o dejar la app bien: encárgaselo a \`${aQuien}\``,
          "  pasándole estas observaciones tal cual, y cuando lo haya corregido manda otra vez",
          "  al conductor a esta misma pantalla y vuelve a llamarme con la captura nueva.",
          referencia === undefined
            ? "  No des la pantalla por buena hasta que yo la vea en verde."
            : "  Y vuelve CON LA MISMA `referencia`: sin ella mi verde solo diría que nada" +
              "\n  está roto, no que la pantalla se parezca al diseño.",
          "- Si el encargo es OTRO —documentar, medir, inventariar—: NO toques el proyecto por",
          "  esto. Anótalo donde estés contando lo que ves y sigue con lo tuyo.",
          "Lo que NO vale en ninguno de los dos casos es callártelo."
        );
      }
      if (veredicto.necesito.length > 0) {
        lineas.push(
          `Necesita ver ${veredicto.necesito.length === 1 ? "otra pantalla" : "otras pantallas"} para dictaminar: ${veredicto.necesito.join(", ")}.`,
          `Encarga al conductor que llegue ahí y capture, y vuelve a llamarme con esa captura (como mucho ${TOPE_DE_PETICIONES} veces).`
        );
      }
      return lineas.join("\n");
    },
    {
      name: "xone_critica_visual",
      description:
        "Enseña una captura de pantalla del aparato a un revisor visual y devuelve qué se ve " +
        "mal: texto cortado, controles solapados o fuera de la pantalla, cosas ilegibles. " +
        "Ve lo que ninguna comprobación estática puede ver. Puede pedir otras pantallas. " +
        "Si el encargo trae un DISEÑO o una MAQUETA, pásala en `referencia` y además comparo " +
        "la pantalla contra ella (forma, tamaños, colocación, color). SIN `referencia` mi " +
        "verde significa «nada roto», NO «se parece al diseño».",
      schema: Entrada,
    }
  );
}
