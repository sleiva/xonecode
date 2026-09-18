import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { esRutaDeArtefacto, mimeDeArtefacto, nombreDeArtefacto } from "../../core/artefactos.js";
import {
  juzgarPantalla,
  TOPE_DE_PETICIONES,
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
});
type Entrada = z.infer<typeof Entrada>;

export interface DependenciasDeCritica {
  /** Los bytes de un artefacto, por su NOMBRE. Quien la monta sabe dónde está la carpeta. */
  leerArtefacto: (nombre: string) => Promise<Buffer>;
  invocar: InvocarVisual;
}

export function crearCriticaVisual(deps: DependenciasDeCritica) {
  return tool(
    async (entrada: Entrada) => {
      // Lista BLANCA de forma, sobre el TEXTO que escribe el modelo. `esRutaDeArtefacto` no es
      // un `startsWith`: comprueba la forma entera.
      if (!esRutaDeArtefacto(entrada.captura)) {
        return `«${entrada.captura}» no es una captura de esta sesión. Solo puedo mirar lo que hay bajo /artefactos/.`;
      }
      const nombre = nombreDeArtefacto(entrada.captura);
      const mime = mimeDeArtefacto(nombre);
      if (mime === undefined || !mime.startsWith("image/")) {
        return `«${nombre}» no es una imagen, así que no hay nada que mirar.`;
      }

      let bytes: Buffer;
      try {
        bytes = await deps.leerArtefacto(nombre);
      } catch (error) {
        // El mensaje de un error de Node lleva la ruta absoluta y esto va al modelo: solo el
        // nombre del error. Y se DEVUELVE, no se lanza: que falte una captura no puede
        // llevarse el turno por delante.
        return `No pude abrir «${nombre}» (${error instanceof Error ? error.name : "error"}).`;
      }

      let veredicto;
      try {
        veredicto = await juzgarPantalla(
          { base64: bytes.toString("base64"), mime },
          { pantalla: entrada.pantalla },
          deps.invocar
        );
      } catch (error) {
        // Fallo del ENTORNO —sin modelo, sin clave, sin red—: se dice, y no se convierte en un
        // veredicto. Un rojo inventado culparía al trabajo de un problema de la máquina.
        return `No se pudo consultar al crítico visual: ${error instanceof Error ? error.message : "error"}`;
      }

      const lineas = [`Veredicto visual de «${entrada.pantalla}»: ${veredicto.veredicto}.`];
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
        "Ve lo que ninguna comprobación estática puede ver. Puede pedir otras pantallas.",
      schema: Entrada,
    }
  );
}
