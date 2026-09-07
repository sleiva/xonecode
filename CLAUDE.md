# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

`xonecode`: consola CLI y harness de agente para desarrollar aplicaciones **XOne**, sobre
LangChain / LangGraph / deepagents. El razonamiento detrás de cada decisión está en
`README.md` («Cómo está construido, y por qué») y en `docs/`. Este fichero es el mapa y los
invariantes, no la justificación.

**XOne no es desarrollo web.** Es una plataforma propietaria de apps móviles nativas: XML en
ficheros `.xne`, JavaScript ES5 y un CSS propio. No existe el DOM, ni `async/await` en el
runtime, ni React. La fuente de una colección es su `.xne`; los `.xml` los genera XOne Studio
y **no se tocan**. XOne ignora en silencio lo desconocido, así que un atributo o una función
inventada no da error — da un bug mudo. Esa regla gobierna los prompts (`agent/xoneAgent.ts`)
y el backend (`agent/proyecto.ts`).

## Comandos

```sh
npm run typecheck                      # tsc --noEmit
npm test                               # vitest run — todo el suite, sin red ni clave ni simulador
npm run test:watch
npx vitest run src/core/turno.test.ts  # un solo fichero
npx vitest run -t "la frontera"        # por nombre de test
npm run build                          # rm -rf dist && tsc -p tsconfig.build.json
./bin/xonecode …                       # lanzador de DESARROLLO: tsx sobre src/, preserva el cwd
npm run web -- --puerto 4200           # la consola WEB: construye el cliente y la levanta
```

Los tests son **colocados** (`src/**/*.test.ts`, junto al módulo que prueban).
`tsconfig.build.json` los excluye, igual que `src/core/__oro__/` (ficheros de oro: salida real
de `xone-simulator --json`).

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
convención — `agent/` no importa de `cli/` — vive solo como comentario en `agent/turnoReal.ts`;
nada la verifica. En el otro sentido sí se puede: `cli/main.ts` importa
`ficherosDelProyecto` de `agent/turnoReal.ts` para el completado de «@ficheros» del Tab.)

**Los puertos y sus dobles** (`core/ports.ts`, `core/deps.ts`). Todo lo caro (modelos, skills,
verificador, MCP) entra por un puerto que se **pasa al construir**, nunca se importa dentro de
quien lo usa. Los dobles viven en `ports.ts` y no en fixtures de test, porque el modo offline es
un modo de uso de primera clase (`xonecode describe` lo enseña). La marca de doble es el Symbol
`ES_DOBLE`, no un booleano: un campo se puede olvidar o poner mal, y entonces el aviso calla
justo cuando hace falta.

**Los eventos de dominio** (`core/events.ts`). `agent/` los emite (el puente
`agent/puente.ts` traduce los chunks del stream de langgraph), `core/turno.ts` decide qué se
cuenta, y las pieles (`cli/stdio.ts`, `cli/tui/`, `web/servidor/pielWeb.ts`) pintan. Ningún evento lleva argumentos
de tool, ni truncados: `write_file` lleva el contenido del fichero y una tool MCP lleva el
bearer. La excepción aparente es `tool.detalle`, y no es una excepción: una lista blanca por
NOMBRE de tool (`agent/resumenDeTool.ts`) extrae un solo campo de ruta/patrón — nunca contenido.
Y el bloque de diff de la aprobación (`cli/aprobar.ts`, líneas de `core/diff.ts`) es el único
sitio donde el contenido se enseña entero: es el paso donde se DECIDE sobre él.

**Los avisos de honestidad son código, no prompt**, y tienen alcance de **turno**
(`core/bitacora.ts`): a un modelo al que le pides «avisa de que el verificador es de pega» a
veces no avisa, y un aviso que salta cuando no ha pasado nada enseña a ignorarlo.

**El verificador está EN el turno, no solo en `xonecode verify`** (`agent/turnoReal.ts#conVerificacion`).
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
`--no-abrir`. Abrir el navegador es lo accesorio: `abrirEnSistema` (`agent/cloudstudioMcp.ts`,
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

Y una trampa que llevaba escondida desde siempre: `guardarCredencial` (`agent/authEnDisco.ts`)
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
la convención de MCP—, saneado en `agent/cloudstudioMcp.ts#servidorDeImplementacion`: sin
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
- **El punto de credencial tiene TRES estados** (`SIN_CREDENCIAL`, `core/modelos.ts`):
  verde solo si está confirmada, HUECO solo si consta que falta (era rojo, y tres puntos
  rojos en la lista se leían como tres errores), y NADA para quien no
  necesita ninguna. `hayCredencial` (`cli/consola.ts`) no sirve para esto: devuelve `true`
  para un proveedor sin variable de entorno, que responde a otra pregunta.
- Al caerse el SSE el cliente **tira** el estado de modelos (`marcarDesconectado`) y la
  reconexión lo trae entero: mientras no hay cable, el modelo en vigor no se puede afirmar.

**La clave de API se PRUEBA antes de escribirse** (`cli/wizardInicial.ts`). Dos cribas, y la
primera es de balde: `motivoDeClaveInaceptable` (`core/config.ts`) rechaza lo que el propio
campo ya delata —una línea `NOMBRE=valor` pegada entera, comillas, y cualquier carácter que
no quepa en una cabecera HTTP (`\x21`–`\x7E`)— sin gastar una petición. La segunda es el
catálogo: la clave se aplica al proceso con `aplicarCredencialAlProceso`
(`agent/configEnDisco.ts`, sin tocar disco), se pregunta, y **solo si el proveedor contesta
se escribe** en `auth.json`. Antes se escribía primero —hacía falta para poder listar— y
cada intento fallido dejaba una clave basura en el fichero con el asistente confesando
dónde. La clave a medias vive en una variable de la VUELTA del lazo y no del lazo: siendo
del lazo, una vuelta que se iba por un `continue` se la dejaba puesta y la siguiente
—otro proveedor— la escribía como suya (medido con `auth.json` roto: la clave de openai
se intentaba guardar bajo ollama, que ni pide credencial).

**Los subagentes son FICHEROS, y se configuran desde Ajustes** (`core/agentes.ts`,
`agent/agentesEnDisco.ts`, `componentes/Agentes.tsx`). Uno es un `.md` con frontmatter en
`.xonecode/agentes/<nombre>.md`: `descripcion`, `motor` (`modelo` | `claude-code` | `codex`),
`modelo`, `soloLectura`, `skills`, y el cuerpo con sus instrucciones. Los cuatro
especialistas de siempre —`docs`, `planner`, `dev`, `mockup`— dejaron de estar a fuego en
`perfiles.ts` y son ahora esos mismos ficheros, sembrados en el arranque. El quinto es
**`probador`**, para Android local (párrafo siguiente). Reglas duras:
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
- **La marca de la siembra es un FICHERO, `.semilla.json`, con el hash de lo que escribimos
  nosotros para cada agente.** Fue «la carpeta es la marca»: si `agentes/` existía, no se
  escribía nada nunca más. Respetaba el prompt afinado por el usuario —que es lo que hay que
  respetar— pero eligió un cuerno del dilema y el otro acabó mordiendo: **ningún agente
  nuevo, y ninguna corrección a uno existente, alcanzaba a quien ya hubiera arrancado una
  vez**. Medido: un `docs.md` llevaba semanas sin la consulta acotada, y `probador` no habría
  llegado jamás. El hash distingue los cuatro casos que antes eran uno:
  no está + no consta = agente NUEVO, se escribe; no está + consta = lo BORRÓ el usuario, no
  se resucita; está y es el nuestro = nadie lo tocó, se actualiza; está y NO es el nuestro =
  es suyo, se deja y se DICE (por `problemas`, el mismo canal que un `.md` roto, porque quien
  lo tiene que arreglar está mirando esa ventana).
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
- **Un agente EXTERNO (Claude Code) corre, pero solo LEE** (`core/ports.ts#SubagenteExternoPort`,
  `agent/subagenteExterno.ts`). Entra como `CompiledSubAgent` de deepagents
  —`{name, description, runnable}`, que acepta junto a los normales—, así que los tres
  motores llegan al orquestador por el MISMO `task` y él no sabe de qué está hecho cada
  especialista. Cuatro cosas que sostienen esto:
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
  - **Codex va por otro camino** (`agent/subagenteCodex.ts`) y es el que tiene la denegación
    más fuerte: se habla con `codex app-server --stdio` por JSON POR LÍNEA, y la escritura la
    bloquea el SANDBOX del sistema operativo (`sandbox: "read-only"`), no un callback — o sea
    que no depende de que el modelo colabore. **Todo el protocolo está medido contra el
    binario real, no deducido**: los tres valores de sandbox los enumeró el propio servidor
    al rechazar uno mal escrito, y la respuesta final es el `item/completed` cuyo item es un
    `agentMessage` de fase `final_answer` — quedarse con el último item devolvería el
    razonamiento o la lectura. Comprobado de punta a punta: lee la carpeta y contesta, y al
    pedirle que escriba un fichero contesta que no pudo y el directorio queda intacto.
    Se usa el `codex` del PATH (o `CODEX_BIN`) y no el paquete npm: son ~100 MB de binario
    por plataforma para una capacidad opcional, y el usuario ya tiene el suyo autenticado.
    Un `TOPE_MS` de 10 minutos evita que un hijo colgado cuelgue el turno para siempre. Y una
    consecuencia que hay que saber: el hijo es el Codex DEL USUARIO, con sus MCP, sus plugins
    y sus hooks — medido, arrancan al abrir el hilo. xonecode no los filtra.
- Un `.md` roto NO tumba nada: se salta, y su motivo viaja por el cable hasta la ventana.
  Quien lo tiene que arreglar está mirando ahí, y un agente que no aparece sin explicación
  se lee como que la aplicación lo perdió.

**El probador de Android** (`probador` en `AGENTES_DE_SERIE`, skill `xone-android-hotswap`).
El interlocutor es la app **XOneStudio ya instalada** en el móvil o el emulador: no se
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
- **El protocolo NO va en el prompt**: son 1.200 líneas y viven en la skill, que se carga
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
  la podemos quitar; `borrarCredencial` (`agent/authEnDisco.ts`) limpia `process.env` SOLO
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

**Un proyecto puede escribir SIN aprobación, y es la única grieta del fail-closed**
(`core/settings.ts#seAplicaSinAprobacion`, comando `/aprobacion`). El caso es real —en un
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
(`core/artefactos.ts#artefactoFueraDeSitio`, `agent/proyecto.ts#sinArtefactosEnElProyecto`).
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
  montada con todo en verde. Ahora es `backendDeAgente` (`agent/proyecto.ts`), con test que
  compone el backend real sobre un proyecto temporal y comprueba las cuatro capas: las
  vistas aplanadas, la guarda de artefactos, `/skills/` colgada y `/artefactos/` escribible.
- **Y no sale el modal**, que era el otro lado: el HITL pregunta ANTES que el backend, así
  que una escritura a `/artifacts/` sacaba la ventana de aprobación con el diff entero y
  aprobarla no escribía nada. Un modal cuyo único final posible es un rechazo enseña a
  aprobar sin mirar, que es cómo se rompe la aprobación el día que importa. Lo corta el
  predicado `when` de `InterruptOnConfig` (`agent/perfiles.ts#seDetieneEn`), que es el
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
`agent/proyecto.ts#backendConArtefactos`). Un diagrama de `archify`, un panel de
`artifacts-builder`, la captura que el `probador` traerá el día que hable con el móvil: son
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
  - **Dos lectores y no uno** (`agent/artefactosEnDisco.ts`), porque son dos transportes con
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
  `SKILLS_VISUALES` (`agent/agentesEnDisco.ts`), que va en el prompt de los cuatro
  especialistas SIEMPRE y no depende de cargar nada: es la misma lección que la carpeta
  `/artefactos/`, y llega a quien ya arrancó porque la siembra compara por hash
  (`.semilla.json`). Queda una alternativa de más calado sin hacer, y es decisión de
  producto: **servir los artefactos desde OTRO origen** —un puerto sin nada detrás— permitiría
  darles `allow-same-origin` sin regalar nada, y la clase entera de fallo desaparecería. Toca
  la regla de «loopback y nada más».

**El hilo del agente SOBREVIVE al proceso** (`agent/checkpointer.ts`,
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
que el servidor ya manda —si tienen copia local, sus últimas sesiones—, el entorno activo
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

**Qué hay en la máquina para probar la app** (`core/dispositivos.ts`,
`agent/dispositivosEnMaquina.ts`, panel «Tu equipo» en `Equipo.tsx`, mensaje
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
  se vuelve a medir cuando alguien pulsa «Volver a mirar». Refrescar solo cada pocos
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
    cada medida y al revés daría la foto de la configuración anterior. La ventana **dice que
    hoy solo se DESCUBREN**: conectar por red, arrancar un emulador o instalar la app no está
    cableado, y un botón que lo prometiera sería el botón muerto de siempre.
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
La pastilla **dice que ninguna tool la consume todavía**: las de dispositivo son lo
siguiente, y hasta entonces la elección se guarda y se enseña, nada más.
- **Instalar lo que falta: se ofrece lo que se puede cumplir, y solo eso**
  (`Herramienta.instalar`, `INSTALADORES` en `agent/dispositivosEnMaquina.ts`).
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
no se exporta.** Lo que sigue existiendo es teclear `/loquesea` en el compositor: eso lo
decide quien escribe, no un botón.

El registro de comandos que el compositor sugiere se **genera recorriendo `COMANDOS`**
(`comandosDelRegistro`, `web/servidor/arranque.ts`), igual que `/ayuda`, la cabecera de stdio y
el completador de Tab: una lista escrita a mano se queda vieja en cuanto alguien añade un
comando. Por eso una línea que empieza por «/» no tiene camino propio en la web — viaja como
prosa y la despacha `correrConsola` del lado servidor.

**Ficheros y Revisión, las dos pestañas del proyecto** (`docs/superpowers/specs/2026-09-07-ficheros-y-revision-design.md`).
**Revisión** es lo que ha tocado una sesión (`agent/sesionGit.ts`, `componentes/Revision.tsx`,
mensaje `revision` del cable — se llamaba `ficheros` hasta que hubo una pestaña con ese
nombre): los ficheros APILADOS con cabecera pegajosa y su diff dentro, numerado con las dos
columnas del formato unificado por `apps/web/src/numerarParche.ts` (pura; es también quien
corta la cabecera de git), los `DESPLEGADOS_AL_ABRIR` primeros abiertos solos y el resto al
pulsar, y a la derecha el árbol de cambiados. La cabecera dice «Sesión» porque la foto es de
la sesión: es el hueco del selector de turno que no existe. **Ficheros** es el árbol del
proyecto con un visor de SOLO lectura (`agent/arbolDeProyecto.ts`, mensajes `arbol` y
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
mismo `GIT_INDEX_FILE` privado de `agent/instantanea.ts`: sin commits y sin tocar el índice
del usuario) y la ref se nombra cuando la sesión recibe su id. Lo que se lista es
**árbol contra árbol** —un árbol nuevo escrito en un índice privado contra el de la foto—,
nunca `git diff <arbol> -- .`: eso compara contra el índice REAL del usuario y da por
borrados ficheros que están ahí. Va con `--no-renames` por lo mismo que `cambiosPendientes`,
y un binario se queda sin cuenta de líneas en vez de con un cero inventado. El `via` del
cable tiene **tres** valores y no dos, porque son tres situaciones y una lista vacía las
haría indistinguibles: `git` (comparado), `sin-empezar` (hay proyecto abierto pero la sesión
todavía no tiene id —nace al volcar el primer acto, `vestibulo.ts#volcar`—, así que no ha
tocado nada y eso SE SABE) y `sin-marca` (no hay con qué comparar: sin git usable, o sesión
abierta antes de que esto existiera). Los dos últimos se separaron porque contestar
«sin-marca» recién abierto un proyecto mandaba a comprobar si el proyecto es un repo de git
cuando lo único que pasaba es que acabas de sentarte. `.xonecode/` se excluye —ahí dentro
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
no sea `A` ni `D`, así que un cambio de TIPO se colaría con una etiqueta falsa. Los `DESPLEGADOS_AL_ABRIR`
(8) primeros parches se piden cuando la lista llega por primera vez con algo dentro (el efecto
de `App.tsx`, que es quien recuerda lo desplegado), y el resto al pulsar su cabecera: la
pestaña se abre enseñando diffs sin traerse los megas de un turno largo. Cada parche se
recorta a `TOPE_DE_PARCHE` diciéndolo. La foto es de UNA sesión:
`store.ts` la tira en cuanto el `alta` trae otra `sesionActiva`.

**La regla de qué URL de MCP vale es UNA** (`agent/cloudstudioMcp.ts#urlDeMcpAceptable`, que
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

**El agente** (`agent/xoneAgent.ts`): un orquestador **sin ninguna tool** que delega en cuatro
especialistas (`docs`, `planner`, `dev`, `mockup` — `agent/perfiles.ts`). Cuatro cosas no son
negociables ahí:
- `FilesystemBackend` con `virtualMode: true`. Con el default, medido, el backend leyó una ruta
  absoluta de fuera de la raíz. Nada de backends con shell.
- Las **vistas aplanadas** (`X.xml` con un `X.xne` al lado) se retiran del backend con un Proxy
  (`agent/proyecto.ts`): así la regla es propiedad del proyecto y no de un prompt.
- Los permisos se construyen con `permisosDe(perfil)`, **nunca a mano**: `SubAgent.permissions`
  reemplaza los del padre en vez de fusionarlos, así que un perfil que los escriba a mano pierde
  la denegación de `/.env`, `/.git` y `/.xonecode`.
- El HITL va en las tools de fichero (`write_file`, `edit_file`), que son las que escriben.

`SubAgent.tools` lleva SOLO tools propias, nunca los nombres de las de fichero: pasarle nombres
las sustituía por cadenas y dejaba al especialista sin ninguna capacidad real. Las de fichero
las monta `createFilesystemMiddleware` desde el backend, y quien las acota es `permissions`.
La única tool propia hoy es la **búsqueda regex** (`agent/busquedaRegex.ts`): cubre patrones
estructurales de XOne/ES5 que el `grep` literal de deepagents no expresa, sin conceder
`execute` ni una shell. Va acotada a propósito
(`LIMITES_REGEX`: 50 ficheros, 256 KB por fichero, 100 coincidencias) y filtra rutas con
`puedeLeerRuta` — una tool de LangChain añadida por xonecode **no pasa por el middleware de
permisos**, así que la denegación de `/.xonecode` hay que re-aplicarla ahí a mano.

**La memoria del proyecto y el resumen de contexto** (`agent/memoriaDeProyecto.ts`,
`agent/resumenDeContexto.ts`). `.xonecode/memoria.md` viaja con el proyecto, pero el agente la
ve por UNA ruta virtual, `/MEMORIA_PROYECTO.md`: `exponerMemoriaDeProyecto` es un Proxy que
traduce esa ruta en `read`/`readRaw`/`write`/`edit` y nada más, así que la carpeta `.xonecode`
sigue denegada entera y escribir la memoria pasa por la misma aprobación que cualquier fichero.
El resumen usa `createSummarizationMiddleware` con umbrales **fijados a mano** (32k para
disparar, 8k de reciente): deepagents asume 170k cuando el proveedor no publica su ventana, y
con Ollama eso comprime demasiado tarde. Los historiales ya resumidos se escriben en
`.xonecode/conversation_history/` — internos, ni en el árbol del agente ni en la app XOne.

**CloudStudio (MCP con OAuth)** (`agent/cloudstudioMcp.ts`). Al abrir un proyecto sin
`.xonecode/`, `configurarModoInicial` (`cli/consola.ts`) pregunta el modo: `offline` o `cloud`;
`cloud` hace OAuth Authorization Code + PKCE contra el IDS, lista los proyectos y guarda en el
`config.json` del proyecto `modo` y `cloudstudio` (`url`, `scopes`, `proyecto`, `rama`). Invariantes:
- **Las tools remotas NO se inyectan en el agente.** `turnoReal.ts` y `xoneAgent.ts` no conocen
  CloudStudio; solo `cli/` llama a `conectarCloudStudio` — y, ahora que hay descarga y subida,
  también a `agent/descarga.ts` y `agent/subida.ts`. Las ejecuta el CLI, nunca una tool que el
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
  formato. `conSesion` (`agent/cloudstudioClient.ts`) mira ahora el RESULTADO además de la
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

**La copia local y la sincronización** (`agent/descarga.ts`, `agent/gitSync.ts`,
`agent/subida.ts`, `core/planDeSubida.ts`). El proyecto se descarga a la carpeta que el
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
  vez, algo que `agent/subida.ts` asume del servidor sin comprobarlo.
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

Studio tiene rama origen (de la que se baja, `cloudstudio.rama`) y rama de trabajo (a la
que se sube, `ramaDeTrabajo(origen)` = `xonecode/<origen>`, creada perezosamente en la
primera subida para no ensuciar Studio a quien no sube nada). **La ref que se mueve al
subir es la de la rama de TRABAJO**, que es a la que se escribió: con la de la origen,
`git status` decía «al día con master» mientras en Studio `master` no tenía nada de eso, y
un `bajar` posterior reintroducía todo como si el trabajo se hubiera revertido. Por eso
`cambiosPendientes` compara contra la ref de trabajo en cuanto existe, y contra la de la
origen antes de la primera subida — de ahí parte la de trabajo. **El servidor no fusiona** —`manage_branches("merge")` da una LISTA de
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

**La foto del ANTES** (`agent/instantanea.ts`) es un árbol de git en un `GIT_INDEX_FILE`
privado: no necesita commits, no necesita que el proyecto sea la raíz del repo, y no toca el
índice del usuario. Se toma **por turno**, no por sesión.

**Modelos por papel** (`core/modelos.ts`): `rapido` (corre en todos los turnos), `trabajo`
(desarrolla), `afilado` (reservado al juez). Por omisión, Ollama local. Precedencia:
`--modelo-<papel>` > `--modelo` > `XONECODE_MODELO` > proyecto > global > omisión, y cada valor
recuerda su `origen` para que `config`/`describe` lo digan.

**El catálogo de modelos** (`agent/catalogoModelos.ts`, puerto `CatalogoModelosPort`):
`/modelos <proveedor>` consulta el catálogo VIVO del proveedor, filtra los de conversación y
guarda la elección en la config global. `ErrorCatalogoModelos` es un error publicable: nunca
lleva la clave ni el cuerpo remoto. Ollama local (`OLLAMA_BASE_URL`) y Ollama Cloud
(`https://ollama.com`) son dos hosts distintos y no se mezclan.

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
- **La clave se EXIGE al construir** (`agent/modelos.ts#construirCompatibleOpenAi`), al
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
(`core/modelos.ts`, `agent/configEnDisco.ts#guardarProveedorPersonalizado`, Ajustes →
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

**Configuración y credenciales** (`core/config.ts`, `agent/configEnDisco.ts`): `config.json`
lleva modelos, `modo`, `cloudstudio`, `contextos` (topes de ventana fijados a mano,
«proveedor/modelo» → tokens) y **rechaza claves de API**; las credenciales van solo en
`~/.xonecode/auth.json`, modo 0600, y se escriben con `/provider <nombre>`. El ESCRITOR de
`auth.json` es `agent/authEnDisco.ts` (el lector, `configEnDisco.ts`), y su contrato es que una
escritura nunca destruye lo que había: la base de la fusión es el objeto CRUDO —no el resultado
de `validarAuth`, que descarta entradas raras en silencio— y ante un JSON roto **para sin
escribir** en vez de recuperar el fichero por su cuenta.

**La creación de proyecto al arrancar** (`core/esqueleto.ts`, `agent/crearProyecto.ts`,
`cli/main.ts`). Si al abrir la consola falta `app.xml`, se ofrece crearlo (omisión **No**:
crear ficheros es opt-in, como las aprobaciones) y cuatro preguntas deciden el esqueleto.
QUÉ se escribe son datos puros en `core/` —todo del «Hola Mundo» de la documentación XOne,
nada inventado: XOne ignora en silencio lo inventado—, y `agent/crearProyecto.ts` solo lo
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

## Los evals (`npm run eval`, nunca en `npm test`)

`src/evals/correr.ts` corre tareas XOne reales sobre el esqueleto «Hola Mundo» en un temporal,
con el agente de verdad, el simulador de verdad y una aprobación que **aprueba todo** (por eso
no acepta una raíz: solo sobre un proyecto que se tira). El veredicto del simulador se MIDE
en el corredor, no se lee del turno — el juez no puede depender de que el lazo haya hecho su
parte, que es lo que se evalúa. Los JUECES (`tareas.ts`) son código puro y SÍ tienen test en
`npm test`: un juez que juzgue mal invalida el eval entero sin que nadie lo note. El corredor
vive en `src/` para tipearse, `tsconfig.build.json` lo excluye, y su nombre no acaba en
`.test.ts` — así `npm test` sigue sin red, sin clave y sin simulador. `docs/EVALS.md` tiene
las tareas y cómo leer un resultado. La primera comprobación de la línea base destapó que el
esqueleto no pasaba el simulador (`COLL_MISSING_PROGID`): la línea base se comprueba por eso.

## Códigos de salida (contrato, CI los lee)

| | |
|---|---|
| 0 | bien |
| 1 | el proyecto tiene errores, o no es un proyecto XOne |
| 2 | había escrituras esperando aprobación y **nada se aplicó** |
| 64 | error de uso (bandera o modelo mal escritos) |
| 70 | fallo del **entorno**, no del proyecto |

Un fallo del entorno no se reporta como un proyecto roto: `agent/verificador.ts` lanza
`ErrorDelSimulador` en vez de devolver un informe en rojo.

## Trampas verificadas

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

(Antes había una segunda trampa: `docs/COMO-PROBARLO.md` decía que la consola no hablaba con el
agente real. El doc ya está corregido — `cli/main.ts` monta `crearEjecutorReal` por omisión y
`--guion` es el modo de pega. Ante una discrepancia entre doc y código, el código manda.)
