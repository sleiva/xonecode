# Sesión remota: el lado de xonecode — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la consola web de xonecode pueda encender una «Sesión remota» (URL + QR) y que cada móvil conectado por el puente de `xonecode-server` se comporte como una pestaña más del cable —ver, escribir, aprobar— detrás de un interruptor apagado por omisión.

**Architecture:** Un puerto `PuenteRemotoPort` (con su doble) abstrae el WebSocket y el cifrado; la implementación real carga `@xone/xonecode-remoto` con `import()` dinámico solo con el interruptor encendido. `web/servidor/puenteRemoto.ts` registra **un sumidero por móvil** con el mismo enganche que una pestaña SSE (`engancharCliente`/`soltarCliente`, extraídos de la ruta `/eventos`), filtra la salida y la entrada con las listas blancas puras de `core/remoto.ts`, y despacha lo que entra por las MISMAS funciones que `POST /accion`.

**Tech Stack:** TypeScript (host Node 22 + cliente React/Vite), vitest, `qrcode` en `apps/web`.

**Spec:** `docs/superpowers/specs/2026-10-09-sesion-remota-xonecode-design.md` (sistema: `/Users/projects/xonecode-server/docs/specs/2026-10-09-sesion-remota-design.md`).

**Depende de:** el plan 1 (`/Users/projects/xonecode-server/docs/plans/2026-10-09-sesion-remota-servidor.md`) solo para la Task 6 (adaptador real) y la Task 8 (de punta a punta). Las Tasks 1–5 y 7 no lo necesitan: usan el doble del puerto.

## Global Constraints

- **`npm test` no puede necesitar red, clave, simulador ni el paquete `@xone/xonecode-remoto`** (invariante de `CLAUDE.md`). Todo test usa `PuenteRemotoEnMemoria`.
- **Nada nuevo en `package.json` de la raíz** mientras sea experimental: el paquete se carga con `import()` dinámico de un nombre en una variable `string` (que TypeScript no resuelve), en UN fichero: `src/agent/remoto/puenteWebSocket.ts`. `apps/web` sí gana la dependencia `qrcode`.
- **Interruptor**: `settings.remoto.habilitado === true` o `XONECODE_REMOTO=1`. Apagado ⇒ no se emite ningún mensaje `remoto`, no se pinta el botón, no se llama al cargador del paquete, no se abre ningún socket.
- `settings.remoto.servidor`: `wss://` a cualquier host, o `ws://` solo a loopback (`127.0.0.1`, `localhost`, `[::1]`). Por omisión `wss://remoto.xone.dev/ws`.
- `core/` sigue sin importar nada de `web/`, `agent/`, langchain, ni del paquete (`src/core/imports.test.ts`).
- Ningún color literal en `.module.css` del cliente (lo vigila `Barra.test.tsx`): solo variables existentes (`--xonecode-azul`, `--dsw-alias-*`…).
- Una imagen QR se pinta con `<img src="data:image/svg+xml;…">`, nunca con marcado inyectado.
- Lista blanca de salida: `acto`, `sustitucion`, `reemision`, `aprobacion`, `turno`, `pregunta` **sin** `decision`, y `alta` **transformada** en `remoto.estado {proyecto?, sesion?}`. Todo lo demás se descarta.
- Lista blanca de entrada: `prosa {texto, detener?: true}` (sin `adjuntos`), `decision {decisiones: Record<id, "approve"|"reject">}`, `respuesta {texto}` (sin `seleccion`), `cancelar`.
- Un mensaje rechazado del móvil se anota con `informar` (el log del servidor). Aclaración frente al spec: el registro de fallos de xonecode es por proyecto y por turno, y no tiene sitio para esto.
- Textos visibles en español. Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; stage por rutas explícitas (otra sesión trabaja en `main`).
- Antes de cada commit: `npm run typecheck` y los tests del área tocada en verde (`FORCE_COLOR=0 npx vitest run <ruta> --maxWorkers=2`).

**User decisions (already made):**
- «en las dos direcciones, que pueda aprobar desde el móvil»
- «la url es unica con el token y desde donde abras la url tendras acceso a la session actual de tu xonecode local»
- «un servidor público de XOne, con el secreto en el fragmento»
- «la (a), con QR y que siga a la sesión en foco» (URL nueva en cada encendido)
- «(a) sin push en la primera versión»
- «sí, el enfoque 1» (el puente es un cliente más del cable)
- Interruptor para seguir publicando releases: «ok» (apagado por omisión, `import()` dinámico, sin dependencia nueva)

---

## Estructura de ficheros

| Fichero | Qué |
|---|---|
| `src/core/settings.ts` (mod.) | `AjustesDeRemoto`, validación, `remotoEnVigor`, `SERVIDOR_REMOTO_POR_OMISION` |
| `src/core/remoto.ts` (nuevo) | Listas blancas puras: `filtrarSalida`, `validarEntradaDelMovil` |
| `src/core/ports.ts` (mod.) | `PuenteRemotoPort`, `CanalRemoto`, `EscuchasDelPuente`, `EstadoDelPuente`, doble `PuenteRemotoEnMemoria` |
| `src/web/servidor/puenteRemoto.ts` (nuevo) | `crearSesionRemota`: un sumidero por móvil, filtros, despacho, estado |
| `src/web/servidor/arranque.ts` (mod.) | Extraer `engancharCliente`/`soltarCliente`/`recibirEnLaConsola`/`cancelarTurno`; cablear `remoto` en `/accion` y en la ráfaga; apagarla al cerrar |
| `src/web/servidor/transporte.ts` (mod.) | Tipos del cable: `{clase:"remoto"}` en las dos direcciones |
| `src/agent/remoto/puenteWebSocket.ts` (nuevo) | Adaptador real: `cargarModuloRemoto` + `crearPuenteWebSocket` |
| `apps/web/src/tipos.ts`, `apps/web/src/store.ts` (mod.) | El mensaje `remoto` en el cliente |
| `apps/web/src/componentes/SesionRemota.tsx` + `.module.css` (nuevos) | Botón, diálogo, QR |
| `apps/web/src/App.tsx` (mod.) | Montar `SesionRemota` junto a la barra de estado |

---

### Task 1: El interruptor en `settings.json`

**Goal:** `settings.remoto` se valida y `remotoEnVigor` decide si la sesión remota existe y a qué servidor apunta.

**Files:**
- Modify: `src/core/settings.ts`
- Test: `src/core/settings.remoto.test.ts`

**Acceptance Criteria:**
- [ ] `validarSettings({entornos: [], remoto: {habilitado: true, servidor: "ws://127.0.0.1:8787/ws"}})` conserva `remoto` tal cual.
- [ ] Un `servidor` `ws://` a un host que no es loopback, un `http://` o un no-texto se descarta con un aviso; un `habilitado` que no es booleano se descarta.
- [ ] `remotoEnVigor(undefined, {})` = `{habilitado: false, servidor: "wss://remoto.xone.dev/ws"}`; `remotoEnVigor(undefined, {XONECODE_REMOTO: "1"})` tiene `habilitado: true`; `XONECODE_REMOTO: "0"` no enciende.

**Verify:** `FORCE_COLOR=0 npx vitest run src/core/settings --maxWorkers=2` → todos pasan.

**Steps:**

- [ ] **Step 1: Escribir los tests que fallan**

`src/core/settings.remoto.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { SERVIDOR_REMOTO_POR_OMISION, remotoEnVigor, validarSettings } from "./settings.js";

describe("el interruptor de la sesión remota", () => {
  it("conserva un remoto válido", () => {
    const { settings } = validarSettings({ entornos: [], remoto: { habilitado: true, servidor: "ws://127.0.0.1:8787/ws" } });
    expect(settings.remoto).toEqual({ habilitado: true, servidor: "ws://127.0.0.1:8787/ws" });
  });

  it("descarta un servidor inaceptable y un habilitado que no es booleano", () => {
    for (const servidor of ["ws://remoto.xone.dev/ws", "http://127.0.0.1:8787", 42]) {
      const { settings, avisos } = validarSettings({ entornos: [], remoto: { habilitado: true, servidor } });
      expect(settings.remoto).toEqual({ habilitado: true });
      expect(avisos.length).toBeGreaterThan(0);
    }
    expect(validarSettings({ entornos: [], remoto: { habilitado: "sí" } }).settings.remoto).toBeUndefined();
  });

  it("apagado por omisión, y XONECODE_REMOTO=1 lo enciende para un arranque", () => {
    expect(remotoEnVigor(undefined, {})).toEqual({ habilitado: false, servidor: SERVIDOR_REMOTO_POR_OMISION });
    expect(SERVIDOR_REMOTO_POR_OMISION).toBe("wss://remoto.xone.dev/ws");
    expect(remotoEnVigor(undefined, { XONECODE_REMOTO: "1" }).habilitado).toBe(true);
    expect(remotoEnVigor(undefined, { XONECODE_REMOTO: "0" }).habilitado).toBe(false);
    expect(remotoEnVigor({ habilitado: true, servidor: "ws://localhost:9/ws" }, {})).toEqual({ habilitado: true, servidor: "ws://localhost:9/ws" });
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `FORCE_COLOR=0 npx vitest run src/core/settings.remoto.test.ts`
Expected: FAIL, «remotoEnVigor is not exported».

- [ ] **Step 3: Implementar**

En `src/core/settings.ts`, junto a los demás tipos:
```ts
/**
 * La sesión remota (móvil → esta consola por el puente de `xonecode-server`). EXPERIMENTAL y
 * apagada por omisión: ausente o `habilitado` distinto de `true` = la función no existe. Así se
 * siguen publicando releases mientras madura (`docs/superpowers/specs/2026-10-09-sesion-remota-xonecode-design.md`).
 */
export interface AjustesDeRemoto {
  habilitado?: boolean;
  /** `wss://` a cualquier host, o `ws://` solo a loopback. Ausente = `SERVIDOR_REMOTO_POR_OMISION`. */
  servidor?: string;
}

export const SERVIDOR_REMOTO_POR_OMISION = "wss://remoto.xone.dev/ws";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

function servidorRemotoAceptable(candidato: string): boolean {
  let url: URL;
  try {
    url = new URL(candidato);
  } catch {
    return false;
  }
  if (url.protocol === "wss:") return true;
  return url.protocol === "ws:" && LOOPBACK.has(url.hostname);
}

/** Lo que manda: `XONECODE_REMOTO=1` enciende para un arranque; si no, el `settings.json`. */
export function remotoEnVigor(
  ajustes: AjustesDeRemoto | undefined,
  entorno: Record<string, string | undefined>
): { habilitado: boolean; servidor: string } {
  return {
    habilitado: entorno.XONECODE_REMOTO === "1" || ajustes?.habilitado === true,
    servidor: ajustes?.servidor ?? SERVIDOR_REMOTO_POR_OMISION,
  };
}
```

En `interface Settings`, añadir:
```ts
  /** Ver `AjustesDeRemoto`. Ausente = la sesión remota no existe. */
  remoto?: AjustesDeRemoto;
```

Añadir el validador junto a `validarConcurrenciaDeTareas`:
```ts
function validarRemoto(candidato: unknown, avisos: Aviso[]): AjustesDeRemoto | undefined {
  if (typeof candidato !== "object" || candidato === null || Array.isArray(candidato)) return undefined;
  const o = candidato as Record<string, unknown>;
  if (typeof o.habilitado !== "boolean") return undefined;
  if (o.servidor === undefined) return { habilitado: o.habilitado };
  if (typeof o.servidor === "string" && servidorRemotoAceptable(o.servidor)) return { habilitado: o.habilitado, servidor: o.servidor };
  avisos.push({ grave: false, texto: "settings.json: remoto.servidor tiene que ser wss://…, o ws:// a loopback; se ignora" });
  return { habilitado: o.habilitado };
}
```
(Si el tipo `Aviso` del fichero tiene otra forma, usar la misma que ya usa `validarEntorno` para sus avisos.)

Y en `validarSettings`, donde se construye el resultado (junto a `concurrenciaDeTareas` y `depurar`):
```ts
  const remoto = validarRemoto(objeto.remoto, avisos);
```
```ts
      ...(remoto === undefined ? {} : { remoto }),
```

- [ ] **Step 4: Ver que pasan**

Run: `FORCE_COLOR=0 npx vitest run src/core/settings --maxWorkers=2 && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/settings.ts src/core/settings.remoto.test.ts
git commit -m "feat(remoto): el interruptor de la sesión remota en settings.json, apagado por omisión

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["src/core/settings.ts", "src/core/settings.remoto.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/core/settings --maxWorkers=2", "acceptanceCriteria": ["remoto válido se conserva", "servidor inaceptable se descarta con aviso; habilitado no booleano se descarta", "remotoEnVigor apagado por omisión, XONECODE_REMOTO=1 enciende, =0 no"], "modelTier": "mechanical"}
```

---

### Task 2: Las listas blancas (`core/remoto.ts`)

**Goal:** Dos funciones puras que deciden qué sale hacia el móvil (y en qué forma) y qué entra desde él.

**Files:**
- Create: `src/core/remoto.ts`
- Test: `src/core/remoto.test.ts`

**Acceptance Criteria:**
- [ ] `filtrarSalida` deja pasar `acto`, `sustitucion`, `reemision`, `aprobacion` y `turno` intactos; `pregunta` sin `decision` como `{clase, texto}`; `pregunta` con `decision` → `undefined`.
- [ ] `filtrarSalida(alta)` devuelve `{clase: "remoto.estado", proyecto, sesion}` con el NOMBRE del `proyectoActivo` y el TÍTULO de la `sesionActiva`, y sin ningún otro campo del alta.
- [ ] `filtrarSalida` devuelve `undefined` para `secreto`, `fichero`, `arbol`, `modelos`, `workspace`, `remoto`, `bienvenida` y cualquier clase desconocida.
- [ ] `validarEntradaDelMovil` acepta las cuatro formas permitidas, devuelve objetos nuevos solo con campos conocidos y rechaza `sesion`, `secreto`, `prosa` con `adjuntos`, `respuesta` con `seleccion` y `decision` con un valor distinto de `approve`/`reject`.

**Verify:** `FORCE_COLOR=0 npx vitest run src/core/remoto.test.ts src/core/imports.test.ts` → todos pasan.

**Steps:**

- [ ] **Step 1: Escribir los tests que fallan**

`src/core/remoto.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { filtrarSalida, validarEntradaDelMovil } from "./remoto.js";

describe("lo que sale hacia el móvil", () => {
  it("el chat, la aprobación y el turno pasan tal cual", () => {
    for (const m of [
      { clase: "acto", acto: { tipo: "usuario", texto: "hola" } },
      { clase: "sustitucion", acto: { tipo: "asistente", texto: "h" } },
      { clase: "reemision", actos: [] },
      { clase: "aprobacion", pendientes: [], ficheros: {}, diffs: {} },
      { clase: "turno", activo: true, detenible: true },
    ]) {
      expect(filtrarSalida(m)).toEqual(m);
    }
  });

  it("una pregunta de texto sale; una DECISIÓN (la subida con casillas) no", () => {
    expect(filtrarSalida({ clase: "pregunta", texto: "¿Seguro?" })).toEqual({ clase: "pregunta", texto: "¿Seguro?" });
    expect(filtrarSalida({ clase: "pregunta", texto: "Subir", decision: { lineas: [] } })).toBeUndefined();
  });

  it("el alta sale TRANSFORMADA en remoto.estado, sin entornos ni rutas", () => {
    const alta = {
      clase: "alta",
      pasos: [],
      entornos: [{ id: "w", nombre: "W", url: "https://x" }],
      proyectoActivo: "p1",
      sesionActiva: "s2",
      proyectos: [{ id: "p1", nombre: "AppDemo", sesiones: [{ id: "s1", titulo: "Vieja" }, { id: "s2", titulo: "Hola" }] }],
    };
    expect(filtrarSalida(alta)).toEqual({ clase: "remoto.estado", proyecto: "AppDemo", sesion: "Hola" });
    expect(filtrarSalida({ clase: "alta", proyectos: [] })).toEqual({ clase: "remoto.estado" });
  });

  it("lo demás no sale", () => {
    for (const clase of ["secreto", "fichero", "arbol", "modelos", "workspace", "remoto", "bienvenida", "inventada"]) {
      expect(filtrarSalida({ clase })).toBeUndefined();
    }
    expect(filtrarSalida("texto")).toBeUndefined();
  });
});

describe("lo que entra desde el móvil", () => {
  it("las cuatro formas permitidas, y solo sus campos", () => {
    expect(validarEntradaDelMovil({ clase: "prosa", texto: "hola", raiz: "/etc" })).toEqual({ clase: "prosa", texto: "hola" });
    expect(validarEntradaDelMovil({ clase: "prosa", texto: "para", detener: true })).toEqual({ clase: "prosa", texto: "para", detener: true });
    expect(validarEntradaDelMovil({ clase: "decision", decisiones: { a: "approve", b: "reject" } })).toEqual({ clase: "decision", decisiones: { a: "approve", b: "reject" } });
    expect(validarEntradaDelMovil({ clase: "respuesta", texto: "s" })).toEqual({ clase: "respuesta", texto: "s" });
    expect(validarEntradaDelMovil({ clase: "cancelar" })).toEqual({ clase: "cancelar" });
  });

  it("todo lo demás se rechaza", () => {
    for (const m of [
      { clase: "sesion", proyecto: "p" },
      { clase: "secreto", texto: "sk" },
      { clase: "prosa", texto: "x", adjuntos: ["a"] },
      { clase: "respuesta", texto: "s", seleccion: ["a"] },
      { clase: "decision", decisiones: { a: "s" } },
      { clase: "prosa", texto: 1 },
      null,
    ]) {
      expect(validarEntradaDelMovil(m)).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `FORCE_COLOR=0 npx vitest run src/core/remoto.test.ts`
Expected: FAIL, «Cannot find module './remoto.js'».

- [ ] **Step 3: Implementar**

`src/core/remoto.ts`:
```ts
/**
 * Qué cruza el puente de la sesión remota, en las dos direcciones. Es la FRONTERA de seguridad
 * del lado de xonecode: lo que no está aquí no sale de la máquina ni entra en la consola, aunque
 * el móvil lo pida. Puro y sin dependencias (`core/`); el paquete `@xone/xonecode-remoto` tiene
 * su propia validación para la web, pero quien decide aquí es xonecode.
 */

export type EntradaDelMovil =
  | { clase: "prosa"; texto: string; detener?: true }
  | { clase: "decision"; decisiones: Record<string, "approve" | "reject"> }
  | { clase: "respuesta"; texto: string }
  | { clase: "cancelar" };

const objeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const PASAN_TAL_CUAL = new Set(["acto", "sustitucion", "reemision", "aprobacion", "turno"]);

/** Lo que se manda al móvil, ya en su forma de salida; `undefined` = no sale. */
export function filtrarSalida(mensaje: unknown): unknown | undefined {
  if (!objeto(mensaje) || typeof mensaje.clase !== "string") return undefined;
  if (PASAN_TAL_CUAL.has(mensaje.clase)) return mensaje;
  if (mensaje.clase === "pregunta") {
    // Con `decision` es la subida a CloudStudio con casillas: se queda en el escritorio (v1).
    return mensaje.decision === undefined && typeof mensaje.texto === "string" ? { clase: "pregunta", texto: mensaje.texto } : undefined;
  }
  if (mensaje.clase === "alta") return estadoDesdeAlta(mensaje);
  return undefined;
}

/** Del alta solo cruzan el NOMBRE del proyecto en foco y el TÍTULO de su sesión: ni entornos, ni rutas, ni workspace. */
function estadoDesdeAlta(alta: Record<string, unknown>): { clase: "remoto.estado"; proyecto?: string; sesion?: string } {
  const proyectos = Array.isArray(alta.proyectos) ? alta.proyectos.filter(objeto) : [];
  const proyecto = proyectos.find((p) => p.id === alta.proyectoActivo);
  const sesiones = proyecto !== undefined && Array.isArray(proyecto.sesiones) ? proyecto.sesiones.filter(objeto) : [];
  const sesion = sesiones.find((s) => s.id === alta.sesionActiva);
  return {
    clase: "remoto.estado",
    ...(typeof proyecto?.nombre === "string" ? { proyecto: proyecto.nombre } : {}),
    ...(typeof sesion?.titulo === "string" && sesion.titulo !== "" ? { sesion: sesion.titulo } : {}),
  };
}

export function validarEntradaDelMovil(m: unknown): EntradaDelMovil | undefined {
  if (!objeto(m)) return undefined;
  switch (m.clase) {
    case "prosa":
      if (typeof m.texto !== "string" || m.adjuntos !== undefined) return undefined;
      if (m.detener === undefined) return { clase: "prosa", texto: m.texto };
      return m.detener === true ? { clase: "prosa", texto: m.texto, detener: true } : undefined;
    case "decision": {
      if (!objeto(m.decisiones)) return undefined;
      const decisiones: Record<string, "approve" | "reject"> = {};
      for (const [id, valor] of Object.entries(m.decisiones)) {
        if (valor !== "approve" && valor !== "reject") return undefined;
        decisiones[id] = valor;
      }
      return { clase: "decision", decisiones };
    }
    case "respuesta":
      return typeof m.texto === "string" && m.seleccion === undefined ? { clase: "respuesta", texto: m.texto } : undefined;
    case "cancelar":
      return { clase: "cancelar" };
    default:
      return undefined;
  }
}
```

- [ ] **Step 4: Ver que pasan**

Run: `FORCE_COLOR=0 npx vitest run src/core/remoto.test.ts src/core/imports.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/remoto.ts src/core/remoto.test.ts
git commit -m "feat(remoto): listas blancas de lo que sale hacia el móvil y lo que entra

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["src/core/remoto.ts", "src/core/remoto.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/core/remoto.test.ts src/core/imports.test.ts", "acceptanceCriteria": ["chat, aprobación y turno salen intactos; pregunta sin decision sale; con decision no", "alta → remoto.estado con nombre y título, sin más campos", "secreto/fichero/arbol/modelos/workspace/remoto/bienvenida no salen", "entrada: cuatro formas con solo sus campos; el resto se rechaza"], "modelTier": "mechanical"}
```

---

### Task 3: El puerto, su doble y `crearSesionRemota`

**Goal:** `PuenteRemotoPort` con su doble en memoria, y la lógica de la sesión remota (un sumidero por móvil, filtros, despacho y estado) probada solo con el doble.

**Files:**
- Modify: `src/core/ports.ts`
- Create: `src/web/servidor/puenteRemoto.ts`
- Test: `src/web/servidor/puenteRemoto.test.ts`

**Acceptance Criteria:**
- [ ] `encender()` llama a `puerto.abrir(servidor)` y, cuando el puerto avisa `abierta`, el estado es `{estado: "activa", url, moviles: 0}`.
- [ ] Una `presencia` con un id nuevo llama a `engancharCliente` con un sumidero propio de ese móvil; lo que ese sumidero recibe sale por `canal.enviar(id, …)` SOLO si pasa `filtrarSalida`, y transformado (un `alta` sale como `remoto.estado`).
- [ ] Un id que desaparece de la `presencia` se suelta con `soltarCliente` y deja de recibir.
- [ ] Un mensaje de un móvil conocido que pasa `validarEntradaDelMovil` llega a `despachar`; uno que no pasa llega a `informar` y NO a `despachar`; uno de un id desconocido se ignora.
- [ ] `apagar()` suelta todos los sumideros, cierra el canal y deja `{estado: "apagada"}`; `revocar()` es apagar + encender (canal nuevo).
- [ ] Si `puerto.abrir` lanza, el estado es `{estado: "error", motivo}`.

**Verify:** `FORCE_COLOR=0 npx vitest run src/web/servidor/puenteRemoto.test.ts` → todos pasan.

**Steps:**

- [ ] **Step 1: El puerto y el doble**

Añadir a `src/core/ports.ts`:
```ts
/**
 * El puente de la sesión remota: un WebSocket SALIENTE y cifrado hacia `xonecode-server`.
 * Mensajes en CLARO por esta interfaz: el cifrado vive en la implementación real
 * (`agent/remoto/puenteWebSocket.ts`), que es la única que carga `@xone/xonecode-remoto`.
 */
export type EstadoDelPuente =
  | { estado: "abierta"; url: string }
  | { estado: "reconectando" }
  | { estado: "cerrada"; motivo?: string };

export interface EscuchasDelPuente {
  alEstado(estado: EstadoDelPuente): void;
  alPresencia(moviles: readonly string[]): void;
  alMensaje(de: string, mensaje: unknown): void;
}

export interface CanalRemoto {
  /** `para` ausente = a todos los móviles. */
  enviar(para: string | undefined, mensaje: unknown): Promise<void>;
  cerrar(): void;
}

export interface PuenteRemotoPort {
  abrir(servidor: string, escuchas: EscuchasDelPuente): Promise<CanalRemoto>;
}

/** El doble: deja al test hacer de servidor y de móviles, y apunta lo enviado. */
export class PuenteRemotoEnMemoria implements PuenteRemotoPort {
  readonly [ES_DOBLE] = true;
  readonly aperturas: string[] = [];
  readonly enviados: { para: string | undefined; mensaje: unknown }[] = [];
  cerrados = 0;
  private escuchas: EscuchasDelPuente | undefined;

  async abrir(servidor: string, escuchas: EscuchasDelPuente): Promise<CanalRemoto> {
    this.aperturas.push(servidor);
    this.escuchas = escuchas;
    return {
      enviar: async (para, mensaje) => void this.enviados.push({ para, mensaje }),
      cerrar: () => void (this.cerrados += 1),
    };
  }

  /** Lo que haría el servidor real. */
  abierta(url = "https://remoto.example/r/SALA#SECRETO"): void {
    this.escuchas?.alEstado({ estado: "abierta", url });
  }
  presencia(...moviles: string[]): void {
    this.escuchas?.alPresencia(moviles);
  }
  delMovil(de: string, mensaje: unknown): void {
    this.escuchas?.alMensaje(de, mensaje);
  }
  cerrada(motivo?: string): void {
    this.escuchas?.alEstado(motivo === undefined ? { estado: "cerrada" } : { estado: "cerrada", motivo });
  }
}
```
(`ES_DOBLE` ya existe en `ports.ts`; si los demás dobles lo declaran de otra forma, copiar esa forma.)

- [ ] **Step 2: Escribir los tests que fallan**

`src/web/servidor/puenteRemoto.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { PuenteRemotoEnMemoria } from "../../core/ports.js";
import { crearSesionRemota, type EstadoDeSesionRemota } from "./puenteRemoto.js";
import type { Sumidero } from "./transporte.js";

function montar() {
  const puerto = new PuenteRemotoEnMemoria();
  const enganchados = new Set<Sumidero>();
  const despachados: unknown[] = [];
  const informados: string[] = [];
  const estados: EstadoDeSesionRemota[] = [];
  const sesion = crearSesionRemota({
    puerto: async () => puerto,
    servidor: () => "ws://127.0.0.1:8787/ws",
    engancharCliente: (s) => void enganchados.add(s),
    soltarCliente: (s) => void enganchados.delete(s),
    despachar: (m) => void despachados.push(m),
    informar: (t) => void informados.push(t),
    alCambiar: (e) => void estados.push(e),
  });
  return { puerto, enganchados, despachados, informados, estados, sesion };
}

describe("la sesión remota", () => {
  it("encender abre el puente y, al abrirse, está activa con su URL", async () => {
    const p = montar();
    await p.sesion.encender();
    expect(p.puerto.aperturas).toEqual(["ws://127.0.0.1:8787/ws"]);
    p.puerto.abierta("https://r/r/S#K");
    expect(p.sesion.estado()).toEqual({ estado: "activa", url: "https://r/r/S#K", moviles: 0 });
  });

  it("cada móvil es un sumidero propio que solo deja salir lo permitido", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta();
    p.puerto.presencia("m1");
    expect(p.enganchados.size).toBe(1);
    expect(p.sesion.estado()).toMatchObject({ estado: "activa", moviles: 1 });
    const [sumidero] = [...p.enganchados];
    sumidero!({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } } as never);
    sumidero!({ clase: "secreto", texto: "clave" } as never);
    sumidero!({ clase: "alta", proyectoActivo: "p", sesionActiva: "s", proyectos: [{ id: "p", nombre: "AppDemo", sesiones: [{ id: "s", titulo: "Hola" }] }] } as never);
    await Promise.resolve();
    expect(p.puerto.enviados).toEqual([
      { para: "m1", mensaje: { clase: "acto", acto: { tipo: "usuario", texto: "hola" } } },
      { para: "m1", mensaje: { clase: "remoto.estado", proyecto: "AppDemo", sesion: "Hola" } },
    ]);
  });

  it("un móvil que se va se suelta", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta();
    p.puerto.presencia("m1", "m2");
    p.puerto.presencia("m2");
    expect(p.enganchados.size).toBe(1);
    expect(p.sesion.estado()).toMatchObject({ moviles: 1 });
  });

  it("lo que entra: lo permitido se despacha, lo demás se informa, y un desconocido se ignora", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta();
    p.puerto.presencia("m1");
    p.puerto.delMovil("m1", { clase: "prosa", texto: "hola" });
    p.puerto.delMovil("m1", { clase: "sesion", proyecto: "otro" });
    p.puerto.delMovil("intruso", { clase: "cancelar" });
    expect(p.despachados).toEqual([{ clase: "prosa", texto: "hola" }]);
    expect(p.informados).toHaveLength(1);
    expect(p.informados[0]).toMatch(/sesion/);
  });

  it("apagar suelta y cierra; revocar abre un canal nuevo", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta();
    p.puerto.presencia("m1");
    await p.sesion.revocar();
    expect(p.enganchados.size).toBe(0);
    expect(p.puerto.cerrados).toBe(1);
    expect(p.puerto.aperturas).toHaveLength(2);
    p.sesion.apagar();
    expect(p.puerto.cerrados).toBe(2);
    expect(p.sesion.estado()).toEqual({ estado: "apagada" });
  });

  it("sin paquete o con un fallo al abrir, el estado lo dice", async () => {
    const sinPaquete = crearSesionRemota({
      puerto: async () => undefined,
      servidor: () => "wss://x/ws",
      engancharCliente: () => {},
      soltarCliente: () => {},
      despachar: () => {},
      informar: () => {},
      alCambiar: () => {},
    });
    await sinPaquete.encender();
    expect(sinPaquete.estado()).toEqual({ estado: "error", motivo: "la sesión remota no está disponible en esta instalación" });

    const p = montar();
    p.puerto.abrir = async () => {
      throw new Error("ECONNREFUSED");
    };
    await p.sesion.encender();
    expect(p.sesion.estado()).toEqual({ estado: "error", motivo: "ECONNREFUSED" });
  });
});
```

- [ ] **Step 3: Ver que fallan**

Run: `FORCE_COLOR=0 npx vitest run src/web/servidor/puenteRemoto.test.ts`
Expected: FAIL, «Cannot find module './puenteRemoto.js'».

- [ ] **Step 4: Implementar**

`src/web/servidor/puenteRemoto.ts`:
```ts
/**
 * La sesión remota: cada MÓVIL conectado por el puente es un sumidero más del cable, enganchado
 * por la MISMA puerta que una pestaña SSE (`engancharCliente`/`soltarCliente`). Así recibe la
 * misma ráfaga al entrar, sigue a la consola en foco cuando se muda y cuenta como «hay alguien
 * delante» igual que una pestaña. Lo que sale pasa `filtrarSalida`; lo que entra,
 * `validarEntradaDelMovil`, y se despacha por las mismas funciones que `POST /accion`.
 */
import type { CanalRemoto, PuenteRemotoPort } from "../../core/ports.js";
import { filtrarSalida, validarEntradaDelMovil, type EntradaDelMovil } from "../../core/remoto.js";
import type { Sumidero } from "./transporte.js";

export type EstadoDeSesionRemota =
  | { estado: "apagada" }
  | { estado: "abriendo" }
  | { estado: "activa"; url: string; moviles: number }
  | { estado: "reconectando"; url: string; moviles: number }
  | { estado: "error"; motivo: string };

export interface OpcionesDeSesionRemota {
  /** `undefined` = el paquete no está instalado. Solo se llama al encender. */
  puerto: () => Promise<PuenteRemotoPort | undefined>;
  servidor: () => string;
  engancharCliente(sumidero: Sumidero): void;
  soltarCliente(sumidero: Sumidero): void;
  despachar(mensaje: EntradaDelMovil): void;
  informar(texto: string): void;
  alCambiar(estado: EstadoDeSesionRemota): void;
}

export interface SesionRemota {
  encender(): Promise<void>;
  revocar(): Promise<void>;
  apagar(): void;
  estado(): EstadoDeSesionRemota;
}

export const SIN_PAQUETE = "la sesión remota no está disponible en esta instalación";

export function crearSesionRemota(o: OpcionesDeSesionRemota): SesionRemota {
  let estado: EstadoDeSesionRemota = { estado: "apagada" };
  let canal: CanalRemoto | undefined;
  let url: string | undefined;
  let reconectando = false;
  const moviles = new Map<string, Sumidero>();

  const poner = (e: EstadoDeSesionRemota) => {
    estado = e;
    o.alCambiar(e);
  };
  const ponerActiva = () => {
    if (url !== undefined) poner({ estado: reconectando ? "reconectando" : "activa", url, moviles: moviles.size });
  };
  const soltarTodos = () => {
    for (const s of moviles.values()) o.soltarCliente(s);
    moviles.clear();
  };

  const apagar = () => {
    soltarTodos();
    canal?.cerrar();
    canal = undefined;
    url = undefined;
    reconectando = false;
    poner({ estado: "apagada" });
  };

  const encender = async () => {
    if (canal !== undefined) return;
    poner({ estado: "abriendo" });
    try {
      const puerto = await o.puerto();
      if (puerto === undefined) {
        poner({ estado: "error", motivo: SIN_PAQUETE });
        return;
      }
      canal = await puerto.abrir(o.servidor(), {
        alEstado: (e) => {
          if (e.estado === "abierta") {
            url = e.url;
            reconectando = false;
            ponerActiva();
          } else if (e.estado === "reconectando") {
            reconectando = true;
            ponerActiva();
          } else {
            soltarTodos();
            canal = undefined;
            url = undefined;
            poner(e.motivo === undefined ? { estado: "apagada" } : { estado: "error", motivo: e.motivo });
          }
        },
        alPresencia: (ids) => {
          for (const [id, s] of moviles) {
            if (!ids.includes(id)) {
              moviles.delete(id);
              o.soltarCliente(s);
            }
          }
          for (const id of ids) {
            if (moviles.has(id)) continue;
            const sumidero: Sumidero = (mensaje) => {
              const salida = filtrarSalida(mensaje);
              if (salida !== undefined) void canal?.enviar(id, salida).catch(() => {});
            };
            moviles.set(id, sumidero);
            o.engancharCliente(sumidero);
          }
          ponerActiva();
        },
        alMensaje: (de, mensaje) => {
          if (!moviles.has(de)) return;
          const entrada = validarEntradaDelMovil(mensaje);
          if (entrada === undefined) {
            const clase = typeof mensaje === "object" && mensaje !== null ? String((mensaje as { clase?: unknown }).clase) : typeof mensaje;
            o.informar(`sesión remota: se rechazó un mensaje del móvil (clase ${clase})`);
            return;
          }
          o.despachar(entrada);
        },
      });
    } catch (error) {
      canal = undefined;
      poner({ estado: "error", motivo: error instanceof Error ? error.message : String(error) });
    }
  };

  return {
    encender,
    apagar,
    async revocar() {
      apagar();
      await encender();
    },
    estado: () => estado,
  };
}
```

Nota: el test usa `puerto: async () => puerto`, así que el campo `puerto` de las opciones es una función. Ajustar el `montar()` del test si hiciera falta (ya está escrito así).

- [ ] **Step 5: Ver que pasan**

Run: `FORCE_COLOR=0 npx vitest run src/web/servidor/puenteRemoto.test.ts src/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/ports.ts src/web/servidor/puenteRemoto.ts src/web/servidor/puenteRemoto.test.ts
git commit -m "feat(remoto): el puerto del puente, su doble y la sesión remota (un sumidero por móvil)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["src/core/ports.ts", "src/web/servidor/puenteRemoto.ts", "src/web/servidor/puenteRemoto.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/web/servidor/puenteRemoto.test.ts", "acceptanceCriteria": ["encender abre y al abrirse queda activa con URL", "un sumidero por móvil; solo sale lo filtrado y transformado", "un móvil que se va se suelta", "entrada permitida se despacha, rechazada se informa, desconocido se ignora", "apagar suelta y cierra; revocar abre canal nuevo", "sin paquete o fallo al abrir: estado error con motivo"], "modelTier": "standard"}
```

---

### Task 4: Extraer el enganche de un cliente y el despacho de la conversación (`arranque.ts`)

**Goal:** Sacar de la ruta `GET /eventos` y de `POST /accion` cuatro funciones con nombre, sin cambiar el comportamiento, para que el puente use exactamente el mismo código.

**Files:**
- Modify: `src/web/servidor/arranque.ts` (ruta `GET RUTA_EVENTOS` hacia la línea 5308; ruta `POST RUTA_ACCION` hacia la 5982: el bloque `mensaje.clase === "cancelar"` y el `else` final con `destinoActual().recibir(mensaje)`)

**Acceptance Criteria:**
- [ ] Existen dentro de `montarRutas`: `engancharCliente(sumidero)`, `soltarCliente(sumidero)`, `recibirEnLaConsola(mensaje)` y `cancelarTurno()`.
- [ ] La ruta SSE usa `engancharCliente` y su `close` usa `soltarCliente`; `POST /accion` usa `cancelarTurno` y `recibirEnLaConsola`.
- [ ] `FORCE_COLOR=0 npx vitest run src/web --maxWorkers=2` sigue entero en verde, sin tocar ningún test.

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run src/web --maxWorkers=2` → todo en verde.

**Steps:**

- [ ] **Step 1: Extraer `engancharCliente` y `soltarCliente`**

Dentro de `montarRutas`, justo antes de `servidor.registrarRuta("GET", RUTA_EVENTOS, …)`, definir:
```ts
  /**
   * Engancha un cliente del cable: una pestaña SSE o un MÓVIL de la sesión remota
   * (`puenteRemoto.ts`). Es la misma puerta para los dos a propósito: así el móvil recibe la
   * misma ráfaga, se muda con el foco y cuenta como «hay alguien delante» igual que una pestaña.
   */
  const engancharCliente = (sumidero: Sumidero): void => {
    clientes.add(sumidero);
    adjuntar(sumidero);
    sumidero({ clase: "bienvenida", ...(vestibulo.nombre === undefined ? {} : { nombre: vestibulo.nombre }) });
  };

  /** Lo contrario, con la regla de «el ÚLTIMO en irse deja la consola sola» (ver el `close` de la ruta SSE). */
  const soltarCliente = (sumidero: Sumidero): void => {
    clientes.delete(sumidero);
    adjunto?.desconectar(sumidero);
    if (clientes.size === 0) {
      for (const consola of vestibulo.proyectosAbiertos()) {
        if (consola !== adjunto) consola.desconectar();
      }
      adjunto = undefined;
    }
  };
```

En la ruta SSE, sustituir las tres líneas
```ts
    clientes.add(sumidero);
```
(la del principio) y
```ts
    adjuntar(sumidero);
    sumidero({ clase: "bienvenida", ...(vestibulo.nombre === undefined ? {} : { nombre: vestibulo.nombre }) });
```
por una sola llamada en el sitio donde estaba `adjuntar(sumidero)`:
```ts
    engancharCliente(sumidero);
```
Ojo: el `clientes.add(sumidero)` original va ANTES del bloque de `idDeCliente`; moverlo al sitio de `adjuntar` no cambia nada observable porque entre medias no se emite nada a `clientes`. Si algún test lo contradice, dejar `clientes.add` donde estaba y quitarlo de `engancharCliente` en su lugar llamando a `adjuntar` y la bienvenida desde ella.

En el `peticion.on("close", …)`, sustituir
```ts
      clientes.delete(sumidero);
```
(el primero) y el tramo final
```ts
      adjunto?.desconectar(sumidero);
      if (clientes.size === 0) {
        …
        adjunto = undefined;
      }
```
por, al final del manejador (después de la limpieza de `idDeCliente`, que no cambia):
```ts
      soltarCliente(sumidero);
```
Conservar los comentarios que explican el porqué, movidos encima de `soltarCliente`.

- [ ] **Step 2: Extraer `cancelarTurno` y `recibirEnLaConsola`**

Antes de `servidor.registrarRuta("POST", RUTA_ACCION, …)`:
```ts
  /** Parar ESTE turno, no cerrar la conversación. Lo usan `POST /accion` y el móvil. */
  const cancelarTurno = (): void => {
    const abierto = vestibulo.proyectoAbierto();
    if (abierto === undefined || !abierto.cancelarTurno()) {
      informar("no hay ningún turno en vuelo que parar");
    }
  };

  /**
   * Lo que va a la consola en foco: prosa, respuestas, decisiones… Tras una PROSA se reanuncia
   * el alta (ver el comentario del `else` de `POST /accion`). Lo usan la ruta y el móvil.
   */
  const recibirEnLaConsola = (mensaje: MensajeDelCliente): void => {
    destinoActual().recibir(mensaje);
    if (mensaje.clase === "prosa") {
      void Promise.resolve()
        .then(() => anunciarAlta())
        .catch(contar);
    }
  };
```
En la ruta, el bloque de `cancelar` pasa a:
```ts
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "cancelar") {
      cancelarTurno();
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
```
y el `else` final a:
```ts
    } else {
      recibirEnLaConsola(mensaje);
    }
```
Conservar el comentario largo del `else` encima de `recibirEnLaConsola`.

- [ ] **Step 3: Comprobar que nada cambió**

Run: `npm run typecheck && FORCE_COLOR=0 npx vitest run src/web --maxWorkers=2`
Expected: todo en verde, con el mismo número de tests que antes del cambio.

- [ ] **Step 4: Commit**

```bash
git add src/web/servidor/arranque.ts
git commit -m "refactor(web): el enganche de un cliente y el despacho de la conversación, con nombre

Sin cambio de comportamiento: la ruta SSE y POST /accion usan engancharCliente/soltarCliente
y cancelarTurno/recibirEnLaConsola, que la sesión remota reutiliza.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["src/web/servidor/arranque.ts"], "verifyCommand": "npm run typecheck && FORCE_COLOR=0 npx vitest run src/web --maxWorkers=2", "acceptanceCriteria": ["existen engancharCliente, soltarCliente, recibirEnLaConsola y cancelarTurno", "la ruta SSE y POST /accion las usan", "src/web entero en verde sin tocar tests"], "modelTier": "standard"}
```

---

### Task 5: El mensaje `remoto` en el cable y el cableado en `montarRutas`

**Goal:** Con el interruptor encendido, la consola anuncia `{clase:"remoto", estado}` y atiende `{clase:"remoto", accion}`; un móvil entra por la puerta de las pestañas y lo que manda llega a la consola por el despachador real. Con el interruptor apagado no existe nada de esto.

**Files:**
- Modify: `src/web/servidor/transporte.ts` (`MensajeAlCliente`, `MensajeDelCliente`), `apps/web/src/tipos.ts` (los mismos), `src/web/servidor/arranque.ts` (`OpcionesDeMontaje`, ráfaga de `adjuntar`, `POST /accion`, retorno de `montarRutas`, `arrancarConsolaWeb`)
- Test: `src/web/servidor/arranque.remoto.test.ts`

**Acceptance Criteria:**
- [ ] Sin `opciones.remoto`, o con `ajustes().habilitado === false`: la ráfaga no trae ningún `{clase:"remoto"}`, `POST {clase:"remoto", accion:"encender"}` contesta 204 sin hacer nada y el cargador del puerto NO se llama.
- [ ] Con el interruptor encendido: la ráfaga trae `{clase:"remoto", estado:"apagada"}`; `encender` abre el puente y todos los clientes reciben `{clase:"remoto", estado:"activa", url, moviles: 0}`.
- [ ] Un móvil que entra (`presencia`) recibe por el puente la ráfaga filtrada: al menos una `reemision`, y ningún mensaje de clase `modelos`, `agentes` ni `workspace`.
- [ ] Una `prosa` del móvil llega al ejecutor del turno de la consola en foco (el `crearEjecutor` del vestíbulo de prueba recibe la petición), por el despachador real.
- [ ] `montarRutas` devuelve `cerrarRemoto()`, y `arrancarConsolaWeb` lo llama antes de `vestibulo.cerrar()`.
- [ ] `apps/web/src/tipos.test.ts` sigue en verde (las clases del cliente y del host coinciden).

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run src/web apps/web/src/tipos.test.ts --maxWorkers=2` → todo en verde.

**Steps:**

- [ ] **Step 1: Los tipos del cable, en los dos lados**

En `src/web/servidor/transporte.ts`, añadir a `MensajeAlCliente`:
```ts
  /**
   * La sesión remota, solo si el interruptor está encendido (`settings.remoto`). La `url` lleva
   * el SECRETO en el fragmento: es el segundo secreto del cable, junto a `leerSecreto`, y por eso
   * `remoto` no está en la lista de salida del puente (`core/remoto.ts`).
   */
  | {
      clase: "remoto";
      estado: "apagada" | "abriendo" | "activa" | "reconectando" | "error";
      url?: string;
      moviles?: number;
      motivo?: string;
    }
```
y a `MensajeDelCliente`:
```ts
  | { clase: "remoto"; accion: "encender" | "revocar" | "apagar" }
```
Repetir EXACTAMENTE lo mismo en `apps/web/src/tipos.ts` (sus `MensajeAlCliente` y `MensajeDelCliente`).

- [ ] **Step 2: Escribir el test que falla**

`src/web/servidor/arranque.remoto.test.ts`. Reutiliza los ayudantes de `arranque.test.ts`: si no están exportados, copiar `servidorDeMentira`, `clienteDeMentira`, `enviarMensaje`, `asentar` y `vestibuloDePrueba` tal cual al principio de este fichero (son funciones de prueba, no código de producción).
```ts
import { describe, expect, it, vi } from "vitest";
import { PuenteRemotoEnMemoria } from "../../core/ports.js";
import { montarRutas } from "./arranque.js";
// + los ayudantes copiados de arranque.test.ts: servidorDeMentira, clienteDeMentira, enviarMensaje, asentar, vestibuloDePrueba

function conRemoto(habilitado: boolean, extra: Parameters<typeof vestibuloDePrueba>[0] = {}) {
  const servidor = servidorDeMentira();
  const puerto = new PuenteRemotoEnMemoria();
  const cargar = vi.fn(async () => puerto);
  const vestibulo = vestibuloDePrueba(extra);
  const montado = montarRutas(servidor, vestibulo, {
    remoto: { ajustes: () => ({ habilitado, servidor: "ws://127.0.0.1:8787/ws" }), puerto: cargar },
  });
  const sse = servidor.rutas.get("GET /eventos")!;
  const accion = servidor.rutas.get("POST /accion")!;
  return { servidor, puerto, cargar, vestibulo, montado, sse, accion };
}

describe("la sesión remota en el cable", () => {
  it("apagada: ni se anuncia, ni se atiende, ni se carga el paquete", async () => {
    const m = conRemoto(false);
    const c = clienteDeMentira();
    m.sse(c.peticion, c.respuesta);
    await asentar();
    expect(c.recibidos.some((x) => x.clase === "remoto")).toBe(false);
    expect(await enviarMensaje(m.accion, { clase: "remoto", accion: "encender" })).toBe(204);
    await asentar();
    expect(m.cargar).not.toHaveBeenCalled();
  });

  it("encendida: se anuncia, se enciende y un móvil recibe la ráfaga FILTRADA", async () => {
    const m = conRemoto(true);
    const c = clienteDeMentira();
    m.sse(c.peticion, c.respuesta);
    await asentar();
    expect(c.recibidos).toContainEqual({ clase: "remoto", estado: "apagada" });

    await enviarMensaje(m.accion, { clase: "remoto", accion: "encender" });
    await asentar();
    m.puerto.abierta("https://r/r/S#K");
    expect(c.recibidos.at(-1)).toEqual({ clase: "remoto", estado: "activa", url: "https://r/r/S#K", moviles: 0 });

    m.puerto.presencia("m1");
    await asentar();
    const alMovil = m.puerto.enviados.filter((e) => e.para === "m1").map((e) => (e.mensaje as { clase: string }).clase);
    expect(alMovil).toContain("reemision");
    for (const prohibida of ["modelos", "agentes", "workspace", "skills", "bienvenida", "remoto"]) {
      expect(alMovil).not.toContain(prohibida);
    }
  });

  it("una prosa del móvil llega al turno de la consola en foco por el despachador real", async () => {
    const peticiones: string[] = [];
    const m = conRemoto(true, {
      crearEjecutor: () => async (peticion) => {
        peticiones.push(peticion);
      },
    });
    const c = clienteDeMentira();
    m.sse(c.peticion, c.respuesta);
    await enviarMensaje(m.accion, { clase: "sesion", proyecto: "p1" });
    await asentar();
    await enviarMensaje(m.accion, { clase: "remoto", accion: "encender" });
    await asentar();
    m.puerto.abierta();
    m.puerto.presencia("m1");
    m.puerto.delMovil("m1", { clase: "prosa", texto: "desde el móvil" });
    await vi.waitFor(() => expect(peticiones.join("\n")).toContain("desde el móvil"));
  });

  it("cerrarRemoto apaga el puente", async () => {
    const m = conRemoto(true);
    await enviarMensaje(m.accion, { clase: "remoto", accion: "encender" });
    await asentar();
    m.puerto.abierta();
    m.montado.cerrarRemoto();
    expect(m.puerto.cerrados).toBe(1);
  });
});
```
Si `vestibuloDePrueba` necesita algo más para abrir el proyecto `p1` (copia en disco), seguir el patrón que ya usa `arranque.test.ts` para los tests que mandan `{clase:"sesion"}` y llegan a correr un turno.

- [ ] **Step 3: Ver que fallan**

Run: `FORCE_COLOR=0 npx vitest run src/web/servidor/arranque.remoto.test.ts`
Expected: FAIL (tipos: `remoto` no existe en `OpcionesDeMontaje`, o `cerrarRemoto` no es una función).

- [ ] **Step 4: Cablear en `montarRutas`**

En `OpcionesDeMontaje` (en `arranque.ts`):
```ts
  /**
   * La sesión remota (`puenteRemoto.ts`). Ausente o `ajustes().habilitado === false` = no
   * existe: ni se anuncia, ni se atiende, ni se llama a `puerto` (que es lo que cargaría el
   * paquete `@xone/xonecode-remoto`).
   */
  remoto?: {
    ajustes: () => { habilitado: boolean; servidor: string };
    puerto: () => Promise<PuenteRemotoPort | undefined>;
  };
```
Imports al principio de `arranque.ts`:
```ts
import type { PuenteRemotoPort } from "../../core/ports.js";
import { crearSesionRemota, type EstadoDeSesionRemota } from "./puenteRemoto.js";
```

Dentro de `montarRutas`, DESPUÉS de definir `engancharCliente`, `soltarCliente`, `cancelarTurno` y `recibirEnLaConsola`:
```ts
  const remotoHabilitado = (): boolean => opciones.remoto?.ajustes().habilitado === true;
  const mensajeDeRemoto = (e: EstadoDeSesionRemota): MensajeAlCliente => ({
    clase: "remoto",
    estado: e.estado,
    ...("url" in e ? { url: e.url } : {}),
    ...("moviles" in e ? { moviles: e.moviles } : {}),
    ...("motivo" in e ? { motivo: e.motivo } : {}),
  });
  const sesionRemota =
    opciones.remoto === undefined
      ? undefined
      : crearSesionRemota({
          puerto: opciones.remoto.puerto,
          servidor: () => opciones.remoto!.ajustes().servidor,
          engancharCliente,
          soltarCliente,
          despachar: (m) => (m.clase === "cancelar" ? cancelarTurno() : recibirEnLaConsola(m)),
          informar,
          // A las pestañas: el diálogo de la consola. Nunca a un móvil: `remoto` no pasa `filtrarSalida`.
          alCambiar: (e) => {
            for (const cliente of clientes) cliente(mensajeDeRemoto(e));
          },
        });
```
Ojo: `alCambiar` itera `clientes`, que también contiene los sumideros de los móviles; no pasa nada porque su filtro descarta `remoto`.

En la ráfaga de `adjuntar` (donde se mandan `depuracion`, `modoPorDefecto`… a cada `cliente` de `destinatarios`), añadir:
```ts
      if (sesionRemota !== undefined && remotoHabilitado()) cliente(mensajeDeRemoto(sesionRemota.estado()));
```

En `POST /accion`, antes del bloque de `cancelar`:
```ts
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "remoto") {
      if (sesionRemota !== undefined && remotoHabilitado()) {
        if (mensaje.accion === "encender") void sesionRemota.encender().catch(contar);
        else if (mensaje.accion === "revocar") void sesionRemota.revocar().catch(contar);
        else if (mensaje.accion === "apagar") sesionRemota.apagar();
      }
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
```

Y en el `return` de `montarRutas`:
```ts
  return { emitirTareas, cerrarRemoto: () => sesionRemota?.apagar() };
```
(ajustar el tipo de retorno declarado: `{ emitirTareas: () => void; cerrarRemoto: () => void }`).

- [ ] **Step 5: Apagarla en el cierre ordenado**

En `arrancarConsolaWeb`, donde se guarda lo que devuelve `montarRutas`, conservar el valor (por ejemplo `const rutas = montarRutas(…)`) y, tras `await (opciones.esperarCierre ?? …)()`, antes de `await corredor?.parar()`:
```ts
  rutas.cerrarRemoto();
```
Y pasar `remoto` a `montarRutas` con el cableado REAL (el puerto llega en la Task 6; de momento):
```ts
    remoto: {
      ajustes: () => remotoEnVigor(cargarSettings().settings.remoto, process.env),
      puerto: async () => undefined,
    },
```
con el import `import { remotoEnVigor } from "../../core/settings.js";` (y `cargarSettings`, que ya se usa en el fichero).

- [ ] **Step 6: Ver que pasan**

Run: `npm run typecheck && FORCE_COLOR=0 npx vitest run src/web apps/web/src/tipos.test.ts --maxWorkers=2`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add src/web/servidor/transporte.ts apps/web/src/tipos.ts src/web/servidor/arranque.ts src/web/servidor/arranque.remoto.test.ts
git commit -m "feat(remoto): el mensaje remoto en el cable y el móvil por la puerta de las pestañas

Detrás del interruptor: apagado no se anuncia, no se atiende y no se carga el paquete. La entrada
del móvil va por cancelarTurno/recibirEnLaConsola, el mismo código que POST /accion.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["src/web/servidor/transporte.ts", "apps/web/src/tipos.ts", "src/web/servidor/arranque.ts", "src/web/servidor/arranque.remoto.test.ts"], "verifyCommand": "npm run typecheck && FORCE_COLOR=0 npx vitest run src/web apps/web/src/tipos.test.ts --maxWorkers=2", "acceptanceCriteria": ["apagada: sin anuncio, 204 sin efecto, cargador no llamado", "encendida: anuncia apagada y activa con url al abrir", "un móvil recibe reemision y nunca modelos/agentes/workspace/skills/bienvenida/remoto", "una prosa del móvil llega al ejecutor por el despachador real", "cerrarRemoto existe y arrancarConsolaWeb lo llama", "tipos.test sigue en verde"], "modelTier": "frontier"}
```

---

### Task 6: El adaptador real (WebSocket + paquete con `import()` dinámico)

**Goal:** `PuenteRemotoPort` real sobre el `WebSocket` de Node 22 y `@xone/xonecode-remoto`, cargado solo bajo demanda, con reconexión a la MISMA sala; cableado en `arrancarConsolaWeb`.

**Files:**
- Create: `src/agent/remoto/puenteWebSocket.ts`
- Test: `src/agent/remoto/puenteWebSocket.test.ts`
- Modify: `src/web/servidor/arranque.ts` (el `puerto` del cableado real de la Task 5)

**Acceptance Criteria:**
- [ ] `cargarModuloRemoto(importar)` devuelve el módulo si `importar` resuelve, y `undefined` si lanza (paquete no instalado) sin propagar el error.
- [ ] Con un servidor WebSocket de pruebas (paquete `ws` ya presente en el repo, o el `WebSocketServer` que haya disponible) y un módulo FALSO que cifra con la identidad: `abrir` manda `{t:"abrir", sala, v}`, avisa `abierta` con una URL `…/r/<sala>#<secreto>`, entrega `presencia` y `dato` (con `de`), y `enviar(para, m)` manda `{t:"dato", para, carga}`.
- [ ] Si el servidor cierra el socket, avisa `reconectando`, reconecta y vuelve a mandar `abrir` con la MISMA sala.
- [ ] Un `error {motivo:"version"}` avisa `cerrada` con un motivo que contiene «actualiza xonecode».
- [ ] El texto fuente de `arranque.ts` y de `puenteRemoto.ts` no contiene `@xone/xonecode-remoto` (solo lo nombra `puenteWebSocket.ts`).

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run src/agent/remoto src/web/servidor/arranque.remoto.test.ts` → todo en verde.

**Steps:**

- [ ] **Step 1: Escribir los tests que fallan**

`src/agent/remoto/puenteWebSocket.test.ts`:
```ts
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer, type WebSocket as Socket } from "ws";
import { cargarModuloRemoto, crearPuenteWebSocket, NOMBRE_DEL_PAQUETE, type ModuloRemoto } from "./puenteWebSocket.js";
import type { EstadoDelPuente } from "../../core/ports.js";

/** Un módulo FALSO: misma forma que el paquete, cifrado identidad. Los vectores reales se prueban en xonecode-server. */
const moduloFalso: ModuloRemoto = {
  VERSION_DEL_PROTOCOLO: 1,
  generarCredenciales: () => ({ sala: "SALA", secreto: "SECRETO" }),
  urlDeSesion: (base, sala, secreto) => `${base}/r/${sala}#${secreto}`,
  baseHttpDe: (ws) => ws.replace(/^ws/, "http").replace(/\/ws$/, ""),
  crearCanal: async () => ({
    cifrar: async (m: unknown) => JSON.stringify(m),
    descifrar: async (c: string) => JSON.parse(c) as unknown,
  }),
};

let servidor: WebSocketServer | undefined;
afterEach(() => servidor?.close());

function levantar() {
  servidor = new WebSocketServer({ port: 0 });
  const recibidos: Record<string, unknown>[] = [];
  const conexiones: Socket[] = [];
  servidor.on("connection", (ws) => {
    conexiones.push(ws);
    ws.on("message", (d) => recibidos.push(JSON.parse(String(d)) as Record<string, unknown>));
  });
  const puerto = (servidor.address() as { port: number }).port;
  return { url: `ws://127.0.0.1:${puerto}/ws`, recibidos, conexiones };
}

describe("cargar el paquete bajo demanda", () => {
  it("devuelve el módulo, o undefined si no está instalado", async () => {
    expect(await cargarModuloRemoto(async () => moduloFalso)).toBe(moduloFalso);
    expect(
      await cargarModuloRemoto(async () => {
        throw new Error("Cannot find package");
      })
    ).toBeUndefined();
  });

  it("solo este fichero nombra el paquete", () => {
    const raiz = join(import.meta.dirname, "..", "..");
    for (const f of ["web/servidor/arranque.ts", "web/servidor/puenteRemoto.ts", "core/remoto.ts", "core/ports.ts"]) {
      expect(readFileSync(join(raiz, f), "utf8")).not.toContain(NOMBRE_DEL_PAQUETE);
    }
  });
});

describe("el puente WebSocket", () => {
  it("abre la sala, entrega presencia y datos, y envía dirigido", async () => {
    const s = levantar();
    const estados: EstadoDelPuente[] = [];
    const presencias: (readonly string[])[] = [];
    const mensajes: [string, unknown][] = [];
    const canal = await crearPuenteWebSocket(moduloFalso).abrir(s.url, {
      alEstado: (e) => void estados.push(e),
      alPresencia: (p) => void presencias.push(p),
      alMensaje: (de, m) => void mensajes.push([de, m]),
    });
    await expect.poll(() => s.recibidos[0]).toEqual({ t: "abrir", sala: "SALA", v: 1 });
    const ws = s.conexiones[0]!;
    ws.send(JSON.stringify({ t: "abierta" }));
    await expect.poll(() => estados.at(-1)).toEqual({ estado: "abierta", url: `${moduloFalso.baseHttpDe(s.url)}/r/SALA#SECRETO` });
    ws.send(JSON.stringify({ t: "presencia", moviles: ["m1"] }));
    ws.send(JSON.stringify({ t: "dato", de: "m1", carga: JSON.stringify({ clase: "cancelar" }) }));
    await expect.poll(() => mensajes).toEqual([["m1", { clase: "cancelar" }]]);
    expect(presencias).toEqual([["m1"]]);
    await canal.enviar("m1", { clase: "turno", activo: true });
    await expect.poll(() => s.recibidos.at(-1)).toEqual({ t: "dato", para: "m1", carga: JSON.stringify({ clase: "turno", activo: true }) });
    canal.cerrar();
  });

  it("si se cae, reconecta a la MISMA sala", async () => {
    const s = levantar();
    const estados: EstadoDelPuente[] = [];
    const canal = await crearPuenteWebSocket(moduloFalso, { esperasMs: [10] }).abrir(s.url, {
      alEstado: (e) => void estados.push(e),
      alPresencia: () => {},
      alMensaje: () => {},
    });
    await expect.poll(() => s.conexiones.length).toBe(1);
    s.conexiones[0]!.close();
    await expect.poll(() => estados.some((e) => e.estado === "reconectando")).toBe(true);
    await expect.poll(() => s.recibidos.filter((r) => r.t === "abrir")).toEqual([
      { t: "abrir", sala: "SALA", v: 1 },
      { t: "abrir", sala: "SALA", v: 1 },
    ]);
    canal.cerrar();
  });

  it("otra versión del protocolo se dice con «actualiza xonecode»", async () => {
    const s = levantar();
    const estados: EstadoDelPuente[] = [];
    await crearPuenteWebSocket(moduloFalso).abrir(s.url, { alEstado: (e) => void estados.push(e), alPresencia: () => {}, alMensaje: () => {} });
    await expect.poll(() => s.conexiones.length).toBe(1);
    s.conexiones[0]!.send(JSON.stringify({ t: "error", motivo: "version" }));
    await expect.poll(() => estados.at(-1)).toMatchObject({ estado: "cerrada" });
    expect((estados.at(-1) as { motivo?: string }).motivo).toMatch(/actualiza xonecode/);
  });
});
```
Antes de escribirlo, comprobar que `ws` está en `node_modules` (`ls node_modules/ws`). Si no está, usar como servidor de pruebas cualquier `WebSocketServer` que ya dependa el repo, o añadir `ws` solo como `devDependency` (no cambia lo que se publica).

- [ ] **Step 2: Ver que fallan**

Run: `FORCE_COLOR=0 npx vitest run src/agent/remoto`
Expected: FAIL, «Cannot find module './puenteWebSocket.js'».

- [ ] **Step 3: Implementar**

`src/agent/remoto/puenteWebSocket.ts`:
```ts
/**
 * El puente REAL de la sesión remota. Es el ÚNICO fichero que nombra `@xone/xonecode-remoto`,
 * y lo carga con `import()` dinámico de un nombre en variable: mientras sea experimental no es
 * dependencia de xonecode, así que una release sin él instala y arranca igual, y `npm test` no
 * lo necesita (usa `PuenteRemotoEnMemoria`).
 */
import type { CanalRemoto, EscuchasDelPuente, PuenteRemotoPort } from "../../core/ports.js";

export const NOMBRE_DEL_PAQUETE = "@xone/xonecode-remoto";

/** La parte del paquete que se usa aquí (su API real tiene más). */
export interface ModuloRemoto {
  VERSION_DEL_PROTOCOLO: number;
  generarCredenciales(): { sala: string; secreto: string };
  urlDeSesion(baseHttp: string, sala: string, secreto: string): string;
  baseHttpDe(servidorWs: string): string;
  crearCanal(o: { secreto: string; sala: string; rol: "anfitrion" }): Promise<{
    cifrar(m: unknown): Promise<string>;
    descifrar(carga: string): Promise<unknown>;
  }>;
}

export async function cargarModuloRemoto(importar: (nombre: string) => Promise<unknown> = (n) => import(n)): Promise<ModuloRemoto | undefined> {
  const nombre: string = NOMBRE_DEL_PAQUETE;
  try {
    return (await importar(nombre)) as ModuloRemoto;
  } catch {
    return undefined;
  }
}

const MOTIVOS: Record<string, string> = {
  version: "la versión del protocolo no casa: actualiza xonecode",
  "sala-ocupada": "esa sala ya tiene un anfitrión",
  "sala-inexistente": "el servidor no conoce la sala",
};

export function crearPuenteWebSocket(
  modulo: ModuloRemoto,
  opciones: { esperasMs?: readonly number[] } = {}
): PuenteRemotoPort {
  const esperas = opciones.esperasMs ?? [1_000, 2_000, 5_000, 10_000, 30_000];
  return {
    async abrir(servidor: string, escuchas: EscuchasDelPuente): Promise<CanalRemoto> {
      const { sala, secreto } = modulo.generarCredenciales();
      const canal = await modulo.crearCanal({ secreto, sala, rol: "anfitrion" });
      const url = modulo.urlDeSesion(modulo.baseHttpDe(servidor), sala, secreto);
      let ws: WebSocket | undefined;
      let cerrado = false;
      let intento = 0;

      const conectar = () => {
        const socket = new WebSocket(servidor);
        ws = socket;
        socket.onopen = () => {
          intento = 0;
          socket.send(JSON.stringify({ t: "abrir", sala, v: modulo.VERSION_DEL_PROTOCOLO }));
        };
        socket.onmessage = async (ev) => {
          let s: Record<string, unknown>;
          try {
            s = JSON.parse(String(ev.data)) as Record<string, unknown>;
          } catch {
            return;
          }
          if (s.t === "abierta") escuchas.alEstado({ estado: "abierta", url });
          else if (s.t === "presencia" && Array.isArray(s.moviles)) escuchas.alPresencia(s.moviles.filter((x): x is string => typeof x === "string"));
          else if (s.t === "dato" && typeof s.de === "string" && typeof s.carga === "string") {
            const claro = await canal.descifrar(s.carga);
            if (claro !== undefined) escuchas.alMensaje(s.de, claro);
          } else if (s.t === "error" && typeof s.motivo === "string" && s.motivo in MOTIVOS) {
            cerrado = true;
            escuchas.alEstado({ estado: "cerrada", motivo: MOTIVOS[s.motivo]! });
            socket.close();
          }
        };
        socket.onclose = () => {
          if (cerrado) return;
          escuchas.alEstado({ estado: "reconectando" });
          const espera = esperas[Math.min(intento, esperas.length - 1)]!;
          intento += 1;
          setTimeout(() => {
            if (!cerrado) conectar();
          }, espera);
        };
      };
      conectar();

      return {
        async enviar(para, mensaje) {
          if (ws?.readyState !== WebSocket.OPEN) return;
          const carga = await canal.cifrar(mensaje);
          ws.send(JSON.stringify(para === undefined ? { t: "dato", carga } : { t: "dato", para, carga }));
        },
        cerrar() {
          cerrado = true;
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "cerrar" }));
          ws?.close();
        },
      };
    },
  };
}
```

- [ ] **Step 4: Cablear el puerto real**

En `arrancarConsolaWeb` (`arranque.ts`), sustituir `puerto: async () => undefined` por:
```ts
      puerto: async () => {
        const { cargarModuloRemoto, crearPuenteWebSocket } = await import("../../agent/remoto/puenteWebSocket.js");
        const modulo = await cargarModuloRemoto();
        return modulo === undefined ? undefined : crearPuenteWebSocket(modulo);
      },
```
El `import()` es también dinámico: con el interruptor apagado ni siquiera se carga este fichero.

- [ ] **Step 5: Ver que pasan**

Run: `npm run typecheck && FORCE_COLOR=0 npx vitest run src/agent/remoto src/web --maxWorkers=2 && FORCE_COLOR=0 npx vitest run src/ciclos.test.ts src/core/imports.test.ts`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add src/agent/remoto src/web/servidor/arranque.ts
git commit -m "feat(remoto): el puente real sobre WebSocket, con el paquete cargado bajo demanda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["src/agent/remoto/puenteWebSocket.ts", "src/agent/remoto/puenteWebSocket.test.ts", "src/web/servidor/arranque.ts"], "verifyCommand": "npm run typecheck && FORCE_COLOR=0 npx vitest run src/agent/remoto src/web/servidor/arranque.remoto.test.ts", "acceptanceCriteria": ["cargarModuloRemoto: módulo o undefined sin propagar", "abre la sala, entrega presencia y datos con de, envía dirigido", "reconecta a la misma sala y avisa reconectando", "error version → cerrada con «actualiza xonecode»", "solo puenteWebSocket.ts nombra el paquete"], "modelTier": "standard"}
```

---

### Task 7: El botón y el diálogo con QR en la consola web

**Goal:** Con `estado.remoto` presente (solo llega con el interruptor encendido), la consola pinta un botón «Sesión remota» que abre un diálogo con el QR, la URL copiable, el recuento de aparatos, «Revocar enlace» y «Apagar».

**Files:**
- Modify: `apps/web/package.json` (dependencia `qrcode` y `@types/qrcode`), `apps/web/src/store.ts` (estado `remoto` y su `case`), `apps/web/src/App.tsx` (montar el componente junto a `<BarraDeEstado`)
- Create: `apps/web/src/componentes/SesionRemota.tsx`, `apps/web/src/componentes/SesionRemota.module.css`
- Test: `apps/web/src/componentes/SesionRemota.test.tsx`

**Acceptance Criteria:**
- [ ] El store guarda `remoto` desde `{clase:"remoto", estado, url?, moviles?, motivo?}` y descarta un `estado` desconocido.
- [ ] Sin `remoto` en el estado, no se pinta nada (un control sin dato detrás no se pinta).
- [ ] Con `estado: "apagada"`, el botón «Sesión remota» manda `{clase:"remoto", accion:"encender"}` y abre el diálogo.
- [ ] Con `estado: "activa"`, el diálogo pinta un `<img>` cuyo `src` empieza por `data:image/svg+xml`, la URL, «N aparatos conectados», y los botones «Revocar enlace» → `revocar` y «Apagar» → `apagar`.
- [ ] Con `estado: "error"`, el diálogo enseña el `motivo`.
- [ ] `SesionRemota.module.css` no tiene colores literales (`Barra.test.tsx` en verde).

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run apps/web/src/componentes/SesionRemota.test.tsx apps/web/src/componentes/Barra.test.tsx apps/web/src/store` → todo en verde.

**Steps:**

- [ ] **Step 1: Dependencia del QR**

Run: `npm install -w apps/web qrcode@^1.5.4 && npm install -w apps/web -D @types/qrcode@^1.5.5`
(Si el workspace del cliente se llama distinto, usar su nombre de `apps/web/package.json`.)

- [ ] **Step 2: Escribir los tests que fallan**

`apps/web/src/componentes/SesionRemota.test.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SesionRemota } from "./SesionRemota";

describe("la sesión remota en la consola", () => {
  it("sin estado no pinta nada", () => {
    const { container } = render(<SesionRemota remoto={undefined} enviar={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("apagada: el botón la enciende y abre el diálogo", () => {
    const enviar = vi.fn(async () => {});
    render(<SesionRemota remoto={{ estado: "apagada" }} enviar={enviar} />);
    fireEvent.click(screen.getByRole("button", { name: "Sesión remota" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "remoto", accion: "encender" });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("activa: QR como imagen, URL, aparatos, revocar y apagar", async () => {
    const enviar = vi.fn(async () => {});
    render(<SesionRemota remoto={{ estado: "activa", url: "https://r/r/S#K", moviles: 2 }} enviar={enviar} abierto />);
    await waitFor(() => expect((screen.getByAltText("Código QR de la sesión remota") as HTMLImageElement).src).toMatch(/^data:image\/svg\+xml/));
    expect(screen.getByText("https://r/r/S#K")).toBeTruthy();
    expect(screen.getByText("2 aparatos conectados")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revocar enlace" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "remoto", accion: "revocar" });
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "remoto", accion: "apagar" });
  });

  it("error: enseña el motivo", () => {
    render(<SesionRemota remoto={{ estado: "error", motivo: "la sesión remota no está disponible en esta instalación" }} enviar={vi.fn()} abierto />);
    expect(screen.getByText("la sesión remota no está disponible en esta instalación")).toBeTruthy();
  });
});
```
Y en el test del store que corresponda (`apps/web/src/store.test.ts` o el más cercano a los `case` de `depuracion`), añadir:
```ts
it("guarda el estado de la sesión remota y descarta uno desconocido", () => {
  const store = crearStore();
  store.aplicar({ clase: "remoto", estado: "activa", url: "https://r/r/S#K", moviles: 1 });
  expect(store.estado().remoto).toEqual({ estado: "activa", url: "https://r/r/S#K", moviles: 1 });
  store.aplicar({ clase: "remoto", estado: "inventado" });
  expect(store.estado().remoto).toEqual({ estado: "activa", url: "https://r/r/S#K", moviles: 1 });
});
```
(usar el constructor y el accesor de estado que use ese fichero; los nombres `crearStore`/`aplicar`/`estado()` pueden diferir.)

- [ ] **Step 3: Ver que fallan**

Run: `FORCE_COLOR=0 npx vitest run apps/web/src/componentes/SesionRemota.test.tsx`
Expected: FAIL, «Cannot find module './SesionRemota'».

- [ ] **Step 4: El store**

En `apps/web/src/store.ts`, en el tipo del estado (junto a `depuracionActiva?: boolean;`):
```ts
  /** La sesión remota; ausente = el interruptor está apagado y no se pinta nada. */
  remoto?: EstadoRemoto;
```
con el tipo (junto a los demás tipos del fichero, o en `tipos.ts` si allí viven):
```ts
export type EstadoRemoto =
  | { estado: "apagada" | "abriendo" }
  | { estado: "activa" | "reconectando"; url: string; moviles: number }
  | { estado: "error"; motivo: string };
```
y el `case` junto al de `depuracion`:
```ts
        case "remoto": {
          const m = mensaje as Record<string, unknown>;
          if (m["estado"] === "apagada" || m["estado"] === "abriendo") {
            mutar({ remoto: { estado: m["estado"] } });
          } else if ((m["estado"] === "activa" || m["estado"] === "reconectando") && typeof m["url"] === "string") {
            mutar({ remoto: { estado: m["estado"], url: m["url"], moviles: typeof m["moviles"] === "number" ? m["moviles"] : 0 } });
          } else if (m["estado"] === "error" && typeof m["motivo"] === "string") {
            mutar({ remoto: { estado: "error", motivo: m["motivo"] } });
          }
          return;
        }
```
Si el store tiene una lista blanca de campos que conserva al desconectarse el cable, NO incluir `remoto`: al caerse el cable se tira, y la ráfaga de reconexión lo vuelve a traer.

- [ ] **Step 5: El componente**

`apps/web/src/componentes/SesionRemota.tsx`:
```tsx
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { EstadoRemoto } from "../store";
import estilos from "./SesionRemota.module.css";

type Enviar = (m: { clase: "remoto"; accion: "encender" | "revocar" | "apagar" }) => Promise<unknown> | void;

export function SesionRemota({ remoto, enviar, abierto: abiertoInicial = false }: { remoto: EstadoRemoto | undefined; enviar: Enviar; abierto?: boolean }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [qr, setQr] = useState<string | undefined>(undefined);
  const url = remoto !== undefined && "url" in remoto ? remoto.url : undefined;

  useEffect(() => {
    let vivo = true;
    if (url === undefined) {
      setQr(undefined);
      return;
    }
    // SVG a una data URL de un <img>: nunca marcado inyectado.
    void QRCode.toString(url, { type: "svg", margin: 1 }).then((svg) => {
      if (vivo) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    });
    return () => {
      vivo = false;
    };
  }, [url]);

  if (remoto === undefined) return null;

  return (
    <>
      <button
        type="button"
        className={estilos.boton}
        onClick={() => {
          if (remoto.estado === "apagada" || remoto.estado === "error") void enviar({ clase: "remoto", accion: "encender" });
          setAbierto(true);
        }}
      >
        Sesión remota
      </button>
      {abierto ? (
        <div role="dialog" aria-label="Sesión remota" className={estilos.dialogo}>
          {remoto.estado === "abriendo" ? <p>Abriendo la sesión remota…</p> : null}
          {remoto.estado === "error" ? <p className={estilos.error}>{remoto.motivo}</p> : null}
          {remoto.estado === "activa" || remoto.estado === "reconectando" ? (
            <>
              {qr !== undefined ? <img className={estilos.qr} src={qr} alt="Código QR de la sesión remota" /> : null}
              <p className={estilos.url}>{remoto.url}</p>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(remoto.url)}>
                Copiar enlace
              </button>
              <p>
                {remoto.moviles} aparato{remoto.moviles === 1 ? "" : "s"} conectado{remoto.moviles === 1 ? "" : "s"}
              </p>
              {remoto.estado === "reconectando" ? <p>Reconectando…</p> : null}
              <p className={estilos.aviso}>Quien tenga este enlace controla esta sesión hasta que lo revoques o la apagues.</p>
              <button type="button" onClick={() => void enviar({ clase: "remoto", accion: "revocar" })}>
                Revocar enlace
              </button>
              <button type="button" onClick={() => void enviar({ clase: "remoto", accion: "apagar" })}>
                Apagar
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => setAbierto(false)}>
            Cerrar
          </button>
        </div>
      ) : null}
    </>
  );
}
```

`apps/web/src/componentes/SesionRemota.module.css` (solo variables, sin colores literales):
```css
.boton {
  border: 1px solid var(--dsw-alias-border-default, currentColor);
  border-radius: 8px;
  padding: 4px 10px;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.dialogo {
  position: fixed;
  inset: auto 16px 56px auto;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(320px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--dsw-alias-border-default, currentColor);
  border-radius: 12px;
  background: var(--dsw-alias-bg-surface, Canvas);
  color: var(--dsw-alias-text-default, CanvasText);
}
.qr {
  width: 100%;
  aspect-ratio: 1;
  background: var(--xonecode-barra-placa, Canvas);
}
.url {
  word-break: break-all;
  font-size: 12px;
}
.aviso {
  font-size: 12px;
  opacity: 0.8;
}
.error {
  color: var(--dsw-alias-text-danger, CanvasText);
}
```
Antes de dar por buena la hoja, comprobar con `grep` que los alias usados existen en el puente (`estilosDelCliente.test.ts` lo exige); si alguno no existe, sustituirlo por el alias equivalente que sí exista en `estilos/temas.css`.

- [ ] **Step 6: Montarlo**

En `apps/web/src/App.tsx`, justo antes de `<BarraDeEstado` (hacia la línea 3098):
```tsx
            <SesionRemota remoto={estado.remoto} enviar={(m) => enviar(m)} />
```
con `import { SesionRemota } from "./componentes/SesionRemota";` arriba.

- [ ] **Step 7: Ver que pasan**

Run: `npm run typecheck && FORCE_COLOR=0 npx vitest run apps/web --maxWorkers=2`
Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/src/store.ts apps/web/src/App.tsx apps/web/src/componentes/SesionRemota.tsx apps/web/src/componentes/SesionRemota.module.css apps/web/src/componentes/SesionRemota.test.tsx
git commit -m "feat(remoto): el botón «Sesión remota» con su QR en la consola web

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Añadir también el test del store si se tocó otro fichero.)

```json:metadata
{"files": ["apps/web/package.json", "apps/web/src/store.ts", "apps/web/src/App.tsx", "apps/web/src/componentes/SesionRemota.tsx", "apps/web/src/componentes/SesionRemota.module.css", "apps/web/src/componentes/SesionRemota.test.tsx"], "verifyCommand": "npm run typecheck && FORCE_COLOR=0 npx vitest run apps/web --maxWorkers=2", "acceptanceCriteria": ["el store guarda remoto y descarta un estado desconocido", "sin remoto no se pinta nada", "apagada: el botón manda encender y abre el diálogo", "activa: img data:image/svg+xml, URL, N aparatos, revocar y apagar", "error: enseña el motivo", "sin colores literales en el CSS"], "modelTier": "standard"}
```

---

### Task 8: Documentación y la prueba cruzada de punta a punta

**Goal:** Dejar escrita la regla en `CLAUDE.md` y la medida en `docs/DECISIONES.md`, y comprobar con el servidor real de `xonecode-server` y un navegador móvil que aprobar desde el móvil escribe el fichero y rechazar no.

**Files:**
- Modify: `CLAUDE.md` (sección «La consola web»), `docs/DECISIONES.md` (entrada nueva al final)

**Acceptance Criteria:**
- [ ] `CLAUDE.md` tiene un párrafo «La sesión remota» con: interruptor apagado por omisión (`settings.remoto`, `XONECODE_REMOTO`), `import()` dinámico solo en `agent/remoto/puenteWebSocket.ts`, un sumidero por móvil por `engancharCliente`/`soltarCliente`, las listas blancas de `core/remoto.ts` y la `url` como segundo secreto del cable. Sin cifras ni fechas (lo vigila `src/documentacion.test.ts`).
- [ ] `docs/DECISIONES.md` tiene la entrada con el resultado de la prueba cruzada.
- [ ] Prueba cruzada: con `xonecode-server` levantado en local (plan 1, Task 10) y el paquete enlazado (`npm link`), una sesión en AppDemo con el interruptor encendido; desde el viewport de móvil (Playwright o el teléfono): la cabecera enseña el proyecto, aceptar una escritura deja el fichero cambiado en disco, y rechazar otra la deja sin escribir.
- [ ] `FORCE_COLOR=0 npx vitest run --maxWorkers=2` (suite entera) en verde.

**Verify:** `FORCE_COLOR=0 npx vitest run src/documentacion.test.ts && FORCE_COLOR=0 npx vitest run --maxWorkers=2` → todo en verde; y la prueba cruzada anotada en `docs/DECISIONES.md` con lo observado.

**Steps:**

- [ ] **Step 1: `CLAUDE.md`**

En la sección «La consola web», añadir:
```markdown
- **La sesión remota (EXPERIMENTAL, detrás de un interruptor)** (`web/servidor/puenteRemoto.ts`, `core/remoto.ts`,
  `agent/remoto/puenteWebSocket.ts`; el puente y la web móvil viven en `xonecode-server`). Apagada por omisión:
  `settings.remoto.habilitado` o `XONECODE_REMOTO=1`; apagada no se anuncia, no se atiende y **no se carga el paquete**
  `@xone/xonecode-remoto`, que entra por `import()` dinámico en UN fichero y no es dependencia de xonecode. **Cada móvil
  es un sumidero más** enganchado por la MISMA puerta que una pestaña (`engancharCliente`/`soltarCliente`): misma ráfaga,
  se muda con el foco, cuenta como «hay alguien delante». Lo que sale pasa `filtrarSalida` (el `alta` sale TRANSFORMADO
  en `remoto.estado`) y lo que entra, `validarEntradaDelMovil`, y se despacha por `cancelarTurno`/`recibirEnLaConsola`,
  el código de `POST /accion`. La `url` con el secreto en el fragmento es el segundo secreto del cable, junto a
  `leerSecreto`. **Límite declarado**: quien tiene la URL controla la sesión hasta «Revocar» o «Apagar».
```

- [ ] **Step 2: La prueba cruzada**

1. En `xonecode-server`: `npm run build && PUERTO=8787 npm start -w servidor` y `npm link -w @xone/xonecode-remoto`.
2. En `xonecode`: `npm link @xone/xonecode-remoto` y en `~/.xonecode/settings.json` `"remoto": { "habilitado": true, "servidor": "ws://127.0.0.1:8787/ws" }`.
3. `npm run web`, abrir AppDemo, pulsar «Sesión remota», copiar la URL.
4. Con Playwright (viewport iPhone 13) o el móvil en la misma red (en ese caso, servidor con `HOST=0.0.0.0` y la URL con la IP del portátil): abrir la URL, comprobar «AppDemo · <sesión>» en la cabecera.
5. Desde el móvil, en modo supervisado: «crea el fichero `prueba-remota.txt` con el texto hola». Aceptar → comprobar `cat ~/.xonecode/workspace/webstudio/AppDemo/prueba-remota.txt` = `hola`.
6. Pedir «crea `prueba-remota-2.txt`» y Rechazar → comprobar que el fichero NO existe.
7. Borrar después lo creado y la sesión de prueba (con las funciones del servidor: `borrarSesion`, `olvidarSesion`, `olvidarMemoriaDeHilo`).

- [ ] **Step 3: `docs/DECISIONES.md`**

Añadir al final una entrada `## La sesión remota: el lado de xonecode (fecha)` con: el porqué del interruptor y el `import()` dinámico (seguir publicando releases), por qué cada móvil es un sumidero de la misma puerta que una pestaña, por qué el `alta` sale transformado, y **lo observado** en la prueba cruzada (pasos 4–6, con lo que se vio).

- [ ] **Step 4: Comprobar y commit**

Run: `FORCE_COLOR=0 npx vitest run src/documentacion.test.ts && FORCE_COLOR=0 npx vitest run --maxWorkers=2`
Expected: todo en verde.

```bash
git add CLAUDE.md docs/DECISIONES.md
git commit -m "docs(remoto): la sesión remota en CLAUDE.md y la prueba cruzada en DECISIONES

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["CLAUDE.md", "docs/DECISIONES.md"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/documentacion.test.ts && FORCE_COLOR=0 npx vitest run --maxWorkers=2", "acceptanceCriteria": ["CLAUDE.md con el párrafo de la sesión remota, sin cifras ni fechas", "DECISIONES.md con la prueba cruzada observada", "prueba cruzada: aceptar desde el móvil escribe prueba-remota.txt; rechazar no escribe prueba-remota-2.txt", "suite entera en verde"], "modelTier": "standard"}
```

---

## Cobertura del spec (lado de xonecode)

| Spec | Task |
|---|---|
| §1 Puerto con doble, WebSocket de Node 22, paquete en UN adaptador | 3, 6 |
| §2 El puente como sumidero; seguir el foco | 3, 4, 5 |
| §2 Lista blanca de salida (y `alta` → `remoto.estado`) | 2, 5 |
| §2 Lista blanca de entrada por el despachador de `POST /accion` | 2, 4, 5 |
| §2 Un móvil nuevo recibe el estado entero | 5 (ráfaga de `adjuntar` por `engancharCliente`) |
| §2 Preguntas del agente (`consulta` → `prosa`) y de la consola (`pregunta` → `respuesta`), aprobación con `decision` | 2 |
| §3 Mensaje `remoto`, diálogo, QR, revocar, apagar, cierre ordenado | 5, 7 |
| §3 Reconexión a la misma sala | 6 |
| §4 Pruebas: listas, reemisión, foco, despachador real | 2, 3, 5 |
| §4 De punta a punta junto con `xonecode-server` | 8 |
| §5 Interruptor, sin dependencia, test de frontera | 1, 5, 6 |
