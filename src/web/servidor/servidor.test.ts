import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { arrancarServidor, type ServidorWeb } from "./servidor.js";

let servidor: ServidorWeb | undefined;
afterEach(async () => { await servidor?.cerrar(); servidor = undefined; });

/**
 * Una petición con la ruta y el `Host` TAL CUAL, sin que nadie los normalice.
 *
 * Medido en node 22.22.3: `fetch` ignora un `Host` falseado (manda el real) y normaliza
 * el `..` de la ruta antes de enviarla. Las dos cosas convertirían los tests de DNS
 * rebinding y de recorrido en teatro: pasarían sin ejercitar la defensa. `http.request`
 * manda ambos crudos, que es lo que haría un atacante.
 */
function peticionCruda(
  opciones: { ruta: string; host?: string; metodo?: string }
): Promise<{ estado: number; cuerpo: string }> {
  return new Promise((resolver, rechazar) => {
    const peticion = request(
      {
        host: "127.0.0.1",
        port: servidor!.puerto,
        path: opciones.ruta,
        method: opciones.metodo ?? "GET",
        ...(opciones.host === undefined ? {} : { headers: { Host: opciones.host } }),
      },
      (respuesta) => {
        let cuerpo = "";
        respuesta.on("data", (trozo) => { cuerpo += trozo; });
        respuesta.on("end", () => resolver({ estado: respuesta.statusCode ?? 0, cuerpo }));
      }
    );
    peticion.on("error", rechazar);
    peticion.end();
  });
}

async function levantar(): Promise<{ base: string; token: string; raizEstaticos: string }> {
  const raizEstaticos = mkdtempSync(join(tmpdir(), "xonecode-dist-"));
  writeFileSync(join(raizEstaticos, "index.html"), "<!doctype html><title>x</title>");
  mkdirSync(join(raizEstaticos, ".xonecode"), { recursive: true });
  writeFileSync(join(raizEstaticos, ".xonecode", "secreto.json"), '{"token":"no"}');
  servidor = await arrancarServidor({ puerto: 0, raizEstaticos });
  return { base: `http://127.0.0.1:${servidor.puerto}`, token: servidor.token, raizEstaticos };
}

describe("servidor web", () => {
  it("escucha en loopback", async () => {
    // Comparar contra `base` (una cadena que el propio test construye) pasaría igual si
    // el servidor escuchara en `0.0.0.0`: no probaría nada. `direccion` es la dirección
    // de bind REAL que devuelve `servidorHttp.address()`.
    await levantar();
    expect(servidor!.direccion).toBe("127.0.0.1");
  });

  it("una ruta de API sin token es 401", async () => {
    const { base } = await levantar();
    const r = await fetch(`${base}/eventos`);
    expect(r.status).toBe(401);
  });

  it("el token de la URL se canjea por cookie HttpOnly y SameSite=Strict", async () => {
    const { base, token } = await levantar();
    const r = await fetch(`${base}/?t=${token}`);
    const cookie = r.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  /**
   * `--anfitrion`: la puerta que se abre A MANO para servir por un túnel. Sigue siendo una
   * lista de UNO y sin comodines — la comprobación de `Host` es lo único que para el DNS
   * rebinding, y «lo que acabe en .ngrok-free.app» la dejaría abierta a cualquiera que se
   * registre en ngrok.
   */
  it("con `anfitrion` se acepta ESE Host y ningún otro parecido", async () => {
    const raizEstaticos = mkdtempSync(join(tmpdir(), "xonecode-dist-"));
    writeFileSync(join(raizEstaticos, "index.html"), "<!doctype html><title>x</title>");
    servidor = await arrancarServidor({ puerto: 0, raizEstaticos, anfitrion: "tunel.ngrok-free.app" });
    const token = servidor.token;

    const bueno = await peticionCruda({ ruta: `/?t=${token}`, host: "tunel.ngrok-free.app" });
    expect(bueno.estado).toBe(200);
    // Un subdominio del mismo servicio NO cuela: sería el túnel de otra persona.
    const otro = await peticionCruda({ ruta: `/?t=${token}`, host: "otro.ngrok-free.app" });
    expect(otro.estado).toBe(403);
    // Y el loopback sigue valiendo: abrir el túnel no cierra la puerta de casa.
    const casa = await peticionCruda({ ruta: `/?t=${token}`, host: `127.0.0.1:${servidor.puerto}` });
    expect(casa.estado).toBe(200);
  });

  it("sin `anfitrion` no hay puerta que abrir: el mismo Host de túnel es 403", async () => {
    const { token } = await levantar();
    const { estado } = await peticionCruda({ ruta: `/?t=${token}`, host: "tunel.ngrok-free.app" });
    expect(estado).toBe(403);
  });

  it("un Host que no es loopback es 403: es la defensa contra DNS rebinding", async () => {
    const { token } = await levantar();
    // `fetch` NO sirve aquí: MEDIDO en node 22.22.3, ignora en silencio un `Host`
    // falseado y manda el real, así que el test pasaría sin probar nada. `http.request`
    // sí lo manda tal cual.
    const { estado } = await peticionCruda({ ruta: `/eventos?t=${token}`, host: "malo.example.com" });
    expect(estado).toBe(403);
  });

  it("un Origin ajeno es 403", async () => {
    const { base, token } = await levantar();
    const r = await fetch(`${base}/accion?t=${token}`, {
      method: "POST",
      headers: { Origin: "https://malo.example.com", "content-type": "application/json" },
      body: "{}",
    });
    expect(r.status).toBe(403);
  });

  it("un recorrido fuera de la raíz de estáticos es 403", async () => {
    const { token } = await levantar();
    // Tampoco vale `fetch`: MEDIDO, normaliza el `..` ANTES de enviar y el servidor
    // recibe `/etc/passwd`, o sea que nunca vería el recorrido. Con `http.request` la
    // ruta viaja cruda, que es lo que haría un atacante.
    const crudo = await peticionCruda({ ruta: `/../../../../etc/passwd?t=${token}` });
    expect(crudo.estado).toBe(403);
    // Y la forma que sí sobrevive a `fetch`: el recorrido percent-encoded.
    const codificado = await peticionCruda({ ruta: `/%2e%2e%2f%2e%2e%2fetc/passwd?t=${token}` });
    expect(codificado.estado).toBe(403);
  });

  it("NUNCA se sirve nada de .xonecode, aunque el fichero exista y esté dentro de la raíz", async () => {
    const { base, token } = await levantar();
    const r = await fetch(`${base}/.xonecode/secreto.json?t=${token}`);
    expect(r.status).toBe(403);
    expect(await r.text()).not.toContain("token");
  });

  it("un symlink dentro de la raíz que apunta fuera es 403: la contención es sobre la ruta RESUELTA", async () => {
    const { token, raizEstaticos } = await levantar();
    try {
      symlinkSync("/etc/hosts", join(raizEstaticos, "fuera.html"));
    } catch {
      // Sin privilegios de symlink (Windows sin modo desarrollador, por ejemplo): no hay
      // nada que crear, así que no hay nada que probar aquí — el test se salta solo.
      return;
    }
    const r = await fetch(`http://127.0.0.1:${servidor!.puerto}/fuera.html?t=${token}`);
    expect(r.status).toBe(403);
  });

  it("NUNCA se sirve .xonecode ni con otro CASO en la ruta", async () => {
    // MEDIDO: APFS (y NTFS por omisión) son insensibles a mayúsculas, y el
    // `realpathSync` de Node no normaliza el caso de un componente que no es un enlace
    // simbólico — un chequeo sensible a caso dejaría pasar `/.XONECODE/...` intacto.
    const { token } = await levantar();
    const { estado, cuerpo } = await peticionCruda({ ruta: `/.XONECODE/secreto.json?t=${token}` });
    expect(estado).toBe(403);
    expect(cuerpo).not.toContain("token");
  });

  it("POST a un estático es 405 y un fichero ausente es 404 vacío", async () => {
    const { base, token } = await levantar();
    expect((await fetch(`${base}/index.html?t=${token}`, { method: "POST" })).status).toBe(405);
    const r = await fetch(`${base}/no-existe.js?t=${token}`);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe("");
  });

  it("EADDRINUSE se cuenta con el puerto y la bandera, no con una traza", async () => {
    const { raizEstaticos } = await levantar();
    const ocupado = servidor!.puerto;
    await expect(arrancarServidor({ puerto: ocupado, raizEstaticos }))
      .rejects.toThrow(new RegExp(`${ocupado}[\\s\\S]*--puerto`));
  });
});
