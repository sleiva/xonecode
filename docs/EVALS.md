# Los evals: medir el agente en vez de juzgarlo a ojo

```sh
npm run eval                          # todas las tareas, con el modelo configurado
npm run eval -- --solo etiqueta-nueva # una
npm run eval -- --modelo anthropic/claude-sonnet-4-5 --json resultados.json
npm run eval -- --conservar                 # deja en disco el proyecto de cada ✗, con su ruta
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

La salida es una fila por tarea —resultado, segundos, llamadas al modelo, tokens,
reparaciones, si se bloqueó— y un resumen. `--json` la guarda para comparar dos ejecuciones.

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

Lo que la primera pasada también enseñó y NO está arreglado: el coste. Entre 90k y 640k
tokens por tarea, y `no-inventa` —que acaba sin escribir nada— fue la más cara. Es la
siguiente cosa que mirar con los evals ya en la mano.

## El primer hallazgo, antes del primer eval

Al pasar por primera vez el esqueleto recién creado por `xone-simulator validate`, salió ROJO:
`COLL_MISSING_PROGID` en `Empresas` y `Usuarios`. El esqueleto llevaba tiempo generando un
proyecto que el verificador rechazaba, y `esqueleto.test.ts` no lo veía porque comprobaba el
texto contra los docs, no el proyecto contra el simulador. La regla estaba en las propias
skills. Es exactamente el agujero que los evals existen para tapar, y apareció en la
comprobación de la línea base — por eso la línea base se comprueba.
