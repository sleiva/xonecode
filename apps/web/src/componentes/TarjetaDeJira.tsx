import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import type { TransicionDelGestor } from "../tipos.js";
import estilos from "./TarjetaDeJira.module.css";

/**
 * Las dos tarjetas de aprobación que son el ÚNICO camino por el que el harness escribe en
 * Jira (IXCODE-11, Task 11): «Empezar» —al pulsar «Nueva sesión con esta tarea» en el panel
 * del proyecto— y «Cerrar en Jira» —un botón en una sesión ligada a un ticket—. Las dos son
 * diálogos con la MISMA puerta que `Pregunta.tsx`: `Modal` de `@deepseek-ai/dsh-client-ui-
 * primitives`, un velo propio (sus CSS Modules son stubs vacíos), Escape y el clic FUERA de
 * la tarjeta RECHAZAN, y desmontar sin contestar no manda nada — lo que quede sin decidir se
 * queda tal cual estaba, sin abrir Jira.
 *
 * **Son puramente de PRESENTACIÓN**: no llaman al cable. Quien las monta (`PanelDelProyecto`
 * para «Empezar», `App` para «Cerrar en Jira») decide CUÁNDO abrirlas, qué `transiciones` les
 * pasa —ya filtradas por `clave` y `para`— y qué hace con `alConfirmar`/`alCancelar`. Así el
 * seguimiento de R8 (el aviso «no se pudo pasar… La sesión se abrió igual» cuando la
 * transición falla pero la sesión se abre de todos modos) vive donde vive el resto del
 * cableado del gestor, no aquí dentro.
 */

/** Las transiciones de UNA tarea, ya filtradas por `clave` y `para` (Task 10): quien monta la
 *  tarjeta es quien sabe cuál de las dos peticiones —`empezar` o `cerrar`— es la suya. Ausente
 *  mientras se están pidiendo: la tarjeta lo DICE en vez de fingir una lista vacía. */
export type TransicionesDeLaTarjeta = { lista: TransicionDelGestor[]; propuesta?: string };

/**
 * La transición elegida en el desplegable, con la PROPUESTA como valor inicial y cada vez que
 * llega una lista nueva: `transiciones` es un objeto FRESCO en cada mensaje del cable
 * (`gestorDelCable.ts`), así que su identidad ya basta para saber que hay algo que releer —
 * sin eso, la tarjeta se abriría con el desplegable vacío hasta que alguien lo tocara.
 */
function useTransicionElegida(transiciones?: TransicionesDeLaTarjeta): [string, (id: string) => void] {
  const [elegida, setElegida] = useState<string>(transiciones?.propuesta ?? "");
  useEffect(() => {
    setElegida(transiciones?.propuesta ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transiciones]);
  return [elegida, setElegida];
}

/**
 * La coraza común: capa, velo con su propio manejador de clic, y la tarjeta centrada con su
 * título. La misma forma que `Pregunta.tsx`, `NuevaSesion.tsx`, `Aprobacion.tsx`.
 *
 * **Cancelar —el botón, Escape o el velo— SIEMPRE cierra, también con una escritura en
 * vuelo**: a diferencia de `Pregunta.tsx`, aquí `alCancelar` nunca deshace nada —Jira no
 * tiene un `undo` que este cliente pueda pedir, el `empezar`/`cerrar` ya mandado sigue su
 * camino en el servidor pase lo que pase con la tarjeta—, así que bloquear la salida no
 * evitaba ningún doble envío: solo atrapaba a la persona delante de un diálogo que no podía
 * cerrar hasta que el cable se cayera (medido: R8 con `g.ficha()` fallando deja el candado
 * puesto un buen rato). El doble envío lo evita el candado de la FILA
 * (`empezarEnVuelo`/`ocupado`), que vive en quien MONTA la tarjeta y sobrevive a que esta se
 * cierre — cerrar el diálogo no reabre esa puerta.
 */
function Dialogo({ titulo, alCancelar, children }: { titulo: string; alCancelar: () => void; children: ReactNode }) {
  return (
    <Modal open onClose={alCancelar} title={titulo} headless className={estilos.capa}>
      <div
        className={estilos.velo}
        onClick={(evento: MouseEvent<HTMLDivElement>) => {
          if (evento.target === evento.currentTarget) alCancelar();
        }}
      >
        <div className={estilos.tarjeta}>
          <p className={estilos.titulo}>{titulo}</p>
          {children}
        </div>
      </div>
    </Modal>
  );
}

/**
 * «Empezar»: se abre al pulsar «Nueva sesión con esta tarea», con las transiciones YA
 * pedidas (`{accion:"transiciones", para:"empezar"}`, Task 10) — `transiciones` llega
 * `undefined` mientras la respuesta no ha vuelto, y la tarjeta lo dice en vez de un
 * desplegable vacío. El título sigue la transición elegida: sin ninguna (todavía cargando, o
 * sin transiciones que ofrecer), pregunta por EMPEZAR a secas.
 */
export function TarjetaDeEmpezar({
  clave,
  transiciones,
  errorTransiciones,
  enviando,
  error,
  alConfirmar,
  alCancelar,
}: {
  clave: string;
  transiciones?: TransicionesDeLaTarjeta;
  /** Por qué `transiciones` sigue `undefined` (R6): sin esto, un fallo de la CONSULTA —de
   *  solo lectura, no la escritura— se quedaba en «Consultando…» para siempre. */
  errorTransiciones?: string;
  enviando: boolean;
  error?: string;
  /** `undefined` es «Empezar sin tocar Jira». */
  alConfirmar: (transicion?: string) => void;
  alCancelar: () => void;
}) {
  const [elegida, setElegida] = useTransicionElegida(transiciones);
  const lista = transiciones?.lista ?? [];
  const destino = lista.find((t) => t.id === elegida)?.destino;
  const titulo = destino === undefined ? `¿Empezar con ${clave}?` : `¿Pasar ${clave} a ${destino}?`;

  return (
    <Dialogo titulo={titulo} alCancelar={alCancelar}>
      {transiciones !== undefined ? null : errorTransiciones === undefined ? (
        <p className={estilos.aviso}>{`Consultando las transiciones de ${clave}…`}</p>
      ) : (
        <p className={estilos.error} role="alert">
          {`No se pudieron consultar las transiciones: ${errorTransiciones}`}
        </p>
      )}
      {transiciones === undefined ? null : lista.length === 0 ? (
        <p className={estilos.aviso}>{`No hay transiciones disponibles para ${clave}.`}</p>
      ) : (
        <label className={estilos.campo}>
          Transición
          <select className={estilos.select} value={elegida} onChange={(evento) => setElegida(evento.target.value)}>
            <option value="">Ninguna</option>
            {lista.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      {error === undefined ? null : (
        <p className={estilos.error} role="alert">
          {error}
        </p>
      )}
      <div className={estilos.acciones}>
        {lista.length === 0 ? null : (
          <Button
            type="button"
            variant="primary"
            className={estilos.principal}
            disabled={enviando || elegida === ""}
            onClick={() => alConfirmar(elegida)}
          >
            Pasar y empezar
          </Button>
        )}
        <Button type="button" variant="outline" className={estilos.accion} disabled={enviando} onClick={() => alConfirmar(undefined)}>
          Empezar sin tocar Jira
        </Button>
        {/* Cancelar NUNCA se deshabilita: ver `Dialogo` — cerrar no manda nada de vuelta ni
            deshace lo que ya se mandó, así que no hay envío doble que evitar aquí dentro. */}
        <Button type="button" variant="outline" className={estilos.cancelar} onClick={alCancelar}>
          Cancelar
        </Button>
      </div>
    </Dialogo>
  );
}

/**
 * «Cerrar en Jira»: se abre solo cuando llega `cierre` (`{accion:"borradorDeCierre"}`), así
 * que el `comentario` propuesto ya está —sin estado de carga que mostrar en el campo—, y se
 * pide `{accion:"transiciones", para:"cerrar"}` en paralelo, que sí puede llegar después
 * (`transiciones` ausente mientras tanto, y entonces no hay botón de «pasar a» que ofrecer,
 * solo «Solo comentar»).
 *
 * El texto es EDITABLE desde el primer render y la tarjeta nunca lo vuelve a pisar: un
 * `error` de `cerrar` la deja abierta con lo que la persona haya escrito intacto (R de la
 * tarjeta), porque `texto` es estado local que solo cambia si alguien teclea.
 */
export function TarjetaDeCerrar({
  clave,
  comentario,
  transiciones,
  errorTransiciones,
  enviando,
  error,
  alConfirmar,
  alCancelar,
}: {
  clave: string;
  comentario: string;
  transiciones?: TransicionesDeLaTarjeta;
  /** Por qué `transiciones` sigue `undefined` (R6): la tarjeta sigue sirviendo —«Solo
   *  comentar» no depende de esto—, pero el fallo de la consulta no se calla. */
  errorTransiciones?: string;
  enviando: boolean;
  error?: string;
  alConfirmar: (comentario: string, transicion?: string) => void;
  alCancelar: () => void;
}) {
  const [texto, setTexto] = useState(comentario);
  const [elegida, setElegida] = useTransicionElegida(transiciones);
  const lista = transiciones?.lista ?? [];
  const destino = lista.find((t) => t.id === elegida)?.destino;
  const vacio = texto.trim() === "";

  return (
    <Dialogo titulo={`Cerrar ${clave} en Jira`} alCancelar={alCancelar}>
      <label className={estilos.campo}>
        Comentario
        <textarea className={estilos.textarea} rows={5} value={texto} onChange={(evento) => setTexto(evento.target.value)} />
      </label>
      {transiciones !== undefined || errorTransiciones === undefined ? null : (
        <p className={estilos.error} role="alert">
          {`No se pudieron consultar las transiciones: ${errorTransiciones}`}
        </p>
      )}
      {lista.length === 0 ? null : (
        <label className={estilos.campo}>
          Transición
          <select className={estilos.select} value={elegida} onChange={(evento) => setElegida(evento.target.value)}>
            <option value="">Ninguna</option>
            {lista.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      {error === undefined ? null : (
        <p className={estilos.error} role="alert">
          {error}
        </p>
      )}
      <div className={estilos.acciones}>
        {destino === undefined ? null : (
          <Button
            type="button"
            variant="primary"
            className={estilos.principal}
            disabled={enviando || vacio}
            onClick={() => alConfirmar(texto, elegida)}
          >
            {`Comentar y pasar a ${destino}`}
          </Button>
        )}
        <Button type="button" variant="outline" className={estilos.accion} disabled={enviando || vacio} onClick={() => alConfirmar(texto, undefined)}>
          Solo comentar
        </Button>
        {/* Cancelar NUNCA se deshabilita: ver `Dialogo`. */}
        <Button type="button" variant="outline" className={estilos.cancelar} onClick={alCancelar}>
          Cancelar
        </Button>
      </div>
    </Dialogo>
  );
}

/**
 * El botón que abre «Cerrar en Jira», con la clave del ticket delante (Task 11, IXCODE-11):
 * visible solo en una sesión ligada, y solo `App.tsx` decide cuándo (ticket puesto, sin
 * turno en vuelo). `ocupado` es «ya se pidió el borrador y se está esperando `cierre`»: el
 * texto lo dice en vez de dejar el botón inerte sin explicación.
 */
export function BotonDeCerrarEnJira({
  ticket,
  ocupado,
  conectado,
  alPedir,
}: {
  ticket: string;
  ocupado: boolean;
  conectado: boolean;
  alPedir: () => void;
}) {
  return (
    <div className={estilos.barraDeTicket}>
      <span className={estilos.ticket}>{ticket}</span>
      <button type="button" className={estilos.accion} onClick={alPedir} disabled={!conectado || ocupado}>
        {ocupado ? "Preparando…" : "Cerrar en Jira"}
      </button>
    </div>
  );
}

/**
 * El aviso corto de R8/R de «Cerrar»: lo que se dice en el CHAT cuando «empezar» abrió la
 * sesión aunque la transición fallara («La sesión se abrió igual»), o cuando «cerrar»
 * terminó de escribir. No es un diálogo —no hay nada que decidir—, así que va suelto en la
 * columna, no en un portal.
 */
export function AvisoDelGestor({ texto, alCerrar }: { texto: string; alCerrar: () => void }) {
  return (
    <div className={estilos.avisoDelGestor} role="status">
      <span>{texto}</span>
      <button type="button" className={estilos.cerrarAviso} onClick={alCerrar} aria-label="Descartar el aviso">
        ×
      </button>
    </div>
  );
}
