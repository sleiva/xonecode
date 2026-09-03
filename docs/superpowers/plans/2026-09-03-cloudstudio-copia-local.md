# Arranque, copia local de CloudStudio y sincronización — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que `xonecode` en una carpeta vacía configure cuenta y proyecto, se traiga el proyecto de CloudStudio a una copia local y permita subir los cambios de vuelta, con git local como registro de qué está subido.

**Architecture:** tres capas ya existentes y una costura nueva. El **agente** no cambia: sigue trabajando contra la copia local con sus tools de fichero, sus aprobaciones y su backend confinado, sin conocer CloudStudio. El **CLI** habla con el MCP (descarga, subida, ramas) fuera del transcript, igual que ya hace con el listado de proyectos. Entre ambos, el **git local** dice qué cambió y qué falta por subir mediante una ref de seguimiento, `refs/remotes/cloudstudio/<rama>`. Todo lo caro entra por un puerto nuevo (`CloudStudioPort`) con su doble, para que la suite siga corriendo sin red.

**Tech Stack:** TypeScript ESM, Node ≥20, vitest, `@modelcontextprotocol/sdk` (ya presente), `fflate` (nuevo, descompresión pura JS), `git` por `execFile`.

**Spec:** `docs/superpowers/specs/2026-09-03-cloudstudio-copia-local-design.md`

## Global Constraints

- **`npm test` sin red, sin claves y sin simulador.** Es el invariante que sostiene el diseño de puertos. Toda pieza que hable con CloudStudio entra por `CloudStudioPort` y se prueba contra su doble.
- **Ojo al correr los tests**: el `include` por omisión de vitest barre `.worktrees/`. Todo comando de verificación de este plan lleva `--exclude '**/.worktrees/**'`.
- **`core/` es TypeScript puro.** `src/core/imports.test.ts` falla si aparece un import de langchain, langgraph, deepagents, MCP, ink o react. Los tipos del puerto y el plan de subida van en `core/`; el SDK MCP y `fflate`, en `agent/`.
- **Ningún evento de dominio lleva contenido de fichero ni credenciales** (`core/events.ts`). El ZIP en base64, los tokens y los esquemas de tools no entran jamás en el transcript.
- **Las tools MCP no se inyectan en el agente.** Solo `cli/` y `agent/cloudstudioMcp.ts` las invocan.
- **Escribir es opt-in y fail-closed.** Un asistente cancelado no escribe nada; una subida sin aprobación explícita no ocurre.
- **Sin TTY no se pregunta nada** (`!consola.interactivo`), o las tuberías y `xonecode run` dejan de dar la salida byte-idéntica que CI espera.
- **La carpeta `.xonecode` nunca sube a Studio**, ni ella ni nada debajo, con filtro propio además del exclude de git.
- El código, los comentarios y los mensajes de commit van **en castellano**, como el resto del repo.

**User decisions (already made):**
- La copia local vive en **la carpeta que el usuario abrió**, con la misma estructura que el servidor: «la estructura local será la misma que el server y trabajaré sobre ella».
- **Git local como mecanismo de sync**: «crearé un git local para poder trabajar mejor, poder tener un tracking de los cambios y por eso tenemos que crear un mecanismo de sync chulo».
- **Hay que guardar nombre e id del proyecto** («habría que guardar el project name y projectid»). El id no sirve para abrir —`open_project` lo rechaza—, pero sí para detectar renombrados.
- **Descarga alternativa fichero a fichero** cuando el ZIP falla, con concurrencia: «lo crearíamos algún proceso multihilo, que baje varios ficheros a la vez».
- **Rama origen elegida al dar de alta el proyecto, y rama de trabajo propia al subir**: «seleccionar la rama al inicio del proyecto "rama origen" y después podemos trabajar en nuestra rama cuando subamos».
- **`.xonecode` llevará también sesiones, planes y memorias**, así que la exclusión de subida es incondicional.
- **Asistente inicial de proveedor y modelo**, global si no existe y después local por proyecto.
- Descompresor: `fflate`. Bajadas posteriores solo con `/sync` explícito. La subida exige árbol limpio.

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/core/cloudstudio.ts` | **nuevo** — tipos del dominio: `ManifiestoRemoto`, `EntradaRemota`, `EstadoDeSync`, `OperacionDeSubida`. Sin dependencias. |
| `src/core/ports.ts` | **modificar** — `CloudStudioPort` y su doble `CloudStudioEnMemoria`. |
| `src/core/planDeSubida.ts` | **nuevo** — función PURA que convierte un diff de git + manifiesto en operaciones de subida. Aquí vive el candado de borrado. |
| `src/agent/zip.ts` | **nuevo** — extracción de un ZIP base64 con guarda de *zip slip*. |
| `src/agent/cloudstudioClient.ts` | **nuevo** — implementación real del puerto sobre el `Client` MCP: reapertura de sesión, contexto, ramas. |
| `src/agent/manifiesto.ts` | **nuevo** — enumeración del remoto sorteando el truncado de `get_project_structure`. |
| `src/agent/descarga.ts` | **nuevo** — estrategia ZIP → degradada, pool acotado, escritura de `sync.json`. |
| `src/agent/gitSync.ts` | **nuevo** — repo local, `info/exclude`, commit de baseline con índice privado, ref de seguimiento, diff pendiente. |
| `src/agent/subida.ts` | **nuevo** — ejecuta el plan de subida, mueve la ref y escribe `sync.log`. |
| `src/agent/configEnDisco.ts` | **modificar** — `guardarModelosDeProyecto`, `guardarRamaDeProyecto`. |
| `src/cli/wizardInicial.ts` | **nuevo** — asistente de proveedor y modelo, reutilizando el selector de `/modelos`. |
| `src/cli/consola.ts` | **modificar** — comando `/sync`, y el asistente en el arranque. |
| `src/cli/main.ts` | **modificar** — cablear el adaptador real y el orden del alta. |

---

### Task 1: Extracción de ZIP con guarda de zip slip

**Goal:** convertir el `base64Zip` que devuelve CloudStudio en ficheros en disco, sin que una entrada maliciosa escriba fuera de la raíz.

**Files:**
- Create: `src/agent/zip.ts`
- Create: `src/agent/zip.test.ts`
- Modify: `package.json` (dependencia `fflate`)

**Acceptance Criteria:**
- [ ] Un ZIP con carpetas anidadas se extrae conservando la estructura
- [ ] Una entrada con `../` o con ruta absoluta se **rechaza** y no escribe nada fuera de la raíz
- [ ] Devuelve la lista de rutas escritas, relativas a la raíz y con separador POSIX
- [ ] Los directorios intermedios se crean solos

**Verify:** `npx vitest run --exclude '**/.worktrees/**' src/agent/zip.test.ts` → 4 tests en verde

**Steps:**

- [ ] **Step 1: Instalar la dependencia**

```bash
npm install fflate@0.8.2
```

- [ ] **Step 2: Escribir el test que falla**

```ts
// src/agent/zip.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { extraerZipBase64 } from "./zip.js";

const enBase64 = (ficheros: Record<string, string>): string =>
  Buffer.from(zipSync(Object.fromEntries(
    Object.entries(ficheros).map(([ruta, texto]) => [ruta, strToU8(texto)])
  ))).toString("base64");

describe("extraerZipBase64", () => {
  it("escribe el árbol completo y devuelve las rutas en POSIX", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-zip-"));
    const rutas = extraerZipBase64(enBase64({
      "app.xml": "<app/>",
      "icons/icon_check.svg": "<svg/>",
    }), raiz);

    expect(rutas.sort()).toEqual(["app.xml", "icons/icon_check.svg"]);
    expect(readFileSync(join(raiz, "app.xml"), "utf8")).toBe("<app/>");
    expect(readFileSync(join(raiz, "icons", "icon_check.svg"), "utf8")).toBe("<svg/>");
  });

  it("rechaza una entrada que se sale de la raíz, sin escribir nada", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-zip-"));
    expect(() => extraerZipBase64(enBase64({ "../fuera.txt": "no" }), raiz))
      .toThrow(/fuera de la raíz/);
    expect(existsSync(join(raiz, "..", "fuera.txt"))).toBe(false);
  });

  it("rechaza una ruta absoluta", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-zip-"));
    expect(() => extraerZipBase64(enBase64({ "/etc/passwd": "no" }), raiz))
      .toThrow(/fuera de la raíz/);
  });

  it("un base64 que no es un ZIP da un error nombrado, no un volcado", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-zip-"));
    expect(() => extraerZipBase64(Buffer.from("esto no es un zip").toString("base64"), raiz))
      .toThrow(/no es un ZIP válido/);
  });
});
```

- [ ] **Step 3: Verlo fallar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/agent/zip.test.ts`
Expected: FAIL — `Failed to resolve import "./zip.js"`

- [ ] **Step 4: Implementar**

```ts
// src/agent/zip.ts
/**
 * Extracción del ZIP que devuelve CloudStudio.
 *
 * `fflate` es JS puro: no hay binario nativo que compilar ni `unzip` del sistema que
 * falte en Windows, y la suite puede fabricar un ZIP en el propio test sin red.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { unzipSync } from "fflate";

/**
 * La guarda de *zip slip*: una entrada con `../` o absoluta escribiría fuera de la raíz.
 * Se comprueba sobre la ruta YA resuelta, porque comparar cadenas antes de resolver deja
 * pasar `a/../../x`. Se aborta entero: un ZIP que intenta esto no es de fiar en ninguna
 * de sus entradas.
 */
function destinoSeguro(raiz: string, entrada: string): string {
  const base = resolve(raiz);
  const destino = resolve(base, entrada);
  if (destino !== base && !destino.startsWith(base + sep)) {
    throw new Error(`«${entrada}» apunta fuera de la raíz del proyecto; no se extrae nada`);
  }
  return destino;
}

/** Devuelve las rutas escritas, relativas y en POSIX (las del manifiesto y las de MCP). */
export function extraerZipBase64(base64: string, raiz: string): string[] {
  let entradas: Record<string, Uint8Array>;
  try {
    entradas = unzipSync(new Uint8Array(Buffer.from(base64, "base64")));
  } catch (error) {
    // El mensaje no lleva el contenido: acaba en logs y en capturas de pantalla.
    throw new Error(`la descarga no es un ZIP válido (${(error as Error).message})`);
  }

  const escritas: string[] = [];
  const planificadas = Object.entries(entradas)
    // Las entradas de directorio vienen con barra final y sin contenido.
    .filter(([nombre]) => !nombre.endsWith("/"))
    .map(([nombre, datos]) => ({ nombre, datos, destino: destinoSeguro(raiz, nombre) }));

  // Se resuelven TODAS las rutas antes de escribir ninguna: si una es maliciosa, no
  // queda medio proyecto en disco.
  for (const { nombre, datos, destino } of planificadas) {
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, datos);
    escritas.push(nombre.split(sep).join("/"));
  }
  return escritas;
}
```

- [ ] **Step 5: Verlo pasar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/agent/zip.test.ts`
Expected: PASS (4)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/agent/zip.ts src/agent/zip.test.ts
git commit -m "feat: extrae el ZIP de CloudStudio con guarda de zip slip"
```

---

### Task 2: El puerto CloudStudio y su doble

**Goal:** dar a todo lo que viene después una única superficie contra la que programar y contra la que testear sin red.

**Files:**
- Create: `src/core/cloudstudio.ts`
- Modify: `src/core/ports.ts`
- Create: `src/core/cloudstudioPuerto.test.ts`

**Acceptance Criteria:**
- [ ] `CloudStudioPort` cubre las operaciones medidas: `abrir`, `contexto`, `descargarZip`, `estructura`, `leerTexto`, `escribirTexto`, `borrarTexto`, `subirBinario`, `ramas`, `crearRama`, `cambiarRama`
- [ ] El doble `CloudStudioEnMemoria` lleva la marca `ES_DOBLE` y `esDoble()` lo reconoce
- [ ] El doble simula el fallo del ZIP y el truncado de la estructura, que son los dos casos que dan forma al diseño
- [ ] `core/imports.test.ts` sigue en verde: nada de MCP en `core/`

**Verify:** `npx vitest run --exclude '**/.worktrees/**' src/core/` → toda la carpeta en verde, incluido `imports.test.ts`

**Steps:**

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/core/cloudstudioPuerto.test.ts
import { describe, expect, it } from "vitest";
import { esDoble } from "./ports.js";
import { CloudStudioEnMemoria } from "./ports.js";

describe("CloudStudioEnMemoria", () => {
  it("se declara doble: el aviso de honestidad no puede depender de un booleano", () => {
    expect(esDoble(new CloudStudioEnMemoria())).toBe(true);
  });

  it("sirve el proyecto que le den, con estructura y textos", async () => {
    const puerto = new CloudStudioEnMemoria({
      rama: "master",
      textos: { "app.xml": "<app/>", "app.ini": "name=Demo" },
    });
    await puerto.abrir("Demo");
    expect((await puerto.contexto()).rama).toBe("master");
    expect(await puerto.leerTexto("app.xml")).toBe("<app/>");
    expect((await puerto.estructura()).map((e) => e.ruta).sort()).toEqual(["app.ini", "app.xml"]);
  });

  it("puede fingir que el ZIP falla, que es el caso que obliga a la vía degradada", async () => {
    const puerto = new CloudStudioEnMemoria({ zipFalla: "colección con error de sintaxis" });
    await puerto.abrir("Demo");
    await expect(puerto.descargarZip()).rejects.toThrow(/error de sintaxis/);
  });

  it("registra las escrituras en vez de hacerlas, para poder afirmar sobre ellas", async () => {
    const puerto = new CloudStudioEnMemoria({ textos: { "a.js": "viejo" } });
    await puerto.abrir("Demo");
    await puerto.escribirTexto("a.js", "nuevo");
    await puerto.borrarTexto("b.js");
    expect(puerto.escrituras).toEqual([
      { tipo: "texto", ruta: "a.js", bytes: 5 },
      { tipo: "borrado", ruta: "b.js" },
    ]);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/core/cloudstudioPuerto.test.ts`
Expected: FAIL — `CloudStudioEnMemoria` no existe

- [ ] **Step 3: Los tipos del dominio**

```ts
// src/core/cloudstudio.ts
/**
 * Los tipos que cruzan la frontera CloudStudio ↔ xonecode.
 *
 * Viven en `core/` a propósito: son datos, no transporte. El SDK MCP se queda en `agent/`.
 */

/** Una entrada del inventario remoto, tal cual la da `get_project_structure`. */
export interface EntradaRemota {
  /** Ruta POSIX relativa a la raíz del proyecto. */
  ruta: string;
  bytes: number;
}

export type ManifiestoRemoto = EntradaRemota[];

/** Qué proyecto y qué rama tiene abiertos el servidor AHORA. */
export interface ContextoRemoto {
  proyecto: string;
  rama: string;
}

/** Lo que queda escrito en `.xonecode/cloudstudio/sync.json`: diagnóstico, no estado. */
export interface EstadoDeSync {
  proyecto: { id: string; nombre: string };
  rama: string;
  fecha: string;
  /** Cómo se bajó. `parcial` obliga al candado de borrado. */
  via: "zip" | "parcial";
  /** El inventario del remoto en el momento de bajar. */
  manifiesto: ManifiestoRemoto;
  /** Las rutas que REALMENTE se pudieron traer. */
  descargados: string[];
  /** Por qué falló el ZIP, cuando `via` es `parcial`. Es la pista para arreglarlo. */
  motivo?: string;
}

/** Una operación de subida ya decidida. La ejecuta `agent/subida.ts`. */
export type OperacionDeSubida =
  | { tipo: "texto"; ruta: string }
  | { tipo: "binario"; ruta: string; bytes: number; modo: "base64" | "chunked" }
  | { tipo: "borrado"; ruta: string };
```

- [ ] **Step 4: El puerto y el doble**

Añadir a `src/core/ports.ts` (los `import type` van arriba, con los demás):

```ts
import type {
  ContextoRemoto, EntradaRemota, ManifiestoRemoto,
} from "./cloudstudio.js";

/**
 * El proyecto del cliente en CloudStudio.
 *
 * Modela lo MEDIDO contra el servidor, no lo que sería cómodo: el proyecto abierto es
 * estado de sesión que caduca (`abrir` se repite), la rama activa solo se sabe por
 * `contexto`, y la descarga completa es un ZIP entero que jamás pasa por el transcript.
 */
export interface CloudStudioPort {
  abrir(nombre: string): Promise<void>;
  contexto(): Promise<ContextoRemoto>;
  /** Devuelve el ZIP en base64. Puede fallar por un fichero roto en Studio. */
  descargarZip(): Promise<string>;
  estructura(directorio?: string): Promise<ManifiestoRemoto>;
  leerTexto(ruta: string): Promise<string>;
  escribirTexto(ruta: string, contenido: string): Promise<void>;
  borrarTexto(ruta: string): Promise<void>;
  subirBinario(ruta: string, datos: Uint8Array): Promise<void>;
  ramas(): Promise<string[]>;
  crearRama(nombre: string, desde: string): Promise<void>;
  cambiarRama(nombre: string): Promise<void>;
}

export interface OpcionesCloudStudioEnMemoria {
  rama?: string;
  textos?: Record<string, string>;
  binarios?: Record<string, number>;
  /** Motivo con el que `descargarZip` rechaza; ausente = el ZIP funciona. */
  zipFalla?: string;
  /** Tope de entradas por llamada, para reproducir el truncado del servidor real. */
  topeEstructura?: number;
}

/** El proyecto remoto en memoria: recorre el flujo entero sin red ni credenciales. */
export class CloudStudioEnMemoria implements CloudStudioPort {
  readonly [ES_DOBLE] = true;
  /** Lo escrito, para poder afirmar sobre ello en los tests. */
  readonly escrituras: Array<
    | { tipo: "texto"; ruta: string; bytes: number }
    | { tipo: "binario"; ruta: string; bytes: number }
    | { tipo: "borrado"; ruta: string }
  > = [];
  private abierto: string | undefined;
  private ramaActual: string;

  constructor(private readonly opciones: OpcionesCloudStudioEnMemoria = {}) {
    this.ramaActual = opciones.rama ?? "master";
  }

  async abrir(nombre: string): Promise<void> {
    this.abierto = nombre;
  }

  private exigirAbierto(): void {
    // El servidor real responde «No project is open»; el doble no puede ser más blando,
    // o el adaptador nunca ejercitaría su reapertura.
    if (this.abierto === undefined) throw new Error("No project is open");
  }

  async contexto(): Promise<ContextoRemoto> {
    this.exigirAbierto();
    return { proyecto: this.abierto!, rama: this.ramaActual };
  }

  async descargarZip(): Promise<string> {
    this.exigirAbierto();
    if (this.opciones.zipFalla !== undefined) throw new Error(this.opciones.zipFalla);
    const { zipSync, strToU8 } = await import("fflate");
    void zipSync; void strToU8;
    throw new Error("[DOBLE] usa `zipBase64` para inyectar un ZIP concreto");
  }

  async estructura(directorio = ""): Promise<ManifiestoRemoto> {
    this.exigirAbierto();
    const todas: EntradaRemota[] = [
      ...Object.entries(this.opciones.textos ?? {}).map(([ruta, texto]) => ({ ruta, bytes: texto.length })),
      ...Object.entries(this.opciones.binarios ?? {}).map(([ruta, bytes]) => ({ ruta, bytes })),
    ].filter((e) => directorio === "" || e.ruta.startsWith(`${directorio}/`));
    return this.opciones.topeEstructura === undefined
      ? todas
      : todas.slice(0, this.opciones.topeEstructura);
  }

  async leerTexto(ruta: string): Promise<string> {
    this.exigirAbierto();
    const texto = this.opciones.textos?.[ruta];
    // El servidor rechaza por EXTENSIÓN, no por ausencia: el mensaje se replica para que
    // la vía degradada aprenda a distinguir «no existe» de «no se puede bajar así».
    if (texto === undefined) throw new Error(`File extension not allowed or missing: ${ruta}`);
    return texto;
  }

  async escribirTexto(ruta: string, contenido: string): Promise<void> {
    this.exigirAbierto();
    this.escrituras.push({ tipo: "texto", ruta, bytes: contenido.length });
  }

  async borrarTexto(ruta: string): Promise<void> {
    this.exigirAbierto();
    this.escrituras.push({ tipo: "borrado", ruta });
  }

  async subirBinario(ruta: string, datos: Uint8Array): Promise<void> {
    this.exigirAbierto();
    this.escrituras.push({ tipo: "binario", ruta, bytes: datos.byteLength });
  }

  async ramas(): Promise<string[]> {
    this.exigirAbierto();
    return [this.ramaActual];
  }

  async crearRama(nombre: string): Promise<void> {
    this.exigirAbierto();
    this.ramaActual = nombre;
  }

  async cambiarRama(nombre: string): Promise<void> {
    this.exigirAbierto();
    this.ramaActual = nombre;
  }
}
```

- [ ] **Step 5: Ajustar el doble para el ZIP inyectable**

El test de la Task 4 necesita un ZIP real. Sustituir el cuerpo de `descargarZip` por:

```ts
  async descargarZip(): Promise<string> {
    this.exigirAbierto();
    if (this.opciones.zipFalla !== undefined) throw new Error(this.opciones.zipFalla);
    if (this.opciones.zipBase64 === undefined) throw new Error("[DOBLE] falta `zipBase64`");
    return this.opciones.zipBase64;
  }
```

y añadir `zipBase64?: string;` a `OpcionesCloudStudioEnMemoria`. (`fflate` no se importa desde `core/`: el ZIP lo fabrica el test, que vive fuera de la frontera.)

- [ ] **Step 6: Verlo pasar y comprobar la frontera**

Run: `npx vitest run --exclude '**/.worktrees/**' src/core/`
Expected: PASS, incluido `imports.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/core/cloudstudio.ts src/core/ports.ts src/core/cloudstudioPuerto.test.ts
git commit -m "feat: puerto CloudStudio y su doble en memoria"
```

---

### Task 3: El plan de subida, con el candado de borrado

**Goal:** convertir un diff de git y el estado de la descarga en una lista de operaciones, sin poder emitir jamás el borrado de algo que no llegamos a bajar.

**Files:**
- Create: `src/core/planDeSubida.ts`
- Create: `src/core/planDeSubida.test.ts`

**Acceptance Criteria:**
- [ ] Con una descarga parcial, ninguna ruta ausente del conjunto `descargados` produce un `borrado`
- [ ] `.xonecode/` y todo lo que cuelga de ella se excluye siempre, venga como venga en el diff
- [ ] Un `X.xml` se excluye cuando existe `X.xne`; `app.xml` se conserva (no tiene hermano)
- [ ] El tipo se decide por extensión con la whitelist de texto MEDIDA, y el binario elige `base64` o `chunked` según el tope de 5 MB
- [ ] Es una función pura: sin disco, sin red, sin reloj

**Verify:** `npx vitest run --exclude '**/.worktrees/**' src/core/planDeSubida.test.ts` → 6 tests en verde

**Steps:**

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/core/planDeSubida.test.ts
import { describe, expect, it } from "vitest";
import { planDeSubida, TOPE_BASE64 } from "./planDeSubida.js";

const base = {
  descargados: new Set(["app.xml", "BuscarFarmacias.xne", "icons/icon_check.svg", "AlquilerCoches.js"]),
  tamanos: new Map<string, number>(),
};

describe("planDeSubida", () => {
  it("traduce el diff a operaciones por tipo", () => {
    expect(planDeSubida({
      ...base,
      cambios: [
        { clase: "modificado", ruta: "BuscarFarmacias.xne" },
        { clase: "nuevo", ruta: "icons/icon_nuevo.png" },
      ],
      tamanos: new Map([["icons/icon_nuevo.png", 1024]]),
    })).toEqual([
      { tipo: "texto", ruta: "BuscarFarmacias.xne" },
      { tipo: "binario", ruta: "icons/icon_nuevo.png", bytes: 1024, modo: "base64" },
    ]);
  });

  it("un binario por encima del tope va en trozos", () => {
    const plan = planDeSubida({
      ...base,
      cambios: [{ clase: "nuevo", ruta: "bd/gestion.db" }],
      tamanos: new Map([["bd/gestion.db", TOPE_BASE64 + 1]]),
    });
    expect(plan).toEqual([
      { tipo: "binario", ruta: "bd/gestion.db", bytes: TOPE_BASE64 + 1, modo: "chunked" },
    ]);
  });

  it("EL CANDADO: no borra lo que nunca se pudo bajar", () => {
    // Copia parcial: las fuentes no se descargaron, así que git las ve como borradas.
    const plan = planDeSubida({
      descargados: new Set(["app.xml"]),
      tamanos: new Map(),
      cambios: [
        { clase: "borrado", ruta: "fonts/PlusJakartaSans-Bold.ttf" },
        { clase: "borrado", ruta: "app.xml" },
      ],
    });
    expect(plan).toEqual([{ tipo: "borrado", ruta: "app.xml" }]);
  });

  it("nunca sube nada de .xonecode, ni siquiera si alguien lo commiteó", () => {
    expect(planDeSubida({
      ...base,
      descargados: new Set(["app.xml", ".xonecode/memoria.md"]),
      cambios: [
        { clase: "nuevo", ruta: ".xonecode/memoria.md" },
        { clase: "modificado", ruta: ".xonecode/cloudstudio/sync.json" },
        { clase: "borrado", ruta: ".xonecode/sesiones/a.json" },
      ],
    })).toEqual([]);
  });

  it("excluye la vista aplanada cuando existe su .xne, y conserva app.xml", () => {
    expect(planDeSubida({
      ...base,
      cambios: [
        { clase: "modificado", ruta: "BuscarFarmacias.xml" },
        { clase: "modificado", ruta: "app.xml" },
      ],
      fuentesXne: new Set(["BuscarFarmacias.xne"]),
    })).toEqual([{ tipo: "texto", ruta: "app.xml" }]);
  });

  it("un binario sin tamaño conocido no se inventa: se omite y se declara", () => {
    const plan = planDeSubida({
      ...base,
      cambios: [{ clase: "nuevo", ruta: "icons/sin_tamano.png" }],
    });
    expect(plan).toEqual([]);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/core/planDeSubida.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 3: Implementar**

```ts
// src/core/planDeSubida.ts
/**
 * De un diff de git a una lista de operaciones de subida.
 *
 * Es PURA a propósito: aquí vive la regla que evita una pérdida de datos, y una regla así
 * no puede depender de que el disco o la red se porten bien para poder probarse.
 */
import type { OperacionDeSubida } from "./cloudstudio.js";

/** Medido: `studio_upload_file` en modo base64 admite hasta 5 MB decodificados. */
export const TOPE_BASE64 = 5 * 1024 * 1024;

/**
 * Medido contra el servidor: `studio_get_file` (y por tanto `studio_edit_file`) solo
 * trata estas extensiones como texto. Todo lo demás es binario y va por `upload_file`.
 */
export const EXTENSIONES_DE_TEXTO = new Set([
  ".config", ".css", ".htm", ".html", ".ini", ".js", ".json", ".md",
  ".properties", ".resx", ".sql", ".svg", ".txt", ".vbs", ".xml", ".xne",
]);

export interface CambioLocal {
  clase: "nuevo" | "modificado" | "borrado";
  ruta: string;
}

export interface EntradaDelPlan {
  cambios: CambioLocal[];
  /** Lo que la descarga trajo DE VERDAD. El candado se apoya en esto. */
  descargados: ReadonlySet<string>;
  /** Tamaño local de cada ruta; sin él, un binario no se puede subir. */
  tamanos: ReadonlyMap<string, number>;
  /** Los `.xne` presentes, para reconocer las vistas aplanadas. */
  fuentesXne?: ReadonlySet<string>;
}

const extensionDe = (ruta: string): string => {
  const punto = ruta.lastIndexOf(".");
  return punto === -1 ? "" : ruta.slice(punto).toLowerCase();
};

/** `X.xml` es vista aplanada si existe `X.xne`. `app.xml` no tiene hermano: es fuente. */
const esVistaAplanada = (ruta: string, fuentes: ReadonlySet<string>): boolean =>
  ruta.endsWith(".xml") && fuentes.has(`${ruta.slice(0, -4)}.xne`);

export function planDeSubida(entrada: EntradaDelPlan): OperacionDeSubida[] {
  const fuentes = entrada.fuentesXne ?? new Set<string>();
  const plan: OperacionDeSubida[] = [];

  for (const cambio of entrada.cambios) {
    // 1. La carpeta del harness no sube NUNCA. Va primero porque ninguna otra regla
    //    debe poder colarla: ahí viven memoria, sesiones y planes.
    if (cambio.ruta === ".xonecode" || cambio.ruta.startsWith(".xonecode/")) continue;

    // 2. La fuente es el `.xne`; el `.xml` lo regenera Studio.
    if (esVistaAplanada(cambio.ruta, fuentes)) continue;

    if (cambio.clase === "borrado") {
      // 3. EL CANDADO. Con una copia parcial, git ve como borrado todo lo que no se pudo
      //    bajar (binarios, sobre todo). Emitir esos borrados vaciaría el proyecto en
      //    Studio. Solo se borra lo que llegamos a tener.
      if (entrada.descargados.has(cambio.ruta)) plan.push({ tipo: "borrado", ruta: cambio.ruta });
      continue;
    }

    if (EXTENSIONES_DE_TEXTO.has(extensionDe(cambio.ruta))) {
      plan.push({ tipo: "texto", ruta: cambio.ruta });
      continue;
    }

    const bytes = entrada.tamanos.get(cambio.ruta);
    // 4. Sin tamaño no se decide el modo de subida. Se omite y quien ejecuta lo declara:
    //    inventar un modo es cómo se sube un fichero a medias.
    if (bytes === undefined) continue;
    plan.push({
      tipo: "binario",
      ruta: cambio.ruta,
      bytes,
      modo: bytes > TOPE_BASE64 ? "chunked" : "base64",
    });
  }

  return plan;
}
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/core/planDeSubida.test.ts`
Expected: PASS (6)

- [ ] **Step 5: Commit**

```bash
git add src/core/planDeSubida.ts src/core/planDeSubida.test.ts
git commit -m "feat: plan de subida puro, con el candado de borrado parcial"
```

---

### Task 4: El adaptador real sobre MCP

**Goal:** implementar `CloudStudioPort` contra el cliente MCP ya conectado, sobreviviendo a la caducidad de la sesión.

**Files:**
- Create: `src/agent/cloudstudioClient.ts`
- Create: `src/agent/cloudstudioClient.test.ts`

**Acceptance Criteria:**
- [ ] Cada método llama a la tool medida con sus argumentos reales (`studio_open_project`, `studio_get_context`, `studio_download_project`, `studio_get_project_structure`, `studio_get_file`, `studio_edit_file`, `studio_upload_file`, `studio_manage_branches`)
- [ ] Ante «No project is open», reabre el proyecto y **reintenta una vez**; si vuelve a fallar, propaga
- [ ] El resultado textual del SDK (`content[].text`) se desenvuelve
- [ ] Los errores nunca incluyen el contenido del fichero ni el token
- [ ] Se prueba con un cliente MCP falso: ni red ni SDK real

**Verify:** `npx vitest run --exclude '**/.worktrees/**' src/agent/cloudstudioClient.test.ts` → 5 tests en verde

**Steps:**

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/agent/cloudstudioClient.test.ts
import { describe, expect, it } from "vitest";
import { clienteCloudStudio, type LlamadaMcp } from "./cloudstudioClient.js";

/** Cliente MCP falso: registra las llamadas y responde con lo que se le programe. */
function clienteFalso(respuestas: Array<unknown | Error>) {
  const llamadas: LlamadaMcp[] = [];
  let indice = 0;
  return {
    llamadas,
    invocar: async (nombre: string, argumentos: Record<string, unknown>) => {
      llamadas.push({ nombre, argumentos });
      const respuesta = respuestas[indice++];
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    },
  };
}

describe("clienteCloudStudio", () => {
  it("abre el proyecto por NOMBRE: el id lo rechaza el servidor", async () => {
    const falso = clienteFalso([{ status: "project_open" }]);
    await clienteCloudStudio(falso.invocar, "AppForTest").abrir("AppForTest");
    expect(falso.llamadas[0]).toEqual({
      nombre: "studio_open_project",
      argumentos: { project: "AppForTest" },
    });
  });

  it("lee el contexto y devuelve proyecto y rama", async () => {
    const falso = clienteFalso([{ project: "AppForTest", branch: "master" }]);
    expect(await clienteCloudStudio(falso.invocar, "AppForTest").contexto())
      .toEqual({ proyecto: "AppForTest", rama: "master" });
  });

  it("reabre y reintenta UNA vez cuando la sesión ha caducado", async () => {
    const falso = clienteFalso([
      new Error("No project is open. Use the studio_open_project tool"),
      { status: "project_open" },
      "contenido",
    ]);
    expect(await clienteCloudStudio(falso.invocar, "AppForTest").leerTexto("app.ini")).toBe("contenido");
    expect(falso.llamadas.map((l) => l.nombre)).toEqual([
      "studio_get_file", "studio_open_project", "studio_get_file",
    ]);
  });

  it("si tras reabrir vuelve a fallar, propaga en vez de reintentar sin fin", async () => {
    const falso = clienteFalso([
      new Error("No project is open"),
      { status: "project_open" },
      new Error("No project is open"),
    ]);
    await expect(clienteCloudStudio(falso.invocar, "AppForTest").leerTexto("app.ini"))
      .rejects.toThrow(/No project is open/);
    expect(falso.llamadas).toHaveLength(3);
  });

  it("desenvuelve el bloque de texto del SDK", async () => {
    const falso = clienteFalso([{ content: [{ type: "text", text: "hola" }] }]);
    expect(await clienteCloudStudio(falso.invocar, "AppForTest").leerTexto("a.js")).toBe("hola");
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/agent/cloudstudioClient.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 3: Implementar**

```ts
// src/agent/cloudstudioClient.ts
/**
 * `CloudStudioPort` sobre el MCP real.
 *
 * La costura es una función `invocar`, no el `Client` del SDK: así los tests prueban el
 * comportamiento —reapertura, desenvoltura, argumentos— sin red ni SDK.
 */
import type { CloudStudioPort } from "../core/ports.js";
import type { ContextoRemoto, ManifiestoRemoto } from "../core/cloudstudio.js";

export interface LlamadaMcp {
  nombre: string;
  argumentos: Record<string, unknown>;
}

export type Invocar = (nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>;

/** El servidor pierde el proyecto abierto al caducar la sesión; lo dice con este texto. */
const SESION_PERDIDA = /no project is open/i;

/** Los SDK MCP envuelven el resultado en `content[].text`. */
function texto(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (typeof valor === "object" && valor !== null) {
    const contenido = (valor as Record<string, unknown>).content;
    if (Array.isArray(contenido)) {
      return contenido
        .filter((b): b is { type: string; text: string } =>
          typeof b === "object" && b !== null && (b as { type?: string }).type === "text")
        .map((b) => b.text)
        .join("");
    }
  }
  return "";
}

function registro(valor: unknown): Record<string, unknown> {
  if (typeof valor === "string") {
    try { return JSON.parse(valor) as Record<string, unknown>; } catch { return {}; }
  }
  const desenvuelto = texto(valor);
  if (desenvuelto !== "") {
    try { return JSON.parse(desenvuelto) as Record<string, unknown>; } catch { /* sigue abajo */ }
  }
  return typeof valor === "object" && valor !== null ? valor as Record<string, unknown> : {};
}

export function clienteCloudStudio(invocar: Invocar, proyecto: string): CloudStudioPort {
  /**
   * Una llamada que sobrevive a la caducidad: reabre y reintenta UNA vez. Una segunda
   * vuelta convertiría un servidor caído en un bucle silencioso.
   */
  const conSesion = async (nombre: string, argumentos: Record<string, unknown>): Promise<unknown> => {
    try {
      return await invocar(nombre, argumentos);
    } catch (error) {
      if (!SESION_PERDIDA.test((error as Error).message)) throw error;
      await invocar("studio_open_project", { project: proyecto });
      return invocar(nombre, argumentos);
    }
  };

  const entradas = (valor: unknown): ManifiestoRemoto => {
    const arbol = registro(valor);
    const salida: ManifiestoRemoto = [];
    const recorrer = (nodo: unknown): void => {
      if (typeof nodo !== "object" || nodo === null) return;
      const n = nodo as Record<string, unknown>;
      if (n.type === "file" && typeof n.path === "string") {
        salida.push({ ruta: n.path, bytes: typeof n.size === "number" ? n.size : 0 });
      }
      if (Array.isArray(n.children)) for (const hijo of n.children) recorrer(hijo);
    };
    recorrer(arbol.tree ?? arbol);
    return salida;
  };

  return {
    async abrir(nombre) {
      // Por NOMBRE: medido, el servidor rechaza el identificador («not found for user»).
      await invocar("studio_open_project", { project: nombre });
    },
    async contexto(): Promise<ContextoRemoto> {
      const r = registro(await conSesion("studio_get_context", {}));
      return { proyecto: String(r.project ?? ""), rama: String(r.branch ?? "") };
    },
    async descargarZip() {
      const r = registro(await conSesion("studio_download_project", { unified: false }));
      const zip = r.base64Zip;
      if (typeof zip !== "string" || zip === "") throw new Error("CloudStudio no devolvió el ZIP del proyecto");
      return zip;
    },
    async estructura(directorio) {
      return entradas(await conSesion("studio_get_project_structure", {
        mode: "filesystem",
        maxFiles: 2000,
        ...(directorio === undefined || directorio === "" ? {} : { directoryPath: directorio }),
      }));
    },
    async leerTexto(ruta) {
      return texto(await conSesion("studio_get_file", { filePath: ruta })) ||
        String(await conSesion("studio_get_file", { filePath: ruta }));
    },
    async escribirTexto(ruta, contenido) {
      await conSesion("studio_edit_file", { filePath: ruta, content: contenido, editMode: "replace" });
    },
    async borrarTexto(ruta) {
      await conSesion("studio_edit_file", { filePath: ruta, editMode: "delete" });
    },
    async subirBinario(ruta, datos) {
      // El modo lo decide `planDeSubida`; aquí solo se ejecuta el envío directo.
      await conSesion("studio_upload_file", {
        filePath: ruta,
        source: "base64",
        base64Content: Buffer.from(datos).toString("base64"),
      });
    },
    async ramas() {
      const bruto = await conSesion("studio_manage_branches", { operation: "list" });
      const lista = JSON.parse(texto(bruto) || JSON.stringify(bruto)) as unknown;
      return Array.isArray(lista)
        ? lista.flatMap((r) => typeof r === "object" && r !== null && typeof (r as { Key?: unknown }).Key === "string"
            ? [(r as { Key: string }).Key] : [])
        : [];
    },
    async crearRama(nombre, desde) {
      await conSesion("studio_manage_branches", { operation: "create", branchName: nombre, targetBranch: desde });
    },
    async cambiarRama(nombre) {
      await conSesion("studio_manage_branches", { operation: "switch", branchName: nombre });
    },
  };
}
```

- [ ] **Step 4: Simplificar `leerTexto`**

La doble invocación del paso anterior es un error de escritura y además duplica llamadas.
Sustituir por:

```ts
    async leerTexto(ruta) {
      const bruto = await conSesion("studio_get_file", { filePath: ruta });
      const desenvuelto = texto(bruto);
      return desenvuelto !== "" ? desenvuelto : typeof bruto === "string" ? bruto : "";
    },
```

- [ ] **Step 5: Verlo pasar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/agent/cloudstudioClient.test.ts`
Expected: PASS (5)

- [ ] **Step 6: Commit**

```bash
git add src/agent/cloudstudioClient.ts src/agent/cloudstudioClient.test.ts
git commit -m "feat: adaptador CloudStudio sobre MCP, con reapertura de sesión"
```

---

### Task 5: Enumeración del remoto sorteando el truncado

**Goal:** obtener el manifiesto completo aunque `get_project_structure` corte, porque el manifiesto es lo que protege el borrado.

**Files:**
- Create: `src/agent/manifiesto.ts`
- Create: `src/agent/manifiesto.test.ts`

**Acceptance Criteria:**
- [ ] Con un tope artificial de N entradas, la enumeración recorre subdirectorios y devuelve TODAS las rutas
- [ ] No repite entradas cuando un directorio aparece en dos recorridos
- [ ] Un directorio que falla no aborta el resto: se anota como no enumerado
- [ ] Devuelve las rutas en POSIX, ordenadas

**Verify:** `npx vitest run --exclude '**/.worktrees/**' src/agent/manifiesto.test.ts` → 4 tests en verde

**Steps:**

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/agent/manifiesto.test.ts
import { describe, expect, it } from "vitest";
import { CloudStudioEnMemoria } from "../core/ports.js";
import { enumerarRemoto } from "./manifiesto.js";

describe("enumerarRemoto", () => {
  const textos = {
    "app.xml": "<app/>",
    "icons/a.svg": "<svg/>",
    "icons/b.svg": "<svg/>",
    "doc/guia.md": "# guía",
  };

  it("devuelve todo cuando no hay truncado", async () => {
    const puerto = new CloudStudioEnMemoria({ textos });
    await puerto.abrir("Demo");
    const { manifiesto } = await enumerarRemoto(puerto);
    expect(manifiesto.map((e) => e.ruta)).toEqual(["app.xml", "doc/guia.md", "icons/a.svg", "icons/b.svg"]);
  });

  it("recorre subdirectorios cuando el servidor trunca", async () => {
    const puerto = new CloudStudioEnMemoria({ textos, topeEstructura: 2 });
    await puerto.abrir("Demo");
    const { manifiesto } = await enumerarRemoto(puerto);
    expect(manifiesto.map((e) => e.ruta).sort()).toEqual(["app.xml", "doc/guia.md", "icons/a.svg", "icons/b.svg"]);
  });

  it("no duplica una entrada vista dos veces", async () => {
    const puerto = new CloudStudioEnMemoria({ textos, topeEstructura: 3 });
    await puerto.abrir("Demo");
    const { manifiesto } = await enumerarRemoto(puerto);
    expect(new Set(manifiesto.map((e) => e.ruta)).size).toBe(manifiesto.length);
  });

  it("un directorio que falla no tira la enumeración", async () => {
    const puerto = new CloudStudioEnMemoria({ textos, topeEstructura: 2 });
    await puerto.abrir("Demo");
    const roto = {
      ...puerto,
      estructura: async (dir?: string) =>
        dir === "icons" ? Promise.reject(new Error("boom")) : puerto.estructura(dir),
    } as typeof puerto;
    const { manifiesto, noEnumerados } = await enumerarRemoto(roto);
    expect(manifiesto.some((e) => e.ruta === "app.xml")).toBe(true);
    expect(noEnumerados).toEqual(["icons"]);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/agent/manifiesto.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 3: Implementar**

```ts
// src/agent/manifiesto.ts
/**
 * El inventario del proyecto remoto.
 *
 * `get_project_structure` se trunca (medido: con `maxFiles:60` ya devolvía
 * `truncated:true`, y el tope duro es 2000). Como el manifiesto es lo que impide borrar
 * en Studio lo que no pudimos bajar, una enumeración incompleta no es un detalle
 * cosmético: es el candado con una pata menos.
 */
import type { CloudStudioPort } from "../core/ports.js";
import type { ManifiestoRemoto } from "../core/cloudstudio.js";

export interface ResultadoDeEnumeracion {
  manifiesto: ManifiestoRemoto;
  /** Directorios que no se pudieron listar. Salen en el informe: callarlos es peor. */
  noEnumerados: string[];
}

const directorioDe = (ruta: string): string => {
  const barra = ruta.lastIndexOf("/");
  return barra === -1 ? "" : ruta.slice(0, barra);
};

export async function enumerarRemoto(puerto: CloudStudioPort): Promise<ResultadoDeEnumeracion> {
  const vistas = new Map<string, number>();
  const noEnumerados: string[] = [];
  const pendientes: string[] = [""];
  const visitados = new Set<string>();

  while (pendientes.length > 0) {
    const directorio = pendientes.shift()!;
    if (visitados.has(directorio)) continue;
    visitados.add(directorio);

    let entradas;
    try {
      entradas = await puerto.estructura(directorio === "" ? undefined : directorio);
    } catch {
      // El motivo no se propaga al mensaje: puede traer rutas del servidor. Basta con
      // saber QUÉ no se enumeró, que es lo que condiciona el candado.
      noEnumerados.push(directorio);
      continue;
    }

    for (const entrada of entradas) {
      vistas.set(entrada.ruta, entrada.bytes);
      // Cada directorio intermedio se vuelve a pedir por su cuenta: si esta respuesta
      // venía truncada, el recorrido por subdirectorios recupera lo que faltó.
      const padre = directorioDe(entrada.ruta);
      if (padre !== "" && !visitados.has(padre)) pendientes.push(padre);
    }
  }

  const manifiesto = [...vistas.entries()]
    .map(([ruta, bytes]) => ({ ruta, bytes }))
    .sort((a, b) => a.ruta.localeCompare(b.ruta));
  return { manifiesto, noEnumerados };
}
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/agent/manifiesto.test.ts`
Expected: PASS (4)

- [ ] **Step 5: Commit**

```bash
git add src/agent/manifiesto.ts src/agent/manifiesto.test.ts
git commit -m "feat: enumera el remoto sorteando el truncado de la estructura"
```

---

### Task 6: La descarga, en dos vías, con pool acotado

**Goal:** traerse el proyecto por ZIP y, si falla, fichero a fichero en paralelo, dejando `sync.json` con el manifiesto y lo realmente descargado.

**Files:**
- Create: `src/agent/descarga.ts`
- Create: `src/agent/descarga.test.ts`

**Acceptance Criteria:**
- [ ] Vía ZIP: extrae en la raíz y marca `via: "zip"`, con `descargados` = las rutas del ZIP
- [ ] Si el ZIP falla, cae a la vía degradada **sin volver a intentarlo** y guarda el motivo
- [ ] La vía degradada solo pide lo que la whitelist de texto permite, y marca `via: "parcial"`
- [ ] La concurrencia nunca supera el tope: se comprueba con un contador de llamadas simultáneas
- [ ] Un fichero que falla no aborta la descarga; queda fuera de `descargados`
- [ ] `sync.json` se escribe en `.xonecode/cloudstudio/` y es JSON legible

**Verify:** `npx vitest run --exclude '**/.worktrees/**' src/agent/descarga.test.ts` → 6 tests en verde

**Steps:**

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/agent/descarga.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { CloudStudioEnMemoria } from "../core/ports.js";
import { descargarProyecto, CONCURRENCIA } from "./descarga.js";

const raizNueva = () => mkdtempSync(join(tmpdir(), "xc-desc-"));
const zip = (f: Record<string, string>) => Buffer.from(zipSync(
  Object.fromEntries(Object.entries(f).map(([r, t]) => [r, strToU8(t)]))
)).toString("base64");

const proyecto = { id: "96fe", nombre: "AppForTest" };

describe("descargarProyecto", () => {
  it("vía ZIP: extrae y declara la copia completa", async () => {
    const raiz = raizNueva();
    const puerto = new CloudStudioEnMemoria({
      zipBase64: zip({ "app.xml": "<app/>", "icons/a.svg": "<svg/>" }),
      textos: { "app.xml": "<app/>", "icons/a.svg": "<svg/>" },
    });
    const estado = await descargarProyecto({ puerto, raiz, proyecto });

    expect(estado.via).toBe("zip");
    expect(readFileSync(join(raiz, "app.xml"), "utf8")).toBe("<app/>");
    expect(estado.descargados.sort()).toEqual(["app.xml", "icons/a.svg"]);
  });

  it("si el ZIP falla, baja fichero a fichero y guarda el motivo", async () => {
    const raiz = raizNueva();
    const puerto = new CloudStudioEnMemoria({
      zipFalla: "colección AlquilerCoches con error de sintaxis",
      textos: { "app.xml": "<app/>", "BuscarFarmacias.js": "function f(){}" },
    });
    const estado = await descargarProyecto({ puerto, raiz, proyecto });

    expect(estado.via).toBe("parcial");
    expect(estado.motivo).toMatch(/error de sintaxis/);
    expect(readFileSync(join(raiz, "BuscarFarmacias.js"), "utf8")).toBe("function f(){}");
  });

  it("la vía degradada NO pide binarios: el servidor no los sirve por fichero", async () => {
    const raiz = raizNueva();
    const puerto = new CloudStudioEnMemoria({
      zipFalla: "roto",
      textos: { "app.xml": "<app/>" },
      binarios: { "fonts/A.ttf": 126228, "icons/bg.png": 354523 },
    });
    const estado = await descargarProyecto({ puerto, raiz, proyecto });

    expect(estado.descargados).toEqual(["app.xml"]);
    expect(estado.manifiesto.map((e) => e.ruta)).toContain("fonts/A.ttf");
    expect(existsSync(join(raiz, "fonts", "A.ttf"))).toBe(false);
  });

  it("no supera la concurrencia acordada", async () => {
    const raiz = raizNueva();
    const textos = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`f${i}.js`, `// ${i}`])
    );
    const base = new CloudStudioEnMemoria({ zipFalla: "roto", textos });
    let enVuelo = 0;
    let maximo = 0;
    const puerto = {
      ...base,
      leerTexto: async (ruta: string) => {
        enVuelo += 1;
        maximo = Math.max(maximo, enVuelo);
        await new Promise((r) => setTimeout(r, 1));
        enVuelo -= 1;
        return base.leerTexto(ruta);
      },
    } as typeof base;

    await descargarProyecto({ puerto, raiz, proyecto });
    expect(maximo).toBeLessThanOrEqual(CONCURRENCIA);
    expect(maximo).toBeGreaterThan(1);
  });

  it("un fichero que falla no aborta, y queda fuera de descargados", async () => {
    const raiz = raizNueva();
    const base = new CloudStudioEnMemoria({
      zipFalla: "roto",
      textos: { "app.xml": "<app/>", "roto.js": "x" },
    });
    const puerto = {
      ...base,
      leerTexto: async (ruta: string) =>
        ruta === "roto.js" ? Promise.reject(new Error("500")) : base.leerTexto(ruta),
    } as typeof base;

    const estado = await descargarProyecto({ puerto, raiz, proyecto });
    expect(estado.descargados).toEqual(["app.xml"]);
  });

  it("deja sync.json legible bajo .xonecode/cloudstudio", async () => {
    const raiz = raizNueva();
    const puerto = new CloudStudioEnMemoria({ zipBase64: zip({ "app.xml": "<app/>" }), textos: { "app.xml": "<app/>" } });
    await descargarProyecto({ puerto, raiz, proyecto });

    const guardado = JSON.parse(readFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "utf8"));
    expect(guardado.proyecto).toEqual(proyecto);
    expect(guardado.via).toBe("zip");
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/agent/descarga.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 3: Implementar**

```ts
// src/agent/descarga.ts
/**
 * Traerse el proyecto: ZIP si se puede, fichero a fichero si no.
 *
 * La vía degradada no es «otra descarga»: es una descarga PARCIAL, porque el servidor no
 * sirve binarios por fichero (medido: `studio_get_file` rechaza `.jpg` por extensión).
 * Por eso se escribe siempre qué se pudo traer: es lo que después impide borrar en Studio
 * lo que aquí no llegó.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CloudStudioPort } from "../core/ports.js";
import type { EstadoDeSync } from "../core/cloudstudio.js";
import { EXTENSIONES_DE_TEXTO } from "../core/planDeSubida.js";
import { NOMBRE_CARPETA } from "./configEnDisco.js";
import { extraerZipBase64 } from "./zip.js";
import { enumerarRemoto } from "./manifiesto.js";

/** Bastante para que la espera de red se solape; poco para no parecer un ataque. */
export const CONCURRENCIA = 6;

export interface OpcionesDeDescarga {
  puerto: CloudStudioPort;
  raiz: string;
  proyecto: { id: string; nombre: string };
  informar?: (texto: string) => void;
}

const extensionDe = (ruta: string): string => {
  const punto = ruta.lastIndexOf(".");
  return punto === -1 ? "" : ruta.slice(punto).toLowerCase();
};

/** Pool acotado. No hay `worker_threads`: esto es espera de red, no CPU. */
async function enParalelo<T>(tareas: Array<() => Promise<T>>, tope: number): Promise<void> {
  let siguiente = 0;
  const obreros = Array.from({ length: Math.min(tope, tareas.length) }, async () => {
    while (siguiente < tareas.length) {
      const mia = tareas[siguiente++]!;
      await mia();
    }
  });
  await Promise.all(obreros);
}

function escribir(raiz: string, ruta: string, contenido: string): void {
  const destino = join(raiz, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  // Se escriben los bytes tal cual: normalizar finales de línea produce diffs fantasma
  // en cada sync y subidas que no cambian nada.
  writeFileSync(destino, contenido, { encoding: "utf8" });
}

export function rutaSyncJson(raiz: string): string {
  return join(raiz, NOMBRE_CARPETA, "cloudstudio", "sync.json");
}

export async function descargarProyecto(opciones: OpcionesDeDescarga): Promise<EstadoDeSync> {
  const { puerto, raiz, proyecto, informar = () => {} } = opciones;

  await puerto.abrir(proyecto.nombre);
  const { rama } = await puerto.contexto();
  const { manifiesto, noEnumerados } = await enumerarRemoto(puerto);
  if (noEnumerados.length > 0) {
    informar(`no se pudo listar: ${noEnumerados.join(", ")}\n`);
  }

  let via: EstadoDeSync["via"] = "zip";
  let motivo: string | undefined;
  let descargados: string[] = [];

  try {
    descargados = extraerZipBase64(await puerto.descargarZip(), raiz);
  } catch (error) {
    // Un solo intento: si el ZIP falla por un fichero roto en Studio, volverá a fallar.
    via = "parcial";
    motivo = (error as Error).message;
    informar(`el ZIP falló (${motivo}); bajando fichero a fichero\n`);

    const candidatos = manifiesto.filter((e) => EXTENSIONES_DE_TEXTO.has(extensionDe(e.ruta)));
    const traidos: string[] = [];
    await enParalelo(candidatos.map((entrada) => async () => {
      try {
        escribir(raiz, entrada.ruta, await puerto.leerTexto(entrada.ruta));
        traidos.push(entrada.ruta);
      } catch {
        // Un fichero que falla no tumba la descarga: simplemente no estará, y por no
        // estar en `descargados` queda protegido contra el borrado.
      }
    }), CONCURRENCIA);
    descargados = traidos;
  }

  const estado: EstadoDeSync = {
    proyecto,
    rama,
    fecha: new Date().toISOString(),
    via,
    manifiesto,
    descargados: [...descargados].sort(),
    ...(motivo === undefined ? {} : { motivo }),
  };

  const ruta = rutaSyncJson(raiz);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(estado, null, 2) + "\n");
  return estado;
}
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/agent/descarga.test.ts`
Expected: PASS (6)

- [ ] **Step 5: Commit**

```bash
git add src/agent/descarga.ts src/agent/descarga.test.ts
git commit -m "feat: descarga en dos vías con manifiesto y pool acotado"
```

---

### Task 7: El git local como libro de cuentas

**Goal:** dejar el repo local listo tras la descarga y saber, con git y sin estado propio, qué falta por subir.

**Files:**
- Create: `src/agent/gitSync.ts`
- Create: `src/agent/gitSync.test.ts`

**Acceptance Criteria:**
- [ ] En una carpeta sin repo, `git init -b <rama origen>`; en una que ya lo es, no se inicia nada
- [ ] `.xonecode/` acaba en `.git/info/exclude`, **nunca** en `.gitignore`
- [ ] `core.autocrlf` queda en `false` en el repo local
- [ ] El commit de baseline se hace con un `GIT_INDEX_FILE` privado y **no toca el índice del usuario**
- [ ] Queda configurado el remoto `cloudstudio` con su ref y el upstream de la rama
- [ ] `cambiosPendientes` devuelve el diff contra la ref, con clases `nuevo`/`modificado`/`borrado`
- [ ] `marcarSubido` mueve la ref con mensaje de reflog

**Verify:** `npx vitest run --exclude '**/.worktrees/**' src/agent/gitSync.test.ts` → 6 tests en verde

**Steps:**

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/agent/gitSync.test.ts
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepararRepo, cambiosPendientes, marcarSubido, REMOTO } from "./gitSync.js";

const git = (raiz: string, ...args: string[]) =>
  execFileSync("git", args, { cwd: raiz, encoding: "utf8" }).trim();

function proyecto(): string {
  const raiz = mkdtempSync(join(tmpdir(), "xc-git-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>");
  mkdirSync(join(raiz, ".xonecode"), { recursive: true });
  writeFileSync(join(raiz, ".xonecode", "memoria.md"), "# memoria");
  return raiz;
}

describe("prepararRepo", () => {
  it("inicia el repo con el nombre de la rama origen", async () => {
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    expect(git(raiz, "rev-parse", "--abbrev-ref", "HEAD")).toBe("master");
  });

  it("excluye .xonecode en info/exclude, no en .gitignore", async () => {
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    expect(readFileSync(join(raiz, ".git", "info", "exclude"), "utf8")).toContain(".xonecode/");
    // .gitignore es un fichero del PROYECTO: acabaría subido a CloudStudio.
    expect(existsSync(join(raiz, ".gitignore"))).toBe(false);
  });

  it("deja autocrlf desactivado y el remoto configurado", async () => {
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    expect(git(raiz, "config", "core.autocrlf")).toBe("false");
    expect(git(raiz, "config", `branch.master.remote`)).toBe(REMOTO);
    expect(git(raiz, "rev-parse", `refs/remotes/${REMOTO}/master`)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("no toca el índice del usuario", async () => {
    const raiz = proyecto();
    execFileSync("git", ["init", "-q", "-b", "master"], { cwd: raiz });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: raiz });
    execFileSync("git", ["config", "user.name", "t"], { cwd: raiz });
    writeFileSync(join(raiz, "pendiente.js"), "x");
    execFileSync("git", ["add", "pendiente.js"], { cwd: raiz });

    await prepararRepo(raiz, "master");
    // Lo que el usuario tenía en staging sigue ahí.
    expect(git(raiz, "diff", "--cached", "--name-only")).toContain("pendiente.js");
  });
});

describe("cambiosPendientes y marcarSubido", () => {
  it("ve lo que falta por subir, y deja de verlo al marcarlo", async () => {
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    writeFileSync(join(raiz, "app.xml"), "<app cambiada/>");
    writeFileSync(join(raiz, "nuevo.js"), "// nuevo");
    git(raiz, "add", "-A");
    git(raiz, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "trabajo");

    expect(await cambiosPendientes(raiz, "master")).toEqual([
      { clase: "modificado", ruta: "app.xml" },
      { clase: "nuevo", ruta: "nuevo.js" },
    ]);

    await marcarSubido(raiz, "master", "sync: 2 ficheros");
    expect(await cambiosPendientes(raiz, "master")).toEqual([]);
    expect(git(raiz, "reflog", "show", `${REMOTO}/master`)).toContain("sync: 2 ficheros");
  });

  it("no lista nada de .xonecode aunque exista", async () => {
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    writeFileSync(join(raiz, ".xonecode", "memoria.md"), "# cambiada");
    expect(await cambiosPendientes(raiz, "master")).toEqual([]);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/agent/gitSync.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 3: Implementar**

```ts
// src/agent/gitSync.ts
/**
 * El git local como libro de cuentas de la sincronización.
 *
 * La idea entera: CloudStudio se declara como un remoto SIN servidor git detrás, y su
 * estado vive en una ref de seguimiento. Así `git status` responde «¿está subido?» sin
 * que xonecode invente un fichero de estado — y dos fuentes de verdad para lo mismo es
 * como se rompe esto a los tres meses.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CambioLocal } from "../core/planDeSubida.js";

const ejecutar = promisify(execFile);

export const REMOTO = "cloudstudio";
const EXCLUSION = ".xonecode/";

/** Índice temporal propio: mismo patrón que `agent/instantanea.ts`, y por lo mismo. */
function indicePrivado(): { ruta: string; limpiar: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "xonecode-sync-"));
  return { ruta: join(dir, "git.index"), limpiar: () => rmSync(dir, { recursive: true, force: true }) };
}

const git = (raiz: string, args: string[], env?: NodeJS.ProcessEnv) =>
  ejecutar("git", args, { cwd: raiz, env: env ?? process.env, maxBuffer: 32 * 1024 * 1024 });

async function esRepo(raiz: string): Promise<boolean> {
  try {
    const { stdout } = await git(raiz, ["rev-parse", "--is-inside-work-tree"]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Deja el repo listo tras una descarga: repo, exclusiones, remoto y baseline.
 *
 * El commit de baseline se construye con índice privado para no tocar el staging del
 * usuario, que puede tener trabajo a medias cuando hace un `/sync`.
 */
export async function prepararRepo(raiz: string, ramaOrigen: string): Promise<string> {
  if (!(await esRepo(raiz))) {
    // La rama local se llama como la remota: dos vocabularios para lo mismo confunden.
    await git(raiz, ["init", "-q", "-b", ramaOrigen]);
  }

  // `.gitignore` es un fichero del PROYECTO y acabaría subido a CloudStudio; `info/exclude`
  // es local del repo y no viaja a ninguna parte.
  const exclude = join(raiz, ".git", "info", "exclude");
  mkdirSync(join(raiz, ".git", "info"), { recursive: true });
  const actual = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  if (!actual.includes(EXCLUSION)) {
    appendFileSync(exclude, `${actual.endsWith("\n") || actual === "" ? "" : "\n"}${EXCLUSION}\n`);
  }

  // Sin esto, el texto que vuelve del servidor se normaliza al escribirlo y cada `/sync`
  // produce diffs fantasma.
  await git(raiz, ["config", "core.autocrlf", "false"]);
  await git(raiz, ["config", `remote.${REMOTO}.url`, `cloudstudio://${ramaOrigen}`]);
  await git(raiz, ["config", `remote.${REMOTO}.fetch`, `+refs/heads/*:refs/remotes/${REMOTO}/*`]);
  await git(raiz, ["config", `branch.${ramaOrigen}.remote`, REMOTO]);
  await git(raiz, ["config", `branch.${ramaOrigen}.merge`, `refs/heads/${ramaOrigen}`]);

  const idx = indicePrivado();
  try {
    const env = { ...process.env, GIT_INDEX_FILE: idx.ruta };
    await git(raiz, ["add", "-A", "--", "."], env);
    const { stdout: arbol } = await git(raiz, ["write-tree"], env);
    const { stdout: commit } = await git(raiz, [
      "-c", "user.email=xonecode@local", "-c", "user.name=xonecode",
      "commit-tree", arbol.trim(), "-m", `estado de CloudStudio (${ramaOrigen})`,
    ], env);
    const sha = commit.trim();
    await git(raiz, ["update-ref", "-m", "sync: descarga inicial", `refs/remotes/${REMOTO}/${ramaOrigen}`, sha]);

    // Si la rama local aún no tiene commits, el baseline ES su primer commit: así el
    // usuario parte de un árbol limpio en vez de con todo el proyecto sin commitear.
    try {
      await git(raiz, ["rev-parse", "--verify", "HEAD"]);
    } catch {
      await git(raiz, ["update-ref", "-m", "sync: descarga inicial", `refs/heads/${ramaOrigen}`, sha]);
      await git(raiz, ["reset", "-q", "--mixed"]);
    }
    return sha;
  } finally {
    idx.limpiar();
  }
}

const CLASE: Record<string, CambioLocal["clase"]> = {
  A: "nuevo", D: "borrado", M: "modificado", R: "modificado", C: "modificado", T: "modificado",
};

/** Lo que hay en local y no está subido: el diff contra la ref de seguimiento. */
export async function cambiosPendientes(raiz: string, rama: string): Promise<CambioLocal[]> {
  const { stdout } = await git(raiz, [
    "diff", "--name-status", `refs/remotes/${REMOTO}/${rama}`, "--", ".",
  ]);
  return stdout
    .split("\n")
    .filter((linea) => linea.trim() !== "")
    .flatMap((linea) => {
      const [marca, ...resto] = linea.split("\t");
      const clase = CLASE[marca!.charAt(0)];
      const ruta = resto[resto.length - 1];
      return clase === undefined || ruta === undefined ? [] : [{ clase, ruta }];
    })
    .sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/** «Simular el push»: mover la ref. Solo se llama cuando la subida terminó ENTERA. */
export async function marcarSubido(raiz: string, rama: string, mensaje: string): Promise<void> {
  const { stdout } = await git(raiz, ["rev-parse", "HEAD"]);
  await git(raiz, ["update-ref", "-m", mensaje, `refs/remotes/${REMOTO}/${rama}`, stdout.trim()]);
}

/** ¿Hay cambios sin commitear? La subida exige árbol limpio: se sube un commit, no un borrador. */
export async function arbolLimpio(raiz: string): Promise<boolean> {
  const { stdout } = await git(raiz, ["status", "--porcelain", "--", "."]);
  return stdout.trim() === "";
}
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/agent/gitSync.test.ts`
Expected: PASS (6)

- [ ] **Step 5: Commit**

```bash
git add src/agent/gitSync.ts src/agent/gitSync.test.ts
git commit -m "feat: git local como libro de cuentas, con ref de seguimiento"
```

---

### Task 8: Ejecutar la subida y dejar registro

**Goal:** subir el plan aprobado, mover la ref solo si terminó entero y escribir el `sync.log`.

**Files:**
- Create: `src/agent/subida.ts`
- Create: `src/agent/subida.test.ts`

**Acceptance Criteria:**
- [ ] Antes de nada: `get_context` → `cambiarRama(trabajo)` → operar → `cambiarRama(la que estaba)`
- [ ] La rama de trabajo se crea **la primera vez**, con `crearRama(nombre, ramaOrigen)`
- [ ] Con un fallo a mitad, la ref **no** se mueve y el log recoge los fallos con su motivo
- [ ] Con todo correcto, la ref se mueve y el log registra `ok`
- [ ] El `sync.log` es JSONL: una línea por operación de sync, y se añade, nunca se reescribe

**Verify:** `npx vitest run --exclude '**/.worktrees/**' src/agent/subida.test.ts` → 5 tests en verde

**Steps:**

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/agent/subida.test.ts
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CloudStudioEnMemoria } from "../core/ports.js";
import { prepararRepo, cambiosPendientes, REMOTO } from "./gitSync.js";
import { subir, rutaSyncLog } from "./subida.js";

async function proyectoConCambios() {
  const raiz = mkdtempSync(join(tmpdir(), "xc-sub-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>");
  await prepararRepo(raiz, "master");
  writeFileSync(join(raiz, "app.xml"), "<app cambiada/>");
  execFileSync("git", ["add", "-A"], { cwd: raiz });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "cambio"], { cwd: raiz });
  return raiz;
}

const git = (raiz: string, ...a: string[]) =>
  execFileSync("git", a, { cwd: raiz, encoding: "utf8" }).trim();

describe("subir", () => {
  it("posiciona la rama de trabajo y devuelve la que estaba", async () => {
    const raiz = await proyectoConCambios();
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");

    const informe = await subir({
      puerto, raiz, ramaOrigen: "master", ramaTrabajo: "xonecode/sergio",
      proyecto: { id: "96fe", nombre: "AppForTest" },
    });

    expect(informe.ok).toEqual(["app.xml"]);
    expect((await puerto.contexto()).rama).toBe("master");
  });

  it("con todo bien, la ref se mueve y no queda nada pendiente", async () => {
    const raiz = await proyectoConCambios();
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");
    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" } });

    expect(await cambiosPendientes(raiz, "master")).toEqual([]);
    expect(git(raiz, "reflog", "show", `${REMOTO}/master`)).toContain("sync:");
  });

  it("con un fallo a mitad, la ref NO se mueve", async () => {
    const raiz = await proyectoConCambios();
    const base = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await base.abrir("AppForTest");
    const puerto = { ...base, escribirTexto: async () => { throw new Error("503"); } } as typeof base;

    const informe = await subir({
      puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t",
      proyecto: { id: "1", nombre: "AppForTest" },
    });

    expect(informe.fallos).toHaveLength(1);
    expect(await cambiosPendientes(raiz, "master")).toHaveLength(1);
  });

  it("deja el registro en JSONL, añadiendo", async () => {
    const raiz = await proyectoConCambios();
    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");
    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" } });
    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" } });

    const lineas = readFileSync(rutaSyncLog(raiz), "utf8").trim().split("\n");
    expect(lineas).toHaveLength(2);
    expect(JSON.parse(lineas[0]!).dir).toBe("subida");
  });

  it("no sube nada de .xonecode aunque esté commiteado", async () => {
    const raiz = await proyectoConCambios();
    // Forzamos su presencia en el diff saltándonos el exclude.
    writeFileSync(join(raiz, ".xonecode", "memoria.md"), "# m");
    execFileSync("git", ["add", "-f", ".xonecode/memoria.md"], { cwd: raiz });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "memoria"], { cwd: raiz });

    const puerto = new CloudStudioEnMemoria({ rama: "master", textos: { "app.xml": "<app/>" } });
    await puerto.abrir("AppForTest");
    await subir({ puerto, raiz, ramaOrigen: "master", ramaTrabajo: "t", proyecto: { id: "1", nombre: "AppForTest" } });

    expect(puerto.escrituras.some((e) => e.ruta.startsWith(".xonecode"))).toBe(false);
    expect(existsSync(rutaSyncLog(raiz))).toBe(true);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/agent/subida.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 3: Implementar**

```ts
// src/agent/subida.ts
/**
 * La subida: del plan a las llamadas MCP, y de ahí a la ref y al registro.
 *
 * Dos propiedades que no son negociables:
 * - La ref se mueve SOLO si todo terminó. Con fallos parciales se queda donde estaba, y
 *   el siguiente `/sync` reintenta exactamente lo que faltó. Idempotente por construcción.
 * - La rama activa del servidor se restaura al terminar: `switch` le mueve el suelo a
 *   quien tenga Studio abierto en el navegador.
 */
import { appendFileSync, mkdirSync, readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CloudStudioPort } from "../core/ports.js";
import { planDeSubida } from "../core/planDeSubida.js";
import { NOMBRE_CARPETA } from "./configEnDisco.js";
import { cambiosPendientes, marcarSubido } from "./gitSync.js";
import { rutaSyncJson } from "./descarga.js";

export interface OpcionesDeSubida {
  puerto: CloudStudioPort;
  raiz: string;
  ramaOrigen: string;
  ramaTrabajo: string;
  proyecto: { id: string; nombre: string };
  informar?: (texto: string) => void;
}

export interface InformeDeSubida {
  ok: string[];
  fallos: Array<{ ruta: string; motivo: string }>;
}

export function rutaSyncLog(raiz: string): string {
  return join(raiz, NOMBRE_CARPETA, "cloudstudio", "sync.log");
}

/** Los `.xne` presentes en local: con ellos se reconocen las vistas aplanadas. */
function fuentesXne(raiz: string): Set<string> {
  const salida = new Set<string>();
  const recorrer = (dir: string, prefijo: string): void => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (entrada.name === ".git" || entrada.name === NOMBRE_CARPETA) continue;
      const relativa = prefijo === "" ? entrada.name : `${prefijo}/${entrada.name}`;
      if (entrada.isDirectory()) recorrer(join(dir, entrada.name), relativa);
      else if (entrada.name.endsWith(".xne")) salida.add(relativa);
    }
  };
  recorrer(raiz, "");
  return salida;
}

function descargadosDe(raiz: string): Set<string> {
  const ruta = rutaSyncJson(raiz);
  if (!existsSync(ruta)) return new Set();
  try {
    const estado = JSON.parse(readFileSync(ruta, "utf8")) as { descargados?: string[] };
    return new Set(estado.descargados ?? []);
  } catch {
    // Sin manifiesto legible no se puede afirmar qué se bajó, y sin eso el candado no
    // existe: mejor un conjunto vacío (que prohíbe TODO borrado) que uno inventado.
    return new Set();
  }
}

export async function subir(opciones: OpcionesDeSubida): Promise<InformeDeSubida> {
  const { puerto, raiz, ramaOrigen, ramaTrabajo, proyecto, informar = () => {} } = opciones;

  const cambios = await cambiosPendientes(raiz, ramaOrigen);
  const tamanos = new Map<string, number>();
  for (const cambio of cambios) {
    const ruta = join(raiz, cambio.ruta);
    if (existsSync(ruta)) tamanos.set(cambio.ruta, statSync(ruta).size);
  }

  const plan = planDeSubida({
    cambios,
    descargados: descargadosDe(raiz),
    tamanos,
    fuentesXne: fuentesXne(raiz),
  });

  const informe: InformeDeSubida = { ok: [], fallos: [] };
  if (plan.length === 0) {
    informar("no hay nada que subir\n");
    return informe;
  }

  await puerto.abrir(proyecto.nombre);
  const antes = await puerto.contexto();
  try {
    if (!(await puerto.ramas()).includes(ramaTrabajo)) {
      // Perezosa: crear la rama en el alta le ensucia el Studio a quien no sube nada.
      await puerto.crearRama(ramaTrabajo, ramaOrigen);
    }
    await puerto.cambiarRama(ramaTrabajo);

    for (const operacion of plan) {
      try {
        if (operacion.tipo === "borrado") await puerto.borrarTexto(operacion.ruta);
        else if (operacion.tipo === "texto") {
          await puerto.escribirTexto(operacion.ruta, readFileSync(join(raiz, operacion.ruta), "utf8"));
        } else {
          await puerto.subirBinario(operacion.ruta, readFileSync(join(raiz, operacion.ruta)));
        }
        informe.ok.push(operacion.ruta);
      } catch (error) {
        informe.fallos.push({ ruta: operacion.ruta, motivo: (error as Error).message });
      }
    }
  } finally {
    // La rama que estaba de VERDAD, no la que suponíamos: por eso se lee `contexto` antes.
    await puerto.cambiarRama(antes.rama);
  }

  if (informe.fallos.length === 0) {
    await marcarSubido(raiz, ramaOrigen, `sync: ${informe.ok.length} ficheros a ${ramaTrabajo}`);
  } else {
    informar(`${informe.fallos.length} ficheros no subieron; la ref no se mueve y el próximo /sync los reintenta\n`);
  }

  const linea = JSON.stringify({
    fecha: new Date().toISOString(),
    dir: "subida",
    proyecto: proyecto.nombre,
    rama: ramaTrabajo,
    ok: informe.ok,
    fallos: informe.fallos,
  });
  const log = rutaSyncLog(raiz);
  mkdirSync(dirname(log), { recursive: true });
  appendFileSync(log, `${linea}\n`);

  return informe;
}
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/agent/subida.test.ts`
Expected: PASS (5)

- [ ] **Step 5: Commit**

```bash
git add src/agent/subida.ts src/agent/subida.test.ts
git commit -m "feat: ejecuta la subida, mueve la ref solo si termina y registra"
```

---

### Task 9: El asistente de proveedor y modelo

**Goal:** que un usuario sin configuración elija proveedor y modelo al arrancar, se guarde global, y pueda fijar uno distinto por proyecto.

**Files:**
- Create: `src/cli/wizardInicial.ts`
- Create: `src/cli/wizardInicial.test.ts`
- Modify: `src/agent/configEnDisco.ts` (añadir `guardarModelosDeProyecto` y `guardarRamaDeProyecto`)
- Modify: `src/agent/configEnDisco.test.ts`
- Modify: `src/core/config.ts` y `src/core/config.test.ts` (validar `cloudstudio.rama`)

**Acceptance Criteria:**
- [ ] Solo se ofrece si el papel `trabajo` resuelve con `origen === "omisión"`
- [ ] Sin TTY (`interactivo: false`) no pregunta nada y no escribe nada
- [ ] Ollama local no pide credencial; el resto sí, y la clave va por `guardarCredencial`
- [ ] El modelo elegido se asigna a los **tres** papeles, en el config **global**
- [ ] Cancelar en cualquier punto no escribe nada y lo dice
- [ ] `guardarModelosDeProyecto` y `guardarRamaDeProyecto` fusionan sobre el objeto crudo y escriben atómicamente
- [ ] `core/config.ts` valida `cloudstudio.rama` y descarta con aviso lo que no sea una cadena no vacía

**Verify:** `npx vitest run --exclude '**/.worktrees/**' src/cli/wizardInicial.test.ts src/agent/configEnDisco.test.ts` → todo en verde

**Steps:**

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/cli/wizardInicial.test.ts
import { describe, expect, it, vi } from "vitest";
import { CatalogoModelosEnMemoria } from "../core/ports.js";
import { asistenteDeModelo } from "./wizardInicial.js";

function consolaFalsa(respuestas: string[]) {
  const escrito: string[] = [];
  let i = 0;
  return {
    escrito,
    consola: {
      escribir: (t: string) => { escrito.push(t); },
      preguntar: async () => respuestas[i++] ?? "",
      leerSecreto: async () => "clave-secreta",
      interactivo: true,
      catalogoModelos: new CatalogoModelosEnMemoria({
        ollama: [{ id: "glm-5.3-flash:cloud", nombre: "GLM 5.3" }],
      }),
      seleccionar: async ({ opciones }: { opciones: Array<{ id: string }> }) => opciones[0]?.id,
    },
  };
}

describe("asistenteDeModelo", () => {
  it("no hace nada si ya hay un modelo elegido", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const guardar = vi.fn();
    await asistenteDeModelo({ ...consola, guardarModeloGlobal: guardar } as never, { origenDeTrabajo: "global" });
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito).toEqual([]);
  });

  it("sin TTY no pregunta ni escribe", async () => {
    const { consola } = consolaFalsa([]);
    const guardar = vi.fn();
    await asistenteDeModelo(
      { ...consola, interactivo: false, guardarModeloGlobal: guardar } as never,
      { origenDeTrabajo: "omisión" }
    );
    expect(guardar).not.toHaveBeenCalled();
  });

  it("elige proveedor y modelo, y lo guarda en los TRES papeles", async () => {
    const { consola } = consolaFalsa([]);
    const guardar = vi.fn(() => ({ ruta: "~/.xonecode/config.json", id: "ollama/glm-5.3-flash:cloud" }));
    await asistenteDeModelo({ ...consola, guardarModeloGlobal: guardar } as never, { origenDeTrabajo: "omisión" });

    expect(guardar.mock.calls.map((c) => c[0])).toEqual(["rapido", "trabajo", "afilado"]);
    expect(guardar.mock.calls[0]![1]).toBe("ollama/glm-5.3-flash:cloud");
  });

  it("cancelar no escribe nada", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const guardar = vi.fn();
    await asistenteDeModelo(
      { ...consola, seleccionar: async () => undefined, guardarModeloGlobal: guardar } as never,
      { origenDeTrabajo: "omisión" }
    );
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito.join("")).toMatch(/cancelad/i);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/cli/wizardInicial.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 3: Implementar el asistente**

```ts
// src/cli/wizardInicial.ts
/**
 * El asistente de cuenta: proveedor y modelo, la primera vez.
 *
 * No hace falta una marca de «primer arranque»: la resolución de modelos ya guarda de
 * dónde salió cada valor. Si `trabajo` resuelve por `omisión`, nadie ha elegido nunca.
 * Un flag aparte sería una segunda fuente de verdad sobre algo que el sistema ya sabe.
 */
import { PROVEEDORES, PAPELES, type Proveedor } from "../core/modelos.js";
import type { Consola } from "./consola.js";

export interface ContextoDelAsistente {
  /** El `origen` con el que resolvió el papel `trabajo`. */
  origenDeTrabajo: string;
  /** Proveedores que ya tienen credencial guardada. */
  hayCredencial?: (proveedor: Proveedor) => boolean;
  guardarCredencial?: (proveedor: Proveedor, clave: string) => void;
}

/** Ollama local es la omisión y no lleva clave: pedirla sería mentir sobre lo que hace falta. */
const SIN_CREDENCIAL: ReadonlySet<string> = new Set(["ollama"]);

export async function asistenteDeModelo(
  consola: Consola,
  contexto: ContextoDelAsistente
): Promise<void> {
  // Ya hay una elección (proyecto, global, bandera o entorno): no se pregunta.
  if (contexto.origenDeTrabajo !== "omisión") return;
  // Sin TTY no se pregunta NADA: las tuberías y `xonecode run` deben seguir dando una
  // salida byte-idéntica.
  if (!consola.interactivo || consola.seleccionar === undefined) return;

  const proveedor = await consola.seleccionar({
    titulo: "Proveedor de modelos",
    opciones: PROVEEDORES.map((p) => ({
      id: p,
      etiqueta: p,
      detalle: SIN_CREDENCIAL.has(p) ? "local, no necesita clave" : "necesita una clave de API",
    })),
  }) as Proveedor | undefined;

  if (proveedor === undefined || !PROVEEDORES.includes(proveedor)) {
    consola.escribir("asistente cancelado; se usa el modelo por omisión\n");
    return;
  }

  if (!SIN_CREDENCIAL.has(proveedor) && contexto.hayCredencial?.(proveedor) === false) {
    const clave = await consola.leerSecreto(`clave de ${proveedor}: `);
    if (clave.trim() === "") {
      consola.escribir("asistente cancelado; se usa el modelo por omisión\n");
      return;
    }
    // La clave va SOLO a ~/.xonecode/auth.json en 0600. Nunca al proyecto.
    contexto.guardarCredencial?.(proveedor, clave.trim());
  }

  const modelos = await consola.catalogoModelos.listar(proveedor);
  if (modelos.length === 0) {
    consola.escribir(`no hay modelos disponibles para ${proveedor}; se usa el de omisión\n`);
    return;
  }

  const elegido = await consola.seleccionar({
    titulo: `Modelos de ${proveedor}`,
    opciones: modelos.map((m) => ({ id: m.id, etiqueta: m.nombre ?? m.id, detalle: m.id })),
  });
  if (elegido === undefined) {
    consola.escribir("asistente cancelado; se usa el modelo por omisión\n");
    return;
  }

  // Un modelo para los tres papeles, como `/modelo`. Afinar por papel es opt-in con
  // `/modelos`: preguntar tres veces antes de que nadie sepa qué es «afilado» es peaje.
  const id = `${proveedor}/${elegido}`;
  for (const papel of PAPELES) consola.guardarModeloGlobal(papel, id);
  consola.escribir(`→ ${id} guardado para los tres papeles\n`);
}
```

- [ ] **Step 4: El guardado por proyecto (modelo y rama)**

Añadir a `src/agent/configEnDisco.ts`, junto a `guardarTemaDeProyecto`:

```ts
/** El modelo que este proyecto usa, sea cual sea el global. Nunca lleva claves. */
export function guardarModelosDeProyecto(
  raiz: string,
  papel: Papel,
  id: string,
): { ruta: string; id: string } {
  parsear(id);
  const ruta = rutaConfigDeProyecto(raiz);
  const base = leerObjetoCrudoOAbortar(ruta);
  const modelos = esObjeto(base.modelos) ? { ...base.modelos } : {};
  const fusionado = { ...base, modelos: { ...modelos, [papel]: id } };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta, id };
}

/**
 * La rama ORIGEN del proyecto: de la que se baja y contra la que se compara.
 * Va dentro de `cloudstudio`, junto a la URL y al proyecto, porque es identidad del
 * remoto y no una preferencia del usuario.
 */
export function guardarRamaDeProyecto(
  raiz: string,
  rama: string,
): { ruta: string; rama: string } {
  const ruta = rutaConfigDeProyecto(raiz);
  const base = leerObjetoCrudoOAbortar(ruta);
  const cloudstudio = esObjeto(base.cloudstudio) ? { ...base.cloudstudio } : {};
  const fusionado = { ...base, cloudstudio: { ...cloudstudio, rama } };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta, rama };
}
```

Y admitir `rama` en el validador de `core/config.ts`, donde ya se validan
`cloudstudio.url`, `scopes` y `proyecto`: una cadena no vacía; cualquier otra cosa se
descarta con aviso, como el resto.

```ts
// dentro del bloque `if (clave === "cloudstudio")`, junto a `proyecto` y `scopes`
const rama = typeof valor.rama === "string" && valor.rama.trim() !== "" ? valor.rama : undefined;
if (valor.rama !== undefined && rama === undefined) {
  avisos.push({ texto: `«${ruta}»: «cloudstudio.rama» debe ser un nombre no vacío; se descarta.` });
}
```

y su test en `src/agent/configEnDisco.test.ts`:

```ts
it("guardarModelosDeProyecto fusiona sin perder lo que ya había", () => {
  const raiz = mkdtempSync(join(tmpdir(), "xc-cfg-"));
  mkdirSync(join(raiz, ".xonecode"), { recursive: true });
  writeFileSync(
    join(raiz, ".xonecode", "config.json"),
    JSON.stringify({ modo: "cloud", modelos: { rapido: "ollama/a" } })
  );

  guardarModelosDeProyecto(raiz, "trabajo", "anthropic/claude-sonnet-4-5-20250929");

  const guardado = JSON.parse(readFileSync(join(raiz, ".xonecode", "config.json"), "utf8"));
  expect(guardado.modo).toBe("cloud");
  expect(guardado.modelos).toEqual({
    rapido: "ollama/a",
    trabajo: "anthropic/claude-sonnet-4-5-20250929",
  });
});
```

- [ ] **Step 5: Verlo pasar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/cli/wizardInicial.test.ts src/agent/configEnDisco.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/wizardInicial.ts src/cli/wizardInicial.test.ts src/agent/configEnDisco.ts src/agent/configEnDisco.test.ts
git commit -m "feat: asistente inicial de proveedor y modelo, y modelo por proyecto"
```

---

### Task 10: Cablear el alta y el comando `/sync`

**Goal:** que todo lo anterior se vea desde la consola: alta en cuatro pasos y `/sync` para bajar y subir.

**Files:**
- Modify: `src/cli/consola.ts` (registro `COMANDOS`, asistente en `configurarModoInicial`)
- Modify: `src/cli/consola.test.ts`
- Modify: `src/cli/main.ts` (inyectar el adaptador real y el orden del alta)
- Modify: `src/cli/main.test.ts`

**Acceptance Criteria:**
- [ ] `/sync` sin argumentos informa del estado: rama, pendientes y fecha del último sync
- [ ] `/sync bajar` descarga y prepara el repo; `/sync subir` pide aprobación y sube
- [ ] `/sync subir` con árbol sucio se **niega** y dice qué commitear
- [ ] Tras elegir proyecto en el alta, se descarga y se prepara el repo antes del primer turno
- [ ] El asistente de modelo corre ANTES del alta de proyecto
- [ ] La rama origen se guarda en `cloudstudio.rama`; con una sola rama disponible NO se pregunta
- [ ] El alta ofrece un modelo propio del proyecto, con «usar el global» por omisión
- [ ] El selector de modelo se extrae a `seleccionarModelo` y lo comparten `/modelos` y el alta: nada de dos copias
- [ ] Sin las dependencias inyectadas (modo guion, tests), `/sync` lo dice y no revienta

**Verify:** `npx vitest run --exclude '**/.worktrees/**' src/cli/` → toda la carpeta en verde

**Steps:**

- [ ] **Step 1: Escribir el test que falla**

El helper existente es `consolaDe(...lineas)` (línea 36 de `src/cli/consola.test.ts`), que
devuelve `{ consola, salida }` — no inventes otro:

```ts
// añadir a src/cli/consola.test.ts
describe("/sync", () => {
  it("sin dependencias inyectadas lo dice y no revienta", async () => {
    const { consola, salida } = consolaDe("/sync", "/salir");
    await correrConsola(consola, estadoDe());
    expect(salida()).toMatch(/sincronización no está disponible/i);
  });

  it("se niega a subir con el árbol sucio", async () => {
    const { consola, salida } = consolaDe("/sync subir", "/salir");
    const conSync: Consola = {
      ...consola,
      sincronizar: async (accion) => {
        expect(accion).toBe("subir");
        return { tipo: "arbol-sucio", pendientes: ["app.xml"] };
      },
    };
    await correrConsola(conSync, estadoDe());
    expect(salida()).toMatch(/commitea/i);
  });

  it("«/sync estado» enseña lo que falta por subir", async () => {
    const { consola, salida } = consolaDe("/sync", "/salir");
    const conSync: Consola = {
      ...consola,
      sincronizar: async () => ({ tipo: "texto", texto: "rama master: 2 ficheros por subir\n" }),
    };
    await correrConsola(conSync, estadoDe());
    expect(salida()).toContain("2 ficheros por subir");
  });
});
```

(`correrConsola` y `estadoDe` son los que ya usa el resto del fichero; copia su forma exacta
de un test vecino si la firma no coincide.)

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/cli/consola.test.ts`
Expected: FAIL — `/sync` no existe

- [ ] **Step 3: Añadir el comando al registro**

En `src/cli/consola.ts`, dentro de `COMANDOS` (el registro único: `/ayuda`, la cabecera y
el autocompletado se generan recorriéndolo, así que no hay más sitios que tocar):

```ts
  sync: {
    descripcion: "sincroniza con CloudStudio: /sync [estado|bajar|subir]",
    manejador: async (args, estado, consola) => {
      if (consola.sincronizar === undefined) {
        consola.escribir("la sincronización no está disponible en esta ejecución\n");
        return { seguir: true };
      }
      const accion = args[0] ?? "estado";
      if (!["estado", "bajar", "subir"].includes(accion)) {
        consola.escribir("uso: /sync [estado|bajar|subir]\n");
        return { seguir: true };
      }
      const resultado = await consola.sincronizar(accion as "estado" | "bajar" | "subir", estado.raiz);
      if (resultado.tipo === "arbol-sucio") {
        // Se sube el estado de un COMMIT: así «lo que está arriba» es siempre un commit
        // concreto y mover la ref significa algo.
        consola.escribir(`hay cambios sin commitear (${resultado.pendientes.join(", ")}); commitea antes de subir\n`);
        return { seguir: true };
      }
      consola.escribir(resultado.texto);
      return { seguir: true };
    },
  },
```

y en la interfaz `Consola`:

```ts
  /** Sincronización inyectada desde `agent/`: esta capa no conoce MCP ni git. */
  sincronizar?: (
    accion: "estado" | "bajar" | "subir",
    raiz: string
  ) => Promise<{ tipo: "texto"; texto: string } | { tipo: "arbol-sucio"; pendientes: string[] }>;
```

- [ ] **Step 4: Cablear en `main.ts`**

En la construcción de las dependencias de la consola (junto a `conectarCloudStudio`):

```ts
    sincronizar: async (accion, raiz) => {
      const config = leerCloudStudioDeProyecto(raiz); // {url, scopes, proyecto, rama}
      if (config === undefined) return { tipo: "texto", texto: "este proyecto no es cloud\n" };

      const conexion = await conectarCloudStudio(config.url, config.scopes, () => {});
      const puerto = clienteCloudStudio(conexion.invocar, config.proyecto.nombre);

      if (accion === "bajar") {
        const estado = await descargarProyecto({ puerto, raiz, proyecto: config.proyecto });
        await prepararRepo(raiz, estado.rama);
        return { tipo: "texto", texto: `bajados ${estado.descargados.length} ficheros (${estado.via})\n` };
      }
      if (accion === "subir") {
        if (!(await arbolLimpio(raiz))) {
          return { tipo: "arbol-sucio", pendientes: (await cambiosPendientes(raiz, config.rama)).map((c) => c.ruta) };
        }
        const informe = await subir({
          puerto, raiz, ramaOrigen: config.rama,
          ramaTrabajo: `xonecode/${config.rama}`, proyecto: config.proyecto,
        });
        return { tipo: "texto", texto: `subidos ${informe.ok.length}, fallaron ${informe.fallos.length}\n` };
      }
      const pendientes = await cambiosPendientes(raiz, config.rama);
      return { tipo: "texto", texto: `rama ${config.rama}: ${pendientes.length} ficheros por subir\n` };
    },
```

Y en el alta, tras `configurarModoInicial`, con el orden del spec:

```ts
  // 1. Cuenta: proveedor y modelo. Antes que el proyecto: es configuración de la persona.
  await asistenteDeModelo(consola, { origenDeTrabajo: fuentes.modelos?.trabajo?.origen ?? "omisión" });
  // 2-3. Modo, proyecto de CloudStudio y descarga de la copia local.
  await configurarModoInicial(raiz, consola);
```

- [ ] **Step 5: Rama origen, descarga y modelo del proyecto, dentro del alta**

En `configurarModoInicial`, tras `guardarProyectoCloudStudioDeProyecto(proyecto)` y antes
del `«→ Entorno cloud listo»`. Son los pasos 3 y 4 del alta del spec:

```ts
  // Rama ORIGEN: de la que se baja y contra la que se compara. Las ramas entran por una
  // dependencia inyectada, hermana de `conectarCloudStudio` — esta capa no conoce MCP:
  //   ramasDeCloudStudio?: (proyecto: string) => Promise<string[]>
  // Hoy los proyectos suelen tener solo `master`, y con una sola opción NO se pregunta:
  // preguntar lo que no tiene alternativa es ruido.
  const ramas = (await consola.ramasDeCloudStudio?.(proyecto.nombre)) ?? [];
  let rama = ramas[0] ?? "master";
  if (ramas.length > 1 && consola.seleccionar !== undefined) {
    const elegida = await consola.seleccionar({
      titulo: "Rama origen",
      opciones: ramas.map((r) => ({ id: r, etiqueta: r })),
    });
    if (elegida === undefined) {
      consola.escribir("selección cancelada; no se ha creado .xonecode\n");
      return;
    }
    rama = elegida;
  }
  consola.guardarRamaDeProyecto?.(rama);

  if (consola.sincronizar !== undefined) {
    consola.escribir("Descargando el proyecto…\n");
    const bajada = await consola.sincronizar("bajar", raiz);
    if (bajada.tipo === "texto") consola.escribir(bajada.texto);
  }

  // Paso 4: modelo propio del proyecto. Por omisión NO: hereda el global, que es lo que
  // el usuario acaba de elegir en el asistente de cuenta.
  if (consola.interactivo && consola.seleccionar !== undefined && consola.guardarModelosDeProyecto !== undefined) {
    const distinto = await consola.seleccionar({
      titulo: "Modelo de este proyecto",
      opciones: [
        { id: "global", etiqueta: "Usar el modelo global", detalle: "lo normal" },
        { id: "propio", etiqueta: "Elegir uno solo para este proyecto" },
      ],
    });
    if (distinto === "propio") await elegirModelo([], estadoInicial, consola);
  }
```

`elegirModelo` ya existe (`/modelos`), pero guarda en global. Para este paso hace falta la
variante que escribe en el proyecto: extrae de `elegirModelo` la parte de selección a una
función `seleccionarModelo(proveedor, consola)` que devuelva el id elegido, y úsala en los
dos sitios. Sin extraerla habría dos copias del selector, que es justo lo que el registro
único de `COMANDOS` evita en los comandos.

- [ ] **Step 6: Verlo pasar**

Run: `npx vitest run --exclude '**/.worktrees/**' src/cli/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/cli/consola.ts src/cli/consola.test.ts src/cli/main.ts src/cli/main.test.ts
git commit -m "feat: comando /sync y alta en cuatro pasos"
```

---

### Task 11: Documentación y cierre

**Goal:** que el mapa del repo cuente lo que ahora hace el código, y que la doc vieja no contradiga a la nueva.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md` (espejo, salvo las tres líneas de cabecera)
- Modify: `docs/CLOUDSTUDIO-SINCRONIZACION.md`
- Modify: `README.md`

**Acceptance Criteria:**
- [ ] `CLAUDE.md` describe la copia local, la ref de seguimiento, el candado de borrado y el alta en cuatro pasos
- [ ] `docs/CLOUDSTUDIO-SINCRONIZACION.md` deja de decir «aún no se debe adivinar una API de descarga»: ya está medida
- [ ] El README corrige «No hay TUI con paneles; la consola es stdio» y el número de comandos
- [ ] `AGENTS.md` es byte-idéntico a `CLAUDE.md` salvo las tres primeras líneas
- [ ] Suite entera y typecheck en verde

**Verify:**
```bash
npm run typecheck && npx vitest run --exclude '**/.worktrees/**'
diff <(tail -n +4 CLAUDE.md) <(tail -n +4 AGENTS.md) && echo "espejo ✓"
```

**Steps:**

- [ ] **Step 1: Actualizar `CLAUDE.md`**

Añadir junto al bloque de CloudStudio, y corregir el bullet que hoy dice que las tools
remotas no se inyectan (sigue siendo cierto, pero ahora hay descarga y subida):

```markdown
**La copia local y la sincronización** (`agent/descarga.ts`, `agent/gitSync.ts`,
`agent/subida.ts`, `core/planDeSubida.ts`). El proyecto se descarga a la carpeta que el
usuario abrió, con la misma estructura del servidor, y el agente trabaja sobre ella sin
enterarse de que CloudStudio existe. El estado de «qué hay arriba» NO es un fichero
nuestro: es la ref `refs/remotes/cloudstudio/<rama>`, así que `git status` responde solo y
`git diff cloudstudio/<rama>..HEAD` ES el plan de subida. Cuatro reglas duras:
- **Lo que no se pudo bajar, no se puede borrar** (`core/planDeSubida.ts`). El plan B baja
  fichero a fichero y el servidor no sirve binarios así, de modo que git ve las fuentes y
  las fuentes tipográficas como borradas. Emitir esos borrados vaciaría el proyecto en
  Studio; el manifiesto de `sync.json` es lo que lo impide.
- **La ref se mueve solo si la subida terminó entera**, así que un fallo parcial se
  reintenta solo en el siguiente `/sync`.
- **`.xonecode` no sube nunca**, con filtro propio además del exclude de git — y `.gitignore`
  no se toca, porque es un fichero del proyecto y acabaría en CloudStudio.
- **La rama activa del servidor se restaura** tras cada operación (`get_context` antes de
  `switch`): un switch le mueve el suelo a quien tenga Studio abierto.
```

- [ ] **Step 2: Reescribir el «Límite actual» de `docs/CLOUDSTUDIO-SINCRONIZACION.md`**

Sustituir esa sección por un puntero al spec y a los hallazgos medidos:

```markdown
## Estado

El flujo está implementado y medido contra el servidor real. Los detalles y los
hallazgos que le dan forma están en
`docs/superpowers/specs/2026-09-03-cloudstudio-copia-local-design.md`.
```

- [ ] **Step 3: Corregir el README**

- «14 comandos» → el número real que salga de `COMANDOS`
- Quitar «No hay TUI con paneles; la consola es stdio» (hay TUI desde la v0.4)
- Actualizar el punto de CloudStudio: ya no está «en fase de conexión»

- [ ] **Step 4: Sincronizar `AGENTS.md`**

```bash
{ head -3 AGENTS.md; tail -n +4 CLAUDE.md; } > /tmp/agents.sync && mv /tmp/agents.sync AGENTS.md
diff <(tail -n +4 CLAUDE.md) <(tail -n +4 AGENTS.md) && echo "espejo ✓"
```

- [ ] **Step 5: Verificación final**

Run: `npm run typecheck && npx vitest run --exclude '**/.worktrees/**'`
Expected: typecheck limpio y suite entera en verde

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md AGENTS.md README.md docs/CLOUDSTUDIO-SINCRONIZACION.md
git commit -m "docs: la copia local y la sincronización en el mapa del repo"
```

---

## Notas para quien ejecute

- **El orden importa poco salvo en tres sitios**: la Task 3 (plan de subida) no depende de
  nada y puede ir primero; la Task 8 necesita la 3 y la 7; la Task 10 necesita todo.
- **Si un test necesita red o una clave, el test está mal.** Todo pasa por
  `CloudStudioEnMemoria`.
- **Dos comprobaciones quedaron pendientes en el spec** y aparecerán al ejecutar: si
  `studio_edit_file(delete)` acepta rutas binarias (si no, un borrado de icono no se puede
  propagar y hay que decirlo en vez de fingir que subió), y si `xone-simulator` falla con
  una copia parcial sin `bd/gestion.db` (un rojo que no es del proyecto choca con el
  contrato de códigos de salida). Ninguna bloquea: ambas se resuelven declarando la
  limitación en el informe.
