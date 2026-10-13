# Panel en la web móvil — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers-extended-cc:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** que la web móvil de la sesión remota tenga una pestaña «Panel» con el estado de las consolas abiertas y de
las tareas en background, y que desde ella se aprueben escrituras de cualquier consola abierta y se dé feedback o
«Continuar» a una tarea que espera.

**Architecture:** el anfitrión compone un `panorama` (puro, `core/panorama.ts`) a partir del vestíbulo, del índice de
sesiones y de la cola de tareas, con ids OPACOS de consola por encendido; lo manda solo a los móviles (al entrar y, con
un intervalo, cuando cambia algo). El móvil contesta con `decision` + `consola`, `feedback` y `continuar`, que el
anfitrión enruta a la consola o tarea correcta por las MISMAS funciones del escritorio. El paquete valida las formas;
la web pinta pestañas, tarjetas e insignia.

**Tech Stack:** TypeScript, Node 22, React (web móvil, CSS global), vitest + jsdom, Playwright (e2e de la web móvil).

**Spec:** `docs/superpowers/specs/2026-10-13-panel-movil-design.md` (padre: `2026-10-09-sesion-remota-xonecode-design.md`).

## Global Constraints

- `npm test` de xonecode sin red, sin paquete, sin puente: dobles (`PuenteRemotoEnMemoria`) y `montarRutas` real.
- `core/` puro (`imports.test.ts`); `sinRutas`: la raíz de un proyecto NUNCA cruza al móvil; los ids de consola son
  opacos y se olvidan al apagar.
- Protocolo `v` 1 sin cambiar: solo clases y campos opcionales nuevos. Validadores alineados: el del paquete
  (`contenido.ts`) y el de xonecode (`core/remoto.ts`), cada uno con sus tests.
- Una `decision` con `consola` jamás cae a la consola en foco; un id desconocido o una consola sin aprobación en vuelo
  se descarta e informa.
- `panorama` no va a las pestañas del escritorio.
- Topes con nombre (`TAREAS_TERMINADAS_EN_PANORAMA`, `CARACTERES_DE_TITULO`, `CARACTERES_DE_MOTIVO`,
  `LINEAS_DE_DIFF_EN_PANORAMA`, `CARACTERES_DE_FEEDBACK`, `INTERVALO_DE_PANORAMA_MS` = 1 s) y el panorama cabe en
  `TOPE_DE_SALIDA_BYTES` (si no, quita diffs y después terminadas).
- CLAUDE.md sin fechas, recuentos ni duraciones sueltas (`documentacion.test.ts`).
- Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01SF55UskepprwaEuqEF2PMm`; stage por rutas explícitas; sin push.

**User decisions (already made):**
- «la (c) pero seria bueno ver el estado de las sessiones, no estaria mal tener un dashboard» — actuar solo sobre lo que
  espera (aprobar/rechazar en cualquier consola abierta, feedback/«Continuar» a tareas), más un panel de estado.
- Sin abrir sesiones, sin mover el foco, sin crear/encolar/descartar tareas desde el móvil.

## Rulings del controlador (de la exploración)

- «Consolas» = `proyectosAbiertos()` (la del foco + las que trabajan en segundo plano); las de tarea se ven como tareas.
- Nombre de proyecto = `basename(raiz)` (límite ya declarado).
- La pregunta de texto fuera de foco se enseña, no se contesta desde el panel.
- Diffs en el panorama, recortados; el panorama se ajusta al tope quitando diffs y luego terminadas.
- Ramas: `panel-movil` en los dos repos; xonecode en el worktree `.claude/worktrees/panel-movil`.

---

### Task 1: el contenido del protocolo (repo `xonecode-server`, paquete)

**Goal:** `panorama` en `MensajeDelAnfitrion` y `consola?`/`feedback`/`continuar` en `MensajeDelMovil`, con validación.

**Files:** `packages/remoto/src/contenido.ts`, `packages/remoto/test/contenido.test.ts` (el test «acepta las siete clases»
pasa a ocho).

**Acceptance Criteria:**
- [ ] `validarDelAnfitrion` reconstruye `panorama` campo a campo (consolas con `aprobacion` validada como la de hoy,
  tareas, `esperando` número ≥ 0), rechaza formas malas y no deja pasar campos desconocidos (p. ej. una `raiz`).
- [ ] `validarDelMovil`: `decision` con `consola` string opcional (vacía → rechazo); `feedback {tarea, texto}` con texto
  no vacío; `continuar {tarea}`; nada más pasa.
- [ ] `npm test` en la raíz verde; `VERSION_DEL_PROTOCOLO` sin cambiar.

**Verify:** `npm --prefix /Users/projects/xonecode-server test`

```json:metadata
{"repo":"xonecode-server","modelTier":"standard","files":["packages/remoto/src/contenido.ts","packages/remoto/test/contenido.test.ts"]}
```

### Task 2: lo puro del anfitrión (xonecode)

**Goal:** tipos y validación de la entrada nueva, `panorama` en la lista de salida, y el compositor puro del panorama.

**Files:** `src/core/remoto.ts` (+test): `EntradaDelMovil` con `consola?`, `feedback`, `continuar`; `filtrarSalida` deja
pasar `panorama`; `ajustarATope` sabe recortar un `panorama` (diffs → `recortada`, luego terminadas). Nuevo
`src/core/panorama.ts` (+test): `componerPanorama(entrada)` con `entrada = { consolas: {id, proyecto, sesion?, foco,
turnoEnVuelo, aprobacion?, preguntaPendiente, ultimaActividad?}[]; tareas: TareaDelCable-like[] }` → `panorama`
(estado por prioridad, orden de consolas: foco primero y luego por urgencia, tareas: requiere-atencion, en-proceso, nuevo
—respetando `tras`— y las últimas `TAREAS_TERMINADAS_EN_PANORAMA` terminadas; recortes con los topes; `esperando`).
Constantes de topes ahí.

**Acceptance Criteria:**
- [ ] Tests de `componerPanorama`: prioridad de estados, orden, topes, `esperando`, ningún campo con aspecto de ruta
  absoluta en la salida (test que lo busca).
- [ ] `ajustarATope` con un panorama enorme: primero quita diffs (marca `recortada`), luego terminadas; si ni así cabe,
  `undefined`.
- [ ] `imports.test.ts` verde.

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run src/core --maxWorkers=2`

```json:metadata
{"repo":"xonecode","modelTier":"standard","files":["src/core/remoto.ts","src/core/panorama.ts"]}
```

### Task 3: avisos de la consola (xonecode)

**Goal:** que una consola diga cuándo nace o termina su aprobación o su pregunta de texto, y si tiene una pregunta de
texto pendiente; y que el vestíbulo agregue esos avisos.

**Files:** `src/web/servidor/consolaWeb.ts` (+test): `hayPreguntaDeTextoPendiente(): boolean` (excluye las esperas con
`decision`), y un oyente `alCambiarEspera?(f)` (o equivalente) disparado al nacer/terminar una aprobación en vuelo y una
pregunta de texto. `src/web/servidor/vestibulo.ts` (+test): `ConsolaDeProyecto` expone `preguntaPendiente` y el
vestíbulo un `alCambiarEsperas(f)` que se dispara por cualquier consola abierta (persona), y también al mover el foco y al
volcar (título/última actividad).

**Acceptance Criteria:**
- [ ] Tests: el aviso salta al nacer y al terminar una aprobación y una pregunta; no salta por una pregunta con
  `decision`; el vestíbulo lo reenvía de una consola que NO está en foco.
- [ ] Sin cambios de comportamiento para el escritorio (suite de `src/web` verde).

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run src/web --maxWorkers=2`

```json:metadata
{"repo":"xonecode","modelTier":"frontier","files":["src/web/servidor/consolaWeb.ts","src/web/servidor/vestibulo.ts"]}
```

### Task 4: el cableado en el anfitrión (xonecode)

**Goal:** componer y mandar el panorama a los móviles, y enrutar lo que contestan.

**Files:** `src/web/servidor/puenteRemoto.ts` (+test): `difundir(mensaje)` a todos los móviles (por sus sumideros, con
`filtrarSalida`/`ajustarATope`), y `alEntrarMovil` para mandar el inicial solo al nuevo. `src/web/servidor/arranque.ts`:
mapa raíz → id opaco por encendido (se vacía al apagar), `panoramaAhora()` desde `proyectosAbiertos()`,
`sesionesDe(raiz)` (título, `ultimoTurno`), `mensajesDeAprobacion()`, `preguntaPendiente`, `turnoEnVuelo`, foco y la cola
de tareas (`filaDeTarea` + nombre); envío inicial en `engancharMovil`; difusión con intervalo
(`INTERVALO_DE_PANORAMA_MS`) en los gatillos `alCambiarTurno`, `emitirTareas`, `alCambiarEsperas`; `despachar` del móvil:
`decision` con `consola` → la consola de ese id (`c.recibir`), nunca la del foco; `feedback`/`continuar` → funciones
EXTRAÍDAS del manejador de `POST /accion` (`continuar` con su comprobación de `requiere-atencion`), compartidas con el
escritorio. `src/web/servidor/arranque.remoto.test.ts`: por `montarRutas` real.

**Acceptance Criteria:**
- [ ] El móvil recibe un `panorama` al entrar y otro tras un cambio (con temporizadores falsos y el intervalo); ninguna
  pestaña recibe `panorama`.
- [ ] Con dos consolas abiertas (una en foco, otra con aprobación en vuelo), una `decision` con el id de la segunda la
  resuelve sin tocar la del foco; un id desconocido no rechaza nada y se informa.
- [ ] `feedback`/`continuar` a una tarea en `requiere-atencion` la devuelven a la cola (y se emite); a una que no espera,
  se descarta e informa; el escritorio sigue igual (sus tests verdes).
- [ ] Ninguna raíz en los mensajes al móvil (test que la busca).

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run src/web src/core --maxWorkers=2`

```json:metadata
{"repo":"xonecode","modelTier":"frontier","files":["src/web/servidor/puenteRemoto.ts","src/web/servidor/arranque.ts","src/web/servidor/arranque.remoto.test.ts"]}
```

### Task 5: la web móvil (repo `xonecode-server`, `web/`)

**Goal:** pestañas Chat / Panel con insignia, y el panel con sus secciones y acciones.

**Files:** `web/src/estado.ts` (`panorama` en el estado y el reductor; contestar una aprobación del panel la cierra en
local por `contestado` con su consola), `web/src/conexion.ts` (si hace falta para el `contestado` por consola),
`web/src/App.tsx` (pestañas; Panel solo con `panorama`), componentes nuevos (`Pestanas.tsx`, `Panel.tsx`,
`TareaQueEspera.tsx`, y reutilizar `Aprobacion.tsx` con `consola`), `web/src/estilos.css`, tests en `web/test/`, e2e
`web/e2e/` (el anfitrión falso manda un `panorama` y comprueba `decision` con `consola`, `feedback` y `continuar`).

**Acceptance Criteria:**
- [ ] Tests: reductor (`panorama` sustituye entero; contestar en local quita esa tarjeta hasta el siguiente panorama),
  insignia con `esperando`, sin pestaña Panel sin `panorama`, tarjetas de cada sección, feedback vacío no se manda.
- [ ] e2e verde con viewport de móvil.
- [ ] `npm test` de la raíz verde (construye y copia la web al paquete).

**Verify:** `npm --prefix /Users/projects/xonecode-server test && npm --prefix /Users/projects/xonecode-server run e2e -w web`

```json:metadata
{"repo":"xonecode-server","modelTier":"standard","files":["web/src/"]}
```

### Task 6: documentación y prueba cruzada real

**Goal:** CLAUDE.md y DECISIONES.md lo cuentan; una pasada real con dos consolas y una tarea.

**Acceptance Criteria:**
- [ ] CLAUDE.md, párrafo de la sesión remota: el panel, los ids opacos, la decisión que no cae al foco, lo que el móvil
  puede y no puede hacer, y los límites nuevos (aprobar en cualquier consola abierta, nombres/títulos/motivos/diffs que
  salen cifrados, `basename`); `documentacion.test.ts` verde. DECISIONES.md: entrada con el porqué.
- [ ] Prueba real (sesión remota por ngrok o por puente local, `settings.json` respaldado y restaurado, enlace simbólico
  temporal al paquete): consola A en foco; consola B en supervisado trabajando en segundo plano hasta pedir una escritura;
  aprobarla desde el panel del móvil (Playwright, viewport de móvil) y ver el fichero; una tarea aparcada en
  `requiere-atencion` recibe «Continuar» desde el panel. Todo limpiado al acabar.
- [ ] Suites enteras verdes en los dos repos.

```json:metadata
{"repo":"xonecode","modelTier":"frontier","files":["CLAUDE.md","docs/DECISIONES.md"]}
```
