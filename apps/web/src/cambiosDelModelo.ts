import type { CambiosDeUnaColeccion } from "./tipos.js";

/**
 * El diff semántico de un `.xne` tal como llega por el cable, VALIDADO: lo que el store guarda
 * es esto. Una línea mal formada se descarta sola; lo que no es una lista devuelve `undefined`,
 * que NO es «sin cambios» —eso es la lista vacía— y así no se pinta un «nada cambió» inventado.
 */
export function leerCambiosDelModelo(valor: unknown): CambiosDeUnaColeccion[] | undefined {
  if (!Array.isArray(valor)) return undefined;
  return valor.flatMap((c): CambiosDeUnaColeccion[] => {
    if (typeof c !== "object" || c === null) return [];
    const x = c as Record<string, unknown>;
    if (typeof x.nombre !== "string") return [];
    if (x.estado !== "nueva" && x.estado !== "borrada" && x.estado !== "modificada") return [];
    return [
      {
        nombre: x.nombre,
        estado: x.estado,
        campos: lista(x.campos, (f) => {
          const { cambio, nombre, antes, ahora } = f;
          if ((cambio !== "nuevo" && cambio !== "borrado" && cambio !== "tipo") || typeof nombre !== "string") return undefined;
          return {
            cambio,
            nombre,
            ...(typeof antes === "string" ? { antes } : {}),
            ...(typeof ahora === "string" ? { ahora } : {}),
          };
        }),
        referencias: lista(x.referencias, (r) => {
          const { cambio, desde, por, hacia } = r;
          if (!esAltaOBaja(cambio) || typeof desde !== "string" || typeof por !== "string" || typeof hacia !== "string") return undefined;
          return { cambio, desde, por, hacia };
        }),
        eventos: lista(x.eventos, nombreSuelto),
        nodos: lista(x.nodos, nombreSuelto),
        conexiones: lista(x.conexiones, nombreSuelto),
      },
    ];
  });
}

function esAltaOBaja(v: unknown): v is "nuevo" | "borrado" {
  return v === "nuevo" || v === "borrado";
}

function nombreSuelto(n: Record<string, unknown>): { cambio: "nuevo" | "borrado"; nombre: string } | undefined {
  return esAltaOBaja(n.cambio) && typeof n.nombre === "string" ? { cambio: n.cambio, nombre: n.nombre } : undefined;
}

function lista<T>(valor: unknown, leer: (x: Record<string, unknown>) => T | undefined): T[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((x) => {
    if (typeof x !== "object" || x === null) return [];
    const leido = leer(x as Record<string, unknown>);
    return leido === undefined ? [] : [leido];
  });
}
