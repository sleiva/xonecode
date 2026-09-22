/**
 * La guarda que mira el CONTENIDO antes de escribirlo, sobre `xone-linter`.
 *
 * La regla —qué se rechaza— es pura y vive en `core/validacionDeEscritura.ts`. Esto es solo el
 * cableado: hablar con la librería y envolver el backend.
 *
 * **El reparto es el mismo que el de `xone_navegacion` y por el mismo motivo**: la semántica de
 * XOne la pone `xone-linter` como LIBRERÍA —ya parsea, ya sabe qué es un tipo de prop válido, ya
 * decodifica ISO-8859— y reescribirla aquí sería un segundo sitio donde decidir lo mismo.
 *
 * **Y el import es PROFUNDO**, también por lo mismo: el barril de la librería arrastra su runtime
 * con un *top-level await* que revienta bajo `tsx`, o sea bajo el lanzador de desarrollo.
 */
import { anotarError, anotarPaso } from "../../core/trazaDeErrores.js";
import type { HallazgoDeEscritura } from "../../core/validacionDeEscritura.js";
import {
  motivoDelRechazo,
  veredictoDeEscritura,
} from "../../core/validacionDeEscritura.js";

/** Lo que esta guarda necesita saber hacer. Entra por parámetro: `npm test` no abre ficheros. */
export type ValidarContenido = (
  ruta: string,
  contenido: string,
) => Promise<HallazgoDeEscritura[] | undefined>;

/**
 * El validador de PRODUCCIÓN, sobre `xone-linter`.
 *
 * **Devuelve `undefined` cuando no se pudo mirar**, que no es lo mismo que «no hay hallazgos» y
 * por eso no es una lista vacía. Quien lo lea tiene que poder distinguir «esto está limpio» de
 * «no sé»: lo primero deja escribir porque se comprobó, lo segundo deja escribir porque un fallo
 * del ENTORNO no puede convertirse en un veredicto sobre el trabajo del agente. Es la misma
 * frontera que `ErrorDelSimulador` frente a un informe en rojo.
 */
export function validarConXoneLinter(): ValidarContenido {
  return async (ruta, contenido) => {
    // El hito envuelve la llamada ENTERA al parser: si se cuelga aquí, queda un `inicio` sin
    // su `fin` con el nombre del fichero al lado.
    const fin = anotarPaso("validacionXone#validar", ruta);
    try {
      const { validateContent, canValidate } = await import(
        // Import PROFUNDO: el barril trae un top-level await que revienta bajo `tsx`.
        "xone-linter/dist/validator/validateContent.js"
      );
      if (!canValidate(ruta)) return [];
      const { result, checked } = await validateContent(ruta, contenido);
      if (!checked) return [];
      return (result.errors as Array<{ code: string; message: string; location?: { line?: number } }>).map(
        (e) => ({
          codigo: e.code,
          mensaje: e.message,
          ...(typeof e.location?.line === "number" ? { linea: e.location.line } : {}),
        }),
      );
    } catch (e) {
      // No está la librería, o su parser reventó. Se DEJA ESCRIBIR: ver la cabecera. Pero
      // ahora QUEDA ANOTADO, que es la diferencia entre un fail-open y un fallo invisible.
      anotarError("validacionXone#validar", e);
      return undefined;
    } finally {
      fin();
    }
  };
}

/** Lo que la guarda necesita del backend para saber qué había antes. */
interface BackendLegible {
  read?: (ruta: string, ...resto: unknown[]) => unknown;
}

/**
 * Lee lo que hay hoy en esa ruta, o `undefined` si no hay nada que leer.
 *
 * Un fichero que no existe NO es un fallo: es el caso «fichero nuevo», donde no hay nada
 * preexistente y todo hallazgo es de esta escritura.
 */
async function contenidoActual(backend: BackendLegible, ruta: string): Promise<string | undefined> {
  if (typeof backend.read !== "function") return undefined;
  try {
    const leido = await backend.read(ruta);
    if (typeof leido === "string") return leido;
    // Los backends de deepagents devuelven `{content}` o `{error}`.
    const obj = leido as { content?: unknown; error?: unknown } | null;
    if (obj && typeof obj === "object" && typeof obj.content === "string") return obj.content;
    return undefined;
  } catch (e) {
    anotarError("validacionXone#contenidoActual", e);
    return undefined;
  }
}

/**
 * Lo que un `edit` va a dejar en el fichero, o `undefined` si no se puede saber.
 *
 * **Se calcula aquí en vez de dejar escribir y mirar después**, porque mirar después obliga a
 * deshacer, y deshacer es escribir dos veces en el proyecto del usuario — con la ventana en la
 * que el fichero malo existe si el proceso se muere en medio.
 *
 * Y **cuando el reemplazo no es exacto se devuelve `undefined` y NO se juzga**: si `oldString`
 * no aparece, o aparece varias veces sin `replaceAll`, deepagents va a rechazar el edit él
 * mismo. Adivinar ahí sería validar un contenido que nunca va a existir.
 */
export function contenidoTrasEditar(
  actual: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): string | undefined {
  if (replaceAll) {
    return actual.includes(oldString) ? actual.split(oldString).join(newString) : undefined;
  }
  const primera = actual.indexOf(oldString);
  if (primera === -1) return undefined;
  if (actual.indexOf(oldString, primera + oldString.length) !== -1) return undefined;
  return actual.slice(0, primera) + newString + actual.slice(primera + oldString.length);
}

/**
 * Envuelve el backend para que un `write` o un `edit` que INTRODUZCA un problema no llegue a
 * disco.
 *
 * Cuarta guarda del mismo Proxy que `sinVistasAplanadas`, `sinArtefactosEnElProyecto` y
 * `sinDescargasEnElProyecto`, con su misma forma: **se DEVUELVE `{error}`, nunca se lanza**.
 * deepagents devuelve ese error al modelo como resultado de la tool y puede reintentar; una
 * excepción se lleva el turno por delante y el agente no reintenta.
 */
export function sinContenidoInvalido<T extends object>(backend: T, validar: ValidarContenido): T {
  return new Proxy(backend, {
    get(destino, prop) {
      const valor = Reflect.get(destino, prop, destino);
      if (typeof valor !== "function") return valor;
      if (prop !== "write" && prop !== "edit") {
        return (valor as (...a: unknown[]) => unknown).bind(destino);
      }
      return async (...args: unknown[]) => {
        const fin = anotarPaso(`sinContenidoInvalido#${String(prop)}`, typeof args[0] === "string" ? args[0] : undefined);
        try {
          return await guardado(...args);
        } finally {
          fin();
        }
      };

      async function guardado(...args: unknown[]) {
        const seguir = () => (valor as (...a: unknown[]) => unknown).apply(destino, args);
        const ruta = args[0];
        if (typeof ruta !== "string") return seguir();

        const antesTexto = await contenidoActual(destino as BackendLegible, ruta);
        let nuevo: string | undefined;
        if (prop === "write") {
          nuevo = typeof args[1] === "string" ? args[1] : undefined;
        } else if (typeof antesTexto === "string" && typeof args[1] === "string" && typeof args[2] === "string") {
          nuevo = contenidoTrasEditar(antesTexto, args[1], args[2], args[3] === true);
        }
        if (nuevo === undefined) return seguir();

        const despues = await validar(ruta, nuevo);
        // No se pudo mirar: se deja escribir. Un fallo del entorno no es un veredicto.
        if (despues === undefined) return seguir();
        const antes = antesTexto === undefined ? undefined : await validar(ruta, antesTexto);

        const { introducidos } = veredictoDeEscritura(antes, despues);
        if (introducidos.length === 0) return seguir();
        return { error: motivoDelRechazo(ruta, introducidos) };
      }
    },
  }) as T;
}
