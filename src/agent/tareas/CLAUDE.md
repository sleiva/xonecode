# Las tareas en background

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# Las tareas en background

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
- **Y una tarea que ACABA se cierra siempre: la entrega ya no la aparca** (decisión suya; `core/entrega.ts
  #cierreDeLaEntrega`, `Tarea.cierre`). Lo que no salió limpio se DICE en el comentario de cierre del ticket: lo CRÍTICO
  arriba, bajo `## CRITICAL` —cortada por el tope, autorizó y no escribió nada, o un BLOQUEANTE visual medido en la
  última crítica del turno (`ResultadoDeTurno.bloqueantesVisuales`, las líneas que el crítico marca con
  `MARCA_DE_BLOQUEANTE`)—, y el resto como `## Observaciones` —un rojo del juez y sus hallazgos, errores del
  verificador, que no corriera—: «si la completó con problemas o detalles, eso no es crítico». El ticket va al estado de
  terminar igual. **Siguen aparcando** solo los turnos que no ACABARON: una pregunta sin contestar, un corte, una pausa,
  un fallo, y el proceso que se cierra antes de que el juez la mire. El cierre viaja al cliente (`TareaDelCable.cierre`) y la fila de
  Finalizadas lo enseña.
- **Una tarea resuelve sus dudas SOLA y cierra con un resumen** (`Consola.tareaDeFondo`, `trabajoSinPersona` en
  TrueForge, `TRABAJO_SIN_PERSONA`): su consola declara que no hay nadie, y el raíz contesta sus preguntas como en
  modo autónomo —la opción `(Recommended)`, o «decide tú»—, con el mismo `TOPE_DE_PREGUNTAS_CONTESTADAS_SOLAS`; su
  prompt le pide decidir antes que preguntar y una respuesta final con lo cambiado, las decisiones tomadas sin
  preguntar y lo que no se pudo comprobar. Medido en Maset: cada duda paraba la tarea. **Y un turno que acaba con una
  pregunta en espera NO es una entrega** (`ResultadoDeTurno.preguntaPendiente`, `motivoDePreguntaPendiente`): se aparca
  con la pregunta, sin juez —dictaba «no escribió nada»—; y **el veredicto de un ciclo anterior se retira al empezar
  otro**, porque se quedaba pegado a la tarea mientras trabajaba.
- **En una tarea, las escrituras LOCALES de un especialista no paran el turno** (`escribeSinPreguntar`, en
  `capacidadesDelEspecialista`, puesto con `trabajoSinPersona`): una aprobación solo se atiende cuando la librería devuelve
  el control, y medido en Maset las del diseñador esperaron todo lo que tardó el analista de Claude Code (una sola llamada
  larga), aunque en una tarea se aprueban solas. Las guardas de ruta siguen enteras, lo que cambió lo sigue diciendo git, y
  las escrituras de un CONECTOR siguen parando (y en una tarea se rechazan). **Límite**: `Tarea.autorizadas` ya no las cuenta. Por eso el juez, con git delante, ya no recibe la lista de lo autorizado (`juezDeTarea.ts#parrafoDeLoEscrito`):
  medido, leyó «10 autorizadas y 30 cambiadas» como ficheros escritos sin constancia.
- **Una tarea cortada por el tope de rondas lo DICE** (`ResultadoDeTurno.topeAgotado`, puesto por TrueForge;
  `core/entrega.ts#motivoDeTopeAgotado`): «agotó el tope de N rondas… Pulsa «Continuar»», y no «quedaron escrituras
  esperando aprobación», que en una tarea sin nadie a quien preguntar no decía que se había cortado. Y una respuesta del
  juez sin el JSON pedido se apunta recortada en la traza de errores (`juezDeTarea#juzgar`).
- **`## CRITICAL` es para lo que NO se hizo, no para lo que se hizo con detalles** (`core/entrega.ts`): una tarea que no
  cambió ningún fichero (git) con el juez en contra es crítica (`CRITICO_SIN_HACER`); un bloqueante visual que la respuesta
  final NOMBRA —todo lo que cita entre «»— es una omisión explicada y va a observaciones (`omisionExplicada`,
  `ResultadoDeTurno.omisionesExplicadas`). Y tampoco el de una crítica ANTERIOR a los últimos cambios del proyecto
  (`cambioDespuesDe`, por la hora del disco: un hijo externo escribe con sus tools): va a observaciones como «sin
  comprobar después» (`bloqueantesDesfasados`).
- **Del verificador, al juez solo le llegan los ERRORES** (decisión suya, `juezDeTarea.ts#parrafoDelVerificador`): un
  aviso del linter puede ser falso —medido en Maset, `self.executeNode("irColl(…)")` salió como `REF_FUNC_MISSING`
  siendo `irColl` un nodo— y el juez lo convertía en rojo. La puerta de entrega ya contaba solo errores.
- **El juez recibe las comprobaciones VISUALES del turno, medidas por el harness** (`ResultadoDeTurno.comprobacionesVisuales`,
  `CasoDeJuez`, `lineaDeComprobacion`): una línea por `comparar_capturas`, `xone_critica_visual` y el crítico del cierre,
  las últimas `TOPE_DE_COMPROBACIONES_AL_JUEZ`. Sin ellas, un criterio que pedía validar contra la maqueta era rojo seguro
  —«no consta»— aunque se hubiera validado; sin ninguna, el prompt dice que no hubo.
- **`Tarea.autorizadas` guarda lo AUTORIZADO, no lo escrito.** La verdad de lo que cambió está en
  la ref de git de la sesión.
- **Un solo corredor por máquina, y el cerrojo no lo garantiza solo**: lo hace verdad
  `sigoSiendoDueño()`, preguntado antes de despachar cada tarea. La cuarentena del cerrojo lleva el
  **pid** en el nombre.
- **Gana la persona**: una tarea no arranca en un proyecto cuya consola humana está ABIERTA. **Salvo que la persona
  CEDA el proyecto** («Arrancar ahora», `vestibulo.cederProyecto`, acción `arrancarAhora`): se cierra su consola de ahí
  —la conversación queda guardada— y la tarea arranca; se niega con motivo si esa consola tiene un turno en marcha o si la
  tarea espera a la anterior de su cadena (`puedeArrancarYa`). La lista de Tareas lo dice («no arranca mientras tengas
  abierta la consola…»), y una aparcada se sigue con «Continuar» (`TEXTO_DE_CONTINUAR`) o «Enviar y continuar». **En el
  chat de una conversación de tarea que espera feedback**, en el sitio de la caja va la tarjeta de la tarea
  (`MensajeATarea.tsx#TareaEnEsperaEnElChat`, la MISMA `AccionesDeTarea` de la lista): motivo, «Continuar», «Reintentar»,
  «Dar por bueno», «Descartar» y su feedback; las que la devuelven a la cola ceden el proyecto (`arrancarAhora`), porque con
  su conversación abierta no arrancaría. La caja vuelve cuando deja de esperar. Contestar la tarjeta de una PREGUNTA del
  agente ahí sigue dejando elegir (a la tarea o seguir aquí).
- **Una tarea en marcha se puede PARAR sin borrarla** (IXCODE-50, `{accion:"parar"}`,
  `Corredor.cortar(id, {pausa})`): el mismo corte que «Descartar», pero la tarea queda aparcada con
  `motivoDePausa` y su conversación, y se sigue con «Continuar». Una pausa NUNCA pasa por la entrega
  —el turno puede devolver limpio al cerrarle la consola— y, pedida mientras la consola se abre, se
  aparca en vez de quedarse en `nuevo` renunciada. El servidor espera al corte y contesta 409 con
  motivo si no se pudo (otro proceso, o no soltó a tiempo).
- **Con gestor de tareas vinculado, una tarea VIVE en él** (su diseño en `docs/superpowers/specs/`, «tareas desde el gestor»;
  `core/tareasEnElGestor.ts`, `agent/tareas/reflejoEnElGestor.ts`): sin vínculo, todo como antes. **El modo lo decide el
  SERVIDOR** con el `config.json` del proyecto (`arranque.ts#gestorParaTareaNueva`, la MISMA para `destino` —que la
  ventana pregunta al abrirse para decir ANTES del clic qué escribirá allí— y para `crear`). `crear` hace el ticket
  (`GestorDeTareasPort.crear?`, opcional como `buscarProyectos?`), sube el encargo como comentario con
  `CABECERA_DEL_ENCARGO`, y SOLO después guarda la tarea con `Tarea.ticket` —copiado, nunca recalculado del vínculo
  de ahora— y hace revisar; si el gestor se niega, 409 y NO hay tarea local. **El reflejo entra por UN punto, el
  `guardar` del almacén envuelto donde nace** (`construirCorredorDeTareasCableado`): EN CURSO al empezar (no si ya lo
  está: pasa tras cada feedback), `cerrarTicket` al terminar —la MISMA secuencia que el «Cerrar en …» de un chat—;
  fire-and-forget, en cola por ticket, y lo que falla queda en `ticket.aviso` (sin correos). Nada de un gestor concreto
  en el puerto: el tipo de incidencia de Jira lo elige su adaptador (`tipoParaCrear`; medido, en español «Task» se
  llama «Tarea»). **Límites declarados**: encadenadas solo en local, al aparcar no se escribe, los adjuntos no suben,
  destinos de `transicionPropuesta` sin tabla, Notion sin `crear` todavía.
- **Y el gestor DISPARA tareas (la puerta 2), adaptándose a SUS estados**: no se imponen columnas; en el vínculo
  (Conectores, `TareasDesdeElGestor.tsx`) la persona dice qué estado de su flujo cumple cada PAPEL —preparar, lanzar,
  terminar— (`VinculoGuardado.estados`), elegido de los que da el gestor (`GestorDeTareasPort.estados?`; en Jira, de
  sus tickets y transiciones: el conector no tiene tool de estados) y propuesto por categoría (`mapeoPropuesto`). El
  servidor NIEGA un estado que no está en el flujo y encender sin «lanzar». El mapeo se COPIA al ticket de cada tarea y
  manda también en la puerta 1 (`transicionHacia`). **El disparo es un interruptor apagado por omisión**
  (`automatico`, solo con `true`), solo cuentan los tickets ASIGNADOS a la cuenta del conector, y el sondeo
  (`agent/tareas/sondeoDelGestor.ts`, decisión pura en `accionesDelSondeo`) corre SOLO en el proceso que ejecuta las
  tareas, cada `INTERVALO_DE_SONDEO_MS` (5 min) y con «Mirar ahora». Preparar sube el encargo ampliado como comentario
  con `CABECERA_DEL_ENCARGO`; lanzar usa el ÚLTIMO de esos comentarios tal como esté y lo comentado debajo
  (`encargoDeLosComentarios`). **Revisar el encargo es OPCIONAL y viene apagado** (`revisarEncargo`, decisión suya):
  apagado, el ticket de preparar se prepara y se LANZA en la misma pasada con el encargo recién subido, y es xonecode
  quien lo mueve al empezar; encendido, espera a que la persona lo mueva al de lanzar. Volver a vincular el MISMO
  proyecto conserva el mapeo. **El encargo de toda tarea con ticket lleva delante el ticket con su ENLACE**
  (`encargoConTicket`), y el sondeo pregunta los sitios antes de lanzar (sin ellos Jira no da la url: medido, la
  tarea de MAS-2 nació sin enlace) y rellena el de las tareas que no lo tienen. **DESCARTAR la cierra en el gestor**:
  comentario «Descartada en xonecode» y el primer estado de la categoría terminada (no el «terminar» del mapeo, que
  puede ser PROBAR), por `cerrarTicket`.
- **«En curso» y «Finalizadas»: las terminadas son un HISTÓRICO de solo lectura** (`TareasDelProyecto.tsx#FilaFinalizada`):
  UNA línea fina por tarea, entera un botón que la despliega (diseño suyo, lienzo «Tareas finalizadas — rediseño»): un punto
  por cómo acabó (`resultadoDeFinalizada`: con críticos, a mano, con observaciones, limpia), título, ticket, una frase, las
  cuentas y las fechas; desplegada, `## CRITICAL`, observaciones, qué hizo y el encargo. Su única acción es ELIMINARLA del
  histórico, con confirmación (la acción `descartar`: a su ticket, ya cerrado, no le hace nada). Por lo demás sin acciones, FUERA de la barra de sesiones (salvo la abierta), la más reciente arriba, «empezó … · acabó …» (nunca «tardó»: cuenta la pausa), lo último que contestó
  el agente —pedido al desplegar con `leerSesion`, nunca en la cola— y su conversación abierta para LEER con el motivo
  `finalizada`, que no ofrece escribir. **Sus artefactos salen de SU carpeta, no de la abierta**: `GET /artefacto` y el
  mensaje `artefacto` aceptan `p`/`s` (proyecto y sesión) resueltos por el SERVIDOR con la MISMA barrera que
  `leerSesion` (`arranque.ts#sesionDelDisco`), y el contenido vuelve en la propia respuesta, nunca al store, que va por
  ruta y pisaría el de la abierta. En el cliente, el origen llega por contexto (`OrigenDeArtefactosContexto`,
  `useUrlDeArtefacto`) a las miniaturas y al visor, y la lista es `artefactosDeLosActos`, la misma de `App`. **Límite
  declarado**: la carpeta va por el id de la SESIÓN; en un chat donde `/nuevo` abrió otro hilo no coincide (en una
  tarea sí).
- **Una tarea cortada a mitad se REANUDA sola, una vez** (`core/tareas.ts#reanudadaTrasCorte`, en la reconciliación del
  arranque): si el proceso murió con ella «en proceso» y su hilo se puede reabrir, vuelve a la cola con
  `TEXTO_DE_REANUDACION` como feedback pendiente, que entra en SU hilo —la foto del raíz y el chat se guardan a mitad de
  turno— y manda mirar el disco antes de rehacer. Pasa por las transiciones de siempre (aparcada y devuelta con
  feedback). Sin hilo, o ya reanudada (`TOPE_DE_REANUDACIONES`, `Tarea.reanudaciones`, que no viaja), se aparca como
  antes: una tarea que tumba el proceso cada vez sería un bucle.
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
- **El chat de una SESIÓN tiene su propia fuente de adjuntos (IXCODE-7), y vive DENTRO del
  proyecto**: `.xonecode/sesiones/<id>/adjuntos/`, hermana de `artefactos/`, subida por el MISMO
  `POST /adjunto` con `?para=sesion`. **Se montan como la MISMA `/adjuntos/` de solo lectura, y
  el EJECUTOR las deriva del `hilo`** (`cli/main.ts#carpetaDeAdjuntosDelEjecutor`), igual que
  `/artefactos/` — solo en la web, porque el terminal no tiene carpeta por sesión. También le
  llegan a TrueForge. **El nombre final lo decide el SERVIDOR, nunca sobrescribe**:
  con el nombre ya ocupado, sufija `-2`… y lo dice en la respuesta (`{"nombre"}`), que el cliente
  adopta en vez del que mandó. **El acto de usuario solo afirma los adjuntos que están EN
  DISCO** — lo que `listarAdjuntosDeSesion` encontró, nunca los nombres que llegaron por el
  cable sin comprobar. **Un `.zip` se DESCOMPRIME al guardarlo** (`core/zipDeAdjunto.ts`, `adjuntosDeSesion.ts#extraerZip`): el
  zip se queda y su contenido va a `adjuntos/<nombre>/`, que el aviso del mensaje enseña colgado del zip
  (`AdjuntoNombrable.contenido`). Lo hace el harness: el agente no tiene con qué abrir un zip, y `read_file`
  de uno contesta dónde está ya extraído. Las barreras de instalar una skill desde `.zip` (forma de ruta en
  lista BLANCA, topes contra un zip bomba decididos con lo DECLARADO antes de inflar), más el tope por
  sesión, que cuenta lo descomprimido. Un zip que no se puede extraer se guarda igual y se dice por qué.
  Meterlos en el PROYECTO es la tool `incorporar_adjunto`, con su propia fila
  de aprobación; solo `developer-xone` de motor `"modelo"` la recibe —el diseñador está confinado a `icons/` y `fonts/`— y a un
  motor externo no le llegan tools propias.
- **El encargo se AUMENTA y se enseña EDITABLE antes de encolar** (`AumentadorPort`, papel
  `trabajo`): ocupa el sitio del diff; su fallo encola el texto original y se DICE. **Y si se encola SIN haberlo
  preparado, lo prepara el SERVIDOR al crear** (`arranque.ts#encargoAlEncolar`, petición suya): la ventana no manda
  encargo vacío, y el botón dice que lo está preparando.
  **El aumentador conoce los CONECTORES del proyecto** (`PeticionDeTarea.conectores`, de
  `arranque.ts#contextoDelProyecto`, sin el gestor de tareas): lo que la petición nombre de uno se trae de ahí,
  nunca se busca en el repo. Y no escribe condiciones de PARADA: una duda va con su opción recomendada.
  **Y se puede EDITAR mientras la tarea no ha arrancado NUNCA** (IXCODE-52, `core/tareas.ts#conEncargo`,
  `puedeEditarEncargo`: `nuevo` y sin `empezada`; una reintentada vuelve a `nuevo`, pero lo que se le manda
  es su hilo). La `peticion` no se toca. El corredor manda el encargo RELEÍDO en la escritura que la
  marca «en proceso», no el de la lectura que la eligió: una edición entre medias no se pierde.
  **Y la PETICIÓN también** (IXCODE-53): se edita con el encargo (el título sale de ella) y
  «Regenerar el encargo» (`{accion:"regenerarEncargo"}`) lo vuelve a preparar con el aumentador, con
  SUS adjuntos, contestando en la propia respuesta y SIN guardar. No va por `augmentado`, que llega a
  todas las pestañas y es de «Nueva tarea»: las dos ventanas se pisarían.
- **Un encargo GRANDE se reparte en tareas ENCADENADAS, y el agente solo PROPONE**
  (`core/repartoDeEncargo.ts`, `agent/motores/trueforge/proponerTareas.ts`, `componentes/PropuestaDeTareas.tsx`): la
  tool `proponer_tareas` valida y anuncia el acto `propuesta-de-tareas`, nunca crea nada; las tareas las crea el clic de
  la persona en «Encolar en orden», TAMBIÉN en modo autónomo, porque crear una tarea es la autorización. Solo el raíz de
  TrueForge y solo en una consola de PERSONA de la web (`Consola.proponeTareas`, que la consola de una tarea no hereda),
  y su prompt le pide preguntar antes con `ask_user_question` lo que falte. **Y el harness se lo RECUERDA**: cuando un
  hijo del raíz deja un `TASKS.md` con varias tareas (`TAREAS_PARA_RECORDAR_EL_REPARTO`), su informe lleva
  `avisoDeReparto`, una vez por plan —medido, con el plan de seis tareas escrito el orquestador siguió preguntando sin
  volver sobre el reparto; la frase del prompt no bastaba—. **Lo que se encola sale del ACTO, no del
  cliente** (`propuestaPendiente`): el cliente manda el id y los encargos revisados; títulos, peticiones y adjuntos los
  pone el servidor, que copia a cada tarea SUS adjuntos de la sesión ANTES de guardarla (`copiarAdjuntosDeSesion`).
  **Una propuesta NO pasa por el aumentador**: el encargo es la petición del orquestador, editable —él la escribió con la
  conversación delante, y el aumentador la alargaba hasta su tope y la cortaba—. Tres salidas: encolar, descartar, o
  «Hacerlo aquí en el chat» (resuelta con `enChat` y una prosa al agente). **Resuelta es OTRO acto** (`propuesta-resuelta`), apuntado y guardado al momento
  (`ConsolaDeProyecto.anotarActo`): el `.jsonl` solo crece, y sin él una reabierta volvía a ofrecer encolar.
  **`Tarea.tras` es el orden**: el corredor no despacha una tarea cuya anterior existe y no está `terminada`
  (`siguientesAEjecutar`). Hacía falta porque el FIFO por `creada` no basta: `requiere-atencion` deja de ocupar el
  proyecto y la segunda arrancaría sobre trabajo sin aceptar. Una anterior DESCARTADA ya no retiene. Y como todas, no
  arrancan mientras la consola de persona de ese proyecto esté abierta.
