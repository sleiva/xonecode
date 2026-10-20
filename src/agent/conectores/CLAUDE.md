# Los conectores MCP

Trozo del mapa de la raíz (`CLAUDE.md`): mapa e invariantes; el porqué medido, en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

`core/conectores.ts` (puro), `agent/conectores/` (disco y red), sección Conectores de Ajustes. Un
conector es un servidor MCP REMOTO: catálogo cerrado por código, o uno escrito a mano.

- **Llegan a TrueForge, y solo en la web** (`motores/trueforge/toolsDeConectores.ts`, `ConectoresPort`):
  los marcados en `config.conectores`, SIN el gestor de tareas vinculado (`conectoresParaElAgente`).
  Mismo servicio de Ajustes, enlazado TARDE (`ajusteDeGestorCableado#conectoresDeSesion`), a toda
  consola por `banderaDeEjecutor`. Terminal, `run`, evals y motores externos no.
- **LECTURA (`readOnlyHint: true`) sin aprobación; el RESTO con aprobación** (lo no declarado ESCRIBE;
  no usar `@write`). El raíz, solo lectura; un especialista con `recibeConectores` (`escribeEn` cubre `icons/`), las dos.
  Nombre `<conector>__<tool>`, saneado a `[a-zA-Z0-9_-]{1,64}`.
- **Una escritura remota va SIEMPRE a una persona** (`PendienteDeAprobacion.remota`), también en
  autónomo; en tarea de fondo se RECHAZA y aparca. La tarjeta enseña los argumentos enteros.
- **Lo que el modelo ve se LIMPIA y RECORTA**: `esquemaParaElModelo` (sin `x-…` ni `$ref`),
  `fueraDelAgente`, `camposFueraDelResultado`.
- **Stitch: `traer_pantalla_de_stitch`** (`motores/trueforge/traerDeStitch.ts`, puro en `core/stitch.ts`):
  el modelo da la pantalla, nunca la URL; solo los hosts medidos, con tope y tipo comprobado, a
  tamaño real (`=s0`). Destino FIJO `/artefactos/diseno/` —y `diseno/2/`… para la segunda y
  siguientes elegidas (`carpetaDeMaqueta`)—, que `buscarMaquetas` prefiere y que `ultimaCaptura`/el
  crítico NO toman por capturas. Dice BYTES, no las medidas de Stitch. Busca por NOMBRE, propios y
  compartidos, sin tildes: primero el del LIENZO (`get_project` → `screenInstances[].label`, solo las
  visibles: `nombresDelLienzo`, `casanConNombre`) y luego el `title` de la API, que NO es el que la persona ve
  en Stitch; si no casa, lista CORTA con los dos nombres y el `name`. El selector de Diseño enseña también el
  del lienzo. `list_projects` sigue recortando `screenInstances` (tamaño): se pide `get_project`.
- **El DISEÑO de una tarea se ELIGE** (`core/disenoVinculado.ts`, `DisenoDelProyecto.tsx`, mensaje
  `diseno`): proyecto vinculado (`config.json#disenoVinculado`), de 1 a `TOPE_DE_PANTALLAS_ELEGIDAS`
  pantallas en `Tarea.pantallasDeStitch` (IXCODE-63; cada una, una PANTALLA a construir), comprobadas
  por el SERVIDOR (`pantallasElegidasValidas`; una tarea vieja con `pantallaDeStitch` se lee como lista
  de una); `prepararDisenoDeTarea` las trae ANTES del primer turno y deja SIEMPRE la marca
  `diseno/.elegida.json`; con ella la tool solo trae ELLAS, cada una a su carpeta. La medida
  automática compara cada captura con la MÁS PARECIDA (`medirContraLaMasParecida`).
  El encargo lleva pantallas y proyecto con ids (`textoDePantallasElegidas`); el aumentador no propone
  otra ni AÑADE lo no pedido. Sin elegida: búsqueda por PALABRAS y lo no hallado va a `## CRITICAL`
  (`pantallasNoEncontradas`), nunca se sustituye. Pestaña Diseño solo con vínculo; al editar,
  `disenoContexto.ts`, y `null` la quita.
- **Tope propio por llamada** (`TOPE_DE_LLAMADA_MS`, 10 min), también como `timeout` del SDK. Solo
  se REPITE una de lectura (`PAUSA_ANTES_DE_REPETIR_MS`). Tools pedidas una vez por sesión.
- **Catálogo = TABLA** (`CATALOGO_DE_CONECTORES`, auth `ninguna`/`oauth`/`api-key`). Icono atado al
  `id`; sin él, MONOGRAMA.
- **Uno a mano es la MISMA familia**: `resolver(id)` = catálogo ∪ definiciones; id DERIVADO
  (`idDeConectorDesdeNombre`), nunca del cliente; validez en `motivoDeDefinicionInaceptable`.
  `custom:jira` convive con `jira`.
- **El cliente lee el nombre del `catalogo` que viaja** (`FilaDeCatalogo`); la `url` no vuelve.
- **La clave `api-key` va a SECRETOS, no a `auth.json`** (`SecretosDeConector`, 0600,
  `escribirAtomico`). La cabecera la compone el CÓDIGO; `motivoDeClaveInaceptable` criba. Una fila
  puede nombrar otra (`cabeceraDeClave`: Stitch, `X-Goog-Api-Key`).
- **«Conectado» con clave exige una llamada si el servidor lista a cualquiera**
  (`ConectorDeCatalogo.comprobacion`). 401/403 con clave = «falta autorizar», no «no responde».
- **El formulario no tiene campo de clave**: va por `leerSecreto`; `estadoDeConector` usa `hayCredencial`.
- **`crear` encadena la autorización en el SERVIDOR** si su auth no es `ninguna`.
- **`quitar` un `custom:` se lleva definición y clave.** Una definición ilegible NO se borra:
  se conserva al escribir y se filtra al leer (`authEnDisco.ts`).
- **Dos ficheros, SOLO en la casa** (`conectoresEnDisco.ts`): `conectores.json` y
  `conectores-oauth.json` (0600). Nunca en el proyecto. Id VIVO = en catálogo o con definición.
- **Callback PÚBLICO, autenticado por `state`** (`TTL_DE_AUTORIZACION_MS`, 10 min, un solo uso), no
  por cookie ni por el puerto de CloudStudio. Ni tokens ni URL de autorización cruzan el cable.
- **Cliente OAuth PÚBLICO atado a su `redirect_uri`** (`token_endpoint_auth_method: "none"`).
- **La prueba es una FOTO** (`TOPE_DE_CONEXION_MS`, 30 s).
- **`llamar` respeta un pendiente vivo, como `probar`** (pisaría el PKCE): gestor y Ajustes
  comparten UN servicio (`arranque.ts#ajusteDeGestorCableado`).
- **El SDK ya reintenta el refresh dentro de `auth()`**: solo `motivoDe` reconoce `OAuthError` →
  «falta autorizar». Sin reintento propio.
- **Gestor de tareas (Jira/Notion) = conector con puerto PURO** (`core/gestorDeTareas.ts`); cada
  adaptador (`gestorJira.ts`, `gestorNotion.ts`) es el ÚNICO que conoce sus tools y respuestas.
  **UN gestor por proyecto**: vincular uno deja de usar el otro. Qué `proyecto` vale lo decide su conector (`motivoDeProyectoInaceptable`,
  igual en `config.ts#validar`, `vincular` y adaptadores). Notion: `buscarProyectos`, `describir`
  antes de vincular, SQL con `params` (`sqlDePendientes`), transiciones = opciones del estado, data
  source de la PROPIA página. `admiteMias` y `nombreDelProyecto` se guardan al vincular.
  **Lectura que depende del vínculo se TIRA si cambió** (`arranque.ts#delMismoVinculo`).
  **`estado` no toca la red.** `comentarioParaNotion` solo cambia marcadores de bloque. **Del
  asignado solo cruza `nombreDelAsignado`.**
- **Vincular ESCRIBE config solo tras confirmar Jira la clave** (`vincular`;
  `guardarGestorDeProyecto`/`guardarConectoresDeProyecto`), en el `config.json` del PROYECTO.
  Vincular marca el conector usado y desvincular lo DESMARCA (`GESTORES_DE_TAREAS`).
- **Una instancia MEMOIZADA por conector, y `sitios()` antes de `pendientes`/`empezar`**: el adaptador
  de Jira cachea la URL del sitio para `<url>/browse/<clave>`.
- **Límites**: solo TrueForge y web; marcado con sesión abierta, llega a la siguiente; sin túnel
  (`redirect_uri` en `127.0.0.1`); OAuth solo con registro dinámico; a mano, solo `Authorization: Bearer`.
