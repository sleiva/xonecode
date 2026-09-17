# Las fortalezas de DeepSeek Harness, acotadas a xonecode

Este documento es la lista de **qué propiedad de DeepSeek Harness (DSH) merece entrar en
xonecode, con qué medida se justifica y dónde aterriza**. No es una comparación de harnesses:
eso está decidido. xonecode es el harness, sobre `deepagents` de LangChain, y de DSH se toma la
propiedad arquitectónica, nunca el framework. Y como xonecode es específico de XOne, cada
propiedad se puede acotar: donde DSH necesita un registro extensible por terceros, aquí basta
una tabla cerrada.

Está escrito para implementarse después, así que cada adopción lleva el caso que la justifica,
la forma propuesta y el sitio del código. Ante una discrepancia entre este documento y el
código, el código manda.

## De dónde sale esto

| Fuente | Qué aporta |
|---|---|
| `/Users/projects/harnees/deepseek-harness` | `docs/architecture.md` (Cordis, perfiles, seams, flujo de turno), `docs/subsystems/subagent.md` (el contrato de proveedor), `AGENTS.md` (las convenciones: «model-visible ⟺ logged», qué es un invariante válido) |
| `lab/src/xone-harnees` y `lab/src/xone-studio-agent` | Los dos bancos de pruebas con los que se extrajo esto. Verdes, y **sin un solo commit**: la rama `main` de `harnees-guide` está vacía |
| `lab/src/xonecode/ARQUITECTURA-INSPIRADA-EN-DEEPSEEK-HARNESS.md` | La propuesta para xonecode. De sus seis pendientes, cuatro están hechos (transcript JSONL, juez con presupuestos y huella de no-progreso, aprobación de subida, recuperación de interrupciones) |

Los dos laboratorios son el **instrumento**, no candidatos: 2.596 y 2.257 líneas frente a las
115.801 de xonecode. Su papel a partir de aquí es banco de pruebas de un salto de versión de
`deepagents` —xonecode fija la suya y toca la frontera con `config as never`—, y para eso hay
que commitearlos, porque hoy están a un `rm` de desaparecer con sus documentos medidos dentro.

## Lo que DSH hace y NO se toma

Todo en DSH es plugin Cordis: un `dsh` que corre es un árbol compuesto al arrancar por capas
ordenadas —cada bundle del perfil, el `cordis.patch.yml` del perfil, el del home, el `--patch`—
donde cada fila tiene id y un patch reemplaza su configuración entera. Es extensibilidad para
terceros, y ya se descartó con su porqué en `ANALISIS-MIGRACION.md`: aquí la composición es
explícita en TypeScript (puertos inyectados, `decidirPiel`, factories). Nada de esto se revisa.

## Lo que ya está: el *seam*, completo

En DSH una capacidad intercambiable son **tres papeles** —definición del servicio, proveedor y
consumidor—; uno solo no es un seam, y añadir una capacidad es diseñar los tres. El de
subagentes es `ctx.subagents`, con varios proveedores conviviendo **por nombre** (`spawn`,
`fork`, `acp`, `codex`, `claude-code`, `dsh-sdk`).

xonecode tiene ese seam, ya acotado: `Motor = modelo | claude-code | codex | opencode`
(`core/agentes.ts`), `esMotor` rechaza un nombre que no existe diciendo los que hay, y
`disponible()` se comprueba antes de montar el especialista —porque uno que el orquestador puede
elegir y que revienta al elegirlo es un botón muerto dentro del grafo, y el que lo pulsa es el
modelo, que se lo cree—. Eso no hay que hacerlo: está hecho.

Lo que falta es la otra mitad del mecanismo de DSH.

## Adopción 1 — el descriptor de capacidades por motor

### La regla de DSH

Un proveedor publica sus capacidades de arranque en un **descriptor estático**
(`SubagentCapabilities`: `agentOptions`, `outputSchema`, `depthLimit`, `toolFilter`, `persona`)
que el servicio comprueba **antes** de llamar a `start()`. Una petición que pida algo que ese
proveedor no tiene se rechaza con `SubagentError('UNSUPPORTED_CAPABILITY')`. La convención está
escrita con estas palabras: *fail loud, no silent degradation* — **nunca aceptar y luego
ignorar**. El segundo mecanismo es que la **presencia del método ES la capacidad**
(`prepareContinuable?`), con el estrechamiento de TypeScript como descubrimiento.

Un detalle que conviene copiar tal cual: `inheritsParentContext` es **descriptivo, no
autoridad**. Existe solo para que el texto que lee el modelo sea verdad, y el doc lo dice
explícitamente: no implica heredar tools, servicios ni permisos.

### El caso medido en xonecode

`agent/grafo/xoneAgent.ts` tiene dos ramas, y las dos leen el MISMO conjunto: `catalogoDeSkills`
(`xoneAgent.ts:228`) es el catálogo entero, sin filtrar por motor. La interna
(`motor === "modelo"`) pasa además `skills: rutasDeSkills(perfil, catalogoDeSkills)`
(`xoneAgent.ts:296`) — el montaje real de `/skills/<skill>/` para `SkillsMiddleware`. La externa
(`xoneAgent.ts:243`) **no monta nada**, pero construye sus instrucciones con el mismo
`promptDeAgente(agente, repartirSkills(agente, catalogoDeSkills))` (`xoneAgent.ts:265`), y ese
prompt emite la línea, sin mirar el motor (`core/agentes.ts:99`):

```
Tus skills: xone-development, … . Cárgalas antes de responder.
```

Las skills viven en `RAIZ_SKILLS` = `<repo de xonecode>/skills` (`agent/grafo/skills.ts`), **fuera del
proyecto**, que es justo donde `veredictoDeLectura` deniega leer a un hijo externo. Y el hijo de
Codex o de Claude Code carga **sus propias** skills, no las nuestras (`settingSources: ["user"]`).

O sea: a un `.md` con `motor: codex` y `skills: [xone-development]` se le **ordena cargar algo
que no puede alcanzar**. El parser lo acepta sin un `problemas` y ningún test cruza las dos
cosas. Es el `UNSUPPORTED_CAPABILITY` de DSH, aceptado e ignorado, y el síntoma es el del
dominio: no da error, da un especialista que inventa o que contesta que no encuentra nada. La
regla contra la que existe este harness —«XOne ignora en silencio lo desconocido»— la estaba
repitiendo el harness.

### La forma propuesta

Una tabla CERRADA en `core/` (puro, sin `agent/`), con los campos que aquí existen de verdad. Dos
no son booleanos, porque lo medido no es booleano:

```ts
/** Qué puede de verdad cada motor. Tabla cerrada: no la amplía un `.md`. */
export interface CapacidadesDeMotor {
  /** Las skills del catálogo se le pueden MONTAR. */
  skills: boolean;
  /** Acepta el `modelo:` del `.md`. */
  modelo: boolean;
  /** Puede escribir, con autorización por escritura. */
  escritura: boolean;
  /** Cómo se guarda su LECTURA. `ninguna` es un límite declarado, no un olvido. */
  lectura: "codigo" | "patron" | "ninguna";
  /** Cómo se le para el trabajo en vuelo. */
  cancelacion: "protocolo" | "senal" | "matar";
}

export const CAPACIDADES_POR_MOTOR: Record<Motor, CapacidadesDeMotor> = { … };
```

Los valores, con su medida y su sitio:

| motor | skills | modelo | escritura | lectura | cancelación |
|---|---|---|---|---|---|
| `modelo` | sí (`rutasDeSkills`) | sí (papel `trabajo`) | sí (HITL en `write_file`/`edit_file`) | `codigo` (`permisosDe` + `virtualMode`) | `protocolo` (`SesionReal.cancelar()` aborta el stream) |
| `claude-code` | **no** (catálogo fuera del proyecto; carga las del usuario) | sí (alias del producto o id entero) | sí (`Write`/`Edit`, hook `PreToolUse` + `canUseTool`) | `codigo` con un hueco declarado (†) | `senal` (el `AbortSignal` del SDK) |
| `codex` | **no** (carga sus MCP, hooks y skills) | sí (`ThreadStartParams.model`) | sí (`approvalPolicy: on-request`, sandbox `read-only` siempre) | **`ninguna`** (límite declarado: lee por la shell del sandbox) | `matar` (`hijo.kill()` + `TOPE_MS`) |
| `opencode` | **no** | sí (pasa `model` al arrancar; catálogo por `preguntarAOpencode`) | sí (`session/request_permission`) | `patron` (su permiso de lectura llega sin ruta) | `protocolo` (`session/cancel` antes de matar) |

(†) `veredictoDeLectura` guarda la RUTA de un `Read`, pero `Glob` y `Grep` llevan `path`
opcional y ausente significa la raíz, así que un `Grep` sobre la raíz puede devolver líneas de
un fichero denegado: `canUseTool` no filtra su SALIDA (`agent/subagentes/escrituraExterna.ts:441-442`).
Cerrarlo pide un `PostToolUse`, que no está puesto. El valor del campo tiene que decir esto o
la tabla afirmaría como dato algo que `CLAUDE.md` ya declara como límite abierto — el mismo
error que el comentario de abajo. Si al implementarlo la distinción estorba, el campo pasa a
`"codigo" | "codigo-con-hueco" | "patron" | "ninguna"`; lo que no vale es un `codigo` a secas.

Al medir esa tabla apareció otro desajuste menor que se arregla con ella: el comentario de
`Agente.modelo` en `core/agentes.ts` enumera **tres** motores para los que el campo vale
(`modelo`, `claude-code`, `codex`) y dice «por lo que este campo vale para los tres». OpenCode
también lo acepta, así que son cuatro. Con la tabla, esa enumeración desaparece del comentario:
el dato pasa a estar en un sitio en vez de narrado en otro.

### Dónde aterriza

1. **`core/agentes.ts`** — la tabla y el predicado. Al parsear el `.md`, un campo que el motor
   no soporta se devuelve como `problemas` con su motivo, que es el canal que ya llega a la
   ventana de Ajustes: `«skills: xone-development» no se puede montar con motor: codex — ese
   motor carga las suyas`. **No se rechaza el agente entero**: se carga sin esa capacidad y se
   dice, igual que las skills que faltan.
2. **`core/agentes.ts#promptDeAgente`** — la línea «Tus skills…» deja de emitirse cuando el
   motor no las monta. Hoy es incondicional, y esa línea es la mentira concreta.
3. **`agent/grafo/xoneAgent.ts`** — leer la tabla en vez de repetir `motor === "modelo"`. Las
   decisiones por motor viven hoy repartidas en `agent/config/modelosDeMotor.ts`,
   `agent/subagentes/subagenteExterno.ts`, `agent/grafo/xoneAgent.ts` y `core/agentes.ts`, y ninguno de esos
   sitios es donde alguien miraría para saber qué puede un motor.

### El test que lo fija

Uno por campo, y el que importa es el cruzado: **un `.md` con una capacidad que su motor no
tiene produce un `problemas`, y su prompt NO la anuncia**. Sin ese segundo lado el test pasa
mientras la mentira sigue en el prompt. Y `CAPACIDADES_POR_MOTOR` recorrida entera contra
`MOTORES`, para que un motor nuevo no se olvide de declararse: el `Record<Motor, …>` obliga a
`tsc`, pero no obliga a que los valores sean los medidos.

## Adopción 2 — invariantes de relación observable

Iba a proponerse un registro de invariantes en ejecución contra el patrón de fallo que este
repo lleva documentado nueve veces («una composición de producción viviendo en un cierre que
todos los tests doblan»). **DSH prohíbe exactamente eso**: su `AGENTS.md` dice que un invariante
solo puede asertar relaciones observables —«empty installers and checks of service presence,
plugin metadata, effects, or fixed examples are invalid»—, y la presencia de una composición es
presencia de servicio. Para esa clase, el remedio de DSH es el mismo que xonecode ya aplicó:
extraer la costura y probarla por argumento (`commitDeTurnoCableado`,
`construirCorredorDeTareasCableado`). Eso está cubierto y no se toca.

Lo que sí es un invariante de DSH es una relación entre **dos observaciones independientes que
pueden divergir** — y xonecode ya tiene uno, aunque no se llame así:
`core/entrega.ts#condicionesDeEntrega` con «el turno autorizó escrituras y git no ve ningún
cambio». Dos fuentes que se miden aparte y que, cuando discrepan, dicen algo que ninguna de las
dos sabía sola. La adopción es **extender ese patrón**, no montar un registro:

| candidato | las dos observaciones | qué caza |
|---|---|---|
| Escritura sin decisión | una línea de `write_file`/`edit_file` en el `.jsonl` ↔ su decisión de aprobación en el mismo turno | una escritura que se aplicó sin pasar por la puerta |
| Sello de sesión | el trailer `CLAVE_DE_SELLO` del commit de turno ↔ el id de la sesión que lo produjo | atribuir a `s1` lo que hizo `s10` |
| Artefacto fuera de sitio | el evento `artefacto` ↔ que su ruta real siga bajo la carpeta de la sesión | un artefacto que acabó dentro del proyecto |

Regla para no inflar la lista: **si no se puede nombrar la segunda observación, no es un
invariante**; y si el invariante cuesta más que el test que sustituiría, no entra.

## Adopción 3 — el sobre del `.jsonl`

DSH sostiene «**model-visible ⟺ logged**»: lo que llega a una petición del modelo tiene que
poder reconstruirse del log, `deriveMessages()` proyecta el historial **del** log, y un
invariante en ejecución lo asserta. Esa forma completa no es transferible: aquí el hilo lo
posee `deepagents` y su verdad es el checkpoint de SQLite; el `.jsonl` es presentación. Dos
fuentes, a propósito.

Lo que sí queda abierto es el **sobre de cada línea**. El doc del 4-sep especificó
`schemaVersion`, `sessionId`, `turnId`, secuencia y marca temporal. Lo que se implementó fue
otra disciplina, igual de coherente: aditivo-opcional, donde «ausente» significa «la sesión es
anterior a esto» (`EntradaIndice.dispositivo` lo dice con esas palabras). Donde esa segunda se
paga es en el lector: `reabrirSesion` hace `JSON.parse(linea) as Acto` — un cast, sin validar.
Un `Acto` con una forma que ya no existe entra igual y falla más adelante, que es el bug mudo
de siempre.

Dos caminos, y hay que elegir uno:

- **Validador sin sobre** (más pequeño): una función que criba por `tipo` con lista blanca —el
  patrón del `case` del store del cliente— y descarta la línea que no reconoce, diciéndolo.
  Mantiene la disciplina actual y cierra el cast.
- **Sobre + validador** (lo que pedía el doc del 4-sep): añade `schemaVersion` y `turnId`, que
  es lo que permitiría un cambio rompiente algún día. Cuesta migrar los `.jsonl` que ya
  existen: sin `schemaVersion` = versión 0.

Recomendación: el validador primero. Un `schemaVersion` sin validador no arregla nada, y con
validador el sobre se puede añadir después sin tocar al lector.

## La pregunta abierta: la revisión remota al subir

La ref `refs/remotes/cloudstudio/<rama>` es libro de cuentas **local** —«nuestro fetch de verdad
es `/sync bajar`, no un transporte de git» (`agent/sesiones/gitSync.ts`)— y `agent/cloudstudio/subida.ts` calcula el
plan con `cambiosPendientes(raiz, ramaOrigen)`, que también es local. Si alguien edita en Studio
entre el `bajar` y el `subir`, no se ha encontrado nada que lo detecte: la subida escribiría
encima sin decirlo. El doc del 4-sep pedía rechazar la subida en ese caso («se puede rechazar una
subida si el proyecto remoto cambió desde la descarga»).

Puede ser deliberado —la regla vecina es «no hay ningún `git merge`: fusionar es del usuario, en
Studio»—, pero no está escrito. **Esto no es una adopción: es una pregunta que hay que contestar
antes de decidir si es un hueco.** Si lo es, el sitio es el plan de subida, que ya es el paso
donde se decide.

## Lo que se comprobó y NO falta

Para que no se vuelva a abrir:

| se sospechaba | medida |
|---|---|
| Falta la verificación en etapas (`smoke`) | **Está, con otro nombre**: `agent/dispositivos/lanzamientoEnMaquina.ts` es el recorrido fase a fase que acaba con «la lectura que dice si de verdad está viva» — la pestaña Ejecutar |
| Falta la aprobación del PLAN antes de ejecutar | **No es un hueco**: DSH aprueba el plan porque su HITL es por turno; aquí es por escritura, que es grano más fino. Y el encargo de una tarea se enseña EDITABLE antes de encolar (`agent/tareas/aumentador.ts`) |
| Falta el `ContextProjector` del laboratorio | **Está**: `agent/turno/resumenDeContexto.ts`, con umbrales fijados a mano porque `deepagents` asume 170k |
| Faltan artefactos versionados por `kind` | Diferencia real y menor. Nadie lo ha pedido; no entra hasta que haga falta |
| Faltan roles `data-modeler` / `ux-designer` | No es arquitectura: `.xonecode/agentes/<nombre>.md` acepta roles nuevos hoy, y `mockup` ya cubre UX |

## Orden recomendado

1. **Adopción 1** (descriptor de capacidades). Tiene el caso medido delante, es pequeña y cierra
   una mentira que hoy va en un prompt.
2. **Adopción 3, primera mitad** (el validador del `.jsonl`). Autocontenida.
3. **La pregunta de la revisión remota**. Contestarla antes de implementar nada de ella.
4. **Adopción 2** (invariantes), de uno en uno y solo si su segunda observación se puede nombrar.
