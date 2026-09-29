import clsx from "clsx";
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { etiquetaDeClave } from "../etiquetaDeClave.js";
import { ETIQUETAS_DE_CODIGO } from "../etiquetasDeCodigo.js";
import { protegerDolares } from "../protegerDolares.js";
import type { EstadoDelCliente } from "../store.js";
import type {
  CategoriaDeTarea,
  EsquemaDelProyecto,
  MensajeDelCliente,
  PlanDelCable,
  TareaDelGestor,
  VinculoDelCable,
} from "../tipos.js";
import { IconoDeConector } from "./IconoDeConector.js";
import { IconoDeActualizar, IconoDeEnlaceExterno } from "./IconosDelVisor.js";
import { BarraDeProgreso, resumenDelPlan } from "./Planes.js";
import { TarjetaDeEmpezar } from "./TarjetaDeJira.js";
import { ResumenDeProyecto, type AccionesDeLaCopia, type ProyectoDelResumen } from "./ResumenDeProyecto.js";
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

/**
 * El NOMBRE para mostrar de un conector (IXCODE-15): el del catálogo que el cliente ya tiene
 * (`FilaDeCatalogo.nombre`), nunca uno a fuego. `undefined` cuando no consta —sin catálogo, o
 * sin vínculo todavía—, y quien lo pinta cae en una frase NEUTRA («Cerrar la tarea»): poner
 * «Jira» por omisión mentiría en una sesión de Notion. Lo usan el panel y `App.tsx`.
 */
export function nombreDelConector(conectores: EstadoDelCliente["conectores"] | undefined, id: string | undefined): string | undefined {
  if (id === undefined) return undefined;
  return conectores?.catalogo.find((f) => f.id === id)?.nombre;
}

/**
 * Lo que se ENSEÑA del proyecto vinculado: la clave si está hecha para leerse (Jira, `IXCODE`),
 * y si es la URL `collection://…` de un data source de Notion, su nombre (`nombreDelProyecto`,
 * que el servidor GUARDA con el vínculo en el `config.json`). `undefined` = no hay nada legible
 * que enseñar —un vínculo escrito antes de ese campo, del que este proceso tampoco oyó el
 * nombre—, y entonces NO se pinta la URL cruda.
 */
function proyectoALaVista(v: VinculoDelCable): string | undefined {
  return v.proyecto.startsWith("collection://") ? v.nombreDelProyecto : v.proyecto;
}

const PESTANAS: { id: PestanaDelProyecto; etiqueta: string }[] = [
  { id: "resumen", etiqueta: "Resumen" },
  { id: "tareas", etiqueta: "Tareas" },
  { id: "conectores", etiqueta: "Conectores" },
];

/**
 * Lo de la COPIA local del proyecto para la pestaña Resumen (`ResumenDeProyecto.tsx`): su fila
 * de `alta.proyectos` y los manejadores que hablan con el servidor. Ausente = no se pinta.
 */
export type CopiaDelPanel = { proyecto: ProyectoDelResumen } & AccionesDeLaCopia;

/**
 * El panel de UN proyecto (IXCODE-11): lo que se ve al pulsar el proyecto en la barra, en vez
 * del chat vacío de una sesión recién abierta. «Pulsar un proyecto abre su panel»: desde aquí se
 * empieza una tarea del gestor y se configura lo que haga falta para eso (qué conectores usa, a
 * qué gestor está vinculado). Las sesiones —abrir una, o una nueva— son de la barra lateral.
 *
 * **Las pestañas son las del panel lateral** (`Pestanas.tsx`: `tablist`/`tab`, las mismas clases
 * de la hoja copiada y el mismo acento), sin la «×»: esto no se cierra, se sale eligiendo una
 * sesión. Van tres y crecerán («después adicionaremos al panel del proyecto algunos tabs»).
 *
 * **No inventa nada y no duplica nada.** Lo del proyecto sale del alta (entorno), de
 * los planes que ya se piden al abrirlo, y de la ranura de tareas en background que `App` monta
 * con los MISMOS manejadores del panel lateral. Lo del gestor sale del mensaje `gestor`, que se
 * pide aquí: el `estado` al montar, las pendientes al abrir su pestaña. Lo que no tiene dato no
 * se pinta, y «no hay vínculo» solo se dice cuando el servidor lo ha dicho — mientras tanto, se
 * está consultando.
 *
 * **Un proyecto SIN copia local también tiene panel, pero solo con Resumen** (`copia` con
 * `local` distinto de `true`): Tareas y Conectores le preguntan a la consola ABIERTA, que es la
 * de otro proyecto, así que no se montan —ni se pregunta al gestor— y el panel dice por qué.
 *
 * **«Nueva sesión con esta tarea» NO manda nada al agente**: pide `empezar`, el servidor abre una
 * sesión nueva y contesta con un BORRADOR que `App` deja en el compositor. Lo envía la persona.
 */
export function PanelDelProyecto({
  nombre,
  entorno,
  rama,
  planes,
  copia,
  tareasEnFondo,
  gestor,
  conectores,
  conectado,
  turnoEnVuelo = false,
  empezarEnVuelo,
  alVolverAlChat,
  alGestor,
  alAutorizarConector,
  alProbarConector,
  alAbrirAjustesDeConectores,
}: {
  nombre: string;
  /** El NOMBRE del entorno del proyecto. Ausente = no consta, y no se pinta. */
  entorno?: string;
  /** La rama de la copia, si ya se midió (`sync`). Ausente = no se pinta. */
  rama?: string;
  /** Los planes del proyecto, ya validados. Ausente o vacío = no se pinta la sección. */
  planes?: PlanDelCable[];
  /** La copia local, arriba de la pestaña Resumen: pastillas, acciones, lo que queda por
   *  subir y el gasto. Ausente = no se pinta. Con `local` distinto de `true`, solo Resumen. */
  copia?: CopiaDelPanel;
  /** Las tareas en background del proyecto: la ranura que `App` ya monta para el panel lateral. */
  tareasEnFondo?: ReactNode;
  gestor?: EstadoDelCliente["gestor"];
  conectores?: EstadoDelCliente["conectores"];
  conectado: boolean;
  /**
   * Hay un turno en marcha en la sesión abierta. Entonces el panel lo DICE, con la vuelta al
   * chat, y apaga «Nueva sesión con esta tarea»: con un turno en vuelo el servidor contesta
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
  /**
   * «Conectar» un conector AÑADIDO desde el panel: el MISMO mensaje que el botón de Ajustes
   * (`{clase:"conector", accion:"autorizar", id}`), así que el servidor decide el carril —el
   * navegador para OAuth, la clave por `leerSecreto` para `api-key`—. Añadir o definir un
   * conector sigue siendo cosa de Ajustes.
   */
  alAutorizarConector: (id: string) => void;
  /**
   * PROBAR un conector añadido: el MISMO `{clase:"conector", accion:"probar", id}` de Ajustes. La
   * prueba es una foto EN MEMORIA del servidor, así que tras un reinicio todo sale «sin probar»
   * aunque las credenciales sigan en disco; la pestaña Conectores la pide sola (ver
   * `useProbarLoSinProbar`) en vez de ofrecer «Conectar» —que volvería a autorizar sin falta—.
   */
  alProbarConector: (id: string) => void;
  alAbrirAjustesDeConectores: () => void;
}) {
  const [pestana, setPestana] = useState<PestanaDelProyecto>("resumen");
  /** Sin copia en el equipo no hay consola de ESTE proyecto: solo su Resumen. */
  const sinCopia = copia !== undefined && copia.proyecto.local !== true;
  const pestanasALaVista = sinCopia ? PESTANAS.filter((p) => p.id === "resumen") : PESTANAS;
  /**
   * La ÚLTIMA petición de cada acción que salió de este panel: lo que se vuelve a mandar, UNA
   * vez, cuando un conector cuya credencial faltaba pasa a conectado (`useReintentoTrasConectar`).
   * Vive aquí y no en cada pestaña porque la vuelta del navegador puede llegar con la persona
   * mirando otra.
   */
  const ultimas = useRef<Partial<Record<PeticionAlGestor["accion"], PeticionAlGestor>>>({});
  /** Los errores que ya no se repiten al conectar: ya se volvió a pedir su acción (`useReintentoTrasConectar`). */
  const repetidos = useRef(new WeakSet<object>());
  const pedir = (peticion: PeticionAlGestor, contexto?: ContextoDeGestor): void => {
    ultimas.current[peticion.accion] = peticion;
    const previo = gestor?.errores?.[peticion.accion];
    if (previo !== undefined) repetidos.current.add(previo);
    if (contexto === undefined) alGestor(peticion);
    else alGestor(peticion, contexto);
  };
  /** El conector con el que falló una acción: el del vínculo para las pendientes, el pedido para el resto. */
  const conectorDelFallo = (accion: AccionConConector): string | undefined => {
    if (accion === "pendientes") return gestor?.estado?.vinculo?.conector;
    const p = ultimas.current[accion];
    return p !== undefined && "conector" in p ? p.conector : undefined;
  };
  useReintentoTrasConectar({ gestor, conectores, conectado, ultimas: ultimas.current, repetidos: repetidos.current, conectorDelFallo, pedir });
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
    // Sin copia, el gestor abierto es el de OTRO proyecto: no se le pregunta nada.
    if (conectado && !sinCopia) pedir({ accion: "estado" });
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
    pedir({ accion: "transiciones", clave, para: "empezar" });
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
    pedir({ accion: "empezar", clave: tarjetaEmpezar, ...(transicion === undefined ? {} : { transicion }) }, { destino });
  };

  /** El nombre del gestor VINCULADO («Jira», «Notion»), del catálogo; ausente = no consta. */
  const nombreDelGestor = nombreDelConector(conectores, gestor?.estado?.vinculo?.conector);

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
          {pestanasALaVista.map((p) => (
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
        {pestana === "resumen" || sinCopia ? (
          <>
            {copia === undefined ? null : (
              <ResumenDeProyecto
                proyecto={copia.proyecto}
                conectado={conectado}
                alDescargar={copia.alDescargar}
                alAbrirCarpeta={copia.alAbrirCarpeta}
                alBorrarCopia={copia.alBorrarCopia}
                alPedirResumen={copia.alPedirResumen}
              />
            )}
            {sinCopia ? (
              <p className={estilos.aviso}>
                Tareas y Conectores aparecen cuando el proyecto está descargado: los dos trabajan sobre la copia
                abierta.
              </p>
            ) : (
              <Resumen {...(planes === undefined ? {} : { planes })} />
            )}
          </>
        ) : pestana === "tareas" ? (
          <>
            {/* Primero las tareas en BACKGROUND del proyecto —las que el agente hace solo, que
                son del proyecto y no de una sesión— y debajo las del gestor (Jira/Notion). */}
            {tareasEnFondo === undefined ? null : (
              <section className={estilos.seccion} aria-label="Tareas en background">
                <h2 className={estilos.titulo}>Tareas en background</h2>
                {tareasEnFondo}
              </section>
            )}
          <TareasDelGestor
            gestor={gestor}
            conectado={conectado}
            // `empezarEnVuelo` cubre el remonte: si el panel se desmontó («Volver al chat»)
            // con un `empezar` todavía resolviendo, `tarjetaEmpezar` vuelve a `undefined`
            // pero la fila no puede volver a lanzarlo hasta que `App` diga que terminó.
            ocupado={tarjetaEmpezar !== undefined || empezarEnVuelo}
            turnoEnVuelo={turnoEnVuelo}
            {...(conectores === undefined ? {} : { conectores })}
            alGestor={pedir}
            alAutorizar={alAutorizarConector}
            alEmpezar={pedirEmpezar}
            alIrAConectores={() => setPestana("conectores")}
            alAbrirAjustes={alAbrirAjustesDeConectores}
          />
          </>
        ) : (
          <ConectoresDelProyecto
            gestor={gestor}
            conectores={conectores}
            conectado={conectado}
            alGestor={pedir}
            alAutorizar={alAutorizarConector}
            alProbar={alProbarConector}
            conectorDelFallo={conectorDelFallo}
            alAbrirAjustes={alAbrirAjustesDeConectores}
          />
        )}
      </div>
      {tarjetaEmpezar === undefined ? null : (
        <TarjetaDeEmpezar
          clave={tarjetaEmpezar}
          {...(nombreDelGestor === undefined ? {} : { nombreDelGestor })}
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

/**
 * El resumen: los planes, debajo de lo de la copia (`ResumenDeProyecto`). Las SESIONES no están aquí —ni la lista ni «Nueva sesión»—, a petición
 * suya: ya están en la barra lateral (con su «+»). Las tareas en background tampoco: van en la
 * pestaña Tareas, encima de las del gestor.
 */
function Resumen({ planes: todos }: { planes?: PlanDelCable[] }) {
  const planes = todos?.filter(esPlanCompleto);
  return (
    <>
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
    </>
  );
}

/**
 * El Resumen solo enseña los planes con `PLAN.md` Y `TASKS.md` (a petición suya): uno a medias
 * salía como un nombre suelto, sin barra ni explicación. La pestaña Planes los sigue enseñando
 * todos, con el motivo de que falten las tareas.
 */
function esPlanCompleto(plan: PlanDelCable): boolean {
  return plan.ficheros.includes("PLAN.md") && plan.ficheros.includes("TASKS.md");
}

/** Por qué «Nueva sesión con esta tarea» se apaga con un turno en marcha. */
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

/** Las acciones cuyo fallo dice con QUÉ conector falló, y que por tanto se arreglan conectándolo. */
type AccionConConector = "sitios" | "proyectos" | "buscarProyectos" | "describir" | "vincular" | "pendientes";
/** Las que se REPITEN solas al conectar: leer. `vincular` escribe la configuración y no se repite sola. */
const REPETIBLES_AL_CONECTAR: readonly AccionConConector[] = ["sitios", "proyectos", "buscarProyectos", "describir", "pendientes"];

/**
 * El motivo de un fallo del gestor que se arregla CONECTANDO el conector: la frase que
 * `ServicioDeConectores.llamar` usa cuando no hay credencial con la que hablar (`falta
 * autorizar`). Cualquier otro motivo —Jira contestó con un error, no responde— no se arregla con
 * otro «Conectar».
 */
function seArreglaConectando(motivo: string): boolean {
  return /falta autorizar/.test(motivo);
}

/**
 * `«jira» no está conectado`: `llamar` lo dice exactamente cuando el conector NO está AÑADIDO, así
 * que no hay fila ni «Conectar» posibles —`autorizar` no hace nada con lo no añadido—. El camino
 * es añadirlo, y eso es de Ajustes.
 */
function seArreglaAnadiendo(motivo: string): boolean {
  return /no está conectado/.test(motivo);
}

const esConectado = (c: { prueba?: { ok: boolean } }): boolean => c.prueba?.ok === true;

/**
 * Tras «Conectar», lo que falló por falta de credencial se vuelve a pedir SOLO, UNA vez: la
 * persona pulsó Conectar para seguir, no para tener que pulsar además «Reintentar».
 *
 * El disparo es una prueba NUEVA y buena de ese conector (el mensaje `conectores` que el servidor
 * reemite al volver del navegador: `autorizar` acaba en `probar`), no «está conectado»: un token
 * que caducó deja la prueba VIEJA en verde —`llamar` falla sin tocar las pruebas—, así que lo que
 * cuenta es que llegue otra con otra hora. La foto que ya había al montar no es un disparo.
 *
 * «Una vez» es por ERROR: el store crea un objeto nuevo en cada fallo (`store.ts`) y `repetidos`
 * recuerda cuáles ya no hay que repetir — los repetidos aquí y los que ya se volvieron a pedir por
 * otro lado (`pedir` los apunta: la fila de Jira que se vuelve a montar al conectarse ya pide sus
 * sitios, y repetirlo aquí serían dos).
 */
function useReintentoTrasConectar({
  gestor,
  conectores,
  conectado,
  ultimas,
  repetidos,
  conectorDelFallo,
  pedir,
}: {
  gestor?: EstadoDelCliente["gestor"];
  conectores?: EstadoDelCliente["conectores"];
  conectado: boolean;
  ultimas: Partial<Record<PeticionAlGestor["accion"], PeticionAlGestor>>;
  repetidos: WeakSet<object>;
  conectorDelFallo: (accion: AccionConConector) => string | undefined;
  pedir: (peticion: PeticionAlGestor) => void;
}): void {
  /** La hora de la última prueba BUENA de cada conector, en la foto anterior. */
  const pruebasAntes = useRef<Map<string, number> | undefined>(undefined);
  const lista = conectores?.conectores;
  useEffect(() => {
    if (lista === undefined) return;
    const ahora = new Map(lista.flatMap((c) => (c.prueba?.ok === true ? [[c.id, c.prueba.cuando] as const] : [])));
    const antes = pruebasAntes.current;
    pruebasAntes.current = ahora;
    if (antes === undefined || !conectado) return;
    const recienConectados = [...ahora].filter(([id, cuando]) => antes.get(id) !== cuando).map(([id]) => id);
    if (recienConectados.length === 0) return;
    for (const accion of REPETIBLES_AL_CONECTAR) {
      const error = gestor?.errores?.[accion];
      const peticion = ultimas[accion];
      if (error === undefined || peticion === undefined || repetidos.has(error) || !seArreglaConectando(error.motivo)) continue;
      const conector = conectorDelFallo(accion);
      if (conector === undefined || !recienConectados.includes(conector)) continue;
      pedir(peticion);
    }
    // Solo la lista de conectores: es su CAMBIO lo que dispara, no el de los errores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista]);
}

/**
 * Un fallo del gestor, y al lado «Conectar <nombre>» si lo que falta es la credencial de un
 * conector AÑADIDO (sin añadir, `autorizar` no haría nada: eso se hace en Ajustes). Es el MISMO
 * `autorizar` del botón de Ajustes.
 */
function AvisoDelGestor({
  error,
  conector,
  conectores,
  conectado,
  alAutorizar,
  alAbrirAjustes,
  sinDuplicarLaFila = false,
  children,
}: {
  error?: { motivo: string };
  /** «Añádelo en Ajustes», para el conector que no está añadido. */
  alAbrirAjustes: () => void;
  /** En la pestaña Conectores: el conector sin conectar ya tiene su «Conectar» en su fila. */
  sinDuplicarLaFila?: boolean;
  conector?: string;
  conectores?: EstadoDelCliente["conectores"];
  conectado: boolean;
  alAutorizar: (id: string) => void;
  /** Otras acciones junto al aviso (el «Reintentar» de Tareas). */
  children?: ReactNode;
}) {
  if (error === undefined) return null;
  const anadido = conector === undefined ? undefined : conectores?.conectores.find((c) => c.id === conector);
  // En Conectores, la fila de un conector sin conectar ya lleva su «Conectar»: no se repite aquí.
  const conConectar = anadido !== undefined && seArreglaConectando(error.motivo) && !(sinDuplicarLaFila && !esConectado(anadido));
  const nombre = conector === undefined ? "" : (conectores?.catalogo.find((f) => f.id === conector)?.nombre ?? conector);
  return (
    <div className={estilos.avisoConAcciones}>
      <Aviso error={error} />
      {conConectar ? (
        <button type="button" className={estilos.accion} onClick={() => alAutorizar(anadido.id)} disabled={!conectado || anadido.autorizando === true}>
          {anadido.autorizando === true ? "Esperando al navegador…" : `Conectar ${nombre}`}
        </button>
      ) : null}
      {seArreglaAnadiendo(error.motivo) ? (
        <button type="button" className={estilos.accion} onClick={alAbrirAjustes}>
          Añádelo en Ajustes
        </button>
      ) : null}
      {children}
    </div>
  );
}

/**
 * Los estados que por omisión se DESMARCAN en el filtro: en el flujo de IXCODE (PROBLEMA → EN
 * CURSO → PROBAR → PREPROD → TERMINADO) son «esperando prueba», no trabajo que empezar. Es el
 * punto de partida, no una regla: la persona marca o desmarca cualquiera.
 */
const ESPERANDO_PRUEBA = /PROBAR|PREPROD|REVIS|TEST/i;
const marcadoPorOmision = (estado: string): boolean => !ESPERANDO_PRUEBA.test(estado);
/** El orden de las pastillas: lo que está por hacer antes que lo que está en curso. */
const ORDEN_DE_CATEGORIA: Record<CategoriaDeTarea, number> = { "por-hacer": 0, "en-curso": 1, terminada: 2 };

/** Los estados distintos de la lista, con cuántas hay de cada uno, por categoría y luego por aparición. */
function estadosDe(lista: readonly TareaDelGestor[]): { estado: string; cuantas: number }[] {
  const vistos = new Map<string, { estado: string; categoria: CategoriaDeTarea; cuantas: number; orden: number }>();
  for (const t of lista) {
    const e = vistos.get(t.estado);
    if (e === undefined) vistos.set(t.estado, { estado: t.estado, categoria: t.categoria, cuantas: 1, orden: vistos.size });
    else e.cuantas++;
  }
  return [...vistos.values()]
    .sort((a, b) => ORDEN_DE_CATEGORIA[a.categoria] - ORDEN_DE_CATEGORIA[b.categoria] || a.orden - b.orden)
    .map(({ estado, cuantas }) => ({ estado, cuantas }));
}

/**
 * Cuántas pendientes pide el servidor de una vez (`agent/conectores/gestorJira.ts
 * #PENDIENTES_POR_CONSULTA`, redeclarada: el cliente no importa del host; un test compara las
 * dos). Con la lista LLENA, las cuentas de las pastillas son de un trozo, y se dice.
 */
export const PENDIENTES_POR_CONSULTA = 100;

/** La consulta de pendientes: lo que se busca y si son solo las mías. Lo vacío no viaja. */
type ConsultaDePendientes = { texto?: string; mias?: boolean };
/** La consulta sin `mias` cuando el gestor vinculado no admite «Asignadas a mí». */
const sinMiasSiNoSeAdmite = (c: ConsultaDePendientes, admite: boolean): ConsultaDePendientes =>
  admite || c.mias !== true ? c : { ...(c.texto === undefined ? {} : { texto: c.texto }) };
const peticionDePendientes = (c: ConsultaDePendientes): PeticionAlGestor => ({
  accion: "pendientes",
  ...(c.texto === undefined || c.texto === "" ? {} : { texto: c.texto }),
  ...(c.mias === true ? { mias: true } : {}),
});

function TareasDelGestor({
  gestor,
  conectores,
  conectado,
  ocupado,
  turnoEnVuelo,
  alGestor,
  alAutorizar,
  alEmpezar,
  alIrAConectores,
  alAbrirAjustes,
}: {
  gestor?: EstadoDelCliente["gestor"];
  conectores?: EstadoDelCliente["conectores"];
  alAbrirAjustes: () => void;
  conectado: boolean;
  /** Hay una tarjeta «Empezar» abierta (para CUALQUIER tarea): mientras tanto no se abre otra. */
  ocupado: boolean;
  turnoEnVuelo: boolean;
  alGestor: (peticion: PeticionAlGestor) => void;
  alAutorizar: (id: string) => void;
  alEmpezar: (clave: string) => void;
  alIrAConectores: () => void;
}) {
  const vinculo = gestor?.estado?.vinculo;
  const [texto, setTexto] = useState("");
  /** «Asignadas a mí» PEDIDO: el conmutador. Lo que se pinta de la lista lo dice la respuesta (`pendientes.mias`). */
  const [mias, setMias] = useState(false);
  /** Lo que la persona marcó o desmarcó a mano, por estado. Lo demás, `marcadoPorOmision`. */
  const [decididos, setDecididos] = useState<Record<string, boolean>>({});
  /** La clave de la fila desplegada (una a la vez), o `undefined`. */
  const [desplegada, setDesplegada] = useState<string | undefined>(undefined);
  /** El error de `ficha` que ya había al desplegar: uno VIEJO no se pinta en la fila nueva (el R6 de la tarjeta). */
  const errorDeFichaAlDesplegar = useRef<{ motivo: string; clave?: string } | undefined>(undefined);
  /** La última consulta MANDADA: «Actualizar» y «Reintentar» repiten esa, no la última que contestó. */
  const ultimaConsulta = useRef<ConsultaDePendientes>({});
  const consultar = (c: ConsultaDePendientes): void => {
    ultimaConsulta.current = c;
    alGestor(peticionDePendientes(c));
  };
  const clave = vinculo === undefined ? undefined : `${vinculo.conector}|${vinculo.sitio}|${vinculo.proyecto}`;
  /**
   * «Asignadas a mí» solo se OFRECE si el servidor dice que el gestor lo admite (IXCODE-15:
   * se decide al vincular; una base de Notion sin propiedad de persona no). Ausente o `false`
   * = no se pinta el conmutador, y una consulta nunca lleva `mias`.
   */
  const admiteMias = gestor?.estado?.admiteMias === true;
  /** El último vínculo que se vio: al VOLVER el mismo (cable caído y vuelto) se conserva lo de la pestaña; con OTRO, no. */
  const vinculoAnterior = useRef<string | undefined>(undefined);
  // Al abrir la pestaña (y si cambia el vínculo, o vuelve el cable), se pregunta: una lista de
  // antes puede no ser ya la de ahora, y la hora de la foto dice de cuándo es la que se ve.
  // Y la fila que siguiera desplegada vuelve a pedir su descripción: al caerse el cable el store
  // tiró `gestor` entero, y sin esto se quedaría en «Consultando la descripción…» para siempre.
  // Con un vínculo DISTINTO (se vinculó otro gestor u otro proyecto) lo de la pestaña era del
  // de antes: la búsqueda, «mías», los estados desmarcados y la fila desplegada se olvidan —un
  // `mias` heredado de Jira contra una base de Notion sin persona haría fallar la consulta—.
  useEffect(() => {
    if (clave === undefined) return;
    const otro = vinculoAnterior.current !== undefined && vinculoAnterior.current !== clave;
    vinculoAnterior.current = clave;
    if (otro) {
      ultimaConsulta.current = {};
      setTexto("");
      setMias(false);
      setDecididos({});
      setDesplegada(undefined);
    }
    alGestor(peticionDePendientes(sinMiasSiNoSeAdmite(ultimaConsulta.current, admiteMias)));
    if (!otro && desplegada !== undefined) {
      errorDeFichaAlDesplegar.current = undefined;
      alGestor({ accion: "ficha", clave: desplegada });
    }
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
  const nombreDelGestor = nombreDelConector(conectores, vinculo.conector);
  const buscar = (): void => consultar({ texto: texto.trim(), mias: admiteMias && mias });
  const repetir = (): void => consultar(sinMiasSiNoSeAdmite(ultimaConsulta.current, admiteMias));
  const conmutarMias = (): void => {
    setMias(!mias);
    consultar({ texto: texto.trim(), mias: !mias });
  };
  const alternar = (claveDeTarea: string): void => {
    if (desplegada === claveDeTarea) {
      setDesplegada(undefined);
      return;
    }
    setDesplegada(claveDeTarea);
    errorDeFichaAlDesplegar.current = errores.ficha;
    alGestor({ accion: "ficha", clave: claveDeTarea });
  };
  const estados = pendientes === undefined ? [] : estadosDe(pendientes.lista);
  const marcado = (estado: string): boolean => decididos[estado] ?? marcadoPorOmision(estado);
  const todasMarcadas = estados.every((e) => marcado(e.estado));
  const visibles = pendientes === undefined ? [] : pendientes.lista.filter((t) => marcado(t.estado));
  const fichaDeLaDesplegada = gestor.ficha !== undefined && gestor.ficha.clave === desplegada ? gestor.ficha : undefined;
  // Solo bajo SU fila: el fallo lleva la clave de la tarea que se pidió.
  const errorDeFicha =
    errores.ficha !== undefined && errores.ficha !== errorDeFichaAlDesplegar.current && errores.ficha.clave === desplegada
      ? errores.ficha
      : undefined;

  return (
    <div className={estilos.seccion}>
      <div className={estilos.encabezado}>
        <h2 className={estilos.titulo}>{`Pendientes de ${proyectoALaVista(vinculo) ?? "la base vinculada"}`}</h2>
        {pendientes === undefined ? null : (
          <span className={estilos.consultado}>
            <span className={estilos.nota}>{`Consultado a las ${horaDe(pendientes.cuando)}`}</span>
            <button
              type="button"
              className={estilos.icono}
              aria-label="Actualizar"
              title="Volver a consultar las pendientes"
              onClick={repetir}
              disabled={!conectado}
            >
              <IconoDeActualizar />
            </button>
          </span>
        )}
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
        {admiteMias ? (
          <button
            type="button"
            className={estilos.pastilla}
            aria-pressed={mias}
            title="Solo las asignadas a la cuenta con la que está conectado el gestor"
            onClick={conmutarMias}
            disabled={!conectado}
          >
            Asignadas a mí
          </button>
        ) : null}
      </form>
      <AvisoDelGestor
        {...(errores.pendientes === undefined ? {} : { error: errores.pendientes })}
        conector={vinculo.conector}
        {...(conectores === undefined ? {} : { conectores })}
        conectado={conectado}
        alAutorizar={alAutorizar}
        alAbrirAjustes={alAbrirAjustes}
      >
        <button type="button" className={estilos.accion} onClick={repetir} disabled={!conectado}>
          Reintentar
        </button>
      </AvisoDelGestor>
      {pendientes === undefined ? (
        errores.pendientes === undefined ? <p className={estilos.aviso}>Consultando las tareas…</p> : null
      ) : pendientes.lista.length === 0 ? (
        <p className={estilos.aviso}>
          {pendientes.texto === undefined ? "No hay tareas pendientes." : `No hay tareas pendientes que coincidan con «${pendientes.texto}».`}
        </p>
      ) : (
        <>
          <div className={estilos.filtros} role="group" aria-label="Filtrar por estado">
            <button
              type="button"
              className={estilos.pastilla}
              aria-pressed={todasMarcadas}
              // Con todas puestas no hay nada que poner: pulsarla no cambia nada (lo mismo que
              // la mitad ya puesta del conmutador de modo).
              onClick={() => {
                if (!todasMarcadas) setDecididos(Object.fromEntries(estados.map((e) => [e.estado, true])));
              }}
            >
              Todas <span className={estilos.cuenta}>{pendientes.lista.length}</span>
            </button>
            {estados.map((e) => (
              <button
                key={e.estado}
                type="button"
                className={estilos.pastilla}
                aria-pressed={marcado(e.estado)}
                onClick={() => setDecididos({ ...decididos, [e.estado]: !marcado(e.estado) })}
              >
                {e.estado} <span className={estilos.cuenta}>{e.cuantas}</span>
              </button>
            ))}
          </div>
          {pendientes.lista.length >= PENDIENTES_POR_CONSULTA ? (
            <p className={estilos.aviso}>{`Se muestran las ${PENDIENTES_POR_CONSULTA} más recientes; afina con la búsqueda.`}</p>
          ) : null}
          {visibles.length === 0 ? (
            <p className={estilos.aviso}>Ninguna pendiente con estos filtros.</p>
          ) : (
            <ul className={estilos.lista}>
              {visibles.map((t) => (
                <FilaDeTarea
                  key={t.clave}
                  tarea={t}
                  {...(nombreDelGestor === undefined ? {} : { nombreDelGestor })}
                  conAsignado={pendientes.mias !== true}
                  desplegada={desplegada === t.clave}
                  {...(desplegada === t.clave && fichaDeLaDesplegada !== undefined ? { descripcion: fichaDeLaDesplegada.descripcion } : {})}
                  {...(desplegada === t.clave && errorDeFicha !== undefined ? { errorDeFicha } : {})}
                  conectado={conectado}
                  ocupado={ocupado}
                  turnoEnVuelo={turnoEnVuelo}
                  alAlternar={() => alternar(t.clave)}
                  alEmpezar={() => alEmpezar(t.clave)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Lo que dentro de una fila ya es un control por sí mismo: pulsarlo no despliega la fila. */
const CONTROLES = "a, button, input, select, textarea, summary";

/**
 * Una tarea, en DOS líneas: clave (con su ↗ al gestor) y título arriba, estado y asignado
 * debajo; la acción a la derecha, sin caerse de línea por un título largo (el título se corta
 * con «…» y entero va en su `title`). La acción EXISTE siempre y se llega con el teclado: lo que
 * cambia con el ratón encima o el foco dentro es su opacidad, no si está (`.accionesDeTarea`).
 *
 * Pulsar la fila despliega su descripción (la ficha del gestor, de solo LECTURA). El control de
 * teclado es el título, un botón con `aria-expanded`; el clic en el resto de la fila hace lo
 * mismo por comodidad, salvo sobre otro control —el ↗ abre el gestor, «Nueva sesión» abre la
 * tarjeta—. Desplegar NUNCA empieza nada. Lo plegado se DESMONTA.
 */
function FilaDeTarea({
  tarea: t,
  nombreDelGestor,
  conAsignado,
  desplegada,
  descripcion,
  errorDeFicha,
  conectado,
  ocupado,
  turnoEnVuelo,
  alAlternar,
  alEmpezar,
}: {
  tarea: TareaDelGestor;
  /** «Jira», «Notion»: del catálogo. Ausente = no consta, y el enlace dice «en el gestor». */
  nombreDelGestor?: string;
  /** Con «Asignadas a mí» contestado, el asignado es siempre quien mira: no se repite en cada fila. */
  conAsignado: boolean;
  desplegada: boolean;
  /** La descripción, cuando ya llegó. Ausente con la fila desplegada = consultando. */
  descripcion?: string;
  errorDeFicha?: { motivo: string };
  conectado: boolean;
  /** Hay una tarjeta «Empezar» abierta, de CUALQUIER tarea: no se lanza una segunda. */
  ocupado: boolean;
  turnoEnVuelo: boolean;
  alAlternar: () => void;
  alEmpezar: () => void;
}) {
  const idDeFicha = `ficha-${t.clave}`;
  // Lo que se ENSEÑA de la clave: la de Notion es un UUID, y su etiqueta el id corto. Lo que
  // viaja por el cable (ficha, transiciones, empezar) sigue siendo la clave entera.
  const aLaVista = t.etiqueta ?? etiquetaDeClave(t.clave) ?? t.clave;
  const abrirEn = `Abrir ${aLaVista} en ${nombreDelGestor ?? "el gestor"}`;
  const alPulsarFila = (e: MouseEvent<HTMLDivElement>): void => {
    if (e.target instanceof Element && e.target.closest(CONTROLES) !== null) return;
    alAlternar();
  };
  return (
    <li className={estilos.tarea} data-categoria={t.categoria}>
      {/* El clic en la fila es un atajo de ratón: el control de teclado es el botón del título. */}
      <div className={estilos.filaDeTarea} onClick={alPulsarFila}>
        <div className={estilos.datos}>
          <div className={estilos.lineaPrincipal}>
            <span className={estilos.clave}>{aLaVista}</span>
            {t.url === undefined ? null : (
              <a
                className={estilos.abrirFuera}
                href={t.url}
                target="_blank"
                rel="noreferrer"
                aria-label={abrirEn}
                title={abrirEn}
              >
                <IconoDeEnlaceExterno />
              </a>
            )}
            <button
              type="button"
              className={estilos.desplegar}
              aria-expanded={desplegada}
              {...(desplegada ? { "aria-controls": idDeFicha } : {})}
              title={t.titulo}
              onClick={alAlternar}
            >
              {t.titulo}
            </button>
          </div>
          <div className={estilos.lineaSecundaria}>
            <span className={estilos.estado}>{t.estado}</span>
            {!conAsignado || t.asignado === undefined ? null : <span className={estilos.nota}>{t.asignado}</span>}
          </div>
        </div>
        <div className={estilos.accionesDeTarea}>
          <button
            type="button"
            className={estilos.accion}
            onClick={alEmpezar}
            disabled={!conectado || ocupado || turnoEnVuelo}
            {...(turnoEnVuelo ? { title: TITULO_CON_TURNO } : {})}
            aria-label={`Nueva sesión con ${aLaVista}`}
          >
            Nueva sesión con esta tarea
          </button>
        </div>
      </div>
      {desplegada ? (
        <div className={estilos.ficha} id={idDeFicha}>
          {descripcion !== undefined ? (
            descripcion.trim() === "" ? (
              <p className={estilos.aviso}>Esta tarea no tiene descripción.</p>
            ) : (
              <MarkdownText text={protegerDolares(descripcion)} codeLabels={ETIQUETAS_DE_CODIGO} />
            )
          ) : errorDeFicha !== undefined ? (
            <p className={estilos.error} role="alert">{`No se pudo leer la descripción: ${errorDeFicha.motivo}`}</p>
          ) : (
            <p className={estilos.aviso}>Consultando la descripción…</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Los conectores que pueden ser GESTOR de tareas (IXCODE-15: Jira y Notion). Van en su PROPIA
 * sección, sin casilla «usar en este proyecto»: vincular ya lo marca como usado, y desvincular lo
 * desmarca (el servidor, `atenderGestor`). Una casilla al lado solo podía mentir o quedarse gris.
 * **Un proyecto tiene UN gestor**: vincular el otro SUSTITUYE al que hubiera (lo hace el
 * servidor), y la fila del otro lo DICE antes de pulsar.
 */
const GESTORES_DE_TAREAS: readonly string[] = ["jira", "notion"];

/** El `sitio` de Notion: una cuenta OAuth es un solo espacio (`core/gestorDeTareas.ts#SITIO_DE_NOTION`, redeclarado). */
export const SITIO_DE_NOTION = "notion";

type FilaDeConectorAnadido = NonNullable<EstadoDelCliente["conectores"]>["conectores"][number];

function ConectoresDelProyecto({
  gestor,
  conectores,
  conectado,
  alGestor,
  alAutorizar,
  alProbar,
  conectorDelFallo,
  alAbrirAjustes,
}: {
  gestor?: EstadoDelCliente["gestor"];
  conectores?: EstadoDelCliente["conectores"];
  conectado: boolean;
  alGestor: (peticion: PeticionAlGestor) => void;
  alAutorizar: (id: string) => void;
  alProbar: (id: string) => void;
  conectorDelFallo: (accion: AccionConConector) => string | undefined;
  alAbrirAjustes: () => void;
}) {
  useProbarLoSinProbar(conectores?.conectores, conectado, alProbar);
  const errores = gestor?.errores ?? {};
  const estado = gestor?.estado;
  const avisos = (
    <>
      {(["estado", "usarConector", "desvincular"] as const).map((a) => (
        <Aviso key={a} {...(errores[a] === undefined ? {} : { error: errores[a] })} />
      ))}
      {/* Los que hablan con UN conector: con la credencial caída, «Conectar» al lado. El
          conector es el de la ÚLTIMA petición de esa acción (Jira o Notion), no uno fijo. Los de
          `buscarProyectos`/`describir` no van aquí: los pinta la fila de Notion, y solo los de la
          búsqueda y la base que tiene DELANTE (`VinculoDeNotion`). */}
      {(["vincular", "sitios", "proyectos"] as const).map((a) => {
        const conector = conectorDelFallo(a);
        return (
          <AvisoDelGestor
            key={a}
            {...(errores[a] === undefined ? {} : { error: errores[a] })}
            {...(conector === undefined ? {} : { conector })}
            {...(conectores === undefined ? {} : { conectores })}
            conectado={conectado}
            alAutorizar={alAutorizar}
            alAbrirAjustes={alAbrirAjustes}
            sinDuplicarLaFila
          />
        );
      })}
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
  const nombreDe = (id: string): string => nombreDelConector(conectores, id) ?? id;
  // «Conectado» es lo MISMO que dice su pastilla en Ajustes: la última prueba contestó. Cada
  // conector AÑADIDO tiene su fila: el que no está conectado, con su «Conectar» (el mismo
  // `autorizar` de Ajustes); el conectado, con su casilla o, si es un gestor de tareas, con su
  // vínculo. El vinculado se pinta con su vínculo aunque no esté probado —ni añadido—: la prueba
  // es una foto EN MEMORIA que un reinicio borra, y sin esto el vínculo y su «Desvincular»
  // desaparecían de esta pestaña mientras Tareas seguía trabajando contra él.
  const vinculo = estado.vinculo;
  const anadido = (id: string): FilaDeConectorAnadido | undefined => conectores.conectores.find((c) => c.id === id);
  // El vinculado, arriba; luego el otro gestor, si está añadido.
  const gestores = [...GESTORES_DE_TAREAS]
    .sort((a, b) => Number(b === vinculo?.conector) - Number(a === vinculo?.conector))
    .filter((id) => id === vinculo?.conector || anadido(id) !== undefined);
  const paraElChat = conectores.conectores.filter((c) => !GESTORES_DE_TAREAS.includes(c.id));

  return (
    <div className={estilos.seccion}>
      {avisos}
      <section className={estilos.seccion} aria-label="Gestor de tareas">
        <h2 className={estilos.titulo}>Gestor de tareas</h2>
        <p className={estilos.aviso}>
          De dónde salen las tareas de la pestaña Tareas. El proyecto tiene uno solo: vincular otro sustituye al que haya.
        </p>
        {gestores.length === 0 ? (
          <p className={estilos.aviso}>Ni Jira ni Notion están añadidos. Se añaden en Ajustes.</p>
        ) : (
          <ul className={estilos.lista}>
            {gestores.map((id) => (
              <FilaDeGestor
                key={id}
                id={id}
                nombre={nombreDe(id)}
                {...(anadido(id) === undefined ? {} : { fila: anadido(id)! })}
                gestor={gestor}
                conectores={conectores}
                {...(vinculo === undefined ? {} : { vinculo, nombreDelVinculado: nombreDe(vinculo.conector) })}
                conectado={conectado}
                alGestor={alGestor}
                alAutorizar={alAutorizar}
                alProbar={alProbar}
                alAbrirAjustes={alAbrirAjustes}
              />
            ))}
          </ul>
        )}
      </section>
      <section className={estilos.seccion} aria-label="Conectores para el chat">
        <h2 className={estilos.titulo}>Conectores para el chat</h2>
        <p className={estilos.aviso}>Los que usará el agente en el chat de este proyecto.</p>
        {paraElChat.length === 0 ? (
          <p className={estilos.aviso}>No hay otros conectores añadidos.</p>
        ) : (
          <ul className={estilos.lista}>
            {paraElChat.map((c) => {
              const usado = estado.conectores.includes(c.id);
              const conCasilla = esConectado(c) || usado;
              return (
                <li key={c.id} className={estilos.conector}>
                  <div className={estilos.filaDeConector}>
                    <IconoDeConector id={c.id} nombre={nombreDe(c.id)} />
                    <span className={estilos.tituloDeConector}>{nombreDe(c.id)}</span>
                    <span className={estilos.alFinal}>
                      <BotonDeConectar fila={c} nombre={nombreDe(c.id)} conectado={conectado} alAutorizar={alAutorizar} alProbar={alProbar} />
                      {conCasilla ? (
                        <label className={estilos.casilla}>
                          <input
                            type="checkbox"
                            checked={usado}
                            disabled={!conectado}
                            onChange={(e) => alGestor({ accion: "usarConector", conector: c.id, usar: e.target.checked })}
                          />
                          Usar en este proyecto
                        </label>
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {conectores.conectores.length === 0 ? (
        <div className={estilos.encabezado}>
          <p className={estilos.aviso}>No hay ningún conector añadido. Se añaden en Ajustes.</p>
          <button type="button" className={estilos.accion} onClick={alAbrirAjustes}>
            Abrir Ajustes
          </button>
        </div>
      ) : (
        <div>
          <button type="button" className={estilos.accion} onClick={alAbrirAjustes}>
            Añadir otro conector en Ajustes
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Lo que se ofrece a un conector añadido que NO está conectado, y el orden en que se decide:
 * esperando al navegador; «Conectar» (el MISMO `autorizar` de Ajustes) solo si FALTA la credencial
 * —en el disco, o porque la última prueba lo dijo—; «Comprobando…» si tiene credencial y aún no
 * hay prueba (tras un reinicio: `useProbarLoSinProbar` ya la pidió); y «Probar de nuevo» si la
 * prueba falló por otra cosa. Antes salía «Conectar» en cuanto no había prueba buena, y tras
 * reiniciar el servidor pedía volver a autorizar lo que ya lo estaba. Conectado, no se pinta.
 */
function BotonDeConectar({
  fila,
  nombre,
  conectado,
  alAutorizar,
  alProbar,
}: {
  fila: FilaDeConectorAnadido;
  nombre: string;
  conectado: boolean;
  alAutorizar: (id: string) => void;
  alProbar: (id: string) => void;
}) {
  if (esConectado(fila)) return null;
  const faltaCredencial = fila.estado === "falta-autorizar" || (fila.prueba !== undefined && !fila.prueba.ok && seArreglaConectando(fila.prueba.motivo));
  if (fila.autorizando === true || faltaCredencial) {
    return (
      <button
        type="button"
        className={estilos.accion}
        onClick={() => alAutorizar(fila.id)}
        disabled={!conectado || fila.autorizando === true}
        aria-label={`Conectar ${nombre}`}
      >
        {fila.autorizando === true ? "Esperando al navegador…" : "Conectar"}
      </button>
    );
  }
  if (fila.prueba === undefined) return <span className={estilos.nota}>Comprobando…</span>;
  return (
    <button
      type="button"
      className={estilos.accion}
      onClick={() => alProbar(fila.id)}
      disabled={!conectado}
      title={fila.prueba.ok ? undefined : fila.prueba.motivo}
      aria-label={`Probar ${nombre} de nuevo`}
    >
      Probar de nuevo
    </button>
  );
}

/**
 * Pide UNA prueba por conector que tiene credencial y no tiene prueba: la foto es de memoria y un
 * reinicio la borra, así que sin esto la pestaña decía «no conectado» de todo lo que sí lo está, y
 * el formulario de vincular (que necesita la prueba buena) no salía. Una vez por conector y por
 * montaje: si la prueba falla, se enseña su fallo con «Probar de nuevo», no se reintenta sola.
 */
function useProbarLoSinProbar(
  filas: readonly FilaDeConectorAnadido[] | undefined,
  conectado: boolean,
  alProbar: (id: string) => void,
): void {
  const pedidos = useRef(new Set<string>());
  useEffect(() => {
    if (!conectado || filas === undefined) return;
    for (const f of filas) {
      if (f.prueba !== undefined || f.estado === "falta-autorizar" || f.autorizando === true || pedidos.current.has(f.id)) continue;
      pedidos.current.add(f.id);
      alProbar(f.id);
    }
  }, [filas, conectado, alProbar]);
}

/**
 * Una fila de la sección «Gestor de tareas»: el vinculado enseña su vínculo con «Desvincular»;
 * el otro, conectado, su formulario de vincular. Con OTRO gestor ya vinculado el formulario no se
 * monta de entrada —montado, el de Jira ya pediría sus sitios—: primero un «Vincular X en su
 * lugar», y dentro, el aviso de que SUSTITUIRÁ al de ahora.
 */
function FilaDeGestor({
  id,
  nombre,
  fila,
  gestor,
  conectores,
  vinculo,
  nombreDelVinculado,
  conectado,
  alGestor,
  alAutorizar,
  alProbar,
  alAbrirAjustes,
}: {
  id: string;
  nombre: string;
  /** Ausente = no está añadido (solo se pinta así el VINCULADO: su vínculo sigue en el proyecto). */
  fila?: FilaDeConectorAnadido;
  gestor?: EstadoDelCliente["gestor"];
  conectores: EstadoDelCliente["conectores"];
  alAbrirAjustes: () => void;
  vinculo?: VinculoDelCable;
  nombreDelVinculado?: string;
  conectado: boolean;
  alGestor: (peticion: PeticionAlGestor) => void;
  alAutorizar: (id: string) => void;
  alProbar: (id: string) => void;
}) {
  const [cambiando, setCambiando] = useState(false);
  const vinculado = vinculo?.conector === id;
  const otroVinculado = vinculo !== undefined && !vinculado;
  const conectadoElConector = fila !== undefined && esConectado(fila);
  // Si el vínculo cambia (se vinculó este, o se desvinculó el otro), el desplegable vuelve a su sitio.
  const claveDelVinculo = vinculo === undefined ? undefined : `${vinculo.conector}|${vinculo.proyecto}`;
  useEffect(() => setCambiando(false), [claveDelVinculo]);

  const sustituye =
    otroVinculado && vinculo !== undefined
      ? `Vincular ${nombre} sustituirá a ${nombreDelVinculado ?? vinculo.conector}${
          proyectoALaVista(vinculo) === undefined ? "" : ` (${proyectoALaVista(vinculo)})`
        } como gestor de este proyecto.`
      : undefined;
  const formulario =
    id === "jira" ? (
      <VinculoDeJira gestor={gestor} conectado={conectado} alGestor={alGestor} {...(sustituye === undefined ? {} : { sustituye })} />
    ) : id === "notion" ? (
      <VinculoDeNotion
        gestor={gestor}
        conectores={conectores}
        nombre={nombre}
        conectado={conectado}
        alGestor={alGestor}
        alAutorizar={alAutorizar}
        alAbrirAjustes={alAbrirAjustes}
        {...(sustituye === undefined ? {} : { sustituye })}
      />
    ) : null;

  return (
    <li className={estilos.conector}>
      <div className={estilos.filaDeConector}>
        <IconoDeConector id={id} nombre={nombre} />
        <span className={estilos.tituloDeConector}>{nombre}</span>
        <span className={estilos.alFinal}>
          {fila === undefined ? null : <BotonDeConectar fila={fila} nombre={nombre} conectado={conectado} alAutorizar={alAutorizar} alProbar={alProbar} />}
        </span>
      </div>
      {vinculado && vinculo !== undefined ? (
        <VinculoActual vinculo={vinculo} nombre={nombre} conectado={conectado} alGestor={alGestor} />
      ) : !conectadoElConector ? null : otroVinculado && !cambiando ? (
        // Sin conexión no se le puede preguntar nada: solo se enseña el vínculo que ya hay.
        <div className={estilos.vinculo}>
          <button type="button" className={estilos.accion} onClick={() => setCambiando(true)} disabled={!conectado}>
            {`Vincular ${nombre} en su lugar…`}
          </button>
        </div>
      ) : (
        formulario
      )}
    </li>
  );
}

/** El vínculo que hay, con «Desvincular». Jira dice su clave y su sitio; Notion, el nombre de la base si se sabe. */
function VinculoActual({
  vinculo,
  nombre,
  conectado,
  alGestor,
}: {
  vinculo: VinculoDelCable;
  nombre: string;
  conectado: boolean;
  alGestor: (peticion: PeticionAlGestor) => void;
}) {
  const proyecto = proyectoALaVista(vinculo);
  const frase = vinculo.proyecto.startsWith("collection://")
    ? proyecto === undefined
      ? `Vinculado a una base de ${nombre}.`
      : `Vinculado a la base «${proyecto}» de ${nombre}.`
    : `Vinculado a ${vinculo.proyecto} en ${vinculo.nombreDelSitio ?? vinculo.sitio}.`;
  return (
    <div className={estilos.vinculo}>
      <span>{frase}</span>
      <button type="button" className={estilos.peligro} onClick={() => alGestor({ accion: "desvincular" })} disabled={!conectado}>
        Desvincular
      </button>
    </div>
  );
}

/** El aviso de que vincular este gestor sustituye al vinculado (IXCODE-15: un gestor por proyecto). */
function AvisoDeSustitucion({ texto }: { texto?: string }) {
  return texto === undefined ? null : <p className={estilos.aviso}>{texto}</p>;
}

function VinculoDeJira({
  gestor,
  conectado,
  alGestor,
  sustituye,
}: {
  gestor?: EstadoDelCliente["gestor"];
  conectado: boolean;
  alGestor: (peticion: PeticionAlGestor) => void;
  /** Con otro gestor vinculado: la frase de que este lo SUSTITUIRÁ. */
  sustituye?: string;
}) {
  const sitios = gestor?.sitios?.conector === "jira" ? gestor.sitios.lista : undefined;
  const [sitio, setSitio] = useState<string>("");
  const [proyecto, setProyecto] = useState<string>("");
  // Con un sitio solo no hay nada que elegir: se elige solo.
  const sitioElegido = sitio !== "" ? sitio : sitios?.length === 1 ? sitios[0]!.id : "";
  const proyectos = gestor?.proyectos?.sitio === sitioElegido && sitioElegido !== "" ? gestor.proyectos.lista : undefined;

  // Se monta SOLO sin vínculo a Jira (el vinculado enseña `VinculoActual`): montarse es preguntar.
  useEffect(() => {
    alGestor({ accion: "sitios", conector: "jira" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setProyecto("");
    if (sitioElegido !== "") alGestor({ accion: "proyectos", conector: "jira", sitio: sitioElegido });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitioElegido]);

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
      <AvisoDeSustitucion {...(sustituye === undefined ? {} : { texto: sustituye })} />
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

/**
 * «Lo que se ha entendido» del esquema de una base de Notion, en UNA línea: la propiedad de
 * estado con sus opciones, la del título y la de persona. Sin persona no hay «Asignadas a mí», y
 * se dice aquí, antes de vincular.
 */
export function lineaDelEsquema(e: EsquemaDelProyecto): string {
  const opciones = e.estado.opciones.map((o) => o.nombre).join(" · ");
  const partes = [
    `Estado: ${e.estado.propiedad}${opciones === "" ? "" : ` (${opciones})`}`,
    `Título: ${e.titulo}`,
    ...(e.asignado === undefined ? [] : [`Asignado: ${e.asignado}`]),
  ];
  return partes.join(" · ");
}

/**
 * Vincular una base de Notion (IXCODE-15): BUSCAR por nombre → elegir una de la lista →
 * DESCRIBIR su esquema (qué propiedad es el estado, el título, el asignado, o por qué no vale) →
 * «Vincular». Nada se pide al montar: buscar necesita texto.
 *
 * Dos trampas del cable: la lista trae el id de la BASE, que es lo que se manda a `describir`;
 * a `vincular` va `esquema.proyecto` (el `collection://…` ya resuelto), nunca ese id. Y una
 * respuesta de búsqueda o de descripción que no es la de lo que hay AHORA delante (otro texto,
 * otra base) no se pinta: el servidor contesta cada una por su lado.
 */
function VinculoDeNotion({
  gestor,
  conectores,
  nombre,
  conectado,
  alGestor,
  alAutorizar,
  alAbrirAjustes,
  sustituye,
}: {
  gestor?: EstadoDelCliente["gestor"];
  conectores: EstadoDelCliente["conectores"];
  alAutorizar: (id: string) => void;
  alAbrirAjustes: () => void;
  nombre: string;
  conectado: boolean;
  alGestor: (peticion: PeticionAlGestor) => void;
  sustituye?: string;
}) {
  const [texto, setTexto] = useState("");
  /** El texto de la ÚLTIMA búsqueda mandada. Ausente = todavía no se buscó. */
  const [buscado, setBuscado] = useState<string | undefined>(undefined);
  /** El id de la base elegida (el `proyecto` de la búsqueda). */
  const [elegida, setElegida] = useState<string | undefined>(undefined);
  const busqueda =
    buscado !== undefined && gestor?.busqueda?.conector === "notion" && gestor.busqueda.texto === buscado ? gestor.busqueda : undefined;
  const descripcion =
    elegida !== undefined && gestor?.descripcion?.conector === "notion" && gestor.descripcion.pedido === elegida
      ? gestor.descripcion
      : undefined;
  const errores = gestor?.errores ?? {};
  // Los fallos, con la MISMA regla que las respuestas: el de otra búsqueda o de otra base (uno
  // viejo, o que llegó tarde) no se pinta delante de la que hay ahora.
  const errorDeBusqueda =
    buscado !== undefined && errores.buscarProyectos !== undefined && errores.buscarProyectos.texto === buscado ? errores.buscarProyectos : undefined;
  const errorDeDescripcion =
    elegida !== undefined && errores.describir !== undefined && errores.describir.pedido === elegida ? errores.describir : undefined;
  const avisoDe = (error: { motivo: string }) => (
    <AvisoDelGestor
      error={error}
      conector="notion"
      {...(conectores === undefined ? {} : { conectores })}
      conectado={conectado}
      alAutorizar={alAutorizar}
      alAbrirAjustes={alAbrirAjustes}
      sinDuplicarLaFila
    />
  );

  const buscar = (): void => {
    const t = texto.trim();
    if (t === "") return;
    setBuscado(t);
    setElegida(undefined);
    alGestor({ accion: "buscarProyectos", conector: "notion", texto: t });
  };
  const elegir = (proyecto: string): void => {
    setElegida(proyecto);
    alGestor({ accion: "describir", conector: "notion", proyecto });
  };

  return (
    <div className={estilos.vinculoNotion}>
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
          aria-label={`Buscar una base de ${nombre}`}
          placeholder={`Nombre de la base de ${nombre}`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button type="submit" className={estilos.accion} disabled={!conectado || texto.trim() === ""}>
          Buscar
        </button>
      </form>
      {buscado === undefined ? null : busqueda === undefined ? (
        errorDeBusqueda === undefined ? <p className={estilos.aviso}>Buscando…</p> : avisoDe(errorDeBusqueda)
      ) : busqueda.lista.length === 0 ? (
        <p className={estilos.aviso}>{`Ninguna base de ${nombre} coincide con «${busqueda.texto}».`}</p>
      ) : (
        <ul className={estilos.lista} aria-label={`Bases de ${nombre}`}>
          {busqueda.lista.map((b) => (
            <li key={b.proyecto}>
              <button
                type="button"
                className={estilos.base}
                aria-pressed={elegida === b.proyecto}
                onClick={() => elegir(b.proyecto)}
                disabled={!conectado}
              >
                <span>{b.nombre}</span>
                {b.ruta === undefined ? null : <span className={estilos.nota}>{b.ruta}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {elegida === undefined ? null : descripcion === undefined ? (
        errorDeDescripcion === undefined ? <p className={estilos.aviso}>Leyendo el esquema de la base…</p> : avisoDe(errorDeDescripcion)
      ) : "motivo" in descripcion ? (
        <p className={estilos.error}>{`Esta base no sirve como gestor de tareas: ${descripcion.motivo}`}</p>
      ) : (
        <div className={estilos.esquema}>
          <p className={estilos.lineaDelEsquema}>{lineaDelEsquema(descripcion.esquema)}</p>
          {descripcion.esquema.asignado === undefined ? (
            <p className={estilos.aviso}>Sin propiedad de persona: no se podrá filtrar por «Asignadas a mí».</p>
          ) : null}
          {descripcion.esquema.fuentes === undefined || descripcion.esquema.fuentes <= 1 ? null : (
            <p className={estilos.aviso}>{`La base tiene ${descripcion.esquema.fuentes} orígenes de datos; se usa el primero.`}</p>
          )}
          <AvisoDeSustitucion {...(sustituye === undefined ? {} : { texto: sustituye })} />
          <div>
            <button
              type="button"
              className={estilos.principal}
              disabled={!conectado}
              onClick={() =>
                alGestor({ accion: "vincular", conector: "notion", sitio: SITIO_DE_NOTION, proyecto: descripcion.esquema.proyecto })
              }
            >
              Vincular
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
