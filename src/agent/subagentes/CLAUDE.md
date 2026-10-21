# Los subagentes y los motores externos

Trozo del mapa de la raíz (`CLAUDE.md`): mapa e invariantes; el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# Los subagentes

Un `.md` con frontmatter en `.xonecode/agentes/<nombre>.md` (`core/agentes.ts`,
`agentesEnDisco.ts`). Cinco de serie se siembran al arrancar; el sufijo `-xone` viaja como
`subagent_type` a los motores externos (`device-controller` se sale a propósito).

- **La EJECUCIÓN se DECLARA en el `.md` y la lleva uno** (`ejecucion`, cierto solo con `"true"`).
  Quien la tiene NO recibe `permissions` (deepagents lanza; `perfiles.ts#montajeDeFicheros`,
  `xoneAgent.ejecucion.test.ts`), pierde `write_file`/`edit_file` y **NO es `soloLectura`** (ese
  campo también elige el modelo). Con `motor: "modelo"` y, ESTRECHA, con `claude-code`
  (`admiteEjecucion`); en Codex y OpenCode, cerrada. El comando entero sale como `detalle`
  (`resumenDeTool.ts`); precio: una ruta absoluta del comando viaja por el cable.
- **`scripts: true` NO es una shell** (`Agente.scripts`, `capacidades.ts#capacidadDeScripts`, solo TrueForge y
  `motor: "modelo"`): `ejecutar_script`, UNO de los scripts de sus skills por su nombre con la gramática de la shell
  ESTRECHA (`motivoDeComandoExternoInaceptable`) y DESPUÉS las guardas de `execute`; mismo backend con shell. No le quita
  `write_file`/`edit_file`; con `ejecucion` no se monta. `developer-xone` lo lleva y ya no llama a `device-controller`.
- **La shell NO hereda las claves de API** (`core/shellDeAgente.ts`): por la TABLA
  `VARIABLES_POR_PROVEEDOR` más el prefijo de los personalizados. AÑADE `XONECODE_SKILL_<SLUG>` por
  skill y otra para artefactos. **Límite**: un `GITHUB_TOKEN` del usuario sigue.
- **Lo que un COMANDO deja en artefactos se anuncia** (`proyecto.ts#anunciarArtefactosDeLaShell`):
  FOTO recursiva antes/después; fuera lo que `esRutaDeArtefacto` rechaza y
  `core/artefactos.ts#esBasuraDeArtefacto` (distinta de `BASURA_DEL_SO`).
- **Un Proxy sobre un backend lee contra el OBJETIVO**: `LocalShellBackend.id` (campo privado) hace
  lanzar a `Reflect.get` al MONTAR `CompositeBackend`.
- **`REGLAS_XONE`, aviso de skills que faltan y línea de aprobación: desde código**.
- **El nombre sale del FICHERO** y es SLUG (`motivoDeNombreInaceptable`): se valida al GUARDAR, al
  cargar solo se dice con `nombreSugerido`. Sin `descripcion` no carga. **`soloLectura` solo con
  `"true"`**. Un `.md` roto se salta y su motivo llega a Ajustes.
- **La siembra se marca con `.semilla.json` (hash)**, no «la carpeta existe». Lo tocado se respeta
  en la MISMA versión de serie; con una nueva se ACTUALIZA y la copia va a `.anteriores/`
  (`CARPETA_DE_ANTERIORES`). Los del usuario no los ve. `RENOMBRADOS`: la clave vieja se retira si
  sigue intacta; si se afinó, se queda y se dice.
- **De QUIÉN es un `.md` viaja por el cable** (`AgenteCargado.semilla`: ausente/`intacta`/
  `modificada`); `origen` (carpeta) no basta. Regla: «de serie Y del GLOBAL».
- **Guardar desde Ajustes CONSERVA lo que la ventana no edita**
  (`core/agentes.ts#conLoQueLaVentanaNoEdita`, `CAMPOS_FUERA_DE_LA_VENTANA`); el servidor los toma
  del agente que se tenía delante. Avisos en `problemas`: `avisoDeEjecucionConCarpetas` y
  `camposPerdidos`.
- **Un de serie no se BORRA: se RESTAURA** (`restaurarAgente`, `accion: "restaurar"`), sin escribir
  la marca. «Editado» lo dice su tarjeta, no `problemas`.
- **RENOMBRAR solo los tuyos** (`renombrarAgente`): `renameSync` y LUEGO escribir; destino existente
  es NO; la negativa la explica el CLIENTE (`informar` no llega desde el vestíbulo).
- **El prompt del orquestador se GENERA** (`xoneAgent.ts#promptOrquestador`), salvo la regla del
  encadenado de diagramas, que nombra a dos especialistas a pelo. `HANDOFF DE ANÁLISIS` es TOKEN de
  protocolo (literal en cuatro sitios).
- **La línea de una delegación dice a QUIÉN** (`subagent_type`, `resumenDeTool.ts`,
  `core/notify.ts`), **nunca la `description`**.
- **Lo que un externo CUENTA entre tools cruza como `razonamiento`**
  (`escrituraExterna.ts#opcionesDeSubagenteExterno`, `alRazonar`): solo TEXTO. Lo alimentan
  `claude-code` y `codex`, OpenCode no. Lo que HACE Codex cruza por `commandActions`
  (`actividadDeCodex.ts`), NUNCA el comando de shell.
- **El pulso dice paso y tiempo** (`Chat.tsx`, `cronometro.ts`, `clave`) desde que la LÍNEA apareció.
- **Lo que hace un EXTERNO se ve MIENTRAS** (`core/entrelazar.ts`): evento `tool` normal, nombre
  canónico, ruta VIRTUAL; solo lo que va a ocurrir. Trampa: `it.next()` UNA vez y se guarda.
- **Al hijo de Claude Code se le DICE el inventario** (`escrituraExterna.ts#inventarioDelProyecto`)
  **y dónde están `/artefactos/` y `/hotswap/`** (`textoDeCarpetasDeLaSesion`,
  `PeticionExterna.lecturas`, `lecturasDelHijo` en las DOS llaves).
- **A un externo no se le nombran tools de xonecode** (`nucleoXoneExterno`,
  `HERRAMIENTAS_DEL_EXTERNO`: reescritura por texto EXACTO, LANZA si no casa), **ni el orquestador
  se las pide en el encargo** (`notaDeDelegacion`, `textoDeMaquetadorExterno`).
- **`ToolSearch` es de LECTURA**; **listar la RAÍZ se permite** (`rutaVirtualDeEscritura`).
- **Claude Code** (`subagenteExterno.ts`) **escribe con autorización por escritura**: `canUseTool`
  en nuestro proceso. `decisionDeTool`, en orden: TRES listas (desconocido denegado), papel del
  `.md`, guardas de RUTA reaplicadas, política. Escribir: solo `Write`/`Edit` (`cambioDe()`);
  `WebFetch`/`WebSearch` y `Bash` denegados, salvo la shell ESTRECHA.
- **La shell ESTRECHA** (`core/comandoExterno.ts`, `PeticionExterna.ejecucion`): `.md` con
  `ejecucion: true` y carpeta de artefactos; UNA llamada a un script de sus skills
  (`scriptsDeLasSkills`) por nombre, sin `;`, `|`, `>`, `$`, comillas dobles ni fondo. **El hook
  contesta `ask`, nunca `allow`**. **Env de NUESTRA shell**
  (`entornoDeLaShellDelProyecto`). Lee sus dos carpetas de sesión (`dentroDeUnaLectura`, texto Y
  `realpath`); el resto de `.xonecode/` denegado. `fotoDeArtefactos` al volver. **Límites**: el aviso
  de capturas no cuenta su `Bash`; Parar no alcanza a un `adb` nieto; solo en TrueForge.
- **En Windows**: el script de Node se detecta por su primera línea (`proyecto.ts#scriptsConRuta`) y
  la SEGUNDA llave reescribe a `node '<ruta>' args` con `updatedInput`
  (`comandoExterno.ts#comandoConNode`, `EjecucionExterna.rutasConNode`) con el Node ABSOLUTO
  (`EjecucionExterna.nodeDelServidor`). **El PATH es `Path`, unido con `;`** (`entornoDeShell`,
  `plataforma`).
- **Y se le DICE su shell, y lo que no puede delegar lo hace él**
  (`comandoExterno.ts#textoDeLaShellExterna`, `agentes.ts#skillsConLasDeQuienLlama`,
  `#textoDeTrabajoSinLlamar`): línea «SHELL:» y skills de su `llama`. **Límites**: sin tope de
  vueltas, medida automática ni `validar_fichero_xone`.
- **En TrueForge, `ls`/`glob`/`grep` FILTRAN con la regla de leer** (`toolsDeFichero.ts#ejecutar`,
  `puedeLeer`).
- **Las guardas de ruta se REAPLICAN** (`escrituraExterna.ts`): `file_path` ABSOLUTO al disco
  directo. Mismas funciones, **dos veces** (texto y `realpath`); lo no comprobable, denegado.
- **La política es el `pedirAprobacion` que ya existía**
  (`#politicaDeAprobacionExterna`, `PoliticaDeEscrituraExterna` en `core/ports.ts`, fail-closed por
  TIPO): interactiva o AUTÓNOMA. Sin `pedirAprobacion` no se escribe.
- **La denegación vive en un hook `PreToolUse`** (`allow`/`deny`/`ask`), `permissionMode: default`;
  `canUseTool` repite las comprobaciones como segunda llave.
- **`settingSources: []`**. Coste: no carga el `CLAUDE.md` del proyecto ni un `apiKeyHelper`.
- **`.xonecode/planes/` es la ÚNICA puerta de `.xonecode/`** (`escrituraExterna.ts#rutaDePlanDelHijo`): un fichero
  de plan con forma de `esRutaDePlan` se LEE y se ESCRIBE sin política y aunque sea de solo lectura, como en el grafo.
  Texto Y `realpath`, con la carpeta compuesta desde la raíz canónica (un `planes` enlazado no pasa); `path` por
  parámetro para probar `win32` y `posix`. Al hijo se le dice dónde cae (`textoDeCarpetaDePlanes`): sin eso dejaba el
  plan en la raíz del proyecto.
- **LEER también lleva guarda**: `.env`, `.git`, `.xonecode` y lo de FUERA se deniegan;
  `/skills/`, `/adjuntos/` y un artefacto mal puesto sí. `Glob`/`Grep`: `path` OPCIONAL (raíz).
  **Límite**: un `Grep` sobre la raíz puede devolver líneas de un denegado.
- `soloLectura: false` vale en los TRES motores; antes, `disponible()`.
- **Un externo SIN CUOTA cae al modelo por defecto** (`core/agotamientoExterno.ts`, `agotamiento.ts`): su error
  («You've hit your session limit · resets 4:30pm (Europe/Madrid)») se reconoce y se apunta hasta la hora que dice, en
  SU zona (sin hora, `TOPE_DE_AGOTAMIENTO_MS`). Del PROCESO, no de la sesión: la cuota es de la cuenta. Mientras dure,
  `crearHijo` crea ese especialista con NUESTRO motor y su MISMO `.md` sin `modelo` ni `esfuerzo`
  (`conModeloPorDefecto`, papel por omisión). El encargo que se agotó NO se rehace solo: el orquestador lee que vuelva a
  encargarlo (`textoDeExternoAgotado`). Las dos cosas se dicen en el chat. Otro fallo no es esto. **Se ve y se quita
  en Ajustes → Motores locales**: la foto lleva `agotadoHasta` (lo añade el SERVIDOR al emitir, `arranque.ts#emitirMotores`,
  y se reemite al cambiar, `alCambiarAgotamiento`), marca en la pestaña y «Ya está restablecido» (`accion: "restablecer"`):
  no se prueba, el siguiente encargo vuelve al motor y, si sigue agotado, se vuelve a apuntar. **Límite**: solo
  TrueForge; deepagents (legacy) no.

## Codex

- **La palanca es `approvalPolicy`, no el `sandbox`** (`subagenteCodex.ts`, `escrituraDeCodex.ts`):
  `read-only` SIEMPRE; `permitirEscritura` abre `never → on-request`.
- **Pregunta y cambio llegan separados**: `item/fileChange/requestApproval` trae `itemId`, cambios de
  `item/started`. `itemId` sin item es `decline`.
- **Un item, VARIOS ficheros, UNA decisión**: concede solo si TODOS aprobados.
- Guardas: `veredictoDeRuta` sobre el `path` absoluto; `delete` y `move_path` se DENIEGAN.
- `item/commandExecution/requestApproval` siempre denegado, elicitación MCP declinada, lo demás se
  ABORTA. Nunca `acceptForSession` ni `grantRoot`.
- **El tope (`TOPE_MS`, 10 min) se PARA con una aprobación delante.**
- `codex app-server --stdio`; final en `item/completed` (`final_answer`). Sus MCP y hooks, sin filtrar.
- **Límite abierto: LEER no tiene costura en Codex** (shell del sandbox).

## OpenCode

- **Habla ACP** (`subagenteOpencode.ts`, `escrituraDeOpencode.ts`), JSON-RPC 2.0 por línea.
- `session/request_permission` trae ruta y diff (`core/diff.ts#diffDeLineas`); `once` o `reject`,
  `always` NUNCA.
- **El bucle de guardas y política es UNO** para los motores de petición
  (`#veredictoDeEscriturasExternas`/`#decisionDeEscrituraExterna`).
- **Config cerrada**: `OPENCODE_CONFIG_DIR` a `~/.xonecode/opencode` más
  `OPENCODE_DISABLE_PROJECT_CONFIG=1`, REESCRITA en cada arranque.
- **LEER se guarda por PATRÓN** (`kind: "read"` sin ruta); vistas aplanadas una a una.
- **`bash` se QUITA**; `webfetch`, `websearch`, `external_directory`, `task`, `question` denegados.
  `fs/write_text_file` es aviso; el portón es el permiso.
- Tool en `failed` no se anuncia; vacío tras rechazo, voz del harness; `session/cancel` antes de matar.
- **En FONDO no se pregunta**: la AUTÓNOMA de `consolaDeTarea.aprobacionesTui` (no `workspace-write`).

## Ajustes

- **«Node y herramientas del agente»** (`core/diagnosticoDeNode.ts`,
  `agent/config/diagnosticoDeNodeEnMaquina.ts`, `DiagnosticoDeNode.tsx`, `diagnosticoNode`): FOTO a
  mano, sin rutas (`motivoDeFallo`), **con el ENTORNO DE LOS AGENTES** (`entornoDeShell`). Incluye
  NAVEGADOR (`exportarPdf.ts#navegadoresDeWindows`). El verificador usa el `xone-linter` de NUESTRA
  dependencia (`verificador.ts#comoLanzarElSimulador`).
- **Motores locales** (`core/motoresLocales.ts`, `agent/motores/motoresLocales.ts`,
  `MotoresLocales.tsx`, `motorLocal`/`motoresLocales`): mide el binario que LANZA el SDK; la prueba
  por el MISMO puerto. Con clave de Anthropic heredada, DOS caminos dichos aparte. `auth login` sin
  TTY, código a `stdin`. **Ni correo ni enlace cruzan; el `codigo` SÍ** (un uso, PKCE). Sin
  «Cerrar sesión» ni login con sesión iniciada. Codex y OpenCode: medir, probar y guía. **Windows: el NATIVO tras el `.cmd`** (`ejecutableEnWindows.ts`).
  **Modelo de OpenCode en su tarjeta** (`settings.modeloDeOpencode`, leído en cada encargo en
  `correrOpencode`; el `modelo:` del `.md` manda); lista de `opencode models` sin filtrar.
