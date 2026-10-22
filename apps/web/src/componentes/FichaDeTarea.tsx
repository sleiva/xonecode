import { useState } from "react";
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
import type { TareaDelCable } from "../tipos.js";
import { selloDeFecha } from "../selloDeFecha.js";
import { protegerDolares } from "../protegerDolares.js";
import { ETIQUETAS_DE_CODIGO } from "../etiquetasDeCodigo.js";
import { ListaDePantallas } from "./DisenoDelProyecto.js";
import { CifrasAcabadas, CifrasEnMarcha } from "./TareasDelProyecto.js";
import estilos from "./FichaDeTarea.module.css";

/**
 * La FICHA de una tarea, a la derecha de su conversación mientras se lee (IXCODE-68, opción A de su lienzo «Tarea en
 * curso»): todo lo de la tarea a la vista sin buscarlo —título, ticket, cuándo empezó, cuánto lleva y cuánto ha gastado,
 * lo que se pidió, el encargo ampliado, el diseño y los adjuntos—. Lo que no consta no se pinta: ni una cifra a cero ni
 * una sección vacía. El encargo nace abierto (es lo que se viene a ver) y plegado se DESMONTA.
 */
export function FichaDeTarea({ tarea: t }: { tarea: TareaDelCable }) {
  const [encargoAbierto, setEncargoAbierto] = useState(true);
  const empezo = t.empezada === undefined ? undefined : selloDeFecha(t.empezada);
  const igual = t.peticion.trim() === t.encargo.trim();
  const md = (texto: string) => <MarkdownText text={protegerDolares(texto)} codeLabels={ETIQUETAS_DE_CODIGO} />;
  const pantallas = t.pantallasDeStitch ?? [];
  return (
    <aside className={estilos.ficha} aria-label="Ficha de la tarea">
      <div className={estilos.cabecera}>
        <span className={estilos.rotulo}>Tarea</span>
        <span className={estilos.titulo}>{t.titulo}</span>
        {t.ticket === undefined && empezo === undefined ? null : (
          <div className={estilos.datos}>
            {t.ticket === undefined ? null : <span className={estilos.ticket}>{t.ticket.clave}</span>}
            {empezo === undefined ? null : <span>{`Empezó ${empezo}`}</span>}
          </div>
        )}
      </div>

      {t.estado === "en-proceso" && t.empezada !== undefined ? (
        <CifrasEnMarcha empezada={t.empezada} gasto={t.gastoEnCurso} />
      ) : (
        // Acabada: las MISMAS cifras grandes, con lo que tardó trabajando y lo que gastó (cada una solo si consta).
        <CifrasAcabadas trabajo={t.trabajo} gasto={t.gasto} />
      )}

      {igual ? null : (
        <section className={estilos.seccion} aria-label="Lo que se pidió">
          <h3 className={estilos.rotulo}>Lo que se pidió</h3>
          <div className={estilos.texto}>{md(t.peticion)}</div>
        </section>
      )}

      <section className={estilos.seccion} aria-label="Encargo">
        <button type="button" className={estilos.plegable} aria-expanded={encargoAbierto} onClick={() => setEncargoAbierto(!encargoAbierto)}>
          <span aria-hidden="true">{encargoAbierto ? "▾" : "▸"}</span> {igual ? "Encargo" : "Encargo ampliado"}
        </button>
        {encargoAbierto ? <div className={estilos.encargo}>{md(t.encargo)}</div> : null}
      </section>

      {pantallas.length === 0 ? null : (
        <section className={estilos.seccion} aria-label="Diseño">
          <h3 className={estilos.rotulo}>Diseño</h3>
          {pantallas[0]!.proyecto === undefined ? null : <p className={estilos.texto}>{`Del proyecto de Stitch «${pantallas[0]!.proyecto}»`}</p>}
          <ListaDePantallas pantallas={pantallas} />
        </section>
      )}

      {t.adjuntos.length === 0 ? null : (
        <section className={estilos.seccion} aria-label="Adjuntos">
          <h3 className={estilos.rotulo}>Adjuntos</h3>
          <ul className={estilos.adjuntos}>
            {t.adjuntos.map((a) => (
              <li key={a.nombre}>{a.nombre}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
