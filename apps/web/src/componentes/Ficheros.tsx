import { useEffect, useState } from "react";
import type { FicheroDelProyecto } from "../tipos.js";
import { arbolDeRutas } from "../arbolDeRutas.js";
import { lenguajeDe } from "../lenguajeDe.js";
import { Arbol } from "./Arbol.js";
import { Visor } from "./Visor.js";
import estilos from "./Ficheros.module.css";

/**
 * El proyecto en el que se trabaja: el árbol a la derecha con un filtro encima, y el
 * fichero elegido en el centro, de SOLO lectura.
 *
 * Lo que se lista y lo que se lee es lo que ve el agente y nada más (`.xonecode`, `.env`,
 * `.git` y los `.xml` aplanados no salen): lo decide el servidor
 * (`agent/arbolDeProyecto.ts`), no este componente. Aquí solo se pinta lo que llega y se
 * DICE lo que no se puede pintar —un binario, un fichero recortado, uno que no es UTF-8,
 * una ruta rechazada— en vez de dejar el centro en blanco.
 *
 * El árbol se pide al montar y `App` lo vuelve a pedir al terminar un turno: el agente
 * puede haber creado ficheros. Si el elegido ya no está en el árbol nuevo, se cierra: un
 * visor enseñando un fichero que ya no existe es una foto vieja sin decirlo.
 */
export function Ficheros({
  arbol,
  contenidos,
  elegido,
  alElegir,
  alRecargar,
}: {
  /** Ausente = todavía no ha llegado; con `error`, no se pudo listar. */
  arbol?: { rutas: string[]; recortado: boolean; error?: string };
  contenidos: Record<string, FicheroDelProyecto>;
  elegido?: string;
  alElegir: (ruta: string | undefined) => void;
  alRecargar: () => void;
}) {
  useEffect(() => {
    alRecargar();
  }, [alRecargar]);

  useEffect(() => {
    if (elegido !== undefined && arbol !== undefined && arbol.error === undefined && !arbol.rutas.includes(elegido)) {
      alElegir(undefined);
    }
  }, [arbol, elegido, alElegir]);

  const [filtro, setFiltro] = useState("");

  if (arbol === undefined) {
    return <p className={estilos.aviso}>Consultando el árbol del proyecto…</p>;
  }
  if (arbol.error !== undefined) {
    return <p className={estilos.aviso}>No se ha podido listar el proyecto: {arbol.error}</p>;
  }

  const contenido = elegido === undefined ? undefined : contenidos[elegido];

  return (
    <div className={estilos.ficheros}>
      <div className={estilos.visor}>
        {elegido === undefined ? (
          <p className={estilos.aviso}>Elige un fichero del árbol.</p>
        ) : (
          <>
            <div className={estilos.cabecera}>{elegido}</div>
            {contenido === undefined ? (
              <p className={estilos.aviso}>Trayendo {elegido}…</p>
            ) : contenido.error !== undefined ? (
              <p className={estilos.aviso}>No se puede enseñar este fichero: {contenido.error}.</p>
            ) : contenido.binario ? (
              <p className={estilos.aviso}>
                Es un fichero binario, {kb(contenido.bytes)} KB. No se enseña su contenido.
              </p>
            ) : (
              <>
                {contenido.recortado ? (
                  <p className={estilos.nota}>
                    Recortado a {kb(contenido.texto?.length ?? 0)} KB de {kb(contenido.bytes)} KB: míralo entero en tu editor.
                  </p>
                ) : null}
                {contenido.codificacion === "latin1" ? (
                  <p className={estilos.nota}>Leído como latin1: el fichero no es UTF-8.</p>
                ) : null}
                <Visor texto={contenido.texto ?? ""} {...(lenguajeDe(elegido) === undefined ? {} : { lenguaje: lenguajeDe(elegido) })} />
              </>
            )}
          </>
        )}
      </div>

      <aside className={estilos.arbol} aria-label="Ficheros del proyecto">
        <input
          type="search"
          className={estilos.filtro}
          placeholder="Filtrar ficheros…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          aria-label="Filtrar ficheros"
        />
        {arbol.recortado ? (
          <p className={estilos.nota}>El árbol está recortado a {arbol.rutas.length} entradas.</p>
        ) : null}
        <Arbol nodos={arbolDeRutas(arbol.rutas)} {...(elegido === undefined ? {} : { elegida: elegido })} alElegir={alElegir} filtro={filtro} />
      </aside>
    </div>
  );
}

/** Kilobytes redondeados, para leer: «2 KB», no «2048 bytes». */
function kb(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}
