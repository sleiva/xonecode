import { useContext, useEffect, useState } from "react";
import { DisenoDeTareasContexto } from "../disenoContexto.js";
import { ListaDePantallas, SelectorDePantalla } from "./DisenoDelProyecto.js";
import { Modal, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { TRANSICIONES, puedeEditarEncargo, type TareaDelCable } from "../tipos.js";
import estilos from "./AccionesDeTarea.module.css";
// La coraza del modal —capa, velo, ventana, título, nota, acciones, el botón primario— es
// la de `NuevaSesion.module.css`, la MISMA que reutiliza `AccionDeSesion.tsx` para
// confirmar el borrado de una sesión: «es el mismo modal, y dos copias del mismo velo es
// cómo se acaba con dos velos distintos». Descartar una tarea es la misma clase de
// decisión —irreversible, sin papelera— así que es el mismo camino y no una ventana nueva.
import modal from "./NuevaSesion.module.css";

/**
 * Las acciones de una tarea, UNA sola pieza para el kanban del escritorio
 * (`Kanban.tsx`) y la lista del proyecto (`TareasDelProyecto.tsx`).
 *
 * **De dónde sale.** Antes cada vista tenía su propia mitad: la lista ofrecía
 * `reintentar`/`terminar` y no feedback, el kanban ofrecía feedback y no
 * `reintentar`/`terminar` — así que una tarea bloqueada solo se desbloqueaba desde UNA de
 * las dos pantallas, y quien estuviera en la otra no tenía camino. No se arregla
 * duplicando las cuatro acciones en dos sitios —es como las dos copias divergieron la
 * primera vez—: se arregla con esta pieza, el mismo patrón que `Arbol.tsx` entre Ficheros
 * y Revisión.
 *
 * **Qué se ofrece, derivado de `TRANSICIONES` y no de lo que las pantallas hacían antes.**
 * `core/tareas.ts` es explícito: «las dos salidas de una tarea aparcada: reintentar, o
 * darla por buena a mano» — es decir, reintentar y terminar son manuales SOLO desde
 * `requiere-atencion`, porque el CORREDOR es dueño de las transiciones que salen de
 * `nuevo` y de `en-proceso` (arrancarla, acabarla solo). La comprobación contra
 * `TRANSICIONES["requiere-atencion"]` no es decoración: si esa tabla cambiara mañana, el
 * botón se apagaría solo en vez de quedarse ofreciendo una transición que `conEstado`
 * rechazaría. El feedback comparte la misma condición que reintentar porque
 * `core/tareas.ts#conFeedback` también deja la tarea en `nuevo`.
 *
 * **Descartar es la excepción**, y por diseño: «Descartar BORRA y no comprueba el
 * estado —no hay "cancelada" en `core/tareas.ts`— ni siquiera si está `en-proceso`»
 * (`web/servidor/arranque.ts#atenderAccionDeTarea`). Antes la lista lo restringía a
 * `estado !== "en-proceso"`, una regla que la propia pantalla se inventó y que el
 * servidor nunca aplicó: se retira aquí, porque un control que promete menos de lo que
 * el servidor de verdad hace es la misma mentira que uno que promete de más.
 *
 * **`conectado` apaga lo que manda algo al servidor y lo DICE**, la regla de `Barra` y
 * `Escritorio`: un botón vivo sin cable se pulsa, no pasa nada, y no hay forma de saber si
 * falló el botón o el servidor. El aviso vive dentro del propio grupo — no en cada
 * botón por separado, que sería el mismo aviso repetido cuatro veces sin decir nada
 * distinto cada vez.
 *
 * **Descartar confirma en una VENTANA, no en la fila.** Antes era una fila de dos botones
 * («¿Borrar la tarea? / Sí, descartar / Cancelar») dentro del mismo hueco estrecho —una
 * tarjeta del kanban o una fila de lista—, y esta pieza ahora ofrece descartar en TODOS los
 * estados, incluido `en-proceso`: la misma razón por la que una sesión se borra desde una
 * ventana y no al primer clic de su «…» — «eliminar al primer clic en una fila de 34 px es
 * cómo se pierde la conversación de una tarde» — aplica igual aquí, y la tarjeta del kanban
 * es tan estrecha como esa fila.
 *
 * **Y desde Task 14, lo que la ventana DICE es corto porque ya es verdad entera.** La
 * primera versión de esta ventana tenía que avisar de que una tarea `en-proceso` seguía
 * corriendo —y escribiendo en el proyecto— DESPUÉS de descartarla, porque
 * `atenderAccionDeTarea("descartar")` solo borraba del índice sin tocar el turno. Ese aviso
 * era honesto pero describía un FALLO, no una advertencia razonable — «esto va a seguir
 * escribiendo en tu proyecto y no vas a verlo» es la confesión de algo que se puede
 * arreglar, no el precio de borrar. Se arregló ahí, no aquí: `web/servidor/arranque.ts`
 * ahora espera a `Corredor.cortar(id)` —que aborta el turno de verdad y espera a que la
 * consola suelte su montaje de `/adjuntos/`— ANTES de `borrarTarea`. Con eso, la única
 * frase que la ventana necesita decir es la misma para todos los estados: se para el turno
 * si está en marcha, y se borra todo. Dejar el párrafo viejo puesto habría sido la trampa
 * de siempre: un aviso que describe una versión del producto que ya no existe.
 */
export function AccionesDeTarea({
  tarea: t,
  conectado,
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
  sinFeedback,
}: {
  tarea: TareaDelCable;
  /** Si el cable está vivo. Ausente = se asume conectado — es lo que vale hoy para quien
   *  aún no lo sabe, y las dos vistas ya lo pasan de verdad desde `estado.conectado`. */
  conectado?: boolean;
  /** `requiere-atencion → nuevo`: devuelve una tarea aparcada a la cola. Ausente = no se
   *  ofrece. */
  alReintentar?: (id: string) => void;
  /** Borra la tarea. No comprueba el estado, a propósito. Ausente = no se ofrece. */
  alDescartar?: (id: string) => void;
  /** `requiere-atencion → terminada`: la persona da el trabajo por bueno sin reintentar.
   *  Ausente = no se ofrece. */
  alTerminar?: (id: string) => void;
  /** «Se edita la tarea y se agrega el feedback del usuario»: la devuelve al lazo, en su
   *  mismo hilo. Ausente = no se ofrece — la aparcada cae a la pista de siempre. */
  alEnviarFeedback?: (id: string, texto: string) => void;
  /** Seguir una aparcada SIN escribir nada: entra en su hilo un «continúa». Devuelve el motivo si el servidor se negó. */
  alContinuar?: (id: string) => Promise<string | undefined>;
  /** «Arrancar ahora» una `nuevo`: la persona cede el proyecto (se cierra su consola de ahí) y la tarea arranca. */
  alArrancarAhora?: (id: string) => Promise<string | undefined>;
  /** Cambiar el encargo de una que nunca ha arrancado (IXCODE-52). Devuelve el motivo si el servidor se negó. */
  alEditarEncargo?: (id: string, encargo: string, peticion: string, pantallas?: { name: string; titulo: string }[] | null) => Promise<string | undefined>;
  /** Volver a preparar el encargo desde la petición, SIN guardarlo (IXCODE-53). Ausente = no se ofrece. */
  alRegenerarEncargo?: (id: string, peticion: string) => Promise<{ encargo: string } | { motivo: string }>;
  /**
   * PARAR una en marcha sin borrarla (IXCODE-50): corta su turno y la deja aparcada con su
   * conversación, de donde se sigue con «Continuar». Sin ventana de confirmación, a diferencia de
   * «Descartar»: se deshace. Devuelve el motivo si el servidor se negó.
   */
  alParar?: (id: string) => Promise<string | undefined>;
  /** Es la primera de su cadena (`puedeArrancarYa`): las encadenadas esperan a la anterior y no ofrecen arrancar. */
  puedeArrancar?: boolean;
  /**
   * Sin campo de feedback ni su pista: escribir se hace en el CHAT de la tarea («Ir al chat para
   * responder»), y repetirlo en la lista era el mismo campo dos veces. Los botones rápidos siguen.
   */
  sinFeedback?: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [negativa, setNegativa] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const pedir = (accion: (id: string) => Promise<string | undefined>): void => {
    if (enviando) return;
    setEnviando(true);
    setNegativa(undefined);
    void accion(t.id)
      .catch(() => "el envío falló")
      .then((motivo) => {
        setEnviando(false);
        if (motivo !== undefined) setNegativa(motivo);
      });
  };
  const apagado = conectado === false;

  const destinos = TRANSICIONES[t.estado];
  const aparcada = t.estado === "requiere-atencion";
  const ofrecerReintentar = aparcada && destinos.includes("nuevo") && alReintentar !== undefined;
  const ofrecerTerminar = aparcada && destinos.includes("terminada") && alTerminar !== undefined;
  const ofrecerFeedback = aparcada && destinos.includes("nuevo") && alEnviarFeedback !== undefined && sinFeedback !== true;
  const pistaDeFeedback = aparcada && destinos.includes("nuevo") && alEnviarFeedback === undefined && sinFeedback !== true;
  const ofrecerDescartar = alDescartar !== undefined;
  const ofrecerContinuar = aparcada && destinos.includes("nuevo") && alContinuar !== undefined;
  // Lo que la frena es una persona de esta consola (`esperaPorTi`, del servidor): se dice, en vez de quedarse muda en
  // «Nuevo», y «Arrancar ahora» solo cuando ceder el proyecto la desbloquea — con un turno en marcha se negaría.
  const avisoDeEspera = t.estado === "nuevo" && puedeArrancar === true ? t.esperaPorTi : undefined;
  const ofrecerArrancar = avisoDeEspera?.ceder === true && alArrancarAhora !== undefined;
  const ofrecerEditar = puedeEditarEncargo(t) && alEditarEncargo !== undefined;
  const ofrecerParar = t.estado === "en-proceso" && alParar !== undefined;

  if (
    !ofrecerReintentar &&
    !ofrecerTerminar &&
    !ofrecerFeedback &&
    !pistaDeFeedback &&
    !ofrecerDescartar &&
    !ofrecerContinuar &&
    !ofrecerArrancar &&
    // Sin botón, el porqué de la espera se sigue diciendo: es justo el caso del turno en marcha.
    avisoDeEspera === undefined &&
    !ofrecerEditar &&
    !ofrecerParar
  ) {
    return null;
  }

  return (
    <div className={estilos.acciones} role="group" aria-label="Acciones de la tarea">
      {apagado ? (
        <p className={estilos.avisoConexion}>Sin conexión: no se puede mandar nada hasta reconectar.</p>
      ) : null}
      {avisoDeEspera === undefined ? null : <p className={estilos.pista}>Esperando: {avisoDeEspera.motivo}.</p>}
      {ofrecerArrancar ? (
        <button
          type="button"
          className={estilos.boton}
          disabled={apagado || enviando}
          title="Cierra tu conversación en este proyecto (queda guardada) y arranca la tarea"
          onClick={() => pedir(alArrancarAhora!)}
        >
          Arrancar ahora
        </button>
      ) : null}
      {ofrecerParar ? (
        <button
          type="button"
          className={estilos.boton}
          disabled={apagado || enviando}
          title="Corta su turno y la deja esperando, con su conversación: se sigue con «Continuar»"
          onClick={() => pedir(alParar!)}
        >
          {enviando ? "Parando…" : "Parar"}
        </button>
      ) : null}
      {ofrecerEditar ? (
        <>
          <button type="button" className={estilos.boton} disabled={apagado} onClick={() => setEditando(true)}>
            Editar la tarea
          </button>
          {editando ? (
            <EditarEncargo
              tarea={t}
              apagado={apagado}
              onCancelar={() => setEditando(false)}
              onGuardar={async (encargo, peticion, pantallas) => {
                const motivo = await (pantallas === undefined
                  ? alEditarEncargo!(t.id, encargo, peticion)
                  : alEditarEncargo!(t.id, encargo, peticion, pantallas)
                ).catch(() => "el envío falló");
                if (motivo === undefined) setEditando(false);
                return motivo;
              }}
              {...(alRegenerarEncargo === undefined ? {} : { onRegenerar: (peticion: string) => alRegenerarEncargo(t.id, peticion) })}
            />
          ) : null}
        </>
      ) : null}
      {ofrecerContinuar ? (
        <button type="button" className={estilos.boton} disabled={apagado || enviando} onClick={() => pedir(alContinuar!)}>
          Continuar
        </button>
      ) : null}
      {ofrecerReintentar ? (
        <button type="button" className={estilos.boton} disabled={apagado} onClick={() => alReintentar!(t.id)}>
          Reintentar
        </button>
      ) : null}
      {ofrecerTerminar ? (
        <button type="button" className={estilos.boton} disabled={apagado} onClick={() => alTerminar!(t.id)}>
          Dar por bueno
        </button>
      ) : null}
      {!ofrecerDescartar ? null : (
        <>
          <button type="button" className={estilos.boton} disabled={apagado} onClick={() => setConfirmando(true)}>
            Descartar
          </button>
          {confirmando ? (
            <ConfirmarDescarte
              tarea={t}
              onCancelar={() => setConfirmando(false)}
              onConfirmar={() => {
                alDescartar!(t.id);
                setConfirmando(false);
              }}
            />
          ) : null}
        </>
      )}
      {ofrecerFeedback ? (
        <FormularioDeFeedback id={t.id} apagado={apagado} alEnviar={alEnviarFeedback!} />
      ) : pistaDeFeedback ? (
        <p className={estilos.pista}>Se resuelve editando la tarea para añadir tu feedback: sigue desde ahí.</p>
      ) : null}
      {negativa !== undefined ? (
        <p className={estilos.pista} role="alert">{`No se pudo: ${negativa}`}</p>
      ) : null}
    </div>
  );
}

/**
 * La ventana que confirma descartar una tarea. Reutiliza la coraza de
 * `NuevaSesion.module.css` (`capa`/`velo`/`ventana`/`titulo`/`nota`/`acciones`/`accion`) tal
 * cual la usa `AccionDeSesion.tsx` para lo mismo con una sesión — mismo modal, mismo motivo:
 * dos copias del mismo velo es cómo se acaba con dos velos distintos.
 *
 * **Una sola frase para los cuatro estados, y no una condicional por `en-proceso`.** Antes
 * de Task 14 hacía falta un párrafo aparte para avisar de que el turno de una `en-proceso`
 * seguía corriendo tras el borrado; ahora el servidor lo corta ANTES de borrar
 * (`web/servidor/arranque.ts#atenderAccionDeTarea`), así que la frase de siempre ya es
 * cierta para las cuatro: el turno se para si está en marcha, y se borra todo.
 */
function ConfirmarDescarte({
  tarea: t,
  onCancelar,
  onConfirmar,
}: {
  tarea: TareaDelCable;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Modal open onClose={onCancelar} title="Descartar tarea" headless className={modal.capa}>
      <div
        className={modal.velo}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget) onCancelar();
        }}
      >
        <div className={modal.ventana}>
          <h2 className={modal.titulo}>Descartar tarea</h2>
          <p className={modal.nota}>
            Se para el turno de «{t.titulo}» si está en marcha, y se borra todo: el encargo
            y sus adjuntos. No hay papelera.
          </p>
          <div className={modal.acciones}>
            <Button variant="outline" className={modal.accion} onClick={onCancelar}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className={`${modal.accion} ${modal.principal} ${estilos.destructiva}`}
              onClick={onConfirmar}
            >
              Sí, descartar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * La ventana que edita una tarea que todavía no ha arrancado (IXCODE-52, IXCODE-53). Antes solo se
 * podía ver el encargo, arrancarla o descartarla, y corregir una frase obligaba a descartar y volver
 * a crearla (con sus adjuntos).
 *
 * Dos campos, como al crearla: **lo que pediste** (la petición, de la que sale el título) y el
 * **encargo** que se le manda al agente. «Regenerar el encargo» lo vuelve a preparar desde la
 * petición con el mismo aumentador que al crearla, y solo RELLENA el campo: no se guarda nada hasta
 * «Guardar». La misma coraza que confirmar el descarte, más ancha: un encargo son párrafos. Guardar
 * NO cierra hasta que el servidor dice que sí; una negativa (la tarea arrancó entre medias) se
 * enseña dentro, con lo escrito intacto.
 */
function EditarEncargo({
  tarea: t,
  apagado,
  onCancelar,
  onGuardar,
  onRegenerar,
}: {
  tarea: TareaDelCable;
  apagado: boolean;
  onCancelar: () => void;
  /** `pantallas`: las nuevas, `null` si se quitaron todas, ausente si no cambiaron. */
  onGuardar: (encargo: string, peticion: string, pantallas?: { name: string; titulo: string }[] | null) => Promise<string | undefined>;
  /** Vuelve a preparar el encargo desde la petición. Ausente = no se ofrece. */
  onRegenerar?: (peticion: string) => Promise<{ encargo: string } | { motivo: string }>;
}) {
  const [peticion, setPeticion] = useState(t.peticion);
  const [texto, setTexto] = useState(t.encargo);
  const [guardando, setGuardando] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [negativa, setNegativa] = useState<string | undefined>(undefined);
  /**
   * La pantalla de Stitch, que también se CAMBIA aquí (petición suya): la misma pestaña Diseño que en «Nueva tarea», y
   * solo con un proyecto de Stitch vinculado (lo dice el diseño del contexto, que se pide al abrir).
   */
  const contexto = useContext(DisenoDeTareasContexto);
  const disenoDeLaTarea = contexto?.diseno?.proyecto === t.proyecto ? contexto.diseno : undefined;
  const conDiseno = contexto !== undefined && disenoDeLaTarea?.vinculo !== undefined && disenoDeLaTarea.vinculo !== null;
  const [pantallas, setPantallas] = useState<{ name: string; titulo: string }[]>(
    (t.pantallasDeStitch ?? []).map((p) => ({ name: p.name, titulo: p.titulo }))
  );
  const [pestana, setPestana] = useState<"tarea" | "diseno">("tarea");
  useEffect(() => {
    contexto?.pedirPantallas(t.proyecto);
    // Una vez al abrir el diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Cambia si cambia la LISTA o su ORDEN: el orden dice qué maqueta va a `diseno/` y cuáles a `diseno/2/`…
  const pantallaCambiada =
    pantallas.map((p) => p.name).join("\n") !== (t.pantallasDeStitch ?? []).map((p) => p.name).join("\n");
  const limpio = texto.trim();
  const pedido = peticion.trim();
  const sinCambios = limpio === t.encargo.trim() && pedido === t.peticion.trim() && !pantallaCambiada;
  const ocupado = guardando || regenerando;
  return (
    <Modal open onClose={onCancelar} title="Editar la tarea" headless className={modal.capa}>
      <div
        className={modal.velo}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget && !ocupado) onCancelar();
        }}
      >
        <form
          className={`${modal.ventana} ${estilos.ventanaAncha}`}
          onSubmit={(evento) => {
            evento.preventDefault();
            if (limpio === "" || pedido === "" || sinCambios || apagado || ocupado) return;
            setGuardando(true);
            setNegativa(undefined);
            void (pantallaCambiada ? onGuardar(limpio, pedido, pantallas.length === 0 ? null : pantallas) : onGuardar(limpio, pedido)).then((motivo) => {
              setGuardando(false);
              if (motivo !== undefined) setNegativa(motivo);
            });
          }}
        >
          <h2 className={modal.titulo}>Editar la tarea</h2>
          <p className={modal.nota}>
            {`«${t.titulo}» todavía no ha arrancado. Lo que pediste es de donde sale el encargo; el encargo es lo que se le mandará al agente.`}
          </p>
          {!conDiseno ? null : (
            <div className={estilos.pestanas} role="tablist" aria-label="Editar la tarea">
              <button type="button" role="tab" className={estilos.pestana} aria-selected={pestana === "tarea"} {...(pestana === "tarea" ? { "data-actual": "" } : {})} onClick={() => setPestana("tarea")}>
                Tarea
              </button>
              <button type="button" role="tab" className={estilos.pestana} aria-selected={pestana === "diseno"} {...(pestana === "diseno" ? { "data-actual": "" } : {})} onClick={() => setPestana("diseno")}>
                {pantallas.length === 0
                  ? "Diseño (Stitch)"
                  : pantallas.length === 1
                    ? `Diseño · «${pantallas[0]!.titulo}»`
                    : `Diseño · ${pantallas.length} pantallas`}
              </button>
            </div>
          )}
          {pestana === "diseno" && conDiseno ? (
            <SelectorDePantalla
              {...(disenoDeLaTarea === undefined ? {} : { diseno: disenoDeLaTarea })}
              alPedir={() => contexto!.pedirPantallas(t.proyecto)}
              elegidas={pantallas}
              alCambiar={setPantallas}
            />
          ) : (
            <>
          <label className={modal.etiqueta} htmlFor={`peticion-${t.id}`}>
            Lo que pediste
          </label>
          <textarea
            id={`peticion-${t.id}`}
            className={`${modal.campo} ${estilos.campoPeticion}`}
            value={peticion}
            disabled={apagado || ocupado}
            onChange={(evento) => setPeticion(evento.target.value)}
          />
          {onRegenerar === undefined ? null : (
            <div className={estilos.regenerar}>
              <Button
                type="button"
                variant="outline"
                className={modal.accion}
                disabled={pedido === "" || apagado || ocupado}
                onClick={() => {
                  setRegenerando(true);
                  setNegativa(undefined);
                  void onRegenerar(pedido)
                    .catch(() => ({ motivo: "el envío falló" }))
                    .then((r) => {
                      setRegenerando(false);
                      if ("encargo" in r) setTexto(r.encargo);
                      else setNegativa(r.motivo);
                    });
                }}
              >
                {regenerando ? "Preparando el encargo…" : "Regenerar el encargo"}
              </Button>
              <span className={modal.nota}>Sustituye el encargo de abajo por uno nuevo preparado desde lo que pediste.</span>
            </div>
          )}
          <label className={modal.etiqueta} htmlFor={`encargo-${t.id}`}>
            Encargo
          </label>
          <textarea
            id={`encargo-${t.id}`}
            className={`${modal.campo} ${estilos.campoEncargo}`}
            value={texto}
            disabled={apagado || ocupado}
            onChange={(evento) => setTexto(evento.target.value)}
          />
              {!conDiseno ? null : (
                pantallas.length > 1 ? (
                  <div className={modal.nota} data-diseno="">
                    Diseño, una pantalla cada una:
                    <ListaDePantallas pantallas={pantallas} />
                  </div>
                ) : (
                <p className={modal.nota} data-diseno="">
                  {pantallas.length === 0 ? "Sin diseño de Stitch: elígelo en la pestaña Diseño." : `Diseño: «${pantallas[0]!.titulo}».`}
                </p>
                )
              )}
            </>
          )}
          {pedido === "" ? <p className={modal.fallo}>Lo que pediste no puede quedar vacío.</p> : null}
          {limpio === "" ? <p className={modal.fallo}>El encargo no puede quedar vacío.</p> : null}
          {negativa === undefined ? null : (
            <p className={modal.fallo} role="alert">{`No se pudo: ${negativa}`}</p>
          )}
          <div className={modal.acciones}>
            <Button type="button" variant="outline" className={modal.accion} disabled={ocupado} onClick={onCancelar}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              className={`${modal.accion} ${modal.principal}`}
              disabled={limpio === "" || pedido === "" || sinCambios || apagado || ocupado}
            >
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

/**
 * El campo de feedback: una frase, no una decisión con diff — por eso es un `<textarea>` y
 * un botón, sin modal (§0 del diseño).
 *
 * **El vacío se rechaza AQUÍ TAMBIÉN**, y no solo en el servidor: `aplicarFeedback`
 * (`agent/tareasEnDisco.ts`) ya lo rechaza y lo dice, pero mandarlo igual y esperar a que
 * el servidor lo diga por un acto de sistema —en una ventana que no pinta el
 * transcript— sería mudo.
 */
function FormularioDeFeedback({
  id,
  apagado,
  alEnviar,
}: {
  id: string;
  apagado: boolean;
  alEnviar: (id: string, texto: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const limpio = texto.trim();
  return (
    <form
      className={estilos.feedback}
      onSubmit={(evento) => {
        evento.preventDefault();
        if (limpio === "" || apagado) return;
        alEnviar(id, limpio);
        setTexto("");
      }}
    >
      <label className={estilos.etiquetaFeedback} htmlFor={`feedback-${id}`}>
        Tu feedback
      </label>
      <textarea
        id={`feedback-${id}`}
        className={estilos.campoFeedback}
        rows={2}
        value={texto}
        disabled={apagado}
        onChange={(evento) => setTexto(evento.target.value)}
        placeholder="Se manda al agente en el mismo hilo…"
      />
      <button type="submit" className={estilos.botonFeedback} disabled={limpio === "" || apagado}>
        Enviar y continuar
      </button>
    </form>
  );
}
