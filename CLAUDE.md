# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

`xonecode`: consola CLI y harness de agente para desarrollar aplicaciones **XOne**, sobre
LangChain / LangGraph / deepagents. Este fichero es el mapa y los invariantes, no la
justificación: **el porqué medido de cada decisión está en [`docs/DECISIONES.md`](docs/DECISIONES.md)**,
y el relato de conjunto en `README.md` («Cómo está construido, y por qué»). Cuando una regla de
aquí parezca arbitraria, la de allí dice qué se midió para llegar a ella — y ante una
discrepancia entre doc y código, **el código manda**.

**XOne no es desarrollo web.** Es una plataforma propietaria de apps móviles nativas: XML en
ficheros `.xne`, JavaScript ES5 y un CSS propio. No existe el DOM, ni `async/await` en el
runtime, ni React. La fuente de una colección es su `.xne`; los `.xml` los genera XOne Studio
y **no se tocan**. XOne ignora en silencio lo desconocido, así que un atributo o una función
inventada no da error — da un bug mudo. Esa regla gobierna los prompts (`agent/xoneAgent.ts`)
y el backend (`agent/proyecto.ts`), y es la razón de ser de la aprobación y del verificador.

## Comandos

```sh
npm run typecheck                      # tsc --noEmit
npm test                               # vitest run — todo el suite, sin red ni clave ni simulador
npm run test:watch
npx vitest run src/core/turno.test.ts  # un solo fichero
npx vitest run -t "la frontera"        # por nombre de test
npm run build                          # rm -rf dist && tsc -p tsconfig.build.json
./bin/xonecode …                       # lanzador de DESARROLLO: tsx sobre src/, preserva el cwd
npm run web -- --puerto 4200           # la consola WEB: construye el cliente y la levanta
```

Los tests son **colocados** (`src/**/*.test.ts`, junto al módulo que prueban).
`tsconfig.build.json` los excluye, igual que `src/core/__oro__/` (ficheros de oro: salida real
de `xone-simulator --json`).

**`npm test` no puede necesitar una clave, una conexión ni el simulador.** Es el invariante que
sostiene todo el diseño de puertos: si un cambio lo rompe, está mal el cambio, no el test.

`vitest.config.ts` parte el suite en dos con `test.projects`: `host` acota `include` a `src/**`
y corre en `node`; `cliente` acota a `apps/web/**` y corre en `jsdom`. No se vuelva al `include`
por omisión: barre todo el repo y se traga `.worktrees/`. (`environmentMatchGlobs` no existe en
vitest 4.)

**No uses `npm run xonecode` desde otro proyecto**: `npm run` cambia el cwd al de este
`package.json`, así que xonecode creería que el proyecto es este repo. Para probar sobre una app
real, `./bin/xonecode` (o `npm run build && npm link`). Ese lanzador ancla `--tsconfig` a la raíz
del repo o la TUI revienta con «React is not defined» (`src/cli/lanzador.test.ts` lo vigila).

**`npm run web` es la excepción**, y solo esa: puede vivir con el cwd en este repo porque la web
no abre el cwd — arranca en el vestíbulo y el proyecto se elige en la barra. Ojo: un `.xonecode/`
en la raíz de este repo haría desaparecer el paso de cuenta del alta.

## Arquitectura

Seis capas, y la frontera importa más que el contenido:

| capa | qué es |
|---|---|
| `src/core/` | TypeScript **puro**: eventos de dominio, motor de turno, puertos + dobles, resolución de modelos, config |
| `src/agent/` | toda la suciedad del grafo: deepagents, langgraph, backend de ficheros, perfiles, verificador, git |
| `src/cli/` | despachador (`main.ts`), consola interactiva (`consola.ts`), un disparo (`run.ts`), comandos de diagnóstico |
| `src/web/` | el SERVIDOR de la consola web: http en loopback, SSE, vestíbulo, sesiones, piel web |
| `apps/web/` | el CLIENTE: React + Vite, un `package.json` propio (workspace) que se compila a `apps/web/dist` |
| `src/vendor/` | módulos propios traídos de un laboratorio anterior (HITL, conteo de tokens), con sus tests |

### Las fronteras, y cuáles están probadas

- **`core/` no importa langchain, `@langchain/*`, langgraph, deepagents, ink, react ni
  `@modelcontextprotocol`** (`src/core/imports.test.ts`). Es la regla dura al añadir algo a `core/`.
- **ink y react no se importan fuera de `cli/tui/`** (`cli/tui/frontera.test.ts`): es lo que
  mantiene pipes y `npm test` funcionando sin TTY.
- **react-dom, vite y `apps/web/` no se importan desde `src/`** (`src/web/frontera.test.ts`), y
  los tipos del cable se **redeclaran** en `apps/web/src/tipos.ts`. `tipos.test.ts` compara los
  literales `tipo:` y `clase:` contra el host: divergir da rojo, no un bug mudo.
- `agent/` no importa de `cli/` — convención sin test, solo un comentario en `agent/turnoReal.ts`.
  En el otro sentido sí se puede.

### Puertos, eventos y honestidad

- **Todo lo caro entra por un puerto que se PASA al construir** (`core/ports.ts`, `core/deps.ts`),
  nunca se importa dentro de quien lo usa. Los dobles viven en `ports.ts` y no en fixtures de
  test, porque offline es un modo de uso de primera clase. La marca de doble es el Symbol
  `ES_DOBLE`, no un booleano: un campo se puede olvidar y entonces el aviso calla.
- **Ningún evento lleva argumentos de tool, ni truncados** (`core/events.ts`): `write_file`
  llevaría el contenido del fichero y una tool MCP el bearer. `tool.detalle` no es excepción: es
  una lista blanca por NOMBRE de tool (`agent/resumenDeTool.ts`) que extrae un solo campo de
  ruta o patrón. El **único** sitio donde el contenido se enseña entero es el diff de la
  aprobación (`cli/aprobar.ts`, `core/diff.ts`), que es el paso donde se DECIDE sobre él.
- **Ninguna ruta de la máquina viaja por el cable** (`sinRutas`, `web/servidor/arranque.ts`): puede
  ir por un túnel. De un error de Node solo el `code` (`codigoDe`), porque su mensaje lleva la
  ruta absoluta.
- **Los avisos de honestidad son código, no prompt**, con alcance de **turno**
  (`core/bitacora.ts`): a un modelo se le puede pedir que avise y a veces no avisa, y un aviso
  que salta cuando no ha pasado nada enseña a ignorarlo.
- `agent/puente.ts` traduce los chunks de langgraph a eventos, `core/turno.ts` decide qué se
  cuenta, y las pieles (`cli/stdio.ts`, `cli/tui/`, `web/servidor/pielWeb.ts`) pintan. Los
  métodos nuevos de `Piel` van **opcionales** (`fase?`, `razonamiento?`, `notificacion?`,
  `linea(texto, detalle?)`): así stdio y la TUI no cambian y la tubería sigue byte-idéntica.

### El agente, y lo único que puede escribir

`agent/xoneAgent.ts`: un orquestador que delega en los especialistas de `core/agentes.ts`.
Cinco cosas no son negociables:

- **El orquestador va de SOLO LECTURA por PERMISOS, no por falta de tools**
  (`PERFIL_DEL_ORQUESTADOR`). Quitarle el middleware podría reinstalar el de deepagents —sin
  permisos— y reabrir el agujero; `xoneAgent.orquestador.test.ts` exige lo contrario.
- **`FilesystemBackend` con `virtualMode: true`.** Con el default, medido, leyó una ruta absoluta
  de fuera de la raíz. Nada de backends con shell.
- **Los permisos se construyen con `permisosDe(perfil)`, NUNCA a mano**: `SubAgent.permissions`
  reemplaza los del padre en vez de fusionarlos, así que un perfil que los escriba a mano pierde
  la denegación de `/.env`, `/.git` y `/.xonecode`.
- **`SubAgent.tools` lleva SOLO tools propias**, nunca los nombres de las de fichero: pasarle
  nombres las sustituía por cadenas y dejaba al especialista sin capacidades. Las de fichero las
  monta `createFilesystemMiddleware`; quien las acota es `permissions`.
- **El HITL va en `write_file` y `edit_file`**, que son las que escriben.

Y las guardas del proyecto:

- **Las vistas aplanadas** (`X.xml` con un `X.xne` al lado) se retiran del backend con un Proxy
  (`agent/proyecto.ts`): la regla es propiedad del proyecto, no de un prompt.
- **Un rechazo de guarda se DEVUELVE como `{error}`, nunca se lanza.** deepagents devuelve el
  error al modelo, que puede reintentar; una excepción se lleva el turno por delante y el agente
  no reintenta. Vale para `sinVistasAplanadas`, `sinArtefactosEnElProyecto` y
  `sinDescargasEnElProyecto`. `proyecto.test.ts` lo ata contra la librería real.
- **`/artefactos/` → `.xonecode/sesiones/<id>/artefactos/`**: escribible y **sin aprobación**, por
  eso se ANUNCIA con el evento `artefacto` (nombre, tamaño, ruta virtual — nunca contenido).
  `esRutaDeArtefacto` es una lista BLANCA de forma, no un `startsWith`. La carpeta no se crea al
  montar. Tope propio de rondas, para que una tanda de diagramas no gaste `cortadoPorTope`.
- **Un artefacto no puede acabar dentro del proyecto, y eso es código**: `artefactoFueraDeSitio`
  (`core/artefactos.ts`) deniega `artifacts`/`artifact` como primer segmento y `/artifact.html`
  en `write` y `edit` — solo ahí, para poder leer y borrar los mal puestos de antes. El predicado
  `when` de `seDetieneEn` (`agent/perfiles.ts`) usa **la misma función** para no sacar un modal
  cuyo único final posible es un rechazo; `perfiles.test.ts` exige que no preguntar implique que
  la guarda rechaza.
- **Lo que deepagents desaloja del contexto tampoco es del proyecto**: `/large_tool_results/` y
  `/conversation_history/` van a fuego en la librería y las escribe llamando al backend directo
  —sin HITL ni `permissions`—, así que se montan al lado de los artefactos
  (`backendConDescargas`), y la guarda del backend del proyecto existe para fallar CERRADO el día
  que el montaje falte.
- **`/skills/` con barra final obligatoria** (`CompositeBackend` la retira antes de delegar) y
  `permisosDe` deniega `write` ahí: son instrucciones, no ficheros editables.
- **`/adjuntos/` es de solo lectura y su fila en `permisosDe` es INCONDICIONAL**: sin ella, un
  `write_file` con la carpeta sin montar escribe un fichero DEL PROYECTO con el nombre de algo
  que la interfaz presenta como «lo que te adjuntaron».
- **La tool propia es la búsqueda regex** (`agent/busquedaRegex.ts`), acotada (`LIMITES_REGEX`).
  Re-aplica `puedeLeerRuta` **a mano**: una tool de LangChain añadida por xonecode **no pasa por
  el middleware de permisos**.
- `.xonecode/memoria.md` se ve por UNA ruta virtual, `/MEMORIA_PROYECTO.md` (Proxy en
  `agent/memoriaDeProyecto.ts`), así que la carpeta sigue denegada entera y escribir la memoria
  pasa por la aprobación de siempre. El resumen de contexto usa umbrales **fijados a mano** (32k
  para disparar, 8k de reciente): deepagents asume 170k y con Ollama comprime demasiado tarde.

### Los subagentes

Un subagente es un `.md` con frontmatter en `.xonecode/agentes/<nombre>.md`
(`core/agentes.ts`, `agent/agentesEnDisco.ts`). Los cinco de serie —`docs`, `planner`, `dev`,
`mockup`, `probador`— se siembran al arrancar. Reglas duras:

- **`REGLAS_XONE` se antepone SIEMPRE desde código**, igual que el aviso de las skills que faltan
  y la línea de que las escrituras se aprueban: poder quitarlas editando un `.md` convertiría el
  invariante en una preferencia.
- **El nombre sale del FICHERO**, no del frontmatter. Sin `descripcion` no se carga (es lo que el
  orquestador lee para delegar). **`soloLectura` solo es cierto con exactamente `"true"`** — la
  trampa del `"false"` de CloudStudio, que aquí concedería ESCRITURA.
- **La marca de la siembra es `.semilla.json` con el hash de lo que escribimos**, no «la carpeta
  existe»: así un agente nuevo o una corrección alcanzan a quien ya arrancó, sin resucitar lo que
  el usuario borró ni pisar lo que tocó (eso se DICE por `problemas`). Una carpeta sin marca con
  agentes de serie dentro se ADOPTA sin escribir nada; vacía se siembra entera.
- **El prompt del orquestador se GENERA** de la lista (`xoneAgent.ts#promptOrquestador`).
- Un `.md` roto se salta y su motivo viaja por el cable hasta la ventana de Ajustes.
- **La línea de una delegación dice a QUIÉN** (`task` → `subagent_type` en la lista blanca de
  `resumenDeTool.ts`, más icono y verbo en `core/notify.ts`). Medido en la pantalla del usuario:
  decía «⚙ task» a secas, y con un motor externo eso deja la interfaz MUDA — el hijo corre en
  otro proceso y no cruza ni una tool, así que son minutos sin nada que mirar. Sale el NOMBRE y
  nunca la `description`, que es el encargo entero y puede llevar contenido del proyecto. Y la
  rama genérica de `frase()` dejó de TIRAR el detalle: no filtra nada nuevo, porque un `detalle`
  solo existe si la lista blanca lo eligió a mano.
- **Y lo que hace un agente EXTERNO se ve MIENTRAS lo hace** (`core/entrelazar.ts`). Su hijo
  corre en otro proceso: ni una de sus tools cruza el stream del grafo, así que entre la línea de
  delegación y su respuesta había minutos de pantalla quieta, que es como se lee un cuelgue. El
  punto de observación es el hook `PreToolUse` —por `canUseTool` no pasan las lecturas, porque un
  `allow` del hook es pre-aprobación—, y de ahí sale un evento `tool` NORMAL: nombre traducido al
  canónico (`Read` → `read_file`) y ruta VIRTUAL, así que el colapsador lo agrupa con los demás y
  ninguna piel se entera de que hay dos orígenes. `entrelazar` es la misma forma que
  `conVerificacion` —un generador que envuelve a `aEventos`— salvo que intercala MIENTRAS en vez
  de añadir al final; su trampa es que `it.next()` se pide UNA vez y se guarda, porque dos `next()`
  vivos se comen un valor (hay test, y muere con la mutación). **Solo se cuenta lo que va a
  ocurrir**: una tool denegada no se anuncia, porque la línea diría que el hijo hizo algo que no
  hizo.
- **Un hijo de Claude Code NO puede enumerar la carpeta, así que se le DICE**
  (`escrituraExterna.ts#inventarioDelProyecto`). Medido espiando el hook en vivo: intentó
  `Bash ls`, `Bash find` —denegadas—, pidió `ToolSearch select:Glob,Grep` y **no las encontró**;
  probó las tools MCP del usuario y acabó leyendo a ciegas nombres inventados —`README.md`,
  `CLAUDE.md`, `app.ini`…, ninguno existía: **65 lecturas**— para concluir que «el proyecto está
  prácticamente vacío para mí, porque no puedo listarlo». Conceder `Bash` era la salida fácil y la
  prohibida. La buena es que el harness YA tiene esa lista —la misma con la que reconoce una vista
  aplanada—, así que va en sus instrucciones: rutas virtuales, acotada y con el total al lado. Es
  el patrón de `core/adjuntos.ts`: montar no basta, hay que decir que están. Medido después: de 65
  lecturas a ciegas a **3 exactas**, y el documento salió correcto.
- Dos cosas más que salieron de esa misma medida: **`ToolSearch` es de LECTURA** (devuelve
  esquemas, no ejecuta nada, y lo que consiga vuelve a pasar por el hook — sin ella el mensaje de
  denegación le ofrecía buscar con unas tools que no podía alcanzar), y **listar la RAÍZ se
  permite**: `rutaVirtualDeEscritura` la descarta a propósito porque no es un fichero que
  escribir, y eso es cierto para escribir y falso para mirar.
- **Motores externos**: `claude-code` (`agent/subagenteExterno.ts`) **escribe, y cada escritura
  pasa por una autorización** — `canUseTool` es asíncrono y corre en nuestro proceso, así que se
  espera ahí sin `interrupt()` y sin reejecutar el nodo. `decisionDeTool` en este orden: **TRES
  listas** de tools (lectura / escritura / denegadas, y lo desconocido denegado también), el papel
  del `.md`, las **guardas de RUTA reaplicadas** y, al final, la política. Dos listas no bastaban:
  era `permitirEscritura || esDeLectura`, o sea que conceder escritura concedía `Bash` —que basta
  para escribir el proyecto entero— y `WebFetch`/`WebSearch`, que lo sacan de la máquina.
  Escribir son **solo `Write` y `Edit`**: las únicas cuyos argumentos encajan en `cambioDe()`, o
  sea de las que se puede componer el diff que hay que mirar.
- **Las guardas de ruta hay que REAPLICARLAS, y ahí estaba el agujero** (`agent/escrituraExterna.ts`).
  Su `file_path` es ABSOLUTO y va al disco directo: `permisosDe`, el `virtualMode`, las vistas
  aplanadas y las guardas de artefactos y descargas no lo alcanzan. Se aplican las MISMAS
  funciones sobre la ruta virtual, y **dos veces** —texto y `realpath`— como en
  `arbolDeProyecto.ts`: medido, un enlace dentro de la raíz apuntando a `.env` pasa la primera.
  Del destino se canonicaliza él si existe y su PADRE si no (si no, no se podría crear ningún
  fichero). Lo que no se puede comprobar se deniega.
- **La política es el `pedirAprobacion` que YA existía**, traducido
  (`escrituraExterna.ts#politicaDeAprobacionExterna`, tipo `PoliticaDeEscrituraExterna` en
  `core/ports.ts`, fail-closed por TIPO como `core/cloudstudio.ts#PoliticaDeAprobacion`). Sus dos
  implementaciones son las que hacían falta: la INTERACTIVA de las tres pieles (diff delante,
  plazo, mapa que nace rechazado, rechazo sin cliente enganchado) y la AUTÓNOMA de una tarea de
  fondo, que concede porque la autorización fue crear la tarea, lo **anuncia** con los nombres y
  lo apunta en `Tarea.autorizadas`. Un segundo hueco habría sido un segundo sitio donde el
  fail-closed puede dejar de estarlo. Sin `pedirAprobacion` no hay política y no se escribe; una
  política que lanza es un NO, y el `catch` va en `decisionDeTool` y no solo en el envoltorio de
  `correr`, que vive en un cierre que ningún test alcanza.
- **La denegación de verdad vive en un hook `PreToolUse`, no en `canUseTool`.** Tres frases
  textuales del SDK: «Allow rules from settings files can also shadow the callback» (o sea que
  `canUseTool` puede no invocarse nunca), «PreToolUse hook denies … resolve before canUseTool
  runs» y «the 'ask' path surfaces via a can_use_tool control_request». De ahí el reparto: el
  hook contesta las TRES clases —`allow` para leer (con la ruta ya comprobada), `deny` para lo
  que no está en las listas, `ask` para escribir, que es cómo se llega al callback donde se
  puede ESPERAR a una persona— y no deja ninguna sin decidir. Dejar una la decidiría el
  `permissionMode`, y ninguno de sus valores es seguro por suposición: `dontAsk` («deny if not
  pre-approved») podría denegar la escritura antes del callback y dejar la función muerta con
  todo en verde, y `default` («prompts for dangerous operations») podría aprobar `WebSearch` sin
  consultarnos. Se usa `default`, que es el modo donde el `ask` del hook sí llega al callback.
  `canUseTool` conserva las MISMAS comprobaciones como segunda llave.
- **`settingSources: ["user"]`.** Por la primera cita: por omisión se cargan las tres fuentes,
  incluida `.claude/settings.json` **de dentro del proyecto**, que viene de CloudStudio — el
  mismo argumento por el que `seAplicaSinAprobacion` no vive en el `config.json` del proyecto.
  Se quedan los ajustes del dueño de la máquina (la misma confianza que ya se declara para
  Codex); el coste es que el hijo no carga el `CLAUDE.md` del proyecto.
- **LEER también lleva guarda de ruta, y ese agujero ya estaba vivo.** Medido corriéndolo, dicho
  por el propio hijo: «`.env` — sí pude leerlo». La lista blanca permitía `Read` a secas sin
  mirar la ruta, desde el primer día: se podían leer `.env`, `.git`, `.xonecode` —donde vive el
  `checkpoint.sqlite`, con la lista de mensajes ENTERA de cada conversación— y cualquier fichero
  de FUERA del proyecto. Se deniegan esas y las vistas aplanadas (el backend se las retira al
  agente entero: si las ve, edita el fichero equivocado); `/skills/`, `/adjuntos/` y un artefacto
  mal puesto de antes SÍ se leen, porque leerlos es su razón de ser. `Glob`/`Grep` llevan `path`
  opcional y ausente es la raíz. **Límite declarado**: un `Grep` sobre la raíz puede devolver
  líneas de un fichero denegado — `canUseTool` decide sobre la LLAMADA y no filtra su salida;
  cerrarlo pide un `PostToolUse`, que no está puesto.
- **Y todo esto está MEDIDO contra un hijo de verdad** (11-09-2026, tres ejecuciones): aprobar
  escribe, rechazar no deja fichero, `.env` y las vistas aplanadas se cortan, `Bash` se deniega,
  y un artefacto dentro del proyecto se rechaza diciendo dónde iba. Las tres ejecuciones
  encontraron tres fallos que ningún test con dobles habría visto: la raíz no canónica
  (`/tmp` → `/private/tmp` en macOS hacía imposible escribir), la carpeta padre que todavía no
  existe (`Write` las crea, y se denegaba con «no se pudo comprobar»), y el `allow` del hook
  saltándose la guarda de lectura.
- Un `.md` de `claude-code` con `soloLectura: false` ya se acepta —la guarda se levantó **con** el
  cableado, no antes—, y el de `codex` se sigue rechazando: ahí la escritura la bloquea el
  SANDBOX del SO, o sea que no pasaría por ninguna guarda de ruta nuestra. Se comprueba
  `disponible()` antes de montarlo. `codex` (`agent/subagenteCodex.ts`) va por
  `codex app-server --stdio` con JSON por línea y `sandbox: "read-only"`; la respuesta final es el
  `item/completed` cuyo item es un `agentMessage` de fase `final_answer`. El hijo es el Codex DEL
  USUARIO, con sus MCP y sus hooks: xonecode no los filtra.

### La aprobación

- **Fail-closed: lo que no se entiende es RECHAZO** (`cli/aprobar.ts`, `vendor/hitl.ts`). El Enter
  a secas aprueba solo con un TTY de verdad detrás; una entrada agotada degrada la pregunta a no
  interactiva, donde la cadena vacía rechaza y el prompt enseña `[s/N]`. Tope de
  `MAX_APPROVAL_ROUNDS = 5` rondas por turno.
- **El modal de la TUI es fail-closed POR TECLA** (`cli/tui/aprobarTui.tsx`): solo `s`/`S`
  aprueba; `n`, Enter, Escape, Ctrl-C y desmontar sin responder son rechazo.
- **La única grieta es `seAplicaSinAprobacion`** (`core/settings.ts`, comando `/aprobacion`), con
  seis condiciones: vive en `settings.json` y **no** en el `config.json` del proyecto (que puede
  venir de fuera); offline se comprueba mirando el bloque `cloudstudio` **del disco por la raíz**
  (en la web `FuentesDeEleccion.proyecto` no se rellena nunca); hace falta interactivo; solo el
  booleano `true`; se pregunta en cada RONDA y no al abrir; y se DICE dos veces (aviso por turno
  con los nombres, y `alta.sinAprobacion`). En un proyecto conectado el comando RECHAZA.
- El origen del interrupt se dice UNA vez: `aPendiente` (`agent/interrupts.ts`) quita el prefijo
  `[perfil]` de la descripción porque el dato ya viaja en `origen`.

### El verificador, en el turno

`agent/turnoReal.ts#conVerificacion`. Cinco reglas:

- **Cosido al FINAL del flujo, no después del turno** (`correrTurno` cierra en su `finally`).
- **Solo la ronda FINAL**, la que termina sin escrituras pendientes.
- **Solo si el turno tocó ficheros del PROYECTO** — `.xonecode/` no cuenta. Y el aviso «no ha
  corrido» solo sale si escribió y aun así no se verificó, con el motivo.
- **Los hallazgos se REPARTEN** entre los ficheros del turno (fichero RELATIVO y línea, nunca
  contenido) y `preexistentes`. Uno sin fichero va con los del turno, que es el lado conservador.
  **Un hallazgo no atribuye autoría**: el simulador mira el proyecto entero.
- **Que falte el binario es fallo del ENTORNO** y se dice en un `aviso`, sin tumbar el turno. El
  verificador entra por parámetro (`verifier?: VerifierPort`), así que `npm test` sigue sin él.

**Un rojo se REPARA** (`TOPE_REPARACIONES`, dos intentos): los hallazgos vuelven como mensaje de
USUARIO en el mismo hilo. La huella son los **ERRORES** (código|fichero|línea) comparada con la
del veredicto anterior, no «¿bajó el número?». **Un turno cierra UNA vez**: lo decide el
generador al agotar el flujo, y las condiciones con que predice otra ronda son **las mismas** del
`break` del bucle — si divergen, un turno se queda sin `fin` o cierra dos veces. `reparacion` se
emite al EMPEZAR la pasada.

`agent/instantanea.ts`: la foto del ANTES es un árbol de git en un `GIT_INDEX_FILE` privado —sin
commits, sin tocar el índice del usuario— y se toma **por turno**, no por sesión.

### Las tareas en background

`core/tareas.ts`, `agent/tareasEnDisco.ts`, `web/servidor/corredorDeTareas.ts`,
`consolaDeTarea.ts`, `core/entrega.ts`, `agent/juezDeTarea.ts`. Un encargo por proyecto que corre
solo y escribe sin pedir aprobación. Cuatro estados; `requiere-atencion` significa **esperando
feedback del desarrollador** y no es terminal.

- **La autorización es el ACTO DE CREAR LA TAREA**, no un interruptor, y **no se reutiliza
  `seAplicaSinAprobacion`** (que significa «el humano que está aquí ha decidido no pulsar»).
- **Las guardas de RUTA siguen enteras**: `/artifacts/`, vistas aplanadas, `/.env`, `/.git`,
  `/.xonecode`. Las tres últimas las corta `permissions` con un `ToolMessage`, no el backend.
- **El sitio del diff lo ocupan el verificador y el JUEZ, y el juez no basta solo**: las
  condiciones las comprueba el CÓDIGO (`core/entrega.ts#condicionesDeEntrega`) — verificador en
  VERDE (no correr **no es** verde), nada pendiente de aprobar, `revisable`, y una cuarta:
  autorizó escrituras y git no ve ningún cambio. Una tarea de solo lectura sí se entrega, porque
  el dominio del verificador son las escrituras; `escribio` solo se afirma **con marca** de git.
- **`Tarea.autorizadas` guarda lo AUTORIZADO, no lo escrito.** La verdad de lo que cambió está en
  la ref de git de la sesión.
- **Un solo corredor por máquina, y el cerrojo no lo garantiza solo**: lo hace verdad
  `sigoSiendoDueño()`, preguntado **antes de despachar cada tarea**. La cuarentena del cerrojo
  lleva el **pid** en el nombre.
- **Gana la persona**: una tarea no arranca en un proyecto cuya consola humana está ABIERTA (no
  «con turno en vuelo»: solo la primera es estable al despachar). El precio se dice en pantalla.
- **La tarea abre por su PROPIA puerta** (`vestibulo.ts#abrirParaTarea`), que no registra el
  proyecto ni muda el sumidero del cable. Las dos puertas comparten **un solo cuerpo de función**.
  Y esa puerta tiene que REENVIAR `tarea.sesion` y el id de la tarea: se ha caído tres veces, una
  por argumento, y TypeScript no se queja de una lambda que ignora parámetros
  (`construirCorredorDeTareasCableado`, con un test por argumento).
- **Su consola APARCA en vez de contestar por nadie** (`consolaDeTarea.ts`): `preguntar` y
  `leerSecreto` no devuelven `""` —16 de sus 18 llamadores lo leen como «usa el valor por
  omisión»—, aparcan y CORTAN. El rechazo lleva mensaje propio, sin el «por el usuario» de la
  librería.
- **El feedback vuelve como mensaje de USUARIO en el mismo hilo**: es una LISTA, se marca
  CONSUMIDO, un feedback vacío se rechaza, y si el hilo no se puede reanudar se DICE.
- **La sesión se persiste, y su `sesion` sobrevive si y solo si hay algo abrible.** Borrar una
  sesión que una tarea usa DECLINA con motivo (`olvidarMarcaDeSesion` y `olvidarMemoriaDeHilo` no
  son condicionales ahí); abrir una de una tarea EN CURSO también, con el mismo predicado
  `esDeUnaTareaEnCurso`, comparando `sesion` **y** `idDeHilo`, y **antes** de cerrar la abierta.
- **`mirar` no es `conectar`** (`transporte.ts`): un mirón no es alguien a quien preguntar, así
  que es un conjunto aparte que no toca `hayCliente`. El transporte de una consola de tarea emite
  su `{clase:"turno"}` sin mirar `alCable`, así que hay dos listas BLANCAS (transporte y
  `arranque.ts`): lo que no se nombra, no sale.
- **`arrancarConectado` es UNA función con el orden dentro** (puente al cable y LUEGO corredor), y
  el `try` alrededor de `alCambiar` no es higiene: sin él una excepción al emitir para el corredor
  ENTERO.
- **Los adjuntos** viven en `~/.xonecode/tareas/<id>/adjuntos/`, fuera del proyecto. Suben por
  `POST /adjunto` con su propio lector (`leerCuerpoCrudo`), bajo un id de BORRADOR que `crear`
  ADOPTA, con dos guardas en los dos sitios: forma de segmento llano y que no sea ya una tarea.
  La barrera del id se aplica sobre el TEXTO y sobre el camino REAL (`mkdirSync` recursivo SIGUE
  un enlace simbólico). Se DICE que están al mandar el turno (`core/adjuntos.ts#conAdjuntos`),
  porque ninguna instrucción nombra esa raíz, y se dice que el agente los LEE y no los VE.
  Declarado sin hacer: no hay poda de huérfanos.
- **El encargo se AUMENTA y se enseña EDITABLE antes de encolar** (`AumentadorPort`, papel
  `trabajo`): ese paso ocupa el sitio del diff. Su fallo es recuperable por diseño — sin modelo se
  encola el texto original y se DICE.

### La consola web

`src/web/` (servidor) y `apps/web/` (cliente): la TERCERA piel de LA MISMA consola
(`cli/consola.ts`), y la de omisión.

- **`decidirPiel`** (`cli/main.ts`): `--cli` gana siempre, `--web` la fuerza sin terminal, y
  **sin stdin TTY la omisión NO es la web** — `echo … | xonecode` abriría un navegador y se
  llevaría el e2e de tubería byte-idéntica. El TTY entra por parámetro para probar los dos lados.
  `decidirTui` igual: `--no-tui` gana, `--tui` fuerza (sin TTY es error de USO, 64), por omisión
  TUI solo con stdin Y stdout TTY.
- **`arrancarConsolaWeb`** (`web/servidor/arranque.ts`) comprueba en orden: que existe
  `apps/web/dist/index.html` —si no, salida **70**, fallo del entorno—, avisa si el cwd es
  offline y **sigue**, y levanta. `abrirEnSistema` escucha el `error` del `spawn`: un `xdg-open`
  que no existe se llevaría el proceso.
- **El servidor es `node:http` en loopback y nada más** (`servidor.ts`), sin bandera para
  `0.0.0.0`: token en la query que se vuelve cookie `HttpOnly`, comprobación de `Host` y `Origin`
  en TODA petición (el ataque real es el DNS rebinding) y `.xonecode` denegado por el TEXTO de la
  ruta antes de tocar disco. Un cuerpo ilegible responde 400 **sin devolver nada de lo recibido**:
  por ahí pasa la clave de API.
- **El vestíbulo** (`vestibulo.ts`) es lo que hay ANTES de que exista ninguna raíz. Hay **varias
  consolas vivas a la vez, con clave por RAÍZ** y un foco: nunca dos consolas sobre la misma copia
  de trabajo, y dos proyectos distintos pueden trabajar a la vez. Consecuencias:
  `proyectoAbierto()` es la del FOCO y `proyectosAbiertos()` la lista — y la guarda de «gana la
  persona» tiene que usar la segunda o una consola en segundo plano dejaría su proyecto por libre.
  Mudarse SUELTA los sumideros (`Transporte.soltar`), no los desconecta: `desconectar` afirma «se
  ha ido el humano» y daría por RECHAZADA la aprobación en vuelo. La aprobación en vuelo se
  REEMITE al volver (`mensajesDeAprobacion()`). Una consola de fondo vive solo mientras su turno
  está en vuelo.
- **El cable habla con TODOS los clientes** (`transporte.ts` es un `Set`): la ráfaga de bienvenida
  va SOLO al recién llegado, y la consola se da por sola cuando se va el ÚLTIMO.
- **El turno en vuelo lo DICE el servidor** (`clase: "turno"`, emitido por el envoltorio del
  ejecutor): deducirlo de los actos fallaría justo cuando importa, porque un turno que revienta no
  siempre deja `fin`. El aviso de fin va en un `finally`. Parar es `clase: "cancelar"` →
  `SesionReal.cancelar()`, que aborta el stream y **deja la sesión viva**.
- **El cliente no manda comandos**: por el cable viaja la intención (`clase` `modelo`, `sesion`,
  `credencial`, `entorno`, `dispositivo`, `tarea`…) y cómo se aplica lo decide el servidor,
  encolando en el lazo con `consolaWeb.encolar` —sin acto de usuario falso—. **La función se
  comparte; la sintaxis no se exporta.** El registro que el compositor sugiere se **genera**
  recorriendo `COMANDOS` (`comandosDelRegistro`).
- **Ajustes tiene UNA pestaña por entorno registrado, y abrir una NO cambia el entorno
  activo** (`Ajustes.tsx`, `accion: "proyectos"` → `atenderProyectosDeEntorno`). Elegir
  proyectos es MIRAR; mudar el activo (`accion: "activo"`) le cambiaría la barra a quien
  trabaja en otro servidor. La lista de cada entorno se pide al abrir su pestaña y solo si
  falta —el activo ya la trae en el `alta`—, **sin caché**, y el que falla lleva su `error`
  sin tumbar a los demás. Lo marcado se guarda **por entorno** (`elegidosPorEntorno`): con
  una sola variable, la pestaña de B arrancaba con los ids de A y el primer clic guardaba la
  elección de A bajo B. El efecto depende de los DOS CAMPOS de esa pestaña y **no del record**
  (que con su omisión `{}` es un objeto nuevo por render: medido, 5 peticiones donde iba 1), y
  el cableado de los dos sentidos tiene test propio porque el prop es opcional y `tsc` no lo
  caza.
- **La clave de API viaja por el ÚNICO mensaje del cable que la lleva** (`leerSecreto`), y se
  PRUEBA antes de escribirse: `motivoDeClaveInaceptable` (`core/config.ts`) criba de balde, y
  luego el catálogo con `aplicarCredencialAlProceso` — **solo si el proveedor contesta** se
  escribe en `auth.json`. La clave a medias vive en una variable de la VUELTA del lazo, no del
  lazo. Trampa: `guardarCredencial` escribe TAMBIÉN en `process.env`, a propósito.
- **Los dólares del asistente se ESCAPAN antes de pintarlos** (`apps/web/src/protegerDolares.ts`):
  el `MarkdownText` monta matemáticas con dólar simple y `$http` es un objeto real de XOne. Fuera
  de código solo; el botón de copiar y las Trazas llevan el original. `streaming` apaga shiki, así
  que solo va puesto mientras el servidor dice que hay turno en vuelo.
- **Los actos de `sistema` se ven en el chat** (respuestas a comandos y avisos de honestidad), y
  van FUERA del tramo plegable. `razonamiento` es su propio evento y su propio acto —`textoDe` lo
  EXCLUYE del texto—. El texto del asistente se enseña mientras llega, a `MS_ENTRE_PARCIALES`
  (80 ms) con el reloj por parámetro, porque cada emisión manda el acto entero.
- **Una sesión reabierta lo DICE, y lo dice el servidor** (`alta.historica`, preguntando al
  checkpointer). El alta se reanuncia en los DOS flancos del turno y **diferido** a una
  microtarea, porque `vestibulo.ts` llama a la escucha ANTES de `volcar()`.
- **De quién es una sesión se GUARDA, no se deduce** (`EntradaIndice.tarea`): cruzarlo con la cola
  fallaría en silencio porque la cola es OPCIONAL. Hay una SIEMBRA monotónica al arrancar el
  corredor (`marcarTareaDeSesion`) que solo AÑADE y no da de alta entradas que falten. Por el
  cable viaja un BOOLEANO, no el id de la tarea. El orden es por `ultimoTurno`.
- **La sesión entra en el índice con el MENSAJE**, no cuando el asistente contesta, y se vuelca
  solo con el turno parado (el acto de usuario no muta nunca).
- **`localStorage` es de ESTE navegador** (apariencia, barra plegada, ancho): todo acceso envuelto
  en `try`, porque en una ventana privada el accesor lanza.
- **Ningún color literal fuera de `estilos/marca.css` y `splash.css`** (`Barra.test.tsx` lo
  vigila), `transparent` incluido. La paleta redefine solo los alias con acento; el cian es
  ACENTO y no sostiene texto.
- **Nada se trae de un CDN** (tipografías empaquetadas, iconos copiados): esta consola escucha en
  loopback y declara un modo offline de primera clase.
- **Un control sin dato detrás no se pinta.** Ausente ≠ vacío en las cuatro capas (disco, cable,
  store, componente): `Entorno.proyectos`, `AjustesDeDispositivos`, `compartido`, `detalles`.
  Lo que falta se ROTULA; lo que queda fuera se CUENTA con el camino para arreglarlo.
- **Lo que se pliega se DESMONTA**, nunca `visibility`: un elemento invisible sigue siendo
  tabulable. Y `display: none` no es enfocable, así que lo que el teclado debe alcanzar se
  esconde con opacidad.
- **Los artefactos se sirven con DOS capas de sandbox** (`GET /artefacto?n=<nombre>`): iframe
  `sandbox="allow-scripts"` **sin** `allow-same-origin` (origen opaco) y la cabecera
  `Content-Security-Policy: sandbox allow-scripts`, que cubre la navegación de primer nivel con la
  cookie puesta. Más `nosniff` y `no-store`. La barrera es `esRutaDeArtefacto` aplicada al texto
  de la query **y** al `realpath`. La sesión la resuelve el servidor con `idDeHilo`, no con
  `sesion`. Consecuencia: `localStorage`, `sessionStorage` e `indexedDB` **lanzan** dentro del
  iframe, así que `SKILLS_VISUALES` (`agent/agentesEnDisco.ts`) lo dice desde el prompt y no solo
  desde una skill que hay que cargar.
- **Ficheros y Revisión**: el lector filtra con las MISMAS reglas que ve el agente
  (`puedeLeerRuta`, `esVistaAplanada`) y **la barrera se aplica DOS veces** — sobre el texto que
  teclea el cliente y sobre el camino REAL que devuelve `realpath`. Con una sola no era verdad:
  en APFS `.ENV` abre `.env`, y un enlace dentro de la raíz que apunta a una carpeta denegada pasa
  «sigue en el proyecto». El árbol NO recorre detrás de un enlace (`lstatSync`). La imagen se
  decide por EXTENSIÓN y antes de olfatear el NUL (un PNG lleva ceros en su cabecera), viaja como
  `mime` + `base64` y se pinta en un `<img>`, **nunca marcado inyectado en el DOM** (un `.svg`
  puede traer `<script>`). El `case "fichero"` del store es una lista BLANCA: un campo nuevo no
  llega hasta que se nombra ahí. Las dos pestañas piden su foto cuando NO la tienen y con
  `conectado`, no al montar.
- **Revisión arranca PLEGADA**: al abrir no se despliega ningún bloque ni se pide ningún
  parche, y cada diff se pide al pulsar su cabecera. Hubo una omisión de ocho abiertos y se
  cayó con los tamaños de verdad (dos ficheros, +582 líneas, 483 en uno solo): volcaba un
  diff que nadie había pedido y dejaba fuera de la vista la LISTA, que es lo que la pestaña
  contesta. Misma regla que el árbol de Ficheros, y por el mismo motivo. El efecto de
  `App.tsx` solo OLVIDA lo desplegado cuando el store tira la foto, para que las filas
  abiertas de una sesión no sigan abiertas sobre los ficheros de otra.

### Sesiones, hilos y git

- **El hilo SOBREVIVE al proceso** (`agent/checkpointer.ts`, `SqliteSaver` en
  `.xonecode/checkpoint.sqlite`): uno por PROYECTO particionado por `thread_id`, y **el
  `thread_id` ES el id de la sesión** —sin esa igualdad no hay nada que reanudar—, decidido al
  ABRIR. Se crea con el modo puesto **antes** de abrirlo (SQLite lo crea con 0644 y un checkpoint
  lleva los mensajes enteros). La fábrica devuelve la MISMA conexión por proyecto. Borrar una
  sesión olvida su hilo, su ref de git y sus artefactos. La consola de TERMINAL no lo usa: sin
  índice donde reanudar, persistir solo engorda el fichero.
- **Una aprobación sin contestar se vuelve a preguntar, pero no sola**: `abrirSesionReal` SALDA
  las llamadas colgadas (`saldarAprobacionesHuerfanas`) con una respuesta sintética que dice la
  verdad, porque al modelo le llegaría un `AIMessage` con tool_calls sin `ToolMessage` detrás y
  Gemini y OpenAI contestan 400.
- **Esto CRECE y no hay poda**: 370 checkpoints y 30 MB en cinco turnos. Por eso `.xonecode` se
  saca del índice privado de `instantanea.ts` y `sesionGit.ts` (`sacarXonecodeDelIndice`): en un
  proyecto OFFLINE nadie escribió el `info/exclude` y las refs `refs/xonecode/sesion/*`
  mantendrían esos objetos vivos para siempre. `/nuevo` en la web abre un hilo huérfano y lo DICE.
- **Cada turno COMMITEA lo que dejó** (`agent/gitSync.ts#commitDeTurno`): con el índice DE VERDAD
  (hay test de que el árbol queda LIMPIO), sin cambios no se commitea (`git commit` con índice
  vacío sale con error), identidad NUESTRA por `-c`, se ESPERA (74 ms medidos), va en el `finally`
  **envuelto entero**, y solo `dentroDelWorkspace` (puro, con test) — en la carpeta que abrió una
  persona sería ensuciarle el historial. El mensaje no dice «lo escribió el agente»: `add -A`
  barre todo lo que hubiera cambiado.
- **La basura del SO va a `info/exclude`, NUNCA a `.gitignore`** (`asegurarExclusiones`, que
  `prepararRepo` y `commitDeTurno` comparten): `.gitignore` es un fichero del PROYECTO y subiría
  él mismo, y sin esto un `.DS_Store` acababa en la app del cliente **como binario**
  (`extensionDe(".DS_Store")` es `""`, así que cae en la rama base64).
- **La atribución sale de los COMMITS, no de la foto** (`agent/sesionGit.ts`): un TRAILER con el
  id de sesión (`CLAVE_DE_SELLO`, que `commitDeTurno` escribe y `sesionGit.ts` grepea — el formato
  vive en el módulo que lo lee). El `--grep` no decide: se **VERIFICA** el trailer entero, o `s1`
  se quedaría los commits de `s10`. La LISTA sale de los commits uno a uno; las CUENTAS y el
  PARCHE de los dos extremos (padre del primer commit → árbol de ahora, no el último commit).
  `sinCommitear` se enseña MARCADO y se QUITA de `cambiados`. Sin commits sellados el respaldo se
  declara con otro nombre: `via: "desde-apertura"`, y la pestaña dice «Desde que abriste». Los
  cuatro valores de `via` (`git`, `desde-apertura`, `sin-empezar`, `sin-marca`) son cuatro
  situaciones distintas. La costura está extraída y probada (`commitDeTurnoCableado`).
- **Se lista árbol contra árbol**, nunca `git diff <arbol> -- .` (compara contra el índice REAL
  del usuario y da por borrados ficheros que están ahí), con `--no-renames` y `--relative`
  (los árboles se escriben desde la raíz del REPO, que no tiene que ser el proyecto).
  `.xonecode/` se excluye **en el DIFF y nunca en el `git add`**: `git add` con un pathspec de
  exclusión sobre una ruta ya ignorada sale con **código 1**.
- La ref de sesión es `refs/xonecode/sesion/<id>` y no un tag (un tag es público y significa
  «versión»); guardar el SHA en un JSON nuestro no vale porque `git gc` se llevaría el árbol.
- **Al borrar la sesión ABIERTA se cierra ANTES de borrar**: `cerrar()` llama a `volcar()`, que
  RESUCITA la entrada recién borrada. **Un título vacío se rechaza** (`renombrarSesion`): dejarlo
  en blanco devolvería la sesión al régimen automático y el siguiente turno la rebautizaría.

### CloudStudio y la sincronización

`agent/cloudstudioMcp.ts`, `descarga.ts`, `gitSync.ts`, `subida.ts`, `core/planDeSubida.ts`.

- **Las tools remotas NO se inyectan en el agente.** Solo `cli/` (y el vestíbulo) llaman a
  `conectarCloudStudio`, `descarga.ts` y `subida.ts`; nunca una tool que el agente pueda invocar.
- El puerto de callback (**7634**) es fijo porque el IDS registra el `redirect_uri`; el estado
  OAuth va a `~/.xonecode/cloudstudio-oauth.json`, **nunca al repo**. Tres escalones de scopes y
  ninguno incluye `mcp.admin`.
- **Abre por NOMBRE y rechaza el id**: `clienteCloudStudio(invocar, nombreDeProyecto)` usa ese
  valor cada vez que reabre, así que quien llama desde la web TRADUCE (`ramasDe` acepta
  `{id, nombre}`).
- **La sesión caída llega de DOS formas** y hay que mirar las dos: un error de tool (`isError`) y
  una respuesta CORRECTA cuyo texto empieza por «Error: No project is open…». `conSesion`
  (`agent/cloudstudioClient.ts`) mira el RESULTADO además de la excepción, reabre y reintenta una
  vez. Ningún `JSON.parse` a pelo: `comoJson` dice QUÉ tool contestó.
  **`ProviderCloudStudio.invalidateCredentials` tiene que existir**: es el gancho del que depende
  la recuperación del SDK; sin él un token caducado era un fallo duro.
- **El nombre de la tool de proyectos no se codifica a pelo** (`herramientaDeProyectos`: nombres
  conocidos en orden, luego una heurística con «list» + «project» y CERO argumentos obligatorios),
  y **la respuesta no es una lista**: es un mapa bajo «recents» con el id en `pid`.
  `proyectosDeResultado` se queda con `{id, nombre, compartido?}` **y nada más** — la respuesta
  trae permisos, fechas y **el correo del propietario**, y hay un test que compara las claves
  EXACTAS para que un «ya que estamos» no cuele el correo. `compartido` solo si vino como booleano
  de verdad; ausente se propaga como ausente y no se pinta ninguna etiqueta. `completarProyecto`
  **desestructura** en vez de reenviar la fila.
- **El estado de «qué hay arriba» no es un fichero nuestro**: es la ref
  `refs/remotes/cloudstudio/<rama>`, y el libro de cuentas es git. El remoto se declara con
  `skipFetchAll` o el `git fetch --all` del usuario muere.
- **Lo que no se pudo bajar, no se puede borrar** (`core/planDeSubida.ts`): el manifiesto de
  `sync.json` impide que las imágenes que git ve «borradas» vacíen el proyecto en Studio.
- **La ref se mueve solo si la subida terminó entera**, y la que se mueve es la de la rama de
  TRABAJO (`xonecode/<origen>`), no la origen. El reintento reenvía el plan ENTERO, lo que asume
  idempotencia del servidor sin comprobarla.
- **`.xonecode` no sube nunca**, con filtro propio además del exclude de git. La rama activa del
  servidor se restaura tras cada operación.
- **Orden al descargar: extraer → borrar vistas aplanadas → commit de baseline.** Al revés, git
  vería esos `.xml` como borrados y la primera subida los borraría **en Studio**.
- **Guarda de árbol limpio en las DOS direcciones** (`arbolLimpio`): al subir porque se sube un
  commit, al bajar porque `bajar` SOBRESCRIBE y el baseline se construye después. No hay ningún
  `git merge`: fusionar es del usuario, en Studio. Una carpeta que aún no es repo solo está limpia
  si está vacía salvo por la basura del SO (lista CERRADA: un `.env` o un `.gitignore` sí bloquean).
- **La autorización de la subida es un hueco de política, fail-closed por TIPO**
  (`core/cloudstudio.ts#PoliticaDeAprobacion`): `subir()` no se puede invocar sin decir quién
  autoriza. Hoy solo la interactiva, con el plan delante. `main.ts` es fail-closed si alguien
  llamara sin política.
- **Lo IMPOSIBLE sale del plan y se declara** (`{operaciones, omitidas}`): `chunked` no está
  implementado y el borrado es una tool de TEXTO, así que un binario borrado no se puede
  propagar. Sin esto, la primera imagen borrada dejaba `/sync subir` inútil para siempre.
- Dos trampas: `core.quotePath` (por omisión `true`) cita en octal cualquier ruta con bytes
  ≥ 0x80 y rompía el candado con un `ñu.xne` —`cambiosPendientes` fuerza `false`—, y sin
  `--no-renames` un `A.xne` → `B.xne` deja `A` huérfano en Studio sin ningún aviso.

### Modelos, configuración y credenciales

- **Modelos por papel** (`core/modelos.ts`): `rapido`, `trabajo`, `afilado` (reservado al juez).
  Por omisión, Ollama local. Precedencia: `--modelo-<papel>` > `--modelo` > `XONECODE_MODELO` >
  proyecto > global > omisión, y cada valor recuerda su `origen`.
- **`config.json` RECHAZA claves de API**; las credenciales van solo en `~/.xonecode/auth.json`,
  modo 0600. El ESCRITOR es `agent/authEnDisco.ts` y su contrato es que **una escritura nunca
  destruye lo que había**: la base de la fusión es el objeto CRUDO (no el de `validarAuth`, que
  descarta entradas raras en silencio) y ante un JSON roto **para sin escribir**.
- **La variable de entorno de cada proveedor vive en UN sitio**
  (`core/modelos.ts#VARIABLES_POR_PROVEEDOR`). Hubo cuatro copias y ya habían divergido.
  `aplicarAuth` recorre lo que HAY en `auth.json`, no `PROVEEDORES`.
- **Los compatibles con OpenAI son una TABLA** (`COMPATIBLES_OPENAI`: NVIDIA, Groq, xAI), no
  ramas. La clave se **EXIGE al construir** (`construirCompatibleOpenAi`): `ChatOpenAI` sin
  `apiKey` la busca en `OPENAI_API_KEY`, y sin la guarda la clave de OpenAI del usuario viajaría
  a otro host. Los casos van enumerados en el `switch`, no en un `default`, para que siga siendo
  exhaustivo.
- **Los PERSONALIZADOS son la misma tabla con la fila del usuario**: `ProveedorPersonalizado` es
  la plantilla `` `custom:${string}` `` y `parsear` la acepta por su FORMA. Se guardan **solo en
  el `config.json` global** y el del proyecto se rechaza con aviso GRAVE: la clave vive en
  `auth.json` bajo el identificador, así que un proyecto que redefiniera la `baseUrl` mandaría esa
  clave donde él dijera. El slug se DERIVA del nombre (solo en el servidor), la variable también
  (`XONECODE_CLAVE_<SLUG>`), un slug repetido se RECHAZA y la baja se lleva la credencial.
- **La regla de qué URL vale es UNA** (`core/modelos.ts#motivoDeEndpointInaceptable`, de donde
  tira `cloudstudioMcp.ts#urlDeMcpAceptable`): HTTPS sin credenciales, más `http://` en una lista
  CERRADA de hosts loopback. El cliente lleva su copia declarada porque la frontera prohíbe
  compartir módulo.
- **El catálogo VIVO es la validación de la conexión** (`agent/catalogoModelos.ts`).
  `ErrorCatalogoModelos` nunca lleva la clave ni el cuerpo remoto —pero sí el código HTTP, o un
  410 y un 500 se leen igual—. Un modelo de Ollama retirado se salta; que fallen TODOS se relanza.
  Ollama local y Ollama Cloud son dos hosts distintos y no se mezclan.
- **La lista de proveedores de la pastilla es la de lo COMPROBADO**: con clave, que la clave ESTÁ;
  sin clave (Ollama, un personalizado local), que su catálogo CONTESTÓ —esos se prueban al
  CONECTAR, una vez por proceso, y solo ellos—. El que está EN VIGOR se enseña siempre. Los que
  quedan fuera se CUENTAN. `SIN_CREDENCIAL` tiene TRES estados (verde / hueco / nada);
  `hayCredencial` no sirve para esto, contesta otra pregunta.
- **El modelo en vigor lo dice el SERVIDOR** (`resolver(estadoDeSesion.fuentes).trabajo` de la
  consola ABIERTA), por la costura `Consola.alEstado`: `/modelo` cambia en caliente sin tocar
  disco, así que releer la configuración contaría lo de antes para siempre.
- **Claude se construye con tope de salida y razonamiento a mano, y las dos son datos de
  `core/`** (`topeDeSalida` en `core/contextos.ts`, `pideThinkingAdaptativo` en
  `core/modelos.ts`), con prueba de COSTURA contra `invocationParams()` del cliente real
  (`agent/modelos.test.ts`, sin red). **El `max_tokens` por omisión de
  `@langchain/anthropic` sale de una tabla por PREFIJO y un id que no conoce cae en su
  `FALLBACK_MAX_OUTPUT_TOKENS` de 4096 SIN decirlo** — medido con `claude-sonnet-5`, que no
  casa con ninguna de sus claves; en un harness que escribe ficheros eso no da error, corta
  la escritura a media respuesta. Y **omitir `thinking` no significa lo mismo en todos**:
  Opus 5 y Sonnet 5 ya corren adaptativo, la generación 4.6-4.8 corre **sin pensar**, y
  Haiku 4.5 y lo anterior a 4.6 lo RECHAZAN (usan `budget_tokens`), así que pedirlo a ciegas
  sería un 400. `effort` no se manda: omitirlo ya es `high`.
- **Los topes de contexto solo si se saben** (`core/contextos.ts`, por familias; **ollama no tiene
  tope a propósito**). El porcentaje solo se calcula con tope: uno sobre un número inventado es
  una mentira con forma de cifra. La barra y `/config` usan la misma `topeResuelto`.
- **La creación de proyecto al arrancar** (`core/esqueleto.ts`, `agent/crearProyecto.ts`): omisión
  **No**, datos puros de la documentación XOne —nada inventado—, y **nunca pisa un fichero
  existente**: lo salta y lo declara.
- **El alta son cuatro pasos y cada uno solo aparece si falta lo que decide**, preguntándole al
  sistema y nunca a una marca de «primer arranque». Sin TTY real se saltan los cuatro en
  `main.ts`. Cancelar después de elegir proyecto deja `cloudstudio` y `modo` en disco a propósito
  —negarlo sería mentir— y se DICE.
- **`COMANDOS` (`cli/consola.ts`) es el registro único**: `/ayuda`, la cabecera de stdio, el
  completado del Tab y la lista de la web se generan recorriéndolo. `/config` llama a `cmdConfig`,
  no a una copia. No hay código propio de historial fuera de la piel.

### Dispositivos

`core/dispositivos.ts`, `agent/dispositivosEnMaquina.ts`, `agent/instalacionEnMaquina.ts`.

- **`xcode-select -p` ANTES de cualquier `xcrun`**: sin herramientas de desarrollo, `xcrun`
  levanta el diálogo de instalación encima de lo que haya.
- **Cinco estados por herramienta, no un booleano**: ok, no encontrada, falló (UNA línea de
  motivo), **no aplica** (iOS fuera de macOS) y **desactivada**. La RUTA se queda en el host.
- **Es una FOTO con hora, no un estado en vivo, y no hay sondeo**: se mide al conectar el primer
  cliente (una detección en vuelo compartida) y al pulsar «Volver a mirar». Cada proceso lleva
  tope (`TOPES_MS`) y un cuelgue se dice «no respondió».
- **Apagar un destino deja de LANZAR procesos**, no esconde filas; una herramienta que sirve a dos
  destinos solo se salta con los dos apagados. Configurar y volver a medir son el MISMO mensaje,
  en ese orden. Ausente ≠ `{}` ≠ `"false"` (cadena, descartada en las tres capas).
- **Listar y VERIFICAR son dos preguntas**: `adb devices` contesta «device» de un teléfono cuyo
  `adb shell` está colgado, y `simctl getenv` contesta de uno APAGADO. Verificar ejecuta algo al
  otro lado, viaja el ID y nada más (el host lo resuelve contra su última MEDIDA), es un mensaje
  PROPIO, y las verificaciones viven con la foto.
- **«Terminó bien» y «ya está» son dos cosas**: la MEDIDA manda sobre el código de salida.
- **Se ejecuta lo que puede fallar RÁPIDO, no lo que no pide contraseña**: `sudo` sin TTY sale con
  código 1 en 57 ms. Se copia lo que fallaría siempre o no falla rápido (el `~/.zshrc`, un `sudo`
  escrito dentro, `xcodebuild -downloadPlatform`). Un test compara la tabla de lanzables con lo
  que la receta marca `ejecutable` **en las dos direcciones**.
- **Se mata el GRUPO, no el hijo** (`detached: true` + `kill(-pid)`): un nieto (`brew` → `curl`)
  sobrevive a `child.kill()`. Coste declarado: un Ctrl-C ya no se lleva la descarga.
- **Ningún comando lleva una ruta de la máquina** (`$(brew --prefix)`), y cada paso se marca por
  lo MEDIDO, no por recordar que se pulsó. **Las licencias se aceptan con un clic que lo DICE**, y
  nunca escribiendo a mano los ficheros de licencia del SDK.
- **El silencio es el síntoma, no la lentitud** (`TOPE_SIN_SALIDA_MS`, 5 min). Un trabajo a la vez
  para toda la máquina; un segundo «ejecutar» reenvía el estado.
- **El dispositivo de la sesión guarda la FOTO, no solo el id** (los ids no son estables), y solo
  si NO está a mano ahora. El cliente manda el ID y nada más. Ninguna tool lo consume todavía, y
  la pastilla lo dice.

### La TUI y el panel (terminal)

- **La TUI es una piel Ink de LA MISMA consola**: el lazo, el estado y el ejecutor entran
  INYECTADOS (`cli/tui/correrTui.ts`). Ink corre con `exitOnCtrlC: false` porque Ctrl-C significa
  cancelar el turno o rechazar en el modal.
- **`cli/tema.ts` es el ÚNICO fichero de producción con escapes ANSI** (`tema.test.ts` lo vigila).
  El filtro del ratón va DELANTE de Ink (`crearStdinSinRaton`) o una secuencia acabaría como texto
  en la Entrada; los modos solo se escriben con stdout TTY y se deshacen DESPUÉS de desmontar.
- **La fila de dos columnas mide `rows - 1`** (`FILA_DE_RESERVA`): a `rows`, Ink borra el terminal
  y repinta el frame completo en cada tecla. El transcript es lo ÚNICO elástico y cada acto va en
  un Box con `flexShrink={0}`; Entrada, Pregunta, pie y sidebar también. `app.test.tsx` monta
  `App` entera contra un stdout falso.
- **El panel de avisos** (`cli/panel.ts`) es la ÚNICA excepción al append-only: recinto de 5
  líneas repintado en sitio, borrado EXACTO por número de líneas (debajo vive el spinner), y
  **sin TTY no se instala** — se cae en `Piel.notificacion?` y las líneas estáticas, así que
  pipes y guion salen byte-idénticos.

## Los evals (`npm run eval`, nunca en `npm test`)

`src/evals/correr.ts` corre tareas XOne reales sobre el esqueleto «Hola Mundo» en un temporal,
con el agente de verdad, el simulador de verdad y una aprobación que **aprueba todo** (por eso
no acepta una raíz: solo sobre un proyecto que se tira). El veredicto del simulador se MIDE
en el corredor, no se lee del turno — el juez no puede depender de que el lazo haya hecho su
parte, que es lo que se evalúa. Los JUECES (`tareas.ts`) son código puro y SÍ tienen test en
`npm test`: un juez que juzgue mal invalida el eval entero sin que nadie lo note. El corredor
vive en `src/` para tipearse, `tsconfig.build.json` lo excluye, y su nombre no acaba en
`.test.ts` — así `npm test` sigue sin red, sin clave y sin simulador. `docs/EVALS.md` tiene
las tareas y cómo leer un resultado. La primera comprobación de la línea base destapó que el
esqueleto no pasaba el simulador (`COLL_MISSING_PROGID`): la línea base se comprueba por eso.

## Códigos de salida (contrato, CI los lee)

| | |
|---|---|
| 0 | bien |
| 1 | el proyecto tiene errores, o no es un proyecto XOne |
| 2 | quedaron escrituras **sin resolver** (nadie las aprobó, o se agotó el tope) |
| 64 | error de uso (bandera o modelo mal escritos) |
| 70 | fallo del **entorno**, no del proyecto |

Un fallo del entorno no se reporta como un proyecto roto: `agent/verificador.ts` lanza
`ErrorDelSimulador` en vez de devolver un informe en rojo.

**El 2 ya no promete «nada se aplicó», y eso se midió.** Prometía eso cuando las únicas
escrituras eran las del HITL del grafo; un agente EXTERNO pide su autorización por escritura y
antes de escribir, así que puede haber dejado algo en el disco cuando el turno se corta después
—medido: un `run --real` imprimió el fichero nuevo en su diff y, una línea más abajo, «nada se
aplicó»—. El código se queda en 2 (hubo escrituras sin resolver: no es un éxito, y esa es la
dirección segura para CI) y lo que se corrigió fue la frase. Lo que está en el disco lo dice el
diff de «cambios en el proyecto», que es la medida.

## Trampas verificadas

Con su medida entera en [`docs/DECISIONES.md`](docs/DECISIONES.md); aquí lo que hay que
recordar antes de tocar el código:

- **El patrón de fallo de esta arquitectura, medido SEIS veces: una composición de producción
  viviendo en un cierre que todos los tests doblan.** `backendDeAgente`, el corredor sin cablear
  en `arrancarConsolaWeb`, el `escribio` a fuego en `revisionConGit`, la capa de proyecto de
  `fuentesDelJuez`, el montaje de `/adjuntos/` con sus ocho saltos y `filaDeTarea`. En los seis la
  regla podía dejar de estar montada **con todo en verde**, y en los seis el remedio fue el mismo.
  Regla práctica: **si una regla de producción se compone dentro de algo que los tests simulan,
  esa regla no está probada — está escrita.**
- **La caché implícita de Gemini no entra a estos tamaños de contexto** (a ~11k, 0 aciertos en 36
  llamadas; a ~40k, ~91%), y `@langchain/google-genai` 2.3.0 suma `cache_read` dos veces en
  streaming: `vendor/tokenTracking.ts` acota la caché a la entrada.
- **`SkillsPort.cargar()` no tiene un solo llamador y las skills SÍ llegan al modelo**: las carga
  `SkillsMiddleware` de deepagents desde `/skills/` montada en el backend. El puerto solo aporta
  `catalogo()`.
- **ink@5.2.1 no remide un `<Text>` cuando se INSERTA texto delante de un hijo existente**
  (`insertBeforeNode` no marca sucio el padre; append y remove sí). Regla práctica: hijos que
  aparecen y desaparecen van como `Text` HERMANOS dentro de un `Box`, **nunca anidados en un
  Text**. La Entrada lo esquiva partiendo el texto en filas ella misma (`cli/tui/filas.ts`).
- **El `resize` de Ink no re-renderiza React**: recalcula Yoga y repinta el árbol YA montado, así
  que lo que dependa de `stdout.columns` leído en el render se queda viejo. `App` se suscribe al
  `resize` y fuerza un re-render.
