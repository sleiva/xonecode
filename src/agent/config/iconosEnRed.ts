import {
  idsDeBusqueda, motivoDeSvgInaceptable, TOPE_DE_ICONOS_MS, urlDeBusqueda, urlDeSvg,
} from "../../core/iconos.js";
import type { IconosPort } from "../../core/ports.js";

/**
 * Iconify, de verdad (IXCODE-18). Los mismos datos que usa `better-icons`, pero llamando a la API
 * directamente: el binario no lo puede ejecutar ningún especialista, y una dependencia global
 * que instalar es un fallo del entorno que no merece la pena.
 *
 * Un fallo lleva el CÓDIGO HTTP o la palabra «red», nunca la URL ni el cuerpo remoto (mismo trato
 * que `ErrorCatalogoModelos`). `fetch` entra por parámetro para probarlo sin conexión.
 */
export function iconosEnRed(
  llamar: typeof fetch = fetch,
  topeMs: number = TOPE_DE_ICONOS_MS
): IconosPort {
  const pedir = async (url: string): Promise<Response> => {
    let respuesta: Response;
    try {
      respuesta = await llamar(url, { signal: AbortSignal.timeout(topeMs) });
    } catch {
      throw new Error("no hay red o Iconify no responde");
    }
    if (!respuesta.ok) throw new Error(`Iconify contestó ${respuesta.status}`);
    return respuesta;
  };
  return {
    async buscar(consulta, opciones) {
      const respuesta = await pedir(urlDeBusqueda(consulta, opciones.limite, opciones.prefijo));
      let cuerpo: unknown;
      try {
        cuerpo = await respuesta.json();
      } catch {
        throw new Error("respuesta incompatible de Iconify");
      }
      // Iconify NO respeta límites pequeños (medido: pidiendo 3 contestó con limit 32), así que se
      // recorta aquí: el doble ya lo hacía, y un puerto real que no coincida con su doble miente.
      return idsDeBusqueda(cuerpo).slice(0, opciones.limite);
    },
    async svg(id, opciones) {
      const respuesta = await pedir(urlDeSvg(id, opciones.color, opciones.tamano));
      const svg = await respuesta.text();
      const motivo = motivoDeSvgInaceptable(svg);
      if (motivo !== undefined) throw new Error(motivo);
      return svg;
    },
  };
}
