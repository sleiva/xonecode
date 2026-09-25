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
[`docs/DECISIONES.md`](docs/DECISIONES.md), no aquí.

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

### El agente, y lo único que puede escribir

`agent/grafo/xoneAgent.ts`: un orquestador que delega en los especialistas de `core/agentes.ts`.
Cinco cosas no son negociables:

- **El orquestador va de SOLO LECTURA por PERMISOS, no por falta de tools**
  (`PERFIL_DEL_ORQUESTADOR`); `xoneAgent.orquestador.test.ts` lo exige.
- **`FilesystemBackend` con `virtualMode: true`.** Backend con shell, exactamente UNO, declarado
  en su `.md` (`ejecucion`): `virtualMode` confina las tools de FICHERO, no los comandos, y
  deepagents LANZA si le pasas `permissions` junto a un backend ejecutable.
- **Los permisos se construyen con `permisosDe(perfil)`, NUNCA a mano**: `SubAgent.permissions`
  reemplaza los del padre en vez de fusionarlos, así que un perfil que los escriba a mano pierde
  la denegación de `/.env`, `/.git` y `/.xonecode`.
- **`SubAgent.tools` lleva SOLO tools propias**, nunca los nombres de las de fichero: las monta
  `createFilesystemMiddleware`; quien las acota es `permissions`.
- **El HITL va en `write_file` y `edit_file`**, que son las que escriben.

Y las guardas del proyecto:

- **Las vistas aplanadas** (`X.xml` con un `X.xne` al lado) se retiran del backend con un Proxy
  (`agent/grafo/proyecto.ts`): la regla es propiedad del proyecto, no de un prompt.
- **Un rechazo de guarda se DEVUELVE como `{error}`, nunca se lanza**: una excepción se lleva el
  turno por delante y el agente no reintenta. Vale para `sinVistasAplanadas`,
  `sinArtefactosEnElProyecto` y `sinDescargasEnElProyecto`. `proyecto.test.ts` lo ata contra la
  librería real.
- **Dos escrituras sobre el MISMO fichero no se solapan** (`core/serieDeEscrituras.ts` puro,
  `agent/grafo/escriturasEnSerie.ts`). `write`/`edit` son leer-modificar-escribir sobre el
  fichero entero: dos a la vez se pisan y las dos contestan que bien, sin avisar. **Serializar
  BASTA**: el envoltorio va por FUERA de quien edita — al llegarle el turno se relee el fichero y
  se rebusca el ancla; si no encaja, el backend contesta que no lo encuentra y el modelo
  reintenta. **Va UNA vez, por fuera de TODO lo montado** (`backendDeAgente#enSerie`): vivía
  dentro de la pila del proyecto y `/artefactos/`/`/planes/` no la heredaban. Va por FUERA de
  `sinContenidoInvalido` para que leer, validar y escribir sean un solo turno. Solo `write` y
  `edit`. Probado por `backendDeAgente` y contra el backend REAL, para comprobar que está
  CABLEADA.
- **`/artefactos/` → `.xonecode/sesiones/<id>/artefactos/`**: escribible y **sin aprobación**, se
  ANUNCIA con el evento `artefacto` (nombre, tamaño, ruta virtual — nunca contenido).
  `esRutaDeArtefacto` es una lista BLANCA de forma, no un `startsWith`. No se crea al montar. Tope
  propio de rondas.
- **La carpeta de artefactos SE CREA antes de correr un comando**
  (`proyecto.ts#anunciarArtefactosDeLaShell`), única excepción a «no se crea al montar»: la crea
  `FilesystemBackend.write` al primer `write` por TOOL, y una shell no pasa por ahí. Va en el
  harness y no en el script (solo con `ejecucion`, así que los otros cuatro especialistas siguen
  sin carpeta vacía). **Y los scripts que el prompt NOMBRA se comprueban contra el catálogo real**,
  en las dos direcciones y con el bit de ejecución.
- **Un artefacto no puede acabar dentro del proyecto, y eso es código**: `artefactoFueraDeSitio`
  (`core/artefactos.ts`) deniega `artifacts`/`artifact` como primer segmento y `/artifact.html` en
  `write`/`edit`. El `when` de `seDetieneEn` (`agent/grafo/perfiles.ts`) usa la MISMA función;
  `perfiles.test.ts` exige que no preguntar implique que la guarda rechaza.
- **Lo que deepagents desaloja del contexto tampoco es del proyecto**: `/large_tool_results/` y
  `/conversation_history/` los escribe la librería llamando al backend directo —sin HITL ni
  `permissions`—, montados al lado de los artefactos (`backendConDescargas`); la guarda del
  backend del proyecto falla CERRADO si el montaje falta.
- **Lo que una SHELL saca del contexto tiene su propia carpeta, `/hotswap/`** (`core/hotswap.ts`,
  `backendConHotswap`, variable `XONECODE_HOTSWAP`): misma razón que las descargas, cambia solo
  quién descarga (el script `xone-hotswap`, que guarda en vez de imprimir). El reparto lo decide
  un LECTOR: una captura la coge `capturasDelTurno` para el crítico de pantalla; un árbol de
  controles no tiene lector, así que la imagen se queda en `/artefactos/` y el texto se muda. La
  carpeta es HERMANA de la de artefactos, no subcarpeta suya (la foto de
  `anunciarArtefactosDeLaShell` es recursiva). El script NOMBRA la ruta virtual en su salida.
- **`/skills/` con barra final obligatoria** (`CompositeBackend` la retira antes de delegar) y
  `permisosDe` deniega `write` ahí: son instrucciones, no ficheros editables.
- **Bajo esa MISMA ruta cuelgan las skills del USUARIO, una a una**
  (`agent/grafo/proyecto.ts#backendConSkills`, `agent/grafo/skills.ts`). Tres raíces —la del
  paquete, `~/.xonecode/skills/` y la del proyecto, con la del proyecto ganando—, vistas por el
  agente como una sola: un subagente declara `skills: [mi-skill]` y se traduce a
  `/skills/mi-skill/`. Se apoya en que `CompositeBackend` ordena sus rutas por LONGITUD
  descendente (atado contra la librería real, `proyecto.test.ts`). **Límite declarado**: `ls
  /skills` enseña solo las de serie (resuelve a UNA ruta), da igual porque `SkillsMiddleware`
  recibe las rutas ya resueltas una a una. **`SkillsEnDisco` no cachea**; `skillsMontables` se lee
  en cada construcción del agente (`construir()` en `agent/turno/turnoReal.ts`, con DOS
  llamadores: al abrir la sesión y en `/modelo`) — una skill guardada desde Ajustes no alcanza a
  la sesión abierta hasta reconstruirla. Agujero HEREDADO sin test posible.
- **Una skill de serie no se edita ni se borra: se COPIA** (`web/servidor/arranque.ts
  #atenderSkill`, `core/skills.ts`). Vive dentro del paquete instalado (una edición se la
  llevaría el siguiente `npm install`), así que aquí NO hay `.semilla.json` ni `restaurar`, a
  diferencia de los subagentes. La barrera vive en el SERVIDOR. El nombre es un SLUG
  (`motivoDeNombreInaceptable`), validado al GUARDAR; un destino que existe es un NO. Renombrar es
  `renameSync` y LUEGO escribir. El `cuerpo` de una de serie no viaja en la ráfaga de bienvenida:
  se pide a mano (`cuerpoDeSkill`).
- **Y se INSTALAN desde un `.zip`** (`core/zipDeSkill.ts`,
  `agent/grafo/skills.ts#instalarSkillDesdeZip`, `POST /skill`): una skill es una CARPETA, no un
  `SKILL.md` suelto. Los BYTES van por HTTP y no por el cable (el molde de `POST /adjunto`). La
  REGLA de qué se acepta es PURA, en `core/`: **lista BLANCA de forma** para cada ruta del zip
  (segmentos llanos separados por `/`; el «zip slip» no se para con `includes("..")` — también hay
  `\`, absolutas, unidad `C:`, byte nulo), **tres topes contra un zip BOMBA** (lo DESCOMPRIMIDO,
  cuántas entradas, tamaño de la mayor), y un `SKILL.md` obligatorio. Se descomprime entero y se
  decide ANTES de escribir nada; una entrada mala se lleva el zip ENTERO. El nombre se DEDUCE y
  pasa por la regla del slug.
- **A un motor EXTERNO las skills llegan por SU palanca, nunca por `/skills/`**: esa ruta es
  virtual de nuestro backend y un hijo lee el disco de verdad, confinado al proyecto
  (`veredictoDeLectura`). Claude Code por `plugins` (`agent/subagentes/pluginDeSkills.ts`, un
  plugin local con enlaces a las tres raíces — `additionalDirectories` NO vale), OpenCode por
  `skills.paths` de la configuración que ya reescribimos en cada arranque. Ninguna de las dos
  escribe dentro del PROYECTO. **Codex se queda fuera**: sus skills vienen de su propio sistema de
  plugins.
- **La tool `Skill` está en la lista de LECTURA de los motores externos**: no pasamos la opción
  `skills` del SDK (omitirla no es skills off). Entra como lectura porque mete instrucciones en el
  contexto, y lo que MANDE hacer vuelve a pasar por el mismo hook. **Dos límites declarados**: un
  `Bash` que pida una skill se sigue denegando, y un `Read` a otro fichero de su carpeta también
  (cae fuera del proyecto). El nombre le llega PREFIJADO (`xonecode:<nombre>`), como Claude Code
  nombra un plugin; `promptDeAgente` lo nombra a secas.
- **Las skills de un subagente se MARCAN de una lista, no se teclean**
  (`componentes/Agentes.tsx#SkillsDelAgente`): `repartirSkills` mete un nombre mal escrito en
  `faltan` en vez de dar error silencioso. Una skill declarada que ya no está en el catálogo se
  sigue pintando, marcada y señalada; sin catálogo NO se pinta una lista vacía (se cae al campo de
  texto).
- **`/adjuntos/` es de solo lectura y su fila en `permisosDe` es INCONDICIONAL**: sin ella, un
  `write_file` con la carpeta sin montar escribe un fichero DEL PROYECTO con el nombre de algo
  «adjuntado».
- **Las tools propias son DOS, y contestan preguntas distintas.** La búsqueda regex
  (`agent/grafo/busquedaRegex.ts`, acotada por `LIMITES_REGEX`) busca TEXTO; `xone_navegacion`
  (`agent/grafo/navegacionXone.ts`) contesta sobre el MODELO ya resuelto: qué colecciones hay,
  dónde se declara una o un campo, quién la referencia (`mapcol`, `mapfld`, `linkedfield`,
  `contents`, `inherits`), qué campos tiene. Las dos **re-aplican `puedeLeerRuta` a mano**: una
  tool de LangChain añadida por xonecode **no pasa por el middleware de permisos**.
- **`xone_navegacion` existe por una medida, no por completitud**: contestar «¿qué colecciones
  tiene el proyecto?» leyendo ficheros es mucho más caro que contestarla desde el modelo. Cuatro
  reglas: **el reparto** — la semántica de XOne la pone `xone-linter` como LIBRERÍA
  (`CrossReferenceRule` ya define `mapcol`); **el import es PROFUNDO**
  (`xone-linter/dist/project/XoneProject.js`, el barril arrastra un *top-level await* que revienta
  bajo `tsx`); **la raíz se fija al construir y NO entra por parámetro de la tool** (o sería una
  tool que lee cualquier carpeta de la máquina); y **no cachea** (un índice viejo que afirma que
  un campo existe es peor que no tener índice). Las rutas se traducen a VIRTUALES y se filtran EN
  LA FUENTE (`agent/navegacion/modeloDeProyecto.ts`): lo que el agente no puede abrir no entra en
  el índice.
- **Siete operaciones**: `app` (por dónde arranca, login, estilos), `detalle` (campos, eventos,
  nodos, conexiones), `problemas` (referencias a una colección que no existe), y **referencias de
  SCRIPT** — una app XOne navega con `onclick="javascript:appData.getCollection('X')…"` y no con
  `mapcol`, así que sin ellas «¿quién usa Deportes?» contestaba «nadie» con botones apuntándole. Es
  un PATRÓN con literal, no «el nombre aparece en el texto». **Límites declarados**: no ve un
  `getCollection(variable)` ni dice en qué LÍNEA está, y la descripción de la tool lo dice.
- **Hay una SEGUNDA señal, más floja, MARCADA aparte** (`por: "mencion"` frente a `por:
  "script"`): la cadena real puede tener varios saltos (`method="ExecuteNode(abrirColl('X'))"` → un
  nodo con `<param>` → `irColl(coll)` → `getCollection(collname)`), y el nombre solo aparece como
  literal en el primero. Perseguir la cadena ataría esto a los ayudantes de UN proyecto; lo que se
  reconoce es un literal que COINCIDE con una colección del inventario. Se marcan distinto porque
  la confianza es distinta. El atributo `method` se mira, y una colección que se nombra a SÍ MISMA
  no cuenta.
- **Cuando NO sabe contestar, devuelve la llamada a `regex_search` HECHA** — no un consejo. Pasa en
  los cinco callejones sin resultado. El caso que lo justifica: «nadie la referencia» es una
  afirmación fuerte que este índice no puede sostener (no ve un nombre calculado en JavaScript), así
  que el vacío va con «NO concluyas que no se usa» y el siguiente paso ya escrito. El nombre de la
  otra tool sale de una constante (`NOMBRE_BUSQUEDA_REGEX`) y la llamada se valida contra su
  ESQUEMA REAL en el test. Cuando sí encuentra, no manda a ningún sitio.
- **Lo que NO hay, y se midió antes de descartarlo: «colecciones huérfanas»**. Se implementó y se
  tiró: sobre un proyecto real la proporción de falsos positivos era tan alta que la lista no es
  un hallazgo, y con las referencias de script dentro seguía siendo la mitad del proyecto.
- **Va a los cinco especialistas Y al orquestador**, decidido por una MEDIDA que tumbó lo
  contrario (`xoneAgent.navegacion.test.ts`): negada al orquestador con el argumento de que
  delega, medido sobre un proyecto real **no delegó** — la contestó él con `ls`/`glob`/`grep`/
  `read_file` porque la tool no estaba disponible. No le abre nada nuevo; cambia el precio de
  orientarse. A un subagente de motor EXTERNO no puede llegar: corre en otro proceso.
- `.xonecode/memoria.md` se ve por UNA ruta virtual, `/MEMORIA_PROYECTO.md` (Proxy en
  `agent/grafo/memoriaDeProyecto.ts`); la carpeta sigue denegada entera y escribir la memoria pasa
  por la aprobación de siempre. El resumen de contexto usa umbrales **fijados a mano** (32k para
  disparar, 8k de reciente): deepagents asume 170k y con Ollama comprime demasiado tarde.

### Los subagentes

Un subagente es un `.md` con frontmatter en `.xonecode/agentes/<nombre>.md`
(`core/agentes.ts`, `agent/subagentes/agentesEnDisco.ts`). Los cinco de serie —`consultant-xone`,
`analyst-xone`, `developer-xone`, `designer-xone`, `device-controller`— se siembran al arrancar. El
sufijo `-xone` viaja como `subagent_type` a los motores externos, donde el hijo tiene sus propios
agentes. `device-controller` se sale de esa convención a propósito y no viaja a un motor externo
(ahí la ejecución no se concede). Reglas duras:

- **La EJECUCIÓN de comandos se DECLARA en el `.md` y la lleva uno solo** (`ejecucion`, cierto
  solo con exactamente `"true"` — trampa del `"false"` de CloudStudio, que aquí concedería la
  máquina). Una shell no pasa por `permisosDe` ni por `virtualMode`; deepagents LANZA al combinar
  `permissions` con un backend ejecutable, así que quien la tiene NO recibe `permissions`
  (`perfiles.ts#montajeDeFicheros`, cableado mirado desde fuera en `xoneAgent.ejecucion.test.ts`).
  Se le quitan `write_file`/`edit_file`. **Y quien ejecuta NO es `soloLectura`**: ese campo
  también ELIGE EL MODELO (`rapido` vs `trabajo`), así que marcarlo miente dos veces. **Solo con
  `motor: "modelo"`**: en los tres externos la shell está cerrada. Se compensa VIÉNDOLO: el
  comando entero sale como `detalle` del evento (lista blanca de `resumenDeTool.ts`); precio
  declarado: una ruta absoluta que el modelo escriba en su comando viaja por el cable.
- **La shell NO hereda las claves de API** (`core/shellDeAgente.ts`, puro): se quitan por la TABLA
  (`VARIABLES_POR_PROVEEDOR`) más el prefijo de los personalizados, no por una lista a mano. Se
  AÑADE una variable por skill montada (`XONECODE_SKILL_<SLUG>`) y otra para los artefactos.
  **Límite declarado**: quita las NUESTRAS; un `GITHUB_TOKEN` del usuario sigue ahí.
- **Lo que un COMANDO deja en la carpeta de artefactos también se anuncia**
  (`proyecto.ts#anunciarArtefactosDeLaShell`): se compara una FOTO de la carpeta antes/después, no
  lo que el comando diga, y esa foto es RECURSIVA (un `unzip` deja un árbol). No se anuncia lo que
  `esRutaDeArtefacto` rechazaría, ni la basura que un zip arrastra
  (`core/artefactos.ts#esBasuraDeArtefacto`, distinta de `BASURA_DEL_SO`).
- **Un Proxy sobre un backend lee contra el OBJETIVO, no contra el proxy**: `LocalShellBackend.id`
  es un getter sobre un campo PRIVADO, y `Reflect.get` lanza al leerlo desde el constructor de
  `CompositeBackend` — el fallo es al MONTAR, no al usar.
- **`REGLAS_XONE` se antepone SIEMPRE desde código**, igual que el aviso de skills que faltan y la
  línea de que las escrituras se aprueban: no editable desde un `.md`.
- **El nombre sale del FICHERO**, no del frontmatter, y es un SLUG (`motivoDeNombreInaceptable`).
  Se valida al GUARDAR y solo se DICE al cargar, con el nombre que sí valdría (`nombreSugerido`).
  Sin `descripcion` no se carga. **`soloLectura` solo es cierto con exactamente `"true"`** — misma
  trampa del `"false"` de CloudStudio, que aquí concedería ESCRITURA.
- **La marca de la siembra es `.semilla.json` con el hash de lo que escribimos**, no «la carpeta
  existe»: un agente nuevo o corregido alcanza a quien ya arrancó sin resucitar lo que el usuario
  borró ni pisar lo que tocó. Un renombrado tiene caso propio (`RENOMBRADOS`): la clave vieja de la
  marca se RETIRA con su fichero si sigue intacta, y si el usuario la afinó se queda y se dice.
- **De QUIÉN es un `.md` viaja por el cable, y no es su carpeta** (`AgenteCargado.semilla`): tres
  estados —ausente, `intacta`, `modificada`—, porque `origen` (la carpeta) no basta: un subagente
  propio también vive en la global. La regla es «de serie Y del GLOBAL».
- **Un de serie no se BORRA: se RESTAURA** (`restaurarAgente`, `accion: "restaurar"`). Borrarlo no
  devolvía el de serie (la marca recuerda que se entregó). `restaurarAgente` no escribe la marca:
  la reanota la siembra siguiente. «Este de serie está editado» ya no va por `problemas` (que
  pintaba rojo un agente que funciona perfectamente): lo dice su tarjeta, con el botón que lo
  arregla al lado.
- **RENOMBRAR es solo para los tuyos** (`renombrarAgente`): el nombre de un de serie lo ata a la
  marca por NOMBRE, así que moverlo lo vuelve un subagente del usuario. `renameSync` y LUEGO
  escribir; un destino que existe es un NO (de serie o del usuario); la negativa se EXPLICA en el
  CLIENTE porque `informar` no llega al navegador desde el vestíbulo.
- **El prompt del orquestador se GENERA** de la lista (`xoneAgent.ts#promptOrquestador`). Lo que
  NO se genera es la regla del encadenado de diagramas, que nombra a dos especialistas a pelo: al
  renombrarlos hay que cambiarlos ahí. `HANDOFF DE ANÁLISIS` es un TOKEN de protocolo, no una
  referencia a un agente (literal en cuatro sitios).
- Un `.md` roto se salta y su motivo viaja por el cable hasta Ajustes.
- **La línea de una delegación dice a QUIÉN** (`task` → `subagent_type`, lista blanca de
  `resumenDeTool.ts` + icono/verbo en `core/notify.ts`), **nunca la `description`** (el encargo
  entero).
- **Lo que un agente externo CUENTA entre dos tools también cruza**, como `razonamiento`
  (`escrituraExterna.ts#opcionesDeSubagenteExterno`, `alRazonar`): solo bloques de TEXTO, nunca
  `tool_use`. **Límite declarado**: lo alimentan `claude-code` y `codex`; OpenCode todavía no. Lo
  que HACE Codex también cruza (`actividadDeCodex.ts`), por su propia clasificación de comandos
  (`commandActions`) y NUNCA del comando de shell (lleva la ruta de la máquina).
- **El pulso DICE en qué paso está y cuánto lleva en él** (`Chat.tsx`, `cronometro.ts` con
  `clave`): se mide desde que la LÍNEA apareció, no desde el total del turno.
- **Lo que hace un agente EXTERNO se ve MIENTRAS lo hace** (`core/entrelazar.ts`): evento `tool`
  NORMAL con nombre canónico (`Read` → `read_file`) y ruta VIRTUAL, intercalado por un generador
  MIENTRAS ocurre, y **solo cuenta lo que va a ocurrir** (una tool denegada no se anuncia).
  Trampa: `it.next()` se pide UNA vez y se guarda.
- **Un hijo de Claude Code NO puede enumerar la carpeta, así que se le DICE**
  (`escrituraExterna.ts#inventarioDelProyecto`): sus rutas virtuales van en las instrucciones.
- **`ToolSearch` es de LECTURA** y **listar la RAÍZ se permite** (`rutaVirtualDeEscritura` la
  descarta porque no es un fichero que escribir).
- **Motores externos**: `claude-code` (`agent/subagentes/subagenteExterno.ts`) **escribe, y cada
  escritura pasa por una autorización** — `canUseTool` asíncrono, corre en nuestro proceso, sin
  `interrupt()` ni reejecutar el nodo. `decisionDeTool`, en orden: **TRES listas** de tools
  (lectura/escritura/denegadas, desconocido denegado), el papel del `.md`, las **guardas de RUTA
  reaplicadas**, la política. Escribir son **solo `Write` y `Edit`** (las únicas que encajan en
  `cambioDe()`); `Bash`, `WebFetch`, `WebSearch` se deniegan.
- **Las guardas de ruta hay que REAPLICARLAS** (`agent/subagentes/escrituraExterna.ts`): el
  `file_path` del hijo es ABSOLUTO y va al disco directo, sin pasar por `permisosDe`,
  `virtualMode`, vistas aplanadas ni guardas de artefactos/descargas. Las MISMAS funciones, **dos
  veces** —texto y `realpath`—. Lo que no se puede comprobar se deniega.
- **La política es el `pedirAprobacion` que YA existía**, traducido
  (`escrituraExterna.ts#politicaDeAprobacionExterna`, `PoliticaDeEscrituraExterna` en
  `core/ports.ts`, fail-closed por TIPO): la INTERACTIVA de las tres pieles y la AUTÓNOMA de una
  tarea de fondo. Sin `pedirAprobacion` no hay política y no se escribe.
- **La denegación de verdad vive en un hook `PreToolUse`, no en `canUseTool`**: contesta las TRES
  clases —`allow`/`deny`/`ask`—. `permissionMode` es `default` (el único donde el `ask` del hook
  llega al callback). `canUseTool` conserva las MISMAS comprobaciones como segunda llave.
- **`settingSources: ["user"]`**: por omisión se carga el `.claude/settings.json` del proyecto
  (viene de CloudStudio); el coste es que el hijo no carga el `CLAUDE.md` del proyecto.
- **LEER también lleva guarda de ruta**: `.env`, `.git`, `.xonecode` (con `checkpoint.sqlite`) y lo
  de FUERA del proyecto se deniegan; `/skills/`, `/adjuntos/` y un artefacto mal puesto SÍ se leen.
  `Glob`/`Grep` llevan `path` OPCIONAL (ausente es la raíz). **Límite declarado**: un `Grep` sobre
  la raíz puede devolver líneas de un fichero denegado.
- Un `.md` con `soloLectura: false` se acepta en los TRES motores; se comprueba `disponible()`
  antes de montarlo.
- **En Codex la palanca de la escritura es el `approvalPolicy`, no el `sandbox`**
  (`agent/subagentes/subagenteCodex.ts`, `escrituraDeCodex.ts`). Sandbox `read-only` SIEMPRE;
  `permitirEscritura` abre `approvalPolicy: never → on-request`.
- **Lo que se pregunta y lo que se decide llegan en mensajes distintos**:
  `item/fileChange/requestApproval` trae solo `itemId`, cambios vistos antes en `item/started` (de
  ahí el registro de items). Un `itemId` sin item es `decline`.
- **Un item puede traer VARIOS ficheros y se contesta con UNA decisión**:
  `PoliticaDeEscrituraExterna` toma una LISTA, concede solo si TODAS vienen aprobadas.
- **Las guardas de ruta son las MISMAS** (`veredictoDeRuta` sobre el `path` absoluto). `delete` y
  `move_path` se DENIEGAN (`cambioDe` no compone su diff).
- **Los otros huecos**: `item/commandExecution/requestApproval` se deniega SIEMPRE, una
  elicitación de MCP se declina por `action`, y lo que no se sabe decir que no se ABORTA. Nunca
  `acceptForSession` ni `grantRoot`.
- **El tope del motor externo (`TOPE_MS`, 10 min) se PARA mientras una aprobación está delante de
  alguien**: mide «no contesta», no el tiempo de revisión humana.
- El resto del protocolo: `codex app-server --stdio` con JSON por línea; respuesta final en
  `item/completed` con `agentMessage` de fase `final_answer`. El hijo es el Codex DEL USUARIO, con
  sus MCP y hooks: xonecode no los filtra.
- **OpenCode es el TERCER motor, y habla por ACP** (`agent/subagentes/subagenteOpencode.ts`,
  `escrituraDeOpencode.ts`). ACP: JSON-RPC 2.0 por línea sobre stdio.
- **Su petición trae TODO en un solo mensaje**: `session/request_permission` lleva
  `toolCall.locations[].path` y `content:[{type:"diff", path, oldText, newText}]`, que entran
  directos en `core/diff.ts#diffDeLineas`. Se contesta `once` o `reject`; `always` NUNCA se manda.
- **El bucle de guardas y política es UNO y lo comparten los dos motores de petición**
  (`escrituraExterna.ts#veredictoDeEscriturasExternas`/`#decisionDeEscrituraExterna`).
- **TRES puertas por las que el proyecto podía mandar sobre opencode** —`opencode.json` del
  proyecto, un plugin del proyecto, la config global del usuario— se cierran con
  `OPENCODE_CONFIG_DIR` apuntando a una carpeta NUESTRA (`~/.xonecode/opencode`) más
  `OPENCODE_DISABLE_PROJECT_CONFIG=1`. Configuración REESCRITA en cada arranque.
- **En OpenCode la LECTURA se guarda por PATRÓN, no por código**: su permiso `kind: "read"` llega
  sin ruta. Las vistas aplanadas se enumeran UNA A UNA en esa lista.
- **`bash` no se deniega: se le QUITA la tool**. Con `webfetch`, `websearch`,
  `external_directory`, `task`, `question` denegados. **`fs/write_text_file` NO es la escritura**:
  es un aviso; el único portón es el permiso.
- **Una tool que acaba en `failed` no se anuncia.** **Una respuesta vacía tras un rechazo** se dice
  con voz del harness, nunca `""`. ACP tiene `session/cancel` antes de matar al hijo.
- **Límite declarado, y es el que queda abierto: LEER no tiene costura en Codex.** Lee por la
  shell del sandbox, que en `read-only` no pide permiso a nadie.
- **En una tarea de FONDO no se le pregunta a nadie**, misma `PoliticaDeEscrituraExterna`,
  montada por la AUTÓNOMA de `consolaDeTarea.aprobacionesTui` — por eso NO se hizo con
  `workspace-write`, para que las guardas de ruta sigan enteras.

### El segundo motor: TrueForge (rama `xonecode-trueforge`)

`core/motor.ts`, `agent/motores/trueforge/`, `docs/VARIANTE-TRUEFORGE-HARNESS.md`. **Se elige por
configuración y no se ve** (`"motor"` en `config.json`, `XONECODE_MOTOR`; omisión `trueforge`; una
sesión sin motor guardado se reabre con `deepagents`), y **la elección vive en UN punto,
`abrirSesionReal`**, por el que pasan la web, el terminal, `run`, el banco y los evals. Cumple el
mismo `SesionReal`, así que ninguna piel sabe cuál corre. Tres reglas: **el modelo es NUESTRO** (un
`ILLM` sobre el de LangChain, nunca su `VercelAILLM`, que perdería el `user_id`, el eco y el
esfuerzo); **las tools delegan en `backendDeAgente`** y reevalúan `permisosDe`; y **`core/` no
importa `@truefoundry/` ni `winston`** (`imports.test.ts`). **Fuera de `core/` solo lo importa UN
fichero**, `agent/motores/trueforge/trueforge.ts` (`frontera.test.ts`). **El reparto es el de
deepagents**: raíz de solo lectura y sin skills, cada especialista sale de su `.md`, y **la
aprobación de un hijo se devuelve a SU `thread_id`**. **Los de motor EXTERNO también son hijos, por
el MISMO `SubagenteExternoPort`** (`modeloExterno.ts`): un `AgentThread` de UNA llamada cuyo
«modelo» es `correr()`, sin tools ni capabilities; su llamada no cuenta como de nuestro modelo, y
un motor que falla se DEVUELVE como texto. **Parar mata al hijo** (`PeticionExterna.senal`) y
**dos hijos que escriben no corren a la vez** (`escritoresEnSerie`). **Las tools propias no se
reescriben: se ADAPTAN** (`toolsPropias.ts`), mismo reparto — `xone_navegacion` a todos. **El
verificador y su reparación también**, y el juez del turno y el crítico de pantalla con los mismos
puertos, con las reglas SACADAS del cierre de deepagents a `agent/turno/verificacion.ts`. **La
memoria en disco es la FOTO del raíz** (`memoriaTrueforge.ts`, `AgentThread.toSnapshot()`, 0600) y
**no** la capa `agent-session` de la librería. **La foto lleva VERSIÓN y se lee ESTRICTA**
(`MIGRACIONES`, `interpretarFoto`): la que no se entiende no se carga a medias — se abre sin
memoria y se APARTA con otro nombre. **El prompt de un hijo va en su prompt de SISTEMA por
`instructionBuilders`**. **El raíz puede PREGUNTAR** (`ask_user_question`, solo él): con opciones
sale además como tarjeta con un botón por opción (`Piel.consulta?` opcional), y lo pendiente lo
decide el hilo. **Solo se compacta el raíz**: en un hijo, resumir un encargo corto y ya cacheado
costaba más que reenviarlo.

### La aprobación

- **Fail-closed: lo que no se entiende es RECHAZO** (`cli/aprobar.ts`, `vendor/hitl.ts`). El Enter
  a secas aprueba solo con un TTY de verdad detrás; sin él la cadena vacía rechaza. Tope de
  `MAX_APPROVAL_ROUNDS = 5` rondas por turno.
- **El modal de la TUI es fail-closed POR TECLA** (`cli/tui/aprobarTui.tsx`): solo `s`/`S`
  aprueba; `n`, Enter, Escape, Ctrl-C y desmontar sin responder son rechazo.
- **La FORMA de una pregunta viaja CON ella, y no se adivina del enunciado**
  (`DecisionDeConsola`, `cli/aprobar.ts`): `Consola.preguntar` lleva un segundo parámetro OPCIONAL
  con las LÍNEAS de lo que se decide, y con él la piel pinta el plan y dos botones en vez de un
  campo de texto. Es opcional a propósito, así que stdio/TUI/consola de tarea/dobles no cambian.
  El enunciado viaja SIN la pista de tecleo (`PISTA_DE_DECISION` la añade la piel con teclado).
  **Cada línea del plan dice qué le PASA, también como dato** (`LineaDelPlan.cambio`: `nuevo`,
  `modificado`, `borrado`), nunca deducido del `+`/`~`/`-` de texto. En el navegador la tarjeta NO
  es un `<form>` y contesta `"s"`/`"n"`. La AUSENCIA se conserva de punta a punta (`decision ===
  undefined`). Esa tarjeta es un DIÁLOGO, no un renglón del hilo (`Pregunta.tsx`, misma puerta que
  `Aprobacion`): solo «Aceptar» autoriza, `Escape` y clic en el velo RECHAZAN, y desmontar no
  contesta nada. Lo sin contestar lo salda el plazo del servidor (`MS_DE_ESPERA_POR_OMISION`, 10
  min) con cadena vacía.
- **La única grieta es el MODO DE ESCRITURA, y vive en la SESIÓN** (`core/modoDeEscritura.ts`,
  comando `/aprobacion`): `supervisado` —cada escritura con su diff— o `autonomo` —se aplican
  solas—. Ausente es supervisado; hace falta alguien delante, calculado como `interactivo &&
  !eof()` igual que `pedirDecisiones`; se pregunta en cada RONDA y no al abrir; se DICE dos veces
  (aviso por turno, y `alta.modoDeEscritura`); el mismo predicado alcanza a los motores externos.
  **Gobierna las escrituras LOCALES y nada más**: `/sync subir` conserva su plan y aprobación
  fail-closed en los dos modos. El tope de rondas de la consola es el MISMO 20 que el de una tarea
  (`TOPE_DE_RONDAS_DE_CONSOLA`); sin nadie delante se queda el cinco de `MAX_APPROVAL_ROUNDS`. Lo
  que `/aprobacion` EXPLICA lo decide el destino, no la línea (`Consola.modoALaVista`): donde el
  modo está siempre a la vista (la web) sale una línea; donde no (el terminal) salen los tres
  detalles.
- El origen del interrupt se dice UNA vez: `aPendiente` (`agent/turno/interrupts.ts`) quita el
  prefijo `[perfil]` de la descripción porque el dato ya viaja en `origen`.

### El verificador, en el turno

`agent/turno/turnoReal.ts#conVerificacion`. Cinco reglas:

- **Cosido al FINAL del flujo, no después del turno** (`correrTurno` cierra en su `finally`).
- **Solo la ronda FINAL**, la que termina sin escrituras pendientes.
- **Solo si el turno tocó ficheros del PROYECTO** — `.xonecode/` no cuenta. El aviso «no ha
  corrido» solo sale si escribió y aun así no se verificó, con el motivo.
- **Los hallazgos se REPARTEN** entre los ficheros del turno (fichero RELATIVO y línea, nunca
  contenido) y `preexistentes`. Uno sin fichero va con los del turno. Un hallazgo no atribuye
  autoría: el simulador mira el proyecto entero.
- **Que falte el binario es fallo del ENTORNO** y se dice en un `aviso`, sin tumbar el turno. El
  verificador entra por parámetro (`verifier?: VerifierPort`), así que `npm test` sigue sin él.

**Un rojo se REPARA** (`TOPE_REPARACIONES`, dos intentos): los hallazgos vuelven como mensaje de
USUARIO en el mismo hilo. La huella son los **ERRORES** (código|fichero|línea) comparada con la
del veredicto anterior. **Un turno cierra UNA vez**: lo decide el generador al agotar el flujo, y
las condiciones con que predice otra ronda son **las mismas** del `break` del bucle. `reparacion`
se emite al EMPEZAR la pasada.

`agent/turno/instantanea.ts`: la foto del ANTES es un árbol de git en un `GIT_INDEX_FILE` privado
—sin commits, sin tocar el índice del usuario— y se toma **por turno**, no por sesión.

### Las tareas en background

`core/tareas.ts`, `agent/tareas/tareasEnDisco.ts`, `web/servidor/corredorDeTareas.ts`,
`consolaDeTarea.ts`, `core/entrega.ts`, `agent/tareas/juezDeTarea.ts`. Un encargo por proyecto que
corre solo y escribe sin pedir aprobación. Cuatro estados; `requiere-atencion` significa
**esperando feedback del desarrollador** y no es terminal.

- **La autorización es el ACTO DE CREAR LA TAREA**, no un interruptor, y **no se reutiliza el modo
  de escritura de una sesión**.
- **Las guardas de RUTA siguen enteras**: `/artifacts/`, vistas aplanadas, `/.env`, `/.git`,
  `/.xonecode`.
- **El sitio del diff lo ocupan el verificador y el JUEZ, y el juez no basta solo**: las
  condiciones las comprueba el CÓDIGO (`core/entrega.ts#condicionesDeEntrega`) — verificador en
  VERDE (no correr **no es** verde), nada pendiente de aprobar, `revisable`, y autorizó escrituras
  y git no ve ningún cambio. `escribio` solo se afirma **con marca** de git.
- **`Tarea.autorizadas` guarda lo AUTORIZADO, no lo escrito.** La verdad de lo que cambió está en
  la ref de git de la sesión.
- **Un solo corredor por máquina, y el cerrojo no lo garantiza solo**: lo hace verdad
  `sigoSiendoDueño()`, preguntado antes de despachar cada tarea. La cuarentena del cerrojo lleva el
  **pid** en el nombre.
- **Gana la persona**: una tarea no arranca en un proyecto cuya consola humana está ABIERTA.
- **La tarea abre por su PROPIA puerta** (`vestibulo.ts#abrirParaTarea`), que comparte **un solo
  cuerpo de función** con la puerta humana, y tiene que REENVIAR `tarea.sesion` y el id de la
  tarea.
- **Su consola APARCA en vez de contestar por nadie** (`consolaDeTarea.ts`): `preguntar` y
  `leerSecreto` no devuelven `""`, aparcan y CORTAN.
- **El feedback vuelve como mensaje de USUARIO en el mismo hilo**: es una LISTA, se marca
  CONSUMIDO, un feedback vacío se rechaza.
- **La sesión se persiste, y su `sesion` sobrevive si y solo si hay algo abrible.** Borrar una
  sesión que una tarea usa DECLINA con motivo; abrir una de una tarea EN CURSO también, comparando
  `sesion` **y** `idDeHilo`, y **antes** de cerrar la abierta.
- **`mirar` no es `conectar`** (`transporte.ts`): un mirón no es alguien a quien preguntar.
- **`arrancarConectado` es UNA función con el orden dentro** (puente al cable y LUEGO corredor).
- **Los adjuntos** viven en `~/.xonecode/tareas/<id>/adjuntos/`, fuera del proyecto, subidos por
  `POST /adjunto`. Se DICE que están al mandar el turno (`core/adjuntos.ts#conAdjuntos`); no hay
  poda de huérfanos.
- **El encargo se AUMENTA y se enseña EDITABLE antes de encolar** (`AumentadorPort`, papel
  `trabajo`): ocupa el sitio del diff; su fallo encola el texto original y se DICE.

### La consola web

`src/web/` (servidor) y `apps/web/` (cliente): la TERCERA piel de LA MISMA consola
(`cli/consola.ts`), y la de omisión.

- **`decidirPiel`** (`cli/main.ts`): `--cli` gana siempre, `--web` la fuerza sin terminal, y **sin
  stdin TTY la omisión NO es la web**. `decidirTui` igual: `--no-tui` gana, `--tui` fuerza (sin
  TTY es error de USO, 64), por omisión TUI solo con stdin Y stdout TTY.
- **La consola web DICE con qué código corre** (`core/version.ts`, `agent/config/versionEnDisco.ts`,
  opción `version`), antes que la URL. El cliente se lee del DISCO en cada petición
  (`servidor.ts`, `readFileSync`); el SERVIDOR es el proceso y solo cambia parándolo y
  arrancándolo. El árbol SUCIO se dice.
- **`arrancarConsolaWeb`** (`web/servidor/arranque.ts`) comprueba en orden: existe
  `apps/web/dist/index.html` (si no, salida **70**), avisa si el cwd es offline y sigue, y levanta.
  `abrirEnSistema` escucha el `error` del `spawn`.
- **El servidor es `node:http` en loopback y nada más** (`servidor.ts`): token en la query que se
  vuelve cookie `HttpOnly`, comprobación de `Host`/`Origin` en TODA petición, y `.xonecode`
  denegado por el TEXTO de la ruta antes de tocar disco. Un cuerpo ilegible responde 400 sin
  devolver nada de lo recibido.
- **El vestíbulo** (`vestibulo.ts`) es lo que hay ANTES de que exista ninguna raíz. Varias consolas
  vivas a la vez, con clave por RAÍZ y un foco. `proyectoAbierto()` es la del FOCO,
  `proyectosAbiertos()` la lista. Mudarse SUELTA los sumideros (`Transporte.soltar`), no los
  desconecta. La aprobación en vuelo se REEMITE al volver (`mensajesDeAprobacion()`).
- **El cable habla con TODOS los clientes** (`transporte.ts` es un `Set`): la ráfaga de bienvenida
  va SOLO al recién llegado.
- **El turno en vuelo lo DICE el servidor** (`clase: "turno"`); el aviso de fin va en un `finally`.
  Parar es `clase: "cancelar"` → `SesionReal.cancelar()`, que aborta el stream y **deja la sesión
  viva**.
- **El cliente no manda comandos**: por el cable viaja la intención (`clase` `modelo`, `sesion`,
  `credencial`, `entorno`, `dispositivo`, `tarea`…) y el servidor decide cómo se aplica.
- **En el navegador «/» es PROSA, no un comando** (`cli/consola.ts#LineaDeConsola`): la línea lo
  DICE (`comoComando`); una `string` a secas se lee como siempre — comando.
- **Ajustes tiene UNA pestaña por entorno registrado, y abrir una NO cambia el entorno activo**
  (`Ajustes.tsx`, `atenderProyectosDeEntorno`). La lista de cada entorno se pide al abrir su
  pestaña, sin caché. Lo marcado se guarda **por entorno** (`elegidosPorEntorno`).
- **Un entorno se registra SOLO si conecta, y se puede QUITAR** (`arranque.ts#atenderAlta`).
  Quitar lo decide el SERVIDOR y contesta **409 con el motivo**. Las copias bajadas se QUEDAN salvo
  con la casilla «borrar también las copias», DESMARCADA siempre al abrir; el botón rojo no se
  activa hasta escribir el nombre del entorno.
- **Una copia «bajada» es `config.json` Y `sync.json`** (`vestibulo.ts#esProyectoEnDisco`): el
  alta escribe `config.json` ANTES de bajar. Un fallo de descarga se APUNTA en `fallos.jsonl`.
- **La clave de API viaja por el ÚNICO mensaje del cable que la lleva** (`leerSecreto`), y se
  PRUEBA antes de escribirse (`motivoDeClaveInaceptable`, `core/config.ts`): solo si el proveedor
  contesta se escribe en `auth.json`. Trampa: `guardarCredencial` escribe TAMBIÉN en `process.env`,
  a propósito.
- **Los dólares del asistente se ESCAPAN antes de pintarlos** (`apps/web/src/protegerDolares.ts`):
  fuera de código solo; el botón de copiar y las Trazas llevan el original.
- **Un ARTEFACTO pertenece al tramo de trabajo, pero no se pliega con él** (`Chat.tsx`, `ES_PULSO`):
  fuera del conjunto CIERRA el tramo abierto. Dentro del tramo el colapsador no se parte; las
  tarjetas salen FUERA del `<details>` y agrupadas, y **no cuentan como pasos**. Una IMAGEN se
  enseña como MINIATURA (un `<img>` a la ruta HTTP, nunca marcado inyectado).
- **El HUECO entre actos dice si sigue el mismo turno o empieza otro**, declarado con la VARIABLE
  de la hoja copiada (`Chat.module.css`, `.flujo`/`.inicioDeTurno`,
  `margin-top: var(--dsh-chat-flow-gap, 16px)` llevado por el HIJO). Dos valores y no tres: dentro
  de un turno, y al empezar otro.
- **Los actos de `sistema` se ven en el chat**, y **se reparten por CLASE, que viaja con el acto y
  no se deduce del texto**: `aviso` (bitácora, juez, crítico de pantalla) bajo «Verificaciones» y
  `permiso` bajo «Permisos», cada clase en SU tramo. Ausente sigue suelto y a la vista. Lo que se
  pliega es el párrafo, nunca el hecho de que lo hay. `pausa` emite un acto POR pendiente.
  `razonamiento` es su propio evento y acto (`textoDe` lo EXCLUYE del texto). El texto del
  asistente se enseña mientras llega, a `MS_ENTRE_PARCIALES` (80 ms).
- **El RESUMEN de contexto es un acto de sistema de clase `resumen`, no una respuesta**
  (`resumenDeContexto.ts#ETIQUETA_DEL_RESUMEN`, `puente.ts`, `pielWeb.ts#resumen`): puesta por dos
  envoltorios que ABRAZAN al middleware de resumen dentro de `resumenConEncargo`. El cliente lo
  pliega como «Resumen del contexto», el ÚNICO plegable que se pinta como markdown. **Límite
  declarado**: solo se etiqueta `invoke`.
- **Abrir una sesión NO espera al aviso de git** (`MS_DE_TRABAJO_AL_ABRIR`, 2 s): la ESPERA se
  acota, no el trabajo; la promesa sigue viva y su valor sale en el siguiente anuncio.
- **Una sesión reabierta lo DICE, y lo dice el servidor** (`alta.historica`, preguntando al
  checkpointer), reanunciado en los DOS flancos del turno y diferido a una microtarea.
- **De quién es una sesión se GUARDA, no se deduce** (`EntradaIndice.tarea`): siembra monotónica al
  arrancar el corredor (`marcarTareaDeSesion`) que solo AÑADE. Por el cable viaja un BOOLEANO.
- **La sesión entra en el índice con el MENSAJE**, no cuando el asistente contesta.
- **`localStorage` es de ESTE navegador**: todo acceso envuelto en `try`.
- **Ningún color literal fuera de `estilos/marca.css` y `splash.css`** (`Barra.test.tsx` lo
  vigila recorriendo TODOS los `.module.css`), `transparent` incluido. El cian es ACENTO y no
  sostiene texto.
- **El botón de enviar lleva el AZUL de la marca** (`--xonecode-azul`/`--xonecode-sobre-azul`); el
  cian se queda para su hover. PARAR se queda ROJO —es un estado, no la marca—.
- **La caja del compositor va en TRES BANDAS** (maqueta de Stitch, `code.html`): arriba modelo +
  esfuerzo + dispositivo, en medio el campo, abajo modo de escritura + gasto + botón. En REPOSO la
  banda de arriba NO ESTÁ y el campo es bajo; se pliega **desmontando** y lo decide
  `:focus-within` en CSS, no un `onBlur` en React (con estado de React, tabular desde el campo
  desmontaría la pastilla antes de que el foco llegara). Un borrador a medias la mantiene abierta
  (`data-con-texto`). **Trampa**: un `color-mix` que arrastre un alias del TEMA no puede vivir en
  el `:root` de `marca.css` (se lleva el atajo `border` entero). El hueco de la banda de abajo se
  lo come un `margin-left: auto` en el bloque que agrupa gasto y botón (los márgenes automáticos
  se REPARTEN el hueco libre); el gasto se retira antes que el botón cuando no cabe.
- **El MODO se elige con un CONMUTADOR de dos mitades, no con un menú** (`SelectorDeModo.tsx`):
  cada mitad DICE lo que hace en su `title`, `aria-pressed` va en las DOS, y pulsar la que ya está
  puesta no manda nada.
- **Los iconos salen del `code.html` de la maqueta, copiados** (`IconosDelCompositor.tsx`): nada de
  un CDN. Pintan con `currentColor` y van `aria-hidden`.
- **El compositor DICE sus teclas** (`Enter` envía, `Shift+Enter` salta de línea), comprobadas en
  el mismo test que las escribe, en la SEGUNDA LÍNEA del placeholder (se ocultan al escribir por
  construcción de la caja, no por acordarse).
- **Nada se trae de un CDN** (tipografías empaquetadas, iconos copiados): modo offline de primera
  clase.
- **Una consulta de contenedor declara su contenedor en la MISMA hoja** (`Barra.test.tsx`): sin un
  ancestro con `container-type` no dispara jamás y no avisa. Y **no puede estilar a su PROPIO
  contenedor** (solo alcanza DESCENDIENTES): el arreglo es un envoltorio que declare el
  contenedor, con la caja de antes como hija.
- **El encuadre de las TRES columnas lo decide `core`… del cliente, no una hoja**
  (`apps/web/src/repartoDeColumnas.ts`, puro y con test): barra, conversación y panel compiten por
  el mismo ancho, y quien queda fuera se DESMONTA. Una sola concesión automática: si no caben las
  tres pero sí chat + panel, la barra se pliega SOLA, sin tocar la preferencia del navegador.
  Pedir la barra de vuelta cierra el panel.
- **Un control sin dato detrás no se pinta.** Ausente ≠ vacío en las cuatro capas (disco, cable,
  store, componente).
- **Lo que se pliega se DESMONTA**, nunca `visibility` ni `display: none` para lo enfocable.
- **Los artefactos se sirven con DOS capas de sandbox** (`GET /artefacto?n=<nombre>`): iframe
  `sandbox="allow-scripts"` sin `allow-same-origin` (origen opaco) + cabecera
  `Content-Security-Policy: sandbox allow-scripts`, más `nosniff` y `no-store`. La barrera es
  `esRutaDeArtefacto` aplicada al texto de la query **y** al `realpath`. `localStorage`,
  `sessionStorage`, `indexedDB` lanzan dentro del iframe (`SKILLS_VISUALES` lo dice desde el
  prompt).
- **Un artefacto `.openui` se sirve DENTRO de su visor, y el visor no tiene red**
  (`web/servidor/visorOpenui.ts`, `apps/web/src/openui/`): iframe de origen opaco, CSP cierra la
  red entera. El visor es una entrada de build APARTE, la aplicación no importa `@openuidev`
  (`openui/frontera.test.ts`). Solo dependencia de `apps/web`. **En el agente lo trae su SKILL,
  `openui-builder`**, solo en TrueForge (`capacidadDeOpenui`). A un motor externo no le llega la
  tool.
- **Ficheros y Revisión**: el lector filtra con las MISMAS reglas que el agente
  (`puedeLeerRuta`, `esVistaAplanada`), aplicadas DOS veces (texto y `realpath`). El árbol NO
  recorre detrás de un enlace (`lstatSync`). La imagen se decide por EXTENSIÓN, viaja como
  `mime`+`base64`, se pinta en un `<img>`, nunca marcado inyectado.
- **Revisión arranca PLEGADA**: cada diff se pide al pulsar su cabecera. El efecto de `App.tsx`
  solo OLVIDA lo desplegado cuando el store tira la foto.
- **La sincronización con CloudStudio es la BANDA de arriba de Revisión, no una pestaña**, como
  ranura (`cloudstudio`) pintada en los SEIS estados de Revisión. `estado` se MIDE en el servidor
  contra la ref de la bajada (`agent/sesiones/gitSync.ts#cambiosPendientes`), sin abrir sesión MCP;
  `subir`/`bajar` se ENCOLAN como `/sync <accion>` con el MISMO plan, guarda de árbol sucio y
  aprobación que el terminal. `proyecto`/`rama` ausentes no son «cero pendientes». La cifra dice DE
  QUIÉN son los ficheros (`deLaSesion` = `cambiosPendientes` ∩ `cambiosDeSesion`); ausente cuando
  no se pudo atribuir, y cero es un dato medido. Con la subida al día «Subir» NO se pinta, y solo
  con la subida MEDIDA. La otra dirección se llama «Actualizar repo local» (clase sigue siendo
  `.bajar`). **El recorrido de la operación se cuenta en la BANDA, no en el hilo** (acto
  `sincronizacion`: `accion`, `cuando`, `lineas`), por un método OPCIONAL del puerto
  (`anotarSincronizacion?`); quien no lo implemente sigue recibiendo el recorrido por `escribir` al
  vuelo. Lo que el registro guarda es EXACTAMENTE lo que el terminal habría impreso. El enunciado
  de una decisión ya puesta deja de anotarse (viaja en el mensaje `pregunta`). Tampoco entra una
  subida CANCELADA.

### El workspace: dónde viven las copias locales

`core/settings.ts` (`rutaDeWorkspace`, `dentroDelWorkspace`), `web/servidor/vestibulo.ts`
(`baseDeWorkspacePorOmision`), `core/mudanzaDeWorkspace.ts`, `agent/config/mudanzaEnDisco.ts`.

- **`<workspace>/<entorno>/<proyecto>`, y el workspace es lo ÚNICO configurable**
  (`settings.workspace`, omisión `~/.xonecode/workspace`). El segmento del ENTORNO se queda: el
  mismo nombre de proyecto existe a la vez en dos servidores.
- **La base se LEE en cada uso, nunca se captura al arrancar** (`baseDeWorkspace` es una función):
  se cambia desde Ajustes con la consola en marcha.
- **El reparto viejo se MUDA de una vez al arrancar la web**
  (`arranque.ts#mudarWorkspaceLegadoCableado`, antes del vestíbulo y del corredor de tareas).
  Proyecto a proyecto; un destino que existe NUNCA se pisa; solo lo movido de verdad reescribe una
  ruta guardada (`proyecto.raiz` del índice de tareas).
- **Cambiar el workspace NO mueve lo que ya está bajado**, y la pantalla lo dice.
- **La ruta del workspace es la excepción NOMBRADA a `sinRutas`, y la única del cable**: viaja
  ENTERA (no abreviada con `~`). El `~` se acepta al TECLEAR (`expandirConCasa`). La regla de qué
  vale (`motivoDeWorkspaceInaceptable`) se aplica en el SERVIDOR.
- **El selector de carpeta lo abre el SISTEMA, no el navegador** (`core/selectorDeCarpeta.ts`,
  `agent/config/selectorEnMaquina.ts`): `osascript`/`zenity`, solo cruza la carpeta elegida.
  Elegir y guardar son dos actos. **Límite declarado**: por un túnel el botón no sirve.

### Los conectores MCP

`core/conectores.ts` (puro), `agent/conectores/` (disco y red), sección Conectores de Ajustes. Un
conector es un servidor MCP REMOTO: el catálogo es una tabla cerrada que crece por código, y uno
escrito a mano lo da de alta una persona desde la misma ventana.

- **Todavía no llegan a ningún agente.** Esta pieza es la conexión y la configuración.
- **El catálogo es una TABLA** (`CATALOGO_DE_CONECTORES`): id, nombre, URL, descripción, y con qué
  se autentica (`ninguna`/`oauth`/`api-key`). El icono se ata al `id`, no al nombre; lo que no lo
  tenga cae en un MONOGRAMA.
- **Un servidor escrito a mano es la MISMA familia, con una sola forma de fila**: `resolver(id)`
  es catálogo ∪ definiciones. El id se DERIVA del nombre (`idDeConectorDesdeNombre`) y nunca lo
  elige el cliente. La regla de qué vale es `motivoDeDefinicionInaceptable`. `custom:jira` convive
  con la fila `jira`.
- **El cliente no resuelve el nombre: lo lee del `catalogo` que viaja**, recortado a
  `FilaDeCatalogo`. La `url` no vuelve nunca al cliente.
- **La clave de un `api-key` va al fichero de SECRETOS, no a `auth.json`** (`SecretosDeConector`,
  0600, `escribirAtomico`). El `Authorization: Bearer` lo compone el CÓDIGO; la criba
  (`motivoDeClaveInaceptable`) rechaza valores con espacios.
- **El formulario no tiene campo para la clave**: «Clave de API» es un TIPO de autenticación y la
  clave se pide DESPUÉS por `leerSecreto`. `estadoDeConector` usa `hayCredencial`, no `hayTokens`.
- **El encadenado es del SERVIDOR**: `crear` escribe la definición y, si su auth no es `ninguna`,
  encadena la autorización en el mismo acto.
- **`quitar` de un `custom:` se lleva su definición y su clave.** Una definición que no se entiende
  NO se borra: se conserva al escribir y se filtra al leer (`authEnDisco.ts`).
- **Dos ficheros, y SOLO en la casa del usuario** (`agent/conectores/conectoresEnDisco.ts`):
  `conectores.json` y `conectores-oauth.json` (0600). Nunca en el proyecto. Se lee de un tirón
  (`leerConectores`).
- **Un id está VIVO si lo conoce el catálogo o si tiene definición.**
- **La ruta del callback es PÚBLICA, y su autenticación es el `state`, no la cookie de sesión**
  (`TTL_DE_AUTORIZACION_MS`, 10 min, de un solo uso). No el puerto dedicado de CloudStudio (7634).
- **Ni tokens ni URL de autorización cruzan el cable.**
- **El cliente OAuth es PÚBLICO y va atado a su `redirect_uri`** (`token_endpoint_auth_method:
  "none"`).
- **La prueba es una FOTO, no un estado en vivo** (`TOPE_DE_CONEXION_MS`, 30 s).
- **Límites declarados**: no llegan a ningún agente todavía; sin túnel (`redirect_uri` es
  `127.0.0.1`); de OAuth solo hay registro dinámico; la clave va como `Authorization: Bearer`, sin
  otra cabecera soportada.

### Exportar a PDF

`core/exportacion.ts` (puro), `agent/exportarPdf.ts`, comando `/pdf <ruta>`.

- **Lo hace el HARNESS, no el agente.** A un motor externo no se le concede shell, y conceder la
  shell tampoco habría dado el PDF (las skills `pdf`/`docx` asumen un sandbox con dependencias que
  aquí no están). El comando lo escribe el CÓDIGO.
- **Se imprime con un NAVEGADOR**, en una lista CERRADA de rutas conocidas (Chromium con
  `--print-to-pdf`). No haberlo se DICE con el remedio.
- **Que el navegador salga con 0 no significa que haya PDF**: se comprueba el fichero.
- **Lo que impide que imprimir EJECUTE algo es una CSP en el documento, no un flag**: ni
  `--disable-javascript` ni `--blink-settings=scriptEnabled=false` desactivan un `<script>` (y el
  segundo rompe la impresión). La CSP corta también la RED.
- **El destino lo DERIVA el código del origen** (`rutaDePdf`), nunca se recibe. Las guardas de ruta
  son las MISMAS de Ficheros. El HTML intermedio se escribe FUERA del proyecto.
- **La autorización es teclear el comando**: no lo pide el modelo.

### Sesiones, hilos y git

- **El hilo SOBREVIVE al proceso** (`agent/sesiones/checkpointer.ts`, `SqliteSaver` en
  `.xonecode/checkpoint.sqlite`): uno por PROYECTO particionado por `thread_id`, y **el
  `thread_id` ES el id de la sesión**. Se crea con el modo puesto ANTES de abrirlo. La consola de
  TERMINAL no lo usa.
- **Una aprobación sin contestar se vuelve a preguntar, pero no sola**: `abrirSesionReal` SALDA las
  llamadas colgadas (`saldarAprobacionesHuerfanas`) con una respuesta sintética.
- **Esto CRECE y no hay poda.** `.xonecode` se saca del índice privado de `instantanea.ts` y
  `sesionGit.ts` (`sacarXonecodeDelIndice`). `/nuevo` en la web abre un hilo huérfano y lo DICE.
- **Cada turno COMMITEA lo que dejó** (`agent/sesiones/gitSync.ts#commitDeTurno`): índice DE
  VERDAD, sin cambios no se commitea, identidad NUESTRA por `-c`, en el `finally` envuelto entero,
  y solo `dentroDelWorkspace`.
- **La basura del SO va a `info/exclude`, NUNCA a `.gitignore`** (`asegurarExclusiones`).
- **La atribución sale de los COMMITS, no de la foto** (`agent/sesiones/sesionGit.ts`): un TRAILER
  con el id de sesión (`CLAVE_DE_SELLO`), **VERIFICADO** entero (no basta el `--grep`). Sin
  commits sellados el respaldo se declara `via: "desde-apertura"`. Los cuatro valores de `via`
  (`git`, `desde-apertura`, `sin-empezar`, `sin-marca`) son cuatro situaciones distintas.
- **Se lista árbol contra árbol**, nunca `git diff <arbol> -- .`, con `--no-renames` y
  `--relative`. `.xonecode/` se excluye **en el DIFF y nunca en el `git add`**.
- La ref de sesión es `refs/xonecode/sesion/<id>` y no un tag.
- **Al borrar la sesión ABIERTA se cierra ANTES de borrar.** Un título vacío se rechaza
  (`renombrarSesion`).

### CloudStudio y la sincronización

`agent/cloudstudio/cloudstudioMcp.ts`, `descarga.ts`, `gitSync.ts`, `subida.ts`,
`core/planDeSubida.ts`.

- **Las tools remotas NO se inyectan en el agente.** Solo `cli/` (y el vestíbulo) llaman a
  `conectarCloudStudio`, `descarga.ts` y `subida.ts`.
- El puerto de callback (**7634**) es fijo porque el IDS registra el `redirect_uri`; el estado
  OAuth va a `~/.xonecode/cloudstudio-oauth.json`, nunca al repo.
- **Abre por NOMBRE y rechaza el id**: `clienteCloudStudio(invocar, nombreDeProyecto)`.
- **La sesión caída llega de DOS formas**: un error de tool (`isError`) y una respuesta CORRECTA
  cuyo texto empieza por «Error: No project is open…». `conSesion` mira el RESULTADO además de la
  excepción, reabre y reintenta con pausa creciente (`PAUSAS_DE_REAPERTURA_MS`).
  `ProviderCloudStudio.invalidateCredentials` tiene que existir.
- **El nombre de la tool de proyectos no se codifica a pelo** (`herramientaDeProyectos`), y la
  respuesta es un mapa bajo «recents» con el id en `pid`. `proyectosDeResultado` se queda con
  `{id, nombre, compartido?}` y NADA MÁS (la respuesta trae el correo del propietario).
- **El estado de «qué hay arriba» no es un fichero nuestro**: es la ref
  `refs/remotes/cloudstudio/<rama>`.
- **Lo que no se pudo bajar, no se puede borrar** (`core/planDeSubida.ts`): el manifiesto de
  `sync.json`.
- **Se sube a la MISMA rama de la que se bajó** (`config.rama`).
- **La rama activa solo se sabe por `studio_get_context`, y esa tool se CAE en el servidor para
  algunos proyectos**: leerla es una CORTESÍA, no una condición de corrección — el
  `cambiarRama(ramaOrigen)` explícito sostiene de qué rama se baja/sube. `ramaActiva.ts` devuelve
  `undefined` en vez de lanzar; `CloudStudioPort.contexto()` sigue LANZANDO.
- **El `switch` de rama CIERRA el proyecto en el servidor** (`action: "closeandopenproject"`), así
  que `cambiarRama` REABRE después del `switch`.
- **La ref se mueve solo si la subida terminó entera.**
- **`.xonecode` no sube nunca.**
- **Orden al descargar: extraer → borrar vistas aplanadas → commit de baseline.**
- **Guarda de árbol limpio al SUBIR** (`arbolLimpio`). **Bajar dentro del workspace VACÍA la copia
  y rehace el git** (`gitSync.ts#vaciarCopia`, `ConfirmacionDeBajada`): se pregunta antes con lo
  que se pierde delante; se vacía SOLO con el zip en la mano; `git init` es DESPUÉS de bajar y en
  la propia carpeta (`prepararRepo(…, { propio: true })`).
- **La autorización de la subida es un hueco de política, fail-closed por TIPO**
  (`core/cloudstudio.ts#PoliticaDeAprobacion`).
- **Lo IMPOSIBLE sale del plan y se declara** (`{operaciones, omitidas}`): `chunked` no está
  implementado y el borrado es una tool de TEXTO.
- Dos trampas: `core.quotePath` (omisión `true`) cita en octal rutas con bytes ≥ 0x80
  (`cambiosPendientes` fuerza `false`), y sin `--no-renames` un renombrado deja el origen huérfano
  en Studio.

### Modelos, configuración y credenciales

- **Modelos por papel** (`core/modelos.ts`): `rapido`, `trabajo`, `afilado` (reservado al juez).
  Por omisión, Ollama local. Precedencia: `--modelo-<papel>` > `--modelo` > `XONECODE_MODELO` >
  proyecto > global > omisión, cada valor recuerda su `origen`.
- **`config.json` RECHAZA claves de API**; las credenciales van solo en `~/.xonecode/auth.json`
  (0600). El ESCRITOR (`agent/config/authEnDisco.ts`): una escritura nunca destruye lo que había,
  y ante un JSON roto PARA sin escribir.
- **La variable de entorno de cada proveedor vive en UN sitio**
  (`core/modelos.ts#VARIABLES_POR_PROVEEDOR`).
- **Los compatibles con OpenAI son una TABLA** (`COMPATIBLES_OPENAI`: NVIDIA, Groq, xAI). La clave
  se **EXIGE al construir** (`construirCompatibleOpenAi`).
- **Los PERSONALIZADOS son la misma tabla con la fila del usuario**: plantilla `` `custom:${string}` ``.
  Se guardan **solo en el `config.json` global**; el del proyecto se rechaza con aviso GRAVE.
- **La regla de qué URL vale es UNA** (`core/modelos.ts#motivoDeEndpointInaceptable`): HTTPS sin
  credenciales, más `http://` en una lista CERRADA de hosts loopback.
- **El catálogo VIVO es la validación de la conexión** (`agent/config/catalogoModelos.ts`).
  `ErrorCatalogoModelos` nunca lleva la clave ni el cuerpo remoto, sí el código HTTP.
- **La lista de proveedores de la pastilla es la de lo COMPROBADO**: con clave (que la clave ESTÉ)
  o sin clave (que su catálogo CONTESTÓ, probado al CONECTAR). `SIN_CREDENCIAL` tiene TRES estados
  (verde/hueco/nada).
- **Los tokens de una SESIÓN se cuentan y se enseñan, en DOS cuentas que no se suman**
  (`core/ports.ts#ConsumoDeSesionPorCuenta`, `agent/subagentes/consumoExterno.ts`, mensaje
  `consumo`, `componentes/ContadorDeTokens.tsx`). Reglas:
  - **Los dos son ACUMULADOS: se lee el último, no se suman** (entre ejecuciones sí se suma).
  - **Se suman TOKENS, nunca COSTE** (un token es un token, su precio no).
  - **La caché va aparte de la entrada** (`vendor/tokenTracking.ts`).
  - **De Codex se lee `total` y no `last`**; `reasoningOutputTokens` no se suma a la salida.
  - **Se cuenta también cuando el turno acaba en ERROR.**
  - **Ausente es «no consta» y entonces no se pinta**; se tira al caerse el cable. Un turno de
    fondo no mueve el contador de otra sesión.
  - **Con ellos viaja la VENTANA, que es otra pregunta**: `contexto` es la entrada de la ÚLTIMA
    llamada. El TOPE se resuelve con la MISMA función que la barra del terminal
    (`cli/main.ts#crearTopeDelModelo`, vía la opción `topeDeContexto`). Sin tope no se pinta
    denominador ni porcentaje. Se consulta en la BARRA (`componentes/BarraDeEstado.tsx`).
  - **Los totales de una conversación SOBREVIVEN a cerrarla**: el `fin` lleva el DELTA del turno
    (`core/actos.ts#ConsumoDeTurno`, `#sumarConsumo`, `#consumoDeLosActos`).
  - **La base histórica se lee UNA vez, al abrir, y no se vuelve a mirar** (el `.jsonl` crece por
    debajo).
  - **Un `contexto` de cero sale SIN `ventana`** (`core/ports.ts#consumoPersistible`).
  - **La cifra de un turno se pinta donde el turno se resume** (`componentes/CierreDelTurno.tsx`):
    un `{0,0}` no se pinta (`hayCosteQueEnsenar`).
  - **El total de una sesión vive en el ÍNDICE, y la barra ya NO lo pinta**
    (`EntradaIndice.consumo`, `core/actos.ts#acumularTotales`,
    `sesiones.ts#anotarConsumoDeActo`/`#sembrarConsumosPendientes`). La ventana NO entra en un
    acumulado. Un cero no se estampa; cuando la entrada aún no trae acumulado NO se suma el delta
    (se relee el `.jsonl` entero con `reabrirSesion`). La siembra
    (`sembrarConsumosPendientes`) es de PRESENTACIÓN y MONOTÓNICA: rellena solo lo que no trae
    acumulado, no da de alta lo que falte, y su fallo se TRAGA.
  Falta la vista AGREGADA por proyecto/histórico: el COSTE no se puede sumar entre cuentas.
- **El modelo en vigor lo dice el SERVIDOR** (`resolver(estadoDeSesion.fuentes).trabajo`),
  `Consola.alEstado`. **El modelo por DEFECTO es otra pregunta y otro campo** (`porDefecto` en el
  mensaje `modelos`): `actual` es el de la sesión ABIERTA, `porDefecto` el de las NUEVAS.
- **Claude se construye con tope de salida y razonamiento a mano, y las dos son datos de `core/`**
  (`topeDeSalida` en `core/contextos.ts`, `pideThinkingAdaptativo` en `core/modelos.ts`), con
  costura contra `invocationParams()` (`agent/modelos.test.ts`, sin red). El `max_tokens` por
  omisión de `@langchain/anthropic` sale de una tabla por PREFIJO; un id desconocido cae en
  `FALLBACK_MAX_OUTPUT_TOKENS` (4096) sin decirlo. **Omitir `thinking` no significa lo mismo en
  todos**: Opus 5/Sonnet 5 corren adaptativo, 4.6-4.8 corre sin pensar, Haiku 4.5 y anteriores a
  4.6 lo RECHAZAN.
- **El ESFUERZO de razonamiento es una tabla POR MODELO** (`core/esfuerzo.ts`), no por proveedor.
  `nivelesDeEsfuerzo` devuelve una LISTA; lo no reconocido devuelve `undefined` (sin control).
  **Ollama se PREGUNTA en vez de tabularse** (`/api/show`), por eso las capacidades entran por
  PARÁMETRO. En Anthropic va ACOPLADO al `thinking` (`aceptaThinkingAdaptativo` junto a
  `pideThinkingAdaptativo`). Se elige en DOS sitios que PERSISTEN: el `.md` de un subagente (gana
  sobre la sesión) y la sesión (vive en el ÍNDICE). No hay defecto global.
- **A DeepSeek se le dice QUIÉN pide** (`core/identidadDeProveedor.ts`,
  `agent/config/identidadEnDisco.ts`): un `user_id` en la raíz del cuerpo, del `sub` del login de
  CloudStudio, siempre como HASH. El lector real es la OMISIÓN del constructor de `Modelos`. Sin
  login no viaja.
- **Los topes de contexto solo si se saben** (`core/contextos.ts`, por familias; ollama sin tope a
  propósito).
- **La creación de proyecto al arrancar** (`core/esqueleto.ts`, `agent/config/crearProyecto.ts`):
  omisión No, datos puros de la documentación XOne, y nunca pisa un fichero existente.
- **El alta son cuatro pasos y cada uno solo aparece si falta lo que decide.** Sin TTY real se
  saltan los cuatro en `main.ts`.
- **`COMANDOS` (`cli/consola.ts`) es el registro único**: `/ayuda`, cabecera de stdio, completado
  del Tab y lista de la web se generan recorriéndolo.

### Dispositivos

`core/dispositivos.ts`, `agent/dispositivos/dispositivosEnMaquina.ts`,
`agent/dispositivos/instalacionEnMaquina.ts`.

- **`xcode-select -p` ANTES de cualquier `xcrun`**: sin herramientas de desarrollo, `xcrun`
  levanta el diálogo de instalación.
- **Cinco estados por herramienta, no un booleano**: ok, no encontrada, falló (UNA línea de
  motivo), no aplica (iOS fuera de macOS), desactivada. La RUTA se queda en el host.
- **Es una FOTO con hora, no un estado en vivo, y no hay sondeo**: al conectar el primer cliente y
  al pulsar «Refrescar». Tope propio (`TOPES_MS`); un cuelgue se dice «no respondió».
- **Apagar un destino deja de LANZAR procesos**, no esconde filas.
- **Listar y VERIFICAR son dos preguntas**: `adb devices` puede contestar «device» de un teléfono
  colgado; verificar ejecuta algo al otro lado.
- **«Terminó bien» y «ya está» son dos cosas**: la MEDIDA manda sobre el código de salida.
- **Se ejecuta lo que puede fallar RÁPIDO, no lo que no pide contraseña**: `sudo` sin TTY falla con
  código 1 rápido.
- **Se mata el GRUPO, no el hijo** (`detached: true` + `kill(-pid)`): un nieto sobrevive a
  `child.kill()`.
- **Ningún comando lleva una ruta de la máquina** (`$(brew --prefix)`). Las licencias se aceptan
  con un clic que lo DICE, nunca escribiendo ficheros a mano.
- **El silencio es el síntoma, no la lentitud** (`TOPE_SIN_SALIDA_MS`, 5 min). Un trabajo a la vez
  para toda la máquina.
- **El dispositivo de la sesión guarda la FOTO, no solo el id**, y solo si NO está a mano ahora. La
  consume Ejecutar y, por un FICHERO (`core/dispositivoDeSesion.ts`, `XONECODE_DISPOSITIVO`), el
  `device-controller`: los scripts de `xone-hotswap` lo leen en CADA ejecución. Sin elección, un
  emulador antes que un físico.

### La TUI y el panel (terminal)

- **La TUI es una piel Ink de LA MISMA consola**: lazo, estado y ejecutor entran INYECTADOS
  (`cli/tui/correrTui.ts`). Ink corre con `exitOnCtrlC: false`.
- **`cli/tema.ts` es el ÚNICO fichero de producción con escapes ANSI** (`tema.test.ts` lo vigila).
  El filtro del ratón va DELANTE de Ink (`crearStdinSinRaton`).
- **La fila de dos columnas mide `rows - 1`** (`FILA_DE_RESERVA`): a `rows`, Ink borra el terminal
  y repinta el frame completo en cada tecla. El transcript es lo ÚNICO elástico.
- **El panel de avisos** (`cli/panel.ts`) es la ÚNICA excepción al append-only: recinto de 5
  líneas repintado en sitio; **sin TTY no se instala**.

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
- **Dos trampas del formato** (`informeDeTraza.test.ts`): en una línea `modelo`, `llamadas` es el
  acumulado GLOBAL del tracker; y el fichero append-only obliga a partir el informe por `sesion`.
  Que no haya traza sale con **70**.

## El banco (`npm run banco`, nunca en `npm test`)

`src/evals/banco.ts` mide **cuánto cuesta enterarse**: preguntas de solo lectura sobre el
esqueleto, repetidas por modelo, con juez. El eval pregunta si sabe hacerlo; el banco, lo que
cuesta y **cuánto varía**. Las reglas viven en `medidas.ts` (puro, con test): la media **nunca**
sale sin su rango y su dispersión, una pasada que reventó se cuenta aparte, y se marcan dos cosas
que invalidan una comparación — una respuesta INCORRECTA y una pasada que **no delegó** cuando
otras sí. `comparar()` se NIEGA a concluir con los rangos solapados. Su aprobación **rechaza**:
esto son preguntas.

## Los evals (`npm run eval`, nunca en `npm test`)

`src/evals/correr.ts` corre tareas XOne reales sobre el esqueleto «Hola Mundo» en un temporal, con
el agente de verdad, el simulador de verdad y una aprobación que **aprueba todo** (por eso no
acepta una raíz: solo sobre un proyecto que se tira). El veredicto del simulador se MIDE en el
corredor, no se lee del turno. Los JUECES (`tareas.ts`) son código puro y SÍ tienen test en `npm
test`. El corredor vive en `src/` para tipearse, `tsconfig.build.json` lo excluye, y su nombre no
acaba en `.test.ts`. `docs/EVALS.md` tiene las tareas, cómo leer un resultado y por qué la línea
base se comprueba.

## Códigos de salida (contrato, CI los lee)

| | |
|---|---|
| 0 | bien |
| 1 | el proyecto tiene errores, o no es un proyecto XOne |
| 2 | quedaron escrituras **sin resolver** (nadie las aprobó, o se agotó el tope) |
| 64 | error de uso (bandera o modelo mal escritos) |
| 70 | fallo del **entorno**, no del proyecto |

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
