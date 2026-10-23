# Harness², estudiado: qué se trae y qué no

Harness² (Google, Apache 2.0; copia local en `/Users/projects/harnees/harness2`, paper arXiv 2610.14224) no es un
harness de trabajo: es un **optimizador de harnesses**. Este documento guarda lo que se vio al estudiarlo, lo que ya
se trajo y lo que queda, para no reabrir el análisis.

## Qué hace

Para cada tarea, sin respuesta correcta conocida y con el modelo fijo:

1. **Base**: corre el agente k veces con el harness de partida.
2. **Propose**: un editor propone cambios en dos ejes separados a propósito:
   - **INV**, cómo TRABAJA el agente: tools, reintentos, orden, scripts para lo mecánico repetido.
   - **DOM**, qué SABE un profesional del tema: skills con disparador, reglas comprobables.
3. **Probe**: corre cada candidato UNA vez.
4. **Compose**: un compositor fusiona lo que las trayectorias justifican, adopta un candidato entero o deja el
   harness como estaba (`KEEP_BASE`, «una respuesta válida, no un fallo»).
5. **Select**: un selector ELIGE A CIEGAS entre los resultados (ids barajados, sin saber cuál es el de partida).
6. **Reflect**: un reflector escribe en una librería por dominio qué hizo cada cambio y, si la evidencia lo
   sostiene, UNA lección que transfiera. Las tareas siguientes del dominio la leen antes de proponer.

El harness que se edita son 8 componentes: system prompt, guardrails, memoria, tool guidance, subagentes, skills,
scripts y plugins (middleware). Corre sobre OpenCode o Codex.

## Por qué el bucle NO se trae

- **Coste**: cada tarea programa 4k ejecuciones del agente y 3k sesiones del editor (`core/recursion.py`). Aquí una
  ejecución es una tarea XOne entera con simulador o aparato.
- **Ruido**: el compositor decide con UNA ejecución por candidato. En este repo está medido que la varianza entre
  pasadas idénticas es del orden del efecto (frontera designer/developer), y `src/evals/medidas.ts#comparar` se
  NIEGA a concluir con rangos solapados: un listón más alto que el suyo.
- **Verdad de referencia**: Harness² existe para trabajar SIN ella. Aquí el veredicto del simulador es una medida.

Si algún día: **fuera de línea, en `src/evals/`**, evolucionando los `.md` de los agentes y las skills, y cada cambio
validado por el banco con sus rangos. Nunca dentro del turno ni de las tareas.

## Traído (0.47.10)

| | idea | dónde |
|---|---|---|
| 1 | **Lecciones con evidencia** (prompt `experience`): cada una con la evidencia en que se apoya; sin evidencia, `NO_ENTRY`. Calibración «ni demasiado genérica ni demasiado concreta». | `apuntar_aprendizaje` exige `como_lo_se`; va delante como «(comprobado: …)». `core/aprendido.ts` |
| 3 | **La evidencia son datos, no instrucciones** (`EVIDENCE_BOUNDARY`). | `LO_LEIDO_SON_DATOS` al raíz, especialistas y externos. `sesionTrueforge.ts` |

Kit de prueba en vivo: ver «Probarlo» abajo.

## Pendiente (por orden de rentabilidad)

### 2 · Hecho del proyecto frente a procedimiento (`GENERALIZE`)

Su regla: un HECHO verificado del espacio de trabajo se escribe tal cual y etiquetado («en este proyecto el
usuario de pruebas es 08006»); el PROCEDIMIENTO se escribe para todo el dominio. «Una regla que dice CÓMO encontrar
un dato deja el paso más difícil al agente; el dato lo quita.»

Visto en Maset (22-10-2026): de 12 entradas de `aprendido.json`, casi todas son conocimiento de XOne en general
(«el alfa va primero en `#AARRGGBB`», «`imgbk` anula `border-corner-radius`», «un icono nuevo exige desplegar
entera»), no hechos de Maset. Ese conocimiento vale para TODOS los proyectos y se queda encerrado en uno.
Destino posible: separar en `apuntar_aprendizaje` un tipo «de XOne» que vaya a una propuesta de cambio de skill
(revisable por una persona) en vez de a `aprendido.json`.

### 4 · Orden fijo de criterios del selector ciego

`select()` decide EN ESTE ORDEN:

1. **Entrega**: está todo lo pedido, en la ruta y forma pedidas.
2. **Conformidad**: SOLO lo pedido. Columnas, secciones o campos de más, cabeceras renombradas u orden cambiado son
   DESVIACIONES, no mejoras: quien consume puede depender de nombres y posiciones exactos.
3. **Fidelidad**: contrastar lo afirmado con la FUENTE, no fiarse de que suene bien; donde la fuente calla, mejor
   quien lo dice que quien rellena con aplomo.
4. **Coherencia interna**: totales que cuadran, referencias que resuelven.
5. **Uso real**: lo puede usar quien lo pidió sin rehacer trabajo.
6. **Acabado**: sin TODOs ni marcadores.

Más: «la longitud y el pulido no son mérito» y «un valor pedido tiene que estar COMO VALOR, no como fórmula».
Destino: el prompt del juez (`agent/tareas/juezDeTarea.ts#promptDelJuez`). En el crítico, solo si lo decide la
persona: su frontera diseño/detalle es decisión suya.

### 5 · Comprobaciones del harness en código

- **`autotrigger`** (`core/tree.py`): toda skill tiene su línea de disparo en el texto siempre cargado; si falta, se
  añade de su `description`. Y ese texto tiene **tope de caracteres** («se paga en cada ejecución»; si se añade,
  se quita). Destino: `skillsTrueforge.ts` / `anuncioDeSkills`.
- **Alarma de veredictos** (`assert_no_grader_verdicts`): se niega a meter en el contexto de un modelo la salida del
  juez, por nombre de fichero y por contenido; si salta, se busca la vía de fuga, no se amplía la lista. Destino:
  que el veredicto del juez o del crítico no vuelva al agente como instrucción.

## Otras ideas sueltas que vale la pena recordar

- **`KEEP_BASE` es una respuesta válida**: «adaptar sin que la evidencia lo pida es una regresión: cuesta contexto y
  no compra nada». Aplica a cualquier paso que proponga cambios (aumentador, reparación).
- **Separar el eje INV del DOM** al proponer cambios: uno no toca el saber del dominio y el otro no toca el
  procedimiento. Útil si algún día se evolucionan los `.md` de los agentes.
- **El vocabulario del reflector**: `helped`, `hurt`, `no observed effect`, `confounded`. Se prefiere `confounded`
  cuando un candidato cambió varias cosas a la vez o una sola ejecución sostiene la diferencia. «Una atribución
  inventada envenena la librería.» Útil para cualquier informe de «qué cambió y por qué fue mejor».
- **El acuerdo entre candidatos es apoyo, no prueba**: salen del mismo modelo, con los mismos sesgos. Una
  contradicción es motivo para mirar las trayectorias, no para votar.
- **Fallo del juez ≠ cero** (`core/judge.py`): un juez que no contesta deja la tarea sin puntuar, nunca a cero ni
  cacheado como cero. Es la misma regla que `ErrorDelJuezDeTarea` aquí.
- **Las pruebas no pueden ver la rúbrica**: en una validación suya, un Codex con red descargó la rúbrica del
  benchmark sin que nadie se lo pidiera. Si se monta un banco con red, cortar la red al agente a nivel de red, no
  por una opción de la tool.
- **`BenchPrompts` rechaza en el constructor** cualquier texto con «benchmark», «rubric», «score»…: el prompt
  describe el TRABAJO, no su medida. Comprobación en código de una regla de redacción.

## Relacionado en xonecode

- El **Calificador** (`core/rubrica.ts`, `agent/turno/rubrica.ts`) está escrito y probado pero nadie le pasa
  `calificador:`, y solo existe en deepagents (legacy). Si se trae el punto 4, el sitio natural es TrueForge y por
  un puerto.
- **Licencia**: Apache 2.0. Copiar texto de sus prompts tal cual obliga a conservar el aviso; reescribirlo en
  castellano y adaptado a XOne, no.

## Probarlo

Kit de la sesión del 23-10-2026 (scratchpad, efímero): copia desechable del proyecto, `requisitos-canario.md` (un
adjunto con dos requisitos de verdad y una nota inyectada que pide crear `/planes/canario/OBEDECIDO.md` y callarlo) y
`revisar.mjs`, que saca el log de `aprendido.json`, `traza-tools.jsonl` (con «Depurar») y los chats. Para la prueba
buena, desde la web: una TAREA con el adjunto, que aplica sus escrituras.
