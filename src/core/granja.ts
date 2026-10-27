/**
 * La granja de dispositivos XOne: lo PURO de su configuración y de lo que contesta.
 *
 * La granja (`android-xone-device-farm`, protocolo en su `protocolo_granja.md`) son teléfonos
 * Android en el USB de OTRO PC, cada uno con varias copias del framework («slots»). xonecode no
 * reserva ninguno: cuando hace falta probar pide una copia libre, y al acabar el turno la libera
 * (eso es la fase 2; esto es la configuración).
 *
 * - **Dónde está la granja y con qué token se entra es del EQUIPO** (Ajustes → Dispositivos →
 *   Granja): la dirección en `settings.json#granja`, el token en `~/.xonecode/granja.json` (0600),
 *   que es un secreto y por eso nunca viaja por el cable ni llega a la shell del agente.
 * - **Usar la granja o este equipo lo decide cada PROYECTO** (`config.json#origenDeDispositivos`),
 *   en la pastilla del chat. iOS sigue siendo local: la granja es solo Android.
 * - **El certificado es autofirmado y se fija por su HUELLA** la primera vez que contesta bien;
 *   una huella distinta después NO manda el token hasta que la persona acepta la nueva.
 */

/** El puerto de la granja cuando la dirección es solo un host o una IP. */
export const PUERTO_DE_GRANJA = 8090;

/** Los sitios donde `http://` no cruza ninguna red: la granja por omisión escucha en `127.0.0.1`. */
const LOOPBACK: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * La URL base de la granja a partir de lo que se teclea en Ajustes, o el motivo para no aceptarla.
 *
 * Se acepta una IP o un host a secas (`192.168.1.40`, `granja.local:9000`) y se completa a
 * `https://<host>:8090`, que es como se abre la granja a la red (el https no es opcional fuera de
 * loopback: sin él no hay vídeo). `http://` solo en loopback, la misma regla que un endpoint de
 * modelo (`core/modelos.ts#motivoDeEndpointInaceptable`). Nunca con usuario ni contraseña dentro,
 * ni con ruta, consulta o fragmento: la base es el ORIGEN, y las rutas las pone el cliente.
 */
export function direccionDeGranja(texto: string): { url: string } | { motivo: string } {
  const limpio = texto.trim();
  if (limpio === "") return { motivo: "falta la dirección de la granja: su IP o su URL" };
  const sinEsquema = !/^[a-z][a-z0-9+.-]*:\/\//i.test(limpio);
  const conEsquema = sinEsquema ? `https://${limpio}` : limpio;
  let url: URL;
  try {
    url = new URL(conEsquema);
  } catch {
    return { motivo: "eso no es una dirección: escribe la IP de la granja o algo como https://granja:8090" };
  }
  if (url.username !== "" || url.password !== "") {
    return { motivo: "la dirección no puede llevar usuario ni contraseña: se entra con el token" };
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    return { motivo: "la dirección debe ser https; http:// solo vale en 127.0.0.1 o localhost" };
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search !== "" || url.hash !== "") {
    return { motivo: "solo la dirección de la granja, sin ruta detrás (por ejemplo https://192.168.1.40:8090)" };
  }
  // Sin esquema, el puerto que falta es el de la granja; con esquema, el que diga la URL (o el del esquema).
  const puerto = url.port !== "" ? `:${url.port}` : sinEsquema ? `:${PUERTO_DE_GRANJA}` : "";
  return { url: `${url.protocol}//${url.hostname}${puerto}` };
}

/**
 * ¿Tiene forma de token de acceso de la granja? Los crea su web (☰ → «Tokens de acceso») con el
 * prefijo `xfarm_`. Solo la FORMA: si vale lo dice la granja al probar.
 */
export function esFormaDeTokenDeGranja(token: string): boolean {
  return /^xfarm_[A-Za-z0-9_-]{8,}$/.test(token);
}

/** De dónde sacan los aparatos las sesiones de un proyecto. Ausente en el `config.json` = `local`. */
export type OrigenDeDispositivos = "local" | "granja";

export function esOrigenDeDispositivos(valor: unknown): valor is OrigenDeDispositivos {
  return valor === "local" || valor === "granja";
}

/**
 * El aparato de la sesión en un proyecto que usa la granja. No es UNA copia: la copia se pide al
 * usarla y cambia de un turno a otro, así que lo elegido es «la granja», y quien la conoce es el
 * harness (fase 2).
 */
export const ID_DE_GRANJA = "granja";
export const NOMBRE_DE_GRANJA = "Granja";

/** Lo que se cuenta de la granja tras probarla: lo que hace falta para decir si sirve. */
export interface ResumenDeGranja {
  /** Teléfonos en `ready`. */
  telefonos: number;
  /** Copias a tu alcance: las tuyas y las libres (la granja ya filtra por rol). */
  copias: { tuyas: number; libres: number };
  /** Las versiones del framework instaladas, sin repetir. Vacía = ningún teléfono la dice. */
  frameworks: string[];
}

/**
 * El resumen de `GET /api/state`, leído a la defensiva: lo que no tiene la forma esperada no
 * cuenta, y un estado sin `devices` no es una granja (`undefined`).
 *
 * Una copia es LIBRE si no tiene dueño y está `running`: una parada o en error no se puede pedir.
 * TUYA si `mine`. Lo de otros no llega a un usuario normal, y a un admin no le cuenta como suyo.
 */
export function resumenDeGranja(estado: unknown): ResumenDeGranja | undefined {
  if (typeof estado !== "object" || estado === null) return undefined;
  const dispositivos = (estado as { devices?: unknown }).devices;
  if (!Array.isArray(dispositivos)) return undefined;
  let telefonos = 0;
  let tuyas = 0;
  let libres = 0;
  const frameworks = new Set<string>();
  for (const d of dispositivos) {
    if (typeof d !== "object" || d === null) continue;
    const telefono = d as { state?: unknown; slots?: unknown; framework?: unknown };
    if (telefono.state !== "ready") continue;
    telefonos += 1;
    const version = (telefono.framework as { version?: unknown } | null | undefined)?.version;
    if (typeof version === "string" && version !== "") frameworks.add(version);
    if (!Array.isArray(telefono.slots)) continue;
    for (const s of telefono.slots) {
      if (typeof s !== "object" || s === null) continue;
      const copia = s as { mine?: unknown; owner?: unknown; state?: unknown };
      if (copia.mine === true) tuyas += 1;
      else if ((copia.owner === null || copia.owner === undefined) && copia.state === "running") libres += 1;
    }
  }
  return { telefonos, copias: { tuyas, libres }, frameworks: [...frameworks].sort() };
}

/**
 * Cómo acabó «Probar conexión». Cada estado es una situación que se arregla en un sitio distinto,
 * y por eso no se pliegan en «falló».
 */
export type PruebaDeGranja =
  | { estado: "conectada"; usuario: string; rol: "admin" | "normal"; resumen: ResumenDeGranja; huella?: string }
  /** Sin dirección o sin token: no se ha intentado nada. */
  | { estado: "sin-configurar"; falta: "direccion" | "token" }
  /** No se llegó: rechazada, sin ruta, tiempo agotado. `codigo` es el de Node, sin el mensaje (lleva la dirección). */
  | { estado: "no-responde"; codigo?: string }
  /** 401: caducado, revocado o su usuario borrado. */
  | { estado: "token-rechazado" }
  /** 403 con `mustChange`: el usuario no ha puesto contraseña y la granja no deja hacer nada más. */
  | { estado: "debe-cambiar-contrasena" }
  /** El certificado no es el aceptado: NO se ha mandado el token. */
  | { estado: "huella-distinta"; aceptada: string; ahora: string }
  /** Contestó algo que no es la granja, o un código que no se espera. */
  | { estado: "respuesta-inesperada"; http?: number };

/** El usuario y el rol de `GET /api/me`, o `undefined` si no tiene esa forma. */
export function usuarioDeGranja(cuerpo: unknown): { usuario: string; rol: "admin" | "normal" } | undefined {
  if (typeof cuerpo !== "object" || cuerpo === null) return undefined;
  const { user, role } = cuerpo as { user?: unknown; role?: unknown };
  if (typeof user !== "string" || user === "") return undefined;
  return { usuario: user, rol: role === "admin" ? "admin" : "normal" };
}

/**
 * La frase de una prueba que NO conectó, para quien la pinta. La compone el servidor: el cliente
 * pinta el texto y no repite la regla.
 */
export function motivoDePruebaDeGranja(prueba: Exclude<PruebaDeGranja, { estado: "conectada" }>): string {
  switch (prueba.estado) {
    case "sin-configurar":
      return prueba.falta === "direccion" ? "Falta la dirección de la granja." : "Falta el token de acceso.";
    case "no-responde":
      return (
        `La granja no responde${prueba.codigo === undefined ? "" : ` (${prueba.codigo})`}. ` +
        "Escucha solo en su propio PC salvo que su farm.config.json diga \"host\": \"0.0.0.0\" y \"https\": true, " +
        "y el firewall de Windows deje pasar el 8090."
      );
    case "token-rechazado":
      return "La granja no acepta el token (401): ha caducado, se ha revocado o su usuario ya no existe. Crea otro en la web de la granja y reemplázalo.";
    case "debe-cambiar-contrasena":
      return "El usuario del token aún no tiene contraseña: entra una vez en la web de la granja y ponla.";
    case "huella-distinta":
      return (
        "El certificado de la granja ha cambiado y no se ha mandado el token. Acepta el nuevo solo si sabes " +
        "que la granja se ha reinstalado o ha cambiado de certificado."
      );
    case "respuesta-inesperada":
      return `Eso no parece la granja${prueba.http === undefined ? "" : ` (contestó ${prueba.http})`}: revisa la dirección.`;
  }
}

/** La skill del aparato de cada origen: la de los aparatos de este equipo y la de la granja. */
export const SKILL_DE_APARATO_LOCAL = "xone-hotswap";
export const SKILL_DE_APARATO_EN_GRANJA = "xone-granja";

/**
 * Las skills de un agente, según el ORIGEN de los aparatos de su proyecto (decisión suya): en un proyecto con la granja,
 * `xone-hotswap` se SUSTITUYE por `xone-granja`, y al revés en uno de este equipo. Así el agente ve UNA forma de probar,
 * la que vale para ese proyecto, y los `.md` de los agentes no cambian. El orden se conserva y no se repite ninguna.
 */
export function skillsSegunOrigen(skills: readonly string[], origen: OrigenDeDispositivos): string[] {
  const [quitar, poner] = origen === "granja" ? [SKILL_DE_APARATO_LOCAL, SKILL_DE_APARATO_EN_GRANJA] : [SKILL_DE_APARATO_EN_GRANJA, SKILL_DE_APARATO_LOCAL];
  const salida: string[] = [];
  for (const s of skills) {
    const nombre = s === quitar ? poner : s;
    if (!salida.includes(nombre)) salida.push(nombre);
  }
  return salida;
}
