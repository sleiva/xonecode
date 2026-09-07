import { useId, useState, type ReactNode } from "react";
import type { NodoDelArbol } from "../arbolDeRutas.js";
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

/**
 * El árbol de ficheros que comparten Ficheros (el proyecto entero) y Revisión (solo los
 * tocados). Lo que cambia entre las dos es qué hay en cada hoja —`insignia`— y qué pasa al
 * pulsarla; el plegado, el filtro y la marca de elegida son los mismos.
 *
 * - Las carpetas del PRIMER nivel nacen abiertas y las de dentro cerradas: abrirlo todo en
 *   un proyecto de cien ficheros es una lista; cerrarlo todo obliga a dos clics para ver
 *   cualquier cosa.
 * - El filtro es por subcadena de la ruta COMPLETA y sin distinguir mayúsculas, y mientras
 *   hay filtro todas las carpetas con alguna hoja que casa se enseñan abiertas: filtrar es
 *   buscar, y una coincidencia dentro de una carpeta plegada no se ve.
 * - La elegida lleva `aria-current` además del fondo, como la fila activa de la barra: el
 *   fondo solo no basta cuando la de al lado está en `:hover`.
 */
export function Arbol({
  nodos,
  elegida,
  alElegir,
  filtro = "",
  insignia,
}: {
  nodos: readonly NodoDelArbol[];
  elegida?: string;
  alElegir: (ruta: string) => void;
  /** Ya en minúsculas o no: se normaliza aquí. Vacío = sin filtro. */
  filtro?: string;
  insignia?: (ruta: string) => ReactNode;
}) {
  // Las carpetas que el usuario ha CAMBIADO respecto a su estado inicial (abierta en el
  // primer nivel, cerrada dentro). Guardar el cambio y no el estado es lo que hace que un
  // árbol nuevo del servidor no cierre lo que estaba abierto.
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
    const porOmision = nivel === 0;
    return cambiadas.has(nodo.ruta) ? !porOmision : porOmision;
  };

  const alternar = (ruta: string): void =>
    setCambiadas((previas) => {
      const siguientes = new Set(previas);
      if (siguientes.has(ruta)) siguientes.delete(ruta);
      else siguientes.add(ruta);
      return siguientes;
    });

  const pintar = (lista: readonly NodoDelArbol[], nivel: number, id?: string): ReactNode => (
    <ul id={id} className={estilos.nivel} role={nivel === 0 ? "tree" : "group"}>
      {lista.filter(casa).map((nodo) =>
        nodo.hijos === undefined ? (
          <li key={nodo.ruta} role="none">
            <button
              type="button"
              role="treeitem"
              className={estilos.hoja}
              style={{ paddingLeft: 8 + nivel * 14 }}
              aria-level={nivel + 1}
              {...(nodo.ruta === elegida ? { "aria-current": "true" as const } : {})}
              data-elegida={nodo.ruta === elegida ? "" : undefined}
              onClick={() => alElegir(nodo.ruta)}
            >
              {insignia === undefined ? null : <span className={estilos.insignia}>{insignia(nodo.ruta)}</span>}
              <span className={estilos.nombre}>{nodo.nombre}</span>
            </button>
          </li>
        ) : (
          <li key={nodo.ruta} role="none">
            <button
              type="button"
              role="treeitem"
              className={estilos.carpeta}
              style={{ paddingLeft: 8 + nivel * 14 }}
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
              <span className={estilos.flecha} aria-hidden="true">
                {abierta(nodo, nivel) ? "▾" : "▸"}
              </span>
              <span className={estilos.nombre}>{nodo.nombre}</span>
            </button>
            {abierta(nodo, nivel) ? pintar(nodo.hijos, nivel + 1, idDelGrupo(nodo.ruta)) : null}
          </li>
        )
      )}
    </ul>
  );

  return pintar(nodos, 0);
}
