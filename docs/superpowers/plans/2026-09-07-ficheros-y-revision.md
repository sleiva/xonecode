# Ficheros y Revisión — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dos pestañas en el centro de la consola web: **Ficheros** (árbol del proyecto con visor de solo lectura) y **Revisión** (lo que la sesión tocó, con los diffs apilados y numerados).

**Architecture:** Revisión es la pestaña «Ficheros» de hoy renombrada y redistribuida; sus datos (`revision`/`parche`) ya viajan y solo se añade una función pura que numera el diff. Ficheros es nueva: dos mensajes de cable (`arbol`, `fichero`) atendidos por un módulo del host que reutiliza el listado del completado del Tab y aplica la misma regla de lectura que las tools propias del agente. Las dos pestañas comparten un componente de árbol y la maqueta de dos columnas.

**Tech Stack:** TypeScript, React 18 + Vite (`apps/web`), CSS Modules, `@deepseek-ai/dsh-client-ui-primitives` (`CodeBlock`), `node:http` + SSE (`src/web`), vitest (proyectos `host` en node y `cliente` en jsdom).

**Spec:** `docs/superpowers/specs/2026-09-07-ficheros-y-revision-design.md`

## Global Constraints

- **`npm test` no necesita clave, red ni simulador.** Los puertos nuevos del servidor (`arbolDelProyecto`, `leerFichero`) entran por `montarRutas` como opciones y los tests del cable usan dobles; el módulo del host se prueba contra un directorio temporal real.
- **Frontera del cliente** (`src/web/frontera.test.ts`): nada de `apps/web/` importa de `src/`. Los tipos del cable se REDECLARAN en `apps/web/src/tipos.ts` y `tipos.test.ts` compara los literales `clase:` con `src/web/servidor/transporte.ts` — los dos ficheros tienen que llevar exactamente los mismos literales (con duplicados en las dos uniones cuando el mismo nombre viaja en las dos direcciones).
- **Ningún color literal en los `.module.css`** (`Barra.test.tsx` lo vigila): solo alias `--dsw-alias-*`, `--xonecode-*` y `--ds-font-family-code`. El acento es `--xonecode-cian`.
- **Ningún byte de contenido de fichero viaja donde no debe**: el lector rechaza en este orden ruta absoluta / `..` / segmentos vacíos, lo que `puedeLeerRuta` niega (`.env*`, `.git`, `.xonecode`), vistas aplanadas, y cualquier `realpath` que salga de la raíz. Un error nunca lleva la ruta resuelta en disco.
- **Constantes con nombre**: `DESPLEGADOS_AL_ABRIR = 8`, `TOPE_DE_FICHERO = 400_000`, `TOPE_DE_ENTRADAS = 5_000`, `PROFUNDIDAD_DEL_ARBOL = 32`, `VENTANA_DE_BINARIO = 8_192`.
- **Punto de corte de la columna derecha**: `@container (max-width: 720px)` sobre el contenedor de la pestaña, NO `@media` sobre la ventana. Sustituye al «960 px de ventana» del spec (D5) porque `Ficheros.module.css` ya mide así —con la barra lateral desplegada la ventana cuenta 280 px que la pestaña no tiene— y la razón está documentada en esa hoja.
- **El corte de la cabecera de git** (`diff --git`, `index`, `---`, `+++`) lo hace el CLIENTE en `numerarParche`, no `parcheDeSesion` (el spec lo atribuía al host; hoy lo hace `lineasDeParche` en el componente y ahí se queda).
- **En estrecho, el árbol de Ficheros va ARRIBA del visor**: `order: -1` sobre `.arbol` con el 40 % de la altura, y el DOM se queda con el visor primero (el orden del Tab del layout ancho). Tercer desvío del spec, que pedía «el árbol ocupa el centro hasta elegir un fichero, con una flecha para volver»: eso es un segundo estado de navegación —y una flecha— para una pestaña cuyo contenido cabe en las dos mitades, y perder el árbol de vista al abrir un fichero es justo lo que se viene a hacer aquí (saltar de uno a otro).
- **Estilo de comentarios del repo**: cada decisión no obvia lleva su porqué en un comentario, en castellano, como el resto del código.

**User decisions (already made):**
- «Habría una pestaña Ficheros y otra Revisión»: Ficheros = árbol del proyecto + visor; Revisión = lo que la sesión tocó, apilado con diffs.
- Revisión sobre la SESIÓN entera; el selector «Último turno» queda fuera y la cabecera deja el hueco («Sesión»).
- El visor es de solo lectura. El árbol esconde `.xonecode/`, `.env`, `.git` y los `.xml` aplanados. Las dos pestañas solo existen con sesión abierta.
- Fuera de alcance: Deshacer, tarjeta en el chat, edición, commit/push, búsqueda por contenido.

---

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/web/servidor/transporte.ts` | Tipos del cable: `ficheros`→`revision`; nuevos `arbol` y `fichero`; `FicheroDelProyecto`. |
| `src/web/servidor/arranque.ts` | `atenderRevision`, `atenderArbol`, `atenderFichero`; opciones `arbolDelProyecto`, `leerFichero`; cableado real en `arrancarConsolaWeb`. |
| `src/web/servidor/arranque.test.ts` | Renombre de los tests de `ficheros`; tests del cable de `arbol` y `fichero` con dobles. |
| `src/agent/turnoReal.ts` | `ficherosDelProyecto` gana el tope de profundidad como parámetro. |
| `src/agent/arbolDeProyecto.ts` (nuevo) | `arbolDeProyecto`, `leerFicheroDeProyecto`, `ordenarRutas`, `motivoDeRutaInaceptable`. |
| `src/agent/arbolDeProyecto.test.ts` (nuevo) | Contra un temporal real: filtros, orden, tope, binario, latin1, enlace fuera. |
| `apps/web/src/tipos.ts` | Redeclaración de los tipos nuevos. |
| `apps/web/src/store.ts` | `revision` (con «sin-empezar»), `arbol`, `contenidos`; se tiran con la sesión y sin cable. |
| `apps/web/src/numerarParche.ts` (nuevo) | Diff unificado → líneas con número viejo/nuevo. |
| `apps/web/src/arbolDeRutas.ts` (nuevo) | Lista de rutas → árbol de carpetas y hojas. |
| `apps/web/src/lenguajeDe.ts` (nuevo) | Extensión → lenguaje del resaltador. |
| `apps/web/src/componentes/Arbol.tsx` (nuevo) | Árbol plegable con filtro e insignia por hoja; compartido. |
| `apps/web/src/componentes/Revision.tsx` (renombre de `Ficheros.tsx`) | Cabecera con total, pila con cabeceras pegajosas, diff numerado, árbol de cambiados. |
| `apps/web/src/componentes/Visor.tsx` (nuevo) | `CodeBlock` + números de línea por CSS. |
| `apps/web/src/componentes/Ficheros.tsx` (nuevo) | Explorador: visor + árbol con filtro. |
| `apps/web/src/componentes/Pestanas.tsx` | Cuatro pestañas: Chat · Ficheros · Revisión · Trazas. |
| `apps/web/src/componentes/Transcript.tsx` | Dos ranuras, `ficheros` y `revision`. |
| `apps/web/src/App.tsx` | Estado de las dos pestañas, peticiones al montar y al terminar el turno. |
| `CLAUDE.md` | El párrafo de «Los ficheros que ha tocado una sesión» pasa a las dos pestañas. |

---

### Task 1: Renombrar el mensaje `ficheros` a `revision` y aceptar «sin-empezar» en el store

**Goal:** El mensaje del cable que lleva lo que la sesión tocó se llama `revision` en las dos direcciones, y el store del cliente guarda los tres `via` (hoy tira «sin-empezar» y la pestaña se queda en «consultando…»).

**Files:**
- Modify: `src/web/servidor/transporte.ts:126,434`
- Modify: `src/web/servidor/arranque.ts:160-163,871-909,1105-1110`
- Modify: `src/web/servidor/arranque.test.ts` (bloque «los ficheros de la sesión»)
- Modify: `apps/web/src/tipos.ts:151,323`
- Modify: `apps/web/src/store.ts:59,432-438,546,620`
- Modify: `apps/web/src/store.test.ts`
- Modify: `apps/web/src/App.tsx:92-131,585-593`

**Acceptance Criteria:**
- [ ] `grep -rn 'clase: "ficheros"' src apps/web/src` devuelve 0 líneas; `clase: "revision"` aparece en `transporte.ts` (2), `tipos.ts` (2), `arranque.ts` (≥3), `store.ts` (1).
- [ ] `store.aplicar({ clase: "revision", via: "sin-empezar", ficheros: [] })` deja `leer().revision` en `{ via: "sin-empezar", lista: [] }`.
- [ ] `npx vitest run apps/web/src/tipos.test.ts src/web/servidor/arranque.test.ts apps/web/src/store.test.ts` en verde.

**Verify:** `npm run typecheck && npx vitest run apps/web/src/tipos.test.ts apps/web/src/store.test.ts src/web/servidor/arranque.test.ts` → todo en verde.

**Steps:**

- [ ] **Step 1: El test del store que falla hoy**

Añadir a `apps/web/src/store.test.ts`, dentro del `describe` principal (el que ya usa `crearStoreDelCliente`):

```ts
  /**
   * El servidor contesta «sin-empezar» a una sesión recién abierta (`arranque.ts`), y el
   * store solo admitía «git» y «sin-marca»: el mensaje se tiraba y la pestaña se quedaba
   * en «consultando…» para siempre. Aquí se guardan los tres.
   */
  it("«revision» guarda los tres via, «sin-empezar» incluido", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "revision", via: "sin-empezar", ficheros: [] });
    expect(s.leer().revision).toEqual({ via: "sin-empezar", lista: [] });
    s.aplicar({ clase: "revision", via: "git", ficheros: [{ ruta: "a.xne", clase: "nuevo", mas: 1, menos: 0 }] });
    expect(s.leer().revision).toEqual({ via: "git", lista: [{ ruta: "a.xne", clase: "nuevo", mas: 1, menos: 0 }] });
  });
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run apps/web/src/store.test.ts -t "sin-empezar incluido"`
Expected: FAIL (`revision` no existe en el estado / error de tipos de `clase: "revision"`).

- [ ] **Step 3: El host — `transporte.ts`**

Línea 126, sustituir:
```ts
  | { clase: "ficheros"; via: "git" | "sin-marca" | "sin-empezar"; ficheros: FicheroTocado[] }
```
por
```ts
  | { clase: "revision"; via: "git" | "sin-marca" | "sin-empezar"; ficheros: FicheroTocado[] }
```
Línea 434, sustituir `| { clase: "ficheros"; ruta?: string }` por `| { clase: "revision"; ruta?: string }` y su comentario por `/** Pide lo que la sesión abierta ha tocado, o el parche de un fichero concreto. */`.

- [ ] **Step 4: El host — `arranque.ts`**

Renombrar `atenderFicheros` → `atenderRevision` (definición en la línea 871 y llamada en la 1106). Dentro de ella, los tres `emitir({ clase: "ficheros", …})` pasan a `clase: "revision"`. En el despacho (línea 1105): `mensaje.clase === "ficheros"` → `mensaje.clase === "revision"`.

- [ ] **Step 5: El host — `arranque.test.ts`**

```bash
sed -i '' 's/{ clase: "ficheros" }/{ clase: "revision" }/g; s/{ clase: "ficheros", ruta:/{ clase: "revision", ruta:/g; s/x.clase === "ficheros"/x.clase === "revision"/g' src/web/servidor/arranque.test.ts
```
Comprobar con `grep -n '"ficheros"' src/web/servidor/arranque.test.ts` que solo quedan las apariciones del campo `ficheros:` de los payloads (`ficheros: [...]`, `m.ficheros`), nunca `clase`.

- [ ] **Step 6: El cliente — `tipos.ts`**

Línea 151: `| { clase: "ficheros"; via: …; ficheros: FicheroTocado[] }` → `| { clase: "revision"; via: …; ficheros: FicheroTocado[] }`. Línea 323: `| { clase: "ficheros"; ruta?: string }` → `| { clase: "revision"; ruta?: string }`.

- [ ] **Step 7: El cliente — `store.ts`**

Línea 59, el campo del estado:
```ts
  /**
   * Lo que la sesión ha tocado (pestaña Revisión). Ausente = todavía no se ha pedido. Los
   * TRES `via` se guardan: «sin-empezar» se tiraba y la pestaña se quedaba consultando.
   * Los parches se guardan por ruta según se piden: uno grande no se vuelve a traer por
   * plegar y desplegar la fila.
   */
  revision?: { via: "git" | "sin-marca" | "sin-empezar"; lista: FicheroTocado[] };
```
Líneas 432-438, el caso:
```ts
        case "revision": {
          const m = mensaje as { via?: unknown; ficheros?: unknown };
          if (m.via !== "git" && m.via !== "sin-marca" && m.via !== "sin-empezar") return;
          if (!Array.isArray(m.ficheros)) return;
          const lista = m.ficheros.filter(esFicheroTocado).map((f) => ({ ...f }));
          mutar({ revision: { via: m.via, lista } });
          return;
        }
```
Línea 546: `...(cambioDeSesion ? { ficheros: undefined, parches: undefined } : {})` → `...(cambioDeSesion ? { revision: undefined, parches: undefined } : {})`. Línea 620: `ficheros: undefined,` → `revision: undefined,`.

- [ ] **Step 8: El cliente — `App.tsx`**

`pedirFicheros` → `pedirRevision` con `enviar({ clase: "revision" })`; en `abrirFichero`, `enviar({ clase: "ficheros", ruta })` → `enviar({ clase: "revision", ruta })`; en el efecto del flanco de fin, `pedirFicheros()` → `pedirRevision()` y el segundo `enviar` igual. En el JSX (línea ~587): `estado.ficheros` → `estado.revision` en las dos apariciones, y `alRecargar={pedirRevision}`. El literal `pestana !== "ficheros"` se queda como está: la pestaña se renombra en la Task 8.

- [ ] **Step 9: Verificar**

Run: `npm run typecheck && npx vitest run apps/web/src/tipos.test.ts apps/web/src/store.test.ts src/web/servidor/arranque.test.ts apps/web/src/App.test.tsx`
Expected: todo en verde. `grep -rn 'clase: "ficheros"' src apps/web/src` → sin resultados.

- [ ] **Step 10: Commit**

```bash
git add src/web/servidor/transporte.ts src/web/servidor/arranque.ts src/web/servidor/arranque.test.ts apps/web/src/tipos.ts apps/web/src/store.ts apps/web/src/store.test.ts apps/web/src/App.tsx
git commit -m "refactor(web): el mensaje de lo que tocó la sesión se llama «revision», y el store guarda «sin-empezar»"
```

```json:metadata
{"files": ["src/web/servidor/transporte.ts", "src/web/servidor/arranque.ts", "src/web/servidor/arranque.test.ts", "apps/web/src/tipos.ts", "apps/web/src/store.ts", "apps/web/src/store.test.ts", "apps/web/src/App.tsx"], "verifyCommand": "npm run typecheck && npx vitest run apps/web/src/tipos.test.ts apps/web/src/store.test.ts src/web/servidor/arranque.test.ts apps/web/src/App.test.tsx", "acceptanceCriteria": ["ningún clase: \"ficheros\" en src ni apps/web/src", "el store guarda via sin-empezar", "tipos.test, store.test y arranque.test en verde"], "modelTier": "standard"}
```

---

### Task 2: `numerarParche` — el diff unificado con dos columnas de número

**Goal:** Una función pura en el cliente que convierte el texto de un parche de git en líneas tipadas con número viejo y nuevo, cortando la cabecera de git.

**Files:**
- Create: `apps/web/src/numerarParche.ts`
- Test: `apps/web/src/numerarParche.test.ts`

**Acceptance Criteria:**
- [ ] Dos tramos `@@` reinician los contadores en cada uno; `+` avanza solo `nuevo`, `-` solo `viejo`, contexto los dos.
- [ ] `\ No newline at end of file` sale como `nota` sin número y sin avanzar nada.
- [ ] Sin ningún `@@` todas las líneas salen sin número y nada se corta.
- [ ] La cabecera `diff --git`/`index`/`---`/`+++` no aparece en la salida cuando hay `@@`.

**Verify:** `npx vitest run apps/web/src/numerarParche.test.ts` → 5 tests en verde.

**Steps:**

- [ ] **Step 1: El test**

`apps/web/src/numerarParche.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { numerarParche } from "./numerarParche.js";

describe("numerarParche", () => {
  it("numera un tramo: contexto avanza los dos, «-» solo el viejo, «+» solo el nuevo", () => {
    const parche = "diff --git a/a.js b/a.js\nindex 1..2 100644\n--- a/a.js\n+++ b/a.js\n@@ -3,3 +3,4 @@\n uno\n-dos\n+DOS\n+dos y medio\n tres";
    expect(numerarParche(parche)).toEqual([
      { tipo: "tramo", texto: "@@ -3,3 +3,4 @@" },
      { tipo: "contexto", viejo: 3, nuevo: 3, texto: "uno" },
      { tipo: "menos", viejo: 4, texto: "dos" },
      { tipo: "mas", nuevo: 4, texto: "DOS" },
      { tipo: "mas", nuevo: 5, texto: "dos y medio" },
      { tipo: "contexto", viejo: 5, nuevo: 6, texto: "tres" },
    ]);
  });

  it("un segundo tramo reinicia los contadores con sus cabeceras", () => {
    const parche = "@@ -1 +1 @@\n-a\n+b\n@@ -40,2 +40,2 @@\n c\n-d\n+e";
    const lineas = numerarParche(parche);
    expect(lineas[3]).toEqual({ tipo: "tramo", texto: "@@ -40,2 +40,2 @@" });
    expect(lineas[4]).toEqual({ tipo: "contexto", viejo: 40, nuevo: 40, texto: "c" });
    expect(lineas[5]).toEqual({ tipo: "menos", viejo: 41, texto: "d" });
    expect(lineas[6]).toEqual({ tipo: "mas", nuevo: 41, texto: "e" });
  });

  it("solo altas: la columna vieja va vacía", () => {
    expect(numerarParche("@@ -0,0 +1,2 @@\n+x\n+y")).toEqual([
      { tipo: "tramo", texto: "@@ -0,0 +1,2 @@" },
      { tipo: "mas", nuevo: 1, texto: "x" },
      { tipo: "mas", nuevo: 2, texto: "y" },
    ]);
  });

  it("la nota de fin de fichero no avanza ningún contador", () => {
    expect(numerarParche("@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+a\n")).toEqual([
      { tipo: "tramo", texto: "@@ -1 +1 @@" },
      { tipo: "menos", viejo: 1, texto: "a" },
      { tipo: "nota", texto: "No newline at end of file" },
      { tipo: "mas", nuevo: 1, texto: "a" },
    ]);
  });

  /** Un binario o un cambio de modo: es todo lo que git tiene que decir, y no se numera. */
  it("sin ningún «@@» no se corta nada y nadie lleva número", () => {
    expect(numerarParche("diff --git a/x b/x\nBinary files differ")).toEqual([
      { tipo: "contexto", texto: "diff --git a/x b/x" },
      { tipo: "contexto", texto: "Binary files differ" },
    ]);
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run apps/web/src/numerarParche.test.ts`
Expected: FAIL («Cannot find module './numerarParche.js'»).

- [ ] **Step 3: La función**

`apps/web/src/numerarParche.ts`:
```ts
/**
 * El parche unificado de git, línea a línea y con sus DOS números: el del fichero viejo y
 * el del nuevo. Es lo que hace que un diff se pueda leer como un fichero y no como una
 * lista de cambios sueltos.
 *
 * Reglas, todas del formato unificado:
 * - Cada `@@ -a,b +c,d @@` fija viejo = a, nuevo = c. Sin la coma (`-a +c`) vale igual.
 * - Contexto (empieza por espacio) avanza los dos; `+` solo el nuevo; `-` solo el viejo.
 * - `\ No newline at end of file` es una nota: no es línea de nadie y no avanza nada.
 * - La cabecera de git (`diff --git`, `index`, `---`, `+++`) se corta: cuatro líneas de
 *   ruido por fichero que no dicen nada que no diga el nombre de la fila. Se corta en el
 *   primer `@@`, y si no hay ninguno —un binario, un cambio de modo— no se corta nada y
 *   nadie lleva número: eso ES todo lo que git tiene que decir.
 */
export type TipoDeLinea = "tramo" | "contexto" | "mas" | "menos" | "nota";

export interface LineaNumerada {
  tipo: TipoDeLinea;
  viejo?: number;
  nuevo?: number;
  /** El texto SIN el carácter de prefijo del formato (` `, `+`, `-`, `\ `). */
  texto: string;
}

const CABECERA_DE_TRAMO = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function numerarParche(texto: string): LineaNumerada[] {
  const lineas = texto.split("\n");
  // El salto final del parche no es una línea vacía de contexto.
  if (lineas.at(-1) === "") lineas.pop();

  const primerTramo = lineas.findIndex((l) => CABECERA_DE_TRAMO.test(l));
  if (primerTramo === -1) return lineas.map((l) => ({ tipo: "contexto", texto: l }));

  let viejo = 0;
  let nuevo = 0;
  const salida: LineaNumerada[] = [];
  for (const linea of lineas.slice(primerTramo)) {
    const tramo = CABECERA_DE_TRAMO.exec(linea);
    if (tramo !== null) {
      viejo = Number(tramo[1]);
      nuevo = Number(tramo[2]);
      salida.push({ tipo: "tramo", texto: linea });
    } else if (linea.startsWith("\\")) {
      salida.push({ tipo: "nota", texto: linea.slice(2) });
    } else if (linea.startsWith("+")) {
      salida.push({ tipo: "mas", nuevo: nuevo++, texto: linea.slice(1) });
    } else if (linea.startsWith("-")) {
      salida.push({ tipo: "menos", viejo: viejo++, texto: linea.slice(1) });
    } else {
      salida.push({ tipo: "contexto", viejo: viejo++, nuevo: nuevo++, texto: linea.slice(1) });
    }
  }
  return salida;
}
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run apps/web/src/numerarParche.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/numerarParche.ts apps/web/src/numerarParche.test.ts
git commit -m "feat(web): numerarParche — el diff unificado con número de línea viejo y nuevo"
```

```json:metadata
{"files": ["apps/web/src/numerarParche.ts", "apps/web/src/numerarParche.test.ts"], "verifyCommand": "npx vitest run apps/web/src/numerarParche.test.ts", "acceptanceCriteria": ["dos tramos reinician contadores", "la nota de fin de fichero no avanza", "sin @@ nada se numera ni se corta", "la cabecera de git no sale"], "modelTier": "mechanical"}
```

---

### Task 3: `arbolDeRutas` — de una lista de rutas a un árbol

**Goal:** Una función pura en el cliente que agrupa rutas `a/b/c.xne` en nodos de carpeta y hoja, conservando el orden de llegada.

**Files:**
- Create: `apps/web/src/arbolDeRutas.ts`
- Test: `apps/web/src/arbolDeRutas.test.ts`

**Acceptance Criteria:**
- [ ] `["app.xml", "src/a.xne", "src/b.xne"]` → `[hoja app.xml, carpeta src [a.xne, b.xne]]`.
- [ ] Una carpeta con tres niveles produce nodos anidados con `ruta` acumulada (`src/ui/x.css` → `src` → `src/ui` → `src/ui/x.css`).
- [ ] Lista vacía → `[]`; una sola ruta sin carpeta → una hoja.

**Verify:** `npx vitest run apps/web/src/arbolDeRutas.test.ts` → 3 tests en verde.

**Steps:**

- [ ] **Step 1: El test**

`apps/web/src/arbolDeRutas.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { arbolDeRutas } from "./arbolDeRutas.js";

describe("arbolDeRutas", () => {
  it("agrupa por carpeta y conserva el orden en que llegan", () => {
    expect(arbolDeRutas(["app.xml", "src/a.xne", "src/b.xne"])).toEqual([
      { nombre: "app.xml", ruta: "app.xml" },
      {
        nombre: "src",
        ruta: "src",
        hijos: [
          { nombre: "a.xne", ruta: "src/a.xne" },
          { nombre: "b.xne", ruta: "src/b.xne" },
        ],
      },
    ]);
  });

  it("anida varios niveles con la ruta acumulada en cada nodo", () => {
    expect(arbolDeRutas(["src/ui/x.css"])).toEqual([
      {
        nombre: "src",
        ruta: "src",
        hijos: [{ nombre: "ui", ruta: "src/ui", hijos: [{ nombre: "x.css", ruta: "src/ui/x.css" }] }],
      },
    ]);
  });

  it("vacío da vacío, y una ruta suelta es una hoja", () => {
    expect(arbolDeRutas([])).toEqual([]);
    expect(arbolDeRutas(["a.js"])).toEqual([{ nombre: "a.js", ruta: "a.js" }]);
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run apps/web/src/arbolDeRutas.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: La función**

`apps/web/src/arbolDeRutas.ts`:
```ts
/**
 * Un nodo del árbol de ficheros. `hijos` PRESENTE significa carpeta (aunque esté vacía);
 * ausente, hoja. `ruta` es la acumulada desde la raíz, sin barra inicial, que es la forma
 * en que viajan las rutas por el cable (`src/app.xne`).
 */
export interface NodoDelArbol {
  nombre: string;
  ruta: string;
  hijos?: NodoDelArbol[];
}

/**
 * De la lista plana que manda el servidor al árbol que se pinta. El ORDEN es el de llegada:
 * quien ordena es quien lista (el host, carpetas antes que ficheros; git, alfabético), y
 * reordenar aquí sería una segunda opinión.
 */
export function arbolDeRutas(rutas: readonly string[]): NodoDelArbol[] {
  const raiz: NodoDelArbol[] = [];
  for (const ruta of rutas) {
    const segmentos = ruta.split("/");
    let nivel = raiz;
    let acumulada = "";
    segmentos.forEach((segmento, i) => {
      acumulada = acumulada === "" ? segmento : `${acumulada}/${segmento}`;
      const esHoja = i === segmentos.length - 1;
      let nodo = nivel.find((n) => n.nombre === segmento && (n.hijos !== undefined) === !esHoja);
      if (nodo === undefined) {
        nodo = esHoja ? { nombre: segmento, ruta: acumulada } : { nombre: segmento, ruta: acumulada, hijos: [] };
        nivel.push(nodo);
      }
      if (!esHoja) nivel = nodo.hijos!;
    });
  }
  return raiz;
}
```

- [ ] **Step 4: Verificar y commit**

Run: `npx vitest run apps/web/src/arbolDeRutas.test.ts` → 3 passed.
```bash
git add apps/web/src/arbolDeRutas.ts apps/web/src/arbolDeRutas.test.ts
git commit -m "feat(web): arbolDeRutas — la lista plana del cable como árbol de carpetas"
```

```json:metadata
{"files": ["apps/web/src/arbolDeRutas.ts", "apps/web/src/arbolDeRutas.test.ts"], "verifyCommand": "npx vitest run apps/web/src/arbolDeRutas.test.ts", "acceptanceCriteria": ["agrupa por carpeta conservando el orden", "anida con ruta acumulada", "vacío y hoja suelta"], "modelTier": "mechanical"}
```

---

### Task 4: `Arbol.tsx` — el árbol plegable compartido, con filtro e insignia

**Goal:** Un componente que pinta `NodoDelArbol[]` con carpetas plegables (abiertas las del primer nivel al arrancar), filtro por subcadena de la ruta, hoja elegida marcada con `aria-current`, y una insignia opcional por hoja.

**Files:**
- Create: `apps/web/src/componentes/Arbol.tsx`
- Create: `apps/web/src/componentes/Arbol.module.css`
- Test: `apps/web/src/componentes/Arbol.test.tsx`

**Acceptance Criteria:**
- [ ] Las carpetas del primer nivel están abiertas al montar; una de segundo nivel, cerrada hasta pulsarla (`aria-expanded`).
- [ ] Con `filtro="cli"`, la hoja `src/Clientes.xne` se ve y `src/Pedidos.xne` no; todas las carpetas con alguna hoja visible están abiertas.
- [ ] Pulsar una hoja llama `alElegir(ruta)`; la hoja `elegida` lleva `aria-current="true"`.
- [ ] `insignia(ruta)` se pinta dentro de la fila de la hoja.
- [ ] Ningún color literal en `Arbol.module.css`.

**Verify:** `npx vitest run apps/web/src/componentes/Arbol.test.tsx apps/web/src/componentes/Barra.test.tsx` → en verde.

**Steps:**

- [ ] **Step 1: El test**

`apps/web/src/componentes/Arbol.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Arbol } from "./Arbol.js";
import { arbolDeRutas } from "../arbolDeRutas.js";

afterEach(cleanup);

const NODOS = arbolDeRutas(["app.xml", "src/Clientes.xne", "src/Pedidos.xne", "src/ui/base.css"]);

describe("Arbol", () => {
  it("las carpetas del primer nivel nacen abiertas; las de dentro, cerradas hasta pulsarlas", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} />);
    expect(screen.getByRole("treeitem", { name: "src" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("treeitem", { name: "ui" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("treeitem", { name: "base.css" })).toBeNull();
    fireEvent.click(screen.getByRole("treeitem", { name: "ui" }));
    expect(screen.getByRole("treeitem", { name: "base.css" })).toBeTruthy();
  });

  it("el filtro mira la ruta completa sin mayúsculas, y abre las carpetas con alguna hoja que casa", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} filtro="CLI" />);
    expect(screen.getByRole("treeitem", { name: "Clientes.xne" })).toBeTruthy();
    expect(screen.queryByRole("treeitem", { name: "Pedidos.xne" })).toBeNull();
    expect(screen.queryByRole("treeitem", { name: "app.xml" })).toBeNull();
    // «ui» no tiene nada que case: no se pinta.
    expect(screen.queryByRole("treeitem", { name: "ui" })).toBeNull();
  });

  it("pulsar una hoja la reporta hacia arriba, y la elegida se marca con aria-current", () => {
    const alElegir = vi.fn();
    render(<Arbol nodos={NODOS} alElegir={alElegir} elegida="src/Pedidos.xne" />);
    fireEvent.click(screen.getByRole("treeitem", { name: "Clientes.xne" }));
    expect(alElegir).toHaveBeenCalledWith("src/Clientes.xne");
    expect(screen.getByRole("treeitem", { name: "Pedidos.xne" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("treeitem", { name: "Clientes.xne" }).getAttribute("aria-current")).toBeNull();
  });

  it("la insignia se pinta dentro de la fila de la hoja", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} insignia={(ruta) => <span data-testid="insignia">{ruta.endsWith(".xml") ? "M" : "A"}</span>} />);
    expect(screen.getAllByTestId("insignia").length).toBe(3); // app.xml, Clientes, Pedidos (base.css está plegada)
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run apps/web/src/componentes/Arbol.test.tsx` → FAIL (módulo no existe).

- [ ] **Step 3: El componente**

`apps/web/src/componentes/Arbol.tsx`:
```tsx
import { useState, type ReactNode } from "react";
import type { NodoDelArbol } from "../arbolDeRutas.js";
import estilos from "./Arbol.module.css";

/**
 * El árbol de ficheros que comparten Ficheros (el proyecto entero) y Revisión (solo los
 * tocados). Lo que cambia entre las dos es qué hay en cada hoja —`insignia`— y qué pasa al
 * pulsarla; el plegado, el filtro y la marca de elegida son los mismos.
 *
 * - Las carpetas del PRIMER nivel nacen abiertas y las de dentro cerradas: abrirlo todo en
 *   un proyecto de cien ficheros es una lista; cerrarlo todo obliga a dos clics para ver
 *   cualquier cosa.
 * - El filtro es por subcadena de la ruta COMPLETA y sin distinguir mayúsculas, y mientras
 *   hay filtro todas las carpetas con alguna hoja que casa se enseñan abiertas: filtrar es
 *   buscar, y una coincidencia dentro de una carpeta plegada no se ve.
 * - La elegida lleva `aria-current` además del fondo, como la fila activa de la barra: el
 *   fondo solo no basta cuando la de al lado está en `:hover`.
 */
export function Arbol({
  nodos,
  elegida,
  alElegir,
  filtro = "",
  insignia,
}: {
  nodos: readonly NodoDelArbol[];
  elegida?: string;
  alElegir: (ruta: string) => void;
  /** Ya en minúsculas o no: se normaliza aquí. Vacío = sin filtro. */
  filtro?: string;
  insignia?: (ruta: string) => ReactNode;
}) {
  // Las carpetas que el usuario ha CAMBIADO respecto a su estado inicial (abierta en el
  // primer nivel, cerrada dentro). Guardar el cambio y no el estado es lo que hace que un
  // árbol nuevo del servidor no cierre lo que estaba abierto.
  const [cambiadas, setCambiadas] = useState<ReadonlySet<string>>(new Set());
  const aguja = filtro.trim().toLowerCase();

  const casa = (nodo: NodoDelArbol): boolean =>
    nodo.hijos === undefined ? nodo.ruta.toLowerCase().includes(aguja) : nodo.hijos.some(casa);

  const abierta = (nodo: NodoDelArbol, nivel: number): boolean => {
    if (aguja !== "") return true;
    const porOmision = nivel === 0;
    return cambiadas.has(nodo.ruta) ? !porOmision : porOmision;
  };

  const alternar = (ruta: string): void =>
    setCambiadas((previas) => {
      const siguientes = new Set(previas);
      if (siguientes.has(ruta)) siguientes.delete(ruta);
      else siguientes.add(ruta);
      return siguientes;
    });

  const pintar = (lista: readonly NodoDelArbol[], nivel: number): ReactNode => (
    <ul className={estilos.nivel} role={nivel === 0 ? "tree" : "group"}>
      {lista.filter(casa).map((nodo) =>
        nodo.hijos === undefined ? (
          <li key={nodo.ruta} role="none">
            <button
              type="button"
              role="treeitem"
              className={estilos.hoja}
              style={{ paddingLeft: 8 + nivel * 14 }}
              {...(nodo.ruta === elegida ? { "aria-current": "true" as const } : {})}
              data-elegida={nodo.ruta === elegida ? "" : undefined}
              onClick={() => alElegir(nodo.ruta)}
            >
              {insignia === undefined ? null : <span className={estilos.insignia}>{insignia(nodo.ruta)}</span>}
              <span className={estilos.nombre}>{nodo.nombre}</span>
            </button>
          </li>
        ) : (
          <li key={nodo.ruta} role="none">
            <button
              type="button"
              role="treeitem"
              className={estilos.carpeta}
              style={{ paddingLeft: 8 + nivel * 14 }}
              aria-expanded={abierta(nodo, nivel)}
              onClick={() => alternar(nodo.ruta)}
            >
              <span className={estilos.flecha} aria-hidden="true">
                {abierta(nodo, nivel) ? "▾" : "▸"}
              </span>
              <span className={estilos.nombre}>{nodo.nombre}</span>
            </button>
            {abierta(nodo, nivel) ? pintar(nodo.hijos, nivel + 1) : null}
          </li>
        )
      )}
    </ul>
  );

  return pintar(nodos, 0);
}
```


`apps/web/src/componentes/Arbol.module.css`:
```css
/* Alias comprobados contra `estilos/design-platform.css`: label-primary/secondary/tertiary,
   interactive-bg-hover. `--xonecode-cian` es de `estilos/marca.css`. */

.nivel {
  margin: 0;
  padding: 0;
  list-style: none;
}

.hoja,
.carpeta {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 26px;
  padding: 2px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.carpeta {
  color: var(--dsw-alias-label-secondary);
}

.hoja:hover,
.carpeta:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

/* Dos señales, como la fila activa de la barra: fondo Y barra de acento, porque el fondo
   de elegida es el MISMO alias que el de hover de la fila de al lado. */
.hoja[data-elegida] {
  position: relative;
  background: var(--dsw-alias-interactive-bg-hover);
}

.hoja[data-elegida]::before {
  content: "";
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  width: 2px;
  border-radius: 2px;
  background: var(--xonecode-cian);
}

.flecha {
  flex: none;
  width: 10px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}

.insignia {
  flex: none;
  display: inline-flex;
}

.nombre {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 4: Ajustar el test a `treeitem` y verificar**

En `Arbol.test.tsx`, sustituir todas las apariciones de `getByRole("treeitem"` y `queryByRole("treeitem"` por `getByRole("treeitem"` / `queryByRole("treeitem"`.

Run: `npx vitest run apps/web/src/componentes/Arbol.test.tsx apps/web/src/componentes/Barra.test.tsx`
Expected: en verde (Barra.test recorre los `.module.css` buscando colores literales).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/componentes/Arbol.tsx apps/web/src/componentes/Arbol.module.css apps/web/src/componentes/Arbol.test.tsx
git commit -m "feat(web): Arbol — el árbol plegable con filtro que comparten Ficheros y Revisión"
```

```json:metadata
{"files": ["apps/web/src/componentes/Arbol.tsx", "apps/web/src/componentes/Arbol.module.css", "apps/web/src/componentes/Arbol.test.tsx"], "verifyCommand": "npx vitest run apps/web/src/componentes/Arbol.test.tsx apps/web/src/componentes/Barra.test.tsx", "acceptanceCriteria": ["primer nivel abierto, dentro cerrado", "filtro por subcadena abre carpetas con coincidencia", "alElegir y aria-current", "insignia por hoja", "sin colores literales"], "modelTier": "standard"}
```

---

### Task 5: `Revision.tsx` — la pila de diffs numerados con el árbol de cambiados

**Goal:** La pestaña Revisión: cabecera «Sesión» con el total, bloques apilados con cabecera pegajosa y diff numerado, los primeros `DESPLEGADOS_AL_ABRIR` abiertos solos, árbol de cambiados a la derecha; y `App` pasa de «una ruta abierta» a «un conjunto de desplegadas».

**Files:**
- Rename: `apps/web/src/componentes/Ficheros.tsx` → `apps/web/src/componentes/Revision.tsx` (y `.module.css`, `.test.tsx`)
- Modify: `apps/web/src/componentes/Revision.tsx` (reescritura del cuerpo con lista)
- Modify: `apps/web/src/componentes/Revision.module.css`
- Modify: `apps/web/src/componentes/Revision.test.tsx`
- Modify: `apps/web/src/App.tsx` (estado `desplegados`, efectos)

**Acceptance Criteria:**
- [ ] Con 10 ficheros y `desplegados` = los 8 primeros, hay 8 `aria-expanded="true"` y 2 `"false"`.
- [ ] La cabecera dice «Sesión» y el total `+Σ −Σ` (binarios aparte: «y N binarios»).
- [ ] Un bloque desplegado con parche pinta líneas con `data-tipo` y las dos columnas de número (`[data-viejo]`, `[data-nuevo]`).
- [ ] Pulsar la cabecera de un bloque plegado llama `alDesplegar(ruta)`; en uno desplegado, `alPlegar(ruta)`.
- [ ] Pulsar una hoja del árbol de la derecha llama `alDesplegar(ruta)`.
- [ ] Los tres avisos (`consultando`, `sin-empezar`, `sin-marca` con y sin `historica`) siguen pasando sus tests.
- [ ] `App`: al llegar la primera lista NO vacía, `desplegados` = primeras 8 rutas y se pide su parche (8 envíos `{clase:"revision", ruta}`); una lista vacía antes no inicializa nada; al cambiar de sesión (`revision` vuelve a `undefined`) se reinicia. Con test en `App.test.tsx`.

**Verify:** `npx vitest run apps/web/src/componentes/Revision.test.tsx apps/web/src/App.test.tsx apps/web/src/componentes/Barra.test.tsx` → en verde; `npm run typecheck`.

**Steps:**

- [ ] **Step 1: Renombrar los tres ficheros**

```bash
git mv apps/web/src/componentes/Ficheros.tsx apps/web/src/componentes/Revision.tsx
git mv apps/web/src/componentes/Ficheros.module.css apps/web/src/componentes/Revision.module.css
git mv apps/web/src/componentes/Ficheros.test.tsx apps/web/src/componentes/Revision.test.tsx
```

- [ ] **Step 2: Reescribir el test**

`apps/web/src/componentes/Revision.test.tsx` — conservar los cinco tests de avisos («sin-marca», «sin-empezar», «con git y lista vacía», «pide la lista al montar», «la sesión reabierta») cambiando `Ficheros` por `Revision`, `alAbrir={NADA}` por `desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA}`, y sustituir el resto por:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DESPLEGADOS_AL_ABRIR, Revision } from "./Revision.js";
import type { FicheroTocado } from "../tipos.js";

const NADA = () => {};
const VACIO: ReadonlySet<string> = new Set();

const diez = (): FicheroTocado[] =>
  Array.from({ length: 10 }, (_, i) => ({ ruta: `src/f${i}.xne`, clase: "modificado", mas: i, menos: 1 }));

describe("Revision: la pila", () => {
  afterEach(cleanup);

  it("la cabecera dice «Sesión» y suma el total, con los binarios aparte", () => {
    render(
      <Revision
        via="git"
        ficheros={[
          { ruta: "a.xne", clase: "modificado", mas: 10, menos: 3 },
          { ruta: "b.js", clase: "nuevo", mas: 5, menos: 1 },
          { ruta: "img/logo.png", clase: "nuevo" },
        ]}
        parches={{}}
        desplegados={VACIO}
        alDesplegar={NADA}
        alPlegar={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText("Sesión")).toBeTruthy();
    // +15 y −4 son únicos en pantalla: ningún fichero suelto suma eso.
    expect(screen.getByText("+15")).toBeTruthy();
    expect(screen.getByText("−4")).toBeTruthy();
    expect(screen.getByText(/y 1 binario/)).toBeTruthy();
  });

  it("los desplegados llevan aria-expanded=true y el resto false", () => {
    const abiertos = new Set(diez().slice(0, DESPLEGADOS_AL_ABRIR).map((f) => f.ruta));
    render(<Revision via="git" ficheros={diez()} parches={{}} desplegados={abiertos} alDesplegar={NADA} alPlegar={NADA} alRecargar={NADA} />);
    const cabeceras = screen.getAllByRole("button", { expanded: true });
    expect(cabeceras).toHaveLength(DESPLEGADOS_AL_ABRIR);
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(2);
  });

  it("pulsar la cabecera de uno plegado despliega; de uno desplegado, pliega", () => {
    const alDesplegar = vi.fn();
    const alPlegar = vi.fn();
    render(
      <Revision
        via="git"
        ficheros={[{ ruta: "a.xne", clase: "modificado", mas: 1, menos: 1 }, { ruta: "b.xne", clase: "nuevo", mas: 1, menos: 0 }]}
        parches={{}}
        desplegados={new Set(["a.xne"])}
        alDesplegar={alDesplegar}
        alPlegar={alPlegar}
        alRecargar={NADA}
      />
    );
    // La cabecera del bloque y la hoja del árbol comparten nombre: se elige la del bloque por su rol expandido.
    fireEvent.click(screen.getByRole("button", { name: /b\.xne/, expanded: false }));
    expect(alDesplegar).toHaveBeenCalledWith("b.xne");
    fireEvent.click(screen.getByRole("button", { name: /a\.xne/, expanded: true }));
    expect(alPlegar).toHaveBeenCalledWith("a.xne");
  });

  it("un bloque desplegado pinta el diff con las dos columnas de número", () => {
    const { container } = render(
      <Revision
        via="git"
        ficheros={[{ ruta: "a.js", clase: "modificado", mas: 1, menos: 1 }]}
        parches={{ "a.js": { texto: "--- a/a.js\n+++ b/a.js\n@@ -3,2 +3,2 @@\n uno\n-viejo\n+nuevo", recortado: false } }}
        desplegados={new Set(["a.js"])}
        alDesplegar={NADA}
        alPlegar={NADA}
        alRecargar={NADA}
      />
    );
    const tipos = [...container.querySelectorAll("[data-tipo]")].map((n) => n.getAttribute("data-tipo"));
    expect(tipos).toEqual(["tramo", "contexto", "menos", "mas"]);
    const contexto = container.querySelector('[data-tipo="contexto"]')!;
    expect(contexto.querySelector("[data-viejo]")!.textContent).toBe("3");
    expect(contexto.querySelector("[data-nuevo]")!.textContent).toBe("3");
    expect(container.querySelector('[data-tipo="menos"] [data-nuevo]')!.textContent).toBe("");
    expect(container.textContent).not.toContain("+++");
  });

  it("un binario dice «binario», no «+0 −0»", () => {
    render(<Revision via="git" ficheros={[{ ruta: "img/logo.png", clase: "nuevo" }]} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={NADA} />);
    expect(screen.getAllByText("binario").length).toBeGreaterThan(0);
    expect(screen.queryByText("+0")).toBeNull();
  });

  it("un parche recortado lo dice", () => {
    render(
      <Revision via="git" ficheros={[{ ruta: "a.js", clase: "modificado", mas: 9000, menos: 0 }]} parches={{ "a.js": { texto: "@@ -1 +1 @@\n+una", recortado: true } }} desplegados={new Set(["a.js"])} alDesplegar={NADA} alPlegar={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/se ha cortado/i)).toBeTruthy();
  });

  it("pulsar una hoja del árbol de la derecha despliega ese fichero", () => {
    const alDesplegar = vi.fn();
    render(
      <Revision via="git" ficheros={[{ ruta: "src/a.xne", clase: "modificado", mas: 1, menos: 1 }]} parches={{}} desplegados={VACIO} alDesplegar={alDesplegar} alPlegar={NADA} alRecargar={NADA} />
    );
    fireEvent.click(screen.getByRole("treeitem", { name: /a\.xne/ }));
    expect(alDesplegar).toHaveBeenCalledWith("src/a.xne");
  });
});
```

- [ ] **Step 3: Comprobar que falla**

Run: `npx vitest run apps/web/src/componentes/Revision.test.tsx` → FAIL (`Revision` no exportado, props distintas).

- [ ] **Step 4: El componente**

Sustituir el contenido de `apps/web/src/componentes/Revision.tsx` a partir de la firma (mantener la cabecera de comentario del fichero, actualizando «Los ficheros que ESTA sesión ha tocado» → «Revisión: los ficheros que ESTA sesión ha tocado, apilados con su diff»; conservar el párrafo de «sin marca»/«sin empezar»):

```tsx
import { useEffect, useRef } from "react";
import type { FicheroTocado } from "../tipos.js";
import { numerarParche } from "../numerarParche.js";
import { arbolDeRutas } from "../arbolDeRutas.js";
import { Arbol } from "./Arbol.js";
import estilos from "./Revision.module.css";

/**
 * Cuántos bloques se despliegan SOLOS al abrir la pestaña. Conserva la petición del parche
 * bajo demanda —un turno largo son megas— y aun así la pestaña se abre enseñando diffs y
 * no una lista de cabeceras. Lo aplica `App`, que es quien pide los parches.
 */
export const DESPLEGADOS_AL_ABRIR = 8;

export function Revision({
  via,
  ficheros,
  parches,
  desplegados,
  alDesplegar,
  alPlegar,
  alRecargar,
  historica,
}: {
  via?: "git" | "sin-marca" | "sin-empezar";
  historica?: boolean;
  ficheros: readonly FicheroTocado[];
  parches: Record<string, { texto: string; recortado: boolean }>;
  /** Las rutas con el diff a la vista. Quien las recuerda es `App`. */
  desplegados: ReadonlySet<string>;
  alDesplegar: (ruta: string) => void;
  alPlegar: (ruta: string) => void;
  alRecargar: () => void;
}) {
  useEffect(() => {
    alRecargar();
  }, [alRecargar]);

  // Para desplazar la pila hasta un bloque cuando se pulsa su hoja en el árbol.
  const bloques = useRef(new Map<string, HTMLElement>());

  if (via === undefined) {
    return <p className={estilos.aviso}>Consultando los ficheros de la sesión…</p>;
  }
  if (via === "sin-empezar") {
    return (
      <p className={estilos.aviso}>
        Esta sesión todavía no ha empezado: no ha tocado ningún fichero. En cuanto le mandes
        algo al agente, lo que escriba aparecerá aquí.
      </p>
    );
  }
  if (via === "sin-marca" && historica === true) {
    return (
      <p className={estilos.aviso}>
        Esta conversación se reabrió y no tiene foto del proyecto de cuando empezó, así que no
        hay con qué comparar lo que tocó entonces. No es que no hubiera cambios — es que no se
        puede saber. Lo que el agente escriba a partir de ahora sí aparecerá aquí.
      </p>
    );
  }
  if (via === "sin-marca") {
    return (
      <p className={estilos.aviso}>
        No se puede saber qué ha tocado esta sesión: hace falta que el proyecto sea un repositorio
        de git, y que la sesión se abriera después de que xonecode empezara a marcarlas. No es que
        no haya cambios — es que no hay con qué compararlos.
      </p>
    );
  }
  if (ficheros.length === 0) {
    return <p className={estilos.aviso}>Esta sesión todavía no ha tocado ningún fichero.</p>;
  }

  const conCuenta = ficheros.filter((f) => f.mas !== undefined || f.menos !== undefined);
  const binarios = ficheros.length - conCuenta.length;
  const totalMas = conCuenta.reduce((s, f) => s + (f.mas ?? 0), 0);
  const totalMenos = conCuenta.reduce((s, f) => s + (f.menos ?? 0), 0);
  const claseDe = new Map(ficheros.map((f) => [f.ruta, f.clase] as const));

  const irA = (ruta: string): void => {
    alDesplegar(ruta);
    // Tras el render que despliega. Ni `requestAnimationFrame` ni `scrollIntoView` se dan
    // por hechos: en jsdom el segundo no existe.
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => bloques.current.get(ruta)?.scrollIntoView?.({ block: "start" }));
    }
  };

  return (
    <div className={estilos.revision}>
      <div className={estilos.pila}>
        {/* «Sesión» es el hueco del selector de turno que vendrá: la foto de git es de la
            sesión entera (`agent/sesionGit.ts`), y afirmar «último turno» aquí sería falso. */}
        <div className={estilos.cabecera}>
          <span className={estilos.alcance}>Sesión</span>
          <span className={estilos.total}>
            <span className={estilos.mas}>+{totalMas}</span> <span className={estilos.menos}>−{totalMenos}</span>
            {binarios > 0 ? (
              <span className={estilos.binarios}>
                {" "}y {binarios} {binarios === 1 ? "binario" : "binarios"}
              </span>
            ) : null}
          </span>
          <button type="button" className={estilos.recargar} onClick={alRecargar}>
            Volver a mirar
          </button>
        </div>

        {ficheros.map((f) => {
          const abierto = desplegados.has(f.ruta);
          const parche = abierto ? parches[f.ruta] : undefined;
          return (
            <section
              key={f.ruta}
              className={estilos.bloque}
              ref={(el) => {
                if (el === null) bloques.current.delete(f.ruta);
                else bloques.current.set(f.ruta, el);
              }}
            >
              {/* La cabecera del bloque es PEGAJOSA: en un diff de trescientas líneas hay
                  que seguir sabiendo de qué fichero es sin volver arriba. */}
              <button
                type="button"
                className={estilos.cabeceraDeBloque}
                aria-expanded={abierto}
                onClick={() => (abierto ? alPlegar(f.ruta) : alDesplegar(f.ruta))}
              >
                <span className={estilos.clase} data-clase={f.clase} aria-label={f.clase}>
                  {f.clase === "nuevo" ? "A" : f.clase === "borrado" ? "D" : "M"}
                </span>
                <span className={estilos.ruta}>
                  {carpeta(f.ruta) === "" ? null : <span className={estilos.carpeta}>{carpeta(f.ruta)}</span>}
                  <span className={estilos.hoja}>{hoja(f.ruta)}</span>
                </span>
                {f.mas === undefined && f.menos === undefined ? (
                  <span className={estilos.binario}>binario</span>
                ) : (
                  <span className={estilos.cuenta}>
                    <span className={estilos.mas}>+{f.mas ?? 0}</span> <span className={estilos.menos}>−{f.menos ?? 0}</span>
                  </span>
                )}
              </button>

              {abierto ? (
                parche === undefined ? (
                  <p className={estilos.aviso}>Trayendo el diff de {f.ruta}…</p>
                ) : parche.texto === "" ? (
                  <p className={estilos.aviso}>Sin diff que enseñar para este fichero.</p>
                ) : (
                  <div className={estilos.parche}>
                    {numerarParche(parche.texto).map((linea, i) => (
                      <div key={i} className={estilos.linea} data-tipo={linea.tipo}>
                        <span className={estilos.numero} data-viejo="">
                          {linea.viejo ?? ""}
                        </span>
                        <span className={estilos.numero} data-nuevo="">
                          {linea.nuevo ?? ""}
                        </span>
                        <span className={estilos.texto}>{linea.texto === "" ? " " : linea.texto}</span>
                      </div>
                    ))}
                    {parche.recortado ? (
                      <p className={estilos.aviso}>El diff es demasiado grande y se ha cortado: míralo en tu editor.</p>
                    ) : null}
                  </div>
                )
              ) : null}
            </section>
          );
        })}
      </div>

      {/* El índice, a la derecha: los mismos ficheros como árbol, con su letra de estado.
          Pulsar uno despliega su bloque y desplaza la pila hasta él. */}
      <aside className={estilos.indice} aria-label="Ficheros cambiados">
        <Arbol
          nodos={arbolDeRutas(ficheros.map((f) => f.ruta))}
          alElegir={irA}
          insignia={(ruta) => {
            const clase = claseDe.get(ruta) ?? "modificado";
            return (
              <span className={estilos.clase} data-clase={clase} aria-label={clase}>
                {clase === "nuevo" ? "A" : clase === "borrado" ? "D" : "M"}
              </span>
            );
          }}
        />
      </aside>
    </div>
  );
}

function carpeta(ruta: string): string {
  const corte = ruta.lastIndexOf("/");
  return corte === -1 ? "" : ruta.slice(0, corte + 1);
}

function hoja(ruta: string): string {
  const corte = ruta.lastIndexOf("/");
  return corte === -1 ? ruta : ruta.slice(corte + 1);
}
```

Borrar de este fichero `lineasDeParche` y `tipoDeLinea` (los sustituye `numerarParche`). Si algún otro fichero importaba `lineasDeParche`, `npm run typecheck` lo dirá; hoy solo lo usaba su test.

- [ ] **Step 5: La hoja de estilos**

Sustituir `apps/web/src/componentes/Revision.module.css` entero. Conservar del original los bloques `.aviso`, `.recargar`, `.recargar:hover`, `.clase` y sus tres `[data-clase]`, `.ruta`, `.carpeta`, `.hoja`, `.cuenta`, `.binario`, `.mas`, `.menos` (con sus comentarios) y sustituir el resto por:

```css
/* Dos columnas: la PILA de diffs a la izquierda (cede y scrollea) y el índice a la
   derecha (no cede). `min-height: 0` por lo que documenta `Maqueta.tsx` para `.viewArea`;
   `container-type` porque lo que decide si caben dos columnas es el ancho de ESTA caja,
   no el de la ventana — la barra lateral desplegada son 280 px que la ventana sí cuenta. */
.revision {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  container-type: inline-size;
}

.pila {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
}

.indice {
  flex: 0 0 260px;
  min-width: 0;
  overflow-y: auto;
  padding: 8px;
  border-left: 0.5px solid var(--dsw-alias-border-l2);
}

/* Estrecho: el índice se va y queda la pila, que ya lleva el nombre de cada fichero en su
   cabecera pegajosa — no se pierde el «dónde estoy». */
@container (max-width: 720px) {
  .indice {
    display: none;
  }
}

.cabecera {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.alcance {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.total {
  flex: 1;
  font-family: var(--ds-font-family-code);
  font-size: 12px;
}

.binarios {
  color: var(--dsw-alias-label-tertiary);
}

.bloque {
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}

/* La cabecera del bloque, pegajosa y opaca: pasa por encima del diff al scrollear. */
.cabeceraDeBloque {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 16px;
  border: none;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.cabeceraDeBloque:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.parche {
  padding: 4px 0 8px;
}

/* Fila del diff: número viejo, número nuevo, texto. Los números no se seleccionan, para
   que copiar un trozo del diff no arrastre la numeración. */
.linea {
  display: grid;
  grid-template-columns: 4ch 4ch 1fr;
  gap: 0 12px;
  padding: 0 16px;
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}

.numero {
  text-align: right;
  color: var(--dsw-alias-label-tertiary);
  user-select: none;
}

.texto {
  white-space: pre;
}

.linea[data-tipo="tramo"] {
  color: var(--dsw-alias-label-tertiary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-tertiary) 45%, var(--dsw-alias-bg-layer-1));
}

.linea[data-tipo="nota"] {
  color: var(--dsw-alias-label-tertiary);
  font-style: italic;
}

/* Texto en `label-primary` sobre el fondo de estado al 45 %, mezclado contra `bg-layer-1`:
   la misma medición que documenta `Aprobacion.module.css`. */
.linea[data-tipo="mas"] {
  color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-secondary) 45%, var(--dsw-alias-bg-layer-1));
}

.linea[data-tipo="menos"] {
  color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-secondary) 45%, var(--dsw-alias-bg-layer-1));
}
```

- [ ] **Step 6: `App.tsx` — de una ruta abierta a un conjunto de desplegadas**

Sustituir el import `import { Ficheros } from "./componentes/Ficheros.js";` por `import { DESPLEGADOS_AL_ABRIR, Revision } from "./componentes/Revision.js";`.

Sustituir el estado `ficheroAbierto`/`setFicheroAbierto` y `abrirFichero` por:

```tsx
  /**
   * Las rutas con el diff desplegado en Revisión. `undefined` = la lista todavía no ha
   * llegado (o la sesión cambió y se reinicia): al llegar, se despliegan solas las
   * `DESPLEGADOS_AL_ABRIR` primeras y se pide su parche. Vive aquí y no en el store por lo
   * mismo que `pestana`: es de esta ventana, no del servidor.
   */
  const [desplegados, setDesplegados] = useState<ReadonlySet<string> | undefined>(undefined);

  const pedirRevision = useCallback(() => {
    void enviar({ clase: "revision" });
  }, [enviar]);

  const pedirParche = useCallback(
    (ruta: string) => {
      void enviar({ clase: "revision", ruta });
    },
    [enviar]
  );

  const desplegar = useCallback(
    (ruta: string) => {
      setDesplegados((previas) => new Set([...(previas ?? []), ruta]));
      pedirParche(ruta);
    },
    [pedirParche]
  );

  const plegar = useCallback((ruta: string) => {
    setDesplegados((previas) => {
      const siguientes = new Set(previas ?? []);
      siguientes.delete(ruta);
      return siguientes;
    });
  }, []);

  // El despliegue inicial: solo la PRIMERA vez que llega una lista CON ficheros de esta
  // sesión. Si el store la tira (otra sesión, cable caído), `revision` vuelve a
  // `undefined` y esto se reinicia con ella. Y una lista vacía no inicializa nada: una
  // sesión nueva contesta «sin-empezar» con lista vacía, y si eso fijara el conjunto en
  // vacío la lista de después del primer turno ya no desplegaría ninguno.
  const listaDeRevision = estado.revision?.lista;
  useEffect(() => {
    if (listaDeRevision === undefined) {
      setDesplegados(undefined);
      return;
    }
    if (desplegados !== undefined || listaDeRevision.length === 0) return;
    const primeros = listaDeRevision.slice(0, DESPLEGADOS_AL_ABRIR).map((f) => f.ruta);
    setDesplegados(new Set(primeros));
    for (const ruta of primeros) pedirParche(ruta);
  }, [listaDeRevision, desplegados, pedirParche]);
```

En el efecto del flanco de fin de turno, sustituir el cuerpo por:
```tsx
    if (!acabaDeTerminar || pestana !== "ficheros") return;
    pedirRevision();
    // Los desplegados se vuelven a pedir: si no, seguirían enseñando el diff viejo del
    // fichero que el turno acaba de cambiar.
    for (const ruta of desplegados ?? []) pedirParche(ruta);
    // `desplegados` NO va en las dependencias a propósito: desplegar ya pide su parche por
    // su cuenta, y tenerlo aquí lo pediría dos veces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnoEnVuelo, pestana, pedirRevision, pedirParche]);
```
(El literal `"ficheros"` de la pestaña se renombra en la Task 8.)

En el JSX, sustituir el `<Ficheros …/>` por:
```tsx
                <Revision
                  historica={estado.alta?.historica === true}
                  {...(estado.revision === undefined ? {} : { via: estado.revision.via })}
                  ficheros={estado.revision?.lista ?? []}
                  parches={estado.parches ?? {}}
                  desplegados={desplegados ?? new Set()}
                  alDesplegar={desplegar}
                  alPlegar={plegar}
                  alRecargar={pedirRevision}
                />
```

- [ ] **Step 6b: El test de `App` del despliegue automático**

Añadir a `apps/web/src/App.test.tsx` (usa el `montar()` del fichero, que abre un proyecto; `DESPLEGADOS_AL_ABRIR` se importa de `./componentes/Revision.js`):

```tsx
describe("App: Revisión despliega solos los primeros", () => {
  const diez = () => Array.from({ length: 10 }, (_, i) => ({ ruta: `src/f${i}.xne`, clase: "modificado" as const, mas: 1, menos: 0 }));
  const parchesPedidos = (enviar: ReturnType<typeof vi.fn>) =>
    enviar.mock.calls.filter(([m]) => (m as { clase: string; ruta?: string }).clase === "revision" && (m as { ruta?: string }).ruta !== undefined);

  it("una lista vacía no fija nada; la primera con ficheros despliega los 8 primeros y pide su parche", () => {
    const { store, enviar } = montar();
    fireEvent.click(screen.getByRole("tab", { name: "Ficheros" }));
    // La sesión acaba de abrirse: «sin-empezar», lista vacía. Si esto inicializara el
    // conjunto en vacío, la lista de después del primer turno ya no desplegaría ninguno.
    act(() => store.aplicar({ clase: "revision", via: "sin-empezar", ficheros: [] }));
    expect(parchesPedidos(enviar)).toHaveLength(0);

    act(() => store.aplicar({ clase: "revision", via: "git", ficheros: diez() }));
    const pedidos = parchesPedidos(enviar).map(([m]) => (m as { ruta: string }).ruta);
    expect(pedidos).toEqual(diez().slice(0, DESPLEGADOS_AL_ABRIR).map((f) => f.ruta));
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(DESPLEGADOS_AL_ABRIR);
  });
});
```
(En esta tarea la pestaña de Revisión todavía se llama «Ficheros» en la tira; la Task 8 la renombra y ese `name: "Ficheros"` pasa a `"Revisión"` entonces.)

- [ ] **Step 7: Verificar**

Run: `npm run typecheck && npx vitest run apps/web/src/componentes/Revision.test.tsx apps/web/src/App.test.tsx apps/web/src/componentes/Barra.test.tsx`
Expected: en verde.

- [ ] **Step 8: Commit**

```bash
git add -A apps/web/src/componentes/Revision.tsx apps/web/src/componentes/Revision.module.css apps/web/src/componentes/Revision.test.tsx apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat(web): Revisión — los diffs de la sesión apilados y numerados, con el árbol de cambiados"
```

```json:metadata
{"files": ["apps/web/src/componentes/Revision.tsx", "apps/web/src/componentes/Revision.module.css", "apps/web/src/componentes/Revision.test.tsx", "apps/web/src/App.tsx", "apps/web/src/App.test.tsx"], "verifyCommand": "npm run typecheck && npx vitest run apps/web/src/componentes/Revision.test.tsx apps/web/src/App.test.tsx apps/web/src/componentes/Barra.test.tsx", "acceptanceCriteria": ["8 desplegados y 2 plegados con 10 ficheros", "cabecera Sesión con total y binarios aparte", "diff con data-viejo/data-nuevo", "cabecera pliega y despliega", "hoja del árbol despliega", "avisos intactos", "App: lista vacía no inicializa; la primera con ficheros despliega 8 y pide 8 parches (test en App.test)"], "modelTier": "standard"}
```

---

### Task 6: `arbolDeProyecto.ts` — el listado y el lector del proyecto en el host

**Goal:** Un módulo en `src/agent/` que devuelve el árbol del proyecto filtrado y ordenado, y lee un fichero aplicando la barrera de rutas, con `ficherosDelProyecto` ganando el tope de profundidad como parámetro.

**Files:**
- Modify: `src/agent/turnoReal.ts:97-118`
- Create: `src/agent/arbolDeProyecto.ts`
- Test: `src/agent/arbolDeProyecto.test.ts`
- Modify: `src/agent/turnoReal.test.ts:370-390` (un test más)

**Acceptance Criteria:**
- [ ] `ficherosDelProyecto(raiz, 0, 32)` ve un fichero a profundidad 6; `ficherosDelProyecto(raiz)` no (tope 4 de siempre).
- [ ] El árbol no lista `.env`, `.xonecode/**`, `.git/**`, `node_modules/**` ni `app/Clientes.xml` cuando existe `app/Clientes.xne`; sí lista `app/Clientes.xne` y `app.xml`.
- [ ] `ordenarRutas(["b.js", "a/z.xne", "a.js", "a/b/c.css"])` → `["a/b/c.css", "a/z.xne", "a.js", "b.js"]`.
- [ ] Con más de `TOPE_DE_ENTRADAS` rutas se devuelven las primeras y `recortado: true`.
- [ ] El lector rechaza con `error` y sin `texto`: `../x`, `/etc/passwd`, `.env`, `.xonecode/config.json`, `app/Clientes.xml` (aplanada), un enlace simbólico que apunta fuera de la raíz, y una carpeta.
- [ ] Un fichero con NUL en los primeros 8 KB → `binario: true`, sin `texto`, `bytes` = tamaño real.
- [ ] Un fichero con bytes que no son UTF-8 → `codificacion: "latin1"` y el texto decodificado; uno UTF-8 → `"utf-8"`.
- [ ] Un fichero de `TOPE_DE_FICHERO + 10` bytes → `recortado: true`, `texto.length` ≤ `TOPE_DE_FICHERO`, `bytes` el tamaño real.

**Verify:** `npx vitest run src/agent/arbolDeProyecto.test.ts src/agent/turnoReal.test.ts` → en verde.

**Steps:**

- [ ] **Step 1: El tope de profundidad en `ficherosDelProyecto`**

En `src/agent/turnoReal.ts`, sustituir la firma y la primera línea:
```ts
/** Hasta dónde baja el completado del Tab. El árbol de la consola web pide más (`arbolDeProyecto.ts`). */
export const PROFUNDIDAD_DEL_TAB = 4;

export function ficherosDelProyecto(raiz: string, prof = 0, tope = PROFUNDIDAD_DEL_TAB): ReadonlySet<string> {
  if (prof > tope || !existsSync(raiz)) return new Set();
```
y en la recursión (línea 109): `ficherosDelProyecto(ruta, prof + 1)` → `ficherosDelProyecto(ruta, prof + 1, tope)`.

Añadir a `src/agent/turnoReal.test.ts`, dentro de `describe("ficherosDelProyecto")`:
```ts
  it("el tope de profundidad es un parámetro: el Tab para en 4, el árbol de la web pide más", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-prof-"));
    try {
      const hondo = join(raiz, "a", "b", "c", "d", "e", "f");
      mkdirSync(hondo, { recursive: true });
      writeFileSync(join(hondo, "x.xne"), "<x/>");
      expect(ficherosDelProyecto(raiz).has("/a/b/c/d/e/f/x.xne")).toBe(false);
      expect(ficherosDelProyecto(raiz, 0, 32).has("/a/b/c/d/e/f/x.xne")).toBe(true);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: El test del módulo nuevo**

`src/agent/arbolDeProyecto.test.ts`:
```ts
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  arbolDeProyecto,
  leerFicheroDeProyecto,
  motivoDeRutaInaceptable,
  ordenarRutas,
  TOPE_DE_ENTRADAS,
  TOPE_DE_FICHERO,
} from "./arbolDeProyecto.js";

let raiz: string;
let fuera: string;

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), "xc-arbol-"));
  fuera = mkdtempSync(join(tmpdir(), "xc-fuera-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>");
  mkdirSync(join(raiz, "app"));
  writeFileSync(join(raiz, "app", "Clientes.xne"), "<coll name=\"Clientes\"/>");
  writeFileSync(join(raiz, "app", "Clientes.xml"), "<vistas/>"); // aplanada
  writeFileSync(join(raiz, ".env"), "SECRETO=1");
  mkdirSync(join(raiz, ".xonecode"));
  writeFileSync(join(raiz, ".xonecode", "config.json"), "{}");
  mkdirSync(join(raiz, ".git"));
  writeFileSync(join(raiz, ".git", "HEAD"), "ref");
  mkdirSync(join(raiz, "node_modules", "x"), { recursive: true });
  writeFileSync(join(raiz, "node_modules", "x", "i.js"), "");
  writeFileSync(join(raiz, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
  writeFileSync(join(raiz, "viejo.txt"), Buffer.from([0x68, 0x6f, 0x6c, 0x61, 0x20, 0xf1])); // «hola ñ» en cp1252
  writeFileSync(join(raiz, "grande.js"), "x".repeat(TOPE_DE_FICHERO + 10));
  writeFileSync(join(fuera, "secreto.txt"), "no");
  symlinkSync(join(fuera, "secreto.txt"), join(raiz, "enlace.txt"));
});

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
  rmSync(fuera, { recursive: true, force: true });
});

describe("arbolDeProyecto", () => {
  it("lista lo que el agente ve y nada más: ni .env, ni .xonecode, ni .git, ni node_modules, ni la vista aplanada", () => {
    const { rutas, recortado } = arbolDeProyecto(raiz);
    expect(recortado).toBe(false);
    expect(rutas).toContain("app/Clientes.xne");
    expect(rutas).toContain("app.xml");
    expect(rutas).not.toContain("app/Clientes.xml");
    expect(rutas.some((r) => r.startsWith(".env") || r.startsWith(".xonecode") || r.startsWith(".git") || r.startsWith("node_modules"))).toBe(false);
  });

  it("ordena carpetas antes que ficheros en cada nivel, y alfabético sin mayúsculas", () => {
    expect(ordenarRutas(["b.js", "a/z.xne", "A.js", "a/b/c.css", "Zeta/x"])).toEqual(["a/b/c.css", "a/z.xne", "Zeta/x", "A.js", "b.js"]);
  });

  it("declara el recorte al pasar el tope de entradas", () => {
    const muchos = mkdtempSync(join(tmpdir(), "xc-muchos-"));
    try {
      for (let i = 0; i < TOPE_DE_ENTRADAS + 5; i++) writeFileSync(join(muchos, `f${String(i).padStart(5, "0")}.js`), "");
      const { rutas, recortado } = arbolDeProyecto(muchos);
      expect(recortado).toBe(true);
      expect(rutas).toHaveLength(TOPE_DE_ENTRADAS);
    } finally {
      rmSync(muchos, { recursive: true, force: true });
    }
  });
});

describe("leerFicheroDeProyecto", () => {
  it("lee un fichero de texto UTF-8", async () => {
    const f = await leerFicheroDeProyecto(raiz, "app/Clientes.xne");
    expect(f).toMatchObject({ ruta: "app/Clientes.xne", texto: "<coll name=\"Clientes\"/>", binario: false, recortado: false, codificacion: "utf-8" });
    expect(f.bytes).toBe(Buffer.byteLength("<coll name=\"Clientes\"/>"));
  });

  it.each(["../x", "/etc/passwd", ".env", ".xonecode/config.json", "app/Clientes.xml", "enlace.txt", "app", "no-existe.xne", "a//b"])(
    "rechaza «%s» con motivo y sin texto",
    async (ruta) => {
      const f = await leerFicheroDeProyecto(raiz, ruta);
      expect(f.error).toBeTypeOf("string");
      expect(f.texto).toBeUndefined();
      expect(f.error).not.toContain(raiz); // nunca la ruta real de la máquina
    }
  );

  it("un NUL en los primeros 8 KB es binario: sin texto, con tamaño", async () => {
    const f = await leerFicheroDeProyecto(raiz, "logo.png");
    expect(f).toMatchObject({ binario: true, bytes: 7 });
    expect(f.texto).toBeUndefined();
  });

  it("lo que no es UTF-8 se lee como latin1 y se dice", async () => {
    const f = await leerFicheroDeProyecto(raiz, "viejo.txt");
    expect(f.codificacion).toBe("latin1");
    expect(f.texto).toBe("hola ñ");
  });

  it("recorta al tope y lo declara, con el tamaño real", async () => {
    const f = await leerFicheroDeProyecto(raiz, "grande.js");
    expect(f.recortado).toBe(true);
    expect(f.texto!.length).toBeLessThanOrEqual(TOPE_DE_FICHERO);
    expect(f.bytes).toBe(TOPE_DE_FICHERO + 10);
  });
});

describe("motivoDeRutaInaceptable", () => {
  it("acepta una ruta relativa normal y rechaza las demás formas", () => {
    expect(motivoDeRutaInaceptable("src/app.xne")).toBeUndefined();
    expect(motivoDeRutaInaceptable("")).toBeTypeOf("string");
    expect(motivoDeRutaInaceptable("./a")).toBeTypeOf("string");
    expect(motivoDeRutaInaceptable("a/../b")).toBeTypeOf("string");
    expect(motivoDeRutaInaceptable("C:\\x")).toBeTypeOf("string");
    expect(motivoDeRutaInaceptable(".env.local")).toBeTypeOf("string");
  });
});
```

- [ ] **Step 3: Comprobar que falla**

Run: `npx vitest run src/agent/arbolDeProyecto.test.ts` → FAIL (módulo no existe).

- [ ] **Step 4: El módulo**

`src/agent/arbolDeProyecto.ts`:
```ts
import { existsSync } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { ficherosDelProyecto } from "./turnoReal.js";
import { puedeLeerRuta } from "./perfiles.js";
import { esVistaAplanada } from "./proyecto.js";

/**
 * El proyecto tal como lo enseña la pestaña Ficheros de la consola web: el árbol y el
 * contenido de un fichero, de SOLO lectura.
 *
 * Lo que se lista y lo que se lee es lo mismo que ve el agente, con las mismas reglas y
 * por las mismas funciones: `puedeLeerRuta` (la barrera de las tools propias) y
 * `esVistaAplanada` (los `.xml` que genera XOne Studio no se tocan). Reescribirlas aquí
 * sería la segunda copia que diverge el primer día.
 */

/** Profundidad del árbol de la web: sin tope práctico (el del Tab es 4). */
export const PROFUNDIDAD_DEL_ARBOL = 32;
/** Entradas a partir de las cuales el árbol se recorta y lo dice. */
export const TOPE_DE_ENTRADAS = 5_000;
/** Bytes de contenido que viajan como mucho: el mismo tope que el parche de Revisión. */
export const TOPE_DE_FICHERO = 400_000;
/** Ventana en la que un NUL delata un binario. */
export const VENTANA_DE_BINARIO = 8_192;

export interface ArbolDeProyecto {
  /** Relativas a la raíz, sin barra inicial, ordenadas: carpetas antes que ficheros. */
  rutas: string[];
  recortado: boolean;
}

export interface FicheroLeido {
  /** La ruta tal como se pidió, nunca la resuelta en disco. */
  ruta: string;
  /** Falta si es binario o si la ruta se rechazó. */
  texto?: string;
  recortado: boolean;
  binario: boolean;
  /** Tamaño real en disco, aunque el texto vaya recortado. */
  bytes: number;
  codificacion?: "utf-8" | "latin1";
  /** El motivo del paso que falló. Sin él, la lectura fue bien. */
  error?: string;
}

const comparador = new Intl.Collator("es", { sensitivity: "base" });

/**
 * Carpetas antes que ficheros en cada nivel, y dentro alfabético sin distinguir mayúsculas.
 * Se compara segmento a segmento: en el primero que difiere, si uno es hoja (último
 * segmento de su ruta) y el otro carpeta, la carpeta va antes.
 */
export function ordenarRutas(rutas: readonly string[]): string[] {
  return [...rutas].sort((a, b) => {
    const sa = a.split("/");
    const sb = b.split("/");
    const n = Math.min(sa.length, sb.length);
    for (let i = 0; i < n; i++) {
      const aHoja = i === sa.length - 1;
      const bHoja = i === sb.length - 1;
      if (aHoja !== bHoja) return aHoja ? 1 : -1;
      if (sa[i] !== sb[i]) return comparador.compare(sa[i]!, sb[i]!) || (sa[i]! < sb[i]! ? -1 : 1);
    }
    return sa.length - sb.length;
  });
}

export function arbolDeProyecto(raiz: string): ArbolDeProyecto {
  const todas = ficherosDelProyecto(raiz, 0, PROFUNDIDAD_DEL_ARBOL);
  const visibles = [...todas].filter((r) => puedeLeerRuta(r) && !esVistaAplanada(r, todas)).map((r) => r.slice(1));
  const ordenadas = ordenarRutas(visibles);
  if (ordenadas.length > TOPE_DE_ENTRADAS) return { rutas: ordenadas.slice(0, TOPE_DE_ENTRADAS), recortado: true };
  return { rutas: ordenadas, recortado: false };
}

/**
 * Por qué una ruta del cable no se acepta, o `undefined` si vale. Es la criba de balde,
 * antes de tocar el disco: relativa, sin `.`/`..`/segmentos vacíos, y admitida por la
 * barrera de lectura. La segunda criba —que el camino REAL siga dentro de la raíz— es de
 * `leerFicheroDeProyecto`, porque necesita `realpath`.
 */
export function motivoDeRutaInaceptable(ruta: string): string | undefined {
  if (ruta === "") return "la ruta está vacía";
  if (isAbsolute(ruta) || ruta.startsWith("/") || ruta.startsWith("\\") || /^[A-Za-z]:/.test(ruta)) {
    return "la ruta tiene que ser relativa al proyecto";
  }
  const segmentos = ruta.split(/[\\/]/);
  if (segmentos.some((s) => s === "" || s === "." || s === "..")) {
    return "la ruta no puede llevar «.», «..» ni segmentos vacíos";
  }
  if (!puedeLeerRuta(`/${segmentos.join("/")}`)) return "esa ruta no se enseña";
  return undefined;
}

export async function leerFicheroDeProyecto(raiz: string, ruta: string): Promise<FicheroLeido> {
  const rechazo = (error: string): FicheroLeido => ({ ruta, recortado: false, binario: false, bytes: 0, error });

  const motivo = motivoDeRutaInaceptable(ruta);
  if (motivo !== undefined) return rechazo(motivo);

  // La misma regla que `esVistaAplanada` (un `.xml` con su `.xne` al lado), preguntada al
  // disco en O(1) en vez de recorrer el árbol entero por cada fichero que se abre.
  const normal = ruta.split(/[\\/]/).join("/");
  if (normal.endsWith(".xml") && existsSync(resolve(raiz, `${normal.slice(0, -4)}.xne`))) {
    return rechazo("es una vista aplanada que genera XOne Studio; la fuente es el .xne del mismo nombre");
  }

  let real: string;
  let raizReal: string;
  try {
    raizReal = await realpath(raiz);
    real = await realpath(resolve(raiz, ruta));
  } catch {
    return rechazo("no existe");
  }
  // Un enlace simbólico dentro del proyecto que apunte fuera se queda aquí: la lección que
  // el repo ya pagó con `virtualMode: true` en el backend del agente.
  if (!real.startsWith(raizReal + sep)) return rechazo("está fuera del proyecto");

  const info = await stat(real);
  if (!info.isFile()) return rechazo("no es un fichero");

  const fh = await open(real, "r");
  try {
    const buffer = Buffer.alloc(Math.min(info.size, TOPE_DE_FICHERO + 1));
    const { bytesRead } = await fh.read(buffer, 0, buffer.length, 0);
    const leido = buffer.subarray(0, bytesRead);
    const bytes = info.size;
    if (leido.subarray(0, VENTANA_DE_BINARIO).includes(0)) {
      return { ruta, recortado: false, binario: true, bytes };
    }
    const recortado = bytesRead > TOPE_DE_FICHERO;
    const cuerpo = recortado ? leido.subarray(0, TOPE_DE_FICHERO) : leido;
    const { texto, codificacion } = decodificar(cuerpo, recortado);
    return { ruta, texto, recortado, binario: false, bytes, codificacion };
  } finally {
    await fh.close();
  }
}

/**
 * UTF-8 estricto, y si no lo es, latin1 (que en Node es windows-1252: lo que traen los
 * proyectos XOne antiguos hechos en Windows). Cuando el cuerpo va RECORTADO el corte puede
 * partir un carácter multibyte, y eso no es «no es UTF-8»: se reintenta quitando hasta tres
 * bytes del final antes de dar el fichero por latin1.
 */
function decodificar(cuerpo: Uint8Array, recortado: boolean): { texto: string; codificacion: "utf-8" | "latin1" } {
  const estricto = new TextDecoder("utf-8", { fatal: true });
  const intentos = recortado ? [0, 1, 2, 3] : [0];
  for (const quitar of intentos) {
    try {
      return { texto: estricto.decode(cuerpo.subarray(0, cuerpo.length - quitar)), codificacion: "utf-8" };
    } catch {
      // siguiente intento
    }
  }
  return { texto: new TextDecoder("latin1").decode(cuerpo), codificacion: "latin1" };
}
```

- [ ] **Step 5: Verificar**

Run: `npx vitest run src/agent/arbolDeProyecto.test.ts src/agent/turnoReal.test.ts && npm run typecheck`
Expected: en verde. Si `ordenarRutas` no da exactamente `["a/b/c.css", "a/z.xne", "Zeta/x", "A.js", "b.js"]`, revisar el comparador (carpetas `a`, `Zeta` antes que hojas `A.js`, `b.js`; dentro de `a`, la carpeta `b` antes que la hoja `z.xne`).

- [ ] **Step 6: Commit**

```bash
git add src/agent/turnoReal.ts src/agent/turnoReal.test.ts src/agent/arbolDeProyecto.ts src/agent/arbolDeProyecto.test.ts
git commit -m "feat(agent): arbolDeProyecto — el árbol y el lector de solo lectura del proyecto, con la barrera de rutas del agente"
```

```json:metadata
{"files": ["src/agent/turnoReal.ts", "src/agent/turnoReal.test.ts", "src/agent/arbolDeProyecto.ts", "src/agent/arbolDeProyecto.test.ts"], "verifyCommand": "npx vitest run src/agent/arbolDeProyecto.test.ts src/agent/turnoReal.test.ts && npm run typecheck", "acceptanceCriteria": ["tope de profundidad por parámetro", "el árbol filtra .env/.xonecode/.git/node_modules/aplanadas", "orden carpetas antes", "recorte declarado", "lector rechaza .., absoluta, .env, .xonecode, aplanada, enlace fuera, carpeta", "binario por NUL", "latin1 declarado", "recorte al tope con bytes reales"], "modelTier": "standard"}
```

---

### Task 7: El cable `arbol` y `fichero`, del servidor al store

**Goal:** Los dos mensajes nuevos existen en las dos direcciones, el servidor los atiende con puertos inyectados, la producción los cablea al módulo real, y el store los guarda y los tira con la sesión y sin cable.

**Files:**
- Modify: `src/web/servidor/transporte.ts` (uniones + `FicheroDelProyecto`)
- Modify: `src/web/servidor/arranque.ts` (`OpcionesDeMontaje`, `atenderArbol`, `atenderFichero`, despacho, cableado real)
- Modify: `src/web/servidor/arranque.test.ts`
- Modify: `apps/web/src/tipos.ts`
- Modify: `apps/web/src/store.ts`
- Modify: `apps/web/src/store.test.ts`

**Acceptance Criteria:**
- [ ] `tipos.test.ts` en verde (los literales `arbol` y `fichero` aparecen dos veces en cada fichero: una por unión).
- [ ] Con proyecto abierto, `{clase:"arbol"}` emite `{clase:"arbol", rutas, recortado}` de lo que devuelve el puerto; si el puerto lanza, `rutas: []` y `error`.
- [ ] Sin puerto `arbolDelProyecto`, se emite `arbol` con `error` (no silencio).
- [ ] Sin proyecto abierto, `arbol` y `fichero` no emiten nada.
- [ ] `{clase:"fichero", ruta}` llama al puerto con la raíz del proyecto abierto y esa ruta, y emite lo que devuelve con `clase: "fichero"`.
- [ ] El store guarda `arbol` y `contenidos[ruta]`, y los pone a `undefined` cuando `alta` cambia de `sesionActiva` y en `marcarDesconectado`.

**Verify:** `npm run typecheck && npx vitest run apps/web/src/tipos.test.ts apps/web/src/store.test.ts src/web/servidor/arranque.test.ts src/web/frontera.test.ts` → en verde.

**Steps:**

- [ ] **Step 1: Tests del servidor**

Añadir a `src/web/servidor/arranque.test.ts` un `describe` nuevo junto al de «los ficheros de la sesión» (mismos helpers: `servidorDeMentira`, `vestibuloDePrueba`, `clienteDeMentira`, `asentar`, `enviarMensaje`, `RUTA_EVENTOS`, `RUTA_ACCION`):

```ts
  describe("el árbol del proyecto y el contenido de un fichero", () => {
    const abrirProyecto = async () => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-arbol-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: base });
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      return { base, servidor, vestibulo, raizDeVerdad };
    };

    it("con proyecto abierto, «arbol» contesta lo que dice el puerto y «fichero» pide POR RUTA", async () => {
      const { base, servidor, vestibulo } = await abrirProyecto();
      const pedidos: { raiz: string; ruta: string }[] = [];
      montarRutas(servidor, vestibulo, {
        arbolDelProyecto: async () => ({ rutas: ["app.xml", "src/a.xne"], recortado: false }),
        leerFichero: async (raiz, ruta) => {
          pedidos.push({ raiz, ruta });
          return { ruta, texto: "<a/>", recortado: false, binario: false, bytes: 4, codificacion: "utf-8" };
        },
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();

      expect(await enviarMensaje(accion, { clase: "arbol" })).toBe(204);
      await asentar();
      expect(cliente.recibidos.filter((x) => x.clase === "arbol").at(-1)).toEqual({ clase: "arbol", rutas: ["app.xml", "src/a.xne"], recortado: false });

      expect(await enviarMensaje(accion, { clase: "fichero", ruta: "src/a.xne" })).toBe(204);
      await asentar();
      expect(pedidos).toEqual([{ raiz: vestibulo.proyectoAbierto()!.raiz, ruta: "src/a.xne" }]);
      expect(cliente.recibidos.filter((x) => x.clase === "fichero").at(-1)).toMatchObject({ clase: "fichero", ruta: "src/a.xne", texto: "<a/>", bytes: 4 });

      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    it("si el puerto del árbol lanza, se contesta con error y lista vacía, no con silencio", async () => {
      const { base, servidor, vestibulo } = await abrirProyecto();
      montarRutas(servidor, vestibulo, {
        arbolDelProyecto: async () => {
          throw new Error("disco roto");
        },
      });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();
      await enviarMensaje(accion, { clase: "arbol" });
      await asentar();
      expect(cliente.recibidos.filter((x) => x.clase === "arbol").at(-1)).toEqual({ clase: "arbol", rutas: [], recortado: false, error: "disco roto" });
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });

    it("sin puerto que liste, «arbol» lo dice con error; sin proyecto abierto, no contesta nada", async () => {
      const { base, servidor, vestibulo } = await abrirProyecto();
      montarRutas(servidor, vestibulo);
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();

      await enviarMensaje(accion, { clase: "arbol" });
      await enviarMensaje(accion, { clase: "fichero", ruta: "x" });
      await asentar();
      expect(cliente.recibidos.some((x) => x.clase === "arbol" || x.clase === "fichero")).toBe(false);

      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();
      await enviarMensaje(accion, { clase: "arbol" });
      await asentar();
      const m = cliente.recibidos.filter((x) => x.clase === "arbol").at(-1) as Extract<MensajeAlCliente, { clase: "arbol" }>;
      expect(m.rutas).toEqual([]);
      expect(m.error).toBeTypeOf("string");
      await vestibulo.cerrar();
      rmSync(base, { recursive: true, force: true });
    });
  });
```

- [ ] **Step 2: Tests del store**

Añadir a `apps/web/src/store.test.ts`:
```ts
  it("«arbol» y «fichero» se guardan, y se tiran al cambiar de sesión y al caerse el cable", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "arbol", rutas: ["app.xml", "src/a.xne"], recortado: false });
    s.aplicar({ clase: "fichero", ruta: "src/a.xne", texto: "<a/>", recortado: false, binario: false, bytes: 4, codificacion: "utf-8" });
    expect(s.leer().arbol).toEqual({ rutas: ["app.xml", "src/a.xne"], recortado: false });
    expect(s.leer().contenidos?.["src/a.xne"]).toMatchObject({ texto: "<a/>", bytes: 4, codificacion: "utf-8" });

    s.marcarDesconectado();
    expect(s.leer().arbol).toBeUndefined();
    expect(s.leer().contenidos).toBeUndefined();
  });
```
Y este otro (no hay hoy ningún test del store sobre el cambio de `sesionActiva`; el `alta` mínimo es el del test «guarda pasos, entornos y listas tal cual llegan»):
```ts
  it("otra sesionActiva en el alta tira el árbol y los contenidos, igual que la revisión y los parches", () => {
    const s = crearStoreDelCliente();
    const alta = (sesionActiva: string) =>
      s.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        proyectos: [],
        ramas: [],
        proyectoAbierto: true,
        sesionActiva,
      });
    alta("s1");
    s.aplicar({ clase: "arbol", rutas: ["app.xml"], recortado: false });
    s.aplicar({ clase: "fichero", ruta: "app.xml", texto: "<app/>", recortado: false, binario: false, bytes: 6 });
    alta("s1");
    expect(s.leer().arbol).toBeDefined(); // misma sesión: se conserva
    alta("s2");
    expect(s.leer().arbol).toBeUndefined();
    expect(s.leer().contenidos).toBeUndefined();
  });
```

- [ ] **Step 3: Comprobar que fallan**

Run: `npx vitest run apps/web/src/store.test.ts src/web/servidor/arranque.test.ts -t "arbol"` → FAIL.

- [ ] **Step 4: `transporte.ts`**

Tras la línea del `parche` en `MensajeAlCliente`:
```ts
  /**
   * El árbol del proyecto abierto (pestaña Ficheros): rutas relativas, ordenadas y ya
   * filtradas por la misma regla que ve el agente (`agent/arbolDeProyecto.ts`). `error`
   * solo si no se pudo listar, y entonces `rutas` va vacía. Y el contenido de UN fichero,
   * de solo lectura: sin `texto` si es binario o si la ruta se rechazó, con el motivo.
   */
  | { clase: "arbol"; rutas: string[]; recortado: boolean; error?: string }
  | ({ clase: "fichero" } & FicheroDelProyecto)
```
Tras `FicheroTocado`:
```ts
/** Un fichero del proyecto tal como viaja. Redeclarado en `apps/web/src/tipos.ts`. */
export interface FicheroDelProyecto {
  /** La ruta tal como se pidió, nunca la resuelta en disco. */
  ruta: string;
  texto?: string;
  recortado: boolean;
  binario: boolean;
  bytes: number;
  codificacion?: "utf-8" | "latin1";
  error?: string;
}
```
Tras `| { clase: "revision"; ruta?: string }` en `MensajeDelCliente`:
```ts
  /** Pide el árbol del proyecto abierto, o el contenido de una ruta relativa a su raíz. */
  | { clase: "arbol" }
  | { clase: "fichero"; ruta: string }
```

- [ ] **Step 5: `arranque.ts`**

En `OpcionesDeMontaje`, tras `parcheDeSesion`:
```ts
  /**
   * El árbol del proyecto y el contenido de un fichero (`agent/arbolDeProyecto.ts`). Entran
   * por opción porque tocan el disco del proyecto: un test del cable usa dobles.
   */
  arbolDelProyecto?: (raiz: string) => Promise<{ rutas: string[]; recortado: boolean }>;
  leerFichero?: (raiz: string, ruta: string) => Promise<FicheroDelProyecto>;
```
(añadir `FicheroDelProyecto` al `import type … from "./transporte.js"` de la línea 76.)

Tras `atenderRevision`:
```ts
  /**
   * El árbol del proyecto abierto. Sin proyecto no hay pestaña que lo pida, así que no se
   * contesta nada; sin PUERTO sí se contesta, con error: un árbol que nunca llega deja al
   * cliente en «consultando…» para siempre, y un cargando eterno es un fallo mudo.
   */
  const atenderArbol = async (): Promise<void> => {
    const abierto = vestibulo.proyectoAbierto();
    if (abierto === undefined) return;
    if (opciones.arbolDelProyecto === undefined) {
      emitir({ clase: "arbol", rutas: [], recortado: false, error: "esta ejecución no puede listar el proyecto" });
      return;
    }
    try {
      const { rutas, recortado } = await opciones.arbolDelProyecto(abierto.raiz);
      emitir({ clase: "arbol", rutas, recortado });
    } catch (error) {
      emitir({ clase: "arbol", rutas: [], recortado: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  /** El contenido de una ruta del proyecto abierto. El lector decide si se puede enseñar. */
  const atenderFichero = async (ruta: string): Promise<void> => {
    const abierto = vestibulo.proyectoAbierto();
    if (abierto === undefined) return;
    if (opciones.leerFichero === undefined) {
      emitir({ clase: "fichero", ruta, recortado: false, binario: false, bytes: 0, error: "esta ejecución no puede leer el proyecto" });
      return;
    }
    emitir({ clase: "fichero", ...(await opciones.leerFichero(abierto.raiz, ruta)) });
  };
```
En el despacho, tras el bloque de `revision`:
```ts
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "arbol") {
      void atenderArbol().catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "fichero" && typeof mensaje.ruta === "string") {
      void atenderFichero(mensaje.ruta).catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
```
En `arrancarConsolaWeb`, en la llamada a `montarRutas` tras `parcheDeSesion,`:
```ts
    // El proyecto tal como lo ve el agente, para la pestaña Ficheros: mismo filtro, misma
    // barrera de rutas (`agent/arbolDeProyecto.ts`).
    arbolDelProyecto: async (raiz) => arbolDeProyecto(raiz),
    leerFichero: leerFicheroDeProyecto,
```
con `import { arbolDeProyecto, leerFicheroDeProyecto } from "../../agent/arbolDeProyecto.js";` junto al import de `sesionGit`.

- [ ] **Step 6: `tipos.ts` del cliente**

Tras `parche` en `MensajeAlCliente`:
```ts
  /** El árbol del proyecto abierto y el contenido de uno de sus ficheros (pestaña Ficheros). */
  | { clase: "arbol"; rutas: string[]; recortado: boolean; error?: string }
  | ({ clase: "fichero" } & FicheroDelProyecto)
```
Tras `FicheroTocado`:
```ts
/** Un fichero del proyecto tal como viaja. Redeclarado de `web/servidor/transporte.ts`. */
export interface FicheroDelProyecto {
  ruta: string;
  texto?: string;
  recortado: boolean;
  binario: boolean;
  bytes: number;
  codificacion?: "utf-8" | "latin1";
  error?: string;
}
```
Tras `| { clase: "revision"; ruta?: string }`:
```ts
  | { clase: "arbol" }
  | { clase: "fichero"; ruta: string }
```

- [ ] **Step 7: `store.ts`**

Importar `FicheroDelProyecto` de `./tipos.js`. En `EstadoDelCliente`, tras `parches`:
```ts
  /**
   * El árbol del proyecto abierto y los contenidos ya traídos, por ruta (pestaña Ficheros).
   * Son una FOTO del disco: se tiran con la sesión y sin cable, como los parches.
   */
  arbol?: { rutas: string[]; recortado: boolean; error?: string };
  contenidos?: Record<string, FicheroDelProyecto>;
```
Casos nuevos tras `case "parche"`:
```ts
        case "arbol": {
          const m = mensaje as { rutas?: unknown; recortado?: unknown; error?: unknown };
          if (!Array.isArray(m.rutas) || !m.rutas.every((r) => typeof r === "string")) return;
          mutar({
            arbol: {
              rutas: m.rutas as string[],
              recortado: m.recortado === true,
              ...(typeof m.error === "string" ? { error: m.error } : {}),
            },
          });
          return;
        }
        case "fichero": {
          const m = mensaje as Partial<FicheroDelProyecto>;
          if (typeof m.ruta !== "string" || typeof m.bytes !== "number") return;
          mutar({
            contenidos: {
              ...estado.contenidos,
              [m.ruta]: {
                ruta: m.ruta,
                bytes: m.bytes,
                recortado: m.recortado === true,
                binario: m.binario === true,
                ...(typeof m.texto === "string" ? { texto: m.texto } : {}),
                ...(m.codificacion === "utf-8" || m.codificacion === "latin1" ? { codificacion: m.codificacion } : {}),
                ...(typeof m.error === "string" ? { error: m.error } : {}),
              },
            },
          });
          return;
        }
```
En el `alta`: `...(cambioDeSesion ? { revision: undefined, parches: undefined, arbol: undefined, contenidos: undefined } : {})`. En `marcarDesconectado`, tras `parches: undefined,`: `arbol: undefined,` y `contenidos: undefined,`.

- [ ] **Step 8: Verificar**

Run: `npm run typecheck && npx vitest run apps/web/src/tipos.test.ts apps/web/src/store.test.ts src/web/servidor/arranque.test.ts src/web/frontera.test.ts`
Expected: en verde.

- [ ] **Step 9: Commit**

```bash
git add src/web/servidor/transporte.ts src/web/servidor/arranque.ts src/web/servidor/arranque.test.ts apps/web/src/tipos.ts apps/web/src/store.ts apps/web/src/store.test.ts
git commit -m "feat(web): los mensajes «arbol» y «fichero» — el proyecto abierto viaja al cliente de solo lectura"
```

```json:metadata
{"files": ["src/web/servidor/transporte.ts", "src/web/servidor/arranque.ts", "src/web/servidor/arranque.test.ts", "apps/web/src/tipos.ts", "apps/web/src/store.ts", "apps/web/src/store.test.ts"], "verifyCommand": "npm run typecheck && npx vitest run apps/web/src/tipos.test.ts apps/web/src/store.test.ts src/web/servidor/arranque.test.ts src/web/frontera.test.ts", "acceptanceCriteria": ["tipos.test en verde con arbol y fichero", "arbol contesta el puerto o error", "sin puerto error, sin proyecto silencio", "fichero pide por ruta con la raíz abierta", "store guarda y tira arbol y contenidos"], "modelTier": "standard"}
```

---

### Task 8: Cuatro pestañas y dos ranuras

**Goal:** `Pestana` es `"chat" | "ficheros" | "revision" | "trazas"` en ese orden; `Transcript` recibe `ficheros` y `revision` como ranuras; `App` monta `Revision` en la ranura `revision` y refresca al terminar el turno solo si esa pestaña está delante.

**Files:**
- Modify: `apps/web/src/componentes/Pestanas.tsx`
- Modify: `apps/web/src/componentes/Pestanas.test.tsx`
- Modify: `apps/web/src/componentes/Transcript.tsx`
- Modify: `apps/web/src/App.tsx`

**Acceptance Criteria:**
- [ ] `getAllByRole("tab").map(t => t.textContent)` → `["Chat", "Ficheros", "Revisión", "Trazas"]`.
- [ ] Pulsar «Revisión» reporta `"revision"`.
- [ ] `Transcript` con `pestana="revision"` pinta la ranura `revision`; con `"ficheros"`, la ranura `ficheros`.
- [ ] El efecto de fin de turno de `App` pide `revision` solo con `pestana === "revision"`.

**Verify:** `npm run typecheck && npx vitest run apps/web/src/componentes/Pestanas.test.tsx apps/web/src/componentes/Transcript.test.tsx apps/web/src/App.test.tsx` → en verde.

**Steps:**

- [ ] **Step 1: El test de pestañas**

En `Pestanas.test.tsx`, sustituir el test «las tres son role=tab…» por:
```tsx
  it("son cuatro, en este orden: Chat · Ficheros · Revisión · Trazas", () => {
    // Las tres primeras son para quien desarrolla una app XOne; Trazas es para depurar el
    // harness, y lo de otro destinatario va al final.
    render(<Pestanas pestana="revision" alElegirPestana={vi.fn()} />);
    expect(screen.getByRole("tablist")).not.toBeNull();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Chat", "Ficheros", "Revisión", "Trazas"]);
    expect(screen.getByRole("tab", { name: "Revisión" }).getAttribute("aria-selected")).toBe("true");
  });

  it("pulsar Revisión reporta «revision»", () => {
    const alElegirPestana = vi.fn();
    render(<Pestanas pestana="chat" alElegirPestana={alElegirPestana} />);
    fireEvent.click(screen.getByRole("tab", { name: "Revisión" }));
    expect(alElegirPestana).toHaveBeenCalledWith("revision");
  });
```
y en el primer test añadir `expect(screen.getByRole("tab", { name: "Revisión" }).getAttribute("aria-selected")).toBe("false");`.

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run apps/web/src/componentes/Pestanas.test.tsx` → FAIL (tres pestañas).

- [ ] **Step 3: `Pestanas.tsx`**

`export type Pestana = "chat" | "ficheros" | "revision" | "trazas";`, el comentario de cabecera pasa a «La tira de pestañas: Chat, Ficheros, Revisión y Trazas», y el `return` queda así (misma tira y mismo botón que hoy; solo cambia la lista):

```tsx
  const pestanas: { id: Pestana; etiqueta: string }[] = [
    { id: "chat", etiqueta: "Chat" },
    // El árbol del proyecto en el que se trabaja, con visor de solo lectura.
    { id: "ficheros", etiqueta: "Ficheros" },
    // Lo que ESTA sesión ha tocado, con su diff: la única vista que responde a «¿qué me ha
    // cambiado el agente?» sin salir a un terminal.
    { id: "revision", etiqueta: "Revisión" },
    // Para depurar el HARNESS, no para trabajar en una app XOne: por eso va la última.
    { id: "trazas", etiqueta: "Trazas" },
  ];
  return (
    <div className={clsx(conversacion.tabs, estilos.tira)} role="tablist">
      {pestanas.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={pestana === p.id}
          className={clsx(conversacion.tab, pestana === p.id && conversacion.tabActive)}
          onClick={() => alElegirPestana(p.id)}
        >
          {p.etiqueta}
        </button>
      ))}
    </div>
  );
```

- [ ] **Step 4: `Transcript.tsx`**

Props: sustituir `ficheros?: ReactNode;` por
```tsx
  /**
   * Las vistas de Ficheros y de Revisión, ya montadas por `App`. Van como ranuras y no como
   * props sueltas porque lo que aporta este componente es ELEGIR la vista; y como el
   * elemento solo se monta cuando se pinta, la petición al servidor que cada una lleva
   * dentro no sale hasta que alguien abre su pestaña.
   */
  ficheros?: ReactNode;
  revision?: ReactNode;
```
y el render:
```tsx
        ) : pestana === "trazas" ? (
          <Trazas actos={actos} />
        ) : pestana === "revision" ? (
          revision
        ) : (
          ficheros
        )}
```

- [ ] **Step 5: `App.tsx`**

En el efecto de fin de turno: `pestana !== "ficheros"` → `pestana !== "revision"`. En el JSX de `Transcript`: el prop `ficheros={<Revision …/>}` pasa a `revision={<Revision …/>}` (el prop `ficheros` queda sin pasar hasta la Task 10). Y en `App.test.tsx`, el test «Revisión despliega solos los primeros» pulsa ahora `getByRole("tab", { name: "Revisión" })`.

- [ ] **Step 6: Verificar y commit**

Run: `npm run typecheck && npx vitest run apps/web/src/componentes/Pestanas.test.tsx apps/web/src/componentes/Transcript.test.tsx apps/web/src/App.test.tsx`
Expected: en verde.
```bash
git add apps/web/src/componentes/Pestanas.tsx apps/web/src/componentes/Pestanas.test.tsx apps/web/src/componentes/Transcript.tsx apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat(web): cuatro pestañas — Chat, Ficheros, Revisión y Trazas"
```

```json:metadata
{"files": ["apps/web/src/componentes/Pestanas.tsx", "apps/web/src/componentes/Pestanas.test.tsx", "apps/web/src/componentes/Transcript.tsx", "apps/web/src/App.tsx"], "verifyCommand": "npm run typecheck && npx vitest run apps/web/src/componentes/Pestanas.test.tsx apps/web/src/componentes/Transcript.test.tsx apps/web/src/App.test.tsx", "acceptanceCriteria": ["cuatro pestañas en orden", "Revisión reporta revision", "Transcript con dos ranuras", "App refresca revision solo con esa pestaña"], "modelTier": "mechanical"}
```

---

### Task 9: `lenguajeDe` y `Visor.tsx` — el fichero resaltado con números de línea

**Goal:** Un visor de solo lectura que pinta el texto con el MISMO resaltador que el chat (`CodeBlock`) y añade los números de línea por CSS sobre los `.line` que emite shiki; y la tabla cerrada extensión → lenguaje.

**Files:**
- Create: `apps/web/src/lenguajeDe.ts`
- Create: `apps/web/src/lenguajeDe.test.ts`
- Create: `apps/web/src/componentes/Visor.tsx`
- Create: `apps/web/src/componentes/Visor.module.css`
- Create: `apps/web/src/componentes/Visor.test.tsx`

**Acceptance Criteria:**
- [ ] `lenguajeDe("a/B.XNE")` → `"xml"`; `.js` → `"javascript"`; `.css`, `.ini`, `.json`, `.md` → `"css"`, `"ini"`, `"json"`, `"markdown"`; `.txt`, `sin-extension`, `.bin` → `undefined`.
- [ ] `Visor` con `lenguaje="json"` y dos líneas produce dos nodos `.line` (json es gramática de arranque en el paquete: síncrona).
- [ ] `Visor` con `lenguaje={undefined}` pinta el texto plano y no revienta.
- [ ] El CSS numera con `counter-increment` sobre `:global(.line)`; ningún color literal.

**Verify:** `npx vitest run apps/web/src/lenguajeDe.test.ts apps/web/src/componentes/Visor.test.tsx apps/web/src/componentes/Barra.test.tsx` → en verde.

**Steps:**

- [ ] **Step 1: Tests**

`apps/web/src/lenguajeDe.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { lenguajeDe } from "./lenguajeDe.js";

describe("lenguajeDe", () => {
  it("es una tabla CERRADA por extensión, sin distinguir mayúsculas", () => {
    expect(lenguajeDe("app/Clientes.XNE")).toBe("xml");
    expect(lenguajeDe("app.xml")).toBe("xml");
    expect(lenguajeDe("scripts/a.js")).toBe("javascript");
    expect(lenguajeDe("a.css")).toBe("css");
    expect(lenguajeDe("a.ini")).toBe("ini");
    expect(lenguajeDe("a.json")).toBe("json");
    expect(lenguajeDe("README.md")).toBe("markdown");
    expect(lenguajeDe("notas.txt")).toBeUndefined();
    expect(lenguajeDe("Makefile")).toBeUndefined();
    expect(lenguajeDe("x.bin")).toBeUndefined();
    // Un nombre que es una propiedad heredada no puede resolver nada.
    expect(lenguajeDe("x.constructor")).toBeUndefined();
  });
});
```

`apps/web/src/componentes/Visor.test.tsx`:
```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Visor } from "./Visor.js";

afterEach(cleanup);

describe("Visor", () => {
  /**
   * D6 del spec: el visor reutiliza `CodeBlock` y los números de línea van por CSS sobre
   * los `.line` que emite shiki, UNO por línea. Este test es la comprobación de que ese
   * marcado existe; json es gramática de arranque del paquete, así que resalta en el
   * primer render y sin esperar a ninguna carga.
   */
  it("con una gramática cargada hay un nodo .line por línea", () => {
    const { container } = render(<Visor texto={'{"a": 1}\n{"b": 2}'} lenguaje="json" />);
    expect(container.querySelectorAll(".line")).toHaveLength(2);
  });

  it("sin lenguaje pinta el texto plano, entero", () => {
    const { container } = render(<Visor texto={"uno\ndos"} />);
    expect(container.textContent).toContain("uno");
    expect(container.textContent).toContain("dos");
  });
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `npx vitest run apps/web/src/lenguajeDe.test.ts apps/web/src/componentes/Visor.test.tsx` → FAIL (módulos no existen).

- [ ] **Step 3: `lenguajeDe.ts`**

```ts
/**
 * Extensión → lenguaje del resaltador. Tabla CERRADA: lo que no está se pinta plano. Un
 * `Map` y no un objeto, porque la extensión sale de un nombre de fichero y `constructor`
 * resolvería una propiedad heredada. Los `.xne` son XML: es lo que son.
 */
const LENGUAJES = new Map<string, string>([
  ["xne", "xml"],
  ["xml", "xml"],
  ["js", "javascript"],
  ["css", "css"],
  ["ini", "ini"],
  ["json", "json"],
  ["md", "markdown"],
]);

export function lenguajeDe(ruta: string): string | undefined {
  const nombre = ruta.slice(ruta.lastIndexOf("/") + 1);
  const punto = nombre.lastIndexOf(".");
  if (punto <= 0) return undefined;
  return LENGUAJES.get(nombre.slice(punto + 1).toLowerCase());
}
```

- [ ] **Step 4: `Visor.tsx` y su hoja**

```tsx
import { CodeBlock } from "@deepseek-ai/dsh-client-ui-primitives";
import estilos from "./Visor.module.css";

/**
 * El contenido de un fichero, de solo lectura, con el MISMO resaltador que las vallas de
 * código del chat: `CodeBlock` del paquete de deepseek, que monta shiki con un tema de
 * variables CSS (`estilos/shiki.css`). Un segundo resaltador con su propio tema pintaría el
 * visor de otro color que el chat.
 *
 * Los números de línea no los da el componente: los pone la hoja de este fichero con un
 * contador CSS sobre los `<span class="line">` que shiki emite, uno por línea. Con una
 * gramática que no está cargada todavía —xml, css, ini y markdown se cargan la primera vez
 * que se piden— el primer render sale plano y sin números, y `CodeBlock` se vuelve a pintar
 * solo cuando la gramática llega. Un lenguaje desconocido se queda plano y sin números:
 * el marcado plano es un solo `<code>` y no hay dónde contar.
 */
export function Visor({ texto, lenguaje }: { texto: string; lenguaje?: string }) {
  return (
    <div className={estilos.visor}>
      <CodeBlock code={texto} lang={lenguaje} copyLabel="Copiar" copiedLabel="Copiado" className={estilos.bloque} />
    </div>
  );
}
```

`apps/web/src/componentes/Visor.module.css`:
```css
/* Alias comprobados contra `estilos/design-platform.css`: label-tertiary, bg-layer-1,
   border-l2. Los `--shiki-*` vienen de `estilos/shiki.css`. */

.visor {
  padding: 0 16px 16px;
}

/* El bloque ocupa el ancho del visor y no lleva el borde de tarjeta del chat: aquí es la
   página entera, no una valla dentro de un globo. */
.bloque {
  margin: 0;
}

.bloque :global(pre) {
  margin: 0;
  padding: 8px 0;
  overflow: auto;
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 1.6;
}

/* Los números de línea, por contador CSS sobre los `.line` de shiki (uno por línea). No se
   seleccionan: copiar un trozo no arrastra la numeración. */
.bloque :global(code) {
  counter-reset: linea;
}

.bloque :global(.line)::before {
  counter-increment: linea;
  content: counter(linea);
  display: inline-block;
  width: 4ch;
  margin-right: 16px;
  text-align: right;
  color: var(--dsw-alias-label-tertiary);
  user-select: none;
}
```

- [ ] **Step 5: Verificar**

Run: `npx vitest run apps/web/src/lenguajeDe.test.ts apps/web/src/componentes/Visor.test.tsx apps/web/src/componentes/Barra.test.tsx`
Expected: en verde. **Si el primer test de `Visor` da 0 `.line`** (la gramática de json no resaltó en jsdom), la salida de reserva del spec (D6) es: quitar `CodeBlock` del visor y pintar `texto.split("\n")` como filas `<div className={estilos.linea}><span className={estilos.numero}>{i + 1}</span><span>{linea}</span></div>` SIN resaltado, ajustando el primer test a contar `.linea`. Se prefiere números sin color a color sin números en un visor; anotarlo en el comentario de cabecera del componente.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lenguajeDe.ts apps/web/src/lenguajeDe.test.ts apps/web/src/componentes/Visor.tsx apps/web/src/componentes/Visor.module.css apps/web/src/componentes/Visor.test.tsx
git commit -m "feat(web): Visor — el fichero con el resaltador del chat y números de línea por CSS"
```

```json:metadata
{"files": ["apps/web/src/lenguajeDe.ts", "apps/web/src/lenguajeDe.test.ts", "apps/web/src/componentes/Visor.tsx", "apps/web/src/componentes/Visor.module.css", "apps/web/src/componentes/Visor.test.tsx"], "verifyCommand": "npx vitest run apps/web/src/lenguajeDe.test.ts apps/web/src/componentes/Visor.test.tsx apps/web/src/componentes/Barra.test.tsx", "acceptanceCriteria": ["tabla cerrada de extensiones", "un .line por línea con json", "plano sin lenguaje", "sin colores literales"], "modelTier": "standard"}
```

---

### Task 10: `Ficheros.tsx` — el explorador del proyecto, cableado en `App`

**Goal:** La pestaña Ficheros: visor en el centro, árbol con filtro a la derecha, avisos de binario/latin1/recorte/error, cierre del elegido si desaparece del árbol; `App` pide el árbol al montar y al terminar el turno, y el contenido al elegir.

**Files:**
- Create: `apps/web/src/componentes/Ficheros.tsx`
- Create: `apps/web/src/componentes/Ficheros.module.css`
- Create: `apps/web/src/componentes/Ficheros.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Acceptance Criteria:**
- [ ] Al montar llama `alRecargar()` una vez.
- [ ] Sin `arbol`: «Consultando el árbol del proyecto…». Con `arbol.error`: lo dice y no pinta un proyecto vacío. Con `recortado`: dice que el árbol está recortado a N entradas.
- [ ] Escribir `cli` en el filtro deja ver `src/Clientes.xne` y no `src/Pedidos.xne`.
- [ ] Sin elegido: «Elige un fichero del árbol». Elegido sin contenido: «Trayendo …». Binario: «binario, N KB» sin `Visor`. `latin1`: nota «leído como latin1». `recortado`: nota con el tope. `error`: «No se puede enseñar este fichero: motivo».
- [ ] Pulsar una hoja llama `alElegir(ruta)`.
- [ ] Si `elegido` no está en `arbol.rutas`, llama `alElegir(undefined)` (una vez).
- [ ] `App`: pide `{clase:"arbol"}` al montar la pestaña (vía `alRecargar`) y al flanco de fin de turno con la pestaña delante, junto al `fichero` elegido; elegir manda `{clase:"fichero", ruta}`.

**Verify:** `npm run typecheck && npx vitest run apps/web/src/componentes/Ficheros.test.tsx apps/web/src/App.test.tsx apps/web/src/componentes/Barra.test.tsx` → en verde.

**Steps:**

- [ ] **Step 1: El test**

`apps/web/src/componentes/Ficheros.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Ficheros } from "./Ficheros.js";

afterEach(cleanup);
const NADA = () => {};
const ARBOL = { rutas: ["app.xml", "src/Clientes.xne", "src/Pedidos.xne"], recortado: false };

describe("Ficheros", () => {
  it("pide el árbol al montar: entrar a mirar ES la petición", () => {
    const recargar = vi.fn();
    render(<Ficheros contenidos={{}} alElegir={NADA} alRecargar={recargar} />);
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/consultando el árbol/i)).toBeTruthy();
  });

  it("un árbol con error lo dice, y no enseña un proyecto vacío", () => {
    render(<Ficheros arbol={{ rutas: [], recortado: false, error: "disco roto" }} contenidos={{}} alElegir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/disco roto/)).toBeTruthy();
    expect(screen.queryByRole("tree")).toBeNull();
  });

  it("un árbol recortado lo dice", () => {
    render(<Ficheros arbol={{ ...ARBOL, recortado: true }} contenidos={{}} alElegir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/recortado/i)).toBeTruthy();
  });

  it("el filtro deja ver lo que casa y esconde lo demás", () => {
    render(<Ficheros arbol={ARBOL} contenidos={{}} alElegir={NADA} alRecargar={NADA} />);
    fireEvent.change(screen.getByPlaceholderText(/filtrar/i), { target: { value: "cli" } });
    expect(screen.getByRole("treeitem", { name: "Clientes.xne" })).toBeTruthy();
    expect(screen.queryByRole("treeitem", { name: "Pedidos.xne" })).toBeNull();
  });

  it("pulsar una hoja la elige; sin elegido se invita a elegir", () => {
    const alElegir = vi.fn();
    render(<Ficheros arbol={ARBOL} contenidos={{}} alElegir={alElegir} alRecargar={NADA} />);
    expect(screen.getByText(/elige un fichero/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("treeitem", { name: "Clientes.xne" }));
    expect(alElegir).toHaveBeenCalledWith("src/Clientes.xne");
  });

  it("elegido sin contenido todavía: «trayendo»", () => {
    render(<Ficheros arbol={ARBOL} contenidos={{}} elegido="app.xml" alElegir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/trayendo/i)).toBeTruthy();
  });

  it("un binario dice que lo es y su tamaño, sin visor", () => {
    render(
      <Ficheros arbol={ARBOL} contenidos={{ "app.xml": { ruta: "app.xml", recortado: false, binario: true, bytes: 2048 } }} elegido="app.xml" alElegir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/binario/i)).toBeTruthy();
    expect(screen.getByText(/2 KB/)).toBeTruthy();
    expect(screen.queryByText("Copiar")).toBeNull();
  });

  it("latin1 y recorte se dicen encima del contenido", () => {
    render(
      <Ficheros
        arbol={ARBOL}
        contenidos={{ "app.xml": { ruta: "app.xml", texto: "<app/>", recortado: true, binario: false, bytes: 500000, codificacion: "latin1" } }}
        elegido="app.xml"
        alElegir={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText(/leído como latin1/i)).toBeTruthy();
    expect(screen.getByText(/recortado a/i)).toBeTruthy();
  });

  it("una ruta rechazada dice el motivo", () => {
    render(
      <Ficheros arbol={ARBOL} contenidos={{ "app.xml": { ruta: "app.xml", recortado: false, binario: false, bytes: 0, error: "está fuera del proyecto" } }} elegido="app.xml" alElegir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/no se puede enseñar este fichero/i)).toBeTruthy();
    expect(screen.getByText(/fuera del proyecto/)).toBeTruthy();
  });

  it("si el elegido desaparece del árbol nuevo, se cierra", () => {
    const alElegir = vi.fn();
    render(<Ficheros arbol={ARBOL} contenidos={{}} elegido="borrado.xne" alElegir={alElegir} alRecargar={NADA} />);
    expect(alElegir).toHaveBeenCalledWith(undefined);
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run apps/web/src/componentes/Ficheros.test.tsx` → FAIL (módulo no existe).

- [ ] **Step 3: El componente**

`apps/web/src/componentes/Ficheros.tsx`:
```tsx
import { useEffect, useState } from "react";
import type { FicheroDelProyecto } from "../tipos.js";
import { arbolDeRutas } from "../arbolDeRutas.js";
import { lenguajeDe } from "../lenguajeDe.js";
import { Arbol } from "./Arbol.js";
import { Visor } from "./Visor.js";
import estilos from "./Ficheros.module.css";

/**
 * El proyecto en el que se trabaja: el árbol a la derecha con un filtro encima, y el
 * fichero elegido en el centro, de SOLO lectura.
 *
 * Lo que se lista y lo que se lee es lo que ve el agente y nada más (`.xonecode`, `.env`,
 * `.git` y los `.xml` aplanados no salen): lo decide el servidor
 * (`agent/arbolDeProyecto.ts`), no este componente. Aquí solo se pinta lo que llega y se
 * DICE lo que no se puede pintar —un binario, un fichero recortado, uno que no es UTF-8,
 * una ruta rechazada— en vez de dejar el centro en blanco.
 *
 * El árbol se pide al montar y `App` lo vuelve a pedir al terminar un turno: el agente
 * puede haber creado ficheros. Si el elegido ya no está en el árbol nuevo, se cierra: un
 * visor enseñando un fichero que ya no existe es una foto vieja sin decirlo.
 */
export function Ficheros({
  arbol,
  contenidos,
  elegido,
  alElegir,
  alRecargar,
}: {
  /** Ausente = todavía no ha llegado; con `error`, no se pudo listar. */
  arbol?: { rutas: string[]; recortado: boolean; error?: string };
  contenidos: Record<string, FicheroDelProyecto>;
  elegido?: string;
  alElegir: (ruta: string | undefined) => void;
  alRecargar: () => void;
}) {
  useEffect(() => {
    alRecargar();
  }, [alRecargar]);

  useEffect(() => {
    if (elegido !== undefined && arbol !== undefined && arbol.error === undefined && !arbol.rutas.includes(elegido)) {
      alElegir(undefined);
    }
  }, [arbol, elegido, alElegir]);

  const [filtro, setFiltro] = useState("");

  if (arbol === undefined) {
    return <p className={estilos.aviso}>Consultando el árbol del proyecto…</p>;
  }
  if (arbol.error !== undefined) {
    return <p className={estilos.aviso}>No se ha podido listar el proyecto: {arbol.error}</p>;
  }

  const contenido = elegido === undefined ? undefined : contenidos[elegido];

  return (
    <div className={estilos.ficheros}>
      <div className={estilos.visor}>
        {elegido === undefined ? (
          <p className={estilos.aviso}>Elige un fichero del árbol.</p>
        ) : (
          <>
            <div className={estilos.cabecera}>{elegido}</div>
            {contenido === undefined ? (
              <p className={estilos.aviso}>Trayendo {elegido}…</p>
            ) : contenido.error !== undefined ? (
              <p className={estilos.aviso}>No se puede enseñar este fichero: {contenido.error}.</p>
            ) : contenido.binario ? (
              <p className={estilos.aviso}>
                Es un fichero binario, {kb(contenido.bytes)} KB. No se enseña su contenido.
              </p>
            ) : (
              <>
                {contenido.recortado ? (
                  <p className={estilos.nota}>
                    Recortado a {kb(contenido.texto?.length ?? 0)} KB de {kb(contenido.bytes)} KB: míralo entero en tu editor.
                  </p>
                ) : null}
                {contenido.codificacion === "latin1" ? (
                  <p className={estilos.nota}>Leído como latin1: el fichero no es UTF-8.</p>
                ) : null}
                <Visor texto={contenido.texto ?? ""} {...(lenguajeDe(elegido) === undefined ? {} : { lenguaje: lenguajeDe(elegido) })} />
              </>
            )}
          </>
        )}
      </div>

      <aside className={estilos.arbol} aria-label="Ficheros del proyecto">
        <input
          type="search"
          className={estilos.filtro}
          placeholder="Filtrar ficheros…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          aria-label="Filtrar ficheros"
        />
        {arbol.recortado ? (
          <p className={estilos.nota}>El árbol está recortado a {arbol.rutas.length} entradas.</p>
        ) : null}
        <Arbol nodos={arbolDeRutas(arbol.rutas)} {...(elegido === undefined ? {} : { elegida: elegido })} alElegir={alElegir} filtro={filtro} />
      </aside>
    </div>
  );
}

/** Kilobytes redondeados, para leer: «2 KB», no «2048 bytes». */
function kb(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}
```

`apps/web/src/componentes/Ficheros.module.css`:
```css
/* Alias comprobados contra `estilos/design-platform.css`: bg-layer-1, border-l2,
   label-primary/secondary/tertiary. Misma maqueta que `Revision.module.css`: lo que cede
   en el centro, el árbol a la derecha sin ceder, y el corte por CONTENEDOR y no por
   ventana —la barra lateral son 280 px que la ventana cuenta y esta caja no—. */
.ficheros {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  container-type: inline-size;
}

.visor {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
}

.arbol {
  display: flex;
  flex-direction: column;
  flex: 0 0 260px;
  min-width: 0;
  overflow-y: auto;
  padding: 8px;
  border-left: 0.5px solid var(--dsw-alias-border-l2);
}

/* Estrecho: el árbol pasa arriba, acotado en alto, y el visor sigue debajo. Aquí no vale
   esconderlo como en Revisión: sin árbol no hay forma de elegir un fichero. */
@container (max-width: 720px) {
  .ficheros {
    flex-direction: column;
  }

  .arbol {
    flex: 0 0 auto;
    max-height: 40%;
    border-left: none;
    border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  }
}

.filtro {
  margin-bottom: 8px;
  padding: 6px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}

.cabecera {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 16px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-family: var(--ds-font-family-code);
  font-size: 12px;
}

.aviso {
  margin: 12px 20px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.6;
  max-width: 60ch;
}

.nota {
  margin: 8px 16px 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 1.5;
}
```

- [ ] **Step 4: `App.tsx`**

Import: `import { Ficheros } from "./componentes/Ficheros.js";`. Junto al estado de Revisión:

```tsx
  /** El fichero abierto en la pestaña Ficheros. De esta ventana, como `pestana`. */
  const [ficheroElegido, setFicheroElegido] = useState<string | undefined>(undefined);

  const pedirArbol = useCallback(() => {
    void enviar({ clase: "arbol" });
  }, [enviar]);

  const elegirFichero = useCallback(
    (ruta: string | undefined) => {
      setFicheroElegido(ruta);
      if (ruta !== undefined) void enviar({ clase: "fichero", ruta });
    },
    [enviar]
  );
```

En el efecto del flanco de fin de turno, sustituir el cuerpo por:
```tsx
    if (!acabaDeTerminar) return;
    if (pestana === "revision") {
      pedirRevision();
      for (const ruta of desplegados ?? []) pedirParche(ruta);
    }
    if (pestana === "ficheros") {
      // El agente puede haber creado o cambiado ficheros: el árbol y el abierto se releen.
      pedirArbol();
      if (ficheroElegido !== undefined) void enviar({ clase: "fichero", ruta: ficheroElegido });
    }
    // `desplegados` y `ficheroElegido` NO van en las dependencias a propósito: desplegar y
    // elegir ya piden lo suyo por su cuenta, y tenerlos aquí lo pediría dos veces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnoEnVuelo, pestana, pedirRevision, pedirParche, pedirArbol, enviar]);
```

En el JSX de `Transcript`, añadir junto a `revision={…}`:
```tsx
              ficheros={
                <Ficheros
                  {...(estado.arbol === undefined ? {} : { arbol: estado.arbol })}
                  contenidos={estado.contenidos ?? {}}
                  {...(ficheroElegido === undefined ? {} : { elegido: ficheroElegido })}
                  alElegir={elegirFichero}
                  alRecargar={pedirArbol}
                />
              }
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npx vitest run apps/web/src/componentes/Ficheros.test.tsx apps/web/src/App.test.tsx apps/web/src/componentes/Barra.test.tsx`
Expected: en verde.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/componentes/Ficheros.tsx apps/web/src/componentes/Ficheros.module.css apps/web/src/componentes/Ficheros.test.tsx apps/web/src/App.tsx
git commit -m "feat(web): Ficheros — el árbol del proyecto con filtro y el visor de solo lectura"
```

```json:metadata
{"files": ["apps/web/src/componentes/Ficheros.tsx", "apps/web/src/componentes/Ficheros.module.css", "apps/web/src/componentes/Ficheros.test.tsx", "apps/web/src/App.tsx"], "verifyCommand": "npm run typecheck && npx vitest run apps/web/src/componentes/Ficheros.test.tsx apps/web/src/App.test.tsx apps/web/src/componentes/Barra.test.tsx", "acceptanceCriteria": ["pide el árbol al montar", "error y recorte se dicen", "filtro", "elegir y avisos de binario/latin1/recorte/error", "se cierra si desaparece", "App pide arbol y fichero al fin de turno"], "modelTier": "standard"}
```

---

### Task 11: `CLAUDE.md`, la suite entera y el build del cliente

**Goal:** El mapa del repo describe las dos pestañas, y toda la verificación pasa: typecheck, `npm test` completo y el build del cliente que `npm run web` exige.

**Files:**
- Modify: `CLAUDE.md:863` (párrafo «Los ficheros que ha tocado una sesión»)

**Acceptance Criteria:**
- [ ] `CLAUDE.md` nombra las pestañas «Ficheros» (árbol + visor, `agent/arbolDeProyecto.ts`, mensajes `arbol`/`fichero`) y «Revisión» (antes «Ficheros»; mensaje `revision`), con las reglas nuevas: la barrera de rutas es la del agente; el corte de la cabecera de git lo hace `numerarParche` en el cliente; el corte de columna es por contenedor a 720 px; los números de línea del visor son un contador CSS sobre los `.line` de shiki.
- [ ] `npm run typecheck` sin errores; `npm test` todo en verde; `npm run build:web` termina y existe `apps/web/dist/index.html`.

**Verify:** `npm run typecheck && npm test && npm run build:web && test -f apps/web/dist/index.html && echo OK` → termina en `OK`.

**Steps:**

- [ ] **Step 1: `CLAUDE.md`**

En el párrafo que empieza «**Los ficheros que ha tocado una sesión**» (línea 863), cambiar el arranque a:

```
**Ficheros y Revisión, las dos pestañas del proyecto** (`docs/superpowers/specs/2026-09-07-ficheros-y-revision-design.md`).
**Revisión** es lo que ha tocado una sesión (`agent/sesionGit.ts`, `componentes/Revision.tsx`,
mensaje `revision` del cable — se llamaba `ficheros` hasta que hubo una pestaña con ese
nombre): los ficheros APILADOS con cabecera pegajosa y su diff dentro, numerado con las dos
columnas del formato unificado por `apps/web/src/numerarParche.ts` (pura; es también quien
corta la cabecera de git), los `DESPLEGADOS_AL_ABRIR` primeros abiertos solos y el resto al
pulsar, y a la derecha el árbol de cambiados. La cabecera dice «Sesión» porque la foto es de
la sesión: es el hueco del selector de turno que no existe. **Ficheros** es el árbol del
proyecto con un visor de SOLO lectura (`agent/arbolDeProyecto.ts`, mensajes `arbol` y
`fichero`): lista con la misma función del completado del Tab (`ficherosDelProyecto`, con el
tope de profundidad como parámetro) y filtra con las MISMAS reglas que ve el agente
—`puedeLeerRuta` y `esVistaAplanada`—, así que `.xonecode`, `.env`, `.git` y los `.xml`
aplanados no salen ni se leen aunque alguien los teclee en el cable. El lector rechaza en
orden ruta absoluta o con `..`, lo que la barrera niega, aplanadas, y cualquier `realpath` que
salga de la raíz (el enlace simbólico que apunta fuera), y nunca devuelve la ruta real de la
máquina. Binario es un NUL en los primeros 8 KB; lo que no es UTF-8 se lee como latin1 y se
dice; el contenido se recorta al mismo tope que el parche. El visor es el `CodeBlock` de
deepseek —un solo resaltador, un solo tema— y los números de línea son un contador CSS sobre
los `.line` de shiki (`Visor.module.css`): con una gramática perezosa el primer render sale
plano y se repinta solo. Las dos pestañas comparten `Arbol.tsx` (primer nivel abierto, filtro
por subcadena de la ruta que abre lo que casa) y la maqueta de dos columnas con el corte por
CONTENEDOR a 720 px, no por ventana. El árbol y los contenidos se tiran con la sesión y sin
cable, como los parches.
```

y dejar a continuación el texto original del párrafo desde «La marca es una **ref propia**…», cambiando «pestaña «Ficheros»» por «pestaña «Revisión»» donde aparezca y quitando la frase «La lista y el diff son **dos paneles**, no un acordeón: … cuántos más había.» (la maqueta cambió; la cabecera pegajosa resuelve lo que aquella frase justificaba).

- [ ] **Step 2: La suite entera y el build**

Run: `npm run typecheck && npm test && npm run build:web && test -f apps/web/dist/index.html && echo OK`
Expected: termina en `OK`, con cero tests en rojo. Si `frontera.test.ts` o `tipos.test.ts` fallan, es una divergencia entre `tipos.ts` y `transporte.ts`: igualar literales.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — las pestañas Ficheros y Revisión de la consola web"
```

```json:metadata
{"files": ["CLAUDE.md"], "verifyCommand": "npm run typecheck && npm test && npm run build:web && test -f apps/web/dist/index.html && echo OK", "acceptanceCriteria": ["CLAUDE.md describe las dos pestañas y sus reglas", "typecheck, npm test y build:web en verde"], "modelTier": "mechanical"}
```

---

## Comprobación manual (después de la Task 11, fuera del plan automático)

`npm run web -- --puerto 4200`, abrir un proyecto con copia local, y mirar: (1) Ficheros lista el proyecto sin `.xonecode` ni `.xml` aplanados, abre un `.xne` con XML coloreado y números; (2) Revisión tras un turno que escribió: total en la cabecera, ocho desplegados, números viejo/nuevo correctos contra el fichero; (3) estrechar la ventana por debajo de 720 px de panel: el índice de Revisión se va y el árbol de Ficheros pasa arriba.
