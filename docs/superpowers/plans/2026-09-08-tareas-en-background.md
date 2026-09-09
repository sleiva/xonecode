# Tareas en background — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encargos por proyecto que se ejecutan solos: cola global con tope de concurrencia y cerrojo por proyecto, y cuando una tarea se topa con algo que necesita a una persona se APARCA con el motivo en vez de decidir por ella.

**Architecture:** `core/tareas.ts` es la parte pura —estados, transiciones y planificación— y se lleva la mayoría de los tests. `agent/tareasEnDisco.ts` persiste la cola en `~/.xonecode/tareas/` (de la máquina, no de un proyecto: el kanban es global). `web/servidor/corredorDeTareas.ts` es el lazo, con cerrojo de pid y reconciliación al arrancar. Una tarea corre sobre una `ConsolaDeProyecto` abierta por una SEGUNDA puerta (`abrirParaTarea`) que no mueve el proyecto abierto del cable, con una `Consola` propia que APARCA en vez de contestar aprobaciones y preguntas.

**Tech Stack:** TypeScript, `node:http` + SSE (`src/web`), React 18 + Vite (`apps/web`), CSS Modules, vitest (proyectos `host` en node y `cliente` en jsdom).

**Spec:** `docs/superpowers/specs/2026-09-08-tareas-en-background-design.md`

## Global Constraints

> **REVISIÓN DEL 8-09-2026 — LAS TAREAS SON AUTÓNOMAS (§0 del spec, léela).** Decisión del
> usuario tomada con las Tasks 1-5 ya hechas. Una tarea **aplica** sus escrituras sin pedir
> aprobación; la autorización es el acto de crear la tarea. `requiere-atencion` pasa a
> significar «esperando feedback del desarrollador» y se resuelve EDITANDO la tarea, no
> aprobando un diff. El plan no se aprueba: se planifica, se desarrolla, lo evalúa un juez de
> QA, y se entrega. El sitio que deja la aprobación lo ocupan el verificador (que ya corre en
> el turno) y ese juez — y **el veredicto del juez no basta solo**: las condiciones las
> comprueba el código. Las Tasks 10, 11 y 12 son las nuevas; las 7 y 9 cambian, y su texto
> lo dice donde toca.

- **`npm test` no necesita clave, red, simulador ni procesos.** Todo lo que toca disco, modelo o proceso entra por opción con su doble: el corredor recibe el abridor y el reloj, el aumentador es un puerto, y la persistencia se prueba contra un directorio temporal.
- **Una tarea NUNCA decide lo que le toca a una persona.** No aprueba, no contesta preguntas y no se declara terminada por agotarse un plazo. Lo que no puede resolver, lo aparca con `motivo`. Es la regla que sostiene el spec entero (§1) y la que los tests de la Task 4 protegen.
- **Frontera del cliente** (`src/web/frontera.test.ts`): nada de `apps/web/` importa de `src/`. Los tipos del cable se REDECLARAN en `apps/web/src/tipos.ts`, y `tipos.test.ts` compara los literales `clase:` de las dos uniones con los del host — los dos ficheros tienen que llevar exactamente los mismos.
- **Frontera de `core/`** (`src/core/imports.test.ts`): `core/tareas.ts` no importa langchain, deepagents, ink, react ni `node:fs`. Es datos y reglas.
- **Por el cable no viaja NINGUNA ruta de la máquina.** Ni la raíz del proyecto ni la del adjunto: viajan el id del proyecto, su nombre y el nombre del fichero. Misma regla que `sinRutas` y que los comandos de la receta de instalación.
- **Ningún color literal en los `.module.css`** (`Barra.test.tsx` lo vigila): solo alias `--dsw-alias-*`, `--xonecode-*` y `--ds-font-family-code`. El acento es `--xonecode-cian`.
- **La lista blanca del store se copia campo a campo**, y un campo nuevo no llega hasta que se nombra ahí. Ya ha mordido tres veces (`mime`/`base64`, `recetas`, `ejecutable`): cada mensaje nuevo lleva su test de store.
- **Constantes con nombre**: `CONCURRENCIA_POR_OMISION = 2`, `TOPE_DE_ADJUNTO = 20_000_000`, `TOPE_DE_ADJUNTOS_POR_TAREA = 50_000_000`.
- **Estilo de comentarios del repo**: cada decisión no obvia lleva su porqué en un comentario, en castellano.

**User decisions (already made):**
- «Se podrán crear tareas por proyectos para que se realicen de forma autónoma.»
- «Se encolarán y se irán ejecutando secuencial o paralela (con un máximo de concurrencia); las tareas del mismo proyecto secuenciales.»
- «En la UX de crear la tarea el usuario podrá anexar documentos, imágenes etc.»
- «El request del usuario se augmenta en un primer nivel» → una llamada al modelo al CREAR, y **se le enseña al usuario para que lo edite antes de encolar** (opción 1 de las tres que se le ofrecieron).
- «El agente ha de poner la tarea en espera si se encuentra en un paso bloqueante.»
- «Habrá un dashboard de tareas en background como un kanban view y por proyecto habrá una lista de tareas con sus estados.»
- Estados: **nuevo, en proceso, requiere atención, terminada** — exactamente esos cuatro.
- Aprobado en la conversación: la cola en `~/.xonecode/tareas/`; los adjuntos con la TAREA (no con el proyecto); las tareas NO sobreviven a parar el proceso y eso se dice; los adjuntos montados en `/adjuntos/` de solo lectura; el agente los lee pero NO ve las imágenes.

---

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/core/tareas.ts` | Estados, transiciones, planificación (`siguientesAEjecutar`) y `tituloDeTarea`. Puro. |
| `src/core/tareas.test.ts` | La mayoría de los tests del trabajo: FIFO, tope, cerrojo por proyecto, transiciones. |
| `src/core/textos.ts` | `tituloDesde` extraído de `web/servidor/sesiones.ts` para que `core/` lo pueda usar. |
| `src/agent/tareasEnDisco.ts` | `~/.xonecode/tareas/`: índice, cerrojo de pid, carpeta de la tarea y sus adjuntos. |
| `src/web/servidor/consolaDeTarea.ts` | La `Consola` de una tarea: APARCA aprobaciones y preguntas; `eof: () => true`. |
| `src/web/servidor/corredorDeTareas.ts` | El lazo: cerrojo, reconciliación, arranque de tareas y transiciones. |
| `src/web/servidor/vestibulo.ts` | `abrirParaTarea(raiz)`: segunda puerta al mismo constructor, sin tocar el cable. |
| `src/web/servidor/transporte.ts` | Mensajes `tareas` y `tarea` en las dos direcciones. |
| `src/web/servidor/arranque.ts` | Manejadores del cable, ruta `POST /adjunto` y cableado real del corredor. |
| `src/agent/aumentador.ts` | `AumentadorPort` real: una llamada al papel `trabajo` que convierte la petición en encargo. |
| `apps/web/src/tipos.ts` | Redeclaración de los mensajes y de `TareaDelCable`. |
| `apps/web/src/store.ts` | `tareas`, campo a campo. |
| `apps/web/src/componentes/Kanban.tsx` | Las cuatro columnas, en el escritorio. |
| `apps/web/src/componentes/NuevaTarea.tsx` | Crear: petición, encargo augmentado editable y adjuntos. |
| `apps/web/src/componentes/TareasDelProyecto.tsx` | La lista por proyecto, como pestaña. |

---

## Task 1: `core/tareas.ts` — estados, transiciones y planificación

**Goal:** La parte pura y con la mayoría de los tests: qué es una tarea, qué transiciones valen, y qué tareas pueden arrancar ahora mismo.

**Files:**
- Create: `src/core/tareas.ts`
- Create: `src/core/tareas.test.ts`
- Create: `src/core/textos.ts`
- Modify: `src/web/servidor/sesiones.ts:78-90` (reexportar `tituloDesde` desde `core/textos.ts`)

**Acceptance Criteria:**
- [ ] `siguientesAEjecutar` respeta FIFO por `creada`, el tope de concurrencia y NUNCA devuelve dos del mismo proyecto
- [ ] Las tareas ya `en-proceso` cuentan para el tope y ocupan su proyecto
- [ ] `conEstado` rechaza una transición imposible y EXIGE motivo al aparcar
- [ ] `core/imports.test.ts` sigue en verde (nada de `node:fs` ni librerías de agente)
- [ ] `tituloDesde` no está duplicado: `sesiones.ts` lo reexporta de `core/textos.ts`

**Verify:** `npx vitest run src/core/tareas.test.ts src/core/imports.test.ts src/web/servidor/sesiones.test.ts` → todo en verde

**Steps:**

- [ ] **Step 1: Extraer `tituloDesde` a `core/textos.ts`**

`core/tareas.ts` necesita el mismo título que una sesión, y `core/` no puede importar de `web/`. Se mueve la función y `sesiones.ts` la reexporta con su nombre de siempre.

```ts
// src/core/textos.ts
/**
 * El título que se le pone a una conversación o a una tarea: su primera frase, entera.
 *
 * Vivía en `web/servidor/sesiones.ts` y se movió aquí cuando las TAREAS necesitaron el mismo
 * título: `core/` no puede importar de `web/`, y una segunda copia habría divergido — con el
 * síntoma de que la misma frase diera dos títulos distintos según quién la mirara.
 *
 * Sin llamar a ningún modelo: primera frase o línea, sin la comilla de apertura, cortada en
 * palabra entera a 60 con puntos suspensivos.
 */
export function tituloDesde(texto: string): string {
  const primera = texto
    .trim()
    .split(/\r?\n/)[0]!
    .split(/(?<=[.!?:;])\s/)[0]!
    .replace(/[.!?:;]+$/u, "")
    .replace(/^[«"“'‘¿¡\s]+/u, "")
    .trim();
  if (primera.length <= 60) return primera;
  const corte = primera.slice(0, 60);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > 20 ? corte.slice(0, espacio) : corte).trimEnd()}…`;
}
```

En `src/web/servidor/sesiones.ts`, sustituir el cuerpo de `tituloDesde` por un import y una
reexportación LOCAL (mantener el nombre exportado: lo usan `anotarActo` y sus tests):

```ts
import { tituloDesde } from "../../core/textos.js";
// …
export { tituloDesde };
```

**Un `export { x } from "…"` no vale aquí**, y es la trampa de este paso: reexporta sin crear
binding local, y `anotarActo` llama a `tituloDesde` en este mismo fichero — reventaría en
runtime con los tests de tipos en verde.

Y el cuerpo que se mueve es el que YA ESTÁ, copiado tal cual: usa las constantes
`LARGO_TITULO`/`LARGO_TITULO_AUTOMATICO` y recorta la cola con `.replace(/[\s,;:]+$/u, "")`.
El bloque de arriba es una versión legible del mismo algoritmo, no el texto a pegar: los
tests de `sesiones.test.ts` dependen de esos detalles.

- [ ] **Step 2: Escribir el test de la planificación (falla)**

```ts
// src/core/tareas.test.ts
import { describe, expect, it } from "vitest";
import { conEstado, siguientesAEjecutar, tituloDeTarea, type Tarea } from "./tareas.js";

function tarea(extra: Partial<Tarea> = {}): Tarea {
  return {
    id: extra.id ?? "t1",
    proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
    titulo: "Arregla el login",
    peticion: "Arregla el login",
    encargo: "Arregla el login",
    adjuntos: [],
    estado: "nuevo",
    creada: "2026-09-08T10:00:00.000Z",
    ...extra,
  };
}

describe("siguientesAEjecutar", () => {
  it("FIFO por fecha de creación, y nunca más que el tope", () => {
    const lista = [
      tarea({ id: "b", creada: "2026-09-08T10:00:02.000Z", proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } }),
      tarea({ id: "a", creada: "2026-09-08T10:00:01.000Z", proyecto: { id: "pa", raiz: "/w/A", nombre: "A" } }),
      tarea({ id: "c", creada: "2026-09-08T10:00:03.000Z", proyecto: { id: "pc", raiz: "/w/C", nombre: "C" } }),
    ];
    expect(siguientesAEjecutar(lista, { concurrencia: 2 }).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("NUNCA dos del mismo proyecto: comparten disco, git y checkpointer", () => {
    const lista = [
      tarea({ id: "a", creada: "2026-09-08T10:00:01.000Z" }),
      tarea({ id: "b", creada: "2026-09-08T10:00:02.000Z" }),
    ];
    expect(siguientesAEjecutar(lista, { concurrencia: 5 }).map((t) => t.id)).toEqual(["a"]);
  });

  it("las que ya corren gastan hueco Y ocupan su proyecto", () => {
    const lista = [
      tarea({ id: "corriendo", estado: "en-proceso", empezada: "2026-09-08T10:00:00.000Z" }),
      tarea({ id: "mismo", creada: "2026-09-08T10:00:01.000Z" }),
      tarea({ id: "otro", creada: "2026-09-08T10:00:02.000Z", proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } }),
    ];
    expect(siguientesAEjecutar(lista, { concurrencia: 2 }).map((t) => t.id)).toEqual(["otro"]);
    expect(siguientesAEjecutar(lista, { concurrencia: 1 })).toEqual([]);
  });

  it("aparcadas y terminadas no se vuelven a coger solas", () => {
    const lista = [
      tarea({ id: "a", estado: "requiere-atencion", motivo: "una escritura sin aprobar" }),
      tarea({ id: "b", estado: "terminada" }),
    ];
    expect(siguientesAEjecutar(lista, { concurrencia: 2 })).toEqual([]);
  });

  it("un tope de cero no arranca nada: es cómo se pausa la cola entera", () => {
    expect(siguientesAEjecutar([tarea()], { concurrencia: 0 })).toEqual([]);
  });
});

describe("conEstado", () => {
  it("aparcar EXIGE motivo: «requiere atención» sin decir por qué no es accionable", () => {
    expect(() => conEstado(tarea({ estado: "en-proceso" }), "requiere-atencion")).toThrow(/motivo/i);
    const aparcada = conEstado(tarea({ estado: "en-proceso" }), "requiere-atencion", "la consola se cerró a mitad");
    expect(aparcada).toMatchObject({ estado: "requiere-atencion", motivo: "la consola se cerró a mitad" });
  });

  it("una transición imposible se rechaza: un estado inventado en disco es peor de depurar", () => {
    expect(() => conEstado(tarea({ estado: "terminada" }), "en-proceso")).toThrow(/terminada/);
    expect(() => conEstado(tarea({ estado: "nuevo" }), "terminada")).toThrow();
  });

  it("reintentar y dar por bueno son las dos salidas de «requiere atención»", () => {
    const aparcada = tarea({ estado: "requiere-atencion", motivo: "x" });
    expect(conEstado(aparcada, "nuevo").estado).toBe("nuevo");
    expect(conEstado(aparcada, "terminada").estado).toBe("terminada");
    // Y al reintentar el motivo se va: dejarlo pegado enseñaría un problema ya resuelto.
    expect(conEstado(aparcada, "nuevo").motivo).toBeUndefined();
  });

  it("empezar sella el pid y la hora; acabar sella la hora", () => {
    const empezada = conEstado(tarea(), "en-proceso", undefined, { pid: 42, ahora: "2026-09-08T11:00:00.000Z" });
    expect(empezada).toMatchObject({ estado: "en-proceso", pid: 42, empezada: "2026-09-08T11:00:00.000Z" });
    const acabada = conEstado(empezada, "terminada", undefined, { ahora: "2026-09-08T11:05:00.000Z" });
    expect(acabada.acabada).toBe("2026-09-08T11:05:00.000Z");
    // El pid se va al dejar de correr: un pid pegado a una tarea parada haría creer que vive.
    expect(acabada.pid).toBeUndefined();
  });
});

describe("tituloDeTarea", () => {
  it("es la primera frase de la petición, como el de una sesión", () => {
    expect(tituloDeTarea("Arregla el login. Y de paso el menú.")).toBe("Arregla el login");
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `npx vitest run src/core/tareas.test.ts`
Expected: FAIL — no existe `./tareas.js`

- [ ] **Step 4: Implementar `core/tareas.ts`**

```ts
/**
 * Las TAREAS en background: qué son, qué transiciones valen y cuáles pueden arrancar.
 *
 * `core/`, o sea datos y reglas: ni disco ni procesos. La planificación vive aquí y no en el
 * corredor a propósito — dentro de un lazo con procesos no se puede probar, y es la parte
 * donde una equivocación se paga con dos turnos a la vez sobre el mismo proyecto.
 */
import { tituloDesde } from "./textos.js";

/**
 * Los cuatro estados, y ninguno más.
 *
 * **No hay «fallida»**: un error del turno, un proyecto que ya no está, una escritura que
 * nadie aprobó y una pregunta sin contestar acaban todos en `requiere-atencion`, porque la
 * acción que piden es la misma —que alguien mire— y lo que los distingue es el `motivo`. Un
 * estado «fallida» aparte obligaría a decidir en el código qué fallos son recuperables, y
 * esa es justo la decisión que se le devuelve a la persona.
 *
 * **Tampoco hay «cancelada»**: descartar una tarea la BORRA. Un estado terminal de basura
 * sería un archivo que nadie mira, la misma razón por la que «archivar» no está en el menú
 * de una sesión.
 */
export type EstadoDeTarea = "nuevo" | "en-proceso" | "requiere-atencion" | "terminada";

/** A dónde se puede ir desde cada estado. Lo que no esté aquí se rechaza al escribirlo. */
export const TRANSICIONES: Readonly<Record<EstadoDeTarea, readonly EstadoDeTarea[]>> = {
  nuevo: ["en-proceso"],
  "en-proceso": ["terminada", "requiere-atencion"],
  // Las dos salidas de una tarea aparcada: reintentar, o darla por buena a mano.
  "requiere-atencion": ["nuevo", "terminada"],
  terminada: [],
};

/** Lo que se sabe de un adjunto. Nunca su contenido ni su ruta en la máquina. */
export interface AdjuntoDeTarea {
  nombre: string;
  bytes: number;
  /** Por extensión, o ausente si no se sabe. Nunca se adivina. */
  mime?: string;
}

export interface Tarea {
  id: string;
  /**
   * El proyecto, con las TRES cosas y no dos: el `id` es lo que viaja por el cable y con lo
   * que la interfaz filtra («las tareas de este proyecto»), el `nombre` es para leer, y la
   * `raiz` es ABSOLUTA y solo se usa aquí dentro para abrirlo.
   *
   * Mover o renombrar la carpeta deja la tarea huérfana, y entonces NO se ejecuta — falla
   * cerrado, igual que `seAplicaSinAprobacion`, que también se indexa por ruta absoluta.
   */
  proyecto: { id: string; raiz: string; nombre: string };
  /** La primera frase de la petición. Para leer en el kanban. */
  titulo: string;
  /** Lo que escribió el usuario, tal cual. Se conserva aunque el encargo se edite. */
  peticion: string;
  /** El encargo augmentado y revisado: es lo que se le manda al agente. */
  encargo: string;
  adjuntos: AdjuntoDeTarea[];
  estado: EstadoDeTarea;
  /** Por qué está aparcada. Obligatorio con `requiere-atencion` y solo con él. */
  motivo?: string;
  /** La sesión donde corre, en cuanto existe: es lo que hace que atenderla sea abrirla. */
  sesion?: string;
  creada: string;
  empezada?: string;
  acabada?: string;
  /** El proceso que la tiene. Se usa para reconciliar al arrancar; se va al parar. */
  pid?: number;
}

/** El título de una tarea: la primera frase de su petición, como el de una sesión. */
export const tituloDeTarea = (peticion: string): string => tituloDesde(peticion);

/** Tope de concurrencia por omisión. Dos: una corriendo y otra avanzando sin que la máquina
 *  se quede sin aire para lo que esté haciendo la persona delante. */
export const CONCURRENCIA_POR_OMISION = 2;

/**
 * Qué tareas pueden arrancar AHORA.
 *
 * Tres reglas, y la tercera es la que importa:
 *  - **FIFO por fecha de creación**, global: predecible y explicable. Una prioridad es un
 *    campo más que nadie ha pedido.
 *  - **Tope de concurrencia**, contando las que ya corren.
 *  - **Nunca dos del mismo proyecto**, ni con las que corren ni entre las elegidas en esta
 *    misma pasada: comparten disco, índice de git, checkpointer y `sync`, y dos turnos a la
 *    vez sobre eso es una carrera con escrituras de por medio.
 */
export function siguientesAEjecutar(
  tareas: readonly Tarea[],
  opciones: { concurrencia: number }
): Tarea[] {
  const corriendo = tareas.filter((t) => t.estado === "en-proceso");
  const huecos = opciones.concurrencia - corriendo.length;
  if (huecos <= 0) return [];
  const ocupados = new Set(corriendo.map((t) => t.proyecto.raiz));
  const elegidas: Tarea[] = [];
  const candidatas = tareas
    .filter((t) => t.estado === "nuevo")
    .slice()
    .sort((a, b) => (a.creada < b.creada ? -1 : a.creada > b.creada ? 1 : 0));
  for (const t of candidatas) {
    if (elegidas.length >= huecos) break;
    if (ocupados.has(t.proyecto.raiz)) continue;
    ocupados.add(t.proyecto.raiz);
    elegidas.push(t);
  }
  return elegidas;
}

/**
 * La tarea con otro estado, o una excepción.
 *
 * Lanza en vez de devolver la tarea sin tocar: un estado imposible escrito en disco es más
 * difícil de depurar que un error en el momento de escribirlo. Y `requiere-atencion` EXIGE
 * motivo, porque una tarea aparcada sin decir por qué no es accionable — es la misma razón
 * por la que el aviso de honestidad lleva los nombres de los ficheros y no un contador.
 */
export function conEstado(
  tarea: Tarea,
  estado: EstadoDeTarea,
  motivo?: string,
  sello: { pid?: number; ahora?: string } = {}
): Tarea {
  if (!TRANSICIONES[tarea.estado].includes(estado)) {
    throw new Error(`una tarea «${tarea.estado}» no puede pasar a «${estado}»`);
  }
  if (estado === "requiere-atencion" && (motivo ?? "").trim() === "") {
    throw new Error("aparcar una tarea exige un motivo: sin él no es accionable");
  }
  const ahora = sello.ahora ?? new Date().toISOString();
  const siguiente: Tarea = { ...tarea, estado };
  // El motivo vive SOLO en el estado que lo explica: pegado a una tarea reintentada
  // enseñaría un problema ya resuelto.
  if (estado === "requiere-atencion") siguiente.motivo = motivo;
  else delete siguiente.motivo;
  if (estado === "en-proceso") {
    siguiente.empezada = ahora;
    if (sello.pid !== undefined) siguiente.pid = sello.pid;
  } else {
    // Un pid pegado a una tarea que no corre haría creer que hay un proceso detrás.
    delete siguiente.pid;
  }
  if (estado === "terminada") siguiente.acabada = ahora;
  return siguiente;
}
```

- [ ] **Step 5: Ejecutar hasta verde**

Run: `npx vitest run src/core/tareas.test.ts src/core/imports.test.ts src/web/servidor/sesiones.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/tareas.ts src/core/tareas.test.ts src/core/textos.ts src/web/servidor/sesiones.ts
git commit -m "feat(core): las tareas en background — estados, transiciones y planificación"
```

---

## Task 2: `agent/tareasEnDisco.ts` — la cola, el cerrojo y la carpeta

**Goal:** Persistir la cola en `~/.xonecode/tareas/` con su cerrojo de pid, y la carpeta de cada tarea con sus adjuntos.

**Files:**
- Create: `src/agent/tareasEnDisco.ts`
- Create: `src/agent/tareasEnDisco.test.ts`

**Acceptance Criteria:**
- [ ] El índice se lee y se escribe en `<base>/tareas/indice.json`, y una línea corrupta no tumba la lectura
- [ ] `tomarCerrojo` lo concede si no hay dueño vivo y lo niega si lo hay, diciendo el pid
- [ ] `guardarAdjunto` rechaza un nombre que no sea un segmento llano y respeta los dos topes
- [ ] `borrarTarea` se lleva su carpeta de adjuntos, y **NO toca el índice si no se pudo leer**: `listar()` declara que no sobrescribe, y borrar por detrás lo contradecía — es pérdida de datos
- [ ] Un índice válido pero que NO es un array se trata como ilegible: avisa y no se sobrescribe
- [ ] El cerrojo se toma con creación EXCLUSIVA (`flag: "wx"`), no con comprobar-y-escribir: perder esa carrera son DOS corredores sobre la misma cola
- [ ] Y tras tomarlo se **RELEE para confirmar** que el pid de dentro es el nuestro: cierra el orden «B pisa a A antes de que A relea»
- [ ] Un cerrojo caduco se recoge **APARTÁNDOLO con `renameSync`**, nunca borrándolo: solo un proceso puede renombrar un inodo dado —el otro recibe `ENOENT` y concede—, mientras que borrar y volver a crear lo consiguen los DOS. Es lo que cierra el orden inverso (B pisa a A DESPUÉS de su relectura), que la relectura sola no cubre
- [ ] Índice, cerrojo y adjuntos se escriben con modo **0600**, la misma regla que `checkpoint.sqlite` — el índice lleva el encargo entero del usuario y los adjuntos son sus documentos
- [ ] Ninguna función devuelve una ruta de la máquina en un error

**Verify:** `npx vitest run src/agent/tareasEnDisco.test.ts` → en verde

**Steps:**

- [ ] **Step 1: Escribir el test (falla)**

```ts
// src/agent/tareasEnDisco.test.ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearTareasEnDisco } from "./tareasEnDisco.js";
import type { Tarea } from "../core/tareas.js";

const TAREA: Tarea = {
  id: "t1",
  proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
  titulo: "Arregla el login",
  peticion: "Arregla el login",
  encargo: "Arregla el login",
  adjuntos: [],
  estado: "nuevo",
  creada: "2026-09-08T10:00:00.000Z",
};

describe("tareasEnDisco", () => {
  let base: string;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "xonecode-tareas-"));
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("escribe y lee el índice", () => {
    const disco = crearTareasEnDisco({ base });
    disco.guardar([TAREA]);
    expect(crearTareasEnDisco({ base }).listar()).toEqual([TAREA]);
  });

  it("sin índice todavía, la lista es VACÍA y no un error", () => {
    expect(crearTareasEnDisco({ base }).listar()).toEqual([]);
  });

  it("un índice corrupto no tumba la consola: se dice y se sigue con lista vacía", () => {
    // La misma postura que una línea corrupta del `.jsonl` de una sesión.
    mkdirSync(join(base, "tareas"), { recursive: true });
    writeFileSync(join(base, "tareas", "indice.json"), "{ esto no es json");
    const dichos: string[] = [];
    const disco = crearTareasEnDisco({ base, informar: (t) => dichos.push(t) });
    expect(disco.listar()).toEqual([]);
    expect(dichos.join(" ")).toMatch(/índice/i);
    // Y NO se sobrescribe solo: perder la cola de alguien por leerla mal sería peor.
    expect(readFileSync(join(base, "tareas", "indice.json"), "utf8")).toContain("esto no es json");
  });

  it("el cerrojo se concede una vez, y el segundo sabe de quién es", () => {
    const primero = crearTareasEnDisco({ base, pid: 100, vivo: () => true });
    expect(primero.tomarCerrojo()).toEqual({ tomado: true });
    const segundo = crearTareasEnDisco({ base, pid: 200, vivo: () => true });
    expect(segundo.tomarCerrojo()).toEqual({ tomado: false, dePid: 100 });
  });

  it("un cerrojo de un proceso MUERTO se recoge: si no, un cuelgue deja la cola parada para siempre", () => {
    crearTareasEnDisco({ base, pid: 100, vivo: () => true }).tomarCerrojo();
    const otro = crearTareasEnDisco({ base, pid: 200, vivo: (pid) => pid !== 100 });
    expect(otro.tomarCerrojo()).toEqual({ tomado: true });
  });

  it("un adjunto se guarda en la carpeta de SU tarea, y el nombre pasa la misma barrera que un artefacto", () => {
    const disco = crearTareasEnDisco({ base });
    expect(disco.guardarAdjunto("t1", "mockup.png", Buffer.from("x"))).toMatchObject({ ok: true });
    expect(existsSync(join(base, "tareas", "t1", "adjuntos", "mockup.png"))).toBe(true);
    for (const malo of ["../fuera.png", "sub/dentro.png", "", ".", "con espacio.png"]) {
      expect(disco.guardarAdjunto("t1", malo, Buffer.from("x")).ok, malo).toBe(false);
    }
  });

  it("los dos topes: por fichero y por tarea", () => {
    const disco = crearTareasEnDisco({ base, topeDeAdjunto: 10, topePorTarea: 15 });
    expect(disco.guardarAdjunto("t1", "a.bin", Buffer.alloc(11))).toMatchObject({ ok: false, motivo: expect.stringMatching(/grande/) });
    expect(disco.guardarAdjunto("t1", "b.bin", Buffer.alloc(8))).toMatchObject({ ok: true });
    expect(disco.guardarAdjunto("t1", "c.bin", Buffer.alloc(8))).toMatchObject({ ok: false, motivo: expect.stringMatching(/tarea/) });
  });

  it("borrar una tarea se lleva sus adjuntos: un secreto en un fichero que nadie va a ver sigue siendo un secreto", () => {
    const disco = crearTareasEnDisco({ base });
    disco.guardar([TAREA]);
    disco.guardarAdjunto("t1", "doc.pdf", Buffer.from("x"));
    disco.borrarTarea("t1");
    expect(existsSync(join(base, "tareas", "t1"))).toBe(false);
    expect(disco.listar()).toEqual([]);
  });

  it("ningún error lleva una ruta de la máquina", () => {
    const disco = crearTareasEnDisco({ base });
    const r = disco.guardarAdjunto("t1", "../fuera.png", Buffer.from("x"));
    expect(JSON.stringify(r)).not.toContain(base);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/agent/tareasEnDisco.test.ts`
Expected: FAIL — no existe `./tareasEnDisco.js`

- [ ] **Step 3: Implementar**

```ts
/**
 * La cola de tareas en disco: `~/.xonecode/tareas/`.
 *
 * **De la MÁQUINA, no de un proyecto**, y esa es la decisión de este fichero. El kanban es
 * global y no puede depender de tener descargados los dieciocho proyectos del entorno: con
 * la cola dentro de cada uno, listar las tareas obligaría a abrirlos todos. Es el mismo
 * reparto que ya existe entre `settings.json` y el `config.json` de proyecto.
 *
 * Los ADJUNTOS también van aquí y no en el proyecto: una tarea puede crearse para uno que
 * no se ha abierto nunca, y guardar ahí un adjunto sería estrenarle el `.xonecode/` por la
 * puerta de atrás. Fuera del proyecto se gana además gratis lo que importaba — no entran en
 * git y no suben a CloudStudio — sin depender de ninguna exclusión.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Tarea } from "../core/tareas.js";

/** Bytes que se aceptan por adjunto y por tarea. */
export const TOPE_DE_ADJUNTO = 20_000_000;
export const TOPE_DE_ADJUNTOS_POR_TAREA = 50_000_000;

/** Un nombre de adjunto: un segmento llano y nada más. La misma lista BLANCA de forma que
 *  `esRutaDeArtefacto`, y por lo mismo — de ella depende que esto no escriba fuera. */
const SEGMENTO = /^[A-Za-z0-9._-]+$/;
const nombreAceptable = (n: string): boolean => SEGMENTO.test(n) && n !== "." && n !== "..";

export interface ResultadoDeAdjunto {
  ok: boolean;
  /** Una frase, sin ninguna ruta de la máquina. */
  motivo?: string;
}

export interface TareasEnDisco {
  listar(): Tarea[];
  guardar(tareas: readonly Tarea[]): void;
  /** Concede el cerrojo, o dice de quién es. Ver `tomarCerrojo` abajo. */
  tomarCerrojo(): { tomado: true } | { tomado: false; dePid: number };
  soltarCerrojo(): void;
  guardarAdjunto(tarea: string, nombre: string, datos: Buffer): ResultadoDeAdjunto;
  /** La carpeta REAL de los adjuntos de una tarea, para montarla en el backend. Se queda
   *  en el host: es una ruta de la máquina. */
  carpetaDeAdjuntos(tarea: string): string;
  borrarTarea(id: string): void;
}

export function crearTareasEnDisco(opciones: {
  /** La base (`~/.xonecode` por omisión). Entra por parámetro para probar sin tocar el home. */
  base?: string;
  pid?: number;
  /** ¿Vive ese proceso? Por omisión, `process.kill(pid, 0)`. */
  vivo?: (pid: number) => boolean;
  informar?: (texto: string) => void;
  topeDeAdjunto?: number;
  topePorTarea?: number;
}): TareasEnDisco {
  const base = join(opciones.base ?? join(homedir(), ".xonecode"), "tareas");
  const pid = opciones.pid ?? process.pid;
  const vivo = opciones.vivo ?? estaVivo;
  const informar = opciones.informar ?? (() => {});
  const topeDeAdjunto = opciones.topeDeAdjunto ?? TOPE_DE_ADJUNTO;
  const topePorTarea = opciones.topePorTarea ?? TOPE_DE_ADJUNTOS_POR_TAREA;
  const indice = join(base, "indice.json");
  const cerrojo = join(base, "corredor.lock");

  const carpetaDeAdjuntos = (tarea: string): string => join(base, tarea, "adjuntos");

  return {
    listar() {
      if (!existsSync(indice)) return [];
      try {
        const leido = JSON.parse(readFileSync(indice, "utf8")) as unknown;
        return Array.isArray(leido) ? (leido as Tarea[]) : [];
      } catch {
        // No se sobrescribe: perder la cola de alguien por no saber leerla sería peor que
        // no enseñarla. Misma postura que una línea corrupta del `.jsonl` de una sesión.
        informar("el índice de tareas no se pudo leer; la cola se enseña vacía");
        return [];
      }
    },
    guardar(tareas) {
      mkdirSync(base, { recursive: true });
      writeFileSync(indice, `${JSON.stringify(tareas, null, 1)}\n`, "utf8");
    },
    /**
     * **Un solo corredor por máquina.** Dos consolas abiertas serían dos ejecutores sobre la
     * misma cola, y con ellos dos turnos del mismo proyecto a la vez — que es exactamente lo
     * que el cerrojo por proyecto existe para evitar.
     *
     * Un cerrojo de un proceso MUERTO se recoge: si no, un cuelgue o un `kill -9` dejaría la
     * cola parada para siempre y sin forma de arrancarla salvo borrando un fichero a mano.
     */
    tomarCerrojo() {
      mkdirSync(base, { recursive: true });
      if (existsSync(cerrojo)) {
        try {
          const dueño = JSON.parse(readFileSync(cerrojo, "utf8")) as { pid?: unknown };
          if (typeof dueño.pid === "number" && dueño.pid !== pid && vivo(dueño.pid)) {
            return { tomado: false, dePid: dueño.pid };
          }
        } catch {
          // Un cerrojo ilegible se trata como libre: lo escribimos nosotros, así que uno roto
          // es basura, no el reclamo de otro proceso.
        }
      }
      writeFileSync(cerrojo, `${JSON.stringify({ pid, desde: new Date().toISOString() })}\n`, "utf8");
      return { tomado: true };
    },
    soltarCerrojo() {
      try {
        const dueño = JSON.parse(readFileSync(cerrojo, "utf8")) as { pid?: unknown };
        // Solo el propio: soltar el de otro dejaría dos corredores.
        if (dueño.pid === pid) rmSync(cerrojo, { force: true });
      } catch {
        // No había, o estaba roto: nada que soltar.
      }
    },
    guardarAdjunto(tarea, nombre, datos) {
      if (!nombreAceptable(tarea) || !nombreAceptable(nombre)) {
        return { ok: false, motivo: "ese nombre no vale para un adjunto" };
      }
      if (datos.length > topeDeAdjunto) {
        return { ok: false, motivo: `el fichero es demasiado grande (tope ${Math.round(topeDeAdjunto / 1_000_000)} MB)` };
      }
      const carpeta = carpetaDeAdjuntos(tarea);
      mkdirSync(carpeta, { recursive: true });
      const ya = readdirSync(carpeta).reduce((suma, f) => suma + statSync(join(carpeta, f)).size, 0);
      if (ya + datos.length > topePorTarea) {
        return { ok: false, motivo: `esta tarea ya no admite más adjuntos (tope ${Math.round(topePorTarea / 1_000_000)} MB)` };
      }
      writeFileSync(join(carpeta, nombre), datos);
      return { ok: true };
    },
    carpetaDeAdjuntos,
    borrarTarea(id) {
      // La carpeta se borra siempre: eso es seguro. El ÍNDICE solo si se pudo leer — si no,
      // `guardar(listar().filter(...))` escribiría `[]` sobre un fichero que no entendemos,
      // que es exactamente lo que `listar()` promete no hacer. Se avisa y se para.
      if (nombreAceptable(id)) rmSync(join(base, id), { recursive: true, force: true });
      const { tareas, legible } = leer();
      if (!legible) {
        informar("la tarea se borró del disco, pero el índice no se pudo leer y se deja intacto");
        return;
      }
      this.guardar(tareas.filter((t) => t.id !== id));
    },
  };
}

/** `kill(pid, 0)` no manda ninguna señal: solo pregunta si el proceso existe. */
function estaVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Ejecutar hasta verde**

Run: `npx vitest run src/agent/tareasEnDisco.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/tareasEnDisco.ts src/agent/tareasEnDisco.test.ts
git commit -m "feat(agent): la cola de tareas en disco, con cerrojo de pid y adjuntos"
```

---

## Task 3: `abrirParaTarea` — la segunda puerta, sin mover el cable

**Goal:** Abrir una `ConsolaDeProyecto` para una tarea sin registrarla como el proyecto abierto ni mudar el sumidero del cable, y con las MISMAS barreras que la apertura normal.

**USER-ORDERED GATE — NON-SKIPPABLE.** Esta tarea es el punto de riesgo declarado del spec (§5): si esta apertura divergiera de la normal, una tarea correría con menos barreras que una persona. No se cierra «verificado a ojo»: hay que probar que las dos puertas montan las mismas reglas y que el proyecto abierto del cable no se mueve.

**Files:**
- Modify: `src/web/servidor/vestibulo.ts` (interfaz `Vestibulo` y la implementación, junto a `abrirProyecto`)
- Modify: `src/web/servidor/vestibulo.test.ts`

**Acceptance Criteria:**
- [ ] `abrirParaTarea(raiz)` devuelve una `ConsolaDeProyecto` con su `idDeHilo` **y su `ejecutarTurno`**: sin exponerlo, quien la abra no tiene forma de correr un turno — el lazo de `correrConsola` vive dentro y solo consume líneas
- [ ] `vestibulo.proyectoAbierto()` NO cambia al abrir para una tarea
- [ ] Dos aperturas para tareas de proyectos distintos pueden coexistir
- [ ] Una raíz que no existe se rechaza con motivo, sin crear nada
- [ ] El backend de las dos puertas monta las mismas barreras (vistas aplanadas, artefactos, `/skills/`)

**Verify:** `npx vitest run src/web/servidor/vestibulo.test.ts src/agent/proyecto.test.ts` → en verde

**Steps:**

- [ ] **Step 1: Escribir el test (falla)**

```ts
// añadir a src/web/servidor/vestibulo.test.ts
describe("abrirParaTarea — la segunda puerta", () => {
  it("NO mueve el proyecto abierto del cable", async () => {
    // Si el corredor reusara `abrirProyecto`, cada tarea que arrancara le movería la vista
    // al navegador de quien esté trabajando: el cable se muda a la consola que se abre.
    const base = mkdtempSync(join(tmpdir(), "xonecode-tareas-vest-"));
    const vestibulo = vestibuloDePrueba({ baseDeWorkspace: base });
    const raizA = vestibulo.raizDeProyecto("webstudio", "A");
    const raizB = vestibulo.raizDeProyecto("webstudio", "B");
    for (const raiz of [raizA, raizB]) {
      mkdirSync(join(raiz, ".xonecode"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    }

    const abierta = await vestibulo.abrirProyecto({ raiz: raizA });
    expect(vestibulo.proyectoAbierto()).toBe(abierta);

    const deTarea = await vestibulo.abrirParaTarea(raizB);
    expect(deTarea.raiz).toBe(raizB);
    // Lo que importa: el cable sigue donde estaba.
    expect(vestibulo.proyectoAbierto()).toBe(abierta);

    await deTarea.cerrar();
    await vestibulo.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  it("dos tareas de proyectos distintos pueden estar abiertas a la vez", async () => {
    const base = mkdtempSync(join(tmpdir(), "xonecode-tareas-vest2-"));
    const vestibulo = vestibuloDePrueba({ baseDeWorkspace: base });
    const raices = ["A", "B"].map((n) => vestibulo.raizDeProyecto("webstudio", n));
    for (const raiz of raices) {
      mkdirSync(join(raiz, ".xonecode"), { recursive: true });
      writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    }
    const consolas = await Promise.all(raices.map((r) => vestibulo.abrirParaTarea(r)));
    expect(consolas.map((c) => c.raiz)).toEqual(raices);
    // Cada una con su hilo: son sesiones distintas.
    expect(consolas[0]!.idDeHilo).not.toBe(consolas[1]!.idDeHilo);
    for (const c of consolas) await c.cerrar();
    await vestibulo.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  it("una raíz que no es un proyecto se rechaza con motivo, sin crear nada", async () => {
    const vestibulo = vestibuloDePrueba();
    await expect(vestibulo.abrirParaTarea("/no/existe/nada")).rejects.toThrow(/no/i);
    await vestibulo.cerrar();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/web/servidor/vestibulo.test.ts -t "segunda puerta"`
Expected: FAIL — `abrirParaTarea` no existe

- [ ] **Step 3: Extraer el constructor y añadir la segunda puerta**

En `vestibulo.ts`, la función que hoy construye la `ConsolaDeProyecto` dentro de `abrirDeVerdad` se extrae a `construirConsolaDeProyecto(apertura)` **sin tocar nada de la contabilidad del cable** (`adjunto`, `abierto`, `destinoActual`). `abrirProyecto` sigue haciendo lo de siempre —construir Y registrar— y la puerta nueva solo construye:

```ts
  /**
   * Abrir un proyecto para una TAREA: la misma construcción, sin registrarlo como el
   * proyecto abierto ni mudar el sumidero del cable.
   *
   * Existe porque el vestíbulo sirve UN proyecto a la vez (`proyectoAbierto()` devuelve uno)
   * y el cable se muda a la consola que se abre: si el corredor reusara `abrirProyecto`,
   * cada tarea que arrancase le movería la vista al navegador de quien esté trabajando.
   *
   * **Es la MISMA función constructora**, y eso no es una comodidad: si esta puerta
   * divergiera de la otra, una tarea correría con menos barreras que una persona — sin
   * vistas aplanadas retiradas, o sin la guarda de artefactos. De ahí que lo único que
   * cambie sea la contabilidad de quién está enganchado al cable.
   */
  abrirParaTarea: (raiz: string) => enCola(() => construirConsolaDeProyecto({ raiz })),
```

**Y se expone el ejecutor.** `ConsolaDeProyecto` gana un campo:

```ts
  /**
   * Corre UN turno sobre esta consola con la `Consola` que se le pase.
   *
   * Existe para las tareas y por una razón mecánica: el lazo (`correrConsola`) consume
   * LÍNEAS, y una tarea no es una conversación — tiene un encargo y nada más. Sin este
   * campo, quien abra por la segunda puerta no tendría forma de correr nada.
   *
   * Es el MISMO ejecutor que usa el lazo de una sesión de humano; lo que cambia es la
   * `Consola` que se le da (`consolaDeTarea`, que aparca en vez de contestar).
   */
  readonly ejecutarTurno: EjecutorDeTurno;
```

- [ ] **Step 4: Declararlo en la interfaz**

```ts
  /** Ver la implementación: construye sin registrar, para el corredor de tareas. */
  abrirParaTarea(raiz: string): Promise<ConsolaDeProyecto>;
```

- [ ] **Step 5: Añadir el test de que las barreras son las mismas**

```ts
// añadir a src/agent/proyecto.test.ts, en el describe de `backendDeAgente`
it("las dos puertas de apertura montan las MISMAS reglas", async () => {
  // No se comparan los objetos —son instancias distintas— sino el COMPORTAMIENTO que
  // importa: lo que una tarea puede escribir tiene que ser exactamente lo que puede
  // escribir una persona. Si esto se rompe, una tarea corre con menos barreras.
  const { raiz, carpeta, backend } = proyecto();
  const segundo = backendDeAgente({
    raiz,
    ficheros: new Set(["/app.xml", "/Clientes.xne", "/Clientes.xml"]),
    artefactos: { carpeta, alEscribir: () => {} },
  }) as unknown as typeof backend;
  for (const ruta of ["/artifacts/x.html", "/Clientes.xml", "/artefactos/ok.html", "/app.xml"]) {
    const a = (await backend.write(ruta, "<x/>")) as { error?: string };
    const b = (await segundo.write(ruta, "<x/>")) as { error?: string };
    expect(b.error === undefined, ruta).toBe(a.error === undefined);
  }
});
```

- [ ] **Step 6: Ejecutar hasta verde**

Run: `npx vitest run src/web/servidor/vestibulo.test.ts src/agent/proyecto.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/web/servidor/vestibulo.ts src/web/servidor/vestibulo.test.ts src/agent/proyecto.test.ts
git commit -m "feat(web): abrirParaTarea — segunda puerta al mismo constructor, sin mover el cable"
```

---

## Task 4: `consolaDeTarea` — aparcar en vez de contestar

**Goal:** La `Consola` con la que corre una tarea: una aprobación o una pregunta la APARCAN con su motivo, en vez de resolverse solas.

**USER-ORDERED GATE — NON-SKIPPABLE.** Este es el hallazgo que gobierna el diseño (spec §1): hoy una consola sin cliente rechaza toda aprobación en silencio. El test que prueba que aquí se APARCA es el que impide que una tarea autónoma mienta, y no se cierra sin él.

**Files:**
- Create: `src/web/servidor/consolaDeTarea.ts`
- Create: `src/web/servidor/consolaDeTarea.test.ts`

**Acceptance Criteria:**
- [ ] Una aprobación pendiente APARCA con las rutas en el motivo, y devuelve rechazo para que el turno cierre limpio
- [ ] Una pregunta APARCA; nunca devuelve cadena vacía como si fuera una respuesta
- [ ] `eof()` es `true` y no se usa para deducir un rechazo silencioso
- [ ] `escribir` va al transcript de la sesión
- [ ] Se aparca UNA vez por turno: dos pendientes no producen dos motivos encadenados

**Verify:** `npx vitest run src/web/servidor/consolaDeTarea.test.ts` → en verde

**Steps:**

- [ ] **Step 1: Escribir el test (falla)**

```ts
// src/web/servidor/consolaDeTarea.test.ts
import { describe, expect, it, vi } from "vitest";
import { crearConsolaDeTarea } from "./consolaDeTarea.js";
import { CatalogoModelosEnMemoria } from "../../core/ports.js";

const PENDIENTE = { id: "1", origen: "dev", descripcion: "escribir src/app.xne", decisionesPermitidas: ["approve", "reject"] };

function montar() {
  const aparcado: string[] = [];
  const escrito: string[] = [];
  const consola = crearConsolaDeTarea({
    aparcar: (motivo) => aparcado.push(motivo),
    escribir: (texto) => escrito.push(texto),
    catalogoModelos: new CatalogoModelosEnMemoria(),
    guardarModeloGlobal: (_papel, id) => ({ ruta: "/casa/.xonecode/config.json", id }),
  });
  return { consola, aparcado, escrito };
}

describe("crearConsolaDeTarea", () => {
  it("una aprobación APARCA con las rutas, y devuelve rechazo para que el turno cierre", async () => {
    // El hallazgo que gobierna el diseño: hoy una consola sin cliente contesta rechazo en
    // SILENCIO. Aquí el rechazo sigue siendo el valor devuelto —para que el turno no se
    // quede colgado— pero lo que cuenta es que la tarea queda aparcada y con el motivo.
    const { consola, aparcado } = montar();
    const decisiones = await consola.aprobacionesTui!(
      [PENDIENTE],
      new Map([["1", "src/app.xne"]]),
      new Map()
    );
    expect(decisiones.get("1")).toMatchObject({ type: "reject" });
    expect(aparcado).toHaveLength(1);
    expect(aparcado[0]).toMatch(/src\/app\.xne/);
    expect(aparcado[0]).toMatch(/aprobaci/i);
  });

  it("una pregunta APARCA: una cadena vacía sería una respuesta inventada", async () => {
    const { consola, aparcado } = montar();
    const respuesta = await consola.preguntar("¿Sigo?");
    expect(respuesta).toBe("");
    expect(aparcado).toHaveLength(1);
    expect(aparcado[0]).toMatch(/¿Sigo\?/);
  });

  it("se aparca UNA vez por turno: dos pendientes no encadenan dos motivos", async () => {
    const { consola, aparcado } = montar();
    await consola.aprobacionesTui!([PENDIENTE], new Map([["1", "a.xne"]]), new Map());
    await consola.preguntar("¿y ahora?");
    expect(aparcado).toHaveLength(1);
  });

  it("`eof` dice la verdad —no hay humano— y no se usa para aprobar ni rechazar por detrás", () => {
    const { consola } = montar();
    expect(consola.eof!()).toBe(true);
    expect(consola.interactivo).toBe(false);
  });

  it("lo que se escribe va al transcript", async () => {
    const { consola, escrito } = montar();
    consola.escribir("hola\n");
    expect(escrito).toEqual(["hola\n"]);
  });

  it("las líneas se agotan en cuanto se pide una: una tarea es UN turno, no una conversación", async () => {
    const { consola } = montar();
    const leidas: string[] = [];
    for await (const linea of consola.lineas) leidas.push(linea);
    expect(leidas).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/web/servidor/consolaDeTarea.test.ts`
Expected: FAIL — no existe `./consolaDeTarea.js`

- [ ] **Step 3: Implementar**

```ts
/**
 * La `Consola` con la que corre una tarea en background.
 *
 * **Aparca en vez de contestar, y eso es todo el fichero.** Hoy una consola de proyecto sin
 * cliente enganchado rechaza toda aprobación en silencio —`consolaWeb.eof()` es
 * `!transporte.conectado()`— y contesta cadena vacía a cada pregunta. Para una tarea
 * autónoma eso es la peor combinación posible: el turno «acaba» y nadie se enteró de que
 * nada se aplicó. Aquí lo que no puede resolverse sin una persona se APARCA con su motivo,
 * que es lo único que hace que el estado «requiere atención» sea verdad.
 *
 * No se guarda el `interrupt` esperando una decisión: el proceso puede vivir días y morir
 * en medio. Se devuelve rechazo para que el turno cierre limpio, y la aprobación se retoma
 * al abrir la sesión —`saldarAprobacionesHuerfanas` salda las llamadas colgadas diciendo la
 * verdad, el modelo vuelve a proponer la escritura y ahí ya hay una persona delante—.
 */
import type { Consola } from "../../cli/consola.js";
import type { CatalogoModelosPort, Decision, PendienteDeAprobacion, Papel } from "../../core/ports.js";

export function crearConsolaDeTarea(opciones: {
  /** Aparca la tarea con este motivo. Se llama UNA vez por turno. */
  aparcar: (motivo: string) => void;
  escribir: (texto: string) => void;
  catalogoModelos: CatalogoModelosPort;
  guardarModeloGlobal: (papel: Papel, id: string) => { ruta: string; id: string };
}): Consola {
  // Una vez por turno: dos pendientes seguidos encadenarían dos motivos y el segundo taparía
  // al primero, que es el que explica de verdad por qué se paró.
  let yaAparcada = false;
  const aparcar = (motivo: string): void => {
    if (yaAparcada) return;
    yaAparcada = true;
    opciones.aparcar(motivo);
  };

  return {
    // Una tarea es UN turno con un encargo, no una conversación: no hay más líneas que dar.
    lineas: (async function* () {})(),
    escribir: opciones.escribir,
    // `interactivo: false` y `eof: true` dicen la verdad. Lo que NO se hace es dejar que de
    // ahí se deduzca una decisión: quien decide es la persona que atienda la tarea.
    interactivo: false,
    eof: () => true,
    preguntar: async (pregunta: string) => {
      aparcar(`el agente preguntó y no había nadie: «${pregunta}»`);
      return "";
    },
    leerSecreto: async () => {
      aparcar("el agente pidió una credencial, y eso no se contesta sin una persona");
      return "";
    },
    catalogoModelos: opciones.catalogoModelos,
    guardarModeloGlobal: opciones.guardarModeloGlobal,
    aprobacionesTui: async (
      pendientes: PendienteDeAprobacion[],
      ficheros: Map<string, string>
    ): Promise<Map<string, Decision>> => {
      const rutas = pendientes.map((p) => ficheros.get(p.id) ?? p.descripcion);
      aparcar(`${pendientes.length} escritura(s) esperando aprobación: ${rutas.join(", ")}`);
      // Rechazo para que el turno cierre limpio en vez de quedarse colgado. La escritura NO
      // se pierde: al atender la tarea, el modelo la vuelve a proponer con alguien delante.
      const decisiones = new Map<string, Decision>();
      for (const p of pendientes) decisiones.set(p.id, { type: "reject" } as Decision);
      return decisiones;
    },
  };
}
```

- [ ] **Step 4: Ejecutar hasta verde**

Run: `npx vitest run src/web/servidor/consolaDeTarea.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/servidor/consolaDeTarea.ts src/web/servidor/consolaDeTarea.test.ts
git commit -m "feat(web): la consola de una tarea aparca en vez de contestar por nadie"
```

---

## Task 5: `corredorDeTareas` — cerrojo, reconciliación y lazo

> **Lo que cambió en la Task 2 y esta tarea tiene que respetar:** el puerto ganó
> `sigoSiendoDueño(): boolean`, y NO es opcional. La recogida de un cerrojo cuyo dueño
> parece muerto no se puede hacer atómica con primitivas de sistema de ficheros —decidir
> «está muerto» es una observación de un instante—, así que queda un residuo declarado en
> el que dos procesos pueden creerse dueños a la vez. Lo que hace verdad «un solo
> corredor» es que el corredor pregunte `sigoSiendoDueño()` **antes de despachar cada
> tarea**, no solo al arrancar: si dice que no, para el lazo y suelta —sin `soltarCerrojo`,
> que solo borra el propio y aquí el fichero ya es de otro. El comentario de `recoger` en
> `agent/tareasEnDisco.ts` trae el orden exacto.

> **Y cuatro cosas que las Tasks 3 y 4 midieron y dejaron abiertas para aquí:**
> 1. **La sesión de una tarea se PERSISTE** (resuelto: `Tarea.sesion` sería mentira, y sin
> nombrar `refs/xonecode/sesion/<id>` el árbol se lo lleva `git gc` y Revisión diría
> `sin-marca` para siempre — un agente autónomo escribiendo sin diff que revisar). Pero
> `volcar()` lee la piel de SU consola, así que un turno corrido con la `Consola` del
> corredor no vuelca nada: el corredor tiene que usar la piel de la consola de proyecto y
> su propia `Consola` aportar solo líneas y aprobaciones. Hay un test en
> `vestibulo.test.ts` que empieza por «MEDIDO:» y está hecho para ponerse ROJO cuando esto
> se arregle — es la señal, no un fallo.
> 2. **La piel del volcado: el `MEDIDO:` de `vestibulo.test.ts` NO es el semáforo.** La
> Task 4 dejó una opción `piel?` en `crearConsolaDeTarea` que esta tarea tiene que rellenar
> con la piel de la consola de proyecto. Pero ese test solo se pondrá ROJO si el arreglo va
> en el envoltorio de `vestibulo.ts`; si va en el adaptador de aquí, se queda VERDE y el
> agujero parecerá seguir abierto. Así que no te fíes de su color: **vuelve a medir el
> volcado** —un turno de tarea tiene que dejar su `.jsonl` con actos y su
> `refs/xonecode/sesion/<id>` nombrada— y después invierte o borra ese test. Devolver el
> agujero para que siga verde sería lo único inaceptable.

> 3. **Una tarea y una persona sobre el mismo proyecto a la vez no tienen aislamiento de
> ninguna clase**, y el cerrojo de un solo corredor no protege de eso: protege de dos
> corredores. Dos agentes escribiendo el mismo árbol se pisan las ediciones, y además la
> foto por turno de `instantanea.ts` metería las escrituras de la tarea en el diff de la
> persona — atribuyéndoselas. **Resuelto: gana la persona.** Una tarea NO ARRANCA en un
> proyecto cuya consola humana está abierta. La condición es «abierta» y no «hay turno en
> vuelo» porque solo la primera es estable en el instante de despachar: con la segunda, una
> tarea arrancaría y chocaría después, que es el fallo que se quiere evitar. Eso pide un
> parámetro más en `siguientesAEjecutar` (`core/tareas.ts`, función pura — extiéndela con
> los proyectos que no se pueden arrancar y su test), y que el kanban DIGA por qué una tarea
> espera (Task 7): sin eso, una tarea parada por una pestaña abierta se lee como un cuelgue.
> El precio, dicho: una tarea puede esperar a que alguien cierre un proyecto, y eso se ve en
> la pantalla en vez de corromper un diff en silencio. Y al revés —una persona abre un
> proyecto que tiene una tarea en curso— la tarea NO se mata (perdería su turno y quizá la
> persona solo venía a mirar): se le DICE a la persona, arriba en el chat, que hay una tarea
> corriendo y que sus diffs pueden llevar escrituras que no son suyas.

> 4. **El fallo del lazo de una tarea no puede salir por `informar`**, que escribe un acto
> de sistema en la pantalla de un humano. Va al registro de la tarea. La Task 3 lo dejó
> sin gatear a propósito: un lazo que muere en silencio es peor.



**Goal:** El lazo que coge tareas, las corre y escribe sus transiciones, con cerrojo de pid y reconciliación al arrancar.

**Files:**
- Create: `src/web/servidor/corredorDeTareas.ts`
- Create: `src/web/servidor/corredorDeTareas.test.ts`

**Acceptance Criteria:**
- [ ] Al arrancar, una tarea `en-proceso` con pid ajeno pasa a `requiere-atencion` con el motivo
- [ ] Sin cerrojo, el corredor NO ejecuta y lo dice (`corriendoAqui: false`)
- [ ] Una tarea que acaba sin aparcarse pasa a `terminada`; una aparcada, a `requiere-atencion` con su motivo
- [ ] Un proyecto cuya raíz ya no existe aparca la tarea sin ejecutarla
- [ ] Un error del turno aparca con el motivo, y no tumba el corredor
- [ ] Nunca se abren dos tareas del mismo proyecto a la vez
- [ ] **La consola se CIERRA antes de escribir el estado final**, y hay test de ese orden: solo las `en-proceso` ocupan su proyecto, así que si se aparcara con la sesión todavía abierta el planificador dejaría arrancar otra tarea sobre el mismo proyecto — justo lo que el cerrojo por proyecto existe para evitar

**Verify:** `npx vitest run src/web/servidor/corredorDeTareas.test.ts` → en verde

**Steps:**

- [ ] **Step 1: Escribir el test (falla)**

```ts
// src/web/servidor/corredorDeTareas.test.ts
import { describe, expect, it, vi } from "vitest";
import { crearCorredorDeTareas } from "./corredorDeTareas.js";
import type { Tarea } from "../../core/tareas.js";
import type { TareasEnDisco } from "../../agent/tareasEnDisco.js";

function discoDeMentira(inicial: Tarea[], cerrojo: { tomado: true } | { tomado: false; dePid: number } = { tomado: true }) {
  let lista = [...inicial];
  const disco: TareasEnDisco = {
    listar: () => lista.map((t) => ({ ...t })),
    guardar: (t) => void (lista = t.map((x) => ({ ...x }))),
    tomarCerrojo: () => cerrojo,
    soltarCerrojo: () => {},
    guardarAdjunto: () => ({ ok: true }),
    carpetaDeAdjuntos: (id) => `/tmp/${id}/adjuntos`,
    borrarTarea: () => {},
  };
  return { disco, estado: () => lista };
}

const TAREA = (extra: Partial<Tarea> = {}): Tarea => ({
  id: "t1",
  proyecto: { id: "pa", raiz: "/w/A", nombre: "A" },
  titulo: "t",
  peticion: "p",
  encargo: "e",
  adjuntos: [],
  estado: "nuevo",
  creada: "2026-09-08T10:00:00.000Z",
  ...extra,
});

/** Una consola de proyecto de mentira: apunta el encargo y deja controlar el final. */
function proyectoDeMentira() {
  const encargos: string[] = [];
  let acabar: (() => void) | undefined;
  let aparcarConsola: ((motivo: string) => void) | undefined;
  return {
    encargos,
    acabar: () => acabar?.(),
    aparcar: (motivo: string) => aparcarConsola?.(motivo),
    abrir: async (raiz: string) => ({
      raiz,
      idDeHilo: `hilo-${raiz}`,
      correrTarea: async (encargo: string, aparcar: (m: string) => void) => {
        encargos.push(encargo);
        aparcarConsola = aparcar;
        await new Promise<void>((r) => (acabar = r));
      },
      cerrar: async () => {},
    }),
  };
}

describe("crearCorredorDeTareas", () => {
  it("al arrancar, una tarea «en proceso» de otro proceso se APARCA", async () => {
    // Dejarla diciendo «en proceso» sin nadie ejecutándola sería afirmar lo que no se sabe.
    const { disco, estado } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 999 })]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    expect(estado()[0]).toMatchObject({ estado: "requiere-atencion", motivo: expect.stringMatching(/cerró/i) });
    await corredor.parar();
  });

  it("sin cerrojo no ejecuta, y lo dice", async () => {
    const { disco, estado } = discoDeMentira([TAREA()], { tomado: false, dePid: 77 });
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 2 });
    await corredor.arrancar();
    expect(corredor.corriendoAqui()).toBe(false);
    expect(p.encargos).toEqual([]);
    expect(estado()[0]!.estado).toBe("nuevo");
    await corredor.parar();
  });

  it("una tarea que acaba limpia queda TERMINADA, y se le manda el ENCARGO", async () => {
    const { disco, estado } = discoDeMentira([TAREA({ encargo: "El encargo augmentado" })]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    expect(p.encargos).toEqual(["El encargo augmentado"]);
    expect(estado()[0]).toMatchObject({ estado: "en-proceso", pid: 1, sesion: "hilo-/w/A" });
    p.acabar();
    await corredor.asentar();
    expect(estado()[0]!.estado).toBe("terminada");
    await corredor.parar();
  });

  it("si la consola aparca, la tarea acaba en «requiere atención» con SU motivo", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    p.aparcar("2 escritura(s) esperando aprobación: src/app.xne");
    p.acabar();
    await corredor.asentar();
    expect(estado()[0]).toMatchObject({
      estado: "requiere-atencion",
      motivo: "2 escritura(s) esperando aprobación: src/app.xne",
    });
    await corredor.parar();
  });

  it("la consola se CIERRA antes de escribir el estado final", async () => {
    // Solo las `en-proceso` ocupan su proyecto, así que aparcar con la sesión abierta
    // dejaría arrancar otra tarea sobre el mismo — dos turnos sobre el mismo disco.
    const orden: string[] = [];
    const { disco } = discoDeMentira([TAREA()]);
    const original = disco.guardar.bind(disco);
    disco.guardar = (t) => {
      orden.push("guardar");
      original(t);
    };
    let acabar: (() => void) | undefined;
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: async (raiz) => ({
        raiz,
        idDeHilo: "h",
        correrTarea: async () => new Promise<void>((r) => (acabar = r)),
        cerrar: async () => void orden.push("cerrar"),
      }),
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await corredor.asentar();
    acabar!();
    await corredor.asentar();
    // El último `guardar` (el estado final) va DESPUÉS del `cerrar`.
    expect(orden.lastIndexOf("cerrar")).toBeLessThan(orden.lastIndexOf("guardar"));
    await corredor.parar();
  });

  it("un proyecto que ya no está se aparca SIN ejecutarlo", async () => {
    // La tarea referencia su proyecto por ruta absoluta: mover la carpeta la deja huérfana,
    // y la dirección de fallo es no ejecutar — nunca ejecutar contra otra carpeta.
    const { disco, estado } = discoDeMentira([TAREA()]);
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: async () => {
        throw new Error("no existe");
      },
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(estado()[0]).toMatchObject({ estado: "requiere-atencion", motivo: expect.stringMatching(/no se pudo abrir/i) });
    await corredor.parar();
  });

  it("nunca dos del mismo proyecto, aunque haya hueco de concurrencia", async () => {
    const { disco } = discoDeMentira([
      TAREA({ id: "a", creada: "2026-09-08T10:00:01.000Z" }),
      TAREA({ id: "b", creada: "2026-09-08T10:00:02.000Z" }),
    ]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 5 });
    await corredor.arrancar();
    await corredor.asentar();
    expect(p.encargos).toHaveLength(1);
    await corredor.parar();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/web/servidor/corredorDeTareas.test.ts`
Expected: FAIL — no existe `./corredorDeTareas.js`

- [ ] **Step 3: Implementar**

```ts
/**
 * El corredor: coge tareas de la cola, las corre y escribe sus transiciones.
 *
 * **Un solo corredor por máquina**, con cerrojo de pid: dos consolas abiertas serían dos
 * ejecutores sobre la misma cola, y con ellos dos turnos del mismo proyecto a la vez. El
 * segundo proceso sirve el dashboard y NO ejecuta, y lo dice (`corriendoAqui()`): un kanban
 * que se ve igual en dos ventanas pero solo avanza en una tiene que decir en cuál.
 *
 * La política de QUÉ arranca no está aquí: es `core/tareas.ts#siguientesAEjecutar`, pura y
 * con sus tests. Aquí está el lazo, que es lo que no se puede probar sin dobles.
 */
import { conEstado, siguientesAEjecutar, type Tarea } from "../../core/tareas.js";
import type { TareasEnDisco } from "../../agent/tareasEnDisco.js";

/** Lo que el corredor necesita de una consola de proyecto abierta para una tarea. */
export interface ConsolaParaTarea {
  raiz: string;
  idDeHilo: string;
  /** Corre el encargo. `aparcar` es lo que la consola de tarea llama al toparse con algo
   *  que necesita a una persona. */
  correrTarea(encargo: string, aparcar: (motivo: string) => void): Promise<void>;
  cerrar(): Promise<void>;
}

export interface Corredor {
  arrancar(): Promise<void>;
  /** Deja correr lo que esté en vuelo sin lanzar nada nuevo, y suelta el cerrojo. */
  parar(): Promise<void>;
  /** ¿Ejecuta ESTE proceso? Falso si el cerrojo lo tiene otro. */
  corriendoAqui(): boolean;
  /** Vuelve a mirar la cola: se llama al crear una tarea y al terminar una. */
  revisar(): void;
  /** Para los tests: espera a que se asiente lo que el lazo tenga lanzado. */
  asentar(): Promise<void>;
}

export function crearCorredorDeTareas(opciones: {
  disco: TareasEnDisco;
  abrirParaTarea: (raiz: string) => Promise<ConsolaParaTarea>;
  /** Se lee en cada pasada: cambiar el tope en Ajustes tiene que notarse sin reiniciar. */
  concurrencia: () => number;
  pid?: number;
  /** Se llama en cada cambio, para que el cable emite la cola nueva. */
  alCambiar?: (tareas: readonly Tarea[]) => void;
  informar?: (texto: string) => void;
}): Corredor {
  const pid = opciones.pid ?? process.pid;
  const informar = opciones.informar ?? (() => {});
  let miCerrojo = false;
  let parando = false;
  const enVuelo = new Set<Promise<void>>();

  /** Escribe UNA tarea en el índice, releyéndolo: entre medias pudo cambiar por el cable. */
  const escribir = (siguiente: Tarea): void => {
    const lista = opciones.disco.listar().map((t) => (t.id === siguiente.id ? siguiente : t));
    opciones.disco.guardar(lista);
    opciones.alCambiar?.(lista);
  };

  const correr = async (tarea: Tarea): Promise<void> => {
    let consola: ConsolaParaTarea | undefined;
    try {
      consola = await opciones.abrirParaTarea(tarea.proyecto.raiz);
    } catch (error) {
      // El proyecto ya no está donde la tarea dice. Se aparca: la dirección de fallo aquí
      // es no ejecutar, nunca ejecutar contra otra carpeta.
      escribir(conEstado(tarea, "requiere-atencion", `no se pudo abrir el proyecto: ${unaLinea(error)}`));
      return;
    }
    // El id del hilo ES la sesión: es lo que hace que atender la tarea sea abrir su
    // conversación.
    const enMarcha = conEstado({ ...tarea, sesion: consola.idDeHilo }, "en-proceso", undefined, { pid });
    escribir(enMarcha);

    let motivo: string | undefined;
    try {
      await consola.correrTarea(enMarcha.encargo, (m) => void (motivo ??= m));
    } catch (error) {
      motivo ??= `el turno falló: ${unaLinea(error)}`;
    } finally {
      /**
       * **Cerrar ANTES de escribir el estado, y el orden es load-bearing.** Solo las tareas
       * `en-proceso` ocupan su proyecto (`siguientesAEjecutar`), así que si esto se aparcara
       * con la sesión todavía abierta, el planificador dejaría arrancar otra tarea sobre el
       * mismo proyecto — dos turnos a la vez sobre el mismo disco, git y checkpointer, que
       * es exactamente lo que el cerrojo por proyecto existe para evitar. Hay test del orden.
       */
      await consola.cerrar().catch(() => {});
    }
    // Aparcada si algo pidió a una persona; terminada si acabó limpia. «Terminada» significa
    // que el turno acabó, no que el resultado sea correcto: eso lo mira quien la lea.
    escribir(
      motivo === undefined
        ? conEstado(enMarcha, "terminada")
        : conEstado(enMarcha, "requiere-atencion", motivo)
    );
    revisar();
  };

  const revisar = (): void => {
    if (!miCerrojo || parando) return;
    for (const tarea of siguientesAEjecutar(opciones.disco.listar(), { concurrencia: opciones.concurrencia() })) {
      const trabajo = correr(tarea).catch((error) => informar(`el corredor de tareas falló: ${unaLinea(error)}`));
      enVuelo.add(trabajo);
      void trabajo.finally(() => enVuelo.delete(trabajo));
    }
  };

  return {
    async arrancar() {
      const cerrojo = opciones.disco.tomarCerrojo();
      miCerrojo = cerrojo.tomado;
      if (!miCerrojo) {
        informar(`las tareas las ejecuta otro proceso (pid ${cerrojo.dePid}); aquí solo se ven`);
        return;
      }
      /**
       * RECONCILIACIÓN. Toda tarea «en proceso» cuyo pid no sea el nuestro se aparca:
       * la cola sobrevive a parar el proceso, pero el turno en vuelo no. Dejarla diciendo
       * «en proceso» sin nadie ejecutándola sería afirmar lo que no se sabe.
       */
      const lista = opciones.disco.listar();
      const reconciliada = lista.map((t) =>
        t.estado === "en-proceso" && t.pid !== pid
          ? conEstado(t, "requiere-atencion", "la consola se cerró a mitad; reintenta cuando quieras")
          : t
      );
      if (reconciliada.some((t, i) => t !== lista[i])) {
        opciones.disco.guardar(reconciliada);
        opciones.alCambiar?.(reconciliada);
      }
      revisar();
    },
    async parar() {
      parando = true;
      await Promise.allSettled([...enVuelo]);
      if (miCerrojo) opciones.disco.soltarCerrojo();
      miCerrojo = false;
    },
    corriendoAqui: () => miCerrojo,
    revisar,
    async asentar() {
      await new Promise((r) => setTimeout(r, 0));
      await Promise.allSettled([...enVuelo].map((p) => Promise.race([p, new Promise((r) => setTimeout(r, 0))])));
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

/** Una línea, nunca una traza con rutas de la máquina. */
function unaLinea(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : String(error);
  return mensaje.split(/\r?\n/)[0]!.slice(0, 160);
}
```

- [ ] **Step 4: Ejecutar hasta verde**

Run: `npx vitest run src/web/servidor/corredorDeTareas.test.ts`
Expected: PASS

- [ ] **Step 5: El adaptador, en `arranque.ts`**

El corredor pide un `ConsolaParaTarea` y el vestíbulo devuelve una `ConsolaDeProyecto`: la
costura entre los dos vive donde se cablea todo, y es lo que junta las tres piezas de las
Tasks 3, 4 y 5.

```ts
  /**
   * Del `ConsolaDeProyecto` que abre el vestíbulo al `ConsolaParaTarea` que el corredor pide.
   *
   * Aquí se junta todo: la segunda puerta (que no mueve el cable), la consola que APARCA en
   * vez de contestar, y el ejecutor de siempre — el mismo que corre un turno de una persona.
   */
  const abrirParaTarea = async (raiz: string) => {
    const consola = await vestibulo.abrirParaTarea(raiz);
    return {
      raiz: consola.raiz,
      idDeHilo: consola.idDeHilo,
      correrTarea: async (encargo: string, aparcar: (motivo: string) => void) => {
        const deTarea = crearConsolaDeTarea({
          aparcar,
          // Lo que escriba el turno va al transcript de SU sesión, que es lo que hace que
          // atender la tarea sea abrir su conversación.
          escribir: (texto) => consola.consola.escribir(texto),
          catalogoModelos: consola.consola.catalogoModelos,
          guardarModeloGlobal: consola.consola.guardarModeloGlobal,
        });
        await consola.ejecutarTurno(encargo, consola.estadoDeSesion, deTarea);
      },
      cerrar: () => consola.cerrar(),
    };
  };
```

- [ ] **Step 6: Commit**

```bash
git add src/web/servidor/corredorDeTareas.ts src/web/servidor/corredorDeTareas.test.ts src/web/servidor/arranque.ts
git commit -m "feat(web): el corredor de tareas — cerrojo, reconciliación y lazo"
```

---

## Task 6: el cable — mensajes `tareas` y `tarea`

**Goal:** La cola viaja a todos los clientes, y crear / reintentar / descartar / terminar / cambiar el tope llegan por el cable sin que viaje ninguna ruta de la máquina.

**Files:**
- Modify: `src/web/servidor/transporte.ts`
- Modify: `src/web/servidor/arranque.ts`
- Modify: `src/web/servidor/arranque.test.ts`
- Modify: `apps/web/src/tipos.ts`
- Modify: `apps/web/src/store.ts`
- Modify: `apps/web/src/store.test.ts`

**Acceptance Criteria:**
- [ ] `{clase:"tareas"}` va a TODOS los clientes en la ráfaga de bienvenida y en cada cambio
- [ ] Crear una tarea la deja en `nuevo` y hace que el corredor revise
- [ ] `reintentar`, `descartar` y `terminar` mueven o borran la tarea; una transición imposible se ignora y se dice
- [ ] Por el cable no viaja la raíz del proyecto ni ninguna ruta de adjunto
- [ ] El store copia las tareas campo a campo, con su test
- [ ] `tipos.test.ts` en verde (mismos literales en las dos orillas)

**Verify:** `npx vitest run src/web apps/web/src/store.test.ts apps/web/src/tipos.test.ts` → en verde

**Steps:**

- [ ] **Step 1: Los tipos del cable (host)**

En `src/web/servidor/transporte.ts`, servidor → cliente:

```ts
  /**
   * La cola de tareas entera. Va a TODOS los clientes, como la foto de la máquina y por lo
   * mismo: la cola es de la máquina. `corriendoAqui` es falso en el segundo proceso, y es lo
   * que deja decir que este kanban no avanza.
   */
  | { clase: "tareas"; lista: TareaDelCable[]; concurrencia: number; corriendoAqui: boolean }
```

y cliente → servidor:

```ts
  /**
   * Las acciones sobre una tarea. Viaja el ID del proyecto y su nombre, NUNCA su raíz: es
   * una ruta de la máquina, y el cable puede ir por un túnel.
   */
  | { clase: "tarea"; accion: "crear"; proyecto: string; peticion: string; encargo: string }
  | { clase: "tarea"; accion: "augmentar"; proyecto: string; peticion: string }
  | { clase: "tarea"; accion: "reintentar" | "descartar" | "terminar"; id: string }
  | { clase: "tareas"; concurrencia: number }
```

Y el tipo de fila, junto a `FicheroDelProyecto`:

```ts
/**
 * Una tarea tal como viaja. **Sin la raíz del proyecto**: viajan su id y su nombre, que es
 * lo que la interfaz necesita — la ruta se queda en el host, igual que `Herramienta.ruta`.
 */
export interface TareaDelCable {
  id: string;
  proyecto: string;
  proyectoNombre: string;
  titulo: string;
  peticion: string;
  encargo: string;
  adjuntos: { nombre: string; bytes: number; mime?: string }[];
  estado: "nuevo" | "en-proceso" | "requiere-atencion" | "terminada";
  motivo?: string;
  sesion?: string;
  creada: string;
  empezada?: string;
  acabada?: string;
}
```

- [ ] **Step 2: El test del cable (falla)**

```ts
// añadir a src/web/servidor/arranque.test.ts
describe("las tareas en background, por el cable", () => {
  const ultimo = (cliente: ReturnType<typeof clienteDeMentira>) =>
    cliente.recibidos.filter((m) => m.clase === "tareas").at(-1) as Extract<MensajeAlCliente, { clase: "tareas" }>;

  it("la cola va en la ráfaga de bienvenida, y sin la raíz del proyecto", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      tareas: () => ({
        lista: [
          {
            id: "t1",
            proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
            titulo: "Arregla el login",
            peticion: "Arregla el login",
            encargo: "Arregla el login",
            adjuntos: [],
            estado: "nuevo" as const,
            creada: "2026-09-08T10:00:00.000Z",
          },
        ],
        concurrencia: 2,
        corriendoAqui: true,
      }),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    const mensaje = ultimo(cliente);
    expect(mensaje.lista[0]).toMatchObject({ id: "t1", proyectoNombre: "AppDemo", estado: "nuevo" });
    // La ruta de la máquina NO viaja.
    expect(JSON.stringify(mensaje)).not.toContain("/w/AppDemo");
  });

  it("crear una tarea la encola y hace revisar al corredor", async () => {
    const creadas: { proyecto: string; encargo: string }[] = [];
    let revisado = 0;
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      tareas: () => ({ lista: [], concurrencia: 2, corriendoAqui: true }),
      crearTarea: (proyecto, peticion, encargo) => {
        creadas.push({ proyecto, encargo });
        return { id: "t9" };
      },
      revisarTareas: () => void (revisado += 1),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    expect(
      await enviarMensaje(accion, { clase: "tarea", accion: "crear", proyecto: "p1", peticion: "Arregla", encargo: "Arregla bien" })
    ).toBe(204);
    await asentar();
    expect(creadas).toEqual([{ proyecto: "p1", encargo: "Arregla bien" }]);
    expect(revisado).toBe(1);
  });

  it("reintentar, descartar y terminar llegan con el id", async () => {
    const hechas: string[] = [];
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {
      tareas: () => ({ lista: [], concurrencia: 2, corriendoAqui: true }),
      accionDeTarea: (accion, id) => void hechas.push(`${accion}:${id}`),
    });
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
    await asentar();
    for (const a of ["reintentar", "descartar", "terminar"] as const) {
      await enviarMensaje(accion, { clase: "tarea", accion: a, id: "t1" });
    }
    await asentar();
    expect(hechas).toEqual(["reintentar:t1", "descartar:t1", "terminar:t1"]);
  });

  it("sin puerto de tareas no se manda ninguna cola: no se afirma que no haya", async () => {
    const servidor = servidorDeMentira();
    montarRutas(servidor, vestibuloDePrueba(), {});
    const cliente = clienteDeMentira();
    await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
    await asentar();
    expect(cliente.recibidos.some((m) => m.clase === "tareas")).toBe(false);
  });
});
```

- [ ] **Step 3: Implementar en `arranque.ts`**

Opciones nuevas en `OpcionesDeMontaje`:

```ts
  /**
   * La cola de tareas y las acciones sobre ella. Ausentes = esta ejecución no las tiene, y
   * no se manda ningún `tareas`: el kanban se queda diciendo que no ha llegado, en vez de
   * afirmar que no hay tareas.
   */
  tareas?: () => { lista: readonly Tarea[]; concurrencia: number; corriendoAqui: boolean };
  crearTarea?: (proyecto: string, peticion: string, encargo: string) => { id: string };
  accionDeTarea?: (accion: "reintentar" | "descartar" | "terminar", id: string) => void;
  revisarTareas?: () => void;
  guardarConcurrencia?: (concurrencia: number) => void;
  augmentar?: (proyecto: string, peticion: string) => Promise<string>;
```

El traductor a fila del cable, junto a `sinRutas` y por el mismo motivo:

```ts
  /** La tarea, sin su raíz: es una ruta de la máquina y el cable puede ir por un túnel. */
  const filaDeTarea = (t: Tarea): TareaDelCable => ({
    id: t.id,
    // El ID, que es con lo que la interfaz filtra; el nombre va aparte, para leer. La RAÍZ
    // no viaja: es una ruta de la máquina.
    proyecto: t.proyecto.id,
    proyectoNombre: t.proyecto.nombre,
    titulo: t.titulo,
    peticion: t.peticion,
    encargo: t.encargo,
    adjuntos: t.adjuntos,
    estado: t.estado,
    creada: t.creada,
    ...(t.motivo === undefined ? {} : { motivo: t.motivo }),
    ...(t.sesion === undefined ? {} : { sesion: t.sesion }),
    ...(t.empezada === undefined ? {} : { empezada: t.empezada }),
    ...(t.acabada === undefined ? {} : { acabada: t.acabada }),
  });

  const mensajeDeTareas = (): MensajeAlCliente | undefined => {
    const cola = opciones.tareas?.();
    if (cola === undefined) return undefined;
    return {
      clase: "tareas",
      lista: cola.lista.map(filaDeTarea),
      concurrencia: cola.concurrencia,
      corriendoAqui: cola.corriendoAqui,
    };
  };
  const emitirTareas = (): void => {
    const m = mensajeDeTareas();
    if (m !== undefined) emitir(m);
  };
```

En `adjuntar`, tras `cliente(agentes)`:

```ts
      const tareas = mensajeDeTareas();
      if (tareas !== undefined) cliente(tareas);
```

Y el despacho, junto al de `receta`:

```ts
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "tarea") {
      if (mensaje.accion === "crear" && opciones.crearTarea !== undefined) {
        opciones.crearTarea(mensaje.proyecto, mensaje.peticion, mensaje.encargo);
        opciones.revisarTareas?.();
        emitirTareas();
      } else if (mensaje.accion === "augmentar" && opciones.augmentar !== undefined) {
        void opciones.augmentar(mensaje.proyecto, mensaje.peticion)
          .then((encargo) => emitir({ clase: "tarea", accion: "augmentado", encargo }))
          .catch((error) => emitir({ clase: "tarea", accion: "augmentado", error: codigoDe(error) }));
      } else if (mensaje.accion !== "crear" && mensaje.accion !== "augmentar" && opciones.accionDeTarea !== undefined) {
        opciones.accionDeTarea(mensaje.accion, mensaje.id);
        opciones.revisarTareas?.();
        emitirTareas();
      }
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
```

> Nota para quien implemente: el mensaje `{clase:"tarea", accion:"augmentado"}` del servidor al cliente hay que declararlo en las DOS orillas (`transporte.ts` y `apps/web/src/tipos.ts`) o `tipos.test.ts` cae. Lleva `encargo` o `error`, nunca los dos.

- [ ] **Step 4: El store del cliente, campo a campo**

```ts
        case "tareas": {
          // Campo a campo, como todo lo de aquí: esta lista blanca ya se comió `mime`,
          // `recetas` y `ejecutable`, y el síntoma siempre es una interfaz vacía con los
          // tests en verde.
          const m = mensaje as Record<string, unknown>;
          if (!Array.isArray(m["lista"])) return;
          const estados = ["nuevo", "en-proceso", "requiere-atencion", "terminada"] as const;
          mutar({
            tareas: {
              concurrencia: typeof m["concurrencia"] === "number" ? m["concurrencia"] : 2,
              corriendoAqui: m["corriendoAqui"] === true,
              lista: (m["lista"] as unknown[])
                .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
                .map((t) => ({
                  id: String(t["id"] ?? ""),
                  proyecto: String(t["proyecto"] ?? ""),
                  proyectoNombre: String(t["proyectoNombre"] ?? ""),
                  titulo: String(t["titulo"] ?? ""),
                  peticion: String(t["peticion"] ?? ""),
                  encargo: String(t["encargo"] ?? ""),
                  estado: estados.find((e) => e === t["estado"]) ?? "nuevo",
                  creada: String(t["creada"] ?? ""),
                  adjuntos: Array.isArray(t["adjuntos"])
                    ? (t["adjuntos"] as unknown[])
                        .filter((a): a is { nombre: string; bytes: number } => typeof a === "object" && a !== null)
                        .map((a) => ({
                          nombre: String((a as Record<string, unknown>)["nombre"] ?? ""),
                          bytes: Number((a as Record<string, unknown>)["bytes"] ?? 0),
                          ...(typeof (a as Record<string, unknown>)["mime"] === "string"
                            ? { mime: (a as Record<string, unknown>)["mime"] as string }
                            : {}),
                        }))
                    : [],
                  ...(typeof t["motivo"] === "string" ? { motivo: t["motivo"] } : {}),
                  ...(typeof t["sesion"] === "string" ? { sesion: t["sesion"] } : {}),
                  ...(typeof t["empezada"] === "string" ? { empezada: t["empezada"] } : {}),
                  ...(typeof t["acabada"] === "string" ? { acabada: t["acabada"] } : {}),
                }))
                .filter((t) => t.id !== ""),
            },
          });
          return;
        }
```

Con su test:

```ts
// añadir a apps/web/src/store.test.ts
describe("la cola de tareas", () => {
  it("se guarda campo a campo, y un estado inventado cae en «nuevo»", () => {
    const s = crearStoreDelCliente();
    s.aplicar({
      clase: "tareas",
      concurrencia: 3,
      corriendoAqui: false,
      lista: [
        { id: "t1", proyecto: "p1", proyectoNombre: "AppDemo", titulo: "T", peticion: "p", encargo: "e", adjuntos: [{ nombre: "a.png", bytes: 10, mime: "image/png" }], estado: "requiere-atencion", motivo: "una escritura sin aprobar", creada: "2026-09-08T10:00:00.000Z" },
        { id: "", proyecto: "p1", estado: "nuevo" },
      ],
    });
    const cola = s.leer().tareas!;
    expect(cola.concurrencia).toBe(3);
    expect(cola.corriendoAqui).toBe(false);
    // La fila sin id se descarta: no hay nada que hacer con ella y la tarjeta no tendría clave.
    expect(cola.lista).toHaveLength(1);
    expect(cola.lista[0]).toMatchObject({ estado: "requiere-atencion", motivo: "una escritura sin aprobar" });
    expect(cola.lista[0]!.adjuntos).toEqual([{ nombre: "a.png", bytes: 10, mime: "image/png" }]);
  });

  it("NO se tira al caerse el cable: las tareas siguen corriendo en la máquina", () => {
    // Misma regla que la foto de la máquina y que el paso de instalación en marcha.
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: true, lista: [] });
    s.marcarDesconectado();
    expect(s.leer().tareas).toBeDefined();
  });
});
```

- [ ] **Step 5: Ejecutar hasta verde y commit**

Run: `npx vitest run src/web apps/web/src/store.test.ts apps/web/src/tipos.test.ts`
Expected: PASS

```bash
git add src/web/servidor/transporte.ts src/web/servidor/arranque.ts src/web/servidor/arranque.test.ts apps/web/src/tipos.ts apps/web/src/store.ts apps/web/src/store.test.ts
git commit -m "feat(web): el cable de las tareas — la cola a todos los clientes y sus acciones"
```

---

## Task 7: el kanban en el escritorio

> **Cambia con la revisión de §0.** La tarjeta de `requiere-atencion` NO lleva un diff ni un
> botón de aprobar: lleva el motivo y el camino para **añadir feedback** (que es editar la
> tarea, Task 12). Y la columna se rotula «Esperando feedback», que es lo que el usuario pidió
> y lo que el estado significa ahora — el identificador del enum no se toca. Lo que sí tiene
> que decir la tarjeta, porque nadie lo aprobó, es **qué ficheros escribió** la tarea y el
> enlace a su Revisión: sin aprobación previa, la revisión posterior es la única forma de
> mirar.

**Goal:** Las cuatro columnas, con el motivo a la vista en «requiere atención» y con el aviso de cuándo este proceso no ejecuta.

**Files:**
- Create: `apps/web/src/componentes/Kanban.tsx`
- Create: `apps/web/src/componentes/Kanban.module.css`
- Create: `apps/web/src/componentes/Kanban.test.tsx`
- Modify: `apps/web/src/componentes/Escritorio.tsx`
- Modify: `apps/web/src/componentes/Ajustes.tsx` (sección «Tareas»: el tope de concurrencia)
- Modify: `apps/web/src/componentes/Ajustes.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Acceptance Criteria:**
- [ ] Cuatro columnas, una por estado, y cada tarjeta con proyecto, título y tiempo
- [ ] En `requiere-atencion` el MOTIVO se ve en la tarjeta, sin abrir nada
- [ ] Con `corriendoAqui: false` se dice que este kanban no avanza
- [ ] Pulsar una tarea con sesión abre su conversación
- [ ] Sin tareas, se dice; no se pintan cuatro columnas vacías
- [ ] No hay barra de progreso en ninguna tarjeta
- [ ] El tope de concurrencia se cambia en Ajustes, y con 0 se DICE que la cola está pausada

**Verify:** `npx vitest run apps/web/src/componentes/Kanban.test.tsx apps/web/src/componentes/Escritorio.test.tsx` → en verde

**Steps:**

- [ ] **Step 1: El test (falla)**

```tsx
// apps/web/src/componentes/Kanban.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Kanban } from "./Kanban.js";
import type { TareaDelCable } from "../tipos.js";

afterEach(cleanup);

const tarea = (extra: Partial<TareaDelCable> = {}): TareaDelCable => ({
  id: "t1",
  proyecto: "p1",
  proyectoNombre: "AppDemo",
  titulo: "Arregla el login",
  peticion: "Arregla el login",
  encargo: "Arregla el login",
  adjuntos: [],
  estado: "nuevo",
  creada: "2026-09-08T10:00:00.000Z",
  ...extra,
});

describe("Kanban", () => {
  it("cuatro columnas, una por estado", () => {
    render(<Kanban cola={{ lista: [tarea()], concurrencia: 2, corriendoAqui: true }} />);
    for (const c of ["Nuevo", "En proceso", "Requiere atención", "Terminada"]) {
      expect(screen.getByRole("heading", { name: new RegExp(c, "i") })).toBeTruthy();
    }
  });

  it("el MOTIVO se ve en la tarjeta: es lo único accionable de esa columna", () => {
    render(
      <Kanban
        cola={{
          lista: [tarea({ estado: "requiere-atencion", motivo: "2 escrituras esperando aprobación: src/app.xne" })],
          concurrencia: 2,
          corriendoAqui: true,
        }}
      />
    );
    expect(screen.getByText(/src\/app\.xne/)).toBeTruthy();
  });

  it("dice cuándo este kanban NO avanza", () => {
    // Se ve igual en dos ventanas y solo avanza en una: hay que decir en cuál.
    render(<Kanban cola={{ lista: [tarea()], concurrencia: 2, corriendoAqui: false }} />);
    expect(screen.getByText(/otro proceso|no avanza/i)).toBeTruthy();
  });

  it("pulsar una tarea con sesión la abre; sin sesión, no es pulsable", () => {
    const abrir = vi.fn();
    const { unmount } = render(
      <Kanban cola={{ lista: [tarea({ sesion: "s1" })], concurrencia: 2, corriendoAqui: true }} alAbrirSesion={abrir} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Arregla el login/ }));
    expect(abrir).toHaveBeenCalledWith("p1", "s1");
    unmount();
    // Una tarea que aún no ha corrido no tiene sesión: un botón que no lleva a ninguna parte
    // es el botón muerto de siempre.
    render(<Kanban cola={{ lista: [tarea()], concurrencia: 2, corriendoAqui: true }} alAbrirSesion={abrir} />);
    expect(screen.queryByRole("button", { name: /Arregla el login/ })).toBeNull();
  });

  it("sin tareas se DICE, en vez de cuatro columnas vacías", () => {
    render(<Kanban cola={{ lista: [], concurrencia: 2, corriendoAqui: true }} />);
    expect(screen.getByText(/ninguna tarea/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Nuevo/i })).toBeNull();
  });

  it("no hay barra de progreso: un turno no sabe cuánto le queda", () => {
    render(<Kanban cola={{ lista: [tarea({ estado: "en-proceso", empezada: "2026-09-08T10:00:00.000Z" })], concurrencia: 2, corriendoAqui: true }} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
```

- [ ] **Step 2: Implementar `Kanban.tsx`**

```tsx
import type { TareaDelCable } from "../tipos.js";
import estilos from "./Kanban.module.css";

/**
 * El dashboard de tareas: cuatro columnas, una por estado.
 *
 * Vive en el ESCRITORIO y no en una sesión: las tareas son de la aplicación —de la máquina,
 * en realidad— igual que «Tu equipo». Y por eso mismo hay que decir cuándo este proceso NO
 * las ejecuta: se ve igual en dos ventanas y solo avanza en una.
 *
 * **Sin barra de progreso, a propósito.** Un turno no sabe cuánto le queda, y una barra que
 * avanza sola es la mentira con forma de dato que este repo evita en todas partes. Lo que se
 * enseña es desde cuándo corre.
 */
const COLUMNAS: readonly { estado: TareaDelCable["estado"]; etiqueta: string }[] = [
  { estado: "nuevo", etiqueta: "Nuevo" },
  { estado: "en-proceso", etiqueta: "En proceso" },
  { estado: "requiere-atencion", etiqueta: "Requiere atención" },
  { estado: "terminada", etiqueta: "Terminada" },
];

export function Kanban({
  cola,
  alAbrirSesion,
}: {
  cola: { lista: readonly TareaDelCable[]; concurrencia: number; corriendoAqui: boolean };
  /** Abrir la sesión de una tarea: es cómo se atiende una aparcada. */
  alAbrirSesion?: (proyecto: string, sesion: string) => void;
}) {
  if (cola.lista.length === 0) {
    return (
      <section className={estilos.kanban} aria-label="Tareas en background">
        <p className={estilos.vacio}>
          Ninguna tarea todavía. Se crean desde un proyecto, y se ejecutan solas.
        </p>
      </section>
    );
  }
  return (
    <section className={estilos.kanban} aria-label="Tareas en background">
      {!cola.corriendoAqui ? (
        <p className={estilos.aviso} role="note">
          Las tareas las ejecuta otro proceso: aquí se ven, pero este kanban no avanza.
        </p>
      ) : null}
      <div className={estilos.columnas}>
        {COLUMNAS.map((c) => {
          const suyas = cola.lista.filter((t) => t.estado === c.estado);
          return (
            <div key={c.estado} className={estilos.columna}>
              <h3 className={estilos.encabezado}>
                {c.etiqueta} <span className={estilos.cuenta}>{suyas.length}</span>
              </h3>
              {suyas.map((t) => {
                const cuerpo = (
                  <>
                    <span className={estilos.proyecto}>{t.proyectoNombre}</span>
                    <span className={estilos.titulo}>{t.titulo}</span>
                    {/* El motivo, en la tarjeta y sin abrir nada: es lo único accionable
                        de esta columna. */}
                    {t.motivo === undefined ? null : <span className={estilos.motivo}>{t.motivo}</span>}
                    <span className={estilos.cuando}>{cuando(t)}</span>
                  </>
                );
                // Sin sesión no hay nada que abrir —la tarea no ha corrido— y un botón que
                // no lleva a ninguna parte es el botón muerto de siempre.
                return t.sesion !== undefined && alAbrirSesion !== undefined ? (
                  <button
                    key={t.id}
                    type="button"
                    className={estilos.tarjeta}
                    onClick={() => alAbrirSesion(t.proyecto, t.sesion!)}
                  >
                    {cuerpo}
                  </button>
                ) : (
                  <div key={t.id} className={estilos.tarjeta}>
                    {cuerpo}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Lo único que se sabe del tiempo: cuándo empezó o cuándo se creó. Nunca cuánto queda. */
function cuando(t: TareaDelCable): string {
  const cuando = t.empezada ?? t.creada;
  return new Date(cuando).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}
```

La hoja `Kanban.module.css`: cuatro columnas con `display: grid; grid-template-columns: repeat(4, minmax(0, 1fr))`, cada una con su `overflow-y: auto`; tarjeta con `border: 0.5px solid var(--dsw-alias-border-l2)` y fondo `--dsw-alias-bg-layer-1`; el motivo en `--dsw-alias-label-tertiary` a 11px; **ningún color literal** (`Barra.test.tsx` lo vigila). Con `@container (max-width: 720px)` las columnas se apilan.

- [ ] **Step 3: Montarlo en el escritorio y cablear**

En `Escritorio.tsx`, una sección más tras «proyectos elegidos», antes de «Tu equipo»; y en `App.tsx`:

```tsx
              {...(estado.tareas === undefined ? {} : { tareas: estado.tareas })}
              alAbrirSesionDeTarea={(proyecto, sesion) => abrirSesion(proyecto, sesion)}
```

- [ ] **Step 4: El tope de concurrencia, en Ajustes**

Una sección «Tareas» con un solo control, donde ya viven los ajustes de máquina:

```tsx
            <label className={estilos.campo}>
              <span className={estilos.rotulo}>
                Tareas a la vez <span className={estilos.pista}>— las del mismo proyecto van siempre en serie</span>
              </span>
              <input
                type="number"
                min={0}
                max={8}
                className={estilos.selector}
                value={tareas?.concurrencia ?? 2}
                onChange={(e) => alCambiarConcurrencia?.(Math.max(0, Math.min(8, Number(e.target.value))))}
              />
            </label>
            {(tareas?.concurrencia ?? 2) === 0 ? (
              // Cero es una elección válida —es cómo se pausa la cola— pero callarlo dejaría
              // un kanban donde nada avanza y nadie sabe por qué.
              <p className={estilos.pista}>Con 0 la cola queda PAUSADA: nada nuevo arranca.</p>
            ) : null}
```

Con su test: que cambiarlo manda `{clase:"tareas", concurrencia}`, que se acota a 0-8, y que
con 0 aparece la frase de la cola pausada.

- [ ] **Step 5: Ejecutar hasta verde y commit**

Run: `npx vitest run apps/web/src/componentes/Kanban.test.tsx apps/web/src/componentes/Escritorio.test.tsx apps/web/src/componentes/Ajustes.test.tsx`

```bash
git add apps/web/src/componentes/Kanban.tsx apps/web/src/componentes/Kanban.module.css apps/web/src/componentes/Kanban.test.tsx apps/web/src/componentes/Escritorio.tsx apps/web/src/componentes/Ajustes.tsx apps/web/src/componentes/Ajustes.test.tsx apps/web/src/App.tsx
git commit -m "feat(web): el kanban de tareas en el escritorio, y el tope en Ajustes"
```

---

## Task 8: la lista por proyecto

**Goal:** Una pestaña del proyecto con sus tareas y sus estados, que solo existe si ese proyecto tiene alguna.

**Files:**
- Create: `apps/web/src/componentes/TareasDelProyecto.tsx`
- Create: `apps/web/src/componentes/TareasDelProyecto.module.css`
- Create: `apps/web/src/componentes/TareasDelProyecto.test.tsx`
- Modify: `apps/web/src/componentes/Pestanas.tsx`
- Modify: `apps/web/src/componentes/Pestanas.test.tsx`
- Modify: `apps/web/src/componentes/Transcript.tsx`
- Modify: `apps/web/src/App.tsx`

**Acceptance Criteria:**
- [ ] La pestaña «Tareas» solo aparece si el proyecto activo tiene tareas
- [ ] La lista enseña estado, título y el motivo cuando lo hay
- [ ] Reintentar y descartar están en las aparcadas; descartar CONFIRMA antes de borrar
- [ ] El compositor se oculta en esa pestaña
- [ ] Al abrir una sesión sin tareas, la elección de pestaña vuelve al Chat

**Verify:** `npx vitest run apps/web/src/componentes/TareasDelProyecto.test.tsx apps/web/src/componentes/Pestanas.test.tsx apps/web/src/App.test.tsx` → en verde

**Steps:**

- [ ] **Step 1: Extender `Pestanas` (mismo patrón que «Artefactos»)**

```tsx
    ...(hayTareas === true ? [{ id: "tareas" as const, etiqueta: "Tareas" }] : []),
```

con `hayTareas?: boolean` documentado igual que `hayArtefactos`: solo existe si hay dato detrás.

- [ ] **Step 2: El test de la lista (falla)**

```tsx
// apps/web/src/componentes/TareasDelProyecto.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TareasDelProyecto } from "./TareasDelProyecto.js";
import type { TareaDelCable } from "../tipos.js";

afterEach(cleanup);

const tarea = (extra: Partial<TareaDelCable> = {}): TareaDelCable => ({
  id: "t1", proyecto: "p1", proyectoNombre: "AppDemo", titulo: "Arregla el login",
  peticion: "p", encargo: "e", adjuntos: [], estado: "nuevo",
  creada: "2026-09-08T10:00:00.000Z", ...extra,
});

describe("TareasDelProyecto", () => {
  it("enseña el estado y, cuando lo hay, el motivo", () => {
    render(<TareasDelProyecto tareas={[tarea({ estado: "requiere-atencion", motivo: "sin aprobar src/app.xne" })]} />);
    expect(screen.getByText(/requiere atención/i)).toBeTruthy();
    expect(screen.getByText(/sin aprobar src\/app\.xne/)).toBeTruthy();
  });

  it("reintentar está en las aparcadas, y no en las que corren", () => {
    const alReintentar = vi.fn();
    const { unmount } = render(
      <TareasDelProyecto tareas={[tarea({ estado: "requiere-atencion", motivo: "x" })]} alReintentar={alReintentar} />
    );
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(alReintentar).toHaveBeenCalledWith("t1");
    unmount();
    render(<TareasDelProyecto tareas={[tarea({ estado: "en-proceso" })]} alReintentar={alReintentar} />);
    expect(screen.queryByRole("button", { name: /reintentar/i })).toBeNull();
  });

  it("descartar CONFIRMA antes de borrar: es irreversible", () => {
    // La misma regla que borrar una sesión: eliminar al primer clic en una fila es cómo se
    // pierde el trabajo de una tarde.
    const alDescartar = vi.fn();
    render(<TareasDelProyecto tareas={[tarea()]} alDescartar={alDescartar} />);
    fireEvent.click(screen.getByRole("button", { name: /descartar/i }));
    expect(alDescartar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /sí, descartar/i }));
    expect(alDescartar).toHaveBeenCalledWith("t1");
  });
});
```

- [ ] **Step 3: Implementar la lista y la ranura en `Transcript`**

`TareasDelProyecto.tsx` pinta una fila por tarea con: punto de estado (`data-estado`, verde solo en `terminada`, hueco en `nuevo`, acento en `en-proceso`, y el de atención con su forma propia), título, motivo si lo hay, y los botones **solo donde valen** (`reintentar`/`terminar` en `requiere-atencion`, `descartar` en todas menos `en-proceso`). La confirmación de descartar es un segundo botón en la propia fila, no un modal: es una fila, no una ventana.

En `Transcript.tsx`, una ranura más (`tareas?: ReactNode`) y su rama en el `pestana === "tareas"`, igual que `artefactos`.

- [ ] **Step 4: En `App.tsx`, filtrar por proyecto y volver al Chat sin tareas**

```tsx
  /** Las tareas del proyecto activo. El filtro es por nombre porque es lo que viaja. */
  const tareasDelProyecto = (estado.tareas?.lista ?? []).filter(
    (t) => t.proyecto === estado.alta?.proyectoActivo
  );
  useEffect(() => {
    // Mismo caso que Artefactos: la pestaña desaparece y la elección tiene que caerse con
    // ella, o el centro enseña ese panel sin ninguna pestaña marcada.
    if (tareasDelProyecto.length === 0) setPestana((actual) => (actual === "tareas" ? "chat" : actual));
  }, [tareasDelProyecto.length]);
```

- [ ] **Step 5: Ejecutar hasta verde y commit**

Run: `npm test`

```bash
git add apps/web/src/componentes/TareasDelProyecto.tsx apps/web/src/componentes/TareasDelProyecto.module.css apps/web/src/componentes/TareasDelProyecto.test.tsx apps/web/src/componentes/Pestanas.tsx apps/web/src/componentes/Pestanas.test.tsx apps/web/src/componentes/Transcript.tsx apps/web/src/App.tsx
git commit -m "feat(web): la lista de tareas del proyecto, como pestaña"
```

---

## Task 9: crear una tarea — augmentación y adjuntos

> **Cambia con la revisión de §0.** La augmentación describe un trabajo que se hace ENTERO sin
> volver a preguntar —funcionalidad, refactor, arreglo de errores, documentación—, así que no
> puede redactar un encargo que dé por hecho un paso de aprobación humana por medio. Y la
> ventana de crear tiene que decir con palabras que la tarea **va a escribir en el proyecto
> sin pedir permiso**: es el momento en que se concede esa autorización, y es el único sitio
> donde se puede decir antes de que ocurra.

**Goal:** La UX de crear: petición, encargo augmentado **editable antes de encolar**, y adjuntos que el agente ve en `/adjuntos/` de solo lectura.

**Files:**
- Create: `src/agent/aumentador.ts`
- Create: `src/agent/aumentador.test.ts`
- Create: `apps/web/src/componentes/NuevaTarea.tsx`
- Create: `apps/web/src/componentes/NuevaTarea.module.css`
- Create: `apps/web/src/componentes/NuevaTarea.test.tsx`
- Modify: `src/core/ports.ts` (`AumentadorPort` y su doble)
- Modify: `src/agent/proyecto.ts` (`backendConAdjuntos`)
- Modify: `src/agent/proyecto.test.ts`
- Modify: `src/agent/xoneAgent.ts` (`backendDeAgente` acepta la carpeta de adjuntos)
- Modify: `src/web/servidor/arranque.ts` (`POST /adjunto`)
- Modify: `src/web/servidor/arranque.test.ts`
- Modify: `apps/web/src/App.tsx`

**Acceptance Criteria:**
- [ ] `AumentadorPort` tiene su doble y `npm test` no llama a ningún modelo
- [ ] Si el aumentador falla, la tarea se puede encolar con el texto original y se DICE
- [ ] El encargo propuesto se puede editar antes de encolar
- [ ] `POST /adjunto` rechaza un nombre que no sea segmento llano, y respeta los topes
- [ ] `/adjuntos/` está montado y `permisosDe` DENIEGA escribir ahí
- [ ] La UX dice que el agente lee las imágenes pero no las ve

**Verify:** `npm test && npm run typecheck` → en verde

**Steps:**

- [ ] **Step 1: El puerto y su doble en `core/ports.ts`**

```ts
/**
 * Convierte la petición de un humano en un ENCARGO que una tarea autónoma pueda ejecutar.
 *
 * Existe como puerto para que `npm test` siga sin red ni clave, y porque el fallo tiene que
 * ser recuperable: si no hay modelo, la tarea se encola con el texto original y se dice.
 */
export interface AumentadorPort {
  augmentar(peticion: {
    texto: string;
    proyecto: string;
    rama?: string;
    /** Nombres y tipos de los adjuntos, NUNCA su contenido. */
    adjuntos: readonly { nombre: string; mime?: string }[];
    /** La memoria del proyecto, si existe. El árbol entero sería contexto por gastar. */
    memoria?: string;
  }): Promise<string>;
}

export class AumentadorGuionizado implements AumentadorPort {
  readonly [ES_DOBLE] = true;
  constructor(private readonly plantilla = (t: string) => `ENCARGO: ${t}`) {}
  async augmentar(peticion: { texto: string }): Promise<string> {
    return this.plantilla(peticion.texto);
  }
}
```

- [ ] **Step 2: `backendConAdjuntos`, la misma pieza que `/skills/`**

```ts
/**
 * Cuelga `/adjuntos/` de la carpeta de la TAREA, de solo lectura.
 *
 * Misma pieza que `/skills/` y `/artefactos/`: otra raíz del `CompositeBackend`. De solo
 * lectura por lo mismo que las skills —son material de entrada, no ficheros que reescribir—,
 * y `permisosDe` lo deniega además por patrón.
 *
 * La carpeta vive FUERA del proyecto (`~/.xonecode/tareas/<id>/adjuntos/`), y eso trae gratis
 * lo que importaba: no entra en git y no sube a CloudStudio, sin depender de ninguna
 * exclusión.
 */
export function backendConAdjuntos<T extends object>(backend: T, carpeta: string): T {
  return new CompositeBackend(backend as never, {
    // La barra final es obligatoria: `CompositeBackend` la retira antes de delegar, y sin
    // ella reconstruye `//fichero`, fuera de la raíz montada. La misma trampa de `/skills/`.
    "/adjuntos/": new FilesystemBackend({ rootDir: carpeta, virtualMode: true }),
  }) as T;
}
```

Con su test en `proyecto.test.ts`: se lee un adjunto por su ruta virtual, y **escribir en `/adjuntos/` se rechaza**.

En `permisosDe` (`agent/perfiles.ts`), añadir la denegación de `write` sobre `/adjuntos/**` junto a la de `/skills/**`, con su test.

- [ ] **Step 3: La ruta de subida**

```ts
  /**
   * `POST /adjunto?tarea=<id>&nombre=<fichero>` — los bytes de un adjunto.
   *
   * Por HTTP y no por el cable: el SSE lleva JSON y esto son bytes. Con las mismas
   * comprobaciones de `Host`, `Origin` y token que todo lo demás —las hace `servidor.ts`
   * antes de llegar aquí— y con el nombre pasando la MISMA barrera de segmento llano que un
   * artefacto: de ella depende que esto no escriba fuera de la carpeta de la tarea.
   */
  servidor.registrarRuta("POST", RUTA_ADJUNTO, async (peticion, respuesta) => { /* … */ });
```

Con tests: nombre con `..` → 403; sin `tarea` → 400; por encima del tope → 413; el cuerpo se guarda con el nombre dado; y **ninguna respuesta lleva una ruta de la máquina**.

- [ ] **Step 4: `NuevaTarea.tsx`**

Tres partes: el campo de petición; el botón «Preparar el encargo» que manda `{clase:"tarea", accion:"augmentar"}` y rellena un `<textarea>` **editable** con lo que conteste; y los adjuntos con su lista y su peso. Dos frases que el componente DICE, y son parte del contrato:

- «El agente puede LEER estos ficheros; una imagen no la VE todavía.»
- Si el aumentador falló: «No se pudo preparar el encargo (<motivo>). Puedes encolarla con tu texto tal cual.»

Su test cubre: que no se puede encolar con la petición vacía, que el encargo se puede editar, que un fallo del aumentador deja encolar igual, y que la frase de las imágenes está.

- [ ] **Step 5: Cablear el aumentador real**

`src/agent/aumentador.ts` construye el cliente del papel `trabajo` (`Modelos`) y manda UN mensaje con la plantilla; el prompt exige: qué conseguir, criterios de aceptación, qué NO tocar, y para qué sirve cada adjunto. En `arrancarConsolaWeb` se pasa como `augmentar`.

- [ ] **Step 6: Ejecutar todo y commit**

Run: `npm test && npm run typecheck`

```bash
git add -A
git commit -m "feat: crear una tarea — encargo augmentado y editable, y adjuntos en /adjuntos/"
```

---

## Verificación final

Antes de dar el trabajo por hecho:

1. `npm test` y `npm run typecheck` en verde.
2. `npm run build:web` sin errores.
3. **En el navegador, y esto no es opcional** (es el patrón que ya ha destapado tres fallos que los tests en verde no veían):
   - Crear una tarea con un adjunto y ver el encargo propuesto, editarlo y encolarla.
   - Verla pasar por el kanban: `nuevo` → `en proceso` → y aparcarse en `requiere atención` al primer intento de escritura, con el motivo a la vista.
   - Abrir su sesión desde la tarjeta y comprobar que el transcript está.
   - Con dos consolas abiertas, comprobar que la segunda dice que no ejecuta.
   - Parar el proceso a mitad de una tarea y comprobar que al arrancar aparece aparcada con «la consola se cerró a mitad».
4. Actualizar `CLAUDE.md` con las reglas nuevas y el porqué de cada una.

---

## Task 10: una tarea APLICA lo que escribe, y lo dice

**Goal:** Que el turno de una tarea aplique sus escrituras sin aprobación humana, por una política propia y no reutilizando la del proyecto, y que cada tarea diga qué ficheros escribió.

**Files:**
- Modify: `src/core/tareas.ts` (el registro de lo aplicado en la `Tarea`)
- Modify: `src/web/servidor/consolaDeTarea.ts` (la política, donde hoy se rechaza)
- Modify: `src/web/servidor/consolaDeTarea.test.ts`
- Modify: `src/web/servidor/corredorDeTareas.ts` (recoger lo aplicado y guardarlo)
- Modify: `src/web/servidor/corredorDeTareas.test.ts`

**Acceptance Criteria:**
- [ ] Una escritura de una tarea se APLICA: la decisión que devuelve la consola de tarea es aprobar, no rechazar
- [ ] La política es PROPIA y no `seAplicaSinAprobacion`: un proyecto sin ese ajuste, conectado y con `settings.json` intacto, igualmente aplica cuando quien escribe es una tarea — y hay test de que ese ajuste no se consulta
- [ ] Las guardas de RUTA siguen enteras: una escritura a `/artifacts/`, a una vista aplanada, a `/.env`, `/.git` o `/.xonecode` se rechaza igual que antes (test por cada una)
- [ ] `Tarea` guarda los ficheros que aplicó (rutas RELATIVAS a la raíz, nunca absolutas) y el corredor los escribe al terminar
- [ ] `preguntar` y `leerSecreto` NO cambian: siguen aparcando y cortando — aplicar una escritura no es contestar por una persona
- [ ] Con la política de tarea puesta, ninguna ruta absoluta llega ni al índice ni al cable

**Verify:** `npx vitest run src/web/servidor/consolaDeTarea.test.ts src/web/servidor/corredorDeTareas.test.ts src/core/tareas.test.ts` → en verde

**Steps:**

- [ ] **Step 1: el test que falla — la escritura se aplica**

En `consolaDeTarea.test.ts`, junto al test que hoy exige rechazo. El de hoy describe el
comportamiento viejo y **se reescribe**, no se borra: lo que sigue siendo verdad es que
`preguntar` corta, y eso se queda.

```ts
it("una escritura de una tarea se APLICA: la autorización fue crear la tarea", async () => {
  // La aprobación no estaba por la propiedad del repo, estaba porque XOne ignora en silencio
  // lo desconocido. Quien ocupa ese sitio ahora es el verificador del turno y el juez de QA
  // (Task 11), no un modal que nadie va a ver. Y esto NO es `seAplicaSinAprobacion`: ese
  // ajuste dice «el humano que está aquí ha decidido no pulsar», y aquí no hay nadie aquí.
  const { consola, aparcado } = montar();
  const decisiones = await consola.aprobaciones!([PENDIENTE], new Map(), new Map());
  expect(decisiones).toEqual([{ id: "1", decision: { type: "approve" } }]);
  expect(aparcado).toEqual([]);
});
```

- [ ] **Step 2: el test que falla — el ajuste del proyecto no se consulta**

```ts
it("no se consulta `seAplicaSinAprobacion`: es otra decisión, de otro humano y con otro alcance", () => {
  // Reutilizarlo habría hecho que un proyecto CONECTADO no aplicara nada (el ajuste lo
  // rechaza) y que la marca del `settings.json` de un proyecto offline decidiera sobre las
  // tareas de todos. Son dos autorizaciones distintas: esta la concede crear la tarea.
  let consultado = false;
  const consola = crearConsolaDeTarea({ ...base, seAplicaSinAprobacion: () => { consultado = true; return false; } } as never);
  void consola;
  expect(consultado).toBe(false);
});
```

- [ ] **Step 3: el test que falla — las guardas de ruta siguen**

```ts
it.each(["/artifacts/x.html", "/Clientes.xml", "/.env", "/.git/config", "/.xonecode/memoria.md"])(
  "aplicar no abre las guardas de ruta: %s se sigue rechazando",
  async (ruta) => {
    // Estas guardas nunca fueron parte de la aprobación: viven en el backend
    // (`backendDeAgente`) y en `permisosDe`, y una tarea entra por el MISMO backend. El test
    // está aquí para que se note el día que alguien intente conceder la escritura tocando el
    // sitio equivocado.
    const { consola } = montar();
    const decisiones = await consola.aprobaciones!([{ ...PENDIENTE, descripcion: `escribir ${ruta}` }], new Map([["1", ruta]]), new Map());
    expect(decisiones[0]!.decision.type).toBe("approve");
    // Y quien lo corta es el backend, que devuelve `{error}` al modelo: hay test propio en
    // `proyecto.test.ts` y en `perfiles.test.ts`. Aquí solo se fija que la consola no es
    // quien decide sobre la ruta — si lo fuera, habría DOS reglas que pueden divergir.
  }
);
```

- [ ] **Step 4: implementarlo**

En `consolaDeTarea.ts`, donde hoy se construye el rechazo: devolver `approve` por cada
pendiente, apuntar los ficheros por su ruta relativa, y dejar el mensaje de rechazo solo para
lo que ya lo usaba. La constante del rechazo NO se borra: `preguntar` y el corte siguen.

En `core/tareas.ts`, un campo nuevo en `Tarea` para lo aplicado — con la regla de siempre:
ausente («no se sabe») no es lista vacía («no escribió nada»).

En `corredorDeTareas.ts`, recogerlo de la consola al cerrar el turno y guardarlo con el
estado final, por el mismo camino por el que ya se guarda `sesion`.

- [ ] **Step 5: correr, mutar y commitear**

```bash
npx vitest run src/web/servidor src/core/tareas.test.ts
npm run typecheck && npm test
```

Mutaciones obligatorias: devolver `reject`; consultar el ajuste del proyecto; guardar la ruta
absoluta en vez de la relativa; y tratar el campo ausente como lista vacía.

```bash
git commit -m "feat(web): una tarea aplica lo que escribe, y dice qué ficheros tocó"
```

```json:metadata
{"files": ["src/core/tareas.ts", "src/web/servidor/consolaDeTarea.ts", "src/web/servidor/corredorDeTareas.ts"], "acceptanceCriteria": ["la escritura se aplica", "la política es propia y no `seAplicaSinAprobacion`", "las guardas de ruta siguen enteras", "`Tarea` guarda los ficheros aplicados con ruta relativa", "`preguntar` sigue aparcando", "ninguna ruta absoluta al índice ni al cable"], "modelTier": "frontier", "userGate": true, "tags": ["user-gate"]}
```

---

## Task 11: el juez de QA, y qué significa «terminada»

> **Y esto es AHORA parte de esta tarea, medido por la Task 10: la rama lleva un `terminada`
> FALSO conocido.** Con todo aprobándose solo, cada tanda de escrituras gasta ronda de
> aprobación: `pedirAprobacion` se llama 4 veces, la 5ª se corta con `cortadoPorTope = true`,
> **el verificador no corre ni una vez**, `crearEjecutorReal` tira ese retorno y `aparcar`
> nunca se llama. Resultado medido: cuatro ficheros escritos, una escritura abandonada, nada
> verificado, y el kanban diciendo «terminada». Dos mitades, y las dos son de aquí:
> 1. **La señal tiene que llegar.** `EjecutorDeTurno` devuelve `void` y `crearEjecutorReal`
> descarta `cortadoPorTope` (`core/ports.ts`, `cli/main.ts`). Sin abrir ese canal, la
> condición `pendientes: 0` de esta tarea no tiene con qué medirse — no es un parche
> incidental, es parte de por qué esta tarea existe. Un turno cortado por tope NO es
> entregable, y su motivo lo dice.
> 2. **Una tarea lleva su PROPIO tope de rondas, más alto que el de la persona.** El de
> `MAX_APPROVAL_ROUNDS` se dimensionó para alguien pulsando —«te lo he preguntado cinco
> veces, para»—; en una tarea una ronda no es una pregunta, es una tanda. Quitarlo no vale
> (cada pasada es una llamada al modelo y no hay humano que frene el bucle: el mismo
> argumento que el tope propio de los artefactos) y reusar el de la persona tampoco.
>
> Nota de nombres: el campo de la Task 10 se llama `autorizadas` y no `aplicados`, porque
> guarda lo AUTORIZADO — una ruta que las guardas rechazan sale ahí sin tocar el disco. La
> verdad sobre lo que cambió la tiene Revisión, que es un diff de git.

**Goal:** Que una tarea no se declare terminada por haber acabado el turno, sino por pasar unas condiciones que comprueba el código MÁS el veredicto de un juez.

**Files:**
- Create: `src/core/entrega.ts` (las condiciones, puras)
- Create: `src/core/entrega.test.ts`
- Create: `src/agent/juezDeTarea.ts` (el juez, por puerto)
- Create: `src/agent/juezDeTarea.test.ts`
- Modify: `src/core/tareas.ts` (el veredicto en la `Tarea`)
- Modify: `src/web/servidor/corredorDeTareas.ts` + su test

**Acceptance Criteria:**
- [ ] `condicionesDeEntrega` es pura y exige las tres que el código puede comprobar: verificador en VERDE, nada pendiente de aprobar, y árbol de git sin cambios sin registrar de la sesión
- [ ] El veredicto del juez NO basta solo: con el juez en verde y una condición en rojo, la tarea NO se entrega, y el motivo dice cuál falló
- [ ] Al revés también: con las tres condiciones en verde y el juez en rojo, tampoco — y el motivo lleva lo que dijo el juez
- [ ] El juez entra por PUERTO y usa el papel `afilado`; `npm test` no le pregunta a ningún modelo
- [ ] Que el juez no se pueda usar (sin modelo, sin clave) es fallo del ENTORNO: se dice, la tarea queda esperando feedback, y NO se entrega en silencio
- [ ] El veredicto se guarda en la `Tarea` (resumen y hallazgos, nunca contenido de ficheros)

**Verify:** `npx vitest run src/core/entrega.test.ts src/agent/juezDeTarea.test.ts src/web/servidor/corredorDeTareas.test.ts` → en verde

**Steps:**

- [ ] **Step 1: el test que falla — el juez no basta solo**

```ts
// src/core/entrega.test.ts
it("el veredicto del juez NO basta solo: una condición en rojo lo tumba", () => {
  // Es la regla que este repo ya tenía escrita para la subida autónoma, y el motivo es el
  // mismo por el que los avisos de honestidad son código y no prompt: a un modelo se le
  // puede pedir que avise y a veces no avisa. Si el juez pudiera entregar solo, «terminada»
  // valdría lo que valga la buena voluntad de un modelo esa vez.
  expect(condicionesDeEntrega({ verificador: "rojo", pendientes: 0, arbolSucio: false })).toEqual({
    entregable: false,
    motivo: expect.stringContaining("verificador"),
  });
});

it("con las tres en verde, es entregable — y sigue faltando el juez, que decide aparte", () => {
  expect(condicionesDeEntrega({ verificador: "verde", pendientes: 0, arbolSucio: false })).toEqual({ entregable: true });
});

it("nada pendiente de aprobar y árbol limpio son condiciones, no detalles", () => {
  expect(condicionesDeEntrega({ verificador: "verde", pendientes: 2, arbolSucio: false }).entregable).toBe(false);
  expect(condicionesDeEntrega({ verificador: "verde", pendientes: 0, arbolSucio: true }).entregable).toBe(false);
});

it("un verificador que NO CORRIÓ no es verde", () => {
  // La trampa de siempre: «no se sabe» no es «está bien». Un turno que no escribió no corre
  // el simulador, y dar eso por verde entregaría trabajo que nadie midió.
  expect(condicionesDeEntrega({ verificador: "no-corrio", pendientes: 0, arbolSucio: false }).entregable).toBe(false);
});
```

- [ ] **Step 2: el test que falla — el juez por puerto**

```ts
// src/agent/juezDeTarea.test.ts
it("el juez usa el papel `afilado` y entra por puerto: `npm test` no habla con ningún modelo", async () => {
  const pedidos: string[] = [];
  const juez = crearJuezDeTarea({
    invocar: async (papel, prompt) => { pedidos.push(papel); return JSON.stringify({ veredicto: "verde", resumen: "hace lo que pide" }); },
  });
  const v = await juez.juzgar({ encargo: "añade una colección Clientes", aplicados: ["Clientes.xne"] });
  expect(pedidos).toEqual(["afilado"]);
  expect(v).toEqual({ veredicto: "verde", resumen: "hace lo que pide" });
});

it("una respuesta que no se entiende NO es un verde", async () => {
  // Fail-closed por la misma razón que la aprobación: lo que no se entiende no se aprueba.
  const juez = crearJuezDeTarea({ invocar: async () => "no soy json" });
  const v = await juez.juzgar({ encargo: "x", aplicados: [] });
  expect(v.veredicto).toBe("indeterminado");
});
```

- [ ] **Step 3: implementarlo**

`core/entrega.ts` son datos y una función pura — nada de `fs`, nada de modelos. El estado del
verificador tiene TRES valores (`verde`, `rojo`, `no-corrio`) y no un booleano, por la misma
razón que los cuatro estados de una herramienta en `dispositivos.ts`.

`agent/juezDeTarea.ts` recibe un `invocar` por parámetro, pide el papel `afilado`, y su prompt
lleva el encargo y los ficheros aplicados — **nunca el contenido**. Una respuesta que no
parsea es `indeterminado`, que no es verde.

En `corredorDeTareas.ts`: al acabar el turno, medir las condiciones, preguntar al juez solo si
las condiciones pasan (preguntarle antes gasta una llamada del modelo más caro para nada), y
poner `terminada` solo con las dos cosas. Lo que no entrega va a esperando feedback con el
motivo.

- [ ] **Step 4: correr, mutar y commitear**

Mutaciones obligatorias: entregar con el juez en verde y una condición en rojo; entregar con
las condiciones en verde y el juez en rojo; tratar `no-corrio` como verde; y preguntar al juez
antes de medir las condiciones.

```bash
npm run typecheck && npm test
git commit -m "feat: una tarea se entrega por condiciones medidas MÁS el juez, no por acabar"
```

```json:metadata
{"files": ["src/core/entrega.ts", "src/agent/juezDeTarea.ts", "src/core/tareas.ts", "src/web/servidor/corredorDeTareas.ts"], "acceptanceCriteria": ["`condicionesDeEntrega` pura con las tres condiciones", "el juez no basta solo", "las condiciones tampoco bastan solas", "el juez por puerto con el papel `afilado`", "que el juez no se pueda usar es fallo del entorno y no entrega", "el veredicto se guarda sin contenido de ficheros"], "modelTier": "frontier", "userGate": true, "tags": ["user-gate"]}
```

---

## Task 12: esperando feedback — editar la tarea y que siga

> **Desviación de ficheros, dicha con su procedencia.** Esta tarea tuvo que tocar
> `web/servidor/vestibulo.ts`, que NO está en su lista: `abrirParaTarea` no reenviaba
> `tarea.sesion` en ninguna de sus tres capas, así que **todo reintento abría un hilo en
> blanco** y el criterio central de esta tarea era falso en producción aunque su test
> superficial pasara. No es un agujero de la Task 11: **lo vio el implementador de la Task 3**
> —dejó escrito que reusar la sesión pedía `abrirParaTarea(raiz, sesion?)` y que era
> superficie suya— y el controlador dictaminó no extenderlo, con el argumento de que el hilo
> huérfano se olvida y por tanto no hay id que reusar. Ese argumento cubría **la mitad** de
> los casos: vale para una tarea cortada a mitad de turno (sin transcript, `sesion`
> limpiada) y no vale para una tarea aparcada esperando feedback, que sí tiene transcript y
> sí conserva su `sesion`. La lección para el que venga: un ruling que descarta un hallazgo
> tiene que enumerar los casos que cubre, o se descarta también lo que no había mirado.

**Goal:** Que una tarea aparcada por una decisión que necesita al desarrollador se resuelva editando la tarea para añadir el feedback, y que entonces continúe en el mismo hilo.

**Files:**
- Modify: `src/core/tareas.ts` (el feedback en la `Tarea`)
- Modify: `src/agent/tareasEnDisco.ts` (guardarlo)
- Modify: `src/web/servidor/arranque.ts` (la acción del cable) + su test
- Modify: `src/web/servidor/corredorDeTareas.ts` (reanudar con el feedback) + su test
- Modify: `apps/web/src/tipos.ts`, `store.ts`, `store.test.ts`
- Modify: `apps/web/src/componentes/Kanban.tsx` (el campo)

**Acceptance Criteria:**
- [ ] Añadir feedback a una tarea en `requiere-atencion` la devuelve a `nuevo` y hace que el corredor la mire
- [ ] El feedback se guarda con la tarea y llega al agente como mensaje de USUARIO en el mismo hilo — el mismo camino que los hallazgos del verificador, no un encargo nuevo
- [ ] Un feedback vacío se rechaza y se dice: devolvería la tarea al lazo sin nada nuevo que decirle
- [ ] La tarea conserva su `sesion` y su hilo al reanudar, así que la conversación se lee entera
- [ ] Si su hilo ya no se puede reanudar (`sesion` limpiada porque no había nada abrible), se dice y se empieza uno nuevo — no se finge que continúa
- [ ] El historial de feedbacks no se pierde: añadir uno segundo no borra el primero

**Verify:** `npx vitest run src/web src/core/tareas.test.ts apps/web/src/store.test.ts` → en verde

**Steps:**

- [ ] **Step 1: el test que falla — el feedback reanuda**

```ts
it("añadir feedback devuelve la tarea al lazo, en su mismo hilo", async () => {
  // `requiere-atencion` dejó de ser terminal: es una pregunta al desarrollador. Y la
  // respuesta entra como mensaje de USUARIO en el hilo que ya existe, igual que los
  // hallazgos del verificador — un encargo nuevo perdería todo lo que la tarea ya sabe.
  const d = discoDeMentira([TAREA({ estado: "requiere-atencion", motivo: "¿la colección lleva histórico?", sesion: "s1" })]);
  const recibidos: string[] = [];
  const corredor = crearCorredorDeTareas({ disco: d.disco, abrirParaTarea: async (raiz) => ({ raiz, idDeHilo: "s1", correrTarea: async (p) => { recibidos.push(p); }, cerrar: async () => {} }), pid: 1, concurrencia: () => 1 });
  await corredor.arrancar();
  aplicarFeedback(d.disco, "t1", "sí, con histórico");
  corredor.revisar();
  await corredor.asentar();
  expect(recibidos.join(" ")).toContain("sí, con histórico");
  expect(d.estado()[0]!.sesion).toBe("s1");
  await corredor.parar();
});

it("un feedback vacío se rechaza: devolvería la tarea al lazo sin nada nuevo", () => {
  const d = discoDeMentira([TAREA({ estado: "requiere-atencion", motivo: "?" })]);
  expect(aplicarFeedback(d.disco, "t1", "   ")).toEqual({ hecho: false, motivo: expect.any(String) });
  expect(d.estado()[0]!.estado).toBe("requiere-atencion");
});
```

- [ ] **Step 2: implementarlo**

`core/tareas.ts`: `feedback` es una LISTA y no un campo, porque puede haber varias vueltas y
la segunda no puede borrar la primera. Con la regla de siempre: ausente no es vacía.

`arranque.ts`: una acción más del `{clase:"tarea"}` que ya existe, por el mismo camino.

`corredorDeTareas.ts`: al ejecutar una tarea que trae feedback sin consumir, la petición que
se le pasa al turno es el feedback y no el encargo — y se marca consumido, o la vuelta
siguiente lo repetiría.

`Kanban.tsx`: en la tarjeta de esperando feedback, el motivo y un campo para contestar. Sin
modal: es una frase, no una decisión con diff.

- [ ] **Step 3: correr, mutar y commitear**

Mutaciones obligatorias: aceptar el feedback vacío; no marcarlo consumido; pisar el feedback
anterior; perder `sesion` al reanudar; y quitar el campo de la lista blanca del store.

```bash
npm run typecheck && npm test
git commit -m "feat(web): esperando feedback — se edita la tarea y sigue en su hilo"
```

```json:metadata
{"files": ["src/core/tareas.ts", "src/agent/tareasEnDisco.ts", "src/web/servidor/arranque.ts", "src/web/servidor/corredorDeTareas.ts", "apps/web/src/store.ts", "apps/web/src/componentes/Kanban.tsx"], "acceptanceCriteria": ["el feedback devuelve la tarea a `nuevo` y el corredor la mira", "llega como mensaje de usuario en el mismo hilo", "un feedback vacío se rechaza y se dice", "conserva `sesion` y el hilo", "si el hilo no se puede reanudar se dice", "el historial de feedbacks no se pierde"], "modelTier": "standard", "userGate": false}
```

---

## Task 13: las acciones de una tarea, UNA pieza para las dos vistas

**Goal:** Que las acciones de una tarea sean las mismas en el kanban y en la lista del proyecto, con una sola implementación, y que se apaguen cuando no hay cable.

> **De dónde sale.** Lo levantó la Task 8 como dos dudas y son un defecto de coherencia:
> la lista del proyecto ofrece `reintentar`/`terminar` y **no** feedback, y el kanban ofrece
> feedback y **no** `reintentar`/`terminar` — así que **una tarea bloqueada solo se desbloquea
> desde una de las dos pantallas**, y quien esté en la otra no tiene camino. Y **ninguna de las
> dos recibe `conectado`**, al contrario que Ficheros, Revisión y Artefactos, así que sus
> controles siguen vivos sin cable: mandan algo al servidor y no pasa nada, que es el control
> sin dato detrás que este repo no se permite. No se arregla duplicando acciones en dos
> componentes: se arregla con UNA pieza compartida, que es el patrón de `Arbol.tsx` entre
> Ficheros y Revisión y de `cerrarAlPulsarFuera.ts` en cuanto hubo un segundo menú. Duplicar
> es cómo las dos copias divergen otra vez, y esta divergencia es precisamente el defecto.

**Files:**
- Create: `apps/web/src/componentes/AccionesDeTarea.tsx` + su test
- Modify: `apps/web/src/componentes/Kanban.tsx`, `TareasDelProyecto.tsx` y sus tests
- Modify: `apps/web/src/App.tsx` (pasar `conectado` a las dos)

**Acceptance Criteria:**
- [ ] Las cuatro acciones (`reintentar`, `descartar`, `terminar`, feedback) las ofrece la MISMA pieza, y las dos vistas la montan
- [ ] Cada acción se ofrece solo en los estados en que su transición es válida (`TRANSICIONES`), no en todos
- [ ] Sin cable (`conectado: false`) los controles que mandan algo al servidor están deshabilitados, y se dice por qué
- [ ] Un test comprueba que las dos vistas ofrecen el MISMO conjunto para el mismo estado — y falla si una gana una acción que la otra no
- [ ] Ningún color literal; nada que quede fuera del orden del Tab por estar en `display:none`

**Verify:** `npx vitest run apps/web/src` → en verde

**Steps:**

- [ ] **Step 1: el test que falla — las dos vistas ofrecen lo mismo**

```tsx
it("las dos vistas ofrecen las MISMAS acciones para el mismo estado", () => {
  // El defecto que esta tarea arregla: la lista daba reintentar/terminar y el kanban
  // feedback, así que una tarea bloqueada solo se desbloqueaba desde una pantalla. Este
  // test es lo que impide que vuelvan a divergir — y por eso compara los DOS conjuntos en
  // vez de comprobar una lista escrita a mano, que se queda vieja sin avisar.
  const tarea = TAREA({ estado: "requiere-atencion", motivo: "¿lleva histórico?" });
  const enKanban = accionesVisibles(render(<Kanban tareas={[tarea]} conectado {...manejadores} />));
  const enLista = accionesVisibles(render(<TareasDelProyecto tareas={[tarea]} conectado {...manejadores} />));
  expect(enKanban).toEqual(enLista);
  expect(enKanban).toContain("Añadir feedback");
});
```

- [ ] **Step 2: el test que falla — sin cable no se manda nada**

```tsx
it("sin cable los controles se apagan y se DICE por qué", () => {
  // Es la regla de `Barra` y `Escritorio`: se apaga lo que manda algo al servidor. Un botón
  // vivo sin cable se pulsa, no pasa nada, y no hay forma de saber si falló el botón o el
  // servidor.
  const { getByRole, getByText } = render(<Kanban tareas={[TAREA()]} conectado={false} {...manejadores} />);
  expect(getByRole("button", { name: /reintentar/i })).toBeDisabled();
  expect(getByText(/sin conexión/i)).toBeTruthy();
});
```

- [ ] **Step 3: implementar, mutar y commitear**

Mutaciones obligatorias: quitar una acción de una sola vista; ofrecer una acción en un estado
cuya transición no es válida; ignorar `conectado`; y quitar el motivo del apagado.

```bash
npx vitest run apps/web/src && npm run typecheck
git commit -m "feat(web): las acciones de una tarea, una pieza para las dos vistas"
```

```json:metadata
{"files": ["apps/web/src/componentes/AccionesDeTarea.tsx", "apps/web/src/componentes/Kanban.tsx", "apps/web/src/componentes/TareasDelProyecto.tsx", "apps/web/src/App.tsx"], "acceptanceCriteria": ["una sola pieza para las cuatro acciones", "cada acción solo donde su transición es válida", "sin cable se apagan y se dice", "un test compara los dos conjuntos", "sin colores literales ni display:none tabulable"], "modelTier": "standard", "userGate": false}
```

---

## Task 14: `descartar` para el turno antes de borrar

**Goal:** Que descartar una tarea en proceso corte su turno en vez de dejarlo escribiendo en el proyecto sin registro.

> **De dónde sale, y por qué no era un aviso.** Al añadir la confirmación de `descartar` (Task 13)
> se midió qué pasaba de verdad con una tarea `en-proceso`: el turno **seguía corriendo**
> (`atenderAccionDeTarea` no llamaba a `cortar()`), la consola no se cerraba, y la carpeta de
> adjuntos se borraba **en el acto** — la misma que ese turno tenía montada viva como
> `/adjuntos/`. Las tres juntas dejaban un agente escribiendo en el proyecto de alguien sin que
> ninguna pantalla lo mostrara y con sus lecturas fallándole por debajo. El comentario del
> corredor decía «contar con» el descarte por debajo, y **contarlo no es manejarlo**. Un aviso
> honesto ahí es la confesión de un fallo que se puede arreglar, no el remedio.

**Files:** `src/web/servidor/corredorDeTareas.ts` (+`cortar(id)`), `arranque.ts`, `ConfirmarDescarte`, y sus tests.

**Acceptance Criteria:**
- [ ] `descartar` corta el turno en vuelo ANTES de borrar, reusando `entrada.cortar` (el mismo primitivo que `parar()`), no uno nuevo
- [ ] La carpeta de adjuntos se borra DESPUÉS de que la consola suelte el montaje
- [ ] Si el corte no se puede hacer (tope agotado, o la tarea corre en otro proceso) se DECLINA y se informa, en vez de forzar el borrado — borrar sin cortar reintroduce el fallo
- [ ] El párrafo de la advertencia vieja se va: con el turno parado de verdad, la frase corta es cierta en los cuatro estados
- [ ] Cortar a propósito NO se cuenta como «el turno falló»

**Verify:** `npx vitest run --maxWorkers=2 src/web/servidor apps/web/src` → en verde

**Steps:** ver el §Task 14 del informe (`.superpowers/sdd/…/task-13-report.md`): el orden corte→borrado, la carrera del despacho con `EnVuelo.cortarPedido`, el re-despacho inmediato que ese arreglo reabrió (cerrado con `renunciadas`), y el motivo honesto del corte.

```json:metadata
{"files": ["src/web/servidor/corredorDeTareas.ts", "src/web/servidor/arranque.ts", "apps/web/src/componentes/ConfirmarDescarte.tsx"], "acceptanceCriteria": ["corta antes de borrar reusando `entrada.cortar`", "la carpeta se borra tras soltar el montaje", "si no se puede cortar, declina e informa", "fuera el párrafo de la advertencia vieja", "cortar a propósito no es «el turno falló»"], "modelTier": "standard", "userGate": false}
```

---

## Task 15: las tareas se encuentran desde donde estás

**Goal:** Que crear una tarea y ver las del proyecto se puedan hacer sin salir del proyecto abierto, y que la pestaña exista aunque no haya ninguna.

> **De dónde sale: el usuario abrió la consola y no encontró nada de esto.** Medido en su
> sesión real: con `proyectoActivo` puesto el centro pinta el chat, y el kanban y «Nueva tarea»
> viven SOLO en el escritorio, al que se vuelve pulsando la marca «xonecode» —que funciona si lo
> sabes, y no se descubre—. Y la pestaña «Tareas» solo existe si el proyecto ya tiene alguna, o
> sea que **desaparece justo cuando alguien busca dónde se crean**. Los tres son míos, no
> despistes suyos: con un proyecto abierto no hay forma de decir «esto que estoy viendo, hazlo
> en background», que es el momento en que más sentido tiene.
>
> **Y esto matiza una regla del repo, así que se escribe el matiz.** «La pestaña solo existe si
> hay alguno» se estableció para Artefactos, y ahí es correcta: un artefacto es el REGISTRO de
> algo que pasó, y una pestaña vacía de registro es el control sin dato detrás. Una pestaña
> donde se ACTÚA es otra cosa: si desaparece cuando no hay nada, se lleva consigo el único sitio
> donde aprender que se puede hacer algo. El criterio afinado: **una pestaña de registro existe
> si hay registro; una pestaña de acción existe siempre, y su estado vacío dice cómo se empieza.**

**Files:**
- Modify: `apps/web/src/componentes/Pestanas.tsx` + test (la pestaña deja de depender de `hayTareas`)
- Modify: `apps/web/src/componentes/TareasDelProyecto.tsx` + test (estado vacío que dice cómo se crea)
- Modify: `apps/web/src/App.tsx` (el punto de entrada dentro del proyecto abierto)

**Acceptance Criteria:**
- [ ] Con un proyecto abierto se puede crear una tarea PARA ESE proyecto sin volver al escritorio, y la ventana llega con el proyecto ya resuelto
- [ ] La pestaña «Tareas» existe con proyecto abierto aunque la cola esté vacía
- [ ] Su estado vacío DICE cómo se crea una, y no es un hueco
- [ ] Con la cola sin llegar del servidor sigue distinguiéndose de «no hay ninguna» (no se puede afirmar una cola vacía que nadie ha medido)
- [ ] Ningún color literal; nada fuera del orden del Tab por estar en `display:none`

**Verify:** `npx vitest run --maxWorkers=2 apps/web/src` → en verde

**Steps:** TDD en las tres superficies, con el rojo comprobado antes. Mutaciones obligatorias:
volver a condicionar la pestaña a `hayTareas`; quitar el texto del estado vacío; y que el punto
de entrada del proyecto abra la ventana sin proyecto resuelto.

```json:metadata
{"files": ["apps/web/src/componentes/Pestanas.tsx", "apps/web/src/componentes/TareasDelProyecto.tsx", "apps/web/src/App.tsx"], "acceptanceCriteria": ["crear una tarea sin salir del proyecto", "la pestaña existe con la cola vacía", "el estado vacío dice cómo se crea", "ausente sigue distinto de vacío", "sin colores literales ni display:none tabulable"], "modelTier": "standard", "userGate": false}
```

---

## Task 16: ver en vivo lo que hace una tarea

**Goal:** Poder mirar lo que un agente de fondo está haciendo mientras lo hace, sin robarle la vista a nadie y sin inventar un segundo registro.

> **De dónde sale.** Lo pidió el usuario: «el agente que ejecuta la tarea tiene que mostrar qué
> hace, quizás en alguna consola». Medido: los actos de un turno de tarea **sí** se guardan en
> el transcript de su sesión —razonamiento, tools, tarjetas de artefacto— porque
> `consolaParaTarea` le pasa la piel de su propia consola de proyecto; y **no** se filtran al
> chat de nadie, porque cada `crearConsolaWeb` tiene su propio `crearTransporte` y el de una
> tarea no tiene sumideros enganchados (`abrirParaTarea` no mueve el cable a propósito). Lo que
> falta es exactamente el enganche: **mirar en vivo no existe.**
>
> **Tres decisiones de diseño, y la tercera es la que evita duplicar el producto:**
> 1. **Es OPT-IN y no roba la vista.** «Ver lo que hace» se pulsa; nunca se muda el cable solo.
> Es la razón de ser de `abrirParaTarea`, y esta tarea no la puede deshacer: una tarea que
> arranca no puede cambiarle la pantalla a quien esté trabajando.
> 2. **Es de SOLO LECTURA.** No hay compositor: esa consola es de la tarea, y darle a alguien
> una caja de texto ahí prometería una conversación que el turno no va a leer. Lo que sí hay
> es lo que ya existe para intervenir: aparcar con feedback.
> 3. **La vista en vivo y el transcript de después son LO MISMO.** No se inventa un log
> paralelo: se mira el transcript de esa sesión, en vivo mientras corre y guardado cuando
> acaba. Un segundo registro sería otra fuente que puede contradecir a la conversación, y este
> repo ya tiene esa regla escrita para la lista de artefactos («sale de los actos, no del
> disco»).

**Files:** `src/web/servidor/arranque.ts` (enganchar el sumidero al transporte de la tarea y
etiquetar por tarea), `transporte.ts` si hace falta, `apps/web/src/{tipos,store}.ts`, y la vista
en `Kanban.tsx`/`TareasDelProyecto.tsx` + tests de todo.

**Acceptance Criteria:**
- [ ] Con una tarea `en-proceso`, «Ver lo que hace» enseña sus actos EN VIVO (razonamiento, tools, fases) y se cierra sin dejar nada tocado
- [ ] Mirar una tarea **no** cambia el proyecto ni la sesión abiertos, ni mueve el cable de nadie: hay aserto
- [ ] Los actos de una tarea **nunca** aparecen en el chat de una persona — el aserto que hay que conservar
- [ ] Dos personas pueden mirar la misma tarea (el transporte es un `Set`, no una ranura)
- [ ] Al terminar la tarea, la misma vista es su transcript guardado: no hay un segundo registro
- [ ] Dejar de mirar desengancha ESE sumidero y no los demás
- [ ] Ninguna ruta de la máquina viaja en esos actos

**Verify:** `npx vitest run --maxWorkers=2 src/web apps/web/src` → en verde

```json:metadata
{"files": ["src/web/servidor/arranque.ts", "src/web/servidor/transporte.ts", "apps/web/src/store.ts", "apps/web/src/componentes/Kanban.tsx"], "acceptanceCriteria": ["ver en vivo los actos de una tarea en proceso", "mirar no mueve el cable de nadie", "los actos de una tarea nunca salen en el chat de una persona", "dos personas pueden mirar la misma", "la vista en vivo y el transcript son lo mismo", "dejar de mirar desengancha solo ese sumidero", "ninguna ruta de máquina en esos actos"], "modelTier": "frontier", "userGate": false}
```

---

## Task 17: la consola de la tarea vive en SU detalle, no en el escritorio

**Goal:** Que lo que hace una tarea se lea desplegando la tarea, y que el escritorio no cargue con una consola.

> **De dónde sale.** El usuario lo vio funcionando y lo corrigió: «la consola de lo que está
> haciendo se debe mostrar en el detalle de la tarea o desplegando la tarea, pero no en el
> dashboard principal». La Task 16 la puso como una sección hermana DEBAJO del kanban
> (`Escritorio.tsx`), con un argumento que era defendible —«se lee mientras se ve el resto de la
> cola, y un turno tarda minutos»— pero que resuelve el problema equivocado: el escritorio es la
> vista de conjunto de la máquina, y una consola de una sola tarea ahí compite con todo lo demás.
> **Desplegar en la propia fila consigue las dos cosas**: sigue sin ser un modal, sigue leyéndose
> junto a la cola, y deja de ser un bloque del escritorio.

**Files:**
- Modify: `apps/web/src/componentes/MirarTarea.tsx` (+CSS) — pasa a ser el cuerpo de un detalle
- Modify: `Escritorio.tsx` (deja de pintarla como hermana del kanban), `Kanban.tsx` y
  `TareasDelProyecto.tsx` (el despliegue), y sus tests

**Acceptance Criteria:**
- [ ] La consola se lee **desplegando la tarea**, dentro de su fila/tarjeta, y el escritorio no la pinta como bloque suelto
- [ ] Es **la misma pieza** en el kanban y en la lista del proyecto — no dos despliegues que puedan divergir (el precedente es `AccionesDeTarea`, y antes `Arbol.tsx`)
- [ ] Desplegada, sigue diciendo lo que ya decía: que es SU conversación y no un registro aparte, y que es de solo lectura
- [ ] Plegar deja de mirar (desengancha ese sumidero) y no afecta a los demás mirones
- [ ] El detalle sirve para lo que la fila no puede: el motivo entero, lo que autorizó, y el veredicto cuando lo haya
- [ ] El control de despliegue es un botón de verdad (`aria-expanded`), enfocable, y nada se oculta con `display:none` que deba ser tabulable

**Verify:** `npx vitest run --maxWorkers=2 apps/web/src` → en verde

**Steps:** TDD en las tres superficies con el rojo comprobado antes. Mutaciones obligatorias:
volver a pintarla en el escritorio; que plegar no desenganche; que el despliegue sea un `div` sin
`aria-expanded`; y duplicar la pieza en una de las dos vistas.

```json:metadata
{"files": ["apps/web/src/componentes/MirarTarea.tsx", "apps/web/src/componentes/Escritorio.tsx", "apps/web/src/componentes/Kanban.tsx", "apps/web/src/componentes/TareasDelProyecto.tsx"], "acceptanceCriteria": ["se lee desplegando la tarea y no como bloque del escritorio", "la misma pieza en las dos vistas", "sigue diciendo que es su conversación y de solo lectura", "plegar desengancha solo ese mirón", "el detalle lleva motivo, autorizadas y veredicto", "el despliegue es un botón con aria-expanded"], "modelTier": "standard", "userGate": false}
```

---

## Task 18: el juez no atribuye autoría a partir de hallazgos

**Goal:** Que el juez de QA deje de producir rojos falsos leyendo los hallazgos del verificador como si probaran quién escribió qué.

> **Medido en la PRIMERA ejecución real del juez, con el modelo de verdad y un proyecto del
> usuario.** La tarea era «documenta las colecciones en DOCUMENTACION.md». Lo que pasó:
> escribió `DOCUMENTACION.md` (62 KB) y `MEMORIA_PROYECTO.md`, y **el verificador dijo VERDE**
> con dos avisos `△ REF_JS_COLL_MISSING` («un script referencia una colección no encontrada») y
> la nota «y 22 hallazgo(s) más en ficheros que este turno no tocó». El juez dictó **rojo** con
> estos dos hallazgos:
> 1. «Se modificaron ficheros de lógica JavaScript durante el turno según los hallazgos del
> verificador (REF_JS_COLL_MISSING), violando los criterios de aceptación.» **Falso dos veces**:
> un `REF_JS_COLL_MISSING` no dice que nada se haya modificado —dice que un script apunta a una
> colección que no existe, una inconsistencia preexistente— y el verificador ya había dicho que
> el resto no era de este turno.
> 2. «No se puede comprobar la existencia ni el contenido de DOCUMENTACION.md con los datos
> facilitados.» **Falso**: `CasoDeJuez.autorizadas` llegaba con
> `["DOCUMENTACION.md","MEMORIA_PROYECTO.md"]`.
>
> **Por qué importa más que un veredicto suelto:** la puerta de entrega funcionó —la tarea NO
> dice «Terminada», dice «Esperando feedback»—, pero su motivo **acusa al agente de algo que no
> hizo**. Un juez que grita lobo hace que «Esperando feedback» deje de significar nada y que la
> gente lo despache sin leerlo, que es exactamente lo que este repo trata como grave en los
> avisos. Y es la primera vez que el prompt del juez se mide contra un caso real.

**Files:** `src/agent/juezDeTarea.ts` (`promptDelJuez` y lo que se le pasa) + su test.

**Acceptance Criteria:**
- [ ] El prompt dice que **los hallazgos son observaciones sobre el PROYECTO, no atribuciones de autoría**: nada en ellos prueba que el turno escribiera un fichero
- [ ] Los **avisos** llegan marcados como avisos y distinguibles de los **errores** (la huella de reparación del verificador ya usa solo errores por esta razón: «un aviso que va y viene no dice nada»). No se le esconde información: se le etiqueta
- [ ] Con `verificador: "verde"` el prompt dice explícitamente que **no hay nada que reprochar por parte del verificador**
- [ ] El prompt dice qué es `autorizadas`: **las rutas que el turno escribió**, así que «no puedo comprobar si existe X» con X en esa lista es una respuesta inválida
- [ ] Un test con **este caso exacto** —verde, dos avisos `REF_JS_COLL_MISSING`, 22 preexistentes, `autorizadas` con el fichero pedido— comprueba que el prompt contiene lo que hace falta para no concluir autoría
- [ ] Sigue siendo cierto que una respuesta que no se entiende **no es un verde** (`indeterminado`)

**Verify:** `npx vitest run --maxWorkers=2 src/agent/juezDeTarea.test.ts` → en verde

```json:metadata
{"files": ["src/agent/juezDeTarea.ts"], "acceptanceCriteria": ["los hallazgos no son atribuciones de autoría", "los avisos llegan etiquetados y distintos de los errores", "con verificador verde se dice que no hay nada que reprochar", "el prompt dice que `autorizadas` es lo que se escribió", "test con el caso real medido", "una respuesta ininteligible sigue sin ser verde"], "modelTier": "frontier", "userGate": false}
```
