/**
 * El claro/oscuro de ESTA ventana: el único ajuste visual que el navegador puede cumplir.
 *
 * El CSS de deepseek trae el tema oscuro en `body[data-ds-dark-theme]`
 * (`apps/web/estilos/design-platform.css`), así que aplicarlo es poner o quitar ese
 * atributo — no hay una segunda paleta escrita por nosotros. Los `TEMAS` de `cli/tema.ts`
 * son otra cosa: paletas ANSI para la consola de terminal, que en un navegador no pintan
 * nada; ofrecerlos aquí sería un control sin nada detrás.
 *
 * Se recuerda en `localStorage` y no en el servidor a propósito: es una preferencia de
 * ESTE navegador (la misma cuenta puede querer oscuro en el portátil y claro en la mesa), y
 * el servidor no tiene por qué enterarse de cómo se ve su cliente. Todo acceso va envuelto
 * en `try`: en una ventana privada, o con las cookies de sitio bloqueadas, el propio
 * accesor lanza — y una preferencia estética no puede tumbar la aplicación.
 */
export type Apariencia = "sistema" | "claro" | "oscuro";

const CLAVE = "xonecode.apariencia";

function esApariencia(valor: unknown): valor is Apariencia {
  return valor === "sistema" || valor === "claro" || valor === "oscuro";
}

/** Lo guardado, o «sistema»: la omisión es no decidir por el usuario. */
export function leerApariencia(): Apariencia {
  try {
    const guardada = window.localStorage.getItem(CLAVE);
    return esApariencia(guardada) ? guardada : "sistema";
  } catch {
    return "sistema";
  }
}

export function guardarApariencia(apariencia: Apariencia): void {
  try {
    window.localStorage.setItem(CLAVE, apariencia);
  } catch {
    // Sin sitio donde recordarlo, se aplica igual: dura lo que dure la pestaña.
  }
}

/**
 * Pone o quita `data-ds-dark-theme` en el `body`. Con «sistema» se mira
 * `prefers-color-scheme`, que es la preferencia que el usuario ya expresó una vez en su
 * sistema operativo — preguntársela otra vez es peaje.
 */
export function aplicarApariencia(apariencia: Apariencia, cuerpo: HTMLElement = document.body): void {
  const oscuro =
    apariencia === "oscuro" ||
    (apariencia === "sistema" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (oscuro) cuerpo.setAttribute("data-ds-dark-theme", "");
  else cuerpo.removeAttribute("data-ds-dark-theme");
}
