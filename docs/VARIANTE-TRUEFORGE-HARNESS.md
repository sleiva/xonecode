# Variante TrueForge: runtime propio para XOneCode

> Estado: propuesta arquitectónica para evaluación. No describe todavía una migración
> aprobada ni un contrato estable.

## Resumen ejecutivo

La variante recomendada consiste en construir el siguiente harness de XOneCode a partir de
las piezas útiles del runtime de TrueForge, adaptándolas al dominio XOne. No se pretende
ejecutar XOneCode como un agente remoto ni entregar CloudStudio a los modelos. El objetivo es
reutilizar el diseño de ejecución de TrueForge —hilos de agente, subagentes dinámicos, eventos,
estado y reanudación— y conservar como componentes propios las reglas de XOneCode.

El sistema resultante tendría estas propiedades:

- Un agente raíz puede crear subagentes con contexto independiente.
- Los subagentes comparten la copia local del proyecto.
- El trabajo local puede ejecutarse en modo supervisado o autónomo.
- Los perfiles `docs`, `planner`, `dev` y `mockup` pasan a ser especializaciones de prompt,
  skills y modelo, no fronteras de seguridad.
- Las tareas de lectura pueden ejecutarse en paralelo; las escrituras se coordinan para evitar
  conflictos.
- El MCP de CloudStudio no se expone a ningún agente.
- Descargar, comparar y subir a CloudStudio sigue siendo un proceso determinista de XOneCode.
- La publicación tiene una política independiente de la escritura local.

La separación principal es:

```text
┌────────────────────────────────────────────────────────────┐
│ Runtime de agentes                                         │
│ raíz + subagentes + skills + tools locales + estado         │
└───────────────────────────┬────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│ Copia local del proyecto XOne                              │
│ Git + instantánea por turno + verificador                   │
└───────────────────────────┬────────────────────────────────┘
                            │ plan de cambios
                            ▼
┌────────────────────────────────────────────────────────────┐
│ Adaptador determinista de CloudStudio                       │
│ autenticación + descarga + ramas + subida + actualización   │
│ de la referencia remota                                    │
└────────────────────────────────────────────────────────────┘
```

## Por qué esta variante

XOneCode ya tiene reglas de dominio que no deben diluirse dentro de un framework generalista:

- Los `.xne` son la fuente; las vistas `.xml` generadas no se editan.
- Las escrituras locales pueden necesitar aprobación.
- La fotografía anterior al turno debe permitir revisar y recuperar cambios.
- La verificación debe distinguir errores del proyecto y fallos del entorno.
- Los archivos internos y las credenciales no forman parte del proyecto editable.
- CloudStudio tiene reglas específicas para ramas, binarios, archivos no descargados y
  reintentos.

TrueForge, por otra parte, resuelve de forma sólida problemas generales del runtime:

- Un hilo independiente por agente.
- Una máquina de estados explícita por hilo.
- Subagentes representados como llamadas de herramienta.
- Ejecución paralela de los hijos activos.
- Correlación mediante `thread_id` y `tool_call_id`.
- Eventos de ciclo de vida y métricas.
- Pausa y reanudación ante acciones requeridas.
- Entrega del resultado del hijo como respuesta de herramienta al padre.

La propuesta no es reemplazar las reglas de XOneCode por las de TrueForge. Es usar el modelo
de ejecución de TrueForge debajo de un harness específico de XOne.

## Alcance de la extracción

No conviene copiar archivos aislados de TrueForge. `AgentThread`, el orquestador, los handles
de turno y sesión, los eventos y el estado forman un conjunto acoplado. La extracción debe
tratarse como un port controlado de un subsistema y comenzar con una revisión de licencia y de
la clausura real de dependencias.

Las piezas conceptuales que se desean conservar son:

1. `AgentThread` como unidad de ejecución aislada.
2. `AgentThreadOrchestrator` como planificador del árbol de hilos.
3. La factoría `CreateDynamicSubAgentThread` como punto de extensión.
4. La máquina de estados del turno.
5. Los eventos de creación, progreso, acción requerida y finalización.
6. La devolución del resultado del hijo al `tool_call_id` del padre.
7. Los handles de sesión y turno, si resultan necesarios para cancelación y reanudación.
8. Las interfaces de almacenamiento, adaptadas a la persistencia elegida por XOneCode.

No se deben portar sin revisión:

- Integraciones de proveedor que XOneCode no utilice.
- Tools genéricas de shell o filesystem incompatibles con las reglas XOne.
- Autenticación, servidor o interfaz propios del producto TrueForge.
- Acceso remoto desde el modelo.
- Suposiciones de seguridad que contradigan la frontera local/CloudStudio.

## Modelo de subagentes

### Delegación como herramienta

El agente raíz delega mediante una herramienta ordinaria:

```ts
type DelegarInput = {
  nombre: string;
  encargo: string;
  perfil?: "general" | "docs" | "planner" | "dev" | "mockup";
  modelo?: string;
  modo?: "lectura" | "escritura";
};
```

Una llamada puede verse así:

```ts
delegar({
  nombre: "revisar-persistencia",
  perfil: "planner",
  modo: "lectura",
  encargo: "Analiza el estado actual y devuelve una propuesta con referencias concretas."
});
```

La llamada de tool del padre permanece abierta mientras trabaja el hijo. Al terminar, la
respuesta final del hijo se convierte en la respuesta de esa misma tool. De esta forma el
protocolo del modelo padre no necesita conocer un mecanismo especial de mensajería.

### Ciclo de vida

```text
Agente raíz llama a delegar
          │
          ▼
El orquestador crea un AgentThread hijo
          │
          ▼
El hijo ejecuta su encargo con contexto limpio
          │
          ├── puede emitir eventos y solicitar aprobación local
          └── puede terminar con resultado o error publicable
          │
          ▼
El resultado se inserta como tool response del padre
          │
          ▼
Se retira el hilo hijo y el padre continúa
```

Cada hijo conserva:

- `threadId` propio.
- Referencia al hilo padre.
- `toolCallId` que originó la delegación.
- Contexto LLM independiente.
- Estado de ejecución independiente.
- Métricas y eventos propios.
- Señal de cancelación.

El encargo debe ser autosuficiente: el hijo no necesita recibir todo el historial del padre.
Esto reduce contexto y evita que una investigación secundaria contamine la conversación
principal.

### Perfiles como especialización

Los perfiles no son identidades de seguridad. Son presets que resuelven:

```ts
interface PerfilDeAgente {
  instrucciones: string;
  skills: string[];
  papelDeModelo: "rapido" | "trabajo" | "afilado";
  formatoDeResultado?: string;
}
```

La primera implementación puede conservar los perfiles existentes:

| Perfil | Finalidad principal |
|---|---|
| `docs` | Consultar documentación y justificar reglas XOne |
| `planner` | Analizar y diseñar cambios |
| `dev` | Implementar y verificar cambios locales |
| `mockup` | Preparar recursos y propuestas visuales |
| `general` | Resolver encargos que no necesitan especialización |

Todos pueden compartir las herramientas locales. Las restricciones sobre `.git`, credenciales,
archivos internos y vistas generadas siguen siendo invariantes del backend, no permisos de un
perfil concreto.

### Paralelismo y consistencia

El paralelismo es útil principalmente para investigación. Una política inicial segura y simple
sería:

- Máximo de cinco subagentes activos, configurable.
- Varios trabajos declarados como `lectura` pueden ejecutarse en paralelo.
- Solo un trabajo declarado como `escritura` puede ejecutarse al mismo tiempo.
- El padre espera a los hijos antes de sintetizar el resultado.
- No hay subagentes anidados en la primera versión.
- No se acepta un nuevo mensaje del usuario mientras el árbol tenga una operación indivisible
  en curso; alternativamente, se cancela explícitamente el turno anterior.

La exclusión de escritores evita que dos hijos modifiquen simultáneamente `app.xml` o la misma
colección. No es una frontera de seguridad, sino una regla de consistencia. Los bloqueos por
ruta pueden estudiarse después si existe una necesidad medida.

## Escritura sobre el repositorio local

La política local es configurable y se aplica en el runtime de tools, no en los prompts:

```ts
type PoliticaDeEscrituraLocal =
  | { modo: "supervisado" }
  | { modo: "autonomo" }
  | {
      modo: "mixto";
      aprobar: Array<"crear" | "modificar" | "borrar">;
    };
```

### Modo supervisado

1. El agente solicita una escritura.
2. XOneCode calcula y muestra el cambio.
3. El usuario aprueba o rechaza.
4. Solo una aprobación explícita aplica la operación.

### Modo autónomo

1. XOneCode toma la instantánea anterior al turno.
2. Los agentes escriben en la copia local sin aprobación individual.
3. El verificador analiza el resultado.
4. Git permite presentar el diff y recuperar el estado anterior.

### Modo mixto

Permite, por ejemplo, crear y modificar automáticamente pero exigir aprobación para borrar:

```json
{
  "escrituraLocal": {
    "modo": "mixto",
    "aprobar": ["borrar"]
  }
}
```

La política se resuelve al ejecutar la tool. Agentes, perfiles y skills no tienen que cambiar
cuando el usuario cambia de modo.

## Estado y persistencia

El diseño debe distinguir cuatro clases de estado:

| Estado | Vida útil | Ejemplos |
|---|---|---|
| Estado de hilo | Durante/reanudable | fase, mensajes, tools pendientes, padre |
| Estado de turno | Un turno | instantánea anterior, aprobaciones, métricas |
| Estado de sesión | Conversación | árbol de hilos, resumen, modelo activo |
| Estado de proyecto | Entre conversaciones | memoria, decisiones, configuración, referencia remota |

El checkpointer guarda el estado reanudable de la ejecución. El store guarda conocimiento que
debe sobrevivir a una conversación. No deben utilizarse como sinónimos.

Una interfaz de persistencia podría separar ambas responsabilidades:

```ts
interface CheckpointPort {
  guardarHilo(checkpoint: CheckpointDeHilo): Promise<void>;
  cargarHilo(threadId: string): Promise<CheckpointDeHilo | undefined>;
  eliminarHilo(threadId: string): Promise<void>;
}

interface StoreDeProyectoPort {
  obtener<T>(espacio: string, clave: string): Promise<T | undefined>;
  guardar<T>(espacio: string, clave: string, valor: T): Promise<void>;
  buscar(espacio: string, consulta: string): Promise<EntradaDeStore[]>;
}
```

El estado persistido debe usar versiones de esquema. Un checkpoint no puede contener clientes,
handles abiertos, señales, tool instances ni secretos; solo identificadores y datos
serializables con los que el runtime reconstruye esas dependencias.

## Eventos

TrueForge puede producir eventos internos detallados, pero `core/` debe seguir recibiendo
eventos de dominio propios. Un adaptador realiza la traducción:

```text
Evento del runtime TrueForge
           │
           ▼
Adaptador de eventos de XOneCode
           │
           ▼
Evento de dominio en core/events.ts
           │
           ├── stdio
           └── TUI
```

Como mínimo interesa representar:

- Creación y finalización de un subagente.
- Inicio y final de llamada al modelo.
- Inicio y final de tool.
- Acción o aprobación requerida.
- Pausa, reanudación y cancelación.
- Resultado o error publicable del hilo.

Los eventos no deben filtrar argumentos sensibles ni contenido completo de archivos. La lista
blanca actual para detalles de tools sigue siendo aplicable.

## CloudStudio queda fuera del agente

Ningún agente o subagente recibe las tools MCP de CloudStudio. El MCP se usa como una API de
infraestructura desde código determinista de XOneCode.

```text
Agentes trabajan en local
          │
          ▼
Verificador XOne
          │
          ▼
Git calcula el plan de subida
          │
          ▼
Política de publicación
          │
          ▼
XOneCode ejecuta el plan mediante MCP
```

Esto conserva las reglas actuales:

- El agente no cambia la rama del servidor.
- El agente no decide cómo se reintenta una subida parcial.
- `.xonecode` nunca se publica.
- Lo que no se descargó no puede borrarse remotamente.
- La referencia remota solo se mueve cuando el plan termina entero.
- La rama activa de Studio se restaura al finalizar.

La publicación puede ser interactiva o autorizada por una política automática, pero su
ejecución siempre es determinista:

```ts
interface PoliticasDeEjecucion {
  escrituraLocal: PoliticaDeEscrituraLocal;
  publicacion: "interactiva" | "autorizada-por-politica";
}
```

Una política automática de publicación debe comprobar mediante código, como mínimo:

- Verificador en verde.
- Ningún subagente activo.
- Ninguna aprobación pendiente.
- Plan de subida válido.
- Estado Git compatible con la operación.
- Autorización explícita de la política configurada.

Un mensaje del modelo indicando que terminó no sustituye estas comprobaciones.

## Encaje con la arquitectura actual

La frontera actual de cuatro capas puede mantenerse:

| Capa | Responsabilidad después del cambio |
|---|---|
| `src/core/` | Eventos de dominio, políticas, puertos, estado serializable y motor independiente |
| `src/agent/` | Port del runtime, factoría de hilos, adaptadores LLM/tools/skills y reglas XOne |
| `src/cli/` | Sesión, presentación, aprobación, configuración y comandos CloudStudio |
| `src/vendor/` | Código portado que se decida mantener próximo al origen, con procedencia documentada |

`core/` no debe importar TrueForge, LangChain, LangGraph, Deep Agents, Ink ni MCP. El runtime
portado se conecta mediante puertos y traduce sus eventos en `agent/`, preservando la frontera
que ya está cubierta por tests.

## Estrategia de implementación

### Fase 0: prueba de compatibilidad

- Revisar licencia y obligaciones de atribución de TrueForge.
- Fijar el commit de origen estudiado.
- Enumerar la clausura de imports del runtime que se desea portar.
- Construir un prototipo mínimo: raíz, un hijo, resultado como tool response y cancelación.
- Verificar que funciona sin servidor TrueForge y sin CloudStudio.

### Fase 1: runtime aislado

- Portar interfaces de hilo, estado y eventos.
- Implementar el orquestador de hojas activas.
- Añadir correlación padre/hijo/tool.
- Añadir pruebas deterministas sin modelo real.
- Implementar límites de concurrencia y prohibición de anidamiento.

### Fase 2: adaptadores XOne

- Conectar resolución de modelos por papel.
- Conectar backend local y reglas de rutas XOne.
- Conectar skills.
- Traducir eventos al dominio existente.
- Integrar el verificador y la instantánea por turno.

### Fase 3: políticas de escritura

- Mantener el modo supervisado como comportamiento compatible.
- Añadir el modo autónomo local.
- Añadir, si se necesita, el modo mixto.
- Probar rechazo, EOF, cancelación y límite de rondas.

### Fase 4: persistencia

- Implementar checkpoints versionados de hilo/sesión.
- Reconstruir dependencias no serializables al reanudar.
- Conectar el store persistente de proyecto.
- Definir poda y migración de versiones.

### Fase 5: retirada controlada del harness anterior

- Ejecutar ambos motores detrás de un selector temporal.
- Comparar eventos, cambios locales, verificaciones y consumo.
- Migrar el comportamiento por capacidades, no mediante un cambio único.
- Retirar Deep Agents/LangGraph solo cuando exista paridad medida.

## Pruebas de aceptación

La variante no se considerará viable hasta demostrar, sin red ni claves:

1. Un hijo recibe un encargo autosuficiente y devuelve el resultado al padre.
2. Varios hijos lectores se ejecutan en paralelo y el padre espera a todos.
3. Dos escritores no se ejecutan simultáneamente.
4. Una aprobación requerida identifica el hilo correcto y se reanuda correctamente.
5. Cancelar el turno cancela raíz e hijos sin dejar tools abiertas.
6. Un error del hijo vuelve al padre de manera utilizable.
7. Los eventos no exponen contenido o secretos.
8. Un checkpoint permite reanudar sin serializar dependencias vivas.
9. Los modos supervisado y autónomo producen el mismo cambio final para una tarea equivalente.
10. Ningún catálogo de tools entregado al modelo contiene operaciones de CloudStudio.
11. El plan de subida conserva todos los candados actuales.
12. `npm test` continúa funcionando sin red, credenciales ni simulador.

## Riesgos y decisiones pendientes

- **Deriva respecto a TrueForge:** un port propio exige revisar periódicamente cambios del
  origen o aceptar una bifurcación consciente.
- **Clausura grande de dependencias:** antes de portar hay que separar el núcleo necesario de
  componentes de servidor o producto.
- **Escrituras concurrentes:** deben serializarse antes de habilitar subagentes escritores.
- **Compatibilidad de checkpoints:** requiere versión y migración desde el primer formato.
- **Skills por hijo:** hay que decidir si se cargan todas y el prompt selecciona, o si la
  factoría construye un catálogo por perfil.
- **Modelo por hijo:** la selección debe pasar por la resolución de modelos de XOneCode y no
  aceptar proveedores o credenciales arbitrarias.
- **Autonomía local:** debe conservar instantánea, diff, verificador y recuperación aunque no
  exista aprobación previa.

## Decisión propuesta

La dirección recomendada es construir un runtime XOne específico utilizando como referencia y,
si la licencia lo permite, como base portada, el núcleo de ejecución de TrueForge. El primer
hito no debe intentar reemplazar todo el harness: debe demostrar el ciclo completo de un
subagente sobre la copia local, con estado, eventos, cancelación y resultado correlacionado.

Si esa prueba confirma que el runtime puede aislarse sin arrastrar el producto completo,
XOneCode puede avanzar hacia subagentes dinámicos y persistencia propia. CloudStudio permanece
fuera de ese runtime y continúa siendo una integración determinista controlada por el CLI.

## Estado: Fase 0 hecha (23-09-2026)

**Cómo se integró.** Como librería y no como port: `@truefoundry/trueforge-core` **0.2.1, versión
exacta** (MIT; su API es 0.x sin garantía de compatibilidad). Corre en proceso **sin ninguna
infraestructura** —ni NATS, ni Redis, ni Postgres, ni Daytona— con `AgentThread` y
`AgentThreadOrchestrator`. Portar el núcleo sigue siendo una opción si alguna de sus rigideces
estorba (abajo).

**El motor se elige por configuración y no se ve.** `"motor": "trueforge"` en el `config.json` del
proyecto o en el global, o `XONECODE_MOTOR=trueforge`; por omisión, `deepagents`. Cada sesión guarda
en el índice el motor con el que nació y lo conserva al reabrirla, porque la memoria de un motor no
la continúa el otro. La elección vive en un solo punto, `abrirSesionReal`, por el que pasan la web,
el terminal, `run`, el banco y los evals (`core/motor.ts`, `agent/motores/trueforge/`).

**Lo que ya funciona con TrueForge**, con el mismo contrato `SesionReal` que deepagents —la interfaz
no nota la diferencia—:

| Pieza | Cómo |
|---|---|
| Modelo | Un `ILLM` propio sobre NUESTRO modelo de LangChain, no su `VercelAILLM`: así se conservan el `user_id` de DeepSeek, el eco de razonamiento, el tope de salida y el esfuerzo por modelo |
| Tools | `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, con los nombres y argumentos de deepagents, delegando en `backendDeAgente` —sus guardas van gratis— y evaluando las reglas de `permisosDe` con la semántica de deepagents |
| Aprobación | Cada escritura para el turno (`requireApprovalForTools`), se decide con el mismo `pedirAprobacion` y el mismo diff (`cambioDe`), y se reanuda con `user.tool_approval` |
| Modo autónomo, artefactos | Igual que en deepagents: autónomo aprueba y lo avisa con los nombres; un artefacto no pregunta y se anuncia |
| Eventos | Traducidos a los de dominio con las reglas del puente: sin argumentos de tool, solo habla el hilo raíz |
| Cancelación, tokens, cambios | También si se cancela mientras se decide una aprobación |

**Medido de punta a punta** con `deepseek-flash` sobre una copia de AppDemo, la misma pregunta de
solo lectura («¿colección de entrada y dónde se declara?»):

| | deepagents | TrueForge |
|---|---|---|
| Respuesta | correcta | correcta |
| Llamadas | 2 | 4 |
| Entrada | 12.426 | 15.138 |
| Caché | 94 % | 48 % |
| Cómo se orientó | `xone_navegacion` | `glob` + `read_file` + `grep` |

La diferencia es lo que falta, no el motor: TrueForge todavía no tiene `xone_navegacion` ni los
hechos del proyecto precargados, y envuelve el prompt con su identidad, que no se puede quitar.

**Lo que NO hay todavía**, y en este orden sería lo siguiente:

1. ~~`xone_navegacion`, `regex_search`~~: hechas (abajo). ~~Los hechos del proyecto precargados~~:
   hechos, en la petición de cada turno y con el MISMO cargador que la tool (`sesionTrueforge.ts#flujo`);
   no van en la respuesta a una pregunta, que no es un encargo nuevo, ni en la de una reparación.
2. ~~El verificador con su reparación~~: hecho, con las reglas de deepagents compartidas
   (`agent/turno/verificacion.ts`). ~~El juez del turno y el crítico de pantalla~~: enganchados,
   con los MISMOS puertos que deepagents y reenviados por `abrirSesionReal`. El crítico mira la
   última captura del turno una vez; en verde solo avisa y en rojo sus observaciones van en la
   reparación. El juez corre una vez tras todas las pasadas y contra el ENCARGO, no contra lo
   tecleado: la respuesta a una pregunta se juzga contra el encargo que la provocó. No se juzga un
   turno cancelado ni uno que acaba preguntando, y tras reabrir una sesión con pregunta pendiente
   el encargo no consta —vive en el proceso, no en la foto— y el juez calla. A diferencia de
   deepagents, este camino SÍ tiene test de turno: aquí el arnés escribe una captura de verdad.
3. ~~El resto de subagentes~~: hecho, todos salen de su `.md` (abajo).
4. ~~La memoria del hilo en disco~~: hecha, como foto del raíz (abajo).
5. Deshacer la dependencia circular entre `turnoReal.ts` y `sesionTrueforge.ts`.
6. ~~**MUY IMPORTANTE — la pregunta del orquestador como TARJETA con botones.**~~: hecha (abajo,
   «La pregunta, también como tarjeta»). stdio y la TUI siguen con el texto.

**Las rigideces de la librería** que podrían llevar a portarla: envuelve siempre el prompt con su
identidad; prefija cada tool con `mcp server:`; el prompt de un subagente no se puede personalizar y no
hay subagentes con nombre; las tools no reciben señal de cancelación; como mucho 5 subagentes en paralelo
y un solo nivel.


### El `device-controller`, primer subagente (23-09-2026)

«No puede ejecutar el hotswap»: sin subagentes nadie tenía shell, y dársela al agente raíz habría
roto la regla de deepagents —la shell la tiene UNO, porque no pasa por `permisosDe` ni por la
aprobación—. Así que el raíz delega con `create_sub_agent` y la factoría de hijos crea el `.md` con
`ejecucion: true`, con su prompt, sus tools de lectura y `execute` sobre el mismo backend que le
monta deepagents. Un test comprueba en las tools que recibe el modelo que al raíz nunca se le ofrece
`execute`.

Medido con `deepseek-flash`: «¿qué dispositivos hay conectados?» → `create_sub_agent device-controller`
→ `adb devices -l` → «el emulador `emulator-5554`, en estado `device`», correcto, en 4 llamadas y
13,4k de entrada. Las dos rigideces que hubo que rodear: el prompt del hijo va en su primer mensaje,
y ese mensaje corrige la frase fija de TrueForge de que el hijo tiene «las mismas tools que el padre».

### Todos los subagentes, con el reparto de deepagents (23-09-2026)

La primera versión tenía un raíz que leía, escribía y recibía las reglas del `developer-xone`, y un
solo hijo con nombre. Eso rompía el reparto que deepagents ya hace: **las skills son de cada
especialista y el orquestador no recibe ninguna**. Ahora el árbol es el mismo en los dos motores:

- **El raíz es el ORQUESTADOR**, con el prompt de siempre (`promptOrquestador`, generado de la lista),
  **de solo lectura** (`permisosDe(PERFIL_DEL_ORQUESTADOR)` y solo las cuatro tools de lectura) y **sin
  skills**. Ese prompt habla de `task` y de la ficha en su descripción; aquí se delega con
  `create_sub_agent`, así que una nota traduce el nombre de la tool y lleva las fichas escritas con la
  MISMA `fichaDeAgente` (`notaDeDelegacion`). Solo se ofrecen los especialistas de motor `modelo`: a uno
  externo no se le puede delegar desde este motor.
- **Cada hijo sale de SU `.md`**: su prompt (`promptDeAgente`, con las reglas de XOne delante), **sus**
  skills anunciadas —nombre, descripción y ruta del `SKILL.md`, que se lee bajo demanda desde
  `/skills/`, montada por `backendDeAgente`— (`skillsTrueforge.ts#anuncioDeSkills`), su modelo
  (`modelo` del `.md`, o `rapido`/`trabajo` según `soloLectura`, con su `esfuerzo`) y sus tools por la
  misma partición que deepagents (`clasesDeTools`): quien ejecuta, lectura + `execute`; quien solo lee,
  las seis **sin aprobación**, porque `permisosDe` lo confina a `/artefactos/` y `/planes/` —el plan del
  analista—, igual que el `hitlDe` vacío de deepagents; el resto, las seis con `write_file`/`edit_file` pidiendo aprobación y `permisosDe(agente)`
  acotando (`escribeEn` incluido). Un nombre que no es de ningún especialista da un hijo genérico de
  solo lectura.
- **La aprobación vuelve al hilo que la PIDIÓ.** Con escritores, la `write_file` la pide el hijo, y el
  orquestador de TrueForge reparte las decisiones por `thread_id`: devolverla al raíz la rechaza con
  «no pending approval» (el test muere así con ese mutante). Las tool calls se apuntan por hilo **y**
  por id, y la tarjeta dice el nombre del especialista que quiere escribir, no «trueforge».
- **Tokens de todos los hilos, ventana solo del raíz**: todos se gastaron; la ventana de un hijo es la
  de un encargo que muere con él.
- Las escrituras de dos hijos a la vez sobre el mismo fichero **se serializan**: comparten el backend,
  y la cola por ruta vive en `backendDeAgente`.
- Qué se pregunta lo decide **la misma función** que el HITL de deepagents (`seDetieneEn`): lo que no
  es el proyecto no se pregunta, y por un fichero del proyecto siempre.

### Las tools propias, adaptadas y no reescritas (23-09-2026)

`xone_navegacion`, `regex_search`, `copiar_artefacto`, la crítica visual y traer de la máquina son
tools de LangChain. No se reescriben para este motor —un segundo `xone_navegacion` sería un segundo
sitio donde las respuestas pueden divergir—: `toolsPropias.ts#fuenteDeLangchain` las ofrece a
TrueForge con el esquema de la propia tool (`toJsonSchema`) y las llama con su `invoke`, así que sus
guardas son el mismo código. El reparto es el de `xoneAgent.ts`: `xone_navegacion` a todos, el
orquestador incluido; `regex_search` a los especialistas; `copiar_artefacto` a quien declara
`escribeEn`; crítica visual y traer de la máquina solo al orquestador, y todas las que dependen de la
carpeta de artefactos solo con ella. La nota de «qué tools tienes» de cada hijo sale ahora de los
nombres montados: escrita a mano se había quedado corta.

Medido con `deepseek-flash`, la misma pregunta de la Fase 0 sobre AppDemo: el orquestador abre con
`xone_navegacion app` y contesta bien, en 4 llamadas y 19-27k de entrada con 65-89 % de caché según la
pasada. La traza de tools (`XONECODE_TRACE_TOOLS=1`) la escribe ya este motor con la MISMA pieza que
deepagents (`crearDiagnosticoDeTools`): mismo fichero, mismo formato, origen por nombre de
especialista, así que `xonecode traza` compara los dos.

### La memoria en disco, y por qué no es `agent-session` (23-09-2026)

`@truefoundry/trueforge-core/agent-session` promete sesiones persistentes, y se miró antes de
descartarlo. Dos cosas lo dejan fuera: trae su propio registro de sesiones, turnos y eventos —un
segundo índice al lado del de XOneCode, con su propio «de quién es esto»—, y su factoría de
subagentes **sustituye el primer mensaje del hijo por el encargo pelado** (`instruction: undefined`,
`messages: [encargo]`), que es justo donde iba el prompt del `.md`.

Lo que hace falta para que reabrir continúe es menos: `AgentThread.toSnapshot()` del raíz al acabar
cada turno, en `.xonecode/sesiones/<id>/memoria-trueforge.json` con modo 0600, y el constructor del
hilo con ese contexto al reabrir (`memoriaTrueforge.ts`). Los hijos mueren con su turno por diseño.

Dos hallazgos de leer la librería:

- **`buildInstruction` ignora el `instruction` de un hijo** (`!this.parent`); a su prompt de sistema
  solo llegan los `instructionBuilders` de sus capabilities. El prompt del especialista pasa a ir ahí
  en vez de en su primer mensaje, donde una compactación —que sustituye el contexto entero— se lo
  llevaría. **Los hijos no se compactan, y lo decidió la traza**: activada al umbral del raíz, el
  `device-controller` se compactó a un par de llamadas de terminar, y el resumen costó 26.010 de
  entrada sin caché y 5.916 de salida, más recalentar la caché después. Un encargo de hijo es corto y
  va cacheado al 85-95 %: reenviarlo sale más barato que resumirlo.
- **El `OpenToolCallCloser` se salta las `create_sub_agent`** (`is_thread_creation`), que es la tool
  call que queda colgada cuando un turno se corta con un hijo esperando aprobación. Se salda al
  guardar la foto (`saldarColgadas`), y tras un turno cortado el árbol se rehace desde ella: con el
  hijo vivo, el siguiente mensaje del usuario lo rechazaba la librería.

La web mira las dos memorias al decidir si una sesión reabierta continúa, y borrar una sesión se
lleva las dos (`agent/sesiones/memoriaDeHilo.ts`).

### El presupuesto del paso y la fecha (23-09-2026)

Dos reglas del `largeToolResponse` de TrueForge, **portadas y no montadas**: con los dos recortadores
puestos la misma salida se procesaría dos veces. `recortes.ts#recortarPaso` va como
`toolResponseProcessor`, la pieza con la que la librería ve todas las respuestas de un paso juntas:
si entre todas pasan de 10.000 tokens —su umbral— se desalojan las mayores primero, y un error que
haya que recortar se trunca a 500 caracteres en vez de guardarse aparte, porque no hay nada que
releer. Y `currentDateTime` de la librería, en el raíz y en los hijos: devuelve la fecha en **UTC**
y epoch, no la zona horaria local.

### La tarea del emulador, con traza en los dos motores (23-09-2026)

«Puedes lanzar la app en el emulador» sobre una copia de MyAllXOne, `deepseek-flash`, n=1:

| | TrueForge | deepagents |
|---|---|---|
| Llamadas | 19 | 14 |
| Efectivo | ≈107k | ≈42k |
| `device-controller` | 16 llam · 74 % caché · 66k fresca | 11 llam · 92 % caché · 13k fresca |
| Caracteres devueltos por tools | 88.578 | 39.300 |

Dos causas, y la traza separa las dos. La **compactación del hijo** (arriba), que era cosa nuestra y
se retiró. Y **conducta**: el hijo de TrueForge sacó el log entero dos veces (12k cada una) donde el
de deepagents lo filtró con `grep`/`tail`, y leyó el `SKILL.md` en dos trozos. Eso último no es del
motor —las tools y los umbrales son los mismos— y con una pasada no se distingue de la varianza.

### Las capacidades, una pieza por responsabilidad (23-09-2026)

`capacidades.ts` es el sistema de plugins de este motor sobre `AgentCapability`: ficheros, tools
propias, ejecución, recortes del paso, fecha e instrucciones. **Cada pieza declara las tools que
añade**, y la nota «tienes estas tools» de cada hijo sale de esa lista (`toolsDe`): antes se
mantenía aparte y a mano, y ya se había quedado corta una vez. Qué piezas lleva cada especialista lo
decide `capacidadesDelEspecialista` sobre su `.md`, con la partición de deepagents, y se prueba sin
levantar un hilo. No cambia el comportamiento: los tests de la sesión pasan sin tocarse.

### El orquestador pregunta (`ask_user_question`, 23-09-2026)

La capability de la librería, **solo en el raíz** —ella tampoco se la da a un hijo: es el único con
una persona delante—. Es una tool de CLIENTE: la librería para el turno con `tool.response_required`,
que no es una aprobación y no se mezcla con ellas. **Se contesta por el chat, no con un diálogo**:
la pregunta cierra el turno y sale en la respuesta con sus opciones numeradas, y lo que la persona
escriba después vuelve como `user.tool_response` a su hilo —un número de opción se traduce a su
texto—. Así llega igual a la web, a la TUI y al terminal sin tocar ninguna piel; una tarjeta con
botones sería el siguiente paso y no cambiaría esto. Medido con `deepseek-flash`: ante «pregúntame
antes de tocar nada», el orquestador investigó el proyecto y preguntó con dos paletas concretas.

### La pregunta, también como tarjeta (23-09-2026)

ENCIMA del texto, no en su lugar. Las opciones viajan como DATO en un evento propio
(`events.ts#consulta`), emitido detrás del texto y solo con opciones; `Piel.consulta?` es opcional,
así que stdio y la TUI no cambian de un byte. La piel web lo guarda como acto `consulta` en el
`.jsonl`, y **lo pendiente lo decide el HILO** (`apps/web/src/consultaPendiente.ts`): la última
consulta sin un acto de usuario detrás, y nada con el turno en vuelo. Por eso la tarjeta vuelve al
reabrir sin guardarla aparte. Es un diálogo con la coraza de `Pregunta.tsx`, pero no fail-closed:
pulsar una opción la manda como PROSA —lo mismo que teclearla—, y cerrar no contesta nada.

Dos cosas que salieron de mirarlo en el navegador y no de los tests:

- **La pregunta quedaba DOS veces en el `.jsonl`**: el acto llegaba con el mensaje del asistente aún
  abierto, y el `cerrarLinea` del final lo volvía a empujar. `core/turno.ts` cierra el mensaje antes
  del acto, igual que `escribirLinea`; el test va por `correrTurno` con la piel web de verdad.
- **El juez del turno de la respuesta juzgaba mal**: con el encargo a secas veía solo la respuesta de
  ESE turno y concluía que la pregunta pedida no se hizo. El objetivo lleva ahora la pregunta y lo
  contestado.

### El tope de llamadas era de TODA la conversación, y la pregunta no sobrevivía (23-09-2026)

Dos fallos del ciclo de vida, los dos medidos en la librería instalada:

- **El contador de llamadas vive con el HILO** (`metrics.iterations`, creado en el constructor) y no
  se reinicia entre ejecuciones; su tope por omisión es 25. Con el raíz vivo toda la conversación,
  una sesión larga dejaba de contestar tras 25 llamadas SUMADAS, aunque cada turno fuera corto. El
  raíz se rehace ahora desde su foto al final de CADA turno —conserva el contexto y reinicia el
  contador—, así que el tope es por turno. Los topes son los medidos de deepagents: 30 por
  especialista y 60 para el que ejecuta (`TOPE_DE_LLAMADAS_DEL_ESPECIALISTA`, `…_DEL_CONDUCTOR`), y
  100 para el orquestador, la omisión del `AgentSpec` de TrueForge, porque deepagents no le pone
  ninguno y aquí hace falta un número. El corte se dice como corte, con el número y en castellano.
- **La pregunta en espera solo vivía en memoria**, y al guardar la foto se saldaba como incompleta:
  cerrar la consola y contestar después la convertía en un mensaje suelto. Ahora viaja en la foto
  (`pregunta_pendiente`) y su tool call no se salda mientras espera.

**Límite declarado**: no hay un presupuesto GLOBAL por turno (la suma de todos los hilos). Lo acotan
los topes por hilo y el máximo de cinco hijos a la vez de la librería; deepagents tampoco lo tiene.

### Una sola frontera con la librería (23-09-2026)

Todo lo que se usa de `@truefoundry/trueforge-core` entra por `agent/motores/trueforge/trueforge.ts`,
y un test lo exige (`frontera.test.ts`). Dentro se separa lo de la API pública (`/core`) de lo que
solo está en rutas profundas —hoy, solo dos TIPOS: `ExtendedChatCompletionChunk` y
`RawAssistantMessageWithUsage`—: el paquete deja importarlas (`"./*"` en sus `exports`), pero no son
su API y son lo primero que puede moverse. El trazado mudo es nuestro, con `satisfies` contra los
tipos públicos de `AgentTracing`, así que un cambio de su interfaz lo dice el compilador. El test
de la frontera reconoce las cuatro formas de cargar el paquete —`from`, `import` a secas,
`import()` y `require()`—, y prueba el propio detector con cada una. **Ojo al comparar con el código fuente**: el checkout local de TrueForge está ya en 0.3.0-rc.0 y aquí
corre 0.2.1; la referencia del comportamiento es `node_modules`. No se sube a 0.3 sin antes una prueba
de compatibilidad con DeepSeek: 0.3 saca `reasoning_content` del contexto del hilo, y DeepSeek exige
recibirlo de vuelta cuando hay tool calls.
