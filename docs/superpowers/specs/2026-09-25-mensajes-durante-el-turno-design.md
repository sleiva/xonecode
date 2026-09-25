# Mensajes mientras el agente trabaja (IXCODE-4)

Hoy, mientras un turno de TrueForge está en marcha, el compositor de la web se deshabilita
(`Compositor.tsx`, `disabled={!conectado || turnoEnVuelo}`). No es una elección de UX: es que la
librería lo impide. Verificado contra el código real de `@truefoundry/trueforge-core` (no contra
un informe de subagente ni contra la documentación):

- `AgentThreadOrchestrator.send()` lanza `InvalidAgentSendInputError("Cannot process user
  messages while sub agents are running…")` en cuanto `agentThreads.size > 1` — y mientras
  cualquier especialista existe en el árbol, eso es siempre cierto (`getActiveAgentThreads`: la
  raíz deja de ser "hoja" en cuanto tiene un hijo).
- Cuando el especialista activo termina y se borra del mapa (`agentThreads.size` vuelve a 1), el
  motor no cede el control a nuestro código en ese instante: pasa directo, sin ningún `yield`
  intermedio, a la siguiente llamada de la raíz. No hay una ventana externa que aprovechar.
- `AgentThread.send()` (el hilo individual) bloquea igual un mensaje de usuario si hay una
  aprobación o pregunta pendiente sin resolver (`"user message cannot be sent while approvals or
  questions are pending"`).

## Alcance

**Solo TrueForge.** `deepagents` se queda fuera — decisión explícita del usuario, como en IXCODE-5.

**Solo la consola WEB.** El terminal/TUI leen stdin línea a línea de forma bloqueante; soportarlo
ahí es un problema aparte (lectura no bloqueante durante el streaming), fuera de este trabajo.

**Solo cuando el agente trabaja en silencio.** Si ya hay una aprobación (diff) o una pregunta del
orquestador visibles esperando respuesta, escribir se sigue tratando como la decisión sobre ESO —
el mecanismo de este documento no entra en juego ahí, ni falta que hace: ese camino ya funciona.

## Lo que se investigó y se descartó

Antes de llegar al diseño de abajo se recorrieron dos caminos que no sirven, y merece la pena
dejarlos escritos para no volver a intentarlos:

1. **Abortar el hilo activo e inyectar por fuera del orquestador.** `AgentThreadOrchestrator
   .agentThreads` es un `Map` público en JS pero **declarado `private readonly` en el
   `.d.ts`** (`AgentThreadOrchestrator.d.ts`) — usarlo exige saltarse el compilador con un cast.
   Y aunque se aceptara ese riesgo, aportaría poco: abortar usa una única señal COMPARTIDA por
   todo el lote de hilos activos (`execute({signal})` se llama igual para la raíz que para cada
   hijo), deja mensajes de asistente a medio escribir y tool calls abiertas sin resolver, y falla
   sin remedio contra un hijo de motor EXTERNO (`iterationLimit: 1`, sin capacidad de recibir
   nada a mitad).
2. **Forkear `@truefoundry/trueforge-core`.** Es un paquete de terceros real (MIT,
   `github.com/truefoundry/trueforge`, publicado como `public`), así que forkearlo era viable,
   pero innecesario: existe un punto de extensión público y pensado para esto.

## El mecanismo: `preLLMProcessors`

`AgentCapability.preLLMProcessors` (`AgentCapability.d.ts`) es una lista de procesadores que
`AgentThread.execute()` ejecuta **antes de cada llamada al modelo**, en la raíz y en cada hijo por
igual — confirmado en `AgentThread.js:733-740` (`stepLLMCall` llama
`executeContextProcessors("preLLM")` antes de construir la petición). Un procesador puede devolver
un `AGENT_CONTEXT_APPEND` que **persiste** un mensaje `user` en el contexto del hilo — no es la
variante efímera (`preLLMEphemeralProcessors`, que solo transforma la petición saliente sin
guardar nada).

Ni `PreLLMAgentContextProcessor` ni `AgentContextProcessorAppendContext` se reexportan desde el
punto de entrada público del paquete (`dist/core/index.d.ts` solo reexporta
`AgentContextProcessorOutput`, `AgentThreadExecutionContext`, `PostToolCallAgentContextProcessor`
y `PreLLMEphemeralAgentContextProcessor` — la variante persistida que necesitamos, no). Esto no es
un problema nuevo: `capacidadDeRecortes`/`capacidadDeFecha` (`capacidades.ts`) ya construyen sus
piezas SIN importar los tipos internos de la librería, a mano, contra `Record<string, unknown>` —
el mismo patrón sigue aquí. El campo `type` del objeto que se devuelve es el string literal
`"internal.agent.context.append"` (`InternalEventType.AGENT_CONTEXT_APPEND` en la librería), y no
hace falta importar la constante para escribirlo.

## Diseño

### 1. La cola de notas — vive en la sesión, no en un hilo

Un array en el cierre de `abrirSesionTrueforge`, junto a `aborto`/`cancelado`:

```ts
interface Nota {
  texto: string;
  entregadaA: Set<string>; // thread_id que ya la recibieron
}
const notas: Nota[] = [];
```

### 2. `capacidadDeNotas` — una sola instancia, compartida por todos los hilos

Se construye UNA VEZ por sesión y se añade tal cual —el mismo objeto— a las piezas de la raíz
(`nuevoOrquestador`) y a las de cada hijo de motor `"modelo"` (`capacidadesDelEspecialista`/
`crearHijo`). Los hijos de motor EXTERNO (Claude Code, Codex, OpenCode) no llevan `capabilities`
en absoluto — no reciben notas. Límite declarado, no silencioso.

```ts
function capacidadDeNotas(notas: Nota[]): Capacidad {
  return {
    nombre: "notas",
    tools: [],
    capability: {
      preLLMProcessors: [
        {
          async *processPreLLM(execution: { threadId: string }) {
            const pendientes = notas.filter((n) => !n.entregadaA.has(execution.threadId));
            if (pendientes.length === 0) return;
            for (const n of pendientes) n.entregadaA.add(execution.threadId);
            yield {
              type: "internal.agent.context.append",
              context: [{ role: "user", content: pendientes.map((n) => textoDeNota(n.texto)).join("\n\n") }],
              output: [],
            };
          },
        },
      ],
    },
  };
}
```

**Semántica de entrega, dicha entera**: una nota se entrega la PRIMERA vez que un hilo con esta
capacidad hace una llamada al modelo después de que la nota exista, y se marca entregada A ESE
HILO — nunca se repite para él. No se distingue "estaba trabajando cuando escribiste" de "se creó
justo después": cualquier hilo cuya primera llamada ocurra mientras la nota sigue en la cola la
recibe. Es la lectura simple de "a todos los activos" que decidiste para el caso de varios
especialistas en paralelo (hasta 5, `MAX_PARALLEL_SUB_AGENTS`): no hace falta rastrear qué hilos
existían en el instante exacto —algo que además exigiría leer `agentThreads`, cerrado más
arriba—; basta con que cada hilo se sirva a sí mismo la próxima vez que pregunta.

### 3. El framing

```ts
const textoDeNota = (texto: string): string =>
  `[la persona escribió mientras trabajabas: «${texto}»]`;
```

Para un hijo, "la persona" es ambigua —su interlocutor normal es el orquestador—, así que el texto
lo deja claro: es alguien fuera de la conversación entre él y quien le delegó.

### 4. Notas sobrantes al final del turno

Si el turno termina (verificador, juez, respuesta final) con notas que ningún hilo llegó a
consumir —nadie volvió a preguntarle al modelo antes de que el turno se cerrara—, no se pierden:
`turno()` en `sesionTrueforge.ts`, en su tramo final, comprueba `notas` y si queda alguna sin
`entregadaA` no vacío para NINGÚN hilo relevante, la concatena y la lanza como el siguiente
`turno()` en cuanto el actual devuelve — anunciado como acto de sistema, no en silencio.

### 5. El punto exacto de enganche: `consolaWeb.ts#recibir`, rama `clase === "prosa"`

Hoy, un mensaje `clase: "prosa"` (`consolaWeb.ts:399-413`) SIEMPRE se encola como
`LineaDeConsola` para que `correrConsola` (`cli/consola.ts`) la consuma en su turno — un bucle que
solo pide la siguiente línea cuando la anterior terminó del todo, así que hoy nada llegaría al
modelo hasta que el turno en curso cerrase de todas formas (el cliente solo evita que esto se
note, deshabilitando el compositor).

Ojo con el nombre: ese mismo fichero ya tiene una función local `anotar` (línea 403, el eco de lo
tecleado al transcript) — el método nuevo se llama distinto para no chocar: `agregarNota`.

`consolaWeb.ts` no sabe hoy si hay un turno en vuelo ni tiene una referencia a la sesión —eso vive
en `vestibulo.ts`, que es quien construye la `ConsolaWeb` y quien lleva `turnoEnVuelo`—, así que
`OpcionesDeConsolaWeb` gana un campo nuevo, inyectado desde `vestibulo.ts`:

```ts
/** Si hay un turno en marcha, intenta apuntar el texto ahí en vez de encolarlo como línea
 *  nueva. `true` si lo consumió así; `false` (o ausente) y `recibir` sigue el camino de hoy. */
notaMientrasTrabaja?: (texto: string) => boolean;
```

La regla en `recibir`, rama `clase === "prosa"`: si `notaMientrasTrabaja?.(mensaje.texto) ===
true`, no se encola `LineaDeConsola` (el turno en curso ya se hizo cargo); si no, el camino de hoy
sin cambios. No hace falta que esta rama compruebe además "¿hay algo pendiente?": una aprobación o
una pregunta viven en un DIÁLOGO aparte (`Aprobacion`/`Pregunta`/`Selector`, `App.tsx`) con su
PROPIO canal de respuesta —nunca el de "mandar un mensaje"—, así que ese caso no llega por aquí. Y
si llegara de todos modos (un cliente atrasado, una carrera) el diseño lo tolera solo:
`agregarNota` únicamente apila la nota en la cola de la sección 1 hasta que ALGÚN hilo vuelva a
preguntarle al modelo, o se manda como el siguiente turno si nadie lo hace — no revienta nada, se
entrega tarde.

Lo que sí evita el caso incómodo es el CLIENTE (sección 7): mientras un diálogo de aprobación o
pregunta está en pantalla, el compositor sigue deshabilitado, así que ese mensaje casi nunca se
llega a mandar por esta vía.

### 6. `SesionReal.agregarNota?` — opcional, TrueForge lo implementa, deepagents no

```ts
/** Añade una nota al turno EN MARCHA; no hace nada si no hay ninguno. Ausente en un motor que
 *  no lo soporta (deepagents). */
agregarNota?(texto: string): void;
```

`vestibulo.ts` construye `notaMientrasTrabaja` a partir de esto: `(texto) => { if
(!turnoEnVuelo || sesion.agregarNota === undefined) return false; sesion.agregarNota(texto);
return true; }`.

Se prueba contra la composición REAL del servidor web con una sesión TrueForge real —no contra un
doble—: es exactamente el patrón de fallo que `CLAUDE.md` nombra («una composición de producción
viviendo en un cierre que todos los tests doblan»).

### 7. El compositor

`disabled={!conectado || turnoEnVuelo}` pasa a `disabled={!conectado || hayPendiente}`, con
`hayPendiente` una prop NUEVA de `Compositor.tsx`, calculada en `App.tsx` a partir de lo que YA
sabe (`estado.aprobacion !== undefined || estado.pregunta !== undefined || estado.selector !==
undefined || estado.secreto !== undefined` — las mismas condiciones que hoy deciden si se pinta
uno de esos diálogos). El campo queda habilitado DURANTE el turno —para poder escribir una nota—
pero se deshabilita en cuanto aparece un diálogo de decisión, exactamente igual que hoy. Enter
sigue mandando por el mismo sitio de siempre. El botón se queda en "Parar" durante el turno — no
aparece un botón ni un aviso distintos para esto.

## Testing

Contra el `AgentThread`/`AgentThreadOrchestrator` REALES de la librería, con un `ILLM` doblado (el
mismo nivel al que ata `proyecto.test.ts` contra el backend real) — no contra la librería doblada,
que es donde este patrón de fallo se ha colado antes en este repo:

- Empujar una nota DURANTE la primera tool call de la raíz (antes de que resuelva) y comprobar que
  la SEGUNDA llamada al modelo ya la lleva en el contexto.
- Lo mismo con un hijo: la nota llega a su siguiente llamada, no a la de la raíz que lo creó (la
  raíz ya la habrá consumido si fue ella quien preguntó primero, y el hijo la recibe también, por
  separado, en su propia primera llamada).
- Dos especialistas activos a la vez: una nota llega a los DOS.
- Un hijo de motor EXTERNO no la recibe (no tiene capacidades) — se comprueba que no revienta, no
  que la reciba.
- Una nota que nadie consume antes de que el turno cierre se manda como el siguiente `turno()`.
- Un mensaje `user` insertado justo después de resultados de tool sigue siendo válido al pasar por
  los adaptadores de `modeloLangchain.ts` (el merge de mensajes de Anthropic en particular: un
  `user` puede acabar junto a otro `user` si el turno se resume justo después).

## Ficheros que cambian

- `agent/motores/trueforge/capacidades.ts` — `capacidadDeNotas`, nueva.
- `agent/motores/trueforge/notas.ts` — nuevo: `Nota`, `textoDeNota`, la lógica de entrega/sobrantes
  (separado de `capacidades.ts` para poder probarlo sin construir un `AgentThread`).
- `agent/motores/trueforge/sesionTrueforge.ts` — la cola `notas`, `agregarNota()` en el objeto
  devuelto, la pieza añadida a la raíz y a cada hijo de motor `"modelo"`, y el envío de sobrantes
  al cerrar el turno.
- `agent/turno/sesionReal.ts` — `agregarNota?` en la interfaz `SesionReal`.
- `web/servidor/consolaWeb.ts` — `OpcionesDeConsolaWeb.notaMientrasTrabaja?`, consultado en
  `recibir`, rama `clase === "prosa"`, ANTES de encolar la `LineaDeConsola`.
- `web/servidor/vestibulo.ts` — construye `notaMientrasTrabaja` a partir de `turnoEnVuelo` y
  `sesion.agregarNota`, y se lo pasa a `crearConsolaWeb`.
- `apps/web/src/App.tsx` — la prop `hayPendiente` que calcula a partir de `estado.aprobacion` /
  `estado.pregunta` / `estado.selector` / `estado.secreto`, pasada a `Compositor`.
- `apps/web/src/componentes/Compositor.tsx` — `disabled` pasa de mirar `turnoEnVuelo` a mirar la
  prop nueva `hayPendiente`.

## Qué no se hace en este trabajo

- No se toca `deepagents` (decisión explícita, como en IXCODE-5).
- No se soporta en TUI ni en el terminal.
- No se resuelve "activo en el instante exacto en que escribiste": la entrega es "próxima llamada
  de cada hilo que aún no la tiene", que puede alcanzar a un especialista creado justo después de
  escribir la nota. Documentado arriba, no es un bug.
- No cambia nada del camino de aprobación/pregunta ya pendiente: sigue exactamente como hoy.
- No se toca `agentThreads` ni se aborta nada: el mecanismo entero vive en un punto de extensión
  público de la librería.
