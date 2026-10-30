# Workspace, modelos y configuración

Trozo del mapa de la raíz; el porqué medido, en `docs/DECISIONES.md`. **El código manda.**

# El workspace

`core/settings.ts` (`rutaDeWorkspace`, `dentroDelWorkspace`), `web/servidor/vestibulo.ts`,
`core/mudanzaDeWorkspace.ts`, `agent/config/mudanzaEnDisco.ts`.

- **`<workspace>/<entorno>/<proyecto>`; solo el workspace es configurable** (`settings.workspace`,
  omisión `~/.xonecode/workspace`). El segmento del entorno se queda.
- **La base se LEE en cada uso** (`baseDeWorkspace` es función), nunca se captura al arrancar.
- **El reparto viejo se MUDA al arrancar la web** (`arranque.ts#mudarWorkspaceLegadoCableado`):
  un destino existente NUNCA se pisa; solo lo movido reescribe `proyecto.raiz`.
- **Cambiar el workspace MUDA en dos actos** (`vestibulo.mudarWorkspace`, `#planDeCambioDeBase`,
  `#mudarBaseDeWorkspace`): `planear` por NOMBRE sin tocar; `aplicar` copia a oculta, verifica
  con hash, guarda la base, remapea tareas y borra por lápida («restos»). Se niega
  (`motivoParaNoMudarWorkspace`) con turno en vuelo, consola de tarea o tarea sin terminar; una
  consola parada no es motivo. Ocupa la cola del vestíbulo entera.
- **La regla tiene DOS copias** (host y `Ajustes.tsx`) atadas por `src/core/casosDeWorkspace.json`.
- **La ruta del workspace es la única excepción a `sinRutas`**: viaja ENTERA; `~` solo al teclear
  (`expandirConCasa`); `motivoDeWorkspaceInaceptable` se aplica en el SERVIDOR.
- **El selector lo abre el SISTEMA** (`core/selectorDeCarpeta.ts`,
  `agent/config/selectorEnMaquina.ts`: `osascript`/`zenity`/`IFileOpenDialog`). **Una ruta de
  Windows vale**: las funciones de ruta de la base, no `posix`. Elegir y guardar son dos actos;
  por un túnel no sirve.

# Modelos, configuración y credenciales

- **Modelos por papel** (`core/modelos.ts`): `rapido`, `trabajo`, `afilado` (juez). Omisión
  Ollama. Precedencia `--modelo-<papel>` > `--modelo` > `XONECODE_MODELO` > proyecto > global,
  con `origen`.
- **`config.json` RECHAZA claves**; van en `~/.xonecode/auth.json` (0600). `authEnDisco.ts`
  nunca destruye lo que había y ante JSON roto PARA.
- **Variable de entorno por proveedor en UN sitio** (`VARIABLES_POR_PROVEEDOR`).
- **Compatibles OpenAI = TABLA** (`COMPATIBLES_OPENAI`); clave EXIGIDA en
  `construirCompatibleOpenAi`. **Personalizados** (`custom:…`) solo en el `config.json` global; el del proyecto, aviso GRAVE.
- **Una regla de URL** (`motivoDeEndpointInaceptable`): HTTPS sin credenciales, o `http://`
  loopback de lista CERRADA.
- **El catálogo VIVO valida la conexión** (`agent/config/catalogoModelos.ts`);
  `ErrorCatalogoModelos` sin clave ni cuerpo, con código HTTP.
- **La pastilla lista lo COMPROBADO** (clave presente o catálogo que contestó); `SIN_CREDENCIAL`
  tiene TRES estados.
- **Tokens de sesión: DOS cuentas que no se suman** (`ConsumoDeSesionPorCuenta`,
  `consumoExterno.ts`, `ContadorDeTokens.tsx`):
  - ACUMULADOS: se lee el último. Se suman TOKENS, nunca coste. Caché aparte
    (`vendor/tokenTracking.ts`). Codex: `total`, no `last`; sin `reasoningOutputTokens`.
  - Se cuenta también en ERROR. Ausente no se pinta; un turno de fondo no mueve otra sesión.
  - `contexto` = entrada de la ÚLTIMA llamada; tope con `cli/main.ts#crearTopeDelModelo`; sin
    tope, ni denominador ni porcentaje. Un `contexto` cero va sin `ventana` (`consumoPersistible`).
  - El `fin` lleva el DELTA (`core/actos.ts#ConsumoDeTurno`, `#sumarConsumo`); la base
    histórica se lee una vez al abrir. Un `{0,0}` no se pinta (`hayCosteQueEnsenar`).
  - El total vive en el ÍNDICE (`EntradaIndice.consumo`, `#acumularTotales`); sin acumulado no se
    suma el delta (`reabrirSesion`). `sembrarConsumosPendientes`: presentación, monotónica, fallo
    tragado.
  - POR MODELO (`ConsumoPorModelo`, `porModelo`; `ModelosPort.idDePapel?`), cada entrada con su
    `cuenta`; sin desglose → `SIN_DESGLOSE` (`desgloseDe`). El CRÍTICO visual de TrueForge sí cuenta
    (`sesionTrueforge.ts#contarCritico`, origen `xone_critica_visual`, fuera del contraste con el motor). **Límite**:
    `describe_image` y el juez no cuentan. Falta la vista agregada: el COSTE no se suma entre cuentas.
- **El modelo en vigor lo dice el SERVIDOR**; `porDefecto` (sesiones nuevas) ≠ `actual`.
- **Claude: tope de salida y thinking son datos de `core/`** (`topeDeSalida`,
  `pideThinkingAdaptativo`), costura en `agent/modelos.test.ts`. Un id desconocido cae en
  `FALLBACK_MAX_OUTPUT_TOKENS` sin decirlo; omitir `thinking` no significa lo mismo en todos
  (Opus 5/Sonnet 5 adaptativo, 4.6-4.8 sin pensar, Haiku 4.5 y anteriores a 4.6 lo RECHAZAN).
- **ESFUERZO por MODELO** (`core/esfuerzo.ts`): lista, o `undefined` sin control. Ollama se PREGUNTA
  (`/api/show`). En Anthropic acoplado (`aceptaThinkingAdaptativo`). Persiste en el `.md` (gana) y
  en la sesión; sin defecto global. A Claude Code va como `effort` (`PeticionExterna.esfuerzo`).
  **El PENSAMIENTO es otro interruptor** (`pensamientoAplicable`, `claseDeTrabajo`,
  `admiteApagarElPensamiento`); apagado manda.
- **DeepSeek recibe `user_id` en HASH** (`core/identidadDeProveedor.ts`, `identidadEnDisco.ts`);
  sin login no viaja.
- **Topes de contexto solo si se saben** (`core/contextos.ts`; ollama sin tope).
- **Crear proyecto** (`core/esqueleto.ts`, `crearProyecto.ts`): omisión No, nunca pisa.
- **El alta: cuatro pasos, cada uno solo si falta**; sin TTY real se saltan en `main.ts`.
- **`COMANDOS` (`cli/consola.ts`) es el registro único**: `/ayuda`, stdio, Tab y la web
  se generan recorriéndolo.
