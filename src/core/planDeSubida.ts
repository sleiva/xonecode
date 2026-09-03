/**
 * De un diff de git a una lista de operaciones de subida.
 *
 * Es PURA a propósito: aquí vive la regla que evita una pérdida de datos, y una regla así
 * no puede depender de que el disco o la red se porten bien para poder probarse.
 */
import type { OperacionDeSubida, OperacionOmitida } from "./cloudstudio.js";

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

/**
 * La extensión de una ruta POSIX, en minúsculas, o `""` si no tiene.
 *
 * Dos trampas que la versión ingenua (`ruta.lastIndexOf(".")` sobre la ruta entera) no
 * veía, y que se exporta para que no vuelva a haber dos copias divergentes de esta regla:
 *
 * - **Un punto en la posición 0 no es una extensión**: es un fichero OCULTO sin ella.
 *   `".env".lastIndexOf(".")` es 0, así que devolvía `".env"` como si `.env` fuera un tipo
 *   de fichero. No está en la lista de texto, con lo cual `.env` se clasificaba como
 *   BINARIO y podía subirse al proyecto del cliente entero.
 * - **El punto puede estar en un DIRECTORIO**: en `iconos.v2/logo` el último punto está en
 *   el directorio, y devolvía `".v2/logo"`. Se mira solo el último segmento.
 */
export const extensionDe = (ruta: string): string => {
  const nombre = ruta.slice(ruta.lastIndexOf("/") + 1);
  const punto = nombre.lastIndexOf(".");
  return punto <= 0 ? "" : nombre.slice(punto).toLowerCase();
};

/**
 * Lo que no sale de esta máquina NUNCA, mire quien lo mire.
 *
 * Es la misma denegación que `agent/perfiles.ts` le impone al AGENTE
 * (`permisosDe`/`puedeLeerRuta` deniegan `/.env` y `/.git`, invariante explícito de
 * `CLAUDE.md`), replicada en la ruta de SUBIDA, que no pasa por aquellos permisos y por
 * tanto no la heredaba. Que el agente no pueda leer `.env` no sirve de nada si el `/sync`
 * lo empuja a CloudStudio por su cuenta.
 *
 * Se comprueba por SEGMENTO, no solo en la raíz: un `.env` dentro de un subdirectorio
 * guarda exactamente los mismos secretos que uno arriba.
 */
const esRutaProhibida = (ruta: string): boolean =>
  ruta.split("/").some(
    (segmento) =>
      segmento === ".xonecode" ||
      segmento === ".git" ||
      segmento === ".env" ||
      segmento.startsWith(".env.")
  );

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

/**
 * El plan: lo que SE PUEDE hacer y lo que NO, por separado.
 *
 * Separarlos es el camino de escape de la subida. Antes, una operación imposible (un
 * binario de más de 5 MB, el borrado de un binario) se quedaba en el plan, fallaba contra
 * el servidor, y como la ref solo avanza con `fallos` vacío, el siguiente `/sync`
 * recalculaba el MISMO plan y volvía a fallar: `/sync subir` quedaba inútil para siempre
 * a partir de la primera imagen borrada. Ahora sale del plan, se declara, y la ref avanza
 * con el resto.
 */
export interface Plan {
  operaciones: OperacionDeSubida[];
  omitidas: OperacionOmitida[];
}

export function planDeSubida(entrada: EntradaDelPlan): Plan {
  const fuentes = entrada.fuentesXne ?? new Set<string>();
  const plan: OperacionDeSubida[] = [];
  const omitidas: OperacionOmitida[] = [];

  for (const cambio of entrada.cambios) {
    // 1. Lo prohibido no sube NUNCA. Va primero porque ninguna otra regla debe poder
    //    colarlo: en `.xonecode/` viven memoria, sesiones y planes, y en `.env` las
    //    credenciales del usuario. `.xonecode/` se calla (es nuestro y no sincroniza
    //    jamás: declararlo sería ruido en cada `/sync`); `.env` y `.git` se DECLARAN,
    //    porque son ficheros del usuario que él sí podría esperar ver subir.
    if (esRutaProhibida(cambio.ruta)) {
      if (!cambio.ruta.split("/").includes(".xonecode")) {
        omitidas.push({
          ruta: cambio.ruta,
          motivo: "no se sincroniza nunca: credenciales o metadatos locales (misma denegación que tiene el agente)",
        });
      }
      continue;
    }

    // 2. La fuente es el `.xne`; el `.xml` lo regenera Studio.
    if (esVistaAplanada(cambio.ruta, fuentes)) continue;

    if (cambio.clase === "borrado") {
      // 3. EL CANDADO. Con una copia parcial, git ve como borrado todo lo que no se pudo
      //    bajar (binarios, sobre todo). Emitir esos borrados vaciaría el proyecto en
      //    Studio. Solo se borra lo que llegamos a tener.
      if (!entrada.descargados.has(cambio.ruta)) {
        omitidas.push({
          ruta: cambio.ruta,
          motivo: "no consta descargado (copia parcial): no se borra en Studio, bórralo allí a mano",
        });
        continue;
      }
      // 3b. El borrado se ejecuta con `borrarTexto` (`studio_edit_file` en modo
      //     `delete`), que es una tool de TEXTO. No hay ninguna forma de borrar un
      //     binario por MCP hoy, así que un icono borrado en local es una operación
      //     IMPOSIBLE, no una pendiente: dejarla en el plan atascaba la subida entera.
      if (!EXTENSIONES_DE_TEXTO.has(extensionDe(cambio.ruta))) {
        omitidas.push({
          ruta: cambio.ruta,
          motivo: "el servidor no borra binarios (solo hay borrado de texto): bórralo en Studio a mano",
        });
        continue;
      }
      plan.push({ tipo: "borrado", ruta: cambio.ruta });
      continue;
    }

    if (EXTENSIONES_DE_TEXTO.has(extensionDe(cambio.ruta))) {
      plan.push({ tipo: "texto", ruta: cambio.ruta });
      continue;
    }

    const bytes = entrada.tamanos.get(cambio.ruta);
    // 4. Sin tamaño no se decide el modo de subida, e inventarlo es cómo se sube un
    //    fichero a medias. Se omite Y SE DECLARA: antes se omitía en silencio y quien
    //    ejecutaba no tenía con qué declararlo.
    if (bytes === undefined) {
      omitidas.push({ ruta: cambio.ruta, motivo: "no se pudo leer su tamaño en disco" });
      continue;
    }
    // 5. El modo `chunked` del servidor NO está implementado en xonecode: el puerto ni
    //    lleva el modo y el adaptador manda siempre base64 (ver `core/cloudstudio.ts`).
    //    Así que por encima del tope es imposible, no pendiente.
    if (bytes > TOPE_BASE64) {
      omitidas.push({
        ruta: cambio.ruta,
        motivo: `pesa ${bytes} bytes y la subida en base64 admite hasta ${TOPE_BASE64}; el modo troceado no está implementado: súbelo desde Studio`,
      });
      continue;
    }
    plan.push({ tipo: "binario", ruta: cambio.ruta, bytes, modo: "base64" });
  }

  return { operaciones: plan, omitidas };
}
