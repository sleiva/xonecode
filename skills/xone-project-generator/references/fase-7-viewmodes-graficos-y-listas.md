# Generación XOne — Fase 7: viewmodes de gráficos y listas

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` L3977–4651. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §7.13c gráficos (barchart, piechart, linechart) · §7.13d picturemap · §7.13e slideview · §7.13f expanview · §7.13g gridview · §7.13h patrón contentselitem

---

### 7.13c ViewMode: Gráficos (barchart, piechart, linechart...)

**Cuando usarlo:** dashboards con KPIs, estadisticas de ventas, distribución de datos por categorías, evoluciones temporales.

Los gráficos en XOne se implementan como un `prop type="Z"` con `viewmode` especificando el tipo de gráfico. Requieren que la coleccion de datos tenga un campo marcado con `classid="XOneCharts"` en el prop, o que el propio prop lo declare.

#### Tipos de gráfico disponibles

| viewmode | Tipo | Cuando usarlo |
|----------|------|---------------|
| `barchart` | Barras verticales | Comparacion de valores entre categorías |
| `3dbarchart` | Barras 3D | Igual que barchart con efecto visual 3D |
| `linechart` | Lineas | Evolución de valores en el tiempo |
| `xylinechart` | Lineas XY | Relación entre dos variables numéricas |
| `areachart` | Área rellena | Tendencias acumuladas, volúmenes |
| `piechart` | Tarta | Distribución porcentual de categorías |
| `piechart2` | Tarta alternativa | Variante visual del piechart |
| `timeserieschart` | Series temporales | Datos con eje temporal preciso (sensores, IoT) |
| `slidingbarchart` | Barras con scroll | Muchas categorías con navegación horizontal |

#### Estructura general — prop y contents

```xml
<!-- Prop que muestra el gráfico -->
<prop name="@GraficoVentas"
      type="Z"
      viewmode="barchart"
      classid="XOneCharts"
      contents="GraficoVentas"
      width="100%"
      height="300p"
      locked="true" />

<contents name="GraficoVentas" src="ContentGraficoVentas" />
```

#### Coleccion de datos del gráfico

La coleccion que alimenta el gráfico debe tener campos con atributos especiales que indican al framework que rol tiene cada campo:

```xml
<coll name="ContentGraficoVentas" title="gráfico ventas"
      sql="SELECT t1.MES, t1.TOTAL_VENTAS, t1.TOTAL_COSTES
           FROM ##PREF##ventas_mensuales t1"
      objname="ventas_mensuales" updateobj="ventas_mensuales"
      progid="ASData.CASBasicDataObj" loadall="true">
    <group name="General" id="1">
        <!-- chart-label=true: este campo es la etiqueta del eje X (categorias) -->
        <prop name="MES" type="T" visible="4" chart-label="true" />
        <!-- chart-value=true: este campo es el valor a graficar (eje Y) -->
        <prop name="TOTAL_VENTAS" type="N2" visible="4"
              chart-value="true" chart-series="Ventas" />
        <!-- Multiples series: un prop chart-value por cada serie -->
        <prop name="TOTAL_COSTES" type="N2" visible="4"
              chart-value="true" chart-series="Costes" />
    </group>
</coll>
```

#### Atributos clave de los props en la coleccion del gráfico

| Atributo | Descripción |
|----------|-------------|
| `chart-label="true"` | Este campo es la etiqueta del eje X (nombre de la categoría) |
| `chart-value="true"` | Este campo es el valor numérico a representar en el gráfico |
| `chart-series="NombreSerie"` | Nombre de la serie en el gráfico (aparece en la leyenda) |
| `chart-color="#RRGGBB"` | Color de la barra/linea/sector de esta serie |

#### Ejemplos por tipo de gráfico

**Barchart — comparacion de ventas por mes:**

```xml
<prop name="@GraficoBarras" type="Z" viewmode="barchart"
      classid="XOneCharts" contents="GraficoBarras"
      width="100%" height="350p" locked="true" />
<contents name="GraficoBarras" src="ContentVentasMes" />
```

**Piechart — distribución porcentual:**

```xml
<prop name="@GraficoPie" type="Z" viewmode="piechart"
      classid="XOneCharts" contents="GraficoPie"
      width="100%" height="300p" locked="true" />
<contents name="GraficoPie" src="ContentDistribucion" />
```

```xml
<!-- Coleccion para piechart: una fila por sector -->
<coll name="ContentDistribucion" title="distribucion"
      sql="SELECT CATEGORIA, TOTAL FROM ##PREF##distribucion"
      objname="distribucion" updateobj="distribucion"
      progid="ASData.CASBasicDataObj" loadall="true">
    <group name="General" id="1">
        <prop name="CATEGORIA" type="T" visible="4" chart-label="true" />
        <prop name="TOTAL" type="N2" visible="4" chart-value="true" />
    </group>
</coll>
```

**Linechart — evolución temporal:**

```xml
<prop name="@GraficoLinea" type="Z" viewmode="linechart"
      classid="XOneCharts" contents="GraficoLinea"
      width="100%" height="300p" locked="true" />
<contents name="GraficoLinea" src="ContentEvolucion" />
```

#### Regla de decisión para elegir tipo de gráfico

```
El usuario pide...                     -> Usar
"comparar ventas por categoría"        -> barchart o 3dbarchart
"ver evolucion en el tiempo"           -> linechart o timeserieschart
"distribucion porcentual"              -> piechart o piechart2
"comparar dos variables numericas"     -> xylinechart
"volumen acumulado"                    -> areachart
"muchas categorias con scroll"         -> slidingbarchart
```

---

### 7.13d ViewMode: picturemap

**Cuando usarlo:** planos de instalaciones, mapas de planta de un edificio, esquemas de infraestructura, cualquier imagen sobre la que se quieran colocar marcadores en coordenadas fijas.

A diferencia de `mapview` (que usa Google Maps o OpenStreetMap con coordenadas GPS), `picturemap` superpone marcadores sobre una **imagen estática** propia. Las coordenadas son en pixeles relativos a esa imagen, no coordenadas geograficas.

#### Declaración del prop tipo picturemap

```xml
<frame name="frmPictureMap" width="700p" height="700p"
       lmargin="10p" tmargin="20p" framebox="true">
    <prop name="@PictureMapData"
          type="Z"
          viewmode="picturemap"
          contents="PictureMapData"
          imgbk="mapa-planta.png"
          ignore-touch-in-transparent-area="true"
          width="100%"
          height="100%" />
    <contents name="PictureMapData" src="ContentPictureMapData" />
</frame>
```

#### Coleccion de datos del picturemap

Cada registro de la coleccion representa un marcador en el mapa. Los campos con atributos especiales indican al framework el rol de cada campo:

```xml
<coll name="ContentPictureMapData" title="PictureMapData"
      sql="SELECT t1.* FROM ##PREF##puntos_mapa t1"
      objname="puntos_mapa" updateobj="puntos_mapa"
      progid="ASData.CASBasicDataObj" loadall="true">
    <group name="General" id="1">
        <prop name="CODIGO" type="T" visible="0" />
        <!-- Texto mostrado en el popup al pulsar el marcador -->
        <prop name="TITULO" type="T" visible="4" />
        <prop name="DESCRIPCION" type="T" visible="4" />
        <prop name="ESTADO" type="T" visible="4" />
        <!-- xcoord=true: coordenada X del marcador en pixeles sobre la imagen -->
        <prop name="XCOORD" type="N" visible="4" xcoord="true" />
        <!-- ycoord=true: coordenada Y del marcador en pixeles sobre la imagen -->
        <prop name="YCOORD" type="N" visible="4" ycoord="true" />
        <!-- icon-big=true: icono grande que se muestra en el popup al seleccionar -->
        <prop name="ICONBIG" type="T" visible="4" icon-big="true"
              width="126" height="168" size="250" />
        <!-- circle-radius=true: radio del circulo de zona alrededor del marcador -->
        <prop name="RADIO" type="N" visible="4" circle-radius="true" />
        <!-- icon-mark=true: icono del marcador en estado normal (sin pulsar) -->
        <prop name="ICONOFF" type="T" visible="4" icon-mark="true"
              width="126" height="168" size="250" />
        <!-- icon-touch=true: icono del marcador al estar seleccionado/pulsado -->
        <prop name="ICONON" type="T" visible="4" icon-touch="true"
              width="126" height="168" size="250" />
    </group>

    <!-- Al seleccionar un marcador: pasar datos al objeto padre -->
    <selecteditem show-wait-dialog="false" refresh="false">
        <action name="runscript">
            <script language="javascript">
                var parent = self.getOwnerCollection().getOwnerObject();
                parent.MAP_ID = self.ID;
                parent.MAP_NOMBRE = self.TITULO;
                parent.MAP_DESCRIPCION = self.DESCRIPCION;
                ui.getView(parent).refresh("MAP_NOMBRE,MAP_DESCRIPCION");
            </script>
        </action>
    </selecteditem>
</coll>
```

#### Atributos del prop picturemap

| Atributo | Descripción |
|----------|-------------|
| `imgbk="archivo.png"` | Imagen de fondo sobre la que se colocan los marcadores |
| `ignore-touch-in-transparent-area="true"` | Ignora toques en zonas transparentes de la imagen |
| `viewmode="picturemap"` | Activa el modo mapa de imagen |

#### Atributos especiales en los props de la coleccion de datos

| Atributo en prop | Tipo de campo | Descripción |
|------------------|---------------|-------------|
| `xcoord="true"` | `N` | Coordenada X del marcador en pixeles sobre la imagen |
| `ycoord="true"` | `N` | Coordenada Y del marcador en pixeles sobre la imagen |
| `icon-mark="true"` | `T` | Nombre del fichero PNG del icono en estado normal |
| `icon-touch="true"` | `T` | Nombre del fichero PNG del icono al estar seleccionado |
| `icon-big="true"` | `T` | Nombre del fichero PNG del icono grande en el popup |
| `circle-radius="true"` | `N` | Radio en pixeles del circulo de zona alrededor del marcador |

> **NOTA:** Los valores de `XCOORD` e `YCOORD` son coordenadas en pixeles relativas a la imagen definida en `imgbk`. No son coordenadas GPS.

---

### 7.13e ViewMode: slideview

**Cuando usarlo:** carruseles de imágenes, banners promocionales, onboarding de la app, presentaciones de productos, galería de fotos navegable una a una.

El slideview muestra los registros de uno en uno y permite desplazarse entre ellos con un gesto horizontal (o vertical). Si el ancho del prop es menor que el ancho de pantalla, pueden verse varios registros a la vez.

#### Declaración del prop tipo slideview

```xml
<prop name="@MiSlider"
      type="Z"
      viewmode="slideview"
      contents="MiSlider"
      width="100%"
      height="400p"
      slide-circular="true"
      autoslide-delay="5"
      forceonchange="true"
      onchange="refresh(@MiSlider)" />
<contents name="MiSlider" src="ContentSlider" />
```

#### Coleccion de datos del slideview

Cada registro es una "diapositiva". Los campos con `visible="4"` se muestran en el slide. Los campos con `visible="1"` se muestran al editar el registro.

```xml
<coll name="ContentSlider" title="slider"
      sql="SELECT t1.* FROM ##PREF##banners t1"
      objname="banners" updateobj="banners"
      progid="ASData.CASBasicDataObj"
      loadall="true"
      notab="true">
    <group name="General" id="1">
        <!-- Contenido de cada slide -->
        <prop name="IMAGEN" type="IMG" visible="4"
              width="100%" height="400p" labelwidth="0" locked="true" />
        <prop name="TITULO" type="T" visible="4"
              labelwidth="0" locked="true"
              text-align="center" fontsize="16" />
        <prop name="DESCRIPCION" type="T" visible="4"
              labelwidth="0" locked="true" lines="2"
              text-align="center" fontsize="12" />
    </group>

    <!-- auto-selecteditem: se ejecuta en cada cambio automático de slide -->
    <auto-selecteditem refresh="false" show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">
                // self = objeto del slide que se esta mostrando
                // lógica al pasar al siguiente slide automaticamente
            </script>
        </action>
    </auto-selecteditem>

    <!-- selecteditem: se ejecuta cuando el usuario toca un slide -->
    <selecteditem refresh="false" show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">
                // Acción al pulsar un slide
                ui.showToast("Slide seleccionado: " + self.TITULO);
            </script>
        </action>
    </selecteditem>
</coll>
```

#### Atributos del prop slideview

| Atributo | Descripción |
|----------|-------------|
| `slide-circular="true"` | Al llegar al último slide vuelve al primero automáticamente |
| `autoslide-delay="N"` | Segundos entre cambios automáticos de slide. Sin este atributo no hay autoplay |
| `forceonchange="true"` | Fuerza el refresco al cambiar de slide |
| `orientation` | `horizontal` (por defecto) o `vertical` para desplazamiento vertical |

#### Eventos del slideview (en la coleccion de datos)

| Evento | Cuando se dispara |
|--------|-------------------|
| `selecteditem` | El usuario pulsa sobre un slide |
| `auto-selecteditem` | Cambia automáticamente al siguiente slide (solo con `autoslide-delay`) |

> **Diferencia clave entre eventos:** `selecteditem` requiere interaccion del usuario. `auto-selecteditem` se dispara con el autoplay sin interaccion.

#### Patron típico — Galería de imágenes con indicador de posición

```xml
<!-- En la coleccion padre -->
<prop name="MAP_SLIDE_ACTUAL" type="N" visible="0" />

<prop name="@Galeria" type="Z" viewmode="slideview"
      contents="Galeria" width="100%" height="300p"
      slide-circular="false" forceonchange="true"
      onchange="refresh(@Galeria)" />
<contents name="Galeria" src="ContentGaleria"
          filter="IDPRODUCTO=##FLD_ID##" />
```

```xml
<!-- En ContentGaleria: al seleccionar actualiza el indicador en el padre -->
<selecteditem refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            var idx = self.getOwnerCollection().getObjectIndex(self);
            var total = self.getOwnerCollection().count();
            self.getOwnerCollection().getOwnerObject().MAP_SLIDE_ACTUAL = (idx + 1);
        </script>
    </action>
</selecteditem>
```

---

### 7.13f ViewMode: expanview

**Cuando usarlo:** árboles de categorías, estructuras padre-hijo, FAQs expandibles, organigramas, menus jerarquicos, cualquier dato con niveles anidados.

El expanview muestra una lista donde cada elemento puede expandirse para mostrar sus hijos. Requiere dos colecciones: la **coleccion padre** (nivel raiz) y la **coleccion hija** (elementos anidados). La coleccion hija se define como un `contents` embebido dentro de la coleccion padre.

#### Estructura general

```
prop type="Z" viewmode="expanview"
    └── ContentPadre (coleccion raiz, filter="IDPADRE IS NULL")
            └── prop type="Z" contents="ContentHijo"  (embebido en ContentPadre)
                    └── ContentHijo (filter="IDPADRE=##FLD_ID##")
```

#### Paso 1 — Declarar el prop en la pantalla

```xml
<frame name="frmArbol" width="98%" height="90%"
       framebox="true" border-corner-radius="10" lmargin="1%">
    <prop name="@ContentPadre"
          type="Z"
          viewmode="expanview"
          contents="ContentPadre"
          height="90%"
          visible="1" />
    <contents name="ContentPadre" src="ContentPadre"
              autofocus="true"
              filter="IDPADRE IS NULL" />
</frame>
```

> `filter="IDPADRE IS NULL"` carga solo los nodos raiz. Los hijos se cargan dinámicamente al expandir cada nodo.

#### Paso 2 — Coleccion padre con contents hijo embebido

```xml
<coll name="ContentPadre" title="arbol padre"
      sql="SELECT t1.*,
           t1.ICONO AS MAP_ICON,
           (SELECT COUNT(ID) FROM ##PREF##categorias
            WHERE IDPADRE = t1.ID) AS MAP_NUM_HIJOS
           FROM ##PREF##categorias t1"
      objname="categorias" updateobj="categorias"
      progid="ASData.CASBasicDataObj"
      edit-inrow="false" loadall="true" notab="true">

    <group name="General" id="1">
        <frame name="frmNodoPadre" width="100%" bgcolor="#FFFFFF">
            <prop name="MAP_ICON" type="IMG" visible="4"
                  lmargin="20p" tmargin="20p" bmargin="20p"
                  width="80p" height="80p" />
            <prop name="NOMBRE" type="T" visible="4"
                  textfont-bold="true" class="classgrid"
                  align="left|center" width="490p" height="80p"
                  newline="false" tmargin="20p" bmargin="20p" />
            <prop name="MAP_NUM_HIJOS" type="T" visible="4"
                  text-forecolor="#666666" textfont-size="5"
                  class="classgrid" align="left|center"
                  width="110p" height="80p" newline="false"
                  tmargin="20p" bmargin="20p" />
        </frame>

        <!-- Contents hijo embebido dentro del padre -->
        <prop name="@ContentHijo" type="Z" visible="1"
              contents="ContentHijo" />
        <contents name="ContentHijo" src="ContentHijo"
                  filter="IDPADRE=##FLD_ID##" />
    </group>

    <!-- onexpand: se ejecuta al expandir un nodo padre -->
    <onexpand refresh="false">
        <action name="runscript">
            <script language="javascript">
                // Refrescar la fila del padre al expandir
                ui.refreshContentRow("ContentPadre",
                    self.getOwnerCollection().getObjectIndex(self));
            </script>
        </action>
    </onexpand>

    <!-- oncollapse: se ejecuta al colapsar un nodo padre -->
    <oncollapse refresh="false">
        <action name="runscript">
            <script language="javascript">
                ui.refreshContentRow("ContentPadre",
                    self.getOwnerCollection().getObjectIndex(self));
            </script>
        </action>
    </oncollapse>
</coll>
```

> **Los eventos `onexpand` y `oncollapse` son obligatorios** para que el árbol funcione correctamente y se actualice visualmente al abrir y cerrar nodos.

#### Paso 3 — Coleccion hija

La coleccion hija se define de forma independiente. El campo FK (`IDPADRE`) enlaza con el padre. El filter del `<contents>` usa `##FLD_ID##` para obtener el ID del nodo padre expandido.

```xml
<coll name="ContentHijo" title="arbol hijo"
      sql="SELECT t1.* FROM ##PREF##categorias t1"
      objname="categorias" updateobj="categorias"
      progid="ASData.CASBasicDataObj"
      loadall="true" notab="true">

    <group name="General" id="1">
        <frame name="frmNodoHijo" width="640p" lmargin="80p"
               bgcolor="#FFFFFF">
            <prop name="NOMBRE" type="T" visible="4"
                  textfont-bold="true" text-forecolor="#666666"
                  class="classgrid" lmargin="20p" tmargin="20p" />
            <prop name="DESCRIPCION" type="T" visible="4"
                  class="classgrid" lmargin="30p" bmargin="20p"
                  text-forecolor="#666666" textfont-size="5"
                  lines="2" fixed-lines="true" />
            <!-- FK al padre -->
            <prop name="IDPADRE" type="N" visible="0"
                  mapcol="ContentPadre" mapfld="ID" />
        </frame>
    </group>

    <!-- selecteditem: acción al pulsar un nodo hijo -->
    <selecteditem refresh="false" show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">
                // Navegar al detalle del elemento seleccionado
                ui.openEditView(self);
            </script>
        </action>
    </selecteditem>
</coll>
```

#### Atributos del prop expanview

| Atributo | Descripción |
|----------|-------------|
| `viewmode="expanview"` | Activa el modo árbol expandible |
| `autofocus="true"` | En el `<contents>` del nivel raiz — el primer nodo recibe el foco al cargar |
| `filter="IDPADRE IS NULL"` | En el `<contents>` del nivel raiz — carga solo los nodos sin padre |
| `filter="IDPADRE=##FLD_ID##"` | En el `<contents>` hijo — filtra los hijos del nodo padre expandido |

#### Eventos del expanview (en la coleccion padre)

| Evento | Cuando se dispara |
|--------|-------------------|
| `onexpand` | El usuario expande un nodo padre para ver sus hijos |
| `oncollapse` | El usuario colapsa un nodo padre ocultando sus hijos |

#### Regla: árboles de más de dos niveles

Para árboles de tres o más niveles, la coleccion hija puede a su vez contener otro `<contents>` con su propia coleccion nieta, siguiendo el mismo patron. Cada nivel usa `##FLD_ID##` para filtrar sus hijos respecto al nivel superior.

---

### 7.13g ViewMode: gridview

**Cuando usarlo:** galerías de fotos, catálogos de productos con imagen, colecciones de recursos visuales donde se quiere mostrar varios elementos por fila en cuadricula.

El `gridview` muestra los registros en una cuadricula de N columnas, similar a la galería de fotos del dispositivo. Se controla el número de columnas con `gallery-columns`.

#### Declaración del prop tipo gridview

```xml
<prop name="@ContentFotos"
      type="Z"
      viewmode="gridview"
      gallery-columns="4"
      contents="ContentFotos"
      width="90%"
      height="-2"
      lmargin="5%"
      locked="true"
      show-no-data="true"
      no-data-text="No hay fotos. Pulse + para añadir."
      no-data-fontsize="8"
      onchange="refresh" />
<contents name="ContentFotos" src="ContentFotosSrc"
          filter="IDSOLICITUD=##FLD_ID##" />
```

#### Coleccion de datos del gridview

Cada registro ocupa una celda de la cuadricula. Los campos con `visible="4"` se muestran en cada celda.

```xml
<coll name="ContentFotosSrc" title="fotos"
      sql="SELECT t1.* FROM ##PREF##fotos t1"
      objname="fotos" updateobj="fotos"
      progid="ASData.CASBasicDataObj"
      loadall="true" notab="true">
    <group name="General" id="1">
        <!-- Imagen que se muestra en la celda de la cuadricula -->
        <prop name="FOTO" type="IMG" visible="4"
              width="100%" height="100%"
              labelwidth="0" locked="true"
              keep-aspect-ratio="true" />
        <!-- Etiqueta opcional bajo la imagen -->
        <prop name="NOMBRE" type="T" visible="4"
              labelwidth="0" locked="true"
              text-align="center" textfont-size="5" />
    </group>
</coll>
```

#### Atributos del prop gridview

| Atributo | Descripción |
|----------|-------------|
| `gallery-columns` | Número de columnas de la cuadricula. Ej: `"3"`, `"4"` |
| `orientation` | `horizontal` (por defecto) o `vertical` |
| `show-no-data` | `true` muestra un mensaje cuando no hay datos |
| `no-data-text` | Texto a mostrar cuando el contents esta vacio |
| `no-data-fontsize` | Tamaño de fuente del texto de sin datos |

#### Patron típico — galería con FAB para añadir

```xml
<!-- Galeria -->
<prop name="@GaleriaFotos" type="Z" viewmode="gridview"
      gallery-columns="3" contents="GaleriaFotos"
      width="100%" height="-2" locked="true"
      show-no-data="true"
      no-data-text="Pulse + para añadir fotos" />
<contents name="GaleriaFotos" src="ContentFotosSrc"
          filter="IDREGISTRO=##FLD_ID##" />

<!-- Botón flotante para añadir fotos (FAB) -->
<frame name="frmFAB" floating="true" top="900p" left="610p"
       width="90p" height="90p">
    <prop name="BTN_ADD" type="B" visible="1" labelwidth="0"
          method="ExecuteNode(nuevaFoto)"
          width="75p" img="add.png" imgsel="add_click.png" />
</frame>
```

---

### 7.13h Patron: contentselitem (selecteditem sin navegación)

**Cuando usarlo:** listas donde al tocar un elemento se muestran sus datos en la misma pantalla sin abrir una ventana nueva. Útil para paneles maestro-detalle, selectores de elemento activo, listas con preview.

Este no es un `viewmode` distinto — es un **patron de uso** del contents normal (grid por defecto) combinado con `<selecteditem>` en la coleccion hija y `cell-selected-bgcolor` para resaltar la fila seleccionada.

#### Estructura del patron

```xml
<!-- En la coleccion padre: campos para mostrar el elemento seleccionado -->
<prop name="MAP_NOMBRESEL" type="T" visible="1"
      labelwidth="0" class="classTsinborde" />
<prop name="MAP_LINEASEPARAR" type="B" visible="1"
      disablevisible="MAP_NOMBRESEL=''"
      bgcolor="#333333" labelwidth="0"
      width="300p" height="5p" locked="true" />

<!-- Botones de acción flotantes — solo visibles cuando hay selección -->
<frame name="frmAcciones" floating="true"
       top="75p" left="550p" width="200p" height="120p"
       disablevisible="MAP_NOMBRESEL=''">
    <prop name="BTN_EDITAR" type="B" visible="1" labelwidth="0"
          method="ExecuteNode(editar)" width="75p"
          img="ok.png" imgsel="ok_click.png" />
    <prop name="BTN_BORRAR" type="B" visible="1" labelwidth="0"
          method="ExecuteNode(eliminar)" width="75p"
          img="delete.png" imgsel="delete_click.png"
          newline="false" lmargin="6p" />
</frame>

<!-- Contents con edicion desactivada — el selecteditem gestiona la selección -->
<prop name="@content" type="Z" contents="content"
      disableedit="1=1"
      height="70%" width="100%"
      bgcolor="#FFFFFF" />
<contents name="content" src="ContentDatosSelItem" />
<prop name="MAP_IDSELECCIONADO" visible="0" type="N" />
```

#### Coleccion hija con selecteditem y resaltado

```xml
<coll name="ContentDatosSelItem" title="lista"
      sql="SELECT t1.* FROM ##PREF##mapa_datos t1"
      objname="mapa_datos" updateobj="mapa_datos"
      progid="ASData.CASBasicDataObj"
      loadall="true" notab="true"
      cell-even-color="#FFFFFF"
      cell-odd-color="#F2F2F2"
      cell-selected-bgcolor="#C9E5EF">

    <group name="General" id="1">
        <prop name="IMAGEN" type="IMG" width="115p" height="118p"
              visible="4" tmargin="2p" lmargin="0" />
        <frame name="frm1" newline="false" width="600p"
               lmargin="5p" height="120p">
            <prop name="NOMBRE" type="T" class="classgrid"
                  visible="4" locked="true" />
            <prop name="DIRECCION" type="T" class="classgrid"
                  text-forecolor="#666666" textfont-size="5"
                  visible="4" locked="true"
                  lines="2" fixed-lines="true" />
        </frame>
    </group>

    <!-- selecteditem: en lugar de abrir el objeto, actualiza campos del padre -->
    <selecteditem
        refresh-owner="MAP_NOMBRESEL,MAP_LINEASEPARAR,frmAcciones"
        show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">
                // getOwnerCollection().getOwnerObject() = objeto padre
                var padre = self.getOwnerCollection().getOwnerObject();
                padre.MAP_NOMBRESEL = self.NOMBRE;
                padre.MAP_IDSELECCIONADO = self.ID;
                // Guardar el indice de la fila seleccionada
                padre.MAP_IDLINEA = self.getOwnerCollection()
                                        .getObjectIndex(self);
            </script>
        </action>
    </selecteditem>
</coll>
```

#### Atributos clave del patron contentselitem

| Atributo | Donde | Descripción |
|----------|-------|-------------|
| `cell-selected-bgcolor="#C9E5EF"` | En `<coll>` | Color de fondo de la fila seleccionada actualmente |
| `disableedit="1=1"` | En el `prop type="Z"` | Desactiva la apertura del objeto al tocar — el `selecteditem` lo gestiona todo |
| `refresh-owner="campo1,campo2"` | En `<selecteditem>` | Lista de campos del padre que se refrescan automáticamente tras la selección |
| `getOwnerCollection().getOwnerObject()` | En el script | Accede al objeto padre desde dentro del `selecteditem` |
| `getOwnerCollection().getObjectIndex(self)` | En el script | Obtiene el índice de la fila seleccionada |

#### Diferencia con edición directa

| Comportamiento | Edición directa (por defecto) | Patron contentselitem |
|----------------|-------------------------------|----------------------|
| Al tocar una fila | Abre el objeto en edición | Actualiza campos del padre |
| `disableedit` | No necesario | `disableedit="1=1"` en el prop Z |
| `selecteditem` | Opcional | **Obligatorio** con la lógica de actualización |
| Navegación | Abre nueva pantalla | Todo en la misma pantalla |

