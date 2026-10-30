# La aprobación

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# La aprobación

- **Fail-closed: lo que no se entiende es RECHAZO** (`cli/aprobar.ts`, `vendor/hitl.ts`). El Enter
  a secas aprueba solo con un TTY de verdad detrás; sin él la cadena vacía rechaza. Tope de
  `MAX_APPROVAL_ROUNDS = 5` rondas por turno.
- **El modal de la TUI es fail-closed POR TECLA** (`cli/tui/aprobarTui.tsx`): solo `s`/`S`
  aprueba; `n`, Enter, Escape, Ctrl-C y desmontar sin responder son rechazo.
- **La FORMA de una pregunta viaja CON ella, y no se adivina del enunciado**
  (`DecisionDeConsola`, `cli/aprobar.ts`): `Consola.preguntar` lleva un segundo parámetro OPCIONAL
  con las LÍNEAS de lo que se decide, y con él la piel pinta el plan y dos botones en vez de un
  campo de texto. Es opcional a propósito, así que stdio/TUI/consola de tarea/dobles no cambian.
  El enunciado viaja SIN la pista de tecleo (`PISTA_DE_DECISION` la añade la piel con teclado).
  **Cada línea del plan dice qué le PASA, también como dato** (`LineaDelPlan.cambio`: `nuevo`,
  `modificado`, `borrado`), nunca deducido del `+`/`~`/`-` de texto. En el navegador la tarjeta NO
  es un `<form>` y contesta `"s"`/`"n"`. La AUSENCIA se conserva de punta a punta (`decision ===
  undefined`). Esa tarjeta es un DIÁLOGO, no un renglón del hilo (`Pregunta.tsx`, misma puerta que
  `Aprobacion`) y un modal DE VERDAD: solo «Aceptar» autoriza y solo «Cancelar» rechaza; `Escape`
  y el clic en el velo NO hacen nada (rechazar con ellos tiraba sin querer una subida que se
  revisaba), y desmontar no contesta nada. Lo sin contestar lo salda el plazo del servidor
  (`MS_DE_ESPERA_POR_OMISION`, 10 min) con cadena vacía.
- **La subida deja ELEGIR qué ficheros suben, y quién decide lo que sube es el SERVIDOR**
  (`DecisionDeConsola.seleccionable`, `LineaDelPlan.ruta`, `Consola.decidirConSeleccion?`, solo en
  la web): el plan sale como el árbol de Revisión con casillas (`seleccionDelArbol.ts`, puro), y
  la `respuesta` lleva `seleccion`. `PoliticaDeAprobacion` contesta `boolean | {rutas}` y lo que
  se ejecuta lo dice SIEMPRE `core/cloudstudio.ts#planAutorizado` —la intersección con el plan—,
  **nunca la veracidad**: `{rutas: []}` es «verdadero» y es un rechazo. El terminal sigue todo o
  nada.
  **Aceptar NO cierra el diálogo, ni al subir ni al «Actualizar repo local»**: la decisión dice
  de QUÉ operación es (`DecisionDeConsola.operacion`), y `App` la retiene (`operacionEnDialogo`)
  con Aceptar girando y Cancelar (y las casillas) bloqueados, hasta que llega el acto de ESA
  acción; entonces dice cómo fue y su «Aceptar» lo cierra. Todo viaja como DATO en el acto
  (`resultado`, `bajados`, `error`), nunca leído del texto; sin él no se dice «todo bien». El
  `error` es el mismo texto que el bucle de comandos escribe en el hilo (`describirError`): `/sync`
  lo apunta y RELANZA.
- **La única grieta es el MODO DE ESCRITURA, y vive en la SESIÓN** (`core/modoDeEscritura.ts`,
  comando `/aprobacion`): `supervisado` —cada escritura con su diff— o `autonomo` —se aplican
  solas—. Ausente es supervisado; **con qué modo NACE una sesión nueva de una persona sí tiene
  valor por defecto**, global (`settings.json`) y por proyecto (`config.json`, gana si está),
  y solo decide eso: ni reabiertas ni tareas (`modoParaSesionNueva`, IXCODE-31); hace falta alguien delante, calculado como `interactivo &&
  !eof()` igual que `pedirDecisiones`; se pregunta en cada RONDA y no al abrir; se DICE dos veces
  (aviso por turno, y `alta.modoDeEscritura`); el mismo predicado alcanza a los motores externos.
  **Gobierna las escrituras LOCALES y nada más**: `/sync subir` conserva su plan y aprobación
  fail-closed en los dos modos. **En TrueForge, además, en autónomo no se le pregunta a nadie**: una pregunta del agente
  con UNA opción `(Recommended)` se contesta con ella (`opcionRecomendada`), una sin marca vuelve al agente pidiéndole
  que decida y lo diga (`RESPUESTA_AUTONOMA_SIN_RECOMENDADA`), cada una POR SEPARADO —varias a la vez no son «todas o
  ninguna»— y con tope (`TOPE_DE_PREGUNTAS_CONTESTADAS_SOLAS`); todo se DICE en el chat, **como la tarjeta de la pregunta con
  lo elegido marcado** (evento y acto `consulta-autonoma`, `Piel.consultaAutonoma?`), no como aviso: plegada en
  «Verificaciones», la persona contestaba después sin saber que ya estaba decidido (IXCODE-47). No es una `consulta` con
  marca: todo lo que lee una `consulta` la toma por pendiente. En supervisado llegan a la persona.
  El tope de rondas de la consola vale lo MISMO que el de una tarea
  (`TOPE_DE_RONDAS_DE_CONSOLA`, `TOPE_DE_RONDAS_DE_TAREA`; subidos juntos cuando el ajuste de una pantalla contra su
  maqueta los agotaba en un turno); sin nadie delante se queda el cinco de `MAX_APPROVAL_ROUNDS`. **`run` no lee el
  modo**: nada se aplica sin un «s» explícito, salvo con `XONECODE_RUN_AUTONOMO=1` EXACTO (`runAutonomoPedido`), que es
  para MEDIR un turno entero y se dice en la cabecera. Lo
  que `/aprobacion` EXPLICA lo decide el destino, no la línea (`Consola.modoALaVista`): donde el
  modo está siempre a la vista (la web) sale una línea; donde no (el terminal) salen los tres
  detalles.
- El origen del interrupt se dice UNA vez: `aPendiente` (`agent/turno/interrupts.ts`) quita el
  prefijo `[perfil]` de la descripción porque el dato ya viaja en `origen`.
