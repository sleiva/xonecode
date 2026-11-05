import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepararNodeDeRedLocal } from "./nodeDeRedLocal.js";

function escena(contenido = "node de origen v1") {
  const base = mkdtempSync(join(tmpdir(), "red-local-"));
  const origen = join(base, "node");
  writeFileSync(origen, contenido);
  const casa = join(base, "casa");
  const firmadas: string[] = [];
  const abiertas: { app: string; argumentos: readonly string[] }[] = [];
  const informes: string[] = [];
  const deps = {
    casa,
    origen,
    firmar: (app: string) => void firmadas.push(app),
    abrir: (app: string, argumentos: readonly string[]) => void abiertas.push({ app, argumentos }),
    destinos: () => ["101.101.101.1"],
    informar: (t: string) => void informes.push(t),
  };
  const app = join(casa, "red-local", "XOneCodeNode.app");
  return { base, origen, casa, app, deps, firmadas, abiertas, informes };
}

describe("prepararNodeDeRedLocal", () => {
  it("la primera vez monta la app con una copia del node, la firma y la ABRE una vez para que macOS pregunte", () => {
    const e = escena();
    const r = prepararNodeDeRedLocal(e.deps);
    expect(r).toEqual({ node: join(e.app, "Contents", "MacOS", "node") });
    expect(readFileSync(join(e.app, "Contents", "MacOS", "node"), "utf8")).toBe("node de origen v1");
    expect(readFileSync(join(e.app, "Contents", "Info.plist"), "utf8")).toContain("NSLocalNetworkUsageDescription");
    // Se firma la temporal y se renombra después: nunca queda una app a medias en su sitio.
    expect(e.firmadas).toHaveLength(1);
    expect(e.firmadas[0]).not.toBe(e.app);
    expect(e.abiertas).toHaveLength(1);
    expect(e.abiertas[0]!.app).toBe(e.app);
    expect(e.abiertas[0]!.argumentos[0]).toBe("-e");
    expect(e.informes.join("\n")).toContain("permítelo");
  });

  it("la segunda vez, con el mismo node, ni copia ni firma ni pregunta", () => {
    const e = escena();
    prepararNodeDeRedLocal(e.deps);
    const otra = { ...e.deps, firmar: () => { throw new Error("no debería firmar"); }, abrir: () => { throw new Error("no debería abrir"); } };
    expect(prepararNodeDeRedLocal(otra)).toEqual({ node: join(e.app, "Contents", "MacOS", "node") });
  });

  it("si cambia el node de origen (una actualización), se rehace y se vuelve a preguntar", () => {
    const e = escena();
    prepararNodeDeRedLocal(e.deps);
    writeFileSync(e.origen, "node de origen v2, otro tamaño");
    prepararNodeDeRedLocal(e.deps);
    expect(readFileSync(join(e.app, "Contents", "MacOS", "node"), "utf8")).toBe("node de origen v2, otro tamaño");
    expect(e.firmadas).toHaveLength(2);
    expect(e.abiertas).toHaveLength(2);
  });

  it("ADOPTA una app montada a mano con el mismo node: no la rehace (perdería el permiso que ya tiene)", () => {
    const e = escena();
    mkdirSync(join(e.app, "Contents", "MacOS"), { recursive: true });
    writeFileSync(join(e.app, "Contents", "MacOS", "node"), "node de origen v1");
    writeFileSync(join(e.app, "Contents", "Info.plist"), "la de a mano");
    expect(prepararNodeDeRedLocal(e.deps)).toEqual({ node: join(e.app, "Contents", "MacOS", "node") });
    expect(e.firmadas).toEqual([]);
    expect(e.abiertas).toEqual([]);
    expect(readFileSync(join(e.app, "Contents", "Info.plist"), "utf8")).toBe("la de a mano");
    expect(existsSync(join(e.casa, "red-local", "origen.json"))).toBe(true);
  });

  it("solo con la fecha cambiada y el mismo contenido, también se adopta", () => {
    const e = escena();
    prepararNodeDeRedLocal(e.deps);
    utimesSync(e.origen, new Date(), new Date(Date.now() + 60_000));
    prepararNodeDeRedLocal(e.deps);
    expect(e.firmadas).toHaveLength(1);
  });

  it("falla ABIERTO: si no se puede firmar, dice el motivo y no deja la app a medias", () => {
    const e = escena();
    const r = prepararNodeDeRedLocal({ ...e.deps, firmar: () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); } });
    expect(r).toEqual({ motivo: "ENOENT" });
    expect(existsSync(e.app)).toBe(false);
    expect(readdirSync(join(e.casa, "red-local"))).toEqual([]);
  });

  it("sin red local a la que llamar, monta la app pero no la abre", () => {
    const e = escena();
    prepararNodeDeRedLocal({ ...e.deps, destinos: () => [] });
    expect(e.abiertas).toEqual([]);
  });
});
