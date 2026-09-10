/**
 * Las preferencias de ESTA ventana, guardadas en el navegador.
 *
 * Aparte de `apariencia.ts` porque son otra cosa —aquello aplica un tema al documento, esto
 * solo recuerda un booleano—, pero con la misma disciplina y por el mismo motivo: todo
 * acceso a `localStorage` va envuelto en `try`, porque en una ventana privada o con las
 * cookies de sitio bloqueadas el propio accesor LANZA, y una comodidad de encuadre no puede
 * tumbar la aplicación.
 *
 * No van al servidor a propósito: plegar la barra es de este navegador (la misma cuenta
 * puede querer la barra plegada en el portátil y abierta en la pantalla grande), y el
 * servidor no tiene por qué enterarse de cómo se ve su cliente.
 */
const CLAVE_BARRA = "xonecode.barraContraida";
const CLAVE_ANCHO = "xonecode.anchoBarra";

export function leerBarraContraida(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_BARRA) === "1";
  } catch {
    // Sin sitio donde recordarlo, se arranca con la barra a la vista: es la omisión, y la
    // que enseña que existe.
    return false;
  }
}

export function guardarBarraContraida(contraida: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_BARRA, contraida ? "1" : "0");
  } catch {
    // Se pliega igual; dura lo que dure la pestaña.
  }
}

/**
 * El ancho de la barra lateral, en píxeles. **Ausente no es cero**: es «nadie lo ha
 * movido», y entonces manda la omisión de la maqueta — devolverla desde aquí sería tener
 * la misma cifra escrita en dos sitios que se pueden desincronizar.
 *
 * No se ACOTA aquí: los límites son geometría de la maqueta (`acotarAnchoDeBarra`), y
 * quien lee esto no tiene por qué conocerlos. Lo que sí se descarta es lo que no es un
 * número: `localStorage` guarda texto y un valor a mano —o de una versión anterior— no
 * puede convertirse en un `NaN` que acabe en un `grid-template-columns`.
 */
export function leerAnchoBarra(): number | undefined {
  try {
    const guardado = window.localStorage.getItem(CLAVE_ANCHO);
    if (guardado === null) return undefined;
    const px = Number.parseInt(guardado, 10);
    return Number.isFinite(px) ? px : undefined;
  } catch {
    return undefined;
  }
}

export function guardarAnchoBarra(px: number): void {
  try {
    window.localStorage.setItem(CLAVE_ANCHO, String(Math.round(px)));
  } catch {
    // Se redimensiona igual; dura lo que dure la pestaña.
  }
}
