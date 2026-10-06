import { useEffect, useRef, useState } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import coraza from "./Pregunta.module.css";
import base from "./ConsultaDelAgente.module.css";
import estilos from "./PropuestaDeTareas.module.css";

/** Una tarea de la propuesta, como la escribió el agente. */
export interface TareaDeLaPropuesta {
  titulo: string;
  peticion: string;
  adjuntos?: string[];
}

/** Cómo acabó una propuesta: `encoladas` presente es que se encoló; si no, se descartó (`enChat`:
 *  para hacerlo en la propia conversación). */
export interface PropuestaResuelta {
  encoladas?: readonly string[];
  enChat?: boolean;
}

/**
 * La PROPUESTA del orquestador de repartir un encargo en tareas de fondo que corren en orden
 * (`core/repartoDeEncargo.ts`), como tarjeta del hilo.
 *
 * - **Pendiente** (con `alEncolar`): cada tarea numerada, con los adjuntos que se llevará y su
 *   encargo EDITABLE, que empieza siendo la petición del orquestador. **No se vuelve a redactar**:
 *   el orquestador la escribió con la conversación delante, que un redactor aparte no ve, y en la
 *   prueba real el redactor la alargaba hasta su tope y la cortaba a mitad de frase.
 * - Tres salidas: encolar en orden, hacerlo aquí en el chat (sin tareas), o descartar.
 * - **Resuelta**: los títulos a la vista y cada encargo plegado, diciendo cómo acabó.
 *
 * Encolar es la AUTORIZACIÓN para que esas tareas escriban sin preguntar, así que esta tarjeta
 * siempre espera el clic, también en modo autónomo, y lo dice encima de los botones.
 */
export function PropuestaDeTareas({
  motivo,
  tareas,
  resuelta,
  alEncolar,
  alHacerEnChat,
  alDescartar,
}: {
  motivo: string;
  tareas: readonly TareaDeLaPropuesta[];
  resuelta?: PropuestaResuelta;
  /** Devuelven el motivo si el servidor se negó; nada si se hizo. */
  alEncolar?: (encargos: string[]) => Promise<string | undefined>;
  alHacerEnChat?: () => Promise<string | undefined>;
  alDescartar?: () => Promise<string | undefined>;
}) {
  // Lo que la persona TECLEÓ, por índice. Lo que no está aquí es la petición del orquestador.
  const [editados, setEditados] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [abiertos, setAbiertos] = useState<Record<number, boolean>>({});
  const [negativa, setNegativa] = useState<string | undefined>(undefined);
  const enVuelo = useRef(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  const pendiente = resuelta === undefined && alEncolar !== undefined;

  const encargoDe = (i: number): string => editados[i] ?? tareas[i]!.peticion;

  const actuar = (accion: () => Promise<string | undefined>): void => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setEnviando(true);
    setNegativa(undefined);
    void accion()
      .catch(() => "el envío falló: vuelve a intentarlo cuando la conexión se recupere")
      .then((motivo) => {
        enVuelo.current = false;
        if (!montado.current) return;
        setEnviando(false);
        if (motivo !== undefined) setNegativa(motivo);
      });
  };

  const cabecera =
    resuelta === undefined
      ? `El agente propone ${tareas.length} tareas de fondo, en orden`
      : resuelta.encoladas !== undefined
        ? `Propuesta de ${tareas.length} tareas · encoladas en orden`
        : resuelta.enChat === true
          ? `Propuesta de ${tareas.length} tareas · se hace en esta conversación`
          : `Propuesta de ${tareas.length} tareas · descartada`;

  return (
    <section className={base.tarjeta} aria-label="Propuesta de tareas de fondo">
      <p className={base.cabecera}>
        <span aria-hidden="true" className={base.marca}>
          ⇢
        </span>
        {cabecera}
      </p>
      <p className={estilos.motivo}>{motivo}</p>
      <ol className={estilos.tareas}>
        {tareas.map((t, i) => (
          <li key={i} className={estilos.tarea}>
            <p className={estilos.titulo}>{`${i + 1}. ${t.titulo}`}</p>
            {t.adjuntos !== undefined && t.adjuntos.length > 0 ? (
              <p className={estilos.adjuntos}>{`Adjuntos: ${t.adjuntos.map((a) => a.replace(/^\/adjuntos\//, "")).join(", ")}`}</p>
            ) : null}
            {pendiente ? (
              <>
                <label className={estilos.etiqueta} htmlFor={`propuesta-${i}-encargo`}>
                  Encargo
                </label>
                <textarea
                  id={`propuesta-${i}-encargo`}
                  className={base.campo}
                  rows={6}
                  value={encargoDe(i)}
                  disabled={enviando}
                  onChange={(e) => {
                    const valor = e.target.value;
                    setEditados((antes) => ({ ...antes, [i]: valor }));
                  }}
                />
              </>
            ) : (
              // Plegado: resuelta, la tarjeta es un registro, y un encargo entero por tarea la hacía
              // de varias pantallas (medido en la prueba real).
              <details
                className={estilos.plegable}
                onToggle={(e) => {
                  const abierto = (e.currentTarget as HTMLDetailsElement).open;
                  setAbiertos((antes) => ({ ...antes, [i]: abierto }));
                }}
              >
                <summary>Ver el encargo</summary>
                {/* Lo plegado se DESMONTA (regla del cliente). */}
                {abiertos[i] === true ? <p className={estilos.peticion}>{t.peticion}</p> : null}
              </details>
            )}
          </li>
        ))}
      </ol>
      {pendiente ? (
        <>
          <p className={estilos.advertencia}>
            {`Se crearán ${tareas.length} tareas de fondo que corren EN ORDEN y escriben sin pedir aprobación. No arrancan mientras tengas abierta la consola de este proyecto.`}
          </p>
          <div className={base.decisiones}>
            <Button
              type="button"
              variant="outline"
              className={coraza.cancelar}
              disabled={enviando || alDescartar === undefined}
              onClick={() => alDescartar !== undefined && actuar(alDescartar)}
            >
              Descartar
            </Button>
            {alHacerEnChat === undefined ? null : (
              <Button
                type="button"
                variant="outline"
                className={coraza.cancelar}
                disabled={enviando}
                onClick={() => actuar(alHacerEnChat)}
              >
                Hacerlo aquí en el chat
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              className={coraza.accion}
              disabled={enviando}
              onClick={() => actuar(() => alEncolar!(tareas.map((_, i) => (encargoDe(i).trim() === "" ? tareas[i]!.peticion : encargoDe(i)))))}
            >
              {enviando ? "Un momento…" : "Encolar en orden"}
            </Button>
          </div>
        </>
      ) : null}
      {negativa !== undefined ? (
        <p className={coraza.fallo} role="alert">
          {`No se pudo: ${negativa}`}
        </p>
      ) : null}
    </section>
  );
}
