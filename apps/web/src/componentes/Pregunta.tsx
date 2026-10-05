import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Input, Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import type { DecisionDeConsola } from "../tipos.js";
import { arbolDeRutas } from "../arbolDeRutas.js";
import { Arbol } from "./Arbol.js";
import estilos from "./Pregunta.module.css";

/*
 * Las dos caras de una decisión, tal como las lee `interpretAnswer` (`vendor/hitl.ts`): `"s"`
 * autoriza y CUALQUIER otra cosa rechaza. No es vocabulario de esta piel —`"n"` explícito en
 * vez de la cadena vacía porque aquí no hay campo del que salga vacío—, y por eso los botones
 * no inventan nada: mandan las dos respuestas que el servidor ya sabe interpretar.
 */
const SI = "s";
const NO = "n";

/** El `onClose` del modal de una decisión: no cierra. Solo los botones contestan. */
const SIN_CERRAR = (): void => {};

/**
 * Lo que pasa DESPUÉS de aceptar una operación de sincronización —subir o «Actualizar repo
 * local»—, para que el diálogo no se cierre en el acto: tardan, y cerrarlo al pulsar dejaba a la
 * persona sin saber si había terminado, ni cómo, ni por qué falló.
 *
 * - `trabajando`: Aceptar gira, Cancelar (y las casillas de la subida) se bloquean.
 * - `terminada`: el diálogo dice cómo fue y un único «Aceptar» lo cierra. Todo viene como DATO
 *   en el acto de la operación (`core/actos.ts`): `resultado` (el recuento de una subida),
 *   `bajados` (lo que trajo una bajada) y `error` (lanzó, con el mismo texto que se dijo en el
 *   hilo). Sin ninguno, NO se pinta como «todo bien». `motivo` cubre lo que no viene del
 *   servidor (el cable que se cae).
 */
export type ProgresoDeOperacion =
  | { fase: "trabajando"; operacion: "subir" | "bajar" }
  | {
      fase: "terminada";
      operacion: "subir" | "bajar";
      resultado?: { subidos: number; fallidos: number; avisos?: string[] };
      bajados?: number;
      error?: string;
      lineas: readonly string[];
      motivo?: string;
    };

/**
 * La pregunta de texto libre, la del secreto y la de una DECISIÓN: el `consola.preguntar`
 * y el `consola.leerSecreto` del servidor, con un sitio donde contestarlos.
 *
 * Sin esto no había ninguno. El compositor manda TODO como `{clase:"prosa"}`, que entra
 * por la cola de líneas del lazo (`consolaWeb.ts#recibir`), así que una pregunta no se
 * resolvía **ni acertando el texto**: el usuario tecleaba «s», el turno seguía esperando y
 * la «s» se quedaba en la cola como si fuera la petición siguiente. Lo que se manda desde
 * aquí es `{clase:"respuesta"}` (o `{clase:"secreto"}`), que es lo único que despierta a la
 * cola correspondiente.
 *
 * Los comandos que caen aquí hoy: la decisión de una subida a CloudStudio —el
 * «¿Subir a CloudStudio?» que `politicaInteractiva` formula sin pista de tecleo, porque en
 * el terminal esa pista la añade la piel que tiene el teclado—, `/connect-studio` sin URL,
 * y —por la vía del secreto— `/provider <x>` y el paso de cuenta del alta.
 *
 * **Es UN componente y no tres.** La diferencia entre las dos preguntas de texto es que el
 * secreto no se enseña, y eso son dos atributos del `<input>`; la tercera no se contesta
 * escribiendo, y eso es `decision`. El mensaje que se manda lo decide quien lo monta, que
 * es donde vive el cable. Tres componentes serían tres sitios donde arreglar el mismo fallo
 * de envío.
 *
 * **Y la decisión se DICE, no se adivina** (`DecisionDeConsola`): con `decision` puesta la
 * tarjeta enseña el plan —lo que se va a subir, que es lo que hace falta tener delante para
 * contestar— y ofrece Aceptar/Cancelar sin campo de texto. Leer el `[s/N]` del enunciado
 * para decidir esto era la otra forma, y es peor por lo mismo que en todas partes: es
 * SINTAXIS, y el día que el prompt se reescriba la tarjeta ofrecería un editor para una
 * decisión —o dos botones sobre una pregunta abierta— sin un solo error que lo delate. Por
 * eso el enunciado llega sin la pista: aquí no hay nada que teclear, y enseñar «[s/N]»
 * delante de dos botones manda a escribir donde no hay dónde.
 *
 * **Y esa tarjeta es un DIÁLOGO, no un renglón más de la conversación.** Nació como una
 * tarjeta dentro de la columna del chat —hermana del transcript, entre él y el compositor— y
 * ahí no se puede centrar: la columna la reparte el transcript, que es lo elástico, así que
 * la tarjeta caía pegada al compositor, en el fondo de la pantalla, lejos de lo que se está
 * mirando. Medido en el uso normal: los botones de subida están en la banda de Revisión, o
 * sea ARRIBA, y la pregunta aparecía abajo. Sale por un portal sobre el `body` con el mismo
 * velo centrado que las otras ventanas (`Aprobacion`, `NuevaSesion`), que es lo que la pone
 * delante de quien tiene que contestar.
 *
 * La decisión es además lo ÚNICO que se pregunta así porque es lo único que es una PUERTA y
 * no una mitad de conversación: la pregunta de texto y el secreto se contestan dentro del
 * hilo —el enunciado, el campo y lo que sigue—, mientras que aquí no hay nada que teclear y
 * al otro lado hay un turno parado esperando un sí o un no. Por eso `anidado` NO llega a
 * esta rama: significa «sin borde propio, para no anidar dos cajas iguales», y un diálogo no
 * tiene ninguna caja alrededor en la que anidarse.
 *
 * **Es un modal DE VERDAD: solo se cierra con sus botones.** Solo «Aceptar» autoriza y solo
 * «Cancelar» rechaza; Escape y el clic fuera NO hacen nada. Antes rechazaban, y era tirar sin
 * querer una subida que se estaba revisando —el plan es largo y se lee con calma, y un clic
 * fuera de la tarjeta la descartaba entera—. Sigue siendo fail-closed: lo que nadie contesta lo
 * salda el plazo del servidor como rechazo.
 *
 * **Con `decision.seleccionable` el plan es un ÁRBOL con casillas** (la subida a CloudStudio):
 * el mismo `Arbol` de Revisión con la misma letra A/M/D, todo abierto y todo marcado al nacer
 * —Aceptar sin tocar nada sube lo mismo que antes—, «Seleccionar todo» y «Deseleccionar todo»
 * arriba, y Aceptar apagado con nada marcado. La respuesta lleva las rutas marcadas; qué se
 * sube lo vuelve a decidir el servidor cruzándolas con su plan.
 *
 * Y no hay una tercera salida, que es la diferencia con el modal de la aprobación: allí
 * desmontar sin contestar también rechaza, y aquí NO se contesta nada. La razón es de dónde
 * viene el desmontaje —allí lo provoca quien monta la pregunta, así que desmontar y no haber
 * contestado son el mismo suceso; aquí lo provoca el store al llegar la pregunta siguiente, y
 * confundirlos sería inventar una respuesta—. Lo que se quede sin contestar lo salda el
 * servidor a su plazo (`consolaWeb.ts#MS_DE_ESPERA_POR_OMISION`) devolviendo cadena vacía,
 * que `interpretAnswer` ya lee como rechazo: el retraso, nunca la dirección.
 *
 * **El secreto no entra en el estado del cliente**: vive en el `useState` de aquí y sale
 * por `alResponder`. `consolaWeb.ts#leerSecreto` solo anota la PREGUNTA en el transcript, y
 * este componente es el otro extremo de ese trato.
 *
 * Contestar en blanco es una respuesta legítima y no un fallo: es exactamente lo que
 * contesta un readline cerrado, y aguas abajo `interpretAnswer` lo trata como un «no».
 */
export function Pregunta({
  texto,
  oculta = false,
  alResponder,
  anidado = false,
  decision,
  progreso,
  alCerrar,
}: {
  texto: string;
  /** La forma `leerSecreto`: campo de contraseña y sin autocompletado del navegador. */
  oculta?: boolean;
  /**
   * Devuelve una promesa si el envío es asíncrono —lo es: es un `POST`—. Se ESPERA antes de
   * dar la respuesta por entregada: retirar la pregunta con el envío fallido dejaría al
   * usuario creyendo que contestó, mientras el servidor sigue esperando hasta su plazo.
   */
  alResponder: (respuesta: string, seleccion?: string[]) => void | Promise<unknown>;
  /**
   * `true` dentro de `TarjetaDeAlta` (la clave de API del paso de cuenta): sin borde ni
   * fondo propio, para no anidar dos cajas iguales — ver `Selector.tsx`, mismo motivo y
   * mismo nombre de prop. `false` (omisión) es mitad de conversación, donde sí hace
   * falta la tarjeta entera.
   */
  anidado?: boolean;
  /**
   * La FORMA de la respuesta, cuando es sí o no. Presente, la tarjeta no tiene campo: pinta
   * `lineas` y dos botones. Ausente, pregunta de texto libre, que es lo de siempre.
   */
  decision?: DecisionDeConsola;
  /** Una decisión de sincronización: qué pasa tras aceptar (ver `ProgresoDeOperacion`). */
  progreso?: ProgresoDeOperacion;
  /** El «Aceptar» del final, con `progreso.fase === "terminada"`: lo cierra todo. */
  alCerrar?: () => void;
}) {
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [falloDeEnvio, setFalloDeEnvio] = useState(false);
  const montado = useRef(true);

  // Se pone a `true` en el montaje además de a `false` en la limpieza: `<StrictMode>` monta,
  // desmonta y vuelve a montar en desarrollo, y sin el `true` del montaje el componente se
  // quedaría marcado como desmontado para siempre.
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  /**
   * El envío, común a las tres formas: un segundo envío mientras el primero vuela sacaría
   * DOS resolutores de la cola FIFO del servidor, y el segundo se comería la respuesta de
   * la pregunta siguiente.
   */
  const responder = (respuesta: string, seleccion?: string[]): void => {
    if (enviando) return;
    setEnviando(true);
    setFalloDeEnvio(false);
    void Promise.resolve(seleccion === undefined ? alResponder(respuesta) : alResponder(respuesta, seleccion)).catch(() => {
      if (!montado.current) return;
      setEnviando(false);
      setFalloDeEnvio(true);
    });
  };

  const fallo = falloDeEnvio ? (
    <p className={estilos.fallo} role="alert">
      La respuesta no llegó a xonecode: el envío falló. Vuelve a enviarla cuando la
      conexión se recupere.
    </p>
  ) : null;

  if (decision !== undefined && decision.seleccionable === true) {
    return (
      <DecisionConSeleccion
        texto={texto}
        decision={decision}
        enviando={enviando}
        fallo={fallo}
        alResponder={responder}
        {...(progreso === undefined ? {} : { progreso })}
        {...(alCerrar === undefined ? {} : { alCerrar })}
      />
    );
  }

  if (decision !== undefined && progreso?.fase === "terminada") {
    return <FinDeLaOperacion texto={texto} progreso={progreso} alCerrar={alCerrar ?? SIN_CERRAR} />;
  }

  if (decision !== undefined) {
    const trabajando = progreso?.fase === "trabajando";
    // El enunciado va ARRIBA y como título, con el plan debajo: la tarjeta se lee como un
    // aviso —qué se pregunta, y qué se decide— y no como un formulario, donde el rótulo se
    // pega a su campo. Y no lleva `<form>`: sin campo no hay envío por Enter, y **eso es
    // deliberado** — en el terminal el Enter a secas tampoco aprueba esta pregunta.
    //
    // Las líneas van en un `<pre>` —el plan se lee en columna, signo y ruta, y ahí los
    // espacios cuentan— pero **una por `<span>`**, cada una con su `data-cambio`: es lo que
    // permite colorear lo que se añade y lo que se borra. El `cambio` viaja como DATO; leer
    // el `+`/`~`/`-` del texto sería leer sintaxis, y el día que cambie la sangría un
    // borrado saldría en verde sin que nada avise. Los saltos de línea van como nodos de
    // texto entre los `span`, así que el contenido del `<pre>` sigue siendo el plan entero,
    // carácter a carácter, igual que antes de partirlo.
    //
    // Se acota su alto con scroll en vez de empujar los botones fuera de la tarjeta: lo
    // único que no puede quedarse sin ver es la acción.
    return (
      <Modal
        open
        // Escape llega por aquí, y NO cierra: es un modal de verdad (ver la cabecera). Solo
        // los botones contestan.
        onClose={SIN_CERRAR}
        // El nombre accesible del diálogo ES el enunciado: `headless` no pinta cabecera
        // propia, así que sin esto el `dialog` se anunciaría sin decir de qué es.
        title={texto}
        headless
        className={estilos.capa}
      >
        {/* El velo es NUESTRO y no el `mask` del paquete —ese es un `<div aria-hidden="true">`
            sin clase, o sea que ni se pinta ni se puede pulsar—. Pincharlo no hace nada. */}
        <div className={estilos.velo}>
          <div className={estilos.pregunta}>
            <p className={estilos.titulo}>{texto}</p>
            <pre className={estilos.plan}>
              {decision.lineas.map((linea, i) => (
                <Fragment key={i}>
                  {i > 0 ? "\n" : null}
                  <span data-cambio={linea.cambio}>{linea.texto}</span>
                </Fragment>
              ))}
            </pre>
            <div className={estilos.decisiones}>
              <Button
                type="button"
                variant="primary"
                className={estilos.accion}
                disabled={enviando || trabajando}
                aria-busy={trabajando}
                onClick={() => responder(SI)}
              >
                {trabajando ? <span className={estilos.girando} aria-hidden="true" /> : null}
                {trabajando ? (progreso.operacion === "bajar" ? "Actualizando…" : "Subiendo…") : "Aceptar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={estilos.cancelar}
                disabled={enviando || trabajando}
                onClick={() => responder(NO)}
              >
                Cancelar
              </Button>
            </div>
            {fallo}
          </div>
        </div>
      </Modal>
    );
  }

  const id = oculta ? "pregunta-secreto" : "pregunta-respuesta";

  return (
    <form
      className={estilos.pregunta}
      data-anidado={anidado ? "" : undefined}
      onSubmit={(evento: FormEvent) => {
        evento.preventDefault();
        responder(valor);
      }}
    >
      <label className={estilos.enunciado} htmlFor={id}>
        {texto}
      </label>
      <div className={estilos.fila}>
        <Input
          id={id}
          className={estilos.envoltorio}
          autoFocus
          type={oculta ? "password" : "text"}
          autoComplete={oculta ? "off" : undefined}
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
        />
        {/*
          Relleno cuando la pregunta flota sola sobre el transcript —ahí es LA acción de la
          pantalla— y de contorno cuando va anidada dentro de una fila de ajustes, donde
          tiene al lado a «Cambiar clave» y «Eliminar»: un botón relleno entre dos de
          contorno se lee como si fuera otra cosa, y desde el rediseño el relleno primario
          es casi blanco en oscuro, que sobre la fila cantaba todavía más.
        */}
        <Button
          type="submit"
          variant={anidado ? "outline" : "primary"}
          className={estilos.accion}
          disabled={enviando}
        >
          Aceptar
        </Button>
      </div>
      {fallo}
    </form>
  );
}

/**
 * El diálogo de una decisión SELECCIONABLE: el plan como árbol con casillas. El porqué está
 * en la cabecera de `Pregunta`; aquí solo vive lo marcado, que es de este diálogo y muere con él.
 */
function DecisionConSeleccion({
  texto,
  decision,
  enviando,
  fallo,
  alResponder,
  progreso,
  alCerrar,
}: {
  texto: string;
  decision: DecisionDeConsola;
  enviando: boolean;
  fallo: ReactNode;
  alResponder: (respuesta: string, seleccion?: string[]) => void;
  progreso?: ProgresoDeOperacion;
  alCerrar?: () => void;
}) {
  const subiendo = progreso?.fase === "trabajando";
  // Las líneas que hablan de un fichero, con lo que le pasa: la cabecera no lleva `ruta`.
  const ficheros = useMemo(
    () =>
      decision.lineas.flatMap((linea) =>
        linea.ruta === undefined ? [] : [{ ruta: linea.ruta, cambio: linea.cambio ?? "modificado" }]
      ),
    [decision]
  );
  const nodos = useMemo(() => arbolDeRutas(ficheros.map((f) => f.ruta)), [ficheros]);
  const cambioDe = useMemo(() => new Map(ficheros.map((f) => [f.ruta, f.cambio])), [ficheros]);
  // Todo marcado al nacer: Aceptar sin tocar nada sube lo mismo que antes de poder elegir.
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(() => new Set(ficheros.map((f) => f.ruta)));
  const total = ficheros.length;
  const cuantas = ficheros.filter((f) => marcadas.has(f.ruta)).length;
  // Desde que se acepta, nada de lo elegido se puede tocar: ni casillas, ni atajos, ni Cancelar.
  const bloqueado = enviando || subiendo;

  if (progreso?.fase === "terminada") {
    return <FinDeLaOperacion texto={texto} progreso={progreso} alCerrar={alCerrar ?? SIN_CERRAR} />;
  }

  return (
    <Modal open onClose={SIN_CERRAR} title={texto} headless className={estilos.capa}>
      <div className={estilos.velo}>
        <div className={estilos.pregunta} data-seleccionable="">
          <p className={estilos.titulo}>{texto}</p>
          <div className={estilos.herramientas}>
            <span className={estilos.cuenta} aria-live="polite">
              {cuantas} de {total} {total === 1 ? "fichero" : "ficheros"}
            </span>
            <button
              type="button"
              className={estilos.enlace}
              disabled={bloqueado || cuantas === total}
              onClick={() => setMarcadas(new Set(ficheros.map((f) => f.ruta)))}
            >
              Seleccionar todo
            </button>
            <button
              type="button"
              className={estilos.enlace}
              disabled={bloqueado || cuantas === 0}
              onClick={() => setMarcadas(new Set())}
            >
              Deseleccionar todo
            </button>
          </div>
          <div className={estilos.arbol}>
            <Arbol
              nodos={nodos}
              alElegir={() => {}}
              abiertas="todas"
              variante="explorador"
              seleccion={{ marcadas, alCambiar: setMarcadas, bloqueada: bloqueado }}
              insignia={(ruta) => {
                const cambio = cambioDe.get(ruta) ?? "modificado";
                return (
                  <span className={estilos.clase} data-clase={cambio} aria-label={cambio}>
                    {cambio === "nuevo" ? "A" : cambio === "borrado" ? "D" : "M"}
                  </span>
                );
              }}
            />
          </div>
          <div className={estilos.decisiones}>
            <Button
              type="button"
              variant="primary"
              className={estilos.accion}
              disabled={bloqueado || cuantas === 0}
              aria-busy={subiendo}
              // Las marcadas en el ORDEN del plan, no en el de los clics.
              onClick={() => alResponder(SI, ficheros.filter((f) => marcadas.has(f.ruta)).map((f) => f.ruta))}
            >
              {subiendo ? <span className={estilos.girando} aria-hidden="true" /> : null}
              {subiendo ? "Subiendo…" : "Aceptar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={estilos.cancelar}
              disabled={bloqueado}
              onClick={() => alResponder(NO)}
            >
              Cancelar
            </Button>
          </div>
          {fallo}
        </div>
      </div>
    </Modal>
  );
}

/**
 * El final de una operación de sincronización, en el MISMO diálogo: cómo fue y un único
 * «Aceptar» que lo cierra.
 *
 * «Todo bien» SOLO con el dato delante: el recuento sin un fallo (subir) o lo bajado (bajar).
 * Con `error` se dice que no se pudo y POR QUÉ, en vez de mandar a buscarlo al hilo. Sin dato
 * —la operación no terminó con informe, o se cayó el cable— se dice que no se sabe y se enseña
 * lo que la operación contó, que es lo que hace falta para decidir qué hacer.
 */
function FinDeLaOperacion({
  texto,
  progreso,
  alCerrar,
}: {
  texto: string;
  progreso: Extract<ProgresoDeOperacion, { fase: "terminada" }>;
  alCerrar: () => void;
}) {
  const { resultado, bajados, error, operacion } = progreso;
  const subir = operacion === "subir";
  const bien =
    error === undefined &&
    (subir ? resultado !== undefined && resultado.fallidos === 0 && resultado.subidos > 0 : bajados !== undefined);
  let titulo: string;
  let detalle: string;
  if (error !== undefined) {
    titulo = subir ? "No se ha podido subir" : "No se ha podido actualizar el repo local";
    detalle = error;
  } else if (!subir) {
    titulo = bien ? "Repo local actualizado" : "La actualización no ha terminado bien";
    detalle =
      bajados !== undefined
        ? `${bajados} ${bajados === 1 ? "fichero bajado" : "ficheros bajados"} de la rama.`
        : (progreso.motivo ?? "No consta cómo terminó. Esto es lo que contó la operación:");
  } else if (bien && resultado !== undefined) {
    titulo = "Todo subido correctamente";
    detalle = `${resultado.subidos} ${resultado.subidos === 1 ? "fichero subido" : "ficheros subidos"} a CloudStudio.`;
  } else if (resultado === undefined) {
    titulo = "La subida no ha terminado bien";
    detalle = progreso.motivo ?? "No consta cómo terminó. Esto es lo que contó la operación:";
  } else if (resultado.subidos === 0 && resultado.fallidos === 0) {
    titulo = "No se ha subido nada";
    detalle = `Subidos ${resultado.subidos}, fallaron ${resultado.fallidos}. Lo que falló sigue pendiente y se reintenta en la próxima subida.`;
  } else {
    titulo = "La subida ha terminado con fallos";
    detalle = `Subidos ${resultado.subidos}, fallaron ${resultado.fallidos}. Lo que falló sigue pendiente y se reintenta en la próxima subida.`;
  }
  // Lo que contó la operación, solo cuando no fue bien: con todo subido sobra.
  const lineas = bien ? [] : progreso.lineas.slice(-12);
  // Lo que no se pudo CONFIRMAR se enseña SIEMPRE, también con todo subido: es justo cuando
  // el recorrido se esconde, y un aviso que no se ve es un aviso que no existe.
  const avisos = subir && error === undefined ? (resultado?.avisos ?? []) : [];

  return (
    <Modal open onClose={SIN_CERRAR} title={texto} headless className={estilos.capa}>
      <div className={estilos.velo}>
        <div className={estilos.pregunta} data-seleccionable="">
          <div className={estilos.fin} data-bien={bien ? "" : undefined} role="status">
            <span className={estilos.marcaDeFin} aria-hidden="true">
              {bien ? "✓" : "!"}
            </span>
            <p className={estilos.titulo}>{titulo}</p>
            <p className={estilos.detalle}>{detalle}</p>
            {avisos.map((aviso) => (
              <p key={aviso} className={estilos.detalle} data-aviso="">
                Aviso: {aviso}.
              </p>
            ))}
          </div>
          {lineas.length === 0 ? null : <pre className={estilos.plan}>{lineas.join("\n")}</pre>}
          <div className={estilos.decisiones}>
            <Button type="button" variant="primary" className={estilos.accion} autoFocus onClick={alCerrar}>
              Aceptar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
