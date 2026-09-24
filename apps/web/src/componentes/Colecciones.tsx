import { useEffect, useState, type ReactNode } from "react";
import type { ColeccionDeLaFoto, FotoDeColecciones, ReferenciaXone } from "../tipos.js";
import { confianzaDe, type ConfianzaDeReferencia } from "../fotoDeColecciones.js";
import estilos from "./Colecciones.module.css";

/**
 * La pestaña Colecciones: el modelo XOne del proyecto, del MISMO índice que `xone_navegacion`
 * (`core/fotoDeColecciones.ts`), para que una persona vea lo que ve el agente.
 *
 * Lista a la derecha y detalle a la izquierda, el encuadre de Ficheros. Tres reglas que no son
 * de forma:
 *
 * - **Las tres confianzas NO se funden.** Una referencia de atributo, una llamada de script y
 *   una mención —un literal que coincide con una colección— se enseñan en grupos separados y
 *   la mención se ROTULA como señal floja: juntas, la coincidencia se leería con la autoridad
 *   de la llamada resuelta.
 * - **No hay «huérfanas».** Se midió y la mitad eran falsos positivos. Una colección a la que no
 *   le apunta nada que el índice vea lo dice con su límite al lado, porque «no se usa» es una
 *   afirmación que este índice no puede sostener.
 * - **Se pide cuando no se tiene**, igual que el árbol de Ficheros, y sin caché: el agente
 *   escribe `.xne` dentro del turno, y un modelo viejo contestaría con autoridad y equivocado.
 */
export function Colecciones({
  foto,
  error,
  conectado,
  alPedir,
  alAbrirFichero,
}: {
  /** Ausente con `error` ausente = todavía no ha llegado. */
  foto?: FotoDeColecciones;
  error?: string;
  conectado?: boolean;
  alPedir: () => void;
  /** Abrir el `.xne` en Ficheros (ruta RELATIVA). Sin manejador no se pinta el botón. */
  alAbrirFichero?: (ruta: string) => void;
}) {
  const tiene = foto !== undefined || error !== undefined;
  useEffect(() => {
    if (conectado === false || tiene) return;
    alPedir();
  }, [tiene, conectado, alPedir]);

  const [elegida, setElegida] = useState<string | undefined>(undefined);
  const [filtro, setFiltro] = useState("");

  if (!tiene) return <p className={estilos.aviso}>Leyendo el modelo del proyecto…</p>;
  if (foto === undefined) return <p className={estilos.aviso}>No se ha podido leer el modelo del proyecto: {error}</p>;
  if (foto.total === 0) {
    return (
      <div className={estilos.vacio}>
        <p className={estilos.aviso}>El índice no encuentra ninguna colección en este proyecto.</p>
        <button type="button" className={estilos.recargar} onClick={alPedir}>
          Volver a leer
        </button>
      </div>
    );
  }

  const porNombre = new Map(foto.colecciones.map((c) => [c.nombre.toLowerCase(), c]));
  const existe = (nombre: string): boolean => porNombre.has(nombre.toLowerCase());
  const actual = elegida === undefined ? undefined : porNombre.get(elegida.toLowerCase());
  const visibles = foto.colecciones.filter((c) => c.nombre.toLowerCase().includes(filtro.trim().toLowerCase()));
  const entrada = new Set(foto.entrada.map((n) => n.toLowerCase()));
  const login = new Set(foto.login.map((n) => n.toLowerCase()));

  return (
    <div className={estilos.caja}>
      <div className={estilos.colecciones}>
        <div className={estilos.detalle}>
          {actual === undefined ? (
            <Resumen foto={foto} existe={existe} alElegir={setElegida} alPedir={alPedir} />
          ) : (
            <Detalle
              coleccion={actual}
              existe={existe}
              alElegir={setElegida}
              {...(alAbrirFichero === undefined ? {} : { alAbrirFichero })}
            />
          )}
        </div>
        <nav className={estilos.lista} aria-label="Colecciones del proyecto">
          <input
            className={estilos.filtro}
            type="search"
            placeholder="Filtrar colecciones"
            aria-label="Filtrar colecciones"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <button
            type="button"
            className={estilos.fila}
            aria-current={actual === undefined ? "true" : undefined}
            onClick={() => setElegida(undefined)}
          >
            Resumen del proyecto
          </button>
          {visibles.map((c) => (
            <button
              key={`${c.nombre}:${c.fichero}`}
              type="button"
              className={estilos.fila}
              aria-current={actual?.nombre === c.nombre ? "true" : undefined}
              onClick={() => setElegida(c.nombre)}
            >
              <span className={estilos.nombre}>{c.nombre}</span>
              {entrada.has(c.nombre.toLowerCase()) ? <span className={estilos.marca}>entrada</span> : null}
              {login.has(c.nombre.toLowerCase()) ? <span className={estilos.marca}>login</span> : null}
            </button>
          ))}
          {foto.total > foto.colecciones.length ? (
            <p className={estilos.nota}>{`Y ${foto.total - foto.colecciones.length} más que no caben en esta vista.`}</p>
          ) : null}
        </nav>
      </div>
    </div>
  );
}

/** Lo que se ve sin elegir nada: cuántas hay, por dónde arranca y lo que está roto. */
function Resumen({
  foto,
  existe,
  alElegir,
  alPedir,
}: {
  foto: FotoDeColecciones;
  existe: (nombre: string) => boolean;
  alElegir: (nombre: string) => void;
  alPedir: () => void;
}) {
  return (
    <div className={estilos.cuerpo}>
      <div className={estilos.cabecera}>
        <h2 className={estilos.titulo}>{`${foto.total} ${foto.total === 1 ? "colección" : "colecciones"}`}</h2>
        <button type="button" className={estilos.recargar} onClick={alPedir}>
          Volver a leer
        </button>
      </div>
      <Seccion titulo="Por dónde arranca">
        {foto.entrada.length === 0 && foto.login.length === 0 ? (
          // Vacío es «no consta» en `app.xml`, que no es «no hay».
          <p className={estilos.nota}>El `app.xml` no declara colecciones de entrada ni de login que el índice vea.</p>
        ) : (
          <ul className={estilos.lineas}>
            {foto.entrada.map((n) => (
              <li key={`e:${n}`}>
                entrada · <Nombre nombre={n} existe={existe} alElegir={alElegir} />
              </li>
            ))}
            {foto.login.map((n) => (
              <li key={`l:${n}`}>
                login · <Nombre nombre={n} existe={existe} alElegir={alElegir} />
              </li>
            ))}
          </ul>
        )}
      </Seccion>
      <Seccion titulo="Referencias a colecciones que no existen">
        {foto.rotas.length === 0 ? (
          <p className={estilos.nota}>Ninguna que el índice vea.</p>
        ) : (
          <ul className={estilos.lineas}>
            {foto.rotas.map((r, i) => (
              <li key={i}>
                <Origen referencia={r} existe={existe} alElegir={alElegir} />
                {` → ${r.hacia} `}
                <span className={estilos.por}>{r.por}</span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </div>
  );
}

function Detalle({
  coleccion: c,
  existe,
  alElegir,
  alAbrirFichero,
}: {
  coleccion: ColeccionDeLaFoto;
  existe: (nombre: string) => boolean;
  alElegir: (nombre: string) => void;
  alAbrirFichero?: (ruta: string) => void;
}) {
  return (
    <div className={estilos.cuerpo}>
      <div className={estilos.cabecera}>
        <h2 className={estilos.titulo}>{c.nombre}</h2>
        <span className={estilos.ruta}>{c.fichero}</span>
        {alAbrirFichero === undefined ? null : (
          // La ruta de la foto es VIRTUAL (`/Clientes.xne`) y Ficheros habla en relativas.
          <button type="button" className={estilos.recargar} onClick={() => alAbrirFichero(c.fichero.replace(/^\//, ""))}>
            Abrir
          </button>
        )}
      </div>
      <Seccion titulo={`Campos · ${c.campos.length}`}>
        {c.campos.length === 0 ? (
          <p className={estilos.nota}>Sin campos declarados.</p>
        ) : (
          <ul className={estilos.campos}>
            {c.campos.map((f) => (
              <li key={f.nombre}>
                <span className={estilos.codigo}>{f.nombre}</span>
                {/* Sin tipo en el `.xne` no se inventa uno. */}
                {f.tipo === undefined ? null : <span className={estilos.tipo}>{f.tipo}</span>}
              </li>
            ))}
          </ul>
        )}
      </Seccion>
      {c.eventos.length + c.nodos.length + c.conexiones.length === 0 ? null : (
        <Seccion titulo="Eventos, nodos y conexiones">
          <ul className={estilos.lineas}>
            {c.eventos.map((e) => (
              <li key={`ev:${e}`}>
                evento · <span className={estilos.codigo}>{e}</span>
              </li>
            ))}
            {c.nodos.map((n) => (
              <li key={`no:${n}`}>
                nodo · <span className={estilos.codigo}>{n}</span>
              </li>
            ))}
            {c.conexiones.map((n) => (
              <li key={`co:${n}`}>
                conexión · <span className={estilos.codigo}>{n}</span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}
      <Seccion titulo="Apunta a">
        {c.apuntaA.length === 0 ? (
          <p className={estilos.nota}>A nada que el índice vea.</p>
        ) : (
          <PorConfianza referencias={c.apuntaA} lado="hacia" existe={existe} alElegir={alElegir} />
        )}
      </Seccion>
      <Seccion titulo="Le apuntan">
        {c.leApuntan.length === 0 ? (
          <p className={estilos.nota}>
            Nada que el índice vea. No concluyas que no se usa: el índice no ve un{" "}
            <span className={estilos.codigo}>getCollection(variable)</span> ni un nombre compuesto al ejecutar.
          </p>
        ) : (
          <PorConfianza referencias={c.leApuntan} lado="desde" existe={existe} alElegir={alElegir} />
        )}
      </Seccion>
    </div>
  );
}

const GRUPOS: { confianza: ConfianzaDeReferencia; titulo: string; nota?: string }[] = [
  { confianza: "resuelta", titulo: "Por atributo" },
  { confianza: "script", titulo: "Por script" },
  {
    confianza: "mencion",
    titulo: "Menciones",
    nota: "Señal floja: un texto que coincide con el nombre de una colección, no una llamada resuelta.",
  },
];

/** Las referencias en sus tres grupos, sin fundirlos; un grupo vacío no se pinta. */
function PorConfianza({
  referencias,
  lado,
  existe,
  alElegir,
}: {
  referencias: readonly ReferenciaXone[];
  /** Qué extremo se enseña: en «Apunta a» interesa a dónde, en «Le apuntan» desde dónde. */
  lado: "hacia" | "desde";
  existe: (nombre: string) => boolean;
  alElegir: (nombre: string) => void;
}) {
  return (
    <>
      {GRUPOS.map(({ confianza, titulo, nota }) => {
        const suyas = referencias.filter((r) => confianzaDe(r) === confianza);
        if (suyas.length === 0) return null;
        return (
          <div key={confianza} className={estilos.grupo} data-confianza={confianza}>
            <p className={estilos.subtitulo}>{`${titulo} · ${suyas.length}`}</p>
            {nota === undefined ? null : <p className={estilos.nota}>{nota}</p>}
            <ul className={estilos.lineas}>
              {suyas.map((r, i) => (
                <li key={i}>
                  {lado === "hacia" ? (
                    <>
                      <Nombre nombre={coleccionDe(r.hacia)} existe={existe} alElegir={alElegir} />
                      {r.hacia.includes(".") ? <span className={estilos.codigo}>{r.hacia.slice(r.hacia.indexOf("."))}</span> : null}
                      <span className={estilos.desdeDonde}>{` desde ${r.desde}`}</span>
                    </>
                  ) : (
                    <Origen referencia={r} existe={existe} alElegir={alElegir} />
                  )}{" "}
                  <span className={estilos.por}>{r.por}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

/** La colección de un `Coll.CAMPO` o de un `Coll:evento`. */
function coleccionDe(nombre: string): string {
  return nombre.split(/[.:]/)[0]!;
}

/** Un nombre de colección: botón si existe en la foto, texto si no — sin enlaces muertos. */
function Nombre({ nombre, existe, alElegir }: { nombre: string; existe: (n: string) => boolean; alElegir: (n: string) => void }) {
  if (!existe(nombre)) return <span className={estilos.codigo}>{nombre}</span>;
  return (
    <button type="button" className={estilos.enlace} onClick={() => alElegir(nombre)}>
      {nombre}
    </button>
  );
}

/**
 * De dónde sale una referencia: `Coll.PROP`, `Coll:evento` o un `.js` suelto. Solo la parte de
 * la colección se navega; un `.js` es una ruta, no una colección, y va como texto.
 */
function Origen({ referencia: r, existe, alElegir }: { referencia: ReferenciaXone; existe: (n: string) => boolean; alElegir: (n: string) => void }) {
  if (r.desde.startsWith("/")) return <span className={estilos.codigo}>{r.desde}</span>;
  const coleccion = coleccionDe(r.desde);
  return (
    <>
      <Nombre nombre={coleccion} existe={existe} alElegir={alElegir} />
      {r.desde.length > coleccion.length ? <span className={estilos.codigo}>{r.desde.slice(coleccion.length)}</span> : null}
    </>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className={estilos.seccion}>
      <h3 className={estilos.seccionTitulo}>{titulo}</h3>
      {children}
    </section>
  );
}
