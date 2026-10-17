# Los conectores MCP

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# Los conectores MCP

`core/conectores.ts` (puro), `agent/conectores/` (disco y red), sección Conectores de Ajustes. Un
conector es un servidor MCP REMOTO: el catálogo es una tabla cerrada que crece por código, y uno
escrito a mano lo da de alta una persona desde la misma ventana.

- **Llegan a los agentes de TrueForge, y solo en la web** (`agent/motores/trueforge/toolsDeConectores.ts`,
  `ConectoresPort`): los que el proyecto marca en «Conectores para el chat» (`config.conectores`),
  añadidos y SIN el gestor de tareas vinculado (`conectoresParaElAgente`: en Jira/Notion escribe
  el harness). Por el MISMO servicio de Ajustes, enlazado TARDE (`ajusteDeGestorCableado
  #conectoresDeSesion`: el vestíbulo nace antes que `montarRutas`) y añadido a TODA consola por
  `banderaDeEjecutor`. Terminal, `run`, evals y motores externos no los tienen.
- **Dos conjuntos por conector: LECTURA (`readOnlyHint: true`) sin aprobación, y el RESTO con
  aprobación** —lo que el servidor no declara de lectura ESCRIBE; la etiqueta `@write` de la
  librería exige `readOnlyHint === false` y dejaría pasar una tool sin anotar—. El raíz recibe
  la lectura; un especialista, las dos si `recibeConectores` (su `escribeEn` cubre `icons/`: el
  diseñador). Nombre `<conector>__<tool>`, saneado a `[a-zA-Z0-9_-]{1,64}`.
- **Una escritura remota va SIEMPRE a una persona** (`PendienteDeAprobacion.remota`): también en
  modo autónomo —el modo gobierna lo LOCAL, como `/sync subir`— y en una tarea de fondo se
  RECHAZA y aparca. La tarjeta dice conector y tool y enseña los argumentos enteros.
- **Lo que el modelo ve se LIMPIA y se RECORTA**: el esquema sin `x-…` ni `$ref`
  (`esquemaParaElModelo`; con los de Google, Gemini rechazaba el turno entero), las tools caras
  fuera (`fueraDelAgente`) y los campos que sobran del resultado (`camposFueraDelResultado`:
  `list_projects` de Stitch, de 143 KB a 4 KB; el agente acababa lanzando scripts para contarlos).
- **Una pantalla de Stitch se TRAE con `traer_pantalla_de_stitch`** (`agent/motores/trueforge/
  traerDeStitch.ts`, reglas puras en `core/stitch.ts`): Stitch da ENLACES y el agente no baja URLs.
  El modelo da la pantalla, nunca la URL; solo se bajan los dos hosts medidos, con tope y tipo
  comprobado (la extensión la decide el tipo), y la imagen a tamaño real (`=s0`). Destino FIJO,
  `/artefactos/diseno/` (imagen, `code.html`, `DESIGN.md`), que `buscarMaqueta` prefiere y que
  `ultimaCaptura` y el crítico de pantalla NO toman por capturas del aparato. Dice los BYTES, no
  las medidas que declara Stitch (no son las de la imagen bajada). **Y la busca por TÍTULO** (`titulo`, `proyecto`; `core/stitch.ts#casanConTitulo`,
  `entradasDeStitch`): en los proyectos propios y en los COMPARTIDOS (`view=shared`), sin tildes ni mayúsculas, igual antes
  que contener; con una la trae y si no da una lista CORTA con su `name`. Medido en Maset: con solo el `name`, el orquestador
  listaba las pantallas de todos los proyectos y esos listados se le quedaban en el contexto el turno entero.
- **El DISEÑO de una tarea se ELIGE, no se busca** (decisión suya; `core/disenoVinculado.ts`, `core/stitch.ts`,
  `componentes/DisenoDelProyecto.tsx`, mensaje `diseno`): el proyecto XOne se VINCULA a un proyecto de Stitch (panel →
  Conectores → «Diseño», `config.json#disenoVinculado`) y en «Nueva tarea» se elige UNA pantalla por su miniatura
  (`list_screens` trae `screenshot.downloadUrl`, medido). Se guarda en `Tarea.pantallaDeStitch` —comprobada contra el
  vínculo por el SERVIDOR (`pantallaElegidaValida`), con el nombre del proyecto del vínculo—, el corredor la trae por su
  id a `/artefactos/diseno/` ANTES del primer turno (`prepararDisenoDeTarea`) y el encargo lleva SIEMPRE la pantalla y el
  proyecto con sus ids (`textoDePantallaElegida`); el aumentador también, y no propone otra. Medido en Maset: «Menu
  Listado Entregas» no era el título de ninguna pantalla (las de esa maqueta eran `image.png`) y la tarea construyó con
  otra. **Sin pantalla elegida**, `traer_pantalla_de_stitch` busca por PALABRAS (`casanConTitulo`: sin relleno, sin las
  comunes a todo el proyecto, singular y plural iguales) y, en una tarea, la que no aparece NO se sustituye: va a
  `## CRITICAL` (`pantallasNoEncontradas`). **Y el aumentador no AÑADE lo que la petición no pide** (medido: dio de alta
  en el menú una ventana que nadie pidió ahí). **Con pantalla elegida la tool no busca ni trae otra**: el corredor deja la
  marca `diseno/.elegida.json` (siempre, también si traerla falla) y la tool solo vuelve a traer ESA por su id; sin la
  marca, una búsqueda por el título de la petición apuntaba un CRITICAL falso o sobrescribía la elegida. **Límites
  declarados**: traerla antes del primer turno espera a Stitch (con su tope de llamada) con la tarea aún en «nuevo».
  **«Nueva tarea» y «Editar la tarea» la eligen en una pestaña Diseño, con buscador, que solo existe con vínculo**; al
  editar, el diálogo lee el diseño de un contexto (`disenoContexto.ts`, lo pone `App`) porque sale en varias vistas, y
  el servidor la vuelve a comprobar contra el vínculo (`null` la quita).
- **Una llamada de agente lleva su propio tope** (`TOPE_DE_LLAMADA_MS`, 10 min), que se pasa
  también como `timeout` al SDK: el suyo corta cada petición antes y una generación de Stitch
  pasa de él. Solo se REPITE una de lectura (`PAUSA_ANTES_DE_REPETIR_MS`); repetir una que
  genera gastaría otra. Las tools se piden a la red una vez por sesión, al primer uso.
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
  (`motivoDeClaveInaceptable`) rechaza valores con espacios. Una fila del catálogo puede nombrar
  OTRA cabecera (`cabeceraDeClave`: Stitch va en `X-Goog-Api-Key`, a secas).
- **«Conectado» con clave exige una llamada, si el servidor lista a cualquiera**
  (`ConectorDeCatalogo.comprobacion`): Stitch contesta `tools/list` sin clave y con una falsa, así
  que `probar` llama además a una tool de LECTURA (`list_projects`). Un 401/403 con clave es
  «falta autorizar (la clave no vale…)», no «no responde»: es lo que ofrece «Conectar» en el panel.
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
- **`ServicioDeConectores.llamar` respeta un pendiente vivo, igual que `probar`**: una llamada de
  trabajo mientras hay una autorización en curso pisaría el verificador PKCE que esa vuelta
  necesita. Por eso el gestor de tareas y Ajustes comparten UN solo servicio
  (`arranque.ts#ajusteDeGestorCableado`, que envuelve la MISMA fábrica de conectores): con dos
  instancias el gestor no vería el pendiente de Ajustes y la guarda no protegería nada.
- **El SDK ya invalida y reintenta un refresh muerto por su cuenta, DENTRO de `auth()`** (medido
  contra el paquete instalado, con su porqué entero en `docs/DECISIONES.md`): lo único que faltaba
  era que `motivoDe` reconociera un `OAuthError` del SDK y dijera «falta autorizar» en vez de «no
  responde» — no hay reintento propio que añadir encima del suyo.
- **Un gestor de tareas (Jira o Notion) es un conector más, con su propio puerto PURO**
  (`core/gestorDeTareas.ts`) y un adaptador por gestor (`agent/conectores/gestorJira.ts`,
  `gestorNotion.ts`), cada uno el ÚNICO fichero que conoce los nombres de tool de SU gestor y la
  forma de sus respuestas; el resto del harness solo ve `GestorDeTareasPort`. **UN gestor por
  proyecto**: vincular uno sustituye al otro y deja de usar su conector. **Qué `proyecto` vale lo
  decide su CONECTOR** (`motivoDeProyectoInaceptable`, la misma en `config.ts#validar`, `vincular`
  y los adaptadores): la clave de Jira, o el data source `collection://…` de Notion. En Notion se
  BUSCA la base (`buscarProyectos`), se DESCRIBE su esquema antes de vincular (`describir`: estado,
  título, asignado, o el motivo de que no valga) y las pendientes salen de un SQL con `params`
  (`sqlDePendientes`), nunca interpolado. Las transiciones de Notion son las opciones de su estado,
  y el data source se saca de la PROPIA página, no del vínculo. «Asignadas a mí» se DECIDE al
  vincular (Notion: solo con propiedad de persona) y se GUARDA con el vínculo
  (`gestorDeTareas.admiteMias`, `admiteMiasDelVinculo`), igual que el nombre para mostrar del
  proyecto (`gestorDeTareas.nombreDelProyecto`, el que el gestor dijo al vincular, para que
  sobreviva a un reinicio). **Una lectura que depende del vínculo** (pendientes, ficha, las
  transiciones de «empezar») **se TIRA si el vínculo cambió mientras se leía**
  (`arranque.ts#delMismoVinculo`, respuesta o fallo): fundida, pintaba filas de Jira bajo la base
  de Notion; el fallo de `buscarProyectos`/`describir` lleva su `texto`/`pedido` y el cliente solo
  pinta el de lo que tiene delante. **`estado` no toca la red** —lo contestan
  también `usarConector` y `desvincular`, y un gestor colgado no puede colgar esa casilla—. El
  comentario de cierre llega a Notion por `comentarioParaNotion` (solo cambia los marcadores de
  bloque, que Notion no pinta). **Del asignado de una tarea solo cruza el nombre visible**
  (`nombreDelAsignado`, reducido a `displayName`): el correo y el id de cuenta no salen del
  adaptador — la medida está en `docs/DECISIONES.md`.
- **Vincular un proyecto de Jira ESCRIBE la configuración solo después de que Jira confirme la
  clave** (`vincular`, `web/servidor/arranque.ts`; `guardarGestorDeProyecto`/
  `guardarConectoresDeProyecto`, `agent/config/configEnDisco.ts`): nunca antes. El vínculo vive en
  el `config.json` del PROYECTO, no en el global. **Vincular marca el conector como usado y
  desvincular lo DESMARCA**: un gestor de tareas no tiene casilla «usar en este proyecto» en el
  panel (`GESTORES_DE_TAREAS`), así que el vínculo es su único control.
- **Una instancia MEMOIZADA por conector, y `sitios()` se pide ANTES de `pendientes`/`empezar` si
  esa instancia todavía no contestó** (`web/servidor/arranque.ts`, cableado de `gestorDeTareas`):
  el adaptador de Jira cachea la URL del sitio en su propio cierre al llamar a `sitios()`, para
  componer luego `<url>/browse/<clave>`; con una instancia NUEVA en cada llamada esa caché estaría
  siempre vacía y la URL de «Abrir en Jira» no saldría nunca en producción.
- **Límites declarados**: solo a TrueForge y en la web; un conector marcado con la sesión abierta
  no llega hasta la siguiente; sin túnel (`redirect_uri` es
  `127.0.0.1`); de OAuth solo hay registro dinámico; un conector escrito a mano solo manda la clave
  como `Authorization: Bearer` (la otra cabecera es de las filas del catálogo).
