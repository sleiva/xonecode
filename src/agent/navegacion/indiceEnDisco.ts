// **Import PROFUNDO, y no es una optimización: es un requisito medido.** El barril
// (`xone-linter`) reexporta también su RUNTIME —VM, HTTP, dispositivo y una conexión SQLite
// con *top-level await*—, y eso revienta bajo `tsx`, que es el lanzador de desarrollo
// (`./bin/xonecode`): «Top-level await is currently not supported with the cjs output
// format». Por la ruta del modelo no hay ningún `await` de módulo, así que entra limpio — y
// de paso no se arrastra medio runtime para leer un XML.
import { XoneProject } from "xone-linter/dist/project/XoneProject.js";
import { construirIndice, type IndiceDeNavegacion, type ModeloDeNavegacion } from "../../core/navegacion.js";
import { modeloDeNavegacion, type ModeloDelLinter } from "./modeloDeProyecto.js";
import { estilosEnDisco, type CargarEstilos } from "./estilosEnDisco.js";

/**
 * El índice de navegación de un proyecto de verdad, leyendo el disco con `xone-linter`.
 *
 * **Se apoya en la librería y no reescribe su semántica**, y eso es una decisión medida: el
 * linter ya parsea `.xne`, ya DECODIFICA la codificación del fichero (los `.xne` en
 * ISO-8859-15 son reales, y su `XmlParser` lee la declaración en latin1 antes de pasar por
 * `iconv` para no romper bytes) y su `CrossReferenceRule` ya define qué significa `mapcol`,
 * `mapfld`, `linkedfield`, `contents src` e `inherits`. Reescribir eso aquí sería un SEGUNDO
 * sitio donde se decide lo mismo, y el día que divergieran el linter diría una cosa y el
 * agente otra sobre el mismo proyecto.
 *
 * Entra como LIBRERÍA y no como el binario `xone-simulator` que usa el verificador: así
 * `npm test` puede probar esto con un proyecto de mentira en un temporal, sin binario
 * instalado, que es el invariante que sostiene todo el diseño de puertos. El precio es que
 * hay dos copias del linter en juego —la fijada en `node_modules` y la que el usuario tenga
 * en el PATH— y conviene que no se separen de major.
 *
 * **No cachea, a propósito.** Medido sobre un proyecto real de 41 colecciones: cargarlo entero
 * cuesta unas decenas de milisegundos, contra los segundos de una llamada al modelo. Rehacerlo
 * en cada consulta sale gratis y quita de en medio la pregunta de cuándo invalidarlo — un
 * índice viejo que dice que un campo existe cuando el agente acaba de borrarlo es peor que no
 * tener índice: es una respuesta con autoridad y equivocada.
 */
export type CargarIndice = (ficheros: ReadonlySet<string>) => Promise<IndiceDeNavegacion>;

/**
 * Devuelve el cargador del índice de una raíz. La raíz se fija al crearlo y NO entra por
 * parámetro en cada consulta: si el modelo pudiera decir sobre qué proyecto preguntar,
 * tendríamos una tool que lee cualquier carpeta de la máquina.
 */
export function indiceEnDisco(raiz: string): CargarIndice {
  const modelo = modeloEnDisco(raiz);
  return async (ficheros) => construirIndice(await modelo(ficheros));
}

/**
 * El MODELO de navegación de una raíz, ya traducido y filtrado: lo que el índice consulta y lo
 * que la pestaña Colecciones fotografía (`core/fotoDeColecciones.ts`). Un solo cargador para
 * los dos, así que lo que ve la persona y lo que ve el agente salen de la misma lectura.
 */
export function modeloEnDisco(raiz: string): (ficheros: ReadonlySet<string>) => Promise<ModeloDeNavegacion> {
  return async (ficheros) => {
    const proyecto = await XoneProject.load(raiz);
    return modeloDeNavegacion(proyecto.model as ModeloDelLinter, raiz, ficheros);
  };
}

/**
 * El resolvedor de ESTILOS de una raíz, sobre el mismo `XoneProject`.
 *
 * Vive aquí y no en `estilosEnDisco.ts` para que el import profundo de `XoneProject` —con su
 * motivo medido escrito arriba— esté en UN solo sitio. `estilosEnDisco` recibe el modelo ya
 * cargado y no sabe de dónde sale, que es lo que lo deja probable sin proyecto en disco.
 *
 * **No cachea**, por lo mismo que el índice: el agente escribe CSS dentro del turno, y una hoja
 * vieja que afirma que una clase pone 14 cuando acaba de ponerse 18 es una respuesta con
 * autoridad y equivocada.
 */
export function estilosDeDisco(raiz: string): CargarEstilos {
  return estilosEnDisco(async () => (await XoneProject.load(raiz)).model as never);
}
