# Cancelación real de `execute` en TrueForge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cancelar un turno de TrueForge mientras la tool `execute` tiene un comando en
marcha mate el árbol de procesos entero (no solo el hijo inmediato) y libere el turno, en
POSIX y en Windows.

**Architecture:** Un ejecutor propio (`crearExecuteCancelable`) sustituye el `execute` de
`LocalShellBackend` (deepagents) por sustitución de la propiedad de instancia, sin
subclasificar. Un `matarGrupoReal` compartido con `agent/dispositivos/procesosEnMaquina.ts`
mata el árbol en las dos plataformas (grupo POSIX / `taskkill /T /F` en Windows). La señal de
cancelación viaja desde `sesionTrueforge.ts` con el mismo patrón de getter
(`() => aborto?.signal`) que ya usa para el modelo.

**Tech Stack:** TypeScript, Node `child_process`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-cancelacion-de-execute-design.md`

## Global Constraints

- **Solo TrueForge.** `deepagents` no se toca: su `createExecuteTool` no reenvía ninguna señal
  y no hay forma de dársela sin patchear la librería — decisión explícita del usuario.
  `deepagents` SÍ recibe la mejora del kill-de-árbol al vencer el timeout, porque comparte el
  mismo backend, pero sin cancelación interactiva.
- **No se toca el script `xone-desplegar-android`** (`skills/xone-hotswap/scripts/`): matar el
  árbol desde arriba se lleva por delante a `adb` y corta el `fetch` en marcha.
- **Formato de salida de `execute` IGUAL al de deepagents**, salvo dos exit codes nuevos: 124
  = venció el timeout (igual que antes), 130 = lo canceló la señal del turno.
- **`matarGrupoReal` es la ÚNICA función que decide cómo se mata un árbol de procesos** —
  compartida entre `agent/dispositivos/procesosEnMaquina.ts` y el ejecutor nuevo. Ningún otro
  sitio implementa su propia lógica de matar un grupo.
- **`procesosEnMaquina.test.ts` NO lanza procesos reales** (invariante declarado en su propia
  cabecera). El único test con procesos reales de este plan vive en un fichero NUEVO y con
  nombre que lo diga.

**User decisions (already made):**
- Motor: solo TrueForge; `deepagents` queda fuera de la señal de cancelación (chat).
- Compartir `matarGrupoReal` con `agent/dispositivos/procesosEnMaquina.ts` y arreglar de paso
  su hueco de Windows (chat).
- Exit code de cancelación: 130, distinto de 124 (timeout) (chat).
- Reparto de tests: lógica con dobles + UN test de integración con procesos reales en fichero
  propio, con el límite de Windows declarado y no cerrado sin máquina real (chat).

---

## Task 1: `matarGrupoReal` — compartida, con Windows de verdad

**Goal:** Una función exportada que mata un árbol de procesos por PID, con una rama Windows
real (hoy inexistente: `crearEjecutor` cae en silencio a matar solo el hijo en Windows).

**Files:**
- Modify: `src/agent/dispositivos/procesosEnMaquina.ts`
- Test: `src/agent/dispositivos/procesosEnMaquina.test.ts`

**Acceptance Criteria:**
- [ ] `matarGrupoReal(pid, senal, opciones?)` exportada desde `procesosEnMaquina.ts`.
- [ ] En POSIX (`plataforma !== "win32"`), sigue llamando `process.kill(-pid, senal)` — mismo
      comportamiento de siempre, nada cambia para quien ya lo usaba.
- [ ] En `win32`, llama `taskkill /PID <pid> /T /F` y NUNCA `process.kill`.
- [ ] `crearEjecutor` usa `matarGrupoReal` como valor por omisión de `matarGrupo` (en vez del
      arrow inline `process.kill(-pid, …)` que tiene hoy).
- [ ] Los tests existentes de `crearEjecutor` (que inyectan su propio `matarGrupo`) siguen en
      verde sin tocarlos.

**Verify:** `npx vitest run src/agent/dispositivos/procesosEnMaquina.test.ts` → todo verde.

**Steps:**

- [ ] **Step 1: Escribe el test que falla — la rama Windows de `matarGrupoReal`**

Añade al final de `src/agent/dispositivos/procesosEnMaquina.test.ts`, después del último
`describe` del fichero (después de `describe("necesitaShell", …)`):

```ts
describe("matarGrupoReal: la rama de Windows, por invocación (no hay Windows en CI)", () => {
  it("en win32 llama a taskkill /PID <pid> /T /F, y NUNCA a process.kill", () => {
    const llamadas: string[][] = [];
    matarGrupoReal(4321, "SIGKILL", {
      plataforma: "win32",
      taskkill: (args) => void llamadas.push(args),
    });
    expect(llamadas).toEqual([["/PID", "4321", "/T", "/F"]]);
  });
});
```

Y añade `matarGrupoReal` al import existente de `./procesosEnMaquina.js` en la cabecera del
test (junto a `crearEjecutor`, `motivoDelCodigo`, etc.).

- [ ] **Step 2: Corre el test y comprueba que falla**

Run: `npx vitest run src/agent/dispositivos/procesosEnMaquina.test.ts -t "matarGrupoReal"`
Expected: FAIL — `matarGrupoReal is not a function` (o error de tipos: no existe el export).

- [ ] **Step 3: Implementa `matarGrupoReal`**

En `src/agent/dispositivos/procesosEnMaquina.ts`, cambia el import de la cabecera:

```ts
import { execFileSync, spawn } from "node:child_process";
```

Y añade la función exportada, antes de `export function crearEjecutor(...)`:

```ts
/**
 * Mata un árbol de procesos por PID, en las DOS plataformas. Es la ÚNICA función que decide
 * CUÁNDO y CÓMO se mata un árbol — la comparte `agent/grafo/ejecucionCancelable.ts`.
 *
 * En Windows no hay grupos de proceso POSIX ni `SIGTERM`/`SIGKILL` de verdad: `taskkill /T`
 * recorre el árbol real por PID (no depende de `detached`) y `/F` es el único modo forzoso
 * que hay — no existe un equivalente "amable".
 *
 * `plataforma`/`taskkill` inyectables por lo de siempre: un test en macOS/Linux no puede
 * ejecutar `taskkill` de verdad, pero sí puede comprobar que se construye la invocación
 * correcta.
 */
export function matarGrupoReal(
  pid: number,
  senal: string,
  opciones: { plataforma?: NodeJS.Platform; taskkill?: (args: string[]) => void } = {}
): void {
  const plataforma = opciones.plataforma ?? process.platform;
  if (plataforma === "win32") {
    const taskkill = opciones.taskkill ?? ((args: string[]) => void execFileSync("taskkill", args, { stdio: "ignore" }));
    taskkill(["/PID", String(pid), "/T", "/F"]);
    return;
  }
  process.kill(-pid, senal as NodeJS.Signals);
}
```

Y en `crearEjecutor`, sustituye la línea:

```ts
const matarGrupo = deps.matarGrupo ?? ((pid: number, senal: string) => void process.kill(-pid, senal as NodeJS.Signals));
```

por:

```ts
const matarGrupo = deps.matarGrupo ?? ((pid: number, senal: string) => matarGrupoReal(pid, senal));
```

- [ ] **Step 4: Corre el test y comprueba que pasa**

Run: `npx vitest run src/agent/dispositivos/procesosEnMaquina.test.ts`
Expected: PASS — todos los tests del fichero, incluido el nuevo.

- [ ] **Step 5: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add src/agent/dispositivos/procesosEnMaquina.ts src/agent/dispositivos/procesosEnMaquina.test.ts
git commit -m "feat(dispositivos): matarGrupoReal compartida, con Windows de verdad (taskkill /T /F)"
```

---

## Task 2: El test de integración con procesos reales (única excepción nombrada)

**Goal:** Probar de verdad, con procesos del sistema operativo reales, que `matarGrupoReal`
mata un hijo Y su nieto — la única forma de comprobar que el kill de árbol funciona de verdad
y no solo que se invocó.

**Depende de:** Task 1 (usa `matarGrupoReal`).

**Nota para quien lo ejecute:** este test rompe a propósito el invariante "no se lanza un
proceso de verdad" que `procesosEnMaquina.test.ts` declara en su cabecera. Por eso vive en un
fichero SEPARADO y con el nombre que lo dice — no lo metas dentro de
`procesosEnMaquina.test.ts`. Es mecánico (el código ya está aquí completo) pero delicado: si
el temporizador de espera es demasiado corto, el test puede dar un falso negativo en una
máquina de CI lenta — sube el margen antes de tocar la lógica si eso pasa.

**Files:**
- Create: `src/agent/dispositivos/matarGrupoReal.integracion.test.ts`

**Acceptance Criteria:**
- [ ] Lanza un proceso real (`sh -c "sleep 30 & echo $! ; wait"`, `detached: true`) que a su
      vez lanza un nieto real (`sleep`).
- [ ] Llama `matarGrupoReal(pid, "SIGKILL")` de verdad (sin inyectar nada, plataforma real).
- [ ] Comprueba que TANTO el proceso lanzado como su nieto (`sleep`) están muertos en menos de
      un segundo tras la llamada.
- [ ] Solo corre en POSIX: en Windows (`process.platform === "win32"`) el test se salta con
      `it.skipIf`, con un comentario que dice por qué (no hay Windows en CI, y ejecutar
      `taskkill` de verdad ahí es justo el límite declarado en la spec).

**Verify:** `npx vitest run src/agent/dispositivos/matarGrupoReal.integracion.test.ts` → PASS
en macOS/Linux (se salta en Windows).

**Steps:**

- [ ] **Step 1: Escribe el test completo (no hay "escribir el test que falla" por separado
      aquí: es un fichero nuevo, así que el primer paso YA es el test entero)**

```ts
/**
 * LA ÚNICA excepción nombrada al invariante de `procesosEnMaquina.test.ts` ("no se lanza un
 * proceso de verdad"). Vive aparte, con el nombre que lo dice: lo que prueba —que matar el
 * GRUPO se lleva también al nieto— no se puede comprobar con un `EventEmitter` de mentira, y
 * es justo el hecho que un fallo aquí revela: un `child.kill()` normal deja vivo al nieto.
 */
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { matarGrupoReal } from "./procesosEnMaquina.js";

/** ¿Sigue vivo ese pid? `process.kill(pid, 0)` no manda ninguna señal: solo pregunta. */
function vivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function esperar(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe("matarGrupoReal: mata al HIJO y al NIETO, de verdad", () => {
  it.skipIf(process.platform === "win32")(
    "un `sleep` lanzado por un `sh` intermedio muere con su padre al matar el GRUPO",
    async () => {
      // `echo $!` imprime el pid del `sleep` de fondo (el NIETO de este proceso de test):
      // así el test conoce los dos pids sin adivinar nada del sistema.
      const hijo = spawn("sh", ["-c", "sleep 30 & echo $!; wait"], {
        detached: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const pidDelHijo = hijo.pid;
      expect(pidDelHijo).toBeDefined();

      const pidDelNieto = await new Promise<number>((resolver) => {
        let salida = "";
        hijo.stdout!.on("data", (d) => {
          salida += String(d);
          const n = Number(salida.trim());
          if (Number.isInteger(n) && n > 0) resolver(n);
        });
      });

      expect(vivo(pidDelNieto)).toBe(true);

      matarGrupoReal(pidDelHijo!, "SIGKILL");
      await esperar(300);

      expect(vivo(pidDelHijo!)).toBe(false);
      expect(vivo(pidDelNieto)).toBe(false);
    },
    10_000
  );
});
```

- [ ] **Step 2: Corre el test**

Run: `npx vitest run src/agent/dispositivos/matarGrupoReal.integracion.test.ts`
Expected: PASS en macOS/Linux. Si falla por timing (el nieto seguía vivo a los 300ms en una
máquina muy cargada), sube el `esperar(300)` a `esperar(800)` antes de tocar
`matarGrupoReal` — el fallo es del margen de espera, no de la función.

- [ ] **Step 3: Comprueba que el suite entero lo recoge**

Run: `npx vitest run --maxWorkers=2 2>&1 | tail -5`
Expected: el conteo de ficheros sube en uno respecto a antes de este task.

- [ ] **Step 4: Commit**

```bash
git add src/agent/dispositivos/matarGrupoReal.integracion.test.ts
git commit -m "test(dispositivos): la única excepción con procesos reales — matar el grupo se lleva al nieto"
```

---

## Task 3: `crearExecuteCancelable` — el ejecutor nuevo para TrueForge

**Goal:** Un reemplazo completo de `LocalShellBackend.execute` que acepta una `AbortSignal`,
mata el ÁRBOL (no solo el hijo) al vencer el timeout o al cancelar, y mantiene el mismo
formato de salida que la librería.

**Files:**
- Create: `src/agent/grafo/ejecucionCancelable.ts`
- Test: `src/agent/grafo/ejecucionCancelable.test.ts`

**Acceptance Criteria:**
- [ ] `crearExecuteCancelable(opciones, deps?)` devuelve `(comando, senal?) => Promise<ResultadoDeEjecucion>`.
- [ ] Al abortar la señal, llama `matarGrupo(pid, "SIGKILL")` — nunca `hijo.kill()` a secas
      (salvo sin pid).
- [ ] Al vencer `timeoutS`, hace lo mismo.
- [ ] Exit code 130 al cancelar, 124 al vencer el timeout — nunca el mismo código para los dos.
- [ ] Sin pid (o si `matarGrupo` lanza), cae a `hijo.kill(senal)`.
- [ ] El formato de una ejecución normal (sin cancelar, sin timeout) reproduce EXACTAMENTE el
      de la librería: stdout+stderr con prefijo `[stderr]`, `<no output>` si no hay nada,
      `Exit code: N` añadido si el código no es 0, truncado a 100 KB con nota.
- [ ] `lanzarReal` usa `spawn(comando, { shell: true, detached: true, env, cwd })` — con
      `detached: true`, que `LocalShellBackend.execute` de la librería NO pone (la causa raíz
      del bug).

**Verify:** `npx vitest run src/agent/grafo/ejecucionCancelable.test.ts` → todo verde.

**Steps:**

- [ ] **Step 1: Escribe el fichero de test completo, contra un módulo que aún no existe**

```ts
/**
 * `crearExecuteCancelable`, con TODOS los efectos doblados — mismo estilo que
 * `agent/dispositivos/procesosEnMaquina.test.ts`: el único "hijo" es un `EventEmitter`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { crearExecuteCancelable, type LanzarShell } from "./ejecucionCancelable.js";

function hijoFalso(pid?: number) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const sucesos = new EventEmitter();
  let matado: string | undefined;
  const hijo = {
    pid,
    stdout,
    stderr,
    on: (evento: string, cb: (...a: unknown[]) => void) => void sucesos.on(evento, cb),
    kill: (senal?: string) => {
      matado = senal ?? "SIGTERM";
      return true;
    },
  };
  return {
    hijo,
    get matado() {
      return matado;
    },
    salida: (t: string) => stdout.emit("data", Buffer.from(t)),
    error: (t: string) => stderr.emit("data", Buffer.from(t)),
    cerrar: (c: number | null) => sucesos.emit("close", c),
  };
}

function lanzador(pid?: number) {
  const hijos: ReturnType<typeof hijoFalso>[] = [];
  const lanzar: LanzarShell = (comando, opciones) => {
    void comando;
    void opciones;
    const h = hijoFalso(pid);
    hijos.push(h);
    return h.hijo;
  };
  return { hijos, lanzar };
}

afterEach(() => vi.useRealTimers());

describe("crearExecuteCancelable", () => {
  it("al abortar la señal, mata el GRUPO con SIGKILL — nunca `hijo.kill()` a secas", async () => {
    const l = lanzador(4321);
    const grupos: { pid: number; senal: string }[] = [];
    const ejecutar = crearExecuteCancelable(
      { env: {}, cwd: "/tmp", timeoutS: 600 },
      { lanzar: l.lanzar, matarGrupo: (pid, senal) => void grupos.push({ pid, senal }) }
    );
    const control = new AbortController();
    const fin = ejecutar("sleep 100", control.signal);
    control.abort();
    expect(grupos).toEqual([{ pid: 4321, senal: "SIGKILL" }]);
    expect(l.hijos[0]!.matado).toBeUndefined();
    l.hijos[0]!.cerrar(null);
    await expect(fin).resolves.toEqual({ output: "Error: Command cancelled.", exitCode: 130, truncated: false });
  });

  it("al vencer el timeout, mata el GRUPO con SIGKILL — no SIGTERM al hijo solo", async () => {
    vi.useFakeTimers();
    const l = lanzador(555);
    const grupos: { pid: number; senal: string }[] = [];
    const ejecutar = crearExecuteCancelable(
      { env: {}, cwd: "/tmp", timeoutS: 1 },
      { lanzar: l.lanzar, matarGrupo: (pid, senal) => void grupos.push({ pid, senal }) }
    );
    const fin = ejecutar("sleep 100");
    vi.advanceTimersByTime(1000);
    expect(grupos).toEqual([{ pid: 555, senal: "SIGKILL" }]);
    vi.useRealTimers();
    l.hijos[0]!.cerrar(null);
    await expect(fin).resolves.toEqual({
      output: "Error: Command timed out after 1.0 seconds.",
      exitCode: 124,
      truncated: false,
    });
  });

  it("sin pid —o con el grupo ya ido— se cae a matar al hijo", async () => {
    const l = lanzador();
    const ejecutar = crearExecuteCancelable(
      { env: {}, cwd: "/tmp", timeoutS: 600 },
      {
        lanzar: l.lanzar,
        matarGrupo: () => {
          throw new Error("no debería llamarse sin pid");
        },
      }
    );
    const control = new AbortController();
    const fin = ejecutar("sleep 100", control.signal);
    control.abort();
    expect(l.hijos[0]!.matado).toBe("SIGKILL");
    l.hijos[0]!.cerrar(null);
    await expect(fin).resolves.toEqual({ output: "Error: Command cancelled.", exitCode: 130, truncated: false });
  });

  it("sin abortar y sin vencer el timeout, el formato de salida es el mismo que daba deepagents", async () => {
    const l = lanzador();
    const ejecutar = crearExecuteCancelable({ env: {}, cwd: "/tmp", timeoutS: 600 }, { lanzar: l.lanzar });
    const fin = ejecutar("echo hola");
    l.hijos[0]!.salida("hola\n");
    l.hijos[0]!.error("un aviso\n");
    l.hijos[0]!.cerrar(0);
    await expect(fin).resolves.toEqual({ output: "hola\n\n[stderr] un aviso", exitCode: 0, truncated: false });
  });

  it("un código distinto de cero añade «Exit code: N» al final", async () => {
    const l = lanzador();
    const ejecutar = crearExecuteCancelable({ env: {}, cwd: "/tmp", timeoutS: 600 }, { lanzar: l.lanzar });
    const fin = ejecutar("false");
    l.hijos[0]!.cerrar(1);
    await expect(fin).resolves.toEqual({ output: "<no output>\n\nExit code: 1", exitCode: 1, truncated: false });
  });

  it("un comando vacío no llega a lanzar nada", async () => {
    const l = lanzador();
    const ejecutar = crearExecuteCancelable({ env: {}, cwd: "/tmp", timeoutS: 600 }, { lanzar: l.lanzar });
    await expect(ejecutar("")).resolves.toEqual({
      output: "Error: Command must be a non-empty string.",
      exitCode: 1,
      truncated: false,
    });
    expect(l.hijos).toEqual([]);
  });
});
```

- [ ] **Step 2: Corre el test y comprueba que falla**

Run: `npx vitest run src/agent/grafo/ejecucionCancelable.test.ts`
Expected: FAIL — no se encuentra el módulo `./ejecucionCancelable.js`.

- [ ] **Step 3: Implementa `crearExecuteCancelable`**

Crea `src/agent/grafo/ejecucionCancelable.ts`:

```ts
/**
 * El `execute` de deepagents, reescrito. La librería (`LocalShellBackend.execute`) mata solo
 * al hijo INMEDIATO al vencer su timeout (un nieto sobrevive) y no acepta ninguna señal de
 * cancelación — ver el porqué medido en
 * `docs/superpowers/specs/2026-09-25-cancelacion-de-execute-design.md`.
 *
 * Sustituye a `LocalShellBackend.execute` ENTERO: mismo formato de salida, más
 * `detached: true` + `matarGrupoReal` (mata el ÁRBOL) y una `AbortSignal` opcional.
 *
 * Dos exit codes que la librería no distinguía: **124** si venció el timeout (igual que
 * ella), **130** si lo canceló la señal (128+SIGINT, convención de shell para
 * "interrumpido") — el modelo puede distinguir "me quedé sin tiempo" de "me cancelaron".
 */
import { spawn } from "node:child_process";
import { matarGrupoReal } from "../dispositivos/procesosEnMaquina.js";

export interface ResultadoDeEjecucion {
  output: string;
  exitCode: number | null;
  truncated: boolean;
}

/** El hijo, visto por este módulo — sin `stdin`, que `execute` nunca teclea. */
interface ProcesoDeShell {
  pid?: number;
  stdout: { on: (evento: "data", cb: (dato: unknown) => void) => void };
  stderr: { on: (evento: "data", cb: (dato: unknown) => void) => void };
  on: (evento: "close" | "error", cb: (...args: never[]) => void) => void;
  kill: (senal?: string) => boolean;
}

export type LanzarShell = (
  comando: string,
  opciones: { env: Record<string, string>; cwd: string }
) => ProcesoDeShell;

/**
 * **`detached: true` no es cosmético: es la causa raíz.** Sin él, el hijo comparte el grupo
 * de proceso de xonecode entero, y `process.kill(-pid)` (dentro de `matarGrupoReal`) mataría
 * ESE grupo — el propio xonecode incluido. `LocalShellBackend.execute` de la librería no lo
 * pone, y por eso su `child.kill()` solo alcanza al hijo inmediato.
 */
export const lanzarReal: LanzarShell = (comando, opciones) =>
  spawn(comando, { shell: true, env: opciones.env, cwd: opciones.cwd, detached: true }) as unknown as ProcesoDeShell;

const TOPE_DE_SALIDA_BYTES = 100_000;

export function crearExecuteCancelable(
  opciones: { env: Record<string, string>; cwd: string; timeoutS: number; maxOutputBytes?: number },
  deps: { lanzar?: LanzarShell; matarGrupo?: (pid: number, senal: string) => void } = {}
): (comando: string, senal?: AbortSignal) => Promise<ResultadoDeEjecucion> {
  const lanzar = deps.lanzar ?? lanzarReal;
  const matarGrupo = deps.matarGrupo ?? ((pid: number, senal: string) => matarGrupoReal(pid, senal));
  const maxOutputBytes = opciones.maxOutputBytes ?? TOPE_DE_SALIDA_BYTES;

  return (comando: string, senal?: AbortSignal): Promise<ResultadoDeEjecucion> => {
    if (!comando || typeof comando !== "string") {
      return Promise.resolve({ output: "Error: Command must be a non-empty string.", exitCode: 1, truncated: false });
    }

    return new Promise<ResultadoDeEjecucion>((resolver) => {
      const hijo = lanzar(comando, { env: opciones.env, cwd: opciones.cwd });
      let stdout = "";
      let stderr = "";
      let causa: "timeout" | "cancelado" | undefined;

      const matar = (senalOS: string): void => {
        const pid = hijo.pid;
        if (pid !== undefined) {
          try {
            matarGrupo(pid, senalOS);
            return;
          } catch {
            // El grupo ya no está o el sistema no deja: se intenta con el hijo.
          }
        }
        hijo.kill(senalOS);
      };

      const timer = setTimeout(() => {
        causa = "timeout";
        matar("SIGKILL");
      }, opciones.timeoutS * 1000);

      const alAbortar = (): void => {
        causa = "cancelado";
        matar("SIGKILL");
      };
      senal?.addEventListener("abort", alAbortar, { once: true });

      hijo.stdout.on("data", (dato) => void (stdout += String(dato)));
      hijo.stderr.on("data", (dato) => void (stderr += String(dato)));

      hijo.on("error", ((error: Error) => {
        clearTimeout(timer);
        senal?.removeEventListener("abort", alAbortar);
        resolver({ output: `Error executing command: ${error.message}`, exitCode: 1, truncated: false });
      }) as never);

      hijo.on("close", ((codigo: number | null) => {
        clearTimeout(timer);
        senal?.removeEventListener("abort", alAbortar);
        if (causa === "cancelado") {
          resolver({ output: "Error: Command cancelled.", exitCode: 130, truncated: false });
          return;
        }
        if (causa === "timeout") {
          resolver({
            output: `Error: Command timed out after ${opciones.timeoutS.toFixed(1)} seconds.`,
            exitCode: 124,
            truncated: false,
          });
          return;
        }
        const partes: string[] = [];
        if (stdout) partes.push(stdout);
        if (stderr) partes.push(...stderr.trim().split("\n").map((l) => `[stderr] ${l}`));
        let salida = partes.length > 0 ? partes.join("\n") : "<no output>";
        let truncado = false;
        if (salida.length > maxOutputBytes) {
          salida = `${salida.slice(0, maxOutputBytes)}\n\n... Output truncated at ${maxOutputBytes} bytes.`;
          truncado = true;
        }
        const exitCode = codigo ?? 1;
        if (exitCode !== 0) salida = `${salida.trimEnd()}\n\nExit code: ${exitCode}`;
        resolver({ output: salida, exitCode, truncated: truncado });
      }) as never);
    });
  };
}
```

- [ ] **Step 4: Corre el test y comprueba que pasa**

Run: `npx vitest run src/agent/grafo/ejecucionCancelable.test.ts`
Expected: PASS — los seis tests.

- [ ] **Step 5: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add src/agent/grafo/ejecucionCancelable.ts src/agent/grafo/ejecucionCancelable.test.ts
git commit -m "feat(grafo): crearExecuteCancelable — sustituto de execute con árbol matable y señal"
```

---

## Task 4: `backendDelProyectoConShell` — sustituir `execute`, sin subclasificar

**Goal:** El backend que TrueForge (y deepagents) usa para el especialista con `ejecucion:
true` monta el `execute` nuevo en vez del de la librería.

**Depende de:** Task 3.

**Files:**
- Modify: `src/agent/grafo/proyecto.ts`
- Test: `src/agent/grafo/proyecto.test.ts`

**Acceptance Criteria:**
- [ ] `backendDelProyectoConShell(raiz, entorno, senalDelTurno?)` — tercer parámetro opcional.
- [ ] Sin `senalDelTurno`, el comportamiento observable es EXACTAMENTE el de antes (los tests
      YA existentes de este describe siguen en verde sin tocarlos).
- [ ] Con una `AbortSignal` que se aborta a mitad de un comando real y largo, `execute()`
      resuelve con `exitCode: 130`.
- [ ] `backendDeAgente`'s opción `ejecucion` acepta un `senal?: () => AbortSignal | undefined`
      y lo reenvía.

**Verify:** `npx vitest run src/agent/grafo/proyecto.test.ts` → todo verde.

**Steps:**

- [ ] **Step 1: Escribe los dos tests que fallan**

Añade dentro del describe `"la shell de un subagente con EJECUCIÓN"` (después del último `it`
de ese bloque, antes del `});` que lo cierra), en `src/agent/grafo/proyecto.test.ts`:

```ts
  it("sin señal del turno, sigue funcionando igual que antes (deepagents no se entera de nada)", async () => {
    const be = backendDelProyectoConShell(raizDePrueba(), {}) as unknown as {
      execute(c: string): Promise<{ output: string; exitCode: number | null }>;
    };
    const { output, exitCode } = await be.execute("echo sigue-vivo");
    expect(output.trim()).toBe("sigue-vivo");
    expect(exitCode).toBe(0);
  });

  it("con una señal que se aborta a mitad de un comando largo, el exitCode es 130", async () => {
    const control = new AbortController();
    const be = backendDelProyectoConShell(raizDePrueba(), {}, () => control.signal) as unknown as {
      execute(c: string): Promise<{ output: string; exitCode: number | null }>;
    };
    const fin = be.execute("sleep 5");
    setTimeout(() => control.abort(), 50);
    const { exitCode, output } = await fin;
    expect(exitCode).toBe(130);
    expect(output).toBe("Error: Command cancelled.");
  }, 10_000);
```

- [ ] **Step 2: Corre los tests y comprueba que fallan**

Run: `npx vitest run src/agent/grafo/proyecto.test.ts -t "señal del turno"`
Expected: el primero puede pasar por casualidad (mismo comportamiento de siempre); el segundo
FALLA — hoy `backendDelProyectoConShell` no acepta un tercer argumento y el comando tarda los
5 segundos enteros sin que nada lo cancele (o el test directamente cuelga hasta su propio
timeout de 10s con `exitCode: null`/`0`, nunca `130`).

- [ ] **Step 3: Implementa el cambio en `backendDelProyectoConShell` y `backendDeAgente`**

Añade el import al principio de `src/agent/grafo/proyecto.ts` (junto a los demás imports
locales, p. ej. cerca de `escriturasEnSerie`):

```ts
import { crearExecuteCancelable } from "./ejecucionCancelable.js";
```

Sustituye la función `backendDelProyectoConShell` entera:

```ts
export function backendDelProyectoConShell(
  raiz: string,
  entorno: Record<string, string>,
  /**
   * La señal del TURNO en curso, ya resuelta desde fuera (`sesionTrueforge.ts`). Ausente —el
   * caso de deepagents, que no la forwardea nunca— y `execute` se comporta exactamente como
   * antes: sin cancelación interactiva, pero YA con el kill de árbol al vencer el timeout.
   */
  senalDelTurno?: () => AbortSignal | undefined,
): FilesystemBackend {
  const backend = new LocalShellBackend({
    rootDir: raiz,
    virtualMode: true,
    env: entorno,
    timeout: TOPE_DE_COMANDO_S,
  });
  /**
   * Sustituye la propiedad `execute` de la INSTANCIA, no la subclasifica: `isSandboxBackend`
   * (deepagents) es un chequeo de FORMA (`typeof backend.execute === "function"`), y `execute`
   * es un método normal del prototipo — no hace falta acceder a ningún campo privado de la
   * librería. `backend.cwd` es un campo público de `FilesystemBackend`.
   */
  const ejecutar = crearExecuteCancelable({ env: entorno, cwd: backend.cwd, timeoutS: TOPE_DE_COMANDO_S });
  (backend as unknown as { execute: (comando: string) => ReturnType<typeof ejecutar> }).execute = (comando: string) =>
    ejecutar(comando, senalDelTurno?.());
  return backend;
}
```

Y en `backendDeAgente`, cambia el tipo del campo `ejecucion` (en la interfaz de opciones):

```ts
  ejecucion?: { entorno: Record<string, string>; senal?: () => AbortSignal | undefined };
```

Y la línea que construye `base`:

```ts
  const base =
    opciones.ejecucion === undefined
      ? backendDelProyecto(opciones.raiz)
      : backendDelProyectoConShell(opciones.raiz, opciones.ejecucion.entorno, opciones.ejecucion.senal);
```

- [ ] **Step 4: Corre los tests y comprueba que pasan**

Run: `npx vitest run src/agent/grafo/proyecto.test.ts`
Expected: PASS — el fichero entero, incluidos los dos tests nuevos y TODOS los que ya
existían en el describe de la shell (nada se rompe).

- [ ] **Step 5: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add src/agent/grafo/proyecto.ts src/agent/grafo/proyecto.test.ts
git commit -m "feat(grafo): backendDelProyectoConShell acepta la señal del turno y cancela de verdad"
```

---

## Task 5: Wiring en `sesionTrueforge.ts` — la señal llega desde el turno real

**Goal:** Que cancelar una sesión de TrueForge, con un `execute` real en marcha, libere el
turno rápido en vez de esperar a que el comando termine solo.

**Depende de:** Task 4.

**Files:**
- Modify: `src/agent/motores/trueforge/sesionTrueforge.ts`
- Test: `src/agent/motores/trueforge/sesionTrueforge.test.ts`

**Acceptance Criteria:**
- [ ] `conShell()` pasa `senal: () => aborto?.signal` a `montarBackend`, el MISMO patrón ya
      usado ahí mismo para `modeloParaTrueforge`.
- [ ] `montarBackend`'s parámetro `ejecucion` admite el campo `senal` en su tipo.
- [ ] Test de integración: un especialista con `ejecucion: true` (`device-controller`) lanza
      un comando real y largo (`sleep 5`); se cancela el turno a mitad; el turno se libera
      (rechaza) en bastante menos de los 5 segundos del comando — prueba que la cancelación
      llega al proceso real, no solo al grafo.

**Verify:** `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts` → todo verde.

**Steps:**

- [ ] **Step 1: Escribe el test que falla**

Añade, en `src/agent/motores/trueforge/sesionTrueforge.test.ts`, dentro de
`describe("una sesión con el motor TrueForge", …)`, cerca de los otros tests de
`device-controller`/`execute` (p. ej. justo después del test
`"el raíz DELEGA en el device-controller, que EJECUTA de verdad…"`):

```ts
  it("cancelar el turno mientras `execute` corre un comando largo LIBERA el turno rápido, sin esperar a que termine", async () => {
    const raiz = proyecto();
    const guiones = [
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "device-controller", input: "espera" }) }] })],
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "x1", name: "execute", args: JSON.stringify({ command: "sleep 5" }) }] })],
    ];
    const modelo = {
      bindTools: (tools: unknown[]) => {
        void tools;
        return modelo;
      },
      stream: async () => {
        const g = guiones.shift() ?? [new AIMessageChunk({ content: "" })];
        return (async function* () {
          for (const t of g) yield t;
        })();
      },
    };
    const m = { paraPapel: () => modelo, paraModelo: () => modelo, descripcion: () => ({}) } as unknown as ModelosPort;
    const s = await abrirSesionTrueforge({ raiz, modelos: m, entorno: ENTORNO, skills: CATALOGO });

    const empieza = Date.now();
    const turno = s.turno("espera", piel().p);
    // Deja que `sh -c "sleep 5"` arranque de verdad antes de cancelar.
    await new Promise((r) => setTimeout(r, 300));
    s.cancelar();
    await expect(turno).rejects.toThrow(/turno cancelado por el usuario/);
    expect(Date.now() - empieza).toBeLessThan(4000);
  }, 10_000);
```

- [ ] **Step 2: Corre el test y comprueba que falla**

Run: `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts -t "LIBERA el turno rápido"`
Expected: FAIL — hoy tarda los ~5000ms enteros (o más) porque `conShell()` no pasa ninguna
señal a `execute`, así que `Date.now() - empieza` supera los 4000ms del `expect`.

- [ ] **Step 3: Implementa el wiring**

En `src/agent/motores/trueforge/sesionTrueforge.ts`, cambia la anotación de tipo del
parámetro de `montarBackend` (busca `const montarBackend = (ejecucion?: { entorno: ...`):

```ts
  const montarBackend = (ejecucion?: { entorno: Record<string, string>; senal?: () => AbortSignal | undefined }) =>
    backendDeAgente({
      raiz,
      ficheros: ficherosDelProyecto(raiz),
      ...(opciones.artefactos === undefined
        ? {}
        : { artefactos: { carpeta: opciones.artefactos, alEscribir: anotarArtefacto } }),
      ...(ejecucion === undefined ? {} : { ejecucion }),
    });
```

Y en `conShell` (dentro de `crearHijo`, busca `conShell: () =>`):

```ts
      conShell: () =>
        montarBackend({
          entorno: entornoDeLaShellDelProyecto(raiz, opciones.artefactos),
          // El MISMO patrón que ya usa `modeloParaTrueforge` un poco más arriba en este
          // fichero: un getter que se reevalúa en cada llamada, así siempre lee el
          // `AbortController` de la RONDA en curso y no uno capturado al construir.
          senal: () => aborto?.signal,
        }) as unknown as {
          execute(c: string): unknown;
          write(ruta: string, contenido: string): unknown;
        },
```

- [ ] **Step 4: Corre el test y comprueba que pasa**

Run: `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts -t "LIBERA el turno rápido"`
Expected: PASS — se libera en bien menos de 4 segundos.

- [ ] **Step 5: Corre el fichero entero (que nada se rompió al lado)**

Run: `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts`
Expected: PASS — el fichero entero.

- [ ] **Step 6: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add src/agent/motores/trueforge/sesionTrueforge.ts src/agent/motores/trueforge/sesionTrueforge.test.ts
git commit -m "feat(trueforge): la señal del turno llega hasta execute — cancelar libera de verdad"
```

---

## Task 6: Verificación final del suite completo

**Goal:** Confirmar que nada del resto del proyecto se rompió con estos cinco cambios.

**Depende de:** Tasks 1-5.

**Files:** ninguno (solo verificación).

**Acceptance Criteria:**
- [ ] `npm test -- --maxWorkers=2` — todo el suite en verde, ni un test menos que antes.
- [ ] `npm run typecheck` — limpio (host y cliente).

**Verify:**

```bash
npm test -- --maxWorkers=2
npm run typecheck
```

Expected: ambos comandos terminan en 0, sin fallos ni avisos de tipos nuevos.

**Steps:**

- [ ] **Step 1: Suite completo**

Run: `npm test -- --maxWorkers=2`
Expected: `Test Files N passed`, `Tests M passed` — sin ningún `failed`.

- [ ] **Step 2: Typecheck completo**

Run: `npm run typecheck`
Expected: termina sin imprimir errores (silencioso = bien, es el patrón de este repo).

- [ ] **Step 3: Si algo falla, NO se marca esta tarea como hecha.** Vuelve a la tarea (1-5)
      cuyo fichero aparece en el fallo, arréglalo con TDD (test que reproduzca el fallo
      primero) y repite este Task 6 desde el Step 1.
