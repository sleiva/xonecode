import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import Database from "better-sqlite3";
import { unzipSync, strFromU8 } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import type { Tarea } from "../../core/tareas.js";
import { rutaDelCheckpointer } from "../../agent/sesiones/checkpointer.js";
import { SqliteSaver } from "../../vendor/sqliteSaver.js";
import { anotarActo, crearSesion } from "./sesiones.js";
import { escribirPaquete, listarSoporte, motivoParaNoExportar, type FuenteDeSoporte, type PedidoDeSoporte } from "./soporte.js";

let temporales: string[] = [];
afterEach(() => {
  for (const r of temporales) rmSync(r, { recursive: true, force: true });
  temporales = [];
});

const CHECKPOINT = (mensaje: string) =>
  ({ v: 4, id: "1", ts: new Date().toISOString(), channel_values: { messages: [mensaje] }, channel_versions: {}, versions_seen: {} }) as never;
const META = { source: "input", step: 0, parents: {} } as never;

/** Un proyecto de verdad en un temporal: ficheros, dos chats, trazas, checkpoint y una tarea. */
async function proyecto(): Promise<{ fuente: FuenteDeSoporte; raiz: string }> {
  const raiz = mkdtempSync(join(tmpdir(), "xc-soporte-"));
  temporales.push(raiz);
  mkdirSync(join(raiz, "colecciones"), { recursive: true });
  writeFileSync(join(raiz, "colecciones", "Login.xne"), "<coll name='Login'/>");
  mkdirSync(join(raiz, ".git"), { recursive: true });
  writeFileSync(join(raiz, ".git", "config"), "[core]");
  writeFileSync(join(raiz, ".env"), "SECRETO=1");

  crearSesion(raiz, "s1");
  anotarActo(raiz, "s1", { tipo: "usuario", texto: "arregla el login" });
  anotarActo(raiz, "s1", { tipo: "error", texto: "400 Bad Request" });
  crearSesion(raiz, "s2");
  anotarActo(raiz, "s2", { tipo: "usuario", texto: "otra cosa" });
  anotarActo(raiz, "s2", { tipo: "fin", ms: 1 });
  mkdirSync(join(raiz, ".xonecode", "sesiones", "s1", "artefactos"), { recursive: true });
  writeFileSync(join(raiz, ".xonecode", "sesiones", "s1", "artefactos", "diagrama.html"), "<svg/>");

  writeFileSync(
    join(raiz, ".xonecode", "traza-tools.jsonl"),
    [
      { v: 1, sesion: "x", chat: "s1", tipo: "corte", origen: "developer-xone", limite: 15 },
      { v: 1, sesion: "x", chat: "s2", tipo: "modelo" },
      { v: 1, sesion: "viejo", tipo: "modelo" },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n") + "\n",
  );

  const saver = SqliteSaver.fromConnString(rutaDelCheckpointer(raiz));
  await saver.put({ configurable: { thread_id: "s1", checkpoint_ns: "" } }, CHECKPOINT("raiz de s1"), META);
  await saver.put({ configurable: { thread_id: "s1", checkpoint_ns: "tools:abc" } }, CHECKPOINT("especialista de s1"), META);
  await saver.put({ configurable: { thread_id: "s2", checkpoint_ns: "" } }, CHECKPOINT("PRIVADO DE s2"), META);
  saver.db.close();

  const tarea = {
    id: "t1",
    proyecto: { id: "p1", nombre: "Demo", raiz },
    titulo: "Tarea",
    peticion: "haz",
    encargo: "haz",
    adjuntos: [],
    estado: "requiere-atencion",
    motivo: "falta X",
    sesion: "s1",
    creada: "2026-09-29T10:00:00Z",
  } as unknown as Tarea;

  return {
    raiz,
    fuente: { raiz, proyecto: "Demo", tareas: [tarea], sesionesEnVuelo: new Set(), raizEnVuelo: false, version: "0.17.2" },
  };
}

async function paquete(fuente: FuenteDeSoporte, pedido: PedidoDeSoporte): Promise<Record<string, Uint8Array>> {
  const salida = new PassThrough();
  const trozos: Buffer[] = [];
  salida.on("data", (t: Buffer) => trozos.push(t));
  await escribirPaquete(fuente, pedido, salida, new Date("2026-09-29T12:00:00Z"));
  salida.end();
  return unzipSync(new Uint8Array(Buffer.concat(trozos)));
}

const json = (zip: Record<string, Uint8Array>, ruta: string): any => JSON.parse(strFromU8(zip[ruta]!));

describe("soporte: el paquete de un chat", () => {
  it("lleva sus actos, su carpeta, SU hilo con los especialistas, SUS trazas y su análisis", async () => {
    const { fuente, raiz } = await proyecto();
    const zip = await paquete(fuente, { tipo: "chat", id: "s1" });
    const rutas = Object.keys(zip);
    expect(rutas).toEqual(
      expect.arrayContaining([
        "sesion/entrada.json",
        "sesion/actos.jsonl",
        "sesion/carpeta/artefactos/diagrama.html",
        "sesion/checkpoint.sqlite",
        "sesion/mensajes.json",
        "trazas/tools.jsonl",
        "analisis.json",
        "manifiesto.json",
      ]),
    );
    // Solo las líneas con SU chat: ni la de s2 ni la vieja sin chat.
    const lineas = strFromU8(zip["trazas/tools.jsonl"]!).trim().split("\n");
    expect(lineas).toHaveLength(1);
    expect(JSON.parse(lineas[0]!).chat).toBe("s1");
    // Los mensajes de los dos espacios del hilo, el de un especialista incluido.
    expect(json(zip, "sesion/mensajes.json")).toEqual({ "(raiz)": ["raiz de s1"], "tools:abc": ["especialista de s1"] });
    // El análisis ve el error del turno y el corte de su traza.
    const analisis = json(zip, "analisis.json");
    expect(analisis.gravedad).toBe("error");
    expect(analisis.hallazgos.map((h: { regla: string }) => h.regla)).toEqual(expect.arrayContaining(["turno-con-error", "corte-por-tope"]));
    // Ninguna entrada con una ruta de la máquina.
    expect(rutas.some((r) => r.includes(raiz) || r.startsWith("/") || /^[A-Za-z]:/.test(r))).toBe(false);
  });

  it("la base del chat está RECORTADA a su hilo: lo de otro chat no viaja", async () => {
    const { fuente } = await proyecto();
    const zip = await paquete(fuente, { tipo: "chat", id: "s1" });
    const copia = join(mkdtempSync(join(tmpdir(), "xc-soporte-db-")), "c.sqlite");
    temporales.push(join(copia, ".."));
    writeFileSync(copia, zip["sesion/checkpoint.sqlite"]!);
    const db = new Database(copia, { readonly: true });
    const hilos = (db.prepare("SELECT DISTINCT thread_id AS t FROM checkpoints").all() as { t: string }[]).map((f) => f.t);
    db.close();
    expect(hilos).toEqual(["s1"]);
    expect(Buffer.from(zip["sesion/checkpoint.sqlite"]!).includes("PRIVADO DE s2")).toBe(false);
  });

  it("con un turno EN VUELO se exporta igual, y el manifiesto lo dice", async () => {
    const { fuente } = await proyecto();
    const zip = await paquete({ ...fuente, sesionesEnVuelo: new Set(["s1"]) }, { tipo: "chat", id: "s1" });
    const manifiesto = json(zip, "manifiesto.json");
    expect(manifiesto).toMatchObject({ tipo: "chat", id: "s1", enVuelo: true, proyecto: "Demo", version: "0.17.2" });
    expect(manifiesto.avisos.join(" ")).toContain("en marcha");
  });
});

describe("soporte: una sesión de TrueForge", () => {
  it("sin filas en el checkpoint no mete base ni mensajes vacíos, y dice DÓNDE está su memoria", async () => {
    const { fuente, raiz } = await proyecto();
    crearSesion(raiz, "tf1");
    anotarActo(raiz, "tf1", { tipo: "usuario", texto: "hola" });
    mkdirSync(join(raiz, ".xonecode", "sesiones", "tf1"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "sesiones", "tf1", "memoria-trueforge.json"), JSON.stringify({ v: 1, context: [] }));
    const zip = await paquete(fuente, { tipo: "chat", id: "tf1" });
    expect(Object.keys(zip)).toContain("sesion/carpeta/memoria-trueforge.json");
    expect(zip["sesion/checkpoint.sqlite"]).toBeUndefined();
    expect(zip["sesion/mensajes.json"]).toBeUndefined();
    const avisos = json(zip, "manifiesto.json").avisos.join(" ");
    expect(avisos).toContain("sesion/carpeta/memoria-trueforge.json");
    expect(avisos).not.toContain("espacio raíz");
  });
});

describe("soporte: una descarga que se corta", () => {
  it("si quien descarga se va a medias, termina (con error) y BORRA su temporal", async () => {
    // Sin mirar `close`, el `drain` que nunca llega colgaría el manejador para siempre y el
    // temporal —con una copia del checkpoint— se quedaría en el disco.
    const { fuente } = await proyecto();
    writeFileSync(join(fuente.raiz, "grande.bin"), Buffer.alloc(4 * 1024 * 1024, 7));
    const temporales = () => readdirSync(tmpdir()).filter((n) => n.startsWith("xonecode-soporte-")).length;
    const antes = temporales();
    // Nadie lee: el búfer se llena enseguida y el empaquetador se queda esperando el `drain`.
    const salida = new PassThrough({ highWaterMark: 1024 });
    const enCurso = escribirPaquete(fuente, { tipo: "proyecto" }, salida);
    await new Promise((r) => setTimeout(r, 50));
    salida.destroy();
    await expect(enCurso).rejects.toThrow(/se cortó/);
    expect(temporales()).toBe(antes);
  });
});

describe("soporte: el paquete del proyecto", () => {
  it("lleva el código, .xonecode y la base en caliente; nunca .git ni .env", async () => {
    const { fuente } = await proyecto();
    const zip = await paquete(fuente, { tipo: "proyecto" });
    const rutas = Object.keys(zip);
    expect(rutas).toEqual(
      expect.arrayContaining([
        "proyecto/colecciones/Login.xne",
        "proyecto/.xonecode/sesiones/s1.jsonl",
        "proyecto/.xonecode/checkpoint.sqlite",
        "proyecto/.xonecode/traza-tools.jsonl",
        "tareas/t1/tarea.json",
        "analisis.json",
        "manifiesto.json",
      ]),
    );
    expect(rutas.filter((r) => r.includes(".git/") || r.endsWith(".env"))).toEqual([]);
    // La raíz ABSOLUTA de la tarea no viaja.
    expect(json(zip, "tareas/t1/tarea.json").proyecto).toEqual({ id: "p1", nombre: "Demo" });
    // La línea vieja sin chat solo se puede decir aquí, y se dice.
    expect(json(zip, "manifiesto.json").avisos.join(" ")).toContain("sin id de chat");
  });
});

describe("soporte: la tarea y el listado", () => {
  it("el paquete de una tarea lleva la tarea y el chat donde corrió", async () => {
    const { fuente } = await proyecto();
    const zip = await paquete(fuente, { tipo: "tarea", id: "t1" });
    expect(Object.keys(zip)).toEqual(expect.arrayContaining(["tarea/tarea.json", "chat/sesion/actos.jsonl", "chat/analisis.json"]));
    const reglas = json(zip, "chat/analisis.json").hallazgos.map((h: { regla: string }) => h.regla);
    expect(reglas).toContain("tarea-requiere-atencion");
  });

  it("lo que no existe en el índice del servidor no se exporta", async () => {
    const { fuente } = await proyecto();
    expect(motivoParaNoExportar(fuente, { tipo: "chat", id: "../../.env" })).toBeDefined();
    expect(motivoParaNoExportar(fuente, { tipo: "tarea", id: "otra" })).toBeDefined();
    expect(motivoParaNoExportar(fuente, { tipo: "chat", id: "s1" })).toBeUndefined();
  });

  it("el listado analiza cada chat y cada tarea", async () => {
    const { fuente } = await proyecto();
    const listado = await listarSoporte(fuente);
    expect(listado.chats.map((c) => [c.id, c.analisis.gravedad]).sort()).toEqual([
      ["s1", "error"],
      ["s2", "ok"],
    ]);
    expect(listado.tareas[0]).toMatchObject({ id: "t1", estado: "requiere-atencion", sesion: "s1" });
  });
});
