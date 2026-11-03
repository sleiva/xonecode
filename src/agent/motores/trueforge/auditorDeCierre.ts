/**
 * La auditoría de cierre CON MODELO (F2): las reglas son de `core/auditoriaDeCierre.ts`; aquí, la llamada (papel `afilado`)
 * con cada criterio y su prueba —las capturas como imagen, detrás de su criterio— y la lectura de la respuesta.
 *
 * No poder preguntar es fallo del ENTORNO, no un veredicto: se devuelve `undefined` y el cierre lo dice, sin bajar nada.
 * Un «no se pudo auditar» convertido en «no se sostiene» culparía al trabajo de un problema de la máquina.
 */
import { readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import {
  leerAuditoria,
  PROMPT_DEL_AUDITOR,
  repartoDeImagenes,
  rutaDeCaptura,
  textoDeCriterioParaAuditar,
  type CriterioAAuditar,
  type CriterioAuditado,
} from "../../../core/auditoriaDeCierre.js";
import type { Papel } from "../../../core/ports.js";
import { consumoVisualDe, type ConsumoVisual } from "../../dispositivos/juezVisual.js";

export const PAPEL_DEL_AUDITOR: Papel = "afilado";

export interface DependenciasDelAuditor {
  modelos: { paraPapel(papel: Papel): unknown };
  /** Dónde están las capturas que cita `/artefactos/…`. Sin carpeta, ninguna imagen: «no se ve». */
  artefactos?: string;
  /** Lo que gastó la llamada; fallar al contarlo no tumba la auditoría. */
  alConsumir?: (uso: ConsumoVisual) => void;
}

const mimeDe = (ruta: string): string => (extname(ruta) === ".png" ? "image/png" : extname(ruta) === ".webp" ? "image/webp" : "image/jpeg");

export function crearAuditorDeCierre(deps: DependenciasDelAuditor) {
  return async (criterios: readonly CriterioAAuditar[]): Promise<Map<string, CriterioAuditado> | undefined> => {
    if (criterios.length === 0) return new Map();
    const { rutas, sinImagen } = repartoDeImagenes(criterios);
    const imagenes = new Map<string, string>();
    for (const ruta of rutas) {
      if (deps.artefactos === undefined) break;
      try {
        imagenes.set(ruta, readFileSync(join(deps.artefactos, basename(ruta))).toString("base64"));
      } catch {
        // La captura ya no está en disco: su criterio queda «no se ve».
      }
    }
    const preguntados = criterios.filter((c) => {
      if (sinImagen.has(c.id)) return false;
      const ruta = rutaDeCaptura(c.evidencia);
      if (c.evidencia.tipo === "captura" && (ruta === undefined || !imagenes.has(ruta))) {
        sinImagen.set(c.id, "su captura ya no está en disco");
        return false;
      }
      return true;
    });
    const salida = new Map<string, CriterioAuditado>([...sinImagen].map(([id, porque]) => [id, { veredicto: "no-se-ve" as const, porque }]));
    if (preguntados.length === 0) return salida;

    let modelo: unknown;
    try {
      modelo = deps.modelos.paraPapel(PAPEL_DEL_AUDITOR);
    } catch {
      return undefined;
    }
    if (typeof modelo !== "object" || modelo === null || typeof (modelo as { invoke?: unknown }).invoke !== "function") return undefined;
    const { HumanMessage } = await import("@langchain/core/messages");
    const { textoDe } = await import("../../turno/puente.js");
    const contenido: unknown[] = [{ type: "text", text: PROMPT_DEL_AUDITOR }];
    // Cada captura UNA vez (medido: una sola respaldó 21 casillas); las siguientes que la citan dicen cuál es.
    const enviadas = new Set<string>();
    for (const c of preguntados) {
      contenido.push({ type: "text", text: textoDeCriterioParaAuditar(c) });
      const ruta = rutaDeCaptura(c.evidencia);
      if (ruta === undefined) continue;
      if (enviadas.has(ruta)) {
        contenido.push({ type: "text", text: `(la misma captura de arriba: ${ruta})` });
        continue;
      }
      enviadas.add(ruta);
      contenido.push({ type: "text", text: `Captura ${ruta}:` });
      contenido.push({ type: "image_url", image_url: { url: `data:${mimeDe(ruta)};base64,${imagenes.get(ruta)!}` } });
    }
    let respuesta: unknown;
    try {
      // `callbacks: []`: la respuesta del auditor es maquinaria y no se pinta en el chat (lo mismo que el crítico).
      respuesta = await (modelo as { invoke: (p: unknown, o?: unknown) => Promise<unknown> }).invoke([new HumanMessage({ content: contenido as never })], { callbacks: [] });
    } catch {
      return undefined;
    }
    const uso = consumoVisualDe(respuesta);
    if (uso !== undefined && deps.alConsumir !== undefined) {
      try {
        deps.alConsumir(uso);
      } catch {
        // Contar es contabilidad.
      }
    }
    for (const [id, a] of leerAuditoria(textoDe(respuesta), preguntados.map((c) => c.id))) salida.set(id, a);
    return salida;
  };
}
