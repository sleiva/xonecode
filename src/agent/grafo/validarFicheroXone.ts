import { tool } from "@langchain/core/tools";
import type { FilesystemBackend } from "deepagents";
import { z } from "zod";
import { comprobarCss } from "../../core/cssBienFormado.js";
import { comprobarJs } from "../../core/jsParaRhino.js";
import { comprobarXml, type ResultadoXml } from "../../core/xmlBienFormado.js";
import { puedeLeerRuta } from "./perfiles.js";

/**
 * `validar_fichero_xone`: ¿está bien este `.xne`, `.xml` (el `app.xml`), `.css` o `.js`? Una respuesta
 * exacta en vez de leer el fichero a ojo. Cada extensión con su comprobador puro de `core/`:
 * `comprobarXml` (bien formado), `comprobarCss` (estructura de la hoja, con la gramática de XOne) y
 * `comprobarJs` (lo que lee Rhino, el motor de Android: `acorn` a ES2015 más la rodaja medida que le
 * falta).
 *
 * Existe por un turno real (soporte de APPSalud): la persona pegó un error del parser de Studio
 * («'name' is an unexpected token…, Line 381») y el agente, sin forma de comprobarlo, se pasó
 * minutos releyendo un fichero que estaba BIEN —lo dijo a los dos minutos y no se lo creyó—.
 *
 * - **Sin llamar a nadie**: el comprobador es puro (`core/xmlBienFormado.ts`), ni simulador ni
 *   linter ni red.
 * - **Lee por el backend** (`readRaw`), así que hereda la codificación del fichero, las vistas
 *   aplanadas y el resto de guardas; y **reaplica `puedeLeerRuta` a mano**, porque una tool de
 *   LangChain añadida por xonecode no pasa por el middleware de permisos.
 * - **Solo lectura**: no corrige nada. Y su descripción dice qué significa un «bien formado»
 *   frente a un error que alguien ha visto: que ese error viene de OTRA copia del fichero.
 */
export const NOMBRE_VALIDAR_FICHERO_XONE = "validar_fichero_xone";

/** Cuántos ficheros como mucho en una pasada sobre una carpeta. */
export const TOPE_DE_FICHEROS_A_VALIDAR = 300;

const ESQUEMA = z.object({
  path: z
    .string()
    .min(1)
    .default("/")
    .describe("Un fichero .xne, .xml, .css o .js, o una carpeta para revisar todos los que cuelgan de ella (por omisión, el proyecto entero)"),
});

type BackendDeValidacion = Pick<FilesystemBackend, "glob" | "readRaw">;

const VALIDABLE = /\.(xne|xml|css|js)$/i;

/** El comprobador de cada extensión. */
function comprobar(ruta: string, texto: string): ResultadoXml {
  const ext = ruta.slice(ruta.lastIndexOf(".")).toLowerCase();
  if (ext === ".css") return comprobarCss(texto);
  if (ext === ".js") return comprobarJs(texto);
  return comprobarXml(texto);
}

export function crearValidarFicheroXone(backend: BackendDeValidacion) {
  return tool(
    async (entrada: z.infer<typeof ESQUEMA>) => {
      const ruta = entrada.path.startsWith("/") ? entrada.path : `/${entrada.path}`;
      let candidatos: string[];
      if (VALIDABLE.test(ruta)) {
        if (!puedeLeerRuta(ruta)) return `No se puede leer ${ruta}.`;
        candidatos = [ruta];
      } else {
        const listado = await backend.glob("**/*.{xne,xml,css,js}", ruta);
        if (listado.error) return `No se pudo listar ${ruta}: ${listado.error}`;
        candidatos = (listado.files ?? [])
          .filter((f) => !f.is_dir && VALIDABLE.test(f.path) && puedeLeerRuta(f.path))
          .map((f) => f.path);
        if (candidatos.length === 0) return `No hay ficheros .xne, .xml, .css ni .js en ${ruta}.`;
      }

      const recortado = candidatos.length > TOPE_DE_FICHEROS_A_VALIDAR;
      const malos: string[] = [];
      const sinLeer: string[] = [];
      let bien = 0;
      for (const fichero of candidatos.slice(0, TOPE_DE_FICHEROS_A_VALIDAR)) {
        const leido = await backend.readRaw(fichero);
        if (leido.error || !leido.data || typeof leido.data.content !== "string") {
          sinLeer.push(`${fichero}: ${leido.error ?? "no se pudo leer"}`);
          continue;
        }
        const r = comprobar(fichero, leido.data.content);
        if (r.ok) {
          bien += 1;
          continue;
        }
        const linea = leido.data.content.replace(/^﻿/, "").split(/\r?\n/)[r.linea - 1] ?? "";
        malos.push(`${fichero}:${r.linea}:${r.columna}: ${r.motivo}\n    ${linea.trim().slice(0, 200)}`);
      }

      const partes: string[] = [];
      if (malos.length === 0 && sinLeer.length === 0) {
        partes.push(
          candidatos.length === 1
            ? `${candidatos[0]} está bien.`
            : `Los ${bien} ficheros están bien.`
        );
      } else {
        if (malos.length > 0) partes.push(`Con errores (${malos.length}):\n${malos.join("\n")}`);
        if (bien > 0) partes.push(`Bien: ${bien}.`);
        if (sinLeer.length > 0) partes.push(`Sin poder leer (${sinLeer.length}):\n${sinLeer.join("\n")}`);
      }
      if (recortado) partes.push(`Se revisaron los primeros ${TOPE_DE_FICHEROS_A_VALIDAR} de ${candidatos.length}: acota la carpeta.`);
      return partes.join("\n\n");
    },
    {
      name: NOMBRE_VALIDAR_FICHERO_XONE,
      description:
        "Comprueba un fichero XOne del proyecto, o todos los de una carpeta, como lo haría su parser: un .xne o .xml " +
        "(el app.xml) bien formado —etiquetas, atributos con su «=» y comillas, comentarios, entidades—; un .css con " +
        "su estructura —llaves, comentarios /* */ y //, declaraciones con «:»—; un .js que pueda leer Rhino, el motor " +
        "de Android (ES5 más arrow, let/const, destructuring y for…of; NO template literals, class, spread, valores " +
        "por defecto, ?. ni ??). Contesta «está bien» o fichero, línea, columna y motivo. Úsala ANTES de leer un " +
        "fichero a ojo cuando alguien te pase un error de parsing, y después de escribir uno. Si dice que está bien, " +
        "el fichero del proyecto está bien: un error de parsing que alguien ha visto viene de OTRA copia (la de Studio " +
        "tras una subida, la del aparato); dilo así en vez de seguir releyendo. No comprueba qué atributos o " +
        "propiedades existen en XOne (para eso, xone_atributos).",
      schema: ESQUEMA,
    }
  );
}
