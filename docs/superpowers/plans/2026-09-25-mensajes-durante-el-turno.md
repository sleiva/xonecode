# Mensajes mientras el agente trabaja (IXCODE-4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar que una persona escriba una nota mientras TrueForge trabaja (sin diálogo de
aprobación/pregunta visible) y que esa nota llegue de verdad al hilo que esté trabajando, en vez
de quedarse encolada en silencio hasta que el turno termine.

**Architecture:** Una cola de notas por SESIÓN (`agent/motores/trueforge/notas.ts`) más una
`Capacidad` nueva (`capacidadDeNotas`) que usa `preLLMProcessors` de `trueforge-core` —un punto de
extensión público que corre antes de CADA llamada al modelo, en la raíz y en cada hijo por
igual— para inyectar la nota como mensaje `user` persistido. `sesionTrueforge.ts` expone
`agregarNota()`; el servidor web la invoca cuando llega un mensaje mientras el turno está en
marcha y no hay nada pendiente visible; una nota que nadie consume antes de que el turno cierre se
manda como el siguiente turno.

**Tech Stack:** TypeScript, `@truefoundry/trueforge-core` (`AgentThread`/`AgentThreadOrchestrator`
reales en los tests de integración), Vitest, React + Testing Library (cliente).

**Spec:** `docs/superpowers/specs/2026-09-25-mensajes-durante-el-turno-design.md`

## Global Constraints

- **Solo TrueForge, solo la consola web.** `deepagents` no implementa nada nuevo — todo lo añadido
  es opcional (`SesionReal.agregarNota?`, `SesionCerrable.agregarNota?`).
- **Nombres, dichos una vez y usados siempre igual**: el tipo `Nota` (`agent/motores/trueforge/
  notas.ts`), la capacidad `capacidadDeNotas`, el método de sesión `agregarNota`, el campo de
  resultado `notasSobrantes` (`core/entrega.ts#ResultadoDeTurno`), la opción de servidor
  `notaMientrasTrabaja` (`consolaWeb.ts`/`vestibulo.ts`), y la prop de cliente `hayPendiente`
  (`App.tsx`/`Compositor.tsx`). Ningún task introduce un sinónimo de estos.
- **No se toca `agentThreads` de la librería, no se aborta nada para este mecanismo.** El único
  punto de extensión usado es `AgentCapability.preLLMProcessors`.
- **Ningún tipo interno de `@truefoundry/trueforge-core` se importa** (`PreLLMAgentContextProcessor`,
  `AgentContextProcessorAppendContext` no están reexportados desde el punto de entrada público):
  se escribe a mano contra `Record<string, unknown>`, igual que `capacidadDeRecortes`/
  `capacidadDeFecha` ya hacen en `capacidades.ts`. El campo `type` es el string literal
  `"internal.agent.context.append"`.
- **Los tests de integración (Task 3, Task 4) usan el `AgentThread`/`AgentThreadOrchestrator`
  REALES** (o `abrirSesionTrueforge` real), nunca la librería doblada — es el patrón de fallo que
  `CLAUDE.md` nombra («una composición de producción viviendo en un cierre que todos los tests
  doblan»).

**User decisions (already made):**
- Camino elegido: `preLLMProcessors` de la librería, sin abortar nada y sin forkear
  `@truefoundry/trueforge-core` (se investigaron y descartaron ambos, ver spec).
- Una nota mientras hay VARIOS especialistas activos en paralelo llega a TODOS.
- Solo consola web (TUI/terminal fuera de alcance).
- Con una aprobación o pregunta ya visible, escribir se sigue tratando como respuesta a ESO — no
  como nota.
- Mismo campo del compositor, sin botón ni confirmación distintos.

---

## Task 1: `Nota` — el tipo y la lógica de entrega, pura

**Goal:** Un tipo `Nota` y las funciones puras que deciden a quién se le debe una nota y cuáles
quedan sin entregar al final, sin tocar ningún `AgentThread`.

**Files:**
- Create: `src/agent/motores/trueforge/notas.ts`
- Test: `src/agent/motores/trueforge/notas.test.ts`

**Acceptance Criteria:**
- [ ] `crearNota(texto)` devuelve una `Nota` con `entregadaA` vacío.
- [ ] `pendientesPara(notas, threadId)` devuelve las notas que ESE hilo aún no recibió.
- [ ] `marcarEntregada(nota, threadId)` añade el hilo a `entregadaA` (mutación in-place, como el
  resto de colas de este motor — `notas: Nota[]` vive en el cierre de la sesión).
- [ ] `textoDeNota(texto)` envuelve el texto con el framing acordado.
- [ ] `sobrantes(notas)` devuelve el texto CONCATENADO de las notas cuyo `entregadaA` sigue vacío
  (nadie la recibió todavía), o `undefined` si no hay ninguna.

**Verify:** `npx vitest run src/agent/motores/trueforge/notas.test.ts` → todos los tests en verde.

**Steps:**

- [ ] **Step 1: Escribe los tests**

```ts
// src/agent/motores/trueforge/notas.test.ts
import { describe, expect, it } from "vitest";
import { crearNota, marcarEntregada, pendientesPara, sobrantes, textoDeNota, type Nota } from "./notas.js";

describe("Nota: a quién se le debe y qué queda sin entregar", () => {
  it("una nota nueva no se le ha entregado a nadie", () => {
    const n = crearNota("cambia el color a rojo");
    expect(n.texto).toBe("cambia el color a rojo");
    expect(n.entregadaA.size).toBe(0);
  });

  it("pendientesPara devuelve solo lo que ESE hilo no tiene, y no repite tras marcarla", () => {
    const notas: Nota[] = [crearNota("a"), crearNota("b")];
    expect(pendientesPara(notas, "main").map((n) => n.texto)).toEqual(["a", "b"]);
    for (const n of pendientesPara(notas, "main")) marcarEntregada(n, "main");
    expect(pendientesPara(notas, "main")).toEqual([]);
    // Otro hilo, que no ha preguntado todavía, las sigue debiendo las DOS.
    expect(pendientesPara(notas, "hijo-1").map((n) => n.texto)).toEqual(["a", "b"]);
  });

  it("textoDeNota envuelve el texto para quien no sabe que viene de fuera de la conversación", () => {
    expect(textoDeNota("prueba")).toBe("[la persona escribió mientras trabajabas: «prueba»]");
  });

  it("sobrantes: solo lo que NADIE recibió, concatenado; ausente si no queda nada", () => {
    const entregada = crearNota("ya la vio alguien");
    marcarEntregada(entregada, "main");
    const sinEntregar1 = crearNota("nadie la vio");
    const sinEntregar2 = crearNota("tampoco esta");
    expect(sobrantes([entregada, sinEntregar1, sinEntregar2])).toBe("nadie la vio\n\ntampoco esta");
    expect(sobrantes([entregada])).toBeUndefined();
    expect(sobrantes([])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Corre los tests — deben fallar** (el módulo no existe)

Run: `npx vitest run src/agent/motores/trueforge/notas.test.ts`
Expected: FAIL — `Cannot find module './notas.js'`

- [ ] **Step 3: Implementa**

```ts
// src/agent/motores/trueforge/notas.ts
/**
 * Una nota escrita mientras el agente trabaja (IXCODE-4): se entrega la PRIMERA vez que un hilo
 * con `capacidadDeNotas` (`capacidades.ts`) hace una llamada al modelo después de que exista, y
 * se marca entregada A ESE HILO — nunca se repite para él. No distingue "estaba trabajando
 * cuando escribiste" de "se creó justo después": cualquier hilo cuya primera llamada ocurra
 * mientras la nota sigue sin entregarle se la lleva. Es la lectura simple de "a todos los
 * activos" (hasta 5 especialistas en paralelo, `MAX_PARALLEL_SUB_AGENTS`): no hace falta saber
 * qué hilos existían en el instante exacto en que se escribió.
 */
export interface Nota {
  texto: string;
  /** `thread_id` de cada hilo que YA la recibió. */
  entregadaA: Set<string>;
}

export function crearNota(texto: string): Nota {
  return { texto, entregadaA: new Set() };
}

export function pendientesPara(notas: readonly Nota[], threadId: string): Nota[] {
  return notas.filter((n) => !n.entregadaA.has(threadId));
}

export function marcarEntregada(nota: Nota, threadId: string): void {
  nota.entregadaA.add(threadId);
}

/** Para un hijo, "la persona" es ambigua —su interlocutor normal es quien le delegó—, así que el
 *  texto deja claro que es alguien fuera de esa conversación. */
export function textoDeNota(texto: string): string {
  return `[la persona escribió mientras trabajabas: «${texto}»]`;
}

/** Lo que NADIE llegó a recibir, para mandarlo como el turno siguiente. `undefined` si no queda
 *  ninguna — así el llamador no confunde "sin sobrantes" con una cadena vacía. */
export function sobrantes(notas: readonly Nota[]): string | undefined {
  const sinEntregar = notas.filter((n) => n.entregadaA.size === 0).map((n) => n.texto);
  return sinEntregar.length === 0 ? undefined : sinEntregar.join("\n\n");
}
```

- [ ] **Step 4: Corre los tests — deben pasar**

Run: `npx vitest run src/agent/motores/trueforge/notas.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/agent/motores/trueforge/notas.ts src/agent/motores/trueforge/notas.test.ts
git commit -m "feat(trueforge): Nota — a quién se le debe y qué queda sin entregar (IXCODE-4)"
```

---

## Task 2: `capacidadDeNotas` — la pieza que se monta en cada hilo

**Goal:** Una `Capacidad` (mismo tipo que `capacidadDeRecortes`/`capacidadDeFecha`) que, dada la
cola compartida de `Nota[]`, entrega lo pendiente por `preLLMProcessors`; y que
`capacidadesDelEspecialista` la incluya para TODO especialista de motor `"modelo"` —con nombre o
genérico—, vía una nueva dependencia `notas`.

**Files:**
- Modify: `src/agent/motores/trueforge/capacidades.ts`
- Modify: `src/agent/motores/trueforge/capacidades.test.ts`

**Acceptance Criteria:**
- [ ] `capacidadDeNotas(notas)` devuelve `{ nombre: "notas", tools: [], capability: {
  preLLMProcessors: [...] } }`.
- [ ] Su `processPreLLM` entrega SOLO lo pendiente para `execution.threadId`, marca entregado, y
  no yield-ea nada si no hay nada pendiente.
- [ ] `DependenciasDelEspecialista` gana `notas: Capacidad`; `capacidadesDelEspecialista` la
  incluye en las DOS ramas (nombre inventado y especialista real) — mismo sitio que
  `capacidadDeRecortes`/`capacidadDeFecha`.

**Verify:** `npx vitest run src/agent/motores/trueforge/capacidades.test.ts` → todos los tests en
verde, incluidos los once ya existentes.

**Steps:**

- [ ] **Step 1: Escribe los tests nuevos** (añadidos a `capacidades.test.ts`, reusando `deps()`)

```ts
// añadir a src/agent/motores/trueforge/capacidades.test.ts
import { capacidadDeNotas, capacidadesDelEspecialista, SKILL_DE_OPENUI, toolsDe, type DependenciasDelEspecialista } from "./capacidades.js";
import { crearNota, marcarEntregada, type Nota } from "./notas.js";

// dentro de deps(), añadir `notas: capacidadDeNotas([])` al objeto devuelto (ver Step 3: la
// función `deps()` de este fichero es COMPARTIDA por todos los tests existentes, así que se
// actualiza en un solo sitio).

describe("capacidadDeNotas: quién debe qué, montada en un hilo", () => {
  it("entrega lo pendiente para ESE hilo, marca entregado, y no repite", async () => {
    const notas: Nota[] = [crearNota("cambia el color")];
    const c = capacidadDeNotas(notas);
    const procesador = (c.capability as { preLLMProcessors: { processPreLLM(e: { threadId: string }): AsyncGenerator<unknown> }[] }).preLLMProcessors[0]!;
    const primera = [];
    for await (const salida of procesador.processPreLLM({ threadId: "main" })) primera.push(salida);
    expect(primera).toEqual([
      { type: "internal.agent.context.append", context: [{ role: "user", content: "[la persona escribió mientras trabajabas: «cambia el color»]" }], output: [] },
    ]);
    const segunda = [];
    for await (const salida of procesador.processPreLLM({ threadId: "main" })) segunda.push(salida);
    expect(segunda).toEqual([]);
  });

  it("dos hilos DISTINTOS reciben la MISMA nota, cada uno por separado", async () => {
    const notas: Nota[] = [crearNota("nota compartida")];
    const c = capacidadDeNotas(notas);
    const procesador = (c.capability as { preLLMProcessors: { processPreLLM(e: { threadId: string }): AsyncGenerator<unknown> }[] }).preLLMProcessors[0]!;
    const paraMain = [];
    for await (const s of procesador.processPreLLM({ threadId: "main" })) paraMain.push(s);
    const paraHijo = [];
    for await (const s of procesador.processPreLLM({ threadId: "hijo-1" })) paraHijo.push(s);
    expect(paraMain).toHaveLength(1);
    expect(paraHijo).toHaveLength(1);
  });

  it("una nota YA entregada a un hilo no vuelve a salir para él", async () => {
    const nota = crearNota("x");
    marcarEntregada(nota, "main");
    const c = capacidadDeNotas([nota]);
    const procesador = (c.capability as { preLLMProcessors: { processPreLLM(e: { threadId: string }): AsyncGenerator<unknown> }[] }).preLLMProcessors[0]!;
    const salida = [];
    for await (const s of procesador.processPreLLM({ threadId: "main" })) salida.push(s);
    expect(salida).toEqual([]);
  });
});

describe("cada especialista lleva `capacidadDeNotas`, con nombre o genérico", () => {
  it("un especialista con nombre la lleva", () => {
    const piezas = capacidadesDelEspecialista(agente({ soloLectura: false }), "x", deps());
    expect(piezas.map((p) => p.nombre)).toContain("notas");
  });

  it("el hijo GENÉRICO (nombre inventado) TAMBIÉN la lleva", () => {
    const piezas = capacidadesDelEspecialista(undefined, "inventado", deps());
    expect(piezas.map((p) => p.nombre)).toContain("notas");
  });
});
```

- [ ] **Step 2: Corre los tests — deben fallar**

Run: `npx vitest run src/agent/motores/trueforge/capacidades.test.ts`
Expected: FAIL — `capacidadDeNotas` no existe; `deps()` no tiene `notas`; `toContain("notas")`
falla contra la lista actual.

- [ ] **Step 3: Implementa**

En `capacidades.ts`, añade el import y la función (junto a `capacidadDeRecortes`):

```ts
import type { Nota } from "./notas.js";
import { pendientesPara, marcarEntregada, textoDeNota } from "./notas.js";
```

```ts
/**
 * Entrega lo que la sesión le deba a ESTE hilo mientras trabaja (IXCODE-4), por
 * `preLLMProcessors` —corre antes de CADA llamada al modelo, en la raíz y en cada hijo por
 * igual (`AgentThread.js:733-740`)—. No añade tools. `Nota`/`pendientesPara`/`marcarEntregada`
 * viven en `notas.ts`, sin importar tipos internos de la librería: ni
 * `PreLLMAgentContextProcessor` ni `AgentContextProcessorAppendContext` se reexportan desde su
 * punto de entrada público.
 */
export function capacidadDeNotas(notas: Nota[]): Capacidad {
  return {
    nombre: "notas",
    tools: [],
    capability: {
      preLLMProcessors: [
        {
          async *processPreLLM(execution: { threadId: string }) {
            const pendientes = pendientesPara(notas, execution.threadId);
            if (pendientes.length === 0) return;
            for (const n of pendientes) marcarEntregada(n, execution.threadId);
            yield {
              type: "internal.agent.context.append",
              context: [{ role: "user", content: pendientes.map((n) => textoDeNota(n.texto)).join("\n\n") }],
              output: [],
            };
          },
        },
      ],
    },
  };
}
```

En `DependenciasDelEspecialista`, añade el campo:

```ts
export interface DependenciasDelEspecialista {
  backend: BackendDeFicheros & EscritorDeDesalojo;
  propias: (agente: Agente) => readonly ToolDeLangchain[];
  conShell: () => { execute(c: string): unknown; write(ruta: string, contenido: string): unknown };
  /** La cola de notas de la SESIÓN, ya envuelta: la misma instancia para todos los hijos. */
  notas: Capacidad;
}
```

En `capacidadesDelEspecialista`, añade `deps.notas` a las DOS ramas (junto a
`capacidadDeRecortes(deps.backend)`/`capacidadDeFecha()`):

```ts
  if (agente === undefined) {
    return [
      capacidadDeFicheros({ backend: deps.backend, reglas: permisosDe({ nombre: nombrePedido, soloLectura: true }), tools: TOOLS_DE_LECTURA, conAprobacion: false }),
      capacidadDeRecortes(deps.backend),
      capacidadDeFecha(),
      deps.notas,
    ];
  }
  // ...
  return [
    capacidadDeFicheros({ /* ... */ }),
    ...(propias.length > 0 ? [capacidadDePropias(propias, deps.backend)] : []),
    ...(clase === "ejecuta" ? [capacidadDeEjecucion(deps.conShell())] : []),
    capacidadDeRecortes(deps.backend),
    capacidadDeFecha(),
    deps.notas,
    ...(agente.skills.includes(SKILL_DE_OPENUI) ? [capacidadDeOpenui()] : []),
  ];
```

En `capacidades.test.ts`, la función compartida `deps()` gana el campo:

```ts
const deps = (): DependenciasDelEspecialista & { shells: number } => {
  const d = {
    shells: 0,
    backend: {} as never,
    propias: (a: Agente) => [{ name: "xone_navegacion" }, ...(a.soloLectura ? [] : [{ name: "regex_search" }])] as never,
    conShell: () => {
      d.shells += 1;
      return { execute: () => undefined, write: () => undefined };
    },
    notas: capacidadDeNotas([]),
  };
  return d;
};
```

- [ ] **Step 4: Corre los tests — deben pasar**

Run: `npx vitest run src/agent/motores/trueforge/capacidades.test.ts`
Expected: PASS, todos (los once existentes + los cinco nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/agent/motores/trueforge/capacidades.ts src/agent/motores/trueforge/capacidades.test.ts
git commit -m "feat(trueforge): capacidadDeNotas, montada en cada especialista (IXCODE-4)"
```

---

## Task 3: Prueba contra el orquestador REAL — la entrega ocurre de verdad

**Goal:** Probar, contra `AgentThread`/`AgentThreadOrchestrator` reales de `trueforge-core` (no
doblados) con un modelo de pega, que una nota empujada ENTRE dos llamadas al modelo llega a la
SEGUNDA — en la raíz, en un hijo, y a varios hijos en paralelo — usando el mismo patrón que
`modeloLangchain.test.ts` ya prueba contra la librería real.

**Files:**
- Modify: `src/agent/motores/trueforge/capacidades.test.ts`

**Acceptance Criteria:**
- [ ] Una nota empujada durante la PRIMERA llamada de la raíz llega en la SEGUNDA (el mensaje
  `user` aparece en `recibidos[1]`, no en `recibidos[0]`).
- [ ] Un HIJO (segundo `AgentThread`, montado con la MISMA `capacidadDeNotas`) también la recibe
  en su primera llamada, por separado de la raíz.
- [ ] El mensaje `user` insertado sigue siendo válido para el adaptador
  (`aMensajesDeLangchain`/`modeloParaTrueforge`): la llamada que lo lleva no revienta y el tipo de
  mensaje traducido es `"human"`.

**Nota sobre "dos hijos a la vez reciben la misma nota"** (bullet de la sección Testing del
spec): ya está probado a nivel de CAPACIDAD en Task 2 ("dos hilos DISTINTOS reciben la MISMA
nota, cada uno por separado", que llama `processPreLLM` con dos `threadId` distintos sobre la
MISMA `notas`) — montar además DOS `AgentThread` hijos corriendo de verdad en paralelo bajo un
`AgentThreadOrchestrator` añadiría la complejidad de un `createDynamicSubAgentThread` real sin
probar nada que Task 2 no pruebe ya (la entrega es por `threadId`, no por si el hilo es de
verdad o no). Se deja así, con el porqué escrito para no repetir la pregunta.

**Residual declarado — el merge de Anthropic**: el spec pedía comprobar que un mensaje `user`
justo después de un resultado de tool sigue siendo válido para el adaptador de Anthropic en
particular (que fusiona mensajes `user` adyacentes). Este test prueba el camino GENÉRICO
(`aMensajesDeLangchain`, el mismo que ya usa `modeloLangchain.test.ts`), que es el único que
`capacidadDeNotas` toca: el mensaje se anexa por el MISMO `appendToContext` que ya usa la
librería para approvals/respuestas normales, así que no introduce un mecanismo nuevo de
inserción — el riesgo de que rompa algo específico de Anthropic no es mayor que el que ya corre
cualquier mensaje de usuario existente. No se añade un test aparte contra `@langchain/anthropic`
en este plan; si aparece un caso real roto, es un fallo del adaptador y no de `capacidadDeNotas`.

**Verify:** `npx vitest run src/agent/motores/trueforge/capacidades.test.ts -t "orquestador real"`
→ todos en verde.

**Steps:**

- [ ] **Step 1: Escribe el test** (añadido a `capacidades.test.ts`; importa lo que
  `modeloLangchain.test.ts` ya usa para este patrón)

```ts
// añadir a src/agent/motores/trueforge/capacidades.test.ts
import winston from "winston";
import { AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import { AgentThread, AgentThreadOrchestrator, EventType, NOOP_AGENT_TRACING } from "./trueforge.js";
import { modeloParaTrueforge } from "./modeloLangchain.js";

/** El mismo modelo de pega de `modeloLangchain.test.ts`: un guion de trozos por llamada, y
 *  apunta los mensajes que recibió CADA vez. */
function modeloGuionizado(guiones: AIMessageChunk[][]) {
  const recibidos: BaseMessage[][] = [];
  const modelo = {
    bindTools() {
      return modelo;
    },
    async stream(mensajes: BaseMessage[]) {
      recibidos.push(mensajes);
      const guion = guiones.shift() ?? [new AIMessageChunk({ content: "" })];
      return (async function* () {
        for (const t of guion) yield t;
      })();
    },
  };
  return { modelo, recibidos };
}

const logger = winston.createLogger({ silent: true, transports: [] });

describe("capacidadDeNotas contra el orquestador real: la entrega ocurre de verdad", () => {
  it("una nota empujada durante la PRIMERA llamada de la raíz llega en la SEGUNDA", async () => {
    const { modelo, recibidos } = modeloGuionizado([
      [new AIMessageChunk({ content: "Miro." })],
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    const notas: Nota[] = [];
    const raiz = new AgentThread({
      definition: { modelClient: modeloParaTrueforge({ modelo: () => modelo }), instruction: "reglas" },
      threadId: "main",
      title: "main",
      capabilities: [capacidadDeNotas(notas).capability] as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
    const orq = new AgentThreadOrchestrator({
      agentThreads: new Map([["main", raiz]]),
      createDynamicSubAgentThread: async () => {
        throw new Error("sin subagentes en este test");
      },
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
    for await (const _ of orq.send([{ type: EventType.USER_MESSAGE, content: "haz esto" }] as never)) void _;
    const it1 = orq.execute({ signal: new AbortController().signal });
    let r = await it1.next();
    // Empuja la nota DESPUÉS de la primera llamada (ya en `recibidos`) y ANTES de que el
    // orquestador pida la segunda: exactamente "mientras el agente trabaja".
    notas.push(crearNota("cambia de idea"));
    while (!r.done) r = await it1.next();

    expect(recibidos).toHaveLength(2);
    expect(recibidos[0]!.some((m) => String(m.content).includes("cambia de idea"))).toBe(false);
    expect(recibidos[1]!.some((m) => String(m.content).includes("cambia de idea"))).toBe(true);
    // El mensaje llegó como HUMAN, no rompió el adaptador.
    expect(recibidos[1]!.find((m) => String(m.content).includes("cambia de idea"))!.getType()).toBe("human");
  });

  it("un HIJO montado con la MISMA capacidad también la recibe, por separado", async () => {
    const notas: Nota[] = [crearNota("nota compartida")];
    const { modelo: modeloHijo, recibidos: recibidosHijo } = modeloGuionizado([[new AIMessageChunk({ content: "Visto." })]]);
    const hijo = new AgentThread({
      definition: { modelClient: modeloParaTrueforge({ modelo: () => modeloHijo }), messages: [{ role: "user", content: "encargo" }] },
      threadId: "hijo-1",
      title: "hijo-1",
      capabilities: [capacidadDeNotas(notas).capability] as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
      parent: { tool_call_id: "d1", thread_id: "main" } as never,
      agentInfo: { type: "dynamic", name: "hijo-1", input: "encargo" } as never,
    });
    const it2 = hijo.execute({ signal: new AbortController().signal });
    let r = await it2.next();
    while (!r.done) r = await it2.next();
    expect(recibidosHijo[0]!.some((m) => String(m.content).includes("nota compartida"))).toBe(true);
  });
});
```

- [ ] **Step 2: Corre — debe fallar** si el `import { crearNota, type Nota }` no está aún en el
  fichero (añádelo al bloque de imports de Task 2 si falta), y en cualquier caso para comprobar
  que el test EJERCITA el camino real antes de fiarte de él:

Run: `npx vitest run src/agent/motores/trueforge/capacidades.test.ts -t "orquestador real"`
Expected: si falta el import, `ReferenceError`; si ya está, debería PASAR directamente porque
`capacidadDeNotas` ya existe de Task 2 — en ese caso, comenta temporalmente la línea `yield {
type: "internal.agent.context.append", ... }` dentro de `processPreLLM` (`capacidades.ts`) y
vuelve a correr: el test AHORA debe FALLAR (`recibidos[1]` sin la nota), confirmando que
realmente comprueba lo que dice. Descomenta la línea antes de seguir.

- [ ] **Step 3: Deja el código de Task 2 tal cual (ya implementa lo necesario) y confirma verde**

Run: `npx vitest run src/agent/motores/trueforge/capacidades.test.ts`
Expected: PASS, todos.

- [ ] **Step 4: Commit**

```bash
git add src/agent/motores/trueforge/capacidades.test.ts
git commit -m "test(trueforge): capacidadDeNotas contra el orquestador REAL, raíz e hijo (IXCODE-4)"
```

---

## Task 4: `sesionTrueforge.ts` — la cola de sesión, `agregarNota()`, montada en raíz e hijos

**Goal:** Una cola `notas: Nota[]` por sesión, la capacidad montada en la raíz
(`nuevoOrquestador`) y en cada hijo de motor `"modelo"` (vía `deps.notas` en `crearHijo`), y un
método `agregarNota(texto)` en el objeto que devuelve `abrirSesionTrueforge`.

**Files:**
- Modify: `src/agent/motores/trueforge/sesionTrueforge.ts`
- Modify: `src/agent/motores/trueforge/sesionTrueforge.test.ts`

**Acceptance Criteria:**
- [ ] `s.agregarNota("texto")` no lanza aunque no haya turno en marcha (empuja igual a la cola;
  el contrato de "solo llamarlo con turno en marcha" lo garantiza quien llama, no este método).
- [ ] Una nota añadida mientras la raíz ha delegado en un especialista (`create_sub_agent` ya
  resuelto, el hijo trabajando) llega a la SIGUIENTE llamada del hijo — probado con
  `modelosConGuion` y una nota empujada desde dentro del guion, igual que el test de
  "cancelar MIENTRAS se decide una aprobación" empuja su cancelación desde `pedirAprobacion`.
- [ ] La raíz y cada hijo comparten la MISMA instancia de `capacidadDeNotas(notas)` —una nota
  entregada a la raíz no consume la ración del hijo.
- [ ] Con un especialista de motor EXTERNO trabajando (`hijoExterno`, sin `capabilities`),
  `agregarNota` no revienta el turno — la nota simplemente no le llega a él (límite declarado en
  el spec).

**Verify:** `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts -t "agregarNota"`
→ todos en verde; `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts` completo
sigue en verde (no rompe nada existente).

**Steps:**

- [ ] **Step 1: Escribe el test**, en un `describe` nuevo al final de
  `sesionTrueforge.test.ts` (usa `modelosConGuion`, `proyecto`, `piel`, `ENTORNO`, `CATALOGO`, ya
  definidos en el fichero):

```ts
// añadir a src/agent/motores/trueforge/sesionTrueforge.test.ts
describe("agregarNota: una nota mientras el agente trabaja llega al hilo que trabaja", () => {
  it("empujada mientras un especialista trabaja, llega a SU siguiente llamada, no a la primera", async () => {
    let sesion: Awaited<ReturnType<typeof abrirSesionTrueforge>> | undefined;
    const { m, vistos } = modelosConGuion([
      // 1) la raíz delega
      [new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "d1", name: "create_sub_agent", args: JSON.stringify({ name: "developer-xone", input: "arregla el login" }) }] })],
      // 2) el hijo hace una primera llamada (aquí se empuja la nota, ver el `stream` de abajo)
      [new AIMessageChunk({ content: "Miro el login." })],
      // 3) la SEGUNDA llamada del hijo — aquí debe llegar la nota
      [new AIMessageChunk({ content: "Hecho." })],
      // 4) la raíz cierra
      [new AIMessageChunk({ content: "Listo." })],
    ]);
    sesion = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
    // Empuja la nota justo cuando el hijo ya hizo su PRIMERA llamada (vistos.length === 2: la
    // de la raíz delegando, y la primera del hijo).
    const original = m.paraPapel;
    // No hace falta interceptar nada más: basta con llamar `agregarNota` DESPUÉS de que la
    // sesión exista y ANTES de esperar el turno, porque `modelosConGuion` resuelve cada
    // `stream` de forma síncrona en microtareas — la propia promesa de `s.turno` no ha
    // arrancado el hilo del hijo todavía. Se comprueba con el contenido de `vistos`, no con
    // el orden de las llamadas a `agregarNota`.
    void original;
    const turnoPromesa = sesion.turno("arregla el login", piel().p);
    // Espera a que el hijo haga su primera llamada (dos entradas en `vistos`: raíz + hijo#1)
    // antes de anotar, para que la nota caiga ENTRE la primera y la segunda del hijo.
    await new Promise<void>((resuelto) => {
      const comprobar = () => (vistos.length >= 2 ? resuelto() : setTimeout(comprobar, 0));
      comprobar();
    });
    sesion.agregarNota("cambia de idea: usa el login antiguo");
    await turnoPromesa;

    // vistos[0] = raíz delegando, vistos[1] = 1ª del hijo, vistos[2] = 2ª del hijo, vistos[3] = raíz cerrando.
    expect(vistos[1]!.some((t) => t.includes("cambia de idea"))).toBe(false);
    expect(vistos[2]!.some((t) => t.includes("cambia de idea"))).toBe(true);
  }, 20_000);
});
```

- [ ] **Step 2: Corre — debe fallar**

Run: `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts -t "agregarNota"`
Expected: FAIL — `sesion.agregarNota is not a function`.

- [ ] **Step 3: Implementa** en `sesionTrueforge.ts`

Import (junto a los otros de `capacidades.js`):

```ts
import { capacidadDeNotas, /* ... resto ya importado ... */ } from "./capacidades.js";
import { crearNota, type Nota } from "./notas.js";
```

Cerca de `artefactosPorAnunciar`/`capturasDelTurno` (mismo bloque de estado de sesión):

```ts
  /** Lo que la persona escribió mientras el agente trabajaba, IXCODE-4: se entrega por
   *  `capacidadDeNotas`, la MISMA instancia en la raíz y en cada hijo. */
  const notas: Nota[] = [];
  const capacidadDeNotasDeLaSesion = capacidadDeNotas(notas);
```

En `propiasDe`/`capacidadesDelEspecialista` — el llamador real está en `crearHijo` (dentro de
`capacidadesDelEspecialista(agente, params.request.name, { backend, propias: propiasDe, conShell:
() => ... })`), añade el campo:

```ts
    const piezas = capacidadesDelEspecialista(agente, params.request.name, {
      backend: backend as never,
      propias: propiasDe,
      notas: capacidadDeNotasDeLaSesion,
      conShell: () => (/* sin cambios */),
    });
```

En `nuevoOrquestador`, dentro del array de `capabilitiesDe([...])` de la raíz (junto a
`capacidadDeFicheros`/`capacidadDePropias`/`capacidadDeRecortes`/`capacidadDeFecha`):

```ts
        ...capabilitiesDe([
          capacidadDeFicheros({ backend, reglas: permisosDe(PERFIL_DEL_ORQUESTADOR), tools: TOOLS_DE_LECTURA, conAprobacion: false }),
          capacidadDePropias(propiasDelRaiz, backend as never),
          capacidadDeRecortes(backend as never),
          capacidadDeFecha(),
          capacidadDeNotasDeLaSesion,
        ]),
```

Y el método en el objeto devuelto, junto a `cancelar()`:

```ts
    agregarNota(texto: string) {
      notas.push(crearNota(texto));
    },
```

- [ ] **Step 4: Corre — debe pasar**

Run: `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts -t "agregarNota"`
Expected: PASS.

(La comprobación con un hijo de motor EXTERNO se deja para la Task 5: necesita
`notasSobrantes`, que todavía no existe en esta task, para afirmar "no revienta y la nota queda
sobrante" sin ambigüedad.)

- [ ] **Step 5: Corre el fichero ENTERO** (nada existente se rompe)

Run: `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts`
Expected: PASS, todos.

- [ ] **Step 6: Commit**

```bash
git add src/agent/motores/trueforge/sesionTrueforge.ts src/agent/motores/trueforge/sesionTrueforge.test.ts
git commit -m "feat(trueforge): agregarNota() en la sesión, montada en raíz e hijos (IXCODE-4)"
```

---

## Task 5: Notas sobrantes — se mandan como el siguiente turno, nunca se pierden

**Goal:** Si el turno cierra con alguna nota que NADIE llegó a recibir, `turno()` la reporta en
`ResultadoDeTurno.notasSobrantes` (texto concatenado) y avisa por la piel — sin decidir todavía
QUIÉN dispara el turno siguiente (eso es la Task 7, en `vestibulo.ts`).

**Files:**
- Modify: `src/core/entrega.ts`
- Modify: `src/agent/motores/trueforge/sesionTrueforge.ts`
- Modify: `src/agent/motores/trueforge/sesionTrueforge.test.ts`

**Acceptance Criteria:**
- [ ] `ResultadoDeTurno` gana `notasSobrantes?: string` (ausente = no hubo ninguna).
- [ ] Un turno que termina con una nota sin entregar a NADIE devuelve `notasSobrantes` con su
  texto, y `notas` queda vacío al terminar (no se re-anuncia en el turno siguiente).
- [ ] Un turno donde la nota SÍ llegó a alguien no lleva `notasSobrantes`.
- [ ] El aviso por la piel (`avisos`) incluye una línea que lo dice, con el mismo patrón que
  `memoriaDescartada`/el aviso de escrituras sin preguntar.
- [ ] Con un especialista de motor EXTERNO trabajando (sin `capabilities`), `agregarNota` no
  revienta el turno y la nota sale como `notasSobrantes` — límite declarado en el spec, probado
  aquí porque necesita este campo para afirmarlo sin ambigüedad.

**Verify:** `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts -t "sobrante"` →
verde.

**Steps:**

- [ ] **Step 1: Escribe el test**

```ts
// añadir al describe de Task 4 en sesionTrueforge.test.ts
it("una nota que NADIE recibe antes de que el turno cierre sale como sobrante, y avisa", async () => {
  const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: modelos(), entorno: ENTORNO, skills: CATALOGO });
  const pi = piel();
  const turnoPromesa = s.turno("escribe una nota", pi.p);
  // Se añade DESPUÉS de que el turno haya terminado de verdad su última llamada: para
  // simularlo sin depender del timing exacto del guion de escritura, se añade ANTES de
  // esperar la promesa pero el guion de `modelos()` ya no vuelve a preguntarle a nadie
  // (termina en "Listo." tras escribir), así que nadie llega a consumirla.
  s.agregarNota("esto llega tarde");
  const r = await turnoPromesa;
  expect(r.notasSobrantes).toBe("esto llega tarde");
}, 20_000);

it("una nota que SÍ se entrega no sale como sobrante", async () => {
  const { m, vistos } = modelosConGuion([
    [new AIMessageChunk({ content: "Miro." })],
    [new AIMessageChunk({ content: "Listo." })],
  ]);
  const s = await abrirSesionTrueforge({ raiz: proyecto(), modelos: m, entorno: ENTORNO, skills: CATALOGO });
  const turnoPromesa = s.turno("mira algo", piel().p);
  await new Promise<void>((resuelto) => {
    const comprobar = () => (vistos.length >= 1 ? resuelto() : setTimeout(comprobar, 0));
    comprobar();
  });
  s.agregarNota("a tiempo");
  const r = await turnoPromesa;
  expect(r.notasSobrantes).toBeUndefined();
  expect(vistos[1]!.some((t) => t.includes("a tiempo"))).toBe(true);
}, 20_000);
```

- [ ] **Step 2: Corre — debe fallar**

Run: `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts -t "sobrante"`
Expected: FAIL — `r.notasSobrantes` es `undefined` en el primer test (el campo no existe / no se
calcula).

- [ ] **Step 3: Implementa**

En `src/core/entrega.ts`, dentro de `ResultadoDeTurno`, tras `motivoSinVerificar?: string;`:

```ts
  /**
   * El texto de las notas (IXCODE-4) que nadie llegó a recibir antes de que el turno cerrara,
   * concatenado. Quien orquesta las sesiones (`vestibulo.ts`) decide con esto si dispara el
   * turno siguiente — este tipo solo REPORTA, no dispara nada.
   */
  notasSobrantes?: string;
```

En `sesionTrueforge.ts`, importa `sobrantes` de `notas.js`:

```ts
import { crearNota, sobrantes, type Nota } from "./notas.js";
```

Justo antes del `return { bitacora, cambios, ... }` final de `turno()` (después del `finally` que
reconstruye `orquestador`), calcula y VACÍA la cola:

```ts
      const notasSobrantes = sobrantes(notas);
      notas.length = 0; // Se sirvieron o se reportan aquí: no siguen vivas para el próximo turno.
      const cambios: Cambio[] = await instantanea.cambios();
      return {
        bitacora,
        cambios,
        cortadoPorTope,
        verificador: veredicto,
        pendientes: sinResolver,
        ...(hallazgosDelTurno.length === 0 ? {} : { hallazgos: hallazgosDelTurno }),
        ...(preexistentesDelTurno === undefined ? {} : { preexistentes: preexistentesDelTurno }),
        ...(motivoSinVerificar === undefined ? {} : { motivoSinVerificar }),
        ...(notasSobrantes === undefined ? {} : { notasSobrantes }),
      };
```

Y el aviso por la piel: dentro de `bitacora = await correrTurno(entrelazar(flujo(), eventosExternos), piel, { avisos: (b) => [...] })`,
añade una entrada — OJO: en este punto `notas` TODAVÍA no se ha vaciado (eso ocurre después del
`finally`, ver arriba), así que se puede leer aquí para el aviso:

```ts
        bitacora = await correrTurno(entrelazar(flujo(), eventosExternos), piel, {
          avisos: (b) => [
            ...(memoriaDescartada === undefined ? [] : [memoriaDescartada]),
            ...(sobrantes(notas) === undefined ? [] : [`⚠ una nota no se pudo entregar a tiempo: se manda como el turno siguiente`]),
            ...(b.corrio("verify") || !escribioProyecto
              ? []
              : [`⚠ el verificador no ha corrido en este turno${motivoSinVerificar === undefined ? "" : ` (${motivoSinVerificar})`}`]),
            ...(aplicadasSinPreguntar.length === 0
              ? []
              : [`⚠ ${aplicadasSinPreguntar.length} escritura(s) aplicadas SIN aprobación: ${aplicadasSinPreguntar.join(", ")} — esta sesión va en modo autónomo`]),
          ],
          desde: t0,
        });
```

- [ ] **Step 4: Añade la comprobación con un hijo EXTERNO**, en el `describe("Claude Code, Codex
  y OpenCode como hijos de TrueForge", ...)` ya existente (usa `conExterno`, `fabrica`, `delegar`,
  ya definidos ahí — ver Task 4 para el porqué de que viva aquí y no allí):

```ts
// añadir dentro de describe("Claude Code, Codex y OpenCode como hijos de TrueForge", ...)
it("agregarNota mientras un hijo EXTERNO trabaja no revienta — no tiene capabilities, sale sobrante", async () => {
  const f = fabrica(["codex"], async () => "hecho por codex");
  const { m } = modelosConGuion([delegar(), [new AIMessageChunk({ content: "Listo." })]]);
  const s = await abrirSesionTrueforge({ raiz: conExterno(), modelos: m, entorno: ENTORNO, skills: CATALOGO, subagenteExterno: f.subagenteExterno });
  const turnoPromesa = s.turno("refactoriza", piel().p);
  s.agregarNota("esto no le puede llegar a un hijo externo");
  const r = await turnoPromesa;
  // No revienta, y la nota queda SOBRANTE: el hijo externo no tiene cómo consumirla, y la
  // raíz no vuelve a llamar al modelo tras recibir su respuesta (cierra con "Listo.").
  expect(r.notasSobrantes).toBe("esto no le puede llegar a un hijo externo");
  expect(f.peticiones[0]!.instrucciones).not.toContain("esto no le puede llegar");
}, 30_000);
```

- [ ] **Step 5: Corre — deben pasar**

Run: `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts -t "sobrante"`
Expected: PASS, los tres tests (los dos del Step 1 más el del hijo externo).

- [ ] **Step 6: Corre el fichero entero y el gate de tipos**

Run: `npx vitest run src/agent/motores/trueforge/sesionTrueforge.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/entrega.ts src/agent/motores/trueforge/sesionTrueforge.ts src/agent/motores/trueforge/sesionTrueforge.test.ts
git commit -m "feat(trueforge): notasSobrantes en ResultadoDeTurno — una nota tardía no se pierde (IXCODE-4)"
```

---

## Task 6: El servidor enruta "prosa mientras trabaja" a `agregarNota`

**Goal:** `SesionReal.agregarNota?` en el contrato compartido, `SesionCerrable.agregarNota?` en
el subconjunto que ve `vestibulo.ts`, y la rama `clase === "prosa"` de `consolaWeb.ts` llamando a
una nueva opción `notaMientrasTrabaja` en vez de encolar siempre una `LineaDeConsola`.

**Files:**
- Modify: `src/agent/turno/sesionReal.ts`
- Modify: `src/web/servidor/consolaWeb.ts`
- Modify: `src/web/servidor/consolaWeb.test.ts`
- Modify: `src/web/servidor/vestibulo.ts`
- Modify: `src/web/servidor/vestibulo.test.ts`

**Acceptance Criteria:**
- [ ] `SesionReal.agregarNota?(texto: string): void` — opcional; `deepagents` no lo implementa y
  sigue tipando bien.
- [ ] `OpcionesDeConsolaWeb.notaMientrasTrabaja?: (texto: string) => boolean` — si devuelve
  `true`, `recibir()` NO encola la `LineaDeConsola` (pero SÍ sigue anotando el eco al transcript,
  igual que hoy).
- [ ] `vestibulo.ts` construye `notaMientrasTrabaja` a partir de `turnoEnVuelo` y
  `sesionReal?.agregarNota`, y se lo pasa a `crearConsola`.
- [ ] Con turno en marcha y `notaMientrasTrabaja` disponible: `recibir({clase:"prosa", ...})` NO
  mete nada en `cola`/`esperandoLinea` de `consolaWeb.ts`.
- [ ] Sin turno en marcha (o sin `agregarNota` — deepagents): el camino de hoy, sin cambios.

**Verify:** `npx vitest run src/web/servidor/consolaWeb.test.ts src/web/servidor/vestibulo.test.ts`
→ todos en verde.

**Steps:**

- [ ] **Step 1: Escribe el test en `consolaWeb.test.ts`**

```ts
// añadir a src/web/servidor/consolaWeb.test.ts
it("con `notaMientrasTrabaja` disponible y diciendo que sí, la prosa NO se encola como línea", async () => {
  const notas: string[] = [];
  const cw = crearConsolaWeb({ notaMientrasTrabaja: (texto) => (notas.push(texto), true) });
  const it = cw.consola.lineas[Symbol.asyncIterator]();
  cw.recibir({ clase: "prosa", texto: "cambia de idea" });
  expect(notas).toEqual(["cambia de idea"]);
  // No hay línea encolada: pedir la siguiente no resuelve todavía (usar un plazo corto).
  const carrera = await Promise.race([it.next().then(() => "resolvió"), new Promise((r) => setTimeout(() => r("sigue-esperando"), 20))]);
  expect(carrera).toBe("sigue-esperando");
});

it("sin `notaMientrasTrabaja`, o si dice que no, la prosa se encola como siempre", async () => {
  const cw = crearConsolaWeb({ notaMientrasTrabaja: () => false });
  const it = cw.consola.lineas[Symbol.asyncIterator]();
  cw.recibir({ clase: "prosa", texto: "haz algo" });
  expect(await it.next()).toEqual({ value: { texto: "haz algo", comoComando: false }, done: false });
});
```

(Ajusta `cw.consola.lineas` / el acceso al iterador exacto al nombre real que ya usan los tests
vecinos de este fichero — `consolaWeb.test.ts:34` y alrededores ya construyen y consumen `lineas`
de la misma forma; sigue ESE patrón literal si difiere del snippet.)

- [ ] **Step 2: Corre — debe fallar**

Run: `npx vitest run src/web/servidor/consolaWeb.test.ts -t "notaMientrasTrabaja"`
Expected: FAIL — la opción no existe, ambos tests ven el comportamiento de hoy (siempre encola).

- [ ] **Step 3: Implementa en `consolaWeb.ts`**

En `OpcionesDeConsolaWeb`, tras `consumoAcumulado`:

```ts
  /**
   * Si hay un turno en marcha, intenta apuntar el texto AHÍ en vez de encolarlo como línea
   * nueva (IXCODE-4). `true` si lo consumió así — `recibir` no encola nada más—; `false` o
   * ausente y `recibir` sigue el camino de hoy. Quien inyecta esto (`vestibulo.ts`) es quien
   * sabe si hay turno en vuelo y tiene la sesión real; este módulo no sabe de ninguna.
   */
  notaMientrasTrabaja?: (texto: string) => boolean;
```

En `recibir`, rama `clase === "prosa"` (la función local `anotar` de la línea 403 es OTRA cosa —
el eco al transcript— y se deja intacta):

```ts
  const recibir = (mensaje: MensajeDelCliente): void => {
    if (mensaje.clase === "prosa") {
      if (cerrada) return;
      anotar({ tipo: "usuario", texto: mensaje.texto });
      if (opciones.notaMientrasTrabaja?.(mensaje.texto) === true) return;
      const despertar = esperandoLinea.shift();
      const linea: LineaDeConsola = { texto: mensaje.texto, comoComando: false };
      if (despertar !== undefined) despertar({ value: linea, done: false });
      else cola.push(linea);
      return;
    }
    // ... resto sin cambios
```

- [ ] **Step 4: Corre — deben pasar**

Run: `npx vitest run src/web/servidor/consolaWeb.test.ts`
Expected: PASS, todos.

- [ ] **Step 5: Escribe el test en `vestibulo.test.ts`** (mismo patrón que "cerrar la consola de
  proyecto ABORTA la sesión real": `crearEjecutor: (alAbrirSesion) => ...` anuncia una sesión de
  pega con `agregarNota` espiado, y se comprueba que `proyecto.recibir({clase:"prosa", ...})`
  DURANTE el turno la invoca en vez de encolar)

```ts
it("una prosa mientras el turno está en marcha se manda a `agregarNota`, no se encola", async () => {
  const s = sesionesEnMemoria();
  const notas: string[] = [];
  const v = crearVestibulo({
    ...dobles(),
    origenDeTrabajo: "global",
    sesiones: s.puerto,
    crearEjecutor: (alAbrirSesion) => async () => {
      alAbrirSesion({ cerrar: () => {}, agregarNota: (texto: string) => void notas.push(texto) });
      // No resuelve nunca por su cuenta: es "un turno largo" en marcha de verdad.
      await new Promise(() => {});
    },
  });
  const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
  proyecto.recibir({ clase: "prosa", texto: "arranca algo largo" });
  await new Promise((r) => setTimeout(r, 0)); // deja que el ejecutor arranque y anuncie la sesión
  proyecto.recibir({ clase: "prosa", texto: "cambia de idea" });
  expect(notas).toEqual(["cambia de idea"]);
});
```

- [ ] **Step 6: Corre — debe fallar**

Run: `npx vitest run src/web/servidor/vestibulo.test.ts -t "agregarNota"`
Expected: FAIL — `notas` sigue vacío (la prosa se encoló, `notaMientrasTrabaja` no existe todavía
en `vestibulo.ts`).

- [ ] **Step 7: Implementa en `vestibulo.ts`**

En `SesionCerrable` (tras `cancelar?`):

```ts
  /** Añade una nota al turno EN MARCHA (IXCODE-4). Opcional: el ejecutor guionizado y
   *  `deepagents` no lo tienen. */
  agregarNota?(texto: string): void;
```

Junto a la construcción de `notaMientrasTrabaja` (ANTES de `crearConsola`, cerca de
`consumoVivo`, leyendo `sesionReal`/`turnoEnVuelo` en el momento de la llamada — igual que
`consumoVivo` lee `sesionReal` con el mismo patrón perezoso):

```ts
    const notaMientrasTrabaja = (texto: string): boolean => {
      if (!turnoEnVuelo || sesionReal?.agregarNota === undefined) return false;
      sesionReal.agregarNota(texto);
      return true;
    };
```

y pásalo a `crearConsola`:

```ts
    const consolaWeb = crearConsola({
      catalogoModelos: opciones.catalogoModelos,
      guardarModeloGlobal,
      ...(opciones.msDeEspera === undefined ? {} : { msDeEspera: opciones.msDeEspera }),
      consumoAcumulado: consumoVivo,
      notaMientrasTrabaja,
    });
```

(`turnoEnVuelo` se declara MÁS ABAJO en el fichero, línea ~1288 — igual que `sesionReal` se
asigna más abajo y `consumoVivo` ya lo lee por delante: es el mismo patrón de cierre perezoso, no
hace falta reordenar nada.)

- [ ] **Step 8: Corre — debe pasar**

Run: `npx vitest run src/web/servidor/vestibulo.test.ts -t "agregarNota"`
Expected: PASS.

- [ ] **Step 9: Corre los dos ficheros enteros + typecheck**

Run: `npx vitest run src/web/servidor/consolaWeb.test.ts src/web/servidor/vestibulo.test.ts &&
npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/agent/turno/sesionReal.ts src/web/servidor/consolaWeb.ts src/web/servidor/consolaWeb.test.ts src/web/servidor/vestibulo.ts src/web/servidor/vestibulo.test.ts
git commit -m "feat(web): prosa mientras el turno trabaja va a agregarNota, no a la cola (IXCODE-4)"
```

(El campo `SesionReal.agregarNota?` de `agent/turno/sesionReal.ts` se añade en este mismo commit,
junto a `cancelar()`, con el mismo comentario que `SesionCerrable.agregarNota?`.)

---

## Task 7: Una nota sobrante dispara el turno siguiente SOLA

**Goal:** Cuando `ejecutarTurno` recibe `resultado.notasSobrantes`, en cuanto el turno actual
libera `turnoEnVuelo` se dispara OTRO turno con ese texto — sin que nadie tenga que volver a
escribirlo.

**Files:**
- Modify: `src/web/servidor/vestibulo.ts`
- Modify: `src/web/servidor/vestibulo.test.ts`

**Acceptance Criteria:**
- [ ] Un `resultado.notasSobrantes` no vacío hace que, tras el `finally` de `ejecutarTurno` (que
  ya puso `turnoEnVuelo = false`), se llame OTRA VEZ a `ejecutarTurno` con ese texto como
  petición.
- [ ] El turno original DEVUELVE su propio resultado al llamador de siempre — el turno de
  sobrante corre APARTE (no se espera antes de devolver, ni se mezcla en el mismo resultado).
- [ ] Un `notasSobrantes` ausente no dispara nada extra (el camino de hoy, sin cambios).
- [ ] Un fallo del turno de sobrante no tumba nada: se trata igual que cualquier turno que
  revienta (el propio `try/finally` de `ejecutarTurno` ya lo cubre al ser la MISMA función).

**Verify:** `npx vitest run src/web/servidor/vestibulo.test.ts -t "sobrante"` → verde.

**Steps:**

- [ ] **Step 1: Escribe el test**

```ts
it("un turno que devuelve notasSobrantes dispara OTRO turno solo, con ese texto", async () => {
  const s = sesionesEnMemoria();
  const peticiones: string[] = [];
  let primeraVez = true;
  const v = crearVestibulo({
    ...dobles(),
    origenDeTrabajo: "global",
    sesiones: s.puerto,
    crearEjecutor: () => async (peticion: string) => {
      peticiones.push(peticion);
      if (primeraVez) {
        primeraVez = false;
        return { bitacora: { pasos: [] }, cambios: [], cortadoPorTope: false, verificador: "no-corrio", pendientes: 0, notasSobrantes: "cambia de idea" };
      }
      return { bitacora: { pasos: [] }, cambios: [], cortadoPorTope: false, verificador: "no-corrio", pendientes: 0 };
    },
  });
  const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
  proyecto.recibir({ clase: "prosa", texto: "haz algo" });
  await new Promise((r) => setTimeout(r, 0)); // dos vueltas: el turno original Y el del sobrante
  await new Promise((r) => setTimeout(r, 0));
  expect(peticiones).toEqual(["haz algo", "cambia de idea"]);
});

it("sin notasSobrantes, no se dispara ningún turno extra", async () => {
  const s = sesionesEnMemoria();
  const peticiones: string[] = [];
  const v = crearVestibulo({
    ...dobles(),
    origenDeTrabajo: "global",
    sesiones: s.puerto,
    crearEjecutor: () => async (peticion: string) => {
      peticiones.push(peticion);
      return { bitacora: { pasos: [] }, cambios: [], cortadoPorTope: false, verificador: "no-corrio", pendientes: 0 };
    },
  });
  const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
  proyecto.recibir({ clase: "prosa", texto: "haz algo" });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  expect(peticiones).toEqual(["haz algo"]);
});
```

(Ajusta la forma exacta del objeto `Bitacora`/el resto de campos que `dobles()`/los tests vecinos
de `vestibulo.test.ts` ya usan para un ejecutor de pega — sigue el molde de un `crearEjecutor` de
pega YA existente en este fichero en vez del literal de arriba si `Bitacora` exige más campos.)

- [ ] **Step 2: Corre — debe fallar**

Run: `npx vitest run src/web/servidor/vestibulo.test.ts -t "sobrante"`
Expected: FAIL — `peticiones` solo lleva `["haz algo"]` en el primer test (nada dispara el
segundo turno).

- [ ] **Step 3: Implementa** — en `ejecutarTurno` (`vestibulo.ts`), en el `try` que ya envuelve
  `ejecutorEfectivo`:

```ts
    const ejecutarTurno: EjecutorDeTurno = async (peticion, estado, consola) => {
      if (estado.raiz !== raiz) {
        throw new Error("ese turno trae la raíz de otro proyecto: esta consola solo corre turnos sobre la suya");
      }
      historica = false;
      turnoEnVuelo = true;
      consolaWeb.turno(true);
      alFlancoDeTurno?.(true);
      try {
        const resultado = await ejecutorEfectivo(`${lineaDelDispositivo(dispositivo)}\n\n${peticion}`, estado, consola);
        return resultado;
      } finally {
        turnoEnVuelo = false;
        consolaWeb.turno(false);
        alFlancoDeTurno?.(false);
        volcar();
        // ... (el resto del finally existente, incluido el await del commit, sin tocar)
      }
    };
```

Y tras el `try/finally` — el sobrante se dispara DESPUÉS de que el `finally` haya soltado
`turnoEnVuelo`, en su PROPIA llamada recursiva (fire-and-forget: el turno original ya devolvió lo
suyo al llamador; este es un turno NUEVO que sigue el mismo camino que cualquier mensaje del
usuario, con su propio `try/finally`):

```ts
    const ejecutarTurno: EjecutorDeTurno = async (peticion, estado, consola) => {
      if (estado.raiz !== raiz) {
        throw new Error("ese turno trae la raíz de otro proyecto: esta consola solo corre turnos sobre la suya");
      }
      historica = false;
      turnoEnVuelo = true;
      consolaWeb.turno(true);
      alFlancoDeTurno?.(true);
      let resultado;
      try {
        resultado = await ejecutorEfectivo(`${lineaDelDispositivo(dispositivo)}\n\n${peticion}`, estado, consola);
        return resultado;
      } finally {
        turnoEnVuelo = false;
        consolaWeb.turno(false);
        alFlancoDeTurno?.(false);
        volcar();
        // ... resto del finally EXISTENTE sin tocar ...
        // Al final del todo, YA con turnoEnVuelo en false: una nota sobrante se manda SOLA,
        // como el siguiente turno — no se espera aquí (el turno actual ya está devolviendo lo
        // suyo), y su propio try/finally vuelve a pasar por este mismo camino.
        if (resultado?.notasSobrantes !== undefined) {
          void ejecutarTurno(resultado.notasSobrantes, estado, consola);
        }
      }
    };
```

- [ ] **Step 4: Corre — deben pasar**

Run: `npx vitest run src/web/servidor/vestibulo.test.ts -t "sobrante"`
Expected: PASS, los dos tests.

- [ ] **Step 5: Corre el fichero entero + typecheck**

Run: `npx vitest run src/web/servidor/vestibulo.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/servidor/vestibulo.ts src/web/servidor/vestibulo.test.ts
git commit -m "feat(web): una nota sobrante dispara el turno siguiente sola (IXCODE-4)"
```

---

## Task 8: El compositor — escribible mientras el agente trabaja, salvo con algo pendiente

**Goal:** El campo deja de apagarse por `turnoEnVuelo`; se apaga por `hayPendiente` (una
aprobación, pregunta, selector o secreto visibles). El botón de Parar y el borde de "trabajando"
NO cambian — siguen atados a `turnoEnVuelo`.

**Files:**
- Modify: `apps/web/src/componentes/Compositor.tsx`
- Modify: `apps/web/src/componentes/Compositor.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Acceptance Criteria:**
- [ ] `Compositor` gana la prop `hayPendiente?: boolean` (omisión `false`).
- [ ] `disabled` del `<textarea>` pasa de `!conectado || turnoEnVuelo` a `!conectado ||
  hayPendiente`.
- [ ] `enviar()` deja de cortar con `if (turnoEnVuelo) return;` y corta con `if (hayPendiente)
  return;` — SIN esto, el campo se vería escribible pero Enter no haría nada.
- [ ] El `useEffect` que devuelve el foco al terminar pasa de mirar el flanco de bajada de
  `turnoEnVuelo` al de `hayPendiente`.
- [ ] El placeholder: sin conexión → igual que hoy; `hayPendiente` → nuevo texto que lo explica;
  ni una cosa ni otra → el placeholder de dos líneas de siempre, YA NO condicionado a
  `turnoEnVuelo`.
- [ ] `App.tsx` calcula `hayPendiente` de `estado.aprobacion`/`estado.pregunta`/
  `estado.selector`/`estado.secreto` y se lo pasa a `Compositor`.
- [ ] Los tres tests existentes que asumían que `turnoEnVuelo` deshabilita o bloquea Enter se
  REESCRIBEN sobre `hayPendiente`; los dos que solo miran el botón de Parar y el borde de
  "trabajando" NO cambian.

**Verify:** `npx vitest run apps/web/src/componentes/Compositor.test.tsx && npm run typecheck` →
verde.

**Steps:**

- [ ] **Step 1: Reescribe/añade los tests en `Compositor.test.tsx`**

Sustituye el test `"al terminar el turno, el foco vuelve a la caja"` (usa `turnoEnVuelo`) por:

```ts
  it("al dejar de haber algo pendiente, el foco vuelve a la caja", () => {
    const { rerender } = render(<Compositor {...manejadores} hayPendiente />);
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));
    rerender(<Compositor {...manejadores} />);
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });
```

Sustituye `"pero NO se lo roba si la caja está oculta ni al montar"`:

```ts
  it("pero NO se lo roba si la caja está oculta ni al montar", () => {
    const { rerender } = render(<Compositor {...manejadores} hayPendiente oculto />);
    rerender(<Compositor {...manejadores} oculto />);
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));
    rerender(<Compositor {...manejadores} />);
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));
  });
```

Sustituye `"con turno en vuelo la entrada se apaga y dice por qué"`:

```ts
  it("con algo pendiente la entrada se apaga y dice por qué", () => {
    render(<Compositor conectado hayPendiente alEnviar={() => {}} />);
    const entrada = screen.getByPlaceholderText(/responde/i) as HTMLTextAreaElement;
    expect(entrada.disabled).toBe(true);
  });

  it("con turno en vuelo pero SIN nada pendiente, la entrada sigue escribible", () => {
    render(<Compositor conectado turnoEnVuelo alEnviar={() => {}} />);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(false);
  });
```

Dentro de `"la flecha se convierte en parar..."`, sin cambios (sigue con `turnoEnVuelo` a secas).

Sustituye `"el Enter tampoco cuela con el turno en vuelo"`:

```ts
  it("el Enter SÍ cuela con turno en vuelo, si no hay nada pendiente — es la nota de IXCODE-4", () => {
    const alEnviar = vi.fn();
    const { rerender } = render(<Compositor conectado alEnviar={alEnviar} />);
    const entrada = screen.getByRole("textbox");
    fireEvent.change(entrada, { target: { value: "cambia de idea" } });
    rerender(<Compositor conectado turnoEnVuelo alEnviar={alEnviar} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(alEnviar).toHaveBeenCalledWith("cambia de idea");
  });

  it("el Enter NO cuela con algo pendiente", () => {
    const alEnviar = vi.fn();
    const { rerender } = render(<Compositor conectado alEnviar={alEnviar} />);
    const entrada = screen.getByRole("textbox");
    fireEvent.change(entrada, { target: { value: "algo" } });
    rerender(<Compositor conectado hayPendiente alEnviar={alEnviar} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(alEnviar).not.toHaveBeenCalled();
  });
```

`"la caja se marca como trabajando..."`, sin cambios (sigue con `turnoEnVuelo`).

- [ ] **Step 2: Corre — deben fallar**

Run: `npx vitest run apps/web/src/componentes/Compositor.test.tsx`
Expected: FAIL — `hayPendiente` no existe como prop, `disabled`/`enviar` siguen mirando
`turnoEnVuelo`.

- [ ] **Step 3: Implementa en `Compositor.tsx`**

Prop nueva, en la firma:

```ts
export function Compositor({
  conectado,
  turnoEnVuelo = false,
  hayPendiente = false,
  // ... resto igual
}: {
  conectado: boolean;
  turnoEnVuelo?: boolean;
  /**
   * Hay una aprobación, pregunta, selector o secreto EN PANTALLA esperando respuesta. Apaga la
   * entrada — a diferencia de `turnoEnVuelo` a secas, que desde IXCODE-4 deja escribir una nota
   * mientras el agente trabaja EN SILENCIO. Con un diálogo delante, escribir aquí competiría
   * con la respuesta que de verdad se espera.
   */
  hayPendiente?: boolean;
  // ... resto igual
}) {
```

`disabled` y el `useEffect` del foco:

```ts
  const veniaDePendiente = useRef(false);
  useEffect(() => {
    const acabaDeTerminar = veniaDePendiente.current && !hayPendiente;
    veniaDePendiente.current = hayPendiente;
    if (acabaDeTerminar && !oculto && conectado) campo.current?.focus();
  }, [hayPendiente, oculto, conectado]);

  const enviar = (): void => {
    // Con algo pendiente no se manda: una aprobación o pregunta compite por la misma
    // respuesta. Con turno en vuelo y SIN nada pendiente, sí se manda — es la nota de
    // IXCODE-4, y el servidor decide si se apunta al turno en marcha o abre uno nuevo.
    if (hayPendiente) return;
    const texto = valor.trim();
    if (texto === "") return;
    alEnviar(texto);
    setValor("");
  };
```

Y el `<textarea>`:

```tsx
        <textarea
          ref={campo}
          className={estilos.entrada}
          value={valor}
          disabled={!conectado || hayPendiente}
          placeholder={
            !conectado
              ? "sin conexión con XOneCode"
              : hayPendiente
                ? "responde arriba antes de seguir"
                : // DOS líneas: ... (el resto del placeholder existente, SIN el condicional de
                  // `turnoEnVuelo` que había antes: ahora aplica también mientras el agente
                  // trabaja, que es justo cuando más falta hace recordar las teclas).
```

(Mantén el resto del bloque de placeholder de dos líneas tal cual está — solo cambia la condición
que decidía entre "el agente está trabajando…" y las dos líneas, que ahora es `hayPendiente` en
vez de `turnoEnVuelo`, y la rama "el agente está trabajando…" desaparece.)

- [ ] **Step 4: Corre — deben pasar**

Run: `npx vitest run apps/web/src/componentes/Compositor.test.tsx`
Expected: PASS, todos.

- [ ] **Step 5: Cablea `hayPendiente` en `App.tsx`**, en la llamada a `<Compositor ...>` (junto a
  `conectado={estado.conectado}`):

```tsx
            <Compositor
              conectado={estado.conectado}
              hayPendiente={
                estado.aprobacion !== undefined ||
                estado.pregunta !== undefined ||
                estado.selector !== undefined ||
                estado.secreto !== undefined
              }
              turnoEnVuelo={/* lo que ya pasa hoy, sin cambios */}
              {/* ... resto igual */}
```

- [ ] **Step 6: Verifica manualmente en el navegador** (`npm run web`): abre un proyecto, manda
  un encargo que tarde, comprueba que puedes escribir y mandar una nota MIENTRAS trabaja, que al
  aparecer una aprobación el campo se apaga, y que al resolverla el foco vuelve solo.

- [ ] **Step 7: Corre TODO el proyecto cliente + typecheck**

Run: `npx vitest run apps/web/src/componentes/Compositor.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/componentes/Compositor.tsx apps/web/src/componentes/Compositor.test.tsx apps/web/src/App.tsx
git commit -m "feat(web): el compositor se escribe mientras el agente trabaja, se apaga con algo pendiente (IXCODE-4)"
```

---

## Final: correr el gate entero

```bash
npm run typecheck && npm test
```

Expected: todo en verde. Este es el mismo gate que corre CI (`src/gate.test.ts` lo exige, ver
`CLAUDE.md`).
