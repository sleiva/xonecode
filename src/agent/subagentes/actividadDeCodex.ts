/**
 * Lo que Codex HACE mientras trabaja, en los eventos de siempre (`tool` y `razonamiento`).
 *
 * Sin esto, con Codex no se veía nada entre la delegación y su respuesta —medido en una pasada real:
 * cuatro comandos y dos comentarios, y la pantalla quieta—, cuando con Claude Code y OpenCode sí.
 *
 * **Todo sale de lo que Codex CLASIFICA, nunca del comando de shell.** Medido contra el app-server
 * real (codex-cli 0.152.1): cada `commandExecution` trae `commandActions`, con `type` `read` (y
 * `path`), `search` (y `query`) y los demás; y el comando trae la ruta de la máquina —
 * `sed -n '1,240p' /Users/…/SKILL.md`—, así que enseñarlo sería sacarla por el cable. De aquí sale una
 * línea NORMAL —`read_file`, `grep`, `ls`— con la ruta VIRTUAL por la MISMA función que Claude Code
 * (`escrituraExterna.ts#eventoDeToolExterna`), y una ruta de FUERA del proyecto no se dice.
 *
 * Solo se cuenta lo que terminó bien —`status: completed`—, que es el invariante de
 * `core/entrelazar.ts`: una línea que diga que leyó algo que no leyó afirma un hecho falso.
 *
 * **Límites declarados**: las escrituras (`fileChange`) no se anuncian aquí —ya pasan por la
 * aprobación con su diff, y su forma al terminar no está medida—, y el `reasoning` tampoco: en la
 * medida llegó siempre vacío. Lo que Codex va CONTANDO son sus `agentMessage` de fase `commentary`.
 */
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { eventoDeToolExterna } from "./escrituraExterna.js";

/** Cómo se llama cada acción de Codex con los nombres del harness. Lo que no está, es `execute`. */
const TOOL_DE_ACCION: Record<string, string> = {
  read: "Read",
  search: "Grep",
  listFiles: "ls",
};

/** Lo que sale de un `item/completed` de Codex: las tools que hizo y lo que contó. */
export function actividadDeItemDeCodex(
  item: unknown,
  cwd: string,
  real: (ruta: string) => string = realpathSync
): { tools: { nombre: string; detalle?: string }[]; razonamiento?: string } {
  if (typeof item !== "object" || item === null) return { tools: [] };
  const i = item as Record<string, unknown>;

  if (i["type"] === "agentMessage" && i["phase"] === "commentary" && typeof i["text"] === "string" && i["text"].trim() !== "") {
    return { tools: [], razonamiento: i["text"] };
  }

  if (i["type"] !== "commandExecution" || i["status"] !== "completed") return { tools: [] };
  // El `cwd` del comando es desde donde se resuelven sus rutas relativas («app.xml», «.»); si no
  // viene, el del proyecto.
  const desde = typeof i["cwd"] === "string" ? i["cwd"] : cwd;
  const acciones = Array.isArray(i["commandActions"]) ? i["commandActions"] : [];
  // Sin clasificar no hay nada que decir salvo que ejecutó algo: sin el comando, que lleva rutas.
  if (acciones.length === 0) return { tools: [{ nombre: "execute" }] };

  const tools = acciones.map((a): { nombre: string; detalle?: string } => {
    const accion = (typeof a === "object" && a !== null ? a : {}) as Record<string, unknown>;
    const tool = TOOL_DE_ACCION[String(accion["type"])];
    if (tool === undefined) return { nombre: "execute" };
    if (tool === "Grep") {
      return eventoDeToolExterna("Grep", typeof accion["query"] === "string" ? { pattern: accion["query"] } : {}, cwd, real);
    }
    const ruta = typeof accion["path"] === "string" && accion["path"] !== "" ? resolve(desde, accion["path"]) : undefined;
    return eventoDeToolExterna(tool, ruta === undefined ? {} : { file_path: ruta }, cwd, real);
  });
  return { tools };
}
