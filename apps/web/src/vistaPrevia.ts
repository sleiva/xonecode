import { useCallback, useEffect, useRef } from "react";

/**
 * Miniaturas de lo que se va a adjuntar (IXCODE-59), sacadas del FICHERO LOCAL con
 * `URL.createObjectURL`: no hace falta esperar a la subida ni pedirle nada al servidor, y no
 * se compone ninguna ruta de la máquina.
 *
 * Solo imágenes —un PDF o un zip no tienen miniatura que enseñar— y solo donde el navegador
 * sabe crear la URL (jsdom no: ahí no hay miniatura, y la fila sigue con su nombre). Cada URL
 * retiene los bytes en memoria hasta soltarla: `soltar` al quitar la fila, y todas al
 * desmontar.
 */
export function useVistasPrevias(): {
  crear: (fichero: File) => string | undefined;
  soltar: (url: string | undefined) => void;
} {
  const vivas = useRef(new Set<string>());
  useEffect(() => {
    const conjunto = vivas.current;
    return () => {
      for (const url of conjunto) URL.revokeObjectURL(url);
      conjunto.clear();
    };
  }, []);
  const crear = useCallback((fichero: File): string | undefined => {
    if (!fichero.type.startsWith("image/") || typeof URL.createObjectURL !== "function") return undefined;
    const url = URL.createObjectURL(fichero);
    vivas.current.add(url);
    return url;
  }, []);
  const soltar = useCallback((url: string | undefined): void => {
    if (url === undefined || !vivas.current.delete(url)) return;
    URL.revokeObjectURL(url);
  }, []);
  return { crear, soltar };
}
