# Cancelación real de `execute` en TrueForge (IXCODE-5)

El "Cancelar" de una consola aborta el `AbortController` del grafo, y eso para el STREAM del
turno — pero nunca llega al proceso que la tool `execute` lanzó. En Windows eso se nota mucho
más: el hotswap encadena `cmd.exe → node xone-desplegar-android → adb`, y matar `cmd.exe` no
mata lo que cuelga de él. El turno se queda esperando una tool que no se puede cancelar, y el
proyecto queda "ocupado" sin que nadie pueda soltarlo — mientras otros proyectos, con sesiones
independientes, siguen funcionando con normalidad (no es un bloqueo global del proceso Node).

## Alcance

**Solo TrueForge** (el motor por omisión). Su tool `execute` es código de xonecode
(`toolsDeFichero.ts#fuenteDeEjecucion`), así que controlamos la llamada entera.

**`deepagents` se queda fuera, a propósito.** Verificado: su `createExecuteTool` interno llama
`resolvedBackend.execute(input.command)` con un solo argumento — tira lo que LangGraph le pasa
en `runtime`/`config`, así que aunque `backend.execute` aceptase una señal, la librería nunca se
la va a dar. Decisión del usuario: no perseguir esto ahora. Como efecto colateral SÍ recibe la
mejora del kill-de-árbol al vencer el timeout (ver más abajo), porque comparte el mismo backend
— pero sin cancelación interactiva, porque no hay señal que forwardear.

**No hace falta tocar el script de la skill** (`xone-hotswap/scripts/xone-desplegar-android`):
sus `execFileSync` de `adb` y su `fetch` sin `AbortSignal` mueren solos en cuanto se mata
correctamente el árbol desde arriba — el sistema operativo se lleva `adb` y corta el `fetch` en
marcha. Instrumentar cada paso interno sería redundante si el kill de arriba funciona.

## Por qué se cuelga: lo verificado contra el código real

`LocalShellBackend.execute(command)` (deepagents, `node_modules/deepagents/dist/src-gIoHrhh3.js`)
recibe UN solo parámetro. Dentro: `cp.spawn(command, { shell: true, env, cwd })` — sin
`detached`, sin grupo de proceso. El único timeout mata con `child.kill("SIGTERM")` al hijo
INMEDIATO, y la promesa solo resuelve en `close`, que en Node no dispara hasta que TODOS los
procesos que heredan esos stdio se cierran. Si un nieto (`adb`) sigue vivo, la promesa no
resuelve nunca — cancelación o no.

Esto ya estaba documentado como límite conocido en `agent/grafo/proyecto.ts`, junto a
`backendDelProyectoConShell`: "al vencer mata al HIJO (SIGTERM), no al grupo, así que un nieto
sobrevive". Lo nuevo de este análisis es la cadena completa en Windows y que matar `cmd.exe` no
garantiza matar sus descendientes (no hay job object).

El precedente de "matar el grupo, no el hijo" que ya existe en `agent/dispositivos/
procesosEnMaquina.ts` (con test, `detached:true` + `process.kill(-pid)`) **tampoco resuelve
Windows**: `process.kill(-pid)` es semántica POSIX pura, y en Windows revienta o no hace nada —
cae en silencio a matar solo al hijo, el mismo fallo. No había ningún ticket abierto para esto;
lo destapa este diseño.

## Diseño

### 1. `matarGrupoReal` — compartida entre dispositivos y `execute`

Vive en `agent/dispositivos/procesosEnMaquina.ts`, sustituye el `matarGrupo` por omisión de
`crearEjecutor`, y la usa también el ejecutor nuevo de la sección 3. Un solo sitio decide CUÁNDO
se mata un proceso, que es la regla que este módulo ya se puso a sí mismo.

```ts
export function matarGrupoReal(pid: number, senal: string, plataforma: NodeJS.Platform = process.platform): void {
  if (plataforma === "win32") {
    // taskkill no entiende señales POSIX: /T recorre el árbol de verdad por PID (no depende
    // de process group ni de "detached"), /F es el único modo — no hay un SIGTERM amable.
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  process.kill(-pid, senal as NodeJS.Signals);
}
```

`plataforma` inyectable (mismo patrón que `necesitaShell(binario, plataforma?)`, ya en el mismo
fichero): un test en macOS puede ejercitar la rama Windows verificando la INVOCACIÓN, sin poder
comprobar que `taskkill` mata algo de verdad.

**No es opcional**: para que `process.kill(-pid)` sea seguro, el hijo tiene que nacer con
`detached: true` (líder de su propio grupo — sin eso, `-pid` apuntaría al grupo del proceso de
xonecode entero). El `spawn` de la sección 3 lo controla directamente.

### 2. `backendDelProyectoConShell` — sustituir `execute`, no subclasificar

`isSandboxBackend` (deepagents) es un chequeo de FORMA: `typeof backend.execute === "function"
&& typeof backend.id === "string" && backend.id !== ""`. Y `execute` es un método normal del
prototipo — no depende de campos privados desde fuera, y `cwd` es un campo público de
`FilesystemBackend`. No hace falta subclasificar `LocalShellBackend` (con el riesgo de que sus
`#campos` privados no sean accesibles): basta con sustituir la propiedad `execute` de la
INSTANCIA.

```ts
export function backendDelProyectoConShell(
  raiz: string,
  entorno: Record<string, string>,
  senalDelTurno?: () => AbortSignal | undefined,
): FilesystemBackend {
  const backend = new LocalShellBackend({ rootDir: raiz, virtualMode: true, env: entorno, timeout: TOPE_DE_COMANDO_S });
  const ejecutar = crearExecuteCancelable({ env: entorno, cwd: backend.cwd, timeoutS: TOPE_DE_COMANDO_S });
  (backend as unknown as { execute: typeof ejecutar }).execute = (comando: string) =>
    ejecutar(comando, senalDelTurno?.());
  return backend;
}
```

Como este backend lo comparten los dos motores, `deepagents` recibe el kill-de-árbol al vencer
el timeout GRATIS (sin señal, porque no la forwardea — ver Alcance).

### 3. `crearExecuteCancelable` — el ejecutor nuevo

Nuevo fichero, `agent/grafo/ejecucionCancelable.ts`. Mismo estilo que `crearEjecutor`
(dispositivos): función con efectos inyectables (`lanzar`, `matarGrupo`), valores reales por
omisión.

```ts
export interface ResultadoDeEjecucion {
  output: string;
  exitCode: number | null;
  truncated: boolean;
}

export function crearExecuteCancelable(
  opciones: { env: Record<string, string>; cwd: string; timeoutS: number; maxOutputBytes?: number },
  deps: { lanzar?: Lanzar; matarGrupo?: (pid: number, senal: string) => void } = {}
): (command: string, senal?: AbortSignal) => Promise<ResultadoDeEjecucion> { /* … */ }

export const lanzarReal: Lanzar = (command, opciones) =>
  spawn(command, { shell: true, env: opciones.env, cwd: opciones.cwd, detached: true }) as unknown as ProcesoHijo;
```

Reglas:
- `spawn(comando, { shell: true, detached: true, env, cwd })` — la MISMA forma que la librería,
  más `detached` (que ella no pone, y es la causa raíz).
- Un `setTimeout(TOPE_DE_COMANDO_S)`: al vencer, `causa = "timeout"` y `matarGrupo(pid,
  "SIGKILL")`. Antes se moría con `SIGTERM` al hijo solo; ahora `SIGKILL` al árbol.
- `senal?.addEventListener("abort", …, { once: true })`: al abortar, `causa = "cancelado"` y
  el mismo `matarGrupo(pid, "SIGKILL")`.
- Formato de salida IGUAL al de la librería (para no cambiar lo que ve el modelo): stdout +
  stderr con prefijo `[stderr]`, truncado a 100 KB con nota, `"<no output>"` si no hay nada,
  `"\n\nExit code: N"` añadido si el código no es 0.
- Dos exit codes NUEVOS, distinguibles: **124** si venció el timeout (igual que la librería),
  **130** si lo canceló el usuario (128+SIGINT, convención de shell para "interrumpido") — el
  modelo puede distinguir "me quedé sin tiempo" de "me cancelaron" y no reintentar igual en los
  dos casos. Decisión del usuario, confirmada en el diseño.
- Sin `pid` (o si `matarGrupo` falla), cae a `hijo.kill(senal)` — el mismo trato de
  `procesosEnMaquina.ts`.

### 4. Wiring de la señal

`sesionTrueforge.ts` ya tiene el patrón `senal: () => aborto?.signal` — un getter que se
reevalúa en cada llamada, usado hoy para el modelo (`modeloParaTrueforge({ …, senal: () =>
aborto?.signal })`). Se reutiliza TAL CUAL, sin inventar un segundo mecanismo:

```
sesionTrueforge.ts: conShell: () => montarBackend({ entorno, senal: () => aborto?.signal })
  → montarBackend({ ejecucion: { entorno, senal } })
  → backendDeAgente({ …, ejecucion: { entorno, senal } })
  → backendDelProyectoConShell(raiz, entorno, senal)
```

`aborto` se reasigna una vez por RONDA (`sesionTrueforge.ts` línea ~776), y `conShell()` se
invoca al crear cada hijo (`crearHijo`), que ocurre DENTRO de una ronda ya empezada — así que el
getter siempre lee el `AbortController` de la ronda en curso.

## Testing

Tensión real con el estilo existente: `procesosEnMaquina.test.ts` declara en su cabecera que
**nunca lanza un proceso de verdad** — "es el invariante de este repo, y este es el módulo que
más cerca está de romperlo". Probar de verdad que un nieto muere exige justo lo que ese
invariante prohíbe. Se resuelve en DOS niveles, en dos sitios:

1. **Lógica de `crearExecuteCancelable`, con dobles** (mismo estilo, hijo falso
   `EventEmitter`): al abortar la señal se llama `matarGrupo(pid, "SIGKILL")` y no
   `hijo.kill()`; igual al vencer el timeout; `exitCode` 130 en cancelación y 124 en timeout;
   sin `pid` cae a `hijo.kill()`. Cero procesos reales.
2. **Un test de integración NUEVO, en fichero propio** (p. ej.
   `agent/dispositivos/matarGrupoReal.integracion.test.ts`), que SÍ lanza un proceso real que
   lanza un nieto real (`sh -c "sleep 30 & wait"`, `detached: true`), llama `matarGrupoReal(pid,
   "SIGKILL")` de verdad, y comprueba que los DOS pids mueren en menos de un segundo
   (`process.kill(pid, 0)` lanzando `ESRCH`). Única excepción NOMBRADA al invariante — el mismo
   trato que otras excepciones ya declaradas en este repo (`casaDePruebas.ts`).

**Límite declarado, y no se puede cerrar sin Windows real**: la rama `taskkill` solo se prueba
por INVOCACIÓN (con `execFileSync` doblado — qué comando y qué args se construyen), nunca
ejecutándose de verdad. La primera vez que mate un árbol en Windows de verdad será en la máquina
de quien reportó IXCODE-5, no antes.

## Ficheros que cambian

- `agent/dispositivos/procesosEnMaquina.ts` — `matarGrupoReal` exportada, usada como valor por
  omisión de `crearEjecutor`.
- `agent/dispositivos/procesosEnMaquina.test.ts` — tests de la rama Windows de `matarGrupoReal`
  (invocación doblada).
- `agent/dispositivos/matarGrupoReal.integracion.test.ts` — nuevo, el único test con procesos
  reales.
- `agent/grafo/ejecucionCancelable.ts` — nuevo, `crearExecuteCancelable` + `lanzarReal`.
- `agent/grafo/ejecucionCancelable.test.ts` — nuevo, lógica con dobles.
- `agent/grafo/proyecto.ts` — `backendDelProyectoConShell` recibe `senalDelTurno?` y sustituye
  `execute`.
- `agent/motores/trueforge/sesionTrueforge.ts` — `conShell()` pasa `senal: () => aborto?.signal`.
- `agent/motores/trueforge/toolsDeFichero.ts` / `capacidades.ts` — sin cambios de lógica; el tipo
  `BackendQueEjecuta`/`conShell` no cambia de forma (`execute(c: string): unknown` sigue
  cubriendo la nueva firma, que sigue aceptando un solo argumento público).

## Qué no se hace en este trabajo

- No se toca `deepagents` ni su motor (decisión explícita).
- No se instrumenta el script de hotswap (`execFileSync`/`fetch` internos) — el kill de árbol
  desde arriba los arrastra.
- No se añade ni `AbortSignal` a cada `adb` del script ni al `fetch` de subida — redundante si
  el punto anterior funciona.
- No se verifica en una máquina Windows real — queda como límite declarado hasta que alguien lo
  reproduzca ahí después de publicado.
