# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

`xonecode`: consola CLI y harness de agente para desarrollar aplicaciones **XOne**, sobre
LangChain / LangGraph / deepagents. El razonamiento detrás de cada decisión está en
`README.md` («Cómo está construido, y por qué») y en `docs/`. Este fichero es el mapa y los
invariantes, no la justificación.

**XOne no es desarrollo web.** Es una plataforma propietaria de apps móviles nativas: XML en
ficheros `.xne`, JavaScript ES5 y un CSS propio. No existe el DOM, ni `async/await` en el
runtime, ni React. La fuente de una colección es su `.xne`; los `.xml` los genera XOne Studio
y **no se tocan**. XOne ignora en silencio lo desconocido, así que un atributo o una función
inventada no da error — da un bug mudo. Esa regla gobierna los prompts (`agent/xoneAgent.ts`)
y el backend (`agent/proyecto.ts`).

## Comandos

```sh
npm run typecheck                      # tsc --noEmit
npm test                               # vitest run — todo el suite, sin red ni clave ni simulador
npm run test:watch
npx vitest run src/core/turno.test.ts  # un solo fichero
npx vitest run -t "la frontera"        # por nombre de test
npm run build                          # rm -rf dist && tsc -p tsconfig.build.json
./bin/xonecode …                       # lanzador de DESARROLLO: tsx sobre src/, preserva el cwd
```

No hay `vitest.config`: se usan los valores por omisión y los tests son **colocados**
(`src/**/*.test.ts`, junto al módulo que prueban). `tsconfig.build.json` los excluye, igual
que `src/core/__oro__/` (ficheros de oro: salida real de `xone-simulator --json`).

**Consecuencia medida de no tener `vitest.config`**: el `include` por omisión barre TODO el
repo, y `.worktrees/` (ignorado por git desde `ddf2948`, pero presente en disco) no está en el
`exclude` por omisión. Con un worktree viejo ahí, `npm test` corrió 128 ficheros en vez de 66 y
dio 2 fallos que no son de este código. Mientras no haya config:
`npx vitest run --exclude '**/.worktrees/**'`.

**`npm test` no puede necesitar una clave, una conexión ni el simulador.** Es el invariante que
sostiene todo el diseño de puertos: si un cambio lo rompe, está mal el cambio, no el test.

**No uses `npm run xonecode` desde otro proyecto**: `npm run` cambia el cwd al de este
`package.json`, así que xonecode creería que el proyecto es este repo. Para probar sobre una app
real, `./bin/xonecode` (o `npm run build && npm link`). Ese lanzador le pasa a tsx `--tsconfig`
anclado a la raíz del repo: tsx busca el tsconfig.json desde el cwd, así que lanzado desde otro
proyecto perdería el `jsx: react-jsx` y la TUI reventaría con «React is not defined» al montar.
Medido; hay un test (`src/cli/lanzador.test.ts`) que vigila el anclaje.

## Arquitectura

Cuatro capas, y la frontera importa más que el contenido:

| capa | qué es |
|---|---|
| `src/core/` | TypeScript **puro**: eventos de dominio, motor de turno, puertos + dobles, resolución de modelos, config |
| `src/agent/` | toda la suciedad del grafo: deepagents, langgraph, backend de ficheros, perfiles, verificador, git |
| `src/cli/` | despachador (`main.ts`), consola interactiva (`consola.ts`), un disparo (`run.ts`), comandos de diagnóstico |
| `src/vendor/` | módulos propios traídos de un laboratorio anterior (HITL, conteo de tokens), con sus tests |

**La frontera de `core/` está PROBADA.** `src/core/imports.test.ts` recorre los ficheros de
`core/` y falla si aparece un import de langchain, `@langchain/*`, langgraph, deepagents, ink,
react o `@modelcontextprotocol`. Al añadir algo a `core/`, esa es la regla dura. (La otra
convención — `agent/` no importa de `cli/` — vive solo como comentario en `agent/turnoReal.ts`;
nada la verifica. En el otro sentido sí se puede: `cli/main.ts` importa
`ficherosDelProyecto` de `agent/turnoReal.ts` para el completado de «@ficheros» del Tab.)

**Los puertos y sus dobles** (`core/ports.ts`, `core/deps.ts`). Todo lo caro (modelos, skills,
verificador, MCP) entra por un puerto que se **pasa al construir**, nunca se importa dentro de
quien lo usa. Los dobles viven en `ports.ts` y no en fixtures de test, porque el modo offline es
un modo de uso de primera clase (`xonecode describe` lo enseña). La marca de doble es el Symbol
`ES_DOBLE`, no un booleano: un campo se puede olvidar o poner mal, y entonces el aviso calla
justo cuando hace falta.

**Los eventos de dominio** (`core/events.ts`). `agent/` los emite (el puente
`agent/puente.ts` traduce los chunks del stream de langgraph), `core/turno.ts` decide qué se
cuenta, y las pieles (`cli/stdio.ts`, `cli/tui/`) pintan. Ningún evento lleva argumentos
de tool, ni truncados: `write_file` lleva el contenido del fichero y una tool MCP lleva el
bearer. La excepción aparente es `tool.detalle`, y no es una excepción: una lista blanca por
NOMBRE de tool (`agent/resumenDeTool.ts`) extrae un solo campo de ruta/patrón — nunca contenido.
Y el bloque de diff de la aprobación (`cli/aprobar.ts`, líneas de `core/diff.ts`) es el único
sitio donde el contenido se enseña entero: es el paso donde se DECIDE sobre él.

**Los avisos de honestidad son código, no prompt**, y tienen alcance de **turno**
(`core/bitacora.ts`): a un modelo al que le pides «avisa de que el verificador es de pega» a
veces no avisa, y un aviso que salta cuando no ha pasado nada enseña a ignorarlo.

**El panel de avisos** (`cli/panel.ts`) es la ÚNICA excepción al append-only de la consola: las
notificaciones de sistema (pausas, avisos deterministas, el tiempo final) viven en un recinto de
hasta 5 líneas grises que se **repinta en sitio** por encima del punto de escritura, y al
solidificarse deja en el historial solo la ÚLTIMA — el fin fusiona avisos pendientes y tiempo en
esa línea, para que el aviso de honestidad no lo borre el tiempo final. Dos reglas duras: el
borrado es EXACTO por número de líneas (nunca «hasta fin de pantalla», porque debajo puede vivir
el spinner) y **sin TTY el panel no se instala** — el motor cae en `Piel.notificacion?` (mismo
patrón que `fase?`) y las líneas estáticas de siempre, así que pipes y guion salen byte-idénticos.

**La TUI** (`cli/tui/`) es una piel Ink de LA MISMA consola (`cli/consola.ts`): el lazo de
comandos, el estado de sesión y el ejecutor entran INYECTADOS (`cli/tui/correrTui.ts`); la TUI
solo aporta entrada, preguntas, piel y el modal de aprobación. La frontera está probada
(`cli/tui/frontera.test.ts`): ink y react no se importan fuera de `cli/tui/` — igual que
langchain no entra en `core/` —, y es lo que mantiene pipes y `npm test` funcionando sin TTY.
El modo lo decide `decidirTui` (`cli/main.ts`): `--no-tui` gana siempre; `--tui` fuerza la TUI
(y sin TTY de verdad en ambos lados es error de USO, 64); por omisión, TUI solo con stdin Y
stdout TTY — cualquier tubería cae al stdio de siempre, que es lo que mantiene el e2e de pipe
byte-idéntico. El modal de aprobación (`cli/tui/aprobarTui.tsx`) es fail-closed POR TECLA: solo
`s`/`S` aprueba; `n`, Enter, Escape, Ctrl-C y desmontar sin responder son rechazo. Ink corre con
`exitOnCtrlC: false` (`cli/tui/correrTui.ts`) porque Ctrl-C tiene significado aquí: cancelar el
turno (un punto de cancelación en la piel, con rearme por turno) o rechazar en el modal.

**Las líneas de tool en la TUI son un grupo, no actos** (`cli/tui/store.ts`): las consecutivas
de un turno viven en un acto `herramientas` que el transcript pinta como sus últimas 4 líneas
en gris tenue, truncadas a una fila, más «… N pasos antes». El colapsador del motor
(`core/notify.ts`) escribe apertura Y cierre de cada racha porque stdio solo añade; el store
de la TUI sustituye la apertura por el cierre. stdio no cambia: es la piel la que decide.

**La TUI captura el ratón y usa la pantalla alternativa** (`cli/tui/raton.ts`, secuencias en
`cli/tema.ts`, el ÚNICO fichero de producción con escapes ANSI — `tema.test.ts` lo vigila). La
rueda mueve el transcript (3 actos por muesca) y no el scrollback; el filtro va DELANTE de Ink
(`crearStdinSinRaton`), porque una secuencia de ratón que llegara a `useInput` acabaría como
texto en la Entrada. Los modos solo se escriben con stdout TTY y se deshacen en el `finally`
DESPUÉS de desmontar Ink. `--sin-raton` apaga el ratón (queda PgUp/PgDn). Coste asumido:
seleccionar texto es Alt/Shift + arrastre.

**La maqueta de la TUI tiene una sola pieza elástica** (`cli/tui/app.tsx`). La fila de dos
columnas mide `rows - 1` (`FILA_DE_RESERVA`), porque Ink borra el terminal entero y repinta el
frame completo cuando la salida alcanza `stdout.rows` — con la fila a `rows` eso pasaría en cada
tecla. Dentro, el transcript es lo ÚNICO que cede (`flexGrow`, `overflow="hidden"`, recorta por
ARRIBA, y cada acto va en un Box con `flexShrink={0}` porque si no Ink pierde actos del medio);
la Entrada, la Pregunta, el pie y la sidebar llevan `flexShrink={0}`. Sin eso, medido, la fila
del modelo de la Entrada pisaba la línea en edición y el cursor desaparecía en cuanto había
pista de Tab o el transcript se llenaba. `cli/tui/app.test.tsx` monta `App` entera contra un
stdout falso y vigila esos estados; los tests de componente no los ven.

**El agente** (`agent/xoneAgent.ts`): un orquestador **sin ninguna tool** que delega en cuatro
especialistas (`docs`, `planner`, `dev`, `mockup` — `agent/perfiles.ts`). Cuatro cosas no son
negociables ahí:
- `FilesystemBackend` con `virtualMode: true`. Con el default, medido, el backend leyó una ruta
  absoluta de fuera de la raíz. Nada de backends con shell.
- Las **vistas aplanadas** (`X.xml` con un `X.xne` al lado) se retiran del backend con un Proxy
  (`agent/proyecto.ts`): así la regla es propiedad del proyecto y no de un prompt.
- Los permisos se construyen con `permisosDe(perfil)`, **nunca a mano**: `SubAgent.permissions`
  reemplaza los del padre en vez de fusionarlos, así que un perfil que los escriba a mano pierde
  la denegación de `/.env`, `/.git` y `/.xonecode`.
- El HITL va en las tools de fichero (`write_file`, `edit_file`), que son las que escriben.

`SubAgent.tools` lleva SOLO tools propias, nunca los nombres de las de fichero: pasarle nombres
las sustituía por cadenas y dejaba al especialista sin ninguna capacidad real. Las de fichero
las monta `createFilesystemMiddleware` desde el backend, y quien las acota es `permissions`.
La única tool propia hoy es la **búsqueda regex** (`agent/busquedaRegex.ts`): cubre patrones
estructurales de XOne/ES5 que el `grep` literal de deepagents no expresa, sin conceder
`execute` ni una shell. Va acotada a propósito
(`LIMITES_REGEX`: 50 ficheros, 256 KB por fichero, 100 coincidencias) y filtra rutas con
`puedeLeerRuta` — una tool de LangChain añadida por xonecode **no pasa por el middleware de
permisos**, así que la denegación de `/.xonecode` hay que re-aplicarla ahí a mano.

**La memoria del proyecto y el resumen de contexto** (`agent/memoriaDeProyecto.ts`,
`agent/resumenDeContexto.ts`). `.xonecode/memoria.md` viaja con el proyecto, pero el agente la
ve por UNA ruta virtual, `/MEMORIA_PROYECTO.md`: `exponerMemoriaDeProyecto` es un Proxy que
traduce esa ruta en `read`/`readRaw`/`write`/`edit` y nada más, así que la carpeta `.xonecode`
sigue denegada entera y escribir la memoria pasa por la misma aprobación que cualquier fichero.
El resumen usa `createSummarizationMiddleware` con umbrales **fijados a mano** (32k para
disparar, 8k de reciente): deepagents asume 170k cuando el proveedor no publica su ventana, y
con Ollama eso comprime demasiado tarde. Los historiales ya resumidos se escriben en
`.xonecode/conversation_history/` — internos, ni en el árbol del agente ni en la app XOne.

**CloudStudio (MCP con OAuth)** (`agent/cloudstudioMcp.ts`). Al abrir un proyecto sin
`.xonecode/`, `configurarModoInicial` (`cli/consola.ts`) pregunta el modo: `offline` o `cloud`;
`cloud` hace OAuth Authorization Code + PKCE contra el IDS, lista los proyectos y guarda en el
`config.json` del proyecto `modo` y `cloudstudio` (`url`, `scopes`, `proyecto`, `rama`). Invariantes:
- **Las tools remotas NO se inyectan en el agente.** `turnoReal.ts` y `xoneAgent.ts` no conocen
  CloudStudio; solo `cli/` llama a `conectarCloudStudio` — y, ahora que hay descarga y subida,
  también a `agent/descarga.ts` y `agent/subida.ts`. Las ejecuta el CLI, nunca una tool que el
  agente pueda invocar. Falta la lista blanca por perfil, y sin ella el catálogo entero
  acabaría en cada prompt.
- El puerto de callback (**7634**) es fijo porque el IDS registra el `redirect_uri`; el estado
  OAuth va a `~/.xonecode/cloudstudio-oauth.json`, **nunca al repo**.
- Tres escalones de scopes (`SCOPES_CLOUDSTUDIO`, `…_ESCRITURA`, `…_AGENTE`) y ninguno incluye
  `mcp.admin`.
- En el arranque solo se invoca el listado de proyectos, construido a mano con `z.object({})`
  sobre `cliente.callTool`: pasar por `MultiServerMCPClient` obligaba a normalizar el JSON
  Schema de TODAS las tools del servidor, y varias usan variantes que Zod no acepta.
- **El nombre de esa tool no se codifica a pelo.** El servidor real la publica como
  `studio_list_projects`; `project_list` y `list_projects` son endpoints anteriores.
  `herramientaDeProyectos` prueba los nombres conocidos en orden y, si ninguno está, cae en una
  heurística que exige «list» + «project» y CERO argumentos obligatorios: abrir el proyecto
  equivocado en el arranque es peor que no encontrar la tool.
- **La respuesta no es una lista.** Medido: `studio_list_projects` devuelve un MAPA indexado
  por id bajo «recents», con el identificador en `pid`. `proyectosDeResultado` acepta lista y
  mapa en cada clave conocida, usa la clave del mapa como id de reserva, y sigue quedándose
  SOLO con `{id, nombre}`: la respuesta trae permisos, fechas y el correo del propietario, y
  nada de eso puede acabar en `config.json` ni en el transcript.
- Un fallo aquí no puede tumbar el arranque: el asistente informa y **no crea `.xonecode`** a
  medias.

**La copia local y la sincronización** (`agent/descarga.ts`, `agent/gitSync.ts`,
`agent/subida.ts`, `core/planDeSubida.ts`). El proyecto se descarga a la carpeta que el
usuario abrió, con la misma estructura del servidor, y el agente trabaja sobre ella sin
enterarse de que CloudStudio existe. El estado de «qué hay arriba» NO es un fichero
nuestro: es la ref `refs/remotes/cloudstudio/<rama>`, así que `git status` responde solo y
`git diff cloudstudio/<rama>..HEAD` ES el plan de subida. Cuatro reglas duras:
- **Lo que no se pudo bajar, no se puede borrar** (`core/planDeSubida.ts`). El plan B baja
  fichero a fichero y el servidor no sirve binarios así, de modo que git ve las imágenes y
  las fuentes tipográficas como borradas. Emitir esos borrados vaciaría el proyecto en
  Studio; el manifiesto de `sync.json` es lo que lo impide.
- **La ref se mueve solo si la subida terminó entera**, así que un fallo parcial se
  reintenta solo en el siguiente `/sync`. El reintento reenvía el plan ENTERO contra la
  misma ref sin mover, ficheros ya subidos incluidos: eso solo es seguro si escribir o
  borrar dos veces la misma ruta en CloudStudio no tiene efecto observable la segunda
  vez, algo que `agent/subida.ts` asume del servidor sin comprobarlo.
- **`.xonecode` no sube nunca**, con filtro propio además del exclude de git — y `.gitignore`
  no se toca, porque es un fichero del proyecto y acabaría en CloudStudio.
- **La rama activa del servidor se restaura** tras cada operación (`get_context` antes de
  `switch`): un switch le mueve el suelo a quien tenga Studio abierto.

De colecciones, en local solo se conservan los `.xne` y `app.xml`: los `X.xml` que Studio
genera junto a un `X.xne` se **borran del disco** justo tras extraer, no solo se le ocultan
al agente. El orden es la parte que importa —extraer → borrar vistas aplanadas → commit de
baseline (`prepararRepo`)— y al revés hace justo lo contrario: si el baseline se tomara
antes del borrado, git vería esos `.xml` como borrados y, al haberse descargado, el
candado no los frenaría; la primera subida los borraría **en Studio**. Tomándolo después,
para git nunca existieron.

Studio tiene rama origen (de la que se baja, `cloudstudio.rama`) y rama de trabajo (a la
que se sube, creada perezosamente en la primera subida para no ensuciar Studio a quien no
sube nada). **El servidor no fusiona** —`manage_branches("merge")` da una LISTA de
ficheros a fusionar, no un resultado— así que quien integra en la rama origen es el
usuario, en Studio. En local fusionaría git, que sí tiene el ancestro común (el commit de
la descarga), pero **eso todavía no está implementado**: `bajar` SOBRESCRIBE el disco y no
hay ningún `git merge` en el código. Lo único que protege el trabajo local es la guarda de
**árbol limpio, exigida en las dos direcciones** (`arbolLimpio`, en `crearSincronizador`,
antes de abrir sesión MCP): al subir porque se sube un commit y no un borrador, al bajar
porque el baseline se construye DESPUÉS de sobrescribir y sin commit no hay nada que
recuperar. `.xonecode/` no cuenta nunca —en el alta se escribe antes de que exista la
exclusión—, y una carpeta que aún no es repo solo está limpia si está vacía.

El alta completa son cuatro pasos (`cli/main.ts`), y cada uno solo aparece si falta lo que
decide: 1) cuenta —proveedor y modelo, solo si nadie eligió nunca, deducido del `origen`
con que resuelve el papel `trabajo` (`wizardInicial.ts#asistenteDeModelo`), nunca de una
marca de «primer arranque»—; 2) modo del proyecto (`offline`/`cloud`); 3) proyecto de
CloudStudio, su rama origen y la descarga; 4) modelo propio del proyecto, opcional, hereda
el global por omisión. **Sin TTY real** (`process.stdin.isTTY`) los cuatro se saltan
enteros en `main.ts` antes de intentar nada; `asistenteDeModelo` y `configurarModoInicial`
repiten además su propia guarda de `consola.interactivo`. Cancelar antes de elegir
proveedor, modo o proyecto no escribe nada; cancelar DESPUÉS de elegir proyecto dejó ya
`cloudstudio` y `modo: "cloud"` en disco a propósito —negarlo sería mentir—, así que
cancelar la rama cae a la primera disponible en vez de fingir que no pasó nada, y un fallo
de descarga deja dicho que reintentar con `/sync bajar`. Una credencial tecleada en el paso
de cuenta también queda escrita aunque el usuario cancele el paso de modelo que viene
después: el asistente lo dice en el momento, porque callarlo daría a entender que no se
tocó nada.

**La autorización de la subida es un hueco de política, no un prompt**
(`core/cloudstudio.ts#PoliticaDeAprobacion`): `subir()` no se puede invocar sin decir quién
autoriza, fail-closed por TIPO. Hoy solo está montada la interactiva, con el plan delante.
La autónoma —el juez decide que el trabajo está terminado y sube solo— está declarada pero
no implementada, y **el veredicto del juez no bastará solo**: exigirá además condiciones
que comprueba el código (verificador en verde, árbol limpio, nada pendiente de aprobar),
porque en este repo los avisos son código y no prompt precisamente porque a un modelo se le
puede pedir que avise y no avisa.

Dos trampas medidas: `core.quotePath` (por omisión `true`) cita en octal cualquier ruta con
bytes ≥ 0x80, así que un `ñu.xne` salía como `"\303\261u.xne"` y no coincidía nunca con las
rutas —en UTF-8 sin comillas— de `descargados`, rompiendo el candado en silencio para
cualquier proyecto XOne en castellano; `cambiosPendientes` fuerza `core.quotePath=false`.
Y sin `--no-renames`, un `A.xne` → `B.xne` sale como una sola línea de renombrado que solo
se queda con el destino: `B` sube y `A` se queda huérfano en Studio para siempre, sin
ningún aviso; forzando borrado + alta por separado, el borrado de `A` sí pasa por el
candado.

**Lo IMPOSIBLE sale del plan y se declara** (`core/planDeSubida.ts`, que devuelve
`{ operaciones, omitidas }`). El modo `chunked` NO está implementado —`subirBinario` del
puerto ni recibe el modo y el adaptador manda siempre `base64`—, y el borrado
(`borrarTexto`, sobre `studio_edit_file` con `editMode: "delete"`) es una tool de TEXTO,
así que un binario borrado no se puede propagar. Las dos cosas eran operaciones que
fallaban SIEMPRE, y como la ref solo avanza con `fallos` vacío, el siguiente `/sync`
recalculaba el mismo plan: la primera imagen borrada o el primer `.db` de más de 5 MB
dejaba `/sync subir` inútil de forma permanente. Ahora salen del plan como `omitidas`,
con motivo accionable, y se dicen por consola Y en `sync.log` —que sobrevive al turno—
mientras el resto sube y la ref avanza. Si no hay ningún «resto», la ref no se mueve: se
vuelven a declarar en cada `/sync`, que es la verdad.

**La aprobación humana es fail-closed** (`cli/aprobar.ts`, `vendor/hitl.ts`). Aprobar ejecuta;
rechazar no toca nada, así que lo que no se entiende es **rechazo**. El Enter a secas solo
aprueba con un TTY de verdad detrás, y un rl ya cerrado (el EOF de un pipe que se agota durante
un turno, medido en e2e) responde con cadena vacía — o sea, rechazo — en vez de lanzar
`readline was closed` y dejar el interrupt colgado. Tope de `MAX_APPROVAL_ROUNDS = 5` rondas
por turno.

**La foto del ANTES** (`agent/instantanea.ts`) es un árbol de git en un `GIT_INDEX_FILE`
privado: no necesita commits, no necesita que el proyecto sea la raíz del repo, y no toca el
índice del usuario. Se toma **por turno**, no por sesión.

**Modelos por papel** (`core/modelos.ts`): `rapido` (corre en todos los turnos), `trabajo`
(desarrolla), `afilado` (reservado al juez). Por omisión, Ollama local. Precedencia:
`--modelo-<papel>` > `--modelo` > `XONECODE_MODELO` > proyecto > global > omisión, y cada valor
recuerda su `origen` para que `config`/`describe` lo digan.

**El catálogo de modelos** (`agent/catalogoModelos.ts`, puerto `CatalogoModelosPort`):
`/modelos <proveedor>` consulta el catálogo VIVO del proveedor, filtra los de conversación y
guarda la elección en la config global. `ErrorCatalogoModelos` es un error publicable: nunca
lleva la clave ni el cuerpo remoto. Ollama local (`OLLAMA_BASE_URL`) y Ollama Cloud
(`https://ollama.com`) son dos hosts distintos y no se mezclan.

**Configuración y credenciales** (`core/config.ts`, `agent/configEnDisco.ts`): `config.json`
lleva modelos, `modo`, `cloudstudio`, `contextos` (topes de ventana fijados a mano,
«proveedor/modelo» → tokens) y **rechaza claves de API**; las credenciales van solo en
`~/.xonecode/auth.json`, modo 0600, y se escriben con `/provider <nombre>`. El ESCRITOR de
`auth.json` es `agent/authEnDisco.ts` (el lector, `configEnDisco.ts`), y su contrato es que una
escritura nunca destruye lo que había: la base de la fusión es el objeto CRUDO —no el resultado
de `validarAuth`, que descarta entradas raras en silencio— y ante un JSON roto **para sin
escribir** en vez de recuperar el fichero por su cuenta.

**La creación de proyecto al arrancar** (`core/esqueleto.ts`, `agent/crearProyecto.ts`,
`cli/main.ts`). Si al abrir la consola falta `app.xml`, se ofrece crearlo (omisión **No**:
crear ficheros es opt-in, como las aprobaciones) y cuatro preguntas deciden el esqueleto.
QUÉ se escribe son datos puros en `core/` —todo del «Hola Mundo» de la documentación XOne,
nada inventado: XOne ignora en silencio lo inventado—, y `agent/crearProyecto.ts` solo lo
ejecuta: **nunca pisa un fichero existente**, lo salta y lo declara en el informe.

**La barra de estado y el contexto** (`core/contextos.ts`, `vendor/tokenTracking.ts`). La
barra se compone en `formatearBarra` (pura, porque solo se pinta con TTY y los tests no
pueden ser TTY) y lleva `ctx`: el input de la ÚLTIMA llamada (`tracker.contexto`, no la
suma acumulada) contra el tope de `core/contextos.ts`. La tabla es por familias conocidas;
**ollama no tiene tope a propósito** (cada modelo local trae el suyo), y el porcentaje solo
se calcula si hay tope — un porcentaje sobre un número inventado es una mentira con forma
de cifra. El tope se re-resuelve en cada barra porque `/modelo` cambia el modelo en
caliente, siempre por `topeResuelto` (`core/contextos.ts`) — la misma función que `/config`
usa para enseñar los topes **y su origen** (proyecto > global > tabla), así que la barra no
puede calcular sobre un tope que `/config` no declare.

**La consola y la shell no divergen** porque comparten función: `/config` llama a `cmdConfig`,
no a una copia. `COMANDOS` en `cli/consola.ts` es el registro único — `/ayuda`, la cabecera y el
autocompletado se generan recorriéndolo, así que añadir un comando ahí basta. El Tab completa
comandos desde `COMANDOS` y, tras una «@», ficheros del proyecto (leídos del árbol en el momento
del Tab, nunca de una lista congelada al arrancar). Las flechas y ctrl-p/ctrl-n del historial
los trae readline en stdio; la TUI solo implementa las flechas (`upArrow`/`downArrow` en
`cli/tui/entrada.tsx`, con el mismo completer) y descarta ctrl-p/ctrl-n — no es la misma
tecla en las dos pieles. No hay código propio de historial fuera de la piel.

## Códigos de salida (contrato, CI los lee)

| | |
|---|---|
| 0 | bien |
| 1 | el proyecto tiene errores, o no es un proyecto XOne |
| 2 | había escrituras esperando aprobación y **nada se aplicó** |
| 64 | error de uso (bandera o modelo mal escritos) |
| 70 | fallo del **entorno**, no del proyecto |

Un fallo del entorno no se reporta como un proyecto roto: `agent/verificador.ts` lanza
`ErrorDelSimulador` en vez de devolver un informe en rojo.

## Trampas verificadas

- **`SkillsPort.cargar()` sigue sin tener un solo llamador — pero las skills SÍ llegan al
  modelo.** Quien las carga es `SkillsMiddleware` de deepagents, no el puerto: `xoneAgent.ts`
  monta `/skills/` en el backend (`backendConSkills`, un `CompositeBackend` sobre un
  `FilesystemBackend` propio con raíz `RAIZ_SKILLS`) y le pasa a cada subagente
  `skills: rutasDeSkills(perfil.nombre, skills)`, que son rutas virtuales, no contenido. El puerto solo
  aporta `catalogo()`: nombrar las suyas en el prompt y AVISAR de las que falten. Dos detalles
  medidos: la barra final de `"/skills/"` es obligatoria (`CompositeBackend` la retira antes de
  delegar; sin ella reconstruye `//archify/...`, fuera de la raíz) y `permisosDe` deniega
  `write` sobre `/skills/**` — son instrucciones, no ficheros editables.

- **ink@5.2.1 no remide un `<Text>` cuando se INSERTA texto delante de un hijo existente.**
  `dom.js`: `insertBeforeNode` sale sin marcar sucio el `ink-text` padre (append y remove sí lo
  hacen). En la Entrada el cursor va anidado dentro del Text, así que al pasar la línea de vacía
  a un valor que envuelve en un solo render (↑ del historial, pegar) Ink se queda con la medida
  de UNA fila y la fila del modelo pisa la segunda. Hoy la Entrada la esquiva de raíz: parte
  el texto en filas ella misma (`cli/tui/filas.ts`) y cada fila es su propio Text, así que
  ningún Text envuelve (antes el remedio era `key={valor}` en el Text que envolvía).
  `app.test.tsx` lo sigue vigilando con un prompt de dos filas. Si algún día vuelve a haber
  un Text que envuelva con hijos anidados, la trampa vuelve. Volvió una vez, medida en terminal:
  el pie insertaba las cifras de contexto delante de `/ayuda` en el mismo Text y se quedaba
  con 6 columnas («2K» y nada más). Regla práctica: hijos que aparecen y desaparecen, como
  `Text` HERMANOS dentro de un `Box` (insertar en un Box sí remide), nunca anidados en un Text.

- **El `resize` de Ink no re-renderiza React.** `ink.js`, `resized`: recalcula Yoga y repinta
  el árbol YA montado. Lo que dependa de `stdout.columns` leído en el render (la sidebar, que
  solo se monta con más de 120 columnas) se queda como estaba hasta el siguiente acto. `App`
  (`cli/tui/app.tsx`) se suscribe al `resize` y fuerza un re-render; `app.test.tsx` lo prueba
  en los dos sentidos.

(Antes había una segunda trampa: `docs/COMO-PROBARLO.md` decía que la consola no hablaba con el
agente real. El doc ya está corregido — `cli/main.ts` monta `crearEjecutorReal` por omisión y
`--guion` es el modo de pega. Ante una discrepancia entre doc y código, el código manda.)
