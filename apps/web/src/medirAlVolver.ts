import { useEffect, useRef } from "react";

/**
 * Cuánto se ignora una segunda llamada seguida.
 *
 * Volver a una ventana dispara DOS eventos (`focus` de la ventana y `visibilitychange` del
 * documento) cuando además se cambió de pestaña, y son el mismo hecho: una sola vuelta. El
 * plazo es corto a propósito — lo justo para deduplicar esa pareja, no para racionar medidas:
 * un tope largo haría que volver después de apagar algo NO lo reflejara, que es justo lo que
 * esto viene a arreglar.
 */
export const MS_ENTRE_MEDIDAS_AL_VOLVER = 1_500;

/**
 * **Medir al entrar y al VOLVER**, mientras esta pantalla esté delante.
 *
 * La foto de la máquina no es un estado en vivo y esta interfaz no sondea a propósito: un
 * panel que se refresca solo cada pocos segundos lanza `adb` y `xcrun` en el equipo de quien
 * mira sin que nadie los pida. Pero hay dos momentos en los que una persona SÍ está pidiendo
 * saber, y hasta ahora solo se atendía uno:
 *
 * - **Entrar** en la sección. Eso ya se medía.
 * - **Volver a la ventana** con la sección ya abierta. Este es el que faltaba, y es el flujo
 *   normal de quien prueba: dejas Dispositivos abierto, te vas al terminal a matar el
 *   emulador, y vuelves. MEDIDO en la pantalla del usuario: la sección nunca cambia, así que
 *   no se remedía y la fila se quedaba en verde sobre una foto de hace un minuto.
 *
 * No es un sondeo: lo que dispara es un acto de la persona —vuelve a mirar—, y sin nadie
 * delante no ocurre nunca. El ritmo lo pone su atención, no un reloj.
 *
 * **`medir` va en una REF y NO en las dependencias, y eso no es estilo.** Si dependiera de su
 * identidad, una lambda escrita en el JSX —que es nueva en cada render— volvería a suscribir
 * en cada render, y como la suscripción mide al entrar, eso es una medida por render: un
 * proceso `adb` por tecla. Casi se colé así: `App` pasaba justo esa lambda a Ajustes. Con la
 * ref, el hook no se puede usar mal desde fuera, que es mejor que pedirle al llamador que se
 * acuerde de envolverla.
 */
export function useMedirAlVolver(activo: boolean, medir: (() => void) | undefined): void {
  const ultimoMedir = useRef(medir);
  ultimoMedir.current = medir;
  const hay = medir !== undefined;
  useEffect(() => {
    if (!activo || !hay) return;
    let ultima = 0;
    const alVolver = (): void => {
      // Escondida no se mide: una pestaña de fondo no la está mirando nadie.
      if (document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (ahora - ultima < MS_ENTRE_MEDIDAS_AL_VOLVER) return;
      ultima = ahora;
      ultimoMedir.current?.();
    };
    // La primera, al entrar: `ultima` se queda puesto, así que el `focus` que a veces llega
    // detrás de un clic no la duplica.
    alVolver();
    window.addEventListener("focus", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.removeEventListener("focus", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [activo, hay]);
}
