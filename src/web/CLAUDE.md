# La consola web

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

`src/web/` (servidor) y `apps/web/` (cliente): la TERCERA piel de LA MISMA consola
(`cli/consola.ts`), y la de omisión.

## Arranque, servidor y cable

- **`decidirPiel`** (`cli/main.ts`): `--cli` gana, `--web` fuerza, **sin stdin TTY la omisión NO es
  la web**. `decidirTui`: `--tui` sin TTY es USO (64); por omisión TUI con stdin Y stdout TTY.
- **La web DICE con qué código corre** (`core/version.ts`, `versionEnDisco.ts`), árbol SUCIO incluido.
  Cliente leído del DISCO en cada petición; el SERVIDOR solo cambia reiniciándolo.
- **`arrancarConsolaWeb`** (`web/servidor/arranque.ts`): sin `apps/web/dist/index.html` sale **70**;
  cwd offline avisa y sigue. `abrirEnSistema` escucha el `error` del `spawn`.
- **`node:http` en loopback y nada más** (`servidor.ts`): token en query → cookie `HttpOnly`,
  `Host`/`Origin` en TODA petición, `.xonecode` denegado por el TEXTO antes de tocar disco; cuerpo
  ilegible → 400 sin eco.
- **El vestíbulo** (`vestibulo.ts`): varias consolas por RAÍZ y un foco (`proyectoAbierto()`). Mudarse SUELTA los sumideros
  (`Transporte.soltar`); la aprobación en vuelo se REEMITE (`mensajesDeAprobacion()`).
- **El cable habla con TODOS los clientes** (`transporte.ts`, un `Set`); la ráfaga de bienvenida solo
  al recién llegado.
- **El turno en vuelo lo DICE el servidor** (`clase: "turno"`, fin en `finally`). `clase: "cancelar"` →
  `SesionReal.cancelar()`: aborta el stream y **deja la sesión viva**.
- **En el navegador «/» es PROSA** (`cli/consola.ts#LineaDeConsola`, `comoComando`); una `string` a
  secas sigue siendo comando.
- **La clave de API viaja SOLO por `leerSecreto`** y se PRUEBA antes de escribirse en `auth.json`
  (`motivoDeClaveInaceptable`). Trampa: `guardarCredencial` escribe TAMBIÉN en `process.env`, a
  propósito.
- **`localStorage` es de ESTE navegador**: todo acceso envuelto en `try`.
- **Nada se trae de un CDN** (tipografías e iconos empaquetados): offline de primera clase.

## Lo que no se puede escribir se puede leer (IXCODE-36)

- Con una tarea escribiendo en un proyecto, una persona no ENVÍA nada en él
  (`vestibulo.ts#MOTIVO_PROYECTO_CON_TAREA`, `hayTareaEn`, solo la puerta de personas); vale desde
  que el corredor ELIGE la tarea (`reservadas`), porque una tarea ya arranca con el proyecto abierto
  (IXCODE-61). El cliente apaga caja y «+».
  Sus conversaciones SÍ se abren. **Límite**: que no nazca una conversación lo sostiene el CLIENTE;
  un mensaje que llegue igual no corre turno pero su acto se vuelca.
- Lo que no se puede ABRIR se LEE sin consola (`{clase:"leerSesion"}`, índice del DISCO; `mirar` en
  vivo), en `LecturaDeSesion.tsx`; «Ver lo que hace» lleva ahí (`MirarTarea#alIrAlChat`). La barra
  mira las DOS marcas de «trabajando»: la del proyecto solo viaja si ninguna fila lleva la suya.

## Entornos, proyectos y su panel

- **Ajustes: UNA pestaña por entorno, y abrirla NO cambia el activo** (`atenderProyectosDeEntorno`);
  sin caché; lo marcado, `elegidosPorEntorno`.
- **Un entorno se registra SOLO si conecta, y se puede QUITAR** (`arranque.ts#atenderAlta`): lo
  decide el SERVIDOR (**409 con motivo**). Las copias se QUEDAN salvo con «borrar también las
  copias» (DESMARCADA al abrir); el botón rojo exige teclear el nombre.
- **Los FIJADOS son otra lista del entorno** (`Entorno.fijados`, `accion: "fijados"`), arriba y sin
  repetirse. Se escriben por separado desde el entorno ENTERO; el store del cliente es lista BLANCA
  por campo: un campo sin nombrar ahí no se pinta.
- **Pulsar un proyecto abre su PANEL** (`PanelDelProyecto.tsx`, `App.tsx`): Resumen, Sincronización, Ejecutar
  (la MISMA pestaña de la conversación, `App.tsx#pestanaDeEjecutar`, IXCODE-58), Tareas, Soporte, Conectores. El proyecto YA abierto enseña el panel SIN mandar `sesion`; «+» y una sesión de la
  barra llevan al chat. **Una sola fila marcada** (`proyectoEnResumen` manda); con panel delante
  ningún chat va marcado.
- **Resumen** (`ResumenDeProyecto.tsx`), en TARJETAS: arriba la COPIA (pastillas, Descargar, «Abrir carpeta», «Borrar
  copia local») y las conversaciones nuevas, una fila de cifras (sin subir, tareas, gasto, planes), las tarjetas de los
  PLANES (`debajoDeLasCifras`) y el gasto por sesión. Sin cola llegada, sin tarjeta de tareas. **Sin copia el panel abre SOLO el Resumen** (`App.tsx#panelSinCopia`) sin abrir nada en el
  servidor, y dice por qué faltan Tareas y Conectores. «Abrir carpeta» (`accion: "abrirCarpeta"`)
  lo lanza el SERVIDOR (`comandoParaAbrirDirectorio`); **límite**: por un túnel abre en su máquina.
- **Lo pendiente de subir es UNA foto** (`accion: "resumen"`, `FotoDelResumen`) en la respuesta del
  POST, guardada CON el id del proyecto (la de otro se tira). Pendientes = `lecturaDeSync`, la MISMA
  medida que la banda (un fichero no seguido no cuenta, un renombrado cuenta dos). Tareas decididas
  por el SERVIDOR (`mismaRuta`).
- **El gasto va en TOKENS por sesión** (`gastoDelProyecto.ts`, `SESIONES_EN_EL_GASTO`): gráfico, cada
  cuenta con su convención de caché, sin sumarse; el total dice cuántas no constan. **Suma lo del turno EN CURSO**
  (`EntradaIndice.consumoEnCurso`, apuntado por el volcado a mitad; el `fin` lo suelta) y el alta se reanuncia cada
  `INTERVALO_DEL_GASTO_EN_CURSO_MS` mientras alguien trabaja: una tarea es un turno largo. **Una tarea en marcha dice
  cuánto lleva y cuánto va gastando** (`Corredor.gastoEnCurso` → `TareaDelCable.gastoEnCurso`, reemitido con ese mismo
  reloj; el tiempo corre en el cliente contra `empezada`); Finalizadas pone sus tokens en la línea plegada. Colores
  `--xonecode-gasto-*` validados con `dataviz` por MODO; **límite**: no contra los otros temas.
- **Soporte** (`soporte.ts`, `core/paqueteDeSoporte.ts`, `core/analisisDeSesion.ts`): solo con copia;
  chats (`SESIONES_EN_SOPORTE`) y tareas; **las filas NO abren el chat**. Tres paquetes por `GET /soporte`, raíz del SERVIDOR
  (`motivoParaNoExportar`). **Nunca viajan** `.git`, `.env` ni
  credenciales (`viajaEnSoporte`). **El zip se ESCRIBE en flujo** (`ZipDeflate` de fflate, `drain`;
  nunca `zipSync`). **Checkpoint copiado EN CALIENTE** (backup SQLite, solo lectura), el de un chat
  recortado a su hilo con todas sus `checkpoint_ns`. Con turno en vuelo se exporta igual y el
  manifiesto lo dice. **Trazas de un chat = líneas con su `chat`** (id de la SESIÓN, no del hilo),
  nunca por fechas; lo demás solo en el del proyecto. **El análisis no lee el `texto` de un acto
  `sistema`**. **Límites**: un rechazo no deja acto; «sin
  verificar» puede ser un artefacto; puede llevar rutas (excepción a `sinRutas`).
- **Borrar la copia local la CIERRA antes** (`vestibulo.borrarCopia`) y suelta el checkpointer
  (`cerrarCheckpointerDeProyecto`). Del cable solo el ID; ruta de `rutaDeWorkspace` (texto y
  `realpath`). **Se RENOMBRA a una lápida oculta antes de borrar**
  (`borrarCopiaDeProyecto`, Windows). 409 con motivo (`motivoParaNoBorrarCopia`) con turno en vuelo
  o tarea sin terminar; una consola abierta no es motivo. **Se lleva su HISTÓRICO de tareas**
  (`borrarTarea` en `copiaLocal`), sin tocar el ticket.
- **Copia «bajada» = `config.json` Y `sync.json`** (`esProyectoEnDisco`); fallo de descarga → `fallos.jsonl`.

- **El Escritorio de su lienzo** (la barra lateral NO se toca, decisión suya): saludo con el entorno al lado,
  «Trabajando ahora» (la primera en marcha, `EnMarcha`), proyectos en rejilla, y Tareas y Tu equipo en dos columnas.
  Las tareas nacen en CIFRAS (`ResumenDeTareas`); «Ver el tablero» monta el `Kanban` de siempre (`tableroAbierto`).
- **El chat**: la persona en burbuja a la derecha CON su icono, el agente a la izquierda con el de XOneCode (petición
  suya); «Trabajo del agente» es una pastilla (`.tramo`) que nace SIEMPRE plegada.

## Gestor de tareas y conectores

- **Tareas**: primero las de background, debajo las del gestor vinculado. FOTO con hora, sin sondeo;
  sin vínculo lo DICE. **Filtro por ESTADO del CLIENTE** (pastillas con cuenta, `aria-pressed`,
  `ESPERANDO_PRUEBA` desmarcado); «Asignadas a mí» del SERVIDOR (`mias`), solo con
  `estado.admiteMias === true`, pintado según la RESPUESTA (`pendientes.mias`).
- **Lo que DICE el panel sale del gestor VINCULADO** (`nombreDelConector`), nunca «Jira» a fuego; la
  clave se enseña con `etiquetaDeClave` y viaja ENTERA; el `collection://` de Notion no se pinta.
  **Notion en tres pasos** (`VinculoDeNotion`): buscar, DESCRIBIR el esquema, vincular con
  `esquema.proyecto`; respuestas de otra búsqueda/base no se pintan. La fila despliega su `ficha`.
- **Conectores en DOS secciones**: «Gestor de tareas» (Jira/Notion, UNO por proyecto; sustituir se
  AVISA) y «Conectores para el chat». **Conectar desde el panel** con el MISMO
  `{clase:"conector", accion:"autorizar"}`; «Conectar» solo si FALTA la credencial
  (`BotonDeConectar`); sin prueba se PRUEBA solo una vez por montaje (`useProbarLoSinProbar`); tras
  una prueba nueva y buena se reintenta lo fallido una vez (`useReintentoTrasConectar`). «no está
  conectado» = no AÑADIDO → «Añádelo en Ajustes».
- **«Nueva sesión con esta tarea» liga la sesión a su ticket** (`EntradaIndice.ticket`,
  `anotarTicket`): cruzan CLAVE y CONECTOR (se CIERRA en el del ticket). El encargo llega al compositor EDITABLE y SIN enviar.
- **En el gestor escribe el HARNESS, nunca el agente, cada escritura con su tarjeta**
  (`TarjetaDeJira.tsx`): EN CURSO al empezar (con «empezar sin tocar Jira»), comentario + transición
  al cerrar (editable; un `error` no repinta lo escrito). Si «empezar» falla la sesión se abre IGUAL
  y se avisa después. **Con turno en vuelo «empezar» no toca Jira.** Comentario escrito y transición
  fallida → `cerrado` con `falloDeTransicion`, nunca `error` a secas. Transiciones pedidas al sitio
  del TICKET. Correos TACHADOS en errores (`sinCorreos`).
- **El comentario de cierre lo compone el CÓDIGO** (`core/gestorDeTareas.ts#comentarioDeCierre`,
  `datosDeCierre.ts`): ficheros y commits reales, último veredicto («no corrió» sin uno), última
  respuesta recortada (`TOPE_DEL_RESUMEN_DE_CIERRE`), ficheros con su ATRIBUCIÓN. **Límite**: nadie le
  pasa aún un PLAN.

## Sesiones y el chat

- **Abrir una sesión NO espera al aviso de git** (`MS_DE_TRABAJO_AL_ABRIR`, 2 s): se acota la ESPERA.
- **Una sesión reabierta lo DICE el servidor** (`alta.historica`), reanunciado en los DOS flancos del
  turno, en una microtarea.
- **De quién es una sesión se GUARDA** (`EntradaIndice.tarea`, `marcarTareaDeSesion`).
- **La sesión entra en el índice con el MENSAJE.** **Y se vuelca A MITAD de turno**
  (`INTERVALO_DE_VOLCADO_MS`, 5 s) solo hasta `ConsolaWeb.estables()`: el `.jsonl` solo anexa.
- **La hora la estampa el SERVIDOR** (IXCODE-24, `cuando` en `usuario`/`asistente`; la respuesta, al
  EMPEZAR), va al disco; sin `cuando` no se pinta. Hora y copiar siempre a la vista, siempre con el día.
- **Los dólares del asistente se ESCAPAN** (`protegerDolares.ts`) fuera de código; copiar y Trazas
  llevan el original.
- **Un ARTEFACTO pertenece al tramo pero no se pliega con él** (`Chat.tsx`, `ES_PULSO`): tarjetas FUERA
  del `<details>`, agrupadas, **no cuentan como pasos**. Una IMAGEN, miniatura `<img>` a la ruta HTTP.
- **El HUECO entre actos**: dos valores, `--dsh-chat-flow-gap` en el HIJO (`Chat.module.css`).
- **Los actos de `sistema` se reparten por CLASE, que viaja con el acto**: `aviso` bajo
  «Verificaciones» en su tramo; **`permiso` NO se pinta** (sí en el acto y Trazas); ausente, suelto.
  Se pliega el párrafo, nunca el hecho. `pausa`, un acto POR pendiente. `razonamiento` es su propio
  acto (`textoDe` lo EXCLUYE). Parciales a `MS_ENTRE_PARCIALES` (80 ms).
- **El RESUMEN de contexto es un acto de clase `resumen`** (`ETIQUETA_DEL_RESUMEN`, `resumenConEncargo`),
  único plegable en markdown. **Límite**: solo se etiqueta `invoke`.
- **Una espera de humano saca del panel al chat en el MISMO render** (`App.tsx#hayEsperaDeHumano`).
  **Una DECISIÓN no**: su diálogo va en UN sitio de `App` (`dialogoDeDecision`), por portal.

## Ficheros, Revisión y Sincronización

- **El lector filtra con las MISMAS reglas que el agente** (`puedeLeerRuta`, `esVistaAplanada`), texto
  y `realpath`, por UN resolvedor (`resolverEnProyecto`) también para guardar. Sin seguir enlaces
  (`lstatSync`). Imagen por EXTENSIÓN, en `<img>`.
- **Guardar es la ÚNICA escritura del cliente en el proyecto** (`escribirFicheroDeProyecto`): sin tarjeta, MISMAS guardas que leer, negado por RAÍZ con turno de
  persona o tarea viva (`motivoParaNoEditarFichero`, `vestibulo.motivoParaNoEditar`), concurrencia
  por HUELLA sha256. Cada guardado lleva un `id` del cliente (vuelve en `ficheroGuardado`) y el
  `proyecto` con que se ABRIÓ (`arranque.ts#proyectoActivoDe`): si no casa, no escribe. Atómica, con
  permisos y BOM. Solo texto ENTERO (`esEditable`); sin «Editar» se dice por qué. **Un latin1 se guarda en su tabla de
  8 bits** con `core/codificacion.ts` (decide el DISCO, nunca el cliente); un carácter que no cabe se
  NIEGA con línea, nunca un `?`.
- **CodeMirror solo en `apps/web/src/editor/`, y solo por `import()`** (`editor/frontera.test.ts`); tema
  por variables CSS, nunca `EditorView.theme`. Marcas con `@codemirror/merge` contra una BASE
  (`agent/sesiones/baseDeFichero.ts`); sin base, se dice. **El texto vive en `App`** (`usarEdicion.ts`);
  salir con cambios pregunta (`CambiosSinGuardar.tsx`). Cambio de proyecto por el SERVIDOR: con
  cambios se CONSERVAN y guardar se apaga (`proyectoCambiado`). Conflicto: «Seguir con los míos»
  ADOPTA la huella. **Límites**: ni crear/borrar/renombrar; tarea de otro proceso invisible; recortado =
  lectura; fuera de `escriturasEnSerie`; hueco sin cerrojo; `/sync bajar` no es turno; `.xonecode.tmp`.
- **Revisión arranca PLEGADA**; lo desplegado se OLVIDA solo cuando el store tira la foto.
- **UN árbol y UN juego de iconos** (`Arbol.tsx`, `IconoDeFichero.tsx`) para Ficheros, Revisión y la
  subida; color `--xonecode-icono-*`.
- **Subir es del PROYECTO: pestaña «Sincronización»** (`PanelDelProyecto#sincronizacion`, solo con
  copia), Revisión en modo `pendientes`: banda, últimas subidas del chat abierto y lo pendiente con
  diff CONTRA CLOUDSTUDIO (`pendientesDeSubida`/`parcheDeSubida`). Lo no seguido sale `sinCommitear`. **Un diff solo de una
  ruta de la lista RECIÉN medida que pase el lector** (`motivoParaNoEnsenar`): un `.env` sale en la
  lista, su diff NUNCA. Cifra y lista JUNTAS. **La Revisión del CHAT** marca lo pendiente en el
  SERVIDOR (`arranque.ts#marcarPendientes`, `FicheroTocado.pendiente`), no cruzando en el cliente.
  Límite: esos diffs son contra el sello de la sesión.
- **La banda de CloudStudio**: `estado` MEDIDO contra la ref de la bajada (`gitSync.ts#cambiosPendientes`)
  sin MCP; `subir`/`bajar` se ENCOLAN como `/sync <accion>` (mismo plan, guarda y aprobación que el
  terminal). `proyecto`/`rama` ausentes ≠ cero. Al día «Subir» no se pinta, solo con la subida MEDIDA.
  `BotonSubir` también en el Resumen (proyecto ABIERTO); con turno en vuelo se apaga diciendo por qué. **El recorrido va a la BANDA**
  (acto `sincronizacion`, `anotarSincronizacion?` opcional), EXACTAMENTE lo del terminal, sin subidas
  CANCELADAS.

## Apariencia y maquetación

- **Ningún color literal fuera de `estilos/marca.css`, `splash.css` y `src/temas.ts`**
  (`Barra.test.tsx`, todos los `.module.css`, `transparent` incluido). El cian es ACENTO, no texto.
- **Un tema por MODO** (`src/temas.ts`, `estilos/temas.css`, `apariencia.ts`): semillas
  (`NOMBRES_DE_SEMILLA`) → `--tema-*` + `data-tema` en `body`; el puente reparte a `--dsw-alias-*`,
  `--dsw-specific-*`, `--xonecode-*`, `--shiki-*`. **XOneCode no tiene semillas** (QUITA `data-tema`).
  Por navegador (`xonecode.tema.claro`/`.oscuro`); id desconocido = el PRIMERO del modo. **Elegir un tema lo ENSEÑA** (`App.tsx#alCambiarTema`).
  Contraste WCAG en `temas.test.ts` (se arregla la semilla, nunca el umbral); puente completo, sin
  literales y alias EXISTENTES en `estilosDelCliente.test.ts`. Derivados REDECLARADOS en el puente.
  **La BARRA tiene tokens propios** (`--xonecode-barra*`; `--xonecode-barra-placa` no se puentea);
  una superficie de marca no se pinta con `--xonecode-azul`. **Límite**: OpenUI solo recibe claro/oscuro.
- **Enviar, AZUL de marca** (en un tema, su acento); PARAR, ROJO.
- **El compositor en TRES BANDAS**: en REPOSO la de arriba se DESMONTA por `:focus-within` en CSS,
  nunca `onBlur`; `data-con-texto` la mantiene. **Trampa**: un `color-mix` con alias del TEMA no
  vive en el `:root` de `marca.css`. `margin-left: auto` en gasto+botón; el gasto se retira antes.
- **El MODO, con un CONMUTADOR** (`SelectorDeModo.tsx`), `aria-pressed` en las DOS mitades.
- **Iconos copiados** (`IconosDelCompositor.tsx`); el compositor DICE sus teclas en el placeholder.
- **Una consulta de contenedor declara su contenedor en la MISMA hoja** (`Barra.test.tsx`) y no
  estila a su PROPIO contenedor: envoltorio.
- **Las TRES columnas las reparte `apps/web/src/repartoDeColumnas.ts`** (puro, con test); lo que no
  cabe se DESMONTA; única concesión: plegar la barra SOLA si caben chat + panel; pedirla cierra el panel.
- **Un control sin dato detrás no se pinta.**
- **Lo que se pliega se DESMONTA**, ni `visibility`/`display: none`.

## Artefactos

- **DOS capas de sandbox** (`GET /artefacto?n=<nombre>`): iframe `sandbox="allow-scripts"` sin
  `allow-same-origin` + CSP `sandbox allow-scripts`, `nosniff`, `no-store`.
  Barrera `esRutaDeArtefacto` en texto **y** `realpath`. El almacenamiento lanza dentro
  (`SKILLS_VISUALES` lo dice).
- **Un `.openui` se sirve en su visor, sin red** (`visorOpenui.ts`, `apps/web/src/openui/`): entrada de
  build APARTE, la app no importa `@openuidev` (`openui/frontera.test.ts`). Al agente lo trae el
  skill `openui-builder`, solo en TrueForge (`capacidadDeOpenui`).

## Sesión remota (EXPERIMENTAL, detrás de un interruptor)

- `puenteRemoto.ts`, `core/remoto.ts`, `puenteWebSocket.ts`; relé y web móvil en `xonecode-server`. Apagada por omisión: `settings.remoto.habilitado` (interruptor de
  Ajustes, `accion: "habilitar"`) o `XONECODE_REMOTO=1` (`porEntorno`), leído en CADA uso. `remoto`
  sale SIEMPRE con `habilitado`; apagada solo se atiende `habilitar`/`apagar`, **no se mide ngrok ni
  se carga** `@xone/xonecode-remoto` (`import()` dinámico en UN fichero). Quitar el interruptor
  APAGA antes; `apagar` se atiende siempre. Relé mudo: `abriendo` → `reconectando` sin `url`.
- **El paquete VIAJA DENTRO**: copia CONSTRUIDA en `vendor/xonecode-remoto/`, `file:` +
  `bundleDependencies`; se renueva con `npm run remoto:traer` (`scripts/traerRemoto.mjs`, solo si
  pasan los tests del otro repo); `src/vendorRemoto.test.ts` vigila su forma. **Límite**: estar AL
  DÍA no se comprueba; `origen.json` dice commit y suciedad.
- **Vía por omisión: ngrok** (`remotoEnVigor`), salvo `remoto.servidor` a mano o `via` explícito.
- **Cada móvil es un sumidero más** (`engancharCliente`/`soltarCliente`), y su `alta` lo compone
  `engancharMovil` SOLO para él. Sale por `filtrarSalida` (`alta` → `remoto.estado`, `remoto` nunca)
  con `TOPE_DE_SALIDA_BYTES`; entra por `validarEntradaDelMovil` → `cancelarTurno`/`recibirEnLaConsola`.
  **La `respuesta` va por `responderDesdeElMovil`**: solo una `pregunta` SIN `decision`. Capturas del
  hilo a petición, solo IMÁGENES (`MIMES_DE_ARTEFACTO_AL_MOVIL`), en trozos (`trozosDeArtefacto`).
- **UN canal cifrado por encendido**, conservado al reconectar; entrada y salida EN ORDEN. Un error
  cruza solo como `code` o texto FIJO. La `url` lleva el secreto en el fragmento. **Límites**: la URL controla la sesión hasta
  revocar/apagar; actos, diffs y rutas SALEN cifrados.
- **PANEL móvil** (`core/panorama.ts#componerPanorama`, `panorama`): SOLO a móviles, al entrar y al
  cambiar algo (`Vestibulo.alCambiarEsperas`), como mucho uno por intervalo (`INTERVALO_DE_PANORAMA_MS`, 1 s); topes (primero diffs, `recortada`). Id de consola OPACO
  por encendido; la raíz no cruza. **Una `decision` con `consola` va a ESA y nunca cae al foco**; si no
  casa, se DESCARTA e informa. `feedback`/`continuar` = las de `POST /accion`, solo en
  `requiere-atencion`. El móvil no abre, mueve foco ni gestiona tareas. **Límites**: aprueba en
  CUALQUIER consola; salen nombres, títulos, motivos y diffs; proyecto = `basename`; `recortada` solo se RECHAZA.
- **ngrok** (`tunelNgrok.ts`, `core/tunel.ts`): relé del paquete en loopback, publicado por ngrok.
  Dominio en `settings.remoto.ngrok.dominio`; la vía solo se cambia apagada; Revocar conserva el túnel. **La
  dirección sale del LOG JSON** (`urlPublicaDeLinea`, `TOPE_DE_TUNEL_MS`), no de la API. **`detached`,
  se mata su GRUPO** antes que el puente y tras cerrar el canal (`CanalRemoto.cerrar`,
  `TOPE_DE_CIERRE_MS`); un encender espera al cierre anterior; sin claves (`entornoDeShell`). **El
  authtoken se TECLEA en Ajustes** (o `leerSecreto`) → `~/.xonecode/ngrok.json` (0600,
  `guardarAuthtoken`), nunca de vuelta (vuelve `cuenta`). Errores por `MOTIVOS_DEL_TUNEL` según
  `ERR_NGROK_…`. Se instala con el corredor de Dispositivos. **Límites**: «Visit Site», dirección
  cambiante sin dominio, authtoken en `ps`, solo PATH, SIGKILL huérfano, móvil ausente en «conectando».
