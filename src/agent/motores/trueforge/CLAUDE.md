# TrueForge

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

## Motor y frontera

- **deepagents es LEGACY** (`core/motor.ts`): corre las sesiones nacidas con él; nada nuevo allí. Límite declarado: el
  aviso de adjuntos es común y nombra `describe_image`, que deepagents no tiene.
- **Se elige por configuración y no se ve** (`"motor"` en `config.json`, `XONECODE_MOTOR`; omisión `trueforge`; sesión
  sin motor guardado → `deepagents`). **La elección vive en UN punto, `abrirSesionReal`**; cumple `SesionReal`.
  Doc: `docs/VARIANTE-TRUEFORGE-HARNESS.md`.
- **El modelo es NUESTRO**: un `ILLM` sobre el de LangChain, nunca `VercelAILLM` (perdería `user_id`, eco y esfuerzo).
- **Las tools delegan en `backendDeAgente`** y reevalúan `permisosDe`. **Las tools propias se ADAPTAN, no se reescriben**
  (`toolsPropias.ts`); `xone_navegacion` a todos. Verificador, reparación, juez y crítico, por los mismos puertos; reglas
  en `agent/turno/verificacion.ts`.
- **`core/` no importa `@truefoundry/` ni `winston`** (`imports.test.ts`); **fuera de `core/` solo lo importa
  `agent/motores/trueforge/trueforge.ts`** (`frontera.test.ts`).
- **La skill del aparato sigue al ORIGEN del proyecto** (`especialistas()`, leído en cada llamada): con la granja,
  `xone-hotswap` → `xone-granja` (`core/granja.ts#skillsSegunOrigen`). De esa lista salen prompt, scripts e hijos.
- **Reparto de deepagents**: raíz de solo lectura y sin skills, cada especialista de su `.md`, **la aprobación de un hijo
  vuelve a SU `thread_id`**. El prompt de un hijo va en su SISTEMA por `instructionBuilders`.
- **Los de motor EXTERNO son hijos por el MISMO `SubagenteExternoPort`** (`modeloExterno.ts`): `AgentThread` de una
  llamada cuyo «modelo» es `correr()`, sin tools; no cuenta como de nuestro modelo; un fallo se DEVUELVE como texto.
  **Parar mata al hijo** (`PeticionExterna.senal`); **dos hijos que escriben no corren a la vez** (`escritoresEnSerie`).
- **Argumentos rotos** (`modeloLangchain.ts`): `invalid_tool_calls` y el JSON «reparado» de una respuesta cortada por el
  tope de salida van al núcleo CRUDOS, que devuelve el error del JSON; ni se tiran ni se ejecutan cortados. El corte se
  reconoce en sus DOS formas (`cortadaPorTopeDeSalida`: `finish_reason` de los compatibles, `stop_reason` en
  `additional_kwargs` de Anthropic), su respuesta lleva delante la nota de PARTIR el trabajo (`notaDelCorte`), y tras
  `CORTES_SEGUIDOS_ANTES_DE_PARAR` cortes seguidos no se llama al modelo: el hilo cierra con texto.
- **Un documento largo se escribe POR PARTES** (`write_file` con `append: true`, `core/anadirAFichero.ts`): solo
  documentos (`.md`, `/planes/`, `/doc/`), lo que se valida (`TASKS.md`) y se aprueba (`interrupts.ts#cambioDe`) es el
  fichero RESULTANTE, y los `append` a un mismo fichero van en serie (leer y escribir; la cola del backend solo cubre el
  `write`). El analista escribe el `TASKS.md` una fase por llamada (`xone-plan-builder`, `PLAN_DE_DESARROLLO`).
  **Límite**: el `write_file` de deepagents IGNORA `append` y sobrescribe con el trozo (medido); no se protege.

## Ver, memoria y compactación

- **`read_file` devuelve el TEXTO de un PDF o un Office** (`textoDeDocumento.ts`, reglas en `core/textoDeOffice.ts`):
  por páginas, hojas o diapositivas, paginado por líneas aquí porque el backend no pagina un binario. Los bytes de un
  `.docx`/`.xlsx` salen de `downloadFiles`, que no pasa por las guardas: **solo tras un `read` sin error de la misma
  ruta**. Una página ESCANEADA sale como aviso con la llamada a `describe_image` y su `pagina`, que la TRANSCRIBE
  (`agent/grafo/paginasDePdf.ts`): no se transcribe al leer, por coste. Los `.doc`/`.xls`/`.ppt` viejos y los de iWork, no se leen y se dice.
- **`describe_image`** (`agent/grafo/describirImagen.ts`): llamada APARTE al modelo de `trabajo`, devuelve texto. A todos.
  Guarda de `imagenReferida` + `lectorDeReferencias`; ruta completa dentro de lo montado → virtual. `read_file` sobre una
  imagen devuelve la llamada ya escrita. El aviso de adjuntos dice el CAMINO, no promete visión.
- **La memoria es la FOTO del raíz** (`memoriaTrueforge.ts`, `AgentThread.toSnapshot()`, 0600), no `agent-session`.
  **Con VERSIÓN y lectura ESTRICTA** (`MIGRACIONES`, `interpretarFoto`): la que no se entiende se APARTA y se abre sin
  memoria. **Se guarda también a mitad de turno** (`guardarAMitad`, cada añadido del raíz y cada escritura de un hijo).
  Lo abierto se salda como INTERRUPCIÓN (`textoDeInterrupcion`), nunca con «vuelve a pedirlo».
- **Solo se compacta el raíz**, a un umbral de la ventana de SU modelo (`core/contextos.ts#umbralDeCompactacion`, entre
  `UMBRAL_DE_COMPACTACION_MINIMO` y `UMBRAL_DE_COMPACTACION_MAXIMO`) y **con el pensamiento APAGADO** (`llmDeCompactacion`).
  **Con su tope de salida** (`topeDeSalidaDeCompactacion`, al CONSTRUIR el cliente: después no llega): DeepSeek sin él corta
  en 8.192. Un resumen cortado igualmente se marca (`MARCA_DE_CORTE_POR_TOPE`) y lleva detrás los mensajes de la persona
  (`resumenSeguro.ts`). La petición de la librería va SIN caché (el historial en un solo mensaje): límite declarado.
- **Cada especialista recuerda sus encargos de la sesión** (`memoriaDeEspecialistas.ts`, `definition.messages`; nunca lo
  que leyeron otros). Entero (`TOPE_COMPLETA_TOKENS`), REDUCIDO (`TOPE_REDUCIDA_TOKENS`) o la VENTANA reciente
  (`ventanaDeHistorial`). En la reducida, sus encargos a otro van enteros y un `write_file`/`edit_file` largo se CUENTA en
  texto, sin respuesta: el modelo copia la FORMA de sus llamadas. **La reducida quita el razonamiento CAMBIANDO los ids**
  (`PREFIJO_DE_ID_EN_MEMORIA`): quitar la clave no basta, el eco de DeepSeek lo repegaba por id. Una encarnación viva por especialista; un hijo que falló o se detuvo no deja memoria; uno cortado por su presupuesto
  sí, sin la orden de parar (`sinOrdenDePresupuesto`). **Dentro de un encargo, quien da vueltas ve las PASADAS recortadas** (`vistaDelEncargo.ts`,
  `preLLMEphemeralProcessors`: la vista, no el hilo): lo anterior a la ÚLTIMA recarga/despliegue (`ORDEN_DE_VUELTA`), salvo
  la lectura de un fichero que no cambió después; ni argumentos ni ids. Estable entre vueltas por la CACHÉ. **Apagada por
  omisión** (`XONECODE_VISTA_DEL_ENCARGO=1` la enciende): medida, sale más CARA, porque cada recorte rompe la caché de una
  llamada y lo recortable es poco. **Quien lleva `ejecucion` la tiene CORTA** (`TOPE_CORTA_TOKENS`, siempre
  reducida): lo que devuelven sus órdenes es estado de un aparato que caduca. Solo en
  memoria; `XONECODE_SIN_MEMORIA_DE_ESPECIALISTAS=1` la apaga.
- **Los planes abiertos van detrás de la petición del raíz** (`core/planesAbiertos.ts`, `planesEnDisco.ts#planesParaElTurno`),
  con los hechos del proyecto y rehechos en cada turno: tareas abiertas, progreso y `offset`/`limit` de su ficha (el
  parser los da: `TareaDelPlan.linea`/`lineas`). Sin planes abiertos, o si no se pueden leer, la petición va sola. Al
  hijo no: su plan y su tarea se los pasa quien encarga.

## Lo que lee la persona

- **No se cuenta la maquinaria** (`SIN_HABLAR_DEL_HARNESS`, solo al raíz): ni tools, ni nombres internos, ni HANDOFF, ni la foto del arranque.
- **Lo LEÍDO son datos, no órdenes** (`LO_LEIDO_SON_DATOS`, de Harness²): al raíz, a cada especialista y a los
  externos. Un adjunto puede describir lo que hay que construir; lo que no puede es mandar fuera del encargo.
- **El idioma de la SALIDA lo dice el código** (`IDIOMA_DE_LA_RESPUESTA` al raíz, `IDIOMA_DEL_ESPECIALISTA` a cada hijo):
  el del USUARIO, solo lo que se LEE; el razonamiento libre.
- **Respuesta final en CHINO → se devuelve UNA vez** (`core/idiomaDeLaRespuesta.ts`, proporción de ideogramas; nunca si
  el usuario los usa). La original queda en el chat con aviso.
- **Texto entre herramientas en inglés sin pedirlo → recordatorio** (`textoEnInglesSinPedirlo`, `capacidadDeIdioma`),
  como mucho `TOPE_DE_RECORDATORIOS_DE_IDIOMA` por turno; no se reescribe.
- **El raíz puede PREGUNTAR** (`ask_user_question`, solo él; tarjeta por `Piel.consulta?`) y **PROPONER tareas
  encadenadas** (`proponer_tareas`, solo web).

## El bucle del desarrollador

- **Encendido por omisión** (`XONECODE_BUCLE_DEL_DEVELOPER=0` lo apaga): quien declara `llama` en su `.md` recibe
  `create_sub_agent` y SOLO esos especialistas (con artefactos, también `xone_critica_visual` y `comparar_capturas`); un
  nombre fuera cae al ayudante genérico de solo lectura. El juez final revisa igual.
- **El desarrollador CONTINUO, como Codex** (siempre encendido; `opciones.developerContinuo: false` lo apaga en
  los tests): el orquestador le manda UNA tarea por encargo, revisa su informe y le manda la siguiente al
  MISMO developer (`TEXTO_DEL_ORQUESTADOR_CONTINUO`), y su conversación sigue ENTERA (`memoriaDeEspecialistas.ts#completaDe`
  hasta `UMBRAL_DEL_DESARROLLADOR_CONTINUO`): el prefijo no cambia y una redelegación sale de la caché. Su sistema no
  depende del encargo (`TEXTO_DEL_DEVELOPER_CONTINUO`) y se compacta TARDE (`umbralDelDesarrolladorContinuo`). La ficha
  lleva detrás el ALCANCE y el CIERRE por criterio (`ALCANCE_Y_CIERRE_DE_LA_TAREA`). Con `XONECODE_SIGUIENTE_TAREA=1`
  (`siguienteTareaDelDesarrollador`) la pide él con `siguiente_tarea` (`siguienteTarea.ts`): si cierra con tareas
  pendientes la llama el código (`modeloLangchain.ts#alCerrar`), y sin ningún criterio marcado no pasa a la primera
  (`textoSinEvidencia`). Un encargo que nombra el plan sin su ruta también cae en la regla de una tarea
  (`core/encargoDeTarea.ts#planesPorSuNombre`).
- **`view_image`: quien prueba él mismo VE su captura** (`agent/grafo/verImagen.ts`, como Codex): la tool deja una marca
  con el id de la imagen y el adaptador (`modeloLangchain.ts#aMensajesDeLangchain`, `imagenDe`) la pone en un mensaje
  DETRÁS del bloque de respuestas de tool —nunca entre dos—, rehecha igual en cada llamada. `describe_image` sigue: es
  otro modelo que la cuenta en texto.
- **En AUTÓNOMO, un hijo escribe sin la interrupción de aprobación** (`escribeSinPreguntar`, fijado al NACER el hijo): la
  de la librería solo se atiende al acabar la ejecución entera, y la escritura esperaba a sus hermanos. Lo escrito sale
  igual en «aplicadas SIN aprobación» (`hilosQueEscribenSinPreguntar`); conector y aparato siguen parando. **El modo se lee
  en CADA escritura** (`modoVigenteAlEscribir.ts`): si la sesión pasó a supervisado, lo que pediría aprobación se RECHAZA
  con su motivo (no se puede preguntar desde la tool). También en las propias que escriben al disco directo
  (`PROPIAS_QUE_ESCRIBEN`, `conModoVigenteEnPropias`): el backend no las ve. En supervisado la tarjeta sigue esperando a los hermanos (`docs/PARALELISMO-TRUEFORGE.md`, contrato 4).
- **Las órdenes al MISMO aparato van en fila para toda la sesión** (`colaDelAparato.ts`, sobre la shell de cada hijo con
  la clave del aparato de la sesión): las tools de una respuesta corren a la vez y el hotswap admite una conexión. Otro
  aparato no espera. Plan del resto del paralelismo: `docs/PARALELISMO-TRUEFORGE.md`.
- **`ejecutar_script` admite varias órdenes con `;` o `&&`** (`core/comandoExterno.ts#ordenesEncadenadas`, hasta
  `TOPE_DE_ORDENES_ENCADENADAS`), cada una con la regla estrecha entera: para el modelo es un paso, no varios.
- **Un hijo NO ARRANCA mientras trabaja aquel del que depende** (`espera:` en el `.md`, `esperas.ts`): se devuelve al
  orquestador al instante. **Nunca se espera bloqueando**. `developer-xone` espera a `designer-xone`. **Un encargo
  devuelto sin arrancar retira su anuncio** (`crearHijo#devolverSinArrancar`, `esperas.ts#noArranco`): si no, quien lo
  esperaba no arrancaba nunca.
- **En Windows, `ejecutar_script` lanza `node '<ruta>' args`** (`lanzadorDeScriptsEn`, `comandoConNode`, el del hijo de
  Claude Code): por su shebang desde el Git Bash, con `MSYS_NO_PATHCONV`, node recibía `/c/Users/…` y no arrancaba
  ninguno. El `execute` LIBRE (device-controller) va tal cual tras definir cada script como función de bash que lo
  lanza igual (`conScriptsPorNode`): el nombre suelto, las tuberías y `$(…)` funcionan. Sin probar aún en Windows.
- **Un script que NO ARRANCA se le DICE a la persona** (`core/shellDeAgente.ts#scriptQueNoArranca`, aviso grave una vez por
  turno, sin rutas): es la máquina, no el trabajo. Medido: en Windows fallaron los siete y solo lo decía el cierre del agente.
- **La receta del aparato está en el `--help` de `xone-hotswap`** (la app ya queda lanzada tras reiniciar/recargar,
  `screen` → `abrir` → `shot name=`), y **un `result:false` del servidor sale con 1**: medido, cuatro sintaxis de
  `launchApplication` a ciegas porque todas salían con 0. En una tarea el orquestador no delega pruebas en el
  device-controller ni pide comprobar la rama (`TRABAJO_SIN_PERSONA`).
- **Quien corre sus scripts PRUEBA ÉL** (`textoDelBucle#pruebaElMismo`, cuando lleva `ejecutar_script`): recarga,
  toca, lee el log y captura sin un hijo, y todo eso en UNA orden, `xone-probar` (`skills/xone-hotswap/lib/probar.mjs`:
  compone los scripts hermanos; el harness la reconoce como captura con `--captura` y como vuelta con `--recargar`,
  `COMANDO_DE_CAPTURA`/`ORDEN_QUE_RECARGA`, y la ficha saca de su salida casos Y captura). **Y no tiene los scripts que
  `xone-probar` ya hace** (`core/comandoExterno.ts#SUSTITUIDOS_POR_PROBAR`, `scriptsDeTrueforge`): con ellos en la lista y
  en el prompt no lo usaba; pedir uno devuelve la orden de `xone-probar` (`motivoDeScriptSustituido`); `comparar_capturas` entre retoques y el crítico UNA vez al cerrar cada
  pantalla. Cada `xone-recargar/desplegar-android` cuenta una vuelta. Sus scripts, sin `xone-a-utf8` (`scriptsDeTrueforge`): ese es del hijo de
  Claude Code, y aquí cada `.xne` se escribe en su codificación.
- **Avisos por umbral, no «para»** (`textoDelBucle`, `capacidadDeAvisoDeVueltas`, `UMBRALES_DE_VUELTAS`): UN mensaje de
  «cambia de procedimiento». Ciclo de vida de `getControl`: `NUCLEO_XONE` y `errores-comunes.md`.
- **Las capturas se cuentan** (`COMANDO_DE_CAPTURA`, `UMBRALES_DE_CAPTURAS`), con o sin bucle.
- **Maquetador externo con shell: el bucle es SUYO** (`textoDeMaquetadorExterno`): todo en un encargo, crítico una vez,
  otra vuelta solo por algo bloqueante.
- **Sale con el CRITERIO DE ACEPTACIÓN medible** del encargo, tope de tres vueltas. **En una TAREA, como mucho
  `TOPE_DE_ENCARGOS_AL_DESARROLLADOR` encargos del orquestador a developer-xone por turno**: el siguiente no arranca
  (`hiloQueNoArranca` con `textoDeTopeDeEncargos`) y manda cerrar con lo que falta en «Por arreglar» / «No se puede en
  XOne». Medido: siete «últimas vueltas» persiguiendo un crítico en rojo. Con persona delante no aplica. **Pasar a OTRA
  tarea del plan no cuenta** (`abreOtraTareaDelPlan`): con una tarea por encargo, un plan de siete se cortaba en la tercera.
- **Un encargo de un plan es UNA tarea, en su línea `TAREA: <número>`** (`core/encargoDeTarea.ts#decidirEncargo`, en
  `crearHijo`): a quien marca el plan (`recibeMarcarCriterios`) o prueba en el aparato, y del orquestador, si nombra UN plan con tareas.
  Sin la línea, con varias o con una que no existe, NO arranca y se le devuelve el motivo; con una, el encargo lleva delante
  su ficha. Solo cuenta la LÍNEA, nunca la prosa («T1 ya está; ahora T2» es correcto). Como el `task_name` de Codex.
  También en una TAREA DE FONDO: sin ella el continuo no tiene tarea apuntada y hace el plan de golpe; lo que no arranca no
  gasta `TOPE_DE_ENCARGOS_AL_DESARROLLADOR`. **Límite**: dos planes en un encargo no se adivinan.
- **Una tarea ABIERTA no se deja atrás en silencio** (`INTENTOS_POR_TAREA`, `tareaEncargadaDe`): a quien PRUEBA (`pruebaEnElAparato`: `scripts` o el `ejecucion` de Claude Code),
  pasar a otra con la última sin TODAS sus casillas la ARRASTRA: el encargo nuevo lleva sus criterios sin marcar, para
  cerrarlos en esa vuelta (como Codex). Lo arrastrado que sigue abierto al pasar OTRA vez no arranca, ni la misma tarea con
  los intentos agotados: que cierre el turno diciéndole a la persona lo que falta. Vale dentro del turno. Un encargo con
  `TAREA:` que no nombra un plan CON TAREAS es del de la última encargada («plan B» no lo saca de la regla).
  Cada uno con un presupuesto alto (`presupuestoDeLlamadas`: quien lleva `scripts`, `TOPE_DE_LLAMADAS_DEL_DESARROLLADOR`):
  cada encargo nuevo volvía a leer y a entrar en la app desde cero.
  **Tampoco arrancan en una tarea** el analista con plan asignado (`PLAN DE ESTA TAREA` en el encargo) ni el
  device-controller si el desarrollador lleva `scripts`: probar y capturar son suyos y el juez mira SU última captura.
- **Sus llamadas no se van en navegar ni releer** (`textoDelBucle#pruebaElMismo`): `xone-hotswap abrir <Coll>` y `js`
  (atajos del script), CSS por `xone_navegacion estilos`, `describe_image` solo si la cifra no cuadra, captura en el
  estado de la maqueta. Medido en `docs/DECISIONES.md`: la mayoría del tope se iba en navegar y releer.
- **UNA VENTANA por encargo y por tarea del plan** (`UNA_VENTANA_POR_ENCARGO`, `PLAN_DE_DESARROLLO`, `REPARTIR_EN_TAREAS`,
  skill `xone-plan-builder`): con varias, el developer agota su presupuesto a mitad. Es redacción, no guarda.
- **Varios cambios a un fichero, UN `edit_file`** (`edits`, `core/edicionMultiple.ts`): en orden, todos o ninguno, escritos
  en un solo `edit` del fichero entero (mismas guardas, codificación y cola); la tarjeta de aprobación hace el MISMO cálculo
  (`interrupts.ts#cambioDe`). **Y lo escrito se VALIDA en el mismo resultado** (`validacionDeTexto`, `.xne`/`.xml`/`.css`/`.js`)
  para que no haga falta otra vuelta de `validar_fichero_xone`.
- **Traspasos acotados** (`toolsDeFichero.ts`, `informesDeHijos.ts`): `write_file` solo CREA un `.xne`/`.js`/`.css`
  (sobre uno existente, error → `edit_file`); `read_file` hasta `LINEAS_POR_LECTURA`/`CARACTERES_POR_LECTURA` y dice por
  dónde seguir; al terminar un hijo, quien lo llamó recibe en UN mensaje lo que ESCRIBIÓ (sin contenido; binarios
  incluidos). Límite declarado: el rechazo llega DESPUÉS de la aprobación.
  Y lo que APUNTÓ en lo aprendido, tema y alcance sin el texto (`textoDeLoApuntado`): medido, el orquestador lo volvía a
  apuntar con otro tema y salía duplicado.
- **La pantalla la MIDE el harness tras cada prueba** (`medidaAutomatica.ts`): última captura contra la maqueta
  (`/diseno/`, `/adjuntos/`), sin modelo, con `CRITERIO_DE_DISTANCIA` y recordatorio del crítico; viaja al orquestador.
  **Y a quien prueba ÉL MISMO** (`scripts: true`), detrás de la salida de cada orden de captura
  (`shellConMedidaTrasCapturar`, montada en `crearHijo`): sin eso medir quedaba en manos del modelo. **Límite**: el
  montaje en `crearHijo` no lo recorre un test (haría falta un `xone-captura-android` falso en el `PATH`).
  **Incluye el ENCAJE** (`TOLERANCIA_DE_ENCAJE`, `compararCapturas.ts#desajusteDeEncaje`, mediana de franjas a los lados)
  y **quita antes el MARCO lateral de la maqueta** (`sinMarcoLateral`, `ANCHO_MAXIMO_DEL_MARCO`).
- **El diseñador hace RECURSOS, no pantallas** (`designer-xone`, `escribeEn: [/icons/, /fonts/]`): lo confina el PERMISO.
  `recibeBuscarIcono` exige `escribeEn` sobre `icons/`; el documentador no. **Devuelve una TABLA** (`DEVOLVER_RECURSOS`).
  La traza guarda lo que devuelve cada hijo (`DiagnosticoDeTools.devolucion`).
- **`xone_atributos`, índice rápido por nodo** (`core/atributosXone.ts`, `agent/grafo/atributosXone.ts`), a todos: se lee
  de la skill (`REFERENCIAS_DE_ATRIBUTOS`) en cada construcción; discrepancias, LAS DOS; lo ausente no es inexistente y
  manda al `grep` sobre `/skills/`; test contra la skill REAL. Cuándo usarla: `USO_DE_XONE_ATRIBUTOS`, no el `SKILL.md`.
- **Pruebas por el LOG antes que la captura** (`xone-log-android --app`, `EJECUCION_EN_LA_MAQUINA`): `console.log`, nunca
  `ui.showToast` ni `appData.writeConsoleString`; FUNCIONALES aparte de VISUALES (`RONDAS_VISUALES`, el mismo número que
  su prompt).
- **La FICHA de trabajo** (`core/fichaDeTrabajo.ts`, `fichaEnSesion.ts`; diseño en `docs/superpowers/specs/`): la llena SOLO el código con lo que pasa por el harness
  —el objetivo literal, escrituras con su huella, validaciones, casos con `---`, capturas y medidas— y se guarda en
  `<sesion>/ficha.json` (sin sesión, `run`, empieza de cero). Una evidencia vale mientras las huellas no cambien.
  **Marcar un criterio exige una prueba en el aparato VIGENTE** (`marcar_criterios_del_plan` con `ficha`; sin ella, se
  devuelve el motivo y no se marca), y **el estado de la tarea lo calcula el código al cerrar** y lo escribe en su
  `TASKS.md`: `hecha` solo con todo respaldado vigente y el verificador en verde. El cierre de `run` la enseña.
  **La AUDITORÍA de cierre** (F2: `core/auditoriaDeCierre.ts`, `auditorDeCierre.ts`): las casillas marcadas con prueba
  vigente se preguntan al papel `afilado` con su prueba delante —la principal y las DEMÁS pruebas vigentes al marcar (`Respaldo.otras`, hasta `TOPE_DE_OTRAS_PRUEBAS`): marcar de una vez respaldaba todo con la última— (casos en texto, capturas como imagen, como mucho
  `TOPE_DE_IMAGENES_DE_AUDITORIA`), con el prompt MEDIDO (porqué antes que veredicto; `cumple`/`contradice`/`no-se-ve`;
  refutar exige `cita`). Lo que no se sostiene queda `sin-sostener` y la tarea no pasa de `implementada`: **solo BAJA**.
  No poder preguntar se dice y no baja nada. **Límites**: los jueces aún no la reciben, y en una tarea de fondo el juez
  sigue escribiendo el estado del plan (F2b).
- **`TASKS.md` con casillas o no se escribe** (`core/tareasDelPlan.ts#motivoDeTasksInaceptable`): solo al escribirlo ENTERO.
  **Y con topes** (también sumando partes con `append`): una tarjeta dice QUÉ, sin bloques de código y hasta
  `TOPE_DE_TARJETA` sin contar casillas, estado ni dependencias, con hasta `TOPE_DE_CRITERIOS_POR_TAREA` criterios de hasta
  `TOPE_DE_CRITERIO` (lo que se ve en el aparato, no cómo está hecho); `PLAN.md` hasta `TOPE_DE_PLAN` y `DISENO.md` hasta
  `TOPE_DE_DISENO` (`core/planes.ts#motivoDeDocumentoDelPlanLargo`). La skill y el analista citan los mismos números, y un
  test lo ata.
- **El ajuste visual TERMINA** (petición suya): otra vuelta solo si el último `xone_critica_visual` dio ROJO (prompt de
  orquestador y desarrollador), y por CÓDIGO un tope de vueltas (recargas/despliegues o llamadas al de pruebas):
  `TOPE_DE_VUELTAS_POR_ENCARGO` (aparte de `RONDAS_VISUALES`: cuenta también las recargas de construir) y `TOPE_DE_VUELTAS_DEL_TURNO` por agente sumando encargos
  (`contarVuelta`; cuatro encargos llenos: con una tarea por encargo, cada tarea gasta sus recargas en construir). Corta con la pieza del presupuesto (`presupuesto.ts#cortar`, `textoDeVueltasAgotadas`): cierra con
  resumen, y la orden no pasa a la memoria (`sinOrdenDePresupuesto`). La traza dice el MOTIVO del corte (`agotado` →
  `{motivo, limite}`: llamadas o vueltas). La cifra de `comparar_capturas` es un dato, no un motivo de otra vuelta.
  **Agotado el del turno, el encargo siguiente a ese agente NO ARRANCA** (`hiloQueNoArranca` con
  `textoDeVueltasDelTurnoAgotadas`), haya o no persona: cortado, cada encargo nuevo editaba hasta su primera recarga.
- **Un plan no se pule a trozos** (`toolsDeFichero.ts#TOPE_DE_RETOQUES_DEL_PLAN`): pasado ese número de `edit_file` sobre
  `/planes/` en un encargo, se devuelve error y se pide reescribirlo de una vez (`write_file` vale en `/planes/`).
- **Una pantalla se juzga en SU tarea del plan** (`pantallaJuzgada.ts`): la maqueta que pasó el crítico en una tarea queda
  JUZGADA al encargar otra (no si se arrastra). Contra ella el crítico no corre —lo que difiera va como observación al
  cierre— y la medida automática es un dato, sin ronda visual ni crítico que pedir; las rondas visuales vuelven a cero en
  cada tarea. Otra maqueta tiene su bucle. El orquestador no cuela «además, lo visual de la anterior» en el encargo
  siguiente (`BUCLE_DE_CALIDAD`), y el plan pone el criterio de parecido solo en la tarea de la pantalla.
- **Los valores de una maqueta son DE EJEMPLO**: ni el plan los manda escribir fijos ni el desarrollador los copia.
- **Con maqueta, la pantalla ENTERA es UNA tarea** (`FIDELIDAD_DEL_PLAN`, skill `xone-plan-builder`): sus piezas las enumera el
  `DISENO.md`, y la lógica y la entrada desde el menú van aparte. Partida por piezas, la primera tarea no se cierra: quien
  construye hace la pantalla de una vez (medido con el mismo modelo que Codex, `docs/DECISIONES.md`).
- **La shell no escribe el proyecto** (`proyectoSinShell.ts`, `conGuardaDelProyecto` sobre el backend que ejecuta, en
  `execute` y en `ejecutar_script`): tras cada orden se compara el proyecto fuera de `.xonecode/` y `.git/` con su copia, y
  lo cambiado, creado o borrado se DESHACE y se añade a la salida con código ≠ 0. Las escrituras del backend de los agentes
  se ANOTAN (`conEscriturasAnotadas`) para no deshacer un `write_file` en paralelo. **Límites**: un fichero de más de
  `TOPE_DE_COPIA_BYTES` se detecta y no se deshace; `incorporar_adjunto`, `traer_fuente` y el editor de la persona escriben
  sin anotar, así que hechos MIENTRAS corre una orden se deshacen; el hijo de Claude Code va por su propio camino.
- **Quien ejecuta no busca con la shell** (`core/shellDeAgente.ts#motivoDeComandoRechazado`): `find`, `grep -r`, `ls -R`
  → error que manda a `glob`/`grep`/`ls`; ni rutas VIRTUALES; ni SQL que escribe por `xone-hotswap`. Lista de lo visto,
  no filtro: límite declarado.

## Notas y detener

- **Escribir con el turno en marcha es UN gesto** (solo web): el Enter viaja como `detener: true` si `turnoDetenible`;
  si no, NOTA. Ambas por `preLLMProcessors` (`capacidadDeNotas`).
- **Una nota tiene UN dueño** (`notas.ts`): el único hijo que trabaja o el raíz; el raíz la ve siempre.
- **Detener NO es una nota** (`detencion.ts`): alcanza a los hijos de una llamada del raíz anterior y **corta su llamada
  en curso** (`AbortController`; `modeloLangchain.ts#corte`). Se filtra la SALIDA, no las tools. Tras Parar, lo no leído
  no arranca otro turno. Límites: no corta una shell en curso; un hijo externo ni recibe notas ni se detiene.
- **El tope de un hijo DEVUELVE** (`presupuesto.ts`): al llegar a su presupuesto recibe, por el mismo procesador, la
  orden de cerrar con lo medido y su modelo solo da texto, como al detener. El `iterationLimit` de la librería queda
  por encima (`MARGEN_SOBRE_EL_PRESUPUESTO`) como red: el suyo corta MUDO. Con eso el conductor tiene el suyo más corto
  (`TOPE_DE_LLAMADAS_DEL_CONDUCTOR`). Límite: no corta una shell en curso; un hijo externo no lo tiene.
