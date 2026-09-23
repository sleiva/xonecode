import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { crearTraerDeLaMaquina } from "./traerDeLaMaquina.js";
import type { Artefacto } from "../../core/artefactos.js";

const temporales: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "traer-"));
  temporales.push(d);
  return d;
}
afterEach(() => {
  for (const d of temporales.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tool(carpeta?: string) {
  const anunciados: Artefacto[] = [];
  const t = crearTraerDeLaMaquina({ ...(carpeta === undefined ? {} : { carpeta }), alEscribir: (a) => anunciados.push(a) });
  return { t, anunciados };
}

describe("traer_de_la_maquina", () => {
  it("copia el fichero y dice con qué ruta se abre", async () => {
    const origen = tmp();
    const destino = tmp();
    writeFileSync(join(origen, "diseno.zip"), "PK\u0003\u0004contenido");

    const { t, anunciados } = tool(destino);
    const salida = String(await t.invoke({ ruta: join(origen, "diseno.zip") }));

    expect(salida).toContain("/artefactos/diseno.zip");
    expect(readFileSync(join(destino, "diseno.zip"), "utf8")).toBe("PK\u0003\u0004contenido");
    // Se ANUNCIA: cae en una carpeta que se escribe sin aprobación, y lo que nadie aprueba
    // no puede ser además mudo.
    expect(anunciados[0]).toMatchObject({ nombre: "diseno.zip", ruta: "/artefactos/diseno.zip" });
  });

  /** Un binario es la razón de ser: no sobrevive a un `read_file` + `write_file`, que son de TEXTO. */
  it("un binario llega byte a byte", async () => {
    const origen = tmp();
    const destino = tmp();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe]);
    writeFileSync(join(origen, "foto.png"), bytes);

    await tool(destino).t.invoke({ ruta: join(origen, "foto.png") });

    expect(readFileSync(join(destino, "foto.png")).equals(bytes)).toBe(true);
  });

  /** El destino NO se recibe: se deriva. Con un destino por parámetro esto escribiría donde fuera. */
  it("el destino es siempre la carpeta de artefactos", async () => {
    const origen = tmp();
    const destino = tmp();
    const hondo = join(origen, "a", "b");
    mkdirSync(hondo, { recursive: true });
    writeFileSync(join(hondo, "x.txt"), "hola");

    await tool(destino).t.invoke({ ruta: join(hondo, "x.txt") });

    expect(existsSync(join(destino, "x.txt"))).toBe(true);
  });

  it("no se trae lo del propio harness", async () => {
    const origen = tmp();
    const destino = tmp();
    mkdirSync(join(origen, ".xonecode"), { recursive: true });
    writeFileSync(join(origen, ".xonecode", "auth.json"), '{"clave":"secreta"}');

    const salida = String(await tool(destino).t.invoke({ ruta: join(origen, ".xonecode", "auth.json") }));

    expect(salida).toMatch(/xonecode/);
    expect(existsSync(join(destino, "auth.json"))).toBe(false);
  });

  /** Un fallo se DEVUELVE en palabras, nunca se lanza, y sin la ruta de la máquina dentro. */
  it("un fichero que no está se cuenta, no se lanza", async () => {
    const destino = tmp();
    const salida = String(await tool(destino).t.invoke({ ruta: "/no/existe/en/ninguna/parte.zip" }));
    expect(salida).toMatch(/No pude abrir/);
  });

  it("una carpeta no es un fichero", async () => {
    const origen = tmp();
    const destino = tmp();
    expect(String(await tool(destino).t.invoke({ ruta: origen }))).toMatch(/no es un fichero/);
  });

  /** Traerlo dos veces no lo duplica ni lo pisa en silencio. */
  it("si ya está traído, lo dice", async () => {
    const origen = tmp();
    const destino = tmp();
    writeFileSync(join(origen, "x.zip"), "a");
    const { t } = tool(destino);
    await t.invoke({ ruta: join(origen, "x.zip") });
    expect(String(await t.invoke({ ruta: join(origen, "x.zip") }))).toMatch(/Ya está traído/);
  });

  /** Sin carpeta de artefactos no hay dónde dejarlo, y se dice en vez de reventar. */
  it("sin área de trabajo lo cuenta", async () => {
    expect(String(await tool(undefined).t.invoke({ ruta: "/tmp/x.zip" }))).toMatch(/no tiene carpeta/i);
  });
});
