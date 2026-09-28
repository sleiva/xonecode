# Panel del proyecto y gestor de tareas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pulsar un proyecto abre su panel con pestañas (Resumen, Tareas, Conectores); se vincula un proyecto de Jira por el conector MCP, se ven y buscan sus pendientes, se abre una sesión nueva con una tarea, y en Jira escribe el harness con tarjeta de aprobación (EN CURSO al empezar; comentario + transición al cerrar).

**Architecture:** Un puerto puro `GestorDeTareasPort` en `core/` con su doble; un único adaptador `agent/conectores/gestorJira.ts` que llama a las tools del conector `jira` por `ServicioDeConectores.llamar`; el servidor atiende un mensaje `gestor` con acciones; el cliente pinta un tercer estado del centro (panel) y dos diálogos de aprobación.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` (Client + StreamableHTTP/SSE, y `McpServer` + `InMemoryTransport` en los tests), node:http, React + Vite, vitest (`host` en node, `cliente` en jsdom).

**Spec:** `docs/superpowers/specs/2026-09-28-panel-del-proyecto-design.md`

## Global Constraints

- **`npm test` sin red, sin clave, sin tocar `~/.xonecode/`** (el HOME ya se muda en `vitest.config.ts`). Correr con `FORCE_COLOR=0 npx vitest run --maxWorkers=2`.
- **`npm run typecheck`** (dos proyectos) limpio al cerrar cada tarea.
- **`core/` no importa `@modelcontextprotocol`** (`src/core/imports.test.ts`).
- **Ningún color literal fuera de `apps/web/estilos/marca.css`** (`Barra.test.tsx`). Botones con `composes:` de `Boton.module.css`, sin redeclarar `padding/font-size/font-weight/border/background/color` en la misma regla (`Boton.test.ts`).
- **Tipos del cable redeclarados**: cada `{ clase: "X"` nuevo aparece el MISMO número de veces en `src/web/servidor/transporte.ts` y `apps/web/src/tipos.ts` (`apps/web/src/tipos.test.ts`).
- **Ni tokens, ni URL de autorización, ni correos cruzan el cable**. Del asignado de Jira solo viaja `displayName`. Sí viaja la URL pública del ticket (`https://<sitio>.atlassian.net/browse/<CLAVE>`).
- **En Jira escribe el HARNESS con aprobación, nunca el agente.** Ninguna tarea de este plan da tools de Jira al agente (eso es IXCODE-10).
- **Una composición de producción no se deja dentro de algo que los tests doblan sin un test que la mire desde fuera** (patrón de fallo de `CLAUDE.md`): el cableado del gestor en `arrancarConsolaWeb` y los campos nuevos en los lectores del cable del cliente llevan su test.
- **Comentarios y textos de UI en español**, con la densidad y el tono del código vecino.
- Commits: `git add` por NOMBRE de fichero (nunca `-A`/`.`), mensaje terminado en:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_015Ysub1mAX2h85cnN8QFNWP`.

**Medido contra `https://mcp.atlassian.com/v1/mcp` (28-09-2026)** — las formas que el adaptador y su servidor de mentira deben respetar. Cada respuesta es `{ content: [{ type: "text", text: "<JSON>" }], isError: false }`:
- `getAccessibleAtlassianResources({})` → `[{ id, url, name, scopes, avatarUrl }]`
- `getVisibleJiraProjects({ cloudId, maxResults?, searchString?, startAt? })` → `{ values: [{ id, key, name, … }], total, isLast, startAt, maxResults }`
- `searchJiraIssuesUsingJql({ cloudId, jql, maxResults?, fields?: string[] })` → `{ issues: [{ id, key, fields: { summary, status: { name, statusCategory: { key: "new"|"indeterminate"|"done" } }, assignee: { displayName, emailAddress, accountId } | null } }], isLast, nextPageToken? }`
- `getJiraIssue({ cloudId, issueIdOrKey, fields? })` → `{ id, key, fields: { summary, description: string /* markdown */, status, assignee } }`
- `getTransitionsForJiraIssue({ cloudId, issueIdOrKey })` → `{ transitions: [{ id, name, to: { name, statusCategory }, isAvailable }] }`
- `transitionJiraIssue({ cloudId, issueIdOrKey, transition: { id } })` (escritura)
- `addCommentToJiraIssue({ cloudId, issueIdOrKey, commentBody, contentFormat?: "markdown" })` (escritura)

**User decisions (already made):**
- «pulsar un proyecto abre su panel», «no crear una nueva sesión como ahora»; el «+» sigue siendo sesión nueva directa.
- «después adicionaremos al panel del proyecto algunos tabs»: el panel va con pestañas.
- «si conecto el proyecto de jira al proyecto de xonecode, seamos capaces de buscar tareas pendientes».
- «la 2»: «Nueva sesión con esta tarea».
- «harness con tarjeta y EN CURSO al empezar».
- «que lo envíe yo»: el ticket va al compositor, no se manda solo.

---

## Paso 1 — Ver y empezar tareas

### Task 1: El puerto del gestor de tareas (puro)

**Goal:** `core/gestorDeTareas.ts` con los tipos del puerto, la JQL de pendientes, la categoría de un estado y la transición propuesta, más un doble en `core/ports.ts`.

**Files:**
- Create: `src/core/gestorDeTareas.ts`
- Create: `src/core/gestorDeTareas.test.ts`
- Modify: `src/core/ports.ts` (añadir `GestorDeTareasEnMemoria` con `ES_DOBLE`)

**Acceptance Criteria:**
- [ ] `jqlDePendientes({ proyecto: "IXCODE" })` devuelve `project = "IXCODE" AND statusCategory != Done ORDER BY updated DESC`, y con `texto: 'menú "x"'` añade `AND text ~ "menú \"x\""` con comillas y barras escapadas.
- [ ] `motivoDeClaveDeProyecto("ixcode")`, `("IX CODE")`, `('X" OR 1=1')` devuelven un motivo; `("IXCODE")`, `("HUB")`, `("A1_B")` devuelven `undefined`.
- [ ] `categoriaDeEstado("new"|"indeterminate"|"done"|otro)` → `"por-hacer"|"en-curso"|"terminada"|"por-hacer"`.
- [ ] `transicionPropuesta(ts, "empezar")` elige la primera disponible cuyo destino es de categoría `en-curso` (o cuyo nombre es `EN CURSO` sin distinguir mayúsculas); `"cerrar"` elige la llamada `PROBAR` si existe, y si no, la primera de categoría `terminada`; sin candidata → `undefined`.
- [ ] `GestorDeTareasEnMemoria` implementa el puerto sobre listas en memoria y registra las escrituras (`transiciones` y `comentarios` aplicados) para que los tests del servidor las comprueben.

**Verify:** `FORCE_COLOR=0 npx vitest run src/core/gestorDeTareas.test.ts src/core/imports.test.ts` → verde.

**Steps:**

- [ ] **Step 1: Escribir los tests** (`src/core/gestorDeTareas.test.ts`) con los casos de los criterios. Ejemplo:

```ts
import { describe, expect, it } from "vitest";
import { categoriaDeEstado, jqlDePendientes, motivoDeClaveDeProyecto, transicionPropuesta, type TransicionDelGestor } from "./gestorDeTareas.js";

describe("jqlDePendientes", () => {
  it("las pendientes de un proyecto, lo último tocado arriba", () => {
    expect(jqlDePendientes({ proyecto: "IXCODE" })).toBe('project = "IXCODE" AND statusCategory != Done ORDER BY updated DESC');
  });
  it("el texto de búsqueda entra ESCAPADO: es una JQL", () => {
    expect(jqlDePendientes({ proyecto: "IXCODE" }, 'menú "x" \\ y')).toBe(
      'project = "IXCODE" AND statusCategory != Done AND text ~ "menú \\"x\\" \\\\ y" ORDER BY updated DESC'
    );
  });
  it("un texto vacío o de espacios no añade nada", () => {
    expect(jqlDePendientes({ proyecto: "IXCODE" }, "   ")).toBe(jqlDePendientes({ proyecto: "IXCODE" }));
  });
});

describe("motivoDeClaveDeProyecto", () => {
  it.each(["IXCODE", "HUB", "A1_B"])("%s vale", (c) => expect(motivoDeClaveDeProyecto(c)).toBeUndefined());
  it.each(["ixcode", "IX CODE", 'X" OR 1=1', "", "1ABC"])("%s no", (c) => expect(motivoDeClaveDeProyecto(c)).toBeTypeOf("string"));
});

const t = (id: string, nombre: string, destino: string, categoria: "por-hacer" | "en-curso" | "terminada"): TransicionDelGestor => ({ id, nombre, destino, categoria });
describe("transicionPropuesta", () => {
  const ts = [t("11", "Volver", "PROBLEMA", "por-hacer"), t("21", "Empezar", "EN CURSO", "en-curso"), t("2", "PROBAR", "PROBAR", "en-curso"), t("31", "Hecho", "TERMINADO", "terminada")];
  it("al empezar, la que lleva a EN CURSO", () => expect(transicionPropuesta(ts, "empezar")?.id).toBe("21"));
  it("al cerrar, PROBAR si existe", () => expect(transicionPropuesta(ts, "cerrar")?.id).toBe("2"));
  it("al cerrar sin PROBAR, la primera terminada", () => expect(transicionPropuesta(ts.filter((x) => x.id !== "2"), "cerrar")?.id).toBe("31"));
  it("sin candidata, nada", () => expect(transicionPropuesta([ts[0]!], "cerrar")).toBeUndefined());
});
```

- [ ] **Step 2: Correr y ver que falla** (`Cannot find module './gestorDeTareas.js'`).

- [ ] **Step 3: Implementar** `src/core/gestorDeTareas.ts`:

```ts
/**
 * El gestor de tareas de un proyecto (IXCODE-11), como PUERTO: el panel del proyecto lista las
 * pendientes, abre una sesión con una, y al empezar y al cerrar escribe en él —siempre el HARNESS,
 * con la aprobación de la persona, nunca el agente—. Hoy lo implementa un solo adaptador, Jira por
 * su conector MCP (`agent/conectores/gestorJira.ts`); nada fuera de él sabe que es Jira.
 *
 * Puro: `core/` no importa `@modelcontextprotocol` (`imports.test.ts`).
 */
export type CategoriaDeTarea = "por-hacer" | "en-curso" | "terminada";

export interface Vinculo {
  /** El id del conector (`jira`). */
  conector: string;
  /** El sitio del gestor (en Jira, el `cloudId`). */
  sitio: string;
  /** La clave del proyecto en el gestor (`IXCODE`). */
  proyecto: string;
}

export interface TareaDelGestor {
  clave: string;
  titulo: string;
  estado: string;
  categoria: CategoriaDeTarea;
  /** Solo el nombre visible: el correo y el id de la cuenta no cruzan el cable. */
  asignado?: string;
  /** Para abrirla en el navegador. */
  url?: string;
}

export interface FichaDelGestor extends TareaDelGestor {
  descripcion: string;
}

export interface TransicionDelGestor {
  id: string;
  nombre: string;
  /** El estado al que lleva. */
  destino: string;
  categoria: CategoriaDeTarea;
}

export interface GestorDeTareasPort {
  sitios(): Promise<{ id: string; nombre: string; url?: string }[]>;
  proyectos(sitio: string): Promise<{ clave: string; nombre: string }[]>;
  pendientes(v: Vinculo, texto?: string): Promise<TareaDelGestor[]>;
  ficha(v: Vinculo, clave: string): Promise<FichaDelGestor>;
  transiciones(v: Vinculo, clave: string): Promise<TransicionDelGestor[]>;
  transicionar(v: Vinculo, clave: string, transicion: string): Promise<void>;
  comentar(v: Vinculo, clave: string, texto: string): Promise<void>;
}

/** Una clave de proyecto de Jira: MAYÚSCULAS, dígitos y `_`, empezando por letra. Entra en una JQL. */
export function motivoDeClaveDeProyecto(clave: string): string | undefined {
  return /^[A-Z][A-Z0-9_]+$/.test(clave) ? undefined : `«${clave}» no es una clave de proyecto (mayúsculas, dígitos y _, empezando por letra)`;
}

/** Una cadena JQL entre comillas dobles: se escapan la barra y la comilla. */
function cadenaJql(texto: string): string {
  return `"${texto.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Las pendientes: categoría distinta de terminada, lo último tocado arriba. */
export function jqlDePendientes(v: Pick<Vinculo, "proyecto">, texto?: string): string {
  const filtro = texto === undefined || texto.trim() === "" ? "" : ` AND text ~ ${cadenaJql(texto.trim())}`;
  return `project = ${cadenaJql(v.proyecto)} AND statusCategory != Done${filtro} ORDER BY updated DESC`;
}

/** La categoría de estado del gestor (en Jira, `statusCategory.key`). Lo que no se conoce, por hacer. */
export function categoriaDeEstado(clave: string | undefined): CategoriaDeTarea {
  if (clave === "indeterminate") return "en-curso";
  if (clave === "done") return "terminada";
  return "por-hacer";
}

/**
 * La transición que se PROPONE en la tarjeta (la persona puede elegir otra o ninguna). Al empezar,
 * la que lleva a EN CURSO; al cerrar, PROBAR si existe —es el flujo de IXCODE: PROBLEMA → EN CURSO →
 * PROBAR → PREPROD → TERMINADO—, y si no, la primera que termina.
 */
export function transicionPropuesta(ts: readonly TransicionDelGestor[], para: "empezar" | "cerrar"): TransicionDelGestor | undefined {
  if (para === "empezar") return ts.find((t) => /^en curso$/i.test(t.destino)) ?? ts.find((t) => t.categoria === "en-curso");
  return ts.find((t) => /^probar$/i.test(t.destino) || /^probar$/i.test(t.nombre)) ?? ts.find((t) => t.categoria === "terminada");
}
```

  Y en `src/core/ports.ts`, junto a los demás dobles y con la misma marca `ES_DOBLE` que ellos:

```ts
/** Un gestor de tareas en memoria: lo que el servidor y el cliente prueban sin red. Apunta lo ESCRITO. */
export class GestorDeTareasEnMemoria implements GestorDeTareasPort {
  readonly [ES_DOBLE] = true;
  readonly transicionesAplicadas: { clave: string; transicion: string }[] = [];
  readonly comentariosAplicados: { clave: string; texto: string }[] = [];
  constructor(
    private readonly datos: {
      sitios?: { id: string; nombre: string; url?: string }[];
      proyectos?: Record<string, { clave: string; nombre: string }[]>;
      tareas?: FichaDelGestor[];
      transiciones?: Record<string, TransicionDelGestor[]>;
    } = {}
  ) {}
  async sitios() { return this.datos.sitios ?? []; }
  async proyectos(sitio: string) { return this.datos.proyectos?.[sitio] ?? []; }
  async pendientes(_v: Vinculo, texto?: string) {
    const t = (texto ?? "").toLowerCase();
    return (this.datos.tareas ?? [])
      .filter((x) => x.categoria !== "terminada" && (t === "" || `${x.titulo} ${x.descripcion}`.toLowerCase().includes(t)))
      .map(({ descripcion: _d, ...resto }) => resto);
  }
  async ficha(_v: Vinculo, clave: string) {
    const f = (this.datos.tareas ?? []).find((x) => x.clave === clave);
    if (f === undefined) throw new Error(`no existe ${clave}`);
    return f;
  }
  async transiciones(_v: Vinculo, clave: string) { return this.datos.transiciones?.[clave] ?? []; }
  async transicionar(_v: Vinculo, clave: string, transicion: string) { this.transicionesAplicadas.push({ clave, transicion }); }
  async comentar(_v: Vinculo, clave: string, texto: string) { this.comentariosAplicados.push({ clave, texto }); }
}
```

  (Mira cómo están declarados los otros dobles de `ports.ts` —`SkillsEnMemoria`, `ModeloGuionizado`— y copia su forma exacta de marcar `ES_DOBLE`; si usan otra sintaxis, sigue la suya.)

- [ ] **Step 4: Correr y ver verde**, más `npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(core): el puerto del gestor de tareas, puro, con su doble (IXCODE-11)`.

```json:metadata
{"files": ["src/core/gestorDeTareas.ts", "src/core/gestorDeTareas.test.ts", "src/core/ports.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/core/gestorDeTareas.test.ts src/core/imports.test.ts", "acceptanceCriteria": ["jqlDePendientes con escape", "motivoDeClaveDeProyecto", "categoriaDeEstado", "transicionPropuesta empezar/cerrar", "GestorDeTareasEnMemoria registra escrituras"], "modelTier": "mechanical"}
```

---

### Task 2: Un refresh OAuth muerto vuelve a autorizar (arreglo A)

**Goal:** Si `autorizar` falla por credencial muerta, se borran los tokens y se reintenta UNA vez, lo que abre el navegador; hoy deja «no responde» para siempre.

**Files:**
- Modify: `src/agent/conectores/servicioDeConectores.ts` (`autorizar`, ~líneas 380-395)
- Test: `src/agent/conectores/servicioDeConectores.test.ts`

**Contexto (leído en el código, `docs` en la memoria `puerto-del-callback-oauth-mcp`):** el SDK, al no casar el `redirectUri`, registra un cliente nuevo (DCR) y luego intenta el refresh con el refresh token VIEJO; el servidor responde `invalid_grant` → `InvalidGrantError` (de `@modelcontextprotocol/sdk/server/auth/errors.js`, el mismo módulo que usa el SDK) que el SDK relanza. El `catch` de `autorizar` lo convierte en «no responde». `ProveedorDeConector.invalidateCredentials` ya existe y nadie lo llama.

**Acceptance Criteria:**
- [ ] Con una `RedDeConectores` doble cuya `iniciarAutorizacion` lanza `new InvalidGrantError("x")` la PRIMERA vez y devuelve `"REDIRECT"` la segunda, `autorizar(id, redirect)` llama dos veces a `iniciarAutorizacion`, deja los tokens del conector borrados antes del segundo intento (`leerOAuth(casa, id).tokens === undefined`), y termina con un pendiente vivo (sin prueba en rojo).
- [ ] Lo mismo con `InvalidClientError` y `UnauthorizedClientError`.
- [ ] Si el segundo intento también falla, la prueba queda en rojo con el motivo (no hay tercer intento).
- [ ] Un error que NO es de credencial (p. ej. `new Error("ECONNREFUSED")`) no reintenta: comportamiento de hoy.

**Verify:** `FORCE_COLOR=0 npx vitest run src/agent/conectores/` → verde.

**Steps:**

- [ ] **Step 1: Tests** en `servicioDeConectores.test.ts`, usando la construcción de servicio de los tests vecinos (`crearServicioDeConectores` con una red doble y una casa temporal). Siembra tokens con `guardarOAuth(casa, "jira", { tokens: { access_token: "a", token_type: "Bearer", refresh_token: "r" }, redirectUri: "http://127.0.0.1:4173/conectores/callback" })` y comprueba los criterios.
- [ ] **Step 2: Ver que falla** (una sola llamada, prueba «no responde»).
- [ ] **Step 3: Implementar.** Importa las tres clases de `@modelcontextprotocol/sdk/server/auth/errors.js`. En `autorizar`, envuelve el intento en una función que se pueda repetir; en el `catch`, si `e` es instancia de una de las tres y es el primer intento: `proveedor(id, redirectUrl, state).invalidateCredentials("tokens")` (o el borrado equivalente de `tokens` con `guardarOAuth(o.casa, id, { ...leerOAuth(o.casa, id), tokens: undefined })` si `invalidateCredentials` no lo hace ya — léelo en `proveedorDeConector.ts:62`), vuelve a sembrar el pendiente (`pendientes.set(state, …)`: el `delete` del catch se lo llevó) y reintenta con un `ProveedorDeConector` NUEVO (cachea sus datos). Comenta el porqué en el sitio con el molde de los comentarios vecinos.
- [ ] **Step 4: Verde** + typecheck.
- [ ] **Step 5: Commit** — `fix(conectores): un refresh OAuth muerto vuelve a autorizar en vez de quedarse en «no responde» (IXCODE-11)`.

```json:metadata
{"files": ["src/agent/conectores/servicioDeConectores.ts", "src/agent/conectores/servicioDeConectores.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/agent/conectores/", "acceptanceCriteria": ["InvalidGrant/InvalidClient/UnauthorizedClient reintenta una vez con tokens borrados", "segundo fallo en rojo sin tercer intento", "otros errores no reintentan"], "modelTier": "standard"}
```

---

### Task 3: Llamar a una tool de un conector

**Goal:** `RedDeConectores.llamarTool` y `ServicioDeConectores.llamar(id, nombre, args)`, con la misma credencial, los mismos dos transportes y el mismo tope que `probar`.

**Files:**
- Modify: `src/agent/conectores/servicioDeConectores.ts` (interfaz `RedDeConectores` :71, `ServicioDeConectores` :34, implementación, `redDeConectoresReal` :463, `ClienteDeMcp` :437)
- Test: `src/agent/conectores/servicioDeConectores.test.ts`

**Acceptance Criteria:**
- [ ] `RedDeConectores.llamarTool(url, credencial, nombre, args, senal): Promise<string>` devuelve el texto del primer bloque `type: "text"` del resultado; si `isError: true`, lanza `Error` con ese texto recortado a 300 caracteres.
- [ ] `ServicioDeConectores.llamar(id, nombre, args): Promise<string>`: si el conector no está añadido → lanza `Error("«id» no está conectado")`; si pide auth y no hay credencial → `Error("falta autorizar")`; si pasa `TOPE_DE_CONEXION_MS` → `Error("no responde (no contestó a tiempo)")`; un 401 → el mismo motivo que da `probar` (`motivoDe`). **No toca `pruebas` ni emite cambio**: es una llamada, no una prueba.
- [ ] `redDeConectoresReal().llamarTool` usa la MISMA costura (`primario` y, si falla al conectar, `respaldo`), cierra el cliente en un `finally`, y `ClienteDeMcp` pasa a `Pick<Client, "connect" | "close" | "listTools" | "callTool">`.
- [ ] Probado contra un `McpServer` real en proceso con `InMemoryTransport.createLinkedPair()` (del SDK: `@modelcontextprotocol/sdk/inMemory.js`) inyectado por la costura, sin red.

**Verify:** `FORCE_COLOR=0 npx vitest run src/agent/conectores/` → verde.

**Steps:**

- [ ] **Step 1: Tests.** Uno a nivel de red real con la costura: `crearCliente` normal y `primario: () => clienteTransport` de un par en memoria cuyo lado servidor es un `McpServer` con una tool `eco` que devuelve `{ content: [{ type: "text", text: JSON.stringify(args) }] }` y otra `rota` que devuelve `isError: true`. Otro a nivel de servicio con red doble.
- [ ] **Step 2: Ver que falla.**
- [ ] **Step 3: Implementar**, factorizando la conexión de `listarTools` (primario → respaldo, relanzando el error del primario) en una función interna `conectar(url, credencial, senal)` que usen los dos, para no duplicar ese bloque. El tope de `llamar` con el mismo `AbortController` + `setTimeout` que `probar`.
- [ ] **Step 4: Verde** + typecheck.
- [ ] **Step 5: Commit** — `feat(conectores): llamar a una tool de un conector, con la credencial y el tope de probar (IXCODE-11)`.

```json:metadata
{"files": ["src/agent/conectores/servicioDeConectores.ts", "src/agent/conectores/servicioDeConectores.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/agent/conectores/", "acceptanceCriteria": ["llamarTool devuelve el texto o lanza con isError", "llamar: no conectado / falta autorizar / tope / 401", "conexión factorizada y probada con McpServer en memoria"], "modelTier": "standard"}
```

---

### Task 4: El adaptador Jira

**Goal:** `agent/conectores/gestorJira.ts` implementa `GestorDeTareasPort` sobre `servicio.llamar("jira", …)`; es el único fichero con nombres de tools de Jira y formas de sus respuestas.

**Files:**
- Create: `src/agent/conectores/gestorJira.ts`
- Create: `src/agent/conectores/gestorJira.test.ts`

**Acceptance Criteria:**
- [ ] `crearGestorJira(llamar: (nombre: string, args: Record<string, unknown>) => Promise<string>): GestorDeTareasPort`.
- [ ] `sitios()` → de `getAccessibleAtlassianResources` `{ id, nombre: name, url }`.
- [ ] `proyectos(sitio)` → de `getVisibleJiraProjects({ cloudId: sitio, maxResults: 100 })` `values[] → { clave: key, nombre: name }`.
- [ ] `pendientes(v, texto?)` → `searchJiraIssuesUsingJql({ cloudId: v.sitio, jql: jqlDePendientes(v, texto), maxResults: 50, fields: ["summary","status","assignee"] })`, cada `issue` → `{ clave: key, titulo: fields.summary, estado: fields.status.name, categoria: categoriaDeEstado(fields.status.statusCategory.key), asignado?: fields.assignee?.displayName, url }`. **Nunca `emailAddress` ni `accountId`.** `v.proyecto` inválido (`motivoDeClaveDeProyecto`) lanza sin llamar.
- [ ] `url` de una tarea = `<url del sitio>/browse/<clave>`; el adaptador guarda la url del sitio que devolvió `sitios()` (cachea por `cloudId` dentro de la instancia; si no la sabe, `url` ausente).
- [ ] `ficha(v, clave)` → `getJiraIssue({ cloudId, issueIdOrKey: clave, fields: ["summary","status","assignee","description"] })` con `descripcion: fields.description ?? ""`.
- [ ] `transiciones(v, clave)` → `getTransitionsForJiraIssue` solo las `isAvailable !== false` → `{ id, nombre: name, destino: to.name, categoria: categoriaDeEstado(to.statusCategory?.key) }`.
- [ ] `transicionar(v, clave, id)` → `transitionJiraIssue({ cloudId, issueIdOrKey: clave, transition: { id } })`; `comentar(v, clave, texto)` → `addCommentToJiraIssue({ cloudId, issueIdOrKey: clave, commentBody: texto, contentFormat: "markdown" })`.
- [ ] Una respuesta que no es el JSON esperado lanza `Error("Jira contestó algo que no se entiende (<tool>)")`; nunca una lista vacía.
- [ ] Tests con un `llamar` de mentira que devuelve las formas MEDIDAS (ver Global Constraints), incluido un `assignee` con `emailAddress` que NO debe aparecer en el resultado (`JSON.stringify(resultado)` no contiene `@`).

**Verify:** `FORCE_COLOR=0 npx vitest run src/agent/conectores/gestorJira.test.ts` → verde.

**Steps:**

- [ ] **Step 1: Tests** con fixtures literales de las formas medidas.
- [ ] **Step 2: Ver que falla.**
- [ ] **Step 3: Implementar**: una función `json(tool, texto)` que hace `JSON.parse` y lanza el error de «no se entiende»; lectores defensivos por campo (`typeof … === "string"`), como `planesDelCable.ts` en el cliente.
- [ ] **Step 4: Verde** + typecheck.
- [ ] **Step 5: Commit** — `feat(conectores): el gestor de tareas de Jira sobre su conector MCP (IXCODE-11)`.

```json:metadata
{"files": ["src/agent/conectores/gestorJira.ts", "src/agent/conectores/gestorJira.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/agent/conectores/gestorJira.test.ts", "acceptanceCriteria": ["siete operaciones sobre las tools medidas", "sin emailAddress ni accountId", "url /browse/", "respuesta rara lanza"], "modelTier": "standard"}
```

---

### Task 5: El vínculo en la configuración del proyecto

**Goal:** Dos claves nuevas en `.xonecode/config.json` —`conectores` y `gestorDeTareas`— con su validación y sus escritores.

**Files:**
- Modify: `src/core/config.ts` (`ConfigDeFichero` :30, `validar` :150)
- Modify: `src/agent/config/configEnDisco.ts` (junto a `guardarModoDeProyecto` ~:274)
- Test: `src/core/config.test.ts`, `src/agent/config/configEnDisco.test.ts`

**Acceptance Criteria:**
- [ ] `ConfigDeFichero.conectores?: string[]` y `ConfigDeFichero.gestorDeTareas?: { conector: string; sitio: string; proyecto: string }`.
- [ ] `validar` acepta `conectores` como lista de cadenas no vacías (descarta con aviso lo que no lo sea) y `gestorDeTareas` con los tres campos cadena y `proyecto` que pase `motivoDeClaveDeProyecto` (si no, aviso y se descarta ENTERO), con el molde del branch `tema` (:316).
- [ ] `guardarConectoresDeProyecto(raiz, ids: string[])` y `guardarGestorDeProyecto(raiz, gestor: Vinculo | undefined)` (con `undefined` quita la clave), con el molde de `guardarModoDeProyecto`: `leerObjetoCrudoOAbortar` → mezcla → `escribirAtomico`. Conservan el resto de claves del fichero.
- [ ] `cargar(raiz)` devuelve las dos claves.

**Verify:** `FORCE_COLOR=0 npx vitest run src/core/config.test.ts src/agent/config/` → verde.

**Steps:** tests (validar: válido, inválido, clave de proyecto mala; escritor: conserva otras claves y quita con `undefined`), ver fallar, implementar, verde, commit `feat(config): el proyecto guarda sus conectores y su gestor de tareas (IXCODE-11)`.

```json:metadata
{"files": ["src/core/config.ts", "src/core/config.test.ts", "src/agent/config/configEnDisco.ts", "src/agent/config/configEnDisco.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/core/config.test.ts src/agent/config/", "acceptanceCriteria": ["dos claves en ConfigDeFichero", "validar con avisos", "dos escritores que conservan el resto"], "modelTier": "mechanical"}
```

---

### Task 6: La sesión ligada a un ticket

**Goal:** `EntradaIndice.ticket` se estampa al abrir una sesión con una tarea y viaja en la lista de sesiones del `alta`.

**Files:**
- Modify: `src/web/servidor/sesiones.ts` (`EntradaIndice` :100; nueva `anotarTicket` con el molde de `elegirEsfuerzo` :553)
- Modify: `src/web/servidor/vestibulo.ts` (`PuertoDeSesiones` ~:190, `SESIONES_EN_DISCO` ~:207; `volcar` ~:1405 re-estampa lo elegido en memoria)
- Modify: `src/web/servidor/transporte.ts` (`SesionDelCable` :60 gana `ticket?: string`)
- Modify: `src/web/servidor/arranque.ts` (`sesionesDelProyecto` :2334 copia `ticket`)
- Modify: `apps/web/src/tipos.ts` (`SesionDelCable` :198) y el lector del cliente de las sesiones del `alta` (busca dónde se copian `deTarea`/`trabajando`: debe copiar `ticket` o se perderá, como pasó con `progreso`)
- Test: `sesiones.test.ts`, `vestibulo.test.ts`, el test del lector del cliente

**Acceptance Criteria:**
- [ ] `EntradaIndice.ticket?: { conector: string; sitio: string; clave: string }` y `anotarTicket(raiz, id, ticket)` devuelve `false` si la entrada no existe.
- [ ] La consola del proyecto admite fijar el ticket ANTES del primer mensaje (la sesión aún no está en el índice): se guarda en memoria y `volcar` lo estampa al anotar, como hace con dispositivo/esfuerzo/modo.
- [ ] `sesionesDelProyecto` pone `ticket: "<clave>"` y el cliente lo conserva en su estado (test del lector).

**Verify:** `FORCE_COLOR=0 npx vitest run src/web/servidor/sesiones.test.ts src/web/servidor/vestibulo.test.ts apps/web/src/` → verde.

**Steps:** tests (índice, volcar diferido, lector del cliente), ver fallar, implementar siguiendo exactamente cómo viaja `esfuerzo` de principio a fin (memoria → `volcar` → índice → cable), verde, commit `feat(sesiones): una sesión puede quedar ligada a un ticket (IXCODE-11)`.

```json:metadata
{"files": ["src/web/servidor/sesiones.ts", "src/web/servidor/vestibulo.ts", "src/web/servidor/transporte.ts", "src/web/servidor/arranque.ts", "apps/web/src/tipos.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/web/servidor/sesiones.test.ts src/web/servidor/vestibulo.test.ts apps/web/src/", "acceptanceCriteria": ["EntradaIndice.ticket + anotarTicket", "estampado diferido en volcar", "ticket viaja y el cliente lo conserva"], "modelTier": "standard"}
```

---

### Task 7: El servidor atiende el gestor (lectura y empezar sin escribir)

**Goal:** Mensaje `gestor` con acciones `estado`, `sitios`, `proyectos`, `vincular`, `desvincular`, `usarConector`, `pendientes` y `empezar` (esta sin transición todavía), cableado en `arrancarConsolaWeb` con el adaptador Jira real.

**Files:**
- Modify: `src/web/servidor/transporte.ts` (`MensajeDelCliente` :1127 y `MensajeAlCliente` :138)
- Modify: `apps/web/src/tipos.ts` (los mismos, redeclarados)
- Modify: `src/web/servidor/arranque.ts` (`OpcionesDeMontaje` :347 gana `gestorDeTareas?: (conector: string) => GestorDeTareasPort | undefined`; despacho junto al de `planes` :4545; `atenderGestor`; factoría `ajusteDeGestorCableado` junto a `ajusteDeConectoresCableado` :5512 y su uso en `arrancarConsolaWeb` :5947)
- Test: `src/web/servidor/arranque.test.ts`

**Contrato del cable:**

```ts
// cliente → servidor
| { clase: "gestor"; accion: "estado" }
| { clase: "gestor"; accion: "sitios"; conector: string }
| { clase: "gestor"; accion: "proyectos"; conector: string; sitio: string }
| { clase: "gestor"; accion: "vincular"; conector: string; sitio: string; proyecto: string }
| { clase: "gestor"; accion: "desvincular" }
| { clase: "gestor"; accion: "usarConector"; conector: string; usar: boolean }
| { clase: "gestor"; accion: "pendientes"; texto?: string }
| { clase: "gestor"; accion: "empezar"; clave: string }
// servidor → cliente (un solo mensaje con campos opcionales, como `planes`)
| {
    clase: "gestor";
    estado?: { conectores: string[]; vinculo?: { conector: string; sitio: string; proyecto: string; nombreDelSitio?: string } };
    sitios?: { conector: string; lista: { id: string; nombre: string }[] };
    proyectos?: { sitio: string; lista: { clave: string; nombre: string }[] };
    pendientes?: { cuando: number; texto?: string; lista: TareaDelGestor[] };
    borrador?: { clave: string; texto: string };
    error?: { accion: string; motivo: string };
  }
```

(En `tipos.ts` se redeclaran `TareaDelGestor` y las demás formas, como ya se hace con `PlanDelCable`; no se importa de `src/`.)

**Acceptance Criteria:**
- [ ] Sin proyecto abierto no se contesta (como `atenderPlanes`); sin `opciones.gestorDeTareas` → `error` «esta ejecución no tiene gestor de tareas».
- [ ] `estado` devuelve `conectores` y `vinculo` del `config.json` del proyecto abierto.
- [ ] `vincular` comprueba `motivoDeClaveDeProyecto`, llama a `proyectos(sitio)` y SOLO si la clave está en la lista escribe con `guardarGestorDeProyecto` (y añade el conector a `conectores`); si no, `error` con motivo y el fichero no cambia (test: el `config.json` no cambia byte a byte).
- [ ] `pendientes` sin vínculo → `error` «este proyecto no tiene gestor de tareas»; con vínculo → `pendientes` con `cuando` (hora del servidor) y la lista del puerto; un fallo del puerto → `error` con su mensaje (sin rutas: `codigoDe` si es de Node).
- [ ] `empezar` lee `ficha(vinculo, clave)`, abre una sesión NUEVA del proyecto (el mismo camino que `atenderSesion` sin `sesion`), le fija el ticket (Task 6) y emite `borrador` con el texto:

```
Trabaja en esta tarea de Jira.

IXCODE-12 — <título>
Estado: <estado>
<url>

<descripción>
```

- [ ] Test del CABLEADO: `arrancarConsolaWeb` (o la función que compone sus opciones) incluye `gestorDeTareas`, mirado desde fuera como el resto de ajustes cableados de `arranque.test.ts`.
- [ ] `tipos.test.ts` verde (los `clase: "gestor"` cuadran en los dos ficheros).

**Verify:** `FORCE_COLOR=0 npx vitest run src/web/servidor/arranque.test.ts apps/web/src/tipos.test.ts` → verde.

**Steps:** tests con `GestorDeTareasEnMemoria` (Task 1) contra `montarRutas` como los tests vecinos de `planes`/`conector`; ver fallar; implementar `atenderGestor` como una función con `switch (accion)`; verde; commit `feat(web): el servidor atiende el gestor de tareas del proyecto (IXCODE-11)`.

```json:metadata
{"files": ["src/web/servidor/transporte.ts", "apps/web/src/tipos.ts", "src/web/servidor/arranque.ts", "src/web/servidor/arranque.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/web/servidor/arranque.test.ts apps/web/src/tipos.test.ts", "acceptanceCriteria": ["estado/sitios/proyectos/vincular/desvincular/usarConector/pendientes/empezar", "vincular solo escribe tras contestar", "empezar abre sesión con ticket y emite borrador", "cableado probado desde fuera"], "modelTier": "frontier"}
```

---

### Task 8: El panel del proyecto en el cliente

**Goal:** Pulsar un proyecto enseña el panel con las pestañas Resumen, Tareas y Conectores; «Nueva sesión» y «Nueva sesión con esta tarea» pasan al chat, la segunda con el ticket en el compositor sin enviar.

**Files:**
- Create: `apps/web/src/componentes/PanelDelProyecto.tsx`, `PanelDelProyecto.module.css`, `PanelDelProyecto.test.tsx`
- Create: `apps/web/src/gestorDelCable.ts` + `gestorDelCable.test.ts` (lector defensivo del mensaje `gestor`, molde de `planesDelCable.ts`)
- Modify: `apps/web/src/store.ts` (`EstadoDelCliente` :58 gana `gestor?`; `case "gestor"`; se tira al cambiar de proyecto, como `planes` :1917/:2039)
- Modify: `apps/web/src/App.tsx` (tercer estado del centro)
- Test: `apps/web/src/App.test.tsx`

**Acceptance Criteria:**
- [ ] **Centro:** estado local `enPanel`. `alAbrirProyecto` en la barra (`Barra.tsx:447` → `App.tsx:2005`) abre el proyecto como hoy (`abrirSesion(proyecto)` si tiene copia local) y pone `enPanel = true`; `enSesion` pasa a `proyectoAbierto && !enEscritorio && !enPanel`; con `enPanel` el centro es `<PanelDelProyecto>`. El «+» de la barra (`alNuevaSesion`) y pulsar una sesión ponen `enPanel = false`. Un proyecto SIN copia local sigue el camino de hoy (ventana de sesión nueva).
- [ ] **Resumen:** nombre, entorno y rama del proyecto; la lista de sesiones del proyecto (de `alta.proyectos[].sesiones`, las ligadas con «IXCODE-12 · título»), botón «Nueva sesión» (→ chat vacío); los planes con `resumenDelPlan` y la barra de progreso (reusa lo exportado de `Planes.tsx`); las tareas en background del proyecto (`<TareasDelProyecto>` con los mismos manejadores de `App.tsx:312-326`). Lo que no tenga dato no se pinta.
- [ ] **Tareas:** al abrir la pestaña pide `{clase:"gestor", accion:"pendientes"}`; pinta clave, título, estado y asignado, con la hora de la foto, un campo de búsqueda (Enter o botón) y «Reintentar»; cada fila con enlace «Abrir en Jira» (`target="_blank" rel="noreferrer"`) y botón «Nueva sesión con esta tarea» → `{clase:"gestor", accion:"empezar", clave}`. Sin vínculo: el texto «Este proyecto no tiene gestor de tareas.» y un botón a la pestaña Conectores; NUNCA una lista vacía en ese caso.
- [ ] Al llegar `borrador`, `App` sale del panel al chat y pone el texto con `setBorradorDelCompositor((b) => ({ texto, id: (b?.id ?? 0) + 1 }))` (el mecanismo que ya existe, `App.tsx:581/1727`); **no se envía** (test: `enviar` no recibe ninguna `prosa`).
- [ ] **Conectores:** pide `estado` y la lista global de conectores (el mensaje `conectores` que ya llega); por cada conector CONECTADO, la casilla «usar en este proyecto» (`usarConector`); en `jira`, desplegable de sitio (`sitios`; si hay uno solo se elige solo) y de proyecto (`proyectos`), y «Vincular»; con vínculo, lo enseña con «Desvincular». Un conector añadido pero no conectado se cuenta con el camino a Ajustes.
- [ ] Estilos solo con alias del tema y tokens de marca; botones compuestos de `Boton.module.css`. Pestañas con el mismo patrón de pestañas del `Panel` lateral (`role="tablist"`/`tab`).
- [ ] `gestorDelCable.ts` descarta lo que no tiene forma y **nunca** acepta `emailAddress` (test).

**Verify:** `FORCE_COLOR=0 npx vitest run apps/web/src/` y `npm run build:web` → verde.

**Steps:** tests del lector, del panel (tres pestañas, sin vínculo, búsqueda, empezar) y de `App` (pulsar proyecto → panel; «+» → chat; `borrador` → chat con texto sin enviar); ver fallar; implementar; verde + typecheck + `npm run build:web`; commit `feat(web): el panel del proyecto, con Resumen, Tareas y Conectores (IXCODE-11)`.

```json:metadata
{"files": ["apps/web/src/componentes/PanelDelProyecto.tsx", "apps/web/src/componentes/PanelDelProyecto.module.css", "apps/web/src/componentes/PanelDelProyecto.test.tsx", "apps/web/src/gestorDelCable.ts", "apps/web/src/gestorDelCable.test.ts", "apps/web/src/store.ts", "apps/web/src/App.tsx", "apps/web/src/App.test.tsx"], "verifyCommand": "FORCE_COLOR=0 npx vitest run apps/web/src/ && npm run build:web", "acceptanceCriteria": ["pulsar proyecto abre el panel", "Resumen/Tareas/Conectores", "borrador al compositor sin enviar", "sin vínculo lo dice", "lector sin emails"], "modelTier": "frontier"}
```

---

## Paso 2 — Escribir en Jira con aprobación

### Task 9: El comentario de cierre con lo que el harness sabe

**Goal:** Texto del comentario de cierre, puro, a partir de ficheros, commits, veredicto, plan y resumen.

**Files:**
- Modify: `src/core/gestorDeTareas.ts` (añadir `comentarioDeCierre`)
- Modify: `src/agent/sesiones/sesionGit.ts` (exportar `commitsDeSesion` :119, hoy privada)
- Create: `src/web/servidor/datosDeCierre.ts` (+ test): reúne `cambiosDeSesion(raiz, id)`, `commitsDeSesion(raiz, id)`, el último acto `tipo: "verificacion"` de `reabrirSesion(raiz, id).actos` y la última respuesta del asistente
- Test: `src/core/gestorDeTareas.test.ts`, `src/web/servidor/datosDeCierre.test.ts`

**Acceptance Criteria:**
- [ ] `comentarioDeCierre({ ficheros: {ruta, clase}[], commits: string[], veredicto?: { verde: boolean; errores: number; avisos: number }, plan?: string, resumen?: string })` devuelve markdown con secciones «Qué cambió» (lista de rutas con `nuevo/modificado/borrado`, y los hashes cortos de 7), «Verificación» («verde», «en rojo: N errores», o **«no corrió»** si falta —nunca «verde» sin veredicto—), «Plan» si hay, y «Resumen» recortado a 1500 caracteres; y una línea final «— escrito por xonecode».
- [ ] `datosDeCierre(raiz, id)` compone esos datos desde el disco real (test con un repo git temporal y una sesión con un commit sellado, molde de los tests de `sesionGit.ts`).

**Verify:** `FORCE_COLOR=0 npx vitest run src/core/gestorDeTareas.test.ts src/web/servidor/datosDeCierre.test.ts src/agent/sesiones/` → verde.

**Steps:** tests, fallar, implementar, verde, commit `feat(core): el comentario de cierre de una tarea, con lo que el harness sabe (IXCODE-11)`.

```json:metadata
{"files": ["src/core/gestorDeTareas.ts", "src/core/gestorDeTareas.test.ts", "src/agent/sesiones/sesionGit.ts", "src/web/servidor/datosDeCierre.ts", "src/web/servidor/datosDeCierre.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/core/gestorDeTareas.test.ts src/web/servidor/datosDeCierre.test.ts src/agent/sesiones/", "acceptanceCriteria": ["comentarioDeCierre con no corrió", "datosDeCierre desde disco real"], "modelTier": "standard"}
```

---

### Task 10: El servidor escribe en Jira (empezar con transición y cerrar)

**Goal:** Acciones `transiciones`, `empezar` con `transicion?` y `cerrar`, que son las únicas que escriben en Jira.

**Files:**
- Modify: `src/web/servidor/transporte.ts`, `apps/web/src/tipos.ts`, `src/web/servidor/arranque.ts`
- Test: `src/web/servidor/arranque.test.ts`

**Contrato (añade a Task 7):**

```ts
| { clase: "gestor"; accion: "transiciones"; clave: string; para: "empezar" | "cerrar" }
| { clase: "gestor"; accion: "empezar"; clave: string; transicion?: string }   // sustituye al de Task 7
| { clase: "gestor"; accion: "borradorDeCierre" }                               // de la sesión ABIERTA
| { clase: "gestor"; accion: "cerrar"; comentario: string; transicion?: string } // de la sesión ABIERTA
// servidor → cliente, campos nuevos del mismo mensaje:
transiciones?: { clave: string; para: "empezar" | "cerrar"; lista: TransicionDelGestor[]; propuesta?: string };
cierre?: { clave: string; comentario: string };
cerrado?: { clave: string; comento: boolean; transicion?: string };
```

**Acceptance Criteria:**
- [ ] `transiciones` devuelve la lista del puerto y `propuesta` = id de `transicionPropuesta(lista, para)`.
- [ ] `empezar` con `transicion` llama a `transicionar` ANTES de abrir la sesión; si falla, se emite `error` con motivo **y la sesión se abre igual** con su `borrador`.
- [ ] `borradorDeCierre` y `cerrar` solo con una sesión abierta ligada a un ticket (si no, `error` «esta sesión no está ligada a una tarea») y sin turno en vuelo (si no, `error` «espera a que termine el turno»).
- [ ] `borradorDeCierre` emite `cierre` con `comentarioDeCierre(datosDeCierre(raiz, id))`.
- [ ] `cerrar` con `comentario` vacío → `error`; si no, `comentar` y luego, si hay `transicion`, `transicionar`; emite `cerrado`. Si `comentar` falla, NO se transiciona y se emite `error` (el cliente conserva el texto). Test con `GestorDeTareasEnMemoria`: `comentariosAplicados`/`transicionesAplicadas` exactos en los tres casos (ok, falla comentar, sin transición).
- [ ] **Ninguna escritura sin un mensaje explícito del cliente**: ni `pendientes`, ni `empezar` sin `transicion`, ni `borradorDeCierre` escriben (test: las dos listas del doble vacías).

**Verify:** `FORCE_COLOR=0 npx vitest run src/web/servidor/arranque.test.ts apps/web/src/tipos.test.ts` → verde.

**Steps:** tests, fallar, implementar en `atenderGestor`, verde, commit `feat(web): el harness escribe en Jira al empezar y al cerrar, solo cuando se le pide (IXCODE-11)`.

```json:metadata
{"files": ["src/web/servidor/transporte.ts", "apps/web/src/tipos.ts", "src/web/servidor/arranque.ts", "src/web/servidor/arranque.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/web/servidor/arranque.test.ts apps/web/src/tipos.test.ts", "acceptanceCriteria": ["transiciones con propuesta", "empezar transiciona antes y abre igual si falla", "cerrar comenta y luego transiciona; si comentar falla no transiciona", "nada escribe sin mensaje explícito"], "modelTier": "standard"}
```

---

### Task 11: Las dos tarjetas de aprobación en el cliente

**Goal:** Tarjeta «Empezar» (al pulsar «Nueva sesión con esta tarea») y tarjeta «Cerrar en Jira» (botón en una sesión ligada), con la puerta de `Pregunta.tsx`.

**Files:**
- Create: `apps/web/src/componentes/TarjetaDeJira.tsx`, `TarjetaDeJira.module.css`, `TarjetaDeJira.test.tsx`
- Modify: `apps/web/src/componentes/PanelDelProyecto.tsx` (la fila pide `transiciones` y abre la tarjeta en vez de `empezar` directo)
- Modify: `apps/web/src/App.tsx` (botón «Cerrar en Jira» visible solo en una sesión con `ticket` y sin turno en vuelo; abre la tarjeta tras `borradorDeCierre`)
- Modify: `apps/web/src/gestorDelCable.ts`, `apps/web/src/store.ts` (campos `transiciones`, `cierre`, `cerrado`)

**Acceptance Criteria:**
- [ ] Diálogo con `Modal` de `@deepseek-ai/dsh-client-ui-primitives` como `Pregunta.tsx:165-225`: Escape y clic en el velo **cancelan** (no escriben); desmontar no contesta nada.
- [ ] **Empezar:** título «¿Pasar IXCODE-12 a EN CURSO?», desplegable con las transiciones (la `propuesta` elegida por omisión), botones «Pasar y empezar» (→ `empezar` con `transicion`) y «Empezar sin tocar Jira» (→ `empezar` sin `transicion`), y «Cancelar».
- [ ] **Cerrar:** `textarea` con el `comentario` del `cierre`, EDITABLE; desplegable de transiciones de `para: "cerrar"`; botones «Comentar y pasar a <destino>», «Solo comentar» y «Cancelar». Con un `error` de `cerrar`, el diálogo sigue abierto con el motivo y el texto EDITADO intacto (test).
- [ ] Mientras una acción está en vuelo, los botones se deshabilitan (no hay doble envío).
- [ ] Tests: solo los botones que escriben mandan `empezar`/`cerrar` con los campos exactos; Escape/velo no mandan nada.

**Verify:** `FORCE_COLOR=0 npx vitest run apps/web/src/` y `npm run build:web` → verde.

**Steps:** tests, fallar, implementar, verde + typecheck + build, commit `feat(web): las tarjetas de empezar y cerrar en Jira (IXCODE-11)`.

```json:metadata
{"files": ["apps/web/src/componentes/TarjetaDeJira.tsx", "apps/web/src/componentes/TarjetaDeJira.module.css", "apps/web/src/componentes/TarjetaDeJira.test.tsx", "apps/web/src/componentes/PanelDelProyecto.tsx", "apps/web/src/App.tsx", "apps/web/src/gestorDelCable.ts", "apps/web/src/store.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run apps/web/src/ && npm run build:web", "acceptanceCriteria": ["Escape/velo cancelan", "Empezar con y sin transición", "Cerrar editable y conserva el texto al fallar", "sin doble envío"], "modelTier": "standard"}
```

---

### Task 12: Documentación

**Goal:** `CLAUDE.md` y `docs/DECISIONES.md` dicen las reglas nuevas.

**Files:**
- Modify: `CLAUDE.md` (sección «La consola web»: el panel del proyecto; sección «Los conectores MCP»: el gestor de tareas y el arreglo del refresh; y la frase «Todavía no llegan a ningún agente» sigue siendo cierta)
- Modify: `docs/DECISIONES.md` (la medida de las 32 tools con `readOnlyHint`, el correo del asignado que no cruza, y por qué escribe el harness y no el agente)

**Acceptance Criteria:**
- [ ] `src/documentacion.test.ts` verde (en `CLAUDE.md` ni fechas, ni recuentos, ni porcentajes, ni duraciones sueltas: una duración va con el nombre de su constante).
- [ ] Suite completo verde: `FORCE_COLOR=0 npx vitest run --maxWorkers=2`.

**Verify:** `FORCE_COLOR=0 npx vitest run --maxWorkers=2 && npm run typecheck` → verde.

**Steps:** escribir, correr `documentacion.test.ts`, suite entero, commit `docs(IXCODE-11): el panel del proyecto y el gestor de tareas`.

```json:metadata
{"files": ["CLAUDE.md", "docs/DECISIONES.md"], "verifyCommand": "FORCE_COLOR=0 npx vitest run --maxWorkers=2 && npm run typecheck", "acceptanceCriteria": ["documentacion.test.ts verde", "suite entero verde"], "modelTier": "mechanical"}
```
