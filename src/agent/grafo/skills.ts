import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  lstatSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { unzipSync } from "fflate";
import { raizDelPaquete } from "../raizDelPaquete.js";
import { NOMBRE_CARPETA } from "../config/configEnDisco.js";
import { segmentoSeguro } from "../../core/settings.js";
import {
  escribirSkill,
  fusionarSkills,
  leerSkill,
  tokensDeSkill,
  type LecturaDeSkills,
  type OrigenDeSkill,
  type Skill,
  type SkillCargada,
} from "../../core/skills.js";
import { planDeInstalacion, rutaDeZipAceptable } from "../../core/zipDeSkill.js";
import type { SkillInfo, SkillsPort } from "../../core/ports.js";

/**
 * Las skills en disco: una carpeta por skill, con su `SKILL.md` dentro.
 *
 * **Tres raíces, no una.** El porqué de cada una y su precedencia están en
 * `core/skills.ts`; aquí vive solo dónde caen:
 *
 * - **De serie**: `<raíz del paquete>/skills/`. La raíz se BUSCA hacia arriba
 *   (`agent/raizDelPaquete.ts`) en vez de contarse con `..`: contarlos ataba este fichero a
 *   su profundidad, y moverlo de carpeta dejaba el catálogo vacío sin un error que leer. Se
 *   resuelve contra ESTE módulo y no contra el cwd, que en la v1 es el proyecto del cliente.
 * - **Global**: `~/.xonecode/skills/`.
 * - **Del proyecto**: `<raiz>/.xonecode/skills/`.
 *
 * Las dos del usuario heredan de `.xonecode/` las dos protecciones que aquí importan: está
 * denegada entera al agente (`permisosDe`) y **no sube nunca** a CloudStudio. Una skill es
 * configuración de la herramienta, no del proyecto XOne.
 *
 * Y el agente NO las lee por esa ruta: las ve montadas en `/skills/<nombre>/`
 * (`proyecto.ts#backendConSkills`), que es de solo lectura para él.
 */
export const RAIZ_SKILLS = join(raizDelPaquete(), "skills");

const CARPETA = "skills";

/** La carpeta de skills de una raíz cualquiera. */
export function rutaDeSkills(base: string): string {
  return join(base, NOMBRE_CARPETA, CARPETA);
}

/** La global. `homedir()` en el momento de la llamada, como el resto del repo: cachearla en
 *  una constante de módulo la congelaría para los tests que la cambian. */
export function rutaGlobalDeSkills(): string {
  return join(homedir(), NOMBRE_CARPETA, CARPETA);
}

/** Estimación de coste. Se reexporta con el nombre viejo: lo usan los evals. */
export const tokensDe = tokensDeSkill;

/**
 * Los ficheros que acompañan al `SKILL.md`, en rutas relativas con `/`, ordenadas.
 *
 * No recorre detrás de un enlace (`lstatSync`, y una carpeta que no se puede mirar se
 * salta): la misma línea que el árbol de Ficheros, y por lo mismo — un enlace dentro de la
 * carpeta de una skill puede apuntar a cualquier sitio de la máquina, y lo que se enseña es
 * lo que hay AQUÍ.
 */
function ficherosDeLaSkill(carpeta: string, tope = 200): string[] {
  const salida: string[] = [];
  const recorrer = (actual: string): void => {
    let entradas: string[];
    try {
      entradas = readdirSync(actual).sort();
    } catch {
      return;
    }
    for (const entrada of entradas) {
      if (salida.length >= tope) return;
      const completa = join(actual, entrada);
      let esCarpeta = false;
      try {
        // `lstatSync` y no `statSync`: el segundo SIGUE el enlace, así que un enlace a una
        // carpeta de cualquier sitio de la máquina se habría recorrido entero. Es la misma
        // línea, y el mismo motivo, que en `arbolDeProyecto.ts`. Un enlace a un fichero
        // cuenta como fichero y se nombra, que es lo que hay AQUÍ.
        esCarpeta = lstatSync(completa).isDirectory();
      } catch {
        continue;
      }
      if (esCarpeta) recorrer(completa);
      else if (completa !== join(carpeta, "SKILL.md")) {
        salida.push(relative(carpeta, completa).split(sep).join("/"));
      }
    }
  };
  recorrer(carpeta);
  return salida.sort().slice(0, tope);
}

/**
 * Lee una carpeta de skills.
 *
 * Una que no se puede leer o que no valida NO tumba la carga: se salta, se apunta el motivo
 * y las demás siguen — la misma postura que `leerCarpetaDeAgentes` con un `.md` a medio
 * escribir, y la que evita que una skill rota deje la consola sin ninguna.
 *
 * Y el nombre NO se valida aquí: rechazar al leer haría desaparecer una skill que funciona.
 * Se valida al GUARDAR, que es el único momento con alguien delante para arreglarlo — la
 * misma regla, y por el mismo motivo, que la del nombre de un subagente.
 */
export function leerCarpetaDeSkills(carpeta: string, origen: OrigenDeSkill): LecturaDeSkills {
  if (!existsSync(carpeta)) return { skills: [], problemas: [] };
  const skills: SkillCargada[] = [];
  const problemas: string[] = [];
  let entradas: string[];
  try {
    entradas = readdirSync(carpeta).sort();
  } catch {
    return { skills: [], problemas: [] };
  }
  for (const entrada of entradas) {
    const dir = join(carpeta, entrada);
    try {
      // `lstatSync` por lo mismo que en `ficherosDeLaSkill`: un enlace a una carpeta de
      // fuera no es una skill de esta raíz, y seguirlo la metería en el catálogo con el
      // origen equivocado.
      if (!lstatSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const skillMd = join(dir, "SKILL.md");
    if (!existsSync(skillMd)) {
      problemas.push(`${entrada}: no tiene SKILL.md dentro`);
      continue;
    }
    try {
      const leida = leerSkill(readFileSync(skillMd, "utf8"), entrada, origen, ficherosDeLaSkill(dir));
      if ("error" in leida) problemas.push(`${entrada}: ${leida.error}`);
      else skills.push(leida.skill);
    } catch {
      // El motivo de un error de Node lleva la ruta absoluta, y esto viaja por el cable.
      problemas.push(`${entrada}: no se pudo leer`);
    }
  }
  return { skills, problemas };
}

/**
 * Todas las skills en vigor, fundidas por nombre con el proyecto ganando.
 *
 * `raiz` ausente = no hay proyecto abierto, y entonces las del proyecto no existen. Es un
 * caso normal —el vestíbulo— y no un hueco: `ausente ≠ vacío` no aplica aquí porque lo que
 * falta es la CARPETA, no el dato.
 */
export function cargarSkills(raiz?: string): LecturaDeSkills {
  const serie = leerCarpetaDeSkills(RAIZ_SKILLS, "serie");
  const global = leerCarpetaDeSkills(rutaGlobalDeSkills(), "global");
  const proyecto =
    raiz === undefined
      ? { skills: [], problemas: [] }
      : leerCarpetaDeSkills(rutaDeSkills(raiz), "proyecto");
  return {
    skills: fusionarSkills(serie.skills, global.skills, proyecto.skills),
    problemas: [...serie.problemas, ...global.problemas, ...proyecto.problemas],
  };
}

/** Dónde vive cada skill en el disco, para montarla. Solo las del USUARIO: las de serie ya
 *  las cubre la raíz `/skills/` entera. */
export interface Montaje {
  nombre: string;
  dir: string;
}

/**
 * Las carpetas de las skills del USUARIO, para que `backendConSkills` las cuelgue una a una.
 *
 * Una a una y no una raíz más porque son DOS carpetas (la global y la del proyecto) que
 * tienen que verse como UNA sola ruta virtual, `/skills/`: el subagente declara `skills:
 * [mi-skill]` y eso se traduce a `/skills/mi-skill/` sin saber de dónde salió. Y porque el
 * proyecto gana sobre el global, que es lo que `cargarSkills` ya decidió — aquí solo se
 * respeta el resultado.
 */
export function skillsMontables(raiz?: string): Montaje[] {
  const de = (carpeta: string, origen: OrigenDeSkill): Map<string, string> =>
    new Map(leerCarpetaDeSkills(carpeta, origen).skills.map((s) => [s.nombre, join(carpeta, s.nombre)]));
  const montajes = new Map<string, string>([
    ...de(rutaGlobalDeSkills(), "global"),
    ...(raiz === undefined ? [] : de(rutaDeSkills(raiz), "proyecto")),
  ]);
  return [...montajes].map(([nombre, dir]) => ({ nombre, dir }));
}

/**
 * TODAS las skills con su carpeta REAL, las de serie incluidas, con la precedencia de siempre.
 *
 * No es lo mismo que `skillsMontables`, y confundirlas costó un turno entero: aquélla contesta
 * «qué carpetas hay que colgar de `/skills/` UNA A UNA», y las de serie no están ahí porque su
 * raíz se cuelga ENTERA en `backendConSkills`. Para el backend da igual; para quien necesita la
 * ruta de verdad de una skill —una shell, que no ve rutas virtuales— significaba que las nueve
 * de serie no existían. Medido: el agente recibió un PATH sin sus scripts, probó el nombre a
 * secas, falló, y acabó haciendo `find /` por el disco entero.
 *
 * El orden es el de la precedencia (`cargarSkills`): serie, luego global, luego proyecto, y el
 * último gana. Una skill del proyecto que se llame igual que una de serie tapa a la de serie
 * también aquí, que es lo que el agente ve por `/skills/`.
 */
export function skillsConRuta(raiz?: string): Montaje[] {
  const de = (carpeta: string, origen: OrigenDeSkill): Map<string, string> =>
    new Map(leerCarpetaDeSkills(carpeta, origen).skills.map((s) => [s.nombre, join(carpeta, s.nombre)]));
  const todas = new Map<string, string>([
    ...de(RAIZ_SKILLS, "serie"),
    ...de(rutaGlobalDeSkills(), "global"),
    ...(raiz === undefined ? [] : de(rutaDeSkills(raiz), "proyecto")),
  ]);
  return [...todas].map(([nombre, dir]) => ({ nombre, dir }));
}

/**
 * Escribe una skill del usuario. Devuelve el motivo si NO se escribió, nunca lanza.
 *
 * Tres negativas, y ninguna es de forma:
 *
 * - **Una de serie no se edita**: vive dentro del paquete instalado, así que el siguiente
 *   `npm install` se llevaría el cambio sin decir nada. La consola ofrece copiarla.
 * - **Un destino que existe es un NO**, venga de donde venga —de serie, global o del
 *   proyecto—: es el motivo honesto y cubre los tres. Sin esto, crear una skill llamada
 *   como una nuestra la tapaba en silencio, que es el agujero que el alta de subagentes ya
 *   pagó.
 * - **Y renombrar es `renameSync` y LUEGO escribir**, nunca escribir y luego borrar: un
 *   fallo entre los dos pasos deja UNA carpeta y no dos con las mismas instrucciones.
 */
export function guardarSkill(
  base: string,
  skill: Skill,
  renombrandoDe?: string
): { ok: true } | { error: string } {
  let nombre: string;
  try {
    nombre = segmentoSeguro(skill.nombre, "nombre de skill");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "el nombre no vale" };
  }
  const carpeta = rutaDeSkills(base);
  const destino = join(carpeta, nombre);
  const cambiaDeNombre = renombrandoDe !== undefined && renombrandoDe !== nombre;

  if (esDeSerie(nombre) && !existsSync(destino)) {
    return {
      error: `«${nombre}» es una skill que trae xonecode: elige otro nombre, o cópiala desde su ficha para partir de ella`,
    };
  }
  if ((cambiaDeNombre || renombrandoDe === undefined) && existsSync(destino)) {
    return { error: `ya hay una skill «${nombre}» aquí: elige otro nombre, o bórrala primero` };
  }

  try {
    if (cambiaDeNombre) {
      const origen = join(carpeta, segmentoSeguro(renombrandoDe, "nombre de skill"));
      if (existsSync(origen)) renameSync(origen, destino);
    }
    mkdirSync(destino, { recursive: true });
    writeFileSync(join(destino, "SKILL.md"), escribirSkill({ ...skill, nombre }), "utf8");
    return { ok: true };
  } catch {
    // El mensaje de Node lleva la ruta absoluta y esto viaja por el cable (`sinRutas`).
    return { error: `no se pudo escribir la skill «${nombre}»` };
  }
}

/** Borra una skill del usuario. `false` = no estaba. Una de serie no llega aquí: la corta
 *  el servidor, que es donde vive la guarda — esconder el icono es presentación. */
export function borrarSkill(base: string, nombre: string): boolean {
  let seguro: string;
  try {
    seguro = segmentoSeguro(nombre, "nombre de skill");
  } catch {
    return false;
  }
  const dir = join(rutaDeSkills(base), seguro);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

/** ¿La trae xonecode? Se pregunta al DISCO y no a una lista escrita a mano: la lista sería
 *  un segundo sitio que mantener, y el día que divergiera nadie se enteraría. */
export function esDeSerie(nombre: string): boolean {
  try {
    return existsSync(join(RAIZ_SKILLS, segmentoSeguro(nombre, "nombre de skill"), "SKILL.md"));
  } catch {
    return false;
  }
}

/**
 * El catálogo que ve el AGENTE: las tres raíces, fundidas.
 *
 * **No cachea.** La versión anterior sí lo hacía —eran seis ficheros del paquete que no
 * cambian a mitad de turno— y con las del usuario dentro eso dejó de ser cierto: se guarda
 * una skill desde Ajustes con la consola abierta, y una lista congelada dentro de este objeto
 * la dejaría fuera incluso de la siguiente construcción. Es la misma postura que `cargarAgentes`.
 *
 * **Lo que esto NO arregla**: construir el agente ocurre al abrir la sesión y en `/modelo`
 * (`turnoReal.ts#construir`), no en cada turno, así que la skill nueva sigue sin alcanzar a la
 * sesión que ya está abierta. Quitar la caché es condición necesaria y no suficiente; el
 * agujero es heredado y está anotado en CLAUDE.md.
 *
 * `raiz` ausente = sin proyecto: solo las de serie y las globales.
 */
export class SkillsEnDisco implements SkillsPort {
  constructor(private readonly raiz?: string) {}

  catalogo(): SkillInfo[] {
    return cargarSkills(this.raiz).skills.map((s) => ({
      nombre: s.nombre,
      descripcion: s.descripcion,
      tokens: s.tokens,
    }));
  }

  cargar(nombre: string): string {
    // El nombre es un SEGMENTO de ruta y aquí se concatena a tres carpetas distintas: sin
    // esta guarda un `../../` se leería un fichero de fuera de las tres. Que hoy no tenga
    // llamador (`SkillsPort.cargar()`) no es una razón para dejarlo abierto — es justo la
    // clase de función que mañana se cablea y nadie revisa.
    let seguro: string;
    try {
      seguro = segmentoSeguro(nombre, "nombre de skill");
    } catch {
      throw new Error(`«${nombre}» no vale como nombre de skill`);
    }
    for (const carpeta of [
      ...(this.raiz === undefined ? [] : [rutaDeSkills(this.raiz)]),
      rutaGlobalDeSkills(),
      RAIZ_SKILLS,
    ]) {
      const skillMd = join(carpeta, seguro, "SKILL.md");
      if (existsSync(skillMd)) return readFileSync(skillMd, "utf8");
    }
    const hay = this.catalogo()
      .map((s) => s.nombre)
      .join(", ");
    throw new Error(`no hay skill «${nombre}». Las que hay: ${hay || "(ninguna)"}`);
  }
}

/**
 * Instala una skill desde un `.zip`. Devuelve el motivo si no se instaló, nunca lanza.
 *
 * El reparto: **la REGLA de qué se acepta vive en `core/zipDeSkill.ts`** —pura y probada sin
 * un fichero delante— y aquí solo está lo que toca el disco. Es el mismo reparto que
 * `core/agentes.ts` con `agentesEnDisco.ts`, y por lo mismo: la parte que decide si una ruta
 * del zip puede escribirse es justo la que no puede depender de tener un zip a mano.
 *
 * Tres cosas que no son de forma:
 *
 * - **Se descomprime ENTERO en memoria y se comprueba ANTES de escribir nada.** Escribir
 *   según se descomprime dejaría media skill en disco cuando la entrada 40 resulta ser un
 *   `../`: un fallo a medias es peor que un no.
 * - **El destino se comprueba con las MISMAS dos reglas que `guardarSkill`** —un nombre de
 *   serie es un NO, un destino que existe es un NO—, porque instalar es otra forma de dar de
 *   alta y un segundo sitio donde decidir eso es donde uno de los dos se queda sin la regla.
 * - **Y cada ruta se vuelve a mirar al escribir**, aunque el plan ya la haya aceptado: es la
 *   disciplina de `escrituraExterna.ts` —las guardas se REAPLICAN, no se asumen— y aquí
 *   cuesta una llamada.
 */
export function instalarSkillDesdeZip(
  base: string,
  zip: Uint8Array,
  nombreDelFichero: string
): { ok: true; nombre: string } | { error: string } {
  let entradas: Record<string, Uint8Array>;
  try {
    entradas = unzipSync(zip);
  } catch {
    return { error: "no se pudo abrir el .zip: ¿es un zip de verdad?" };
  }

  // fflate devuelve también las carpetas, como entradas vacías acabadas en `/`. No son
  // ficheros que escribir y no tienen por qué pasar por la regla de forma.
  const ficheros = Object.entries(entradas).filter(([ruta]) => !ruta.endsWith("/"));
  const plan = planDeInstalacion(
    ficheros.map(([ruta, datos]) => ({ ruta, bytes: datos.length })),
    nombreDelFichero
  );
  if ("error" in plan) return plan;

  const destino = join(rutaDeSkills(base), plan.nombre);
  if (esDeSerie(plan.nombre) && !existsSync(destino)) {
    return {
      error: `«${plan.nombre}» es una skill que trae xonecode: renombra la carpeta del .zip para instalarla al lado`,
    };
  }
  if (existsSync(destino)) {
    return { error: `ya hay una skill «${plan.nombre}»: bórrala primero si quieres reemplazarla` };
  }

  try {
    for (const [ruta, datos] of ficheros) {
      const relativa = ruta.slice(plan.prefijo.length);
      // Se vuelve a mirar aunque el plan ya lo haya hecho: las guardas se REAPLICAN.
      if (!rutaDeZipAceptable(relativa)) return { error: "el .zip trae una ruta que no se puede escribir" };
      const salida = join(destino, ...relativa.split("/"));
      mkdirSync(dirname(salida), { recursive: true });
      writeFileSync(salida, datos);
    }
    return { ok: true, nombre: plan.nombre };
  } catch {
    // A medias es peor que nada: lo escrito se retira, para que no quede una carpeta con un
    // `SKILL.md` a medio copiar que el catálogo daría por buena.
    try {
      rmSync(destino, { recursive: true, force: true });
    } catch {
      // Si ni eso se puede, lo que se dice sigue siendo que no se instaló.
    }
    return { error: `no se pudo escribir la skill «${plan.nombre}»` };
  }
}
