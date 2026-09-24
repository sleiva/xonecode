/**
 * Las IMÁGENES que enlaza un documento (`.md` o `.html`), resueltas dentro del proyecto.
 *
 * Existe porque un enlace relativo —`![Login](img/login.png)`— solo funciona leído desde la carpeta
 * del documento, y los dos sitios donde se lee no están ahí: `/pdf` imprime un HTML escrito en un
 * temporal (`agent/exportarPdf.ts`), y la pestaña Ficheros lo pinta en la página de la consola. En
 * los dos la imagen salía rota. En el PDF se INCRUSTA —`data:`, que no depende de dónde se lea—; en
 * la web se reescribe el enlace a una ruta que la sirve, porque su visor solo pinta imágenes
 * `http(s)` absolutas.
 *
 * Puro: aquí solo se ENCUENTRAN los enlaces, se resuelven a una ruta del proyecto y se sustituyen.
 * Leer la imagen —con las barreras de la pestaña Ficheros— es de `agent/`.
 */

/**
 * La ruta HTTP de la consola web que sirve una imagen del proyecto (`?ruta=<relativa>`). La
 * reescribe `agent/grafo/arbolDeProyecto.ts#vistaDeMarkdown` y la atiende `web/servidor/arranque.ts`;
 * el cliente la lleva copiada (`apps/web/src/imagenesDelDocumento.ts`), como un tipo del cable.
 */
export const RUTA_IMAGEN_DEL_PROYECTO = "/imagen-del-proyecto";

/** Un esquema de URL (`http:`, `data:`, `file:`…): eso no es una ruta del proyecto. */
const CON_ESQUEMA = /^[a-z][a-z0-9+.-]*:/i;

/** `![alt](ruta "título")` y `![alt](<ruta con espacios>)`. */
const EN_MARKDOWN = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g;
/** `<img … src="ruta" …>`, con comillas dobles o simples. */
const EN_HTML = /<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi;

/** Los enlaces a imagen de un documento, tal cual están escritos y sin repetir. */
export function enlacesDeImagen(texto: string): string[] {
  const vistos = new Set<string>();
  for (const m of texto.matchAll(EN_MARKDOWN)) vistos.add((m[1] ?? m[2] ?? "").trim());
  for (const m of texto.matchAll(EN_HTML)) vistos.add((m[2] ?? "").trim());
  vistos.delete("");
  return [...vistos];
}

/**
 * La ruta RELATIVA al proyecto de la imagen que enlaza `enlace` desde el documento `documento`
 * (también relativa al proyecto), o `undefined` si no es una imagen del proyecto: una URL, un enlace
 * que se sale de la raíz con `..`. Una ruta que empieza por `/` es la VIRTUAL, desde la raíz.
 */
export function imagenEnProyecto(documento: string, enlace: string): string | undefined {
  if (CON_ESQUEMA.test(enlace) || enlace.startsWith("//")) return undefined;
  let limpio = enlace.split(/[?#]/)[0] ?? "";
  try {
    limpio = decodeURIComponent(limpio);
  } catch {
    // Un `%` suelto no es una codificación: se deja como está.
  }
  if (limpio === "") return undefined;
  const base = limpio.startsWith("/") ? [] : documento.split("/").slice(0, -1);
  const partes = [...base];
  for (const trozo of limpio.split("/")) {
    if (trozo === "" || trozo === ".") continue;
    if (trozo === "..") {
      // Salirse de la raíz no es una imagen del proyecto: no se adivina a dónde apuntaba.
      if (partes.length === 0) return undefined;
      partes.pop();
      continue;
    }
    partes.push(trozo);
  }
  return partes.length === 0 ? undefined : partes.join("/");
}

/**
 * El documento con cada enlace de `incrustadas` (enlace tal cual → `data:…`) sustituido, en las dos
 * sintaxis. Lo que no está en el mapa se deja EXACTAMENTE igual: una imagen que no se pudo leer
 * sigue rota, pero no se inventa ni se borra.
 */
export function conImagenesIncrustadas(texto: string, incrustadas: ReadonlyMap<string, string>): string {
  if (incrustadas.size === 0) return texto;
  return texto
    .replace(EN_MARKDOWN, (todo: string, entre?: string, suelto?: string) => {
      const enlace = (entre ?? suelto ?? "").trim();
      const dato = incrustadas.get(enlace);
      return dato === undefined ? todo : todo.replace(entre !== undefined ? `<${entre}>` : (suelto ?? ""), dato);
    })
    .replace(EN_HTML, (todo: string, comilla: string, enlace: string) => {
      const dato = incrustadas.get(enlace.trim());
      return dato === undefined ? todo : todo.replace(`${comilla}${enlace}${comilla}`, `${comilla}${dato}${comilla}`);
    });
}
