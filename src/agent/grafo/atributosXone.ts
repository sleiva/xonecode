import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { consultarAtributos, indiceDeAtributos, interpretarReferenciaDeAtributos, type IndiceDeAtributos } from "../../core/atributosXone.js";
import { RAIZ_SKILLS } from "./skills.js";

export const NOMBRE_ATRIBUTOS_XONE = "xone_atributos";

/**
 * Las tablas de las que sale el índice, dentro de la skill `xone-development` del PAQUETE: las de referencia de cada nodo y
 * las de su capítulo propio, porque la skill no siempre dice lo mismo en los dos y el índice enseña los dos. `nodo` es el
 * del fichero entero cuando su título no lo parte en secciones `## N. Nodo …`.
 */
export const REFERENCIAS_DE_ATRIBUTOS: readonly { fichero: string; nodo?: string }[] = [
  { fichero: "xml-ui/atributos-coll-group-frame.md" },
  { fichero: "xml-ui/atributos-prop.md" },
  { fichero: "xml-ui/estructura-y-nodo-coll.md" },
  { fichero: "xml-ui/nodos-group-y-frame.md" },
  { fichero: "xml-ui/prop-atributos-y-condiciones.md", nodo: "prop" },
];

/** Dónde se busca lo que el índice no trae: la skill entera, con la tool de fichero que todos tienen. */
export const RUTA_DE_LA_SKILL = "/skills/xone-development/references/";
export const busquedaEnLaSkill = (atributo: string): string =>
  `búscalo en la skill con grep ${JSON.stringify({ pattern: atributo, path: RUTA_DE_LA_SKILL })} y lee el fichero que salga`;

/**
 * `xone_atributos`: ¿existe este atributo en este nodo?, en una línea (`core/atributosXone.ts` tiene el porqué medido).
 *
 * Se lee de la skill del PAQUETE en cada construcción, nunca de una copia: si la referencia cambia, el índice cambia con
 * ella. Una referencia que falta no tumba nada: la tool dice que no tiene índice y remite a la skill. Solo LEE, y lo que
 * lee es de la skill, no del proyecto, así que no pasa por `puedeLeerRuta`.
 */
export function crearAtributosXone(raizDeSkills: string = RAIZ_SKILLS) {
  let indice: IndiceDeAtributos | undefined;
  let fallo: string | undefined;
  try {
    const base = join(raizDeSkills, "xone-development", "references");
    indice = indiceDeAtributos(
      REFERENCIAS_DE_ATRIBUTOS.flatMap((r) => interpretarReferenciaDeAtributos(readFileSync(join(base, r.fichero), "utf8"), r.fichero, r.nodo))
    );
    if (indice.porAtributo.size === 0) fallo = "la referencia no trae ninguna tabla de atributos reconocible";
  } catch (e) {
    fallo = `no se pudo leer la referencia (${(e as { code?: string }).code ?? "error de lectura"})`;
  }
  return tool(
    async (entrada: { atributo?: string; nodo?: string }): Promise<string> =>
      indice === undefined || fallo !== undefined
        ? `Sin índice de atributos: ${fallo ?? "no cargado"}. Ve a la skill: ${busquedaEnLaSkill(entrada.atributo ?? "<atributo>")}.`
        : consultarAtributos(indice, entrada, busquedaEnLaSkill),
    {
      name: NOMBRE_ATRIBUTOS_XONE,
      description:
        "ÍNDICE DE CONSULTA RÁPIDA de los atributos XML de XOne, sacado de las tablas de la skill xone-development: no la " +
        "sustituye, te dice si un atributo está en sus tablas y DÓNDE leer el detalle. Con `atributo` (bgcolor, imgbk…): en " +
        "qué nodos está (coll, group, frame, prop), tipo, omisión, una línea de descripción y el fichero y sección; si dos " +
        "ficheros de la skill dicen cosas distintas, te da los dos. Con solo `nodo`: sus atributos por sección. Las tablas " +
        "son por NODO, no por tipo de control: que esté en <prop> no dice que haga algo en cada `type`. Si no encuentras lo " +
        "que buscas, o necesitas ejemplos o matices, VE A LA SKILL: la respuesta te da la búsqueda hecha, y manda la skill.",
      schema: z.object({
        atributo: z.string().max(64).optional().describe("El atributo, tal cual se escribe en el XML (bgcolor, border-corner-radius…)."),
        nodo: z.string().max(16).optional().describe("coll, group, frame o prop. Con atributo, lo acota; solo, lista sus atributos."),
      }),
    }
  );
}
