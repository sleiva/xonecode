// **Imports PROFUNDOS, y por el mismo motivo medido que `indiceEnDisco.ts`**: el barril de
// `xone-linter` arrastra su runtime con un *top-level await* que revienta bajo `tsx`, que es el
// lanzador de desarrollo. Estos tres módulos de CSS se comprobaron uno a uno y **no importan
// nada** —`parse.js`, `materialize.js` y `Stylesheet.js` no tienen una sola línea de import—,
// así que entran limpios.
import { buildStylesheet } from "xone-linter/dist/runtime/css/orderedCss.js";
import { parseCssFile } from "xone-linter/dist/runtime/css/parse.js";
import { selectorsFor } from "xone-linter/dist/runtime/css/materialize.js";
import { basename } from "node:path";
import {
  DEL_XML,
  type AtributoEfectivo,
  type EstiloDeProp,
} from "../../core/estilos.js";

/** Lo poquito del modelo del linter que hace falta aquí. Declarado en vez de importado por la
 *  misma razón que `ModeloDelLinter`: no arrastrar sus tipos por medio harness. */
interface ModeloConEstilos {
  app: { attributes: Record<string, string>; styles: Array<{ url: string }> };
  colls: Array<{
    name: string;
    attributes?: Record<string, string>;
    props?: Array<{ name: string; type?: string; attributes?: Record<string, string> }>;
    groups?: Array<{ props?: Array<{ name: string; type?: string; attributes?: Record<string, string> }> }>;
  }>;
  cssFiles: Map<string, string>;
}

/**
 * Las dos banderas de la cascada, **copiadas con su asimetría**.
 *
 * `extendsDefaultNodes` solo es cierto con exactamente `"true"` y `getFromCollClass` solo es
 * falso con exactamente `"false"`. No es un descuido del linter: son dos omisiones distintas
 * (false y true), y «arreglar» la asimetría cambiaría qué estilo se resuelve. Es la misma
 * trampa del `"false"` de CloudStudio que aquí concedería escritura.
 */
function banderas(app: ModeloConEstilos["app"]): { extendsDefaultNodes: boolean; getFromCollClass: boolean } {
  const a = app.attributes ?? {};
  return {
    extendsDefaultNodes: a["css-extends-default-nodes"] === "true",
    getFromCollClass: a["css-get-node-attrs-from-coll-class"] !== "false",
  };
}

/** Todos los props de una coll, estén sueltos o dentro de un `<group>`. */
function propsDe(coll: ModeloConEstilos["colls"][number]) {
  return [...(coll.props ?? []), ...(coll.groups ?? []).flatMap((g) => g.props ?? [])];
}

export type CargarEstilos = (
  coleccion: string,
  prop: string,
) => Promise<EstiloDeProp | undefined>;

/**
 * El resolvedor de estilos de un proyecto, leyendo el disco con `xone-linter`.
 *
 * **No cachea**, por lo mismo que el índice de navegación: el agente escribe CSS dentro del
 * turno, y una hoja vieja que afirma que una clase pone 14 cuando acaba de ponerse 18 es peor
 * que no tener resolvedor — es una respuesta con autoridad y equivocada.
 *
 * Devuelve `undefined` cuando la colección o el prop no existen: eso NO es un fallo, es un dato,
 * y quien llama dice cómo seguir.
 */
export function estilosEnDisco(cargarModelo: () => Promise<ModeloConEstilos>): CargarEstilos {
  return async (coleccion, prop) => {
    const modelo = await cargarModelo();
    const coll = modelo.colls.find((c) => c.name === coleccion);
    if (coll === undefined) return undefined;
    const elProp = propsDe(coll).find((p) => p.name === prop);
    if (elProp === undefined) return undefined;

    const atributos = elProp.attributes ?? {};
    const clase = atributos["class"];
    const hoja = buildStylesheet(modelo);
    const selectores = selectorsFor(
      "prop",
      clase,
      elProp.type,
      coll.attributes?.["class"],
      banderas(modelo.app)
    );

    // Qué atributos puede aportar la hoja para este prop: la unión de lo que declara cada
    // selector candidato. `collectAttrs` ya sigue los `extends`, así que esto no los pierde.
    const nombres = new Set<string>();
    for (const s of selectores) for (const a of hoja.collectAttrs(s)) nombres.add(a);

    // Y el valor: el PRIMER selector en orden de prioridad que resuelva algo. Es lo que hace
    // `materializeCssAttributes`, y `lookup` se encarga por dentro del orden de ficheros y de
    // la cadena `extends` — por eso no se recorre a mano.
    const deLaHoja: AtributoEfectivo[] = [];
    const aportan = new Map<string, string>();
    for (const atributo of [...nombres].sort()) {
      if (atributo === "extends" || atributo === "extend") continue;
      for (const selector of selectores) {
        const valor = hoja.lookup(selector, atributo);
        if (valor === undefined) continue;
        // El atributo del XML propio GANA siempre (`materialize.ts`), así que lo de la hoja se
        // calla: enseñar los dos como si compitieran haría dudar de cuál se aplica.
        if (atributos[atributo] === undefined) deLaHoja.push({ atributo, valor, de: selector });
        aportan.set(selector, selector);
        break;
      }
    }

    const delXml: AtributoEfectivo[] = Object.entries(atributos)
      .filter(([k]) => k !== "class" && k !== "name")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([atributo, valor]) => ({ atributo, valor, de: DEL_XML }));

    return {
      coll: coleccion,
      prop,
      ...(elProp.type === undefined ? {} : { tipo: elProp.type }),
      ...(clase === undefined ? {} : { clase }),
      selectores,
      deLaHoja,
      delXml,
      declaradoEn: donde(modelo, [...aportan.keys()]),
    };
  };
}

/** En qué fichero se declara cada selector que aportó algo. El basename basta y **no saca una
 *  ruta de la máquina**: `cssFiles` va por ruta relativa, pero el basename es lo que el agente
 *  necesita para abrirlo con las tools y es lo que aparece en `<style url>`. */
function donde(modelo: ModeloConEstilos, selectores: readonly string[]): Array<{ selector: string; fichero: string }> {
  const salida: Array<{ selector: string; fichero: string }> = [];
  for (const selector of selectores) {
    for (const [ruta, texto] of modelo.cssFiles) {
      if (parseCssFile(texto).some((r) => r.selector === selector)) {
        salida.push({ selector, fichero: basename(ruta) });
        break;
      }
    }
  }
  return salida;
}
