import { useEffect, useRef } from "react";
import type { EstadoDeSync } from "../tipos.js";
import estilos from "./CloudStudio.module.css";

/**
 * CloudStudio: de qué rama es este proyecto, cuánto queda por subir, y los dos botones.
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
 * **Y la cifra dice DE QUIÉN son los ficheros**, que es lo que la hace cuadrar con la lista
 * que tiene justo debajo. Las dos se miden contra referencias distintas —aquí la rama, ahí el
 * sello de la sesión— así que pueden no tocarse, y sin decirlo parecen contradecirse: medido
 * en el AppDemo del usuario el 16-09-2026, la banda decía «3 ficheros por subir» encima de
 * una sesión cuyos cambios no estaban entre esos 3 ni podían estarlo. `deLaSesion` ausente
 * —sin sesión, o con una sin sello— no se pinta: sería afirmar algo sobre quien escribió lo
 * de dentro.
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

export function CloudStudio({
  sync,
  alPedir,
  alRecargar,
  conectado,
}: {
  /** Ausente = todavía no ha llegado la lectura; con `error`, se pidió y no se pudo medir. */
  sync?: EstadoDeSync;
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
      </div>
    );
  }

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
        <button type="button" className={estilos.subir} onClick={() => alPedir("subir")}>
          Subir
        </button>
        <button type="button" className={estilos.bajar} onClick={() => alPedir("bajar")}>
          Bajar
        </button>
      </div>

      <p className={estilos.nota}>
        Subir pide el plan y lo apruebas en la pregunta de siempre. Bajar SOBRESCRIBE esta
        copia con lo que hay en la rama: lo que no esté commiteado se pierde. Las dos se
        niegan con cambios sin commitear, y lo que pasa —lo que sube, lo que no, y por qué—
        sale en el chat.
      </p>
    </div>
  );
}
