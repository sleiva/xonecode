# Tareas encadenadas: un encargo grande se reparte en tareas de fondo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando la persona da en el chat un encargo grande (p. ej. «diseña estas dos ventanas»), el orquestador de TrueForge lo analiza, decide que no cabe en un turno, PREGUNTA primero a la persona lo que le falte para un buen encargo y PROPONE repartirlo en varias tareas, cada una con sus diseños adjuntos; la persona ve las tareas ya AUMENTADAS y editables y, al aceptar, se encolan en background con sus adjuntos y corren EN SECUENCIA (la segunda no arranca hasta que la primera termine).

**Architecture:** El orquestador recibe una tool nueva, `proponer_tareas`, que NO crea nada: emite un evento de dominio `propuesta-de-tareas`. El servidor web aumenta cada tarea con el `AumentadorPort` de siempre y la pinta como tarjeta editable; «Encolar en orden» manda un mensaje nuevo, `{clase:"tarea", accion:"crearEncadenadas"}`, que crea las tareas con un campo nuevo `tras` (la anterior de la cadena). `siguientesAEjecutar` no despacha una tarea cuya anterior no esté `terminada`. La persona sigue siendo quien crea las tareas: el acto de crear sigue siendo la autorización.

**Tech Stack:** TypeScript (host, `node`), React + Vite (cliente `apps/web`), vitest (proyectos `host` y `cliente`), TrueForge (motor del agente).

**Spec:** este documento (la petición de la persona, 06-10-2026: «cuando le doy una tarea grande, por ejemplo el diseño de dos ventanas, quiero que el orquestador analice —no sé si con el analista— y determine que es un plan muy grande, y que cree dos tareas aumentadas para postearlas secuencialmente en background»), más CLAUDE.md § «Las tareas en background».

## Global Constraints

- **La autorización sigue siendo el ACTO DE CREAR LA TAREA** (CLAUDE.md). El agente PROPONE; solo un clic de la persona en «Encolar en orden» crea tareas. Ningún camino crea una tarea sin ese clic, tampoco en modo autónomo.
- **«Gana la persona» no cambia**: una tarea no arranca mientras la consola humana de ese proyecto está abierta (`bloqueados` de `siguientesAEjecutar`). La tarjeta lo DICE.
- **La propuesta va SIEMPRE a una persona, también en modo AUTÓNOMO** (como `/sync subir` y las escrituras remotas): el modo de escritura gobierna las escrituras locales de ESTA sesión; crear tareas de fondo es conceder escrituras futuras sin preguntar, y eso no lo concede ningún modo. En autónomo, la tool no cambia de comportamiento: el turno termina y la tarjeta espera el clic. Las PREGUNTAS previas (`ask_user_question`) siguen la regla normal del modo (en autónomo se contesta la recomendada y se dice).
- **Antes de proponer, se pregunta**: el prompt manda reunir con `ask_user_question` lo que falte para que cada encargo sea autosuficiente (qué diseño va a qué tarea, de dónde salen los datos, navegación, qué queda fuera). Sin esas respuestas no se propone.
- **Los diseños viajan con su tarea**: cada tarea propuesta nombra los adjuntos de la sesión que necesita (`adjuntos: string[]`, nombres de `/adjuntos/`), y al encolar el servidor los COPIA a `~/.xonecode/tareas/<id>/adjuntos/` (la carpeta de adjuntos de la tarea) con las guardas de siempre (`nombreDeAdjuntoAceptable`, `realpath` dentro de la carpeta de la sesión). Un zip ya descomprimido viaja con su carpeta.
- **Encadenadas = estrictamente en orden**: una tarea con `tras` no arranca hasta que su anterior está en `terminada`. Si la anterior queda en `requiere-atencion`, la siguiente ESPERA (hoy, sin esto, arrancaría: el reparto por proyecto deja de bloquear en ese estado).
- **Una tarea de fondo NO puede proponer tareas**: la tool solo se monta en sesiones de persona en la web (con cola de tareas), nunca en la consola de una tarea, ni en terminal/`run`/evals.
- **`core/` no importa langchain/trueforge/react** (`src/core/imports.test.ts`); los tipos del cable se REDECLARAN en `apps/web/src/tipos.ts` y `tipos.test.ts` compara literales.
- Los métodos nuevos de `Piel` van OPCIONALES (stdio y TUI no cambian).
- **deepagents es LEGACY**: no se toca. Todo va en TrueForge.
- Topes: entre 2 y `TOPE_DE_TAREAS_PROPUESTAS = 6` tareas por propuesta; cada `peticion` ≤ `TOPE_DE_ENCARGO` (8000, `agent/tareas/aumentador.ts`).

**User decisions (already made):**
- «que cree dos tareas aumentadas para postearlas secuencialmente en background» → aumentadas (AumentadorPort) y en secuencia (`tras`).
- «que el orquestador analice (no sé si con el analista)» → el orquestador decide; puede apoyarse en `analyst-xone` como hoy, no es obligatorio.
- «que preguntara primero al usuario de todo lo que necesita para crear un prompt aumentado» → preguntas con `ask_user_question` ANTES de `proponer_tareas` (Task 4, prompt).
- «también debe anexar los diseños a la tarea» → `TareaPropuesta.adjuntos` y copia al encolar (Tasks 2, 5, 6).
- Modo: propuesta siempre a la persona, también en autónomo (recomendación aceptada por defecto; si la persona decide lo contrario, cambia una condición en Task 5).

---

## Mapa de ficheros

| Fichero | Qué |
|---|---|
| `src/core/tareas.ts` | `Tarea.tras?: string`; `siguientesAEjecutar` respeta la cadena. |
| `src/core/repartoDeEncargo.ts` (nuevo) | Puro: forma de una propuesta, su validación (`motivoDePropuestaInaceptable`), y `tareasEncadenadas` (de propuesta + encargos a `Tarea[]` con `tras`). |
| `src/core/events.ts` | Evento `{tipo:"propuesta-de-tareas"; motivo; tareas}`. |
| `src/core/turno.ts` | `Piel.propuestaDeTareas?(…)` opcional; el turno lo reenvía. |
| `src/agent/motores/trueforge/proponerTareas.ts` (nuevo) | La tool `proponer_tareas` del raíz: valida y emite; devuelve texto. |
| `src/agent/motores/trueforge/sesionTrueforge.ts` | Monta la tool en el raíz SOLO con `opciones.puedeProponerTareas`; prompt del orquestador. |
| `src/web/servidor/pielWeb.ts` | `propuestaDeTareas` → aumenta cada tarea y emite el acto/tarjeta. |
| `src/web/servidor/arranque.ts` | `accion:"crearEncadenadas"` → `atenderCrearEncadenadas`; pasa `puedeProponerTareas` a las sesiones de persona. |
| `src/web/servidor/transporte.ts` | Tipos del mensaje nuevo. |
| `apps/web/src/tipos.ts`, `store.ts` | Acto `propuesta-de-tareas` y su respuesta. |
| `apps/web/src/componentes/PropuestaDeTareas.tsx` (nuevo) | La tarjeta: lista en orden, encargo editable por tarea, «Encolar en orden» / «Descartar». |
| `apps/web/src/componentes/Chat.tsx` | Pinta la tarjeta en el hilo. |
| `apps/web/src/componentes/TareasDelProyecto.tsx` | Dice «espera a: <título>» en una tarea encadenada. |
| `CLAUDE.md`, `docs/DECISIONES.md` | Documentación. |

---

### Task 1: La cadena en el planificador (`tras`)

**Goal:** Una tarea con `tras` no se despacha hasta que su anterior está `terminada`; sin `tras`, todo como hoy.

**Files:**
- Modify: `src/core/tareas.ts` (interface `Tarea` ~l.71-175; `siguientesAEjecutar` l.232-274)
- Test: `src/core/tareas.test.ts`

**Acceptance Criteria:**
- [ ] `Tarea` tiene `tras?: string` documentado (id de la anterior de la cadena).
- [ ] `siguientesAEjecutar` salta una tarea `nuevo` con `tras` cuya anterior existe y no está `terminada` (también si está en `requiere-atencion`).
- [ ] Si la anterior ya no existe (la persona la borró), la siguiente SÍ puede arrancar.
- [ ] Una tarea saltada por `tras` no gasta hueco de concurrencia ni para la cola.
- [ ] Los tests existentes de `siguientesAEjecutar` siguen en verde.

**Verify:** `FORCE_COLOR=0 npx vitest run src/core/tareas.test.ts` → todos en verde.

**Steps:**

- [ ] **Step 1: Test que falla**

```ts
// src/core/tareas.test.ts — añadir
describe("siguientesAEjecutar: las tareas ENCADENADAS (tras) van en orden", () => {
  const base = (id: string, creada: string, extra: Partial<Tarea> = {}): Tarea => ({
    id, proyecto: { id: "p", raiz: `/r/${id}`, nombre: "P" }, titulo: id, peticion: id, encargo: id,
    adjuntos: [], estado: "nuevo", creada, ...extra,
  });
  it("la segunda no arranca mientras la primera no esté terminada", () => {
    const a = base("a", "2026-10-06T10:00:00Z", { estado: "en-proceso" });
    const b = base("b", "2026-10-06T10:00:01Z", { tras: "a" });
    expect(siguientesAEjecutar([a, b], { concurrencia: 2 }).map((t) => t.id)).toEqual([]);
  });
  it("si la primera quedó en requiere-atencion, la segunda ESPERA", () => {
    const a = base("a", "2026-10-06T10:00:00Z", { estado: "requiere-atencion", motivo: "x" });
    const b = base("b", "2026-10-06T10:00:01Z", { tras: "a" });
    expect(siguientesAEjecutar([a, b], { concurrencia: 2 })).toEqual([]);
  });
  it("con la primera terminada (o borrada), la segunda arranca", () => {
    const a = base("a", "2026-10-06T10:00:00Z", { estado: "terminada" });
    const b = base("b", "2026-10-06T10:00:01Z", { tras: "a" });
    expect(siguientesAEjecutar([a, b], { concurrencia: 2 }).map((t) => t.id)).toEqual(["b"]);
    expect(siguientesAEjecutar([b], { concurrencia: 2 }).map((t) => t.id)).toEqual(["b"]);
  });
  it("una encadenada que espera no quita el hueco a otra de otro proyecto", () => {
    const a = base("a", "2026-10-06T10:00:00Z", { estado: "requiere-atencion", motivo: "x" });
    const b = base("b", "2026-10-06T10:00:01Z", { tras: "a" });
    const c = base("c", "2026-10-06T10:00:02Z");
    expect(siguientesAEjecutar([a, b, c], { concurrencia: 1 }).map((t) => t.id)).toEqual(["c"]);
  });
});
```

(Las raíces son distintas a propósito: así se prueba `tras` y no la regla de «nunca dos del mismo proyecto», que ya existe.)

- [ ] **Step 2: Correr y ver que falla** — `FORCE_COLOR=0 npx vitest run src/core/tareas.test.ts -t ENCADENADAS` → falla (b se despacha).

- [ ] **Step 3: Implementación mínima**

En `interface Tarea`, junto a `sesion?`:

```ts
  /**
   * La tarea ANTERIOR de su cadena (`core/repartoDeEncargo.ts`): esta no arranca hasta que aquella esté
   * `terminada`. Existe porque un encargo grande se reparte en tareas que van EN ORDEN, y la regla de «nunca dos
   * del mismo proyecto» no basta: deja de bloquear cuando la anterior queda en `requiere-atencion`, y la segunda
   * arrancaría sobre un trabajo a medias. Si la anterior ya no existe (la persona la borró), esta queda libre.
   */
  tras?: string;
```

En `siguientesAEjecutar`, dentro del bucle, antes de `ocupados.has`:

```ts
    if (t.tras !== undefined) {
      const anterior = tareas.find((x) => x.id === t.tras);
      if (anterior !== undefined && anterior.estado !== "terminada") continue;
    }
```

Y una línea en el comentario de la función: «**Y las ENCADENADAS esperan a su anterior** (`Tarea.tras`): sin gastar hueco».

- [ ] **Step 4: Correr y ver que pasa** — el mismo comando → verde; y `FORCE_COLOR=0 npx vitest run src/core/tareas.test.ts` entero → verde.

- [ ] **Step 5: Commit** — `git add src/core/tareas.ts src/core/tareas.test.ts && git commit -m "feat(tareas): una tarea encadenada (tras) espera a que su anterior termine"`

```json:metadata
{"files": ["src/core/tareas.ts", "src/core/tareas.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/core/tareas.test.ts", "acceptanceCriteria": ["Tarea.tras documentado", "siguientesAEjecutar salta la encadenada mientras la anterior no esté terminada (incl. requiere-atencion)", "anterior borrada libera la siguiente", "no gasta hueco", "tests previos en verde"], "modelTier": "mechanical"}
```

---

### Task 2: La propuesta, pura (`core/repartoDeEncargo.ts`)

**Goal:** La forma de una propuesta de tareas, su validación y la construcción de las `Tarea` encadenadas, sin I/O.

**Files:**
- Create: `src/core/repartoDeEncargo.ts`
- Test: `src/core/repartoDeEncargo.test.ts`

**Acceptance Criteria:**
- [ ] `TareaPropuesta = {titulo: string; peticion: string; adjuntos?: string[]}` (nombres de adjuntos de la sesión) y `PropuestaDeTareas = {motivo: string; tareas: TareaPropuesta[]}`.
- [ ] `motivoDePropuestaInaceptable` rechaza también un adjunto con nombre que no pase `nombreDeAdjuntoAceptable` (`core/adjuntos.ts`), aceptando el prefijo `/adjuntos/`.
- [ ] `motivoDePropuestaInaceptable(p)` rechaza: menos de 2 o más de `TOPE_DE_TAREAS_PROPUESTAS` (6) tareas, títulos o peticiones vacíos, peticiones de más de 8000 caracteres, motivo vacío; devuelve `undefined` si vale.
- [ ] `tareasEncadenadas({proyecto, tareas:[{peticion, encargo}], ahora, id})` devuelve `Tarea[]` en estado `nuevo`, con `creada` estrictamente creciente (1 ms de diferencia, para el FIFO) y `tras` = id de la anterior (la primera sin `tras`).
- [ ] `core/imports.test.ts` sigue en verde (el fichero no importa nada de fuera de `core/`).

**Verify:** `FORCE_COLOR=0 npx vitest run src/core/repartoDeEncargo.test.ts src/core/imports.test.ts` → verde.

**Steps:**

- [ ] **Step 1: Test que falla** (`src/core/repartoDeEncargo.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { motivoDePropuestaInaceptable, tareasEncadenadas, TOPE_DE_TAREAS_PROPUESTAS } from "./repartoDeEncargo.js";

const dos = { motivo: "son dos pantallas independientes", tareas: [{ titulo: "A", peticion: "haz A" }, { titulo: "B", peticion: "haz B" }] };

describe("una propuesta de tareas", () => {
  it("dos tareas con título y petición valen", () => expect(motivoDePropuestaInaceptable(dos)).toBeUndefined());
  it("una sola no es un reparto; más del tope tampoco", () => {
    expect(motivoDePropuestaInaceptable({ ...dos, tareas: [dos.tareas[0]!] })).toBeDefined();
    const muchas = Array.from({ length: TOPE_DE_TAREAS_PROPUESTAS + 1 }, (_, i) => ({ titulo: `T${i}`, peticion: "x" }));
    expect(motivoDePropuestaInaceptable({ ...dos, tareas: muchas })).toBeDefined();
  });
  it("vacíos y peticiones gigantes no", () => {
    expect(motivoDePropuestaInaceptable({ ...dos, motivo: " " })).toBeDefined();
    expect(motivoDePropuestaInaceptable({ ...dos, tareas: [{ titulo: "", peticion: "x" }, dos.tareas[1]!] })).toBeDefined();
    expect(motivoDePropuestaInaceptable({ ...dos, tareas: [{ titulo: "A", peticion: "x".repeat(8001) }, dos.tareas[1]!] })).toBeDefined();
  });
  it("los adjuntos de cada tarea, por nombre de adjunto válido", () => {
    expect(motivoDePropuestaInaceptable({ ...dos, tareas: [{ ...dos.tareas[0]!, adjuntos: ["/adjuntos/maqueta_a.zip"] }, dos.tareas[1]!] })).toBeUndefined();
    expect(motivoDePropuestaInaceptable({ ...dos, tareas: [{ ...dos.tareas[0]!, adjuntos: ["../.env"] }, dos.tareas[1]!] })).toBeDefined();
  });
});

describe("tareasEncadenadas", () => {
  it("encadena por tras, en orden y con creada creciente", () => {
    let n = 0;
    const ts = tareasEncadenadas({
      proyecto: { id: "p", raiz: "/r", nombre: "P" },
      tareas: [{ peticion: "haz A", encargo: "A aumentado" }, { peticion: "haz B", encargo: "B aumentado" }],
      ahora: new Date("2026-10-06T10:00:00.000Z"),
      id: () => `t${++n}`,
    });
    expect(ts.map((t) => [t.id, t.tras, t.estado, t.encargo])).toEqual([["t1", undefined, "nuevo", "A aumentado"], ["t2", "t1", "nuevo", "B aumentado"]]);
    expect(ts[0]!.creada < ts[1]!.creada).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y ver que falla** (el módulo no existe).

- [ ] **Step 3: Implementación**

```ts
// src/core/repartoDeEncargo.ts
import { nombreDeAdjuntoAceptable } from "./adjuntos.js";
import { tituloDeTarea, type Tarea } from "./tareas.js";

/**
 * Repartir un encargo GRANDE en tareas de fondo que corren EN ORDEN (petición de la persona, 06-10-2026: «el diseño de
 * dos ventanas»). El orquestador PROPONE (`proponer_tareas`); la persona ve cada tarea aumentada y editable y, al
 * pulsar «Encolar en orden», se crean. El acto de crear sigue siendo la autorización (CLAUDE.md): nada de aquí crea una
 * tarea por su cuenta. Puro.
 */
export const NOMBRE_PROPONER_TAREAS = "proponer_tareas";
export const TOPE_DE_TAREAS_PROPUESTAS = 6;
/** El mismo tope que el encargo aumentado (`agent/tareas/aumentador.ts#TOPE_DE_ENCARGO`). */
export const TOPE_DE_PETICION = 8000;

export interface TareaPropuesta {
  titulo: string;
  peticion: string;
  /** Los adjuntos de la sesión que necesita ESTA tarea (sus diseños), por nombre (`/adjuntos/x.zip` o `x.zip`). */
  adjuntos?: string[];
}
export interface PropuestaDeTareas {
  /** Por qué no cabe en un turno: se le enseña a la persona encima de las tareas. */
  motivo: string;
  tareas: TareaPropuesta[];
}

export function motivoDePropuestaInaceptable(p: PropuestaDeTareas): string | undefined {
  if (p.motivo.trim() === "") return "falta el motivo del reparto";
  if (p.tareas.length < 2) return "un reparto son al menos dos tareas; una sola, hazla en este turno";
  if (p.tareas.length > TOPE_DE_TAREAS_PROPUESTAS) return `como mucho ${TOPE_DE_TAREAS_PROPUESTAS} tareas por reparto`;
  for (const [i, t] of p.tareas.entries()) {
    if (t.titulo.trim() === "") return `la tarea ${i + 1} no tiene título`;
    if (t.peticion.trim() === "") return `la tarea ${i + 1} no tiene petición`;
    if (t.peticion.length > TOPE_DE_PETICION) return `la petición de la tarea ${i + 1} pasa de ${TOPE_DE_PETICION} caracteres`;
    for (const a of t.adjuntos ?? []) {
      const nombre = a.replace(/^\/adjuntos\//, "");
      if (!nombreDeAdjuntoAceptable(nombre)) return `«${a}» no es un adjunto de esta conversación (tarea ${i + 1})`;
    }
  }
  return undefined;
}

/** Las `Tarea` de una propuesta aceptada: en estado `nuevo`, encadenadas por `tras` y con `creada` creciente. */
export function tareasEncadenadas(opciones: {
  proyecto: Tarea["proyecto"];
  tareas: readonly { peticion: string; encargo: string }[];
  ahora: Date;
  id: () => string;
}): Tarea[] {
  const salida: Tarea[] = [];
  opciones.tareas.forEach((t, i) => {
    const tarea: Tarea = {
      id: opciones.id(),
      proyecto: opciones.proyecto,
      titulo: tituloDeTarea(t.peticion),
      peticion: t.peticion,
      encargo: t.encargo.trim() === "" ? t.peticion : t.encargo,
      adjuntos: [],
      estado: "nuevo",
      // +i ms: el FIFO de `siguientesAEjecutar` ordena por `creada`, y dos iguales no tienen orden.
      creada: new Date(opciones.ahora.getTime() + i).toISOString(),
      ...(i === 0 ? {} : { tras: salida[i - 1]!.id }),
    };
    salida.push(tarea);
  });
  return salida;
}
```

- [ ] **Step 4: Correr y ver que pasa.**
- [ ] **Step 5: Commit** — `feat(tareas): la propuesta de reparto y sus tareas encadenadas, puras`

```json:metadata
{"files": ["src/core/repartoDeEncargo.ts", "src/core/repartoDeEncargo.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/core/repartoDeEncargo.test.ts src/core/imports.test.ts", "acceptanceCriteria": ["tipos TareaPropuesta/PropuestaDeTareas", "motivoDePropuestaInaceptable con sus rechazos", "tareasEncadenadas con tras y creada creciente", "imports de core en verde"], "modelTier": "mechanical"}
```

---

### Task 3: El evento y la piel (`propuesta-de-tareas`)

**Goal:** Un evento de dominio nuevo que el turno reenvía a un método OPCIONAL de la piel.

**Files:**
- Modify: `src/core/events.ts` (junto a `consulta`, l.~88), `src/core/turno.ts` (interface `Piel`, l.~102; despacho de eventos, l.~307-315)
- Test: `src/core/turno.test.ts`

**Acceptance Criteria:**
- [ ] `DomainEvent` incluye `{tipo:"propuesta-de-tareas"; motivo: string; tareas: TareaPropuesta[]}`.
- [ ] `Piel.propuestaDeTareas?(p: PropuestaDeTareas): void` opcional; el turno la llama si existe.
- [ ] Sin el método (stdio, TUI) el evento se pinta como una línea de texto («El agente propone repartir el encargo en N tareas: …») y no rompe nada.
- [ ] `src/core/imports.test.ts` y los tests de `turno` en verde.

**Verify:** `FORCE_COLOR=0 npx vitest run src/core/turno.test.ts src/core/imports.test.ts` → verde.

**Steps:**
- [ ] **Step 1:** test en `turno.test.ts`: un `SesionReal` doble que emite `{tipo:"propuesta-de-tareas", …}` → con una piel que implementa `propuestaDeTareas` se llama con la propuesta; con una piel sin el método, `linea` recibe el texto con los títulos numerados.
- [ ] **Step 2:** ver que falla.
- [ ] **Step 3:** añadir la variante al tipo `DomainEvent` (importando `TareaPropuesta` de `./repartoDeEncargo.js`), el método opcional en `Piel` con su comentario («opcional, como `consulta?`: stdio y la TUI no cambian»), y el `case` en el despacho del turno: `if (piel.propuestaDeTareas) piel.propuestaDeTareas({motivo, tareas}); else piel.linea(textoDePropuesta(e))`, con `textoDePropuesta` en `repartoDeEncargo.ts` (numera títulos).
- [ ] **Step 4:** verde.
- [ ] **Step 5: Commit** — `feat(turno): evento propuesta-de-tareas y su método opcional de la piel`

```json:metadata
{"files": ["src/core/events.ts", "src/core/turno.ts", "src/core/repartoDeEncargo.ts", "src/core/turno.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/core/turno.test.ts src/core/imports.test.ts", "acceptanceCriteria": ["evento en DomainEvent", "Piel.propuestaDeTareas? opcional y llamado", "sin método: línea de texto con los títulos", "imports en verde"], "modelTier": "mechanical"}
```

---

### Task 4: La tool `proponer_tareas` del orquestador (TrueForge)

**Goal:** El raíz de TrueForge puede proponer un reparto; la tool valida, emite el evento y devuelve texto. Solo se monta con `puedeProponerTareas`.

**Files:**
- Create: `src/agent/motores/trueforge/proponerTareas.ts`
- Modify: `src/agent/motores/trueforge/sesionTrueforge.ts` (opciones de `abrirSesionTrueforge` ~l.510-530; `propiasDelRaiz` ~l.891; prompt del orquestador `promptOrquestador`/`notaDeDelegacion`)
- Test: `src/agent/motores/trueforge/sesionTrueforge.test.ts`, `src/agent/motores/trueforge/proponerTareas.test.ts`

**Acceptance Criteria:**
- [ ] `crearProponerTareas(emitir)` es una tool de LangChain (`name: "proponer_tareas"`, esquema zod `{motivo, tareas:[{titulo, peticion}]}`) que con una propuesta válida llama `emitir({tipo:"propuesta-de-tareas",…})` y devuelve «Propuesta enviada a la persona: N tareas en orden. NO las hagas en este turno: ella decide si se encolan. Termina el turno diciéndolo.»; con una inválida DEVUELVE el motivo (no lanza).
- [ ] Solo el RAÍZ la recibe, y solo si `opciones.puedeProponerTareas === true`. Un especialista nunca.
- [ ] El esquema admite `adjuntos?: string[]` por tarea, y la descripción dice: «nombra los adjuntos (diseños) que necesita cada tarea; se copiarán a la tarea».
- [ ] El prompt manda, ANTES de proponer, preguntar con `ask_user_question` lo que falte para un encargo autosuficiente (qué diseño va a cada tarea, de dónde salen los datos, cómo se navega, qué queda fuera), con opciones cuando las haya; y no proponer hasta tener las respuestas.
- [ ] El prompt del orquestador (solo con la tool montada) dice cuándo usarla: un encargo con varias pantallas o entregables INDEPENDIENTES, o un plan del analista con más tareas de las que caben en un turno; que cada `peticion` sea autosuficiente (la tarea no ve esta conversación) y nombre la maqueta/adjunto y el plan si los hay; y que NO la use para lo que cabe en un turno.
- [ ] Test de integración con el orquestador real (molde de los de `incorporar_adjunto`/fuentes): con `puedeProponerTareas` y un guion que llama `proponer_tareas`, la piel recibe `propuestaDeTareas` con las dos tareas; sin la opción, la tool no está en `toolsPorLlamada[0]`.

**Verify:** `FORCE_COLOR=0 npx vitest run src/agent/motores/trueforge/proponerTareas.test.ts src/agent/motores/trueforge/sesionTrueforge.test.ts -t "proponer"` → verde.

**Steps:**
- [ ] **Step 1:** tests (unidad de la tool con un `emitir` espía; integración con `modelosConGuion` y el guion `[[proponer_tareas …]], [[«He propuesto…»]]`).
- [ ] **Step 2:** ver que fallan.
- [ ] **Step 3:** implementar:

```ts
// src/agent/motores/trueforge/proponerTareas.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { DomainEvent } from "../../../core/events.js";
import { motivoDePropuestaInaceptable, NOMBRE_PROPONER_TAREAS, TOPE_DE_TAREAS_PROPUESTAS } from "../../../core/repartoDeEncargo.js";

/**
 * El orquestador PROPONE repartir un encargo grande en tareas de fondo encadenadas. NO crea ninguna: crear una tarea es
 * la autorización para que escriba sin preguntar (CLAUDE.md § tareas), y esa la da la persona al pulsar «Encolar en
 * orden» en la tarjeta. La tool emite el evento y devuelve; el resto lo hace la web.
 */
const Esquema = z.object({
  motivo: z.string().describe("Por qué no cabe en un turno (se le enseña a la persona)."),
  tareas: z
    .array(z.object({
      titulo: z.string().describe("Corto: «Ventana Entradas/Salidas»."),
      peticion: z.string().describe("El encargo de ESA tarea, autosuficiente: la tarea no ve esta conversación. Nombra la maqueta/adjunto y el plan si los hay."),
      adjuntos: z.array(z.string()).optional().describe("Los adjuntos de esta conversación (sus diseños) que necesita ESTA tarea, por nombre: se le copian."),
    }))
    .min(2)
    .max(TOPE_DE_TAREAS_PROPUESTAS),
});

export function crearProponerTareas(emitir: (e: DomainEvent) => void) {
  return tool(
    async (p: z.infer<typeof Esquema>) => {
      const motivo = motivoDePropuestaInaceptable(p);
      if (motivo !== undefined) return `No se propone: ${motivo}.`;
      emitir({ tipo: "propuesta-de-tareas", motivo: p.motivo, tareas: p.tareas });
      return `Propuesta enviada a la persona: ${p.tareas.length} tareas en orden. NO las hagas en este turno: ella decide si se encolan. Termina el turno diciéndolo.`;
    },
    {
      name: NOMBRE_PROPONER_TAREAS,
      description:
        "Propone a la persona repartir un encargo GRANDE (varias pantallas o entregables independientes) en tareas de fondo " +
        "que corren EN ORDEN. No crea nada: la persona revisa cada tarea y decide. Úsala solo cuando no quepa en un turno.",
      schema: Esquema,
    }
  );
}
```

En `sesionTrueforge.ts`: opción nueva `puedeProponerTareas?: boolean` con su comentario («solo la web, con cola de tareas; nunca la consola de una tarea»); en `propiasDelRaiz`, `...(opciones.puedeProponerTareas === true ? [crearProponerTareas((e) => emitirAlTurno(e)) as unknown as ToolDeLangchain] : [])` usando el MISMO canal por el que el raíz ya emite `consulta` hacia el generador del turno (ver cómo `askUserQuestion` acaba en `{tipo:"consulta"}`, l.~1630-1640: el evento se encola y el generador lo `yield`ea); y el párrafo del prompt solo si la opción está.
- [ ] **Step 4:** verde.
- [ ] **Step 5: Commit** — `feat(trueforge): el orquestador puede proponer repartir un encargo en tareas encadenadas`

```json:metadata
{"files": ["src/agent/motores/trueforge/proponerTareas.ts", "src/agent/motores/trueforge/proponerTareas.test.ts", "src/agent/motores/trueforge/sesionTrueforge.ts", "src/agent/motores/trueforge/sesionTrueforge.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/agent/motores/trueforge/proponerTareas.test.ts src/agent/motores/trueforge/sesionTrueforge.test.ts -t proponer", "acceptanceCriteria": ["tool valida y emite; inválida devuelve motivo", "solo el raíz y solo con puedeProponerTareas", "prompt dice cuándo usarla", "integración: la piel recibe propuestaDeTareas; sin opción no hay tool"], "modelTier": "standard"}
```

---

### Task 5: El servidor web — aumentar, pintar y crear encadenadas

**Goal:** La web recibe la propuesta, aumenta cada tarea con el `AumentadorPort`, la manda como acto/tarjeta, y crea las tareas encadenadas cuando la persona pulsa «Encolar en orden».

**Files:**
- Modify: `src/web/servidor/pielWeb.ts` (junto a `consulta`, l.~398), `src/web/servidor/arranque.ts` (`atenderCrearTarea` l.2124; despacho de `clase:"tarea"` l.6384-6403; `augmentacionCableada` l.7304; construcción de las sesiones de persona), `src/web/servidor/transporte.ts` (l.1791-1800), `src/core/actos.ts` (acto nuevo, junto al de `consulta` l.~133)
- Test: `src/web/servidor/arranque.test.ts`, `src/web/servidor/pielWeb.test.ts`

**Acceptance Criteria:**
- [ ] Las sesiones de PERSONA de la web abren con `puedeProponerTareas: opciones.colaDeTareas !== undefined`; las de TAREA (`abrirParaTarea`/`consolaParaTarea`) nunca.
- [ ] `pielWeb.propuestaDeTareas` aumenta cada `peticion` (en serie, con el `augmentar` de `augmentacionCableada` y el proyecto abierto) y emite un acto `{tipo:"propuesta-de-tareas", id, motivo, tareas:[{titulo, peticion, encargo, error?}]}`; si el aumentador falla en una, `encargo = peticion` y `error` lo dice (como «Nueva tarea»).
- [ ] Mensaje nuevo `{clase:"tarea"; accion:"crearEncadenadas"; proyecto; propuesta: string; tareas:[{peticion, encargo}]}` → `atenderCrearEncadenadas`: valida (2..6, no vacías), crea con `tareasEncadenadas`, guarda con `colaDeTareas.guardar([...lista, ...nuevas])`, llama `revisarTareas` y `emitirTareas`; con el workspace mudándose, 409 como `crear`.
- [ ] El acto de la propuesta queda marcado como `aceptada` (con los ids) o `descartada`, para que la tarjeta no se pueda encolar dos veces (`accion:"descartarPropuesta"` la marca descartada).
- [ ] `crearEncadenadas` lleva por tarea `adjuntos: string[]` y COPIA cada uno de la carpeta de adjuntos de la SESIÓN (`.xonecode/sesiones/<id>/adjuntos/`, la del hilo que propuso) a la de la tarea (`colaDeTareas.carpetaDeAdjuntos(id)`), ANTES de guardar la tarea (crear dispara `revisarTareas` y el corredor podría arrancarla sin ellos, la misma razón que el borrador de `atenderCrearTarea`). Guardas: nombre con `nombreDeAdjuntoAceptable` y `realpath` dentro de la carpeta de la sesión; un zip con su carpeta extraída copia también la carpeta. La `Tarea.adjuntos` se lee después del DISCO (`listarAdjuntos`), como hoy.
- [ ] **En modo autónomo nada cambia**: la propuesta se pinta y espera el clic; `sinAprobacion` no toca este camino (test: con `sinAprobacion: () => true` no se crea ninguna tarea sin `crearEncadenadas`).
- [ ] Un test de `arranque.test.ts` que manda `crearEncadenadas` con dos tareas y comprueba en la cola: dos tareas `nuevo`, la segunda con `tras` = id de la primera, y el adjunto de cada una en su carpeta de adjuntos.

**Verify:** `FORCE_COLOR=0 npx vitest run src/web/servidor/arranque.test.ts src/web/servidor/pielWeb.test.ts -t "encadenad|propuesta"` → verde.

**Steps:**
- [ ] **Step 1:** tests (los dos de arriba más uno de `pielWeb` con un aumentador doble `AumentadorGuionizado` que falla en la segunda).
- [ ] **Step 2:** fallan.
- [ ] **Step 3:** implementar siguiendo `atenderCrearTarea` (resolver proyecto con `proyectoParaTarea`, `informar` y salir si no se resuelve) y `atenderAugmentar` (l.2190-2224) para el aumentado.
- [ ] **Step 4:** verde.
- [ ] **Step 5: Commit** — `feat(web): la propuesta de tareas se aumenta, se pinta y se encola encadenada`

```json:metadata
{"files": ["src/web/servidor/pielWeb.ts", "src/web/servidor/arranque.ts", "src/web/servidor/transporte.ts", "src/core/actos.ts", "src/web/servidor/arranque.test.ts", "src/web/servidor/pielWeb.test.ts"], "verifyCommand": "FORCE_COLOR=0 npx vitest run src/web/servidor/arranque.test.ts src/web/servidor/pielWeb.test.ts -t \"encadenad|propuesta\"", "acceptanceCriteria": ["puedeProponerTareas solo en sesiones de persona", "aumenta cada tarea; fallo -> encargo=peticion+error", "crearEncadenadas crea con tras y revisa la cola", "propuesta aceptada/descartada no se encola dos veces", "test de cola con tras"], "modelTier": "standard"}
```

---

> **Hecho (tarea 5), con tres cambios sobre lo escrito arriba:**
> - **El aumentado no lo hace la piel**: `Piel.propuestaDeTareas` es síncrona y aumentar es una llamada al modelo por
>   tarea. La piel solo emite el acto (con `id`); la tarjeta pide `{accion:"aumentarPropuesta", proyecto, propuesta}` y
>   el servidor manda un `{accion:"propuestaAumentada", propuesta, indice, encargo|error}` por tarea, en serie. No se
>   guarda: al reabrir, la tarjeta pendiente lo vuelve a pedir.
> - **`crearEncadenadas` lleva solo `{proyecto, propuesta, encargos: string[]}`**: títulos, peticiones y adjuntos los
>   saca el servidor del ACTO (`propuestaPendiente`), nunca del cliente. Contesta en la propia respuesta:
>   `200 {encoladas, faltan?}` o `409 {motivo}`.
> - **Resuelta es OTRO acto** (`propuesta-resuelta`, con `encoladas` o sin ellas si se descartó), apuntado por
>   `ConsolaDeProyecto.anotarActo` y guardado en el acto: el `.jsonl` solo crece y la propuesta puede venir de lo releído.
> - La bandera es `Consola.proponeTareas` (la declara `consolaWeb`; la consola de una tarea no la hereda).

### Task 6: La tarjeta en el cliente

**Goal:** En el chat, una tarjeta muestra el motivo y las tareas en orden con su encargo aumentado EDITABLE, y dos botones: «Encolar en orden» y «Descartar».

**Files:**
- Create: `apps/web/src/componentes/PropuestaDeTareas.tsx`, `apps/web/src/componentes/PropuestaDeTareas.module.css`, `apps/web/src/componentes/PropuestaDeTareas.test.tsx`
- Modify: `apps/web/src/tipos.ts` (acto y mensajes, redeclarados), `apps/web/src/store.ts`, `apps/web/src/componentes/Chat.tsx`, `apps/web/src/App.tsx` (envío, molde de l.2064-2100), `apps/web/src/componentes/TareasDelProyecto.tsx` («espera a: <título>»)
- Test: `apps/web/src/tipos.test.ts` (literales), `apps/web/src/componentes/TareasDelProyecto.test.tsx`

**Acceptance Criteria:**
- [ ] La tarjeta lista las tareas NUMERADAS en orden, cada una con su título, los ADJUNTOS que llevará (nombres) y un textarea con su encargo (editable), y el aviso de error de aumento si lo hubo.
- [ ] Dice, encima de los botones: «Se crearán N tareas de fondo que corren EN ORDEN y escriben sin pedir aprobación. No arrancan mientras tengas abierta la consola de este proyecto.» (también en modo autónomo: esta tarjeta siempre espera el clic).
- [ ] «Encolar en orden» manda `crearEncadenadas` con los encargos editados (vacío → la petición); «Descartar» manda `descartarPropuesta`. Una propuesta `aceptada`/`descartada` se pinta sin botones, diciendo cuál.
- [ ] En la pestaña Tareas, una tarea con `tras` cuya anterior no está terminada dice «espera a: <título de la anterior>».
- [ ] Ningún color literal en el `.module.css` (`Barra.test.tsx` lo vigila); `tipos.test.ts` en verde.

**Verify:** `FORCE_COLOR=0 npx vitest run apps/web/src/componentes/PropuestaDeTareas.test.tsx apps/web/src/componentes/TareasDelProyecto.test.tsx apps/web/src/tipos.test.ts apps/web/src/componentes/Barra.test.tsx` → verde; `npm run typecheck` → sin errores.

**Steps:**
- [ ] **Step 1:** test de la tarjeta (render con dos tareas; editar la segunda; pulsar «Encolar en orden» → el `enviar` espía recibe `{clase:"tarea", accion:"crearEncadenadas", tareas:[…editada…]}`; estado `aceptada` → sin botones).
- [ ] **Step 2:** falla.
- [ ] **Step 3:** implementar con el molde de `NuevaTarea.tsx` (textarea `#…-encargo`, botón primario) y `ConsultaDelAgente.tsx` (tarjeta en el hilo).
- [ ] **Step 4:** verde + typecheck.
- [ ] **Step 5: Commit** — `feat(web): tarjeta para encolar en orden las tareas que propone el orquestador`

```json:metadata
{"files": ["apps/web/src/componentes/PropuestaDeTareas.tsx", "apps/web/src/componentes/PropuestaDeTareas.module.css", "apps/web/src/componentes/PropuestaDeTareas.test.tsx", "apps/web/src/tipos.ts", "apps/web/src/store.ts", "apps/web/src/componentes/Chat.tsx", "apps/web/src/App.tsx", "apps/web/src/componentes/TareasDelProyecto.tsx"], "verifyCommand": "FORCE_COLOR=0 npx vitest run apps/web/src/componentes/PropuestaDeTareas.test.tsx apps/web/src/componentes/TareasDelProyecto.test.tsx apps/web/src/tipos.test.ts apps/web/src/componentes/Barra.test.tsx && npm run typecheck", "acceptanceCriteria": ["lista numerada con encargos editables", "aviso de que escriben sin aprobación y esperan a la consola", "Encolar manda crearEncadenadas; Descartar descarta", "Tareas: espera a <anterior>", "sin colores literales; tipos en verde"], "modelTier": "standard"}
```

---

### Task 7: Prueba real y documentación

**Goal:** Comprobarlo de punta a punta en la consola web con un encargo de dos ventanas, y dejarlo documentado.

**Files:**
- Modify: `CLAUDE.md` (§ «Las tareas en background» y § TrueForge), `docs/DECISIONES.md`

**Acceptance Criteria:**
- [ ] En la web, sobre una copia de un proyecto, con dos maquetas adjuntas, «Crea las ventanas X e Y» → el orquestador PREGUNTA primero lo que le falta (tarjeta de pregunta), y después propone 2 tareas, cada una con su maqueta; la tarjeta las enseña aumentadas; «Encolar en orden» → dos tareas en la pestaña Tareas, la segunda «espera a» la primera; con la consola del proyecto cerrada la primera arranca, y la segunda solo cuando la primera está `terminada`.
- [ ] Con un encargo pequeño («cambia el color del botón») el orquestador NO propone reparto.
- [ ] CLAUDE.md dice: el agente propone y la persona crea (la autorización no cambia), `tras` y por qué (`requiere-atencion` ya no bloquea), la tool solo en sesiones de persona de la web, y que espera a que la consola esté cerrada.
- [ ] `src/documentacion.test.ts` en verde; suite entera en verde.

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run --maxWorkers=2` → todo en verde; la prueba real, con capturas de la tarjeta y de la pestaña Tareas.

**Steps:**
- [ ] **Step 1:** prueba real (Playwright sobre la consola web) y anotar lo observado.
- [ ] **Step 2:** documentar.
- [ ] **Step 3:** suite y typecheck.
- [ ] **Step 4: Commit** — `docs(tareas): tareas encadenadas propuestas por el orquestador`

```json:metadata
{"files": ["CLAUDE.md", "docs/DECISIONES.md"], "verifyCommand": "npm run typecheck && FORCE_COLOR=0 npx vitest run --maxWorkers=2", "acceptanceCriteria": ["prueba real: 2 tareas encadenadas, la 2.ª espera a la 1.ª", "encargo pequeño no propone", "CLAUDE.md documenta autorización, tras y montaje", "suite en verde"], "modelTier": "standard"}
```

---

## Decisiones abiertas para la persona (no bloquean el plan)

- **Las preguntas previas en modo autónomo**: el plan las deja con la regla de siempre (se contesta la recomendada). Si la persona quiere que también esperen siempre, se marca la pregunta como «de reparto» y se exime de `opcionRecomendada` (Task 4).

- **¿Proponer siempre, o solo si el encargo lo pide?** El plan deja que el orquestador decida por tamaño. Alternativa: solo cuando la persona lo pide («hazlo en tareas»). Cambia únicamente el párrafo del prompt (Task 4).
- **Si una tarea de la cadena queda en `requiere-atencion`**, el plan hace que la siguiente espere hasta que la persona la resuelva o la dé por buena (`darPorBuenaAMano`). No se cancela la cadena.
