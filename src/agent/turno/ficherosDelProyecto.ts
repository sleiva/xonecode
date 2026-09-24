/**
 * Los ficheros del proyecto, en el espacio VIRTUAL del backend.
 *
 * Vive aparte porque la usan los dos motores, la consola y el árbol de la web, y en
 * `turnoReal.ts` obligaba a todos ellos a importar el módulo que construye el agente — y a
 * TrueForge, a importar a quien lo importa a él (`src/ciclos.test.ts`).
 */
import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

/**
 * Recorre la raíz y devuelve las rutas en el ESPACIO VIRTUAL del backend.
 *
 * Exportada porque la consola la usa para el completado de «@ficheros» (cli puede
 * importar de agent; al revés no). El recorrido se hace EN CADA llamada a propósito:
 * la lista no se cachea porque los ficheros cambian durante la sesión.
 */
/** Hasta dónde baja el completado del Tab. El árbol de la consola web pide más (`arbolDeProyecto.ts`). */
export const PROFUNDIDAD_DEL_TAB = 4;

export function ficherosDelProyecto(raiz: string, prof = 0, tope = PROFUNDIDAD_DEL_TAB): ReadonlySet<string> {
  if (prof > tope || !existsSync(raiz)) return new Set();
  const salida = new Set<string>();
  for (const entrada of readdirSync(raiz)) {
    if (entrada === "node_modules" || entrada === ".git") continue;
    const ruta = join(raiz, entrada);
    try {
      // `lstatSync` y no `statSync`: una CARPETA detrás de un enlace simbólico no se
      // recorre. Medido en la pestaña Ficheros de la consola web: «carpeta-enlazada» →
      // «.xonecode» listaba la carpeta denegada bajo otro nombre, y «dir-fuera» →
      // «/algo/de/fuera» listaba nombres de ficheros que no son del proyecto (un
      // «dir-fuera/id_rsa»). Tampoco se lista el enlace en sí: la carpeta a la que apunta
      // o ya está en el árbol por su nombre real, o está fuera del proyecto y no debe
      // salir — y una hoja que al abrirse dice «no se enseña» es un botón muerto.
      // Un enlace a FICHERO sí se queda como hoja: quién decide si se puede leer es la
      // barrera del lector (`arbolDeProyecto.ts`), que recomprueba sobre el `realpath`.
      // Esta función alimenta a TRES consumidores y el cambio es correcto para los tres:
      // el completado de «@ficheros» del Tab (no completa a carpetas ajenas), el universo
      // que consulta `esVistaAplanada` (una vista aplanada de fuera del proyecto no es
      // asunto nuestro) y el árbol de la consola web.
      const info = lstatSync(ruta);
      if (info.isSymbolicLink() && statSync(ruta).isDirectory()) continue;
      if (info.isDirectory()) {
        // La recursión devuelve rutas relativas al SUBDIRECTORIO: sin recoserle el
        // nombre, «app/Clientes.xne» saldría como «/Clientes.xne» y el Set dejaría de
        // responder por las vistas aplanadas ANIDADAS (este universo es el que consulta
        // `esVistaAplanada`).
        for (const f of ficherosDelProyecto(ruta, prof + 1, tope)) salida.add(`/${entrada}${f}`);
      } else {
        salida.add("/" + ruta.slice(raiz.length + 1).split(sep).join("/"));
      }
    } catch {
      // Un enlace roto o un permiso no tumba el arranque; el agente vivirá sin ese fichero.
    }
  }
  return salida;
}
