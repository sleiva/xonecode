import { useState, type ReactNode } from "react";
import type { NodoDelArbol } from "../arbolDeRutas.js";
import estilos from "./Arbol.module.css";

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

  const pintar = (lista: readonly NodoDelArbol[], nivel: number): ReactNode => (
    <ul className={estilos.nivel} role={nivel === 0 ? "tree" : "group"}>
      {lista.filter(casa).map((nodo) =>
        nodo.hijos === undefined ? (
          <li key={nodo.ruta} role="none">
            <button
              type="button"
              role="treeitem"
              className={estilos.hoja}
              style={{ paddingLeft: 8 + nivel * 14 }}
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
              onClick={() => alternar(nodo.ruta)}
            >
              <span className={estilos.flecha} aria-hidden="true">
                {abierta(nodo, nivel) ? "▾" : "▸"}
              </span>
              <span className={estilos.nombre}>{nodo.nombre}</span>
            </button>
            {abierta(nodo, nivel) ? pintar(nodo.hijos, nivel + 1) : null}
          </li>
        )
      )}
    </ul>
  );

  return pintar(nodos, 0);
}
