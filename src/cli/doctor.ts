import { inspeccionar } from "../agent/entorno.js";
import { escribirEnStdout, type Escribir } from "./stdio.js";

/**
 * ¿Puede este sitio ser un proyecto XOne, y responde el simulador?
 *
 * Sale con código != 0 si falta algo imprescindible: es un diagnóstico, y uno que siempre
 * dice que sí no sirve de nada en CI.
 */
export async function cmdDoctor(escribir: Escribir = escribirEnStdout): Promise<number> {
  const e = await inspeccionar();
  const linea = (marca: string, texto: string): void => escribir(`  ${marca}  ${texto}\n`);

  escribir("--- el sitio ---\n");
  linea(e.esProyectoXone ? "✓" : "✗", `${e.raiz}${e.esProyectoXone ? "" : "  (no hay app.xml aquí)"}`);
  linea(e.colecciones > 0 ? "✓" : "·", `${e.colecciones} colección(es) .xne`);
  // La foto del ANTES se toma con un ÍNDICE DE GIT PRIVADO, así que basta con que HAYA
  // repo: no hace falta ni ser su raíz ni tener ningún commit (medido, `DISENO.md` §15).
  // Lo que sí se dice es cuándo el repo abarca más que el proyecto, porque eso cambia lo
  // que uno puede prometer sobre deshacer.
  if (!e.git.usable) {
    linea("⚠", "sin git: la foto del ANTES se hará por huellas de fichero (más lenta y sin diff)");
    linea(" ", "Para el modo git: `git init` aquí.");
  } else if (e.git.esRaiz) {
    linea("✓", "git: foto y diff por árbol privado, sin tocar tu índice");
  } else {
    linea("✓", `git: foto y diff por árbol privado (repo en ${e.git.raizRepo}, prefijo «${e.git.prefijo}»)`);
  }
  if (e.git.usable && !e.git.tieneCommits) {
    // No impide la foto —`write-tree` no necesita HEAD— pero sí las ramas y los worktrees.
    linea("·", "el repo no tiene commits: la foto funciona igual, pero no hay ramas ni worktrees");
  }
  if (e.vistasAplanadas.length > 0) {
    linea("·", `${e.vistasAplanadas.length} vista(s) aplanada(s) .xml — se le ocultarán al agente`);
  }

  escribir("--- el verificador ---\n");
  // El binario NO expone versión (`--version` responde «Comando desconocido»), así que
  // se dice la ruta y si responde. Inventar una versión sería peor que no darla.
  linea(e.simulador.responde ? "✓" : "✗", `${e.simulador.ruta}${e.simulador.responde ? " responde" : " NO responde"}`);

  const falta = !e.esProyectoXone || !e.simulador.responde;
  if (falta) escribir("\n✗ falta algo imprescindible: xonecode no puede trabajar aquí.\n");
  return falta ? 1 : 0;
}