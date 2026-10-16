import { useEffect, useState } from "react";
import type { EstadoDeDiseno } from "../disenoDelCable.js";
import estilos from "./DisenoDelProyecto.module.css";

/** Lo que el panel y el selector piden al servidor; el proyecto lo añade quien lo envía. */
export type PeticionDeDiseno =
  | { accion: "estado" | "proyectos" | "desvincular" | "pantallas" }
  | { accion: "vincular"; vinculo: { proyecto: string; nombre: string } };

/**
 * Panel del proyecto → Conectores → «Diseño (Stitch)»: a qué proyecto de Stitch está vinculado este proyecto XOne. De él
 * salen las pantallas que se ELIGEN para una tarea (decisión suya: el diseño se elige, no se busca por nombre). El
 * vínculo vive en el `config.json` del proyecto y lo escribe el servidor.
 */
export function DisenoDelProyecto({
  diseno,
  stitchAnadido,
  alDiseno,
}: {
  diseno?: EstadoDeDiseno;
  /** Si el conector Stitch está añadido: sin él no hay nada que vincular. */
  stitchAnadido: boolean;
  alDiseno: (p: PeticionDeDiseno) => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const [elegido, setElegido] = useState("");
  useEffect(() => {
    if (stitchAnadido) alDiseno({ accion: "estado" });
    // Una vez al montar: el vínculo cambia solo por las acciones de esta sección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stitchAnadido]);

  const vinculo = diseno?.vinculo;
  const proyectos = diseno?.proyectos;
  return (
    <section className={estilos.seccion} aria-label="Diseño (Stitch)">
      <h2 className={estilos.titulo}>Diseño (Stitch)</h2>
      <p className={estilos.aviso}>
        El proyecto de Stitch de este proyecto. Al crear una tarea eliges la pantalla con su miniatura, y la tarea la trae por su id.
      </p>
      {!stitchAnadido ? (
        <p className={estilos.aviso}>Stitch no está añadido. Se añade en Ajustes → Conectores.</p>
      ) : (
        <>
          {vinculo === undefined ? null : vinculo === null ? (
            <p className={estilos.aviso}>Sin proyecto de Stitch vinculado.</p>
          ) : (
            <div className={estilos.fila}>
              <span>
                Vinculado a <strong>«{vinculo.nombre}»</strong>
              </span>
              <button type="button" className={estilos.boton} onClick={() => alDiseno({ accion: "desvincular" })}>
                Desvincular
              </button>
            </div>
          )}
          {eligiendo ? (
            proyectos === undefined ? (
              <p className={estilos.aviso}>Pidiendo los proyectos de Stitch…</p>
            ) : (
              <div className={estilos.fila}>
                <select aria-label="Proyecto de Stitch" value={elegido} onChange={(e) => setElegido(e.target.value)}>
                  <option value="">Elige un proyecto…</option>
                  {proyectos.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={estilos.boton}
                  disabled={elegido === ""}
                  onClick={() => {
                    const p = proyectos.find((x) => x.name === elegido);
                    if (p === undefined) return;
                    alDiseno({ accion: "vincular", vinculo: { proyecto: p.name, nombre: p.title } });
                    setEligiendo(false);
                  }}
                >
                  Vincular
                </button>
                <button type="button" className={estilos.boton} onClick={() => setEligiendo(false)}>
                  Cancelar
                </button>
              </div>
            )
          ) : (
            <div className={estilos.fila}>
              <button
                type="button"
                className={estilos.boton}
                onClick={() => {
                  setEligiendo(true);
                  alDiseno({ accion: "proyectos" });
                }}
              >
                {vinculo ? "Cambiar de proyecto" : "Vincular un proyecto de Stitch"}
              </button>
            </div>
          )}
          {diseno?.error === undefined ? null : <p className={estilos.error}>{diseno.error}</p>}
        </>
      )}
    </section>
  );
}

/**
 * El selector de UNA pantalla del proyecto de Stitch vinculado, con su miniatura (Nueva tarea / Editar la tarea). Pide
 * las pantallas al montarse. Sin vínculo lo DICE con el camino a Conectores; nunca una lista vacía muda.
 */
export function SelectorDePantalla({
  diseno,
  alPedir,
  elegida,
  alElegir,
}: {
  diseno?: EstadoDeDiseno;
  alPedir: () => void;
  elegida?: { name: string; titulo: string };
  alElegir: (p: { name: string; titulo: string } | undefined) => void;
}) {
  useEffect(() => {
    alPedir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pantallas = diseno?.pantallas;
  return (
    <section className={estilos.seccion} aria-label="Diseño de la tarea">
      <h3 className={estilos.titulo}>Diseño (pantalla de Stitch)</h3>
      {diseno?.error !== undefined ? (
        <p className={estilos.error}>{`No se pudieron pedir las pantallas: ${diseno.error}`}</p>
      ) : diseno?.vinculo === null ? (
        <p className={estilos.aviso}>Este proyecto no tiene un proyecto de Stitch vinculado: se vincula en el panel, pestaña Conectores.</p>
      ) : pantallas === undefined ? (
        <p className={estilos.aviso}>Pidiendo las pantallas…</p>
      ) : (
        <>
          <p className={estilos.aviso}>
            {elegida === undefined ? "Ninguna elegida: la tarea irá sin maqueta." : `Elegida: «${elegida.titulo}».`}{" "}
            {elegida === undefined ? null : (
              <button type="button" className={estilos.boton} onClick={() => alElegir(undefined)}>
                Quitar
              </button>
            )}
          </p>
          <div className={estilos.rejilla}>
            {pantallas.map((p) => (
              <button
                key={p.name}
                type="button"
                className={estilos.pantalla}
                aria-pressed={elegida?.name === p.name}
                title={p.title}
                onClick={() => alElegir(elegida?.name === p.name ? undefined : { name: p.name, titulo: p.title })}
              >
                {p.miniatura === undefined ? (
                  <span className={estilos.sinImagen} aria-hidden="true" />
                ) : (
                  <img src={p.miniatura} alt="" loading="lazy" referrerPolicy="no-referrer" />
                )}
                <span className={estilos.nombre}>{p.title}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
