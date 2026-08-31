# XOne JavaScript — Métodos que expone cada control

> Fuente: `xone/v2/xone-help-docs/topics/03f-js-controles-metodos.md` §Cómo se accede a un control–§8. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: cómo se accede a un control · §1 campos de entrada y visualización · §2 controles numéricos con viewmode · §3 multimedia y especiales (webview, vídeo, cámara, dibujo, pdf) · §4 listas y contenidos type=Z · §5 mapas · §6 gráficas · §7 realidad aumentada · §8 frames

---

## Cómo se accede a un control

Un control se obtiene **por el nombre de su `<prop>`**, sobre la ventana de edición:

```javascript
let window = ui.getView(self);      // ventana del objeto actual (o ui.getView() = ventana activa)
let control = window["MAP_MI_PROP"];

// Equivalente, función global nativa (recomendada):
let control = getControl("MAP_MI_PROP");
// getControl(name, dataObject) → resuelve el control en la ventana de ese dataObject
```

Luego se invoca el método correspondiente:

```javascript
getControl("MAP_FOTO").setImage("logo.png");
getControl("MAP_LISTA").addItem(nuevoObjeto, 0);
```

**Reglas y notas:**

- El conjunto de métodos depende del **tipo de control** con el que se declaró la `<prop>` (`type`, `viewmode` o `classid`). Los tienes agrupados por control más abajo.
- **Casi todos** los controles exponen además `getWidthPixels()` y `getHeightPixels()` (tamaño real en píxeles). Para no repetirlos, **se omiten** en las tablas; asume que están salvo que se indique lo contrario.
- Para **refrescar** un control o su valor desde fuera, usa `ui.refresh(...)` / `ui.refreshValue(...)` o la ventana (`window.refresh(...)`), descrito en §3.3. Esta página documenta la API **propia** de cada control.
- Convención de firmas en este documento: `[parametro]` = parámetro **opcional**; `...lista` = admite varios.

---

## 1. Campos de entrada y visualización

### Texto / número / contraseña (`type="T"`, `"N"`, `"X"`, `"TN"`, `"THTML"`…)

| Método | Qué hace |
|---|---|
| `setText(texto)` | Fija el texto del campo. |
| `getText()` | Devuelve el texto actual (cadena vacía si no hay vista). |
| `setHint(texto)` | Fija el hint/placeholder. |
| `setTextForecolor(color)` | Color del texto (string `"#RRGGBB"` o número). |
| `setBackgroundColor(color)` | Color de fondo (string parseable por color). |
| `setBorder(obj)` | Aplica borde desde un objeto: `{color, colorFocus, width, cornerRadius, textBorder, textBorderTop/Bottom/Left/Right}`. |
| `setInputType(tipo)` | Cambia el tipo de entrada (admite `"password"`). |
| `getInputType()` | Devuelve el tipo de entrada (`"password"` si lo es). |
| `setAutocompleteSuggestions(...sugerencias)` | Refresca la lista de sugerencias de autocompletado. |
| `requestFocus()` | Pide el foco para el campo (devuelve si lo obtuvo). |
| `startChronometer([obj])` | Arranca un cronómetro sobre el campo. `obj`: `{fromDate, toDate, dateFormat (def. "mm:ss"), reverse}`. |
| `stopChronometer()` | Detiene el cronómetro. |
| `pauseChronometer()` / `resumeChronometer()` | Pausa / reanuda el cronómetro. |

### Edición vinculada inline y adjunto (`linked-to`+`linked-field` con `showinline="true"`; `type="AT"`)

Subconjunto del campo de texto:

| Método | Qué hace |
|---|---|
| `setText(texto)` | Fija el texto. |
| `setTextForecolor(color)` | Color del texto. |
| `setHint(texto)` | Placeholder. |
| `setInputType(tipo)` / `getInputType()` | Cambia / devuelve el tipo de entrada. |

### Selector de colección (`linked-to`+`linked-field`, sin inline) y spinner (`viewmode="spinner"`)

Solo exponen `getWidthPixels()` / `getHeightPixels()`. Se gobiernan por su valor y eventos.

### Etiqueta (`type="L"` / `"TL"`)

Solo `getWidthPixels()` / `getHeightPixels()`.

### Botón (`type="B"`)

Todos devuelven el propio botón (encadenables):

| Método | Qué hace |
|---|---|
| `click()` | Dispara el click del botón por código. |
| `setText(texto)` | Fija el texto del botón. |
| `setTextForecolor(color)` | Color del texto (string o número). |
| `setButtonEnabled(bool)` | Habilita/deshabilita el botón. |
| `setBadge(obj)` | Muestra/configura un badge: `{visible, value, align, textColor, backgroundColor, maxCharacters}`. |

### Checkbox (`type="NC"`)

| Método | Qué hace |
|---|---|
| `setChecked(bool)` | Marca/desmarca el control. |
| `setText(texto)` | Fija la etiqueta. |
| `setTextForecolor(color)` | Color de la etiqueta. |

### Fecha / hora (`type="D"`, `"DT"`, `"TT"`)

| Método | Qué hace |
|---|---|
| `startChronometer([obj])` | Cronómetro. `obj`: `{fromDate, toDate, dateFormat, reverse}`. |
| `stopChronometer()` / `pauseChronometer()` / `resumeChronometer()` | Control del cronómetro. |

### Imagen (`type="IMG"`)

**Imagen normal** (solo lectura, sin zoom):

| Método | Qué hace |
|---|---|
| `setImage(ruta)` | Carga y muestra una imagen (busca en los directorios de la app). |
| `clearImage()` | Limpia la imagen/fondo. |
| `playAnimation([obj])` | Reproduce una animación Lottie. `obj`: `{reverse, speed, repeatCount, repeatMode, fromFrame, toFrame}`. |
| `pauseAnimation()` / `resumeAnimation()` / `stopAnimation()` | Control de la animación Lottie. `stopAnimation()` además rebobina al primer frame. |
| `setAnimationFrame(frame)` | Posiciona la animación en un frame. |
| `getMaxFrameCount()` | Frame final de la composición Lottie (0 si no hay). |

Detalles de `playAnimation(obj)`, que conviene tener claros porque la animación **ya se está reproduciendo sola en bucle infinito** desde que se pinta el control:

| Clave | Default | Notas |
|---|---|---|
| `reverse` | `false` | Reproduce hacia atrás. |
| `speed` | `1` | Multiplicador. Debe ser **positivo**: `0` o negativo lanzan error. |
| `repeatCount` | `0` | `0` = **una sola pasada**, así que llamar a `playAnimation({...})` corta el bucle infinito con el que arrancó. Para mantenerlo, `repeatCount: -1`. |
| `repeatMode` | `"restart"` | `"restart"` o `"reverse"` (ida y vuelta). |
| `fromFrame` / `toFrame` | `0` | `0` en `toFrame` significa "hasta el final". |

```javascript
// Reproducir una vez, al doble de velocidad
getControl("MAP_LOADER").playAnimation({ speed: 2 });

// Volver a dejarla en bucle infinito, ida y vuelta
getControl("MAP_LOADER").playAnimation({ repeatCount: -1, repeatMode: "reverse" });

// Reproducir solo un tramo (por ejemplo el "tick" final de un check animado)
getControl("MAP_CHECK").playAnimation({ fromFrame: 30, toFrame: 60 });
```

Sin argumentos, `playAnimation()` reproduce una pasada con la velocidad que ya tenga la animación.

**Imagen con zoom** (`zoom="true"`): `setImage(ruta)`, `clearImage()`.

**Captura de firma** (imagen con `readonly="false"`): `setImage(ruta)` (fondo), `clearImage()` (borra la firma).

### Foto (`type="PH"`)

Solo `getWidthPixels()` / `getHeightPixels()`.

### Objeto de datos embebido (`type="O"`)

Incrusta otra ficha dentro de la actual:

| Método | Qué hace |
|---|---|
| `showGroup(id [, ...])` | Muestra/navega a un grupo (pestaña) por su ID. |
| `getCurrentGroup()` | ID del grupo visible. |
| `refresh(...props)` | Refresca propiedades del objeto incrustado. |
| `refreshContentSelectedRow(content)` | Refresca la fila seleccionada de un content interno. |
| `refreshContentRow(content, indice)` | Refresca una fila concreta de un content interno. |
| `getParentObject()` | Objeto de datos contenedor. |
| `getParentView()` | Vista/pantalla contenedora. |

---

## 2. Controles numéricos con `viewmode`

Se declaran sobre `type="T"`/`"N"` con el `viewmode` indicado.

### Slider (`viewmode="slider"`, `"rounded-slider"`, `"range-slider"`, `"rating-bar"`)

| Método | Qué hace |
|---|---|
| `setMax(valor)` | Fija el valor máximo del slider. |

### Barra de progreso (`viewmode="progress-bar"` / `"circular-progress-bar"`)

| Método | Qué hace |
|---|---|
| `setValue(valor)` | Fija el progreso actual (animado). |
| `isIndeterminate()` | Indica si está en modo indeterminado. |
| `setIndeterminate(bool)` | Activa/desactiva el modo indeterminado. |
| `toggleIndeterminate()` | Alterna el modo indeterminado. |

### Stepper (`viewmode="stepper"`)

| Método | Qué hace |
|---|---|
| `getValue()` | Valor actual. |
| `setValue(n)` | Fija el valor (acotado a `[min, max]`). |
| `setMin(n)` / `setMax(n)` | Fija el mínimo / máximo. |
| `setStepSize(n)` | Incremento por pulsación (debe ser > 0). |

### OTP (`viewmode="otp"`)

| Método | Qué hace |
|---|---|
| `getOtpValue()` | Código combinado de todas las cajas. |
| `clearOtp()` | Limpia las cajas y enfoca la primera. |
| `focusOtp()` | Enfoca la primera caja vacía. |

### Barra de navegación (`viewmode="navbar"`)

| Método | Qué hace |
|---|---|
| `getValue()` | Índice del ítem (pill) seleccionado. |
| `setValue(n)` | Selecciona el ítem `n` (anima y persiste). |
| `getItemCount()` | Número de ítems. |

---

## 3. Multimedia y especiales

### WebView (`type="WEB"`)

| Método | Qué hace |
|---|---|
| `load(urlOrHtml)` | Carga una URL o HTML directo. |
| `loadFile(ruta)` | Carga un fichero local (HTML, o `.js` inyectado). |
| `reload()` | Recarga la página. |
| `lockReload()` / `unlockReload()` | Bloquea / desbloquea la recarga. |
| `stopLoading()` | Detiene la carga en curso. |
| `clearCache()` / `clearNavigationHistory()` | Limpia caché / historial. |
| `canGoBack()` / `canGoForward()` | Indica si hay página previa / siguiente. |
| `canGoBackOrForward(pasos)` | Si se puede ir N pasos atrás/adelante. |
| `goBack([pasos])` / `goForward([pasos])` | Navega N pasos (def. 1). |
| `getUrl()` / `getTitle()` / `getProgress()` | URL / título / progreso (0-100). |
| `getHistory()` / `getCurrentHistoryIndex()` | Array de URLs del historial / índice actual. |
| `getFavicon([nombre])` | Guarda el favicon a PNG y devuelve su ruta. |
| `zoomIn()` / `zoomOut()` / `zoomBy(factor)` | Zoom. |
| `pageUp([alTope])` / `pageDown([alFinal])` | Desplaza la página. |
| `saveCapture([nombre])` | Guarda una captura PNG del WebView. |
| `runScript(js)` | Ejecuta JavaScript en la página. |
| `setUserAgent(ua)` | Fija el User-Agent. |
| `setOnPageLoadedCallback(fn)` | Registra el callback `onpageloaded`. |
| `setOnClientCertificateRequest(fn)` / `clearClientCertificates()` | Certificado cliente. |
| `addPrintJob([nombre])` / `getPrintJobStatus(nombre)` / `restartPrintJob(nombre)` | Impresión de la página. |

### Vídeo (`type="VD"`)

| Método | Qué hace |
|---|---|
| `start()` / `stop()` / `pause()` / `resume()` | Control de reproducción. |
| `seek(ms)` | Salta a una posición (milisegundos). |
| `isPlaying()` | Si se está reproduciendo. |
| `getDuration()` / `getCurrentPosition()` | Duración / posición actual (ms). |
| `suspend()` | Suspende el reproductor (libera recursos). |
| `enterPipMode()` | Entra en Picture-in-Picture. |

### Cámara (`type="VD"` con `viewmode="camerapreview"`, o `classid="vaxtorocr"`)

| Método | Qué hace |
|---|---|
| `startPreview()` / `stopPreview()` | Arranca / detiene la previsualización. |
| `takePicture([obj])` | Toma una foto. `obj`: `{filename, onFinished, width, height}`. |
| `record([obj])` | Graba vídeo. `obj`: `{file, quality, maxDuration, maxFileSize, withMicAudio, onFinished}`. |
| `stopRecording()` / `isRecording()` | Detiene / consulta la grabación. |
| `setCamera("front"\|"back")` / `toggleCamera()` / `getCamera()` | Selección de cámara. |
| `isOpen()` | Si la cámara está abierta. |
| `setFlashMode(modo)` / `getFlashMode()` | Flash (`on`/`off`/`auto`/`torch`). |
| `setZoom(0-100)` / `getMaxZoom()` | Zoom. |
| `setExposureCompensation(0-100)` | Compensación de exposición. |
| `isAutoFocus()` / `setAutoFocusArea(x, y)` | Enfoque. |
| `getSupportedAspectRatios()` / `getSupportedVideoProfiles()` / `isVideoProfileSupported(perfil)` | Capacidades. |
| `setOnCodeScanned(fn)` / `setOnRawCodeScanned(fn)` | Callbacks de escaneo de códigos. |
| `setUseMlKit(bool)` | Usa ML Kit para escanear. |
| `getScannedCodes()` / `clearScannedCodes()` | Códigos escaneados. |
| `setOnLicensePlateScanned(fn)` | Callback de OCR de matrículas (Vaxtor). |
| `loadMlModel(rutaOrObj)` / `setMlFilter(obj)` | Detección con modelo ML. `setMlFilter`: `{filterIndexes, minConfidence}`. |
| `getDniVds(buffer)` | Verifica un Sello Digital Visible (VDS) del DNI y devuelve sus campos. |

### Dibujo (`type="DR"`)

**Versión 2** (`viewmode="v2"` o `version="v2"`) — completa:

| Método | Qué hace |
|---|---|
| `saveDrawing([nombre])` | Guarda el dibujo a fichero y persiste el valor. |
| `clearDrawing()` / `hasDrawing()` | Borra / consulta si hay trazos. |
| `undo()` / `redo()` | Deshacer / rehacer. |
| `setTool("brush"\|"eraser")` / `enableBrush()` / `enableEraser()` | Herramienta activa. |
| `setBrushColor(color)` / `setBrushSize(n)` / `getBrushSize()` | Pincel. |
| `setEraserSize(n)` / `getEraserSize()` | Borrador. |
| `setOpacity(0-100)` / `getOpacity()` | Opacidad. |
| `addText(textoOrObj)` | Añade texto. `obj`: `{text, textColor, textSize, font, gravity, background, editable}`. |
| `addImage(ruta)` / `addLine(obj)` | Añade imagen / línea (`{color, width}`). |
| `setFilterEffect(nombre)` | Aplica un filtro de imagen. |

**Versión 1** (`type="DR"` por defecto): solo `saveDrawing([nombre])`, `clearDrawing()`, `hasDrawing()`. Para pincel/borrador/texto/filtros usa la versión 2.

### Visor PDF

**`viewmode="pdfview"`**: `loadPdf(ruta)` (encadenable), `getPageCount()`, `nextPage()`, `previousPage()`.

**`viewmode="pdfview2"`**: `loadPdf(ruta)`, `getPageCount()`, `setPage(n)`, `nextPage()`, `previousPage()`.

### Skeleton (`classid="skeleton"`)

| Método | Qué hace |
|---|---|
| `show()` / `hide()` / `toggle()` | Muestra / oculta / alterna el shimmer. |
| `isShowing()` | Si está visible. |
| `setBaseColor(color)` / `setShimmerColor(color)` | Colores en runtime. |
| `setShimmerDuration(ms)` | Duración del ciclo del shimmer. |

---

## 4. Listas y contenidos (`type="Z"`)

### Lista (`viewmode="recyclerview"` / `"wearable"`, o `type="Z"` sin `viewmode`)

| Método | Qué hace |
|---|---|
| `addItem(objeto [, indice])` | Inserta el objeto en la **colección de datos y** en la lista. Sin índice, al final; con índice, en esa posición (acotada al rango válido). Devuelve la vista de la fila insertada. |
| `addToDataset(objeto)` | Añade el objeto **solo a la lista visible** (no a la colección de datos). |
| `removeItem(objeto\|indice\|id)` | Quita el ítem de la **colección y** de la lista. |
| `removeFromDataset(objeto\|indice\|id)` | Quita el ítem **solo de la lista visible**. |
| `deleteItem(objeto\|indice\|id)` | Borra el ítem de la colección (baja real) y de la lista. |
| `setSelectedItem(indice)` / `clearSelectedItem()` | Marca / quita la selección. |
| `scrollTo(indice)` | Desplaza (suave) a la posición. |
| `scrollToTop()` / `scrollToBottom()` | Desplaza al primer / último ítem. |
| `scrollBy(x, y)` | Desplaza por (x, y) píxeles. |
| `getView(indice)` | Devuelve la vista de la fila en esa posición (si está visible). |

> **`addItem` vs `addToDataset`:** `addItem` toca el modelo de datos (la colección); `addToDataset` solo pinta en la lista. Análogamente `removeItem`/`deleteItem` (modelo + lista) frente a `removeFromDataset` (solo lista).

### Slider de contenido (`viewmode="slideview"` / `"coverflow"`)

| Método | Qué hace |
|---|---|
| `addItem(objeto)` | Inserta en la colección y en el pager (al final). |
| `addToDataset(objeto)` | Añade solo al pager. |
| `setSelectedItem(indice)` | Selecciona y refresca la página. |
| `scrollTo(pagina)` | Desplaza el pager a la página (animado). |
| `getView(indice)` | Vista de la página indicada. |

### Grid (`viewmode="gridview"`)

| Método | Qué hace |
|---|---|
| `addItem(objeto)` / `addToDataset(objeto)` | Inserta en colección+grid / solo grid. |
| `setSelectedItem(indice)` | Selecciona y refresca. |
| `getView(indice)` | Hijo en ese índice. |

### Acordeón expandible (`viewmode="expanview"` / `"expandview"`)

| Método | Qué hace |
|---|---|
| `expand(grupo [, animar])` | Expande el grupo. |
| `collapse(grupo)` | Colapsa el grupo. |
| `refreshGroupView(grupo)` | Refresca la vista de un grupo. |
| `refreshChildView(grupo, hijo)` | Refresca la vista de un hijo. |

### Expandible multinivel (`viewmode="multilevelexpanview"`)

Las rutas se indican con un índice por nivel del árbol:

| Método | Qué hace |
|---|---|
| `expand(...ruta)` | Expande el nodo de la ruta (admite también `{positions, reloadData}`). |
| `collapse(...ruta)` | Colapsa el nodo de la ruta. |
| `expandSelected([reload])` / `collapseSelected()` / `toggleSelected([reload])` | Sobre el nodo seleccionado. |
| `isSelectedItemExpanded()` | Si el nodo seleccionado está expandido. |
| `refreshItem(...ruta)` | Refresca el ítem de la ruta (acepta también un array de rutas). |
| `refreshAllItems()` | Refresca todos los ítems del árbol. |

### Chips (`viewmode="chipsview"`)

| Método | Qué hace |
|---|---|
| `getCheckedValues()` | Chips marcados, como array de `{id, value}`. |

### Calendario (`viewmode="calendarview"`)

| Método | Qué hace |
|---|---|
| `moveNext([n])` / `movePrevious([n])` | Avanza / retrocede N páginas; devuelve el mes resultante. |
| `getMode()` / `changeMode("day"\|"week"\|"month")` | Modo actual / cambio de modo. |
| `getMonth()` / `getPreviousMonth()` / `getNextMonth()` | Índices de mes (0-11). |
| `getStringMonth([idioma])` / `getStringPreviousMonth([idioma])` / `getStringNextMonth([idioma])` | Nombre localizado del mes. |

### Otros contents

- **Picturemap** (`viewmode="picturemap"`) y **Kanban** (`viewmode="kanban"`): sin métodos de script propios; se manejan por interacción (toque / drag&drop) y configuración XML.

---

## 5. Mapas (`viewmode="mapview"`, `"maplibre"`, `"openstreetmap"`)

Los tres proveedores comparten una **API común de mapa** (interfaz única). Las firmas de abajo son las de **referencia** (Google Maps, el proveedor más completo). **No todos los proveedores implementan todos los métodos**; los no implementados no tienen efecto: MapLibre no implementa rutas/medidor/`setFollowUserLocation`/`removeMarker`. Cada proveedor añade además métodos propios (al final).

Muchos métodos aceptan un **objeto JS** con campos (`{campo: valor}`) o, en algunos casos, **argumentos sueltos**. `[campo]` = opcional.

### Cámara y zoom (común)

| Firma | Qué hace |
|---|---|
| `setZoom(zoom)` | Anima la cámara al nivel de zoom (ignora `-1`). |
| `getZoom()` | Nivel de zoom actual. |
| `setMinZoom(n)` / `setMaxZoom(n)` | Fija el zoom mínimo / máximo (y reajusta si procede). |
| `resetMinMaxZoom()` | Quita los límites de zoom. |
| `moveTo(lat, lng)` | Mueve la cámara (sin cambiar el zoom). |
| `zoomTo(lat, lng, [nivel=14], [withMeters=false])` | Centra y hace zoom; `withMeters` interpreta el nivel como metros. |
| `zoomToBounds(...locations)` | Ajusta la cámara para abarcar todas las coordenadas. |
| `zoomToEncodeData(encode \| [encodes])` | Ajusta la cámara a uno o varios polylines codificados. |
| `restrictMapToBounds(...locations)` | Limita el desplazamiento de la cámara a esos límites. |
| `getMapBounds()` | Límites visibles (array de esquinas). |
| `getMapCenter()` | Centro visible `{latitude, longitude, altitude, accuracy, bearing, speed, time}`. |
| `setMapType(tipo)` / `getMapType()` | Tipo de mapa (`normal`/`satellite`/`hybrid`/`terrain`). |

### Ubicación del usuario (común)

| Firma | Qué hace |
|---|---|
| `getUserLocation()` | Última ubicación `{latitude, longitude, altitude, speed, accuracy, bearing, time, provider}` o `null`. |
| `zoomToMyLocation([nivel=14], [withMeters=false])` | Centra/zoom en la ubicación; devuelve `{latitude, longitude}`. |
| `isUserLocationEnabled()` | Si la capa de ubicación está activa. |
| `enableUserLocation()` / `disableUserLocation()` | Activa / desactiva el punto azul de ubicación. |
| `setFollowUserLocation(bool)` | Seguimiento continuo de la ubicación. |

### Marcadores (común)

| Firma | Qué hace |
|---|---|
| `addMarker({latitude, longitude, [title], [icon], [width], [height], [draggable], [persist], [visible], [alpha], [rotation], [flat], [anchor], [tag], [onClick]})` | Añade un marcador (`anchor`: `center`/`top`/`bottom`; `persist=true` para poder borrarlo luego; `width`/`height` redimensionan el icono); devuelve el marcador. |
| `addMarker(lat, lng)` | Variante posicional simple. |
| `addMarker([{...}, ...])` | Varios marcadores desde un array; devuelve array de marcadores. |
| `removeMarker(id \| marcador)` | Elimina un marcador persistido por su ID o su objeto. |

### Dibujo: líneas, círculos, áreas, medidor (común)

| Firma | Qué hace |
|---|---|
| `drawLine({[line], strokeColor, [strokeWidth=5], [mode="normal"], data \| locations})` | Polilínea desde polyline codificado (`data`) o array `locations`; `mode`: `normal`/`dashed`/`dotted`/`mixed`. Variante posicional: `drawLine(line, strokeColor, mode, lat1, lng1, ...)`. |
| `drawCircle({location:{latitude,longitude}, [radius=0], [fillColor], [strokeColor], [strokeWidth=1], [pattern], [visible=true]})` | Círculo (radio en metros); devuelve el círculo. |
| `drawArea({data, [id], [color], [fillColor="#339966"], [pattern], [width=2], [onClick]})` | Polígono desde coordenadas (`data`); devuelve el id del área. `fillColor` es la clave preferida (`fillcolor` en minúsculas sigue aceptándose, obsoleta). |
| `drawEncode({data, [id], [color="#000000"], [pattern]})` | Polilínea desde polyline codificado; devuelve el id. |
| `drawEncodeArea({data, [id], [color], [fillColor="#339966"], [pattern], [width=2], [onClick]})` | Polígono desde polyline codificado; devuelve el id. |
| `clearLine(...ids)` / `clearAllLines()` | Borra líneas por id / todas. |
| `removePolylines(id)` / `clearAllPolylines()` | Borra polilíneas de `drawEncode`. |
| `removeArea(id)` / `clearAllAreas()` | Borra áreas. |
| `startDistanceMeter([{[latitude], [longitude], [startMarkerIcon], [endMarkerIcon]}])` / `stopDistanceMeter()` | Medidor de distancia con marcadores arrastrables (sin args usa el centro). |

### Rutas (común)

| Firma | Qué hace |
|---|---|
| `drawRoute({[route], (waypoints \| sourceLatitude+sourceLongitude+destinationLatitude+destinationLongitude), [mode="driving"], [strokeColor="#0000FF"], [strokeWidth=5], [accurate=false], [linePattern]})` | Dibuja una ruta; `mode`: `driving`/`walking`/`bicycling`/`transit`. Variante posicional: `drawRoute(route, destLat, destLng, srcLat, srcLng, [mode], [strokeColor])`. |
| `routeTo({[source="internal"], destinationLatitude, destinationLongitude, [address], [mode="driving"], [waypoints]})` | Traza la ruta internamente o lanza app externa (`external`/`google_maps`/`osmand`/`osmand_plus`/`<packageName>`). |
| `clearRoute(...claves)` / `clearAllRoutes()` | Borra rutas por clave / todas. |

### Capas: GeoJSON / KML / WMS (común)

| Firma | Qué hace |
|---|---|
| `addGeoJson({id, data \| dataFile, [strokeColor], [strokeWidth], [fillColor]}, ...)` | Añade capa(s) GeoJSON (`data`=objeto/JSON/string, `dataFile`=fichero); estiliza sus polígonos/líneas. Los atributos no declarados conservan el estilo por defecto del motor. |
| `removeGeoJson(id \| [ids])` / `removeAllGeoJson()` / `getGeoJsonLayerIds()` | Gestión de capas GeoJSON. |
| `addKml({id, data \| dataFile}, ...)` | Añade capa(s) KML (`data`=string KML, `dataFile`=fichero). |
| `removeKml(id \| [ids])` / `removeAllKml()` / `getKmlLayerIds()` | Gestión de capas KML. |
| `addWmsTileOverlay({[name], urlDomain, [version], [request], [cqlFilter], [layers], [boundingBox], [format], [width], [height], [transparent=true], [debug=false]})` | Añade una capa de teselas WMS (reemplaza la anterior); devuelve el mapa. |
| `removeWmsTileOverlay(clearTileCache)` | Quita la capa WMS (`clearTileCache` vacía la caché). |
| `clearMap()` | Borra rutas, líneas, áreas, polilíneas, GeoJSON y KML (no los POIs). |

### POIs y utilidades (común)

| Firma | Qué hace |
|---|---|
| `showPoisMenu()` / `hidePoisMenu()` / `togglePoisMenu()` | Cajón lateral de POIs. |
| `getContentCollection()` | Colección de datos que alimenta los POIs. |
| `captureImage([nombre])` | Snapshot del mapa a PNG; devuelve el nombre de fichero. |

### Solo Google Maps (`mapview`)

| Firma | Qué hace |
|---|---|
| `addClusteredMarker({clusterId, latitude, longitude, [clusterIcon], [icon], [title], [snippet], [itemCounter], [tag], [textSize=14], [textColor], [onClick], [onClusterClick]})` | Marcador agrupable en un cluster (acepta también un array). |
| `getClusterManager(clusterId)` | Gestor del cluster indicado. |
| `encodePolyline()` | Codifica como polyline las posiciones de todos los POIs. |
| `showStreetView(location, [radius=0])` / `removeStreetView()` | Muestra / cierra Street View. |
| `showMap()` | (Re)inicializa y muestra el mapa. |
| `setMapStyle(styleJsonOrFile)` | Aplica un estilo JSON de Google (en línea o nombre de fichero de la app); vacío/nulo restablece el estilo por defecto. |
| `setTrafficEnabled(bool)` | Activa/desactiva la capa de tráfico. |
| `setMapPadding(left, top, right, bottom)` | Padding del mapa en píxeles (reserva espacio para controles superpuestos). |

> En Google Maps, `addGeoJson` estiliza **polígonos, líneas y puntos** (no solo polígonos):
> - **Genéricos** (todas las geometrías): `strokeColor`, `strokeWidth`, `strokePattern` (`dashed`/`dotted`/`mixed`), `zIndex`, `visible`, `clickable`.
> - **Override por tipo** (prevalece sobre el genérico): `polygon*` y `line*` — p. ej. `polygonStrokeWidth`, `lineStrokeWidth`, `lineStrokeColor` — más `pointZIndex`/`pointVisible`.
> - **Solo polígono**: `fillColor`, `strokeJointType`, `geodesic`.
> - **Solo punto**: `icon` (+`iconWidth`/`iconHeight`), `alpha`, `rotation`, `draggable`, `title`, `snippet`, `anchorU`/`anchorV`.

### Solo MapLibre (`maplibre`)

| Firma | Qué hace |
|---|---|
| `loadStyle(style)` | Cambia el estilo (URL, `"default"` o ruta a JSON). |
| `getFeatures({location \| locationScreenRect \| locationScreenPoint, [distanceMeters], [layerIds], [uniqueKey]})` | Features renderizadas en un punto/rect/coordenada; devuelve `{id, type, ...bounds..., properties}`. |
| `selectFeature({location, layerIdBeginsWith, [filterKey], [filterValue], [distanceMeters], [lineWidth], [opacity], [minZoom], [maxZoom], [animate]})` | Resalta features bajo una ubicación, filtradas por `filterKey`/`filterValue`. |
| `getLayerIds([{onlyVisibleLayers}])` | IDs de capas del estilo. |
| `setLayerVisible(id, visible)` / `toggleLayerVisibility(id)` / `isLayerVisible(id)` | Visibilidad de capa(s) (`id` String o array). |
| `addSource({sourceId, [databaseFile], [url], [tileSize=256]})` / `removeSource(id)` | Fuente MBTiles/DB local (vector) o raster por URL. |
| `addLayer({layerId, sourceId, type})` / `removeLayer(id)` | Capa `raster`/`background` sobre una fuente. |
| `startDrawSelection({onAreaSelected, [shape], [lineColor], [fillColor], [lineSize], [oneShot]})` / `cancelDrawSelection()` | Dibujo interactivo de selección (`shape`: `rectangle`/`circle`); llama a `onAreaSelected(xIni, yIni, x, y, metros)`. |

### Solo OpenStreetMap (`openstreetmap`)

| Firma | Qué hace |
|---|---|
| `downloadTiles({coordinates, [onCompleted], [onProgressUpdated], [onDownloadStarted]})` | Descarga/cachea tiles offline del área entre el zoom min/max; devuelve un Future. |
| `showMinimap()` / `hideMinimap()` | Minimapa en miniatura. |
| `showScale()` / `hideScale()` | Barra de escala. |
| `showCompass()` / `hideCompass()` / `toggleCompass()` | Brújula. |
| `enableRotation()` / `disableRotation()` | Gesto de rotación del mapa. |

> En OSM, `drawRoute` admite además `urlType` (`default`/`osrm`/`osm2po`) y `url`; `addMarker` admite `anchor`, `persist`, `alpha`, `rotation`.

---

## 6. Gráficas (`classid="xonecharts"`)

Las gráficas se configuran por XML/datos y exponen principalmente `getWidthPixels()` / `getHeightPixels()`. Las gráficas de **barras** añaden:

| Método | Qué hace |
|---|---|
| `load(config)` | Carga manualmente el dataset desde un objeto JS (`{title, categories, data, ...}`). |

---

## 7. Realidad Aumentada (`viewmode="arview"`)

| Método | Qué hace |
|---|---|
| `isArCompatible()` | Comprueba compatibilidad AR del dispositivo. |
| `showViewFinder()` / `hideViewFinder()` | Muestra / oculta el viewfinder. |
| `setOnPlaneTappedListener(fn)` | Callback al tocar un plano detectado. |
| `loadObject(obj)` | Carga un modelo 3D (clave + fichero en `models/` o URL). |
| `isObjectLoaded(clave)` | Si el modelo está cargado. |
| `addObject(obj)` | Coloca un modelo cargado donde se tocó (`{model, onPlaneTappedObject, minScale, maxScale}`). |
| `takePicture(obj)` | Captura una foto de la escena (`{filename, width, height, onFinished}`). |

---

## 8. Frames (contenedores)

Un `<frame>` también se obtiene por su nombre y permite desplazarlo:

```javascript
let frame = ui.getView(self)["frmScroll"];
frame.scrollToTop(true);     // true = animado
frame.scrollToBottom(true);
```

Más utilidades de frames/grupos (`refreshAll`, `showGroup`, drawers, bottom-sheet) en §3.3.

> **Frontera de capa.** Todo lo de este fichero es API de XOne. Además de esto, la **vista
> nativa** de Android/iOS que hay bajo el frame o el control expone métodos propios —`setBlur`,
> `setSaturation`—, que no son de XOne y no tienen contrato de compatibilidad. Viven en
> [métodos nativos de la vista](metodos-nativos-de-la-vista.md).

