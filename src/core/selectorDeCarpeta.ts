/**
 * El selector de carpeta NATIVO: qué comando lo abre en cada sistema y cómo se lee su
 * respuesta.
 *
 * **Por qué no lo pone el navegador, que es lo primero que uno intenta.** Una página no
 * puede devolver una ruta absoluta y no es un descuido de nadie: `showDirectoryPicker()`
 * entrega un handle del que solo se puede leer el NOMBRE de la carpeta, y un
 * `<input webkitdirectory>` entrega rutas RELATIVAS a lo elegido. Las dos cosas son
 * deliberadas —una web no tiene por qué saber cómo está montado tu disco— y las dos son
 * justo lo que aquí no sirve: `settings.workspace` necesita la ruta entera.
 *
 * **Por qué tampoco un explorador propio servido por nosotros.** Se puede: el servidor lista
 * carpetas y el cliente navega. El precio es que el ÁRBOL DE CARPETAS de la máquina empieza
 * a viajar por el cable, y eso es exactamente lo que `sinRutas` evita — una ruta del
 * workspace es la excepción declarada; el mapa del disco entero no lo es, y sería una
 * excepción mucho más ancha para el mismo resultado.
 *
 * **Así que lo abre el sistema donde corre la consola.** Solo cruza el cable la carpeta que
 * la persona elige, que es la misma que iba a teclear. El precio declarado es que el diálogo
 * sale en ESA máquina: con la consola por un túnel, el botón no sirve — por eso el campo de
 * texto sigue siendo el camino principal y esto es un atajo, nunca el único.
 *
 * Esta parte es pura: compone el comando y lee su salida. Lanzarlo es de
 * `agent/config/selectorEnMaquina.ts`.
 */

/** Lo que tarda un diálogo en contestar lo pone una persona, así que el tope es largo: solo
 *  existe para que un diálogo que nadie cierra no deje un proceso vivo para siempre. */
export const TOPE_DEL_SELECTOR_MS = 5 * 60 * 1000;

export interface ComandoDeSelector {
  programa: string;
  argumentos: readonly string[];
}

/**
 * El comando que abre el selector, o AUSENTE si este sistema no tiene ninguno conocido.
 *
 * Ausente no es un fallo: es «aquí no hay selector», y entonces no se ofrece el botón. Un
 * botón que no hace nada es peor que no tenerlo, y el campo de texto ya resuelve el caso.
 *
 * `desde` es dónde se abre el diálogo — la carpeta que hay puesta ahora, para no empezar en
 * un sitio cualquiera. Se pasa como argumento SEPARADO, nunca interpolado en el guion de
 * AppleScript: ahí dentro una comilla en un nombre de carpeta cerraría la cadena.
 */
export function comandoDelSelector(plataforma: string, desde?: string): ComandoDeSelector | undefined {
  if (plataforma === "darwin") {
    // `choose folder` con la ubicación por argumento (`argv of me`), y no pegada al guion.
    // Un `POSIX file` que no existe hace fallar el diálogo entero, así que el guion cae a la
    // casa cuando no se le da ninguna o la que se le da no vale.
    const guion = [
      "on run argumentos",
      "  set destino to item 1 of argumentos",
      "  try",
      '    set inicio to POSIX file destino as alias',
      "  on error",
      "    set inicio to path to home folder",
      "  end try",
      '  set elegida to choose folder with prompt "Dónde se bajan los proyectos de xonecode" default location inicio',
      "  return POSIX path of elegida",
      "end run",
    ].join("\n");
    return { programa: "osascript", argumentos: ["-e", guion, desde ?? ""] };
  }
  if (plataforma === "linux") {
    return {
      programa: "zenity",
      argumentos: [
        "--file-selection",
        "--directory",
        "--title=Dónde se bajan los proyectos de xonecode",
        ...(desde === undefined ? [] : [`--filename=${desde.replace(/\/*$/, "/")}`]),
      ],
    };
  }
  return undefined;
}

/**
 * La carpeta elegida, leída de lo que escupió el comando — o AUSENTE si no se eligió ninguna.
 *
 * **Cancelar no es un fallo y se cuenta igual que no elegir.** `osascript` sale con código 1
 * y `zenity` con 1 cuando la persona cierra el diálogo, así que quien llama no puede
 * distinguir un «no, gracias» de una avería por el código; lo que sí distingue es que no hay
 * ruta, y con eso basta: el campo se queda como estaba.
 *
 * Se recorta el salto de línea final, que es del terminal y no del dato, y se exige que
 * empiece por `/`: cualquier otra cosa que salga por ahí no es una carpeta y no se cuela
 * hasta el validador disfrazada de ruta.
 */
export function carpetaDeLaSalida(salida: string): string | undefined {
  const limpia = salida.trim().replace(/\/+$/, "");
  return limpia.startsWith("/") ? limpia : undefined;
}
