/**
 * `/disco/`: la máquina entera, de SOLO lectura, para el agente del proyecto.
 *
 * **Por qué existe.** Las tools de fichero van confinadas a la raíz del proyecto
 * (`virtualMode: true`), y eso es deliberado. Pero rompe un caso real y frecuente: la persona
 * pega la ruta de un fichero suyo —«usa el diseño de
 * `/Users/…/Downloads/stitch_calculadora.zip`»— y el agente no puede abrirlo. Medido en una
 * sesión de verdad: la ruta se resolvía DENTRO del proyecto
 * (`…/MyAllXOne/Users/…/Downloads/…`), volvía un ENOENT, el orquestador concluyó que estaba
 * enjaulado y se fue a delegar en el único especialista con shell para que lo copiara — 18
 * pasos y un `unzip` para leer un fichero que la persona acababa de nombrar.
 *
 * **Por qué un MONTAJE y no quitar el confinamiento.** Es la misma pieza que `/skills/`,
 * `/adjuntos/` y `/planes/`: otra raíz del `CompositeBackend`. Eso mantiene intacto cómo se
 * resuelven las rutas del proyecto, deja la capacidad VISIBLE en la propia ruta —quien lea la
 * traza ve `/disco/…` y sabe que se salió del proyecto— y, sobre todo, la deja bajo
 * `permisosDe`, que es donde se le pone el «solo lectura».
 *
 * **Solo LECTURA.** Es lo que el caso pide y es lo que más duele si se equivoca: un agente que
 * pueda escribir en cualquier sitio de la máquina no tiene arreglo, y para escribir ya está el
 * proyecto, con su aprobación.
 *
 * **Y esto es para el motor `modelo`.** Un subagente de motor EXTERNO corre en otro proceso y
 * lee el disco de verdad, acotado por `veredictoDeLectura` (`agent/subagentes/escrituraExterna.ts`):
 * ésa es otra puerta y no se toca aquí.
 */

/** La raíz virtual. Con barra final: `CompositeBackend` la retira antes de delegar. */
export const RUTA_DISCO = "/disco/";

/**
 * Los prefijos que de verdad existen en la máquina, y que por tanto una ruta pegada por una
 * persona puede empezar por.
 *
 * Es una lista CERRADA a propósito: sirve para reconocer «esto que me han dado es una ruta de
 * la máquina, no del proyecto» y reescribirla. Una heurística tipo «empieza por `/` y tiene
 * varios segmentos» confundiría `/EspecialCalculadora.xne` con un directorio del sistema.
 */
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
export function bajoDisco(ruta: string): string {
  return `${RUTA_DISCO}${ruta.replace(/^\/+/, "")}`;
}

/**
 * Lo que NO se lee ni siquiera por aquí, y son DOS, las dos del harness y no de la persona.
 *
 * Quien pidió esto dijo «cualquier lugar del disco» y esto no lo discute: lo que se queda
 * fuera no son ficheros suyos, son los del propio xonecode, y por la misma razón por la que
 * «la shell NO hereda las claves de API» (`core/shellDeAgente.ts`):
 *
 * - **`auth.json`**: guarda las claves de API en claro. Leerlo las mete en el contexto del
 *   modelo y, de ahí, en el `.jsonl` de la sesión — que es exactamente lo que ese invariante
 *   existe para impedir.
 * - **Cualquier `.xonecode/`**: es lo que `permisosDe` ya deniega dentro del proyecto, y sin
 *   esto `/disco/<lo que sea>/MyAllXOne/.xonecode/checkpoint.sqlite` sería una segunda puerta
 *   a lo mismo — con la conversación entera y el contenido de cada escritura dentro.
 *
 * Se mira por SEGMENTO y no con un `includes`, para que un `notas-sobre-.xonecode.md` no sea
 * basura por llevar el nombre dentro.
 */
export function motivoDeDiscoDenegado(rutaVirtual: string): string | undefined {
  if (!rutaVirtual.startsWith(RUTA_DISCO)) return undefined;
  const segmentos = rutaVirtual.slice(RUTA_DISCO.length).split("/");
  if (segmentos.includes(".xonecode")) {
    return (
      `«${rutaVirtual}» cuelga de una carpeta `.concat(
        "`.xonecode`, que es la memoria del propio harness: lleva la conversación entera, el ",
        "contenido de cada escritura y las credenciales. No se lee por aquí, igual que no se lee ",
        "dentro del proyecto.",
      )
    );
  }
  if (segmentos[segmentos.length - 1] === "auth.json") {
    return `«${rutaVirtual}» es el fichero de credenciales de xonecode: guarda las claves de API en claro y no se lee.`;
  }
  return undefined;
}

/**
 * El mensaje con el que se rechaza una ruta de máquina escrita a pelo, con la buena YA ESCRITA.
 *
 * **Rechazar y reescribir, no fallar en seco.** Es la lección de `porQueNo` (vistas aplanadas)
 * y la de `xone_navegacion` cuando no sabe contestar: a un modelo al que se le dice que algo no
 * se puede, sin decirle cómo sí, se le ocurre otra cosa — y lo que se le ocurrió, medido, fue
 * delegar en el agente con shell. El error de antes era peor que inútil: decía «no such file or
 * directory» sobre un fichero que SÍ existe, así que invitaba a concluir que no estaba.
 *
 * Y no lleva la raíz del proyecto, que es lo que el ENOENT de Node sí filtraba.
 */
export function porQueNoSuelta(ruta: string): string {
  return (
    `«${ruta}» es una ruta de la MÁQUINA, no del proyecto, así que tal cual se busca dentro del ` +
    `proyecto y no está ahí. La máquina se lee bajo «${RUTA_DISCO}», de solo lectura. ` +
    `Ábrelo como «${bajoDisco(ruta)}».`
  );
}
