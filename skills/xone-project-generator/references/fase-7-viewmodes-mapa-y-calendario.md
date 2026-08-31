# Generación XOne — Fase 7: viewmodes de mapa y calendario

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` L3522–3976. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §7.13 viewmodes disponibles · §7.13a mapview y openstreetmap · §7.13b calendarview

---

### 7.13 ViewModes Disponibles para Generación

Al generar pantallas con contents (`<prop type="Z">`), el agente debe seleccionar el `viewmode` adecuado según el tipo de visualizacion requerida. Referencia completa:

#### Listas y Grids

| ViewMode | Descripción | Cuando usarlo |
|----------|-------------|---------------|
| `grid` | Cuadricula por defecto | Tablas simples sin necesidad de rendimiento alto |
| `recyclerview` | Lista con reciclaje de vistas | **Recomendado** para toda lista larga (>20 elementos) |
| `gridview` | Cuadricula de elementos | Catálogos visuales, galerías |
| `slideview` | Vista deslizable tipo carrusel | Banners promocionales, onboarding, galerías con swipe |
| `coverflow` | Variante de `slideview` con efecto Cover Flow estilo iTunes (cards laterales escaladas/atenuadas/rotadas en 3D) | Galerías destacadas en home, onboarding ilustrado, selectores visuales (plan/avatar), showcases con foco en una card y peek de adyacentes |
| `kanban` | Tablero estilo Trello/Jira con columnas verticales y drag&drop entre estados | Gestion de tareas (TODO/DOING/DONE), pipeline comercial (LEAD/QUOTE/WON/LOST), workflows de aprobacion, tableros de proyecto |
| `expanview` | Vista expandible/colapsable (acordeón) | Listas padre-hijo, árboles, FAQs, categorías agrupadas |
| `picturemap` | Mosaico de imágenes / catálogo visual | Catálogos de productos con foto, galerías |

#### Mapas

| ViewMode | Descripción | Cuando usarlo |
|----------|-------------|---------------|
| `mapview` | Mapa con marcadores (Google Maps) | Ubicaciones, rutas, tracking |
| `openstreetmap` | Mapa OpenStreetMap | Alternativa offline, sin dependencia de Google |

#### Gráficos (requieren `classid="XOneCharts"`)

| ViewMode | Descripción | Cuando usarlo |
|----------|-------------|---------------|
| `barchart` | Gráfico de barras | Comparaciones por categorías |
| `3dbarchart` | Gráfico de barras 3D | Comparaciones con efecto visual 3D |
| `piechart` | Gráfico circular (tarta) | Distribuciones porcentuales |
| `piechart2` | Gráfico circular alternativo | Variante visual de distribución |
| `linechart` | Gráfico de lineas | Tendencias y evoluciones temporales |
| `xylinechart` | Gráfico de lineas XY | Relaciones entre dos variables numéricas |
| `areachart` | Gráfico de área | Tendencias acumuladas, volúmenes |
| `timeserieschart` | Series temporales | Datos con eje temporal preciso (sensores, IoT) |
| `slidingbarchart` | Barras con navegación | Muchas categorías con scroll horizontal |

#### Calendario

| ViewMode | Descripción | Cuando usarlo |
|----------|-------------|---------------|
| `calendarview` | Vista de calendario | Agendas, citas, planificacion. Usar con `calendar-viewmode="week"` o `"month"` |

#### Controles Numéricos (para `<prop type="N">`, NO type="Z")

| ViewMode | Descripción | Cuando usarlo |
|----------|-------------|---------------|
| `seekbar` | Barra deslizante básica | Selección de valor numérico simple |
| `slider` | Deslizador Material Design | Ajustes de volumen, brillo, cantidades |
| `progress-bar` | Barra de progreso | Mostrar avance de proceso |
| `circular-progress-bar` | Progreso circular | Indicadores de carga, porcentajes |
| `range-slider` | Selector de rango (min-max) | Filtros de precio, edad, distancia |
| `stepper` | Control compacto `−` / `+` para valores enteros (auto-repite cada 80 ms en long-press; opcionalmente ciclico con `wrap="true"`) | Cantidades en carritos, spinners de configuración (zoom/volumen discreto), selectores ciclicos de hora/día, pasos de wizard |

> **Nota:** Los controles numéricos usan atributos adicionales: `min`, `max`, `step`/`step-size`, `orientation`. El `stepper` además acepta `wrap`, `bar-color`, `forecolor`.

#### Controles de Texto/Numéricos especiales (para `<prop type="T">` o `<prop type="N">`)

| ViewMode | Tipo base | Descripción | Cuando usarlo |
|----------|-----------|-------------|---------------|
| `otp` | `T` o `N` | Entrada de códigos de un solo uso con cajas individuales por digito, auto-avance, backspace inverso y paste distribuido. Valor concatenado sin separadores. Atributos `digits` (default 6), `secret`, `auto-submit`, `allow-letters`, `box-size`, `box-spacing`, `box-color`, `box-color-focus`. | Verificación SMS (`type="N"` `digits="6"`), 2FA, PIN de aplicación (`secret="true"`), códigos de invitacion (`allow-letters="true"`) |
| `markdown` | `T` | Renderiza el contenido del campo como Markdown CommonMark base (cabeceras, enfasis, listas, enlaces, imágenes, blockquotes, código). NO soporta tablas/strikethrough/task lists/HTML embebido. Sin atributos propios. | Mensajes formateados al usuario, descripciones servidas desde backend, plantillas dinámicas, cabeceras ricas, renderizado de respuestas de IA / chatbots |

> **Nota:** `markdown` aplica a `type="T"` y también a `type="L"` (y a su alias legacy `type="TL"`): el label-only también renderiza el contenido como Markdown vía el mismo mecanismo. En `type="T"`, para evitar el modo edición accidental, marcar el campo con `readonly="true"` o `locked="true"`.

#### Ejemplo de selección de viewmode en generación

```
Si el usuario pide:
- "lista de productos"         -> viewmode="recyclerview"
- "mapa de clientes"           -> viewmode="mapview" o "openstreetmap"
- "gráfico de ventas"          -> viewmode="barchart" + classid="XOneCharts"
- "agenda de citas"            -> viewmode="calendarview"
- "arbol de categorias"        -> viewmode="expanview" con filter="IDPADRE IS NULL"
- "carrusel de imagenes"       -> viewmode="slideview" con autoslide-delay="5"
- "galeria estilo iTunes"      -> viewmode="coverflow" con cover-flow-rotation="35"
- "tablero de tareas Kanban"   -> viewmode="kanban" con kanban-column-field y kanban-columns
- "selector de cantidad"       -> viewmode="slider" en prop type="N"
- "selector +/- de unidades"   -> viewmode="stepper" en prop type="N" con min/max/step-size
- "indicador de progreso"      -> viewmode="progress-bar" en prop type="N"
- "filtro de rango de precios" -> viewmode="range-slider" en prop type="N"
- "código SMS de 6 digitos"    -> viewmode="otp" en prop type="N" con digits="6"
- "PIN oculto de 4 caracteres" -> viewmode="otp" en prop type="T" con digits="4" secret="true" allow-letters="true"
- "texto con formato Markdown" -> viewmode="markdown" en prop type="T" (readonly="true" si es decorativo)
```

---

### 7.13a ViewMode: mapview / openstreetmap

**Cuando usarlo:** ubicaciones de clientes, rutas de trabajo, tracking de vehiculos, puntos de interes geolocalizados.

- `mapview` — Google Maps (Android e iOS). Requiere API Key de Google si se usan servicios avanzados.
- `openstreetmap` — OpenStreetMap, alternativa sin dependencia de Google, funciona offline.

#### Coleccion de datos para el mapa

La coleccion que alimenta el contents de mapa debe tener campos con atributos especiales que indican al framework que campo contiene cada dato geografico:

```xml
<coll name="ContentCoordenadas" title="coordenadas"
      sql="SELECT t1.* FROM ##PREF##clientes t1"
      objname="clientes" updateobj="clientes"
      progid="ASData.CASBasicDataObj" loadall="true">
    <group name="General" id="1">
        <prop name="NOMBRE" type="T" visible="4" />
        <!-- Atributo mapview-address: muestra la dirección en el popup del marcador -->
        <prop name="DIRECCION" type="T" visible="4" mapview-address="true" />
        <!-- Atributo mapview-latitude: indica que este campo es la latitud del POI -->
        <prop name="LATITUD" type="N6" visible="4" mapview-latitude="true" />
        <!-- Atributo mapview-longitude: indica que este campo es la longitud del POI -->
        <prop name="LONGITUD" type="N6" visible="4" mapview-longitude="true" />
        <!-- Atributo mapview-marker-icon: icono personalizado del marcador (fichero PNG en icons/) -->
        <prop name="MAP_ICONO" type="T" visible="4" mapview-marker-icon="true" />
    </group>
</coll>
```

#### Declaración del prop type="Z" con viewmode="mapview"

```xml
<prop name="@mapaClientes"
      type="Z"
      viewmode="mapview"
      mapview-embedded="true"
      contents="mapaClientes"
      width="100%"
      height="70%"
      map-type="normal"
      show-user-location="true"
      zoom-to-pois="true"
      show-zoom-buttons="true"
      show-google-buttons="true"
      onmapclicked="onMapClicked(e);"
      onmapready="onMapReady(e);" />
<contents name="mapaClientes" src="ContentCoordenadas" />
```

#### Atributos del prop mapview

| Atributo | Descripción |
|----------|-------------|
| `mapview-embedded="true"` | Embebe el mapa dentro de la coleccion. Sin este atributo abre la app de mapas del dispositivo |
| `map-type` | Tipo de mapa: `normal`, `satellite`, `terrain`, `hybrid` |
| `map-features="roads"` | Activa visualizacion de carreteras |
| `map-style` | Estilo JSON de Google (en línea o nombre de fichero); recolorea el mapa. Prioritario sobre `map-features` |
| `traffic-enabled="false"` | Muestra la capa de tráfico |
| `map-padding="0,0,0,0"` | Padding del mapa en píxeles (`left,top,right,bottom`) |
| `tilt-gestures-enabled="true"` | Permite inclinar el mapa con gestos |
| `scroll-gestures-enabled="true"` | Permite desplazar el mapa con gestos |
| `zoom-gestures-enabled="true"` | Permite hacer zoom con gestos |
| `rotate-gestures-enabled="true"` | Permite rotar el mapa con gestos |
| `show-compass="false"` | Muestra la brújula (mapview y openstreetmap) |
| `indoor-maps-enabled="true"` | Activa los planos de interiores |
| `show-my-location-button="true"` | Botón para centrar en la ubicación del usuario |
| `show-user-location="true"` | Muestra la posición del usuario en el mapa |
| `show-zoom-buttons="true"` | Muestra botones de zoom |
| `show-google-buttons="true"` | Muestra controles nativos de Google Maps |
| `zoom-to-pois="true"` | Ajusta el zoom para que entren todos los marcadores |
| `zoom-to-my-location="false"` | Hace zoom a la posición del usuario al cargar |
| `clear-lines-on-refresh="false"` | Mantiene las lineas dibujadas al refrescar |
| `restrict-map-to-bounds="lat1,lon1,lat2,lon2"` | Restringe el área visible del mapa a unas coordenadas |
| `cluster-markers="true"` | Agrupa marcadores cercanos en un cluster |
| `show-pois="true"` | Muestra los puntos de interes |

#### Atributos de la coleccion de datos mapview

| Atributo en prop | Descripción |
|------------------|-------------|
| `mapview-latitude="true"` | Este campo contiene la latitud del marcador |
| `mapview-longitude="true"` | Este campo contiene la longitud del marcador |
| `mapview-address="true"` | Este campo contiene la dirección a mostrar en el popup |
| `mapview-marker-icon="true"` | Este campo contiene el nombre del icono PNG del marcador |

#### Eventos del mapa (JavaScript)

| Evento | Cuando se dispara |
|--------|-------------------|
| `onmapready="onMapReady(e);"` | El mapa esta listo para usarse |
| `onmapclicked="onMapClicked(e);"` | El usuario toca el mapa (coordenadas en `e.latitude`, `e.longitude`) |
| `onmaplongclicked="onMapLongClicked(e);"` | Pulsacion larga sobre el mapa |
| `onmarkerdragend="onMarkerDraggedEnd(e);"` | Se suelta un marcador arrastrado |
| `onlocationready="onLocationReady(e);"` | La localización del usuario esta disponible |
| `onlocationchanged="onLocationChanged(e);"` | Cambia la localización del usuario |
| `onmapzoomchanged="onMapZoomChanged(e);"` | Cambia el nivel de zoom |
| `ondistancemeter="onDistanceMeter(e);"` | Resultado de medición de distancia |

#### Métodos JavaScript sobre el control de mapa

```javascript
// Obtener el control del mapa
var window = ui.getView(self);
var mapControl = window["@mapaClientes"];

// Zoom a coordenadas
mapControl.zoomTo(38.886546, -7.0043193);

// Zoom a todos los POIs
mapControl.zoomToBounds(["lat1,lon1", "lat2,lon2"]);

// Dibujar una línea entre dos puntos
mapControl.drawLine("miLinea", "#FF0000", "solid", 38.88, -7.00, 40.41, -3.70);

// Borrar todas las lineas
mapControl.clearAllLines();

// Cambiar tipo de mapa
mapControl.setMapType("satellite"); // normal, satellite, terrain, hybrid

// Estilo JSON de Google (en línea o nombre de fichero de la app; vacío/nulo restablece el defecto)
mapControl.setMapStyle("estilo_mapa.json");

// Capa de tráfico
mapControl.setTrafficEnabled(true);

// Padding del mapa en píxeles (reserva espacio para controles superpuestos)
mapControl.setMapPadding(0, 200, 0, 0);

// Activar seguimiento del usuario
mapControl.setFollowUserLocation(true);

// Medir distancia entre dos puntos (devuelve metros)
var nMetros = new GpsTools().distanceTo([
    { latitude: 38.8685452, longitude: -6.8170906 },
    { latitude: 40.4167747, longitude: -3.70379019 }
]);
```

#### OpenStreetMap — atributos adicionales

```xml
<prop name="@mapaOSM"
      type="Z"
      viewmode="openstreetmap"
      contents="mapaOSM"
      width="100%"
      height="70%"
      show-compass="true"
      show-minimap="true"
      show-scale="true"
      follow-location-on-background="true"
      tile-source="mapnik_hd"
      zoom-buttons-visibility="never"
      onmapclicked="onMapClicked(e);" />
```

| Atributo exclusivo OSM | Descripción |
|------------------------|-------------|
| `show-minimap="true"` | Muestra un minimapa de referencia |
| `show-scale="true"` | Muestra la escala del mapa |
| `follow-location-on-background="true"` | Sigue la localización aunque la app este en segundo plano |
| `tile-source="mapnik_hd"` | Fuente de tiles del mapa |
| `zoom-buttons-visibility` | `always`, `never`, `touch` |

---

### 7.13b ViewMode: calendarview

**Cuando usarlo:** agendas de citas, planificacion de tareas, calendarios de visitas, horarios.

El calendario se define como un `prop type="Z"` con `viewmode="calendarview"`. Puede mostrarse en vista mensual (por defecto) o semanal con `calendar-viewmode="week"`.

#### Declaración del prop tipo calendarview

```xml
<frame name="frmCalendario" width="100%" height="30%" bgcolor="#273238" align="center">
    <prop name="@MiCalendario" type="Z"
          viewmode="calendarview"
          calendar-viewmode="month"
          contents="MiCalendario"
          class="z_calendario"
          width="90%" height="100%" />
    <contents name="MiCalendario" src="ContentDatosCalendario" />
</frame>
```

#### Coleccion de datos del calendario

```xml
<coll name="ContentDatosCalendario" title="calendario"
      sql="SELECT t1.*,
           t1.FECHA AS MAP_FECHA,
           t1.DESCRIPCION AS MAP_DESCRIPCION,
           CASE WHEN t1.TIPO='Urgente' THEN '#FF5722'
                WHEN t1.TIPO='Normal'  THEN '#2196F3'
                ELSE '#4CAF50'
           END AS MAP_COLORVIEW
           FROM ##PREF##tareas t1"
      objname="tareas" updateobj="tareas"
      progid="ASData.CASBasicDataObj">
    <group name="General" id="1">
        <!-- Campos en modo grid/lista del calendario (visible="4") -->
        <frame name="frmgrid" width="100%">
            <prop name="MAP_FECHA" type="D" visible="4" labelwidth="0"
                  width="200p" text-align="center" textfont-size="8" />
            <prop name="MAP_DESCRIPCION" type="T" visible="4" labelwidth="0"
                  width="520p" text-align="center" textfont-size="8" newline="false" />
        </frame>
        <!-- Formulario de edicion (visible="1") -->
        <prop name="FECHA" type="D" visible="1"
              datefrom="true" dateto="true" title="Fecha:" />
        <prop name="HORAINI" type="TT" mask="Hh#:#Mm" visible="1"
              timefrom="true" title="Hora Inicio:" />
        <prop name="HORAFIN" type="TT" mask="Hh#:#Mm" visible="1"
              timeto="true" title="Hora Fin:" />
        <prop name="DESCRIPCION" type="T" visible="1" title="Descripción:" lines="3" />
        <!-- colorview=true: el valor de este campo se usa como color de la celda del dia -->
        <prop name="MAP_COLORVIEW" type="T" visible="0" colorview="true" />
    </group>
</coll>
```

> `colorview="true"` hace que el valor del campo se use como color de la celda del día en el calendario. `datefrom="true"` y `dateto="true"` en el campo `FECHA` definen el rango de días del evento.

#### Atributos de estilo del calendarview

| Atributo | Descripción |
|----------|-------------|
| `calendar-viewmode` | `"month"` (por defecto) o `"week"` para vista semanal |
| `page-swipe` | `true` permite deslizar entre meses/semanas con el dedo |
| `bgcolor` | Color de fondo general del calendario |
| `forecolor` | Color del texto general |
| `cell-bgcolor` | Color de fondo de las celdas de días |
| `cell-forecolor` | Color del texto de los días |
| `cell-border-width` | Grosor del borde de cada celda |
| `cell-border-color` | Color del borde de cada celda |
| `cell-align` | Alineacion del contenido de cada celda |
| `cell-selected-bgcolor` | Color de fondo del día seleccionado |
| `cell-selected-forecolor` | Color del texto del día seleccionado |
| `cell-selected-border-color` | Color del borde del día seleccionado |
| `cell-other-month-bgcolor` | Color de días de otros meses visibles en la vista actual |
| `weekdays-bgcolor` | Color de fondo de la fila de nombres de día |
| `weekdays-forecolor` | Color del texto de los nombres de día (admite 7 colores separados por comas: Dom,Lun,Mar,Mie,Jue,Vie,Sab) |
| `weekdays-fontsize` | Tamaño de fuente de los nombres de día |
| `weekdays-longname` | `true` nombre largo ("Lunes"), `false` nombre corto ("L") |
| `week-start-hour` | Hora de inicio en vista semanal (0-23) |
| `week-end-hour` | Hora de fin en vista semanal (0-23) |
| `border` | `false` elimina el borde exterior |
| `textfont-bold` | `true` texto en negrita |

#### Clase CSS de ejemplo

```css
.z_calendario {
    extends: prop;
    cell-border-width: 0;
    cell-align: center;
    align: center;
    fontsize: 11;
    forecolor: #FFFFFF;
    bgcolor: #273238;
    cell-forecolor: #FFFFFF;
    cell-bgcolor: #273238;
    cell-other-month-bgcolor: #777777;
    cell-selected-forecolor: #FABB00;
    cell-selected-bgcolor: #FFFFFF;
    cell-border-color: #273238;
    weekdays-bgcolor: #00000000;
    weekdays-forecolor: #FFFFFF;
    weekdays-fontsize: 5;
    weekdays-longname: false;
    weekdays-align: top|left;
    border-width: 3;
    textfont-bold: true;
    page-swipe: false;
    border: false;
    week-start-hour: 0;
    week-end-hour: 1;
}
```

#### Eventos del calendario (en la coleccion de datos)

| Evento | Parámetros | Cuando se dispara |
|--------|------------|-------------------|
| `ondateselected` | `DATEVALUE`, `TIMEVALUE`, `EVENTVALUE` | El usuario toca un día |
| `onpageselected` | `DATEVALUE`, `CURRENT`, `DATEFROM`, `TOTALDAYS` | El usuario cambia de mes o semana |
| `oncelldraw` | `CELLDATE` | Se pinta cada celda (usar con precaucion, puede ser lento) |

```xml
<ondateselected refresh="true" show-wait-dialog="false"
                refresh-owner="MAP_FECHA,MAP_MES,MAP_ANO">
    <action name="runscript">
        <param name="DATEVALUE" />
        <param name="TIMEVALUE" />
        <param name="EVENTVALUE" />
        <script language="javascript">
            var meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                         "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
            selfDataColl.getOwnerObject().MAP_FECHA = DATEVALUE;
            selfDataColl.getOwnerObject().MAP_MES = meses[DATEVALUE.getMonth()].toUpperCase();
            selfDataColl.getOwnerObject().MAP_ANO = DATEVALUE.getFullYear().toString();
        </script>
    </action>
</ondateselected>

<onpageselected refresh="true" show-wait-dialog="false"
                refresh-owner="MAP_FECHA,MAP_MES,MAP_ANO">
    <action name="runscript">
        <param name="DATEVALUE" />
        <param name="CURRENT" />
        <param name="DATEFROM" />
        <param name="TOTALDAYS" />
        <script language="javascript">
            var meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                         "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
            selfDataColl.getOwnerObject().MAP_FECHA = DATEVALUE;
            selfDataColl.getOwnerObject().MAP_MES = meses[DATEVALUE.getMonth()].toUpperCase();
            selfDataColl.getOwnerObject().MAP_ANO = DATEVALUE.getFullYear().toString();
        </script>
    </action>
</onpageselected>
```

#### Control por JavaScript

```javascript
// Navegar al mes anterior
self.getContents("MiCalendario").setVariable("moveto", "prev");

// Navegar al mes siguiente
self.getContents("MiCalendario").setVariable("moveto", "next");
```

---



```xml
<coll name="ListaProductos"
      sql="SELECT * FROM ##PREF##Productos"
      objname="Productos" loadall="true">

    <!-- Filtro de busqueda nativo -->
    <asfilter fontsize="8" left="12" sort="false">
        <field name="NOMBRE" fldname="NOMBRE"
               oper="##FLD## LIKE '##VAL##%'" width="15"
               tooltip="Buscar por nombre">NOMBRE</field>
        <field name="CODIGO" fldname="CODIGO"
               oper="##FLD## LIKE '##VAL##%'" width="10"
               tooltip="Buscar por código" newline="false">CODIGO</field>
    </asfilter>

    <group name="Lista" id="1">
        <!-- contenido de la lista -->
    </group>
</coll>
```

**Atributos del nodo `<asfilter>`:**

| Atributo | Descripción |
|----------|-------------|
| `fontsize` | Tamaño de fuente de los campos del filtro |
| `left` | Margen izquierdo del filtro |
| `sort` | Habilita ordenamiento (`true`/`false`) |

**Atributos de `<field>` dentro de `<asfilter>`:**

| Atributo | Descripción |
|----------|-------------|
| `name` | Nombre del campo de filtro |
| `fldname` | Nombre del campo real en la tabla |
| `oper` | Operador SQL. Usa `##FLD##` para el campo y `##VAL##` para el valor ingresado |
| `width` | Ancho del campo de filtro |
| `tooltip` | Texto de ayuda |
| `newline` | Si es `false`, se coloca en la misma linea que el anterior |

> **Regla de generación:** Usar `<asfilter>` cuando la lista tenga muchos registros y el usuario necesite busqueda rápida. Para busquedas más personalizadas (con botón y lógica JS), usar el patron de filtrado con `ontextchanged` y `coll.setFilter()` mostrado en la sección 7.7.

