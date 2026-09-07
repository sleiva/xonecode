import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import {
  IconEditOutline16,
  IconEllipsisOutline16,
  IconTrashOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { useCerrarAlPulsarFuera } from "../cerrarAlPulsarFuera.js";
import filas from "../../estilos/Rows.module.css";
import estilos from "./MenuDeSesion.module.css";

/**
 * El «…» de una sesión en la barra, con lo que se puede HACER con ella.
 *
 * **Dos entradas y no las cuatro del harness de deepseek.** Su fila de sesión ofrece
 * renombrar, bifurcar y archivar (`dsh-client-ui-workspace`, `SessionNodeItem`: `onRename`,
 * `onFork`, `onArchive`). Aquí solo caben dos, y las otras dos no es que falten — es que no
 * significan nada en este producto:
 *
 * - **Bifurcar no está hecho, y el motivo CAMBIÓ.** Era que no había qué bifurcar: el hilo
 *   moría con el proceso y reabrir era releer, así que dos copias de una conversación que el
 *   modelo no recuerda son dos copias muertas. Desde que el hilo se guarda
 *   (`agent/checkpointer.ts`) eso ya no es cierto — bifurcar sería copiar el hilo bajo otro
 *   id y dar de alta otra sesión, y es una operación que ahora SÍ significa algo. No está
 *   aquí porque no está implementada, que es distinto de no tener sentido, y decir lo
 *   primero cuando pasa lo segundo es cómo un motivo viejo se queda de excusa.
 * - **Archivar es un estado que no existe.** Habría que inventarlo entero —un campo en el
 *   índice, un filtro en la barra, un sitio donde ver lo archivado— para que el botón
 *   significara algo. Mientras no exista, «archivar» sería «desaparecer», que es borrar
 *   con otro nombre y sin avisar.
 *
 * El icono es `IconEllipsisOutline16`, comprobado en los exports del paquete instalado:
 * `Cabecera.tsx` documenta que este release candidate no exporta todo lo que su código usa,
 * y montar un `undefined` revienta con «Element type is invalid».
 */
export function MenuDeSesion({
  titulo,
  className,
  alRenombrar,
  alBorrar,
}: {
  /** El nombre de la sesión, para que el botón diga de CUÁL es. Tres «…» idénticos son
   *  indistinguibles para quien navega con lector de pantalla. */
  titulo: string;
  /**
   * La clase de la fila que lo contiene. Hace falta porque quien decide CUÁNDO se ve el «…»
   * es la fila —al posar el ratón o al recibir el foco—, y eso es un selector de
   * descendencia: dos CSS Modules distintos no se alcanzan entre sí, así que la regla tiene
   * que vivir en la misma hoja que la clase de la fila.
   */
  className?: string;
  alRenombrar: () => void;
  alBorrar: () => void;
}) {
  const envoltura = useRef<HTMLSpanElement>(null);
  const [abierto, setAbierto] = useState(false);
  const cerrar = useCallback(() => setAbierto(false), []);
  useCerrarAlPulsarFuera(abierto, envoltura, cerrar);

  // Elegir cierra: el diálogo que viene después es de la aplicación, no de este menú, y
  // dejarlo abierto detrás lo dejaría colgando cuando se cierre aquel.
  const elegir = (accion: () => void) => () => {
    setAbierto(false);
    accion();
  };

  return (
    // `data-abierto` para que la fila lo mantenga visible mientras el menú está desplegado:
    // si se escondiera al salir el ratón, el menú se quedaría colgando de la nada.
    <span className={clsx(estilos.ancla, className)} data-abierto={abierto ? "" : undefined} ref={envoltura}>
      <button
        type="button"
        className={filas.iconButton}
        aria-label={`opciones de «${titulo}»`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((x) => !x)}
      >
        <IconEllipsisOutline16 size={16} />
      </button>
      {abierto ? (
        <div className={estilos.menu} role="menu">
          <button type="button" role="menuitem" className={estilos.opcion} onClick={elegir(alRenombrar)}>
            <IconEditOutline16 size={16} />
            Renombrar
          </button>
          <button
            type="button"
            role="menuitem"
            className={clsx(estilos.opcion, estilos.destructiva)}
            onClick={elegir(alBorrar)}
          >
            <IconTrashOutline16 size={16} />
            Eliminar
          </button>
        </div>
      ) : null}
    </span>
  );
}
