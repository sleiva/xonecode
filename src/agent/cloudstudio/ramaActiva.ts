/**
 * Cuál es la rama que Studio tiene ACTIVA — o que no se pudo saber.
 *
 * La rama activa solo se sabe por `studio_get_context`: `studio_manage_branches` enumera
 * las ramas y no dice cuál está puesta (medido: no tiene `operation: "current"`). Y esa
 * tool FALLA en el servidor para algunos proyectos —medido contra CloudStudio, con el
 * proyecto ABIERTO: devuelve «An error occurred invoking 'studio_get_context'» mientras
 * `studio_get_file`, `studio_get_project_structure` y `studio_manage_branches` contestan
 * bien sobre ESE MISMO proyecto—, así que no es señal de sesión caída ni de red.
 *
 * Leerla sirve para UNA cosa: devolverle el suelo a quien tenga Studio abierto en el
 * navegador. Eso es una cortesía, no una condición de corrección — lo que garantiza que
 * se baja (y se sube) de la rama que toca es el `cambiarRama(ramaOrigen)` explícito, que
 * no depende de esta lectura. Por eso un fallo aquí NO tumba la operación: devuelve
 * `undefined` y lo DICE, que es la única parte que no puede quedarse muda, porque la
 * consecuencia es visible (Studio se queda en la rama del proyecto).
 *
 * `CloudStudioPort.contexto()` sigue LANZANDO, a propósito: tolerar es decisión de quien
 * llama, no del puerto. Y la sesión perdida no se cuela por aquí como un error genérico
 * más — `cloudstudioClient.ts#conSesion` reabre y reintenta, y si sigue perdida relanza
 * al siguiente `cambiarRama`, que es donde ese caso SÍ tiene que tumbar la operación.
 */
import type { CloudStudioPort } from "../../core/ports.js";

export async function ramaActiva(
  puerto: CloudStudioPort,
  ramaOrigen: string,
  informar: (texto: string) => void
): Promise<string | undefined> {
  try {
    return (await puerto.contexto()).rama;
  } catch (error) {
    informar(
      `no se pudo leer la rama activa de CloudStudio (${(error as Error).message}); ` +
        `se continúa, y Studio se quedará en «${ramaOrigen}»\n`
    );
    return undefined;
  }
}
