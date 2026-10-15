import { useCallback, useMemo, useState } from "react";
import type { Acto, FicheroDelProyecto } from "../tipos.js";
import { Artefactos, OrigenDeArtefactosContexto, artefactosDeLosActos } from "./Artefactos.js";
import { Transcript } from "./Transcript.js";
import estilos from "./LecturaDeSesion.module.css";

/**
 * Por qué esta conversación se LEE y no se escribe, decidido ahora mismo por quien la monta:
 * - `tarea`: una tarea de fondo escribe en su proyecto (IXCODE-36);
 * - `trabajando`: el proyecto trabaja en OTRA conversación tuya;
 * - `atencion`: la tarea se ha parado a esperar TU respuesta: es el único momento en que hace falta
 *   la caja, y se ofrece ir a contestar;
 * - `libre`: ya no hay nada que lo impida, y se ofrece abrirla para escribir;
 * - `finalizada`: es la de una tarea TERMINADA, abierta desde «Finalizadas» para ver lo que hizo. Es un registro:
 *   no se ofrece escribir, que reabriría como chat lo que se entregó como tarea.
 */
export type MotivoDeLectura = "tarea" | "atencion" | "trabajando" | "libre" | "finalizada";

const TEXTO: Record<MotivoDeLectura, string> = {
  tarea:
    "Solo lectura: una tarea está trabajando en este proyecto. No se puede escribir aquí ni empezar otra conversación hasta que termine o la pares (pestaña Tareas del proyecto).",
  atencion: "La tarea necesita tu respuesta.",
  trabajando:
    "Solo lectura: este proyecto está trabajando en otra conversación, y dos a la vez se pisarían los ficheros. Podrás escribir aquí cuando termine.",
  libre: "Ya no hay nada trabajando en este proyecto: puedes abrir esta conversación para seguir en ella.",
  finalizada: "Tarea finalizada: esto es lo que hizo, con su conversación y sus artefactos. Solo lectura.",
};

/**
 * Una conversación ABIERTA PARA LEER (IXCODE-36): su historial, sin caja de chat.
 *
 * Antes, una conversación en la que no se podía escribir —la de un proyecto donde trabaja una tarea,
 * o una que no es la que está trabajando— no se abría: el clic se rechazaba y había que esperar para
 * ver qué contenía. Leer no compite con nadie, así que se enseña, y en el sitio del compositor va
 * una banda que dice por qué no se puede escribir. No se abre ninguna consola: los actos vienen del
 * disco (`leerSesion`) o, si es la de una tarea en marcha, en vivo (`mirar`).
 *
 * `actos` ausente = todavía no han llegado; `error` = el servidor se negó, y se dice.
 */
export function LecturaDeSesion({
  actos,
  error,
  vivo,
  motivo,
  pregunta,
  origen,
  pedirArtefacto,
  conectado,
  alAbrirParaEscribir,
  alIrALaQueTrabaja,
  alCerrar,
}: {
  actos?: readonly Acto[];
  error?: string;
  /** Llega en vivo: es la conversación de una tarea que está trabajando ahora. */
  vivo: boolean;
  motivo: MotivoDeLectura;
  /** Con `atencion`: lo que la tarea pregunta (su motivo de aparcar). */
  pregunta?: string;
  /**
   * De qué proyecto y conversación es: con él, sus artefactos se piden a SU carpeta (miniaturas incluidas) y se ven
   * aquí dentro, no en el panel de la conversación abierta, que es otra lista. Ausente = no se ofrecen.
   */
  origen?: { proyecto: string; sesion: string };
  /** El contenido de uno de sus artefactos, contestado en la propia respuesta (nunca por el store, que va por ruta). */
  pedirArtefacto?: (nombre: string) => Promise<FicheroDelProyecto>;
  conectado?: boolean;
  /** Con `libre` o `atencion`: abrirla de verdad, con la caja. */
  alAbrirParaEscribir: () => void;
  /** Con `trabajando`: ir a la conversación que trabaja. Ausente = no se sabe cuál. */
  alIrALaQueTrabaja?: () => void;
  alCerrar: () => void;
}) {
  const artefactos = useMemo(() => (actos === undefined ? [] : artefactosDeLosActos(actos)), [actos]);
  /** Los artefactos se ven aquí mismo, en lugar del hilo: solo con `origen` (sin él se pedirían los de la abierta). */
  const conArtefactos = origen !== undefined && pedirArtefacto !== undefined && artefactos.length > 0;
  const [viendoArtefactos, setViendoArtefactos] = useState(false);
  const [elegido, setElegido] = useState<string | undefined>(undefined);
  const [contenidos, setContenidos] = useState<Record<string, FicheroDelProyecto>>({});
  const pedir = useCallback(
    (nombre: string) => {
      if (pedirArtefacto === undefined) return;
      const ruta = `/artefactos/${nombre}`;
      void pedirArtefacto(nombre)
        .catch((): FicheroDelProyecto => ({ ruta, recortado: false, binario: false, bytes: 0, error: "no se pudo leer el artefacto" }))
        .then((fichero) => setContenidos((antes) => ({ ...antes, [ruta]: fichero })));
    },
    [pedirArtefacto]
  );
  const abrirArtefacto = useCallback((ruta: string) => {
    setElegido(ruta);
    setViendoArtefactos(true);
  }, []);
  return (
    <OrigenDeArtefactosContexto.Provider value={origen}>
      {error !== undefined ? (
        <p className={estilos.error} role="alert">{`No se pudo leer esta conversación: ${error}`}</p>
      ) : actos === undefined ? (
        <p className={estilos.cargando}>Leyendo la conversación…</p>
      ) : conArtefactos && viendoArtefactos ? (
        <div className={estilos.artefactos}>
          <Artefactos
            lista={artefactos}
            contenidos={contenidos}
            {...(elegido === undefined ? {} : { elegido })}
            alElegir={setElegido}
            alPedir={pedir}
            {...(conectado === undefined ? {} : { conectado })}
          />
        </div>
      ) : (
        <Transcript actos={actos} turnoEnVuelo={vivo} {...(conArtefactos ? { alAbrirArtefacto: abrirArtefacto } : {})} />
      )}
      <div className={estilos.banda} role="note">
        <p className={estilos.texto}>
          {TEXTO[motivo]}
          {motivo === "atencion" && pregunta !== undefined ? <span className={estilos.pregunta}>{pregunta}</span> : null}
        </p>
        <div className={estilos.acciones}>
          {motivo === "atencion" ? (
            <button type="button" className={estilos.principal} onClick={alAbrirParaEscribir}>
              Responder
            </button>
          ) : motivo === "libre" ? (
            <button type="button" className={estilos.principal} onClick={alAbrirParaEscribir}>
              Abrir para escribir
            </button>
          ) : null}
          {!conArtefactos ? null : viendoArtefactos ? (
            <button type="button" className={estilos.boton} onClick={() => setViendoArtefactos(false)}>
              Ver la conversación
            </button>
          ) : (
            <button type="button" className={estilos.boton} onClick={() => setViendoArtefactos(true)}>
              {`Artefactos (${artefactos.length})`}
            </button>
          )}
          {motivo === "trabajando" && alIrALaQueTrabaja !== undefined ? (
            <button type="button" className={estilos.boton} onClick={alIrALaQueTrabaja}>
              Ir a la que trabaja
            </button>
          ) : null}
          <button type="button" className={estilos.boton} onClick={alCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </OrigenDeArtefactosContexto.Provider>
  );
}
