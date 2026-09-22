import { crearSerieDeEscrituras } from "../../core/serieDeEscrituras.js";

/**
 * Dos escrituras sobre el MISMO fichero no se solapan: la segunda espera a que acabe la
 * primera. Sobre ficheros distintos no cambia nada.
 *
 * **El fallo que cierra es silencioso, que es lo que lo hace grave.** `write` y `edit` del
 * backend son leer-modificar-escribir sobre el fichero entero, así que dos a la vez se pisan
 * y **las dos contestan que bien**. Reproducido contra el backend real: cuatro `edit`
 * concurrentes, cuatro resultados sin error, **una** aplicada. Y ocurre de verdad — en una
 * sesión de MyAllXOne la traza de errores registró dos `edit` sobre `/funciones.js` entrando
 * en el MISMO milisegundo, con el testigo `escrituraSolapada` disparado.
 *
 * **Por qué serializar basta**, que era la objeción razonable: la segunda edición calculó su
 * `old_string` contra un contenido que la primera acaba de cambiar. Cierto — y por eso este
 * envoltorio va POR FUERA de quien edita, no por dentro: cuando le llega el turno, el camino
 * de escritura vuelve a leer el fichero y vuelve a buscar el `old_string` contra lo que hay
 * AHORA. Si el ancla sigue, la edición es correcta; si desapareció, el backend contesta que
 * no lo encuentra y el modelo recibe su error y reintenta. Medido: en serie, cuatro ediciones
 * independientes se aplican las cuatro, y dos que se pisan dan una aplicada y **un error
 * visible** — en vez de una aplicada y un cambio perdido sin que nadie se entere.
 *
 * **Dónde va en la pila**: por dentro de las guardas de RUTA —que contestan con una
 * comparación de texto y deben seguir contestando primero, ver `proyecto.ts`— y por fuera de
 * `sinContenidoInvalido`, para que leer el fichero de antes, validar y escribir sean un solo
 * turno. Al revés, dos validaciones podrían intercalarse entre la lectura y la escritura, que
 * es exactamente la carrera que esto viene a quitar.
 *
 * **No toca `read`, `ls`, `glob` ni nada que no escriba.** Serializar lecturas no arregla
 * nada y convertiría en secuencial el trabajo que sí puede ir en paralelo, que es la mitad de
 * lo que el agente hace.
 */
export function escriturasEnSerie<T extends object>(backend: T): T {
  const enSerie = crearSerieDeEscrituras();
  return new Proxy(backend, {
    get(destino, prop) {
      // El valor se lee contra el OBJETIVO y no contra el proxy: `LocalShellBackend.id` es un
      // getter sobre un campo privado y `Reflect.get(o, p, receptor)` lanza al leerlo — lo
      // lee el constructor de `CompositeBackend`, así que el fallo sería al MONTAR.
      const valor = Reflect.get(destino, prop, destino);
      if (typeof valor !== "function") return valor;
      const fn = (valor as (...a: unknown[]) => unknown).bind(destino);
      if (prop !== "write" && prop !== "edit") return fn;
      return async (...args: unknown[]) => {
        const ruta = typeof args[0] === "string" ? args[0] : undefined;
        // Sin ruta no hay nada por lo que serializar, y inventar una clave común pondría en
        // fila escrituras de ficheros distintos. Pasa tal cual: la dirección conservadora
        // aquí es NO cambiar el comportamiento de una llamada que no se entiende.
        if (ruta === undefined) return await fn(...args);
        return await enSerie(ruta, async () => await fn(...args));
      };
    },
  }) as T;
}
