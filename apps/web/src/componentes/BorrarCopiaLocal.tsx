import { useState } from "react";
import { Modal, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import clsx from "clsx";
import estilos from "./NuevaSesion.module.css";
import propios from "./AccionDeSesion.module.css";

/**
 * La pregunta de seguridad antes de borrar la copia local de un proyecto.
 *
 * Es la ventana de `AccionDeSesion` —la misma coraza de `NuevaSesion.module.css` y el mismo
 * botón rojo lleno (`.destructiva`)— porque es la misma clase de acto: irreversible y sin
 * papelera. Lo que añade es la regla de quitar un entorno en Ajustes: hay que ESCRIBIR el
 * nombre para que el botón se active, porque aquí no se pierde una conversación sino todas.
 *
 * Dice lo que se lleva por delante, con palabras: las sesiones, el historial, los artefactos
 * y lo que no se haya subido. Y dice lo que NO toca —lo de CloudStudio—, que es lo que hace
 * que alguien se atreva a pulsarlo cuando es lo que quiere.
 *
 * Si el servidor se niega (409), el motivo se pinta AQUÍ y la ventana se queda: cerrarla
 * sería hacer creer que se borró.
 */
export function BorrarCopiaLocal({
  nombre,
  alConfirmar,
  alCerrar,
}: {
  nombre: string;
  /** Devuelve el motivo si el servidor se negó, o nada si se borró. */
  alConfirmar: () => Promise<string | undefined>;
  alCerrar: () => void;
}) {
  const [escrito, setEscrito] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [motivo, setMotivo] = useState<string | undefined>(undefined);
  const confirmado = escrito.trim() === nombre;

  const borrar = async (): Promise<void> => {
    setBorrando(true);
    setMotivo(undefined);
    const negativa = await alConfirmar().catch(() => "no se pudo hablar con el servidor");
    setBorrando(false);
    setMotivo(negativa);
  };

  return (
    <Modal open onClose={alCerrar} title="Borrar copia local" headless className={estilos.capa}>
      <div
        className={estilos.velo}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget && !borrando) alCerrar();
        }}
      >
        <div className={estilos.ventana} role="alertdialog" aria-label={`Borrar la copia local de ${nombre}`}>
          <h2 className={estilos.titulo}>Borrar copia local</h2>
          <p className={estilos.nota}>
            Se borra la copia de «{nombre}» en este equipo, entera: <strong>todas sus sesiones</strong>, su
            historial de conversación, los artefactos y <strong>los cambios que no hayas subido a CloudStudio</strong>.
            No hay papelera.
          </p>
          <p className={estilos.nota}>
            Lo que hay en CloudStudio no se toca: el proyecto seguirá en la lista, sin descargar, y se
            volverá a bajar al abrirlo.
          </p>
          <label className={estilos.etiqueta} htmlFor="borrar-copia-nombre">
            Escribe «{nombre}» para confirmar
          </label>
          <input
            id="borrar-copia-nombre"
            className={estilos.campo}
            value={escrito}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setEscrito(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && confirmado && !borrando) void borrar();
            }}
          />
          {motivo === undefined ? null : (
            <p className={estilos.fallo} role="alert">
              No se ha borrado: {motivo}
            </p>
          )}
          <div className={estilos.acciones}>
            <Button variant="outline" className={estilos.accion} disabled={borrando} onClick={alCerrar}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className={clsx(estilos.accion, estilos.principal, propios.destructiva)}
              disabled={!confirmado || borrando}
              onClick={() => void borrar()}
            >
              {borrando ? "Borrando…" : "Borrar"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
