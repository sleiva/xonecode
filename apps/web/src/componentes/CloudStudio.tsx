import { useEffect, useRef } from "react";
import type { ActoDeSincronizacion, EstadoDeSync } from "../tipos.js";
import { selloDeFecha } from "../selloDeFecha.js";
import estilos from "./CloudStudio.module.css";

/**
 * CloudStudio: de qué rama es este proyecto, cuánto queda por subir, y las dos direcciones.
 *
 * **Es lo que contesta «¿tengo algo pendiente ahí arriba?» sin salir al terminal.** Hasta
 * ahora eso era `/sync estado` y nada más, y las otras dos acciones —el viaje de ida y el de
 * vuelta— vivían en un sitio donde hay que escribir la sintaxis.
 *
 * **No es una pestaña: es la BANDA de arriba de Revisión.** Tuvo la suya, y se fue de ahí el
 * día que se miró lo que contesta: «cuánto queda por subir» es la misma pregunta que contesta
 * Revisión —qué ha cambiado— medida contra otra referencia, la rama de la bajada en vez de la
 * foto de la sesión. Dos pestañas obligaban a ir y volver para cuadrar los dos números, y el
 * que se lee primero no tenía por qué estar a un clic del que explica de dónde sale. El
 * montaje sigue coincidiendo con lo que importa: se monta al abrir Revisión, y abrir Revisión
 * es entrar a mirar.
 *
 * **Los botones NO son un segundo camino de subida.** Mandan la intención
 * (`{clase:"sync"}`) y el servidor las aplica encolando `/sync subir` y `/sync bajar` en el
 * lazo, así que salen con el MISMO plan, la MISMA guarda de árbol sucio y la MISMA
 * aprobación del terminal — la pregunta es la de siempre, y es la que autoriza la escritura.
 * Aquí no hay `git push` ni podría haberlo: la copia la mueve `agent/subida.ts` llamando a
 * las tools MCP, y quién autoriza eso se decide en un solo sitio
 * (`core/cloudstudio.ts#PoliticaDeAprobacion`).
 *
 * **La lectura se REHACE al entrar, y esa es la diferencia con Ficheros y Revisión.** Allí
 * la foto la tira el servidor y hay un flanco que la anuncia; aquí envejece por dos caminos
 * de los que el servidor solo conoce uno: el agente escribe (hay más que subir) y `/sync`
 * sube (hay menos), y lo segundo no lo sabe nadie — una línea encolada no avisa de cuándo
 * termina, y adelantar la cifra «a ojo» sería una medida que nadie ha hecho. Entrar a mirar
 * ES la pregunta, así que montar vuelve a medir.
 *
 * **«No es de CloudStudio» NO es «cero pendientes»**, y por eso son dos frases distintas: un
 * proyecto offline tiene la pregunta sin respuesta, no la respuesta «nada».
 *
 * **Y con la subida al día, «Subir» no se pinta.** Con la medida en cero el plan sale vacío
 * —es la MISMA cuenta la que lo decide—, así que el botón no llevaría a ninguna parte: un
 * control que no puede hacer nada no es una opción, es una promesa. La mitad que importa de la
 * regla es la otra: **solo con un cero MEDIDO**. Sin cifra —no consta, o el `catch` de la
 * medida— el botón se queda, porque retirarlo afirmaría «no hay nada» sobre una pregunta sin
 * contestar. Y la nota de debajo deja de nombrarlo cuando no está: una ayuda sobre un botón
 * ausente manda a buscar lo que no hay.
 *
 * La otra dirección se llama **«Actualizar repo local»**, y el aviso de que PISA va pegado al
 * control en su `title` y no solo en la prosa de la nota —por qué, entero, en
 * `AVISO_DE_ACTUALIZAR`: el nombre nuevo dice la DIRECCIÓN, y se lee como el `git pull` que
 * esta operación no es.
 *
 * **Y la cifra dice DE QUIÉN son los ficheros**, que es lo que la hace cuadrar con la lista
 * que tiene justo debajo. Las dos se miden contra referencias distintas —aquí la rama, ahí el
 * sello de la sesión— así que pueden no tocarse, y sin decirlo parecen contradecirse: medido
 * en el AppDemo del usuario el 16-09-2026, la banda decía «3 ficheros por subir» encima de
 * una sesión cuyos cambios no estaban entre esos 3 ni podían estarlo. `deLaSesion` ausente
 * —sin sesión, o con una sin sello— no se pinta: sería afirmar algo sobre quien escribió lo
 * de dentro.
 *
 * **Y el recorrido de lo que pasó se cuenta AQUÍ, en el registro de abajo, no en el hilo.**
 * Antes cada operación volcaba sus líneas en el chat: el plan con su sangría, el `→ APROBADO`,
 * el recuento, y hasta los no-sucesos («no hay nada que subir»), nueve renglones de consola
 * entre dos mensajes de la conversación —medido en la pantalla que él mandó—. El hilo es la
 * conversación; una operación de git es un suceso del proyecto, y mezclarlos obligaba a buscar
 * la conversación entre el ruido de una subida. Aquí se lee como lo que es: una operación con
 * su hora y su nombre, y las líneas que el terminal habría impreso, agrupadas y plegadas. La
 * fuente es la misma que la del `case` de Trazas, y no se recompone nada.
 */

/**
 * La frase de la cuenta, con la procedencia cuando se PUDO atribuir.
 *
 * Va aparte del componente porque son cuatro casos y una decisión, no un detalle del render:
 * lo que se dice de la sesión depende de si se pudo atribuir, y las dos cosas se leen mejor
 * juntas que repartidas por el JSX.
 */
function cuentaDe(sync: EstadoDeSync): string {
  const cuantos = sync.pendientes;
  if (cuantos === undefined) return "No consta cuánto falta por subir.";
  if (cuantos === 0) return "No hay nada por subir: lo que está en esta copia ya está en la rama.";

  const cabeza = `${cuantos} ${cuantos === 1 ? "fichero" : "ficheros"} por subir`;
  const deLaSesion = sync.deLaSesion;
  // Ausente = no se pudo atribuir. No se pinta «ninguno»: sobre una sesión sin sello, la
  // lista de la que saldría ese cero incluye lo que escribiera cualquiera desde que se
  // abrió, así que el cero sería una afirmación sobre quien lo escribió.
  if (deLaSesion === undefined) return `${cabeza}.`;
  // Cero SÍ se pinta, y es el caso que motivó esto: se atribuyó y ninguno es suyo. El `>=`
  // y no `===` porque la cuenta es una intersección: si algún día llegara de más, «todos»
  // es la lectura segura y un «−1 de antes» no lo es.
  if (deLaSesion === 0) return `${cabeza}. Ninguno lo tocó esta sesión.`;
  if (deLaSesion >= cuantos) return `${cabeza}, y ${cuantos === 1 ? "lo tocó" : "los tocó"} esta sesión.`;
  return `${cabeza}: ${deLaSesion} de esta sesión y ${cuantos - deLaSesion} de antes.`;
}

/**
 * Lo que hay que saber ANTES de pulsar «Actualizar repo local».
 *
 * Vive en una constante porque lo dicen dos sitios —la nota de debajo y el `title` del propio
 * botón— y dos copias de la misma frase divergen: la de la nota se corrige cuando alguien mide
 * algo, la del `title` nadie la vuelve a leer.
 *
 * Y el `title` es lo que de verdad hace falta aquí, por una razón que no es de adorno: el
 * nombre del botón dice la DIRECCIÓN, no el precio. «Actualizar repo local» se lee como un
 * `git pull` —que fusiona y respeta lo tuyo— y lo que hace es PISAR la copia. O sea que el
 * nombre no es solo más suave que «Bajar»: nombra otra operación, la segura. Por eso el aviso
 * va pegado al control y no solo en la prosa de abajo, que se lee cuando ya se ha decidido.
 */
const AVISO_DE_ACTUALIZAR =
  "SOBRESCRIBE esta copia con lo que hay en la rama: lo que no esté commiteado se pierde.";

/**
 * Cómo se llama cada acción del protocolo en el registro.
 *
 * **Los mismos nombres que los BOTONES, y ahí está la decisión**: Trazas llama a estas filas
 * por el nombre del protocolo (`SUBIR` / `BAJAR` / `ESTADO`), que es lo que hace falta en el
 * registro completo del harness, pero esta banda es donde se pulsa, y un registro que
 * rebautizara lo que se acaba de pulsar obligaría a traducir mentalmente entre el botón y su
 * propia historia. La clase CSS de esa dirección sigue llamándose `.bajar` por el mismo
 * motivo invertido: el cable no se renombra por arreglar dos palabras de la pantalla.
 *
 * Es un `Record` sobre la unión entera y no un `switch` con `default`: una cuarta acción
 * —o un nombre que falte— sale en `tsc`, que es el mismo molde de `TIPOS_DE_ACTO` en el
 * store. `estado` no tiene hoy productor en la web (la banda MIDE en vez de encolar), y por
 * eso su nombre no se ve; se escribe igual, porque la unión tiene tres valores y un hueco
 * aquí es lo que se convertiría en un `undefined` pintado el día que lo tenga.
 */
const NOMBRE_DE_LA_ACCION: Record<ActoDeSincronizacion["accion"], string> = {
  subir: "Subir",
  bajar: "Actualizar repo local",
  estado: "Consultar el estado",
};

/**
 * El registro de las operaciones de sincronización de esta sesión, de la más reciente a la
 * más vieja.
 *
 * **Sin registro no se pinta NADA**, ni una cabecera vacía: ausente es «en esta sesión no se
 * ha sincronizado nada» y vacío no es un estado que exista —el acto solo nace cuando una
 * operación termina—, así que las dos cosas caen en el mismo `null` sin inventar un hueco.
 *
 * **La más reciente sale ABIERTA y el resto plegadas**, que es lo que se viene a mirar: se
 * acaba de pulsar un botón y lo que se quiere es el final de esa operación. Las de antes se
 * quedan a un clic, que es donde tienen que estar —una sesión larga acumula operaciones, y
 * todas desplegadas tapan la cifra de arriba, que es la que contesta la pregunta de la
 * banda—. El `open` va en la de índice 0 y el `key` es la identidad de la operación
 * —su acción y su instante de empezar—: sin eso React reusa el nodo de la posición 0 y la
 * operación nueva heredaría el plegado de la anterior, con lo que la de arriba podría
 * quedarse cerrada justo al llegar.
 *
 * Vive fuera del componente porque se pinta en DOS de sus ramas: la banda normal y la del
 * proyecto sin dar de alta. Un `return` temprano que se llevara por delante el registro
 * borraría la historia de una operación que sí ocurrió el día que alguien quite el alta.
 */
function Registro({ operaciones }: { operaciones?: readonly ActoDeSincronizacion[] }) {
  if (operaciones === undefined || operaciones.length === 0) return null;
  return (
    <section className={estilos.registro} aria-label="Registro de la sincronización">
      {operaciones.map((operacion, i) => {
        const sello = selloDeFecha(operacion.cuando);
        return (
          <details
            key={`${operacion.accion}-${operacion.cuando}`}
            className={estilos.operacion}
            open={i === 0}
          >
            <summary className={estilos.cabeceraDeOperacion}>
              <span className={estilos.accion}>{NOMBRE_DE_LA_ACCION[operacion.accion]}</span>
              {/* Sin sello si la fecha no se entiende: un «undefined» en la cabecera es peor
                  que una operación sin hora, que es lo que se ve si el acto trae algo raro. */}
              {sello === undefined ? null : (
                <span className={estilos.sello}>{` · ${sello}`}</span>
              )}
            </summary>
            <pre className={estilos.lineas}>{operacion.lineas.join("\n")}</pre>
          </details>
        );
      })}
    </section>
  );
}

export function CloudStudio({
  sync,
  registro,
  alPedir,
  alRecargar,
  conectado,
}: {
  /** Ausente = todavía no ha llegado la lectura; con `error`, se pidió y no se pudo medir. */
  sync?: EstadoDeSync;
  /**
   * Las operaciones de sincronización de esta sesión, **de la más reciente a la más vieja**.
   *
   * Es OPCIONAL por lo mismo que todo lo de arriba: una sesión sin sincronizar no tiene
   * registro, y ausente ≠ vacío ≠ cero también aquí. `App.tsx` la deriva de los actos y la
   * omite entera cuando no hay ninguno, en vez de pasar `[]`.
   */
  registro?: readonly ActoDeSincronizacion[];
  alPedir: (accion: "subir" | "bajar") => void;
  alRecargar: () => void;
  /** ¿Hay cable? Sin él no se pide nada: la petición se perdería sin decirlo. */
  conectado?: boolean;
}) {
  /**
   * El primer efecto conectado de esta banda. Existe para que «al entrar» y «si falta» no
   * sean dos efectos distintos pidiendo a la vez: en el montaje las dos condiciones se
   * cumplen, y dos peticiones iguales por un render es lo que este repo ya se quitó de
   * encima en Revisión.
   */
  const primeraMedida = useRef(true);
  const sinLectura = sync === undefined;
  useEffect(() => {
    if (conectado === false) return;
    const alEntrar = primeraMedida.current;
    primeraMedida.current = false;
    // Después del montaje solo se vuelve a pedir si NO hay lectura: el store la tira al
    // cambiar de sesión y al caerse el cable, y sin esto la banda se quedaría en
    // «Consultando» para siempre — el mismo fallo que se midió en Ficheros y en Revisión.
    if (!alEntrar && !sinLectura) return;
    alRecargar();
  }, [sinLectura, conectado, alRecargar]);

  if (sync === undefined) {
    return <p className={estilos.aviso}>Consultando la sincronización con CloudStudio…</p>;
  }

  // Sin proyecto ni rama: el proyecto no está dado de alta, o le falta la mitad del alta.
  // Se dice entero y no se pinta un contador a cero, que sería una respuesta a una pregunta
  // que aquí no se puede contestar.
  if (sync.proyecto === undefined || sync.rama === undefined) {
    return (
      <div className={estilos.panel}>
        <p className={estilos.aviso}>
          Este proyecto no está dado de alta en CloudStudio, así que no hay nada que subir ni
          que bajar. Se elige al abrir el proyecto —entorno, proyecto y rama—, y a partir de
          ahí esta banda enseña lo que hay pendiente.
        </p>
        {sync.error === undefined ? null : <p className={estilos.aviso}>{sync.error}</p>}
        <Registro operaciones={registro} />
      </div>
    );
  }

  /**
   * ¿Se retira «Subir»?
   *
   * **Solo con un CERO MEDIDO**, que es la mitad de la regla. `pendientes` sale de
   * `cambiosPendientes` contra la ref de seguimiento, que es la MISMA cuenta que decide qué
   * lleva el plan de subida, así que un cero quiere decir plan vacío: el botón no llevaría a
   * ninguna parte y ofrecerlo es prometer algo que no hay. Con `undefined` —no consta, o no se
   * pudo medir— el botón SE QUEDA, porque retirarlo sería afirmar «no hay nada» sobre una
   * pregunta que nadie ha contestado. Es la invariante de las cuatro capas de esta consola
   * —ausente ≠ vacío ≠ cero— aplicada a un botón en vez de a una cifra, y la dirección segura
   * es la que no esconde: un botón de más se pulsa y el árbol sucio lo para, uno de menos no
   * tiene vuelta.
   */
  const nadaQueSubir = sync.pendientes === 0;

  return (
    <div className={estilos.panel}>
      <div className={estilos.cabecera}>
        <span className={estilos.proyecto}>{sync.proyecto}</span>
        <span className={estilos.rama}>rama {sync.rama}</span>
        <button type="button" className={estilos.recargar} onClick={alRecargar}>
          Volver a mirar
        </button>
      </div>

      {sync.error !== undefined ? (
        // El fallo va con SU frase y no debajo de un cero: que no se pueda medir y que no
        // haya nada son dos cosas, y la primera no se arregla subiendo a ciegas.
        <p className={estilos.aviso}>{sync.error}</p>
      ) : sync.pendientes === undefined ? (
        <p className={estilos.aviso}>No consta cuánto falta por subir.</p>
      ) : (
        <p className={estilos.cuenta}>{cuentaDe(sync)}</p>
      )}

      <div className={estilos.botones}>
        {nadaQueSubir ? null : (
          <button type="button" className={estilos.subir} onClick={() => alPedir("subir")}>
            Subir
          </button>
        )}
        <button
          type="button"
          className={estilos.bajar}
          title={AVISO_DE_ACTUALIZAR}
          onClick={() => alPedir("bajar")}
        >
          Actualizar repo local
        </button>
      </div>

      {/* La nota habla SOLO de los botones que están delante. Con la subida al día, nombrar
          «Subir» sería la ayuda que describe un control que no existe — la misma regla que las
          teclas del compositor, que nombran solo las que son ciertas. Y lo que promete ya no es
          el chat: el recorrido de la operación se cuenta en el registro de abajo. */}
      <p className={estilos.nota}>
        {nadaQueSubir
          ? `«Actualizar repo local» ${AVISO_DE_ACTUALIZAR} Se niega con cambios sin commitear, y lo que pasa queda aquí abajo, en el registro de esta sesión.`
          : `Subir pide el plan y lo apruebas en la pregunta de siempre. «Actualizar repo local» ${AVISO_DE_ACTUALIZAR} Las dos se niegan con cambios sin commitear, y lo que pasa —lo que sube, lo que no y por qué— queda aquí abajo, en el registro de esta sesión.`}
      </p>

      <Registro operaciones={registro} />
    </div>
  );
}
