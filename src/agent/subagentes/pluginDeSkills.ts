/**
 * Las skills de xonecode, servidas a un hijo de **Claude Code** como un PLUGIN LOCAL.
 *
 * **La palanca es `plugins`, y eso se midió — `additionalDirectories` NO vale.** El primer
 * intento fue montar una carpeta con la disposición `<dir>/.claude/skills/` y pasarla por
 * `additionalDirectories`, porque su documentación dice que añadir un directorio recarga
 * «CLAUDE.md, skills, and plugins». Probado contra un hijo de verdad, preguntándole qué
 * skills tenía: listó las del usuario y las de sus plugins, y **ninguna de las dos del
 * montaje**. Con `plugins: [{type:"local", path}]` y un `plugin.json` que apunta su `skills`
 * a una carpeta, las mismas dos aparecen como `xonecode:xone-review` y
 * `xonecode:xone-debugging`. Esa diferencia es todo el motivo de este fichero.
 *
 * **Y por eso no se escribe nada dentro del proyecto.** La otra forma de que Claude Code las
 * encuentre sería un `.claude/skills/` en la carpeta del proyecto, y ahí no se puede: el
 * proyecto es la app del cliente, se sincroniza con CloudStudio y entra en el commit de cada
 * turno, así que nuestro andamiaje acabaría subido a Studio. Esta carpeta es NUESTRA
 * (`~/.xonecode/motores/claude`) y el hijo la recibe por argumento.
 *
 * **Enlaces y no copias**: las de serie pesan megas —una sola son 77 ficheros— y esto se
 * monta en cada arranque de un subagente externo.
 *
 * **Y el hijo puede LEER la carpeta entera de cada skill montada, no solo su `SKILL.md`**
 * (`carpetasDeLecturaDeSkills`, sumadas a las lecturas de `veredictoDeLectura`). Antes se negaba, a
 * propósito, y el precio resultó demasiado alto: medido en una tarea de Maset (15-10-2026), el
 * developer y el consultor en Claude Code no pudieron leer `references/xml-ui/…` y escribieron
 * atributos de XOne a ciegas —`img=` en un `type="IMG"`, donde la documentación dice `path=`—; el
 * consultor lo dijo: «mi sandbox bloquea Read fuera del proyecto… No puedo confirmar si es `img` o
 * `path`». No se abre «una carpeta de fuera por comodidad»: se abren SOLO las carpetas de las skills
 * que este mismo montaje sirve, una a una, en LECTURA, comprobadas por texto y por camino real
 * (`dentroDeUnaLectura`). La casa, `.xonecode/` y el resto de la máquina siguen cerrados.
 *
 * **Segundo límite**: el nombre le llega PREFIJADO (`xonecode:<nombre>`), que es como Claude
 * Code nombra lo que viene de un plugin, mientras que el `.md` de un subagente y
 * `promptDeAgente` lo nombran a secas. No se reescribe el prompt para igualarlo: el prefijo
 * lo pone el motor y adivinarlo aquí sería atarse a su formato.
 */

import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { skillsConRuta } from "../grafo/skills.js";

/** El nombre del plugin. Sale en el nombre de cada skill (`xonecode:<nombre>`), así que
 *  vive en una constante: es dato del producto, no una cadena suelta. */
export const NOMBRE_DEL_PLUGIN = "xonecode";

/** La carpeta que gobernamos para este motor. Fuera del proyecto, a propósito. */
export function carpetaDelPluginDeSkills(casa?: string): string {
  return join(casa ?? join(homedir(), ".xonecode"), "motores", "claude");
}

/**
 * El manifiesto, PURO y por eso comprobable sin disco.
 *
 * `skills` apunta a una subcarpeta relativa y no a la raíz del paquete: la carpeta de
 * montaje FUNDE las tres raíces (serie, global y proyecto) con la precedencia de
 * `cargarSkills`, y una ruta suelta solo podría apuntar a una de ellas.
 */
export function manifiestoDelPluginDeSkills(): string {
  return `${JSON.stringify(
    {
      name: NOMBRE_DEL_PLUGIN,
      // Fija, y no la del paquete: este manifiesto no se publica ni se resuelve contra
      // nada, y colgar de `versionEnDisco` metería un lanzamiento de `git` en el arranque
      // de cada subagente para un campo que ningún consumidor mira.
      version: "0.0.0",
      description: "Las skills que monta XOneCode para sus subagentes",
      skills: "./skills/",
    },
    null,
    2
  )}\n`;
}

/**
 * Deja la carpeta del plugin lista y devuelve su ruta — o AUSENTE si no hay ninguna skill
 * que servir, o si no se pudo montar.
 *
 * **Ausente no tumba el turno.** Esto cuelga del arranque de un subagente: un fallo al
 * escribir en la casa del usuario no puede llevarse por delante el trabajo, así que el hijo
 * arranca sin plugin y con las suyas, que es como estaba antes.
 *
 * **La carpeta de skills se RECREA entera** en cada montaje. Dentro solo hay enlaces que
 * pusimos nosotros, así que borrarla es seguro; y sin borrarla, una skill que el usuario
 * quitó del disco seguiría anunciada por un enlace roto — el ajuste viejo que sobrevive a su
 * dueño, que es el fallo que este repo persigue en todas partes.
 */
export function montarPluginDeSkills(opciones: { casa?: string; raiz?: string } = {}):
  | string
  | undefined {
  const skills = skillsConRuta(opciones.raiz);
  if (skills.length === 0) return undefined;

  const carpeta = carpetaDelPluginDeSkills(opciones.casa);
  const destino = join(carpeta, "skills");
  try {
    mkdirSync(join(carpeta, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(carpeta, ".claude-plugin", "plugin.json"),
      manifiestoDelPluginDeSkills(),
      { mode: 0o600 }
    );
    rmSync(destino, { recursive: true, force: true });
    mkdirSync(destino, { recursive: true });
    for (const skill of skills) {
      const enlace = join(destino, skill.nombre);
      // Una skill que ya no está en disco no se enlaza: el enlace roto la anunciaría igual.
      if (existsSync(skill.dir)) symlinkSync(skill.dir, enlace, "dir");
    }
    return carpeta;
  } catch {
    return undefined;
  }
}

/**
 * Las carpetas que un hijo de Claude Code puede LEER de las skills montadas: de cada una, su enlace dentro del plugin
 * (`<plugin>/skills/<nombre>`, que es la ruta que el motor le enseña) y su carpeta REAL. Las dos hacen falta:
 * `dentroDeUnaLectura` compara el texto de la ruta Y su camino real, y el plugin usa ENLACES, así que una lectura por el
 * enlace tiene el texto bajo el plugin y el camino real bajo la skill. Solo las que están en disco.
 */
export function carpetasDeLecturaDeSkills(opciones: { casa?: string; raiz?: string } = {}): string[] {
  const enlaces = join(carpetaDelPluginDeSkills(opciones.casa), "skills");
  return skillsConRuta(opciones.raiz)
    .filter((s) => existsSync(s.dir))
    .flatMap((s) => [join(enlaces, s.nombre), s.dir]);
}
