import estilos from "./QuienEjecutaTareas.module.css";

/**
 * Quién ejecuta las tareas de esta máquina, cuando no es este proceso. UNA pieza para el
 * kanban del escritorio y la lista del proyecto — la tercera vez que se aplica la regla
 * (`AccionesDeTarea`, `EntregaDeTarea`): son TRES frases y escribirlas dos veces es cómo una
 * de las dos copias acaba diciendo otra cosa.
 *
 * **Y son tres porque «no soy yo» y «no hay nadie» significan lo contrario** (F4 de la
 * revisión final, segunda vuelta). El aviso decía solo lo primero —«ábrelo desde el proceso
 * que las corre para verlas moverse»— y eso manda a ESPERAR a un proceso que puede no
 * existir: una tarea quieta con un mensaje que promete movimiento es peor que una quieta y
 * muda.
 *  - **La ejecuta otro proceso**: aquí no avanza, pero allí sí, así que hay a quién esperar.
 *    Con la mitad que falta y que nadie decía: una tarea creada AQUÍ no dispara nada allí
 *    —`revisar()` sale en `!miCerrojo`, sin temporizador ni IPC—, así que se queda en
 *    «Nuevo» hasta que ese proceso mire la cola por su cuenta.
 *  - **No la ejecuta nadie**: el cerrojo estuvo en este proceso y se soltó (el arranque de
 *    las tareas falló), así que no hay a quién esperar y lo que hay que hacer es distinto.
 *  - **No se sabe**: el cerrojo ni se pudo consultar, o esta ejecución no tiene corredor.
 *    Entonces no se afirma ninguna de las dos — la regla de siempre con lo que no se ha
 *    medido, y aquí especialmente, porque las dos afirmaciones mandan a hacer cosas
 *    distintas.
 *
 * **El pid no aparece** aunque el corredor lo conozca: es un dato de la máquina, no le dice
 * nada a quien lo lee, y esto viaja por un cable que puede ir por un túnel.
 */
export function QuienEjecutaTareas({
  corriendoAqui,
  ejecutaOtroProceso,
  /** Qué se queda quieto: «este kanban» o «esta lista». Lo único que cambia entre vistas. */
  donde,
}: {
  corriendoAqui: boolean;
  /** Ausente = no se sabe. Ver el docblock: no es lo mismo que `false`. */
  ejecutaOtroProceso?: boolean;
  donde: string;
}) {
  if (corriendoAqui) return null;
  return (
    <p className={estilos.aviso} role="note">
      {ejecutaOtroProceso === true ? (
        <>
          Las tareas las ejecuta otro proceso: aquí se ven, pero {donde} no avanza — ábrelo
          desde el proceso que las corre para verlas moverse. Y una tarea que crees desde
          aquí se queda en «Nuevo» hasta que ese proceso vuelva a mirar la cola por su cuenta
          —al acabar otra tarea, o al reiniciarlo—: no se le avisa.
        </>
      ) : ejecutaOtroProceso === false ? (
        <>
          Ahora mismo no las ejecuta nadie en esta máquina: aquí falló el arranque de las
          tareas de fondo, y no hay ningún otro proceso con la cola. Una tarea que crees
          desde aquí se queda en «Nuevo» y no va a arrancar hasta que una consola tome el
          relevo — reinicia esta.
        </>
      ) : (
        <>
          Aquí no se ejecutan las tareas, y no se ha podido saber si las ejecuta otro proceso:
          una que crees desde aquí puede quedarse en «Nuevo» sin que nadie la coja.
        </>
      )}
    </p>
  );
}
