/**
 * El inventario del proyecto remoto.
 *
 * `get_project_structure` se trunca (medido: con `maxFiles:60` ya devolvía
 * `truncated:true`, y el tope duro es 2000). Como el manifiesto es lo que impide borrar
 * en Studio lo que no pudimos bajar, una enumeración incompleta no es un detalle
 * cosmético: es el candado con una pata menos.
 */
import type { CloudStudioPort } from "../core/ports.js";
import type { ManifiestoRemoto } from "../core/cloudstudio.js";

export interface ResultadoDeEnumeracion {
  manifiesto: ManifiestoRemoto;
  /** Directorios que no se pudieron listar. Salen en el informe: callarlos es peor. */
  noEnumerados: string[];
}

/**
 * Todos los directorios antepasados de una ruta, del más profundo al más superficial.
 *
 * No basta con el padre inmediato: si el truncado esconde un directorio HERMANO del que
 * sí sobrevivió (p. ej. "a/d/" cuando solo asomó "a/b/c.txt"), solo pedir "a/b" nunca
 * llega a pedir "a", y "a/d/e.txt" se queda sin enumerar. Encolar la cadena entera de
 * ancestros es lo que recupera esos hermanos.
 */
const ancestrosDe = (ruta: string): string[] => {
  const partes = ruta.split("/");
  const ancestros: string[] = [];
  for (let i = partes.length - 1; i > 0; i--) {
    ancestros.push(partes.slice(0, i).join("/"));
  }
  return ancestros;
};

export async function enumerarRemoto(puerto: CloudStudioPort): Promise<ResultadoDeEnumeracion> {
  const vistas = new Map<string, number>();
  const noEnumerados: string[] = [];
  const pendientes: string[] = [""];
  const visitados = new Set<string>();

  while (pendientes.length > 0) {
    const directorio = pendientes.shift()!;
    if (visitados.has(directorio)) continue;
    visitados.add(directorio);

    let entradas;
    try {
      entradas = await puerto.estructura(directorio === "" ? undefined : directorio);
    } catch {
      // El motivo no se propaga al mensaje: puede traer rutas del servidor. Basta con
      // saber QUÉ no se enumeró, que es lo que condiciona el candado.
      noEnumerados.push(directorio);
      continue;
    }

    for (const entrada of entradas) {
      vistas.set(entrada.ruta, entrada.bytes);
      // Cada directorio antepasado se vuelve a pedir por su cuenta: si esta respuesta
      // venía truncada, el recorrido por subdirectorios recupera lo que faltó — incluidos
      // hermanos que no llegaron a asomar en absoluto en la respuesta truncada.
      for (const ancestro of ancestrosDe(entrada.ruta)) {
        if (!visitados.has(ancestro)) pendientes.push(ancestro);
      }
    }
  }

  const manifiesto = [...vistas.entries()]
    .map(([ruta, bytes]) => ({ ruta, bytes }))
    .sort((a, b) => a.ruta.localeCompare(b.ruta));
  return { manifiesto, noEnumerados };
}
