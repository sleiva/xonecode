import { createHash, createHmac } from "node:crypto";

/**
 * Las reglas PURAS de hablar con byXOneDownloads (`https://byxone.xoneisp.com`), el almacén central
 * de XOne de donde sale el APK del framework de Android. La red la hace
 * `agent/dispositivos/byxoneEnRed.ts`; aquí solo se compone la firma, se valida la credencial y se
 * traduce lo que el servicio contesta.
 *
 * ## La credencial es de un COMPONENTE, no de una persona
 *
 * El servicio no tiene registro: el administrador da de alta un `ClientId` y un secreto por
 * componente, y cada operación queda auditada con ese id. NO va en `auth.json`, que es de los
 * proveedores de modelos y descarta lo demás con aviso. **Va DENTRO del paquete**, escrita por el
 * build, para que nadie tenga que crear nada (`resolverCredencialByxone` dice el orden y el precio):
 * lo empaquetado es público, así que es la de un cliente de SOLO `list,download`. Nunca cruza el
 * cable ni llega a la shell del agente.
 *
 * ## Cada petición va FIRMADA
 *
 * Cinco líneas —método, ruta CON su query, segundos Unix, nonce y sha256 hexadecimal del cuerpo—,
 * y la firma es `base64(HMAC-SHA256(secreto, cadena))`. Tres reglas del servicio que no son
 * opcionales: el cuerpo entra SIEMPRE (vacío también, con el hash de la cadena vacía), se firman
 * los MISMOS bytes que se mandan, y un nonce vale UNA vez —también en un reintento—.
 */

export const BASE_DE_BYXONE = "https://byxone.xoneisp.com";

/** El fichero de la credencial, relativo a `~/.xonecode/`. */
export const FICHERO_DE_CREDENCIAL_BYXONE = "byxone.json";
/** Las variables que mandan sobre el fichero. Se quitan de la shell del agente (`shellDeAgente.ts`). */
export const VARIABLE_CLIENTE_BYXONE = "XONECODE_BYXONE_CLIENT_ID";
export const VARIABLE_SECRETO_BYXONE = "XONECODE_BYXONE_SECRETO";
/** Las que lee `scripts/credencialByxone.mjs` al construir el paquete (mismos literales allí). */
export const VARIABLES_DE_BUILD_BYXONE = ["BYXONE_CLIENT_ID_DE_BUILD", "BYXONE_SECRETO_DE_BUILD"] as const;
/**
 * Las CUATRO que nunca llegan a la shell del agente (`shellDeAgente.ts`): las de uso y también las de
 * build, porque en la máquina que empaqueta pueden estar puestas.
 */
export const VARIABLES_SECRETAS_BYXONE: readonly string[] = [VARIABLE_CLIENTE_BYXONE, VARIABLE_SECRETO_BYXONE, ...VARIABLES_DE_BUILD_BYXONE];

/** El hash de un cuerpo vacío, que el servicio exige también en un GET. */
export const SHA256_DEL_VACIO = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export interface CredencialByxone {
  clientId: string;
  secreto: string;
}

export interface PeticionAFirmar {
  /** `GET`, `POST`… Se pasa a mayúsculas al firmar. */
  metodo: string;
  /** La ruta CON su query (`/api/files?categoria=framework`): olvidarla es el `FIRMA_INVALIDA` de siempre. */
  ruta: string;
  /** Los bytes EXACTOS que se van a mandar. Ausente es cuerpo vacío. */
  cuerpo?: Uint8Array;
  /** Segundos Unix. */
  ts: number;
  /** Aleatorio y distinto en CADA intento. */
  nonce: string;
}

/** Las cuatro cabeceras `X-*` de una petición firmada. */
export interface CabecerasFirmadas {
  "X-Client-Id": string;
  "X-Timestamp": string;
  "X-Nonce": string;
  "X-Signature": string;
}

/** La cadena canónica de cinco líneas, separada para poder probarla sin la firma. */
export function cadenaCanonica(p: PeticionAFirmar): string {
  const hash =
    p.cuerpo === undefined || p.cuerpo.length === 0 ? SHA256_DEL_VACIO : createHash("sha256").update(p.cuerpo).digest("hex");
  return [p.metodo.toUpperCase(), p.ruta, String(p.ts), p.nonce, hash].join("\n");
}

export function firmarPeticion(credencial: CredencialByxone, p: PeticionAFirmar): CabecerasFirmadas {
  const firma = createHmac("sha256", credencial.secreto).update(cadenaCanonica(p), "utf8").digest("base64");
  return {
    "X-Client-Id": credencial.clientId,
    "X-Timestamp": String(p.ts),
    "X-Nonce": p.nonce,
    "X-Signature": firma,
  };
}

/**
 * Por qué una credencial leída (del fichero o del entorno) no vale, o `undefined`. Nunca repite el
 * secreto: el motivo se puede pintar.
 */
export function motivoDeCredencialByxone(valor: unknown): string | undefined {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    return `${FICHERO_DE_CREDENCIAL_BYXONE} tiene que ser un objeto con "clientId" y "secreto"`;
  }
  const { clientId, secreto } = valor as Record<string, unknown>;
  if (typeof clientId !== "string" || clientId.trim() === "") return `falta "clientId" en ${FICHERO_DE_CREDENCIAL_BYXONE}`;
  if (typeof secreto !== "string" || secreto.trim() === "") return `falta "secreto" en ${FICHERO_DE_CREDENCIAL_BYXONE}`;
  if (clientId !== clientId.trim() || secreto !== secreto.trim()) {
    return `"clientId" y "secreto" no pueden llevar espacios al principio ni al final`;
  }
  return undefined;
}

/**
 * La credencial que se usa, en tres niveles y en este orden:
 *
 * 1. **El entorno**, solo si trae LAS DOS variables (una sola es un entorno a medias y se dice, no se
 *    mezcla con lo de abajo).
 * 2. **El fichero personal** `~/.xonecode/byxone.json`: desarrollo, o quien quiera usar otro cliente.
 * 3. **La EMPAQUETADA** (`dist/byxone.json`, la escribe `npm run build` desde el entorno de quien
 *    construye; ver `scripts/credencialByxone.mjs`). Es lo que hace que nadie tenga que crear nada.
 *
 * **La empaquetada es pública en la práctica**: cualquiera que instale XoneCode puede leerla. Por eso
 * es la de un cliente de SOLO `list,download` (`xcode-read`), nunca uno que suba, edite o borre.
 *
 * Un fichero personal que existe pero está mal NO cae a la empaquetada: se dice, porque quien lo
 * escribió quería usarlo.
 */
export function resolverCredencialByxone(
  entorno: Record<string, string | undefined>,
  fichero: unknown,
  empaquetada?: unknown
): { credencial: CredencialByxone; origen: OrigenDeCredencialByxone } | { motivo: string } {
  const cliente = entorno[VARIABLE_CLIENTE_BYXONE];
  const secreto = entorno[VARIABLE_SECRETO_BYXONE];
  if (cliente !== undefined || secreto !== undefined) {
    if (!cliente || !secreto) {
      return { motivo: `del entorno llega solo una de ${VARIABLE_CLIENTE_BYXONE} y ${VARIABLE_SECRETO_BYXONE}: hacen falta las dos` };
    }
    const motivo = motivoDeCredencialByxone({ clientId: cliente, secreto });
    return motivo === undefined ? { credencial: { clientId: cliente, secreto }, origen: "entorno" } : { motivo };
  }
  if (fichero !== undefined) {
    const motivo = motivoDeCredencialByxone(fichero);
    if (motivo !== undefined) return { motivo };
    const { clientId, secreto: s } = fichero as CredencialByxone;
    return { credencial: { clientId, secreto: s }, origen: "personal" };
  }
  if (empaquetada !== undefined && motivoDeCredencialByxone(empaquetada) === undefined) {
    const { clientId, secreto: s } = empaquetada as CredencialByxone;
    return { credencial: { clientId, secreto: s }, origen: "empaquetada" };
  }
  return {
    motivo: `esta instalación de XoneCode no lleva credencial de byXOne y no hay ~/.xonecode/${FICHERO_DE_CREDENCIAL_BYXONE}: sin ella no se ve el catálogo (lo ya descargado se sigue pudiendo instalar)`,
  };
}

export type OrigenDeCredencialByxone = "entorno" | "personal" | "empaquetada";

/**
 * UNA frase por respuesta de error del servicio, que dice dónde se arregla. `codigo` es el campo
 * `error` del cuerpo (puede traer detalle detrás: `FUERA_DE_VENTANA (412s)`); `status`, el HTTP.
 */
export function motivoDeRespuestaByxone(status: number, codigo: string | undefined): string {
  const c = (codigo ?? "").trim();
  const empieza = (k: string): boolean => c === k || c.startsWith(`${k} `) || c.startsWith(`${k}:`);
  if (empieza("FUERA_DE_VENTANA")) {
    return "byXOne rechaza la firma por la hora: el reloj de esta máquina se desvía más de 5 minutos del servidor. Ajusta la hora del sistema.";
  }
  if (empieza("CLIENTE_DESCONOCIDO_O_INACTIVO")) {
    return "byXOne no reconoce el clientId de ~/.xonecode/byxone.json, o lo han desactivado: pide al administrador que lo compruebe.";
  }
  if (empieza("FIRMA_INVALIDA")) {
    return "byXOne rechaza la firma: el secreto de ~/.xonecode/byxone.json no corresponde a ese clientId.";
  }
  if (empieza("NONCE_REPETIDO")) return "byXOne rechazó un nonce repetido; vuelve a intentarlo.";
  if (empieza("FALTAN_CABECERAS") || empieza("MARCA_TIEMPO_INVALIDA")) {
    return `byXOne rechaza la petición (${c}): es un fallo de XoneCode, no de la credencial.`;
  }
  if (empieza("SIN_PERMISO")) return `la credencial de byXOne no tiene permiso para esto (${c}).`;
  if (empieza("FICHERO_AUSENTE") || status === 410) {
    return "byXOne tiene la ficha de ese APK pero el fichero no está en su disco: avisa al administrador.";
  }
  if (status === 404) return "byXOne no tiene ese fichero, o esta credencial no puede verlo.";
  if (empieza("SECRETO_ILEGIBLE")) return "byXOne no puede descifrar el secreto de esta credencial: es un problema del servidor, avisa al administrador.";
  if (c !== "") return `byXOne contestó ${status} (${c}).`;
  return `byXOne contestó ${status}.`;
}

/**
 * Ordena dos títulos de versión del framework (`v5.0.5.8rel`, `v5.0.5.10dev`) de MÁS NUEVA a MÁS
 * VIEJA. No es un orden de texto: `v5.0.5.10` va antes que `v5.0.5.8`. Los números se comparan
 * segmento a segmento; con los números iguales, `rel` va antes que `dev` (una publicada antes que
 * una de desarrollo de la misma cifra), y lo que no se reconoce va al final, por texto.
 */
export function compararVersiones(a: string, b: string): number {
  const pa = partesDeVersion(a);
  const pb = partesDeVersion(b);
  if (pa === undefined || pb === undefined) {
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return b.localeCompare(a);
  }
  const largo = Math.max(pa.numeros.length, pb.numeros.length);
  for (let i = 0; i < largo; i++) {
    const d = (pb.numeros[i] ?? 0) - (pa.numeros[i] ?? 0);
    if (d !== 0) return d;
  }
  const peso = (s: string): number => (s === "rel" ? 0 : s === "" ? 1 : s === "dev" ? 2 : 3);
  const d = peso(pa.sufijo) - peso(pb.sufijo);
  return d !== 0 ? d : pa.sufijo.localeCompare(pb.sufijo);
}

/**
 * ¿`a` es una versión POSTERIOR a `b`? Solo por los NÚMEROS, y solo si los dos títulos se entienden.
 * Es la pregunta de «hay que actualizar», y por eso es más estricta que el orden: `5.0.5.9rel` no es
 * posterior a `5.0.5.9dev` (es la misma cifra, otra compilación), y un título que no se reconoce
 * nunca es posterior —`compararVersiones` lo ordenaría por texto y se inventaría una actualización—.
 */
export function esVersionPosterior(a: string, b: string): boolean {
  const pa = partesDeVersion(a);
  const pb = partesDeVersion(b);
  if (pa === undefined || pb === undefined) return false;
  const largo = Math.max(pa.numeros.length, pb.numeros.length);
  for (let i = 0; i < largo; i++) {
    const d = (pa.numeros[i] ?? 0) - (pb.numeros[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

function partesDeVersion(titulo: string): { numeros: number[]; sufijo: string } | undefined {
  const m = /^\s*v?(\d+(?:\.\d+)*)\s*([a-z]*)\s*$/i.exec(titulo);
  if (m === null) return undefined;
  return { numeros: m[1]!.split(".").map(Number), sufijo: m[2]!.toLowerCase() };
}

/** La plataforma y el tipo del catálogo que usa XoneCode: Android (`CatPlat 1`) y Frame (`CatType 2`). */
export const PLATAFORMA_ANDROID = 1;
export const TIPO_FRAME = 2;

/**
 * Las versiones de framework de Android tipo Frame que el catálogo ofrece, de más nueva a más vieja.
 *
 * **La forma de un item no está en la guía del servicio**: la deducimos del alta (`Plat`, `Type`,
 * `Title`, `Url`, `StoredFileId`) y de la convención de sus otras respuestas (camelCase). Se aceptan
 * las DOS grafías, y lo que no encaja se descarta en vez de adivinarse. Fuera:
 * - lo borrado (`isDeleted`);
 * - lo que tiene `Url` (apunta fuera del almacén, y XOneHub tampoco lo enseña);
 * - lo que no enlaza con un fichero del almacén (sin `StoredFileId` no hay qué bajar).
 *
 * Acepta la lista a secas o `{ items: [...] }` (la forma de `/api/catalog/sync`).
 */
export function frameworksDelCatalogo(respuesta: unknown): { titulo: string; ficheroId: number }[] {
  const items = Array.isArray(respuesta)
    ? respuesta
    : Array.isArray((respuesta as { items?: unknown } | null)?.items)
      ? (respuesta as { items: unknown[] }).items
      : [];
  const campo = (o: Record<string, unknown>, nombre: string): unknown => o[nombre] ?? o[nombre[0]!.toLowerCase() + nombre.slice(1)];
  const vistas = new Map<number, { titulo: string; ficheroId: number }>();
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (Number(campo(o, "Plat")) !== PLATAFORMA_ANDROID || Number(campo(o, "Type")) !== TIPO_FRAME) continue;
    const borrado = campo(o, "IsDeleted");
    if (borrado === true || borrado === 1) continue;
    const url = campo(o, "Url");
    if (typeof url === "string" && url.trim() !== "") continue;
    const titulo = campo(o, "Title");
    const fichero = Number(campo(o, "StoredFileId"));
    if (typeof titulo !== "string" || titulo.trim() === "" || !Number.isInteger(fichero) || fichero <= 0) continue;
    vistas.set(fichero, { titulo: titulo.trim(), ficheroId: fichero });
  }
  return [...vistas.values()].sort((a, b) => compararVersiones(a.titulo, b.titulo));
}
