/**
 * La FOTO del modelo XOne de un proyecto para la pestaña Colecciones: lo mismo que contesta
 * `xone_navegacion`, entero y de una vez, para que una persona lo mire.
 *
 * **Sale del MISMO índice que la tool** (`core/navegacion.ts#construirIndice`) y no de una
 * segunda lectura del modelo: «qué apunta a qué» se decide en un sitio, y el día que la tool y
 * la pestaña contestaran distinto sobre el mismo proyecto no habría forma de saber cuál miente.
 *
 * Todo lo que lleva son rutas VIRTUALES y nombres del proyecto —lo que ya ve el agente—, nunca
 * una ruta de la máquina: viaja por el cable. Y, como el índice, **no dice qué colecciones son
 * huérfanas**: se midió y el 50 % eran falsos positivos (ver `core/navegacion.ts`).
 */
import { construirIndice, type ModeloDeNavegacion, type Referencia } from "./navegacion.js";

export interface ColeccionDeLaFoto {
  nombre: string;
  /** Ruta VIRTUAL del `.xne`. */
  fichero: string;
  campos: { nombre: string; tipo?: string }[];
  eventos: string[];
  nodos: string[];
  conexiones: string[];
  /** Lo que ELLA apunta: sus atributos y los scripts que viven dentro de ella. */
  apuntaA: Referencia[];
  /** Lo que apunta HACIA ella, venga de donde venga. */
  leApuntan: Referencia[];
}

export interface FotoDeColecciones {
  colecciones: ColeccionDeLaFoto[];
  /** Cuántas colecciones tiene el proyecto: más que `colecciones.length` = se recortó. */
  total: number;
  /** Por dónde arranca la app, según `app.xml`. Vacío = no consta, que no es «no hay». */
  entrada: string[];
  login: string[];
  /** Referencias a una colección que no existe. */
  rotas: Referencia[];
}

/**
 * Cuántas colecciones caben en una foto. Un proyecto real anda por las decenas; el tope existe
 * para que uno raro no mande un mensaje sin fondo, y lo que queda fuera se CUENTA (`total`).
 */
export const TOPE_DE_COLECCIONES_EN_LA_FOTO = 400;

export function fotoDeColecciones(modelo: ModeloDeNavegacion, tope = TOPE_DE_COLECCIONES_EN_LA_FOTO): FotoDeColecciones {
  const indice = construirIndice(modelo);
  const colecciones = modelo.colecciones.slice(0, tope).map((c): ColeccionDeLaFoto => {
    // Los scripts que viven DENTRO de su `.xne` —sus eventos, sus `onclick`, sus `method`—,
    // reconocidos por el FICHERO y no por el `desde`: ése puede ser `Coll.PROP`, `Coll:evento`
    // o la ruta de un `.js` suelto, y partirlo por el punto confundiría las tres formas. Los de
    // un `.js` suelto no son de ninguna colección; los que llegan HACIA ella los recoge
    // `referencias` entera.
    const deSusScripts = modelo.referenciasDeScript.filter((r) => r.fichero === c.fichero);
    return {
      nombre: c.nombre,
      fichero: c.fichero,
      campos: c.campos.map((f) => ({ nombre: f.nombre, ...(f.tipo === undefined ? {} : { tipo: f.tipo }) })),
      eventos: [...c.eventos],
      nodos: [...c.nodos],
      conexiones: [...c.conexiones],
      apuntaA: [...c.referencias.map((r) => ({ ...r, fichero: c.fichero })), ...deSusScripts],
      leApuntan: [...indice.referencias(c.nombre)],
    };
  });
  const app = indice.app();
  return {
    colecciones,
    total: modelo.colecciones.length,
    entrada: [...app.entrada],
    login: [...app.login],
    rotas: [...indice.problemas().rotas],
  };
}
