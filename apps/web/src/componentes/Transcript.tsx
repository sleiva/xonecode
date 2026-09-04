import { useState } from "react";
import type { Acto } from "../tipos.js";
import { Chat } from "./Chat.js";
import { Trayectoria } from "./Trayectoria.js";
import estilos from "./Transcript.module.css";

type Pestana = "chat" | "trayectoria";

/**
 * Las dos vistas del transcript, alternadas por pestaña. El `useState` es TODO el
 * mecanismo de «se recuerda mientras dure la página»: no hay nada que persistir a
 * `localStorage` ni al store —recargar la pestaña del navegador es una sesión nueva
 * como lo es reconectar el SSE (`store.ts#marcarDesconectado` ya borra lo pendiente
 * en ese momento)—, así que un estado de componente que muere con el montaje es
 * exactamente la vida útil que pide el criterio de aceptación, ni más ni menos.
 */
export function Transcript({ actos }: { actos: readonly Acto[] }) {
  const [pestana, setPestana] = useState<Pestana>("chat");

  return (
    <div className={estilos.transcript}>
      <div className={estilos.pestanas} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === "chat"}
          className={pestana === "chat" ? estilos.activa : estilos.pestana}
          onClick={() => setPestana("chat")}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === "trayectoria"}
          className={pestana === "trayectoria" ? estilos.activa : estilos.pestana}
          onClick={() => setPestana("trayectoria")}
        >
          Trayectoria
        </button>
      </div>
      <div className={estilos.vista}>
        {pestana === "chat" ? <Chat actos={actos} /> : <Trayectoria actos={actos} />}
      </div>
    </div>
  );
}
