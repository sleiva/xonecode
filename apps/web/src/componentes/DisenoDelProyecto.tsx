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
/**
 * Cuántas pantallas se pueden elegir para una tarea (IXCODE-63). COPIA de `core/stitch.ts#TOPE_DE_PANTALLAS_ELEGIDAS` —la
 * frontera no deja importarla—: el servidor la vuelve a aplicar y niega con motivo, que es quien manda.
 */
export const TOPE_DE_PANTALLAS = 6;

export function SelectorDePantalla({
  diseno,
  alPedir,
  elegidas,
  alCambiar,
}: {
  diseno?: EstadoDeDiseno;
  alPedir: () => void;
  /** Las elegidas, en el orden en que se eligieron (IXCODE-63: varias; cada una, una pantalla a construir). */
  elegidas: readonly { name: string; titulo: string }[];
  alCambiar: (lista: { name: string; titulo: string }[]) => void;
}) {
  useEffect(() => {
    alPedir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [filtro, setFiltro] = useState("");
  const pantallas = diseno?.pantallas;
  const visibles = pantallas?.filter((p) => casaConElFiltro(p.title, filtro));
  return (
    <section className={estilos.seccion} aria-label="Diseño de la tarea">
      <h3 className={estilos.titulo}>Diseño (pantallas de Stitch)</h3>
      {diseno?.error !== undefined ? (
        <p className={estilos.error}>{`No se pudieron pedir las pantallas: ${diseno.error}`}</p>
      ) : diseno?.vinculo === null ? (
        <p className={estilos.aviso}>Este proyecto no tiene un proyecto de Stitch vinculado: se vincula en el panel, pestaña Conectores.</p>
      ) : pantallas === undefined ? (
        <p className={estilos.aviso}>Pidiendo las pantallas…</p>
      ) : (
        <>
          {elegidas.length === 0 ? (
            <p className={estilos.aviso}>
              {`Ninguna elegida: la tarea irá sin maqueta. Puedes elegir hasta ${TOPE_DE_PANTALLAS}; cada una es una pantalla a construir.`}
            </p>
          ) : (
            // Numeradas y una por línea (petición suya): el número es el mismo de la miniatura y el orden en que se traen.
            <div className={estilos.elegidas}>
              <div className={estilos.fila}>
                <span className={estilos.aviso}>
                  {elegidas.length === 1 ? "Elegida:" : `Elegidas (${elegidas.length} de ${TOPE_DE_PANTALLAS}):`}
                </span>
                <button type="button" className={estilos.boton} onClick={() => alCambiar([])}>
                  {elegidas.length === 1 ? "Quitar" : "Quitar todas"}
                </button>
              </div>
              <ListaDePantallas pantallas={elegidas} />
            </div>
          )}
          {/* Con muchas pantallas, se filtran por el título (petición suya). */}
          <div className={estilos.fila}>
            <input
              type="search"
              className={estilos.buscador}
              aria-label="Buscar pantalla"
              placeholder="Buscar por nombre…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
            <span className={estilos.aviso}>{filtro.trim() === "" ? `${pantallas.length} pantallas` : `${visibles!.length} de ${pantallas.length}`}</span>
          </div>
          {visibles!.length === 0 ? <p className={estilos.aviso}>Ninguna pantalla lleva esas palabras.</p> : null}
          <div className={estilos.rejilla}>
            {visibles!.map((p) => {
              const marcada = elegidas.some((e) => e.name === p.name);
              // Al llegar al tope, las que NO están elegidas no se pueden añadir, y se dice por qué en el `title`.
              const lleno = !marcada && elegidas.length >= TOPE_DE_PANTALLAS;
              return (
              <button
                key={p.name}
                type="button"
                className={estilos.pantalla}
                aria-pressed={marcada}
                disabled={lleno}
                title={lleno ? `como mucho ${TOPE_DE_PANTALLAS} pantallas por tarea` : p.title}
                onClick={() =>
                  alCambiar(marcada ? elegidas.filter((e) => e.name !== p.name) : [...elegidas, { name: p.name, titulo: p.title }])
                }
              >
                {p.miniatura === undefined ? (
                  <span className={estilos.sinImagen} aria-hidden="true" />
                ) : (
                  <img src={p.miniatura} alt="" loading="lazy" referrerPolicy="no-referrer" />
                )}
                <span className={estilos.nombre}>
                  {/* El orden de elección: la primera es la que va a `diseno/`, las demás a `diseno/2/`… */}
                  {marcada ? `${elegidas.findIndex((e) => e.name === p.name) + 1}. ` : ""}
                  {p.title}
                </span>
              </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Las pantallas elegidas, NUMERADAS y una por línea (petición suya: seguidas con comas no se leían). Un `<ol>`, así que el
 * número lo dice también un lector de pantalla. La usan el selector, la tarjeta de la tarea y las notas de las ventanas.
 */
export function ListaDePantallas({ pantallas }: { pantallas: readonly { titulo: string }[] }) {
  return (
    <ol className={estilos.listaDePantallas}>
      {pantallas.map((p, i) => (
        <li key={`${i}:${p.titulo}`}>{`«${p.titulo}»`}</li>
      ))}
    </ol>
  );
}

/** Sin tildes ni mayúsculas, como `core/stitch.ts#tituloComparable` (el cliente no importa del host). */
function comparable(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Cada palabra del filtro está en el título, en cualquier orden. Un filtro vacío casa con todas. */
export function casaConElFiltro(titulo: string, filtro: string): boolean {
  const t = comparable(titulo);
  return comparable(filtro)
    .split(/\s+/)
    .filter((p) => p !== "")
    .every((p) => t.includes(p));
}
