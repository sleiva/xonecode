import { relative, sep } from "node:path";
import type {
  ColeccionDeNavegacion,
  ModeloDeNavegacion,
  Referencia,
} from "../../core/navegacion.js";
import { puedeLeerRuta } from "../grafo/perfiles.js";
import { esVistaAplanada } from "../grafo/proyecto.js";

/**
 * De lo que `xone-linter` sabe del proyecto a lo que el índice necesita.
 *
 * **Por qué se traduce en vez de usar su modelo tal cual.** Dos razones, y la segunda es la
 * que importa. La primera: su `XoneProjectModel` trae el proyecto entero —conexiones,
 * estilos, imágenes, fuentes, el runtime— y atar `core/navegacion.ts` a esa forma haría que
 * un cambio suyo llegara hasta el núcleo puro. La segunda: **sus rutas son ABSOLUTAS de esta
 * máquina** (`/Users/…/AppDemo/Clientes.xne`), y de aquí sale texto que va al modelo y de ahí
 * al cable. Traducir a ruta virtual no es higiene: es la misma regla que `sinRutas`.
 *
 * **Y las guardas se REAPLICAN aquí.** Una tool de LangChain que añade xonecode NO pasa por
 * el middleware de permisos —la lección que ya pagó `busquedaRegex`—, así que lo que este
 * adaptador devuelve pasa por `puedeLeerRuta` y por `esVistaAplanada` antes de existir. Se
 * filtra en la FUENTE y no al pintar: lo que no se puede enseñar, mejor que no llegue a estar
 * en el índice.
 *
 * Lo que este módulo NO hace es leer disco por su cuenta ni aceptar rutas del modelo: recibe
 * el modelo ya cargado y la raíz, y de ahí no se mueve.
 */

/** La forma de `xone-linter` que se usa, declarada aquí y mínima. Su `XoneProjectModel` trae
 *  mucho más; nombrar solo esto es lo que deja ver de un vistazo de qué dependemos. */
export interface ModeloDelLinter {
  colls?: readonly CollDelLinter[];
}

interface CollDelLinter {
  name?: string;
  attributes?: Record<string, string>;
  location?: { file?: string };
  props?: readonly {
    name?: string;
    type?: string;
    attributes?: Record<string, string>;
  }[];
  contents?: readonly { src?: string }[];
}

/**
 * La ruta VIRTUAL de una absoluta del proyecto, o `undefined` si se sale de él.
 *
 * Lexical y no `realpath`: este módulo es la traducción, no la barrera del disco — quien
 * necesite cerrar los enlaces simbólicos lo hace donde se abre el fichero. Aquí lo que se
 * impide es que una ruta de FUERA se presente como si fuera del proyecto.
 */
export function rutaVirtualDelProyecto(raiz: string, absoluta: string): string | undefined {
  const rel = relative(raiz, absoluta);
  if (rel === "" || rel.startsWith("..") || rel.startsWith(sep + "..")) return undefined;
  // Absoluta de otra unidad: `relative` la devuelve absoluta y no empieza por `..`.
  if (rel.startsWith(sep) || /^[A-Za-z]:/.test(rel)) return undefined;
  return "/" + rel.split(sep).join("/");
}

/**
 * Traduce el modelo del linter al nuestro, filtrando lo que no se puede enseñar.
 *
 * `ficheros` son las rutas virtuales del proyecto, las mismas que ve el agente: hacen falta
 * para reconocer una vista aplanada (`X.xml` con un `X.xne` al lado), que es una regla que
 * depende del conjunto y no de la ruta sola.
 */
export function modeloDeNavegacion(
  delLinter: ModeloDelLinter,
  raiz: string,
  ficheros: ReadonlySet<string>
): ModeloDeNavegacion {
  const colecciones: ColeccionDeNavegacion[] = [];

  for (const coll of delLinter.colls ?? []) {
    const nombre = coll.name;
    const absoluta = coll.location?.file;
    if (nombre === undefined || nombre === "" || absoluta === undefined) continue;

    const fichero = rutaVirtualDelProyecto(raiz, absoluta);
    // Fuera del proyecto, denegada o vista aplanada: no entra en el índice. Un símbolo que
    // el agente no puede abrir es peor que uno que falta — le manda a leer donde no debe.
    if (fichero === undefined || !puedeLeerRuta(fichero) || esVistaAplanada(fichero, ficheros)) continue;

    const campos = (coll.props ?? [])
      .filter((p): p is { name: string; type?: string } => typeof p.name === "string" && p.name !== "")
      .map((p) => ({ nombre: p.name, ...(p.type === undefined ? {} : { tipo: p.type }) }));

    colecciones.push({
      nombre,
      fichero,
      campos,
      referencias: referenciasDe(coll, nombre),
    });
  }

  return { colecciones };
}

/**
 * Lo que una colección apunta hacia fuera.
 *
 * Los cuatro atributos son los que `xone-linter` ya valida en su `CrossReferenceRule`, y esa
 * coincidencia es deliberada: **la semántica de qué significa `mapcol` vive en UN sitio**.
 * Reescribirla aquí crearía un segundo sitio donde decidirlo, y el día que divergieran el
 * linter diría una cosa y el agente otra sobre el mismo proyecto.
 *
 * `mapfld` y `linkedfield` se cuelgan del `mapcol` de su propio prop, que es lo que les da
 * sentido: un `mapfld` sin `mapcol` no apunta a nada que se pueda nombrar.
 */
function referenciasDe(coll: CollDelLinter, nombre: string): Omit<Referencia, "fichero">[] {
  const salida: Omit<Referencia, "fichero">[] = [];

  const hereda = coll.attributes?.["inherits"];
  if (hereda !== undefined && hereda !== "") {
    salida.push({ desde: nombre, por: "inherits", hacia: hereda });
  }

  for (const contenido of coll.contents ?? []) {
    if (contenido.src !== undefined && contenido.src !== "") {
      salida.push({ desde: nombre, por: "contents", hacia: contenido.src });
    }
  }

  for (const prop of coll.props ?? []) {
    if (typeof prop.name !== "string" || prop.name === "") continue;
    const desde = `${nombre}.${prop.name}`;
    const mapcol = prop.attributes?.["mapcol"];
    if (mapcol === undefined || mapcol === "") continue;
    salida.push({ desde, por: "mapcol", hacia: mapcol });

    for (const clave of ["mapfld", "linkedfield"] as const) {
      const campo = prop.attributes?.[clave];
      if (campo !== undefined && campo !== "") {
        salida.push({ desde, por: clave, hacia: `${mapcol}.${campo}` });
      }
    }
  }

  return salida;
}
