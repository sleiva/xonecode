# PROBLEMA

Hay que construir **xonecode**: una consola CLI para terminal, al estilo de opencode,
que conduzca a un agente de IA que desarrolla aplicaciones XOne.

Vivirá en `lab/src/xonecode/` de un proyecto TypeScript ya existente. Esa carpeta está
vacía hoy.

Se pide una propuesta de arquitectura y un orden de construcción.

---

## 1. Qué es XOne

Plataforma propietaria de apps móviles nativas. Se programa con XML (ficheros `.xne`),
JavaScript ES5 (sin `async/await`, sin template literals, sin spread) y un CSS
propietario. **No es desarrollo web**: no existe el DOM, ni `fetch` idiomático, ni
ningún framework tipo React/Vue.

El proyecto del cliente no está en disco: vive en un servidor (CloudStudio) y se accede
por dos servidores MCP que publican 66 tools (leer/escribir colecciones, scripts, CSS,
ficheros, SQL, control de un dispositivo físico, y un IDE).

---

## 2. Restricciones duras

- **TypeScript**, Node. Stack fijado: LangChain 1.x, LangGraph 1.x, `deepagents`,
  Ink (React para terminal) ya está en las dependencias.
- Multi-proveedor de modelo: Gemini, OpenAI, Anthropic y **Ollama local** (el usuario
  tiene 24 modelos, varios con tool-calling; los frontier de pago no son la vía por
  defecto — el coste importa).
- Tiene que poder probarse **sin llamadas a API, sin red y sin CloudStudio**. Es un
  laboratorio de experimentos: la suite actual son 129 tests offline y esa propiedad
  no se puede perder.
- El usuario ejecuta y mira. Cada fase tiene que producir algo que él pueda correr en
  su terminal y ver, no solo tests en verde.

---

## 3. Material que YA existe y hay que reutilizar (no reescribir)

En `lab/src/`, con tests:

- `deepagents/deep-agent-xone/` (~2.700 líneas): un agente deepagents montado y
  funcionando — un orquestador sin tools que delega en 4 especialistas (`docs`,
  `planner`, `dev`, `mockup`), cada uno con una lista blanca de tools MCP; aprobación
  humana por cada escritura; arranque de sesión MCP y OAuth; un diagnóstico (`doctor`);
  y un medidor de solape entre subagentes.
- `shared/skillLoaders/`: catálogo, carga, poda y paginado de skills.
- `shared/model.ts`: fábrica multi-proveedor.
- `shared/tokenTracking.ts`, `tokenBreakdown.ts`: coste por turno.
- `console/`: una TUI Ink de 644 líneas que ya conversa con el agente, con streaming,
  aprobaciones y panel de estadísticas. Es un prototipo: la lógica del turno está
  dentro de un `useCallback` de React.
- `lab/skills/`: seis skills de XOne en markdown, encadenadas
  (spec-builder → plan-builder → project-generator | development → review | debugging).

---

## 4. Hechos medidos que condicionan la solución

Salen de un harness Python equivalente que lleva meses en producción, y de mediciones
propias del lab. **No son opiniones.**

1. El catálogo completo de las 66 tools MCP son **~27.500 tokens** de prompt. Tres
   tools son el 35% de eso. No cabe entero junto a las skills.
2. Un turno de trabajo del agente dura **entre 100 y 300 segundos**. Hasta que el
   agente contesta, el chat está mudo.
3. Un especialista de documentación gasta **7-13 llamadas a tools por pregunta**; un
   turno de desarrollo consultó documentación **16-18 veces**. Notificar cada llamada
   son más de treinta líneas de estado por turno.
4. En LangGraph, un grafo compilado invocado **dentro** de un nodo corre con
   `checkpoint_ns` no vacío y **sus tokens no llegan al stream** salvo que se lea con
   `subgraphs: true`. El modo de fallo es **mudo**: no lanza, simplemente no aparece nada.
5. El modo de stream `messages` emite los trozos del LLM **y** todo mensaje nuevo que
   un nodo añada al estado. Medido con tres formas de retorno distintas: si el nodo que
   habla devuelve un objeto `AIMessage` **nuevo**, la consola pinta la respuesta **dos
   veces**; si devuelve el mismo objeto, una sola vez (LangGraph lo reconoce por su `id`).
6. Los modos `updates` y `messages` **se intercalan** en el mismo tramo del stream.
7. Si se escribe cada trozo del stream con una llamada que añade `\n`, la respuesta sale
   partida en una línea por trozo. Y sin `flush` explícito, la salida se queda en el
   buffer y el streaming no se ve — un fallo que solo se manifiesta en procesos de
   larga duración.
8. Con `interrupt()` de LangGraph y un orquestador que lanza dos subagentes en un turno,
   quedan **dos interrupts pendientes a la vez**. El resume tiene que ser un mapa por id;
   un array pelado falla. Y el interrupt **no dice de qué subagente viene**.
9. Un agente al que se le pide por prompt que avise de algo (p. ej. «di que este
   componente es un mock») **a veces no avisa**.
10. Un aviso que se muestra cuando no ha pasado nada relevante **enseña al usuario a
    ignorarlo**. Medido: un aviso cuya condición dependía de un dato persistente
    aparecía en todos los turnos posteriores al primero, incluido «cuéntame un chiste».
11. `deepagents` añade por defecto un subagente `general-purpose` con acceso al sistema
    de ficheros y cero capacidad de XOne. Una pregunta desviada ahí devuelve una
    respuesta inventada.
12. Las tools MCP de este sistema llevan en sus argumentos el contenido de ficheros y
    el token de autenticación.

---

## 5. Qué tiene que hacer xonecode

- Conversar en la terminal con el agente, en streaming, turno a turno sobre el mismo hilo.
- Enseñar qué está haciendo mientras trabaja (los 100-300 s del hecho 2).
- Pedir aprobación humana antes de cada escritura sobre el proyecto del cliente.
- Dejar ver, sin gastar una llamada al modelo, qué hay montado: qué tools, qué skills,
  qué prompts, qué coste.
- Poder correr también en un disparo, no interactivo, para tuberías y CI.

---

## 6. Qué se pide

Una arquitectura y un orden de construcción. En particular:

- Cómo se organiza el código y por qué.
- Cómo se consigue la propiedad del punto 3 de §2 (probar sin API, sin red, sin
  CloudStudio) sin llenar el código de ramas de test.
- Cómo se reparte la responsabilidad entre lo que decide qué hacer y lo que lo pinta.
- Qué se construye primero y qué se deja para después, y con qué criterio.
- Qué riesgos ves y qué no puedes verificar con lo que aquí se te da.
