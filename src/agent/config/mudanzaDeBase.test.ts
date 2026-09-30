import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { mudarBaseDeWorkspace, planDeCambioDeBaseEnDisco, type ProgresoDeMudanza } from "./mudanzaEnDisco.js";

let casaXonecode: string;
let viejo: string;
let nuevo: string;
let guardado: string | undefined;

/** Una copia bajada, con historia y un fichero binario grande para que el hash tenga trabajo. */
function copia(entorno: string, proyecto: string): string {
  const raiz = join(viejo, entorno, proyecto);
  mkdirSync(join(raiz, ".xonecode", "sesiones"), { recursive: true });
  mkdirSync(join(raiz, ".git", "objects"), { recursive: true });
  writeFileSync(join(raiz, "app.xne"), `<app>${proyecto}</app>`);
  writeFileSync(join(raiz, ".xonecode", "checkpoint.sqlite"), Buffer.alloc(256 * 1024, 7));
  writeFileSync(join(raiz, ".git", "HEAD"), "ref: refs/heads/master\n");
  return raiz;
}

function planear(): ReturnType<typeof planDeCambioDeBaseEnDisco> {
  return planDeCambioDeBaseEnDisco({ desde: viejo, hacia: nuevo, casaXonecode });
}

function mudar(extra: Partial<Parameters<typeof mudarBaseDeWorkspace>[0]> = {}) {
  return mudarBaseDeWorkspace({
    desde: viejo,
    hacia: nuevo,
    mudanzas: planear().mudanzas,
    casaXonecode,
    guardarWorkspace: (r) => void (guardado = r),
    ...extra,
  });
}

beforeEach(() => {
  const casa = mkdtempSync(join(tmpdir(), "xonecode-base-"));
  casaXonecode = join(casa, ".xonecode");
  viejo = join(casaXonecode, "workspace");
  nuevo = join(casa, "otro disco", "ws");
  mkdirSync(viejo, { recursive: true });
  guardado = undefined;
});

describe("mudarBaseDeWorkspace", () => {
  it("copia, verifica, guarda la base nueva y SOLO entonces borra el origen", async () => {
    copia("mcp.xone.dev", "Dieta");
    copia("mcp.xone.dev", "mRED");
    const fases: ProgresoDeMudanza["fase"][] = [];
    const r = await mudar({ progreso: (p) => void fases.push(p.fase) });

    expect(r).toEqual({ estado: "hecho", mudadas: 2, restos: [], avisos: [] });
    expect(guardado).toBe(nuevo);
    expect(readFileSync(join(nuevo, "mcp.xone.dev", "Dieta", "app.xne"), "utf8")).toBe("<app>Dieta</app>");
    expect(readFileSync(join(nuevo, "mcp.xone.dev", "mRED", ".xonecode", "checkpoint.sqlite")).length).toBe(256 * 1024);
    expect(existsSync(join(viejo, "mcp.xone.dev"))).toBe(false);
    // Ni temporales ni lápidas a la vista.
    expect(readdirSync(join(nuevo, "mcp.xone.dev")).sort()).toEqual(["Dieta", "mRED"]);
    expect(fases).toEqual(["comprobar", "copiar", "verificar", "copiar", "verificar", "borrar", "borrar"]);
  });

  it("una copia que no sale IGUAL aborta todo: el origen intacto, la base sin tocar, nada en el destino", async () => {
    copia("e", "A");
    copia("e", "B");
    const r = await mudar({
      // La segunda copia pierde un byte por el camino.
      copiar: async (desde, hacia) => {
        await cp(desde, hacia, { recursive: true });
        if (desde.endsWith("B")) writeFileSync(join(hacia, "app.xne"), "<app>B</app".padEnd(12));
      },
    });

    expect(r.estado).toBe("rechazado");
    expect(r.estado === "rechazado" && r.motivo).toContain("«B» no salió igual");
    expect(guardado).toBeUndefined();
    expect(readFileSync(join(viejo, "e", "A", "app.xne"), "utf8")).toBe("<app>A</app>");
    expect(readdirSync(join(nuevo, "e"))).toEqual([]);
  });

  it("un fichero de MÁS en la copia también es una diferencia", async () => {
    copia("e", "A");
    const r = await mudar({
      copiar: async (desde, hacia) => {
        cpSync(desde, hacia, { recursive: true });
        writeFileSync(join(hacia, "sobra.txt"), "x");
      },
    });
    expect(r.estado === "rechazado" && r.motivo).toContain("de más");
  });

  it("sin sitio no empieza, y lo dice con las cifras", async () => {
    copia("e", "A");
    const r = await mudar({ espacioLibre: async () => 1024 });
    expect(r.estado === "rechazado" && r.motivo).toMatch(/no cabe: hay que copiar \d+ MB/);
    expect(existsSync(join(viejo, "e", "A"))).toBe(true);
  });

  it("sin proyectos, solo guarda la base nueva", async () => {
    expect(await mudar()).toEqual({ estado: "hecho", mudadas: 0, restos: [], avisos: [] });
    expect(guardado).toBe(nuevo);
  });

  it("reescribe `proyecto.raiz` del índice de tareas a la ruta nueva", async () => {
    const raiz = copia("e", "A");
    mkdirSync(join(casaXonecode, "tareas"), { recursive: true });
    writeFileSync(join(casaXonecode, "tareas", "indice.json"), JSON.stringify([{ id: "t1", proyecto: { raiz } }]));
    await mudar();
    const indice = JSON.parse(readFileSync(join(casaXonecode, "tareas", "indice.json"), "utf8")) as { proyecto: { raiz: string } }[];
    expect(indice[0]!.proyecto.raiz).toBe(join(nuevo, "e", "A"));
  });

  it("el plan en disco ve las carpetas reales y no las ocultas", () => {
    copia("e", "A");
    mkdirSync(join(viejo, "e", ".A.borrando-1"), { recursive: true });
    expect(planear().mudanzas.map((m) => m.proyecto)).toEqual(["A"]);
  });
});

describe("mudarBaseDeWorkspace: el origen que no se deja borrar", () => {
  it("si guardar la base FALLA, la copia ya puesta se retira y un reintento no queda bloqueado", async () => {
    const origen = copia("webstudio", "Tienda");
    const r = await mudar({
      guardarWorkspace: () => {
        throw Object.assign(new Error("disco lleno"), { code: "ENOSPC" });
      },
    });
    expect(r).toEqual({ estado: "rechazado", motivo: expect.stringContaining("no se ha cambiado nada") });
    expect(existsSync(join(origen, "app.xne"))).toBe(true);
    // Nada en el destino, ni a la vista ni oculto: si quedara, el plan siguiente diría «ya hay
    // una copia de…» y cada reintento se bloquearía.
    expect(existsSync(join(nuevo, "webstudio", "Tienda"))).toBe(false);
    expect(readdirSync(join(nuevo, "webstudio"))).toEqual([]);
    expect(planear().motivo).toBeUndefined();
  });

  it("si ni así se puede retirar la copia, NO dice «no se ha cambiado nada»: dice qué quedó y dónde", async () => {
    // El fallo: la vuelta atrás se tragaba su error, quedaba una copia entera en la base nueva
    // y el resultado seguía diciendo que no se había cambiado nada.
    copia("webstudio", "Tienda");
    const r = await mudar({
      guardarWorkspace: () => {
        throw new Error("no");
      },
      retirar: async () => {
        throw Object.assign(new Error("ocupado"), { code: "EBUSY" });
      },
    });
    expect(r.estado).toBe("rechazado");
    const motivo = (r as { motivo: string }).motivo;
    expect(motivo).not.toContain("no se ha cambiado nada");
    expect(motivo).toContain("Tienda (webstudio)");
    expect(motivo).toMatch(/bórrala|a mano/);
    // Ninguna ruta de la máquina en el motivo: viaja por el cable.
    expect(motivo).not.toContain(nuevo);
  });

  it("si un programa tiene abierta una copia, el cambio YA está hecho y se dice como «restos»", async () => {
    copia("e", "A");
    copia("e", "B");
    const r = await mudar({
      enterrar: async (desde, lapida) => {
        if (desde.endsWith("B")) throw Object.assign(new Error("ocupado"), { code: "EBUSY" });
        const { rename } = await import("node:fs/promises");
        await rename(desde, lapida);
      },
    });
    expect(r).toEqual({ estado: "hecho", mudadas: 2, restos: ["B (e)"], avisos: [] });
    expect(guardado).toBe(nuevo);
    expect(existsSync(join(nuevo, "e", "B", "app.xne"))).toBe(true);
    expect(existsSync(join(viejo, "e", "A"))).toBe(false);
  });
});
