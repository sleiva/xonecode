/**
 * **¿Parte este trabajo de una maqueta?** Puro. Sin maqueta no hay contra qué comparar: ni crítico visual ni reglas de
 * fidelidad, y basta el juez del cierre. Medido en la prueba «Contacto» (04-11-2026, una opción de menú que abre una
 * web): el desarrollador pasó el crítico sin referencia. No basta mirar si el proyecto TIENE maquetas —la de la
 * calculadora seguía en `/diseno/`—: lo dice la PETICIÓN (o un adjunto de imagen).
 */
export function nombraUnaMaqueta(texto: string): boolean {
  return /\/diseno\/|\.(png|jpe?g|webp)\b|maqueta|mockup|stitch|figma|dise[ñn]o de pantalla/i.test(texto);
}
