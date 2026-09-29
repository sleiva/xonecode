import { useEffect, useRef, useState } from "react";
import { IconCheckOutline16, IconDownloadOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";
import estilos from "./ResumenDeProyecto.module.css";
import { IconoCompartido } from "./IconosDeProyecto.js";
import { BorrarCopiaLocal } from "./BorrarCopiaLocal.js";
import { GastoDelProyecto } from "./GastoDelProyecto.js";
import { ordenarPorUltimoTurno } from "./Barra.js";
import { selloDeFecha } from "../selloDeFecha.js";
import { abreviar } from "../cifras.js";
import { desglosarConsumo } from "../consumoPintable.js";
import { gastoDelProyecto } from "../gastoDelProyecto.js";
import { sePuedeAbrirLaTarea } from "../tareasAbribles.js";
import type { ConsumoDeTurno, FotoDelResumen, TareaDelCable } from "../tipos.js";

/** Cuántas sesiones enseña el bloque «Últimas sesiones». */
export const SESIONES_EN_EL_RESUMEN = 5;
/** Cuántas tareas enseña la lista del bloque de tareas, además de los contadores. */
export const TAREAS_EN_EL_RESUMEN = 5;

/** Una sesión tal como la necesita el resumen: la misma fila de la barra. */
export interface SesionDelResumen {
  id: string;
  titulo: string;
  ultimoTurno?: string;
  consumo?: ConsumoDeTurno;
  deTarea?: true;
  trabajando?: true;
}

/** Lo que el resumen sabe de un proyecto: la misma fila de `alta.proyectos`. */
export interface ProyectoDelResumen {
  id: string;
  nombre: string;
  /** Ausente = no está bajado: el servidor lo MIDE para todo proyecto, nunca «no lo sé». */
  local?: boolean;
  /** Ausente = el servidor no lo dijo, que NO es «propio». Solo `true` pinta algo. */
  compartido?: boolean;
  trabajando?: true;
  sesiones?: readonly SesionDelResumen[];
}

/**
 * La foto pedida al servidor, CON el id del proyecto del que es. Pulsar A y luego B no puede
 * pintar la respuesta de A en B —el mismo fallo que `ramasDe` cerró en la ventana de la rama—,
 * así que una respuesta cuyo id ya no es el que se mira se tira.
 */
interface Medida {
  proyecto: string;
  respondida: boolean;
  /** Ausente con `respondida` = no se pudo pedir (sin red, o el servidor se negó). */
  foto?: FotoDelResumen;
}

/**
 * El resumen de UN proyecto, en el centro —donde va la sesión— al pulsar su nombre en la
 * barra. Cada cosa que enseña trae su dato detrás, como el resto de esta consola: un control
 * sin dato no se pinta, y AUSENTE nunca se pinta como cero ni como vacío.
 *
 * - **Cabecera**: el nombre, sus pastillas (bajado / compartido, con los glifos de la barra) y
 *   las acciones de la copia.
 * - **Lo que queda por subir**: una FOTO del servidor, la MISMA medida que la banda de
 *   CloudStudio en Revisión (`lecturaDeSync`). Se pide al entrar y con «Actualizar».
 * - **Últimas sesiones** y **tareas**, que abren su conversación con las mismas reglas que la
 *   barra y el kanban.
 * - **Gasto**, en tokens: la consola no guarda precio.
 *
 * **No tiene botón de cerrar.** Se sale pulsando un chat, el «+», la marca de la barra
 * superior, u otro proyecto. Y abrirlo no cierra nada: la sesión de detrás sigue viva.
 */
export function ResumenDeProyecto({
  proyecto,
  conectado,
  abriendo,
  tareasDeLaCola,
  alIrALaConversacion,
  alDescargar,
  alAbrirCarpeta,
  alBorrarCopia,
  alPedirResumen,
  alAbrirSesion,
}: {
  proyecto: ProyectoDelResumen;
  conectado?: boolean;
  /** Algo se está abriendo ahora: mientras, no se pide otra cosa (la regla de la barra). */
  abriendo?: boolean;
  /** La cola ENTERA de la máquina. Ausente = todavía no ha llegado, que no es «ninguna». */
  tareasDeLaCola?: readonly TareaDelCable[];
  /**
   * Con el proyecto TRABAJANDO, llegar a la conversación en marcha. Es el camino que antes
   * daba pulsar el nombre, y el único mientras esa conversación no tenga fila en la barra
   * (su id nace al volcar el primer acto) — el «+» está apagado.
   */
  alIrALaConversacion: () => void;
  /** Sin copia local: abre la ventana de descarga (la de sesión nueva, con su rama). */
  alDescargar: () => void;
  /** Abre la carpeta de la copia en el explorador del sistema. Devuelve el MOTIVO si el
   *  servidor se negó (409), o nada. */
  alAbrirCarpeta: (proyecto: string) => Promise<string | undefined>;
  /** Borra la copia local. Devuelve el MOTIVO si el servidor se negó (409), o nada. */
  alBorrarCopia: (proyecto: string) => Promise<string | undefined>;
  /** Pide la FOTO del servidor (pendientes de subir y qué tareas son de este proyecto).
   *  `undefined` = no se pudo: ni red ni respuesta que entender. */
  alPedirResumen: (proyecto: string) => Promise<FotoDelResumen | undefined>;
  /** Abrir una sesión guardada o la de una tarea, el `abrirSesion` de siempre. */
  alAbrirSesion: (proyecto: string, sesion: string) => void;
}) {
  const apagado = conectado === false;
  const deshabilitadas = apagado || abriendo === true;
  const [confirmando, setConfirmando] = useState(false);
  const [negativa, setNegativa] = useState<string | undefined>(undefined);

  // La foto del servidor, pedida al entrar en ESTE proyecto y al pulsar «Actualizar».
  // `enVista` es el id que se mira AHORA: una respuesta que llega para otro se tira.
  const [medida, setMedida] = useState<Medida | undefined>(undefined);
  const enVista = useRef(proyecto.id);
  enVista.current = proyecto.id;
  const pedir = (): void => {
    const id = proyecto.id;
    setMedida({ proyecto: id, respondida: false });
    void alPedirResumen(id)
      .catch(() => undefined)
      .then((foto) => {
        if (enVista.current !== id) return;
        setMedida({ proyecto: id, respondida: true, ...(foto === undefined ? {} : { foto }) });
      });
  };
  // `local` también: al terminar de bajarse, lo que hay que medir cambia.
  useEffect(pedir, [proyecto.id, proyecto.local]);
  const vigente = medida?.proyecto === proyecto.id ? medida : undefined;

  return (
    <div className={estilos.resumen}>
      <div className={estilos.contenido}>
        <header className={estilos.cabecera}>
          <div className={estilos.identidad}>
            <h1 className={estilos.nombre}>{proyecto.nombre}</h1>
            <div className={estilos.pastillas}>
              {proyecto.local === true ? (
                <span className={estilos.pastilla} data-estado="local">
                  <IconCheckOutline16 size={14} />
                  en tu equipo
                </span>
              ) : (
                <span className={estilos.pastilla} data-estado="sin-descargar">
                  <IconDownloadOutline16 size={14} />
                  sin descargar
                </span>
              )}
              {proyecto.compartido === true ? (
                <span className={estilos.pastilla} data-estado="compartido">
                  <IconoCompartido size={14} />
                  compartido contigo
                </span>
              ) : null}
            </div>
          </div>
          {/* Abrir carpeta y borrar son de la COPIA, así que solo existen con ella: sin copia no
              hay carpeta que enseñar ni nada que borrar, y en su sitio va «Descargar». Con el
              proyecto trabajando siguen pintadas: quien dice por qué no se puede borrar es el
              servidor, en la ventana. */}
          {proyecto.local === true ? (
            <div className={estilos.acciones}>
              <button
                type="button"
                className={estilos.secundario}
                disabled={apagado}
                title="Abre la carpeta del proyecto en el explorador de ficheros de este equipo"
                onClick={async () => {
                  setNegativa(undefined);
                  setNegativa(await alAbrirCarpeta(proyecto.id).catch(() => "no se pudo hablar con el servidor"));
                }}
              >
                Abrir carpeta
              </button>
              <button type="button" className={estilos.borrar} disabled={apagado} onClick={() => setConfirmando(true)}>
                Borrar copia local
              </button>
            </div>
          ) : (
            // Sin copia, su única acción: bajarla. Abre la MISMA ventana que el «+» —rama de
            // origen y aviso de la descarga—, que es donde esa decisión se toma.
            <div className={estilos.acciones}>
              <button type="button" className={estilos.primario} disabled={apagado} onClick={alDescargar}>
                Descargar
              </button>
            </div>
          )}
        </header>

        {negativa === undefined ? null : (
          <p className={estilos.negativa} role="alert">
            No se ha abierto la carpeta: {negativa}
          </p>
        )}

        {proyecto.trabajando === true ? (
          <div className={estilos.enMarcha}>
            <button type="button" className={estilos.secundario} disabled={apagado} onClick={alIrALaConversacion}>
              Ir a la conversación en marcha
            </button>
          </div>
        ) : null}

        {/* Sin copia no hay nada que subir: la tira ni se pinta. */}
        {proyecto.local === true ? <TiraDePendientes medida={vigente} apagado={apagado} alActualizar={pedir} /> : null}

        <div className={estilos.rejilla}>
          <section className={estilos.bloque} aria-label="Últimas sesiones">
            <h2 className={estilos.tituloDeBloque}>Últimas sesiones</h2>
            <UltimasSesiones proyecto={proyecto} deshabilitadas={deshabilitadas} alAbrirSesion={alAbrirSesion} />
          </section>
          <section className={estilos.bloque} aria-label="Tareas del proyecto">
            <h2 className={estilos.tituloDeBloque}>Tareas</h2>
            <TareasDelResumen
              proyecto={proyecto.id}
              medida={vigente}
              {...(tareasDeLaCola === undefined ? {} : { cola: tareasDeLaCola })}
              deshabilitadas={deshabilitadas}
              alAbrirSesion={alAbrirSesion}
            />
          </section>
          {/* El gasto es de lo que hay en disco: sin copia no hay sesiones de las que contar. */}
          {proyecto.local === true ? (
            <section className={`${estilos.bloque} ${estilos.anchoEntero}`} aria-label="Gasto del proyecto">
              <h2 className={estilos.tituloDeBloque}>Gasto</h2>
              <BloqueDeGasto sesiones={proyecto.sesiones ?? []} />
            </section>
          ) : null}
        </div>
      </div>

      {confirmando ? (
        <BorrarCopiaLocal
          nombre={proyecto.nombre}
          alCerrar={() => setConfirmando(false)}
          alConfirmar={async () => {
            const motivo = await alBorrarCopia(proyecto.id);
            if (motivo === undefined) setConfirmando(false);
            return motivo;
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Lo que queda por subir a CloudStudio, en una línea. La cifra es la MISMA que la banda de
 * Revisión: sale de la misma función del servidor (`lecturaDeSync`). Cinco estados, y ninguno
 * se confunde con otro: midiendo, N, cero MEDIDO, no se pudo medir, y no vinculado.
 */
function TiraDePendientes({
  medida,
  apagado,
  alActualizar,
}: {
  medida: Medida | undefined;
  apagado: boolean;
  alActualizar: () => void;
}) {
  const sync = medida?.foto?.sync;
  let contenido: React.ReactNode;
  let estado: string;
  if (medida === undefined || !medida.respondida) {
    estado = "midiendo";
    contenido = (
      <>
        <span className={estilos.girando} aria-hidden="true" />
        midiendo lo que queda por subir…
      </>
    );
  } else if (medida.foto === undefined) {
    estado = "error";
    contenido = "No se ha podido medir lo que queda por subir.";
  } else if (sync === undefined || sync.proyecto === undefined) {
    estado = "sin-vincular";
    contenido = "No está vinculado a CloudStudio: no hay nada con lo que comparar.";
  } else if (sync.error !== undefined) {
    estado = "error";
    contenido = `No se ha podido medir: ${sync.error}`;
  } else if (sync.pendientes === undefined) {
    estado = "error";
    contenido = "No se ha podido medir lo que queda por subir.";
  } else if (sync.pendientes === 0) {
    estado = "al-dia";
    contenido = "Nada por subir: la copia está igual que la rama en CloudStudio.";
  } else {
    estado = "pendientes";
    contenido = (
      <span title="Ficheros distintos de lo que consta en CloudStudio. Un renombrado cuenta como dos; un fichero nuevo que git aún no sigue no cuenta.">
        <strong>
          {sync.pendientes} {sync.pendientes === 1 ? "fichero" : "ficheros"}
        </strong>{" "}
        con cambios sin subir{sync.rama === undefined ? "" : ` a «${sync.rama}»`}
      </span>
    );
  }
  return (
    <div className={estilos.tira} data-estado={estado} role="status">
      <span className={estilos.textoDeTira}>{contenido}</span>
      <button
        type="button"
        className={estilos.secundario}
        disabled={apagado || medida?.respondida === false}
        onClick={alActualizar}
      >
        Actualizar
      </button>
    </div>
  );
}

/**
 * Las últimas sesiones del proyecto, por su último turno. Cada una abre su chat, con la MISMA
 * regla que la barra: con el proyecto trabajando solo se abre la que trabaja, porque el
 * servidor declina las demás (una copia de trabajo no aguanta dos conversaciones).
 */
function UltimasSesiones({
  proyecto,
  deshabilitadas,
  alAbrirSesion,
}: {
  proyecto: ProyectoDelResumen;
  deshabilitadas: boolean;
  alAbrirSesion: (proyecto: string, sesion: string) => void;
}) {
  const sesiones = ordenarPorUltimoTurno(proyecto.sesiones ?? []).slice(0, SESIONES_EN_EL_RESUMEN);
  if (sesiones.length === 0) return <p className={estilos.vacio}>Sin sesiones todavía.</p>;
  return (
    <ul className={estilos.lista}>
      {sesiones.map((s) => {
        const ocupada = proyecto.trabajando === true && s.trabajando !== true;
        const d = s.consumo === undefined ? undefined : desglosarConsumo(s.consumo.modelo, s.consumo.externo);
        return (
          <li key={s.id}>
            <button
              type="button"
              className={estilos.fila}
              disabled={deshabilitadas || ocupada}
              {...(ocupada
                ? { title: "este proyecto está trabajando en otra conversación: ábrela cuando termine" }
                : {})}
              onClick={() => alAbrirSesion(proyecto.id, s.id)}
            >
              <span className={estilos.tituloDeFila}>
                {s.titulo !== "" ? s.titulo : s.deTarea === true ? "Tarea de fondo" : "Sin título"}
              </span>
              {s.trabajando === true ? <span className={estilos.marca}>trabajando…</span> : null}
              {d === undefined ? null : (
                <span className={estilos.dato} title="tokens nuevos + salida (la caché va aparte)">
                  {abreviar(d.nueva + d.salida)} tk
                </span>
              )}
              {s.ultimoTurno === undefined ? null : <span className={estilos.dato}>{selloDeFecha(s.ultimoTurno)}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** El rótulo de cada estado de una tarea, en el mismo orden que los contadores. */
const ESTADOS_DE_TAREA: readonly { estado: TareaDelCable["estado"]; etiqueta: string }[] = [
  { estado: "nuevo", etiqueta: "Pendientes" },
  { estado: "en-proceso", etiqueta: "En proceso" },
  { estado: "requiere-atencion", etiqueta: "Esperando feedback" },
  { estado: "terminada", etiqueta: "Finalizadas" },
];

const ETIQUETA_DE_ESTADO: Record<TareaDelCable["estado"], string> = {
  nuevo: "pendiente",
  "en-proceso": "en proceso",
  "requiere-atencion": "esperando feedback",
  terminada: "finalizada",
};

/**
 * Las tareas de ESTE proyecto: las que el servidor dijo que son suyas, por su raíz, pintadas con
 * sus datos VIVOS de la cola. Ausente no es vacío en ninguna de las dos mitades: sin cola todavía
 * se dice que no ha llegado; sin foto, que no se sabe cuáles son.
 */
function TareasDelResumen({
  proyecto,
  medida,
  cola,
  deshabilitadas,
  alAbrirSesion,
}: {
  proyecto: string;
  medida: Medida | undefined;
  cola?: readonly TareaDelCable[];
  deshabilitadas: boolean;
  alAbrirSesion: (proyecto: string, sesion: string) => void;
}) {
  if (cola === undefined) return <p className={estilos.vacio}>Todavía no ha llegado la cola de tareas.</p>;
  if (medida === undefined || !medida.respondida) return <p className={estilos.vacio}>consultando…</p>;
  if (medida.foto === undefined) {
    return <p className={estilos.vacio}>No se ha podido saber qué tareas son de este proyecto.</p>;
  }
  const ids = new Set(medida.foto.tareas);
  const suyas = cola.filter((t) => ids.has(t.id));
  const recientes = [...suyas].sort((a, b) => b.creada.localeCompare(a.creada)).slice(0, TAREAS_EN_EL_RESUMEN);
  const fila = (t: TareaDelCable) => (
    <>
      <span className={estilos.tituloDeFila}>{t.titulo}</span>
      <span className={estilos.marca} data-estado={t.estado}>
        {ETIQUETA_DE_ESTADO[t.estado]}
      </span>
    </>
  );
  return (
    <>
      <dl className={estilos.contadores}>
        {ESTADOS_DE_TAREA.map((e) => (
          <div key={e.estado} className={estilos.contador} data-estado={e.estado}>
            <dt>{e.etiqueta}</dt>
            <dd>{suyas.filter((t) => t.estado === e.estado).length}</dd>
          </div>
        ))}
      </dl>
      {recientes.length === 0 ? (
        <p className={estilos.vacio}>Ninguna tarea en este proyecto.</p>
      ) : (
        <ul className={estilos.lista}>
          {recientes.map((t) => (
            <li key={t.id}>
              {/* Solo es botón si abrirla hace algo: con sesión y fuera de `en-proceso`. */}
              {sePuedeAbrirLaTarea(t) ? (
                <button
                  type="button"
                  className={estilos.fila}
                  disabled={deshabilitadas}
                  onClick={() => alAbrirSesion(proyecto, t.sesion!)}
                >
                  {fila(t)}
                </button>
              ) : (
                <span className={estilos.fila} data-inerte="">
                  {fila(t)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** El gasto, o por qué no lo hay: sin ninguna sesión con gasto que conste no se pinta un
 *  gráfico vacío. */
function BloqueDeGasto({ sesiones }: { sesiones: readonly SesionDelResumen[] }) {
  const datos = gastoDelProyecto(sesiones);
  if (datos.conGasto === 0) return <p className={estilos.vacio}>Todavía no consta gasto en este proyecto.</p>;
  return <GastoDelProyecto datos={datos} />;
}
