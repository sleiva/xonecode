/**
 * **Una respuesta que se fue al CHINO**, medida con reglas de código y no con otro modelo.
 *
 * Medido en Maset: tras un turno largo, `deepseek-flash` escribió la respuesta FINAL entera en chino, con su propio
 * razonamiento diciendo justo antes «write the final answer in Spanish». La regla del idioma (`IDIOMA_DE_LA_RESPUESTA`)
 * le había llegado y la había entendido: es una deriva del modelo, no un prompt que falte, así que el arreglo es código.
 * Solo se reconoce el chino (lo único visto); una deriva a otro idioma no la ve esta regla.
 */

/** Ideogramas CJK unificados: el chino escrito. El japonés los usa también, y entonces se mira la petición. */
const HAN = /[㐀-䶿一-鿿]/gu;
/** Letras de cualquier escritura: la base contra la que se mide la proporción. */
const LETRA = /\p{L}/gu;

/** Por debajo de esto no se juzga: un nombre de producto en chino no es una respuesta en chino. */
export const MINIMO_DE_IDEOGRAMAS = 20;
/** Qué parte de las letras de la respuesta tienen que ser ideogramas para darla por escrita en chino. */
export const PROPORCION_EN_CHINO = 0.3;

function proporcionHan(texto: string): { han: number; proporcion: number } {
  const han = texto.match(HAN)?.length ?? 0;
  const letras = texto.match(LETRA)?.length ?? 0;
  return { han, proporcion: letras === 0 ? 0 : han / letras };
}

/** ¿La respuesta está escrita en chino y quien pide NO escribe en chino? Una petición con ideogramas no se corrige. */
export function respuestaEnChinoSinPedirlo(respuesta: string, peticion: string): boolean {
  const r = proporcionHan(respuesta);
  if (r.han < MINIMO_DE_IDEOGRAMAS || r.proporcion < PROPORCION_EN_CHINO) return false;
  return (peticion.match(HAN)?.length ?? 0) === 0;
}

/** Hasta dónde se cita el mensaje del usuario en la orden de reescribir: lo justo para que se vea su idioma. */
export const TOPE_DE_CITA_DEL_USUARIO = 200;

/** El mensaje que le devuelve al modelo su respuesta para que la reescriba, sin herramientas y sin cambiar el contenido. */
export function textoDeReescritura(peticion: string): string {
  const cita = peticion.trim().slice(0, TOPE_DE_CITA_DEL_USUARIO);
  return (
    "[Aviso del harness] Tu última respuesta salió escrita en chino, y el usuario no escribe en chino. Reescríbela ENTERA " +
    "en el idioma en que te escribe el usuario, sin cambiar su contenido, sin añadir nada y sin llamar a ninguna herramienta. " +
    `Su mensaje empezaba así: «${cita}»`
  );
}
