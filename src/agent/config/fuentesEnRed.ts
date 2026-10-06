import {
  buscarEnCatalogo, esTrueType, familiasDelCatalogo, type FamiliaDeFuente, TOPE_DE_CATALOGO_BYTES, TOPE_DE_CSS_BYTES,
  TOPE_DE_FUENTE_BYTES, TOPE_DE_FUENTES_MS, URL_DEL_CATALOGO, urlDeCss, urlDeTtfEnCss,
} from "../../core/fuentes.js";
import type { FuentesPort } from "../../core/ports.js";

/**
 * Google Fonts, de verdad, sin clave (lo medido está en `core/fuentes.ts`).
 *
 * **El catálogo se pide UNA vez por puerto** y se guarda: son 2,7 MB de un catálogo AJENO que no
 * cambia en una sesión. No choca con «no cachear» de `xone_navegacion`, que habla del modelo del
 * PROYECTO. Un fallo no se guarda: la siguiente llamada lo vuelve a intentar.
 *
 * Un fallo lleva el CÓDIGO HTTP o la palabra «red», nunca la URL ni el cuerpo remoto (mismo trato
 * que `iconosEnRed`). `fetch` entra por parámetro para probarlo sin conexión.
 */
export function fuentesEnRed(
  llamar: typeof fetch = fetch,
  topeMs: number = TOPE_DE_FUENTES_MS
): FuentesPort {
  const pedir = async (url: string, tope: number): Promise<Uint8Array> => {
    let respuesta: Response;
    try {
      respuesta = await llamar(url, { signal: AbortSignal.timeout(topeMs) });
    } catch {
      throw new Error("no hay red o Google Fonts no responde");
    }
    if (!respuesta.ok) throw new Error(`Google Fonts contestó ${respuesta.status}`);
    const declarado = Number(respuesta.headers.get("content-length") ?? "0");
    if (declarado > tope) throw new Error("la respuesta supera el tope de tamaño");
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await respuesta.arrayBuffer());
    } catch {
      throw new Error("no hay red o Google Fonts no responde");
    }
    if (bytes.length > tope) throw new Error("la respuesta supera el tope de tamaño");
    return bytes;
  };

  let catalogo: Promise<Array<FamiliaDeFuente & { popularidad: number }>> | undefined;
  const elCatalogo = (): Promise<Array<FamiliaDeFuente & { popularidad: number }>> => {
    catalogo ??= (async () => {
      const bytes = await pedir(URL_DEL_CATALOGO, TOPE_DE_CATALOGO_BYTES);
      let cuerpo: unknown;
      try {
        // Hoy llega JSON a secas; antes llevaba delante el `)]}'` contra el XSSI, y se tolera.
        const texto = new TextDecoder().decode(bytes);
        cuerpo = JSON.parse(texto.slice(texto.indexOf("{")));
      } catch {
        throw new Error("respuesta incompatible de Google Fonts");
      }
      const familias = familiasDelCatalogo(cuerpo);
      if (familias.length === 0) throw new Error("respuesta incompatible de Google Fonts");
      return familias;
    })();
    catalogo.catch(() => {
      catalogo = undefined;
    });
    return catalogo;
  };

  return {
    async buscar(consulta, limite) {
      return buscarEnCatalogo(await elCatalogo(), consulta, limite);
    },
    async familia(nombre) {
      const f = (await elCatalogo()).find((x) => x.familia === nombre);
      return f === undefined ? undefined : { familia: f.familia, categoria: f.categoria, estilos: f.estilos };
    },
    async ttf(familia, peso, cursiva) {
      const css = new TextDecoder().decode(await pedir(urlDeCss(familia, peso, cursiva), TOPE_DE_CSS_BYTES));
      const url = urlDeTtfEnCss(css);
      if (url === undefined) throw new Error("Google Fonts no devolvió un .ttf para ese estilo");
      const bytes = await pedir(url, TOPE_DE_FUENTE_BYTES);
      if (!esTrueType(bytes)) throw new Error("lo que llegó no es un fichero TrueType");
      return bytes;
    },
  };
}
