import { tool } from "@langchain/core/tools";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  anchoDeMaquetaDeImagen,
  ANCHO_DE_MAQUETA_MAXIMO,
  ANCHO_DE_MAQUETA_MINIMO,
  informeDeConversion,
  motivoDeMedidasInaceptables,
  NOMBRE_CONVERTIR_A_P,
  resolucionDeAppXml,
  TOPE_DE_MEDIDAS,
} from "../../../core/convertirAP.js";
import { recibeBuscarIcono } from "../../../core/iconos.js";
import type { Agente } from "../../../core/agentes.js";
import { dimensionesDeImagen } from "../../dispositivos/decodificarImagen.js";
import { buscarMaqueta } from "./medidaAutomatica.js";

export { NOMBRE_CONVERTIR_A_P };

/**
 * `convertir_a_p`: las medidas de una maqueta (px CSS) a la `p` de XOne (`core/convertirAP.ts` tiene el porqué y la
 * cuenta). **Pura, de LECTURA y sin red**, solo en TrueForge, y a quien escribe el proyecto (la regla de dato de
 * `buscar_icono`: el desarrollador y el diseñador).
 *
 * Los dos datos de la cuenta NO entran por parámetro salvo el ancho de la maqueta cuando su imagen no lo deja claro:
 * el `resolution-width` se lee del `app.xml` de la RAÍZ, fijada al construir —como `xone_navegacion`, nunca una ruta
 * que elija el modelo—, y el ancho de la maqueta, de la misma maqueta que mide el harness (`buscarMaqueta`). Un
 * rechazo se DEVUELVE como texto, nunca se lanza.
 */
export const recibeConvertirAP = (agente: Agente): boolean => recibeBuscarIcono(agente);

const ESQUEMA = z.object({
  medidas: z
    .array(
      z.object({
        nombre: z.string().min(1).max(60).describe("Qué es: «icono de la fila», «alto de la cabecera», «margen izquierdo»"),
        px: z.coerce.number().describe("La medida en la maqueta, en px CSS (24 de un w-6 de Tailwind, 48 de un h-12, el número de un width: 72px)"),
      })
    )
    .min(1)
    .max(TOPE_DE_MEDIDAS)
    .describe("Todas las medidas de la pantalla de una vez"),
  ancho_maqueta: z.coerce
    .number()
    .min(ANCHO_DE_MAQUETA_MINIMO)
    .max(ANCHO_DE_MAQUETA_MAXIMO)
    .optional()
    .describe("Solo si la tool te lo pide: el ancho del viewport de la maqueta en px CSS (el de su code.html)"),
});
type Entrada = z.infer<typeof ESQUEMA>;

export function crearConvertirAP(opciones: { raiz: string; artefactos?: string; adjuntos?: string }) {
  return tool(
    async (e: Entrada): Promise<string> => {
      const malas = motivoDeMedidasInaceptables(e.medidas);
      if (malas !== undefined) return `No convierto: ${malas}.`;
      let appXml: string;
      try {
        // Latin-1 a propósito: solo se leen atributos ASCII, y así un app.xml en ISO-8859 no da error.
        appXml = readFileSync(join(opciones.raiz, "app.xml"), "latin1");
      } catch {
        return "No convierto: el proyecto no tiene app.xml en la raíz, y la cuenta necesita su resolution-width.";
      }
      const resolucion = resolucionDeAppXml(appXml);
      if ("motivo" in resolucion) return `No convierto: ${resolucion.motivo}. Pregúntaselo a la persona en vez de suponer un valor.`;

      let anchoMaqueta: number;
      let origenDelAncho: string;
      if (e.ancho_maqueta !== undefined) {
        anchoMaqueta = e.ancho_maqueta;
        origenDelAncho = "lo indicaste tú";
      } else {
        const maqueta = buscarMaqueta(opciones.raiz, opciones.adjuntos, opciones.artefactos);
        if (maqueta === undefined) {
          return "No convierto: no encuentro la imagen de la maqueta en esta sesión. Pásame ancho_maqueta: el ancho del viewport en px CSS de su code.html.";
        }
        let ancho: number;
        try {
          ancho = dimensionesDeImagen(readFileSync(maqueta.disco)).ancho;
        } catch {
          return `No convierto: no puedo leer el tamaño de ${maqueta.virtual}. Pásame ancho_maqueta: el ancho del viewport en px CSS de su code.html.`;
        }
        const deImagen = anchoDeMaquetaDeImagen(ancho, maqueta.virtual);
        if ("motivo" in deImagen) return `No convierto: ${deImagen.motivo}.`;
        anchoMaqueta = deImagen.ancho;
        origenDelAncho = `el de la imagen ${maqueta.virtual}`;
      }
      return informeDeConversion({ medidas: e.medidas, resolucion, anchoMaqueta, origenDelAncho });
    },
    {
      name: NOMBRE_CONVERTIR_A_P,
      description:
        "Convierte las medidas de una maqueta (px CSS: anchos, altos, márgenes, paddings, tamaños de icono) a la unidad p de XOne. " +
        "Los px de una maqueta NO son p: copiarlos tal cual deja la pantalla unas 2-3 veces más pequeña. Lee él mismo el " +
        "resolution-width del app.xml y el ancho de la maqueta de la sesión; tú solo das las medidas, todas de una vez.",
      schema: ESQUEMA,
    }
  );
}
