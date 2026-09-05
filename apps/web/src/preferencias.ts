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
