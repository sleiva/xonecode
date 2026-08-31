# XOne XML — Props por tipo: texto, número, label, botón, fecha, imagen

> Fuente: `xone/v2/xone-help-docs/topics/02b-xml-prop-tipos.md` §5.9.1–§5.9.10. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §5.9.1 texto T · §5.9.2 label L/TL · §5.9.3 numérico N y TN · §5.9.4 botón B · §5.9.5 checkbox NC · §5.9.6 fecha y hora D/DT/TT · §5.9.8 imagen IMG · §5.9.9 foto PH · §5.9.10 vídeo VD y escáner QR

---

#### 5.9.1 Texto (T)

Campo de texto editable. El control más básico de XOne.

```xml
<!-- Texto simple -->
<prop name="NOMBRE" type="T" visible="7"
      title="Nombre Completo"
      size="100" width="100%"
      tooltip="Ingrese su nombre" />

<!-- Texto multilinea -->
<prop name="MAP_TEXTAREA" type="T" visible="1"
      title="Descripción"
      class="classTMultiline"
      lines="5" fixed-lines="true" />

<!-- Texto con tooltip flotante -->
<prop name="MAP_USUARIO" type="T" visible="1"
      floating-tooltip="true"
      tooltip="Usuario"
      tmargin="94p"
      class="xnTextoEditable" />

<!-- Texto con teclado personalizado -->
<prop name="MAP_TEXT" type="T" visible="1"
      title="Texto"
      fixed-lines="true"
      keyboard-bar="false"
      show-keyboard="false" />

<!-- Texto con evento de cambio en tiempo real -->
<prop name="MAP_BUSCAR" type="T" visible="1"
      ontextchanged="javascript:buscarTexto(e);"
      labelwidth="0"
      tooltip="Texto a buscar" />
```

**Atributos especificos de T**:

| Atributo | Descripción |
|----------|-------------|
| `size` | Tamaño de la columna en BD. Con `fixed-text="true"` también limita la entrada en UI |
| `lines` | Número de lineas visibles |
| `fixed-lines` | Si es `true`, el campo no crece en altura |
| `fixed-text` | Si es `true`, el texto no se puede editar |
| `keyboard-bar` | Muestra/oculta la barra sobre el teclado |
| `show-keyboard` | Muestra/oculta el teclado al entrar al campo |
| `ontextchanged` | Evento que se dispara con cada carácter escrito |

#### 5.9.2 Label (L / TL)

Texto de solo lectura. Ideal para títulos, etiquetas y textos informativos.

```xml
<!-- Label como título -->
<prop name="lblTitulo" type="L" visible="7"
      title="Bienvenido de nuevo"
      fontbold="true" fontsize="18"
      forecolor="#212121" />

<!-- Label como subtitulo -->
<prop name="lblSubtitulo" type="L" visible="7"
      title="Inicia sesion para continuar"
      fontsize="14" forecolor="#9E9E9E" />

<!-- Label como separador con fondo -->
<prop name="MAP_SPACE" type="L" visible="7"
      width="100%" height="3p"
      bgcolor="#cccccc" title=" " />
```

> **No pongas `labelwidth="0"` en un label.** En un `L`/`TL` el texto es el propio `title`, que se pinta dentro del ancho reservado para la etiqueta; con `labelwidth="0"` no hay sitio y el texto desaparece (queda un control vacío). Deja `labelwidth` por defecto y, si necesitas centrar o alinear el texto, usa `label-align="left|center|right"`. El `labelwidth="0"` solo es correcto en campos cuyo contenido va en el *valor* (`T`, `N`…) o que no tienen texto (`IMG`, botón de icono).

#### 5.9.3 Numérico (N, N2..N6, TN, TN2..TN6)

```xml
<!-- Número entero -->
<prop name="CANTIDAD" type="N" visible="7"
      title="Cantidad" input-type="numeric" />

<!-- Precio con 2 decimales -->
<prop name="PRECIO" type="N2" visible="7"
      title="Precio" width="50%" align="right" />

<!-- Coordenada con 6 decimales -->
<prop name="LATITUD" type="N6" visible="1"
      title="Latitud" locked="true" />

<!-- Teléfono (número con enlace telefonico) -->
<prop name="MAP_TELEFONO" type="N" visible="1"
      title="Teléfono" phone="true" />
```

#### 5.9.4 Botón (B)

Los botones son uno de los elementos más usados. Pueden ejecutar acciones de dos formas: `method` (invoca un nodo) u `onclick` (ejecuta JavaScript directo).

> **CRÍTICO: `onclick` SIEMPRE es JavaScript inline, NO el nombre de un nodo.** Es un error común poner `onclick="nombreNodo"` (sin paréntesis) esperando que XOne invoque el nodo `<nombreNodo>`. XOne lo evalúa como variable JS global, queda `undefined`, y **el botón no hace nada silenciosamente** (no falla, no logea). Formas válidas de `onclick`:
>
> - `onclick="ui.openEditView('X');"` — JS inline simple
> - `onclick="appData.getCollection('X').setMacro('##F##',''); ui.openEditView('X');"` — JS inline multi-sentencia (escapar `<`, `>`, `&` con entidades XML)
> - `onclick="miFuncion();"` — llamada a función global declarada en `functions.js` (con paréntesis)
> - `onclick="self.executeNode('miNodo');"` — invocar un nodo handler XML explícitamente
> - `onclick="refresh"` o `onclick="refresh(MAP_CAMPO)"` — comandos internos especiales del framework
>
> Para invocar un nodo XML, el atributo idiomático es **`method="executenode(nombreNodo)"`**, no `onclick`.

```xml
<!-- Botón con method (invoca nodo XML) -->
<prop name="BTN_GUARDAR" type="B" visible="1"
      title="Guardar"
      method="executenode(guardar)"
      class="btnPrimario"
      img="icon_save.png" />

<!-- Botón con onclick (JavaScript directo) -->
<prop name="BTN_BUSCAR" type="B" visible="1"
      title="Buscar"
      onclick="buscarDatos();"
      width="100%" height="80p" />

<!-- Botón con method y parametros -->
<prop name="BTN_IR" type="B" visible="1"
      method="ExecuteNode(irGrupo(2))" />

<!-- Botón con imagen y sin texto (solo icono) -->
<prop name="BTN_VOLVER" type="B" visible="1"
      img="icon_back.png"
      labelwidth="0"
      width="48p" height="48p" />

<!-- Botón con imagen seleccionada (estado pressed) -->
<prop name="BTN_ADD" type="B" visible="1"
      img="add.png"
      imgsel="add_click.png"
      labelwidth="0" width="75p" />

<!-- Botón con imagen deshabilitada -->
<prop name="BEdit" type="B" visible="1"
      img="editar.png"
      img-disabled="editarlocked.png"
      disableedit="MAP_IDSELECTED=0"
      method="ExecuteNode(editar)" />

<!-- Botón con ripple effect y colores -->
<prop name="BTN_ACCION" type="B" visible="1"
      title="Acción"
      bgcolor="#1565C0"
      forecolor="#FFFFFF"
      border-corner-radius="28"
      ripple-effect="true" />

<!-- Botón con postonchange (ejecuta algo al volver) -->
<prop name="BNew" type="B" visible="1"
      img="nuevo.png"
      method="ExecuteNode(nuevo)"
      postonchange="refresh" />

<!-- Botón de texto plano (TextButton Material): SIN caja ni borde -->
<prop name="BTN_SALTAR" type="B" visible="1"
      title="saltar"
      bgcolor="#F4EFFB"        <!-- = color de fondo de la pantalla -->
      forecolor="#7C3AED"
      border-width="0"
      onclick="omitir();" />
```

> **Botón de solo texto (sin caja).** Para emular un `TextButton` de Material (solo texto/icono, sin fondo ni borde — p. ej. "saltar", "atrás", "cancelar"), pon **`border-width="0"`** y un `bgcolor` igual al color de fondo de la pantalla. El botón se funde con el fondo y solo queda visible el texto, conservando toda su área de toque. No hace falta envolverlo en un `<frame>` ni usar un `type="L"`.

**Atributos especificos de B**:

| Atributo | Descripción |
|----------|-------------|
| `method` | Método a ejecutar. Formato: `executenode(nombreNodo)` o `ExecuteNode(nodo(param))` |
| `onclick` | Código JavaScript a ejecutar directamente |
| `img` | Imagen del botón (ruta relativa a `icons/`) |
| `imgsel` | Imagen en estado pulsado |
| `img-disabled` | Imagen cuando el botón esta deshabilitado |
| `caption` | Texto alternativo (similar a `title`) |
| `ripple-effect` | Efecto de onda al pulsar (Material Design) |
| `postonchange` | Acción a ejecutar al volver de la vista invocada |
| `labelwidth` | Si es `0`, no muestra etiqueta (botón solo icono) |

#### 5.9.5 Checkbox (NC)

```xml
<!-- Checkbox básico -->
<prop name="MAP_CHECK" type="NC" visible="1"
      title="Acepto los terminos" />

<!-- Toggle / Switch -->
<prop name="MAP_TOGGLE" type="NC" visible="1"
      check-type="toggle"
      track-color="#FF0000"
      thumb-color="#00FF00" />

<!-- Radio button con grupo -->
<prop name="MAP_RADIO1" type="NC" visible="1"
      check-type="radio"
      radio-group="1"
      title="Opción A" />
<prop name="MAP_RADIO2" type="NC" visible="1"
      check-type="radio"
      radio-group="1"
      title="Opción B" />

<!-- Switch con colores dinamicos -->
<prop name="MAP_CHECK_COLOR" type="NC" visible="1"
      check-color-checked="##FLD_MAP_COLOR##"
      bgcolor="##FLD_MAP_COLOR##" />
```

| Atributo | Descripción |
|----------|-------------|
| `check-type` | Tipo: `toggle`, `radio`, `switch` |
| `radio-group` | ID del grupo de radio buttons |
| `allow-radio-group-uncheck` | Permite deseleccionar un radio |
| `track-color` | Color de la pista (toggle/switch) |
| `thumb-color` | Color del circulo (toggle/switch) |
| `check-color-checked` | Color cuando esta marcado |

#### 5.9.6 Tipos de fecha y hora: D, DT, TT

XOne tiene tres tipos de prop para mostrar y editar fechas/horas:

| Tipo | Formato | Pickers asociados | Notas |
|------|---------|-------------------|-------|
| `D`  | Fecha tradicional `DD/MM/AAAA` | DatePicker (icono de calendario) | Más común |
| `DT` | Fecha + hora `DD/MM/AAAA HH:MM` | DatePicker + TimePicker (calendario + reloj) | Para timestamps con hora |
| `TT` | Solo hora `HH:MM` | TimePicker (icono de reloj) | **Siempre asociar `mask="Hh#:#Mm"`** o el campo no se ve |

> **Selector por defecto (nuevo diseño).** Por defecto, al pulsar un campo `D`/`DT`/`TT` se abre un selector moderno: el de fecha es un calendario con **deslizamiento lateral entre meses** (además de los botones `‹ ›`) y el de hora son **ruedas** de hora y minuto. Para volver al selector nativo del sistema, fijar `date-mode`/`time-mode` a `0`. El selector admite `bgcolor-dialog`, `forecolor-dialog` (color de acento) y `fontsize-dialog`.

**Ejemplos:**

```xml
<!-- type=D: fecha tradicional -->
<prop name="FECHA" type="D" visible="1" title="FECHA"
      labelwidth="6" fieldsize="7" onchange="Refresh255" />

<!-- type=DT: fecha + hora con icono custom y formato controlado -->
<prop name="MAP_TYPEDT" type="DT" title="Fecha y hora"
      date-format="dd/MM/yyyy"
      time-format="HH:mm"
      locale="esES"
      time-interval="2"
      img-date="logo.png"
      width="100%" height="10%"
      img-date-width="96p"  img-date-height="96p"
      img-time-width="96p"  img-time-height="96p" />

<!-- type=TT: solo hora — la mask es OBLIGATORIA -->
<prop name="MAP_TYPETT" type="TT" title="Hora"
      mask="Hh#:#Mm"
      time-interval="2"
      width="100%"
      img-time-width="96p" img-time-height="96p" />
```

**Atributos relacionados (D / DT / TT):**

| Atributo | Descripción |
|----------|-------------|
| `title` | Texto/etiqueta visible de la propiedad en edición |
| `date-format` | Formato de visualizacion de la fecha (ej. `dd/MM/yyyy`). Modifica el formato por defecto |
| `time-format` | Formato de visualizacion de la hora (ej. `HH:mm`). Solo en DT/TT |
| `mask` | Mascara de entrada. **Obligatoria en TT**: `mask="Hh#:#Mm"` |
| `locale` | Locale para nombres de mes/día (ej. `esES`, `enUS`) |
| `time-interval` | Intervalo de minutos en el TimePicker (ej. `2` = saltos de 2 minutos) |
| `date-mode` | Estilo del selector de fecha. Ausente o `4` = nuevo diseño moderno (calendario con swipe lateral de meses); `0`–`3` = selectores nativos del sistema (0 dispositivo, 1 oscuro, 2 claro, 3 oscuro) |
| `time-mode` | Estilo del selector de hora. Ausente o `4` = nuevo diseño moderno (ruedas de hora/minuto); `0`–`3` = selectores nativos del sistema |
| `bgcolor-dialog` | Color de fondo del selector (nuevo diseño) |
| `forecolor-dialog` | Color de acento del selector (día/hora seleccionados, botones) |
| `fontsize-dialog` | Tamaño de los números del selector |
| `img-date` | Imagen para el icono del DatePicker |
| `img-date-width` / `img-date-height` | Tamaño del icono del calendario |
| `img-time-width` / `img-time-height` | Tamaño del icono del reloj |
| `ios-datepicker-mode` | Modo del selector en iOS: `inline`, `wheels`, `compact` |
| `bgcolor` / `forecolor` | Colores de fondo y texto |
| `width` / `height` | Dimensiones |
| `lmargin` / `rmargin` / `tmargin` / `bmargin` | Margenes |
| `newline` | `true`/`false`. Forzar salto de linea |
| `fontsize` | Tamaño de fuente |
| `labelwidth` | Ancho de la etiqueta. `0` para que no aparezca |
| `locked` | Bloquear el campo según finalidad |

**Funciones JS asociadas (`ui.showDatePicker`, `ui.showTimePicker`):**

```javascript
// Inicializar valores en before-edit
function doBeforeEdit() {
    self.MAP_TYPEDT = new Date();
    self.MAP_TYPED  = "2023-07-14 00:00:00";
}

// Abrir DatePicker que escribe directamente en un prop
function showDatePicker() {
    ui.showDatePicker({
        targetProperty: "MAP_TYPED"
    });
}

// Abrir DatePicker con callback (sin targetProperty)
function showDatePickerCallback() {
    ui.showDatePicker({
        onDateSet: function(nYear, nMonth, nDay) {
            ui.showToast("Dia: " + nDay + " Mes: " + nMonth + " Anio: " + nYear);
        }
    });
}

// Abrir TimePicker — pre-rellena con la hora actual del prop
function showTimePicker() {
    var horaSpliteada = self.MAP_TYPETT.split(":");
    ui.showTimePicker({
        targetProperty: "MAP_TYPETT",
        initialHour:    horaSpliteada[0],
        initialMinute:  horaSpliteada[1],
        is24HoursMode:  true,
        title:          "Seleccione el tiempo"
        // theme: "holo_light"  // opcional
    });
}

// Obtener fecha/hora actual como string
function getCurrentDate() {
    ui.showToast(new Date().toUTCString());
}
```

> **Diseño del picker.** Sin `theme`, `ui.showDatePicker`/`ui.showTimePicker` usan el nuevo selector moderno (calendario con swipe lateral de meses / ruedas de hora). Pasar `theme` fuerza el selector nativo del sistema con ese tema; `ui.showTimePicker` con `is24HoursMode: false` también usa el nativo (el nuevo diseño es 24 h).

> **Tip:** En `type="DT"` y `type="TT"`, `time-interval` es útil para forzar saltos de N minutos (ej. citas de 15 en 15 min se haria con `time-interval="15"`).

> **Para temporizadores continuos / cronometros**, NO usar pickers. La API correcta es `control.startChronometer({fromDate, dateFormat})` y `control.stopChronometer()`. Ver tópico 03 sección `startChronometer / stopChronometer`.

#### 5.9.8 Imagen (IMG)

```xml
<!-- Imagen estática con ruta -->
<prop name="MAP_LOGO" type="IMG" visible="1"
      path="logo.png"
      width="100p" height="100p"
      keep-aspect-ratio="true" />

<!-- Imagen con ruta del sistema -->
<prop name="MAP_IMAGE" type="IMG" visible="1"
      path="##APP##\icons\xone.png"
      labelwidth="0"
      height="40%" lmargin="2%" />

<!-- Imagen como dato (valor almacenado en campo) -->
<prop name="FOTO" type="IMG" visible="1"
      width="100p" height="100p"
      keep-aspect-ratio="true"
      scale-type="center_crop"
      border-corner-radius="50" />

<!-- Imagen con error fallback -->
<prop name="AVATAR" type="IMG" visible="7"
      path="avatar_default.png"
      error-image="avatar_error.png"
      keep-aspect-ratio="true" />
```

| Atributo | Descripción |
|----------|-------------|
| `path` | Ruta de la imagen (relativa a `icons/` o con `##APP##`) |
| `keep-aspect-ratio` | Mantiene la proporcion de la imagen |
| `scale-type` | Tipo de escalado: `center_crop`, `fit_center`, `fit_xy` |
| `error-image` | Imagen a mostrar si la principal falla |
| `abort-on-error` | Si es `true`, no intenta cargar si hay error |

> **Formatos:** `path` (igual que los atributos `img`/`imgbk`) acepta **PNG, JPG y SVG indistintamente**. El SVG se renderiza de forma nativa y escala sin perder calidad — **no** envuelvas un SVG en un `type="WEB"` ni lo conviertas previamente; basta con apuntar `path="dibujo.svg"`. Además acepta **GIF animado** y **animaciones Lottie** (ver abajo), decidiendo por la extensión del fichero.

##### Animaciones Lottie en un `IMG`

Un `IMG` cuyo fichero sea `.json`, `.lottie` o `.tgs` se renderiza como animación Lottie (las exportadas de After Effects con Bodymovin, o las descargadas de LottieFiles) y **arranca sola en bucle infinito**, sin necesidad de llamar a nada:

```xml
<!-- Animación en bucle, ida y vuelta -->
<prop name="MAP_LOADER" type="IMG" visible="1"
      path="loader.json"
      labelwidth="0"
      width="120p" height="120p"
      repeat-mode="reverse" />

<!-- Animación con texto de párrafo recortado a su caja -->
<prop name="MAP_CARTEL" type="IMG" visible="1"
      path="cartel.lottie"
      labelwidth="0"
      width="100%" height="200p"
      clip-text-to-bounds="true" />
```

| Atributo | Descripción |
|----------|-------------|
| `repeat-mode` | `restart` (vuelve a empezar) o `reverse` (va y vuelve). Sin declararlo, se repite desde el inicio |
| `clip-text-to-bounds` | Solo para animaciones con texto de párrafo: recorta el texto a la caja definida en el diseño en vez de dejar que las líneas que no caben se salgan. Apagado por omisión, y con motivo: una línea que desborde la altura **no se dibuja en absoluto**, así que si la fuente no es la del diseño y el texto se reparte en más líneas, desaparece contenido |

**Formatos y qué lleva cada uno:**

| Extensión | Qué es |
|---|---|
| `.json` | La animación exportada, en texto plano. Las imágenes pueden ir embebidas en el propio fichero (base64) o aparte |
| `.lottie` | Paquete comprimido con la animación y sus imágenes dentro. Un `.json` renombrado a `.lottie` también se acepta |
| `.tgs` | Sticker de Telegram: un `.json` comprimido con gzip. Se reconoce y reproduce igual |

**Fuentes de la animación.** Si la animación lleva texto, la fuente se busca **solo** en la carpeta `fonts/` del proyecto, con el nombre de la familia que declara el propio fichero: si la animación pide `Roboto`, hace falta `fonts/Roboto.ttf` (o `.otf`). Si no está, el texto se pinta con la fuente por defecto del dispositivo, de modo que se ve pero con otras medidas — que es justo lo que puede descolocar el reparto de líneas. Nunca se toman fuentes del sistema por nombre, para que la animación se vea igual en todos los terminales.

**Imágenes de la animación.** Se resuelven de tres maneras, por este orden: embebidas en el propio fichero, dentro del `.lottie`, o como ficheros sueltos junto al fichero de animación, respetando la subcarpeta que declare el diseño (lo habitual es `images/`, de modo que un `loader.json` que pida `images/img_0.png` lo busca en `images/img_0.png` junto a él y, si no está, al lado del propio `loader.json`). Una imagen que no se encuentre deja su capa sin pintar: no rompe la animación ni la app.

> **Los atributos `img` e `imgbk` de cualquier control usan el mismo cargador**, así que también aceptan estas extensiones. Lo que solo existe en el `type="IMG"` es el control de la reproducción: los atributos de arriba y los métodos de animación desde JavaScript (`playAnimation`, `stopAnimation`, `setAnimationFrame`…, ver [métodos de los controles](../javascript/metodos-de-los-controles.md)).

#### 5.9.9 Foto (PH)

Captura de foto con la camara del dispositivo:

```xml
<!-- Capturar foto -->
<prop name="MAP_FOTO" type="PH" visible="1"
      title="Foto"
      height="40%"
      img-width="48p" img-height="48p"
      lmargin="2%" />

<!-- Ver foto (solo lectura) -->
<prop name="MAP_FOTOVER" type="PH" visible="1"
      locked="true"
      height="40%"
      title="Foto capturada" />

<!-- Foto en movimiento, con la cámara del propio framework -->
<prop name="MAP_FOTOMOV" type="PH" visible="1"
      title="Foto"
      height="40%"
      use-internal-camera="true"
      motion-photo="true" />
```

| Atributo | Descripción |
|----------|-------------|
| `use-internal-camera` | Captura con la cámara que trae el framework en vez de abrir la app de cámara del dispositivo. Da una pantalla de captura igual en todos los terminales (disparador, temporizador, flash, zoom, brillo y previsualización antes de aceptar) |
| `motion-photo` | Captura una **foto en movimiento**: un JPG que lleva embebido detrás un clip de vídeo corto con el instante del disparo. Para cualquier visor sigue siendo una foto normal, y las galerías que entienden el formato (Google Fotos) reproducen el movimiento al abrirla |
| `file-maxsize`, `file-maxwidth`, `file-maxheight`, `file-quality` | Límites de tamaño y calidad de la foto guardada |
| `analyze-exif-metadata` | Gira el fichero según la orientación con la que se hizo la foto, de modo que se vea derecho en cualquier visor |

##### Fotos en movimiento (`motion-photo`)

> **Úsalo junto a `use-internal-camera="true"`.** Así funciona en cualquier versión de Android, porque la captura y el montaje del fichero los hace el propio framework. Sin `use-internal-camera` se delega en la app de cámara del dispositivo, que solo puede atender la petición a partir de **Android 16** y únicamente si la implementa: a día de hoy no lo hace ninguna, ni siquiera la de los Pixel, con lo que se obtiene una foto normal sin más aviso.

Al capturar una foto en movimiento se **ignoran** `file-maxsize`, `file-maxwidth`, `file-maxheight` y `file-quality`: redimensionar o recomprimir la imagen se llevaría por delante el vídeo embebido. Si necesitas fotos ligeras, no uses `motion-photo`. El fichero resultante pesa lo que la foto más el clip, del orden de varios megas.

`analyze-exif-metadata="true"` sí es compatible: al girar la foto se conserva el vídeo.

#### 5.9.10 Video/Camara (VD) y escaner QR

```xml
<!-- Grabar video -->
<prop name="MAP_VIDEO" type="VD" visible="1"
      readonly="false"
      width="50%" height="40%"
      title="Video"
      onchange="refresh(MAP_VIDEO)" />

<!-- Reproducir video local -->
<prop name="MAP_VIDEOVER" type="VD" visible="1"
      readonly="true"
      width="50%" height="40%" />

<!-- Escaner QR -->
<prop name="SCANNER" type="VD" visible="1"
      viewmode="camerapreview"
      width="100%" height="300p"
      code-type="qr"
      oncodescanned="procesarCodigo(e);" />
```

| Atributo | Descripción |
|----------|-------------|
| `code-type` | Tipo de código a escanear: `qr`, `datamatrix`, `barcode` |
| `oncodescanned` | Evento al leer un código |
| `readonly` | Si es `true`, solo reproduce; si es `false`, captura |

