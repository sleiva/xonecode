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
  /** Ruta RELATIVA del `.js` -> su contenido. Lo carga el linter. */
  jsFiles?: ReadonlyMap<string, string>;
  app?: {
    entryPoints?: readonly string[];
    loginColls?: readonly string[];
    styles?: readonly { url?: string }[];
    connections?: readonly { name?: string }[];
  };
}

interface CollDelLinter {
  name?: string;
  attributes?: Record<string, string>;
  location?: { file?: string };
  props?: readonly {
    name?: string;
    type?: string;
    attributes?: Record<string, string>;
    inlineEvents?: readonly { name?: string; script?: string }[];
  }[];
  contents?: readonly { src?: string }[];
  events?: readonly EventoDelLinter[];
  nodes?: readonly EventoDelLinter[];
  connections?: readonly { name?: string }[];
}

interface EventoDelLinter {
  name?: string;
  triggerProp?: string;
  actions?: readonly { script?: string; value?: string }[];
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
      // Un `onchange` lleva el campo que lo dispara: sin él no se sabe a qué reacciona, y eso
      // es justo lo que hace falta antes de tocarlo.
      eventos: (coll.events ?? [])
        .filter((e): e is { name: string; triggerProp?: string } => typeof e.name === "string" && e.name !== "")
        .map((e) => (e.triggerProp === undefined || e.triggerProp === "" ? e.name : `${e.name}(${e.triggerProp})`)),
      nodos: nombresDe(coll.nodes),
      conexiones: nombresDe(coll.connections),
    });
  }

  return {
    colecciones,
    referenciasDeScript: referenciasDeScript(delLinter, raiz, ficheros),
    app: {
      entrada: [...(delLinter.app?.entryPoints ?? [])],
      login: [...(delLinter.app?.loginColls ?? [])],
      // La URL de un estilo es del PROYECTO (`default.css`), no una ruta de la máquina: la
      // declara el propio `app.xml` y por eso viaja tal cual.
      estilos: (delLinter.app?.styles ?? [])
        .map((e) => e.url)
        .filter((u): u is string => typeof u === "string" && u !== ""),
      conexiones: nombresDe(delLinter.app?.connections),
    },
  };
}

/** Los `name` que existen de verdad, de una lista que puede traerlos a medias. */
function nombresDe(lista: readonly { name?: string }[] | undefined): string[] {
  return (lista ?? []).map((x) => x.name).filter((n): n is string => typeof n === "string" && n !== "");
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


/**
 * Cómo una app XOne llega de verdad a una colección: `appData.getCollection("X")`.
 *
 * **Medido sobre un proyecto real**, y fue una sorpresa que cambió el alcance de la tool: los
 * botones del menú no usan `mapcol`, usan
 * `onclick="javascript:var obj=appData.getCollection('Deportes').createObject();ui.openEditView(obj)"`.
 * Sin esto, «¿quién usa Deportes?» contestaba «nadie» con dos botones apuntándole — y dos de las
 * tres referencias ROTAS del proyecto solo se ven por aquí.
 *
 * **Es un PATRÓN concreto y no «el nombre aparece en el texto»**, y en esa diferencia está todo:
 * buscar el nombre suelto en los scripts daría cualquier comentario o variable homónima. Esto
 * reconoce una llamada con su literal, que es la forma en que se nombra una colección desde ES5.
 *
 * **Límite declarado y deliberado**: es una expresión regular, no un análisis de ES5. No ve un
 * `getCollection(nombreVariable)` ni un nombre compuesto en ejecución, y no sabe en qué LÍNEA
 * está —para eso harían falta rangos—. Sirve para «quién usa esto», que es la pregunta, y no
 * para saltar al sitio exacto, que no se promete.
 */
const LLAMADA_A_COLECCION = /getCollection\s*\(\s*['"]([^'"]+)['"]\s*\)/gi;

function referenciasDeScript(
  delLinter: ModeloDelLinter,
  raiz: string,
  ficheros: ReadonlySet<string>
): Referencia[] {
  const salida: Referencia[] = [];
  const anotar = (desde: string, hacia: string, fichero: string): void => {
    if (!puedeLeerRuta(fichero) || esVistaAplanada(fichero, ficheros)) return;
    // Sin repetir: un mismo botón puede nombrar la colección dos veces en la misma línea.
    if (salida.some((r) => r.desde === desde && r.hacia === hacia && r.fichero === fichero)) return;
    salida.push({ desde, por: "script", hacia, fichero });
  };

  for (const coll of delLinter.colls ?? []) {
    const nombre = coll.name;
    const fichero = coll.location?.file;
    if (nombre === undefined || fichero === undefined) continue;
    const virtual = rutaVirtualDelProyecto(raiz, fichero);
    if (virtual === undefined) continue;

    // El `onclick` de un `<prop>`, que es de donde salen los menús.
    for (const prop of coll.props ?? []) {
      if (typeof prop.name !== "string" || prop.name === "") continue;
      for (const evento of prop.inlineEvents ?? []) {
        for (const x of String(evento.script ?? "").matchAll(LLAMADA_A_COLECCION)) {
          anotar(`${nombre}.${prop.name}`, x[1]!, virtual);
        }
      }
    }
    // Y las acciones de eventos y nodos.
    for (const evento of [...(coll.events ?? []), ...(coll.nodes ?? [])]) {
      for (const accion of evento.actions ?? []) {
        for (const texto of [accion.script, accion.value]) {
          for (const x of String(texto ?? "").matchAll(LLAMADA_A_COLECCION)) {
            anotar(`${nombre}:${evento.name ?? "(evento)"}`, x[1]!, virtual);
          }
        }
      }
    }
  }

  // Los `.js` sueltos. Sus claves son rutas RELATIVAS al proyecto, así que la virtual es
  // directa — pero pasan por las mismas guardas, que es la regla de esta capa.
  for (const [ruta, texto] of delLinter.jsFiles ?? new Map<string, string>()) {
    const virtual = "/" + String(ruta).split(/[\\/]/).filter(Boolean).join("/");
    for (const x of String(texto).matchAll(LLAMADA_A_COLECCION)) anotar(virtual, x[1]!, virtual);
  }

  return salida;
}
