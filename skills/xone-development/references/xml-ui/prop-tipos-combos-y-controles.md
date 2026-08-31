# XOne XML — Props por tipo: combos, web y controles especiales

> Fuente: `xone/v2/xone-help-docs/topics/02b-xml-prop-tipos.md` L1123–1778. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §5.9.13-14 combo con mapcol/mapfld y con mapcol-values · §5.9.15 web · §5.9.17 slider y progress · §5.9.17b stepper · §5.9.17c OTP · §5.9.17d markdown · §5.9.17e navbar · §5.9.18 password X · §5.9.20 adjunto AT · §5.9.21 THTML · §5.9.22 firma DR · §5.9.23 enlace a colección · §5.9.24 búsqueda contextual · §5.9.25 onchange y refresco · §5.9.26 updates y formula

---

#### 5.9.13 Combo (`type="T"` + `mapcol`/`mapfld`) - Selector desplegable

> **No existe un `type="C"` propio en XOne.** Los combos/selectores se implementan con `type="T"` (o `type="N"`) más los atributos `mapcol` y `mapfld` que apuntan a la coleccion de origen y al campo de enlace.

El combo en XOne funciona con dos props vinculados: uno oculto que almacena el ID (con `mapcol`/`mapfld`) y otro visible que muestra la descripción (con `linkedto`/`linkedfield`).

```xml
<!-- Campo oculto que almacena el valor -->
<prop name="ID_TIPO" type="N" visible="0"
      mapcol="TiposProducto"
      mapfld="ID" />

<!-- Campo visible que muestra la descripción -->
<prop name="TIPO_DESC" type="T" visible="1"
      title="Tipo de producto"
      linkedto="ID_TIPO"
      linkedfield="DESCRIPCION"
      showinline="true" />
```

| Atributo | En prop oculto | Descripción |
|----------|---------------|-------------|
| `mapcol` | Si | Coleccion de donde obtener las opciones |
| `mapfld` | Si | Campo clave de la coleccion mapeada |
| `linkedto` | No (en visible) | Nombre del prop oculto vinculado |
| `linkedfield` | No (en visible) | Campo a mostrar de la coleccion mapeada |
| `showinline` | No (en visible) | Muestra las opciones en un panel de selección inferior |
| `showinline-keyboard` | No (en visible) | Añade una caja de búsqueda en la cabecera del panel para filtrar las opciones |
| `viewmode` | No (en visible) | `spinner` (desplegable) o `dialog` (dialogo) |
| `bgcolor-dialog` / `forecolor-dialog` / `fontsize-dialog` | No (en visible) | Color de fondo, color del texto de las opciones y tamaño del texto del panel |

> **Panel de selección (`showinline`).** Al pulsar el campo se abre un panel inferior con la lista de opciones. Con `showinline-keyboard="true"` la cabecera incluye una caja de búsqueda que filtra las opciones según se escribe. Se puede personalizar con `bgcolor-dialog`, `forecolor-dialog` (color del texto) y `fontsize-dialog`.

> **Nota sobre el prefijo `MAP_`:** por defecto, el prop visible de un combo (el que tiene `linkedto`) se nombra con prefijo `MAP_` (por ejemplo `MAP_TIPO_DESC`), porque su valor proviene del lookup y NO se persiste en la tabla de la coll. El prop oculto con el ID (el que tiene `mapcol`/`mapfld`) NO lleva `MAP_` cuando ese ID SI es columna de la tabla (es la FK). Ver concepto completo de campos `MAP_` en 01-xone-fundamentals.md.

#### 5.9.14 Combo con valores inline (mapcol-values)

Para combos simples con valores predefinidos (sin tabla de BD):

```xml
<!-- Campo oculto con valores inline -->
<prop name="MAP_IDTIPOIDEN" type="T" visible="0"
      mapcol-values="CC, TI, CE, Otro, Varios"
      mapfld="DATA" />

<!-- Campo visible -->
<prop name="TIPOIDENTIFICADOR" type="T" visible="1"
      title="Tipo Documento"
      showinline="true"
      linkedto="MAP_IDTIPOIDEN"
      linkedfield="DATA" />
```

Con `mapcol-values`, los valores se definen separados por comas directamente en el XML, sin necesidad de una coleccion en la BD.

> **Nota sobre el prefijo `MAP_`:** en combos con `mapcol-values`, el prop oculto lleva `MAP_` porque no existe ninguna tabla de la que leer/guardar sus opciones — solo existen en el XML. El prop visible lleva `MAP_` si el código seleccionado no se persiste como columna, o va sin `MAP_` si el código SI es columna propia de la tabla.

#### 5.9.15 Web (WEB)

> **⚠️ El control `WEB` es SOLO para contenido web remoto:** URLs `http://`/`https://`, vídeos embebidos, HTML servido. **NUNCA lo uses para mostrar una imagen local en formato SVG, PNG o JPG.** XOne renderiza SVG de forma nativa, exactamente igual que PNG y JPG. Para mostrar una imagen (incluida una `.svg`) usa `type="IMG"` con `path="dibujo.svg"`, o el atributo `img`/`imgbk` en cualquier control. No hace falta WebView ni convertir el SVG a otro formato.

```xml
<!-- Contenido web -->
<prop name="MAP_WEB" type="WEB" visible="1"
      height="40%"
      title="Página Web"
      onconsolemessage="handleError(e);" />

<!-- Video de YouTube -->
<prop name="MAP_VIDEO_ONLINE" type="WEB" visible="1"
      readonly="true"
      height="40%" />
```

Se establece la URL programaticamente:
```javascript
self.MAP_WEB = "http://ejemplo.com";
self.MAP_VIDEO_ONLINE = "https://www.youtube.com/watch?v=VIDEO_ID";
```

**Evento `onconsolemessage`** (atributo del `<prop type="WEB">`). Se dispara con cada mensaje de la consola del WebView (errores JS, `console.log`, etc.). Recibe un objeto `e` con:

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `e.target` | string | Nombre del prop que disparo el evento |
| `e.objItem` | object | DataObject que contiene el prop |
| `e.messageLevel` | string | Nivel del mensaje: `"LOG"`, `"DEBUG"`, `"WARNING"`, `"ERROR"`, `"TIP"` |
| `e.message` | string | Texto del mensaje |
| `e.lineNumber` | number | Linea del fuente donde se origino el mensaje |
| `e.sourceId` | string | URL/identificador del fuente que origino el mensaje |

```javascript
function handleError(e) {
    if (e.messageLevel === "ERROR") {
        ui.msgBox("Nivel: " + e.messageLevel +
            "\nMensaje: " + e.message +
            "\nLinea: " + e.lineNumber +
            "\nFuente: " + e.sourceId, "Error WebView", 0);
    }
}
```

#### 5.9.16 Firma con `type="IMG" readonly="false"` — OBSOLETO

> **OBSOLETO.** Este patron de firma (imagen editable con `readonly="false"`) esta deprecado. Para captura de firmas o dibujos a mano alzada usar siempre `type="DR"` (ver §5.9.22). Esta sección se mantiene solo para reconocer código legacy en proyectos antiguos.

#### 5.9.17 Slider (N con viewmode) y Progress

Los campos numéricos (`type="N"`) pueden mostrar controles visuales especiales mediante `viewmode`:

**ViewModes numéricos disponibles:**

| ViewMode | Descripción |
|----------|-------------|
| `seekbar` | Barra deslizante clasica con pulgar arrastrabe |
| `slider` | Control deslizante (variante moderna del seekbar) |
| `progress-bar` | Barra de progreso horizontal (solo lectura o indeterminada) |
| `circular-progress-bar` | Indicador de progreso circular |
| `range-slider` | Selector de rango con dos pulgares (valor mínimo y máximo) |
| `stepper` | Control compacto con dos botones `−` / `+` a los lados de un valor entero central (auto-repite al mantener pulsado). Ver sección 5.9.17b |
| `navbar` | Barra de navegación Material 3 con indicador "pill" deslizante; el valor es el índice del destino activo. Ver sección 5.9.17e |

```xml
<!-- Slider horizontal -->
<prop name="MAP_SLIDER" type="N" visible="1"
      viewmode="slider"
      orientation="horizontal"
      min="0" max="100"
      thumb-color="#FF00FF"
      bar-color="#FF0000"
      track-color="#00FF00"
      notify-only-when-dropped="false" />

<!-- Barra de progreso -->
<prop name="MAP_PROGRESS" type="N" visible="1"
      viewmode="progress-bar"
      indeterminate="true"
      bar-color="#FF0000"
      track-color="#00FF00" />

<!-- Progreso circular -->
<prop name="MAP_CIRCULAR" type="N" visible="1"
      viewmode="circular-progress-bar"
      bar-color="#1565C0" />

<!-- Rango (Range Slider) -->
<prop name="MAP_RANGE" type="N" visible="1"
      viewmode="range-slider"
      min="0" max="100" />

<!-- Seekbar con imagenes personalizadas -->
<prop name="MAP_SEEK" type="N" visible="1"
      viewmode="seekbar"
      min="0" max="100"
      img-thumb="thumb.png"
      img-progress-left="progress_left.png"
      notify-only-when-dropped="true" />
```

#### 5.9.17b Stepper numérico (viewmode="stepper")

Control numérico compacto con dos botones `−` / `+` a los lados de un valor central. Aplica a `<prop type="N">` y maneja **valores enteros**. Cada pulsacion aplica `±step-size`; al mantener pulsado un botón, se aplica el primer paso al instante y luego **auto-repite cada 80 ms** hasta soltar o alcanzar el limite.

```xml
<!-- Stepper básico de cantidad (0..99, paso 1) -->
<prop name="CANTIDAD" type="N" visible="1"
      viewmode="stepper"
      min="0" max="99"
      step-size="1"
      title="Cantidad" />

<!-- Stepper con colores personalizados -->
<prop name="PERSONAS" type="N" visible="1"
      viewmode="stepper"
      min="1" max="20"
      step-size="1"
      bar-color="#2196F3"
      forecolor="#212121"
      title="Personas" />

<!-- Stepper ciclico (al llegar al max, vuelve al min) -->
<prop name="HORA" type="N" visible="1"
      viewmode="stepper"
      min="0" max="23"
      step-size="1"
      wrap="true"
      title="Hora" />
```

**Atributos:**

| Atributo | Default | Descripción |
|----------|---------|-------------|
| `min` | `0` | Valor mínimo (entero). Si el valor actual es menor, se clampa al cargar |
| `max` | `100` | Valor máximo (entero). Debe ser `>= min` (si no, lanza `IllegalArgumentException`) |
| `step-size` | `1` | Incremento por pulsacion. Debe ser `> 0` |
| `wrap` | `false` | Si `true`, al sobrepasar `max` vuelve a `min` y viceversa (selector ciclico). Si `false`, se queda fijo en el limite |
| `bar-color` | — | Color de fondo de los botones `−` / `+`. Acepta `#RRGGBB` y `#AARRGGBB` |
| `forecolor` | — | Color del número del centro |
| `disableedit` | `false` | Formula o literal; si evalua a `true`, los botones quedan deshabilitados |

**Comportamiento:**

- **Pulsacion corta:** aplica una vez `±step-size`.
- **Pulsacion larga (long-press):** aplica el primer paso al instante y luego auto-repite cada **80 ms** hasta soltar (`ACTION_UP` / `ACTION_CANCEL` / `ACTION_OUTSIDE`).
- **Sin `wrap`:** el valor se clampa al rango `[min, max]`. Los botones quedan clicables aunque se llegue al limite (no producen cambio).
- **Con `wrap="true"`:** wrap ciclico — útil para hora (0–23), día de la semana (0–6).
- **Propagacion:** cada cambio dispara `dataObject.put(sProp, nValue)` y re-evalua los triggers (`<onchange>` y propagaciones).

**API JavaScript:**

| Método | Efecto |
|--------|--------|
| `control.getValue()` | Devuelve el valor actual como entero |
| `control.setValue(n)` | Asigna el valor (se clampa al rango). Si cambia, dispara callback de cambio |
| `control.setMin(n)` | Cambia el mínimo en runtime. Si `max` queda por debajo, también se ajusta; si el valor actual queda por debajo del nuevo `min`, se sube |
| `control.setMax(n)` | Cambia el máximo en runtime. Misma lógica de ajuste cruzado |
| `control.setStepSize(n)` | Cambia el incremento. Debe ser `> 0` (si no, lanza error) |

```javascript
// Ajustar el rango dinamicamente según otro campo
function onTipoChange() {
    var ctrl = getControl("CANTIDAD");
    if (self.TIPO === "PACK_GRANDE") {
        ctrl.setMin(10);
        ctrl.setMax(500);
        ctrl.setStepSize(10);
    } else {
        ctrl.setMin(1);
        ctrl.setMax(99);
        ctrl.setStepSize(1);
    }
}
```

**Casos de uso típicos:** cantidades en carritos, spinners de configuración (zoom, volumen discreto), selectores ciclicos (hora, día semana), pasos de wizard.

**Notas:**

- Solo maneja **valores enteros**. Para incrementos decimales, usar `slider` o `seekbar`.
- El valor se persiste como entero en el campo del prop.
- Si `max < min`, el framework lanza `IllegalArgumentException`. Si `step-size <= 0`, igualmente.
- Los botones se renderizan con caracteres Unicode (`−` U+2212 para el menos, `+` para el más) sobre fondos coloreados con `bar-color`.

#### 5.9.17c OTP — Entrada de códigos (viewmode="otp")

Campo de introduccion de códigos de un solo uso (One-Time Password) con **cajas individuales por digito**, auto-avance al escribir, backspace inverso y soporte de paste. Aplica a `<prop type="T">` (alfanumerico) o `<prop type="N">` (solo numérico). El valor combinado de todas las cajas se persiste en el campo del prop como un **string concatenado sin separadores**.

```xml
<!-- OTP numerico de 6 digitos (SMS) -->
<prop name="CODIGO_VERIFICACION" type="N" visible="1"
      viewmode="otp"
      digits="6"
      box-size="44p"
      box-spacing="8p"
      box-color="#FFFFFF"
      box-color-focus="#E3F2FD"
      forecolor="#000000"
      auto-submit="true"
      title="Introduce el código" />

<!-- OTP alfanumerico de 4 caracteres con caracteres ocultos -->
<prop name="MAP_PIN" type="T" visible="1"
      viewmode="otp"
      digits="4"
      allow-letters="true"
      secret="true"
      auto-submit="true" />
```

**Atributos:**

| Atributo | Default | Descripción |
|----------|---------|-------------|
| `digits` | `6` | Número de cajas (debe ser positivo). Cada caja contiene un único carácter |
| `secret` | `false` | Si `true`, muestra los caracteres ocultos (modo password). Útil para PINs |
| `auto-submit` | `true` | Si `true`, al rellenar la última caja se oculta el teclado automáticamente |
| `allow-letters` | `false` | Si `true`, acepta letras además de digitos. Si `false`, solo digitos numéricos |
| `box-size` | `44p` | Tamaño (ancho y alto) de cada caja |
| `box-spacing` | `8p` | Separación horizontal entre cajas |
| `box-color` | — | Color de fondo de las cajas en estado normal |
| `box-color-focus` | usa `box-color` | Color de fondo de la caja con foco |
| `forecolor` | — | Color del texto dentro de las cajas |
| `disableedit` | `false` | Formula o literal; si evalua a `true`, el control queda en solo lectura |

**Comportamiento:**

- **Auto-avance:** al escribir un carácter, el foco salta automáticamente a la caja siguiente.
- **Backspace inverso:** al pulsar borrar sobre una caja **vacia**, el foco retrocede a la anterior y la borra. Funciona incluso con teclados virtuales que no envian `KEYCODE_DEL` cuando no hay texto que borrar.
- **Paste distribuido:** si se pega texto, los caracteres se reparten entre las cajas siguientes (filtrando los no permitidos según `allow-letters`). El foco queda en la última caja rellenada.
- **Filtro de caracteres:** los no permitidos (letras cuando `allow-letters="false"`, símbolos, etc.) se descartan sin escribirse.
- **Auto-submit:** al rellenar la última caja, el teclado se oculta. El framework re-evalua los triggers del campo (por ejemplo, un `<onchange>` que llame al servidor).

**API JavaScript:**

| Método | Efecto |
|--------|--------|
| `control.getOtpValue()` | Devuelve el valor combinado de todas las cajas como string |
| `control.clearOtp()` | Limpia todas las cajas y pone el foco en la primera |
| `control.focusOtp()` | Pone el foco en la primera caja vacia. Si todas están llenas, enfoca la última |

```javascript
// Validar el OTP desde el onchange del prop
function onOtpChange() {
    var sCode = getControl("CODIGO_VERIFICACION").getOtpValue();
    if (sCode.length !== 6) {
        return;
    }
    if (sCode === self.CODIGO_ESPERADO) {
        ui.showToast("Código correcto");
        ui.openEditView("PantallaPrincipal");
    } else {
        ui.showToast("Código incorrecto");
        getControl("CODIGO_VERIFICACION").clearOtp();
    }
}
```

**Casos de uso típicos:** verificación SMS, 2FA con apps de autenticación, PIN de aplicación (con `secret="true"`), códigos de invitacion / cupones (con `allow-letters="true"`).

**Notas:**

- El valor en el `dataObject` se persiste como **string concatenado sin separadores** (ej. `"123456"` para 6 digitos).
- Si el campo tenía un valor previo, las cajas se rellenan al cargar mostrando carácter a carácter.
- El `title` del prop se sigue mostrando como label encima de las cajas.
- Para validar el código sin esperar a `auto-submit`, usar `<onchange>` y comprobar `getOtpValue().length === digits`.

#### 5.9.17d Texto Markdown (viewmode="markdown")

Renderiza el contenido del campo como **Markdown formateado** en lugar de texto plano. Aplica a `<prop type="T">` (texto editable / readonly). El framework parsea el valor del campo cada vez que se refresca la vista y aplica el formato visual (negritas, cabeceras, listas, etc.).

Soporta el dialecto **CommonMark base** (sin extensiones): cabeceras, enfasis, listas, enlaces, imágenes, blockquotes, código inline / en bloque y reglas horizontales. **No soportado por defecto:** tablas, strikethrough (`~~tachado~~`), task lists (`- [x]`), HTML embebido, syntax highlighting.

```xml
<!-- Campo readonly con contenido Markdown -->
<prop name="MAP_DESCRIPCION" type="T" visible="1"
      viewmode="markdown"
      readonly="true"
      width="100%" />

<!-- Campo de texto editable con render Markdown -->
<prop name="NOTAS" type="T" visible="1"
      viewmode="markdown"
      width="100%" height="200p" />
```

Asignacion desde JavaScript:

```javascript
self.MAP_DESCRIPCION =
    "## Bienvenido\n\n" +
    "Este es un texto **importante** con _enfasis_ y un [enlace](https://xone.es).\n\n" +
    "### Pasos:\n" +
    "1. Iniciar sesion\n" +
    "2. Seleccionar proyecto\n" +
    "3. Confirmar\n\n" +
    "> Nota: revisa tus credenciales antes de continuar.";
```

**Atributos:** el viewmode `markdown` **no introduce atributos propios**. Aplican los atributos comunes de `type="T"` (`fontsize`, `forecolor`, `align`, `width`, `height`, margenes, etc.).

**Sintaxis Markdown soportada (CommonMark base):**

| Elemento | Sintaxis |
|----------|----------|
| Cabeceras | `# H1`, `## H2` ... `###### H6` |
| Negrita | `**texto**` o `__texto__` |
| Cursiva | `*texto*` o `_texto_` |
| Negrita + cursiva | `***texto***` |
| Listas no ordenadas | `-`, `*` o `+` al inicio de linea |
| Listas ordenadas | `1.`, `2.`, `3.` ... |
| Enlaces | `[texto](url)` |
| Imágenes | `![alt](url)` |
| Blockquotes | `> texto` |
| Código inline | `` `código` `` |
| Bloques de código | Tres backticks abriendo y cerrando |
| Salto de linea | Doble espacio al final o linea en blanco |
| Regla horizontal | `---`, `***` o `___` |

**Comportamiento:**

- **Refresco:** cada vez que la vista se refresca desde el `dataObject` (carga, `Refresh`, `refreshValue`, asignacion desde JS), el contenido se reparsea y se vuelve a renderizar.
- **Edición:** mientras el usuario edita el campo, las plantillas Android muestran el texto en su forma cruda (markdown sin renderizar); al perder el foco y refrescar, vuelve al estado renderizado. Si el campo debe ser decorativo, usar `readonly="true"` o `locked="true"` para evitar el modo edición accidental.
- **Encoding de saltos de linea:** los saltos en el string Markdown deben ser `\n` reales (no `<br>` ni `\\n` escapado). En XML, usar `&#10;` si el valor esta embebido como atributo.
- **Imágenes:** los URLs deben ser accesibles desde el dispositivo (HTTP/HTTPS o ruta local). Carga sincrona por defecto.

**Casos de uso típicos:** mensajes formateados (instrucciones, avisos, FAQ), descripciones de productos servidas desde backend en Markdown, plantillas dinámicas, cabeceras ricas en pantallas de detalle, renderizado de respuestas de IA / chatbots.

**Notas:**

- Si el contenido viene de una API y puede contener sintaxis desconocida, los caracteres no reconocidos por el parser CommonMark se muestran tal cual (no rompen el render).
- El campo se persiste y se lee como **texto Markdown crudo** (no como HTML ni texto plano sin marcas). Solo cambia la presentación visual.
- Combinable con `autolink`: si Markdown no detecta un URL como link explicito (`[]()`), `autolink="url"` lo puede capturar; aunque normalmente la sintaxis Markdown estándar es suficiente.

#### 5.9.17e NavigationBar pill animada (viewmode="navbar")

Barra de navegación estilo **Material 3** con un indicador **"pill" deslizante** que marca el destino activo. Aplica a `<prop type="N">`: el valor numérico del campo es el **índice del destino seleccionado** (0..N−1). Al tocar un destino se escribe su índice en el campo (dispara el `<onchange>` del prop) y la pill se desliza animadamente hasta él; si el valor cambia por código y se refresca la vista, la pill también se desliza sola.

Los destinos se declaran **inline** en el propio `<prop>` (no desde un `<contents>`): títulos e iconos separados por el carácter barra vertical (`|`).

```xml
<!-- Barra de 3 destinos con icono y texto -->
<prop name="SECCION" type="N" visible="1"
      viewmode="navbar"
      nav-titles="Inicio|Buscar|Perfil"
      nav-icons="ic_home.png|ic_search.png|ic_user.png"
      pill-color="#6750A4"
      pill-text-color="#FFFFFF"
      nav-text-color="#49454F"
      bgcolor="#FEF7FF"
      width="100%" height="80p" />

<!-- Solo texto, con la etiqueta visible únicamente en el destino activo -->
<prop name="PASO" type="N" visible="1"
      viewmode="navbar"
      nav-titles="Datos|Pago|Resumen"
      label-visibility="selected"
      animation-duration="350" />
```

**Atributos:**

| Atributo | Default | Descripción |
|----------|---------|-------------|
| `nav-titles` | — | Títulos de los destinos separados por barra vertical. Determina el número de destinos |
| `nav-icons` | — | Iconos (nombre de recurso, igual que los `img` de un botón) separados por barra vertical, emparejados por posición con los títulos. Conviene que sean monocromos: se tiñen con el color activo / inactivo |
| `pill-color` | `#E8DEF8` | Color de la pill deslizante |
| `pill-text-color` (o `forecolor`) | `#1D192B` | Color de icono + texto del destino activo |
| `nav-text-color` | `#49454F` | Color de icono + texto de los destinos inactivos |
| `bar-color` / `bgcolor` | transparente | Color de fondo de la barra |
| `label-visibility` | `always` | `always` (siempre), `selected` (solo el activo) o `never` (sin etiquetas) |
| `animation-duration` | `300` | Duración del deslizamiento en milisegundos |
| `pill-corner-radius` | mitad de la altura | Radio de las esquinas de la pill (totalmente redondeada si se omite) |
| `nav-icon-size` | `24` | Tamaño del icono en dp |
| `disableedit` / `locked` | `false` | Fórmula o literal; si evalúa a `true`, la barra deja de ser tocable y no muestra efecto al pulsar (queda como indicador) |

**Comportamiento:**

- **Valor = índice:** `0` selecciona el primer destino, `1` el segundo, etc.
- **Toque:** escribe el índice en el campo y desliza la pill; dispara el `<onchange>` del prop.
- **Cambio por código:** asignar el campo y refrescar la vista desliza la pill al nuevo destino.
- **Guarda de rango:** un valor negativo se ajusta a `0` y uno mayor que el último destino al máximo; si el valor guardado estaba fuera de rango, se corrige también en el campo (sin disparar `onchange` en datos válidos).
- **`disableedit` / `locked`:** la barra ignora los toques y no muestra efecto al pulsar, pero sigue animando ante cambios de valor por código (indicador puro).

**API JavaScript:**

| Método | Efecto |
|--------|--------|
| `control.getValue()` | Devuelve el índice del destino seleccionado |
| `control.setValue(n)` | Selecciona el destino `n` (se ajusta al rango), anima y persiste el valor |
| `control.getItemCount()` | Número de destinos |

```javascript
// Reaccionar al cambio de seccion desde el onchange del prop SECCION
function onSeccionChange() {
    var idx = self.SECCION;          // indice del destino activo
    if (idx === 0) { /* mostrar inicio */ }
    else if (idx === 1) { /* mostrar busqueda */ }
    else { /* mostrar perfil */ }
}

// Mover la barra por codigo (la pill se desliza al refrescar)
function irAPerfil() {
    var ctrl = getControl("SECCION");
    ctrl.setValue(2);
}
```

**Casos de uso típicos:** barra de navegación inferior entre secciones de la app, indicador de paso en asistentes (wizard), conmutador de pestañas con feedback animado.

**Notas:**

- El campo se persiste como **entero** (el índice del destino).
- Los iconos deben existir en los recursos del proyecto (misma resolución que los `img` de botón).
- Si solo se indican `nav-icons` sin `nav-titles` (o al revés), los destinos se muestran solo con icono o solo con texto.
- Por defecto la barra ocupa todo el ancho disponible; ajusta `width` / `height` si necesitas otro tamaño.

#### 5.9.18 Password (X)

```xml
<prop name="MAP_PASSWORD" type="X" visible="1"
      floating-tooltip="true"
      tooltip="Contraseña"
      show-password-visibility-toggle="true"
      text-border-bottom="true" />
```

| Atributo | Descripción |
|----------|-------------|
| `show-password-visibility-toggle` | Muestra botón para ver/ocultar la contrasena |

#### 5.9.19 Selector con lookup (`type="T"` + `mapcol`/`mapfld`)

> **No existe un `type="A"` (autocomplete) propio en XOne.** Los selectores con autocompletado/lookup se implementan con `type="T"` (o `type="N"`) y los atributos `mapcol`/`mapfld`/`linkedfield`. Es la misma mecanica que el combo de §5.9.13.

```xml
<prop name="CIUDAD" type="T" visible="1"
      title="Ciudad"
      mapcol="Ciudades"
      mapfld="ID"
      linkedfield="NOMBRE" />
```

#### 5.9.20 Adjunto (AT)

```xml
<prop name="MAP_ADJUNTO" type="AT" visible="1"
      title="Adjuntar archivo"
      img-width="48p" img-height="48p" />
```

#### 5.9.21 THTML (Texto HTML enriquecido)

Muestra contenido HTML formateado directamente en el prop. Útil para mostrar textos con negrita, colores, enlaces, etc.

```xml
<prop name="MAP_TEXTO_RICH" type="THTML" visible="1"
      locked="true"
      width="100%" height="-2"
      labelwidth="0" />
```

```javascript
// Asignar contenido HTML por código
self.MAP_TEXTO_RICH = "<b>Importante:</b> El plazo vence el <span style='color:red'>31/12</span>";
```

#### 5.9.22 DR — Firma / Dibujo moderno

El tipo `DR` es el modo moderno para capturar firmas y dibujos a mano alzada. Sustituye al método antiguo (`type="IMG"` con `readonly="false"`).

```xml
<prop name="FIRMA" type="DR" visible="1"
      width="90%"
      height="300p"
      labelwidth="0" />
```

> **Nota:** El tipo `DR` guarda la firma como imagen en la BD (campo `Varchar(100)` con ruta al fichero).

#### 5.9.23 Enlace a coleccion (mapcol / mapfld)

Para crear un desplegable vinculado a una coleccion de la BD se usan dos props: uno oculto que almacena la clave foranea, y uno visible que muestra la descripción.

```xml
<!-- Prop oculto: almacena el ID del cliente seleccionado -->
<prop name="IDCLIENTE" type="N" visible="0"
      mapcol="Clientes"
      mapfld="ID" />

<!-- Prop visible: muestra el nombre del cliente -->
<prop name="MAP_NOMBRE_CLIENTE" type="T" visible="1"
      title="Cliente"
      linkedto="IDCLIENTE"
      linkedfield="NOMBRE"
      showinline="true" />
```

| Atributo | Donde va | Descripción |
|----------|----------|-------------|
| `mapcol` | Prop oculto | Nombre de la coleccion de donde se obtienen las opciones |
| `mapfld` | Prop oculto | Campo clave de esa coleccion (normalmente `ID`) |
| `filter` | Prop oculto | Filtro opcional para las opciones del combo |
| `linkedto` | Prop visible | Nombre del prop oculto al que esta vinculado |
| `linkedfield` | Prop visible | Campo de la coleccion a mostrar como texto |
| `showinline` | Prop visible | `true` abre las opciones en un panel de selección inferior (con `showinline-keyboard="true"` incluye buscador); `false` abre un diálogo |

#### 5.9.24 Busqueda contextual (contextual-search)

Permite filtrar un contents en tiempo real mientras el usuario escribe en un campo de texto.

```xml
<!-- Campo de busqueda -->
<prop name="MAP_BUSCAR" type="T" visible="1"
      tooltip="Escriba para buscar..."
      contextual-search="true"
      contextual-target="MAP_LISTADO"
      contextual-filter="NOMBRE LIKE '%##VAL##%' OR CODIGO LIKE '%##VAL##%'"
      labelwidth="0" width="100%" height="100p" />

<!-- Contents que se filtra automaticamente -->
<prop name="MAP_LISTADO" type="Z" visible="1"
      contents="@ListadoClientes"
      width="100%" height="600p" />
<contents name="@ListadoClientes" src="Clientes" />
```

| Atributo | Descripción |
|----------|-------------|
| `contextual-search` | `"true"` activa la busqueda contextual |
| `contextual-target` | Nombre del prop `type="Z"` que se va a filtrar |
| `contextual-filter` | Clausula WHERE que se aplica al contents. `##VAL##` se sustituye por el texto introducido |

#### 5.9.25 onchange y refresco

El atributo `onchange` indica que debe ocurrir cuando el valor del campo cambia. En proyectos modernos (Android/iOS) basta con `onchange="refresh"` para refrescar toda la pantalla.

```xml
<!-- Refresco simple al cambiar -->
<prop name="ESTADO" type="N" visible="1"
      onchange="refresh" />

<!-- Refresco de un prop específico -->
<prop name="FECHA" type="D" visible="1"
      onchange="refresh(MAP_DIAS_RESTANTES)" />

<!-- Ejecutar un nodo custom al cambiar -->
<prop name="TIPO" type="T" visible="1"
      onchange="ExecuteNode(calcularTotal)" />
```

> **Nota historica:** En versiones antiguas (PDA/PocketPC) se usaban valores numéricos como `onchange="refresh255"` (bitmask que indicaba que partes refrescar). En proyectos modernos siempre usar `onchange="refresh"`.

**`onvaluechanged`** — evento para **lógica de datos**. Su valor es **JavaScript inline normal** (como `onclick`) y se dispara desde la capa de datos, por lo que se ejecuta siempre que el campo cambie de valor **aunque no haya pantalla abierta** (cambios por script de fondo, réplica, etc.). Recibe un objeto `e` con `e.value`, `e.oldValue`, `e.target` (campo), `e.objItem` (objeto) y `e.data`. Solo JavaScript.

```xml
<prop name="CANTIDAD" type="N" visible="1"
      onvaluechanged="self.TOTAL = e.value * self.PRECIO;" />
```

> Útil para lógica que debe ejecutarse siempre que el dato cambie, haya o no pantalla abierta. Detalle completo en topics/05-events-patterns-faq.md §3.2.

#### 5.9.26 Propagacion de cambios (updates) y formula

**`updates`** — propaga el valor de este campo hacia un campo de una coleccion contents cuando cambia:

```xml
<!-- Al cambiar MAP_ARTICULO, su valor se copia al campo DESCRIPCION del objeto padre -->
<prop name="MAP_ARTICULO" type="T" visible="7"
      linkedto="IDARTICULO"
      linkedfield="ETIQUETA"
      updates="DESCRIPCION" />
```

**`formula`** — calcula el valor del prop mediante una consulta SQL externa:

```xml
<!-- El valor se calcula con una SQL definida en <ext-formula> -->
<prop name="MAP_TOTAL_PEDIDOS" type="N"
      formula="ext.[TOTAL_PEDIDOS]"
      onchange="refresh"
      visible="3" />

<!-- Definición de la formula en el nodo coll -->
<ext-formula>
    <param name="TOTAL_PEDIDOS"
           sql="SELECT COUNT(*) AS N FROM ##PREF##Pedidos WHERE IDCLIENTE=##ID##"
           field="N" type="N" cache="true" />
</ext-formula>
```

| Atributo | Descripción |
|----------|-------------|
| `formula` | Referencia a una formula definida en `<ext-formula>`. Formato: `ext.[NOMBRE_FORMULA]` |
| `cache` | En `<ext-formula>`: `true` cachea el resultado para no recalcular en cada refresco |

