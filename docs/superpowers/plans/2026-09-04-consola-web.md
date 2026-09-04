# La consola web — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `xonecode` abra una consola web —entorno → proyecto → sesión, con el alta completa en el navegador— y que la consola de terminal siga entera detrás de `--cli`.

**Architecture:** La web es la **tercera piel** de la misma `cli/consola.ts`, exactamente como la TUI de Ink: el lazo de comandos, el estado de sesión y el ejecutor entran inyectados, y la piel solo aporta entrada, preguntas, render y aprobaciones. El host (`src/web/servidor/`) es un `node:http` en loopback que sirve estáticos y habla por SSE + POST; el cliente es un **paquete nuevo** (`apps/web`) construido con Vite, con los estilos de deepseek-harness.

**Tech Stack:** TypeScript, Node ≥20, `node:http` (sin framework), SSE, Vite 6, React 18, CSS Modules, `clsx`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-consola-web-design.md`

## Global Constraints

Vinculantes para TODAS las tareas. Un cambio que las rompa está mal el cambio, no el test.

1. **`npm test` no puede necesitar clave, red, simulador ni navegador.** Nada de Playwright en la suite.
2. **Ningún `DomainEvent` ni ningún acto lleva argumentos de tool.** Lo único que sale de los argumentos es `tool.detalle`, un campo de la lista blanca por nombre de tool (`agent/resumenDeTool.ts`): ruta o patrón, **nunca contenido**. Aplica a la vista de Trayectoria, al `.jsonl` de sesiones y al stream SSE.
3. **El diff solo viaja en el mensaje de aprobación.** No entra en el stream de eventos ni se persiste.
4. **La aprobación es fail-closed.** En la web, *por transporte*: desconexión, cierre de pestaña o timeout son **rechazo**. Solo un «sí» explícito aprueba. `MAX_APPROVAL_ROUNDS = 5` sin cambios.
5. **La frontera de `core/` sigue probada** (`core/imports.test.ts`): nada de langchain, langgraph, deepagents, ink, react ni MCP dentro de `core/`.
6. **Frontera nueva, con la misma forma que `cli/tui/frontera.test.ts`:** `react`, `react-dom`, `vite` y cualquier API de DOM viven SOLO en `apps/web/`. `src/` no importa nada de `apps/web/`.
7. **Loopback y nada más.** `127.0.0.1`; no hay bandera para `0.0.0.0` en esta fase. `Origin` y `Host` se comprueban en toda petición (defensa contra DNS rebinding).
8. **Nunca se sirve** `~/.xonecode/` ni el `.xonecode/` de ningún proyecto. Los estáticos salen de `apps/web/dist` y de ningún sitio más.
9. **El puerto del callback OAuth (7634) es intocable**: el IDS registra ese `redirect_uri`. El servidor web usa otro puerto.
10. **Los escritores de disco no destruyen lo que había**: la base de la fusión es el objeto CRUDO, y ante un JSON roto **paran sin escribir** (contrato de `agent/authEnDisco.ts`).
11. **Los subcomandos no se mueven**: `run`, `verify`, `config`, `describe`, `doctor`, `modelos`. Los códigos de salida son contrato y CI los lee (0 / 1 / 2 / 64 / 70).
12. **El e2e de tubería sigue byte-idéntico.** Sin stdin TTY, la omisión NO es la web.

**User decisions (already made):**
- «quiero que por defecto siempre ejecute la web (`xonecode`) si usa `xonecode --cli`» → la web es la omisión con TTY; la consola de terminal queda tras `--cli`.
- «un paquete nuevo» → el cliente va en un paquete propio (`apps/web`) con workspaces de npm, como `apps/web` de deepseek-harness.
- «quiero que uses los mismos estilos y si quieres la misma forma de hacer la web de deepseek» → se copia el tema (`ui-theme`, 769 líneas de CSS, MIT) y sus reglas (CSS Modules + `clsx`, sin Tailwind, sin librería de componentes); **no** se copia el andamio de Cordis/Typert/slots.
- «las sesiones se guardan por proyecto y se pueden reabrir» → `.xonecode/sesiones/` del proyecto; reabrir es **releer** (D1 del spec).
- «en un `.xonecode` global se guardarán en settings los entornos de XOne» → `~/.xonecode/settings.json` con `entornos[]` y `workspace`.
- «el workspace por defecto `.xonecode/entorno/workspace/projectname`» → base configurable, disposición fija.
- «el wizard inicial también debe incluir registrar el entorno» → tres pasos: cuenta, entorno, proyecto.
- «la forma de sincronización es la misma» → `gitSync`/`descarga`/`subida`/`planDeSubida` **no se tocan**.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `vitest.config.ts` | **Nuevo.** `environment` por glob (node para `src/`, jsdom para `apps/web/`), `exclude` de `.worktrees/` |
| `core/actos.ts` | **Nuevo.** El tipo `Acto`, extraído de `cli/tui/store.ts` porque ahora lo comparten dos pieles |
| `core/settings.ts` | **Nuevo.** Tipos y validación de los settings globales; `rutaDeWorkspace` pura. Sin disco |
| `agent/settingsEnDisco.ts` | **Nuevo.** Lector y escritor de `~/.xonecode/settings.json` |
| `agent/cloudstudioMcp.ts` | **Modificado.** `EstadoOAuth` indexado por entorno + migración |
| `src/web/servidor/servidor.ts` | **Nuevo.** `node:http`: escucha, rutas, token, `Origin`/`Host`, estáticos |
| `src/web/servidor/pielWeb.ts` | **Nuevo.** Implementa `Piel`; traduce eventos a actos |
| `src/web/servidor/consolaWeb.ts` | **Nuevo.** Implementa `Consola`; cola de líneas, preguntas, selector, secreto, aprobaciones |
| `src/web/servidor/transporte.ts` | **Nuevo.** SSE + `POST /accion` + reemisión al reconectar |
| `src/web/servidor/sesiones.ts` | **Nuevo.** Persistencia de actos por proyecto |
| `src/web/servidor/vestibulo.ts` | **Nuevo.** El wizard de tres pasos y la apertura de la consola de proyecto |
| `src/cli/main.ts` | **Modificado.** `decidirPiel`, banderas nuevas, y el cambio de omisión (última tarea) |
| `apps/web/` | **Paquete nuevo.** El cliente: Vite, React, CSS Modules, el tema de deepseek |

---

### Task 0: `vitest.config.ts`

**Goal:** Que el repo tenga una config de vitest que elija `environment` por glob y excluya `.worktrees/`, para que el cliente web pueda tener tests de DOM sin contaminar la suite del host.

**Files:**
- Create: `vitest.config.ts`
- Modify: `CLAUDE.md` (la sección que documenta la ausencia de config como coste medido)

**Acceptance Criteria:**
- [ ] `npm test` corre los mismos ficheros que hoy más ninguno de `.worktrees/`
- [ ] Los tests bajo `src/**` corren con `environment: "node"`
- [ ] Los tests bajo `apps/web/**` corren con `environment: "jsdom"`
- [ ] `npx vitest run` sin la bandera `--exclude` ya no barre `.worktrees/`

**Verify:** `npx vitest run 2>&1 | tail -5` → el recuento de ficheros no incluye `.worktrees/`

**Steps:**

- [ ] **Step 1: Comprobar el problema que se arregla**

```bash
# CLAUDE.md documenta que sin config el include por omisión barre .worktrees/.
ls .worktrees/ 2>/dev/null && echo "hay worktrees en disco: el problema es reproducible"
npx vitest run 2>&1 | tail -3
```

- [ ] **Step 2: Escribir la config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

/**
 * No había config a propósito (los valores por omisión bastaban), y eso tenía un coste
 * medido: el `include` por omisión barre TODO el repo, y `.worktrees/` —ignorado por git
 * pero presente en disco— no está en el `exclude` por omisión. Con un worktree viejo ahí,
 * `npm test` corría 128 ficheros en vez de 66.
 *
 * Ahora hace falta de verdad: el cliente web necesita `jsdom` y el host necesita `node`,
 * y eso no se puede expresar sin config.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "host",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"],
          environment: "node",
        },
      },
      {
        test: {
          name: "cliente",
          include: ["apps/web/**/*.test.ts", "apps/web/**/*.test.tsx"],
          exclude: ["**/node_modules/**", "**/dist/**"],
          environment: "jsdom",
        },
      },
    ],
  },
});
```

**`environmentMatchGlobs` NO existe en vitest 4** (comprobado contra `vitest@4.1.11`: cero
apariciones en sus `.d.ts`). El sustituto son los **proyectos**, y de paso resuelven solo el
problema de `.worktrees/`: con `include: ["src/**/*.test.ts"]`, un worktree bajo
`.worktrees/<x>/src/` ya no casa. El `exclude` se conserva igualmente, por si alguien
ensancha el `include` algún día.

- [ ] **Step 3: Instalar jsdom como dependencia de desarrollo**

```bash
npm install --save-dev jsdom@^25
```

- [ ] **Step 4: Verificar que la suite sigue verde y no barre worktrees**

Run: `npx vitest run 2>&1 | tail -5`
Expected: todos los tests en verde; el recuento coincide con `npx vitest run --exclude '**/.worktrees/**'` de antes.

- [ ] **Step 5: Corregir CLAUDE.md**

Sustituir el párrafo «**Consecuencia medida de no tener `vitest.config`**…» por la constatación de que la config ya existe, qué resuelve (`.worktrees/` excluido, `environment` por glob) y que el remedio manual `--exclude` ya no hace falta. **Ante una discrepancia entre doc y código, el código manda** — y aquí el código cambió.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json CLAUDE.md
git commit -m "chore: vitest.config.ts — excluye .worktrees/ y elige environment por glob"
```

```json:metadata
{"files": ["vitest.config.ts", "CLAUDE.md"], "verifyCommand": "npx vitest run", "acceptanceCriteria": ["la suite sigue verde", ".worktrees/ excluido sin bandera", "environment jsdom para apps/web y node para src"], "modelTier": "mechanical"}
```

---

### Task 1: `decidirPiel` y las banderas nuevas

**Goal:** Que exista la decisión de piel (web / consola) como función pura probada, con `--web`, `--cli`, `--no-abrir` y `--puerto`, **sin cambiar todavía la omisión**: la web es opt-in hasta la última tarea.

**Files:**
- Modify: `src/cli/main.ts` (junto a `decidirTui`, línea 273)
- Modify: `src/cli/main.test.ts`

**Acceptance Criteria:**
- [ ] `decidirPiel([])` devuelve `"consola"` (la omisión NO cambia en esta tarea)
- [ ] `decidirPiel(["--web"])` devuelve `"web"` aunque no haya TTY
- [ ] `decidirPiel(["--cli"])` devuelve `"consola"` incluso junto a `--web`
- [ ] `parsearOpcionesWeb` lee `--puerto 4300` y `--no-abrir`
- [ ] `--puerto` con un valor no numérico o fuera de 1..65535 es error de USO (código 64)
- [ ] `decidirTui` no cambia de comportamiento

**Verify:** `npx vitest run src/cli/main.test.ts -t "decidirPiel"` → PASS

**Steps:**

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// en src/cli/main.test.ts
import { decidirPiel, parsearOpcionesWeb, ErrorDeUso } from "./main.js";

describe("decidirPiel", () => {
  it("por omisión es la consola de siempre: el cambio de omisión es una tarea posterior", () => {
    expect(decidirPiel([])).toBe("consola");
  });

  it("--web fuerza la web aunque no haya TTY (servidores headless)", () => {
    expect(decidirPiel(["--web"])).toBe("web");
  });

  it("--cli gana siempre, incluso frente a --web", () => {
    expect(decidirPiel(["--cli"])).toBe("consola");
    expect(decidirPiel(["--web", "--cli"])).toBe("consola");
  });
});

describe("parsearOpcionesWeb", () => {
  it("lee el puerto y la orden de no abrir el navegador", () => {
    expect(parsearOpcionesWeb(["--puerto", "4300", "--no-abrir"]))
      .toEqual({ puerto: 4300, abrir: false });
  });

  it("sin banderas, puerto por omisión y abre el navegador", () => {
    expect(parsearOpcionesWeb([])).toEqual({ puerto: 4173, abrir: true });
  });

  it("un puerto que no es un número es error de USO, no un puerto raro", () => {
    expect(() => parsearOpcionesWeb(["--puerto", "ocho"])).toThrow(ErrorDeUso);
  });

  it("el 7634 está reservado al callback OAuth y se rechaza", () => {
    expect(() => parsearOpcionesWeb(["--puerto", "7634"])).toThrow(ErrorDeUso);
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run src/cli/main.test.ts -t "decidirPiel"`
Expected: FAIL — `decidirPiel is not a function`.

- [ ] **Step 3: Implementar, al lado de `decidirTui`**

```ts
// src/cli/main.ts, junto a decidirTui

/** El puerto del callback OAuth: el IDS lo registra como redirect_uri y no se toca. */
const PUERTO_OAUTH = 7634;
const PUERTO_WEB_POR_OMISION = 4173;

export type PielElegida = "web" | "consola";

/**
 * Qué piel arranca. Hermana pura de `decidirTui`, y por la misma razón: la decisión se
 * prueba sin TTY, y la rama que la usa solo la obedece.
 *
 * Hoy la omisión es `"consola"`. El cambio a `"web"` con TTY es la ÚLTIMA tarea del plan,
 * a propósito: así `xonecode` nunca queda roto a mitad de la implementación.
 */
export function decidirPiel(argv: string[] = []): PielElegida {
  if (argv.includes("--cli")) return "consola";
  if (argv.includes("--web")) return "web";
  return "consola";
}

export interface OpcionesWeb {
  puerto: number;
  abrir: boolean;
}

export function parsearOpcionesWeb(argv: string[]): OpcionesWeb {
  const abrir = !argv.includes("--no-abrir");
  const i = argv.indexOf("--puerto");
  if (i === -1) return { puerto: PUERTO_WEB_POR_OMISION, abrir };
  const bruto = argv[i + 1];
  const puerto = Number(bruto);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new ErrorDeUso(`--puerto espera un número entre 1 y 65535, y recibió «${bruto ?? ""}»`);
  }
  if (puerto === PUERTO_OAUTH) {
    throw new ErrorDeUso(
      `el puerto ${PUERTO_OAUTH} está reservado al callback de OAuth de CloudStudio: elige otro`
    );
  }
  return { puerto, abrir };
}
```

Si `ErrorDeUso` no existe todavía en `main.ts`, usar el mecanismo de error de uso que ya devuelve **código 64** en ese fichero, sin inventar uno nuevo: leer cómo se reporta hoy un `--modelo` mal escrito y seguir ese camino exacto.

- [ ] **Step 4: Ver pasar**

Run: `npx vitest run src/cli/main.test.ts`
Expected: PASS, y los tests de `decidirTui` intactos.

- [ ] **Step 5: Commit**

```bash
git add src/cli/main.ts src/cli/main.test.ts
git commit -m "feat(web): decidirPiel y las banderas --web/--cli/--puerto/--no-abrir"
```

```json:metadata
{"files": ["src/cli/main.ts", "src/cli/main.test.ts"], "verifyCommand": "npx vitest run src/cli/main.test.ts", "acceptanceCriteria": ["decidirPiel([]) === consola", "--cli gana a --web", "--puerto no numérico o 7634 es error de uso 64", "decidirTui sin cambios"], "modelTier": "mechanical"}
```

---

### Task 2: `core/actos.ts` — el acto deja de ser de la TUI

**Goal:** Extraer el tipo `Acto` de `cli/tui/store.ts` a `core/actos.ts`, porque ahora lo comparten dos pieles y el servidor web no puede importar de `cli/tui/`.

**Files:**
- Create: `src/core/actos.ts`
- Modify: `src/cli/tui/store.ts` (importa el tipo en vez de declararlo)
- Create: `src/core/actos.test.ts`

**Acceptance Criteria:**
- [ ] `Acto` vive en `core/actos.ts` y `cli/tui/store.ts` lo importa
- [ ] `core/imports.test.ts` sigue en verde (el fichero nuevo no importa nada prohibido)
- [ ] Toda la suite de la TUI sigue verde sin cambios de comportamiento
- [ ] `core/actos.ts` no importa nada de `cli/`

**Verify:** `npx vitest run src/core src/cli/tui` → PASS

**Steps:**

- [ ] **Step 1: Escribir el test de frontera del fichero nuevo**

```ts
// src/core/actos.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import type { Acto } from "./actos.js";

describe("core/actos", () => {
  it("no importa nada de cli/: el acto es de dominio, no de una piel", () => {
    const fuente = readFileSync(new URL("./actos.ts", import.meta.url), "utf8");
    expect(fuente).not.toMatch(/from ["']\.\.\/cli\//);
  });

  it("un acto de herramientas lleva LÍNEAS ya resumidas, nunca argumentos", () => {
    const acto: Acto = { tipo: "herramientas", lineas: ["read_file  src/app.xne"] };
    expect(acto.lineas[0]).not.toContain("{");
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run src/core/actos.test.ts`
Expected: FAIL — no existe `./actos.js`.

- [ ] **Step 3: Crear `core/actos.ts` con el tipo movido tal cual**

```ts
/**
 * Un acto del transcript: lo que ya no cambia y se pinta por su tipo.
 *
 * Vivía en `cli/tui/store.ts` porque solo lo usaba la TUI. Ahora lo usan DOS pieles —la
 * TUI y la web—, y el servidor web no puede importar de `cli/tui/` sin romper la frontera
 * de Ink. Así que baja a `core/`, que es donde vive lo que comparten las pieles.
 *
 * Ningún acto lleva argumentos de tool: `herramientas.lineas` son líneas YA resumidas por
 * `agent/resumenDeTool.ts`, con la lista blanca de campos por nombre de tool.
 */
export type Acto =
  | { tipo: "usuario"; texto: string }
  | { tipo: "asistente"; texto: string }
  /**
   * Las líneas de tool CONSECUTIVAS de un turno, en un solo acto: son paisaje, y el
   * transcript enseña solo las últimas. Una línea del asistente (o de sistema) cierra el
   * grupo; la siguiente tool abre otro.
   */
  | { tipo: "herramientas"; lineas: string[] }
  | { tipo: "sistema"; texto: string }
  | { tipo: "fase"; texto: string; ms: number }
  /** El cierre del turno: duración y, si la piel lo sabe, el modelo que lo corrió. */
  | { tipo: "fin"; ms: number; modelo?: string }
  | { tipo: "error"; texto: string };
```

- [ ] **Step 4: Reapuntar `cli/tui/store.ts`**

Borrar la declaración de `Acto` (líneas 13-27) y poner en su lugar:

```ts
import type { Acto } from "../../core/actos.js";
export type { Acto };
```

El `export type { Acto }` es obligatorio: `store.ts` lo re-exporta hoy y hay ficheros de la TUI que lo importan desde ahí.

- [ ] **Step 5: Verificar que nada se movió de sitio**

Run: `npx vitest run src/core src/cli && npm run typecheck`
Expected: PASS en ambos.

- [ ] **Step 6: Commit**

```bash
git add src/core/actos.ts src/core/actos.test.ts src/cli/tui/store.ts
git commit -m "refactor: el Acto baja a core/ — ahora lo comparten dos pieles"
```

```json:metadata
{"files": ["src/core/actos.ts", "src/core/actos.test.ts", "src/cli/tui/store.ts"], "verifyCommand": "npx vitest run src/core src/cli && npm run typecheck", "acceptanceCriteria": ["Acto vive en core/actos.ts", "store.ts lo importa y re-exporta", "imports.test.ts sigue verde", "typecheck limpio"], "modelTier": "mechanical"}
```

---

### Task 3: Los settings globales y los entornos

**Goal:** Que exista `~/.xonecode/settings.json` con la lista de entornos de CloudStudio y la base del workspace, con tipos puros en `core/` y un escritor en `agent/` que nunca destruye lo que había.

**Files:**
- Create: `src/core/settings.ts`
- Create: `src/core/settings.test.ts`
- Create: `src/agent/settingsEnDisco.ts`
- Create: `src/agent/settingsEnDisco.test.ts`

**Acceptance Criteria:**
- [ ] `validarSettings` acepta entornos bien formados y descarta los rotos sin lanzar
- [ ] `validarSettings` **rechaza claves de API**: un settings con `apiKey`/`api_key`/`clave` lanza, igual que hace `config.json`
- [ ] `rutaDeWorkspace(base, entorno, proyecto)` da `<base>/<entorno>/workspace/<proyecto>` y es pura
- [ ] `rutaDeWorkspace` rechaza un id de entorno o un nombre de proyecto con `/`, `\` o `..`
- [ ] `guardarEntorno` sobre un fichero con dos entornos deja los dos y añade el tercero
- [ ] `guardarEntorno` sobre un JSON roto **lanza sin escribir** y el fichero queda intacto
- [ ] El fichero se escribe con modo 0600 dentro de un directorio 0700

**Verify:** `npx vitest run src/core/settings.test.ts src/agent/settingsEnDisco.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Escribir los tests puros**

```ts
// src/core/settings.test.ts
import { describe, it, expect } from "vitest";
import { validarSettings, rutaDeWorkspace, SettingsConCredencial } from "./settings.js";

describe("validarSettings", () => {
  it("conserva los entornos bien formados", () => {
    const s = validarSettings({
      entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" }],
    });
    expect(s.entornos).toHaveLength(1);
    expect(s.entornos[0].id).toBe("webstudio");
  });

  it("descarta en silencio un entorno sin url, en vez de tumbar el arranque", () => {
    const s = validarSettings({ entornos: [{ id: "roto", nombre: "Roto" }] });
    expect(s.entornos).toHaveLength(0);
  });

  it("RECHAZA una clave de API: las credenciales van solo en auth.json", () => {
    expect(() => validarSettings({ entornos: [], apiKey: "sk-…" })).toThrow(SettingsConCredencial);
    expect(() => validarSettings({ entornos: [{ id: "a", nombre: "A", url: "https://x/mcp", token: "t" }] }))
      .toThrow(SettingsConCredencial);
  });

  it("sin entornos, la lista es vacía y no undefined", () => {
    expect(validarSettings({}).entornos).toEqual([]);
  });
});

describe("rutaDeWorkspace", () => {
  it("la base es configurable; la disposición de dentro la fija xonecode", () => {
    expect(rutaDeWorkspace("/home/u/.xonecode", "webstudio", "MinitMT"))
      .toBe("/home/u/.xonecode/webstudio/workspace/MinitMT");
  });

  it("un nombre con separador o .. no puede salirse de la base", () => {
    expect(() => rutaDeWorkspace("/base", "webstudio", "../fuera")).toThrow();
    expect(() => rutaDeWorkspace("/base", "..", "p")).toThrow();
    expect(() => rutaDeWorkspace("/base", "webstudio", "a/b")).toThrow();
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run src/core/settings.test.ts`
Expected: FAIL — no existe `./settings.js`.

- [ ] **Step 3: Implementar `core/settings.ts`**

```ts
/**
 * Los settings GLOBALES: los entornos de CloudStudio que el usuario registra, y dónde se
 * crean las copias locales.
 *
 * Un **entorno es un servidor CloudStudio**: hoy los dos oficiales, mañana el on-premise
 * de un cliente. Vive en global y no en el proyecto porque un entorno sirve a muchos
 * proyectos; el proyecto solo guarda a cuál pertenece.
 *
 * TypeScript puro: ni disco ni red. El disco lo pone `agent/settingsEnDisco.ts`.
 */
import { posix } from "node:path";

export interface Entorno {
  id: string;
  nombre: string;
  /** La URL del MCP. Es lo que define el entorno. */
  url: string;
  scopes?: readonly string[];
}

export interface Settings {
  entornos: Entorno[];
  /** La BASE del workspace. La disposición de dentro la fija `rutaDeWorkspace`. */
  workspace?: string;
}

/**
 * Publicable: no lleva nunca el valor sospechoso, solo el nombre del campo. Un error que
 * cite la credencial la filtraría al sitio donde menos se espera — un mensaje de consola.
 */
export class SettingsConCredencial extends Error {
  constructor(campo: string) {
    super(
      `settings.json no puede llevar credenciales (campo «${campo}»): van en ~/.xonecode/auth.json, modo 0600`
    );
  }
}

const CAMPOS_DE_CREDENCIAL = ["apikey", "api_key", "clave", "token", "secret", "password", "contrasena"];

function comprobarSinCredenciales(objeto: Record<string, unknown>): void {
  for (const campo of Object.keys(objeto)) {
    if (CAMPOS_DE_CREDENCIAL.includes(campo.toLowerCase())) throw new SettingsConCredencial(campo);
  }
}

function esEntorno(valor: unknown): valor is Entorno {
  if (typeof valor !== "object" || valor === null) return false;
  const e = valor as Record<string, unknown>;
  comprobarSinCredenciales(e);
  return typeof e.id === "string" && e.id !== ""
    && typeof e.nombre === "string" && e.nombre !== ""
    && typeof e.url === "string" && e.url !== "";
}

/**
 * Un entorno mal formado se DESCARTA en silencio; una credencial LANZA. La asimetría es
 * deliberada: un entorno roto es un dato de menos y el arranque puede seguir, pero una
 * credencial en el fichero equivocado es un fallo de seguridad que hay que ver.
 */
export function validarSettings(bruto: unknown): Settings {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return { entornos: [] };
  const objeto = bruto as Record<string, unknown>;
  comprobarSinCredenciales(objeto);
  const lista = Array.isArray(objeto.entornos) ? objeto.entornos : [];
  const entornos: Entorno[] = [];
  for (const candidato of lista) {
    if (esEntorno(candidato)) {
      const e = candidato as Entorno;
      entornos.push({
        id: e.id,
        nombre: e.nombre,
        url: e.url,
        ...(Array.isArray(e.scopes) ? { scopes: e.scopes.filter((s) => typeof s === "string") } : {}),
      });
    }
  }
  const workspace = typeof objeto.workspace === "string" ? objeto.workspace : undefined;
  return workspace === undefined ? { entornos } : { entornos, workspace };
}

/** Un segmento que no puede salirse de su carpeta ni inventar niveles. */
function segmentoSeguro(valor: string, que: string): string {
  if (valor === "" || valor === "." || valor === ".." || /[/\\]/.test(valor)) {
    throw new Error(`«${valor}» no vale como ${que}: no puede llevar separadores ni ser «..»`);
  }
  return valor;
}

/**
 * Dónde queda la copia local de un proyecto.
 *
 * La BASE es configurable (`settings.workspace`); la disposición de dentro NO, porque es
 * lo que hace predecible encontrar una copia sin consultar un índice.
 */
export function rutaDeWorkspace(base: string, entorno: string, proyecto: string): string {
  return posix.join(
    base,
    segmentoSeguro(entorno, "id de entorno"),
    "workspace",
    segmentoSeguro(proyecto, "nombre de proyecto")
  );
}
```

- [ ] **Step 4: Ver pasar los puros y escribir los de disco**

```ts
// src/agent/settingsEnDisco.test.ts
import { mkdtempSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { cargarSettings, guardarEntorno, SettingsRotosEnDisco } from "./settingsEnDisco.js";

function casa(): string {
  return mkdtempSync(join(tmpdir(), "xonecode-settings-"));
}

describe("settingsEnDisco", () => {
  it("sin fichero, devuelve settings vacíos y no crea nada", () => {
    const c = casa();
    expect(cargarSettings(c).entornos).toEqual([]);
  });

  it("guardar un entorno NO destruye los que había", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarEntorno(c, { id: "b", nombre: "B", url: "https://b/mcp" });
    guardarEntorno(c, { id: "c", nombre: "C", url: "https://c/mcp" });
    expect(cargarSettings(c).entornos.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("re-registrar el mismo id lo SUSTITUYE, no lo duplica", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarEntorno(c, { id: "a", nombre: "A renombrado", url: "https://a2/mcp" });
    const { entornos } = cargarSettings(c);
    expect(entornos).toHaveLength(1);
    expect(entornos[0].url).toBe("https://a2/mcp");
  });

  it("ante un JSON roto PARA SIN ESCRIBIR: recuperarlo por su cuenta sería inventar", () => {
    const c = casa();
    const ruta = join(c, ".xonecode", "settings.json");
    writeFileSync(join(c, ".xonecode") + "/settings.json", "{ esto no es json", { flag: "w" });
    expect(() => guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" }))
      .toThrow(SettingsRotosEnDisco);
    expect(readFileSync(ruta, "utf8")).toBe("{ esto no es json");
  });

  it("el fichero queda 0600 y su carpeta 0700", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    const ruta = join(c, ".xonecode", "settings.json");
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    expect(statSync(join(c, ".xonecode")).mode & 0o777).toBe(0o700);
  });
});
```

Nota para quien implemente: el test de «JSON roto» necesita que la carpeta exista antes de escribir el fichero corrupto. Crear `join(c, ".xonecode")` con `mkdirSync(..., { recursive: true, mode: 0o700 })` en ese test antes del `writeFileSync`.

- [ ] **Step 5: Implementar `agent/settingsEnDisco.ts`**

Copiar la disciplina de `agent/authEnDisco.ts` **literalmente**, porque es el contrato del repo:
1. Leer el fichero **crudo** con `JSON.parse`. Si falla, lanzar `SettingsRotosEnDisco` y **no escribir**.
2. Fusionar sobre el objeto CRUDO, no sobre el resultado de `validarSettings` — validar descarta entradas raras en silencio, y fusionar sobre lo validado las borraría del disco.
3. Escribir a un temporal con `openSync(..., "wx", 0o600)` y `renameSync`, con la carpeta creada `{ recursive: true, mode: 0o700 }`.
4. `cargarSettings` sí devuelve el resultado de `validarSettings` (el lector puede ser tolerante; el escritor no).

La firma:

```ts
export class SettingsRotosEnDisco extends Error {}
export function rutaSettings(casa?: string): string;
export function cargarSettings(casa?: string): Settings;
export function guardarEntorno(casa: string | undefined, entorno: Entorno): { ruta: string };
export function guardarWorkspace(casa: string | undefined, base: string): { ruta: string };
```

`casa` por omisión es `homedir()`, e inyectable **porque los tests no pueden tocar el `~/.xonecode` real** — ya hay precedente en `src/cli/main.test.ts` (commit `7bca129`, «aísla main.test.ts del ~/.xonecode real»).

- [ ] **Step 6: Ver pasar**

Run: `npx vitest run src/core/settings.test.ts src/agent/settingsEnDisco.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/settings.ts src/core/settings.test.ts src/agent/settingsEnDisco.ts src/agent/settingsEnDisco.test.ts
git commit -m "feat(web): settings globales — los entornos de CloudStudio y la base del workspace"
```

```json:metadata
{"files": ["src/core/settings.ts", "src/core/settings.test.ts", "src/agent/settingsEnDisco.ts", "src/agent/settingsEnDisco.test.ts"], "verifyCommand": "npx vitest run src/core/settings.test.ts src/agent/settingsEnDisco.test.ts", "acceptanceCriteria": ["validarSettings rechaza claves de API", "rutaDeWorkspace es pura y rechaza .. y separadores", "guardarEntorno no destruye lo que había", "JSON roto para sin escribir", "0600/0700"], "modelTier": "standard"}
```

---

### Task 4: Los tokens de OAuth, por entorno

**Goal:** Que `~/.xonecode/cloudstudio-oauth.json` deje de ser un único juego de tokens y pase a estar indexado por entorno, con una migración que no pierde el que ya existe.

**Files:**
- Modify: `src/agent/cloudstudioMcp.ts` (`EstadoOAuth`, `leerEstado`, `guardarEstado`, líneas 34-40 y 154-180)
- Modify: `src/agent/cloudstudioMcp.test.ts`

**Acceptance Criteria:**
- [ ] Un fichero nuevo se escribe como `{ version: 2, porEntorno: { … } }`
- [ ] Un fichero SIN `version` (el plano de hoy) se lee como el juego de la clave `legado` y **no se pierde**
- [ ] `legado` se adopta como el juego del primer entorno registrado cuya `url` sea `https://mcp.xonewebstudio.com/mcp`, y solo entonces
- [ ] Si nunca se registra ese entorno, `legado` queda intacto para siempre
- [ ] Cerrar sesión en un entorno no toca los tokens de los demás
- [ ] Un fichero corrupto sigue devolviendo `{}` sin imprimir su contenido (comportamiento actual, no se toca)

**Verify:** `npx vitest run src/agent/cloudstudioMcp.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Escribir los tests**

```ts
// en src/agent/cloudstudioMcp.test.ts
describe("estado OAuth por entorno", () => {
  it("un fichero plano (el de hoy) no se pierde: pasa a la clave legado", () => {
    const ruta = ficheroTemporalCon({ tokens: { access_token: "viejo" }, scopes: ["a"] });
    const estado = leerEstado(ruta);
    expect(estado.version).toBe(2);
    expect(estado.porEntorno.legado?.tokens?.access_token).toBe("viejo");
  });

  it("legado se adopta al registrar el entorno de la URL por omisión, y NO antes", () => {
    const ruta = ficheroTemporalCon({ tokens: { access_token: "viejo" } });
    // Un entorno cualquiera no se lo lleva.
    adoptarLegadoSiProcede(ruta, { id: "otro", nombre: "Otro", url: "https://on-prem/mcp" });
    expect(leerEstado(ruta).porEntorno.legado).toBeDefined();
    expect(leerEstado(ruta).porEntorno.otro).toBeUndefined();
    // El de la URL por omisión sí.
    adoptarLegadoSiProcede(ruta, { id: "webstudio", nombre: "WS", url: URL_CLOUDSTUDIO_POR_OMISION });
    expect(leerEstado(ruta).porEntorno.webstudio?.tokens?.access_token).toBe("viejo");
    expect(leerEstado(ruta).porEntorno.legado).toBeUndefined();
  });

  it("cerrar sesión en un entorno deja intactos los demás", () => {
    const ruta = ficheroTemporalVacio();
    guardarEstadoDeEntorno(ruta, "a", { tokens: { access_token: "ta" } });
    guardarEstadoDeEntorno(ruta, "b", { tokens: { access_token: "tb" } });
    olvidarEntorno(ruta, "a");
    expect(leerEstado(ruta).porEntorno.a).toBeUndefined();
    expect(leerEstado(ruta).porEntorno.b?.tokens?.access_token).toBe("tb");
  });

  it("un fichero corrupto sigue dando estado vacío y no imprime nada", () => {
    const ruta = ficheroTemporalCrudo("{{{");
    expect(leerEstado(ruta).porEntorno).toEqual({});
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run src/agent/cloudstudioMcp.test.ts -t "por entorno"`
Expected: FAIL.

- [ ] **Step 3: Cambiar la forma del estado**

```ts
/** El juego de credenciales de UN entorno. Es el EstadoOAuth plano de siempre. */
type EstadoDeEntorno = {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  /** Permisos concedidos junto al token; evita reautorizar si el servidor omite `scope`. */
  scopes?: string[];
};

/**
 * El fichero entero: un juego POR ENTORNO.
 *
 * Antes era un solo juego plano, porque solo había un CloudStudio. Con entornos
 * registrables —incluido el on-premise de un cliente— hace falta indexar, y cerrar sesión
 * en uno no puede tocar a los demás.
 *
 * La clave `legado` es el fichero plano de antes. NO se puede adivinar a qué entorno
 * pertenecía: el formato viejo no guarda la URL. Así que se conserva intacto y se adopta
 * solo al registrar el entorno de `URL_CLOUDSTUDIO_POR_OMISION`, que es la única URL que
 * ese fichero pudo haber usado.
 */
type EstadoOAuth = {
  version: 2;
  porEntorno: Record<string, EstadoDeEntorno>;
};
```

`leerEstado` detecta el formato viejo por la **ausencia de `version`** y lo envuelve en `{ version: 2, porEntorno: { legado: <plano> } }` **sin escribir** — la migración se materializa en la primera escritura, no al leer, para que un arranque de solo lectura no modifique el disco del usuario.

`guardarEstado` conserva el `guardarEstadoDeEntorno` con la misma mecánica de temporal + `rename` + modos 0600/0700 que ya tiene (líneas 165-180), y añade `olvidarEntorno(ruta, id)` y `adoptarLegadoSiProcede(ruta, entorno)`.

- [ ] **Step 4: Reapuntar los llamadores**

El proveedor OAuth de `cloudstudioMcp.ts` que hoy lee y escribe el estado plano tiene que recibir **el id del entorno** y operar sobre `porEntorno[id]`. Buscar todos los usos con:

```bash
grep -n "leerEstado\|guardarEstado\|this.estado" src/agent/cloudstudioMcp.ts
```

- [ ] **Step 5: Ver pasar toda la suite de CloudStudio**

Run: `npx vitest run src/agent/cloudstudioMcp.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/agent/cloudstudioMcp.ts src/agent/cloudstudioMcp.test.ts
git commit -m "feat(web): los tokens de OAuth, indexados por entorno (con migración a legado)"
```

```json:metadata
{"files": ["src/agent/cloudstudioMcp.ts", "src/agent/cloudstudioMcp.test.ts"], "verifyCommand": "npx vitest run src/agent/cloudstudioMcp.test.ts && npm run typecheck", "acceptanceCriteria": ["formato v2 indexado por entorno", "el plano de hoy va a legado y no se pierde", "legado se adopta solo con la URL por omisión", "cerrar sesión en uno no toca los demás", "corrupto sigue dando vacío sin imprimir"], "modelTier": "standard"}
```

---

### Task 5: El servidor HTTP

**Goal:** Un `node:http` en loopback que sirve `apps/web/dist`, autentica por token, comprueba `Origin`/`Host` en toda petición y **no sirve jamás** nada de `.xonecode`.

**Files:**
- Create: `src/web/servidor/servidor.ts`
- Create: `src/web/servidor/servidor.test.ts`

**Acceptance Criteria:**
- [ ] Escucha solo en `127.0.0.1`; no hay forma de pedir `0.0.0.0`
- [ ] Una petición sin token y sin cookie a una ruta de API es **401**
- [ ] El token de la URL se canjea por cookie `HttpOnly`, `SameSite=Strict`
- [ ] Una petición con `Host` que no sea `127.0.0.1:<puerto>` o `localhost:<puerto>` es **403** (DNS rebinding)
- [ ] Una petición con `Origin` de otro sitio es **403**
- [ ] `GET /../../etc/passwd` y cualquier recorrido fuera de `dist` es **403**, tanto crudo como percent-encoded (`%2e%2e%2f`)
- [ ] Los tests de `Host` y de recorrido usan `node:http.request`, **no `fetch`**: medido en node 22.22.3, `fetch` ignora un `Host` falseado y normaliza el `..` antes de enviar, así que con `fetch` esos dos tests no probarían nada
- [ ] `POST` a un estático es **405**; un fichero que no existe es **404** vacío
- [ ] Una ruta que resuelva dentro de `.xonecode` (del proyecto o del home) es **403**, aunque exista
- [ ] `EADDRINUSE` produce un mensaje que dice el puerto y `--puerto`, no una traza
- [ ] Los tests corren **sin navegador**: peticiones con `fetch` contra el servidor levantado en un puerto efímero

**Verify:** `npx vitest run src/web/servidor/servidor.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Escribir los tests de seguridad primero — son el motivo del fichero**

```ts
// src/web/servidor/servidor.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
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
    const { base } = await levantar();
    expect(base).toContain("127.0.0.1");
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
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run src/web/servidor/servidor.test.ts`
Expected: FAIL — no existe `./servidor.js`.

- [ ] **Step 3: Implementar**

Puntos que la implementación **no puede** improvisar:

```ts
/**
 * El servidor de la consola web: `node:http`, loopback, sin framework.
 *
 * Tres cosas son de seguridad y no de estilo:
 *  - **Loopback y nada más.** No hay bandera para `0.0.0.0`: un servidor local que abre
 *    la red expone el proyecto entero del usuario y su `auth.json` está a un bug de
 *    distancia.
 *  - **`Host` y `Origin` en TODA petición.** El ataque real a un servidor local no es que
 *    alguien escanee el puerto: es DNS rebinding, donde una web cualquiera resuelve su
 *    dominio a 127.0.0.1 y le habla a este proceso desde el navegador de la víctima. Un
 *    `Host` que no sea loopback, o un `Origin` que no sea el nuestro, es 403.
 *  - **`.xonecode` no se sirve NUNCA.** Ni el del proyecto ni el del home. Va antes que
 *    la comprobación de existencia, para que un 403 y un 404 no cuenten cosas distintas.
 */
```

- La raíz de estáticos se resuelve con `realpathSync` y toda ruta pedida se resuelve igual antes de comprobar que sigue **dentro**; comparar cadenas sin resolver deja pasar enlaces simbólicos.
- El token es `randomBytes(32).toString("base64url")`, distinto en cada arranque, y **no se registra en ningún log**.
- `Set-Cookie` con `HttpOnly`, `SameSite=Strict`, `Path=/`, sin `Secure` (es `http://` loopback: con `Secure` el navegador la descartaría).
- La comparación del token es `timingSafeEqual` sobre buffers de la misma longitud.
- `cerrar()` hace `close()` **y** `closeAllConnections()`: el SSE mantiene respuestas abiertas y sin el cierre forzado el proceso se queda colgado.
- Firma: `arrancarServidor(opciones: { puerto: number; raizEstaticos: string }): Promise<ServidorWeb>` con `{ puerto, token, url, registrarRuta, cerrar }`.

- [ ] **Step 4: Ver pasar**

Run: `npx vitest run src/web/servidor/servidor.test.ts`
Expected: PASS, los once.

- [ ] **Step 5: Commit**

```bash
git add src/web/servidor/servidor.ts src/web/servidor/servidor.test.ts
git commit -m "feat(web): el servidor HTTP — loopback, token, Origin/Host y .xonecode nunca servido"
```

```json:metadata
{"files": ["src/web/servidor/servidor.ts", "src/web/servidor/servidor.test.ts"], "verifyCommand": "npx vitest run src/web/servidor/servidor.test.ts", "acceptanceCriteria": ["loopback y sin opción de 0.0.0.0", "401 sin token", "cookie HttpOnly SameSite=Strict", "403 por Host o Origin ajenos", "403 en recorrido y en .xonecode", "405/404", "EADDRINUSE legible"], "modelTier": "standard"}
```

---

### Task 6: `pielWeb` — la Piel que produce actos

**Goal:** Una implementación de `Piel` que traduce los eventos del turno a la lista de actos, con la misma semántica que la TUI (tokens a colchón, cascada de fases, agrupación de tools) y **sin argumentos de tool**.

**Files:**
- Create: `src/web/servidor/pielWeb.ts`
- Create: `src/web/servidor/pielWeb.test.ts`
- Modify: `src/core/actos.ts` (recibe `conLineaDeTool` y `prefijoDeCierre`)
- Modify: `src/core/actos.test.ts`
- Modify: `src/cli/tui/store.ts` (las importa y re-exporta, como ya hace con `Acto`)

**Acceptance Criteria:**
- [ ] Implementa `Piel` entera, `fase?` y `notificacion?` incluidos (la web sí sabe animar fases y reciclar avisos)
- [ ] Los tokens se acumulan en un colchón y `cerrarLinea` los solidifica en un acto `asistente`
- [ ] Las líneas de tool consecutivas se agrupan en un solo acto `herramientas`
- [ ] La línea de **cierre** de una racha (`→ lee ×3 — a, b, c`) **sustituye** a su apertura (`→ lee a`) en vez de añadirse: el colapsador de `core/notify.ts` escribe las dos porque stdio solo añade, pero una piel que repinta enseñaría dos líneas para la misma racha
- [ ] `conLineaDeTool` y `prefijoDeCierre` se mueven de `cli/tui/store.ts` a `core/actos.ts` y las usan las DOS pieles: duplicar esa lógica sutil es cómo divergen
- [ ] Una línea de asistente o de sistema cierra el grupo de herramientas
- [ ] `fin` produce un acto `fin` con los ms
- [ ] `pausa` produce un acto `sistema` con la **descripción** del pendiente, y **nunca** el diff
- [ ] Ningún acto producido contiene una llave `{` que venga de argumentos de tool

**Verify:** `npx vitest run src/web/servidor/pielWeb.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Escribir los tests**

```ts
// src/web/servidor/pielWeb.test.ts
import { describe, it, expect } from "vitest";
import { crearPielWeb } from "./pielWeb.js";

describe("pielWeb", () => {
  it("los tokens se solidifican en un acto de asistente al cerrar la línea", () => {
    const { piel, actos } = crearPielWeb();
    piel.token("Hola");
    piel.token(" mundo");
    expect(actos()).toHaveLength(0);          // aún es colchón
    piel.cerrarLinea();
    expect(actos()).toEqual([{ tipo: "asistente", texto: "Hola mundo" }]);
  });

  it("las líneas de tool consecutivas van en UN acto de herramientas", () => {
    const { piel, actos } = crearPielWeb();
    piel.linea("read_file  src/app.xne");
    piel.linea("grep  colecciones");
    expect(actos()).toEqual([{ tipo: "herramientas", lineas: ["read_file  src/app.xne", "grep  colecciones"] }]);
  });

  it("el cierre de una racha SUSTITUYE su apertura, no se añade detrás", () => {
    const { piel, actos } = crearPielWeb();
    // Lo que el colapsador del motor emite de verdad para tres lecturas seguidas:
    // la apertura al abrir la racha, y el cierre con el ×N al terminarla.
    piel.linea("→ lee src/app.xne");
    piel.linea("→ lee ×3 — src/app.xne, src/b.xne, src/c.xne");
    expect(actos()).toEqual([
      { tipo: "herramientas", lineas: ["→ lee ×3 — src/app.xne, src/b.xne, src/c.xne"] },
    ]);
  });

  it("una notificación cierra el grupo de herramientas", () => {
    const { piel, actos } = crearPielWeb();
    piel.linea("read_file  src/app.xne");
    piel.notificacion!("⚠ el verificador es de pega");
    piel.linea("grep  colecciones");
    expect(actos().map((a) => a.tipo)).toEqual(["herramientas", "sistema", "herramientas"]);
  });

  it("una pausa lleva la DESCRIPCIÓN del pendiente y jamás el contenido", () => {
    const { piel, actos } = crearPielWeb();
    piel.pausa([{ id: "1", origen: "dev", descripcion: "escribir src/app.xne", decisionesPermitidas: ["si", "no"] }]);
    const acto = actos()[0];
    expect(acto).toMatchObject({ tipo: "sistema" });
    expect(JSON.stringify(acto)).toContain("escribir src/app.xne");
    expect(JSON.stringify(acto)).not.toMatch(/<\?xml|\+\+\+|---/);   // ni fichero ni diff
  });

  it("fin cierra el turno con los milisegundos", () => {
    const { piel, actos } = crearPielWeb();
    piel.fin(1234);
    expect(actos()).toEqual([{ tipo: "fin", ms: 1234 }]);
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run src/web/servidor/pielWeb.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
/**
 * La piel web: la MISMA `Piel` de `core/turno.ts` que implementan stdio y la TUI, con el
 * transcript como destino en vez de stdout.
 *
 * Es casi la lógica del store de la TUI (`cli/tui/store.ts`) —tokens a colchón, fases en
 * cascada, tools agrupadas—, y eso es a propósito: lo que la TUI pinta es lo que la web
 * recibe, byte por byte del mismo evento. No hay un segundo formato ni un canal crudo.
 */
import type { Piel } from "../../core/turno.js";
import type { Acto } from "../../core/actos.js";
import type { PendienteDeAprobacion } from "../../core/events.js";

export interface PielWeb {
  piel: Piel;
  /** La lista de actos, para el transporte y para la persistencia. */
  actos: () => readonly Acto[];
  /** Se llama con cada acto nuevo: es por donde el transporte lo emite. */
  alActo: (escucha: (acto: Acto) => void) => void;
}

export function crearPielWeb(): PielWeb { /* … */ }
```

Reglas de la implementación:
- `token` acumula en un colchón; `cerrarLinea` lo vuelca como `{tipo:"asistente"}` **solo si no está vacío**.
- `linea` se anexa al último acto si es `herramientas` **pasando por `conLineaDeTool`**; si no,
  abre uno nuevo. Esa función y su ayudante `prefijoDeCierre` viven hoy en
  `cli/tui/store.ts` (líneas 28-49) y **se mueven a `core/actos.ts`** en esta tarea, por la
  misma razón por la que el `Acto` bajó ahí en la Task 2: ahora las usan dos pieles, son
  puras, y una copia divergiría. `store.ts` pasa a importarla y re-exportarla.
- `notificacion` y `pausa` producen `{tipo:"sistema"}` y **cierran** el grupo de herramientas.
- `fase(texto)` produce `{tipo:"fase", texto, ms}` sustituyendo la fase anterior si aún está activa —igual que la cascada del store—.
- `pausa` mapea `pendientes` a una línea por pendiente con `origen` y `descripcion` y **nada más**. El diff no está aquí; viaja en el mensaje de aprobación (Task 7).

- [ ] **Step 4: Ver pasar**

Run: `npx vitest run src/web/servidor/pielWeb.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/servidor/pielWeb.ts src/web/servidor/pielWeb.test.ts
git commit -m "feat(web): pielWeb — la Piel de siempre, con el transcript como destino"
```

```json:metadata
{"files": ["src/web/servidor/pielWeb.ts", "src/web/servidor/pielWeb.test.ts"], "verifyCommand": "npx vitest run src/web/servidor/pielWeb.test.ts && npm run typecheck", "acceptanceCriteria": ["Piel completa con fase y notificacion", "colchón de tokens", "agrupación de herramientas", "pausa sin diff", "ningún argumento de tool"], "modelTier": "standard"}
```

---

### Task 7: `consolaWeb` y el transporte (SSE + POST), con la aprobación fail-closed

**Goal:** Una implementación de `Consola` alimentada por el navegador, con SSE para servidor→cliente y `POST /accion` para cliente→servidor, y una aprobación que **rechaza por transporte**.

**Files:**
- Create: `src/web/servidor/transporte.ts`
- Create: `src/web/servidor/consolaWeb.ts`
- Create: `src/web/servidor/consolaWeb.test.ts`

**Acceptance Criteria:**
- [ ] `consolaWeb` implementa `Consola`: `lineas`, `escribir`, `preguntar`, `leerSecreto`, `interactivo: true`, `seleccionar`, `piel`, `aprobacionesTui`, `catalogoModelos`, `guardarModeloGlobal`
- [ ] `lineas` es una cola asíncrona: cada prosa que llega por `POST /accion` sale por el iterador
- [ ] Cerrar la sesión agota `lineas` (EOF), y el lazo de `correrConsola` **retorna**; no cuelga
- [ ] Una reconexión del SSE **reemite todos los actos** desde el principio, sin duplicarlos en el servidor
- [ ] La aprobación con el cliente desconectado devuelve **rechazo** para todos los pendientes
- [ ] La aprobación que expira (timeout) devuelve **rechazo**
- [ ] Solo una decisión explícita de aprobación aprueba; cualquier otra cosa, y la ausencia, es rechazo. **`Decision` es `{ type: "approve" | "reject"; message?: string }`** (`vendor/hitl.ts:26`), no una cadena: un test que compare contra `"si"` pasaría sin probar nada
- [ ] El **diff viaja solo** en el mensaje de aprobación y no aparece en ningún acto ni en el SSE de eventos
- [ ] `leerSecreto` no deja el secreto en ningún acto, ningún log ni ningún evento

**Verify:** `npx vitest run src/web/servidor/consolaWeb.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Escribir los tests, empezando por los de rechazo**

```ts
// src/web/servidor/consolaWeb.test.ts
import { describe, it, expect } from "vitest";
import { crearConsolaWeb } from "./consolaWeb.js";

import { REJECT_MESSAGE, type Decision } from "../../vendor/hitl.js";

const PENDIENTE = { id: "1", origen: "dev", descripcion: "escribir src/app.xne", decisionesPermitidas: ["approve", "reject"] };

/**
 * `Decision` NO es una cadena: es `{ type: "approve" | "reject"; message?: string }`
 * (`vendor/hitl.ts:26`). Los ayudantes evitan que un test compare contra una forma
 * inventada y pase por accidente.
 */
const aprobado = (d: Decision | undefined) => d?.type === "approve";
const rechazado = (d: Decision | undefined) => d?.type === "reject";

describe("consolaWeb: la entrada", () => {
  it("la prosa que llega por accion sale por el iterador de líneas", async () => {
    const c = crearConsolaWeb();
    c.recibir({ clase: "prosa", texto: "haz un listado" });
    const it = c.consola.lineas[Symbol.asyncIterator]();
    expect((await it.next()).value).toBe("haz un listado");
  });

  it("cerrar agota las líneas: es EOF, y el lazo de correrConsola retorna", async () => {
    const c = crearConsolaWeb();
    c.cerrar();
    const it = c.consola.lineas[Symbol.asyncIterator]();
    expect((await it.next()).done).toBe(true);
  });
});

describe("consolaWeb: la aprobación es fail-closed POR TRANSPORTE", () => {
  it("sin cliente conectado, todo se RECHAZA", async () => {
    const c = crearConsolaWeb();
    c.desconectar();
    const d = await c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    expect(rechazado(d.get("1"))).toBe(true);
    expect(d.get("1")?.message).toBe(REJECT_MESSAGE);
  });

  it("si expira el plazo, se RECHAZA: el silencio no aprueba", async () => {
    const c = crearConsolaWeb({ msDeEspera: 10 });
    c.conectar();
    const d = await c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    expect(rechazado(d.get("1"))).toBe(true);
  });

  it("solo un «si» explícito aprueba", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    c.recibir({ clase: "decision", decisiones: { "1": "approve" } });
    expect(aprobado((await promesa).get("1"))).toBe(true);
  });

  it("una decisión que no entendemos es RECHAZO, no un pase", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    c.recibir({ clase: "decision", decisiones: { "1": "quizá" } });
    expect(rechazado((await promesa).get("1"))).toBe(true);
  });

  it("desconectarse MIENTRAS se decide es rechazo", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    c.desconectar();
    expect(rechazado((await promesa).get("1"))).toBe(true);
  });
});

describe("consolaWeb: qué NO viaja", () => {
  it("el diff va en el mensaje de aprobación y en ningún acto ni evento", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    // `LineaDeDiff` es `{ tipo: "igual"|"anadido"|"quitado"; texto }` (`core/diff.ts:12`).
    const diffs = new Map([["src/app.xne", [{ tipo: "anadido" as const, texto: "<coleccion/>" }]]]);
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), diffs);
    expect(JSON.stringify(c.mensajesDeAprobacion())).toContain("<coleccion/>");
    expect(JSON.stringify(c.actos())).not.toContain("<coleccion/>");
    expect(JSON.stringify(c.eventosEmitidos())).not.toContain("<coleccion/>");
    c.recibir({ clase: "decision", decisiones: { "1": "reject" } });
    await promesa;
  });

  it("un secreto no queda en actos ni en eventos", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.leerSecreto("clave de Anthropic");
    c.recibir({ clase: "secreto", valor: "sk-ant-NO-DEBE-SALIR" });
    expect(await promesa).toBe("sk-ant-NO-DEBE-SALIR");
    expect(JSON.stringify(c.actos())).not.toContain("sk-ant-NO-DEBE-SALIR");
    expect(JSON.stringify(c.eventosEmitidos())).not.toContain("sk-ant-NO-DEBE-SALIR");
  });
});

describe("consolaWeb: reconexión", () => {
  it("reconectar reemite todos los actos y no los duplica en el servidor", () => {
    const c = crearConsolaWeb();
    c.conectar();
    c.consola.escribir("primera\n");
    c.consola.escribir("segunda\n");
    const antes = c.actos().length;
    c.desconectar();
    const reemitidos = c.conectar();
    expect(reemitidos).toHaveLength(antes);
    expect(c.actos()).toHaveLength(antes);
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run src/web/servidor/consolaWeb.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar el transporte**

```ts
/**
 * SSE del servidor al cliente, `POST /accion` del cliente al servidor.
 *
 * No es WebSocket a propósito: aquí hay UN stream, no un mux de streams lógicos como en
 * deepseek —que tiene 40 paquetes cliente hablando a la vez—. Con SSE la reconexión es
 * trivial porque el servidor guarda la lista de actos y la reemite entera; con WS habría
 * que reimplementar generaciones y reanudación para no ganar nada.
 */
export type MensajeAlCliente =
  | { clase: "acto"; acto: Acto }
  | { clase: "reemision"; actos: Acto[] }
  | { clase: "pregunta"; texto: string }
  | { clase: "selector"; selector: SelectorDeConsola }
  | { clase: "secreto"; pregunta: string }
  /** El ÚNICO mensaje que lleva contenido de fichero: es el paso donde se DECIDE sobre él. */
  | { clase: "aprobacion"; pendientes: PendienteDeAprobacion[]; ficheros: Record<string, string>; diffs: Record<string, LineaDeDiff[]> };

export type MensajeDelCliente =
  | { clase: "prosa"; texto: string }
  | { clase: "respuesta"; texto: string }
  | { clase: "eleccion"; id: string }
  | { clase: "secreto"; valor: string }
  | { clase: "decision"; decisiones: Record<string, string> };
```

- [ ] **Step 4: Implementar `consolaWeb`**

- `lineas` es un `AsyncIterable<string>` sobre una cola con promesas pendientes; `cerrar()` la agota (EOF, no cuelgue) — el mismo pacto que readline al acabarse un pipe.
- `preguntar`, `leerSecreto` y `seleccionar` son la misma mecánica: emiten su mensaje, esperan la respuesta correspondiente, y **si el cliente se desconecta responden lo mismo que responde un `rl` cerrado**: cadena vacía. En `aprobar.ts` eso ya significa rechazo.
- `aprobacionesTui`: construye el `Map` con **`{ type: "reject", message: REJECT_MESSAGE }` para todos los pendientes de entrada**, y solo lo cambia a `{ type: "approve" }` cuando llega una decisión de aprobación explícita para ese id. Reutiliza `interpretAnswer` de `vendor/hitl.ts` para decidir qué cuenta como aprobación, en vez de comparar cadenas a mano: es la misma función que ya usa `cli/aprobar.ts`, y dos criterios de «esto aprueba» acabarían divergiendo. Así el fallo de cualquier camino —desconexión, timeout, decisión ilegible, respuesta parcial— cae en rechazo sin ninguna rama extra. `msDeEspera` es inyectable para poder probar el timeout sin esperar de verdad.
- El colchón de reemisión guarda **actos**, no mensajes: los de pregunta y aprobación son de un momento y no se reemiten (un cliente que reconecta recibe el estado, y el turno vuelve a pedir lo que necesite).

- [ ] **Step 5: Ver pasar**

Run: `npx vitest run src/web/servidor/consolaWeb.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/servidor/transporte.ts src/web/servidor/consolaWeb.ts src/web/servidor/consolaWeb.test.ts
git commit -m "feat(web): consolaWeb y el transporte SSE — la aprobación rechaza por transporte"
```

```json:metadata
{"files": ["src/web/servidor/transporte.ts", "src/web/servidor/consolaWeb.ts", "src/web/servidor/consolaWeb.test.ts"], "verifyCommand": "npx vitest run src/web/servidor/consolaWeb.test.ts && npm run typecheck", "acceptanceCriteria": ["Consola completa", "lineas como cola con EOF", "reconexión reemite sin duplicar", "desconexión/timeout/decisión ilegible = rechazo", "solo «si» aprueba", "el diff solo en el mensaje de aprobación", "el secreto no queda en actos ni eventos"], "modelTier": "frontier"}
```

---

### Task 8: Las sesiones se guardan y se reabren

**Goal:** Que cada proyecto guarde sus sesiones en `.xonecode/sesiones/` como actos, y que reabrir una reemita lo que pasó dejando claro que es **histórica** hasta el primer turno nuevo.

**Files:**
- Create: `src/web/servidor/sesiones.ts`
- Create: `src/web/servidor/sesiones.test.ts`

**Acceptance Criteria:**
- [ ] `.xonecode/sesiones/indice.json` lista `{id, titulo, creada, ultimoTurno}` por sesión
- [ ] `.xonecode/sesiones/<id>.jsonl` guarda **un acto por línea**
- [ ] El título de una sesión sale de la primera prosa del usuario, recortada
- [ ] Reabrir devuelve los actos en orden y marca la sesión como histórica
- [ ] El primer turno nuevo sobre una sesión reabierta quita la marca
- [ ] Un `.jsonl` con una línea corrupta **salta esa línea** y devuelve las demás; no tumba la reapertura
- [ ] Nada de lo guardado contiene diffs ni contenido de fichero
- [ ] La escritura es por anexado (`appendFile`), no reescribiendo el fichero entero

**Verify:** `npx vitest run src/web/servidor/sesiones.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Escribir los tests**

```ts
// src/web/servidor/sesiones.test.ts
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { crearSesion, anotarActo, listarSesiones, reabrirSesion } from "./sesiones.js";

const proyecto = () => mkdtempSync(join(tmpdir(), "xonecode-proyecto-"));

describe("sesiones por proyecto", () => {
  it("el título sale de la primera prosa del usuario", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "añade una colección de clientes" });
    expect(listarSesiones(raiz)[0].titulo).toBe("añade una colección de clientes");
  });

  it("se guarda UN ACTO POR LÍNEA y se anexa, no se reescribe", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "hola" });
    anotarActo(raiz, id, { tipo: "asistente", texto: "qué tal" });
    const bruto = readFileSync(join(raiz, ".xonecode", "sesiones", `${id}.jsonl`), "utf8");
    expect(bruto.trimEnd().split("\n")).toHaveLength(2);
  });

  it("reabrir devuelve los actos en orden y la marca como histórica", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "uno" });
    anotarActo(raiz, id, { tipo: "asistente", texto: "dos" });
    const abierta = reabrirSesion(raiz, id);
    expect(abierta.actos.map((a) => ("texto" in a ? a.texto : ""))).toEqual(["uno", "dos"]);
    expect(abierta.historica).toBe(true);
  });

  it("una línea corrupta se SALTA y las demás siguen: no tumba la reapertura", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "uno" });
    const ruta = join(raiz, ".xonecode", "sesiones", `${id}.jsonl`);
    writeFileSync(ruta, readFileSync(ruta, "utf8") + "{esto no es json\n");
    anotarActo(raiz, id, { tipo: "asistente", texto: "tres" });
    expect(reabrirSesion(raiz, id).actos).toHaveLength(2);
  });

  it("una sesión reabierta no vuelve a nacer: el id se conserva", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    expect(reabrirSesion(raiz, id).id).toBe(id);
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run src/web/servidor/sesiones.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
/**
 * Las sesiones de un proyecto, en su `.xonecode/sesiones/`.
 *
 * Ahí y no en global porque la sesión es del proyecto, ya hay precedente
 * (`conversation_history/`), la carpeta está denegada entera al agente y **no sube nunca**
 * a CloudStudio.
 *
 * Se guardan **actos**, no `DomainEvent`. La distinción no es cosmética: ningún evento
 * lleva el texto que escribió el usuario, así que un fichero de eventos daría una sesión
 * reabierta con respuestas y sin preguntas.
 *
 * Reabrir es RELEER, no seguir hablando: el hilo del agente vive en un `MemorySaver` que
 * muere con el proceso. La sesión reabierta se marca `historica` y la interfaz lo dice,
 * porque fingir que la conversación continúa cuando el modelo no recuerda nada sería
 * justo la clase de mentira muda que este repo evita.
 */
export function crearSesion(raiz: string): string;
export function anotarActo(raiz: string, id: string, acto: Acto): void;
export function listarSesiones(raiz: string): { id: string; titulo: string; creada: string; ultimoTurno: string }[];
export function reabrirSesion(raiz: string, id: string): { id: string; actos: Acto[]; historica: boolean };
```

- El id es `randomUUID()`, y se valida antes de usarlo como nombre de fichero (mismo cuidado que `segmentoSeguro` de Task 3): un id que venga del cliente no puede componer una ruta.
- El título se fija en el **primer** acto `usuario` y no se vuelve a tocar; se recorta a 80 caracteres.
- `indice.json` se reescribe entero (es pequeño); el `.jsonl` se **anexa**.

- [ ] **Step 4: Ver pasar**

Run: `npx vitest run src/web/servidor/sesiones.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/servidor/sesiones.ts src/web/servidor/sesiones.test.ts
git commit -m "feat(web): sesiones por proyecto — actos en jsonl, reabrir es releer"
```

```json:metadata
{"files": ["src/web/servidor/sesiones.ts", "src/web/servidor/sesiones.test.ts"], "verifyCommand": "npx vitest run src/web/servidor/sesiones.test.ts && npm run typecheck", "acceptanceCriteria": ["indice.json y jsonl por sesión", "un acto por línea, anexado", "título de la primera prosa", "reabrir marca histórica", "línea corrupta se salta", "sin diffs ni contenido"], "modelTier": "standard"}
```

---

### Task 9: El vestíbulo — el wizard de tres pasos y la apertura de un proyecto

**Goal:** El estado que existe **antes** de que haya ninguna raíz: cuenta, entorno, proyecto y descarga; y la apertura de una consola de proyecto, **una a la vez**.

**Files:**
- Create: `src/web/servidor/vestibulo.ts`
- Create: `src/web/servidor/vestibulo.test.ts`

**Acceptance Criteria:**
- [ ] El paso de **cuenta** solo aparece si el papel `trabajo` resuelve por `omision`, y es `asistenteDeModelo` **sin modificar**
- [ ] El paso de **entorno** ofrece los dos oficiales pre-rellenados y un «otro» con URL libre, y registra en `settings.json`
- [ ] El paso de **proyecto** lista con `herramientaDeProyectos`, elige rama y descarga al workspace
- [ ] Cancelar antes de elegir no escribe nada
- [ ] Cancelar **después** de elegir proyecto deja `config.json` escrito y **lo dice**
- [ ] Una credencial tecleada en el paso 1 queda escrita aunque se cancele el paso 2, y se dice en el momento
- [ ] Abrir un proyecto con otro ya abierto **cierra el primero** (agota sus `lineas`) antes de abrir el segundo
- [ ] Un fallo de descarga no crea `.xonecode` a medias y dice que se reintente con `/sync bajar`
- [ ] El `config.json` del proyecto gana `entorno: "<id>"` y **conserva** `cloudstudio.url`
- [ ] En modo web, el callback de OAuth redirige a la URL de la web en vez de decir «vuelve a la terminal»
- [ ] Todos los tests corren **offline**, con dobles del catálogo y de la conexión CloudStudio

**Verify:** `npx vitest run src/web/servidor/vestibulo.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Escribir los tests con dobles**

```ts
// src/web/servidor/vestibulo.test.ts
import { describe, it, expect } from "vitest";
import { crearVestibulo } from "./vestibulo.js";
import { CatalogoModelosEnMemoria } from "../../core/ports.js";

function dobles() {
  const escrituras: string[] = [];
  return {
    catalogoModelos: new CatalogoModelosEnMemoria({ anthropic: [{ id: "claude-x", etiqueta: "Claude X" }] }),
    guardarCredencial: (p: string) => { escrituras.push(`cred:${p}`); return { ruta: "/casa/.xonecode/auth.json" }; },
    guardarEntorno: (e: { id: string }) => { escrituras.push(`entorno:${e.id}`); return { ruta: "/casa/.xonecode/settings.json" }; },
    descargar: async () => { escrituras.push("descarga"); },
    escrituras,
  };
}

describe("vestíbulo", () => {
  it("el paso de cuenta NO aparece si ya hay una elección", async () => {
    const d = dobles();
    const v = crearVestibulo({ ...d, origenDeTrabajo: "global" });
    expect(await v.pasosPendientes()).not.toContain("cuenta");
  });

  it("el paso de entorno ofrece los dos oficiales y un «otro»", async () => {
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "omision" });
    const opciones = v.opcionesDeEntorno();
    expect(opciones.map((o) => o.id)).toContain("webstudio");
    expect(opciones.map((o) => o.id)).toContain("manager");
    expect(opciones.map((o) => o.id)).toContain("otro");
  });

  it("cancelar antes de elegir no escribe NADA", async () => {
    const d = dobles();
    const v = crearVestibulo({ ...d, origenDeTrabajo: "omision" });
    await v.cancelar();
    expect(d.escrituras).toEqual([]);
  });

  it("una credencial tecleada queda escrita aunque se cancele después, y se DICE", async () => {
    const d = dobles();
    const dichos: string[] = [];
    const v = crearVestibulo({ ...d, origenDeTrabajo: "omision", informar: (t) => dichos.push(t) });
    await v.guardarCredencialDe("anthropic", "sk-…");
    await v.cancelar();
    expect(d.escrituras).toContain("cred:anthropic");
    expect(dichos.join("\n")).toMatch(/auth\.json/);
  });

  it("abrir un proyecto con otro abierto cierra el primero", async () => {
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global" });
    const a = await v.abrirProyecto({ raiz: "/w/a" });
    const b = await v.abrirProyecto({ raiz: "/w/b" });
    expect(a.cerrada).toBe(true);
    expect(b.cerrada).toBe(false);
  });

  it("un fallo de descarga NO crea .xonecode a medias y dice cómo reintentar", async () => {
    const d = dobles();
    const dichos: string[] = [];
    const v = crearVestibulo({
      ...d, origenDeTrabajo: "global", informar: (t) => dichos.push(t),
      descargar: async () => { throw new Error("el ZIP vino vacío"); },
    });
    await expect(v.completarProyecto({ entorno: "webstudio", proyecto: "MinitMT", rama: "master" }))
      .rejects.toThrow();
    expect(dichos.join("\n")).toMatch(/\/sync bajar/);
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run src/web/servidor/vestibulo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
/**
 * El vestíbulo: lo que hay ANTES de que exista ninguna raíz.
 *
 * `correrConsola` es un lazo sobre UNA `raiz`, y la jerarquía entorno → proyecto → sesión
 * necesita un sitio donde vivir mientras no hay proyecto abierto. De ahí las dos clases de
 * consola: el vestíbulo (sin raíz) y la consola de proyecto (con la suya).
 *
 * Los pasos son los mismos del alta de terminal, y cada uno solo aparece si falta lo que
 * decide. El de cuenta se detecta como siempre: si el papel `trabajo` resuelve por
 * `omision`, nadie eligió nunca. **No hay marca de «primer arranque»**: sería una segunda
 * fuente de verdad sobre algo que el sistema ya sabe.
 */
```

- El paso 1 llama a `asistenteDeModelo(consolaWeb, { origenDeTrabajo, hayCredencial, guardarCredencial })` **sin tocar `wizardInicial.ts`**. Si hay que tocarlo, es señal de que el diseño se desvió: parar y decirlo.
- `opcionesDeEntorno()` devuelve `webstudio`, `manager` y `otro`; las dos URLs oficiales van en una constante del fichero, junto a `URL_CLOUDSTUDIO_POR_OMISION` que ya existe en `cli/consola.ts:155`.
- Tras registrar un entorno, llamar a `adoptarLegadoSiProcede` (Task 4).
- `abrirProyecto` cierra la consola anterior llamando a su `cerrar()` (que agota `lineas`) y **espera** a que el lazo retorne antes de abrir la siguiente. Dos `correrConsola` vivos a la vez sobre el mismo proceso comparten el ejecutor real y se pisarían el hilo.
- El fallo de descarga se propaga tras informar; **no** se escribe `.xonecode` a medias.
- Al completar el proyecto se escribe `entorno: "<id>"` en su `config.json`, **sin quitar**
  `cloudstudio.url`. Conservar la URL es lo que hace literalmente cierto que la
  sincronización no se toca: `crearSincronizador` (`cli/main.ts:510`) y todo lo que cuelga
  de él la leen igual que hoy. Añadir el escritor `guardarEntornoDeProyecto` en
  `agent/configEnDisco.ts`, junto a `guardarCloudStudioDeProyecto` (línea 198) y con la
  misma mecánica.
- El callback de OAuth (puerto 7634, intocable) redirige a la URL de la web cuando la
  autorización la pidió el vestíbulo. Hoy termina diciendo «vuelve a la terminal», que en
  el navegador es una instrucción falsa: el usuario ya está donde tiene que estar.

- [ ] **Step 4: Ver pasar**

Run: `npx vitest run src/web/servidor/vestibulo.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/servidor/vestibulo.ts src/web/servidor/vestibulo.test.ts
git commit -m "feat(web): el vestíbulo — cuenta, entorno, proyecto y una consola a la vez"
```

```json:metadata
{"files": ["src/web/servidor/vestibulo.ts", "src/web/servidor/vestibulo.test.ts"], "verifyCommand": "npx vitest run src/web/servidor/vestibulo.test.ts && npm run typecheck", "acceptanceCriteria": ["asistenteDeModelo sin modificar", "entornos oficiales + otro", "cancelar antes no escribe", "credencial escrita se dice", "una consola de proyecto a la vez", "fallo de descarga sin .xonecode a medias"], "modelTier": "frontier"}
```

---

### Task 10: El paquete `apps/web` y los estilos de deepseek

**Goal:** El paquete nuevo del cliente: workspaces de npm, Vite, tsconfig propio con `lib: dom`, el tema de deepseek copiado con su aviso MIT, y la frontera probada.

**Files:**
- Modify: `package.json` (raíz: `workspaces`, `build:web`)
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`
- Create: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`
- Create: `apps/web/estilos/` (los CSS de deepseek)
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `src/web/frontera.test.ts`

**Acceptance Criteria:**
- [ ] `npm run build:web` produce `apps/web/dist/index.html` y sus assets
- [ ] `apps/web/estilos/` contiene los seis CSS de `ui-theme` con el aviso MIT en cabecera
- [ ] `THIRD_PARTY_NOTICES.md` acredita a deepseek-harness (MIT) por los estilos
- [ ] **No se copia ningún logo ni marca denominativa** de DeepSeek
- [ ] `src/web/frontera.test.ts` falla si `react`, `react-dom`, `vite` o una API de DOM aparecen bajo `src/`
- [ ] `src/web/frontera.test.ts` falla si algún fichero de `src/` importa de `apps/web/`
- [ ] `npm test` sigue verde y sin navegador

**Verify:** `npm run build:web && npx vitest run src/web/frontera.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Escribir la frontera primero — es lo que impide que esto se desmadre**

```ts
// src/web/frontera.test.ts
/**
 * La frontera del cliente web: react, react-dom, vite y el DOM viven SOLO en `apps/web/`.
 *
 * Misma regla y mismo motivo que `cli/tui/frontera.test.ts` con ink: el host tiene que
 * poder correr sin navegador y sin build, y `npm test` sin TTY. Un import de react-dom en
 * `src/` rompería las dos cosas a la vez.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROHIBIDOS = /from\s+["'](react-dom|vite|@vitejs\/[^"']+)(\/[^"']*)?["']/;
const IMPORTA_CLIENTE = /from\s+["'][^"']*apps\/web\//;

function fuentesDeSrc(carpeta: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre === "__oro__" || nombre === "node_modules" || nombre === "dist" || nombre === "tui") continue;
      salida.push(...fuentesDeSrc(ruta));
    } else if (!/\.test\.tsx?$/.test(nombre) && /\.tsx?$/.test(nombre)) {
      salida.push(ruta);
    }
  }
  return salida;
}

describe("frontera del cliente web", () => {
  const ficheros = fuentesDeSrc(join(RAIZ, "src"));

  it("hay ficheros que revisar (si no, el test no prueba nada)", () => {
    expect(ficheros.length).toBeGreaterThan(20);
  });

  it("react-dom y vite no entran en src/", () => {
    const culpables = ficheros.filter((f) => PROHIBIDOS.test(readFileSync(f, "utf8")));
    expect(culpables).toEqual([]);
  });

  it("src/ no importa nada de apps/web/", () => {
    const culpables = ficheros.filter((f) => IMPORTA_CLIENTE.test(readFileSync(f, "utf8")));
    expect(culpables).toEqual([]);
  });
});
```

Nota: `cli/tui/` se excluye porque ahí react sí vive (por Ink), y esa frontera ya la vigila `cli/tui/frontera.test.ts`.

- [ ] **Step 2: Ver pasar en verde desde el principio**

Run: `npx vitest run src/web/frontera.test.ts`
Expected: PASS (todavía no hay nada que la rompa; la prueba es que **siga** pasando).

- [ ] **Step 3: Convertir la raíz en workspaces**

```jsonc
// package.json (raíz) — añadir
{
  "workspaces": ["apps/*"],
  "scripts": {
    "build:web": "npm run build --workspace apps/web",
    "build": "rm -rf dist && tsc -p tsconfig.build.json && chmod +x dist/bin.js && npm run build:web"
  }
}
```

Añadir `apps/web/dist` a `files` para que el paquete publicado lleve el cliente.

- [ ] **Step 4: Crear el paquete del cliente**

```jsonc
// apps/web/package.json
{
  "name": "@xonecode/web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": { "build": "vite build", "dev": "vite" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1", "clsx": "^2.1.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.4", "vite": "^6.0.0", "@types/react-dom": "^18.3.1" }
}
```

```jsonc
// apps/web/tsconfig.json — aislado del host: aquí SÍ hay DOM
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx", "strict": true, "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "estilos"]
}
```

```ts
// apps/web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: el host sirve dist/ desde la raíz y no hay CDN detrás.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});
```

- [ ] **Step 5: Copiar los estilos de deepseek con su aviso**

```bash
mkdir -p apps/web/estilos
for f in base corner-shape design-platform gradient-shadow-text scrollbar shiki; do
  {
    echo "/* Tomado de deepseek-harness (packages/client/ui-theme/src/styles/$f.css), MIT."
    echo "   Copiado sin cambios: los tokens --dsw-* se renombrarán a --xone-* cuando la"
    echo "   pantalla exista (D2 del spec). Ningún logo ni marca de DeepSeek se copia. */"
    cat "/Users/projects/harnees/deepseek-harness/packages/client/ui-theme/src/styles/$f.css"
  } > "apps/web/estilos/$f.css"
done
ls -la apps/web/estilos/
```

Crear `THIRD_PARTY_NOTICES.md` en la raíz acreditando deepseek-harness (MIT) por `apps/web/estilos/`, con la licencia completa copiada de `/Users/projects/harnees/deepseek-harness/LICENSE`.

- [ ] **Step 6: El esqueleto mínimo que compila**

```tsx
// apps/web/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../estilos/base.css";
import "../estilos/design-platform.css";
import "../estilos/corner-shape.css";
import "../estilos/scrollbar.css";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
```

```tsx
// apps/web/src/App.tsx
export function App() {
  return <main>xonecode</main>;
}
```

```html
<!-- apps/web/index.html -->
<!doctype html>
<html lang="es">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>xonecode</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

- [ ] **Step 7: Verificar el build y la suite**

Run: `npm install && npm run build:web && npx vitest run`
Expected: `apps/web/dist/index.html` existe; la suite entera en verde.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json apps/ THIRD_PARTY_NOTICES.md src/web/frontera.test.ts
git commit -m "feat(web): paquete apps/web con Vite y los estilos de deepseek (MIT)"
```

```json:metadata
{"files": ["package.json", "apps/web/package.json", "apps/web/vite.config.ts", "apps/web/tsconfig.json", "apps/web/index.html", "apps/web/src/main.tsx", "apps/web/src/App.tsx", "apps/web/estilos/", "THIRD_PARTY_NOTICES.md", "src/web/frontera.test.ts"], "verifyCommand": "npm run build:web && npx vitest run src/web/frontera.test.ts", "acceptanceCriteria": ["build:web produce dist", "seis CSS con aviso MIT", "THIRD_PARTY_NOTICES acredita deepseek", "sin logos ni marca", "frontera prohíbe react-dom/vite en src/", "npm test verde sin navegador"], "modelTier": "standard"}
```

---

### Task 11: El cliente se conecta

**Goal:** Que el navegador abra el SSE, mantenga el transcript y reconecte solo, con un store sin React probado aparte.

**Files:**
- Create: `apps/web/src/conexion.ts`
- Create: `apps/web/src/store.ts`
- Create: `apps/web/src/tipos.ts`
- Create: `apps/web/src/store.test.ts`
- Create: `apps/web/src/conexion.test.ts`
- Create: `apps/web/src/tipos.test.ts`

**Acceptance Criteria:**
- [ ] `crearStoreDelCliente()` aplica un `acto` anexándolo y una `reemision` **sustituyendo** el transcript entero
- [ ] Sustituir y no fusionar es lo que hace idempotente la reconexión: dos reemisiones seguidas dejan el mismo estado
- [ ] La conexión reintenta con espera creciente (1 s, 2 s, 4 s, tope 30 s) y lo dice en el estado
- [ ] Mientras está desconectada, el store lo refleja (`conectado: false`) para que la UI pueda deshabilitar el compositor
- [ ] `enviar()` hace `POST /accion` con `credentials: "same-origin"` y `content-type: application/json`
- [ ] El store no importa React: se prueba sin montar nada

**Verify:** `npx vitest run apps/web/src/store.test.ts apps/web/src/conexion.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Escribir los tests del store**

```ts
// apps/web/src/store.test.ts
import { describe, it, expect } from "vitest";
import { crearStoreDelCliente } from "./store.js";

describe("store del cliente", () => {
  it("un acto se anexa", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } });
    expect(s.leer().actos).toHaveLength(1);
  });

  it("una reemisión SUSTITUYE el transcript: es lo que hace idempotente reconectar", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } });
    const lote = [{ tipo: "usuario", texto: "hola" }, { tipo: "asistente", texto: "qué tal" }] as const;
    s.aplicar({ clase: "reemision", actos: [...lote] });
    s.aplicar({ clase: "reemision", actos: [...lote] });
    expect(s.leer().actos).toHaveLength(2);
  });

  it("desconectado se refleja en el estado, para poder deshabilitar el compositor", () => {
    const s = crearStoreDelCliente();
    s.marcarDesconectado();
    expect(s.leer().conectado).toBe(false);
    s.marcarConectado();
    expect(s.leer().conectado).toBe(true);
  });

  it("no importa React: es estado, no presentación", async () => {
    const fuente = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./store.ts", import.meta.url), "utf8"));
    expect(fuente).not.toMatch(/from ["']react["']/);
  });
});
```

- [ ] **Step 2: Escribir los tests de la conexión (con `EventSource` doblado)**

```ts
// apps/web/src/conexion.test.ts
import { describe, it, expect, vi } from "vitest";
import { esperaDeReintento } from "./conexion.js";

describe("reintento", () => {
  it("crece y se topa en 30 s: reconectar cada segundo para siempre es una tormenta", () => {
    expect([0, 1, 2, 3, 10].map(esperaDeReintento)).toEqual([1000, 2000, 4000, 8000, 30000]);
  });
});
```

- [ ] **Step 3: Ver fallar**

Run: `npx vitest run apps/web/src/store.test.ts apps/web/src/conexion.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar el store**

```ts
/**
 * El estado de presentación del cliente, SIN React — mismo pacto que `cli/tui/store.ts`:
 * los componentes solo pintan y la semántica se prueba sin montar nada.
 *
 * Una `reemision` SUSTITUYE el transcript entero en vez de fusionarlo. Es lo que hace que
 * reconectar sea idempotente: el servidor es la única fuente de verdad del transcript, y
 * fusionar obligaría a deduplicar por identidad de acto —que no tenemos— y duplicaría
 * líneas en cuanto una reconexión pillara al servidor a mitad de turno.
 */
import type { Acto } from "./tipos.js";

export interface EstadoDelCliente {
  actos: Acto[];
  conectado: boolean;
  pregunta?: { texto: string };
  selector?: { titulo: string; opciones: { id: string; etiqueta: string; detalle?: string }[] };
  secreto?: { pregunta: string };
  aprobacion?: { pendientes: unknown[]; ficheros: Record<string, string>; diffs: Record<string, unknown[]> };
}

export function crearStoreDelCliente(): {
  leer: () => EstadoDelCliente;
  aplicar: (mensaje: unknown) => void;
  marcarConectado: () => void;
  marcarDesconectado: () => void;
  suscribir: (escucha: () => void) => () => void;
} { /* … */ }
```

`suscribir` existe para `useSyncExternalStore`: es la única costura entre el store y React, y así ningún componente lee el store por su cuenta.

`apps/web/src/tipos.ts` re-declara `Acto` y los mensajes del transporte. **No** se importa desde `src/core/actos.ts`: la frontera prohíbe que los dos paquetes compartan módulos de ejecución. Se añade un test que compara los dos literales de unión y falla si divergen:

```ts
// apps/web/src/tipos.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("tipos del cliente", () => {
  it("los tipos de acto del cliente y del host no divergen", () => {
    const tiposDe = (ruta: string) =>
      [...readFileSync(ruta, "utf8").matchAll(/\{\s*tipo:\s*"([a-z]+)"/g)].map((m) => m[1]).sort();
    expect(tiposDe(new URL("./tipos.ts", import.meta.url).pathname))
      .toEqual(tiposDe(new URL("../../../src/core/actos.ts", import.meta.url).pathname));
  });
});
```

- [ ] **Step 5: Implementar la conexión**

- `new EventSource("/eventos")` (el navegador manda la cookie sola en same-origin).
- `onmessage` → `JSON.parse` → `store.aplicar`.
- `onerror` → `store.marcarDesconectado()` y reintento con `esperaDeReintento(intento)`.
- `enviar(mensaje)` → `fetch("/accion", { method: "POST", credentials: "same-origin", headers: {"content-type":"application/json"}, body: JSON.stringify(mensaje) })`.

```ts
/** 1 s, 2 s, 4 s… con tope de 30 s. Reconectar cada segundo para siempre es una tormenta. */
export function esperaDeReintento(intento: number): number {
  return Math.min(1000 * 2 ** intento, 30_000);
}
```

- [ ] **Step 6: Ver pasar**

Run: `npx vitest run apps/web/src/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/
git commit -m "feat(web): el cliente se conecta — SSE con reintento y store sin React"
```

```json:metadata
{"files": ["apps/web/src/conexion.ts", "apps/web/src/store.ts", "apps/web/src/tipos.ts", "apps/web/src/store.test.ts", "apps/web/src/conexion.test.ts", "apps/web/src/tipos.test.ts"], "verifyCommand": "npx vitest run apps/web/src/", "acceptanceCriteria": ["acto anexa, reemisión sustituye", "dos reemisiones dejan el mismo estado", "reintento creciente con tope 30s", "conectado en el estado", "store sin React", "los tipos de acto no divergen del host"], "modelTier": "standard"}
```

---

### Task 12: La maqueta — barra derecha, cabecera y compositor

**Goal:** La pantalla: barra lateral **a la derecha** con entorno → proyectos → sesiones, cabecera de sesión, y el compositor, con los estilos de deepseek.

**Files:**
- Create: `apps/web/src/componentes/Maqueta.tsx` + `Maqueta.module.css`
- Create: `apps/web/src/componentes/Barra.tsx` + `Barra.module.css`
- Create: `apps/web/src/componentes/Compositor.tsx` + `Compositor.module.css`
- Create: `apps/web/src/componentes/Cabecera.tsx` + `Cabecera.module.css`
- Create: `apps/web/src/componentes/Barra.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Acceptance Criteria:**
- [ ] La barra está **a la derecha** y muestra tres niveles: entorno (selector), proyectos, sesiones anidadas
- [ ] Una sesión histórica se distingue visualmente de una viva
- [ ] El compositor se deshabilita cuando `conectado === false`
- [ ] Enter envía; Shift+Enter hace salto de línea
- [ ] Una línea que empieza por `/` viaja **por el mismo camino que la prosa**: la despacha
      `correrConsola` contra el registro `COMANDOS` (`cli/consola.ts:819`), así que `/ayuda`,
      `/modelo`, `/config`, `/sync` y `/hilo` funcionan en la web **sin código nuevo**
- [ ] El compositor ofrece las sugerencias de comando leyendo el mismo registro, no una copia
- [ ] Los componentes usan **solo alias semánticos** `--dsw-alias-*`; ningún color literal
- [ ] Ningún selector de tema (`prefers-color-scheme`, `[data-theme]`) en un CSS de componente
- [ ] Un test comprueba las dos reglas anteriores leyendo los `.module.css`

**Verify:** `npx vitest run apps/web/src/componentes/` → PASS

**Steps:**

- [ ] **Step 1: Escribir el test que vigila la disciplina de estilos**

```tsx
// apps/web/src/componentes/Barra.test.tsx
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const AQUI = dirname(fileURLToPath(import.meta.url));
const modulos = readdirSync(AQUI).filter((f) => f.endsWith(".module.css"));

describe("disciplina de estilos (heredada de deepseek)", () => {
  it("hay módulos que revisar", () => {
    expect(modulos.length).toBeGreaterThan(0);
  });

  it("ningún componente escribe un color literal: solo alias semánticos", () => {
    for (const m of modulos) {
      const css = readFileSync(join(AQUI, m), "utf8");
      expect(css, m).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css, m).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/);
    }
  });

  it("ningún componente decide el tema: eso es del dueño del tema", () => {
    for (const m of modulos) {
      const css = readFileSync(join(AQUI, m), "utf8");
      expect(css, m).not.toMatch(/prefers-color-scheme/);
      expect(css, m).not.toMatch(/\[data-theme/);
    }
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run apps/web/src/componentes/`
Expected: FAIL — no hay `.module.css` todavía («hay módulos que revisar»).

- [ ] **Step 3: La maqueta**

```tsx
// apps/web/src/componentes/Maqueta.tsx
import type { ReactNode } from "react";
import estilos from "./Maqueta.module.css";

/**
 * Una fila de dos columnas: el centro es lo ÚNICO elástico y la barra tiene ancho fijo.
 * La barra va a la DERECHA (en deepseek está a la izquierda); es lo que pidió el usuario.
 */
export function Maqueta({ centro, barra }: { centro: ReactNode; barra: ReactNode }) {
  return (
    <div className={estilos.maqueta}>
      <div className={estilos.centro}>{centro}</div>
      <aside className={estilos.barra}>{barra}</aside>
    </div>
  );
}
```

```css
/* apps/web/src/componentes/Maqueta.module.css */
.maqueta { display: flex; height: 100dvh; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.centro  { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.barra   { flex: 0 0 280px; border-left: 0.5px solid var(--dsw-alias-border-l1); overflow-y: auto; }
```

**Los nombres de arriba están MEDIDOS contra el CSS copiado**, no inventados. El primer
borrador de este plan usaba `--dsw-alias-bg-primary`, `--dsw-alias-text-primary` y
`--dsw-alias-border-primary`, y **ninguno de los tres existe**: un alias inventado no da
error, da transparente, que es justo el bug mudo que este repo persigue en todas partes.

Las familias reales, comprobadas: fondos `--dsw-alias-bg-*` (`bg-base`, `bg-layer-1`…),
bordes `--dsw-alias-border-*` (`border-l1`…`border-l4`), texto `--dsw-alias-label-*`
(`label-primary`, `label-secondary`, `label-tertiary`, `label-caption`, `label-dimmed`),
botones `--dsw-alias-button-*`, estados `--dsw-alias-interactive-*`, marca
`--dsw-alias-brand-*` y markdown `--dsw-alias-markdown-*`.

**Antes de escribir cualquier otro alias**, comprobar que existe:

```bash
grep -o '\--dsw-alias-[a-z0-9-]*' apps/web/estilos/design-platform.css | sort -u
```

- [ ] **Step 4: La barra de tres niveles**

```tsx
// apps/web/src/componentes/Barra.tsx
import clsx from "clsx";
import estilos from "./Barra.module.css";

export interface Proyecto { id: string; nombre: string; sesiones: { id: string; titulo: string; historica: boolean }[] }

export function Barra({ entornos, entornoActivo, proyectos, sesionActiva, alElegirEntorno, alAbrirSesion }: {
  entornos: { id: string; nombre: string }[];
  entornoActivo: string;
  proyectos: Proyecto[];
  sesionActiva?: string;
  alElegirEntorno: (id: string) => void;
  alAbrirSesion: (proyecto: string, sesion: string) => void;
}) {
  return (
    <nav className={estilos.barra}>
      <select className={estilos.entorno} value={entornoActivo} onChange={(e) => alElegirEntorno(e.target.value)}>
        {entornos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
      </select>
      <ul className={estilos.proyectos}>
        {proyectos.map((p) => (
          <li key={p.id}>
            <span className={estilos.proyecto}>{p.nombre}</span>
            <ul className={estilos.sesiones}>
              {p.sesiones.map((s) => (
                <li key={s.id}>
                  <button
                    className={clsx(estilos.sesion, s.historica && estilos.historica, s.id === sesionActiva && estilos.activa)}
                    onClick={() => alAbrirSesion(p.id, s.id)}
                  >
                    {s.titulo}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4b: Instalar la librería de test de componentes**

```bash
npm install --save-dev --workspace apps/web @testing-library/react@^16 @testing-library/dom@^10
```

Hace falta **aquí** y no más tarde: el test de sugerencias del compositor (Step 5) monta un
componente de verdad. La Task 14 la da por instalada.

- [ ] **Step 5: El compositor**

`textarea` con Enter que envía y Shift+Enter que hace salto; `disabled` cuando `conectado === false`, con un texto que dice por qué («sin conexión con xonecode») en vez de quedarse mudo.

**Los comandos de barra no necesitan código.** `correrConsola` ya despacha cualquier línea
que empiece por `/` contra el registro `COMANDOS`, y la web le manda las líneas por el mismo
sitio que la prosa. Eso es lo que hace que `/modelo` —el cuarto paso del alta de terminal, el
que el wizard de tres pasos NO incluye— siga estando disponible desde el primer día, y que la
consola y la web no diverjan: comparten función, no una copia.

El servidor manda la lista de comandos al conectar (recorriendo `COMANDOS`, igual que hacen
`/ayuda` y el completador de Tab) y el compositor la usa para sugerir. Un test lo fija:

```tsx
it("las sugerencias salen del registro que manda el servidor, no de una lista escrita a mano", () => {
  render(<Compositor comandos={[{ nombre: "/sync", descripcion: "sincroniza" }]} {...manejadores} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "/sy" } });
  expect(screen.getByRole("listbox").textContent).toContain("/sync");
});
```

- [ ] **Step 6: Ver pasar y mirar la pantalla**

Run: `npx vitest run apps/web/src/componentes/ && npm run build:web`
Expected: PASS y build limpio.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/componentes/ apps/web/src/App.tsx
git commit -m "feat(web): la maqueta — barra derecha de entorno/proyecto/sesión, cabecera y compositor"
```

```json:metadata
{"files": ["apps/web/src/componentes/Maqueta.tsx", "apps/web/src/componentes/Barra.tsx", "apps/web/src/componentes/Compositor.tsx", "apps/web/src/componentes/Cabecera.tsx", "apps/web/src/componentes/Barra.test.tsx", "apps/web/src/App.tsx"], "verifyCommand": "npx vitest run apps/web/src/componentes/ && npm run build:web", "acceptanceCriteria": ["barra a la derecha con tres niveles", "sesión histórica distinguible", "compositor deshabilitado sin conexión", "Enter envía y Shift+Enter salta", "sin colores literales", "sin selectores de tema en componentes"], "modelTier": "standard"}
```

---

### Task 13: Chat, Trayectoria y la barra de estado

**Goal:** Las dos vistas del transcript —Chat con markdown y Trayectoria técnica— y la barra de estado inferior, con la Trayectoria **sin argumentos de tool**.

> **Nota de ejecución.** Esta tarea se despachó con `marked` + `dompurify`, y a mitad el
> usuario pidió reutilizar el harness de deepseek, que es open source. El cuerpo de abajo
> queda como quedó; **la conversión a `MarkdownText` de
> `@deepseek-ai/dsh-client-ui-primitives` es la Task 13b**, inmediatamente posterior. El
> motivo está en el spec: el HTML crudo sale como texto literal y ninguno entra en el DOM,
> así que la propiedad de seguridad se obtiene por construcción y no por filtrado.

**Files:**
- Create: `apps/web/src/componentes/Chat.tsx` + `Chat.module.css`
- Create: `apps/web/src/componentes/Trayectoria.tsx` + `Trayectoria.module.css`
- Create: `apps/web/src/componentes/BarraDeEstado.tsx` + `BarraDeEstado.module.css`
- Create: `apps/web/src/markdown.ts`
- Create: `apps/web/src/markdown.test.ts`
- Create: `apps/web/src/componentes/Trayectoria.test.tsx`

**Acceptance Criteria:**
- [ ] El Chat renderiza markdown: encabezados, listas, `código`, bloques de código y tablas
- [ ] El markdown se renderiza con `MarkdownText` de `@deepseek-ai/dsh-client-ui-primitives`, y se comprueba **contra el componente real** que `<script>`, `<img onerror=…>` y un enlace `javascript:` no producen HTML activo: tienen que salir como texto literal
- [ ] La Trayectoria pinta una fila por acto, monoespaciada y truncada a una línea
- [ ] Un test comprueba que **ninguna fila** de Trayectoria contiene un JSON de argumentos
- [ ] La barra de estado lleva turnos, pasos, tiempo y contexto, y **omite el porcentaje si no hay tope** (ollama no tiene tope a propósito)
- [ ] Las dos vistas se alternan con pestañas y la elegida se recuerda mientras dure la página
- [ ] **El test de disciplina de estilos deja de ser ciego a las palabras clave de color.** Medido: hoy caza `#fff`, `rgb(...)` y `hsl(...)`, pero `red` o `transparent` pasan — y `transparent` ya se coló una vez de verdad. Añadir una lista cerrada de palabras clave conocidas; es la única barrera que hace cumplir «ningún color literal»

**Verify:** `npx vitest run apps/web/src/markdown.test.ts apps/web/src/componentes/Trayectoria.test.tsx` → PASS

**Steps:**

- [ ] **Step 1: Añadir las dos dependencias del renderizado y decir por qué**

```bash
npm install --workspace apps/web @deepseek-ai/dsh-client-ui-primitives@0.0.1-rc.1
```

Versión exacta porque hoy es un release candidate. Es el paquete de primitivos de deepseek-harness, y sus propios tipos lo declaran **`Cordis-free React primitives styled only through --dsw-* tokens`**: funciona sin su arquitectura de plugins y con los tokens que ya copiamos.

Se usa en vez de `marked` + un saneador, y la razón es de fondo. El texto lo escribe un MODELO, que puede emitir `<img onerror=…>` sin ninguna mala intención, y la página tiene la cookie de sesión de un servidor local que escribe ficheros. Parsear a HTML y luego sanear depende de que al saneador no se le escape nada. `MarkdownText` se declara renderizador de Markdown **no confiable** y su política es más fuerte: **el HTML crudo se renderiza como texto literal, ninguno entra en el DOM** —no hay nada que sanear porque nunca se construye HTML—, con lista blanca de protocolos en enlaces e imágenes, imágenes solo por HTTP(S) absoluto y KaTeX sin comandos de confianza. Y parsea incrementalmente para streaming, congelando los bloques cerrados, que es exactamente nuestro caso.

- [ ] **Step 2: Escribir los tests**

```ts
// apps/web/src/markdown.test.ts
import { describe, it, expect } from "vitest";
import { aHtml } from "./markdown.js";

describe("markdown", () => {
  it("renderiza lo básico", () => {
    expect(aHtml("# Hola")).toContain("<h1");
    expect(aHtml("- uno\n- dos")).toContain("<li");
    expect(aHtml("`x`")).toContain("<code");
  });

  it("SANEA: el texto lo escribe un modelo, y un script no puede sobrevivir", () => {
    expect(aHtml("<script>alert(1)</script>")).not.toContain("<script");
    expect(aHtml('<img src=x onerror="alert(1)">')).not.toContain("onerror");
    expect(aHtml("[pincha](javascript:alert(1))")).not.toContain("javascript:");
  });
});
```

```tsx
// apps/web/src/componentes/Trayectoria.test.tsx
import { describe, it, expect } from "vitest";
import { filasDeTrayectoria } from "./Trayectoria.js";

describe("Trayectoria", () => {
  it("una fila por acto, etiquetada por tipo", () => {
    const filas = filasDeTrayectoria([
      { tipo: "usuario", texto: "haz algo" },
      { tipo: "herramientas", lineas: ["read_file  src/app.xne", "grep  coleccion"] },
      { tipo: "asistente", texto: "hecho" },
    ]);
    expect(filas.map((f) => f.etiqueta)).toEqual(["USUARIO", "TOOL", "TOOL", "ASISTENTE"]);
  });

  it("NINGUNA fila lleva argumentos de tool: deepseek los enseña, nosotros no podemos", () => {
    const filas = filasDeTrayectoria([
      { tipo: "herramientas", lineas: ["write_file  src/app.xne", "grep  ^function"] },
    ]);
    for (const f of filas) {
      expect(f.texto).not.toMatch(/[{}]/);
      expect(f.texto).not.toMatch(/"(command|content|file_text)"/);
    }
  });

  it("cada fila se trunca a una línea: la trayectoria es paisaje, no lectura", () => {
    const filas = filasDeTrayectoria([{ tipo: "asistente", texto: "a".repeat(500) }]);
    expect(filas[0].texto.length).toBeLessThanOrEqual(200);
  });
});
```

- [ ] **Step 3: Ver fallar**

Run: `npx vitest run apps/web/src/markdown.test.ts apps/web/src/componentes/Trayectoria.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implementar el markdown**

```ts
/**
 * El Chat pinta con `MarkdownText`, de los primitivos de deepseek-harness.
 *
 * No hay módulo propio de markdown ni saneador: `MarkdownText` renderiza el HTML crudo como
 * TEXTO LITERAL —ninguno entra en el DOM—, así que no hay un paso de saneo al que se le
 * pueda escapar algo. Es la misma propiedad que buscábamos, obtenida por construcción en vez
 * de por filtrado.
 */
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
```ts
/**
 * La vista técnica, con la pinta de la de deepseek —filas monoespaciadas de una línea,
 * etiquetadas por tipo, con buscador— pero **sin lo que ellos ponen dentro**.
 *
 * Deepseek enseña `bash {"command": "cd /Users/…"}`. Aquí eso no puede pasar por TIPO: el
 * acto de herramientas ya viene con líneas resumidas por `agent/resumenDeTool.ts`, una
 * lista blanca de campos por nombre de tool —ruta o patrón, nunca contenido—, porque
 * `write_file` lleva el fichero entero y una tool MCP lleva el bearer.
 */
export interface FilaDeTrayectoria { etiqueta: string; texto: string }
export function filasDeTrayectoria(actos: readonly Acto[]): FilaDeTrayectoria[] { /* … */ }
```

Truncar a 200 caracteres y colapsar saltos de línea a espacios: la fila es de una línea por contrato del componente.

- [ ] **Step 6: La barra de estado**

Lleva turnos, pasos, tiempo del turno y `ctx`. El porcentaje de contexto **solo si hay tope**: un porcentaje sobre un número inventado es una mentira con forma de cifra, y ollama no tiene tope a propósito porque cada modelo local trae el suyo. El tope llega del servidor en el acto de sistema que ya lo calcula con `topeResuelto` (`core/contextos.ts`); el cliente no lo recalcula.

- [ ] **Step 7: Ver pasar**

Run: `npx vitest run apps/web/ && npm run build:web`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/
git commit -m "feat(web): Chat con los primitivos de deepseek, Trayectoria sin argumentos y barra de estado"
```

```json:metadata
{"files": ["apps/web/src/componentes/Chat.tsx", "apps/web/src/componentes/Trayectoria.tsx", "apps/web/src/componentes/BarraDeEstado.tsx", "apps/web/src/markdown.ts", "apps/web/src/markdown.test.ts", "apps/web/src/componentes/Trayectoria.test.tsx"], "verifyCommand": "npx vitest run apps/web/ && npm run build:web", "acceptanceCriteria": ["markdown básico renderizado", "script/onerror/javascript: saneados", "una fila por acto truncada", "ninguna fila con argumentos de tool", "sin porcentaje si no hay tope", "pestañas Chat/Trayectoria"], "modelTier": "standard"}
```

---

### Task 14: El modal de aprobación y el wizard en la interfaz

**Goal:** Las dos interacciones que faltan: aprobar cambios con el diff delante (fail-closed) y el alta de tres pasos en el navegador.

**Files:**
- Create: `apps/web/src/componentes/Aprobacion.tsx` + `Aprobacion.module.css`
- Create: `apps/web/src/componentes/Aprobacion.test.tsx`
- Create: `apps/web/src/componentes/Wizard.tsx` + `Wizard.module.css`
- Create: `apps/web/src/componentes/Wizard.test.tsx`

**Acceptance Criteria:**
- [ ] El modal usa `Modal` y `DiffBlock` de `@deepseek-ai/dsh-client-ui-primitives` (ya instalado en la Task 13), y enseña el diff **entero** por fichero: es el único sitio donde el contenido se ve completo, porque es el paso donde se decide
- [ ] Solo el botón «Aprobar» aprueba; «Rechazar», Escape y cerrar la pestaña rechazan
- [ ] Cerrar el modal sin decidir envía **rechazo explícito**, no silencio
- [ ] El wizard tiene tres pasos y solo enseña los que faltan
- [ ] El campo de la clave de API es `type="password"`, tiene `autocomplete="off"` y **no se guarda en el store**
- [ ] Registrar un entorno «otro» pide nombre y URL, y valida que la URL sea `https://` (o `http://` solo en loopback, para el on-premise en desarrollo)
- [ ] Al guardar una credencial, la interfaz dice **dónde** quedó, antes de seguir
- [ ] **La pregunta de texto libre tiene UI y tiene plazo.** `estado.pregunta` se pinta y su respuesta viaja como `{clase:"respuesta"}` — hoy el compositor manda todo como `prosa`, que entra por la cola de líneas y **no resuelve la pregunta ni acertando el texto**. Sin esto, cualquier comando que caiga a `consola.preguntar` sin alternativa de `seleccionar` (`/sync subir` por `politicaInteractiva`, `cli/consola.ts:834`; `/connect-studio` sin URL, `cli/consola.ts:916`) **bloquea la sesión web para siempre**
- [ ] **`preguntar` gana un plazo, como ya tiene `aprobacionesTui`.** Medido: `aprobacionesTui` lleva `msDeEspera` y `preguntar` no lleva ninguno, así que con la pestaña abierta espera indefinidamente y el lazo de `correrConsola` queda `await`-ado ahí dentro. Al vencer, responde cadena vacía — que es lo que ya responde al desconectarse, y lo que `interpretAnswer` trata como rechazo

**Verify:** `npx vitest run apps/web/src/componentes/Aprobacion.test.tsx apps/web/src/componentes/Wizard.test.tsx` → PASS

**Steps:**

- [ ] **Step 1: Escribir los tests de rechazo primero — es lo que define el componente**

```tsx
// apps/web/src/componentes/Aprobacion.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Aprobacion } from "./Aprobacion.js";

const PENDIENTES = [{ id: "1", origen: "dev", descripcion: "escribir src/app.xne", decisionesPermitidas: ["si", "no"] }];
const DIFFS = { "src/app.xne": [{ signo: "+", texto: "<coleccion name=\"clientes\"/>" }] };

describe("Aprobacion", () => {
  it("enseña el diff entero: es el paso donde se DECIDE sobre el contenido", () => {
    render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={() => {}} />);
    expect(screen.getByText(/coleccion name="clientes"/)).toBeTruthy();
  });

  it("solo «Aprobar» aprueba", () => {
    const alDecidir = vi.fn();
    render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />);
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    expect(alDecidir).toHaveBeenCalledWith({ "1": "si" });
  });

  it("Escape RECHAZA de forma explícita, no en silencio", () => {
    const alDecidir = vi.fn();
    render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alDecidir).toHaveBeenCalledWith({ "1": "no" });
  });

  it("cerrar sin decidir rechaza", () => {
    const alDecidir = vi.fn();
    const { unmount } = render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />);
    unmount();
    expect(alDecidir).toHaveBeenCalledWith({ "1": "no" });
  });
});
```

```tsx
// apps/web/src/componentes/Wizard.test.tsx
describe("Wizard", () => {
  it("solo enseña los pasos que faltan", () => {
    render(<Wizard pasos={["entorno"]} {...manejadores} />);
    expect(screen.queryByLabelText(/proveedor/i)).toBeNull();
    expect(screen.getByLabelText(/url del mcp/i)).toBeTruthy();
  });

  it("la clave es un campo de contraseña y no entra en el store", () => {
    render(<Wizard pasos={["cuenta"]} {...manejadores} />);
    const campo = screen.getByLabelText(/clave/i) as HTMLInputElement;
    expect(campo.type).toBe("password");
    expect(campo.autocomplete).toBe("off");
  });

  it("una URL que no es https ni loopback se rechaza", () => {
    render(<Wizard pasos={["entorno"]} {...manejadores} />);
    fireEvent.change(screen.getByLabelText(/url del mcp/i), { target: { value: "http://mcp.ejemplo.com/mcp" } });
    fireEvent.click(screen.getByRole("button", { name: /registrar/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/https/i);
  });

  it("al guardar la credencial dice DÓNDE quedó antes de seguir", () => {
    render(<Wizard pasos={["cuenta"]} {...manejadores} rutaDeCredencial="~/.xonecode/auth.json" />);
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(screen.getByRole("status").textContent).toContain("auth.json");
  });
});
```

- [ ] **Step 2: Comprobar que la librería de test de componentes ya está**

Se instaló en la Task 12, que ya monta un componente. Si falta, es que la Task 12 quedó
incompleta:

```bash
npm ls --workspace apps/web @testing-library/react
```

- [ ] **Step 3: Ver fallar**

Run: `npx vitest run apps/web/src/componentes/Aprobacion.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implementar la aprobación**

```tsx
/**
 * El modal de aprobación: fail-closed, igual que el de la TUI lo es por TECLA.
 *
 * Aquí lo es por SALIDA: solo el botón «Aprobar» aprueba, y todo lo demás —«Rechazar»,
 * Escape, y desmontar sin haber decidido— manda rechazo EXPLÍCITO. Explícito y no
 * silencio: el servidor ya rechaza por timeout, pero un rechazo que llega enseguida
 * devuelve el turno al usuario en vez de dejarlo esperando el plazo entero.
 *
 * Este es el ÚNICO sitio de toda la web donde el contenido de un fichero se enseña entero,
 * y es correcto que así sea: es el paso donde se DECIDE sobre él.
 */
```

El rechazo al desmontar va en el `return` de un `useEffect` con una referencia `decidido` que se pone a `true` en cuanto se llama a `alDecidir`, para no mandar dos decisiones.

- [ ] **Step 5: Implementar el wizard**

Tres pasos, cada uno un formulario. Reglas que no se pueden relajar:
- La clave vive en el `useState` del paso y se manda por `enviar({clase:"secreto", valor})`; **nunca** entra en el store del cliente ni se pinta.
- La URL se valida: `https://` siempre, y `http://` solo si el host es `127.0.0.1` o `localhost` (un on-premise en desarrollo).
- Tras guardar la credencial, se enseña un `role="status"` con la ruta, **antes** de pasar al paso siguiente: si el usuario cancela ahí, ya sabe que algo quedó escrito.

- [ ] **Step 6: Ver pasar**

Run: `npx vitest run apps/web/ && npm run build:web`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/
git commit -m "feat(web): el modal de aprobación fail-closed y el wizard de tres pasos"
```

```json:metadata
{"files": ["apps/web/src/componentes/Aprobacion.tsx", "apps/web/src/componentes/Aprobacion.test.tsx", "apps/web/src/componentes/Wizard.tsx", "apps/web/src/componentes/Wizard.test.tsx"], "verifyCommand": "npx vitest run apps/web/ && npm run build:web", "acceptanceCriteria": ["el diff entero visible en el modal", "solo Aprobar aprueba", "Escape y desmontar rechazan explícitamente", "solo los pasos que faltan", "clave en campo password fuera del store", "URL validada https o loopback", "se dice dónde quedó la credencial"], "modelTier": "frontier"}
```

---

### Task 15: El cambio de omisión y la documentación

**Goal:** Que `xonecode` abra la web, que `--cli` siga dando la consola entera, que un proyecto offline lo diga en vez de callar, y que CLAUDE.md y el README cuenten la verdad.

**Files:**
- Create: `src/web/servidor/arranque.ts` (`arrancarConsolaWeb`: comprobaciones, servidor, vestíbulo, navegador)
- Create: `src/web/servidor/arranque.test.ts`
- Modify: `src/cli/main.ts` (`decidirPiel`, y la rama que arranca la web)
- Modify: `src/cli/main.test.ts`
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/COMO-PROBARLO.md`

**Acceptance Criteria:**
- [ ] `decidirPiel([])` con stdin TTY devuelve `"web"`
- [ ] `decidirPiel([])` **sin** stdin TTY devuelve `"consola"` (el e2e de tubería no se mueve)
- [ ] `--cli` sigue ganando siempre
- [ ] `xonecode` imprime la URL con el token y abre el navegador salvo con `--no-abrir`
- [ ] Si falta `apps/web/dist`, el comando dice «falta el build del cliente: `npm run build:web`» y sale, sin traza
- [ ] Si el cwd tiene `.xonecode` con `modo: "offline"`, la web lo dice al arrancar y sugiere `xonecode --cli`
- [ ] **Alguien emite `{clase:"comandos"}` al conectar.** El mensaje está declarado en los dos lados del cable desde la Task 12, pero **ningún fichero de producción lo arma**, así que hoy la lista de sugerencias del compositor está siempre vacía. Se construye recorriendo `COMANDOS` (`cli/consola.ts:819`), igual que `/ayuda` y el completador de Tab: una lista escrita a mano se queda vieja en cuanto alguien añade un comando
- [ ] **Las rutas HTTP existen de verdad.** `registrarRuta` (`web/servidor/servidor.ts`) no se invoca hoy desde ningún sitio de producción: `/eventos` y `/accion` están implementados pero no montados. Sin esto la consola web no se puede abrir aunque `decidirPiel` devuelva `"web"`
- [ ] Los subcomandos y sus códigos de salida (0/1/2/64/70) no cambian
- [ ] `npm test` entero en verde y `npm run typecheck` limpio

**Verify:** `npm test && npm run typecheck` → PASS

**Steps:**

- [ ] **Step 1: Cambiar los tests de la omisión**

```ts
// en src/cli/main.test.ts — sustituye el test «por omisión es la consola» de Task 1
describe("decidirPiel: la omisión ya es la web", () => {
  it("con stdin TTY, xonecode a secas abre la web", () => {
    expect(decidirPiel([], { stdinTTY: true })).toBe("web");
  });

  it("SIN stdin TTY la omisión NO es la web: una tubería seguiría dando salida byte-idéntica", () => {
    expect(decidirPiel([], { stdinTTY: false })).toBe("consola");
  });

  it("--cli gana incluso con TTY", () => {
    expect(decidirPiel(["--cli"], { stdinTTY: true })).toBe("consola");
  });

  it("--web fuerza la web incluso sin TTY", () => {
    expect(decidirPiel(["--web"], { stdinTTY: false })).toBe("web");
  });
});
```

El segundo parámetro se inyecta **por la misma razón que `decidirTui` mira `process.stdout.isTTY` dentro**: aquí se inyecta para poder probar los dos lados sin TTY, y el valor por omisión sigue siendo `process.stdin.isTTY === true`.

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run src/cli/main.test.ts -t "decidirPiel"`
Expected: FAIL — hoy devuelve `"consola"`.

- [ ] **Step 3: Cambiar la omisión**

```ts
export function decidirPiel(
  argv: string[] = [],
  entorno: { stdinTTY?: boolean } = {}
): PielElegida {
  if (argv.includes("--cli")) return "consola";
  if (argv.includes("--web")) return "web";
  // Sin stdin TTY la omisión NO es la web: `echo "…" | xonecode` intentaría abrir un
  // navegador y se llevaría por delante el e2e de tubería byte-idéntica, que es lo que
  // sostiene que `npm test` no necesite terminal.
  const tty = entorno.stdinTTY ?? process.stdin.isTTY === true;
  return tty ? "web" : "consola";
}
```

- [ ] **Step 4: Cablear la rama web en el despachador**

La bifurcación va **antes** del alta de cuatro pasos (`main.ts:787-797`), no dentro de una rama de consola: si no, `xonecode` con TTY preguntaría el proveedor en el terminal y **después** abriría un navegador.

```ts
if (decidirPiel(argv) === "web") {
  const { puerto, abrir } = parsearOpcionesWeb(argv);
  return await arrancarConsolaWeb({ puerto, abrir, cwd: process.cwd() });
}
```

`arrancarConsolaWeb` vive en `src/web/servidor/arranque.ts` —no en `main.ts`, que ya tiene
960 líneas— y comprueba, en este orden:
1. Que `apps/web/dist/index.html` existe. Si no: `falta el build del cliente: ejecuta «npm run build:web»` y salida 70 (fallo del **entorno**, no del proyecto).
2. Si el cwd tiene `.xonecode/config.json` con `modo: "offline"`, lo dice: `este directorio es un proyecto offline: ábrelo con «xonecode --cli»`. Informa y **sigue** al vestíbulo — no es un error, es un aviso: el usuario puede querer la web para otro proyecto.
3. Levanta el servidor, imprime la URL con el token y abre el navegador salvo `--no-abrir`.

Abrir el navegador: `open` en darwin, `xdg-open` en linux, `start` en win32, y **si falla, no pasa nada** — la URL ya está impresa. Un fallo al abrir el navegador no puede tumbar el servidor.

- [ ] **Step 5: Verificar el contrato de salida a mano**

```bash
npm run build && npm run build:web
echo "haz un listado" | ./bin/xonecode --guion ; echo "código: $?"     # sigue siendo la consola
./bin/xonecode run --help >/dev/null ; echo "código: $?"                # subcomando intacto
./bin/xonecode --cli --no-tui --guion </dev/null ; echo "código: $?"    # consola stdio
```

Expected: los tres se comportan igual que antes del cambio.

- [ ] **Step 6: Corregir la documentación**

- **CLAUDE.md**: añadir la sección de la consola web —la tercera piel, el paquete `apps/web`, el servidor loopback, `decidirPiel` y por qué sin TTY la omisión no es la web, los settings globales con entornos, las sesiones por proyecto, y que la Trayectoria **no** enseña argumentos de tool—. Corregir la frase que dice que las pieles son dos.
- **README.md**: el arranque ya no es «abre una carpeta y teclea `xonecode`», es «teclea `xonecode` y elige entorno y proyecto».
- **docs/COMO-PROBARLO.md**: cómo probar la web (`npm run build:web && ./bin/xonecode`), y que `--cli` sigue siendo la vía de la terminal.

- [ ] **Step 7: Verificación final completa**

Run: `npm test && npm run typecheck && npm run build`
Expected: toda la suite en verde, typecheck limpio, build limpio.

- [ ] **Step 8: Commit**

```bash
git add src/cli/main.ts src/cli/main.test.ts CLAUDE.md README.md docs/COMO-PROBARLO.md
git commit -m "feat(web): xonecode abre la web; la consola de terminal queda en --cli"
```

```json:metadata
{"files": ["src/cli/main.ts", "src/cli/main.test.ts", "CLAUDE.md", "README.md", "docs/COMO-PROBARLO.md"], "verifyCommand": "npm test && npm run typecheck && npm run build", "acceptanceCriteria": ["con TTY la omisión es web", "sin TTY la omisión es consola", "--cli gana siempre", "falta el build del cliente sale 70 con mensaje", "proyecto offline avisado", "subcomandos y códigos intactos", "suite verde y typecheck limpio"], "modelTier": "standard"}
```

---

## Orden y dependencias

```
0 (vitest.config) ─┬─▶ 10 (apps/web) ─▶ 11 (conexión) ─▶ 12 (maqueta) ─▶ 13 (chat/trayectoria) ─▶ 14 (aprobación/wizard) ─┐
                   │                                                                                                      │
1 (decidirPiel) ───┤                                                                                                      ├─▶ 15 (omisión + docs)
2 (core/actos) ────┼─▶ 6 (pielWeb) ──▶ 7 (consolaWeb) ──▶ 8 (sesiones) ──▶ 9 (vestíbulo) ─────────────────────────────────┘
3 (settings) ──────┤                        ▲
4 (oauth) ─────────┘                        │
5 (servidor) ───────────────────────────────┘
```

- **0** va primero: sin `vitest.config.ts` los tests del cliente no pueden tener `jsdom`.
- **2, 3, 4, 5** son independientes entre sí y pueden ir en paralelo.
- **9** (vestíbulo) necesita 3, 4, 7 y 8.
- **15** es la última a propósito: hasta entonces `xonecode` sigue abriendo la consola de siempre y el repo nunca queda a medias.

## Lo que este plan NO hace (y el spec ya declaró)

Sesiones concurrentes. Sesiones que continúan la conversación con checkpointer persistente.
La franja temporal de la Trayectoria. Los iconos de feedback. La descarga del «session log».
Ajustes más allá de entornos, workspace y modelo. `0.0.0.0`. Que el cwd preseleccione
proyecto. El renombrado de tokens a `--xone-*`. Proyectos offline en la web.

## Asunciones que hay que confirmar durante la ejecución

1. **El `redirect_uri` de un CloudStudio on-premise.** El puerto 7634 es fijo porque el IDS
   registra esa URL. Un IDS de cliente tiene que tenerla registrada también, o el entorno
   necesita su propio puerto en la ficha. Es pregunta para el equipo de servidor: si la
   respuesta llega antes de la Task 9, se implementa; si no, se registra como limitación
   conocida y el on-premise queda a medias **declarado**, no roto en silencio.
2. **`SesionReal` no tiene `cerrar()`** (`agent/turnoReal.ts:31`). La Task 9 lo necesita
   para cambiar de proyecto. Si añadirlo resulta invasivo, la alternativa es documentar qué
   queda vivo (el `MemorySaver` y el agente construido) y aceptar la fuga hasta que se
   cierre el proceso — pero **hay que decirlo**, no descubrirlo.
