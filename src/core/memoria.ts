/**
 * La ruta VIRTUAL por la que el agente ve la memoria del proyecto, y cómo se reconoce una
 * lectura suya en el flujo de tools.
 *
 * Vive en `core/` porque la usan dos lados: `agent/` la monta en el backend
 * (`agent/grafo/memoriaDeProyecto.ts`, que la reexporta) y `core/turno.ts` la reconoce para
 * decir en la pantalla QUIÉN pidió leerla. Dos copias del literal serían dos sitios donde la
 * ruta puede cambiar y el reconocimiento quedarse mudo.
 */
export const RUTA_MEMORIA_VIRTUAL = "/MEMORIA_PROYECTO.md";

/**
 * ¿Esta llamada pide leer la memoria? Por la tool y por la ruta EXACTA, con barra o sin ella:
 * medido en una sesión real, el modelo pidió `read_file MEMORIA_PROYECTO.md` sin la barra, y
 * el backend de TrueForge la normaliza (`toolsDeFichero.ts#normalizarRuta`), así que esa
 * lectura ocurre igual. No se reconoce por «contiene el nombre»: un `grep` que lo mencione no
 * es una lectura.
 */
export function pideLeerLaMemoria(nombre: string, detalle: string | undefined): boolean {
  if (nombre !== "read_file" || detalle === undefined) return false;
  const ruta = detalle.trim().replace(/^\.\//, "");
  return (ruta.startsWith("/") ? ruta : `/${ruta}`) === RUTA_MEMORIA_VIRTUAL;
}
