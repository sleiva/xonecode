# Adjuntos en el chat de una sesión (IXCODE-7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la persona pueda anexar ficheros (un icono, una imagen, un documento) al chat de una
sesión de la consola web —con un botón «+», arrastrando o pegando—, que el orquestador reciba el
contexto de qué hay y dónde, y que un especialista que escribe en el proyecto pueda meter un
adjunto dentro (p. ej. `icons/ic_add.png`) **pasando por la aprobación**.

**Architecture:** Los bytes suben por el `POST /adjunto` que ya usan las tareas, ampliado a la
SESIÓN abierta (`?para=sesion`), a `.xonecode/sesiones/<id>/adjuntos/` —hermana de `artefactos/`—.
El agente la ve montada como `/adjuntos/` (de solo lectura, fila incondicional de `permisosDe`),
en los DOS motores. El mensaje que los anexa viaja con sus NOMBRES (`prosa.adjuntos`) y el servidor
le añade el inventario (`core/adjuntos.ts#conAdjuntos`). Una tool nueva, `incorporar_adjunto`,
copia los bytes al proyecto; su destino va en `file_path` para que la ruta de la tarjeta,
`seDetieneEn`, el modo autónomo y TrueForge la entiendan sin tocarlos, y entra en el HITL de los
dos motores por NOMBRE, con una vista de «fichero binario» en la tarjeta.

**Tech Stack:** TypeScript, deepagents/langgraph (HITL por `interruptOn`), `@truefoundry/trueforge-core`
(`requireApprovalForTools`), `node:http`, React + Vite, Vitest (+ Testing Library en el cliente).

**Spec:** este documento (el diseño se acordó en la conversación; no hay spec aparte). Mapa del
código de adjuntos y de la aprobación: ver «Contexto» abajo.

## Global Constraints

- **Nombres, dichos una vez y usados siempre igual:** la tool `incorporar_adjunto`; su argumento de
  origen `adjunto` y el de destino **`file_path`** (NO `destino`: es lo que leen `ficheroDe`,
  `seDetieneEn` y `rondasDe` de TrueForge); la carpeta `carpetaDeAdjuntosDeSesion(raiz, id)` =
  `<raiz>/.xonecode/sesiones/<id>/adjuntos`; el parámetro HTTP `para=sesion`; el campo de cable
  `adjuntos?: string[]` en `{ clase: "prosa" }` y en el acto `{ tipo: "usuario" }`; la opción de
  consola `conAdjuntosDelMensaje`.
- **Toda escritura en el PROYECTO pasa por la aprobación** (salvo modo autónomo / tarea de fondo,
  que ya aprueban por su vía). `incorporar_adjunto` NO escribe en `/artefactos/` ni en `/planes/`:
  es solo para el proyecto.
- **`/adjuntos/` es de solo lectura** y su fila en `permisosDe` sigue incondicional; no se toca.
- **Ninguna ruta de la máquina viaja por el cable** (`sinRutas`); de un error de Node, solo el `code`.
- **`npm test` sin red, sin clave, sin Chrome**; los tests de cableado usan la librería REAL (patrón
  de fallo de `CLAUDE.md`: una composición dentro de algo que los tests doblan no está probada).
- **Un control sin dato detrás no se pinta**: el «+» solo con sesión abierta y `alSubirAdjunto`.
- **Ningún color literal fuera de `estilos/marca.css`/`splash.css`** (`Barra.test.tsx`); los roles
  de botón se COMPONEN de `Boton.module.css` sin redeclarar padding/font/border/background/color.
- El `.md` y los comentarios, en castellano y con el tono del repo. `CLAUDE.md` no cita fechas ni
  recuentos (`src/documentacion.test.ts`).

**User decisions (already made):**
- «si, con aprobación»: meter un adjunto en el proyecto pasa por la aprobación.
- «para diseñador y desarrollador»: la tool la tienen `designer-xone` y `developer-xone`.
- «podríamos pasarla al orquestador que cuando anexes algo que lo pases a /adjuntos de la sesión y
  pases el contexto»: el fichero cae en `/adjuntos/` de la SESIÓN y el orquestador recibe el
  inventario para delegarlo.
- «pongamos un botón con un (+) o un icono de anexar»: el botón es un «+». La maqueta de Stitch NO
  trae ese glifo: se dibuja con el mismo trazo que `IconosDelCompositor.tsx` y se dice.
- Arrastrar y pegar se quedan como atajos del mismo gesto.

## Contexto (lo que ya hay, medido)

- Tareas: `NuevaTarea.tsx` sube con `<input type="file">`; `conexion.ts#subirAdjunto` hace
  `POST /adjunto?tarea=&nombre=`; `arranque.ts` (`servidor.registrarRuta("POST", RUTA_ADJUNTO…)`)
  valida y llama `colaDeTareas.guardarAdjunto`; `tareasEnDisco.ts` guarda (tope 20 MB/fichero,
  50 MB/tarea, 0600) y lista; `corredorDeTareas.ts:1027` aplica `conAdjuntos`.
- Montaje: `proyecto.ts#backendConAdjuntos` (`/adjuntos/`, `FilesystemBackend` virtual); lo pasa
  `crearEjecutorReal` (`cli/main.ts`, opción `adjuntos`) → `abrirSesionReal` (`turnoReal.ts:202,481`).
  **TrueForge no lo recibe**: `turnoReal.ts:280` no pasa `adjuntos` a `abrirSesionTrueforge`, y
  `sesionTrueforge.ts#montarBackend` no lo pasa a `backendDeAgente`.
- Aprobación: por NOMBRE de tool. deepagents: `perfiles.ts#hitlDe` itera `TOOLS_ESCRITURA`;
  `TEXTO_HITL`; `seDetieneEn` lee `args.file_path`. Tarjeta: `interrupts.ts#ficheroDe` (claves
  `file_path`…) y `#cambioDe` (solo `write_file`/`edit_file`; otra tool → `undefined`). TrueForge:
  `capacidades.ts#capacidadDePropias` fija `SIN_APROBACION`; `sesionTrueforge.ts#rondasDe` usa
  `args.file_path`, `TEXTO_HITL` y `cambioDe`. Tras aprobar, la PROPIA tool escribe.
- `copiarArtefacto.ts`: guardas reutilizables (`puedeEscribirRuta`, `artefactoFueraDeSitio`,
  `realpath` dentro de la raíz). Ojo: hace `mkdirSync` ANTES del chequeo de contención; aquí no.
- XOne: los iconos van en la carpeta `icons` de la app (`##APP##\icons\x.png`).

---

### Task 1: core — la carpeta de adjuntos de una sesión y el inventario del mensaje

**Goal:** Las dos reglas puras que usan los demás: dónde viven los adjuntos de una sesión y el texto
con que se le cuentan al agente cuando llegan en un mensaje.

**Files:**
- Modify: `src/core/adjuntos.ts`
- Test: `src/core/adjuntos.test.ts`

**Acceptance Criteria:**
- [ ] `carpetaDeAdjuntosDeSesion("/p", "abc")` === `"/p/.xonecode/sesiones/abc/adjuntos"` y lanza con un id `"../x"` (mismo `segmentoSeguro` que los artefactos).
- [ ] `conAdjuntos(p, lista)` sin tercer argumento produce EXACTAMENTE el texto de hoy (tareas intactas).
- [ ] `conAdjuntos(p, lista, "mensaje")` dice «ADJUNTOS DE ESTE MENSAJE (n)», nombra `/adjuntos/<nombre>` por fichero y la línea «Para meter uno en el proyecto… `incorporar_adjunto`… pasa por la aprobación».
- [ ] Con lista vacía devuelve la petición tal cual en los dos modos.

**Verify:** `npx vitest run src/core/adjuntos.test.ts` → todos en verde.

**Steps:**

- [ ] **Step 1: tests que fallan** (añadir al final de `src/core/adjuntos.test.ts`):

```ts
import { carpetaDeAdjuntosDeSesion, conAdjuntos } from "./adjuntos.js";

describe("adjuntos de una SESIÓN (IXCODE-7)", () => {
  it("viven al lado de los artefactos de la sesión, con el id comprobado", () => {
    expect(carpetaDeAdjuntosDeSesion("/p", "abc")).toBe("/p/.xonecode/sesiones/abc/adjuntos");
    expect(() => carpetaDeAdjuntosDeSesion("/p", "../x")).toThrow();
  });

  it("el inventario de un MENSAJE lo dice, y dice cómo meterlo en el proyecto", () => {
    const t = conAdjuntos("pon este icono en el menú", [{ nombre: "ic_add.png", bytes: 1200, mime: "image/png" }], "mensaje");
    expect(t).toContain("ADJUNTOS DE ESTE MENSAJE (1)");
    expect(t).toContain("/adjuntos/ic_add.png");
    expect(t).toMatch(/incorporar_adjunto/);
    expect(t).toMatch(/pasa por la aprobación/);
  });

  it("sin tercer argumento es el texto de las TAREAS de siempre", () => {
    const t = conAdjuntos("x", [{ nombre: "a.md", bytes: 10 }]);
    expect(t).toContain("ADJUNTOS DE ESTA TAREA (1)");
    expect(t).not.toMatch(/incorporar_adjunto/);
  });

  it("sin adjuntos no toca nada, en los dos modos", () => {
    expect(conAdjuntos("x", [], "mensaje")).toBe("x");
  });
});
```

- [ ] **Step 2:** `npx vitest run src/core/adjuntos.test.ts` → FALLA (`carpetaDeAdjuntosDeSesion` no existe).

- [ ] **Step 3: implementación** en `src/core/adjuntos.ts`:

```ts
import { join } from "node:path";
import { segmentoSeguro } from "./settings.js";

/**
 * Dónde caen en DISCO los adjuntos que una persona anexa en el CHAT de una sesión (IXCODE-7):
 * `.xonecode/sesiones/<id>/adjuntos/`, HERMANA de `artefactos/`. A diferencia de los de una tarea
 * (`~/.xonecode/tareas/<id>/adjuntos/`), una sesión ya tiene carpeta en el proyecto, y `.xonecode`
 * no entra en git ni sube a CloudStudio. `segmentoSeguro`: el id llega del cliente.
 */
export function carpetaDeAdjuntosDeSesion(raiz: string, id: string): string {
  return join(raiz, ".xonecode", "sesiones", segmentoSeguro(id, "id de sesión"), "adjuntos");
}
```

y la firma de `conAdjuntos` pasa a
`conAdjuntos(peticion, adjuntos, de: "tarea" | "mensaje" = "tarea")`. Con `de === "mensaje"`,
la cabecera es:

```ts
`ADJUNTOS DE ESTE MENSAJE (${adjuntos.length}). Los ha anexado la persona en el chat y están`,
`montados en «${RUTA_ADJUNTOS}», de SOLO lectura: se leen con las tools de fichero y no se`,
"pueden escribir ni borrar. No son ficheros del proyecto. Para meter uno en el proyecto (un",
"icono en `icons/`, por ejemplo), quien escribe en el proyecto tiene `incorporar_adjunto`, que",
"pasa por la aprobación: al delegar, di qué adjunto y dónde va.",
```

(con `de === "tarea"` las tres primeras líneas de hoy, sin tocar). El resto —lista de ficheros y
aviso de imágenes— igual en los dos. Documentar el parámetro con su porqué (el orquestador tiene
que saber qué hay para delegarlo: decisión de la persona).

- [ ] **Step 4:** `npx vitest run src/core/adjuntos.test.ts src/core/imports.test.ts` → verde.
- [ ] **Step 5: commit** `feat(core): la carpeta de adjuntos de una sesión y el inventario de un mensaje (IXCODE-7)`.

```json:metadata
{"files": ["src/core/adjuntos.ts", "src/core/adjuntos.test.ts"], "verifyCommand": "npx vitest run src/core/adjuntos.test.ts src/core/imports.test.ts", "acceptanceCriteria": ["carpetaDeAdjuntosDeSesion con segmentoSeguro", "conAdjuntos de tarea intacto", "conAdjuntos de mensaje nombra incorporar_adjunto y la aprobación", "sin adjuntos no toca"], "modelTier": "mechanical"}
```

---

### Task 2: disco — guardar y listar los adjuntos de una sesión

**Goal:** El guardado y el listado en `.xonecode/sesiones/<id>/adjuntos/`, con las MISMAS barreras
que los de tarea (nombre en lista blanca, sin enlaces, topes, 0600/0700).

**Files:**
- Create: `src/agent/sesiones/adjuntosDeSesion.ts`
- Test: `src/agent/sesiones/adjuntosDeSesion.test.ts`

**Acceptance Criteria:**
- [ ] `guardarAdjuntoDeSesion(raiz, id, nombre, datos)` escribe `0600` en `carpetaDeAdjuntosDeSesion`, creando la carpeta `0700`; devuelve `{ok:true}`.
- [ ] Rechaza (`{ok:false, motivo}`, sin ruta en el motivo) un nombre fuera de `nombreDeAdjuntoAceptable`, un fichero > `TOPE_DE_ADJUNTO_DE_SESION` (20 MB) y lo que haga pasar la sesión de `TOPE_DE_ADJUNTOS_POR_SESION` (50 MB).
- [ ] No escribe si `adjuntos` (o `sesiones/<id>`) es un ENLACE simbólico (lstat), ni si el realpath sale de `<raiz>/.xonecode/sesiones`.
- [ ] `listarAdjuntosDeSesion(raiz, id, nombres?)` devuelve `{nombre, bytes, mime?}` solo de ficheros llanos con nombre aceptable, ordenados; con `nombres` filtra a esos (en ese orden, omitiendo los que no están).

**Verify:** `npx vitest run src/agent/sesiones/adjuntosDeSesion.test.ts` → verde.

**Steps:**

- [ ] **Step 1: tests que fallan** (carpetas temporales con `mkdtempSync`; casos: guarda y lista con mime `image/png`; nombre `../x` rechazado; 20 MB+1 rechazado con `TOPE_DE_ADJUNTO_DE_SESION` inyectable por opción `topes`; enlace simbólico `adjuntos → /tmp/fuera` rechazado y nada escrito fuera; filtro por `nombres` respeta orden y omite ausentes; motivo sin la ruta de `raiz`).
- [ ] **Step 2:** correr → FALLA (módulo no existe).
- [ ] **Step 3: implementación**. Seguir el cuerpo de `tareasEnDisco.ts#guardarAdjunto`/`#listarAdjuntos`
  (mismo `lstatSync`, `mimeDeAdjunto`, `writeFileSync(..., { mode: 0o600 })`,
  `mkdirSync(..., { recursive: true, mode: 0o700 })`), con la contención ANTES de crear nada:

```ts
export const TOPE_DE_ADJUNTO_DE_SESION = 20_000_000;
export const TOPE_DE_ADJUNTOS_POR_SESION = 50_000_000;

/** La carpeta, comprobada: ni `sesiones/<id>` ni `adjuntos` pueden ser un enlace, y el camino
 *  real no puede salir de `.xonecode/sesiones`. `undefined` = no se toca. */
function carpetaComprobada(raiz: string, id: string): string | undefined { … }

export function guardarAdjuntoDeSesion(raiz: string, id: string, nombre: string, datos: Buffer,
  topes = { porFichero: TOPE_DE_ADJUNTO_DE_SESION, porSesion: TOPE_DE_ADJUNTOS_POR_SESION }
): { ok: true } | { ok: false; motivo: string } { … }

export function listarAdjuntosDeSesion(raiz: string, id: string, nombres?: readonly string[]): AdjuntoNombrable[] { … }
```

  Los motivos: `"ese nombre no vale para un adjunto"`, `` `el fichero es demasiado grande (tope ${MB} MB)` ``,
  `` `esta sesión ya no admite más adjuntos (tope ${MB} MB)` ``.
- [ ] **Step 4:** verde. **Step 5: commit** `feat(sesiones): guardar y listar los adjuntos de una sesión (IXCODE-7)`.

```json:metadata
{"files": ["src/agent/sesiones/adjuntosDeSesion.ts", "src/agent/sesiones/adjuntosDeSesion.test.ts"], "verifyCommand": "npx vitest run src/agent/sesiones/adjuntosDeSesion.test.ts", "acceptanceCriteria": ["guarda 0600 en la carpeta de la sesión", "rechaza nombre, tope por fichero y por sesión", "rechaza enlaces y salidas de sesiones/", "lista filtrando por nombres"], "modelTier": "mechanical"}
```

---

### Task 3: servidor y cable — subir a la sesión abierta y mandar el mensaje con sus adjuntos

**Goal:** `POST /adjunto?para=sesion&nombre=` guarda en la sesión ABIERTA; `{clase:"prosa", adjuntos}`
deja el acto de usuario con sus nombres y le pasa al agente el texto con el inventario.

**Files:**
- Modify: `src/web/servidor/arranque.ts` (ruta `RUTA_ADJUNTO`)
- Modify: `src/web/servidor/consolaWeb.ts` (`recibir`, opción `conAdjuntosDelMensaje`)
- Modify: `src/web/servidor/vestibulo.ts` (construye `conAdjuntosDelMensaje` con `raiz` + `idDeHilo`)
- Modify: `src/web/servidor/transporte.ts`, `apps/web/src/tipos.ts` (prosa.adjuntos), `src/core/actos.ts` (acto usuario.adjuntos)
- Test: `src/web/servidor/arranque.test.ts`, `src/web/servidor/consolaWeb.test.ts`, `src/web/servidor/vestibulo.test.ts`

**Acceptance Criteria:**
- [ ] `POST /adjunto?para=sesion&nombre=ic.png` con un proyecto abierto → 204 y el fichero en `carpetaDeAdjuntosDeSesion(raiz, idDeHilo)`; sin proyecto abierto → 409 «no hay ninguna sesión abierta»; nombre malo → 403; > tope → 413. El camino `?tarea=` no cambia (sus tests siguen verdes).
- [ ] `recibir({clase:"prosa", texto, adjuntos:["ic.png"]})` anota `{tipo:"usuario", texto, adjuntos:["ic.png"]}` y lo que va al lazo / a `notaMientrasTrabaja` / a `detenerMientrasTrabaja` es `conAdjuntosDelMensaje(texto, ["ic.png"])`.
- [ ] Sin `adjuntos` (o vacío) todo es byte a byte como hoy (el acto no lleva el campo).
- [ ] Prosa vacía CON adjuntos se acepta (texto "" + inventario); vacía y sin adjuntos, como hoy.
- [ ] `vestibulo.ts` compone `conAdjuntosDelMensaje` con `listarAdjuntosDeSesion(raiz, idDeHilo, nombres)` + `conAdjuntos(..., "mensaje")` — probado en `vestibulo.test.ts` con disco real (no doble).
- [ ] `tipos.test.ts` verde (los literales `clase:`/`tipo:` no cambian).

**Verify:** `npx vitest run src/web/servidor apps/web/src/tipos.test.ts` → verde.

**Steps:**

- [ ] **Step 1: tests que fallan.** En `arranque.test.ts`, dentro de `describe("POST /adjunto")`, casos nuevos con proyecto abierto (usar los dobles que ya abren proyecto en ese fichero) para `para=sesion`. En `consolaWeb.test.ts`:

```ts
it("una prosa con ADJUNTOS los apunta en el acto y le pasa al agente el inventario", async () => {
  const c = crearConsolaWeb({ conAdjuntosDelMensaje: (t, n) => `${t}\n[ADJ:${n.join(",")}]` });
  const it = c.consola.lineas[Symbol.asyncIterator]();
  c.recibir({ clase: "prosa", texto: "pon el icono", adjuntos: ["ic.png"] });
  expect(c.actos()).toEqual([{ tipo: "usuario", texto: "pon el icono", adjuntos: ["ic.png"] }]);
  expect(await it.next()).toEqual({ value: { texto: "pon el icono\n[ADJ:ic.png]", comoComando: false }, done: false });
});
```

  (y dos más: la nota con turno en vuelo lleva el inventario; sin adjuntos el acto no lleva el campo). En `vestibulo.test.ts`, un proyecto en un temporal, guardar un adjunto con `guardarAdjuntoDeSesion`, mandar prosa con él y comprobar que la línea que recibe el ejecutor contiene `/adjuntos/ic.png`.
- [ ] **Step 2:** correr → FALLA.
- [ ] **Step 3: implementación.**
  - `transporte.ts` y `apps/web/src/tipos.ts`: `{ clase: "prosa"; texto: string; detener?: true; adjuntos?: string[] }`.
  - `core/actos.ts` y `apps/web/src/tipos.ts`: `{ tipo: "usuario"; texto: string; adjuntos?: string[] }`.
  - `consolaWeb.ts`: opción
    `conAdjuntosDelMensaje?: (texto: string, nombres: readonly string[]) => string` (doc: la compone el vestíbulo, que sabe la raíz y el id; este módulo no conoce el disco). En `recibir`, rama prosa: `const nombres = (mensaje.adjuntos ?? []).filter(nombreDeAdjuntoAceptable);` → anotar `{tipo:"usuario", texto: mensaje.texto, ...(nombres.length ? {adjuntos: nombres} : {})}` (respetando la regla ya existente de no anotar un DETENER vacío); `const texto = nombres.length && opciones.conAdjuntosDelMensaje ? opciones.conAdjuntosDelMensaje(mensaje.texto, nombres) : mensaje.texto;` y usar `texto` en `detenerMientrasTrabaja`, `notaMientrasTrabaja` y la `LineaDeConsola`.
  - `vestibulo.ts`: junto a `notaMientrasTrabaja`, `const conAdjuntosDelMensaje = (texto, nombres) => conAdjuntos(texto, listarAdjuntosDeSesion(raiz, idSesion, nombres), "mensaje");` (el id con que se montó el disco de ESTA conversación — el mismo que usa la carpeta de artefactos) y pasarlo a `crearConsola`.
  - `arranque.ts`, ruta `RUTA_ADJUNTO`: si `query.get("para") === "sesion"`: validar `nombre`, `const abierto = vestibulo.proyectoAbierto()`; sin él 409; `leerCuerpoCrudo(peticion, TOPE_DE_ADJUNTO_DE_SESION)` (413 si no cabe); `guardarAdjuntoDeSesion(abierto.raiz, abierto.idDeHilo, nombre, datos)` (413 con su motivo); 204. El resto de la ruta, intacto.
- [ ] **Step 4:** verde + `npm run typecheck`.
- [ ] **Step 5: commit** `feat(web): subir un adjunto a la sesión abierta y mandarlo con el mensaje (IXCODE-7)`.

```json:metadata
{"files": ["src/web/servidor/arranque.ts", "src/web/servidor/consolaWeb.ts", "src/web/servidor/vestibulo.ts", "src/web/servidor/transporte.ts", "apps/web/src/tipos.ts", "src/core/actos.ts", "src/web/servidor/arranque.test.ts", "src/web/servidor/consolaWeb.test.ts", "src/web/servidor/vestibulo.test.ts"], "verifyCommand": "npx vitest run src/web/servidor apps/web/src/tipos.test.ts && npm run typecheck", "acceptanceCriteria": ["POST /adjunto?para=sesion guarda en la sesión abierta, 409 sin ella", "la prosa con adjuntos deja el acto con nombres y manda el inventario", "sin adjuntos nada cambia", "vestibulo compone con disco real"], "modelTier": "standard"}
```

---

### Task 4: los dos motores montan `/adjuntos/` en una sesión humana

**Goal:** En una sesión de la web, el agente —en deepagents Y en TrueForge— ve
`/adjuntos/<nombre>` de la sesión, de solo lectura. Cierra también el agujero de TrueForge, que
no montaba los de una TAREA.

**Files:**
- Modify: `src/cli/main.ts` (`crearEjecutorReal`: sin adjuntos de tarea y con carpeta de artefactos por sesión, `adjuntos: carpetaDeAdjuntosDeSesion(estado.raiz, estado.hilo)`)
- Modify: `src/agent/turno/turnoReal.ts` (pasar `adjuntos` a `abrirSesionTrueforge`)
- Modify: `src/agent/motores/trueforge/sesionTrueforge.ts` (`OpcionesDeSesionTrueforge.adjuntos?`, `montarBackend` → `backendDeAgente({... adjuntos})`)
- Modify: comentarios de `vestibulo.ts` / `main.ts` que dicen «por la puerta de las personas nunca se monta»
- Test: `src/agent/motores/trueforge/sesionTrueforge.test.ts`, `src/cli/main.test.ts` (o el test que ya cubre `crearEjecutorReal`)

**Acceptance Criteria:**
- [ ] TrueForge con `adjuntos: <carpeta>`: un hijo que hace `read_file /adjuntos/a.txt` recibe su contenido (guion + orquestador REAL); `write_file /adjuntos/a.txt` es denegado.
- [ ] TrueForge sin `adjuntos`: `/adjuntos/a.txt` no existe (no monta el cwd).
- [ ] `crearEjecutorReal` con carpeta de artefactos por sesión y sin adjuntos de tarea pasa `adjuntos = carpetaDeAdjuntosDeSesion(raiz, hilo)`; con adjuntos de tarea, gana el de la tarea; sin carpeta de artefactos (terminal), no pasa nada.
- [ ] `vestibulo.test.ts` «la puerta de las personas no reenvía adjuntos» sigue verde (el vestíbulo no reenvía: los de sesión los deriva el ejecutor, como los artefactos).

**Verify:** `npx vitest run src/agent/motores/trueforge src/cli src/web/servidor/vestibulo.test.ts src/agent/grafo/xoneAgent.adjuntos.test.ts` → verde.

**Steps:**
- [ ] **Step 1:** tests que fallan (TrueForge: `modelosConGuion` con un `create_sub_agent developer-xone` y un `read_file {file_path:"/adjuntos/a.txt"}`, y comprobar que la llamada siguiente del hijo lleva el contenido; y el de `write_file` denegado).
- [ ] **Step 2:** FALLA. **Step 3:** implementar (tres líneas de cableado + opción tipada). **Step 4:** verde. **Step 5: commit** `feat(motores): /adjuntos/ de la sesión en los dos motores, y TrueForge monta los de una tarea (IXCODE-7)`.

```json:metadata
{"files": ["src/cli/main.ts", "src/agent/turno/turnoReal.ts", "src/agent/motores/trueforge/sesionTrueforge.ts", "src/web/servidor/vestibulo.ts", "src/agent/motores/trueforge/sesionTrueforge.test.ts", "src/cli/main.test.ts"], "verifyCommand": "npx vitest run src/agent/motores/trueforge src/cli src/web/servidor/vestibulo.test.ts src/agent/grafo/xoneAgent.adjuntos.test.ts", "acceptanceCriteria": ["TrueForge lee /adjuntos/ con la carpeta y no escribe ahí", "sin carpeta no monta nada", "crearEjecutorReal deriva la carpeta de la sesión y gana la de la tarea", "la puerta de las personas no reenvía"], "modelTier": "standard"}
```

---

### Task 5: `incorporar_adjunto`, con aprobación en los dos motores

**Goal:** La tool que copia `/adjuntos/<nombre>` a `file_path` del proyecto, solo para quien escribe
el proyecto sin `escribeEn` (hoy `designer-xone` y `developer-xone`), que SIEMPRE pregunta en modo
supervisado y enseña en la tarjeta la ruta y una línea de «fichero binario».

**Files:**
- Create: `src/agent/grafo/incorporarAdjunto.ts`
- Test: `src/agent/grafo/incorporarAdjunto.test.ts`
- Modify: `src/agent/grafo/perfiles.ts` (`TEXTO_HITL`, `hitlDe` incluye la tool), `src/agent/turno/interrupts.ts` (`cambioDe` rama nueva), `src/agent/turno/resumenDeTool.ts` (detalle `file_path`)
- Modify: `src/agent/grafo/xoneAgent.ts` (tools del subagente), `src/agent/motores/trueforge/capacidades.ts` (`capacidadDePropias(tools, backend, conAprobacion?: readonly string[])`), `src/agent/motores/trueforge/sesionTrueforge.ts` (`propiasDe`)
- Test: `src/agent/grafo/perfiles.test.ts`, `src/agent/turno/interrupts.test.ts`, `src/agent/grafo/xoneAgent.adjuntos.test.ts`, `src/agent/motores/trueforge/sesionTrueforge.test.ts`

**Acceptance Criteria:**
- [ ] Copia los bytes exactos (un PNG con ceros) de `<carpetaAdjuntos>/<nombre>` a `<raiz>/<file_path>`, creando carpetas SOLO después de comprobar la contención; devuelve texto con la ruta relativa y los bytes.
- [ ] Rechaza (devuelve `{error}`-texto, nunca lanza): origen fuera de `/adjuntos/<nombre-aceptable>`; adjunto inexistente; `file_path` que `puedeEscribirRuta(perfil, …)` no permite; `artefactoFueraDeSitio`; rutas de `/artefactos/`, `/planes/`, `/adjuntos/`, `/skills/`; realpath fuera de la raíz (enlace simbólico) — sin crear nada fuera.
- [ ] Se monta SOLO con carpeta de adjuntos y para un perfil `!soloLectura && ejecucion !== true && (escribeEn ?? []).length === 0`; de los de serie, exactamente `designer-xone` y `developer-xone` (test que lo recorre).
- [ ] deepagents: `hitlDe(developer)` tiene la clave `incorporar_adjunto` con `seDetieneEn`; un turno con el guion llamando a la tool se PARA con un pendiente cuyo `ficheroDe` es el `file_path` y cuya vista (`cambioDe`) es una línea `anadido` que empieza por `[fichero binario]` y nombra el adjunto; aprobado, el fichero aparece; rechazado, no.
- [ ] TrueForge: la misma tool en `propiasDe` del developer/diseñador, con `requireApprovalForTools: ["incorporar_adjunto"]`; un turno se para en aprobación, la tarjeta lleva la ruta y la línea binaria, y con «allow» se escribe (orquestador REAL).
- [ ] Modo autónomo: se aplica sola y queda en `aplicadasSinPreguntar` por su ruta (sin cambios de código: comprobarlo con un test).

**Verify:** `npx vitest run src/agent/grafo src/agent/turno src/agent/motores/trueforge` → verde.

**Steps:**

- [ ] **Step 1: tests de la tool que fallan** (`incorporarAdjunto.test.ts`: raíz y carpeta temporales, perfil de `developer-xone` de `AGENTES_DE_SERIE`; casos del segundo criterio uno a uno; el PNG con `Buffer.from([0x89,0x50,0x4e,0x47,0,0,1])` se compara con `equals`).
- [ ] **Step 2:** FALLA.
- [ ] **Step 3: la tool**:

```ts
export const NOMBRE_INCORPORAR_ADJUNTO = "incorporar_adjunto";

const Entrada = z.object({
  adjunto: z.string().describe("El adjunto, por su ruta /adjuntos/<nombre> (la que dice el mensaje) o su nombre a secas"),
  file_path: z.string().describe("Dónde va en el PROYECTO, ruta virtual (p. ej. /icons/ic_add.png). Pide aprobación."),
});

/** Quien la recibe: escribe el PROYECTO y no está confinado por `escribeEn`. Regla de DATO, no una
 *  lista de nombres: hoy da `designer-xone` y `developer-xone`, que es lo que decidió la persona. */
export function recibeIncorporarAdjunto(a: Pick<Agente, "soloLectura" | "ejecucion" | "escribeEn">): boolean {
  return !a.soloLectura && a.ejecucion !== true && (a.escribeEn ?? []).length === 0;
}

export function crearIncorporarAdjunto(deps: { raiz: string; carpetaDeAdjuntos: string; perfil: QuienDecidePermisos }) {
  return tool(async (e) => { /* guardas del criterio 2 en orden; copyFileSync; texto */ }, {
    name: NOMBRE_INCORPORAR_ADJUNTO,
    description: "Copia un ADJUNTO que la persona anexó en el chat (/adjuntos/…) a una ruta del PROYECTO —un icono a /icons/, una imagen—. Copia los bytes tal cual (sirve para binarios, que write_file no puede escribir). Pasa por la aprobación de la persona.",
    schema: Entrada,
  });
}
```

  Guardas: reutilizar `puedeEscribirRuta`, `artefactoFueraDeSitio`, `esRutaDeArtefacto`,
  `esRutaDePlan`, `nombreDeAdjuntoAceptable`, `RUTA_ADJUNTOS`; `realpathSync` de la carpeta de
  adjuntos y del primer ancestro EXISTENTE del destino dentro de `realpath(raiz)` ANTES de `mkdirSync`.
- [ ] **Step 4: aprobación compartida.** `perfiles.ts`: `TEXTO_HITL.incorporar_adjunto = "copiar un adjunto al proyecto"`; `hitlDe` itera `[...TOOLS_ESCRITURA, NOMBRE_INCORPORAR_ADJUNTO]` (actualizar las expectativas de `perfiles.test.ts`). `interrupts.ts#cambioDe`, rama:

```ts
if (p.tool === "incorporar_adjunto") {
  const adjunto = p.args.adjunto;
  if (typeof adjunto !== "string") return undefined;
  // Un binario no tiene diff de líneas: se DICE qué se copia y adónde. El contenido no se
  // enseña (son bytes); lo que se aprueba es el fichero y su sitio.
  return { ruta, lineas: [{ tipo: "anadido", texto: `[fichero binario] se copia ${adjunto} a ${ruta} (si ya existe, se reemplaza)` }] };
}
```

  `resumenDeTool.ts`: `incorporar_adjunto: ["file_path"]`.
- [ ] **Step 5: deepagents.** `xoneAgent.ts`, tools del subagente: `...(opciones.adjuntos !== undefined && recibeIncorporarAdjunto(perfil) ? [crearIncorporarAdjunto({ raiz: opciones.raiz, carpetaDeAdjuntos: opciones.adjuntos, perfil })] : [])` (confirmar el nombre real de la opción de carpeta de adjuntos en `OpcionesDeAgente`). Test en `xoneAgent.adjuntos.test.ts` con `FakeListChatModel`/guion y la librería real: se para, `ficheroDe` y `cambioDe` como en el criterio.
- [ ] **Step 6: TrueForge.** `capacidadDePropias(tools, backend, conAprobacion: readonly string[] = [])` → selectors `{ ...SIN_APROBACION, requireApprovalForTools: [...conAprobacion] }`; `capacidadesDelEspecialista` le pasa `[NOMBRE_INCORPORAR_ADJUNTO]` cuando la tool está entre las propias; `propiasDe` añade la tool con la misma condición (carpeta de adjuntos + `recibeIncorporarAdjunto`). Test en `sesionTrueforge.test.ts` con `modelosConGuion`: hijo `developer-xone` llama la tool → `pedirAprobacion` recibe un pendiente con `ficheros.get(id) === "/icons/x.png"` y la línea binaria; aprobado, el fichero existe.
- [ ] **Step 7:** `npx vitest run src/agent/grafo src/agent/turno src/agent/motores/trueforge` + `npm run typecheck` → verde.
- [ ] **Step 8: commit** `feat(agente): incorporar_adjunto — meter un adjunto en el proyecto, con aprobación (IXCODE-7)`.

```json:metadata
{"files": ["src/agent/grafo/incorporarAdjunto.ts", "src/agent/grafo/incorporarAdjunto.test.ts", "src/agent/grafo/perfiles.ts", "src/agent/grafo/perfiles.test.ts", "src/agent/turno/interrupts.ts", "src/agent/turno/interrupts.test.ts", "src/agent/turno/resumenDeTool.ts", "src/agent/grafo/xoneAgent.ts", "src/agent/grafo/xoneAgent.adjuntos.test.ts", "src/agent/motores/trueforge/capacidades.ts", "src/agent/motores/trueforge/sesionTrueforge.ts", "src/agent/motores/trueforge/sesionTrueforge.test.ts"], "verifyCommand": "npx vitest run src/agent/grafo src/agent/turno src/agent/motores/trueforge && npm run typecheck", "acceptanceCriteria": ["copia bytes exactos con guardas y contención antes de mkdir", "solo designer y developer de serie", "deepagents se para con ruta y línea binaria", "TrueForge pide aprobación y escribe al aprobar", "modo autónomo la aplica y la anota"], "modelTier": "frontier"}
```

---

### Task 6: el compositor — «+», arrastrar y pegar

**Goal:** Anexar desde el chat: botón «+», soltar ficheros sobre la caja o pegar una imagen; fichas
con estado (subiendo/listo/falló) que se pueden quitar; el envío lleva los nombres; el globo del
usuario enseña lo anexado.

**Files:**
- Modify: `apps/web/src/componentes/IconosDelCompositor.tsx` (`IconoDeAnexar`, un «+»)
- Modify: `apps/web/src/componentes/Compositor.tsx`, `Compositor.module.css`
- Modify: `apps/web/src/conexion.ts` (`subirAdjuntoDeSesion(nombre, blob)` → `POST /adjunto?para=sesion&nombre=`)
- Modify: `apps/web/src/App.tsx` (pasa `alSubirAdjunto` solo con sesión abierta; `alEnviar(texto, adjuntos)` → `{clase:"prosa", texto, adjuntos}`)
- Modify: `apps/web/src/componentes/Chat.tsx` (el globo `usuario` pinta sus `adjuntos` como fichas)
- Test: `apps/web/src/componentes/Compositor.test.tsx`, `apps/web/src/conexion.test.ts`, `apps/web/src/App.test.tsx`

**Acceptance Criteria:**
- [ ] Sin `alSubirAdjunto` no hay «+» ni se aceptan soltados/pegados (control sin dato detrás no se pinta).
- [ ] Con él: el «+» (`aria-label="Anexar ficheros"`) abre un `<input type="file" multiple>` oculto; elegir 2 ficheros llama `alSubirAdjunto` 2 veces con nombres saneados por `nombreDeAdjuntoSeguro` y pinta 2 fichas.
- [ ] `drop` con `dataTransfer.files` hace lo mismo; mientras se arrastra, la caja lleva `data-arrastrando`.
- [ ] `paste` con `clipboardData.files` (una imagen) la sube como `pegado-<n>.<ext>` y NO pega texto.
- [ ] Una ficha «subiendo» o «falló» impide enviar (y dice por qué en el `title`); «quitar» la retira del envío.
- [ ] Enviar con fichas listas llama `alEnviar(texto, ["a.png","b.png"])` y vacía las fichas; se puede enviar solo adjuntos (texto vacío).
- [ ] `conexion.subirAdjuntoDeSesion` hace `POST /adjunto?para=sesion&nombre=<codificado>` con el blob y devuelve `{ok, motivo?}` sin lanzar.
- [ ] El globo del usuario con `adjuntos` pinta una ficha por nombre (texto, sin rutas).
- [ ] `Barra.test.tsx` y `Boton.test.ts` verdes (sin colores literales, sin redeclarar un rol).

**Verify:** `npx vitest run apps/web && npm run typecheck && npm run build:web` → verde.

**Steps:**
- [ ] **Step 1:** tests que fallan en `Compositor.test.tsx` (uno por criterio; `fireEvent.drop(caja, { dataTransfer: { files: [f] } })`, `fireEvent.paste(campo, { clipboardData: { files: [img], types: ["Files"] } })`, `new File([...], "Icono Nuevo.png", { type: "image/png" })` → nombre `Icono_Nuevo.png` o lo que devuelva `nombreDeAdjuntoSeguro`) y en `conexion.test.ts` (url y método).
- [ ] **Step 2:** FALLA.
- [ ] **Step 3: implementación.** `IconoDeAnexar`: `<Trazo><path d="M12 5v14M5 12h14" /></Trazo>`, con comentario: «la maqueta no trae este glifo: dibujado con el mismo trazo». Botón en la banda de abajo, a la izquierda del selector de modo, con rol `secundario` compuesto; `title` «Anexar ficheros (también puedes soltarlos o pegarlos)». Estado local `fichas: {nombre, estado: "subiendo"|"listo"|"falló", motivo?}[]`; nombres únicos (si repite, sufijo `-2`). La prop `alEnviar` pasa a `(texto: string, adjuntos: string[]) => void` (actualizar llamadores y tests existentes: sin fichas, `[]`).
- [ ] **Step 4:** verde + typecheck + `npm run build:web`.
- [ ] **Step 5: commit** `feat(web): anexar en el chat — «+», arrastrar y pegar (IXCODE-7)`.

```json:metadata
{"files": ["apps/web/src/componentes/IconosDelCompositor.tsx", "apps/web/src/componentes/Compositor.tsx", "apps/web/src/componentes/Compositor.module.css", "apps/web/src/conexion.ts", "apps/web/src/App.tsx", "apps/web/src/componentes/Chat.tsx", "apps/web/src/componentes/Compositor.test.tsx", "apps/web/src/conexion.test.ts", "apps/web/src/App.test.tsx"], "verifyCommand": "npx vitest run apps/web && npm run typecheck && npm run build:web", "acceptanceCriteria": ["sin alSubirAdjunto no hay +", "+ abre el selector y sube con nombres saneados", "drop y paste suben", "subiendo o falló impide enviar", "enviar lleva los nombres", "el globo pinta las fichas"], "modelTier": "standard"}
```

---

### Task 7: documentación y prueba de punta a punta en el navegador

**Goal:** Dejar la regla escrita donde el repo la pide y verlo funcionar de verdad: anexar un icono
en el chat, pedir que se ponga en el proyecto, aprobar, y ver el fichero en el disco.

**Files:**
- Modify: `CLAUDE.md` (sección de adjuntos/tareas y de la aprobación: una regla corta, sin fechas ni recuentos)
- Modify: `docs/DECISIONES.md` (entrada con lo medido)
- Modify: `src/core/adjuntos.ts` (cabecera: ya no son «de una tarea» solo)

**Acceptance Criteria:**
- [ ] `src/documentacion.test.ts` verde.
- [ ] Prueba real (consola web con `HOME` aislado y copia del proyecto, como en IXCODE-4): anexar `ic_prueba.png` con el «+», escribir «ponlo en icons del proyecto»; el orquestador delega en `designer-xone` o `developer-xone`; sale la tarjeta de aprobación con `icons/ic_prueba.png` y la línea `[fichero binario]`; aprobar; el fichero existe con los mismos bytes (`cmp`). Anotar tokens y llamadas del turno.
- [ ] Suite completo y typecheck en verde.

**Verify:** `npm run typecheck && npx vitest run --maxWorkers=2` → verde; `cmp <adjunto> <proyecto>/icons/ic_prueba.png` → sin salida.

**Steps:**
- [ ] **Step 1:** documentación. **Step 2:** prueba real y anotar lo medido en `DECISIONES.md`. **Step 3:** suite. **Step 4: commit** `docs(IXCODE-7): adjuntos en el chat — la regla y lo medido`.

```json:metadata
{"files": ["CLAUDE.md", "docs/DECISIONES.md", "src/core/adjuntos.ts"], "verifyCommand": "npm run typecheck && npx vitest run --maxWorkers=2", "acceptanceCriteria": ["documentacion.test.ts verde", "prueba real: tarjeta con ruta y línea binaria, fichero idéntico tras aprobar", "suite y typecheck en verde"], "modelTier": "standard"}
```
