/**
 * El `user_id` que se le manda a DeepSeek, y de dónde sale.
 *
 * **Por qué existe.** Los límites de DeepSeek son de CUENTA, no de clave: varias claves de la
 * misma suscripción son, para DeepSeek, el mismo cliente. Sin `user_id`, lo que su filtro de
 * contenido marque de UN desarrollador se apunta a la cuenta —y frena a todo el equipo—, y
 * la caché KV y el cupo de concurrencia no distinguen a nadie. Con él, cada persona es la
 * suya (`api-docs.deepseek.com/quick_start/rate_limit`).
 *
 * **La identidad es la del login de CloudStudio**, el `sub` de su token: es lo único que ya
 * sabemos de quién está delante sin preguntárselo. No se verifica la firma, y no es un
 * descuido: esto no AUTENTICA a nadie —el token ya lo validó el IDS al emitirlo y lo valida
 * CloudStudio en cada llamada—, solo le pone nombre a una petición.
 *
 * **Se NORMALIZA siempre, aunque el `sub` ya cumpla la forma**: DeepSeek exige
 * `[a-zA-Z0-9\-_]+` de hasta 512 y pide no meter ahí datos personales, así que lo que sale
 * es un hash y nunca el identificador del IDS. El `sub` se recorta y se pasa a minúsculas
 * antes (el de IdentityServer es un GUID, y el mismo GUID escrito de dos formas no pueden ser
 * dos personas), y el ENTORNO entra en el hash: dos servidores CloudStudio con su propio IDS
 * pueden repetir un `sub`, y eso no los hace la misma persona.
 *
 * Puro: ni disco ni red. El disco lo pone `agent/config/identidadEnDisco.ts`.
 */
import { createHash } from "node:crypto";

/** Prefijo del id: dice de quién es el valor a quien lo vea en un panel de DeepSeek. */
const PREFIJO = "xonecode-";

/** 32 hexadecimales son 128 bits: de sobra para no chocar, y lejos del tope de 512. */
const LARGO_DEL_HASH = 32;

/** La forma que DeepSeek acepta, copiada de su documentación. */
export const FORMA_DE_USER_ID = /^[a-zA-Z0-9\-_]{1,512}$/;

/**
 * El `sub` de un JWT, o `undefined` si no es un JWT legible o no trae un `sub` de texto.
 *
 * Nunca lanza: un token opaco (no JWT) es un caso NORMAL —un IDS puede emitir el access
 * token así—, y aquí «no lo sé» se contesta no mandando el campo.
 */
export function subDeJwt(token: string): string | undefined {
  const partes = token.split(".");
  if (partes.length !== 3 || partes[1] === "") return undefined;
  try {
    const carga: unknown = JSON.parse(Buffer.from(partes[1]!, "base64url").toString("utf8"));
    if (typeof carga !== "object" || carga === null) return undefined;
    const sub = (carga as Record<string, unknown>).sub;
    return typeof sub === "string" && sub.trim() !== "" ? sub : undefined;
  } catch {
    return undefined;
  }
}

/** El `user_id` para DeepSeek de ese `sub` en ese entorno. Determinista. */
export function userIdDeDeepSeek(entorno: string, sub: string): string {
  const huella = createHash("sha256")
    .update(`${entorno}\n${sub.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, LARGO_DEL_HASH);
  return `${PREFIJO}${huella}`;
}

/**
 * La identidad de un juego de tokens: el `id_token` primero —es el que existe para decir
 * quién es alguien— y el `access_token` después, que IdentityServer emite como JWT con el
 * mismo `sub`. Si ninguno lo trae, `undefined`: ausente, nunca un valor inventado.
 */
export function subDeTokens(tokens: { id_token?: string; access_token?: string } | undefined): string | undefined {
  if (tokens === undefined) return undefined;
  for (const token of [tokens.id_token, tokens.access_token]) {
    if (typeof token !== "string") continue;
    const sub = subDeJwt(token);
    if (sub !== undefined) return sub;
  }
  return undefined;
}
