/**
 * Un nodo del árbol de ficheros. `hijos` PRESENTE significa carpeta (aunque esté vacía);
 * ausente, hoja. `ruta` es la acumulada desde la raíz, sin barra inicial, que es la forma
 * en que viajan las rutas por el cable (`src/app.xne`).
 */
export interface NodoDelArbol {
  nombre: string;
  ruta: string;
  hijos?: NodoDelArbol[];
}

/**
 * De la lista plana que manda el servidor al árbol que se pinta. El ORDEN es el de llegada:
 * quien ordena es quien lista (el host, carpetas antes que ficheros; git, alfabético), y
 * reordenar aquí sería una segunda opinión.
 */
export function arbolDeRutas(rutas: readonly string[]): NodoDelArbol[] {
  const raiz: NodoDelArbol[] = [];
  for (const ruta of rutas) {
    const segmentos = ruta.split("/");
    let nivel = raiz;
    let acumulada = "";
    segmentos.forEach((segmento, i) => {
      acumulada = acumulada === "" ? segmento : `${acumulada}/${segmento}`;
      const esHoja = i === segmentos.length - 1;
      let nodo = nivel.find((n) => n.nombre === segmento && (n.hijos !== undefined) === !esHoja);
      if (nodo === undefined) {
        nodo = esHoja ? { nombre: segmento, ruta: acumulada } : { nombre: segmento, ruta: acumulada, hijos: [] };
        nivel.push(nodo);
      }
      if (!esHoja) nivel = nodo.hijos!;
    });
  }
  return raiz;
}
