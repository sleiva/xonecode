# XOne XML — Props por tipo: mapas, listas y vistas de colección

> Fuente: `xone/v2/xone-help-docs/topics/02b-xml-prop-tipos.md` §5.9.11–§5.9.12d. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §5.9.11 mapa type=Z viewmode=mapview · §5.9.12 grid/lista Z · §5.9.12e chips · §5.9.12c tablero kanban · §5.9.12d carrusel coverflow

---

#### 5.9.11 Mapa (`type="Z" viewmode="mapview"`)

Los mapas en XOne son **contenedores** (`type="Z"`) con `viewmode="mapview"` (Google Maps), `maplibre` (MapLibre) u `openstreetmap`. **No existe un `type="M"` propio para mapas.**

```xml
<!-- Mapa básico (Google Maps) -->
<prop name="MAP_MAPA" type="Z" viewmode="mapview" visible="7"
      width="100%" height="100%"
      show-user-location="true"
      zoom="15" />

<!-- Mapa con eventos -->
<prop name="MAP_MAPA" type="Z" viewmode="mapview" visible="7"
      width="100%" height="70%"
      show-user-location="true"
      onmapclicked="onMapClick(e);"
      onmapready="onMapReady(e);" />

<!-- Alternativas open source -->
<prop name="MAP_MAPA" type="Z" viewmode="maplibre" visible="7" width="100%" height="100%" />
<prop name="MAP_MAPA" type="Z" viewmode="openstreetmap" visible="7" width="100%" height="100%" />
```

**Atributos:**

| Atributo | Descripción |
|----------|-------------|
| `show-user-location` | Muestra la posición del usuario |
| `zoom` | Nivel de zoom inicial |
| `max-zoom` | Zoom máximo permitido |

**Eventos** (atributos XML inline en el prop):

| Atributo | Cuándo se dispara | Parámetros del evento |
|----------|-------------------|----------------------|
| `onmapready` | Mapa inicializado y listo | `e.target` |
| `onmapclicked` | Click en el mapa (no sobre un marcador) | `e.latitude`, `e.longitude`, `e.target` |
| `onmaplongclicked` | Click largo en el mapa | `e.latitude`, `e.longitude`, `e.target` |
| `onmapzoomchanged` | Cambio de nivel de zoom | `e.zoom` (nuevo nivel); `e.bounds` = `Object[]` de 2 elementos `[noreste, suroeste]`, cada uno objeto location con `latitude`, `longitude`, `altitude`, `accuracy`, `bearing`, `speed`, `time` (los 5 últimos siempre a 0) |
| `onmarkerdragend` | Fin de arrastre de un marcador | `e.latitude`, `e.longitude`, `e.tag`, `e.marker` |
| `ondrop` | Objeto soltado sobre el mapa (drag & drop) | `e.latitude`, `e.longitude`, `e.target` |
| `onlocationready` | Primera localización GPS obtenida | `e.latitude`, `e.longitude` |
| `onlocationchanged` | Cambio de posición GPS | `e.latitude`, `e.longitude` |
| `onstreetviewenabled` | StreetView activado | `e.latitude`, `e.longitude`, `e.target` (coordenadas del punto donde se activó) |
| `onstreetviewunavailable` | StreetView no disponible en la zona | `e.latitude`, `e.longitude`, `e.target` (coordenadas del punto consultado) |
| `ondistancemeter` | Resultado del medidor de distancia | `e.distance` (metros), `e.location1`, `e.location2` — ver sección siguiente |

##### Medidor de distancia interactivo

Sólo está implementado en **Google Maps** (`viewmode="mapview"`). En `openstreetmap`, `maplibre` y `picturemap` las llamadas a `startDistanceMeter` / `stopDistanceMeter` lanzan `UnsupportedOperationException("Not implemented yet")`.

```javascript
let mapControl = getControl("MAP_MAPA");

// Forma 1: objeto JS (recomendada). Crea dos marcadores arrastrables
mapControl.startDistanceMeter({
    latitude       : 38.886546,
    longitude      : -7.0043193,
    startMarkerIcon: "ic_start.png",   // opcional, ruta relativa a la carpeta de recursos de la app
    endMarkerIcon  : "ic_end.png"      // opcional
});

// Forma 2: parámetros posicionales — location + iconos (máx. 2 iconos)
mapControl.startDistanceMeter("38.886546,-7.0043193", "ic_start.png", "ic_end.png");

// Forma 3: sin parámetros → usa el centro actual de la cámara como punto de partida
mapControl.startDistanceMeter();

// Detener: elimina marcadores y línea
mapControl.stopDistanceMeter();
```

El evento `ondistancemeter` declarado en el prop se dispara **al terminar de arrastrar cualquiera de los dos marcadores** (no solo el final). Parámetros del evento:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `e.distance` | `double` | Distancia en **metros** entre los dos marcadores (geodésica, vía `SphericalUtil.computeDistanceBetween`) |
| `e.location1` | objeto | Posición del marcador de inicio. Campos: `latitude`, `longitude`, `altitude` (0), `accuracy` (0), `bearing` (0), `speed` (0), `time` (0) |
| `e.location2` | objeto | Posición del marcador final, con los mismos campos |

```javascript
function onDistanceMeter(e) {
    self.MAP_DISTANCIA = e.distance.toFixed(1) + " m";
    self.MAP_LAT_FIN   = e.location2.latitude;
    self.MAP_LON_FIN   = e.location2.longitude;
    ui.refreshValue("MAP_DISTANCIA", "MAP_LAT_FIN", "MAP_LON_FIN");
}
```

##### Operaciones sobre marcadores (MarkerScriptWrapper)

Cada llamada a `mapControl.addMarker(...)` devuelve un wrapper del marcador con métodos para modificarlo en runtime. Cuidado: algunos métodos están **implementados solo en Google Maps**; en MapLibre devuelven el wrapper sin hacer nada (no-op silencioso, sin excepción).

```javascript
marker.setVisible(true);
marker.setDraggable(true);          // MapLibre: no-op
marker.setRotation(180);            // Rotación en grados; animado por defecto
marker.setRotation(180, false);     // Rotación instantánea (sin animación). MapLibre: no-op
marker.setAlpha(0.5);               // MapLibre: no-op
marker.setAnchor("top");            // top / bottom / center. MapLibre: no-op
marker.setIcon("ic_nuevo.png");
marker.setPosition({
    latitude : 38.8685452,
    longitude: -6.8170906,
    animate  : true,
    duration : 500                  // ms de animación
});
let pos = marker.getPosition();     // [latitude, longitude]
marker.showInfo();
marker.hideInfo();
marker.remove();
```

Resumen de soporte por backend:

| Método | Google Maps (`mapview`) | MapLibre (`maplibre`) |
|--------|-------------------------|------------------------|
| `setVisible` / `setIcon` / `setPosition` / `remove` / `showInfo` / `hideInfo` | OK | OK |
| `setDraggable` / `setRotation` / `setAlpha` / `setAnchor` | OK | No-op silencioso |

> **Nota**: Los mapas también pueden mostrarse mediante `type="Z"` con `viewmode="mapview"` para mostrar multiples marcadores. Ver sección 5.9.12.

#### 5.9.12 Grid/Lista (Z)

El tipo `Z` es el más potente para mostrar listas de datos. Se vincula a un nodo `<contents>` que define la fuente de datos.

```xml
<!-- Lista con RecyclerView -->
<prop name="MAP_LISTA" type="Z" visible="1"
      contents="@MiContenido"
      viewmode="recyclerview"
      width="100%" height="80%"
      edit-inrow="true"
      show-no-data="true"
      show-loading="true" />
<contents name="@MiContenido" src="ColeccionDatos" />

<!-- Mapa con marcadores -->
<prop name="MAP_MAPA" type="Z" visible="1"
      viewmode="mapview"
      mapview-embedded="true"
      contents="mapaDatos"
      width="100%" height="80%"
      show-user-location="true"
      zoom-to-pois="true" />
<contents name="mapaDatos" src="ContentMapa" />

<!-- Gráfico de barras -->
<prop name="@ChartBarras" type="Z" visible="1"
      classid="XOneCharts"
      viewmode="barchart"
      contents="GraficosBarrasDatos"
      width="100%" height="300p" />
<contents name="GraficosBarrasDatos" src="ContentGraficosBarras" />

<!-- Calendario -->
<prop name="Calendario" type="Z" visible="1"
      calendar-viewmode="week"
      contents="calendario"
      viewmode="calendarview"
      width="100%" height="100%" />
<contents name="calendario" src="ContentCalendario" />
```

**ViewModes disponibles para type="Z"**:

**Listas y Grids:**

| ViewMode | Descripción |
|----------|-------------|
| `recyclerview` | Lista con reciclaje de vistas (**recomendado** para listas largas) |
| `gridview` | Vista de cuadricula |
| `slideview` | Vista deslizable tipo carrusel (swipe tabs) |
| `coverflow` | Variante de `slideview` con efecto Cover Flow estilo iTunes (cards laterales escaladas/atenuadas/rotadas en 3D). Ver sección 5.9.12d |
| `kanban` | Tablero estilo Trello/Jira: items agrupados en columnas verticales con drag&drop entre columnas. Ver sección 5.9.12c |
| `chipsview` | Conjunto de **chips Material** (pastillas redondeadas) con *wrap* automático a varias filas. Cada fila de un `<contents>` es un chip. Ver sección 5.9.12e |
| `expanview` | Vista expandible / colapsable (acordeón) |

**Mapas:**

| ViewMode | Descripción |
|----------|-------------|
| `mapview` | Mapa con marcadores (Google Maps) |
| `openstreetmap` | Mapa OpenStreetMap |
| `picturemap` | Mapa con imágenes / catálogo visual de marcadores |

**Gráficos:**

| ViewMode | Descripción |
|----------|-------------|
| `barchart` | Gráfico de barras |
| `3dbarchart` | Gráfico de barras 3D |
| `linechart` | Gráfico de lineas |
| `xylinechart` | Gráfico de lineas XY |
| `areachart` | Gráfico de áreas |
| `timeserieschart` | Gráfico de series temporales |
| `slidingbarchart` | Gráfico de barras con navegación horizontal |
| `piechart` | Gráfico circular |
| `piechart2` | Gráfico circular (variante alternativa) |

**Otros:**

| ViewMode | Descripción |
|----------|-------------|
| `calendarview` | Vista de calendario |

**Atributos especificos de Z**:

| Atributo | Descripción |
|----------|-------------|
| `contents` | Nombre del content vinculado (con prefijo `@`) |
| `viewmode` | Modo de visualizacion (ver tabla) |
| `versión` | Versión del grid (`"v2"` para versión mejorada) |
| `edit-inrow` | Editar directamente en la fila |
| `show-no-data` | Mostrar mensaje cuando no hay datos |
| `show-loading` | Mostrar indicador de carga |
| `classid` | Para gráficos: `"XOneCharts"` |
| `mask` | Mascara de opciones |
| `calendar-viewmode` | Para calendarios: `week`, `month` |

#### 5.9.12e Chips (viewmode="chipsview")

Muestra una colección de etiquetas como **chips Material** (pastillas redondeadas) con *wrap* automático a varias filas — el equivalente a un `Wrap(children: [Chip(...)])`. Es un `<prop type="Z" viewmode="chipsview">` alimentado por un `<contents>`: **cada fila del contents es un chip**.

La colección del `<contents>` debe declarar:
- una prop con **`chip-value="true"`** → su valor es el texto que se pinta en el chip (obligatoria).
- opcionalmente una prop con **`chip-close-enabled="true"`** → si su valor es verdadero, el chip muestra una "x" para cerrarse.

```xml
<!-- En la pantalla -->
<prop name="MAP_TAGS" type="Z" viewmode="chipsview" contents="@tagsContent"
      width="100%" height="-2" />
<contents name="@tagsContent" src="Etiqueta" />

<!-- Colección de las etiquetas. Puede vivir en memoria (volatile) si los chips
     se generan al vuelo (p. ej. partiendo un campo de texto): -->
<coll name="Etiqueta" volatile="true" loadall="true" manual-load="true" progid="ASData.CASBasicDataObj">
    <prop name="VALUE" type="T" chip-value="true" size="120" />
</coll>
```

**Rellenar los chips desde JS** (típico: trocear un campo CSV en el `before-edit` del detalle). Hay que **añadir** cada objeto al contents y refrescar el control:

```javascript
var c = self.getContents("@tagsContent");
c.unlock();
c.clear();
var tags = String(self.TAGS || "").split(",");
for (var i = 0; i < tags.length; i++) {
    var t = tags[i].replace(/^\s+|\s+$/g, "");
    if (t.length === 0) continue;
    var o = c.createObject();
    o.VALUE = t;
    c.addItem(o);          // addItem, NO save
}
c.lock();
var v = ui.getView(self);
if (v !== null) v.refresh("MAP_TAGS");   // refrescar el control type=Z
```

> **Importante (colección en memoria):** con `volatile="true"` añade también **`manual-load="true"`** y **`loadall="true"`** en la `<coll>`. Si no, el control intenta recargar la colección desde la base de datos al pintarse y la deja vacía. Para llenarla usa `createObject()` + **`addItem()`** (NO `save()`, que fallaría al no existir tabla), luego `lock()` y refresca el control con `ui.refresh("NOMBRE_DEL_Z")`.

**Selección / cierre (todos los chips son *checkable* / toggle):** cada chip se puede marcar y desmarcar; no existe un modo "solo lectura" — un chip sin handler simplemente no hace nada al marcarse. Esto los hace ideales como *filter chips* (seleccionar para filtrar).

- **`onitemschanged="onTags(e);"`** — se dispara en cada marca/desmarca y `e` trae **todos** los chips marcados en ese momento: **`e.values`** (array con los textos) y **`e.ids`** (array con sus ids). Es el camino recomendado para reaccionar a la selección.
- **`onitemremoved="onQuita(e);"`** — se dispara al pulsar la "x" de un chip (requiere que esa fila tenga `chip-close-enabled` con valor verdadero); `e.value` / `e.id` identifican el chip cerrado.
- Alternativa imperativa: `ui.getView(self).getControl("MAP_TAGS").getCheckedValues()` devuelve los marcados como `[{id, value}]`.

```javascript
// filter chips: al cambiar la selección, relanzar una búsqueda con los tags activos
function onTags(e) {
    var tags = [];
    if (e && e.values) {
        for (var i = 0; i < e.values.length; i++) tags.push(String(e.values[i]));
    }
    buscarConTags(tags);   // tu lógica de filtrado
}
```

#### 5.9.12c Tablero Kanban (viewmode="kanban")

Tablero estilo Trello / Jira para `<prop type="Z">`: los items de un `<contents>` se agrupan en columnas verticales según el valor de un campo, con **drag&drop entre columnas**. Al soltar una card en otra columna, el framework asigna al campo declarado en `kanban-column-field` el valor de la columna destino y persiste el cambio automáticamente (sin código JS adicional).

**Modo simple — card con título + subtítulo (sin frame propio):**

```xml
<prop name="MAP_TABLERO" type="Z" visible="1"
      viewmode="kanban"
      contents="@tareasContent"
      kanban-column-field="ESTADO"
      kanban-columns="TODO|DOING|DONE"
      kanban-column-titles="Pendiente|En curso|Hecho"
      kanban-column-colors="#FFE0E0|#FFF4D0|#D0F0D0"
      kanban-column-width="280p"
      kanban-card-title-field="TITULO"
      kanban-card-subtitle-field="DESCRIPCION"
      kanban-card-bgcolor="#FFFFFF"
      draggable="true"
      width="100%" height="100%" />
<contents name="@tareasContent" src="Tareas" />
```

**Modo objeto XOne completo — la card usa el `<frame>` declarado en la coll del contents:**

```xml
<prop name="MAP_TABLERO" type="Z" visible="1"
      viewmode="kanban"
      contents="@tareasContent"
      kanban-column-field="ESTADO"
      kanban-columns="TODO|DOING|DONE"
      width="100%" height="100%" />
```

**Atributos obligatorios:**

| Atributo | Descripción |
|----------|-------------|
| `contents` | Nombre del `<contents>` vinculado |
| `kanban-column-field` | Nombre del campo del item cuyo valor determina la columna |
| `kanban-columns` | Valores posibles del campo separados por `\|` (ej. `TODO\|DOING\|DONE`). Define orden y número de columnas |

**Atributos opcionales:**

| Atributo | Default | Descripción |
|----------|---------|-------------|
| `kanban-column-titles` | usa los valores | Títulos visibles de las columnas separados por `\|`. Si no se da, se muestra el valor crudo |
| `kanban-column-colors` | gris claro | Colores de fondo de la cabecera de cada columna separados por `\|`. Acepta `#RRGGBB` y `#AARRGGBB` |
| `kanban-column-width` | `280p` | Ancho de cada columna. Acepta `p`, `%`, etc. |
| `kanban-card-title-field` | — | Campo a mostrar como título de la card (modo simple) |
| `kanban-card-subtitle-field` | — | Campo a mostrar como subtítulo (modo simple) |
| `kanban-card-bgcolor` | blanco | Color de fondo de las cards |
| `draggable` | `true` | Si `false`, deshabilita drag&drop (tablero solo lectura) |
| `disableedit` | `false` | Formula o literal; si evalua a `true`, las cards no son arrastrables aunque `draggable="true"` |

**Modos de renderizado de las cards:**

- **Modo simple:** activo cuando esta presente al menos uno de `kanban-card-title-field` / `kanban-card-subtitle-field`. La card muestra título + subtítulo sobre `kanban-card-bgcolor`. Útil para tableros ligeros.
- **Modo objeto XOne completo:** activo cuando ninguno de esos atributos esta presente. Cada card se renderiza con el `<frame>` declarado en la coll del contents (mismo patron que `recyclerview` / `slideview`). Permite layouts complejos.

**Eventos:**

| Evento | Cuando se dispara |
|--------|--------------------|
| `<selecteditem>` / `onselecteditem` | Clic corto sobre una card (mismo patron que `recyclerview`) |
| Drag&drop entre columnas | Long-press sobre la card inicia el drag. Al soltar en otra columna, el framework asigna `kanban-column-field = valor de la columna destino` y guarda |

**Casos de uso típicos:** gestion de tareas (TODO/DOING/DONE), pipeline comercial (LEAD/QUOTE/WON/LOST), tableros de proyecto, workflows de aprobacion.

**Notas:**

- El campo `kanban-column-field` debe existir en la coll del contents y aceptar como valor cualquiera de los strings declarados en `kanban-columns` (mismo formato, sin transformación).
- Cards cuyo valor del campo no coincida con ninguna columna declarada **no se muestran**.
- Si el ancho total de las columnas supera la pantalla, el tablero se desplaza horizontalmente.

#### 5.9.12d Carrusel Cover Flow (viewmode="coverflow")

Variante de `slideview` para `<prop type="Z">` con efecto **Cover Flow** estilo iTunes: las cards laterales se reducen, se atenuan y opcionalmente rotan en 3D respecto a la card central, creando sensacion de profundidad. La card del centro se ve a tamaño y opacidad plenos; las que se alejan a izquierda o derecha se interpolan linealmente hacia los mínimos definidos.

Internamente comparte motor con `slideview` (mismo `<contents>`, misma navegación por swipe, mismos eventos: `onselecteditem`, `autoslide-delay`, indicadores de página). Solo cambia la animación de transición.

```xml
<!-- Cover Flow básico (escala 75%, alpha 60%, sin rotacion 3D) -->
<prop name="MAP_CARRUSEL" type="Z" visible="1"
      viewmode="coverflow"
      contents="@productosContent"
      width="100%" height="320p" />
<contents name="@productosContent" src="Productos" />

<!-- Cover Flow con rotacion 3D en Y -->
<prop name="MAP_CARRUSEL" type="Z" visible="1"
      viewmode="coverflow"
      contents="@productosContent"
      cover-flow-min-scale="0.7"
      cover-flow-min-alpha="0.5"
      cover-flow-rotation="35"
      width="100%" height="320p" />
```

**Atributos especificos:**

| Atributo | Default | Rango | Descripción |
|----------|---------|-------|-------------|
| `cover-flow-min-scale` | `0.75` | `0.0` – `1.0` | Escala mínima de las cards laterales. La central se ve a `1.0`; las pegadas al borde se reducen hasta este valor |
| `cover-flow-min-alpha` | `0.6` | `0.0` – `1.0` | Opacidad mínima de las cards laterales. La central a `1.0`; las laterales se atenuan linealmente |
| `cover-flow-rotation` | `0` | grados | Rotación 3D sobre el eje Y de las cards laterales. Si distinto de `0`, se aplica perspectiva 3D real. Valores típicos: `25`–`45` |

Todos los atributos heredados de `slideview` (`autoslide-delay`, `onselecteditem`, etc.) siguen funcionando.

**Comportamiento:**

- **Card central:** escala `1.0`, alpha `1.0`, rotación `0` (siempre se ve al máximo).
- **Cards laterales:** se interpolan linealmente entre el centro y los mínimos según la distancia. Una card pegada al borde (posición ±1) se ve exactamente a `cover-flow-min-scale` de escala, `cover-flow-min-alpha` de alpha y `±cover-flow-rotation` grados.
- **Cards fuera del viewport:** invisibles (alpha 0) — no se renderizan visualmente.
- **Layout de la card:** el contenido es el `<frame>` declarado en la coll del contents, igual que `slideview`. El transformer solo modifica escala/alpha/rotación.

**Casos de uso típicos:** galerías de productos destacados en home, onboarding ilustrado, selectores visuales (plan, avatar), showcases donde se quiere foco en una card y peek de las adyacentes.

**Notas:**

- Valores de `cover-flow-min-scale` / `cover-flow-min-alpha` se recortan al rango `[0, 1]`; valores fuera se ajustan automáticamente.
- Con `cover-flow-rotation="0"` (default), el efecto es puramente plano (escala + opacidad). Para Cover Flow clasico estilo iTunes, usar entre 30 y 45 grados.
- Suele dejarse el `width` de cada card algo menor que el viewport para ver "peeking" de las adyacentes.
- No combinable con `viewmode="slideview"`: o uno o el otro.

