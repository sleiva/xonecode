/**
 * Lo que trae un PEGADO, para quien lo quiera como adjunto: el compositor del chat y la ventana
 * de «Nueva tarea» (IXCODE-59). Puro, sin React: las dos puertas leen el portapapeles igual.
 */

/** Lo justo de un `DataTransfer` que se lee aquí: así el test no necesita uno de verdad. */
export interface PortapapelesLegible {
  readonly files: ArrayLike<File>;
  readonly items?: ArrayLike<{ readonly kind: string; getAsFile(): File | null }>;
}

/**
 * Los ficheros del pegado. `files` es la vía normal; si viene VACÍO se miran los `items` de
 * clase `file`, porque no todo origen rellena las dos listas —una captura copiada desde una
 * herramienta del sistema puede llegar solo como item—. Sin ninguno, lista vacía: el pegado
 * es de texto y sigue su camino.
 */
export function ficherosDelPegado(datos: PortapapelesLegible | null | undefined): File[] {
  if (datos === null || datos === undefined) return [];
  const ficheros = Array.from(datos.files ?? []);
  if (ficheros.length > 0) return ficheros;
  return Array.from(datos.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null);
}

/** La extensión que se le pone a un pegado, del tipo MIME (`image/png` → `png`). Sin tipo,
 *  o con uno raro (`image/svg+xml`), se queda con la parte de antes del `+` o cae en `bin`
 *  —una extensión rara es mejor que ninguna: es lo único de lo que depende el visor. */
export function extensionDePegado(mime: string): string {
  const parte = mime.split("/")[1]?.split("+")[0];
  return parte === undefined || parte === "" ? "bin" : parte;
}

/**
 * Un pegado no trae nombre útil (`image.png` siempre): se llama `pegado-<n>.<ext>`, con el
 * primer `n` que no esté en `tomados`. Pegar dos capturas seguidas da dos nombres distintos en
 * vez de un «ya hay un adjunto con ese nombre».
 */
export function renombrarPegados(ficheros: readonly File[], tomados: ReadonlySet<string>): File[] {
  const usados = new Set(tomados);
  let n = 1;
  return ficheros.map((fichero) => {
    const extension = extensionDePegado(fichero.type);
    while (usados.has(`pegado-${n}.${extension}`)) n += 1;
    const nombre = `pegado-${n}.${extension}`;
    usados.add(nombre);
    return new File([fichero], nombre, { type: fichero.type });
  });
}
