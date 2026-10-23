import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { apkDePrueba } from "../../core/__pruebas__/apk.js";
import { type FrameworkLocal, PAQUETE_DEL_FRAMEWORK } from "../../core/frameworkLocal.js";
import type { ClienteByxone } from "./byxoneEnRed.js";
import { carpetaDeFrameworks, rutaDeApk } from "./frameworkEnDisco.js";
import { instalarFramework } from "./instalacionDeFramework.js";
import type { ProcesoHijo } from "./procesosEnMaquina.js";

function hijoFalso() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const sucesos = new EventEmitter();
  const hijo = {
    stdout,
    stderr,
    stdin: { write: () => {}, end: () => {} },
    on: (evento: string, cb: (...a: unknown[]) => void) => void sucesos.on(evento, cb),
    kill: () => true,
  } as unknown as ProcesoHijo;
  return {
    hijo,
    salida: (texto: string) => stdout.emit("data", Buffer.from(texto)),
    cerrar: (codigo: number) => sucesos.emit("close", codigo),
  };
}

/** Una máquina con adb en el PATH de Homebrew, y un `adb` que contesta lo que se le diga. */
function maquina(respuesta: { salida: string; codigo: number }) {
  const llamadas: string[][] = [];
  const lanzar = (_b: string, args: string[]) => {
    llamadas.push(args);
    const h = hijoFalso();
    setTimeout(() => {
      h.salida(respuesta.salida);
      h.cerrar(respuesta.codigo);
    }, 0);
    return h.hijo;
  };
  return {
    llamadas,
    deps: {
      plataforma: "darwin",
      entorno: { PATH: "/opt/homebrew/bin" },
      home: "/Users/yo",
      existe: (r: string) => r === "/opt/homebrew/bin/adb",
      lanzar,
      matarGrupo: () => {},
    },
  };
}

/** Una copia local con UN APK del paquete pedido, ya anotado. */
function copiaLocal(paquete = PAQUETE_DEL_FRAMEWORK): { casa: string; local: FrameworkLocal } {
  const casa = mkdtempSync(join(tmpdir(), "framework-"));
  const apk = apkDePrueba(paquete);
  const sha256 = createHash("sha256").update(apk).digest("hex");
  mkdirSync(carpetaDeFrameworks(casa), { recursive: true });
  writeFileSync(rutaDeApk(sha256, casa), apk);
  return { casa, local: { titulo: "v5.0.5.8rel", ficheroId: 42, sha256, bytes: apk.length, bajado: "2026-10-07T00:00:00Z", paquete } };
}

describe("instalar el framework", () => {
  it("una versión local se instala con -r -g y sin desinstalar nada", async () => {
    const { casa, local } = copiaLocal();
    const m = maquina({ salida: "Performing Streamed Install\nSuccess\n", codigo: 0 });
    const t = instalarFramework({ serie: "emulator-5554", nombre: "Pixel", version: { origen: "local", local }, puedeDescargar: false, casa }, m.deps);
    expect(await t.terminado).toMatchObject({ estado: "ok" });
    expect(m.llamadas).toEqual([["-s", "emulator-5554", "install", "-r", "-g", rutaDeApk(local.sha256, casa)]]);
    expect(m.llamadas.flat()).not.toContain("uninstall");
  });

  it("un APK del OTRO flavor no llega a adb", async () => {
    const { casa, local } = copiaLocal("com.xone.android.developer.framework");
    const m = maquina({ salida: "Success\n", codigo: 0 });
    const t = instalarFramework({ serie: "s", nombre: "Pixel", version: { origen: "local", local }, puedeDescargar: false, casa }, m.deps);
    expect(await t.terminado).toMatchObject({ estado: "fallo", motivo: expect.stringContaining("dos frameworks") });
    expect(m.llamadas).toEqual([]);
  });

  it("sin permiso para descargar (una tarea de fondo), una del catálogo es un fallo sin tocar la red", async () => {
    let pedida = false;
    const cliente = { descargarApk: async () => ((pedida = true), { ok: false, motivo: "x" }) } as unknown as ClienteByxone;
    const m = maquina({ salida: "", codigo: 0 });
    const t = instalarFramework(
      { serie: "s", nombre: "Pixel", version: { origen: "catalogo", ficheroId: 9, titulo: "v5.0.6.0rel" }, puedeDescargar: false, cliente },
      m.deps,
    );
    expect(await t.terminado).toMatchObject({ estado: "fallo", motivo: expect.stringContaining("Ajustes") });
    expect(pedida).toBe(false);
  });

  it("una del catálogo se baja y luego se instala la copia bajada", async () => {
    const { casa, local } = copiaLocal();
    const cliente = { descargarApk: async () => ({ ok: true, valor: local }) } as unknown as ClienteByxone;
    const m = maquina({ salida: "Success\n", codigo: 0 });
    const t = instalarFramework(
      { serie: "s", nombre: "Pixel", version: { origen: "catalogo", ficheroId: 42, titulo: "v5.0.5.8rel" }, puedeDescargar: true, cliente, casa },
      m.deps,
    );
    expect(await t.terminado).toMatchObject({ estado: "ok" });
    expect(m.llamadas[0]).toContain(rutaDeApk(local.sha256, casa));
  });

  it("una firma distinta dice que desinstalar BORRA los datos, y no lo hace", async () => {
    const { casa, local } = copiaLocal();
    const m = maquina({ salida: "Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match]\n", codigo: 1 });
    const t = instalarFramework({ serie: "s", nombre: "Pixel", version: { origen: "local", local }, puedeDescargar: false, casa }, m.deps);
    expect(await t.terminado).toMatchObject({ estado: "fallo", motivo: expect.stringContaining("BORRA los datos") });
    expect(m.llamadas).toHaveLength(1);
  });

  it("la ruta del APK que repite adb al fallar NO sale: ni en las líneas ni en el motivo", async () => {
    const { casa, local } = copiaLocal();
    const ruta = rutaDeApk(local.sha256, casa);
    const m = maquina({ salida: `adb: failed to install ${ruta}: Failure [INSTALL_FAILED_OTRA]\n`, codigo: 1 });
    const lineas: string[] = [];
    const t = instalarFramework(
      { serie: "s", nombre: "Pixel", version: { origen: "local", local }, puedeDescargar: false, casa },
      { ...m.deps, alSalirLinea: (l) => void lineas.push(l) },
    );
    const r = await t.terminado;
    expect([...lineas, r.motivo ?? ""].join("\n")).not.toContain(casa);
    expect(lineas.join("\n")).toContain("v5.0.5.8rel.apk");
  });

  it("un «Failure» con código 0 sigue siendo un fallo", async () => {
    const { casa, local } = copiaLocal();
    const m = maquina({ salida: "Failure [INSTALL_FAILED_VERSION_DOWNGRADE]\n", codigo: 0 });
    const t = instalarFramework({ serie: "s", nombre: "Pixel", version: { origen: "local", local }, puedeDescargar: false, casa }, m.deps);
    expect(await t.terminado).toMatchObject({ estado: "fallo", motivo: expect.stringContaining("MÁS NUEVA") });
  });

  it("bajar de versión solo a propósito, con -d", async () => {
    const { casa, local } = copiaLocal();
    const m = maquina({ salida: "Success\n", codigo: 0 });
    const t = instalarFramework(
      { serie: "s", nombre: "Pixel", version: { origen: "local", local }, puedeDescargar: false, bajarVersion: true, casa },
      m.deps,
    );
    await t.terminado;
    expect(m.llamadas[0]).toContain("-d");
  });

  it("sin adb, se dice dónde se arregla", async () => {
    const { casa, local } = copiaLocal();
    const m = maquina({ salida: "", codigo: 0 });
    const t = instalarFramework(
      { serie: "s", nombre: "Pixel", version: { origen: "local", local }, puedeDescargar: false, casa },
      { ...m.deps, existe: () => false },
    );
    expect(await t.terminado).toMatchObject({ estado: "fallo", motivo: expect.stringContaining("adb") });
  });
});
