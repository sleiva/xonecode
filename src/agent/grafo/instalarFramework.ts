import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { DispositivoDeLaSesion } from "../../core/dispositivoDeSesion.js";
import { NOMBRE_INSTALAR_FRAMEWORK, recibeInstalarFramework } from "../../core/frameworkLocal.js";
import type { InstaladorDeFrameworkPort } from "../../core/ports.js";

export { NOMBRE_INSTALAR_FRAMEWORK, recibeInstalarFramework };

/**
 * Instalar el framework de XOne en el aparato de la SESIÓN, cuando el despliegue dice que falta
 * (`FRAMEWORK_AUSENTE`, de los scripts de `xone-hotswap`).
 *
 * - **El aparato no lo elige el modelo**: es el de la sesión (`core/dispositivoDeSesion.ts`), y el
 *   servidor lo comprueba contra su última medida.
 * - **La versión tampoco**: la preferida —la más nueva de la copia local, o sin ninguna local la más
 *   nueva del catálogo de byXOne—. Elegir otra es de la persona, desde Ajustes → Dispositivos.
 * - **Pide aprobación SIEMPRE**, con su propia tarjeta (`PendienteDeAprobacion.dispositivo`, en
 *   `sesionTrueforge.ts`): actúa sobre el aparato, no sobre el proyecto. En modo autónomo se aplica
 *   sola y se dice; en una tarea de fondo solo si no hay que descargar (`consolaDeTarea.ts`).
 * - **Va por el cerrojo de la máquina** del servidor (`InstaladorDeFrameworkPort`): sin puerto no se
 *   monta. Los rechazos se DEVUELVEN como texto, nunca se lanzan.
 *
 * **Límite declarado**: entre la tarjeta y la ejecución la copia local podría cambiar (otra pestaña
 * descarga o borra); lo que se instala es lo que el plan diga al ejecutar.
 */
const ESQUEMA = z.object({
  motivo: z.string().max(300).optional().describe("Por qué hace falta (lo que dijo el despliegue). Se enseña en la tarjeta."),
});

export function crearInstalarFramework(deps: {
  instalador: InstaladorDeFrameworkPort;
  dispositivo: () => DispositivoDeLaSesion | undefined;
  /** La señal del turno: Parar corta la descarga y el `adb install`. */
  senal?: () => AbortSignal | undefined;
}) {
  return tool(
    async (_entrada: z.infer<typeof ESQUEMA>, config?: { signal?: AbortSignal }): Promise<string> => {
      const aparato = deps.dispositivo();
      if (aparato === undefined) {
        return "Esta sesión no tiene ningún aparato elegido: no hay dónde instalar el framework. Díselo a la persona (se elige en la pastilla del compositor).";
      }
      if (aparato.plataforma !== "android") return "Instalar el framework solo está montado para Android.";
      const senal = deps.senal?.() ?? config?.signal;
      try {
        const r = await deps.instalador.instalar(
          { id: aparato.id, nombre: aparato.nombre },
          { soloLocal: false, ...(senal === undefined ? {} : { senal }) }
        );
        return r.ok
          ? `${r.detalle}. Vuelve a lanzar el despliegue.`
          : `No se instaló el framework: ${r.motivo}. No lo intentes con adb a mano: díselo a la persona.`;
      } catch (error) {
        return `No se instaló el framework: ${error instanceof Error ? error.message : "fallo desconocido"}.`;
      }
    },
    {
      name: NOMBRE_INSTALAR_FRAMEWORK,
      description:
        "Instala el framework de XOne (la app con la que se despliega y se prueba) en el aparato de la sesión. " +
        "Úsala SOLO cuando un despliegue o un reinicio diga FRAMEWORK_AUSENTE. Pide aprobación a la persona. " +
        "No elige versión ni aparato: instala la preferida en el de la sesión. Nunca desinstala nada.",
      schema: ESQUEMA,
    }
  );
}
