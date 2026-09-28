# Mensajes mientras el agente trabaja (IXCODE-4)

> Reescrito el 28-09-2026 tras dos pruebas reales en el navegador (MyAllXOne). La primera versión
> (25-09) entregaba cada nota a TODOS los hilos y dibujó un diagrama dos veces; esta dice el
> diseño que quedó, lo que se midió para llegar a él y lo que sigue sin cubrirse.

Lo que pidió la persona: poder escribir mientras el agente trabaja y que **de verdad se incorpore
al plan**, y que si un especialista ya estaba haciendo algo **no se haga dos veces**. Y poder
decirle «para» para cambiar de plan.

Hay dos gestos, y el resto del documento es cómo funciona cada uno:

| gesto | qué hace | cómo se pide |
|---|---|---|
| **Añadir** (una nota) | lo escrito entra en el trabajo en marcha sin pararlo | Enter, como siempre |
| **Detener y replanificar** | los especialistas en marcha cierran con un resumen de lo hecho y el orquestador replanifica con eso y con lo escrito | botón, junto a Parar |
| Parar (ya existía) | corta el turno entero; lo de los especialistas se pierde | botón rojo |

## Alcance

- **Solo TrueForge.** `deepagents` se queda fuera, por decisión explícita, como en IXCODE-5. Todo lo
  añadido al contrato es opcional (`SesionReal.agregarNota?`, `SesionReal.detener?`).
- **Solo la consola WEB.** El terminal y la TUI leen stdin línea a línea de forma bloqueante.
- **Solo con el agente trabajando en silencio.** Con una aprobación o una pregunta en pantalla, el
  compositor sigue apagado (`hayPendiente`): escribir competiría con la respuesta que se espera.

## Por qué la librería no deja hacerlo «por la puerta»

Verificado en el código de `@truefoundry/trueforge-core`:

- `AgentThreadOrchestrator.send()` lanza `InvalidAgentSendInputError("Cannot process user messages
  while sub agents are running…")` en cuanto hay más de un hilo en el árbol.
- `AgentThread.send()` rechaza un mensaje de usuario con aprobaciones o preguntas pendientes.
- `execute()` recibe UNA señal compartida por la raíz y todos los hijos: abortarla es Parar.
- `agentThreads` está declarado `private readonly` en el `.d.ts`.

Así que no hay forma de meter un mensaje «normal» en un turno en curso. Lo que sí hay es un punto
de extensión público: **`AgentCapability.preLLMProcessors`**. Corre antes de CADA llamada al modelo,
en la raíz y en cada hijo (`AgentThread.stepLLMCall`), y puede devolver un
`internal.agent.context.append` que **persiste** un mensaje `user` en el contexto de ese hilo. Sus
tipos no se reexportan desde el punto de entrada público, así que se escriben a mano contra
`Record<string, unknown>`, como ya hacen `capacidadDeRecortes`/`capacidadDeFecha`.

Y hay una segunda palanca, que es NUESTRA: **el modelo de cada hijo lo construimos nosotros**
(`modeloParaTrueforge`, uno por hilo en `crearHijo`). Es él quien recorre el stream de LangChain y
quien le devuelve a la librería la respuesta completa, así que puede cortar el stream de UN hijo y
devolver otra cosa sin que la librería se entere.

## 1. Añadir: una nota con UN dueño

`agent/motores/trueforge/notas.ts` (puro), entregada por `capacidadDeNotas` (`capacidades.ts`), una
sola instancia por sesión montada en la raíz y en cada hijo de motor `"modelo"`.

### Lo que se midió y tumbó la primera versión

La primera versión entregaba cada nota **a cada hilo que aún no la tuviera**. En la prueba real
(«analiza las colecciones» y, a mitad, «y créame un diagrama»):

1. La nota llegó mientras el orquestador estaba dentro de la llamada que acabó delegando en
   `analyst-xone`, así que él no la vio.
2. El analista nació justo después, la recibió en su primera llamada, y dibujó el diagrama (se
   comprobó que el encargo del orquestador no decía «diagrama»).
3. Al volver, el orquestador recibió **la misma nota, igual de nueva**. Vio que ya había un mapa,
   pero la nota le pedía un diagrama, así que se lo encargó a `designer-xone`. Dos diagramas.

El fallo no era de prompt: nadie sabía que otro ya la había atendido.

### La regla

- **Si trabaja UN solo hijo, la nota es suya** (`textoDeNotaParaHijo`). La incorpora si le cabe en
  el encargo; si no, no la hace y termina su respuesta con «PENDIENTE DE LA PERSONA: …», para que
  quien le delegó la replanifique.
- **Con VARIOS en paralelo no es de ninguno.** Dársela al primero que llame es una carrera; dársela
  a todos es el bug de arriba. La recibe el orquestador al volver, como encargo.
- **Sin hijos trabajando, es del orquestador** (`textoDeNota`), que es quien planifica.
- **El orquestador la ve SIEMPRE.** Si ya tenía dueño, como INFORMACIÓN (`textoDeNotaYaEntregada`):
  a quién se le pasó, que su respuesta está arriba y que NO la vuelva a encargar.
- **Un hijo nacido cuando la nota ya tiene dueño —o ya la vio el orquestador— no la recibe**: el
  orquestador la tiene en cuenta al delegar.

«Trabajan a la vez» son los hijos nacidos de la **última llamada del orquestador**
(`detencion.ts#hijosVivos`): mientras un hijo vive, el orquestador espera su resultado y no vuelve
a llamar al modelo, así que lo nacido de llamadas anteriores ya terminó. Un hijo de motor EXTERNO
no pasa por los procesadores y nunca se la queda: la recoge el orquestador.

### Lo que nadie se quedó

Si el turno cierra con una nota sin dueño, sale como el turno siguiente (`notasSobrantes` →
`vestibulo.ts` lo dispara), con un aviso que lo dice. **Salvo que el turno se haya PARADO** (ver §3).

## 2. Detener y replanificar

`agent/motores/trueforge/detencion.ts` (el control, puro), por el MISMO procesador que las notas y
por el modelo de cada hijo (`modeloLangchain.ts`).

La persona lo propuso como «si le escribo "para" o "detente"». Se hizo con un **botón**, porque en
castellano «para» es también una preposición («créame un diagrama para Menu» pararía el trabajo) y
«para el emulador» es ambiguo de verdad.

### A quién se detiene

A los hijos nacidos de una llamada del orquestador que **empezó antes de pulsar**. No basta «los
vivos al pulsar»: si se pulsa mientras el orquestador está decidiendo delegar, el hijo que sale de
esa decisión nace después, pero de un plan que la persona ya no quiere. Los que el orquestador
delegue DESPUÉS de leer la orden corren normal: son el plan nuevo.

### Qué recibe cada uno

**No es una nota, y a propósito**: si viajara por la cola de notas, el hijo pararía y el
orquestador… volvería a encargar lo mismo. Cada destinatario recibe SU texto:

- el hijo: «para aquí, no hagas ninguna llamada más; di qué has hecho y dónde, y qué te quedaba»
  (`textoDeDetencionParaHijo`);
- el orquestador: «los especialistas han parado, su resumen está en su respuesta; replanifica sin
  repetir lo hecho, y si vuelves a delegar, di qué está hecho y qué cambia»
  (`textoDeDetencionParaRaiz`).

### Cómo para un hijo sin tocar la librería

Una respuesta del modelo **sin tool calls** cierra el hilo con normalidad (`AGENT_DONE`) y su texto
le llega al padre como resultado de `create_sub_agent`. Así que:

- **Entre llamadas**: la orden entra por el procesador antes de su siguiente llamada, y su modelo
  **filtra las tool calls** de esa respuesta (del stream y del mensaje final). Se filtra la SALIDA y
  no se le quitan las tools: con el historial lleno de llamadas, algún proveedor rechaza una
  petición sin la definición de tools. Si tras filtrar no queda texto, va un relleno
  (`RESUMEN_DE_RELLENO`) y no un vacío.
- **A mitad de una llamada** (el caso que se midió, abajo): cada hijo lleva su `AbortController`,
  que corta SOLO su stream. El modelo del hijo captura ese aborto —y solo ése: el del turno se
  relanza— y **pide el resumen en el acto**, con lo que ya había dicho y la orden al final, sin tool
  calls. A la librería le llega UNA respuesta normal de texto. `modeloLangchain.ts#corte`.

### Lo que se midió

- **Con el botón, primera versión (sin corte)**: se pulsó con el analista dentro de una llamada de
  60 s que generaba el informe entero. Esa llamada terminó, el informe se escribió (19 KB, que ya no
  se quería), y la orden llegó en la llamada siguiente. El resumen y la replanificación sí fueron
  buenos: el orquestador dio el informe por obsoleto, no repitió el análisis, y preguntó el alcance
  del diagrama antes de delegarlo.
- **Con el corte**: se pulsó con el analista 22 s dentro de una llamada. Cerró 2 s después **sin
  escribir nada**, con un resumen que separaba lo verificado («no repetir») de lo pendiente, y el
  orquestador delegó el diagrama en `designer-xone` con esos hechos dentro.

## 3. Parar, después de todo esto

Parar sigue siendo cortar el turno entero (`SesionReal.cancelar`). Dos cosas se midieron en la
prueba y se arreglaron:

- **Lo que nadie leyó NO arranca otro turno tras Parar.** Antes sí: tras pulsar Parar, lo sobrante
  salió como el turno siguiente y el orquestador se puso a trabajar sin que nadie lo pidiera. Ahora
  no se manda, y un aviso lo enseña **con su texto**, para poder copiarlo. Venía de las notas de la
  primera versión.
- **Una segunda pulsación de Detener no remanda la primera.** Se juntaba con el texto que el
  orquestador ya había leído, y como nadie lo volvía a leer, salía como sobrante. Ahora solo se
  junta con lo que aún nadie ha leído.

## 4. El cable y la web

- **Añadir**: la prosa que llega con el turno en vuelo va a `SesionReal.agregarNota` en vez de a la
  cola del lazo (`consolaWeb.ts#recibir`, `OpcionesDeConsolaWeb.notaMientrasTrabaja`, construida en
  `vestibulo.ts`).
- **Detener**: la MISMA prosa con `detener: true` (`{ clase: "prosa"; texto; detener?: true }`, en
  `transporte.ts` y redeclarado en `apps/web/src/tipos.ts`) va a `SesionReal.detener`
  (`detenerMientrasTrabaja`). Sin texto no deja acto de usuario. Si ya no encuentra turno, con texto
  se encola como prosa normal y vacío no manda nada.
- **Si el turno lo admite lo dice el SERVIDOR**: `{ clase: "turno"; activo; detenible?: true }`.
  En el primer turno la sesión se anuncia DESPUÉS del flanco del turno, así que el vestíbulo
  reanuncia el turno cuando llega la sesión; también va en la ráfaga de bienvenida
  (`turnoDetenible`).
- **El compositor**: el campo sigue escribible con el turno en vuelo y se apaga con algo pendiente
  (`hayPendiente`). «Detener y replanificar» se pinta solo con turno en vuelo, nada pendiente y un
  turno que lo admita; manda lo escrito (puede ir vacío) y vacía la caja. Rol `secundario` de
  `Boton.module.css`, junto a Parar.

## Límites declarados

- **Detener no corta un comando de shell en curso.** Visto en vivo: con el `device-controller`
  dentro de un comando colgado, Detener no hizo nada hasta que se pulsó Parar. La orden llegaría en
  la llamada siguiente al terminar el comando.
- **Los especialistas de motor EXTERNO no reciben notas ni se detienen**: son una sola llamada a
  otro proceso. Solo Parar los corta.
- **La llamada cortada no se cuenta en tokens**: su stream se corta antes de traer el uso. Se cuenta
  la del resumen.
- **La regla del dueño no sabe si un hijo ha terminado ANTES que su hermano**: cuenta a los dos como
  vivos hasta que el orquestador vuelve a llamar, y entonces la nota la decide el orquestador. Es
  el lado seguro.
- **Un hijo al que le cae la nota puede no ser el especialista adecuado** (en la prueba, el analista
  dibujó un diagrama que por reglas es de `designer-xone`). Se decidió que lo haga si puede: fue lo
  más rápido y funcionó. La salida es la línea «PENDIENTE DE LA PERSONA».

## Testing

Contra el `AgentThread`/`AgentThreadOrchestrator` REALES con el modelo doblado, nunca con la
librería doblada:

- `notas.test.ts` y `detencion.test.ts`: las reglas, puras.
- `sesionTrueforge.test.ts`:
  - el diagrama doble (la nota escrita mientras el raíz delega);
  - dos hijos en paralelo;
  - el raíz dueño que no la reparte;
  - Detener entre llamadas, con la tool pedida tras la orden sin ejecutar y el hijo re-delegado
    corriendo normal;
  - Detener a mitad de una llamada lenta que respeta la señal;
  - Parar que no se traga el corte;
  - lo sobrante tras Parar.
- Los tests se comprobaron **mutando** el mecanismo: quitar el filtro, el `abort()`, el registro de
  nacimientos o el conteo de vivos los tumba.
- `vestibulo.test.ts`, `consolaWeb.test.ts` y `Compositor.test.tsx`: el cableado de Detener de punta
  a punta, incluido el reanuncio del primer turno.

## Ficheros

- `agent/motores/trueforge/notas.ts`, `detencion.ts` (nuevo), `capacidades.ts#capacidadDeNotas`,
  `modeloLangchain.ts` (`soloTexto`, `corte`), `sesionTrueforge.ts` (`agregarNota`, `detener`, la
  cuenta de vivos, lo sobrante y Parar).
- `agent/turno/sesionReal.ts` (`agregarNota?`, `detener?`).
- `web/servidor/consolaWeb.ts`, `vestibulo.ts`, `transporte.ts`, `arranque.ts` (la ráfaga).
- `apps/web/src/tipos.ts`, `store.ts` (`turnoDetenible`), `App.tsx`, `componentes/Compositor.tsx` y
  su hoja.
