import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { apkDePrueba } from "../../core/__pruebas__/apk.js";
import { PAQUETE_DEL_FRAMEWORK } from "../../core/frameworkLocal.js";
import { clienteByxone, credencialByxone } from "./byxoneEnRed.js";
import { carpetaDeFrameworks, leerFrameworksLocales, rutaDeApk } from "./frameworkEnDisco.js";

const CREDENCIAL = { clientId: "xcode-read", secreto: "s" };
const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/** Un byXOne de mentira: una ficha y su binario, y las peticiones que recibió. */
function servidor(apk: Uint8Array, ficha: Record<string, unknown> = {}) {
  const pedidas: { url: string; cabeceras: Record<string, string> }[] = [];
  const llamar = (async (url: string, init?: RequestInit) => {
    pedidas.push({ url, cabeceras: { ...(init?.headers as Record<string, string>) } });
    if (url.endsWith("/api/files/42")) {
      return new Response(JSON.stringify({ id: 42, displayName: "v5.0.5.8rel-frame.apk", sizeBytes: apk.length, sha256: sha(apk), ...ficha }));
    }
    if (url.endsWith("/api/files/42/download")) return new Response(apk);
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  return { llamar, pedidas };
}

const casa = (): string => mkdtempSync(join(tmpdir(), "byxone-"));

describe("descargar un APK a la copia local", () => {
  it("baja, comprueba el sha y el paquete, y lo anota con su sha como nombre", async () => {
    const apk = apkDePrueba(PAQUETE_DEL_FRAMEWORK);
    const { llamar, pedidas } = servidor(apk);
    const yo = casa();
    const lineas: string[] = [];
    const r = await clienteByxone(CREDENCIAL, { fetch: llamar, casa: yo }).descargarApk(42, "v5.0.5.8rel", { alSalirLinea: (l) => lineas.push(l) });

    expect(r).toMatchObject({ ok: true, valor: { titulo: "v5.0.5.8rel", ficheroId: 42, sha256: sha(apk), paquete: PAQUETE_DEL_FRAMEWORK } });
    expect(existsSync(rutaDeApk(sha(apk), yo))).toBe(true);
    expect(leerFrameworksLocales(yo)).toHaveLength(1);
    // Cada petición FIRMADA, con un nonce distinto.
    expect(pedidas.every((p) => p.cabeceras["X-Client-Id"] === "xcode-read" && p.cabeceras["X-Signature"] !== undefined)).toBe(true);
    expect(new Set(pedidas.map((p) => p.cabeceras["X-Nonce"])).size).toBe(pedidas.length);
    expect(lineas.some((l) => l.includes("comprobada"))).toBe(true);
  });

  it("un sha distinto del de la ficha es un fallo y no deja NADA en la carpeta", async () => {
    const apk = apkDePrueba(PAQUETE_DEL_FRAMEWORK);
    const { llamar } = servidor(apk, { sha256: "0".repeat(64) });
    const yo = casa();
    const r = await clienteByxone(CREDENCIAL, { fetch: llamar, casa: yo }).descargarApk(42, "v5.0.5.8rel", {});
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("sha256") });
    expect(readdirSync(carpetaDeFrameworks(yo))).toEqual([]);
  });

  it("si llega MÁS de lo que dice la ficha, se corta", async () => {
    const apk = apkDePrueba(PAQUETE_DEL_FRAMEWORK);
    const { llamar } = servidor(apk, { sizeBytes: 10 });
    const yo = casa();
    const r = await clienteByxone(CREDENCIAL, { fetch: llamar, casa: yo }).descargarApk(42, "v5.0.5.8rel", {});
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("pesa más") });
    expect(readdirSync(carpetaDeFrameworks(yo))).toEqual([]);
  });

  it("con el mismo sha ya en disco, no se vuelve a bajar", async () => {
    const apk = apkDePrueba(PAQUETE_DEL_FRAMEWORK);
    const { llamar, pedidas } = servidor(apk);
    const yo = casa();
    mkdirSync(carpetaDeFrameworks(yo), { recursive: true });
    writeFileSync(rutaDeApk(sha(apk), yo), apk);
    const r = await clienteByxone(CREDENCIAL, { fetch: llamar, casa: yo }).descargarApk(42, "v5.0.5.8rel", {});
    expect(r.ok).toBe(true);
    expect(pedidas.some((p) => p.url.endsWith("/download"))).toBe(false);
  });

  it("un 404 dice lo que dice el servicio, sin confirmar que exista", async () => {
    const { llamar } = servidor(apkDePrueba(PAQUETE_DEL_FRAMEWORK));
    const r = await clienteByxone(CREDENCIAL, { fetch: llamar, casa: casa() }).ficha(7);
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("no tiene ese fichero") });
  });

  it("un 401 con su código se traduce a una frase", async () => {
    const llamar = (async () => new Response(JSON.stringify({ error: "FUERA_DE_VENTANA (400s)" }), { status: 401 })) as typeof fetch;
    const r = await clienteByxone(CREDENCIAL, { fetch: llamar, casa: casa() }).ficha(42);
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("reloj") });
  });
});

describe("de dónde sale la credencial", () => {
  it("el fichero personal manda sobre el empaquetado; sin ninguno, se dice", () => {
    const yo = casa();
    const paquete = casa();
    mkdirSync(join(paquete, "dist"));
    writeFileSync(join(paquete, "dist", "byxone.json"), JSON.stringify({ clientId: "xcode-read", secreto: "p" }));
    expect(credencialByxone({ entorno: {}, casa: yo, raizDelPaquete: paquete })).toMatchObject({ origen: "empaquetada" });

    mkdirSync(join(yo, ".xonecode"));
    writeFileSync(join(yo, ".xonecode", "byxone.json"), JSON.stringify({ clientId: "mio", secreto: "m" }));
    expect(credencialByxone({ entorno: {}, casa: yo, raizDelPaquete: paquete })).toMatchObject({ origen: "personal", credencial: { clientId: "mio" } });

    expect(credencialByxone({ entorno: {}, casa: casa(), raizDelPaquete: casa() })).toHaveProperty("motivo");
  });

  it("un fichero personal ILEGIBLE se dice, no cae al empaquetado", () => {
    const yo = casa();
    mkdirSync(join(yo, ".xonecode"));
    writeFileSync(join(yo, ".xonecode", "byxone.json"), "{ esto no es json");
    const paquete = casa();
    mkdirSync(join(paquete, "dist"));
    writeFileSync(join(paquete, "dist", "byxone.json"), JSON.stringify({ clientId: "xcode-read", secreto: "p" }));
    expect(credencialByxone({ entorno: {}, casa: yo, raizDelPaquete: paquete })).toHaveProperty("motivo");
  });
});
