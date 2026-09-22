import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type {
  DispositivoElegido, Esfuerzo, EsfuerzoDelCable, InformeDeDispositivos, ModoDeEscritura,
  ProveedorDeModelos,
} from "../tipos.js";
import { PastillaDeModelo } from "./PastillaDeModelo.js";
import { PastillaDeEsfuerzo } from "./PastillaDeEsfuerzo.js";
import { PastillaDeDispositivo } from "./PastillaDeDispositivo.js";
import { SelectorDeModo } from "./SelectorDeModo.js";
import { IconoDeEnviar } from "./IconosDelCompositor.js";
import pastillas from "./PastillaDeModelo.module.css";
import { ContadorDeTokens, type ConsumoPintable } from "./ContadorDeTokens.js";
import estilos from "./Compositor.module.css";

/**
 * El compositor: manda PROSA.
 *
 * Aquí no hay comandos de barra, y no es que falten: en el navegador no existen. Una línea
 * que empiece por «/» —una ruta del proyecto, `/artefactos/informe.html`— viaja al modelo
 * tal cual, porque lo que hay al otro lado de cada acción es un BOTÓN: el modelo en la
 * pastilla, el tema en Apariencia, la sincronización en su pestaña. Mientras esto despachó
 * comandos, escribir «/» para hablar de una ruta ejecutaba una orden.
 *
 * La sintaxis se queda en las pieles de TERMINAL, donde el teclado es la única puerta.
 * Dentro del servidor sigue viva igual —`consolaWeb.encolar` aplica `/modelo …` cuando
 * alguien elige modelo en Ajustes—, porque lo que se comparte es la FUNCIÓN y no la
 * sintaxis. Ver `cli/consola.ts#LineaDeConsola`.
 */
export function Compositor({
  conectado,
  turnoEnVuelo = false,
  consumo,
  oculto = false,
  alParar,
  modelos,
  alPedirCatalogo,
  alElegirModelo,
  alElegirEsfuerzo,
  alAbrirAjustes,
  dispositivo,
  dispositivos,
  modoDeEscritura,
  alElegirModoDeEscritura,
  alElegirDispositivo,
  alEnviar,
}: {
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
  modelos?: {
    actual?: string;
    proveedores: readonly ProveedorDeModelos[];
    /**
     * Lo que admite de esfuerzo el modelo EN VIGOR. Viaja DENTRO de `modelos` y no como
     * prop suelta por el mismo motivo por el que viaja dentro del mensaje: la lista
     * depende del modelo, y separarlos dejaría que llegara una sin la otra — la pastilla
     * ofreciendo los niveles del modelo anterior, que es un control que miente.
     */
    esfuerzo?: EsfuerzoDelCable;
  };
  alPedirCatalogo?: (proveedor: string) => void;
  /** Elegir modelo: el id `proveedor/modelo`. Lo manda como acción, no como comando. */
  alElegirModelo?: (id: string) => void;
  /**
   * Elegir el esfuerzo, o `undefined` para dejar de mandarlo.
   *
   * Opcional como `alElegirDispositivo`: sin manejador no se ofrece el control, que es lo
   * que mantiene honesto al compositor en los sitios donde no hay servidor detrás (los
   * tests, y cualquier montaje que no cablee el cable).
   */
  alElegirEsfuerzo?: (nivel: Esfuerzo | undefined) => void;
  /** Abrir Ajustes, para los proveedores que la pastilla no lista por no estar comprobados. */
  alAbrirAjustes?: () => void;
  /** El dispositivo de la sesión, tal como lo cuenta el servidor. Ausente = ninguno. */
  dispositivo?: DispositivoElegido;
  /** La última medida de la máquina, para la lista. Ausente = todavía no llegó. */
  dispositivos?: InformeDeDispositivos;
  /**
   * El modo de escritura de la sesión abierta. Ausente = no hay sesión, y entonces no se
   * pinta pastilla — nunca significa «supervisado».
   */
  modoDeEscritura?: ModoDeEscritura;
  /** Cambiar el modo. Ausente = no se pinta pastilla, como las otras tres. */
  alElegirModoDeEscritura?: (modo: ModoDeEscritura) => void;
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
      {/*
        `data-con-texto` abre la caja aunque no tenga el foco: un borrador a medias es
        trabajo empezado, y plegarle los controles a quien vuelve de mirar un fichero sería
        esconderle con qué modelo iba a mandarlo. Lo demás lo decide `:focus-within` en CSS
        y no un `onBlur` en React, y esa elección no es de estilo: con estado de React, al
        tabular desde el campo el navegador desmontaría la pastilla ANTES de que el foco
        llegara a ella y se quedaría en el `<body>`. Con `:focus-within` el campo todavía
        tiene el foco cuando se calcula el estilo, así que la banda está a la vista y el Tab
        la alcanza.
      */}
      <div
        className={estilos.compositor}
        data-trabajando={turnoEnVuelo ? "" : undefined}
        data-con-texto={valor === "" ? undefined : ""}
      >
        {/*
          **La banda de ARRIBA: con qué va a correr esto.** Modelo, esfuerzo y dispositivo
          viven encima del campo y separados por un filete, que es la forma de la maqueta de
          Stitch — y la que parte la caja por lo que significa cada mitad: arriba se
          configura el motor, abajo se decide qué pasa con lo que escriba y se manda.

          Ya estuvieron arriba una vez y volvieron abajo mirando la pantalla, con un
          argumento que hay que respetar: «un chip solo no era una fila, era un renglón».
          Entonces subía el dispositivo SOLO; aquí suben tres controles y abajo se quedan el
          modo, el gasto y el botón, así que ninguna de las dos bandas es un renglón huérfano.
        */}
        <div className={estilos.motor}>
          {/*
            **Lo consumido por la sesión, arriba a la izquierda.** Es un dato que se MIRA y
            no se toca, así que vive en la banda del estado y no junto a la acción: abajo
            compartía sitio con el botón de enviar, que es lo único de la caja que no es
            información.

            Conserva su caja propia porque de ella cuelga la regla que lo retira cuando el
            renglón no da de sí — el nombre de su clase lo hashea su módulo y desde aquí no
            se alcanza. Sin dato no se pinta: ausente es «no consta», no cero.
          */}
          <div className={estilos.gasto}>
            <ContadorDeTokens {...(consumo === undefined ? {} : { consumo })} />
          </div>
          {/*
            El dispositivo, arriba a la derecha, con el gasto al otro extremo: los dos son
            de la SESIÓN y se miran, no se pelean por el turno que vas a mandar. Ya no está
            al lado del modelo porque el modelo se ha ido abajo, con lo que decide el turno.
          */}
          {alElegirDispositivo === undefined ? null : (
            /* En su propia caja porque de ahí cuelga el `margin-left: auto` que lo manda al
               otro extremo de la banda: sin envoltorio habría que nombrar la clase de la
               pastilla, que vive en otro módulo y va hasheada. */
            <div className={estilos.dispositivo}>
              <PastillaDeDispositivo
                {...(dispositivo === undefined ? {} : { elegido: dispositivo })}
                {...(dispositivos === undefined ? {} : { informe: dispositivos })}
                conectado={conectado}
                alElegir={alElegirDispositivo}
              />
            </div>
          )}
        </div>
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
                : // DOS líneas: lo que el harness sabe hacer, y debajo las teclas.
                  //
                  // Las teclas estaban en un `<p>` bajo la tarjeta y se han metido aquí para
                  // devolverle ese renglón al transcript, que es lo único elástico de la
                  // columna. Caben porque la caja en reposo mide 48 px, que son dos líneas:
                  // el aviso de «con la ventana estrecha el largo partía en dos» dejó de
                  // aplicar cuando las pastillas se pliegan y ya no hay contra qué apretar.
                  //
                  // **Y el precio declarado**: un placeholder se va en cuanto escribes, o
                  // sea que la ayuda desaparece justo mientras redactas un párrafo largo,
                  // que es cuando saber que Enter envía más importa. Lo que lo hace
                  // aceptable es que las dos teclas se aprenden una vez; si resulta que no,
                  // el sitio sin coste es el hueco libre de la banda de abajo.
                  "Pregunta sobre XOne, o /comando…\nEnter envía · Shift+Enter salta de línea"
          }
          /* Los ejemplos, donde caben: el placeholder se lee en cada turno y tiene que
             caber en una línea; esto se consulta una vez. */
          title="Pregunta sobre la plataforma, pide un cambio en una colección o en un script, o escribe /comando"
          onChange={(evento) => setValor(evento.target.value)}
          onKeyDown={alPulsarTecla}
        />
        {/*
          **La banda de ABAJO: qué pasa con lo que escriba, y mandarlo.** El modo de
          escritura a la izquierda; el gasto y la acción a la derecha. El «+» y la pastilla
          de permisos de la referencia siguen sin estar por el motivo de siempre: no hay
          dato ni acción detrás, y un control así es la misma mentira que una lista vacía
          rellenada con un placeholder.
        */}
        <div className={estilos.controles}>
          {/*
            El MODO DE ESCRITURA abre esta banda, y no está arriba con las otras tres a
            propósito: aquéllas dicen CON QUÉ va a correr, y ésta qué va a pasar con lo que
            escriba — que es la misma pregunta que contestan el gasto y el botón de al lado.
            Sin sesión no hay modo y no se pinta: un control sin dato detrás no se pinta.
          */}
          {alElegirModoDeEscritura === undefined ? null : (
            <SelectorDeModo
              {...(modoDeEscritura === undefined ? {} : { actual: modoDeEscritura })}
              conectado={conectado}
              alElegir={alElegirModoDeEscritura}
            />
          )}
          {/*
            **El motor, abajo a la derecha, pegado al botón.** Modelo y esfuerzo son lo que
            va a CORRER con lo próximo que mandes, así que se leen justo antes de pulsar —
            que es donde está el botón. Y de paso arreglan un límite del plegado: la banda
            de arriba se va en reposo, así que ahí el modelo en vigor dejaba de verse; aquí
            está siempre.

            Va DENTRO de `.acciones` y no al lado con su propio `margin-left: auto`, que es
            la lección ya pagada: los márgenes automáticos se REPARTEN el hueco libre, y con
            dos el conjunto se quedaría flotando a mitad de fila en vez de junto al botón.
          */}
          <div className={estilos.acciones}>
            {/*
              Modelo y esfuerzo en UNA caja con separador interno. Es lo que el código ya
              decía y la forma no sostenía: «el esfuerzo no es una elección independiente, es
              un ajuste DE ese modelo — qué niveles hay depende de cuál esté puesto». Estaban
              pegados y se leían como dos elecciones hermanas.

              La clase sale de `PastillaDeModelo.module.css`, la hoja que ya comparten las
              pastillas: el nombre de un módulo CSS va hasheado, así que agrupar desde aquí dos
              componentes de esa familia solo se puede nombrando su hoja. Y ahí es donde tiene
              que vivir la regla, que es de la familia y no de este renglón.
            */}
            <div className={pastillas.conjunto}>
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
                El esfuerzo, DENTRO de la misma caja que el modelo: no es una elección
                independiente, es un ajuste DE ese modelo — qué niveles hay depende de cuál
                esté puesto, y la mitad de los modelos de este harness no admiten ninguno.
                Por eso se pinta solo cuando el servidor manda niveles, y por eso lleva el
                rótulo `pensar:` delante: un «low» a secas junto al nombre del modelo se lee
                como parte del modelo.
              */}
              {alElegirEsfuerzo === undefined ? null : (
                <PastillaDeEsfuerzo
                  {...(modelos?.esfuerzo === undefined ? {} : { niveles: modelos.esfuerzo.niveles })}
                  {...(modelos?.esfuerzo?.actual === undefined ? {} : { actual: modelos.esfuerzo.actual })}
                  {...(modelos?.esfuerzo?.nota === undefined ? {} : { nota: modelos.esfuerzo.nota })}
                  conectado={conectado}
                  alElegir={alElegirEsfuerzo}
                />
              )}
            </div>
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
                {/* El glifo de la maqueta en vez del carácter `↑`, que dependía de la
                    fuente del sistema y se pintaba de un peso distinto en cada una. */}
                <IconoDeEnviar />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
