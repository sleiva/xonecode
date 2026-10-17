# Los subagentes y los motores externos

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# Los subagentes

Un subagente es un `.md` con frontmatter en `.xonecode/agentes/<nombre>.md`
(`core/agentes.ts`, `agent/subagentes/agentesEnDisco.ts`). Los cinco de serie —`consultant-xone`,
`analyst-xone`, `developer-xone`, `designer-xone`, `device-controller`— se siembran al arrancar. El
sufijo `-xone` viaja como `subagent_type` a los motores externos, donde el hijo tiene sus propios
agentes. `device-controller` se sale de esa convención a propósito; en un motor externo solo
ejecuta si es Claude Code, con la shell ESTRECHA (ver abajo). Reglas duras:

- **La EJECUCIÓN de comandos se DECLARA en el `.md` y la lleva uno solo** (`ejecucion`, cierto
  solo con exactamente `"true"` — trampa del `"false"` de CloudStudio, que aquí concedería la
  máquina). Una shell no pasa por `permisosDe` ni por `virtualMode`; deepagents LANZA al combinar
  `permissions` con un backend ejecutable, así que quien la tiene NO recibe `permissions`
  (`perfiles.ts#montajeDeFicheros`, cableado mirado desde fuera en `xoneAgent.ejecucion.test.ts`).
  Se le quitan `write_file`/`edit_file`. **Y quien ejecuta NO es `soloLectura`**: ese campo
  también ELIGE EL MODELO (`rapido` vs `trabajo`), así que marcarlo miente dos veces. **Con
  `motor: "modelo"` y, ESTRECHA, con `claude-code`** (`admiteEjecucion`); en Codex y OpenCode la
  shell sigue cerrada. Se compensa VIÉNDOLO: el
  comando entero sale como `detalle` del evento (lista blanca de `resumenDeTool.ts`); precio
  declarado: una ruta absoluta que el modelo escriba en su comando viaja por el cable.
- **La shell NO hereda las claves de API** (`core/shellDeAgente.ts`, puro): se quitan por la TABLA
  (`VARIABLES_POR_PROVEEDOR`) más el prefijo de los personalizados, no por una lista a mano. Se
  AÑADE una variable por skill montada (`XONECODE_SKILL_<SLUG>`) y otra para los artefactos.
  **Límite declarado**: quita las NUESTRAS; un `GITHUB_TOKEN` del usuario sigue ahí.
- **Lo que un COMANDO deja en la carpeta de artefactos también se anuncia**
  (`proyecto.ts#anunciarArtefactosDeLaShell`): se compara una FOTO de la carpeta antes/después, no
  lo que el comando diga, y esa foto es RECURSIVA (un `unzip` deja un árbol). No se anuncia lo que
  `esRutaDeArtefacto` rechazaría, ni la basura que un zip arrastra
  (`core/artefactos.ts#esBasuraDeArtefacto`, distinta de `BASURA_DEL_SO`).
- **Un Proxy sobre un backend lee contra el OBJETIVO, no contra el proxy**: `LocalShellBackend.id`
  es un getter sobre un campo PRIVADO, y `Reflect.get` lanza al leerlo desde el constructor de
  `CompositeBackend` — el fallo es al MONTAR, no al usar.
- **`REGLAS_XONE` se antepone SIEMPRE desde código**, igual que el aviso de skills que faltan y la
  línea de que las escrituras se aprueban: no editable desde un `.md`.
- **El nombre sale del FICHERO**, no del frontmatter, y es un SLUG (`motivoDeNombreInaceptable`).
  Se valida al GUARDAR y solo se DICE al cargar, con el nombre que sí valdría (`nombreSugerido`).
  Sin `descripcion` no se carga. **`soloLectura` solo es cierto con exactamente `"true"`** — misma
  trampa del `"false"` de CloudStudio, que aquí concedería ESCRITURA.
- **La marca de la siembra es `.semilla.json` con el hash de lo que escribimos**, no «la carpeta
  existe»: un agente nuevo o corregido alcanza a quien ya arrancó sin resucitar lo que el usuario
  borró. **Lo que tocó se respeta dentro de la MISMA versión de serie; con una versión nueva se
  ACTUALIZA** y su copia va a `.anteriores/` (`CARPETA_DE_ANTERIORES`): los de serie son de xonecode
  y los trae cada versión. Los agentes que crea el usuario no son de serie y la siembra no los ve. Un renombrado tiene caso propio (`RENOMBRADOS`): la clave vieja de la
  marca se RETIRA con su fichero si sigue intacta, y si el usuario la afinó se queda y se dice.
- **De QUIÉN es un `.md` viaja por el cable, y no es su carpeta** (`AgenteCargado.semilla`): tres
  estados —ausente, `intacta`, `modificada`—, porque `origen` (la carpeta) no basta: un subagente
  propio también vive en la global. La regla es «de serie Y del GLOBAL».
- **Guardar desde Ajustes CONSERVA lo que la ventana no edita** (`core/agentes.ts#conLoQueLaVentanaNoEdita`,
  `CAMPOS_FUERA_DE_LA_VENTANA`: `escribeEn`, `llama`, `espera`, `pensamiento`). No viajan por el cable, y el guardado los
  BORRABA: medido en Maset, el diseñador perdió su límite de carpetas y, con «Ejecuta comandos» marcado, escribió sus
  SVG por la shell. El servidor los toma del agente que la persona tenía delante. Dos avisos en la lista, por
  `problemas`: un agente con shell y `escribeEn` (`avisoDeEjecucionConCarpetas`: la shell no respeta ese límite y se le
  quitan las tools de escribir), y un de serie editado al que ya le faltan (`camposPerdidos`), con el arreglo, restaurarlo.
- **Un de serie no se BORRA: se RESTAURA** (`restaurarAgente`, `accion: "restaurar"`). Borrarlo no
  devolvía el de serie (la marca recuerda que se entregó). `restaurarAgente` no escribe la marca:
  la reanota la siembra siguiente. «Este de serie está editado» ya no va por `problemas` (que
  pintaba rojo un agente que funciona perfectamente): lo dice su tarjeta, con el botón que lo
  arregla al lado.
- **RENOMBRAR es solo para los tuyos** (`renombrarAgente`): el nombre de un de serie lo ata a la
  marca por NOMBRE, así que moverlo lo vuelve un subagente del usuario. `renameSync` y LUEGO
  escribir; un destino que existe es un NO (de serie o del usuario); la negativa se EXPLICA en el
  CLIENTE porque `informar` no llega al navegador desde el vestíbulo.
- **El prompt del orquestador se GENERA** de la lista (`xoneAgent.ts#promptOrquestador`). Lo que
  NO se genera es la regla del encadenado de diagramas, que nombra a dos especialistas a pelo: al
  renombrarlos hay que cambiarlos ahí. `HANDOFF DE ANÁLISIS` es un TOKEN de protocolo, no una
  referencia a un agente (literal en cuatro sitios).
- Un `.md` roto se salta y su motivo viaja por el cable hasta Ajustes.
- **La línea de una delegación dice a QUIÉN** (`task` → `subagent_type`, lista blanca de
  `resumenDeTool.ts` + icono/verbo en `core/notify.ts`), **nunca la `description`** (el encargo
  entero).
- **Lo que un agente externo CUENTA entre dos tools también cruza**, como `razonamiento`
  (`escrituraExterna.ts#opcionesDeSubagenteExterno`, `alRazonar`): solo bloques de TEXTO, nunca
  `tool_use`. **Límite declarado**: lo alimentan `claude-code` y `codex`; OpenCode todavía no. Lo
  que HACE Codex también cruza (`actividadDeCodex.ts`), por su propia clasificación de comandos
  (`commandActions`) y NUNCA del comando de shell (lleva la ruta de la máquina).
- **El pulso DICE en qué paso está y cuánto lleva en él** (`Chat.tsx`, `cronometro.ts` con
  `clave`): se mide desde que la LÍNEA apareció, no desde el total del turno.
- **Lo que hace un agente EXTERNO se ve MIENTRAS lo hace** (`core/entrelazar.ts`): evento `tool`
  NORMAL con nombre canónico (`Read` → `read_file`) y ruta VIRTUAL, intercalado por un generador
  MIENTRAS ocurre, y **solo cuenta lo que va a ocurrir** (una tool denegada no se anuncia).
  Trampa: `it.next()` se pide UNA vez y se guarda.
- **Un hijo de Claude Code NO puede enumerar la carpeta, así que se le DICE**
  (`escrituraExterna.ts#inventarioDelProyecto`): sus rutas virtuales van en las instrucciones.
  **Y se le dice dónde están `/artefactos/` y `/hotswap/` en el disco, que LEE aunque no ejecute**
  (`textoDeCarpetasDeLaSesion`, `PeticionExterna.lecturas`, sumadas por `lecturasDelHijo` en las DOS llaves): el
  orquestador le pasa la maqueta por su ruta virtual, y medido en Maset el analista contestó «no he podido leerla».
- **A un motor externo no se le nombran tools de xonecode** (`nucleoXoneExterno`, `HERRAMIENTAS_DEL_EXTERNO`): recibe
  el núcleo con esas líneas reescritas por texto EXACTO —si el núcleo cambia y una no casa, LANZA— y una línea que dice
  qué hacer con una tool que su `.md` o su encargo nombren y él no tiene. Medido: el desarrollador en Claude Code
  buscaba `comparar_capturas` y `validar_fichero_xone` con `ToolSearch`. **Y el orquestador tampoco se las pide en el
  encargo** (`notaDeDelegacion`, `textoDeMaquetadorExterno`): con el desarrollador en Claude Code, el «BUCLE DEL
  DESARROLLADOR» le da un criterio visual sin herramientas («que coincida con la maqueta»); medido en Maset, copiaba
  «pásala a `comparar_capturas` y a `xone_critica_visual`» y el hijo volvía diciendo que no las tenía.
- **`ToolSearch` es de LECTURA** y **listar la RAÍZ se permite** (`rutaVirtualDeEscritura` la
  descarta porque no es un fichero que escribir).
- **Motores externos**: `claude-code` (`agent/subagentes/subagenteExterno.ts`) **escribe, y cada
  escritura pasa por una autorización** — `canUseTool` asíncrono, corre en nuestro proceso, sin
  `interrupt()` ni reejecutar el nodo. `decisionDeTool`, en orden: **TRES listas** de tools
  (lectura/escritura/denegadas, desconocido denegado), el papel del `.md`, las **guardas de RUTA
  reaplicadas**, la política. Escribir son **solo `Write` y `Edit`** (las únicas que encajan en
  `cambioDe()`); `WebFetch` y `WebSearch` se deniegan, y `Bash` también salvo la shell ESTRECHA.
- **La shell ESTRECHA de Claude Code** (`core/comandoExterno.ts`, `PeticionExterna.ejecucion`):
  solo para un `.md` con `ejecucion: true` y con carpeta de artefactos. UNA llamada a uno de los
  scripts EJECUTABLES de sus skills (`scriptsDeLasSkills`), por su nombre y sin ruta, con
  argumentos sueltos o entre comillas simples; nada de `;`, `|`, `>`, `$`, comillas dobles ni
  segundo plano. **El hook contesta `ask`, nunca `allow`**: medido, un `allow` del hook es una
  pre-aprobación y el SDK ya no consulta `canUseTool`; con `ask` la segunda llave recibe el
  comando EXACTO y lo vuelve a comprobar. **El hijo corre con el `env` de NUESTRA shell**
  (`entornoDeLaShellDelProyecto`): medido, su Bash lo respeta —los `scripts/` en el PATH, ninguna
  `*_API_KEY`— y autentica con su login sin la clave. **Lee además sus dos carpetas de la
  sesión** (artefactos y hotswap, `dentroDeUnaLectura`: texto Y `realpath`), el resto de
  `.xonecode/` sigue denegado. Lo que deja en `/artefactos/` se anuncia al volver
  (`fotoDeArtefactos`). **Límites declarados**: el aviso por número de capturas cuenta nuestro
  `execute` y no su `Bash`; Parar mata al `claude`, no a un `adb` nieto; solo en TrueForge.
  **En Windows el script no se lanza por su nombre** (ni shebang ni bit de ejecución): la lista cuenta un script de Node
  por su primera línea (`proyecto.ts#scriptsConRuta`) y la SEGUNDA llave reescribe el comando ya admitido a
  `node '<ruta>' args` con `updatedInput` (`comandoExterno.ts#comandoConNode`, `EjecucionExterna.rutasConNode`). El hijo
  sigue escribiendo `xone-hotswap screen`; la ruta la pone el código. Medido en la máquina Windows de un usuario: sin esto
  la lista salía vacía y el desarrollador se quedaba sin shell. La reescritura, medida con el SDK en macOS. **Y se lanza
  con el Node ABSOLUTO del servidor** (`EjecucionExterna.nodeDelServidor`): medido con 0.38.37 en Windows, el Git Bash del
  hijo contestaba «node: command not found». **El PATH de la shell, en Windows, es `Path` y se une con `;`**
  (`entornoDeShell`, `plataforma`): se buscaba `PATH`, se creaba otra variable solo con los scripts y unida con `:`, y el
  device-controller acababa rehaciendo el PATH a mano en cada comando (1156 en la traza de ese usuario).
- **En TrueForge, `ls`, `glob` y `grep` FILTRAN lo que devuelven con la regla de leer**
  (`toolsDeFichero.ts#ejecutar`, `puedeLeer`): el permiso se comprobaba solo sobre su `path` —la raíz por
  omisión— y un `glob` de `/.xonecode/**` listaba los nombres de lo denegado. Leer ya estaba denegado.
- **Y se le DICE qué shell tiene, y lo que no puede delegar lo hace él** (`core/comandoExterno.ts#textoDeLaShellExterna`,
  `core/agentes.ts#skillsConLasDeQuienLlama`, `#textoDeTrabajoSinLlamar`): su prompt lleva la línea «SHELL:» con sus scripts
  exactos (o «no tienes ninguna» si su `.md` concede ejecutar y sus skills no traen scripts), y como corre en otro proceso
  y no puede llamar a nuestros especialistas, recibe también las skills —y los scripts— de los agentes de su `llama`, con
  la instrucción de desplegar, capturar y comparar él mismo la captura con la maqueta abriéndolas con `Read` (las VE).
  Medido en Maset: el desarrollador en Claude Code no tenía ningún script ni sabía de su shell, y no pudo probar nada.
  **Límites declarados**: ni el tope de vueltas ni la medida automática le alcanzan, y `validar_fichero_xone` tampoco.
- **Las guardas de ruta hay que REAPLICARLAS** (`agent/subagentes/escrituraExterna.ts`): el
  `file_path` del hijo es ABSOLUTO y va al disco directo, sin pasar por `permisosDe`,
  `virtualMode`, vistas aplanadas ni guardas de artefactos/descargas. Las MISMAS funciones, **dos
  veces** —texto y `realpath`—. Lo que no se puede comprobar se deniega.
- **La política es el `pedirAprobacion` que YA existía**, traducido
  (`escrituraExterna.ts#politicaDeAprobacionExterna`, `PoliticaDeEscrituraExterna` en
  `core/ports.ts`, fail-closed por TIPO): la INTERACTIVA de las tres pieles y la AUTÓNOMA de una
  tarea de fondo. Sin `pedirAprobacion` no hay política y no se escribe.
- **La denegación de verdad vive en un hook `PreToolUse`, no en `canUseTool`**: contesta las TRES
  clases —`allow`/`deny`/`ask`—. `permissionMode` es `default` (el único donde el `ask` del hook
  llega al callback). `canUseTool` conserva las MISMAS comprobaciones como segunda llave.
- **`settingSources: []`, ni los del proyecto ni los del usuario**: por omisión se carga el
  `.claude/settings.json` del proyecto (viene de CloudStudio), y los del usuario le metían al hijo su hook de inicio,
  sus plugins, sus MCP y sus reglas `allow`. El login no depende de ellos (medido). Coste: el hijo no carga el
  `CLAUDE.md` del proyecto, y un `apiKeyHelper` en los ajustes del usuario deja de valer.
- **LEER también lleva guarda de ruta**: `.env`, `.git`, `.xonecode` (con `checkpoint.sqlite`) y lo
  de FUERA del proyecto se deniegan; `/skills/`, `/adjuntos/` y un artefacto mal puesto SÍ se leen.
  `Glob`/`Grep` llevan `path` OPCIONAL (ausente es la raíz). **Límite declarado**: un `Grep` sobre
  la raíz puede devolver líneas de un fichero denegado.
- Un `.md` con `soloLectura: false` se acepta en los TRES motores; se comprueba `disponible()`
  antes de montarlo.
- **En Codex la palanca de la escritura es el `approvalPolicy`, no el `sandbox`**
  (`agent/subagentes/subagenteCodex.ts`, `escrituraDeCodex.ts`). Sandbox `read-only` SIEMPRE;
  `permitirEscritura` abre `approvalPolicy: never → on-request`.
- **Lo que se pregunta y lo que se decide llegan en mensajes distintos**:
  `item/fileChange/requestApproval` trae solo `itemId`, cambios vistos antes en `item/started` (de
  ahí el registro de items). Un `itemId` sin item es `decline`.
- **Un item puede traer VARIOS ficheros y se contesta con UNA decisión**:
  `PoliticaDeEscrituraExterna` toma una LISTA, concede solo si TODAS vienen aprobadas.
- **Las guardas de ruta son las MISMAS** (`veredictoDeRuta` sobre el `path` absoluto). `delete` y
  `move_path` se DENIEGAN (`cambioDe` no compone su diff).
- **Los otros huecos**: `item/commandExecution/requestApproval` se deniega SIEMPRE, una
  elicitación de MCP se declina por `action`, y lo que no se sabe decir que no se ABORTA. Nunca
  `acceptForSession` ni `grantRoot`.
- **El tope del motor externo (`TOPE_MS`, 10 min) se PARA mientras una aprobación está delante de
  alguien**: mide «no contesta», no el tiempo de revisión humana.
- El resto del protocolo: `codex app-server --stdio` con JSON por línea; respuesta final en
  `item/completed` con `agentMessage` de fase `final_answer`. El hijo es el Codex DEL USUARIO, con
  sus MCP y hooks: xonecode no los filtra.
- **OpenCode es el TERCER motor, y habla por ACP** (`agent/subagentes/subagenteOpencode.ts`,
  `escrituraDeOpencode.ts`). ACP: JSON-RPC 2.0 por línea sobre stdio.
- **Su petición trae TODO en un solo mensaje**: `session/request_permission` lleva
  `toolCall.locations[].path` y `content:[{type:"diff", path, oldText, newText}]`, que entran
  directos en `core/diff.ts#diffDeLineas`. Se contesta `once` o `reject`; `always` NUNCA se manda.
- **El bucle de guardas y política es UNO y lo comparten los dos motores de petición**
  (`escrituraExterna.ts#veredictoDeEscriturasExternas`/`#decisionDeEscrituraExterna`).
- **TRES puertas por las que el proyecto podía mandar sobre opencode** —`opencode.json` del
  proyecto, un plugin del proyecto, la config global del usuario— se cierran con
  `OPENCODE_CONFIG_DIR` apuntando a una carpeta NUESTRA (`~/.xonecode/opencode`) más
  `OPENCODE_DISABLE_PROJECT_CONFIG=1`. Configuración REESCRITA en cada arranque.
- **En OpenCode la LECTURA se guarda por PATRÓN, no por código**: su permiso `kind: "read"` llega
  sin ruta. Las vistas aplanadas se enumeran UNA A UNA en esa lista.
- **`bash` no se deniega: se le QUITA la tool**. Con `webfetch`, `websearch`,
  `external_directory`, `task`, `question` denegados. **`fs/write_text_file` NO es la escritura**:
  es un aviso; el único portón es el permiso.
- **Una tool que acaba en `failed` no se anuncia.** **Una respuesta vacía tras un rechazo** se dice
  con voz del harness, nunca `""`. ACP tiene `session/cancel` antes de matar al hijo.
- **Límite declarado, y es el que queda abierto: LEER no tiene costura en Codex.** Lee por la
  shell del sandbox, que en `read-only` no pide permiso a nadie.
- **En una tarea de FONDO no se le pregunta a nadie**, misma `PoliticaDeEscrituraExterna`,
  montada por la AUTÓNOMA de `consolaDeTarea.aprobacionesTui` — por eso NO se hizo con
  `workspace-write`, para que las guardas de ruta sigan enteras.

- **Ajustes → General → «Node y herramientas del agente»** (`core/diagnosticoDeNode.ts`,
  `agent/config/diagnosticoDeNodeEnMaquina.ts`, `componentes/DiagnosticoDeNode.tsx`, mensaje `diagnosticoNode`): una FOTO
  pedida a mano de lo que el agente necesita en ESTA máquina —el Node del servidor, `node` en el PATH, cuántos scripts de
  las skills se detectan y si uno arranca con la MISMA llamada que haría el agente, `xone-simulator` y el Claude Code del
  SDK—. Ninguna ruta cruza: versiones y, si falla, el `code` o una frase fija (`motivoDeFallo`). **Se mide con el ENTORNO
  DE LOS AGENTES** (`entornoDeShell`), no con el del servidor: medido en Windows, daba verde mientras el hijo contestaba
  «node: command not found». **Y dice si hay NAVEGADOR para medir la maqueta**: en Windows el crítico solo conocía rutas de macOS y
  Linux, decía «no hay Chrome ni Chromium» y comparaba contra una descripción; ahora busca Edge, Chrome, Chromium y Brave
  en las carpetas de programas de las variables (`exportarPdf.ts#navegadoresDeWindows`). Nació de un paquete de
  soporte de Windows: sin scripts para el hijo y «xone-simulator no está instalado» con el programa dentro del paquete.
  **Y el verificador usa el `xone-linter` de NUESTRA dependencia** (`verificador.ts#comoLanzarElSimulador`, su `dist/cli.js`
  con el Node de xonecode); el del PATH solo si falta.
- **Ajustes → Motores locales dice si cada motor externo está listo, y deja iniciar la sesión de
  Claude Code y PROBARLOS** (`core/motoresLocales.ts`, `agent/motores/motoresLocales.ts`,
  `componentes/MotoresLocales.tsx`, mensajes `motorLocal`/`motoresLocales`). Se mide el binario que
  LANZA el SDK, no el del PATH. La prueba va por el MISMO puerto que un subagente, y con una clave de
  Anthropic heredada son DOS caminos (sin ejecución factura a la clave, con ejecución usa el login),
  que se dicen por separado. `auth login` corre sin TTY y el código pegado va a su `stdin`. **Ni el
  correo de la cuenta ni el enlace de autorización cruzan el cable**: el navegador lo reabre el
  servidor. **El código que la web enseña SÍ cruza** (`motorLocal` con `codigo`, segundo secreto
  del cable tras `leerSecreto`): es de un solo uso y está atado al reto PKCE, cuyo verificador no
  sale del hijo. Sin «Cerrar sesión» ni login con sesión ya iniciada: los dos tocarían todos los
  Claude Code de la máquina. Codex y OpenCode:
  medir, probar y guía; su login sigue sin medir. **En Windows se lanza el NATIVO que hay detrás del
  `.cmd` de npm** (`agent/subagentes/ejecutableEnWindows.ts`): sin shell, `spawn` no ve un `.cmd`
  (`ENOENT` con «Listo» en la medida), y con shell Parar mataría a `cmd.exe` y no al hijo. OpenCode
  apunta a un `.exe`; Codex a un `codex.js` que lanza el `codex.exe` de su paquete de plataforma, y se
  busca ese con la misma regla (lanzar `node` tampoco: matarlo no alcanza al nieto). Medidos los dos.
  **El modelo de OpenCode se ELIGE en su tarjeta y lo guarda el servidor**
  (`settings.modeloDeOpencode`, acción `modelo` de `motorLocal`): con nuestra configuración cerrada y
  sin modelo, OpenCode coge uno de su tier gratuito, que no contesta fuera de su consola. Lo usan la
  prueba y todo subagente sin `modelo:` en su `.md` (que manda), leído en CADA encargo dentro de
  `correrOpencode`, así que la prueba y el subagente van por el mismo camino. La lista es la de
  `opencode models`, sin filtrar por nombre: lo que falla es el PROVEEDOR `opencode` sin credencial,
  no el sufijo `-free`.
