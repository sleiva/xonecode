/**
 * Convertir un documento del proyecto a PDF, imprimiéndolo con un NAVEGADOR.
 *
 * El porqué de que esto lo haga el harness y no el agente está en `core/exportacion.ts`.
 * Aquí está lo que toca disco, y tres decisiones que no son de forma:
 *
 * - **El navegador se busca en una lista CERRADA de rutas conocidas**, igual que las
 *   herramientas de `core/dispositivos.ts`: lo que no está en la lista no se lanza. Y su RUTA
 *   se queda en el host — por el cable viaja que hay navegador o que no, nunca dónde.
 * - **Se imprime SIN JavaScript** (`--blink-settings=scriptEnabled=false`). Un `.md` o un
 *   `.html` del proyecto puede traer un `<script>` dentro, y un PDF no necesita ejecutar
 *   nada: es la misma razón por la que un artefacto se sirve en un iframe con origen opaco.
 * - **El HTML intermedio se escribe FUERA del proyecto.** Dentro entraría en git, en el
 *   commit de cada turno y en la siguiente subida a CloudStudio — un fichero de andamiaje en
 *   la app del cliente.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  conPoliticaSinScripts,
  documentoImprimible,
  esMarkdown,
  motivoDeExportacionInaceptable,
  rutaDePdf,
} from "../core/exportacion.js";
import { motivoDeRutaInaceptable } from "./grafo/arbolDeProyecto.js";

/**
 * Dónde puede estar un navegador que sepa imprimir. Lista CERRADA y en este orden.
 *
 * Son todos Chromium por dentro, que es el que trae `--print-to-pdf`: Safari y Firefox no
 * tienen equivalente en línea de comandos, así que no están y no es un olvido.
 */
export const NAVEGADORES_CONOCIDOS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
] as const;

/** El primero que exista, o AUSENTE. Ausente = aquí no se puede imprimir, y se DICE con el
 *  remedio: no hay forma de adivinar que lo que falta es un navegador. */
export function navegadorParaImprimir(existe: (ruta: string) => boolean = existsSync): string | undefined {
  return NAVEGADORES_CONOCIDOS.find((ruta) => existe(ruta));
}

/** Qué decir cuando no hay ninguno. Vive aquí y no en quien llama para que las tres pieles
 *  digan lo mismo. */
export const SIN_NAVEGADOR =
  "no encuentro un navegador con el que imprimir. El PDF se genera con Chrome, Chromium, Edge o Brave " +
  "en modo headless; instala uno y vuelve a intentarlo.";

export type ResultadoDeExportacion = { ruta: string } | { error: string };

/**
 * Exporta `ruta` (relativa al proyecto) a un PDF hermano. Nunca LANZA.
 *
 * Las barreras son las MISMAS que usa la pestaña Ficheros y en el mismo orden: la criba de
 * balde sobre el texto (`motivoDeRutaInaceptable`) y luego el camino REAL, porque un enlace
 * simbólico dentro de la raíz puede apuntar fuera. No hay una segunda copia de esas reglas
 * aquí: un segundo sitio donde decidir sobre una ruta es un segundo sitio donde el
 * fail-closed puede dejar de estarlo.
 */
export async function exportarAPdf(opciones: {
  raiz: string;
  ruta: string;
  /** El binario, ya elegido. Entra por parámetro para poder probar el cableado sin un
   *  navegador delante. */
  navegador?: string;
  /**
   * Cómo se BUSCA cuando no se da uno. Por omisión, el primero conocido que exista.
   *
   * Entra por parámetro y no se resuelve dentro porque si no el resultado dependería de si la
   * máquina que corre los tests tiene Chrome instalado — y un test que pasa aquí y falla en
   * CI (o al revés) no fija nada.
   */
  buscarNavegador?: () => string | undefined;
  /** Cómo se lanza. Por omisión `execFile`; los tests no abren un navegador de verdad. */
  imprimir?: (navegador: string, argumentos: readonly string[]) => Promise<void>;
  /** Markdown → HTML. Por omisión `marked`, que se carga PEREZOSAMENTE: exportar es raro y
   *  no tiene por qué pesar en el arranque de cada turno. */
  aHtml?: (markdown: string) => string | Promise<string>;
}): Promise<ResultadoDeExportacion> {
  const malaRuta = motivoDeRutaInaceptable(opciones.ruta);
  if (malaRuta !== undefined) return { error: malaRuta };
  const malaExtension = motivoDeExportacionInaceptable(opciones.ruta);
  if (malaExtension !== undefined) return { error: malaExtension };

  const navegador = opciones.navegador ?? (opciones.buscarNavegador ?? navegadorParaImprimir)();
  if (navegador === undefined) return { error: SIN_NAVEGADOR };

  const origen = resolve(opciones.raiz, opciones.ruta);
  if (!existsSync(origen)) return { error: `«${opciones.ruta}» no está en el proyecto` };

  let fuente: string;
  try {
    fuente = readFileSync(origen, "utf8");
  } catch {
    // El mensaje de Node lleva la ruta absoluta y esto viaja por el cable (`sinRutas`).
    return { error: `no se pudo leer «${opciones.ruta}»` };
  }

  let cuerpo: string;
  try {
    cuerpo = esMarkdown(opciones.ruta) ? await (opciones.aHtml ?? marcadoAHtml)(fuente) : fuente;
  } catch {
    return { error: `no se pudo convertir «${opciones.ruta}»` };
  }

  // Fuera del proyecto: dentro entraría en git, en el commit del turno y en la subida.
  const taller = mkdtempSync(join(tmpdir(), "xonecode-pdf-"));
  const html = join(taller, "documento.html");
  const destino = resolve(opciones.raiz, rutaDePdf(opciones.ruta));
  try {
    writeFileSync(
      html,
      esMarkdown(opciones.ruta)
        ? documentoImprimible(cuerpo, basename(opciones.ruta))
        : // Un `.html` no pasa por la plantilla, así que se le inyecta la política aparte. No
          // se envuelve dentro de la nuestra: meter un documento entero en nuestro `<body>`
          // lo rompería.
          conPoliticaSinScripts(cuerpo),
      "utf8"
    );
    await (opciones.imprimir ?? lanzarNavegador)(navegador, [
      "--headless",
      "--disable-gpu",
      // **Aquí NO va ningún flag para desactivar JavaScript**, y no es un olvido: medido
      // contra el Chrome instalado, ni `--disable-javascript` ni
      // `--blink-settings=scriptEnabled=false` lo desactivan — y el segundo además hace que
      // `--print-to-pdf` no escriba nada, en silencio y saliendo con 0. Lo que sí funciona es
      // la CSP del documento (`POLITICA_SIN_SCRIPTS`).
      "--no-pdf-header-footer",
      `--print-to-pdf=${destino}`,
      `file://${html}`,
    ]);
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    return { error: `el navegador no pudo imprimir: ${motivo}` };
  } finally {
    // El taller se borra pase lo que pase: son ficheros nuestros en un temporal.
    rmSync(taller, { recursive: true, force: true });
  }

  // «Terminó bien» y «hay PDF» son dos cosas: el navegador sale con 0 aunque no escriba nada.
  // Es la misma regla que ya usa la instalación de dispositivos — manda la MEDIDA, no el
  // código de salida.
  if (!existsSync(destino)) return { error: "el navegador terminó sin escribir ningún PDF" };
  return { ruta: rutaDePdf(opciones.ruta) };
}

/** `marked` cargado perezosamente, por lo dicho arriba. */
async function marcadoAHtml(markdown: string): Promise<string> {
  const { marked } = await import("marked");
  return marked.parse(markdown, { async: false }) as string;
}

function lanzarNavegador(navegador: string, argumentos: readonly string[]): Promise<void> {
  return new Promise((resolver, rechazar) => {
    execFile(navegador, [...argumentos], { timeout: TOPE_DE_IMPRESION_MS }, (error) =>
      // Su stderr trae avisos del sistema gráfico incluso cuando todo va bien, así que lo que
      // se mira es el error del proceso y después si el fichero está.
      error === null ? resolver() : rechazar(error)
    );
  });
}

/** Un documento largo con tablas tarda segundos, no minutos; un navegador que no vuelve en
 *  este plazo está colgado y no imprimiendo. */
export const TOPE_DE_IMPRESION_MS = 2 * 60 * 1000;
