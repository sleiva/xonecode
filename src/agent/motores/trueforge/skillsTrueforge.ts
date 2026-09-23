/**
 * Las skills de un agente de TrueForge: **las de SU `.md` y ninguna más**, la misma regla que en
 * deepagents, donde el orquestador no recibe ninguna y cada subagente recibe su catálogo declarado
 * (`xoneAgent.ts`: «los subagentes no heredan las skills del orquestador»).
 *
 * En deepagents las anuncia el `SkillsMiddleware` —nombre y descripción— y el agente lee el
 * `SKILL.md` cuando la necesita. TrueForge no tiene ese middleware, así que se anuncian en el prompt
 * con la misma forma: qué hay, para qué sirve y dónde leerlo. El contenido no se inyecta: son
 * decenas de miles de caracteres, y cargarlas todas en cada llamada es el gasto que la carga bajo
 * demanda existe para evitar.
 *
 * Puro: el catálogo entra por parámetro.
 */
import type { Agente } from "../../../core/agentes.js";
import type { SkillInfo } from "../../../core/ports.js";

export function anuncioDeSkills(agente: Pick<Agente, "skills">, catalogo: readonly SkillInfo[]): string {
  const porNombre = new Map(catalogo.map((s) => [s.nombre, s]));
  const suyas = agente.skills.flatMap((n) => {
    const s = porNombre.get(n);
    return s === undefined ? [] : [s];
  });
  if (suyas.length === 0) return "";
  return [
    "TUS SKILLS (léelas con read_file cuando el encargo las necesite, antes de actuar):",
    ...suyas.map((s) => `- ${s.nombre}: ${s.descripcion} — /skills/${s.nombre}/SKILL.md`),
  ].join("\n");
}
