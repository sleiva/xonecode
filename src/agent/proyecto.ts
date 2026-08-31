import { FilesystemBackend } from "deepagents";

/**
 * El backend del proyecto: confinado, y sin las vistas aplanadas.
 *
 * **`virtualMode: true` no es configurable.** Medido contra deepagents 1.12.0: con el
 * default (`false`) el backend LEYÓ una ruta absoluta de fuera de la raíz. La propia
 * librería lo dice de su default — «absolute paths and `..` can bypass rootDir».
 *
 * Y nada de `LocalShellBackend`: la librería avisa de que `virtualMode` **no restringe los
 * comandos de shell**. El simulador lo invoca el código de xonecode, no el modelo.
 */
export function backendDelProyecto(raiz: string): FilesystemBackend {
  return new FilesystemBackend({ rootDir: raiz, virtualMode: true });
}

/** ¿Es `ruta` una vista aplanada, teniendo a la vista el conjunto de ficheros del proyecto? */
export function esVistaAplanada(ruta: string, todas: ReadonlySet<string>): boolean {
  return ruta.endsWith(".xml") && todas.has(`${ruta.slice(0, -4)}.xne`);
}

/**
 * El mensaje con el que se rechaza tocar una vista aplanada.
 *
 * **Rechazar y explicar, no fallar en seco.** Un «fichero no encontrado» hace que el modelo
 * pruebe otra ruta, o peor, que dé por hecho que el cambio no hacía falta. Diciéndole dónde
 * está la fuente, corrige a la primera.
 */
export const porQueNo = (ruta: string): string =>
  `«${ruta}» es una vista APLANADA que genera XOne Studio a partir de «${ruta.slice(0, -4)}.xne». ` +
  `No se lee ni se edita: los cambios se hacen en el .xne y Studio regenera esta. ` +
  `Abre «${ruta.slice(0, -4)}.xne».`;

/**
 * Envuelve un backend para que las vistas aplanadas no existan para el agente.
 *
 * **Por qué no basta con decirlo en el prompt.** La regla ya vivía ahí en el harness
 * anterior, solo en el del ejecutor, y falló por donde tenía que fallar: *un permiso solo
 * protege a quien lo choca*. El planner planificaba sobre el `.xml` y el juez exigía el
 * cambio ahí — ninguno de los dos podía conocer una regla que vivía en otro prompt.
 * Retirarlas del backend la convierte en una propiedad del PROYECTO, no de un prompt.
 *
 * **Se ocultan, no se borran.** El disco es del usuario. (El harness con MCP sí las
 * borraba de su copia, pero aquella copia era suya y se tiraba al final.)
 *
 * `app.xml` no tiene hermano `.xne`, así que el propio predicado lo conserva: es fuente.
 */
export function sinVistasAplanadas<T extends object>(backend: T, todas: ReadonlySet<string>): T {
  const guarda = (ruta: unknown): void => {
    if (typeof ruta === "string" && esVistaAplanada(ruta, todas)) throw new Error(porQueNo(ruta));
  };

  return new Proxy(backend, {
    get(destino, prop, receptor) {
      const valor = Reflect.get(destino, prop, receptor);
      if (typeof valor !== "function") return valor;

      // Las que reciben una ruta y la tocan: se rechazan con explicación.
      if (prop === "read" || prop === "readRaw" || prop === "write" || prop === "edit" || prop === "delete") {
        // `async` a propósito, y no una función normal que lanza. Los métodos del backend
        // real son asíncronos, así que un `throw` SÍNCRONO aquí cambia el contrato de la
        // llamada: quien haga `backend.read(x).catch(...)` se comería la excepción antes
        // de tener una promesa que rechazar. Con `async`, el rechazo llega por donde el
        // llamador lo espera.
        return async (...args: unknown[]) => {
          guarda(args[0]);
          return (valor as (...a: unknown[]) => unknown).apply(destino, args);
        };
      }

      // Las que LISTAN: se filtra el resultado, para que ni aparezcan.
      if (prop === "ls" || prop === "grep") {
        return async (...args: unknown[]) => {
          const r = await (valor as (...a: unknown[]) => Promise<unknown>).apply(destino, args);
          return filtrarResultado(r, todas);
        };
      }

      return (valor as (...a: unknown[]) => unknown).bind(destino);
    },
  }) as T;
}

/**
 * Quita las vistas aplanadas de lo que devuelve un `ls`/`grep`.
 *
 * La forma del resultado varía entre versiones de la librería, así que se filtra lo que se
 * reconoce y lo que no se deja pasar TAL CUAL: perder resultados en silencio sería peor que
 * enseñar un `.xml` de más, y esto no es la barrera —la barrera es la guarda de arriba—.
 */
function filtrarResultado(r: unknown, todas: ReadonlySet<string>): unknown {
  const quita = (v: unknown): boolean => typeof v === "string" && esVistaAplanada(v, todas);
  if (Array.isArray(r)) return r.filter((v) => !quita(v));
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    const salida: Record<string, unknown> = { ...o };
    for (const clave of ["files", "matches", "paths", "results", "entries"]) {
      if (Array.isArray(o[clave])) {
        salida[clave] = (o[clave] as unknown[]).filter((v) => {
          if (quita(v)) return false;
          if (v && typeof v === "object") {
            const f = (v as Record<string, unknown>).file ?? (v as Record<string, unknown>).path;
            return !quita(f);
          }
          return true;
        });
      }
    }
    return salida;
  }
  return r;
}