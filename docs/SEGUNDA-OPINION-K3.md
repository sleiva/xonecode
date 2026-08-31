# Segunda opinión independiente (kimi-k3) — propuesta para xonecode

> **Aislamiento verificado.** Este despacho corrió desde un directorio que contenía
> ÚNICAMENTE `PROBLEMA.md`, y el log de la sesión registra **una sola operación**:
> `Read PROBLEMA.md`. Ni exploración del repo, ni lectura de `DISENO.md`.
>
> Hizo falta el aislamiento porque el primer intento salió contaminado: el modelo
> exploró el árbol del proyecto por su cuenta, encontró `DISENO.md` y escribió
> «mi propuesta los respeta y los extiende». La contaminación no vino del enunciado
> —que estaba limpio— sino del DIRECTORIO. Esa propuesta se descartó entera.
>
> Se conserva sin editar. La reconciliación con `DISENO.md` está en su §13.

---


> build · kimi-k3:cloud

→ Read PROBLEMA.md
# Propuesta para xonecode

## 0. Lectura del problema en una frase

Todo el conocimiento difícil ya está medido (los 12 hechos). El trabajo no es descubrir nada, es **no tropezar con lo que ya se sabe que muerde**. La arquitectura se deduce casi por completo de §4.

---

## 1. Arquitectura: núcleo puro + cáscaras finas

La decisión estructural principal viene dictada por dos restricciones: (a) hay que probar sin API, red ni CloudStudio, y (b) el mismo agente tiene que vivir en una TUI Ink interactiva y en un modo un disparo para CI. Eso obliga a separar **lo que decide** de **lo que pinta**, con una frontera estricta:

```
lab/src/xonecode/
├── core/            # TypeScript puro. Sin Ink, sin React,
│   │                # sin imports de langchain/langgraph/mcp.
│   ├── events.ts    # Tipos de eventos de dominio del turno
│   ├── turnEngine.ts
│   ├── notices.ts   # Avisos deterministas (hechos 9 y 10)
│   ├── activity.ts  # Agregación de actividad de tools (hecho 3)
│   └── approvals.ts # Política de aprobación (qué se aprueba, no cómo se pinta)
├── agent/           # Adaptador: envuelve deep-agent-xone
│   └── xoneAgent.ts # runTurn(input) -> AsyncIterable<DomainEvent>
├── ports/           # Costuras para testabilidad
│   ├── modelPort.ts # -> satisfecho por shared/model.ts
│   └── toolPort.ts  # -> satisfecho por MCP real o por fixtures
├── ui/              # Cáscara Ink: solo renderiza DomainEvents
├── cli/             # Cáscara un disparo: misma core, writer stdout
└── inspect/         # Comandos sin modelo: tools, skills, prompts, stats
```

**Reglas de importación** (esto es lo que hace barato el cumplimiento de §2.3):

- `core` no importa nada de LangChain, LangGraph, MCP, Ink o React.
- `ui` y `cli` no importan nada de LangChain, LangGraph o MCP: solo reciben eventos tipados y devuelven comandos (`UserText`, `Approve(id)`, `Reject(id)`).
- `agent` es el **único** sitio donde viven LangGraph, `deepagents` y las particularidades del stream. Toda la suciedad medida en los hechos 4–8 se contiene ahí.

### Contrato central: un stream de eventos de dominio

El agente se expone como una única función con forma `runTurn(input) -> AsyncIterable<DomainEvent>`, con eventos del estilo:

- `ModelChunk` (texto del LLM, ya desduplicado por `id` — hecho 5)
- `ToolActivity` (agregado: «docs consultando documentación (3ª vez)», no una línea por llamada — hecho 3)
- `ApprovalRequested { id, origin, summary }` (mapa por id, con el origen resuelto — hecho 8)
- `Notice` (calculado por `core`, no por el modelo — hecho 9)
- `TurnEnded { stats }` (de `shared/tokenTracking`)

Con esto, la TUI deja de tener «la lógica del turno dentro de un `useCallback`»: el componente se convierte en un renderizador tonto. La consola `console/` existente se reutiliza como capa de presentación, pero la lógica migra a `core`. Esa migración es, de hecho, la refactorización que el prototipo está pidiendo.

---

## 2. Testabilidad offline sin ramas de test

La técnica es **inyección en los puntos de composición**, no condicionales:

1. **Puertos estrechos.** `ModelPort` ya existe de facto: es `shared/model.ts`, la fábrica multi-proveedor. Se añade un proveedor más, `"scripted"`, que reproduce respuestas desde fixtures JSON. `ToolPort` envuelve las 66 tools MCP; la implementación offline sirve esquemas y respuestas grabados.
2. **Los dobles viven fuera del código de producción** (en `lab/test/fixtures/`). En `xonecode/` no aparece ningún `if (test)`: los entrypoints (`ui`, `cli`) eligen implementación real; los tests eligen las guionizadas.
3. Consecuencia útil: un turno completo (entrada → stream de eventos → aprobación → salida) se testea como una **función pura sobre iterables**, sin terminal, sin reloj real, sin red. Los 129 tests offline existentes no se tocan y la propiedad se conserva por construcción.
4. Opcional y barato: un modo **grabador** que, cuando sí hay CloudStudio, vuelca esquemas y respuestas MCP a fixtures. Esto alimenta los dobles offline con datos reales — coherente con que esto es un laboratorio de experimentos.

---

## 3. Cómo cada hecho medido condiciona el diseño

| Hecho | Consecuencia arquitectónica |
|---|---|
| 1 (66 tools ≈ 27.5k tokens) | La lista blanca por especialista se mantiene tal cual (ya existe). Además: esquemas compactos en el adaptador (descripción mínima), y presupuesto de tokens medible por turno vía `tokenTracking`. Cualquier optimización adicional (p. ej. carga perezosa de detalle de tools) queda **aplazada hasta tener medición**, no antes. |
| 2 (turnos de 100–300 s) | `core` emite eventos de fase (qué subagente está activo, tiempo transcurrido); la UI muestra un indicador vivo. Es un requisito del diseño de eventos, no un adorno final. |
| 3 (7–18 llamadas por turno) | `ToolActivity` es un **agregado** con contador, no un log. La UI pinta una línea rodante. |
| 4 (`checkpoint_ns`, stream mudo) | En el adaptador, toda invocación anidada se lee con `subgraphs: true`. Va con test de regresión explícito, porque el modo de fallo es silencioso: sin ese test, nadie se entera. |
| 5 (doble pintado por `AIMessage` nuevo) | El adaptador desduplica por `id` de mensaje antes de emitir `ModelChunk`. La corrección «devolver el mismo objeto» se mantiene en `deep-agent-xone`, pero la consola no depende de ella: defensa en profundidad. |
| 6 (`updates` y `messages` intercalados) | Un único multiplexor en `agent/` que convierte ambos modos en la secuencia única de `DomainEvent`. Nada de esa dualidad llega a `core`. |
| 7 (`\n` por trozo, falta de flush) | En el modo un disparo, un writer propio: concatena sin `\n` y hace flush explícito por trozo. En Ink hay que **verificar** cómo se comporta con trozos de alta frecuencia (ver §6). |
| 8 (dos interrupts, resume por mapa, sin origen) | `approvals.ts` modela las aprobaciones como **mapa id → petición** desde el primer día. El origen («qué subagente pide escribir») se intenta derivar del namespace que aporta `subgraphs: true`; si no es posible, heurística por tool (lista blanca del especialista). Marcado como riesgo en §6. |
| 9 (el modelo a veces no avisa) | **Ningún aviso obligatorio se delega al modelo.** Los avisos (p. ej. «este componente es un mock») los calcula `core/notices.ts` a partir de hechos del estado/artefactos. |
| 10 (aviso que se repite enseña a ignorarlo) | Las condiciones de aviso se evalúan **por diferencia respecto al turno anterior**: un aviso solo se emite cuando su hecho disparador cambia, nunca por persistencia de un flag. |
| 11 (`general-purpose` alucina) | En la configuración de `deepagents` dentro del adaptador, la lista de subagentes es **exactamente** los 4 especialistas; se elimina el subagente por defecto con acceso a filesystem. |
| 12 (token y contenido en argumentos de tools) | Una capa de **redacción** en `agent/` y en `inspect/`: antes de pintar o persistir cualquier argumento de tool, se enmascara el token de autenticación y se trunca el contenido de fichero. No es configurable: está siempre activa. |

---

## 4. Orden de construcción

Criterio de orden, derivado de §2.4 («ejecuta y mira») y de la naturaleza de los hechos:

1. **Cada fase produce algo corrible en terminal**, no solo tests verdes.
2. **Primero lo que puede romper el esqueleto**: los fallos de streaming (hechos 4–7) invalidan todo lo demás; se atacan antes que cualquier funcionalidad.
3. **Offline primero, real después**: cada fase nace con su doble guionizado.

**Fase 1 — Esqueleto andante (offline, visible).** `core/events`, `turnEngine`, modelo `"scripted"`, y el entrypoint de **un disparo** (`cli/`) con writer con flush. Se ve texto en streaming en la terminal sin red. Prueba el hecho 7 en el contexto más simple posible. *Es la fase más barata y la que fija el contrato de eventos del que todo depende.*

**Fase 2 — TUI sobre el núcleo.** Se porta `console/` a renderizar `DomainEvent`: streaming, indicador de fase/tiempo (hecho 2), línea agregada de actividad de tools (hecho 3). Sigue con modelo guionizado: toda la interacción se depura sin gastar un token.

**Fase 3 — Adaptador del agente real con modelo local.** Se conecta `deep-agent-xone` vía `agent/`, con `subgraphs: true`, multiplexor updates/messages, desduplicación por `id` (hechos 4–6) y **Ollama local como primer proveedor real** (coste cero, coherente con §2: los frontier de pago no son la vía por defecto). Aquí se añade la política de aprobación como mapa por id y la UI de aprobación (hecho 8), y la configuración que elimina `general-purpose` (hecho 11).

**Fase 4 — Inspección sin modelo.** Comandos `tools / skills / prompts / stats` reutilizando `shared/skillLoaders` y `tokenTracking`. Barato, y convierte el presupuesto de tokens (hecho 1) en algo visible por turno.

**Fase 5 — Avisos deterministas y redacción.** `notices.ts` con disparo por diferencia (hechos 9 y 10) y la capa de enmascaramiento (hecho 12), más integración del `doctor` existente.

**Se deja para después** (con criterio): OAuth y arranque MCP en el flujo interactivo completo, control del dispositivo físico, medidor de solape integrado en la UI, y cualquier optimización del catálogo de tools más allá de listas blancas + esquemas compactos. Criterio del aplazamiento: nada de ello rompe el esqueleto si falla, y varios puntos requieren CloudStudio real, que es justo lo que las primeras fases deben evitar.

---

## 5. Qué asumo explícitamente

1. **Que `deep-agent-xone` es importable como biblioteca** con cambios menores (inyectar sesión MCP y configuración), y no un script acoplado a su propio arranque. Si el arranque OAuth/MCP está entrelazado con la construcción del agente, la fase 3 crece.
2. **Que la aprobación humana actual usa `interrupt()` de LangGraph** — el hecho 8 habla de interrupts pendientes, lo que lo sugiere fuertemente, pero no lo dice literalmente.
3. **Que la lista de subagentes de `deepagents` es sustituible por completo** (poder excluir `general-purpose`). Es la lectura natural del hecho 11, pero no se afirma.
4. **Que los componentes Ink de `console/` sobreviven como capa presentacional** una vez extraída la lógica del `useCallback`. Si mezclan renderizado con estado del stream de forma inseparable, la fase 2 es reescritura parcial, no port.
5. **Que existe un gestor de tests ya configurado** en el proyecto (los 129 tests offline lo implican) y que xonecode hereda esa infraestructura.
6. **Que el enmascaramiento del token es seguro a nivel de cliente**: si el token forma parte indistinguible del contenido de ficheros, la redacción puede ser imperfecta.
7. **Que en modo un disparo las aprobaciones se resuelven con una política explícita** (flag tipo `--approve-all` o fallo en seco ante escrituras). Es una decisión de diseño que PROBLEMA.md no toma.

---

## 6. Qué NO puedo verificar con la información dada

1. **Las APIs exactas de LangChain 1.x / LangGraph 1.x / `deepagents` en las versiones fijadas**: firmas de streaming, si `subgraphs: true` expone namespace para los interrupts, y la forma exacta del mapa de resume. Los hechos me dan los nombres (`interrupt()`, `checkpoint_ns`, `messages`, `updates`), no las garantías de la API actual.
2. **Si el namespace de subgrafo identifica el subagente en un interrupt** (hecho 8). Es la única vía limpia para el origen de la aprobación; si no, toca heurística por tool, que es frágil.
3. **El comportamiento de Ink con trozos de alta frecuencia** (hecho 7). El fallo de flush está medido en procesos de larga duración con escritura cruda; no puedo saber si Ink reproduce el mismo problema o lo absorbe con su ciclo de render.
4. **La fidelidad de tool-calling de los 24 modelos Ollama concretos.** «Varios con tool-calling» no dice cuáles aguantan un turno de 16–18 consultas a documentación sin degradarse. Esto puede obligar a reordenar lo que hoy delega el orquestador.
5. **Si las listas blancas actuales bastan para que quepan prompts + skills** (hecho 1). Sin los tamaños resultantes por especialista, la estrategia de esquemas compactos es una apuesta razonable, no una certeza. La fase 4 existe en parte para medirlo.
6. **La cobertura real de los 129 tests sobre `shared/` y `deep-agent-xone`**: determina cuánto riesgo hay al envolverlos sin tocarlos.
7. **Si los esquemas MCP recortados los acepta el servidor** en llamadas reales (asumo que el esquema detallado es solo texto de prompt del lado cliente; validación real en §2 del harness lo confirmaría, pero no está en el documento).
8. **Nada sobre la frecuencia/semántica de los modos de stream más allá de lo medido**: los hechos describen comportamiento observado, no garantizan que sea estable entre versiones menores de LangGraph — de ahí que hechos 4–8 exijan tests de regresión contra la versión fijada, no contra documentación.
