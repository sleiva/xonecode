import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EstadoDelCliente } from "../store.js";
import type { MensajeDelCliente, PlanDelCable, SesionDelCable, TareaDelGestor } from "../tipos.js";
import { IconoDeConector } from "./IconoDeConector.js";
import { BarraDeProgreso, resumenDelPlan } from "./Planes.js";
import { TarjetaDeEmpezar } from "./TarjetaDeJira.js";
import conversacion from "../../estilos/ConversationRoot.module.css";
import pestanas from "./Pestanas.module.css";
import estilos from "./PanelDelProyecto.module.css";

/** Lo que el panel manda por el cable: solo intención del gestor (el servidor decide cómo). */
export type MensajeDelGestor = Extract<MensajeDelCliente, { clase: "gestor" }>;
/** Sin la `clase`: la pone quien envía. Distribuido sobre la unión, para que cada acción
 *  conserve SUS campos. */
export type PeticionAlGestor = MensajeDelGestor extends infer M ? (M extends { clase: "gestor" } ? Omit<M, "clase"> : never) : never;
/**
 * Lo que acompaña a una petición al gestor y NO viaja por el cable (Task 11, IXCODE-11):
 * hoy solo el `destino` (el nombre de la transición elegida) de un `empezar` CON `transicion`,
 * que R8 necesita para componer «No se pudo pasar IXCODE-12 a EN CURSO…» en el chat DESPUÉS
 * de que la sesión ya se haya mudado — momento en el que `gestor.transiciones` puede haber
 * cambiado de clave, así que quien lo necesita lo captura AQUÍ, en el instante del envío.
 */
export type ContextoDeGestor = { destino?: string };

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
  turnoEnVuelo = false,
  empezarEnVuelo,
  alVolverAlChat,
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
  /**
   * Hay un turno en marcha en la sesión abierta. Entonces el panel lo DICE, con la vuelta al
   * chat, y apaga las dos puertas a una sesión nueva: con un turno en vuelo el servidor contesta
   * con la sesión que trabaja, no con otra (el «+» de la barra se apaga por lo mismo).
   */
  turnoEnVuelo?: boolean;
  /**
   * HAY un `empezar` esperando respuesta, ahora mismo — de CUALQUIER tarea. Viene de `App` y
   * no es estado local de este panel: el panel se DESMONTA con «Volver al chat» o con una
   * espera de humano, y un candado local se habría soltado con el desmontaje, dejando la fila
   * re-habilitada mientras el `empezar` de antes seguía resolviendo en el servidor. `App`
   * sabe cuándo se suelta de verdad (ver su comentario: ni «llegó un error» basta, porque el
   * servidor puede seguir camino a abrir la sesión aunque la transición haya fallado).
   */
  empezarEnVuelo: boolean;
  alVolverAlChat?: () => void;
  alGestor: (peticion: PeticionAlGestor, contexto?: ContextoDeGestor) => void;
  alAbrirAjustesDeConectores: () => void;
}) {
  const [pestana, setPestana] = useState<PestanaDelProyecto>("resumen");
  /**
   * La CLAVE de la tarea cuya tarjeta «Empezar» está abierta (Task 11, IXCODE-11); `undefined`
   * es «cerrada». Vive AQUÍ y no en la pestaña porque cambiar de pestaña no cancela nada en el
   * servidor. Se abre al pulsar la fila —que pide `transiciones`, de solo LECTURA— y solo se
   * CIERRA sola con el borrador: un `empezar` puede fallar (transición rechazada) y la sesión
   * abrirse igual, así que un error a secas deja la tarjeta a la vista con su motivo, no la
   * cierra (R de la tarjeta: «Con un error… el diálogo sigue abierto»).
   */
  const [tarjetaEmpezar, setTarjetaEmpezar] = useState<string | undefined>(undefined);
  const errorDeEmpezar = gestor?.errores?.empezar;
  const errorTransicionesDelGestor = gestor?.errores?.transiciones;
  const idDelBorrador = gestor?.borrador?.id;
  useEffect(() => {
    if (idDelBorrador === undefined) return;
    setTarjetaEmpezar(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDelBorrador]);
  useEffect(() => {
    if (!conectado) setTarjetaEmpezar(undefined);
  }, [conectado]);

  // El estado del gestor se pide al montar Y al volver el cable: es lo que dice si hay vínculo,
  // y sin él la pestaña Tareas no sabría si consultar o decir que no hay gestor. Al caerse el
  // cable el store tira `gestor` entero (`marcarDesconectado`) pero el panel sigue montado:
  // pedirlo solo al montar lo dejaba en «Consultando…» para siempre tras reconectar. Tareas
  // vuelve a pedir sus pendientes sola, al reaparecer el vínculo (su efecto va por la clave).
  useEffect(() => {
    if (conectado) alGestor({ accion: "estado" });
    // Solo `conectado`: `alGestor` puede cambiar de identidad en cada render de `App`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado]);

  /**
   * Lo que ya había en `errores.empezar`/`errores.transiciones` AL ABRIR la tarjeta (R6): un
   * fallo de un intento ANTERIOR no se enseña de rebote en una tarjeta recién abierta para
   * otra tarea —o la misma, reabierta—; solo se enseña el que llega DESPUÉS.
   */
  const erroresAlAbrirRef = useRef<{ empezar?: { motivo: string }; transiciones?: { motivo: string } }>({});
  /** Abre la tarjeta y pide sus transiciones (Task 10): de solo LECTURA, no escribe nada. */
  const pedirEmpezar = (clave: string): void => {
    setTarjetaEmpezar(clave);
    erroresAlAbrirRef.current = { empezar: errorDeEmpezar, transiciones: errorTransicionesDelGestor };
    alGestor({ accion: "transiciones", clave, para: "empezar" });
  };
  const transicionesDelGestor = gestor?.transiciones;
  const transicionesDeEmpezar =
    transicionesDelGestor !== undefined && transicionesDelGestor.clave === tarjetaEmpezar && transicionesDelGestor.para === "empezar"
      ? transicionesDelGestor
      : undefined;
  const errorDeEmpezarAMostrar = errorDeEmpezar !== erroresAlAbrirRef.current.empezar ? errorDeEmpezar : undefined;
  const errorTransicionesAMostrar = errorTransicionesDelGestor !== erroresAlAbrirRef.current.transiciones ? errorTransicionesDelGestor : undefined;
  /** Confirmar es la ÚNICA vía por la que sale `empezar`: con o sin `transicion` elegida. */
  const confirmarEmpezar = (transicion: string | undefined): void => {
    if (tarjetaEmpezar === undefined) return;
    // El destino se captura AQUÍ, del desplegable que la persona tiene delante: `gestor.transiciones`
    // puede haber cambiado de clave para cuando la respuesta llegue (R8, `ContextoDeGestor`).
    const destino = transicion === undefined ? undefined : transicionesDeEmpezar?.lista.find((t) => t.id === transicion)?.destino;
    alGestor({ accion: "empezar", clave: tarjetaEmpezar, ...(transicion === undefined ? {} : { transicion }) }, { destino });
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
      {turnoEnVuelo ? (
        <div className={estilos.trabajando} role="status">
          <span>El agente está trabajando en esta sesión.</span>
          {alVolverAlChat === undefined ? null : (
            <button type="button" className={estilos.accion} onClick={alVolverAlChat}>
              Volver al chat
            </button>
          )}
        </div>
      ) : null}
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
            turnoEnVuelo={turnoEnVuelo}
          />
        ) : pestana === "tareas" ? (
          <TareasDelGestor
            gestor={gestor}
            conectado={conectado}
            // `empezarEnVuelo` cubre el remonte: si el panel se desmontó («Volver al chat»)
            // con un `empezar` todavía resolviendo, `tarjetaEmpezar` vuelve a `undefined`
            // pero la fila no puede volver a lanzarlo hasta que `App` diga que terminó.
            ocupado={tarjetaEmpezar !== undefined || empezarEnVuelo}
            turnoEnVuelo={turnoEnVuelo}
            alGestor={alGestor}
            alEmpezar={pedirEmpezar}
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
      {tarjetaEmpezar === undefined ? null : (
        <TarjetaDeEmpezar
          clave={tarjetaEmpezar}
          // El objeto de `gestor.transiciones` se pasa TAL CUAL, sin envolverlo en un literal
          // nuevo: un literal `{lista, propuesta}` fresco en CADA render (App se re-renderiza
          // por consumo, turno, dispositivos…) le habría hecho creer a `useTransicionElegida`
          // que llegó una lista NUEVA en cada uno, y le devolvía la propuesta a quien ya había
          // elegido otra transición del desplegable. El objeto del store solo cambia de
          // identidad cuando de verdad llega un `gestor.transiciones` nuevo (`store.ts`).
          {...(transicionesDeEmpezar === undefined ? {} : { transiciones: transicionesDeEmpezar })}
          {...(errorTransicionesAMostrar === undefined ? {} : { errorTransiciones: errorTransicionesAMostrar.motivo })}
          enviando={empezarEnVuelo}
          // Mientras `empezarEnVuelo` sigue puesto, el error NO se enseña: en el orden de R8
          // (error → `abrirProyecto` → alta → borrador) ese motivo es justo el que la sesión
          // ABRE IGUAL, y pintarlo como fallo de la tarjeta mentiría dos veces — una vez aquí
          // dentro y otra en el aviso del chat que sale al cerrarse. Solo se enseña cuando YA
          // no hay nada en vuelo: en el fallo TOTAL (sin transición que siga abriendo nada), el
          // `alta` con la MISMA sesión suelta `empezarEnVuelo` y el motivo aparece entonces.
          {...(empezarEnVuelo || errorDeEmpezarAMostrar === undefined ? {} : { error: errorDeEmpezarAMostrar.motivo })}
          alConfirmar={confirmarEmpezar}
          alCancelar={() => setTarjetaEmpezar(undefined)}
        />
      )}
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
  turnoEnVuelo,
}: {
  sesiones?: SesionDelCable[];
  alAbrirSesion: (sesion: string) => void;
  alNuevaSesion: () => void;
  planes?: PlanDelCable[];
  tareasEnFondo?: ReactNode;
  conectado: boolean;
  turnoEnVuelo: boolean;
}) {
  return (
    <>
      <section className={estilos.seccion} aria-label="Sesiones">
        <div className={estilos.encabezado}>
          <h2 className={estilos.titulo}>Sesiones</h2>
          <button
            type="button"
            className={estilos.principal}
            onClick={alNuevaSesion}
            disabled={!conectado || turnoEnVuelo}
            {...(turnoEnVuelo ? { title: TITULO_CON_TURNO } : {})}
          >
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

/** Por qué las dos puertas a una sesión nueva se apagan con un turno en marcha. */
const TITULO_CON_TURNO = "Hay un turno en marcha: con él en vuelo se volvería a la sesión que trabaja, no a una nueva. Espera a que termine o páralo.";

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
  ocupado,
  turnoEnVuelo,
  alGestor,
  alEmpezar,
  alIrAConectores,
}: {
  gestor?: EstadoDelCliente["gestor"];
  conectado: boolean;
  /** Hay una tarjeta «Empezar» abierta (para CUALQUIER tarea): mientras tanto no se abre otra. */
  ocupado: boolean;
  turnoEnVuelo: boolean;
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
              ocupado={ocupado}
              turnoEnVuelo={turnoEnVuelo}
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
  ocupado,
  turnoEnVuelo,
  alEmpezar,
}: {
  tarea: TareaDelGestor;
  conectado: boolean;
  /** Hay una tarjeta «Empezar» abierta, de CUALQUIER tarea: no se lanza una segunda. */
  ocupado: boolean;
  turnoEnVuelo: boolean;
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
          disabled={!conectado || ocupado || turnoEnVuelo}
          {...(turnoEnVuelo ? { title: TITULO_CON_TURNO } : {})}
          aria-label={`Nueva sesión con ${t.clave}`}
        >
          Nueva sesión con esta tarea
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
