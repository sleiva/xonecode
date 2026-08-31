# Generación XOne — Fase 3: estilos CSS

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` §4. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §4 declaración de CSS en app.xml, prioridad de estilos, selectores, plantilla default.css, plantilla colors.css, tabla de transparencias alpha y referencia rápida de atributos

---

## 4. Fase 3: Estilos CSS

### 4.1 Objetivo

Crear el archivo `default.css` con los estilos globales de la aplicación. Opcionalmente, crear `colors.css` para la paleta de colores.

> **ADVERTENCIA:** Si en el nodo `<app>` del mappings esta definido `compatibility-mode="true"`, los estilos CSS **NO se aplicaran**. Verificar siempre que este atributo no este presente o sea `false`.

---

### 4.2 Declaración de CSS en app.xml

Los ficheros CSS se declaran en el nodo `<app>` con el nodo `<style>`. Se pueden declarar multiples ficheros aplicados según condiciones de plataforma, tamaño y orientación:

```xml
<app prefix="gen" version="1.0.0" ...>
    <style url="default.css" />
    <style url="default_phone.css" conditions="phone:vertical"/>
    <style url="default_phone_hor.css" conditions="phone:horizontal"/>
    <style url="default_tablet.css" conditions="tablet:vertical"/>
    <style url="default_tablet_hor.css" conditions="tablet:horizontal"/>
    <style url="default_android_ver.css" conditions="android:phone:vertical"/>
    <style url="default_iphone.css" conditions="ios:phone"/>
    <style url="default_ipad_vertical.css" conditions="ios:tablet:vertical"/>
</app>
```

**Formato del atributo `conditions`:** `PLATAFORMA:TAMAÑO:ORIENTACION` — siempre en este orden y en minusculas.

| Parte | Valores posibles |
|-------|-----------------|
| Plataforma | `android`, `ios`, `wm`, `bb`, `wp` |
| Tamaño | `phone`, `tablet`, `mini` (android <3.5"), `hiphone` (android >4.5" y <7") |
| Orientación | `vertical`, `horizontal` |

> El fichero `default.css` (sin conditions) se aplica siempre como base. Los demas lo sobreescriben según condición.

---

### 4.3 Prioridad de Estilos (de menor a mayor)

Los estilos en XOne tienen este orden de prioridad. Un nivel superior sobreescribe al inferior:

| Prioridad | Origen | Ejemplo |
|-----------|--------|---------|
| 1 (más baja) | Valores predefinidos del framework | Valores por defecto internos de XOne |
| 2 | Nodos de sistema en CSS (`coll`, `group`, `frame`, `prop` sin punto) | `prop { fontsize: 10; }` |
| 3 | Clases de nodos de sistema en CSS (`prop.clase`, `group.clase`) | `prop.particular { labelbox: false; }` |
| 4 | Clases propias en CSS (`.miclase`) | `.btnPrimario { bgcolor: #2196F3; }` |
| 5 (más alta) | Atributos definidos directamente en la etiqueta XML | `<prop bgcolor="#FF0000" .../>` |

---

### 4.4 Tipos de Selectores CSS en XOne

#### Nodos de sistema (sin punto — afectan a todos los nodos de ese tipo)

```css
coll { editmask: 0; notab: true; }
group { imgbk: portada_interior.jpg; }
frame { width: 100%; framebox: false; }
prop { fontsize: 10; labelbox: false; }
```

#### Clases de nodo de coll (se aplican con `class=` en el nodo `coll`)

Cuando se pone `class="nombreclase"` en una `coll`, los estilos `prop.nombreclase`, `group.nombreclase` y `frame.nombreclase` se aplican automáticamente a todos sus hijos:

```css
prop.miColl { labelbox: false; fontsize: 9; }
group.miColl { imgbk: fondo.jpg; }
frame.miColl { bgcolor: #FFFFFF; }
```
```xml
<coll name="MiColl" class="miColl" ...>
```

#### Clases propias (con punto — se aplican con `class=` en cualquier nodo)

```css
.btnPrimario { bgcolor: #2196F3; forecolor: #FFFFFF; }
.frameHeader { width: 100%; height: 120p; bgcolor: #2196F3; }
```
```xml
<prop name="BTN" type="B" class="btnPrimario" />
<frame name="frmHeader" class="frameHeader" />
```

#### Selectores por tipo de prop (`prop:TIPO`)

```css
prop:B { bgcolor: #2196F3; forecolor: #FFFFFF; }
prop:IMG { width: 500p; height: 400p; }
prop:Z { width: 96%; lmargin: 2%; }
prop:NC { apply-css: true; }
prop:AT { img-att: attach.png; }
prop:PH { img-camera: camera.png; }
prop:VD { img-video: video.png; }
```

#### Herencia con `extends`

```css
.btnSecundario {
    extends: .btnPrimario;  /* hereda todos los atributos de btnPrimario */
    bgcolor: #757575;       /* sobreescribe solo el color */
}
```

---

### 4.5 Plantilla: default.css

```css
/* ============================================
   ESTILOS BASE - PROYECTO XONE
   NombreProyecto - v1.0.0
   ============================================ */

/* -------- NODOS DE SISTEMA -------- */
coll {
    notab: true;
    show-toolbar: false;
    group-swipe: false;
    editmask: 0;
    dependent: false;
    check-owner: false;
    cell-bgcolor: #FFFFFF;
    cell-border-width: 0;
    cell-border: false;
    cell-even-color: #F5F5F5;
    cell-odd-color: #FFFFFF;
    cell-height: 80p;
    cell-tpadding: 4p;
    cell-bpadding: 4p;
}

group {
    /* sin estilos globales por defecto */
}

frame {
    framebox: false;
    bgcolor: #00000000;
}

prop {
    fontname: Roboto-Regular.ttf; /* Puede ser cualquier fuente .ttf/.otf incluida en fonts/ */
    fontsize: 10;
    labelbox: false;
    label-wrap: true;
    text-border: false;
    width: 96%;
    lmargin: 2%;
    lines: 1;
    fixed-lines: true;
}

/* -------- TIPOS DE PROP -------- */
prop:B {
    forecolor: #FFFFFF;
    bgcolor: #2196F3;
    border-corner-radius: 8;
    ripple-effect: true;
    forecolor-disabled: #ADAA9C;
    bgcolor-disabled: #C6CEC6;
    forecolor-pressed: #FFFFFF;
    bgcolor-pressed: #1565C0;
}

prop:NC {
    apply-css: true;
}

prop:IMG {
    labelwidth: 0;
    width: 500p;
    height: 400p;
    file-maxwidth: 800;
    file-maxheight: 600;
    img-sign: bt_firma.png;
    img-sign-sel: bt_firma.png;
    img-delete: bt_delete.png;
    img-delete-sel: bt_delete.png;
    img-save: guardar.png;
    img-save-sel: guardar.png;
}

prop:PH {
    img-camera: bt_camera.png;
    img-camera-sel: bt_camera_sel.png;
}

prop:VD {
    img-video: bt_video.png;
    img-video-sel: bt_video_sel.png;
}

prop:AT {
    img-att: bt_attach.png;
    img-att-sel: bt_attach_sel.png;
}

prop:Z {
    extends: prop;
    bgcolor: #F2F2F2;
    width: 96%;
    lmargin: 2%;
    tmargin: 2%;
}

/* ============================================
   CLASES DE LAYOUT
   ============================================ */

.frameHeader {
    width: 100%;
    height: 120p;
    bgcolor: #2196F3;
    align: center;
}

.frameBody {
    width: 100%;
    height: 100%;
    scroll: true;
    bgcolor: #FFFFFF;
}

.frameFooter {
    width: 100%;
    height: 100p;
    bgcolor: #F5F5F5;
    align: center;
}

/* ============================================
   CLASES DE GRUPOS
   ============================================ */

.groupNoTab {
    tab-visible: false;
}

.groupConTab {
    tab-visible: true;
    tab-height: 48p;
    tab-fontsize: 12;
    group-theme: material;
    tab-mode: scrollable;
}

.groupFixed {
    fixed: true;
    orientation: top;
}

/* ============================================
   CLASES DE BOTONES
   ============================================ */

.btnPrimario {
    width: 90%;
    height: 50p;
    bgcolor: #2196F3;
    forecolor: #FFFFFF;
    border-corner-radius: 8;
    text-align: center;
    fontsize: 14;
    align: center;
    ripple-effect: true;
}

.btnSecundario {
    extends: .btnPrimario;
    bgcolor: #757575;
}

.btnPeligro {
    extends: .btnPrimario;
    bgcolor: #F44336;
}

.btnExito {
    extends: .btnPrimario;
    bgcolor: #4CAF50;
}

.btnTransparente {
    bgcolor: #00000000;
    forecolor: #2196F3;
    fontsize: 14;
    text-align: center;
}

/* Boton con ejecucion asincrona (no bloquea UI) */
.btnAsync {
    extends: .btnPrimario;
    execute-async: true;
}

/* ============================================
   CLASES DE TEXTO
   ============================================ */

/* Labels (type="L"): el texto es el `title` (o el valor del campo si no hay `title`), que se
   pinta dentro del ancho de la etiqueta. NO usar labelwidth:0 aquí — ocultaría el texto.
   (labelwidth:0 solo es correcto en campos con contenido en el valor, o IMG.) */
.textoTitulo {
    fontsize: 18;
    forecolor: #212121;
    align: center;
    fontname: Roboto-Bold.ttf;
}

.textoSubtitulo {
    fontsize: 14;
    forecolor: #757575;
    align: center;
}

.textoEditable {
    labelwidth: 0;
    text-border: true;
    text-border-bottom: true;
    text-border-left: false;
    text-border-right: false;
    text-border-top: false;
    text-border-color: #BDBDBD;
    lpadding: 10p;
}

/* Campo de texto con tooltip flotante */
.textoConTooltip {
    labelwidth: 0;
    border-corner-radius: 8;
    floating-tooltip: true;
    tooltip-forecolor: #757575;
    expanded-hint-color: #757575;
    show-counter: true;
}

.textoSoloLectura {
    labelwidth: 0;
    text-border: false;
    locked: true;
    forecolor: #757575;
}

.etiquetaLabel {
    labelwidth: 7;
    labelfont-underline: false;
    labelshadow: false;
    labelbox: false;
    labelfont-bold: true;
    labelfont-size: 8;
}

/* ============================================
   CLASES DE ICONOS
   ============================================ */

.iconoAccion {
    width: 48p;
    height: 48p;
    labelwidth: 0;
}

.iconoMenu {
    width: 64p;
    height: 64p;
    labelwidth: 0;
}

/* ============================================
   CLASES DE TARJETAS (CARDS)
   ============================================ */

.cardItem {
    width: 90%;
    height: 100p;
    bgcolor: #FFFFFF;
    border-corner-radius: 8;
    align: center;
    tmargin: 10p;
}

/* ============================================
   CLASES DE LISTADOS (contents)
   ============================================ */

.listado {
    grid-bgcolor: #00000000;
    grid-text-bgcolor: #00000000;
    show-toolbar: false;
    check-owner: false;
    dependent: false;
    show-selected-item: false;
}

/* ============================================
   CLASES DE SEPARADORES
   ============================================ */

.separadorH {
    labelbox: false;
    width: 100%;
    height: 2p;
    bgcolor: #E0E0E0;
    tmargin: 5p;
}

/* ============================================
   CLASES DE CALENDARIO
   ============================================ */

.calendarioBase {
    show-toolbar: false;
}

.calendarioContenido {
    cell-bgcolor: #FF328BA9;
    cell-forecolor: #FFFFFF;
    cell-border-width: 4;
    cell-border-color: #00000000;
    cell-align: center;
    align: center;
    fontsize: 25;
    cell-selected-bgcolor: #00000000;
    cell-selected-forecolor: #FF328BA9;
    cell-selected-border-color: #00000000;
    weekdays-bgcolor: #00000000;
    weekdays-forecolor: #FF328BA9;
    weekdays-fontsize: 6;
    weekdays-longname: false;
    weekdays-align: top|left;
    border-width: 2;
    page-swipe: true;
    cell-other-month-bgcolor: #50000000;
    border: false;
}

/* ============================================
   CLASES DE ANIMACION
   ============================================ */

.animFadeIn {
    animation-in: ##ALPHA_IN##;
    animation-in-delay: 300;
    animation-out: ##ALPHA_OUT##;
    animation-out-delay: 300;
}

.animSlideRight {
    animation-in: ##RIGHT_IN##;
    animation-in-delay: 300;
    animation-out: ##LEFT_OUT##;
    animation-out-delay: 300;
}
```

---

### 4.6 Plantilla: colors.css (Opcional)

```css
/* ============================================
   PALETA DE COLORES - NombreProyecto
   Modificar estos colores segun el proyecto
   ============================================ */

/* Primarios */
.colorPrimario { bgcolor: #2196F3; }
.colorPrimarioDark { bgcolor: #1976D2; }
.colorPrimarioLight { bgcolor: #BBDEFB; }

/* Acento */
.colorAccento { bgcolor: #FF5722; }

/* Fondos */
.colorFondo { bgcolor: #FFFFFF; }
.colorSuperficie { bgcolor: #F5F5F5; }

/* Texto */
.textoColorPrimario { forecolor: #212121; }
.textoColorSecundario { forecolor: #757575; }
.textoColorBlanco { forecolor: #FFFFFF; }

/* Estado */
.colorExito { bgcolor: #4CAF50; }
.colorAdvertencia { bgcolor: #FFC107; }
.colorError { bgcolor: #F44336; }
```

---

### 4.7 Tabla de Transparencias Alpha

En XOne los colores usan formato `#AARRGGBB` donde `AA` es el canal alpha. Referencia:

| Alpha | Hex | Alpha | Hex |
|-------|-----|-------|-----|
| 100% (opaco) | `FF` | 45% | `73` |
| 95% | `F2` | 40% | `66` |
| 90% | `E6` | 35% | `59` |
| 85% | `D9` | 30% | `4D` |
| 80% | `CC` | 25% | `40` |
| 75% | `BF` | 20% | `33` |
| 70% | `B3` | 15% | `26` |
| 65% | `A6` | 10% | `1A` |
| 60% | `99` | 5% | `0D` |
| 55% | `8C` | 0% (transparente) | `00` |
| 50% | `80` | | |

Ejemplo: rojo al 50% de opacidad = `#80FF0000`

---

### 4.8 Referencia Rápida de Atributos CSS XOne

| Atributo XOne | Equivalente Web (NO USAR) | Descripción |
|---------------|---------------------------|-------------|
| `fontsize` | font-size | Tamaño de fuente |
| `fontname` | font-family | Nombre del fichero de fuente |
| `fontbold` | font-weight | Negrita (`true`/`false`) |
| `labelfont-bold` | — | Negrita del label |
| `labelfont-size` | — | Tamaño del label |
| `labelfont-underline` | — | Subrayado del label |
| `labelwidth` | — | Proporcion del label (0 = sin label) |
| `labelbox` | — | Muestra borde en el label (`true`/`false`) |
| `forecolor` | color | Color del texto |
| `bgcolor` | background-color | Color de fondo |
| `text-forecolor` | — | Color del texto dentro del campo editable |
| `text-bgcolor` | — | Color de fondo del campo editable |
| `text-forecolor-focus` | — | Color de texto al tener el foco |
| `text-bgcolor-focus` | — | Color de fondo al tener el foco |
| `text-forecolor-disabled` | — | Color de texto deshabilitado |
| `text-bgcolor-disabled` | — | Color de fondo deshabilitado |
| `forecolor-disabled` | — | Color de texto del botón deshabilitado |
| `bgcolor-disabled` | — | Color de fondo del botón deshabilitado |
| `forecolor-pressed` | — | Color de texto del botón pulsado |
| `bgcolor-pressed` | — | Color de fondo del botón pulsado |
| `tmargin` | margin-top | Margen superior |
| `bmargin` | margin-bottom | Margen inferior |
| `lmargin` | margin-left | Margen izquierdo |
| `rmargin` | margin-right | Margen derecho |
| `tpadding` | padding-top | Padding superior |
| `bpadding` | padding-bottom | Padding inferior |
| `lpadding` | padding-left | Padding izquierdo |
| `rpadding` | padding-right | Padding derecho |
| `border-corner-radius` | border-radius | Radio de esquinas |
| `border-width` | border-width | Ancho del borde |
| `border-color` | border-color | Color del borde |
| `text-align` | text-align | Alineacion del texto (`left`, `center`, `right`) |
| `align` | — | Alineacion del control dentro del frame |
| `text-border` | border | Borde del campo de texto (`true`/`false`) |
| `text-border-top` | border-top | Borde superior del campo |
| `text-border-bottom` | border-bottom | Borde inferior del campo |
| `text-border-left` | border-left | Borde izquierdo del campo |
| `text-border-right` | border-right | Borde derecho del campo |
| `text-border-color` | border-color | Color del borde del campo |
| `floating-tooltip` | placeholder | Tooltip flotante como placeholder |
| `tooltip` | placeholder | Texto del tooltip |
| `tooltip-forecolor` | — | Color del texto del tooltip |
| `expanded-hint-color` | — | Color del hint expandido (Material Design) |
| `show-counter` | — | Muestra contador de caracteres |
| `ripple-effect` | — | Efecto ripple en botones |
| `execute-async` | — | Ejecuta la acción del botón de forma asíncrona |
| `apply-css` | — | Aplica estilos CSS al control (requerido en `prop:NC`) |
| `file-maxwidth` | — | Ancho máximo de imagen capturada (px) |
| `file-maxheight` | — | Alto máximo de imagen capturada (px) |
| `img` | — | Imagen del botón principal |
| `img-sel` | — | Imagen al pulsar el botón |
| `img-delete` | — | Imagen del botón borrar |
| `img-search` | — | Imagen del botón lupa |
| `img-spinner` | — | Imagen del combo/spinner |
| `img-phone` | — | Imagen del botón telefono |
| `img-undo` | — | Imagen del botón deshacer |
| `img-date` | — | Imagen del botón fecha |
| `img-time` | — | Imagen del botón hora |
| `img-att` | — | Imagen del botón adjunto |
| `img-camera` | — | Imagen del botón camara (`prop:PH`) |
| `img-video` | — | Imagen del botón video (`prop:VD`) |
| `img-sign` | — | Imagen del botón firma (`prop:IMG`) |
| `img-save` | — | Imagen del botón guardar firma (`prop:IMG`) |
| `img-width` | — | Ancho del botón imagen |
| `img-height` | — | Alto del botón imagen |
| `imgbk` | background-image | Imagen de fondo del grupo o frame |

