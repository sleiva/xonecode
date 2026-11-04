import { seDetieneEn } from "../../grafo/perfiles.js";

/** El motivo con que se rechaza la escritura de un hijo nacido en autónomo cuando la sesión ya va en supervisado. */
export const TEXTO_PASO_A_SUPERVISADO =
  "La sesión ha pasado a SUPERVISADO mientras trabajabas: esta escritura no se aplica sin aprobación y desde aquí no se " +
  "puede pedir. NO la reintentes en este encargo: termínalo diciendo qué cambio queda por escribir (fichero y qué); en el " +
  "próximo encargo se escribirá pidiendo aprobación.";

/**
 * **El modo de escritura se lee en CADA escritura** (`docs/REVISION-PARALELISMO-UN-DISPOSITIVO.md` §3). Un hijo nacido en
 * AUTÓNOMO escribe sin la interrupción de aprobación de la librería (`escribeSinPreguntar`, que es lo que le deja no
 * esperar a sus hermanos), y esa forma se fija al nacer. Si la persona pasa a supervisado a mitad de su encargo, aquí se
 * nota: lo que pediría aprobación (`seDetieneEn`, la MISMA regla que la ronda de aprobación) se RECHAZA como `{error}`
 * —nunca se lanza— con el motivo. Preguntar desde la herramienta no se puede: la decisión solo llega cuando la librería
 * devuelve el control, y esperarla dentro de la herramienta era el bloqueo mutuo de `esperas.ts`. Lo que nunca se
 * pregunta (`/artefactos/`, `/planes/`) sigue escribiéndose.
 */
export function conModoVigenteAlEscribir<T extends object>(backend: T, autonomoAhora: () => boolean): T {
  return new Proxy(backend, {
    get(destino, prop) {
      const valor = Reflect.get(destino, prop, destino);
      if (typeof valor !== "function") return valor;
      const fn = (valor as (...a: unknown[]) => unknown).bind(destino);
      if (prop !== "write" && prop !== "edit") return fn;
      return async (...args: unknown[]) => {
        const ruta = args[0];
        if (typeof ruta === "string" && !autonomoAhora() && seDetieneEn({ toolCall: { args: { file_path: ruta } } })) {
          return { error: TEXTO_PASO_A_SUPERVISADO };
        }
        return await fn(...args);
      };
    },
  });
}
