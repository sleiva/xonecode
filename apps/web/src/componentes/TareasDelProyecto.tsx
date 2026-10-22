import { useEffect, useRef, useState } from "react";
import { ListaDePantallas } from "./DisenoDelProyecto.js";
import { RejillaDeAdjuntos, useAdjuntosDeBorrador, type AdjuntosDelBorrador } from "./adjuntosDeBorrador.js";
export type { AdjuntosDelBorrador } from "./adjuntosDeBorrador.js";
import ventana from "./NuevaTarea.module.css";

/** El diálogo de «Reencolar» solo se cierra con sus botones: lo escrito y lo adjuntado no se pierden por un clic fuera. */
const SIN_CERRAR = (): void => {};
import { arbolDeFinalizadas, type NodoDeTarea } from "../arbolDeTareas.js";

/** El árbol aplanado en el orden en que se lee —cada tarea y, debajo, sus continuaciones—, con su nivel. */
function enOrdenDeArbol(nodos: readonly NodoDeTarea[], profundidad = 0): { tarea: TareaDelCable; profundidad: number }[] {
  return nodos.flatMap((n) => [{ tarea: n.tarea, profundidad }, ...enOrdenDeArbol(n.hijas, profundidad + 1)]);
}
import { puedeArrancarYa, type Acto, type TareaDelCable } from "../tipos.js";
import { AccionesDeTarea, type CambiosDeAdjuntos } from "./AccionesDeTarea.js";
import { EntregaDeTarea } from "./EntregaDeTarea.js";
import { MirarTarea } from "./MirarTarea.js";
import { QuienEjecutaTareas } from "./QuienEjecutaTareas.js";
import { selloDeFecha } from "../selloDeFecha.js";
import { textoCortoDelGastoDeTarea, textoDelGastoDeTarea } from "../gastoDelProyecto.js";
import { Button, MarkdownText, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import { protegerDolares } from "../protegerDolares.js";
import { ETIQUETAS_DE_CODIGO } from "../etiquetasDeCodigo.js";
import estilos from "./TareasDelProyecto.module.css";

const ETIQUETA_DE_ESTADO: Record<TareaDelCable["estado"], string> = {
  nuevo: "Nuevo",
  "en-proceso": "En proceso",
  // La MISMA etiqueta que `Kanban.tsx` usa para esta columna, y por el mismo motivo que
  // documenta ahí: el identificador del enum no se toca, pero lo que la interfaz DICE es
  // «esperando feedback» desde §0 del diseño, y dos etiquetas para el mismo estado en dos
  // pestañas de la misma app sería la misma mentira que un color repetido a mano.
  // «En pausa» y no «Esperando feedback»: lo que importa es que NO avanza hasta que contestes.
  "requiere-atencion": "En pausa · esperando tu respuesta",
  terminada: "Terminada",
};

/**
 * La lista de tareas en background del proyecto ABIERTO, como pestaña.
 *
 * **Task 15: esta pestaña ya NO depende de si hay alguna tarea, y eso MATIZA la regla de
 * `Pestanas.tsx#hayArtefactos` en vez de contradecirla.** Un artefacto es el REGISTRO de
 * algo que el agente ya dibujó: una pestaña de registro vacía es el control sin dato
 * detrás, y por eso solo existe con al menos uno. Una tarea es lo contrario — es donde se
 * ACTÚA —, y antes de esta tarea la única puerta para crear la primera de un proyecto
 * abierto era volver al escritorio (la marca «xonecode»): la pestaña que enseñaría cómo
 * hacerlo desaparecía justo cuando alguien la buscaba. El criterio que queda, para quien
 * lea la regla de Artefactos y quiera «arreglar» esto: **una pestaña de REGISTRO existe si
 * hay registro; una pestaña de ACCIÓN existe siempre, y su estado vacío dice cómo se
 * empieza.** No es un hueco: es la respuesta a «¿y cómo se crea una?».
 *
 * **Ausente y vacío no son lo mismo, y esta vista es la que tiene que sostener esa
 * distinción hasta el final.** `tareas` ausente significa que la cola todavía no ha llegado
 * del servidor (`estado.tareas` en `store.ts`) — no se puede afirmar «no hay ninguna» sin
 * haber medido, la misma regla que `Revision#via`. `tareas={[]}` significa que sí llegó y
 * este proyecto no tiene ninguna: solo ENTONCES se pinta el estado vacío.
 *
 * No pide nada al servidor: la cola entera viaja en `{clase:"tareas"}` y ya está en el
 * store (`App.tsx` filtra por `proyecto`), así que aquí no hay ningún `useEffect` de red.
 *
 * **Las cuatro acciones son de `AccionesDeTarea.tsx`**, la misma pieza que monta
 * `Kanban.tsx`: antes esta lista ofrecía reintentar/terminar/descartar y no feedback, así
 * que una tarea aparcada solo se podía atender desde el kanban del escritorio (Task 13).
 * `conectado` se reenvía tal cual: sin cable, esos controles se apagan y lo dicen — la
 * misma regla que ya siguen Ficheros, Revisión y Artefactos.
 */
export function TareasDelProyecto({
  tareas,
  alNuevaTarea,
  corriendoAqui,
  ejecutaOtroProceso,
  alReintentar,
  alDescartar,
  alTerminar,
  alEnviarFeedback,
  alContinuar,
  alArrancarAhora,
  alEditarEncargo,
  alRegenerarEncargo,
  alParar,
  alOrdenar,
  sesionAbierta,
  trabajandoEnElChat,
  alMirar,
  alIrAlChat,
  alDejarDeMirar,
  mirando,
  mirada,
  alLeerFinalizada,
  alPedirUltimaRespuesta,
  alReencolar,
  adjuntosDelBorrador,
  revertir,
  pestanaInicial,
  alMirarGestor,
  conectado,
}: {
  /** Ausente = la cola todavía no ha llegado del servidor. `[]` = llegó, y este proyecto no
   *  tiene ninguna. Los dos casos NO son el mismo texto. */
  tareas?: readonly TareaDelCable[];
  /**
   * Crear una tarea PARA ESTE proyecto, sin salir de esta pestaña ni volver al escritorio.
   * Ausente = no se ofrece — hoy solo pasa si `App` no puede resolver el id del proyecto
   * activo (`alta.proyectoActivo` se DEDUCE comparando raíces y puede no cuadrar). No lleva
   * parámetro: a diferencia del botón del escritorio, que elige entre varias tarjetas, aquí
   * ya se está DENTRO del proyecto — pedirlo sería preguntar algo que ya se sabe.
   */
  alNuevaTarea?: () => void;
  /** `nuevo → en-proceso` se salta desde aquí: reintentar es lo que devuelve una tarea
   *  aparcada a la cola. Ausente = no se ofrece. */
  alReintentar?: (id: string) => void;
  /** Borra la tarea, con su carpeta de adjuntos. Irreversible, y por eso `AccionesDeTarea`
   *  lo confirma en una VENTANA —una fila de 34 px no es sitio para eso, el mismo argumento
   *  que el borrado de una sesión—. Ausente = no se ofrece. */
  alDescartar?: (id: string) => void;
  /** «La persona da el trabajo por bueno»: `requiere-atencion → terminada` sin pasar por
   *  un reintento. Ausente = no se ofrece. */
  alTerminar?: (id: string) => void;
  /** «Se edita la tarea y se agrega el feedback del usuario»: la devuelve al lazo, en su
   *  mismo hilo. Ausente = no se ofrece — la aparcada cae a la pista de siempre. */
  alEnviarFeedback?: (id: string, texto: string) => void;
  /** Seguir una aparcada sin escribir nada, y «Arrancar ahora» la primera de su cadena. Ver `AccionesDeTarea`. */
  alContinuar?: (id: string) => Promise<string | undefined>;
  alArrancarAhora?: (id: string) => Promise<string | undefined>;
  /** Cambiar el encargo de una que nunca ha arrancado (IXCODE-52): devuelve el motivo si el servidor se negó. */
  alEditarEncargo?: (
    id: string,
    encargo: string,
    peticion: string,
    pantallas?: { name: string; titulo: string }[] | null,
    adjuntos?: CambiosDeAdjuntos
  ) => Promise<string | undefined>;
  /** Volver a preparar el encargo desde la petición, sin guardarlo (IXCODE-53). */
  alRegenerarEncargo?: (id: string, peticion: string) => Promise<{ encargo: string } | { motivo: string }>;
  /** Parar una en marcha sin borrarla (IXCODE-50): devuelve el motivo si el servidor se negó. */
  alParar?: (id: string) => Promise<string | undefined>;
  /** La cola en otro orden: TODAS las que esperan, en el nuevo. Devuelve el motivo si el servidor se negó. Ausente = no se ordena. */
  alOrdenar?: (ids: string[]) => Promise<string | undefined>;
  /**
   * La conversación abierta en el chat y si tiene un turno en marcha. Una aparcada cuya conversación es ESA la estás
   * atendiendo tú: la fila lo dice, porque su estado en la cola («Esperando feedback») no cambia mientras trabajas en el
   * chat, y sin decirlo parecía que la tarea seguía parada (medido: «pero la tarea sigue en otro estado»).
   */
  sesionAbierta?: string;
  trabajandoEnElChat?: boolean;
  /** Si el cable está vivo: apaga en `AccionesDeTarea` (y el botón «Nueva tarea» de aquí)
   *  lo que manda algo al servidor, y lo dice. Ausente = se asume conectado. */
  conectado?: boolean;
  /**
   * Si es ESTE proceso el que ejecuta las tareas (`corriendoAqui` del cable). `false`
   * significa que el cerrojo lo tiene otro, y entonces hay que decir algo que no es obvio:
   * una tarea creada desde aquí **no dispara nada allí** —`revisar()` sale en `!miCerrojo`,
   * y no hay temporizador ni IPC—, así que se queda en «Nuevo» hasta que ese proceso mire
   * la cola por su cuenta. Se dice en esta pestaña porque es donde vive «Nueva tarea», o
   * sea donde se crea la tarea que se va a quedar quieta: el aviso sirve ANTES de crearla.
   *
   * **Ausente = no se sabe** —la cola todavía no ha llegado— y entonces no se afirma nada,
   * la regla de siempre.
   */
  corriendoAqui?: boolean;
  /**
   * Y si las ejecuta OTRO proceso, que no es lo mismo que que no las ejecute nadie: el
   * primero manda a esperar y el segundo dice que no va a pasar nada. Ausente = no se sabe.
   * Ver `QuienEjecutaTareas`.
   */
  ejecutaOtroProceso?: boolean;
  /**
   * Ver, y dejar de ver, EN VIVO lo que hace el turno de una tarea, desplegando su fila
   * (Task 17). La MISMA pieza (`MirarTarea.tsx`) que monta `Kanban.tsx`: las condiciones de
   * quién puede mirar y cuándo viven ahí, no aquí. Ausentes = no se ofrece.
   */
  alMirar?: (id: string) => void;
  /** Ir al chat de la tarea (en marcha o esperando respuesta) en vez del detalle en la fila. Ausente = el detalle. */
  alIrAlChat?: (tarea: TareaDelCable) => void;
  alDejarDeMirar?: (id: string) => void;
  /** Cuál se está mirando ahora, si alguna. */
  mirando?: string;
  /** El transcript que el servidor está mandando de la tarea mirada. */
  mirada?: { tarea: string; actos: readonly Acto[] };
  /**
   * Abrir la conversación de una tarea FINALIZADA para leerla, con sus artefactos (`LecturaDeSesion`, motivo
   * `finalizada`). Nunca `alIrAlChat`: ese abre para ESCRIBIR todo lo que no está en marcha. Ausente = no se ofrece.
   */
  alLeerFinalizada?: (tarea: TareaDelCable) => void;
  /** Lo último que contestó el agente en la conversación de una finalizada: su resumen de lo que hizo. Se pide al
   *  desplegar (nunca viaja con la cola). `undefined` = no consta; un texto que empieza por «No se pudo» es un fallo. */
  alPedirUltimaRespuesta?: (tarea: TareaDelCable) => Promise<{ texto?: string; error?: string }>;
  /** Reencolar una finalizada para acabar lo que no hizo (ver `Reencolar`). Devuelve el motivo si el servidor se negó. */
  alReencolar?: (id: string, texto: string, borrador?: string) => Promise<string | undefined>;
  /** Las capturas que se le añaden al reencolar (pegadas o elegidas). Ausente = el formulario no ofrece adjuntar. */
  adjuntosDelBorrador?: AdjuntosDelBorrador;
  /** Revertir lo que hizo una finalizada (solo la última). Ausente = no se ofrece. */
  revertir?: RevertirTarea;
  /** Dónde se monta: «Finalizadas» al volver de leer una (la lista se desmonta mientras se lee). Solo cuenta al montar. */
  pestanaInicial?: "curso" | "finalizadas";
  /** «Mirar ahora» el gestor (la puerta 2): solo con el disparo encendido. Devuelve qué pasó, en una frase. */
  alMirarGestor?: () => Promise<string>;
}) {
  const [mirandoGestor, setMirandoGestor] = useState(false);
  const [loQueVio, setLoQueVio] = useState<string | undefined>(undefined);
  const apagado = conectado === false;
  /**
   * Dos pestañas, y SIEMPRE las dos (como las de Agentes): «En curso» es donde se ACTÚA —nuevas, en marcha y en
   * pausa, con sus acciones de siempre— y «Finalizadas» es el HISTÓRICO, de solo lectura: sin acciones, la más
   * reciente arriba, y lo que hizo cada una. Antes iban mezcladas en una lista, y las terminadas, que solo crecen,
   * acababan tapando las que esperaban algo de ti. La vacía lo dice con palabras; la cuenta solo se pinta con algo.
   */
  const [pestana, setPestana] = useState<"curso" | "finalizadas">(pestanaInicial ?? "curso");
  const enCurso = tareas?.filter((t) => t.estado !== "terminada");
  /**
   * En TRES grupos (petición suya, 21-10-2026, su lienzo): la que TRABAJA arriba, fija; las que esperan a una persona; y
   * la COLA, en el orden en que arrancarán (el servidor manda la lista ya en ese orden), que se reordena arrastrando o con
   * las flechas. La que trabaja no entra en el orden: no se mueve.
   */
  const trabajando = enCurso?.filter((t) => t.estado === "en-proceso") ?? [];
  const cola = enCurso?.filter((t) => t.estado === "nuevo") ?? [];
  const resto = enCurso?.filter((t) => t.estado !== "en-proceso" && t.estado !== "nuevo") ?? [];
  const [arrastrada, setArrastrada] = useState<string | undefined>(undefined);
  const [encima, setEncima] = useState<string | undefined>(undefined);
  const [negativaDeOrden, setNegativaDeOrden] = useState<string | undefined>(undefined);
  const ordenar = (ids: string[]): void => {
    if (alOrdenar === undefined) return;
    setNegativaDeOrden(undefined);
    void alOrdenar(ids).then(setNegativaDeOrden, () => setNegativaDeOrden("el envío falló"));
  };
  const mover = (desde: number, hasta: number): void => {
    if (desde === hasta || hasta < 0 || hasta >= cola.length) return;
    const ids = cola.map((t) => t.id);
    const [id] = ids.splice(desde, 1);
    ids.splice(hasta, 0, id!);
    ordenar(ids);
  };
  const ordenable = alOrdenar !== undefined && !apagado && cola.length > 1;
  const enLaCola = (t: TareaDelCable, i: number): EnLaCola => ({
    posicion: i + 1,
    ...(ordenable
      ? {
          arrastre: {
            draggable: true as const,
            onDragStart: (e: React.DragEvent) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", t.id);
              setArrastrada(t.id);
            },
            onDragOver: (e: React.DragEvent) => {
              if (arrastrada === undefined) return;
              e.preventDefault();
              if (encima !== t.id) setEncima(t.id);
            },
            onDrop: (e: React.DragEvent) => {
              e.preventDefault();
              const desde = cola.findIndex((x) => x.id === arrastrada);
              setArrastrada(undefined);
              setEncima(undefined);
              if (desde >= 0) mover(desde, i);
            },
            onDragEnd: () => {
              setArrastrada(undefined);
              setEncima(undefined);
            },
          },
          arrastrando: arrastrada === t.id,
          encima: encima === t.id && arrastrada !== t.id,
          ...(i > 0 ? { subir: () => mover(i, i - 1) } : {}),
          ...(i < cola.length - 1 ? { bajar: () => mover(i, i + 1) } : {}),
        }
      : {}),
  });
  const finalizadas = tareas
    ?.filter((t) => t.estado === "terminada")
    // La más reciente arriba: por `acabada`, y sin ella (de antes del sello) al final.
    .sort((a, b) => (b.acabada ?? "").localeCompare(a.acabada ?? ""));
  return (
    <section className={estilos.lista} aria-label="Tareas del proyecto">
      <div className={estilos.encabezado}>
        <span className={estilos.rotulo}>Tareas en background</span>
        <div className={estilos.botones}>
          {alMirarGestor === undefined ? null : (
            <button
              type="button"
              className={estilos.nueva}
              disabled={apagado || mirandoGestor}
              title="Mira ya los tickets asignados a ti en el gestor, sin esperar a la próxima vuelta"
              onClick={() => {
                setMirandoGestor(true);
                void alMirarGestor()
                  .catch(() => "el envío falló")
                  .then((texto) => {
                    setMirandoGestor(false);
                    setLoQueVio(texto);
                  });
              }}
            >
              {mirandoGestor ? "Mirando…" : "Mirar ahora"}
            </button>
          )}
          {alNuevaTarea === undefined ? null : (
            <button type="button" className={estilos.nueva} disabled={apagado} onClick={alNuevaTarea}>
              Nueva tarea
            </button>
          )}
        </div>
      </div>
      {loQueVio === undefined ? null : <p className={estilos.aviso} role="status">{loQueVio}</p>}
      {/*
        El motivo del apagado tiene que ser texto VISIBLE, no un `title`: un `title` no se ve
        en táctil, la mayoría de navegadores no lo enseña de forma fiable con el ratón, y un
        lector de pantalla puede no anunciarlo — la misma familia de fallo que un aviso que
        nadie lee o un control en `display:none` sin tabular. Mismo texto y patrón que
        `AccionesDeTarea.module.css#.avisoConexion` usa por fila; aquí es de la pestaña
        entera, así que vive junto a la cabecera y no dentro de ninguna fila.
      */}
      {apagado && alNuevaTarea !== undefined ? (
        <p className={estilos.avisoConexion}>Sin conexión: no se puede crear una tarea hasta reconectar.</p>
      ) : null}
      {/* Quién las ejecuta si no es este proceso: la MISMA pieza que el kanban. Aquí
          importa más que allí, porque aquí vive «Nueva tarea» — el aviso llega ANTES de
          crear la que se va a quedar parada. */}
      {corriendoAqui === undefined ? null : (
        <QuienEjecutaTareas
          corriendoAqui={corriendoAqui}
          {...(ejecutaOtroProceso === undefined ? {} : { ejecutaOtroProceso })}
          donde="esta lista"
        />
      )}
      {tareas === undefined || enCurso === undefined || finalizadas === undefined ? (
        <p className={estilos.aviso}>Consultando la cola de tareas de este proyecto…</p>
      ) : tareas.length === 0 ? (
        <p className={estilos.aviso}>
          Este proyecto todavía no tiene ninguna tarea en background. Pulsa «Nueva tarea» para
          darle al agente un encargo que trabaje solo, sin que tengas que quedarte mirando: se
          aplica sin pedir aprobación, porque la autorización es crearla.
        </p>
      ) : (
        <>
        <div className={estilos.pestanas} role="tablist" aria-label="Tareas por estado">
          {(
            [
              ["curso", "En curso", enCurso.length],
              ["finalizadas", "Finalizadas", finalizadas.length],
            ] as const
          ).map(([clave, rotulo, cuantas]) => (
            <button
              key={clave}
              type="button"
              role="tab"
              className={estilos.pestana}
              aria-selected={pestana === clave}
              data-actual={pestana === clave ? "" : undefined}
              onClick={() => setPestana(clave)}
            >
              {rotulo}
              {cuantas > 0 ? <span className={estilos.cuenta}>{cuantas}</span> : null}
            </button>
          ))}
        </div>
        {pestana === "finalizadas" ? (
          finalizadas.length === 0 ? (
            <p className={estilos.aviso}>Todavía no ha terminado ninguna tarea de este proyecto. Aquí quedan las que se entregan, con lo que hizo cada una.</p>
          ) : (
            <ul className={estilos.filasFinalizadas}>
              {/* Como ÁRBOL (`arbolDeTareas.ts`): cada continuación colgando de la tarea de la que sigue. */}
              {enOrdenDeArbol(arbolDeFinalizadas(finalizadas)).map(({ tarea: t, profundidad }) => (
                <FilaFinalizada
                  key={t.id}
                  tarea={t}
                  profundidad={profundidad}
                  {...(alLeerFinalizada === undefined ? {} : { alLeer: alLeerFinalizada })}
                  {...(alPedirUltimaRespuesta === undefined ? {} : { alPedirUltimaRespuesta })}
                  {...(alDescartar === undefined ? {} : { alBorrar: alDescartar })}
                  {...(alReencolar === undefined ? {} : { alReencolar })}
                  {...(adjuntosDelBorrador === undefined ? {} : { adjuntosDelBorrador })}
                  {...(revertir === undefined ? {} : { revertir })}
                />
              ))}
            </ul>
          )
        ) : enCurso.length === 0 ? (
          <p className={estilos.aviso}>No hay ninguna tarea en curso. Las terminadas están en «Finalizadas».</p>
        ) : (
        <>
          {([
            ["trabajando", "Trabajando ahora", trabajando],
            ["atencion", "Esperan a que las mires", resto],
            ["cola", "En cola", cola],
          ] as const).map(([clave, rotulo, grupo]) =>
            grupo.length === 0 ? null : (
              <div key={clave} className={estilos.grupo}>
                <div className={estilos.cabeceraDeGrupo}>
                  <span className={estilos.rotuloDeGrupo}>{clave === "cola" ? `${rotulo} · ${grupo.length}` : rotulo}</span>
                  {clave === "cola" && ordenable ? (
                    <span className={estilos.pistaDeGrupo}>Arrastra para cambiar el orden; cada una arranca cuando le toca. La que trabaja no se mueve.</span>
                  ) : null}
                </div>
                {clave === "cola" && negativaDeOrden !== undefined ? (
                  <p className={estilos.motivo} role="alert">{`No se ha cambiado el orden: ${negativaDeOrden}`}</p>
                ) : null}
                <ul className={estilos.filas} aria-label={rotulo}>
                  {grupo.map((t, i) => (
                    <Fila
                      key={t.id}
                      tarea={t}
                      {...(t.tras === undefined ? {} : { anterior: tareas.find((x) => x.id === t.tras) })}
                      conectado={conectado}
                      corriendoAqui={corriendoAqui}
                      {...(alReintentar === undefined ? {} : { alReintentar })}
                      {...(alDescartar === undefined ? {} : { alDescartar })}
                      {...(alTerminar === undefined ? {} : { alTerminar })}
                      {...(alEnviarFeedback === undefined ? {} : { alEnviarFeedback })}
                      {...(alContinuar === undefined ? {} : { alContinuar })}
                      {...(alArrancarAhora === undefined ? {} : { alArrancarAhora })}
                      {...(alEditarEncargo === undefined ? {} : { alEditarEncargo })}
                      {...(alRegenerarEncargo === undefined ? {} : { alRegenerarEncargo })}
                      {...(alParar === undefined ? {} : { alParar })}
                      puedeArrancar={puedeArrancarYa(t, tareas)}
                      {...(clave === "cola" ? { enCola: enLaCola(t, i) } : {})}
                      {...(adjuntosDelBorrador === undefined ? {} : { adjuntosDelBorrador })}
                      {...(t.sesion !== undefined && t.sesion === sesionAbierta ? { enTuChat: trabajandoEnElChat === true ? "trabajando" : "abierta" } : {})}
                      {...(alMirar === undefined ? {} : { alMirar })}
                      {...(alIrAlChat === undefined ? {} : { alIrAlChat })}
                      {...(alDejarDeMirar === undefined ? {} : { alDejarDeMirar })}
                      {...(mirando === undefined ? {} : { mirando })}
                      {...(mirada === undefined ? {} : { mirada })}
                    />
                  ))}
                </ul>
              </div>
            )
          )}
        </>
        )}
        </>
      )}
    </section>
  );
}

/**
 * Una tarea del HISTÓRICO, en UNA línea: punto, título, cuándo empezó y acabó (lo que TARDÓ no sale de ahí: entre las dos
 * cuenta también la pausa esperando respuesta; va aparte, de `trabajo`) y cómo se entregó (la MISMA `EntregaDeTarea` de la otra pestaña), y a la
 * derecha lo que se puede MIRAR —qué hizo, el encargo, su conversación con los artefactos—. Sin acciones: ya se
 * entregó. Lo desplegado va debajo, a todo el ancho, y uno a la vez; lo plegado se DESMONTA.
 */
/**
 * Cómo acabó una finalizada, para su punto de color y sus cuentas: con algo CRÍTICO en su cierre, dada por buena A MANO,
 * con OBSERVACIONES (el cierre las trae, o el juez no la dio por buena), o LIMPIA. Pura.
 */
export type ResultadoDeFinalizada = "critico" | "mano" | "observaciones" | "limpia";

export function resultadoDeFinalizada(t: Pick<TareaDelCable, "cierre" | "terminadaAMano" | "veredicto">): ResultadoDeFinalizada {
  if ((t.cierre?.criticos.length ?? 0) > 0) return "critico";
  if (t.terminadaAMano === true) return "mano";
  if ((t.cierre?.observaciones.length ?? 0) > 0 || (t.veredicto !== undefined && t.veredicto.veredicto !== "verde")) return "observaciones";
  return "limpia";
}

const NOMBRE_DEL_RESULTADO: Record<ResultadoDeFinalizada, string> = {
  critico: "Con críticos",
  mano: "Cerrada a mano",
  observaciones: "Con observaciones",
  limpia: "Limpia",
};

/** La frase de UNA línea de una finalizada: lo primero que la explica. */
function lineaDeFinalizada(t: TareaDelCable): string {
  if (t.terminadaAMano === true) return "La dio por buena una persona.";
  // Hasta el primer «.» o «;», no los dos puntos: los críticos empiezan por «pantalla: …» y la fila se quedaba en «pantalla:».
  const primera = (texto: string): string => texto.split(/(?<=[.;])\s/)[0] ?? texto;
  if (t.cierre !== undefined && t.cierre.criticos.length > 0) return primera(t.cierre.criticos[0]!);
  if (t.veredicto !== undefined) return primera(t.veredicto.resumen);
  return "";
}

/**
 * Una FINALIZADA: UNA línea fina —punto de color por cómo acabó, título, ticket, una frase, las cuentas y las fechas— que
 * se DESPLIEGA entera al pulsarla: lo `## CRITICAL` arriba, las observaciones, qué hizo, el encargo y la conversación.
 * Diseño suyo (lienzo «Tareas finalizadas — rediseño»): las filas con el veredicto entero a la vista eran un muro de texto.
 */
function FilaFinalizada({
  tarea: t,
  alLeer,
  alPedirUltimaRespuesta,
  alBorrar,
  alReencolar,
  adjuntosDelBorrador,
  profundidad = 0,
  revertir,
}: {
  tarea: TareaDelCable;
  /** Revertir lo que hizo (solo la ÚLTIMA que cambió el proyecto): se PREGUNTA al desplegar, y el servidor decide. */
  revertir?: RevertirTarea;
  /** Cuántas tareas tiene por encima en el árbol: 0 es una raíz; una continuación, 1 o más. */
  profundidad?: number;
  adjuntosDelBorrador?: AdjuntosDelBorrador;
  alLeer?: (tarea: TareaDelCable) => void;
  alPedirUltimaRespuesta?: (tarea: TareaDelCable) => Promise<{ texto?: string; error?: string }>;
  /** Quitarla del histórico (la acción `descartar`: a su ticket, ya cerrado, no le hace nada). Pide confirmación antes. */
  alBorrar?: (id: string) => void;
  /** Encolar otra en su hilo para acabar lo que no hizo; devuelve el motivo si el servidor se negó. Solo se ofrece si
   *  la fila trae `reencolable` (lo decide el servidor: sin ticket). */
  alReencolar?: (id: string, texto: string, borrador?: string) => Promise<string | undefined>;
}) {
  const [abierta, setAbierta] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [verEncargo, setVerEncargo] = useState(false);
  /** Si se puede revertir: ausente = sin preguntar; `pidiendo` mientras llega. Se pregunta UNA vez, al desplegarla. */
  const [revertible, setRevertible] = useState<
    { ficheros: readonly string[]; conversacion?: true } | { motivo: string } | "pidiendo" | undefined
  >(undefined);
  const [confirmarReversion, setConfirmarReversion] = useState(false);
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [motivoDeReversion, setMotivoDeReversion] = useState<string | undefined>(undefined);
  /** «Reencolar lo pendiente»: el texto abierto debajo de la barra, o ya encolada (entonces el botón se va). */
  const [reencolar, setReencolar] = useState<"cerrado" | "abierto" | "hecho">("cerrado");
  /** Lo que contestó: ausente = sin pedir, `pidiendo` mientras llega. Se pide UNA vez, al desplegarla. */
  const [respuesta, setRespuesta] = useState<{ texto?: string; error?: string } | "pidiendo" | undefined>(undefined);
  const empezo = t.empezada === undefined ? undefined : selloDeFecha(t.empezada);
  const acabo = t.acabada === undefined ? undefined : selloDeFecha(t.acabada);
  const fechas = empezo !== undefined && acabo !== undefined ? `${empezo} → ${acabo}` : (acabo ?? empezo ?? "");
  // Sin conversación no hay nada que releer: la sesión solo sobrevive si quedó algo abrible.
  const conConversacion = t.sesion !== undefined;
  const resultado = resultadoDeFinalizada(t);
  const criticos = t.cierre?.criticos ?? [];
  // Sin cierre (una tarea de antes de que existiera), lo que dijo el juez hace de observaciones.
  const observaciones =
    t.cierre?.observaciones ??
    (t.veredicto !== undefined && t.veredicto.veredicto !== "verde" ? [t.veredicto.resumen, ...(t.veredicto.hallazgos ?? [])] : []);
  const salvedad = t.veredicto?.salvedad;
  const alternar = (): void => {
    const abrir = !abierta;
    setAbierta(abrir);
    if (abrir && conConversacion && revertible === undefined && revertir !== undefined) {
      setRevertible("pidiendo");
      void revertir.preguntar(t.id).then(setRevertible, () => setRevertible({ motivo: "el envío falló" }));
    }
    if (abrir && conConversacion && respuesta === undefined && alPedirUltimaRespuesta !== undefined) {
      setRespuesta("pidiendo");
      void alPedirUltimaRespuesta(t).then(setRespuesta, () => setRespuesta({ error: "el envío falló" }));
    }
  };
  return (
    <li
      className={estilos.finalizada}
      data-estado={t.estado}
      data-resultado={resultado}
      data-abierta={abierta ? "" : undefined}
      // La sangría la pone el CSS por nivel (hasta tres): más hondo se quedaría sin sitio para el título.
      data-profundidad={profundidad === 0 ? undefined : Math.min(profundidad, 3)}
    >
      <button type="button" className={estilos.lineaFinalizada} aria-expanded={abierta} onClick={alternar}>
        {profundidad === 0 ? null : (
          <span className={estilos.rama} aria-label="Continuación de la tarea de arriba">
            ↳
          </span>
        )}
        <span className={estilos.puntoDeResultado} title={NOMBRE_DEL_RESULTADO[resultado]} aria-label={NOMBRE_DEL_RESULTADO[resultado]} />
        <span className={estilos.tituloFinalizada}>{t.titulo}</span>
        {t.ticket === undefined ? null : <span className={estilos.ticket}>{t.ticket.clave}</span>}
        <span className={estilos.lineaResumen}>{lineaDeFinalizada(t)}</span>
        <span className={estilos.cuentas}>
          {criticos.length > 0 ? <span className={estilos.cuentaCritica}>{`${criticos.length} crítico${criticos.length === 1 ? "" : "s"}`}</span> : null}
          {observaciones.length > 0 ? <span className={estilos.cuentaObservaciones}>{`${observaciones.length} obs.`}</span> : null}
          {resultado === "limpia" ? <span className={estilos.cuentaLimpia}>limpia</span> : null}
          {resultado === "mano" ? <span className={estilos.cuentaMano}>a mano</span> : null}
          {t.gasto === undefined ? null : <span className={estilos.cuentaGasto}>{textoCortoDelGastoDeTarea(t.gasto)}</span>}
          {/* Lo que tardó ELLA, trabajando (IXCODE-73): sin las esperas a una persona, y la madre sin sumar sus continuaciones. */}
          {t.trabajo === undefined ? null : (
            <span className={estilos.cuentaTiempo} title="Tiempo trabajando, sin las esperas a una persona">{`tardó ${tiempoQueLleva(t.trabajo)}`}</span>
          )}
        </span>
        <span className={estilos.fechasFinalizada}>{fechas}</span>
        <span className={estilos.flecha} aria-hidden="true">
          ›
        </span>
      </button>
      <AvisoDelTicket tarea={t} />
      {abierta ? (
        <div className={estilos.desplegado}>
          {/* Las acciones ARRIBA, todas con el mismo botón (y Eliminar en el rojo de peligro): lo que abren sale justo
              debajo, antes de lo que se lee. */}
          <div className={estilos.accionesFinalizada} role="toolbar" aria-label="Acciones de la tarea">
            {!conConversacion ? (
              <span className={estilos.sinConversacion}>Sin conversación guardada</span>
            ) : alLeer === undefined ? null : (
              <button type="button" className={estilos.accion} onClick={() => alLeer(t)}>
                Conversación y artefactos
              </button>
            )}
            <button type="button" className={estilos.accion} aria-expanded={verEncargo} onClick={() => setVerEncargo(!verEncargo)}>
              Encargo
            </button>
            {t.reencolable === undefined || alReencolar === undefined || reencolar === "hecho" ? null : (
              <button
                type="button"
                className={estilos.accion}
                aria-expanded={reencolar === "abierto"}
                onClick={() => setReencolar(reencolar === "abierto" ? "cerrado" : "abierto")}
              >
                Reencolar lo pendiente
              </button>
            )}
            <ClaveDelTicket tarea={t} />
            {revertir === undefined || typeof revertible !== "object" || !("ficheros" in revertible) ? null : (
              <button
                type="button"
                className={estilos.revertir}
                aria-expanded={confirmarReversion}
                onClick={() => {
                  setMotivoDeReversion(undefined);
                  setConfirmarReversion(!confirmarReversion);
                }}
              >
                Revertir sus cambios
              </button>
            )}
            {alBorrar === undefined ? null : confirmarBorrado ? (
              <span className={estilos.confirmarBorrado}>
                ¿Eliminarla del histórico? Su conversación se queda guardada.
                <button type="button" className={estilos.borrar} onClick={() => alBorrar(t.id)}>
                  Eliminar
                </button>
                <button type="button" className={estilos.accion} onClick={() => setConfirmarBorrado(false)}>
                  Cancelar
                </button>
              </span>
            ) : (
              <button type="button" className={estilos.botonBorrar} onClick={() => setConfirmarBorrado(true)}>
                Eliminar
              </button>
            )}
          </div>
          {confirmarReversion && revertir !== undefined && typeof revertible === "object" && "ficheros" in revertible ? (
            <div className={estilos.confirmarReversion} role="alertdialog" aria-label="Revertir sus cambios">
              <p>
                Se deshace lo que escribió esta tarea —{" "}
                {revertible.ficheros.length === 1 ? "1 fichero" : `${revertible.ficheros.length} ficheros`}— y el proyecto vuelve a
                como estaba antes. La tarea sale del histórico.{" "}
                {revertible.conversacion === true
                  ? "Es una continuación: la conversación de su tarea vuelve también a como estaba (sin lo que dijo e hizo esta, ni sus artefactos)."
                  : "Su conversación se queda guardada."}{" "}
                Si ya lo subiste a CloudStudio, quedará pendiente de subir en Sincronización.
              </p>
              <ul className={estilos.listaObservaciones}>
                {revertible.ficheros.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {motivoDeReversion === undefined ? null : <p className={estilos.motivo}>{`No se revirtió: ${motivoDeReversion}`}</p>}
              <div className={estilos.accionesFinalizada}>
                <button
                  type="button"
                  className={estilos.borrar}
                  disabled={revirtiendo}
                  onClick={() => {
                    setRevirtiendo(true);
                    void revertir.hacer(t.id).then(
                      (motivo) => {
                        setRevirtiendo(false);
                        // Hecho: la tarea sale de la lista sola, con la cola nueva.
                        if (motivo !== undefined) setMotivoDeReversion(motivo);
                      },
                      () => {
                        setRevirtiendo(false);
                        setMotivoDeReversion("el envío falló");
                      }
                    );
                  }}
                >
                  {revirtiendo ? "Revirtiendo…" : "Revertir"}
                </button>
                <button type="button" className={estilos.accion} disabled={revirtiendo} onClick={() => setConfirmarReversion(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
          {reencolar === "hecho" ? <p className={estilos.aviso}>Encolada: la tienes en «En curso».</p> : null}
          {reencolar === "abierto" && t.reencolable !== undefined && alReencolar !== undefined ? (
            <Reencolar
              id={t.id}
              titulo={t.titulo}
              textoPropuesto={t.reencolable.texto}
              conHilo={conConversacion}
              adjuntosDeLaOriginal={t.adjuntos.map((a) => a.nombre)}
              alReencolar={alReencolar}
              alCancelar={() => setReencolar("cerrado")}
              alEncolar={() => setReencolar("hecho")}
              {...(adjuntosDelBorrador === undefined ? {} : { adjuntosDelBorrador })}
            />
          ) : null}
          {verEncargo ? (
            <div>
              <EncargoDeTarea tarea={t} />
            </div>
          ) : null}
          {criticos.length > 0 ? (
            <section className={estilos.critico} aria-label="Crítico">
              <h4 className={estilos.rotuloCritico}>## CRITICAL</h4>
              <ul>
                {criticos.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {observaciones.length > 0 ? (
            <section aria-label="Observaciones">
              <h4 className={estilos.rotuloObservaciones}>Observaciones</h4>
              <ul className={estilos.listaObservaciones}>
                {observaciones.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {salvedad === undefined ? null : <p className={estilos.salvedad}>{`Se entregó con una condición menos: ${salvedad}`}</p>}
          {/* Lo que GASTÓ (petición suya: que el resumen final lo diga). Sin gasto que conste, nada: no es un cero. */}
          {t.gasto === undefined ? null : <p className={estilos.gasto}>{`Gastó: ${textoDelGastoDeTarea(t.gasto)}`}</p>}
          {conConversacion && alPedirUltimaRespuesta !== undefined ? (
            <section aria-label="Qué hizo">
              <h4 className={estilos.rotuloHizo}>Qué hizo</h4>
              {respuesta === undefined || respuesta === "pidiendo" ? (
                <p className={estilos.aviso}>Leyendo su conversación…</p>
              ) : respuesta.error !== undefined ? (
                <p className={estilos.motivo}>{`No se pudo leer su conversación: ${respuesta.error}`}</p>
              ) : respuesta.texto === undefined ? (
                <p className={estilos.aviso}>No consta ninguna respuesta del agente en su conversación.</p>
              ) : (
                // Es la respuesta del agente: markdown, como en el chat (con los dólares protegidos).
                <div className={estilos.respuesta}>
                  <MarkdownText text={protegerDolares(respuesta.texto)} codeLabels={ETIQUETAS_DE_CODIGO} />
                </div>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Revertir lo que hizo una finalizada: preguntar si se puede (qué ficheros) y hacerlo (el motivo si se negó). */
export interface RevertirTarea {
  /** `conversacion`: una continuación cuya conversación (chat, memoria, artefactos) también vuelve a como estaba. */
  preguntar: (id: string) => Promise<{ ficheros: readonly string[]; conversacion?: true } | { motivo: string }>;
  hacer: (id: string) => Promise<string | undefined>;
}

/**
 * El texto de «Reencolar lo pendiente» (lo propone el SERVIDOR, editable) y su «Encolar»: una tarea NUEVA en el hilo de
 * esta. No se cierra si el servidor se niega: dice por qué.
 */
function Reencolar({
  id,
  titulo,
  textoPropuesto,
  conHilo,
  adjuntosDeLaOriginal,
  alReencolar,
  alCancelar,
  alEncolar,
  adjuntosDelBorrador,
}: {
  id: string;
  /** El de la tarea que se reencola: el diálogo dice de cuál es. */
  titulo: string;
  textoPropuesto: string;
  conHilo: boolean;
  /** Los que ya lleva la original (se copian): un pegado nuevo no puede llamarse igual. */
  adjuntosDeLaOriginal: readonly string[];
  alReencolar: (id: string, texto: string, borrador?: string) => Promise<string | undefined>;
  alCancelar: () => void;
  alEncolar: () => void;
  /** Subir, quitar y descartar las capturas NUEVAS, bajo el borrador de este formulario. Ausente = sin adjuntos. */
  adjuntosDelBorrador?: AdjuntosDelBorrador;
}) {
  const [texto, setTexto] = useState(textoPropuesto);
  const [enviando, setEnviando] = useState(false);
  const [motivo, setMotivo] = useState<string | undefined>(undefined);
  // El borrador nace con el formulario: sus capturas se suben ahí ANTES de encolar, y el servidor lo adopta.
  const [borrador] = useState(() => crypto.randomUUID());
  const { adjuntos, añadir, quitar, alPegar, enVuelo, algunoFalló, algunoListo, puedeQuitar } = useAdjuntosDeBorrador({
    alSubir: (fichero, nombre) =>
      adjuntosDelBorrador === undefined ? Promise.resolve({ ok: false, motivo: "aquí no se pueden adjuntar ficheros" }) : adjuntosDelBorrador.subir(borrador, nombre, fichero),
    ...(adjuntosDelBorrador?.quitar === undefined ? {} : { alQuitar: (nombre: string) => adjuntosDelBorrador.quitar!(borrador, nombre) }),
    ocupados: adjuntosDeLaOriginal,
  });
  /**
   * Cerrar sin encolar con capturas YA subidas BORRA su carpeta —lo mismo que «Nueva tarea» al cancelar—: si no, quedan
   * en `~/.xonecode/tareas/<borrador>/` imágenes que ninguna tarea nombra. También al PLEGAR la fila (se desmonta).
   */
  const pendienteDeBorrar = useRef(false);
  pendienteDeBorrar.current = algunoListo;
  const descartar = adjuntosDelBorrador?.descartar;
  useEffect(
    () => () => {
      if (pendienteDeBorrar.current) descartar?.(borrador);
    },
    [borrador, descartar]
  );
  const limpio = texto.trim();
  const sePuedeEncolar = limpio !== "" && !enviando && !enVuelo && !algunoFalló;
  const encolar = (): void => {
    if (!sePuedeEncolar) return;
    setEnviando(true);
    void (algunoListo ? alReencolar(id, limpio, borrador) : alReencolar(id, limpio)).then(
      (negado) => {
        setEnviando(false);
        if (negado === undefined) {
          // Ya es una tarea: su carpeta es suya y no se borra al desmontar.
          pendienteDeBorrar.current = false;
          alEncolar();
        } else setMotivo(negado);
      },
      () => {
        setEnviando(false);
        setMotivo("el envío falló");
      }
    );
  };
  return (
    // Un DIÁLOGO (petición suya): el texto es largo y en la fila no cabía. La MISMA ventana que «Nueva tarea» —velo,
    // tamaño, botones al pie— y modal de verdad: ni Escape ni el clic fuera la cierran, solo sus botones.
    <Modal open onClose={SIN_CERRAR} title="Reencolar lo pendiente" headless className={ventana.capa}>
      <div className={ventana.velo}>
        <div className={ventana.ventana}>
          <h2 className={ventana.titulo}>Reencolar lo pendiente de «{titulo}»</h2>
          <p className={ventana.nota}>
            {conHilo
              ? "Se encola una tarea nueva que sigue en la MISMA conversación: recuerda lo que hizo. La original se queda en el histórico."
              : "Se encola una tarea nueva. Su conversación no se guardó: irá con el encargo original delante."}
          </p>
          <label className={ventana.etiqueta} htmlFor={`reencolar-${id}`}>
            Lo que le mandarás
          </label>
          <textarea
            id={`reencolar-${id}`}
            className={ventana.campo}
            rows={12}
            value={texto}
            disabled={enviando}
            onChange={(evento) => setTexto(evento.target.value)}
            {...(adjuntosDelBorrador === undefined ? {} : { onPaste: alPegar })}
          />
          {adjuntosDelBorrador === undefined ? null : (
            <>
              <RejillaDeAdjuntos nuevos={adjuntos} quitar={quitar} puedeQuitar={puedeQuitar} añadir={añadir} deshabilitado={enviando} />
              <p className={ventana.nota}>El agente las verá en «/adjuntos/», junto a las de la tarea original.</p>
            </>
          )}
          {motivo === undefined ? null : (
            <p className={ventana.nota} role="alert" data-error="">
              {`No se encoló: ${motivo}`}
            </p>
          )}
          <div className={ventana.acciones}>
            <Button variant="outline" className={ventana.accion} disabled={enviando} onClick={alCancelar}>
              Cancelar
            </Button>
            <Button variant="primary" className={`${ventana.accion} ${ventana.principal}`} disabled={!sePuedeEncolar} onClick={encolar}>
              {enviando ? "Encolando…" : "Encolar"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Fila({
  tarea: t,
  anterior,
  enTuChat,
  alReintentar,
  alDescartar,
  alTerminar,
  alEnviarFeedback,
  alContinuar,
  alArrancarAhora,
  alEditarEncargo,
  alRegenerarEncargo,
  alParar,
  puedeArrancar,
  conectado,
  corriendoAqui,
  alMirar,
  alIrAlChat,
  alDejarDeMirar,
  mirando,
  mirada,
  enCola,
  adjuntosDelBorrador,
}: {
  tarea: TareaDelCable;
  /** La tarea a la que ESPERA (`tras`), si sigue en la cola. Una que ya no está —descartada— no
   *  la retiene: el corredor la deja correr, y aquí no se dice nada. */
  anterior?: TareaDelCable | undefined;
  /** Su conversación es la que tienes abierta en el chat: `trabajando` con un turno tuyo en marcha. */
  enTuChat?: "abierta" | "trabajando";
  alReintentar?: (id: string) => void;
  alDescartar?: (id: string) => void;
  alTerminar?: (id: string) => void;
  alEnviarFeedback?: (id: string, texto: string) => void;
  alContinuar?: (id: string) => Promise<string | undefined>;
  alArrancarAhora?: (id: string) => Promise<string | undefined>;
  /** Cambiar el encargo de una que nunca ha arrancado (IXCODE-52): devuelve el motivo si el servidor se negó. */
  alEditarEncargo?: (
    id: string,
    encargo: string,
    peticion: string,
    pantallas?: { name: string; titulo: string }[] | null,
    adjuntos?: CambiosDeAdjuntos
  ) => Promise<string | undefined>;
  /** Volver a preparar el encargo desde la petición, sin guardarlo (IXCODE-53). */
  alRegenerarEncargo?: (id: string, peticion: string) => Promise<{ encargo: string } | { motivo: string }>;
  /** Parar una en marcha sin borrarla (IXCODE-50): devuelve el motivo si el servidor se negó. */
  alParar?: (id: string) => Promise<string | undefined>;
  puedeArrancar?: boolean;
  conectado?: boolean;
  /** Si ESTE proceso ejecuta las tareas: de la pestaña entera, no de la fila —se le pasa
   *  tal cual a `MirarTarea`, que es quien decide con esto si ofrece el despliegue. */
  corriendoAqui?: boolean;
  alMirar?: (id: string) => void;
  /** Ir al chat de la tarea (en marcha o esperando respuesta) en vez del detalle en la fila. Ausente = el detalle. */
  alIrAlChat?: (tarea: TareaDelCable) => void;
  alDejarDeMirar?: (id: string) => void;
  mirando?: string;
  mirada?: { tarea: string; actos: readonly Acto[] };
  /** Su sitio en la cola y cómo moverla (petición suya, 21-10-2026). Ausente = no se ordena (la que trabaja, una aparcada). */
  enCola?: EnLaCola;
  /** Las imágenes nuevas al editarla, como «Nueva tarea». Ausente = editar no ofrece adjuntar. */
  adjuntosDelBorrador?: AdjuntosDelBorrador;
}) {
  const [verEncargo, setVerEncargo] = useState(false);
  return (
    <li
      className={estilos.fila}
      data-estado={t.estado}
      data-arrastrando={enCola?.arrastrando === true ? "" : undefined}
      data-encima={enCola?.encima === true ? "" : undefined}
      {...(enCola?.arrastre === undefined ? {} : enCola.arrastre)}
    >
      {enCola === undefined ? (
        <span className={estilos.punto} aria-hidden="true" />
      ) : (
        <>
          {enCola.arrastre === undefined ? null : (
            <span className={estilos.asa} aria-hidden="true" title="Arrastra para cambiar el orden">
              <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                <circle cx="2.5" cy="2.5" r="1.4" />
                <circle cx="7.5" cy="2.5" r="1.4" />
                <circle cx="2.5" cy="8" r="1.4" />
                <circle cx="7.5" cy="8" r="1.4" />
                <circle cx="2.5" cy="13.5" r="1.4" />
                <circle cx="7.5" cy="13.5" r="1.4" />
              </svg>
            </span>
          )}
          <span className={estilos.posicion} aria-label={`En la cola, la ${enCola.posicion}.ª`}>
            {enCola.posicion}
          </span>
        </>
      )}
      <div className={estilos.cuerpo}>
        <div className={estilos.cabecera}>
          <span className={estilos.titulo}>{t.titulo}</span>
          <ClaveDelTicket tarea={t} />
          <span className={estilos.etiquetaEstado}>{ETIQUETA_DE_ESTADO[t.estado]}</span>
        </div>
        <AvisoDelTicket tarea={t} />
        {/* Motivo y veredicto van aquí solo si la fila NO está desplegada: expandida,
            `MirarTarea` ya los enseña dentro del detalle (Task 17), y pintarlos dos veces
            sería la misma información repetida. */}
        {mirando === t.id ? null : (
          <>
            {/* Ausente = no consta ningún motivo; nunca se inventa uno para rellenar la fila. */}
            {t.motivo === undefined ? null : <p className={estilos.motivo}>{t.motivo}</p>}
            {t.estado === "requiere-atencion" && enTuChat !== undefined ? (
              <p className={estilos.espera}>
                {enTuChat === "trabajando"
                  ? "La estás atendiendo tú en el chat: el agente trabaja ahí, con cada escritura aprobada. Sigue aparcada como tarea."
                  : "Su conversación está abierta en tu chat: puedes seguirla ahí o mandarla a continuar sola."}
              </p>
            ) : null}
            {/* Encadenada: no arranca hasta que la anterior termine (`core/tareas.ts#siguientesAEjecutar`). */}
            {t.estado === "nuevo" && anterior !== undefined && anterior.estado !== "terminada" ? (
              <p className={estilos.espera}>{`espera a: ${anterior.titulo}`}</p>
            ) : null}
            {t.estado === "en-proceso" && t.empezada !== undefined ? <CifrasEnMarcha empezada={t.empezada} gasto={t.gastoEnCurso} /> : null}
            {/* Lo que se le encargó, para poder leerlo antes de que arranque: plegado, porque un
                encargo son párrafos y la lista tiene que seguir siendo una lista. */}
            <details className={estilos.contenido} onToggle={(e) => setVerEncargo((e.currentTarget as HTMLDetailsElement).open)}>
              <summary>Ver el encargo</summary>
              {/* Lo plegado se DESMONTA (regla del cliente): el encargo solo existe abierto. */}
              {verEncargo ? <EncargoDeTarea tarea={t} /> : null}
            </details>
            {/* Y cómo llegó a «Terminada», que es donde el motivo ya no existe: la MISMA
                pieza que monta `Kanban.tsx`, para que las dos vistas no puedan afirmar cosas
                distintas de la misma tarea. */}
            <EntregaDeTarea tarea={t} />
          </>
        )}
        {/* Ver lo que hace, en vivo, desplegando ESTA fila (Task 17): la MISMA pieza que
            monta `Kanban.tsx`, con sus condiciones dentro y no aquí. */}
        <MirarTarea
          tarea={t}
          conectado={conectado}
          corriendoAqui={corriendoAqui}
          {...(alMirar === undefined ? {} : { alMirar })}
          {...(alIrAlChat === undefined ? {} : { alIrAlChat })}
          {...(alDejarDeMirar === undefined ? {} : { alDejarDeMirar })}
          {...(mirando === undefined ? {} : { mirando })}
          {...(mirada === undefined ? {} : { mirada })}
        />
      </div>
      <div className={estilos.acciones}>
        {enCola === undefined || (enCola.subir === undefined && enCola.bajar === undefined) ? null : (
          <span className={estilos.flechas}>
            <button type="button" className={estilos.flecha} aria-label="Subir en la cola" disabled={enCola.subir === undefined} onClick={enCola.subir}>
              ↑
            </button>
            <button type="button" className={estilos.flecha} aria-label="Bajar en la cola" disabled={enCola.bajar === undefined} onClick={enCola.bajar}>
              ↓
            </button>
          </span>
        )}
        <AccionesDeTarea
          tarea={t}
          conectado={conectado}
          alReintentar={alReintentar}
          alDescartar={alDescartar}
          alTerminar={alTerminar}
          alEnviarFeedback={alEnviarFeedback}
          // Con chat al que ir, se escribe ahí («Ir al chat para responder»): el campo aquí sería el mismo dos veces.
          {...(alIrAlChat !== undefined && t.sesion !== undefined ? { sinFeedback: true } : {})}
          {...(alContinuar === undefined ? {} : { alContinuar })}
          {...(alArrancarAhora === undefined ? {} : { alArrancarAhora })}
          {...(alEditarEncargo === undefined ? {} : { alEditarEncargo })}
          {...(alRegenerarEncargo === undefined ? {} : { alRegenerarEncargo })}
          {...(alParar === undefined ? {} : { alParar })}
          {...(puedeArrancar === undefined ? {} : { puedeArrancar })}
          {...(adjuntosDelBorrador === undefined ? {} : { adjuntosDelBorrador })}
        />
      </div>
    </li>
  );
}

/**
 * La clave del ticket en el gestor (Jira, Notion…) en el que vive la tarea, con su enlace si lo hay. Ausente = tarea
 * solo local, y no se pinta nada.
 */
/**
 * Lo que se pidió y lo que se le mandó al agente, en ESE orden (petición suya): el encargo es la petición ENRIQUECIDA
 * por el aumentador, párrafos de criterios y límites, y sin la petición delante no se veía qué había escrito la persona.
 * Si son el mismo texto —una propuesta del orquestador, o el aumentador falló y se encoló la petición— va una sola vez.
 */
function EncargoDeTarea({ tarea: t }: { tarea: TareaDelCable }) {
  const igual = t.peticion.trim() === t.encargo.trim();
  // Markdown, como «Qué hizo» y el chat (petición suya): el encargo ampliado son `##`, listas y negritas, y en texto
  // plano se leían los asteriscos. La petición también, por si la persona escribió con formato.
  const md = (texto: string, clase: string | undefined) => (
    <div className={clase}>
      <MarkdownText text={protegerDolares(texto)} codeLabels={ETIQUETAS_DE_CODIGO} />
    </div>
  );
  return (
    <>
      {t.adjuntos.length > 0 ? <p className={estilos.adjuntosDeTarea}>{`Adjuntos: ${t.adjuntos.map((a) => a.nombre).join(", ")}`}</p> : null}
      {t.pantallasDeStitch === undefined || t.pantallasDeStitch.length === 0 ? null : t.pantallasDeStitch.length === 1 ? (
        <p className={estilos.adjuntosDeTarea}>
          {`Diseño: «${t.pantallasDeStitch[0]!.titulo}»${t.pantallasDeStitch[0]!.proyecto === undefined ? "" : ` del proyecto de Stitch «${t.pantallasDeStitch[0]!.proyecto}»`}`}
        </p>
      ) : (
        // Varias: numeradas y una por línea, como al elegirlas.
        <div className={estilos.adjuntosDeTarea}>
          {`Diseño${t.pantallasDeStitch[0]!.proyecto === undefined ? "" : ` del proyecto de Stitch «${t.pantallasDeStitch[0]!.proyecto}»`}, una pantalla cada una:`}
          <ListaDePantallas pantallas={t.pantallasDeStitch} />
        </div>
      )}
      {igual ? (
        md(t.encargo, estilos.encargo)
      ) : (
        <>
          <section aria-label="Lo que se pidió">
            <h4 className={estilos.rotuloEncargo}>Lo que se pidió</h4>
            {md(t.peticion, estilos.peticion)}
          </section>
          <section aria-label="Encargo ampliado">
            <h4 className={estilos.rotuloEncargo}>Encargo ampliado (lo que se le mandó al agente)</h4>
            {md(t.encargo, estilos.encargo)}
          </section>
        </>
      )}
    </>
  );
}

function ClaveDelTicket({ tarea: t }: { tarea: TareaDelCable }) {
  if (t.ticket === undefined) return null;
  return t.ticket.url === undefined ? (
    <span className={estilos.ticket}>{t.ticket.clave}</span>
  ) : (
    <a className={estilos.ticket} href={t.ticket.url} target="_blank" rel="noreferrer" title="Abrir en el gestor de tareas">
      {t.ticket.clave}
    </a>
  );
}

/** Lo último que no se pudo escribir en el gestor (pasar a EN CURSO, cerrar…): la tarea siguió, el ticket no. */
function AvisoDelTicket({ tarea: t }: { tarea: TareaDelCable }) {
  if (t.ticket?.aviso === undefined) return null;
  return <p className={estilos.motivo}>{t.ticket.aviso}</p>;
}

/**
 * El tiempo que lleva una tarea, para leer: segundos el primer minuto, minutos y segundos la primera hora, y luego horas
 * y minutos —a la hora, los segundos ya no dicen nada—. Puro.
 */
export function tiempoQueLleva(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
}

/**
 * **Una tarea en marcha dice cuánto lleva y cuánto ha gastado** (petición suya, 21-10-2026). El reloj corre aquí, contra
 * `empezada` (la hora del SERVIDOR); el gasto lo manda el servidor (`gastoEnCurso`), que lo reemite mientras trabaja.
 * Sin gasto que conste no se pinta la cifra: ausente no es cero.
 */
export function EnMarcha({ empezada, gasto }: { empezada: string; gasto: TareaDelCable["gastoEnCurso"] }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, []);
  const desde = Date.parse(empezada);
  if (Number.isNaN(desde)) return null;
  return (
    <p className={estilos.gasto}>
      {`Lleva ${tiempoQueLleva(ahora - desde)}${gasto === undefined ? "" : ` · ${textoDelGastoDeTarea(gasto)}`}`}
    </p>
  );
}

/** Lo que una fila de la COLA sabe de su sitio: el número, cómo arrastrarla y las flechas (ausente = en el borde). */
interface EnLaCola {
  posicion: number;
  arrastre?: {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  arrastrando?: boolean;
  encima?: boolean;
  subir?: () => void;
  bajar?: () => void;
}

/**
 * La que TRABAJA, en tres cifras grandes: cuánto lleva, tokens y caché (petición suya, 21-10-2026: la tarjeta de su
 * lienzo). Las mismas fuentes que `EnMarcha`; sin gasto que conste, solo el tiempo.
 */
function CifrasEnMarcha({ empezada, gasto }: { empezada: string; gasto: TareaDelCable["gastoEnCurso"] }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, []);
  const desde = Date.parse(empezada);
  if (Number.isNaN(desde)) return null;
  const tokens = gasto === undefined ? undefined : textoDelGastoDeTarea(gasto).split(" · ");
  return (
    <dl className={estilos.cifrasEnMarcha} aria-label={`Lleva ${tiempoQueLleva(ahora - desde)}${gasto === undefined ? "" : ` · ${textoDelGastoDeTarea(gasto)}`}`}>
      <div>
        <dt>lleva</dt>
        <dd>{tiempoQueLleva(ahora - desde)}</dd>
      </div>
      {tokens?.map((parte) => {
        const [cifra, ...resto] = parte.split(" ");
        return (
          <div key={parte}>
            <dt>{resto.join(" ")}</dt>
            <dd>{cifra}</dd>
          </div>
        );
      })}
    </dl>
  );
}
