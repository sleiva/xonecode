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
  la denegación de `/.env` y `/.git`.
- El HITL va en las tools de fichero (`write_file`, `edit_file`), que son las que escriben.

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

**Configuración y credenciales** (`core/config.ts`, `agent/configEnDisco.ts`): `config.json`
lleva modelos, `contextos` (topes de ventana fijados a mano, «proveedor/modelo» → tokens) y
**rechaza claves de API**; las credenciales van solo en `~/.xonecode/auth.json`, modo 0600,
y se escriben con `/provider <nombre>`.

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

- **`SkillsPort.cargar()` no tiene ningún llamador en la ruta del agente.** `promptDe` solo usa
  `catalogo()` para NOMBRAR las skills en el prompt del especialista («Cárgalas antes de
  responder») y avisar de las que falten; el contenido de `skills/*/SKILL.md` nunca se inyecta, y
  el backend está confinado a la raíz del proyecto, así que el modelo tampoco puede leerlo.

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
