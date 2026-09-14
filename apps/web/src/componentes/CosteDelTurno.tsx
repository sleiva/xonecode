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
export function CosteDelTurno({ consumo }: { consumo: ConsumoDeTurno }): React.ReactElement | null {
  const entrada = consumo.modelo.entrada + consumo.externo.entrada;
  const salida = consumo.modelo.salida + consumo.externo.salida;
  const cache = consumo.modelo.cache + consumo.externo.cache;
  if (!hayCosteQueEnsenar(consumo)) return null;

  const hayExterno = consumo.externo.entrada > 0 || consumo.externo.salida > 0;
  const detalle = [
    `Trabajo de este turno`,
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
      aria-label={`${entrada} de entrada, ${salida} de salida${cache > 0 ? `, ${cache} de caché` : ""}`}
    >
      <span aria-hidden="true">↑</span>
      <span className={estilos.cifra}>{abreviar(entrada)}</span>
      <span aria-hidden="true"> </span>
      <span aria-hidden="true">↓</span>
      <span className={estilos.cifra}>{abreviar(salida)}</span>
      {cache > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span className={estilos.cache}>{abreviar(cache)} caché</span>
        </>
      )}
    </span>
  );
}
