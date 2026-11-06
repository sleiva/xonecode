import { PROYECTOS_POR_OMISION } from "./Barra.js";
import { IconoDeEntorno } from "./IconoDeEntorno.js";
import { IconoCompartido } from "./IconosDeProyecto.js";
import estilos from "./Escritorio.module.css";
import { Equipo } from "./Equipo.js";
import { Kanban } from "./Kanban.js";
import type { Acto, AsignadasDelProyecto, EstadoDeSync, FotoDelResumen, InformeDeDispositivos, TareaDelCable } from "../tipos.js";
import { useEffect, useState } from "react";
import { EnMarcha } from "./TareasDelProyecto.js";

/**
 * El centro cuando no hay sesión abierta: el escritorio.
 *
 * Sustituye a `SinProyectoAbierto`, que era una línea de texto («elige un proyecto en la
 * barra lateral») en mitad de una pantalla vacía. La barra ya no es el único sitio donde se
 * puede empezar: aquí están los proyectos con lo que se sabe de cada uno, y empezar es un
 * clic sobre el que quieras.
 *
 * **Todo lo que se pinta viene del servidor y ya viajaba por el cable**: los proyectos con
 * y si tienen copia local (`alta.proyectos`), el entorno activo
 * (`alta.entornoActivo` sobre `alta.registrados`) y el modelo en vigor (`modelos.actual`).
 * No hay ni una tarjeta de relleno: cuando falta algo se dice qué falta y dónde se arregla,
 * que es lo que esta pantalla hacía mal — no decía nada.
 *
 * **Solo se pintan los proyectos ELEGIDOS** (`visibles`, la misma elección que manda en la
 * barra lateral; ausente = los `PROYECTOS_POR_OMISION` primeros, igual que ella). Los demás
 * se CUENTAN en una línea con el camino a Ajustes, y no se pintan: estaban debajo con su
 * propia rejilla de tarjetas, y eso deshacía la elección —el escritorio enseñaba los
 * dieciocho proyectos del entorno y el grupo elegido se perdía entre ellos—. Elegir cuatro
 * y ver dieciocho es no haber elegido. Pero la cuenta no se calla: sin ella, el escritorio
 * afirmaría que el entorno solo tiene estos.
 *
 * **Es un centro de control** (lienzo, «C · Centro de control», noviembre de 2026): cifras arriba, «Lo que te
 * espera» (`loQueTeEspera`) y los proyectos en la columna principal, y Tu equipo en la lateral. Lo que la C
 * enseñaba y no viaja todavía —sin subir, gasto, gestor, aprendido, granja— no se pinta: `docs/DISENO-DASHBOARD.md`.
 *
 * Y no se pinta NADA del mockup que no tenga dato detrás. El panel de dispositivos
 * (`Equipo.tsx`) existe desde que el servidor MIDE la máquina (`core/dispositivos.ts`:
 * sistema, adb/emulator, simuladores y dispositivos iOS); «Build & Run» y cualquier acción
 * sobre el móvil siguen sin cablear y no se pintan. Ver `docs/DISENO-DASHBOARD.md`.
 */
export function Escritorio({
  nombre,
  entorno,
  proyectos,
  modelo,
  alNuevaSesion,
  alAbrirAjustes,
  conectado,
  visibles,
  fijados,
  dispositivos,
  alActualizarDispositivos,
  alVerificarDispositivo,
  alNuevaTarea,
  tareas,
  alAbrirSesionDeTarea,
  alAbrirRevisionDeTarea,
  alReintentarTarea,
  alDescartarTarea,
  alTerminarTarea,
  alEnviarFeedback,
  alMirarTarea,
  alDejarDeMirarTarea,
  alIrAlChatDeTarea,
  mirandoTarea,
  mirada,
  tableroAbierto,
  alPedirResumen,
  alAbrirProyecto,
  alPedirAsignadas,
}: {
  /** El saludo (`agent/persona.ts`). Ausente = se saluda igual, sin inventarse un nombre. */
  nombre?: string;
  /** El entorno activo. Ausente = no hay ninguno registrado todavía. */
  /** El `id` además del nombre: es lo que decide su marca (`IconoDeEntorno`). */
  entorno?: { id: string; nombre: string; url: string };
  proyectos: readonly {
    id: string;
    nombre: string;
    local?: boolean;
    /** Compartido CONTIGO por otra persona. Ausente = el servidor no lo dijo, que no es lo
     *  mismo que «es tuyo»: entonces no se pinta ninguna de las dos etiquetas. */
    compartido?: boolean;
  }[];
  /** «proveedor/modelo» en vigor. Ausente = no hay sesión y por tanto no se afirma ninguno. */
  modelo?: string;
  /**
   * Los proyectos elegidos para la barra (`Entorno.proyectos`). Ausente = nadie eligió y
   * aplica la misma omisión que la barra. Medido: la barra enseñaba cuatro y decía «14 más»
   * mientras el escritorio pintaba los dieciocho iguales, con dieciocho botones primarios.
   * Ahora los destacados van primero y el resto debajo, con su botón en segundo plano.
   */
  visibles?: readonly string[];
  /** Los fijados de la barra (`Entorno.fijados`): van primero y nunca cuentan como «sin
   *  enseñar». Ausente = ninguno. */
  fijados?: readonly string[];
  alNuevaSesion: (proyecto: string) => void;
  alAbrirAjustes: () => void;
  /**
   * Si el cable está vivo. Medido sin servidor: lo único que cambiaba era un «sin conexión»
   * pequeño en la esquina, y los 18 «Nueva sesión» seguían negros y pulsables — se pulsaba
   * y no pasaba nada. Sin conexión, lo que manda algo al servidor se apaga, y el punto
   * del entorno deja de estar verde: nada de esto se puede afirmar sin cable.
   */
  conectado?: boolean;
  /** La foto de la máquina (`Equipo.tsx`). Ausente = aún no llegó. */
  dispositivos?: InformeDeDispositivos;
  alActualizarDispositivos?: () => void;
  /** Habla con un dispositivo y espera respuesta. Ausente = no se pinta ningún botón. */
  alVerificarDispositivo?: (id: string) => void;
  /**
   * Crear una TAREA en background para ese proyecto. Ausente = no se ofrece.
   *
   * Vive en la tarjeta del proyecto, al lado de «Nueva sesión», porque son la misma clase de
   * decisión sobre el mismo objeto. **Hasta Task 15 era además la ÚNICA puerta** —la pestaña
   * de tareas de un proyecto solo existía si ya tenía alguna—, así que con un proyecto
   * abierto no había forma de crear la primera sin volver aquí. Esa pestaña
   * (`TareasDelProyecto.tsx`) vive ahora SIEMPRE dentro del proyecto abierto y ofrece el
   * mismo botón; esta tarjeta se queda porque sigue siendo la única puerta para quien
   * TODAVÍA no ha abierto ningún proyecto.
   */
  alNuevaTarea?: (proyecto: string) => void;
  /**
   * La cola de tareas en background (`Kanban.tsx`). Ausente = el servidor no ha mandado
   * `tareas` todavía — ni una vez, ni esta ejecución no las ejecuta—, y eso NO es lo mismo
   * que «no hay ninguna»: el panel lo dice en vez de afirmar una cola vacía que nadie ha
   * medido, la misma regla que `dispositivos` ausente en «Tu equipo».
   */
  tareas?: {
    lista: readonly TareaDelCable[];
    concurrencia: number;
    corriendoAqui: boolean;
    /** Si las ejecuta OTRO proceso. Ausente = no se sabe, que no es «nadie»: se propaga tal
     *  cual hasta `QuienEjecutaTareas`, que es quien decide qué decir de cada caso. */
    ejecutaOtroProceso?: boolean;
  };
  /** Abrir la conversación de una tarea, desde su tarjeta del kanban. */
  alAbrirSesionDeTarea?: (proyecto: string, sesion: string) => void;
  /** Abrir la pestaña Revisión de una tarea «esperando feedback»: la verdad sobre lo que
   *  cambió en el disco, sin aprobación previa de por medio. */
  alAbrirRevisionDeTarea?: (proyecto: string, sesion: string) => void;
  /**
   * Reintentar, descartar y terminar una tarea del kanban: las tres reenviadas tal cual a
   * `AccionesDeTarea` a través de `Kanban`. Antes solo `TareasDelProyecto.tsx` las
   * ofrecía, así que una tarea bloqueada solo se desbloqueaba desde la pestaña del
   * proyecto y no desde aquí (Task 13). Ausentes = no se ofrecen.
   */
  alReintentarTarea?: (id: string) => void;
  alDescartarTarea?: (id: string) => void;
  alTerminarTarea?: (id: string) => void;
  /**
   * «Se edita la tarea y se agrega el feedback del usuario» (§0 del diseño): añadir
   * feedback a una tarea «esperando feedback», que la devuelve al lazo en su mismo hilo.
   * Reenviada tal cual a `Kanban`; ausente = no se ofrece el campo.
   */
  alEnviarFeedback?: (id: string, texto: string) => void;
  /**
   * Ver, y dejar de ver, EN VIVO lo que hace el turno de una tarea. Ausentes = no se ofrece
   * (esta ventana no tiene el canal del transporte).
   */
  alMirarTarea?: (id: string) => void;
  alDejarDeMirarTarea?: (id: string) => void;
  /** Ir al chat de una tarea (en marcha o esperando respuesta). Reenviado a `Kanban` → `MirarTarea`. */
  alIrAlChatDeTarea?: (tarea: TareaDelCable) => void;
  /** Cuál se está mirando: lo elige esta ventana, y es lo que hace que su tarjeta lo diga. */
  mirandoTarea?: string;
  /**
   * El transcript que el servidor está mandando de esa tarea. Ausente = todavía no ha
   * llegado —o el cable se cayó y se pidió otra vez—, y entonces el panel dice que aún no ha
   * pintado nada en vez de afirmar un turno vacío.
   */
  mirada?: { tarea: string; actos: readonly Acto[] };
  /** Cómo NACE el tablero de tareas: plegado en cifras por omisión (su lienzo); `true` lo abre de entrada. */
  tableroAbierto?: boolean;
  /** La FOTO del resumen de un proyecto (`accion: "resumen"`), la MISMA que pinta su pestaña Resumen: de ella sale lo
   *  que queda por subir. Ausente = no se pide, y «sin subir» no se pinta. */
  alPedirResumen?: (proyecto: string) => Promise<FotoDelResumen | undefined>;
  /** Abrir el panel de un proyecto, como pulsarlo en la barra; con `"tareas"`, en esa pestaña. Ausente = no se ofrece ir. */
  alAbrirProyecto?: (proyecto: string, pestana?: "tareas") => void;
  /** Lo asignado a la persona en el gestor de un proyecto (`accion: "asignadas"`). Ausente = no se pide ni se pinta. */
  alPedirAsignadas?: (proyecto: string) => Promise<AsignadasDelProyecto | undefined>;
}) {
  const apagado = conectado === false;
  /** El tablero de tareas, plegado en cifras por omisión (su lienzo): se despliega para actuar sobre una. */
  const [verTablero, setVerTablero] = useState(tableroAbierto === true);
  // Los FIJADOS van primero, y cuentan como enseñados: la misma cuenta que la barra, que los
  // pinta en su grupo aunque no estén entre los visibles. Sin esto la barra decía «14 más» y
  // el escritorio «otros 15» para la misma elección.
  const fijadosALaVista = proyectos.filter((p) => fijados?.includes(p.id) === true);
  const elegidos =
    visibles === undefined ? proyectos.slice(0, PROYECTOS_POR_OMISION) : proyectos.filter((p) => visibles.includes(p.id));
  const destacados = [...fijadosALaVista, ...elegidos.filter((p) => !fijadosALaVista.includes(p))];
  const otros = proyectos.filter((p) => !destacados.includes(p));
  const sinSubir = useSinSubir(destacados, alPedirResumen);
  const asignadas = usePorProyecto(destacados, alPedirAsignadas);
  return (
    <div className={estilos.escritorio}>
      <div className={estilos.contenido}>
        <header className={estilos.portada}>
          <h1 className={estilos.saludo}>{nombre === undefined ? "Hola" : `Hola, ${nombre}`}</h1>
          {entorno === undefined ? null : (
            <p className={estilos.entorno}>
              {/* La marca del entorno, delante de su punto de conexión: la primera dice de
                  QUÉ servidor se habla y el segundo si se le está hablando. */}
              <IconoDeEntorno entorno={entorno.id} size={16} className={estilos.iconoDeEntorno} />
              <span className={estilos.punto} data-sin-conexion={apagado ? "" : undefined} aria-hidden="true" />
              <span className={estilos.entornoNombre}>{entorno.nombre}</span>
              <span className={estilos.entornoUrl}>{entorno.url}</span>
            </p>
          )}
        </header>

        <Cifras
          {...(tareas === undefined ? {} : { tareas: tareas.lista })}
          {...(dispositivos === undefined ? {} : { dispositivos })}
          {...(sinSubir === undefined ? {} : { sinSubir })}
        />

        {/* Dos columnas, la del trabajo y una lateral de 300 con Tu equipo (lienzo, «C · Centro de control»; los proyectos van en la principal, en filas, porque con sus dos botones cada uno alargaban la lateral el doble que la principal). Con el tablero
            abierto, la del trabajo ocupa la fila entera y la lateral baja: el kanban son cuatro columnas. */}
        <div className={estilos.panel} data-tablero={verTablero && tareas !== undefined ? "" : undefined}>
          <div className={estilos.principal}>
            {tareas === undefined ? null : (
              <TrabajandoAhora
                tareas={tareas.lista}
                proyectos={proyectos}
                {...(alIrAlChatDeTarea === undefined ? {} : { alIrAlChat: alIrAlChatDeTarea })}
              />
            )}
            {/*
              Ausente no es «no hay ninguna» —es «no ha llegado la cola»—, la misma regla que la foto
              de la máquina, así que se dice en vez de afirmar una bandeja vacía que nadie ha medido.
            */}
            {tareas === undefined ? (
              <p className={estilos.vacio}>Todavía no ha llegado la cola de tareas en background.</p>
            ) : !verTablero ? (
              <LoQueTeEspera
                tareas={tareas.lista}
                subir={porSubir(sinSubir, proyectos)}
                apagado={apagado}
                {...(alAbrirProyecto === undefined ? {} : { alAbrirProyecto })}
                proyectos={proyectos}
                alVerTablero={() => setVerTablero(true)}
                {...(alAbrirRevisionDeTarea === undefined ? {} : { alRevisar: alAbrirRevisionDeTarea })}
              />
            ) : (
              <Kanban
                cola={tareas}
                {...(alAbrirSesionDeTarea === undefined ? {} : { alAbrirSesion: alAbrirSesionDeTarea })}
                {...(alAbrirRevisionDeTarea === undefined ? {} : { alAbrirRevision: alAbrirRevisionDeTarea })}
                {...(alReintentarTarea === undefined ? {} : { alReintentar: alReintentarTarea })}
                {...(alDescartarTarea === undefined ? {} : { alDescartar: alDescartarTarea })}
                {...(alTerminarTarea === undefined ? {} : { alTerminar: alTerminarTarea })}
                {...(alEnviarFeedback === undefined ? {} : { alEnviarFeedback })}
                // «Ver lo que hace»: Task 17 lo movió DENTRO de la tarjeta de la cola —
                // `MirarTarea` lo monta `Kanban`, aquí solo se reenvía con sus nombres.
                {...(alMirarTarea === undefined ? {} : { alMirar: alMirarTarea })}
                {...(alDejarDeMirarTarea === undefined ? {} : { alDejarDeMirar: alDejarDeMirarTarea })}
                {...(alIrAlChatDeTarea === undefined ? {} : { alIrAlChat: alIrAlChatDeTarea })}
                {...(mirandoTarea === undefined ? {} : { mirando: mirandoTarea })}
                {...(mirada === undefined ? {} : { mirada })}
                conectado={conectado}
                alPlegar={() => setVerTablero(false)}
              />
            )}

            {asignadas === undefined || verTablero ? null : (
              <DelGestor
                asignadas={asignadas}
                proyectos={proyectos}
                conTarea={new Set((tareas?.lista ?? []).flatMap((t) => (t.ticket === undefined ? [] : [t.ticket.clave])))}
                apagado={apagado}
                {...(alAbrirProyecto === undefined ? {} : { alAbrirEnTareas: (id: string) => alAbrirProyecto(id, "tareas") })}
              />
            )}

            {proyectos.length === 0 ? (
              // Los dos vacíos NO son el mismo, y se distinguen: sin entorno no hay a quién
              // preguntarle por proyectos; con entorno y sin proyectos, el que no tiene es él.
              <p className={estilos.vacio}>
                {entorno === undefined
                  ? "No hay ningún entorno registrado todavía. Se registra en Ajustes, con su URL."
                  : "Este entorno no ha devuelto ningún proyecto."}{" "}
                <button type="button" className={estilos.enlace} onClick={alAbrirAjustes}>
                  Abrir Ajustes
                </button>
              </p>
            ) : (
              <section className={estilos.proyectos} aria-label="proyectos elegidos">
                <div className={estilos.cabeceraDeBloque}>
                  <h2 className={estilos.tituloDeBloque}>Proyectos</h2>
                  {/* Los que quedan FUERA se cuentan, no se pintan: callarlos haría creer que el entorno solo
                      tiene estos, y pintarlos todos desharía la elección. */}
                  {otros.length === 0 ? null : (
                    <p className={estilos.resto}>
                      {otros.length === 1 ? "Otro proyecto del entorno" : `Otros ${otros.length} proyectos del entorno`}{" · "}
                      <button type="button" className={estilos.enlace} onClick={alAbrirAjustes}>
                        Elígelos en Ajustes
                      </button>
                    </p>
                  )}
                </div>
                <ul className={estilos.listaDeProyectos}>
                  {destacados.map((p) => (
                    <li key={p.id} className={estilos.proyecto} data-local={p.local === true ? "" : undefined}>
                      <div className={estilos.cabeceraDeProyecto}>
                        <h3 className={estilos.nombreDeProyecto}>{p.nombre}</h3>
                        {/* De quién es, pegado al NOMBRE; «en tu equipo» es si su copia está bajada
                            aquí, que es lo que decide si empezar descarga algo. Dos preguntas, dos sitios. */}
                        {p.compartido === true ? (
                          <span className={estilos.compartido} role="img" aria-label="compartido contigo" title="Compartido contigo">
                            <IconoCompartido size={14} />
                          </span>
                        ) : null}
                        <span className={estilos.marca} data-local={p.local === true ? "" : undefined}>
                          {p.local === true ? "en tu equipo" : "sin descargar"}
                        </span>
                      </div>
                      {/* Sin las sesiones: seguir una conversación es de la barra lateral, que tiene la lista entera. */}
                      <div className={estilos.accionesDeProyecto}>
                        <button type="button" className={estilos.empezar} disabled={apagado} onClick={() => alNuevaSesion(p.id)}>
                          Nueva sesión
                        </button>
                        {/* Crear una tarea manda algo al servidor: se apaga sin cable, y no se pinta si nadie la atiende. */}
                        {alNuevaTarea === undefined ? null : (
                          <button type="button" className={estilos.empezarTarea} disabled={apagado} onClick={() => alNuevaTarea(p.id)}>
                            Nueva tarea
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* El modelo, dicho una vez y donde se va a usar. Ausente = no hay sesión abierta y
                no se afirma ninguno, la misma regla que la pastilla del compositor. */}
            {modelo === undefined ? null : (
              <p className={estilos.pie}>
                Trabajará con <span className={estilos.modelo}>{modelo}</span>. Se cambia en Ajustes o
                desde la pastilla del compositor.
              </p>
            )}
          </div>

          <aside className={estilos.lateral}>
            <Equipo
              {...(dispositivos === undefined ? {} : { informe: dispositivos })}
              conectado={!apagado}
              {...(alActualizarDispositivos === undefined ? {} : { alActualizar: alActualizarDispositivos })}
              {...(alVerificarDispositivo === undefined ? {} : { alVerificar: alVerificarDispositivo })}
            />

          </aside>
        </div>
      </div>
    </div>
  );
}

const nombreDelProyecto = (proyectos: readonly { id: string; nombre: string }[], id: string, porDefecto: string): string =>
  proyectos.find((p) => p.id === id)?.nombre ?? porDefecto;

/**
 * **Lo que está trabajando AHORA** (su lienzo, 21-10-2026): la primera tarea en marcha, con cuánto lleva y gasta (la MISMA
 * línea que la pestaña Tareas, `EnMarcha`) y cuántas esperan detrás en su proyecto. Sin ninguna en marcha, no se pinta.
 */
function TrabajandoAhora({
  tareas,
  proyectos,
  alIrAlChat,
}: {
  tareas: readonly TareaDelCable[];
  proyectos: readonly { id: string; nombre: string }[];
  alIrAlChat?: (tarea: TareaDelCable) => void;
}) {
  const enMarcha = tareas.filter((t) => t.estado === "en-proceso");
  const primera = enMarcha[0];
  if (primera === undefined) return null;
  const enCola = tareas.filter((t) => t.estado === "nuevo" && t.proyecto === primera.proyecto).length;
  return (
    <section className={estilos.trabajando} aria-label="Trabajando ahora">
      <div className={estilos.cuerpoDeTrabajando}>
        <span className={estilos.rotuloDeTrabajando}>
          {`Trabajando ahora · ${nombreDelProyecto(proyectos, primera.proyecto, primera.proyectoNombre)}`}
          {enMarcha.length > 1 ? ` · y ${enMarcha.length - 1} más` : ""}
        </span>
        <span className={estilos.tituloDeTrabajando}>{primera.titulo}</span>
        {primera.empezada === undefined ? null : <EnMarcha empezada={primera.empezada} gasto={primera.gastoEnCurso} />}
        {enCola === 0 ? null : <span className={estilos.colaDeTrabajando}>{enCola === 1 ? "1 más en cola" : `${enCola} más en cola`}</span>}
      </div>
      {alIrAlChat === undefined || primera.sesion === undefined ? null : (
        <button type="button" className={estilos.empezarTarea} onClick={() => alIrAlChat(primera)}>
          Ver lo que hace
        </button>
      )}
    </section>
  );
}

/**
 * **Lo que queda por subir de cada proyecto a la vista**, con la MISMA foto que su pestaña Resumen (`accion: "resumen"`,
 * `lecturaDeSync` en el servidor): dos pantallas midiendo lo mismo de dos formas acabarían diciendo dos cifras.
 *
 * Solo se piden los que tienen copia local: sin copia no hay nada que subir, y el servidor tampoco lo mide. Se vuelve
 * a pedir al montar el Escritorio —volver a él es volver a mirar— y cuando cambia QUÉ proyectos se enseñan. Devuelve
 * `undefined` mientras no haya ni una medida: «sin subir» no se pinta hasta que algo conste.
 */
function useSinSubir(
  destacados: readonly { id: string; local?: boolean }[],
  alPedirResumen?: (proyecto: string) => Promise<FotoDelResumen | undefined>,
): Readonly<Record<string, EstadoDeSync>> | undefined {
  const fotos = usePorProyecto(destacados, alPedirResumen);
  if (fotos === undefined) return undefined;
  const medidas = Object.fromEntries(Object.entries(fotos).flatMap(([id, f]) => (f.sync === undefined ? [] : [[id, f.sync] as const])));
  return Object.values(medidas).some((m) => typeof m.pendientes === "number") ? medidas : undefined;
}

/**
 * Pedir algo a CADA proyecto a la vista con copia local, y guardar lo que conteste. Se vuelve a pedir al montar el
 * Escritorio —volver a él es volver a mirar— y cuando cambia QUÉ proyectos se enseñan; lo que llega de un montaje ya
 * desmontado se tira. `undefined` mientras no haya contestado ninguno (o sin manejador): lo que no consta no se pinta.
 */
function usePorProyecto<T>(
  destacados: readonly { id: string; local?: boolean }[],
  pedir?: (proyecto: string) => Promise<T | undefined>,
): Readonly<Record<string, T>> | undefined {
  const [respuestas, setRespuestas] = useState<Record<string, T> | undefined>(undefined);
  const conCopia = destacados.filter((p) => p.local === true).map((p) => p.id);
  const clave = conCopia.join("\u0000");
  useEffect(() => {
    if (pedir === undefined || conCopia.length === 0) return;
    let vivo = true;
    void Promise.all(conCopia.map(async (id) => [id, await pedir(id)] as const)).then((pares) => {
      if (!vivo) return;
      const nuevas: Record<string, T> = {};
      for (const [id, r] of pares) if (r !== undefined) nuevas[id] = r;
      setRespuestas(nuevas);
    });
    return () => {
      vivo = false;
    };
    // `clave` resume `conCopia`; el manejador cambia de identidad en cada render de App y no es motivo para volver a pedir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  if (respuestas === undefined) return undefined;
  const deAhora = Object.fromEntries(Object.entries(respuestas).filter(([id]) => conCopia.includes(id)));
  return Object.keys(deAhora).length === 0 ? undefined : deAhora;
}

/** Una fila de «por subir»: un proyecto con ficheros pendientes, de mayor a menor. Un error o un «no consta» no entra. */
export interface PorSubir {
  proyecto: string;
  nombre: string;
  pendientes: number;
  rama?: string;
}

export function porSubir(
  sinSubir: Readonly<Record<string, EstadoDeSync>> | undefined,
  proyectos: readonly { id: string; nombre: string }[],
): PorSubir[] {
  if (sinSubir === undefined) return [];
  return Object.entries(sinSubir)
    .filter(([, m]) => m.error === undefined && typeof m.pendientes === "number" && m.pendientes > 0)
    .map(([id, m]) => ({
      proyecto: id,
      nombre: proyectos.find((p) => p.id === id)?.nombre ?? id,
      pendientes: m.pendientes!,
      ...(m.rama === undefined ? {} : { rama: m.rama }),
    }))
    .sort((a, b) => b.pendientes - a.pendientes);
}

/** Una fila de «Lo que te espera»: QUÉ tarea, de qué clase y la frase que lo explica. */
export interface Espera {
  tarea: TareaDelCable;
  clase: "espera" | "pausa" | "avisos";
  detalle: string;
}

/** Cuánto sigue en la bandeja una terminada con avisos: lo de ayer aún se revisa, lo de la semana pasada ya no espera. */
export const VENTANA_DE_AVISOS_MS = 24 * 60 * 60 * 1000;

/**
 * **Lo que espera a una PERSONA**, y solo lo que un campo de la tarea dice (lienzo, «C · Centro de control»):
 *
 * - `espera`: una `nuevo` con `esperaPorTi` — el SERVIDOR dice que no arranca sin alguien de esta consola.
 * - `pausa`: una `requiere-atencion` — parada, con su `motivo` si lo trae.
 * - `avisos`: una `terminada` en las últimas `VENTANA_DE_AVISOS_MS` cuyo juez dijo rojo o no se entendió, o que se
 *   cerró con críticos. Una terminada en verde NO es «por revisar»: ningún campo dice que alguien la tenga pendiente,
 *   y pintarlas todas convertiría la bandeja en el histórico.
 *
 * Primero lo que bloquea (espera, pausa) y después lo que solo avisa.
 */
export function loQueTeEspera(tareas: readonly TareaDelCable[], ahora: number): Espera[] {
  const filas: Espera[] = [];
  for (const t of tareas) {
    if (t.estado === "nuevo" && t.esperaPorTi !== undefined) {
      filas.push({ tarea: t, clase: "espera", detalle: `Esperando: ${t.esperaPorTi.motivo}` });
    } else if (t.estado === "requiere-atencion") {
      filas.push({ tarea: t, clase: "pausa", detalle: t.motivo ?? "En pausa." });
    } else if (t.estado === "terminada" && t.acabada !== undefined && ahora - Date.parse(t.acabada) <= VENTANA_DE_AVISOS_MS) {
      const criticos = t.cierre?.criticos.length ?? 0;
      const juezEnContra = t.veredicto !== undefined && t.veredicto.veredicto !== "verde";
      if (juezEnContra || criticos > 0) {
        filas.push({
          tarea: t,
          clase: "avisos",
          detalle: juezEnContra
            ? t.veredicto!.resumen
            : criticos === 1
              ? "Se cerró con 1 crítico."
              : `Se cerró con ${criticos} críticos.`,
        });
      }
    }
  }
  const orden = { espera: 0, pausa: 1, avisos: 2 } as const;
  return filas.sort((a, b) => orden[a.clase] - orden[b.clase]);
}

/**
 * **Las cifras de arriba**, y solo las que tienen dato detrás: sin cola no hay cifras de tareas, sin foto de la máquina
 * no hay de aparatos. Lo que el lienzo ponía y aún no viaja (sin subir, gasto) no se pinta — ni a cero.
 */
function Cifras({
  tareas,
  dispositivos,
  sinSubir,
}: {
  tareas?: readonly TareaDelCable[];
  dispositivos?: InformeDeDispositivos;
  sinSubir?: Readonly<Record<string, EstadoDeSync>>;
}) {
  if (tareas === undefined && dispositivos === undefined && sinSubir === undefined) return null;
  const de = (e: TareaDelCable["estado"]) => (tareas ?? []).filter((t) => t.estado === e).length;
  const espera = tareas === undefined ? [] : loQueTeEspera(tareas, Date.now());
  // Los proyectos con algo por subir también te esperan: son filas de la misma bandeja.
  const porSubirN = sinSubir === undefined ? 0 : porSubir(sinSubir, []).length;
  const pausas = espera.filter((e) => e.clase !== "avisos").length;
  const avisos = espera.length - pausas;
  const listos = dispositivos?.dispositivos.filter((d) => d.estado === "conectado" || d.estado === "arrancado").length ?? 0;
  const cifras: { rotulo: string; valor: number; nota: string; tono?: string }[] = [];
  if (tareas !== undefined) {
    const cola = de("nuevo");
    cifras.push(
      { rotulo: "En marcha", valor: de("en-proceso"), nota: cola === 0 ? "nada en cola" : `${cola} en cola`, tono: "marcha" },
      {
        rotulo: "Te esperan",
        valor: espera.length + porSubirN,
        nota:
          espera.length + porSubirN === 0
            ? "nada pendiente"
            : [pausas > 0 ? `${pausas} paradas` : "", avisos > 0 ? `${avisos} con avisos` : "", porSubirN > 0 ? `${porSubirN} por subir` : ""]
                .filter(Boolean)
                .join(" · "),
        tono: "espera",
      },
      { rotulo: "Terminadas", valor: de("terminada"), nota: "en la cola" },
    );
  }
  if (sinSubir !== undefined) {
    // Solo lo MEDIDO: un proyecto cuya foto trae error o no sabe su cifra no suma, ni como cero.
    const medidos = Object.values(sinSubir).filter((m) => m.error === undefined && typeof m.pendientes === "number");
    const total = medidos.reduce((n, m) => n + m.pendientes!, 0);
    const con = medidos.filter((m) => m.pendientes! > 0).length;
    cifras.push({
      rotulo: "Sin subir",
      valor: total,
      nota: total === 0 ? "todo subido" : con === 1 ? "en 1 proyecto" : `en ${con} proyectos`,
      tono: "subir",
    });
  }
  if (dispositivos !== undefined) {
    cifras.push({ rotulo: "Aparatos listos", valor: listos, nota: "encendidos", tono: "listos" });
  }
  return (
    <dl className={estilos.cifras} aria-label="Resumen">
      {cifras.map((c) => (
        <div key={c.rotulo} className={estilos.cifra} data-tono={c.valor > 0 ? c.tono : undefined}>
          <dt>{c.rotulo}</dt>
          <dd>{c.valor}</dd>
          <dd className={estilos.notaDeCifra}>{c.nota}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * **La bandeja** (lienzo C): lo que `loQueTeEspera` devuelve, una fila por tarea con UNA acción. Lo que pide más que un
 * botón —contestar, reintentar, dar por bueno— vive en el tablero, y la acción lleva allí; una terminada con avisos se
 * revisa en su pestaña Revisión si tiene sesión.
 */
function LoQueTeEspera({
  tareas,
  subir,
  apagado,
  alAbrirProyecto,
  proyectos,
  alVerTablero,
  alRevisar,
}: {
  tareas: readonly TareaDelCable[];
  /** Los proyectos con ficheros por subir (`porSubir`), después de las tareas: avisan, no bloquean. */
  subir: readonly PorSubir[];
  apagado: boolean;
  alAbrirProyecto?: (proyecto: string) => void;
  proyectos: readonly { id: string; nombre: string }[];
  alVerTablero: () => void;
  alRevisar?: (proyecto: string, sesion: string) => void;
}) {
  const filas = loQueTeEspera(tareas, Date.now());
  return (
    <section className={estilos.bandeja} aria-label="Lo que te espera">
      <div className={estilos.cabeceraDeBloque}>
        <h2 className={estilos.tituloDeBloque}>Lo que te espera</h2>
        <button type="button" className={estilos.enlace} onClick={alVerTablero}>
          Ver el tablero
        </button>
      </div>
      {filas.length === 0 && subir.length === 0 ? (
        <p className={estilos.vacio}>Nada pendiente de ti.</p>
      ) : (
        <ul className={estilos.listaDeEspera}>
          {filas.map(({ tarea: t, clase, detalle }) => {
            const revisar = clase === "avisos" && alRevisar !== undefined && t.sesion !== undefined;
            return (
              <li key={t.id} className={estilos.filaDeEspera} data-clase={clase}>
                <span className={estilos.iconoDeEspera} aria-hidden="true">
                  {clase === "avisos" ? "!" : clase === "pausa" ? "‖" : "?"}
                </span>
                <span className={estilos.textoDeEspera}>
                  <span className={estilos.tituloDeEspera}>{t.titulo}</span>
                  <span className={estilos.detalleDeEspera}>
                    {`${nombreDelProyecto(proyectos, t.proyecto, t.proyectoNombre)} · ${detalle}`}
                  </span>
                </span>
                <button
                  type="button"
                  className={estilos.empezarTarea}
                  onClick={() => (revisar ? alRevisar!(t.proyecto, t.sesion!) : alVerTablero())}
                >
                  {revisar ? "Revisar" : clase === "pausa" ? "Atender" : "Ver en el tablero"}
                </button>
              </li>
            );
          })}
          {subir.map((s) => (
            <li key={`subir-${s.proyecto}`} className={estilos.filaDeEspera} data-clase="subir">
              <span className={estilos.iconoDeEspera} aria-hidden="true">
                ↑
              </span>
              <span className={estilos.textoDeEspera}>
                <span className={estilos.tituloDeEspera}>
                  {s.pendientes === 1 ? "1 fichero sin subir a CloudStudio" : `${s.pendientes} ficheros sin subir a CloudStudio`}
                </span>
                <span className={estilos.detalleDeEspera}>{s.rama === undefined ? s.nombre : `${s.nombre} · a «${s.rama}»`}</span>
              </span>
              {/* Subir se hace desde SU panel (Resumen o Sincronización), con su diff delante: aquí solo se va allí. */}
              {alAbrirProyecto === undefined ? null : (
                <button type="button" className={estilos.empezarTarea} disabled={apagado} onClick={() => alAbrirProyecto(s.proyecto)}>
                  Abrir el proyecto
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Cuántas filas del gestor se enseñan antes de contar el resto: el Escritorio resume, la pestaña Tareas lista. */
export const TOPE_DEL_GESTOR = 6;

/**
 * **Del gestor** (lienzo C): lo ASIGNADO a la persona en el gestor de cada proyecto a la vista, sin las que ya son una
 * tarea de la cola (`TareaDelCable.ticket`). Cada fila lleva a la pestaña Tareas de su proyecto, donde está «Nueva
 * sesión con esta tarea» con su tarjeta: empezar escribe en el gestor, y eso no se hace desde un resumen.
 *
 * Un proyecto sin gestor que sepa decir «asignadas a mí» no aparece; uno que falló lo DICE con su motivo. Sin ningún
 * proyecto con gestor, el bloque no se pinta.
 */
function DelGestor({
  asignadas,
  proyectos,
  conTarea,
  apagado,
  alAbrirEnTareas,
}: {
  asignadas: Readonly<Record<string, AsignadasDelProyecto>>;
  proyectos: readonly { id: string; nombre: string }[];
  conTarea: ReadonlySet<string>;
  apagado: boolean;
  alAbrirEnTareas?: (proyecto: string) => void;
}) {
  const conGestor = Object.entries(asignadas).filter(([, a]) => a.lista !== undefined || a.error !== undefined);
  if (conGestor.length === 0) return null;
  const nombre = (id: string) => proyectos.find((p) => p.id === id)?.nombre ?? id;
  const filas = conGestor.flatMap(([id, a]) =>
    (a.lista ?? []).filter((t) => !conTarea.has(t.clave)).map((t) => ({ proyecto: id, conector: a.conector, tarea: t })),
  );
  const fallos = conGestor.filter(([, a]) => a.error !== undefined);
  const conectores = [...new Set(conGestor.flatMap(([, a]) => (a.conector === undefined ? [] : [a.conector])))];
  return (
    <section className={estilos.bandeja} aria-label="Del gestor">
      <div className={estilos.cabeceraDeBloque}>
        <h2 className={estilos.tituloDeBloque}>Del gestor</h2>
        <span className={estilos.resto}>{`${conectores.join(" y ")} · asignadas a ti, sin tarea`}</span>
      </div>
      {filas.length === 0 && fallos.length === 0 ? (
        <p className={estilos.vacio}>Nada asignado a ti que no sea ya una tarea.</p>
      ) : (
        <ul className={estilos.listaDeEspera}>
          {filas.slice(0, TOPE_DEL_GESTOR).map(({ proyecto, tarea: t }) => (
            <li key={`${proyecto}-${t.clave}`} className={estilos.filaDeEspera} data-clase="gestor">
              <span className={estilos.claveDelGestor}>{t.etiqueta ?? t.clave}</span>
              <span className={estilos.textoDeEspera}>
                <span className={estilos.tituloDeEspera}>{t.titulo}</span>
                <span className={estilos.detalleDeEspera}>{`${nombre(proyecto)} · ${t.estado}`}</span>
              </span>
              {alAbrirEnTareas === undefined ? null : (
                <button type="button" className={estilos.empezarTarea} disabled={apagado} onClick={() => alAbrirEnTareas(proyecto)}>
                  Abrir en Tareas
                </button>
              )}
            </li>
          ))}
          {filas.length > TOPE_DEL_GESTOR ? (
            <li className={estilos.filaDeEspera} data-clase="resto">
              <span className={estilos.detalleDeEspera}>{`Y ${filas.length - TOPE_DEL_GESTOR} más en la pestaña Tareas de cada proyecto.`}</span>
            </li>
          ) : null}
          {fallos.map(([id, a]) => (
            <li key={`fallo-${id}`} className={estilos.filaDeEspera} data-clase="fallo">
              <span className={estilos.detalleDeEspera} role="alert">{`${a.conector ?? "El gestor"} de ${nombre(id)}: no se pudo leer (${a.error}).`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
