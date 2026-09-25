# Conectores MCP (conexión y configuración) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sección «Conectores» en Ajustes de la consola web que añade, autoriza (OAuth con registro dinámico), prueba y quita tres servidores MCP remotos de catálogo —deepwiki, jira, notion—, sin dar todavía sus tools a ningún agente.

**Architecture:** El catálogo, las formas del cable y las reglas (estado de un conector, validación del callback) son PURAS y viven en `src/core/conectores.ts`. El disco (qué está añadido; cliente registrado y tokens en un fichero 0600) y la red (probar = conectar + `listTools`; autorizar/completar con `auth()` del SDK) viven en `src/agent/conectores/`, detrás de UN servicio que se PASA a `arrancarConsolaWeb` por opción (`conectores?`), compuesto en producción por una función `…Cableado` con test propio. El callback OAuth es una ruta PÚBLICA del servidor web (sin cookie: la cookie es `SameSite=Strict` y la redirección llega de otro sitio), autenticada por el `state` de un solo uso.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` 1.30 (`client/auth.js`, `client/streamableHttp.js`, `client/sse.js`), `node:http`, React + Vite (cliente), vitest.

**Spec:** El diseño acordado en la conversación del 24-09-2026 (resumido en «Global Constraints»); lo medido contra los servidores reales ese día está en la Task 9.

## Global Constraints

- **Catálogo exacto** (medido el 24-09-2026):
  - `deepwiki` — `https://mcp.deepwiki.com/mcp` — sin autenticación — «Lee la documentación y pregunta sobre cualquier repositorio público de GitHub.»
  - `jira` — `https://mcp.atlassian.com/v1/mcp` — OAuth (DCR + PKCE S256) — «Busca, lee, crea y actualiza incidencias de Jira.»
  - `notion` — `https://mcp.notion.com/mcp` — OAuth (DCR + PKCE S256) — «Busca páginas, lee contenido, consulta bases de datos y crea páginas.»
- **Ningún token, ninguna URL de autorización y ningún `code` viaja por el cable** ni aparece en un `informar`, un log o una página de respuesta. La URL de autorización se abre con `abrirEnSistema` (`src/agent/cloudstudio/cloudstudioMcp.ts`) en la máquina de la consola.
- **Motivos de fallo sin contenido remoto**: el `motivo` de «no responde» es una frase NUESTRA más, como mucho, el código HTTP o el `code` de Node (`codigoDe`, patrón de `sinRutas`) — nunca `error.message` del servidor remoto.
- **Ficheros**: `~/.xonecode/conectores.json` (qué está añadido, sin secretos) y `~/.xonecode/conectores-oauth.json` (cliente registrado, tokens, verificador PKCE), este último 0600 dentro de carpeta 0700, escritura temporal + `rename`. Contrato de `authEnDisco`: **una escritura nunca destruye lo que había** — ante un JSON ilegible o una `version` desconocida se PARA sin escribir (lanza un error propio).
- **Solo global**: nada de esto se lee de `.xonecode/` del proyecto.
- **Callback**: ruta `GET /mcp/oauth/callback`, `redirect_uri = http://127.0.0.1:<puerto real>/mcp/oauth/callback`. Pasa las comprobaciones de `Host` y `Origin` de SIEMPRE; se salta SOLO la de cookie. El `state` es aleatorio (32 bytes base64url), de un solo uso y caduca a los `TTL_DE_AUTORIZACION_MS` (10 min). La página que devuelve no repite nada de la query.
- **El cliente registrado va atado a su `redirect_uri`**: si el puerto cambia, se descarta y se vuelve a registrar.
- **Topes**: `TOPE_DE_CONEXION_MS` (30 s) para conectar + listar.
- **Estado en disco ≠ medida**: `estado` sale del disco (`sin-autorizacion` | `falta-autorizar` | `autorizado`); `prueba` es una FOTO con hora (`ok` + tools, o `motivo`), ausente = «no se ha probado». La etiqueta «Conectado» solo con `prueba.ok`.
- **Los tipos del cable se redeclaran** en `apps/web/src/tipos.ts` (la frontera prohíbe compartir módulo); `tipos.test.ts` compara los literales `clase:`. El `case` del store es lista BLANCA campo a campo.
- **Ningún color literal** fuera de `estilos/marca.css`/`splash.css` (`Barra.test.tsx` lo vigila); **nada de CDN**: los iconos de los conectores se dibujan en SVG propio (monograma), no se traen logos de fuera.
- **Límites declarados** (se dicen en pantalla y en docs): los conectores aún no llegan a ningún agente; por un túnel el callback no llega; de OAuth solo hay registro dinámico —un `client ID`/`secret` a mano no cabe—; la clave va como `Authorization: Bearer` y el nombre de la cabecera no se pregunta. La pieza siguiente —«Add MCP server»: un conector escrito a mano— cierra el de «no hay añadir servidor por URL».
- `npm test` sin red, sin clave y sin tocar la casa (`src/casaDePruebas.ts` ya muda el HOME).
- Comentarios en castellano, con la densidad y el tono del código de alrededor.

**User decisions (already made):**
- «creo que tiene que ser el orquestrador y que se puede escoger por proyecto en algun lado pero primero trabajemos en la coneccion y configuracion» → este plan NO cablea tools a agentes.
- «quiero empezar con deepwiki, jira y notion» → solo esos tres, de catálogo.
- «vale, adelante con el plan» sobre el diseño: callback como ruta pública autenticada por `state`, estados Conectado / Falta autorizar / No responde, lista de tools por conector, sin «Add MCP Server» todavía.

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `src/core/conectores.ts` (nuevo) | Catálogo, tipos del cable, `estadoDeConector`, `TTL_DE_AUTORIZACION_MS`, `TOPE_DE_CONEXION_MS`, `RUTA_CALLBACK_MCP`, `interpretarCallback` (puro) |
| `src/core/conectores.test.ts` (nuevo) | Tests de lo puro |
| `src/agent/conectores/conectoresEnDisco.ts` (nuevo) | Leer/escribir los dos ficheros, fail-closed |
| `src/agent/conectores/proveedorDeConector.ts` (nuevo) | `OAuthClientProvider` por conector sobre el fichero 0600 |
| `src/agent/conectores/servicioDeConectores.ts` (nuevo) | Añadir/quitar/probar/autorizar/completar/desconectar; pendientes de `state` en memoria; `servicioDeConectoresCableado` |
| `src/web/servidor/servidor.ts` | `registrarRutaPublica` (sin cookie, con Host/Origin) |
| `src/web/servidor/transporte.ts` | Mensajes `conectores` (al cliente) y `conector` (del cliente) |
| `src/web/servidor/arranque.ts` | Opción `conectores?`, ráfaga, manejador del mensaje, ruta del callback, cableado de producción |
| `apps/web/src/tipos.ts`, `apps/web/src/store.ts` | Redeclaración + `case "conectores"` |
| `apps/web/src/componentes/Conectores.tsx` + `.module.css` + `.test.tsx` (nuevos) | La sección |
| `apps/web/src/componentes/Ajustes.tsx`, `apps/web/src/App.tsx` | Sección nueva y cableado |
| `CLAUDE.md`, `docs/DECISIONES.md` | Invariantes y el porqué medido |

---

### Task 1: Núcleo puro de conectores

**Goal:** `src/core/conectores.ts` con el catálogo, las formas del cable y las dos reglas puras (estado y callback), probadas.

**Files:**
- Create: `src/core/conectores.ts`
- Test: `src/core/conectores.test.ts`

**Acceptance Criteria:**
- [ ] `CATALOGO_DE_CONECTORES` tiene exactamente `deepwiki`, `jira`, `notion` con las URL y autenticación de Global Constraints, y cada URL pasa `motivoDeEndpointInaceptable` (devuelve `undefined`).
- [ ] `estadoDeConector` devuelve `sin-autorizacion` para autenticación `ninguna`, `falta-autorizar` para OAuth sin tokens y `autorizado` con tokens.
- [ ] `interpretarCallback` acepta un `state` pendiente no caducado y lo CONSUME (segunda llamada con el mismo `state` → error), rechaza `state` desconocido, caducado, ausente, o con `error` en la query, y nunca devuelve en su `motivo` nada de la query.
- [ ] `src/core/imports.test.ts` sigue verde (core no importa `@modelcontextprotocol`).

**Verify:** `npx vitest run src/core/conectores.test.ts src/core/imports.test.ts` → todos PASS

**Steps:**

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/core/conectores.test.ts
import { describe, it, expect } from "vitest";
import {
  CATALOGO_DE_CONECTORES,
  conectorDelCatalogo,
  estadoDeConector,
  interpretarCallback,
  TTL_DE_AUTORIZACION_MS,
  type Pendiente,
} from "./conectores.js";
import { motivoDeEndpointInaceptable } from "./modelos.js";

describe("catálogo de conectores", () => {
  it("son los tres medidos, con su URL y su autenticación", () => {
    expect(CATALOGO_DE_CONECTORES.map((c) => [c.id, c.url, c.autenticacion])).toEqual([
      ["deepwiki", "https://mcp.deepwiki.com/mcp", "ninguna"],
      ["jira", "https://mcp.atlassian.com/v1/mcp", "oauth"],
      ["notion", "https://mcp.notion.com/mcp", "oauth"],
    ]);
  });
  it("cada URL pasa la MISMA regla que un MCP", () => {
    for (const c of CATALOGO_DE_CONECTORES) expect(motivoDeEndpointInaceptable(c.url)).toBeUndefined();
  });
  it("un id que no está en el catálogo no existe", () => {
    expect(conectorDelCatalogo("linear")).toBeUndefined();
    expect(conectorDelCatalogo("jira")?.nombre).toBe("Jira");
  });
});

describe("estadoDeConector", () => {
  const deepwiki = conectorDelCatalogo("deepwiki")!;
  const jira = conectorDelCatalogo("jira")!;
  it("sin autenticación no hay nada que autorizar", () => {
    expect(estadoDeConector(deepwiki, false)).toBe("sin-autorizacion");
  });
  it("OAuth sin tokens falta autorizar; con tokens está autorizado", () => {
    expect(estadoDeConector(jira, false)).toBe("falta-autorizar");
    expect(estadoDeConector(jira, true)).toBe("autorizado");
  });
});

describe("interpretarCallback", () => {
  const ahora = 1_000_000;
  const pendientes = (): Map<string, Pendiente> =>
    new Map([["s1", { id: "notion", expira: ahora + TTL_DE_AUTORIZACION_MS }]]);

  it("un state pendiente vale UNA vez", () => {
    const p = pendientes();
    expect(interpretarCallback(new URLSearchParams("code=abc&state=s1"), p, ahora)).toEqual({ ok: true, id: "notion", code: "abc" });
    expect(interpretarCallback(new URLSearchParams("code=abc&state=s1"), p, ahora).ok).toBe(false);
  });
  it("state desconocido, ausente o caducado es un no", () => {
    expect(interpretarCallback(new URLSearchParams("code=abc&state=otro"), pendientes(), ahora).ok).toBe(false);
    expect(interpretarCallback(new URLSearchParams("code=abc"), pendientes(), ahora).ok).toBe(false);
    expect(interpretarCallback(new URLSearchParams("code=abc&state=s1"), pendientes(), ahora + TTL_DE_AUTORIZACION_MS + 1).ok).toBe(false);
  });
  it("un error del proveedor consume el state y no repite lo recibido", () => {
    const p = pendientes();
    const r = interpretarCallback(new URLSearchParams("error=access_denied&error_description=<script>&state=s1"), p, ahora);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("script");
    expect(JSON.stringify(r)).not.toContain("access_denied");
    expect(p.has("s1")).toBe(false);
  });
  it("sin code no hay nada que canjear", () => {
    expect(interpretarCallback(new URLSearchParams("state=s1"), pendientes(), ahora).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/core/conectores.test.ts`
Expected: FAIL — «Failed to resolve import "./conectores.js"»

- [ ] **Step 3: Implementación mínima**

```ts
// src/core/conectores.ts
/**
 * Los conectores MCP de la consola: servidores REMOTOS de catálogo con los que se conecta
 * esta máquina. Puro a propósito —catálogo, formas del cable y reglas—; el disco y la red
 * viven en `agent/conectores/`.
 *
 * **Todavía no llegan a ningún agente.** Esta pieza es la conexión y la configuración; qué
 * agente recibe sus tools, y con qué política de aprobación, es la pieza siguiente.
 */

export type AutenticacionDeConector = "ninguna" | "oauth";

export interface ConectorDeCatalogo {
  readonly id: string;
  readonly nombre: string;
  readonly url: string;
  readonly descripcion: string;
  readonly autenticacion: AutenticacionDeConector;
}

/**
 * Medido contra los tres servidores el 24-09-2026: deepwiki contesta `listTools` sin
 * credenciales; Notion y Atlassian publican `registration_endpoint` y S256, y aceptan un
 * cliente público con `redirect_uri` en loopback. El transporte NO se declara: se prueba
 * `streamable-http` y, si no, `sse`, como hace TrueForge.
 */
export const CATALOGO_DE_CONECTORES: readonly ConectorDeCatalogo[] = [
  {
    id: "deepwiki",
    nombre: "DeepWiki",
    url: "https://mcp.deepwiki.com/mcp",
    descripcion: "Lee la documentación y pregunta sobre cualquier repositorio público de GitHub.",
    autenticacion: "ninguna",
  },
  {
    id: "jira",
    nombre: "Jira",
    url: "https://mcp.atlassian.com/v1/mcp",
    descripcion: "Busca, lee, crea y actualiza incidencias de Jira.",
    autenticacion: "oauth",
  },
  {
    id: "notion",
    nombre: "Notion",
    url: "https://mcp.notion.com/mcp",
    descripcion: "Busca páginas, lee contenido, consulta bases de datos y crea páginas.",
    autenticacion: "oauth",
  },
];

export function conectorDelCatalogo(id: string): ConectorDeCatalogo | undefined {
  return CATALOGO_DE_CONECTORES.find((c) => c.id === id);
}

/** Lo que dice el DISCO, no una medida: la medida es `PruebaDeConector`. */
export type EstadoDeConector = "sin-autorizacion" | "falta-autorizar" | "autorizado";

export function estadoDeConector(conector: ConectorDeCatalogo, hayTokens: boolean): EstadoDeConector {
  if (conector.autenticacion === "ninguna") return "sin-autorizacion";
  return hayTokens ? "autorizado" : "falta-autorizar";
}

/** Una tool tal como la enseña Ajustes. `soloLectura` ausente = el servidor no lo anota. */
export interface ToolDeConector {
  nombre: string;
  descripcion?: string;
  soloLectura?: boolean;
}

/** La última vez que se probó: una FOTO con hora. Ausente = no se ha probado. */
export type PruebaDeConector =
  | { cuando: number; ok: true; tools: ToolDeConector[] }
  | { cuando: number; ok: false; motivo: string };

/** Un conector AÑADIDO, en la forma del cable. Nunca lleva tokens ni URL de autorización. */
export interface ConectorDelCable {
  id: string;
  estado: EstadoDeConector;
  prueba?: PruebaDeConector;
  /** Hay una autorización abierta en el navegador esperando su callback. */
  autorizando?: boolean;
}

/** 10 min, el mismo plazo que TrueForge da a una autorización pendiente. */
export const TTL_DE_AUTORIZACION_MS = 10 * 60 * 1000;
/** Conectar + listar tools: más que esto es «no responde». */
export const TOPE_DE_CONEXION_MS = 30 * 1000;
/** La ruta del callback. PÚBLICA: la redirección llega sin cookie (`SameSite=Strict`). */
export const RUTA_CALLBACK_MCP = "/mcp/oauth/callback";

export interface Pendiente {
  id: string;
  expira: number;
}

export type ResultadoDeCallback = { ok: true; id: string; code: string } | { ok: false; motivo: string };

/**
 * La autenticación de la ruta pública ES el `state`: aleatorio, de un solo uso y con
 * plazo. Se CONSUME en cuanto se reconoce, vaya bien o mal, para que no se pueda repetir.
 *
 * El `motivo` es siempre una frase NUESTRA: la query la escribe quien redirige, y repetirla
 * en una página nuestra sería servir contenido ajeno desde el origen de la consola.
 */
export function interpretarCallback(query: URLSearchParams, pendientes: Map<string, Pendiente>, ahora: number): ResultadoDeCallback {
  const state = query.get("state");
  if (state === null) return { ok: false, motivo: "la respuesta no trae el identificador de la autorización" };
  const pendiente = pendientes.get(state);
  if (pendiente === undefined) return { ok: false, motivo: "esa autorización no la pidió esta consola, o ya se usó" };
  pendientes.delete(state);
  if (ahora > pendiente.expira) return { ok: false, motivo: "la autorización caducó: vuelve a pulsar Conectar" };
  if (query.get("error") !== null) return { ok: false, motivo: "el servicio no concedió el acceso" };
  const code = query.get("code");
  if (code === null || code.length === 0) return { ok: false, motivo: "la respuesta no trae código de autorización" };
  return { ok: true, id: pendiente.id, code };
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/core/conectores.test.ts src/core/imports.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/conectores.ts src/core/conectores.test.ts
git commit -m "feat(conectores): catálogo y reglas puras de los conectores MCP"
```

```json:metadata
{"files": ["src/core/conectores.ts", "src/core/conectores.test.ts"], "verifyCommand": "npx vitest run src/core/conectores.test.ts src/core/imports.test.ts", "acceptanceCriteria": ["catálogo exacto de tres y URLs aceptadas por motivoDeEndpointInaceptable", "estadoDeConector con los tres estados", "interpretarCallback consume el state y no repite la query", "imports.test.ts verde"], "modelTier": "mechanical"}
```

---

### Task 2: Los dos ficheros en disco, fail-closed

**Goal:** `src/agent/conectores/conectoresEnDisco.ts` lee y escribe `conectores.json` y `conectores-oauth.json` sin destruir nunca lo que había.

**Files:**
- Create: `src/agent/conectores/conectoresEnDisco.ts`
- Test: `src/agent/conectores/conectoresEnDisco.test.ts`

**Acceptance Criteria:**
- [ ] `leerAnadidos(casa)` devuelve `{anadidos:[], desconocidos:[]}` si no existe; los ids que no están en el catálogo se DESCARTAN al leer (y se devuelven aparte en `desconocidos`, para poder decirlo); un fichero ILEGIBLE devuelve además `ilegible: true` — ausente ≠ vacío: «Configurados · 0» sobre un fichero que no se entendió sería mentir.
- [ ] `anadirConector` / `quitarConector` escriben `{version:1, anadidos:[…]}` sin duplicar.
- [ ] `leerOAuth(casa, id)` / `guardarOAuth(casa, id, datos)` / `olvidarOAuth(casa, id)` tocan SOLO la clave de ese id; el fichero queda con modo `0o600` y su carpeta `0o700`.
- [ ] Ante JSON ilegible o `version` distinta de 1, las escrituras LANZAN `ErrorDeFicheroDeConectores` y el fichero queda byte a byte igual (test lo compara).
- [ ] La escritura es temporal + `renameSync` (un fallo no deja el fichero truncado).

**Verify:** `npx vitest run src/agent/conectores/conectoresEnDisco.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Escribir el test que falla** — con `mkdtempSync(join(tmpdir(), "conectores-"))` como `casa`:

```ts
// src/agent/conectores/conectoresEnDisco.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  leerAnadidos, anadirConector, quitarConector,
  leerOAuth, guardarOAuth, olvidarOAuth,
  rutaDeAnadidos, rutaDeOAuth, ErrorDeFicheroDeConectores,
} from "./conectoresEnDisco.js";

let casa: string;
beforeEach(() => { casa = mkdtempSync(join(tmpdir(), "conectores-")); });

describe("conectores añadidos", () => {
  it("sin fichero no hay ninguno", () => {
    expect(leerAnadidos(casa)).toEqual({ anadidos: [], desconocidos: [] });
  });
  it("añadir y quitar, sin duplicar", () => {
    anadirConector(casa, "jira");
    anadirConector(casa, "jira");
    anadirConector(casa, "deepwiki");
    expect(leerAnadidos(casa).anadidos).toEqual(["jira", "deepwiki"]);
    quitarConector(casa, "jira");
    expect(leerAnadidos(casa).anadidos).toEqual(["deepwiki"]);
  });
  it("un id fuera del catálogo se aparta al leer, no se inventa", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeAnadidos(casa), JSON.stringify({ version: 1, anadidos: ["jira", "linear"] }));
    expect(leerAnadidos(casa)).toEqual({ anadidos: ["jira"], desconocidos: ["linear"] });
  });
  it("un fichero ilegible NO se pisa", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeAnadidos(casa), "{roto");
    expect(() => anadirConector(casa, "jira")).toThrow(ErrorDeFicheroDeConectores);
    expect(readFileSync(rutaDeAnadidos(casa), "utf8")).toBe("{roto");
    expect(leerAnadidos(casa)).toEqual({ anadidos: [], desconocidos: [], ilegible: true });
  });
});

describe("estado OAuth", () => {
  it("cada conector toca SOLO lo suyo, y el fichero es 0600", () => {
    guardarOAuth(casa, "jira", { tokens: { access_token: "a", token_type: "Bearer" } });
    guardarOAuth(casa, "notion", { codeVerifier: "v" });
    expect(leerOAuth(casa, "jira").tokens?.access_token).toBe("a");
    expect(leerOAuth(casa, "notion").codeVerifier).toBe("v");
    expect(statSync(rutaDeOAuth(casa)).mode & 0o777).toBe(0o600);
    expect(statSync(join(casa, ".xonecode")).mode & 0o777).toBe(0o700);
    olvidarOAuth(casa, "jira");
    expect(leerOAuth(casa, "jira")).toEqual({});
    expect(leerOAuth(casa, "notion").codeVerifier).toBe("v");
  });
  it("una versión desconocida NO se pisa", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true, mode: 0o700 });
    writeFileSync(rutaDeOAuth(casa), JSON.stringify({ version: 9 }));
    expect(() => guardarOAuth(casa, "jira", {})).toThrow(ErrorDeFicheroDeConectores);
    expect(readFileSync(rutaDeOAuth(casa), "utf8")).toBe(JSON.stringify({ version: 9 }));
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — Run: `npx vitest run src/agent/conectores/conectoresEnDisco.test.ts` — Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementación**

```ts
// src/agent/conectores/conectoresEnDisco.ts
/**
 * Los dos ficheros de los conectores, en la casa del usuario y SOLO ahí.
 *
 * Dos y no uno porque contestan cosas distintas con permisos distintos: `conectores.json`
 * es configuración (qué está añadido) y `conectores-oauth.json` son secretos (cliente
 * registrado, tokens, verificador PKCE), 0600. Solo global: una definición en el proyecto
 * podría llevar un token a donde el proyecto dijera, la misma razón que los proveedores
 * personalizados.
 *
 * El contrato es el de `authEnDisco.ts`: **una escritura nunca destruye lo que había**. Un
 * JSON ilegible o de una versión que no conocemos se deja tal cual y la escritura LANZA.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { conectorDelCatalogo } from "../../core/conectores.js";

export class ErrorDeFicheroDeConectores extends Error {}

export function rutaDeAnadidos(casa: string): string { return join(casa, ".xonecode", "conectores.json"); }
export function rutaDeOAuth(casa: string): string { return join(casa, ".xonecode", "conectores-oauth.json"); }

/** Lo que se guarda de UN conector. `redirectUri` ata el cliente registrado a su puerto. */
export interface OAuthDeConector {
  clientInformation?: OAuthClientInformationMixed;
  redirectUri?: string;
  tokens?: OAuthTokens;
  codeVerifier?: string;
}

type Lectura<T> = { tipo: "ausente" } | { tipo: "ok"; valor: T } | { tipo: "ilegible" };

function leerJson(ruta: string): Lectura<Record<string, unknown>> {
  if (!existsSync(ruta)) return { tipo: "ausente" };
  try {
    const bruto: unknown = JSON.parse(readFileSync(ruta, "utf8"));
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return { tipo: "ilegible" };
    const objeto = bruto as Record<string, unknown>;
    return objeto.version === 1 ? { tipo: "ok", valor: objeto } : { tipo: "ilegible" };
  } catch {
    return { tipo: "ilegible" };
  }
}

function escribirAtomico(ruta: string, contenido: unknown): void {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  const temporal = `${ruta}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temporal, "wx", 0o600);
    writeFileSync(fd, JSON.stringify(contenido, null, 2) + "\n", "utf8");
    closeSync(fd);
    fd = undefined;
    renameSync(temporal, ruta);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporal); } catch { /* no llegó a crearse */ }
    throw error;
  }
}

function paraEscribir(ruta: string): Record<string, unknown> {
  const lectura = leerJson(ruta);
  if (lectura.tipo === "ilegible") {
    // No se nombra el contenido: puede llevar un token.
    throw new ErrorDeFicheroDeConectores(`${ruta} no se entiende y no se sobrescribe: revísalo o bórralo a mano`);
  }
  return lectura.tipo === "ok" ? lectura.valor : { version: 1 };
}

export function leerAnadidos(casa: string): { anadidos: string[]; desconocidos: string[]; ilegible?: true } {
  const lectura = leerJson(rutaDeAnadidos(casa));
  if (lectura.tipo === "ilegible") return { anadidos: [], desconocidos: [], ilegible: true };
  if (lectura.tipo !== "ok" || !Array.isArray(lectura.valor.anadidos)) return { anadidos: [], desconocidos: [] };
  const ids = lectura.valor.anadidos.filter((x): x is string => typeof x === "string");
  return {
    anadidos: ids.filter((id) => conectorDelCatalogo(id) !== undefined),
    desconocidos: ids.filter((id) => conectorDelCatalogo(id) === undefined),
  };
}

function idsCrudos(base: Record<string, unknown>): string[] {
  return Array.isArray(base.anadidos) ? base.anadidos.filter((x): x is string => typeof x === "string") : [];
}

export function anadirConector(casa: string, id: string): void {
  const ruta = rutaDeAnadidos(casa);
  const base = paraEscribir(ruta);
  const ids = idsCrudos(base);
  if (ids.includes(id)) return;
  escribirAtomico(ruta, { ...base, version: 1, anadidos: [...ids, id] });
}

export function quitarConector(casa: string, id: string): void {
  const ruta = rutaDeAnadidos(casa);
  const base = paraEscribir(ruta);
  const ids = idsCrudos(base);
  if (!ids.includes(id)) return;
  escribirAtomico(ruta, { ...base, version: 1, anadidos: ids.filter((x) => x !== id) });
}

function porConector(base: Record<string, unknown>): Record<string, OAuthDeConector> {
  const bruto = base.porConector;
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return {};
  return bruto as Record<string, OAuthDeConector>;
}

export function leerOAuth(casa: string, id: string): OAuthDeConector {
  const lectura = leerJson(rutaDeOAuth(casa));
  if (lectura.tipo !== "ok") return {};
  const datos = porConector(lectura.valor)[id];
  return typeof datos === "object" && datos !== null ? datos : {};
}

export function guardarOAuth(casa: string, id: string, datos: OAuthDeConector): void {
  const ruta = rutaDeOAuth(casa);
  const base = paraEscribir(ruta);
  escribirAtomico(ruta, { ...base, version: 1, porConector: { ...porConector(base), [id]: datos } });
}

export function olvidarOAuth(casa: string, id: string): void {
  const ruta = rutaDeOAuth(casa);
  const base = paraEscribir(ruta);
  const todos = porConector(base);
  if (!(id in todos)) return;
  const { [id]: _fuera, ...resto } = todos;
  escribirAtomico(ruta, { ...base, version: 1, porConector: resto });
}
```

- [ ] **Step 4: Ejecutar y ver que pasa** — Run: `npx vitest run src/agent/conectores/conectoresEnDisco.test.ts` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/conectores/
git commit -m "feat(conectores): los dos ficheros en la casa, 0600 y sin pisar lo que no se entiende"
```

```json:metadata
{"files": ["src/agent/conectores/conectoresEnDisco.ts", "src/agent/conectores/conectoresEnDisco.test.ts"], "verifyCommand": "npx vitest run src/agent/conectores/conectoresEnDisco.test.ts", "acceptanceCriteria": ["leerAnadidos descarta ids fuera del catálogo y los devuelve en desconocidos", "añadir/quitar sin duplicar", "OAuth por conector, 0600/0700", "ilegible o versión desconocida: lanza y no toca el fichero", "escritura temporal + rename"], "modelTier": "mechanical"}
```

---

### Task 3: Proveedor OAuth por conector

**Goal:** `ProveedorDeConector implements OAuthClientProvider` (SDK) sobre `conectoresEnDisco`, con el `state` nuestro y el cliente atado a su `redirect_uri`.

**Files:**
- Create: `src/agent/conectores/proveedorDeConector.ts`
- Test: `src/agent/conectores/proveedorDeConector.test.ts`

**Acceptance Criteria:**
- [ ] `clientMetadata` = `{client_name:"xonecode", redirect_uris:[redirectUrl], grant_types:["authorization_code","refresh_token"], response_types:["code"], token_endpoint_auth_method:"none"}` (cliente público, medido aceptado por Notion y Atlassian).
- [ ] Si el `redirectUri` guardado difiere del actual, `clientInformation()` devuelve `undefined` (fuerza registrar de nuevo) y al guardar el cliente nuevo se guarda también su `redirectUri`.
- [ ] `state()` devuelve el `state` que se le pasó al construir (lo genera el servicio, que es quien lo apunta como pendiente).
- [ ] `redirectToAuthorization(url)` NO abre nada: entrega la URL al callback `alRedirigir` inyectado.
- [ ] `invalidateCredentials("all"|"client"|"tokens"|"verifier")` borra lo suyo y lo persiste (patrón de `ProviderCloudStudio`, `cloudstudioMcp.ts:631-711`).
- [ ] `codeVerifier()` sin verificador guardado lanza con un mensaje que no incluye nada del fichero.

**Verify:** `npx vitest run src/agent/conectores/proveedorDeConector.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Test que falla** — casos: metadatos exactos; cliente guardado con `redirectUri: "http://127.0.0.1:1/x"` y proveedor construido con `http://127.0.0.1:2/x` → `clientInformation()` es `undefined`; `saveClientInformation({client_id:"c"})` → `leerOAuth(casa,id)` tiene `clientInformation.client_id === "c"` y `redirectUri` actual; `saveTokens` → `leerOAuth(...).tokens`; `invalidateCredentials("tokens")` → sin tokens y el cliente sigue; `redirectToAuthorization(new URL("https://x/a"))` → el espía recibe esa URL; `state()` → el pasado.

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProveedorDeConector } from "./proveedorDeConector.js";
import { guardarOAuth, leerOAuth } from "./conectoresEnDisco.js";

let casa: string;
beforeEach(() => { casa = mkdtempSync(join(tmpdir(), "prov-")); });
const nuevo = (redirect = "http://127.0.0.1:4200/mcp/oauth/callback", alRedirigir = (_: URL) => {}) =>
  new ProveedorDeConector({ casa, id: "notion", redirectUrl: redirect, state: "s1", alRedirigir });

describe("ProveedorDeConector", () => {
  it("cliente público con el redirect de ESTE arranque", () => {
    expect(nuevo().clientMetadata).toEqual({
      client_name: "xonecode",
      redirect_uris: ["http://127.0.0.1:4200/mcp/oauth/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });
  it("un cliente registrado para otro puerto no vale", () => {
    guardarOAuth(casa, "notion", { clientInformation: { client_id: "viejo" }, redirectUri: "http://127.0.0.1:1/mcp/oauth/callback" });
    expect(nuevo().clientInformation()).toBeUndefined();
  });
  it("guardar el cliente guarda también su redirect", () => {
    const p = nuevo();
    p.saveClientInformation({ client_id: "c" });
    expect(leerOAuth(casa, "notion")).toMatchObject({ clientInformation: { client_id: "c" }, redirectUri: "http://127.0.0.1:4200/mcp/oauth/callback" });
    expect(p.clientInformation()).toEqual({ client_id: "c" });
  });
  it("tokens, y olvidar solo los tokens", () => {
    const p = nuevo();
    p.saveClientInformation({ client_id: "c" });
    p.saveTokens({ access_token: "a", token_type: "Bearer" });
    expect(p.tokens()?.access_token).toBe("a");
    p.invalidateCredentials("tokens");
    expect(p.tokens()).toBeUndefined();
    expect(p.clientInformation()).toEqual({ client_id: "c" });
  });
  it("redirigir no abre nada: entrega la URL", () => {
    const vistas: URL[] = [];
    nuevo(undefined, (u) => vistas.push(u)).redirectToAuthorization(new URL("https://x/a"));
    expect(vistas.map(String)).toEqual(["https://x/a"]);
  });
  it("el state es el del servicio", () => {
    expect(nuevo().state()).toBe("s1");
  });
});
```

- [ ] **Step 2:** Run y ver FAIL.

- [ ] **Step 3: Implementación**

```ts
// src/agent/conectores/proveedorDeConector.ts
/**
 * El `OAuthClientProvider` del SDK para UN conector. El molde es `ProviderCloudStudio`
 * (`cloudstudioMcp.ts`), con tres diferencias que no son de forma:
 *  - **Cliente PÚBLICO** (`token_endpoint_auth_method: "none"`): no hay dónde guardar un
 *    secreto que valga más que el propio token, y Notion y Atlassian lo aceptan (medido).
 *  - **El cliente va atado a su `redirect_uri`**: el puerto de la consola puede cambiar
 *    entre arranques y el servidor rechazaría el callback. Otro puerto = registrar de nuevo,
 *    que es una llamada.
 *  - **El `state` lo pone el servicio**, que es quien lo apunta como pendiente: la ruta
 *    pública del callback no tiene otra autenticación que ese valor.
 */
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { guardarOAuth, leerOAuth, type OAuthDeConector } from "./conectoresEnDisco.js";

export interface OpcionesDeProveedor {
  casa: string;
  id: string;
  redirectUrl: string;
  state: string;
  alRedirigir: (url: URL) => void;
}

export class ProveedorDeConector implements OAuthClientProvider {
  private datos: OAuthDeConector;
  constructor(private readonly o: OpcionesDeProveedor) {
    this.datos = leerOAuth(o.casa, o.id);
  }
  private guardar(): void { guardarOAuth(this.o.casa, this.o.id, this.datos); }
  get redirectUrl(): string { return this.o.redirectUrl; }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "xonecode",
      redirect_uris: [this.o.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }
  state(): string { return this.o.state; }
  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.datos.redirectUri === this.o.redirectUrl ? this.datos.clientInformation : undefined;
  }
  saveClientInformation(info: OAuthClientInformationMixed): void {
    this.datos = { ...this.datos, clientInformation: info, redirectUri: this.o.redirectUrl };
    this.guardar();
  }
  tokens(): OAuthTokens | undefined { return this.datos.tokens; }
  saveTokens(tokens: OAuthTokens): void { this.datos = { ...this.datos, tokens }; this.guardar(); }
  redirectToAuthorization(url: URL): void { this.o.alRedirigir(url); }
  saveCodeVerifier(verifier: string): void { this.datos = { ...this.datos, codeVerifier: verifier }; this.guardar(); }
  codeVerifier(): string {
    if (!this.datos.codeVerifier) throw new Error("no hay verificador PKCE para esta autorización: vuelve a pulsar Conectar");
    return this.datos.codeVerifier;
  }
  /** El gancho de recuperación del SDK: sin él, un refresh muerto es un fallo duro. */
  invalidateCredentials(alcance: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    const { clientInformation, redirectUri, tokens, codeVerifier } = this.datos;
    if (alcance === "all") this.datos = {};
    else if (alcance === "client") this.datos = { ...(tokens ? { tokens } : {}), ...(codeVerifier ? { codeVerifier } : {}) };
    else if (alcance === "tokens") this.datos = { ...(clientInformation ? { clientInformation } : {}), ...(redirectUri ? { redirectUri } : {}), ...(codeVerifier ? { codeVerifier } : {}) };
    else if (alcance === "verifier") this.datos = { ...(clientInformation ? { clientInformation } : {}), ...(redirectUri ? { redirectUri } : {}), ...(tokens ? { tokens } : {}) };
    this.guardar();
  }
}
```

- [ ] **Step 4:** Run y ver PASS. Además `npm run typecheck`.
- [ ] **Step 5: Commit** — `git commit -m "feat(conectores): proveedor OAuth por conector, cliente público atado a su redirect"`

```json:metadata
{"files": ["src/agent/conectores/proveedorDeConector.ts", "src/agent/conectores/proveedorDeConector.test.ts"], "verifyCommand": "npx vitest run src/agent/conectores/proveedorDeConector.test.ts && npm run typecheck", "acceptanceCriteria": ["metadatos de cliente público exactos", "cliente de otro redirect se ignora", "state del servicio", "redirectToAuthorization delega", "invalidateCredentials por alcance"], "modelTier": "mechanical"}
```

---

### Task 4: El servicio de conectores (red detrás de una costura)

**Goal:** `servicioDeConectores.ts` compone disco + proveedor + red en seis operaciones, con la red INYECTADA para que los tests no la toquen, y una función `servicioDeConectoresCableado({casa})` que monta la red de verdad.

**Files:**
- Create: `src/agent/conectores/servicioDeConectores.ts`
- Test: `src/agent/conectores/servicioDeConectores.test.ts`

**Acceptance Criteria:**
- [ ] Interfaz exportada exactamente:
  ```ts
  export interface ServicioDeConectores {
    lista(): { conectores: ConectorDelCable[]; desconocidos: string[]; ilegible?: true; error?: string };
    anadir(id: string): void;              // un id fuera del catálogo deja su frase en `error`
    quitar(id: string): void;              // también olvida su OAuth y su prueba
    probar(id: string): Promise<void>;     // guarda la FOTO en memoria
    autorizar(id: string, redirectUrl: string): Promise<void>; // abre el navegador; no devuelve la URL
    completar(query: URLSearchParams): Promise<{ ok: boolean; mensaje: string }>;
    desconectar(id: string): void;         // olvida tokens (y cliente), no lo quita
  }
  ```
- [ ] La red entra por `RedDeConectores` inyectada:
  ```ts
  export interface RedDeConectores {
    listarTools(url: string, proveedor: OAuthClientProvider | undefined, senal: AbortSignal): Promise<ToolDeConector[]>;
    iniciarAutorizacion(url: string, proveedor: OAuthClientProvider): Promise<"REDIRECT" | "AUTHORIZED">;
    canjearCodigo(url: string, proveedor: OAuthClientProvider, code: string): Promise<void>;
    abrir(url: URL): void;
  }
  ```
- [ ] `probar` corta a `TOPE_DE_CONEXION_MS` (con `AbortController`), y un `UnauthorizedError` del SDK se guarda como prueba fallida con motivo «falta autorizar» y NO borra los tokens a mano (el SDK ya invalidó lo que tocara). Otro fallo: motivo `"no responde"` + ` (HTTP <n>)` si el error lleva un `code` numérico / `(código <code>)` si lleva un `code` de Node — nunca `error.message`.
- [ ] `autorizar` genera el `state` con `randomBytes(32).toString("base64url")`, lo apunta en pendientes con `expira = ahora() + TTL_DE_AUTORIZACION_MS`, y la URL capturada por `alRedirigir` va a `red.abrir` — nunca a un valor devuelto.
- [ ] `completar` usa `interpretarCallback`; con `ok` canjea con un proveedor construido con el MISMO `redirectUrl` que se usó al autorizar (se guarda en el pendiente), y luego `probar(id)`; devuelve `{ok, mensaje}` con frases nuestras.
- [ ] `lista()` marca `autorizando: true` en los ids con un pendiente vivo, y lleva `ilegible` (de `leerAnadidos`) y `error` (la frase de la última operación que falló, o ausente) — `informar` no llega al navegador desde el vestíbulo, así que el fallo viaja en el propio mensaje.
- [ ] `anadir`/`quitar`/`desconectar` no LANZAN hacia fuera: un id fuera del catálogo o un `ErrorDeFicheroDeConectores` deja su frase en `error` y llama a `cambio()`. Cualquier operación que va bien limpia `error`.
- [ ] `autorizar` que falla (`iniciarAutorizacion` rechaza: descubrimiento, DCR o red) BORRA su pendiente, deja prueba fallida con `motivoDe(error)` y llama a `cambio()` — sin esto la pantalla diría «Esperando al navegador…» diez minutos sin navegador abierto.
- [ ] **Un verificador PKCE por conector, así que UNA autorización viva por conector**: `autorizar(id)` retira los pendientes anteriores de ese id antes de apuntar el nuevo (el callback viejo contestará «ya se usó»), y `probar(id)` con un pendiente vivo de ese id NO va a la red (un 401 haría que el SDK arrancara otra autorización y pisara el verificador): deja la foto como está y llama a `cambio()`.
- [ ] `alCambiar` (opción) se llama tras cada operación que cambia `lista()`, para que el servidor reemita.
- [ ] `servicioDeConectoresCableado({ casa, alCambiar })` monta `RedDeConectores` real: `StreamableHTTPClientTransport` y si falla la conexión `SSEClientTransport`, ambos con `authProvider`; `auth()` del SDK para iniciar y canjear; `abrirEnSistema` para abrir. Test de costura: el objeto devuelto tiene las seis operaciones y `lista()` lee del `casa` pasado (sin red).

**Verify:** `npx vitest run src/agent/conectores/servicioDeConectores.test.ts && npm run typecheck` → PASS

**Steps:**

- [ ] **Step 1: Test que falla** — con una `RedDeConectores` doble (`vi.fn`) y `ahora` inyectable:
  - `anadir("deepwiki")` → `lista().conectores[0]` = `{id:"deepwiki", estado:"sin-autorizacion"}`.
  - `probar("deepwiki")` con `listarTools` que resuelve `[{nombre:"ask_wiki_question"}]` → `prueba.ok === true` y `tools`.
  - `probar` con `listarTools` que rechaza `Object.assign(new Error("https://secreto?token=x"), { code: 503 })` → `prueba.motivo === "no responde (HTTP 503)"` y `JSON.stringify(lista())` no contiene `secreto`.
  - `probar("jira")` SIN tokens → `prueba.motivo === "falta autorizar"` y `listarTools` NO se llamó.
  - `probar("jira")` con `guardarOAuth(casa,"jira",{tokens:{access_token:"a",token_type:"Bearer"}, redirectUri:"http://127.0.0.1:4200/mcp/oauth/callback"})` y `listarTools` que rechaza `new UnauthorizedError()` (de `@modelcontextprotocol/sdk/client/auth.js`) → `prueba.motivo === "falta autorizar"`, y el proveedor que recibió la red tiene `redirectUrl` igual al guardado.
  - `probar` con `listarTools` que nunca resuelve y reloj falso (`vi.useFakeTimers()`, avanzar `TOPE_DE_CONEXION_MS`) → motivo `"no responde (no contestó a tiempo)"`, y la señal que recibió la red está abortada.
  - `autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback")` con `iniciarAutorizacion` que llama `proveedor.redirectToAuthorization(new URL("https://mcp.notion.com/authorize?x"))` y devuelve `"REDIRECT"` → `red.abrir` recibió esa URL; `lista()` tiene `autorizando: true`; la promesa resuelve a `undefined`.
  - `completar(new URLSearchParams("code=c&state=<el state que se generó>"))` → `canjearCodigo` llamado con `"c"`; después `probar` corre; `autorizando` desaparece; `{ ok: true }`. Para conocer el state, el test lo lee del proveedor que recibió `iniciarAutorizacion` (`proveedor.state()`).
  - `completar` con state desconocido → `{ ok: false }` y `canjearCodigo` no se llamó.
  - `autorizar("notion", …)` con `iniciarAutorizacion` que rechaza → la promesa resuelve (no lanza), `lista()` NO tiene `autorizando` y `prueba.ok === false`.
  - Dos `autorizar("notion", …)` seguidos → el `state` del primero ya no vale en `completar` (`{ok:false}`), el del segundo sí.
  - `probar("notion")` con tokens guardados y un pendiente vivo → `listarTools` NO se llamó.
  - `anadir("linear")` → no lanza; `lista().error` contiene «linear»; un `anadir("deepwiki")` posterior deja `error` ausente.
  - `quitar("notion")` → fuera de `lista()` y `leerOAuth(casa,"notion")` es `{}`.
  - `desconectar("notion")` → sigue en `lista()` con `estado: "falta-autorizar"`.

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implementación** — estructura:

```ts
// src/agent/conectores/servicioDeConectores.ts
/**
 * Lo que la consola hace con un conector, en un solo sitio y con la red por COSTURA.
 *
 * Todo lo caro entra por `RedDeConectores`, que se pasa al construir: así los tests de la
 * regla no abren un socket, y la composición de verdad vive en `servicioDeConectoresCableado`
 * con su propio test — el patrón de fallo de siempre es una composición de producción
 * dentro de algo que todos los tests doblan.
 *
 * **La prueba es una FOTO en memoria**, como la de dispositivos: se mide al pulsar y tras
 * autorizar, no hay sondeo, y un proceso nuevo empieza sin foto — ausente es «no se ha
 * probado», no «falla».
 */
import { randomBytes } from "node:crypto";
import { UnauthorizedError, auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  conectorDelCatalogo, estadoDeConector, interpretarCallback,
  TOPE_DE_CONEXION_MS, TTL_DE_AUTORIZACION_MS,
  type ConectorDelCable, type Pendiente, type PruebaDeConector, type ToolDeConector,
} from "../../core/conectores.js";
import { anadirConector, leerAnadidos, leerOAuth, olvidarOAuth, quitarConector } from "./conectoresEnDisco.js";
import { ProveedorDeConector } from "./proveedorDeConector.js";
import { abrirEnSistema } from "../cloudstudio/cloudstudioMcp.js";

// …interfaces ServicioDeConectores y RedDeConectores tal como en los Acceptance Criteria…

interface PendienteConRedirect extends Pendiente { redirectUrl: string }

export function crearServicioDeConectores(o: {
  casa: string;
  red: RedDeConectores;
  ahora?: () => number;
  alCambiar?: () => void;
}): ServicioDeConectores {
  const ahora = o.ahora ?? Date.now;
  const pruebas = new Map<string, PruebaDeConector>();
  const pendientes = new Map<string, PendienteConRedirect>();
  /** La frase de la última operación que falló. Viaja en el mensaje: `informar` no llega al
   *  navegador desde el vestíbulo, y Ajustes se abre sin proyecto. */
  let error: string | undefined;
  const cambio = (): void => { try { o.alCambiar?.(); } catch { /* reemitir no puede tumbar la operación */ } };
  const hayPendienteVivo = (id: string): boolean => [...pendientes.values()].some((p) => p.id === id && p.expira >= ahora());
  /** Para las operaciones de disco: lo que falla se DICE en `error`, no se lanza al cable. */
  const operar = (hacer: () => void): void => {
    try { hacer(); error = undefined; }
    catch (e) { error = e instanceof Error ? e.message : "no se pudo guardar"; }
    cambio();
  };

  const catalogado = (id: string) => {
    const c = conectorDelCatalogo(id);
    if (c === undefined) throw new Error(`«${id}» no está en el catálogo de conectores`);
    return c;
  };
  const proveedor = (id: string, redirectUrl: string, state: string, alRedirigir: (u: URL) => void = () => {}) =>
    new ProveedorDeConector({ casa: o.casa, id, redirectUrl, state, alRedirigir });

  const motivoDe = (error: unknown): string => {
    if (error instanceof UnauthorizedError) return "falta autorizar";
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === "number") return `no responde (HTTP ${code})`;
    if (typeof code === "string") return `no responde (código ${code})`;
    return "no responde";
  };

  const servicio: ServicioDeConectores = {
    lista() {
      const { anadidos, desconocidos, ilegible } = leerAnadidos(o.casa);
      const vivos = new Set([...pendientes.values()].filter((p) => p.expira >= ahora()).map((p) => p.id));
      return {
        desconocidos,
        ...(ilegible ? { ilegible } : {}),
        ...(error === undefined ? {} : { error }),
        conectores: anadidos.map((id) => {
          const c = catalogado(id);
          const prueba = pruebas.get(id);
          return {
            id,
            estado: estadoDeConector(c, leerOAuth(o.casa, id).tokens !== undefined),
            ...(prueba === undefined ? {} : { prueba }),
            ...(vivos.has(id) ? { autorizando: true } : {}),
          };
        }),
      };
    },
    anadir(id) { operar(() => { catalogado(id); anadirConector(o.casa, id); }); },
    quitar(id) { operar(() => { quitarConector(o.casa, id); olvidarOAuth(o.casa, id); pruebas.delete(id); }); },
    desconectar(id) { operar(() => { olvidarOAuth(o.casa, id); pruebas.delete(id); }); },
    async probar(id) {
      const c = conectorDelCatalogo(id);
      if (c === undefined) { error = `«${id}» no está en el catálogo de conectores`; cambio(); return; }
      // Con una autorización abierta no se toca la red: un 401 haría que el SDK arrancara
      // OTRA y pisara el verificador PKCE —uno por conector— que el callback va a necesitar.
      if (hayPendienteVivo(id)) { cambio(); return; }
      const guardado = leerOAuth(o.casa, id);
      // Un OAuth sin tokens NO se prueba contra la red: el SDK, al ver el 401, intentaría
      // registrar un cliente —con un redirect que no es ninguno— y dejaría basura en el
      // fichero. La respuesta ya se sabe sin preguntar.
      if (c.autenticacion === "oauth" && (guardado.tokens === undefined || guardado.redirectUri === undefined)) {
        pruebas.set(id, { cuando: ahora(), ok: false, motivo: "falta autorizar" });
        cambio();
        return;
      }
      const control = new AbortController();
      let reloj: ReturnType<typeof setTimeout> | undefined;
      const tope = new Promise<never>((_, rechazar) => {
        reloj = setTimeout(() => { control.abort(); rechazar(new Error("tope")); }, TOPE_DE_CONEXION_MS);
      });
      try {
        // Sin autenticación no se pasa proveedor: un `authProvider` haría que el SDK
        // intentara un registro contra un servidor que no lo pide.
        const p = c.autenticacion === "oauth" ? proveedor(id, guardado.redirectUri!, "") : undefined;
        const tools = await Promise.race([o.red.listarTools(c.url, p, control.signal), tope]);
        pruebas.set(id, { cuando: ahora(), ok: true, tools });
      } catch (error) {
        pruebas.set(id, { cuando: ahora(), ok: false, motivo: control.signal.aborted ? "no responde (no contestó a tiempo)" : motivoDe(error) });
      } finally {
        clearTimeout(reloj);
        cambio();
      }
    },
    async autorizar(id, redirectUrl) {
      const c = conectorDelCatalogo(id);
      if (c === undefined) { error = `«${id}» no está en el catálogo de conectores`; cambio(); return; }
      // UNA autorización viva por conector: el verificador PKCE se guarda por conector, así
      // que una nueva invalida la anterior. Pulsar «Conectar» otra vez es también cómo se
      // recupera quien cerró la pestaña a medias.
      for (const [s, p] of pendientes) if (p.id === id) pendientes.delete(s);
      const state = randomBytes(32).toString("base64url");
      pendientes.set(state, { id, expira: ahora() + TTL_DE_AUTORIZACION_MS, redirectUrl });
      error = undefined;
      cambio();
      try {
        const resultado = await o.red.iniciarAutorizacion(c.url, proveedor(id, redirectUrl, state, (url) => o.red.abrir(url)));
        // Ya autorizado (tokens válidos): no hay navegador que esperar.
        if (resultado === "AUTHORIZED") { pendientes.delete(state); await servicio.probar(id); }
      } catch (e) {
        // Descubrimiento, registro o red: sin esto la pantalla esperaría a un navegador que
        // nunca se abrió hasta que caducara el plazo.
        pendientes.delete(state);
        pruebas.set(id, { cuando: ahora(), ok: false, motivo: motivoDe(e) });
        cambio();
      }
    },
    async completar(query) {
      // `interpretarCallback` CONSUME el pendiente, así que su redirect se lee antes: el
      // canje tiene que ir con el MISMO `redirect_uri` con el que se pidió el código.
      const redirect = pendientes.get(query.get("state") ?? "")?.redirectUrl;
      const r = interpretarCallback(query, pendientes, ahora());
      cambio();
      if (!r.ok || redirect === undefined) return { ok: false, mensaje: r.ok ? "esa autorización ya no está pendiente" : r.motivo };
      const c = catalogado(r.id);
      try {
        await o.red.canjearCodigo(c.url, proveedor(r.id, redirect, ""), r.code);
      } catch (error) {
        pruebas.set(r.id, { cuando: ahora(), ok: false, motivo: motivoDe(error) });
        cambio();
        return { ok: false, mensaje: "no se pudo completar la autorización: vuelve a pulsar Conectar" };
      }
      await servicio.probar(r.id);
      return { ok: true, mensaje: `${c.nombre} conectado` };
    },
  };
  return servicio;
}
```

  (El bloque `// …interfaces…` del principio es la copia literal de las dos interfaces de los Acceptance Criteria de esta tarea.)

  Y la red real:

```ts
export function redDeConectoresReal(): RedDeConectores {
  return {
    async listarTools(url, proveedor, senal) {
      const opciones = { ...(proveedor ? { authProvider: proveedor } : {}), requestInit: { signal: senal } };
      // Un `Client` NUEVO para el intento por SSE, como el ejemplo de compatibilidad del
      // propio SDK: el que falló al conectar no se reutiliza. Los tres medidos hablan
      // streamable-http; el SSE queda para un servidor viejo.
      let cliente = new Client({ name: "xonecode", version: "0" });
      try {
        await cliente.connect(new StreamableHTTPClientTransport(new URL(url), opciones));
      } catch (error) {
        if (error instanceof UnauthorizedError || senal.aborted) throw error;
        await cliente.close().catch(() => {});
        cliente = new Client({ name: "xonecode", version: "0" });
        await cliente.connect(new SSEClientTransport(new URL(url), opciones));
      }
      try {
        const { tools } = await cliente.listTools();
        return tools.map((t) => ({
          nombre: t.name,
          ...(t.description ? { descripcion: t.description } : {}),
          ...(typeof t.annotations?.readOnlyHint === "boolean" ? { soloLectura: t.annotations.readOnlyHint } : {}),
        }));
      } finally {
        await cliente.close().catch(() => {});
      }
    },
    iniciarAutorizacion: (url, proveedor) => auth(proveedor, { serverUrl: url }),
    canjearCodigo: async (url, proveedor, code) => { await auth(proveedor, { serverUrl: url, authorizationCode: code }); },
    abrir: abrirEnSistema,
  };
}

export function servicioDeConectoresCableado(o: { casa: string; alCambiar?: () => void }): ServicioDeConectores {
  return crearServicioDeConectores({ casa: o.casa, red: redDeConectoresReal(), ...(o.alCambiar ? { alCambiar: o.alCambiar } : {}) });
}
```

- [ ] **Step 4:** Run → PASS; `npm run typecheck` → limpio.
- [ ] **Step 5: Commit** — `git commit -m "feat(conectores): el servicio, con la red por costura y la foto de la prueba"`

```json:metadata
{"files": ["src/agent/conectores/servicioDeConectores.ts", "src/agent/conectores/servicioDeConectores.test.ts"], "verifyCommand": "npx vitest run src/agent/conectores/servicioDeConectores.test.ts && npm run typecheck", "acceptanceCriteria": ["interfaz exacta de seis operaciones + lista", "prueba con tope y motivos sin contenido remoto", "autorizar abre por red.abrir y no devuelve la URL", "completar consume el state y canjea con el mismo redirect", "autorizando en lista", "cableado real con test de costura sin red"], "modelTier": "standard"}
```

---

### Task 5: Ruta pública en el servidor web

**Goal:** `ServidorWeb.registrarRutaPublica(metodo, ruta, manejador)`: se atiende tras las comprobaciones de `Host` y `Origin` y ANTES de la de cookie.

**Files:**
- Modify: `src/web/servidor/servidor.ts` (interfaz `ServidorWeb` ~l.46-54, `ContextoPeticion`, `manejarPeticion` ~l.155-222)
- Test: el test existente del servidor (buscar con `ls src/web/servidor/servidor*.test.ts`; si no existe, crear `src/web/servidor/servidor.publica.test.ts`)

**Acceptance Criteria:**
- [ ] Una ruta pública responde 200 sin cookie ni `?t=`.
- [ ] La MISMA ruta con `Host: evil.com` → 403, y con `Origin: https://evil.com` → 403 (las defensas de rebinding siguen delante).
- [ ] Una ruta pública NO emite `Set-Cookie` aunque la query traiga `t=<token>` válido.
- [ ] Una ruta normal registrada con `registrarRuta` sigue devolviendo 401 sin cookie.
- [ ] Comentario en el código que diga por qué existe (cookie `SameSite=Strict` + redirección de otro sitio) y que la autenticación de lo público la pone el manejador.

**Verify:** `npx vitest run src/web/servidor/` → PASS

**Steps:**
- [ ] **Step 1:** Test que falla, levantando el servidor en puerto 0 con `crearServidorWeb` (mirar cómo lo hacen los tests existentes del fichero) y `fetch` a `http://127.0.0.1:<puerto>/publica` con cabeceras a mano.
- [ ] **Step 2:** FAIL (`registrarRutaPublica` no existe).
- [ ] **Step 3:** Añadir `rutasPublicas: Map<string, ManejadorRuta>` al contexto; en `manejarPeticion`, justo después de calcular `rutaDecodificada` y ANTES de `autenticar(...)`:

```ts
  // Lo PÚBLICO va aquí: después de `Host` y `Origin` —el rebinding se para igual— y antes
  // de la cookie. Existe por el callback OAuth de los conectores: la cookie es
  // `SameSite=Strict`, así que una redirección que llega desde otro sitio viene SIN ella y
  // se quedaría en un 401. La autenticación de una ruta pública la pone su manejador (el
  // callback: un `state` de un solo uso), y por eso esto no emite cookie nunca.
  const publica = rutasPublicas.get(`${peticion.method} ${rutaDecodificada}`);
  if (publica !== undefined) {
    await publica(peticion, respuesta);
    return;
  }
```
  y en el objeto devuelto `registrarRutaPublica(metodo, ruta, manejador) { rutasPublicas.set(\`${metodo} ${ruta}\`, manejador); }`, con su doc en la interfaz. Actualizar cualquier doble de `ServidorWeb` en tests (`command grep -rn "registrarRuta" src --include='*.test.ts'`) añadiendo `registrarRutaPublica`.
- [ ] **Step 4:** PASS + `npm run typecheck`.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): rutas públicas, tras Host y Origin y sin cookie"`

```json:metadata
{"files": ["src/web/servidor/servidor.ts"], "verifyCommand": "npx vitest run src/web/servidor/ && npm run typecheck", "acceptanceCriteria": ["pública 200 sin cookie", "Host/Origin ajenos 403", "sin Set-Cookie en pública", "normal sigue 401"], "modelTier": "standard"}
```

---

### Task 6: El cable y el servidor de la consola

**Goal:** Los mensajes `conectores`/`conector`, la opción `conectores?` de `arrancarConsolaWeb`, la ráfaga, el manejador, la ruta del callback y el cableado de producción.

**Files:**
- Modify: `src/web/servidor/transporte.ts` (unión `MensajeAlCliente` ~l.137-410; `MensajeDelCliente` ~l.1096-1450)
- Modify: `src/web/servidor/arranque.ts` (opciones ~l.600-640; `mensajeDeSkills` ~l.1212 como molde; ráfaga ~l.1476-1505; despacho de `POST /accion` ~l.4445; registro de rutas ~l.4112; cableado de producción ~l.5584)
- Test: `src/web/servidor/arranque.test.ts` (junto a los de workspace, ~l.5802)

**Acceptance Criteria:**
- [ ] Al cliente: `{ clase: "conectores"; catalogo: {id,nombre,descripcion,autenticacion}[]; conectores: ConectorDelCable[]; desconocidos: string[] }` — el catálogo SIN la `url` (no hace falta en pantalla y así no hay rutas que discutir). Va en la ráfaga de bienvenida solo si la opción `conectores` está puesta (ausente = no se pinta la sección: «un control sin dato detrás no se pinta»).
- [ ] Del cliente: `{ clase: "conector"; accion: "anadir" | "quitar" | "probar" | "autorizar" | "desconectar"; id: string }`; una `accion` que no es una de esas cinco → 400 y no hace nada. Todas contestan 204 en el acto (probar/autorizar corren en segundo plano con `.catch(contar)`) y el resultado llega por `emitir(mensajeDeConectores())` vía `alCambiar`.
- [ ] `autorizar` pasa `redirectUrl = \`http://127.0.0.1:${servidor.puerto}${RUTA_CALLBACK_MCP}\``.
- [ ] `GET RUTA_CALLBACK_MCP` registrada con `registrarRutaPublica`: llama a `conectores.completar(query)` y responde 200 `text/html; charset=utf-8` con una página mínima propia («Listo, ya puedes cerrar esta pestaña» o el `mensaje` de fallo, ESCAPADO con una función que sustituya `& < > " '`) + cabeceras `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` y `Cache-Control: no-store`. Sin la opción `conectores`, la ruta no se registra.
- [ ] El mensaje `conectores` lleva también `ilegible?: true` y `error?: string` tal como los da `lista()`: los fallos NO van por `informar`, que no llega al navegador desde el vestíbulo (y Ajustes se abre sin proyecto).
- [ ] **Forma del cableado, decidida**: la opción es una FÁBRICA, `conectores?: (alCambiar: () => void) => ServicioDeConectores`. El arranque la llama UNA vez al montar con su propio `emitirConectores` como `alCambiar`. La composición de producción de `arrancarConsolaWeb` (~l.5584) pasa `conectores: (alCambiar) => servicioDeConectoresCableado({ casa: homedir(), alCambiar })`. Extrae esa composición a una función exportada si hoy es un literal inline (el patrón de `ajusteDeWorkspaceCableado`, ~l.5146), y el test de costura llama a ESA función y comprueba que `conectores` está presente y que la fábrica devuelve un servicio con las seis operaciones — sin red, con el HOME ya mudado por `casaDePruebas`.
- [ ] Tests del cable: ráfaga contiene `conectores` con un servicio doble; `POST /accion {clase:"conector",accion:"anadir",id:"deepwiki"}` → 204 y el doble recibió `anadir("deepwiki")`; acción desconocida → 400; `GET /mcp/oauth/callback?state=x&code=<script>` sin cookie → 200 y el cuerpo no contiene `<script>`; `JSON.stringify` de todo lo emitido en el test no contiene `access_token`.

**Verify:** `npx vitest run src/web/ && npm run typecheck` → PASS (incluye `src/web/frontera.test.ts`)

**Steps:**
- [ ] **Step 1:** Tests que fallan en `arranque.test.ts`, copiando el andamiaje de `"el workspace viaja en la ráfaga, y elegirlo LLEGA a guardarWorkspace"` (~l.5802).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Tipos en `transporte.ts` con doc al estilo del fichero; opción en `OpcionesDeMontaje`; `mensajeDeConectores()` + `emitirConectores()`; entrada en la ráfaga (tras `workspace`); despacho en `POST /accion` siguiendo el `if` del workspace (l.4445); ruta pública; composición de producción.
- [ ] **Step 4:** PASS + typecheck.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): conectores por el cable y callback OAuth en ruta pública"`

```json:metadata
{"files": ["src/web/servidor/transporte.ts", "src/web/servidor/arranque.ts", "src/web/servidor/arranque.test.ts"], "verifyCommand": "npx vitest run src/web/ && npm run typecheck", "acceptanceCriteria": ["mensaje conectores en la ráfaga solo con la opción", "mensaje conector con cinco acciones y 400 para otra", "redirect con el puerto real", "callback público con página escapada y CSP", "cableado de producción con test de costura", "nada de tokens en lo emitido"], "modelTier": "standard"}
```

---

### Task 7: El cliente — tipos, store y la sección de Ajustes

**Goal:** La sección «Conectores» en Ajustes con Configurados · N / Disponibles · N, estados, acciones y lista de tools.

**Files:**
- Modify: `apps/web/src/tipos.ts` (redeclarar los dos mensajes y `ConectorDelCable`, `PruebaDeConector`, `ToolDeConector`)
- Modify: `apps/web/src/store.ts` (campo `conectores?` en `EstadoDelCliente`; `case "conectores"` lista blanca campo a campo, como `case "skills"` ~l.1199; se tira al caerse el cable como los demás)
- Create: `apps/web/src/componentes/Conectores.tsx`, `Conectores.module.css`, `Conectores.test.tsx`, `IconoDeConector.tsx`
- Modify: `apps/web/src/componentes/Ajustes.tsx` (`SeccionDeAjustes` ~l.106, `SECCIONES` ~l.126, render ~l.2091), `apps/web/src/App.tsx` (~l.1193, junto a skills)

**Acceptance Criteria:**
- [ ] Sección `"conectores"` con etiqueta «Conectores», debajo de Skills, con un icono que EXISTA en los exports de la librería (comprobar en `node_modules/<lib de primitivas>/lib/index.js` como dice el comentario de `SECCIONES`; si no hay uno de enchufe/conexión, `IconLinkOutline16` ya se usa — elige otro que sí exista y dilo en el comentario). Sin `conectores` en el estado, la sección no aparece.
- [ ] «Configurados · N»: fila por conector con icono (monograma SVG propio, `currentColor`, `aria-hidden`), nombre, descripción y pastilla de estado:
  - `prueba.ok` → «Conectado · N tools»
  - `autorizando` → «Esperando al navegador…»
  - `estado === "falta-autorizar"` → «Falta autorizar»
  - `prueba.ok === false` → «No responde» con el `motivo` en el `title` y en texto bajo la fila
  - resto (sin prueba) → «Sin probar»
- [ ] `error` presente → una línea con `role="status"` encima de las listas con esa frase; `ilegible` → «No se pudo leer tu `conectores.json`: no se ha tocado; revísalo o bórralo», y en ese caso NO se pinta «Configurados · 0» (ausente ≠ vacío).
- [ ] Botones por fila: «Conectar» (solo OAuth y no autorizado, y SIGUE ahí mientras `autorizando`, rotulado «Volver a abrir», para recuperarse de una pestaña cerrada) → `accion:"autorizar"`; «Probar» → `probar`; «Desconectar» (solo OAuth autorizado) → `desconectar`; «Quitar» → `quitar`. Desplegar la fila (botón con `aria-expanded`) enseña las tools: nombre, descripción y «solo lectura» si `soloLectura === true`; con `prueba.ok` y cero tools dice «no expone ninguna tool».
- [ ] «Disponibles · N»: los del catálogo no añadidos, con «Sin autenticación» u «OAuth» y botón «Añadir» → `anadir`.
- [ ] Nota fija al pie: «Estos conectores todavía no llegan a ningún agente: aquí se conectan y se prueban.» y otra: «La autorización se abre en el navegador de la máquina donde corre la consola; por un túnel no vuelve.»
- [ ] `desconocidos` no vacío → una línea que los nombra («En tu configuración hay conectores que esta versión no conoce: …»).
- [ ] Sin colores literales (usa tokens `--dsw-alias-*` / `--xonecode-*` como el resto de hojas); `Barra.test.tsx` verde.
- [ ] `tipos.test.ts` verde (literales `clase:` cuadran con el host).
- [ ] `Conectores.test.tsx`: pinta los dos grupos con sus cuentas; cada botón manda su acción exacta con el id; sin `prueba` dice «Sin probar»; con `prueba.ok:false` enseña el motivo; desplegar enseña las tools.

**Verify:** `npx vitest run apps/web/ && npm run typecheck` → PASS

**Steps:**
- [ ] **Step 1:** `Conectores.test.tsx` que falla (patrón de `Skills.test.tsx`: render con props y `fireEvent.click`, espía `alAccion`). Props:
  ```ts
  interface PropsDeConectores {
    catalogo: { id: string; nombre: string; descripcion: string; autenticacion: "ninguna" | "oauth" }[];
    conectores: ConectorDelCable[];
    desconocidos: string[];
    ilegible?: true;
    error?: string;
    alAccion: (accion: "anadir" | "quitar" | "probar" | "autorizar" | "desconectar", id: string) => void;
  }
  ```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Tipos, store (+ test en `store.test.ts`: un mensaje `conectores` con un campo extra `token:"x"` en un conector NO lo deja en el estado), componente, hoja, icono, Ajustes y App (`alAccion={(accion, id) => void enviar({ clase: "conector", accion, id })}`).
- [ ] **Step 4:** PASS + typecheck (dos proyectos).
- [ ] **Step 5: Commit** — `git commit -m "feat(web): la sección Conectores en Ajustes"`

```json:metadata
{"files": ["apps/web/src/tipos.ts", "apps/web/src/store.ts", "apps/web/src/componentes/Conectores.tsx", "apps/web/src/componentes/Conectores.module.css", "apps/web/src/componentes/Conectores.test.tsx", "apps/web/src/componentes/IconoDeConector.tsx", "apps/web/src/componentes/Ajustes.tsx", "apps/web/src/App.tsx"], "verifyCommand": "npx vitest run apps/web/ && npm run typecheck", "acceptanceCriteria": ["sección solo con dato", "dos grupos con cuenta", "cinco estados de pastilla", "botones mandan acción exacta", "tools al desplegar", "notas de límites", "sin colores literales", "tipos.test y store lista blanca"], "modelTier": "standard"}
```

---

### Task 8: Documentación de invariantes

**Goal:** Dejar escrito en `CLAUDE.md` lo que no se puede romper y en `docs/DECISIONES.md` lo medido.

**Files:**
- Modify: `CLAUDE.md` (sección nueva «### Los conectores MCP» dentro de «La consola web» o justo después de «El workspace»)
- Modify: `docs/DECISIONES.md` (entrada nueva al final, con fecha)

**Acceptance Criteria:**
- [ ] `CLAUDE.md` nombra: catálogo en `core/conectores.ts`; los dos ficheros y el 0600; solo global; la ruta pública y que su autenticación es el `state` de un solo uso (con `TTL_DE_AUTORIZACION_MS`, 10 min); que ni tokens ni URL de autorización cruzan el cable; cliente público atado a su `redirect_uri`; prueba = foto; límites declarados (no llegan a agentes, túnel, sin URL propia).
- [ ] `CLAUDE.md` NO cita fechas, recuentos ni duraciones sueltas (solo entre paréntesis con su constante): `npx vitest run src/documentacion.test.ts` verde.
- [ ] `DECISIONES.md` recoge lo medido el 24-09-2026: metadatos OAuth de Notion y Atlassian (DCR + S256, `none` aceptado), registro con loopback aceptado (201), las 3 tools de DeepWiki sin anotaciones (y que eso importa para la política de aprobación de la siguiente pieza), y por qué ruta pública y no un puerto fijo como el 7634.

**Verify:** `npx vitest run src/documentacion.test.ts` → PASS

**Steps:**
- [ ] **Step 1:** Escribir las dos secciones.
- [ ] **Step 2:** Run el test de documentación; corregir hasta verde.
- [ ] **Step 3: Commit** — `git commit -m "docs: los conectores MCP, invariantes y lo medido"`

```json:metadata
{"files": ["CLAUDE.md", "docs/DECISIONES.md"], "verifyCommand": "npx vitest run src/documentacion.test.ts", "acceptanceCriteria": ["invariantes en CLAUDE.md", "documentacion.test verde", "lo medido en DECISIONES.md"], "modelTier": "mechanical"}
```

---

### Task 9: Verificación de punta a punta en el navegador, con los tres servidores reales

**Goal:** Ver funcionar la sección contra deepwiki, jira y notion de verdad.

> **USER-ORDERED GATE — NON-SKIPPABLE.** This task was requested by the user in the current conversation. It MUST NOT be closed by walking around it, by declaring it "verified inline", or by substituting a cheaper check. Close only after every item in `acceptanceCriteria` has been re-validated independently, with output captured.

**Files:** ninguno (verificación); si algo falla, se arregla en la tarea que corresponda y se vuelve aquí.

**Acceptance Criteria:**
- [ ] `npm test -- --maxWorkers=2` y `npm run typecheck` verdes antes de empezar (con `FORCE_COLOR=0` si el shell tiene TTY).
- [ ] `npm run web -- --puerto 4200` levanta; en Ajustes → Conectores se ven «Disponibles · 3».
- [ ] Añadir deepwiki → Probar → pastilla «Conectado · 3 tools», y al desplegar salen `ask_wiki_question`, `read_wiki_contents`, `read_wiki_structure`.
- [ ] Añadir notion → «Falta autorizar» → Conectar abre el navegador del sistema → tras autorizar, la pestaña del callback dice «Listo…» y Ajustes pasa a «Conectado · N tools» sin recargar.
- [ ] Lo mismo con jira.
- [ ] `~/.xonecode/conectores-oauth.json` tiene modo `-rw-------` (`ls -l`), y `command grep -c access_token` sobre la traza del cable (DevTools → Network → `eventos`) da 0.
- [ ] Reiniciar la consola con otro puerto (`--puerto 4300`) y Conectar notion de nuevo funciona (registro rehecho por el cambio de `redirect_uri`).
- [ ] Desconectar notion → «Falta autorizar»; Quitar → vuelve a Disponibles.

**Verify:** capturas de pantalla (Playwright o manual) de cada estado + salida de `ls -l ~/.xonecode/conectores-oauth.json`

```json:metadata
{"files": [], "verifyCommand": "npm run web -- --puerto 4200", "acceptanceCriteria": ["suite y typecheck verdes", "Disponibles · 3", "deepwiki Conectado · 3 tools con sus nombres", "notion autoriza y pasa a Conectado sin recargar", "jira igual", "fichero 0600 y cero access_token en el cable", "cambio de puerto re-registra", "desconectar y quitar"], "modelTier": "standard", "userGate": true, "tags": ["user-gate"]}
```
