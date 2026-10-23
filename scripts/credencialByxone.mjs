#!/usr/bin/env node
/**
 * Escribe la credencial EMPAQUETADA de byXOneDownloads en `dist/byxone.json`, desde el entorno de quien
 * construye. Es lo que hace que una instalación de XoneCode vea el catálogo de frameworks sin que
 * nadie cree ningún fichero (`src/core/byxone.ts#resolverCredencialByxone`).
 *
 * **El secreto NO está en git**: llega por `BYXONE_CLIENT_ID_DE_BUILD` y `BYXONE_SECRETO_DE_BUILD`, y
 * `dist/` está ignorado. **Lo empaquetado es público en la práctica** —cualquiera que instale el
 * paquete lo lee—, así que tiene que ser un cliente de SOLO `list,download` (`xcode-read`).
 *
 * Dos modos:
 * - `--opcional` (`npm run build`): sin las variables AVISA y sigue. Un build de desarrollo no la
 *   necesita; sin ella, solo se instala lo ya descargado.
 * - `--obligatoria` (`prepack`): sin las variables FALLA. Un paquete para repartir sin credencial
 *   dejaría a todo el mundo sin catálogo, y eso no se descubre hasta instalarlo.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = join(RAIZ, "dist", "byxone.json");
const obligatoria = process.argv.includes("--obligatoria");

const clientId = process.env.BYXONE_CLIENT_ID_DE_BUILD?.trim();
const secreto = process.env.BYXONE_SECRETO_DE_BUILD?.trim();

if (!clientId || !secreto) {
  const texto =
    "byXOne: sin BYXONE_CLIENT_ID_DE_BUILD y BYXONE_SECRETO_DE_BUILD el paquete no lleva credencial " +
    "y no verá el catálogo de frameworks (lo ya descargado se sigue pudiendo instalar).";
  if (obligatoria) {
    console.error(`✖ ${texto}`);
    process.exit(70);
  }
  console.warn(`⚠ ${texto}`);
  process.exit(0);
}

mkdirSync(dirname(DESTINO), { recursive: true });
writeFileSync(DESTINO, JSON.stringify({ clientId, secreto }) + "\n");
// El id sí se dice —es lo que se audita—; el secreto, nunca.
console.log(`byXOne: credencial empaquetada para el cliente «${clientId}».`);
