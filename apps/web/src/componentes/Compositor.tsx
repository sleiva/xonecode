import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { DispositivoElegido, InformeDeDispositivos, ProveedorDeModelos } from "../tipos.js";
import { PastillaDeModelo } from "./PastillaDeModelo.js";
import { PastillaDeDispositivo } from "./PastillaDeDispositivo.js";
import { ContadorDeTokens, type ConsumoPintable } from "./ContadorDeTokens.js";
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
  consumo,
  oculto = false,
  alParar,
  modelos,
  alPedirCatalogo,
  alElegirModelo,
  alAbrirAjustes,
  dispositivo,
  dispositivos,
  alElegirDispositivo,
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
  /** Lo consumido por la sesión. Ausente = no consta, y entonces no se pinta el contador. */
  consumo?: ConsumoPintable;
  /**
   * Fuera de la vista: se pone en las pestañas que no son el chat.
   *
   * En Trazas y en Ficheros no hay a quién escribirle —son un registro y un diff—, y una
   * caja de escribir debajo de ellos invita a mandar algo que no va a llegar donde el
   * usuario cree.
   *
   * Se OCULTA y no se desmonta, que es la diferencia que importa: desmontado se pierde el
   * borrador a medio escribir en cuanto miras un fichero y vuelves. Y `hidden` —no
   * `visibility`— porque lo que hace falta es que además salga del orden del Tab y del
   * árbol de accesibilidad: un campo invisible al que se llega tabulando es peor que uno
   * visible.
   */
  oculto?: boolean;
  /** Parar el turno en vuelo. Ausente = no se ofrece el botón. */
  alParar?: () => void;
  /** El estado de modelos del cable. Ausente = todavía no llegó: no se pinta pastilla, en
   *  vez de una que diga «Elige modelo» sin saber siquiera si hay algo que elegir. */
  modelos?: { actual?: string; proveedores: readonly ProveedorDeModelos[] };
  alPedirCatalogo?: (proveedor: string) => void;
  /** Elegir modelo: el id `proveedor/modelo`. Lo manda como acción, no como comando. */
  alElegirModelo?: (id: string) => void;
  /** Abrir Ajustes, para los proveedores que la pastilla no lista por no estar comprobados. */
  alAbrirAjustes?: () => void;
  /** El dispositivo de la sesión, tal como lo cuenta el servidor. Ausente = ninguno. */
  dispositivo?: DispositivoElegido;
  /** La última medida de la máquina, para la lista. Ausente = todavía no llegó. */
  dispositivos?: InformeDeDispositivos;
  /** Elegir dispositivo: el id, o `undefined` para quitarlo. Ausente = no se pinta pastilla. */
  alElegirDispositivo?: (id: string | undefined) => void;
  alEnviar: (texto: string) => void;
}) {
  const [valor, setValor] = useState("");
  const campo = useRef<HTMLTextAreaElement>(null);

  /**
   * Al terminar el turno, el foco vuelve a la caja.
   *
   * No es una comodidad: la caja se APAGA mientras el agente trabaja (`disabled`, ver
   * arriba), y un elemento que se deshabilita pierde el foco — el navegador se lo devuelve
   * al `<body>`. Así que quien escribía una petición, la mandaba y esperaba, al terminar se
   * encontraba con que teclear no escribía en ningún sitio y había que ir a pinchar la caja
   * con el ratón. Lo que se arregla aquí es eso, no un adorno.
   *
   * Solo en el flanco de bajada de `turnoEnVuelo`, y solo si la caja está a la vista y
   * habilitada: robar el foco al montar, o mientras el usuario mira un diff en Ficheros,
   * sería lo contrario de lo que se quiere.
   */
  const veniaDeTurno = useRef(false);
  useEffect(() => {
    const acabaDeTerminar = veniaDeTurno.current && !turnoEnVuelo;
    veniaDeTurno.current = turnoEnVuelo;
    if (acabaDeTerminar && !oculto && conectado) campo.current?.focus();
  }, [turnoEnVuelo, oculto, conectado]);

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
    <div className={estilos.envoltura} hidden={oculto}>
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
          ref={campo}
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
                : // Nombra lo que este harness sabe hacer de verdad —preguntar por XOne,
                  // cambiar una colección o un script— en vez de un «escribe algo» que no
                  // dice nada. Y solo eso: prometer aquí lo que no está cableado sería el
                  // mismo botón muerto de siempre, con la petición de una persona detrás.
                  "Pregunta sobre XOne, pide un cambio en una colección o en un script, o /comando…"
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
              // La pastilla solo lista lo COMPROBADO; los demás se cuentan con el camino
              // para configurarlos, que es esta ventana.
              {...(alAbrirAjustes === undefined ? {} : { alAbrirAjustes })}
            />
          ) : null}
          {/*
            El dispositivo de la sesión, al lado del modelo: es el mismo tipo de dato —una
            elección de la sesión que decide el servidor— y por eso comparte fila. Solo se
            pinta si quien monta el compositor sabe elegir: sin manejador no hay pastilla,
            que es la misma regla que la de modelos.
          */}
          {alElegirDispositivo === undefined ? null : (
            <PastillaDeDispositivo
              {...(dispositivo === undefined ? {} : { elegido: dispositivo })}
              {...(dispositivos === undefined ? {} : { informe: dispositivos })}
              conectado={conectado}
              alElegir={alElegirDispositivo}
            />
          )}
          {/*
            Lo consumido por la sesión, al lado del modelo: es del mismo tipo que él —un
            dato de la sesión que dice el servidor y el cliente pinta— y por eso comparte
            fila. Sin dato no se pinta: ausente es «no consta», no cero.
          */}
          <ContadorDeTokens {...(consumo === undefined ? {} : { consumo })} />
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
      {/*
        Las tres teclas que hay que saber, y las TRES son ciertas hoy: `Enter` envía
        (`alPulsarTecla`), `Shift+Enter` salta de línea y `/` abre las sugerencias que el
        servidor manda. Escribirlas aquí no promete nada nuevo — es la diferencia entre esto
        y un icono de micrófono.

        Va FUERA de la caja y dentro de la envoltura: fuera porque no compite con lo que se
        escribe, y dentro porque así se oculta con ella en Trazas y en Ficheros, donde no hay
        a quién escribirle.
      */}
      <p className={estilos.ayudaDeTeclas}>
        Enter para enviar · Shift + Enter para salto de línea · / para comandos
      </p>
    </div>
  );
}
