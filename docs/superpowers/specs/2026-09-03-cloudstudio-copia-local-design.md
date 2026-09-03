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
git config branch.main.remote  cloudstudio
git config branch.main.merge   refs/heads/main
```

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
tras subir             ## main...cloudstudio/main
```

De ahí sale todo lo demás sin inventar nada:

- **`git status` responde «¿está subido?»** sin comandos de xonecode ni fichero de estado.
- **`git diff --name-status cloudstudio/main..HEAD` ES el plan de subida.**
- **Bajar es un merge de verdad**: el nuevo download se commitea con el sync anterior como
  padre y `git merge cloudstudio/main` da fusión a tres bandas con ancestro real. Si
  alguien tocó la app en Studio mientras tanto, sale un conflicto, no un machaque.
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
2. Se pide **aprobación explícita** con el diff delante (`cli/aprobar.ts`, `core/diff.ts`).
   Es una acción hacia fuera: fail-closed, lo que no se entiende no se sube.
3. Se ejecuta: texto por `studio_edit_file` (`replace`, o `delete`), binarios por
   `studio_upload_file` (`base64` hasta 5 MB, `chunked` por encima).
4. **La ref se mueve solo si todo terminó.** Con fallos parciales se queda donde estaba, el
   registro dice qué faltó y el siguiente `/sync` reintenta exactamente eso. Idempotente
   por construcción.

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
 "fallos":[{"ruta":"bd/gestion.db","motivo":"5 MB excedidos en base64; reintentar en chunked"}]}
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
  sin pedirlo, con un merge de por medio, asusta y con razón.
- **Árbol sucio al subir**: se sube el estado de un commit (HEAD) y se rechaza subir con
  cambios sin commitear, diciendo qué falta. Así «lo que está arriba» es siempre un commit
  concreto y mover la ref significa algo. xonecode no commitea por el usuario: el git es
  suyo y la autoría también.

## Abierto, a decidir antes del plan

- **Rama remota**: existe `studio_manage_branches` (list/create/switch/merge). La subida
  podría aterrizar en una rama de CloudStudio en vez de sobre la que el usuario tenga
  abierta, dejándole el merge en Studio. Más seguro, un paso más.
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
