# Arranque, copia local de CloudStudio y sincronización

Diseño del alta completa: asistente de proveedor y modelo, descarga del proyecto de
CloudStudio a una copia local, registro de los cambios sobre ella y subida incremental.
Sustituye el «flujo objetivo» de
`docs/CLOUDSTUDIO-SINCRONIZACION.md`, que se escribió antes de conocer el catálogo MCP real.

Fecha: 2026-09-03. Estado: diseño aprobado pendiente de plan de implementación.

## De dónde sale esto

Hoy el arranque en modo `cloud` autentica, lista proyectos y guarda
`modo`, `cloudstudio.url`, `scopes` y `cloudstudio.proyecto {id, nombre}` en
`.xonecode/config.json`. Ahí se acaba: la carpeta local sigue vacía, así que la consola
dice «no es un proyecto XOne (falta app.xml)» y ofrece crear uno. Falta traerse el
proyecto y poder trabajar sobre él.

## Hallazgos medidos contra el servidor

Todo lo que sigue está comprobado contra el MCP real (`mcp.xonewebstudio.com`), no
supuesto. Son las restricciones que dan forma al diseño.

| Hecho | Consecuencia |
|---|---|
| `studio_open_project` rechaza el `pid` (`96fe2fba_…`) y acepta el **nombre** | El nombre es la llave operativa; el `pid` sirve para detectar renombrados |
| `studio_download_project` devuelve **un ZIP entero en base64** | No puede ser una tool del agente: el proyecto de prueba pesa varios MB y arrasaría la ventana de contexto |
| `studio_get_file` solo devuelve texto: `.config .css .htm .html .ini .js .json .md .properties .resx .sql .txt .vbs .xml .xne .svg` | **No existe descarga binaria por fichero.** El plan B es necesariamente parcial |
| No hay tool para actualizar un proyecto entero (`studio_import_project` crea uno **nuevo**) | La subida es fichero a fichero, y puede fallar a medias |
| Subida: `studio_edit_file` (texto, con modo `delete`) y `studio_upload_file` (binario: base64 ≤5 MB, `chunked` ≤50 MB) | Hay borrado de texto; el borrado de binarios queda por confirmar |
| `studio_get_project_structure(mode:"filesystem")` da rutas y tamaños, y **se trunca** (tope 2000) | Sirve de manifiesto del remoto, pero hay que recorrer por `directoryPath` |
| El listado de proyectos ya trae `rights: {remove, download, edit}` | Se puede elegir estrategia **antes** de fallar |
| No hay checksums remotos por fichero | Bajar siempre trae el proyecto entero; subir sí es incremental |
| El proyecto abierto es **estado de sesión del servidor**: no hay id que pasar (ninguna tool acepta uno) y **caduca** — medido: aguantó varias llamadas seguidas y se perdió minutos después | Reabrir al empezar cada conexión, y reintentar una vez ante «No project is open» |
| `studio_get_context` devuelve `{project, branch}` | Se puede comprobar el estado **sin provocar un error**, y saber en qué rama está el proyecto |
| `manage_branches("list")` devuelve solo nombres (`[{Key:"master",Value:"master"}]`) | El listado no dice la rama activa; quien la dice es `get_context` |
| `manage_branches("merge")` está documentado como «get merge file **list**» | El servidor no fusiona. La fusión la hace git en local, que sí tiene el ancestro común |

## Arquitectura

Tres capas, y la frontera entre la primera y la segunda es la que sostiene todo lo demás:

1. **El agente** trabaja contra la copia local con sus tools de siempre
   (`write_file`, `edit_file`), confinado a la raíz, con aprobación y diff. **No conoce
   CloudStudio**: ninguna tool MCP se le inyecta.
2. **El CLI** habla con CloudStudio (`agent/cloudstudioMcp.ts`), igual que ya hace con
   `project_list` en el arranque. Es quien descarga, quien sube y quien maneja el ZIP en
   base64 — bytes que nunca entran en el transcript.
3. **El git local** es la costura entre las dos: dice qué cambió y qué falta por subir.

### Dónde vive la copia

En **la carpeta que el usuario abrió**, con la misma estructura que el servidor. No en un
`worktree/` bajo `.xonecode`: todo lo que ya funciona sobre `raiz` —detección de `app.xml`,
verificador, foto de git por turno, ocultar vistas aplanadas, completado de `@ficheros`—
sigue funcionando sin tocarlo, y `.xonecode` puede seguir denegada entera al agente.

## El arranque completo, en orden

El alta es una secuencia, y cada paso solo aparece si falta lo que decide. Nada se
pregunta dos veces, y **sin TTY no se pregunta nada**: igual que `configurarModoInicial`
hoy, el asistente entero se salta con `!consola.interactivo`, o las tuberías y `xonecode
run` dejarían de dar la salida byte-idéntica que CI espera.

1. **Cuenta: proveedor y modelo** — solo si no hay ninguno configurado. Se guarda global.
2. **Proyecto: modo** `offline` / `cloud` — solo si no hay `.xonecode/`.
3. **Proyecto: cuál** de CloudStudio, y **descarga** de la copia local (secciones de abajo).
4. **Proyecto: modelo propio** — opcional, por omisión hereda el global.

## Wizard de proveedor y modelo

**Cuándo salta.** No hace falta una marca de «primer arranque»: la resolución de modelos ya
guarda el `origen` de cada valor (`--modelo-<papel>` > `--modelo` > `XONECODE_MODELO` >
proyecto > global > omisión). Si el papel `trabajo` resuelve con `origen === "omisión"`,
nadie ha elegido nunca nada, y ahí es donde se ofrece el asistente. Un flag aparte sería
una segunda fuente de verdad sobre algo que el sistema ya sabe.

**Qué pregunta**, reutilizando lo que ya existe (`PROVEEDORES`, `hayCredencial`,
`catalogoModelos.listar`, `describirModelo`):

1. Proveedor. Ollama local se ofrece sin pedir credencial —es la omisión— y se comprueba
   que responde en `OLLAMA_BASE_URL` antes de darlo por bueno; el resto pide la clave si
   falta, con el mismo `guardarCredencial` de `/provider`.
2. Modelo, del **catálogo vivo** del proveedor.
3. Ese modelo se asigna a **los tres papeles**, como hace `/modelo`. Afinar por papel es
   una decisión posterior y opt-in, con `/modelos <proveedor>`: preguntar tres veces en el
   primer arranque, antes de que nadie sepa qué es «afilado», es peaje sin contrapartida.

**Dónde se guarda.** La elección va al `config.json` **global** (`guardarModeloGlobal`, que
ya existe). La clave va solo a `~/.xonecode/auth.json` con modo 0600, por `authEnDisco.ts`
— nunca al proyecto: `core/config.ts` rechaza claves de API ahí, y esa regla no se toca.

**El modelo del proyecto** es el paso 4 del arranque y es opcional: por omisión el proyecto
hereda el global, y solo si el usuario dice que sí se abre el mismo selector y se escribe
en `<proyecto>/.xonecode/config.json`. Eso necesita una función nueva —hoy solo hay
guardado global— hermana de `guardarTemaDeProyecto` y `guardarModoDeProyecto`: fusión sobre
el objeto crudo y escritura atómica, con el mismo rechazo de claves.

**Cancelar no escribe nada.** Se sigue con la omisión (Ollama local) y se dice en voz alta
qué modelo va a usarse y de dónde sale. Es la misma regla que la creación de proyecto:
escribir configuración es opt-in, y un asistente cancelado no puede dejar la cuenta a
medio configurar.

## Ramas: origen y trabajo

El proyecto de Studio tiene ramas propias (hoy, en `AppForTest`, solo `master`). Se usan
dos, y se corresponden 1:1 con lo que git ya sabe hacer:

| | En Studio | En git |
|---|---|---|
| **Rama origen** — de donde se baja | se elige al dar de alta el proyecto; se guarda en `cloudstudio.rama` | `refs/remotes/cloudstudio/<origen>` |
| **Rama de trabajo** — a donde se sube | se crea en la **primera subida**, no en el alta | `refs/remotes/cloudstudio/<trabajo>`, upstream de la rama local |

Es la relación de siempre entre `origin/main` y una rama de feature: `git status` sigue
diciendo si vas por delante, y **quien integra en la rama origen es el usuario, en
Studio**. Bajar, HOY, no es un fetch + merge: **sobrescribe** el disco con lo que venga
del servidor, y por eso exige árbol limpio (ver más abajo). La fusión a tres bandas está
pendiente de implementar. La rama de trabajo se crea
perezosamente porque crear una rama vacía en el alta le ensucia el Studio a quien luego no
sube nada. El nombre de la rama local se hace coincidir con la rama origen (`git init -b
<origen>`) para que no haya dos vocabularios.

**El servidor no fusiona.** `manage_branches("merge")` devuelve una LISTA de ficheros a
fusionar, no un resultado fusionado. Y no lo necesitamos: git tiene el ancestro común real
—el commit de la descarga— y el MCP no puede tenerlo, porque no sabe de dónde partiste. La
rama remota es un contenedor; el motor de fusión es git.

**Cambiar de rama tiene efecto fuera.** `switch` cambia la rama activa del proyecto en el
servidor: si el usuario tiene Studio abierto en el navegador, se le mueve el suelo. La
secuencia obligatoria de toda operación con ramas es entonces:

```
get_context()  →  guarda la rama activa real
switch(rama que toque)  →  operar  →  switch(la rama que estaba)
```

y queda anotado en el registro. Sin `get_context` esto no se podría hacer bien: se
restauraría «a la que creíamos», que no es lo mismo.

## Bajada, en dos vías

La estrategia se decide antes de intentar nada, con `rights.download` del listado.

**Vía normal — ZIP.** `open_project(nombre)` → `download_project(unified:false)` →
descomprimir en la raíz. `unified:false` mantiene los `.xne` separados, que es lo que
espera la regla «la fuente es el `.xne`».

**Vía degradada — fichero a fichero.** Cuando `rights.download` es falso, o cuando el ZIP
falla (un fichero con error de sintaxis en Studio basta): enumerar con
`get_project_structure(mode:"filesystem")`, recorriendo por `directoryPath` mientras venga
`truncated`, y bajar con `get_file` todo lo que la whitelist de texto permita. Los
binarios —PNG, JPG, TTF, `.db`— **no se pueden recuperar por esta vía**. Los `.svg` sí,
porque el servidor los trata como texto.

La concurrencia es un **pool de promesas acotado** (4–8 en vuelo) sobre la misma sesión
MCP, con reintento y backoff por fichero. No hay `worker_threads`: esto es E/S, no CPU, y
un hilo no acelera una espera de red. Un fichero que falla no aborta la descarga: se anota.

### Las vistas aplanadas se borran de la copia local

De colecciones, en local solo se trabaja con los `.xne` y con `app.xml`. Los `X.xml` que
Studio genera junto a un `X.xne` **se borran del disco** justo después de extraer, antes de
nada más. Hasta ahora solo se le ocultaban al agente con un Proxy
(`sinVistasAplanadas`); borrarlos de verdad hace que la regla también valga para el
usuario, para `grep`, para su editor y para su git.

**El orden es la parte que importa, y al revés hace justo lo contrario:**

1. extraer el ZIP → 2. **borrar las vistas aplanadas** → 3. commit de baseline (`prepararRepo`).

Si el baseline se tomara antes del borrado, git vería esos `.xml` como borrados, y como sí
se descargaron, el candado no los frenaría: la primera subida los borraría **en Studio**.
Tomándolo después, para git nunca existieron y no hay nada que subir.

Dos cierres más, porque una sola barrera no basta para algo que borra en casa del cliente:

- `esVistaAplanada` se comprueba **antes** que la rama de borrado en `planDeSubida`, así que
  un `X.xml` borrado en local no puede emitir un borrado remoto mientras exista su `X.xne`.
- Las vistas aplanadas **no entran en `descargados`**, así que el candado las protege
  también por esa vía, aunque alguien reordene las guardas algún día.

`sinVistasAplanadas` se queda donde está pese a todo: los proyectos offline y los que ya
tuvieran `.xml` en disco siguen necesitándolo, y una regla que protege dos veces no sobra
cuando el fallo es mudo.

### El manifiesto y el candado de borrado

`get_project_structure` es el inventario del remoto. Se guarda, junto con el conjunto de
rutas **efectivamente descargadas**, en `.xonecode/cloudstudio/sync.json`.

Sin eso hay una pérdida de datos silenciosa: con una copia parcial, git ve las fuentes,
los PNG y la `.db` como **borrados**, y una subida calculada con `git diff` emitiría
`delete` de todos ellos. Un plan B ingenuo no deja el proyecto incompleto: lo **vacía en
Studio**.

> **Regla dura: lo que no se pudo bajar, no se puede borrar.** La subida solo emite
> borrados de rutas que estaban en el manifiesto Y se descargaron. Lo que existe en el
> remoto pero nunca tuvimos es intocable: ni se modifica ni se borra.

La copia parcial se marca en `sync.json` y se avisa en cada arranque con un aviso
determinista de alcance de turno (`core/bitacora.ts`), no con una frase en el prompt.

## El git local como libro de cuentas

Tras la descarga se registra el árbol exacto del remoto en una **ref de seguimiento**,
`refs/remotes/cloudstudio/main`, y se declara CloudStudio como un remoto sin servidor git
detrás:

```sh
git config remote.cloudstudio.url   "cloudstudio://<proyecto>"
git config remote.cloudstudio.fetch "+refs/heads/*:refs/remotes/cloudstudio/*"
git config remote.cloudstudio.skipFetchAll true
git config branch.main.remote  cloudstudio
git config branch.main.merge   refs/heads/main
```

`skipFetchAll` no es un adorno: detrás de `cloudstudio://` no hay ningún servidor git, así
que sin ella el `git fetch --all` (o el `git remote update`) del usuario muere con «remote
helper 'cloudstudio' aborted session», código 128, por culpa de un remoto que le pusimos
nosotros. Con ella, los recorridos de todos los remotos se saltan éste y el resto queda
igual — incluido el «ahead/behind» de `git status`, que es lo único para lo que declaramos
el remoto. Nuestro «fetch» de verdad es `/sync bajar`.

Las tres claves de `remote.cloudstudio.*` se escriben SIEMPRE (son nuestro espacio de
nombres); `core.autocrlf` y `branch.<rama>.remote`/`.merge` son del usuario y en un repo
preexistente solo se escriben si no valen ya nada.

Si la carpeta no es un repo, `git init` (es el git local que el usuario quiere, normal y
usable). Si ya lo es, no se inicia nada: solo se crea la ref. El commit de baseline se
construye con un `GIT_INDEX_FILE` privado — el patrón ya probado de `agent/instantanea.ts`,
que existe justamente para no tocar el índice ni el staging del usuario.

Comprobado en un repo de prueba, salida real:

```
recién bajado          ## main...cloudstudio/main
tras trabajar          ## main...cloudstudio/main [ahead 2]
   a subir:            M  app.xml
                       A  icon.svg
tras subir             ## main...cloudstudio/main [ahead 2]
```

Ese último renglón es lo que hay que leer bien: la ref que se mueve al subir es la de la
rama de TRABAJO (`cloudstudio/xonecode/main`), porque es la rama a la que se escribió de
verdad. `branch.main.merge` sigue apuntando a la rama ORIGEN, así que `git status` sigue
diciendo «ahead» — y **eso es cierto**: en Studio, `main` no tiene ese trabajo hasta que
el usuario lo integre allí. Mover la ref de `main` era lo cómodo y lo falso: decía «al
día» sobre una rama que no había recibido nada, y un `bajar` posterior reintroducía todo
el trabajo como si se hubiera revertido. Quien responde «¿está subido?» sin ambigüedad es
`/sync estado`, que compara contra la ref de trabajo.

De ahí sale todo lo demás sin inventar nada:

- **`git diff --name-status cloudstudio/xonecode/main..HEAD` ES el plan de subida** (antes
  de la primera subida esa ref no existe todavía y se compara contra `cloudstudio/main`,
  que es de donde parte la rama de trabajo).
- **Bajar podría ser un merge de verdad** —el nuevo download se commitea con el sync
  anterior como padre y `git merge cloudstudio/main` daría fusión a tres bandas con
  ancestro real—, pero **no está implementado**: no hay ningún `git merge` en el código.
  Hoy la descarga SOBRESCRIBE y la única red de seguridad es la guarda de árbol limpio,
  que se exige en las dos direcciones. Con el árbol limpio, un machaque se deshace con
  `git checkout .`; sin ella no se deshace de ninguna forma.
- **«Simular el push» es un comando**: `git update-ref -m "sync: N ficheros"
  refs/remotes/cloudstudio/main HEAD`, y solo si la subida terminó entera.

Dos detalles que muerden si se olvidan:

- `.xonecode/` va a `.git/info/exclude`, **nunca a `.gitignore`**: `.gitignore` es un
  fichero del proyecto y acabaría subido a CloudStudio.
- `core.autocrlf` desactivado en el repo local: si el texto que vuelve por `get_file` se
  normaliza al escribirlo, cada `/sync` produce diffs fantasma.

Fuera de alcance, pero la disposición de refs ya lo contempla: un *remote helper*
(`git-remote-cloudstudio` en el PATH) haría que `git push cloudstudio` funcionara de
verdad contra MCP. No hay que rehacer nada para llegar ahí.

## Subida

1. Se calcula el plan con `git diff --name-status cloudstudio/main..HEAD`, filtrado por el
   candado de borrado y por las dos exclusiones de abajo.
2. Se pide autorización explícita con el plan delante. La subida **no se puede invocar sin
   decir quién autoriza**: la política es un campo obligatorio, no una convención que cada
   llamador recuerde. Es fail-closed llevado al tipo.
3. Se ejecuta: texto por `studio_edit_file` (`replace`, o `delete`), binarios por
   `studio_upload_file` (`base64` hasta 5 MB; `chunked` NO está implementado en xonecode:
   por encima del tope la operación se declara imposible y sale del plan).
4. **La ref se mueve solo si todo terminó.** Con fallos parciales se queda donde estaba, el
   registro dice qué faltó y el siguiente `/sync` reintenta exactamente eso. Idempotente
   por construcción.

### Quién autoriza: una política, no un prompt

El campo obligatorio de autorización es un **hueco de política**, y hay dos previstas:

| | Quién rellena el hueco | Estado |
|---|---|---|
| **Interactivo** | la persona, con el plan delante | lo que se implementa ahora |
| **Autónomo** | el juez: «plan terminado, nada pendiente» → sube | declarado, sin implementar |

El modo autónomo existe porque preguntar en cada subida hace inviable dejar al agente
trabajando solo. Pero **el veredicto del juez no puede ser la única condición**: en este
repo los avisos son código y no prompt precisamente porque a un modelo se le puede pedir
que avise y no avisa. La política autónoma exigirá, ADEMÁS del veredicto, condiciones que
comprueba el código: verificador en verde, árbol limpio, plan sin tareas pendientes y
ninguna escritura esperando aprobación en el turno. El juez decide si el trabajo está
hecho; el código decide si es seguro subirlo.

Lo que hace esto asumible es la **rama de trabajo**: una subida automática nunca toca la
rama origen. Si el juez se equivoca, lo que queda es una rama de más en Studio que el
usuario revisa y descarta — recuperable. Subir solo a la rama origen no lo sería.

El juez **todavía no existe**: el papel `afilado` está reservado para él y no hay lazo de
plan → ejecuta → verifica → juzga → repara. Por eso ahora se monta el hueco y la política
interactiva; la autónoma se enchufa cuando el juez llegue, sin tocar el motor.

Exclusiones, ambas incondicionales:

- **La carpeta `.xonecode` no sube nunca**, ni ella ni nada debajo. Filtro propio en la
  subida, además del exclude de git:
  ahí viven memoria, sesiones, planes e historiales, y una fuga los mete en una app
  compartida. Dos candados independientes porque uno se puede olvidar.
- **Los `.xml` aplanados no suben cuando existe su `.xne` hermano.** Es la misma regla que
  el agente ya tiene en `sinVistasAplanadas`, con el predicado `esVistaAplanada` ya
  escrito y probado. Subir un `.xml` viejo junto a un `.xne` nuevo es exactamente el bug
  mudo que XOne no avisa.

Tampoco se deja ninguna marca de xonecode en el proyecto remoto: nada de un fichero de
sello, que acabaría dentro de la app.

## El registro

Dos capas con oficios distintos, sin duplicar la verdad:

- **La ref** es la única fuente de verdad sobre qué hay arriba. Su reflog
  (`git reflog show cloudstudio/main --date=iso`) da la fecha de cada sync.
- **`.xonecode/cloudstudio/sync.log`**, JSONL append-only, es la auditoría. El reflog no
  basta: caduca a los 90 días por omisión y no guarda detalle por fichero, que es justo lo
  que hace falta cuando una subida fichero a fichero falla a medias.

```jsonl
{"fecha":"2026-09-03T20:15:48+02:00","dir":"bajada","proyecto":"AppForTest","modo":"zip","ficheros":247,"commit":"8fe1dfd"}
{"fecha":"2026-09-03T20:41:02+02:00","dir":"subida","desde":"8fe1dfd","hasta":"6190983","aprobado":true,
 "ok":["BuscarFarmacias.xne","icons/icon_new.svg"],
 "fallos":[],"omitidas":[{"ruta":"bd/gestion.db","motivo":"pesa 6291456 bytes y la subida en base64 admite hasta 5242880; el modo troceado no está implementado: súbelo desde Studio"}]}
```

`sync.json` deja de ser estado y queda como diagnóstico: manifiesto, rutas descargadas,
marca de copia parcial y motivo del fallo del ZIP, más `pid` y nombre para detectar
renombrados.

## `.xonecode` a partir de ahora

La carpeta pasa a llevar también sesiones, planes y memorias. Dos preguntas distintas:

| | ¿entra en el git local? | ¿sube a Studio? |
|---|---|---|
| `memoria.md`, planes | sí, si el usuario quiere versionarlos | **nunca** |
| `conversation_history/`, sesiones, `cloudstudio/` | no (`.git/info/exclude`) | **nunca** |

Como el filtro de subida es incondicional, versionar la memoria deja de ser peligroso.
Aviso que hay que dar: si la carpeta ya es un repo con remoto propio, commitear
`.xonecode/` manda memorias y planes a los compañeros del usuario.

Del lado del agente el candado ya existe: `permisosDe` deniega `/.xonecode` y
`/.xonecode/**`, y `puedeLeerRuta` lo repite para las tools propias que no pasan por el
middleware de permisos. Si algún día un especialista tiene que leer su plan, se abre **una
ruta virtual concreta**, como `/MEMORIA_PROYECTO.md`, nunca la carpeta.

## Decisiones tomadas

- **Descompresor**: `fflate` (JS puro, ~30 KB, sin binarios nativos). `unzip` del sistema
  se descarta: no existe en Windows y metería un `spawn` donde no hace falta.
- **Cuándo se baja**: en el alta del proyecto, y luego solo con `/sync` explícito. Bajar
  sin pedirlo asusta y con razón — y más aún mientras la descarga sobrescriba en vez de
  fusionar.
- **Árbol sucio: se rechaza en las DOS direcciones**, por motivos distintos. Al subir, se
  sube el estado de un commit (HEAD) y se rechaza con cambios sin commitear, diciendo qué
  falta. Al bajar, porque la descarga sobrescribe el disco y el baseline se construye
  DESPUÉS: sin commit debajo, el trabajo local no se recupera. `.xonecode/` nunca cuenta
  (en el alta se escribe antes de que exista la exclusión de `info/exclude`), y una
  carpeta que aún no es repo se considera limpia solo si está vacía. Así «lo que está arriba» es siempre un commit
  concreto y mover la ref significa algo. xonecode no commitea por el usuario: el git es
  suyo y la autoría también.

## Abierto, a decidir antes del plan

- **Borrado de binarios**: `studio_edit_file` documenta `delete` para ficheros de texto.
  Falta confirmar si acepta rutas binarias; si no, un borrado de icono no se puede
  propagar y hay que decirlo en vez de fingir que subió.
- **El verificador con copia parcial**: sin `bd/gestion.db`, hay que comprobar si
  `xone-simulator` falla. Un rojo que no es del proyecto choca con el contrato de códigos
  de salida (1 es proyecto, 70 es entorno).

## Pruebas

El invariante de siempre manda: `npm test` sin red, sin claves y sin simulador. Por tanto:

- Un **doble del puerto CloudStudio** con las respuestas medidas aquí: el ZIP, el error de
  extensión de `get_file`, la estructura truncada y un fallo a mitad de subida.
- El **candado de borrado** se prueba con una copia parcial: el plan de subida no puede
  contener ni un `delete` de lo que no se descargó. Es el test que evita el vaciado.
- La **idempotencia**: subida que falla a la mitad → la ref no se mueve → el segundo
  intento sube exactamente lo que faltaba.
- El **git** se prueba contra repos temporales, como ya hace `agent/instantanea.test.ts`.
