# El linter de escritura: lo que queda anotado

Hallazgos que salieron al montar la validación previa a `write_file` (paso 1, en
`xone-linter`: `f0b3f1a` y `ae03157`) y que **no se han arreglado**. Cada uno dice por qué.

## 1. `type="C"` no es un tipo nuevo: es un anti-patrón, y DOS SKILLS SE CONTRADICEN

Apareció 3 veces en el corpus (solo en AppDemo) y no estaba en la tabla de tipos, así que
parecía un tipo sin documentar. Es al revés — `xone-development` dice en **tres sitios** que
no existe:

- `references/xml-ui/prop-tipos-combos-y-controles.md:11` — «**No existe un `type="C"` propio
  en XOne.** Los combos/selectores se implementan con `type="T"` (o `type="N"`) más `mapcol`
  y `mapfld`».
- `references/tipos-de-prop.md:28` — «No existen `type="C"`, `"M"`, `"A"`, `"F"`, `"S"`,
  `"P"`, `"E"`, `"R"`, `"H"`, `"W"`, `"CAM"`, `"ARRAY"`, `"STRING"`, `"N1"` ni `"BT"`».
- `references/anti-patrones.md:11` — lo lista como anti-patrón, con el arreglo al lado.

Y el uso real es EXACTAMENTE el anti-patrón, ya con las dos mitades del arreglo puestas:
`<prop name="EMPRESA" type="C" mapcol="Empresas" mapfld="ID" …/>`. Solo sobra el tipo.

**Lo que hay que mirar no es AppDemo, es la skill que lo enseña.**
`xone-project-generator/references/fases-10-12-readmes-y-validacion.md:75` tiene una tabla de
tipo de prop → columna SQL que da por buenos **`C`, `F`, `M`, `P`, `R` y `S`** (y `N1`, cuando
la serie va de `N2` a `N6`). Son seis tipos que la otra skill declara inexistentes. Una skill
que GENERA proyectos enseñando un anti-patrón documentado es peor que un proyecto con el
anti-patrón dentro: lo reproduce en cada app nueva.

El linter acierta al marcarlo (`INVALID_PROP_TYPE`). Lo que hay que decidir es cuál de las dos
tablas manda y corregir la otra.

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
