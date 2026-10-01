/**
 * Después de bajar, comprobar que lo bajado SE PUEDE LEER (IXCODE-16).
 *
 * La causa de IXCODE-16 era que la vía fichero a fichero escribía el contenido tal y como lo
 * serializa `studio_get_file` (una cadena JSON), y `app.xml` empezaba por `"`: la app se quedaba
 * en blanco en el aparato con «Unexpected token», y nadie lo decía en la descarga. Eso se arregla
 * en `cloudstudioClient.ts#contenidoDeFichero`; esto es la SEGUNDA capa, para que una copia rota
 * se diga al bajarla —venga de donde venga, también del propio Studio— y no cuando el aparato
 * no arranca.
 *
 * Dos reglas, y solo dos, porque son las que no tienen falso positivo medido:
 *
 * - **Ningún fichero de texto es entero una cadena JSON** (`cadenaJsonEnvuelta`). Vale para todas
 *   las extensiones: en la copia rota medida lo estaban también `.ini`, `.js`, `.css` y `.txt`.
 * - **`app.xml` y los `.xne` son XML bien formado** (no los demás `.xml`, ver `esXmlDeXone`), con el parser de `xone-linter` —el mismo que
 *   lee el proyecto para la navegación, y que respeta la codificación declarada (iso-8859-15)—.
 *
 * Lo que NO se comprueba, a propósito: que `app.ini` sea `clave=valor` línea a línea. El de AppDemo
 * en el servidor trae una línea suelta sin `=` y la app funciona; la regla daría rojo a un proyecto
 * sano.
 */
import { readFileSync } from "node:fs";
// Import PROFUNDO, como en `navegacion/indiceEnDisco.ts`: el barril arrastra un top-level await.
import { parseXml } from "xone-linter/dist/xml/XmlParser.js";
import { EXTENSIONES_DE_TEXTO, extensionDe } from "../../core/planDeSubida.js";
import { cadenaJsonEnvuelta } from "../../core/validacionDeEscritura.js";
import { destinoSeguro } from "./zip.js";

/** Un fichero bajado que no se puede leer como lo que es, y por qué. Ruta RELATIVA al proyecto. */
export interface FicheroIlegible {
  ruta: string;
  motivo: string;
}

/**
 * `app.xml` (en la raíz) y los `.xne`: los que el framework PARSEA al arrancar. Otros `.xml` no:
 * medido sobre las copias de esta máquina, el único falso positivo fue un diccionario
 * (`lang/ca/_cachedictionary.xml`) que excede el límite de entidades del parser y no es de XOne.
 */
const esXmlDeXone = (ruta: string): boolean => /\.xne$/i.test(ruta) || ruta.toLowerCase() === "app.xml";

/** El motivo por el que `contenido` no vale, o `undefined` si vale. Exportada para el test. */
export function motivoDeFicheroIlegible(ruta: string, bytes: Buffer): string | undefined {
  const extension = extensionDe(ruta);
  if (!EXTENSIONES_DE_TEXTO.has(extension)) return undefined;
  // Un `.json` que sea una cadena es JSON VÁLIDO: ahí la regla no dice nada.
  if (extension !== ".json" && cadenaJsonEnvuelta(bytes.toString("utf8")) !== undefined) {
    return "guardado como cadena JSON (empieza por «\"» y lleva el contenido escapado)";
  }
  if (esXmlDeXone(ruta)) {
    try {
      parseXml(bytes);
    } catch (error) {
      // Solo el mensaje del parser: lleva línea y columna, nunca una ruta de la máquina.
      return `XML mal formado: ${(error as Error).message}`;
    }
  }
  return undefined;
}

/**
 * Comprueba en el DISCO los ficheros que la descarga dice haber traído. Lee los BYTES, no el texto
 * que se escribió: es lo que va a leer el aparato. Un fichero que no se puede ni abrir cuenta como
 * ilegible con el `code` de Node (su mensaje lleva la ruta absoluta).
 */
export function validarTrasDescarga(raiz: string, descargados: string[]): FicheroIlegible[] {
  const ilegibles: FicheroIlegible[] = [];
  for (const ruta of descargados) {
    if (!EXTENSIONES_DE_TEXTO.has(extensionDe(ruta))) continue;
    let bytes: Buffer;
    try {
      bytes = readFileSync(destinoSeguro(raiz, ruta));
    } catch (error) {
      ilegibles.push({ ruta, motivo: `no se pudo leer (${(error as NodeJS.ErrnoException).code ?? "error"})` });
      continue;
    }
    const motivo = motivoDeFicheroIlegible(ruta, bytes);
    if (motivo !== undefined) ilegibles.push({ ruta, motivo });
  }
  // El mismo orden que `descargados` en `sync.json` (por código, no por idioma).
  return ilegibles.sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));
}
