/**
 * El claro/oscuro de ESTA ventana: el único ajuste visual que el navegador puede cumplir.
 *
 * El CSS de deepseek trae el tema oscuro en `body[data-ds-dark-theme]`
 * (`apps/web/estilos/design-platform.css`), así que aplicarlo es poner o quitar ese
 * atributo; el TEMA de cada modo (`temas.ts`) se aplica encima, con su propio atributo. Los `TEMAS` de `cli/tema.ts`
 * son otra cosa: paletas ANSI para la consola de terminal, que en un navegador no pintan
 * nada; ofrecerlos aquí sería un control sin nada detrás.
 *
 * Se recuerda en `localStorage` y no en el servidor a propósito: es una preferencia de
 * ESTE navegador (la misma cuenta puede querer oscuro en el portátil y claro en la mesa), y
 * el servidor no tiene por qué enterarse de cómo se ve su cliente. Todo acceso va envuelto
 * en `try`: en una ventana privada, o con las cookies de sitio bloqueadas, el propio
 * accesor lanza — y una preferencia estética no puede tumbar la aplicación.
 */
import { NOMBRES_DE_SEMILLA, temaPorId, type ModoDeTema } from "./temas.js";

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

/** El tema elegido para cada modo, por id (`src/temas.ts`). */
export interface TemasElegidos {
  claro: string;
  oscuro: string;
}

export const TEMAS_POR_OMISION: TemasElegidos = { claro: "xonecode-claro", oscuro: "xonecode-oscuro" };

const CLAVE_DE_TEMA: Record<ModoDeTema, string> = { claro: "xonecode.tema.claro", oscuro: "xonecode.tema.oscuro" };

/**
 * Los dos temas guardados, ya RESUELTOS: un id que no está en el catálogo, o que es del otro
 * modo, se lee como XOneCode — nunca como un hueco que deje la pantalla a medias.
 */
export function leerTemas(): TemasElegidos {
  const leer = (modo: ModoDeTema): string => {
    try {
      return temaPorId(window.localStorage.getItem(CLAVE_DE_TEMA[modo]) ?? undefined, modo).id;
    } catch {
      return TEMAS_POR_OMISION[modo];
    }
  };
  return { claro: leer("claro"), oscuro: leer("oscuro") };
}

export function guardarTema(modo: ModoDeTema, id: string): void {
  try {
    window.localStorage.setItem(CLAVE_DE_TEMA[modo], id);
  } catch {
    // Como el modo: sin sitio donde recordarlo, se aplica igual y dura lo que la pestaña.
  }
}

/**
 * Pone o quita `data-ds-dark-theme` en el `body` y, encima, el TEMA de ese modo. Con
 * «sistema» se mira `prefers-color-scheme`, que es la preferencia que el usuario ya expresó una
 * vez en su sistema operativo — preguntársela otra vez es peaje.
 *
 * El tema: XOneCode QUITA `data-tema` y cada `--tema-*`, y queda la cascada de siempre; otro pone
 * `data-tema` y escribe sus semillas en el `style` del `body`, de donde las lee el puente
 * (`estilos/temas.css`). Sin `temas`, XOneCode en los dos: quien llamaba antes con un solo
 * argumento sigue viendo exactamente lo mismo.
 */
export function aplicarApariencia(
  apariencia: Apariencia,
  temas: TemasElegidos = TEMAS_POR_OMISION,
  cuerpo: HTMLElement = document.body
): void {
  const oscuro =
    apariencia === "oscuro" ||
    (apariencia === "sistema" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (oscuro) cuerpo.setAttribute("data-ds-dark-theme", "");
  else cuerpo.removeAttribute("data-ds-dark-theme");

  const modo: ModoDeTema = oscuro ? "oscuro" : "claro";
  const tema = temaPorId(temas[modo], modo);
  for (const n of NOMBRES_DE_SEMILLA) cuerpo.style.removeProperty(`--tema-${n}`);
  if (tema.semillas === undefined) {
    cuerpo.removeAttribute("data-tema");
    return;
  }
  for (const n of NOMBRES_DE_SEMILLA) cuerpo.style.setProperty(`--tema-${n}`, tema.semillas[n]);
  cuerpo.setAttribute("data-tema", tema.id);
}
