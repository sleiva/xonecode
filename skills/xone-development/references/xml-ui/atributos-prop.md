# XOne XML — Referencia de atributos: prop

> Fuente: `xone/v2/xone-help-docs/topics/07-xml-attributes-reference.md` §4. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §4 todos los atributos de prop: colores por estado, bordes individuales, entrada, multimedia, ML/cámara, classid, sliders, stepper, OTP, kanban, coverflow, chips y markdown

---

## 4. Nodo `<prop>` — Propiedad/Campo

### 4.1 Identidad y obligatorios

| Atributo | Tipo | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `name` | string | **Si** | — | Nombre del campo (= columna SQL). Usar `MAP_` si no es columna BD. |
| `type` | enum | **Si** | — | Tipo de dato. Ver [sección 10](#10-tipos-de-propiedad-atributo-type). |
| `group` | int | **Si** | — | ID del grupo donde se renderiza. |
| `title` | string | No | `name` | Etiqueta visible. |
| `value` | string/formula | No | `""` | Valor inicial. |
| `size` | int | No | `0` | Tamaño máximo del campo en BD. |
| `fldname` | string | No | `""` | Nombre de la columna en BD si difiere de `name`. |

### 4.2 Layout

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `frame` | string | `""` | Frame padre donde se renderiza. |
| `subgroup` | int | `-1` | Subgrupo dentro del grupo. |
| `newline` | bool | `true` | Salto de linea antes del control. |
| `width` | medida | auto | Ancho del control. |
| `height` | medida | auto | Alto del control. |
| `min-width` / `max-width` / `min-height` / `max-height` | medida | — | Restricciones de tamaño. |
| `lines` | int | `1` | Número de lineas de texto visibles. |
| `fixed-lines` | int | `0` | Lineas de texto fijas. |
| `floating` | bool | `false` | Posicionamiento absoluto. |
| `top` / `left` / `right` / `bottom` | medida | — | Posición absoluta (requiere `floating="true"`). |
| `scroll` | bool | `false` | Scroll interno del control. |
| `align` | enum | `left` | `left`, `center`, `right`. Alineacion horizontal del control. |
| `vertical-align` | enum | `middle` | `top`, `middle`, `bottom`. Alineacion vertical. |
| `text-align` | enum | `left` | Alineacion del texto dentro del campo. |
| `label-align` | enum | `left` | Alineacion del label. |
| `labelwidth` | int | `10` | Ancho del label en caracteres. |
| `fieldsize` | int | `14` | Tamaño del área de campo. |
| `width-to-text` | bool | `false` | Ajusta el ancho del control al texto que contiene. |
| `tmargin` / `bmargin` / `lmargin` / `rmargin` | medida | `0` | Margenes externos. |
| `tpadding` / `bpadding` / `lpadding` / `rpadding` | medida | `0` | Padding interno. |
| `zorder` | int | `0` | Orden Z. |
| `elevation` | medida | `0` | Sombra/elevacion Material Design. |

### 4.3 Visibilidad y estado

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `visible` | int (mask) | `-1` | Mascara binaria: 0=oculto, 1=formulario, 2=lista, 4=contents, 7=todos. |
| `disableedit` | formula | `""` | Si la fórmula es verdadera, bloquea la **UI** de edición del control (versión dinámica de `locked`); se OR-ea con `locked`. **No** afecta a la persistencia. |
| `disablevisible` | formula | `""` | Si verdadero, el campo se oculta. |
| `readonly` | bool | `false` | **Persistencia**: excluye el campo del UPDATE en BD (el framework lo interpreta como "no actualizable"). **No** bloquea la UI en `T`/`N`/`NC`/spinners/etc. Caso especial: en `<prop type="VD">` actúa como flag de UI (`true` = reproducir, `false` = capturar). Ver nota abajo. |
| `locked` | bool | `false` | **UI**: bloquea visualmente la edición del control (lo respetan inputs de texto, números, spinners, checkboxes, OTP, sliders, kanban, charts, etc.). Equivalente estático de `disableedit`. **No** afecta a la persistencia: si el valor cambia desde JS, se graba. Ver nota abajo. |
| `showinline` | bool | `false` | Muestra dentro de la fila de lista. |
| `showinline-keyboard` | bool | `false` | En selectores `linkedto`/`linkedfield` con `showinline="true"`, añade una caja de búsqueda en la cabecera del panel para filtrar las opciones por texto. |
| `bgcolor-dialog` | color | — | Color de fondo del panel de selección del showinline y de los selectores de fecha/hora (`D`/`DT`/`TT`). |
| `forecolor-dialog` | color | — | Color de primer plano: en el showinline tiñe el texto de las opciones; en los pickers de fecha/hora actúa como color de acento (día/hora seleccionados, botones). |
| `fontsize-dialog` | int (sp) | — | Tamaño del texto de las opciones del showinline y de los números de los pickers de fecha/hora. |
| `listview-visible` | bool | `false` | Visible en la vista de lista. |
| `listview-position` | int | `0` | Orden en la lista. |
| `listview-line` | int | `0` | Linea en la lista (0=primera, 1=segunda...). |
| `apply-css` | bool | `true` | Aplica reglas CSS al control. |
| `class` | string | `""` | Clase CSS. |

> **Nota: `readonly` vs `locked` vs `disableedit` NO son sinónimos.**
>
> - **`locked="true"`** (estático) y **`disableedit="<fórmula>"`** (dinámico) bloquean la **UI** del control (se OR-ean entre sí). **No** afectan a la persistencia — si el valor se cambia desde JavaScript con `self.X = ...`, sí se graba.
> - **`readonly="true"` en `<prop>`** excluye el campo del **UPDATE en BD**. **No** bloquea la UI por sí mismo en controles de texto / numéricos / checks / spinners.
> - **`readonly="true"` en `<coll>`** hace toda la colección no escribible (ni INSERT ni UPDATE).
> - **Caso especial `<prop type="VD">`**: reinterpreta `readonly` como flag de UI (`true` = solo reproducir, `false` = capturar).
>
> Si necesitas un campo visible pero ni editable ni grabable, combina ambos: `locked="true" readonly="true"`. Si solo quieres mostrar texto sin valor en BD, usa `type="L"` (label) en lugar de `type="T" locked="true"`.

### 4.4 Textos y fuentes

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `caption` | string | `""` | Texto placeholder (hint). |
| `tooltip` | string | `""` | Tooltip al pulsar. |
| `tooltip-forecolor` | color | — | Color del texto del tooltip. |
| `floating-tooltip` | bool | `false` | Tooltip flotante (siempre visible). |
| `fontname` | string | tema | Nombre del fichero de fuente (ej. `Roboto-Regular.ttf`). |
| `fontsize` | int (sp) | `14` | Tamaño en sp. |
| `fontbold` | bool | `false` | Negrita. |
| `fontitalic` | bool | `false` | Cursiva. |
| `fontunderline` | bool | `false` | Subrayado. |
| `auto-fontsize` | bool | `false` | Reduce automáticamente el tamaño de fuente para que entre el texto. |
| `textfont-name` | string | — | Fuente del valor editable. |
| `textfont-size` | int | — | Tamaño de fuente del valor. Aliases: `textfontsize`, `text-font-size`. |
| `textfont-bold` | bool | `false` | Valor en negrita. |
| `textfont-italic` | bool | `false` | Valor en cursiva. |
| `labelfontsize` | int | — | Tamaño de fuente del label. |
| `labelfont-name` | string | — | Fuente del label. |
| `labelfont-bold` | bool | `false` | Label en negrita. |
| `label-format` | string | `""` | Formato printf del label (ej. `"Total: %.2f"`). |
| `label-value-decimals` | int | `2` | Decimales del label cuando es numérico. |
| `label-wrap` | bool | `false` | Permite wrap del texto del label. |
| `labelbox` | bool | `false` | Dibuja una caja alrededor del label. |
| `framebox` | bool | `false` | Dibuja una caja alrededor del control completo. |
| `fixed-text` | bool | `false` | Texto del label fijo (no se traduce con el sistema de idiomas). |
| `locale` | string | locale del sistema | Locale para formateo de números y fechas. |

### 4.5 Colores

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `bgcolor` | color | heredado | Fondo del control. |
| `bgcolor-pressed` | color | — | Fondo cuando el control esta pulsado. |
| `bgcolor-disabled` | color | — | Fondo cuando el control esta deshabilitado. |
| `forecolor` | color | heredado | Color de texto del label. |
| `forecolor-pressed` | color | — | Color de texto pulsado. |
| `forecolor-disabled` | color | — | Color de texto deshabilitado. |
| `text-bgcolor` | color | — | Fondo del área de texto editable. |
| `text-bgcolor-focus` | color | — | Fondo del área de texto cuando tiene foco. |
| `text-forecolor` | color | — | Color del valor escrito. |
| `text-forecolor-focus` | color | — | Color del valor cuando tiene foco. |
| `border-color` | color | — | Color del borde del control. |
| `border-color-focus` | color | — | Color del borde cuando tiene foco. |
| `link-color` | color | sistema | Color de enlaces en controles `THTML`. |
| `bar-color` | color | — | Color de la barra de progreso (`progress-bar`). |
| `track-color` | color | — | Color de la pista (slider, switch). |
| `track-color-checked` | color | — | Color de la pista cuando esta marcado. |
| `thumb-color` | color | — | Color del pulsador del slider. |
| `thumb-color-checked` | color | — | Color del pulsador cuando esta marcado. |
| `check-color-checked` | color | — | Color del checkbox cuando esta marcado. |
| `check-color-unchecked` | color | — | Color del checkbox sin marcar. |
| `status-bar-color` | color | — | Color de la barra de estado del sistema. |

### 4.6 Bordes

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `border` | int (mask) | `0` | Bordes activos: top=1, right=2, bottom=4, left=8. Sumar para combinar (ej. `15` = todos). |
| `border-top` / `border-bottom` / `border-left` / `border-right` | bool | `false` | Activar bordes individuales. |
| `border-width` | medida | `0` | Grosor del borde. |
| `border-corner-radius` | medida | `0` | Radio común de esquinas redondeadas. |
| `border-corner-radius-top-left` | medida | `0` | Radio esquina superior izquierda. |
| `border-corner-radius-top-right` | medida | `0` | Radio esquina superior derecha. |
| `border-corner-radius-bottom-left` | medida | `0` | Radio esquina inferior izquierda. |
| `border-corner-radius-bottom-right` | medida | `0` | Radio esquina inferior derecha. |

### 4.7 Imágenes e iconos

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `img` | string | `""` | Imagen principal del control. |
| `img-sel` | string | `""` | Imagen en estado seleccionado. |
| `img-disabled` | string | `""` | Imagen en estado deshabilitado. |
| `imgbk` | string | `""` | Imagen de fondo. |
| `img-rotate` | bool | `false` | Permite rotar la imagen con gesto. |
| `img-thumb` | string | `""` | Miniatura. |
| `error-image` | string | `""` | Imagen a mostrar si la carga de imagen falla. |
| `keep-aspect-ratio` | bool | `true` | Conserva el aspect ratio de la imagen. |
| `scale-type` | enum | `fit_center` | `fit_center`, `center_crop`, `center_inside`, `fit_xy`, `center` (el motor parsea snake_case; `center_crop` requiere `keep-aspect-ratio="true"`). |
| `zoom` | bool | `false` | Permite zoom con pellizco. |
| `zoom-max-scale` | float | `3.0` | Factor máximo de zoom. |
| `icon` | string | `""` | Icono asociado al control. |
| `icon-left` / `icon-right` / `icon-top` / `icon-bottom` | string | `""` | Iconos en cada lado del control. |
| `icon-orientation` | enum | `left` | Posición del icono respecto al texto. |
| `icon-size` | medida | `24dp` | Tamaño del icono. |
| `hide-no-picture` | bool | `false` | Oculta el control si no hay imagen asignada. |

### 4.8 Datos y enlazado (lookups/combos)

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `linkedto` | string | `""` | Coleccion remota enlazada (para combo con `linkedfield`). |
| `linkedfield` | string | `""` | Campo de la coleccion linked a mostrar. |
| `mapcol` | string | `""` | Coleccion de mapeo (lookup). |
| `mapfld` | string | `""` | Campo en `mapcol` que coincide con el valor del prop. |
| `mapcol-values` | string | `""` | Valores embebidos para mapeo rápido (sin coleccion). |
| `dropcoll` | string | `""` | Coleccion destino al soltar un elemento (drag & drop). |
| `filter` | formula | `""` | Filtro WHERE para la coleccion linked/lookup. |
| `linkfilter` | formula | `""` | Filtro adicional aplicado al linkear. |
| `contents` | string | `""` | Nombre de la coleccion anidada (para `type="Z"`). |
| `src` | string | `""` | Fuente externa de contenidos. |
| `allow-view` | bool | `true` | Permite visualizar el contenido del lookup. |
| `refresh` | bool | `false` | Recarga la coleccion al cambiar este campo. |
| `refresh-owner` | string | `""` | Campo padre que dispara el refresco. |
| `forceonchange` | bool | `false` | Fuerza el evento `onchange` aunque el valor no cambie. |
| `postonchange` | bool | `false` | Lanza `onchange` después de salir del campo (no en tiempo real). |
| `cache-timeout` | int (ms) | `0` | TTL para cache del valor del lookup. |
| `colorview` | bool | `false` | Este campo provee el color de la fila en la lista. |
| `index` | int | `0` | Orden manual en la lista. |

### 4.9 Entrada y mascara de texto

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `mask` | string | `""` | Mascara de entrada (ej. `"##/##/####"` para fecha). |
| `numeric` | bool | `false` | Solo acepta caracteres numéricos. |
| `upper` | bool | `false` | Convierte automáticamente a mayusculas. |
| `lower` | bool | `false` | Convierte automáticamente a minusculas. |
| `input-type` | enum | `text` | Valores XOne (NO constantes Android): `text`, `numeric`, `numeric_unsigned`, `decimal`, `phone`, `datetime`, `email`, `username`, `uri`, `password`, `none`. Un valor no reconocido lanza error. |
| `software-input` | enum | `default` | Modo del teclado software. |
| `enable-software-keyboard` | bool | `true` | Activa el teclado software al recibir foco. |
| `show-softinput` | bool | `false` | Muestra el teclado automáticamente al obtener foco. |
| `select-all-text-on-focus` | bool | `false` | Selecciona todo el texto al recibir foco. |
| `disable-copy-paste` | bool | `false` | Desactiva las opciones copiar/pegar del sistema. |
| `next-focus` | string | `""` | Nombre del siguiente campo al pulsar Enter/Tab. |
| `show-clear-toggle` | bool | `false` | Muestra botón "x" para limpiar el campo. |
| `show-counter` | bool | `false` | Muestra contador de caracteres. |
| `show-password-visibility-toggle` | bool | `false` | Muestra botón para ver/ocultar el password (tipo `X`). |
| `autocomplete` | bool | `false` | Activa el autocompletado del sistema. |
| `autocomplete-suggestions` | string | `""` | Sugerencias de autocompletado separadas por `;`. |
| `autolink` | bool | `false` | Convierte automáticamente URLs y emails en enlaces. |
| `autosave` | bool | `false` | Guarda automáticamente al cambiar el campo. |
| `pull-to-refresh` | bool | `false` | Activa el gesto "pull to refresh". |

### 4.10 Fechas y horas

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `date-format` | string | locale | Formato de fecha (ej. `"dd/MM/yyyy"`). |
| `time-format` | string | locale | Formato de hora (ej. `"HH:mm:ss"`). |
| `utc` | bool | `false` | Trata el valor como UTC. |
| `use-unix-epoch` | bool | `false` | Almacena el valor como timestamp Unix (epoch). |
| `calendar-viewmode` | enum | `month` | `month`, `week`, `day`. Modo del calendario. |
| `show-events` | bool | `true` | Muestra eventos en el calendario. |
| `time-interval` | int | `1` | Intervalo de minutos en el time picker. |
| `date-mode` | int | — (nuevo) | Estilo del selector de fecha (`D`/`DT`). Ausente o `4` = nuevo diseño moderno (calendario con deslizamiento lateral de meses); `0`–`3` = selectores nativos del sistema (0 por defecto del dispositivo, 1 oscuro, 2 claro, 3 oscuro). |
| `time-mode` | int | — (nuevo) | Estilo del selector de hora (`TT` y la hora de `DT`). Ausente o `4` = nuevo diseño moderno (ruedas de hora/minuto); `0`–`3` = selectores nativos del sistema. |

> Nota: `type="TT"` (solo hora) requiere `mask="Hh#:#Mm"` para que el campo sea visible.

> **Nuevo selector por defecto:** los campos `D`/`DT`/`TT` usan por defecto un selector moderno (calendario con swipe lateral entre meses y ruedas para la hora). Para volver al selector nativo del sistema, fijar `date-mode`/`time-mode` a `0`. El selector admite `bgcolor-dialog`, `forecolor-dialog` (color de acento) y `fontsize-dialog`.

### 4.11 Sliders, Progress, Rating, Stepper, OTP, NavigationBar, Kanban, CoverFlow, Markdown

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `viewmode` | enum | — | Slider/Progress: `slider`, `range-slider`, `rounded-slider`, `progress-bar`, `circular-progress-bar`, `rating-bar`. Numérico compacto: `stepper`. Barra de navegación Material 3: `navbar`. Texto/numérico OTP: `otp`. Texto formateado: `markdown` (solo `type="T"`). Lista (Z): `kanban`, `coverflow`, `chipsview` (además de `recyclerview`, `slideview`, etc.). |
| `orientation` | enum | `horizontal` | `horizontal` o `vertical`. |
| `step-size` | float | `1` | Incremento del slider o del stepper (en stepper debe ser `> 0`). |
| `bar-width` | medida | — | Ancho de la barra de progreso. |
| `indeterminate` | bool | `false` | Modo indeterminado (animación sin valor fijo). |
| `clockwise` | bool | `true` | Sentido horario para `circular-progress-bar`. |
| `from` | float | `0` | Valor mínimo del `range-slider`. |
| `to` | float | `100` | Valor máximo del `range-slider`. |
| `label-format` | string | `""` | Formato del label del slider (ej. `"%.0f%%"`). |
| `track-thickness` | medida | — | Grosor de la pista de la barra. |

#### 4.11a Stepper (`viewmode="stepper"`, `type="N"`)

Control compacto `−` / `+` para valores **enteros**. Auto-repite cada 80 ms al mantener pulsado.

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `min` | int | `0` | Valor mínimo. Si el valor actual es menor, se clampa al cargar. |
| `max` | int | `100` | Valor máximo. Debe ser `>= min` (si no, lanza `IllegalArgumentException`). |
| `step-size` | int | `1` | Incremento por pulsacion. Debe ser `> 0`. |
| `wrap` | bool | `false` | Si `true`, al sobrepasar `max` vuelve a `min` (selector ciclico). |
| `bar-color` | color | — | Color de fondo de los botones `−` / `+`. |
| `forecolor` | color | — | Color del número del centro. |
| `disableedit` | formula/bool | `false` | Si evalua a `true`, los botones quedan deshabilitados. |

API JavaScript: `getValue()`, `setValue(n)`, `setMin(n)`, `setMax(n)`, `setStepSize(n)` (en el control).

#### 4.11b OTP (`viewmode="otp"`, `type="T"` o `type="N"`)

Entrada de códigos de un solo uso con cajas individuales, auto-avance, backspace inverso y paste distribuido. Se persiste como string concatenado sin separadores.

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `digits` | int | `6` | Número de cajas (debe ser positivo). Una caja por carácter. |
| `secret` | bool | `false` | Si `true`, oculta los caracteres (modo password). Útil para PINs. |
| `auto-submit` | bool | `true` | Si `true`, al rellenar la última caja oculta el teclado. |
| `allow-letters` | bool | `false` | Si `true`, acepta letras además de digitos. |
| `box-size` | medida | `44p` | Tamaño (ancho y alto) de cada caja. |
| `box-spacing` | medida | `8p` | Separación horizontal entre cajas. |
| `box-color` | color | — | Color de fondo de las cajas en estado normal. |
| `box-color-focus` | color | usa `box-color` | Color de fondo de la caja con foco. |
| `forecolor` | color | — | Color del texto dentro de las cajas. |
| `disableedit` | formula/bool | `false` | Si evalua a `true`, control en solo lectura. |

API JavaScript: `getOtpValue()`, `clearOtp()`, `focusOtp()` (en el control).

#### 4.11c Kanban (`viewmode="kanban"`, `type="Z"`)

Tablero estilo Trello/Jira con drag&drop entre columnas. Al soltar una card, el framework asigna al campo `kanban-column-field` el valor de la columna destino y guarda automáticamente.

| Atributo | Tipo | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `contents` | string | **Si** | — | Nombre del `<contents>` vinculado. |
| `kanban-column-field` | string | **Si** | — | Campo del item cuyo valor determina la columna. |
| `kanban-columns` | string | **Si** | — | Valores posibles separados por `\|` (ej. `TODO\|DOING\|DONE`). Define orden y número de columnas. |
| `kanban-column-titles` | string | No | usa los valores | Títulos visibles separados por `\|`. |
| `kanban-column-colors` | string | No | gris claro | Colores de fondo de las cabeceras separados por `\|`. Acepta `#RRGGBB` y `#AARRGGBB`. |
| `kanban-column-width` | medida | No | `280p` | Ancho de cada columna. |
| `kanban-card-title-field` | string | No | — | Campo a mostrar como título (modo simple). |
| `kanban-card-subtitle-field` | string | No | — | Campo a mostrar como subtítulo (modo simple). |
| `kanban-card-bgcolor` | color | No | blanco | Color de fondo de las cards. |
| `draggable` | bool | No | `true` | Si `false`, deshabilita drag&drop. |
| `disableedit` | formula/bool | No | `false` | Si evalua a `true`, las cards no son arrastrables. |

**Modos de renderizado:**
- **Simple:** activo si esta presente al menos uno de `kanban-card-title-field` / `kanban-card-subtitle-field`. La card muestra título + subtítulo.
- **Objeto XOne completo:** activo si **ninguno** de esos atributos esta presente. La card usa el `<frame>` declarado en la coll del contents.

Cards cuyo valor no coincida con ninguna columna declarada **no se muestran**.

#### 4.11d Cover Flow (`viewmode="coverflow"`, `type="Z"`)

Variante de `slideview` con efecto Cover Flow estilo iTunes. Hereda toda la configuración de `slideview`.

| Atributo | Tipo | Default | Rango | Descripción |
|---|---|---|---|---|
| `cover-flow-min-scale` | float | `0.75` | `0.0` – `1.0` | Escala mínima de las cards laterales. |
| `cover-flow-min-alpha` | float | `0.6` | `0.0` – `1.0` | Opacidad mínima de las cards laterales. |
| `cover-flow-rotation` | float (grados) | `0` | — | Rotación 3D sobre el eje Y de las cards laterales. Si `!= 0`, aplica perspectiva 3D real. Típicos: `25`–`45`. |

Valores de scale/alpha fuera de `[0,1]` se recortan automáticamente.

#### 4.11e Chips (`viewmode="chipsview"`, `type="Z"`)

Conjunto de **chips Material** (pastillas redondeadas) con *wrap* automático a varias filas. Cada fila del `<contents>` vinculado se pinta como un chip.

| Atributo | Tipo | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `contents` | string | **Si** | — | Nombre del `<contents>` vinculado (su colección aporta los chips). |
| `width` / `height` | medida | No | `wrap` | Tamaño del contenedor de chips. `height="-2"` = ajuste al contenido. |

En la **colección del contents** se declaran (sobre sus `<prop>`):

| Atributo de prop | Obligatorio | Descripción |
|---|---|---|
| `chip-value` | **Si** (en una prop) | Marca la prop cuyo valor es el **texto del chip**. |
| `chip-close-enabled` | No | Marca una prop booleana; si su valor es verdadero el chip muestra una "x" para cerrarse. |

Notas de uso:
- Para chips generados al vuelo, la colección puede ser **en memoria**: `volatile="true"` + **`manual-load="true"`** + **`loadall="true"`** en la `<coll>` (si no, el control la recarga desde BD y la deja vacía). Se rellena por JS con `createObject()` + **`addItem()`** (NO `save()`), luego `lock()` y `ui.refresh("NOMBRE_DEL_Z")`.
- **Todos los chips son seleccionables (toggle)** → sirven directamente como *filter chips*. Eventos del prop: `onitemschanged="h(e)"` (el handler recibe `e.values` = array con los textos marcados y `e.ids` = sus ids), `onitemremoved="h(e)"` al cerrar un chip (`e.value` / `e.id`). Alternativa imperativa: `ui.getView(self).getControl("NOMBRE").getCheckedValues()` → `[{id, value}]`.

#### 4.11e Markdown (`viewmode="markdown"`, `type="T"`)

Renderiza el contenido del campo como Markdown CommonMark base (cabeceras, enfasis, listas, enlaces, imágenes, blockquotes, código inline / en bloque, reglas horizontales). **No introduce atributos propios** — aplican los atributos comunes de `type="T"` (`fontsize`, `forecolor`, `align`, margenes, etc.).

**No soportado por defecto:** tablas, strikethrough, task lists, HTML embebido, syntax highlighting.

#### 4.11f NavigationBar pill animada (`viewmode="navbar"`, `type="N"`)

Barra de navegación Material 3 con indicador "pill" deslizante. El valor del campo es el índice del destino activo (0..N−1); tocar un destino lo escribe y dispara el `<onchange>`, y un cambio del valor por código (con refresco) desliza la pill. Los destinos se declaran **inline** (no desde un `<contents>`).

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `nav-titles` | string | — | Títulos de los destinos separados por barra vertical. Define el número de pills. |
| `nav-icons` | string | — | Iconos (recurso, como los `img` de botón) separados por barra vertical, emparejados por posición con los títulos. Se tiñen con el color activo / inactivo. |
| `pill-color` | color | `#E8DEF8` | Color de la pill deslizante. |
| `pill-text-color` (o `forecolor`) | color | `#1D192B` | Color de icono + texto del destino activo. |
| `nav-text-color` | color | `#49454F` | Color de icono + texto de los destinos inactivos. |
| `bar-color` / `bgcolor` | color | transparente | Color de fondo de la barra. |
| `label-visibility` | enum | `always` | `always`, `selected` (solo el activo) o `never`. |
| `animation-duration` | int (ms) | `300` | Duración del deslizamiento. |
| `pill-corner-radius` | medida | mitad de la altura | Radio de las esquinas de la pill. |
| `nav-icon-size` | medida (dp) | `24` | Tamaño del icono. |
| `disableedit` / `locked` | formula/bool | `false` | Si evalúa a `true`, la barra no es tocable ni muestra efecto al pulsar (queda como indicador). |

El índice se acota a `[0, nº de pills − 1]`; un valor negativo cae a `0` y uno mayor que el máximo al último, corrigiéndose también en el campo. API JavaScript: `getValue()`, `setValue(n)`, `getItemCount()` (en el control).

### 4.12 Animaciones y eventos inline

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `animation-in` | string | `""` | Macro de animación de entrada (ej. `##RIGHT_IN##`, `##BOTTOM_IN##`). |
| `animation-in-delay` | int (ms) | `0` | Retardo antes de ejecutar la animación de entrada. |
| `animation-out` | string | `""` | Macro de animación de salida. |
| `repeat-mode` | enum | `restart` | **Solo animaciones Lottie en `type="IMG"`.** `restart` (vuelve a empezar) o `reverse` (va y vuelve). La animación arranca sola en bucle infinito, así que sin declararlo se repite desde el inicio. |
| `clip-text-to-bounds` | bool | `false` | **Solo animaciones Lottie en `type="IMG"`.** Recorta el texto de párrafo a la caja definida en el diseño. Una línea que desborde la altura no se dibuja en absoluto, de ahí que venga apagado: si la fuente no es la del diseño, el texto se reparte en más líneas y desaparece contenido. |
| `ripple-effect` | bool | `true` | Efecto ripple Material Design al pulsar. |
| `onclick` | script | `""` | Script JavaScript inline al pulsar el control. **Solo como atributo**, nunca como nodo hijo `<onclick>`. **El valor es SIEMPRE JS ejecutable, NO el nombre de un nodo.** `onclick="abrirTareas"` (sin paréntesis) evalúa `abrirTareas` como variable JS global undefined y el botón no hace nada silenciosamente. **Modo estricto:** cada sentencia debe terminar en `;` (incluida la última, también si el script acaba con un bloque `{...}`). Para invocar un nodo XML custom de la coll usar `method="executenode(nombreNodo)"` o, desde JS, `self.ExecuteNode('nombreNodo');` (nombre como string literal entre comillas, **no** `ExecuteNode(nombreNodo)` ni `ExecuteNode(función())`). |
| `onchange` | script | `""` | Script al cambiar el valor. Misma regla que `onclick` (script inline, `;` al final de cada sentencia). |
| `onfocus` | script | `""` | Script al recibir foco. Misma regla que `onclick`. |
| `ontouchdown` | script | `""` | **Solo `type="B"`.** Script JavaScript inline al presionar el botón (en el instante en que el dedo lo toca). Misma regla que `onclick`. Junto con `ontouchup` permite interacciones "mantener pulsado". El objeto evento `e` expone `e.x`/`e.y` (coordenadas del toque). |
| `ontouchup` | script | `""` | **Solo `type="B"`.** Script JavaScript inline al soltar el botón (al levantar el dedo o cancelarse el gesto). Misma regla que `onclick`. Se dispara antes que `onclick` si ambos están definidos. |
| `execute-async` | bool | `false` | Ejecuta el script de eventos de forma asíncrona. |
| `load-async` | bool | `false` | Carga del control de forma asíncrona. |
| `abort-on-error` | bool | `false` | Aborta la cadena de eventos si se produce un error. |
| `sound` | string | `""` | Sonido a reproducir al interactuar con el control. |

### 4.13 Multimedia y archivos adjuntos

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `attach-allowed` | string | `""` | Tipos MIME permitidos para adjuntos (ej. `"image/*"`, `"application/pdf"`). |
| `file-maxsize` | int (KB) | `0` | Tamaño máximo del fichero adjunto en KB. `0` = sin limite. |
| `file-maxwidth` | int | `0` | Ancho máximo para imágenes capturadas. |
| `file-maxheight` | int | `0` | Alto máximo para imágenes capturadas. |
| `file-quality` | int (%) | `90` | Calidad JPEG para imágenes. |
| `max-duration` | int (s) | `0` | Duración máxima para video/audio. `0` = sin limite. |
| `use-internal-camera` | bool | `false` | Captura con la cámara que trae el framework en vez de abrir la app de cámara del dispositivo. |
| `motion-photo` | bool | `false` | Captura una foto en movimiento: un JPG con un clip de vídeo corto embebido detrás, que las galerías compatibles reproducen. Requiere `use-internal-camera="true"` para funcionar en cualquier versión de Android; sin él lo tiene que implementar la app de cámara del dispositivo (Android 16 o superior). Ignora los atributos `file-*`, porque recomprimir la imagen tiraría el vídeo. |
| `apply-format-to-file` | bool | `false` | Aplica el formato al fichero resultante (para `type="DR"`). |

### 4.14 Machine Learning y camara avanzada

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `analyze-exif-metadata` | bool | `false` | Gira el fichero de imagen según la orientación con la que se hizo la foto, para que se vea derecho en cualquier visor. Girar obliga a recomprimir la imagen; si la foto es una foto en movimiento, el clip de vídeo se conserva. |
| `ml-model` | string | `""` | Ruta del modelo TensorFlow Lite (`.tflite`). |
| `ml-model-quantized` | bool | `false` | Indica que el modelo esta cuantizado. |
| `ml-classes` | string | `""` | Ruta del fichero de clases/etiquetas del modelo. |
| `ml-input-size` | int | — | Tamaño de entrada del modelo (en pixeles). |
| `ml-threads` | int | `1` | Número de hilos para inferencia. |
| `ml-use-gpu` | bool | `false` | Usa GPU para inferencia. |
| `ml-use-nnapi` | bool | `false` | Usa Android NNAPI para inferencia. |
| `ml-use-yolo-v5` | bool | `false` | Activa el modo de deteccion YOLOv5. |
| `ml-filter-min-confidence` | float | `0.5` | Confianza mínima para mostrar un resultado (0.0-1.0). |

### 4.15 Atributos varios

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `classid` | string | `""` | Control especial por ID de clase: `mobbsignview` (firma Mobbsign), `vaxtorocr` (OCR Vaxtoro), `xonecharts` (gráficos avanzados). |
| `phone` | bool | `false` | Permite marcar el número de telefono al pulsar. |
| `barcode` | bool | `false` | Permite escanear un código de barras al pulsar. |
| `method` | string | `""` | Nombre del método ejecutable asociado. |
| `message` | string | `""` | Mensaje de confirmacion antes de ejecutar la acción. |
| `scale` | float | `1.0` | Escala global del control. |
| `accessibility-label` | string | `""` | Etiqueta para lectores de pantalla (accesibilidad). |
| `draggable-scrollbar` | bool | `false` | Scrollbar arrastrable con el dedo. |
| `show-scrollbar` | bool | `true` | Muestra la barra de desplazamiento. |
| `paging-enabled` | bool | `false` | Activa paginación en listas. |
| `page-swipe` | bool | `false` | Permite cambiar de página deslizando. |
| `records-limit` | int | `0` | Limite de registros visibles. `0` = sin limite. |
| `edit-inrow` | bool | `false` | Edita el registro directamente en la fila de lista. |
| `grid-header` | bool | `false` | Muestra cabecera de columna en grid. |
| `click-anywhere` | bool | `false` | Hace que el clic sobre el texto del control abra su picker, sin necesidad de pulsar el botón/lupa. Aplica a: campos con `linked-to` + `linked-field` y `showinline="true"` (excepto `viewmode="spinner"`) — el texto abre el selector de registro enlazado; `type="D"`, `type="DT"` y `type="TT"` (y `type="T"` con `mask="Hh#:#Mm"`) — el texto de fecha abre `DatePicker` y el de hora abre `TimePicker` (en `DT` cada zona dispara su propio diálogo). Ignorado en cualquier otro control. |
| `icon-inside` | bool | `false` | En controles con botón lateral (`linked-to` + `linked-field` con `showinline="true"` excepto `viewmode="spinner"`, `linked-to` + `linked-field` con `showinline="false"`, `type="D"`, `type="DT"`, `type="TT"`), si está activo el icono se pinta dentro del propio texto en lugar de a su lado, y el clic sobre la zona del icono abre el picker del control. |
| `icon-align` | enum | `right` | En los mismos controles que `icon-inside`. Posiciona el icono respecto al texto: `left` lo coloca antes del texto, `right` (default) lo deja al final. Los valores `top` y `bottom` se aceptan pero se tratan como `right` en esta versión. |
| `check-type` | enum | (omitido) | Para `type="NC"`: `toggle`, `switch`, `radio`. Si se omite o se pasa otro valor, se renderiza un CheckBox estándar. |
| `radio-group` | string | `""` | Grupo de radio buttons (para `check-type="radio"`). |
| `code-type` | string | `""` | Tipo de código para `type="VD"`: `qr`, `barcode`, `any`. |
| `show-user-location` | bool | `false` | Muestra la ubicación del usuario en el mapa (`type="Z" viewmode="mapview"/"maplibre"/"openstreetmap"`). |

