# Decisiones: el porqué, medido

Esto es el razonamiento que vivía en `CLAUDE.md` hasta el 11-09-2026, sacado aquí para que ese
fichero vuelva a ser lo que su cabecera prometía: el mapa y los invariantes. **Nada se ha
reescrito**: los párrafos están tal cual, con sus cifras medidas y sus fechas. `CLAUDE.md`
guarda la regla en una línea; aquí está por qué es esa y no otra, y qué se midió para saberlo.
Cuando una decisión se SUPERA, el párrafo no se reescribe ni se borra: se le pone delante una
entrada fechada que dice qué cambió y por qué. Borrarlo perdería el razonamiento que llevó
hasta aquí, y dejarlo solo dejaría una afirmación falsa sin fecha.

Ante una discrepancia entre este documento y el código, el código manda.

**17-09-2026 — `src/agent/` se partió en ocho carpetas, y las RUTAS de este documento se
actualizaron.** Es la única vez que se ha tocado un párrafo ya escrito, y se hizo con la regla
delante: lo que no se reescribe es el RAZONAMIENTO y sus cifras medidas, y una ruta no es
ninguna de las dos cosas — es el puntero con el que se salta al código, y un puntero que miente
se lleva por delante justo el valor de haber medido. Así que `agent/x.ts` pasó a
`agent/<carpeta>/x.ts` en las citas, y **ni una palabra del texto cambió**. El reparto copia las
secciones de `CLAUDE.md` (`grafo/`, `turno/`, `subagentes/`, `tareas/`, `sesiones/`,
`cloudstudio/`, `dispositivos/`, `config/`) para no inventar un vocabulario nuevo: el sitio del
código y el sitio del mapa se llaman igual. Lo que sirve a dos carpetas se queda en la raíz de
`agent/`, que hoy es solo `raizDelPaquete.ts`. El porqué de que ese módulo exista, y de que
tuviera que ir ANTES del reparto, está en su propia cabecera: era el único paso que `tsc` no
podría verificar después.

**El reparto entre este documento y el mapa también se prueba** (`src/documentacion.test.ts`), y no
por gusto de un test más: el reparto se deshizo una vez y nadie lo vio. `CLAUDE.md` volvió a ser el
mapa el 11-09-2026 con 628 líneas; **ese mismo día**, en 17 commits, se le fueron 328 netas (+52 %)
hasta las 956, casi todas narrativa de medidas. El mecanismo no fue un descuido: quedó un bloque
`SUPERADO` que, para «el detalle vivo», señalaba HACIA `CLAUDE.md` — la inversión exacta del
reparto, y una invitación permanente a reabsorberlo. Ese bloque ya apunta aquí.

Lo que se comprueba es la PROSA del mapa: ni una fecha, ni un censo de medidas («medido N veces»),
ni un recuento de llamadas o un porcentaje, ni una duración suelta. La duración es la única de las
cuatro con una forma legítima, y es la que se queda: entre paréntesis y con el nombre de su
constante (`MS_DE_TRABAJO_AL_ABRIR`, 2 s), porque entonces la cifra es parte de la REGLA y no el
acta de haberla medido. Los paréntesis se siguen con la profundidad abierta de una línea a la
siguiente —el mapa parte constantes entre líneas—, y se cuentan las dos orillas: un paréntesis sin
cerrar dejaría la comprobación muda para el resto del fichero, y un test que no puede fallar no es
un test.

## Los comandos y los tests

**`vitest.config.ts` existe por dos razones, no una.** Hasta que el cliente web lo exigió, los
valores por omisión bastaban — pero tenían un coste medido: el `include` por omisión barre TODO
el repo, y `.worktrees/` (ignorado por git desde `ddf2948`, pero presente en disco) no está en
el `exclude` por omisión. Con un worktree viejo ahí, `npm test` corrió 128 ficheros en vez de 66
y dio 2 fallos que no son de este código. La config resuelve las dos cosas con `test.projects`:
el proyecto `host` acota `include` a `src/**` (un worktree bajo `.worktrees/<x>/src/` ya no
casa, y además está en su `exclude`) y corre en `environment: "node"`; el proyecto `cliente`
acota a `apps/web/**` y corre en `jsdom`, porque ahí sí hay DOM que probar.
`environmentMatchGlobs` no existe en vitest 4 (comprobado contra `vitest@4.1.11`: cero
apariciones en sus `.d.ts`) — `test.projects` es el único mecanismo real para elegir
`environment` por ruta. El remedio manual, `npx vitest run --exclude '**/.worktrees/**'`, ya no
hace falta: `npm test` sin banderas excluye `.worktrees/` solo.


**`npm test` no puede necesitar una clave, una conexión ni el simulador.** Es el invariante que
sostiene todo el diseño de puertos: si un cambio lo rompe, está mal el cambio, no el test.

**`npm run web` es la excepción a la regla de abajo**, y solo esa: construye el cliente
(`arrancarConsolaWeb` sale **70** si falta `apps/web/dist/index.html`) y levanta la consola web
con `--web`, que la fuerza aunque no haya TTY. Puede vivir con el cwd puesto en este repo porque
**la web no abre el cwd**: arranca en el vestíbulo, sin ninguna raíz, y el proyecto se elige en
la barra lateral (el único caso en que el cwd SÍ se abre es el atajo `offline` + `--guion`). Del
cwd solo salen tres cosas menores: el `config.json` de proyecto si esa carpeta lo es —ojo, un
`.xonecode/` en la raíz de este repo haría desaparecer el paso de cuenta del alta, porque
`origenDeTrabajo` dejaría de ser `omision`—, el nombre del saludo (`git config user.name` visto
desde ahí) y el aviso de proyecto offline.

**No uses `npm run xonecode` desde otro proyecto**: `npm run` cambia el cwd al de este
`package.json`, así que xonecode creería que el proyecto es este repo. Para probar sobre una app
real, `./bin/xonecode` (o `npm run build && npm link`). Ese lanzador le pasa a tsx `--tsconfig`
anclado a la raíz del repo: tsx busca el tsconfig.json desde el cwd, así que lanzado desde otro
proyecto perdería el `jsx: react-jsx` y la TUI reventaría con «React is not defined» al montar.
Medido; hay un test (`src/cli/lanzador.test.ts`) que vigila el anclaje.


## Arquitectura

Seis capas, y la frontera importa más que el contenido:

| capa | qué es |
|---|---|
| `src/core/` | TypeScript **puro**: eventos de dominio, motor de turno, puertos + dobles, resolución de modelos, config |
| `src/agent/` | toda la suciedad del grafo: deepagents, langgraph, backend de ficheros, perfiles, verificador, git |
| `src/cli/` | despachador (`main.ts`), consola interactiva (`consola.ts`), un disparo (`run.ts`), comandos de diagnóstico |
| `src/web/` | el SERVIDOR de la consola web: http en loopback, SSE, vestíbulo, sesiones, piel web |
| `apps/web/` | el CLIENTE: React + Vite, un `package.json` propio (workspace) que se compila a `apps/web/dist` |
| `src/vendor/` | módulos propios traídos de un laboratorio anterior (HITL, conteo de tokens), con sus tests |

**La frontera de `core/` está PROBADA.** `src/core/imports.test.ts` recorre los ficheros de
`core/` y falla si aparece un import de langchain, `@langchain/*`, langgraph, deepagents, ink,
react o `@modelcontextprotocol`. Al añadir algo a `core/`, esa es la regla dura. (La otra
convención — `agent/` no importa de `cli/` — vive solo como comentario en `agent/turno/turnoReal.ts`;
nada la verifica. En el otro sentido sí se puede: `cli/main.ts` importa
`ficherosDelProyecto` de `agent/turno/turnoReal.ts` para el completado de «@ficheros» del Tab.)

**Los puertos y sus dobles** (`core/ports.ts`, `core/deps.ts`). Todo lo caro (modelos, skills,
verificador, MCP) entra por un puerto que se **pasa al construir**, nunca se importa dentro de
quien lo usa. Los dobles viven en `ports.ts` y no en fixtures de test, porque el modo offline es
un modo de uso de primera clase (`xonecode describe` lo enseña). La marca de doble es el Symbol
`ES_DOBLE`, no un booleano: un campo se puede olvidar o poner mal, y entonces el aviso calla
justo cuando hace falta.

**Los eventos de dominio** (`core/events.ts`). `agent/` los emite (el puente
`agent/turno/puente.ts` traduce los chunks del stream de langgraph), `core/turno.ts` decide qué se
cuenta, y las pieles (`cli/stdio.ts`, `cli/tui/`, `web/servidor/pielWeb.ts`) pintan. Ningún evento lleva argumentos
de tool, ni truncados: `write_file` lleva el contenido del fichero y una tool MCP lleva el
bearer. La excepción aparente es `tool.detalle`, y no es una excepción: una lista blanca por
NOMBRE de tool (`agent/turno/resumenDeTool.ts`) extrae un solo campo de ruta/patrón — nunca contenido.
Y el bloque de diff de la aprobación (`cli/aprobar.ts`, líneas de `core/diff.ts`) es el único
sitio donde el contenido se enseña entero: es el paso donde se DECIDE sobre él.

**Los avisos de honestidad son código, no prompt**, y tienen alcance de **turno**
(`core/bitacora.ts`): a un modelo al que le pides «avisa de que el verificador es de pega» a
veces no avisa, y un aviso que salta cuando no ha pasado nada enseña a ignorarlo.

**El verificador está EN el turno, no solo en `xonecode verify`** (`agent/turno/turnoReal.ts#conVerificacion`).
Hasta ahora el simulador solo se llamaba desde ese comando suelto, y el evento
`verificacion` solo lo emitía el agente de pega: el agente real escribía y nadie miraba,
con el aviso «no ha corrido» diciendo la verdad en todos los turnos. Ahora, al terminar un
turno que escribió ficheros del proyecto, se corre `xone-simulator validate --json` y el
veredicto entra en el mismo flujo de eventos. Cinco reglas, y el porqué de cada una:
- **Cosido al FINAL del flujo, no después del turno.** `correrTurno` cierra el turno en su
  `finally` —el aviso de honestidad y `piel.fin()`— en cuanto el flujo se agota; verificar
  después pintaría el veredicto detrás del fin, y en la web el compositor ya se habría
  encendido con el turno «terminado». Por eso es un generador que envuelve a `aEventos` y
  añade sus eventos cuando el interior se acaba.
- **Solo la ronda FINAL**: la que termina sin escrituras pendientes. Con aprobaciones por
  resolver las escrituras no se han aplicado, así que medir ahí daría un veredicto sobre un
  proyecto que aún no ha cambiado.
- **Solo si el turno tocó ficheros del PROYECTO.** `.xonecode/` no cuenta —ahí escribe el
  propio harness: memoria, resúmenes de contexto—, y sin esa exclusión un «cuéntame un chiste»
  pasaría por el simulador. Y **el aviso «no ha corrido» solo sale si el turno escribió y aun
  así no se verificó**, con el motivo: antes saltaba en todos los turnos, y un aviso que salta
  cuando no ha pasado nada enseña a ignorarlo — justo lo que la bitácora de turno existe para
  evitar.
- **Los hallazgos se REPARTEN** entre los ficheros que el turno tocó y los demás. El
  simulador mira el proyecto entero (es su API), y un error que ya estaba en un fichero que
  el agente no abrió no es del agente: atribuírselo sería falso, callarlo sería fingir un
  proyecto limpio. El evento lleva los del turno con fichero RELATIVO y línea —nunca
  contenido— y `preexistentes` cuenta los otros. Un hallazgo sin fichero no se puede
  atribuir y se enseña con los del turno, que es el lado conservador.
- **Que no esté el binario es fallo del ENTORNO**, y se dice como tal en un `aviso` — sin
  tumbar el turno, y con el aviso de honestidad saliendo igualmente, porque no ha corrido.
  El verificador entra por parámetro (`verifier?: VerifierPort`), así que `npm test` sigue
  sin necesitarlo: los tests del lazo usan dobles en línea y la instantánea falsa.
**Y un veredicto rojo se REPARA** (`TOPE_REPARACIONES`, dos intentos): los hallazgos vuelven
al agente como un mensaje de USUARIO en el mismo hilo —código, fichero relativo, línea y
mensaje, y el recordatorio de que no se invente nada para que el error desaparezca—, se
vuelve a verificar, y así hasta verde, hasta el tope, o hasta que corregir no cambie nada.
Lo que sostiene el lazo:
- **La huella son los ERRORES** (código|fichero|línea), no todos los hallazgos, y se compara
  con la del veredicto anterior, no con «¿bajó el número?»: un aviso que va y viene no dice
  nada de si el error se arregla, y dos errores distintos en vez de dos iguales también es
  avance. Misma huella dos veces → `bloqueado (no-progreso)` antes de gastar el tope; tope
  agotado con errores distintos → `bloqueado (tope-reparaciones)`, con la cifra.
- **Un turno cierra UNA vez.** `correrTurno` corre una vez por pasada —ronda de aprobación o
  intento de reparación— y antes cada pasada cerraba: stdio imprimía el tiempo por ronda y
  el chat plegaba el tramo por ronda (medido). Ahora `OpcionesDelTurno.cerrar` lo decide el
  generador al agotar el flujo, que es el único que sabe si detrás viene otra pasada; y
  `desde` le pasa el `t0` del turno entero, porque el `fin` de la última pasada contaba solo
  lo suyo — un turno de cuarenta segundos con aprobación por medio decía «5.0s». Las
  condiciones con que el generador predice «habrá otra ronda» son las MISMAS del `break` del
  bucle, y tienen que serlo: si divergen, un turno se queda sin `fin` o cierra dos veces.
- **Si la aprobación revienta tras una pasada que no cerró** (el «sin humano» de `run.ts`
  corta desde dentro), el turno cierra él antes de propagar: sin eso ese turno se quedaba sin
  línea de tiempo y sin plegar. Los avisos no se pierden ahí: con escrituras pendientes no
  aplica ninguno.
- **`reparacion` se emite al EMPEZAR la pasada del intento**, no al final de la anterior: el
  «🔁 reparando» abre el tramo de trabajo que viene, en vez de cerrar el que acaba. Es el
  orden que `guionizado.ts` ya recorría.

**El panel de avisos** (`cli/panel.ts`) es la ÚNICA excepción al append-only de la consola: las
notificaciones de sistema (pausas, avisos deterministas, el tiempo final) viven en un recinto de
hasta 5 líneas grises que se **repinta en sitio** por encima del punto de escritura, y al
solidificarse deja en el historial solo la ÚLTIMA — el fin fusiona avisos pendientes y tiempo en
esa línea, para que el aviso de honestidad no lo borre el tiempo final. Dos reglas duras: el
borrado es EXACTO por número de líneas (nunca «hasta fin de pantalla», porque debajo puede vivir
el spinner) y **sin TTY el panel no se instala** — el motor cae en `Piel.notificacion?` (mismo
patrón que `fase?`) y las líneas estáticas de siempre, así que pipes y guion salen byte-idénticos.

**La TUI** (`cli/tui/`) es una piel Ink de LA MISMA consola (`cli/consola.ts`): el lazo de
comandos, el estado de sesión y el ejecutor entran INYECTADOS (`cli/tui/correrTui.ts`); la TUI
solo aporta entrada, preguntas, piel y el modal de aprobación. La frontera está probada
(`cli/tui/frontera.test.ts`): ink y react no se importan fuera de `cli/tui/` — igual que
langchain no entra en `core/` —, y es lo que mantiene pipes y `npm test` funcionando sin TTY.
El modo lo decide `decidirTui` (`cli/main.ts`): `--no-tui` gana siempre; `--tui` fuerza la TUI
(y sin TTY de verdad en ambos lados es error de USO, 64); por omisión, TUI solo con stdin Y
stdout TTY — cualquier tubería cae al stdio de siempre, que es lo que mantiene el e2e de pipe
byte-idéntico. El modal de aprobación (`cli/tui/aprobarTui.tsx`) es fail-closed POR TECLA: solo
`s`/`S` aprueba; `n`, Enter, Escape, Ctrl-C y desmontar sin responder son rechazo. Ink corre con
`exitOnCtrlC: false` (`cli/tui/correrTui.ts`) porque Ctrl-C tiene significado aquí: cancelar el
turno (un punto de cancelación en la piel, con rearme por turno) o rechazar en el modal.

**Las líneas de tool en la TUI son un grupo, no actos** (`cli/tui/store.ts`): las consecutivas
de un turno viven en un acto `herramientas` que el transcript pinta como sus últimas 4 líneas
en gris tenue, truncadas a una fila, más «… N pasos antes». El colapsador del motor
(`core/notify.ts`) escribe apertura Y cierre de cada racha porque stdio solo añade; el store
de la TUI sustituye la apertura por el cierre. stdio no cambia: es la piel la que decide.

**La TUI captura el ratón y usa la pantalla alternativa** (`cli/tui/raton.ts`, secuencias en
`cli/tema.ts`, el ÚNICO fichero de producción con escapes ANSI — `tema.test.ts` lo vigila). La
rueda mueve el transcript (3 actos por muesca) y no el scrollback; el filtro va DELANTE de Ink
(`crearStdinSinRaton`), porque una secuencia de ratón que llegara a `useInput` acabaría como
texto en la Entrada. Los modos solo se escriben con stdout TTY y se deshacen en el `finally`
DESPUÉS de desmontar Ink. `--sin-raton` apaga el ratón (queda PgUp/PgDn). Coste asumido:
seleccionar texto es Alt/Shift + arrastre.

**La maqueta de la TUI tiene una sola pieza elástica** (`cli/tui/app.tsx`). La fila de dos
columnas mide `rows - 1` (`FILA_DE_RESERVA`), porque Ink borra el terminal entero y repinta el
frame completo cuando la salida alcanza `stdout.rows` — con la fila a `rows` eso pasaría en cada
tecla. Dentro, el transcript es lo ÚNICO que cede (`flexGrow`, `overflow="hidden"`, recorta por
ARRIBA, y cada acto va en un Box con `flexShrink={0}` porque si no Ink pierde actos del medio);
la Entrada, la Pregunta, el pie y la sidebar llevan `flexShrink={0}`. Sin eso, medido, la fila
del modelo de la Entrada pisaba la línea en edición y el cursor desaparecía en cuanto había
pista de Tab o el transcript se llenaba. `cli/tui/app.test.tsx` monta `App` entera contra un
stdout falso y vigila esos estados; los tests de componente no los ven.

**La consola web** (`src/web/`, `apps/web/`) es la TERCERA piel de LA MISMA consola, y desde
esta versión la de omisión. `decidirPiel` (`cli/main.ts`) la elige: `--cli` gana siempre y da
la consola de terminal entera (con `--tui`/`--no-tui` dentro de esa rama), `--web` la fuerza
incluso sin terminal, y **sin stdin TTY la omisión NO es la web** — `echo "…" | xonecode`
intentaría abrir un navegador y se llevaría por delante el e2e de tubería byte-idéntica, que
es lo que sostiene que `npm test` no necesite terminal. El TTY entra por parámetro para poder
probar los dos lados sin terminal, igual que `decidirTui` se prueba sin TTY.

`arrancarConsolaWeb` (`web/servidor/arranque.ts`, no en `main.ts`, que ya pasa de mil líneas)
comprueba en este orden: que existe `apps/web/dist/index.html` —si no, «falta el build del
cliente» y salida **70**, fallo del ENTORNO y no del proyecto—; si el cwd tiene un
`.xonecode/config.json` con `modo: "offline"`, lo dice y **sigue**, porque es un aviso y no un
error; y después levanta el servidor, imprime la URL con el token y abre el navegador salvo
`--no-abrir`. Abrir el navegador es lo accesorio: `abrirEnSistema` (`agent/cloudstudio/cloudstudioMcp.ts`,
compartida con el callback de OAuth) escucha el `error` del `spawn`, porque un `xdg-open` que
no existe emite ese evento y sin escucha se lleva el proceso por delante — la URL ya está
impresa y el servidor tiene que seguir en pie.

El servidor (`web/servidor/servidor.ts`) es `node:http` en **loopback y nada más** —no hay
bandera para `0.0.0.0`—, con token en la query que se convierte en cookie `HttpOnly`,
comprobación de `Host` y `Origin` en TODA petición (el ataque real a un servidor local es el
DNS rebinding, no el escaneo de puertos) y `.xonecode` denegado por el TEXTO de la ruta antes
de tocar disco. `arranque.ts` es quien monta las dos rutas del cable: `GET /eventos` (SSE) y
`POST /accion`. Un cuerpo ilegible responde 400 **sin devolver nada de lo recibido**: por ahí
pasa la clave de API.

**Y la consola web DICE con qué código corre** (`core/version.ts` + `agent/config/versionEnDisco.ts`,
opción `version`), antes que la URL: `xonecode 0.5.0 · 85219d4 + cambios sin commitear`. Existe
por tres rondas perdidas el 11-09-2026 y por la asimetría que hay que tener presente:
**el cliente se lee del DISCO en cada petición** (`servidor.ts`, `readFileSync`), así que
reconstruirlo se ve recargando la página, mientras que el SERVIDOR es el proceso y sus cambios
solo entran parándolo y arrancándolo. Una consola puede enseñar a la vez lo nuevo del cliente y
lo viejo del servidor, y sin esta línea nadie —ni mirando la pantalla ni leyendo el código—
podía saber qué había vivo dentro: se depuraba un cambio que no estaba corriendo, o se daba por
bueno uno que sí. Cuatro reglas más:
- **El árbol SUCIO se dice**, porque entonces el commit solo no describe lo que corre:
  `85219d4 + cambios sin commitear`.
- **Y no poder mirarlo no es «limpio»**: sin git o con git roto la línea declara que no se pudo
  comprobar, en vez de afirmar un estado que nadie ha medido.
- **La lectura entra por PARÁMETRO**, porque toca disco y lanza `git`: los tests llaman a la
  función entera sin doblar el sistema de ficheros, que es lo que hace comprobable que la frase
  dice la verdad.
- **Va ANTES de la URL** y no después: es la primera cosa que hay que saber al mirar el
  terminal, y debajo de la URL un mensaje de arranque se pierde entre las líneas del alta.

**El pulso se pliega al terminar el turno.** Mientras el agente trabaja, el tramo de
razonamiento/tools/fases se enseña ABIERTO —es lo único que hay que mirar—; en cuanto llega
el `fin`, se dobla en una línea («Trabajo del agente · N pasos · Xs») y la conversación se lee
sin el andamio. No se BORRA: sigue a un clic, y en la Trayectoria está entero. Lo que cierra
un tramo es cualquier acto de conversación; lo que lo da por TERMINADO es solo el `fin`, y
entonces termina todos los del turno — un tramo cerrado por la respuesta puede tener más
tools detrás, y plegarlo antes de tiempo escondería trabajo en curso.

**Los dólares del asistente se ESCAPAN antes de pintarlos** (`apps/web/src/protegerDolares.ts`).
Medido en vivo: «en XOne se usa $http … y el objeto $ui no existe» salía como
«*httpparapeticionesyelobjeto*ui» — el `MarkdownText` de deepseek monta
`micromark-extension-math` con el dólar simple activado y no expone interruptor, y por sus
propios tipos la gramática de streaming NO tiene matemáticas y la asentada sí: la frase se
veía bien mientras llegaba y mutaba al terminar. En XOne `$http` es un objeto real y aquí
nadie necesita LaTeX, así que se escapa TODO dólar fuera de código (`\$` es CommonMark y
las dos gramáticas lo respetan); dentro de vallas y tramos de código no se toca, porque ahí
ya era literal y la barra se vería. Solo para lo que se le da a `MarkdownText`: el botón
de copiar y las Trazas llevan el texto original.

**Una sesión reabierta lo DICE, y lo dice el servidor** (`alta.historica`). El cliente
marcaba `historica: true` a TODAS las sesiones guardadas por su cuenta (cursiva en toda la
barra, incluida la activa) y la sesión ABIERTA no llevaba la marca por el cable: el chat
enseñaba una conversación y un compositor activo como si se pudiera seguir hablando, cuando
el hilo del agente murió con aquel proceso. Ahora `ConsolaDeProyecto.historica` viaja en el
alta solo cuando es cierto, el chat lo dice arriba con palabras, Ficheros da la causa que
conoce en vez de dos posibles, y la cursiva se fue. **El alta se reanuncia en los DOS
flancos del turno, y DIFERIDO** (`arranque.ts`, la escucha de `alCambiarTurno`): una sesión
nueva no aparecía en la barra hasta recargar, porque su id nace en `volcar()` al final del
turno y nadie volvía a anunciar; y `historica` deja de serlo al EMPEZAR el primer turno
nuevo. Diferido a una microtarea porque `vestibulo.ts` llama a la escucha ANTES de
`volcar()` en el mismo `finally` síncrono: anunciar en el acto leería la sesión sin id.

**Las sesiones de la barra son UNA lista, y se distingue qué es cada una y cuándo se tocó**
(`EntradaIndice.tarea`, `alta.proyectos[].sesiones[].deTarea`/`.ultimoTurno`,
`apps/web/src/selloDeFecha.ts`). Una tarea de fondo abre su PROPIA sesión y entra en el mismo
índice del proyecto, así que ya salía en la barra — mezclada con las conversaciones y, medido
en el proyecto real del usuario, **con el título en blanco**: el título sale del primer acto de
`usuario` y una tarea no manda ninguno. Cinco reglas:
- **De quién es una sesión se GUARDA, no se deduce.** `crearSesion` escribe el id de la tarea
  cuando la abre la puerta de las tareas —`abrirParaTarea` lo baja hasta el cuerpo compartido—,
  y es el único sitio que lo sabe. Cruzarlo después con la cola parecía gratis y es un fallo
  abierto: la cola es OPCIONAL en las dos capas (`OpcionesDeMontaje.colaDeTareas` y el mensaje
  `tareas`), así que en un proceso que no corre tareas el cruce pintaría TODAS las sesiones de
  tarea como conversaciones, en silencio. Es el camino que ya recorrió `historica`: de
  suposición a hecho comprobado.
- **Ausente es «no consta», no «es un chat»**: se pinta liso porque liso es lo conservador, no
  porque conste que sea de una persona. Y como la marca es nueva, hay una **SIEMBRA al arrancar
  el corredor** (`sesiones.ts#marcarTareaDeSesion`) que recorre su propia cola y marca las
  sesiones que ya existían — si no, la primera sesión de tarea de cada proyecto se quedaba
  mintiendo para siempre (medido: en AppDemo, la única que hay). No es el cruce prohibido de
  arriba y la diferencia es cuál es la pregunta: en el cable es «¿esto es de una tarea?», y sin
  cola la respuesta sería «no» en silencio; aquí es «marca estas, que sé que lo son», leyendo la
  autoridad que escribió el dato. Es **monotónica**: solo AÑADE —no pisa una marca puesta ni la
  quita, así que no puede convertir una sesión de tarea en una conversación— y **no da de alta
  la entrada que falte**, porque la cola vive en `~/.xonecode/tareas` y el índice en el proyecto:
  una tarea puede nombrar una sesión que alguien borró, y crearla la resucitaría en la barra
  apuntando a un `.jsonl` que ya no está.
- **Y la costura del corredor se dejaba el argumento, con todo en verde.** `abrirParaTarea` se
  reenvía con una lambda escrita a mano (`arranque.ts#construirCorredorDeTareasCableado`), y
  TypeScript no se queja de una función que ignora parámetros: el id de la tarea se caía ahí
  igual que se cayó `tarea.sesion` en su día. Es la MISMA función y el MISMO fallo por tercera
  vez —tercer argumento, cuarto argumento—, y lo caza un test por argumento contra esa
  composición exportada, que es para lo que se extrajo.
- **Por el cable viaja un BOOLEANO, no el id de la tarea.** La fila lleva una marca y no el
  nombre de la tarea —en 280 px comparte hueco con el título y con el «…»—, así que el id se
  queda en el host, la misma regla que la ruta de una herramienta o el pid del corredor.
- **El orden es por `ultimoTurno`**, que también estaba en el índice desde siempre y tampoco
  viajaba. Era `[...sesiones].reverse()`, o sea el orden de alta al revés: una conversación
  vieja reabierta hoy se quedaba abajo del todo. Las entradas sin hora van al final y entre
  ellas se conserva el criterio de siempre (invertido), que es lo único que se sabe de ellas.
- **Y lo que falta se ROTULA, no se inventa.** Una fila sin título dice «Tarea de fondo» si
  consta que lo es y «Sin título» si no; el sello de fecha no se pinta si la hora no se puede
  leer, en vez de un «Invalid Date». El año solo sale cuando no es el actual: repetido en todas
  las filas no distingue ninguna, y omitido siempre haría que un «7 sept» del año pasado se
  leyera como de anteayer.

**El gasto de una sesión vive en el ÍNDICE y su cifra en la barra es UNA**
(`EntradaIndice.consumo`, `core/actos.ts#acumularTotales`, `sesiones.ts#anotarConsumoDeActo` /
`#sembrarConsumosPendientes`, `transporte.ts#SesionDelCable`, `componentes/CosteDelTurno.tsx` con
`ambito: "sesion"`, `componentes/Barra.tsx#FichaDeSesion`). El contador del compositor dice lo que
lleva la conversación ABIERTA; esto es lo que costó una conversación CERRADA, que es la única
forma de que la lista conteste «¿cuál de estas me está costando más?». Ocho reglas:

- **El acumulado es de la sesión, y la VENTANA no viaja dentro.** `consumoDeLosActos` se queda
  con la ventana del último `fin` que la traiga —su contrato, y en la piel hace falta—, así que
  meter su resultado tal cual en el índice escribiría en disco un «cuánto ocupa el historial
  AHORA» de un turno de anteayer. `acumularTotales` es la función que la quita, y existe con
  nombre propio por eso: un acumulado estampado solo lleva los dos pares de cifras. El dato no
  se pierde —sigue en cada `fin` del `.jsonl`, que es donde se mide— y **hoy no lo pinta nadie
  desde ahí**, que es justo por lo que el defecto no se notaba: una cifra muerta en disco es una
  cifra que alguien leerá mañana creyendo que es la de hoy. Lo cazó la siembra, no el estampado.
- **Se estampa en `anotarActo`, que es el único sitio por el que pasan TODOS los actos.** El
  índice se relee-reescribe entero en cada anotación, así que el acumulado se suma ahí, en el
  mismo viaje: sin una escritura de más y sin un segundo lector del índice que pudiera divergir
  del primero (`leerIndiceOAbortar` es el único que lo lee para escribir).
- **Y cuando la entrada todavía NO trae acumulado, NO se suma el delta.** Es la regla que más
  importa y la que parece un detalle: sumar el delta dejaría en el índice el gasto del ÚLTIMO
  turno con la FORMA de un total de la sesión —una sesión de 11k que hace un turno de 3k quedaría
  en 3k—, y nadie lo notaría, porque el número es plausible y la fila no dice de qué habla. Ahí
  se relee el `.jsonl` y se suma la sesión ENTERA. Es como mucho una lectura por sesión: en
  cuanto el acumulado consta, esto vuelve a ser una suma de dos objetos. Se relee con
  `reabrirSesion` y no con un lector propio porque es el ÚNICO que sabe leer un `.jsonl`
  saltando la línea trunca; un segundo lector sería un segundo sitio donde esa tolerancia puede
  dejar de estar.
- **Un cero no se estampa.** Un `fin` sin consumo —sesión anterior a que se midiera, o una piel
  que no mide— deja la entrada como estaba, y un `consumoDeLosActos` que contesta «no consta»
  tampoco escribe nada. Ausente es «no consta» también aquí: escribir ceros convertiría «no sé
  lo que gastó» en «no gastó nada», que es la cifra inventada de siempre.
- **La siembra es de PRESENTACIÓN y es MONOTÓNICA** (`sembrarConsumosPendientes`). Sin ella, el
  acumulado nace VACÍO en todas las sesiones anteriores: el índice solo aprende el gasto de una
  sesión cuando alguien la usa, así que las que nadie vuelve a abrir se quedarían sin cifra para
  siempre — y la barra, que existe para mirarlas, sería justo lo que no las ve. Rellena solo las
  entradas que NO traen acumulado (correrla dos veces devuelve 0 la segunda), va de las MÁS
  RECIENTES hacia atrás porque el tope de número tiene que elegir y lo que se mira es lo último,
  **no da de alta la entrada que falte** —un `.jsonl` sin entrada es una sesión que alguien
  borró, y resucitarla la devolvería a la barra apuntando a un fichero que ya no está—, y escribe
  UNA vez al final. Sus dos topes son (`SESIONES_A_SEMBRAR`, 12) y (`TOPE_DE_BYTES_DE_SIEMBRA`,
  4 MB): es SÍNCRONA y corre en el bucle de eventos, así que un `.jsonl` enorme congelaría el
  servidor mientras lo lee.
- **Y su disparo está donde tiene que estar: ANTES de leer la lista, y una vez por raíz y
  proceso** (`arranque.ts#sesionesDelProyecto`). Antes, porque la siembra escribe el índice y
  `sesionesDe` lo relee, así que el anuncio que la dispara es el que ya enseña las cifras —no
  hace falta ningún reanuncio—. Una vez por raíz, porque el alta se anuncia DOS veces por turno
  y recorre todos los proyectos: sin la marca, cada anuncio releería el índice de cada proyecto y
  mediría sus `.jsonl`, dos veces por turno y multiplicado por el número de proyectos. Y su fallo
  se TRAGA: sembrar es presentación, y lo peor que puede pasar es que una sesión vieja no enseñe
  cifra hasta su próximo turno —donde enseñará la buena, porque `anotarConsumoDeActo` relee
  cuando no hay acumulado—; blankear la barra entera por un índice roto sería convertir un adorno
  que falta en una lista que no está.
- **La fila enseña UN número, y el par se queda en el `title`.** La fila de la barra no tiene el
  sitio de la línea que cierra un turno: compite con el nombre de la sesión, que es lo ÚNICO
  elástico de una barra cuyo ancho elige el usuario. Y la cifra que se compara de un vistazo
  entre sesiones es el total —un par no se compara, se lee—, así que ahí va la suma con una **Σ**
  delante: `98,2k` pelado al lado de una fecha se lee como otra fecha, y `↑`/`↓` dirían que es UNA
  de las dos mitades. El desglose por cuenta va en el `title`, y el `aria-label` dice la frase
  entera («Esta sesión: N tokens en total…») porque el `title` no se anuncia de forma fiable. La
  CACHÉ se calla en la fila por lo mismo que el par: en el turno son unos 60 px y aquí son los
  que le faltan al título. El ámbito entra como unión CERRADA (`ambito?: "turno" | "sesion"`) y no
  como texto libre, porque un prop de texto libre es como nacen dos dialectos de la misma frase.
- **Y la cifra se RETIRA cuando la fila es estrecha, con una consulta de CONTENEDOR**
  (`Barra.module.css`, `.cifraDeLaFicha` dentro de `.cuerpoDeFila`). No es un `@media`: el ancho
  de la barra lo pone JS —el tirador de `Maqueta.tsx`—, así que una ventana ancha con la barra
  arrastrada a tope deja la fila estrecha sin que el viewport lo sepa. El criterio es que **el
  título no baje de lo que YA tiene a la barra más estrecha**, y eso está medido: con la barra a
  220 —su mínimo— la fila mide 155 y el título 55, así que el suelo son 55. La cifra cuesta 46 px
  de título (40 de cifra más los 6 de hueco), luego el título llega justo a 55 cuando la fila mide
  200,5: de ahí el umbral en 200. **El cruce se comprobó arrastrando el tirador, no restando**:
  fila 200 → escondida (título 100,3), fila 201 → pintada (título 55,5). Y con el par de antes
  —`↑77,7k ↓20,5k`, 86 px— el mismo criterio daba 260, o sea que la cifra NO salía a la barra por
  omisión (fila 255, barra 320) y había que arrastrarla a 326 para verla; con una sola cifra, a la
  omisión el título pierde esos 46 px y conserva 109,5, contra los 103 que mide el rótulo más
  largo que escribe la aplicación («Tarea de fondo»). El sello de la fecha no se mueve cuando la
  cifra aparece —medido a 220 y a 320, su borde derecho cae en `barra − 45` en todas las filas y
  en los dos casos—, y por eso la cifra va DELANTE del sello y no detrás: la columna que se lee de
  un vistazo, la que ordena la lista, se queda quieta.
- **Trampa, y es del repo: la hoja que consulta un contenedor tiene que DECLARARLO en el mismo
  fichero** (`Barra.test.tsx` lo exige recorriendo los `.module.css`). Una consulta sin un
  ancestro con `container-type` no dispara JAMÁS y no avisa: la regla se queda escrita y muerta,
  que es el patrón de fallo de esta arquitectura en versión de CSS —una composición que no está
  montada con todo en verde—, y jsdom no lo puede ver porque no hace layout ni cascada. De ahí que
  la consulta y su contenedor vivan en la misma hoja. Y como el nombre de un módulo CSS va
  HASHEADO, no se puede retirar desde un fichero el elemento de otro: cuando el retirado vive en
  otro componente se le pone un envoltorio con clase propia del módulo que consulta —`.gasto` en
  el compositor es exactamente eso—. Declarar el contenedor en `.cuerpoDeFila` es seguro porque su
  tamaño no depende de lo que lleve dentro: `flex: 1` ya lo fija.
- **Y la muestra con la que se juzgó era FINA, lo que conviene saber para la próxima.** De las
  seis sesiones de AppDemo solo una tiene cifra, y su título («Hola») mide 30 px; la fila que de
  verdad aprieta —«Tarea de fondo»— no tenía datos, porque sus `.jsonl` son anteriores al campo
  `consumo`. O sea que el ancho se juzgó con una fila que no pincha, y por eso el umbral se
  comprobó además arrastrando el tirador y midiendo los dos lados del cruce, en vez de fiarse de
  la fila que había.

**Cada turno COMMITEA lo que dejó** (`agent/sesiones/gitSync.ts#commitDeTurno`, la opción
`commitearTurno` del vestíbulo). Hasta ahora no se commiteaba NUNCA: `prepararRepo` hace un
commit de baseline al descargar y ahí se acababa. De eso colgaban dos cosas, y la segunda es
la que apretaba: las sesiones se mezclaban sin que nada pudiera atribuir ni revertir lo de
cada una, y **`/sync subir` era inalcanzable** — su guarda exige árbol limpio, así que después
de cualquier trabajo del agente se negaba para siempre (medido: AppDemo, con 4 ficheros
sueltos, no podía subir). Siete reglas:
- **Con el índice DE VERDAD, no con el privado de `arbolDeAhora`.** Aquél existe para una foto
  de solo lectura que no puede tocar el staging del usuario; esto es lo contrario, y si el
  índice no queda igualado con el commit, `git status` enseña reversiones fantasma y
  `trabajoSinCommitear` reporta suciedad que no existe. Hay test de que el árbol queda LIMPIO.
- **Sin cambios no se commitea**, y no es higiene: `git commit` con el índice vacío sale con
  error, así que el camino más común —un turno de conversación— sería un fallo tragado.
- **La identidad es NUESTRA y va por `-c`**, como la del baseline: el commit lo hizo el
  harness, no la persona, y así no se le escribe nada al `config` de su repo.
- **Se ESPERA, al contrario que la ref de la foto.** Medido sobre una copia del proyecto real
  (165 MB, 41 colecciones): `add -A` + `commit` tardan **74 ms**, y quien llama acaba de
  esperar un turno entero. Y hace falta esperarlo: la puerta de entrega del corredor corre en
  cuanto el turno devuelve y le pregunta a git.
- **Va en el `finally` del turno y envuelto entero**: una excepción ahí se llevaría el cierre
  por delante —el compositor apagado para siempre—. Un fallo se DICE; que no haya nada que
  commitear, que no haya repo o que no sea del workspace, no, porque son el caso normal.
- **DÓNDE se commitea lo decide el cableado, no el vestíbulo** (`dentroDelWorkspace`, puro y
  con test): solo en la copia que creó xonecode. En la carpeta que abrió una persona —offline,
  o `./bin/xonecode` dentro de su repo— un commit por turno sería ensuciarle el historial, así
  que ahí lo único que hay es el aviso de árbol sucio al abrir.
- **El mensaje NO dice «lo escribió el agente»**: lleva el título de la sesión y el id de la
  tarea cuando la escribió una, pero el commit barre todo lo que haya cambiado, incluido lo
  que tocara una persona a mano en esa carpeta. La misma honestidad que separa
  `Tarea.autorizadas` de «aplicados».
Y **la subida sigue siendo controlada**: esto no la dispara. El único camino es `/sync subir`
con `politicaInteractiva` y el plan delante, y `main.ts` es fail-closed si alguien llamara sin
política. Lo que cambia es que la guarda de árbol limpio deja de hacer de freno de rebote —
nunca fue una autorización, y la política sigue siendo la única puerta.

**Y la basura del SO va a `info/exclude`, NUNCA a `.gitignore`** (`asegurarExclusiones`, que
`prepararRepo` y `commitDeTurno` comparten). `.gitignore` es un fichero del PROYECTO: subiría
él mismo. La regla entró midiendo: sin ella el `add -A` del commit se tragaba el `.DS_Store`,
y como el plan de subida son los ficheros CAMBIADOS, ese fichero acababa en la app XOne del
cliente **como binario** — comprobado en `planDeSubida`: `esRutaProhibida` solo cubre
`.xonecode`, `.git` y `.env`, y `extensionDe(".DS_Store")` devuelve `""` (el punto está en la
posición 0), así que no es texto y cae en la rama de base64. Se aplica también al COMMITEAR y
no solo al preparar el repo, porque un proyecto bajado con la versión anterior no volvería a
pasar por `prepararRepo` hasta el siguiente `/sync bajar`. Y de paso arregla la otra mitad:
hasta ahora un `.DS_Store` suelto bastaba para que la guarda de árbol limpio se negara a subir.

**Y el proyecto DICE con qué te encuentras: lo que ya había sin commitear al abrir**
(`agent/sesiones/gitSync.ts#trabajoSinCommitear`, `alta.trabajoAlAbrir`). Todas las sesiones de un
proyecto escriben en la MISMA copia local, y desde que hay tareas de fondo que escriben solas
eso pasó de molesto a destructivo: «gana la persona» (una tarea no arranca con la consola
humana abierta) es una mitigación, no aislamiento. Esto es lo barato que faltaba — decirlo en
vez de dejar que dos sesiones se pisen calladas. Cinco reglas:
- **La medida es del instante de ABRIR**, en el mismo sitio y por el mismo motivo que la foto
  del antes de `sesionGit.ts`: medida más tarde incluiría lo que esta sesión acaba de
  escribir. Con eso el aviso es honesto POR CONSTRUCCIÓN —nada de lo que escriba esta sesión
  puede aparecer en él— y por eso está cacheada y no se vuelve a medir en los reanuncios del
  alta, que son dos por turno. La frase va en PASADO: un «hay cambios» sería falso en cuanto
  alguien commitee, con el aviso todavía puesto.
- **Avisa, no FRENA.** Una tarea que escribe deja el árbol sucio por definición —es la razón de
  que `revisable` no sea «árbol limpio»—, así que una guarda de árbol limpio delante de la cola
  la atascaría después de la primera tarea. El precio se dice, no se cobra.
- **`sinCommitear` y `trabajoSinCommitear` son la MISMA medida con dos políticas ante lo que no
  se puede mirar, y las dos son correctas.** La vieja sostiene la guarda de `/sync`: sin repo
  no hay nada que recuperar tras sobrescribir, así que declara la carpeta sucia y bloquea, y un
  git roto LANZA para que `/sync` pare. La nueva sostiene un aviso, y un aviso que no se puede
  sostener no se da: sin repo o con git roto responde `sin-git` y no se pinta nada. La
  diferencia no es cosmética — **todo proyecto OFFLINE es una carpeta sin git** (`prepararRepo`
  solo corre al descargar), así que la política de la otra pondría un aviso en cada apertura de
  cada proyecto offline. Por eso el `git status` está extraído en una sola función privada: una
  medida, dos políticas, y ningún segundo criterio de «limpio».
- **La basura del SO se quita también DENTRO de un repo, y eso salió de MEDIRLO.** El filtro
  de `.DS_Store`/`Thumbs.db`/`desktop.ini` solo cubría la rama sin repo; medido contra los
  proyectos reales, uno tenía exactamente UN fichero sin commitear y era un `.DS_Store`, o sea
  que el aviso habría saltado entero para decir que alguien abrió la carpeta en el Finder
  (`prepararRepo` solo excluye `.xonecode/`). Con eso vino la única diferencia de FORMA entre
  las dos preguntas: el aviso pide `--untracked-files=all` y la guarda no. Git colapsa por
  omisión una carpeta sin rastrear en una línea («doc/»), y así ni se puede reconocer que
  dentro solo hay basura ni se le dice a nadie qué fichero es — «doc/» dice mucho menos que
  «doc/NOTA-DEMO.md». El volumen lo sujetan el tope y el total.
- **Se callan las tres respuestas que no son un aviso** —limpio, sin git, y no se pudo medir— y
  el campo viaja solo cuando hay algo. Y viaja la LISTA, no un contador: quien lo lee tiene que
  poder reconocer si eso es suyo, de otra sesión o de una tarea. Los nombres van acotados
  (`FICHEROS_DEL_AVISO`) porque el alta se reemite en los dos flancos de cada turno, con el
  `total` entero al lado — que es lo que impide leer los que caben como si fueran todos.
- **Se mide por las DOS puertas**, porque la medida vive en el cuerpo compartido de
  `abrirProyecto` y `abrirParaTarea`. Hoy solo la lee el chat: por la puerta de las tareas el
  dato está y no lo pinta nadie todavía. Y el cableado de `arranque.ts` comparte el hueco
  declarado de `marcarSesion` — `vestibuloReal` lee el `settings.json` real del usuario, así que
  ningún test lo construye: lo que está probado es que el vestíbulo usa la medida por las dos
  puertas, no que ahí siga puesta.

**Y un aviso que dice «no FRENA» no puede ser lo que frena: abrir una sesión NO espera a la
medida de git** (`MS_DE_TRABAJO_AL_ABRIR`, 2 s). Medido en la pantalla del usuario, y es la
prueba de que la regla de arriba estaba escrita y no montada: el `finally` que apaga el
indicador «abriendo…» esperaba a `anunciarAlta()`, y ésta esperaba **SIN PLAZO** a
`trabajoAlAbrir` — detrás del cual hay un `git status --untracked-files=all` sobre la copia de
trabajo del usuario. Con ese git sin volver, la barra se quedaba en «abriendo…» para siempre y
la consola no dejaba abrir nada más. Cuatro decisiones:
- **Lo que se acota es la ESPERA, no el trabajo.** La promesa sigue viva y su valor sale en el
  siguiente anuncio, que llega en los dos flancos de cada turno; matar la medida habría dejado
  sin aviso a quien sí lo merecía.
- **Y no se pierde nada por no esperarla**, porque `ausente` YA significaba «no consta» en las
  cuatro capas (disco, cable, store, componente): el indicador se apaga con el dato de camino en
  vez de con el dato en la mano, y la ventana lo pinta cuando llega, igual que si hubiera
  tardado un segundo más.
- **Hay test, y muere con el mutante**: sin el plazo el test se cuelga exactamente igual que se
  colgaba la pantalla — que es la forma correcta de probar un plazo, porque un test que pasara
  con y sin él no estaría probando nada.
- **El plazo es de 2 s y no de 0**: un `git status` normal contesta en decenas de milisegundos, y
  renunciar a esperarlo cuando va rápido sería cambiar un cuelgue por un parpadeo.

**El turno en vuelo tiene cronómetro, y sin cable la interfaz se apaga.** El pie decía el
tiempo del turno ANTERIOR mientras corría el actual (116 s con «10,7 s» delante), y sin
servidor lo único que cambiaba era un «sin conexión» pequeño con los 18 «Nueva sesión»
pulsables debajo. `useCronometro` (`apps/web/src/cronometro.ts`) cuenta desde el flanco de
subida y lo pintan el pie y el «Trabajando…» del pulso; `conectado` llega a `Barra` y
`Escritorio` y apaga lo que manda algo al servidor (Ajustes se queda: la apariencia es de
este navegador), el punto del entorno deja de estar verde y el aviso de conexión se pinta
también en el escritorio. La miga lleva además el proyecto delante de la sesión.

**El resaltado de código lo hace shiki, y `streaming` lo APAGA.** `MarkdownText` pasa
`lang: undefined` cuando está en ese modo (medido en su `renderCode`): correcto a medio
llegar —una valla sin cerrar no se puede colorear— y desastroso después, porque el último
mensaje se quedaba en gris para siempre. Por eso `streaming` solo va puesto mientras el
servidor dice que hay turno en vuelo (`clase: "turno"`), y no «en el último acto de
asistente» a secas. La paleta ya estaba: `estilos/shiki.css` trae los `--shiki-token-*` en
claro y en oscuro.

**Los botones de copiar usan el icono del harness** (`IconCopyOutline16` →
`IconCheckOutline16`, `BotonDeCopiar.tsx`), la misma pareja que su `JsonTree` usa para esto.
El de las vallas de código lo pinta `MarkdownText` con la PALABRA «Copiar» y sin icono —su
`CodeBlock` mete la etiqueta como hijo del botón, y desde fuera no se puede sustituir un
hijo—, así que se le añade el icono por CSS con el MISMO trazado, guardado como máscara en
`marca.css` (copiado literal de su `lib/index.js`, no un dibujo parecido). La palabra se
queda pequeña al lado porque es lo ÚNICO que distingue «Copiar» de «Copiado»: ese botón no
expone su estado en ningún atributo. Y los dos llevan BORDE: el del paquete llega plano
—su CSS Module es un stub vacío— y un control que no se ve como control no invita a pulsarlo.
**Esas reglas viven en `apps/web/estilos/markdown.css`, no en la hoja de ningún componente**:
nacieron acotadas bajo `.asistente` en `Chat.module.css` y, en cuanto el visor de Ficheros
montó el mismo `CodeBlock`, ese se quedó con el botón crudo del paquete — el mismo gesto con
dos aspectos según la pestaña. La hoja parte el alcance en dos a propósito: **el botón va sin
envoltura**, porque es el mismo control donde sea que haya una valla, y **el cuerpo del
documento va bajo la clase global `md-cuerpo`**, que se PIDE (el globo del asistente y el
`.md` renderizado de Ficheros la llevan; el visor de código no, porque ahí la valla es la
página y no debe salir metida en una caja con fondo).

**La caja del compositor se anima mientras el agente trabaja** (borde vivo, `data-trabajando`
en `Compositor.module.css`). Es la única señal en los tramos donde el modelo no habla —piensa,
llama tools, espera al verificador— y pueden ser minutos: la caja apagada y quieta se lee como
«se ha colgado». El giro necesita `@property` para poder interpolar el `<angle>` del
`conic-gradient`; donde no exista, el marco se pinta igual pero quieto — sigue habiendo señal.
Y con `prefers-reduced-motion` el giro se apaga a propósito y se deja el acento fijo: quien
pidió que no hubiera movimiento no puede recibir un borde girando, pero tampoco quedarse sin
saber que hay algo en marcha.

**Ese borde NO lleva baño azul por dentro, y el que se coló era un pseudo-elemento.**
Medido en pantalla: al enviar, la caja entera se teñía de azul en vez de quedarse un resplandor
por fuera. El resplandor era un `::before` con `inset: -3px`, color cian y `blur(10px)` — la
forma obvia, y equivocada por una razón que no se ve leyendo el CSS: **un pseudo-elemento es un
HIJO**, así que su relleno se pinta ENCIMA del fondo del padre. El interior de la tarjeta
(`bg-layer-1`, blanco en el tema claro) quedaba por debajo del tinte. El arreglo es una máscara
en XOR —dos gradientes opacos, uno acotado al `content-box` y otro al `border-box`— sobre una
caja crecida a `-6px` con `padding: 6px`: lo que sobrevive es el anillo que cae de `-6px` a
`0`, o sea **solo lo que está fuera del borde**. Cero tinte dentro, el mismo resplandor fuera,
y como `filter` se aplica ANTES que `mask`, el desenfoque sigue suavizando hacia afuera y el
corte cae justo sobre el marco, donde el ojo ya tiene una línea que mirar. Regla para esta
hoja: un pseudo-elemento nunca es «el fondo de detrás», siempre es un hijo; y lo que tenga que
quedar fuera del borde se recorta con máscara, no se confía al orden de pintado.

**El turno en vuelo lo DICE el servidor** (`clase: "turno"`, emitido por el envoltorio del
ejecutor en `vestibulo.ts`, que es el único sitio que sabe cuándo empieza y cuándo acaba).
Con eso el compositor se apaga mientras el agente trabaja —mandar una segunda petición la
dejaba en la cola del lazo sin decirlo, y el usuario veía su texto desaparecer del campo y no
pasar nada durante minutos— y la flecha de enviar se convierte en un botón de PARAR, en la
misma ranura. Deducirlo de los actos («¿llegó un `fin` después del último `usuario`?»)
fallaría justo cuando importa: un turno que revienta no siempre deja `fin`, y el compositor
se quedaría apagado para siempre. El aviso de fin va en un `finally` por lo mismo. Parar es
`clase: "cancelar"` → `SesionReal.cancelar()`, que aborta el `stream` del grafo y **deja la
sesión viva**: es parar esto, no cerrar la conversación.

**El chat sigue lo que llega, salvo que hayas subido a leer**
(`apps/web/src/pegadoAbajo.ts`). Las dos mitades importan: sin la primera el texto crecía
fuera de la vista; con un «baja siempre» no se puede leer nada mientras el agente escribe,
porque el siguiente parcial te devuelve al fondo. El umbral es de 48 px y no cero, porque el
navegador redondea las alturas a subpíxeles y un scroller que ESTÁ abajo puede dar 0.5 y
desengancharse solo.

**El trabajo del agente se ve en el CHAT, no solo en la Trayectoria.** El chat pintaba
únicamente los globos de usuario y asistente y todo lo demás vivía en la otra pestaña:
medido en pantalla, se escribía una petición y no pasaba nada durante minutos con el agente
trabajando a la vista de nadie. Ahora `razonamiento`, `herramientas` y `fase` van
intercalados en la conversación, en gris y en una línea — paisaje, no conversación. **Los
actos de `sistema` TAMBIÉN se ven, y eso cambió**: estaban solo en Trazas, y por ese canal
pasan las dos cosas que más falta hacen delante — la respuesta a un comando que el usuario
acaba de teclear (`/aprobacion` contestaba a una pestaña de depuración) y los avisos de
honestidad (`core/bitacora.ts`), que en la pestaña de depurar el harness son exactamente el
aviso que nadie lee. Van FUERA del tramo plegable: el pulso se dobla al terminar el turno y
esto no puede irse con él. `fin` sí sigue siendo solo de Trazas: es el cierre con su
duración, un dato del registro.

**Y lo que hace un agente EXTERNO se ve MIENTRAS lo hace, no solo al terminar**
(`core/entrelazar.ts`, `core/notify.ts#frase`, `agent/turno/resumenDeTool.ts`). Dos huecos medidos
mirando la pantalla, y los dos son el mismo problema: el hijo corre en OTRO proceso, así que ni
una de sus tools cruza el stream del grafo.
- **La línea de una delegación dice a QUIÉN.** Decía «⚙ task» a secas —medido en la pantalla del
  usuario—, y con un motor externo eso deja la interfaz MUDA: entre esa línea y su respuesta hay
  minutos sin nada que mirar, que es exactamente como se lee un cuelgue. Sale el NOMBRE (de
  `task` a `subagent_type`, en la lista blanca de `resumenDeTool.ts`, con icono y verbo en
  `core/notify.ts`) y **nunca la `description`**, que es el encargo entero y puede llevar
  contenido del proyecto. Y la rama genérica de `frase()` dejó de TIRAR el detalle: no filtra
  nada nuevo, porque un `detalle` solo existe si la lista blanca lo eligió a mano.
- **Lo que el hijo va HACIENDO se intercala mientras corre.** El punto de observación es el hook
  `PreToolUse` —por `canUseTool` NO pasan las lecturas, porque un `allow` del hook es
  pre-aprobación—, y de ahí sale un evento `tool` NORMAL: nombre traducido al canónico
  (`Read` → `read_file`) y ruta VIRTUAL, así que el colapsador lo agrupa con los demás y ninguna
  piel se entera de que hay dos orígenes. `entrelazar` es la misma forma que `conVerificacion`
  —un generador que envuelve a `aEventos`— salvo que intercala MIENTRAS en vez de añadir al
  final; su trampa es que `it.next()` se pide UNA vez y se guarda, porque dos `next()` vivos se
  comen un valor (hay test, y muere con la mutación). **Solo se cuenta lo que va a ocurrir**: una
  tool denegada no se anuncia, porque la línea diría que el hijo hizo algo que no hizo.

**El razonamiento del modelo es su propio evento y su propio acto** (`razonamiento`), nunca
parte de la respuesta. Gemini lo manda como bloques `{type:"thinking"}` dentro de `content`
(`@langchain/google-genai`), y otros adaptadores como `{text, thought:true}`: las dos formas
las extrae `puente.ts#razonamientoDe`, y **`textoDe` las excluye** — mirar solo
`typeof text === "string"` metía el pensamiento dentro de la frase. `Piel.razonamiento` es
OPCIONAL y solo la web la implementa, así que stdio y la TUI no cambian y la salida por una
tubería sigue siendo byte-idéntica. En el chat va plegado en un `<details>` nativo: puede ser
larguísimo, no es la respuesta, y plegarlo no cuesta ni una línea de JavaScript.

**El texto del asistente se ENSEÑA mientras llega** (`pielWeb.ts#token`). Antes se
acumulaba entero en el colchón y no salía hasta `cerrarLinea`: la respuesta aparecía de
golpe tras segundos de pantalla quieta, con el modelo escribiendo y nadie viéndolo. Ahora el
PRIMER token ya empuja un acto de asistente y los siguientes lo SUSTITUYEN —por el mismo
camino que ya usaba el cierre de una racha de tools: si la lista no crece, el transporte
manda `sustitucion`—. No se emite por token, porque cada emisión manda el acto entero y eso
sería cuadrático en bytes; se emite como mucho cada `MS_ENTRE_PARCIALES` (80 ms, el orden de
un cuadro largo: por debajo nadie lo distingue, por encima se ve a tirones), y `cerrarLinea`
manda siempre el último trozo aunque no haya pasado el plazo — es el que completa la frase.
El reloj entra por parámetro para que el ritmo no dependa de lo que tarde la máquina que
corre los tests.

**El cable habla con TODOS los clientes, no con el último.** Había UNA ranura de sumidero
(`transporte.ts`), así que abrir una segunda pestaña dejaba muda a la primera sin decírselo:
su SSE seguía abierto y su interfaz congelada en el último estado que le llegó. Medido con
una pestaña local y otra por un túnel — el menú de modelos se quedaba en «consultando…» para
siempre porque la respuesta se la llevaba la otra. Ahora es un `Set` y `emitir` escribe a
todos. Tres consecuencias que hay que respetar: la ráfaga de bienvenida (reemisión,
comandos, modelos, saludo) va SOLO al recién llegado —repetirle el transcript a quien ya lo
tiene le duplicaría la conversación—, `desconectar(sumidero)` quita a ESE cliente y la
consola solo se da por sola cuando se va el ÚLTIMO (cortar a la primera baja rechazaría la
aprobación que otra pestaña tiene delante), y la carrera del `close` que llegaba tarde
desaparece sola: quitar el suyo de un conjunto es exacto.

**El vestíbulo** (`web/servidor/vestibulo.ts`) es lo que hay ANTES de que exista ninguna raíz:
`correrConsola` es un lazo sobre UNA raíz, y la jerarquía entorno → proyecto → sesión necesita
un sitio donde vivir mientras no hay proyecto abierto. De ahí dos consolas, la del vestíbulo y
la del proyecto. **El cable se muda de una a otra al abrir proyecto**, y no es cosmético:
`consolaWeb.eof()` es `!transporte.conectado()`, así que una consola de proyecto sin cliente
enganchado rechaza TODA aprobación y contesta cadena vacía a todo `preguntar`, sin decir por
qué. Al cerrarse el SSE se desconecta la consola que se ADJUNTÓ, no la que sea la actual: entre
medias puede haberse abierto un proyecto.

**Y ya hay VARIAS consolas de persona vivas a la vez: cambiar de sesión no mata el turno que
estaba corriendo** (`abiertas`/`enFoco` en `vestibulo.ts`, `alta.proyectos[].trabajando`).
Era UNA variable, así que mirar otra sesión —o otro proyecto— cerraba la consola anterior y con
ella el turno del agente, sin decir nada. Ahora es un mapa por RAÍZ y un foco. Doce reglas:
- **La clave es la RAÍZ, y eso es la mitad del diseño.** Nunca hay dos consolas sobre la misma
  copia de trabajo, así que dos conversaciones no pueden escribirse los mismos ficheros ni
  pisarse el hilo del checkpointer — el mismo motivo por el que una tarea no arranca donde hay
  una persona. Lo que se gana es lo otro: dos PROYECTOS distintos pueden trabajar a la vez.
- **Y por eso abrir otra sesión del MISMO proyecto con la de ahí trabajando se DECLINA**, con
  el motivo delante (`motivoDeProyectoTrabajando`). Cerrar la que trabaja para abrir la otra
  sería la interrupción que esto viene a quitar; dejar las dos sería la carrera que la clave
  por raíz impide. Con la de ese proyecto OCIOSA se cierra y se abre, que es lo de siempre. Y
  volver a la MISMA sesión que sigue trabajando devuelve la MISMA consola: es justo lo que uno
  hace para ver cómo va, y reabrirla la habría matado.
- **Pero abrir el PROYECTO que trabaja —sin nombrar sesión— es VOLVER a lo que está pasando**,
  no pedir una conversación nueva ni llevarse un rechazo. Es la única forma de llegar ahí:
  el id de una sesión nace al volcar su primer acto, así que la conversación que acabas de
  arrancar no tiene fila en la barra hasta que su turno acabe. Medido en la pantalla del
  usuario, y es el fallo que este párrafo tenía al escribirse: arrancó una sesión, se fue,
  pulsó el nombre del proyecto para ver qué hacía, y se llevó el mismo párrafo de rechazo
  CINCO veces seguidas — el botón muerto de siempre y sin ninguna otra puerta detrás. La
  distinción con «nueva sesión» la hace el cliente, no el servidor: el «+» se apaga mientras
  el proyecto trabaja (una segunda conversación sobre la misma copia sigue siendo imposible) y
  el NOMBRE se queda vivo, con el «+» diciendo en su `title` qué se puede hacer en su lugar.
- **Y un aviso no se repite si es lo último que ya se dijo** (`decirEnLaConversacion`). Un
  control que rechaza invita a insistir, y cinco clics dejaban cinco copias del mismo párrafo
  en el chat: una pared de texto repetido dice menos que una línea. Se compara con el ÚLTIMO
  acto y nada más — dos avisos distintos, o el mismo más tarde, sí se dicen.
- **`proyectoAbierto()` sigue siendo la del FOCO** —de ella cuelgan las veintitantas lecturas
  de `arranque.ts`, que hablan todas de «la sesión que se está mirando»— y lo nuevo es
  `proyectosAbiertos()`. **Ahí está el único fallo ABIERTO que este cambio podía dejar**: la
  guarda de «gana la persona» (`bloqueados`) miraba la del foco, así que una consola humana en
  segundo plano habría dejado su proyecto por libre y una tarea habría escrito en la misma
  copia. El síntoma no es un error: es un diff corrompido que nadie atribuye. Por eso su test
  se escribió PRIMERO y en rojo.
- **Una consola de segundo plano vive solo mientras su turno está en vuelo.** Al terminar se
  cierra ella (`cerrarSiSobra`), y las OCIOSAS se cierran al mudarse el foco
  (`cerrarLasOciosasSalvo`). Sin eso, visitar diez proyectos dejaría diez `correrConsola`
  vivos para siempre. No se pierde nada: el hilo lo reanuda el checkpointer al reabrir la
  sesión, y con las ociosas cerradas antes de construir la siguiente se conserva el orden que
  ya estaba probado (el lazo anterior TERMINA antes de que arranque el otro).
- **Mudarse de consola SUELTA los sumideros; no la desconecta** (`Transporte.soltar`, usado por
  `arranque.ts#adjuntar`). `desconectar` afirma «se ha ido el humano»: despierta con cadena
  vacía a todo el que esperaba y da por RECHAZADA la aprobación que hubiera delante. Eso es
  cierto cuando se cae el SSE y falso cuando alguien cambia de sesión, así que con el
  `desconectar` de antes la escritura de un turno de segundo plano se habría rechazado sola por
  mirar otra cosa. Con `soltar`, `conectado()` sigue diciendo que hay alguien y lo que se emita
  no llega a ningún socket — que es la otra mitad: los actos de un turno de fondo no pueden
  aparecer en la conversación que se está mirando. Al irse el ÚLTIMO cliente sí se desconectan
  todas, incluidas las de fondo: entonces no hay nadie a quien preguntar.
- **Y la aprobación en vuelo se REEMITE al volver.** Ese mensaje es el único que no está en la
  traza —lleva contenido de fichero—, así que la reemisión de `adjuntar` no lo alcanzaba:
  `mensajesDeAprobacion()` existía sin un solo llamador, y sin él al volver se veía el
  compositor apagado delante de un turno parado esperando una decisión que no había forma de
  dar.
- **El turno en vuelo se DERIVA de la consola en foco, ya no se cachea.** Era una variable que
  los flancos actualizaban, y se queda vieja en el caso que más importa: volver a una sesión que
  trabaja no es un flanco —el turno no empezó ni acabó—, así que `adjuntar` habría encendido el
  compositor delante de un agente escribiendo.
- **La barra DICE qué sesión trabaja**, y lo pide el usuario con esas palabras: es lo único que
  distingue «lo dejé a medias y sigue» de «lo dejé a medias y se paró». Va en el ALTA porque el
  alta se reemite en los dos flancos de CUALQUIERA de las consolas vivas —para eso se ensanchó
  el disparador de `alCambiarTurno`, cuyo booleano sigue hablando solo de la del foco—, con
  PALABRAS y en el hueco de la fecha, que es el dato a punto de cambiar.
- **La sesión entra en el índice con el MENSAJE, no cuando el asistente contesta**
  (`ConsolaDeProyecto.recibir`). La entrada la creaba `volcar()`, que corre en la frontera del
  turno: así que la conversación no aparecía en la barra hasta que el turno acababa —minutos—
  y hasta entonces no había fila que marcar, ni que abrir, ni que enseñar trabajando. Lo dijo
  el usuario mirando la pantalla. No contradice la pereza que esa entrada tenía —existía para
  que «alguien mira un proyecto y se va sin decir nada» no dejara una sesión vacía, y mandar
  un mensaje es decir algo—: abrir sigue sin escribir nada. Tres detalles: se vuelca **solo
  con el turno parado** (a mitad de turno el último acto de la piel todavía muta y el `.jsonl`
  solo sabe anexar; y no hace falta, porque la entrada la creó la prosa que arrancó ese turno),
  el acto de usuario **no muta nunca**, que es lo que hace seguro volcarlo suelto, y el alta se
  reanuncia también tras una prosa porque un `/comando` no corre turno y no tendría flanco que
  lo dijera.
- **Y son DOS marcas, pero NO se dicen a la vez**: `sesiones[].trabajando` es la que importa
  —es la fila que se abre— y `proyectos[].trabajando` solo sale cuando ninguna fila de ese
  proyecto la lleva. Decirlo en los dos niveles era una duplicación, y el usuario la señaló.
  Lo que queda para el proyecto es lo que la fila NO puede decir: una sesión que todavía no
  está en el índice, o sea la de una TAREA de fondo antes de su primer volcado — las de
  persona entran ya con el mensaje. **Y desde que las listas se PLIEGAN hay un segundo caso
  que la fila no puede decir, y ese lo pone el CLIENTE**: plegada, la fila no existe. El
  servidor sigue mandando su marca con el mismo criterio de siempre —y cuando la manda se
  respeta tal cual llega—; el cliente añade la del proyecto cuya lista está cerrada. Con la
  lista abierta se dice UNA vez, y la dice la fila, que es la que se abre (el párrafo de la
  barra que se pliega, más abajo).
- **Y de esa marca cuelga que el rechazo no sea un botón muerto**: con el proyecto trabajando,
  las OTRAS sesiones de su lista y su «+» se apagan, con el motivo en el `title`. La guarda del
  servidor sigue estando —es quien manda si la lista del cliente llega vieja—, y cuando declina
  el motivo se escribe como acto de SISTEMA en la conversación que se está mirando: `alta.aviso`
  por este camino no lo pinta nadie (lo leen el wizard y la ventana de sesión nueva, y pulsar
  una fila de la barra no abre ninguna de las dos), así que el rechazo de una sesión de tarea en
  curso llevaba recorriendo ese camino mudo. Sin ninguna consola en foco no se pinta en ninguna
  parte, y eso queda declarado: para llegar ahí hay que haber borrado la sesión que se miraba
  mientras otro proyecto trabajaba.
Lo que queda DECLARADO y no arreglado: un `preguntar` o un `leerSecreto` de un turno de segundo
plano ahora ESPERA su plazo (diez minutos) en vez de contestar en el acto, y al vencer devuelve
cadena vacía — que 16 de sus 18 llamadores leen como «usa el valor por omisión». Es el mismo
agujero que ya declaraba `consolaDeTarea.ts`, pero ahora se puede alcanzar sin que el usuario
haya cerrado nada.

El alta del navegador son los mismos pasos del alta de terminal y con la misma regla —cada uno
solo aparece si falta lo que decide, calculado preguntándole al sistema y nunca a una marca de
«primer arranque»—, con dos precisiones: el paso de ENTORNO se pide siempre que quede el de
proyecto (abrir un proyecto exige saber de qué entorno sale, y eso `pasosPendientes` no lo
cubre), y el paso de CUENTA no lo pinta el wizard: lo conduce `vestibulo.pasoDeCuenta()`, o sea
`cli/wizardInicial.ts#asistenteDeModelo` sobre `seleccionar` y `leerSecreto`. Así la
clave de API sigue viajando por el ÚNICO mensaje del cable que la lleva y, de propina, el
asistente elige también el modelo: un paso de cuenta que solo guardara la credencial dejaría
`trabajo` en la omisión (Ollama local) con una clave de Anthropic recién escrita al lado.

**El asistente de cuenta es un LAZO, y en la web es una PUERTA.** Tres reglas, las tres en
`cli/wizardInicial.ts` y compartidas por las tres pieles: elegir proveedor se puede deshacer
(una opción «volver», `ID_VOLVER`, la ÚLTIMA de la lista de modelos); listar el catálogo ES la
validación de la conexión, así que un catálogo que lanza o que sale vacío devuelve al paso de
proveedor con el motivo en vez de dejar seguir con el modelo de omisión —y al proveedor que
falló se le vuelve a pedir la clave, porque `hayCredencial` ya diría que la hay—; y el motivo
viaja EN el selector (`SelectorDeConsola.aviso`) y no solo por `escribir`, porque durante el
alta la web no pinta el transcript y un aviso que solo fuera un acto de sistema sería mudo.
Lo que NO comparten es quién puede cancelar: `exigirEleccion` (solo la web) hace que cancelar
vuelva a preguntar mientras `consola.eof?.()` diga que hay alguien; en el terminal cancelar
sigue cancelando, y se sigue con Ollama local, que es una consola usable. `pasoDeCuenta()`
devuelve QUÉ pasó y `arranque.ts` solo marca el paso como hecho si no fue «cancelado» —que con
`exigirEleccion` solo ocurre cuando ya no queda nadie a quien preguntar—.

Y una trampa que llevaba escondida desde siempre: `guardarCredencial` (`agent/config/authEnDisco.ts`)
escribe TAMBIÉN en `process.env`, machacando lo que hubiera. `aplicarAuth` hace lo contrario en
el arranque a propósito (la variable manda sobre el fichero), pero aquí el fichero acaba de
cambiar por orden de un humano. Sin eso, `CatalogoModelos` —que lee la clave de `process.env`—
fallaba con «falta la credencial para …» justo después de que el asistente la escribiera: la
validación de la conexión no podía pasar con NINGÚN proveedor de pago en un arranque nuevo.

**Del entorno se teclea SOLO la URL, en un campo libre.** Ni desplegable de entornos ni campo
de nombre: un desplegable de «los dos oficiales y otro» obligaba a clasificar antes de escribir
—el on-premise se registraba por un camino distinto del de WebStudio siendo la misma
operación—, y por el cable viaja la URL con `id` y `nombre` VACÍOS. Los deduce
`vestibulo.ts#identidadDeEntorno`: si la URL es la de un oficial, su identidad (dos entradas
para el mismo servidor son dos carpetas de workspace y dos huecos de OAuth para la misma
cuenta); si no, del host. Del id se quita todo lo que no sea letra, cifra, punto o guion porque
acaba siendo una carpeta (`rutaDeWorkspace`, que lo pasa por `segmentoSeguro`) — los dos puntos
del puerto incluidos, que en Windows parten la ruta. Por eso `registrarEntorno` devuelve el
entorno REGISTRADO: quien manda la URL no sabe con qué id quedó, y `arranque.ts` necesita ese
exacto para pedir los proyectos.

El nombre bueno llega DESPUÉS, del propio servidor: `proyectosDe` es la primera conexión de
verdad (OAuth + `initialize`), y de ahí sale el `serverInfo` —`title` antes que `name`, que es
la convención de MCP—, saneado en `agent/cloudstudio/cloudstudioMcp.ts#servidorDeImplementacion`: sin
caracteres de control (un salto de línea en un nombre parte la línea de un log y disfraza lo que
venga detrás) y acotado a 60. `renombrarConElServidor` solo pisa un nombre DEDUCIDO —el que
sigue siendo igual al host—, nunca uno que puso una persona ni el de un oficial, y **el id no se
toca jamás**: es un segmento de ruta con la copia local colgando, y cambiarlo sería mudar la
carpeta del proyecto porque el servidor decidió llamarse de otra forma. Del `serverInfo` no sale
ningún identificador, solo texto para leer.

**El selector de modelos del compositor** (`apps/web/src/componentes/PastillaDeModelo.tsx`,
mensaje `modelos` en `transporte.ts`). Las reglas no son nuestras: salen de leer
`@deepseek-ai/dsh-client-ui-model-selection`, que es el mismo problema resuelto antes.
- **El modelo en vigor lo dice el SERVIDOR** y el cliente lo pinta: ni lo deduce del último
  turno ni lo re-parsea del transcript. Sale de `resolver(estadoDeSesion.fuentes).trabajo`
  de la consola ABIERTA, porque `/modelo` y `/modelos` cambian el modelo en caliente y no
  tocan disco — releer la configuración contaría lo de antes para siempre. Sin sesión
  abierta el campo se va y el cliente pone «Elige modelo»: no se sintetiza una fila.
- Enterarse del cambio exige una costura, `Consola.alEstado` (`cli/consola.ts`), que
  `correrConsola` invoca cuando un comando devuelve estado nuevo; el vestíbulo la instala
  en cada consola de proyecto y la reexpone con `alCambiarEstadoDeSesion`. stdio y la TUI
  no la implementan (la TUI ya re-parsea `acuseDeModelo` para su barra).
- **Elegir no tiene camino propio**: manda `/modelo <proveedor>/<id>` como prosa, el mismo
  comando que se teclea. Dos entradas, un solo camino de envío.
- **El catálogo se pide por proveedor y bajo demanda** (`clase: "catalogo"`), porque cada
  uno es una llamada de red; se cachea en el proceso, y el que falla se lista con su error
  mientras los demás siguen elegibles — un desvío, no un callejón.
- **La lista es de lo COMPROBADO, no de todo lo que existe.** Un proveedor sin clave no se
  puede usar, y ponerlo en el menú de elegir modelo es ofrecer algo que falla al pulsarlo.
  «Comprobado» significa dos cosas distintas, y las dos son lo máximo que se puede afirmar
  de cada uno: con clave, que la clave ESTÁ —que valga lo dirá el primer uso; comprobarlas
  todas al arrancar serían varias llamadas de red por sesión, y la clave puesta ya es una
  decisión del usuario—; y sin clave (Ollama, un personalizado local), que su catálogo
  CONTESTÓ. Tres reglas más:
  - **Los que no llevan clave se prueban al CONECTAR**, una vez por proceso, y solo ellos.
    Es la excepción a «el catálogo se pide bajo demanda», y se gana sola: Ollama es
    `localhost` y sin esa llamada el proveedor por OMISIÓN de esta consola no aparecería
    nunca en su propia lista. A los de pago no se les pregunta al arrancar.
  - **El que está EN VIGOR se enseña siempre**, comprobado o no: si el modelo de trabajo
    viene de una variable de entorno que este proceso no reconoce como credencial,
    esconderlo dejaría la pastilla enseñando arriba un proveedor que no está en su propia
    lista. Es además el único sitio donde se puede ver ya el punto HUECO, y el único donde
    se ve el rojo de «sin conexión» — que es justo cuando hay que decirlo: lo estás usando y
    ha dejado de responder.
  - **Los que quedan fuera se CUENTAN, con el camino para arreglarlo** («6 proveedores más
    sin comprobar · configúralos en Ajustes»), que es el mismo patrón de la barra lateral
    con los proyectos sin enseñar. Esconderlos y callarlo haría que Anthropic pareciera no
    existir. Y **Ajustes → Proveedores los sigue enseñando todos**: es donde se configuran, y
    filtrar ahí haría imposible poner la primera clave.
- **El punto de credencial tiene TRES estados** (`SIN_CREDENCIAL`, `core/modelos.ts`):
  verde solo si está confirmada, HUECO solo si consta que falta (era rojo, y tres puntos
  rojos en la lista se leían como tres errores), y NADA para quien no
  necesita ninguna. `hayCredencial` (`cli/consola.ts`) no sirve para esto: devuelve `true`
  para un proveedor sin variable de entorno, que responde a otra pregunta.
- Al caerse el SSE el cliente **tira** el estado de modelos (`marcarDesconectado`) y la
  reconexión lo trae entero: mientras no hay cable, el modelo en vigor no se puede afirmar.

**El modelo por DEFECTO se fija en Ajustes, y es una pregunta distinta de la del compositor.**
Medido antes de escribirlo: `/modelo <id>` escribe `fuentes.bandera` del estado de sesión
—cambia en caliente y **no toca disco**, que es justo lo que lo hace inmediato—, así que
elegir en la pastilla, reiniciar y encontrarse el modelo de antes era el comportamiento
correcto del código y el equivocado para quien lo usó. Y el manejador del cable rechazaba
sin más cuando no había proyecto abierto («no hay ninguna sesión abierta a la que cambiarle
el modelo»), o sea justo en la pantalla desde la que se configura: Ajustes se abre desde la
barra del Escritorio, la miga y la barra lateral, sin sesión ninguna.
- **Dos preguntas, dos campos**, que es el patrón que este repo ya usa en el contador
  (`contexto` vs los acumulados): `actual` es el modelo de la sesión ABIERTA y `porDefecto`
  es el que usarán las NUEVAS. Fundirlos en uno haría que Ajustes enseñara el de la sesión
  como si fuera el defecto —o, sin sesión, «sin elegir» sobre una máquina que sí tiene uno
  escrito—. `porDefecto` viaja **sin sesión abierta**, porque es la pregunta de las sesiones
  que aún no existen; `actual` no, porque sin sesión no hay nada que afirmar.
- **El escritor es el que sobrevive**: `guardarModeloGlobal(papel, id)`
  (`agent/config/configEnDisco.ts`) escribe `modelos.<papel>` en el `config.json` GLOBAL
  (`~/.xonecode/config.json`) de forma atómica y sin destruir lo que hubiera. Se escriben
  **los tres papeles** —`rapido`, `trabajo`, `afilado`— porque quien elige en Ajustes no está
  eligiendo «el del papel trabajo»: el `config.json` tiene una entrada por papel desde antes,
  y dejar dos apuntando a otro sitio es una trampa puesta a mano.
- **Elegir es UNA frase, así que hace lo mismo desde los dos sitios**: el manejador del cable
  guarda el defecto y, **si hay sesión**, además encola `/modelo <id>` en el lazo para
  aplicarlo en caliente. Encadenar solo lo segundo dejaba la elección muriendo con el
  proceso; solo lo primero dejaría la sesión abierta en el modelo de antes, que es el que el
  usuario acaba de cambiar. **Cambio de comportamiento declarado: elegir en la pastilla del
  compositor ahora también fija el defecto.**
- **Todo lo que toca disco entra por una opción** (`OpcionesDeMontaje.guardarModeloGlobal` y
  `modeloPorDefecto`, en `arranque.ts`), que es la regla que este repo paga una y otra vez:
  el escritor se tipa como `Consola["guardarModeloGlobal"]` —no como una firma copiada— para
  que no haya una segunda copia de la firma donde las dos diverjan, y el lector se re-resuelve
  en cada emisión porque el defecto acaba de cambiar y lo que el cliente pinta se quedaría
  viejo hasta el siguiente cambio de estado.
- **El control es la MISMA pastilla** (`PastillaDeModelo`, con `titulo` y `enLinea`), no una
  segunda lista: la regla de qué proveedores se ofrecen (los COMPROBADOS), el catálogo bajo
  demanda y los tres estados del punto de credencial son los mismos, y una copia es el sitio
  donde divergen. `enLinea` es un ATRIBUTO del mismo menú: en el compositor flota hacia
  arriba porque la caja vive pegada al borde inferior, y dentro del panel de Ajustes —que ya
  se desplaza— un absoluto lo recortaría el borde del panel. La sección pasó a llamarse
  **«Modelos»** y no «Proveedores»: su propia nota confesaba que el modelo en uso se elegía
  en otra parte, precisamente porque no había dónde fijar el defecto.

**La clave de API se PRUEBA antes de escribirse** (`cli/wizardInicial.ts`). Dos cribas, y la
primera es de balde: `motivoDeClaveInaceptable` (`core/config.ts`) rechaza lo que el propio
campo ya delata —una línea `NOMBRE=valor` pegada entera, comillas, y cualquier carácter que
no quepa en una cabecera HTTP (`\x21`–`\x7E`)— sin gastar una petición. La segunda es el
catálogo: la clave se aplica al proceso con `aplicarCredencialAlProceso`
(`agent/config/configEnDisco.ts`, sin tocar disco), se pregunta, y **solo si el proveedor contesta
se escribe** en `auth.json`. Antes se escribía primero —hacía falta para poder listar— y
cada intento fallido dejaba una clave basura en el fichero con el asistente confesando
dónde. La clave a medias vive en una variable de la VUELTA del lazo y no del lazo: siendo
del lazo, una vuelta que se iba por un `continue` se la dejaba puesta y la siguiente
—otro proveedor— la escribía como suya (medido con `auth.json` roto: la clave de openai
se intentaba guardar bajo ollama, que ni pide credencial).

**Los subagentes son FICHEROS, y se configuran desde Ajustes** (`core/agentes.ts`,
`agent/subagentes/agentesEnDisco.ts`, `componentes/Agentes.tsx`). Uno es un `.md` con frontmatter en
`.xonecode/agentes/<nombre>.md`: `descripcion`, `motor` (`modelo` | `claude-code` | `codex`),
`modelo`, `soloLectura`, `skills`, y el cuerpo con sus instrucciones. Los cuatro
especialistas de siempre —`docs`, `planner`, `dev`, `mockup`— dejaron de estar a fuego en
`perfiles.ts` y son ahora esos mismos ficheros, sembrados en el arranque. El quinto es
**`xone-device-tester`** —se llamó `probador` hasta que se renombró, y ese renombrado tiene
caso propio en la siembra, más abajo—, para dispositivos locales (párrafo siguiente). Reglas duras:
- **Las de XOne no salen del fichero.** `REGLAS_XONE` se antepone SIEMPRE desde código a
  todo subagente. Un agente que no sepa que XOne ignora en silencio lo desconocido escribe
  un atributo inventado y no da error: da un bug mudo. Poder quitarlas editando un `.md`
  convertiría el invariante en una preferencia. Igual de estructurales, y por lo mismo, el
  aviso de las skills que faltan y la línea de que las escrituras se aprueban.
- **El nombre sale del FICHERO**, no del frontmatter: la unicidad la garantiza el sistema de
  ficheros, y renombrar el agente es renombrar el fichero — sin dos sitios que discrepen.
  Por eso la ventana no deja cambiar el nombre al editar.
- **Sin `descripcion` no se carga**: es lo que el orquestador lee para decidir cuándo
  delegar, no un rótulo. Y **`soloLectura` solo es cierto con exactamente «true»** — la
  trampa del `"false"` de CloudStudio, que aquí concedería ESCRITURA.
- **El modelo se ELIGE de un desplegable, y vale para los TRES motores.** Era un campo de
  texto en el que había que acordarse de la sintaxis `proveedor/modelo`, y con los dos
  motores externos no había campo: el `.md` que llevara `modelo` se RECHAZABA, con el
  argumento de que ahí lo elige el agente. **Era falso**, y está medido: el SDK de Claude
  Code acepta `options.model` y el `ThreadStartParams` de Codex acepta `model` —comprobado
  contra el esquema que el propio binario genera (`codex app-server generate-json-schema`)—.
  De dónde sale cada lista:
  - **`modelo`**: los proveedores COMPROBADOS, la misma regla que la pastilla del compositor,
    agrupados por proveedor. Sus catálogos se piden al ABRIR el formulario y no antes: cada
    uno es una llamada de red y la lista de subagentes se mira mucho más de lo que se edita
    uno. Un grupo sin modelos no se pinta —parecería que ese proveedor no tiene ninguno— y
    mientras llegan se dice que se están consultando.
  - **`claude-code`**: los ALIAS que documenta su propio SDK (`opus`, `sonnet`, `haiku`,
    `fable`). Alias y no ids pinchados: es lo que el producto ofrece para que sobrevivan a
    sus versiones, y un `claude-opus-4-8` escrito hoy se queda viejo solo.
  - **`codex`**: se le PREGUNTAN a él (`model/list` sobre su `app-server`), bajo demanda
    porque arranca un proceso, y cacheados por proceso — salvo el FALLO, que no se cachea:
    instalar Codex después tiene que funcionar sin reiniciar la consola. De su respuesta se
    guardan el id y el nombre para leer, y nada más: trae además esfuerzos de razonamiento,
    modalidades y avisos de crédito de la cuenta, que no hacen falta para elegir un modelo.
    Los que él marca `hidden` no se ofrecen.
  En los tres, no elegir es una opción de verdad y dice qué pasa entonces («el del papel que
  le toque», «el que use Claude Code»). Y cambiar de motor LIMPIA el modelo: un `opus` no
  vale para el motor de modelo ni un `gemini/…` para Claude Code.
- **La marca de la siembra es un FICHERO, `.semilla.json`, con el hash de lo que escribimos
  nosotros para cada agente.** Fue «la carpeta es la marca»: si `agentes/` existía, no se
  escribía nada nunca más. Respetaba el prompt afinado por el usuario —que es lo que hay que
  respetar— pero eligió un cuerno del dilema y el otro acabó mordiendo: **ningún agente
  nuevo, y ninguna corrección a uno existente, alcanzaba a quien ya hubiera arrancado una
  vez**. Medido: un `docs.md` llevaba semanas sin la consulta acotada, y el probador de
  dispositivos no habría llegado jamás. El hash distingue los cuatro casos que antes eran uno:
  no está + no consta = agente NUEVO, se escribe; no está + consta = lo BORRÓ el usuario, no
  se resucita; está y es el nuestro = nadie lo tocó, se actualiza; está y NO es el nuestro =
  es suyo, se deja y se DICE (por `problemas`, el mismo canal que un `.md` roto, porque quien
  lo tiene que arreglar está mirando esa ventana).
- **El QUINTO caso es el renombrado, y apareció con el primero que hubo** (`RENOMBRADOS`,
  `probador` → `xone-device-tester`). La marca guarda el hash POR NOMBRE, así que renombrar
  deja una clave que ya no nombra a ningún agente de serie — y el bucle, que recorre la lista
  de serie, no la miraba: **quien ya hubiera arrancado se quedaba con los DOS especialistas**,
  el nuevo mantenido y el viejo huérfano, que además sigue cargando y sigue funcionando, así
  que nada delata que uno de los dos ya no se actualiza. El desenlace lo decide el mismo dato
  que todo lo demás: si el fichero sigue siendo exactamente lo que escribimos, es nuestra
  semilla y se retira; si no, es del usuario y se queda. El retirado se dice UNA vez —la clave
  se va con el fichero— y el que se respeta cada arranque, porque ahí queda algo que decidir.
  Se retira solo lo que consta en la tabla, y no «toda clave desconocida cuyo hash sea el
  nuestro»: eso funcionaría hoy y mañana borraría cualquier entrada rara que un fallo dejara
  en la marca. **Límite declarado**: la carpeta que se ADOPTA no tiene marca y no hay contra
  qué comparar, así que ahí el huérfano ni se retira ni se dice. Es el lado que no borra nada
  ajeno, y se paga una vez, en la misma ronda que ya se paga por lo demás.
- **Una carpeta sin marca se ADOPTA, no se siembra** — pero solo si tiene alguno de serie
  dentro. Es la de quien viene de la regla vieja, y ahí no se puede saber qué borró a
  propósito: dar por nuevo lo que falta le resucitaría un agente que eliminó. Se anota lo que
  hay —como nuestro si coincide con la versión de hoy, como `ajeno` si no— y no se escribe
  ningún `.md` esa vez; desde la siguiente todo lo de arriba funciona. Una carpeta VACÍA sin
  marca es otra cosa y se siembra entera: no viene de ninguna siembra (la deja un
  `guardarAgente` con nombre inválido), y adoptarla anotaría los cinco como entregados sin
  escribir uno solo — ese usuario se quedaría sin ningún subagente para siempre.
- **El prompt del orquestador se GENERA** de la lista (`xoneAgent.ts#promptOrquestador`): la
  constante que nombraba a los cuatro a pelo se queda mintiendo el día que alguien borre uno.
  La regla del encadenado de diagramas solo se escribe si existen los dos agentes de los que
  habla, y sin ningún especialista el prompt lo DICE.
- **El ámbito se elige, no se adivina** (`global` o `proyecto`): con proyecto abierto valen
  los dos, y decidir por el usuario es cómo un «revisor» pensado para todos acaba escondido
  en uno. El de proyecto pisa al global del mismo nombre, igual que los modelos.
- **Lo que se guarda desde la ventana vuelve a pasar por el CARGADOR** antes de escribirse:
  el mismo fichero se edita a mano, así que la autoridad sobre si vale es el cargador y no
  el formulario — si no, un agente podría desaparecer al siguiente arranque sin que nadie
  hubiera hecho nada raro.
- **SUPERADO el 11-09-2026: un agente externo de Claude Code ESCRIBE, y cada escritura pasa
  por una autorización.** El párrafo de abajo se queda tal cual porque cuenta el razonamiento
  que llevó hasta aquí, y de él dos cosas siguen siendo verdad —la lista blanca, y que Codex
  tiene la denegación más fuerte porque la pone el sistema operativo—; lo que era falso era el
  obstáculo: `canUseTool` es asíncrono y corre en NUESTRO proceso, así que se puede esperar ahí
  a que alguien decida con el hijo vivo, sin `interrupt()` y sin reejecutar el nodo. Lo que
  cambia está en el bloque ESTADO ACTUAL que va debajo de este párrafo histórico: TRES listas de
  tools en vez de dos (conceder escritura concedía `Bash`), las guardas de ruta del proyecto
  REAPLICADAS sobre la ruta absoluta del hijo y dos veces (texto y `realpath`), la política que
  es el `pedirAprobacion` que ya existía, y `settingSources: ["user"]` — porque una regla
  `allow` de un `settings.json` **del proyecto** hacía que el callback no se invocara, y ese
  fichero viene de CloudStudio. Ese detalle vivió en `CLAUDE.md` del 11 al 14-09-2026 y volvió
  aquí: el porqué de un invariante no puede tener su descripción viva en el mapa.
- **PÁRRAFO HISTÓRICO — un agente EXTERNO (Claude Code) corría, pero solo LEÍA**
  (`core/ports.ts#SubagenteExternoPort`, `agent/subagentes/subagenteExterno.ts`). Entra como
  `CompiledSubAgent` de deepagents —`{name, description, runnable}`, que acepta junto a los
  normales—, así que los tres motores llegan al orquestador por el MISMO `task` y él no sabe de
  qué está hecho cada especialista. Se conserva porque el bloque SUPERADO de arriba lo cita y
  porque cuenta el razonamiento que llevó al diseño actual; **lo que hoy es verdad está en el
  bloque ESTADO ACTUAL de aquí abajo, no en estas cuatro.** Cuatro cosas que sostenían esto:
  - **La escritura se deniega por LISTA BLANCA**, no por lista negra. El SDK trae
    `canUseTool` —recibe la tool y su entrada entera, contesta permitir o denegar— y es
    exactamente el contrato de nuestra aprobación; lo que no encaja todavía es el otro lado:
    nuestro HITL son `interrupt()` de LangGraph, y reanudar uno reejecuta el nodo desde el
    principio, o sea relanzaría el proceso hijo. Hasta que eso se resuelva se permiten las
    tools de lectura conocidas y se deniega TODO lo demás, incluido lo que no se reconoce —
    con una lista negra, la tool que Claude Code añada mañana entraría permitida, y `Bash`
    sola basta para escribir el proyecto entero. `WebFetch`/`WebSearch` también se deniegan:
    no escriben, pero sacan el proyecto fuera de la máquina. `decisionDeTool` es pura y
    exportada para poder probarla sin lanzar un Claude Code en `npm test`.
  - **Un `.md` externo con `soloLectura: false` se RECHAZA al cargar**, no se degrada. Dejarlo
    pasar prometería una capacidad que no va a tener, y quien lo escribió lo descubriría
    cuando el agente le contestara que no ha podido tocar nada.
  - **Sus instrucciones se AÑADEN al preset de Claude Code**, no lo sustituyen: lo que sabe
    hacer como producto es la razón de llamarlo. Lo que se le añade son las reglas de XOne y
    su papel, que es lo que no puede saber.
  - **Se comprueba `disponible()` antes de montarlo.** Un especialista que el orquestador
    puede elegir y que revienta al elegirlo es un botón muerto dentro del grafo — peor que uno
    de interfaz, porque quien lo pulsa es el modelo y se cree el resultado.
  - **ESTADO ACTUAL (14-09-2026): un agente externo de Claude Code ESCRIBE, y cada escritura pasa
  por una autorización.** `canUseTool` es asíncrono y corre en NUESTRO proceso, así que se
  espera ahí a que alguien decida con el hijo vivo — sin `interrupt()` y sin reejecutar el nodo,
  que era justo el obstáculo que el párrafo histórico creía insalvable. `decisionDeTool` decide
  en este ORDEN, y los tres primeros escalones son guardas; la política va al final:
  - **TRES listas de tools**, no dos: lectura / escritura / denegadas, y lo DESCONOCIDO denegado
    también — con una lista negra, la tool que Claude Code añada mañana entraría permitida.
    Dos listas no bastaban porque el predicado era `permitirEscritura || esDeLectura(nombre)`, o
    sea que conceder escritura concedía `Bash` —que basta para escribir el proyecto entero— y
    `WebFetch`/`WebSearch`, que lo sacan de la máquina. Escribir son **solo `Write` y `Edit`**:
    las únicas cuyos argumentos encajan en `cambioDe()`, o sea de las que se puede componer el
    diff que hay que mirar. `decisionDeTool` es pura y exportada para poder probarla sin lanzar
    un Claude Code en `npm test`.
  - **Las guardas de RUTA se REAPLICAN, y ahí estaba el agujero**
    (`agent/subagentes/escrituraExterna.ts`). El `file_path` del hijo es ABSOLUTO y va al disco directo, así
    que `permisosDe`, el `virtualMode`, las vistas aplanadas y las guardas de artefactos y
    descargas NO lo alcanzan. Se aplican las MISMAS funciones sobre la ruta virtual, y **dos
    veces** —texto y `realpath`— como en `arbolDeProyecto.ts`: medido, un enlace dentro de la
    raíz apuntando a `.env` pasa la primera. Del destino se canonicaliza él si existe y su PADRE
    si no (si no, no se podría crear ningún fichero). Lo que no se puede comprobar se deniega.
  - **La política es el `pedirAprobacion` que YA existía**, traducido
    (`escrituraExterna.ts#politicaDeAprobacionExterna`, tipo `PoliticaDeEscrituraExterna` en
    `core/ports.ts`, fail-closed por TIPO como `core/cloudstudio.ts#PoliticaDeAprobacion`). Sus
    dos implementaciones son las que hacían falta y ninguna es nueva: la INTERACTIVA de las tres
    pieles (diff delante, plazo, mapa que nace rechazado, rechazo sin cliente enganchado) y la
    AUTÓNOMA de una tarea de fondo, que concede porque la autorización fue crear la tarea, lo
    anuncia con los nombres y lo apunta en `Tarea.autorizadas`. Un segundo hueco habría sido un
    segundo sitio donde el fail-closed puede dejar de estarlo. Sin `pedirAprobacion` no hay
    política y no se escribe; una política que lanza es un NO, y el `catch` va en
    `decisionDeTool` y no solo en el envoltorio de `correr`, que vive en un cierre que ningún
    test alcanza.
  - **La denegación de verdad vive en un hook `PreToolUse`, no en `canUseTool`.** Tres frases
    textuales del SDK: «Allow rules from settings files can also shadow the callback» (o sea que
    `canUseTool` puede no invocarse nunca), «PreToolUse hook denies … resolve before canUseTool
    runs» y «the 'ask' path surfaces via a can_use_tool control_request». De ahí el reparto: el
    hook contesta las TRES clases —`allow` para leer (con la ruta ya comprobada), `deny` para lo
    que no está en las listas, `ask` para escribir, que es cómo se llega al callback donde se
    puede ESPERAR a una persona— y no deja ninguna sin decidir. Dejar una la decidiría el
    `permissionMode`, y ninguno de sus valores es seguro por suposición: `dontAsk` («deny if not
    pre-approved») podría denegar la escritura antes del callback y dejar la función muerta con
    todo en verde, y `default` («prompts for dangerous operations») podría aprobar `WebSearch`
    sin consultarnos. Se usa `default`, que es el modo donde el `ask` del hook sí llega al
    callback. `canUseTool` conserva las MISMAS comprobaciones como segunda llave.
  - **`settingSources: ["user"]`.** Por la primera cita: por omisión se cargan las tres fuentes,
    incluida `.claude/settings.json` **de dentro del proyecto**, que viene de CloudStudio — el
    mismo argumento por el que `seAplicaSinAprobacion` no vive en el `config.json` del proyecto.
    Se quedan los ajustes del dueño de la máquina (la misma confianza que ya se declara para
    Codex); el coste es que el hijo no carga el `CLAUDE.md` del proyecto.
  - **LEER también lleva guarda de ruta, y ese agujero ya estaba vivo.** Medido corriéndolo,
    dicho por el propio hijo: «`.env` — sí pude leerlo». La lista blanca permitía `Read` a secas
    sin mirar la ruta, desde el primer día: se podían leer `.env`, `.git`, `.xonecode` —donde
    vive el `checkpoint.sqlite`, con la lista de mensajes ENTERA de cada conversación— y
    cualquier fichero de FUERA del proyecto. Se deniegan esas y las vistas aplanadas (el backend
    se las retira al agente entero: si las ve, edita el fichero equivocado); `/skills/`,
    `/adjuntos/` y un artefacto mal puesto de antes SÍ se leen, porque leerlos es su razón de
    ser. `Glob`/`Grep` llevan `path` opcional y ausente es la raíz. **Límite declarado**: un
    `Grep` sobre la raíz puede devolver líneas de un fichero denegado — `canUseTool` decide
    sobre la LLAMADA y no filtra su salida; cerrarlo pide un `PostToolUse`, que no está puesto.
  - **Un hijo de Claude Code NO puede enumerar la carpeta, así que se le DICE**
    (`escrituraExterna.ts#inventarioDelProyecto`). Medido espiando el hook en vivo: intentó
    `Bash ls`, `Bash find` —denegadas—, pidió `ToolSearch select:Glob,Grep` y **no las
    encontró**; probó las tools MCP del usuario y acabó leyendo a ciegas nombres inventados
    —`README.md`, `CLAUDE.md`, `app.ini`…, ninguno existía: **65 lecturas**— para concluir que
    «el proyecto está prácticamente vacío para mí, porque no puedo listarlo». Conceder `Bash`
    era la salida fácil y la prohibida. La buena es que el harness YA tiene esa lista —la misma
    con la que reconoce una vista aplanada—, así que va en sus instrucciones: rutas virtuales,
    acotada y con el total al lado. Es el patrón de `core/adjuntos.ts`: montar no basta, hay que
    decir que están. Medido después: de 65 lecturas a ciegas a **3 exactas**, y el documento
    salió correcto.
  - Dos cosas más que salieron de esa misma medida: **`ToolSearch` es de LECTURA** (devuelve
    esquemas, no ejecuta nada, y lo que consiga vuelve a pasar por el hook — sin ella el mensaje
    de denegación le ofrecía buscar con unas tools que no podía alcanzar), y **listar la RAÍZ se
    permite**: `rutaVirtualDeEscritura` la descarta a propósito porque no es un fichero que
    escribir, y eso es cierto para escribir y falso para mirar.
  - **Y todo esto está MEDIDO contra un hijo de verdad** (11-09-2026, tres ejecuciones): aprobar
    escribe, rechazar no deja fichero, `.env` y las vistas aplanadas se cortan, `Bash` se
    deniega, y un artefacto dentro del proyecto se rechaza diciendo dónde iba. Las tres
    ejecuciones encontraron tres fallos que ningún test con dobles habría visto: la raíz no
    canónica (`/tmp` → `/private/tmp` en macOS hacía imposible escribir), la carpeta padre que
    todavía no existe (`Write` las crea, y se denegaba con «no se pudo comprobar»), y el `allow`
    del hook saltándose la guarda de lectura.
  - **Un `.md` con `soloLectura: false` se ACEPTA ya, en los TRES motores**, y la guarda se
    levantó **con** su cableado, no antes. Medido: `permitirEscritura: !agente.soloLectura`
    (`xoneAgent.ts`) vale para los tres y ninguno lo rechaza — el sub-bullet del párrafo
    histórico que dice que se RECHAZA describe el estado anterior a la escritura.
  - **Sus instrucciones se AÑADEN al preset de Claude Code**, no lo sustituyen: lo que sabe
    hacer como producto es la razón de llamarlo. Lo que se le añade son las reglas de XOne y su
    papel, que es lo que no puede saber.
  - **Se comprueba `disponible()` antes de montarlo.** Un especialista que el orquestador puede
    elegir y que revienta al elegirlo es un botón muerto dentro del grafo — peor que uno de
    interfaz, porque quien lo pulsa es el modelo y se cree el resultado.
- **Codex va por otro camino** (`agent/subagentes/subagenteCodex.ts`): se habla con
    `codex app-server --stdio` por JSON POR LÍNEA. **Todo el protocolo está medido contra el
    binario real, no deducido**: los tres valores de sandbox los enumeró el propio servidor
    al rechazar uno mal escrito, y la respuesta final es el `item/completed` cuyo item es un
    `agentMessage` de fase `final_answer` — quedarse con el último item devolvería el
    razonamiento o la lectura.
    Se usa el `codex` del PATH (o `CODEX_BIN`) y no el paquete npm: son ~100 MB de binario
    por plataforma para una capacidad opcional, y el usuario ya tiene el suyo autenticado.
    Un `TOPE_MS` de 10 minutos evita que un hijo colgado cuelgue el turno para siempre. Y una
    consecuencia que hay que saber: el hijo es el Codex DEL USUARIO, con sus MCP, sus plugins
    y sus hooks — medido, arrancan al abrir el hilo. xonecode no los filtra.
  - **Y Codex ESCRIBE ya. La palanca es el `approvalPolicy`, y descubrirlo tumbó el argumento
    con el que su guarda estuvo cerrada** (medido contra codex-cli 0.152.1, 11-09-2026).
    El argumento era: conceder escritura exige `sandbox: "workspace-write"`, y entonces las
    escrituras de dentro del cwd ocurren solas —sin petición, sin diff— o sea que ninguna de
    las guardas de ruta de xonecode las vería. Cierto lo segundo; falso lo primero. Con
    `sandbox: "read-only"` + `approvalPolicy: "on-request"` el sandbox del sistema operativo
    **sigue siendo la denegación** y cada escritura llega como una PETICIÓN que contestamos
    nosotros; medido: al contestar `accept` el fichero se escribe igual, y al contestar
    `decline` no queda fichero, el item queda `declined` y el turno SIGUE, así que el agente
    lo puede contar. Por eso el sandbox se queda en `read-only` **siempre**, también con la
    escritura concedida: no existe ningún modo en el que Codex escriba sin pasar por aquí.
    Es el mismo papel que juega el `ask` del hook `PreToolUse` en Claude Code.
    - **La petición no dice sobre QUÉ se decide**: `item/fileChange/requestApproval` trae
      `{threadId, turnId, itemId, startedAtMs, reason, grantRoot}` y nada más. Los ficheros
      vinieron ANTES, en el `item/started` cuyo `item.id` es ese `itemId` —con `path`
      ABSOLUTO, `kind` y `diff`—, de ahí el registro de items del adaptador. Un `itemId` del
      que no consta item es un `decline`: sin diff no hay decisión que tomar.
    - **Su `id` empieza en 0 y comparte espacio con los nuestros.** Las peticiones del
      servidor (llevan `id` **y** `method`) se atienden ANTES que nuestras respuestas, o una
      petición con `id: 1` caería en la rama del `initialize`.
    - **`add` y `update` no traen lo mismo en `diff`**: en `add` es el contenido entero
      (`"medido.\n"`), en `update` un hunk unificado
      (`"@@ -1,3 +1,3 @@\n uno\n-dos\n+DOS\n tres\n"`). Por eso `cambioDe()` no sirve
      —espera los argumentos de un `Write`/`Edit`— y hay una traducción propia a
      `LineaDeDiff[]` (`agent/subagentes/escrituraDeCodex.ts`). Límite declarado: con varios hunks las
      líneas salen seguidas, sin decir que en medio hay fichero que no cambia; marcarlo
      exigiría inventar una línea que no está en el fichero.
    - **Un item puede traer VARIOS ficheros y se contesta con UNA decisión** (medido: «añade
      una línea a uno.txt y a dos.txt» llegó como un solo item con dos `changes`). Por eso
      `PoliticaDeEscrituraExterna` pasó a tomar una LISTA y a conceder solo si TODAS vienen
      aprobadas — Claude Code pasa la suya de un elemento. Con una escritura por llamada solo
      quedaban dos salidas y las dos mienten: preguntar N veces por algo que no se puede
      conceder a medias, o enseñar un fichero y escribir dos.
    - **Las guardas de ruta son las MISMAS**, `veredictoDeRuta` reaplicada sobre el `path`
      absoluto: no hay una segunda copia, porque un segundo sitio donde decidir sobre una
      ruta es un segundo sitio donde el fail-closed puede dejar de estarlo. **`delete` y
      `move_path` se deniegan**: en Claude Code esa escritura no existe, `cambioDe` no sabe
      componer su diff y un renombrado son dos destinos que guardar. Se afloja el día que se
      mida, no antes.
    - **Los otros huecos, y cómo se cierra cada uno.** `item/commandExecution/requestApproval`
      se deniega SIEMPRE: es el análogo de `Bash`, y un `cat > fichero` escribe el proyecto
      entero sin diff que mirar. Una elicitación de MCP se declina por su campo `action`. Y
      **lo que no se sabe decir que no se ABORTA**: `item/tool/requestUserInput` no tiene «no»
      en su esquema (su respuesta es `{answers:{…}}`) ni `item/permissions/requestApproval`
      (`{permissions, scope, strictAutoReview}`), así que contestarles exigiría inventarse una
      forma que nadie ha medido. Nunca `acceptForSession` ni `grantRoot`: son pre-aprobaciones
      de sesión, y lo que aquí se autoriza es una escritura concreta con su diff delante. Lo
      que NUNCA se puede hacer es dejar una petición sin contestar: eso deja a codex bloqueado
      hasta que el tope lo mate.
    - **El `TOPE_MS` se PARA mientras una aprobación está delante de alguien.** Mide «codex no
      contesta», y el rato que una persona tarda en mirar un diff no es eso: sin esto, quien
      se levanta a por un café vuelve a un «codex no terminó en 10 minutos» y a un modal
      huérfano cuyo turno ya está muerto.
    - **Medido por el camino ENTERO del harness, seis ejecuciones**: aprobar escribe (la
      política recibe la ruta VIRTUAL y su diff), rechazar no deja fichero, y `.env`, una
      vista aplanada y una ruta de fuera del proyecto se cortan **sin llegar a preguntarle a
      nadie** —preguntar por algo cuyo único final posible es un rechazo es sacar un modal
      inútil, la misma regla que el `when` de `seDetieneEn`—. Pedirle que escriba por shell
      acaba en «la autorización para ejecutar el comando fue rechazada».
    - **En una tarea de FONDO no se le pregunta a nadie, y sin tocar nada de esto**: la
      política es la misma, y la que monta una tarea es la AUTÓNOMA de
      `consolaDeTarea.aprobacionesTui`, que concede porque la autorización fue crear la tarea,
      lo anuncia con los nombres y lo apunta en `Tarea.autorizadas`. Ésta es la razón de no
      haber resuelto la escritura de fondo con `workspace-write`: así las guardas de ruta
      siguen enteras, que es lo que `core/tareas.ts` exige.
    - **Límite declarado, y es el que queda abierto: LEER no tiene costura en Codex.** Lee por
      la shell del sandbox, que en `read-only` no pide permiso a nadie, así que `.env` y
      `.xonecode` se le pueden leer — el mismo agujero que en Claude Code cerró
      `veredictoDeLectura`. No lo abre la escritura: ya estaba desde el primer día y sigue
      igual. El único asidero medido sería `approvalPolicy: "untrusted"`, que pregunta por
      cada comando y es otro diseño.
    - **Se prueba sin el binario por `CODEX_BIN`**, con un `app-server` de pega que reproduce
      el volcado de la ejecución real (`agent/subagenteCodex.test.ts`) — incluido el `id: 0`.
      Y hay un test POR ARGUMENTO del cableado de `crearSubagenteExterno`, porque los dos son
      opcionales: sin el de `ficherosDelProyecto`, una vista aplanada se escribiría con los
      dos `tsc` limpios.
  - **OpenCode es el TERCER motor** (`agent/subagentes/subagenteOpencode.ts`), y el que menos código
    propio necesita. De sus tres superficies —`opencode run --format json`, el servidor HTTP
    de `serve` y `opencode acp`— se usa **ACP** (Agent Client Protocol): JSON-RPC 2.0 por línea
    sobre stdio, el mismo molde que el app-server de Codex, y la única de las tres con portón
    de permiso por stdio. `run` no lo tiene y `serve` es otro transporte entero.
    - **Su petición de permiso trae TODO en un mensaje**: `toolCall.locations[].path` y
      `content:[{type:"diff", path, oldText, newText}]`. Eso hace que **`oldText`/`newText`
      entren directos en `core/diff.ts#diffDeLineas`** —la misma función que compone el diff de
      una aprobación del grafo— y que aquí no haga falta ni registro de items (la de Codex solo
      trae un `itemId`) ni parser de hunks. Se contesta `once` o `reject`; **`always` nunca**.
    - **El bucle de guardas y política se EXTRAJO y lo comparten los dos motores de petición**
      (`escrituraExterna.ts#veredictoDeEscriturasExternas` y `#decisionDeEscrituraExterna`).
      Cada motor solo traduce su forma. Un bucle por motor sería un segundo y un tercer sitio
      donde el fail-closed puede dejar de estarlo.
    - **Las TRES puertas por las que el proyecto podía mandar, medidas con un proyecto que las
      llevaba a la vez.** (1) Un `opencode.json` DEL PROYECTO pisa nuestra configuración: leyó
      el `.env` y soltó el secreto, corrió shell y escribió con CERO peticiones de permiso —y
      ese fichero puede venir de CloudStudio, la misma amenaza que `settingSources: ["user"]`
      cierra para Claude Code—. (2) Un PLUGIN del proyecto (`.opencode/plugin/*.ts`) **ejecuta
      código arbitrario** dentro del proceso de opencode; comprobado con su control: sin la
      variable corre, con ella no. (3) La configuración GLOBAL del usuario también nos pisa, así
      que `OPENCODE_CONFIG` es el eslabón DÉBIL —alguien con `edit: "allow"` en su `~/.config`
      mataría la aprobación en silencio— y **no se usa**. Las tres se cierran con
      `OPENCODE_CONFIG_DIR` apuntando a `~/.xonecode/opencode` (que pasa a ser «la global», y
      por eso gana) más `OPENCODE_DISABLE_PROJECT_CONFIG=1`. Las credenciales del usuario siguen
      resolviendo porque su `auth.json` vive en el directorio de DATOS y no en el de
      configuración. La configuración se REESCRIBE en cada arranque: así no puede quedarse una
      más permisiva de una versión anterior de xonecode.
    - **La LECTURA se guarda por PATRÓN y no por código, y eso es más flojo que en Claude
      Code.** El motivo está medido: el permiso de un `kind: "read"` llega con `locations: []` y
      `rawInput: {}`, sin ruta, así que no hay nada que pasarle a una guarda; la ruta solo
      aparece en el `tool_call_update` posterior, cuando el permiso ya se concedió. Con `edit`
      no pasa. Queda entre los otros dos motores: mejor que Codex, que no puede guardar la
      lectura de ninguna forma, y peor que Claude Code. **Las vistas aplanadas se enumeran una a
      una** en esa lista porque «un `.xml` con un `.xne` al lado» no es un patrón que se pueda
      escribir, y si el agente las ve edita el fichero equivocado.
    - **`bash` no se deniega: se le quita la tool** —medido, contesta «No tengo un tool de shell
      en este entorno»—, junto con `webfetch`, `websearch`, `external_directory`, `task` y
      `question`.
    - **`fs/write_text_file` NO es la escritura.** Declarando la capacidad de cliente, el agente
      pide al cliente que escriba, y parecía el asidero más fuerte de todos —la guarda no
      vetando sino ESCRIBIENDO—. Es falso: rechazándolo con un error, **el fichero apareció
      igual**. Es un aviso, no un portón. Creerse lo contrario habría dejado una guarda que no
      guarda nada.
    - **Una tool que acaba en `failed` no se anuncia**, que es el invariante de
      `core/entrelazar.ts`: se apunta por `toolCallId` en `in_progress` —el `completed` trae
      `locations: null` y la ruta metida en el `title`— y la línea sale al cerrarse bien.
      Medido en vivo: con la lectura de `.env` denegada por patrón salía «lee /.env».
    - **Una respuesta vacía tras un rechazo no es un fallo ni es silencio**: medido, el turno
      acaba bien y a veces sin una palabra. Devolver `""` la haría pasar por «el especialista no
      tenía nada que decir» y lanzar tumbaría un turno correcto, así que se dice lo que pasó con
      voz del harness —y con cuántas escrituras se rechazaron— sin ponerle palabras al agente.
    - **Medido vivo por el camino entero del harness, seis ejecuciones y con el proyecto hostil
      delante**: aprobar escribe (con la ruta virtual y su diff), rechazar no deja fichero,
      `.env` y una vista aplanada no se pueden ni leer, escribir fuera se corta, y al pedirle un
      comando de shell contesta que no tiene y cae en la tool de fichero, que sí pasa por la
      aprobación. ACP además tiene `session/cancel`, que se manda antes de matarlo: es la
      cancelación que Codex no tiene y que allí quedó declarada como deuda.
- Un `.md` roto NO tumba nada: se salta, y su motivo viaja por el cable hasta la ventana.
  Quien lo tiene que arreglar está mirando ahí, y un agente que no aparece sin explicación
  se lee como que la aplicación lo perdió.

**El probador de dispositivos** (`xone-device-tester` en `AGENTES_DE_SERIE`, que se llamó
`probador`; skill `xone-hotswap`, que cubre las dos plataformas).
El interlocutor es la app **XOneStudio ya instalada** en el móvil o el emulador (en iOS el host
es **XOneStudioSwift** y el canal tiene menos: sin endpoints de fichero, sin logcat y sin SQL —
lo que cada plataforma tiene, comando a comando, lo dice la skill). No se
compila ni se instala un APK por iteración. Levanta un servidor **solo en builds
*debuggable*** y DENTRO del proceso de la app —si la app no está viva, el puerto no
responde—, que habla WebSocket para los comandos (`launchApplication`, `getAllElements`,
`getScreenshot`, `click`/`fill`/`getText`, `runSql`, `getLog`…) y HTTP para los ficheros
(`/file_upload`, con el caso especial `debug_app_update.zip` + `appName` que despliega la app
entera, y `/file_download`). Se llega por `adb forward tcp:8443 tcp:8443`, y entonces la IP es
`127.0.0.1`. Cuatro cosas que la documentación deja claras y que cuestan un diagnóstico falso
si se olvidan: el **puerto 8443 es el por omisión y cambia** si está ocupado; el certificado
es **autofirmado** (`curl -k`); **subir no aplica** —hay que reiniciar la app, y medir sin
reiniciar mide la versión anterior sin dar ningún síntoma—; y la base de datos va **cifrada
con SQLCipher**, así que subir un `.db` en claro acaba en «database disk image is malformed».
- **El protocolo NO va en el prompt**: son 1.100 líneas y viven en la skill, que se carga
  cuando hace falta. En las instrucciones del agente queda solo lo que tiene que saber
  siempre.
- **Y lo primero que dice es lo que HOY no puede**: no tiene shell ni cliente del servidor
  hotswap, así que no habla con el dispositivo. Sirve para escribir el procedimiento exacto
  —comandos en orden, nombres reales de colección y de control, y qué tiene que valer cada
  comprobación— y para leer lo que vuelva. Está en la `descripcion`, que es lo que el
  orquestador lee para delegar: un especialista que no puede hacer lo que promete es el peor
  botón muerto, porque quien lo pulsa es el modelo y se cree el resultado.
- **`archify` y `artifacts-builder` no las lleva**, y con eso cayó una afirmación del test que
  ya no era la regla: no es que TODOS los especialistas las tengan, es que **las dos viajan
  juntas** —el bloque `SKILLS_VISUALES` habla de las dos—. Un probador no dibuja diagramas, y
  dos skills que no usa son prompt en todas sus llamadas.

**La ventana de ajustes** (`apps/web/src/componentes/Ajustes.tsx`), con la disposición del
panel del harness: navegación a la izquierda y UNA sección a la vista — apariencia, modelos,
entornos, subagentes y dispositivos. Tres ausencias deliberadas, todas por la misma regla («un control sin dato
detrás es la misma mentira que una lista vacía rellenada»):
- **Los `TEMAS` de `cli/tema.ts` no están**: son paletas ANSI de la consola de terminal y en
  un navegador no pintan nada. Lo que sí es real es el claro/oscuro del cliente
  (`apps/web/src/apariencia.ts`), que existe porque el CSS de deepseek trae
  `body[data-ds-dark-theme]`; se recuerda en `localStorage` —es de ESTE navegador, no de la
  cuenta— con todo acceso envuelto en `try`, porque en una ventana privada el propio
  accesor lanza.
- **Sí hay «proveedor personalizado», y las dos listas conviven** (párrafo propio más
  abajo). Los de SERIE siguen siendo una lista cerrada del repo
  (`core/modelos.ts#PROVEEDORES`); lo que se puede declarar desde la ventana es un endpoint
  compatible con OpenAI con su URL y su clave, que es otra cosa y se pinta en otro grupo.
- **Borrar una credencial solo se ofrece si está en `auth.json`** (`enFichero` en el cable,
  y solo si además hay puerto para borrarla). Una que viene de una variable de entorno no
  la podemos quitar; `borrarCredencial` (`agent/config/authEnDisco.ts`) limpia `process.env` SOLO
  si la variable llevaba exactamente la clave borrada —el caso de `aplicarAuth`— y devuelve
  `quedaEnEntorno` para poder decirlo: el punto se quedará verde y callarlo parecería un
  fallo del botón.

Poner y borrar la clave **no pasan por la prosa `/provider`** aunque sea el mismo diálogo:
esa ruta necesita el lazo de `correrConsola`, que solo existe con un proyecto abierto, y
esta ventana se abre antes. Tienen su propio mensaje (`clase: "credencial"`), y «pedir»
hace que el servidor PREGUNTE por `leerSecreto` — la clave sigue viajando por el único
mensaje del cable que la lleva, y la ventana solo decide DÓNDE se pinta esa pregunta
(dentro de la fila que se edita, no detrás del modal). Registrar un entorno desde ahí
reutiliza el mensaje del alta con `id` y `nombre` vacíos.

Y una corrección de honestidad que vino con esto: el mensaje de alta lleva ahora
`registrados` además de `entornos`. `entornos` es la lista OFRECIDA (los dos oficiales más
«otro»), que sirve para prerrellenar la URL; la barra lateral la estaba enseñando como si
fuera la de entornos dados de alta, así que un on-premise registrado se leía con el nombre
de otro servidor.

**La barra lateral, cableada** (`apps/web/src/componentes/Barra.tsx` + `arranque.ts`).
Tres controles eran manejadores vacíos en `App.tsx` —se pulsaban y no pasaba nada— y las
sesiones llegaban a fuego como `[]`:
- Las **sesiones guardadas viajan con su proyecto** en el mensaje de alta, leídas de la
  copia local (`sesiones.listar`, vacío si nunca se bajó). Reabrir una y «nueva sesión» son
  el MISMO mensaje (`clase: "sesion"`, con o sin `sesion`): si la copia local existe se abre
  y punto —no hay alta que hacer ni rama que preguntar—, y si no existe se cae al camino del
  alta, que es el único que sabe bajarla.
- **La barra enseña cuatro proyectos** (`PROYECTOS_POR_OMISION`) cuando nadie ha dicho
  cuáles, y DICE cuántos quedan fuera y dónde se eligen — callarlo haría creer que el
  entorno solo tiene cuatro. La elección se guarda con el entorno
  (`Entorno.proyectos`, `settings.json`) y manda sobre el tope: quien pide seis, ve seis.
  **Ausente y vacía no son lo mismo**: ausente es «no lo he dicho» y aplica la omisión,
  `[]` es «ninguno» y se respeta. Esa distinción se conserva en las cuatro capas (disco,
  cable, store y componente); colapsarla haría que elegir ninguno se leyera como no haber
  elegido. El ORDEN lo pone el listado del servidor, no el orden en que se marcaron.

**Las tareas en BACKGROUND** (`core/tareas.ts`, `agent/tareas/tareasEnDisco.ts`, `web/servidor/corredorDeTareas.ts`,
`consolaDeTarea.ts`, `core/entrega.ts`, `agent/tareas/juezDeTarea.ts`). Un encargo por proyecto que se
ejecuta **solo**: se encola, corre cuando le toca, escribe en el proyecto sin pedir aprobación, y
se entrega si pasa unas condiciones más el veredicto de un juez. Cuatro estados —`nuevo`,
`en-proceso`, `requiere-atencion`, `terminada`— y `requiere-atencion` significa **esperando
feedback del desarrollador**: no es terminal, se resuelve editando la tarea.

**Que una tarea escriba sin aprobación es una decisión de producto, y el sitio del diff NO se
queda vacío.** La aprobación no estaba por la propiedad del repo: estaba porque XOne ignora en
silencio lo desconocido, así que un atributo inventado no da error sino un bug mudo, y el diff era
el único momento en que alguien lo veía antes de que existiera. Quitando al humano, ese papel lo
ocupan DOS piezas y las dos hacen falta: el **verificador**, que ya corre en el turno (medido: sí
corre por el camino de una tarea), y el **juez** de QA. Y el juez **no basta solo** —la regla que
`core/cloudstudio.ts#PoliticaDeAprobacion` ya tenía escrita para la subida autónoma—: las
condiciones las comprueba el CÓDIGO, porque a un modelo se le puede pedir que avise y a veces no
avisa. Cinco reglas que sostienen esto:
- **La autorización es el ACTO DE CREAR LA TAREA**, no un interruptor. Elegir un proyecto y
  escribir un encargo es decir «trabaja en esto sin preguntarme», y sin tarea creada no hay
  escritura autónoma posible — un ajuste aparte sería algo que armar y recordar. Y **no se
  reutiliza `seAplicaSinAprobacion`**: su significado es «el humano que está aquí ha decidido no
  pulsar», rechaza los proyectos conectados, y su marca vive en el `settings.json` de un proyecto.
- **Las guardas de RUTA siguen enteras**, y eso está probado montando el backend real más
  `permisosDe`: `/artifacts/`, las vistas aplanadas, `/.env`, `/.git` y `/.xonecode` se rechazan
  igual. Quitar el modal no abre ninguna de esas puertas. Y no son la misma guarda ni contestan
  igual —las tres últimas las corta `permissions` con un `ToolMessage` de error, no el backend con
  una cadena—, así que un test que exigiera una sola forma daría por roto el otro camino.
- **`Tarea.autorizadas` guarda lo AUTORIZADO, no lo escrito.** Una ruta que las guardas rechazan
  sale ahí sin tocar el disco. Es una pista y su nombre no puede prometer más: la verdad sobre lo
  que cambió la tiene la ref de git de la sesión, o sea la pestaña Revisión.
- **«Terminada» ya no significa «el turno acabó».** `condicionesDeEntrega` (`core/entrega.ts`,
  pura) exige verificador en VERDE, nada pendiente de aprobar y `revisable`. Esa tercera **no es
  «árbol limpio»**, y está medido: una tarea que escribe deja `git status` sucio por definición, así
  que esa condición habría impedido entregar cualquier tarea — es `cambiosDeSesion().via === "git"`,
  «alguien puede revisar esto», con la misma función que pinta Revisión para que no puedan
  divergir. El verificador que **NO CORRIÓ no es verde**: «no se sabe» no es «está bien».
- **Una tarea de SOLO LECTURA sí se entrega**, y no es relajar lo anterior: el dominio del
  verificador son las escrituras, así que sin cambios la condición **no aplica**. Con tres
  candados: que no escribió lo dice GIT y no `autorizadas`; `escribio` solo se afirma **con marca**
  (sin `via: "git"` queda ausente y el verificador se exige como siempre — es la mutación que más
  tests tumba); y la salvedad viaja pegada al **veredicto** y no al `motivo`, porque el motivo de
  una tarea terminada no existe: `conEstado` lo borra a propósito.
- **Y a «Terminada» se llega por CUATRO caminos, así que la tarjeta dice por cuál**
  (`EntregaDeTarea.tsx`, una pieza para el kanban y para la lista, como `AccionesDeTarea`). Los
  cuatro: el juez la aprobó con las tres condiciones en verde; se entregó con una condición de
  MENOS (la salvedad: no había nada que verificar); la dio por buena una PERSONA con «Dar por
  bueno»; y «no consta», que son las de antes de que la puerta existiera. Se pintaban las cuatro
  igual —proyecto, título y hora— porque `Tarea.veredicto` **no salía del host**: ni `filaDeTarea`
  lo copiaba, ni `TareaDelCable` lo declaraba, ni la lista blanca del store, y `grep veredicto
  apps/web/src/` daba cero. O sea la mitad del contrato en `core/` y en disco, y la mitad que una
  persona lee sin cablear — con `core/entrega.ts` afirmando que una entrega con una condición
  menos no puede parecer normal, cosa que en la pantalla era falsa. Tres reglas:
  - **La marca de la persona es un campo propio** (`Tarea.terminadaAMano`, que solo pone
    `darPorBuenaAMano`) y no se deduce del veredicto: una tarea puede llegar a ese botón con un
    VERDE ya guardado —la puerta la aprobó y la escritura del estado final reventó, así que se
    aparcó «el corredor no pudo cerrarla»—, y entonces «tiene verde» significaría dos cosas. La
    marca GANA al veredicto al pintar, y el veredicto se conserva y se lee al lado: es lo único
    que dice qué se decidió ignorar.
  - **El veredicto viaja ENTERO y solo lleva texto para leer.** Medido en
    `juezDeTarea.ts#promptDelJuez`: el juez recibe el encargo, las rutas RELATIVAS de lo
    autorizado y los hallazgos del verificador, y no hay un solo `readFile` en ese módulo — no
    puede citar el contenido de un fichero ni una ruta de la máquina. El `resumen` ya cruzaba el
    cable de todos modos, dentro del `motivo` de una tarea aparcada por el juez.
  - **`filaDeTarea` salió del cierre de `montarRutas`** a `transporte.ts`, junto al tipo que
    traduce, con un test que recorre los campos de `Tarea` y exige decisión explícita por cada
    uno (viaja / no viaja y por qué) — es la SEXTA instancia del patrón de fallo de abajo, y el
    mismo remedio: `raiz` y `pid` se quedan declarados como «no viaja» en vez de olvidados. Y las
    otras dos capas tienen su red: `tipos.test.ts` compara los CAMPOS de `TareaDelCable` entre
    cliente y host (los literales `clase:` no lo veían: el mensaje seguía llamándose `tareas`), y
    la lista blanca del store se prueba mandando una fila con todos los campos declarados y
    exigiendo que sobrevivan todos — rojo si uno se CAE, no solo si sobra.
  - **Y en una tarea APARCADA lo que se enseña son los HALLAZGOS**, con la misma pieza: el
    `motivo` da el qué —el corredor lo compone como «el juez de QA dijo «rojo»: <resumen>»— y
    los hallazgos son la lista de lo que falta, o sea lo que hace falta para contestar el
    feedback. El resumen se pinta UNA vez, y no escondiendo el bloque: se comprueba si el
    `motivo` ya lo lleva dentro —los dos salen del mismo dato del servidor, así que la
    comparación es exacta— porque si la aparcó otra cosa (un corte a mitad con el veredicto del
    intento anterior guardado) el motivo no habla del juez y entonces el resumen sí hace falta.
    Lo que NO se dice ahí es la salvedad: eso es «se entregó», y todavía no se ha entregado.

**Un hallazgo del verificador NO dice quién escribió nada, y el prompt del juez lo dice ahora
porque decía lo contrario** (`juezDeTarea.ts#promptDelJuez`). Medido en la PRIMERA ejecución
real del juez, con el modelo de verdad y un proyecto del usuario: encargo «documenta las
colecciones en DOCUMENTACION.md», el turno escribió ese fichero y `MEMORIA_PROYECTO.md`, el
verificador acabó en VERDE con dos avisos `REF_JS_COLL_MISSING` y 22 hallazgos más en ficheros
que no tocó — y el juez dictó ROJO con dos hallazgos, los dos falsos: «se modificaron ficheros
de lógica JavaScript durante el turno según los hallazgos del verificador» y «no se puede
comprobar la existencia ni el contenido de DOCUMENTACION.md», con ese fichero en
`autorizadas`. **Lo que falló no fue el modelo: fue lo que se le pasaba**, así que lo que se
puede arreglar con datos se arregla con datos y solo lo que es una instrucción va como
instrucción. Seis reglas:
- **La cabecera mentía, y era la que invitaba la conclusión.** Decía «Sus hallazgos sobre lo
  que este turno tocó», y el reparto de `turnoReal.ts#conVerificacion` admite del lado del
  turno los hallazgos **sin fichero** — el lado conservador. O sea que de un aviso que no dice
  dónde se afirmaba que era sobre un fichero escrito. Ahora se dice lo que es: el simulador
  mira el PROYECTO ENTERO, sus hallazgos son observaciones sobre el estado del proyecto y **no
  atribuyen autoría**; lo único que dice qué escribió el turno es la lista de rutas.
- **Un hallazgo sin fichero se dice sin fichero**, en su propia línea y no en un párrafo
  aparte: es el dato exacto que hace imposible atribuirlo.
- **El otro lado del reparto VIAJA** (`ResultadoDeTurno.preexistentes` → `CasoDeJuez`), que se
  medía para pintar una línea de consola y se tiraba. `hallazgos` ya llega filtrada y **quien
  la recibe no puede saber que lo está**: con el número, la lista se lee por lo que es. Ausente
  es «no se midió» y `0` es «no había ningún otro» — el evento omite el cero porque ahí es una
  línea que no dice nada; aquí es un dato, y se dice.
- **Los avisos llegan etiquetados, no escondidos.** `h.severidad` se pintaba en crudo, así que
  un aviso era «warning» —el enum, en inglés— junto a un «ERROR» traducido; ahora van AVISO e
  INFO y en grupos separados. Quitárselos habría sido la salida fácil: un juez con menos
  contexto juzga peor. Y con el verificador en VERDE se dice que **no hay nada que reprochar
  por su parte** y que los avisos no lo cambian, que es exactamente lo que el código hace
  (`condicionesDeEntrega` cuenta ERRORES) — la misma razón por la que la huella de reparación
  son solo los errores: «un aviso que va y viene no dice nada de si el error se arregla».
- **La INTENCIÓN y el HECHO van en dos listas, y no se confunden.** El encabezado «Ficheros
  que se autorizó escribir» se lee como un permiso —lo que se PODRÍA haber escrito—, de ahí el
  segundo hallazgo falso. Y no se arregla prometiendo más de lo que `autorizadas` aguanta (se
  apunta al AUTORIZAR, así que una ruta que una guarda rechace sale igual): se arregla
  DÁNDOLE la verdad. `RevisionDeSesion.cambiados` lleva ahora las rutas RELATIVAS del diff de
  git de la sesión contra su «antes» —la misma medida de la que sale `escribio`, derivadas en
  la misma expresión para que no puedan discrepar— y llegan al juez como `CasoDeJuez.cambiados`.
  Con el hecho fichero a fichero, «no puedo comprobar si existe X» deja de tener de dónde
  agarrarse, y de propina el juez puede juzgar la cobertura del encargo ruta por ruta. Las tres
  respuestas de git se dicen distintas: lista con ficheros, lista VACÍA («no cambió nada», una
  afirmación) y AUSENTE («no se pudo preguntar a git», que no es lo mismo y no puede leerse
  como un proyecto intacto). Y lo autorizado que git no ve cambiado se NOMBRA, porque callarlo
  dejaría al juez creyendo que aterrizó algo que no aterrizó.
- **Nada de esto relaja el fail-closed.** El juez sigue pudiendo decir rojo, y lo que no se
  entiende sigue siendo `indeterminado`; las condiciones las comprueba el código igual. Lo que
  cambia es que ya no puede decir rojo por lo que no es. Y las dos cláusulas que se rozan van
  separadas a propósito: no tener el contenido es un DATO de partida y no un hallazgo, lo que
  no se puede juzgar sin él es la CALIDAD de lo escrito — nunca si se escribió.

**Y hay una CUARTA condición del código: autorizó escrituras y git no ve ningún cambio**
(`core/entrega.ts#condicionesDeEntrega`, `MedidaDeEntrega.autorizadas`). Significa que TODAS
las escrituras se quedaron por el camino —las guardas de ruta las rechazaron, o escribieron lo
que ya estaba—, o sea que la tarea se cree que trabajó y no cambió el proyecto. Es un hecho
comprobable, así que se MIDE en vez de contárselo al juez, por lo mismo que su veredicto no
basta solo. Tres reglas:
- **Manda sobre la salvedad de la tarea de solo lectura.** `SALVEDAD_SIN_ESCRITURAS` dice «el
  dominio del verificador son las escrituras y no hubo ninguna», y aquí sí las hubo: solo que
  no llegaron. Tratarlo como solo lectura entregaría el caso justo al revés.
- **El motivo nombra las DOS**, la de aquí y el verificador que no corrió: son cara y cruz de
  lo mismo —no aterrizó nada, así que no había nada que verificar— y juntas cuentan la
  historia entera. Es la regla de siempre de esta función.
- **Ausente no acusa a nadie.** `autorizadas` es un número que entra por su propio parámetro y
  ausente es «no consta» (una tarea de antes de que esto existiera, un ejecutor que no lo
  informa); y sin marca de git tampoco se afirma nada, porque «no se sabe qué cambió» no es
  «no cambió nada».

**Un solo corredor por máquina, y el cerrojo NO lo garantiza solo** (`tareasEnDisco.ts#tomarCerrojo`).
La toma directa es atómica (`wx`), pero **recoger un cerrojo cuyo dueño parece muerto no se puede
hacer atómico con primitivas de ficheros**: decidir «está muerto» es una observación de un instante
y no existe un «renombra solo si sigue siendo este inodo». Cinco vueltas de arreglos midieron tres
órdenes distintos y cerraron dos; el tercero queda **declarado** en el código, con su secuencia. Lo
que hace verdad «un solo corredor» es `sigoSiendoDueño()`, que el corredor pregunta **antes de
despachar cada tarea** — no una marca en memoria, y no solo al arrancar. Un `flock` del núcleo no
tendría el problema (el sistema lo suelta al morir el proceso) pero Node no lo expone sin módulo
nativo. Y la cuarentena del cerrojo lleva el **pid** en el nombre: con una ruta compartida, la
limpieza de un proceso se llevaba por delante el cerrojo vivo de otro.

**Gana la persona.** Una tarea NO arranca en un proyecto cuya consola humana está abierta. La
condición es «abierta» y no «hay turno en vuelo» porque solo la primera es estable en el instante de
despachar: con la segunda, una tarea arrancaría y chocaría después. El precio se dice en la pantalla
—una tarea puede esperar a que alguien cierre un proyecto— en vez de corromper un diff en silencio;
sin decirlo, una tarea parada se lee como un cuelgue.

**La tarea abre el proyecto por su PROPIA puerta** (`vestibulo.ts#abrirParaTarea`), que no registra
el proyecto abierto ni muda el sumidero del cable: si reusara `abrirProyecto`, cada tarea que
arrancara le movería la vista al navegador de quien esté trabajando. Las dos puertas montan las
mismas barreras porque **comparten un solo cuerpo de función**, no porque un test las enumere.

**Su consola APARCA en vez de contestar por nadie** (`consolaDeTarea.ts`). El hallazgo que gobernó
el diseño: `consolaWeb.eof()` es `!transporte.conectado()`, así que una consola sin cliente
enganchado rechaza toda aprobación y contesta cadena vacía a todo `preguntar` **sin decir por qué**.
`preguntar` y `leerSecreto` no devuelven `""` —16 de sus 18 llamadores lo leen como «usa el valor por
omisión»—: aparcan y **cortan**. Y el rechazo que sí se usa lleva mensaje propio, sin el «por el
usuario» del `REJECT_MESSAGE` de la librería, que aquí afirmaría un rechazo que nadie hizo; sin
`message`, medido en su propia documentación, el modelo remata el turno como si hubiera escrito.

**La sesión de una tarea se PERSISTE, y su `sesion` sobrevive si y solo si hay algo que una persona
pueda abrir.** Con transcript volcado la conversación se lee desde la barra lateral; sin transcript
—el corte a mitad de turno: checkpoint sí, transcript no— ese id no nombra nada abrible, así que se
olvida el hilo y se limpia el campo. Un id que no lleva a ninguna parte miente igual que un control
sin dato detrás, y además deja 30 MB de checkpoint inalcanzable. Sin aprobación previa, la revisión
POSTERIOR es la única forma de mirar, así que la ref `refs/xonecode/sesion/<id>` deja de ser una
comodidad: es la condición `revisable`.

**Y borrar una sesión que una tarea está usando DECLINA con motivo**, no borra ni resucita. El daño
no era la fila del índice: `olvidarMarcaDeSesion` y `olvidarMemoriaDeHilo` no son condicionales en
ese camino, así que borrar se llevaba la ref de git y el checkpoint de un hilo que el agente sigue
escribiendo.

**El cable de las tareas, y el CABLEADO que se probó aparte.** La cola entera viaja en
`{clase:"tareas"}` —a todos los clientes, y la ráfaga de bienvenida solo al recién llegado— y
las intenciones vuelven en `{clase:"tarea"}`. Dos cosas que no son obvias:
- **`crearTarea` no es una opción suelta**, y no por purismo: resolver el id de proyecto a
  `{id, raiz, nombre}` necesita `proyectos`, `entornoElegido` y `vestibulo.raizDeProyecto`, que
  solo existen dentro del cierre de `montarRutas`. Entran el PUERTO de la cola y el corredor, y
  `montarRutas` construye los manejadores con su propio estado — la misma razón por la que
  `registrarEntorno` devuelve el entorno REGISTRADO en vez de que el llamante deduzca el id.
- **`arrancarConectado` es UNA función con el orden dentro**: conectar el puente al cable y
  LUEGO arrancar el corredor. Como dos llamadas, el orden sería una convención que nada
  comprueba, y en producción el corredor puede reconciliar y disparar `alCambiar` antes de que
  el puente esté puesto. Medido: invertirlo pone tres tests en rojo.
- **Y el `try` alrededor de `alCambiar` no es higiene.** Medido: sin él, una excepción al emitir
  sube al `catch` de `arrancar()`, que llama a `soltarCerrojo()` y **para el corredor entero** —
  todas las tareas de la máquina, no una notificación perdida.

**El patrón de fallo de esta arquitectura, medido NUEVE veces: una composición de producción
viviendo en un cierre que todos los tests doblan.** Los nueve: `backendDeAgente` (el que dejó la
lección escrita), el corredor sin cablear en `arrancarConsolaWeb`, el `escribio` a fuego en la
derivación de `revisionConGit`, la capa de proyecto de `fuentesDelJuez`, el montaje de
`/adjuntos/` con sus ocho saltos, `filaDeTarea` (que salió del cierre de `montarRutas`), el prop
de las pestañas por entorno de Ajustes, `opcionesDeSubagenteExterno`, y —la más clara de todas—
`ConsolaDeProyecto.consumo`. En los nueve la regla podía dejar de estar montada **con todo en
verde**, y en los nueve el remedio fue el mismo: extraer la composición a una función exportada y
probarla contra lo real.

**El campo OPCIONAL es donde este fallo se esconde mejor, y `ConsolaDeProyecto.consumo` lo
enseñó.** Estaba **declarada en el tipo y nunca implementada en el objeto**: como el campo era
opcional, los dos `tsc` quedaron limpios y 2953 tests en verde, y el contador de tokens no se
pintó NUNCA — se vio en la pantalla del usuario, no en un test. Con un campo obligatorio el
compilador habría dicho dónde faltaba; con uno opcional no hay error que leer, y la ausencia
(«no consta») es además un valor legítimo en este dominio, así que el fallo se disfraza de
decisión. Regla práctica: **si una regla de producción se compone dentro de algo que los tests
simulan, esa regla no está probada — está escrita**; y si el cableado de esa regla viaja por un
prop OPCIONAL, hace falta un test propio del cableado, porque `tsc` no lo caza.

**El kanban vive en el escritorio** (`componentes/Kanban.tsx`), con una columna por estado y la de
`requiere-atencion` rotulada **«Esperando feedback»**, que es lo que significa. Cuatro reglas:
- **La tarjeta de esperando feedback no lleva diff ni botón de aprobar.** No es una aprobación
  pendiente: es una pregunta al desarrollador, y se contesta escribiendo. Un modal con un diff
  ahí prometería una decisión que ya se tomó al crear la tarea.
- **Dice lo que la tarea AUTORIZÓ escribir, nunca «escribió»**, y enlaza a Revisión. Sin
  aprobación previa, la revisión posterior es la única forma de mirar, así que el enlace es la
  pieza y no un adorno.
- **Una tarea que no arranca porque su proyecto tiene la consola humana abierta lo DICE.** Sin
  eso se lee como un cuelgue, que es el peor final de una cola.
- **«No ha llegado» no es «no hay tareas»**: si esta ejecución no ejecuta tareas, el servidor no
  manda `tareas` y el panel lo dice en vez de afirmar una cola vacía.
- **Y una tarea creada desde el proceso que NO manda se queda quieta, así que se DICE antes de
  crearla — con TRES frases y no una** (`QuienEjecutaTareas.tsx`, una pieza para las dos vistas,
  la tercera vez que se aplica esa regla). `corriendoAqui` decía ya que este kanban no avanza,
  pero el aviso remataba con «ábrelo desde el proceso que las corre para verlas moverse», y eso
  promete de más por dos motivos:
  - **Crear una tarea aquí no dispara nada allí**: `revisar()` sale en `!miCerrojo` y no hay
    temporizador ni IPC, así que se queda `nuevo` hasta que ESE proceso mire la cola por su
    cuenta (al acabar otra tarea, o al reiniciarlo).
  - **Y «no soy yo» no es «no hay nadie»**, que es la diferencia entre esperar y que no vaya a
    pasar nada: mandar a esperar a un proceso que no existe es peor que un aviso mudo. El
    corredor ya sabe cuál es —`tomarCerrojo` distingue las dos— y lo dice por el cable con
    `ejecutaOtroProceso`, **sin el pid**: es un dato de la máquina y no le dice nada a quien lee.
    Los tres valores salen de lo MEDIDO: `true` si el cerrojo lo tenía otro o si se perdió en
    marcha, `false` si lo tomamos nosotros —y por ahí «nadie» es alcanzable de verdad: el
    arranque de las tareas revienta tras tomarlo y se suelta— y **ausente = no se pudo mirar**,
    donde no se afirma ninguna de las dos. Es la distinción de siempre, sostenida en las cuatro
    capas.
  Lo dicen las dos vistas, y en la del proyecto importa más: ahí vive «Nueva tarea», o sea que
  el aviso llega ANTES de crear la que se va a quedar parada.

**El feedback vuelve al agente como mensaje de USUARIO en el mismo hilo**, que es el camino que
el lazo de reparación del verificador ya recorría — un encargo nuevo perdería todo lo que la
tarea sabe. Cuatro reglas: el feedback es una LISTA y no un campo (varias vueltas, y la segunda
no puede borrar la primera); se marca CONSUMIDO o la vuelta siguiente lo repetiría; un feedback
vacío se rechaza (devolvería la tarea al lazo sin nada nuevo que decirle, el mismo argumento por
el que un título vacío se rechaza en `sesiones.ts`); y **si el hilo ya no se puede reanudar se
DICE** —se manda el encargo entero, el feedback y un aviso explícito— en vez de aparentar una
continuidad que no existe.

**Y una trampa que costó una tarea entera: `abrirParaTarea` tiene que REENVIAR `tarea.sesion`.**
No lo hacía en ninguna de sus tres capas, así que todo reintento abría un hilo en blanco y
«sigue en su hilo» era falso en producción aunque el test superficial pasara. Lo que lo destapó
fue medir que el `.jsonl` de la sesión CRECE con las dos vueltas del turno, en vez de comprobar
que el `thread_id` coincidía.

**Lo que hace una tarea se puede MIRAR en vivo, y `mirar` no es `conectar`** (`transporte.ts`,
`Transporte.mirar`). Los actos de un turno de tarea ya se guardaban en el transcript de SU
sesión —`consolaParaTarea` le pasa la piel de su consola de proyecto, la misma que usa una
persona— y no se filtraban al chat de nadie, porque cada `crearConsolaWeb` tiene su PROPIO
transporte y el de una consola de tarea no tiene sumideros: `abrirParaTarea` no mueve el cable a
propósito. Lo que faltaba era el enganche. Tres decisiones y dos trampas medidas:
- **Es opt-in, de solo lectura, y la vista en vivo ES el transcript.** Nunca se muda el cable
  solo: una tarea que arranca no puede cambiarle la pantalla a quien está trabajando. No hay
  compositor, porque esa consola es de la tarea y una caja de texto ahí prometería una
  conversación que el turno no va a leer —para intervenir está aparcar con feedback—. Y no hay
  log paralelo: se mira el transcript de esa sesión, en vivo mientras corre y guardado cuando
  acaba. Un segundo registro sería otra fuente que puede contradecir a la conversación, la misma
  regla por la que la lista de artefactos «sale de los actos, no del disco».
- **Un mirón no es alguien a quien preguntar**, y por eso `mirar` es un conjunto aparte que no
  toca `hayCliente`. Medido: `conectar` en la consola de una tarea SÍ hace que su `eof()` pase de
  `true` a `false` —y de `eof()` depende que una consola de tarea aparque en vez de esperar—,
  pero resulta inerte porque `crearConsolaDeTarea` declara `interactivo: false` y `eof: () =>
  true` a fuego. Depender de esa inercia sería depender de que otro fichero no se «simplifique»:
  con el conjunto aparte, la propiedad es cierta por construcción y no por coincidencia.
- **Y la trampa de verdad estaba en el otro extremo**: el transporte de una consola de tarea
  emite el `{clase:"turno"}` de los flancos **sin mirar `alCable`** (`vestibulo.ts`), además de
  los actos crudos. Enchufarle el sumidero SSE pelado le habría metido los actos de la tarea en
  el chat de quien trabaja **y le habría apagado el compositor** — justo lo que las tres
  decisiones de arriba existen para evitar, por un camino que no era el que se vigilaba. Se
  cierra con dos listas BLANCAS (una en el transporte y otra en `arranque.ts`): lo que no se
  nombra, no sale.
- **El cable gana identidad de cliente** (`?cliente=` en el SSE y el campo en el mensaje), porque
  el `POST /accion` y el SSE son dos peticiones y solo la segunda tiene sumidero: sin eso no se
  puede desenganchar a UN mirón ni dejar que dos personas miren la misma tarea. Lo genera el
  cliente, es tiempo más azar en texto llano, y **no lleva nada del navegador ni del equipo**; no
  autoriza nada —eso es el token— y en el servidor solo es la clave de un `Map` que nace y muere
  con el SSE. `crypto.randomUUID` se descartó a propósito: exige origen seguro y esto se sirve
  por `http://127.0.0.1`.

**Y abrir la sesión de una tarea EN CURSO se declina**, con el mismo predicado que usa
`borrarSesion` (`esDeUnaTareaEnCurso`): dos consolas sobre el mismo `thread_id` del checkpointer
son dos escritores del mismo hilo. Tres detalles que sostienen la guarda: va **antes** de
`cerrarProyectoAbierto()` —tarde habría cerrado la sesión de la persona para luego negarse a
abrir la otra, dos daños en vez de ninguno—, compara `sesion` **y** `idDeHilo`, que son dos
momentos de la misma conversación y el segundo cubre la ventana anterior al primer volcado, y el
motivo dice **qué sí se puede hacer**: mirarla ahora y abrirla cuando termine. Límite declarado,
el mismo que `borrarSesion`: la guarda solo ve las consolas de ESTE proceso, así que una tarea
que ejecute otro corredor no está en el conjunto — lo pone el sistema operativo, no nosotros.

**Crear una TAREA es la autorización, y la ventana de crear es el único sitio donde eso se
puede decir antes de que ocurra** (`apps/web/src/componentes/NuevaTarea.tsx`,
`agent/tareas/aumentador.ts`, `core/adjuntos.ts`). Una tarea de fondo aplica sus escrituras sin
pedir permiso —§0 del diseño: «la autorización no es un interruptor nuevo, es el acto de
crear la tarea»—, así que aquí no hay un diff que mirar después: hay una frase que hay que
leer ahora, con palabras y arriba. Lo que la sostiene:
- **El encargo se AUGMENTA y se enseña EDITABLE antes de encolar**, y ese paso es lo que
  ocupa el sitio del diff: ejecutar sin nadie delante algo que nadie ha leído es justo lo
  que la aprobación existía para evitar. Entra por puerto (`AumentadorPort`) con papel
  `trabajo` —es redacción, no clasificación— y **su fallo es recuperable por diseño**: si
  no hay modelo, la tarea se encola con el texto original y se DICE. Perder lo que una
  persona acaba de escribir porque un modelo no contestó sería lo peor que puede hacer esa
  ventana. El prompt describe además un trabajo que se hace ENTERO sin volver a preguntar
  y prohíbe redactar un paso de aprobación humana: ese paso ya no existe, y el agente se
  quedaría esperando a alguien que no está. Medido con `gemini-flash` en la consola real:
  el encargo salió con los cuatro apartados y con «si hay ambigüedad, PARAR y preguntar»,
  nunca con un «cuando lo apruebes».
- **El aumentador SÍ tiene doble** (`AumentadorGuionizado`), al revés que el juez: de un
  veredicto del juez depende que una tarea se dé por terminada, y de un encargo no depende
  ninguna afirmación — lo lee una persona y lo edita. Con `--guion` se monta ese doble, y
  su texto lleva `[DOBLE]` porque se enseña para editarlo y después se le manda al agente.
- **El motivo de un fallo se dice con palabras, no con el nombre de la clase.** Era
  `codigoDe(error)`, que para un error escrito a mano devuelve su `name`: la ventana
  enseñaba «No se pudo preparar el encargo (ErrorDelAumentador)». La regla es la de
  `corredorDeTareas.ts#sinRutas` — el MENSAJE si lo escribimos nosotros, el CÓDIGO si lo
  escribió el sistema, porque el de Node lleva la ruta absoluta dentro.
- **Y para un proyecto que no está en el equipo no se crea NADA**, ni se encola: la ventana
  se cambia por el motivo y por la salida a `NuevaSesion`, que es quien descarga y quien
  avisa de que baja el proyecto entero. Encolarla sería ofrecer un camino que no puede
  funcionar —`abrirParaTarea` lanza si la raíz no es un proyecto, así que el corredor la coge,
  la aparca, y `renunciarSiSigueNueva` impide que este proceso la vuelva a coger—, o sea el
  botón muerto de siempre. Pero lo que obligó a quitar el formulario ENTERO y no solo el botón
  es peor que un botón muerto: un formulario usable deja **subir adjuntos**, y eso escribe los
  documentos de una persona en la carpeta de un borrador que ninguna tarea va a nombrar nunca.
  Se ata por AUSENCIA —ni campo de petición, ni «Adjuntar ficheros», ni «Encolar»—, porque un
  test que solo comprobara que el motivo aparece pasaría igual con el formulario debajo. Por lo
  mismo `alAbrirProyecto` es OBLIGATORIO en el tipo: un rechazo sin nada que pulsar es el mismo
  fallo que el rechazo viene a quitar, y pedirlo en el tipo lo hace imposible por construcción
  en vez de recordable. Y la frase de la autorización se pinta solo en la rama donde se
  CONCEDE: no es falsa en la otra, pero compite con lo único que esa pantalla tiene que
  conseguir.
- **Los ADJUNTOS son la misma pieza que `/skills/` y `/artefactos/`**: otra raíz del
  `CompositeBackend`, con la barra final obligatoria y sin crear la carpeta al montar.
  Viven en `~/.xonecode/tareas/<id>/adjuntos/`, o sea fuera del proyecto: no entran en git
  y no suben a CloudStudio sin depender de ninguna exclusión, y una tarea puede crearse
  para un proyecto que nadie ha abierto nunca. Solo se monta si la tarea TRAE adjuntos:
  una raíz vacía sería mandar al agente a mirar donde no hay nada.
- **De solo lectura, y lo deniega `permisosDe` INCONDICIONALMENTE.** Son documentos de una
  persona, material de entrada, no ficheros que reescribir — el mismo argumento que las
  skills. Y la fila no puede ser condicional: medido contra deepagents 1.13.2, sin ella un
  `write_file` a `/adjuntos/x.txt` con la carpeta SIN montar escribe
  `<raiz>/adjuntos/x.txt`, o sea un fichero del proyecto con el nombre de algo que la
  interfaz presenta como «lo que te adjuntaron». Con la fila puesta las dos situaciones
  contestan «permission denied» y el disco no se toca (medido con el backend real y el
  middleware de la librería, no con dobles: la lectura la da el montaje y la denegación el
  middleware, así que probar cada mitad por separado dejaría en verde el día que una deje
  de estar puesta).
- **Montar esa carpeta cruza OCHO saltos, y hay un test por salto.** `abrirParaTarea` →
  `construirConsolaDeProyecto` → `crearEjecutor` → `crearEjecutorReal` → `abrirSesionReal`
  → `construirAgente` → `backendDeAgente`, más la costura de `arranque.ts` que le da al
  vestíbulo lo que el corredor resolvió. Es la clase de cableado que en este plan ha
  dejado NUEVE veces una regla sin montar con todo en verde, y por eso
  `augmentacionCableada` y `contextoDelProyecto` también están extraídas y exportadas en
  vez de vivir en el cierre de `arrancarConsolaWeb`.
- **Montar no basta: hay que DECIR que están** (`core/adjuntos.ts#conAdjuntos`).
  `/adjuntos/` es una raíz virtual que ninguna instrucción del agente nombra, y el encargo
  no sirve para decírselo: lo redacta el aumentador —que puede haber fallado— o lo edita
  quien crea la tarea, y las dos cosas pueden borrar la única mención. Así que el
  inventario se añade al MANDAR el turno, junto a `peticionDeFeedback`, que es el único
  momento en que se sabe qué hay en disco.
- **Y se dice que el agente los LEE y no los VE.** Que mire una imagen de verdad es
  multimodal y está fuera de alcance (§2); prometerlo es la peor clase de mentira aquí,
  porque quien se la cree es el modelo y contestará que ha mirado la captura. Lo dice la
  ventana y lo dice también el aviso que va con el turno.
- **Los bytes suben por `POST /adjunto`**, no por el cable: el SSE lleva JSON. Con su
  propio lector de cuerpo (`leerCuerpoCrudo`), porque el del cable acota a 1 MB y devuelve
  utf8 — las dos cosas equivocadas para un PNG— y porque el tope se corta al LEER y no
  después de acumular. El nombre pasa la misma lista blanca de forma que un artefacto
  (`nombreDeAdjuntoAceptable`), dos veces: en la ruta y dentro del puerto de disco.
- **El cliente CONVIERTE el nombre, no lo valida** (`apps/web/src/nombreDeAdjunto.ts`), y
  esa distinción es lo que hace que no sea una copia peligrosa de la regla: si divergiera,
  la subida falla a la vista con su motivo en la fila del fichero. Y hace falta de verdad
  — medido: una captura de macOS se llama «Screenshot 2026-09-08 at 17.03.12.png», con
  espacios, así que sin conversión el caso más común daría 403.
- **Los bytes llegan a disco ANTES de que la tarea exista**, porque crear la encola y el
  corredor puede arrancarla en el acto. De ahí el id de BORRADOR: lo elige el navegador,
  se sube bajo él, y `crear` lo ADOPTA como id de la tarea. Lo que hace eso seguro son dos
  guardas, la misma pareja en los dos sitios: forma de segmento llano, y **que no sea ya
  una tarea** (409 en la subida; y en `crear` no se crea nada y se DICE — caerse a un id
  nuevo dejaría los adjuntos que la persona acaba de subir colgando de una carpeta que
  ninguna tarea nombra). El `Tarea.adjuntos` se lee del DISCO (`listarAdjuntos`), nunca de
  lo que diga el cliente.
- **Y cancelar con adjuntos ya subidos borra su carpeta**: si no, quedan documentos de una
  persona en `~/.xonecode/tareas/<borrador>/` que nadie va a volver a ver. Es un
  `descartar` sobre un id que no está en el índice, que hace exactamente eso. **Lo que NO
  hay es poda de HUÉRFANOS**, y se declara: un navegador que se cierre entre la subida y el
  «Encolar» —o un «Cancelar» que no llegue— deja hasta el tope de la subida (50 MB) bajo un
  id de borrador que ninguna tarea nombra, y nada lo barre. El camino normal lo limpia; los
  accidentes, no. Es la misma deuda que el checkpointer, que tampoco tiene poda: en este
  repo no hay barrido de nada todavía, así que inventarlo aquí sería empezar por la esquina
  menos costosa.
- **Un enlace simbólico en la cola era un agujero real, y está MEDIDO.** Con
  `~/.xonecode/tareas/<id>` apuntando a otra carpeta, `mkdirSync(…, {recursive:true})` lo
  SIGUE y `guardarAdjunto` escribía fuera de la cola («escribió FUERA? true»). No es
  alcanzable desde el cable —hay que plantar el enlace en un directorio a 0700 del home—
  pero de esa carpeta cuelga además el `/adjuntos/` que ve el agente, así que un enlace
  ahí le daría lectura fuera. La barrera se aplica ahora dos veces, sobre el TEXTO del id
  y sobre el camino REAL, que es la misma regla que `arbolDeProyecto.ts`: lo que falla no
  es el sitio, es el destino. `carpetaDeAdjuntos` devuelve `string | undefined` para que
  quien la monte tenga que decidir por tipo qué hacer con «no se puede».

**Un proyecto puede escribir SIN aprobación, y es la única grieta del fail-closed**
(`core/settings.ts#seAplicaSinAprobacion`, comando `/aprobacion`).
> **SUPERADO el 21-09-2026.** Esto describe el ajuste por RUTA en `settings.json`, que se
> retiró entero: el modo de escritura pasó a vivir en la SESIÓN y con él se levantó la
> condición de CloudStudio. Se deja porque cinco de sus seis condiciones siguen explicando
> por qué la grieta es estrecha, y porque la que se cayó hay que poder leerla para entender
> lo que la sustituyó. Ver «El modo de escritura vive en la sesión», al final del fichero. El caso es real —en un
proyecto offline que el agente crea no hay nadie más— pero la aprobación no está ahí por la
propiedad del repo: está porque XOne ignora en silencio lo desconocido, así que un atributo
inventado no da error sino un bug mudo, y el diff es el único momento en que alguien lo ve
antes de que exista. Por eso se concede con seis condiciones y no con una:
- **La marca vive en `settings.json`, NO en el `config.json` del proyecto.** Es el mismo
  motivo por el que ahí se rechaza `proveedores`: «un `config.json` de proyecto es un fichero
  que puede venir de fuera». Si viajara con la carpeta, quien te pasa un zip decidiría si TÚ
  revisas lo que el agente escribe dentro — y ponerle `modo: "offline"` al lado no arregla
  nada, porque es el mismo fichero. La clave es la ruta absoluta, y renombrar la carpeta
  pierde el ajuste: falla CERRADO, que es la única dirección posible aquí.
- **Offline se comprueba mirando el bloque `cloudstudio`, no el campo `modo`** — y **del
  DISCO, por la raíz** (`configEnDisco.ts#cloudstudioDelProyecto`). Esto último no es
  cosmético: en la consola web `FuentesDeEleccion.proyecto` **no se rellena nunca** (el
  vestíbulo sirve muchos proyectos y las fuentes se construyen una vez al arrancar), así que
  preguntárselo a las fuentes habría dado «offline» para todos, conectados incluidos. Un
  fallo abierto y mudo. Y si el fichero no se puede leer se devuelve algo definido: pedir
  aprobación de más, nunca de menos.
- **Tiene que haber alguien delante.** Auto-aprobar es «el humano que está aquí ha decidido
  no pulsar», no «no hace falta humano»: sin interactivo —`xonecode run` en CI, una tubería—
  no se aplica nada, que es lo que esos caminos hacen hoy. Un ajuste que nadie escribió
  pensando en CI no puede volcar el significado de un código de salida del contrato.
- **Solo el booleano `true`**, en las tres capas. La trampa de siempre.
- **Se pregunta en cada RONDA, no al abrir la sesión** (`sinAprobacion` es una función):
  `/aprobacion` cambia el ajuste sin cerrar la sesión, y un booleano capturado al abrir
  dejaría el cambio sin efecto la mitad de las veces en la dirección peligrosa.
- **Se DICE dos veces, y las dos hacen falta.** Cada turno que aplicó algo saca un aviso de
  honestidad con los NOMBRES de los ficheros —un contador a secas es el aviso que enseña a
  ignorar los avisos—, y el alta lleva `sinAprobacion` para que el chat lo diga arriba antes
  de que pidas nada: la decisión se tomó una vez y quizá hace meses.
No hay interruptor en Ajustes todavía: se pone con `/aprobacion automatica`, que por el
registro de `COMANDOS` funciona igual en el terminal y en la web. Y en un proyecto
conectado el comando lo RECHAZA en vez de guardarlo sin aplicarlo: un ajuste escrito que no
hace nada es peor que no poder ponerlo, porque quien lo puso se cree protegido al revés.

**Un artefacto NO se puede escribir dentro del proyecto, y eso es código**
(`core/artefactos.ts#artefactoFueraDeSitio`, `agent/grafo/proyecto.ts#sinArtefactosEnElProyecto`).
La carpeta buena la nombran los CUATRO sitios que el modelo puede leer —las instrucciones
del `mockup`, la skill `artifacts-builder`, `archify` y la descripción de `write_file`— y aun
así, medido en dos delegaciones CONSECUTIVAS del mismo proyecto con `gemini-flash`: la
primera escribió `/artifacts/login_flow.html` —la raíz, con aprobación humana de por medio— y
la segunda, un minuto después, `/artefactos/diagrama.html`. No falta ninguna instrucción: es
deriva del modelo, y con la instrucción ya en cuatro sitios, añadir un quinto no cambia nada.
Lo que cambia es que la regla deje de depender de que el modelo la recuerde — el mismo
argumento de las vistas aplanadas y de los avisos de honestidad. Cinco reglas:
- **Se mira el PRIMER segmento y nada más**, y eso acota el falso positivo a propósito: un
  `/src/artifacts.js` o un `/scripts/artifacts/util.js` del proyecto pasan sin enterarse. Se
  deniegan la carpeta de la raíz (`artifacts`, `artifact`, sin distinguir mayúsculas — la
  lección de APFS) y el `/artifact.html` suelto que nombra el contrato de `publish_artifact`.
  El precio, dicho: un proyecto que de verdad tuviera un `artifacts/` en su raíz no podría
  escribir ahí con el agente. Se acepta, porque el otro lado del error es un diagrama subido
  a la app del cliente sin que nadie se entere.
- **Solo `write` y `edit`.** Leer un artefacto mal puesto de antes tiene que seguir
  funcionando —si no, el agente no podría ni mirar lo que hay que mover—, y borrarlo es justo
  lo que se quiere poder hacer.
- **El rechazo se DEVUELVE como `{error}`, no se lanza, y ahí está toda la diferencia.**
  Leído en deepagents 1.13.2: los cuatro tools de fichero hacen
  `const result = await backend.write(…); if (result.error) return result.error`, así que un
  error DEVUELTO vuelve al modelo como resultado de la tool y puede reintentar; una excepción
  se sale de la tool y se lleva el turno por delante. Medido en vivo con la primera versión,
  que lanzaba: el mensaje salió impecable en el chat, el fichero no se escribió, y el agente
  NO reintentó porque el turno ya había muerto. **Y con eso cayó `sinVistasAplanadas`, que
  lanzaba igual**: su comentario prometía que así el modelo «corrige a la primera», y era
  falso y no estaba medido. Las dos guardas devuelven ahora `{error}`.
- **La costura con la librería tiene test propio** (`proyecto.test.ts`): se monta
  `createFilesystemMiddleware` de verdad y se comprueba que `write_file` devuelve el motivo
  como CADENA y no lanza. Es un contrato de una dependencia, así que confiar en haber leído
  su código no basta: el día que empiece a lanzar, estas dos reglas se convertirían en «el
  turno revienta» sin que nada chistara.
- **Y el CABLEADO se probó, que era el agujero de verdad**: la composición vivía dentro de
  `construirAgente`, que todos sus tests simulan, así que una regla podía dejar de estar
  montada con todo en verde. Ahora es `backendDeAgente` (`agent/grafo/proyecto.ts`), con test que
  compone el backend real sobre un proyecto temporal y comprueba las cuatro capas: las
  vistas aplanadas, la guarda de artefactos, `/skills/` colgada y `/artefactos/` escribible.
- **Y no sale el modal**, que era el otro lado: el HITL pregunta ANTES que el backend, así
  que una escritura a `/artifacts/` sacaba la ventana de aprobación con el diff entero y
  aprobarla no escribía nada. Un modal cuyo único final posible es un rechazo enseña a
  aprobar sin mirar, que es cómo se rompe la aprobación el día que importa. Lo corta el
  predicado `when` de `InterruptOnConfig` (`agent/grafo/perfiles.ts#seDetieneEn`), que es el
  mecanismo de la propia librería: «returns `true` to interrupt or `false` to auto-approve».
  Tres cosas que lo sostienen:
  - **No relaja la aprobación: no se salta la pregunta para escribir, se salta para NO
    escribir.** La condición es la MISMA función que la guarda del backend
    (`artefactoFueraDeSitio`) sobre la misma cadena, así que no pueden discrepar — y si
    discreparan, una escritura al proyecto pasaría sin que nadie la aprobara, que es el único
    fallo abierto posible por aquí. `perfiles.test.ts` lo ata en vez de confiarlo: para cada
    ruta, no preguntar IMPLICA que la guarda la rechaza.
  - **Ante la duda se pregunta**: sin `file_path`, o con uno que no es cadena, se interrumpe.
  - **Y la costura tiene test propio**, como la de los tools de fichero: se monta
    `humanInTheLoopMiddleware` de verdad y se comprueba que con `/app.xml` llega a llamar a
    `interrupt()` —fuera de un grafo eso lanza, y esa excepción ES la señal— y que con
    `/artifacts/` no. El día que el `when` deje de mirarse, cae por el lado que hay que
    vigilar.

**Los ARTEFACTOS del agente no son ficheros del proyecto** (`core/artefactos.ts`,
`agent/grafo/proyecto.ts#backendConArtefactos`). Un diagrama de `archify`, un panel de
`artifacts-builder`, la captura que el `xone-device-tester` traerá el día que hable con el móvil: son
salidas de la conversación, no código de la app. **Hasta ahora acababan dentro de la app
XOne**, y no por descuido: las dos skills visuales reparten su entrega entre
`renderizar_diagrama` y `publish_artifact`, y en xonecode **no existe ninguna de las dos**
(cero apariciones en `src/`), así que el `mockup` caía siempre en el camino de reserva, que
dice «con `write_file`, entrega el HTML autocontenido» en `/artifacts/<nombre>.html` — o sea
la raíz del proyecto, con aprobación humana, git y subida a CloudStudio detrás. Arreglado y
MEDIDO de punta a punta con el agente real: el `mockup` escribe en
`/artefactos/diagrama_login.html`, no salta ninguna aprobación, el fichero aparece en
`.xonecode/sesiones/<id>/artefactos/` y en el proyecto no queda nada.
- **Es otro MONTAJE, la misma pieza que `/skills/`**: una raíz más en el `CompositeBackend`,
  `/artefactos/` → `.xonecode/sesiones/<id>/artefactos/`. Dos diferencias con las skills: se
  puede ESCRIBIR (las skills son instrucciones, y `permisosDe` las deniega) y se APUNTA lo
  escrito, porque el backend es el único que sabe que la escritura ocurrió y cuánto pesó.
- **La carpeta NO se crea al montar.** Medido: `FilesystemBackend` no exige que su `rootDir`
  exista y el `write` lo crea. Crearla dejaría un `artefactos/` vacío en cada sesión que no
  dibuja nada, que son casi todas.
- **Se escriben SIN aprobación, y por eso se ANUNCIAN.** La aprobación protege el proyecto y
  esto ya no lo toca; pedir permiso para dibujar un diagrama enseña a aprobar sin mirar, que
  es como se rompe la aprobación justo cuando importa. La contrapartida es el evento
  `artefacto` (nombre, tamaño, ruta virtual, nunca el contenido): una escritura que nadie
  aprueba no puede ser además muda.
- **`esRutaDeArtefacto` es una lista BLANCA de forma, no un `startsWith`.** De ella depende
  que esto no sea un camino para escribir en el proyecto sin permiso: cada segmento tiene que
  ser texto llano, lo que deja fuera `..`, `.`, el hueco de un `//`, la barra invertida y un
  `%2e%2e` sin decodificar. Lo que no case pasa por la aprobación de siempre. (Medido aparte:
  un `write` de `/artefactos/../pwn.html` no llega al proyecto —el `virtualMode` de la raíz
  montada lo sujeta— pero devuelve OK sin escribir nada; la barrera no depende de eso.)
- **Una tanda de solo artefactos no gasta ronda de aprobación**, o cinco diagramas cortarían
  el turno con `cortadoPorTope`, cuyo significado —«quedaron escrituras esperando
  aprobación»— sería falso. Tiene su propio tope, y por el mismo motivo que el otro: cada
  pasada es una llamada al modelo y aquí no hay humano que frene el bucle.
- **Se borran con su sesión** (`borrarSesion`), igual que el hilo del checkpointer: si no,
  borrar una conversación dejaría en disco los diagramas que se dibujaron en ella, invisibles
  desde la interfaz.
- **La descripción de la TOOL era el último sitio, y el que ganaba.** Medido: con las skills
  y el prompt del `mockup` ya corregidos, el agente listó las dos carpetas —o sea que el
  montaje estaba— y escribió igual en `/artifacts/`, porque `DESCRIPCIONES_FICHEROS.write_file`
  seguía nombrando esa ruta. Una descripción de tool está más cerca del modelo que un prompt
  de sistema o una skill que hay que cargar; corregir las dos de arriba y no esa no habría
  cambiado nada.
- **En el chat es una TARJETA, no una línea del pulso** (`Chat.tsx`, acto `artefacto`), y por
  eso no se pliega con el trabajo del agente: plegarla escondería lo único que se escribió sin
  aprobar. Dice nombre, peso y DÓNDE — la ruta desde la raíz del proyecto, compuesta con el id
  de la sesión que ya viaja en el alta, y la virtual a secas cuando ese id todavía no existe.
  La ruta de la MÁQUINA no viaja: el cable puede ir por un túnel. En Trazas tiene etiqueta
  propia (`ARTEFACTO`) y no «SISTEMA», porque quien viene ahí depura justo eso.
- Y **ya se ABREN, en su propia pestaña** (`apps/web/src/componentes/Artefactos.tsx`, ruta
  `GET /artefacto?n=<nombre>`, mensaje `artefacto` en las dos direcciones del cable). Lo que
  faltaba no era la pantalla: era la decisión de sandbox, porque pintar un HTML que escribió
  un modelo en el mismo origen que tiene la cookie del token es darle la consola entera —un
  `fetch("/accion")` desde dentro abriría un proyecto o pediría una clave—. Se resuelve con
  DOS capas, y las dos hacen falta:
  - El iframe va `sandbox="allow-scripts"` **sin** `allow-same-origin`, así que el documento
    tiene un origen OPACO. Medido en el navegador: `window.origin === "null"`,
    `document.cookie` **lanza** `SecurityError`, y un `fetch("/accion")` desde dentro lo corta
    el propio navegador («from origin 'null' has been blocked by CORS») antes de salir — y si
    saliera, la comprobación de `Origin` de `servidor.ts` ya lo contesta con 403. Las dos
    mitades del atributo importan: `allow-scripts` es lo que deja correr el Mermaid de un
    diagrama, y `allow-same-origin` al lado anularía el sandbox entero.
  - Y la respuesta lleva `Content-Security-Policy: sandbox allow-scripts`, que cubre lo que el
    atributo NO puede: abrir esa URL en una pestaña del navegador es una navegación de primer
    nivel en el origen real, con la cookie puesta. Las tres medidas de arriba se tomaron
    justamente así, navegando a pelo a `/artefacto`. Más `nosniff` y `no-store`: un artefacto
    se reescribe con el mismo nombre al turno siguiente, y una respuesta cacheada enseñaría el
    dibujo de antes sin decirlo.
  Ocho reglas más, todas por el mismo criterio de siempre:
  - **La ruta tiene que ser HTTP y el nombre va en la QUERY.** Un iframe pinta un DOCUMENTO y
    por el cable viajan mensajes; y `registrarRuta` casa por coincidencia EXACTA, así que
    `/artefacto/<nombre>` no encontraría manejador. Consecuencia asumida: las URLs relativas
    de dentro del HTML no resuelven — el contrato de esas skills es «autocontenido».
  - **No hay CSP de red, a propósito.** Estos artefactos cargan tipografías y Mermaid de un
    CDN porque es lo que sus skills mandan; con origen opaco no hay nada que exfiltrar, así
    que cerrar la red solo los dejaría sin estilo. La contrapartida se DICE en la pantalla:
    sin conexión no se ven enteros.
  - **La sesión la resuelve el servidor, y con `idDeHilo` y no con `sesion`**
    (`vestibulo.ts`). `sesion` espera a que haya entrada en el índice, o sea al FINAL del
    turno, mientras que el acto que anuncia un artefacto se emite a mitad: con ese id el visor
    habría contestado «no existe» justo cuando se acaba de dibujar. El cliente manda un
    NOMBRE, nunca una ruta.
  - **La barrera es `esRutaDeArtefacto`, la misma que decide que escribir ahí no pide
    aprobación**, y se aplica DOS veces: sobre el texto de la query (de balde) y otra sobre el
    `realpath`, que es lo que caza un enlace simbólico dentro de la carpeta apuntando fuera.
    Medido contra el servidor vivo: `../../auth.json`, `%2e%2e/auth.json` y un nombre con
    espacio dan 403; lo que no está, 404; sin `n`, 400.
  - **Dos lectores y no uno** (`agent/grafo/artefactosEnDisco.ts`), porque son dos transportes con
    necesidades opuestas: el del cable devuelve la forma de un fichero del proyecto —texto al
    tope, imagen en base64— y el CRUDO devuelve los bytes tal cual, que es lo que el iframe
    necesita (un HTML recortado no abre) y lo que se descarga. `TOPE_DE_ARTEFACTO` (20 MB) no
    acota lo que el agente puede dibujar: evita leer 800 MB a memoria.
  - **El contenido va por el CABLE con la MISMA forma que un fichero del proyecto**, así que
    los visores son los de Ficheros y no una segunda familia para lo mismo: `Dibujo` (que se
    extrajo a su módulo al tener dos consumidores), `MarkdownText` con `protegerDolares`, y el
    `Visor` de shiki. `html` entró en `lenguajeDe` con esto — sin él la cara «Fuente» salía
    plana y sin números de línea, medido.
  - **La LISTA sale de los actos, no del disco.** Ya traen ruta, nombre, peso y mime, y
    sobreviven a reabrir porque van en el `.jsonl`; preguntarle al disco sería una segunda
    fuente que puede contradecir a la conversación que se lee al lado. Un artefacto reescrito
    aparece una vez y se mueve al final, que es lo que decide cuál se abre solo.
  - **La pestaña solo existe si hay alguno**, y el nombre de la tarjeta del chat es el enlace
    que lleva a ella. Casi ninguna conversación dibuja nada: una pestaña «Artefactos» siempre
    presente sería el control sin dato detrás que este proyecto no se permite en ningún otro
    sitio. Con eso viene una consecuencia que hay que atar: al abrir una sesión sin artefactos
    la pestaña se va de la tira, así que la ELECCIÓN se cae con ella y se vuelve al Chat — sin
    eso el centro seguía enseñando ese panel sin ninguna pestaña marcada. Y un tipo que no
    sabemos enseñar se DICE y se descarga, en vez de adivinarlo.

**Y lo que deepagents DESCARGA fuera del contexto tampoco es del proyecto**
(`core/descargas.ts`, `agent/grafo/proyecto.ts#backendConDescargas`). Cuando la salida de una tool
pasa del tope (`toolTokenLimitBeforeEvict`, 6k aquí) el `FilesystemMiddleware` no la mete en
el hilo: la escribe en `/large_tool_results/<tool_call_id>.txt` y deja en su sitio una
referencia. Lo mismo con un mensaje de usuario enorme, a `/conversation_history/<id>`. Las dos
rutas están **a fuego** en la librería —comprobado en 1.13.2: no hay opción para cambiarlas— y
las escribe llamando al backend DIRECTAMENTE, así que no pasan por ninguna tool: ni HITL, ni
`permissions`. Ninguna estaba montada, así que caían en el `FilesystemBackend` de la raíz:
medido el 10-09-2026 en el AppDemo real del usuario, `large_tool_results/call_866999.txt`
—26 KB, el informe de un subagente— DENTRO de la app XOne y commiteado, y el diff contra la
ref de CloudStudio lo incluía, o sea que el siguiente `/sync subir` se lo llevaba al cliente.
Es la misma forma del problema de `/artifacts/`, y el arreglo es el mismo patrón. Seis reglas:
- **La carpeta se DERIVA de la de artefactos**, al lado, en vez de recibir su propio
  parámetro. Esa carpeta ya lleva dentro la única decisión que hace falta —¿hay sesión con
  IDENTIDAD?—, que `turnoReal.ts` resuelve con `.xonecode/sesiones/<id>/artefactos` en la web
  y `.xonecode/artefactos` en el terminal. Dos parámetros serían dos sitios donde contestar la
  misma pregunta, y el segundo es justo el que se cae en un cableado de ocho saltos.
- **Y de vivir ahí cuelga gratis el borrado**: `borrarSesion` ya borra la carpeta `<id>`
  entera, así que borrar una conversación se lleva sus descargas — lo correcto, por el mismo
  motivo que se lleva su checkpoint: ahí dentro está la salida entera de sus tools.
- **No se anuncia nada de lo que se escriba**, al contrario que `/artefactos/`. Un artefacto
  es una salida para una persona; esto es el andamio del agente, y un evento por cada una
  sería ruido sobre algo que nadie pidió.
- **Y hay guarda en el backend del PROYECTO** (`sinDescargasEnElProyecto`), que con el montaje
  puesto no salta nunca —`CompositeBackend` enruta por prefijo de TEXTO, sin mirar si la
  carpeta destino existe— y ahí está su sentido: el día que el montaje falte, la escritura
  falla CERRADO en vez de acabar en la app del cliente. Misma lección que la fila
  incondicional de `/adjuntos/` en `permisosDe`, medida por el mismo camino. Solo `write` y
  `edit`, y devuelve `{error}` en vez de lanzar.
- **Bajar el tope NO era el arreglo**: el desalojo es la función —evita que una lectura
  accidental se coma la ventana—, el fallo era el sitio.
- **Y en el terminal la carpeta es del PROYECTO, no de un hilo**, así que esos ficheros se
  acumulan entre arranques y nada los poda. Es la misma deuda declarada del checkpointer: en
  este repo no hay barrido de nada todavía.
Comprobado de punta a punta con el agente real sobre un proyecto de pega: dos informes del
`planner` de ~36 KB desalojados, los dos en `.xonecode/large_tool_results/`, y la raíz del
proyecto con solo sus dos ficheros.

**El estilo de un artefacto sale de `artifacts-builder/reference/estilo.md`, y NO de
`theme-factory`** (la skill de Anthropic). Leídos sus diez temas, cada uno son cuatro
hexadecimales, una pareja de fuentes y una frase — y las dos mitades se caen aquí: la
tipografía dice `DejaVu Sans` en los DIEZ, que es la fuente por omisión de los
renderizadores de pptx y pdf y **no está instalada en macOS** (comprobado), así que
aplicarla cambiaría las webfonts reales que el `mockup` ya usa (`Archivo` + IBM Plex,
medido en un artefacto de verdad) por un sans genérico; y del color vale la misma regla que
descartó el índigo de Stitch — de un juego ajeno se toma la forma, y el color es el medido
en `marca.css`. Su flujo tampoco cabe: «enseña el PDF, pregunta y espera confirmación», y
un subagente no tiene con qué preguntar. Lo que sí se hizo, con lo medido al abrir la
pestaña:
- **`estilo.md` ya ERA el tema nuestro** —un bloque de tokens elegido por el usuario, tres
  caracteres y tres reglas duras—, así que se le añadió una CUARTA fila, `xonecode`, con el
  cian `#00a3e0` de `marca.css`, y con dueño: solo si el artefacto habla de la CONSOLA. Para
  el mockup de una pantalla XOne, no — esa app tiene su propio CSS, y pintarla del color del
  harness sería contar otra cosa. El cian sigue siendo ACENTO y no sostiene texto, igual que
  en la consola. Y la Inter de la consola no está en el menú: la prohíbe ese mismo fichero, y
  además sus fuentes empaquetadas **no se pueden cargar** desde un artefacto.
- **Se corrigió la afirmación más cara del `SKILL.md`**, que decía que entregando con
  `write_file` no había sandbox y «`localStorage` no lanza ahí». Con la pestaña abierta es
  falso, y su modo de fallo es SILENCIOSO —página perfecta, diagrama sin dibujar—. Medido
  dentro del iframe: `localStorage`, `sessionStorage` e `indexedDB` lanzan `SecurityError`
  los tres; `cdnjs` y Google Fonts contestan 200; y al ORIGEN de la consola no se llega, así
  que hornear los datos dentro sigue siendo obligatorio aunque aquí no lo imponga ningún
  servidor. Hay test (`agent/skills.test.ts`), y no un comentario: ese fichero es donde el
  modelo mira de verdad — las dos sesiones medidas leyeron `estilo.md` y `diagramas.md`, y
  ninguna leyó el `SKILL.md`.
- **Y esa corrección NO bastó, medido en vivo al probarlo con el agente real.** Con las dos
  skills ya arregladas, un turno nuevo escribió un artefacto con un interruptor de tema:
  `localStorage.getItem` en la última línea de su arranque, `SecurityError` dentro del iframe,
  y con él se fueron el `setAttribute` del tema y el `updateThemeButton` de detrás — el
  diagrama se ve (el HTML ya estaba pintado) y el botón está muerto. El motivo está en las
  trazas: ese turno leyó `archify/SKILL.md` y `reference/diagramas.md`, y **ni el `SKILL.md`
  ni `estilo.md`** — así que se saltó además la paleta entera. Por eso la regla subió a
  `SKILLS_VISUALES` (`agent/subagentes/agentesEnDisco.ts`), que va en el prompt de los cuatro
  especialistas SIEMPRE y no depende de cargar nada: es la misma lección que la carpeta
  `/artefactos/`, y llega a quien ya arrancó porque la siembra compara por hash
  (`.semilla.json`). Queda una alternativa de más calado sin hacer, y es decisión de
  producto: **servir los artefactos desde OTRO origen** —un puerto sin nada detrás— permitiría
  darles `allow-same-origin` sin regalar nada, y la clase entera de fallo desaparecería. Toca
  la regla de «loopback y nada más».

**El hilo del agente SOBREVIVE al proceso** (`agent/sesiones/checkpointer.ts`,
`.xonecode/checkpoint.sqlite`). Era un `MemorySaver`, así que reabrir una conversación era
releerla: el texto a la vista y el modelo sin recordar una palabra, con la marca `historica`
diciéndolo. Ahora es el `SqliteSaver` oficial de LangGraph
(`@langchain/langgraph-checkpoint-sqlite`), y está MEDIDO de punta a punta: sesión reabierta
tras reiniciar el servidor, «¿cómo se llamaba la colección que te pedí crear?» contestada en
1,7 s, sin una sola tool y con los tres nombres de fichero correctos. Siete reglas:
- **Uno por PROYECTO, particionado por `thread_id`**, no uno por sesión: es la forma que la
  librería asume (`deleteThread(threadId)` existe para eso) y evita tantos ficheros y tantas
  conexiones como conversaciones guardadas.
- **El `thread_id` ES el id de la sesión.** Sin esa igualdad no hay nada que reanudar: al
  reabrir hay que preguntar por la misma cadena con la que se escribió. Por eso el id se
  decide al ABRIR (`vestibulo.ts`, `sesion ?? randomUUID()`) y no en el primer volcado — lo
  que sigue siendo perezoso es la ENTRADA del índice, que es lo que ensuciaría la barra con
  sesiones vacías.
- **`historica` pasó de suposición a hecho comprobado**: se le PREGUNTA al checkpointer
  (`hayCheckpoint`, puerto `hayMemoriaDeHilo`). Las que siguen marcadas son las de antes de
  que esto existiera y aquellas cuyo primer turno nunca corrió — comprobado en el navegador:
  la sesión de ayer sigue enseñando el aviso, la de hoy no.
- **Se crea con el modo puesto, ANTES de abrirlo.** Medido: SQLite crea el fichero ya en
  `fromConnString` y con 0644, así que un `chmod` de después deja una ventana con el
  checkpoint legible — y un checkpoint lleva la lista de mensajes ENTERA, contenido de
  ficheros y argumentos de tool incluidos, que es justo lo que el transcript de `sesiones.ts`
  no puede llevar por construcción. Con el fichero pre-creado a 0600, los `-wal` y `-shm` que
  SQLite añade heredan ese modo (comprobado sobre un proyecto real).
- **La fábrica devuelve la MISMA conexión por proyecto.** `arranque.ts` la llama en cada
  reapertura y en cada borrado; sin caché, cada llamada abriría un handle que nadie cierra, y
  borrar un hilo con su sesión viva serían dos escritores sobre el mismo fichero.
- **Borrar una sesión olvida su hilo** (`olvidarHilo` → `deleteThread`). Sin eso, la memoria
  entera de la conversación borrada —con el contenido de lo que se escribió en ella— seguiría
  viva en el fichero del proyecto para siempre e invisible desde la interfaz.
- **La consola de TERMINAL no lo usa, a propósito.** Su hilo es un uuid nuevo en cada arranque
  y no hay índice donde reanudarlo: persistirlo solo dejaría hilos irreabribles engordando el
  fichero. Persistir es de quien tiene identidad que reanudar.
Y dos cosas que hay que saber: **una aprobación que quedó sin contestar se vuelve a
PREGUNTAR** —medido con un grafo mínimo sobre este mismo saver: el estado guardado trae
`next` y un `pendingWrites` con el `__interrupt__`— **pero no sola**: la primera medida usó
un grafo de un nodo, donde `START` va al nodo interrumpido, y ahí reejecutar y volver a
preguntar es inofensivo. El grafo del agente no tiene esa forma: `START` va al MODELO y el
nodo parado es el de tools, así que al modelo le llegaba `human → ai(tool_calls) → human` —un
`AIMessage` con llamadas y ningún `ToolMessage` detrás, que Gemini y OpenAI rechazan con un
400—. Por eso `abrirSesionReal` SALDA las llamadas colgadas al abrir
(`saldarAprobacionesHuerfanas`): una respuesta sintética por cada una diciendo la verdad —no
se aplicó, la sesión se cerró antes de que nadie decidiera, y el `interrupt` pausa ANTES de
escribir, así que el disco no se tocó—. Con eso el historial es válido y además honesto.
Segundo: **esto CRECE**: una sesión de cinco turnos deja 370 checkpoints y 30 MB, porque cada
superpaso guarda el estado entero. Por lo mismo, `.xonecode` se saca del índice privado con
el que `instantanea.ts` y `sesionGit.ts` fotografían el árbol (`sacarXonecodeDelIndice`): en
un proyecto CLOUD ya estaba excluida, pero en uno OFFLINE nadie escribió ese `info/exclude` y
cada foto habría metido esos 30 MB en `.git/objects`, vivos para siempre porque las refs
`refs/xonecode/sesion/*` los alcanzan.
No hay poda todavía. Consecuencia directa: **`/nuevo` en la web abre un hilo huérfano** —el de
la sesión es su id, así que al reabrirla se vuelve al anterior— y el comando lo DICE en su
salida; quien quiera empezar de cero y poder volver, abre una sesión nueva.

**Cada sesión de la barra tiene su «…»** (`apps/web/src/componentes/MenuDeSesion.tsx`,
`AccionDeSesion.tsx`, `clase: "sesionAccion"`), con **dos** entradas y no las cuatro del
harness de deepseek. Su `SessionNodeItem` ofrece renombrar, bifurcar y archivar; las otras
dos no están, y por motivos distintos: **bifurcar** no está IMPLEMENTADA —su motivo viejo
(«no hay hilo que bifurcar, el `MemorySaver` muere con el proceso») caducó con el
checkpointer, así que copiar el hilo bajo otro id sí significaría algo hoy; dejar el motivo
viejo puesto sería usarlo de excusa—, y **archivar** es un estado que habría que inventar
entero —campo en el índice, filtro en la barra, sitio
donde ver lo archivado— para que el botón significara algo; mientras no exista, «archivar»
sería «desaparecer», o sea borrar sin decirlo. Cuatro cosas que no son negociables:
- **La barra REPORTA la intención; no ejecuta.** Las dos escriben en el índice del proyecto
  y una es irreversible, así que las confirma una ventana de `App.tsx` — no cabe en una
  columna de 280 px, y eliminar al primer clic en una fila de 34 px es cómo se pierde la
  conversación de una tarde.
- **Al borrar la sesión ABIERTA se cierra ANTES de borrar** (`vestibulo.ts#borrarSesion`).
  `cerrar()` llama a `volcar()`, que anota los actos pendientes y con ello RESUCITA la
  entrada del índice recién borrada: al revés, la sesión reaparecía en la barra al siguiente
  refresco como si el botón no hubiera hecho nada. Y se lleva su ref de git
  (`olvidarSesion`, que hasta ahora no tenía ningún llamador): una ref viva mantiene su árbol
  vivo para siempre.
- **El título automático es la primera frase, entera** (`sesiones.ts#tituloDesde`): era
  `slice(0, 80)` del primer mensaje y daba «Escribe literalmente esta frase, sin cambiar
  nada: «en XOne se usa $http para pe». Sin llamar a ningún modelo: primera frase o línea,
  sin la comilla de apertura, cortada en palabra entera a 60 con puntos suspensivos.
- **Un título vacío se rechaza** (`sesiones.ts#renombrarSesion`). No es validación de
  formulario: `anotarActo` fija el título en el primer acto de usuario y solo mientras esté
  vacío, así que dejarlo en blanco devolvería la sesión al régimen automático y el siguiente
  turno la rebautizaría con la primera frase, borrando en silencio el nombre que puso una
  persona. Por lo mismo, el título de la CABECERA sale del índice y solo cae al primer acto
  de usuario como respaldo: si no, renombrar dejaba dos nombres para una sesión.
- **El «…» se queda en la maqueta y lo que cambia es la opacidad** (`Barra.module.css`).
  La hoja copiada lo esconde con `display: none` hasta `:hover`, y un elemento en
  `display: none` no es enfocable: el Tab lo salta y el control no existe para el teclado.
  Es el mismo cuidado que `Maqueta.tsx` documenta al plegar la barra, en el otro sentido.
  El lazo de «pinchar fuera cierra» está en `apps/web/src/cerrarAlPulsarFuera.ts` desde que
  hubo un segundo menú; copiarlo habría sido la tercera versión del mismo `mousedown`.

**La caja del compositor va en COLUMNA, y el sitio del dispositivo se decidió mirando la
pantalla** (`componentes/Compositor.module.css`, `componentes/Compositor.tsx`). Tres decisiones,
y las tres salieron del NAVEGADOR y no del suite —`capturas/` está en el `.gitignore`
precisamente para eso—:
- **El texto arriba a todo el ancho y los controles debajo.** Antes el campo compartía fila con
  las pastillas, y con la ventana estrecha se quedaba en un canal de dos líneas: el sitio donde
  se escribe era lo primero que se quedaba sin sitio. El `padding` vertical del campo tenía
  sentido en esa fila compartida; en columna dejaba 16 px de aire muerto. Y el
  `justify-content: space-between` de los controles desperdigaba las pastillas en cuanto
  dejaron de compartir renglón con el campo: ahora el hueco lo come UN `margin-left: auto`, el
  del bloque que agrupa el gasto y el botón, así que las pastillas quedan juntas en los dos
  casos.
- **Y «uno» es la parte que importa, porque aquí el fichero decía una cosa que flexbox no
  hace.** Decía que el hueco «se lo come el primer `margin-left: auto` que encuentre, el del
  contador si está y el del botón si no». No es así: **los márgenes automáticos se REPARTEN el
  hueco libre**, así que con los dos puestos —el contador llevaba el suyo y el botón también—
  el contador se quedaba flotando en mitad de la fila en vez de junto al botón. MEDIDO en
  pantalla, con la ventana a 1512: **194 px de vacío a su izquierda y otros 194 a su derecha**.
  La causa era mecánica y el síntoma se leía como un problema de color, que es lo que el ojo
  dijo primero («no tienen color, no destacan»); el color se arregló después, y era el segundo
  problema. Lo cazó mirar la pantalla, no el suite: jsdom no hace layout, así que las dos
  posiciones dan el mismo `textContent` y el mismo DOM.
- **Y el botón de enviar lo protege ENVOLVER, no un umbral.** La fila no envolvía, así que con
  la ventana estrecha el contador y el botón se salían de la tarjeta: medido a 700 de ventana,
  **31 px de desborde y el botón de enviar CORTADO** —la acción de la fila, invisible—.
  `flex-wrap: wrap` en `.controles` (arregla 700 y 560) y también en `.acciones` (arregla por
  debajo de 480); comprobado a 1512, 900, 700, 620, 560, 480, 420 y 380, el botón queda dentro
  en todos. La consulta de contenedor del gasto solo decide a partir de qué ancho la pastilla
  no vale el renglón que se lleva —medido: a 560 la fila mide 180 y sí cabe; a 480 mide 132 y
  se retira; las dos piezas ocupan 113 + 8 + 32 = 153, y el 170 del umbral deja 17 px de aire
  para una cifra algo más larga—. Es la diferencia entre una red de seguridad, que no puede
  fallar, y un umbral, que mide una cosa y decide sobre otra.
- **El gasto es una pastilla con color propio, y no el gris del sitio.** El par del chip es
  `state-business-tertiary` de fondo con `state-business-primary` de letra —el MISMO que ya
  usaba la pastilla de «compartido»—, con las cifras en negrita: un par ya establecido en esta
  interfaz para «dato que no es un control», que es exactamente lo que esto es. Un chip gris se
  midió invisible, y `bg-layer-2` no sirve de fondo aquí porque en el tema claro es blanco
  sobre blanco —el mismo defecto que ya se había documentado para la burbuja del usuario—. El
  cian no entra: es ACENTO y no sostiene texto, y el azul de marca ya es del botón que está a 8
  px, así que usarlo aquí sería competir con la acción de la fila.
- **El dispositivo estuvo ARRIBA en una fila de chips y volvió abajo.** Seguía la maqueta, y la
  maqueta se equivocaba: un chip solo no era una fila, era un renglón —una fila de un elemento
  no se lee como agrupación, se lee como un control suelto—. Los dos arreglos de esa tanda los
  vio el ojo y no el suite, que es el motivo de que la comprobación esté declarada como visual.
- **Y no hay chip de «Contexto» aunque la maqueta lo pinte.** Ese concepto no existe en
  xonecode, y lo más parecido —el proyecto— ya se lee en la miga: pintarlo dos veces es la
  misma duplicación que ya se quitó de las marcas de «trabajando».

**El botón de enviar lleva el azul de la marca y no el cian, y la razón es que el cian no
sostiene texto** (`--xonecode-azul` con `--xonecode-sobre-azul`; el cian queda para su `hover`,
donde puede brillar sin sostener nada). El par azul/sobre-azul es el MISMO que ya usa la barra
superior, donde estaba medido que sostiene texto blanco; el cian de XOne es un color de ACENTO
y no una superficie para letra. Las pastillas llevan filo cian y el baño de las filas de la
barra (`--xonecode-fila-hover` en reposo, `--xonecode-fila-elegida` al pasar por encima), y la
razón de reusar esos dos tokens es que **ya vienen ajustados por tema** —7 %/13 % y 14 %/26 %—:
inventar un cian translúcido con un porcentaje fijo daría algo invisible en un tema y gritón en
el otro, que es la forma en la que un color escrito a mano se rompe en el tema que nadie probó.
Suaves a propósito: el que se pulsa es el botón. Pero **su texto NO** sale de tokens de marca:
los de marca no se redefinen por tema y `--xonecode-azul` sobre el fondo de noche sería
ilegible, así que la letra sigue saliendo de los `--dsw-alias-*`, que sí cambian. PARAR se queda
ROJO —es un estado, no la marca— y hay que repetir su `hover` porque el mismo botón lleva las
dos clases; y apagado no lleva color de marca, porque un botón inerte pintado de azul invita a
pulsarlo.

**Y de una maqueta ajena se toma la FORMA, nunca el color.** Es la lección de los ocho mockups
de Stitch de la consola web: sus paletas se contradecían entre ellas y solo una declaraba el
cian de XOne, así que copiar colores de la que estuviera abierta habría metido un segundo
criterio de marca en el mismo producto. La forma —dónde va cada pieza y qué agrupa a qué— sí se
copia, y es de donde salieron la columna del compositor y la vuelta del dispositivo abajo.

**El entorno ACTIVO lo dice el servidor** (`alta.entornoActivo`), y el desplegable de la
barra lo cambia de verdad (`clase: "entorno"`, `accion: "activo"`): traer los proyectos del
otro entorno es una conexión con CloudStudio, así que la hace el servidor y contesta con la
lista nueva. Si esa conexión falla, `entornoElegido` **no se toca** y se sigue enseñando lo
del entorno anterior con el aviso puesto — dejar los proyectos del viejo bajo el nombre del
nuevo sería la peor mentira posible en esa barra. Antes el cliente asumía «el primero
registrado», que se rompía en cuanto había dos.

**Empezar a trabajar en un proyecto pasa por una VENTANA** (`NuevaSesion.tsx`), y el «+» de
la fila y el nombre del proyecto abren la misma: es la misma decisión, y tener dos caminos
para ella es lo que hacía que uno de los dos no hiciera nada. La ventana distingue los dos
estados por un dato del servidor (`proyectos[].local`, que es si existe su
`.xonecode/config.json`) y no adivinando: con copia local NO hay ventana —se abre y ya, porque la ventana existe para no descargar por accidente y ahí no se descarga nada—; sin ella, se pide
la rama ORIGEN y **se dice que va a descargar el proyecto entero**. Con una sola rama se
preselecciona pero se ENSEÑA — antes se mandaba sola desde un efecto, y elegir por el
usuario y callarlo es cómo se acaba trabajando sobre la rama equivocada. Y no empieza sola:
pulsar «+» por error costaba una descarga.

**Los iconos: los de PROVEEDOR son copiados y monocromos; los de MARCA, los del usuario y
a color** (`componentes/IconoDeProveedor.tsx`, `componentes/IconoDeEntorno.tsx`,
`apps/web/public/iconos/xonecode.png`). Nada se trae de un CDN: esta consola escucha en
loopback y declara un modo `offline` de primera clase, el mismo motivo por el que las
tipografías van empaquetadas. Cuatro reglas:
- **Un icono solo se pinta donde hay DATO detrás.** El logo del proveedor sale de su id; la
  marca del entorno, de `Entorno.id` —que `identidadDeEntorno` deduce de la URL—, así que un
  WebStudio se pinta como WebStudio y un on-premise lleva la marca XOne SIN glifo de
  producto: es lo único que se puede afirmar de él. De los siete `.svg` del juego de marca
  se usan tres; `XOne MDM`, `XOneNFC` y los demás son productos que esta consola no modela
  en ninguna parte, y pintarlos sería decoración con forma de dato — la misma regla por la
  que el escritorio no pinta el «Build & Run» del mockup.
- **Los de proveedor van MONOCROMOS y heredando el color** (`fill="currentColor"`, variante
  mono de `@lobehub/icons-static-svg@1.95.0`, MIT, trazados copiados y no una dependencia de
  2,3 MB para nueve iconos): son ocho en una lista, y ahí el color de marca es ruido —
  heredando, además, el claro/oscuro sale solo. Los de entorno van a COLOR: son pocos, y en
  ellos el color ES la identidad.
- **Las clases `.cls-N` de Illustrator se convirtieron en atributos `fill`.** Son globales, y
  los tres ficheros usan los mismos nombres con colores distintos: inline en la misma página
  se pisarían. Y se les quitó el `<rect>` blanco de fondo — una marca no trae su propio
  cuadrado, y sobre el azul de la barra se vería.
- **El símbolo de la barra superior va sobre una placa clara.** Medido: el icono lleva cian
  y azul marino, y ese azul marino sobre la barra azul profunda desaparecía — la marca se
  quedaba en un anillo partido, sin la mitad de su forma. La placa es el blanco sobre el que
  está dibujado (`--xonecode-sobre-azul`), no un filtro que recolorea el arte. El fichero es
  UNO y se sirve desde `public/`: el favicon de `index.html` y la marca apuntan a la misma
  ruta, porque dos copias de un logo acaban siendo dos logos.

**La paleta de xonecode vive en UN sitio** (`apps/web/estilos/marca.css`, nuestra, como
`tipografia.css` y `splash.css`). El cliente se pinta con los alias `--dsw-alias-*` de la
paleta COPIADA de deepseek, cuyos acentos son los suyos; `marca.css` redefine los tres que
llevan el acento —el relleno del botón primario, su hover y el acento del elemento activo de
la barra— y con eso la aplicación entera cambia de color sin tocar un solo `.module.css`.
`--dsw-alias-brand-primary` NO se toca aunque el fill herede de él: de ahí cuelgan también
textos sobre fondo claro, y el cian sobre blanco no tiene contraste para texto. Los valores
son los MEDIDOS del diseño del usuario (`docs/DISENO-DASHBOARD.md`), y la escala `brand`
índigo que Stitch mete por omisión se descarta entera: competía con el cian en la misma
pantalla. `splash.css` consume esos tokens en vez de repetir el cian — dos ficheros con el
mismo color escrito a mano es como se acaba con dos cianes distintos. Este fichero y
`splash.css` son las únicas excepciones declaradas a «ningún color literal»
(`Barra.test.tsx`): esa disciplina es sobre lo que se pinta CON la paleta, no sobre la
paleta. **La barra superior** (`Cabecera.module.css`) es la única superficie de marca —azul
profundo, pestaña activa en cian—, y se pinta con una clase NUESTRA encima de la copiada, con
el selector repetido (`.barraSuperior.barraSuperior`) para ganar especificidad sin depender
del orden en que el empaquetador coloque las hojas.

**El rediseño de estilo, y las dos restas que salieron de él** (`docs/REDISENO-STITCH.md`,
ocho pantallas ancladas en `docs/diseno/*-rediseno-stitch.*`). Lo primero que hay que saber
es que **las paletas de los ocho mockups se contradicen entre ellas**: leídos sus ocho
`tailwind.config`, salen OCHO fondos oscuros distintos y **una sola pantalla declara el cian
de XOne** —seis usan un `sky`/`cyan` de Tailwind y la octava no declara acento—. Así que de
ahí se toma la TIPOGRAFÍA y la forma, y el color sigue siendo el medido en `marca.css`. Es la misma regla con que la primera tanda descartó su índigo.
- **Inter y JetBrains Mono van EMPAQUETADAS** (`@fontsource-variable/*` en `main.tsx`), no
  desde `fonts.googleapis.com`: esta consola escucha en loopback y tiene un modo `offline`
  de primera clase, y una hoja de CDN la dejaría sin su letra justo en el caso que el
  producto declara soportar. Se aplican sobre los tokens en `estilos/tipografia.css`, no en
  cada selector — y el mono marca **dato de máquina** (URLs, etiquetas de estado, rutas),
  nunca prosa: por eso la URL de un entorno tiene clase propia en Ajustes en vez de heredar
  el `.detalle` que comparte hueco con dos textos que sí son frases.
- **El primario casi negro del diseño es el del PROPIO tema copiado**:
  `--dsw-alias-brand-primary` es `rgb(15, 17, 21)` en claro y `rgb(249, 250, 251)` en oscuro.
  Aplicarlo fue QUITAR el puente que `marca.css` tenía secuestrado en cian, no escribir un
  literal, y con eso el modo oscuro se resuelve solo. El cian se queda de ACENTO, que es
  donde no tiene que sostener ninguna letra. **La trampa**: cuatro sitios pintaban acento
  leyendo `--dsw-alias-button-primary-fill` —cian de rebote, por el puente— y al quitarlo se
  volvieron negros (el filo del proyecto y la sesión activos, el del fichero elegido y el
  marcador del paso en curso). Los cuatro apuntan ahora a `--xonecode-cian` por su nombre.
  Nada daba error: solo se veía.
- **La barra superior cruza las dos columnas** y la marca vive dentro. Es un ítem del grid
  con `grid-column: 1 / -1` y no un envoltorio por fuera —`.frame` ya es quien mide la
  pantalla y anima sus pistas—, y la fila de abajo va con `minmax(0, 1fr)` y no `1fr`, que
  tiene suelo `auto` y estiraba el grid por debajo de la pantalla en vez de dejar scrollear.
  `Maqueta.test.tsx` vigila las dos filas y que la cabecera vaya la PRIMERA en el DOM, que
  es el orden del Tab.

**La barra superior es de la APLICACIÓN, no de la sesión**, así que se pinta también en el
escritorio — con la marca, el estado del cable y el botón de plegar. Y por esa misma regla
**las pestañas ya no están en ella** (`Pestanas.tsx`, tercera casa que tienen: estuvieron en
`Transcript` y luego en `Cabecera`): Chat, Trayectoria y Ficheros solo existen con sesión
abierta y solo cambian lo que se ve en el centro, así que son del CENTRO. Puestas arriba, y
desde que la barra cruza las dos columnas, quedaban además centradas sobre la barra lateral
— señalando a una columna que no cambian. La mudanza se llevó consigo tres reglas de
`Cabecera.module.css` que las pintaban sobre el azul; abajo caen sobre la superficie clara
para la que la hoja copiada las diseñó y solo hace falta el acento cian de la elegida.
`Pestanas.test.tsx` vigila que esas reglas no vuelvan a colarse arriba, que es CSS muerto que
nadie ve fallar.

**El compositor solo está en el Chat, y recupera el foco al terminar el turno**
(`Compositor.tsx`). Dos cosas distintas que llegaron juntas:
- En **Trazas** y en **Ficheros** no hay a quién escribirle —son un registro y un diff—, así
  que la caja se va. Se OCULTA y no se desmonta: desmontada se pierde el borrador a medio
  escribir en cuanto miras un fichero y vuelves. Y con `hidden`, no con `visibility`, porque
  hace falta que además salga del orden del Tab y del árbol de accesibilidad — un campo
  invisible al que se llega tabulando es peor que uno visible. La regla `[hidden]` se escribe
  igualmente en la hoja aunque el navegador ya la dé por omisión: esa omisión la pisa
  cualquier `display` que se le ponga después a `.envoltura`, y el atributo se quedaría mudo.
- **El foco vuelve solo.** La caja se APAGA mientras el agente trabaja, y un elemento que se
  deshabilita pierde el foco: el navegador se lo devuelve al `<body>`. Así que quien mandaba
  una petición y esperaba, al terminar se encontraba con que teclear no escribía en ningún
  sitio. Se devuelve en el flanco de BAJADA de `turnoEnVuelo` y solo si la caja está a la
  vista: robarlo al montar, o mientras se mira un diff, sería lo contrario de lo que se
  quiere.

**«Trayectoria» ahora es «Trazas»** (`Trazas.tsx`), y no es solo la etiqueta: el nombre lo
pidió el usuario con su encargo detrás — esa pestaña es para desarrollar el HARNESS, no para
trabajar en una app XOne. Quien escribe una colección mira el chat y los ficheros; quien
viene aquí está depurando qué hizo el agente y en qué orden. Que el destinatario sea otro es
también lo que le permite ser densa a propósito.

**Y la vista es la de deepseek, MENOS lo que su cable lleva y el nuestro no.** La anatomía de
fila es la suya (`packages/client/ui-trajectory/.../TrajectoryCell.module.css`, MIT):
`#índice · [ETIQUETA de color] · texto · tiempo`, con turnos agrupados y plegables,
buscador y panel de detalle. Lo que **no** se copia, y es justo lo que hace que la suya
parezca más detallada, son tres de sus cinco pestañas de detalle: **Payload, Result y
Schema** son los argumentos y la salida ENTEROS de cada tool. Aquí eso no puede pasar por
TIPO —`write_file` lleva el fichero y una tool MCP lleva el bearer—, así que el panel tiene
DOS pestañas y no cinco: no están sin hacer, es que no hay con qué llenarlas sin romper la
regla. Cuatro decisiones más, todas por lo mismo:
- **El turno empieza en el acto de USUARIO**, no en el `fin`: un turno que revienta no
  siempre deja `fin` —el mismo motivo por el que el compositor no deduce de ahí si hay turno
  en vuelo—, así que abrir por la petición es lo robusto. Lo que llega antes de la primera
  cae en el turno 0, que se rotula «Antes del primer turno»: llamarlo «Turno 1» le
  inventaría dueño.
- **El total del turno es el `ms` del `fin`**, nunca la suma de las fases: no cubren el turno
  entero, y sumarlas daría una cifra que no es ningún tiempo real. Sin `fin`, no se afirma.
- **El tiempo por fila solo donde lo hay** (`fase` y `fin`). Un «0 ms» en las demás sería una
  cifra inventada, y el panel prefiere decir por qué no la tiene.
- **El buscador mira el texto COMPLETO y no el recortado.** La tabla corta a 200 caracteres;
  filtrar por lo que se ve haría que una palabra más allá de ese corte no se encontrara
  nunca — el buscador mentiría justo en las filas largas, que son las que se vienen a buscar.
  Por eso la fila guarda `texto` (recortado, para la tabla) y `completo` (para buscar y para
  el panel).

**Y los actos ya NO aplanan lo que los eventos distinguen.** El acto de `herramientas` lleva
`detalles`, en paralelo a `lineas` (misma longitud, mismo orden), con el NOMBRE de la tool y
su error; el de `fase` lleva la categoría del enum además de su texto. No expone ni un byte
nuevo —`detalle` sigue sin viajar, y el nombre ya iba dentro de la propia línea—, y con eso
la etiqueta dice `read_file` en vez de «TOOL», la llamada que falló va en rojo y la fase dice
«VERIFICANDO». Cinco cosas que sostienen esto:
- **El canal es `Piel.linea(texto, detalle?)`, con el segundo parámetro OPCIONAL**, y no un
  método nuevo. Una piel que implemente `linea(texto)` lo ignora sin enterarse, así que
  stdio y la TUI no cambian y la tubería sigue byte-idéntica — el mismo trato que `fase?` y
  `razonamiento?`, pero sin partir el canal en dos.
- **Las líneas del colapsador dejan de ser cadenas sueltas** (`core/notify.ts#LineaDeTool`):
  cada una dice de qué tool habla. Hacía falta porque `→ lee` no contiene `read_file` en
  ninguna parte, y deducirlo del icono sería reconstruir a mano el mapa de `ICONO`/`VERBO`
  con la garantía de que las dos copias divergen. Y **el nombre de una línea de CIERRE es el
  de la racha que se cierra, no el del evento que la provocó**: es justo el caso que un
  `piel.tool(evento)` ingenuo habría etiquetado mal — el `glob` que cierra tres `read_file`
  produce dos líneas y la primera es de las lecturas.
- **`conLlamadaDeTool` fusiona las DOS listas a la vez** (`core/actos.ts`). Aplicar la regla
  por separado es cómo se desincronizan: la sustitución del cierre de una racha quita un
  elemento de una lista y no de la otra, y a partir de ahí cada línea lleva el detalle de su
  vecina. Una sola función que devuelva las dos lo hace imposible por construcción.
- **Un detalle VACÍO significa «esta línea no es de una tool»**, y se guarda igual en vez de
  dejar un hueco. Por `linea` pasan también el plan, las tareas y la verificación
  (`turno.ts` las escribe con el mismo `escribirLinea`), que se etiquetaban «TOOL» y no lo
  eran: ahora se dicen «PASO». Un array con agujeros y otro sin ellos es cómo se desalinean.
- **Ausente y vacío no son lo mismo, y es la trampa de este cambio.** Las sesiones guardadas
  antes no traen `detalles` —`reabrirSesion` hace `JSON.parse` a pelo, así que llegan sin el
  campo—, y ausente es «no se sabe», no «ninguna vino de una tool». Tratarlo como vacío
  habría marcado como pasos del motor todas las herramientas de todo lo anterior; con el
  campo ausente se conserva la etiqueta genérica de siempre. Hay test.

**La barra lateral se pliega**, y el botón vive en la barra superior y no dentro de ella
—donde lo pone el mockup— por una razón práctica: plegada, la barra no está, así que su
propio botón se habría ido con ella. Al plegarse se DESMONTA (la columna del grid se va a
cero); no se esconde con `visibility`, porque una barra invisible sigue siendo tabulable y se
llega con el teclado a botones que no se ven. La preferencia se recuerda en `localStorage`
(`apps/web/src/preferencias.ts`), no en el servidor: es de ESTE navegador, como la
apariencia, y con el mismo `try` alrededor de cada acceso porque en una ventana privada el
accesor lanza.

**Y se REDIMENSIONA** (`Maqueta.tsx`, el `separator` del grid). Pedido así: «podría ser un
splitter o al menos ser más ancha», y son las dos cosas — la omisión sube de 280 a 320,
porque en 280 el nombre de un proyecto real no cabe («PlaemerWebTe…», medido en su
pantalla), y a partir de ahí el ancho lo elige quien mira. **La geometría del tirador ya
estaba en la hoja copiada** —`.handle`, la tira de 8 px a caballo del borde, el cursor, y
`.frame[data-dragging] { transition: none }`, que es lo que impide que la columna se despegue
del puntero—, porque el original también redimensiona; lo que no traía es el gesto, la
accesibilidad y quién recuerda el ancho. Seis reglas:
- **Es el «window splitter» de ARIA**: un `separator` ENFOCABLE con `aria-valuenow`, o sea el
  MISMO control para el ratón y para el teclado (flechas ±16, Home/End a los topes, doble
  clic a la omisión). Sin `tabIndex` sería un asa que solo existe si tienes ratón.
- **Sin manejador no se pinta el tirador**, y plegada tampoco: un asa que no redimensiona es
  el control muerto de siempre, y encima tapa 8 px de la columna.
- **El `terminado` del manejador distingue las dos cadencias del gesto**: el arrastre pide un
  ancho en cada `pointermove` y `localStorage` se escribe UNA vez, al soltar. Cada tecla
  llega ya terminada.
- **El techo del 60% de la ventana lo aplica el CSS** (`min(Xpx, 60vw)` en la pista), no el
  número guardado: así encoger la ventana estrecha la barra sin sobrescribir los 560 que
  alguien eligió en su pantalla grande. Al arrastrar sí se acota con la ventana, que es lo
  que mantiene el tirador pegado al puntero.
- **Con cabecera va en la SEGUNDA fila del grid**: un absoluto con celda declarada toma esa
  celda como bloque contenedor, así que la tira deja de cruzar la barra superior — donde solo
  taparía la miga con un cursor de redimensionar.
- **El arrastre se abre ANTES de pedir la captura del puntero, y la captura va envuelta**:
  medido en Chrome, `setPointerCapture` LANZA si el `pointerId` no es de un puntero activo, y
  capturando primero ese fallo se llevaba el gesto entero. Es una comodidad —con ella los
  `pointermove` de fuera del asa siguen llegando—, no la condición del gesto; y
  `lostpointercapture` cierra el arrastre, porque un puntero que sale de la ventana lo dejaba
  abierto para siempre.

**Las sesiones de la barra se PLIEGAN, y solo hay una lista abierta: la del proyecto activo**
(`desplegado` en `Barra.tsx`). Se enseñaban todas las de todos, y lo pidió el usuario mirando
su barra: cuatro proyectos con sus conversaciones es una columna que no se puede leer, y lo
que se busca —la de donde estás— queda enterrado entre las de proyectos que no estás mirando.
Cinco reglas:
- **Es un ACORDEÓN, no plegados independientes**, porque lo pedido es «uno solo»: desplegar
  uno cierra el que hubiera. Un `string | undefined` lo dice todo, y `undefined` es «ninguno
  abierto» — que es la barra del escritorio recién arrancado: **sin proyecto activo no se
  despliega ninguno**, porque abrir el primero por no tener el dato sería la misma invención
  que marcar «aquí estás» sin saberlo.
- **El proyecto ACTIVO manda cuando cambia** (un efecto sobre `proyectoActivo`): abrir una
  sesión de otro proyecto se lleva el despliegue con ella, que es donde acabas de mirar. En un
  efecto y no derivado, para que un despliegue a mano sobreviva a un re-render.
- **El plegador es un botón APARTE**, hermano del que abre el proyecto y no dentro: un
  `<button>` anidado en otro es HTML inválido y reparte el clic entre los dos — la misma razón
  por la que el «…» de una sesión no vive dentro de su fila.
- **La afordancia ya estaba en la hoja copiada**: `.projectRow:hover .folder { display: none }`
  y `.chevron` en su sitio, con `.arrow`/`.arrowOpen` girando 90° (el icono es su
  `IconTriangleRightFill14`, no un parecido). Lo que se añade es que **la carpeta cambia de
  glifo** (cerrada/abierta), que es lo que dice el estado SIN posar el ratón, y que el
  intercambio se repite en `:focus-visible` con clases NUESTRAS —las de la otra hoja son de
  otro módulo y desde aquí no se pueden nombrar—: quien llega con el Tab veía la carpeta y
  ninguna señal de que ese botón despliega algo. Las filas plegadas se DESMONTAN, que es la
  regla de siempre: una fila invisible con `visibility` sigue siendo tabulable.
- **Y con la lista plegada, la marca de «trabajando» la TIENE que dar el proyecto.** El
  servidor manda `proyectos[].trabajando` solo cuando ninguna fila suya la lleva —para no
  decirlo dos veces— y eso valía cuando las sesiones se enseñaban todas: lo decía la fila.
  Plegada esa fila no existe, así que un turno corriendo en un proyecto que no estás mirando
  no se vería en NINGUNA parte. No es el cruce prohibido de datos de otros párrafos: la lista
  de sesiones ya está en el cliente, plegada o no, y se le pregunta a ella. Desplegado el
  cliente no añade nada —ahí lo dice la fila, que es la que se abre—, y la marca que mande el
  servidor se respeta igual: es él quien sabe de la sesión que aún no tiene fila.

**El proyecto activo y la sesión activa NO se marcan igual, y el cian es de una sola fila.**
Las dos se pintaban idénticas a propósito —mismo fondo y mismo filo de cian, «para que aquí
estás se lea igual en los dos niveles»— y el usuario lo señaló mirando la pantalla: así no se
distingue la sesión abierta del proyecto que la contiene, que es justo lo que hace falta
saber. **Y no basta con el filo**: lo dijo dos veces, porque con el mismo relleno gris en las
dos, 2 px de acento no separan nada — a un metro las dos filas se leen igual de
«seleccionadas». Son dos COLORES y no dos intensidades del mismo: el proyecto se queda con el
gris neutro (es el contenedor, y ese gris es el que la hoja copiada usa para «tocado por el
ratón») más el nombre en NEGRITA, y la fila que estás leyendo va con el acento del producto
—un cian al 14% más su filo—, el mismo de la pestaña activa. El 14% no es timidez: encima va
texto casi negro, y el cian a plena carga nunca tuvo contraste para letra (es la razón por la
que el rediseño lo movió de relleno a acento). El tono vive en la PALETA
(`--xonecode-fila-elegida`, `estilos/marca.css`, con su variante al 26% para el tema oscuro)
y no en la hoja del componente: `Barra.test.tsx` prohíbe un color literal ahí —`transparent`
incluido, y por eso salta con un `color-mix` compuesto en el componente— y `marca.css` es la
excepción declarada. Se deriva del cian con `color-mix` en vez de escribir el rgba a mano, que
es como se acaba con dos cianes distintos. El `aria-current` sigue diciéndolo sin depender de
ningún color.

**Y las acciones de una fila llevan AIRE** (`.accionesDeFila`, 12 px a la izquierda): medido,
el «…» de una sesión arrancaba en el píxel EXACTO donde acababa su fecha y el «+» de un
proyecto quedaba a 6 px de la pastilla de propio/compartido. Un dato y un control sin hueco
entre ellos se leen como una sola cosa, y encima invitan a pulsar el que no querías.

**Y abrir algo DICE que está abriendo, con dos señales que no son la misma** (`clase:
"abriendo"` en el cable, `App.tsx#pedidoDeApertura`). Un clic que no cambia nada se lee como
que no ha hecho nada, y esta espera va de decenas de milisegundos (una copia local) a los
MINUTOS de una descarga. Tres reglas:
- **Lo que se está abriendo lo dice el SERVIDOR**, como el turno en vuelo y por lo mismo:
  solo él sabe cuándo acaba, y deducirlo de que llegue un alta fallaría justo cuando importa
  —abrir también anuncia alta cuando FALLA—. Los dos flancos, y el de bajada en un `finally`.
- **Y el clic pinta al instante, que es otra cosa.** Medido en el navegador: el ida y vuelta
  del servidor son 40 ms, así que con solo su señal el primer cuadro después del clic sigue
  igual que antes. `pedidoDeApertura` es «he pulsado y espero respuesta» —estado de esta
  ventana, no una afirmación sobre el servidor— y lo releva cualquier cosa que el servidor
  diga; se suelta también si se cae el cable, porque un indicador encendido para siempre es
  peor que no tenerlo.
- **La descarga se dice con OTRA palabra** («descargando…», y en la fila del proyecto): son
  minutos, y un punto que gira no distingue eso de medio segundo. El indicador va en la fila
  donde se pulsó —la de la sesión si es guardada, la del proyecto si es nueva, que es donde
  está su «+»— con `aria-busy`, y mientras se abre algo no se puede pedir ABRIR otra cosa.

**Al escritorio se VUELVE, y el enlace es la marca** (`Cabecera.tsx#alIrAlEscritorio`,
`App.tsx#enEscritorio`). El escritorio se pintaba solo cuando NO había proyecto abierto, así
que en cuanto abrías uno no había forma de volver a él —ni a los otros proyectos, ni a «Tu
equipo», ni al entorno—: medido en pantalla. Tres decisiones:
- **La marca, no un control nuevo.** «xonecode» ya es la raíz de la miga que se lee al lado
  («xonecode / AppDemo / Hola»), y pulsar el primer nivel de una miga es lo que hace
  cualquier interfaz con migas. La alternativa —una entrada «Escritorio» arriba de la barra
  lateral— añadía un control y encima desaparecía al plegar la barra, que es justo cuando
  más falta hace. En el escritorio la marca deja de ser botón: ausente el manejador, se
  pinta como rótulo — un botón que no lleva a ninguna parte es el botón muerto de siempre.
- **Es estado de VISTA, no una orden al servidor.** Volver no cierra la sesión ni suelta el
  proyecto: la barra lo sigue marcando como activo y el turno que estuviera corriendo sigue
  corriendo. Por el cable no viaja nada.
- **Se sale del escritorio al ABRIR algo** (`abrirSesion`, la función por la que pasan
  ahora los tres sitios que abrían sesión), y no reaccionando a que el servidor cambie de
  sesión: el id de una sesión nueva nace al volcar su primer acto, y un efecto sobre
  `sesionActiva` te sacaría del escritorio a media mirada sin que hubieras pedido nada.

**El centro sin sesión es el ESCRITORIO** (`Escritorio.tsx`), no un hueco con una frase
(«elige un proyecto en la barra lateral», que es lo que había). Pinta los proyectos con lo
que el servidor ya manda —si tienen copia local—, el entorno activo
con su URL y el modelo en vigor, y empezar es un clic. Todo lo que enseña ya viajaba por el
cable: no hay una sola tarjeta de relleno. Y **no pinta nada del mockup que no tenga dato
detrás** —«Build & Run», el estado del ADB en vivo, los dispositivos del mockup—: eso es un
puente con el móvil que este producto todavía no cablea, salvo la DETECCIÓN, que sí se mide
(párrafo siguiente) (`docs/DISENO-DASHBOARD.md` lista
pieza por pieza qué se sostiene y qué no). Los dos vacíos se distinguen, además: «no hay
entorno registrado» manda a Ajustes; «el entorno no devolvió proyectos» no, porque ahí no
hay nada que configurar. **Y pinta solo los proyectos ELEGIDOS** —`Entorno.proyectos`, la
misma elección que manda en la barra, con la misma omisión si nadie eligió—: los demás
estaban debajo en su propia rejilla de tarjetas, y eso deshacía la elección, porque el
escritorio enseñaba los dieciocho proyectos del entorno y el grupo elegido se perdía entre
ellos. Se CUENTAN en una línea con el botón a Ajustes, que es la misma regla de la barra:
elegir cuatro y ver dieciocho es no haber elegido, pero callar los otros catorce sería
afirmar que el entorno solo tiene cuatro.

**Y la tarjeta de un proyecto NO lista sus sesiones** (`Escritorio.tsx`). Estaban las cuatro
últimas de cada uno, o sea la misma lista que la barra lateral tiene ENTERA y ordenada por
último turno: dos sitios para lo mismo, y el de aquí siempre peor —recortado a cuatro y con
el orden de alta—. Lo pidió el usuario, y la división queda limpia: la tarjeta es para
EMPEZAR algo en ese proyecto (sus dos botones), y seguir una conversación es de la barra, que
es donde vive esa lista. Con eso se fueron también el «Sin sesiones todavía» de la tarjeta
—no es un dato que falte, es una lista que está en otro sitio— y el `alAbrirSesion` del
componente, que se queda sin llamador: un prop que nadie usa es una promesa que nadie cumple.
Y va junto con el plegado de la barra: en el escritorio recién abierto no hay ninguna sesión a
la vista hasta que se despliega un proyecto, que es lo que las dos decisiones piden a la vez.

**Qué hay en la máquina para probar la app** (`core/dispositivos.ts`,
`agent/dispositivos/dispositivosEnMaquina.ts`, panel «Tu equipo» en `Equipo.tsx`, mensaje
`dispositivos` en las dos direcciones del cable). El sistema operativo, si hay adb y
emulator (PATH, luego `ANDROID_HOME`/`ANDROID_SDK_ROOT`, luego la carpeta por omisión de
cada sistema; en Windows con `.exe`), y en macOS los simuladores (`xcrun simctl list -j
devices available`) y los iPhone/iPad conectados (`xcrun devicectl list devices
--json-output <fichero>`: no imprime el JSON por stdout). Los parsers son puros y están
probados contra la salida MEDIDA aquí (simctl con iOS 26, devicectl vacío) y la forma
documentada (adb, devicectl con dispositivos: en esta máquina no hay ninguno); el corredor
recibe plataforma, entorno, `existe` y `ejecutar` por parámetro, así que `npm test` no
lanza ni un proceso. Reglas:
- **`xcode-select -p` ANTES de cualquier `xcrun`.** Sin herramientas de desarrollo, `xcrun`
  levanta el diálogo de «instalar las command line tools» encima de lo que haya;
  `xcode-select -p` falla sin diálogo.
- **Cuatro estados por herramienta, no un booleano**: ok, no encontrada, falló (con UNA
  línea de motivo, nunca la salida entera) y **no aplica** — iOS fuera de macOS. Decir «sin
  iOS» en un Linux afirmaría lo que la máquina no puede saber. La RUTA de la herramienta se
  queda en el host (`sinRutas`, `arranque.ts`): es una ruta del home del usuario y el cable
  puede ir por un túnel (`--anfitrion`); el panel no la pinta y no la necesita.
- **Cada proceso lleva tope** (`TOPES_MS`; el de adb es mayor porque `adb devices` ARRANCA
  el demonio en frío) y un cuelgue se dice como «no respondió», nunca se queda el panel en
  «consultando…». Ese demonio se queda vivo —también tras la primera medida al conectar—,
  y el panel lo dice.
- **Es una FOTO con hora, no un estado en vivo, y no hay sondeo**: se mide al conectar el
  primer cliente —UNA detección en vuelo compartida, dos pestañas no lanzan dos adb— y solo
  se vuelve a medir cuando alguien pulsa «Refrescar». Remedir solo cada pocos
  segundos lanzaría procesos en el equipo del usuario sin que nadie lo pidiera. Va a TODOS
  los clientes: la máquina es la misma para todos. Y el store NO la tira al caerse el
  cable, al revés que `modelos`: no es un estado que el servidor pueda haber cambiado.
- **Por nombre solo lo que está a mano o pide algo** (conectado, arrancado, sin autorizar,
  offline); los apagados se CUENTAN. Esta máquina tiene 35 simuladores y ninguno arrancado:
  35 filas iguales no dicen nada que «35 disponibles, ninguno arrancado» no diga.
- Sin la opción `detectarDispositivos` en `montarRutas` no se manda nada: el escritorio se
  queda en «consultando…» en vez de afirmar una máquina vacía.
- **QUÉ se mira se elige en Ajustes → Dispositivos** (`core/settings.ts#AjustesDeDispositivos`,
  guardado en `settings.json` por `guardarDispositivos`): cuatro destinos —Android, Android
  Sim, iOS, iOS Sim—, que son las cuatro cosas distintas que se quieren mirar, no las cuatro
  herramientas. Cinco reglas:
  - **Apagar deja de LANZAR procesos**, no esconde filas. Ahí está el sentido del ajuste:
    medir cuesta procesos en el equipo del usuario, `adb devices` arranca un demonio que se
    queda vivo y `xcrun` tarda segundos. Con los dos destinos de iOS apagados no se llama ni
    a `xcode-select -p`. Hay test que cuenta las invocaciones.
  - **Una herramienta que sirve a DOS destinos solo se salta con los dos apagados**: `adb
    devices` trae en la misma lista los Android físicos y los emuladores arrancados —un
    emulador arrancado no aparece en ningún otro sitio—, así que con emuladores encendidos
    adb se llama igual y lo que se filtra es la LISTA, después de medir.
  - **Un quinto estado de herramienta, «desactivada»**, que no se pliega en «no-encontrada»
    ni en «no-aplica»: una dice que falta el binario, otra que la máquina no puede, y esta
    que no se ha mirado a propósito — y es la única de las tres que se arregla con un clic.
  - **Ausente no es «no»: es «no lo he dicho»**, y entonces se miran todos; `{}` significa lo
    mismo y por eso no se guarda (borra la clave del fichero). La misma distinción que
    `Entorno.proyectos`. Un `"false"` de CADENA se descarta en las tres capas (disco, cable y
    store) en vez de tomarse por falso: es verdadero en JavaScript, y apagaría un destino que
    nadie apagó.
  - **Configurar y volver a medir son el MISMO mensaje** (`{clase: "dispositivos", ajustes?}`)
    y en ese orden: se guarda y luego se mide, porque el detector lee los ajustes de disco en
    cada medida y al revés daría la foto de la configuración anterior. La ventana **dice qué se
    puede hacer y qué no**: se descubren, se instala lo que falta y se VERIFICA la conexión
    con uno; conectar por red, arrancar un emulador o instalar la app no está cableado, y un
    botón que lo prometiera sería el botón muerto de siempre.
- **Y lo que FALTA se explica con una RECETA** (`core/dispositivos.ts#recetaDeEmuladorAndroid`,
  `componentes/Receta.tsx`), que es otra cosa que un requisito: un requisito está o no está,
  y esto es un procedimiento con orden — cuatro pasos, una vez por máquina, para tener el
  emulador de Android. Cinco reglas:
  - **Qué se copia y qué se EJECUTA, por comando y no por herramienta.** La regla era «se
    ofrece ejecutar lo que se puede cumplir» aplicada por herramienta; aquí se afina por
    COMANDO, y **el criterio cambió al medirlo**: no es «puede pedir la contraseña» sino
    «puede COLGARSE pidiéndola», que es lo que un botón no se puede permitir. Con eso los dos
    `brew` del paso 1 pasaron a ejecutables y solo el del `~/.zshrc` se sigue copiando (la
    medida, en su párrafo más abajo). `sdkmanager` y `avdmanager` no piden contraseña —solo
    las licencias y el perfil de hardware, que se contestan por `stdin` de forma
    determinista— y son además los largos: 2-3 GB. Los lanza
    `agent/dispositivos/instalacionEnMaquina.ts`, tabla cerrada por `receta:paso`, y un test compara esa
    tabla con lo que la receta marca `ejecutable` en las DOS direcciones: un paso con botón
    que no esté en la tabla es un botón muerto, y uno lanzable sin botón es una capacidad que
    nadie puede usar.
  - **Ejecutar un paso emite su LOG en vivo**, y eso es lo que lo hace usable: un botón mudo
    durante diez minutos se lee como que se ha colgado. Por el cable van la COLA del log
    (`LINEAS_DE_LOG`), el estado y los milisegundos, a ritmo (`MS_ENTRE_PROGRESOS`) porque
    cada emisión manda la cola entera y por línea sería cuadrático en bytes — la misma razón
    que `MS_ENTRE_PARCIALES` en la piel web. El último progreso se emite SIEMPRE, haya pasado
    el plazo o no: es el que completa el log y dice cómo acabó. Y hay cronómetro además del
    log porque descomprimir 3 GB no imprime nada: sin él, un tramo callado se lee como un
    cuelgue.
  - **Un trabajo a la vez, para toda la MÁQUINA.** Dos `sdkmanager` sobre el mismo SDK es una
    carrera con una instalación de por medio, y la máquina es una aunque haya dos pestañas
    —la misma regla que la medida compartida en vuelo—. Un segundo «ejecutar» no lanza nada:
    reenvía el estado, que es lo que la otra pestaña necesita para pintar el log que ya va.
  - **El silencio es el síntoma, no la lentitud** (`TOPE_SIN_SALIDA_MS`, 5 min). Mientras
    `sdkmanager` diga algo se le espera lo que haga falta: matar una descarga de 3 GB por
    lenta sería peor que esperarla. Lo que no es normal es que no diga nada — eso es un
    prompt esperando a alguien que no está. Hay además un tope total (`TOPE_DE_TRABAJO_MS`).
  - **Las licencias se aceptan con un clic que lo DICE**, en su propio campo (`acepta`) y
    junto al botón: aceptar una licencia en nombre de alguien no puede ser un efecto de
    rebote de algo que dice «Ejecutar». Se ejecuta `sdkmanager --licenses` alimentándole las
    respuestas, que es aceptar de verdad; lo que NO se hace nunca es escribir a mano los
    ficheros de licencia del SDK, que sería falsificar esa aceptación.
  - **«Terminó bien» y «ya está» son dos cosas, y se pueden contradecir.** El proceso puede
    salir con código 0 y la MEDIDA seguir sin encontrar nada; cuando pasa se dice, en vez de
    poner «Hecho» al lado de una marca hueca y dejar que el lector elija a cuál creer. La
    medida manda, que es la misma regla del botón de instalar una herramienta. Salió de
    probarlo con un `sdkmanager` de mentira que no creaba nada.
  - **Ningún comando lleva una ruta de la máquina**, la misma regla por la que `ruta` se
    queda en el host: el prefijo de Homebrew se deriva con `$(brew --prefix)` en vez de
    escribirse, y de paso vale igual en Intel que en Apple Silicon. Hay test.
  - **Cada paso se marca por lo MEDIDO, no por recordar que se pulsó**: `sdkmanager` para el
    primero, `ANDROID_HOME` para el segundo, `emulator` para el tercero y que haya algún AVD
    para el cuarto. Una marca guardada seguiría diciendo «hecho» después de desinstalar el
    SDK, que es justo cuando hay que decir que falta.
  - **Solo macOS.** En Windows y en Linux los gestores y las rutas son otros, así que serán
    otra receta; devolver esta con otro título sería el botón muerto de siempre, y el panel
    prefiere no enseñar nada. `recetas` viaja vacío.
  - **Y de aquí salió un fallo real de detección**: `brew install --cask
    android-commandlinetools` deja el SDK en `<prefijo>/share/android-commandlinetools`, que
    NO es la carpeta de Android Studio, así que seguir los pasos al pie de la letra dejaba el
    panel diciendo «emulator no está instalado» hasta tocarse el `.zshrc` — la consola
    exigiendo un cambio en la shell del usuario para ver algo que ya estaba en el disco. Las
    dos rutas de Homebrew entran ahora en `RAICES_DE_SDK_POR_OMISION`, y por eso el paso de
    las variables DICE que xonecode no lo necesita y para qué sí: para el terminal de quien
    lo lee.
- **Y lo que se INSTALA se puede pulsar, porque el miedo que lo impedía era falso**
  (`agent/dispositivos/instalacionEnMaquina.ts`). El criterio era «no se lanza lo que puede pedir la
  contraseña de administrador, porque un hijo sin terminal se quedaría esperándola para
  siempre», y con él los dos pasos de `brew` se copiaban — o sea que en una máquina nueva la
  receta **no tenía un solo botón vivo**, porque los pasos 3 y 4 exigen el `sdkmanager` que
  instala el 1. Medido el 10-09-2026: `sudo` lee la contraseña de `/dev/tty` y no de `stdin`,
  así que un hijo con `stdio[0] = "ignore"` y sin terminal de control **sale con código 1 en
  57 ms** diciendo «a terminal is required to read the password». El modo de fallo no es un
  botón colgado: es un botón que en dos segundos dice qué hace falta. Cinco reglas:
  - **El criterio pasa a ser «puede COLGARSE esperando», no «puede pedir»**, y con eso `brew`
    entra en la tabla: además, medido, `openjdk@17` es una fórmula y `android-commandlinetools`
    un Generic Artifact, así que ninguno instala fuera del prefijo de Homebrew. Se le pasan
    `NONINTERACTIVE` y `HOMEBREW_NO_AUTO_UPDATE` para que no pregunte ni gaste minutos
    actualizándose.
  - **Lo que sigue copiándose es lo que fallaría SIEMPRE o no falla rápido**: el paso del
    `~/.zshrc` —lo único de la receta que no sabríamos deshacer—, un `sudo` escrito dentro del
    comando (la licencia de Xcode) y `xcodebuild -downloadPlatform`, que pide autorización en
    una VENTANA del sistema. Un botón que falla siempre es la otra forma del botón muerto.
  - **Un paso lleva ahora VARIAS invocaciones** (`Invocacion`), porque el paso 1 son dos `brew`
    seguidos y la aceptación de licencias era ya una llamada previa metida a mano. Y una
    `opcional` es la que no corta el paso al fallar: solo las licencias, que pueden salir con
    error si ya estaban aceptadas.
  - **El paso que INSTALA el SDK no puede exigirlo** (`PasoEjecutable.conSdk`): la guarda de
    «falta el SDK o el JDK» era incondicional, o sea el círculo exacto que dejaba al paso 1 sin
    poder existir. Sin SDK el binario se busca en el PATH y se lanza a secas.
  - **Y se mata el GRUPO, no el hijo.** Medido: un padre que deja un nieto vivo (`brew` →
    `curl`, `sdkmanager` → `java`) sobrevive a `child.kill()` — el nieto seguía descargando
    después de cancelar. Ahora se lanza con `detached: true`, que hace al hijo líder de su
    grupo, y se cancela con `kill(-pid)`; sin pid se cae a matar al hijo, que es lo que hacía
    siempre. `matarGrupo` entra por parámetro porque el real mataría el grupo de quien corre
    `npm test`. **Coste declarado**: el hijo sale del grupo de procesos del servidor, así que
    un Ctrl-C en la consola ya no se lleva la descarga por delante — antes moría con el padre.
    Nadie cancela el trabajo en curso al apagar el servidor, y eso es lo que falta; el otro
    lado sería peor, porque sin `detached` «Cancelar» dejaba 3 GB descargándose sin forma de
    pararlos desde la ventana.
- **La receta del SIMULADOR de iOS** (`core/dispositivos.ts#recetaDeSimuladorIos`), macOS y
  nada más: los simuladores los da Xcode, que no existe en otro sistema — ahí no hay «otra
  receta», hay ninguna. Tres pasos y **ninguno ejecutable, cada uno diciendo por qué**: Xcode
  se instala del App Store y no hay comando que lo haga (lo que se da es el que abre su ficha),
  la licencia lleva `sudo` escrito, y `-downloadPlatform` pide autorización en una ventana.
  Cuatro cosas más:
  - **Xcode COMPLETO no es las Command Line Tools**, y esa distinción es la mitad de la
    receta: las CLT traen `xcrun` y `simctl` —así que la detección contesta— y **no traen ni
    un simulador**. Se separan por dónde apunta `xcode-select -p`: dentro de un `Xcode.app` o
    en `CommandLineTools`. Sin decirlo, quien solo las tenga vería «Xcode: ok» y una lista
    vacía sin nada que le dijera qué le falta.
  - **Los runtime salen del MISMO `simctl` que trae los dispositivos**: se le añade el dominio
    `runtimes` (`xcrun simctl list -j runtimes devices available`, medido) y con eso saber si
    falta el runtime no cuesta ni un proceso más — la regla de esta pantalla. La licencia sí
    es un proceso propio (`xcodebuild -version`, que es quien falla si no está aceptada) y
    solo se lanza con Xcode completo delante, la misma economía que `xcode-select -p` antes de
    cualquier `xcrun`.
  - **Con el destino de simuladores apagado no hay receta de iOS**, y no es simetría con la de
    Android: aquella se compone de lo que ya se sabía —mirar el PATH no lanza nada— y esta
    necesita haber medido. Sin medir, sus tres pasos saldrían «pendientes» en una máquina que
    los tiene hechos, que es peor que ninguna receta.
  - **Crear un simulador no es un paso**: Xcode deja una lista hecha con cada runtime que
    instalas. Se dice en el `despues`, porque si no se busca un botón que no debe existir. Y en
    esta máquina la receta sale **completa** (Xcode 26.6, licencia aceptada, tres runtime), o
    sea que el panel dice «ya está» en vez de tres pasos que sobran.
- **Verificar la conexión con un dispositivo** (`agent/dispositivos/dispositivosEnMaquina.ts#verificarDispositivo`,
  mensaje `conexion`, `Dispositivo.verificado`, `componentes/VerificarDispositivo.tsx`). Es
  otra pregunta que la del inventario y por eso es otro campo y otro botón: **listar dice lo
  que el intermediario CREE** —`adb devices` contesta «device» de un teléfono cuyo `adb shell`
  se ha quedado colgado, y medido, `simctl getenv` contesta la ruta de datos de un simulador
  APAGADO, así que no vale como comprobación de nada—, y esto **ejecuta algo al otro lado**:
  `adb -s <serial> shell getprop ro.product.model`, `xcrun simctl spawn <udid>` (medido contra
  uno arrancado y uno apagado) y `xcrun devicectl device info details` para un iPhone físico,
  que es el único de los tres **sin medir**, como su parser. Ocho reglas:
  - **Viaja el ID y nada más**, y el host lo resuelve contra su última MEDIDA: de ahí salen la
    plataforma y la clase, que son las que deciden qué comando se lanza. Una cadena del
    navegador dentro de los argumentos de un proceso es la puerta que esto no abre. Un id que
    no esté se ignora en silencio: es una foto vieja del cliente, no un error.
  - **Es un mensaje PROPIO y no un campo de `dispositivos`**, aunque las dos cosas acaben
    emitiendo el informe: `dispositivos` significa «vuelve a MEDIR», y una medida nueva se
    lleva por construcción todas las verificaciones —viven con la foto—, o sea que meterlo ahí
    habría borrado la que se acaba de hacer.
  - **Y que vivan con la foto es la regla, no un efecto**: una verificación de hace media hora
    pegada a una foto de ahora afirmaría algo que nadie ha comprobado. Ausente es «nadie lo ha
    verificado», nunca «no responde».
  - **La respuesta es una línea**, nunca la salida entera, y de `simctl` se elige la línea que
    EXPLICA algo (`core/dispositivos.ts#motivoDeSimctl`): `describirFallo` se queda con la
    primera de stderr, que ahí es papeleo —«An error was encountered … code=405»—, así que sin
    esto verificar un simulador apagado contestaba un código de error en vez de «no está
    arrancado».
  - **`devicectl` se LEE**: no imprime el JSON por stdout, así que un código 0 sin fichero
    legible no es una respuesta. Y el temporal se borra siempre.
  - **Contestar sin decir el modelo sigue siendo contestar** («responde a la shell»): la
    pregunta era si hay una shell viva, e inventar un modelo vacío sería afirmar de más.
  - **Se ofrece también en una fila APAGADA**, y a propósito: la fila es la foto —puede tener
    diez minutos— y esto es ahora. Arrancar un simulador a mano entre medias es justo el caso
    en que la foto miente sin que nadie pueda saberlo.
  - **Y cuando la verificación CONTRADICE a la fila se dice cuál es más vieja.** Medido en
    pantalla: arrancado un simulador a mano y verificado, la fila quedaba leyéndose «apagado ·
    ✓ responde», que parece un fallo de la ventana cuando es exactamente lo que esto viene a
    distinguir. Solo cuando discrepan y solo si la verificación es POSTERIOR: escribirlo en las
    35 filas sería ruido, y decirlo de una verificación anterior a la foto sería falso.
  Una pieza para las dos vistas —el panel del escritorio y la lista de Ajustes—, que es el
  patrón de `QuienEjecutaTareas`. Lo que NO es: arrancar un emulador o un simulador sigue sin
  estar cableado, y el interlocutor de la app (el servidor hotswap de XOneStudio, puerto 8443)
  tampoco — esto comprueba que se llega al APARATO, no que la app conteste.
- **REQUISITOS e INVENTARIO son dos bloques, no una lista.** Un requisito está o no está —y
  si no está, se instala—; un dispositivo es algo que HAY. Juntos, «Android Sim · emulator no
  está instalada» se leía como un ajuste que el botón de al lado podía arreglar. El punto va
  VERDE solo con «ok» —lo único que significa disponible—, HUECO para lo que falta (cuatro
  puntos rojos se leen como cuatro errores, y no tener el SDK de Android si no desarrollas
  para Android no es un error) y sin relleno mientras no haya foto.
- **El inventario va en los dos grupos que una persona distingue**: «Teléfonos y tablets» y
  «Simuladores y emuladores» — lo que se enchufa y lo que se arranca. No por plataforma: un
  emulador de Android y un simulador de iOS se eligen por lo mismo. Un **AVD definido y sin
  arrancar también es un simulador disponible**: `emulator -list-avds` los da por NOMBRE y
  no salen en `adb devices` hasta que arrancan, así que sin añadirlos la lista dejaba fuera
  todos los de Android. La lista lleva scroll propio: esta máquina tiene 35 simuladores, y
  sin tope empujan los requisitos fuera de la pantalla — que es donde está lo accionable.
- **El filtro de medida son CASILLAS, no botones.** Fueron cuatro botones «Se mira» al lado
  del punto verde, y ahí decían lo que no eran: el verde ya afirma que se puede usar, así
  que un botón grande a su lado se leía como si concediera la capacidad. Degradado a una
  línea de «Buscar en: …», que es exactamente lo que hace.
- **Con qué dispositivo trabaja el agente NO se elige aquí**, y la ventana lo dice: es una
  decisión de la SESIÓN y esta ventana es configuración global («Configuración global» en su
  propia cabecera). Se elige en la pastilla del compositor, al lado del modelo.

**El dispositivo de la sesión** (`PastillaDeDispositivo.tsx`, `alta.dispositivoActivo`,
`{clase: "dispositivo", id?}`, `EntradaIndice.dispositivo`). Con cuál trabaja el agente es
del mismo tipo que el modelo —una elección de la sesión que decide el servidor y el cliente
pinta— y por eso comparte fila con él. Cinco reglas:
- **Se guarda la FOTO, no solo el id.** Los ids no son estables: `emulator-5554` es un
  puerto, un AVD recién arrancado se queda con el serial que haya libre, y el de un teléfono
  sobrevive pero el teléfono se desenchufa. Con solo el id, al reabrir una sesión la pastilla
  enseñaría un serial crudo o nada; con la foto puede decir «iPhone 16 · no está ahora».
- **Si está a mano AHORA no se guarda**: eso se resuelve contra la última medida en el
  momento de pintar. Un «conectado» escrito en disco es falso en cuanto se desenchufa.
- **El cliente manda el ID y nada más.** El nombre, la plataforma y la clase salen de la
  medida del servidor: el navegador no es fuente sobre la máquina, y aceptar su versión
  dejaría entrar un «iPhone 16» que nadie ha visto. Un id que no esté en la medida se ignora
  en silencio — es una foto vieja del cliente, no un error que contar.
- **El elegido que ya no está se DICE, no se borra.** Quitarlo de la lista haría desaparecer
  una elección que nadie ha deshecho. Y sin medida no se afirma que falte: no hay contra qué
  comprobarlo.
- **Elegirlo antes de que la sesión tenga id se queda en MEMORIA** y se anota en cuanto
  `volcar()` crea la entrada: el id nace al volcar el primer acto (la misma trampa que
  `sesionActiva`), así que sin esa espera, elegir dispositivo nada más abrir y hablar después
  perdía la elección al reabrir. `elegirDispositivo` del índice devuelve `false` en vez de
  crear una entrada a medias, que la barra enseñaría como una sesión vacía.
La pastilla **dice que la elección la usa la pestaña Ejecutar**, y calla la otra mitad a
propósito: el AGENTE sigue sin tools de dispositivo, así que un «lo usará cuando las tenga»
sería una capacidad que nadie ha decidido construir, dicha como si estuviera en camino. Decía
«ninguna tool la consume todavía» mientras era verdad —la elección se guardaba y se enseñaba,
nada más—; dejó de serlo cuando la pestaña empezó a lanzar con ella, y se corrigió entonces:
un pie que promete lo que ya no pasa enseña a no creerle.
- **Instalar lo que falta: se ofrece lo que se puede cumplir, y solo eso**
  (`Herramienta.instalar`, `INSTALADORES` en `agent/dispositivos/dispositivosEnMaquina.ts`).
  - **El comando no puede llevar NINGUNA ruta de la máquina**: se pinta en la ventana y
    viaja por el cable, que puede ir por un túnel — la misma regla por la que `ruta` se
    queda en el host (`sinRutas`). Por eso solo se propone lo que se resuelve por el PATH:
    `sdkmanager --install …` si está, y si no `brew install --cask android-platform-tools`.
  - **Solo `xcode-select --install` se lanza desde aquí** (`automatico: true`): devuelve en
    el acto y abre el diálogo de Apple. `brew install --cask` tarda minutos y puede pedir la
    contraseña de administrador, y un hijo sin terminal detrás se quedaría esperando esa
    contraseña para siempre — un botón que se cuelga es peor que no tener botón, así que ese
    comando se ENSEÑA para copiarlo.
  - **Por el cable viaja el NOMBRE de la herramienta, nunca el comando**: un comando que
    llegue del cliente es una shell abierta en la máquina del usuario. El host lo resuelve
    con una tabla cerrada, y después vuelve a medir — la foto nueva es la que dice si la
    herramienta apareció, no lo que conteste el instalador.
  - **Un código de salida no nulo no es un fallo aquí**: `xcode-select --install` sale con
    error cuando las herramientas ya están puestas. Se propaga lo que impide seguir (que el
    binario no exista, o que se cuelgue).

**La barra distingue dónde estás.** `proyectoAbierto` (booleano) decía SI había uno; la
barra necesita CUÁL, y son dos preguntas distintas: el mensaje de alta lleva ahora
`proyectoActivo` y `sesionActiva`. El id del proyecto se DEDUCE comparando la raíz de la
consola abierta con la que le tocaría a cada proyecto (`raizDeProyecto`, la misma función
que la creó) en vez de guardarse aparte al abrirlo — un id guardado se queda viejo el día
que alguien abra por otro camino. `sesionActiva` puede faltar con proyecto abierto y no es
un fallo: el id de sesión no existe hasta que se vuelca el primer acto, igual que tampoco
aparece todavía en la lista de sesiones guardadas. Sin esos datos **no se marca nada**:
marcar el primero por no tenerlos sería afirmar «aquí estás» sin saberlo. Y se marca con
DOS señales —fondo más barra de acento, y `aria-current`—, porque el fondo solo no basta
cuando la fila de al lado está en `:hover` con ese mismo alias.

**El cliente no manda comandos.** La pastilla de modelo mandaba la prosa `/modelo <id>`, y
eran dos mentiras pequeñas: el transcript se apuntaba un acto de USUARIO que nadie tecleó
—y de ahí sale el título de la sesión— y la interfaz hablaba en la sintaxis del terminal.
Por el cable viaja la intención (`clase: "modelo"`, `clase: "sesion"`, `clase: "credencial"`,
`clase: "entorno"`) y CÓMO se aplica lo decide el servidor: para el modelo, encolando la
línea en el lazo con `consolaWeb.encolar` —sin acto de usuario— porque el manejador de
`/modelo` es donde vive la precedencia entre banderas, ficheros y elecciones en caliente, y
una segunda implementación divergiría el primer día. **La función se comparte; la sintaxis
no se exporta.**

**Y con la sintaxis se fue el despacho.** Hubo un desplegable de sugerencias generado
recorriendo `COMANDOS` (`comandosDelRegistro`, `web/servidor/arranque.ts`) —igual que `/ayuda`,
la cabecera de stdio y el completador de Tab—, y se fue con una razón medida, no por limpieza:
por la MISMA cola del lazo circulan lo que teclea una persona y lo que pide un control de la
interfaz, así que teclear `/` para hablar de una ruta del proyecto —`/artefactos/informe.html`—
EJECUTABA una orden en vez de mandarla al modelo. En el navegador no hay comandos que despachar:
cada acción tiene su botón (el modelo en la pastilla, el tema en Apariencia, la sincronización
en su pestaña), y el teclado es la única puerta solo en las pieles de TERMINAL.

La distinción no se puede adivinar mirando la cadena, porque las dos cosas van por la misma
cola, así que **la dice la línea** (`cli/consola.ts#LineaDeConsola`): `comoComando: false` es
prosa —lo que teclea una persona en una piel sin comandos— y viaja al modelo con su «/» delante;
`comoComando: true` es un comando, y lo usan un control de la interfaz (`consolaWeb.encolar`,
que es como el servidor sigue aplicando `/modelo …` al elegir modelo en Ajustes) y las pieles
donde el teclado manda. Una `string` a secas se lee como siempre —comando si empieza por «/»—,
que es lo que siguen haciendo stdio, la TUI, la consola de una tarea y los dobles de los tests:
el contrato viejo no se movió y ninguna de esas pieles cambió de comportamiento.

**Ficheros y Revisión, las dos pestañas del proyecto** (`docs/superpowers/specs/2026-09-07-ficheros-y-revision-design.md`).
**Revisión** es lo que ha tocado una sesión (`agent/sesiones/sesionGit.ts`, `componentes/Revision.tsx`,
mensaje `revision` del cable — se llamaba `ficheros` hasta que hubo una pestaña con ese
nombre): los ficheros APILADOS con cabecera pegajosa y su diff dentro, numerado con las dos
columnas del formato unificado por `apps/web/src/numerarParche.ts` (pura; es también quien
corta la cabecera de git), **todos los bloques PLEGADOS al abrir** y cada uno desplegándose
al pulsar su cabecera, y a la derecha el árbol de cambiados. La cabecera dice «Sesión» porque la foto es de
la sesión: es el hueco del selector de turno que no existe. **Ficheros** es el árbol del
proyecto con un visor de SOLO lectura (`agent/grafo/arbolDeProyecto.ts`, mensajes `arbol` y
`fichero`): lista con la misma función del completado del Tab (`ficherosDelProyecto`, con el
tope de profundidad como parámetro) y filtra con las MISMAS reglas que ve el agente
—`puedeLeerRuta` y `esVistaAplanada`—, así que `.xonecode`, `.env`, `.git` y los `.xml`
aplanados no salen ni se leen aunque alguien los teclee en el cable. El lector rechaza en
orden ruta absoluta o con `..`, lo que la barrera niega, aplanadas, y cualquier `realpath` que
salga de la raíz (el enlace simbólico que apunta fuera), y nunca devuelve la ruta real de la
máquina. Tampoco por `informar` cuando el lector o el listado LANZAN (un `EACCES` tras el
`realpath`): en producción `informar` escribe un acto de sistema en el transcript, o sea que
también viaja por el cable, y el mensaje de Node lleva la ruta absoluta — a él solo le llega
el `code` (`codigoDe`, `arranque.ts`); el test asegura que la ruta no está en NINGÚN mensaje
recibido ni en lo informado. **Y la barrera se aplica DOS veces: sobre el texto que teclea el cliente —de balde,
antes de tocar el disco— y otra vez sobre el camino REAL, el que devuelve `realpath`.** Con
una sola no era verdad, y estaba medido: en un sistema de ficheros que no distingue mayúsculas
—APFS, NTFS— `.ENV` no es `/.env` para `puedeLeerRuta` pero abre `.env`, y un enlace simbólico
DENTRO de la raíz que apunte a un fichero o a una carpeta denegada (`enlace-env.txt` → `.env`,
`carpeta-enlazada` → `.xonecode`) pasaba la comprobación de «sigue en el proyecto» porque su
camino real sí lo está: lo que falla no es el sitio, es el destino. `realpath` canonicaliza las
mayúsculas y sigue los enlaces, así que UNA recomprobación cierra los dos agujeros — y sigue
siendo una recomprobación y no una prohibición de enlaces: un enlace a un fichero que sí se
enseña se lee con normalidad. La misma recomprobación caza la vista aplanada detrás de un
alias (`alias.xml` → `app/Clientes.xml`, que no tiene ningún `alias.xne` al lado). Y el árbol
NO recorre una carpeta detrás de un enlace (`ficherosDelProyecto` usa `lstatSync`), que era el
otro lado del mismo agujero: seguirlo listaba `.xonecode` bajo un alias y nombres de ficheros
de fuera del proyecto. Esa función alimenta también el completado del Tab y el universo de
`esVistaAplanada`, y no seguir enlaces a carpeta es correcto para los tres.
**Un fichero se enseña como lo que ES.** Un proyecto XOne no es solo `.xne`, `.js` y `.css`:
lleva iconos, capturas y un `README.md`, y enseñarlos como «es un fichero binario» o como una
pared de almohadillas mandaba a mirarlos a otro sitio. Tres reglas:
- **La imagen se decide por la EXTENSIÓN y ANTES de olfatear el NUL** (`IMAGENES`, tabla
  cerrada, y `mimeDeImagen`). Al revés no funciona: un PNG lleva ceros en su propia cabecera,
  así que TODAS caían por el camino del texto. Viaja como `mime` + `base64` y la pinta un
  `<img>` con una URL de datos — **nunca el marcado inyectado en el DOM**, porque un `.svg`
  del proyecto puede traer un `<script>` y dentro de un `<img>` el navegador no lo ejecuta.
- **Tope propio para las imágenes** (`TOPE_DE_IMAGEN`), y al pasarlo viaja el `mime` SIN los
  bytes: una imagen recortada no es media imagen, es el icono roto, y el `mime` a secas es lo
  que deja decir «una imagen de 9 MB» en vez de «un binario». Base64 infla un tercio, que es
  la otra razón de que el tope no sea el del texto.
- **El SVG enseña el dibujo Y el código, uno debajo del otro; el markdown lleva
  interruptor.** No es la misma situación: un SVG es las dos cosas a la vez y quien lo abre
  aquí está comprobando que ese código produce ese dibujo, así que alternar escondería la
  mitad de la respuesta; un documento renderizado y su fuente, en cambio, son la MISMA
  información dos veces, y ahí el interruptor Vista/Fuente (vista por omisión: quien abre un
  `README` quiere leerlo) es lo correcto. El markdown lo pinta el MISMO `MarkdownText` del
  chat, con `protegerDolares` por lo mismo de siempre (`$http` aparece en los `.md` de un
  proyecto XOne). Una imagen enlazada con ruta RELATIVA dentro de un `.md` no se pinta: el
  renderizador exige http(s) absoluto y esta consola no sirve los ficheros por HTTP.
- **Las dos pestañas piden su foto cuando NO la tienen, no al montar.** `store.ts` tira
  `arbol`, `contenidos`, `revision` y `parches` en cuanto el alta trae otra `sesionActiva`
  —y hace bien: son del proyecto anterior—, pero el componente NO se desmonta si su pestaña
  sigue delante, así que con la petición solo en el montaje **cambiar de proyecto dejaba
  Ficheros en «Consultando el árbol…» para siempre** (medido en el navegador con dos
  proyectos; Revisión tenía la misma forma). El efecto depende ahora de si hay dato y de
  `conectado`: lo segundo es el otro caso de lo mismo —al caerse el cable el store también
  lo tira, y sin esa dependencia la reconexión no lo recuperaría—, y de paso no se pide
  nada mientras no hay a quién pedírselo. No hay lazo: la respuesta define el dato, también
  cuando trae `error`.
- **El fichero se copia campo a campo al entrar en el store** (`store.ts`, el `case
  "fichero"`), que es una lista blanca: un campo NUEVO no llega hasta que se nombra ahí.
  Medido —y era el motivo de que NINGUNA imagen se enseñara en el navegador mientras los
  tests de jsdom pasaban en verde, porque esos le dan el contenido al componente a mano—:
  `mime` y `base64` se caían en ese `case`. Hay test.
Lo demás no cambia: binario es un NUL en los primeros 8 KB; lo que no es UTF-8 se lee como
latin1 y se dice; el contenido se recorta al mismo tope que el parche. El visor es el
`CodeBlock` de deepseek —un solo resaltador, un solo tema— y los números de línea son un
contador CSS sobre los `.line` de shiki (`Visor.module.css`): con una gramática perezosa el
primer render sale plano y se repinta solo. Las dos pestañas comparten `Arbol.tsx` y la
maqueta de dos columnas con el corte por CONTENEDOR a 720 px, no por ventana. **Cuánto nace
abierto lo decide quien monta el árbol** (`abiertas`), y no es lo mismo en las dos: en
Ficheros nace TODO plegado, porque es el proyecto entero y con el primer nivel abierto se
abría como una lista de cien ficheros donde no se ve la forma del proyecto; en Revisión son
solo los ficheros que la sesión tocó —un puñado, y verlos es el objetivo—, así que ahí sigue
la omisión de primer nivel abierto. El filtro es por subcadena de la ruta y abre lo que casa
en los dos casos: filtrar es buscar, y una coincidencia dentro de una carpeta plegada no se
ve. El árbol y los contenidos se tiran con la sesión y sin
cable, como los parches.

En Revisión, la marca de lo que la sesión tocó es una **ref propia**,
`refs/xonecode/sesion/<id>`, y no un tag: un tag es público, se empuja y significa «versión»,
y esto es un marcador privado de herramienta. Tampoco vale guardar el SHA del árbol en un
JSON nuestro: un árbol que ninguna ref alcanza se lo lleva `git gc` y la vista se rompe en
silencio semanas después. Al ABRIR el proyecto se fotografía el árbol (`fotoDeApertura`, el
mismo `GIT_INDEX_FILE` privado de `agent/turno/instantanea.ts`: sin commits y sin tocar el índice
del usuario) y la ref se nombra cuando la sesión recibe su id. Lo que se lista es
**árbol contra árbol** —un árbol nuevo escrito en un índice privado contra el de la foto—,
nunca `git diff <arbol> -- .`: eso compara contra el índice REAL del usuario y da por
borrados ficheros que están ahí. Va con `--no-renames` por lo mismo que `cambiosPendientes`,
y un binario se queda sin cuenta de líneas en vez de con un cero inventado.

**Y lo que se atribuye a una sesión sale de sus COMMITS, no de esa foto.** La foto contra el
árbol de ahora medía la COPIA del proyecto y la pestaña la rotulaba «Sesión»: era un proxy
razonable mientras nadie más escribía ahí, y dejó de serlo con las tareas de fondo. MEDIDO
en el proyecto del usuario el 10-09-2026: una conversación enseñaba «Sesión +1266 −1» sobre
dos ficheros que había escrito una tarea veinte minutos después. Desde que cada turno
commitea, hay con qué atribuir de verdad, y son seis reglas:
- **El sello es un TRAILER con el id de sesión** (`sesionGit.ts#CLAVE_DE_SELLO`, que
  `commitDeTurno` escribe). No el asunto: ahí va el título, que no identifica nada —dos
  sesiones se llaman «Hola» en su proyecto ahora mismo— y que cambia al renombrar. El
  formato vive en el módulo que lo GREPEA y `gitSync.ts` lo importa: en dos sitios, un
  cambio en uno rompe la atribución del otro en silencio.
- **El `--grep` no decide: se VERIFICA el trailer** (`%(trailers:key=…,valueonly)`, comparado
  entero). Un grep casa por subcadena, así que el id `s1` se habría quedado también con los
  commits de `s10` — la misatribución silenciosa que esto viene a quitar. Hay test.
- **La LISTA sale de los commits uno a uno; las CUENTAS y el PARCHE, de los dos extremos.**
  Así una ruta que la sesión no tocó no entra aunque haya cambiado, y la cifra de una fila
  cuenta lo mismo que su diff. El «antes» es el PADRE del primer commit de la sesión —mejor
  que la foto: lo que otro commiteara entre que te sentaste y tu primer turno queda fuera por
  construcción— y el «ahora» es el árbol de ahora y no el último commit, porque el turno en
  vuelo no ha commiteado todavía y la pestaña se quedaría vacía justo mientras el agente
  escribe. Un fichero que la sesión creó y borró no deja fila (`claseNeta`, pura y con test):
  no estaba antes y no está ahora.
- **Lo que nadie ha commiteado se enseña MARCADO** (`sinCommitear`), no escondido ni
  atribuido: puede ser el turno en vuelo o algo suelto de antes. Y `revisionConGit` lo QUITA
  de `cambiados`, que es el hecho que se le cuenta al juez — para una tarea eso no esconde
  nada suyo (`commitDeTurno` corre en el `finally` del turno y se ESPERA, así que cuando la
  puerta de entrega pregunta ya está commiteado) y evita cargarle lo que estuviera suelto.
- **Y el respaldo se DECLARA con otro nombre.** Una sesión sin ningún commit sellado —todas
  las de antes de esto, y las de un proyecto donde no se commitea— cae en
  `via: "desde-apertura"`, y la pestaña deja de decir «Sesión»: dice «Desde que abriste» y
  explica que ahí dentro puede estar lo que escribiera otra sesión o una tarea. Dejarle el
  nombre `git` habría hecho que `revisionConGit` siguiera afirmando una autoría ya sabida
  falsa sin tocar una línea. `revisable` acepta las DOS medidas, y eso no es relajarla:
  `commitearTurno` no commitea fuera del workspace a propósito, así que exigir atribución
  habría dejado sin entregar TODA tarea de un proyecto offline.
- **Lo que la atribución por commit no puede prometer, dicho:** `commitDeTurno` hace
  `add -A`, así que un commit barre lo que estuviera sucio en ese instante, incluido lo de
  otra sesión — la misma honestidad que separa `Tarea.autorizadas` de «aplicados». Y si entre
  los commits de una sesión cae alguno ajeno, la lista sigue exacta pero un parche puede
  traer hunks del otro: se CUENTAN (`mezclados`) y se dice. El aislamiento de verdad es un
  árbol por sesión, y no está hecho.
- **Y la costura está EXTRAÍDA y probada** (`arranque.ts#commitDeTurnoCableado`): el id de
  sesión llega por un tercer argumento a una lambda que vivía en un cierre que todos los
  tests doblan — es la MISMA forma de fallo que ya se midió tres veces en `abrirParaTarea`, y
  aquí lo que se cae en silencio es la atribución entera.

El `via` del cable tiene **cuatro** valores, porque son cuatro situaciones y una lista vacía
las haría indistinguibles: `git` (atribuido por commit), `desde-apertura` (el respaldo de
arriba), `sin-empezar` (hay proyecto abierto pero la sesión todavía no tiene id —nace al
volcar el primer acto, `vestibulo.ts#volcar`—, así que no ha tocado nada y eso SE SABE) y
`sin-marca` (no hay con qué comparar: sin git usable, o sesión abierta antes de que esto
existiera). Los dos últimos se separaron porque contestar «sin-marca» recién abierto un
proyecto mandaba a comprobar si el proyecto es un repo de git cuando lo único que pasaba es
que acabas de sentarte. `.xonecode/` se excluye —ahí dentro
`volcar()` escribe el `.jsonl` de la propia sesión al final de cada turno, y sin excluirlo la
primera fila era el transcript de la sesión diciendo que la sesión lo modificó—, pero **en el
DIFF y nunca en el `git add`**: medido contra un proyecto de verdad, `git add` con un
pathspec `:(exclude).xonecode` en un repo donde `.xonecode` ya está ignorado da por nombrada
una ruta ignorada y **sale con código 1**, así que el árbol no se escribía y la pestaña decía
«sin-marca» para siempre. Y los diffs llevan `--relative` porque los árboles se escriben con
rutas desde la raíz del REPO, que no tiene por qué ser el proyecto (`instantanea.ts` sostiene
ese caso): sin él, un proyecto en una subcarpeta daba rutas con prefijo que no casaban con
ninguna al pedir el parche. El índice es hoy el árbol de los ficheros cambiados, a la DERECHA de la pila y
compartiendo componente con Ficheros (`Arbol.tsx`), con su propio scroll. La hoja elegida se
marca con fondo Y barra de acento — `--dsw-alias-interactive-bg-selected` NO EXISTE en la
paleta copiada (cero apariciones, comprobado) y la `.sessionRow.selected` de ellos usa el
alias de HOVER, así que `Arbol.module.css` pinta el fondo con ese mismo hover y añade una
barra `--xonecode-cian`: sin ella, la hoja elegida y la de al lado bajo el ratón se verían
igual. Del parche no se pinta la cabecera
de git (`diff --git`, `index`, `---`, `+++`): son cuatro líneas al principio de CADA fichero
que no dicen nada que el nombre de la fila no diga ya, y empujan el primer cambio de verdad
fuera de la vista; se corta en el primer `@@`, salvo que no haya ninguno —un binario, un
cambio de modo—, porque entonces eso ES todo lo que git tiene que decir. El diff se pide a
git con `--diff-filter=AMD`: `claseDeCambio` devuelve «modificado» para cualquier letra que
no sea `A` ni `D`, así que un cambio de TIPO se colaría con una etiqueta falsa. **Al abrir la pestaña no se
despliega ningún bloque ni se pide ningún parche**: cada uno se pide al pulsar su cabecera
(el efecto de `App.tsx` solo OLVIDA lo desplegado cuando el store tira la foto, para que las
filas abiertas de una sesión no sigan abiertas sobre los ficheros de otra). Hubo una omisión
de ocho bloques abiertos —«que la pestaña se abra enseñando diffs y no una lista de
cabeceras»— y se cayó con los tamaños de verdad, dicho mirando la pantalla: «la vista está
bien pero debiera estar collapsada». Eran dos ficheros y +582 líneas, 483 en uno solo, así
que abrir la pestaña volcaba un diff de 483 líneas que nadie había pedido y dejaba fuera de
la vista la LISTA, que es lo que contesta la pregunta de esta pestaña — «¿qué tocó el
agente?». Es la misma regla que ya gobierna el árbol de Ficheros y por el mismo motivo: con
lo primero abierto no se ve la FORMA de lo que hay. Cada parche se
recorta a `TOPE_DE_PARCHE` diciéndolo. La foto es de UNA sesión:
`store.ts` la tira en cuanto el `alta` trae otra `sesionActiva`.

**La regla de qué URL de MCP vale es UNA** (`agent/cloudstudio/cloudstudioMcp.ts#urlDeMcpAceptable`, que
desde los proveedores personalizados es la MISMA de `core/modelos.ts#motivoDeEndpointInaceptable`
—`core/` es datos puros y de ahí pueden tirar los dos, en vez de dos copias que divergen—): HTTPS
sin credenciales, más `http://` en una lista CERRADA de hosts loopback, que existe solo para un
CloudStudio on-premise levantado en desarrollo. Hubo tres puertas con dos criterios —el wizard
del navegador aceptaba loopback, el registro del entorno y el conector lo rechazaban—, o sea
dos mensajes claros que se contradecían. Se resolvió por el lado PERMISIVO porque el caso
existe y porque en loopback el texto plano no cruza ninguna red (es el mismo trato que ya recibe
el `redirect_uri` del callback, `http://127.0.0.1:7634`, y la propia consola web). El cliente
lleva su copia declarada porque `src/web/frontera.test.ts` prohíbe compartir módulo con `src/`.

**La frontera del cliente está PROBADA** (`src/web/frontera.test.ts`): react-dom, vite y
`apps/web/` no se importan desde `src/` —salvo react en `cli/tui/`, que ya vive ahí por Ink—, y
los tipos del cable se **redeclaran** en `apps/web/src/tipos.ts` en vez de importarse.
`tipos.test.ts` compara los literales `tipo:` de los actos y los literales `clase:` de las dos
uniones de mensaje contra los del host: divergir da un test en rojo y no un bug mudo.

**El agente** (`agent/grafo/xoneAgent.ts`): un orquestador **sin ninguna tool** que delega en cuatro
especialistas (`docs`, `planner`, `dev`, `mockup` — `agent/grafo/perfiles.ts`). Cuatro cosas no son
negociables ahí:
- `FilesystemBackend` con `virtualMode: true`. Con el default, medido, el backend leyó una ruta
  absoluta de fuera de la raíz. Nada de backends con shell.
- Las **vistas aplanadas** (`X.xml` con un `X.xne` al lado) se retiran del backend con un Proxy
  (`agent/grafo/proyecto.ts`): así la regla es propiedad del proyecto y no de un prompt.
- Los permisos se construyen con `permisosDe(perfil)`, **nunca a mano**: `SubAgent.permissions`
  reemplaza los del padre en vez de fusionarlos, así que un perfil que los escriba a mano pierde
  la denegación de `/.env`, `/.git` y `/.xonecode`.
- El HITL va en las tools de fichero (`write_file`, `edit_file`), que son las que escriben.

`SubAgent.tools` lleva SOLO tools propias, nunca los nombres de las de fichero: pasarle nombres
las sustituía por cadenas y dejaba al especialista sin ninguna capacidad real. Las de fichero
las monta `createFilesystemMiddleware` desde el backend, y quien las acota es `permissions`.
La única tool propia hoy es la **búsqueda regex** (`agent/grafo/busquedaRegex.ts`): cubre patrones
estructurales de XOne/ES5 que el `grep` literal de deepagents no expresa, sin conceder
`execute` ni una shell. Va acotada a propósito
(`LIMITES_REGEX`: 50 ficheros, 256 KB por fichero, 100 coincidencias) y filtra rutas con
`puedeLeerRuta` — una tool de LangChain añadida por xonecode **no pasa por el middleware de
permisos**, así que la denegación de `/.xonecode` hay que re-aplicarla ahí a mano.

**La memoria del proyecto y el resumen de contexto** (`agent/grafo/memoriaDeProyecto.ts`,
`agent/turno/resumenDeContexto.ts`). `.xonecode/memoria.md` viaja con el proyecto, pero el agente la
ve por UNA ruta virtual, `/MEMORIA_PROYECTO.md`: `exponerMemoriaDeProyecto` es un Proxy que
traduce esa ruta en `read`/`readRaw`/`write`/`edit` y nada más, así que la carpeta `.xonecode`
sigue denegada entera y escribir la memoria pasa por la misma aprobación que cualquier fichero.
El resumen usa `createSummarizationMiddleware` con umbrales **fijados a mano** (32k para
disparar, 8k de reciente): deepagents asume 170k cuando el proveedor no publica su ventana, y
con Ollama eso comprime demasiado tarde. Los historiales ya resumidos se escriben en
`.xonecode/conversation_history/` — internos, ni en el árbol del agente ni en la app XOne.

**CloudStudio (MCP con OAuth)** (`agent/cloudstudio/cloudstudioMcp.ts`). Al abrir un proyecto sin
`.xonecode/`, `configurarModoInicial` (`cli/consola.ts`) pregunta el modo: `offline` o `cloud`;
`cloud` hace OAuth Authorization Code + PKCE contra el IDS, lista los proyectos y guarda en el
`config.json` del proyecto `modo` y `cloudstudio` (`url`, `scopes`, `proyecto`, `rama`). Invariantes:
- **Las tools remotas NO se inyectan en el agente.** `turnoReal.ts` y `xoneAgent.ts` no conocen
  CloudStudio; solo `cli/` llama a `conectarCloudStudio` — y, ahora que hay descarga y subida,
  también a `agent/cloudstudio/descarga.ts` y `agent/cloudstudio/subida.ts`. Las ejecuta el CLI, nunca una tool que el
  agente pueda invocar. Falta la lista blanca por perfil, y sin ella el catálogo entero
  acabaría en cada prompt.
- El puerto de callback (**7634**) es fijo porque el IDS registra el `redirect_uri`; el estado
  OAuth va a `~/.xonecode/cloudstudio-oauth.json`, **nunca al repo**.
- Tres escalones de scopes (`SCOPES_CLOUDSTUDIO`, `…_ESCRITURA`, `…_AGENTE`) y ninguno incluye
  `mcp.admin`.
- En el arranque solo se invoca el listado de proyectos, construido a mano con `z.object({})`
  sobre `cliente.callTool`: pasar por `MultiServerMCPClient` obligaba a normalizar el JSON
  Schema de TODAS las tools del servidor, y varias usan variantes que Zod no acepta.
- **El nombre de esa tool no se codifica a pelo.** El servidor real la publica como
  `studio_list_projects`; `project_list` y `list_projects` son endpoints anteriores.
  `herramientaDeProyectos` prueba los nombres conocidos en orden y, si ninguno está, cae en una
  heurística que exige «list» + «project» y CERO argumentos obligatorios: abrir el proyecto
  equivocado en el arranque es peor que no encontrar la tool.
- **La respuesta no es una lista.** Medido: `studio_list_projects` devuelve un MAPA indexado
  por id bajo «recents», con el identificador en `pid`. `proyectosDeResultado` acepta lista y
  mapa en cada clave conocida, usa la clave del mapa como id de reserva, y se queda con
  `{id, nombre, compartido?}` y nada más: la respuesta trae también permisos (`rights`),
  fechas (`last`), una tabla de `studiopermissions` y **el correo del propietario**
  (`suser`), y nada de eso puede acabar en `config.json` ni en el transcript. Lo que sostiene
  esa regla no es el comentario: es un test que compara las claves EXACTAS de lo que sale,
  para que un «ya que estamos, llevemos también la fecha» no cuele el correo de camino.
  `compartido` es el único campo que se añadió a los dos de siempre —lo pintan la barra y el
  escritorio para distinguir lo propio de lo compartido— y es un BOOLEANO, no el correo: para
  esa etiqueta basta, y quién lo compartió es un dato de una persona que esta consola no
  necesita. Se toma **solo si vino como booleano de verdad**: este servidor es flojo con los
  tipos (en la misma respuesta, `rights` es un objeto serializado como cadena), y `"false"`
  es una cadena verdadera en JavaScript. Ausente se propaga como ausente hasta el componente,
  y entonces no se pinta NINGUNA de las dos etiquetas — «el servidor no lo dijo» no es «es
  tuyo», y afirmarlo etiquetaría como propios los proyectos de todo el mundo contra un
  endpoint anterior. Por lo mismo, `completarProyecto` (`vestibulo.ts`) **desestructura**
  `{id, nombre}` en vez de reenviar la fila entera: de ahí sale el `config.json` del
  proyecto, y la comprobación de propiedades de más de TypeScript no salta con un objeto que
  llega por variable.
- Un fallo aquí no puede tumbar el arranque: el asistente informa y **no crea `.xonecode`** a
  medias.

**CloudStudio abre por NOMBRE y rechaza el id**, y eso vale también para la reapertura
automática: `clienteCloudStudio(invocar, nombreDeProyecto)` usa ese valor cada vez que
reabre, así que pasarle el id daba un bucle sordo —se reabría con algo que el servidor no
encuentra, la tool volvía a decir «no project is open», y el error hablaba de la tool y no
del argumento equivocado—. El cable trae el ID (es lo que identifica al proyecto en la
lista), así que **quien llama desde la web traduce**: `ramasDe` acepta la identidad entera
`{id, nombre}` igual que `completarProyecto`, y usa el nombre.

**La sesión MCP se recupera sola, y eso incluye el token.** Dos agujeros medidos contra el
servidor real, los dos arreglados:
- **La sesión caída llega de DOS formas** y solo se miraba una. A veces es un error de tool
  (`isError`, que `invocarSobre` convierte en excepción) y a veces una respuesta CORRECTA
  cuyo texto empieza por «Error: No project is open…». Esa segunda no disparaba la
  reapertura, y el texto seguía camino hasta el `JSON.parse` de quien llamó: lo que llegaba
  a la interfaz era «Unexpected token 'E'» — un fallo de sesión disfrazado de fallo de
  formato. `conSesion` (`agent/cloudstudio/cloudstudioClient.ts`) mira ahora el RESULTADO además de la
  excepción, reabre con `studio_open_project` y reintenta una vez; si tras reabrir el texto
  sigue diciendo lo mismo, lanza nombrando la tool y el proyecto en vez de devolver ese
  texto. Y ningún `JSON.parse` a pelo: `comoJson` falla diciendo QUÉ tool contestó y con qué
  muestra.
- **`ProviderCloudStudio.invalidateCredentials`** no existía, y es el gancho del que depende
  la recuperación del SDK: `auth()` atrapa `InvalidGrantError` —refresh token muerto— o
  `InvalidClientError`, llama a ese método y REINTENTA el flujo entero. Sin implementarlo la
  llamada era un no-op, el SDK reintentaba con las credenciales podridas y volvía a fallar:
  un token caducado sin refresco válido era un fallo duro que solo se arreglaba borrando el
  fichero a mano. Cada alcance borra lo suyo (`tokens` se lleva también los `scopes`
  concedidos, que van CON el token) y se escribe en el acto.

**La copia local y la sincronización** (`agent/cloudstudio/descarga.ts`, `agent/sesiones/gitSync.ts`,
`agent/cloudstudio/subida.ts`, `core/planDeSubida.ts`). El proyecto se descarga a la carpeta que el
usuario abrió, con la misma estructura del servidor, y el agente trabaja sobre ella sin
enterarse de que CloudStudio existe. El estado de «qué hay arriba» NO es un fichero
nuestro: es la ref `refs/remotes/cloudstudio/<rama>`, así que `git status` responde solo y
`git diff cloudstudio/<rama>..HEAD` ES el plan de subida. Cuatro reglas duras:
- **Lo que no se pudo bajar, no se puede borrar** (`core/planDeSubida.ts`). El plan B baja
  fichero a fichero y el servidor no sirve binarios así, de modo que git ve las imágenes y
  las fuentes tipográficas como borradas. Emitir esos borrados vaciaría el proyecto en
  Studio; el manifiesto de `sync.json` es lo que lo impide.
- **La ref se mueve solo si la subida terminó entera**, así que un fallo parcial se
  reintenta solo en el siguiente `/sync`. El reintento reenvía el plan ENTERO contra la
  misma ref sin mover, ficheros ya subidos incluidos: eso solo es seguro si escribir o
  borrar dos veces la misma ruta en CloudStudio no tiene efecto observable la segunda
  vez, algo que `agent/cloudstudio/subida.ts` asume del servidor sin comprobarlo.
- **`.xonecode` no sube nunca**, con filtro propio además del exclude de git — y `.gitignore`
  no se toca, porque es un fichero del proyecto y acabaría en CloudStudio.
- **La rama activa del servidor se restaura** tras cada operación (`get_context` antes de
  `switch`): un switch le mueve el suelo a quien tenga Studio abierto.

De colecciones, en local solo se conservan los `.xne` y `app.xml`: los `X.xml` que Studio
genera junto a un `X.xne` se **borran del disco** justo tras extraer, no solo se le ocultan
al agente. El orden es la parte que importa —extraer → borrar vistas aplanadas → commit de
baseline (`prepararRepo`)— y al revés hace justo lo contrario: si el baseline se tomara
antes del borrado, git vería esos `.xml` como borrados y, al haberse descargado, el
candado no los frenaría; la primera subida los borraría **en Studio**. Tomándolo después,
para git nunca existieron.

El remoto `cloudstudio` se declara con `skipFetchAll`: detrás de `cloudstudio://` no hay
servidor git, y sin esa clave el `git fetch --all` del usuario muere con «remote helper
'cloudstudio' aborted session». La url y la ref existen solo para que `git status` calcule
el ahead/behind — el libro de cuentas es git, no un fichero nuestro—, así que quitar el
remoto no era una opción. Las tres claves de `remote.cloudstudio.*` se escriben siempre;
`core.autocrlf` y `branch.<rama>.remote`/`.merge` son del USUARIO y en un repo preexistente
solo se escriben si no valen ya nada (y se dice cuáles se omiten).

Studio tiene UNA rama para los dos sentidos: se baja de `cloudstudio.rama` y se sube a
`cloudstudio.rama`. Hubo una rama de trabajo (`ramaDeTrabajo(origen)` = `xonecode/<origen>`,
creada perezosamente en la primera subida por `subida.ts`) para no escribir en la rama que
el cliente tuviera abierta en Studio, y el precio se vio al usarla: lo subido vivía en un
sitio que nadie mira —hay que ir a `xonecode/master` en Studio para verlo— mientras la rama
del proyecto se quedaba quieta, y una rama de trabajo que se abre en el navegador no es la
rama del proyecto. Se quitó entera: `ramaDeTrabajo`, el parámetro `ramaTrabajo` de
`subida.ts` y de `cambiosPendientes`, y **`crearRama` del puerto** —sin rama que crear, no
quedaba un solo llamador, y crear una rama a partir de sí misma no arreglaría el único caso
que quedaba (una `config.rama` que alguien borró en Studio: ahí el `switch` falla, queda en
`sync.log` y se relanza). Queda una ref, `refs/remotes/cloudstudio/<rama>`, y la escribe
`prepararRepo` en cada bajada, así que «lo que falta por subir» se mide siempre contra lo
último que consta arriba. **El servidor no fusiona** —`manage_branches("merge")` da una LISTA de
ficheros a fusionar, no un resultado— así que quien integra en la rama origen es el
usuario, en Studio. En local fusionaría git, que sí tiene el ancestro común (el commit de
la descarga), pero **eso todavía no está implementado**: `bajar` SOBRESCRIBE el disco y no
hay ningún `git merge` en el código. Lo único que protege el trabajo local es la guarda de
**árbol limpio, exigida en las dos direcciones** (`arbolLimpio`, en `crearSincronizador`,
antes de abrir sesión MCP): al subir porque se sube un commit y no un borrador, al bajar
porque el baseline se construye DESPUÉS de sobrescribir y sin commit no hay nada que
recuperar. `.xonecode/` no cuenta nunca —en el alta se escribe antes de que exista la
exclusión—, y una carpeta que aún no es repo solo está limpia si está vacía salvo por la
basura del sistema operativo (`.DS_Store`, `Thumbs.db`, `desktop.ini`: lista CERRADA, no
«los ocultos» — un `.env` o un `.gitignore` sí son trabajo del usuario y deben bloquear).
En macOS, una carpeta vacía abierta una vez en el Finder ya trae `.DS_Store`, y contarlo
bloqueaba el alta entera sin salida posible.

El alta completa son cuatro pasos (`cli/main.ts`), y cada uno solo aparece si falta lo que
decide: 1) cuenta —proveedor y modelo, solo si nadie eligió nunca, deducido del `origen`
con que resuelve el papel `trabajo` (`wizardInicial.ts#asistenteDeModelo`), nunca de una
marca de «primer arranque»—; 2) modo del proyecto (`offline`/`cloud`); 3) proyecto de
CloudStudio, su rama origen y la descarga; 4) modelo propio del proyecto, opcional, hereda
el global por omisión. **Sin TTY real** (`process.stdin.isTTY`) los cuatro se saltan
enteros en `main.ts` antes de intentar nada; `asistenteDeModelo` y `configurarModoInicial`
repiten además su propia guarda de `consola.interactivo`. Cancelar antes de elegir
proveedor, modo o proyecto no escribe nada; cancelar DESPUÉS de elegir proyecto dejó ya
`cloudstudio` y `modo: "cloud"` en disco a propósito —negarlo sería mentir—, así que
cancelar la rama cae a la primera disponible en vez de fingir que no pasó nada, y un fallo
de descarga deja dicho que reintentar con `/sync bajar`. Una credencial tecleada en el paso
de cuenta también queda escrita aunque el usuario cancele el paso de modelo que viene
después: el asistente lo dice en el momento, porque callarlo daría a entender que no se
tocó nada.

**La autorización de la subida es un hueco de política, no un prompt**
(`core/cloudstudio.ts#PoliticaDeAprobacion`): `subir()` no se puede invocar sin decir quién
autoriza, fail-closed por TIPO. Hoy solo está montada la interactiva, con el plan delante.
La autónoma —el juez decide que el trabajo está terminado y sube solo— está declarada pero
no implementada, y **el veredicto del juez no bastará solo**: exigirá además condiciones
que comprueba el código (verificador en verde, árbol limpio, nada pendiente de aprobar),
porque en este repo los avisos son código y no prompt precisamente porque a un modelo se le
puede pedir que avise y no avisa.

Dos trampas medidas: `core.quotePath` (por omisión `true`) cita en octal cualquier ruta con
bytes ≥ 0x80, así que un `ñu.xne` salía como `"\303\261u.xne"` y no coincidía nunca con las
rutas —en UTF-8 sin comillas— de `descargados`, rompiendo el candado en silencio para
cualquier proyecto XOne en castellano; `cambiosPendientes` fuerza `core.quotePath=false`.
Y sin `--no-renames`, un `A.xne` → `B.xne` sale como una sola línea de renombrado que solo
se queda con el destino: `B` sube y `A` se queda huérfano en Studio para siempre, sin
ningún aviso; forzando borrado + alta por separado, el borrado de `A` sí pasa por el
candado.

**Lo IMPOSIBLE sale del plan y se declara** (`core/planDeSubida.ts`, que devuelve
`{ operaciones, omitidas }`). El modo `chunked` NO está implementado —`subirBinario` del
puerto ni recibe el modo y el adaptador manda siempre `base64`—, y el borrado
(`borrarTexto`, sobre `studio_edit_file` con `editMode: "delete"`) es una tool de TEXTO,
así que un binario borrado no se puede propagar. Las dos cosas eran operaciones que
fallaban SIEMPRE, y como la ref solo avanza con `fallos` vacío, el siguiente `/sync`
recalculaba el mismo plan: la primera imagen borrada o el primer `.db` de más de 5 MB
dejaba `/sync subir` inútil de forma permanente. Ahora salen del plan como `omitidas`,
con motivo accionable, y se dicen por consola Y en `sync.log` —que sobrevive al turno—
mientras el resto sube y la ref avanza. Si no hay ningún «resto», la ref no se mueve: se
vuelven a declarar en cada `/sync`, que es la verdad.

**La sincronización con CloudStudio manda la INTENCIÓN, no la sintaxis** (mensaje `sync`,
`apps/web/src/componentes/CloudStudio.tsx`). Contesta una pregunta que hasta ahora solo tenía
respuesta en el terminal —«¿tengo algo pendiente ahí arriba?»— y sus dos botones **no son un
segundo camino de subida**: por el cable viaja `{clase:"sync", accion}`, y `estado` se MIDE en
el servidor (`arranque.ts#lecturaDeSync`, exportada) mientras que `subir` y `bajar` se ENCOLAN
en el lazo como `/sync subir` y `/sync bajar`, igual que la elección de modelo de Ajustes entra
por `/modelo …`. Esa asimetría es el diseño entero. Medir no puede abrir una sesión MCP:
`config.rama` y la ref local `refs/remotes/cloudstudio/<rama>` ya están en el disco, así que
preguntarle al servidor cuánto falta sería abrir OAuth para contar lo que ya se sabe. Y subir
SÍ tiene que ir por el camino de siempre, porque es donde viven el plan, la guarda de árbol
limpio y la aprobación interactiva: un segundo sitio por el que una subida se autorice es
exactamente donde el hueco de política que cierra `core/cloudstudio.ts#PoliticaDeAprobacion`
podría reabrirse. Encolarlas tiene además un efecto que se busca: quedan serializadas detrás
del turno en vuelo, que es lo que impide subir un árbol que el agente está escribiendo.

**Y es una BANDA de Revisión, no una pestaña.** Nació con la suya —la tercera de ACCIÓN, junto
a Chat y Tareas, presente siempre para que un proyecto que no está dado de alta tuviera dónde
leerse— y se mudó al mirar lo que contesta: «cuánto queda por subir» es la MISMA pregunta que
contesta Revisión —qué ha cambiado— medida contra otra referencia, la rama de la bajada en vez
de la foto de la sesión. Dos pestañas para dos referencias del mismo diff obligaban a ir y
volver para cuadrar los dos números, y el que se lee primero —«3 ficheros por subir»— no tenía
por qué estar a un clic del que explica de dónde sale. La mudanza no cambia nada del fondo:
sigue existiendo siempre (Revisión existe siempre), sigue mandando la intención por el lazo, y
sigue sin condicionarse a ningún dato. Lo que sí obligó es a **reescribir los cinco `return`
tempranos de `Revision.tsx` como una variable `cuerpo`**, y el porqué es de esta casa: la banda
es una RANURA y `CloudStudio` mide al MONTARSE, así que un estado temprano que se la llevara por
delante no escondería solo la cifra — **ni la pediría**. Y el estado que más la necesita es el
de la lista vacía, donde esa cifra es lo único que hay que mirar. Hay un test por estado.

**La medida se REHACE al entrar, y el motivo es un límite declarado.** La rama la puede mover
un `/sync` encolado, y arriba —en CloudStudio— puede cambiar algo desde fuera, pero el
servidor **no sabe cuándo termina una línea encolada**, así que tras `subir`/`bajar` no se
reemite ninguna lectura. La banda la vuelve a pedir al ENTRAR —su montaje, que ahora ocurre al
abrir Revisión— y con «Refrescar», y `App` la pide en el flanco de fin de turno si
Revisión está delante, porque el turno acaba de escribir y ese sí es un momento que el
servidor conoce. Es la forma de Ficheros y Revisión —se pide cuando NO hay dato y con
`conectado`, no al montar— con una vuelta de tuerca: aquí el dato caduca solo.

**Ausente no es «cero pendientes»**, y vale en las cuatro capas. Un proyecto que no está dado
de alta llega con `proyecto` y `rama` AUSENTES y la banda dice que no lo está en vez de
enseñar un `0` que nadie midió. `error` sale solo cuando no se pudo medir, y entonces **no
viene `pendientes`**: los dos juntos serían una cifra y su negación en el mismo mensaje.
`EstadoDeSync` nació como interfaz con NOMBRE por lo de siempre —unos campos embebidos dentro
de la unión no se pueden comparar con `camposDeInterfaz`—, y lo que se cae sin síntoma aquí es
la MEDIDA: un `pendientes` que no llegue se pinta como «no consta», que se lee como «no lo he
mirado» y no como «el store se lo comió».

**La cuenta que enseña tiene su límite, y está medido**: la da `cambiosPendientes` contra la
ref local, o sea `git diff <ref>`, que **no cuenta los ficheros que git no rastrea**. En un
turno no se nota —`commitDeTurno` hace `add -A`—, pero un fichero suelto sin añadir no entra en
la cifra. Es la MISMA cuenta que da `/sync estado` en el terminal, y por eso se declara en vez
de taparse: un número que no cuadra con el de al lado se lee como un fallo mucho antes que como
un límite.

**Y la costura está EXTRAÍDA y probada** (`arranque.ts#lecturaDeSync`). La medida vivía dentro
del manejador del cable —una composición de producción en un cierre que todos los tests
doblan, el patrón de fallo que este repo ya ha medido nueve veces—, y sacarla es lo que permite
probarla contra un repo de git DE VERDAD, con su ref, y comprobar de paso que un fallo de
medida no lleva ninguna ruta de la máquina en el mensaje.

**La cifra dice DE QUIÉN son los ficheros, porque son dos referencias y no una**
(`deLaSesion`, 16-09-2026). Medido mirando la pantalla del AppDemo: la banda decía «3 ficheros
por subir» justo encima de una sesión cuyo único cambio era borrar un fichero que una tarea de
fondo había creado —el alta y el borrado se anulan, así que la fila ni salía— y que por tanto
no estaba entre esos 3 NI PODÍA ESTARLO. Los dos números no discrepaban: eran de dos trabajos
sin nada en común. `pendientes` se mide contra la rama de la bajada y la lista de Revisión
contra los commits sellados de la sesión, y eso no se arregla cambiando una de las dos medidas
—son las dos correctas para su pregunta—, así que lo que faltaba era el CRUCE:
`cambiosPendientes` ∩ `cambiosDeSesion`, que ya existía entero, con `Subir` sin tocar. La otra
salida —que `Subir` subiera solo lo de la sesión— se descartó por cara y por peligrosa:
`marcarSubido` mueve la ref a HEAD, así que subir 1 de 3 y moverla retiraría los otros 2 —una
ref que afirma «esto ya está arriba» sin haber subido nada—, y esquivarlo pide un árbol
sintético (`read-tree`/`add`/`write-tree`/`commit-tree`) o un manifiesto en `sync.json`, que es
la segunda fuente de verdad que la cabecera de `gitSync.ts` prohíbe.

**Y el cruce solo vale con atribución de verdad: `via !== "git"` no atribuye**
(`arranque.ts#cuantosDeLaSesion`). `desde-apertura` es «todo lo que cambió desde que te
sentaste», y ahí dentro está el trabajo de otra sesión, de una tarea de fondo o de una persona,
así que su intersección con lo pendiente saldría igual de bien y sería una autoría afirmada
sobre quien lo escribió. Con `sin-marca` es peor: la lista viene VACÍA —que significa «no hay
antes que enseñar», no «no tocaste nada»— y el cruce daría un CERO limpio. **Ausente no es
cero, y aquí es la distinción entera**: ausente = no se pudo atribuir (sin sesión, o con una
sin sello); cero = se atribuyó y ninguno de los pendientes es suyo, que es un hecho medido y
exactamente el que hacía falta para entender la pantalla. Rellenar lo ausente con un cero
diría «esta sesión no ha hecho nada» sobre una sesión de la que no se sabe qué hizo. El dato
es nuevo en el cable y por eso hay que nombrarlo también en la lista blanca del store: sin
eso llegaría al mensaje y no al componente, sin un solo síntoma — lo caza el test de `tipos`.

**Con la subida al día, «Subir» no se ofrece — y la mitad que importa de la regla es que solo
se retira con un cero MEDIDO** (`CloudStudio.tsx`, 16-09-2026). Medido en la pantalla del
AppDemo: en la banda que dice «No hay nada por subir» seguían los dos botones azules, y uno de
ellos no llevaba a ninguna parte. `pendientes` sale de `cambiosPendientes` contra la ref de
seguimiento, que es **la MISMA cuenta que decide qué lleva el plan de subida**, así que un cero
medido es un plan vacío: ofrecerlo es prometer algo que no hay. Pero la regla hay que escribirla
por la mitad que **no** se cumple sola — con `pendientes` ausente (no consta) o con `error` (no
se pudo medir) el botón se QUEDA. Retirarlo ahí afirmaría «no hay nada» sobre una pregunta que
nadie ha contestado: es la invariante de las cuatro capas —ausente ≠ vacío ≠ cero— aplicada a un
control en vez de a una cifra, y la dirección segura es la que no esconde, porque un botón de
más se pulsa y el árbol sucio lo para, mientras que uno de menos no tiene vuelta. Los dos casos
tienen test propio, que es lo que impide que un `!pendientes` los barra al pasar. Y la nota de
debajo deja de nombrar «Subir» cuando el botón no está: una ayuda que describe un control
ausente manda a buscar lo que no hay, la misma regla que las teclas del compositor.

**Y la otra dirección se llama «Actualizar repo local», con el aviso de que PISA pegado al
control.** «Bajar» era direccional y decía la verdad; el nombre nuevo se entiende mejor sin
saber de dónde viene el fichero, y a cambio es **más suave que lo que hace**: «actualizar repo
local» se lee como un `git pull` —que fusiona y respeta lo tuyo— y esta operación SOBRESCRIBE la
copia local, que es exactamente lo que la guarda de árbol limpio existe para acotar y lo que la
nota declara. Por eso el aviso vive en el `title` del botón además de en la nota —quien lee la
nota ya ha decidido— y en **una sola constante** los dos sitios: dos copias de la misma frase
divergen, porque la de la nota se corrige cuando alguien mide algo y la del `title` nadie la
vuelve a leer. La clase CSS se queda en `.bajar` a propósito, que nombra la ACCIÓN del cable
(`alPedir("bajar")`) y no la etiqueta: igualarlas sería reescribir el protocolo para arreglar dos
palabras de la pantalla.

**En el modal de la web, «entero» no es «de golpe»** (`apps/web/src/plegarIguales.ts`). La
regla de esa pantalla es que el contenido se vea —es el paso donde se DECIDE sobre él— y por
eso no tiene el techo de 25 líneas de las pieles de terminal, que ahí es obligatorio porque el
recorte se pierde. Pero volcar el fichero de golpe escondía lo único que hay que mirar: medido
con un `login.js` de 35 líneas y un comentario añadido, la tarjeta enseñaba 40 filas y el
cambio había que buscarlo a ojo. Ahora las rachas SIN CAMBIOS se doblan en una línea que dice
cuántas son y se abren con un clic —el mismo trato que el chat le da al trabajo del agente: no
se borra, sigue a una pulsación—, y el diff del ejemplo pasó a 19 filas con el `+` arriba.
Cinco reglas:
- **Lo que cambió no se pliega nunca, y no hay techo.** Solo las rachas de `igual`, así que un
  fichero NUEVO —todo `anadido`— se sigue enseñando entero sin tocar nada.
- **Los extremos no son una excepción, son el caso corriente.** Una racha al PRINCIPIO no
  envuelve ningún cambio por arriba, así que solo conserva sus últimas líneas de contexto (y la
  del final, solo las primeras). Sin eso, un fichero con el único cambio en la línea 300 seguía
  abriendo con 300 líneas de cabecera a la vista.
- **Las líneas plegadas viajan DENTRO del tramo**, no su número: el diff ya está en memoria y
  pedirle al servidor otra vez lo que ya se tiene sería inventarse un viaje.
- **Una racha corta no se pliega** (`MINIMO_PLEGABLE`): cambiar dos líneas de contenido por un
  control que dice «… 2 líneas sin cambios» sale peor. El mínimo se mide sobre lo que se
  plegaría, no sobre la racha entera.
- **El contexto es 3 y no 2**: las dos de terminal compiten con un techo de 25 en una pantalla
  que no hace scroll; aquí la tarjeta sí, y tres es lo que deja ver la etiqueta que envuelve a
  un cambio en un `.xne`.

**Y el origen deja de decirse dos veces** (`agent/turno/interrupts.ts#aPendiente`). `hitlDe()` mete el
nombre del perfil en la `description` por necesidad —el interrupt no dice de qué subagente
viene, y `dev` y `mockup` comparten `write_file`—, pero las TRES pieles pintan además el campo
`origen` justo debajo: «[dev] quiere modificar un fichero del proyecto» y una línea después
«quién: dev». Una vez extraído, el prefijo se quita de la descripción, y se quita AHÍ y no en
cada piel porque el dato es uno y su sitio es `origen` — tres recortes a mano son tres sitios
donde divergir. Sin corchete no se toca nada: es el `Ejecutar <tool>` de reserva de
`collectPending`, que no pasó por `hitlDe`.

**La aprobación humana es fail-closed** (`cli/aprobar.ts`, `vendor/hitl.ts`). Aprobar ejecuta;
rechazar no toca nada, así que lo que no se entiende es **rechazo**. El Enter a secas solo
aprueba con un TTY de verdad detrás, y un rl ya cerrado (el EOF de un pipe que se agota durante
un turno, medido en e2e) responde con cadena vacía en vez de lanzar `readline was closed` y
dejar el interrupt colgado. **Esa cadena vacía sola NO rechaza**: aquí decía que sí y era
falso. Solo rechaza SIN TTY; con TTY es exactamente lo mismo que un Enter, y el Enter aprueba
— o sea que un Ctrl-D aprobaba una escritura. Por eso `pedirDecisiones` recibe además un
`eof` (`crearDetectorDeEof` en `cli/stdio.ts`, `eofDeStdin` para el stdin crudo del disparo
único) y una entrada agotada degrada la pregunta a no-interactiva, donde la cadena vacía ya
rechaza y el prompt enseña `[s/N]` en vez de mentir con `[S/n]`. El Enter sigue aprobando
mientras haya alguien: es deliberado, y quien lo pulsa tiene el diff delante. Tope de
`MAX_APPROVAL_ROUNDS = 5` rondas por turno.

**La FORMA de una pregunta viaja con ella** (`DecisionDeConsola` en `cli/aprobar.ts`,
`Consola.preguntar`, `componentes/Pregunta.tsx`). La tarjeta del navegador enseñaba un campo de
texto y un botón para CUALQUIER pregunta, incluidas las de sí o no; lo que faltaba era ver qué
se va a subir y poder contestar Aceptar/Cancelar sin teclear nada. La primera versión del
remedio deducía la forma del enunciado —si acaba en `[s/N]`, dos botones— y se descartó por dos
medidas. Una: el `[s/N]` es SINTAXIS, y la escribe el mismo sitio que decide su propio defecto.
`interpretAnswer` aprueba la cadena vacía solo si se le dice que hay un TTY de verdad delante
(`APPROVALS_TTY` frente a `APPROVALS_NO_TTY`), y `politicaInteractiva` no se lo dice a propósito
porque el Enter a secas no aprueba una subida: o sea que el enunciado cambia con el ENTORNO
mientras la pregunta no. Otra: el fallo sería asimétrico, mudo, y su dirección barata es la
peligrosa — un detector que no reconoce una decisión deja el editor, se teclea «s» y se autoriza
igual, así que no se nota hasta que alguien escribe una frase donde hacía falta decidir; el
error contrario manda una respuesta fija a una pregunta que quería texto (la URL del MCP, la
clave de API). Un detector que se equivoca en las dos direcciones y no avisa en ninguna es peor
que no tenerlo.

Entonces la INTENCIÓN viaja como dato, que es el mismo movimiento que `LineaDeConsola` («/» es
prosa o un comando, y lo DICE la línea): la función se comparte, la sintaxis no se exporta.
Cuatro detalles, cada uno con su coste medido:

- **El segundo parámetro es OPCIONAL, y es lo que deja quieto todo lo demás.** Una
  implementación con menos parámetros sigue asignándose a `Preguntar`, así que stdio, la TUI, la
  consola de una tarea de fondo y todos los dobles de los tests no cambian de una línea. Lo único
  que cambia es `politicaInteractiva`, que ya componía el plan para imprimirlo: ahora lo compone
  UNA vez y se lo pasa también a la pregunta.
- **La forma se AÑADE a lo que ya había.** El plan se sigue escribiendo línea a línea, así que el
  terminal, la tubería y el transcript de la web —un acto de sistema por línea— salen
  byte-idénticos; lo que viaja de más es el MISMO texto, dentro de la tarjeta, para que el paso
  donde se decide no dependa de un scrollback que puede estar a varias pantallas.
- **La tarjeta no es un `<form>`.** Sin campo no hay envío por defecto, así que el Enter no
  autoriza una subida: es la regla del terminal, y en el cliente era fácil de romper sin querer
  —bastaba envolver los botones en el formulario de al lado—. Y las dos respuestas que salen son
  `"s"` y `"n"`, el vocabulario que `interpretAnswer` ya lee: un «aceptar/cancelar» inventado en
  el navegador sería un segundo sitio donde el fail-closed puede dejar de estarlo.
- **La AUSENCIA se conserva de punta a punta, y es el dato que decide.** `undefined` no emite el
  campo, no lo guarda el store y devuelve el editor de siempre; un `{lineas: []}` sí pinta
  botones, porque la forma es la FORMA y no el contenido del plan — decidir por el número de
  líneas devolvería el editor justo cuando no hay nada que enseñar. El `case` del store es lista
  BLANCA (`mime`, `recetas`, `ejecutable`, `veredicto`), así que un campo que no se nombra ahí no
  llega: con el campo OPCIONAL no hay error que leer, y el síntoma es la pantalla de antes con
  todo en verde.

**La pista de tecleo se muda a la piel que tiene el teclado.** El `[s/N]` no es parte de la
pregunta: es la instrucción de CÓMO contestarla sin un control delante, y por eso la escribía
`politicaInteractiva` al formular el enunciado. En la tarjeta del navegador no hay campo donde
escribir esa «s», así que la pista sobraba —mandaba a teclear donde no hay dónde— y el enunciado
se lee como lo que es: la pregunta. Ahora `politicaInteractiva` pregunta «¿Subir a CloudStudio?»
a secas y la pista la añade cada piel que se contesta con el teclado, por la vía que ya existe
para saber que hay una decisión delante: `decision === undefined`. Es `PISTA_DE_DECISION`
(`cli/aprobar.ts`) y vale `" [s/N] "` siempre, también con TTY, porque aquí el ENTER a secas no
aprueba: la pista dice la verdad de esta pregunta concreta. Lo que `pedirDecisiones` hace con su
propio `[S/n]`/`[s/N]` es otra cosa —la aprobación de una escritura, donde el Enter sí aprueba
mientras haya alguien—, y de ahí que una decisión no pueda llevar una pista que varíe por
pregunta. **Se decide por el DATO y no buscando la pista dentro del texto**: buscar un `[s/N]`
sería leer la sintaxis que esa misma piel acaba de escribir, y la pista cambia con el entorno
mientras la pregunta no. Y el invariante no se toca: el Enter sigue sin aprobar una subida,
porque quien lo rechaza sin TTY es `interpretAnswer` y `politicaInteractiva` no le dice que hay
uno. Lo que cambió es DÓNDE se ve la pista, no qué hace cada respuesta.

**Y el plan de una subida dice qué le PASA a cada fichero, también como dato.** La tarjeta tenía
que enseñar de un vistazo lo que se añade, lo que se modifica y lo que se borra, y el primer
camino era leer el signo del texto —`+`, `~`, `-`—: el mismo error que deducir la forma del
enunciado, con el mismo síntoma mudo. El signo y la sangría los compone `consola.ts` al armar la
línea, así que el día que cambien el color saldría del sitio equivocado y nada avisaría; peor
aún, una ruta que empiece por `-` o un plan con otra indentación colorearían mal sin un solo
error que lo delate. Lo que hace falta ya estaba calculado: `core/planDeSubida.ts` conoce la
`clase` de cada `CambioLocal` y la TIRABA justo antes del cable. Ahora viaja entera —
`OperacionDeSubida.clase` en `core/cloudstudio.ts`, y `LineaDelPlan.cambio` en `cli/aprobar.ts`—,
y el signo se DERIVA de ella en vez de al revés. Tres consecuencias que son el porqué del
reparto: el `tipo: "borrado"` no lleva `clase` porque su `tipo` ya lo dice (un dato repetido es
un dato que puede contradecirse); la cabecera del plan la lleva AUSENTE porque no habla de
ningún fichero, y esa ausencia es lo que la deja en el color neutro; y un `cambio` que no se
entiende pierde el COLOR, no la línea ni la decisión —perder la decisión devolvería el campo de
texto, donde teclear «s» autoriza igual, así que el fallo barato sería el peligroso—. El cambio
de signo que trae es deliberado y se dice: `~` es una modificación (antes iba con `+`, que
confundía un fichero que se reescribe con uno que aparece) y `+` un añadido. Los colores salen de
los alias de ESTADO por tema (`state-success-primary`, `state-error-primary`,
`state-business-primary`), que es el par que ya usa la pastilla de «compartido»; el ámbar que el
diseño pedía no existe como alias en la paleta, y un literal no cambiaría con el tema —y el azul
de la marca no vale aquí, que el cian y el azul son ACENTO y no un estado—.

**Y esa tarjeta es un DIÁLOGO, no un renglón de la columna del chat.** Nació —y así se entregó
en `5301f34`— como una tarjeta más del hilo: hermana de `Transcript`, montada entre él y
`Compositor` dentro de `.centerCol` (`AppFrame.module.css`: `display:flex; flex-direction:column;
overflow:hidden`). Medido en el uso normal, salía en el FONDO de la pantalla: la columna la
reparte el transcript, que es el único hijo elástico, así que la tarjeta caía justo encima del
compositor — y los botones que la provocan están ARRIBA, en la banda de la sincronización, dentro
de Revisión. Es decir que el sitio donde se decide y el sitio donde se pregunta estaban en dos
extremos de la pantalla. No se arregla centrándola EN su sitio: moverla al medio de una columna
flex es empujar al transcript, que es quien reparte el alto.

Se levanta a diálogo con el MISMO patrón de puerta que la aprobación (`Aprobacion.tsx`): el
`Modal` del paquete de primitivas —portal a `document.body`, `role="dialog"`, `aria-modal`,
`aria-label` con el enunciado, y su escucha de `Escape` en el documento— más un velo propio
centrado con `place-items: center`. Cuatro cosas se midieron al hacerlo, y las cuatro son
trampas que no avisan:

- **El `dialog` del primitivo no trae POSICIÓN.** Sus 22 CSS Modules son stubs vacíos en este
  release candidate, así que sin una capa propia con `position: fixed; inset: 0` la tarjeta se
  pinta al final del `body`, DEBAJO de la aplicación. Es el mismo caso que `Aprobacion` y
  `NuevaSesion`, y por eso `.capa` se repite en la tercera.
- **El velo es NUESTRO, no el del paquete.** Su `mask` es un `<div aria-hidden="true">` sin clase
  y sin CSS: mide cero y nadie puede pulsarlo, aunque su `onClick` sí llame a `onClose`. El velo
  que el usuario ve lleva su propio manejador con `evento.target === evento.currentTarget`, que es
  lo que distingue «fuera» de «dentro» —un clic en un botón burbujea hasta ahí—.
- **`box-sizing: border-box` en el velo no es higiene.** En este cliente no hay reset global, así
  que `width`/`height: 100%` con `padding: 24px` dan un 100% + 48 px: el velo desborda la capa por
  la derecha y por abajo, y la tarjeta, centrada en ESA caja, sale 24 px a la derecha y 24 px por
  debajo del centro. Ya estaba medido en `Aprobacion.module.css`; `NuevaSesion.module.css` lo
  tiene pendiente y ahí NO se toca —arreglarlo movería los cinco diálogos que ya lo usan, y eso es
  otro cambio y otra medida—, ni se reusa su hoja.
- **Las dos pistas de la rejilla van explícitas** (`minmax(0, 1fr)` en fila y columna): la
  implícita es `auto`, o sea max-content, y una línea larga del plan estiraba la tarjeta hasta
  sacarla de la pantalla aunque el `overflow` del `.plan` la dejara desplazable por dentro.

Fail-closed, y aquí con una diferencia DELIBERADA con la aprobación: solo «Aceptar» autoriza;
`Escape` y el clic en el velo RECHAZAN; y desmontar NO contesta nada, mientras que allí
desmontarse sin contestar es un rechazo. La razón es de dónde viene el desmontaje —allí lo provoca
quien monta la pregunta, así que «desmontada» y «sin contestar» son el mismo suceso; aquí lo
provoca el store al llegar la pregunta siguiente, y confundirlos sería inventar una decisión que
nadie tomó—. Lo que quede sin contestar lo salda el plazo del servidor
(`consolaWeb.ts#MS_DE_ESPERA_POR_OMISION`, 10 min) devolviendo cadena vacía, que `interpretAnswer`
ya lee como rechazo: el retraso, nunca la dirección.

Y el test que impide la vuelta atrás no mira el CSS —en jsdom no hay layout—, mira el PORTAL: el
diálogo está dentro de `document.body` y FUERA del contenedor que monta el test
(`container.contains(dialogo) === false`). Es la propiedad que se buscaba; si alguien la devuelve
a la columna, el test cae aunque el centrado pareciera bien en una captura.

**El recorrido de una sincronización se cuenta en la BANDA, no en el hilo** (acto
`sincronizacion` en `core/actos.ts`, `Consola.anotarSincronizacion?`, `componentes/CloudStudio.tsx`,
16-09-2026). Medido en la pantalla que él mandó: pulsar «Subir» dejaba **nueve renglones de consola
cruda entre dos mensajes de la conversación** —la raya de sesenta guiones, `SUBIDA A CLOUDSTUDIO — 3
operaciones`, las líneas `+`/`~`/`-` con su sangría, el `→ APROBADO` y el `subidos 3, fallaron 0`—.
Son dos problemas y los dos cuentan: **estorba**, porque el hilo es la conversación y una operación
de git es un suceso del proyecto, y cada subida deja ahí una docena de actos que además se
persisten en el `.jsonl` y reaparecen al reabrir; y **se ve feo**, porque lo que se pinta son
líneas de consola sin la forma que el chat le da a lo que sí es suyo. Lo que se pidió fue un
registro por sesión, leído donde ya vive la banda: en Revisión.

Se hace con un ACTO NUEVO y no con un fichero ni un mensaje nuevo del cable, y eso es lo que
compra el «registro por sesión» sin inventar nada. El acto entra por el mismo camino que todos
—`transporte.emitir` → store → `Chat`/`Trazas`—, se persiste por `volcar()` →
`sesiones.ts#anotarActo`, y **reaparece al reabrir la sesión**, que es literalmente lo pedido. Un
fichero propio habría que abrirlo, leerlo, reemitirlo y borrarlo al borrar la sesión; un mensaje
nuevo del cable tendría que pasar por las dos listas blancas —el store y `arranque.ts`— y por un
`case` más en cada piel, y ninguna de las dos cosas da nada que el acto no dé. Los tres
guardianes que el repo ya tiene obligan a decidir en los tres sitios donde hay que decidir:
`TIPOS_DE_ACTO` es `satisfies Record<Acto["tipo"], true>`, el `switch` de `filasDe` cierra con
`never`, y `tipos.test.ts` compara los literales del cliente contra `src/core/actos.ts`. **Aviso
sobre el tercero**: `apps/web/**` no lo tipea ningún script de `npm`, así que las dos redes de
`tsc` solo disparan en el editor; de ahí que la comparación de `tipos.test.ts` exista como TEXTO.

**Dónde se cuenta es una propiedad de la PIEL, y no una bandera de la línea.** El recorrido entero
de una operación sale hoy por UNA costura que ya existía: el callback `informar` que `/sync` le
pasa a `consola.sincronizar`, más lo que escribe el propio comando. Al puerto se le añade un
método **OPCIONAL** (`anotarSincronizacion?`), con la misma asimetría que `fase?`, `razonamiento?`
y `notificacion?`: **stdio, la TUI, la consola de una tarea y los dobles de los tests no cambian
una línea**, y la tubería sigue byte-idéntica — lo que se toca es `politicaInteractiva`, que
recibe el sumidero para que el plan, la raya y el `→ APROBADO` vayan por donde va lo demás;
dejarlos en `consola.escribir` habría dejado en el chat justo los renglones señalados. La
alternativa era una bandera en `LineaDeConsola` (`comoComando`), y se descartó porque decidiría
POR LÍNEA lo que es una propiedad del destino: la misma `/sync subir` en el terminal **debe**
imprimir su recorrido. Y el invariante que esto compra, que es la razón de no recomponer nada:
**lo que el registro guarda es exactamente lo que el terminal habría impreso** — ni un resumen, ni
una versión maquetada—. Solo se le quita el `\n` final, que es del scrollback y no del dato, y las
líneas vacías; **la raya de sesenta guiones SE QUEDA**, y es deliberado: filtrar una línea por su
aspecto sería maquetar por la puerta de atrás, y ese filtro es justo el que se lleva por delante
la siguiente cabecera que alguien añada.

La operación se entrega en un `finally`, y no por higiene: **`crearSincronizador` puede LANZAR**
—`piezas.limpio`, `descargar`, `subirProyecto` y el `sesion.cerrar()` de su propio `finally` son
todos `await` de cosas que tocan red y disco—, y con las líneas acumuladas una excepción se
llevaría por delante todo lo que ya se había contado, que en un scrollback append-only no se
perdía. **La excepción se deja propagar**: un fallo inesperado lo dice el harness en el hilo, que
es donde tiene que verse, y esconderlo dentro de un bloque plegado sería lo contrario de lo que
este cambio busca. Y `cuando` se captura ANTES del `await`: es el instante que se recuerda, y así
una subida larga no se fecha al final.

**Dos cosas NO entran en el registro**, a propósito: el enunciado de la pregunta («¿Subir a
CloudStudio?»), que no es una línea de la operación sino el argumento de `preguntar` —la cabecera
ya dice qué operación fue y el `→ APROBADO` dice cómo acabó—, y los dos errores de USO de `/sync`,
que no son una operación y son el mismo tipo de mensaje que el de cualquier otro comando mal
escrito.

**Y en la web el enunciado de una DECISIÓN deja de anotarse** (`consolaWeb.ts#preguntar`). Con
`decision` puesta el texto ya viaja en el mensaje `pregunta` y `Pregunta.tsx` lo pinta como TÍTULO
del diálogo, así que anotarlo era duplicarlo — y era **la última línea de sincronización que
quedaba en el hilo**, justo entre dos mensajes de verdad. La anotación solo se salta cuando la
pregunta NO lleva forma: las de texto libre y los secretos conservan su copia en el transcript,
que es donde se contestan, y sin ella quedaría una respuesta sin pregunta. Lo que la tarjeta
enseña no cambia: la decisión sigue viajando ENTERA, con su plan.

En el cliente, el registro se pinta **debajo de los botones y la nota**, en los SEIS estados de
Revisión, porque la ranura `cloudstudio` se pinta en los seis y `CloudStudio` mide al MONTARSE —un
`return` temprano no escondería solo la cifra, ni la pediría—. Cada operación es una cabecera
`acción · sello` y sus líneas en un `<pre>`, **la más reciente ABIERTA y las demás plegadas** (se
remonta por `key` en vez de reusar el nodo, que heredaría el plegado de la anterior; y el
`<summary>` no lleva `display: flex`, o el triángulo de despliegue se pierde en WebKit). La
etiqueta usa el nombre del BOTÓN —«Subir», «Actualizar repo local»— porque la banda es donde se
pulsa, mientras que Trazas conserva el nombre del PROTOCOLO (`SUBIR`, `BAJAR`, `ESTADO`) porque
allí se viene a depurar el harness. Y ausente es «no ha pasado nada»: sin operaciones no se pinta
ni la cabecera del bloque, otra vez ausente ≠ vacío.

**Límite declarado**: recargar la página con una decisión PENDIENTE pierde la pregunta —la reemite
la aprobación en vuelo, pero una `pregunta` no—, y es anterior a este cambio. Lo que sí sobrevive
es el registro: la operación ya entregada está en el transcript del servidor y vuelve en la
ráfaga de reemisión. Y una consecuencia de cómo Trazas numera los turnos —por el acto de
`usuario`—: una fila de sincronización cae en el turno ANTERIOR, exactamente igual que las de
`sistema` desde siempre.

**La foto del ANTES** (`agent/turno/instantanea.ts`) es un árbol de git en un `GIT_INDEX_FILE`
privado: no necesita commits, no necesita que el proyecto sea la raíz del repo, y no toca el
índice del usuario. Se toma **por turno**, no por sesión.

**Modelos por papel** (`core/modelos.ts`): `rapido` (corre en todos los turnos), `trabajo`
(desarrolla), `afilado` (reservado al juez). Por omisión, Ollama local. Precedencia:
`--modelo-<papel>` > `--modelo` > `XONECODE_MODELO` > proyecto > global > omisión, y cada valor
recuerda su `origen` para que `config`/`describe` lo digan.

**El catálogo de modelos** (`agent/config/catalogoModelos.ts`, puerto `CatalogoModelosPort`):
`/modelos <proveedor>` consulta el catálogo VIVO del proveedor, filtra los de conversación y
guarda la elección en la config global. `ErrorCatalogoModelos` es un error publicable: nunca
lleva la clave ni el cuerpo remoto. Ollama local (`OLLAMA_BASE_URL`) y Ollama Cloud
(`https://ollama.com`) son dos hosts distintos y no se mezclan.

**Los tokens de una sesión se cuentan y se enseñan en DOS cuentas que no se suman**
(`core/ports.ts#ConsumoDeSesionPorCuenta`, `agent/subagentes/consumoExterno.ts`, mensaje `consumo`,
`componentes/ContadorDeTokens.tsx`). La web no tenía NINGÚN contador —`tracker` no aparecía ni
una vez en `src/web/`—, así que la piel por OMISIÓN era la única sin ver un token:
`formatearBarra` es de terminal y la TUI lo pinta en su sidebar. Y del agente EXTERNO se tiraba
entero, teniéndolo los dos motores: Claude Code lo da en `result.modelUsage` —que su propia doc
marca como «the correct field for token/cost accounting», por encima de `usage`, que es solo del
bucle principal— y Codex en `thread/tokenUsage/updated`, que **estaba en la lista de RUIDO** de
su adaptador, o sea que llevaba llegando desde el primer día y se descartaba a propósito.
Siete reglas:
- **Los dos son ACUMULADOS: se lee el último, no se suman.** Lo dicen sus dos contratos con esas
  palabras, y es la diferencia entre contar y contar el doble. Entre ejecuciones SÍ se suma:
  cada `correr` es otra sesión del producto.
- **Se suman TOKENS, nunca COSTE.** Los del grafo van contra la clave de API del usuario y los
  del hijo contra su suscripción: un token es un token, pero su precio no es comparable. Por eso
  las dos cuentas viajan SEPARADAS hasta el componente, que suma las cifras y pone el desglose
  en el `title` — el día que se quiera coste, ese es el sitio donde no se puede hacer, y se ve.
- **La caché va aparte de la entrada**, como en `vendor/tokenTracking.ts`: meterla dentro
  inflaría la cifra que se enseña.
- **De Codex se lee `total` y no `last`** —`last` es lo que ocupa la ventana en ese momento— y
  `reasoningOutputTokens` **no** se suma a la salida: por su esquema ya va dentro.
- **Se cuenta también cuando el turno acaba en ERROR.** Esos tokens se gastaron igual, y contar
  solo los éxitos haría bajar la cifra justo en los turnos que más cuestan, que es cuando más
  interesa mirarla.
- **Ausente es «no consta» y entonces NO SE PINTA.** Sin sesión, o con el ejecutor de pega, no
  hay número: un contador a cero que nadie ha medido es la cifra inventada de siempre. Se tira
  al caerse el cable, como los modelos. Y los tokens de un turno de SEGUNDO PLANO no mueven el
  contador de quien mira otra sesión: solo avisa la consola en foco.
- **Y con ellos viaja la VENTANA, que es OTRA pregunta**: `contexto` es la entrada de la ÚLTIMA
  llamada —cuánto ocupa el historial AHORA, la cifra que avisa de que toca resumir— y los
  acumulados dicen lo que la sesión ha costado. La barra del terminal ya las pinta como dos
  cosas. El TOPE se resuelve con **la misma función** que esa barra
  (`cli/main.ts#crearTopeDelModelo`), que entra por la opción `topeDeContexto` para no importar
  `cli/` desde `web/` —el motivo de `crearEjecutor`—: dos resoluciones serían dos porcentajes
  distintos para el mismo modelo. Se re-resuelve en cada emisión porque `/modelo` cambia en
  caliente. **Sin tope no se pinta denominador ni porcentaje**: con Ollama no hay a propósito, y
  un porcentaje sobre un número inventado es una mentira con forma de cifra.

Lo que NO hay todavía es la vista AGREGADA: por proyecto y por histórico. El total de UNA sesión
ya vive en su índice (ver «El gasto de una sesión vive en el ÍNDICE»), así que lo que falta no es
un `reduce` sino una pantalla — y el COSTE no se puede sumar entre cuentas, así que una métrica
global de dinero no es una cifra que falte: es una pregunta que hoy no tiene respuesta honesta.

**Los totales de una CONVERSACIÓN sobreviven a cerrarla** (`core/actos.ts#ConsumoDeTurno`,
`#sumarConsumo`, `#consumoDeLosActos`, `core/ports.ts#consumoPersistible` / `#consumoDeLaSesion`,
`pielWeb.ts#deltaDelTurno`, `vestibulo.ts#consumoHistorico`). El contador del compositor enseñaba
lo que llevaba el PROCESO, no la conversación: el acumulador vive en el cierre de
`abrirSesionReal` y arranca de cero en cada arranque, así que cerrar la consola y volver a abrir
la sesión ponía la cifra a cero hasta el primer turno nuevo. Medido en la piel: con la sesión
`20e2ed00` reabierta tras reiniciar el servidor, ningún `fin` del `.jsonl` traía consumo y el
compositor no pintaba nada. Cuatro decisiones:

- **Lo que se estampa en el `fin` es el DELTA del turno, no el acumulado.** Un acumulado de este
  proceso es un absoluto de una escala que cada arranque reinicia — sumar dos de esos no da nada,
  y reabrir tres veces triplicaría el total. Los deltas, en cambio, suman lo mismo dentro de un
  proceso que repartidos en tres. El precio es que la piel tiene que recordar lo que ELLA estampó
  (`estampado`) y restarlo: por eso el primer `fin` de un proceso estampa el acumulado entero
  —hasta ahí no había ningún `fin` al que restarle— y no una resta contra ceros.
- **La base histórica se lee UNA vez, al abrir** (`consumoDeLosActos(reabierta.actos)`), y el
  `.jsonl` no se vuelve a mirar. El fichero CRECE por debajo mientras el proceso vive —`volcar()`
  anota cada turno—, así que releerlo a mitad de sesión contaría dos veces los turnos que ya
  están en el tracker vivo. Y la resta del delta es contra lo estampado y **nunca contra la
  base**: si la base entrara ahí, el primer `fin` de una sesión reabierta estamparía lo de antes
  como si se hubiera gastado otra vez. Por eso `vestibulo.ts` mantiene las DOS lecturas separadas
  (`consumoVivo` para la piel, la suma para la pantalla) y **quien suma es el servidor**: el
  cliente no suma nada. Verificado de punta a punta: `2168 + 8786 = 10954` de entrada con la
  sesión reabierta en un proceso nuevo, y el compositor enseñando `↑ 11k entrada · ↓ 29 salida`
  antes de que corriera ningún turno.
- **Un `contexto` de cero sale SIN `ventana`** (`core/ports.ts#consumoPersistible`). El ejecutor
  declara `contexto: number`, así que un turno que no pudo medir la ventana llega con un cero; y
  `consumoDeLosActos` se queda con la última ventana que CONSTA, así que ese cero falso borraría
  el nivel que sí midió el turno anterior — justo lo que su propia regla dice que no puede pasar.
  Cero no es un nivel: un historial con turnos dentro nunca ocupa nada. Lo encontró el test de
  ida y vuelta `consumoPersistible`/`consumoDeLaSesion`, que compara las dos formas; la vuelta sí
  traduce ausencia a `contexto: 0`, porque el `> 0` de quien pinta ya distingue los dos casos.
- **Ausente es «no consta» en las cuatro capas**: un `fin` sin `consumo` (sesión anterior a
  esto, o una piel que no mide) no se pinta, un `{0,0}` tampoco (`hayCosteQueEnsenar`), y
  `consumoDeLosActos` devuelve `undefined` cuando NINGÚN `fin` lo trae. Distinguir «anterior» de
  «gastó cero» es lo único que impide pintar el cero que nadie midió.

**Y mirar la pantalla encontró dos defectos que ningún test veía**, los dos en `Chat.tsx`, con el
contador ya funcionando:

- **El `fin` cerraba el último tramo de pulso de la LISTA ENTERA**, no el de su turno: un turno
  sin herramientas le robaba a la línea del turno anterior su duración y su coste. Se ve en
  pantalla —la línea del turno con `read_file` pasó de `2.6s · ↑ 8,8k ↓ 24` a `5.9s · ↑ 3,4k ↓ 4`
  en cuanto corrió un turno de una sola palabra—. El remedio es que el bucle lleve su propia
  lista de tramos del turno en curso (`delTurno`) y los cierre al llegar el `usuario` o el `fin`;
  y un turno sin trabajo pinta su propia línea (`CierreDelTurno.tsx`) en vez de no pintar nada.
  Los cuatro tests del `describe` «lo que costó cada turno» mueren con el mutante: volver a
  `ultimo` deja dos de ellos en rojo.
- **Las flechas no significaban nada al oído.** `↑ 8,8k ↓ 24` es claro mirándolo, pero quien lo
  oye recibe `8,8k 24` sin saber cuál es cuál, y el `title` no se anuncia de forma fiable: cada
  signo va `aria-hidden` y el significado entero va en el `aria-label` de la caja. Un control sin
  dato detrás no se pinta; un dato sin significado detrás tampoco.

**Un formato para la misma cifra** (`apps/web/src/cifras.ts`). El abreviador vivía dentro de
`ContadorDeTokens.tsx` y de ahí salían DOS formatos para el mismo dato en la misma pantalla: el
contador escribía `3,3k` y la barra de estado `3269/1000000`, porque `formatearContexto` no lo
conocía. Sube a su propio módulo y lo importan el contador, la barra y el cierre del turno — dos
formatos para un dato es cómo el usuario aprende a desconfiar de los dos. Y la regla del decimal
se afinó al moverlo: se formatea y se tira el `,0` final, porque entre `1,2k` y `1,9k` la
diferencia importa y entre `1,0M` y `1M` no hay ninguna —el `,0` era lo que hacía ilegible el
tope de contexto, que se enseña en cada turno—.

**La ventana se mudó de sitio, y no por estética** (`componentes/BarraDeEstado.tsx`). En el
compositor compartía fila con los acumulados y se leía como una tercera cuenta de lo gastado,
cuando contesta la pregunta contraria: cuánto margen queda antes de que toque resumir. El
compositor se queda con los dos totales de la conversación —lo que se mira mientras se escribe—
y la barra con el `ctx` y su tope. `PiezasDeLaBarraDeEstado` existía desde el principio con el
`contexto`/`tope` declarados y MUERTA, porque ningún mensaje del cable traía el dato; ahora lo
trae `ventana {usado, tope?}` del mensaje `consumo`.

**Los proveedores compatibles con OpenAI son una TABLA, no tres ramas más**
(`core/modelos.ts#COMPATIBLES_OPENAI`). NVIDIA (`integrate.api.nvidia.com/v1`,
`NVIDIA_API_KEY`), Groq (`api.groq.com/openai/v1`, `GROQ_API_KEY`) y xAI —los modelos
`grok-*`— (`api.x.ai/v1`, `XAI_API_KEY`) publican la misma API que OpenAI, así que son tres
filas de datos con URL base y variable, y quien las consume tiene UNA rama genérica: el
cliente es `ChatOpenAI` con `configuration.baseURL`, y el catálogo un `GET /v1/models`. La
lista de proveedores DE SERIE sigue cerrada —el cuarto compatible es otra fila del repo—,
y lo que la cierra es política y no incapacidad del adaptador. Un endpoint que no está en
esa tabla se da de alta como proveedor PERSONALIZADO (párrafo siguiente), que es el mismo
mecanismo con la fila puesta por el usuario en vez de por el repo. Cinco reglas:
- **La clave se EXIGE al construir** (`agent/config/modelos.ts#construirCompatibleOpenAi`), al
  revés que el caso de `openai`, que la pasa tal cual. `ChatOpenAI` sin `apiKey` se la
  busca él en `OPENAI_API_KEY`: sin la guarda, un `NVIDIA_API_KEY` sin poner haría que la
  clave de OpenAI del usuario viajara a `integrate.api.nvidia.com` con la primera
  petición. Hay test.
- **Los tres casos van enumerados en el `switch`**, no en un `default`: así el switch sigue
  siendo exhaustivo y añadir un proveedor da un error de compilación en vez de construir un
  cliente equivocado en silencio.
- **El filtro del listado es el genérico** (`esIdConversacional`) y no el de OpenAI: aquí
  los ids no siguen sus familias (`meta/llama-3.3-70b-instruct`, `grok-4`), así que exigir
  un prefijo conocido dejaría la lista vacía. Se descarta solo lo que con certeza no es de
  conversación, y por eso «embedding» pasó a «embed» y se añadió «rerank» — NVIDIA nombra
  los suyos `nv-embedqa-e5-v5` y `nv-rerankqa-1b-v2`, que no contienen «embedding».
- **El contexto solo si el servidor lo dice** (`context_window`; por su documentación lo
  manda Groq y los otros dos no, pero eso NO está medido contra los endpoints reales — se
  lee si viene). `core/contextos.ts` no tiene tabla para estas familias y no se le inventa
  una: sin tope no hay porcentaje, que es la respuesta honesta. Nada de este párrafo se ha
  comprobado contra los servidores: las URLs y las variables salen de su documentación, y
  la primera llamada de verdad con una clave es lo que las confirma.
- **Y la variable de entorno de cada proveedor vive en UN sitio**
  (`core/modelos.ts#VARIABLES_POR_PROVEEDOR`). Había CUATRO copias —`configEnDisco.ts`,
  `catalogoModelos.ts`, `cli/config.ts` y `cli/consola.ts`, duplicadas para que `cli/` no
  tirase de `agent/` por un mapa de cuatro líneas— y ya habían divergido: la de
  `cli/config.ts` no tenía `OLLAMA_API_KEY`, así que `/config` decía «sin credencial» de un
  proveedor que la tenía puesta. En `core/`, que es datos puros, los dos lados tiran del
  mismo sitio; `configEnDisco.ts` la reexporta con su nombre de siempre. Un test recorre
  `PROVEEDORES` y exige que la tabla nombre exactamente a los que no están en
  `SIN_CREDENCIAL`, y que ninguna variable se repita.

**Los proveedores PERSONALIZADOS son la misma tabla, con la fila puesta por el usuario**
(`core/modelos.ts`, `agent/config/configEnDisco.ts#guardarProveedorPersonalizado`, Ajustes →
Proveedores). Un endpoint compatible con OpenAI —LM Studio, `llama.cpp --server`, vLLM, un
servidor de la empresa— se da de alta con NOMBRE y URL base, y a partir de ahí es un
proveedor más: `custom:<slug>/<modelo>` se teclea igual, se elige igual en la pastilla y su
catálogo sale del mismo `GET <baseUrl>/models`. Ocho reglas:
- **El tipo es una PLANTILLA, no una entrada más de la lista.** `ProveedorPersonalizado` es
  `` `custom:${string}` ``, y `parsear` lo acepta por su FORMA sin mirar ningún registro —
  así sigue siendo una función pura y la usan igual el `.md` de un agente, `--modelo` y el
  cable. Que el slug esté dado de alta se comprueba al construir el cliente y al pedir el
  catálogo, con un mensaje que dice dónde darlo de alta. El `switch` de `construirModelo`
  sigue siendo exhaustivo sobre los de serie: el personalizado se resuelve ANTES.
- **Se guarda SOLO en el `config.json` global, y el del proyecto se rechaza con un aviso
  GRAVE.** No es purismo de ámbito: la clave vive en `auth.json` bajo el identificador, así
  que un proyecto que pudiera redefinir la `baseUrl` de un slug ya dado de alta mandaría esa
  clave al host que él dijera. Un `config.json` de proyecto puede venir de fuera; el global
  es del dueño de la máquina.
- **El identificador se DERIVA del nombre** (`slugDesdeNombre`, en el servidor y solo ahí:
  derivarlo también en el cliente sería una segunda copia de la regla). Un tercer campo en
  el formulario solo se puede escribir mal.
- **La variable de entorno también se deriva** (`XONECODE_CLAVE_<SLUG>`), no se guarda. Con
  eso `aplicarAuth`, `guardarCredencial`, el constructor del cliente y el catálogo siguen
  funcionando sin enterarse de que estos proveedores existen. `aplicarAuth` recorre ahora lo
  que HAY en `auth.json` y no `PROVEEDORES`: si no, la clave de un personalizado no se
  aplicaba y el catálogo decía que faltaba una credencial escrita ahí mismo.
- **La URL pasa la MISMA regla que un MCP** (`motivoDeEndpointInaceptable`, ahora en `core/`
  y de donde tira `cloudstudioMcp.ts`): https fuera de la máquina, `http://` solo en
  loopback, nunca credenciales dentro. Loopback es el caso PRINCIPAL y no la excepción — LM
  Studio escucha en `http://localhost:1234/v1`.
- **Un slug que ya existe se RECHAZA, no se pisa.** Dos endpoints con el mismo identificador
  compartirían entrada en `auth.json`: la clave del segundo viajaría al host del primero.
  Para cambiar una URL hay que dar de baja y volver a dar de alta — no hay «editar» todavía,
  y se dice.
- **La baja se lleva la credencial**, y la confirmación lo dice. Una clave en `auth.json`
  bajo un proveedor que ya no existe no se puede mandar a ninguna parte, pero sigue siendo
  un secreto en disco que nadie volvería a ver para borrarlo.
- **La clave NO viaja en el alta.** El formulario son dos campos, nombre y URL; la
  credencial se pone después con el mismo `{clase:"credencial", accion:"pedir"}` de los de
  serie, o sea por el ÚNICO mensaje del cable que lleva credenciales. Y el resultado del
  alta vuelve en un mensaje propio (`{clase:"proveedor", hecho, motivo?}`) y no por
  `informar`: la ventana de ajustes no pinta el transcript, así que un fallo contado como
  acto de sistema sería mudo justo donde hay que leerlo — el mismo motivo por el que el
  aviso del selector viaja EN el selector durante el alta. El formulario se cierra cuando el
  servidor dice que se hizo, no al pulsar.
Lo que hoy NO llega: el asistente de cuenta del terminal (`cli/wizardInicial.ts`) recorre
`PROVEEDORES`, así que un personalizado no aparece en el alta — se elige con `/modelo
custom:<slug>/<modelo>` o desde la pastilla. Y nada de esto se ha probado contra un servidor
real: la primera llamada con una clave es lo que lo confirma.

**Configuración y credenciales** (`core/config.ts`, `agent/config/configEnDisco.ts`): `config.json`
lleva modelos, `modo`, `cloudstudio`, `contextos` (topes de ventana fijados a mano,
«proveedor/modelo» → tokens) y **rechaza claves de API**; las credenciales van solo en
`~/.xonecode/auth.json`, modo 0600, y se escriben con `/provider <nombre>`. El ESCRITOR de
`auth.json` es `agent/config/authEnDisco.ts` (el lector, `configEnDisco.ts`), y su contrato es que una
escritura nunca destruye lo que había: la base de la fusión es el objeto CRUDO —no el resultado
de `validarAuth`, que descarta entradas raras en silencio— y ante un JSON roto **para sin
escribir** en vez de recuperar el fichero por su cuenta.

**La creación de proyecto al arrancar** (`core/esqueleto.ts`, `agent/config/crearProyecto.ts`,
`cli/main.ts`). Si al abrir la consola falta `app.xml`, se ofrece crearlo (omisión **No**:
crear ficheros es opt-in, como las aprobaciones) y cuatro preguntas deciden el esqueleto.
QUÉ se escribe son datos puros en `core/` —todo del «Hola Mundo» de la documentación XOne,
nada inventado: XOne ignora en silencio lo inventado—, y `agent/config/crearProyecto.ts` solo lo
ejecuta: **nunca pisa un fichero existente**, lo salta y lo declara en el informe.

**La barra de estado y el contexto** (`core/contextos.ts`, `vendor/tokenTracking.ts`). La
barra se compone en `formatearBarra` (pura, porque solo se pinta con TTY y los tests no
pueden ser TTY) y lleva `ctx`: el input de la ÚLTIMA llamada (`tracker.contexto`, no la
suma acumulada) contra el tope de `core/contextos.ts`. La tabla es por familias conocidas;
**ollama no tiene tope a propósito** (cada modelo local trae el suyo), y el porcentaje solo
se calcula si hay tope — un porcentaje sobre un número inventado es una mentira con forma
de cifra. El tope se re-resuelve en cada barra porque `/modelo` cambia el modelo en
caliente, siempre por `topeResuelto` (`core/contextos.ts`) — la misma función que `/config`
usa para enseñar los topes **y su origen** (proyecto > global > tabla), así que la barra no
puede calcular sobre un tope que `/config` no declare.

**La consola y la shell no divergen** porque comparten función: `/config` llama a `cmdConfig`,
no a una copia. `COMANDOS` en `cli/consola.ts` es el registro único — `/ayuda`, la cabecera y el
autocompletado se generan recorriéndolo, así que añadir un comando ahí basta. El Tab completa
comandos desde `COMANDOS` y, tras una «@», ficheros del proyecto (leídos del árbol en el momento
del Tab, nunca de una lista congelada al arrancar). Las flechas y ctrl-p/ctrl-n del historial
los trae readline en stdio; la TUI solo implementa las flechas (`upArrow`/`downArrow` en
`cli/tui/entrada.tsx`, con el mismo completer) y descarta ctrl-p/ctrl-n — no es la misma
tecla en las dos pieles. No hay código propio de historial fuera de la piel.

**Ajustes tiene una pestaña por ENTORNO, y abrir una no cambia el entorno activo**
(`apps/web/src/componentes/Ajustes.tsx`, `arranque.ts#atenderProyectosDeEntorno`). Pedido
mirando la pantalla con un segundo entorno recién registrado: «sale todos los proyectos y es
intrabajable». Era una lista plana de entornos —icono, nombre y URL, sin nada que pulsar— con
UN bloque de casillas debajo, el del activo, así que los dieciocho proyectos de uno caían en
una sola columna y a los del otro **no se llegaba de ninguna forma** salvo cambiando el
entorno activo en la barra, que es mudarse y no mirar. Nueve reglas:
- **Pedir los proyectos de un entorno no lo hace ACTIVO**, y esa es la mitad del diseño.
  `atenderProyectosDeEntorno` es el hermano de `atenderEntornoActivo` y lo que los separa es
  todo lo que el nuevo NO hace: no toca `entornoElegido`, ni `proyectos`, ni `ramas`, ni
  `proyectoElegido`, ni pone `aviso`. Abrir Ajustes a marcar una casilla no puede cambiarle la
  barra lateral —ni los proyectos de los que se habla— a quien está trabajando en otro
  servidor. Por eso la aserción que sostiene el diseño en `arranque.test.ts` es que
  `alta.entornoActivo` **no cambia**, y se escribió antes que el handler.
- **Se pide al abrir la pestaña y solo si falta el dato**, que es la regla que ya tenían
  Ficheros y Revisión. El entorno ACTIVO no gasta ninguna conexión: su lista viene en el
  `alta`. Y el efecto depende de la sección abierta, porque preguntarle a CloudStudio por un
  entorno mientras alguien mira Apariencia sería gastar una conexión que nadie pidió.
- **Sin caché, a propósito**, al contrario que el catálogo de modelos. Aquél se cachea porque
  la pastilla se abre constantemente y cada consulta es una API de pago; una pestaña de
  Ajustes se abre poco, y con caché podría contradecir a la barra en cuanto alguien cree un
  proyecto en Studio. Una sola fuente. Por lo mismo no va en el `alta`: ese mensaje se reemite
  en los dos flancos de cada turno, y meter las listas dentro obligaría a cachearlas.
- **Las tres respuestas se dicen distintas**: entrada ausente es «no se ha preguntado» (y la
  pestaña pregunta), `proyectos` es la lista, y `error` es «no se pudo preguntar» — con el
  motivo y **sin ninguna casilla**, porque no se sabe qué proyectos hay. Una lista vacía
  afirmaría un entorno sin proyectos, que es otra cosa y también se dice. El fallo es de ESE
  entorno y no se pinta un aviso global: la regla del catálogo, «un desvío, no un callejón».
  Y no se reintenta solo tras un error: sería un lazo contra un servidor que no contesta.
- **Lo marcado se guarda POR ENTORNO** (`elegidosPorEntorno`), y aquí estaba el fallo de
  verdad que las pestañas destapan. Era un `useState` único sembrado del entorno activo, así
  que al abrir la pestaña de otro entorno las casillas arrancaban marcadas con los ids del
  primero y **el primer clic guardaba la elección de aquél bajo éste** por `visibles`. Hay
  test: abrir la pestaña de B, marcar una casilla, y `alElegirProyectos` recibe `(B, …)` con
  ids de B y nada de A. La persistencia ya era por entorno en el cable y en disco
  (`Entorno.proyectos`); lo que faltaba era que el componente no lo aplanara.
- **Pestañas SIEMPRE, también con un solo entorno registrado.** La etiqueta contesta «¿de
  quién son estos proyectos?», que hasta ahora se daba por supuesto porque solo se podían ver
  los del activo. Y la tira sustituye a la lista plana en vez de sentarse a su lado: dos
  sitios para lo mismo, y el de arriba no era pulsable.
- **El efecto depende de los DOS CAMPOS de la pestaña, no del record de listas, y eso salió
  de MEDIRLO.** Con el record, mientras se espera la respuesta salían **cinco** peticiones
  donde tenía que haber una —y cada una es una conexión con CloudStudio (OAuth +
  `initialize` + `studio_list_projects`)—. El motivo: el valor por omisión
  `proyectosPorEntorno = {}` es un objeto NUEVO en cada render, y el prop solo viaja cuando
  hay algo, o sea que justo en el estado de espera el efecto veía una dependencia distinta
  cada vez y se volvía a disparar con cada mutación del store; con un turno en vuelo, eso es
  varias veces por segundo. Los dos campos de esa pestaña valen establemente `undefined`
  mientras se espera. El manejador se queda FUERA de las dependencias por lo mismo: `App`
  pasa una lambda escrita en el JSX, cuya identidad cambia en cada render. **Los tests no lo
  veían** porque los dos afirmaban `toHaveBeenCalledWith` y ninguno contaba llamadas — un
  `toHaveLength(1)` es lo que lo destapó.
- **Y el CABLEADO de los dos sentidos tiene test propio, porque el tipo no lo caza.**
  `alPedirProyectosDeEntorno` es OPCIONAL, así que quitando su línea de `App.tsx` los dos
  `tsc` siguen LIMPIOS y las pestañas simplemente no piden nada nunca; y el camino de vuelta
  —`store.ts` → el spread de `App` → las casillas— es la forma exacta del incidente de
  `mime`/`base64`, donde tres capas probadas por separado dejaron al navegador sin enseñar
  una sola imagen con todo en verde. Los dos tests se comprobaron QUITANDO la línea y viendo
  que muerden, que es la única forma de saber que un test que pasa a la primera sirve de algo.
  Séptima instancia del patrón de fallo de este repo.
- **Y una trampa del detector de literales**, medida dos veces en esta tanda: `tipos.test.ts`
  casa `clase:\s*"…"`, así que un `{clase:"entorno"}` escrito dentro de un COMENTARIO cuenta
  como un literal del cable y el test da divergencia entre cliente y host sin que nada haya
  divergido. Y `Barra.test.tsx` prohíbe `transparent` con razón —es un literal de color—, así
  que el filo de la pestaña elegida se pinta con `box-shadow` inset y no con un
  `border-bottom` que exigiera el `transparent` de reserva; de paso, una sombra no ocupa
  sitio, así que la fila no se mueve al cambiar de pestaña.

**Claude como modelo de trabajo: el tope de salida y el razonamiento se fijan a mano, y los
dos salieron de MEDIR la dependencia** (`core/contextos.ts#topeDeSalida`,
`core/modelos.ts#pideThinkingAdaptativo`, cableados en `agent/config/modelos.ts` y con prueba de
costura en `agent/modelos.test.ts`). `ChatAnthropic` se construía con `{model, apiKey}` y
nada más. Cinco cosas:
- **La ventana de contexto de Claude estaba 5 veces por debajo.** La tabla decía una sola
  fila, «claude → 200.000», y empareja por PREFIJO, así que `claude-opus-5` resolvía a 200k
  cuando su ventana es 1M: la barra de estado calculaba el `ctx%` sobre una quinta parte de
  la ventana real y reportaba ~5 veces más ocupación de la que había. Es exactamente la
  «mentira con forma de cifra» contra la que avisa la cabecera de ese propio fichero. Ahora
  va por VERSIÓN —la generación 4.6 y posteriores llevan 1M; Haiku 4.5 y lo anterior se
  quedan en 200k—, con lo específico antes del `claude` de reserva porque `find` se queda
  con el primer prefijo que casa, igual que `gpt-4.1` va antes que `gpt-4`.
- **El `max_tokens` heredado falla a 4096 EN SILENCIO.** Medido en
  `@langchain/anthropic` 1.5.2: resuelve su omisión con una tabla por prefijo
  (`MODEL_DEFAULT_MAX_OUTPUT_TOKENS`) y lo que no casa cae en
  `FALLBACK_MAX_OUTPUT_TOKENS = 4096`. `claude-sonnet-5` es el caso — `claude-sonnet-4` no
  es prefijo de `claude-sonnet-5` — mientras `claude-opus-5`, `claude-opus-4-8` y
  `claude-fable-5-1` sí casan y salen con 16384. En un harness cuyo trabajo es escribir
  ficheros, 4096 no da error: corta el fichero a medias. Y no es una lista que baste con
  actualizar: el id lo elige el usuario del catálogo VIVO, así que cualquier modelo nuevo
  vuelve a caer en el fallback hasta que la dependencia se entere.
- **16.384 y no más, y el motivo es por qué camino se usa.** El objeto construido se
  comparte entre el turno —que STREAMEA: su `_streamResponseChunks` mete `stream: true` en
  el payload sea cual sea la bandera del constructor, comprobado— y las llamadas sueltas con
  `.invoke()` (el juez, el aumentador), que no streamean y donde un tope grande se lleva por
  delante el plazo HTTP del SDK. 16.384 es además el valor que la propia dependencia da a la
  familia actual, así que para los modelos que sí conoce esto no cambia NADA: solo tapa el
  4096. Y solo `anthropic` tiene fila, igual que `ollama` no tiene fila en la tabla de
  contexto: los demás clientes no tienen este fallo, y fijarles un tope a ciegas sería
  recortarles la salida por una razón que no existe.
- **Omitir `thinking` significa tres cosas distintas, así que es una TABLA y no un campo
  fijo.** La dependencia manda `thinking: undefined` si no se le fija, o sea que omite el
  parámetro. Y omitirlo: en **Opus 5 y Sonnet 5** ya corre adaptativo (no hace falta pedir
  nada, y mandar lo que no se necesita es superficie que mantener); en **Opus 4.8, 4.7, 4.6
  y Sonnet 4.6** corre **sin pensar**, que es el caso que esto arregla —esos cuatro iban sin
  razonamiento en un harness de código, donde es justo donde más rinde—; y **Haiku 4.5 y
  todo lo anterior a 4.6** no aceptan `adaptive` (lo suyo es `{type:"enabled",
  budget_tokens:N}`), así que un `thinking` adaptativo a ciegas para «anthropic» los
  rompería con un 400. Lo desconocido devuelve `false`, que es el lado conservador: se omite
  y el modelo hace lo suyo, en vez de mandarle algo que puede rechazar.
- **`effort` SÍ se manda, y esto revierte lo que aquí decía.** La versión anterior de esta
  entrada decía que omitirlo ya es `high` —cierto— y que añadirlo sería «superficie de
  configuración sin ganancia medida». Lo primero sigue siendo verdad; lo segundo dejó de
  serlo en cuanto la pregunta cambió: no es configuración por configurar, es la palanca de
  COSTE en manos de quien está delante, en un harness donde una sola pregunta de estructura
  se midió en cientos de miles de tokens. Lo que no cambia es la dirección del fallo: el
  nivel se omite siempre que no conste que el modelo lo admite.
- **La unidad NO es el proveedor, es el MODELO, y eso está medido.** Contra
  `integrate.api.nvidia.com` con la misma clave, `nvidia/nemotron-3-super-120b-a12b` acepta
  `none, minimal, low, medium, high, xhigh, max` y `openai/gpt-oss-20b` acepta solo
  `'low', 'medium' or 'high'`. Los dos enums salieron del propio mensaje de error al mandar
  un valor inventado, que es el descubridor más barato que hay para esto. Una tabla por
  proveedor habría sido falsa el primer día.
- **Y los niveles son una LISTA por modelo, no tres fijos, por DeepSeek.** Su API acepta los
  siete y los COLAPSA: su documentación publica el mapeo `minimal→low`, `medium→high`,
  `xhigh→high`, `ultra→max`, así que allí solo hay tres niveles de verdad —`low`, `high` y
  `max`—. Ofrecer low/medium/high contra ese modelo sería dar dos opciones que hacen lo
  mismo sin decirlo. Medido además que el enum se valida (un valor inventado da 422); lo que
  NO se pudo medir es que los niveles cambien el resultado — con un problema fácil y dos
  pasadas la señal quedó por debajo de la varianza entre tiradas, y eso es «no medido», no
  «no hace nada».
- **Gemini: la frontera es la generación 3, y el catálogo vivo NO sirve para decidirlo.**
  Medido contra la API real: `gemini-2.5-flash` y `gemma-4-31b-it` contestan
  **«Thinking level is not supported for this model»**, y las 3.x lo aceptan con efecto
  monótono (`LOW` sin pensamiento, `MEDIUM` 685 tokens de pensamiento, `HIGH` 847) y con un
  **400** para un nivel inventado. Los tres alias `*-latest` van ENUMERADOS en la tabla
  porque apuntan a 3.x y el prefijo `gemini-3` no los casaría — comprobados uno a uno. Y el
  resultado NEGATIVO que importa: `GET /v1beta/models/<id>` devuelve `"thinking": true`
  también para `gemini-2.5-flash`, que es justo el que falla; ese campo dice «sabe pensar»,
  no «acepta niveles», así que hace falta tabla.
- **Ollama SÍ tiene niveles, y el booleano era del cliente.** El servidor valida el campo y
  lo dice en su error: `invalid think value: "banana" (must be "high", "medium", "low",
  "max", true, or false)`. Que `@langchain/ollama` tipe `think` como `boolean` es una
  limitación suya — pasa el valor tal cual al request, comprobado de punta a punta con el
  cliente real: con `think: "low"` el razonamiento de `granite4.2:3b` baja de 1589 a 55
  caracteres y el `content` sigue limpio (el razonamiento va a
  `additional_kwargs.reasoning_content`, no al contenido, así que `puente.ts` no cambia).
- **El soporte de Ollama se PREGUNTA, no se tabula**: sus modelos los elige el usuario y no
  hay prefijo que los describa, pero `POST /api/show` devuelve `capabilities` con
  `"thinking"` dentro. Medido: `granite4.2:3b`, `glm-5.3-flash:cloud` y `qwen3.8:27b-mlx` la
  tienen, `ministral-3:3b` no — y pedirle pensar a ése contesta
  `"ministral-3:3b" does not support thinking` y se lleva el turno. Por eso las capacidades
  entran por PARÁMETRO a `nivelesDeEsfuerzo` (son dos cadencias: preguntar es asíncrono,
  construir un modelo es síncrono) y su ausencia significa «no consta» → no se manda nada.
- **Aceptar un nivel y HONRARLO son dos cosas, y en Ollama se separan.** Medido con semilla
  fija en `granite4.2:3b`: `low` da 112 caracteres de razonamiento y `medium`, `high`, `max`
  y `true` dan 1537 idénticos. Y en `glm-5.3-flash:cloud` —el modelo POR OMISIÓN de este
  repo— cinco tiradas dan `low` 0/0/0/0/0, `high` 54/0/0/0/0 y `medium` entre 572 y 1647:
  o sea que **`high` se comporta como apagado y solo `medium` piensa**. No es monótono y no
  se puede arreglar desde aquí: lo pone el template de cada modelo. La decisión fue
  ofrecerlos igual (la alternativa era no ofrecer niveles en Ollama) y **DECIRLO en la
  pastilla**, que es donde alguien va a elegir.
- **`reasoningEffort` de `@langchain/openai` no sirve para los compatibles, y falla EN
  SILENCIO.** Medido en 1.5.5: `_getReasoningParams` abre con
  `if (!isReasoningModel(this.model)) return;`, y ese predicado solo reconoce `/^o\d/` y
  `gpt-5*`. Un `deepseek-flash` o un `openai/gpt-oss-20b` no casan, el campo se descarta
  antes de componer la petición y el payload sale sin él — ni error ni aviso, el mismo
  patrón que el `max_tokens` de 4096 y descubierto igual, preguntándole a
  `invocationParams()`. La puerta que sí llega es `modelKwargs`, y se usa en los CINCO
  caminos de `ChatOpenAI` (no solo en los compatibles) para que no haya un segundo sitio
  donde esto pueda dejar de llegar.
- **El esfuerzo y el `thinking` están ACOPLADOS en Anthropic.** Medido contra
  `validateInvocationParamCompatibility` del propio cliente, que corre en local:
  `claude-opus-5` con `outputConfig.effort: "max"` y sin `thinking` explícito es una
  petición que **ni sale de esta máquina** — «thinking.type="disabled" is not supported for
  claude-opus-5 with outputConfig.effort="max"». De ahí `aceptaThinkingAdaptativo`, hermana
  de `pideThinkingAdaptativo`: aquélla dice si HACE FALTA pedirlo (si omitirlo significa «no
  pienses»), ésta si se PUEDE pedir. Se separan justo en la generación 5, que ya corre
  adaptativo por omisión pero admite que se le pida. Opus 4.5 no está en la lista aunque el
  validador local lo deje pasar: ese validador solo mira la forma, y el adaptativo llegó en
  4.6.
- **Lo que queda SIN MEDIR y por eso sin fila**: `openai`, `groq` y `xai`, que no tenían
  credencial con la que probarlos. Se quedan sin control y sin parámetro, que es la
  dirección segura; el probe del valor inválido los resuelve en una llamada cada uno el día
  que haya clave.
- **Y la prueba es de COSTURA, contra `invocationParams()` del cliente real.** Las dos
  tablas de `core/` no valen de nada si no llegan al payload, y eso no lo ve ningún test de
  la tabla. Se construye el `ChatAnthropic` de verdad y se le preguntan sus parámetros —sin
  red: construir y preguntar no llama a nadie—. Comprobado que MUERDE quitando el cableado:
  el fallo que da es `expected 4096 to be 16384`, o sea el fallback de la dependencia medido
  de punta a punta y no en un guion aparte. El día que cambie de sitio su `max_tokens`, o
  deje de omitir `thinking` cuando no se fija, esto cae — y el otro camino sería un 400 en
  producción o una respuesta cortada en silencio.
- **Lo que NO se hizo, y queda dicho**: llevar el `max_input_tokens` que el catálogo vivo ya
  devuelve (`agent/config/catalogoModelos.ts`) hasta la barra, para que la tabla deje de ser la
  fuente. Es la dirección honesta —la verdad sobre un modelo concreto la tiene el servidor—,
  pero el catálogo se pide por proveedor y bajo demanda mientras `topeResuelto` es síncrono y
  corre en cada barra: son dos cadencias distintas y es otra tarea. Y **nada de esto pasa por
  el SDK crudo de Anthropic**: este repo enruta todos los proveedores por LangChain a
  propósito, y romper la simetría por uno solo sería peor que el problema.

## Medir el gasto de un turno sin levantar la web (17-09-2026)

El punto de partida no era que faltara una puerta headless: `run --real` (`cli/run.ts`) ya
corre el agente de verdad sobre el proyecto del cwd, y `XONECODE_TRACE_TOOLS=1` ya deja
`.xonecode/traza-tools.jsonl` con una línea por llamada al modelo y su origen. Lo que faltaba
era la MEDIDA: `run.ts` no tocaba el tracker, así que cada disparo terminaba sin decir lo que
había costado, y el JSONL **no lo leía nadie** — un fichero que solo se escribe no contesta
nada.

**La primera medida real**, sobre una copia de `proyecto_example` y con una pregunta de solo
lectura («qué colecciones tiene y cuál es la de entrada, en tres líneas»): 7 llamadas al
modelo, 30.865 tokens de entrada y 2.388 de salida, 42 s, con `ollama/glm-5.3-flash:cloud`.
Treinta mil de entrada para contestar tres líneas es exactamente el orden de magnitud que hacía
falta ver antes de tocar un solo prompt.

De ahí, cuatro decisiones:

- **Las DOS cuentas no se suman y van en dos filas** (`pintarGasto`): los tokens del grafo van
  contra la clave de API de quien corre y los de un agente externo contra su suscripción. Un
  token es un token, pero su precio no. La cuenta externa AUSENTE se calla, porque una fila de
  ceros afirma que se midió un agente externo que no corrió; y una ventana de cero tampoco se
  pinta, que es «no se pudo medir» — la misma regla que `consumoPersistible` aplica al
  persistir.
- **El gasto se pinta también cuando el turno se cortó sin humano.** Va fuera del `try`, antes
  del diff: esos tokens se gastaron igual, y contar solo los turnos que acaban bien haría bajar
  la cifra justo en los que más cuestan. Es la misma regla que ya regía en el contador de la
  web.
- **`pintarGasto` vive en `agent/turno/informeDeTraza.ts` y no dentro de `correrReal`.** Es el
  patrón de fallo de este repo, ahora por décima vez: `correrReal` construye una sesión real y
  todos sus tests la doblan, así que una regla compuesta ahí dentro queda escrita y sin nadie
  mirándola. Extraída es una función pura con test por cada regla (las dos cuentas, la externa
  ausente, la ventana sin medir).
- **El coste efectivo es UNA cuenta** (`costeEfectivo`: `input − 0,9·cache + output`). Estaba
  escrita a pelo dentro del `console.log` del corredor de evals; ahora el corredor la importa.
  Dos fórmulas para el mismo número son dos números que acaban divergiendo, y aquí el síntoma
  habría sido comparar un eval contra un `run --real` y leer la diferencia como una mejora.

Y dos trampas del formato de la traza, que son las dos primeras pruebas de
`informeDeTraza.test.ts`:

- **El campo `llamadas` de una línea `modelo` es el acumulado GLOBAL del tracker**, no el de esa
  llamada ni el de ese origen: va 1, 2, 3… Sumarlo daría seis llamadas donde hubo tres. Se
  cuentan por línea.
- **El fichero es append-only y una máquina acumula ejecuciones de días**, así que el informe se
  parte por `sesion` y por omisión enseña la última, diciendo cuántas hay. Sumarlas todas daría
  el turno de ayer más el de ahora en una cifra perfectamente plausible, que es la peor clase de
  error. Que no haya traza sale con **70** y con el comando que la enciende, el mismo trato que
  `verify` le da a un simulador ausente: un 0 con el informe en blanco se leería como «no
  gastaste nada».

**Límite declarado, y es el que más estorba al objetivo: con Ollama la caché sale 0 % y ese
cero NO está medido.** El tracker lee `input_token_details.cache_read`
(`vendor/tokenTracking.ts`); Ollama no lo emite, la ausencia se vuelve cero y las dos pieles lo
pintan como una medida — el «contador a cero que nadie ha medido» que este repo persigue en
todas partes. Para ver la palanca de la caché hace falta un proveedor que la reporte. Separar
«no consta» de «cero» pide que el tracker lo lleve, y es otra tarea.

**Y la primera pregunta que se le hizo al informe no la sabía contestar**: «¿las lecturas son
parciales, y cuántos ficheros se leen?». La traza guarda `offset` y `limit` desde el principio
—para eso están en la lista blanca de `resumenDeTool.ts`— pero el resumen solo enseñaba lo
repetido, así que hubo que ir al JSONL a mano. Ahora cada tool lista sus blancos con el rango y
dice cuántos DISTINTOS. Lo medido con eso, sobre `proyecto_example`:

- **Las once lecturas de las dos medidas fueron `offset=0, limit=50`**, con deepseek y con
  gemini. No es el default de deepagents —el suyo es `limit=100`—: sale de nuestra propia
  `DESCRIPCIONES_FICHEROS.read_file`, que pide ese rango para el reconocimiento inicial. El
  modelo obedece.
- **Y aun así no recortó nada**: los ficheros leídos tienen entre 11 y 46 líneas, todos por
  debajo de 50, o sea 181 líneas en total. Las lecturas son del orden de 2-3k tokens de los
  39.518 del turno. **El contenido de los ficheros no es el gasto**; lo son el prompt de
  sistema y los esquemas de las tools reenviados en cada una de las nueve llamadas. El
  `limit=50` está bien puesto, pero su efecto se verá en un `.xne` de mil líneas, no aquí.
- Ninguna relectura en ninguna de las dos: todas las rutas distintas y ningún rango repetido.

**El primer experimento de recorte salió MAL, y lo que enseñó vale más que el recorte**
(17-09-2026). Se cambió la receta de lectura —de «`offset=0, limit=50` siempre» a «pide
`limit=1000` y agrupa»— siguiendo lo que hacen los otros harnesses del laboratorio: opencode
lee 2000 líneas por omisión y avisa contra las rodajas pequeñas («*Avoid tiny repeated slices
(30 line chunks)*»), qwen-code lee el fichero ENTERO si se omite `limit`, y deepseek-harness
tiene `READ_LIMIT = 2000`. Somos el único que pide 50. Medido con la misma pregunta:

| | antes | después |
| --- | --- | --- |
| deepseek | 32.975 | **77.669 y 76.669** |
| gemini | 39.518 | 26.711, 10.644 y 31.534 |

- **Con deepseek es una regresión clara y repetible**: agrupó bien —ocho lecturas en un solo
  viaje, que era el objetivo— pero pasó de leer 6 ficheros a leer 12, con `README.md`,
  `Visitas.xne` y `Clientes.xne` entre ellos, y la ventana de 10k a 20k. La causa es la suma de
  dos frases: la de la librería («*batch multiple `read_file` calls when several files **may**
  be useful*») y la nuestra de agrupar, sin el «lee ÚNICAMENTE lo necesario» que el cambio se
  había llevado por delante. **Especular es barato con 50 líneas y caro con 1000.**
- **Con gemini no se puede afirmar nada**: tres ejecuciones del MISMO prompt dieron 10.644,
  26.711 y 31.534 — un factor de tres. **La varianza entre ejecuciones idénticas es mayor que el
  efecto que se busca**, así que una sola pasada no puede decidir un cambio de prompt. Cualquier
  experimento futuro necesita varias pasadas por celda y comprobar además que la RESPUESTA sigue
  siendo correcta: una de esas cifras bajas salió de que el orquestador contestó sin delegar, que
  es otro comportamiento, no el mismo más barato.
- Lo que se conserva del intento: no abrir ficheros «por si acaso», leer alrededor de la línea
  que dio un `grep` en vez de desde el principio, y pedir en el mismo mensaje lo que sea
  independiente. Lo que se revierte: el `limit=1000`.

**Y el hallazgo que no era el que se buscaba: una descripción propia REEMPLAZA la de la
librería.** `DESCRIPCIONES_FICHEROS.read_file` borraba tres cosas que deepagents ya dice —que la
salida lleva una cabecera de formato que **no hay que reinyectar al editar** (corrección, no
ahorro), que conviene agrupar lecturas, y que un resultado grande se descarga a
`/large_tool_results/`—. Y no se puede copiar su texto: entre `1.13.2` y `1.13.5` ese formato
CAMBIÓ, de prefijos de número de línea a una cabecera `@@ … @@`, así que una copia habría quedado
describiendo un formato que ya no existe sin un error que leer. La regla que queda: **lo que
describe la TOOL es de la librería y se actualiza con ella; cómo queremos usarla es política
nuestra y vive en `promptDeAgente`.** Las descripciones no se exportan, así que componer las dos
no es una opción.

**El orquestador deja de delegar lo que puede contestar, y es el recorte más grande medido
hasta hoy** (17-09-2026). Su prompt decía «tu único trabajo es entender la petición y delegar»,
y eso costaba dinero: la línea base del banco (`docs/bancos/2026-09-17-base.json`) enseñó que la
MISMA pregunta de estructura costaba **9.462 tokens contestada por él y 38.198 delegada, con la
misma respuesta buena**. Delegar es un viaje de ida y vuelta con el prompt de un especialista
detrás; para lo que se resuelve con un `grep`, no compra nada.

Peor: la dispersión brutal de la base (±114 %, ±150 %) **no era ruido, era esa moneda al aire**.
Unas pasadas delegaban y otras no, y el banco las marcaba como «otro camino» precisamente para
que no se promediaran como si fueran el mismo.

La regla se escribe en las DOS direcciones —«contéstala tú» y «delega cuando haya que escribir,
cuando el encargo tenga varios pasos o haga falta criterio»— porque decirle solo que puede leer
no le quitaba la orden de delegar siempre. Medido contra la base, con tres pasadas por celda:

| pregunta · modelo | base | con la regla | cambio | veredicto |
| --- | --- | --- | --- | --- |
| entrypoint · deepseek | 25.114 | 11.212 | −55 % | rangos solapados |
| estilo · deepseek | 20.213 | 11.461 | −43 % | rangos solapados |
| login · deepseek | 57.961 | 35.084 | −39 % | **concluyente** |
| entrypoint · gemini | 18.979 | 10.037 | −47 % | **concluyente** |
| estilo · gemini | 26.684 | 10.846 | −59 % | **concluyente** |
| login · gemini | 47.149 | 29.393 | −38 % | rangos solapados |

Seis de seis en la misma dirección, tres concluyentes por `comparar()` y **ninguna respuesta
incorrecta**. Las llamadas al modelo bajan de 4-9 a 3-6 y el turno de 6-33 s a 2-11 s. Las tres
celdas no concluyentes lo son porque **la base** tenía rangos enormes — el propio defecto que
esto arregla.

**Y el banco se corrigió a sí mismo por el camino.** Dos celdas salieron con «respuesta
INCORRECTA», que por diseño invalida la comparación. La respuesta suspendida —que ahora se
guarda, la lección de `--conservar` del corredor de evals— decía `mappings.xne:4:
<style url="default.css" />`: el esqueleto declara la hoja de estilos en `app.xml` **y** en
`mappings.xne`, y el juez exigía el primero. **El ✗ era del juez**, como las dos primeras veces
del eval, y suspendía justo al que la encontraba por el camino más barato. Sin guardar la
respuesta, el experimento habría concluido que el cambio empeora las respuestas.

**El mapa del proyecto (`MAPA_DEL_PROYECTO`): decisivo para un modelo, indiferente para el
otro** (17-09-2026). Cuatro líneas diciendo dónde está cada cosa —`app.xml` como índice con
`<entry-point>`, `<login-coll>`, `<style url=>` e `<include file=>`; las colecciones como
`<coll>` en `.xne`; `app.ini` como configuración—, comprobadas contra el esqueleto y contra un
proyecto real antes de escribirlas, y puestas donde las ven el orquestador **y** cada
especialista: desde que el orquestador contesta lo que puede, él es quien más las necesita.

Medido contra la variante A, tres pasadas por celda:

| pregunta · modelo | A | con el mapa | cambio | dispersión |
| --- | --- | --- | --- | --- |
| entrypoint · deepseek | 11.212 | 12.455 | +11 % | ±32 % → ±29 % |
| estilo · deepseek | 11.461 | 11.773 | +3 % | ±39 % → ±48 % |
| login · deepseek | 35.084 | 37.323 | +6 % | ±61 % → ±60 % |
| entrypoint · gemini | 10.037 | 8727 | −13 % | ±34 % → **±1 %** |
| estilo · gemini | 10.846 | 5621 | −48 % | ±91 % → **±0 %** |
| login · gemini | 29.393 | 16.098 | −45 % | ±142 % → **±1 %** |

**Lo que hay que mirar no es la media, es la dispersión.** Con gemini las tres pasadas de
`estilo` cayeron en 5.619, 5.621 y 5.624: cinco tokens de diferencia entre ejecuciones de un
modelo no determinista. El mapa no le abarata el camino, **le quita la exploración**: va directo.
Con deepseek no cambia el camino y solo paga el mapa —unos 150 tokens por llamada, que con sus
3-7 llamadas explica el +3/+11 % casi exactamente—, y ese sobrecoste queda dentro de su propio
ruido.

**Y `comparar()` dice «no concluyente» en las SEIS**, incluidos los −48 % y −45 % de gemini,
porque los rangos de A eran anchos y los de B caben dentro. Se deja así a propósito: cambiar el
criterio después de ver los resultados es exactamente el sesgo que el banco existe para
impedir. Lo que se puede afirmar sin criterio nuevo es lo de la dispersión, que no depende de
compararla con nada.

**El resultado de una tool se estaba pintando en el chat como si fuera la respuesta**
(17-09-2026, visto por el usuario en la consola web). Bajo el tramo de «Trabajo del agente»
aparecía el fichero ENTERO que el agente acababa de leer, con sus números de línea y el pie
`[Read 12 lines (lines 1-12 of 164 total). 152 lines remaining from offset 12.]` — la salida
cruda de `read_file` de deepagents, en un bloque de código con su botón de copiar.

Rompía el invariante de `core/events.ts` —ningún evento lleva argumentos ni contenido de tool,
ni truncados— y venía de `puente.ts`: en el modo de stream `messages`, un `ToolMessage` llega
igual que un token del modelo, y la rama emitía `textoDe(msg)` sin mirar QUÉ mensaje era. Se
filtra con `esMensajeDeTool`, que ya existía para otra cosa.

**Estuvo mudo hasta el mismo día en que se arregló, y lo destapó otro cambio nuestro**: mientras
la única tool del orquestador era `task`, lo que se colaba por ahí era la respuesta del
especialista —que pasaba por una respuesta y por eso nadie lo vio—. Desde que el orquestador lee
ficheros en vez de delegarlo todo, lo que se colaba era cada fichero. Es el patrón de siempre en
otra forma: una regla que solo se ejercita por un camino deja de estar probada cuando el camino
cambia.

**El contador de tokens no se limpiaba al abrir otra conversación** (17-09-2026, visto por el
usuario en la caja del compositor). Son DOS mitades, y arreglar solo una deja el defecto vivo:

- **`nuevoHilo` solo cambiaba el `thread_id`.** El tracker vive en el cierre de la sesión y esa
  no se recrea, así que un `/nuevo` dejaba el gasto de la conversación anterior atribuido a la
  nueva, y creciendo. El `thread_id` **es** la sesión (`agent/sesiones/checkpointer.ts`), o sea
  que abrir un hilo es empezar una conversación: ahora se vacía el tracker EN SITIO —sustituir
  la referencia dejaría al middleware de conteo sumando en un objeto que ya no lee nadie— y se
  AVISA, porque el contador solo se repinta cuando el consumo cambia.
- **Y en la web había que DECÍRSELO al cliente.** `consumo` viaja por `alCambiarConsumo`, y
  abrir una sesión no cambia el consumo: cambia de quién es la cuenta. El primer intento llamó a
  `emitirConsumo()` y **no arregló nada**, porque esa función calla cuando la cuenta no consta —
  y al abrir no consta: el `SesionReal` no se registra hasta que el primer turno lo construye.
  Justo en el instante que hay que limpiar, la vía normal no manda nada. Se emite el valor VIVO
  si consta (volver al foco de una consola con un turno en vuelo: mandar cero ahí borraría un
  contador vivo) y un cero si no. Ese cero **sí está medido**: una conversación recién abierta no
  ha gastado nada. El cliente no pinta un cero, así que el contador desaparece.

**El especialista perdía su ENCARGO al cruzar el umbral del resumen** (17-09-2026, medido
offline). Síntoma real: el orquestador delegó «¿sirve XOne para un CRM?», el especialista dio 57
pasos y volvió con la respuesta de la pregunta ANTERIOR del usuario. El orquestador lo detectó y
relanzó dos veces: 1,5M de tokens de entrada para una pregunta.

**La hipótesis del propio modelo era falsa, y se comprobó en vez de creerla.** Dijo «parece que
su ventana trae una sesión antigua pegada». No: los subagentes van en `handoff`, así que deepagents
les sustituye los mensajes por `[HumanMessage(description)]` y arrancan con el encargo y nada más.
Y aunque HEREDAN nuestro checkpointer —`pregel/index.js` lo toma de
`config.configurable.__pregel_checkpointer` cuando el grafo no trae uno propio—, el namespace de
cada `task` se construye con `uuid5([ns, step, node, PUSH, index], checkpoint.id)`, o sea con el
paso y el id del checkpoint dentro: cada invocación escribe en su hueco y ninguna puede reanudar
la anterior. Lo único que esa herencia sí provoca es que la conversación entera de cada
especialista acabe en el `checkpoint.sqlite` de la sesión, que ya crece sin poda.

**Lo que pasa de verdad es nuestro.** Al cruzar `UMBRAL_RESUMEN_TOKENS` el middleware sustituye
los mensajes `[0, corte)` por UN resumen, y el mensaje 0 es el encargo. `keep` solo conserva la
COLA —no hay opción para el primero, comprobado en la fuente— y el prompt de resumen por omisión
pide «temas, decisiones y contexto para continuar», no el encargo. A partir de ahí el agente
trabaja sin la pregunta que le hicieron y contesta a lo que el resumen le deje entender. Hay test
que lo reproduce con el middleware real y sin red.

El arreglo va por CÓDIGO y no por `summaryPrompt`: pedirlo en el prompt funcionaría a veces, y un
agente que pierde su encargo no contesta peor, contesta a OTRA COSA — su coste ya está medido en
millones. `conservarElEncargo` lo devuelve desde el ESTADO, que el resumen no reescribe. Dos
detalles que no son de forma: es el ÚLTIMO mensaje humano y no el primero —en el orquestador, que
es multiturno, el primero es la pregunta de hace tres turnos, y reinyectarla sería reintroducir a
mano el fallo que se arregla—, y la comparación de si ya está es por CONTENIDO además de por
identidad, porque la lista efectiva se reconstruye y el mismo texto puede venir en otro objeto.
Los dos middleware viajan juntos en `resumenConEncargo`, en ese orden: el primero de la lista
envuelve al siguiente, así que puesto delante no vería nada que devolver.

**El inspector, y lo que enseñó a la primera: el 87 % de una llamada son los ESQUEMAS de las
tools** (17-09-2026). Todo lo medido hasta ese día era lo que SALE —tokens del proveedor, tools
llamadas, ficheros leídos— y de ahí se DEDUCÍA lo que entra. `inspectorDePrompt` mira: es un
`wrapModelCall` puesto el ÚLTIMO de la lista, así que ve la petición después de todos los demás
middleware —el resumen, la devolución del encargo, la conversión de los `ToolMessage`— y no lo
que alguien creía haber puesto.

Va por variable de entorno y en dos niveles. `XONECODE_TRACE_PROMPT=1` apunta la FORMA y ni una
letra de contenido; `=todo` añade el texto, que es lo que hace falta para entender POR QUÉ un
agente contesta lo que contesta y por eso se pide aparte y a sabiendas. La disciplina de
`diagnosticoDeTools.ts` es no guardar contenido nunca; aquí el contenido ES la pregunta, así que
no se puede prohibir — se hace explícito.

Su primera versión ya destapó un agujero en la propia medida: decía 8.151 caracteres (~2k
tokens) en una llamada de un turno que pagaba 3.900 tokens por llamada. Faltaban los esquemas,
que se contaban como un número (`tools: 8`) en vez de como tamaño. Con ellos dentro, un turno
real de la pregunta más barata que tenemos:

```
  sistema 1.745  +  ESQUEMAS 12.350  +  mensajes 40  =  14.135  (~3.533 tokens)
  read_file 2.831 · task 2.517 · grep 2.275 · edit_file 1.483
  write_file 1.429 · delete 831 · glob 495 · ls 489
```

La pregunta ocupaba 40 caracteres. Los esquemas se reenvían en las cuatro llamadas del turno:
**~12.400 de los 15.466 tokens, el 80 %**. Y de ahí sale lo siguiente, que no es una intuición:
**el orquestador es de solo lectura por permisos y carga igualmente los esquemas de
`write_file`, `edit_file` y `delete`** —3.743 caracteres, ~940 tokens POR LLAMADA— por tres
tools que tiene prohibido usar. `permissions` acota el permiso; el esquema viaja igual.
deepagents tiene `createToolExclusionMiddleware` para justo eso, y su propia documentación pone
el límite donde va: «exclusions calibrate the agent per model; **they are not a security
boundary**». La frontera sigue siendo `permisosDe`; la exclusión es coste.

**Y tres medidas que salieron de mirar, no de deducir** (17-09-2026, con el inspector puesto):

1. **El prefijo es byte-idéntico entre llamadas.** El inspector lleva una HUELLA del prompt de
   sistema más los esquemas en su orden, que es exactamente lo que decide si una caché de prompt
   puede enganchar —toda caché es por prefijo—: cuatro llamadas de un turno real, **una sola
   huella**. O sea que el problema de la caché nunca ha sido nuestro. La huella se toma del
   CONTENIDO y no del resumen de la medida: la primera versión la hacía sobre `{nombre,
   caracteres}` y una descripción que cambiara conservando el largo habría dado la misma huella.
2. **Quitarle al orquestador las tools que no puede usar vale un cuarto del turno.** De 8 tools
   a 5, de 12.350 caracteres de esquema a 8.607, y el turno de **15.466 a 11.738 tokens (−24 %)**
   sin perder ni una capacidad: son las que `permisosDe` ya le deniega. La lista se DERIVA de
   `toolsDe(perfil)` y no se escribe a mano, así que conceder una tool la saca de ahí sola.
   `delete` se va para todos: ningún perfil nuestro la concede y su esquema viajaba igual.
3. **El inspector dice, en la MISMA línea, lo que entró y lo que costó** (`uso`, de
   `usage_metadata`). Separarlo obliga a cruzar dos ficheros a ojo para contestar de dónde sale
   una cifra; junto, la primera medida habría enseñado de golpe que los esquemas eran el 80 % del
   turno en vez de deducirlo restando. Ausente cuando el proveedor no lo manda, que es distinto
   de cero.

Consecuencia para lo siguiente: **`cache_control` con Anthropic deja de ser una mejora marginal**.
El prefijo son ~3.500 tokens estables y su mínimo cacheable ronda los 1.024, así que lo que se
cachearía es justo la cabecera que hoy se paga entera en cada llamada.

**Y con Gemini se comprobó, ya desde dentro del harness**: cuatro llamadas de un turno real con
el prefijo idéntico —una sola huella— y `cache_read` **cero en las cuatro**, con 2.133 a 2.852
tokens de entrada. Confirma por otra vía lo que ya estaba medido con prefijos sintéticos (a 11k,
cero aciertos; a 20k, el 81 %): **a nuestros tamaños su caché implícita no entra**, y no por
culpa de nuestro prompt. Lo que esto añade es que ahora la comprobación es de una línea y sobre
el prompt de verdad, no sobre un montaje.

Y un contrapeso que conviene tener escrito: **quitar esquemas ACHICA el prefijo**, o sea que aleja
del suelo de Gemini mientras abarata a todos los demás. En la práctica no hubo que elegir —3.500
frente a 20.000 no iba a entrar de ninguna manera—, pero las dos palancas tiran en direcciones
contrarias y el día que alguien persiga esa caché tiene que saberlo.

**Le decíamos al especialista que cargara TODAS sus skills antes de contestar, y costaba el 67 %
de una conversación** (17-09-2026). El síntoma que lo destapó fue una pantalla del usuario: el
consultor leyendo `SKILL.md`, `indice-completo.md` y las mismas referencias una y otra vez. No
era que el modelo se despistara: **estaba obedeciendo**. `promptDeAgente` terminaba con «Tus
skills: … **Cárgalas antes de responder**».

Y era, además, una contradicción con la librería. `SkillsMiddleware` de deepagents ya añade al
mensaje de sistema una sección «## Skills System» con cada skill del agente, su ruta y su propia
regla: «you know they exist, but you only read the full instructions **when needed**». El
subconjunto por agente también es suyo — se le pasa el ARRAY de rutas de skill en el campo
`skills` del `SubAgent` (`rutasDeSkills`), no la carpeta padre, que las daría todas. O sea que lo
nuestro duplicaba lo que ya estaba y encima lo invertía. Se retira; lo que se queda desde código
es el aviso de las que FALTAN, que eso la librería no lo sabe porque para ella no existen.

Medido con las tres preguntas del usuario en UNA conversación («Hola» → «cuántas colecciones
tiene mi proyecto» → «crees que con Xone podríamos hacer un CRM»):

| | antes | después |
| --- | --- | --- |
| «Hola» | 2.489 | 2.489 |
| «cuántas colecciones» | 23.599 | 12.849 |
| «CRM» | 406.163 | 126.425 |
| **la conversación** | **432.251** | **141.763 (−67 %)** |

Con dos cosas más en el mismo cambio:

- **Un tope de TOOLS por especialista** (20), que es distinto del de llamadas: aquel acota los
  viajes y este **lo que se acumula**. En el turno que lo motivó, el consultor llegó a 43
  resultados de tool en su contexto, y como cada llamada reenvía todo lo anterior, la primera
  costó 5.264 tokens y la última 39.888.
- **Sale con `continue`, no con `end`, y eso lo enseñó el primer turno con el tope puesto**:
  «Cannot end execution with other tool calls pending. Found calls to: read_file, ls, grep». La
  doc de langchain lo dice igual —`end` «raises NotImplementedError if there are multiple tool
  calls»— y nosotros le PEDIMOS al especialista que agrupe las tools independientes, así que
  llegar al tope con varias en vuelo es el caso normal. Dos reglas nuestras que vivían sin
  hablarse; el test las ata juntas.

**El bloque de las skills visuales se va del prompt al cuerpo de las skills** (17-09-2026).
`SKILLS_VISUALES` eran ~1.400 caracteres —cómo elegir entre `archify` y `artifacts-builder`,
dónde se guarda un artefacto y qué no funciona dentro del iframe— en el prompt de CUATRO
especialistas, o sea en cada una de sus llamadas, hablaran o no de diagramas.

Nació de una lección buena y la conclusión era la equivocada: un turno leyó `archify/SKILL.md` y
una referencia, se saltó `estilo.md` —donde estaba la regla— y escribió un artefacto con
`localStorage` que se mató solo. De ahí salió «ponlo en el prompt de todos, así no depende de
cargar nada». Lo que ese fallo decía en realidad es **ponlo en el fichero que SÍ se abre**: hoy
la regla encabeza el cuerpo de `skills/archify/SKILL.md` y de
`skills/artifacts-builder/SKILL.md`, que es lo primero que lee quien carga cualquiera de las
dos. Los prompts propios bajaron un tercio: consultant 3.881 → 2.604, analyst 3.959 → 2.682,
developer 3.280 → 2.003, designer 3.603 → 2.326.

**Y con él cae la regla de que las dos skills viajaban juntas.** Iban emparejadas porque aquel
bloque hablaba de las dos, así que un perfil con `artifacts-builder` a secas leía instrucciones
sobre una tool que no tenía. Sin el bloque, se pueden repartir por lo que cada uno hace —y hay
que repartirlas, porque **cada skill asignada mete su descripción en el prompt de sistema en
cada llamada**: la de `archify` son ~650 caracteres y la de `xone-development` casi mil. El
reparto queda: `designer` las dos; `analyst` las dos (dibuja anclado al código); `developer`
solo `artifacts-builder`, que escribe documentos pero los diagramas son de `designer`;
`consultant` ninguna, que contesta preguntas; `tester` ninguna, que no dibuja. Para `consultant`
eso es pasar de 1.911 a 996 caracteres de descripciones por llamada.

Lo que queda vigilado es la razón de fondo: **ningún `SKILL.md` puede ORDENAR desde su cabecera
usar la otra skill**, porque quien la lea puede no tenerla. Más abajo sí puede nombrarla —su
cuerpo se ramifica por qué tools existen en cada harness— pero condicionada.

**Y todo esto alcanza a quien ya arrancó, comprobado sobre una copia de la carpeta real del
usuario**: los cinco `.md` seguían con nuestro hash, así que la siembra los reescribe
(`consultant-xone.md` pasó de 2.556 a 1.251 caracteres) y sus dos agentes propios no se tocan.
Es exactamente para lo que existe `.semilla.json`.

## `device-controller`: el agente que conduce el aparato (18-09-2026)

El punto de partida era un botón muerto declarado. `tester-xone` existía, llevaba la skill
`xone-hotswap` —1.100 líneas con el protocolo de las dos plataformas— y su propio prompt decía
«NO tienes conexión con el dispositivo … las tools que lo harían son el paso siguiente». O sea
que a «lanza la app y sácame una captura» el orquestador delegaba bien, y el especialista
devolvía el PROCEDIMIENTO en vez de hacerlo.

**Lo primero que se midió fue si la skill bastaba.** No basta, y no por cómo esté escrita: un
`.md` no ejecuta un `adb`. Lo ejecuta quien lo lee, si tiene con qué, y hoy no lo tiene nadie —
los cinco de `motor: "modelo"` tienen seis tools de fichero sobre un backend virtual;
`claude-code` tiene `Bash` en `TOOLS_EXTERNAS_DENEGADAS`; a OpenCode se le RETIRA la tool; y el
sandbox de Codex es `read-only` siempre. Así que la elección real era entre escribir tools o
conceder ejecución, y la decidió el usuario: **ejecución**, con el argumento de que esto es un
harness y mañana hay otro aparato al que se le dan instrucciones con una skill.

**El hallazgo que simplificó el diseño lo puso él: `execute` ya existe en deepagents.** Es una
tool más del `FilesystemMiddleware` (`ls`, `read_file`, `write_file`, `edit_file`, `delete`,
`glob`, `grep`, `execute`) y aparece **solo si el backend resuelto sabe ejecutar**. O sea que no
había que escribir ninguna tool: había que montar `LocalShellBackend` en UN subagente. Con eso
las tres tools que se habían diseñado antes (`xone_hotswap`, `xone_desplegar`,
`xone_dispositivos`) sobran, y con ellas sobra el acoplamiento a XOne: lo que sabe hacer con un
aparato lo dice la skill.

### Lo que se midió contra la librería antes de escribir el cableado

Tres cosas, y dos habrían costado una sesión cada una:

- **`execute` sobrevive la cadena entera.** `CompositeBackend.execute` «siempre delega en el
  backend por defecto», y el `id` se propaga por los composites anidados. Con la shell como
  base, la cadena real —memoria → vistas aplanadas → artefactos → descargas → `/skills/` →
  `/artefactos/`— da `isSandboxBackend` verdadero; sin ella, falso. El discriminante es
  `id !== ""`, y por eso el backend normal (que no tiene `id`) sigue sin `execute`.
- **Nuestro Proxy revienta con un backend con shell.** Los cinco Proxies de `proyecto.ts` leían
  con `Reflect.get(objetivo, prop, receptor)`, y `LocalShellBackend.id` es un getter sobre un
  campo PRIVADO (`#sandboxId`): leído con el proxy como receptor lanza `TypeError`. Lo lee el
  **constructor** de `CompositeBackend`, así que el fallo sería al montar el agente, no al correr
  un comando. Se arregla leyendo contra el objetivo.
- **`permissions` y ejecución no se combinan, y lo prohíbe la librería**: lanza
  `ConfigurationError` salvo que `execute` esté apagado o que todas las rutas estén acotadas a un
  prefijo montado. Las nuestras deniegan `/.env`, `/.git` y `/.xonecode`, que viven en la raíz. La
  librería no se niega por capricho: «los comandos alcanzan cualquier ruta independientemente de
  las reglas de ruta». Esa negativa es el argumento entero de por qué esto se declara en el `.md`
  y lo lleva uno solo.

Y una cuarta, del lado del sistema: **`execute` corre con `shell: true`, o sea `/bin/sh`**, y sin
PATH explícito `sh` se inventa uno (`/usr/gnu/bin:/usr/local/bin:/bin:/usr/bin:.`) que **no
incluye `/opt/homebrew/bin`**. Por eso el entorno se construye QUITANDO del `process.env` en vez
de montándolo desde cero: con un entorno limpio no se encuentra el `adb` del usuario y el fallo se
lee como «no hay dispositivo». El tope de la librería es de RELOJ (no de silencio, al revés que
`TOPE_SIN_SALIDA_MS`) y al vencer mata al HIJO, no al grupo.

### Las claves de API, que es el agujero que abre `inheritEnv`

`guardarCredencial` escribe la clave también en `process.env`, a propósito. Un `inheritEnv: true`
se la pasa a la shell del modelo, y `printenv` —lo primero que hace cualquiera para orientarse—
la deja en el resultado de la tool, o sea en el contexto y en el `.jsonl`. No es una fuga
hipotética: es la salida normal de un comando normal. `core/shellDeAgente.ts` las quita **por la
tabla** (`VARIABLES_POR_PROVEEDOR`, el único sitio donde vive el nombre de cada variable) más el
prefijo `XONECODE_CLAVE_` de los personalizados, que por definición no puede estar en ninguna
tabla. No se quita todo lo que empiece por `XONECODE_`, que se llevaría `XONECODE_TRACE_TOOLS`.

**Límite declarado, y hay que decirlo entero porque la mitad engaña**: quitar las claves del
ENTORNO cierra la puerta por la que se escapan solas —un `printenv` al orientarse—, pero no
cierra el disco. `~/.xonecode/auth.json` sigue ahí y un `cat` lo lee: modo 0600, sí, y el mismo
usuario. Igual que el `GITHUB_TOKEN` de quien arranca el proceso, que tampoco se filtra —«lo que
parece una clave» es una heurística, y una heurística que falla en silencio es peor que un
límite escrito—. Y hay una vuelta de tuerca que conviene tener delante: **el proyecto abierto
desde la consola web vive DENTRO de la casa de xonecode** (`~/.xonecode/webstudio/workspace/…`),
así que el `cwd` de esa shell está a un `cd ..` de los demás proyectos del usuario y de nuestra
propia carpeta. Nada de esto es una regresión de la ejecución: es lo que significa conceder una
shell, y es la razón por la que la lleva un subagente y se declara en su fichero. Quien concede ejecución concede leer el entorno y el
disco; lo que esto evita es que el harness REGALE lo que él mismo escribió.

### Por qué las rutas van en variables de entorno

Una shell ve el disco de verdad: `/skills/xone-hotswap/` es una ruta virtual de nuestro backend y
para un comando no existe. Poner la ruta absoluta en el prompt tenía dos precios: el comando que
el modelo componga es el `detalle` del evento `tool`, y ahí no puede viajar una ruta de la máquina
(`sinRutas`); y la raíz no es una sino TRES, con la del proyecto ganando. Con una variable por
skill montada (`XONECODE_SKILL_<SLUG>`, la misma derivación que `XONECODE_CLAVE_<SLUG>` y otro
prefijo para que una skill no pueda fabricarse el nombre de una credencial) el prompt dice
`$XONECODE_SKILL_XONE_HOTSWAP/scripts/…` y no hay ruta en ningún lado. Igual con
`XONECODE_ARTEFACTOS`: sin ella, un script escribe en el `cwd` —la raíz del proyecto—, que es
justo lo que `artefactoFueraDeSitio` prohíbe a las tools de fichero y que una shell no pasa.

### Lo que se compensa VIENDO, ya que no se pregunta

No se pide aprobación por comando: «lanza la app» son cuatro, y preguntar cuatro veces mata el
bucle que esto existe para tener. A cambio, el comando ENTERO sale como `detalle` del evento
`tool` —es la única entrada de la lista blanca de `resumenDeTool.ts` que no es una ruta ni un
patrón— con icono y verbo propios, y la capacidad se ve en la tarjeta del agente con una pastilla
ámbar. El precio declarado: si el modelo escribe una ruta absoluta en su comando, esa ruta viaja
por el cable. No se tapa con un limpiador que adivine qué trozo de una línea de shell es una ruta,
porque fallaría en silencio.

### Los scripts van DENTRO de la skill, y eso es lo que hace esto extensible

`curl` no habla WebSocket, y en el framework 5.0.2.2dev el `POST /command` por HTTP da 404 (eso
es del flavor `playStoreDeveloper`). O sea que con `bash` y la skill sola, el primer turno se le
iría en escribir un cliente de WebSocket. Así que el cliente vive en la skill
(`skills/xone-hotswap/scripts/hotswap.mjs`), junto a las dos plantillas de plataforma
(`android-desplegar.mjs`, `ios-arrancar.mjs`). Una skill es una CARPETA —por eso se instalan como
`.zip`— y ahora esa carpeta puede traer programas, no solo texto. **Un aparato nuevo mañana es
una skill nueva con su script: cero código nuestro.**

Dos cosas del cliente salieron de correrlo contra el emulador, no de leer la documentación: la
respuesta del `getScreenshot` viene en `status` y es **JPEG**, no PNG ni un campo `image`; y una
captura son ~57.000 caracteres de base64, así que se guarda a fichero y lo que se imprime es su
nombre y su tamaño — volcarla en la salida del comando la mete en el contexto para siempre sin
que nadie pueda mirarla.

Y una tercera, que apareció al probar la plantilla de despliegue entera: **el canal no está en
pie justo después del reinicio**. El `am start` vuelve cuando Android acepta el intent, no cuando
el servidor escucha, así que el primer `launchApplication` moría con «Received network error or
non-101 status code». Se espera a que CONTESTE, que es la condición de verdad, en vez de dormir
un rato fijo. Probado de punta a punta con un proyecto de usar y tirar: túnel, ZIP, subida,
reinicio, espera, lanzamiento y comprobación — la app no arrancó porque no tenía `bd/gestion.db`,
que es exactamente lo que la plantilla dice que mires primero.

### Correrlo de verdad, que es otra cosa que cablearlo

Cuatro turnos reales sobre un proyecto de verdad (`MinitsMT`) con `gemini-3.8-flash`, que es lo
que ese usuario tiene en sus tres papeles. **El cableado funcionó desde el primero y el agente
tardó tres en hacer la tarea bien.** Las cifras honestas son las LLAMADAS AL MODELO y los
tokens, no los «comandos» —ver más abajo por qué—: 72 llamadas y 821k de entrada en el peor
momento, 17 y 184k cuando salió bien. En medio, el agente capturó la app que ya estaba viva sin
desplegar nada y dijo «se ha lanzado la aplicación»; leyó la skill una y otra vez; probó rutas
absolutas con `read_file`, que no existen para esa tool; y buscó `adb` con `grep` dentro del
proyecto.

**Y una advertencia sobre el instrumento, que es la lección más cara de todas**: la traza de
tools CUENTA DE MÁS. Con `subgraphs: true` y `streamMode: ["updates","messages"]`, cada paso
reemite los mensajes acumulados del subgrafo, así que `aEventos` vuelve a emitir los eventos de
tool anteriores: 286 eventos `execute` para **10 comandos distintos**, con el primero repetido 43
veces. No es un adorno del diagnóstico —lo mismo se ve en la PANTALLA, en forma de tramos
repetidos— y durante media sesión hizo leer «245 → 640 comandos» donde no los había. Las cifras
de llamadas y de tokens vienen del tracker y no de ahí, así que ésas sí valen. Arreglarlo es otra
tarea, y está declarado aquí para que nadie vuelva a decidir con esa columna.

De ahí salen tres cosas que conviene no confundir. Una: el prompt se puede corregir con lo que
enseña la traza, y se hizo. Otra: **el modelo importa más que el prompt aquí**, y
`device-controller` hereda el papel `rapido` por ser `soloLectura` — que es cierto de sus tools
de FICHERO y engañoso para lo que hace. Y la tercera: nada de esto es un fallo del cableado, así
que no hay código que arreglar a ciegas.

### Dos pruebas que la segunda ronda convirtió en necesidad medida

**El `printenv` no era hipotético: fue su segundo comando.** La lista de lo que corrió empieza
`adb devices -l`, `adb forward …`, y a los pocos pasos `env`, `node -e 'console.log(process.env)'`
y `env | grep -i xone`. Orientarse mirando el entorno es lo primero que hace cualquiera con una
shell nueva, modelo incluido. Sin `core/shellDeAgente.ts` las claves de Gemini y de NVIDIA de ese
usuario estarían hoy en el transcript y en el `.jsonl` de esa sesión. Deja de ser una precaución
razonable y pasa a ser la razón por la que esto no se monta con `inheritEnv: true`.

**Y el precio declarado de la ejecución tiene ya su caso real**: el agente sacó la foto con
`adb exec-out screencap > /tmp/screenshot.png` y la copió a la RAÍZ del proyecto, sin aprobación,
sin diff y sin pasar por `artefactoFueraDeSitio` — que es exactamente lo que una shell permite y
lo que se dijo al concederla. Apareció en «cambios en el proyecto» al cerrar el turno, que es la
única red que queda. La palanca que lo reduciría sin fingir una barrera es **dónde se para de
pie**: con el `cwd` en la carpeta de artefactos y el proyecto en una variable, un `> fichero`
ingenuo cae donde se anuncia en vez de en la app del usuario. No está hecho.

### El renombrado

`tester-xone` → `device-controller`, con su entrada en `RENOMBRADOS` y las dos viejas
(`xone-device-tester`, `probador`) **actualizadas al nombre de hoy**, porque esa tabla se lee de
un salto y una entrada que apunte al nombre de enmedio manda a buscar un agente que no existe. El
nombre se sale de la convención `<rol>-xone` por decisión del usuario, y el argumento aguanta: el
sufijo estaba para distinguir nuestros nombres de los agentes del hijo en un motor externo, y a un
motor externo este agente no viaja — ahí la ejecución no se concede.

## `studio_get_context` se cae en el servidor, y se llevaba el `/sync` entero (18-09-2026)

El síntoma era un alta que llegaba hasta el final y luego decía «no se pudo descargar el
proyecto: studio_get_context: An error occurred invoking 'studio_get_context'.». Se midió
contra el MCP de CloudStudio a mano, sin xonecode de por medio, y el reparto es este:

| proyecto | `studio_get_context` | `studio_get_file` | `studio_get_project_structure` | `studio_manage_branches list` |
|---|---|---|---|---|
| Bequikly | **error** | ok | ok | ok |
| Conecta2 | **error** | — | — | ok |
| AppDemo | ok (`no_active_view`) | — | ok | — |
| XOneAI | ok (`no_active_view`) | — | — | ok |

El proyecto estaba ABIERTO en las cuatro (`studio_open_project` contestó
`status: project_open`), así que no es la sesión, ni el token, ni la red. Tampoco es que el
proyecto sea compartido: XOneAI también lo es y contesta. El texto del fallo es el genérico
del servidor —no lleva causa—, así que la causa se queda en su lado: esto **no se arregla
aquí**, lo que se arregla aquí es depender de ello.

Y se dependía de más de lo que hacía falta. `puerto.contexto()` es la ÚNICA forma de saber
qué rama tiene Studio activa —`studio_manage_branches` las enumera y no marca cuál está
puesta; se comprobó que `operation: "current"` no existe—, y esa lectura sirve para UNA
cosa: devolverle el suelo a quien tenga Studio abierto en el navegador al acabar. Lo que
garantiza que se baja (y se sube) de la rama que dice `config.rama` no es esa lectura, es el
`cambiarRama(ramaOrigen)` explícito, que no depende de ella. O sea: una cortesía estaba
tumbando la operación entera, y en la subida era todavía más claro —ahí el posicionamiento
YA era incondicional, así que `contexto()` no decidía nada más que el `finally`—.

`agent/cloudstudio/ramaActiva.ts` es el único sitio donde eso se tolera, y devuelve
`string | undefined`. Cuatro decisiones dentro:

- **El puerto sigue LANZANDO.** Tolerar es de quien llama, no del puerto: cambiar
  `CloudStudioPort.contexto()` para devolver un opcional arrastraría a `CloudStudioEnMemoria`
  y a todos los dobles, y dejaría a `core/` decidiendo una política de la capa de arriba.
- **Un ayudante y no dos copias.** El patrón de fallo de este repo es la regla compuesta en
  un cierre; dos bucles de tolerancia serían dos sitios donde dejar de tolerar.
- **El `undefined` hace el trabajo solo en la descarga.** Ahí la guarda era
  `antes.rama !== ramaOrigen`, y `undefined !== ramaOrigen` es cierto siempre: el
  posicionamiento pasa a ser incondicional sin una rama nueva. El `finally` sí pregunta por
  la ausencia, porque no hay a dónde volver.
- **Se DICE, con la consecuencia.** El aviso nombra la rama en la que Studio se va a quedar,
  no solo que algo falló: el usuario tiene que poder ir a arreglarlo en Studio. No entra en
  `sync.log`, y eso es a propósito: ese fichero es «una línea por OPERACIÓN de sync» y su
  campo `error` significa el fallo ESTRUCTURAL que impidió intentar el plan — aquí el plan se
  intenta y se cumple.

El doble lo reproduce con `contextoFalla` (el mismo molde que `zipFalla`), **después** de
`exigirAbierto()`: el fallo medido ocurre con el proyecto abierto, y ponerlo antes lo
convertiría en otro camino para «no hay proyecto», que es un caso distinto y que
`cloudstudioClient.ts#conSesion` ya atiende reabriendo. Por eso la sesión perdida sigue
tumbando la operación: `conSesion` reabre, reintenta y relanza, y el relanzamiento llega por
el `cambiarRama` siguiente, no por aquí. Los dos tests nuevos mueren con el mutante (que
`ramaActiva` relance en vez de devolver `undefined`).

### Y detrás había un segundo muro: el `switch` de rama CIERRA el proyecto

Con la tolerancia puesta, `/sync bajar` sobre Bequikly pasa a hacer siempre
`studio_manage_branches switch branchName: "jose"`. Se probó esa llamada contra el servidor
antes de dar el arreglo por bueno, y contesta bien — pero contesta esto:

```json
{ "action": "closeandopenproject", "pid": "…", "sid": "…", "newBranch": "jose" }
```

Y a partir de ahí **todo** falla: `studio_get_file` y `studio_get_project_structure` sobre el
mismo proyecto devuelven «Empty response from server» hasta que se vuelve a llamar a
`studio_open_project`. Reproducido dos veces, una por rama. O sea que el `switch` no cambia de
rama dentro de la sesión: cierra el proyecto y deja que el IDE lo reabra.

Eso ya estaba roto antes de este cambio —la descarga cambiaba de rama cuando la activa no era
la origen, y la subida lo hace siempre—, pero la tolerancia lo vuelve el camino normal, así
que había que cerrarlo. `cloudstudioClient.ts#cambiarRama` reabre el proyecto después del
`switch`. Dos cosas que no son de forma:

- **Se reabre por el CONTRATO que el servidor declara** (`action: "closeandopenproject"` en su
  propia respuesta), no por reconocer un texto de error.
- **`SESION_PERDIDA` NO se amplía con «Empty response from server»**, que era la otra forma de
  arreglarlo. Ese mensaje es el genérico de una respuesta vacía y puede venir de cualquier
  fallo del servidor; meterlo ahí pondría una reapertura y un reintento delante de problemas
  que no arregla, y convertiría en mudos los que hoy se ven. La reapertura va donde se sabe
  que hace falta.

Los dos fallos son del mismo servidor y ninguno lo arregla xonecode: el primero se rodea, el
segundo se compensa.

## Una captura acabó en la raíz del proyecto, y la causa era un ENOENT (18-09-2026)

El síntoma: «sácame pantallazos de la coll de login» dejó `screenshot_login.png` (773 KB, PNG)
entre los `.xne` del cliente en `MyAllXOne`, y el propio agente lo contó así —«en la raíz del
proyecto»—. De ahí ese fichero se va a la aprobación, al `add -A` de `commitDeTurno` y al plan
de `/sync subir`.

El prompt de `device-controller` ya decía que lo que se quiera ENSEÑAR va a
`$XONECODE_ARTEFACTOS`, y la skill ya decía que no se usen las herramientas nativas para lo que
contesta el canal. Las dos reglas estaban escritas. Lo que faltaba era que la buena FUNCIONARA.

**El ENOENT, reproducido.** `$XONECODE_ARTEFACTOS` apunta a
`.xonecode/sesiones/<id>/artefactos/`, y esa carpeta **no se crea al montar** —decisión
anterior, para no dejar un `artefactos/` vacío en cada sesión—: la crea
`FilesystemBackend.write` la primera vez que el agente escribe un artefacto por una TOOL. Una
shell no pasa por ahí. Así que en una sesión que aún no había dibujado nada, el
`writeFileSync(join(ARTEFACTOS, nombre))` de `xone-hotswap` revienta:

```
Error: ENOENT: no such file or directory, open '…/artefactos/captura-1789719897539.png'
    at sinBinarios (…/xone-hotswap:…)
```

Y no está dentro de ningún `try`: va en el manejador del WebSocket, así que se lleva el proceso
entero. Lo comprobado no es la inferencia: se extrajo `sinBinarios` tal cual y se corrió con la
carpeta ausente y con la carpeta creada — revienta y funciona, respectivamente. La sesión que
dejó el `.png` en el proyecto (`3af1b883…`) **no tiene carpeta de sesión en el disco**; la
anterior (`93667b3a…`) sí, y sus tres capturas están dentro.

**Dónde va el `mkdir`, que es la decisión.** En `anunciarArtefactosDeLaShell`, justo antes de la
foto del `execute`, y no en el script:

- Cinco scripts, uno escribe. El siguiente que escriba se olvida — el patrón de fallo de este
  repo, y ya van diez.
- Un script de una skill DEL USUARIO tendría que saberse el mismo truco, y no hay dónde
  contárselo.
- Quien SABE que va a correr una shell y DÓNDE está la carpeta es el harness. El script solo
  sabe leer una variable.

Es más estrecho que crearla al montar: solo un agente con `ejecucion` la tiene, así que los
otros cuatro especialistas siguen sin carpeta vacía y la decisión anterior aguanta. El `mkdir`
va en un `try` vacío: antes de esto un comando corría sin carpeta, y un fallo al crearla no
puede volverse un fallo del comando.

**Y el escape hatch, que el código no puede cerrar.** Una shell alcanza el disco entero: no hay
guarda que impida un `adb exec-out screencap -p > captura.png` con el `cwd` en la raíz del
proyecto. Lo que sí se puede es quitarle el MOTIVO, y por eso hay un sexto script,
`xone-captura-android`: hace ese mismo `adb` y lo deja en `$XONECODE_ARTEFACTOS`, imprimiendo
solo el nombre. Pedirlo cuesta menos que componer el `adb` y elegir dónde dejarlo. El nombre
pasa por `basename` —lo elige el modelo, y un `../` escribiría fuera de la sesión, la misma
regla que `esRutaDeArtefacto` en el host— y una captura de cero bytes se DICE en vez de dejar un
fichero con buena pinta. Sigue siendo el respaldo y la ficha lo dice: enseña lo que pinta el
SISTEMA, no lo que la app host dice de sí misma.

**Lo que se cerró de paso**: el prompt NOMBRA sus scripts, y no había nada que comprobara que
existen. Un nombre mal escrito da «command not found» y entonces el modelo se apaña por su
cuenta, que es exactamente cómo apareció el `.png`. Hay test, contra el catálogo REAL del
paquete y **en las dos direcciones** —un script que nadie nombra tampoco existe para quien tiene
que usarlo—, y comprueba además el bit de ejecución, porque sin él el síntoma es idéntico al de
que el fichero no esté.

**Lo que NO se arregló, y es un tercer problema**: el `detalle` de un `execute` —el comando
entero, que es lo que sustituye a preguntar antes de cada uno— **no se persiste en el `.jsonl`**.
En vivo se ve; al reabrir la sesión, las líneas son `$ corre ×6` y el `detalle` no está. Por eso
aquí no se puede decir QUÉ comando dejó el fichero, solo que fue uno.

## Trampas verificadas

- **El orquestador va de SOLO LECTURA, y hasta el 9-09-2026 no lo era** (`PERFIL_DEL_ORQUESTADOR`,
  `xoneAgent.ts`). Su `createFilesystemMiddleware` se montaba SIN `permissions` —eso solo lo
  recibían los subagentes—, así que las tres filas de `DENEGADO_SIEMPRE` eran decorativas para
  él. Medido entonces contra deepagents 1.13.2, y vuelto a medir ahora como test que exige lo
  contrario (`xoneAgent.orquestador.test.ts`): contestaba «Successfully wrote» a `/.env`, a
  `/skills/pwn.txt` —que aterrizaba en la carpeta `skills/` de ESTE repo, o sea en las
  instrucciones del propio harness, porque la raíz montada ahí es `RAIZ_SKILLS`— y a cualquier
  fichero del proyecto; y con `/adjuntos/` montada llegó a escribir en
  `~/.xonecode/tareas/<id>/adjuntos/`, fuera del proyecto y donde la interfaz presenta lo que
  hay como «lo que te adjuntaron». Leer `/.env` entero también podía. Cuatro cosas que hay que
  saber del arreglo:
  - **Lo único que lo tapaba era el prompt** —«NO tienes herramientas», que además era falso—,
    que es exactamente lo que este repo no acepta como barrera. Ahora dice lo que puede: «NO
    tienes herramientas para MODIFICAR nada».
  - **Se le ponen PERMISOS en vez de quitarle las tools**, que era la otra opción declarada. El
    motivo es el comentario que ya estaba al lado: ese middleware sustituye al de por omisión
    de deepagents porque comparte nombre, así que quitarlo podría reinstalar el suyo —sin
    permisos— y reabrir el agujero por accidente. Ponerle `permissions` no puede.
  - **Conserva la lectura del proyecto**: `soloLectura` añade `deny write /**`, así que le
    quedan `read`/`ls`/`glob`/`grep` para orientarse. Solo lectura no es a ciegas.
  - **El HITL tampoco le alcanzaba** (`hitlDe` se monta por subagente), y con esto deja de
    importar: `hitlDe` devuelve `{}` para un perfil de solo lectura, porque no hay nada que
    aprobar. Se le pasa igualmente, para que las dos ramas del fichero se lean iguales.

- **La caché implícita de Gemini no entra a los tamaños de contexto de estos agentes, y el
  adaptador la sobrecuenta en streaming.** Medido con un gancho de hashes sobre el cuerpo de
  cada petición (el prefijo que mandamos es byte-idéntico entre llamadas consecutivas: no es
  cosa nuestra) y con prefijos frescos crecientes contra `gemini-3.8-flash`: a ~11k, 0
  aciertos en 36 llamadas; a ~20k, ~81% desde la segunda; a ~40k, ~91%. `dev` trabaja en
  3-11k y `docs` en 2-20k, así que la caché no es la palanca del coste — las llamadas y el
  contexto sí lo son (`docs/EVALS.md`, «El coste, medido»). Y cuando el stream trae dos
  trozos con `usageMetadata`, `@langchain/google-genai` 2.3.0 suma `cache_read` dos veces
  (32.696 sobre una entrada de 20.097; el servidor decía 16.348): `vendor/tokenTracking.ts`
  acota la caché a la entrada.

- **Un modelo de Ollama RETIRADO tumbaba el catálogo entero.** Medido contra el Ollama del
  usuario: `/api/tags` devolvía 26 modelos y dos de ellos —modelos de Ollama Cloud dados de
  baja— contestaban al `/api/show` con **HTTP 410** y «was retired at …». Siguen en el
  manifiesto local, así que `tags` los nombra, pero ya no existen. El bucle de
  `listarOllamaDesde` no capturaba nada, así que el primer 410 lanzaba y el proveedor ENTERO
  se reportaba como no disponible: elegir «ollama» en el asistente no listaba NADA y volvía
  al paso de proveedor —con 22 modelos usables detrás—, y el mensaje decía «respuesta no
  disponible de ollama» sin nombrar ni el modelo ni el código. Ahora el `/api/show` de un
  modelo se salta si falla (un modelo retirado no está DISPONIBLE, y esta lista es la de los
  disponibles) y el código HTTP va EN el mensaje del error — sin él, un 410 y un 500 se leen
  igual. Lo que NO se traga es que fallen todos: eso no es un catálogo vacío, es un servidor
  roto, y se relanza. `ErrorCatalogoModelos` sigue sin llevar la clave ni el cuerpo remoto:
  la regla es no filtrar secretos, no ser opaco.

- **`SkillsPort.cargar()` sigue sin tener un solo llamador — pero las skills SÍ llegan al
  modelo.** Quien las carga es `SkillsMiddleware` de deepagents, no el puerto: `xoneAgent.ts`
  monta `/skills/` en el backend (`backendConSkills`, un `CompositeBackend` sobre un
  `FilesystemBackend` propio con raíz `RAIZ_SKILLS`) y le pasa a cada subagente
  `skills: rutasDeSkills(perfil.nombre, skills)`, que son rutas virtuales, no contenido. El puerto solo
  aporta `catalogo()`: nombrar las suyas en el prompt y AVISAR de las que falten. Dos detalles
  medidos: la barra final de `"/skills/"` es obligatoria (`CompositeBackend` la retira antes de
  delegar; sin ella reconstruye `//archify/...`, fuera de la raíz) y `permisosDe` deniega
  `write` sobre `/skills/**` — son instrucciones, no ficheros editables.

- **ink@5.2.1 no remide un `<Text>` cuando se INSERTA texto delante de un hijo existente.**
  `dom.js`: `insertBeforeNode` sale sin marcar sucio el `ink-text` padre (append y remove sí lo
  hacen). En la Entrada el cursor va anidado dentro del Text, así que al pasar la línea de vacía
  a un valor que envuelve en un solo render (↑ del historial, pegar) Ink se queda con la medida
  de UNA fila y la fila del modelo pisa la segunda. Hoy la Entrada la esquiva de raíz: parte
  el texto en filas ella misma (`cli/tui/filas.ts`) y cada fila es su propio Text, así que
  ningún Text envuelve (antes el remedio era `key={valor}` en el Text que envolvía).
  `app.test.tsx` lo sigue vigilando con un prompt de dos filas. Si algún día vuelve a haber
  un Text que envuelva con hijos anidados, la trampa vuelve. Volvió una vez, medida en terminal:
  el pie insertaba las cifras de contexto delante de `/ayuda` en el mismo Text y se quedaba
  con 6 columnas («2K» y nada más). Regla práctica: hijos que aparecen y desaparecen, como
  `Text` HERMANOS dentro de un `Box` (insertar en un Box sí remide), nunca anidados en un Text.

- **El `resize` de Ink no re-renderiza React.** `ink.js`, `resized`: recalcula Yoga y repinta
  el árbol YA montado. Lo que dependa de `stdout.columns` leído en el render (la sidebar, que
  solo se monta con más de 120 columnas) se queda como estaba hasta el siguiente acto. `App`
  (`cli/tui/app.tsx`) se suscribe al `resize` y fuerza un re-render; `app.test.tsx` lo prueba
  en los dos sentidos.

- **El código 2 prometía «nada se aplicó», y eso dejó de ser verdad el día que un agente
  externo pudo escribir.** La promesa valía cuando las únicas escrituras eran las del HITL del
  grafo; un agente EXTERNO pide su autorización por escritura y **antes** de escribir, así que
  puede haber dejado algo en el disco cuando el turno se corta después. Medido: un `run --real`
  imprimió el fichero nuevo en su diff y, una línea más abajo, «nada se aplicó». El código se
  queda en 2 —hubo escrituras sin resolver, que no es un éxito, y ésa es la dirección segura
  para CI— y lo que se corrigió fue la FRASE. Lo que está en el disco lo dice el diff de
  «cambios en el proyecto», que es la medida.

- **`result: true` es «ACEPTADO», no «arrancó», y por eso lanzar necesita una LECTURA.** Medido
  el 16-09-2026 contra `com.xone.android.framework` **5.0.2.2dev** (versionCode 28, emulador
  Android 15, `adb forward tcp:8443`): un proyecto al que le falta el fichero que declara su
  `connstring` en `app.xml` recibe `{"result":true}` de `launchApplication` y **muere detrás en un
  diálogo** «Error opening database / Database not found». El acuse del framework dice que aceptó
  el encargo, no que haya app delante, y no espera a que cargue. Lo que lo dice es una lectura:
  `getAllElements` contesta `App is not running` mientras no la haya. Es ««Terminó bien» y «ya
  está» son dos cosas», ahora sobre un dispositivo — y por eso la pestaña enseña la LECTURA como
  prueba, nunca el acuse.

- **El verificador no mira la conexión, y ahí estaba el agujero entero.** El mismo proyecto de
  arriba —el que recibe `true` y muere en el diálogo— pasa `xone-simulator validate` con
  `success: true`, **0 errores y 0 avisos**. O sea que un turno podía quedar VERDE sobre una app
  que no arranca, sin un solo síntoma en ninguna parte. Ésa es la razón de ser del pre-vuelo: no
  es comodidad, es la única comprobación de esa clase que existe.

- **El canal de comandos vive en `/hotswap`, el servidor HABLA PRIMERO, y la grafía es el
  contrato.** Medido en la misma versión: `/`, `/ws`, `/websocket`, `/command` y `/api` contestan
  **400**; `POST /command` por HTTP da **404** en el flavor standalone. Al abrir, el servidor manda
  `{"command":"server_hello","protocol_version":2}` —mandar un comando antes es inventarse un
  protocolo que no es el que hay, así que el cliente ESPERA el saludo con tope en vez de saludar
  él—. Y el nombre de un comando es EXACTO: `launchapplication` en minúscula contesta `Unknown
  command: launchapplication`, sin alias insensible a mayúsculas. Dos comandos que la tabla de la
  skill daba por disponibles **no existen** en esta versión: `getCurrentScreen` y `status`/`state`.
  Y la lectura no puede ser `waitForElement`, que pide el nombre de un control que de una app
  cualquiera no sabemos — inventarse uno es justo lo que la skill prohíbe—; `getAllElements` no
  necesita saber nada de la app y esa es toda la pregunta.

- **El ZIP no limpia el destino, y un `.db` en claro lo corrompe.** `POST
  /file_upload?file=debug_app_update.zip&appName=<Nombre>` extrae en `app_<nombre-en-minúsculas>`
  y **añade y sobrescribe sin borrar nada**: los `-wal`/`-shm` de una base vieja siguen ahí, así
  que mezclar dos bases deja un estado que la app descubre al arrancar. Y la base del dispositivo
  va cifrada con SQLCipher, así que subir un `.db` en claro termina en `database disk image is
  malformed (code 11)`. De las dos cosas sale una decisión de DISEÑO y no de ahorro: **la carpeta
  `bd/` no viaja — se despliega código, no datos**. La app que se prueba ya tiene su base en el
  aparato. (Y el orden de las fases no es negociable por esto mismo: subir **no aplica** —el
  proceso tiene cargado lo de antes—, así que hace falta reiniciar, y el `am start` que vale es
  `SetupActivity`, **no** `.mainEntry`.)

- **El detector de literales del espejo era CIEGO a `camelCase`.** Comparaba los literales
  `tipo:`/`clase:` de las dos uniones —host y cliente— con un patrón de solo minúsculas, dígitos,
  guion y guion bajo, así que un `clase: "algoConMayusculas"` **no lo veía nadie**: la red tenía
  un agujero. Ensanchado a `[A-Za-z0-9_-]+` **sale VERDE**, y revela exactamente tres literales
  que nadie estaba comparando —`modelosDeMotor`, `proyectosDeEntorno`, `sesionAccion`— que
  aparecen **los mismos tres** en el cliente y en el host, así que la comparación sigue cuadrando.
  O sea que el agujero existía y **no había caído nada por él**, que es lo único que hace que el
  ensanchado descubra un test y no un bug. Queda un test hermano que fija que `camelCase` ya no
  es invisible.

- **La base se comprueba por CONVENCIÓN, y el censo es lo que lo decide — al revés de como se
  leyó la primera vez.** Cinco proyectos reales medidos el 16-09-2026: `MinitsMT` declara **2**
  conexiones —una de proveedor y una que es `bd/gestion.db`—, `Replanteos_2026` **1**
  (`Provider=Xone Remote Provider;ProgID=…`), `MyAllXOne` **2** (una remota por http), `AppDemo`
  **0**, y el esqueleto de `core/esqueleto.ts` **1** (una ruta). De esa tabla se concluyó primero
  «el pre-vuelo solo dispara sobre `connstring` que son RUTAS», con `esRutaDeFichero` como
  predicado — y **es un falso negativo, que es el error que el propio módulo llama peligroso**:
  **tres de esos cuatro proyectos no declaran su base y los cuatro la tienen**, porque XOne usa
  `bd/gestion.db` **por defecto**, se declare o no. Una regla que dependiera de la declaración
  dejaría sin mirar el caso más común —el medido, el acuse `{"result":true}` y el diálogo «Error
  opening database» detrás— justo en los proyectos donde más pasa, y el único donde habría
  disparado es el esqueleto, que es el que falla *y además la declara*: la coincidencia que hizo
  parecer buena la regla. La corrección, ya puesta: se comprueba **siempre** `bd/gestion.db`
  (constante `RUTA_DE_LA_BASE`) y **además** cualquier otra ruta que el `app.xml` declare —una
  segunda base es otro sitio donde puede faltar un fichero—, con dos causas distintas para poder
  decir la verdad específica de cada caso (`falta-la-base` / `falta-el-fichero-de-la-conexion`).
  **Reproducido contra el emulador el 17-09-2026**, sin tocar `app.xml`: con `AppDemoVerificacion`
  —`app.ini` `name=AppDemo`, la base presente, **cero** `<connection>`— el veredicto por el cable
  solo traía la falta del dispositivo; apartando `bd/gestion.db` apareció la frase larga, y
  devolviéndolo desapareció, sin cambiar nada más. Tres cosas más del mismo censo: **un proyecto
  sin ninguna `<connection>` NO bloquea por eso** (no declarar ninguna no es síntoma de nada, y el
  dato de lo declarado viaja en `Veredicto.conexiones`); **el `app.ini` real escribe `name=` en
  MINÚSCULA** (`name=Replanteos_2026`, `name=MyAllXOne`, `name=AppDemo`) mientras el esqueleto lo
  escribe `Name=` en mayúscula, así que un lector sensible a mayúsculas devolvería `undefined` en
  TODOS los proyectos reales y funcionaría solo en el esqueleto — el patrón de fallo de esta casa
  otra vez—; y **este censo se midió primero con `grep`, que en este shell es un shim que devuelve
  VACÍO**: MinitsMT salió «0 conexiones» y tiene **2**. Para medir con grep en esta máquina:
  `command grep`.

- **La comprobación mira el PROYECTO y no el APARATO, y por eso tiene un falso positivo que la
  frase RECONOCE.** El fichero se busca en el proyecto en disco; pero el ZIP del despliegue **no
  lleva `bd/`** (la base no viaja), así que un dispositivo donde esa app ya se lanzó antes tiene su
  copia y una segunda subida no necesita nada del proyecto. Es un bloqueo que puede no serlo, y no
  se puede levantar preguntándole al aparato porque eso no está medido: lo único honesto es que la
  frase lo diga («Se mira el proyecto, no el aparato: si esta app ya se lanzó antes en ese
  dispositivo, allí sigue su copia y no hace falta esto.»). Es la única frase del catálogo que
  admite poder estar equivocada, y lo es a propósito: la alternativa —callarlo— deja a quien la lee
  sin salida ante un NO que no lo es, que es peor que el NO.

- **`zipSync` de `fflate` estampa `Date.now()` si no se le da fecha, y la marca de tiempo del ZIP
  tiene resolución de 2 SEGUNDOS.** Medido directamente contra el `fflate` del repo, con un barrido
  de desplazamientos desde una misma referencia: hasta **1999 ms** de diferencia los bytes salen
  IDÉNTICOS; a partir de **2000 ms** salen distintos. O sea que «dos ejecuciones del mismo árbol
  dan los mismos bytes» es una propiedad que hay que **construir**, no que suponer — sin ella,
  comparar dos paquetes o cachearlos es imposible. Y el otro lado del mismo campo: una `mtime` de
  **0** —la que dejan algunos ficheros— o anterior a 1980 hace que `fflate` lance `date not in
  range 1980-2099` **sin decir de qué fichero**, que es un fallo mudo sobre el que se pierde una
  sesión. El remedio, ya puesto: cada entrada lleva **su `mtime` real** con un suelo de 1980
  (`FECHA_MINIMA_DEL_ZIP`), nunca `Date.now()`.

- **El `Content-Type` que vale al subir: `application/octet-stream`, medido.** El comando que se
  había medido funcionando era un `curl --data-binary`, cuyo `Content-Type` por omisión es
  `application/x-www-form-urlencoded`, así que durante una pasada esto quedó declarado sin
  afirmarse: no estaba medido si el servidor mira esa cabecera. Ya lo está. Subiendo con
  `Content-Type: application/octet-stream` —y con `Content-Length`, sin el cual el endpoint
  contesta `411`— el servidor responde **200** y **los bytes llegan enteros**: la prueba no es el
  código, es que el `md5` de `LoginColl.xne` y de `app.xml` **en el aparato** coincide con el del
  proyecto en disco, y que con eso subido la app arranca y contesta su árbol de controles. La otra
  mitad de la misma medida es que el cuerpo **no se interpreta como formulario** — si lo hiciera,
  unos bytes binarios no llegarían intactos.

- **El primer `launchApplication` detrás de un reinicio en frío se ACEPTA y no arranca nada: lo que
  arranca la app es un envío POSTERIOR.** Es la trampa que más ha costado de toda la pestaña. La
  primera mitad ya estaba escrita —`result: true` es «aceptado», no «arrancó»— y se había
  interpretado como «hay que LEER para saber si arrancó»; lo que hay además es que **el primer
  envío no arranca**. Con un solo `launchApplication` y una lectura por segundo salen **doce
  lecturas muertas a lo largo de los 60 s** del tope, tres veces seguidas, y ninguna app.
  Reenviándolo cada `INTERVALO_DE_REENVIO_MS` (5 s) el árbol de controles llega **2-3 s después del
  segundo o tercer envío**, y todas las corridas buenas de la sesión se pusieron vivas justo detrás
  de un reenvío: ninguna sin él. **Y se ve desde la propia pestaña**, que es una confirmación
  independiente y no la misma con otro traje: en el log del recorrido salen las lecturas muertas
  seguidas —siete en la corrida buena, de las que las seis de en medio no se distinguen entre sí— y
  detrás la línea `el framework aceptó el lanzamiento y la app no arrancó: se le vuelve a pedir`.
  O sea que el reintento **no es un caso raro que se vio una vez en una sonda**: es el camino normal
  de este emulador, y la pestaña lo cuenta mientras corre. **Reenviar tiene un precio medido**: sobre una app VIVA el
  `launchApplication` la tumba (`MainEntry.finishApp()` → `closeApplication` → `Terminating and
  disposing appData`, un ciclo vivo/muerto visible cada 5 s). Por eso el bucle de sondeo **solo
  llega al reenvío después de una lectura que diga que no está viva**, y eso no es un `if` de
  prudencia: es lo que hace cierta la propiedad, que se sostiene por construcción y no por una
  condición que alguien pueda quitar. Un reenvío que el framework RECHAZA corta ahí con su frase
  literal, sin insistir.

  **Dos hipótesis que se persiguieron y se descartaron, y por qué.** (1) Una **carrera a mitad de
  extracción** —el `200` de `/file_upload` volviendo antes de que el framework acabe de extraer y
  el `am force-stop` de detrás matando el proceso a medias—: se refutó con una pausa de 12 s entre
  la subida y el force-stop, tras la cual el primer lanzamiento quedó igual de inerte. (2) **El ZIP
  de la pestaña**: se refutó subiendo sus **bytes exactos** con una sonda que sí reenvía → viva a
  los 16,2 s. Los mismos bytes, la misma secuencia, lo único que cambiaba era si se volvía a pedir
  el lanzamiento.

- **El reloj del aparato NO es el del host, y su desfase no es un número redondo.** Medido dos
  veces en dos sesiones: `adb shell date` dio `Wed Sep 16 23:31:59 CEST 2026` mientras el host, en
  UTC, estaba en `Wed Sep 16 21:32:22 UTC 2026` — o sea **+2 h − 23 s**, consistente con el
  `+1 h 59 m 37 s` medido antes y **no** con el «exactamente +2 h» que se venía repitiendo. El
  desfase no es constante entre arranques del emulador. Consecuencia práctica: correlacionar una
  línea de `logcat` con un sello del host pide llevar el desfase encima y medirlo, no restarlo de
  memoria.

- **`adb shell pidof` corre con un proceso que se está muriendo, y un «reinicio» puede no reiniciar
  nada.** Dos trampas del mismo paso. **(1)** `pidof <paquete>` **sale con código 1 cuando no
  encuentra nada**, así que hay que envolverlo; y además **compite con el proceso que se está
  muriendo**, así que preguntado justo detrás del `am force-stop` puede contestar que vive uno que
  ya no está. Lo fiable es `ps -A` filtrado por el paquete **después de un asentamiento de ~3 s**,
  que además dice cuántos quedan. **(2)** `am start` sobre una instancia que YA está corriendo
  imprime `Activity not started, intent has been delivered to currently running top-level
  instance` y **no arranca nada**: un «reinicio» puede ser un no-op silencioso, y con él se sigue
  probando el código VIEJO que el proceso tenía cargado. Por eso el reinicio se pide siempre con un
  `force-stop` delante y **comprobando que murió**.

- **`SetupActivity` tarda 5-6 s en Display, y `mainEntry` aparece ~4 s después.** Medido en
  `logcat` con una app que arranca de verdad: `ActivityTaskManager: Displayed … for user 0:
  +5s10ms` y `+5s947ms`. Sirve para dos cosas: para no confundir «tarda» con «no arrancó» cuando se
  mira el reloj a ojo, y para saber que **el tope de arranque (`TOPE_DE_ARRANQUE_MS`, 60 s) se gasta
  SONDEANDO y no esperando a que la pantalla del framework aparezca** — cuando el lanzamiento
  fallaba, el canal se cerraba a los 60 s de sondeo con el framework despierto desde el segundo 10.

- **El puerto 8443 es el de FÁBRICA: esta sesión lo midió puesto, y leer el REAL no está medido.**
  La mitad medida es que el puerto del aparato era de verdad 8443, y lo confirma algo de fuera del
  framework: su propio `logcat` dice `adbd: failed to connect to socket 'tcp:8443': Connection
  refused` **en el instante en que el proceso se muere** — es adbd diciendo que el destino de su
  túnel ya no está. La otra mitad son **dos caminos que se midieron CERRADOS**: `/proc/net/tcp`
  **no sirve**, porque el shell no ve los sockets de la app (`run-as … cat /proc/net/tcp` vuelve
  vacío, y lo que el shell sí ve son los suyos), ni sirve el tag `XOneHotswap` del framework, que
  cuenta su ciclo de vida —`checkMarketUpdate`, «Stopping periodic hotswap ping check»— y **el
  puerto no lo dice nunca**. Queda la ruta que el comentario del código da por buena —«el real se
  ve en la pantalla del framework»—, que viene de la documentación y **sigue sin medirse**: por eso
  el código implementa contra 8443 y lo declara, en vez de fingir que lo lee.

  **Y de paso, un riesgo medido que no es del puerto sino del túnel: los `adb forward` se
  ACUMULAN.** `adb forward --list` tenía **dos** —`tcp:8443`, el nuestro, y `tcp:8872`, de una
  sesión cuyas notas ya no existen: `git log -S` no lo encuentra y la constante ha valido 8443
  siempre—. El código aplica el suyo y **no lo quita al terminar**, a propósito (un recorrido
  fallido se sigue pudiendo mirar después), así que lo que hay es un túnel viejo apuntando a un
  puerto donde puede estar escuchando **otra cosa**, sin que nada compruebe que no se pisen. Hoy no
  hace daño porque el 8872 no lo usa nadie; el día que sí, el síntoma es hablar con el servidor
  equivocado y creer que se habla con el framework.

(Antes había una segunda trampa: `docs/COMO-PROBARLO.md` decía que la consola no hablaba con el
agente real. El doc ya está corregido — `cli/main.ts` monta `crearEjecutorReal` por omisión y
`--guion` es el modo de pega. Ante una discrepancia entre doc y código, el código manda.)

## El workspace: dónde viven las copias locales (18-09-2026)

### El síntoma, y por qué no era estético

En una máquina con los dos entornos oficiales registrados, `~/.xonecode` tenía esto:

```
~/.xonecode/
  agentes/  skills/  tareas/  opencode/
  auth.json  settings.json  cloudstudio-oauth.json
  webstudio/workspace/{AppDemo, AppDeve, PlaemerWebTestAsync}
  manager/workspace/{ABCTempo_Revolution, ACAProd, ActivoMobileDev, MyAllXOne}
```

`rutaDeWorkspace` componía `<base>/<entorno>/workspace/<proyecto>` y la base por omisión era
`~/.xonecode` a secas, así que **el id de cada entorno quedaba de hermano de la casa del
harness**: las credenciales, los subagentes y la cola de tareas en el mismo cajón que el
trabajo del usuario. Y había un segundo precio que solo se ve al configurar la base: quien
pusiera `settings.workspace = /Users/x/xone-proyectos` no obtenía esa carpeta, obtenía
`/Users/x/xone-proyectos/<entorno>/workspace/<proyecto>` — un nivel que no había pedido y
que no podía quitar, porque el literal estaba dentro de la función.

### La decisión: el literal se muda del medio a la base

`<workspace>/<entorno>/<proyecto>`, con la omisión en `~/.xonecode/workspace`. Con eso lo
que se configura ES el workspace, y la omisión deja la casa del harness arriba y lo bajado
junto y abajo.

**El segmento del ENTORNO se queda, y se planteó quitarlo.** `AppDemo` existe a la vez en
los dos entornos de esa máquina, así que un reparto plano (`<workspace>/<proyecto>`) los
haría la misma carpeta — dos proyectos distintos, de dos servidores distintos, compartiendo
historia de git y checkpoint. `Wizard.tsx` ya documentaba la mitad de esto por otro camino:
los on-premise necesitan id propio justo para no compartir carpeta de workspace.

### Lo que NO era estético: los commits por turno se paraban solos

`dentroDelWorkspace(raiz, base)` es lo que decide si el harness puede commitear al cerrar
cada turno — en la carpeta que creó él sí, en la que abrió una persona no, porque ahí sería
ensuciarle el historial. Con el reparto nuevo y la base nueva,
`~/.xonecode/webstudio/workspace/AppDemo` **deja de estar dentro**, y entonces esas siete
copias se quedaban sin commit por turno sin un solo síntoma: la pestaña Revisión se cae al
respaldo «desde-apertura» y nadie tiene por qué notarlo. Eso convirtió la mudanza de «sería
limpio» en «no hay alternativa»: dejarlas y avisar tampoco valía, porque el aviso saldría en
cada arranque para siempre.

### La mudanza, y las cuatro decisiones que tiene dentro

Corre en `arrancarConsolaWeb`, **antes del vestíbulo y antes del corredor de tareas**: el
primero compone raíces con el reparto de ahora y el segundo abre la raíz que la tarea lleva
grabada, así que cualquiera de los dos por delante abriría una carpeta a punto de moverse.

1. **Proyecto a proyecto, no la carpeta del entorno entera.** Mover
   `<entorno>/workspace` de una pieza parece más barato y no vale en el caso de quien ya
   tenía `settings.workspace` puesto: ahí el destino (`<workspace>/<entorno>`) es el PADRE
   del origen, y sería mover una carpeta encima de sí misma. Proyecto a proyecto sirve para
   los dos casos con un solo camino. El degenerado —un proyecto llamado `workspace`— se
   reconoce por «una cuelga de la otra» y se salta; contarlo como choque diría que hay dos
   copias donde no hay ninguna.
2. **Un destino que ya existe no se pisa, y se DICE.** Ahí dentro hay historia de git,
   sesiones y un checkpoint. Y callarlo dejaría dos copias del mismo proyecto sin que nadie
   supiera cuál mira la consola.
3. **Solo lo que se movió de verdad reescribe una ruta guardada.** Hay dos almacenes con
   raíces absolutas escritas: `proyecto.raiz` del índice de tareas y las claves de
   `settings.sinAprobacion`. Sin reescribirlas, una tarea pendiente abre una carpeta que ya
   no está, y una autorización de escribir sin preguntar deja de aplicarse en silencio — la
   dirección segura, sí, pero es un ajuste que el dueño de la máquina dio por puesto. Cada
   reescritura vive en el fichero DUEÑO de su formato (`tareasEnDisco.ts`,
   `settingsEnDisco.ts`), no en quien muda: un segundo sitio que sepa escribir el índice
   divergiría del primero en cuanto uno se corrigiera.
4. **El husco vacío se retira con `rmdir`, que por construcción nunca vacía nada.** Un
   `notas.txt` del usuario ahí dentro deja la carpeta en pie, que es la respuesta correcta.
   Lo único que se borra antes es la basura del SO, y de la lista CERRADA que `gitSync.ts` ya
   mantiene: medido sobre el caso real, Finder había dejado un `.DS_Store` en las dos
   carpetas, y sin esto el husco vacío se quedaba en `~/.xonecode` para siempre — justo lo
   que la mudanza venía a quitar.

El ensayo sobre la máquina real, antes de mover nada: 7 copias a mudar, 0 choques.

### Poder elegir la carpeta: el escritor ya existía y no lo llamaba nadie

`agent/config/settingsEnDisco.ts#guardarWorkspace` estaba escrito, documentado y con su
test — y con **cero llamadores de producción**. Es el patrón de fallo de este repo en su
forma más pura: la regla estaba escrita, no montada, y nada podía decirlo porque su test
pasaba. Por eso la composición se extrae (`ajusteDeWorkspaceCableado`) y lo que se prueba en
`montarRutas` es que el MENSAJE llega a la función, no que la función funcione.

### La base se relee en cada uso

`baseDeWorkspace` pasa de ser un `string` a ser una función, y con ella el `base` de
`commitDeTurnoCableado`. El motivo es el mismo que ya tenían `sinAprobacion` y el tope de
concurrencia: se cambian desde Ajustes con la consola en marcha, y un valor resuelto al
arrancar deja el resto del proceso trabajando con el de antes. Aquí el síntoma sería doble y
los dos mudos: lo siguiente se bajaría al sitio viejo mientras la pantalla enseña el nuevo, y
`dentroDelWorkspace` compararía contra la carpeta de antes y pararía los commits por turno.

### Cambiar la carpeta no mueve nada, y eso se dice

Se decidió a propósito y la pantalla lo escribe. Las razones: un `renameSync` entre volúmenes
es EXDEV —y el caso interesante de elegir carpeta es justo un disco externo—, y mover
gigabytes de trabajo ajeno como efecto secundario de guardar un ajuste no es algo que se pueda
hacer sin preguntar. Lo que cambia es dónde cae lo SIGUIENTE. Lo que queda abierto es ofrecer
la mudanza con el plan delante, por la misma puerta que ya usa la subida.

### La ruta en el cable: la excepción nombrada a `sinRutas`

«Ninguna ruta de la máquina viaja por el cable» tiene aquí su única excepción, y no se puede
esquivar: el campo de Ajustes tiene que enseñar la carpeta que hay puesta, porque una ruta que
no se enseña no se puede elegir. Lo que sí se puede es que el caso normal no lleve dentro el
nombre de la cuenta del sistema, y de ahí `abreviarConCasa`: `~/.xonecode/workspace` dice lo
mismo sin decir quién eres. Quien elija un disco de fuera manda su ruta entera, porque no hay
forma de nombrarla si no, y esa es una decisión suya tomada con el campo delante.

Se GUARDA absoluta. Un `~` dentro de `settings.json` sería una ruta que solo significa algo
para quien la escribió, y ese fichero se lee desde procesos que no tienen por qué compartir
casa. Y la regla de qué vale se aplica en el SERVIDOR además de en la pantalla: el cliente
lleva su copia DECLARADA —como la de la URL de un entorno— para poder explicar el no, porque
`informar` no llega al navegador desde el vestíbulo; pero una pantalla solo esconde un botón.

### El selector de carpeta, y por qué no lo pone el navegador

Lo primero que uno intenta es `showDirectoryPicker()`, y no vale: entrega un handle del que
solo se puede leer el NOMBRE de la carpeta. Lo segundo es `<input webkitdirectory>`, y
tampoco: entrega rutas RELATIVAS a lo elegido. Las dos cosas son deliberadas de la
plataforma —una web no tiene por qué saber cómo está montado tu disco— y las dos son justo lo
que aquí no sirve, porque `settings.workspace` necesita la ruta entera.

La tercera opción es un explorador propio: el servidor lista carpetas y el cliente navega.
Funciona, y el precio es que el **árbol de carpetas de la máquina** empieza a viajar por el
cable. La ruta del workspace es una excepción declarada a `sinRutas`; el mapa del disco
entero sería una excepción mucho más ancha para el mismo resultado, así que se descartó.

Lo que se hizo es abrir el selector NATIVO donde corre la consola (`osascript` en macOS,
`zenity` en Linux): solo cruza el cable la carpeta que la persona elige, que es la misma que
iba a teclear. Cuatro decisiones dentro:

- **Elegir y guardar son dos actos y dos mensajes.** Lo que devuelve el diálogo entra en el
  CAMPO; guardar sigue siendo pulsar el botón. Guardar desde el propio diálogo dejaría el
  ajuste escrito antes de que nadie hubiera leído la ruta entera, y en un campo cuyo único
  trabajo es que la ruta se pueda leer eso sería quitarle el trabajo.
- **Se contesta 204 en el acto y la carpeta llega por el SSE.** El diálogo tarda lo que tarde
  una persona, y dejar una petición HTTP abierta minutos enteros es lo que este servidor no
  hace en ningún otro sitio.
- **Cancelar se ACUSA igual**, con `ruta` ausente. Sin ese acuse el «Abriendo…» del botón se
  quedaba encendido para siempre después de un simple «no, gracias». Y el acuse lleva un
  CONTADOR, no solo la ruta: elegir dos veces la misma carpeta no cambia la cadena, y
  entonces el campo no se enteraría de la segunda.
- **La carpeta de partida va como ARGUMENTO, nunca interpolada en el AppleScript.**
  Interpolada, una comilla en el nombre de una carpeta cierra la cadena y lo que venga detrás
  se ejecuta.

**Límite declarado**: el diálogo sale en la máquina donde corre la consola, así que mirándola
por un túnel el botón no sirve. Por eso el campo de texto sigue siendo el camino principal y
esto es un atajo; y en un sistema sin selector conocido la opción no se monta y el botón no
llega a existir, que es mejor que un botón que no hace nada.

### Y por qué la ruta dejó de viajar abreviada

La primera versión mandaba `~/.xonecode/workspace` por el cable, para que el caso normal no
llevara el nombre de la cuenta del sistema. Se cayó al mirarla en el navegador: **la cabecera
de esa misma consola ya saluda por el nombre del usuario**, así que el `~` no tapaba nada que
no estuviera ya — y a cambio dejaba en pantalla una ruta que no se puede comprobar de un
vistazo, que es exactamente para lo que ese campo existe. Ahora viaja entera; el `~` se sigue
aceptando al TECLEAR, que es comodidad de entrada y otra cosa.

Y de rebote salió un fallo de disposición que solo se ve en el navegador: con la ruta completa,
los dos botones en la misma fila le comían el ancho al campo y la ruta salía cortada. Los
botones caben en cualquier ancho y la ruta no, así que la fila es del campo y los botones van
debajo.

## Las skills sí llegan a los motores externos (18-09-2026)

### El síntoma, y por qué no era «falta copiar unas carpetas»

La pregunta que lo destapó fue del usuario: *«si tenemos que meter ahí nuestras skills, no sé
por qué usas Claude Code»*. Y tenía razón, porque lo que se le había propuesto —copiar sus
skills a `~/.xonecode/skills/`— **no habría servido de nada**: `/skills/` es una ruta virtual
de nuestro `CompositeBackend`, y un hijo de Claude Code corre en otro proceso y lee el disco.
La copia solo habría dado de comer a los cinco especialistas internos. Dos copias para dos
públicos: el segundo sitio donde decidir lo mismo.

Debajo había un fallo de verdad. Sus skills **sí** llegaban al hijo de Claude Code —no
pasamos la opción `skills` del SDK, y su documentación dice que omitirla «**no es** skills
off»: sigue valiendo el descubrimiento del CLI, o sea su `~/.claude/skills/`—, pero la tool
`Skill` no estaba en ninguna de las tres listas de `escrituraExterna.ts`, así que caía en
«desconocida» y el hook `PreToolUse` contestaba `deny`. Lo peor de los dos mundos: el modelo
ve las skills listadas en su contexto y se le dice que no cada vez que va a abrir una. Y
tampoco había puerta de atrás, porque esos ficheros viven fuera del proyecto y
`veredictoDeLectura` corta un `Read` ahí.

### Paso 1: `Skill` a la lista de lectura

Entra como LECTURA y no como una cuarta clase, porque eso es lo que hace: mete instrucciones
en el contexto. No ejecuta nada por su cuenta, y lo que una skill MANDE hacer vuelve a pasar
por el mismo hook. La confianza que asume es la que el fichero ya declaraba con
`settingSources: ["user"]`: el hijo es el Claude Code del usuario, con sus MCP y sus hooks —que
ejecutan código—, así que negarle unas instrucciones suyas no defendía nada.

### Paso 2: OpenCode, por `skills.paths`

Su configuración tiene `skills: { paths: [...] }` («Additional paths to skill folders»), y esa
configuración ya la reescribimos entera en cada arranque en `~/.xonecode/opencode`. O sea: una
clave en un fichero que ya era nuestro.

**Comprobado contra el binario instalado**, sin gastar un token de modelo: `opencode serve` con
esa configuración y un `GET /skill` a su endpoint. Aparecen las nuestras junto a las suyas. Dos
cosas que salieron de esa medida y no del manual:

- **Ya descubría solo sus `~/.claude/skills/` y `~/.agents/skills/`**, así que lo que esta
  clave añade son las NUESTRAS, no las suyas.
- **En un choque de nombre gana la suya**: `xone-project-generator` está en su carpeta
  sincronizada y en nuestro paquete, y el listado lo resolvió a la suya. Nuestra precedencia
  (`cargarSkills`) no gobierna eso; lo gobierna opencode.

Y `permission.skill` se declara explícito en `"allow"`: esa configuración es nuestra superficie
cerrada, y un permiso que depende del valor por defecto de otra versión es el ajuste que cambia
sin que nadie se entere.

### Paso 3: Claude Code — y aquí la primera idea era FALSA

La hipótesis era `additionalDirectories`, porque la documentación del SDK dice que añadir un
directorio recarga «CLAUDE.md, **skills**, and plugins». Se montó una carpeta con la disposición
`<dir>/.claude/skills/` y se le preguntó a un hijo de verdad qué skills tenía: listó las del
usuario y las de sus plugins, y **ninguna de las dos del montaje**.

La palanca que sí funciona es `plugins: [{ type: "local", path }]` con un `plugin.json` cuyo
campo `skills` apunta a una subcarpeta. Con eso, las mismas dos aparecieron como
`xonecode:xone-review` y `xonecode:xone-debugging`. La comprobación final, ya con el código
cableado, listó las nueve del paquete **más una plantada en el proyecto** — o sea que las tres
raíces se funden con su precedencia.

Cuatro decisiones dentro:

- **Enlaces y no copias.** Las de serie pesan megas (una sola son 77 ficheros) y esto se monta
  en cada arranque de un subagente externo.
- **La carpeta de skills se RECREA entera** en cada montaje. Dentro solo hay enlaces nuestros,
  así que borrarla es seguro; sin recrearla, una skill que el usuario quitó seguiría anunciada
  por un enlace roto.
- **Un fallo al montar devuelve AUSENTE y no tumba el turno**: el hijo arranca sin plugin, que
  es como estaba antes.
- **Nada se escribe dentro del proyecto**, que era la propuesta inicial (crear `.claude`,
  `.opencode` y `.codex` en la carpeta del proyecto). No se puede: el proyecto es la app del
  cliente, se sincroniza con CloudStudio —`.xonecode/` tiene filtro propio para no subir, pero
  `.claude/` no es `.xonecode/`— y entra en el `add -A` del commit de cada turno. Y para
  opencode, su `.opencode/plugin/*.ts` ejecuta código arbitrario: es exactamente la puerta que
  `OPENCODE_DISABLE_PROJECT_CONFIG=1` cierra a propósito.

### Lo que queda fuera, dicho entero

- **Codex.** Sus skills llegan por su sistema de PLUGINS (en la configuración del usuario se ve
  un `[plugins."anthropic-skills@claude-cowork"]`) y sus agentes por `~/.codex/agents/*.toml`.
  No hay carpeta de skills que apuntar, así que ahí sigue el límite.
- **Una skill de varios ficheros se queda en su `SKILL.md`.** Lo que carga el motor por su
  cuenta son las instrucciones; si la skill manda leer otro fichero de su carpeta, ese `Read`
  cae fuera del proyecto y lo deniega `veredictoDeLectura` (y en opencode, `external_directory`).
  **No se ensancha esa guarda para arreglarlo**: abrir la lectura a una carpeta de fuera por
  comodidad es justo el agujero que esa función existe para cerrar. Se dice en vez de pagarse a
  escondidas.
- **Y lo que una skill mande EJECUTAR se sigue denegando**: `Bash` no entra por esta puerta.
- **El nombre le llega prefijado** (`xonecode:<nombre>`) mientras que el `.md` de un subagente y
  `promptDeAgente` lo nombran a secas. No se reescribe el prompt para igualarlo: el prefijo lo
  pone el motor, y adivinarlo aquí sería atarse a su formato.

### Y por qué nuestras skills no están en `~/.xonecode/skills/`

Porque no se copian ahí nunca, y eso ya estaba decidido: viven dentro del paquete instalado
(`RAIZ_SKILLS`) y el backend cuelga esa raíz ENTERA en `/skills/`, con las del usuario colgando
una a una debajo. Copiarlas sería duplicar megas por máquina y volver a resolver la siembra
carpeta a carpeta en cada `npm install`; leyéndolas del paquete, una mejora nuestra llega sola.
De ahí que en Skills no haya `.semilla.json` ni «restaurar», a diferencia de los subagentes: no
hay nada que restaurar porque nada nuestro se copió nunca.

## Exportar a PDF sin abrirle la shell a nadie (18-09-2026)

### La petición, y por qué no se resolvía sola

«Que se pueda generar PDF y DOCX con Claude Code, porque no me lo permite aunque Claude Code
tenga las skills globales». Las skills estaban, y llegaban: desde que `Skill` entró en la lista
de lectura, el hijo las carga. El problema es lo que esas skills SON. Leídas por dentro:

- **`docx`**: «Write a `docx` (npm) script», `unzip` → editar `word/document.xml` → `zip`,
  `pandoc -t markdown`.
- **`pdf`**: su `SKILL.md` es todo bloques de Python y trae ocho `.py` en `scripts/`.

Su método entero es «ejecuta esto», y `Bash` está denegada para los motores externos porque una
shell basta por sí sola para reescribir el proyecto saltándose la política, el diff y las
guardas de ruta.

Y hay una segunda causa que la primera tapaba. Medido sobre la máquina real, en los CINCO
Python instalados: `pypdf`, `reportlab`, `python-docx` y `python-pptx` no estaban en ninguno;
tampoco `pandoc`, ni LibreOffice, ni el `docx` de npm. Esas skills asumen el sandbox de Claude,
donde sus dependencias vienen puestas. **Conceder la shell no habría dado el PDF**: el hijo
habría escrito el script y se habría estrellado en el `import`.

### La decisión: lo convierte el harness, con un comando fijo

Lo que sí hay en cualquier máquina que use la consola web es un navegador, y un navegador
imprime. Así que la conversión la hace el harness —comando escrito por el CÓDIGO, sin prompt
que pueda torcerlo— y la shell del hijo sigue cerrada. Se descartaron las otras dos:

- **Abrir `Bash` al hijo con `ejecucion: true` declarado**: simétrico con el motor interno,
  pero mueve una barrera para algo que además no funcionaría sin instalar media docena de cosas.
- **Hacerlo por el motor interno** (`motor: modelo` + `ejecucion: true`): no mueve ninguna
  barrera, pero arrastra el mismo problema de dependencias.

### Tres cosas que se midieron y cambiaron el diseño

**1. Los flags de Chrome NO desactivan JavaScript.** La primera versión pasaba
`--blink-settings=scriptEnabled=false`, con el argumento de que un `.md` del proyecto puede
traer un `<script>`. Probado con un documento que se reescribe a sí mismo desde un script: con
ese flag, con `--disable-javascript` y sin nada, el script se ejecutó **en los tres casos**. Lo
que sí lo corta es una `<meta http-equiv="Content-Security-Policy">` en el documento, que
además —con `default-src 'none'`— corta la RED: un `<img src="https://…">` dentro de un
documento del proyecto podría avisar fuera de que se está imprimiendo.

**2. Y ese flag rompía la impresión, en silencio.** Con él puesto, Chrome sale con código 0 y
**no escribe el PDF**. Lo cazó la comprobación de que «terminó bien» y «hay fichero» son dos
cosas —la misma regla que ya usaba la instalación de dispositivos—, que estaba escrita por
disciplina y se ganó el sitio en su primer uso real.

**3. Un test que depende de si la máquina tiene Chrome no fija nada.** La búsqueda del
navegador se inyecta por parámetro: sin eso, el caso «no hay navegador» pasaba en CI y fallaba
en la máquina del que lo escribió, que es no probar nada.

### Lo que no se puede elegir desde fuera

El destino lo DERIVA el código del origen (`doc/X.md` → `doc/X.pdf`). Con un destino por
parámetro, exportar sería una forma de escribir cualquier fichero del proyecto sin pasar por
ninguna aprobación. Las guardas de ruta son las MISMAS que las de la pestaña Ficheros y no una
copia. Y el HTML intermedio se escribe fuera del proyecto: dentro entraría en git, en el commit
de cada turno y en la siguiente subida a CloudStudio.

La autorización es teclear `/pdf`, como crear una tarea: no lo pide el modelo, lo pide quien
está delante.

### La dependencia que sí se añadió

`marked`, para Markdown → HTML. Es de cero dependencias propias y se carga PEREZOSAMENTE:
exportar es raro y no tiene por qué pesar en el arranque de cada turno. La alternativa era que
el CLIENTE mandara el HTML ya renderizado —lo pinta con el mismo componente que se ve en
pantalla— pero eso ata exportar a tener el fichero abierto en el navegador.

### Lo que queda fuera

**DOCX.** Un `.docx` no se imprime, se construye, y para eso hace falta una librería de verdad
—`pandoc` o `python-docx`—, no un navegador. Se declara pendiente en vez de fingirlo: el PDF es
lo que la petición pedía primero, y es lo que se puede dar sin instalar nada.

## El motor de JavaScript de Android, medido ejecutando (19-09-2026)

`REGLAS_XONE` (`core/agentes.ts`) decía «el motor JS en Android es Rhino (ES5)». Era lo que se
sabía, y era impreciso **en las dos direcciones**. Ahora está medido, y no deducido de la
versión: **ejecutando en el aparato**.

### Cómo se midió

El emulador tenía la app instalada (`com.xone.android.framework`, `versionName 5.0.2.2dev`).
Dos fuentes, y la segunda es la que manda:

1. **El APK.** `adb pull` del `base.apk` (41 MB, 22 dex, 329 clases `org/mozilla/javascript/`).
   **Ojo: está shrinkado con R8, así que una AUSENCIA no prueba nada** — `NativeDate` está y
   `NativeMap` no. Las clases del PARSER sí valen, porque el parser las alcanza siempre:
   `SlotMapContainer`, `EmbeddedSlotMap` y `HashSlotMap` presentes (el refactor de slots es de
   **1.7.12**); `ast/TemplateLiteral`, `ast/ClassNode`, `LambdaConstructor` (**1.7.14**) y
   `NativeConsole` (**1.7.15**) ausentes. Consistente con **Rhino 1.7.12–1.7.13**.
2. **Ejecutando JavaScript en el motor**, por el canal hotswap. El comando es **`runScript`** y
   sus dos parámetros —los dos obligatorios, y el error los va nombrando uno a uno— son
   **`scriptText`, el código en BASE64** (en claro llega como basura: «illegal character») y
   **`scriptLanguage`**. El cuerpo se evalúa como función (`In node:
   AnonymousHotswapFunction`), así que `return` vale. Y el error **distingue** un fallo de
   parseo (`Cause: syntax error`, `illegal character`, `missing …`) de uno de ejecución
   (`ReferenceError`, `TypeError`), que es lo que permite clasificar. **`Packages` no está
   definido**: LiveConnect está cerrado, así que no se puede pedir
   `Context.getImplementationVersion()` y la matriz es la evidencia primaria, no la etiqueta.

### La matriz

**Acepta**: arrow functions (con y sin paréntesis, cuerpo de bloque), `let`, `const`,
destructuring de array y de objeto, `for...of`, método abreviado en literal (`{ m(){} }`),
getter/setter en literal, `Symbol`.

**Rechaza, y siempre al PARSEAR** —o sea que el script entero queda mudo: ni error, ni traza—:
template literals, `class`, spread, rest, parámetros por defecto, `function*`, `async`/`await`,
`**`, coma final en parámetros, propiedad abreviada (`{ a }`), clave computada (`{ [k]: v }`),
`?.`, `??` y `1n`. **También los valores por defecto y el rest dentro de un destructuring**
(`var {a=1} = o`, `var [a,...r] = arr`), medidos aparte.

**Existen pero valen `undefined`** —fallo mudo en EJECUCIÓN, no de sintaxis—: `Map`, `Set`,
`WeakMap` y `Array.prototype.includes`. Sí están `Object.assign/keys`,
`Array.isArray/find/forEach`, `String.includes/startsWith/trim`, `Number.isNaN` y `JSON`.
**`Promise` sí está** — y `NativePromise` NO está en el dex, así que lo pone XOne, no Rhino.

### Qué cambia en el prompt, y por qué la lista va ENTERA

Va la matriz completa aunque alargue unas líneas que el propio comentario de `REGLAS_XONE`
quiere cortas. **Una lista incompleta es peor que ninguna**: el modelo se fía de ella, y lo
omitido no falla ruidosamente sino en silencio y **para la app entera al arrancar** —un error
de sintaxis en un fichero incluido revienta `LoadAppActivity`, no la función donde está—.

Y la mitad de «SÍ acepta» no es relleno: sin ella, un modelo al que se le dice «ES5» evita
`let` y las arrow functions, que funcionan, y **«arregla» código bueno**. Ese fallo ya ocurrió
una vez (la `var` declarada dos veces que el agente introdujo arreglando otra cosa), y por eso
la prudencia del 18-09 de no prohibir `let` estaba bien puesta: la medida del 19 la confirma.

**Tiene test** (`agentes.test.ts`), y es de los que hacen falta: este es el único sitio de
xonecode donde vive la medida, y «acortar» la lista no pondría nada rojo — el prompt seguiría
siendo un prompt válido.

### Lo que se hizo en `xone-linter` con esta misma medida

La regla de sintaxis del linter usaba `new Function`, que falla por DOS motivos: es V8 al nivel
del Node que corra (el más permisivo de los tres motores), y **falla también dentro de ES5** —en
modo laxo, asignar a un destino no simple es un `ReferenceError` de ejecución, no un error
temprano, así que `if (len(x)=0)` lo pasa y Rhino lo rechaza al compilar—. Se cambió por `acorn`
a `ecmaVersion: 2015` más la deny-list de arriba, con dos códigos (`JS_SYNTAX` y
`JS_UNSUPPORTED_SYNTAX`). Y `JsSyntaxRule` miraba solo `coll.events`: medido sobre un proyecto
real, 119 scripts en eventos contra **162 en nodos**, y los cuatro errores de sintaxis que tiene
el proyecto están **los cuatro en nodos**. Empujado a `sleiva/xone-linter` hasta `d5f42b4`; no
alcanza a xonecode hasta que se publique, porque el verificador usa el binario GLOBAL del PATH.


## El modo de escritura vive en la sesión (21-09-2026)

### La petición, y el ajuste que ya existía

«Modo autónomo y modo supervisado; las tareas en background ya ejecutan en autónomo, pero
debemos tener un selector en la caja de chat.» Aclarado después: «no quiero que me esté
pidiendo permiso cada vez que escriba un fichero».

El interruptor **ya existía** —`seAplicaSinAprobacion`, comando `/aprobacion
[humana|automatica]`, entrada de arriba— y no servía para esto por una condición: un
proyecto conectado a CloudStudio no podía ponerse en automático. MyAllXOne, que es donde se
trabaja, lo está. O sea que el switch habría salido apagado y sin poder encenderse justo
donde se iba a buscar.

### Lo que tumbó esa condición: una incoherencia medida, no una preferencia

El argumento de la condición era «lo que se escriba aquí sube al trabajo de otras personas».
Se miró, y no se sostiene:

- **Escribir no sube.** `/sync subir` es un acto aparte, con su plan delante y su aprobación
  fail-closed por TIPO (`core/cloudstudio.ts#PoliticaDeAprobacion`). Eso no cambia en ningún
  modo, y el modo nuevo lo dice con palabras en tres sitios: el comando, la pastilla y el
  aviso del chat.
- **Lo automático es el commit por turno**, que es git y se recupera.
- **Y sobre ese MISMO proyecto conectado, una tarea de fondo ya escribía sin preguntar**
  mientras la consola no podía. La barrera no era «un proyecto conectado no se toca sin
  mirar» —eso ya no pasaba—: estaba solo en el camino interactivo, que es el que tiene un
  humano delante con el botón de parar.

### La decisión: en la SESIÓN, no en el disco

Se eligió entre dos sitios y se descartó el de disco, que era el de antes:

- **En la sesión** (lo elegido): un mando dentro de la caja del chat se lee como «esta
  conversación», el estado se anota en el índice y vuelve al reabrirla —el camino exacto del
  esfuerzo de razonamiento—, y una sesión nueva nace supervisada. **No hay defecto global**, y
  esa ausencia es la decisión, igual que con el esfuerzo: un tercer valor «para todas las
  nuevas» decide en nombre de conversaciones que todavía no existen.
- **En el disco** (retirado): se ponía una vez y quedaba puesto para siempre, en todas las
  sesiones y todos los procesos. Una bandera encendida sobre la app de un cliente que nadie
  recuerda haber dejado encendida es el peor final posible.

Con el ajuste de disco se fueron `settings.sinAprobacion`, `AprobacionPorProyecto`,
`guardarSinAprobacion`, `validarSinAprobacion`, `seAplicaSinAprobacion` y `remapearSinAprobacion`
—con su mitad de la mudanza de workspace—. **Dos sitios donde se decide lo mismo es como
estas reglas se rompen**, así que no coexisten: no hay «defecto de disco» que siembre la
sesión.

### Lo único que sobrevivió de las seis condiciones

**Hay alguien delante**, calculado como `interactivo && !eof()`, la misma cuenta que
`pedirDecisiones`. No es celo: `consolaWeb` declara `interactivo: true` a fuego, así que sin
el `eof` una pestaña cerrada a mitad de turno seguiría auto-aprobando. Con ella, la escritura
vuelve al camino de aprobación, donde el eof la rechaza — y `xonecode run` en CI y las
tuberías siguen sin aplicar nada, que es lo que el código de salida 2 del contrato significa.

Y se pregunta en cada RONDA, nunca se captura al abrir: eso obligó a que `crearEjecutorReal`
guarde el `estado` VIVO (`estadoVivo`), porque `abrirSesionReal` se llama en el primer turno y
sus cierres se quedaban con el `estado` de ESE turno. Mientras de ahí solo se leía la raíz daba
igual; con el modo dentro, el comando habría sido cosmético.

### El agujero que se encontró de paso: el modo tiene que alcanzar a los motores externos

`politicaExternaDeSesion` se construía solo desde `pedirAprobacion` y **nunca consultaba el
ajuste**. O sea que con «automática» puesta, el grafo escribía solo y `claude-code`, `codex` y
`opencode` seguían parando en cada fichero. Eso ya estaba roto antes de este cambio.

Ahora el MISMO predicado gobierna las dos mitades, y el cortocircuito vive en
`politicaDeAprobacionExterna` —el único sitio por el que pasan los tres motores—, **después**
de la guarda de la lista vacía (el modo quita la pregunta, no convierte la nada en un sí) y
**después** de las guardas de RUTA, que `decisionDeEscrituraExterna` ya corre antes de
consultar la política. El modo quita la pregunta, nunca la barrera.

Las rutas que se conceden así entran en la MISMA lista que alimenta el aviso de honestidad del
turno: si no, el aviso contaría de menos justo las escrituras que nadie vio pasar. Eso obligó a
un puntero de la SESIÓN a una lista del TURNO (`apuntarAplicadasSinPreguntar`), porque la
política se compone con el agente y el aviso es de cada turno.

**Y está probado desde fuera**, con un espía sobre `opcionesDeSubagenteExterno`: el cableado
vive en el cierre de `abrirSesionReal`, que es exactamente el patrón de fallo que este repo
lleva nueve veces —una regla de producción compuesta dentro de algo que todos los tests
doblan—. El test muere con el mutante: quitar el campo `modo` lo pone en rojo.

### El tope de rondas, que era el otro corte

`MAX_APPROVAL_ROUNDS` son cinco y se dimensionaron para un modelo que insiste tras cada
rechazo. En autónomo una ronda no es una insistencia, es una TANDA de escrituras, y eso ya
estaba medido: las tareas de fondo tienen su propio `TOPE_DE_RONDAS_DE_TAREA = 20` porque un
turno acabó con cuatro ficheros escritos, una escritura abandonada y el verificador sin correr.

La consola interactiva pasa a `TOPE_DE_RONDAS_DE_CONSOLA`, **el mismo 20 y por la misma
medida** —no hay una segunda observación detrás—. Vive en su propia constante aunque hoy
valgan lo mismo: son dos situaciones y no una, y fundirlas ataría dos números que se van a
afinar por separado. **Sin nadie delante se queda el cinco**: ahí nadie aprueba nada, cada
ronda es una llamada al modelo que acabará en el mismo rechazo, y el tope bajo sí frena un
bucle que nadie puede parar.

Se consideró ponerlo tan alto que no pudiera cortar (10 000), con el argumento de que el freno
real es la persona —un rechazo, o el botón de parar—. Se descartó: 20 corta con un motivo
VERDADERO (`cortadoPorTope`, quedan escrituras sin aplicar, `core/entrega.ts` no entrega), y un
número provisional con un fallo honesto se afina luego.

### La forma en la pantalla

- **Una pastilla en la fila del compositor**, junto al modelo, el esfuerzo y el dispositivo:
  las cuatro son la misma clase de cosa —una elección DE LA SESIÓN que decide el servidor y el
  cliente pinta—, comparten hoja de estilos y se miran juntas justo antes de escribir.
- **Es un MENÚ y no un interruptor**, aunque sean dos valores: encenderlo cambia lo que va a
  pasar con los ficheros, y un interruptor no tiene dónde decir qué se concede y qué NO. La
  frase del menú es la mitad del control.
- **Ausente no es «supervisado», es «no hay sesión»**, y entonces no se pinta: un control sin
  dato detrás no se pinta. El servidor resuelve la omisión antes de emitir, así que una sesión
  abierta siempre trae el suyo.
- **La etiqueta lleva tilde («autónomo») y el valor no (`autonomo`)**: meter la tilde en el
  dato habría sido un segundo vocabulario para lo mismo.
- **El aviso del chat manda a la pastilla, no al comando.** En el navegador «/» es prosa, así
  que decirle a alguien que teclee `/aprobacion` es mandarlo a un camino que allí no existe.
- **Y el ECO de `/aprobacion` se recorta donde la pantalla ya lo cuenta**
  (`Consola.modoALaVista`). Al encender el modo, el comando explicaba tres cosas —que se
  avisará con los nombres, que es de esta conversación, que subir sigue preguntando—: en el
  navegador eso eran cuatro renglones en el transcript diciendo lo que la nota permanente se
  lee dos centímetros más arriba, y la pastilla enseña al lado. Se recorta a una línea ahí y
  se deja entero en el terminal, donde no hay ni pastilla ni nota y esos tres detalles son lo
  único que los cuenta. **Lo decide el DESTINO y no la línea**, el molde de
  `Piel.anotarSincronizacion?`: la misma orden tecleada en el terminal DEBE explicarse
  entera, y eso no lo puede decidir quien compone el texto. Lo que no se recorta es el HECHO
  («se aplicarán SIN preguntar»): una acción sin acuse se lee como que no pasó nada.
- **El cable lleva la INTENCIÓN** (`{clase:"modoDeEscritura", modo}`) y el servidor la aplica
  encolando `/aprobacion`, el mismo manejador del terminal. Un segundo camino para lo mismo es
  donde el hueco de política podría reabrirse. Se llama `modoDeEscritura` y no `modo` porque en
  el alta `modo` ya significa offline/cloud.
- **`/aprobacion` sigue entendiendo `humana` y `automatica`** además de las palabras nuevas: un
  comando que deja de entender lo suyo es una regresión aunque el concepto sea el mismo.

### Lo que NO cambia, y se dice tres veces porque es lo que más caro sale confundir

El modo gobierna las **escrituras locales**. No toca la subida —`/sync subir` conserva su plan
y su aprobación en los dos modos— ni las guardas de RUTA: `/.env`, `/.git`, `/.xonecode`, las
vistas aplanadas y un artefacto fuera de sitio se siguen denegando igual en autónomo.

Y **las tareas de fondo no usan nada de esto**, a propósito: allí la autorización es el ACTO DE
CREAR LA TAREA —el encargo se aumenta y se enseña editable antes de encolar, y ese paso ocupa
el sitio del diff—, mientras que el modo de una sesión significa «el humano que está aquí ha
decidido no pulsar» y de hecho exige que lo haya.


## La caja del chat en tres bandas (22-09-2026)

Maqueta de Stitch (`stitch_chat_layout_controls_redesign`), de la que se toma la FORMA y
nunca el color — la regla de siempre, y la que vigila `Barra.test.tsx` recorriendo los
`.module.css`. Su captura solo había pintado la cabecera; la caja entera estaba en el
`code.html` de al lado, y de ahí salen también los iconos.

### El reparto, y por qué esta vez arriba sí

Tres bandas dentro de la misma tarjeta: **con qué va a correr** (modelo, esfuerzo,
dispositivo), **qué se escribe** (el campo) y **qué pasa con ello y mandarlo** (modo, gasto,
botón). El filete de arriba separa dos preguntas distintas en vez de decorar, y por eso el
relleno bajó de la tarjeta a cada banda: un filete que no llega a los dos bordes se lee como
un subrayado del contenido.

**Es una decisión revisitada, y el argumento de la vuelta atrás anterior sigue siendo
bueno.** El dispositivo estuvo arriba siguiendo una maqueta y volvió abajo mirando la
pantalla: «un chip solo no era una fila, era un renglón». Lo que cambió no es el criterio,
es el reparto — ahora suben TRES controles y abajo quedan otros tres, así que ninguna de las
dos bandas es un renglón huérfano. Comprobado en el navegador a 1728 y a 900: las tres
bandas en una línea cada una, el botón dentro de la tarjeta y sin scroll horizontal.

### El conjunto modelo + esfuerzo

La mejor idea de la maqueta, porque le da forma a una frase que el código ya decía y la
pantalla no sostenía: «el esfuerzo no es una elección independiente, es un ajuste DE ese
modelo — qué niveles hay depende de cuál esté puesto». Estaban pegados y se leían como dos
elecciones hermanas.

Ahora la CAJA es el conjunto —su filo, su baño— y las pastillas de dentro pierden los suyos,
con un filete entre las dos. Primero se hizo al revés (cada pastilla con su borde y una raya
en medio) y en el navegador se veían dos controles vecinos con una línea perdida. El
separador es un borde del SEGUNDO hijo y no un elemento: cuando el modelo no admite esfuerzo
y su pastilla no se pinta, no queda un filete colgando junto a nada.

Y el rótulo `pensar:` delante del nivel, también de la maqueta: la decisión de no traducir
los niveles («son el vocabulario del proveedor») dejaba la pastilla con una palabra suelta
—`high`— que junto al nombre del modelo no dice de qué habla.

**Una trampa que costó una vuelta**: la clase del conjunto se llamó `grupo` y en esa misma
hoja ya había un `.grupo` —el de las filas de un menú, en columna—. **Dos clases con el
mismo nombre en un módulo CSS no chocan: la segunda PISA a la primera, en silencio.** El
conjunto salía en columna y nada lo decía; se vio midiendo en el navegador.

### El modo, de menú a conmutador

Se construyó como pastilla con menú hace unas horas y pasa a control segmentado. La
diferencia no es de gusto: **con dos valores y ninguno oculto, el estado se lee sin abrir
nada**, y aquí el estado es «¿lo próximo que escriba se va a aplicar solo?» — la pregunta
que más caro sale contestar mal.

Lo que el menú tenía y un conmutador no: sitio donde explicar. La maqueta lo resuelve con un
tooltip de hover, que **no alcanzan ni el teclado ni el táctil**, y esto es la palanca que
decide si los ficheros se escriben sin diff. Se pone en el `title` de cada mitad, que lee el
hover Y el lector de pantalla, y lo que el modo NO concede lo sigue contando la nota
permanente del chat en cuanto está encendido.

Tres reglas más: **`aria-pressed` va en las DOS mitades** —«false» en la apagada es lo que
las convierte en un conmutador; sin él son dos botones idénticos de los que no se sabe cuál
rige, y el color no le llega a quien escucha la página—; **pulsar la que ya está puesta no
manda nada**, que sería un mensaje por el cable y una línea en el transcript para dejarlo
todo igual; y **los rótulos no se retiran en estrecho**, porque son media razón de ser del
control y la fila ya tiene su red con el `flex-wrap` de `.controles`. Una consulta de
contenedor aquí además tendría que declarar su propio contenedor en la misma hoja, y el
ancho que importa es el del renglón, que es de otro módulo.

Hoja propia y no la de `PastillaDeModelo`, que comparten las otras tres: aquélla es la de
una pastilla con menú y esto ya no lo es. Compartirla habría atado las dos formas.

### Los colores, y los dos que hubo que cambiar mirando la pantalla

De la maqueta no entra ni uno: su `#0b233a`, su `#e8f1fd` y sus `blue-600` se quedan fuera y
van los tokens de marca y los alias por tema. Dos elecciones se corrigieron en el navegador:

- **El carril del conmutador** empezó en `bg-layer-2` y en tema claro es casi blanco, así que
  sobre la tarjeta desaparecía y el conmutador se leía como dos botones sueltos. Va
  `--xonecode-fila-hover`, el baño de cian de las filas de la barra, que ya viene ajustado
  por tema (7 % en claro, 13 % en oscuro) — reusarlo evita inventar un cian translúcido que
  en noche quedaría invisible o gritón.
- **La mitad puesta NO lleva el azul de la marca de fondo** aunque la maqueta lo pinte así:
  ese azul es el del botón de enviar, la acción primaria de la caja, y un conmutador con el
  mismo peso competiría con él. Lleva el fondo de la tarjeta y filo de cian, que es el par
  que ya distingue una pastilla.

Y `transparent` cuenta como color literal: donde hacía falta un borde invisible se pinta del
color del fondo que tiene detrás, que además mantiene el tamaño de la caja.

### Los iconos

Copiados del `code.html` a `IconosDelCompositor.tsx`, porque aquí no se trae nada de un CDN.
Pintan con `currentColor` —el color lo pone el botón que los lleva— y van `aria-hidden`: al
lado siempre hay texto que dice lo mismo, y un icono que lo repite en voz alta es ruido.

**El rayo del selector de modelo no se copió.** En la maqueta el mismo glifo está en la
pastilla del modelo y en la mitad «Autónomo», que son dos cosas que no tienen nada que ver;
reusarlo enseñaría a no mirarlo. Se queda donde significa algo —«va solo»— y el modelo se
identifica por su nombre, que es lo más largo de la fila.

Y el `↑` del botón de enviar pasa a ser el glifo de la maqueta: el carácter dependía de la
fuente del sistema y se pintaba con un peso distinto en cada una.

### Los retoques de después, mirando la pantalla (22-09-2026)

Cuatro peticiones suyas seguidas, cada una con lo que costó:

**El logo del PROVEEDOR en la pastilla del modelo.** No el rayo de la maqueta, por lo dicho
arriba. El proveedor sale del id (`proveedor/modelo`), ya lo pintan las filas de ese mismo
menú con `IconoDeProveedor`, y es lo que se reconoce de un vistazo cuando el nombre del
modelo es largo. Sin modelo en vigor no hay logo: «Elige modelo» no tiene proveedor detrás, y
el genérico diría que lo hay y que no lo conocemos. **Límite**: `deepseek` no está en el juego
copiado, así que ahí sale el genérico de enlace — el mismo comportamiento que ya tenía el menú.

**El filo con el azul de la marca, y una sombra corta.** Primero se declaró como token en
`marca.css`: `--xonecode-borde-caja: color-mix(… var(--dsw-alias-border-l2))`. **En ese
`:root` el alias del tema no está definido, la mezcla queda inválida en tiempo de cómputo y
el atajo `border` ENTERO se descarta** — medido en el navegador: `borderWidth: 0px`, con el
suite en verde y la regla escrita. Un `color-mix` que arrastre un alias del tema tiene que ir
en la hoja del componente, sobre el elemento donde ese alias resuelve, que es lo que ya hacía
`.pastilla`. La sombra sí se queda como token, porque lleva `transparent`.

Y en NOCHE el filo se aclara con `--xonecode-sobre-azul` en una rama
`:global([data-ds-dark-theme])`: los tokens de marca no se redefinen por tema y
`--xonecode-azul` es un navy — sobre el fondo oscuro, un filo de ese tono es un filo que no
está. Se aclara con el blanco de la marca y no se salta al cian, que es otro color y aquí
diría otra cosa.

**El dispositivo al otro extremo de la banda**, con envoltorio propio y no con
`.motor > :last-child`: sin manejador de dispositivo esa pastilla no se pinta y el último
hijo sería el conjunto modelo+esfuerzo, al que el `margin-left: auto` mandaría a la derecha —
justo lo contrario.

**Y la caja PLEGADA en reposo, que es lo que lo justifica todo.** Con el campo a 88 px y las
tres bandas, la tarjeta medía 216 y el transcript es lo único elástico de la columna: esos
216 px son conversación que no se ve. En reposo quedan 110 — campo bajo y sin banda de motor—
y al enfocar vuelve a 199.

Tres reglas de ese plegado:

- **Se pliega DESMONTANDO** (`display: none`), no con `visibility`: un elemento invisible
  sigue siendo tabulable, y en reposo lo que se quiere es que no esté en el recorrido.
- **Lo decide `:focus-within` en CSS y no un `onBlur` en React**, y no es una preferencia:
  con estado de React, al tabular desde el campo el navegador desmontaría la pastilla ANTES
  de que el foco llegase a ella y se quedaría en el `<body>`. Comprobado con teclado en el
  navegador: Shift+Tab desde el campo aterriza en la pastilla del dispositivo.
- **La banda de ABAJO no se pliega.** El modo dice si lo próximo que mandes se va a aplicar
  solo, y ese estado tiene que leerse sin hacer nada — es la razón entera de que sea un
  conmutador y no un menú. Plegarlo sería volver al menú, pero peor: sin menú que abrir.

Un borrador a medias mantiene la caja abierta (`data-con-texto`): volver de mirar un fichero
y encontrarse el modelo escondido con el texto a medio escribir sería esconder con qué se va
a mandar.

**Lo que se dejó para después: minimizar mientras se scrollea la conversación.** Con el
plegado puesto ya está casi cubierto —leer con la caja sin foco la deja minimizada—, y el
único caso que queda es «campo enfocado y subo a leer». Ahí el arreglo tiene precio: colapsar
con el foco dentro puede tirarlo al `<body>` si estaba en una pastilla, y atar la altura al
scroll es la receta del salto que se pelea con el propio scroll, más aún con el transcript
pegado al fondo. Queda declarado y sin hacer.

**Y una nota de proceso**: se lanzó `prettier` sobre `Compositor.tsx` para arreglar una
sangría. **No es una herramienta de este repo** —no hay config ni dependencia— y reformateó
el fichero entero a 80 columnas. Se recuperó leyendo el blob del almacén de objetos de git
con python y zlib, porque `git` estaba bloqueado a la vez por la licencia de Xcode.

## `/hotswap/`: lo que una shell saca del contexto no es un artefacto

**Lo que se vio.** Una conversación de `device-controller` sobre MyAllXOne llegó a 18.566 px
de transcript para cuatro turnos, y la queja fue que se leía sucia. Medido en el DOM, el 11 %
del alto eran **16 tarjetas de artefacto de 113 px**, y solo 23 de esos 113 px son el dato: el
resto son la ruta del disco con el uuid de la sesión partido en dos líneas y una nota de una
línea —«No es un fichero del proyecto: vive con esta sesión…»— **idéntica en las dieciséis**.
La secuencia real de la zona era `A P1 A P2 A P1 A P1`: cada artefacto parte el colapsador y
deja detrás un tramo de «Trabajo del agente · 1 paso». En una pantalla de 1.353 px cabían seis
tarjetas, ocho tramos y **un solo párrafo** del asistente.

**Quién escribía eso.** No el agente: el script `xone-hotswap` de la skill de serie. Su regla
es `LARGO_PARA_GUARDAR = 2_000` — cualquier campo de texto de la respuesta del aparato que
pase de dos mil caracteres se saca de la salida del comando y se escribe a fichero. El motivo
está bien y lo dice su propio comentario: el árbol de `getAllElements` de una pantalla llena
son varios miles de caracteres, y volcarlo en la salida es meterlo en el contexto para
siempre. Lo que estaba mal era el destino: `$XONECODE_ARTEFACTOS`, que es la carpeta que **se
anuncia**.

**Quién los lee después, medido sobre el `.jsonl` de esa sesión.** De los 10
`respuesta-status-*.json` anunciados, **6 no se vuelven a abrir jamás**. De los 13 usos de los
otros cuatro, 9 son por shell y 4 por `read_file`, y cuando se abren se recortan
(`print(json.dumps(d)[:1500])` sobre un fichero de 8 KB: el 18 %). No hay ningún otro lector
—ni el juez del turno, ni el verificador, ni la persona—. El contraste estaba al lado y decide
el reparto: **las capturas sí tienen un segundo lector**, `capturasDelTurno` se lleva la última
al crítico de pantalla, que es lo que produce el aviso «la captura de esta sesión enseña N
defectos». Por eso las imágenes se quedan en artefactos y el texto se muda.

**El segundo defecto, que es el que explica el 9-contra-4.** El script devolvía un nombre
pelado (`<guardado como respuesta-status-….json, 8123 bytes>`) y lo único que el entorno le
daba al agente era `XONECODE_ARTEFACTOS`, que es la carpeta del DISCO. Nadie le decía que la
ruta para leerlo era `/artefactos/<nombre>`. En la traza se le ve intentando el mismo fichero
por tres rutas —la absoluta de la máquina y `/.xonecode/sesiones/…`, denegada— antes de
rendirse y abrirlo con `python3`. De paso, esa ruta absoluta viajó por el cable dentro de la
línea de la tool, que es justo lo que `sinRutas` existe para impedir, y no por la excepción
declarada de la shell.

**Lo que se hizo.** La misma pieza que ya existía para `/large_tool_results/`: otra raíz del
`CompositeBackend` (`/hotswap/`), colgada de `.xonecode/sesiones/<id>/hotswap/`, **sin
anuncio**. El script reparte por tipo —imagen a artefactos, texto a hotswap— y **nombra la
ruta virtual en su salida**, que es la otra mitad del arreglo. Cuatro detalles que no son de
forma:

- **La carpeta es HERMANA de `artefactos/`, no una subcarpeta suya.** Desde que la foto de
  `anunciarArtefactosDeLaShell` es recursiva, cualquier cosa que cuelgue de `artefactos/` se
  anuncia: un `artefactos/hotswap/` habría devuelto el problema entero. Hay test que lo fija.
- **Se deriva de la carpeta de artefactos**, igual que `carpetaDeDescargas`, porque ahí vive
  ya la única decisión que hace falta —¿hay sesión con identidad?—. Un segundo parámetro sería
  un segundo sitio donde contestarla, y es justo el que se cae en un cableado largo.
- **No necesita fila en `permisosDe`**: los `deny` de ahí son de `write`, así que leer ya está
  permitido, y escribir cae bajo el `deny` general — que es lo correcto, porque quien escribe
  ahí es una shell y una shell no pasa por los permisos.
- **Sin `XONECODE_HOTSWAP` se cae a la de artefactos**, que es lo que había: un harness viejo
  o el terminal siguen guardando, con el ruido de antes pero sin perder el volcado.

**El precio, declarado: el nombre ata el harness a UNA skill.** Lo honesto sería un nombre que
dijera la función y no el protocolo (`/volcados/`), porque mañana otra skill querrá lo mismo.
Se deja `hotswap` porque hoy hay exactamente un escritor, y un nombre genérico con un solo
usuario es una abstracción que nadie ha medido. El día que haya un segundo, el sitio de la
decisión es `core/hotswap.ts`.

**Y lo que esto NO arregla**, porque eran defectos distintos de la misma pantalla: la forma de
la tarjeta de artefacto (la ruta y la nota repetida), el colapsador que se parte en cada
artefacto, el espaciado plano de 16–18 px entre todo, y la cola de actos `sistema` con dos
avisos de modo de escritura que se contradicen porque son de dos momentos del mismo turno.


## El hilo se leía sucio: el artefacto partía el tramo, y la tarjeta repetía una regla

Continuación de la limpieza que empezó con `/hotswap/`, sobre la misma conversación medida.

**Lo que se midió, antes.** 104 elementos y 16.121 px de columna para cuatro turnos. Las 16
tarjetas de artefacto pesaban 1.808 px (11 %) a **113 px cada una**, de los que 23 son el
dato: 36 px eran la ruta con el uuid de la sesión partido en dos líneas y 18 px una frase
—«No es un fichero del proyecto: vive con esta sesión, no entra en git y no sube a
CloudStudio»— **idéntica en las dieciséis**. Y había **43 tramos «Trabajo del agente» para 31
mensajes**, con esta secuencia en la zona de capturas: `P5 A P5 A P8 A P1 A P2`.

**La causa del acordeón.** `ES_PULSO` no incluía `artefacto`, así que caía en la rama de
conversación, y esa rama CIERRA el tramo abierto. Pero un artefacto no es conversación: es lo
que PRODUJO el trabajo que está dentro del tramo. Es el mismo fallo que el `continue` de
`sincronizacion` ya evitaba por el otro lado —su comentario lo dice con estas palabras:
«partiría en dos el trabajo del agente por una operación de git que no tiene nada que ver con
él»—, con la diferencia de que un artefacto sí se pinta.

**Lo que NO se hizo, y por qué.** La versión de una línea era pintar la tarjeta sin cerrar el
tramo. No vale: el tramo se empuja a `piezas` cuando se ABRE, así que las tarjetas habrían
salido detrás de un tramo que sigue creciendo con pasos posteriores — o sea «en un montón
después del trabajo», que es exactamente la decisión que `turnoReal.ts` tomó al sacarlas del
montón del final. Habría sido revertirla desde el cliente y en silencio.

**Lo que se hizo.** `artefacto` entra en `ES_PULSO` y el tramo emite dos cosas: el `<details>`
con los pasos, y las tarjetas DESPUÉS y fuera de él. Pertenecen al tramo —por eso no lo
parten— pero no se pliegan con él, porque una captura escondida bajo un desplegable es una
captura que nadie mira. **Y no cuentan como pasos**: la cabecera decía 21 y con ellas dentro
habría dicho 26, y esa cifra es lo único que la línea plegada afirma.

**Una IMAGEN se enseña, no se nombra.** Salían como un renglón con su nombre
—`captura-1790061246909.jpg`—, un timestamp que no dice nada de lo que hay dentro, y en un
turno de aparato son seis o siete iguales. Ahora van en una fila de miniaturas sin texto, con
el mismo clic que lleva a la pestaña Artefactos. Tres detalles: se pinta con un `<img src>` a
la ruta HTTP y nunca marcado inyectado —un `.svg` puede traer un `<script>`, y en un `<img>`
no se ejecuta—; lleva `alt`, porque quitar el renglón no es quitar la identidad y el control
necesita nombre; y la altura es fija con ancho automático, porque recortando al centro se
pierde la barra superior, que es lo que dice en qué pantalla está. Lo que no es imagen
conserva su tarjeta: de un `.json` no hay nada que previsualizar.

**La regla deja de repetirse.** La frase de la tarjeta no era un hecho de ese fichero: es la
misma para todos, y repetida dieciséis veces enseña a no leerla — el patrón del aviso que
salta cuando no ha pasado nada. **Donde se conserva es al pie de la pestaña Artefactos**, una
sola vez, que es donde ya vivía y donde se decide sobre ellos. El `title` de la tarjeta la
repite, pero eso no cuenta como conservarla: un `title` es solo hover, y no lo alcanzan ni el
teclado ni el táctil — la misma lección que `SelectorDeModo.tsx`. La RUTA no se pierde: sigue siendo lo que copia
el botón, que es para lo que se usaba — leerla no le hace falta a nadie, pegarla en un
terminal sí.

**Un efecto que el propio arreglo destapó.** Con las tarjetas ya de una línea y seguidas, se
veían como bloques sueltos: 47 px de tarjeta y **63 de salto**, porque
`ChatView.module.css` separa a los hijos de `.column` con los 16 px que van entre dos
MENSAJES. Se agrupan en un contenedor con `gap: 6px` en vez de pelear la especificidad de esa
hoja, que es de la librería y no se toca; el contenedor es quien recibe el hueco de la
columna, así que el grupo sigue despegado del tramo.

**Medido después, misma conversación**: 104 → 89 elementos, 16.121 → 15.404 px, la tarjeta de
113 → 47 px, y 43 → 29 tramos. La secuencia pasó de `P5 A P5 A P8 A P1 A P2` a `P29 A A A A A`.

**Lo que sigue sin tocar**: el espaciado plano del transcript (16–18 px entre todo, con dos
párrafos del mismo mensaje separados igual que dos turnos) y la cola de actos `sistema` con
dos avisos de modo de escritura que se contradicen. El segundo no es un arreglo de pintado:
son dos eventos ciertos cada uno en su momento, y fundirlos en el cliente escondería
historia — el sitio es la cola de `/aprobacion`, cuando dos se drenan al final del turno.


## El aire del hilo: dónde estaba de verdad

Tercera pasada de la limpieza, sobre la misma conversación. La hipótesis de partida era «el
espaciado es plano, 16–18 px entre todo». Cierto, pero medir el desglose la corrigió.

**De 16.844 px:** texto y bloques de los mensajes 11.419 (68 %), **hueco entre actos 1.312
(8 %)**, margen del primer y último párrafo 878 (5 %), la fila del botón de copiar 837 (5 %),
relleno de los globos 620 (4 %). O sea que apretar el hueco —que era la reforma «obvia»—
movía el 8 % y dejaba el mensaje igual de suelto. Un mensaje de UNA LÍNEA medía 92 px de los
que 21 son el texto.

**El mecanismo del hueco es una variable que ya existe.** `ChatView.module.css` —copiada de la
librería, no se toca— separa a los hijos de `.column` con
`margin-top: var(--dsh-chat-flow-gap, 16px)`, y **ese margen lo lleva el HIJO**: la variable
se resuelve en cada acto. Comprobado en el navegador antes de escribir nada, poniéndosela a
un acto suelto. Así la jerarquía se declara por acto, sin pelear la especificidad de esa hoja
—que es (0,7,0) y gana a cualquier cosa razonable— y sin inventar un token nuevo. Es la misma
forma que reusar `--xonecode-fila-hover` en vez de fabricar un cian translúcido.

**Dos valores y no tres**: 10 px dentro de un turno y 30 al empezar otro. Tres sería una
gradación que nadie lee de un vistazo. El grande lo lleva el acto del USUARIO, que es lo único
que abre un turno (`usuario` solo lo emite el compositor).

**Y ningún margen accidental, que es la mitad del valor de esto.** El globo del usuario es un
`<p>` y traía 14 px de margen inferior de la hoja base —el de arriba sí lo ganaba la regla de
la columna, el de abajo no lo tocaba nadie—, así que el hueco entre la pregunta y la respuesta
salía 24 px cuando la hoja declaraba 10: un número que no decidía nadie. Anulado, todos los
huecos medidos coinciden con los declarados (10–12 y 30–32), que es lo que hace que estos
valores se puedan leer en la hoja y sean ciertos.

**El aire de dentro del mensaje.** Un `<p>` lleva `margin: 14px 0`, que está bien ENTRE
párrafos y sobra contra el relleno del globo: 878 px en 31 mensajes, y 28 de los 92 px de uno
de una línea. Se anula solo en el primer y el último bloque, y por hijo DIRECTO para no
alcanzar el primer párrafo de una cita o de un `li`, que sí lo quieren.

**Medido en el navegador**, misma conversación, `scrollHeight` contra `scrollHeight`:
18.566 → 16.938 (tramo y tarjeta) → 16.844 (miniaturas) → **15.644**. Un mensaje de una línea,
92 → 68 px.

**Lo que NO se hizo, y es una decisión pendiente, no un olvido: la fila del botón de copiar
(837 px).** Ocupa un renglón propio bajo cada mensaje, siempre. Recuperarlos tiene dos
caminos y los dos cuestan: llevarlo a la esquina del globo estrecha el texto ~32 px en TODOS
los mensajes o lo solapa; enseñarlo solo al pasar por encima no lo alcanzan ni el teclado ni
el táctil, que es la lección ya escrita en `SelectorDeModo.tsx`. Y hay un argumento que no es
de píxeles: hoy el botón está DESPUÉS del mensaje, que es donde estás cuando has terminado de
leer y quieres copiarlo. Se deja como está hasta que alguien decida.

## «Verificaciones» y «Permisos»: la clase de un aviso viaja con él

**Lo que se veía.** Al cerrar un turno salían cuatro renglones grises seguidos —dos de ellos
contradiciéndose: «hecho: las escrituras se aplicarán SIN preguntar» y «hecho: cada escritura
vuelve a pedir aprobación»— y, en otro sitio, tres «developer-xone: quiere escribir un fichero
del proyecto» idénticos. Sin estructura y con el mismo peso visual que una respuesta del
agente.

**El acto `sistema` era un cajón con cuatro orígenes**: `Consola.escribir` (la respuesta a un
comando, un error del vestíbulo), `Consola.preguntar` (el enunciado de una pregunta de texto
libre), `Piel.notificacion` (los avisos de honestidad de `core/bitacora.ts`, el juez del turno,
el crítico de pantalla) y `Piel.pausa` (lo que se autorizó sin preguntar). Plegarlos todos
bajo un mismo título habría mentido sobre la mitad.

**La clase viaja CON el acto, no se deduce del texto.** Es la regla de `DecisionDeConsola`
—«la FORMA de una pregunta viaja con ella»— por el mismo motivo: mirar el enunciado para
decidir cómo se pinta es leer la sintaxis que la propia piel acaba de escribir, y se rompe en
las dos direcciones. `clase?: "aviso" | "permiso"`, opcional, y **ausente es lo de siempre**:
un «hecho: …» es el acuse de un botón que la persona acaba de pulsar, y plegarlo sería no
contestarle. De regalo, las sesiones guardadas antes del campo se pintan exactamente igual
—verificado en el navegador sobre una de ellas: nueve actos sueltos, cero tramos.

**Dos tramos y no uno**, porque «qué se autorizó» y «qué falló» son dos preguntas: los avisos
bajo «Verificaciones», los permisos bajo «Permisos», y dos clases seguidas no se funden.

**Lo que se pliega es el PÁRRAFO, nunca el hecho de que lo hay.** Es lo que salva la regla que
esto matiza: un ⚠ del juez diciendo «esto no cumple lo que pediste» es exactamente la línea
que la bitácora de honestidad existe para hacer visible. El `<summary>` dice de qué son y
cuántos —«Verificaciones · 2 avisos»—, no solo un número, que no diría nada.

**`pausa` pasa a emitir un acto POR pendiente.** Emitía uno con las líneas pegadas por `\n`, y
con el resumen contando actos eso habría dicho «1 escritura» donde hubo tres. Es la misma
forma que `Consola.escribir`, que ya parte por líneas.

**Un fallo que este cambio introdujo y que el test cazó**: el acto llega por el CABLE, de otro
proceso que puede tener otra versión, y el store solo valida el `tipo`. Una clase que el
cliente no conozca dejaba `CLASES_DE_SISTEMA[clase]` en `undefined` y el destructuring del
render LANZABA — o sea que un host más nuevo se llevaba por delante el transcript entero de un
cliente viejo. Se comprueba contra la tabla, no contra `undefined`, y lo desconocido cae al
camino suelto: se ve, sin agrupar.

**Lo que esto NO arregla, y sigue siendo el defecto 4**: los dos «hecho:» contradictorios
siguen ahí, sueltos, porque son dos eventos ciertos cada uno cuando se emitió. Fundirlos en el
cliente escondería historia. El sitio es la cola de `/aprobacion`, cuando dos se drenan al
final del mismo turno.

**Límite declarado de la verificación**: la compatibilidad con sesiones anteriores está vista
en el navegador; el aspecto de los dos plegables NUEVOS está en test, no en pantalla, porque
la conversación medida es anterior al campo y no tiene ninguno. Reusan las clases del tramo
«Trabajo del agente», que sí está verificado ahí.

## Los dos «hecho:» contradictorios: el diagnóstico obvio era el equivocado

**La hipótesis.** Al cerrar un turno salían dos líneas seguidas que se contradicen —«hecho:
las escrituras se aplicarán SIN preguntar» y «hecho: cada escritura vuelve a pedir aprobación
con su diff delante»—. La lectura natural: la pastilla se pulsó dos veces MIENTRAS el turno
corría, las dos `/aprobacion` se quedaron en la cola del lazo y se ejecutaron seguidas al
terminar, con la primera ya caduca al imprimirse.

**Lo que dijo el navegador.** Ese caso **no puede darse hoy**. `SelectorDeModo.tsx` no manda
si pulsas la que ya está puesta, y ese «ya está puesta» sale del estado CONFIRMADO por el
servidor. Reproducido: pulsar «Autónomo» y acto seguido «Supervisado» deja UNA sola línea —la
del primero— y la pastilla en «Autónomo». El segundo clic no llega a encolarse.

Lo que sí reproduce las dos líneas es lo contrario de lo que se suponía: pulsar «Autónomo»,
**esperar a que se aplique**, y luego pulsar «Supervisado». O sea **dos cambios de opinión
reales y separados**, contiguos en el hilo solo porque entre ellos no hubo conversación. Los
dos acuses son ciertos y ninguno sobra: cualquier cosa que los funda está escondiendo un
estado en el que la sesión estuvo de verdad.

**Lo que se hizo igualmente, y por qué se deja.** `LineaDeConsola.sustituye`: una clave que
retira la línea PENDIENTE del mismo control antes de encolar la nueva, con las tres pastillas
de estado usándola (modo, modelo y esfuerzo — los tres tienen el mismo acuse y el mismo
defecto, y una lista que hay que acordarse de ampliar es el patrón de fallo de este repo).
`/sync` no la lleva: dos subidas son dos operaciones, y nada de lo que teclea una persona se
coalesce. La clave viaja como DATO y no se deduce del texto, que es la regla de
`DecisionDeConsola` y de `Acto.clase` por tercera vez en esta pantalla.

**Está declarado en el código que hoy defiende un caso inalcanzable.** No es adorno: es el
lado fail-closed de esa guarda del cliente, y se vuelve necesario en cuanto la guarda se
arregle — porque entonces dos pulsaciones SÍ encolarán dos líneas.

**Y el defecto que apareció al verificar, que es peor que el que se buscaba.** La guarda
compara contra el estado confirmado, que va por detrás del clic: **una segunda pulsación
rápida se pierde en silencio**. Pulsas «Autónomo», cambias de idea y pulsas «Supervisado»
antes de que vuelva el `alta`, y te quedas en «Autónomo» sin que nada lo diga. La forma
limpia del arreglo es que la decisión de MANDAR mire lo último que se PIDIÓ —si hay algo sin
confirmar— mientras lo que se PINTA sigue siendo lo confirmado. Sin hacer: cambia el
comportamiento del control en cada pulsación, y eso se decide, no se cuela. El mismo patrón
existe con toda probabilidad en las pastillas de modelo y de esfuerzo.

**Y lo que queda abierto, que es de forma y no de mecanismo**: qué hacer con dos acuses
contiguos del mismo control. Dejarlos —son ciertos—, que el segundo sustituya al primero
cuando no hay nada entre medias —esconde el titubeo y deja el estado final honesto—, o tratar
el modo como un estado que el transcript enseña una vez en lugar de un registro. Las tres
esconden o enseñan cosas distintas y ninguna es obviamente mejor.

## La guarda del selector de modo: contra lo último PEDIDO, y con una `ref`

**El defecto.** `SelectorDeModo` no manda si pulsas la mitad que ya está puesta, y ese «ya
está puesta» salía de `actual`, que llega del servidor por el `alta`. Entre el clic y la
vuelta la pastilla sigue diciendo lo de antes, así que pulsar lo de antes se leía como
«pulsar la que ya está puesta»: **una segunda pulsación rápida se perdía en silencio**.
Reproducido en el navegador: pulsar «Autónomo» y acto seguido «Supervisado» dejaba la sesión
en autónomo, sin que nada lo dijera. Con un turno en vuelo la vuelta tarda lo que tarde el
turno, que es justo cuando más se cambia de opinión.

**El arreglo: la decisión de MANDAR mira lo último pedido; lo que se PINTA sigue siendo lo
confirmado.** Pintar lo pedido afirmaría que el modo ya rige, y no rige — el `/aprobacion`
está en la cola del lazo—; y ese modo decide si los ficheros se escriben sin enseñar el diff.
El precio, dicho: durante un turno la pastilla no refleja lo que pediste.

**El pedido caduca solo, sin efecto**, porque guarda DESDE qué confirmado se hizo: vale
mientras `actual` no se mueva, y en cuanto el servidor dice algo —lo pedido o cualquier otra
cosa— manda lo confirmado. Un pedido pegado para siempre dejaría el control muerto para ese
valor el día que una petición se perdiera.

**Y la parte que costó dos intentos, con su medida.** La primera versión usaba `useState`, y
en el navegador **seguía fallando**: dos pulsaciones del mismo tick comparten el closure del
render anterior, así que el segundo manejador leía el pedido viejo y volvía a descartar la
pulsación. En los tests salía VERDE, porque `fireEvent` fuerza el repintado entre dos clics y
un navegador no. Hacen falta las dos cosas: el pedido en una **`ref`** —esto no se pinta, solo
decide si se manda— y `vigente` calculado **dentro del manejador**, porque arriba quedaría
capturado en el closure igual que el estado. Hay un test que dispara los dos `click` sin pasar
por `fireEvent` entre medias, que es el único que caza esto.

**Consecuencia que hay que tener presente**: ahora el segundo clic SÍ manda, así que sin turno
en vuelo cambiar de idea rápido deja dos acuses en el hilo. Son dos cambios reales y eso es
historia correcta. Con un turno en vuelo —el caso que motivó todo esto— las dos líneas se
quedan en la cola y `LineaDeConsola.sustituye` deja una sola: la clave que se escribió
«defendiendo un caso inalcanzable» es justo lo que este arreglo vuelve alcanzable.

**No se toca `PastillaDeModelo` ni `PastillaDeEsfuerzo`**: comprobado, no tienen esta guarda
—mandan siempre—, así que no pierden pulsaciones. Lo que les evita la línea repetida es la
clave de coalescing, que ya la llevan.

## El tramo de trabajo: cuál está en curso, y que abrirlo no se coma la pantalla

Tres defectos vistos sobre una pantalla con un turno EN VUELO, que es donde este componente
se comporta distinto.

**1. Tres tramos seguidos decían literalmente lo mismo.** «Trabajando… · 1397 s · busca
function calc · 17 s», repetido. La causa: `pasoActual` y el cronómetro se calculan UNA vez
para la lista entera de actos, y los pintaba cualquier tramo con `terminado: false` — y
mientras el turno corre, todos los del turno lo están. Pero un tramo que un mensaje del
asistente ya cerró **no está trabajando**: lo que tiene por delante son sus pasos, no el paso
de ahora. **Solo el ÚLTIMO tramo del turno está en curso**, así que abrir uno nuevo da por
terminado al anterior. Las cifras del turno no se ven afectadas: las reparte el `fin` al
último de `delTurno`, que sigue siendo el último.

**2. Nace PLEGADO también con el turno en vuelo.** Se abría, y la razón escrita era «es lo
único que se ve mientras trabaja». Dejó de ser cierta cuando el resumen empezó a llevar el
paso actual y su cronómetro — la propia regla dice «en la línea que se ve con el pulso
PLEGADO»—, así que esto no revierte aquella decisión: la completa. Lo que se midió en contra
de abrirlo: un tramo de cuarenta pasos empuja la respuesta fuera de la pantalla, y con un
turno largo hay varios a la vez.

**3. Abierto es una VENTANA de seis renglones con scroll, pegada al final.** El andamio de un
turno de aparato son decenas de líneas; volcarlas enteras convierte un clic de curiosidad en
perder el sitio de la conversación. La altura sale de la aritmética de la propia hoja —una
línea es `12px × 1.6` más el `gap` de 2 px; seis renglones y el relleno dan 132— y está
escrita con esa cuenta al lado, no adivinada. **Se reusa `usarPegadoAbajo`**, el mismo hook
que mantiene el transcript abajo mientras el agente escribe: baja solo si ya estabas abajo,
así que subir a leer una línea de hace diez tools no te devuelve al fondo en la siguiente. Al
ABRIRLO se va al final sin condición (`onToggle`), porque lo último es lo que está pasando y
es a lo que se abre.

**Consecuencia declarada**: el tope alcanza también a «Verificaciones» y «Permisos», que
reusan `.detalleDePulso`. Vale por lo mismo — quince permisos tampoco se leen de un vistazo.

**Y una nota de forma**: esto obligó a extraer `TramoDeTrabajo` a su propio componente,
porque un trozo de `map` no puede tener un `ref` ni un efecto.

## El panel de vistas se abre AL LADO del chat, no encima (23-09-2026)

Lo pidió él con dos capturas y el chat de ChatGPT delante: «que las tres secciones cambien, así
podría ver los artefactos y el chat a la vez». La tira de pestañas llevaba a «Chat» como primera
opción, o sea que las otras seis se leían como sus alternativas: **para mirar un fichero había
que dejar de ver lo que el agente estaba escribiendo**, que es justo el momento en que más falta
hace mirarlo.

La decisión que ordena todo lo demás es que **la conversación deja de ser una vista**. No es una
más entre siete: es la columna que se queda. Lo que las pestañas eligen pasa a ser «qué abro al
lado», y volver al chat a secas es CERRAR el panel — por eso el sitio que ocupaba «Chat» lo ocupa
una «×», y por eso la tira se muda DENTRO del panel, que es la cuarta casa que tiene.

**La tercera columna ya estaba, y llevaba sin usar desde el principio.** `.detailsCol`, su
tirador con pastilla (`data-side="details"`) y el `.frame[data-details-collapsed]` que le quita el
borde a cero vienen en `estilos/AppFrame.module.css`, copiado de deepseek; `Maqueta.tsx` incluso
lo decía por escrito («aquí no hay columna de detalles»). Lo que faltaba era la pista del grid y
quién la habita, así que el asa, el plegado a cero y la animación salieron gratis.

**Quién cabe lo decide código, no una hoja de estilos** (`apps/web/src/repartoDeColumnas.ts`,
puro y con test), por dos motivos que se refuerzan: lo que no cabe se **DESMONTA** —un elemento
invisible sigue siendo tabulable, la regla de siempre de esta consola—, y los anchos de la barra
y del panel **los pone JS**, así que un `@media` no puede consultarlos: con la misma ventana y la
barra estrecha caben tres columnas, y con la barra ancha no. El orden de las preguntas ES la
política, de más generoso a menos: ¿caben las tres? ¿caben el chat y el panel sin la barra?
¿ninguna de las dos?

De ahí salen las dos decisiones que no son de forma:

- **La única concesión automática es plegar la barra**, y es TRANSITORIA. Cuando no caben las tres
  pero sí el chat y el panel, la barra se pliega sola para hacerle sitio — y `guardarBarraContraida`
  **no se llama nunca** con eso. Si se guardara, estrechar la ventana una vez dejaría la barra
  plegada para siempre, también en la pantalla grande de mañana.
- **Pedir la barra de vuelta CIERRA el panel**, en vez de no hacer nada. Es la consecuencia
  incómoda de lo anterior: el usuario no la plegó, así que su preferencia ya dice «abierta» y
  volver a ponerla ahí no cambiaría nada — se pulsa «Mostrar la barra lateral» y no pasa nada, sin
  ninguna pista de por qué. Gana quien pulsa: pide la barra, se le da la barra. **Y con el panel
  CERRADO no hay concesión ninguna**, por lo mismo: si el ancho a secas plegara la barra, ese botón
  quedaría muerto sin nada que hacer al respecto. Una ventana estrecha sin panel se comporta
  exactamente como antes de que existiera la tercera columna.

Sin sitio para los dos, **el panel ocupa el centro y el compositor se esconde —sin desmontarse,
para no perder el borrador—**, que es el comportamiento que ya tenía esta consola; el mismo
elemento se monta UNA vez en un sitio o en el otro, porque cada una de sus vistas MIDE al
montarse y dos copias duplicarían todas esas peticiones. **Y el panel es de la SESIÓN**: en el
escritorio no se pinta aunque la vista siga elegida, porque allí no se ofrece el botón que lo
cierra y quedaría una columna de la que no se sale. La elección sí se conserva, así que al volver
a la sesión el panel vuelve por donde estaba.

Dos cosas menores que se decidieron aquí y no hay que volver a decidir: **la vista por omisión al
abrir es Ficheros**, no Trazas, que son de otro destinatario —quien depura el harness, no quien
desarrolla la app—; y **el ancho del panel se recuerda pero NO si estaba abierto ni con qué
vista**, porque esas vistas miden al montarse y sería mandar peticiones al servidor por una
preferencia de hace tres días.

El gesto de los dos tiradores pasó a ser **una sola pieza** (`Tirador`, dentro de `Maqueta.tsx`):
son noventa líneas con cuatro trampas medidas dentro —el `button > 0` de jsdom, la captura de
puntero envuelta, el `pointercancel` y el `lostpointercapture`—, y una segunda copia para el panel
sería el segundo sitio donde cada una de las cuatro puede volver. Lo único que los distingue es
`medir`: la barra cuenta desde el borde izquierdo del marco y el panel desde el derecho, y las
flechas del teclado van en el mismo espejo porque mueven el BORDE y no el ancho.

### Y destapó un defecto de dos meses que ningún test veía

`Ficheros` y `Artefactos` declaraban `container-type` en la MISMA caja que su `@container` ponía
en columna. **Una consulta de contenedor solo alcanza a los DESCENDIENTES del elemento que la
declara**, así que esa regla no se aplicaba nunca — y el resto del bloque sí: el árbol saltaba a
la izquierda por su `order: -1` y salía recortado a una fracción del alto, en FILA con el visor.
No es «no pasa nada», es medio encuadre, que es peor.

No se vio en dos meses porque esas cajas vivían siempre en la columna central, más ancha que el
umbral de la consulta; apareció a los cinco minutos de que hubiera una caja estrecha de verdad.
El arreglo es un envoltorio que declara el contenedor, con la caja de antes como hija. Y va con
su test en `Barra.test.tsx`, al lado del que ya exigía que una consulta declarara su contenedor en
la misma hoja: ninguna regla dentro de un `@container` puede llevar el selector de una clase que
declare `container-type`. Es el patrón de fallo de esta arquitectura —una regla escrita y no
montada, con todo en verde— en su versión de CSS, y jsdom no lo puede ver porque no hace layout
ni cascada.

## A DeepSeek se le dice QUIÉN pide: el `user_id` del login de CloudStudio (23-09-2026)

`core/identidadDeProveedor.ts` (la regla, pura), `agent/config/identidadEnDisco.ts` (de qué
entorno se lee), `agent/config/modelos.ts#construirCompatibleOpenAi` (el cableado).

**Por qué, con claves distintas.** La primera respuesta fue «no hace falta»: con una clave por
desarrollador, la cuenta ya separa a las personas. Era falso por un dato que faltaba — las claves
son de la MISMA suscripción, y los límites de DeepSeek son de CUENTA
(`api-docs.deepseek.com/quick_start/rate_limit`). Para DeepSeek somos todos el mismo cliente. El
`user_id` da tres cosas: el filtro de contenido marca a una persona y no a la cuenta (la que más
pesa: sin él, lo que dispare uno frena a todo el equipo), aísla la caché KV por persona, y con
cuota ampliada da cupo de concurrencia por persona. La segunda no se puede medir desde aquí: su
documentación no dice si hoy la caché se comparte entre claves de una misma cuenta.

**La identidad es el `sub` del token del IDS, y se normaliza SIEMPRE.** DeepSeek exige
`[a-zA-Z0-9\-_]+` de hasta 512 caracteres y pide no poner datos personales, así que sale
`xonecode-` + los primeros 32 hexadecimales de un sha256 — nunca el `sub`, y el correo menos (ya se
filtra a propósito en `proyectosDeResultado`). Antes del hash el `sub` se recorta y se pasa a
minúsculas (es un GUID: escrito de dos formas no son dos personas), y el ENTORNO entra en el hash,
porque dos servidores con su propio IDS pueden repetir un `sub`. El `id_token` primero y el
`access_token` después, que IdentityServer también emite como JWT. No se verifica la firma: esto no
autentica a nadie, le pone nombre a una petición.

**Qué entorno**: el del proyecto, resuelto EXACTAMENTE como la sincronización (`entorno` del
`config.json` → `entornoDeUrl` → `legado`); por eso `entornoDeUrl` se mudó de `cli/main.ts` a
`core/settings.ts`, que `agent/` sí puede importar. Un proyecto de un servidor sin sesión NO toma
prestada la identidad de otro. Sin CloudStudio en el proyecto, el primer entorno registrado con
identidad legible, y luego `legado` — determinista y declarado.

**El cableado es el lector REAL por omisión, no un parámetro opcional.** Salió del mismo día que
el `Calificador`: un campo opcional que nadie pasa, con todo en verde. Aquí hay diez
`new Modelos(` en producción, así que el quinto parámetro del constructor es una función que por
omisión lee el disco, y lo que se pasa a mano es la excepción (un test). La prueba de costura lo
mira desde fuera: con `HOME` en un temporal y un login de pega, un `new Modelos` sin argumentos
tiene que llevar `user_id` en `invocationParams()` — y con el mutante (omisión `undefined`) caen
los tres tests de cableado. Se lee en cada construcción, porque el login puede llegar con la
consola abierta.

**Va en la RAÍZ del cuerpo por `modelKwargs`**, como pide su documentación para la API compatible
con OpenAI, y no por el `user` nativo del SDK, que es otro campo. Solo `deepseek`. **Límites
declarados**: un proveedor PERSONALIZADO apuntado a DeepSeek no lo lleva, y sin login el campo no
viaja (DeepSeek funciona igual, y un turno caído por no poder ponerle nombre sería cambiar una
ventaja por una avería). El hash no entra en eventos, trazas ni `.jsonl`.

**Medido**: `xonecode config` dice «se manda user_id» con el login real de la máquina (o sea, el IDS
devuelve un token con `sub`, que era lo único que no se podía saber leyendo el código), y una
llamada real a `deepseek-flash` contestó sin error con el campo **medido en el cuerpo del `fetch`**,
no solo en `invocationParams()`: para DeepSeek el `fetch` es el del eco del razonamiento, el único
sitio que reescribe el cuerpo, y lo recompone con `{ ...cuerpo, messages }`, así que conserva la
clave. Lo que eso NO demuestra es que DeepSeek la esté USANDO: una API que ignora un campo
desconocido contestaría igual.
