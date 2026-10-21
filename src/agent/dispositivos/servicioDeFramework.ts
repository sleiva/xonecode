/**
 * El servicio del framework: lo que ofrecer para instalar (la copia local y, con credencial, el
 * catálogo de byXOne) y la resolución de una elección contra esa lista. Lo usan las tres puertas —el
 * botón de Ajustes, el de Ejecutar y la tool del agente— a través del servidor, que es quien tiene el
 * cerrojo de la máquina (`arranque.ts#correrTrabajo`).
 *
 * **La credencial se lee en CADA consulta**: el fichero personal se puede escribir con la consola en
 * marcha. **El catálogo es una FOTO de cada consulta**, sin caché: es pequeño, y uno viejo ofrecería
 * versiones retiradas.
 */
import { frameworksDelCatalogo } from "../../core/byxone.js";
import {
  eleccionServida, type EleccionDeFramework, type FrameworkLocal, opcionesDeInstalacion, type OpcionDeInstalacion,
} from "../../core/frameworkLocal.js";
import { type ClienteByxone, clienteByxone, credencialByxone } from "./byxoneEnRed.js";
import { leerFrameworksLocales } from "./frameworkEnDisco.js";
import type { VersionAInstalar } from "./instalacionDeFramework.js";

export interface OfertaDeFramework {
  opciones: OpcionDeInstalacion[];
  /** Por qué no se enseña el catálogo (sin credencial, sin red, un error del servicio). Ausente = se enseña. */
  motivoDelCatalogo?: string;
}

export interface ServicioDeFramework {
  /** Las locales siempre; las del catálogo si hay credencial y contesta. Nunca lanza. */
  ofrecer: () => Promise<OfertaDeFramework>;
  /** Solo lo que está en `servidas`: el cliente nunca manda una URL ni un id arbitrario. */
  resolver: (eleccion: EleccionDeFramework, servidas: readonly OpcionDeInstalacion[]) => VersionAInstalar | undefined;
  /** El cliente de red con la credencial de AHORA, o nada. */
  cliente: () => ClienteByxone | undefined;
  /** Las versiones locales, para elegir sin red (la tool de una tarea de fondo). */
  locales: () => FrameworkLocal[];
}

export function servicioDeFramework(
  deps: { casa?: string; fetch?: typeof fetch; entorno?: Record<string, string | undefined>; raizDelPaquete?: string } = {}
): ServicioDeFramework {
  const locales = (): FrameworkLocal[] => leerFrameworksLocales(deps.casa);

  const cliente = (): ClienteByxone | undefined => {
    const c = credencialByxone({
      ...(deps.entorno === undefined ? {} : { entorno: deps.entorno }),
      ...(deps.casa === undefined ? {} : { casa: deps.casa }),
      ...(deps.raizDelPaquete === undefined ? {} : { raizDelPaquete: deps.raizDelPaquete }),
    });
    if ("motivo" in c) return undefined;
    return clienteByxone(c.credencial, { ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }), ...(deps.casa === undefined ? {} : { casa: deps.casa }) });
  };

  const ofrecer = async (): Promise<OfertaDeFramework> => {
    const tengo = locales();
    const c = credencialByxone({
      ...(deps.entorno === undefined ? {} : { entorno: deps.entorno }),
      ...(deps.casa === undefined ? {} : { casa: deps.casa }),
      ...(deps.raizDelPaquete === undefined ? {} : { raizDelPaquete: deps.raizDelPaquete }),
    });
    if ("motivo" in c) return { opciones: opcionesDeInstalacion(tengo), motivoDelCatalogo: c.motivo };
    const red = clienteByxone(c.credencial, { ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }), ...(deps.casa === undefined ? {} : { casa: deps.casa }) });
    const r = await red.obtener("/api/catalog");
    if (!r.ok) return { opciones: opcionesDeInstalacion(tengo), motivoDelCatalogo: r.motivo };
    const catalogo = frameworksDelCatalogo(r.valor);
    // **Un catálogo que contesta y del que no sale NADA se dice**: la forma de un item no está en la
    // guía del servicio, y un desplegable vacío sin motivo sería justo el bug mudo que no se permite.
    const recibidas = Array.isArray(r.valor) ? r.valor.length : Array.isArray((r.valor as { items?: unknown } | null)?.items) ? (r.valor as { items: unknown[] }).items.length : 0;
    if (catalogo.length === 0) {
      return {
        opciones: opcionesDeInstalacion(tengo),
        motivoDelCatalogo:
          recibidas === 0
            ? "byXOne no devolvió ninguna entrada en su catálogo"
            : `byXOne devolvió ${recibidas} entradas de catálogo y ninguna se reconoce como framework de Android (Frame) descargable`,
      };
    }
    return { opciones: opcionesDeInstalacion(tengo, catalogo) };
  };

  const resolver: ServicioDeFramework["resolver"] = (eleccion, servidas) => {
    const servida = eleccionServida(eleccion, servidas);
    if (servida === undefined) return undefined;
    if (servida.origen === "catalogo") return { origen: "catalogo", ficheroId: servida.ficheroId, titulo: servida.titulo };
    const local = locales().find((l) => l.sha256 === servida.sha256);
    return local === undefined ? undefined : { origen: "local", local };
  };

  return { ofrecer, resolver, cliente, locales };
}
