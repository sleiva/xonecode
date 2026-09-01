# TUI estilo XOne — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acercar la TUI Ink de xonecode a la maqueta de referencia (OpenCode): bloques con barra de acento, cierre de turno con modelo y duración, pie a dos extremos, sidebar con logotipo XONE y lo estable anclado abajo, todo con los azules de xone.es.

**Architecture:** Es un restyle de `src/cli/tui/` sobre la TUI ya existente: cambian los componentes que pintan (`transcript.tsx`, `entrada.tsx`, `sidebar.tsx`, `app.tsx`) y la paleta (`temaInk.ts`); el único cambio de estado es que el acto `fin` del store lleva el modelo del turno, que le pone el envoltorio de piel de `correrTui.ts`. Nada fuera de `cli/tui/` cambia salvo nada: el motor (`core/turno.ts`) y la piel stdio no se tocan.

**Tech Stack:** TypeScript, Ink 5.2.1 (bordes por lado, `borderStyle` como objeto, `justifyContent`, `minHeight`, `flexGrow`), React 18, vitest + ink-testing-library.

**Spec:** `docs/superpowers/specs/2026-09-01-tui-estilo-xone-design.md` (delta sobre `docs/superpowers/specs/2026-09-01-tui-ink-design.md`).

## Global Constraints

- **Un acto, una fila.** Ningún bloque del transcript lleva borde arriba/abajo ni padding vertical. `ventanaDe` cuenta actos como filas.
- **Nada inventado.** Ni coste, ni LSP, ni MCP en la sidebar. Porcentaje SOLO con tope (regla de `core/contextos.ts`).
- **Paleta fija:** acento `#47abd6`, prompt `#2ac4ea`, marca `#00396f` (nunca como color de texto), fase `#e0a458`. Los hex se escriben en minúsculas.
- **Frontera:** ink y react solo dentro de `src/cli/tui/` (`frontera.test.ts`); `core/` no se toca. Sin dependencias nuevas (`package.json` no cambia).
- **`npm test` sin TTY, red ni clave**: todo se prueba con `ink-testing-library` o funciones puras.
- **`Piel.fin(ms)` del motor no cambia de firma.** El modelo entra por `crearPielTui(store, modeloActual)`.
- Los comentarios y nombres del código van en castellano, en el estilo del repo (explican el POR QUÉ).
- Cada tarea termina con `npx vitest run src/cli/tui` en verde y `npm run typecheck` limpio antes del commit.
- Mensajes de commit en castellano, imperativo corto, con el pie:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Es8QFaXswVAvxRvqvNXWpM
  ```

**User decisions (already made):**
- El XONE en grande vive en la CABECERA DE LA SIDEBAR (no en pantalla de inicio), oculto bajo 100 columnas de terminal.
- Colores: los azules de xone.es medidos en su CSS (`#00396f`, `#47abd6`, `#2ac4ea`).
- Coste, LSP y MCP quedan fuera (no hay dato real).
- Desviación menor aceptada respecto a la spec: `columnas` NO entra en `DatosDeSidebar` (que compone `correrTui.ts`, sin acceso a stdout); `Sidebar` la recibe como prop aparte desde `App`, que sí conoce `stdout.columns`. `DatosDeSidebar` gana en cambio `ruta` (la raíz completa) para el pie.

---

## Mapa de ficheros

| fichero | responsabilidad tras el plan |
|---|---|
| `src/cli/tui/temaInk.ts` | paleta hex de la TUI: espejo de `tema.ts` + tokens de layout (`acento`, `borde`, `fondoInput`, `marca`, `fase`) |
| `src/cli/tui/logo.ts` (nuevo) | `LOGO_XONE` (letras de bloque) y `cabeLogo(columnas)` |
| `src/cli/tui/barra.ts` (nuevo) | las props de Box para un bloque con SOLO barra izquierda (`▌`), compartidas por transcript, entrada y pregunta |
| `src/cli/tui/store.ts` | acto `fin` con `modelo?` |
| `src/cli/tui/pielTui.ts` | `crearPielTui(store, modeloActual?)` |
| `src/cli/tui/correrTui.ts` | pasa `() => modeloTrabajo` a la piel; `datosSidebar` con `ruta` |
| `src/cli/tui/transcript.tsx` | bloque de usuario, fase ámbar, `■ modelo · Ns`, `minHeight` |
| `src/cli/tui/entrada.tsx` | barra izquierda + línea de modelo |
| `src/cli/tui/sidebar.tsx` | `Sidebar` (logo, Contexto, Modelo, pie anclado) y `BarraDeEstado` + `pie()` |
| `src/cli/tui/app.tsx` | maqueta: `FILAS_FIJAS`, alturas, `columnas`, `PreguntaInk` con barra |

---

### Task 1: Paleta XOne en `temaInk.ts`

**Goal:** Cambiar el acento al azul claro de xone.es, el prompt al cian, y añadir los tokens de layout `marca` y `fase`, declarados en el test espejo.

**Files:**
- Modify: `src/cli/tui/temaInk.ts`
- Test: `src/cli/tui/temaInk.test.ts`

**Acceptance Criteria:**
- [ ] `temaInk.acento === "#47abd6"`, `temaInk.prompt === "#2ac4ea"`, `temaInk.marca === "#00396f"`, `temaInk.fase === "#e0a458"`.
- [ ] El test de espejo inverso acepta `marca` y `fase` (lista `soloTui`) y sigue rechazando cualquier otra clave desconocida.
- [ ] Todos los tokens de color son hex de 6 dígitos en minúsculas.

**Verify:** `npx vitest run src/cli/tui/temaInk.test.ts` → 3 tests PASS.

**Steps:**

- [ ] **Step 1: Reescribir el test con la paleta nueva**

Sustituye el contenido de `src/cli/tui/temaInk.test.ts` por:

```ts
import { describe, it, expect } from "vitest";
import { temaInk } from "./temaInk.js";
import { crearTema } from "../tema.js";

describe("temaInk", () => {
  it("cada token semántico de tema.ts tiene espejo en la TUI", () => {
    for (const clave of Object.keys(crearTema(true))) {
      expect(temaInk, `token «${clave}»`).toHaveProperty(clave);
    }
  });

  it("espejo inverso: temaInk no inventa claves que tema.ts no conoce (salvo las de TUI, declaradas)", () => {
    // La mitad que falta del contrato: si `temaInk` creara una clave propia sin
    // declararla, la TUI estaría hablando en un vocabulario que el tema semántico
    // no comparte — y un token nuevo de tema.ts podría quedarse sin espejo sin
    // que nadie lo vea. Las de TUI son de LAYOUT/pantalla, no de significado:
    // `acento` y `borde` pintan cajas, `fondoInput` es el fondo del cuadro de entrada,
    // `marca` es la barra izquierda de los bloques y `fase` el color de «+ fase: Ns».
    const soloTui = ["acento", "borde", "fondoInput", "marca", "fase"];
    const conocidas = new Set(Object.keys(crearTema(true)));
    for (const clave of Object.keys(temaInk)) {
      expect(conocidas.has(clave) || soloTui.includes(clave), `token «${clave}» de temaInk`).toBe(true);
    }
  });

  it("la paleta es la de xone.es, medida en su CSS: acento, prompt, marca y fase en hex minúsculas", () => {
    // #00396f (navy) y #47abd6 (azul claro) son los dos colores dominantes de xone.es;
    // #2ac4ea es su cian. El navy NUNCA es color de texto: sobre fondo oscuro no se lee,
    // así que solo pinta barras (`marca`).
    for (const clave of ["acento", "prompt", "marca", "fase"] as const) {
      expect(temaInk[clave], clave).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(temaInk.acento).toBe("#47abd6");
    expect(temaInk.prompt).toBe("#2ac4ea");
    expect(temaInk.marca).toBe("#00396f");
    expect(temaInk.fase).toBe("#e0a458");
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/cli/tui/temaInk.test.ts`
Expected: FAIL — «token «marca» de temaInk» no existe / `acento` es `#38bdf8`.

- [ ] **Step 3: Actualizar la paleta**

En `src/cli/tui/temaInk.ts`, sustituye las líneas de `prompt`, `acento` y añade `marca` y `fase` al final del objeto (antes de `} as const;`):

```ts
  /** El `▏` del cursor. El cian de xone.es (#2ac4ea), del mismo tono frío que `acento`. */
  prompt: "#2ac4ea",
  /** No-op: Ink abre y cierra sus spans solos; un reset ANSI dentro de un span lo rompería. */
  reset: "",
  /** No-ops de control: el render de Ink repinta; ni borra líneas ni mueve el cursor. */
  borrar: "",
  limpiarLinea: "",
  arriba: (): string => "",
  /** El azul claro de xone.es: cabeceras de sidebar, viñetas, el ■ del fin, el logotipo. */
  acento: "#47abd6",
  borde: "#27272a",
  fondoInput: "#18181b",
  /**
   * El navy dominante de xone.es. SOLO para barras y bordes: como color de texto sobre
   * un terminal oscuro es casi invisible, y un color de marca que no se lee no es marca.
   */
  marca: "#00396f",
  /**
   * El único tono cálido de la paleta: la línea «+ fase: Ns» se distingue del texto mudo
   * sin competir con el acento azul. No es color XOne; es un token de TUI declarado.
   */
  fase: "#e0a458",
```

Actualiza también el comentario de cabecera: donde dice «Paleta dark-first con los azules de XOne.» añade «(medidos en el CSS de xone.es: navy #00396f, azul #47abd6, cian #2ac4ea)».

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/cli/tui/temaInk.test.ts && npm run typecheck`
Expected: 3 PASS, typecheck limpio.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/temaInk.ts src/cli/tui/temaInk.test.ts
git commit -m "TUI: paleta con los azules medidos de xone.es; tokens marca y fase"
```

```json:metadata
{"files": ["src/cli/tui/temaInk.ts", "src/cli/tui/temaInk.test.ts"], "verifyCommand": "npx vitest run src/cli/tui/temaInk.test.ts", "acceptanceCriteria": ["acento #47abd6, prompt #2ac4ea, marca #00396f, fase #e0a458", "marca y fase declarados en soloTui", "hex minúsculas"], "modelTier": "mechanical"}
```

---

### Task 2: Logotipo XONE (`logo.ts`)

**Goal:** Un módulo puro con el logotipo en letras de bloque y el umbral de anchura que decide si se pinta.

**Files:**
- Create: `src/cli/tui/logo.ts`
- Test: `src/cli/tui/logo.test.ts`

**Acceptance Criteria:**
- [ ] `LOGO_XONE` tiene 5 filas, todas de la MISMA anchura, ninguna mayor de 28 columnas (la sidebar mide 30).
- [ ] `cabeLogo(99) === false`, `cabeLogo(100) === true`.
- [ ] `logo.ts` no importa ink ni react (lo vigila `frontera.test.ts` de rebote: no es fichero de piel).

**Verify:** `npx vitest run src/cli/tui/logo.test.ts` → 2 PASS.

**Steps:**

- [ ] **Step 1: Test**

`src/cli/tui/logo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LOGO_XONE, cabeLogo, ANCHO_MINIMO_PARA_LOGO } from "./logo.js";

describe("el logotipo XONE", () => {
  it("es un bloque rectangular que cabe en la sidebar (30 columnas)", () => {
    expect(LOGO_XONE.length).toBe(5);
    const anchos = new Set(LOGO_XONE.map((fila) => fila.length));
    expect(anchos.size, "todas las filas miden lo mismo").toBe(1);
    expect(Math.max(...LOGO_XONE.map((f) => f.length))).toBeLessThanOrEqual(28);
    // Solo bloques y espacios: nada que un terminal pueda medir como doble ancho.
    for (const fila of LOGO_XONE) expect(fila).toMatch(/^[█ ]+$/);
  });

  it("cabe a partir de 100 columnas de terminal, no antes", () => {
    expect(ANCHO_MINIMO_PARA_LOGO).toBe(100);
    expect(cabeLogo(99)).toBe(false);
    expect(cabeLogo(100)).toBe(true);
    expect(cabeLogo(200)).toBe(true);
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/cli/tui/logo.test.ts`
Expected: FAIL — no existe `./logo.js`.

- [ ] **Step 3: Implementar**

`src/cli/tui/logo.ts`:

```ts
/**
 * El logotipo XONE en letras de bloque, para la cabecera de la sidebar.
 *
 * Un array de cadenas y no figlet: el logotipo es UN dibujo fijo, y una dependencia
 * más para cinco filas no lo acorta (mismo criterio por el que la Entrada no usa
 * `ink-text-input`). Cada letra mide 5 columnas, con 2 de separación: 26 en total,
 * que caben en las 30 de la sidebar. Solo `█` y espacio: ningún carácter que un
 * terminal pueda medir como doble ancho y descuadrar el bloque.
 */
export const LOGO_XONE: readonly string[] = [
  "█   █  █████  █   █  █████",
  " █ █   █   █  ██  █  █    ",
  "  █    █   █  █ █ █  ████ ",
  " █ █   █   █  █  ██  █    ",
  "█   █  █████  █   █  █████",
];

/**
 * Anchura TOTAL del terminal (no de la sidebar) a partir de la cual el logotipo se
 * pinta. Por debajo, el transcript se queda estrecho y el dibujo estorba más que
 * marca. Es un número a ojo, y vive en un solo sitio para poder ajustarlo.
 */
export const ANCHO_MINIMO_PARA_LOGO = 100;

export function cabeLogo(columnas: number): boolean {
  return columnas >= ANCHO_MINIMO_PARA_LOGO;
}
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/cli/tui/logo.test.ts src/cli/tui/frontera.test.ts && npm run typecheck`
Expected: todo PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/logo.ts src/cli/tui/logo.test.ts
git commit -m "TUI: logotipo XONE en letras de bloque, con umbral de anchura"
```

```json:metadata
{"files": ["src/cli/tui/logo.ts", "src/cli/tui/logo.test.ts"], "verifyCommand": "npx vitest run src/cli/tui/logo.test.ts", "acceptanceCriteria": ["5 filas de igual anchura <= 28", "cabeLogo umbral 100", "sin imports de ink/react"], "modelTier": "mechanical"}
```

---

### Task 3: Barra de acento compartida y bloque de usuario en el transcript

**Goal:** Un helper `barra(color)` con las props de Box para un bloque con SOLO barra izquierda, y el transcript pintando al usuario como bloque (una fila) y la fase en ámbar; el transcript ancla la entrada abajo con `minHeight`.

**Files:**
- Create: `src/cli/tui/barra.ts`
- Modify: `src/cli/tui/transcript.tsx`
- Test: `src/cli/tui/transcript.test.tsx`

**Acceptance Criteria:**
- [ ] Un store con 3 actos `usuario` pinta exactamente 3 líneas no vacías, cada una empezando por `▌`.
- [ ] El acto de usuario ya no lleva `❯ `.
- [ ] La fase se pinta con `temaInk.fase` (el texto «+ fase: Ns» no cambia).
- [ ] El transcript tiene `minHeight={altura}`: con 2 actos y altura 10, el frame tiene 10 líneas.
- [ ] `barra.ts` no importa ink ni react.

**Verify:** `npx vitest run src/cli/tui/transcript.test.tsx` → PASS.

**Steps:**

- [ ] **Step 1: Actualizar y añadir tests**

En `src/cli/tui/transcript.test.tsx`:

(a) En el test «pinta los últimos actos y el colchón como línea en curso», sustituye `expect(salida).toContain("❯ hola");` por:

```ts
    expect(salida).toContain("▌ hola");
    expect(salida).not.toContain("❯");
```

(b) En «cada acto se pinta por su tipo», sustituye `expect(salida).toContain("❯ hazlo");` por `expect(salida).toContain("▌ hazlo");`.

(c) Añade dentro de `describe("el transcript pintado", …)`:

```ts
  it("el bloque de usuario ocupa UNA fila: barra izquierda, sin borde arriba ni abajo", () => {
    // `ventanaDe` cuenta un acto como una fila. Un Box con borde arriba/abajo o padding
    // vertical serían tres, y la ventana se saldría de la pantalla.
    const s = crearStore();
    s.usuario("uno");
    s.usuario("dos");
    s.usuario("tres");
    const { lastFrame } = render(<Transcript store={s} altura={10} />);
    const lineas = (lastFrame() ?? "").split("\n").filter((l) => l.trim() !== "");
    expect(lineas).toHaveLength(3);
    for (const linea of lineas) expect(linea.trimStart().startsWith("▌")).toBe(true);
  });

  it("con pocos actos el transcript conserva su altura: la entrada queda anclada abajo", () => {
    const s = crearStore();
    s.usuario("hola");
    s.linea("→ x");
    const { lastFrame } = render(<Transcript store={s} altura={10} />);
    expect((lastFrame() ?? "").split("\n")).toHaveLength(10);
  });
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/cli/tui/transcript.test.tsx`
Expected: FAIL en los tests tocados (`▌` no aparece; el frame tiene 2 líneas, no 10).

- [ ] **Step 3: Crear `barra.ts`**

```ts
/**
 * El bloque con barra izquierda: la forma de los mensajes del usuario, de la Entrada y
 * de la Pregunta. Solo el lado izquierdo, con `▌`, y NUNCA borde arriba ni abajo: en el
 * transcript un acto es una fila (`ventanaDe` cuenta así), y una caja de tres filas por
 * mensaje se saldría de la pantalla. Vive aparte de los componentes para que las tres
 * cajas no puedan divergir en la forma.
 *
 * TypeScript puro: son props de Box, pero no importa ink — no hace falta.
 */

/** El estilo de borde: `left` es lo único que se pinta, el resto queda vacío por contrato. */
export const BORDE_BARRA = {
  topLeft: "",
  top: "",
  topRight: "",
  right: "",
  bottomRight: "",
  bottom: "",
  bottomLeft: "",
  left: "▌",
} as const;

/** Las props de un `<Box>` de Ink para un bloque con barra izquierda del color dado. */
export function barra(color: string) {
  return {
    borderStyle: BORDE_BARRA,
    borderTop: false,
    borderRight: false,
    borderBottom: false,
    borderLeft: true,
    borderLeftColor: color,
    paddingLeft: 1,
  } as const;
}
```

- [ ] **Step 4: Pintar el usuario como bloque y la fase en ámbar**

En `src/cli/tui/transcript.tsx`:

(a) Añade el import: `import { barra } from "./barra.js";`

(b) En `ActoVista`, sustituye el caso `usuario` y el caso `fase`:

```tsx
    case "usuario":
      // Un bloque con barra navy, UNA fila: la forma que comparte con la Entrada.
      return (
        <Box {...barra(temaInk.marca)}>
          <Text>{acto.texto}</Text>
        </Box>
      );
```

```tsx
    case "fase":
      return (
        <Text color={temaInk.fase}>
          {`+ ${acto.texto}: ${(acto.ms / 1000).toFixed(1)}s`}
        </Text>
      );
```

(c) En el `return` de `Transcript`, cambia `<Box flexDirection="column">` por:

```tsx
    // `minHeight` y no `height`: con pocos actos la Entrada queda anclada abajo (la
    // maqueta), y con una línea larga que envuelve el transcript CRECE en vez de
    // recortar lo más nuevo — que es justo lo que hay que leer.
    <Box flexDirection="column" minHeight={altura}>
```

- [ ] **Step 5: Verificar**

Run: `npx vitest run src/cli/tui && npm run typecheck`
Expected: todo PASS (el resto de tests de transcript siguen verdes: `toContain` no depende de las filas vacías).

- [ ] **Step 6: Commit**

```bash
git add src/cli/tui/barra.ts src/cli/tui/transcript.tsx src/cli/tui/transcript.test.tsx
git commit -m "TUI: el usuario es un bloque con barra navy de una fila; fase en ámbar"
```

```json:metadata
{"files": ["src/cli/tui/barra.ts", "src/cli/tui/transcript.tsx", "src/cli/tui/transcript.test.tsx"], "verifyCommand": "npx vitest run src/cli/tui/transcript.test.tsx", "acceptanceCriteria": ["3 usuarios = 3 líneas no vacías con ▌", "sin ❯", "fase en temaInk.fase", "minHeight altura", "barra.ts sin ink"], "modelTier": "standard"}
```

---

### Task 4: El acto `fin` lleva el modelo del turno («■ modelo · 1.8s»)

**Goal:** `store.fin(ms, modelo?)`, `crearPielTui(store, modeloActual?)`, `correrTui.ts` pasa el modelo vigente, y el transcript pinta `■ ollama/glm · 1.8s`.

**Files:**
- Modify: `src/cli/tui/store.ts`
- Modify: `src/cli/tui/pielTui.ts`
- Modify: `src/cli/tui/correrTui.ts`
- Modify: `src/cli/tui/transcript.tsx`
- Test: `src/cli/tui/store.test.ts`, `src/cli/tui/correrTui.test.ts`, `src/cli/tui/transcript.test.tsx`

**Acceptance Criteria:**
- [ ] `s.fin(2400)` sigue dando `{ tipo: "fin", ms: 2400 }` (sin clave `modelo`); `s.fin(1800, "ollama/glm")` da `{ tipo: "fin", ms: 1800, modelo: "ollama/glm" }`.
- [ ] La piel de `crearConsolaTui` pone en el `fin` el modelo de trabajo vigente, y un acuse de `/modelo` POSTERIOR no cambia el acto ya cerrado.
- [ ] El transcript pinta `■ ollama/glm · 1.8s` con modelo y `■ 2.4s` sin él; ya no pinta `(2.4s)`.
- [ ] `Piel.fin` del motor sigue siendo `(ms: number) => void`.

**Verify:** `npx vitest run src/cli/tui/store.test.ts src/cli/tui/correrTui.test.ts src/cli/tui/transcript.test.tsx` → PASS.

**Steps:**

- [ ] **Step 1: Tests**

(a) `src/cli/tui/store.test.ts`, dentro de `describe("el store de la TUI")`, añade:

```ts
  it("fin guarda el modelo del turno si se lo dan, y no inventa la clave si no", () => {
    const s = crearStore();
    s.fin(2400);
    s.fin(1800, "ollama/glm");
    expect(s.estado().actos).toEqual([
      { tipo: "fin", ms: 2400 },
      { tipo: "fin", ms: 1800, modelo: "ollama/glm" },
    ]);
  });
```

y dentro de `describe("la piel TUI")`:

```ts
  it("con modeloActual, la piel etiqueta el fin con el modelo del MOMENTO del fin", () => {
    let modelo = "ollama/a";
    const s = crearStore();
    const piel = crearPielTui(s, () => modelo);
    piel.fin(100);
    modelo = "ollama/b";
    piel.fin(200);
    expect(s.estado().actos).toEqual([
      { tipo: "fin", ms: 100, modelo: "ollama/a" },
      { tipo: "fin", ms: 200, modelo: "ollama/b" },
    ]);
  });
```

(b) `src/cli/tui/correrTui.test.ts`, añade dentro de `describe("la consola TUI")`:

```ts
  it("el fin del turno lleva el modelo de trabajo vigente, y un /modelo posterior no lo reetiqueta", () => {
    // Capturar al cerrar el turno, no al pintar: si el transcript leyera el modelo
    // actual en el render, un /modelo cambiaría la etiqueta de turnos ya cerrados.
    const { consola, actos, datosSidebar } = crearConsolaTui({ raiz: "/tmp/proyecto" });
    const antes = datosSidebar().modelo;
    consola.piel!().fin(1800);
    consola.escribir(acuseDeModelo(undefined, "ollama/nuevo"));
    const fin = actos().find((a) => a.tipo === "fin");
    expect(fin).toEqual({ tipo: "fin", ms: 1800, modelo: antes });
    expect(datosSidebar().modelo).toBe("ollama/nuevo");
  });
```

(c) `src/cli/tui/transcript.test.tsx`: en «cada acto se pinta por su tipo», sustituye `expect(salida).toContain("(2.4s)");` por:

```ts
    expect(salida).toContain("■ 2.4s");
    expect(salida).not.toContain("(2.4s)");
```

y añade un test nuevo en el mismo `describe`:

```ts
  it("el fin con modelo se pinta como «■ modelo · Ns»", () => {
    const s = crearStore();
    s.fin(1800, "ollama/glm");
    expect(render(<Transcript store={s} altura={5} />).lastFrame()).toContain("■ ollama/glm · 1.8s");
  });
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/cli/tui/store.test.ts src/cli/tui/correrTui.test.ts src/cli/tui/transcript.test.tsx`
Expected: FAIL (typecheck de vitest: `fin` no admite segundo argumento; el frame no tiene `■`).

- [ ] **Step 3: Store**

En `src/cli/tui/store.ts`:

(a) En el tipo `Acto`, cambia `| { tipo: "fin"; ms: number }` por:

```ts
  /** El cierre del turno: duración y, si la piel lo sabe, el modelo que lo corrió. */
  | { tipo: "fin"; ms: number; modelo?: string }
```

(b) Sustituye el método `fin`:

```ts
    /**
     * El cierre del turno. `modelo` es el que lo corrió, capturado por quien llama EN
     * este momento (no en el render): un /modelo posterior no debe reetiquetar turnos
     * ya cerrados. Sin modelo no se escribe la clave, para que los actos viejos y los
     * tests que los comparan con `toEqual` no cambien.
     */
    fin(ms: number, modelo?: string): void {
      aniadir([modelo === undefined ? { tipo: "fin", ms } : { tipo: "fin", ms, modelo }]);
    },
```

- [ ] **Step 4: Piel**

Sustituye `src/cli/tui/pielTui.ts` entero:

```ts
/**
 * La piel TUI: implementa la interfaz `Piel` de `core/turno.ts` delegando en el store.
 * Es deliberadamente fina — la semántica ya vive en el store — y existe para que el
 * motor no sepa que hay una TUI.
 *
 * `modeloActual` es la única cosa que la piel sabe y el motor no: `Piel.fin` solo trae
 * la duración, y la etiqueta «■ modelo · Ns» del transcript necesita el modelo que corrió
 * el turno. Se lee en el momento del `fin`, y quien monta la TUI (`correrTui.ts`) pasa
 * el cierre que conoce el modelo de trabajo vigente.
 */
import type { Piel } from "../../core/turno.js";
import type { PendienteDeAprobacion } from "../../core/events.js";
import type { crearStore } from "./store.js";

type Store = ReturnType<typeof crearStore>;

export function crearPielTui(store: Store, modeloActual?: () => string): Piel {
  return {
    token: (texto) => store.token(texto),
    cerrarLinea: () => store.cerrarLinea(),
    linea: (texto) => store.linea(texto),
    pausa: (_pendientes: PendienteDeAprobacion[]) => store.pausa(),
    fin: (ms) => store.fin(ms, modeloActual?.()),
    fase: (texto) => store.fase(texto),
    // En TUI el panel de avisos no existe: el repintado es total y el aviso es una
    // línea de sistema más.
    notificacion: (texto) => store.linea(texto, "sistema"),
  };
}
```

- [ ] **Step 5: correrTui pasa el modelo**

En `src/cli/tui/correrTui.ts`, dentro de `piel: (): Piel => { … }`, cambia `const base = crearPielTui(store);` por:

```ts
      // El modelo que etiqueta el «■ modelo · Ns» del fin: el de trabajo VIGENTE, leído
      // cuando el fin ocurre (ver pielTui.ts).
      const base = crearPielTui(store, () => modeloTrabajo);
```

- [ ] **Step 6: Transcript pinta el fin**

En `src/cli/tui/transcript.tsx`, en `ActoVista`, sustituye el caso `fin`:

```tsx
    case "fin":
      // «■ modelo · 1.8s»: el cuadrado en acento, el modelo en texto, la duración en mudo.
      return (
        <Text>
          <Text color={temaInk.acento}>{"■ "}</Text>
          {acto.modelo !== undefined ? (
            <>
              <Text>{acto.modelo}</Text>
              <Text color={temaInk.mudo}>{" · "}</Text>
            </>
          ) : null}
          <Text color={temaInk.mudo}>{`${(acto.ms / 1000).toFixed(1)}s`}</Text>
        </Text>
      );
```

(Si el fichero no tiene ya `Fragment` disponible vía `<>…</>` con `jsx: react-jsx`, funciona sin import: el repo compila con `react-jsx`.)

- [ ] **Step 7: Verificar**

Run: `npx vitest run src/cli/tui && npm run typecheck`
Expected: todo PASS.

- [ ] **Step 8: Commit**

```bash
git add src/cli/tui/store.ts src/cli/tui/pielTui.ts src/cli/tui/correrTui.ts src/cli/tui/transcript.tsx src/cli/tui/store.test.ts src/cli/tui/correrTui.test.ts src/cli/tui/transcript.test.tsx
git commit -m "TUI: el fin del turno lleva el modelo que lo corrió — «■ modelo · Ns»"
```

```json:metadata
{"files": ["src/cli/tui/store.ts", "src/cli/tui/pielTui.ts", "src/cli/tui/correrTui.ts", "src/cli/tui/transcript.tsx", "src/cli/tui/store.test.ts", "src/cli/tui/correrTui.test.ts", "src/cli/tui/transcript.test.tsx"], "verifyCommand": "npx vitest run src/cli/tui/store.test.ts src/cli/tui/correrTui.test.ts src/cli/tui/transcript.test.tsx", "acceptanceCriteria": ["fin sin modelo no lleva la clave", "fin con modelo la lleva", "piel de correrTui etiqueta con el modelo vigente y no reetiqueta", "transcript pinta ■ modelo · Ns y ■ Ns"], "modelTier": "standard"}
```

---

### Task 5: Entrada con barra izquierda y línea de modelo; Pregunta con barra

**Goal:** La Entrada cambia el borde redondeado por la barra navy y gana una segunda fila muda con el modelo de trabajo; `PreguntaInk` (en `app.tsx`) usa la misma barra en `aviso`.

**Files:**
- Modify: `src/cli/tui/entrada.tsx`
- Modify: `src/cli/tui/app.tsx` (prop `modelo` a `Entrada`, barra en `PreguntaInk`)
- Test: `src/cli/tui/entrada.test.tsx`

**Acceptance Criteria:**
- [ ] `Entrada` exige la prop `modelo: string` y la pinta en una segunda fila (también con `ocupado`).
- [ ] El frame de la Entrada empieza por `▌` y no contiene `╭` ni `╰` (el borde redondeado desaparece).
- [ ] El cursor es `▏` en `temaInk.prompt`.
- [ ] `PreguntaInk` usa `barra(temaInk.aviso)`.
- [ ] Los tests existentes de Entrada siguen pasando con la prop nueva.

**Verify:** `npx vitest run src/cli/tui/entrada.test.tsx` → PASS.

**Steps:**

- [ ] **Step 1: Tests**

En `src/cli/tui/entrada.test.tsx`, añade `modelo="ollama/glm"` a TODOS los `<Entrada …/>` existentes (seis renders), y añade al final del `describe("entrada")`:

```ts
  it("es un bloque con barra izquierda y una segunda fila con el modelo, también ocupada", async () => {
    const libre = render(
      <Entrada alEnviar={() => {}} completa={() => [[], ""]} ocupado={false} historial={[]} modelo="ollama/glm" />
    );
    await esperar();
    const salidaLibre = libre.lastFrame() ?? "";
    expect(salidaLibre.trimStart().startsWith("▌")).toBe(true);
    expect(salidaLibre).not.toContain("╭");
    expect(salidaLibre).not.toContain("╰");
    expect(salidaLibre).toContain("▏");
    expect(salidaLibre).toContain("ollama/glm");

    const ocupada = render(
      <Entrada alEnviar={() => {}} completa={() => [[], ""]} ocupado={true} historial={[]} modelo="ollama/glm" />
    );
    await esperar();
    expect(ocupada.lastFrame()).toContain("turno en curso");
    expect(ocupada.lastFrame()).toContain("ollama/glm");
  });
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/cli/tui/entrada.test.tsx`
Expected: FAIL (prop `modelo` desconocida en typecheck de vitest; el frame tiene `╭`).

- [ ] **Step 3: Entrada**

En `src/cli/tui/entrada.tsx`:

(a) Import: `import { barra } from "./barra.js";`

(b) Añade la prop al tipo y al destructuring:

```tsx
export function Entrada({
  alEnviar,
  completa,
  ocupado,
  historial,
  modelo,
}: {
  alEnviar: (linea: string) => void;
  /** El completer puro de `consola.ts`: `(linea) => [candidatos, linea]`. */
  completa: (linea: string) => [string[], string];
  ocupado: boolean;
  historial: readonly string[];
  /** El modelo de trabajo vigente: la segunda fila del cuadro, en mudo (la maqueta). */
  modelo: string;
}): ReactNode {
```

(c) Sustituye el `return`:

```tsx
  return (
    // La misma barra navy que el bloque de usuario: lo que escribes y lo que escribiste
    // tienen la misma forma. Sin borde arriba/abajo: dos filas de contenido, y app.tsx
    // cuenta con ellas en FILAS_FIJAS.
    <Box flexDirection="column" {...barra(temaInk.marca)}>
      {ocupado ? (
        <Text color={temaInk.mudo}>turno en curso… (Ctrl-C para cancelar el turno)</Text>
      ) : (
        <Text color={temaInk.texto}>
          {valor}
          <Text color={temaInk.prompt}>{"▏"}</Text>
        </Text>
      )}
      <Text color={temaInk.mudo}>{modelo}</Text>
      {pista.length > 0 ? <Text color={temaInk.mudo}>{`  ${pista.join("   ")}`}</Text> : null}
    </Box>
  );
```

- [ ] **Step 4: App: pasar `modelo` y barra en la Pregunta**

En `src/cli/tui/app.tsx`:

(a) Import: `import { barra } from "./barra.js";`

(b) En `PreguntaInk`, sustituye `<Box borderStyle="round" borderColor={temaInk.aviso} paddingX={1}>` por `<Box {...barra(temaInk.aviso)}>` y el cursor `<Text color={temaInk.acento}>{"▏"}</Text>` por `<Text color={temaInk.prompt}>{"▏"}</Text>`.

(c) En el `return` de `App`, la Entrada pasa a:

```tsx
            <Entrada
              alEnviar={alEnviar}
              completa={completa}
              ocupado={vista.ocupado}
              historial={historial}
              modelo={datos.modelo}
            />
```

- [ ] **Step 5: Verificar**

Run: `npx vitest run src/cli/tui && npm run typecheck`
Expected: todo PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli/tui/entrada.tsx src/cli/tui/entrada.test.tsx src/cli/tui/app.tsx
git commit -m "TUI: la Entrada es un bloque con barra navy y enseña el modelo debajo"
```

```json:metadata
{"files": ["src/cli/tui/entrada.tsx", "src/cli/tui/entrada.test.tsx", "src/cli/tui/app.tsx"], "verifyCommand": "npx vitest run src/cli/tui/entrada.test.tsx", "acceptanceCriteria": ["prop modelo obligatoria y pintada, también ocupada", "frame empieza por ▌ sin ╭╰", "cursor ▏ en prompt", "PreguntaInk con barra aviso"], "modelTier": "standard"}
```

---

### Task 6: Pie a dos extremos (`pie()` y `BarraDeEstado`)

**Goal:** Sustituir `lineaDeEstado(modelo, ruta)` por `pie()` pura con izquierda (ruta) y derecha (cifras + `/ayuda`), y `BarraDeEstado` con `justifyContent="space-between"`; `datosSidebar` gana `ruta`.

**Files:**
- Modify: `src/cli/tui/sidebar.tsx`
- Modify: `src/cli/tui/correrTui.ts` (`ruta: raiz` en `datosSidebar`)
- Modify: `src/cli/tui/app.tsx` (props nuevas de `BarraDeEstado`)
- Test: `src/cli/tui/sidebar.test.tsx`, `src/cli/tui/correrTui.test.ts`

**Acceptance Criteria:**
- [ ] `pie({ ruta, contexto: 15_400, tope: 200_000 })` → `{ izquierda: ruta, cifras: "15.4K (8%)", derecha: "15.4K (8%)  /ayuda" }`.
- [ ] Sin tope: `cifras: "15.4K tokens"`, `derecha: "15.4K tokens  /ayuda"`. Con contexto 0: `cifras: ""`, `derecha: "/ayuda"`.
- [ ] El frame de `BarraDeEstado` con `width={60}` contiene la ruta al principio y `/ayuda` al final de la MISMA línea.
- [ ] `lineaDeEstado` deja de existir en `sidebar.tsx`.
- [ ] `datosSidebar().ruta === raiz`.

**Verify:** `npx vitest run src/cli/tui/sidebar.test.tsx src/cli/tui/correrTui.test.ts` → PASS.

**Steps:**

- [ ] **Step 1: Tests**

(a) En `src/cli/tui/sidebar.test.tsx`, sustituye el import por:

```ts
import { Box } from "ink";
import { Sidebar, BarraDeEstado, pie } from "./sidebar.js";
```

y sustituye el `describe("la barra inferior de estado", …)` entero por:

```ts
describe("el pie a dos extremos", () => {
  it("izquierda la ruta; derecha las cifras y /ayuda — porcentaje SOLO con tope", () => {
    expect(pie({ ruta: "~/dev/MinitMT", contexto: 15_400, tope: 200_000 })).toEqual({
      izquierda: "~/dev/MinitMT",
      cifras: "15.4K (8%)",
      derecha: "15.4K (8%)  /ayuda",
    });
    expect(pie({ ruta: "~/dev/MinitMT", contexto: 15_400 })).toEqual({
      izquierda: "~/dev/MinitMT",
      cifras: "15.4K tokens",
      derecha: "15.4K tokens  /ayuda",
    });
    // Sin medición no hay cifra: pintar «0 tokens» sería inventar una lectura.
    expect(pie({ ruta: "~/dev/MinitMT", contexto: 0, tope: 200_000 })).toEqual({
      izquierda: "~/dev/MinitMT",
      cifras: "",
      derecha: "/ayuda",
    });
  });

  it("pintado: la ruta a la izquierda y /ayuda al final de la misma línea", () => {
    const { lastFrame } = render(
      <Box width={60}>
        <BarraDeEstado ruta="~/dev/MinitMT" contexto={15_400} tope={200_000} />
      </Box>
    );
    const linea = (lastFrame() ?? "").split("\n")[0] ?? "";
    expect(linea.trimStart().startsWith("~/dev/MinitMT")).toBe(true);
    expect(linea.trimEnd().endsWith("/ayuda")).toBe(true);
    expect(linea).toContain("15.4K (8%)");
  });
});
```

(b) En `src/cli/tui/correrTui.test.ts`, en el test «el acuse de /modelo (compartido con consola.ts) actualiza la sidebar en caliente», añade al final:

```ts
    // El pie enseña la RUTA completa (la maqueta), no solo el basename.
    expect(datosSidebar().ruta).toBe("/tmp/proyecto");
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/cli/tui/sidebar.test.tsx src/cli/tui/correrTui.test.ts`
Expected: FAIL (`pie` no existe; `ruta` no existe).

- [ ] **Step 3: `pie()` y `BarraDeEstado`**

En `src/cli/tui/sidebar.tsx`:

(a) Añade `ruta: string;` a `DatosDeSidebar` con comentario:

```ts
  /** La raíz completa del proyecto: el pie la enseña entera; `proyecto` es su basename. */
  ruta: string;
```

(b) Sustituye `lineaDeEstado` y `BarraDeEstado` (todo lo que hay tras `Sidebar`) por:

```tsx
/**
 * El pie a dos extremos: la ruta a la izquierda; a la derecha las cifras de contexto y
 * el recordatorio de `/ayuda`. Pura, para probar la composición sin montar Ink (mismo
 * patrón que `ventanaDe` en transcript.tsx). `cifras` vive aparte de `derecha` porque
 * se pinta en mudo y `/ayuda` en texto; `derecha` es la línea completa, para los tests.
 * Porcentaje SOLO con tope, y sin medición (`contexto === 0`) ninguna cifra: las dos
 * reglas de `core/contextos.ts` y de la sidebar.
 */
export function pie(d: { ruta: string; contexto: number; tope?: number }): {
  izquierda: string;
  cifras: string;
  derecha: string;
} {
  let cifras = "";
  if (d.contexto > 0) {
    cifras =
      d.tope !== undefined && d.tope > 0
        ? `${compacto(d.contexto)} (${Math.round((d.contexto / d.tope) * 100)}%)`
        : `${compacto(d.contexto)} tokens`;
  }
  return { izquierda: d.ruta, cifras, derecha: cifras === "" ? "/ayuda" : `${cifras}  /ayuda` };
}

export function BarraDeEstado(d: { ruta: string; contexto: number; tope?: number }): ReactNode {
  const p = pie(d);
  return (
    <Box justifyContent="space-between">
      <Text color={temaInk.mudo}>{p.izquierda}</Text>
      <Text>
        {p.cifras !== "" ? <Text color={temaInk.mudo}>{`${p.cifras}  `}</Text> : null}
        <Text color={temaInk.texto}>/ayuda</Text>
      </Text>
    </Box>
  );
}
```

(`formatearTope` deja de usarse en el pie pero la sección Contexto de la Sidebar sigue usándola: no quites el import.)

- [ ] **Step 4: `correrTui.ts` y `app.tsx`**

En `src/cli/tui/correrTui.ts`, dentro de `datosSidebar`, añade tras `proyecto: basename(raiz),`:

```ts
      ruta: raiz,
```

En `src/cli/tui/app.tsx`, sustituye `<BarraDeEstado modelo={datos.modelo} ruta={datos.proyecto} />` por:

```tsx
          <BarraDeEstado ruta={datos.ruta} contexto={datos.contexto} tope={datos.tope} />
```

- [ ] **Step 5: Arreglar los renders de `Sidebar` en los tests**

Los cinco `<Sidebar …/>` de `sidebar.test.tsx` necesitan ahora `ruta`: añade `ruta="/dev/MinitMT"` a cada uno (el valor exacto no importa aún; la Tarea 7 los retoca de nuevo).

- [ ] **Step 6: Verificar**

Run: `npx vitest run src/cli/tui && npm run typecheck`
Expected: todo PASS.

- [ ] **Step 7: Commit**

```bash
git add src/cli/tui/sidebar.tsx src/cli/tui/sidebar.test.tsx src/cli/tui/correrTui.ts src/cli/tui/correrTui.test.ts src/cli/tui/app.tsx
git commit -m "TUI: pie a dos extremos — ruta a la izquierda, contexto y /ayuda a la derecha"
```

```json:metadata
{"files": ["src/cli/tui/sidebar.tsx", "src/cli/tui/sidebar.test.tsx", "src/cli/tui/correrTui.ts", "src/cli/tui/correrTui.test.ts", "src/cli/tui/app.tsx"], "verifyCommand": "npx vitest run src/cli/tui/sidebar.test.tsx src/cli/tui/correrTui.test.ts", "acceptanceCriteria": ["pie() en sus tres variantes", "BarraDeEstado space-between con /ayuda al final", "lineaDeEstado eliminada", "datosSidebar().ruta === raiz"], "modelTier": "standard"}
```

---

### Task 7: Sidebar con logotipo, secciones y pie anclado abajo

**Goal:** La sidebar pinta el logotipo XONE arriba (si cabe), Contexto y Modelo, y ancla al fondo «proyecto:rama» y «● xonecode <versión>».

**Files:**
- Modify: `src/cli/tui/sidebar.tsx`
- Modify: `src/cli/tui/app.tsx` (prop `columnas` y altura de la fila)
- Test: `src/cli/tui/sidebar.test.tsx`

**Acceptance Criteria:**
- [ ] `Sidebar` recibe `columnas: number` aparte de los datos; con 120 el frame contiene `█`, con 80 no.
- [ ] Renderizada dentro de `<Box height={20} flexDirection="column">`, el frame tiene 20 líneas y la ÚLTIMA no vacía contiene `xonecode 0.3.0`; la anterior contiene `MinitMT:main`.
- [ ] Sin rama, el pie enseña solo `MinitMT` (sin `:`).
- [ ] Las aserciones existentes (`13%`, sin `%` sin tope, `Contexto` calla con 0, `200K/200K`, `trabajo: ollama/glm`) siguen verdes.

**Verify:** `npx vitest run src/cli/tui/sidebar.test.tsx` → PASS.

**Steps:**

- [ ] **Step 1: Tests**

En `src/cli/tui/sidebar.test.tsx`:

(a) Añade `columnas={80}` a los cinco `<Sidebar …/>` existentes (así ninguno pinta el logo y las aserciones de contenido no cambian).

(b) Añade dentro de `describe("sidebar")`:

```ts
  it("el logotipo XONE aparece con 120 columnas de terminal y no con 80", () => {
    const con = render(
      <Sidebar contexto={0} modelo="m" modelosPorPapel={{}} proyecto="p" ruta="/p" version="0" columnas={120} />
    );
    const sin = render(
      <Sidebar contexto={0} modelo="m" modelosPorPapel={{}} proyecto="p" ruta="/p" version="0" columnas={80} />
    );
    expect(con.lastFrame() ?? "").toContain("█");
    expect(sin.lastFrame() ?? "").not.toContain("█");
  });

  it("lo estable (proyecto:rama, versión) queda anclado al fondo de la columna", () => {
    const { lastFrame } = render(
      <Box height={20} flexDirection="column">
        <Sidebar contexto={0} modelo="ollama/glm" modelosPorPapel={{}} proyecto="MinitMT" ruta="/dev/MinitMT" rama="main" version="0.3.0" columnas={80} />
      </Box>
    );
    const lineas = (lastFrame() ?? "").split("\n");
    expect(lineas).toHaveLength(20);
    const llenas = lineas.filter((l) => l.trim() !== "");
    expect(llenas.at(-1)).toContain("xonecode 0.3.0");
    expect(llenas.at(-2)).toContain("MinitMT:main");
    // Y hay hueco entre las secciones y el pie: el anclaje es real, no un margen fijo.
    expect(lineas.at(-3)?.trim()).toBe("");
  });

  it("sin rama, el pie enseña solo el proyecto", () => {
    const { lastFrame } = render(
      <Sidebar contexto={0} modelo="ollama/glm" modelosPorPapel={{}} proyecto="MinitMT" ruta="/dev/MinitMT" version="0.3.0" columnas={80} />
    );
    const salida = lastFrame() ?? "";
    expect(salida).toContain("MinitMT");
    expect(salida).not.toContain("MinitMT:");
  });
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/cli/tui/sidebar.test.tsx`
Expected: FAIL (`columnas` desconocida; sin `█`; el frame no mide 20).

- [ ] **Step 3: Sidebar**

En `src/cli/tui/sidebar.tsx`:

(a) Import: `import { LOGO_XONE, cabeLogo } from "./logo.js";`

(b) Sustituye la función `Sidebar` entera:

```tsx
/**
 * `columnas` es la anchura TOTAL del terminal, y llega aparte de los datos: los datos
 * los compone `correrTui.ts` (que no mira stdout) y la anchura la conoce `App`.
 */
export function Sidebar({ columnas, ...d }: DatosDeSidebar & { columnas: number }): ReactNode {
  return (
    // flexGrow para llenar la columna: el separador de abajo empuja el pie al fondo.
    <Box flexDirection="column" flexGrow={1}>
      {cabeLogo(columnas) ? (
        <Box flexDirection="column" marginBottom={1}>
          {LOGO_XONE.map((fila, i) => (
            <Text key={i} color={temaInk.acento}>{fila}</Text>
          ))}
        </Box>
      ) : null}
      {d.contexto > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={temaInk.acento}>Contexto</Text>
          <Text>
            {compacto(d.contexto)}
            {d.tope !== undefined ? `/${formatearTope(d.tope)} (${Math.round((d.contexto / d.tope) * 100)}%)` : " tokens"}
          </Text>
        </Box>
      ) : null}
      <Box flexDirection="column">
        <Text bold color={temaInk.acento}>Modelo</Text>
        <Text>{d.modelo}</Text>
        {Object.entries(d.modelosPorPapel).map(([papel, m]) => (
          <Text key={papel} color={temaInk.mudo}>{`${papel}: ${m}`}</Text>
        ))}
      </Box>
      {/* El separador elástico: lo estable vive al fondo, como en la maqueta. */}
      <Box flexGrow={1} />
      <Box flexDirection="column">
        <Text>
          <Text bold>{d.proyecto}</Text>
          {d.rama !== undefined ? <Text color={temaInk.mudo}>{`:${d.rama}`}</Text> : null}
        </Text>
        <Text>
          <Text color={temaInk.exito}>{"● "}</Text>
          <Text color={temaInk.mudo}>{`xonecode ${d.version}`}</Text>
        </Text>
      </Box>
    </Box>
  );
}
```

(El `gap={1}` anterior se sustituye por `marginBottom={1}` en las secciones superiores: con un separador elástico, `gap` metería una fila de más entre el separador y el pie.)

- [ ] **Step 4: App pasa `columnas`**

En `src/cli/tui/app.tsx`, en el `return` de `App`, sustituye `<Sidebar {...datos} />` por:

```tsx
          <Sidebar {...datos} columnas={stdout.columns ?? 80} />
```

(La altura de la fila, que hace efectivo el anclaje en la pantalla real, se fija en la Tarea 8.)

- [ ] **Step 5: Verificar**

Run: `npx vitest run src/cli/tui && npm run typecheck`
Expected: todo PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli/tui/sidebar.tsx src/cli/tui/sidebar.test.tsx src/cli/tui/app.tsx
git commit -m "TUI: sidebar con logotipo XONE arriba y proyecto:rama + versión anclados abajo"
```

```json:metadata
{"files": ["src/cli/tui/sidebar.tsx", "src/cli/tui/sidebar.test.tsx", "src/cli/tui/app.tsx"], "verifyCommand": "npx vitest run src/cli/tui/sidebar.test.tsx", "acceptanceCriteria": ["logo con 120 columnas, no con 80", "en Box height 20: 20 líneas, última con xonecode 0.3.0, penúltima MinitMT:main", "sin rama solo proyecto", "aserciones previas verdes"], "modelTier": "standard"}
```

---

### Task 8: Maqueta de `App`: filas fijas, alturas y verificación final

**Goal:** `app.tsx` calcula el transcript con `FILAS_FIJAS = 3`, fija la altura de la fila de columnas para que el anclaje de la sidebar funcione en pantalla, y la suite completa más el typecheck quedan verdes.

**Files:**
- Modify: `src/cli/tui/app.tsx`
- Modify: `docs/superpowers/specs/2026-09-01-tui-estilo-xone-design.md` (solo si el plan se desvió: anotar `columnas` como prop de `Sidebar` y `ruta` en `DatosDeSidebar`)

**Acceptance Criteria:**
- [ ] `app.tsx` tiene `const FILAS_FIJAS = 3` con el desglose comentado (2 de la Entrada + 1 del pie) y `alturaTranscript = Math.max(5, rows - FILAS_FIJAS)`.
- [ ] La fila de columnas tiene `height={rows}` y la columna de la sidebar es `flexDirection="column"`, para que `flexGrow` de la Sidebar tenga altura que llenar.
- [ ] `npm test` completo en verde y `npm run typecheck` limpio.
- [ ] `frontera.test.ts` e `imports.test.ts` en verde (ningún import nuevo de ink/react fuera de `cli/tui/`).

**Verify:** `npm test && npm run typecheck` → todo PASS, 0 errores.

**Steps:**

- [ ] **Step 1: `FILAS_FIJAS` y alturas**

En `src/cli/tui/app.tsx`:

(a) Encima de `export function App(` añade:

```ts
/**
 * Las filas que NO son transcript: las 2 de la Entrada (línea en edición + modelo; la
 * barra izquierda no añade filas) y 1 del pie. La pista de Tab añade una transitoria
 * que se acepta, como antes. Si la Entrada cambia de forma, este número cambia con ella.
 */
const FILAS_FIJAS = 3;
```

(b) Sustituye `const alturaTranscript = Math.max(5, (stdout.rows ?? 24) - 4);` por:

```ts
  const filas = stdout.rows ?? 24;
  const alturaTranscript = Math.max(5, filas - FILAS_FIJAS);
```

(c) En el `return`, sustituye `<Box flexDirection="row">` por `<Box flexDirection="row" height={filas}>` y `<Box width={30} paddingLeft={1}>` por `<Box width={30} paddingLeft={1} flexDirection="column">`.

- [ ] **Step 2: Suite completa y typecheck**

Run: `npm test && npm run typecheck`
Expected: todos los ficheros PASS; typecheck sin salida de error.

- [ ] **Step 3: Anotar la desviación en la spec**

En `docs/superpowers/specs/2026-09-01-tui-estilo-xone-design.md`, sección «5. Sidebar», sustituye la línea «`DatosDeSidebar` gana `columnas: number`. `proyecto` sigue siendo el basename.» por:

```markdown
- `columnas` llega a `Sidebar` como prop APARTE de `DatosDeSidebar` (los datos los compone
  `correrTui.ts`, que no mira stdout; la anchura la conoce `App`). `DatosDeSidebar` gana en
  cambio `ruta` (la raíz completa) para el pie; `proyecto` sigue siendo el basename.
```

- [ ] **Step 4: Commit**

```bash
git add src/cli/tui/app.tsx docs/superpowers/specs/2026-09-01-tui-estilo-xone-design.md
git commit -m "TUI: maqueta con FILAS_FIJAS y altura de fila para anclar la sidebar"
```

```json:metadata
{"files": ["src/cli/tui/app.tsx", "docs/superpowers/specs/2026-09-01-tui-estilo-xone-design.md"], "verifyCommand": "npm test && npm run typecheck", "acceptanceCriteria": ["FILAS_FIJAS = 3 y altura rows - 3", "fila con height={rows} y columna sidebar en column", "npm test y typecheck verdes"], "modelTier": "standard"}
```

---

## Comprobación manual (fuera del plan, opcional)

Con un terminal de ≥ 100 columnas: `./bin/xonecode --tui --guion` desde un proyecto XOne. Debe verse el logotipo arriba a la derecha en azul, la Entrada con barra navy y el modelo debajo, el pie con la ruta a la izquierda y `/ayuda` a la derecha, y tras un turno la línea `■ ollama/… · Ns`. Con `--no-tui` o en pipe, nada cambia (byte-idéntico).
