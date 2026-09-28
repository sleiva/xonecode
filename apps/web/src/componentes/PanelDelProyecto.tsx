import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import type { EstadoDelCliente } from "../store.js";
import type { MensajeDelCliente, PlanDelCable, SesionDelCable, TareaDelGestor } from "../tipos.js";
import { IconoDeConector } from "./IconoDeConector.js";
import { BarraDeProgreso, resumenDelPlan } from "./Planes.js";
import conversacion from "../../estilos/ConversationRoot.module.css";
import pestanas from "./Pestanas.module.css";
import estilos from "./PanelDelProyecto.module.css";

/** Lo que el panel manda por el cable: solo intención del gestor (el servidor decide cómo). */
export type MensajeDelGestor = Extract<MensajeDelCliente, { clase: "gestor" }>;
/** Sin la `clase`: la pone quien envía. Distribuido sobre la unión, para que cada acción
 *  conserve SUS campos. */
export type PeticionAlGestor = MensajeDelGestor extends infer M ? (M extends { clase: "gestor" } ? Omit<M, "clase"> : never) : never;

type PestanaDelProyecto = "resumen" | "tareas" | "conectores";

const PESTANAS: { id: PestanaDelProyecto; etiqueta: string }[] = [
  { id: "resumen", etiqueta: "Resumen" },
  { id: "tareas", etiqueta: "Tareas" },
  { id: "conectores", etiqueta: "Conectores" },
];

/**
 * El panel de UN proyecto (IXCODE-11): lo que se ve al pulsar el proyecto en la barra, en vez
 * del chat vacío de una sesión recién abierta. «Pulsar un proyecto abre su panel»: desde aquí se
 * elige qué hacer —una sesión nueva, reabrir una, o empezar una tarea de Jira—, y lo que haga
 * falta configurar para eso (qué conectores usa, a qué proyecto de Jira está vinculado).
 *
 * **Las pestañas son las del panel lateral** (`Pestanas.tsx`: `tablist`/`tab`, las mismas clases
 * de la hoja copiada y el mismo acento), sin la «×»: esto no se cierra, se sale eligiendo una
 * sesión. Van tres y crecerán («después adicionaremos al panel del proyecto algunos tabs»).
 *
 * **No inventa nada y no duplica nada.** Lo del proyecto sale del alta (sesiones, entorno), de
 * los planes que ya se piden al abrirlo, y de la ranura de tareas en background que `App` monta
 * con los MISMOS manejadores del panel lateral. Lo del gestor sale del mensaje `gestor`, que se
 * pide aquí: el `estado` al montar, las pendientes al abrir su pestaña. Lo que no tiene dato no
 * se pinta, y «no hay vínculo» solo se dice cuando el servidor lo ha dicho — mientras tanto, se
 * está consultando.
 *
 * **«Nueva sesión con esta tarea» NO manda nada al agente**: pide `empezar`, el servidor abre una
 * sesión nueva y contesta con un BORRADOR que `App` deja en el compositor. Lo envía la persona.
 */
export function PanelDelProyecto({
  nombre,
  entorno,
  rama,
  sesiones,
  alAbrirSesion,
  alNuevaSesion,
  planes,
  tareasEnFondo,
  gestor,
  conectores,
  conectado,
  alGestor,
  alAbrirAjustesDeConectores,
}: {
  nombre: string;
  /** El NOMBRE del entorno del proyecto. Ausente = no consta, y no se pinta. */
  entorno?: string;
  /** La rama de la copia, si ya se midió (`sync`). Ausente = no se pinta. */
  rama?: string;
  /** Las sesiones guardadas del proyecto (`alta.proyectos[].sesiones`). Ausente = no consta. */
  sesiones?: SesionDelCable[];
  alAbrirSesion: (sesion: string) => void;
  alNuevaSesion: () => void;
  /** Los planes del proyecto, ya validados. Ausente o vacío = no se pinta la sección. */
  planes?: PlanDelCable[];
  /** Las tareas en background del proyecto: la ranura que `App` ya monta para el panel lateral. */
  tareasEnFondo?: ReactNode;
  gestor?: EstadoDelCliente["gestor"];
  conectores?: EstadoDelCliente["conectores"];
  conectado: boolean;
  alGestor: (peticion: PeticionAlGestor) => void;
  alAbrirAjustesDeConectores: () => void;
}) {
  const [pestana, setPestana] = useState<PestanaDelProyecto>("resumen");
  /**
   * La clave cuya sesión se está abriendo, para que el botón lo diga (R6). Vive AQUÍ y no en la
   * pestaña porque cambiar de pestaña no cancela nada en el servidor. Se suelta con la respuesta
   * —el borrador, o el error de `empezar`— y al caerse el cable, que no traerá ninguna de las dos.
   */
  const [empezando, setEmpezando] = useState<string | undefined>(undefined);
  const errorDeEmpezar = gestor?.errores?.empezar;
  const idDelBorrador = gestor?.borrador?.id;
  useEffect(() => {
    setEmpezando(undefined);
  }, [errorDeEmpezar, idDelBorrador]);
  useEffect(() => {
    if (!conectado) setEmpezando(undefined);
  }, [conectado]);

  // El estado del gestor se pide al montar: es lo que dice si hay vínculo, y sin él la pestaña
  // Tareas no sabría si consultar o decir que no hay gestor.
  useEffect(() => {
    alGestor({ accion: "estado" });
    // Solo al montar: `alGestor` puede cambiar de identidad en cada render de `App`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empezar = (clave: string): void => {
    setEmpezando(clave);
    alGestor({ accion: "empezar", clave });
  };

  return (
    <section className={estilos.panel} aria-label={`Proyecto ${nombre}`}>
      <header className={estilos.cabecera}>
        <h1 className={estilos.nombre}>{nombre}</h1>
        {entorno === undefined && rama === undefined ? null : (
          <p className={estilos.meta}>
            {entorno === undefined ? null : <span>{`Entorno: ${entorno}`}</span>}
            {rama === undefined ? null : <span>{`Rama: ${rama}`}</span>}
          </p>
        )}
      </header>
      <div className={pestanas.cabecera}>
        <div className={clsx(conversacion.tabs, pestanas.tira)} role="tablist" aria-label="Vistas del proyecto">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={pestana === p.id}
              className={clsx(conversacion.tab, pestanas.pestana, pestana === p.id && conversacion.tabActive)}
              onClick={() => setPestana(p.id)}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
      </div>
      <div className={estilos.cuerpo} role="tabpanel">
        {pestana === "resumen" ? (
          <Resumen
            {...(sesiones === undefined ? {} : { sesiones })}
            alAbrirSesion={alAbrirSesion}
            alNuevaSesion={alNuevaSesion}
            {...(planes === undefined ? {} : { planes })}
            tareasEnFondo={tareasEnFondo}
            conectado={conectado}
          />
        ) : pestana === "tareas" ? (
          <TareasDelGestor
            gestor={gestor}
            conectado={conectado}
            empezando={empezando}
            alGestor={alGestor}
            alEmpezar={empezar}
            alIrAConectores={() => setPestana("conectores")}
          />
        ) : (
          <ConectoresDelProyecto
            gestor={gestor}
            conectores={conectores}
            conectado={conectado}
            alGestor={alGestor}
            alAbrirAjustes={alAbrirAjustesDeConectores}
          />
        )}
      </div>
    </section>
  );
}

function Resumen({
  sesiones,
  alAbrirSesion,
  alNuevaSesion,
  planes,
  tareasEnFondo,
  conectado,
}: {
  sesiones?: SesionDelCable[];
  alAbrirSesion: (sesion: string) => void;
  alNuevaSesion: () => void;
  planes?: PlanDelCable[];
  tareasEnFondo?: ReactNode;
  conectado: boolean;
}) {
  return (
    <>
      <section className={estilos.seccion} aria-label="Sesiones">
        <div className={estilos.encabezado}>
          <h2 className={estilos.titulo}>Sesiones</h2>
          <button type="button" className={estilos.principal} onClick={alNuevaSesion} disabled={!conectado}>
            Nueva sesión
          </button>
        </div>
        {sesiones === undefined ? null : sesiones.length === 0 ? (
          <p className={estilos.aviso}>Este proyecto todavía no tiene sesiones guardadas.</p>
        ) : (
          <ul className={estilos.lista}>
            {sesiones.map((s) => (
              <li key={s.id}>
                <button type="button" className={estilos.fila} onClick={() => alAbrirSesion(s.id)} disabled={!conectado}>
                  {s.ticket === undefined ? s.titulo : `${s.ticket} · ${s.titulo}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {planes === undefined || planes.length === 0 ? null : (
        <section className={estilos.seccion} aria-label="Planes">
          <h2 className={estilos.titulo}>Planes</h2>
          <ul className={estilos.lista}>
            {planes.map((p) => {
              const tareas = p.tareas?.tareas ?? [];
              // La misma condición que la pestaña Planes: sin el progreso de TODAS, el resumen
              // contaría como pendientes las que simplemente no dicen nada.
              const conProgreso = tareas.length > 0 && tareas.every((t) => t.progreso !== undefined);
              return (
                <li key={p.nombre} className={estilos.plan}>
                  <span className={estilos.nombreDePlan}>{p.tareas?.titulo ?? p.nombre}</span>
                  {conProgreso ? (
                    <>
                      <span className={estilos.nota}>{resumenDelPlan(tareas)}</span>
                      <BarraDeProgreso tareas={tareas} />
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {tareasEnFondo === undefined ? null : (
        <section className={estilos.seccion} aria-label="Tareas en background">
          <h2 className={estilos.titulo}>Tareas en background</h2>
          {tareasEnFondo}
        </section>
      )}
    </>
  );
}

/** «a las 10:42»: la hora de la foto, que es lo que dice cuánto hace que se preguntó. */
function horaDe(cuando: number): string {
  return new Date(cuando).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function Aviso({ error }: { error?: { motivo: string } }) {
  return error === undefined ? null : (
    <p className={estilos.error} role="alert">
      {error.motivo}
    </p>
  );
}

function TareasDelGestor({
  gestor,
  conectado,
  empezando,
  alGestor,
  alEmpezar,
  alIrAConectores,
}: {
  gestor?: EstadoDelCliente["gestor"];
  conectado: boolean;
  empezando?: string;
  alGestor: (peticion: PeticionAlGestor) => void;
  alEmpezar: (clave: string) => void;
  alIrAConectores: () => void;
}) {
  const vinculo = gestor?.estado?.vinculo;
  const [texto, setTexto] = useState("");
  const clave = vinculo === undefined ? undefined : `${vinculo.conector}|${vinculo.sitio}|${vinculo.proyecto}`;
  // Al abrir la pestaña (y si cambia el vínculo), se pregunta: una lista de antes puede no ser
  // ya la de ahora, y la hora de la foto dice de cuándo es la que se ve mientras llega.
  useEffect(() => {
    if (clave !== undefined) alGestor({ accion: "pendientes" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const errores = gestor?.errores ?? {};
  if (gestor?.estado === undefined) {
    return errores.estado === undefined ? (
      <p className={estilos.aviso}>Consultando el gestor de tareas…</p>
    ) : (
      <p className={estilos.error} role="alert">{`No se ha podido leer el gestor de tareas: ${errores.estado.motivo}`}</p>
    );
  }
  // Sin vínculo lo dice, con el camino para ponerlo — NUNCA una lista vacía: «no hay
  // pendientes» sobre un proyecto sin gestor afirmaría que se preguntó a alguien.
  if (vinculo === undefined) {
    return (
      <div className={estilos.seccion}>
        <p className={estilos.aviso}>Este proyecto no tiene gestor de tareas.</p>
        <button type="button" className={estilos.accion} onClick={alIrAConectores}>
          Vincular en Conectores
        </button>
      </div>
    );
  }

  const pendientes = gestor.pendientes;
  const buscar = (): void => {
    const t = texto.trim();
    alGestor(t === "" ? { accion: "pendientes" } : { accion: "pendientes", texto: t });
  };
  const reintentar = (): void => {
    const t = pendientes?.texto;
    alGestor(t === undefined ? { accion: "pendientes" } : { accion: "pendientes", texto: t });
  };

  return (
    <div className={estilos.seccion}>
      <div className={estilos.encabezado}>
        <h2 className={estilos.titulo}>{`Pendientes de ${vinculo.proyecto}`}</h2>
        {pendientes === undefined ? null : <span className={estilos.nota}>{`Consultado a las ${horaDe(pendientes.cuando)}`}</span>}
      </div>
      <form
        className={estilos.busqueda}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <input
          type="search"
          className={estilos.campo}
          aria-label="Buscar tareas"
          placeholder="Buscar en las pendientes"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button type="submit" className={estilos.accion} disabled={!conectado}>
          Buscar
        </button>
        <button type="button" className={estilos.accion} onClick={reintentar} disabled={!conectado}>
          Reintentar
        </button>
      </form>
      <Aviso {...(errores.pendientes === undefined ? {} : { error: errores.pendientes })} />
      {empezando === undefined ? <Aviso {...(errores.empezar === undefined ? {} : { error: errores.empezar })} /> : null}
      {pendientes === undefined ? (
        errores.pendientes === undefined ? <p className={estilos.aviso}>Consultando las tareas…</p> : null
      ) : pendientes.lista.length === 0 ? (
        <p className={estilos.aviso}>
          {pendientes.texto === undefined ? "No hay tareas pendientes." : `No hay tareas pendientes que coincidan con «${pendientes.texto}».`}
        </p>
      ) : (
        <ul className={estilos.lista}>
          {pendientes.lista.map((t) => (
            <FilaDeTarea
              key={t.clave}
              tarea={t}
              conectado={conectado}
              abriendo={empezando === t.clave}
              ocupado={empezando !== undefined}
              alEmpezar={() => alEmpezar(t.clave)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaDeTarea({
  tarea: t,
  conectado,
  abriendo,
  ocupado,
  alEmpezar,
}: {
  tarea: TareaDelGestor;
  conectado: boolean;
  abriendo: boolean;
  ocupado: boolean;
  alEmpezar: () => void;
}) {
  return (
    <li className={estilos.tarea} data-categoria={t.categoria}>
      <div className={estilos.datos}>
        <span className={estilos.clave}>{t.clave}</span>
        <span className={estilos.tituloDeTarea}>{t.titulo}</span>
        <span className={estilos.estado}>{t.estado}</span>
        {t.asignado === undefined ? null : <span className={estilos.nota}>{t.asignado}</span>}
      </div>
      <div className={estilos.acciones}>
        {t.url === undefined ? null : (
          <a className={estilos.enlace} href={t.url} target="_blank" rel="noreferrer">
            Abrir en Jira
          </a>
        )}
        <button
          type="button"
          className={estilos.principal}
          onClick={alEmpezar}
          disabled={!conectado || ocupado}
          aria-label={abriendo ? `Abriendo la sesión de ${t.clave}…` : `Nueva sesión con ${t.clave}`}
        >
          {abriendo ? "Abriendo…" : "Nueva sesión con esta tarea"}
        </button>
      </div>
    </li>
  );
}

function ConectoresDelProyecto({
  gestor,
  conectores,
  conectado,
  alGestor,
  alAbrirAjustes,
}: {
  gestor?: EstadoDelCliente["gestor"];
  conectores?: EstadoDelCliente["conectores"];
  conectado: boolean;
  alGestor: (peticion: PeticionAlGestor) => void;
  alAbrirAjustes: () => void;
}) {
  const errores = gestor?.errores ?? {};
  const estado = gestor?.estado;
  const avisos = (
    <>
      {(["estado", "usarConector", "vincular", "desvincular", "sitios", "proyectos"] as const).map((a) => (
        <Aviso key={a} {...(errores[a] === undefined ? {} : { error: errores[a] })} />
      ))}
    </>
  );
  if (estado === undefined || conectores === undefined) {
    return (
      <div className={estilos.seccion}>
        {avisos}
        {errores.estado === undefined ? <p className={estilos.aviso}>Consultando los conectores…</p> : null}
      </div>
    );
  }
  const nombreDe = (id: string): string => conectores.catalogo.find((f) => f.id === id)?.nombre ?? id;
  // «Conectado» es lo MISMO que dice su pastilla en Ajustes: la última prueba contestó. Un
  // conector añadido sin eso no se ofrece para EMPEZAR a usarlo —sería apuntar a algo que no
  // responde—, pero el que el proyecto YA usa o tiene vinculado se pinta igual: la prueba es una
  // foto EN MEMORIA que un reinicio borra, y sin esto el vínculo y su «Desvincular» desaparecían
  // de esta pestaña mientras Tareas seguía trabajando contra él.
  const vinculo = estado.vinculo;
  const esConectado = (c: { prueba?: { ok: boolean } }): boolean => c.prueba?.ok === true;
  const conectados = conectores.conectores.filter(
    (c) => esConectado(c) || estado.conectores.includes(c.id) || vinculo?.conector === c.id
  );
  const sinConectar = conectores.conectores.filter((c) => !esConectado(c));

  return (
    <div className={estilos.seccion}>
      {avisos}
      {conectados.length === 0 ? null : (
        <ul className={estilos.lista}>
          {conectados.map((c) => {
            const usado = estado.conectores.includes(c.id);
            // R5: el vinculado no se deja de usar desde aquí —el servidor no lo desvincularía y
            // la casilla mentiría—, y el motivo se ve, no se esconde en un `title`.
            const atado = vinculo?.conector === c.id && usado;
            return (
              <li key={c.id} className={estilos.conector}>
                <div className={estilos.filaDeConector}>
                  <IconoDeConector id={c.id} nombre={nombreDe(c.id)} />
                  <span className={estilos.tituloDeTarea}>{nombreDe(c.id)}</span>
                  <label className={estilos.casilla}>
                    <input
                      type="checkbox"
                      checked={usado}
                      disabled={!conectado || atado}
                      onChange={(e) => alGestor({ accion: "usarConector", conector: c.id, usar: e.target.checked })}
                    />
                    Usar en este proyecto
                  </label>
                </div>
                {atado ? <p className={estilos.nota}>Está vinculado: desvincula antes de dejar de usarlo.</p> : null}
                {/* Sin conexión no se le puede preguntar por sitios: solo se enseña el vínculo que ya hay. */}
                {c.id === "jira" && (esConectado(c) || vinculo?.conector === "jira") ? (
                  <VinculoDeJira gestor={gestor} conectado={conectado} alGestor={alGestor} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {sinConectar.length === 0 ? null : (
        <div className={estilos.encabezado}>
          <p className={estilos.aviso}>
            {`${sinConectar.length === 1 ? "Un conector añadido no está conectado" : `${sinConectar.length} conectores añadidos no están conectados`}: ${sinConectar.map((c) => nombreDe(c.id)).join(", ")}. Se conectan en Ajustes.`}
          </p>
          <button type="button" className={estilos.accion} onClick={alAbrirAjustes}>
            Abrir Ajustes
          </button>
        </div>
      )}
      {conectores.conectores.length === 0 ? (
        <div className={estilos.encabezado}>
          <p className={estilos.aviso}>No hay ningún conector añadido. Se añaden en Ajustes.</p>
          <button type="button" className={estilos.accion} onClick={alAbrirAjustes}>
            Abrir Ajustes
          </button>
        </div>
      ) : null}
    </div>
  );
}

function VinculoDeJira({
  gestor,
  conectado,
  alGestor,
}: {
  gestor?: EstadoDelCliente["gestor"];
  conectado: boolean;
  alGestor: (peticion: PeticionAlGestor) => void;
}) {
  const vinculo = gestor?.estado?.vinculo;
  const vinculadoAJira = vinculo?.conector === "jira";
  const sitios = gestor?.sitios?.conector === "jira" ? gestor.sitios.lista : undefined;
  const [sitio, setSitio] = useState<string>("");
  const [proyecto, setProyecto] = useState<string>("");
  // Con un sitio solo no hay nada que elegir: se elige solo.
  const sitioElegido = sitio !== "" ? sitio : sitios?.length === 1 ? sitios[0]!.id : "";
  const proyectos = gestor?.proyectos?.sitio === sitioElegido && sitioElegido !== "" ? gestor.proyectos.lista : undefined;

  useEffect(() => {
    if (!vinculadoAJira) alGestor({ accion: "sitios", conector: "jira" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinculadoAJira]);
  useEffect(() => {
    setProyecto("");
    if (!vinculadoAJira && sitioElegido !== "") alGestor({ accion: "proyectos", conector: "jira", sitio: sitioElegido });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitioElegido, vinculadoAJira]);

  if (vinculadoAJira) {
    return (
      <div className={estilos.vinculo}>
        <span>{`Vinculado a ${vinculo.proyecto} en ${vinculo.nombreDelSitio ?? vinculo.sitio}.`}</span>
        <button type="button" className={estilos.peligro} onClick={() => alGestor({ accion: "desvincular" })} disabled={!conectado}>
          Desvincular
        </button>
      </div>
    );
  }
  return (
    <div className={estilos.vinculo}>
      <label className={estilos.casilla}>
        Sitio
        <select className={estilos.campo} value={sitioElegido} onChange={(e) => setSitio(e.target.value)} disabled={sitios === undefined}>
          {sitios === undefined ? <option value="">Consultando…</option> : <option value="">Elige un sitio</option>}
          {(sitios ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className={estilos.casilla}>
        Proyecto de Jira
        <select className={estilos.campo} value={proyecto} onChange={(e) => setProyecto(e.target.value)} disabled={proyectos === undefined}>
          <option value="">{proyectos === undefined ? "—" : "Elige un proyecto"}</option>
          {(proyectos ?? []).map((p) => (
            <option key={p.clave} value={p.clave}>
              {`${p.clave} · ${p.nombre}`}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={estilos.principal}
        disabled={!conectado || sitioElegido === "" || proyecto === ""}
        onClick={() => alGestor({ accion: "vincular", conector: "jira", sitio: sitioElegido, proyecto })}
      >
        Vincular
      </button>
    </div>
  );
}
