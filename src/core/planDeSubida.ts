/**
 * De un diff de git a una lista de operaciones de subida.
 *
 * Es PURA a propósito: aquí vive la regla que evita una pérdida de datos, y una regla así
 * no puede depender de que el disco o la red se porten bien para poder probarse.
 */
import type { OperacionDeSubida } from "./cloudstudio.js";

/** Medido: `studio_upload_file` en modo base64 admite hasta 5 MB decodificados. */
export const TOPE_BASE64 = 5 * 1024 * 1024;

/**
 * Medido contra el servidor: `studio_get_file` (y por tanto `studio_edit_file`) solo
 * trata estas extensiones como texto. Todo lo demás es binario y va por `upload_file`.
 */
export const EXTENSIONES_DE_TEXTO = new Set([
  ".config", ".css", ".htm", ".html", ".ini", ".js", ".json", ".md",
  ".properties", ".resx", ".sql", ".svg", ".txt", ".vbs", ".xml", ".xne",
]);

export interface CambioLocal {
  clase: "nuevo" | "modificado" | "borrado";
  ruta: string;
}

export interface EntradaDelPlan {
  cambios: CambioLocal[];
  /** Lo que la descarga trajo DE VERDAD. El candado se apoya en esto. */
  descargados: ReadonlySet<string>;
  /** Tamaño local de cada ruta; sin él, un binario no se puede subir. */
  tamanos: ReadonlyMap<string, number>;
  /** Los `.xne` presentes, para reconocer las vistas aplanadas. */
  fuentesXne?: ReadonlySet<string>;
}

const extensionDe = (ruta: string): string => {
  const punto = ruta.lastIndexOf(".");
  return punto === -1 ? "" : ruta.slice(punto).toLowerCase();
};

/**
 * `X.xml` es vista aplanada si existe `X.xne`. `app.xml` no tiene hermano: es fuente.
 *
 * La extensión se mira con `extensionDe` (normalizada a minúsculas) para que haya UNA sola
 * forma de decidir "es un .xml" en todo el fichero — si no, un `Foo.XML` se colaba como texto
 * en vez de excluirse, y XOne no avisa: sube un XML viejo junto al `.xne` nuevo, en silencio.
 * El hermano se compone sobre la RUTA ORIGINAL (no la minusculizada): el nombre en disco importa.
 */
const esVistaAplanada = (ruta: string, fuentes: ReadonlySet<string>): boolean =>
  extensionDe(ruta) === ".xml" && fuentes.has(`${ruta.slice(0, -4)}.xne`);

export function planDeSubida(entrada: EntradaDelPlan): OperacionDeSubida[] {
  const fuentes = entrada.fuentesXne ?? new Set<string>();
  const plan: OperacionDeSubida[] = [];

  for (const cambio of entrada.cambios) {
    // 1. La carpeta del harness no sube NUNCA. Va primero porque ninguna otra regla
    //    debe poder colarla: ahí viven memoria, sesiones y planes.
    if (cambio.ruta === ".xonecode" || cambio.ruta.startsWith(".xonecode/")) continue;

    // 2. La fuente es el `.xne`; el `.xml` lo regenera Studio.
    if (esVistaAplanada(cambio.ruta, fuentes)) continue;

    if (cambio.clase === "borrado") {
      // 3. EL CANDADO. Con una copia parcial, git ve como borrado todo lo que no se pudo
      //    bajar (binarios, sobre todo). Emitir esos borrados vaciaría el proyecto en
      //    Studio. Solo se borra lo que llegamos a tener.
      if (entrada.descargados.has(cambio.ruta)) plan.push({ tipo: "borrado", ruta: cambio.ruta });
      continue;
    }

    if (EXTENSIONES_DE_TEXTO.has(extensionDe(cambio.ruta))) {
      plan.push({ tipo: "texto", ruta: cambio.ruta });
      continue;
    }

    const bytes = entrada.tamanos.get(cambio.ruta);
    // 4. Sin tamaño no se decide el modo de subida. Se omite y quien ejecuta lo declara:
    //    inventar un modo es cómo se sube un fichero a medias.
    if (bytes === undefined) continue;
    plan.push({
      tipo: "binario",
      ruta: cambio.ruta,
      bytes,
      modo: bytes > TOPE_BASE64 ? "chunked" : "base64",
    });
  }

  return plan;
}
