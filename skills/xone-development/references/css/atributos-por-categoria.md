# XOne CSS — Tablas de atributos por categoría

> Fuente: `xone/v2/xone-project-generator/references/xone-css-styling-guide.md` §4–§16, §21, §26, §28. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: tablas compactas de atributos: tipografía, dimensiones, márgenes/padding, colores y fondos, alineación, etiquetas, bordes, texto y campos, imágenes e iconos, checkbox y toggles, visibilidad, elevación, atributos de coll · machine learning · transparencia alpha ARGB · errores comunes y equivalencias CSS web ↔ XOne

---

## 4. Atributos CSS - Tipografía

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `fontname` | `NombreFuente.ttf` | Fuente personalizada (archivo .ttf en carpeta fonts/) |
| `fontsize` | Número, **escala 1-12** (el parser acepta 1-50) | Tamaño fuente (sin unidad) |
| `fontbold` | `true` / `false` | Negrita |
| `fontitalic` | `true` / `false` | Cursiva |
| `forecolor` | `#RRGGBB` / `#AARRGGBB` | Color texto y etiqueta |
| `forecolor-disabled` | `#RRGGBB` | Color fuente cuando deshabilitado |
| `text-forecolor` | `#RRGGBB` | Color texto editable |
| `text-forecolor-disabled` | `#RRGGBB` | Color texto deshabilitado |
| `text-fontsize` | Número | Tamaño fuente del texto editable |
| `labelfont-size` / `labelfontsize` | Número | Tamaño fuente etiqueta |
| `textfont-size` / `textfontsize` / `text-font-size` | Número | Tamaño fuente texto editable |
| `labelfont-bold` | `true` / `false` | Etiqueta negrita |
| `textfont-bold` | `true` / `false` | Texto editable negrita |
| `textfont-italic` | `true` / `false` | Texto editable cursiva |
| `labelshadow` | `true` / `false` | Sombra en etiqueta |

> **`fontsize` no está en puntos ni en `dp`: es una escala pequeña a la que el runtime SUMA el
> factor de la plataforma.** El cálculo, leído en el runtime iOS
> (`XoneApp::calculateSizeFont`): en iPhone `puntos = fontsize + factor` (y `fontsize + factor/2`
> si `fontsize <= 2`); en iPad, `fontsize + 4 + factor`. El factor sale de `app.xml` —
> `ios-font-factor` y `android-font-factor`, **uno por plataforma**. Los valores del proyecto:
> **`android-font-factor="7"` e `ios-font-factor="8"`**.
>
> De ahí que los valores útiles vivan en **1-12** (texto `5`, título de sección `7`, topbar
> `10`-`11`): con factor 8, un `fontsize="5"` son 13 pt. El `1-50` de la tabla es lo que el
> parser ACEPTA, no lo que tiene sentido escribir — un `fontsize: 14` no da error, da 22 pt.
> **Los ejemplos de este fichero anteriores a esta nota usan valores tipo Material (`14`, `16`)
> heredados del corpus original: cópiales la forma, no el número.**
>
> Y el corolario que importa al portar entre proyectos: **los dos factores se afinan por
> separado** y en un proyecto real pueden diferir mucho (`android-font-factor="13"` con
> `ios-font-factor="5"`), así que un `fontsize` copiado de otro proyecto sin mirar su `app.xml`
> no significa nada.


```css
.tituloSeccion {
    fontname: Roboto-Bold.ttf;
    fontsize: 20;
    forecolor: #212121;
}
```

---

## 5. Atributos CSS - Dimensiones y Unidades

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `width` | `Np` / `N%` | Ancho del elemento |
| `height` | `Np` / `N%` / `-2` | Alto del elemento. `-2` = alto definido por contenido |
| `size` | Número | Tamaño máximo de caracteres también es el tamaño máximo en la base de datos |
| `fieldsize` | Número | Tamaño de campo visual, es la cantidad de espacio que ocupa calculado ancho de carácter x valor de fieldsize |

| Unidad | Recomendado | Descripción |
|--------|-------------|-------------|
| `p` | SI | Puntos XOne: 1p = 1px en la resolución de referencia (NO equivale al `dp` de Android) |
| `%` | SI | Porcentaje del contenedor padre |
| `px` | NO | Pixeles físicos (no escala) |

> **REGLA:** Siempre usar `p` para fijos y `%` para responsivos. NUNCA `px`, `em`, `rem`.

---

## 6. Atributos CSS - Margenes y Padding

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `tmargin` | `Np` / `N%` | Margen superior |
| `bmargin` | `Np` / `N%` | Margen inferior |
| `lmargin` | `Np` / `N%` | Margen izquierdo |
| `rmargin` | `Np` / `N%` | Margen derecho |
| `tpadding` | `Np` | Padding superior |
| `bpadding` | `Np` | Padding inferior |
| `lpadding` | `Np` | Padding izquierdo |
| `rpadding` | `Np` | Padding derecho |

No existe atributo abreviado `margin` o `padding`.

---

## 7. Atributos CSS - Colores y Fondos

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `bgcolor` | `#RRGGBB` / `#AARRGGBB` | Color de fondo |
| `bgcolor-disabled` | `#RRGGBB` | Color de fondo cuando deshabilitado |
| `bgcolor-focus` | `#RRGGBB` | Color de fondo al recibir foco |
| `forecolor` | `#RRGGBB` / `#AARRGGBB` | Color primer plano |
| `text-bgcolor` | `#RRGGBB` | Fondo texto editable |
| `text-bgcolor-focus` | `#RRGGBB` | Fondo texto al recibir foco |
| `text-bgcolor-disabled` | `#RRGGBB` | Fondo texto deshabilitado |
| `border-color` | `#RRGGBB` | Color borde |
| `text-border-color` | `#RRGGBB` | Color borde texto |
| `imgbk` | `nombre.png` / `nombre.svg` | Imagen de fondo (PNG, JPG o SVG) |

> **ATENCION:** El formato alpha en XOne es `#AARRGGBB` (alpha PRIMERO), NO `#RRGGBBAA`.

---

## 8. Atributos CSS - Alineacion y Layout

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `align` | Combinacion con `\|` | Alineacion combinada |
| `text-align` | `left` / `center` / `right` | Alineacion texto |
| `newline` | `true` / `false` | Nueva linea |
| `scroll` | `true` / `false` | Scroll |
| `fixed` | `true` / `false` | Elemento fijo |
| `orientation` | `top` / `bottom` | Ancla del fijo |
| `floating` | `true` / `false` | Frame flotante |
| `top` | `Np` | Posición vertical de frame flotante |
| `left` | `Np` | Posición horizontal de frame flotante |
| `framebox` | `true` / `false` | Estilo de caja del frame (dibuja borde visual alrededor del frame) |

Valores de align: `left`, `center`, `right`, `top`, `bottom`. Combinar con `|`: `top|left`, `bottom|center`.

```css
/* Footer fijo anclado abajo */
.frameFooter {
    width: 100%;
    height: 120p;
    bgcolor: #FFFFFF;
    fixed: true;
    orientation: bottom;
}

/* FAB flotante posicionado */
.btnFAB {
    width: 112p;
    height: 112p;
    bgcolor: #FFC107;
    border-corner-radius: 56;
    labelwidth: 0;
    img-width: 48p;
    img-height: 48p;
    floating: true;
}
```

---

## 9. Atributos CSS - Etiquetas (Labels)

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `labelwidth` | 0-100 | Proporcion ancho etiqueta (0=sin etiqueta) |
| `labelbox` | `true` / `false` | Caja contenedora |
| `label-wrap` | `true` / `false` | Wrap del texto |
| `title` | `"texto"` | Texto etiqueta |
| `tooltip` | `"texto"` | Placeholder |

---

## 10. Atributos CSS - Bordes

### Bordes de texto

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `text-border` | `true` / `false` | Borde alrededor texto |
| `text-border-left` | `true` / `false` | Borde izquierdo del texto |
| `text-border-right` | `true` / `false` | Borde derecho del texto |
| `text-border-top` | `true` / `false` | Borde superior del texto |
| `text-border-bottom` | `true` / `false` | Borde inferior del texto |
| `text-border-color` | `#RRGGBB` | Color borde texto |
| `text-border-width` | `Np` | Grosor del borde de texto |

### Bordes de contenedor

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `border` | `true` / `false` | Borde general |
| `border-width` | Número | Grosor borde |
| `border-color` | `#RRGGBB` | Color borde |
| `border-corner-radius` | Número | Radio de todas las esquinas |
| `border-corner-radius-top-left` | Número | Radio esquina superior izquierda |
| `border-corner-radius-top-right` | Número | Radio esquina superior derecha |
| `border-corner-radius-bottom-left` | Número | Radio esquina inferior izquierda |
| `border-corner-radius-bottom-right` | Número | Radio esquina inferior derecha |
| `border-top` | `true` / `false` | Borde superior |
| `border-top-color` | `#RRGGBB` | Color borde sup |
| `border-bottom` | `true` / `false` | Borde inferior |
| `border-bottom-color` | `#RRGGBB` | Color borde inf |
| `framebox` | `true` / `false` | Borde frame |
| `grid-framebox` | `true` / `false` | Borde frame grid |
| `grid-text-border` | `true` / `false` | Borde texto grid |

### Patron Material Design (borde inferior)

```css
.inputMaterial {
    text-border: true;
    text-border-left: false;
    text-border-right: false;
    text-border-top: false;
    text-border-bottom: true;
    text-border-color: #BDBDBD;
}

.inputMaterialEnfocado {
    extends: .inputMaterial;
    text-border-color: #1565C0;
}
```

### Patron: Panel con esquinas superiores

```css
.panelInferior {
    width: 100%;
    bgcolor: #FFFFFF;
    border-corner-radius-top-left: 24;
    border-corner-radius-top-right: 24;
}
```

---

## 11. Atributos CSS - Texto y Campos

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `lines` | Número | Lineas visibles |
| `fixed-lines` | `true` / `false` | Altura fija por lineas |
| `locked` | `true` / `false` | Solo lectura |
| `locking` | `true` / `false` | Bloqueo persistente |
| `mask` | `"formato"` | Mascara formato |
| `zoom-controls` | `true` / `false` | Zoom en webviews |

---

## 12. Atributos CSS - Imágenes e Iconos

### Generales

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `img` | `nombre.png` | Imagen principal |
| `imgbk` | `nombre.png` | Imagen fondo |
| `imgsel` / `img-sel` | `nombre.png` | Imagen seleccionada |
| `img-width` | Número | Ancho icono |
| `img-height` | Número | Alto icono |

### Iconos del sistema

| Normal | Seleccionado | Descripción |
|--------|-------------|-------------|
| `img-spinner` | `img-spinner-sel` | Combo/selector |
| `img-search` | `img-search-sel` | Busqueda |
| `img-delete` | `img-delete-sel` | Eliminar |
| `img-undo` | `img-undo-sel` | Deshacer |
| `img-phone` | `img-phone-sel` | Telefono |
| `img-date` | `img-date-sel` | Fecha |
| `img-time` | `img-time-sel` | Hora |
| `img-checked` | `img-checked-disabled` | Checkbox marcado |
| `img-unchecked` | `img-unchecked-disabled` | Checkbox desmarcado |
| `img-camera` | `img-camera-sel` | Camara |
| `img-video` | `img-video-sel` | Video |
| `img-sign` | `img-sign-sel` | Firma |
| `img-att` | `img-att-sel` | Adjuntos |

### Configuración completa (proyecto real)

```css
prop {
    img-spinner: bt_Arrow_down.png;
    img-spinner-sel: bt_Arrow_down_Sel.png;
    img-search: bt_Lupa.png;
    img-search-sel: bt_Lupa_sel.png;
    img-delete: bt_Delete.png;
    img-delete-sel: bt_Delete_sel.png;
    img-undo: undo.png;
    img-undo-sel: undo_click.png;
    img-phone: bt_Phone.png;
    img-phone-sel: bt_Phone_sel.png;
    img-date: bt_Date.png;
    img-date-sel: bt_Date_sel.png;
    img-time: bt_Time.png;
    img-time-sel: bt_Time_sel.png;
    img-checked: bt_check.png;
    img-checked-disabled: bt_check_disabled.png;
    img-unchecked: bt_uncheck.png;
    img-unchecked-disabled: bt_uncheck_disabled.png;
    img-att: bt_attach.png;
    img-att-sel: bt_attach_sel.png;
    img-camera: bt_camera.png;
    img-camera-sel: bt_camera_sel.png;
    img-video: bt_camera.png;
    img-video-sel: bt_camera_sel.png;
    img-height: 28;
    img-width: 28;
}
```

---

## 13. Atributos CSS - Checkbox y Controles Toggle

### Checkbox

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `check-color-checked` | `#RRGGBB` | Color del checkbox cuando esta marcado |
| `check-color-unchecked` | `#RRGGBB` | Color del checkbox cuando esta desmarcado |
| `check-color-checked-disabled` | `#RRGGBB` | Color marcado deshabilitado |
| `check-color-unchecked-disabled` | `#RRGGBB` | Color desmarcado deshabilitado |
| `apply-css` | `true` / `false` | Aplicar estilos CSS al componente |

```css
.xnCheckbox {
    extends: prop;
    apply-css: true;
    labelwidth: 1;
    img-width: 50p;
    text-bgcolor: #00000000;
}

/* Checkbox con colores personalizados */
prop:NC {
    extends: prop;
    apply-css: true;
    check-color-checked: #1565C0;
    check-color-unchecked: #9E9E9E;
    check-color-checked-disabled: #BBDEFB;
    check-color-unchecked-disabled: #E0E0E0;
}
```

### Controles Slider y Switch

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `track-color` | `#RRGGBB` | Color de la pista (barra) del slider o switch |
| `thumb-color` | `#RRGGBB` | Color del pulgar (control deslizable) del slider o switch |

```css
.switchPersonalizado {
    track-color: #BBDEFB;
    thumb-color: #1565C0;
}
```

---

## 14. Atributos CSS - Visibilidad y Estado

| Valor | Edición | Lista | Contents |
|-------|:-------:|:-----:|:--------:|
| `0` | Oculto | Oculto | Oculto |
| `1` | Visible | Oculto | Oculto |
| `2` | Oculto | Visible | Oculto |
| `4` | Oculto | Oculto | Visible |
| `7` | Visible | Visible | Visible |

Otros atributos de estado:

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `ripple-effect` | `true` / `false` | Efecto ripple Material Design al pulsar el elemento |
| `undo-button` | `true` / `false` | Mostrar botón deshacer |
| `apply-css` | `true` / `false` | Aplicar estilos CSS al componente |
| `locked` | `true` / `false` | Campo de solo lectura |
| `locking` | `true` / `false` | Comportamiento de bloqueo persistente |

---

## 15. Atributos CSS - Elevacion y Sombras

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `elevation` | Número (0-24) | Elevacion del elemento (genera sombra en Android, estilo Material Design) |
| `shadow-color` | `#RRGGBB` | Color de la sombra |

```css
.tarjetaElevada {
    bgcolor: #FFFFFF;
    border-corner-radius: 12;
    elevation: 5;
}

.tarjetaFlotante {
    bgcolor: #FFFFFF;
    border-corner-radius: 16;
    elevation: 12;
    shadow-color: #1A000000;
}
```

> **NOTA:** La elevacion funciona principalmente en Android. En iOS el efecto puede variar. Como alternativa se pueden usar bordes sutiles para simular profundidad en iOS.

---

## 16. Atributos de Coleccion (`coll`)

### General

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `notab` | `true`/`false` | Sin pestanas |
| `group-swipe` | `true`/`false` | Swipe entre grupos |
| `show-toolbar` | `true`/`false` | Mostrar toolbar |
| `editmask` | Número | Mascara de edición (0 = sin mascara) |
| `nomenmask` | Número | Mascara de nomenclatura |
| `dependent` | `true`/`false` | Coleccion dependiente |
| `check-owner` | `true`/`false` | Verificar propietario |
| `show-selected-item` | `true`/`false` | Mostrar item seleccionado |
| `selected-item-start-index` | Número | Índice inicial de selección (-1=ninguno) |
| `viewmode` | `gridview`/`mapview`/`listview` | Modo de visualizacion |
| `gallery-columns` | Número | Columnas en modo galería |
| `drawer-orientation` | `left`/`right` | Orientación del drawer |

### Celdas Grid

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `cell-bgcolor` | `#RRGGBB` | Fondo celda |
| `cell-forecolor` | `#RRGGBB` | Texto celda |
| `cell-odd-color` | `#RRGGBB` | Color celdas impares (alternancia) |
| `cell-even-color` | `#RRGGBB` | Color celdas pares (alternancia) |
| `cell-border` | `true`/`false` | Borde celdas |
| `cell-border-color` | `#RRGGBB` | Color borde celda |
| `cell-border-width` | Número | Grosor borde |
| `cell-tpadding` / `cell-bpadding` | `Np` | Padding celda |
| `cell-align` | `left`/`center`/`right` | Alineacion celda |
| `cell-selected-bgcolor` | `#RRGGBB`/`#AARRGGBB` | Fondo selección |
| `cell-selected-forecolor` | `#RRGGBB` | Texto selección |

### Tabs

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `tab-visible` | `true`/`false` | Mostrar tabs |
| `tab-height` | `Np` | Altura tabs |
| `tab-fontsize` | Número | Tamaño fuente |
| `tab-bgcolor` | `#RRGGBB` | Fondo tabs |
| `tab-forecolor` | `#RRGGBB` | Texto tabs |
| `tab-selected-forecolor` | `#RRGGBB` | Texto seleccionado |
| `tab-indicator-color` | `#RRGGBB` | Indicador |

### Animaciones de coleccion

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `animation-in` | Token animación | Animación de entrada |
| `animation-out` | Token animación | Animación de salida |

```css
coll {
    notab: true;
    group-swipe: false;
    show-toolbar: false;
    editmask: 0;
    cell-bgcolor: #F2F2F2;
    cell-border-color: #00000000;
    cell-border-width: 0;
    cell-selected-bgcolor: #00000000;
    show-selected-item: false;
    selected-item-start-index: -1;
    animation-in: "##RIGHT_IN##";
    animation-out: "##RIGHT_OUT##";
}
```

## 21. Machine Learning

`ml-model-descriptor: modelo.json` - Separar por plataforma con `default_ios.css`.

## 26. Referencia de Transparencia Alpha (ARGB)

| % | Hex | Negro | Blanco |
|:-:|:---:|:-----:|:------:|
| 100% | FF | #FF000000 | #FFFFFFFF |
| 90% | E6 | #E6000000 | #E6FFFFFF |
| 80% | CC | #CC000000 | #CCFFFFFF |
| 70% | B3 | #B3000000 | #B3FFFFFF |
| 60% | 99 | #99000000 | #99FFFFFF |
| 50% | 80 | #80000000 | #80FFFFFF |
| 40% | 66 | #66000000 | #66FFFFFF |
| 30% | 4D | #4D000000 | #4DFFFFFF |
| 20% | 33 | #33000000 | #33FFFFFF |
| 10% | 1A | #1A000000 | #1AFFFFFF |
| 0% | 00 | #00000000 | #00FFFFFF |

Intermedios: 95%=F2, 85%=D9, 75%=BF, 65%=A6, 55%=8C, 45%=73, 35%=59, 25%=40, 15%=26, 5%=0D

## 28. Errores Comunes

| Error | Incorrecto | Correcto |
|-------|-----------|----------|
| Unidades web | `font-size: 14px` | `fontsize: 14` |
| Guiones básicos | `bg-color: #FFF` | `bgcolor: #FFFFFF` |
| Alpha RGBA | `#00000080` | `#80000000` (ARGB) |
| Abreviados | `margin: 10p` | `tmargin: 10p; bmargin: 10p; ...` |
| Selectores web | `div.header {}` | `.header {}` |
| Sin extends | Duplicar atributos | `extends: .base; bgcolor: #NEW;` |

