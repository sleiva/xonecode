# TrueForge

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# El segundo motor: TrueForge (rama `xonecode-trueforge`)

**deepagents es LEGACY** (`core/motor.ts`): corre las sesiones que nacieron con él, pero lo nuevo va
solo a TrueForge y en deepagents no se toca nada. Límite declarado: el aviso de adjuntos es común y
nombra `describe_image`, que deepagents no tiene.

**`describe_image` hace que el agente VEA una imagen** (`agent/grafo/describirImagen.ts`, IXCODE-23):
manda la imagen al modelo de `trabajo` en una llamada APARTE y devuelve lo que ve como texto —en un
API compatible con OpenAI el resultado de una tool es texto, y una imagen en el historial se pagaría
en cada llamada—. A todos, el raíz incluido. Misma guarda que las maquetas del crítico
(`imagenReferida` + `lectorDeReferencias`); acepta la ruta COMPLETA si cae dentro de lo montado y la
traduce a la virtual. `read_file` sobre una imagen devuelve la llamada ya escrita. El aviso de adjuntos
dice el CAMINO y no afirma nada sobre la visión: si el modelo no ve, lo dice la respuesta de la tool.

`core/motor.ts`, `agent/motores/trueforge/`, `docs/VARIANTE-TRUEFORGE-HARNESS.md`. **Se elige por
configuración y no se ve** (`"motor"` en `config.json`, `XONECODE_MOTOR`; omisión `trueforge`; una
sesión sin motor guardado se reabre con `deepagents`), y **la elección vive en UN punto,
`abrirSesionReal`**, por el que pasan la web, el terminal, `run`, el banco y los evals. Cumple el
mismo `SesionReal`, así que ninguna piel sabe cuál corre. Tres reglas: **el modelo es NUESTRO** (un
`ILLM` sobre el de LangChain, nunca su `VercelAILLM`, que perdería el `user_id`, el eco y el
esfuerzo); **las tools delegan en `backendDeAgente`** y reevalúan `permisosDe`; y **`core/` no
importa `@truefoundry/` ni `winston`** (`imports.test.ts`). **Fuera de `core/` solo lo importa UN
fichero**, `agent/motores/trueforge/trueforge.ts` (`frontera.test.ts`). **El reparto es el de
deepagents**: raíz de solo lectura y sin skills, cada especialista sale de su `.md`, y **la
aprobación de un hijo se devuelve a SU `thread_id`**. **Los de motor EXTERNO también son hijos, por
el MISMO `SubagenteExternoPort`** (`modeloExterno.ts`): un `AgentThread` de UNA llamada cuyo
«modelo» es `correr()`, sin tools ni capabilities; su llamada no cuenta como de nuestro modelo, y
un motor que falla se DEVUELVE como texto. **Parar mata al hijo** (`PeticionExterna.senal`) y
**dos hijos que escriben no corren a la vez** (`escritoresEnSerie`). **Las tools propias no se
reescriben: se ADAPTAN** (`toolsPropias.ts`), mismo reparto — `xone_navegacion` a todos. **El
verificador y su reparación también**, y el juez del turno y el crítico de pantalla con los mismos
puertos, con las reglas SACADAS del cierre de deepagents a `agent/turno/verificacion.ts`. **La
memoria en disco es la FOTO del raíz** (`memoriaTrueforge.ts`, `AgentThread.toSnapshot()`, 0600) y
**no** la capa `agent-session` de la librería. **La foto lleva VERSIÓN y se lee ESTRICTA**
(`MIGRACIONES`, `interpretarFoto`): la que no se entiende no se carga a medias — se abre sin
memoria y se APARTA con otro nombre. **Y se guarda también A MITAD de turno** (`guardarAMitad`), en
cada añadido del raíz y en cada escritura de un hijo: un corte duro no pasa por el `finally`. Lo
abierto se salda como INTERRUPCIÓN (`textoDeInterrupcion`: nombra lo escrito y manda mirar el disco),
nunca con el «vuelve a pedirlo» de un turno cortado, que duplicaría lo ya escrito. **El prompt de un hijo va en su prompt de SISTEMA por
`instructionBuilders`**. **Y al desarrollador no se le cuenta la maquinaria** (`SIN_HABLAR_DEL_HARNESS`, solo al raíz, que es quien le habla):
ni tools, ni nombres internos, ni el HANDOFF, ni la foto del arranque. **Y el idioma de la SALIDA lo dice el código** (`IDIOMA_DE_LA_RESPUESTA` al raíz,
`IDIOMA_DEL_ESPECIALISTA` a cada hijo): la identidad que añade TrueForge y las descripciones de las tools están en
inglés, y sin decirlo el texto entre herramientas salía en inglés. Es el idioma del USUARIO, no uno fijo —el raíz lo lee
de su mensaje; un hijo, que no lo ve, sigue el de su encargo—, y solo de lo que la persona LEE: el razonamiento queda libre. **Y una respuesta final que se va al CHINO se devuelve UNA vez para reescribirla** (`core/idiomaDeLaRespuesta.ts`, regla de código: proporción de ideogramas, y nunca si quien escribe usa ideogramas): medido, DeepSeek lo hizo al final de un turno largo con su razonamiento diciendo «in Spanish». La original se queda en el chat y un aviso lo dice; solo ve el chino. **Y lo que escribe ENTRE herramientas en inglés, cuando el usuario no escribe en inglés, se le RECUERDA**
(`textoEnInglesSinPedirlo`, por palabras vacías de cada idioma; `capacidadDeIdioma`): medido en Maset, en una tarea larga
pasó a escribir en inglés lo que la persona lee. Al cerrarse un mensaje suyo así, su siguiente llamada lleva un mensaje
de usuario con el idioma, como mucho `TOPE_DE_RECORDATORIOS_DE_IDIOMA` por turno; lo ya dicho no se reescribe. **El raíz puede PROPONER tareas encadenadas** (`proponer_tareas`, solo en la web; ver «Las tareas en background»).
**Una llamada con los argumentos rotos no se pierde ni se ejecuta a medias** (`modeloLangchain.ts`): la que LangChain no
pudo leer (`invalid_tool_calls`) y, con `finish_reason: "length"`, la que «reparó» cerrando un JSON cortado, van al núcleo
con sus argumentos CRUDOS, y el núcleo le devuelve al modelo el error del JSON. Antes la primera se tiraba en silencio y
la segunda se ejecutaba con el valor cortado.
**El raíz puede PREGUNTAR** (`ask_user_question`, solo él): con opciones
sale además como tarjeta con un botón por opción (`Piel.consulta?` opcional), y lo pendiente lo
decide el hilo. **Solo se compacta el raíz**: en un hijo, resumir un encargo corto y ya cacheado
costaba más que reenviarlo. **Y a un umbral que sale de la ventana de SU modelo**
(`core/contextos.ts#umbralDeCompactacion`, entre `UMBRAL_DE_COMPACTACION_MINIMO` y
`UMBRAL_DE_COMPACTACION_MAXIMO`; sin tope conocido, el mínimo de siempre), **resumiendo con el
pensamiento APAGADO** donde el modelo lo admite (`llmDeCompactacion`): la compactación SUSTITUYE el
contexto entero, y con el umbral fijo de deepagents un modelo de ventana grande compactaba cada pocas
lecturas y releía lo que acababa de leer. **Cada especialista RECUERDA sus encargos anteriores de la sesión**
(`memoriaDeEspecialistas.ts`): la librería borra un hijo al terminar y no sabe reanudarlo, así que la
siguiente encarnación arranca con SU historial (`definition.messages`) más el encargo nuevo —nunca lo que
leyeron otros—. **Dos niveles**: entero si cabe (`TOPE_COMPLETA_TOKENS`), REDUCIDO si no (lo que dijo y pidió,
lo que devolvió cada tool recortado, `TOPE_REDUCIDA_TOKENS`), y olvidado si ni así cabe. Una encarnación
viva por especialista, y un hijo que falló o al que se cortó con «Detener» no deja memoria (su historial
lleva la orden de parar).
Si ni reducido cabe, se guarda la VENTANA de lo más reciente (`ventanaDeHistorial`), no nada.
**En la reducida, sus propios ENCARGOS a otro especialista van enteros, y una llamada con un argumento largo (un
`write_file`, un `edit_file`) NO se guarda como llamada: se CUENTA en el texto («hiciste write_file sobre /x, N
caracteres») y su respuesta se quita.** El modelo repite la FORMA de sus llamadas anteriores, diga lo que diga su texto:
medido en Maset, con «principio… [recortado]» cortaba sus encargos nuevos, y con una nota de «no lo copies» la copió como
contenido de un `PLAN.md`.
Solo en memoria y por sesión; `XONECODE_SIN_MEMORIA_DE_ESPECIALISTAS=1` la apaga para comparar.
**El BUCLE del desarrollador** (encendido por omisión; `XONECODE_BUCLE_DEL_DEVELOPER=0` lo apaga): quien declara `llama` en
su `.md` recibe `create_sub_agent` y puede llamar SOLO a esos especialistas (hoy `device-controller` y `designer-xone`), y con
carpeta de artefactos también `xone_critica_visual` y `comparar_capturas`. Un nombre fuera de su lista cae al
ayudante genérico de solo lectura. El veredicto sigue siendo de un modelo aparte y el juez final del arnés
revisa igual: lo que le devuelva el de pruebas es lo que vio, no un permiso para dar el trabajo por bueno.
**Un hijo NO ARRANCA mientras el otro del que depende esté trabajando** (`espera: [designer-xone]` en el
`.md`, `esperas.ts`): se le devuelve al orquestador al instante diciendo que espera, y este lo llama de nuevo con el
informe del otro; al arrancar sabe qué dejó (nombres de `icons/`, nunca contenido). **Nunca se espera bloqueando**:
la librería no devuelve el control mientras un hilo no termine su paso, y una aprobación de escritura del otro hilo
solo se atiende al devolverlo — la primera versión, que paraba al hijo antes de cada llamada, atascó una pasada
real. `developer-xone` espera a `designer-xone`.
**Empieza por lo mínimo y se le avisa tras varias comprobaciones seguidas** (`textoDelBucle`,
`capacidadDeAvisoDeVueltas`, `UMBRALES_DE_VUELTAS`): primero una versión que se pueda ver y pulsar, no la pantalla
entera; y al llegar a cada umbral de llamadas al que ejecuta recibe UN mensaje que no dice «para» sino «cambia de
procedimiento» (hipótesis, experimento mínimo, arreglo a todos los sitios parecidos). «Tres vueltas» en un prompt no
era un contador. La regla del ciclo de vida de `getControl` vive en `NUCLEO_XONE` y en `errores-comunes.md`.
**Las capturas del conductor se cuentan** (`COMANDO_DE_CAPTURA`, `UMBRALES_DE_CAPTURAS`, el mismo
`capacidadDeAvisoDeVueltas`): su prompt ya decía que una captura no es una herramienta de diagnóstico y no bastó;
al llegar a cada umbral recibe UN mensaje —para un valor, un estado o una excepción, `getText`, `elements` y el
log; la captura es para lo visual, una por cosa que se comprueba—. Vale para quien ejecuta, con o sin el bucle.
**Y si quien maqueta es Claude Code con su shell, el bucle es SUYO** (`textoDeMaquetadorExterno`, en la nota de
delegación): compara y corrige él, así que el orquestador le da todo en un encargo, pasa el crítico una vez y solo le
encarga otra vuelta por algo bloqueante; un recurso mal hecho lo corrige él en esa vuelta. Medido en Maset: cada vuelta
nueva era un Claude Code que releía todo, con las piezas ya bien.
**Sale del bucle cuando cumple el CRITERIO DE ACEPTACIÓN de su encargo**, que el orquestador escribe medible
(casillas del plan, lo que hace la app, fidelidad al diseño), con tres vueltas como tope; devolver antes porque
«ya funciona» dejaba lo visual sin hacer. **Los traspasos de código entre agentes, acotados por el harness** (`toolsDeFichero.ts`, `informesDeHijos.ts`):
`write_file` solo CREA un `.xne`/`.js`/`.css` del proyecto —sobre uno que existe devuelve el error con el camino,
`edit_file` por ancla— porque reescribir entero es volver a teclear lo que puso el otro; un SVG, un plan o un
artefacto se siguen regenerando. `read_file` devuelve hasta `LINEAS_POR_LECTURA` acotado por
`CARACTERES_POR_LECTURA` y dice por dónde seguir. Y al terminar un hijo, quien lo llamó recibe en UN mensaje lo que
ESCRIBIÓ, contado por el harness (ficheros, ediciones, líneas; nunca contenido; un `.ttf` traído o un adjunto incorporado, como
fichero binario —sin contarlos, el informe decía «SIN escribir» y el orquestador iba al disco a comprobarlo—): el padre releía para saberlo. **Límite
declarado**: el rechazo de la reescritura llega DESPUÉS de la aprobación, porque la pone la librería antes de correr la tool.
**La pantalla la MIDE el harness tras cada prueba** (`medidaAutomatica.ts`): cuando vuelve quien ejecuta, su última
captura nueva de `/artefactos/` se mide contra la maqueta (`/diseno/screen.png`, otra imagen de `/diseno/` o de
`/adjuntos/`) con la aritmética de `comparar_capturas`, sin modelo, y quien lo llamó la recibe con el criterio
(`CRITERIO_DE_DISTANCIA`) y, si no ha pasado el crítico desde su última escritura, el recordatorio de pasarlo. La
última medida viaja también en el informe al orquestador. El prompt del bucle ya daba las herramientas y el criterio;
era texto, y quien menos lo seguía era quien más rediseños acababa necesitando. **Y el criterio incluye el ENCAJE**
(`TOLERANCIA_DE_ENCAJE`, `compararCapturas.ts#desajusteDeEncaje`): cada borde del contenido —arriba, abajo, y a los lados
la MEDIANA de las franjas, no el recuadro de la pantalla entera, que lo fija la barra de arriba— cerca del de la maqueta.
Las distancias por franjas PROMEDIAN, y un teclado que no llega al borde las pasaba. **Y antes de medir se quita el MARCO lateral de la
maqueta** (`sinMarcoLateral`): una tira de columnas de un solo color, de menos de `ANCHO_MAXIMO_DEL_MARCO` y distinta de
lo de dentro. Medido en Maset: la imagen de Stitch trae unos píxeles oscuros a cada lado, la maqueta «iba de borde a
borde» y la medida mandó ensanchar a sangre una pantalla que ya lo estaba. Una captura no lo tiene: su primera columna
cruza la barra de estado y la cabecera.
**El diseñador hace RECURSOS, no pantallas** (`designer-xone`, `escribeEn: [/icons/, /fonts/]`): iconos y fondos SVG,
las fuentes de la maqueta, y los diagramas. El layout del `.xne` y el CSS son del desarrollador, también lo que se ve mal: lo confina el PERMISO, no el
prompt, porque dos agentes turnándose en el mismo `.xne` se pisaban. `recibeBuscarIcono` admite un `escribeEn` que cubra
`icons/`; el documentador (`/doc/`) sigue sin esas tools. **Y devuelve una TABLA** (`DEVOLVER_RECURSOS`): fichero → control → atributo → tamaño →
si lleva el símbolo dentro, que el orquestador pasa tal cual al desarrollador; sin ella el orquestador revisaba los SVG y el
desarrollador abría uno por uno. **La traza guarda lo que DEVUELVE cada hijo** (`DiagnosticoDeTools.devolucion`), la otra
mitad de `delegacion`, con el mismo tope de texto.
**`xone_atributos`: un ÍNDICE DE CONSULTA RÁPIDA de los atributos por nodo** (`core/atributosXone.ts`,
`agent/grafo/atributosXone.ts`), a todos. No sustituye a la skill: se LEE de sus tablas (`REFERENCIAS_DE_ATRIBUTOS`) en
cada construcción, nunca de una copia a mano, y cada respuesta lo dice. Tres reglas para no contradecirla: donde dos
ficheros de la skill no coinciden se enseñan LOS DOS con el aviso; lo que no está en las tablas NO se da por inexistente;
y entonces la respuesta manda a la skill con el `grep` sobre `/skills/` ya escrito. El test corre contra la skill REAL. Y
a quien la tiene se le dice CUÁNDO usarla junto a su lista de tools (`USO_DE_XONE_ATRIBUTOS`): nombrada solo en la lista,
quien escribe los atributos no la usaba. No va en el `SKILL.md`, que llega también a los motores externos.
**Las pruebas del aparato van por el LOG antes que por la captura** (`xone-log-android --app`, `textoDelBucle`,
`EJECUCION_EN_LA_MAQUINA`): el desarrollador instrumenta con `console.log` —nunca `ui.showToast` ni
`appData.writeConsoleString`, legacy y mudo en Android— y encarga las pruebas FUNCIONALES (acciones y lo esperado, sin
captura) aparte de las VISUALES (una captura por ronda, `RONDAS_VISUALES` —el MISMO número que dice su prompt—, y en la última se le dice que devuelva). El
conductor lee lo que salió y saca captura solo si el log no lo decide; su aviso de capturas es `UMBRALES_DE_CAPTURAS`.
**Un `TASKS.md` se escribe con casillas o no se escribe** (`core/tareasDelPlan.ts#motivoDeTasksInaceptable`, en el
`write_file` de TrueForge): cada tarea reconocida tiene que traer sus criterios como `- [ ]`, que es lo único que
`marcar_criterios_del_plan` sabe marcar. El rechazo se devuelve con el formato. Solo al escribirlo ENTERO: editar un
plan viejo sin casillas sigue valiendo.
**Quien ejecuta no busca ficheros con la shell** (`core/shellDeAgente.ts#motivoDeComandoRechazado`, en el `execute` de
TrueForge): un `find`, un `grep -r` o un `ls -R` se DEVUELVE como error que manda a las tools `glob`, `grep` y `ls`, que
son lo mismo confinado a las rutas virtuales; si además arrancaba en la raíz, la casa o una carpeta del sistema, el aviso
lo dice. Un `grep` que filtra la salida de otro comando pasa. **Ni una ruta VIRTUAL** (`/hotswap/x`, `/EntryPoint.xne`): en
el disco no existe y el comando sale vacío sin error; se devuelve con la de verdad (`"$XONECODE_HOTSWAP/x"`, el fichero sin
barra). **Ni SQL que escribe** por `xone-hotswap` (`UPDATE`, `DELETE`, `INSERT`…): son los datos de la app y, con
replicación, del servidor; `SELECT` pasa. Es una lista de lo visto, no un filtro de shell: un límite declarado.
**Escribir con el turno en marcha es UN gesto** (IXCODE-4, solo la web): el Enter, que en
TrueForge viaja como **detener y replanificar** (`detener: true`, solo con `turnoDetenible`); el
botón aparte se quitó a petición suya. La NOTA sigue siendo el camino de lo que llega sin
`detener` (un turno que no lo admite). Las dos entran por `preLLMProcessors`
(`capacidadDeNotas`), el único punto que corre antes de CADA llamada de cada hilo. **Una nota tiene
UN dueño** (`notas.ts`): el único hijo que trabaja o el raíz; con varios en paralelo, el raíz; y el
raíz la ve siempre, como INFORMACIÓN si ya tenía dueño —repartirla a todos hizo el mismo encargo
dos veces—. **Detener NO es una nota** (`detencion.ts`): alcanza a los hijos nacidos de una llamada
del raíz ANTERIOR a pulsar, y **corta la llamada en curso de ese hijo** con su propio
`AbortController`; su modelo captura el corte y pide el resumen en el acto, así que a la librería le
llega una respuesta de texto normal (`modeloLangchain.ts#corte`). Se filtra la SALIDA, no se quitan
las tools. **Tras Parar, lo que nadie leyó no arranca otro turno**: se dice con su texto. Límites
declarados: no corta un comando de shell en curso, y un hijo de motor externo ni recibe notas ni se
detiene.
