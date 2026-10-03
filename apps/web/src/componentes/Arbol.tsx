import { useId, useState, type ReactNode } from "react";
import type { NodoDelArbol } from "../arbolDeRutas.js";
import { alternarCasilla, estadoDeCasilla, hojasDe } from "../seleccionDelArbol.js";
import { tipoDeFichero } from "../tipoDeFichero.js";
import { IconoDeFichero } from "./IconoDeFichero.js";
import estilos from "./Arbol.module.css";

/**
 * Id ESTABLE del `<ul role="group">` de una carpeta, derivado de su ruta (saneada a
 * `[A-Za-z0-9_-]`, que es lo único seguro en un atributo `id`). El prefijo de instancia
 * (`useId()`) se añade en el componente, no aquí: esta función es pura y se puede probar
 * sin montar nada.
 */
function idDeGrupo(ruta: string): string {
  return `arbol-grupo-${ruta.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** El sangrado de un nivel, en px: lo usan la fila y sus líneas guía, que tienen que caer juntas. */
const sangrado = (nivel: number): number => 8 + nivel * 14;

/**
 * Las líneas guía del sangrado: una vertical por cada nivel por ENCIMA de la fila, a la altura de
 * la flecha de la carpeta de la que cuelga. Son spans absolutos DENTRO del botón de la fila (un
 * `<ul>` no admite nada entre sus `<li>`), y decorativos: el nivel ya lo dice `aria-level`.
 */
function guias(nivel: number): ReactNode {
  return Array.from({ length: nivel }, (_, k) => (
    <span key={k} className={estilos.guia} style={{ left: sangrado(k) + 5 }} data-guia="" aria-hidden="true" />
  ));
}

/**
 * El árbol de ficheros que comparten Ficheros (el proyecto entero) y Revisión (solo los
 * tocados). Lo que cambia entre las dos es qué hay en cada hoja —`insignia`— y qué pasa al
 * pulsarla; el plegado, el filtro y la marca de elegida son los mismos.
 *
 * - **Cuánto nace abierto lo decide quien lo monta** (`abiertas`), porque las dos pestañas
 *   enseñan cosas distintas con el mismo componente. En Ficheros el árbol es el proyecto
 *   ENTERO y nace todo plegado: con el primer nivel abierto, un proyecto de verdad se abre
 *   como una lista de cien ficheros donde no se distingue la forma del proyecto, que es
 *   justo para lo que sirve un árbol. En Revisión son solo los ficheros que la sesión tocó
 *   —un puñado, y verlos es el objetivo de la pestaña—, así que ahí el primer nivel sigue
 *   naciendo abierto: plegarlos costaría un clic por carpeta para llegar a lo único que
 *   hay. La omisión es «primer-nivel» y no «ninguna» porque es la que no se puede
 *   equivocar: si el árbol nace de más, se ve; si nace de menos, parece vacío.
 * - El filtro es por subcadena de la ruta COMPLETA y sin distinguir mayúsculas, y mientras
 *   hay filtro todas las carpetas con alguna hoja que casa se enseñan abiertas: filtrar es
 *   buscar, y una coincidencia dentro de una carpeta plegada no se ve.
 * - La elegida lleva `aria-current` además del fondo, como la fila activa de la barra: el
 *   fondo solo no basta cuando la de al lado está en `:hover`.
 * - Cada fila lleva el icono de su tipo (`IconoDeFichero.tsx`), o el de carpeta abierta/cerrada,
 *   decorativo: el nombre accesible de la fila sigue siendo solo su nombre.
 * - **Con `seleccion`, cada fila lleva su casilla** (el diálogo de la subida): la casilla va
 *   HERMANA del botón y no dentro —un `<button>` no puede contener un control—, la de una
 *   carpeta sale indeterminada si sus hojas van mezcladas, y pulsar una hoja alterna SU
 *   casilla. Pulsar una carpeta sigue plegándola: marcarla es su casilla. La regla de las dos
 *   direcciones es pura, en `seleccionDelArbol.ts`. La sangría y las líneas guía pasan
 *   entonces a la fila, para que la casilla caiga en su nivel.
 * - **UNA estructura de fila para todos; `variante` solo cambia el acabado.** `"explorador"`
 *   (Revisión y el diálogo de la subida) pone las carpetas en negrita con la cuenta de lo
 *   marcado dentro y la insignia al FINAL de la fila; `"plano"` (Ficheros) la deja delante del
 *   nombre, donde las marcas `M`/`●` del editor se leen como columna. Iconos, guías y filas son
 *   los mismos en los dos: dos árboles divergirían el primer día.
 */
export function Arbol({
  nodos,
  elegida,
  alElegir,
  filtro = "",
  insignia,
  abiertas = "primer-nivel",
  seleccion,
  variante = "plano",
}: {
  nodos: readonly NodoDelArbol[];
  elegida?: string;
  alElegir: (ruta: string) => void;
  /** Ya en minúsculas o no: se normaliza aquí. Vacío = sin filtro. */
  filtro?: string;
  insignia?: (ruta: string) => ReactNode;
  /**
   * Qué nace abierto antes de que nadie pulse nada. Ver el porqué arriba. `"todas"` es el del
   * diálogo de la subida: lo que hay delante es lo que se va a publicar, y una carpeta plegada
   * escondería qué se marca al marcarla.
   */
  abiertas?: "primer-nivel" | "ninguna" | "todas";
  /** Casillas por fila: las hojas marcadas, y qué hacer con la selección nueva. */
  seleccion?: {
    marcadas: ReadonlySet<string>;
    alCambiar: (marcadas: Set<string>) => void;
    /** `true` = se ven pero no se pueden cambiar (la subida ya está en marcha). */
    bloqueada?: boolean;
  };
  /** El acabado: `plano` (Ficheros) o `explorador` (Revisión y el diálogo de la subida). */
  variante?: "plano" | "explorador";
}) {
  const explorador = variante === "explorador";
  // Las carpetas que el usuario ha CAMBIADO respecto a su estado inicial (el que decide
  // `abiertas`). Guardar el cambio y no el estado es lo que hace que un árbol nuevo del
  // servidor no cierre lo que estaba abierto.
  const [cambiadas, setCambiadas] = useState<ReadonlySet<string>>(new Set());
  const aguja = filtro.trim().toLowerCase();
  // Prefijo de instancia: dos árboles en la misma página (Ficheros y Revisión) no pueden
  // compartir ids de grupo.
  const prefijoId = useId();
  const idDelGrupo = (ruta: string): string => `${prefijoId}${idDeGrupo(ruta)}`;

  const casa = (nodo: NodoDelArbol): boolean =>
    nodo.hijos === undefined ? nodo.ruta.toLowerCase().includes(aguja) : nodo.hijos.some(casa);

  const abierta = (nodo: NodoDelArbol, nivel: number): boolean => {
    if (aguja !== "") return true;
    const porOmision = abiertas === "todas" || (abiertas === "primer-nivel" && nivel === 0);
    return cambiadas.has(nodo.ruta) ? !porOmision : porOmision;
  };

  const alternar = (ruta: string): void =>
    setCambiadas((previas) => {
      const siguientes = new Set(previas);
      if (siguientes.has(ruta)) siguientes.delete(ruta);
      else siguientes.add(ruta);
      return siguientes;
    });

  /** La casilla de un nodo, o nada sin `seleccion`. */
  const casilla = (nodo: NodoDelArbol): ReactNode => {
    if (seleccion === undefined) return null;
    const estado = estadoDeCasilla(nodo, seleccion.marcadas);
    return (
      <input
        type="checkbox"
        className={estilos.casilla}
        aria-label={`Subir ${nodo.ruta}`}
        checked={estado === "todas"}
        disabled={seleccion.bloqueada === true}
        // `indeterminate` no es un atributo de HTML: solo existe como propiedad del DOM.
        ref={(elemento) => {
          if (elemento !== null) elemento.indeterminate = estado === "algunas";
        }}
        onChange={() => seleccion.alCambiar(alternarCasilla(nodo, seleccion.marcadas))}
      />
    );
  };

  /**
   * Sin casillas la fila es el botón a secas, como siempre, y la sangría y las guías van en él.
   * Con ellas, casilla + botón en una fila que se lleva la sangría y las guías, para que la
   * casilla quede alineada con su nivel y la guía caiga bajo la casilla de la carpeta.
   */
  const fila = (nodo: NodoDelArbol, nivel: number, boton: ReactNode): ReactNode =>
    seleccion === undefined ? (
      boton
    ) : (
      <div className={estilos.fila} style={{ paddingLeft: sangrado(nivel) }}>
        {guias(nivel)}
        {casilla(nodo)}
        {boton}
      </div>
    );
  const sangria = (nivel: number): number => (seleccion === undefined ? sangrado(nivel) : 4);

  /** «3/5»: cuántas hojas de la carpeta van marcadas. Solo con casillas y en el explorador. */
  const cuentaDeCarpeta = (nodo: NodoDelArbol): ReactNode => {
    if (!explorador || seleccion === undefined) return null;
    const hojas = hojasDe(nodo);
    const marcadas = hojas.filter((ruta) => seleccion.marcadas.has(ruta)).length;
    return (
      <span className={estilos.cuenta} aria-hidden="true">
        {marcadas}/{hojas.length}
      </span>
    );
  };

  const pintar = (lista: readonly NodoDelArbol[], nivel: number, id?: string): ReactNode => (
    <ul
      id={id}
      className={estilos.nivel}
      role={nivel === 0 ? "tree" : "group"}
      data-explorador={explorador ? "" : undefined}
    >
      {lista.filter(casa).map((nodo) =>
        nodo.hijos === undefined ? (
          <li key={nodo.ruta} role="none">
            {fila(
              nodo,
              nivel,
              <button
                type="button"
                role="treeitem"
                className={estilos.hoja}
                style={{ paddingLeft: sangria(nivel) }}
                aria-level={nivel + 1}
                // Para pintar en gris el nombre de un `.xml`, que genera XOne Studio y no se toca.
                data-fichero={tipoDeFichero(nodo.ruta)}
                {...(nodo.ruta === elegida ? { "aria-current": "true" as const } : {})}
                data-elegida={nodo.ruta === elegida ? "" : undefined}
                onClick={() =>
                  seleccion === undefined
                    ? alElegir(nodo.ruta)
                    : seleccion.bloqueada === true
                      ? undefined
                      : seleccion.alCambiar(alternarCasilla(nodo, seleccion.marcadas))
                }
              >
                {seleccion === undefined ? guias(nivel) : null}
                {/* El hueco de la flecha, vacío: así el icono de una hoja cae bajo el de las carpetas
                    de su mismo nivel y la columna de iconos se lee recta. */}
                <span className={estilos.flecha} aria-hidden="true" />
                <IconoDeFichero ruta={nodo.ruta} />
                {insignia === undefined || explorador ? null : <span className={estilos.insignia}>{insignia(nodo.ruta)}</span>}
                <span className={estilos.nombre}>{nodo.nombre}</span>
                {insignia === undefined || !explorador ? null : (
                  <span className={`${estilos.insignia} ${estilos.alFinal}`}>{insignia(nodo.ruta)}</span>
                )}
              </button>
            )}
          </li>
        ) : (
          <li key={nodo.ruta} role="none">
            {fila(
              nodo,
              nivel,
              <button
                type="button"
                role="treeitem"
                className={estilos.carpeta}
                style={{ paddingLeft: sangria(nivel) }}
                aria-expanded={abierta(nodo, nivel)}
                aria-level={nivel + 1}
                // El nombre accesible se fija con aria-label: sin él, aria-owns hace que el
                // cálculo de «nombre por contenido» recorra también el grupo poseído y el
                // botón de la carpeta acabaría llamándose «src Clientes.xne Pedidos.xne …».
                aria-label={nodo.nombre}
                // El `<ul role="group">` de los hijos vive como HERMANO de este botón, no
                // dentro de él —un <button> no puede contener un <ul>—, así que la relación
                // padre-hijo se declara con aria-owns en vez de anidar el DOM: sin esto el
                // árbol se oía plano en un lector de pantalla. Solo mientras el grupo esté
                // pintado: aria-owns apuntando a un id que no existe es un error de a11y.
                aria-owns={abierta(nodo, nivel) ? idDelGrupo(nodo.ruta) : undefined}
                onClick={() => alternar(nodo.ruta)}
              >
                {seleccion === undefined ? guias(nivel) : null}
                <span className={estilos.flecha} aria-hidden="true">
                  {abierta(nodo, nivel) ? "▾" : "▸"}
                </span>
                <IconoDeFichero ruta={nodo.ruta} carpeta abierta={abierta(nodo, nivel)} />
                <span className={estilos.nombre}>{nodo.nombre}</span>
                {cuentaDeCarpeta(nodo)}
              </button>
            )}
            {abierta(nodo, nivel) ? pintar(nodo.hijos, nivel + 1, idDelGrupo(nodo.ruta)) : null}
          </li>
        )
      )}
    </ul>
  );

  return pintar(nodos, 0);
}
