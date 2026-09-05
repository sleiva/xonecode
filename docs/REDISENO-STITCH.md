# El rediseño de estilo (Stitch, segunda tanda), y qué se ha aplicado

Ocho pantallas, ancladas en `docs/diseno/*-rediseno-stitch.{html,png}`. Se guardan aquí por
lo mismo que las de `DISENO-DASHBOARD.md`: un diseño que vive en `~/Downloads` no existe
para la sesión siguiente. Este documento es la continuación de aquel — allí la pregunta era
qué pieza tiene un dato detrás; aquí, además, **qué del estilo es el estilo y qué es
relleno de la herramienta**.

El encargo fue explícito: «el estilo sí, descartar cambios no».

## Las ocho

| fichero | pantalla |
|---|---|
| `escritorio-` | el escritorio con rejilla de tarjetas |
| `ficheros-diff-` | la pestaña Ficheros, lista + parche |
| `ajustes-modelos-` | Ajustes → Modelos de IA |
| `ajustes-apariencia-` | Ajustes → Apariencia |
| `ajustes-entornos-` | Ajustes → Entornos CloudStudio |
| `nueva-sesion-` | el diálogo de sesión nueva |
| `eliminar-sesion-` | el diálogo de eliminar sesión |
| `chat-oscuro-` | el chat en oscuro, con el selector de modelos abierto |

## Lo primero: las paletas se contradicen entre ellas

No es un detalle. Cada `code.html` trae su propio `tailwind.config`, y **no coinciden**:

| pantalla | cabecera | «acento» | primario |
|---|---|---|---|
| escritorio | `#0b2331` | `#00a4e4` — el cian de XOne | `#111827` |
| ajustes-modelos | `#0b1320` | `#0ea5e9` — `sky-500` de Tailwind | `#0284c7` |
| ficheros-diff | `#0B1D28` | `#06B6D4` + `#0EA5E9` — `cyan-500` y `sky-500` | `#0F172A` |
| nueva-sesion | — | — | `#0284c7` |

Tres azules de cabecera distintos, y **solo el escritorio trae el cian de XOne**: las otras
lo sustituyen por tonos de Tailwind. Es el mismo relleno que `DISENO-DASHBOARD.md` ya
documenta haber descartado con la escala índigo (`#6366f1`) de la primera tanda. La regla se
mantiene y se extiende: **de estos mockups se toma la tipografía y la forma; el color de
marca sigue siendo el MEDIDO en `estilos/marca.css`.**

Una coincidencia que resolvió sola la duda del «tercer azul»: su `accent: #0284c7` ya estaba
en la paleta como `--xonecode-cian-oscuro`. No era un color nuevo.

## Lo que sí es el estilo, y está aplicado

1. **Inter + JetBrains Mono.** Es lo ÚNICO en lo que las ocho pantallas están de acuerdo, y
   por eso es lo que de verdad pedían. Van **empaquetadas** (`@fontsource-variable/*`,
   importadas en `main.tsx`) y no desde `fonts.googleapis.com`: esta consola escucha en
   loopback y tiene un modo `offline` de primera clase, así que una hoja de CDN la dejaría
   sin su propia letra justo en el caso que el producto declara soportar — y de paso le
   contaría a Google cada arranque de una herramienta local. Se aplican en
   `estilos/tipografia.css`, sobre los tokens `--dsw-font-family` y `--ds-font-family-code`
   que las hojas copiadas declaran, no en cada selector.

2. **El mono marca el dato de máquina.** Es la idea tipográfica del rediseño, y solo vale
   si se aplica con criterio: URLs (`Escritorio`, `Ajustes`), etiquetas de estado
   (`PROPIO`/`COMPARTIDO`, `en tu equipo`), rutas y letras de `git status`. **No** la
   descripción de una opción de apariencia ni el estado de una credencial, que son prosa —
   por eso la URL de un entorno tiene clase propia (`.url`) en vez de heredar el `.detalle`
   que comparte hueco con dos textos que no son datos.

3. **El primario pasa a casi negro, y resultó ser una RESTA.** Al ir a escribir `#111827`
   apareció que `--dsw-alias-brand-primary` de la hoja copiada ya es `rgb(15, 17, 21)` en
   claro y `rgb(249, 250, 251)` en oscuro: exactamente la pareja que el diseño pide.
   Aplicarlo fue **quitar** el puente de `marca.css` que lo tenía secuestrado en cian, no
   añadir un literal. De regalo, el modo oscuro se resuelve solo — el tema ya sabe invertir
   el par relleno/etiqueta, cosa que un cian fijo en los dos temas no hacía.

4. **El cian pasa de relleno a ACENTO**, que es lo que el diseño hace con él: pestaña
   activa, filo de la tarjeta con copia local, punto de estado, fila elegida. Ahí el color
   no tiene que sostener ninguna letra, que era el problema del botón cian de antes.
   **Trampa medida al hacer esto**: cuatro sitios pintaban acento leyendo
   `--dsw-alias-button-primary-fill` —salían cian de rebote, por el puente— y al quitarlo se
   volvieron negros: el filo del proyecto y de la sesión activos (`Barra`), el del fichero
   elegido (`Ficheros`) y el marcador del paso en curso (`PasosDelAlta`). Los cuatro apuntan
   ahora a `--xonecode-cian` por su nombre. Nada daba error; solo se veía.

5. **La barra superior cruza las dos columnas**, y la marca se mudó dentro. Es un ítem del
   grid con `grid-column: 1 / -1` y no un envoltorio por fuera: `.frame` ya es quien mide la
   pantalla y anima sus pistas, y meterlo en otra caja duplicaría esa medida. La marca vivía
   arriba de la barra lateral y ahora sería el nombre del producto dicho dos veces en la
   misma esquina — y, con la tira azul de lado a lado, la de la lateral quedaba debajo y sin
   superficie de marca que la sostuviera. `Maqueta.test.tsx` vigila las dos filas del grid y
   que la cabecera vaya la PRIMERA en el DOM, que es el orden del Tab.

6. **La tira de entorno, las tarjetas y los rótulos**: el entorno pasa de línea suelta a
   tira con borde; la tarjeta con copia local lleva filo de acento arriba (en un `::before`
   y no en un `border-top`, que le cambiaría la altura interior respecto de las de al lado);
   los rótulos de sección van en versalitas espaciadas — en `label-tertiary` y no en
   `label-dimmed`, que a 10px casi no se lee (medido).

7. **La línea `@@` del diff, con tinte azul.** No es decoración: esa línea no es código ni
   es un cambio, es el salto de un trozo al siguiente, y con el gris de superficie se leía
   como una fila de contenido más entre el verde y el rojo.

## Lo que tiene dato detrás y todavía NO está

Nada de esto es estilo, así que ninguno entró en esta pasada:

- **Las horas relativas de las sesiones** («2h», «hace 2 horas»). `EntradaIndice` ya guarda
  `creada` y `ultimoTurno`; lo que falta es que viajen — por el cable van hoy `{id, titulo}`
  y nada más. Un campo.
- **El buscador de la barra y el del escritorio**: filtrado local sobre datos que ya están.
- **El `+` en la cabecera de PROYECTOS** (`chat-oscuro`), que es el «New Session arriba» que
  `DISENO-DASHBOARD.md` ya pedía: hoy la acción vive escondida en el `:hover` de una fila.
- **Números de línea viejo/nuevo y resaltado de sintaxis en el diff.** El dato está en el
  parche; el trabajo es un parser de trozos más shiki por línea. Es la mayor diferencia
  visual que queda en Ficheros, y es funcionalidad, no CSS.
- **«Probar» en la fila de un proveedor** (`ajustes-modelos`): sería listar su catálogo, que
  es exactamente como valida hoy el asistente de cuenta. Barato.

## Lo que no se pinta, y por qué

Se mantiene entera la lista de `DISENO-DASHBOARD.md` —el puente con dispositivos— y se le
suman las de esta tanda:

- **«Build & Run», `port:5037`, «Daemon v4.2.0-hotreload»**: el ADB y el puente con el móvil,
  que este producto no cablea. Ya estaban descartados pieza a pieza.
- **«Descartar cambios»** (`ficheros-diff`, en rojo). Decisión del usuario, y coincide con lo
  que el código dice: `sesionGit.ts` solo LEE, es árbol contra árbol. Descartar sería
  restaurar la foto de apertura encima del trabajo, o sea una escritura destructiva, y en
  este repo eso va fail-closed y con el diff delante — no detrás de un botón de una barra.
- **«Guardar y Salir»** (`ajustes-modelos`), conviviendo con un pie que dice que los cambios
  se sincronizan solos: Ajustes aplica en el acto. Sería un botón que no hace nada.
- **Los chips de rama** «main» / «master (HEAD)»: `tipos.ts` documenta que la rama del
  `config.json` NO viaja por el cable a propósito (es dato del despliegue). Y la foto es el
  árbol de APERTURA, no HEAD, así que «(HEAD)» además diría otra cosa.
- **«2 archivos preparados»** / «preparados para contextualizar»: *preparados* es *staged*, un
  estado de git que los cambios de una sesión no tienen.
- **«Descarga estimada: ~14.2 MB»** (`nueva-sesion`): no se sabe antes de bajar. Una cifra
  inventada con formato de dato es la peor clase de relleno.
- **«Inicializar con contexto y reglas de proyecto para Gemini 1.5 Flash»** (`nueva-sesion`):
  esa opción no existe.
- **«v4.2.0-cloud»** contra un `package.json` que pone 0.5.0.
- **La pastilla «DESKTOP»** y el avatar de iniciales: no hay ningún modo de escritorio del que
  hablar, y el nombre del saludo sale de `git config user.name`, no de una cuenta.
- **Las pestañas de filtro «Todos 18 / En tu equipo 1 / Compartidos 7 / Sin descargar 10»**:
  suman 18 como si fueran disjuntas, y no lo son —`compartido` y `local` son ortogonales, y
  `compartido` puede venir AUSENTE—. Un contador «Compartidos 7» contra un endpoint que no lo
  dice sería inventado. Si se hacen, son dos filtros independientes y sin cuenta afirmada.
- **«Atajos de teclado»** (`ajustes-apariencia`): no hay registro de atajos que pintar.
