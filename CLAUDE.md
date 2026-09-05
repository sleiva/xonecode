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
intercalados en la conversación, en gris y en una línea — paisaje, no conversación. `sistema`
y `fin` siguen siendo solo de la Trayectoria: son avisos de la consola y el cierre del turno,
no el pulso.

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
  verde solo si está confirmada, rojo solo si consta que falta, y NADA para quien no
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

**La ventana de ajustes** (`apps/web/src/componentes/Ajustes.tsx`), con la disposición del
panel del harness: navegación a la izquierda y UNA sección a la vista — apariencia, modelos
y entornos. Tres ausencias deliberadas, todas por la misma regla («un control sin dato
detrás es la misma mentira que una lista vacía rellenada»):
- **Los `TEMAS` de `cli/tema.ts` no están**: son paletas ANSI de la consola de terminal y en
  un navegador no pintan nada. Lo que sí es real es el claro/oscuro del cliente
  (`apps/web/src/apariencia.ts`), que existe porque el CSS de deepseek trae
  `body[data-ds-dark-theme]`; se recuerda en `localStorage` —es de ESTE navegador, no de la
  cuenta— con todo acceso envuelto en `try`, porque en una ventana privada el propio
  accesor lanza.
- **No hay «proveedor personalizado»**: los proveedores son una lista CERRADA
  (`core/modelos.ts#PROVEEDORES`) y declarar uno a mano no llevaría a ninguna parte. El
  harness lo tiene porque su adaptador habla con cualquier endpoint compatible con OpenAI.
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
`.xonecode/config.json`) y no adivinando: con copia local, un botón y ya; sin ella, se pide
la rama ORIGEN y **se dice que va a descargar el proyecto entero**. Con una sola rama se
preselecciona pero se ENSEÑA — antes se mandaba sola desde un efecto, y elegir por el
usuario y callarlo es cómo se acaba trabajando sobre la rama equivocada. Y no empieza sola:
pulsar «+» por error costaba una descarga.

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

**La barra superior es de la APLICACIÓN, no de la sesión**, así que se pinta también en el
escritorio — con la marca, el estado del cable y el botón de plegar— pero **sin pestañas**:
sin sesión no hay transcript ni trayectoria a los que llevar, y unas pestañas que no llevan a
ningún sitio son el mismo botón muerto que este repo no consiente. `Cabecera` las omite
cuando no le pasan `pestana`/`alElegirPestana`.

**La barra lateral se pliega**, y el botón vive en la barra superior y no dentro de ella
—donde lo pone el mockup— por una razón práctica: plegada, la barra no está, así que su
propio botón se habría ido con ella. Al plegarse se DESMONTA (la columna del grid se va a
cero); no se esconde con `visibility`, porque una barra invisible sigue siendo tabulable y se
llega con el teclado a botones que no se ven. La preferencia se recuerda en `localStorage`
(`apps/web/src/preferencias.ts`), no en el servidor: es de ESTE navegador, como la
apariencia, y con el mismo `try` alrededor de cada acceso porque en una ventana privada el
accesor lanza.

**El centro sin sesión es el ESCRITORIO** (`Escritorio.tsx`), no un hueco con una frase
(«elige un proyecto en la barra lateral», que es lo que había). Pinta los proyectos con lo
que el servidor ya manda —si tienen copia local, sus últimas sesiones—, el entorno activo
con su URL y el modelo en vigor, y empezar es un clic. Todo lo que enseña ya viajaba por el
cable: no hay una sola tarjeta de relleno. Y **no pinta nada del mockup que no tenga dato
detrás** —el panel de dispositivos conectados, «Build & Run», el estado del ADB—: eso es un
puente con el móvil que este producto todavía no cablea (`docs/DISENO-DASHBOARD.md` lista
pieza por pieza qué se sostiene y qué no). Los dos vacíos se distinguen, además: «no hay
entorno registrado» manda a Ajustes; «el entorno no devolvió proyectos» no, porque ahí no
hay nada que configurar.

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

**La regla de qué URL de MCP vale es UNA** (`agent/cloudstudioMcp.ts#urlDeMcpAceptable`): HTTPS
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
  mapa en cada clave conocida, usa la clave del mapa como id de reserva, y sigue quedándose
  SOLO con `{id, nombre}`: la respuesta trae permisos, fechas y el correo del propietario, y
  nada de eso puede acabar en `config.json` ni en el transcript.
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
