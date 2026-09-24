/**
 * `unir_secciones`: junta las secciones `.md` de una carpeta en UN documento, sin pasar por el
 * modelo.
 *
 * Existe por el coste, decisión suya: un manual escrito de una sola vez es una respuesta enorme
 * que puede cortarse a media escritura, y retocarlo pide releerlo entero. Escrito por secciones
 * —un fichero pequeño por sección—, cada llamada al modelo lleva solo la suya, y una corrección
 * solo relee la sección que toca. Pero la UNIÓN no puede hacerla el modelo: reescribir el documento
 * con `write_file` sería volver a generarlo entero, que es justo el gasto que se quería quitar. Así
 * que la hace el harness, y cuesta cero tokens: no devuelve el documento, solo dónde quedó.
 *
 * **El destino no se elige: sale de la carpeta** (`/doc/manual-usuario/` → `/doc/manual-usuario.md`),
 * por lo mismo que `core/exportacion.ts#rutaDePdf`: con un destino por parámetro esto sería una forma
 * de escribir cualquier fichero. Y como toda tool propia, **no pasa por el middleware de permisos**,
 * así que reaplica a mano los de quien la llama —`puedeLeerRuta` para las secciones,
 * `puedeEscribirRuta` para el destino— y, como `copiarArtefacto.ts`, dos veces: sobre el texto y
 * sobre el camino REAL. Se monta solo a quien declara `escribeEn`: escribe sin aprobación, y eso
 * solo vale dentro de las carpetas que su `.md` ya abrió.
 */
import { lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { artefactoFueraDeSitio } from "../../core/artefactos.js";
import { puedeEscribirRuta, puedeLeerRuta, type QuienDecidePermisos } from "./perfiles.js";

export const NOMBRE_UNIR_SECCIONES = "unir_secciones";

/** Topes: una carpeta con cientos de secciones o megas de texto no es un documento, es un error. */
export const TOPE_DE_SECCIONES = 300;
export const TOPE_DE_CARACTERES = 5_000_000;

const ESQUEMA = z.object({
  carpeta: z
    .string()
    .describe(
      "La carpeta con las secciones, ruta virtual (`/doc/manual-usuario/`). Se unen sus `.md` en el"
        + " orden de su nombre (`01-portada.md`, `02-acceso.md`…) y el documento queda al lado, con el"
        + " nombre de la carpeta: `/doc/manual-usuario.md`.",
    ),
});

/** El documento que sale de una carpeta de secciones: la carpeta sin su barra final, más `.md`. */
export function documentoDeCarpeta(carpeta: string): string {
  return `${carpeta.replace(/\/+$/, "")}.md`;
}

function dentroDe(real: string, base: string): boolean {
  const raiz = realpathSync(base);
  return real === raiz || real.startsWith(raiz.endsWith(sep) ? raiz : `${raiz}${sep}`);
}

/** Los números de orden que llevan DOS o más secciones, con cuáles: `06 (06-a.md, 06-b.md)`. */
export function numerosRepetidos(nombres: readonly string[]): string[] {
  const porNumero = new Map<string, string[]>();
  for (const n of nombres) {
    const numero = /^(\d+)/.exec(n)?.[1];
    if (numero === undefined) continue;
    porNumero.set(numero, [...(porNumero.get(numero) ?? []), n]);
  }
  return [...porNumero].filter(([, ns]) => ns.length > 1).map(([numero, ns]) => `${numero} (${ns.join(", ")})`);
}

export function crearUnirSecciones(donde: { raiz: string; perfil: QuienDecidePermisos }) {
  return tool(
    async ({ carpeta }: z.infer<typeof ESQUEMA>) => {
      const limpia = carpeta.trim();
      const carpetaVirtual = `${limpia.startsWith("/") ? limpia : `/${limpia}`}`.replace(/\/+$/, "") + "/";
      if (carpetaVirtual === "/") return "Dame la carpeta de las secciones, no la raíz del proyecto: por ejemplo /doc/manual-usuario/.";
      const destinoVirtual = documentoDeCarpeta(carpetaVirtual);

      // Los permisos de QUIEN llama, sobre el TEXTO: leer las secciones y escribir el documento.
      if (!puedeLeerRuta(carpetaVirtual)) return `No puedes leer «${carpetaVirtual}».`;
      if (!puedeEscribirRuta(donde.perfil, destinoVirtual) || artefactoFueraDeSitio(destinoVirtual) !== undefined) {
        const abiertas = (donde.perfil.escribeEn ?? []).join(", ");
        return `No puedes escribir «${destinoVirtual}».${abiertas === "" ? "" : ` Puedes escribir en: ${abiertas}.`}`;
      }

      const carpetaReal = resolve(donde.raiz, carpetaVirtual.replace(/^\/+/, ""));
      const destinoReal = resolve(donde.raiz, destinoVirtual.replace(/^\/+/, ""));
      let nombres: string[];
      try {
        // Y sobre el camino REAL: un enlace puede sacar la carpeta del proyecto.
        if (!dentroDe(realpathSync(carpetaReal), donde.raiz) || !dentroDe(realpathSync(dirname(destinoReal)), donde.raiz)) {
          return `«${carpetaVirtual}» apunta fuera del proyecto.`;
        }
        // Solo ficheros `.md` de la propia carpeta: ni subcarpetas ni enlaces, que se leerían de otro sitio.
        nombres = readdirSync(carpetaReal)
          .filter((n) => n.toLowerCase().endsWith(".md") && lstatSync(join(carpetaReal, n)).isFile())
          .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
      } catch {
        return `No existe la carpeta «${carpetaVirtual}». Escribe primero las secciones ahí, una por fichero.`;
      }
      if (nombres.length === 0) return `«${carpetaVirtual}» no tiene ninguna sección \`.md\` que unir.`;
      if (nombres.length > TOPE_DE_SECCIONES) return `«${carpetaVirtual}» tiene ${nombres.length} secciones; el tope es ${TOPE_DE_SECCIONES}.`;

      const leidas = nombres.map((n) => ({ nombre: n, texto: readFileSync(join(carpetaReal, n), "utf8").trim() }));
      // Una sección VACÍA no entra: es como se retira una, porque aquí no hay tool para borrar.
      const vacias = leidas.filter((l) => l.texto === "").map((l) => l.nombre);
      const unidas = leidas.filter((l) => l.texto !== "");
      if (unidas.length === 0) return `Todas las secciones de «${carpetaVirtual}» están vacías: no hay nada que unir.`;
      const documento = `${unidas.map((l) => l.texto).join("\n\n")}\n`;
      if (documento.length > TOPE_DE_CARACTERES) return `El documento pasaría de ${TOPE_DE_CARACTERES} caracteres: parte el trabajo en varios documentos.`;
      try {
        writeFileSync(destinoReal, documento, "utf8");
      } catch (error) {
        return `No se pudo escribir «${destinoVirtual}»: ${error instanceof Error ? error.name : "error"}.`;
      }
      // NO se devuelve el documento: es el ahorro entero. Solo lo que hace falta para seguir, y lo
      // que huele a sección vieja: medido en un manual real, dos quedaron con el mismo número
      // (`06-basico.md` y `06-categoria-basico.md`) tras rehacerse media estructura.
      const repetidos = numerosRepetidos(unidas.map((l) => l.nombre));
      return [
        `Unidas ${unidas.length} secciones en ${destinoVirtual} (${documento.length} caracteres): ${unidas.map((l) => l.nombre).join(", ")}.`,
        ...(vacias.length === 0 ? [] : [`Saltadas por vacías: ${vacias.join(", ")}.`]),
        ...(repetidos.length === 0
          ? []
          : [
              `⚠ Números repetidos: ${repetidos.join("; ")}. Si una de ellas sobra, VACÍALA (write_file con contenido vacío) y vuelve a unir: una vacía no entra.`,
            ]),
      ].join(" ");
    },
    {
      name: NOMBRE_UNIR_SECCIONES,
      description:
        "Une las secciones `.md` de una carpeta en un solo documento, en el orden de su nombre, sin"
        + " que tengas que reescribirlo. Escribe cada sección en su propio fichero"
        + " (`/doc/manual-usuario/01-portada.md`, `02-acceso.md`…) y al terminar llama a esto: el"
        + " documento queda en `/doc/manual-usuario.md`. Para corregir algo, edita SU sección y vuelve"
        + " a unir. No te devuelve el texto, solo dónde quedó.",
      schema: ESQUEMA,
    },
  );
}
