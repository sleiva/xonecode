/**
 * Una skill: el `SKILL.md` que el agente carga bajo demanda, y de quién es.
 *
 * **Este módulo es PURO.** Quién lee el disco es `agent/grafo/skills.ts`; quién las monta
 * para el agente, `agent/grafo/proyecto.ts#backendConSkills`. Aquí solo vive el formato del
 * fichero y la regla de qué nombre vale — las dos cosas que la ventana de Ajustes, el
 * cargador y los tests tienen que entender igual.
 *
 * **Tres orígenes y no dos**, con la misma precedencia que los subagentes y los modelos:
 *
 * | origen | dónde | quién la escribe |
 * |---|---|---|
 * | `serie` | la carpeta `skills/` del PAQUETE | xonecode, y no se toca desde la consola |
 * | `global` | `~/.xonecode/skills/` | el usuario, para todos sus proyectos |
 * | `proyecto` | `<raiz>/.xonecode/skills/` | el usuario, solo para ese proyecto |
 *
 * Las de serie son de SOLO LECTURA y no se borran ni se editan: viven dentro del paquete
 * instalado, así que una edición se la llevaría por delante el siguiente `npm install` sin
 * decir nada. Lo que sí se puede es COPIARLA a las tuyas y cambiarla ahí, que además deja
 * ver de dónde salió. Por eso no hay `.semilla.json` como en los subagentes: nada nuestro
 * se copia nunca a la casa del usuario, así que no hay marca que llevar ni nada que
 * restaurar.
 *
 * El `SKILL.md` es el formato de Claude Code, y eso no es una coincidencia que convenga
 * mantener: es lo que hace que una skill escrita para otro harness se lea aquí tal cual, y
 * que `SkillsMiddleware` de deepagents —que es quien las descubre de verdad— la encuentre
 * sin que xonecode traduzca nada.
 */

import { motivoDeNombreInaceptable, nombreSugerido } from "./agentes.js";

/** De dónde sale una skill. No se escribe en el fichero: lo pone quien lo lee. */
export type OrigenDeSkill = "serie" | "global" | "proyecto";

/** El fichero, sin de quién es. Es lo que se escribe y lo que se lee. */
export interface Skill {
  nombre: string;
  descripcion: string;
  /** El cuerpo del `SKILL.md`, sin el frontmatter. Son las instrucciones. */
  cuerpo: string;
  /**
   * El frontmatter TAL COMO está en el fichero, sin los `---`.
   *
   * Existe por dos cosas distintas y las dos importan:
   *
   * - **Se ENSEÑA.** `description` no es lo único que puede haber ahí: `archify` declara
   *   además `license` y un bloque `metadata` anidado, y una ventana que solo enseña la
   *   descripción haría creer que eso es todo lo que el fichero dice.
   * - **Se CONSERVA al guardar.** `escribirSkill` reescribe `name` y `description` DENTRO de
   *   este texto en vez de componer uno nuevo: sin eso, editar desde la ventana una skill
   *   escrita a mano le borraba en silencio todas las claves que no conocemos — que es la
   *   pérdida muda de siempre, y encima sobre un fichero que el usuario escribió él.
   *
   * Ausente en la que se está creando: entonces se compone el mínimo.
   */
  frontmatter?: string;
}

/** Una skill ya cargada: el fichero, más de dónde salió y lo que cuesta. */
export interface SkillCargada extends Skill {
  origen: OrigenDeSkill;
  /** Estimación de coste del `SKILL.md` ENTERO, frontmatter incluido. */
  tokens: number;
  /**
   * Los ficheros que acompañan al `SKILL.md`, por nombre y sin contenido.
   *
   * Viajan porque una skill puede ser una carpeta entera —plantillas, ejemplos, un script—
   * y la ventana que solo enseña el `SKILL.md` haría creer que editarlo es editarla toda.
   * Lo que se puede tocar desde aquí es el `SKILL.md`; el resto se dice que está y se deja
   * donde vive, que es la misma postura que `omitidas` en el plan de subida.
   */
  ficheros: string[];
}

/** Lo que se pudo leer, y lo que no con su motivo. Nunca se descarta nada en silencio. */
export interface LecturaDeSkills {
  skills: SkillCargada[];
  /** Una línea por fichero: qué skill y qué le pasa. */
  problemas: string[];
}

/** 4 caracteres por token, la regla de servilleta de siempre. */
export const tokensDeSkill = (texto: string): number => Math.ceil(texto.length / 4);

/**
 * El nombre de una skill es un SEGMENTO DE RUTA —la carpeta donde vive— y también lo que el
 * subagente declara en su `.md`, así que vale la MISMA regla que la de un subagente y por la
 * misma razón: `motivoDeNombreInaceptable` (`core/agentes.ts`). No se escribe una segunda
 * aquí porque dos reglas para el mismo tipo de nombre es donde divergen.
 */
export const motivoDeNombreDeSkillInaceptable = motivoDeNombreInaceptable;
export const nombreDeSkillSugerido = nombreSugerido;

/** El texto que sale del frontmatter cuando un campo lleva caracteres que lo romperían. */
const enUnaLinea = (texto: string): string => texto.replace(/\r?\n/g, " ").trim();

/** ¿Esta línea abre la clave `clave` en el primer nivel del frontmatter? */
const abreClave = (linea: string, clave: string): boolean =>
  linea.startsWith(`${clave}:`) && !linea.startsWith(" ") && !linea.startsWith("\t");

/**
 * Compone el `SKILL.md`.
 *
 * El frontmatter es el mínimo que `parseFrontmatter` (`vendor/skillLoaders/catalog.ts`) y
 * deepagents leen: `name` y `description`, una línea cada uno. La descripción se aplana a
 * una línea porque ahí un salto la partiría en dos claves y la segunda mitad se perdería en
 * silencio — el mismo motivo por el que el nombre es un slug.
 *
 * **Y lo demás del frontmatter se CONSERVA**: las claves que no son `name` ni `description`
 * se reescriben tal cual, en su orden. Componer uno nuevo desde cero le borraba a una skill
 * escrita a mano su `license`, su `allowed-tools` o su bloque `metadata` en cuanto alguien
 * abriera la ventana y pulsara Guardar — sin error, sin aviso y sobre un fichero suyo. Las
 * líneas INDENTADAS van con la clave que las abre, que es lo que deja pasar un bloque
 * anidado entero sin entender YAML.
 */
export function escribirSkill(skill: Skill): string {
  const cuerpo = skill.cuerpo.replace(/^\n+/, "");
  const resto: string[] = [];
  let saltando = false;
  for (const linea of (skill.frontmatter ?? "").split("\n")) {
    if (abreClave(linea, "name") || abreClave(linea, "description")) {
      saltando = true;
      continue;
    }
    // Una línea indentada pertenece a la clave de arriba: si se estaba saltando, se salta.
    const indentada = /^[ \t]/.test(linea);
    if (saltando && indentada) continue;
    saltando = false;
    if (linea.trim() !== "") resto.push(linea);
  }
  const extra = resto.length === 0 ? "" : `${resto.join("\n")}\n`;
  return `---\nname: ${skill.nombre}\ndescription: ${enUnaLinea(skill.descripcion)}\n${extra}---\n\n${cuerpo}`;
}

/**
 * Lee un `SKILL.md`.
 *
 * **El nombre sale de la CARPETA, no del frontmatter**, exactamente como el de un subagente
 * sale del fichero: es lo que la hace direccionable (`/skills/<nombre>/`) y lo que el
 * subagente declara. Un `name:` que diga otra cosa se ignora — mandaría sobre una ruta que
 * ya está decidida, y entonces `rutasDeSkills` apuntaría a una carpeta que no existe.
 *
 * **Sin `description` no se carga.** Es lo que el modelo lee para decidir si esta skill le
 * sirve: sin ella, la skill está en el catálogo y no la usa nadie nunca, que es peor que no
 * estar. Misma regla que la `descripcion` de un subagente.
 */
export function leerSkill(
  texto: string,
  nombreDeCarpeta: string,
  origen: OrigenDeSkill,
  ficheros: string[] = []
): { skill: SkillCargada } | { error: string } {
  const { descripcion, frontmatter, cuerpo } = partirFrontmatter(texto);
  if (descripcion === "") return { error: "no tiene `description` en el frontmatter" };
  return {
    skill: {
      nombre: nombreDeCarpeta,
      descripcion,
      cuerpo,
      frontmatter,
      origen,
      tokens: tokensDeSkill(texto),
      ficheros,
    },
  };
}

/**
 * El frontmatter mínimo, sin traer un parser de YAML.
 *
 * Es el mismo criterio que `core/agentes.ts` y que `vendor/skillLoaders/catalog.ts`: la
 * superficie es `clave: valor` de una línea entre `---`, y un parser entero sería una
 * dependencia para leer dos campos. Lo que no se entiende no se inventa: sin frontmatter,
 * el fichero entero es cuerpo y la descripción sale vacía, que es lo que `leerSkill`
 * rechaza.
 */
function partirFrontmatter(texto: string): { descripcion: string; frontmatter: string; cuerpo: string } {
  if (!texto.startsWith("---")) return { descripcion: "", frontmatter: "", cuerpo: texto };
  const fin = texto.indexOf("\n---", 3);
  if (fin === -1) return { descripcion: "", frontmatter: "", cuerpo: texto };

  // El bloque entero, tal cual, sin los `---` ni el salto que los sigue. Es lo que se enseña
  // y lo que se conserva al guardar: recomponerlo de las claves que entendemos tiraría las
  // que no.
  const frontmatter = texto.slice(3, fin).replace(/^\n/, "");
  let descripcion = "";
  for (const linea of frontmatter.split("\n")) {
    const i = linea.indexOf(":");
    if (i === -1) continue;
    if (linea.slice(0, i).trim() === "description") descripcion = linea.slice(i + 1).trim();
  }
  const salto = texto.indexOf("\n", fin + 1);
  return {
    descripcion,
    frontmatter,
    cuerpo: salto === -1 ? "" : texto.slice(salto + 1).replace(/^\n+/, ""),
  };
}

/**
 * Funde las listas por nombre: la ÚLTIMA gana.
 *
 * Se llama con `serie`, `global`, `proyecto` en ese orden, así que una skill del proyecto
 * tapa a la global del mismo nombre y las dos tapan a la de serie — la misma precedencia
 * que los subagentes y que los modelos, y por lo mismo: lo particular manda sobre lo
 * general. Que una tape a otra NO es un problema que reportar: es la forma de afinar una
 * skill nuestra sin editarla donde el `npm install` la pisaría. Quien lo dice es la ficha,
 * con su origen al lado.
 */
export function fusionarSkills(...listas: readonly SkillCargada[][]): SkillCargada[] {
  const porNombre = new Map<string, SkillCargada>();
  for (const lista of listas) for (const skill of lista) porNombre.set(skill.nombre, skill);
  return [...porNombre.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}
