import { useEffect, useRef } from "react";
import type { EstadoDeSync } from "../tipos.js";
import estilos from "./CloudStudio.module.css";

/**
 * CloudStudio: de qué rama es este proyecto, cuánto queda por subir, y los dos botones.
 *
 * **Es la pestaña que contesta «¿tengo algo pendiente ahí arriba?» sin salir al terminal.**
 * Hasta ahora eso era `/sync estado` y nada más, y las otras dos acciones —el viaje de ida y
 * el de vuelta— vivían en un sitio donde hay que escribir la sintaxis.
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
 * ES la pregunta, así que montar (esta pestaña se monta al elegirla) vuelve a medir.
 *
 * **«No es de CloudStudio» NO es «cero pendientes»**, y por eso son dos frases distintas: un
 * proyecto offline tiene la pregunta sin respuesta, no la respuesta «nada».
 */

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
   * El primer efecto conectado de esta pestaña. Existe para que «al entrar» y «si falta» no
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
    // cambiar de sesión y al caerse el cable, y sin esto la pestaña se quedaría en
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
          ahí esta pestaña enseña lo que hay pendiente.
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
        <p className={estilos.cuenta}>
          {sync.pendientes === 0
            ? "No hay nada por subir: lo que está en esta copia ya está en la rama."
            : `${sync.pendientes} ${sync.pendientes === 1 ? "fichero" : "ficheros"} por subir.`}
        </p>
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
