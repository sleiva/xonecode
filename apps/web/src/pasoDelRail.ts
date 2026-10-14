import type { DetalleDeLinea } from "./tipos.js";

/**
 * Una línea de tool, contada como un PASO del raíl del chat: «Leyó /login.js», «Delegó en
 * developer-xone», «Leyó 6 veces · a, b, c y 2 más» (rediseño del chat, tablero D del lienzo).
 *
 * El verbo va en PASADO porque el raíl cuenta lo que el agente HIZO, y es de la web: el terminal
 * sigue con su «→ lee» de siempre (`core/notify.ts`), byte a byte. Por eso la tabla vive aquí y
 * no se comparte con el host: es presentación, no una regla.
 *
 * Sale del DATO —el `nombre` de la tool y su `blanco`, que viajan aparte desde que el servidor los
 * manda (`core/actos.ts#DetalleDeLinea`)— y nunca de re-parsear el texto. Sin nombre, o con una
 * tool que no está en la tabla, o sin blanco ni veces (un dato de antes de que viajaran),
 * devuelve `undefined` y quien pinta enseña la línea de antes: una sesión vieja se sigue leyendo
 * igual que siempre.
 */
export interface PasoDelRail {
  verbo: string;
  /** La ruta, el patrón o el especialista de UNA llamada. */
  blanco?: string;
  /** En una racha: cuántas llamadas fueron (≥ 2). */
  veces?: number;
  /** En una racha: los primeros blancos distintos, y cuántos más. */
  blancos?: string[];
  masBlancos?: number;
  /** El blanco es un NOMBRE (un especialista), no una ruta: no va en letra de código. */
  esNombre: boolean;
  /** Una delegación: su nodo va en otro color, porque es otro agente trabajando. */
  delegacion: boolean;
  /** El motivo, si la llamada falló. */
  error?: string;
}

const VERBO: Record<string, string> = {
  read_file: "Leyó",
  ls: "Listó",
  write_file: "Escribió",
  edit_file: "Editó",
  glob: "Buscó",
  grep: "Buscó",
  regex_search: "Buscó",
  buscar_icono: "Buscó el icono",
  buscar_fuente: "Buscó la fuente",
  traer_fuente: "Trajo la fuente",
  comparar_capturas: "Comparó capturas",
  diferencia_de_capturas: "Midió el cambio",
  generar_fondo_svg: "Generó un fondo",
  validar_fichero_xone: "Validó",
  task: "Delegó en",
  execute: "Ejecutó",
  xone_navegacion: "Consultó el modelo",
  xone_atributos: "Consultó los atributos",
  describe_image: "Miró la imagen",
  xone_critica_visual: "Revisó la pantalla",
  marcar_criterios_del_plan: "Marcó criterios",
  incorporar_adjunto: "Incorporó",
  traer_pantalla_de_stitch: "Trajo de Stitch",
};

export function pasoDelRail(detalle: DetalleDeLinea | undefined): PasoDelRail | undefined {
  const nombre = detalle?.nombre;
  if (nombre === undefined) return undefined;
  const verbo = VERBO[nombre];
  if (verbo === undefined) return undefined;
  const d = detalle!;
  // Sin blanco ni veces, el dato es de ANTES de que viajaran (una sesión guardada con el nombre de
  // la tool y sin su ruta): el verbo solo perdería lo que la línea sí dice. Se pinta la línea.
  if (d.blanco === undefined && d.veces === undefined) return undefined;
  return {
    verbo,
    ...(d.blanco === undefined ? {} : { blanco: d.blanco }),
    ...(d.veces === undefined || d.veces < 2 ? {} : { veces: d.veces }),
    ...(d.blancos === undefined || d.blancos.length === 0 ? {} : { blancos: d.blancos }),
    ...(d.masBlancos === undefined || d.masBlancos <= 0 ? {} : { masBlancos: d.masBlancos }),
    ...(d.error === undefined ? {} : { error: d.error }),
    esNombre: nombre === "task",
    delegacion: nombre === "task",
  };
}
