# Los evals: medir el agente en vez de juzgarlo a ojo

```sh
npm run eval                          # todas las tareas, con el modelo configurado
npm run eval -- --solo etiqueta-nueva # una
npm run eval -- --modelo anthropic/claude-sonnet-4-5 --json resultados.json
npm run eval -- --conservar                 # deja en disco el proyecto de cada ✗, con su ruta
npm run eval -- --conservar-todo            # también los ✓: para leer la traza de una tarea que salió bien
XONECODE_TRACE_TOOLS=1 npm run eval -- --solo no-inventa --conservar-todo   # y con `.xonecode/traza-tools.jsonl`
```

`--conservar` existe por una lección de la primera ejecución: dos tareas salieron ✗, el
temporal ya estaba borrado, y no había forma de saber si el fallo era del agente o del juez.
Eran del juez (dos, con test cada uno desde entonces). Un ✗ que no se puede inspeccionar es un
✗ del que no se aprende. Los ✓ se borran igual: no hay nada que mirar en un ✓.

**No es un test y no corre en `npm test`.** Necesita modelo, clave y `xone-simulator`. Ese
invariante —`npm test` sin red, sin clave, sin simulador— no se toca: el corredor vive en
`src/evals/correr.ts`, se tipea con el resto, no se empaqueta (`tsconfig.build.json` lo
excluye) y su nombre no acaba en `.test.ts`. Lo que SÍ corre en `npm test` son los JUECES
(`src/evals/tareas.test.ts`): un juez que juzgue mal invalida el eval entero sin que nadie lo
note, y un «ok» falso es peor que no tener eval.

## Qué hace por cada tarea

1. Un proyecto limpio: el esqueleto «Hola Mundo» (`core/esqueleto.ts`) en un temporal que se
   tira al acabar.
2. `preparar`, si la tarea parte de algo roto (`reparar-progid` quita un `progid`).
3. Una sesión REAL —el agente de verdad, el simulador de verdad— con una aprobación que
   **aprueba todo**. Está escrito con todas las letras porque es lo que convierte un turno con
   humano en uno medible sin humano, y solo tiene sentido sobre un proyecto que se tira. El
   corredor no acepta una raíz: no se puede apuntar a un proyecto real.
4. El turno, con un tope de 8 minutos (`sesion.cancelar()`).
5. El veredicto del simulador, **medido aquí y no leído del turno**: el juez no puede depender
   de que el lazo de verificación haya hecho bien su parte — es precisamente lo que se evalúa.
6. El juez de la tarea: verde en el simulador Y la condición pedida, con el motivo si no.

La salida es una fila por tarea —resultado, segundos, llamadas al modelo, tokens con el
porcentaje que vino de caché y un coste EFECTIVO (`input − 0,9·cache + output`),
reparaciones, si se bloqueó— y un resumen. El «efectivo» son tokens EQUIVALENTES para
comparar dos ejecuciones del mismo modelo, no una factura: asume la caché a un décimo —la
cifra documentada por Anthropic; OpenAI descuenta alrededor de la mitad y Gemini no publica
el porcentaje— y suma la salida 1:1 con la entrada cuando en todos los proveedores la
salida es varias veces más cara. `--json` la guarda para comparar dos ejecuciones.

## Las tareas

Están en `src/evals/tareas.ts`, escritas contra lo que el esqueleto trae de verdad y pidiendo
cosas que las skills documentan. Cada una mide una cosa:

| tarea | mide |
|---|---|
| `docs-no-toca` | una pregunta de plataforma no escribe nada |
| `etiqueta-nueva` | añadir un prop TL a una colección existente |
| `boton-toast` | un botón con `onclick` que llama a la API real (`ui.showToast`) |
| `coleccion-nueva` | crear una colección de datos completa en `mappings.xne` |
| `reparar-progid` | arreglar un error real del simulador sin tocar nada más |
| `no-inventa` | ante un atributo que no existe en XOne, **no** escribirlo |

`no-inventa` es la que mide la razón de ser del producto: XOne ignora en silencio lo
desconocido, así que un agente que «cumple» inventando un atributo produce un bug mudo. Su
éxito es no haber escrito nada.

## Lo que hay que saber al leer un resultado

- **El modelo y los subagentes son los de quien lo corre**: la config global,
  `XONECODE_MODELO` o `--modelo`, y los `.md` de `~/.xonecode/agentes/` (los cuatro de serie
  más los suyos). El corredor los imprime en la cabecera porque el resultado depende de ello.
  Dos ejecuciones solo son comparables con la misma cabecera.
- **Un ✗ con `bloqueado`** significa que el lazo de reparación se rindió (no-progreso o
  tope); un ✗ sin él, que el turno terminó creyendo que había acabado y el juez no está de
  acuerdo. Son fallos distintos.
- **Un ✗ con `ERROR:`** es del corredor o del entorno, no del agente.

## La primera ejecución: 4/6 que eran 6/6

Con el modelo global (`gemini/gemini-flash-latest`), la primera pasada dio 4/6. Los dos ✗
eran **de los jueces**: uno cortaba el XML con `split('name="Clientes"')` y `objname="Clientes"`
contiene esa cadena —el trozo que miraba era el que va entre `name=` y `objname=`, sin
campos—; el otro contaba `.xonecode/memoria.md` como «tocar de más», cuando escribirla es lo
que `dev.md` manda al terminar. Re-ejecutadas con los jueces arreglados: ✓ y ✓. Y
`coleccion-nueva` disparó una reparación en las dos ejecuciones —primer veredicto rojo,
corrección, verde—, que es el lazo de verificación haciendo su trabajo sin nadie mirando.

## El coste, medido

Entre 90k y 640k tokens por tarea en la primera pasada, y `no-inventa` —que acaba sin
escribir nada— la más cara. Con la traza (`XONECODE_TRACE_TOOLS=1`, que escribe una línea por
llamada al modelo con su agente y su uso) se ve dónde: en `no-inventa`, `docs` hizo **26
llamadas y 317k tokens de entrada**, con el contexto creciendo linealmente de 2k a 20k porque
cada una de sus 25 llamadas a tools leía otro trozo de las referencias de las skills; el
orquestador, 6k. En `etiqueta-nueva`, `dev` hizo 9 llamadas y 46k (78k en otra pasada: la
varianza entre ejecuciones es grande, y una sola pasada no es una medida). `docs.md` no tiene
ninguna regla de exploración acotada; `planner.md` sí («reconocimiento rápido»). Es la
palanca que queda por mover, y se mide con las mismas dos tareas trazadas antes y después.

**La caché no es la palanca, y se comprobó antes de descartarla.** La entrada bruta engaña
—lo cacheado cuesta ~10 veces menos—, así que se separó: `docs` cacheó el **15%** (48k de
317k, todo en las tres últimas llamadas) y `dev` el **0%**. Tres medidas para saber por qué,
en orden:

1. **El prefijo que mandamos es estable.** Un gancho sobre `fetch` (fuera del producto,
   por `NODE_OPTIONS=--import`) redujo a un hash cada pieza del cuerpo que sale hacia
   Gemini —`systemInstruction`, `tools`, la configuración y cada `contents[i]`— y entre dos
   peticiones consecutivas del mismo agente todo lo que ya existía era byte-idéntico. No hay
   nada que arreglar en el lado de xonecode, y el adaptador reporta exactamente lo que el
   servidor manda en su `usageMetadata`.
2. **La caché implícita de `gemini-flash-latest` (hoy `gemini-3.8-flash`) solo entra con
   prefijos GRANDES.** Prefijos frescos, conversación que crece, 3 s entre llamadas,
   streaming como el agente: a ~11k, **0 aciertos en 36 llamadas**; a ~20k, desde la segunda
   llamada **~16,3k cacheados (81%)** en las dos rondas; a ~40k, **~36,8k (91%)**. Las cifras
   cacheadas son múltiplos de bloques de ~4k y por debajo de ~16k de prefijo no aparece
   ninguno. La documentación declara un mínimo de 4.096 tokens y dice que los aciertos son de
   mejor esfuerzo; lo medido es que a los tamaños de contexto de estos agentes (3-11k `dev`,
   2-20k `docs`) no hay caché, y por eso `docs` solo la vio en la cola. Reducir contextos no
   pierde ninguna caché, porque no la hay.
3. **El adaptador la sobrecuenta en streaming.** Cuando el stream trae dos trozos con
   `usageMetadata`, `@langchain/google-genai` 2.3.0 diferencia `input` y `output` entre
   trozos pero no `cache_read`, y la agregación lo suma dos veces: 32.696 «cacheados» sobre
   una entrada de 20.097 cuando el servidor decía 16.348. `vendor/tokenTracking.ts` acota la
   caché a la entrada; no la corrige del todo, pero impide reportar más caché que entrada.

Con otro proveedor la caché sí es determinista (Anthropic con `cache_control`, que deepagents
monta solo para sus modelos; OpenAI automática desde 1.024 tokens), y la misma medida —el
gancho de hashes y la traza— sirve para comprobarlo el día que se cambie de modelo.

## El primer hallazgo, antes del primer eval

Al pasar por primera vez el esqueleto recién creado por `xone-simulator validate`, salió ROJO:
`COLL_MISSING_PROGID` en `Empresas` y `Usuarios`. El esqueleto llevaba tiempo generando un
proyecto que el verificador rechazaba, y `esqueleto.test.ts` no lo veía porque comprobaba el
texto contra los docs, no el proyecto contra el simulador. La regla estaba en las propias
skills. Es exactamente el agujero que los evals existen para tapar, y apareció en la
comprobación de la línea base — por eso la línea base se comprueba.
