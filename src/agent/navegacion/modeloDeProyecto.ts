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
    // El inventario entra como criba de la señal débil: sin él, «un literal que coincide con
    // una colección» sería «cualquier literal». Por eso va DESPUÉS de componer las colecciones.
    referenciasDeScript: referenciasDeScript(
      delLinter,
      raiz,
      ficheros,
      new Set(colecciones.map((c) => c.nombre.toLowerCase()))
    ),
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
 * Cómo una app XOne llega de verdad a una colección, que no es con `mapcol`.
 *
 * **Medido sobre un proyecto real**, y fue lo que cambió el alcance de la tool. Hay DOS
 * señales, y van separadas a propósito porque no valen lo mismo:
 *
 * 1. **`appData.getCollection("X")` — señal FUERTE** (`por: "script"`). Es una llamada con su
 *    literal: la forma en que se nombra una colección desde ES5. Los botones del menú abren
 *    así (`onclick="javascript:var o=appData.getCollection('Deportes')…"`), y sin esto «¿quién
 *    usa Deportes?» contestaba «nadie» con dos botones apuntándole.
 * 2. **Un literal que COINCIDE con el nombre de una colección — señal DÉBIL**
 *    (`por: "mencion"`). Existe porque la cadena real puede tener tres saltos:
 *    `method="ExecuteNode(abrirColl('ConsolaReplica'))"` → un nodo con `<param name="coll">` →
 *    `irColl(coll)` → `getCollection(collname)` + `pushValue(obj)`. El nombre solo aparece
 *    como literal en el PRIMER salto, y perseguir la cadena sería atarse a cómo se llaman los
 *    ayudantes de UN proyecto (`irColl`, `abrirColl`, `openMenu`), que no son de XOne.
 *
 * **Y se marcan distinto porque la confianza es distinta.** Una llamada resuelta y una cadena
 * que coincide con un nombre no son lo mismo, y fundirlas haría que la segunda se leyera con
 * la autoridad de la primera. Medido sobre el proyecto real: la débil añade cinco referencias
 * y todas resultaron ciertas, pero eso no la convierte en la fuerte.
 *
 * **Límites declarados**: ninguna de las dos ve un nombre compuesto en ejecución ni dice en qué
 * LÍNEA está —para eso harían falta rangos—, y la débil no puede distinguir un nombre de
 * colección de una cadena que se le parece.
 */
const LLAMADA_A_COLECCION = /getCollection\s*\(\s*['"]([^'"]+)['"]\s*\)/gi;

/** Cualquier literal de cadena con forma de identificador. La criba es el inventario. */
const LITERAL_DE_CADENA = /['"]([A-Za-z_][A-Za-z0-9_]{2,40})['"]/g;

/** Un trozo de script del proyecto, con de dónde salió. */
interface TrozoDeScript {
  /** Quién lo contiene: `Coll.PROP`, `Coll:evento` o la ruta virtual de un `.js`. */
  desde: string;
  /** Ruta VIRTUAL del fichero donde vive. */
  fichero: string;
  /** La colección dueña, si la hay. Sirve para no contar que se menciona a sí misma. */
  duena?: string;
  texto: string;
}

/** Todos los sitios del proyecto donde hay script, con su origen ya traducido. */
function trozosDeScript(delLinter: ModeloDelLinter, raiz: string): TrozoDeScript[] {
  const trozos: TrozoDeScript[] = [];

  for (const coll of delLinter.colls ?? []) {
    const nombre = coll.name;
    const absoluta = coll.location?.file;
    if (nombre === undefined || absoluta === undefined) continue;
    const fichero = rutaVirtualDelProyecto(raiz, absoluta);
    if (fichero === undefined) continue;

    for (const prop of coll.props ?? []) {
      if (typeof prop.name !== "string" || prop.name === "") continue;
      const desde = `${nombre}.${prop.name}`;
      for (const evento of prop.inlineEvents ?? []) {
        trozos.push({ desde, fichero, duena: nombre, texto: String(evento.script ?? "") });
      }
      // **El atributo `method` cuenta**, y no es un detalle: es donde vive
      // `ExecuteNode(abrirColl('ConsolaReplica'))`, o sea la única aparición literal de esa
      // colección en todo el proyecto. Sin mirarlo, el botón de información no referencia nada.
      const metodo = prop.attributes?.["method"];
      if (metodo !== undefined && metodo !== "") {
        trozos.push({ desde, fichero, duena: nombre, texto: metodo });
      }
    }

    for (const evento of [...(coll.events ?? []), ...(coll.nodes ?? [])]) {
      const desde = `${nombre}:${evento.name ?? "(evento)"}`;
      for (const accion of evento.actions ?? []) {
        for (const texto of [accion.script, accion.value]) {
          if (texto !== undefined && texto !== "") trozos.push({ desde, fichero, duena: nombre, texto });
        }
      }
    }
  }

  // Los `.js` sueltos. Sus claves son rutas RELATIVAS al proyecto, así que la virtual es
  // directa. No tienen colección dueña: un `.js` puede nombrar a cualquiera.
  for (const [ruta, texto] of delLinter.jsFiles ?? new Map<string, string>()) {
    const virtual = "/" + String(ruta).split(/[\\/]/).filter(Boolean).join("/");
    trozos.push({ desde: virtual, fichero: virtual, texto: String(texto) });
  }

  return trozos;
}

function referenciasDeScript(
  delLinter: ModeloDelLinter,
  raiz: string,
  ficheros: ReadonlySet<string>,
  conocidas: ReadonlySet<string>
): Referencia[] {
  const salida: Referencia[] = [];
  const anotar = (desde: string, por: string, hacia: string, fichero: string): void => {
    if (!puedeLeerRuta(fichero) || esVistaAplanada(fichero, ficheros)) return;
    // Sin repetir: un mismo botón puede nombrar la colección dos veces en la misma línea.
    if (salida.some((r) => r.desde === desde && r.hacia === hacia && r.fichero === fichero)) return;
    salida.push({ desde, por, hacia, fichero });
  };

  for (const trozo of trozosDeScript(delLinter, raiz)) {
    const fuertes = new Set<string>();
    for (const x of trozo.texto.matchAll(LLAMADA_A_COLECCION)) {
      fuertes.add(x[1]!.toLowerCase());
      anotar(trozo.desde, "script", x[1]!, trozo.fichero);
    }

    for (const x of trozo.texto.matchAll(LITERAL_DE_CADENA)) {
      const literal = x[1]!;
      const clave = literal.toLowerCase();
      // Solo si es el nombre de una colección que EXISTE: el inventario es la criba, y sin
      // ella esto sería «cualquier cadena del proyecto».
      if (!conocidas.has(clave)) continue;
      // Ya la cogió la señal fuerte en este mismo trozo: no se degrada a mención.
      if (fuertes.has(clave)) continue;
      /**
       * **Una colección que se nombra a sí misma no cuenta.** Medido: de las menciones que
       * aparecían en el proyecto real, la mayoría eran los scripts de `ConsolaReplica`
       * diciendo «ConsolaReplica» — en un SQL, en un mensaje, en un refresco. Como respuesta a
       * «¿quién usa X?» eso es ruido, y ruido que sale en TODAS las colecciones con scripts.
       */
      if (trozo.duena !== undefined && trozo.duena.toLowerCase() === clave) continue;
      anotar(trozo.desde, "mencion", literal, trozo.fichero);
    }
  }

  return salida;
}
