# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

`xonecode`: consola CLI y harness de agente para desarrollar aplicaciones **XOne**, sobre
LangChain / LangGraph / deepagents. Este fichero es el mapa y los invariantes, no la
justificación: **el porqué medido de cada decisión está en [`docs/DECISIONES.md`](docs/DECISIONES.md)**,
y el relato de conjunto en `README.md` («Cómo está construido, y por qué»). Cuando una regla de
aquí parezca arbitraria, la de allí dice qué se midió para llegar a ella — y ante una
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
npm run web:trueforge                  # la consola web con el motor TrueForge (`--motor trueforge`)
./bin/xonecode --motor trueforge …     # cualquier subcomando con ese motor; `xonecode config` dice cuál
```

Los tests son **colocados** (`src/**/*.test.ts`, junto al módulo que prueban).
`tsconfig.build.json` los excluye, igual que `src/core/__oro__/` (ficheros de oro: salida real
de `xone-simulator --json`).

**`npm test` no puede necesitar una clave, una conexión ni el simulador.** Es el invariante que
sostiene todo el diseño de puertos: si un cambio lo rompe, está mal el cambio, no el test.

**Y tampoco puede TOCAR la casa de quien lo corre**, que es el hermano del anterior y hoy se
comprueba (`src/gate.test.ts`). No era teórico: `cargarAgentes()` siembra —a propósito, ver los
subagentes— y la ráfaga de bienvenida del cable lo llama, así que una pasada le reescribía a
quien la corría su `~/.xonecode/agentes/`. El arreglo NO es quitar la siembra del cargador ni
mudar el `HOME` en los tests que hoy lo provocan —una lista que hay que acordarse de ampliar es
el patrón de fallo de este repo—: se muda para TODO el suite en `vitest.config.ts`
(`setupFiles`, los DOS proyectos, con su porqué en `src/casaDePruebas.ts`), así que ningún test
futuro puede reintroducirlo. Ese fichero vive en `src/` para que lo tipe el gate y
`tsconfig.build.json` lo excluye, el mismo trato que `src/evals/`.

**`typecheck` son DOS proyectos, encadenados con `&&`, y eso se comprueba** (`src/gate.test.ts`).
El del cliente no se puede fundir en el `include` de la raíz: su `lib`, su `jsx` y sus `types`
son otros. Con un solo `tsc --noEmit` el cliente web entero se quedaba sin comprobar —ni él ni
`vite build`, que transpila sin mirar tipos—, así que un error de tipos suyo pasaba el gate y
pasaba el build. El `&&` es parte de la regla: con `;` el código de salida sería el del último,
y CI lee ese código. Los `*.test.ts(x)` del cliente siguen fuera a propósito
(`apps/web/tsconfig.json` explica por qué).

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
| `src/agent/` | toda la suciedad del grafo: deepagents, langgraph, backend de ficheros, perfiles, verificador, git. Repartida en ocho carpetas por la misma división que las secciones de más abajo: `grafo/`, `turno/`, `subagentes/`, `tareas/`, `sesiones/`, `cloudstudio/`, `dispositivos/`, `config/` |
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
- `agent/` no importa de `cli/` — convención sin test, solo un comentario en `agent/turno/turnoReal.ts`.
  En el otro sentido sí se puede.

### Puertos, eventos y honestidad

- **Todo lo caro entra por un puerto que se PASA al construir** (`core/ports.ts`, `core/deps.ts`),
  nunca se importa dentro de quien lo usa. Los dobles viven en `ports.ts` y no en fixtures de
  test, porque offline es un modo de uso de primera clase. La marca de doble es el Symbol
  `ES_DOBLE`, no un booleano: un campo se puede olvidar y entonces el aviso calla.
- **Ningún evento lleva argumentos de tool, ni truncados** (`core/events.ts`): `write_file`
  llevaría el contenido del fichero y una tool MCP el bearer. `tool.detalle` no es excepción: es
  una lista blanca por NOMBRE de tool (`agent/turno/resumenDeTool.ts`) que extrae un solo campo de
  ruta o patrón. El **único** sitio donde el contenido se enseña entero es el diff de la
  aprobación (`cli/aprobar.ts`, `core/diff.ts`), que es el paso donde se DECIDE sobre él.
- **Ninguna ruta de la máquina viaja por el cable** (`sinRutas`, `web/servidor/arranque.ts`): puede
  ir por un túnel. De un error de Node solo el `code` (`codigoDe`), porque su mensaje lleva la
  ruta absoluta.
- **Los avisos de honestidad son código, no prompt**, con alcance de **turno**
  (`core/bitacora.ts`): a un modelo se le puede pedir que avise y a veces no avisa, y un aviso
  que salta cuando no ha pasado nada enseña a ignorarlo.
- `agent/turno/puente.ts` traduce los chunks de langgraph a eventos, `core/turno.ts` decide qué se
  cuenta, y las pieles (`cli/stdio.ts`, `cli/tui/`, `web/servidor/pielWeb.ts`) pintan. Los
  métodos nuevos de `Piel` van **opcionales** (`fase?`, `razonamiento?`, `notificacion?`,
  `linea(texto, detalle?)`): así stdio y la TUI no cambian y la tubería sigue byte-idéntica.

### El agente, y lo único que puede escribir

`agent/grafo/xoneAgent.ts`: un orquestador que delega en los especialistas de `core/agentes.ts`.
Cinco cosas no son negociables:

- **El orquestador va de SOLO LECTURA por PERMISOS, no por falta de tools**
  (`PERFIL_DEL_ORQUESTADOR`). Quitarle el middleware podría reinstalar el de deepagents —sin
  permisos— y reabrir el agujero; `xoneAgent.orquestador.test.ts` exige lo contrario.
- **`FilesystemBackend` con `virtualMode: true`.** Con el default leyó una ruta absoluta
  de fuera de la raíz. **Backend con shell, exactamente UNO**, y el que lo lleva lo declara en
  su `.md` (`ejecucion`, ver los subagentes): `virtualMode` confina las tools de FICHERO, no
  los comandos, así que ahí no hay barrera que poner — la propia deepagents LANZA si le pasas
  `permissions` junto a un backend ejecutable, y esa negativa es el motivo de que esto se
  declare en vez de deducirse.
- **Los permisos se construyen con `permisosDe(perfil)`, NUNCA a mano**: `SubAgent.permissions`
  reemplaza los del padre en vez de fusionarlos, así que un perfil que los escriba a mano pierde
  la denegación de `/.env`, `/.git` y `/.xonecode`.
- **`SubAgent.tools` lleva SOLO tools propias**, nunca los nombres de las de fichero: pasarle
  nombres las sustituía por cadenas y dejaba al especialista sin capacidades. Las de fichero las
  monta `createFilesystemMiddleware`; quien las acota es `permissions`.
- **El HITL va en `write_file` y `edit_file`**, que son las que escriben.

Y las guardas del proyecto:

- **Las vistas aplanadas** (`X.xml` con un `X.xne` al lado) se retiran del backend con un Proxy
  (`agent/grafo/proyecto.ts`): la regla es propiedad del proyecto, no de un prompt.
- **Un rechazo de guarda se DEVUELVE como `{error}`, nunca se lanza.** deepagents devuelve el
  error al modelo, que puede reintentar; una excepción se lleva el turno por delante y el agente
  no reintenta. Vale para `sinVistasAplanadas`, `sinArtefactosEnElProyecto` y
  `sinDescargasEnElProyecto`. `proyecto.test.ts` lo ata contra la librería real.
- **Dos escrituras sobre el MISMO fichero no se solapan** (`core/serieDeEscrituras.ts` puro,
  `agent/grafo/escriturasEnSerie.ts`). `write` y `edit` son leer-modificar-escribir sobre el
  fichero entero, así que dos a la vez se pisan y **las dos contestan que bien**: una de ellas
  no llega al disco y no avisa nadie. Un modelo las pide a la vez en cuanto agrupa varias
  `tool_calls` en un mensaje. **Serializar BASTA, y por dónde va**: la segunda calculó su
  `old_string` contra un contenido que la primera ya cambió, así que el envoltorio va por
  FUERA de quien edita — cuando le llega el turno se vuelve a leer el fichero y se vuelve a
  buscar el ancla contra lo que hay. Si sigue, la edición es correcta; si no, el backend
  contesta que no lo encuentra y el modelo reintenta, que es el camino que ya existe. La
  alternativa era perder el cambio en silencio. En la pila va por DENTRO de las guardas de
  ruta —que siguen contestando primero— y por FUERA de `sinContenidoInvalido`, para que leer,
  validar y escribir sean un solo turno. Solo `write` y `edit`: serializar lecturas no arregla
  nada y volvería secuencial lo que sí puede ir en paralelo. **Y se prueba por `backendDeAgente`
  y contra el backend REAL**, porque lo que hay que comprobar es que esté CABLEADA.
- **`/artefactos/` → `.xonecode/sesiones/<id>/artefactos/`**: escribible y **sin aprobación**, por
  eso se ANUNCIA con el evento `artefacto` (nombre, tamaño, ruta virtual — nunca contenido).
  `esRutaDeArtefacto` es una lista BLANCA de forma, no un `startsWith`. La carpeta no se crea al
  montar. Tope propio de rondas, para que una tanda de diagramas no gaste `cortadoPorTope`.
- **La carpeta de artefactos SE CREA antes de correr un comando**
  (`proyecto.ts#anunciarArtefactosDeLaShell`), que es la única excepción a «no se crea al
  montar»: la crea `FilesystemBackend.write` la primera vez que se escribe por una TOOL, y una
  shell no pasa por ahí — así que el script de la captura reventaba con ENOENT y el modelo se
  replegaba a dejar el `.png` en la raíz del proyecto. Va en el harness y no en el script:
  cinco scripts y uno escribe, y una skill del usuario tendría que saberse el mismo truco. Solo
  con `ejecucion`, así que los otros cuatro especialistas siguen sin carpeta vacía. Lo que el
  código NO puede cerrar es que una shell escriba donde quiera; lo que se le quita es el
  motivo, con un script que hace lo nativo y lo deja donde toca. **Y los scripts que el prompt
  NOMBRA se comprueban contra el catálogo real, en las dos direcciones y con el bit de
  ejecución**: un nombre muerto en un prompt manda al modelo a apañárselas solo.
- **Un artefacto no puede acabar dentro del proyecto, y eso es código**: `artefactoFueraDeSitio`
  (`core/artefactos.ts`) deniega `artifacts`/`artifact` como primer segmento y `/artifact.html`
  en `write` y `edit` — solo ahí, para poder leer y borrar los mal puestos de antes. El predicado
  `when` de `seDetieneEn` (`agent/grafo/perfiles.ts`) usa **la misma función** para no sacar un modal
  cuyo único final posible es un rechazo; `perfiles.test.ts` exige que no preguntar implique que
  la guarda rechaza.
- **Lo que deepagents desaloja del contexto tampoco es del proyecto**: `/large_tool_results/` y
  `/conversation_history/` van a fuego en la librería y las escribe llamando al backend directo
  —sin HITL ni `permissions`—, así que se montan al lado de los artefactos
  (`backendConDescargas`), y la guarda del backend del proyecto existe para fallar CERRADO el día
  que el montaje falte.
- **Y lo que una SHELL saca del contexto tiene su propia carpeta, `/hotswap/`**
  (`core/hotswap.ts`, `backendConHotswap`, variable `XONECODE_HOTSWAP`). Misma pieza y misma
  razón que las descargas —«un artefacto es una salida para una persona y por eso se anuncia;
  esto es el andamio del agente»—, y cambia solo quién descarga: ahí la librería, aquí el
  script `xone-hotswap`, que no imprime una respuesta larga del aparato sino que la guarda.
  Escribía en la carpeta que SÍ se anuncia, y el reparto lo decide un LECTOR medido: una
  captura tiene uno —`capturasDelTurno` se lleva la última al crítico de pantalla— y un árbol
  de controles no tiene ninguno, así que la imagen se queda en `/artefactos/` y el texto se
  muda. **La carpeta es HERMANA de la de artefactos y no una subcarpeta suya**, porque la foto
  de `anunciarArtefactosDeLaShell` es recursiva y lo de dentro volvería a anunciarse. **Y el
  script NOMBRA la ruta virtual en su salida**: con un nombre pelado el agente no sabía por
  dónde releerlo y probaba la ruta absoluta de la máquina, que además viajaba por el cable.
- **`/skills/` con barra final obligatoria** (`CompositeBackend` la retira antes de delegar) y
  `permisosDe` deniega `write` ahí: son instrucciones, no ficheros editables.
- **Y bajo esa MISMA ruta cuelgan las skills del USUARIO, una a una**
  (`agent/grafo/proyecto.ts#backendConSkills`, `agent/grafo/skills.ts`). Tres raíces —la del
  paquete, `~/.xonecode/skills/` y la del proyecto, con la del proyecto ganando—, que el agente
  ve como una sola: un subagente declara `skills: [mi-skill]` y eso se traduce a
  `/skills/mi-skill/` sin saber de qué carpeta salió. Una raíz aparte (`/skills-tuyas/`) habría
  metido de quién es la skill dentro de su ruta. Se apoya en que `CompositeBackend` ordena sus
  rutas por LONGITUD descendente, y eso se ata contra la librería real (`proyecto.test.ts`) — no
  se supone. **Límite declarado**: un `ls /skills` enseña solo las de serie, porque ese `ls`
  resuelve a UNA ruta y no funde varias; da igual para lo que esto hace, porque
  `SkillsMiddleware` recibe las rutas ya resueltas una a una. **`SkillsEnDisco` no cachea** y
  `skillsMontables` se lee en cada construcción del agente, igual que `cargarAgentes`. **Ojo con
  lo que eso significa hoy**: `construir()` (`agent/turno/turnoReal.ts`) tiene DOS llamadores —al
  abrir la sesión y en `/modelo`—, así que una skill guardada desde Ajustes con la consola
  abierta **no alcanza a esa sesión** hasta que se reconstruya. La caché se quitó porque era una
  segunda razón para lo mismo, pero no basta sola: el comentario de `cargarAgentes` promete ahí
  algo que el código no cumple, y es un agujero HEREDADO que no tiene test porque no puede
  tenerlo.
- **Una skill de serie no se edita ni se borra: se COPIA** (`web/servidor/arranque.ts`
  `#atenderSkill`, `core/skills.ts`). Vive dentro del paquete instalado, así que una edición se
  la llevaría el siguiente `npm install` sin decir nada, y no hay nada que restaurar porque nada
  nuestro se copia nunca a la casa del usuario — de ahí que aquí NO haya `.semilla.json` ni
  `restaurar`, a diferencia de los subagentes. La barrera vive en el SERVIDOR; el cliente se
  limita a no ofrecer el botón, que es presentación. El nombre es un SLUG con la MISMA función
  que la de un subagente (`motivoDeNombreInaceptable`), se valida al GUARDAR y no al cargar, y un
  destino que existe es un NO venga de donde venga. Renombrar es `renameSync` y LUEGO escribir.
  **Y el `cuerpo` de una de serie no viaja en la ráfaga de bienvenida** —son ficheros de decenas
  de miles de caracteres para un formulario que nadie puede guardar—: se pide a mano
  (`cuerpoDeSkill`), y lo que no se pudo leer se DICE en vez de abrir la ficha en blanco.
- **Y se INSTALAN desde un `.zip`** (`core/zipDeSkill.ts`, `agent/grafo/skills.ts#instalarSkillDesdeZip`,
  `POST /skill`). Un zip y no un `SKILL.md` suelto porque una skill es una CARPETA: subir solo
  el `.md` deja dentro una que apunta a ficheros que no están. Los BYTES van por HTTP y no por
  el cable, que lleva JSON — el mismo molde que `POST /adjunto`. La REGLA de qué se acepta es
  PURA y vive en `core/`, que es lo que deja probarla sin un zip delante: **lista BLANCA de
  forma para cada ruta del zip** (segmentos llanos separados por `/`, y nada más — el «zip
  slip» no se para con un `includes("..")`: también hay `\`, absolutas, unidad `C:` y el byte
  nulo), **tres topes contra un zip BOMBA** (lo DESCOMPRIMIDO, que el tope del cuerpo HTTP no
  ve; cuántas entradas; y el tamaño de la mayor), y un `SKILL.md` obligatorio. **Se
  descomprime entero y se decide ANTES de escribir nada**: media skill en disco es peor que un
  no, y una entrada mala se lleva el zip ENTERO. El nombre se DEDUCE —la carpeta envolvente, o
  el fichero que subió la persona— y pasa por la regla del slug; el motivo de un rechazo nunca
  repite el nombre de una entrada del zip, que lo eligió quien lo empaquetó.
- **A un motor EXTERNO las skills llegan por SU palanca, nunca por `/skills/`.** Esa ruta es
  virtual de nuestro backend y un hijo de Claude Code, Codex u OpenCode lee el disco de
  verdad, confinado a la carpeta del proyecto (`veredictoDeLectura`). Cada motor tiene lo
  suyo, y **cuál es se MIDIÓ, no se dedujo del manual**: Claude Code por `plugins`
  (`agent/subagentes/pluginDeSkills.ts`, un plugin local con enlaces a las tres raíces —
  `additionalDirectories` NO vale, probado contra un hijo de verdad), y OpenCode por
  `skills.paths` de la configuración que ya reescribimos en cada arranque. **Ninguna de las
  dos escribe dentro del PROYECTO**, que es la otra forma de que lo encuentren: el proyecto es
  la app del cliente, se sincroniza con CloudStudio y entra en el commit de cada turno; y para
  opencode su `.opencode/` es justo la puerta que `OPENCODE_DISABLE_PROJECT_CONFIG` cierra.
  **Codex se queda fuera**: sus skills vienen de su sistema de plugins y no hay carpeta que
  apuntar.
- **Y la tool `Skill` está en la lista de LECTURA de los motores externos.** No pasamos la
  opción `skills` del SDK, y su documentación dice que omitirla «no es skills off»: las del
  usuario ya llegaban LISTADAS al hijo y al cargar una caía en «desconocida» → `deny`. Lo peor
  de los dos mundos. Entra como lectura porque eso hace: mete instrucciones en el contexto, y
  lo que la skill MANDE hacer vuelve a pasar por el mismo hook. **Dos límites declarados**: un
  `Bash` que pida una skill se sigue denegando, y un `Read` a otro fichero de su carpeta
  también —cae fuera del proyecto—, así que una skill de varios ficheros se queda en su
  `SKILL.md`. No se ensancha `veredictoDeLectura` para arreglarlo. **Y el nombre le llega
  PREFIJADO** (`xonecode:<nombre>`), que es como Claude Code nombra lo de un plugin, mientras
  que `promptDeAgente` lo nombra a secas.
- **Las skills de un subagente se MARCAN de una lista, no se teclean**
  (`componentes/Agentes.tsx#SkillsDelAgente`). Un nombre mal escrito no daba error:
  `repartirSkills` lo mete en `faltan` y el subagente trabaja sin lo que creías haberle dado, con
  la ventana leyéndose igual de bien. Dos cosas que no son de forma: **una skill declarada que ya
  no está en el catálogo se sigue pintando, marcada y señalada** —si no, abrir un subagente y
  guardarlo sin tocar nada se la quitaba en silencio—, y **sin catálogo NO se pinta una lista
  vacía**, que se leería como «no hay ninguna»: se cae al campo de texto, que dice la verdad de
  lo que hay en el `.md`.
- **`/adjuntos/` es de solo lectura y su fila en `permisosDe` es INCONDICIONAL**: sin ella, un
  `write_file` con la carpeta sin montar escribe un fichero DEL PROYECTO con el nombre de algo
  que la interfaz presenta como «lo que te adjuntaron».
- **Las tools propias son DOS, y contestan preguntas distintas.** La búsqueda regex
  (`agent/grafo/busquedaRegex.ts`, acotada por `LIMITES_REGEX`) busca TEXTO; `xone_navegacion`
  (`agent/grafo/navegacionXone.ts`) contesta sobre el MODELO ya resuelto: qué colecciones hay,
  dónde se declara una o un campo, quién la referencia (`mapcol`, `mapfld`, `linkedfield`,
  `contents`, `inherits`) y qué campos tiene. Las dos **re-aplican `puedeLeerRuta` a mano**: una
  tool de LangChain añadida por xonecode **no pasa por el middleware de permisos**.
- **`xone_navegacion` existe por una medida, no por completitud**: contestar «¿qué colecciones
  tiene el proyecto?» leyendo ficheros cuesta dos órdenes de magnitud más que contestarla desde
  el modelo — lo caro no es abrir un `.xne`, es no saber cuál de todos abrir. Cuatro reglas:
  **el reparto** —la semántica de XOne la pone `xone-linter` como LIBRERÍA (ya parsea, ya decodifica
  ISO-8859 y su `CrossReferenceRule` ya define qué significa `mapcol`), y reescribirla aquí sería
  un segundo sitio donde decidir lo mismo—; **el import es PROFUNDO**
  (`xone-linter/dist/project/XoneProject.js`) porque el barril arrastra su runtime con un
  *top-level await* que revienta bajo `tsx`, o sea el lanzador de desarrollo; **la raíz se fija al
  construir y NO entra por parámetro de la tool**, o sería una tool que lee cualquier carpeta de
  la máquina; y **no cachea**, porque reconstruir cuesta decenas de milisegundos contra los
  segundos de una llamada, y un índice viejo que afirma que un campo existe es peor que no tener
  índice. Las rutas se traducen a VIRTUALES y se filtran **en la fuente**
  (`agent/navegacion/modeloDeProyecto.ts`): lo que el agente no puede abrir no llega a estar en
  el índice.
- **Siete operaciones, y las tres últimas salieron de medir sobre un proyecto real**: `app`
  (por dónde arranca, login, estilos), `detalle` (campos, eventos, nodos y conexiones de una
  colección) y `problemas` (referencias que apuntan a una colección que no existe). **Y las
  referencias de SCRIPT**, que fue el hallazgo que cambió el alcance: una app XOne navega con
  `onclick="javascript:appData.getCollection('X')…"` y no con `mapcol`, así que sin ellas
  «¿quién usa Deportes?» contestaba «nadie» con dos botones apuntándole. Es un PATRÓN con
  literal, no «el nombre aparece en el texto» — buscar el nombre suelto daría cualquier
  comentario. **Límites declarados**: no ve un `getCollection(variable)` ni dice en qué LÍNEA
  está, y la descripción de la tool lo dice — callarlo haría concluir que un uso no existe.
- **Y hay una SEGUNDA señal, más floja, que va MARCADA aparte** (`por: "mencion"` frente a
  `por: "script"`). Existe porque la cadena real puede tener tres saltos:
  `method="ExecuteNode(abrirColl('X'))"` → un nodo con `<param>` → `irColl(coll)` →
  `getCollection(collname)` + `pushValue(obj)`, y el nombre solo aparece como literal en el
  PRIMERO. Perseguir la cadena sería atarse a cómo llama UN proyecto a sus ayudantes
  (`irColl`, `abrirColl`, `openMenu`), que no son de XOne; así que lo que se reconoce es un
  literal que COINCIDE con una colección del inventario — el inventario es la criba, sin él
  sería «cualquier cadena». **Se marcan distinto porque la confianza es distinta**, y la
  respuesta lo dice con palabras: fundirlas haría que una coincidencia se leyera con la
  autoridad de una llamada resuelta. Dos cosas que no son de forma: el atributo **`method`**
  se mira (es donde vive el `ExecuteNode`, y en un proyecto real era la única aparición literal
  de una colección), y **una colección que se nombra a SÍ MISMA no cuenta** — medido, era la
  mayoría de las menciones y sale en todas las que tienen script.
- **Cuando NO sabe contestar, devuelve la llamada a `regex_search` HECHA** — no un consejo.
  Pasa en los cinco callejones: el índice que no carga, y `definicion`, `campos`, `detalle` y
  `referencias` que no encuentran nada. El caso que lo justifica es el último: «nadie la
  referencia» es una afirmación fuerte y este índice **no puede sostenerla** —no ve un nombre
  calculado en JavaScript—, así que el vacío se acompaña de «NO concluyas que no se usa» y del
  siguiente paso ya escrito. Se devuelve la llamada entera y no «busca con regex_search» por lo
  mismo que `porQueNo` dice la ruta buena: un modelo al que se le dice qué hacer sin decirle
  cómo se inventa los argumentos, y eso cuesta un viaje y un error de esquema. **El nombre de
  la otra tool sale de una constante** (`NOMBRE_BUSQUEDA_REGEX`) y **la llamada se valida
  contra su ESQUEMA REAL en el test** — una sugerencia que la otra tool rechaza es peor que
  ninguna. Y **cuando sí encuentra, no manda a ningún sitio**: ahí solo estorbaría.
- **Lo que NO hay, y se midió antes de descartarlo: «colecciones huérfanas».** Se implementó y
  se tiró. Sobre un proyecto real daba 33 de 42, y con las referencias de script dentro bajaba a
  22 — la mitad del proyecto. Una lista con esa proporción de falsos positivos no es un
  hallazgo: o se ignora o se borra código vivo. Un aviso al pie no arregla una señal equivocada.
- **Va a los cinco especialistas Y al orquestador, y eso lo decidió una MEDIDA que tumbó lo
  contrario** (`xoneAgent.navegacion.test.ts`, que lo mira en lo que recibe `createDeepAgent`). La
  primera versión se la negaba al orquestador, con el argumento de que delega; medido sobre un
  proyecto real con la pregunta que motivó la tool, **no delegó**: la contestó él con `ls`, `glob`,
  `grep` y `read_file`, y la tool no llegó a estar disponible. No le abre nada —es de lectura y ya
  lee—, lo que cambia es el precio de orientarse. A un subagente de motor EXTERNO no puede llegar:
  corre en otro proceso, con sus propias tools.
- `.xonecode/memoria.md` se ve por UNA ruta virtual, `/MEMORIA_PROYECTO.md` (Proxy en
  `agent/grafo/memoriaDeProyecto.ts`), así que la carpeta sigue denegada entera y escribir la memoria
  pasa por la aprobación de siempre. El resumen de contexto usa umbrales **fijados a mano** (32k
  para disparar, 8k de reciente): deepagents asume 170k y con Ollama comprime demasiado tarde.

### Los subagentes

Un subagente es un `.md` con frontmatter en `.xonecode/agentes/<nombre>.md`
(`core/agentes.ts`, `agent/subagentes/agentesEnDisco.ts`). Los cinco de serie —`consultant-xone`,
`analyst-xone`, `developer-xone`, `designer-xone`, `device-controller`— se siembran al arrancar. El
sufijo `-xone` no es decoración: estos nombres viajan como `subagent_type` a los motores
externos, donde el hijo tiene sus propios agentes, y es lo que los distingue. `device-controller`
se sale de esa convención a propósito —lo que conduce no es propio de XOne, y a un motor externo
no viaja porque ahí la ejecución no se concede—. Reglas duras:

- **La EJECUCIÓN de comandos se DECLARA en el `.md` y la lleva uno solo** (`ejecucion`, cierto
  solo con exactamente `"true"` — la trampa del `"false"` de CloudStudio, que aquí concedería la
  máquina). Lo que concede no es «correr un comando»: una shell no pasa por `permisosDe` ni por
  el `virtualMode`, así que lee `/.env`, escribe el proyecto sin aprobación y sale de la raíz —
  por eso deepagents **lanza** al combinar `permissions` con un backend ejecutable, y por eso
  quien la tiene NO recibe `permissions` (`perfiles.ts#montajeDeFicheros`, puro y probado; el
  cableado se mira desde fuera en `xoneAgent.ejecucion.test.ts`, preguntándole a la LIBRERÍA si
  ese backend ejecuta). Se le quitan `write_file` y `edit_file` para que el camino normal de
  tocar el proyecto siga siendo el de la aprobación, no porque eso lo impida. **Y quien ejecuta
  NO es `soloLectura`**: ese campo se refiere a los ficheros pero además ELIGE EL MODELO
  (`rapido` para quien solo lee, `trabajo` para quien escribe), así que marcarlo miente dos
  veces — sobre lo que puede tocar, y dándole el modelo barato a un trabajo que es leer un log
  y entender una excepción. **Solo con
  `motor: "modelo"`**: en los tres externos la shell está cerrada a propósito, así que ahí el
  campo se declara «no aplica» y la ventana lo dice, en vez de prometer lo que no llega. Se
  compensa VIÉNDOLO: el comando entero sale como `detalle` del evento (lista blanca de
  `resumenDeTool.ts`) porque no se pregunta antes de cada uno, y el precio declarado es que una
  ruta absoluta que el modelo escriba en su comando viaja por el cable — para eso el entorno le
  da una variable por skill y el `cwd` es la raíz.
- **La shell NO hereda las claves de API** (`core/shellDeAgente.ts`, puro): `guardarCredencial`
  escribe también en `process.env`, así que un `printenv` las dejaría en el contexto y en el
  `.jsonl`. Se quitan por la TABLA (`VARIABLES_POR_PROVEEDOR`) más el prefijo de los
  personalizados, no por una lista a mano. Y se AÑADE una variable por skill montada
  (`XONECODE_SKILL_<SLUG>`) y otra para los artefactos: una shell ve el disco de verdad y
  `/skills/` es virtual, pero una ruta absoluta en el prompt acabaría en el cable. **Límite
  declarado**: quita las NUESTRAS; un `GITHUB_TOKEN` del usuario sigue ahí, y filtrar «lo que
  parece una clave» sería una heurística que falla en silencio.
- **Lo que un COMANDO deja en la carpeta de artefactos también se anuncia**
  (`proyecto.ts#anunciarArtefactosDeLaShell`): el evento `artefacto` lo emite el Proxy de
  `write`/`edit`, y una shell no pasa por ahí — sin esto, una captura existe en el disco y no
  existe para nadie. Se compara una FOTO de la carpeta antes y después, no lo que el comando
  diga, y esa foto es **RECURSIVA**: un `unzip` deja un ÁRBOL, así que con la plana una maqueta
  descomprimida en una subcarpeta daba cero anuncios y por tanto ninguna pestaña Artefactos.
  No se baja por un enlace. Y no se anuncia lo que acabaría en una tarjeta muerta: lo que
  `esRutaDeArtefacto` —la barrera del LECTOR— rechazaría, ni la basura que un zip arrastra
  (`core/artefactos.ts#esBasuraDeArtefacto`, que **no** es `BASURA_DEL_SO`: aquella contesta
  qué no se commitea y esta qué no se le enseña a una persona).
- **Un Proxy sobre un backend lee contra el OBJETIVO, no contra el proxy.** `LocalShellBackend.id`
  es un getter sobre un campo PRIVADO, y `Reflect.get(o, p, receptor)` lanza al leerlo — lo lee el
  constructor de `CompositeBackend`, así que el fallo es al MONTAR y no al usar.
- **`REGLAS_XONE` se antepone SIEMPRE desde código**, igual que el aviso de las skills que faltan
  y la línea de que las escrituras se aprueban: poder quitarlas editando un `.md` convertiría el
  invariante en una preferencia.
- **El nombre sale del FICHERO**, no del frontmatter, y es un SLUG: minúsculas, dígitos y guiones
  sencillos (`motivoDeNombreInaceptable`). **Se valida al GUARDAR y solo se DICE al cargar** —con
  el nombre que sí valdría (`nombreSugerido`, que descompone los acentos)—: rechazarlo al cargar
  haría desaparecer un subagente que funciona, y guardar es el único momento con alguien delante
  para arreglarlo. No lo cubre `leerAgente`, porque el nombre no sale del `.md`, ni
  `segmentoSeguro`, que solo impide salir de la carpeta. El cliente lleva su copia DECLARADA,
  como la URL de un entorno: la frontera prohíbe compartir módulo, y sin ella el rechazo era mudo
  —`informar` no llega al navegador desde el vestíbulo—. Sin `descripcion` no se carga (es lo que
  el orquestador lee para delegar). **`soloLectura` solo es cierto con exactamente `"true"`** — la
  trampa del `"false"` de CloudStudio, que aquí concedería ESCRITURA.
- **La marca de la siembra es `.semilla.json` con el hash de lo que escribimos**, no «la carpeta
  existe»: así un agente nuevo o una corrección alcanzan a quien ya arrancó, sin resucitar lo que
  el usuario borró ni pisar lo que tocó. Una carpeta sin marca con
  agentes de serie dentro se ADOPTA sin escribir nada; vacía se siembra entera. **Y un renombrado
  tiene caso propio** (`RENOMBRADOS`): la clave vieja de la marca que sigue siendo nuestra semilla
  intacta se RETIRA con su fichero, y si el usuario la afinó se queda y se dice — sin eso, quien
  ya hubiera arrancado se queda con los dos especialistas, uno de ellos sin mantener y en silencio.
  Se lee de UN SALTO y no como una cadena, así que una entrada vieja se **ACTUALIZA** al nuevo
  nombre en vez de dejarse: apuntando al de enmedio, el aviso mandaría a buscar un agente que ya
  no existe. Dos claves pueden apuntar al mismo nombre nuevo, porque cada una se resuelve contra
  el hash de SU fichero.
- **De QUIÉN es un `.md` viaja por el cable, y no es su carpeta** (`AgenteCargado.semilla`,
  `marcarSemilla`): tres estados —ausente, `intacta`, `modificada`— en vez de dos booleanos, que
  admitirían la combinación imposible. `origen` es la carpeta, y un subagente propio también vive
  en la global, así que esa pastilla parecía contestar de quién era el fichero sin contestarlo. La
  regla es **de serie Y del GLOBAL**: la siembra solo toca el global, así que un `docs.md` DEL
  PROYECTO es del usuario aunque se llame igual, y con la regla simple se quedaba sin botón de
  borrar. Se calcula en `agent/` —donde vive la lista— y no en el `map` de `arranque.ts`.
- **Un de serie no se BORRA: se RESTAURA** (`restaurarAgente`, `accion: "restaurar"`). Borrarlo no
  devolvía el de serie —la marca recuerda que se entregó, así que no se resiembra—, o sea que el
  «bórralo si quieres el nuevo» que decía la consola dejaba sin ninguno de los dos y para siempre.
  `restaurarAgente` **no escribe la marca**: la reanota la siembra siguiente, que corre antes de
  cualquier lectura y reconoce su propio hash — un segundo sitio donde decidir sobre la marca es
  el único que podría resucitar lo que el usuario borró. La negativa vive en el SERVIDOR además de
  en la pantalla, que solo esconde el icono. Y lo de «este de serie está editado» dejó de ir por
  `problemas`, que pintaba en rojo y con `role="alert"` un agente que está perfectamente: lo dice
  su tarjeta, con la consecuencia (las mejoras que publiquemos ya no le llegan) y con el botón que
  lo arregla al lado. `problemas` vuelve a significar solo «este fichero no carga».
- **Y RENOMBRAR es solo para los tuyos** (`renombrarAgente`, `renombrandoDe` en el mensaje
  `guardar`): el nombre de un de serie es lo que lo ata a la marca, que guarda el hash POR
  NOMBRE, así que moverlo lo vuelve un subagente del usuario y la siembra repone el de serie —
  dos especialistas donde había uno. Tres cosas que no son de forma: **`renameSync` y LUEGO
  escribir**, nunca escribir y luego borrar, porque un fallo entre los dos pasos deja UN fichero
  y no dos con el mismo prompt; **un destino que existe es un NO** —sea de serie o del usuario,
  que es el motivo honesto y cubre los dos—; y **la negativa se EXPLICA en el cliente** porque
  `informar` no llega al navegador desde el vestíbulo (escribe en el terminal y en la consola del
  proyecto abierto, y ahí no hay ninguno), así que la barrera sigue en el servidor y lo que el
  cliente aporta es la frase. Eso cierra también el agujero del ALTA: `guardarAgente` escribe sin
  mirar, así que crear uno llamado `docs` pisaba el sembrado en silencio — hoy se avisa, pero el
  servidor no lo corta, porque un `guardar` no dice si es un alta o una edición.
- **El prompt del orquestador se GENERA** de la lista (`xoneAgent.ts#promptOrquestador`). Lo que
  NO se genera es la regla del encadenado de diagramas, que nombra a dos especialistas a pelo: al
  renombrarlos hay que cambiarlos ahí o la regla se queda escrita y muerta. Y **`HANDOFF DE
  ANÁLISIS` es un TOKEN de protocolo, no una referencia a un agente**: se llamaba `HANDOFF DE
  PLANNER` y caducó con el nombre de `planner`; ahora no nombra a nadie, así que no vuelve a
  caducar. Vive literal en cuatro sitios.
- Un `.md` roto se salta y su motivo viaja por el cable hasta la ventana de Ajustes.
- **La línea de una delegación dice a QUIÉN** (`task` → `subagent_type`, en la lista blanca de
  `resumenDeTool.ts` + icono y verbo en `core/notify.ts`), y **nunca la `description`**, que es el
  encargo entero. La rama genérica de `frase()` no tira el `detalle`: no filtra nada nuevo,
  porque un `detalle` solo existe si la lista blanca lo eligió a mano.
- **Y lo que un agente externo CUENTA entre dos tools también cruza**, como `razonamiento`
  (`escrituraExterna.ts#opcionesDeSubagenteExterno`, `alRazonar`). El bucle de mensajes del SDK
  descartaba todo lo que no fuera el `result`, así que en los minutos entre una tool y la
  siguiente no llegaba NADA y no había forma de distinguir un agente que trabaja de uno
  colgado. Solo bloques de TEXTO, nunca los de `tool_use`: esos ya viajan por `alUsarTool` con
  su lista blanca, y duplicarlos aquí los sacaría con los argumentos crudos dentro. **Límite
  declarado**: hoy solo lo alimenta `claude-code`.
- **El pulso DICE en qué paso está y cuánto lleva en él** (`Chat.tsx`, `cronometro.ts` con
  `clave`), en la línea que se ve con el pulso PLEGADO. El total no contesta esa pregunta: un
  «Trabajando…» con su cuenta atrás no distingue avanzar de colgarse, y lo que lo distingue es
  si el paso actual acaba de empezar o lleva ahí desde el principio. Se mide desde que la
  LÍNEA apareció, que es lo único que el cliente sabe.
- **Y lo que hace un agente EXTERNO se ve MIENTRAS lo hace** (`core/entrelazar.ts`): sale un
  evento `tool` NORMAL, con nombre canónico (`Read` → `read_file`) y ruta VIRTUAL, así que el
  colapsador lo agrupa con los demás y ninguna piel sabe que hay dos orígenes. Es un generador
  que intercala MIENTRAS, no al final, y **solo cuenta lo que va a ocurrir**: una tool denegada
  no se anuncia. Trampa: `it.next()` se pide UNA vez y se guarda — dos `next()` vivos se comen un
  valor.
- **Un hijo de Claude Code NO puede enumerar la carpeta, así que se le DICE**
  (`escrituraExterna.ts#inventarioDelProyecto`): van sus rutas virtuales en las instrucciones,
  acotadas y con el total al lado — montar no basta, hay que decir que están (el patrón de
  `core/adjuntos.ts`).
- Dos cosas más de esa medida: **`ToolSearch` es de LECTURA** (devuelve esquemas; sin ella el
  mensaje de denegación le ofrecía unas tools que no podía alcanzar), y **listar la RAÍZ se
  permite**: `rutaVirtualDeEscritura` la descarta porque no es un fichero que escribir, y eso es
  cierto para escribir y falso para mirar.
- **Motores externos**: `claude-code` (`agent/subagentes/subagenteExterno.ts`) **escribe, y cada escritura
  pasa por una autorización** — `canUseTool` es asíncrono y corre en nuestro proceso, así que se
  espera ahí, **sin `interrupt()` y sin reejecutar el nodo**. `decisionDeTool`, en este orden:
  **TRES listas** de tools (lectura / escritura / denegadas, y lo desconocido denegado), el papel
  del `.md`, las **guardas de RUTA reaplicadas** y la política. Dos listas no bastaban: era
  `permitirEscritura || esDeLectura`, o sea que conceder escritura concedía `Bash`. Escribir son
  **solo `Write` y `Edit`**: las únicas cuyos argumentos encajan en `cambioDe()`, o sea de las que
  se puede componer el diff que hay que mirar. `Bash`, `WebFetch` y `WebSearch` se deniegan: los
  dos últimos no escriben, pero sacan el proyecto de la máquina.
- **Las guardas de ruta hay que REAPLICARLAS** (`agent/subagentes/escrituraExterna.ts`): el `file_path` del
  hijo es ABSOLUTO y va al disco directo, así que `permisosDe`, el `virtualMode`, las vistas
  aplanadas y las guardas de artefactos y descargas no lo alcanzan. Las MISMAS funciones sobre la
  ruta virtual, y **dos veces** —texto y `realpath`— como en `arbolDeProyecto.ts`. Del destino se
  canonicaliza él si existe y su PADRE si no. Lo que no se puede comprobar se deniega.
- **La política es el `pedirAprobacion` que YA existía**, traducido
  (`escrituraExterna.ts#politicaDeAprobacionExterna`, `PoliticaDeEscrituraExterna` en
  `core/ports.ts`, fail-closed por TIPO como `core/cloudstudio.ts#PoliticaDeAprobacion`): la
  INTERACTIVA de las tres pieles y la AUTÓNOMA de una tarea de fondo. Sin `pedirAprobacion` no
  hay política y no se escribe; una política que lanza es un NO, y el `catch` va en
  `decisionDeTool` y no en el envoltorio de `correr`, que ningún test alcanza.
- **La denegación de verdad vive en un hook `PreToolUse`, no en `canUseTool`**: el hook contesta
  las TRES clases —`allow` para leer (ruta ya comprobada), `deny` para lo que no está en las
  listas, `ask` para escribir— y no deja ninguna sin decidir. Ningún valor del `permissionMode` es
  seguro por suposición: `dontAsk` podría denegar la escritura antes del callback y dejar la
  función muerta con todo en verde. Se usa `default`, el único donde el `ask` del hook llega al
  callback. `canUseTool` conserva las MISMAS comprobaciones como segunda llave.
- **`settingSources: ["user"]`**: por omisión se carga el `.claude/settings.json` **del
  proyecto**, que viene de CloudStudio. El coste es que el hijo no carga el `CLAUDE.md` del
  proyecto.
- **LEER también lleva guarda de ruta, y ese agujero ya estaba vivo**: la lista blanca permitía
  `Read` a secas sin mirar la ruta — `.env`, `.git`, `.xonecode` (con el `checkpoint.sqlite`) y
  cualquier fichero de FUERA del proyecto. Se deniegan esas y las vistas aplanadas; `/skills/`,
  `/adjuntos/` y un artefacto mal puesto SÍ se leen, porque leerlos es su razón de ser.
  **`Glob` y `Grep` llevan `path` OPCIONAL, y ausente es la raíz.** **Límite declarado**: un
  `Grep` sobre la raíz puede devolver líneas de un fichero denegado — `canUseTool` no filtra su
  salida; cerrarlo pide un `PostToolUse`, que no está puesto.
- Un `.md` con `soloLectura: false` se acepta ya en los TRES motores, y las guardas se levantaron
  **con** su cableado, no antes. Se comprueba `disponible()` antes de montarlo.
- **En Codex la palanca de la escritura es el `approvalPolicy`, no el `sandbox`**
  (`agent/subagentes/subagenteCodex.ts`, `agent/subagentes/escrituraDeCodex.ts`). El sandbox se queda en **`read-only`
  SIEMPRE** —también con la escritura concedida— y lo que abre `permitirEscritura` es
  `approvalPolicy: never → on-request`: la denegación la sigue poniendo la caja del SO y cada
  escritura llega como una petición que contestamos. Es el mismo papel que el `ask` del hook
  `PreToolUse`.
- **Lo que se pregunta y lo que se decide llegan en mensajes distintos.**
  `item/fileChange/requestApproval` trae solo un `itemId`; los cambios vinieron antes en el
  `item/started` de ese id, de ahí el registro de items. Su `id` empieza en **0** y comparte
  espacio con los nuestros, así que las peticiones del servidor (id **y** method) se atienden
  ANTES que nuestras respuestas. Un `itemId` del que no consta item es `decline`: sin diff no hay
  decisión.
- **Un item puede traer VARIOS ficheros y se contesta con UNA decisión**, así que
  `PoliticaDeEscrituraExterna` toma una LISTA y concede solo si **todas** vienen aprobadas.
  Claude Code pasa la suya de un elemento.
- **Las guardas de ruta son las MISMAS** (`veredictoDeRuta`, reaplicada sobre el `path`
  absoluto): no hay una segunda copia, porque un segundo sitio donde decidir sobre una ruta es un
  segundo sitio donde el fail-closed puede dejar de estarlo. **`delete` y `move_path` se
  deniegan**: `cambioDe` no sabe componer su diff, y un renombrado son dos destinos que guardar.
- **Los otros huecos**: un `item/commandExecution/requestApproval` se deniega SIEMPRE (es el
  análogo de `Bash`: un `cat > fichero` escribe el proyecto entero y no hay diff que mirar), una
  elicitación de MCP se declina por su campo `action`, y **lo que no se sabe decir que no se
  ABORTA** — `item/tool/requestUserInput` no tiene «no» en su esquema, ni
  `item/permissions/requestApproval`. Nunca `acceptForSession` ni `grantRoot`, que son
  pre-aprobaciones de sesión. Y una petición sin contestar deja a codex bloqueado hasta que el
  tope lo mate.
- **El tope del motor externo (`TOPE_MS` en Codex y en OpenCode, 10 min) se PARA mientras una
  aprobación está delante de alguien**: mide «codex no contesta», y el rato que tarda una persona
  en mirar un diff no es eso.
- El resto del protocolo: `codex app-server --stdio` con JSON por línea; la respuesta final es el
  `item/completed` cuyo item es un `agentMessage` de fase `final_answer`. El hijo es el Codex DEL
  USUARIO, con sus MCP y sus hooks: xonecode no los filtra.
- **OpenCode es el TERCER motor, y habla por ACP** (`agent/subagentes/subagenteOpencode.ts`,
  `agent/subagentes/escrituraDeOpencode.ts`). De sus tres superficies —`run --format json`, `serve` y
  `acp`— se usa ACP: JSON-RPC 2.0 por línea sobre stdio, el mismo molde que Codex, y la única
  con portón de permiso por stdio.
- **Su petición trae TODO en un solo mensaje**: `session/request_permission` lleva
  `toolCall.locations[].path` y `content:[{type:"diff", path, oldText, newText}]`, así que
  **`oldText`/`newText` entran directos en `core/diff.ts#diffDeLineas`** — ni registro de items
  ni parser de hunks. Se contesta `once` o `reject`, y **`always` no se manda nunca**: es la
  pre-aprobación de sesión, como `acceptForSession` y `grantRoot` en Codex.
- **El bucle de guardas y política es UNO y lo comparten los dos motores de petición**
  (`escrituraExterna.ts#veredictoDeEscriturasExternas` y `#decisionDeEscrituraExterna`). Escribirlo
  una vez por motor sería un segundo y un tercer sitio donde el fail-closed puede dejar de
  estarlo, que es la única forma en la que estas guardas se han roto nunca.
- **TRES puertas por las que el proyecto podía mandar sobre opencode** —un `opencode.json` del
  proyecto, un plugin del proyecto (`.opencode/plugin/*.ts`, que ejecuta código arbitrario) y la
  configuración global del usuario— **se cierran con `OPENCODE_CONFIG_DIR` apuntando a una
  carpeta NUESTRA** (`~/.xonecode/opencode`, que pasa a ser «la global» y por eso gana) **más
  `OPENCODE_DISABLE_PROJECT_CONFIG=1`**. Las credenciales siguen resolviendo (su `auth.json` vive
  en el directorio de DATOS) y la configuración se REESCRIBE en cada arranque.
- **En OpenCode la LECTURA se guarda por PATRÓN, no por código**: su permiso de `kind: "read"`
  llega sin ruta (`locations: []`, `rawInput: {}`), y la ruta solo aparece después, cuando ya se
  concedió. Queda entre los otros dos: mejor que Codex y peor que Claude Code. **Las vistas
  aplanadas se enumeran UNA A UNA** en esa lista, porque «un `.xml` con un `.xne` al lado» no se
  puede escribir como patrón.
- **`bash` no se deniega: se le QUITA la tool** («No tengo un tool de shell en este entorno»).
  Con `webfetch`, `websearch`, `external_directory`, `task` y `question` denegados.
- **`fs/write_text_file` NO es la escritura**: es un aviso, no un portón. El único portón es el
  permiso.
- **Una tool que acaba en `failed` no se anuncia**: se apunta en `in_progress` (el `completed`
  trae `locations: null` y la ruta dentro del `title`) y la línea sale al cerrarse bien.
- **Una respuesta vacía tras un rechazo no es un fallo ni silencio**: se dice lo que pasó con voz
  del harness y con cuántas escrituras se rechazaron, en vez de devolver `""` —que pasaría por
  «no tenía nada que decir»— o de tumbar un turno correcto.
- ACP tiene **`session/cancel`**, que se manda antes de matar al hijo: es la cancelación que
  Codex no tiene.
- **Límite declarado, y es el que queda abierto: LEER no tiene costura en Codex.** Lee por la
  shell del sandbox, que en `read-only` no pide permiso a nadie, así que `.env` y `.xonecode` se
  le pueden leer — el agujero que en Claude Code cierra `veredictoDeLectura`. El único asidero
  medido sería `approvalPolicy: "untrusted"`, que pregunta por cada comando y es otro diseño.
- **Y en una tarea de FONDO no se le pregunta a nadie, sin tocar nada de esto**: la política es la
  misma (`PoliticaDeEscrituraExterna`), y la que monta una tarea es la AUTÓNOMA de
  `consolaDeTarea.aprobacionesTui`. Por eso la escritura de fondo NO se hizo con
  `workspace-write`: así las guardas de ruta siguen enteras, que es justo lo que `core/tareas.ts`
  exige.

### El segundo motor: TrueForge (rama `xonecode-trueforge`)

`core/motor.ts`, `agent/motores/trueforge/`, `docs/VARIANTE-TRUEFORGE-HARNESS.md`. **Se elige por
configuración y no se ve** (`"motor"` en `config.json`, `XONECODE_MOTOR`; omisión `deepagents`), y
**la elección vive en UN punto, `abrirSesionReal`**, por el que pasan la web, el terminal, `run`, el
banco y los evals. Una sesión guarda en el índice el motor con el que nació: la memoria de uno no la
continúa el otro. Cumple el mismo `SesionReal`, así que ninguna piel sabe cuál corre. Tres reglas:
**el modelo es NUESTRO** (un `ILLM` sobre el de LangChain, nunca su `VercelAILLM`, que perdería el
`user_id`, el eco y el esfuerzo); **las tools delegan en `backendDeAgente`** y reevalúan las reglas de
`permisosDe`, que en deepagents son middleware y aquí nadie aplicaría; y **`core/` no importa
`@truefoundry/` ni `winston`** (`imports.test.ts`). **Y fuera de `core/` solo lo importa UN fichero**,
`agent/motores/trueforge/trueforge.ts` (`frontera.test.ts`): la librería es 0.x fijada exacta, y subirla se revisa
ahí; lo que solo está en rutas profundas —dos tipos de los fragmentos— vive separado dentro, y el trazado
mudo es nuestro con `satisfies` contra los tipos públicos. **El reparto es el de deepagents**: el raíz es el
orquestador de solo lectura y sin skills, cada especialista sale de su `.md`, y **la aprobación de un
hijo se devuelve a SU `thread_id`** (a `main` la librería la rechaza). **Las tools propias no se
reescriben: se ADAPTAN** (`toolsPropias.ts`, esquema de la tool y su `invoke`), con el mismo reparto —
`xone_navegacion` a todos, el orquestador incluido—. **El verificador y su reparación también**, y el juez del turno y el crítico de pantalla con los mismos puertos (el juez contra el ENCARGO, que en la respuesta a una pregunta es el que la provocó), con
las reglas SACADAS del cierre de deepagents a `agent/turno/verificacion.ts` (reparto de hallazgos,
huella de errores, qué cuenta como fichero del proyecto): las dos copias eran justo lo que no puede
divergir sin que se note. **La memoria en disco es la FOTO del raíz** (`memoriaTrueforge.ts`,
`AgentThread.toSnapshot()`, 0600, en la carpeta de la sesión) y **no** la capa `agent-session` de la
librería, que trae un segundo registro de sesiones y cuya factoría pisa el prompt del hijo. Se guarda
al final de cada turno SANEADA —el `OpenToolCallCloser` de TrueForge se salta las `create_sub_agent`
colgadas—, y quien pregunta si una sesión tiene memoria mira las dos (`agent/sesiones/memoriaDeHilo.ts`).
**El prompt de un hijo va en su prompt de SISTEMA por `instructionBuilders`**: la librería ignora el
`instruction` de un hijo. **El raíz puede PREGUNTAR** (`ask_user_question`, solo él): la pregunta cierra el turno en el chat y el mensaje siguiente vuelve como `user.tool_response` a su hilo. **Y solo se compacta el raíz**: en un hijo, medido con la traza, resumir un encargo corto y ya cacheado costaba más que reenviarlo.

### La aprobación

- **Fail-closed: lo que no se entiende es RECHAZO** (`cli/aprobar.ts`, `vendor/hitl.ts`). El Enter
  a secas aprueba solo con un TTY de verdad detrás; una entrada agotada degrada la pregunta a no
  interactiva, donde la cadena vacía rechaza y el prompt enseña `[s/N]`. Tope de
  `MAX_APPROVAL_ROUNDS = 5` rondas por turno.
- **El modal de la TUI es fail-closed POR TECLA** (`cli/tui/aprobarTui.tsx`): solo `s`/`S`
  aprueba; `n`, Enter, Escape, Ctrl-C y desmontar sin responder son rechazo.
- **La FORMA de una pregunta viaja CON ella, y no se adivina del enunciado**
  (`DecisionDeConsola`, `cli/aprobar.ts`): `Consola.preguntar` lleva un segundo parámetro
  OPCIONAL con las LÍNEAS de lo que se decide, y con él puesto la piel pinta el plan y dos
  botones (Aceptar / Cancelar) en vez de un campo de texto. El `[s/N]` es SINTAXIS: deducir de
  ahí que la respuesta es sí o no se rompe en las DOS direcciones —un editor donde hacía falta
  decidir, y dos botones sobre una pregunta abierta— y sin avisar en ninguna. Es opcional a
  propósito: una implementación con menos parámetros sigue asignándose a `Preguntar`, así que
  stdio, la TUI, la consola de una tarea y los dobles de los tests no cambian de una línea.
  **Y el enunciado viaja SIN la pista de tecleo**: `PISTA_DE_DECISION` la añade la piel que
  tiene teclado —stdio y la TUI—, porque en la tarjeta no hay campo donde escribirla y enseñarla
  delante de dos botones manda a teclear donde no hay dónde. Se decide por `decision`, que es un
  dato; buscar un `[s/N]` dentro del texto sería leer la sintaxis que la propia piel acaba de
  escribir, y esa pista cambia con el entorno (`[S/n]` con TTY, `[s/N]` sin él) mientras la
  pregunta no. **Cada línea del plan dice qué le PASA, también como dato** (`LineaDelPlan.cambio`):
  `nuevo`, `modificado` o `borrado`, AUSENTE en la cabecera porque no habla de ningún fichero, y
  el color de cada una sale de ahí —nunca del `+`/`~`/`-` del texto, que es sintaxis igual que el
  `[s/N]`—. La clase ya se calculaba en `core/planDeSubida.ts` y se tiraba antes del cable; ahora
  viaja en `OperacionDeSubida.clase`, y el `tipo: "borrado"` no la repite porque su `tipo` ya lo
  dice.
  **En el navegador la tarjeta NO es un `<form>`** —sin campo no hay envío por defecto, así que
  el Enter no autoriza una subida— y contesta `"s"`/`"n"`, el vocabulario que `interpretAnswer`
  ya sabe leer: no se inventa uno nuevo que solo existiría ahí. **La AUSENCIA se conserva de
  punta a punta** (`decision === undefined` no emite el campo, no lo guarda el store y devuelve
  el editor), mientras que un plan sin líneas sigue siendo una decisión: la forma es la FORMA,
  no el contenido. Y el campo pasa por el `case` del store, que es lista blanca — el patrón de
  siempre, y aquí el síntoma es la pantalla de ANTES con todo en verde.
  **Y esa tarjeta es un DIÁLOGO, no un renglón del hilo** (`Pregunta.tsx`, la MISMA puerta que
  `Aprobacion`: portal, `role="dialog"`, velo centrado con `place-items: center`). Como línea de
  la columna del chat caía en el fondo, pegada al compositor —la columna la reparte el
  transcript, que es lo elástico—, mientras que los botones que la provocan están arriba, en la
  banda de la sincronización. Centrarla EN su sitio no era una opción: moverla al medio de una
  columna flex es empujar al transcript. Fail-closed, con una diferencia deliberada con la
  aprobación: solo «Aceptar» autoriza, `Escape` y el clic en el velo RECHAZAN, y **desmontar no
  contesta nada** —allí sí es un rechazo, porque allí quien desmonta es quien montó la
  pregunta—; lo que quede sin contestar lo salda el plazo del servidor
  (`MS_DE_ESPERA_POR_OMISION`, 10 min) con cadena vacía, que ya es un rechazo. El test que lo
  fija mira el PORTAL y no el CSS —el diálogo está en `document.body` y fuera del contenedor del
  test—, porque en jsdom no hay layout que medir.
- **La única grieta es el MODO DE ESCRITURA, y vive en la SESIÓN**
  (`core/modoDeEscritura.ts`, comando `/aprobacion`, pastilla del compositor): `supervisado`
  —cada escritura con su diff— o `autonomo` —se aplican solas—. Antes era un ajuste por RUTA
  en `settings.json` que se ponía una vez y quedaba puesto para siempre; se retiró entero, y
  con él la condición que lo PROHIBÍA en un proyecto conectado a CloudStudio. Lo que queda:
  ausente es supervisado (de esto hay que decidir en cada escritura, así que el hueco se
  resuelve por el lado que enseña el diff); **hace falta alguien delante**, calculado como
  `interactivo && !eof()` igual que `pedirDecisiones`, así que una pestaña que se cierra a
  mitad de turno devuelve la escritura al camino de aprobación; se pregunta en cada RONDA y
  no al abrir; se DICE dos veces (aviso por turno con los NOMBRES, y `alta.modoDeEscritura`);
  y **el mismo predicado alcanza a los motores externos** —si no, el modo gobernaría la mitad
  y el hijo seguiría parando en cada fichero—. **Gobierna las escrituras LOCALES y nada
  más**: `/sync subir` conserva su plan y su aprobación fail-closed en los dos modos, y las
  guardas de RUTA no se tocan. El tope de rondas de la consola es el MISMO 20 que el de una
  tarea (`TOPE_DE_RONDAS_DE_CONSOLA`) y por la misma medida: los cinco de
  `MAX_APPROVAL_ROUNDS` se dimensionaron para un modelo que insiste, y lo que cortan es un
  trabajo legítimo a la mitad. Sin nadie delante se queda el cinco, que ahí sí frena un bucle
  que nadie puede parar.
  **Y lo que `/aprobacion` EXPLICA lo decide el destino, no la línea** (`Consola.modoALaVista`,
  el molde de `anotarSincronizacion?`): donde el modo está siempre a la vista —la web, con su
  pastilla y su nota— sale una línea, y donde no lo está —el terminal— salen los tres
  detalles, que ahí son lo único que los cuenta. Una bandera en la línea decidiría por texto
  lo que es una propiedad de la pantalla.
- El origen del interrupt se dice UNA vez: `aPendiente` (`agent/turno/interrupts.ts`) quita el prefijo
  `[perfil]` de la descripción porque el dato ya viaja en `origen`.

### El verificador, en el turno

`agent/turno/turnoReal.ts#conVerificacion`. Cinco reglas:

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

`agent/turno/instantanea.ts`: la foto del ANTES es un árbol de git en un `GIT_INDEX_FILE` privado —sin
commits, sin tocar el índice del usuario— y se toma **por turno**, no por sesión.

### Las tareas en background

`core/tareas.ts`, `agent/tareas/tareasEnDisco.ts`, `web/servidor/corredorDeTareas.ts`,
`consolaDeTarea.ts`, `core/entrega.ts`, `agent/tareas/juezDeTarea.ts`. Un encargo por proyecto que corre
solo y escribe sin pedir aprobación. Cuatro estados; `requiere-atencion` significa **esperando
feedback del desarrollador** y no es terminal.

- **La autorización es el ACTO DE CREAR LA TAREA**, no un interruptor, y **no se reutiliza el
  modo de escritura de una sesión** (que significa «el humano que está aquí ha decidido no
  pulsar», y de hecho exige que lo haya).
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
- **La consola web DICE con qué código corre** (`core/version.ts` + `agent/config/versionEnDisco.ts`,
  opción `version`), antes que la URL: `xonecode 0.5.0 · 85219d4 + cambios sin commitear`.
  Existe por una asimetría que hay que tener presente: **el cliente se lee del DISCO en cada
  petición** (`servidor.ts`, `readFileSync`), así que reconstruirlo se ve recargando la página,
  mientras que el SERVIDOR es el proceso y sus cambios solo entran parándolo y arrancándolo. El
  árbol SUCIO se dice; y no poder mirarlo no es «limpio». La lectura entra por parámetro: toca
  disco y lanza `git`, y los tests llaman a esa función entera.
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
  comparte; la sintaxis no se exporta.**
- **Y en el navegador «/» es PROSA, no un comando** (`cli/consola.ts#LineaDeConsola`). Aquí cada
  acción tiene su botón, así que un «/» tecleado no abre nada: una prosa que empiece por «/» —una
  ruta del proyecto, `/artefactos/informe.html`— va al modelo tal cual. No se puede adivinar
  mirando la cadena, porque por la MISMA cola circulan lo que teclea una persona y lo que pide un
  control de la interfaz, y esa mezcla ERA el bug: teclear «/» ejecutaba una orden. Por eso la
  línea lo DICE (`comoComando`), y una `string` a secas se lee como siempre — comando—, que es lo
  que siguen haciendo stdio, la TUI, la consola de una tarea y los dobles de los tests.
- **Ajustes tiene UNA pestaña por entorno registrado, y abrir una NO cambia el entorno
  activo** (`Ajustes.tsx`, `accion: "proyectos"` → `atenderProyectosDeEntorno`). Elegir
  proyectos es MIRAR; mudar el activo (`accion: "activo"`) le cambiaría la barra a quien
  trabaja en otro servidor. La lista de cada entorno se pide al abrir su pestaña y solo si
  falta —el activo ya la trae en el `alta`—, **sin caché**, y el que falla lleva su `error`
  sin tumbar a los demás. Lo marcado se guarda **por entorno** (`elegidosPorEntorno`). El
  efecto depende de los DOS CAMPOS de esa pestaña y **no del record** (que con su omisión `{}`
  es un objeto nuevo por render), y el cableado de los dos sentidos tiene test propio porque
  el prop es opcional y `tsc` no lo caza.
- **Un entorno se registra SOLO si conecta, y se puede QUITAR** (`arranque.ts#atenderAlta`,
  `motivoParaNoOlvidarEntorno`). Registrar escribe antes de hablar con el servidor, así que uno
  NUEVO cuyo `proyectosDe` falla se deshace y el aviso lo dice —sin borrarle las credenciales,
  que pueden ser el juego legado adoptado—; uno que ya estaba no se quita porque hoy no conteste.
  Quitar lo decide el SERVIDOR (proyecto suyo abierto o tarea sin terminar = no) y contesta **409
  con el motivo** en la propia respuesta, porque `informar` no llega al navegador desde el
  vestíbulo. Las copias bajadas se QUEDAN salvo con la casilla **«borrar también las copias»,
  DESMARCADA siempre al abrir** (`borrarCopias`, `settingsEnDisco.ts#borrarCopiasDeEntorno`, con la
  barrera de ruta por texto y `realpath`), y el botón rojo no se activa hasta **escribir el nombre
  del entorno**: dos clics rápidos en el mismo sitio no pueden quitar nada. El recuento de copias
  viaja en `registrados[].copias` —nombrado en la lista blanca del store—. La opción del vestíbulo
  es obligatoria.
- **Una copia «bajada» es `config.json` Y `sync.json`** (`vestibulo.ts#esProyectoEnDisco`): el alta
  escribe el `config.json` ANTES de bajar, y con solo él una descarga que fallaba dejaba una
  carpeta vacía que la barra daba por bajada (medido: Bequikly y Conecta2). Y **un fallo de
  descarga se APUNTA** en el `fallos.jsonl` del proyecto —el alta y `/sync`—, con qué se bajaba.
- **La clave de API viaja por el ÚNICO mensaje del cable que la lleva** (`leerSecreto`), y se
  PRUEBA antes de escribirse: `motivoDeClaveInaceptable` (`core/config.ts`) criba de balde, y
  luego el catálogo con `aplicarCredencialAlProceso` — **solo si el proveedor contesta** se
  escribe en `auth.json`. La clave a medias vive en una variable de la VUELTA del lazo, no del
  lazo. Trampa: `guardarCredencial` escribe TAMBIÉN en `process.env`, a propósito.
- **Los dólares del asistente se ESCAPAN antes de pintarlos** (`apps/web/src/protegerDolares.ts`):
  el `MarkdownText` monta matemáticas con dólar simple y `$http` es un objeto real de XOne. Fuera
  de código solo; el botón de copiar y las Trazas llevan el original. `streaming` apaga shiki, así
  que solo va puesto mientras el servidor dice que hay turno en vuelo.
- **Un ARTEFACTO pertenece al tramo de trabajo, pero no se pliega con él** (`Chat.tsx`,
  `ES_PULSO`). Fuera del conjunto caía en la rama de conversación, que CIERRA el tramo
  abierto: medido en pantalla, la secuencia `P5 A P5 A P8 A P1 A P2` — cinco tarjetas
  alternando con cinco bloques «Trabajo del agente», cuatro de ellos de uno o dos pasos. Es
  el mismo fallo que el `continue` de `sincronizacion` evita por el otro lado. Dentro del
  tramo el colapsador no se parte; las tarjetas salen FUERA del `<details>` y agrupadas,
  porque una captura escondida bajo un desplegable es una captura que nadie mira, y **no
  cuentan como pasos** — un artefacto es lo que un paso produjo—. Una IMAGEN se enseña como
  MINIATURA en fila y sin texto (un `<img>` a la ruta HTTP, nunca marcado inyectado), que es
  lo único del hilo que se entiende sin abrir nada; lo demás conserva su tarjeta de una
  línea. **Y la tarjeta no repite la REGLA** —«no es del proyecto, no entra en git»—: eso es
  lo mismo para todas y vive una vez al pie de la pestaña Artefactos, no dieciséis veces en
  el hilo.
- **El HUECO entre actos dice si sigue el mismo turno o empieza otro, y se declara con la
  VARIABLE de la hoja copiada** (`Chat.module.css`, `.flujo` / `.inicioDeTurno`).
  `ChatView.module.css` separa a los hijos de `.column` con
  `margin-top: var(--dsh-chat-flow-gap, 16px)` y ese margen lo lleva el HIJO, así que la
  variable se resuelve EN CADA ACTO —medido en vivo— y la jerarquía se declara sin pelear una
  especificidad de (0,7,0) ni tocar una hoja de la librería. **Dos valores y no tres**: dentro
  de un turno, y al empezar otro (lo lleva el acto del USUARIO, que es lo que abre uno). Y
  **ningún margen accidental**: el globo del usuario es un `<p>` y traía 14 px propios, o sea
  que ese hueco no lo decidía nadie. **El aire gordo no estaba ahí**: medido sobre una
  conversación real, el hueco entre actos era la parte PEQUEÑA y el resto vivía DENTRO de los
  mensajes — el margen del primer y último párrafo contra el relleno del globo es aire por
  duplicado, y se anula.
- **Los actos de `sistema` se ven en el chat** (respuestas a comandos y avisos de honestidad),
  y **se reparten por CLASE, que viaja con el acto y no se deduce del texto** —la misma regla
  que la forma de una pregunta—. Se pliega lo que el harness dice SOBRE el turno: `aviso` (la
  bitácora, el juez, el crítico de pantalla) bajo «Verificaciones» y `permiso` (una escritura
  aplicada sin preguntar) bajo «Permisos», cada clase en SU tramo porque «qué se autorizó» y
  «qué falló» son dos preguntas. **Ausente sigue suelto y a la vista, y eso es la decisión**:
  una respuesta a un comando es el acuse de un botón que la persona acaba de pulsar, y
  plegarla sería no contestarle — vale también para las sesiones guardadas antes del campo.
  **Lo que se pliega es el párrafo, nunca el hecho de que lo hay**: el resumen dice de qué
  son y cuántos, porque un aviso escondido es justo lo que la bitácora existe para evitar.
  `pausa` emite un acto POR pendiente y no uno con líneas pegadas, o el resumen contaría tres
  escrituras como una. `razonamiento` es su propio evento y su propio acto —`textoDe` lo
  EXCLUYE del texto—. El texto del asistente se enseña mientras llega, a `MS_ENTRE_PARCIALES`
  (80 ms) con el reloj por parámetro, porque cada emisión manda el acto entero.
- **El RESUMEN de contexto es un acto de sistema de clase `resumen`, no una respuesta**
  (`resumenDeContexto.ts#ETIQUETA_DEL_RESUMEN`, `puente.ts`, `pielWeb.ts#resumen`). deepagents
  resume llamando al MISMO modelo en el MISMO nodo, así que sus chunks eran indistinguibles de
  la respuesta y se guardaban como mensaje del asistente. Lo que los separa es una ETIQUETA en
  esa llamada, puesta por dos envoltorios que ABRAZAN al middleware de resumen dentro de
  `resumenConEncargo` —que sigue siendo la única composición—, y el cliente lo pliega como
  «Resumen del contexto», el ÚNICO de los tres plegables que se pinta como markdown (la bandera
  va en `CLASES_DE_SISTEMA`: un aviso con guiones bajos no puede pasar por ahí). El prompt es
  nuestro y en castellano. **Límite declarado**: solo se etiqueta `invoke`; si la librería
  resume un día con `stream`, el resumen vuelve al chat, y el aviso es el test contra ella.
- **Abrir una sesión NO espera al aviso de git** (`MS_DE_TRABAJO_AL_ABRIR`, 2 s). El `finally`
  que apaga el indicador «abriendo…» espera a `anunciarAlta()`, y ésta esperaba SIN PLAZO a
  `trabajoAlAbrir`, detrás del cual hay un `git status --untracked-files=all`. Un aviso cuya
  regla es «avisa, no FRENA» no puede ser lo que frena. Lo que se acota es la ESPERA y no el
  trabajo: la promesa sigue viva y su valor sale en el siguiente anuncio, que llega en los dos
  flancos de cada turno; ausente ya significaba «no consta» en las cuatro capas. Hay test, y
  muere con el mutante — sin plazo, se cuelga igual que la pantalla.
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
  vigila recorriendo TODOS los `.module.css` de `componentes/`), `transparent` incluido. La
  paleta redefine solo los alias con acento; el cian es ACENTO y no sostiene texto. **De una
  maqueta ajena se toma la FORMA, nunca el color** (los ocho mockups de Stitch).
- **El botón de enviar lleva el AZUL de la marca** (`--xonecode-azul` con
  `--xonecode-sobre-azul`: el mismo par que la barra superior), y el cian se queda para su
  hover — ahí puede brillar sin sostener nada. Las pastillas llevan filo cian y el BAÑO de las
  filas de la barra (`--xonecode-fila-hover` en reposo, `--xonecode-fila-elegida` al pasar por
  encima): esos dos tokens ya vienen AJUSTADOS POR TEMA, así que reusarlos evita inventar un
  cian translúcido con un porcentaje fijo. Suaves a propósito: el que se pulsa es el botón.
  Pero **su texto NO**: los tokens de marca no se redefinen por tema y `--xonecode-azul` sobre
  el fondo de noche sería ilegible; los `--dsw-alias-*` sí cambian, y de ahí sale la letra.
  PARAR se queda ROJO —es un estado, no la marca— y hay que repetir su hover porque el mismo
  botón lleva las dos clases; y apagado no lleva color de marca, que un botón inerte pintado
  de azul invita a pulsarlo.
- **La caja del compositor va en TRES BANDAS** (maqueta de Stitch, `code.html`, con nuestra
  paleta): arriba **con qué va a correr** —modelo y esfuerzo en UNA caja con filete entre
  los dos, y el dispositivo al lado—, en medio el campo a todo el ancho, y abajo **qué pasa
  con lo que escribas y mandarlo** —el modo de escritura a la izquierda, el gasto y el botón
  a la derecha—. El filete separa dos preguntas distintas, no decora: por eso el relleno
  vive en cada banda y no en la tarjeta, o no llegaría a los bordes. **Esto se comprueba en
  el NAVEGADOR** —`capturas/` está en el `.gitignore` para eso— y no con tests.
  **Y en REPOSO la banda de arriba NO ESTÁ y el campo es bajo**: la caja llegó a 216 px con
  la ayuda de teclas, y eso son 216 px de conversación que no se ven. Plegada mide 110. Se
  pliega **desmontando** —un elemento invisible sigue siendo tabulable— y **lo decide
  `:focus-within` en CSS, no un `onBlur` en React**: con estado de React, al tabular desde el
  campo el navegador desmontaría la pastilla ANTES de que el foco llegara y lo dejaría en el
  `<body>`; con `:focus-within` el campo todavía tiene el foco cuando se calcula el estilo.
  Un borrador a medias la mantiene abierta (`data-con-texto`). **Lo que NO se pliega es la
  banda de abajo**: el modo dice si lo próximo se aplicará solo, y ese estado tiene que
  leerse sin hacer nada.
  **El dispositivo va al otro extremo de la banda**, con envoltorio propio y no con
  `:last-child`: sin manejador de dispositivo el último hijo sería el conjunto, y el `auto`
  lo mandaría a él. **Y el filo de la caja lleva EL AZUL de la marca** con una sombra corta,
  con rama de noche que lo aclara —los tokens de marca no se redefinen por tema y el navy
  sobre el fondo oscuro es un filo que no está—. **Trampa**: un `color-mix` que arrastre un
  alias del TEMA no puede vivir en el `:root` de `marca.css`, donde ese alias no existe
  todavía: la mezcla queda inválida y **se lleva el atajo `border` entero** (medido,
  `borderWidth: 0px`, con todo en verde).
  **Es una decisión REVISITADA**: el dispositivo ya estuvo arriba siguiendo una maqueta y
  bajó mirando la pantalla, «un chip solo no era una fila, era un renglón». Lo que cambió es
  el reparto — arriba van tres controles y abajo quedan otros tres, así que ninguna banda es
  un renglón huérfano. **Y el conjunto modelo+esfuerzo le da forma a una frase que ya estaba
  en el código**: «el esfuerzo no es una elección independiente, es un ajuste DE ese modelo».
  Su clase vive en la hoja de las pastillas y no en la del compositor, porque el nombre de un
  módulo CSS va HASHEADO — y ojo, **dos clases con el mismo nombre en una hoja no chocan: la
  segunda pisa a la primera en silencio** (medido: el conjunto salía en columna por un
  `.grupo` que ya existía más abajo).
  El hueco de la banda de abajo se lo come UN `margin-left: auto`, el del bloque que agrupa
  el gasto y el botón. Uno y no uno por pieza porque **los márgenes automáticos se REPARTEN
  el hueco libre**: con dos, el contador se quedaba flotando a mitad de fila. Ese bloque
  envuelve y el gasto se retira cuando la fila no da para los dos, que el botón no puede
  quedarse fuera de la tarjeta: la acción es lo único que no se calla. El gasto es una
  pastilla del par `state-business-*` —el MISMO de la pastilla de «compartido»—, con las
  cifras en negrita: `bg-layer-2` no sirve de fondo aquí, que en el tema claro es blanco
  sobre blanco. Y no hay chip de «Contexto» aunque la maqueta lo pinte — ese concepto no
  existe aquí, y lo más parecido (el proyecto) ya se lee en la miga.
- **El MODO se elige con un CONMUTADOR de dos mitades, no con un menú**
  (`SelectorDeModo.tsx`, hoja propia porque ya no es una pastilla con menú). Con dos valores
  y ninguno oculto el estado se lee sin abrir nada, y aquí el estado es «¿lo próximo que
  escriba se aplicará solo?». Tres cosas que no son de forma: **cada mitad DICE lo que hace
  en su `title`** —la maqueta lo ponía en un tooltip de hover, que no alcanzan ni el teclado
  ni el táctil—, **`aria-pressed` va en las DOS** (es lo que las convierte en un conmutador;
  el color no le llega a quien escucha la página), y **pulsar la que ya está puesta no manda
  nada**. Los rótulos NO se retiran en estrecho: son media razón de ser del control, y la
  fila ya tiene su red con `flex-wrap`.
- **Los iconos salen del `code.html` de la maqueta, copiados** (`IconosDelCompositor.tsx`):
  aquí no se trae nada de un CDN. Pintan con `currentColor` y van `aria-hidden`, porque al
  lado siempre hay texto que dice lo mismo. **El rayo del selector de modelo NO se copió**:
  en la maqueta está a la vez en el modelo y en «Autónomo», que no tienen nada que ver, y
  reusarlo enseñaría a no mirarlo.
- **El compositor DICE sus teclas, y solo las que son ciertas** (`Enter` envía, `Shift+Enter`
  salta de línea), comprobadas en el mismo test que las escribe: una ayuda que se queda
  vieja es peor que no tenerla. Eran TRES hasta que los comandos se fueron del navegador.
  **Van en la SEGUNDA LÍNEA del placeholder**, no en un párrafo bajo la tarjeta: ese renglón
  es transcript, que es lo único elástico de la columna. Caben porque la caja en reposo mide
  dos líneas, y desde ahí se ocultan con la caja por construcción en vez de por acordarse.
  **Precio declarado**: un placeholder se va en cuanto escribes, o sea que la ayuda no está
  mientras redactas un párrafo largo — que es cuando saber que Enter envía más importa. El
  sitio sin coste, si se nota, es el hueco libre de la banda de abajo. La primera línea
  nombra lo que el harness sabe hacer, y solo eso: prometer ahí lo que no está cableado es
  el botón muerto de siempre con la petición de una persona detrás.
- **Nada se trae de un CDN** (tipografías empaquetadas, iconos copiados): esta consola escucha en
  loopback y declara un modo offline de primera clase.
- **Una consulta de contenedor declara su contenedor en la MISMA hoja** (`Barra.test.tsx` lo exige
  recorriendo los `.module.css`). Sin un ancestro con `container-type` no dispara JAMÁS y no
  avisa: la regla se queda escrita y muerta, que es el patrón de fallo de esta arquitectura en
  versión de CSS, y jsdom no lo ve porque no hace layout ni cascada. Y como el nombre de un módulo
  CSS va HASHEADO, no se puede retirar desde un fichero el elemento de otro: al que vive en otro
  componente se le pone un envoltorio con clase propia del módulo que consulta. El ancho que se
  consulta suele ser el de un panel que pone JS —la barra lateral, el renglón del compositor—, y
  por eso esto es contenedor y no `@media`. **Y no puede estilar a su PROPIO contenedor**, que es
  el mismo test y la otra mitad de la regla: una consulta solo alcanza a los DESCENDIENTES del
  elemento que declara `container-type`, así que una regla suya con el selector del contenedor no
  se aplica nunca — y el resto del bloque SÍ, con lo que queda medio encuadre en vez de ninguno.
  El arreglo es un envoltorio que declare el contenedor, con la caja de antes como hija.
- **El encuadre de las TRES columnas lo decide `core`… del cliente, no una hoja**
  (`apps/web/src/repartoDeColumnas.ts`, puro y con test): la barra, la conversación y el panel de
  vistas compiten por el mismo ancho, y quien se queda fuera se DESMONTA — eso no lo sabe hacer un
  `@media`, y además los anchos de la barra y del panel los pone JS. Tres salidas y **una sola
  concesión automática**: si no caben las tres pero sí el chat y el panel, la barra se pliega SOLA
  para hacerle sitio, transitoriamente y **sin tocar la preferencia del navegador** — si se
  guardara, estrechar la ventana una vez la dejaría plegada para siempre. Y **pedir la barra de
  vuelta cierra el panel**, en vez de no hacer nada: el usuario no la plegó, así que su preferencia
  ya dice «abierta» y volver a ponerla ahí sería un botón muerto. **Con el panel cerrado no hay
  concesión ninguna**, justamente por eso. La tercera columna no se inventó: `.detailsCol` y su
  tirador llevaban sin usar en la hoja copiada desde el principio.
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
  iframe, así que `SKILLS_VISUALES` (`agent/subagentes/agentesEnDisco.ts`) lo dice desde el prompt y no solo
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
  parche, y cada diff se pide al pulsar su cabecera. Misma regla que el árbol de Ficheros, y por
  el mismo motivo: un diff volcado sin pedirlo deja fuera de la vista la LISTA, que es lo que la
  pestaña contesta. El efecto de `App.tsx` solo OLVIDA lo desplegado cuando el store tira la
  foto, para que las filas abiertas de una sesión no sigan abiertas sobre los ficheros de otra.
- **La sincronización con CloudStudio es la BANDA de arriba de Revisión, no una pestaña** — tuvo
  la suya y se fue de ahí cuando se miró lo que contesta: «cuánto queda por subir» es la misma
  pregunta que contesta Revisión medida contra otra referencia, la rama de la bajada en vez de la
  foto de la sesión. Va como **ranura** (`cloudstudio`) y por eso mismo **se pinta en los SEIS
  estados de Revisión**, incluidos los cinco sin lista: `CloudStudio` mide al MONTARSE, así que un
  `return` temprano no escondería solo la cifra — ni la pediría. Es la razón de que esos `return`
  sean hoy una variable `cuerpo`. Y manda la INTENCIÓN, no la sintaxis (mensaje `sync`): **`estado`
  se MIDE en el servidor** contra la ref de la bajada —la MISMA cuenta que da `/sync estado`,
  `agent/sesiones/gitSync.ts#cambiosPendientes`— y **sin abrir sesión MCP**, porque el número ya está en
  local; **`subir` y `bajar` se ENCOLAN** como `/sync <accion>`, así que salen con el MISMO plan,
  la MISMA guarda de árbol sucio y la MISMA aprobación que el terminal — un segundo camino de
  subida es donde el hueco de política podría reabrirse—. Una acción que no se entiende NO cae en
  `estado`. **`proyecto` y `rama` ausentes no son «cero pendientes»**, y el error de medida no
  lleva la ruta de la raíz (va por el cable). La medida se REHACE al entrar —a diferencia de
  Ficheros y Revisión, porque `/sync` mueve la ref sin que el servidor sepa cuándo acaba— y en el
  flanco de fin de turno si Revisión está delante. **Y la cifra dice DE QUIÉN son los ficheros**
  (`deLaSesion` = `cambiosPendientes` ∩ `cambiosDeSesion`), porque la banda se mide contra la rama
  y la lista de Revisión contra el sello de la sesión: son dos referencias distintas y sin decirlo
  los dos números parecen contradecirse. Va **ausente cuando no se pudo atribuir** —sin sesión, o
  con una sin sello, cuya lista es «desde que abriste» y ahí dentro está el trabajo de cualquiera—
  y **cero es un dato medido**: se atribuyó y ninguno de los pendientes es suyo. No se rellena el
  hueco: una sesión sin sello no es una sesión que no hizo nada.
  **Con la subida al día «Subir» NO se pinta**, y solo con la subida MEDIDA: `pendientes` sale de
  la misma cuenta que decide qué lleva el plan, así que un cero medido es un plan vacío; con la
  cifra ausente o con un `error` de medida el botón SE QUEDA, porque retirarlo afirmaría «no hay
  nada» sobre una pregunta sin contestar —ausente ≠ cero, otra vez, ahora sobre un control—, y la
  dirección segura es la que no esconde. La nota deja de nombrarlo cuando no está. La otra
  dirección se llama **«Actualizar repo local»**, y el aviso de que SOBRESCRIBE va en su `title`
  además de en la nota, en una sola constante: el nombre nuevo dice la DIRECCIÓN y se lee como el
  `git pull` que esa operación no es. La clase sigue siendo `.bajar`, que nombra la ACCIÓN del
  cable y no la etiqueta.
  **Y EL RECORRIDO DE LA OPERACIÓN SE CUENTA EN LA BANDA, NO EN EL HILO** (acto
  `sincronizacion`: `accion`, `cuando` y `lineas`). En el hilo eran renglones de consola cruda
  —el plan con su sangría, el `→ APROBADO`, el recuento— entre dos mensajes de la conversación,
  y encima se PERSISTÍAN en el `.jsonl` y volvían al reabrir: el hilo es la conversación, y una
  operación de git es un suceso del proyecto. Se cuenta abajo, con la acción y la hora por
  cabecera, la más reciente abierta. **Dónde se cuenta es propiedad de la PIEL y no de la
  línea**: el sumidero es un método OPCIONAL del puerto (`anotarSincronizacion?`), con la misma
  asimetría que `fase?`, `razonamiento?` y `notificacion?` — quien no lo implemente (stdio, la
  TUI, la consola de una tarea, los dobles) sigue recibiendo el recorrido por `escribir` **al
  vuelo y byte a byte**, que es lo que debe hacer una consola de terminal, y la tubería sigue
  idéntica. Una bandera en `LineaDeConsola` decidiría por línea lo que es una propiedad del
  destino: la misma `/sync subir` en el terminal DEBE imprimir su recorrido. **Y lo que el
  registro guarda es EXACTAMENTE lo que el terminal habría impreso** —ni un resumen, ni una
  versión maquetada—: solo se le quita el `\n` final (es del scrollback, no del dato) y las
  líneas vacías; recomponer o filtrar una línea por su aspecto sería maquetar por la puerta de
  atrás. La operación se entrega en un `finally` **por un motivo medido**: `crearSincronizador`
  puede lanzar —toca red y disco, y su propio `finally` cierra sesión—, y con las líneas
  acumuladas una excepción se llevaría por delante todo lo ya contado, que en un scrollback
  append-only no se perdía. **El enunciado de una DECISIÓN deja de anotarse** (en la web): con
  `decision` puesta ya viaja en el mensaje `pregunta` y la tarjeta lo pinta como su título, así
  que anotarlo era duplicarlo y era la última línea de sincronización que quedaba en el hilo;
  las preguntas de texto libre y los secretos conservan su copia, que es donde se contestan. El
  registro se pinta en los SEIS estados de Revisión, porque la ranura `cloudstudio` se pinta en
  los seis y un `return` temprano no escondería solo la cifra. **Y lo que NO entra en el registro**:
  el enunciado de la pregunta («¿Subir a CloudStudio?»), que no es una línea de la operación sino
  el argumento de `preguntar` —la cabecera ya dice qué operación fue y el `→ APROBADO` dice cómo
  acabó—, y los dos errores de USO de `/sync`, que no son una operación y son el mismo tipo de
  mensaje que el de cualquier otro comando mal escrito. **Tampoco una subida que la persona CANCELÓ**: no tocó
  el remoto ni movió la ref, y quien la canceló acaba de ver el plan en la tarjeta — cada
  «Cancelar» dejaba un «Subir · hora» en la banda que no contaba nada que hubiera pasado. En el
  terminal el «→ rechazado» se sigue imprimiendo, porque ahí es la respuesta a lo tecleado.

### El workspace: dónde viven las copias locales

`core/settings.ts` (`rutaDeWorkspace`, `dentroDelWorkspace`), `web/servidor/vestibulo.ts`
(`baseDeWorkspacePorOmision`), `core/mudanzaDeWorkspace.ts`, `agent/config/mudanzaEnDisco.ts`.

- **`<workspace>/<entorno>/<proyecto>`, y el workspace es lo ÚNICO configurable**
  (`settings.workspace`, omisión `~/.xonecode/workspace`). El literal `workspace` vivía en
  MEDIO del reparto, y con la base en `~/.xonecode` a secas eso dejaba cada id de entorno de
  HERMANO de `agentes/`, `skills/`, `tareas/` y `auth.json`. Movido a la base, lo que se
  configura ES el workspace y quien elige una carpeta suya no se encuentra un nivel que no
  pidió. **El segmento del ENTORNO se queda**: el mismo nombre de proyecto existe a la vez en
  dos servidores, y sin ese nivel serían la misma carpeta.
- **La base se LEE en cada uso, nunca se captura al arrancar** (`baseDeWorkspace` es una
  función, y también el `base` de `commitDeTurnoCableado`): se cambia desde Ajustes con la
  consola en marcha, así que un valor capturado dejaría el proceso bajando al sitio de antes
  mientras la pantalla enseña el nuevo — y, peor, `dentroDelWorkspace` compararía contra la
  carpeta de antes y los commits por turno se pararían EN SILENCIO. Es la misma regla que el
  modo de escritura y el tope de concurrencia.
- **El reparto viejo se MUDA de una vez al arrancar la web**
  (`arranque.ts#mudarWorkspaceLegadoCableado`, antes del vestíbulo y del corredor de tareas:
  los dos abrirían carpetas que están a punto de moverse). Proyecto a proyecto y no la carpeta
  entera, porque con el workspace ya configurado el destino es el PADRE del origen. **Un
  destino que existe NUNCA se pisa** y se cuenta aparte; **solo lo que se movió de verdad
  reescribe una ruta guardada**: `proyecto.raiz` del índice de tareas — sin eso, una tarea
  pendiente abriría una carpeta que ya no está. Fueron DOS hasta que el modo de escritura se
  mudó a la sesión y su ajuste por ruta se retiró. El husco vacío se retira con `rmdir`, que nunca
  vacía nada, y antes se borra solo la BASURA DEL SO de la lista CERRADA que ya mantiene
  `gitSync.ts`.
- **Cambiar el workspace NO mueve lo que ya está bajado**, y la pantalla lo dice: las copias
  llevan su historia de git, sus sesiones y su checkpoint, y un `renameSync` a otro volumen es
  EXDEV. Lo que cambia es dónde cae lo siguiente.
- **La ruta del workspace es la excepción NOMBRADA a `sinRutas`, y la única del cable**: el
  campo de Ajustes tiene que enseñar la carpeta que hay puesta, y una ruta que no se enseña no
  se puede comprobar ni elegir. Viaja **ENTERA**: se probó abreviada con `~` para que el caso
  normal no llevara el nombre de la cuenta del sistema, y no se sostiene —la cabecera de esa
  misma consola ya saluda por ese nombre—, mientras que el precio era dejar en pantalla una
  ruta que no se lee de un vistazo. El `~` se sigue aceptando al TECLEAR (`expandirConCasa`),
  que es comodidad de entrada. La regla de qué vale (`motivoDeWorkspaceInaceptable`) se aplica
  en el SERVIDOR, y el cliente lleva su copia DECLARADA —como la URL de un entorno— para que el
  no no sea mudo.
- **El selector de carpeta lo abre el SISTEMA, no el navegador** (`core/selectorDeCarpeta.ts`,
  `agent/config/selectorEnMaquina.ts`). Una página no puede devolver una ruta absoluta y no es
  un descuido: `showDirectoryPicker()` da solo el NOMBRE y un `<input webkitdirectory>` da
  rutas RELATIVAS. Un explorador propio servido por nosotros sí podría, y el precio sería que
  el ÁRBOL DE CARPETAS de la máquina empezara a viajar por el cable — una excepción mucho más
  ancha que la de una ruta, para el mismo resultado. Así que lo abre `osascript`/`zenity` donde
  corre la consola y solo cruza la carpeta elegida. **Elegir y guardar son dos actos y dos
  mensajes**: lo que devuelve el diálogo entra en el CAMPO, y guardar sigue siendo pulsar el
  botón. Se contesta 204 en el acto y la carpeta llega por el SSE, porque el diálogo tarda lo
  que tarde una persona; **cancelar se ACUSA igual** o el «Abriendo…» se queda encendido para
  siempre. **Límite declarado**: el diálogo sale en la máquina de la consola, así que por un
  túnel el botón no sirve — por eso el campo de texto es el camino principal y esto un atajo, y
  en un sistema sin selector el botón no se pinta.

### Exportar a PDF

`core/exportacion.ts` (puro), `agent/exportarPdf.ts`, comando `/pdf <ruta>`.

- **Lo hace el HARNESS, no el agente, y eso es la decisión.** Producir un PDF es lo que las
  skills `pdf`/`docx` hacen EJECUTANDO scripts, y a un motor externo no se le concede shell:
  abrirla dejaría a ese hijo reescribir el proyecto sin diff ni aprobación. Y medido sobre una
  máquina real, conceder la shell tampoco habría dado el PDF — esas skills asumen el sandbox
  donde sus dependencias vienen puestas, y ahí no estaba ninguna. El comando lo escribe el
  CÓDIGO, así que no hay prompt que pueda torcerlo.
- **Se imprime con un NAVEGADOR**, buscado en una lista CERRADA de rutas conocidas (todos
  Chromium por dentro: es el que trae `--print-to-pdf`). Su ruta se queda en el host. No
  haberlo se DICE con el remedio, porque no hay forma de adivinar que lo que falta es eso.
- **Que el navegador salga con 0 no significa que haya PDF**, y por eso se comprueba el
  fichero — la misma regla que la instalación de dispositivos. Ese guarda se ganó el sitio
  solo: un flag que parecía inofensivo dejaba de escribir el fichero en silencio.
- **Lo que impide que imprimir EJECUTE algo es una CSP en el documento, no un flag.** Medido
  contra el navegador instalado: ni `--disable-javascript` ni `--blink-settings=scriptEnabled=false`
  desactivan un `<script>`, y el segundo además rompe la impresión. La política corta también
  la RED, que es por donde un documento del proyecto podría avisar de que se está imprimiendo.
  A un `.html` ajeno se le INYECTA, y eso solo puede TENSAR: con varias políticas el navegador
  exige que todas permitan cada carga.
- **El destino lo DERIVA el código del origen** (`rutaDePdf`), nunca se recibe: con un destino
  por parámetro esto sería una forma de escribir cualquier fichero sin pasar por la aprobación.
  Las guardas de ruta son las MISMAS de la pestaña Ficheros, no una copia. Y el HTML intermedio
  se escribe FUERA del proyecto, o entraría en git, en el commit del turno y en la subida.
- **La autorización es teclear el comando**, como crear una tarea: no lo pide el modelo, lo
  pide quien está delante.

### Sesiones, hilos y git

- **El hilo SOBREVIVE al proceso** (`agent/sesiones/checkpointer.ts`, `SqliteSaver` en
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
- **Esto CRECE y no hay poda**. Por eso `.xonecode` se
  saca del índice privado de `instantanea.ts` y `sesionGit.ts` (`sacarXonecodeDelIndice`): en un
  proyecto OFFLINE nadie escribió el `info/exclude` y las refs `refs/xonecode/sesion/*`
  mantendrían esos objetos vivos para siempre. `/nuevo` en la web abre un hilo huérfano y lo DICE.
- **Cada turno COMMITEA lo que dejó** (`agent/sesiones/gitSync.ts#commitDeTurno`): con el índice DE VERDAD
  (hay test de que el árbol queda LIMPIO), sin cambios no se commitea (`git commit` con índice
  vacío sale con error), identidad NUESTRA por `-c`, se ESPERA, va en el `finally`
  **envuelto entero**, y solo `dentroDelWorkspace` (puro, con test) — en la carpeta que abrió una
  persona sería ensuciarle el historial. El mensaje no dice «lo escribió el agente»: `add -A`
  barre todo lo que hubiera cambiado.
- **La basura del SO va a `info/exclude`, NUNCA a `.gitignore`** (`asegurarExclusiones`, que
  `prepararRepo` y `commitDeTurno` comparten): `.gitignore` es un fichero del PROYECTO y subiría
  él mismo, y sin esto un `.DS_Store` acaba en la app del cliente **como binario**.
- **La atribución sale de los COMMITS, no de la foto** (`agent/sesiones/sesionGit.ts`): un TRAILER con el
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

`agent/cloudstudio/cloudstudioMcp.ts`, `descarga.ts`, `gitSync.ts`, `subida.ts`, `core/planDeSubida.ts`.

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
  (`agent/cloudstudio/cloudstudioClient.ts`) mira el RESULTADO además de la excepción, reabre y reintenta
  **unas pocas veces con pausa creciente** (`PAUSAS_DE_REAPERTURA_MS`) —una vuelta inmediata no
  bastaba: la apertura contestaba bien y la llamada siguiente seguía sin proyecto, a veces— y
  **comprueba lo que contesta la apertura**: un «Error: …» en su texto falla con ESE motivo y
  no una llamada después como «no hay proyecto abierto». Ningún `JSON.parse` a pelo: `comoJson` dice QUÉ tool contestó.
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
- **Se sube a la MISMA rama de la que se bajó** (`config.rama`): una sola rama y una sola ref.
  Hubo una rama de trabajo (`xonecode/<origen>`, creada perezosamente por `subida.ts`) para no
  escribir en la rama que el cliente tuviera abierta en Studio; el precio era que lo subido vivía
  en un sitio que nadie mira mientras la del proyecto se quedaba quieta. Con ella se fue
  `crearRama` del puerto: sin rama que crear, no quedaba llamador.
- **La rama activa solo se sabe por `studio_get_context`, y esa tool se CAE en el servidor
  para algunos proyectos** —con el proyecto abierto y con las demás contestando bien sobre
  ese mismo proyecto—. Leerla es una CORTESÍA (devolverle el suelo a quien tenga Studio
  abierto en el navegador), no una condición de corrección: de qué rama se baja y a cuál se
  sube lo sostiene el `cambiarRama(ramaOrigen)` explícito. Por eso `ramaActiva.ts` devuelve
  `undefined` en vez de lanzar —uno solo, compartido por descarga y subida— y lo DICE con la
  rama en la que Studio se queda. `CloudStudioPort.contexto()` sigue LANZANDO: tolerar es de
  quien llama, no del puerto. La sesión perdida NO se cuela por ahí: `conSesion` reabre,
  reintenta y relanza en el `cambiarRama` siguiente.
- **El `switch` de rama CIERRA el proyecto en el servidor**, y lo dice él mismo en la
  respuesta (`action: "closeandopenproject"`): a partir de ahí toda llamada contesta «Empty
  response from server». Por eso `cloudstudioClient.ts#cambiarRama` REABRE después del
  `switch` — por ese contrato declarado, no por reconocer un texto—. `SESION_PERDIDA` no se
  amplía con ese mensaje: es el genérico de una respuesta vacía, y tratarlo como sesión caída
  pondría una reapertura delante de fallos que no arregla.
- **La ref se mueve solo si la subida terminó entera.** El reintento reenvía el plan ENTERO, lo que
  asume idempotencia del servidor sin comprobarla.
- **`.xonecode` no sube nunca**, con filtro propio además del exclude de git. La rama activa del
  servidor se restaura tras cada operación.
- **Orden al descargar: extraer → borrar vistas aplanadas → commit de baseline.** Al revés, git
  vería esos `.xml` como borrados y la primera subida los borraría **en Studio**.
- **Guarda de árbol limpio al SUBIR** (`arbolLimpio`), porque se sube un commit. **Bajar dentro
  del workspace ya no se niega: VACÍA la copia y rehace el git** (`gitSync.ts#vaciarCopia`,
  `ConfirmacionDeBajada`), decisión suya: escribir el zip encima dejaba vivo lo borrado en Studio,
  y una copia sin su propio repo enseñaba el proyecto entero como «añadido por esta sesión». Tres
  cosas que no son de forma: **se pregunta antes** con lo que se pierde delante (fail-closed por
  TIPO, y sin nada que perder —el alta— no pregunta); **se vacía SOLO con el zip en la mano**
  (`vaciarAntes` de `descargarProyecto`: si la bajada falla la copia sigue igual, y la vía fichero
  a fichero NUNCA vacía, que traería solo los de texto); y **el `git init` es DESPUÉS de bajar y en
  la propia carpeta** (`prepararRepo(…, { propio: true })`), para que el primer commit sea la
  bajada. Fuera del workspace —la carpeta que abrió una persona— sigue la guarda de antes, y un
  proyecto DENTRO de su repo sigue usando ese repo: `propio` solo lo pide el vaciado. No hay ningún
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
  modo 0600. El ESCRITOR es `agent/config/authEnDisco.ts` y su contrato es que **una escritura nunca
  destruye lo que había**: la base de la fusión es el objeto CRUDO (no el de `validarAuth`, que
  descarta entradas raras en silencio) y ante un JSON roto **para sin escribir**.
- **La variable de entorno de cada proveedor vive en UN sitio**
  (`core/modelos.ts#VARIABLES_POR_PROVEEDOR`). Hubo cuatro copias y ya habían divergido;
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
- **El catálogo VIVO es la validación de la conexión** (`agent/config/catalogoModelos.ts`).
  `ErrorCatalogoModelos` nunca lleva la clave ni el cuerpo remoto —pero sí el código HTTP, o un
  410 y un 500 se leen igual—. Un modelo de Ollama retirado se salta; que fallen TODOS se relanza.
  Ollama local y Ollama Cloud son dos hosts distintos y no se mezclan.
- **La lista de proveedores de la pastilla es la de lo COMPROBADO**: con clave, que la clave ESTÁ;
  sin clave (Ollama, un personalizado local), que su catálogo CONTESTÓ —esos se prueban al
  CONECTAR, una vez por proceso, y solo ellos—. El que está EN VIGOR se enseña siempre. Los que
  quedan fuera se CUENTAN. `SIN_CREDENCIAL` tiene TRES estados (verde / hueco / nada);
  `hayCredencial` no sirve para esto, contesta otra pregunta.
- **Los tokens de una SESIÓN se cuentan y se enseñan, en DOS cuentas que no se suman**
  (`core/ports.ts#ConsumoDeSesionPorCuenta`, `agent/subagentes/consumoExterno.ts`, mensaje `consumo`,
  `componentes/ContadorDeTokens.tsx`). El del agente EXTERNO lo dan `result.modelUsage` (Claude
  Code) y `thread/tokenUsage/updated` (Codex). Reglas:
  - **Los dos son ACUMULADOS: se lee el último, no se suman.** Entre ejecuciones sí se suma:
    cada `correr` es otra sesión del producto.
  - **Se suman TOKENS, nunca COSTE.** Los del grafo van contra la clave de API del usuario y
    los del hijo contra su suscripción: un token es un token, pero su precio no. Por eso las
    dos cuentas viajan separadas hasta el componente, que suma las cifras y pone el desglose
    en el `title`.
  - **La caché va aparte de la entrada**, como en `vendor/tokenTracking.ts`: meterla dentro
    inflaría la cifra que se enseña.
  - **De Codex se lee `total` y no `last`** —`last` es lo que ocupa la ventana— y
    `reasoningOutputTokens` **no** se suma a la salida: por su esquema ya va dentro.
  - **Se cuenta también cuando el turno acaba en ERROR**: esos tokens se gastaron igual, y
    contar solo los éxitos haría bajar la cifra justo en los turnos que más cuestan.
  - **Ausente es «no consta» y entonces no se pinta.** Sin sesión, o con el ejecutor de pega,
    no hay número — un contador a cero que nadie ha medido es la cifra inventada de siempre.
    Se tira al caerse el cable, como los modelos. Y los tokens de un turno de SEGUNDO PLANO no
    mueven el contador de quien mira otra sesión: solo avisa la consola en foco.
  - **Y con ellos viaja la VENTANA, que es otra pregunta**: `contexto` es la entrada de la
    ÚLTIMA llamada —cuánto ocupa el historial AHORA, la cifra que avisa de que toca resumir—
    y los acumulados dicen lo que la sesión ha costado. El TOPE se resuelve con **la misma
    función** que la barra del terminal (`cli/main.ts#crearTopeDelModelo`), que entra por la
    opción `topeDeContexto` para no importar `cli/` desde `web/` — el motivo de
    `crearEjecutor`—: dos resoluciones serían dos porcentajes distintos para el mismo modelo.
    Se re-resuelve en cada emisión porque `/modelo` cambia en caliente. **Sin tope no se pinta
    denominador ni porcentaje**: con Ollama no hay a propósito, y un porcentaje sobre un número
    inventado es una mentira con forma de cifra. **La ventana se consulta en la BARRA**
    (`componentes/BarraDeEstado.tsx`), no al lado de los acumulados: son dos preguntas —cuánto
    margen queda, cuánto se ha gastado— y juntas en una frase se leen como una cifra
    contradictoria. Vive en el mismo mensaje porque cambia en los mismos instantes.
  - **Los totales de una conversación SOBREVIVEN a cerrarla, y por eso el `fin` lleva el DELTA
    del turno** (`core/actos.ts#ConsumoDeTurno`, `#sumarConsumo`, `#consumoDeLosActos`). El
    tracker arranca de cero en cada proceso, así que un acumulado estampado en el `.jsonl`
    sería un absoluto de una escala que cada arranque reinicia — y sumar dos no da nada. Los
    deltas suman lo mismo dentro de un proceso que repartidos en tres.
  - **La base histórica se lee UNA vez, al abrir, y no se vuelve a mirar.** El `.jsonl` crece
    por debajo mientras el proceso vive (`volcar()`), así que releerlo a mitad de sesión
    contaría dos veces los turnos que ya están en el tracker vivo. La piel resta contra lo que
    ELLA estampó, no contra la base — si no, el primer `fin` de una sesión reabierta contaría
    otra vez todo lo de antes—, y quien SUMA es el vestíbulo: el cliente no suma nada.
  - **Un `contexto` de cero sale SIN `ventana`** (`core/ports.ts#consumoPersistible`). El
    ejecutor declara `contexto: number`, así que «no se pudo medir» llega como cero; estamparlo
    escribiría una medición que nadie hizo y borraría la del turno anterior, porque
    `consumoDeLosActos` se queda con la última ventana que CONSTA.
  - **La cifra de un turno se pinta donde el turno se resume** (`componentes/CierreDelTurno.tsx`),
    y un turno SIN trabajo lleva línea propia en vez de colgarse del último tramo: el `fin`
    cierra el tramo de SU turno, no el último de la lista. Un `{0,0}` no se pinta
    (`hayCosteQueEnsenar`), y **el mismo `abreviar`** (`cifras.ts`) sirve al contador, a la barra
    y al cierre: dos formatos para el mismo dato enseñan a desconfiar de los dos.
  - **El total de una sesión vive en el ÍNDICE, y su cifra en la barra es UNA**
    (`EntradaIndice.consumo`, `core/actos.ts#acumularTotales`, `sesiones.ts#anotarConsumoDeActo` /
    `#sembrarConsumosPendientes`, `SesionDelCable`, `componentes/Barra.tsx#FichaDeSesion`). La
    fila de la barra no tiene el sitio de la línea de un turno —compite con el nombre de la
    sesión, que es lo único elástico de una barra cuyo ancho elige el usuario—, así que ahí va
    **un solo número con una Σ delante** y el desglose por cuenta en el `title`: `98,2k` pelado
    junto a una fecha se lee como otra fecha, y `↑`/`↓` dirían que es UNA de las dos mitades. La
    caché se calla ahí por lo mismo. Y la cifra se RETIRA cuando la fila es estrecha, con una
    consulta de CONTENEDOR y nunca un `@media`: el ancho de la barra lo pone JS, así que con la
    misma ventana y la barra encogida un `@media` no dispararía.
    - **La ventana NO entra en un acumulado.** `acumularTotales` la quita: «cuánto ocupa el
      historial ahora» es una pregunta de la sesión ABIERTA, y congelada en una cerrada sería un
      «ahora» de hace días que alguien leería como el de hoy. El `.jsonl` la sigue teniendo.
    - **Un cero no se estampa, y cuando la entrada aún no trae acumulado NO se suma el delta.**
      Sumarlo dejaría el gasto del ÚLTIMO turno con la forma de un total de la sesión, y el
      número es plausible: no se notaría. Ahí se relee el `.jsonl` —con `reabrirSesion`, el único
      lector tolerante a la línea trunca— y se suma la sesión entera.
    - **La siembra es de PRESENTACIÓN y MONOTÓNICA** (`sembrarConsumosPendientes`): rellena solo
      lo que no trae acumulado, va de lo más reciente hacia atrás, no da de alta la entrada que
      falte —eso resucitaría una sesión borrada— y su fallo se TRAGA, porque una sesión vieja sin
      cifra es un adorno que falta y no una lista que no está. Corre ANTES de leer la lista y una
      vez por raíz y proceso: el alta se anuncia dos veces por turno y recorre todos los
      proyectos.
  Lo que NO hay todavía es la vista AGREGADA (por proyecto, por histórico): el total de UNA sesión
  ya está, y el COSTE no se puede sumar entre cuentas, así que no es una cifra que falte sino una
  pregunta sin respuesta honesta.
- **El modelo en vigor lo dice el SERVIDOR** (`resolver(estadoDeSesion.fuentes).trabajo` de la
  consola ABIERTA), por la costura `Consola.alEstado`: `/modelo` cambia en caliente sin tocar
  disco, así que releer la configuración contaría lo de antes para siempre.
- **El modelo por DEFECTO es otra pregunta y otro campo** (`porDefecto` en el mensaje
  `modelos`): `actual` es el de la sesión ABIERTA y `porDefecto` el que usarán las NUEVAS, que
  es el ÚNICO que viaja sin sesión. Fundirlos haría que Ajustes enseñara uno como si fuera el
  otro. **Elegir es una sola frase desde los dos sitios**: el manejador del cable GUARDA el
  defecto de los TRES papeles (`guardarModeloGlobal`, `config.json` global) y, si hay sesión,
  además encola `/modelo` para aplicarlo en caliente — porque `/modelo` solo escribe la
  bandera del estado de sesión y la elección moría con el proceso. El escritor y el lector
  entran por `OpcionesDeMontaje`; Ajustes **reusa la pastilla del compositor** (`titulo`,
  `enLinea`) en vez de una segunda lista, que es donde divergirían la regla de qué proveedores
  se ofrecen y el catálogo bajo demanda.
- **Claude se construye con tope de salida y razonamiento a mano, y las dos son datos de
  `core/`** (`topeDeSalida` en `core/contextos.ts`, `pideThinkingAdaptativo` en
  `core/modelos.ts`), con prueba de COSTURA contra `invocationParams()` del cliente real
  (`agent/modelos.test.ts`, sin red). **El `max_tokens` por omisión de
  `@langchain/anthropic` sale de una tabla por PREFIJO y un id que no conoce cae en su
  `FALLBACK_MAX_OUTPUT_TOKENS` de 4096 SIN decirlo**; en un harness que escribe ficheros eso no
  da error, corta la escritura a media respuesta. Y **omitir `thinking` no significa lo mismo en todos**:
  Opus 5 y Sonnet 5 ya corren adaptativo, la generación 4.6-4.8 corre **sin pensar**, y
  Haiku 4.5 y lo anterior a 4.6 lo RECHAZAN (usan `budget_tokens`), así que pedirlo a ciegas
  sería un 400.
- **El ESFUERZO de razonamiento es una tabla POR MODELO** (`core/esfuerzo.ts`), no por
  proveedor: dentro de un mismo proveedor el enum cambia de un modelo a otro, y hay uno que
  acepta los siete y los COLAPSA sobre tres. Por eso `nivelesDeEsfuerzo` devuelve una LISTA
  y la pastilla ofrece lo que devuelva — un desplegable con dos opciones que hacen lo mismo
  es la misma mentira que una cifra que nadie midió. Lo que no se reconoce devuelve
  `undefined`: sin control y **sin parámetro**, que es el lado conservador de
  `pideThinkingAdaptativo` y aquí es literal — pedírselo a quien no lo admite no da una
  respuesta peor, da un error duro. **Ollama se PREGUNTA en vez de tabularse** (`/api/show`
  dice si un modelo piensa), y por eso las capacidades entran por PARÁMETRO: preguntar es
  asíncrono y construir un modelo es síncrono, las dos cadencias de siempre. **Y aceptar un
  nivel no es honrarlo**: en Ollama el efecto lo pone el template de cada modelo y no es
  monótono, así que la pastilla lo DICE. Cada cliente lo escribe a su manera
  (`outputConfig.effort`, `thinkingConfig.thinkingLevel`, `think`, y `modelKwargs` para los
  de OpenAI, porque su `reasoningEffort` filtra por nombre de modelo y descarta el campo en
  silencio), así que la traducción se prueba con COSTURA contra `invocationParams()`. En
  Anthropic va ACOPLADO al `thinking`, de ahí `aceptaThinkingAdaptativo` al lado de
  `pideThinkingAdaptativo`: una dice si hace falta pedirlo, la otra si se puede. **Se elige en
  DOS sitios y los dos PERSISTEN**: el `.md` de un subagente (que gana sobre el de la
  sesión) y la sesión, cuyo nivel vive en el ÍNDICE y no en el `.jsonl` —es un dato DE la
  sesión, no uno de sus actos, igual que el dispositivo— y vuelve al reabrirla. **No hay
  defecto global, y esa ausencia es la decisión**: un tercer valor «para todas las nuevas»
  decidiría en nombre de conversaciones que todavía no existen.
- **A DeepSeek se le dice QUIÉN pide** (`core/identidadDeProveedor.ts`,
  `agent/config/identidadEnDisco.ts`): un `user_id` en la raíz del cuerpo, porque sus límites y su
  filtro de contenido son de CUENTA y varias claves de una suscripción son el mismo cliente. Sale
  del `sub` del login de CloudStudio, del entorno del proyecto resuelto como la sincronización, y
  **siempre como hash**, nunca el identificador del IDS. **El lector real es la OMISIÓN del
  constructor de `Modelos`**, no un parámetro opcional —el `Calificador` enseñó lo que pasa con
  uno—, y la costura lo mira sin pasar nada. Sin login no viaja; `xonecode config` lo DICE.
- **Los topes de contexto solo si se saben** (`core/contextos.ts`, por familias; **ollama no tiene
  tope a propósito**). El porcentaje solo se calcula con tope: uno sobre un número inventado es
  una mentira con forma de cifra. La barra y `/config` usan la misma `topeResuelto`.
- **La creación de proyecto al arrancar** (`core/esqueleto.ts`, `agent/config/crearProyecto.ts`): omisión
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

`core/dispositivos.ts`, `agent/dispositivos/dispositivosEnMaquina.ts`, `agent/dispositivos/instalacionEnMaquina.ts`.

- **`xcode-select -p` ANTES de cualquier `xcrun`**: sin herramientas de desarrollo, `xcrun`
  levanta el diálogo de instalación encima de lo que haya.
- **Cinco estados por herramienta, no un booleano**: ok, no encontrada, falló (UNA línea de
  motivo), **no aplica** (iOS fuera de macOS) y **desactivada**. La RUTA se queda en el host.
- **Es una FOTO con hora, no un estado en vivo, y no hay sondeo**: se mide al conectar el primer
  cliente (una detección en vuelo compartida) y al pulsar «Refrescar». Cada proceso lleva
  tope (`TOPES_MS`) y un cuelgue se dice «no respondió».
- **Apagar un destino deja de LANZAR procesos**, no esconde filas; una herramienta que sirve a dos
  destinos solo se salta con los dos apagados. Configurar y volver a medir son el MISMO mensaje,
  en ese orden. Ausente ≠ `{}` ≠ `"false"` (cadena, descartada en las tres capas).
- **Listar y VERIFICAR son dos preguntas**: `adb devices` contesta «device» de un teléfono cuyo
  `adb shell` está colgado, y `simctl getenv` contesta de uno APAGADO. Verificar ejecuta algo al
  otro lado, viaja el ID y nada más (el host lo resuelve contra su última MEDIDA), es un mensaje
  PROPIO, y las verificaciones viven con la foto.
- **«Terminó bien» y «ya está» son dos cosas**: la MEDIDA manda sobre el código de salida.
- **Se ejecuta lo que puede fallar RÁPIDO, no lo que no pide contraseña**: `sudo` sin TTY no tiene
  dónde pedir la contraseña y falla con código 1. Se copia lo que fallaría siempre o no falla
  rápido (el `~/.zshrc`, un `sudo` escrito dentro, `xcodebuild -downloadPlatform`). Un test compara
  la tabla de lanzables con lo que la receta marca `ejecutable` **en las dos direcciones**.
- **Se mata el GRUPO, no el hijo** (`detached: true` + `kill(-pid)`): un nieto (`brew` → `curl`)
  sobrevive a `child.kill()`. Coste declarado: un Ctrl-C ya no se lleva la descarga.
- **Ningún comando lleva una ruta de la máquina** (`$(brew --prefix)`), y cada paso se marca por
  lo MEDIDO, no por recordar que se pulsó. **Las licencias se aceptan con un clic que lo DICE**, y
  nunca escribiendo a mano los ficheros de licencia del SDK.
- **El silencio es el síntoma, no la lentitud** (`TOPE_SIN_SALIDA_MS`, 5 min). Un trabajo a la vez
  para toda la máquina; un segundo «ejecutar» reenvía el estado.
- **El dispositivo de la sesión guarda la FOTO, no solo el id** (los ids no son estables), y solo
  si NO está a mano ahora. El cliente manda el ID y nada más. La consume la pestaña Ejecutar
  y, desde que se pidió, **también el `device-controller`**, por un FICHERO y no por una variable
  (`core/dispositivoDeSesion.ts`): la shell fija sus variables al construirse, así que
  `XONECODE_DISPOSITIVO` lleva la RUTA de `.xonecode/sesiones/<id>/dispositivo.json`, que el
  vestíbulo reescribe al elegir, y los scripts de `xone-hotswap` lo leen en CADA ejecución
  (`skills/xone-hotswap/lib/dispositivo.mjs`, una regla para todos): `--serie`/`--udid` manda, luego
  el de la sesión, y sin elección **un emulador antes que un físico**. Cada turno lleva además la
  línea `[Dispositivo de esta sesión: …]` delante, para que el orquestador lo nombre al delegar;
  la garantía la ponen los scripts, no esa línea.

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

## Medir el gasto sin levantar nada

La puerta headless es `run --real` (`cli/run.ts`), y **cierra diciendo lo que costó**
(`agent/turno/informeDeTraza.ts#pintarGasto`): sin esa línea cada disparo se iba sin dejar
una cifra comparable. Cuatro reglas:

- **Las DOS cuentas no se suman y son dos filas** —la del grafo y la de un agente externo—,
  la externa AUSENTE se calla (una fila de ceros afirma que se midió lo que no corrió) y una
  ventana de cero no se pinta, que es «no se pudo medir» y no «cabe todo». Misma regla que
  `consumoPersistible`.
- **Se pinta también cuando el turno se corta sin humano**: esos tokens se gastaron igual, y
  contar solo los turnos que acaban bien bajaría la cifra justo en los que más cuestan.
- **El reparto lo da la TRAZA, no el total**: `XONECODE_TRACE_TOOLS=1` deja
  `.xonecode/traza-tools.jsonl` y `xonecode traza` lo agrega por ORIGEN (el orquestador y
  cada especialista) y por TOOL, con cada BLANCO y cuántos DISTINTOS — «seis lecturas» y
  «seis ficheros» no son lo mismo. El blanco es **ruta + rango** (`offset+limit`), no la
  ruta: la instrucción que el agente recibe es «no releas la misma ruta y el mismo rango»,
  así que otra página del mismo fichero es trabajo nuevo y colapsarla la disfrazaría de
  desperdicio. Lo que no cabe se CUENTA, que una lista recortada en silencio se lee como la
  lista entera. `pintarGasto` va en `agent/` y no dentro de `correrReal` por el patrón de fallo de
  siempre: compuesta en un cierre que todos los tests doblan, la regla queda escrita y no
  probada.
- **Dos trampas del formato, y son las dos primeras pruebas** (`informeDeTraza.test.ts`): en
  una línea `modelo`, el campo `llamadas` es el acumulado GLOBAL del tracker, así que las
  llamadas se cuentan por línea; y el fichero es append-only, así que el informe se parte por
  `sesion` —sin eso sumaría el turno de ayer al de ahora y la cifra sería plausible—. Que no
  haya traza sale con **70** y con el comando que la enciende: un cero con el informe en
  blanco se leería como «no gastaste nada».

## El banco (`npm run banco`, nunca en `npm test`)

`src/evals/banco.ts` mide **cuánto cuesta enterarse**: preguntas de solo lectura sobre el
esqueleto, repetidas N veces por modelo, con juez. El eval pregunta si sabe hacerlo; el banco,
lo que cuesta y **cuánto varía**. Las reglas viven en `medidas.ts` (puro, con test, como los
jueces): la media **nunca** sale sin su rango y su dispersión, una pasada que reventó se cuenta
aparte en vez de promediarse como un cero, y se marcan las dos cosas que invalidan una
comparación — una respuesta INCORRECTA (barata y mala no es mejor) y una pasada que **no
delegó** cuando otras sí, que es otro camino y no el mismo más barato. `comparar()` se NIEGA a
concluir con los rangos solapados. Su aprobación **rechaza**: esto son preguntas.

## Los evals (`npm run eval`, nunca en `npm test`)

`src/evals/correr.ts` corre tareas XOne reales sobre el esqueleto «Hola Mundo» en un temporal,
con el agente de verdad, el simulador de verdad y una aprobación que **aprueba todo** (por eso
no acepta una raíz: solo sobre un proyecto que se tira). El veredicto del simulador se MIDE
en el corredor, no se lee del turno — el juez no puede depender de que el lazo haya hecho su
parte, que es lo que se evalúa. Los JUECES (`tareas.ts`) son código puro y SÍ tienen test en
`npm test`: un juez que juzgue mal invalida el eval entero sin que nadie lo note. El corredor
vive en `src/` para tipearse, `tsconfig.build.json` lo excluye, y su nombre no acaba en
`.test.ts` — así `npm test` sigue sin red, sin clave y sin simulador. `docs/EVALS.md` tiene
las tareas, cómo leer un resultado y por qué la línea base se comprueba.

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

**El 2 NO promete «nada se aplicó».** Prometía eso cuando las únicas escrituras eran las del HITL
del grafo; un agente EXTERNO pide su autorización por escritura y ANTES de escribir, así que
puede haber dejado algo en el disco cuando el turno se corta después. El código se queda en 2
(hubo escrituras sin resolver: no es un éxito, y esa es la dirección segura para CI) y lo que
está en el disco lo dice el diff de «cambios en el proyecto», que es la medida.

## Trampas verificadas

Con su medida entera en [`docs/DECISIONES.md`](docs/DECISIONES.md); aquí lo que hay que
recordar antes de tocar el código:

- **El patrón de fallo de esta arquitectura, NUEVE veces: una composición de producción
  viviendo en un cierre que todos los tests doblan.** `backendDeAgente`, el corredor sin cablear
  en `arrancarConsolaWeb`, el `escribio` a fuego en `revisionConGit`, la capa de proyecto de
  `fuentesDelJuez`, el montaje de `/adjuntos/` con sus ocho saltos, `filaDeTarea`, el prop de las
  pestañas por entorno, `opcionesDeSubagenteExterno` y —la más clara de todas—
  `ConsolaDeProyecto.consumo`, declarada en el tipo y nunca implementada en el objeto: con el
  campo OPCIONAL no hay error que leer. En las nueve la regla podía dejar de estar montada **con
  todo en verde**, y en las nueve el remedio fue el mismo.
  Regla práctica: **si una regla de producción se compone dentro de algo que los tests simulan,
  esa regla no está probada — está escrita.**
- **La raíz del paquete se BUSCA hacia arriba, nunca se cuenta con `..`**
  (`agent/raizDelPaquete.ts`). `RAIZ_SKILLS` y la raíz de `versionEnDisco` se resolvían con
  `resolve(dirname(import.meta.url), "..", "..")`, que ataba esos ficheros a su profundidad:
  mover uno a una subcarpeta dejaba el catálogo de skills VACÍO sin un error que leer, y en
  `dist/` igual, que es donde `package.json` declara `skills` en la raíz. No encontrarla LANZA:
  una raíz adivinada haría falsas todas las rutas derivadas. Lo que vale para dos carpetas de
  `agent/` se queda en su raíz, y por eso este módulo no está en ninguna de las ocho.
- **La caché implícita de Gemini no entra a los tamaños de contexto de este harness** —los umbrales
  están en `DECISIONES.md`—, y `@langchain/google-genai` 2.3.0 suma `cache_read` dos veces en
  streaming: `vendor/tokenTracking.ts` acota la caché a la entrada.
- **`SkillsPort.cargar()` no tiene un solo llamador y las skills SÍ llegan al modelo**: las carga
  `SkillsMiddleware` de deepagents desde `/skills/` montada en el backend. El puerto solo aporta
  `catalogo()` — que sí importa, porque es de donde sale el aviso de las skills que FALTAN.
- **ink@5.2.1 no remide un `<Text>` cuando se INSERTA texto delante de un hijo existente**
  (`insertBeforeNode` no marca sucio el padre; append y remove sí). Regla práctica: hijos que
  aparecen y desaparecen van como `Text` HERMANOS dentro de un `Box`, **nunca anidados en un
  Text**. La Entrada lo esquiva partiendo el texto en filas ella misma (`cli/tui/filas.ts`).
- **El `resize` de Ink no re-renderiza React**: recalcula Yoga y repinta el árbol YA montado, así
  que lo que dependa de `stdout.columns` leído en el render se queda viejo. `App` se suscribe al
  `resize` y fuerza un re-render.
