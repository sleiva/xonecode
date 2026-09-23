/**
 * El `user_id` de DeepSeek leído del login de CloudStudio que hay en ESTA máquina.
 *
 * La regla (qué token, cómo se normaliza) es pura y vive en `core/identidadDeProveedor.ts`;
 * aquí solo se decide DE QUÉ ENTORNO se lee y se toca el disco.
 *
 * **Qué entorno**, en este orden:
 *  1. El del proyecto, resuelto EXACTAMENTE como lo resuelve la sincronización
 *     (`entorno` del `config.json`, y si falta, `entornoDeUrl` sobre su `cloudstudio.url`,
 *     y si tampoco, `legado`): la persona que baja y sube ese proyecto es la que está
 *     delante, y una segunda regla para lo mismo acabaría eligiendo otro juego de tokens.
 *  2. Sin CloudStudio en el proyecto, el PRIMER entorno registrado en `settings.json` con
 *     una identidad legible, y luego `legado`. Es determinista y está declarado: quien tiene
 *     sesión en dos servidores sale con el id del primero.
 *
 * **Se lee en cada construcción de un modelo, no se captura**: el login puede hacerse con
 * la consola abierta, y un valor capturado al arrancar dejaría esa sesión sin id para
 * siempre. Es un `readFileSync` de un JSON pequeño contra una petición de segundos.
 *
 * **Nunca lanza.** Un fichero roto o ausente es «no consta», y entonces el campo no viaja:
 * DeepSeek funciona igual sin él, y un turno caído por no poder ponerle nombre sería
 * cambiar una ventaja por una avería.
 *
 * El hash no va a ningún evento, traza ni `.jsonl`: es un dato de la PETICIÓN, no del turno.
 */
import type { FuentesDeEleccion } from "../../core/modelos.js";
import { entornoDeUrl } from "../../core/settings.js";
import { subDeTokens, userIdDeDeepSeek } from "../../core/identidadDeProveedor.js";
import { CLAVE_LEGADO, leerEstado, rutaAuthPorDefecto } from "../cloudstudio/cloudstudioMcp.js";
import { cargarSettings } from "./settingsEnDisco.js";

export function userIdDeDeepSeekEnDisco(fuentes: FuentesDeEleccion): string | undefined {
  try {
    const porEntorno = leerEstado(rutaAuthPorDefecto()).porEntorno;
    const identidad = (entorno: string): string | undefined => {
      const sub = subDeTokens(porEntorno[entorno]?.tokens);
      return sub === undefined ? undefined : userIdDeDeepSeek(entorno, sub);
    };
    const entornos = cargarSettings().settings.entornos;
    const proyecto = fuentes.proyecto;
    if (proyecto?.cloudstudio?.url !== undefined) {
      const entorno = proyecto.entorno ?? entornoDeUrl(proyecto.cloudstudio.url, entornos) ?? CLAVE_LEGADO;
      return identidad(entorno);
    }
    for (const entorno of [...entornos.map((e) => e.id), CLAVE_LEGADO]) {
      const id = identidad(entorno);
      if (id !== undefined) return id;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
