# XOne CSS — Estilos dinámicos, cascada y componentes

> Fuente: `xone/v2/xone-help-docs/topics/04-css-styling-guide.md` §7–§13. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §7 estilos por estado/valor · §8 referencias ##FLD_CAMPO## · §9 cascada de condiciones de dispositivo y strict-mode · §10 animaciones · §11 gráficos · §12 calendario · §13 mapa

---

## 7. Selectores Condicionales y Dinámicos

### 7.1 Estilos por estado/valor de campo

XOne permite aplicar clases CSS dinámicamente desde JavaScript usando la API `self` para cambiar el aspecto de elementos en función del estado de la aplicación. Aunque no existe un selector condicional CSS puro como `:hover` o `[data-attr]`, los estilos pueden cambiarse en tiempo de ejecución.

**Desde JavaScript, cambiar la clase de un campo:**

```javascript
// En el evento onchange de un campo ESTADO
var estado = self.ESTADO;
var propEstado = ui.getView("badgeEstado");

if (estado == "PENDIENTE") {
    propEstado.className = "badgePendiente";
} else if (estado == "EN_RUTA") {
    propEstado.className = "badgeEnRuta";
} else if (estado == "ENTREGADO") {
    propEstado.className = "badgeEntregado";
}
```

### 7.2 Ejemplo práctico - Colores por estado

En los proyectos reales se definen clases CSS para cada estado posible y se asignan desde JavaScript:

**CSS (proyecto XOneDelivery):**

```css
/* Badge base */
.badgeEstado {
    height: 28p;
    fontsize: 12;
    fontname: Roboto-Bold.ttf;
    forecolor: #FFFFFF;
    text-align: center;
    border-corner-radius: 14;
    lmargin: 10p;
    rmargin: 10p;
}

.badgePendiente {
    extends: .badgeEstado;
    bgcolor: #FFC107;
    forecolor: #212121;
}

.badgeAsignado {
    extends: .badgeEstado;
    bgcolor: #2196F3;
}

.badgeEnRuta {
    extends: .badgeEstado;
    bgcolor: #FF9800;
}

.badgeEnDestino {
    extends: .badgeEstado;
    bgcolor: #9C27B0;
}

.badgeEntregado {
    extends: .badgeEstado;
    bgcolor: #4CAF50;
}

.badgeNoEntregado {
    extends: .badgeEstado;
    bgcolor: #F44336;
}

.badgeCancelado {
    extends: .badgeEstado;
    bgcolor: #9E9E9E;
}
```

**CSS para prioridades (proyecto GestionTareas):**

```css
.prioridadBaja {
    forecolor: #4CAF50;
}

.prioridadMedia {
    forecolor: #FF9800;
}

.prioridadAlta {
    forecolor: #F44336;
}

.prioridadUrgente {
    forecolor: #D32F2F;
    fontbold: true;
}
```

> **Referencia cruzada:** Para ver como manipular clases CSS desde JavaScript, consultar el tópico 03 - API JavaScript.

---

## 8. Referencias Dinámicas a Campos en CSS

### 8.1 Sintaxis `##FLD_NOMBRE_CAMPO##`

XOne permite referenciar valores de propiedades del objeto actual directamente en el CSS mediante la sintaxis `##FLD_NOMBRE_CAMPO##`. Esto permite que los estilos se calculen dinámicamente en función de los datos del registro actual.

**Sintaxis:**

```
##FLD_NOMBRE_DEL_CAMPO##
```

Donde `NOMBRE_DEL_CAMPO` es el nombre de una propiedad (campo) definida en la coleccion. El valor de esa propiedad en el registro actual reemplazara el token en tiempo de ejecución.

### 8.2 Uso en CSS

```css
.frmsuperior {
    width: 100%;
    height: 120p;
    bgcolor: ##FLD_MAP_COLORACTIVO##;
    align: left|center;
}
```

En este ejemplo, el color de fondo del frame se obtiene dinámicamente del valor del campo `MAP_COLORACTIVO` del objeto actual. Si el campo contiene `#1565C0`, el frame tendra ese color de fondo.

### 8.3 Uso en atributos inline XML

La misma sintaxis funciona en los atributos inline de los nodos XML:

```xml
<prop name="MAP_LABEL" type="L"
      bgcolor="##FLD_MAP_COLOR1##"
      forecolor="##FLD_MAP_COLOR2##" />
```

Esto obtiene los valores dinámicos de las propiedades `MAP_COLOR1` y `MAP_COLOR2` del objeto actual, permitiendo cambiar colores en tiempo de ejecución sin necesidad de JavaScript.

### 8.4 Casos de uso

Las referencias dinámicas son útiles para:

- **Colores por estado:** Un campo `COLOR_ESTADO` que cambia según el estado del registro
- **Temas por usuario/empresa:** Un campo `COLOR_EMPRESA` que define la paleta de colores corporativa
- **Indicadores visuales:** Cambiar el fondo de un frame según un valor calculado
- **Personalizacion:** Permitir que el usuario elija colores que se aplican directamente

**Ejemplo completo - Frame con color dinámico por estado:**

```css
/* El color del frame depende del campo MAP_COLOR del registro */
.frameEstadoDinamico {
    width: 100%;
    height: 80p;
    bgcolor: ##FLD_MAP_COLOR##;
    forecolor: #FFFFFF;
    align: center;
}
```

```xml
<!-- En la coleccion, MAP_COLOR contiene valores como #4CAF50, #F44336, etc. -->
<prop name="MAP_COLOR" type="T" visible="0" />
<frame name="frmEstado" class="frameEstadoDinamico">
    <prop name="ESTADO" type="L" forecolor="#FFFFFF" />
</frame>
```

> **NOTA:** Los valores de los campos referenciados deben contener valores CSS validos (colores en formato `#RRGGBB`, nombres de imágenes, etc.). Si el campo esta vacio o contiene un valor no valido, el comportamiento puede ser inesperado.

---

## 9. Cascada de Condiciones de Dispositivo

### 9.1 Orden de cascada

XOne aplica los archivos CSS en un orden especifico de cascada, donde los archivos más especificos sobrescriben a los menos especificos. Este es el orden de prioridad de menor a mayor:

```
1. default.css                        (Base - MENOR prioridad)
2. default.ios.css / default.android.css  (Plataforma)
3. default.portrait.css / default.landscape.css  (Orientacion)
4. default.night.css                  (Modo oscuro/tema)
5. default.ios.portrait.css           (Condiciones combinadas)
6. Atributos inline en XML           (MAYOR prioridad)
```

### 9.2 Archivos por convencion de nombre

XOne reconoce automáticamente los archivos CSS según su nombre. No es necesario declararlos explicitamente en `app.xml` (excepto el archivo base `default.css`):

| Archivo | Condición | Prioridad |
|---------|-----------|:---------:|
| `default.css` | Siempre se carga (base) | 1 (menor) |
| `default.android.css` | Solo en dispositivos Android | 2 |
| `default.ios.css` | Solo en dispositivos iOS | 2 |
| `default.portrait.css` | Solo en orientación vertical | 3 |
| `default.landscape.css` | Solo en orientación horizontal | 3 |
| `default.night.css` | Solo en modo oscuro/nocturno | 4 |
| `default.day.css` | Solo en modo claro/diurno | 4 |
| `default.ios.portrait.css` | iOS + orientación vertical | 5 |
| `default.android.landscape.css` | Android + orientación horizontal | 5 |

### 9.3 Estilos condicionales explicitos en app.xml

Además de la convencion de nombres, se pueden declarar archivos CSS condicionales de forma explicita usando el atributo `conditions` en el nodo `<style>`:

```xml
<app ...>
    <style url="default.css" strict-mode="true" />
    <style url="default-ios.css" conditions="ios" strict-mode="true" />
    <style url="default_hor.css" conditions="phone:horizontal" strict-mode="true" />
    <style url="tablet_ver.css" conditions="tablet:vertical" />
    <style url="tablet_hor.css" conditions="tablet:horizontal" />
</app>
```

**Valores del atributo `conditions`:**

| Condición | Descripción |
|-----------|-------------|
| `ios` | Solo en iOS |
| `android` | Solo en Android |
| `phone:horizontal` | Telefono en orientación horizontal |
| `phone:vertical` | Telefono en orientación vertical |
| `tablet:horizontal` | Tablet en orientación horizontal |
| `tablet:vertical` | Tablet en orientación vertical |

### 9.4 Regla de sobrescritura

Las condiciones más especificas **siempre ganan** sobre las menos especificas. Si un atributo se define en multiples archivos CSS, el valor del archivo más especifico es el que se aplica:

```css
/* default.css */
.frameHeader {
    bgcolor: #1565C0;       /* Base: azul */
    height: 140p;
}

/* default.ios.css */
.frameHeader {
    bgcolor: #007AFF;       /* iOS: azul de Apple */
    height: 120p;            /* iOS: header mas bajo */
}

/* default.night.css */
.frameHeader {
    bgcolor: #1E1E1E;       /* Modo oscuro: gris oscuro */
}
```

En este ejemplo:
- En **Android modo claro**: `bgcolor: #1565C0`, `height: 140p` (base)
- En **iOS modo claro**: `bgcolor: #007AFF`, `height: 120p` (plataforma sobrescribe)
- En **Android modo oscuro**: `bgcolor: #1E1E1E`, `height: 140p` (tema sobrescribe color, pero no altura)
- En **iOS modo oscuro**: `bgcolor: #1E1E1E`, `height: 120p` (tema sobrescribe color del de plataforma)

### 9.5 strict-mode

El atributo `strict-mode` en el nodo `<style>` permite validar el CSS durante la carga:

```xml
<style url="default.css" strict-mode="true" />
```

Cuando `strict-mode="true"`, XOne valida errores en el CSS y reporta propiedades no reconocidas o valores invalidos. Es recomendable activarlo durante el desarrollo para detectar errores de sintaxis.

> **IMPORTANTE:** Solo es necesario declarar `default.css` en `app.xml`. Los archivos variantes (`default.ios.css`, `default.night.css`, etc.) se cargan automáticamente por convencion de nombre. Sin embargo, para archivos con nombres personalizados, es necesario declararlos explicitamente con el atributo `conditions`.

---

## 10. Animaciones

### 10.1 Atributos de animación

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `animation-in` | Token de animación | Animación de entrada de la pantalla/frame |
| `animation-out` | Token de animación | Animación de salida de la pantalla/frame |
| `animation-in-delay` | Milisegundos (número) | Retardo de la animación de entrada |
| `animation-out-delay` | Milisegundos (número) | Retardo de la animación de salida |

### 10.2 Tipos de animación disponibles

XOne proporciona tokens predefinidos para animaciones. Estos tokens se encierran entre dobles almohadillas (`##`):

| Token | Descripción | Uso típico |
|-------|-------------|------------|
| `##RIGHT_IN##` | Entra desde la derecha | Navegación hacia adelante |
| `##LEFT_IN##` | Entra desde la izquierda | Navegación hacia atrás |
| `##RIGHT_OUT##` | Sale hacia la derecha | Salida al volver atrás |
| `##LEFT_OUT##` | Sale hacia la izquierda | Salida al avanzar |
| `##PUSH_IN##` | Entra desde abajo (push up) | Modales, paneles inferiores |
| `##PUSH_OUT##` | Sale hacia arriba (push up) | Cerrar modales |
| `##PUSH_DOWN_IN##` | Entra desde arriba | Notificaciones, dropdowns |
| `##PUSH_DOWN_OUT##` | Sale hacia abajo | Cerrar notificaciones |
| `##ALPHA_IN##` | Aparece con fade in | Transiciones suaves |
| `##ALPHA_OUT##` | Desaparece con fade out | Transiciones suaves |
| `##ZOOM_IN##` | Zoom de entrada (crece) | Detalle, ampliacion |
| `##ZOOM_OUT##` | Zoom de salida (encoge) | Cerrar detalle |
| `##ROTATE3D_IN##` | Rotación 3D de entrada | Efectos especiales |
| `##ROTATE3D_OUT##` | Rotación 3D de salida | Efectos especiales |

### 10.3 Cuando usar animaciones

- **Navegación entre pantallas:** `##RIGHT_IN##` / `##LEFT_OUT##` para avanzar, `##LEFT_IN##` / `##RIGHT_OUT##` para retroceder
- **Modales o paneles:** `##PUSH_IN##` / `##PUSH_OUT##` o `##PUSH_DOWN_IN##` / `##PUSH_DOWN_OUT##`
- **Transiciones suaves:** `##ALPHA_IN##` / `##ALPHA_OUT##`
- **Evitar en elementos repetitivos:** No aplicar animaciones a items de lista o elementos que se repintan frecuentemente

### 10.4 Ejemplo práctico

**Clases de animación reutilizables (proyecto SocialNetwork):**

```css
/* Fade in suave */
.animFadeIn {
    animation-in: ##ALPHA_IN##;
    animation-in-delay: 300;
}

/* Slide desde abajo */
.animSlideUp {
    animation-in: ##PUSH_IN##;
    animation-in-delay: 200;
}

/* Slide lateral (navegacion) */
.animSlideRight {
    animation-in: ##RIGHT_IN##;
    animation-in-delay: 200;
    animation-out: ##LEFT_OUT##;
    animation-out-delay: 200;
}
```

**Clases de animación con diferentes efectos (de la knowledgebase):**

```css
.FrameAnimateFromRight {
    animation-in-delay: 500;
    animation-out-delay: 500;
    animation-in: ##RIGHT_IN##;
    animation-out: ##LEFT_OUT##;
}

.FrameAnimateAlpha {
    animation-in-delay: 500;
    animation-out-delay: 500;
    animation-in: ##ALPHA_IN##;
    animation-out: ##ALPHA_OUT##;
}

.FrameAnimateZoom {
    animation-in-delay: 500;
    animation-out-delay: 500;
    animation-in: ##ZOOM_IN##;
    animation-out: ##ZOOM_OUT##;
}
```

**Uso en el selector `coll` para animar toda la coleccion:**

```css
coll {
    animation-in: "##RIGHT_IN##";
}
```

---

## 11. Gráficos (Charts)

### 11.1 Tipos de gráfico disponibles

Los gráficos se definen mediante el atributo `type="Z"` en la propiedad XML y se configuran con atributos CSS. Los tipos de gráfico se especifican en el atributo XML `viewmode` o como viewmode de la coleccion:

- `barchart` - Gráfico de barras
- `3dbarchart` - Gráfico de barras 3D
- `slidingbarchart` - Gráfico de barras deslizable
- `piechart` - Gráfico circular (tarta)
- `piechart2` - Variante de gráfico circular
- `linechart` - Gráfico de lineas
- `areachart` - Gráfico de área
- `timeserieschart` - Gráfico de series temporales

**Atributos XML para datos del gráfico:**

| Atributo XML | Descripción |
|-------------|-------------|
| `chart-category="true"` | Define el campo como categoría (eje X) |
| `chart-value="true"` | Define el campo como valor (eje Y) |
| `chart-color="true"` | Define el campo como color de la serie |

### 11.2 Atributos de gráficos

| Atributo CSS | Valores | Descripción |
|--------------|---------|-------------|
| `chart-serie-color` | `#COLOR1,#COLOR2,...` | Colores de las series |
| `chart-color-template` | `#COLOR1,#COLOR2,...` | Plantilla de colores |
| `chart-lock-x-axis` | `true`/`false` | Bloquear eje X (sin zoom/pan) |
| `chart-lock-y-axis` | `true`/`false` | Bloquear eje Y (sin zoom/pan) |
| `chart-show-series-item-labels` | `true`/`false` | Mostrar etiquetas de valores |
| `chart-series-item-label-format` | `##VALUE##` | Formato de las etiquetas |
| `chart-category-label-rotation` | `up_45`/`up_90`/`down_45`/`down_90` | Rotación de etiquetas de categoría |
| `chart-category-max-value` | Número | Valor máximo de la categoría |
| `chart-category-step-size` | Número | Tamaño del paso entre valores |
| `chart-max-visible-series` | Número | Máximo de series visibles simultaneamente |
| `show-legend` | `true`/`false` | Mostrar leyenda del gráfico |
| `fontsize-legend` | Número | Tamaño de fuente de la leyenda |

### 11.3 Ejemplo completo

```css
.clsCharts {
    width: 80%;
    height: 75%;
    chart-serie-color: #FF0000,#00FF00,#0000FF;
    chart-lock-x-axis: true;
    chart-lock-y-axis: true;
    show-legend: true;
    chart-show-series-item-labels: true;
    chart-series-item-label-format: ##VALUE##;
    chart-category-label-rotation: up_45;
}
```

**Uso en XML:**

```xml
<prop name="MAP_BARCHART" type="Z" class="clsCharts" viewmode="barchart" visible="1" />
```

**Ejemplo XML con campos de datos para el gráfico:**

```xml
<!-- En la coleccion de datos del gráfico -->
<prop name="CATEGORIA" chart-category="true" />
<prop name="VALOR" chart-value="true" />
<prop name="COLOR" chart-color="true" />
```

> **Referencia cruzada:** Para la definición XML completa de gráficos, consultar el tópico 02 - Estructura XML.

---

## 12. Calendario

### 12.1 Atributos de calendario

Los calendarios se definen con `type="Z"` y `viewmode="calendarview"` y se configuran con atributos CSS especificos para personalizar la apariencia de días, semanas y selección:

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `weekdays-bgcolor` | `#RRGGBB` | Color de fondo de la fila de días de semana |
| `weekdays-forecolor` | `#RRGGBB` | Color de texto de los días de semana |
| `weekdays-fontsize` | Número | Tamaño de fuente de los días de semana |
| `weekdays-longname` | `true`/`false` | Nombres largos (Lunes) vs cortos (Lun) |
| `weekdays-align` | `top`/`center`/`bottom` + `left`/`right` | Alineacion de los días |
| `page-swipe` | `true`/`false` | Permitir swipe entre meses |
| `cell-bgcolor` | `#RRGGBB`/`#AARRGGBB` | Color de fondo de las celdas de día |
| `cell-forecolor` | `#RRGGBB` | Color de texto de los días |
| `cell-border-width` | Número | Grosor del borde de celda |
| `cell-align` | `left`/`center`/`right` | Alineacion del contenido de celda |
| `cell-selected-bgcolor` | `#RRGGBB`/`#AARRGGBB` | Fondo del día seleccionado |
| `cell-selected-forecolor` | `#RRGGBB` | Texto del día seleccionado |
| `cell-selected-border-color` | `#RRGGBB` | Borde del día seleccionado |
| `cell-other-month-bgcolor` | `#RRGGBB`/`#AARRGGBB` | Fondo de los días de otros meses |

### 12.2 Ejemplo completo

```css
.z_calendario {
    cell-bgcolor: #68008CFF;
    cell-forecolor: #000000;
    cell-border-width: 2;
    cell-align: center;
    cell-selected-bgcolor: #00000000;
    cell-selected-forecolor: #0000CC;
    cell-selected-border-color: #0000CC;
    cell-other-month-bgcolor: #39767676;
    weekdays-bgcolor: #00000000;
    weekdays-forecolor: #000000;
    weekdays-fontsize: 4;
    weekdays-longname: true;
    page-swipe: true;
}
```

**Nota:** Los colores con alpha como `#68008CFF` y `#39767676` usan el formato ARGB. Por ejemplo, `#39767676` es un gris con 22% de opacidad (0x39 = 57 de 255 = ~22%).

---

## 13. Mapa

### 13.1 Atributos de mapa

Los mapas se configuran estableciendo `viewmode: mapview` en la coleccion o en una clase aplicada a la coleccion. XOne soporta tanto Google Maps (`mapview`) como OpenStreetMap (`openstreetmap`):

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `viewmode` | `mapview` / `openstreetmap` | Activar modo mapa en la coleccion |
| `mapview-embedded` | `true`/`false` | Mapa embebido dentro del layout |
| `zoom-to-my-location` | `true`/`false` | Centrar automáticamente en la ubicación actual |
| `show-pois` | `true`/`false` | Mostrar puntos de interes |
| `clear-lines-on-refresh` | `true`/`false` | Limpiar lineas al refrescar datos |
| `clear-markers-on-refresh` | `true`/`false` | Limpiar marcadores al refrescar datos |
| `show-compass` | `true`/`false` | Mostrar brujula en el mapa |
| `show-minimap` | `true`/`false` | Mostrar minimapa de referencia |
| `show-scale` | `true`/`false` | Mostrar escala del mapa |
| `follow-location-on-background` | `true`/`false` | Seguir ubicación en segundo plano |
| `zoom-buttons-visibility` | `always`/`never` | Visibilidad de botones de zoom |
| `show-google-buttons` | `true`/`false` | Mostrar botones de Google Maps |
| `zoom-to-pois` | `true`/`false` | Ajustar zoom para mostrar todos los POIs |

### 13.2 Ejemplo completo

```css
.clsmapview {
    viewmode: mapview;
    mapview-embedded: true;
    clear-lines-on-refresh: false;
    clear-markers-on-refresh: false;
    show-pois: false;
    zoom-to-my-location: true;
}
```

**Uso en XML:**

```xml
<coll name="MapaEntregas" class="clsmapview">
    <!-- Propiedades del mapa -->
</coll>
```

> **Referencia cruzada:** Para la API JavaScript de mapas (anadir marcadores, dibujar rutas), consultar el tópico 03 - API JavaScript.

