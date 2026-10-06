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

/** El encargo redactado de una tarea, o por qué no se pudo. Ausente = todavía no llegó. */
export type AumentoDeTarea = { encargo: string } | { error: string };

/**
 * La PROPUESTA del orquestador de repartir un encargo en tareas de fondo que corren en orden
 * (`core/repartoDeEncargo.ts`), como tarjeta del hilo.
 *
 * - **Pendiente** (con `alEncolar`): cada tarea numerada, con los adjuntos que se llevará y su
 *   encargo EDITABLE. El encargo empieza siendo la petición del agente y se SUSTITUYE por el
 *   redactado en cuanto llega, salvo que la persona ya lo haya tocado: lo tecleado no se pisa.
 *   Al montarse pide redactarlos (`alPedirAumento`), una vez.
 * - **Resuelta** (`resuelta`): las mismas tareas sin controles, diciendo si se encolaron o se
 *   descartaron.
 *
 * Encolar es la AUTORIZACIÓN para que esas tareas escriban sin preguntar, así que esta tarjeta
 * siempre espera el clic, también en modo autónomo, y lo dice encima de los botones.
 */
export function PropuestaDeTareas({
  motivo,
  tareas,
  aumentos,
  resuelta,
  alPedirAumento,
  alEncolar,
  alDescartar,
}: {
  motivo: string;
  tareas: readonly TareaDeLaPropuesta[];
  /** Lo redactado por índice de tarea, según llega. */
  aumentos?: Readonly<Record<number, AumentoDeTarea>>;
  /** Cómo acabó, si acabó: `encoladas` presente es que se encoló; ausente, que se descartó. */
  resuelta?: { encoladas?: readonly string[] };
  alPedirAumento?: () => void;
  /** Devuelve el motivo si el servidor se negó; nada si se encoló. */
  alEncolar?: (encargos: string[]) => Promise<string | undefined>;
  alDescartar?: () => Promise<string | undefined>;
}) {
  // Lo que la persona TECLEÓ, por índice. Lo que no está aquí se pinta con lo redactado o la petición.
  const [editados, setEditados] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [negativa, setNegativa] = useState<string | undefined>(undefined);
  const enVuelo = useRef(false);
  const montado = useRef(true);
  const pedido = useRef(false);
  const pendiente = resuelta === undefined && alEncolar !== undefined;
  useEffect(() => {
    montado.current = true;
    if (pendiente && !pedido.current && alPedirAumento !== undefined) {
      pedido.current = true;
      alPedirAumento();
    }
    return () => {
      montado.current = false;
    };
  }, [pendiente, alPedirAumento]);

  const encargoDe = (i: number): string => {
    const tecleado = editados[i];
    if (tecleado !== undefined) return tecleado;
    const aumento = aumentos?.[i];
    return aumento !== undefined && "encargo" in aumento ? aumento.encargo : tareas[i]!.peticion;
  };

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
      : resuelta.encoladas === undefined
        ? `Propuesta de ${tareas.length} tareas · descartada`
        : `Propuesta de ${tareas.length} tareas · encoladas en orden`;

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
        {tareas.map((t, i) => {
          const aumento = aumentos?.[i];
          const redactando = pendiente && aumento === undefined && editados[i] === undefined;
          return (
            <li key={i} className={estilos.tarea}>
              <p className={estilos.titulo}>{`${i + 1}. ${t.titulo}`}</p>
              {t.adjuntos !== undefined && t.adjuntos.length > 0 ? (
                <p className={estilos.adjuntos}>{`Adjuntos: ${t.adjuntos.map((a) => a.replace(/^\/adjuntos\//, "")).join(", ")}`}</p>
              ) : null}
              {pendiente ? (
                <>
                  <label className={estilos.etiqueta} htmlFor={`propuesta-${i}-encargo`}>
                    {redactando ? "Encargo (redactándolo…)" : "Encargo"}
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
                  {aumento !== undefined && "error" in aumento ? (
                    <p className={estilos.aviso}>{`No se pudo redactar el encargo (${aumento.error}): va la petición del agente.`}</p>
                  ) : null}
                </>
              ) : (
                <p className={estilos.peticion}>{t.peticion}</p>
              )}
            </li>
          );
        })}
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
            <Button
              type="button"
              variant="primary"
              className={coraza.accion}
              disabled={enviando}
              onClick={() => actuar(() => alEncolar!(tareas.map((_, i) => encargoDe(i).trim() === "" ? tareas[i]!.peticion : encargoDe(i))))}
            >
              {enviando ? "Encolando…" : "Encolar en orden"}
            </Button>
          </div>
        </>
      ) : null}
      {negativa !== undefined ? (
        <p className={coraza.fallo} role="alert">
          {`No se encoló: ${negativa}`}
        </p>
      ) : null}
    </section>
  );
}
