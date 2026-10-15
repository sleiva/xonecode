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

/**
 * **Lo que el raíz escribe ENTRE herramientas, en INGLÉS cuando el usuario no escribe en inglés.** Medido en Maset
 * (MAS-3): en una tarea larga `deepseek-flash` pasó a escribir en inglés lo que la persona lee («Round 2 written. Let
 * me validate…»), con `IDIOMA_DE_LA_RESPUESTA` en su prompt. Como con el chino, es una deriva y el arreglo es código:
 * se DETECTA por palabras vacías —las más frecuentes de cada idioma, que no dependen del tema— y se le recuerda el
 * idioma antes de su siguiente llamada. No se reescribe lo ya dicho: entre herramientas no hay respuesta que rehacer.
 */
const VACIAS_EN = new Set(
  "the and to of is it that this with for now let me i i'll let's will then so we what on in are be have has was not can should".split(" ")
);
const VACIAS_ES = new Set(
  "el la los las de del que y en un una es lo se por para con no al como más pero sus su ya voy ahora esto este esta hay".split(" ")
);

/** Cuántas palabras vacías de un idioma hacen falta para decir nada: un mensaje de una línea no se juzga. */
export const MINIMO_DE_VACIAS = 6;

function cuentaVacias(texto: string): { en: number; es: number } {
  // Fuera el código y las rutas: un `the_value` o un `/de/` no son el idioma de quien escribe.
  const limpio = texto.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").toLowerCase();
  const palabras = limpio.match(/[a-záéíóúñü']+/g) ?? [];
  let en = 0;
  let es = 0;
  for (const p of palabras) {
    if (VACIAS_EN.has(p)) en++;
    if (VACIAS_ES.has(p)) es++;
  }
  return { en, es };
}

/** ¿Está este texto en inglés y quien pide NO escribe en inglés? Las dos medidas, con margen: dudoso es «no». */
export function textoEnInglesSinPedirlo(texto: string, peticion: string): boolean {
  const t = cuentaVacias(texto);
  if (t.en < MINIMO_DE_VACIAS || t.en < 2 * t.es) return false;
  const p = cuentaVacias(peticion);
  return p.es > p.en;
}

/** Cuántas veces por turno se le recuerda: si no hace caso, insistir no lo arregla y gasta. */
export const TOPE_DE_RECORDATORIOS_DE_IDIOMA = 2;

/** El recordatorio, como mensaje de usuario antes de su siguiente llamada. */
export function textoDeRecordatorioDeIdioma(peticion: string): string {
  const cita = peticion.trim().slice(0, TOPE_DE_CITA_DEL_USUARIO);
  return (
    "[Aviso del harness] Lo que escribes entre herramientas está saliendo en inglés, y el usuario no escribe en inglés. " +
    "Desde ahora escribe TODO lo que el usuario lee —mensajes entre herramientas y respuesta final— en su idioma. Tu " +
    `razonamiento puede seguir como quieras. Su mensaje empezaba así: «${cita}»`
  );
}
