/**
 * Qué se deja traer de la máquina al área de trabajo, y con qué nombre.
 *
 * La regla, pura. La copia vive en `agent/grafo/traerDeLaMaquina.ts`; el porqué del reparto,
 * ahí también.
 */
import { basename, isAbsolute } from "node:path";
import { RUTA_ARTEFACTOS } from "./artefactos.js";

/**
 * Cuánto se deja traer de una vez.
 *
 * El área de trabajo no es un almacén: lo que cae ahí se anuncia, se puede volver a leer y
 * viaja con la sesión. Un tope es lo que impide que un `.mov` de 800 MB se copie tan callado
 * como un `.png`. 64 MB deja pasar de sobra lo que esto resuelve —una maqueta, un zip de
 * diseño, una captura— y corta lo que ya no es eso.
 */
export const TOPE_DE_TRAIDA = 64 * 1024 * 1024;

/**
 * Lo que NO se trae, y son las dos del propio harness.
 *
 * No discute el «cualquier fichero mío» de quien lo pidió: lo que queda fuera no son ficheros
 * suyos, son los de xonecode, por la misma razón por la que «la shell NO hereda las claves de
 * API» (`core/shellDeAgente.ts`). `auth.json` guarda las claves en claro, y cualquier
 * `.xonecode/` lleva la conversación entera y el contenido de cada escritura — copiarlo al
 * área de trabajo lo metería además en el contexto del modelo y en el `.jsonl`.
 *
 * Se mira por SEGMENTO y no con un `includes`, para que un `notas-sobre-.xonecode.md` no caiga
 * por llevar el nombre dentro.
 */
function esDelHarness(ruta: string): boolean {
  const segmentos = ruta.split("/");
  return segmentos.includes(".xonecode") || segmentos[segmentos.length - 1] === "auth.json";
}

/**
 * Por qué no se puede traer eso, o `undefined` si sí.
 *
 * **Lista BLANCA de forma**: tiene que ser una ruta absoluta de verdad. Una relativa no se
 * resuelve contra nada fiable —el `cwd` de este proceso no es el proyecto— y aceptar `..`
 * sería dejar que el destino lo eligiera quien escribe la ruta.
 */
export function motivoDeTraidaInaceptable(ruta: string): string | undefined {
  if (!isAbsolute(ruta)) {
    return `«${ruta}» no es una ruta absoluta. Escríbela entera, tal y como te la dieron.`;
  }
  if (ruta.split("/").includes("..")) {
    return `«${ruta}» lleva «..». Escribe la ruta ya resuelta.`;
  }
  if (esDelHarness(ruta)) {
    return (
      `«${ruta}» es del propio xonecode —sus credenciales o su memoria de sesión— y eso no se ` +
      "trae al área de trabajo: acabaría en el contexto y en el registro de la conversación."
    );
  }
  return undefined;
}

/**
 * Con qué nombre queda dentro del área de trabajo.
 *
 * El último segmento y nada más. **Es lo que impide que el destino salga de la carpeta**: sin
 * esto, un `/a/b/../../fuera.txt` escribiría fuera. Y de paso es lo que una persona reconoce
 * en la lista de artefactos, que para eso está.
 */
export function nombreParaTraer(ruta: string): string {
  return basename(ruta);
}

const PREFIJOS_DE_MAQUINA = ["/Users/", "/home/", "/tmp/", "/private/", "/Volumes/", "/opt/", "/etc/", "/var/"];

/**
 * ¿Es esto una ruta de la MÁQUINA que alguien ha escrito como si fuera del proyecto?
 *
 * Solo se usa para poder CONTESTAR bien, nunca para abrir nada: quien abre es el montaje.
 */
export function esRutaDeMaquina(ruta: string): boolean {
  return PREFIJOS_DE_MAQUINA.some((p) => ruta.startsWith(p));
}

/** La misma ruta, ya en la forma que el agente puede abrir. */

export function porQueNoSuelta(ruta: string): string {
  return (
    `«${ruta}» es una ruta de la MÁQUINA, no del proyecto: tal cual se busca dentro del ` +
    "proyecto y no está ahí. Para usarla, TRÁETELA primero con la tool `traer_de_la_maquina` " +
    `(ruta: "${ruta}"), que la copia a ${RUTA_ARTEFACTOS} y te dice con qué nombre queda. ` +
    "Luego ábrela por esa ruta. No hace falta delegar en nadie para esto."
  );
}
