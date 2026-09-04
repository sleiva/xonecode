/**
 * Fichero APARTE de `cloudstudioMcp.test.ts` a propósito: los `vi.mock` de aquí sustituyen
 * `node:http` (`createServer`), `auth` del SDK MCP y `Client`/`StreamableHTTPClientTransport`
 * para el módulo ENTERO bajo prueba, y mezclarlos con el resto de tests de
 * `cloudstudioMcp.ts` —que sí quieren el `createServer` de verdad para `respuestaDeCallback`
 * y compañía— sería acoplar dos cosas que no tienen por qué vivir juntas.
 *
 * Lo que se prueba: la regresión real, medida al revisar el código a petición del
 * coordinador — `abrirCliente` llamaba a `esperarCallback` (hoy `escucharCallback`)
 * SIEMPRE, antes incluso de saber si `auth()` iba a redirigir. Eso ocupaba el puerto fijo
 * 7634 y armaba un temporizador de cinco minutos en CADA llamada, incluso con un token ya
 * válido que no iba a redirigir nunca — y dos llamadas seguidas (o solapadas, como listar
 * proyectos del mismo entorno en cada conexión del vestíbulo) chocarían por el mismo
 * puerto. No se prueba atando el puerto real (`respuestaDeCallback` ya explica por qué eso
 * es peligroso: una autorización de verdad en curso en la máquina haría fallar el test),
 * sino espiando `createServer` — si no se llama, no se ocupó nada.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const mocksAuth = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@modelcontextprotocol/sdk/client/auth.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@modelcontextprotocol/sdk/client/auth.js")>();
  return { ...original, auth: mocksAuth.auth };
});

const mocksCliente = vi.hoisted(() => ({ connect: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
vi.mock("@modelcontextprotocol/sdk/client/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@modelcontextprotocol/sdk/client/index.js")>();
  return {
    ...original,
    // Un doble mínimo: nada de esto habla con red de verdad. `abrirCliente` solo usa
    // `connect`/`close` de la instancia que construye.
    Client: class {
      connect = mocksCliente.connect;
      close = mocksCliente.close;
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@modelcontextprotocol/sdk/client/streamableHttp.js")>();
  return {
    ...original,
    StreamableHTTPClientTransport: class {
      close = vi.fn(async () => {});
    },
  };
});

const mocksHttp = vi.hoisted(() => ({ createServer: vi.fn() }));
vi.mock("node:http", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:http")>();
  return { ...original, createServer: mocksHttp.createServer };
});

import { sesionCloudStudio } from "./cloudstudioMcp.js";

afterEach(() => {
  mocksAuth.auth.mockReset();
  mocksCliente.connect.mockClear();
  mocksCliente.close.mockClear();
  mocksHttp.createServer.mockClear();
});

describe("abrirCliente — el puerto de callback, ocupado SOLO cuando hace falta", () => {
  it("con un token guardado y válido (`auth()` autoriza de una), NO se crea ningún servidor de callback", async () => {
    mocksAuth.auth.mockResolvedValue("AUTHORIZED");

    const sesion = await sesionCloudStudio("https://studio.example/mcp", {
      rutaAuth: "/no/existe/nunca/auth.json",
    });
    await sesion.cerrar();

    expect(mocksHttp.createServer).not.toHaveBeenCalled();
    // Con un solo `auth()` (sin `authorizationCode`) hay bastante: no hizo falta el
    // segundo intercambio del código.
    expect(mocksAuth.auth).toHaveBeenCalledTimes(1);
  });

  it("cuando `auth()` SÍ redirige, se arranca el servidor del callback", async () => {
    // No se espera el `codigo` de verdad (colgaría para siempre sin un callback real que
    // lo resuelva): el servidor de mentira que fabrica `createServer` no llama nunca al
    // manejador, así que la promesa de `escucharCallback` para en el `await callback.codigo`.
    // Lo que se afirma aquí es SOLO que el servidor se creó — el resto de la rama REDIRECT
    // ya lo prueba el resto de la suite de este agente por otros caminos (consola/vestíbulo).
    mocksAuth.auth.mockResolvedValueOnce("REDIRECT");
    const servidorDeMentira = {
      once: vi.fn(),
      listen: vi.fn((_puerto: number, _host: string, cb: () => void) => cb()),
      close: vi.fn(),
    };
    mocksHttp.createServer.mockReturnValue(servidorDeMentira);

    const promesa = sesionCloudStudio("https://studio.example/mcp", {
      rutaAuth: "/no/existe/nunca/auth.json",
      timeoutMs: 50,
    });

    // Se deja que el temporizador de la espera del callback venza (`timeoutMs: 50`) en vez
    // de dejar la promesa colgada: así `abrirCliente` termina solo, por el lado del error,
    // y el test no necesita un servidor de callback de verdad para cerrar el ciclo.
    await expect(promesa).rejects.toThrow(/se agotó la espera del login de CloudStudio/);
    expect(mocksHttp.createServer).toHaveBeenCalledTimes(1);
  });
});
