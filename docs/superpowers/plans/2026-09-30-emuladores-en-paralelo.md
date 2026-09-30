# Emuladores en paralelo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que dos sesiones del chat trabajen a la vez, cada una con SU emulador Android, sin que el túnel de hotswap de una le robe el aparato a la otra; y que desde Ajustes → Dispositivos se pueda crear un AVD, darle su puerto, arrancarlo sin ventana y pararlo.

**Architecture:** El puerto del lado del Mac pasa a ser un dato POR AVD guardado en `~/.xonecode/settings.json` (`dispositivos.avds.<nombre>.puerto`). Con un solo AVD no hay nada que configurar y todo sigue en 8443; el servidor ASIGNA y FIJA un puerto a cada AVD que no lo tenga, al medir (siembra monotónica: solo añade) — también con UNO solo, que queda guardado en 8443 sin que se vea nada, para que al aparecer un segundo el primero conserve el 8443 por mucho que el nombre nuevo ordene antes. Quien hace el túnel —los scripts de la skill `xone-hotswap` y la pestaña Ejecutar— resuelve el puerto del aparato por el nombre de su AVD (`adb -s <serie> emu avd name`) y hace `adb forward tcp:<puerto> tcp:8443`; dentro del aparato el puerto sigue siendo 8443. El agente no pasa el puerto nunca, y un `adb forward` tecleado por él se rechaza.

**Tech Stack:** TypeScript (Node, vitest), React + Vite (cliente), scripts `.mjs` de la skill, `adb` / `emulator` / `avdmanager` del SDK de Android.

**Spec:** Esta conversación (30-09-2026) y la medida en memoria `dos-emuladores-en-paralelo.md`. Resumen de la medida, que el plan da por buena:
- Dos AVD distintos corren a la vez (`emulator-5554` con ventana, `emulator-5556` sin ella); la captura por `screencap` funciona sin ventana; GPU por hardware sin `-gpu`.
- **`adb -s B forward tcp:P tcp:8443` le QUITA el puerto `P` a `A` sin error**; `--no-rebind` lo rechaza. Los scripts ya pasan `-s`: el choque es solo el 8443 fijo del host.
- `avdmanager` sin TTY necesita `JAVA_HOME` (el `openjdk@17` de brew es keg-only) y `no\n` por stdin. Suelta un error de `devices.xml` y aun así crea el AVD.
- Sin ventana NO es más rápido (~14 s con ventana, ~17 s sin ella; ~4 GB cada uno). `-no-metrics` evita un aviso que una versión futura convertirá en pregunta bloqueante.

## Global Constraints

- `npm test` sin red, sin clave, sin simulador, y sin tocar la casa de quien lo corre (`src/gate.test.ts`, `vitest.config.ts` ya muda el `HOME`). Correrlo como `FORCE_COLOR=0 npx vitest run --maxWorkers=2` (con TTY chalk sube a truecolor y la máquina cargada da timeouts).
- `npm run typecheck` = DOS proyectos encadenados con `&&`: host y cliente.
- `src/core/` es PURO: sin disco, sin red, sin langchain/react/ink.
- Los tipos del cable se REDECLARAN en `apps/web/src/tipos.ts`; `src/` no importa de `apps/web/`.
- `store.ts` es lista BLANCA por campo: un campo nuevo que no se copie ahí no llega al componente.
- Ningún color literal fuera de `estilos/marca.css` / `splash.css` (`Barra.test.tsx`). Lo que se pliega se DESMONTA.
- Un rechazo de guarda se DEVUELVE (texto/`informar`), nunca se lanza desde un manejador del cable.
- El puerto REMOTO (dentro del aparato) es siempre `8443`: `PUERTO_DEL_HOTSWAP`. Solo cambia el LOCAL.
- Rangos de puerto local válidos: entero `1024..65535`, fuera de `5554..5585` (consola/adb de los emuladores), y distinto del de cualquier otro AVD.
- Nombre de AVD: `/^[A-Za-z0-9._][A-Za-z0-9._-]*$/` (la MISMA de `arranqueDeEmulador.ts`), máx. 64.
- Comentarios y mensajes en español, con la densidad y el tono del código de alrededor. `CLAUDE.md` no lleva fechas ni cifras de medida (`src/documentacion.test.ts`): la medida va a `docs/DECISIONES.md`.
- No hacer `git push` (lo hace él). Un commit por tarea.

**User decisions (already made):**
- «por defecto si hay un solo avd»: con UN AVD no se configura nada y el puerto es 8443, como hoy. El campo de puerto solo aparece con dos o más. (Se guarda en silencio igual, para que el primero conserve el 8443 al llegar otro.)
- El puerto es POR APARATO (AVD), no por sesión; el primero conserva 8443, el siguiente 8444…, editable, y el servidor rechaza uno repetido.
- «Crear el AVD» desde Ajustes → Dispositivos.
- Casilla «sin ventana» por AVD (headless).
- Aviso en la pastilla del chat si el aparato lo usa otra sesión abierta.
- «mete también lo del adb forward en el plan»: rechazar un `adb forward` tecleado por el agente.
- La skill cambia, pero el agente NO pasa el puerto: lo resuelven los scripts.
- El emulador `pixel8-tagmyxone` (sin ventana) se deja ENCENDIDO para las pruebas.

## File Structure

| fichero | qué cambia |
|---|---|
| `src/core/puertosDeAvd.ts` (nuevo) | Reglas puras: puerto de un AVD, asignación de pendientes, motivos de puerto/nombre inaceptables, flags de arranque |
| `src/core/settings.ts` | `AjustesDeAvd`, campo `avds` en `AjustesDeDispositivos`, su validación |
| `src/agent/config/settingsEnDisco.ts` | `guardarDispositivos` conserva `avds`; `guardarAjusteDeAvd`, `guardarPuertosAsignados` |
| `skills/xone-hotswap/lib/dispositivo.mjs` | `avdDeLaSerie`, `ajusteDelAvd`, `puertoAndroid` |
| `skills/xone-hotswap/scripts/{xone-desplegar-android,xone-reiniciar-android,xone-hotswap,xone-arrancar-android}` | Usan el puerto del aparato y `--puerto`; arrancar respeta «sin ventana» |
| `src/agent/dispositivos/arranqueDeEmulador.ts` | `sinVentana` y `pararEmulador` |
| `src/agent/dispositivos/lanzamientoEnMaquina.ts` | `PeticionDeLanzamiento.puerto` |
| `src/agent/dispositivos/instalacionEnMaquina.ts` | `crearAvd(nombre, deps)` sobre el mismo corredor de pasos |
| `src/web/servidor/arranque.ts`, `transporte.ts` | Mensajes `crearEmulador`, `ajusteDeAvd`, `pararEmulador`; siembra de puertos al medir; `enUso` en el mensaje `dispositivos` |
| `apps/web/src/{tipos.ts,store.ts,App.tsx}`, `componentes/Ajustes.tsx`, `componentes/AjustesDeAvd.tsx` (nuevo), `componentes/CrearEmulador.tsx` (nuevo), `componentes/PastillaDeDispositivo.tsx` | UI |
| `src/core/shellDeAgente.ts` | Rechazo de `adb … forward` |
| `skills/xone-hotswap/SKILL.md`, `references/conexion-y-despliegue.md` | Documentación de la skill |
| `CLAUDE.md`, `docs/DECISIONES.md` | Reglas y medida |

---

### Task 1: Reglas puras del puerto por AVD

**Goal:** Un módulo puro en `core/` que decide el puerto local de un AVD, asigna los que faltan y valida puerto y nombre; y `settings.ts` que acepta y valida `dispositivos.avds`.

**Files:**
- Create: `src/core/puertosDeAvd.ts`
- Create: `src/core/puertosDeAvd.test.ts`
- Modify: `src/core/settings.ts` (`AjustesDeDispositivos` ~:75, `validarDispositivos` ~:251)
- Test: `src/core/settings.test.ts` (añadir casos)

**Acceptance Criteria:**
- [ ] `puertoDeAvd(ajustes, "pixel8")` es `8443` sin ajustes, y el guardado cuando lo hay.
- [ ] `asignarPuertosPendientes(["pixel8"], {})` es `{ pixel8: 8443 }` (se guarda en silencio; la UI no enseña campo con un AVD); `asignarPuertosPendientes(["pixel8-tagmyxone","pixel8"], {})` (los dos sin sembrar) es `{ pixel8: 8443, "pixel8-tagmyxone": 8444 }`; con `pixel8` ya en 8443 y un `aaa` nuevo, `aaa` recibe 8444 (el primero CONSERVA el 8443 aunque el nuevo ordene antes); nunca reasigna uno guardado; salta los puertos ya usados; `[]` es `undefined`.
- [ ] `motivoDePuertoInaceptable` rechaza no-enteros, `<1024`, `>65535`, `5554..5585` y el de otro AVD; acepta el propio.
- [ ] `motivoDeNombreDeAvdInaceptable` rechaza vacío, forma inválida, >64 y un nombre que ya existe.
- [ ] `argsDeArranque("pixel8", { sinVentana: true })` es `["-avd","pixel8","-no-window","-no-audio","-no-metrics"]` y sin él `["-avd","pixel8"]`.
- [ ] `cargarSettings` conserva `dispositivos.avds` válido y descarta entradas con nombre inválido, puerto no entero o `sinVentana` no booleano.

**Verify:** `FORCE_COLOR=0 npx vitest run src/core/puertosDeAvd.test.ts src/core/settings.test.ts` → todo en verde.

**Steps:**

- [ ] **Step 1: Tipos en `settings.ts`.** Junto a `AjustesDeDispositivos`:

```ts
/**
 * Lo que se recuerda de UN AVD, por su NOMBRE y no por su serie: `emulator-5554`/`-5556`
 * dependen del orden en que se arrancan, el nombre no. Ausente = nada que decir.
 */
export interface AjustesDeAvd {
  /** El puerto LOCAL del túnel de hotswap (`adb forward tcp:<puerto> tcp:8443`). */
  puerto?: number;
  /** Arrancarlo sin ventana (`-no-window`). Solo `true` se guarda. */
  sinVentana?: true;
}

export type AjustesDeDispositivos = { [K in PlataformaDeDispositivo]?: boolean } & {
  rutaAdb?: string;
  rutaEmulator?: string;
  avds?: Record<string, AjustesDeAvd>;
};
```

- [ ] **Step 2: Test que falla de `puertosDeAvd.ts`.**

```ts
import { describe, expect, it } from "vitest";
import {
  PUERTO_DEL_HOTSWAP,
  argsDeArranque,
  asignarPuertosPendientes,
  motivoDeNombreDeAvdInaceptable,
  motivoDePuertoInaceptable,
  puertoDeAvd,
} from "./puertosDeAvd.js";

describe("puertoDeAvd", () => {
  it("sin ajustes es el de siempre", () => {
    expect(puertoDeAvd(undefined, "pixel8")).toBe(PUERTO_DEL_HOTSWAP);
    expect(PUERTO_DEL_HOTSWAP).toBe(8443);
  });
  it("con puerto guardado, ese", () => {
    expect(puertoDeAvd({ avds: { pixel8: { puerto: 8450 } } }, "pixel8")).toBe(8450);
  });
});

describe("asignarPuertosPendientes", () => {
  it("con UN AVD lo fija en 8443: en silencio (la UI no enseña campo), pero guardado", () => {
    expect(asignarPuertosPendientes(["pixel8"], {})).toEqual({ pixel8: 8443 });
    expect(asignarPuertosPendientes([], {})).toBeUndefined();
  });
  it("el primero conserva el 8443 aunque el nuevo ordene antes", () => {
    expect(asignarPuertosPendientes(["pixel8", "aaa"], { avds: { pixel8: { puerto: 8443 } } })).toEqual({ aaa: 8444 });
  });
  it("con dos, el primero por orden conserva 8443 y el siguiente 8444", () => {
    expect(asignarPuertosPendientes(["pixel8-tagmyxone", "pixel8"], {})).toEqual({
      pixel8: 8443,
      "pixel8-tagmyxone": 8444,
    });
  });
  it("no toca un puerto guardado y salta los ocupados", () => {
    expect(
      asignarPuertosPendientes(["a", "b", "c"], { avds: { b: { puerto: 8443 } } }),
    ).toEqual({ a: 8444, c: 8445 });
  });
  it("nada pendiente es undefined", () => {
    expect(asignarPuertosPendientes(["a", "b"], { avds: { a: { puerto: 8443 }, b: { puerto: 9000 } } })).toBeUndefined();
  });
});

describe("motivoDePuertoInaceptable", () => {
  const ajustes = { avds: { pixel8: { puerto: 8443 } } };
  it.each([[80], [70000], [8443.5], [5554], [5585]])("rechaza %s", (p) => {
    expect(motivoDePuertoInaceptable(p, "otro", ajustes)).toBeTypeOf("string");
  });
  it("rechaza el de otro AVD y acepta el propio", () => {
    expect(motivoDePuertoInaceptable(8443, "otro", ajustes)).toMatch(/pixel8/);
    expect(motivoDePuertoInaceptable(8443, "pixel8", ajustes)).toBeUndefined();
    expect(motivoDePuertoInaceptable(8444, "otro", ajustes)).toBeUndefined();
  });
});

describe("motivoDeNombreDeAvdInaceptable", () => {
  it.each([[""], ["-x"], ["a b"], ["a/b"], ["x".repeat(65)]])("rechaza «%s»", (n) => {
    expect(motivoDeNombreDeAvdInaceptable(n, [])).toBeTypeOf("string");
  });
  it("rechaza uno que ya existe y acepta uno nuevo", () => {
    expect(motivoDeNombreDeAvdInaceptable("pixel8", ["pixel8"])).toMatch(/ya existe/);
    expect(motivoDeNombreDeAvdInaceptable("pixel8-tagmyxone", ["pixel8"])).toBeUndefined();
  });
});

describe("argsDeArranque", () => {
  it("sin ventana añade las tres banderas", () => {
    expect(argsDeArranque("pixel8", { sinVentana: true })).toEqual(["-avd", "pixel8", "-no-window", "-no-audio", "-no-metrics"]);
    expect(argsDeArranque("pixel8", {})).toEqual(["-avd", "pixel8"]);
  });
});
```

- [ ] **Step 3: Correrlo y ver que falla** (`Cannot find module './puertosDeAvd.js'`).

- [ ] **Step 4: Implementar `src/core/puertosDeAvd.ts`.**

```ts
/**
 * El puerto LOCAL del túnel de hotswap, uno por AVD.
 *
 * Medido: `adb -s B forward tcp:8443 tcp:8443` le QUITA el puerto a `A` sin error, así que
 * con dos emuladores y un puerto fijo la sesión de uno acaba hablando con el aparato del otro.
 * Dentro de cada aparato el 8443 es independiente; lo que se reparte es el del Mac.
 *
 * Con UN solo AVD el puerto es el de siempre y no hay nada que decidir (decisión suya: la UI
 * no enseña campo). Pero se GUARDA igual (`asignarPuertosPendientes` también siembra al único):
 * si se sembrara solo al aparecer el segundo, por orden alfabético, un AVD nuevo que ordenara
 * antes le quitaría el 8443 al que ya se usaba.
 *
 * Puro: ni disco ni red. La copia que LEEN los scripts está en
 * `skills/xone-hotswap/lib/dispositivo.mjs`, y un test compara las dos.
 */
import type { AjustesDeDispositivos } from "./settings.js";

/** El puerto del servidor hotswap DENTRO del aparato, y el local por omisión. */
export const PUERTO_DEL_HOTSWAP = 8443;

/** La consola y el adb de los emuladores viven aquí: un túnel encima los rompería. */
const PUERTOS_DE_EMULADOR = { desde: 5554, hasta: 5585 } as const;

/** La MISMA forma que acepta `arranqueDeEmulador.ts`: lo que puede ser una carpeta de `~/.android/avd`. */
export const FORMA_DE_NOMBRE_DE_AVD = /^[A-Za-z0-9._][A-Za-z0-9._-]*$/;
const LARGO_MAXIMO_DE_NOMBRE = 64;

export function puertoDeAvd(ajustes: AjustesDeDispositivos | undefined, avd: string): number {
  return ajustes?.avds?.[avd]?.puerto ?? PUERTO_DEL_HOTSWAP;
}

/**
 * Los puertos que faltan, o `undefined` si no falta ninguno. Solo AÑADE: un puerto guardado no
 * se mueve nunca. Entre los que faltan, por orden alfabético (que no dependa del orden de
 * `emulator -list-avds`), desde el 8443 si está libre. Como el único AVD ya queda sembrado, el
 * orden solo decide entre AVD que aparecieron a la vez.
 */
export function asignarPuertosPendientes(
  avds: readonly string[],
  ajustes: AjustesDeDispositivos | undefined,
): Record<string, number> | undefined {
  if (avds.length === 0) return undefined;
  const usados = new Set(
    Object.values(ajustes?.avds ?? {})
      .map((a) => a.puerto)
      .filter((p): p is number => p !== undefined),
  );
  const nuevos: Record<string, number> = {};
  let candidato = PUERTO_DEL_HOTSWAP;
  for (const avd of [...avds].sort()) {
    if (ajustes?.avds?.[avd]?.puerto !== undefined) continue;
    while (usados.has(candidato)) candidato++;
    nuevos[avd] = candidato;
    usados.add(candidato);
  }
  return Object.keys(nuevos).length === 0 ? undefined : nuevos;
}

export function motivoDePuertoInaceptable(
  puerto: number,
  avd: string,
  ajustes: AjustesDeDispositivos | undefined,
): string | undefined {
  if (!Number.isInteger(puerto) || puerto < 1024 || puerto > 65535) {
    return "el puerto tiene que ser un número entero entre 1024 y 65535";
  }
  if (puerto >= PUERTOS_DE_EMULADOR.desde && puerto <= PUERTOS_DE_EMULADOR.hasta) {
    return `del ${PUERTOS_DE_EMULADOR.desde} al ${PUERTOS_DE_EMULADOR.hasta} los usan los propios emuladores`;
  }
  for (const [otro, a] of Object.entries(ajustes?.avds ?? {})) {
    if (otro !== avd && a.puerto === puerto) return `el ${puerto} ya es de ${otro}`;
  }
  return undefined;
}

export function motivoDeNombreDeAvdInaceptable(nombre: string, existentes: readonly string[]): string | undefined {
  if (nombre === "") return "falta el nombre";
  if (nombre.length > LARGO_MAXIMO_DE_NOMBRE) return `el nombre no puede pasar de ${LARGO_MAXIMO_DE_NOMBRE} caracteres`;
  if (!FORMA_DE_NOMBRE_DE_AVD.test(nombre)) {
    return "solo letras, números, «.», «_» y «-», y sin empezar por «-»";
  }
  if (existentes.includes(nombre)) return `${nombre} ya existe`;
  return undefined;
}

/** Los argumentos de `emulator`. Sin ventana lleva `-no-metrics`: su aviso será una pregunta que nadie ve. */
export function argsDeArranque(avd: string, opciones: { sinVentana?: boolean }): string[] {
  return opciones.sinVentana === true ? ["-avd", avd, "-no-window", "-no-audio", "-no-metrics"] : ["-avd", avd];
}
```

- [ ] **Step 5: Validación en `settings.ts`.** Dentro de `validarDispositivos`, antes del `return`:

```ts
  const avds = validarAvds(c.avds);
  if (avds !== undefined) salida.avds = avds;
```

y la función (importa `FORMA_DE_NOMBRE_DE_AVD` de `./puertosDeAvd.js` — `puertosDeAvd.ts` importa SOLO el tipo de `settings.ts`, así que no hay ciclo de VALOR; `src/ciclos.test.ts` lo vigila):

```ts
/** Por AVD: nombre con la forma de una carpeta de AVD, puerto entero, `sinVentana` solo `true`. Lo demás se tira. */
function validarAvds(candidato: unknown): Record<string, AjustesDeAvd> | undefined {
  if (typeof candidato !== "object" || candidato === null) return undefined;
  const salida: Record<string, AjustesDeAvd> = {};
  for (const [nombre, valor] of Object.entries(candidato as Record<string, unknown>)) {
    if (!FORMA_DE_NOMBRE_DE_AVD.test(nombre) || typeof valor !== "object" || valor === null) continue;
    const v = valor as Record<string, unknown>;
    const a: AjustesDeAvd = {};
    if (typeof v.puerto === "number" && Number.isInteger(v.puerto) && v.puerto >= 1024 && v.puerto <= 65535) a.puerto = v.puerto;
    if (v.sinVentana === true) a.sinVentana = true;
    if (Object.keys(a).length > 0) salida[nombre] = a;
  }
  return Object.keys(salida).length === 0 ? undefined : salida;
}
```

Añadir a `settings.test.ts` un caso que cargue `{"dispositivos":{"avds":{"pixel8":{"puerto":8443},"a b":{"puerto":1},"x":{"puerto":"9000","sinVentana":"true"},"y":{"sinVentana":true}}}}` y espere `avds: { pixel8: { puerto: 8443 }, y: { sinVentana: true } }`. (Mirar cómo prueban los casos vecinos de `dispositivos` y copiar el molde.)

- [ ] **Step 6: Correr los tests y el typecheck** → verde.

- [ ] **Step 7: Commit**

```bash
git add src/core/puertosDeAvd.ts src/core/puertosDeAvd.test.ts src/core/settings.ts src/core/settings.test.ts
git commit -m "feat(dispositivos): el puerto del túnel, uno por AVD — reglas puras"
```

```json:metadata
{"files": ["src/core/puertosDeAvd.ts", "src/core/puertosDeAvd.test.ts", "src/core/settings.ts", "src/core/settings.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/core/puertosDeAvd.test.ts src/core/settings.test.ts", "acceptanceCriteria": ["puertoDeAvd 8443 por omisión", "asignarPuertosPendientes: siembra el único en 8443, el primero lo conserva, monotónica", "motivoDePuertoInaceptable con rangos y colisión", "motivoDeNombreDeAvdInaceptable", "argsDeArranque sin ventana", "validarDispositivos conserva avds válidos"], "modelTier": "mechanical"}
```

---

### Task 2: Guardar los ajustes por AVD en disco

**Goal:** Que `settings.json` guarde puerto y «sin ventana» por AVD sin que el guardado de los interruptores de destino los borre.

**Files:**
- Modify: `src/agent/config/settingsEnDisco.ts` (`guardarDispositivos` ~:158)
- Test: `src/agent/config/settingsEnDisco.test.ts`

**Acceptance Criteria:**
- [ ] `guardarDispositivos(casa, { android: false })` con un `avds` ya en disco lo CONSERVA (hoy lo tiraría: escribe el objeto entero).
- [ ] `guardarAjusteDeAvd(casa, "pixel8", { puerto: 8450 })` escribe `dispositivos.avds.pixel8.puerto = 8450` y deja intacto lo demás; `{ sinVentana: false }` BORRA la clave; un AVD que queda vacío desaparece.
- [ ] `guardarPuertosAsignados(casa, { a: 8443, b: 8444 })` solo AÑADE: no pisa un puerto que ya esté en disco.
- [ ] Un `settings.json` roto no se escribe (lanza `SettingsRotosEnDisco`, como las demás).

**Verify:** `FORCE_COLOR=0 npx vitest run src/agent/config/settingsEnDisco.test.ts` → verde.

**Steps:**

- [ ] **Step 1: Tests que fallan**, con el molde de los de `guardarDispositivos` que ya hay en el fichero (casa temporal):

```ts
it("guardarDispositivos conserva los ajustes por AVD", () => {
  const casa = casaTemporal(); // el ayudante que ya usa el fichero
  guardarAjusteDeAvd(casa, "pixel8", { puerto: 8450 });
  guardarDispositivos(casa, { android: false });
  expect(cargarSettings(casa).settings.dispositivos).toEqual({ android: false, avds: { pixel8: { puerto: 8450 } } });
});

it("guardarAjusteDeAvd: sinVentana false borra, y un AVD vacío desaparece", () => {
  const casa = casaTemporal();
  guardarAjusteDeAvd(casa, "pixel8", { sinVentana: true });
  guardarAjusteDeAvd(casa, "pixel8", { sinVentana: false });
  expect(cargarSettings(casa).settings.dispositivos).toBeUndefined();
});

it("guardarPuertosAsignados no pisa lo guardado", () => {
  const casa = casaTemporal();
  guardarAjusteDeAvd(casa, "a", { puerto: 9000 });
  guardarPuertosAsignados(casa, { a: 8443, b: 8444 });
  expect(cargarSettings(casa).settings.dispositivos?.avds).toEqual({ a: { puerto: 9000 }, b: { puerto: 8444 } });
});
```

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Implementar.** En `guardarDispositivos`, conservar `avds` de lo que hay en disco:

```ts
  const enDisco = (crudo as { dispositivos?: { avds?: unknown } }).dispositivos?.avds;
  // Los ajustes por AVD NO los manda la ventana de destinos: se guardan aparte
  // (`guardarAjusteDeAvd`). Escribir el objeto entero sin ellos los borraría.
  const conAvds = enDisco !== undefined ? { ...limpio, avds: enDisco } : limpio;
```

y usar `conAvds` en lugar de `limpio` en `fusionado`. Luego:

```ts
/** Cambia UN AVD. `sinVentana: false` borra la clave; un AVD sin nada desaparece. */
export function guardarAjusteDeAvd(
  casa: string | undefined,
  avd: string,
  cambio: { puerto?: number; sinVentana?: boolean },
): { ruta: string } {
  const ruta = rutaSettings(casa ?? homedir());
  const crudo = leerCrudoOAbortar(ruta);
  const dispositivos = { ...((crudo as { dispositivos?: Record<string, unknown> }).dispositivos ?? {}) };
  const avds = { ...((dispositivos.avds as Record<string, Record<string, unknown>> | undefined) ?? {}) };
  const actual = { ...(avds[avd] ?? {}) };
  if (cambio.puerto !== undefined) actual.puerto = cambio.puerto;
  if (cambio.sinVentana === true) actual.sinVentana = true;
  if (cambio.sinVentana === false) delete actual.sinVentana;
  if (Object.keys(actual).length === 0) delete avds[avd];
  else avds[avd] = actual;
  if (Object.keys(avds).length === 0) delete dispositivos.avds;
  else dispositivos.avds = avds;
  const fusionado =
    Object.keys(dispositivos).length === 0
      ? Object.fromEntries(Object.entries(crudo).filter(([k]) => k !== "dispositivos"))
      : { ...crudo, dispositivos };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta };
}

/** La siembra de puertos: solo AÑADE, un puerto que ya esté en disco no se mueve. */
export function guardarPuertosAsignados(casa: string | undefined, asignados: Record<string, number>): { ruta: string } {
  const ruta = rutaSettings(casa ?? homedir());
  const enDisco = cargarSettings(casa ?? homedir()).settings.dispositivos?.avds ?? {};
  for (const [avd, puerto] of Object.entries(asignados)) {
    if (enDisco[avd]?.puerto === undefined) guardarAjusteDeAvd(casa, avd, { puerto });
  }
  return { ruta };
}
```

- [ ] **Step 4: Correr los tests** → verde. `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/agent/config/settingsEnDisco.ts src/agent/config/settingsEnDisco.test.ts
git commit -m "feat(dispositivos): los ajustes por AVD, en settings.json y sin que los destinos los borren"
```

```json:metadata
{"files": ["src/agent/config/settingsEnDisco.ts", "src/agent/config/settingsEnDisco.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/agent/config/settingsEnDisco.test.ts", "acceptanceCriteria": ["guardarDispositivos conserva avds", "guardarAjusteDeAvd cambia uno y limpia vacíos", "guardarPuertosAsignados solo añade", "JSON roto no se escribe"], "modelTier": "mechanical"}
```

---

### Task 3: La librería de la skill resuelve el puerto del aparato

**Goal:** `lib/dispositivo.mjs` sabe qué AVD hay detrás de una serie, lee sus ajustes de `~/.xonecode/settings.json` y devuelve el puerto local, con la MISMA regla que `core/puertosDeAvd.ts`.

**Files:**
- Modify: `skills/xone-hotswap/lib/dispositivo.mjs`
- Create: `src/core/puertosDeAvd.skill.test.ts` (compara la copia `.mjs` con la de `core/`, molde de `src/core/dispositivoDeSesion.test.ts:24-40`)

**Acceptance Criteria:**
- [ ] `avdDeLaSerie("emulator-5556", { ejecutar })` devuelve el nombre que contesta `adb -s <serie> emu avd name` (ignora la línea `OK`), y `undefined` para una serie que no empieza por `emulator-` sin llamar a adb, o si adb falla.
- [ ] `ajusteDelAvd(avd, { casa, leer })` devuelve `dispositivos.avds[avd]` o `{}`; un `settings.json` ausente o roto es `{}`.
- [ ] `puertoAndroid(explicito, serie, deps)`: `--puerto` válido gana; si no, el del AVD de la serie; si no, 8443.
- [ ] Para una tabla de casos, `puertoAndroid` (mjs) y `puertoDeAvd` (core) dan el mismo número.

**Verify:** `FORCE_COLOR=0 npx vitest run src/core/puertosDeAvd.skill.test.ts src/core/dispositivoDeSesion.test.ts` → verde.

**Steps:**

- [ ] **Step 1: Test que falla** (`src/core/puertosDeAvd.skill.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { puertoDeAvd } from "./puertosDeAvd.js";

// La skill no puede importar TypeScript: la regla vive dos veces, y esto es lo que impide que diverjan.
const lib = await import("../../skills/xone-hotswap/lib/dispositivo.mjs");

const settings = { dispositivos: { avds: { pixel8: { puerto: 8443 }, "pixel8-tagmyxone": { puerto: 8444, sinVentana: true } } } };
const leer = () => JSON.stringify(settings);
const ejecutar = (_bin: string, args: string[]) => (args[1] === "emulator-5556" ? "pixel8-tagmyxone\nOK\n" : "pixel8\nOK\n");

describe("puerto del aparato, visto desde la skill", () => {
  it("avdDeLaSerie lee la consola del emulador", () => {
    expect(lib.avdDeLaSerie("emulator-5556", { ejecutar })).toBe("pixel8-tagmyxone");
    expect(lib.avdDeLaSerie("R58M123", { ejecutar: () => { throw new Error("no debería llamarse"); } })).toBeUndefined();
    expect(lib.avdDeLaSerie("emulator-5554", { ejecutar: () => { throw new Error("adb caído"); } })).toBeUndefined();
  });

  it.each([
    ["emulator-5554", undefined, 8443],
    ["emulator-5556", undefined, 8444],
    ["emulator-5556", "9001", 9001],
    ["R58M123", undefined, 8443],
    [undefined, undefined, 8443],
  ])("serie %s, --puerto %s → %s", (serie, explicito, esperado) => {
    expect(lib.puertoAndroid(explicito, serie, { casa: "/casa", leer, ejecutar })).toBe(esperado);
  });

  it("dice lo mismo que core", () => {
    for (const avd of ["pixel8", "pixel8-tagmyxone", "otro"]) {
      const serie = avd === "pixel8-tagmyxone" ? "emulator-5556" : "emulator-5554";
      // La consola del emulador contesta con el nombre del AVD que se está probando.
      const ej = () => `${avd}\nOK\n`;
      expect(lib.puertoAndroid(undefined, "emulator-5554", { casa: "/casa", leer, ejecutar: ej })).toBe(puertoDeAvd(settings.dispositivos, avd));
    }
  });

  it("un settings roto o ausente es el puerto de siempre", () => {
    expect(lib.puertoAndroid(undefined, "emulator-5556", { casa: "/casa", leer: () => "{roto", ejecutar })).toBe(8443);
    expect(lib.puertoAndroid(undefined, "emulator-5556", { casa: "/casa", leer: () => { throw Object.assign(new Error(), { code: "ENOENT" }); }, ejecutar })).toBe(8443);
  });
});
```

(Si el typecheck protesta por importar `.mjs` sin tipos, seguir el mismo recurso que usa `dispositivoDeSesion.test.ts`.)

- [ ] **Step 2: Correr y ver que falla.**

- [ ] **Step 3: Implementar en `lib/dispositivo.mjs`:**

```js
import { homedir } from "node:os";
import { join } from "node:path";

/** El puerto del hotswap DENTRO del aparato y el local por omisión. Copia de `core/puertosDeAvd.ts#PUERTO_DEL_HOTSWAP`. */
export const PUERTO_DEL_HOTSWAP = 8443;

const ejecutarAdb = (binario, args) =>
  execFileSync(binario, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** El AVD detrás de un emulador en marcha, por su consola. Un físico no tiene: `undefined` sin preguntar. */
export function avdDeLaSerie(serie, { entorno = process.env, ejecutar = ejecutarAdb } = {}) {
  if (!serie || !serie.startsWith("emulator-")) return undefined;
  try {
    return ejecutar(rutaDeAdb(entorno), ["-s", serie, "emu", "avd", "name"])
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l !== "" && l !== "OK");
  } catch {
    return undefined;
  }
}

/**
 * Lo guardado para ese AVD en `~/.xonecode/settings.json` (`dispositivos.avds`). Se lee en CADA
 * ejecución, como el dispositivo de la sesión: cambiar el puerto en Ajustes alcanza al siguiente
 * comando. Un fichero ausente o roto es «nada guardado».
 */
export function ajusteDelAvd(avd, { casa = homedir(), leer = (r) => readFileSync(r, "utf8") } = {}) {
  if (!avd) return {};
  try {
    const s = JSON.parse(leer(join(casa, ".xonecode", "settings.json")));
    const a = s?.dispositivos?.avds?.[avd];
    return typeof a === "object" && a !== null ? a : {};
  } catch {
    return {};
  }
}

/**
 * El puerto LOCAL del túnel. De más explícito a menos: `--puerto`, el guardado del AVD de esta
 * serie, 8443. Misma regla que `core/puertosDeAvd.ts#puertoDeAvd` (un test compara las dos).
 */
export function puertoAndroid(explicito, serie, deps = {}) {
  const n = Number(explicito);
  if (explicito !== undefined && Number.isInteger(n) && n >= 1024 && n <= 65535) return n;
  const guardado = ajusteDelAvd(avdDeLaSerie(serie, deps), deps).puerto;
  return Number.isInteger(guardado) ? guardado : PUERTO_DEL_HOTSWAP;
}
```

- [ ] **Step 4: Correr** → verde.

- [ ] **Step 5: Commit**

```bash
git add skills/xone-hotswap/lib/dispositivo.mjs src/core/puertosDeAvd.skill.test.ts
git commit -m "feat(xone-hotswap): la librería resuelve el puerto del aparato por su AVD"
```

```json:metadata
{"files": ["skills/xone-hotswap/lib/dispositivo.mjs", "src/core/puertosDeAvd.skill.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/core/puertosDeAvd.skill.test.ts src/core/dispositivoDeSesion.test.ts", "acceptanceCriteria": ["avdDeLaSerie", "ajusteDelAvd tolera ausente/roto", "puertoAndroid: --puerto > AVD > 8443", "paridad con core"], "modelTier": "standard"}
```

---

### Task 4: Los scripts de la skill usan el puerto del aparato

**Goal:** `xone-desplegar-android`, `xone-reiniciar-android` y `xone-hotswap` hacen el túnel y conectan por el puerto del aparato de la sesión; `xone-arrancar-android` respeta «sin ventana».

**Files:**
- Modify: `skills/xone-hotswap/scripts/xone-desplegar-android` (:55, :351, :358, :424)
- Modify: `skills/xone-hotswap/scripts/xone-reiniciar-android` (:28, :89, :115)
- Modify: `skills/xone-hotswap/scripts/xone-hotswap` (:18-24 cabecera, :56, :111-114 ayuda, :309)
- Modify: `skills/xone-hotswap/scripts/xone-arrancar-android` (:175)

**Acceptance Criteria:**
- [ ] Desplegar/reiniciar hacen `adb -s <serie> forward tcp:<local> tcp:8443` con `<local> = puertoAndroid(--puerto, serie)`, y la subida va a `https://127.0.0.1:<local>/…`. Aceptan `--puerto N` y su `--help` lo dice.
- [ ] `xone-hotswap` sin `HOTSWAP_URL`: con dispositivo de sesión iOS → `wss://127.0.0.1:8443/hotswap` sin llamar a adb; si no, `wss://127.0.0.1:<puertoAndroid(--puerto, serie)>/hotswap`. `HOTSWAP_URL` sigue ganando.
- [ ] `xone-arrancar-android` añade `-no-window -no-audio -no-metrics` cuando el AVD tiene `sinVentana: true` (o se pasa `--sin-ventana`), usando `argsDeArranque` copiado en el `.mjs` si hace falta (o las tres banderas literales), y lo DICE en su salida.
- [ ] **Prueba REAL con los dos emuladores vivos** (`emulator-5554` pixel8, `emulator-5556` pixel8-tagmyxone): con `settings.json` diciendo `pixel8: 8443`, `pixel8-tagmyxone: 8444`, correr `XONECODE_DISPOSITIVO=<fichero con emulator-5556> xone-reiniciar-android --app <una app instalada>` deja `adb forward --list` con `emulator-5554 tcp:8443` Y `emulator-5556 tcp:8444` a la vez (el primero NO se pierde).

**Verify:** `adb forward --list` tras la prueba real → dos líneas, una por emulador, puertos distintos. Y `node skills/xone-hotswap/scripts/xone-hotswap --help` menciona `--puerto`.

**Steps:**

- [ ] **Step 1: Leer los cuatro scripts enteros** (no hay suite de tests de scripts; la prueba es real).
- [ ] **Step 2: `xone-desplegar-android` y `xone-reiniciar-android`.** Sustituir `const PUERTO = 8443;` por la lectura de `--puerto` en el parseo de argumentos que ya tiene cada script y, DESPUÉS de resolver `serie`:

```js
import { PUERTO_DEL_HOTSWAP, puertoAndroid } from "../lib/dispositivo.mjs";
// El puerto LOCAL es del aparato (Ajustes → Dispositivos): con dos emuladores, un 8443 fijo
// hacía que el segundo túnel le quitara el aparato al primero sin avisar. Dentro sigue en 8443.
const PUERTO = puertoAndroid(puertoPedido, serie);
```

y el forward: `adb("forward", `tcp:${PUERTO}`, `tcp:${PUERTO_DEL_HOTSWAP}`)`. Los mensajes que dicen «el puerto es el 8443» pasan a nombrar `${PUERTO}` (local) y `${PUERTO_DEL_HOTSWAP}` (en el aparato). Mantener el orden del import con los que ya hay (`serieAndroid`, `rutaDeAdb`…).
- [ ] **Step 3: `xone-hotswap`.** Reemplazar `URL_POR_OMISION` fija por una función:

```js
import { dispositivoDeLaSesion, puertoAndroid, serieAndroid, PUERTO_DEL_HOTSWAP } from "../lib/dispositivo.mjs";
function urlPorOmision(puertoPedido) {
  // iOS no tiene túnel: el simulador comparte el localhost del Mac.
  if (dispositivoDeLaSesion()?.plataforma === "ios") return `wss://127.0.0.1:${PUERTO_DEL_HOTSWAP}/hotswap`;
  const { serie } = serieAndroid(undefined);
  return `wss://127.0.0.1:${puertoAndroid(puertoPedido, serie)}/hotswap`;
}
const ws = new WebSocket(process.env.HOTSWAP_URL ?? urlPorOmision(puertoPedido));
```

`puertoPedido` sale de un `--puerto N` que se retira de los argumentos ANTES de leer el JSON del comando (mirar cómo parsea hoy `xone-hotswap` sus argumentos y no romper la forma `xone-hotswap '<json>'` ni `xone-hotswap getAllElements`). Actualizar la cabecera y la ayuda: «el túnel lo ponen `xone-desplegar-android`/`xone-reiniciar-android`, con el puerto del aparato; no hagas `adb forward` a mano».
- [ ] **Step 4: `xone-arrancar-android`.** Antes del `spawn` de :175:

```js
import { ajusteDelAvd } from "../lib/dispositivo.mjs";
const sinVentana = args.includes("--sin-ventana") || ajusteDelAvd(avd).sinVentana === true;
const banderas = sinVentana ? ["-no-window", "-no-audio", "-no-metrics"] : [];
if (sinVentana) console.log(`${avd} arranca SIN ventana: para verlo, captura; para pararlo, adb -s <serie> emu kill`);
const hijo = spawn(EMULATOR, ["-avd", avd, ...banderas], { detached: true, stdio: "ignore" });
```

(`--sin-ventana` no debe confundirse con el nombre de un AVD en el parseo actual: comprobarlo.)
- [ ] **Step 5: Prueba REAL.** Con los dos emuladores vivos. Hacer copia de `~/.xonecode/settings.json`, añadir a mano `"dispositivos":{…,"avds":{"pixel8":{"puerto":8443},"pixel8-tagmyxone":{"puerto":8444}}}`. Escribir en el scratchpad un `dispositivo.json` `{"id":"emulator-5556","nombre":"pixel8-tagmyxone","plataforma":"android","clase":"emulador"}`. Correr `XONECODE_DISPOSITIVO=<ese fichero> skills/xone-hotswap/scripts/xone-reiniciar-android --app <app>` (si no hay app XOne instalada en 5556, basta con que llegue al `forward` — pegar la salida). `adb forward --list` → las dos líneas. Luego `xone-hotswap getAllElements` con el mismo `XONECODE_DISPOSITIVO` debe intentar `:8444` (pegar la línea de error o de respuesta). Restaurar el `settings.json` si se desea, o dejarlo (la Tarea 6 lo siembra igual).
- [ ] **Step 6: Commit**

```bash
git add skills/xone-hotswap/scripts/
git commit -m "feat(xone-hotswap): el túnel y el canal, por el puerto del aparato; arrancar sin ventana"
```

```json:metadata
{"files": ["skills/xone-hotswap/scripts/xone-desplegar-android", "skills/xone-hotswap/scripts/xone-reiniciar-android", "skills/xone-hotswap/scripts/xone-hotswap", "skills/xone-hotswap/scripts/xone-arrancar-android"], "verifyCommand": "adb forward --list", "acceptanceCriteria": ["forward tcp:<local> tcp:8443 por aparato", "xone-hotswap URL por aparato, iOS sin adb, HOTSWAP_URL gana", "arrancar respeta sinVentana", "prueba real: dos forwards simultáneos"], "modelTier": "standard"}
```

---

### Task 5: El harness arranca sin ventana, para, y lanza por el puerto del aparato

**Goal:** `arrancarEmulador` acepta `sinVentana`, existe `pararEmulador`, y la pestaña Ejecutar (`lanzamientoEnMaquina.ts` + `hotswap.ts`) usa el puerto del aparato en vez del 8443 fijo.

**Files:**
- Modify: `src/agent/dispositivos/arranqueDeEmulador.ts` (:61 firma, :103 args)
- Test: `src/agent/dispositivos/arranqueDeEmulador.test.ts`
- Modify: `src/agent/dispositivos/lanzamientoEnMaquina.ts` (:90, :129 `PeticionDeLanzamiento`, :349-356, :382, :389, :428)
- Test: `src/agent/dispositivos/lanzamientoEnMaquina.test.ts`

**Acceptance Criteria:**
- [ ] `arrancarEmulador("pixel8", deps, { sinVentana: true })` lanza `emulator` con `argsDeArranque("pixel8", {sinVentana:true})`; sin tercer argumento, igual que hoy (el test de :79 sigue verde sin tocarlo).
- [ ] `pararEmulador("emulator-5556", deps)` ejecuta `adb -s emulator-5556 emu kill`, rechaza una serie que no sea `emulator-<n>` sin ejecutar nada, y nunca lanza (`{ok, detalle}`).
- [ ] `PeticionDeLanzamiento.puerto?: number`: con `puerto: 8444` el forward es `-s <serial> forward tcp:8444 tcp:8443`, la subida va a `127.0.0.1:8444` y `lanzarYComprobar` recibe `destino: "wss://127.0.0.1:8444/hotswap"`; sin `puerto`, exactamente lo de hoy.

**Verify:** `FORCE_COLOR=0 npx vitest run src/agent/dispositivos/arranqueDeEmulador.test.ts src/agent/dispositivos/lanzamientoEnMaquina.test.ts` → verde.

**Steps:**

- [ ] **Step 1: Tests que fallan.** En `arranqueDeEmulador.test.ts`, con el `montar()` existente:

```ts
it("sin ventana lanza con las banderas de argsDeArranque", async () => {
  const { deps, lanzamientos } = montar({ listas: [/* las mismas que el caso feliz de :79 */] });
  await arrancarEmulador("pixel8", deps, { sinVentana: true });
  expect(lanzamientos[0]?.args).toEqual(["-avd", "pixel8", "-no-window", "-no-audio", "-no-metrics"]);
});

it("pararEmulador mata por la consola y no acepta cualquier serie", async () => {
  const llamadas: string[][] = [];
  const ejecutar = async (_b: string, args: string[]) => { llamadas.push(args); return { stdout: "OK\n", stderr: "" }; };
  expect((await pararEmulador("emulator-5556", { ejecutar })).ok).toBe(true);
  expect(llamadas).toEqual([["-s", "emulator-5556", "emu", "kill"]]);
  expect((await pararEmulador("R58M; rm -rf /", { ejecutar })).ok).toBe(false);
  expect(llamadas).toHaveLength(1);
});
```

En `lanzamientoEnMaquina.test.ts`, copiar el caso que hoy comprueba el `forward tcp:8443 tcp:8443` y hacer uno gemelo con `puerto: 8444` que espere `tcp:8444 tcp:8443`, la URL de subida con `:8444` y el `destino` de hotswap.

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Implementar.** `arranqueDeEmulador.ts`:

```ts
import { argsDeArranque } from "../../core/puertosDeAvd.js";
export async function arrancarEmulador(
  avd: string,
  deps: DependenciasDeArranque = {},
  opciones: { sinVentana?: boolean } = {},
): Promise<ResultadoDeArranque> {
  // …
  const hijo = lanzar(emulator, argsDeArranque(avd, opciones), { env: { ...entorno } });
```

y `pararEmulador`, al lado, con el `adb` resuelto como lo resuelve `arrancarEmulador` (`enSdk("adb","platform-tools")`) y `ejecutar` de `DependenciasDeDeteccion` (por omisión `ejecutarConTexto`, tope `TOPES_MS.adb`):

```ts
/**
 * Para un emulador por su consola. Sin ventana no hay nada que cerrar: esto es lo que hace de
 * botón. Nunca lanza; la serie se cierra por forma porque es un argumento de proceso.
 */
export async function pararEmulador(serie: string, deps: DependenciasDeDeteccion = {}): Promise<ResultadoDeArranque> {
  if (!/^emulator-\d+$/.test(serie)) return { ok: false, detalle: `«${serie}» no es un emulador` };
  // … resolver adb igual que arrancarEmulador; si falta: { ok: false, detalle: "no encuentro adb" }
  try {
    await ejecutar(adb, ["-s", serie, "emu", "kill"], { timeout: TOPES_MS.adb });
    return { ok: true, detalle: `${serie} parado` };
  } catch (error) {
    return { ok: false, detalle: describirFallo(error, TOPES_MS.adb) };
  }
}
```

(ajustar a cómo exporta `dispositivosEnMaquina.ts` `ejecutarConTexto`/`describirFallo`/`TOPES_MS`; si alguno no está exportado, exportarlo).

`lanzamientoEnMaquina.ts`: `PUERTO_DEL_SERVIDOR` pasa a importarse como `PUERTO_DEL_HOTSWAP` de `core/puertosDeAvd.ts`; añadir a `PeticionDeLanzamiento`:

```ts
  /**
   * El puerto LOCAL del túnel, el del AVD de este aparato (Ajustes → Dispositivos). Ausente,
   * el de siempre. Dentro del aparato es siempre `PUERTO_DEL_HOTSWAP`.
   */
  puerto?: number;
```

y en `lanzarEnDispositivo`: `const local = peticion.puerto ?? PUERTO_DEL_HOTSWAP;` → forward `tcp:${local}` `tcp:${PUERTO_DEL_HOTSWAP}`, subida a `127.0.0.1:${local}`, `puerto: local`, y `lanzarYComprobar(peticion.app, { abrirSocket, alLinea, destino: `wss://127.0.0.1:${local}/hotswap` })`.

- [ ] **Step 4: Correr** → verde; `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/agent/dispositivos/
git commit -m "feat(dispositivos): arrancar sin ventana, parar, y Ejecutar por el puerto del aparato"
```

```json:metadata
{"files": ["src/agent/dispositivos/arranqueDeEmulador.ts", "src/agent/dispositivos/arranqueDeEmulador.test.ts", "src/agent/dispositivos/lanzamientoEnMaquina.ts", "src/agent/dispositivos/lanzamientoEnMaquina.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/agent/dispositivos/arranqueDeEmulador.test.ts src/agent/dispositivos/lanzamientoEnMaquina.test.ts", "acceptanceCriteria": ["arrancarEmulador sinVentana", "pararEmulador con guarda de forma", "PeticionDeLanzamiento.puerto en forward, subida y destino"], "modelTier": "standard"}
```

---

### Task 6: Crear un AVD desde el mismo corredor de pasos

**Goal:** `crearAvd(nombre, deps): Trabajo` crea un AVD con el nombre dado usando la MISMA invocación que el paso «Crear el dispositivo virtual» de la receta (imagen, `-d pixel_8`, `no\n` por stdin, `JAVA_HOME` por `conSdk`).

**Files:**
- Modify: `src/agent/dispositivos/instalacionEnMaquina.ts` (entradas `android-emulador:darwin:3` ~:205 y `android-emulador:win32:5` ~:282; `correrPasoDeReceta` ~:346)
- Test: `src/agent/dispositivos/instalacionEnMaquina.test.ts`

**Acceptance Criteria:**
- [ ] Las dos entradas de la tabla se construyen con una función `pasoDeCrearAvd(nombre, imagen)`; el test que compara la tabla con la receta de `core/dispositivos.ts` sigue verde sin cambios.
- [ ] `crearAvd("pixel8-b", deps)` lanza `avdmanager create avd -n pixel8-b -k <imagen de la plataforma> -d pixel_8` con `teclear: ["no\n"]` y con `JAVA_HOME` en el entorno (lo que ya pone `conSdk`).
- [ ] `crearAvd` con un nombre que `motivoDeNombreDeAvdInaceptable(nombre, [])` rechaza devuelve un `Trabajo` ya terminado en `fallo` con ese motivo, sin lanzar nada.
- [ ] En una plataforma sin paso de crear (linux) devuelve `fallo` «crear emuladores no se lanza desde aquí en esta máquina».

**Verify:** `FORCE_COLOR=0 npx vitest run src/agent/dispositivos/instalacionEnMaquina.test.ts` → verde.

**Steps:**

- [ ] **Step 1: Test que falla**, copiando el molde del test que hoy lanza el paso `android-emulador:darwin:3` (el que comprueba binario/args/teclear con un `lanzar` falso):

```ts
it("crearAvd usa la invocación del paso de la receta con otro nombre", async () => {
  const { deps, lanzamientos } = montarInstalacion({ plataforma: "darwin" }); // el ayudante del fichero
  const t = crearAvd("pixel8-b", deps);
  await t.terminado;
  expect(lanzamientos[0]).toMatchObject({
    args: ["create", "avd", "-n", "pixel8-b", "-k", IMAGEN_DARWIN, "-d", "pixel_8"],
    teclear: ["no\n"],
  });
  expect(lanzamientos[0]?.env?.JAVA_HOME).toBeDefined();
});

it("crearAvd no lanza con un nombre inaceptable", async () => {
  const { deps, lanzamientos } = montarInstalacion({ plataforma: "darwin" });
  const r = await crearAvd("-x", deps).terminado;
  expect(r.estado).toBe("fallo");
  expect(lanzamientos).toHaveLength(0);
});
```

(Adaptar nombres del ayudante y de los campos a los reales del fichero: leerlo antes.)

- [ ] **Step 2: Correr y ver que falla.**

- [ ] **Step 3: Implementar.**

```ts
/** El paso que crea un AVD. Una función y no dos literales: la receta crea `pixel8`, Ajustes el que se le diga. */
function pasoDeCrearAvd(nombre: string, imagen: string): PasoEjecutable {
  return {
    tipo: "proceso",
    binario: "avdmanager",
    conSdk: true,
    subcarpeta: join("cmdline-tools", "latest", "bin"),
    invocaciones: [
      // «Do you wish to create a custom hardware profile? [no]»: sin respuesta, cuelga.
      { args: ["create", "avd", "-n", nombre, "-k", imagen, "-d", "pixel_8"], teclear: ["no\n"] },
    ],
    titulo: `Creando el dispositivo virtual ${nombre}`,
  };
}
```

Las entradas `darwin:3` y `win32:5` pasan a `pasoDeCrearAvd("pixel8", IMAGEN_DARWIN)` / `pasoDeCrearAvd("pixel8", IMAGEN_WIN32)` (ojo: el `titulo` hoy es «Creando el dispositivo virtual» — si un test lo fija, conservar ese título para `pixel8` pasando el título como tercer parámetro opcional). Extraer el cuerpo de `correrPasoDeReceta` que va DESPUÉS de encontrar `paso` a `function correrPaso(paso: PasoEjecutable, deps): Trabajo`, y:

```ts
const IMAGEN_POR_PLATAFORMA: Partial<Record<NodeJS.Platform, string>> = { darwin: IMAGEN_DARWIN, win32: IMAGEN_WIN32 };

/** Crear un AVD con nombre, por el mismo corredor que la receta (topes, stdin, SDK). Nunca lanza. */
export function crearAvd(nombre: string, deps: DependenciasDeInstalacion = {}): Trabajo {
  const terminadoCon = (motivo: string): Trabajo => ({
    titulo: "",
    cancelar: () => {},
    terminado: Promise.resolve({ estado: "fallo", motivo, ms: 0 }),
  });
  const motivo = motivoDeNombreDeAvdInaceptable(nombre, []);
  if (motivo !== undefined) return terminadoCon(motivo);
  const imagen = IMAGEN_POR_PLATAFORMA[(deps.plataforma ?? process.platform) as NodeJS.Platform];
  if (imagen === undefined) return terminadoCon("crear emuladores no se lanza desde aquí en esta máquina");
  return correrPaso(pasoDeCrearAvd(nombre, imagen), deps);
}
```

- [ ] **Step 4: Correr** → verde (incluido el test que ata tabla ↔ receta). `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/agent/dispositivos/instalacionEnMaquina.ts src/agent/dispositivos/instalacionEnMaquina.test.ts
git commit -m "feat(dispositivos): crear un AVD con nombre, por el mismo corredor que la receta"
```

```json:metadata
{"files": ["src/agent/dispositivos/instalacionEnMaquina.ts", "src/agent/dispositivos/instalacionEnMaquina.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/agent/dispositivos/instalacionEnMaquina.test.ts", "acceptanceCriteria": ["pasoDeCrearAvd compartido y test tabla↔receta verde", "crearAvd lanza avdmanager con el nombre, no\\n y JAVA_HOME", "nombre inaceptable no lanza", "plataforma sin paso: fallo"], "modelTier": "standard"}
```

---

### Task 7: El servidor — crear, ajustar, parar, sembrar puertos y decir quién usa qué

**Goal:** El cable acepta `crearEmulador`, `ajusteDeAvd` y `pararEmulador`; al medir siembra los puertos que falten; arranca con «sin ventana»; la pestaña Ejecutar recibe el puerto; y el mensaje `dispositivos` lleva `enUso`.

**Files:**
- Modify: `src/web/servidor/arranque.ts` (opciones ~:520-600; `atenderDispositivos` ~:2234; `atenderArranqueDeEmulador` ~:2277; `trabajo`/`atenderReceta` ~:4181-4260; despacho ~:5435-5460 y ~:5722; cableado en `arrancarConsolaWeb` ~:6921-6937; donde se construye la `PeticionDeLanzamiento`)
- Modify: `src/web/servidor/transporte.ts` (mensaje `dispositivos` ~:501; mensajes del cliente)
- Modify: `apps/web/src/tipos.ts` (REDECLARAR aquí mismo los tres mensajes del cliente y `enUso?` del mensaje `dispositivos`: `tipos.test.ts` compara los literales `clase:` del host con el cliente y daría rojo hasta la Tarea 8)
- Test: `src/web/servidor/arranque.test.ts`, `apps/web/src/tipos.test.ts`

**Acceptance Criteria:**
- [ ] `{clase:"crearEmulador", nombre}`: validado con `motivoDeNombreDeAvdInaceptable(nombre, informe.avds)` (negativa por `informar` con el motivo); comparte el cerrojo `trabajo` con las recetas (si hay uno en marcha, se reemite su progreso y no se lanza otro); emite `clase:"instalacion"` con `receta:"crear-avd"`, `paso: 0`; al terminar vuelve a medir.
- [ ] `{clase:"ajusteDeAvd", avd, puerto?, sinVentana?}`: el AVD tiene que estar en la última medida; `puerto` pasa por `motivoDePuertoInaceptable` (negativa por `informar`); guarda con `guardarAjusteDeAvd` y reemite `dispositivos` con los `ajustes` nuevos.
- [ ] `{clase:"pararEmulador", id}`: solo un `id` que sea emulador en la última medida; llama a la opción `pararEmulador`; luego remide.
- [ ] Al medir (`atenderDispositivos`), también con UN solo AVD, si `asignarPuertosPendientes(informe.avds, ajustes)` devuelve algo, se guarda con `guardarPuertosAsignados` ANTES de emitir, y el mensaje sale con los ajustes ya sembrados. Un fallo al escribir se cuenta (`informar`) y no impide emitir.
- [ ] `atenderArranqueDeEmulador` pasa `{ sinVentana: ajustes.avds?.[avd]?.sinVentana === true }` (cableado: `arrancarEmulador: (avd, o) => arrancarEmulador(avd, {}, o)`).
- [ ] La `PeticionDeLanzamiento` lleva `puerto: puertoDeAvd(ajustes, dispositivo.avd)` cuando el aparato tiene `avd`.
- [ ] El mensaje `dispositivos` lleva `enUso: {id, proyecto}[]` con el dispositivo elegido de CADA consola abierta (`vestibulo.proyectosAbiertos()`; `proyecto` = el nombre visible que ya se usa para ese proyecto en el cable, nunca la ruta), y se reemite tras `clase:"dispositivo"` (elegir).
- [ ] Tests en `arranque.test.ts` para: crear con nombre repetido (negativa, nada lanzado), crear con trabajo en curso (no lanza el segundo), ajuste con puerto de otro AVD (negativa, nada guardado), siembra al medir con dos AVD, `enUso` con dos consolas.

**Verify:** `FORCE_COLOR=0 npx vitest run src/web/servidor/arranque.test.ts apps/web/src/tipos.test.ts` → verde; `npm run typecheck` → verde.

**Steps:**

- [ ] **Step 1: Leer** `arranque.ts` en los rangos citados y `arranque.test.ts` para los casos existentes de `arrancarEmulador` y de `receta` (molde de los tests nuevos: cómo montan `opciones` falsas y leen lo emitido).
- [ ] **Step 2: Tests que fallan** para cada criterio, con el molde de los de `arrancarEmulador`/`receta`.
- [ ] **Step 3: Opciones nuevas** en `OpcionesDeArranque`, junto a `arrancarEmulador`:

```ts
  /** Crear un AVD con nombre (`instalacionEnMaquina.ts#crearAvd`). Ausente: esta ejecución no crea. */
  crearAvd?: (nombre: string, alSalirLinea: (linea: string) => void) => Trabajo;
  /** Parar un emulador por su consola. */
  pararEmulador?: (serie: string) => Promise<{ ok: boolean; detalle: string }>;
  /** Guardar lo de UN AVD en `settings.json`. */
  guardarAjusteDeAvd?: (avd: string, cambio: { puerto?: number; sinVentana?: boolean }) => void;
  /** La siembra de puertos: solo añade. */
  guardarPuertosAsignados?: (asignados: Record<string, number>) => void;
```

y `arrancarEmulador?: (avd: string, opciones?: { sinVentana?: boolean }) => Promise<…>`.
- [ ] **Step 4: El cerrojo compartido.** Extraer de `atenderReceta` la parte que monta `trabajo`, emite progreso y remide al terminar a `const correrTrabajo = (receta: string, paso: number, enMarcha: Trabajo): void`, de modo que `atenderReceta` y `atenderCrearEmulador` la usen; las dos comprueban `trabajo !== undefined` ANTES (reemitir progreso y volver). `atenderCrearEmulador` lanza `opciones.crearAvd(nombre, alSalirLinea)` con el MISMO `alSalirLinea` a ritmo (`MS_ENTRE_PROGRESOS`) que ya usa la receta, y `correrTrabajo("crear-avd", 0, enMarcha)`.
- [ ] **Step 5: `atenderDispositivos` siembra.** Tras medir y antes de `emitir`:

```ts
    // Cada AVD necesita SU puerto, y fijado —también el único, en silencio—: una propuesta que
    // se recalculara al crear otro AVD le movería el puerto a uno que ya se usa.
    const pendientes = asignarPuertosPendientes(informe.avds, ajustes);
    if (pendientes !== undefined && opciones.guardarPuertosAsignados !== undefined) {
      try {
        opciones.guardarPuertosAsignados(pendientes);
        ajustes = /* releer los ajustes como se leen hoy aquí */;
      } catch (error) {
        informar(`no se pudieron guardar los puertos de los emuladores (${codigoDe(error)})`);
      }
    }
```

y añadir `enUso` al `emitir`. Cablear en `arrancarConsolaWeb`: `crearAvd: (nombre, alSalirLinea) => crearAvd(nombre, { alSalirLinea })`, `pararEmulador: (s) => pararEmulador(s)`, `guardarAjusteDeAvd: (avd, c) => void guardarAjusteDeAvd(undefined, avd, c)`, `guardarPuertosAsignados: (a) => void guardarPuertosAsignados(undefined, a)`.
- [ ] **Step 6: Despacho** de los tres mensajes, con el molde exacto del de `arrancarEmulador` (:5445): comprobación de tipos campo a campo, `void atender…`, 204. Y los tipos en `transporte.ts` (mensaje `dispositivos` con `enUso?: { id: string; proyecto: string }[]`; los tres del cliente).
- [ ] **Step 7: Correr los tests** → verde; `npm run typecheck`.
- [ ] **Step 8: Commit**

```bash
git add src/web/servidor/arranque.ts src/web/servidor/transporte.ts src/web/servidor/arranque.test.ts apps/web/src/tipos.ts
git commit -m "feat(dispositivos): el servidor crea, ajusta y para emuladores, y siembra un puerto por AVD"
```

```json:metadata
{"files": ["src/web/servidor/arranque.ts", "src/web/servidor/transporte.ts", "apps/web/src/tipos.ts", "src/web/servidor/arranque.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/web/servidor/arranque.test.ts apps/web/src/tipos.test.ts && npm run typecheck", "acceptanceCriteria": ["crearEmulador validado y con el cerrojo compartido", "ajusteDeAvd validado y guardado", "pararEmulador", "siembra de puertos al medir", "arrancar con sinVentana", "Ejecutar recibe el puerto", "enUso en dispositivos"], "modelTier": "frontier"}
```

---

### Task 8: Ajustes → Dispositivos: crear, puerto, sin ventana, parar

**Goal:** En la lista «Simuladores y emuladores» de Ajustes, cada AVD enseña su puerto (solo con dos o más AVD, editable), la casilla «sin ventana» y, si está en marcha, «Parar»; debajo, «Crear emulador» con nombre y progreso.

**Files:**
- Modify: `apps/web/src/tipos.ts` (`AjustesDeDispositivos` del cliente con `avds?`; los mensajes y `enUso?` ya los redeclaró la Tarea 7)
- Modify: `apps/web/src/store.ts` (`ajustesDelCable` ~:486 copia `avds`; `case "dispositivos"` ~:1143 copia `enUso`; `case "instalacion"` ~:1741 admite `receta:"crear-avd"`)
- Create: `apps/web/src/componentes/AjustesDeAvd.tsx` (+ `.test.tsx`)
- Create: `apps/web/src/componentes/CrearEmulador.tsx` (+ `.test.tsx`)
- Modify: `apps/web/src/componentes/Ajustes.tsx` (~:1497-1535, props ~:531)
- Modify: `apps/web/src/App.tsx` (~:1825, cablear `enviar`)
- Modify: `apps/web/src/tipos.test.ts` si compara literales de `clase` nuevos
- Test: `apps/web/src/store.test.ts`

**Acceptance Criteria:**
- [ ] `store`: `ajustesDelCable` conserva `avds` válido (misma validación que el host: nombre con forma, puerto entero, `sinVentana === true`) y tira lo demás; `enUso` llega al estado solo con `id`/`proyecto` string.
- [ ] Con UN AVD en `informe.avds` NO se pinta campo de puerto; con dos o más, cada fila lleva un campo numérico con el puerto de `ajustes.avds[avd].puerto`, y al confirmar (Enter o botón «Guardar») envía `{clase:"ajusteDeAvd", avd, puerto}`; no envía si no cambió.
- [ ] Cada AVD lleva la casilla «Sin ventana» (`aria-label` con el nombre), que envía `{clase:"ajusteDeAvd", avd, sinVentana}`.
- [ ] Un emulador en marcha (fila no `soloDefinicion`, `clase:"emulador"`, estado `conectado`/`arrancado`) lleva «Parar», que envía `{clase:"pararEmulador", id}`.
- [ ] «Crear emulador»: campo de nombre + botón; el botón se desactiva con el nombre vacío, con forma inválida o repetido (comprobación del CLIENTE con la misma regex; el servidor decide), dice por qué en una línea; envía `{clase:"crearEmulador", nombre}` y enseña el progreso de `instalacion` con `receta:"crear-avd"` (título, últimas líneas, estado final) como lo enseña `Receta.tsx`.
- [ ] Sin colores literales en los `.module.css` nuevos (reusar `VerificarDispositivo.module.css` o tokens de `marca.css`); `Barra.test.tsx` verde.

**Verify:** `FORCE_COLOR=0 npx vitest run --project cliente apps/web/src/componentes/AjustesDeAvd.test.tsx apps/web/src/componentes/CrearEmulador.test.tsx apps/web/src/store.test.ts apps/web/src/componentes/Ajustes.test.tsx apps/web/src/tipos.test.ts apps/web/src/componentes/Barra.test.tsx` → verde; `npm run typecheck` → verde.

**Steps:**

- [ ] **Step 1: Leer** `Ajustes.tsx` ~:1480-1540, `ArrancarEmulador.tsx`, `Receta.tsx` (cómo pinta el progreso de `instalacion`), y `store.ts` en los tres `case`.
- [ ] **Step 2: Tipos y store** (tests primero en `store.test.ts`: un mensaje `dispositivos` con `ajustes.avds` mezclando válidos e inválidos y `enUso`, y uno `instalacion` con `receta:"crear-avd"`).
- [ ] **Step 3: `AjustesDeAvd.tsx`**, test primero con Testing Library:

```tsx
export function AjustesDeAvd({
  avd, ajuste, conPuerto, conectado, alCambiar,
}: {
  avd: string;
  ajuste: { puerto?: number; sinVentana?: true } | undefined;
  /** Solo con dos o más AVD: con uno, el puerto es el de siempre y no hay nada que decidir. */
  conPuerto: boolean;
  conectado?: boolean;
  alCambiar: (cambio: { puerto?: number; sinVentana?: boolean }) => void;
}) {
  const [borrador, setBorrador] = useState(String(ajuste?.puerto ?? ""));
  useEffect(() => setBorrador(String(ajuste?.puerto ?? "")), [ajuste?.puerto]);
  const confirmar = (): void => {
    const n = Number(borrador);
    if (Number.isInteger(n) && n !== ajuste?.puerto) alCambiar({ puerto: n });
  };
  return (
    <span className={estilos.envoltura}>
      {conPuerto ? (
        <label>
          Puerto
          <input
            type="number" inputMode="numeric" value={borrador} disabled={conectado !== true}
            aria-label={`Puerto del túnel de ${avd}`}
            title="El puerto de este Mac que lleva al 8443 del aparato. Cada emulador, el suyo."
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }}
            onBlur={confirmar}
          />
        </label>
      ) : null}
      <label>
        <input
          type="checkbox" checked={ajuste?.sinVentana === true} disabled={conectado !== true}
          aria-label={`Arrancar ${avd} sin ventana`}
          onChange={(e) => alCambiar({ sinVentana: e.target.checked })}
        />
        Sin ventana
      </label>
    </span>
  );
}
```

Tests: con `conPuerto={false}` no hay `spinbutton`; con `true`, cambiar a 8444 + Enter llama `alCambiar({puerto:8444})` una vez; Enter sin cambiar no llama; la casilla llama `{sinVentana:true}`.
- [ ] **Step 4: `CrearEmulador.tsx`**, test primero: nombre vacío → botón desactivado; «pixel8» con `avds=["pixel8"]` → desactivado y la línea «pixel8 ya existe»; «pixel8-b» → click envía `alCrear("pixel8-b")`; con `progreso` `{estado:"corriendo", titulo, lineas}` enseña el título y el botón «Creando…» desactivado; con `estado:"fallo"` enseña el motivo.
- [ ] **Step 5: Montarlo en `Ajustes.tsx`** junto a `ArrancarEmulador` en cada fila de AVD (`d.soloDefinicion === true` → `avd = d.nombre`; emulador en marcha → `avd = d.avd`), «Parar» para los emuladores en marcha (botón con la clase de `VerificarDispositivo.module.css`), y `CrearEmulador` al final de la lista. Props nuevas opcionales (`alAjustarAvd?`, `alPararEmulador?`, `alCrearEmulador?`, `progresoDeCreacion?`): sin ellas no se pinta el control (regla: control sin dato detrás no se pinta). Cablear en `App.tsx` con `enviar({...})`.
- [ ] **Step 6: Correr** los tests del Verify y `npm run typecheck` → verde.
- [ ] **Step 7: Commit**

```bash
git add apps/web/src/
git commit -m "feat(ajustes): crear emuladores, su puerto, sin ventana y parar, desde Dispositivos"
```

```json:metadata
{"files": ["apps/web/src/tipos.ts", "apps/web/src/store.ts", "apps/web/src/store.test.ts", "apps/web/src/componentes/AjustesDeAvd.tsx", "apps/web/src/componentes/AjustesDeAvd.test.tsx", "apps/web/src/componentes/CrearEmulador.tsx", "apps/web/src/componentes/CrearEmulador.test.tsx", "apps/web/src/componentes/Ajustes.tsx", "apps/web/src/App.tsx"], "verifyCommand": "FORCE_COLOR=0 npx vitest run --project cliente && npm run typecheck", "acceptanceCriteria": ["store copia avds y enUso", "puerto solo con 2+ AVD", "casilla sin ventana", "Parar en emuladores vivos", "Crear emulador con validación y progreso", "sin colores literales"], "modelTier": "standard"}
```

---

### Task 9: La pastilla avisa si el aparato lo usa otra sesión

**Goal:** En la pastilla de dispositivo del chat, un aparato elegido por OTRA consola abierta se marca «en uso en <proyecto>», y si el elegido en esta sesión lo usa otra, la pastilla lo dice.

**Files:**
- Modify: `apps/web/src/componentes/PastillaDeDispositivo.tsx`
- Modify: `apps/web/src/componentes/Compositor.tsx` (~:428, pasar `enUso` y el proyecto actual)
- Modify: `apps/web/src/App.tsx` (pasar `enUso` del store y el nombre del proyecto abierto)
- Test: `apps/web/src/componentes/PastillaDeDispositivo.test.tsx`

**Acceptance Criteria:**
- [ ] Prop `enUso?: {id, proyecto}[]` y `proyectoActual?: string`; las entradas cuyo `proyecto === proyectoActual` se ignoran.
- [ ] Un aparato de la lista con entrada en `enUso` enseña «en uso en <proyecto>» bajo su nombre; sigue siendo ELEGIBLE (es un aviso, no un bloqueo).
- [ ] Si el `elegido` de esta sesión está en `enUso`, la pastilla enseña una marca de aviso con `title`/texto accesible «también lo usa <proyecto>».
- [ ] Sin `enUso` todo se pinta igual que hoy (los tests existentes siguen verdes sin tocarlos).

**Verify:** `FORCE_COLOR=0 npx vitest run --project cliente apps/web/src/componentes/PastillaDeDispositivo.test.tsx` → verde.

**Steps:**

- [ ] **Step 1: Leer** `PastillaDeDispositivo.tsx` entero (cómo pinta el `" ·"` de `presente` y la entrada «no está en la última medida»: el aviso nuevo sigue ese mismo molde).
- [ ] **Step 2: Tests que fallan** (render con `informe` de dos emuladores, `enUso=[{id:"emulator-5556", proyecto:"TagMyXOne"}]`, `proyectoActual="MyAllXOne"`; abrir la pastilla; esperar el texto «en uso en TagMyXOne»; con `elegido` = 5556 esperar «también lo usa TagMyXOne»; con `proyectoActual="TagMyXOne"` no aparece nada).
- [ ] **Step 3: Implementar** con el molde del aviso de `presente`: `const otros = (enUso ?? []).filter((u) => u.proyecto !== proyectoActual);` y `const usoDe = (id: string) => otros.find((u) => u.id === id)?.proyecto;`.
- [ ] **Step 4: Cablear** `enUso` desde el store y el nombre del proyecto abierto (el que ya pinta la barra para la consola en foco) por `App.tsx` → `Compositor.tsx` → pastilla.
- [ ] **Step 5: Correr** → verde; `npm run typecheck`.
- [ ] **Step 6: Commit**

```bash
git add apps/web/src/componentes/PastillaDeDispositivo.tsx apps/web/src/componentes/PastillaDeDispositivo.test.tsx apps/web/src/componentes/Compositor.tsx apps/web/src/App.tsx
git commit -m "feat(chat): la pastilla avisa si el aparato lo usa otra sesión abierta"
```

```json:metadata
{"files": ["apps/web/src/componentes/PastillaDeDispositivo.tsx", "apps/web/src/componentes/PastillaDeDispositivo.test.tsx", "apps/web/src/componentes/Compositor.tsx", "apps/web/src/App.tsx"], "verifyCommand": "FORCE_COLOR=0 npx vitest run --project cliente apps/web/src/componentes/PastillaDeDispositivo.test.tsx", "acceptanceCriteria": ["enUso filtra el proyecto actual", "aparato marcado y elegible", "aviso en la pastilla si el elegido está en uso", "sin enUso nada cambia"], "modelTier": "standard"}
```

---

### Task 10: La shell del agente rechaza un `adb forward` a mano

**Goal:** `motivoDeComandoRechazado` devuelve un error con el camino correcto cuando el agente teclea `adb … forward …` (salvo `--list`), porque un túnel a mano le roba el aparato a otra sesión.

**Files:**
- Modify: `src/core/shellDeAgente.ts` (`motivoDeComandoRechazado` ~:201)
- Test: `src/core/shellDeAgente.test.ts`

**Acceptance Criteria:**
- [ ] Se rechazan: `adb forward tcp:8443 tcp:8443`, `adb -s emulator-5556 forward tcp:8444 tcp:8443`, `"$XONECODE_ADB" forward …`, `xone-log-android && adb forward tcp:1 tcp:2`, `adb forward --remove tcp:8443`, `adb reverse tcp:8443 tcp:8443`.
- [ ] Pasan: `adb forward --list`, `adb -s emulator-5556 forward --list`, `adb devices`, `xone-reiniciar-android --app X`, `echo "adb forward"` (entre comillas no es un comando: aceptable que pase; si la regex lo rechaza, el test fija el comportamiento elegido y el comentario lo declara).
- [ ] El texto del rechazo nombra `xone-desplegar-android`/`xone-reiniciar-android` como quien pone el túnel, `xone-hotswap` para hablar con la app, y el motivo (otra sesión pierde su aparato sin aviso).

**Verify:** `FORCE_COLOR=0 npx vitest run src/core/shellDeAgente.test.ts` → verde.

**Steps:**

- [ ] **Step 1: Tests que fallan**, con el molde de los casos de `find`/`grep -r` del fichero (`it.each` de rechazados y de aceptados).
- [ ] **Step 2: Implementar**, al principio de `motivoDeComandoRechazado` (reusa `inicio` y `fin` que ya define la función):

```ts
  // El túnel de hotswap es del APARATO (su puerto está en Ajustes → Dispositivos) y lo ponen los
  // scripts. Medido: un `adb forward` al mismo puerto local le QUITA el túnel al aparato de otra
  // sesión sin dar error. `--list` solo mira, y pasa.
  const adb = String.raw`(?:adb|"?\$\{?XONECODE_ADB\}?"?)`;
  const tunelAMano = new RegExp(String.raw`${inicio}${adb}\s+(?:-\S+\s+\S+\s+)*(?:forward|reverse)\s+(?!--list${fin})`);
  if (tunelAMano.test(comando)) {
    return (
      "No se lanza: el túnel al aparato lo ponen `xone-desplegar-android` y `xone-reiniciar-android`, con el puerto que " +
      "tiene ESTE aparato; un `adb forward` a mano puede quitarle el túnel al aparato de otra sesión sin avisar. Para " +
      "hablar con la app usa `xone-hotswap`, que ya sabe a qué puerto ir. Mirar los túneles (`adb forward --list`) sí se puede."
    );
  }
```

(Ajustar la regex hasta que la tabla de casos pase; `(?:-\S+\s+\S+\s+)*` cubre `-s <serie>`; comprobar que `-s emulator-5556 forward --list` pasa.)
- [ ] **Step 3: Correr** → verde.
- [ ] **Step 4: Commit**

```bash
git add src/core/shellDeAgente.ts src/core/shellDeAgente.test.ts
git commit -m "feat(shell): un adb forward a mano se rechaza — el túnel es del aparato y lo ponen los scripts"
```

```json:metadata
{"files": ["src/core/shellDeAgente.ts", "src/core/shellDeAgente.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/core/shellDeAgente.test.ts", "acceptanceCriteria": ["rechaza forward/reverse con y sin -s", "pasa --list y comandos sin forward", "mensaje con el camino correcto"], "modelTier": "mechanical"}
```

---

### Task 11: La documentación de la skill deja de enseñar el túnel a mano

**Goal:** `SKILL.md` y `references/conexion-y-despliegue.md` dicen que el túnel lo ponen los scripts con el puerto del aparato, y dejan de proponer `adb forward tcp:8443 tcp:8443` y `curl https://localhost:8443/…` como camino.

**Files:**
- Modify: `skills/xone-hotswap/SKILL.md` (:3 descripción, :66, :164, :199-219)
- Modify: `skills/xone-hotswap/references/conexion-y-despliegue.md` (:9-52, :81, :263-266)

**Acceptance Criteria:**
- [ ] `grep -n "adb forward tcp:8443" skills/xone-hotswap/SKILL.md` → nada fuera de un párrafo que explique que NO se hace a mano.
- [ ] Hay un párrafo «Varios emuladores a la vez»: cada AVD tiene su puerto local (Ajustes → Dispositivos), dentro del aparato es 8443, los scripts lo resuelven por el AVD de la serie, `--puerto` para forzarlo, y un `adb forward` a mano se rechaza.
- [ ] Los `curl https://localhost:8443/…` de ejemplo se sustituyen por `xone-hotswap` o se marcan como diagnóstico con `<puerto>`.
- [ ] La lista de scripts que se comprueba contra el catálogo real (`CLAUDE.md`: «los scripts que el prompt NOMBRA se comprueban») sigue verde: `FORCE_COLOR=0 npx vitest run -t "scripts"` o el test que lo haga (buscar con `grep -rn "scriptsDeLasSkills\|catalogo real" src --include=*.test.ts`).

**Verify:** `grep -rn "8443" skills/xone-hotswap/SKILL.md skills/xone-hotswap/references/conexion-y-despliegue.md` → solo menciones del puerto DENTRO del aparato o del por omisión; y `FORCE_COLOR=0 npx vitest run --project host` → verde.

**Steps:**

- [ ] **Step 1: Leer** los dos ficheros enteros.
- [ ] **Step 2: Reescribir** las secciones citadas en el mismo tono. Texto base del párrafo nuevo:

```md
### Varios emuladores a la vez

Cada AVD tiene SU puerto en este Mac (Ajustes → Dispositivos; con un solo AVD es el 8443 y no hay nada
que tocar). Dentro del aparato el servidor sigue en el 8443. **El túnel lo ponen
`xone-desplegar-android` y `xone-reiniciar-android`** con el puerto del aparato de tu sesión, y
`xone-hotswap` ya se conecta a ese puerto: no pases `--puerto` salvo que te lo pidan.

**No hagas `adb forward` a mano** (se rechaza): dos túneles al mismo puerto local no conviven, y
el segundo le quita el aparato al primero sin dar error — otra sesión se quedaría hablando con tu
emulador. Para ver los túneles, `adb forward --list`.
```

- [ ] **Step 3: Verify** (grep + suite host).
- [ ] **Step 4: Commit**

```bash
git add skills/xone-hotswap/SKILL.md skills/xone-hotswap/references/conexion-y-despliegue.md
git commit -m "docs(xone-hotswap): el túnel es del aparato y lo ponen los scripts"
```

```json:metadata
{"files": ["skills/xone-hotswap/SKILL.md", "skills/xone-hotswap/references/conexion-y-despliegue.md"], "verifyCommand": "FORCE_COLOR=0 npx vitest run --project host", "acceptanceCriteria": ["sin adb forward tcp:8443 como camino", "párrafo de varios emuladores", "curl de ejemplo sustituidos", "test de scripts nombrados verde"], "modelTier": "mechanical"}
```

---

### Task 12: CLAUDE.md, DECISIONES.md y la pasada entera

**Goal:** Las reglas nuevas quedan en `CLAUDE.md` (sección Dispositivos) sin fechas ni cifras, la medida en `docs/DECISIONES.md`, y todo el gate en verde; más una pasada real en el navegador con los dos emuladores.

**Files:**
- Modify: `CLAUDE.md` (sección «### Dispositivos»)
- Modify: `docs/DECISIONES.md`

**Acceptance Criteria:**
- [ ] `CLAUDE.md` gana, en Dispositivos, una viñeta: «**El puerto del túnel es del AVD, no fijo** (`core/puertosDeAvd.ts`, copia en `skills/xone-hotswap/lib/dispositivo.mjs` atada por test): con uno, 8443; con dos o más, el servidor FIJA uno a cada AVD al medir (solo añade); dentro del aparato siempre 8443; un `adb forward` del agente se rechaza (`motivoDeComandoRechazado`). Crear un AVD va por el MISMO corredor y cerrojo que la receta (`crearAvd`). Sin ventana = `-no-window -no-audio -no-metrics`, y por eso existe «Parar».» — sin fechas ni cifras de medida.
- [ ] `docs/DECISIONES.md` lleva la medida (rebind silencioso de `adb forward`, `--no-rebind`, `JAVA_HOME` de `avdmanager`, tiempos con/sin ventana, `-no-metrics`).
- [ ] `npm run typecheck` verde; `FORCE_COLOR=0 npx vitest run --maxWorkers=2` verde (incluye `src/documentacion.test.ts`, `src/ciclos.test.ts`, `src/core/imports.test.ts`).
- [ ] Pasada REAL (`npm run web -- --puerto 4200`, navegador): en Ajustes → Dispositivos se ven `pixel8` y `pixel8-tagmyxone` con puertos 8443 y 8444 sembrados; se crea un tercer AVD `pixel8-prueba` desde el formulario y aparece con 8445; su casilla «Sin ventana» se guarda (`~/.xonecode/settings.json`); «Parar» para `emulator-5556` y la foto lo deja apagado; se vuelve a arrancar sin ventana. Al terminar se borra `pixel8-prueba` (`avdmanager delete avd -n pixel8-prueba`, con `JAVA_HOME`) y se deja `pixel8-tagmyxone` encendido.

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run --maxWorkers=2` → 0 fallos; y la pasada del navegador con captura de Ajustes → Dispositivos.

**Steps:**

- [ ] **Step 1: Escribir las dos entradas** (leer antes la forma de las entradas vecinas de `DECISIONES.md`).
- [ ] **Step 2: Gate completo** y pegar el resumen de la salida.
- [ ] **Step 3: Pasada en el navegador** (ojo: el SERVIDOR es el proceso — pararlo y arrancarlo tras el cambio; recargar solo actualiza el cliente).
- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/DECISIONES.md
git commit -m "docs: el puerto del túnel es del AVD, y crear emuladores desde Ajustes"
```

```json:metadata
{"files": ["CLAUDE.md", "docs/DECISIONES.md"], "verifyCommand": "npm run typecheck && FORCE_COLOR=0 npx vitest run --maxWorkers=2", "acceptanceCriteria": ["viñeta en CLAUDE.md sin fechas ni cifras", "medida en DECISIONES.md", "gate verde", "pasada real en el navegador"], "modelTier": "standard"}
```

---

## Orden y dependencias

1 → 2 → (3 → 4) ∥ 5 ∥ 6 ∥ 10 → 7 (necesita 1, 2, 5, 6) → 8 (necesita 7) → 9 (necesita 7) → 11 (necesita 4 y 10) → 12 (todo).

## Límites declarados (no se hacen aquí)

- Un aparato FÍSICO no tiene puerto propio: sigue en 8443. Dos físicos a la vez (o un físico y un emulador en 8443) siguen chocando.
- Desde el terminal, sin haber abierto nunca la web con dos AVD, los puertos no están sembrados y todo va a 8443 como hoy.
- La imagen del AVD creado es la de la receta (android-35 google_apis); elegir otra imagen o descargarla queda fuera.
- `enUso` mira las consolas de PERSONA (`vestibulo.proyectosAbiertos()`): una tarea de fondo usando un emulador no sale en el aviso.
- Dos chats del MISMO proyecto en paralelo es otro asunto (una consola por raíz); esto resuelve dos proyectos, cada uno con su aparato.
