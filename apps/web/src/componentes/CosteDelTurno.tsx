import type { ConsumoDeTurno } from "../tipos.js";
import { abreviar } from "../cifras.js";
import estilos from "./CosteDelTurno.module.css";

/**
 * Si un consumo tiene algo que enseñar.
 *
 * Un `{0, 0}` no se pinta: es la cifra que nadie midió, y en una línea de cierre afirmaría
 * que el turno salió gratis. Se declara aquí, donde se aplica, y la pregunta quien DECIDE si
 * hay línea que pintar —el bucle de `Chat.tsx`, que puede no crearla siquiera—: una regla y
 * una función, no dos copias que un día digan cosas distintas.
 */
export function hayCosteQueEnsenar(c: ConsumoDeTurno): boolean {
  return c.modelo.entrada + c.modelo.salida + c.externo.entrada + c.externo.salida > 0;
}

/**
 * Lo que costó ESTE turno: los dos totales, y la caché leída ahí mismo.
 *
 * Es el nivel que faltaba. El contador del compositor dice lo que lleva la conversación
 * —un acumulado que solo crece—, y con eso no se puede contestar «cuánto costó lo que acabo
 * de pedir»: hay que restar de cabeza. Aquí el turno lleva su propia cifra, en la línea que
 * ya lo resume, y por eso la caché vive AQUÍ y no en el contador: es una lectura del turno,
 * y puesta al lado de lo que costó se entiende sin explicación —«de la entrada, tanto vino
 * de caché»—, que es justo lo que no se entendía teniéndola en un `title`.
 *
 * Sin `consumo` no se pinta NADA: ausente es «no consta» —una sesión anterior a esto, o un
 * ejecutor que no mide—, y un `↑0 ↓0` afirmaría una medida que nadie hizo.
 *
 * Y las flechas van `aria-hidden`, así que el significado hay que darlo aparte: quien mira la
 * pantalla ve «↑ 8,8k ↓ 24» y lo entiende, pero quien lo oye recibiría «8,8k 24» sin saber
 * cuál es cuál. De ahí el `aria-label` — el `title` no basta, no se anuncia de forma fiable.
 */
export function CosteDelTurno({
  consumo,
  ambito = "turno",
}: {
  consumo: ConsumoDeTurno;
  /**
   * De qué habla la cifra: de ESTE turno (la línea que lo cierra) o de TODA la sesión (la fila
   * de la barra). Es una unión cerrada y no un texto libre: un prop de texto libre es como nacen
   * dos dialectos de la misma frase, y lo que se OYE aquí es la frase entera —«Trabajo de este
   * turno» en una fila de sesión diría que la sesión gastó lo de su último turno.
   *
   * Y en la fila cambia lo que se PINTA, no solo el rótulo. La línea que cierra un turno tiene
   * sitio y enseña el par —entrada y salida—, que es lo que se acaba de gastar y en qué
   * proporción; la fila de la barra no lo tiene: compite con el nombre de la sesión, que es lo
   * único elástico de una barra cuyo ancho pone el usuario. Así que ahí va **un solo número, el
   * total**, que es lo que se compara de un vistazo entre sesiones —un par no se compara, se
   * lee—, y el desglose por cuenta se queda en el `title`, que es donde se consulta. La CACHÉ
   * no entra nunca en la línea de la fila, por lo mismo: en el turno son ~60 px y aquí son los
   * que le faltan al título.
   *
   * La regla de cuándo no se pinta NADA es la MISMA en los dos ámbitos
   * (`hayCosteQueEnsenar`): un `{0,0}` no se pinta ni aquí ni allí.
   */
  ambito?: "turno" | "sesion";
}): React.ReactElement | null {
  const entrada = consumo.modelo.entrada + consumo.externo.entrada;
  const salida = consumo.modelo.salida + consumo.externo.salida;
  const cache = consumo.modelo.cache + consumo.externo.cache;
  if (!hayCosteQueEnsenar(consumo)) return null;

  const deSesion = ambito === "sesion";
  const hayExterno = consumo.externo.entrada > 0 || consumo.externo.salida > 0;
  const detalle = [
    // El total va en el encabezado de la fila porque es lo que la fila ENSEÑA: quien abre el
    // `title` viene a comprobar ese número, y el desglose de debajo es lo que lo sostiene.
    deSesion ? `Gastado en esta sesión: ${entrada + salida} tokens en total` : "Trabajo de este turno",
    `· modelo: ${consumo.modelo.entrada} entrada / ${consumo.modelo.salida} salida`,
    ...(hayExterno
      ? [`· agentes externos: ${consumo.externo.entrada} entrada / ${consumo.externo.salida} salida`]
      : []),
    ...(cache > 0 ? [`· caché leída: ${cache} (no va sumada a la entrada)`] : []),
    ...(hayExterno ? ["Las dos cuentas son de proveedores distintos: se suman TOKENS, no coste."] : []),
  ].join("\n");

  return (
    <span
      className={estilos.coste}
      title={detalle}
      aria-label={
        deSesion
          ? `Esta sesión: ${entrada + salida} tokens en total, ${entrada} de entrada y ${salida} de salida${cache > 0 ? `, con ${cache} de caché` : ""}`
          : `${entrada} de entrada, ${salida} de salida${cache > 0 ? `, ${cache} de caché` : ""}`
      }
    >
      {deSesion ? (
        <>
          {/* La Σ y no las flechas: un «98,2k» pelado al lado de una fecha se lee como otra
              fecha, y `↑`/`↓` dirían que es UNA de las dos mitades. La Σ dice que es la suma
              —la misma que sale de sumar los dos números del contador del compositor—. */}
          <span aria-hidden="true">Σ</span>
          <span className={estilos.cifra}>{abreviar(entrada + salida)}</span>
        </>
      ) : (
        <>
          <span aria-hidden="true">↑</span>
          <span className={estilos.cifra}>{abreviar(entrada)}</span>
          <span aria-hidden="true"> </span>
          <span aria-hidden="true">↓</span>
          <span className={estilos.cifra}>{abreviar(salida)}</span>
        </>
      )}
      {/* La caché se calla en la fila: en el sitio del turno es una lectura que se entiende al
          lado de lo que costó, y en la barra es el ancho que le falta al título. */}
      {cache > 0 && !deSesion && (
        <>
          <span aria-hidden="true">·</span>
          <span className={estilos.cache}>{abreviar(cache)} caché</span>
        </>
      )}
    </span>
  );
}
