# El linter de escritura: lo que queda anotado

Hallazgos que salieron al montar la validación previa a `write_file` (paso 1, en
`xone-linter`) y que **no se han arreglado**. Cada uno dice por qué.

## 1. `type="C"` NO existe — y el problema es una skill DESACTUALIZADA en disco

Historia corta: `INVALID_PROP_TYPE` marcaba `type="C"` en 3 ficheros de AppDemo. Se investigó,
se «arregló» metiendo once tipos en la lista del linter, y **estaba mal**: se había leído una
tabla vieja. Revertido (`399ab6b`).

**La respuesta buena**, de la tabla que se declara a sí misma «Lista autoritativa» en
`xone-help-docs/topics/02b-xml-prop-tipos.md`:

> **Combos/selectores**: NO tienen un type propio. Se implementan con `type="T"` (o `type="N"`)
> más `mapcol` y `mapfld`.
> **Mapas**: `type="Z" viewmode="mapview"`. No existe un `type="M"`.
> **Sliders, progress bars, stepper, OTP, navbar, kanban…**: son **viewmodes** sobre `T`, `N`
> o `Z`. No son types propios.

Y su `SKILL.md:439` lista `<prop type="C">` como anti-patrón con el arreglo al lado. La lista
del linter coincide con esa tabla **exactamente: 30 tipos, cero diferencia**. Así que los 3
hallazgos de AppDemo son correctos.

**Lo que hay que arreglar no es el linter, es el disco.** Hay tres copias de `xone-help-docs`
en la máquina y no dicen lo mismo:

| copia | estado |
|---|---|
| `~/.claude/skills/xone-help-docs` | **VIEJA** — tiene `\| C \| Combo \|` en 3 ficheros y le falta `02b-xml-prop-tipos.md` |
| `~/.agents/skills/xone-help-docs` | al día |
| `~/Downloads/xone-help-docs` | vieja |

La primera es la que lee Claude Code, y es la que hizo creer que `C` era un tipo válido. Hasta
que se actualice, cualquier agente que consulte los tipos se llevará la respuesta de antes.

**Y la tabla del generador sigue mal, también en la versión nueva.**
`xone-project-generator/references/xone-project-generation-workflow.md:5727` conserva el
«Mapeo de Tipos XOne a SQLite» con `C`, `F`, `M`, `P`, `R` y `S` bajo la columna «Tipo XOne»,
más `N1` cuando la serie empieza en `N2`. No manda escribir esos tipos —dice qué columna crear
si los ve— pero es una lista rotulada «Tipo XOne» con seis que no lo son, y encima se
contradice sola: `L` sale en dos filas, en `TEXT` y en `NO SE CREA`.

## 2. Las colls de ACAProd se cargan DOS VECES

`validate` saca `DUPLICATE_COLL_NAME` en casi todas sus colecciones, y `PROP_MISSING_TYPE`
sale dos veces para la misma prop. No son 52 duplicados: es que cada coll se lee una vez de su
propio `.xne` y otra de `mappings.xne`. Es un bug del cargador de `XoneProject`, no del
proyecto, y es su propio cambio.

## 3. El round-trip de codificación ESCONDE el problema que decía destapar

`bufferOfDeclaredEncoding` reescribe el texto en la codificación que el documento declara para
que haya UN solo camino de decodificación. El comentario dice que así un `√` en un `.xne`
iso-8859-15 «se valida como el documento que XOne cargaría de verdad» — cierto, pero la
consecuencia es que llega al parser como `?` y el parser lo acepta. O sea que **no hay
comprobación de que un carácter no quepa en la codificación declarada**, que es un fallo real
y medido (`√` y `π` en la calculadora de MyAllXOne). Falta la comprobación y sobra media frase
del comentario.

## 4. `xone-linter` no tiene ni un test

Ninguno: sus scripts son `build` y `lint` (`tsc --noEmit`). Las ~350 líneas nuevas se
verificaron con barridos sobre el corpus real —que para falsos positivos es MÁS fuerte que un
unit test: 554 ficheros, 36 hojas de estilo, 454 XML— pero eran scripts de usar y tirar, así
que no son reproducibles. O entra un vitest mínimo con los tres casos que de verdad deciden
(XML mal formado lanza, un `font-size` en comentario no cuenta, un `app.xml` real pasa), o
queda dicho que ahí no hay red.

## 5. Y lo que decide la forma del PASO 2

El guardián no puede bloquear por defectos que ya estaban. Medido: con las dos reglas falsas
ya arregladas siguen quedando avisos en ficheros que están en producción, y el día que esto
entre, un `edit_file` sobre `Chat.xne` se rechazaría por una prop sin `type` que el agente no
escribió. Es la guarda que se desactiva al segundo día.

La solución ya existe en este repo: `conVerificacion` compara la **huella** de los errores de
antes con la de después y solo actúa sobre lo que el cambio INTRODUCE. El paso 2 necesita
exactamente eso — validar el fichero que hay, validar el contenido nuevo, y rechazar solo lo
que no estuviera ya.
