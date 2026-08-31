# XOne XML — Nodo prop: atributos, visibilidad y condiciones

> Fuente: `xone/v2/xone-help-docs/topics/02b-xml-prop-tipos.md` §5.1–§5.8, §5.10–§5.11. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §5.1 tabla completa de tipos · §5.2 atributos comunes · §5.3 sistema de visibilidad · §5.4 dimensiones y márgenes · §5.5 estilos inline · §5.6 comportamiento · §5.7 bordes · §5.8 disablevisible y disableedit · §5.10 buenas prácticas · §5.11 errores comunes

---

### 5.1 Tabla completa de tipos

Lista autoritativa de tipos de `<prop>` reconocidos por XOne (constantes `PROP_TYPE_*` en `Utils.java`). El sufijo numérico en `N` y `TN` indica los decimales visibles en el control (`N2` = 2 decimales, ..., `N6` = 6 decimales).

| Tipo | Nombre | Descripción | Equivalente web |
|------|--------|-------------|-----------------|
| `T` | Texto | Campo de texto editable | `<input type="text">` |
| `L` | Label | Texto de solo lectura (etiqueta) — forma preferida | `<span>`, `<label>` |
| `TL` | Label (alias legacy) | Alias legacy de `L`: se renderiza como label. | `<span>`, `<label>` |
| `THTML` | Texto HTML enriquecido | Muestra contenido HTML formateado con etiquetas | - |
| `N` | Numérico | Número entero | `<input type="number">` |
| `N2` | Numérico 2 decimales | Número con 2 decimales (precios) | - |
| `N3` | Numérico 3 decimales | Número con 3 decimales | - |
| `N4` | Numérico 4 decimales | Número con 4 decimales | - |
| `N5` | Numérico 5 decimales | Número con 5 decimales (coordenadas) | - |
| `N6` | Numérico 6 decimales | Número con 6 decimales | - |
| `TN` | Número-Texto | Número almacenado como texto (entero) | - |
| `TN2` | Número-Texto 2 decimales | Número almacenado como texto con 2 decimales | - |
| `TN3` | Número-Texto 3 decimales | Número almacenado como texto con 3 decimales | - |
| `TN4` | Número-Texto 4 decimales | Número almacenado como texto con 4 decimales | - |
| `TN5` | Número-Texto 5 decimales | Número almacenado como texto con 5 decimales | - |
| `TN6` | Número-Texto 6 decimales | Número almacenado como texto con 6 decimales | - |
| `B` | Botón | Botón de acción | `<button>` |
| `NC` | Checkbox/Toggle/Radio/Switch | Booleano con varias apariencias según `check-type` (`toggle`/`radio`/`switch` o default checkbox) | `<input type="checkbox">` / `<input type="radio">` |
| `D` | Fecha | Selector de fecha | `<input type="date">` |
| `DT` | Fecha y hora | Selector de fecha y hora | `<input type="datetime-local">` |
| `TT` | Hora | Selector de hora | `<input type="time">` |
| `X` | Password | Campo de contrasena enmascarado | `<input type="password">` |
| `IMG` | Imagen | Visualizador de imagen referenciada | `<img>` |
| `PH` | Foto | Captura de foto con camara | - |
| `VD` | Video/Camara/Escaner | Camara, video o escaner QR/barcode | `<video>` |
| `DR` | Dibujo/Firma | Control para capturar firmas o dibujos a mano alzada | - |
| `Z` | Contenedor de lista | Lista embebida / grid / mapa (`viewmode="mapview"`) / kanban / slider / etc. según `viewmode` | `<table>`, `<ul>` |
| `WEB` | WebView | Contenido web embebido | `<iframe>` |
| `AT` | Adjunto | Campo de archivo adjunto | `<input type="file">` |
| `O` | DataObject | Sub-objeto JavaScript (no persiste en BD) | - |

> **Combos/selectores**: NO tienen un type propio. Se implementan con `type="T"` (o `type="N"`) más los atributos `mapcol` y `mapfld` que apuntan a la coleccion de origen y al campo de enlace.
>
> **Mapas**: se implementan con `type="Z" viewmode="mapview"` (Google Maps), `"maplibre"` u `"openstreetmap"`. No existe un `type="M"`.
>
> **Sliders, progress bars, stepper, OTP, navbar, kanban, coverflow, markdown**: son **viewmodes** sobre los tipos `T`, `N` o `Z`. No son types propios. Ver §5.9 (atributos por tipo) y la guía de atributos del tópico 07.

### 5.2 Atributos comunes

Estos atributos aplican a todos los tipos de `<prop>`:

| Atributo | Tipo | Requerido | Descripción |
|----------|------|-----------|-------------|
| `name` | string | **Si** | Nombre único del campo. **El ambito de unicidad es la `<coll>` ENTERA**, no el `<group>` o `<frame>` que lo contiene: no pueden existir dos props con el mismo `name` en cualquier parte de la misma coll, ni siquiera en `<group>` o `<frame>` distintos. Convencion: `MAP_NOMBRE` para campos de UI, `NOMBRE` para campos de BD. |
| `type` | string | **Si** | Tipo del control (ver tabla anterior). |
| `title` | string | No | Etiqueta/texto mostrado junto al campo. |
| `visible` | integer | No | Mascara de bits de visibilidad (ver sección 5.3). Default: `0`. |
| `width` | dimensión | No | Ancho del control (`"100%"`, `"200p"`, etc). |
| `height` | dimensión | No | Alto del control. |
| `class` | string | No | Clase CSS para estilizar (ver Tópico 04). |

### 5.3 Sistema de visibilidad (`visible`)

El atributo `visible` define **en que contextos de la UI se pinta el campo**. Es una decisión estática tomada en tiempo de diseño — **no se puede cambiar en tiempo de ejecución**, ni por script, ni por eventos, ni por condiciones. Si un campo tiene `visible="0"`, no existe en pantalla en ningun momento.

Funciona como un bitmask donde cada bit representa un contexto de visualizacion:

| Bit | Valor decimal | Contexto |
|-----|---------------|----------|
| Bit 0 | 1 | Visible en modo **edición** (formulario individual) |
| Bit 1 | 2 | Visible en modo **lista** (vista de registros) |
| Bit 2 | 4 | Visible en **content** (lista embebida `type="Z"`) |
| Bit 3 | 8 | Visible en **combo** (desplegable) |

Cualquier combinacion de bits es valida. Las más usadas:

| Valor | Contextos | Uso típico |
|-------|-----------|------------|
| `0` | Ninguno | Campo puramente interno — solo existe para lógica |
| `1` | Edición | Solo en formulario individual |
| `2` | Lista | Solo en vista de registros |
| `3` | Edición + Lista | En formulario y en lista |
| `4` | Content | Solo en listas embebidas |
| `7` | Edición + Lista + Content | **El más habitual** |
| `8` | Combo | Solo visible en desplegables |
| `15` | Todos | Edición + Lista + Content + Combo |

```xml
<!-- Campo ID oculto, solo para lógica -->

<!-- Nombre visible en todos los contextos principales -->
<prop name="NOMBRE" type="T" visible="7" title="Nombre" />

<!-- Descripción solo en el formulario de detalle -->
<prop name="DESCRIPCION" type="T" visible="1" title="Descripción detallada" />

<!-- Resumen solo en la vista de lista -->
<prop name="MAP_RESUMEN" type="L" visible="2" />

<!-- Campo para filas de content embebido -->
<prop name="MAP_NOMBRE_GRID" type="T" visible="4" />

<!-- Campo que también debe aparecer en un combo -->
<prop name="NOMBRE" type="T" visible="15" />
```

> **Diferencia con `disablevisible`:** `visible` es estático — decide si el campo existe en pantalla en ese contexto. `disablevisible` es dinámico — el campo existe pero se muestra u oculta según el valor de otro campo en tiempo de ejecución. Ver sección 5.8.

### 5.4 Dimensiones y margenes

```xml
<prop name="CAMPO" type="T"
      width="90%"           <!-- Ancho -->
      height="56p"          <!-- Alto -->
      tmargin="20p"         <!-- Margen superior -->
      bmargin="10p"         <!-- Margen inferior -->
      lmargin="5%"          <!-- Margen izquierdo -->
      rmargin="5%"          <!-- Margen derecho -->
      tpadding="10p"        <!-- Padding superior -->
      bpadding="10p"        <!-- Padding inferior -->
      lpadding="10p"        <!-- Padding izquierdo -->
      rpadding="10p"        <!-- Padding derecho -->
/>
```

### 5.5 Estilos inline

| Atributo | Tipo | Descripción | Ejemplo |
|----------|------|-------------|---------|
| `class` | string | Clase CSS (pueden ser multiples separadas por espacio) | `class="mClassT alineacion color"` |
| `forecolor` | color | Color del texto | `forecolor="#333333"` |
| `bgcolor` | color | Color de fondo | `bgcolor="#FFFFFF"` |
| `fontsize` | integer | Tamaño de fuente | `fontsize="14"` |
| `fontbold` | boolean | Texto en negrita | `fontbold="true"` |
| `fontname` | string | Archivo de fuente (.ttf) | `fontname="Roboto-Bold.ttf"` |
| `align` | string | Posición del prop dentro del frame contenedor. Mismos valores que en `<frame>` y `<group>`. Ver sección 4.2 del sub-archivo 02a | `align="center\|center"` |
| `text-align` | string | Alineacion del texto **dentro** del campo editable | `text-align="center"` |
| `label-align` | string | Alineacion de la etiqueta del prop | `label-align="left"` |

Ejemplo con multiples clases CSS (del wiki, EspecialBasicos.xne):

```xml
<prop name="MAP_EJEMPLO3" class="mClassT alineacion color"
      type="T" title="TRES CSS" />
```

### 5.6 Comportamiento

| Atributo | Tipo | Descripción | Ejemplo |
|----------|------|-------------|---------|
| `locked` | boolean | **Bloquea la UI de edición** del control (no editable visualmente). Versión estática de `disableedit` (fórmula). **No** afecta a la persistencia: si el valor cambia desde JS, sí se graba. Para impedir que el campo se grabe en BD usar `readonly="true"` (ver tópico 07 §4.3). | `locked="true"` |
| `readonly` | boolean | **Excluye el campo del UPDATE en BD**. NO bloquea la UI (los controles T/N/NC/spinner no lo leen). Excepción: en `type="VD"` actúa como flag UI (`true`=reproducir, `false`=capturar). Para bloquear edición visual usar `locked`. | `readonly="true"` |
| `newline` | boolean | Por defecto `true` (nueva línea). Si es `false`, el prop se coloca a la derecha del anterior en la misma línea. Ver sección 4.3b del sub-archivo 02a para detalle completo | `newline="false"` |
| `tooltip` | string | Texto de ayuda (placeholder) | `tooltip="Escriba aquí..."` |
| `floating-tooltip` | boolean | El tooltip flota sobre el campo al escribir | `floating-tooltip="true"` |
| `labelwidth` | integer | Ancho de la etiqueta. `0` = sin etiqueta | `labelwidth="0"` |
| `labelbox` | boolean | Muestra caja alrededor de la etiqueta | `labelbox="false"` |
| `label-wrap` | boolean | La etiqueta puede ocupar varias lineas | `label-wrap="true"` |
| `lines` | integer | Número de lineas de texto | `lines="3"` |
| `fixed-lines` | boolean | Fija el número de lineas (no crece) | `fixed-lines="true"` |
| `size` | integer | Tamaño de la columna en la base de datos (en caracteres). XOneStudio lo usa para crear la columna con ese tamaño. Si se combina con `fixed-text="true"`, además impide escribir más caracteres de los indicados en UI | `size="150"` |
| `fieldsize` | integer | Ancho visual de la caja del campo, calculado como: ancho de carácter x valor. **En proyectos nuevos no es necesario — usar `width` en su lugar**, ya que `width` tiene prioridad sobre `fieldsize` cuando ambos están presentes | `fieldsize="100"` |
| `phone` | boolean | Indica que el campo es un número de telefono (activa enlace telefonico) | `phone="true"` |
| `input-type` | string | Tipo de teclado en dispositivo (valores exactos): `text`, `numeric`, `numeric_unsigned`, `decimal`, `phone`, `datetime`, `email`, `username`, `uri`, `password`, `none`. `number`/`url` NO existen → usar `numeric`/`uri` (un valor no reconocido lanza error) | `input-type="numeric"` |
| `scale-type` | string | Tipo de escalado para imágenes: `center_crop`, `fit_center`, `center_inside`, `fit_xy` | `scale-type="center_crop"` |
| `edit-inrow` | boolean | Permite la edición directa dentro de las filas de una lista (type="Z") | `edit-inrow="true"` |
| `show-no-data` | string/boolean | Texto o indicador a mostrar cuando no hay datos en la lista | `show-no-data="true"` |
| `start-from-bottom` | boolean | El scroll de la lista (`type="Z"`) arranca y se mantiene anclado al último elemento (estilo chat). Declarado aquí tiene preferencia sobre el mismo atributo en la `<coll>` | `start-from-bottom="true"` |
| `divider-height` | integer | Alto (grosor) del separador entre ítems de la lista (`type="Z"`). En listas expandibles el default es `4` | `divider-height="2"` |
| `divider-color` | color | Color del separador entre ítems de la lista (`type="Z"`) | `divider-color="#DDDDDD"` |
| `divider-background` | string | Imagen (ruta de recurso) usada como separador entre ítems; tiene prioridad sobre `divider-color` | `divider-background="linea.png"` |
| `floating` | boolean | El prop se superpone sobre el layout, similar al frame flotante. Se posiciona con `top` y `left` | `floating="true"` |
| `keep-aspect-ratio` | boolean | Mantiene la proporcion original de la imagen al redimensionar | `keep-aspect-ratio="true"` |
| `updates` | string | Al cambiar este campo, propaga el cambio al campo indicado en otra coleccion contents | `updates="DESCRIPCION"` |
| `fixed-text` | boolean | Si es `true`, combinado con `size`, impide introducir más caracteres del limite indicado en UI | `fixed-text="true"` |
| `min-height` | dimensión | Alto mínimo del control. Útil para campos de texto multilinea | `min-height="120p"` |
| `ripple-effect` | boolean | Activa el efecto ripple de Material Design al pulsar | `ripple-effect="true"` |

**Atributos de imagen en botones:**

| Atributo | Descripción |
|----------|-------------|
| `img` | Imagen del botón en estado normal |
| `img-sel` | Imagen del botón al pulsarlo |
| `img-disabled` | Imagen cuando el botón esta deshabilitado |
| `img-delete` | Imagen del botón de borrar/limpiar en campos editables |
| `img-search` | Imagen del botón de busqueda (lupa) en campos mapeados |
| `img-spinner` | Imagen del desplegable combo con `showinline="true"` |
| `img-width` | Ancho del icono de imagen |
| `img-height` | Alto del icono de imagen |
| `img-date` | Imagen del selector de fecha |
| `img-time` | Imagen del selector de hora |
| `img-att` | Imagen del botón de adjuntar archivos |

### 5.7 Bordes

| Atributo | Tipo | Descripción | Ejemplo |
|----------|------|-------------|---------|
| `border` | boolean | Muestra borde | `border="false"` |
| `border-width` | integer | Ancho del borde | `border-width="2"` |
| `border-corner-radius` | integer | Radio de esquinas redondeadas | `border-corner-radius="10"` |
| `border-corner-radius-top-left` | integer | Radio esquina superior izquierda | `border-corner-radius-top-left="50"` |
| `text-border` | boolean | Borde solo en la zona de texto | `text-border="true"` |
| `text-border-bottom` | boolean | Solo borde inferior en el texto | `text-border-bottom="true"` |

### 5.8 Condiciones (`disablevisible`, `disableedit`)

#### disablevisible — Visibilidad condicional en tiempo de ejecución

El atributo `disablevisible` oculta el elemento en tiempo de ejecución cuando se cumple la condición especificada. A diferencia de `visible`, este si responde a los valores del objeto en pantalla. El campo referenciado en la condición debe existir en la misma coleccion.

Funciona en `<group>`, `<frame>` y `<prop>`.

**Formato de la condición:** `CAMPO=VALOR`, `CAMPO>VALOR`, `CAMPO<VALOR`

```xml
<!-- Oculta el prop cuando MAP_TIPO vale 0 -->
<prop name="MAP_DETALLE" type="T" visible="1"
      disablevisible="MAP_TIPO=0" />

<!-- Oculta el frame entero cuando ESTADO vale 2 -->
<frame name="frmExtra"
       disablevisible="ESTADO=2" />

<!-- Oculta el grupo entero cuando un campo es 0 -->
<group name="GrpOpciones" id="3"
       disablevisible="MAP_MOSTRAR=0" />
```

**Refresco del disablevisible por script:**

Cuando el campo referenciado en la condición cambia por código, hay que refrescar para que `disablevisible` se reevalúe. Hay dos formas:

```javascript
// Refrescar un prop específico
ui.refresh("MAP_DETALLE");

// Refrescar varios props — refresh()/refreshValue() aceptan varargs:
// argumentos sueltos, un string con comas, o un array (equivalentes)
ui.refresh("MAP_DETALLE", "MAP_EXTRA");     // varios argumentos
ui.refresh("MAP_DETALLE,MAP_EXTRA");        // string separado por comas
ui.refresh(["MAP_DETALLE", "MAP_EXTRA"]);   // array — útil para listas dinámicas

// Refrescar toda la pantalla (sin argumentos)
ui.refresh();

// Con referencia explicita a la vista — util en callbacks o eventos
var view = ui.getView(self);
view.refresh("MAP_DETALLE");   // prop específico
view.refresh();                // toda la pantalla
```

> **Listas dinámicas:** como `refresh`/`refreshValue` aceptan un **array**, cuando los campos a refrescar son condicionales conviene acumularlos y refrescar una sola vez — `let a=[]; if (cond) a.push("MAP_X"); if (a.length) ui.refresh(a);`.

> El `disablevisible` también se reevalua automáticamente si el campo referenciado tiene `onchange="refresh"` en el XML — en ese caso no hace falta llamar a `ui.refresh()` por script.

#### disableedit — Deshabilitacion condicional

El atributo `disableedit` deshabilita la edición del elemento si se cumple la condición. El campo sigue siendo visible pero el usuario no puede modificarlo.

```xml
<!-- Campo que se deshabilita condicionalmente -->
<prop name="MAP_TEXT3" type="T"
      title="Campo bloqueado condicionalmente"
      disableedit="MAP_CHECK1=1" />
```

| Atributo | Aplica en | Descripción |
|----------|-----------|-------------|
| `disablevisible` | `<group>`, `<frame>`, `<prop>` | Oculta el elemento si se cumple la condición |
| `disableedit` | `<group>`, `<prop>` | Deshabilita la edición si se cumple la condición |

### 5.10 Buenas prácticas

1. **Prefijo `MAP_`** para campos de UI temporal (no se guardan en BD).
2. **MAYUSCULAS** para campos de BD: `NOMBRE`, `DIRECCION`, `FECHA`.
3. **`labelwidth="0"`** cuando no necesitas etiqueta (botones de icono, imágenes, o campos cuyo contenido va en el *valor*: `T`, `N`, etc.). **NUNCA en `type="L"`/`TL`**: el texto del label (su `title`, o el valor del campo si no hay `title`) se pinta dentro del ancho de la etiqueta; con `labelwidth="0"` no queda sitio y el texto se vuelve invisible. Para alinear un label usa `label-align="left|center|right"`, no `labelwidth`.
4. **`visible="0"`** para campos internos/auxiliares.
5. **`type="L"`** para textos que solo se muestran, nunca `type="T"` con `locked="true"`. Un label muestra su `title`; si no declaras `title`, muestra el valor del campo, así que también sirve para valores dinámicos.
6. **`onclick` vs `method`**: Usa `method` para lógica compleja con nodos XML, `onclick` para JavaScript simple y directo. **No combines ambos** en el mismo prop.
7. **`viewmode="recyclerview"`** siempre para listas largas, mejora el rendimiento.

### 5.11 Errores comunes

| Error | Consecuencia | Solución |
|-------|-------------|----------|
| Olvidar `type` | Error de parseo XML | Siempre incluir `type` |
| `visible` incorrecto | Campo no aparece donde se espera | Revisar el bitmask (7 = todos) |
| `onclick` y `method` juntos | Solo se ejecuta uno | Usar uno u otro |
| `linkedto` sin `mapcol` en el prop oculto | Combo no carga opciones | Asegurar que el prop oculto tiene `mapcol` y `mapfld` |
| `contents` sin prefijo `@` | El content no se vincula | Usar `contents="@NombreContent"` |
| Usar `px` en lugar de `p` | Unidad no reconocida | Usar `p` (puntos) o `%` |
| Inventar atributos | Se ignoran silenciosamente | Consultar esta documentación |

