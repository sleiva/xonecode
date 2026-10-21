# Las tareas en background

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

`core/tareas.ts`, `agent/tareas/tareasEnDisco.ts`, `web/servidor/corredorDeTareas.ts`,
`consolaDeTarea.ts`, `core/entrega.ts`, `agent/tareas/juezDeTarea.ts`. Un encargo por proyecto que
corre solo y escribe sin aprobación. Cuatro estados; `requiere-atencion` = **espera feedback**, no terminal.

## Autorización y entrega

- **Sin git no hay tarea** (`gitSync.ts#motivoSinGitParaTarea`, IXCODE-60): crearla en una copia
  sin repo se NIEGA (409 con motivo) antes de preparar el encargo; lo cablea la composición del
  corredor (`opcionesDeMontaje`), no `arrancarConsolaWeb`.
- **La autorización es el ACTO DE CREAR LA TAREA**; **no se reutiliza el modo de escritura de una sesión**.
- **Las guardas de RUTA siguen enteras**: `/artifacts/`, vistas aplanadas, `/.env`, `/.git`, `/.xonecode`.
- **Escrituras LOCALES de un especialista no paran el turno** (`escribeSinPreguntar`,
  `capacidadesDelEspecialista`); las de un CONECTOR se rechazan. **Límite**: `Tarea.autorizadas` no
  las cuenta, y el juez no recibe lo autorizado (`juezDeTarea.ts#parrafoDeLoEscrito`).
- **`Tarea.autorizadas` es lo AUTORIZADO, no lo escrito**: lo escrito, la ref de git de la sesión.
- **El juez no basta solo**: las condiciones las comprueba el CÓDIGO
  (`core/entrega.ts#condicionesDeEntrega`) — verificador en VERDE (no correr **no es** verde), nada
  pendiente, `revisable`, y no «autorizó y git no ve cambios». `escribio` solo **con marca** de git.
- **Una tarea que ACABA se cierra siempre** (`#cierreDeLaEntrega`, `Tarea.cierre`,
  `TareaDelCable.cierre`): bajo `## CRITICAL` lo que NO se hizo —tope, autorizó sin escribir,
  BLOQUEANTE visual de la última crítica (`bloqueantesVisuales`, `MARCA_DE_BLOQUEANTE`), sin cambios
  en git con juez en contra (`CRITICO_SIN_HACER`)—; el resto en `## Observaciones`, incluido un
  bloqueante que la respuesta final nombra entre «» (`omisionExplicada`) o anterior a los últimos
  cambios (`cambioDespuesDe`, `bloqueantesDesfasados`). **Aparcan** solo los turnos que no ACABARON:
  pregunta, corte, pausa, fallo, proceso cerrado antes del juez.
- **Resuelve sus dudas SOLA y cierra con resumen** (`Consola.tareaDeFondo`, `trabajoSinPersona`,
  `TRABAJO_SIN_PERSONA`, `TOPE_DE_PREGUNTAS_CONTESTADAS_SOLAS`): `(Recommended)` o «decide tú».
- **Pregunta en espera NO es entrega** (`preguntaPendiente`, `motivoDePreguntaPendiente`): aparca sin
  juez. **El veredicto anterior se retira al empezar otro ciclo.**
- **Cortada por el tope de rondas lo DICE** (`topeAgotado`, `#motivoDeTopeAgotado`). Juez sin JSON →
  recortado a la traza de errores (`juezDeTarea#juzgar`).
- **Lo que GASTÓ la tarea** (`Tarea.gasto`, `core/actos.ts#gastoEntre`): lo que creció el acumulado de su sesión en
  cada pasada, sumado; no el acumulado entero (una continuación comparte el hilo). Finalizadas y `## Gasto` del cierre.
- **El juez ve los PLANES**, que git no ve (`planesDelProyecto.ts`, por omisión en `crearJuezDeTarea`): carpeta,
  ficheros y antigüedad, nunca contenido. Sus hallazgos se cortan por palabra con «…».
- **Al juez solo los ERRORES del verificador** (`#parrafoDelVerificador`), y las comprobaciones
  VISUALES del turno (`comprobacionesVisuales`, `CasoDeJuez`, `lineaDeComprobacion`,
  `TOPE_DE_COMPROBACIONES_AL_JUEZ`); sin ninguna, el prompt dice que no hubo.

## Corredor, consola y persona

- **Un solo corredor por máquina**: lo hace verdad `sigoSiendoDueño()` antes de cada despacho, no
  el cerrojo; su cuarentena lleva el **pid**.
- **Gana la persona, solo donde CHOCA** (`core/tareas.ts#esperasPorPersonas`, IXCODE-61): no arranca
  con una consola humana OCUPADA (turno o su commit, `ConsolaDeProyecto.ocupada`) ni con la
  conversación de ESA tarea abierta, ni con una OBRA fuera de turno (`/sync subir|bajar`, la descarga
  del Resumen: `vestibulo.ts#enObra`, que también se NIEGA con una tarea dentro). Abrir el proyecto ya
  NO frena: el choque posterior lo niega IXCODE-36, con la raíz RESERVADA desde que el corredor elige
  (`vestibulo.ts#reservadas`, fuera de `enCola`). El porqué viaja (`TareaDelCable.esperaPorTi`); «Arrancar ahora» (`cederProyecto`) solo
  cuando ceder desbloquea. Se sigue con «Continuar» (`TEXTO_DE_CONTINUAR`).
- **En el chat de una tarea que espera, su tarjeta ocupa la caja**
  (`MensajeATarea.tsx#TareaEnEsperaEnElChat`, la MISMA `AccionesDeTarea`); lo que la devuelve a la
  cola cede el proyecto. Una PREGUNTA ahí sigue dejando elegir destino.
- **PARAR sin borrar** (`{accion:"parar"}`, `Corredor.cortar(id, {pausa})`, `motivoDePausa`): la
  pausa NUNCA pasa por la entrega; 409 con motivo si no corta.
- **Cortada a mitad se REANUDA sola, una vez** (`#reanudadaTrasCorte`, `TEXTO_DE_REANUDACION` en
  SU hilo, `TOPE_DE_REANUDACIONES`, `Tarea.reanudaciones` no viaja); sin hilo, aparca. **También tras un Ctrl-C**
  (`parar`): un turno que DEVUELVE con el proceso parándose lo devolvió el corte (TrueForge devuelve al cerrarse, no
  lanza), y se deja reanudable ya. Una PAUSA no se reanuda. **Un corte PEDIDO no gasta el «una vez»**
  (`Tarea.paradaPedida`, escrita por `parar` ANTES de cortar; la lee también la reconciliación); una caída, sí.
  **`empezada` es la PRIMERA vez**: rearrancar no la mueve.
- **Abre por su PROPIA puerta** (`vestibulo.ts#abrirParaTarea`), **un solo cuerpo** con la humana,
  REENVIANDO `tarea.sesion` y el id.
- **Su consola APARCA en vez de contestar por nadie**: `preguntar`/`leerSecreto` no dan `""`, aparcan y CORTAN.
- **El feedback es mensaje de USUARIO en el mismo hilo**: LISTA, CONSUMIDO, vacío se rechaza.
- **`sesion` sobrevive si y solo si hay algo abrible.** Borrar la sesión de una tarea DECLINA;
  abrir la de una EN CURSO también (`sesion` **y** `idDeHilo`), **antes** de cerrar la abierta.
- **`mirar` no es `conectar`** (`transporte.ts`). **`arrancarConectado` es UNA función con el
  orden dentro** (puente al cable y LUEGO corredor).

## Gestor de tareas

- **Con gestor vinculado la tarea VIVE en él** (`core/tareasEnElGestor.ts`,
  `reflejoEnElGestor.ts`). **Decide el SERVIDOR** (`arranque.ts#gestorParaTareaNueva`, MISMA para
  `destino` y `crear`). `crear` (`GestorDeTareasPort.crear?`): ticket, encargo con
  `CABECERA_DEL_ENCARGO`, y SOLO después `Tarea.ticket` —copiado, nunca recalculado—; negativa = 409 sin tarea.
- **El reflejo entra por UN punto**: el `guardar` envuelto en `construirCorredorDeTareasCableado`.
  EN CURSO al empezar, `cerrarTicket` al terminar; fire-and-forget, cola por ticket, fallo en
  `ticket.aviso`. Puerto agnóstico (`tipoParaCrear` en el adaptador). **Límites**: encadenadas solo
  local, aparcar no escribe, adjuntos no suben, Notion sin `crear`.
- **Dispara adaptándose a SUS estados** (`TareasDesdeElGestor.tsx`, `VinculoGuardado.estados`,
  `GestorDeTareasPort.estados?`, `mapeoPropuesto`): cada PAPEL —preparar, lanzar, terminar— a un
  estado del flujo; el servidor NIEGA los de fuera y encender sin «lanzar». El mapeo se COPIA al
  ticket (`transicionHacia`); revincular lo conserva.
- **Disparo apagado por omisión** (`automatico`), solo tickets ASIGNADOS; sondeo
  (`sondeoDelGestor.ts`, puro en `accionesDelSondeo`) SOLO en el proceso de las tareas
  (`INTERVALO_DE_SONDEO_MS`, 5 min) y «Mirar ahora». Lanza el ÚLTIMO comentario con cabecera
  (`encargoDeLosComentarios`). **`revisarEncargo` apagado por omisión**: prepara y lanza a la vez.
- **El encargo lleva delante el ticket con su ENLACE** (`encargoConTicket`). **DESCARTAR la cierra
  en el gestor** (`cerrarTicket`): primer estado terminado, no el «terminar» del mapeo.

## Finalizadas, adjuntos, encargo

- **Finalizadas = HISTÓRICO de solo lectura** (`TareasDelProyecto.tsx#FilaFinalizada`,
  `resultadoDeFinalizada`), FUERA de la barra de sesiones: ELIMINAR (`descartar`, no toca el ticket) y REENCOLAR; fechas, nunca
  duración; lo último del agente con `leerSesion` al desplegar; conversación con motivo `finalizada`.
- **Reencolar lo pendiente NO reabre la finalizada** (`core/tareas.ts#tareaReencolada`, `accion: "reencolar"`): crea OTRA
  en su HILO (`sesion`) con el texto como FEEDBACK pendiente —el camino de «Continuar»; sin hilo, `peticionDeFeedback`
  manda el encargo delante—, adjuntos COPIADOS, sin veredicto ni cierre. **Solo sin ticket** (`puedeReencolar`): con
  gestor se relanza desde el ticket. Lo ofrece el SERVIDOR (`TareaDelCable.reencolable`, con `textoParaReencolar`, editable).
  Una con feedback no edita su encargo (`puedeEditarEncargo`). Una continuación sin acabar FRENA otra (`continuacionEnCurso`,
  por `continuaDe` o por el hilo). Mientras corre, su conversación vuelve a la barra (`App.tsx#sesionesDeFinalizadas`).
  **Su entrega se mide DESDE que se creó** (`revisable(…, desde)`, `sesionGit.ts#cambiosDeSesion`): con la sesión
  entera heredaba lo escrito por la original y se cerraba sin juez (medido en Maset). El texto propuesto pide HACER lo
  pendiente de su último resumen, no resumir. Se le pueden PEGAR o adjuntar capturas (`adjuntosDeBorrador.tsx`, el mismo
  hook que «Nueva tarea»): suben a un BORRADOR que `reencolar` adopta como id, con los de la original copiados sin pisar
  los nuevos; cerrar sin encolar borra el borrador. En Finalizadas la continuación CUELGA de su tarea
  (`TareaDelCable.continuaDe`, `apps/web/src/arbolDeTareas.ts`): familia ordenada por su última entrega. **Límite**: la
  original enseña la conversación ya continuada.
- **REVERTIR una finalizada: solo la ÚLTIMA que cambió el proyecto** (`sesionGit.ts#planDeReversion`, `revertirSesion`,
  `accion: "revertible" | "revertir"`): sus commits sellados tienen que ser el bloque de ARRIBA de HEAD, sin nada sin
  commitear, y nadie escribiendo en ese proyecto (`motivoParaNoEditar`). Se vuelve al padre de su primer commit con
  `reset --hard`, guardando antes el HEAD en `refDeRevertida` (sin respaldo no se toca nada), y la tarea SALE del
  histórico: la anterior pasa a ser la última (una PILA). Una continuación deshace solo lo suyo (`desde`). **Se niega si
  `.xonecode/` está en la base** (el reset la pisaría). La fila PREGUNTA al desplegar y confirma con la lista de ficheros.
  **Una CONTINUACIÓN devuelve también su conversación** (`web/servidor/respaldoDeSesion.ts`): al REENCOLAR se respalda el
  hilo de la padre (líneas del chat, la foto `memoria-trueforge.json`, ficheros de `artefactos/` y `hotswap/`), y al
  revertirla se SUELTA la sesión (`Vestibulo.soltarSesion`) y se restaura. Sin respaldo no se reencola. **Límites**: lo
  ya subido a CloudStudio queda pendiente de subir; las continuaciones de antes de esto no tienen respaldo; un artefacto
  reescrito con el mismo nombre se queda con lo de la continuación.
- **Sus artefactos salen de SU carpeta**: `p`/`s` resueltos por el SERVIDOR
  (`arranque.ts#sesionDelDisco`), contenido en la respuesta, nunca al store
  (`OrigenDeArtefactosContexto`). **Límite**: va por id de SESIÓN; tras `/nuevo` no coincide.
- **Adjuntos de tarea**: `~/.xonecode/tareas/<id>/adjuntos/`, fuera del proyecto, `POST /adjunto`,
  dichos al mandar el turno (`core/adjuntos.ts#conAdjuntos`); sin poda.
- **De SESIÓN** (`?para=sesion`): `.xonecode/sesiones/<id>/adjuntos/`, montados como `/adjuntos/`
  de solo lectura derivada del `hilo` (`cli/main.ts#carpetaDeAdjuntosDelEjecutor`), solo web.
  **Nombre lo decide el SERVIDOR**, sufija `-2`… sin sobrescribir. **Solo se afirman los EN DISCO**
  (`listarAdjuntosDeSesion`).
- **Un `.zip` se DESCOMPRIME al guardarlo** (`core/zipDeAdjunto.ts`, `#extraerZip`) con las
  barreras de skills `.zip` y tope por sesión; si falla, se guarda y se dice.
- **Al PROYECTO solo con `incorporar_adjunto`** (aprobación; solo `developer-xone` motor `"modelo"`;
  el diseñador, confinado a `icons/` y `fonts/`; un motor externo no recibe tools propias).
- **El encargo se AUMENTA y se enseña EDITABLE** (`AumentadorPort`, `trabajo`); fallo → el original,
  DICHO. Sin preparar, lo prepara el SERVIDOR (`#encargoAlEncolar`). Conoce los CONECTORES
  (`PeticionDeTarea.conectores`): lo que nombre de uno se trae de ahí, nunca del repo; sin
  condiciones de PARADA, una duda va con su opción recomendada.
- **Editable mientras no arrancó NUNCA** (`#conEncargo`, `puedeEditarEncargo`); el corredor manda
  el RELEÍDO; una reintentada vuelve a `nuevo` pero recibe su hilo; la `peticion` se edita aparte.
  «Regenerar» (`regenerarEncargo`) contesta SIN guardar, no por `augmentado`. **Y sus IMÁGENES**, como «Nueva tarea»: las
  nuevas a un `borrador`, las de antes por nombre (`quitarAdjuntos`); se comprueba todo antes de tocar la carpeta
  (`tareasEnDisco.ts#adjuntosEditados`), y el diálogo no descarta el borrador mientras guarda.

## Encadenadas

- **La cola se REORDENA a mano** (`core/tareas.ts#reordenarCola`, `{clase:"tarea", accion:"ordenar"}`): `ids` son TODAS
  las `nuevo` del proyecto o se niega con 409; se reparten sus mismas claves (`Tarea.orden`, `claveDeCola`) y, si era
  encadenada, se reescriben los `tras` en el orden nuevo (la primera espera a lo que esperaba la cabeza). La que trabaja
  no se mueve. `mensajeDeTareas` manda la lista YA en orden de cola (`porSitioEnLaCola`).

- **Con diseño en Stitch, cada tarea propuesta NOMBRA sus pantallas** (título y `name`) y pide traerlas antes de nada
  (`REPARTIR_EN_TAREAS`); el plan se escribe desde las pantallas que el orquestador trae ANTES del analista
  (`PLAN_PRIMERO`), y si el plan y la maqueta no coinciden, manda la maqueta. Es redacción, no guarda.
- **Lo que el encargo CITA, lo trae el corredor** (`core/stitch.ts#pantallasCitadasEnElEncargo`): sin
  `pantallasDeStitch` elegidas, los `projects/…/screens/…` del encargo se traen antes del primer turno como si
  lo fueran (`diseno/`, `diseno/2/`…). Medido en Maset: un encargo decía «ya está en `/artefactos/diseno/`» y no estaba.
- **El agente solo PROPONE** (`core/repartoDeEncargo.ts`, `proponerTareas.ts`,
  `PropuestaDeTareas.tsx`); crea el clic, TAMBIÉN en autónomo. Solo el raíz de TrueForge en
  consola de PERSONA web (`Consola.proponeTareas`). `TASKS.md` con varias
  (`TAREAS_PARA_RECORDAR_EL_REPARTO`) → `avisoDeReparto`, una vez por plan.
- **Se encola del ACTO** (`propuestaPendiente`, `copiarAdjuntosDeSesion`), sin aumentador.
  Tres salidas: encolar, descartar, «Hacerlo aquí en el chat» (`enChat`). **Resuelta es OTRO
  acto** (`propuesta-resuelta`, `anotarActo`), guardado al momento: el `.jsonl` solo crece.
- **`Tarea.tras` es el orden** (`siguientesAEjecutar`): espera a la anterior `terminada`; DESCARTADA no retiene.
