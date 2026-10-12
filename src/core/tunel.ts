/**
 * El túnel de ngrok para la sesión remota: las reglas SIN efectos. Quien lanza el proceso es
 * `agent/remoto/`; aquí solo se lee su log, se compone la dirección del puente y se dicen
 * los fallos con texto FIJO nuestro.
 *
 * **Nada de lo que ngrok escribe cruza el cable.** Su salida lleva la ruta de la configuración,
 * el correo de la cuenta y, en un error de autenticación, el authtoken tecleado: por eso el
 * motivo de un fallo se decide por su CÓDIGO (`ERR_NGROK_xxx`) y lo que se enseña es una
 * entrada de `MOTIVOS_DEL_TUNEL`, nunca la línea. Las líneas de los tests son salida real de
 * ngrok v3 (`src/core/__oro__/ngrok-v3*.jsonl`), con la ruta, el correo y el token redactados.
 */

/** Texto fijo por causa. Es lo ÚNICO que sale de un fallo del túnel hacia el cable. */
export const MOTIVOS_DEL_TUNEL = {
  noInstalado: "ngrok no está instalado en esta máquina.",
  autenticacion: "ngrok no acepta el authtoken (falta o no es válido).",
  dominio: "ngrok no deja usar ese dominio: no es de tu cuenta, o tu plan no admite dominios propios.",
  sinDireccion: "ngrok no dio una dirección pública a tiempo.",
  seCerro: "ngrok se cerró.",
  paqueteViejo: "El paquete de la sesión remota instalado no trae el puente: actualízalo.",
  otro: "ngrok falló y no se pudo abrir el túnel.",
} as const;

export type ClaveDeMotivoDelTunel = keyof typeof MOTIVOS_DEL_TUNEL;

/**
 * La dirección pública que ngrok anuncia al levantar el túnel: la línea JSON de `msg:
 * "started tunnel"` (con `--log stdout --log-format json`) trae un `url`. Cualquier otra línea,
 * o un túnel que no sea https, es `undefined`. No se lee de la API local (4040), que se mueve
 * si el puerto está ocupado.
 */
export function urlPublicaDeLinea(linea: string): string | undefined {
  if (!linea.startsWith("{")) return undefined;
  let o: unknown;
  try {
    o = JSON.parse(linea);
  } catch {
    return undefined;
  }
  if (typeof o !== "object" || o === null) return undefined;
  const { msg, url } = o as { msg?: unknown; url?: unknown };
  if (msg !== "started tunnel" || typeof url !== "string") return undefined;
  return url.startsWith("https://") ? url : undefined;
}

/** `https://host` → `wss://host/ws`: el puente de la sesión remota atiende el WebSocket en `/ws`. */
export function servidorDeTunel(https: string): string {
  const url = new URL(https);
  if (url.protocol !== "https:") throw new Error("la dirección del túnel tiene que ser https");
  return `wss://${url.host}/ws`;
}

const ETIQUETA = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** Un nombre de host con al menos un punto: sin esquema, ruta, puerto ni espacios. */
export function motivoDeDominioInaceptable(dominio: unknown): string | undefined {
  if (typeof dominio !== "string" || dominio === "") return "el dominio está vacío";
  if (dominio.length > 253) return "el dominio es demasiado largo";
  const etiquetas = dominio.toLowerCase().split(".");
  if (etiquetas.length < 2) return "el dominio tiene que ser un nombre completo, como mi-app.ngrok.app";
  if (!etiquetas.every((e) => e.length <= 63 && ETIQUETA.test(e))) {
    return "el dominio es solo el nombre de host: sin https://, sin ruta, sin puerto";
  }
  return undefined;
}

// Medido: 105 es el authtoken que no parece uno, 313 el dominio que el plan o la cuenta no
// permite. Los demás de cada grupo son los de la documentación de ngrok para el mismo fallo.
const CODIGOS_DE_AUTENTICACION = new Set(["105", "106", "107", "108", "4018"]);
const CODIGOS_DE_DOMINIO = new Set(["313", "314", "334", "337"]);

/** Por qué se cerró ngrok, mirando solo el CÓDIGO `ERR_NGROK_xxx` de sus líneas, nunca su texto. */
export function motivoDeSalidaDeNgrok(lineas: readonly string[]): "autenticacion" | "dominio" | "otro" {
  for (const linea of lineas) {
    for (const m of linea.matchAll(/ERR_NGROK_(\d+)/g)) {
      if (CODIGOS_DE_AUTENTICACION.has(m[1]!)) return "autenticacion";
      if (CODIGOS_DE_DOMINIO.has(m[1]!)) return "dominio";
    }
  }
  return "otro";
}
