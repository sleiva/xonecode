import { describe, expect, it } from "vitest";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { actividadDeItemDeCodex } from "./actividadDeCodex.js";

/** Las formas son las de una pasada REAL de codex-cli 0.152.1; solo cambian las rutas. */
const proyecto = realpathSync(mkdtempSync(join(tmpdir(), "xc-codex-act-")));
const comando = (acciones: unknown[], extra: Record<string, unknown> = {}) => ({
  type: "commandExecution",
  id: "exec-1",
  command: "/bin/zsh -lc \"nl -ba app.xml\"",
  cwd: proyecto,
  status: "completed",
  exitCode: 0,
  commandActions: acciones,
  ...extra,
});

describe("lo que Codex hace, en líneas de actividad", () => {
  it("una lectura del proyecto es `read_file` con la ruta VIRTUAL, relativa o absoluta", () => {
    const { tools } = actividadDeItemDeCodex(
      comando([
        { type: "read", command: "nl -ba app.xml", name: "app.xml", path: "app.xml" },
        { type: "read", command: `nl -ba ${proyecto}/EntradaApp.xne`, name: "EntradaApp.xne", path: `${proyecto}/EntradaApp.xne` },
      ]),
      proyecto
    );
    expect(tools).toEqual([
      { nombre: "read_file", detalle: "/app.xml" },
      { nombre: "read_file", detalle: "/EntradaApp.xne" },
    ]);
  });

  it("una búsqueda es `grep` con su patrón", () => {
    const { tools } = actividadDeItemDeCodex(
      comando([{ type: "search", command: "rg -n -F '<entry-point' app.xml", query: "<entry-point", path: "app.xml" }]),
      proyecto
    );
    expect(tools).toEqual([{ nombre: "grep", detalle: "<entry-point" }]);
  });

  it("lo de FUERA del proyecto se cuenta sin decir dónde, y el comando NUNCA sale", () => {
    const fuera = "/Users/alguien/.agents/skills/xone-help-docs-v2/SKILL.md";
    const { tools } = actividadDeItemDeCodex(comando([{ type: "read", command: `sed -n '1,240p' ${fuera}`, name: "SKILL.md", path: fuera }]), proyecto);
    expect(tools).toEqual([{ nombre: "read_file" }]);
    expect(JSON.stringify(tools)).not.toContain("/Users/alguien");
  });

  it("sin clasificar, o de un tipo que no se conoce, es `execute` a secas", () => {
    expect(actividadDeItemDeCodex(comando([]), proyecto).tools).toEqual([{ nombre: "execute" }]);
    expect(actividadDeItemDeCodex(comando([{ type: "unknown", command: "make" }]), proyecto).tools).toEqual([{ nombre: "execute" }]);
  });

  it("solo lo que TERMINÓ: un comando fallido o en curso no se anuncia", () => {
    const accion = [{ type: "read", command: "cat .env", path: ".env" }];
    expect(actividadDeItemDeCodex(comando(accion, { status: "failed" }), proyecto).tools).toEqual([]);
    expect(actividadDeItemDeCodex(comando(accion, { status: "inProgress" }), proyecto).tools).toEqual([]);
  });

  it("lo que CUENTA mientras trabaja es su `commentary`; la respuesta final no", () => {
    expect(actividadDeItemDeCodex({ type: "agentMessage", phase: "commentary", text: "Miro app.xml." }, proyecto)).toEqual({ tools: [], razonamiento: "Miro app.xml." });
    expect(actividadDeItemDeCodex({ type: "agentMessage", phase: "final_answer", text: "EntradaApp" }, proyecto)).toEqual({ tools: [] });
    expect(actividadDeItemDeCodex({ type: "reasoning", summary: [], content: [] }, proyecto)).toEqual({ tools: [] });
  });
});
