import { ConnectionBanner } from "@deepseek-ai/dsh-client-ui-primitives";
import estilos from "./AvisoDeConexion.module.css";

/**
 * El envoltorio de `ConnectionBanner` (`@deepseek-ai/dsh-client-ui-primitives`), y por
 * qué hace falta uno: el componente no acepta `className` en su tipo —a diferencia de
 * `Button`, `Pill` o `Input`— y, en esta rc, su `<div>` propio sale sin ninguna clase (su
 * CSS Module está vacío, `AvisoDeConexion.module.css` documenta el porqué). Sin este
 * envoltorio se vería una fila de texto suelta, sin fondo ni margen, en vez de un
 * banner — así que en vez de forzarlo tal cual, se le da aspecto real desde fuera.
 *
 * Distinto del indicador de `Cabecera` (pequeño, permanente, en la cabecera misma): este
 * ocupa una fila entera y solo aparece mientras NO hay conexión (`ConnectionBanner`
 * devuelve `null` si `reconnecting` es falso).
 *
 * `!conectado` cubre también la primera conexión, no solo una caída: `conexion.ts`
 * arranca `EstadoDelCliente.conectado` en `false` (`store.ts#ESTADO_INICIAL`) y
 * reintenta solo, con backoff, hasta que alguien llama a `cerrar()` — un momento que
 * `App` no llega a pintar porque es su propio desmontaje. Por eso el texto no dice «se
 * perdió la conexión» y reutiliza la misma frase que ya usa `Compositor` cuando se
 * deshabilita, en vez de inventar una segunda redacción para el mismo hecho.
 */
export function AvisoDeConexion({ conectado }: { conectado: boolean }) {
  return (
    <div className={estilos.avisoDeConexion}>
      <ConnectionBanner reconnecting={!conectado} label="sin conexión con xonecode — reintentando…" />
    </div>
  );
}
