/**
 * `traer_pantalla_de_stitch`: baja una pantalla de Stitch a `/artefactos/diseno/` —imagen a tamaño
 * real, su `code.html` y el `DESIGN.md` del proyecto—, que es donde el harness ya busca la maqueta
 * para medir contra ella (`medidaAutomatica.ts#buscarMaqueta`).
 *
 * Existe porque Stitch devuelve ENLACES y el agente no puede bajar una URL: sin esto, el diseñador
 * podía pedir el rediseño pero nadie podía mirarlo ni construirlo. Las reglas —qué hosts, qué
 * tipos, qué topes, cómo se lee la respuesta— son puras, en `core/stitch.ts`; aquí la red y el disco.
 * El modelo NO da la URL: da la pantalla, y la URL sale de la respuesta de `get_screen`.
 *
 * Escribe en `/artefactos/`, que no es el proyecto: sin aprobación, y se ANUNCIA como cualquier
 * artefacto. Cada traída REEMPLAZA la anterior: la maqueta de la sesión es una.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Artefacto } from "../../../core/artefactos.js";
import type { ConectoresPort } from "../../../core/ports.js";
import { TOPE_DE_LLAMADA_MS } from "../../../core/conectores.js";
import {
  CARPETA_DE_DISENO, designMdDeProyecto, leerPantalla, motivoDeDescargaInaceptable, motivoDePantallaInaceptable, proyectoDePantalla,
  RUTA_DE_DISENO, TIPOS_DE_IMAGEN, TOPE_DE_HTML, TOPE_DE_IMAGEN, urlDeImagenCompleta,
} from "../../../core/stitch.js";

export const NOMBRE_TRAER_DE_STITCH = "traer_pantalla_de_stitch";
/** El id del conector en el catálogo: la tool solo se monta si la sesión lo tiene. */
export const CONECTOR_STITCH = "stitch";

/** Lo que devuelve una descarga: los bytes y el `content-type` que dijo el servidor. */
export type Descargar = (url: string, tope: number) => Promise<{ bytes: Buffer; tipo: string }>;

/** Tope de una descarga: una pantalla son cientos de KB. */
export const TOPE_DE_DESCARGA_MS = 60 * 1000;

/** La red de verdad: `fetch` con tope de tiempo y de tamaño (se corta al pasarse, no al acabar). */
export const descargarEnRed: Descargar = async (url, tope) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(TOPE_DE_DESCARGA_MS), redirect: "error" });
  if (!r.ok || r.body === null) throw new Error(`HTTP ${r.status}`);
  const trozos: Buffer[] = [];
  let total = 0;
  for await (const trozo of r.body as unknown as AsyncIterable<Uint8Array>) {
    total += trozo.byteLength;
    if (total > tope) throw new Error("pasa del tope de tamaño");
    trozos.push(Buffer.from(trozo));
  }
  return { bytes: Buffer.concat(trozos), tipo: (r.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase() };
};

const Entrada = z.object({
  pantalla: z
    .string()
    .describe("El `name` de la pantalla en Stitch, TAL CUAL: projects/<id>/screens/<id> (lo dan list_screens y get_screen, y el resultado de generarla)."),
});

export interface DependenciasDeTraerDeStitch {
  conectores: ConectoresPort;
  /** La carpeta de artefactos de la sesión, en disco. */
  carpeta: string;
  alEscribir?: (a: Artefacto) => void;
  descargar?: Descargar;
}

export function crearTraerDeStitch(deps: DependenciasDeTraerDeStitch) {
  const descargar = deps.descargar ?? descargarEnRed;
  return tool(
    async ({ pantalla }: z.infer<typeof Entrada>) => {
      const motivo = motivoDePantallaInaceptable(pantalla.trim());
      if (motivo !== undefined) return motivo;
      const nombre = pantalla.trim();
      let datos;
      try {
        datos = leerPantalla(await deps.conectores.llamar(CONECTOR_STITCH, "get_screen", { name: nombre }, { topeMs: TOPE_DE_LLAMADA_MS }));
      } catch (e) {
        return `Stitch no dio la pantalla: ${e instanceof Error ? e.message : String(e)}`;
      }
      if (typeof datos === "string") return datos;

      const motivoImagen = motivoDeDescargaInaceptable(datos.imagen);
      if (motivoImagen !== undefined) return motivoImagen;
      let imagen;
      try {
        imagen = await descargar(urlDeImagenCompleta(datos.imagen), TOPE_DE_IMAGEN);
      } catch (e) {
        return `No pude bajar la imagen de la pantalla (${e instanceof Error ? e.message : "error"}).`;
      }
      const extension = TIPOS_DE_IMAGEN[imagen.tipo];
      if (extension === undefined) return `Stitch dio la imagen como «${imagen.tipo || "sin tipo"}», que no es PNG, JPEG ni WebP: no se guarda.`;

      // El HTML y el DESIGN.md son la otra mitad del diseño, en texto; sin ellos la imagen vale igual.
      let html: string | undefined;
      const avisos: string[] = [];
      if (datos.html !== undefined) {
        const motivoHtml = motivoDeDescargaInaceptable(datos.html);
        if (motivoHtml !== undefined) avisos.push(motivoHtml);
        else {
          try {
            const r = await descargar(datos.html, TOPE_DE_HTML);
            if (r.tipo === "text/html") html = r.bytes.toString("utf8");
            else avisos.push(`el código llegó como «${r.tipo}» y no se guarda`);
          } catch (e) {
            avisos.push(`no pude bajar el código (${e instanceof Error ? e.message : "error"})`);
          }
        }
      }
      let designMd: string | undefined;
      try {
        designMd = designMdDeProyecto(await deps.conectores.llamar(CONECTOR_STITCH, "get_project", { name: proyectoDePantalla(nombre) }, { topeMs: TOPE_DE_LLAMADA_MS }));
      } catch {
        avisos.push("no pude leer el DESIGN.md del proyecto");
      }

      const carpeta = join(deps.carpeta, CARPETA_DE_DISENO);
      const escritos: Artefacto[] = [];
      try {
        mkdirSync(carpeta, { recursive: true });
        // La maqueta de la sesión es UNA: lo de la traída anterior se va, o una imagen vieja con
        // otra extensión seguiría pasando por la maqueta.
        for (const n of readdirSync(carpeta)) if (/^(screen\.(png|jpg|webp)|code\.html|DESIGN\.md)$/.test(n)) rmSync(join(carpeta, n));
        const escribir = (fichero: string, contenido: Buffer | string, mime: string): void => {
          writeFileSync(join(carpeta, fichero), contenido);
          escritos.push({ ruta: `${RUTA_DE_DISENO}${fichero}`, nombre: fichero, mime, bytes: Buffer.byteLength(contenido) });
        };
        escribir(`screen.${extension}`, imagen.bytes, imagen.tipo);
        if (html !== undefined) escribir("code.html", html, "text/html");
        if (designMd !== undefined) escribir("DESIGN.md", designMd, "text/markdown");
      } catch (e) {
        // De un error de Node solo el código: su mensaje lleva la ruta absoluta.
        return `No pude guardarla (${(e as { code?: string }).code ?? "error"}).`;
      }
      for (const a of escritos) deps.alEscribir?.(a);

      // Las medidas que DECLARA Stitch no son las de la imagen bajada (medido: dice 780×1768 y da
      // 390×746): se dicen los BYTES reales y, si hacen falta los píxeles, que se midan.
      return [
        `Traída «${datos.titulo}»:`,
        ...escritos.map((a) => `- ${a.ruta} (${a.bytes} bytes)`),
        ...(avisos.length === 0 ? [] : [`(${avisos.join("; ")})`]),
        `Es la MAQUETA de la sesión: pásala como \`referencia\` (${RUTA_DE_DISENO}screen.${extension}) a comparar_capturas y a xone_critica_visual; el harness ya la usa al medir cada prueba. Para verla, describe_image.`,
      ].join("\n");
    },
    {
      name: NOMBRE_TRAER_DE_STITCH,
      description:
        `Baja una pantalla de Stitch a ${RUTA_DE_DISENO}: la imagen a tamaño real, su code.html y el DESIGN.md del proyecto. ` +
        "Úsala después de generar o editar una pantalla, o cuando te digan cuál construir: Stitch solo da enlaces y así el diseño queda donde se mide. " +
        "Cada traída reemplaza la anterior.",
      schema: Entrada,
    }
  );
}
