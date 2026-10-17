# Workspace, modelos y configuración

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# El workspace: dónde viven las copias locales

`core/settings.ts` (`rutaDeWorkspace`, `dentroDelWorkspace`), `web/servidor/vestibulo.ts`
(`baseDeWorkspacePorOmision`), `core/mudanzaDeWorkspace.ts`, `agent/config/mudanzaEnDisco.ts`.

- **`<workspace>/<entorno>/<proyecto>`, y el workspace es lo ÚNICO configurable**
  (`settings.workspace`, omisión `~/.xonecode/workspace`). El segmento del ENTORNO se queda: el
  mismo nombre de proyecto existe a la vez en dos servidores.
- **La base se LEE en cada uso, nunca se captura al arrancar** (`baseDeWorkspace` es una función):
  se cambia desde Ajustes con la consola en marcha.
- **El reparto viejo se MUDA de una vez al arrancar la web**
  (`arranque.ts#mudarWorkspaceLegadoCableado`, antes del vestíbulo y del corredor de tareas).
  Proyecto a proyecto; un destino que existe NUNCA se pisa; solo lo movido de verdad reescribe una
  ruta guardada (`proyecto.raiz` del índice de tareas).
- **Cambiar el workspace MUDA lo que ya está bajado, en dos actos** (`vestibulo.mudarWorkspace`,
  `core/mudanzaDeWorkspace.ts#planDeCambioDeBase`, `agent/config/mudanzaEnDisco.ts
  #mudarBaseDeWorkspace`): `planear` dice qué se movería —por NOMBRE, sin tocar nada— y la
  pantalla lo CONFIRMA; `aplicar` COPIA a una carpeta oculta, VERIFICA fichero a fichero con
  hash, y solo entonces guarda la base, remapea `proyecto.raiz` de las tareas y borra el origen
  por lápida (lo que no se deja borrar sale como «restos»). Se niega con motivo
  (`motivoParaNoMudarWorkspace`) con un turno en vuelo, una consola de tarea o una tarea sin
  terminar bajo la base; **una consola abierta y parada no es motivo**, se cierra antes. Ocupa la
  cola del vestíbulo ENTERA mientras dura, y crear una tarea a la vez se niega.
- **La regla del workspace tiene DOS copias** (host y `Ajustes.tsx`), atadas por una tabla de casos
  compartida (`src/core/casosDeWorkspace.json`) que leen las dos suites: la del cliente se quedó
  en «empieza por /» y en Windows toda ruta salía en rojo.
- **La ruta del workspace es la excepción NOMBRADA a `sinRutas`, y la única del cable**: viaja
  ENTERA (no abreviada con `~`). El `~` se acepta al TECLEAR (`expandirConCasa`). La regla de qué
  vale (`motivoDeWorkspaceInaceptable`) se aplica en el SERVIDOR.
- **El selector de carpeta lo abre el SISTEMA, no el navegador** (`core/selectorDeCarpeta.ts`,
  `agent/config/selectorEnMaquina.ts`): `osascript`/`zenity`/el `IFileOpenDialog` de Windows por PowerShell
  (el moderno, donde se TECLEA la ruta; dueño `TopMost` y centrado a mano porque recuerda dónde se
  cerró; salida en UTF-8), solo cruza la carpeta elegida. **Y una ruta de Windows vale** (`C:\…`, `\\servidor\…`): la regla y `rutaDeWorkspace` usan las de la base,
  no siempre `posix` (IXCODE-22).
  Elegir y guardar son dos actos. **Límite declarado**: por un túnel el botón no sirve.

# Modelos, configuración y credenciales

- **Modelos por papel** (`core/modelos.ts`): `rapido`, `trabajo`, `afilado` (reservado al juez).
  Por omisión, Ollama local. Precedencia: `--modelo-<papel>` > `--modelo` > `XONECODE_MODELO` >
  proyecto > global > omisión, cada valor recuerda su `origen`.
- **`config.json` RECHAZA claves de API**; las credenciales van solo en `~/.xonecode/auth.json`
  (0600). El ESCRITOR (`agent/config/authEnDisco.ts`): una escritura nunca destruye lo que había,
  y ante un JSON roto PARA sin escribir.
- **La variable de entorno de cada proveedor vive en UN sitio**
  (`core/modelos.ts#VARIABLES_POR_PROVEEDOR`).
- **Los compatibles con OpenAI son una TABLA** (`COMPATIBLES_OPENAI`: NVIDIA, Groq, xAI). La clave
  se **EXIGE al construir** (`construirCompatibleOpenAi`).
- **Los PERSONALIZADOS son la misma tabla con la fila del usuario**: plantilla `` `custom:${string}` ``.
  Se guardan **solo en el `config.json` global**; el del proyecto se rechaza con aviso GRAVE.
- **La regla de qué URL vale es UNA** (`core/modelos.ts#motivoDeEndpointInaceptable`): HTTPS sin
  credenciales, más `http://` en una lista CERRADA de hosts loopback.
- **El catálogo VIVO es la validación de la conexión** (`agent/config/catalogoModelos.ts`).
  `ErrorCatalogoModelos` nunca lleva la clave ni el cuerpo remoto, sí el código HTTP.
- **La lista de proveedores de la pastilla es la de lo COMPROBADO**: con clave (que la clave ESTÉ)
  o sin clave (que su catálogo CONTESTÓ, probado al CONECTAR). `SIN_CREDENCIAL` tiene TRES estados
  (verde/hueco/nada).
- **Los tokens de una SESIÓN se cuentan y se enseñan, en DOS cuentas que no se suman**
  (`core/ports.ts#ConsumoDeSesionPorCuenta`, `agent/subagentes/consumoExterno.ts`, mensaje
  `consumo`, `componentes/ContadorDeTokens.tsx`). Reglas:
  - **Los dos son ACUMULADOS: se lee el último, no se suman** (entre ejecuciones sí se suma).
  - **Se suman TOKENS, nunca COSTE** (un token es un token, su precio no).
  - **La caché va aparte de la entrada** (`vendor/tokenTracking.ts`).
  - **De Codex se lee `total` y no `last`**; `reasoningOutputTokens` no se suma a la salida.
  - **Se cuenta también cuando el turno acaba en ERROR.**
  - **Ausente es «no consta» y entonces no se pinta**; se tira al caerse el cable. Un turno de
    fondo no mueve el contador de otra sesión.
  - **Con ellos viaja la VENTANA, que es otra pregunta**: `contexto` es la entrada de la ÚLTIMA
    llamada. El TOPE se resuelve con la MISMA función que la barra del terminal
    (`cli/main.ts#crearTopeDelModelo`, vía la opción `topeDeContexto`). Sin tope no se pinta
    denominador ni porcentaje. Se consulta en la BARRA (`componentes/BarraDeEstado.tsx`).
  - **Los totales de una conversación SOBREVIVEN a cerrarla**: el `fin` lleva el DELTA del turno
    (`core/actos.ts#ConsumoDeTurno`, `#sumarConsumo`, `#consumoDeLosActos`).
  - **La base histórica se lee UNA vez, al abrir, y no se vuelve a mirar** (el `.jsonl` crece por
    debajo).
  - **Un `contexto` de cero sale SIN `ventana`** (`core/ports.ts#consumoPersistible`).
  - **La cifra de un turno se pinta donde el turno se resume** (`componentes/CierreDelTurno.tsx`):
    un `{0,0}` no se pinta (`hayCosteQueEnsenar`).
  - **El total de una sesión vive en el ÍNDICE, y la barra ya NO lo pinta**
    (`EntradaIndice.consumo`, `core/actos.ts#acumularTotales`,
    `sesiones.ts#anotarConsumoDeActo`/`#sembrarConsumosPendientes`). La ventana NO entra en un
    acumulado. Un cero no se estampa; cuando la entrada aún no trae acumulado NO se suma el delta
    (se relee el `.jsonl` entero con `reabrirSesion`). La siembra
    (`sembrarConsumosPendientes`) es de PRESENTACIÓN y MONOTÓNICA: rellena solo lo que no trae
    acumulado, no da de alta lo que falte, y su fallo se TRAGA.
  - **Y POR MODELO** (`core/actos.ts#ConsumoPorModelo`, `porModelo` en el `fin`, el índice y el
    mensaje `consumo`): un especialista con `modelo:` en su `.md` corre en otro modelo que el raíz.
    La sesión de TrueForge apunta cada hilo al id con que NACIÓ y el raíz al de su papel AHORA
    (`ModelosPort.idDePapel?`, opcional); Claude Code conserva su `modelUsage` por id, Codex y
    OpenCode van a nombre del motor. Cada entrada lleva su `cuenta`, porque las dos cuentan la
    caché distinto. **Un turno sin desglose cae en `SIN_DESGLOSE` al sumar** (`desgloseDe`): las
    filas suman el total sin inventar de quién fue; si ninguno lo trae, no hay desglose. El
    contador del compositor es un BOTÓN solo con desglose y abre `DesgloseDeTokens`. **Límite
    declarado**: las llamadas que no pasan por un hilo (`describe_image`, el crítico visual, el
    juez) no cuentan en ninguna cuenta.
  Falta la vista AGREGADA por proyecto/histórico: el COSTE no se puede sumar entre cuentas.
- **El modelo en vigor lo dice el SERVIDOR** (`resolver(estadoDeSesion.fuentes).trabajo`),
  `Consola.alEstado`. **El modelo por DEFECTO es otra pregunta y otro campo** (`porDefecto` en el
  mensaje `modelos`): `actual` es el de la sesión ABIERTA, `porDefecto` el de las NUEVAS.
- **Claude se construye con tope de salida y razonamiento a mano, y las dos son datos de `core/`**
  (`topeDeSalida` en `core/contextos.ts`, `pideThinkingAdaptativo` en `core/modelos.ts`), con
  costura contra `invocationParams()` (`agent/modelos.test.ts`, sin red). El `max_tokens` por
  omisión de `@langchain/anthropic` sale de una tabla por PREFIJO; un id desconocido cae en
  `FALLBACK_MAX_OUTPUT_TOKENS` (4096) sin decirlo. **Omitir `thinking` no significa lo mismo en
  todos**: Opus 5/Sonnet 5 corren adaptativo, 4.6-4.8 corre sin pensar, Haiku 4.5 y anteriores a
  4.6 lo RECHAZAN.
- **El ESFUERZO de razonamiento es una tabla POR MODELO** (`core/esfuerzo.ts`), no por proveedor.
  `nivelesDeEsfuerzo` devuelve una LISTA; lo no reconocido devuelve `undefined` (sin control).
  **Ollama se PREGUNTA en vez de tabularse** (`/api/show`), por eso las capacidades entran por
  PARÁMETRO. En Anthropic va ACOPLADO al `thinking` (`aceptaThinkingAdaptativo` junto a
  `pideThinkingAdaptativo`). Se elige en DOS sitios que PERSISTEN: el `.md` de un subagente (gana
  sobre la sesión) y la sesión (vive en el ÍNDICE). No hay defecto global. **Y un hijo de Claude Code lo recibe como `effort`** (`PeticionExterna.esfuerzo`, selector en Ajustes con los
  cinco niveles del SDK): medido en Maset, el desarrollador en Opus pasaba casi todo su tiempo generando, y muy poco en herramientas. **El PENSAMIENTO es otro interruptor, aparte del esfuerzo** (`pensamiento: apagado|activo` en el `.md`,
`core/esfuerzo.ts#pensamientoAplicable`): «cuánto» y «si» son preguntas distintas, y en DeepSeek un nivel `low` no
frena el razonamiento (medido). Ausente decide la familia del proveedor y la clase de trabajo derivada de los
datos del agente —quien ejecuta comandos va sin pensar en DeepSeek, `claseDeTrabajo`—; solo donde el modelo lo
admite (`admiteApagarElPensamiento`); apagado manda sobre el esfuerzo. Lo demás sin decidir.
- **A DeepSeek se le dice QUIÉN pide** (`core/identidadDeProveedor.ts`,
  `agent/config/identidadEnDisco.ts`): un `user_id` en la raíz del cuerpo, del `sub` del login de
  CloudStudio, siempre como HASH. El lector real es la OMISIÓN del constructor de `Modelos`. Sin
  login no viaja.
- **Los topes de contexto solo si se saben** (`core/contextos.ts`, por familias; ollama sin tope a
  propósito).
- **La creación de proyecto al arrancar** (`core/esqueleto.ts`, `agent/config/crearProyecto.ts`):
  omisión No, datos puros de la documentación XOne, y nunca pisa un fichero existente.
- **El alta son cuatro pasos y cada uno solo aparece si falta lo que decide.** Sin TTY real se
  saltan los cuatro en `main.ts`.
- **`COMANDOS` (`cli/consola.ts`) es el registro único**: `/ayuda`, cabecera de stdio, completado
  del Tab y lista de la web se generan recorriéndolo.
