# La consola web

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# La consola web

`src/web/` (servidor) y `apps/web/` (cliente): la TERCERA piel de LA MISMA consola
(`cli/consola.ts`), y la de omisión.

- **`decidirPiel`** (`cli/main.ts`): `--cli` gana siempre, `--web` la fuerza sin terminal, y **sin
  stdin TTY la omisión NO es la web**. `decidirTui` igual: `--no-tui` gana, `--tui` fuerza (sin
  TTY es error de USO, 64), por omisión TUI solo con stdin Y stdout TTY.
- **La consola web DICE con qué código corre** (`core/version.ts`, `agent/config/versionEnDisco.ts`,
  opción `version`), antes que la URL. El cliente se lee del DISCO en cada petición
  (`servidor.ts`, `readFileSync`); el SERVIDOR es el proceso y solo cambia parándolo y
  arrancándolo. El árbol SUCIO se dice.
- **La sesión remota (EXPERIMENTAL, detrás de un interruptor)** (`web/servidor/puenteRemoto.ts`, `core/remoto.ts`,
  `agent/remoto/puenteWebSocket.ts`; el relé y la web móvil se ESCRIBEN en `xonecode-server`). Apagada por omisión:
  `settings.remoto.habilitado` —lo escribe el INTERRUPTOR de Ajustes → Sesión remota (`accion: "habilitar"`)— o
  `XONECODE_REMOTO=1` (`porEntorno`: el interruptor no la apaga en ese arranque), leído en CADA uso. El mensaje `remoto`
  sale SIEMPRE con `habilitado`, para que Ajustes pinte la sección; apagada no hay botón en el chat, no se atiende más
  que `habilitar`/`apagar`, **no se mide ngrok y no se carga el paquete** `@xone/xonecode-remoto`, que entra por `import()` dinámico de un nombre en variable en UN fichero.
  **El paquete VIAJA DENTRO de xonecode**: una copia CONSTRUIDA en `vendor/xonecode-remoto/`, declarada `file:` en
  `dependencies` y nombrada en `bundleDependencies`, así que `npm pack`/`npm publish` la meten entera y su `ws` es el de
  xonecode; se renueva con `npm run remoto:traer` (`scripts/traerRemoto.mjs`: corre los tests de `xonecode-server` y
  solo si pasan sustituye la copia entera), y `src/vendorRemoto.test.ts` vigila su forma. **La vía por omisión es
  ngrok** (`core/settings.ts#remotoEnVigor`), salvo un `remoto.servidor` escrito a mano; un `via` explícito manda, y el
  servidor manda siempre la vía EN VIGOR. **Límite declarado**: que la copia esté AL DÍA con `xonecode-server` no se
  comprueba sin el otro repo; `origen.json` dice de qué commit sale y si su árbol estaba sucio. **Quitar el interruptor desde Ajustes APAGA antes lo encendido**; quitado
  a mano en `settings.json` con el puente abierto, el botón del chat sigue y `apagar` se atiende siempre: no puede quedar
  abierto e invisible. Un relé que no contesta pasa de `abriendo` a `reconectando` sin `url`, y se puede apagar en los
  dos. **Cada móvil es un sumidero más** enganchado por la MISMA puerta que una
  pestaña (`engancharCliente`/`soltarCliente`): la ráfaga de `adjuntar`, se muda con el foco, cuenta como «hay alguien
  delante». El `alta` no va en esa ráfaga (la pestaña lo recibe de la ruta SSE, después de enganchar), así que el móvil
  entra por `engancharMovil`, que le compone uno SOLO a él: difundirlo daría uno de más a cada pestaña.
  Lo que sale pasa `filtrarSalida` (el `alta` sale TRANSFORMADO en `remoto.estado`, y `remoto` no sale nunca) y no pasa
  de `TOPE_DE_SALIDA_BYTES` (una `reemision` pierde los actos más viejos; otro mensaje que no quepa se descarta y se
  informa); lo que entra pasa `validarEntradaDelMovil` y se despacha por `cancelarTurno`/`recibirEnLaConsola`, el código
  de `POST /accion`. **Salvo la `respuesta`, que va por `responderDesdeElMovil`**: al móvil solo le llega la `pregunta`
  SIN `decision`, así que solo contesta una de ésas, nunca la subida con casillas ni «¿Vaciar la copia…?» del escritorio
  (por `recibir`, un «s» del móvil las aprobaba); sin ninguna que contestar se descarta y se informa. La clase de un
  mensaje rechazado solo llega al terminal si es un nombre limpio. **Las capturas del hilo se VEN en el móvil, a
  petición** (`artefacto` con su ruta virtual): el anfitrión la lee con las MISMAS barreras que `GET /artefacto` sobre la
  conversación del foco, solo IMÁGENES (`MIMES_DE_ARTEFACTO_AL_MOVIL`: un HTML no tiene en la web móvil con qué
  aislarse) y con tope, y la manda en trozos numerados (`trozosDeArtefacto`) porque no cabe en un mensaje. **UN canal cifrado por encendido, conservado en las reconexiones**: uno nuevo al reconectar dejaría
  al relé repetir mensajes viejos del móvil; y lo que llega del relé se procesa EN ORDEN (el canal tira toda secuencia no
  mayor que la última); lo que SALE se cifra y se manda también en cola, en el orden de llamada, por la misma razón vista
  desde el móvil. Revocar no anuncia el apagado de en medio. Un error cruza el cable solo como `code` de Node o texto FIJO nuestro, nunca lo que diga el relé.
  La `url` con el secreto en el fragmento es el TERCER secreto del cable, tras `leerSecreto` y el `codigo` de
  `motorLocal`; el cuarto es el authtoken de ngrok tecleado en Ajustes. **Límites declarados**: quien tiene la URL controla la sesión hasta «Revocar» o «Apagar»; y con la sesión
  encendida, los actos y las aprobaciones —contenido de ficheros y diffs incluidos, y las rutas que el modelo escriba—
  SALEN de la máquina, cifrados de punta a punta, hacia el relé y el móvil.
  **Y un PANEL en la web móvil** (`core/panorama.ts#componerPanorama`, mensaje `panorama`): las consolas de persona
  abiertas —la del foco y las que siguen con un turno en segundo plano— con su estado y su aprobación en vuelo, y las
  tareas. Va SOLO a los móviles (`puenteRemoto` `difundir`/`alEntrarMovil`), nunca a una pestaña: al entrar, y cuando
  cambia algo —flanco de turno, cola de tareas, nace o muere la espera de una consola (`consolaWeb.alCambiarEspera`,
  agregado en `Vestibulo.alCambiarEsperas`), foco, volcado— como mucho uno por intervalo (`INTERVALO_DE_PANORAMA_MS`,
  1 s). Con topes de tamaño: primero se van los diffs (`recortada`), luego las tareas terminadas. Una consola viaja
  con un id OPACO por encendido, que se olvida al apagar, caer o revocar; la raíz no cruza nunca. **Una `decision` con
  `consola` va a ESA consola y nunca cae a la del foco**: con un id que no existe, sin aprobación en vuelo o con ids que
  no casan con los que esa consola tiene pendientes se DESCARTA y se informa —una decisión que se cayera al foco, o una
  tarjeta vieja, rechazaría lo que la otra tiene delante—. `feedback` y `continuar` son las MISMAS funciones que los
  botones del escritorio (extraídas de `POST /accion`), y solo con la tarea en `requiere-atencion`. El móvil no abre
  sesiones, ni mueve el foco, ni crea, encola, descarta ni arranca tareas; una pregunta de texto fuera de foco se ENSEÑA
  pero se contesta en el escritorio, y las consolas de tarea se ven como tareas. **Límites declarados del panel**: la
  URL aprueba escrituras de CUALQUIER consola abierta y da feedback a las tareas; salen de la máquina, cifrados, los
  nombres de proyecto, los títulos de sesión, los títulos y motivos de las tareas (un motivo es texto del anfitrión y
  puede nombrar una ruta: se recorta) y los diffs de las consolas fuera de foco; el proyecto es el `basename` de la
  raíz, así que el mismo nombre en dos entornos se confunde; y una tarjeta del panel con `recortada` (diffs cortados o
  quitados para caber) solo se RECHAZA desde el móvil —sin «Aceptar»—, porque no se aprueba lo que no se ha visto entero.
  **Y una SEGUNDA vía, el túnel local por ngrok** (`agent/remoto/tunelNgrok.ts`, `ngrokEnMaquina.ts`, `core/tunel.ts`):
  el relé viaja EN el paquete (subruta `./servidor`, con la web móvil dentro), xonecode lo arranca en loopback y ngrok lo
  publica; el QR lleva la dirección de ngrok. La vía (`settings.remoto.via`) y el dominio fijo opcional
  (`settings.remoto.ngrok.dominio`) son ajustes, y la vía solo se cambia con la sesión apagada. Revocar conserva el túnel.
  **La dirección se lee del LOG JSON de ngrok, no de su API local** (`urlPublicaDeLinea`; la API se muda de puerto si el
  suyo está ocupado), con tope (`TOPE_DE_TUNEL_MS`). **ngrok va `detached` y se mata su GRUPO** al apagar, al caerse el
  canal y al cerrar la consola, ANTES que el puente; pero DESPUÉS de que el canal cierre (`CanalRemoto.cerrar` es una
  promesa, con tope `TOPE_DE_CIERRE_MS`): el «cerrada» del relé al móvil viaja por el MISMO túnel. Un encender tras apagar
  espera a que el ngrok anterior termine de cerrarse. ngrok no hereda las claves de proveedor (`entornoDeShell`). **El
  authtoken se TECLEA en Ajustes → Sesión remota** (campo de contraseña; la acción `authtoken` lo lleva en `authtoken`,
  CUARTO secreto del cable) o, sin él, por `leerSecreto`, y se guarda en `~/.xonecode/ngrok.json` (0600,
  `guardarAuthtoken`): nunca en un log, nunca de vuelta al cliente —vuelve la MEDIDA, `cuenta`— y el campo se vacía al
  mandarlo. Lo que diga ngrok no
  cruza: solo un texto de `MOTIVOS_DEL_TUNEL`, elegido por el código `ERR_NGROK_…` (108 y 334 son «otro ngrok de tu cuenta
  abierto», no un authtoken malo). Instalarlo es una receta del corredor de Dispositivos (macOS con `brew`; Windows y
  Linux, guía sin botón) que no sale en la pestaña de aparatos, y al acabar se vuelve a medir solo ngrok. **Límites
  declarados**: el móvil ve el aviso de ngrok («Visit Site») la primera vez; sin dominio fijo la dirección cambia en cada
  encendido; el authtoken se ve en `ps` mientras corre `add-authtoken`; ngrok solo se busca en el PATH; un SIGKILL a la
  consola deja ngrok huérfano; y un móvil que no estaba delante al apagar se queda en «conectando» (ngrok contesta su
  propia página de fuera de línea y el navegador no deja leer el estado de un WebSocket que no abre).
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
- **Lo que no se puede ESCRIBIR se puede LEER** (IXCODE-36). Con una tarea escribiendo en un
  proyecto, una persona no ENVÍA nada en él: el turno no corre (`vestibulo.ts#MOTIVO_PROYECTO_CON_TAREA`,
  solo la puerta de personas) y el cliente apaga la caja con su banda y el «+». Sus conversaciones SÍ
  se abren (el panel del proyecto necesita consola). **Límite declarado**: que no nazca una
  conversación nueva lo sostiene el CLIENTE (caja apagada, «+» apagado); si llega un mensaje igual
  —una pestaña vieja, el móvil—, el turno no corre pero el acto de la persona ya está apuntado y al
  cerrar se vuelca. Lo que no se puede ABRIR —la conversación de la propia tarea, o otra del
  proyecto que trabaja en una tuya— se LEE sin consola (`{clase:"leerSesion"}`, del índice del
  DISCO; en vivo por `mirar` si es la de la tarea), en `LecturaDeSesion.tsx`. «Ver lo que hace» de una tarea
  lleva a esa vista (`MirarTarea#alIrAlChat`), y una aparcada ofrece «Ir al chat para responder»: la
  caja solo sale cuando la tarea necesita respuesta. La barra mira las DOS
  marcas de «trabajando»: la del proyecto solo viaja cuando ninguna fila lleva la suya.
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
- **Los FIJADOS son otra lista del entorno, no una marca de los visibles** (`Entorno.fijados`,
  `accion: "fijados"`): salen en «Proyectos fijados», arriba, estén o no entre los visibles, y
  no se repiten abajo. Las dos listas se escriben por separado partiendo del entorno ENTERO; el
  store del cliente es lista BLANCA por campo, y sin nombrarlo ahí el grupo no se pintaba nunca.
- **Lo de la COPIA de un proyecto va arriba de la pestaña Resumen de SU panel, no en otra
  pantalla** (`ResumenDeProyecto.tsx` son piezas que monta `PanelDelProyecto.tsx`): pastillas
  (bajado / compartido) y acciones de la copia —Descargar, o «Abrir carpeta» y «Borrar copia
  local» (`BorrarCopiaLocal.tsx`)—, lo que queda por subir y el gasto; los planes, debajo. Sin
  sesiones ni tareas: las sesiones son de la barra y las tareas de la pestaña Tareas (Soporte las
  LISTA, pero solo para exportarlas y analizarlas, sin abrirlas). **Un proyecto
  SIN copia también abre su panel, con SOLO el Resumen** (`App.tsx#panelSinCopia`): no se abre
  nada en el servidor —abrir sería descargar, y eso es «Descargar» o el «+»—, ni se pregunta al
  gestor ni se enseñan planes, porque son de la consola ABIERTA, que es la de otro proyecto; el
  panel dice por qué faltan Tareas y Conectores. **Una sola fila marcada** en la barra —la del
  panel delante (`proyectoEnResumen`) manda sobre la abierta— y con el panel delante ningún chat
  va marcado. «Abrir carpeta» (`accion: "abrirCarpeta"`) lo lanza el SERVIDOR con la raíz que
  compone él (`comandoParaAbrirDirectorio`); **límite declarado**: por un túnel se abre en la
  máquina del servidor.
- **Lo que queda por subir es UNA foto** (`accion: "resumen"`, `FotoDelResumen`), que vuelve en
  la PROPIA respuesta del POST y se guarda CON el id del proyecto: una respuesta de otro se tira
  (el fallo que cerró `ramasDe`). Solo se pide con copia. Los pendientes son `lecturaDeSync`, la
  MISMA medida que la banda de CloudStudio —dos cuentas darían dos cifras—, con su límite: un
  fichero nuevo que git no sigue no cuenta y un renombrado cuenta dos. La foto trae también las
  tareas del proyecto decididas por el SERVIDOR por la raíz (`mismaRuta`); el panel ya no las
  pinta. **El gasto va en TOKENS por sesión** (`gastoDelProyecto.ts`, `SESIONES_EN_EL_GASTO`):
  un gráfico, no una lista de sesiones que abrir; cada cuenta con su convención de caché, las dos
  sin sumarse, y el total DICE cuántas sesiones no constan. Sus dos colores (`--xonecode-gasto-*`)
  están validados con el skill `dataviz` contra el fondo de cada MODO. **Límite declarado**: no se
  puentean, así que no están validados contra los fondos de los otros temas.
- **La pestaña SOPORTE exporta lo necesario para analizar qué pasó, y un análisis PREVIO hecho
  con reglas de CÓDIGO** (`web/servidor/soporte.ts`, `core/paqueteDeSoporte.ts`,
  `core/analisisDeSesion.ts`, `componentes/SoporteDelProyecto.tsx`). Solo con copia. Lista chats
  (las `SESIONES_EN_SOPORTE` más recientes) y tareas, cada uno con su insignia de gravedad y sus
  hallazgos plegados; **las filas NO abren el chat**. Tres paquetes por `GET /soporte` —proyecto
  (código + `.xonecode` + tareas), chat y tarea—, con IDS en la query y la raíz y lo que existe
  decididos por el SERVIDOR (`motivoParaNoExportar`). **Nunca viajan** `.git`, `.env` ni las
  credenciales (`viajaEnSoporte`). **El zip se ESCRIBE mientras se lee** (`Zip`/`ZipDeflate` de
  fflate, esperando al `drain`): el servidor es UN proceso para todos los turnos y un `zipSync`
  los congelaría. **El checkpoint se copia EN CALIENTE** (backup de SQLite desde una conexión de
  solo lectura), y el de un chat se RECORTA a su hilo con todas sus `checkpoint_ns`. **Con un
  turno en vuelo se exporta igual** y el manifiesto lo dice: es cuando más falta hace. **Las
  trazas de un chat son las líneas con su `chat`, nunca por fechas**: `traza-tools.jsonl` y
  `fallos.jsonl` lo llevan desde `crearDiagnosticoDeTools`/`crearRegistroDeFallos`, y es el id de
  la SESIÓN con que se abrió, no el hilo de ahora (`/nuevo` abre uno huérfano y los actos siguen
  en la misma sesión); lo que no lo lleva —y `traza-errores.jsonl`, cuyo sumidero
  es del proceso— va solo en el del proyecto. **El análisis no lee el `texto` de un acto
  `sistema`**, solo campos estructurados. **Límites declarados**: un rechazo de escritura no deja
  acto que contar, «escribió y no se verificó» puede ser un artefacto, y el paquete puede llevar
  rutas de la máquina (excepción declarada a `sinRutas`: es un fichero que se entrega a mano).
- **Borrar la copia local la CIERRA antes** (`vestibulo.borrarCopia`, el orden de
  `borrarSesion`) y después suelta el checkpointer (`cerrarCheckpointerDeProyecto`): el mapa de
  conexiones no cierra nunca, y en Windows un `checkpoint.sqlite` abierto impide borrar la
  carpeta. Del cable llega el ID; el nombre sale del listado del SERVIDOR y la ruta de
  `rutaDeWorkspace`, comprobada por el texto y por el `realpath`. **Se RENOMBRA a una lápida
  oculta antes de borrar** (`borrarCopiaDeProyecto`): con un fichero abierto por otro proceso,
  `rmSync` en Windows revienta a medias y deja una copia rota; el renombrado falla antes de
  tocar nada, así que «no se ha tocado nada» es verdad. Se niega con 409 y motivo
  (`motivoParaNoBorrarCopia`) con un turno en vuelo o una tarea sin terminar ahí; una consola
  abierta no es motivo. **Y se lleva su HISTÓRICO de tareas** (decisión suya): al borrarse de verdad, las terminadas de esa
  raíz salen de la cola con sus adjuntos (`borrarTarea`, en el manejador de `copiaLocal`), sin tocar su ticket, ya cerrado.
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
  no se deduce del texto**: `aviso` (bitácora, juez, crítico de pantalla) bajo «Verificaciones», en SU tramo. **`permiso`
  NO se pinta** (ni en el hilo ni en el inspector «Turno», petición suya): repetía lo que la
  tarjeta de aprobación enseña con su diff; sigue en el acto y en Trazas. Ausente sigue suelto y a la vista. Lo que se
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
- **Y el chat se vuelca también A MITAD de turno** (`INTERVALO_DE_VOLCADO_MS`, 5 s): solo hasta
  `ConsolaWeb.estables()`, lo de antes del último acto de la PIEL —el único que se sustituye, y no
  siempre el último de la lista—, porque el `.jsonl` solo sabe anexar.
- **La hora de cada mensaje la estampa el SERVIDOR, en el acto** (IXCODE-24, `cuando` en `usuario` y
  `asistente`): la de mandarlo, y la de EMPEZAR a llegar la respuesta (los parciales la conservan). Va
  al disco con el acto, así que una sesión reabierta enseña la real; sin `cuando` no se pinta. La de la
  respuesta va junto a copiar, y los dos siempre a la vista (nada aparece solo al posar el ratón). El
  mensaje de la persona lleva la MISMA fila (hora y copiar). Siempre con el día: «hoy a las…», «ayer a las…» (por el calendario), o la fecha.
- **`localStorage` es de ESTE navegador**: todo acceso envuelto en `try`.
- **Ningún color literal fuera de `estilos/marca.css`, `splash.css` y `src/temas.ts`** (`Barra.test.tsx` lo
  vigila recorriendo TODOS los `.module.css`), `transparent` incluido. El cian es ACENTO y no
  sostiene texto.
- **Un tema por MODO, y XOneCode no pasa por el puente** (`src/temas.ts`, `estilos/temas.css`):
  el modo (sistema/claro/oscuro) lo decide `apariencia.ts`, y encima se aplica el tema elegido
  para ESE modo. Un tema son semillas (`NOMBRES_DE_SEMILLA`) que `aplicarApariencia` escribe como
  `--tema-*` en el `body` junto a `data-tema`; el puente las reparte a los alias `--dsw-alias-*`, a los `--dsw-specific-*` con color, a los
  `--xonecode-*` con color y a `--shiki-*`. **XOneCode no
  tiene semillas**: aplicarlo QUITA `data-tema`, así que se ve como siempre por construcción. Se
  recuerda en ESTE navegador (`xonecode.tema.claro`/`.oscuro`), y un id desconocido —o ninguno— es
  el PRIMERO de su modo: XOneCode en claro y, en oscuro, el tema `azul-noche` —que se LLAMA
  «XOneCode»: superficies escalonadas teñidas del navy, petición suya—, con Grafito, Pizarra, Tinta
  cálida y SynthWave '84 (y Dracula con el texto subido). El oscuro de antes (`xonecode-oscuro`, sin semillas) y One Dark se retiraron: guardados,
  caen en el de omisión.
  **Elegir un tema lo ENSEÑA** (`App.tsx#alCambiarTema`): uno del otro modo pasa la consola a
  ese modo y la fija (saca de «sistema»); uno del modo en vigor no toca la apariencia.
  Los tests: el contraste WCAG de cada tema (`temas.test.ts`, un fallo se arregla en la semilla,
  nunca bajando el umbral), que el puente cubra CADA alias usado y no lleve literales
  y que todo alias usado EXISTA (los dos en `estilosDelCliente.test.ts`: uno inexistente resuelve a nada
  y no da error). Los derivados se REDECLARAN en el puente: en `:root` un `var()`
  se resuelve donde se declara. **La BARRA superior tiene tokens propios** (`--xonecode-barra*` en
  `marca.css`): en un tema toma la SUPERFICIE del tema y no el acento, porque
  `--xonecode-azul`/`--xonecode-sobre-azul` se puentean al acento para los botones; la placa del
  símbolo (`--xonecode-barra-placa`) NO se puentea y se queda blanca (resuelve en `:root`). Una
  superficie de marca nueva no se pinta con `--xonecode-azul`. **Las muestras de XOneCode llevan
  colores fijos** (`muestra` en `temas.ts`), porque dentro de un tema los alias del modo son los
  del tema. **Límite declarado**: el visor de OpenUI solo recibe claro/oscuro.
- **El botón de enviar lleva el AZUL de la marca** (`--xonecode-azul`/`--xonecode-sobre-azul`); el
  cian se queda para su hover; dentro de un tema es el acento del tema. PARAR se queda ROJO —es un estado, no la marca—.
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
  (`puedeLeerRuta`, `esVistaAplanada`), aplicadas DOS veces (texto y `realpath`) por UN solo
  resolvedor (`arbolDeProyecto.ts#resolverEnProyecto`), que es también el de guardar y el de la base. El árbol NO
  recorre detrás de un enlace (`lstatSync`). La imagen se decide por EXTENSIÓN, viaja como
  `mime`+`base64`, se pinta en un `<img>`, nunca marcado inyectado.
- **Ficheros EDITA, y guardar es la ÚNICA escritura del cliente en un fichero del proyecto**
  (`arbolDeProyecto.ts#escribirFicheroDeProyecto`, `componentes/Ficheros.tsx`, `editor/`): sin
  tarjeta de aprobación —lo teclea la persona—, con las MISMAS guardas que leer, negado por RAÍZ
  con un turno en vuelo de una consola de persona de esa raíz o una consola de tarea viva
  (`core/settings.ts#motivoParaNoEditarFichero`, `vestibulo.motivoParaNoEditar`), y con concurrencia
  por HUELLA: el sha256 de los bytes viaja al leer y vuelve al guardar, y si el disco ya no coincide
  no se escribe nada. **Cada guardado lleva un `id` que genera el cliente y el servidor devuelve en
  `ficheroGuardado`**: dos pestañas que parten de la misma versión no se distinguirían por la huella.
  **Y lleva el `proyecto` con que se ABRIÓ la edición**: el servidor escribe en el del FOCO y lo
  compara con el activo calculado como el alta (`arranque.ts#proyectoActivoDe`); si no coincide o no
  se puede deducir, contesta sin escribir — la huella no lo frena con el contenido idéntico (el mismo
  proyecto en dos entornos). Escritura atómica que conserva permisos y BOM; los finales de línea los
  conserva el cliente (`apps/web/src/edicion.ts`). Solo se edita el texto ENTERO, en UTF-8 o latin1,
  que no es imagen (`apps/web/src/edicion.ts#esEditable`); sin «Editar», la cabecera DICE por qué
  (`motivoParaNoEditar`). **Un latin1 se guarda en su tabla de 8 bits, no se convierte**: la
  codificación la deciden los BYTES del disco y, si son ASCII puro, el prólogo —nunca el cliente—, con
  la regla y las tablas del agente (`core/codificacion.ts`, cada codificador el inverso de su
  decodificador), y un carácter que no cabe se NIEGA con cuál y su línea, sin tocar nada —nunca un
  `?`—. Su base de marcas se decodifica igual.
  **CodeMirror solo se importa desde `apps/web/src/editor/`, y a eso solo se llega con `import()`**
  (`editor/frontera.test.ts`): quien no edita no paga el peso. Su tema son variables CSS (`.tok-*` →
  `--shiki-token-*` y alias del puente), nunca `EditorView.theme`, que escaparía a `Barra.test.tsx`.
  Las marcas del margen salen de `@codemirror/merge` contra una BASE pedida aparte
  (`agent/sesiones/baseDeFichero.ts`: la ref de la sesión o `HEAD`); sin base no hay marcas y se
  dice. **El texto vive en `App` (`usarEdicion.ts`), no en el editor**: el panel desmonta sus
  pestañas, y lo tecleado no se va con ellas; cambiar de fichero, cerrar el editor, salir de la
  pestaña, abrir otro proyecto o cambiar de entorno con cambios pregunta antes (`CambiosSinGuardar.tsx`),
  y una versión nueva del disco con cambios no los pisa. **El proyecto activo lo cambia el SERVIDOR
  sin preguntar** (otra pestaña, quitar un entorno): sin cambios la edición se suelta; con cambios se
  CONSERVA, guardar se apaga y una banda ofrece «Descartar» (`proyectoCambiado`). **Un conflicto
  tiene salida**: tras un rechazo de un guardado propio se vuelve a pedir el fichero (recarga o
  banda), y «Seguir con los míos» ADOPTA la huella del disco, así que el siguiente guardado lo
  sustituye a sabiendas y la banda lo avisa. **Límites declarados**: ni crear, ni borrar, ni renombrar;
  una tarea en OTRO proceso no se ve; un fichero recortado es de solo lectura; guardar no pasa por la cola de `escriturasEnSerie` del
  agente; la edición se atribuye en git a la sesión cuyo turno siguiente la commitea; entre comprobar
  (huella, turno, proyecto) y escribir queda un hueco sin cerrojo; `/sync bajar` no cuenta como turno,
  así que guardar MIENTRAS corre no se niega, y un guardado de contenido idéntico al bajado quedaría
  absorbido en su línea base; y un
  cierre brusco puede dejar un temporal `.X.<uuid>.xonecode.tmp` junto al fichero.
- **Revisión arranca PLEGADA**: cada diff se pide al pulsar su cabecera. El efecto de `App.tsx`
  solo OLVIDA lo desplegado cuando el store tira la foto.
- **UN árbol y UN juego de iconos de fichero** (`Arbol.tsx`, `IconoDeFichero.tsx`): Ficheros, Revisión y
  el diálogo de la subida comparten la MISMA fila (icono, líneas guía, accesibilidad); `variante` solo
  cambia el acabado y `seleccion` añade la casilla, hermana del botón. El dibujo es el molde de contorno
  de la barra (`IconosDeProyecto.tsx#Trazo`), la clasificación la de `tipoDeFichero.ts` y el color un
  token por tipo (`--xonecode-icono-*`).
- **Subir es del PROYECTO, no de un chat: vive en la pestaña «Sincronización» del panel del
  proyecto** (`PanelDelProyecto#sincronizacion`, ranura montada por `App`, solo con copia). Es la
  MISMA vista que Revisión en su modo `pendientes` (`Revision.tsx#modo`): arriba la banda de
  CloudStudio y «Últimas subidas de la conversación abierta» (salen de los actos del chat abierto,
  no son la historia del proyecto), en una región ACOTADA con scroll propio, y debajo TODO lo
  pendiente con su diff CONTRA CLOUDSTUDIO (`pendientesDeSubida`/`parcheDeSubida`,
  `arranque.ts#lecturaDePendientesDeSubida`/`#lecturaDeParcheDeSubida`). Lo que git no sigue sale
  MARCADO `sinCommitear` (la cifra de la banda no lo cuenta, y Subir se niega sin commit). **Un
  diff solo sale de una ruta que está en la lista RECIÉN medida y que pasa la regla del lector**
  (`arbolDeProyecto.ts#motivoParaNoEnsenar`, texto y `realpath`): un `.env` pendiente sale en la
  lista, su diff NUNCA. La cifra y la lista se piden JUNTAS. **La Revisión del CHAT ya no lleva
  sincronización ni registro**: solo lo de la sesión que falta por subir, marcado por el SERVIDOR en la misma foto que la lista
  (`arranque.ts#marcarPendientes`, `FicheroTocado.pendiente`): cruzar `revision` con `sync` en el
  cliente escondería lo recién escrito. Sin la marca (sin CloudStudio, o la medida falló) se
  enseña todo. Tras una subida se vuelven a pedir la lista y la cifra. Límite declarado: los diffs
  siguen siendo contra el sello de la sesión, no contra CloudStudio.
- **La sincronización con CloudStudio es la BANDA de arriba de la pestaña Sincronización del
  panel** (la ranura `cloudstudio` de `Revision`), pintada en todos sus estados. `estado` se MIDE en el servidor
  contra la ref de la bajada (`agent/sesiones/gitSync.ts#cambiosPendientes`), sin abrir sesión MCP;
  `subir`/`bajar` se ENCOLAN como `/sync <accion>` con el MISMO plan, guarda de árbol sucio y
  aprobación que el terminal. `proyecto`/`rama` ausentes no son «cero pendientes». La cifra ya NO
  dice de qué sesión son (`deLaSesion` sigue viajando y no se pinta): en el panel del PROYECTO
  «de esta sesión» no se refería a nada de lo que hay en pantalla. Con la subida al día «Subir» NO se pinta, y solo
  con la subida MEDIDA. La otra dirección se llama «Actualizar repo local» (clase sigue siendo
  `.bajar`). «Subir» está también en la tarjeta de pendientes del Resumen, como el MISMO
  `BotonSubir` y la MISMA intención, solo para el proyecto ABIERTO; gira desde el clic hasta que
  llega la pregunta, el acto de la operación, un `sync` con error o se cae el cable, y con un
  turno en vuelo se apaga diciendo por qué (la orden esperaría detrás). **El recorrido de la operación se cuenta en la BANDA, no en el hilo** (acto
  `sincronizacion`: `accion`, `cuando`, `lineas`), por un método OPCIONAL del puerto
  (`anotarSincronizacion?`); quien no lo implemente sigue recibiendo el recorrido por `escribir` al
  vuelo. Lo que el registro guarda es EXACTAMENTE lo que el terminal habría impreso. El enunciado
  de una decisión ya puesta deja de anotarse (viaja en el mensaje `pregunta`). Tampoco entra una
  subida CANCELADA.
- **Pulsar un proyecto en la barra abre su PANEL, no una sesión directa**
  (`apps/web/src/componentes/PanelDelProyecto.tsx`, `App.tsx`): pestañas Resumen (lo de la
  copia y los planes; las SESIONES y «Nueva sesión» son de la barra, no se repiten aquí), Tareas (las tareas en
  background del proyecto, PRIMERO, y debajo las pendientes del gestor vinculado, con búsqueda y
  «Nueva sesión con esta tarea»), Soporte (ver abajo) y Conectores, en DOS secciones: «Gestor de tareas» (solo Jira y Notion,
  UNO por proyecto: vincular el otro lo sustituye y la fila lo AVISA antes) y «Conectores para el
  chat» (el resto, con «Conectar» y su casilla). El proyecto que YA está abierto
  enseña el panel SIN mandar `sesion` —soltar la conversación en curso por una vacía es justo lo
  que se quería evitar—; el «+» y pulsar una sesión de la barra sí llevan al chat. Las
  pendientes son una FOTO con hora y un icono de «Actualizar», sin sondeo —«Reintentar» solo
  aparece junto a un fallo—; sin vínculo la pestaña lo DICE con el camino a Conectores, nunca una
  lista vacía que parezca «no hay pendientes». **El filtro por ESTADO es del CLIENTE** sobre la
  lista que llegó (una pastilla por estado con su cuenta, `aria-pressed`; por omisión desmarcados
  los de «esperando prueba», `ESPERANDO_PRUEBA`), y «Asignadas a mí» es del SERVIDOR (`mias`) y
  solo se OFRECE con `estado.admiteMias === true`: el asignado se deja de pintar según la
  RESPUESTA (`pendientes.mias`), no según el conmutador, y cambiar de vínculo olvida la consulta
  del de antes. **Lo que DICE el panel sale del gestor VINCULADO**: su nombre del catálogo
  (`nombreDelConector`; «Cerrar en …» de `App.tsx`, el del conector del TICKET), y sin él una frase NEUTRA —nunca
  «Jira» a fuego—; una clave se ENSEÑA con `etiquetaDeClave` (el id corto de un UUID de Notion) y
  viaja ENTERA; el `collection://` de Notion no se pinta nunca. **Notion se vincula en tres
  pasos** (`VinculoDeNotion`): buscar la base, DESCRIBIR su esquema («Estado: … · Título: … ·
  Asignado: …», o el motivo de que no valga) y vincular con `esquema.proyecto`, nunca con el id de
  la búsqueda; una `busqueda` de otro texto o una `descripcion` de otra base no se pintan. La acción de cada fila EXISTE siempre y
  se ve con `:hover`/`:focus-within`; pulsar la fila despliega su descripción (acción `ficha`, de
  LECTURA, markdown con `protegerDolares`), y lo plegado se desmonta. **Un conector añadido sin
  conectar se CONECTA desde el panel** con el MISMO `{clase:"conector", accion:"autorizar"}` de
  Ajustes (añadirlo sigue siendo de Ajustes), y «Conectar» sale SOLO cuando FALTA la credencial
  (`BotonDeConectar`): la prueba es una foto EN MEMORIA que un reinicio borra, así que un conector
  con credencial y sin prueba se PRUEBA solo, una vez por montaje (`useProbarLoSinProbar`), y una
  prueba fallida por otra cosa ofrece «Probar de nuevo»; un fallo de credencial (`falta autorizar`) lleva
  «Conectar» al lado, y lo que falló se repite SOLO, una vez, al llegar una prueba NUEVA y buena
  de ese conector (`useReintentoTrasConectar`). «no está conectado» NO es de credencial: `llamar`
  lo dice cuando el conector no está AÑADIDO, y lleva «Añádelo en Ajustes».
- **Una espera de humano saca del panel al chat, en el MISMO render** (`App.tsx#hayEsperaDeHumano`):
  una aprobación, pregunta de texto, secreto o selector pendiente hace que el panel se apague y el
  chat se encienda a la vez, así que el diálogo sale en su sitio de siempre sin duplicarlo dentro
  del panel; al contestar no se vuelve al panel de rebote. **Una DECISIÓN no**: su diálogo (la
  subida, «Actualizar repo local») se monta en UN solo sitio de `App` (`dialogoDeDecision`), fuera
  de las vistas, y sale por portal encima de donde se esté —pulsar «Subir» en el Resumen no te
  saca de él—.
- **«Nueva sesión con esta tarea» liga la sesión a su ticket, y por el cable cruzan la CLAVE y su
  CONECTOR** (`EntradaIndice.ticket`, `web/servidor/sesiones.ts#anotarTicket`,
  `SesionDelCable.ticket`/`ticketConector`): el sitio se queda en el host. El conector cruza porque
  con él se CIERRA (`cerrar` usa el del ticket, no el gestor vinculado ahora), y «Cerrar en …»
  nombra a ESE: una tarea de Jira se cierra en Jira aunque el proyecto ya esté en Notion. El encargo llega al
  compositor EDITABLE y SIN enviar —lo manda la persona, no se manda solo—.
- **En Jira —y en Notion, con las MISMAS tarjetas— escribe el HARNESS, nunca el agente, y cada
  escritura lleva su propia tarjeta de aprobación** (`componentes/TarjetaDeJira.tsx`): pasar a EN CURSO al empezar (con «empezar sin
  tocar Jira» de salida) y comentario + transición al cerrar (comentario EDITABLE; un `error` de
  cerrar deja la tarjeta abierta con lo que la persona haya escrito intacto, nunca lo repinta). Si
  la transición de «empezar» falla, la sesión se abre IGUAL y el aviso lo dice DESPUÉS de saltar a
  ella —nunca se convierte en «empezar falló», porque no lo hizo—. **Con un turno en vuelo,
  «empezar» no toca Jira** (el vestíbulo devolvería la MISMA sesión). **Si al cerrar el comentario
  se escribe y la transición falla**, sale `cerrado` con `falloDeTransicion` y SIN `transicion`, la
  tarjeta se cierra y el aviso dice las dos mitades: un `error` a secas invitaba a repetir el
  cierre y comentar DOS veces. Las transiciones de cierre se piden al sitio del TICKET de la
  sesión, el mismo al que se aplican. Un error del gestor cruza el cable con los correos TACHADOS
  (`arranque.ts#sinCorreos`, antes de recortar): el texto de una tool de Jira es suyo.
- **El comentario de cierre lo compone el CÓDIGO, sin llamar al modelo**
  (`core/gestorDeTareas.ts#comentarioDeCierre`, `web/servidor/datosDeCierre.ts`): ficheros y
  commits reales de la sesión, el último veredicto del verificador —«no corrió» sin uno, nunca
  «verde» a secas— y la última respuesta del agente, recortada (`TOPE_DEL_RESUMEN_DE_CIERRE`). La
  lista de ficheros lleva su ATRIBUCIÓN (`git`/`desde-apertura`/`sin-marca`): fuera del workspace
  no hay commit sellado que la confirme, y el comentario lo dice en vez de darla por buena.
  **Límite declarado**: ninguna sesión ata todavía un PLAN al comentario —`comentarioDeCierre`
  acepta uno, pero nadie se lo pasa—.
