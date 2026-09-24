import type { ColeccionDeLaFoto, FotoDeColecciones, ReferenciaXone } from "./tipos.js";

/**
 * La foto del modelo XOne tal como llega por el cable, VALIDADA campo a campo: lo que el store
 * guarda es esto, nunca el JSON crudo. Una entrada mal formada se DESCARTA sola —una
 * referencia sin `hacia` no se puede enseñar— sin tirar la foto entera, que seguiría siendo
 * verdad para el resto; y lo que no tenga la forma de una foto devuelve `undefined`.
 */
export function leerFotoDeColecciones(valor: unknown): FotoDeColecciones | undefined {
  if (typeof valor !== "object" || valor === null) return undefined;
  const v = valor as Record<string, unknown>;
  if (!Array.isArray(v.colecciones) || typeof v.total !== "number") return undefined;
  const colecciones = v.colecciones.flatMap((c): ColeccionDeLaFoto[] => {
    const x = leerColeccion(c);
    return x === undefined ? [] : [x];
  });
  return {
    colecciones,
    total: v.total,
    entrada: cadenas(v.entrada),
    login: cadenas(v.login),
    rotas: referencias(v.rotas),
  };
}

function leerColeccion(valor: unknown): ColeccionDeLaFoto | undefined {
  if (typeof valor !== "object" || valor === null) return undefined;
  const c = valor as Record<string, unknown>;
  if (typeof c.nombre !== "string" || typeof c.fichero !== "string") return undefined;
  const campos = Array.isArray(c.campos)
    ? c.campos.flatMap((f): { nombre: string; tipo?: string }[] => {
        if (typeof f !== "object" || f === null) return [];
        const { nombre, tipo } = f as { nombre?: unknown; tipo?: unknown };
        if (typeof nombre !== "string") return [];
        return [{ nombre, ...(typeof tipo === "string" ? { tipo } : {}) }];
      })
    : [];
  return {
    nombre: c.nombre,
    fichero: c.fichero,
    campos,
    eventos: cadenas(c.eventos),
    nodos: cadenas(c.nodos),
    conexiones: cadenas(c.conexiones),
    apuntaA: referencias(c.apuntaA),
    leApuntan: referencias(c.leApuntan),
  };
}

function cadenas(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((x): x is string => typeof x === "string") : [];
}

function referencias(valor: unknown): ReferenciaXone[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((r): ReferenciaXone[] => {
    if (typeof r !== "object" || r === null) return [];
    const { desde, por, hacia, fichero } = r as Record<string, unknown>;
    if (typeof desde !== "string" || typeof por !== "string" || typeof hacia !== "string" || typeof fichero !== "string") return [];
    return [{ desde, por, hacia, fichero }];
  });
}

/**
 * Las tres CONFIANZAS de una referencia, que la pestaña enseña por separado y nunca funde:
 * una resuelta por un atributo XML, una llamada de script con su literal, y una mención —un
 * literal que coincide con una colección—, que es la señal floja (`core/navegacion.ts`).
 */
export type ConfianzaDeReferencia = "resuelta" | "script" | "mencion";

export function confianzaDe(r: ReferenciaXone): ConfianzaDeReferencia {
  return r.por === "script" ? "script" : r.por === "mencion" ? "mencion" : "resuelta";
}
