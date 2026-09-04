import { useState, type KeyboardEvent } from "react";
import estilos from "./Compositor.module.css";

/** Un candidato de `/ayuda`: lo manda el servidor recorriendo `COMANDOS`, no una copia. */
export interface ComandoSugerido {
  nombre: string;
  descripcion: string;
}

/**
 * El compositor: envía prosa Y comandos de barra por el MISMO cauce.
 *
 * Una línea que empieza por «/» no tiene código propio aquí: `alEnviar` la manda tal cual,
 * y del otro lado `correrConsola` la despacha contra el registro `COMANDOS`
 * (`cli/consola.ts:819`) exactamente como despacharía la de stdio o la TUI — por eso
 * `/ayuda`, `/modelo`, `/config`, `/sync` y `/hilo` funcionan en la web sin una sola línea
 * nueva de servidor: la única pieza que SÍ hace falta es la lista de sugerencias, y esa
 * viene del mensaje `comandos` (`tipos.ts`), leída aquí por prop y no reescrita a mano.
 */
export function Compositor({
  comandos = [],
  conectado,
  alEnviar,
}: {
  /** Ausente antes de que llegue el mensaje `comandos` del servidor: sin sugerencias, no un fallo. */
  comandos?: readonly ComandoSugerido[];
  conectado: boolean;
  alEnviar: (texto: string) => void;
}) {
  const [valor, setValor] = useState("");

  const sugerencias =
    valor.startsWith("/") ? comandos.filter((c) => c.nombre.startsWith(valor)) : [];

  const enviar = (): void => {
    const texto = valor.trim();
    if (texto === "") return;
    alEnviar(texto);
    setValor("");
  };

  // Enter envía; Shift+Enter salta de línea (el `textarea` lo hace solo si no se
  // intercepta). `preventDefault` es lo que evita el salto EN VEZ de enviar.
  const alPulsarTecla = (evento: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (evento.key === "Enter" && !evento.shiftKey) {
      evento.preventDefault();
      enviar();
    }
  };

  return (
    <div className={estilos.compositor}>
      {sugerencias.length > 0 && (
        <ul className={estilos.sugerencias} role="listbox">
          {sugerencias.map((c) => (
            <li key={c.nombre} role="option" className={estilos.sugerencia}>
              <span className={estilos.nombreComando}>{c.nombre}</span>
              <span className={estilos.descripcionComando}>{c.descripcion}</span>
            </li>
          ))}
        </ul>
      )}
      <textarea
        className={estilos.entrada}
        value={valor}
        disabled={!conectado}
        // Deshabilitado no puede quedarse mudo: dice POR QUÉ, en vez de dejar al usuario
        // adivinando si el campo está roto o si nadie escucha al otro lado.
        placeholder={conectado ? "Escribe una petición, o /comando…" : "sin conexión con xonecode"}
        onChange={(evento) => setValor(evento.target.value)}
        onKeyDown={alPulsarTecla}
      />
    </div>
  );
}
