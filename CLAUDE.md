# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

`xonecode`: consola CLI y harness de agente para desarrollar aplicaciones **XOne**, sobre
LangChain / LangGraph / deepagents. Este fichero es el mapa y los invariantes, no la
justificación: **el porqué medido de cada decisión está en [`docs/DECISIONES.md`](docs/DECISIONES.md)**,
y el relato de conjunto en `README.md` («Cómo está construido, y por qué»). Ante una
discrepancia entre doc y código, **el código manda**.

**El reparto se COMPRUEBA, no se recuerda** (`src/documentacion.test.ts`): este fichero no cita una
fecha, ni un censo de medidas, ni un recuento de llamadas o un porcentaje, ni una duración suelta en
la prosa —una duración va entre paréntesis y con el nombre de su constante (`TOPE_SIN_SALIDA_MS`,
5 min)—. Si una regla de aquí necesita su medida para entenderse, le falta sitio en
[`docs/DECISIONES.md`](docs/DECISIONES.md), no aquí. Las mismas reglas valen para los `CLAUDE.md` de
cada carpeta, que son trozos de este mapa (ver «Dónde está el detalle»): aquí queda lo que cruza
todo, y lo de un área vive junto a su código.

**XOne no es desarrollo web.** Es una plataforma propietaria de apps móviles nativas: XML en
ficheros `.xne`, JavaScript ES5 y un CSS propio. No existe el DOM, ni `async/await` en el
runtime, ni React. La fuente de una colección es su `.xne`; los `.xml` los genera XOne Studio
y **no se tocan**. XOne ignora en silencio lo desconocido, así que un atributo o una función
inventada no da error — da un bug mudo. Esa regla gobierna los prompts (`agent/grafo/xoneAgent.ts`)
y el backend (`agent/grafo/proyecto.ts`), y es la razón de ser de la aprobación y del verificador.

## Comandos

```sh
npm run typecheck                      # tsc --noEmit del host Y del cliente (dos proyectos)
npm test                               # vitest run — todo el suite, sin red ni clave ni simulador
npm run test:watch
npx vitest run src/core/turno.test.ts  # un solo fichero
npx vitest run -t "la frontera"        # por nombre de test
npm run build                          # rm -rf dist && tsc -p tsconfig.build.json
./bin/xonecode …                       # lanzador de DESARROLLO: tsx sobre src/, preserva el cwd
XONECODE_TRACE_TOOLS=1 ./bin/xonecode run --real "…"   # un turno medido, sin web ni TUI
./bin/xonecode traza [--todas]         # a dónde se fueron los tokens de ese turno
npm run web -- --puerto 4200           # la consola WEB: construye el cliente y la levanta
npm run web:trazas                     # la misma, dejando .xonecode/traza-{errores,tools}.jsonl
./bin/xonecode --motor deepagents …    # cualquier subcomando con ese motor; `xonecode config` dice cuál
```

Los tests son **colocados** (`src/**/*.test.ts`, junto al módulo que prueban).
`tsconfig.build.json` los excluye, igual que `src/core/__oro__/` (ficheros de oro: salida real
de `xone-simulator --json`).

**`npm test` no puede necesitar una clave, una conexión ni el simulador.** Es el invariante que
sostiene todo el diseño de puertos: si un cambio lo rompe, está mal el cambio, no el test.

**Y tampoco puede TOCAR la casa de quien lo corre** (`src/gate.test.ts`): `cargarAgentes()`
siembra a propósito y la ráfaga de bienvenida del cable lo llama, así que una pasada le reescribía
a quien la corría su `~/.xonecode/agentes/`. Se muda el `HOME` para TODO el suite en
`vitest.config.ts` (`setupFiles`, los DOS proyectos, con su porqué en `src/casaDePruebas.ts`), no
en cada test que lo provoca. Ese fichero vive en `src/` para que lo tipe el gate;
`tsconfig.build.json` lo excluye, el mismo trato que `src/evals/`.

**`typecheck` son DOS proyectos, encadenados con `&&`, y eso se comprueba** (`src/gate.test.ts`).
El del cliente no se puede fundir en el `include` de la raíz: su `lib`, su `jsx` y sus `types`
son otros, y `vite build` transpila sin mirar tipos. El `&&` es parte de la regla: con `;` el
código de salida sería el del último, y CI lee ese código. Los `*.test.ts(x)` del cliente siguen
fuera a propósito (`apps/web/tsconfig.json` explica por qué).

`vitest.config.ts` parte el suite en dos con `test.projects`: `host` acota `include` a `src/**`
y corre en `node`; `cliente` acota a `apps/web/**` y corre en `jsdom`. No se vuelva al `include`
por omisión: barre todo el repo y se traga `.worktrees/`. (`environmentMatchGlobs` no existe en
vitest 4.)

**No uses `npm run xonecode` desde otro proyecto**: `npm run` cambia el cwd al de este
`package.json`, así que xonecode creería que el proyecto es este repo. Para probar sobre una app
real, `./bin/xonecode` (o `npm run build && npm link`). Ese lanzador ancla `--tsconfig` a la raíz
del repo o la TUI revienta con «React is not defined» (`src/cli/lanzador.test.ts` lo vigila).

**`npm run web` es la excepción**: puede vivir con el cwd en este repo porque la web no abre el
cwd — arranca en el vestíbulo y el proyecto se elige en la barra. Ojo: un `.xonecode/` en la raíz
de este repo haría desaparecer el paso de cuenta del alta.

## Arquitectura

Seis capas, y la frontera importa más que el contenido:

| capa | qué es |
|---|---|
| `src/core/` | TypeScript **puro**: eventos de dominio, motor de turno, puertos + dobles, resolución de modelos, config |
| `src/agent/` | toda la suciedad del grafo: deepagents, langgraph, backend de ficheros, perfiles, verificador, git. Repartida en ocho carpetas: `grafo/`, `turno/`, `subagentes/`, `tareas/`, `sesiones/`, `cloudstudio/`, `dispositivos/`, `config/` |
| `src/cli/` | despachador (`main.ts`), consola interactiva (`consola.ts`), un disparo (`run.ts`), comandos de diagnóstico |
| `src/web/` | el SERVIDOR de la consola web: http en loopback, SSE, vestíbulo, sesiones, piel web |
| `apps/web/` | el CLIENTE: React + Vite, un `package.json` propio (workspace) que se compila a `apps/web/dist` |
| `src/vendor/` | módulos propios traídos de un laboratorio anterior (HITL, conteo de tokens), con sus tests |

### Las fronteras, y cuáles están probadas

- **`core/` no importa langchain, `@langchain/*`, langgraph, deepagents, ink, react ni
  `@modelcontextprotocol`** (`src/core/imports.test.ts`).
- **ink y react no se importan fuera de `cli/tui/`** (`cli/tui/frontera.test.ts`): mantiene pipes
  y `npm test` funcionando sin TTY.
- **react-dom, vite y `apps/web/` no se importan desde `src/`** (`src/web/frontera.test.ts`), y
  los tipos del cable se **redeclaran** en `apps/web/src/tipos.ts`. `tipos.test.ts` compara los
  literales `tipo:` y `clase:` contra el host: divergir da rojo, no un bug mudo.
- **`src/` no tiene ciclos de importación de VALOR** (`src/ciclos.test.ts`; un `import type` no
  cuenta). El contrato `SesionReal`, `ficherosDelProyecto` y las reglas de reparación viven en
  módulos neutrales de `agent/turno/` por esto.
- `agent/` no importa de `cli/` — convención sin test, comentario en `agent/turno/turnoReal.ts`.
  En el otro sentido sí se puede.

### Puertos, eventos y honestidad

- **Todo lo caro entra por un puerto que se PASA al construir** (`core/ports.ts`, `core/deps.ts`),
  nunca se importa dentro de quien lo usa. Los dobles viven en `ports.ts`, no en fixtures de test:
  offline es un modo de uso de primera clase. La marca de doble es el Symbol `ES_DOBLE`, no un
  booleano.
- **Ningún evento lleva argumentos de tool, ni truncados** (`core/events.ts`): `tool.detalle` es
  una lista blanca por NOMBRE de tool (`agent/turno/resumenDeTool.ts`) que extrae un solo campo de
  ruta o patrón. El **único** sitio donde el contenido se enseña entero es el diff de la
  aprobación (`cli/aprobar.ts`, `core/diff.ts`).
- **Ninguna ruta de la máquina viaja por el cable** (`sinRutas`, `web/servidor/arranque.ts`). De
  un error de Node solo el `code` (`codigoDe`), porque su mensaje lleva la ruta absoluta.
- **Los avisos de honestidad son código, no prompt**, con alcance de **turno** (`core/bitacora.ts`).
- `agent/turno/puente.ts` traduce los chunks de langgraph a eventos, `core/turno.ts` decide qué se
  cuenta, y las pieles (`cli/stdio.ts`, `cli/tui/`, `web/servidor/pielWeb.ts`) pintan. Los métodos
  nuevos de `Piel` van **opcionales** (`fase?`, `razonamiento?`, `notificacion?`, `linea(texto,
  detalle?)`): stdio y la TUI no cambian y la tubería sigue byte-idéntica.

## Invariantes que cruzan todo

Una línea cada uno; el detalle, en el `CLAUDE.md` de su carpeta (tabla de abajo).

- **XOne ignora en silencio lo desconocido**: un atributo o una función inventada es un bug mudo.
  Por eso la aprobación, el verificador y las tools que MIDEN en vez de opinar.
- **El orquestador va de SOLO LECTURA por PERMISOS, no por falta de tools**; `FilesystemBackend`
  con `virtualMode: true`; los permisos SIEMPRE con `permisosDe(perfil)`, nunca a mano
  (`SubAgent.permissions` reemplaza los del padre); `SubAgent.tools` solo lleva tools propias.
- **La shell la lleva UNO, declarado en su `.md`** (`ejecucion`, cierto solo con `"true"`), sin
  `permissions` (deepagents lanza) y sin las claves de API en su entorno. Quien declara `scripts: true`
  corre los SCRIPTS de sus skills sin shell (`ejecutar_script`, forma estrecha) y conserva sus escrituras.
- **El HITL va por NOMBRE de tool en todo lo que escribe** (`write_file`, `edit_file`,
  `incorporar_adjunto`, `traer_fuente`). Lo que no se entiende es RECHAZO (fail-closed), y una
  escritura REMOTA va siempre a una persona, también en modo autónomo.
- **Un rechazo de guarda se DEVUELVE como `{error}`, nunca se lanza**: una excepción se lleva el
  turno y el agente no reintenta.
- **Una tool propia de xonecode no pasa por el middleware de permisos**: reaplica `puedeLeerRuta`
  a mano. Y un motor EXTERNO escribe al disco directo: las guardas de ruta se reaplican dos veces
  (texto y `realpath`), y lo que no se puede comprobar se deniega.
- **Los `.xne` se leen y escriben en la codificación que ya tenían o que declaran**
  (`core/codificacion.ts`): un Latin-1 sigue en su tabla de 8 bits, nunca se convierte por omisión. La
  excepción es TrueForge: un `.xne` de 8 bits que su agente ESCRIBE queda en UTF-8 (`aUtf8`); el que solo lee, no.
- **deepagents es LEGACY**: lo nuevo va solo a TrueForge, y la elección del motor vive en UN punto
  (`abrirSesionReal`).
- **Ninguna ruta de la máquina ni ningún secreto viajan por el cable** salvo las excepciones
  NOMBRADAS (la ruta del workspace; `leerSecreto`, el `codigo` de `motorLocal`, la `url` remota, el
  authtoken de ngrok y el texto de un aprendido SENSIBLE pedido con «Ver»).
- **El servidor decide, el cliente pide**: por el cable viaja la intención, y toda negativa con
  motivo la compone el servidor (el cliente repite la regla solo cuando la negativa no le llega).
- **Ausente ≠ vacío ≠ cero** en disco, cable, store y componente: lo que no consta no se pinta.
- **Una composición de producción dentro de un cierre que los tests doblan no está probada**: ver
  «Trampas verificadas».

## Dónde está el detalle

Claude Code carga el `CLAUDE.md` de una carpeta al leer ficheros de ella. **Antes de tocar un
área, lee el suyo** si no se ha cargado ya (por ejemplo, al editar `core/` algo de otra capa).

| área | fichero | léelo antes de tocar |
|---|---|---|
| el agente, el backend del proyecto, sus guardas y sus tools propias | `src/agent/grafo/CLAUDE.md` | `xoneAgent.ts`, `proyecto.ts`, `perfiles.ts`, cualquier tool |
| subagentes y motores externos (Claude Code, Codex, OpenCode), motores locales | `src/agent/subagentes/CLAUDE.md` | un `.md` de agente, `escrituraExterna.ts`, `comandoExterno.ts` |
| TrueForge: memoria, bucle del desarrollador, notas, detener, idioma | `src/agent/motores/trueforge/CLAUDE.md` | cualquier cosa de `agent/motores/` |
| la aprobación y el modo de escritura | `src/cli/CLAUDE.md` | `aprobar.ts`, `modoDeEscritura.ts`, `Pregunta.tsx` |
| el verificador en el turno y su reparación | `src/agent/turno/CLAUDE.md` | `turnoReal.ts`, `verificacion.ts` |
| tareas en background, juez, entrega, gestor de tareas | `src/agent/tareas/CLAUDE.md` | `core/tareas.ts`, `entrega.ts`, `corredorDeTareas.ts` |
| la consola web: servidor y cliente | `src/web/CLAUDE.md` | cualquier cosa de `src/web/` o `apps/web/` |
| workspace, modelos, esfuerzo, credenciales, tokens | `src/core/CLAUDE.md` | `settings.ts`, `modelos.ts`, `esfuerzo.ts`, `contextos.ts` |
| conectores MCP, Stitch, diseño vinculado, Jira y Notion | `src/agent/conectores/CLAUDE.md` | `core/conectores.ts`, `gestorDeTareas.ts`, `stitch.ts` |
| exportar a PDF | `src/agent/CLAUDE.md` | `exportarPdf.ts` |
| sesiones, hilos, git y atribución | `src/agent/sesiones/CLAUDE.md` | `checkpointer.ts`, `gitSync.ts`, `sesionGit.ts` |
| CloudStudio y la sincronización | `src/agent/cloudstudio/CLAUDE.md` | `descarga.ts`, `subida.ts`, `planDeSubida.ts` |
| dispositivos, emuladores, recarga en caliente | `src/agent/dispositivos/CLAUDE.md` | `core/dispositivos.ts`, `puertosDeAvd.ts`, `xone-hotswap` |
| la TUI y el panel del terminal | `src/cli/tui/CLAUDE.md` | `cli/tui/`, `cli/panel.ts` |
| el banco y los evals | `src/evals/CLAUDE.md` | `src/evals/` |

## Medir el gasto sin levantar nada

La puerta headless es `run --real` (`cli/run.ts`), y **cierra diciendo lo que costó**
(`agent/turno/informeDeTraza.ts#pintarGasto`). Cuatro reglas:

- **Las DOS cuentas no se suman y son dos filas** —la del grafo y la de un agente externo—, la
  externa AUSENTE se calla, y una ventana de cero no se pinta.
- **Se pinta también cuando el turno se corta sin humano.**
- **El reparto lo da la TRAZA, no el total**: `XONECODE_TRACE_TOOLS=1` deja
  `.xonecode/traza-tools.jsonl` y `xonecode traza` lo agrega por ORIGEN y por TOOL, con cada
  BLANCO y cuántos DISTINTOS. El blanco es **ruta + rango** (`offset+limit`), no la ruta. Lo que no
  cabe se CUENTA. `pintarGasto` va en `agent/` y no dentro de `correrReal`, por el patrón de fallo
  de siempre.
- **La traza dice también el ENTORNO de cada shell y lo que hace un hijo EXTERNO** (`entorno`, `externo` en
  `DiagnosticoDeTools`): plataforma, clave del PATH (y cuántas: dos en Windows era el fallo), si `node`/`adb` están; cada
  `Bash` del hijo —pedido, ejecutado tras reescribirlo, permitido o denegado con su motivo— y lo que salió o FALLÓ
  (`PostToolUseFailure`, medido: un `Bash` con código ≠ 0 no pasa por `PostToolUse`). Texto recortado a
  `TOPE_DE_TEXTO_EXTERNO`. Medido en Windows: «node: command not found» solo se supo porque el hijo lo contó. Y
  cada orden de NUESTRA shell (`orden`): con qué shell corrió (`sh`, `git-bash`, `cmd.exe`), cómo salió y los ficheros
  NUEVOS de la raíz del proyecto (IXCODE-72: en Windows aparecían ficheros sueltos y no se sabía qué orden los dejaba).
- **Dos trampas del formato** (`informeDeTraza.test.ts`): en una línea `modelo`, `llamadas` es el
  acumulado GLOBAL del tracker; y el fichero append-only obliga a partir el informe por `sesion`.
  Que no haya traza sale con **70**.

## Códigos de salida (contrato, CI los lee)

| | |
|---|---|
| 0 | bien |
| 1 | el proyecto tiene errores, o no es un proyecto XOne |
| 2 | quedaron escrituras **sin resolver** (nadie las aprobó, o se agotó el tope), o el turno acabó con una **pregunta sin contestar** |
| 64 | error de uso (bandera o modelo mal escritos) |
| 70 | fallo del **entorno**, no del proyecto (también el MOTOR caído a mitad: un 429, la red) |

Un fallo del entorno no se reporta como un proyecto roto: `agent/turno/verificador.ts` lanza
`ErrorDelSimulador` en vez de devolver un informe en rojo.

**El 2 NO promete «nada se aplicó».** Un agente EXTERNO pide su autorización por escritura y ANTES
de escribir, así que puede haber dejado algo en el disco cuando el turno se corta después. El
código se queda en 2 (dirección segura para CI) y lo que está en el disco lo dice el diff de
«cambios en el proyecto».

## Trampas verificadas

Con su medida entera en [`docs/DECISIONES.md`](docs/DECISIONES.md); aquí lo que hay que recordar
antes de tocar el código:

- **El patrón de fallo de esta arquitectura: una composición de producción viviendo en un cierre
  que todos los tests doblan.** Visto en `backendDeAgente`, el corredor sin cablear en
  `arrancarConsolaWeb`, el `escribio` a fuego en `revisionConGit`, la capa de proyecto de
  `fuentesDelJuez`, el montaje de `/adjuntos/`, `filaDeTarea`, el prop de las pestañas por
  entorno, `opcionesDeSubagenteExterno` y —la más clara— `ConsolaDeProyecto.consumo`, declarada en
  el tipo y nunca implementada en el objeto: con el campo OPCIONAL no hay error que leer. Regla
  práctica: **si una regla de producción se compone dentro de algo que los tests simulan, esa
  regla no está probada — está escrita.**
- **La raíz del paquete se BUSCA hacia arriba, nunca se cuenta con `..`**
  (`agent/raizDelPaquete.ts`): `resolve(dirname(import.meta.url), "..", "..")` ataba esos ficheros
  a su profundidad, y mover uno dejaba el catálogo de skills VACÍO sin error que leer. No
  encontrarla LANZA.
- **La caché implícita de Gemini no entra a los tamaños de contexto de este harness** (umbrales en
  `DECISIONES.md`), y `@langchain/google-genai` 2.3.0 suma `cache_read` dos veces en streaming:
  `vendor/tokenTracking.ts` acota la caché a la entrada.
- **`SkillsPort.cargar()` no tiene un solo llamador y las skills SÍ llegan al modelo**: las carga
  `SkillsMiddleware` de deepagents desde `/skills/` montada en el backend. El puerto solo aporta
  `catalogo()`.
- **ink@5.2.1 no remide un `<Text>` cuando se INSERTA texto delante de un hijo existente**
  (`insertBeforeNode` no marca sucio el padre). Regla práctica: hijos que aparecen y desaparecen
  van como `Text` HERMANOS dentro de un `Box`, nunca anidados en un `Text`
  (`cli/tui/filas.ts`).
- **El `resize` de Ink no re-renderiza React**: recalcula Yoga y repinta el árbol YA montado, así
  que lo que dependa de `stdout.columns` leído en el render se queda viejo. `App` se suscribe al
  `resize` y fuerza un re-render.
