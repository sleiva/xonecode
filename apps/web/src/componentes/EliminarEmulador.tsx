import { useEffect, useRef, useState } from "react";
import { Modal, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import clsx from "clsx";
import type { EstadoDelCliente } from "../store.js";
import estilos from "./NuevaSesion.module.css";
import propios from "./AccionDeSesion.module.css";
import propiosDelProgreso from "./EliminarEmulador.module.css";

/**
 * La pregunta de seguridad antes de ELIMINAR un emulador (AVD) desde Ajustes > Dispositivos.
 *
 * Es el molde de `BorrarCopiaLocal` —misma ventana, mismo botón rojo lleno (`.destructiva`) y la
 * misma regla: hay que ESCRIBIR el nombre para que el botón se active— porque es la misma clase de
 * acto: irreversible y sin papelera. Dice lo que se pierde (el emulador y todo lo instalado en él) y
 * lo que NO (la imagen del sistema y los demás emuladores), que es lo que hace que alguien se atreva.
 *
 * **Las negativas del servidor no llegan al navegador**, así que quien monta esto ya aplicó sus
 * reglas (`reglasDeAvd.ts#motivoParaNoEliminarAvd`) y no deja abrirlo con el último o en marcha.
 * Lo que sí llega es el `instalacion` con `receta: "borrar-avd"`, que aquí se enseña: título, cola del
 * log y cómo acabó. Con `ok` la ventana se cierra sola; con un fallo se QUEDA con el motivo —cerrarla
 * sería hacer creer que se eliminó— y se puede reintentar.
 *
 * Un progreso que ya estaba puesto al abrir (la eliminación anterior) no cuenta: se compara por
 * identidad con el que había entonces, o un `ok` viejo la cerraría antes de pulsar nada.
 */
export function EliminarEmulador({
  avd,
  alConfirmar,
  alCerrar,
  progreso,
}: {
  avd: string;
  /** Manda la orden. El resultado no vuelve aquí: llega por `progreso`. */
  alConfirmar: () => void;
  alCerrar: () => void;
  /** El `instalacion` del store YA filtrado a `borrar-avd` (lo filtra quien monta). Ausente = ninguno. */
  progreso?: EstadoDelCliente["instalacion"];
}) {
  const [escrito, setEscrito] = useState("");
  const [enviado, setEnviado] = useState(false);
  const anterior = useRef(progreso);
  const propio = enviado && progreso !== anterior.current ? progreso : undefined;
  const eliminando = enviado && (propio === undefined || propio.estado === "corriendo");
  const confirmado = escrito.trim() === avd;

  useEffect(() => {
    if (propio?.estado === "ok") alCerrar();
    // `alCerrar` cambia en cada render de quien monta: lo que dispara es el estado.
  }, [propio?.estado]);

  const eliminar = (): void => {
    anterior.current = progreso;
    setEnviado(true);
    alConfirmar();
  };

  return (
    <Modal open onClose={alCerrar} title="Eliminar emulador" headless className={estilos.capa}>
      <div
        className={estilos.velo}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget && !eliminando) alCerrar();
        }}
      >
        <div className={estilos.ventana} role="alertdialog" aria-label={`Eliminar el emulador ${avd}`}>
          <h2 className={estilos.titulo}>Eliminar emulador</h2>
          <p className={estilos.nota}>
            Se elimina «{avd}» de este equipo: <strong>el emulador y todo lo instalado en él</strong> —apps,
            datos y su estado guardado—. No hay papelera.
          </p>
          <p className={estilos.nota}>
            No se toca la imagen del sistema ni los demás emuladores, y los nuevos se podrán seguir creando.
          </p>
          <label className={estilos.etiqueta} htmlFor="eliminar-emulador-nombre">
            Escribe «{avd}» para confirmar
          </label>
          <input
            id="eliminar-emulador-nombre"
            className={estilos.campo}
            value={escrito}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            disabled={eliminando}
            onChange={(e) => setEscrito(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && confirmado && !eliminando) eliminar();
            }}
          />
          {propio === undefined || propio.estado === "corriendo" ? null : (
            <p className={estilos.fallo} role="alert">
              No se ha eliminado: {propio.motivo ?? "el gestor de emuladores no pudo"}
            </p>
          )}
          {propio === undefined || propio.lineas.length === 0 ? null : (
            <pre className={propiosDelProgreso.log}>{propio.lineas.slice(-5).join("\n")}</pre>
          )}
          <div className={estilos.acciones}>
            <Button variant="outline" className={estilos.accion} disabled={eliminando} onClick={alCerrar}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className={clsx(estilos.accion, estilos.principal, propios.destructiva)}
              disabled={!confirmado || eliminando}
              onClick={eliminar}
            >
              {eliminando ? "Eliminando…" : "Eliminar"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
