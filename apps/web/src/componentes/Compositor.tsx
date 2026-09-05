import { useState, type KeyboardEvent } from "react";
import type { ProveedorDeModelos } from "../tipos.js";
import { PastillaDeModelo } from "./PastillaDeModelo.js";
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
  turnoEnVuelo = false,
  alParar,
  modelos,
  alPedirCatalogo,
  alElegirModelo,
  alEnviar,
}: {
  /** Ausente antes de que llegue el mensaje `comandos` del servidor: sin sugerencias, no un fallo. */
  comandos?: readonly ComandoSugerido[];
  conectado: boolean;
  /**
   * Hay un turno EN VUELO. Apaga la entrada y convierte la flecha en un botón de parar.
   *
   * Apagarla no es un capricho: una segunda petición mientras el agente trabaja se queda en
   * la cola del lazo sin decirlo, y se ejecuta cuando termine el turno de antes — el usuario
   * ve su texto desaparecer del campo y no pasar nada durante minutos.
   */
  turnoEnVuelo?: boolean;
  /** Parar el turno en vuelo. Ausente = no se ofrece el botón. */
  alParar?: () => void;
  /** El estado de modelos del cable. Ausente = todavía no llegó: no se pinta pastilla, en
   *  vez de una que diga «Elige modelo» sin saber siquiera si hay algo que elegir. */
  modelos?: { actual?: string; proveedores: readonly ProveedorDeModelos[] };
  alPedirCatalogo?: (proveedor: string) => void;
  /** Elegir modelo: el id `proveedor/modelo`. Lo manda como acción, no como comando. */
  alElegirModelo?: (id: string) => void;
  alEnviar: (texto: string) => void;
}) {
  const [valor, setValor] = useState("");

  const sugerencias =
    valor.startsWith("/") ? comandos.filter((c) => c.nombre.startsWith(valor)) : [];

  const enviar = (): void => {
    // Con un turno en vuelo no se manda: el campo está apagado, pero el Enter llega igual
    // si el navegador tenía el foco puesto antes de apagarse.
    if (turnoEnVuelo) return;
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
    <div className={estilos.envoltura}>
      {/*
        `data-trabajando` en la caja, no una clase más: es un ESTADO —lo dice el servidor y
        cambia solo— y el CSS lo lee como tal. De ahí cuelga el borde animado, que es la
        única señal de «está pasando algo» mientras el agente no habla.
      */}
      <div className={estilos.compositor} data-trabajando={turnoEnVuelo ? "" : undefined}>
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
          disabled={!conectado || turnoEnVuelo}
          // Deshabilitado no puede quedarse mudo: dice POR QUÉ, en vez de dejar al usuario
          // adivinando si el campo está roto o si nadie escucha al otro lado. Y son DOS
          // motivos distintos: sin cable no llega nada; con turno en vuelo, llegaría y se
          // quedaría en la cola hasta que termine.
          placeholder={
            !conectado
              ? "sin conexión con xonecode"
              : turnoEnVuelo
                ? "el agente está trabajando…"
                : "Escribe una petición, o /comando…"
          }
          onChange={(evento) => setValor(evento.target.value)}
          onKeyDown={alPulsarTecla}
        />
        {/*
          Fila de controles DENTRO de la tarjeta, como en la referencia. La pastilla de
          MODELO ya está aquí: dejó de ser un botón sin nada detrás en cuanto el cable
          empezó a mandar `clase: "modelos"` — el modelo en vigor y los proveedores. El
          «+» y la de permisos siguen fuera por el mismo motivo que estaban antes las
          tres: no hay dato ni acción detrás, y un control así es la misma mentira que
          una lista vacía rellenada con un placeholder.
        */}
        <div className={estilos.controles}>
          {modelos !== undefined ? (
            <PastillaDeModelo
              {...(modelos.actual === undefined ? {} : { actual: modelos.actual })}
              proveedores={modelos.proveedores}
              alPedirCatalogo={(proveedor) => alPedirCatalogo?.(proveedor)}
              // Una ACCIÓN, no un comando: por el cable viaja `{clase:"modelo", id}` y es
              // el servidor quien decide que aplicarla es reusar el manejador de `/modelo`.
              // Mandar aquí la prosa «/modelo …» apuntaba en el transcript un acto de
              // usuario que nadie tecleó —y de ahí sale el título de la sesión— y dejaba la
              // interfaz hablando en la sintaxis del terminal.
              alElegir={(id) => alElegirModelo?.(id)}
            />
          ) : null}
          {/*
            La MISMA ranura, dos acciones: con turno en vuelo es parar, y si no, enviar.
            Dos botones a la vez —uno inerte al lado del otro— dejaría al usuario eligiendo
            entre dos cosas cuando solo una tiene sentido en cada momento.
          */}
          {turnoEnVuelo ? (
            <button
              type="button"
              className={`${estilos.enviar} ${estilos.parar}`}
              disabled={!conectado || alParar === undefined}
              aria-label="Parar"
              title="Parar el turno"
              onClick={() => alParar?.()}
            >
              ■
            </button>
          ) : (
            <button
              type="button"
              className={estilos.enviar}
              disabled={!conectado}
              aria-label="Enviar"
              onClick={enviar}
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
