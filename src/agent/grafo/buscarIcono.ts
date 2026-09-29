import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  colorParaIconify, LIMITES_DE_BUSQUEDA, LIMITES_DE_TAMANO, motivoDeColorInaceptable, motivoDeIdInaceptable,
  motivoDePrefijoInaceptable, NOMBRE_BUSCAR_ICONO, nombreDeFicheroDeIcono, recibeBuscarIcono, rutaDeIcono,
} from "../../core/iconos.js";
import type { IconosPort } from "../../core/ports.js";

export { NOMBRE_BUSCAR_ICONO, recibeBuscarIcono };

/**
 * Buscar un icono y traer su SVG, para quien no tiene los assets (IXCODE-18).
 *
 * ## Es de LECTURA, y no escribe nada
 *
 * Un SVG es texto: lo escribe `write_file`, con su diff y su aprobación de siempre. Una tool de
 * red que además escribiera sería un segundo camino al proyecto que habría que cerrar a mano
 * (`incorporar_adjunto` existe porque un PNG NO sobrevive a `write(content: string)`; un SVG sí).
 * **Contrapartida declarada**: el modelo reteclea el `path` del SVG al escribirlo. Son unos
 * cientos de caracteres y el diff lo enseña, pero un carácter mal copiado sale en el fichero.
 *
 * ## Los rechazos se DEVUELVEN, nunca se lanzan
 *
 * Una excepción se lleva el turno y el agente no reintenta. Sin red, la tool lo DICE y no
 * devuelve ningún SVG: la alternativa, que el modelo dibuje uno a mano, es justo lo que esto
 * existe para evitar. De un fallo de red solo viaja su mensaje ya saneado (`iconosEnRed.ts`).
 *
 * El color y la altura son OBLIGATORIOS en `obtener` (motivo en `core/iconos.ts`).
 */

const ESQUEMA = z.object({
  operacion: z.enum(["buscar", "obtener"]).describe("buscar: lista ids por texto. obtener: devuelve el SVG de un id."),
  consulta: z.string().min(1).max(64).optional().describe("Solo en «buscar». En inglés rinde más (home, arrow, trash)."),
  prefijo: z.string().max(32).optional().describe("Solo en «buscar»: limita a una colección (lucide, mdi, tabler…)."),
  limite: z.coerce.number().int().min(1).max(LIMITES_DE_BUSQUEDA.maximo).optional()
    .describe(`Solo en «buscar». Por omisión ${LIMITES_DE_BUSQUEDA.porOmision}.`),
  id: z.string().max(80).optional().describe("Solo en «obtener»: prefijo:nombre, tal como sale de «buscar»."),
  color: z.string().max(32).optional().describe("Obligatorio en «obtener»: #RRGGBB, o #FFRRGGBB de XOne si es opaco (#1a73e8)."),
  tamano: z.coerce.number().int().min(LIMITES_DE_TAMANO.minimo).max(LIMITES_DE_TAMANO.maximo).optional()
    .describe(`Solo en «obtener»: altura en píxeles. Por omisión ${LIMITES_DE_TAMANO.porOmision}.`),
});
type Entrada = z.infer<typeof ESQUEMA>;

export function crearBuscarIcono(iconos: IconosPort) {
  return tool(
    async (entrada: Entrada): Promise<string> => {
      try {
        if (entrada.operacion === "buscar") return await buscar(iconos, entrada);
        return await obtener(iconos, entrada);
      } catch (error) {
        const causa = error instanceof Error ? error.message : "fallo desconocido";
        return `No se pudo completar: ${causa}. No dibujes el icono a mano: dilo, o usa un asset del proyecto.`;
      }
    },
    {
      name: NOMBRE_BUSCAR_ICONO,
      description:
        "Busca iconos en Iconify (más de 200 colecciones) y devuelve el SVG de uno, para botones, " +
        "menús y pestañas cuando el proyecto no trae los assets. Dos pasos: «buscar» con un texto y " +
        "«obtener» con un id de la lista, un color hexadecimal y una altura. Solo LEE: el SVG lo " +
        "escribes tú con write_file en la ruta que te indica. XOne pinta SVG nativo y busca el " +
        'fichero en icons/: se usa con img="ic_x.svg" (o type="IMG" path="ic_x.svg"), nombre a secas ' +
        'y nunca con type="WEB". Sin red te lo dice.',
      schema: ESQUEMA,
    }
  );
}

async function buscar(iconos: IconosPort, e: Entrada): Promise<string> {
  if (e.consulta === undefined) return "«buscar» necesita `consulta`.";
  if (e.prefijo !== undefined) {
    const motivo = motivoDePrefijoInaceptable(e.prefijo);
    if (motivo !== undefined) return motivo;
  }
  const limite = e.limite ?? LIMITES_DE_BUSQUEDA.porOmision;
  const ids = await iconos.buscar(e.consulta, { limite, ...(e.prefijo === undefined ? {} : { prefijo: e.prefijo }) });
  if (ids.length === 0) return `Ningún icono para «${e.consulta}». Prueba otro texto, en inglés, o sin prefijo.`;
  return [
    `${ids.length} iconos para «${e.consulta}» (elige UNA colección para toda la app, así se ven a juego):`,
    ...ids,
    "Siguiente paso: buscar_icono con operacion «obtener», el id, un color hexadecimal y la altura.",
  ].join("\n");
}

async function obtener(iconos: IconosPort, e: Entrada): Promise<string> {
  if (e.id === undefined) return "«obtener» necesita `id`.";
  if (e.color === undefined) {
    return "«obtener» necesita `color` en hexadecimal (#1a73e8): XOne no documenta currentColor y un icono sin tinte válido sale negro sin avisar.";
  }
  const problema = motivoDeIdInaceptable(e.id) ?? motivoDeColorInaceptable(e.color);
  if (problema !== undefined) return problema;
  const tamano = e.tamano ?? LIMITES_DE_TAMANO.porOmision;
  const color = colorParaIconify(e.color);
  const svg = await iconos.svg(e.id, { color, tamano });
  return [
    `SVG de ${e.id} (${e.color}, ${tamano}px). Escríbelo TAL CUAL con write_file en ${rutaDeIcono(e.id)} y refiérelo con el nombre a secas: img="${nombreDeFicheroDeIcono(e.id)}" (XOne lo busca en icons/).`,
    svg,
  ].join("\n");
}
