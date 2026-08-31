# XOne CSS — Propiedades disponibles y herencia extends

> Fuente: `xone/v2/xone-help-docs/topics/04-css-styling-guide.md` §5–§6. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §5 propiedades por categoría (dimensiones, márgenes, padding, fuentes, texto, fondo, bordes, sombras, visibilidad, Material) · §6 sistema de herencia extends con patrones y cadenas

---

## 5. Propiedades CSS Disponibles

### 5.1 Dimensiones

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `width` | `Np` / `N%` | Ancho del elemento |
| `height` | `Np` / `N%` | Alto del elemento |
| `size` | Número | Tamaño de la columna en BD (en caracteres). Con `fixed-text="true"` también limita la entrada en UI |
| `fieldsize` | Número | Ancho visual de la caja del campo (ancho de carácter x valor). Usar `width` en proyectos nuevos — tiene prioridad sobre `fieldsize` |

**Ejemplo correcto vs incorrecto:**

```css
/* INCORRECTO */
.error {
    width: 100px;         /* MAL: px */
    height: 56rem;        /* MAL: rem */
    min-width: 200px;     /* MAL: atributo web no soportado */
    max-height: 500px;    /* MAL: atributo web no soportado */
}

/* CORRECTO */
.correcto {
    width: 100%;
    height: 56p;
}
```

**Ejemplo real - Dimensiones de frames (proyecto UseCars):**

```css
.frameHeader {
    width: 100%;
    height: 140p;
}

.frameBody {
    width: 100%;
    height: 100%;
}

.frameFooter {
    width: 100%;
    height: 120p;
}
```

**Ejemplo real - Dimensiones de botones:**

```css
.btnPrimario {
    width: 90%;
    height: 56p;
}

.btnFlotante {
    width: 64p;
    height: 64p;
}
```

### 5.2 Margenes

XOne usa atributos individuales para cada lado del margen. **NO existe** un atributo abreviado `margin`.

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `tmargin` | `Np` / `N%` | Margen superior (top) |
| `bmargin` | `Np` / `N%` | Margen inferior (bottom) |
| `lmargin` | `Np` / `N%` | Margen izquierdo (left) |
| `rmargin` | `Np` / `N%` | Margen derecho (right) |

**Ejemplo correcto vs incorrecto:**

```css
/* INCORRECTO */
.error {
    margin: 10p;              /* MAL: atributo abreviado no existe */
    margin-top: 10p;          /* MAL: nombre CSS web */
    margin-left: 20px;        /* MAL: nombre y unidad incorrectos */
}

/* CORRECTO */
.correcto {
    tmargin: 10p;
    bmargin: 10p;
    lmargin: 20p;
    rmargin: 20p;
}
```

**Ejemplo real - Tarjeta con margenes (proyecto UseCars):**

```css
.tarjeta {
    width: 95%;
    bgcolor: #FFFFFF;
    border-corner-radius: 12;
    tmargin: 10p;
    bmargin: 5p;
    lmargin: 10p;
    rmargin: 10p;
}
```

### 5.3 Padding

Similar a los margenes, el padding usa atributos individuales. **NO existe** un atributo abreviado `padding`.

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `tpadding` | `Np` | Padding superior (top) |
| `bpadding` | `Np` | Padding inferior (bottom) |
| `lpadding` | `Np` | Padding izquierdo (left) |
| `rpadding` | `Np` | Padding derecho (right) |

**Ejemplo correcto vs incorrecto:**

```css
/* INCORRECTO */
.error {
    padding: 10p;             /* MAL: atributo abreviado no garantizado */
    padding-top: 10px;        /* MAL: nombre y unidad CSS web */
}

/* CORRECTO */
.correcto {
    tpadding: 10p;
    bpadding: 10p;
    lpadding: 15p;
    rpadding: 15p;
}
```

**Ejemplo real - Card con padding (proyecto SocialNetwork):**

```css
.framePost {
    width: 100%;
    bgcolor: #FFFFFF;
    tmargin: 2p;
    tpadding: 15p;
    bpadding: 15p;
    lpadding: 15p;
    rpadding: 15p;
}
```

### 5.4 Fuentes

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `fontname` | `NombreFuente.ttf` | Fuente personalizada (archivo .ttf en carpeta `fonts/`) |
| `fontsize` | Número, **escala 1-12** (el parser acepta 1-50) | Tamaño de fuente (sin unidad) |
| `fontbold` | `true`/`false` | Texto en negrita |
| `fontitalic` | `true`/`false` | Texto en cursiva |
| `text-fontsize` | Número | Tamaño de fuente del texto editable |
| `labelfont-size` / `labelfontsize` | Número | Tamaño de fuente de la etiqueta |
| `textfont-size` / `textfontsize` / `text-font-size` | Número | Tamaño de fuente del texto editable (alternativa) |
| `labelfont-bold` | `true`/`false` | Etiqueta en negrita |
| `textfont-bold` | `true`/`false` | Texto editable en negrita |
| `textfont-italic` | `true`/`false` | Texto editable en cursiva |
| `labelshadow` | `true`/`false` | Sombra en etiqueta |

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


**Ejemplo correcto vs incorrecto:**

```css
/* INCORRECTO */
.error {
    font-size: 14px;          /* MAL: nombre y unidad CSS web */
    font-family: 'Roboto';    /* MAL: nombre CSS web */
    font-weight: bold;        /* MAL: nombre CSS web */
    font-style: italic;       /* MAL: nombre CSS web */
}

/* CORRECTO */
.correcto {
    fontsize: 14;
    fontname: Roboto-Regular.ttf;
    fontbold: true;
    fontitalic: true;
}
```

**Ejemplo real - Diferentes estilos de fuente (proyecto UseCars):**

```css
/* Titulo grande */
.textoTituloGrande {
    fontsize: 28;
    fontname: Roboto-Bold.ttf;
    forecolor: #FFFFFF;
    text-align: center;
}

/* Texto normal */
.textoNormal {
    fontsize: 14;
    forecolor: #212121;
}

/* Texto secundario */
.textoSecundario {
    fontsize: 14;
    forecolor: #9E9E9E;
}

/* Texto pequeno */
.textoPequeno {
    fontsize: 12;
    forecolor: #9E9E9E;
}
```

> **Referencia cruzada:** Las fuentes personalizadas deben colocarse en la carpeta `fonts/` del proyecto. Consultar el tópico 01 - Fundamentos.

### 5.5 Texto

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `forecolor` | `#RRGGBB` / `#AARRGGBB` | Color del texto principal y etiqueta |
| `forecolor-disabled` | `#RRGGBB` | Color de la fuente cuando deshabilitado |
| `text-forecolor` | `#RRGGBB` | Color del texto editable |
| `text-forecolor-disabled` | `#RRGGBB` | Color del texto editable cuando deshabilitado |
| `text-align` | `left`/`center`/`right` | Alineacion horizontal del texto |
| `align` | Combinacion con `\|` | Alineacion combinada del contenedor |
| `lines` | Número | Número de lineas visibles |
| `fixed-lines` | `true`/`false` | Altura fija basada en lineas |
| `locked` | `true`/`false` | Campo de solo lectura |
| `locking` | `true`/`false` | Comportamiento de bloqueo |
| `mask` | `"formato"` | Mascara de formato |

**Combinaciones de `align`:**

```css
.centradoTotal {
    align: center;              /* Centro horizontal y vertical */
}

.arribaIzquierda {
    align: top|left;            /* Esquina superior izquierda */
}

.abajoCentro {
    align: bottom|center;       /* Abajo centrado horizontalmente */
}

.derechaCentro {
    align: right|center;        /* Derecha centrado verticalmente */
}
```

**Ejemplo real - Diferentes alineaciones:**

```css
/* Header centrado (proyecto UseCars) */
.frameHeader {
    width: 100%;
    height: 140p;
    bgcolor: #0D47A1;
    align: center;
}

/* Header alineado a izquierda (proyecto MiMensajeria) */
.frameHeader {
    width: 100%;
    height: 56p;
    bgcolor: #1565C0;
    align: left;
}
```

### 5.6 Fondo

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `bgcolor` | `#RRGGBB` / `#AARRGGBB` | Color de fondo del elemento |
| `bgcolor-disabled` | `#RRGGBB` | Color de fondo cuando deshabilitado |
| `bgcolor-focus` | `#RRGGBB` | Color de fondo al recibir foco |
| `text-bgcolor` | `#RRGGBB` | Color de fondo del texto editable |
| `text-bgcolor-focus` | `#RRGGBB` | Color de fondo del texto al recibir foco |
| `text-bgcolor-disabled` | `#RRGGBB` | Color de fondo del texto cuando deshabilitado |
| `imgbk` | `nombre.png` / `nombre.svg` | Imagen de fondo del elemento. Acepta PNG, JPG y SVG (el SVG se renderiza nativo, no requiere WebView ni conversion) |

**Ejemplo correcto vs incorrecto:**

```css
/* INCORRECTO */
.error {
    background-color: #FFF;        /* MAL: nombre CSS web */
    background: url(fondo.png);    /* MAL: sintaxis CSS web */
    background-image: linear-gradient(...); /* MAL: gradientes no soportados */
}

/* CORRECTO */
.correcto {
    bgcolor: #FFFFFF;
    imgbk: fondo.png;
}
```

**Ejemplo real - Fondos con transparencia (proyecto UseCars):**

```css
/* Header transparente para mapas */
.frameHeaderTransparente {
    width: 100%;
    height: 100p;
    bgcolor: #00FFFFFF;  /* Completamente transparente */
    align: center;
}
```

### 5.7 Bordes

XOne distingue entre **bordes de texto** (área editable del campo) y **bordes de contenedor** (frame o prop completo).

#### Bordes de texto

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `text-border` | `true`/`false` | Mostrar borde alrededor del texto |
| `text-border-left` | `true`/`false` | Borde izquierdo del texto |
| `text-border-right` | `true`/`false` | Borde derecho del texto |
| `text-border-top` | `true`/`false` | Borde superior del texto |
| `text-border-bottom` | `true`/`false` | Borde inferior del texto |
| `text-border-color` | `#RRGGBB` | Color del borde de texto |
| `text-border-width` | `Np` | Grosor del borde de texto |

#### Bordes de contenedor

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `border` | `true`/`false` | Borde general del contenedor |
| `border-width` | Número (sin unidad) | Grosor del borde |
| `border-color` | `#RRGGBB` | Color del borde |
| `border-corner-radius` | Número (sin unidad) | Radio de todas las esquinas redondeadas |
| `border-corner-radius-top-left` | Número | Radio esquina superior izquierda |
| `border-corner-radius-top-right` | Número | Radio esquina superior derecha |
| `border-corner-radius-bottom-left` | Número | Radio esquina inferior izquierda |
| `border-corner-radius-bottom-right` | Número | Radio esquina inferior derecha |
| `border-top` | `true`/`false` | Borde superior |
| `border-top-color` | `#RRGGBB` | Color borde superior |
| `border-bottom` | `true`/`false` | Borde inferior |
| `border-bottom-color` | `#RRGGBB` | Color borde inferior |
| `framebox` | `true`/`false` | Estilo de caja del frame (muestra un borde/contenedor alrededor del frame) |
| `grid-framebox` | `true`/`false` | Borde de frame en modo grid/lista |
| `grid-text-border` | `true`/`false` | Borde de texto en modo grid/lista |

**Patron Material Design - Solo borde inferior:**

Este es el patron más común para campos de texto en aplicaciones Material Design. Se usa extensivamente en todos los proyectos de ejemplo:

```css
.inputMaterial {
    text-border: true;
    text-border-left: false;
    text-border-right: false;
    text-border-top: false;
    text-border-bottom: true;
    text-border-color: #BDBDBD;
}
```

**Patron - Panel con esquinas superiores redondeadas:**

Usado para paneles inferiores deslizables que tapan parte del contenido:

```css
.panelInferior {
    width: 100%;
    bgcolor: #FFFFFF;
    border-corner-radius-top-left: 24;
    border-corner-radius-top-right: 24;
}
```

**Ejemplo correcto vs incorrecto:**

```css
/* INCORRECTO */
.error {
    border-radius: 8px;           /* MAL: nombre y unidad CSS web */
    border: 1px solid #ccc;       /* MAL: sintaxis abreviada CSS web */
    box-shadow: 0 2px 4px #000;   /* MAL: box-shadow no soportado */
}

/* CORRECTO */
.correcto {
    border-corner-radius: 8;
    border: true;
    border-width: 1;
    border-color: #CCCCCC;
}
```

### 5.8 Sombras y Elevacion

XOne no soporta `box-shadow` ni `text-shadow` de CSS web. Sin embargo, algunos atributos de elevacion están disponibles:

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `elevation` | Número | Elevacion del elemento (sombra en Android) |
| `shadow-color` | `#RRGGBB` | Color de la sombra |

> **NOTA:** La elevacion funciona principalmente en Android. En iOS el efecto puede variar. No todos los proyectos la usan; la alternativa más común es usar bordes sutiles (`border: true; border-color: #E0E0E0;`) para dar sensacion de profundidad.

### 5.9 Visibilidad

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `visible` | Número (bitmask 0-7) | Mascara de visibilidad |
| `labelbox` | `true`/`false` | Mostrar caja contenedora de etiqueta |

**Sistema de visibilidad por bitmask:**

El atributo `visible` usa un sistema de mascara de bits que controla en que modos de visualizacion aparece el campo:

| Valor | Edición | Lista | Contents | Descripción |
|:-----:|:-------:|:-----:|:--------:|-------------|
| `0` | Oculto | Oculto | Oculto | Campo completamente oculto |
| `1` | Visible | Oculto | Oculto | Solo en modo edición |
| `2` | Oculto | Visible | Oculto | Solo en modo lista |
| `3` | Visible | Visible | Oculto | En edición y lista |
| `4` | Oculto | Oculto | Visible | Solo en contents (listas embebidas) |
| `5` | Visible | Oculto | Visible | En edición y contents |
| `6` | Oculto | Visible | Visible | En lista y contents |
| `7` | Visible | Visible | Visible | Visible en todos los modos |

> **Referencia cruzada:** Para comprender los modos de visualizacion (edición, lista, contents), consultar el tópico 02 - Estructura XML.

### 5.10 Otros

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `newline` | `true`/`false` | Forzar nueva linea (salto de linea) |
| `scroll` | `true`/`false` | Habilitar scroll en el contenedor |
| `fixed` | `true`/`false` | Elemento fijo (no se desplaza con scroll) |
| `orientation` | `top`/`bottom` | Posición del elemento fijo |
| `floating` | `true`/`false` | Frame flotante |
| `top` | `Np` | Posición vertical de frame flotante |
| `left` | `Np` | Posición horizontal de frame flotante |
| `ripple-effect` | `true`/`false` | Efecto ripple Material Design al pulsar (solo Android) |
| `elevation` | Número | Elevacion/sombra Material Design (principalmente Android) |
| `imgbk` | `nombre.png` | Imagen de fondo del elemento |
| `undo-button` | `true`/`false` | Mostrar botón deshacer |
| `apply-css` | `true`/`false` | Aplicar estilos CSS al componente |
| `locked` | `true`/`false` | Campo de solo lectura |
| `zoom-controls` | `true`/`false` | Controles de zoom en webviews |
| `img` | `nombre.png` | Imagen del botón/control |
| `imgsel` | `nombre_sel.png` | Imagen al seleccionar/pulsar |
| `img-width` | Número | Ancho de iconos del sistema |
| `img-height` | Número | Alto de iconos del sistema |

### 5.11 Propiedades Material Design y Componentes Especiales

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `ripple-effect` | `true`/`false` | Efecto de onda al tocar (Material Design, solo Android) |
| `elevation` | Número (0-24) | Nivel de elevacion que genera sombra bajo el elemento |
| `shadow-color` | `#RRGGBB` | Color de la sombra generada por elevation |
| `track-color` | `#RRGGBB` | Color de la pista para controles tipo slider o switch |
| `thumb-color` | `#RRGGBB` | Color del pulgar/indicador para controles tipo slider o switch |
| `check-color-checked` | `#RRGGBB` | Color del checkbox cuando esta marcado/activo |

**Ejemplo - Botón con efecto ripple y elevacion:**

```css
.btnMaterial {
    width: 90%;
    height: 56p;
    bgcolor: #1565C0;
    forecolor: #FFFFFF;
    border-corner-radius: 28;
    ripple-effect: true;
    elevation: 4;
}
```

**Ejemplo - Switch/Slider personalizado:**

```css
.switchPersonalizado {
    track-color: #BBDEFB;
    thumb-color: #1565C0;
    check-color-checked: #4CAF50;
}
```

> **NOTA:** La propiedad `elevation` funciona principalmente en Android, donde genera una sombra real bajo el elemento. En iOS, el efecto puede variar o no ser visible. Como alternativa multiplataforma, se pueden usar bordes sutiles (`border: true; border-color: #E0E0E0;`) para dar sensacion de profundidad.

**Ejemplo - Footer fijo en la parte inferior (proyecto SocialNetwork):**

```css
.frameFooter {
    width: 100%;
    height: 120p;
    bgcolor: #FFFFFF;
    align: center;
    fixed: true;
    orientation: bottom;
}
```

**Ejemplo - FAB flotante (proyecto SocialNetwork):**

```css
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

## 6. Sistema de Herencia `extends:`

### 6.1 Sintaxis: extends:.claseBase

El atributo `extends` permite que una clase CSS herede todos los atributos de otra clase base. La clase referenciada debe incluir el prefijo de punto (`.`).

```css
.claseHija {
    extends: .claseBase;
    /* Solo sobreescribir lo que cambia */
}
```

### 6.2 Herencia simple

El caso más común: una clase hereda de otra y sobreescribe algunos atributos.

```css
/* Clase base */
.btnPrimario {
    width: 90%;
    height: 56p;
    bgcolor: #1565C0;
    forecolor: #FFFFFF;
    border-corner-radius: 28;
    text-align: center;
    fontsize: 16;
    fontname: Roboto-Bold.ttf;
}

/* Clase hija - Solo cambia el color de fondo */
.btnPeligro {
    extends: .btnPrimario;
    bgcolor: #F44336;
}
```

La clase `.btnPeligro` tendra TODOS los atributos de `.btnPrimario` (width, height, forecolor, border-corner-radius, text-align, fontsize, fontname) pero con `bgcolor: #F44336` en lugar de `#1565C0`.

### 6.3 Herencia multiple (en cadena)

Se puede crear una cadena de herencia donde A extiende B, que a su vez extiende C.

```css
/* Nivel 1: Base generica */
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

/* Nivel 2: Variantes que heredan de la base */
.badgePendiente {
    extends: .badgeEstado;
    bgcolor: #FFC107;
    forecolor: #212121;
}

.badgeAsignado {
    extends: .badgeEstado;
    bgcolor: #2196F3;
}

.badgeEntregado {
    extends: .badgeEstado;
    bgcolor: #4CAF50;
}

.badgeCancelado {
    extends: .badgeEstado;
    bgcolor: #9E9E9E;
}
```

### 6.4 Sobreescritura de propiedades

Los atributos definidos en la clase hija siempre **sobreescriben** los heredados de la clase base:

```css
.botonBase {
    width: 90%;
    height: 56p;
    bgcolor: #0066CC;
    forecolor: #FFFFFF;
}

.botonSecundario {
    extends: .botonBase;
    bgcolor: #FFFFFF;         /* Sobreescribe bgcolor */
    forecolor: #0066CC;       /* Sobreescribe forecolor */
    border: true;             /* Anade nuevo atributo */
    border-color: #0066CC;    /* Anade nuevo atributo */
}
```

Resultado de `.botonSecundario`:
- `width: 90%` (heredado)
- `height: 56p` (heredado)
- `bgcolor: #FFFFFF` (sobreescrito)
- `forecolor: #0066CC` (sobreescrito)
- `border: true` (nuevo)
- `border-color: #0066CC` (nuevo)

### 6.5 Herencia desde selectores globales y de tipo

Es posible usar `extends` para heredar no solo de clases (`.nombreClase`) sino también de selectores globales (`prop`, `coll`) y selectores de tipo (`prop:T`, `prop:B`, etc.).

**Extends desde `prop` (selector global):**

```css
.classprop {
    extends: prop;
    lmargin: 2%;
    tmargin: 0p;
    text-border: true;
    text-border-width: 1p;
}
```

La clase `.classprop` hereda todos los atributos definidos en el selector global `prop` (fontname, fontsize, forecolor, etc.) y anade o sobreescribe los indicados.

**Extends desde `prop:B` (selector de tipo):**

```css
.btnButton {
    extends: prop:B;
    visible: 1;
    align: center;
    width: 300p;
    height: 100p;
    fontsize: 9;
    labelwidth: 1;
    fontbold: true;
    label-wrap: true;
    tmargin: 20p;
    lmargin: 30p;
}
```

La clase `.btnButton` hereda los estilos base definidos para todos los botones (`prop:B`) y los extiende con posicionamiento y tamaño especificos.

**Extends desde `prop:T` (crear un input personalizado basado en campos de texto):**

```css
.myInputCustom {
    extends: prop:T;
    text-border: true;
    text-border-bottom: true;
    text-border-left: false;
    text-border-right: false;
    text-border-top: false;
    text-border-color: #1565C0;
    fontsize: 16;
}
```

### 6.6 Herencia encadenada (multiples niveles)

Se puede crear una cadena de herencia de multiples niveles donde A extiende B, y B extiende C. XOne resuelve toda la cadena de herencia, de modo que A recibe los atributos de C + B + los suyos propios.

```css
/* Nivel 1: Hereda del selector global prop */
.classprop {
    extends: prop;
    lmargin: 2%;
    text-border: true;
}

/* Nivel 2: Hereda de .classprop (que a su vez hereda de prop) */
.classtl {
    extends: .classprop;
    labelbox: true;
    width: 96%;
    align: center;
    bgcolor: #00000000;
    border: true;
    border-color: DarkBlue;
    border-width: 1p;
    elevation: 7;
}

/* Nivel 3: Hereda de .classtl */
.classtlResaltado {
    extends: .classtl;
    bgcolor: #E3F2FD;
    border-color: #1565C0;
}
```

En este ejemplo, `.classtlResaltado` recibe:
- De `prop`: fontname, fontsize, forecolor, etc.
- De `.classprop`: lmargin, text-border
- De `.classtl`: labelbox, width, align, border, elevation
- Propios: bgcolor y border-color sobreescritos

> **IMPORTANTE:** No hay limite técnico para la cantidad de niveles de herencia encadenada, pero se recomienda no superar 3-4 niveles para mantener la legibilidad y facilidad de depuracion. Además, **no se permite la herencia circular** (A extends B extends A), ya que provocaria un bucle infinito.

### 6.7 Patrones de herencia recomendados

**Patron 1: Variantes de botón (el más común):**

```css
/* Base */
.btnBase {
    width: 90%;
    height: 56p;
    border-corner-radius: 28;
    text-align: center;
    fontsize: 16;
    fontname: Roboto-Bold.ttf;
}

/* Variantes */
.btnPrimario {
    extends: .btnBase;
    bgcolor: #1565C0;
    forecolor: #FFFFFF;
}

.btnSecundario {
    extends: .btnBase;
    bgcolor: #FFFFFF;
    forecolor: #1565C0;
    border: true;
    border-color: #1565C0;
}

.btnPeligro {
    extends: .btnBase;
    bgcolor: #F44336;
    forecolor: #FFFFFF;
}

.btnExito {
    extends: .btnBase;
    bgcolor: #4CAF50;
    forecolor: #FFFFFF;
}
```

**Patron 2: Variantes de input:**

```css
.inputBase {
    width: 95%;
    height: 56p;
    text-border: true;
    text-border-bottom: true;
    text-border-left: false;
    text-border-right: false;
    text-border-top: false;
    text-border-color: #BDBDBD;
    fontsize: 14;
}

.inputEnfocado {
    extends: .inputBase;
    text-border-color: #1565C0;
}

.inputError {
    extends: .inputBase;
    text-border-color: #F44336;
}
```

**Patron 3: Variantes de texto:**

```css
.textoBase {
    fontname: Roboto-Regular.ttf;
    labelwidth: 0;
}

.textoTitulo {
    extends: .textoBase;
    fontsize: 20;
    fontname: Roboto-Bold.ttf;
    forecolor: #212121;
}

.textoSubtitulo {
    extends: .textoBase;
    fontsize: 16;
    forecolor: #616161;
}

.textoSecundario {
    extends: .textoBase;
    fontsize: 14;
    forecolor: #9E9E9E;
}
```

**Patron 4: Herencia desde selector global con `extends: prop`:**

```css
.xnCheckbox {
    extends: prop;
    apply-css: true;
    labelwidth: 1;
    img-width: 50p;
    text-bgcolor: #00000000;
}
```

### 6.8 Cuando usar extends vs clases multiples

| Situación | Usar `extends` | Usar multiples clases |
|-----------|:--------------:|:---------------------:|
| Variantes de color de un mismo componente | SI | No |
| Combinar layout con color | No | SI |
| Badges de estado (misma forma, distinto color) | SI | No |
| Frame con animación | No | SI |
| Botones con diferente acción (mismo estilo base) | SI | No |

**Ejemplo - Multiples clases en XML:**

```xml
<frame name="frmEncabezado" class="frameHeader animSlideRight">
```

**Ejemplo - Extends en CSS:**

```css
.btnDanger {
    extends: .btnPrimary;
    bgcolor: #F44336;
}
```

