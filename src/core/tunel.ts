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
  noInstalado: "El componente de ngrok que trae xonecode no carga en esta máquina: reinstala xonecode.",
  autenticacion: "ngrok no acepta el authtoken (falta o no es válido).",
  dominio: "ngrok no deja usar ese dominio: no es de tu cuenta, o tu plan no admite dominios propios.",
  otraSesion: "Ya hay otro ngrok de tu cuenta abierto (en esta máquina o en otra): ciérralo y vuelve a encender.",
  sinDireccion: "ngrok no dio una dirección pública a tiempo.",
  seCerro: "ngrok se cerró.",
  paqueteViejo: "El paquete de la sesión remota instalado no trae el puente: actualízalo.",
  otro: "ngrok falló y no se pudo abrir el túnel.",
  puente: "No se pudo arrancar el puente local de la sesión remota.",
  authtokenSinForma: "Eso no tiene la forma de un authtoken de ngrok.",
  authtokenNoGuardado: "No se pudo guardar el authtoken.",
} as const;

export type ClaveDeMotivoDelTunel = keyof typeof MOTIVOS_DEL_TUNEL;

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
// 108 (límite de sesiones simultáneas) y 334 (el endpoint ya está en línea) NO son ni token ni
// dominio: es otro ngrok de la cuenta abierto —un huérfano de un cierre en seco, por ejemplo—.
const CODIGOS_DE_AUTENTICACION = new Set(["105", "106", "107", "4018"]);
const CODIGOS_DE_DOMINIO = new Set(["313", "314", "337"]);
const CODIGOS_DE_OTRA_SESION = new Set(["108", "334"]);

/** Por qué se cerró ngrok, mirando solo el CÓDIGO `ERR_NGROK_xxx` de sus líneas, nunca su texto. */
export function motivoDeSalidaDeNgrok(lineas: readonly string[]): "autenticacion" | "dominio" | "otraSesion" | "otro" {
  for (const linea of lineas) {
    for (const m of linea.matchAll(/ERR_NGROK_(\d+)/g)) {
      if (CODIGOS_DE_AUTENTICACION.has(m[1]!)) return "autenticacion";
      if (CODIGOS_DE_DOMINIO.has(m[1]!)) return "dominio";
      if (CODIGOS_DE_OTRA_SESION.has(m[1]!)) return "otraSesion";
    }
  }
  return "otro";
}

/**
 * Dónde guarda el authtoken el programa `ngrok`, por si ya lo usabas: el SDK no lee esa configuración, y sin mirarla
 * habría que volver a pedirte el token. v3 por plataforma y la v2 de siempre (`~/.ngrok2`). Puro: la casa y el entorno
 * entran por parámetro.
 */
export function rutasDeConfigDeNgrok(plataforma: string, entorno: Record<string, string | undefined>, casa: string): string[] {
  const sep = plataforma === "win32" ? "\\" : "/";
  const unir = (...partes: string[]) => partes.join(sep);
  const v3 =
    plataforma === "darwin"
      ? unir(casa, "Library", "Application Support", "ngrok", "ngrok.yml")
      : plataforma === "win32"
        ? unir(entorno.LOCALAPPDATA ?? unir(casa, "AppData", "Local"), "ngrok", "ngrok.yml")
        : unir(entorno.XDG_CONFIG_HOME ?? unir(casa, ".config"), "ngrok", "ngrok.yml");
  return [v3, unir(casa, ".ngrok2", "ngrok.yml")];
}

/**
 * El valor de una línea `authtoken:` no vacía, arriba (formato v2) o dentro de `agent:` (v3). `authtoken: ""` o sin
 * valor no es una cuenta.
 */
export function authtokenDeConfig(texto: string): string | undefined {
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*authtoken:(.*)$/.exec(linea);
    if (m === null) continue;
    const valor = m[1]!.replace(/\s+#.*$/, "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
    if (valor !== "" && !valor.startsWith("#")) return valor;
  }
  return undefined;
}

/** Lo que tiene un authtoken de ngrok: alfanumérico con `_`/`-`, sin espacios, empezando por letra o cifra. */
export const FORMA_DE_AUTHTOKEN = /^[A-Za-z0-9][A-Za-z0-9_-]{9,199}$/;
