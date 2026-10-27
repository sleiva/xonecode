import type { DispositivoElegido, InformeDeDispositivos } from "../tipos.js";
import { PastillaDeDispositivo } from "./PastillaDeDispositivo.js";
import type { EstadoDeGranja } from "../store.js";
import estilos from "./Ajustes.module.css";

/**
 * Con qué aparato NACEN las conversaciones nuevas y las tareas (IXCODE-51, Ajustes > General).
 *
 * Sin él, una sesión nueva no tiene aparato y los scripts del agente prefieren un emulador: con
 * un móvil enchufado, cada conversación nueva y cada tarea acababan en el emulador hasta que
 * alguien cambiaba la pastilla.
 *
 * **El control es la MISMA pastilla del chat** (`enLinea`), no un `<select>`: lo que está a mano va
 * arriba con su punto verde y el estado dicho con palabras, y eso un `<option>` no lo pinta (en
 * macOS la lista la dibuja el sistema). Pedido mirando la pantalla. Se manda solo el ID; el resto
 * lo pone el servidor. Lo que la pastilla ya resuelve —el elegido que ya no está en la medida, y
 * no afirmarlo sin medida— vale igual aquí.
 */
export function DispositivoPorDefecto({
  actual,
  informe,
  activo,
  alElegir,
  alMedir,
  granja,
}: {
  actual?: DispositivoElegido;
  informe?: InformeDeDispositivos;
  activo: boolean;
  alElegir: (id: string | undefined) => void;
  alMedir?: () => void;
  /** La granja de Ajustes: configurada, se ofrece como aparato por omisión (el origen global). */
  granja?: EstadoDeGranja;
}) {
  return (
    <>
      <h3 className={estilos.subencabezado}>Aparato por omisión</h3>
      <div className={estilos.filaDeWorkspace}>
        <PastillaDeDispositivo
          {...(actual === undefined ? {} : { elegido: actual })}
          {...(informe === undefined ? {} : { informe })}
          {...(alMedir === undefined ? {} : { alMedir })}
          conectado={activo}
          alElegir={alElegir}
          {...(granja === undefined ? {} : { granja, ofrecerGranja: true })}
          titulo="Aparato de las conversaciones nuevas"
          pie="Se guarda para todas las conversaciones nuevas y las tareas. Sin ninguno, el agente prefiere un emulador."
          enLinea
        />
      </div>
      <p className={estilos.nota}>
        El aparato con el que empieza cada conversación nueva y cada tarea, en cualquier proyecto. En cada
        conversación se puede cambiar en la pastilla del chat. Si no está conectado al empezar, la
        conversación lo sigue teniendo elegido y lo dice al ejecutar, en vez de pasarse a otro. Con la granja,
        los proyectos que no digan otra cosa (panel del proyecto → Resumen) prueban en ella.
      </p>
    </>
  );
}
