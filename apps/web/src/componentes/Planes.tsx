import { useEffect, useState } from "react";
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PlanDelCable, TareaDelPlanDelCable } from "../tipos.js";
import { protegerDolares } from "../protegerDolares.js";
import { ETIQUETAS_DE_CODIGO } from "../etiquetasDeCodigo.js";
import estilos from "./Planes.module.css";

/**
 * La pestaña Planes: lo que el analista dejó en `.xonecode/planes/`, con las tareas de su
 * `TASKS.md` leídas como dato (`core/tareasDelPlan.ts`).
 *
 * **Todo lo que enseña es lo que el plan DICE.** El estado de una tarea y sus casillas las marca
 * el modelo que la desarrolla, y nadie lo mide; por eso la pestaña lo rotula «según el plan» y
 * enseña el estado con la palabra que el plan escribió, sin traducirla a un color que afirme más.
 * Es de solo lectura: cambiar un plan es del agente, y publicarlo, de `/plan publicar`.
 */
export function Planes({
  planes,
  error,
}: {
  /** Ausente con `error` ausente = todavía no ha llegado. */
  planes?: PlanDelCable[];
  error?: string;
}) {
  const [elegido, setElegido] = useState<string | undefined>(undefined);
  const [abierta, setAbierta] = useState<string | undefined>(undefined);
  const [verPlan, setVerPlan] = useState(false);
  // Al cambiar de plan se cierra lo abierto del anterior: sus números de tarea no son los de éste.
  useEffect(() => {
    setAbierta(undefined);
    setVerPlan(false);
  }, [elegido]);

  if (planes === undefined) {
    return <p className={estilos.aviso}>{error === undefined ? "Leyendo los planes…" : `No se han podido leer los planes: ${error}`}</p>;
  }
  if (planes.length === 0) return <p className={estilos.aviso}>Este proyecto no tiene ningún plan.</p>;

  const plan = planes.find((p) => p.nombre === elegido) ?? planes[0]!;
  const tareas = plan.tareas?.tareas ?? [];
  const hechas = tareas.filter((t) => t.criterios.total > 0 && t.criterios.hechos === t.criterios.total).length;

  return (
    <div className={estilos.planes}>
      {planes.length > 1 ? (
        <div className={estilos.elegir} role="group" aria-label="Planes del proyecto">
          {planes.map((p) => (
            <button
              key={p.nombre}
              type="button"
              className={estilos.pastilla}
              aria-pressed={p.nombre === plan.nombre}
              onClick={() => setElegido(p.nombre)}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      ) : null}

      <div className={estilos.cabecera}>
        <h2 className={estilos.titulo}>{plan.tareas?.titulo ?? plan.nombre}</h2>
        <span className={estilos.ruta}>{`/planes/${plan.nombre}/`}</span>
        {plan.plan === undefined ? null : (
          <button type="button" className={estilos.boton} aria-pressed={verPlan} onClick={() => setVerPlan((v) => !v)}>
            {verPlan ? "Ver las tareas" : "Ver PLAN.md"}
          </button>
        )}
      </div>

      {verPlan && plan.plan !== undefined ? (
        <div className={`${estilos.markdown} md-cuerpo`}>
          {plan.plan.recortado ? <p className={estilos.nota}>Recortado: el `PLAN.md` entero está en la carpeta del plan.</p> : null}
          <MarkdownText text={protegerDolares(plan.plan.texto)} codeLabels={ETIQUETAS_DE_CODIGO} />
        </div>
      ) : plan.tareas === undefined ? (
        <p className={estilos.aviso}>
          {`Este plan todavía no tiene tareas: tiene ${plan.ficheros.length === 0 ? "la carpeta vacía" : plan.ficheros.join(", ")}, y el TASKS.md es el que las descompone.`}
        </p>
      ) : tareas.length === 0 ? (
        <p className={estilos.aviso}>El TASKS.md no tiene ninguna sección con forma de tarea («### 01 — Título»).</p>
      ) : (
        <>
          <p className={estilos.nota}>
            {`Según el plan: ${hechas} de ${tareas.length} ${tareas.length === 1 ? "tarea" : "tareas"} con todos sus criterios marcados. El estado y las casillas los marca el agente; nadie los ha medido.`}
          </p>
          <ol className={estilos.tareas}>
            {tareas.map((t) => (
              <Tarea
                key={t.numero}
                tarea={t}
                abierta={abierta === t.numero}
                alPulsar={() => setAbierta((a) => (a === t.numero ? undefined : t.numero))}
              />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function Tarea({ tarea: t, abierta, alPulsar }: { tarea: TareaDelPlanDelCable; abierta: boolean; alPulsar: () => void }) {
  // La prosa de «Bloqueada por» se enseña cuando dice algo más que números —«requiere ejecución
  // externa»—, que es justo lo que no se puede leer como dependencia.
  // «Ninguna — puede empezar ya» es la forma del formato de decir que no tiene dependencias, y
  // no merece línea.
  const soloNumeros =
    t.bloqueadaPorTexto === undefined ||
    /^[\d\s,–—\-ay]+$/.test(t.bloqueadaPorTexto) ||
    /^ninguna\b[\s—–-]*(puede empezar ya)?\.?$/i.test(t.bloqueadaPorTexto);
  return (
    <li className={estilos.tarea}>
      <button type="button" className={estilos.fila} aria-expanded={abierta} onClick={alPulsar}>
        <span className={estilos.numero}>{t.numero}</span>
        <span className={estilos.tituloDeTarea}>{t.titulo}</span>
        {t.estado === undefined ? null : <span className={estilos.estado}>{t.estado}</span>}
        {t.criterios.total === 0 ? null : (
          <span className={estilos.criterios}>{`${t.criterios.hechos} de ${t.criterios.total}`}</span>
        )}
      </button>
      {t.bloqueadaPor.length === 0 && soloNumeros ? null : (
        <p className={estilos.bloqueo}>
          {t.bloqueadaPor.length === 0 ? "" : `bloqueada por ${t.bloqueadaPor.join(", ")}`}
          {soloNumeros ? null : <span className={estilos.prosa}>{`${t.bloqueadaPor.length === 0 ? "" : " · "}${t.bloqueadaPorTexto}`}</span>}
        </p>
      )}
      {abierta ? (
        <div className={`${estilos.ficha} md-cuerpo`}>
          <MarkdownText text={protegerDolares(t.cuerpo)} codeLabels={ETIQUETAS_DE_CODIGO} />
        </div>
      ) : null}
    </li>
  );
}
