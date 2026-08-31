# XOne CSS — Selectores, unidades y colores

> Fuente: `xone/v2/xone-help-docs/topics/04-css-styling-guide.md` §1–§4. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §1 qué es y qué no es · §2 selectores coll/prop/prop:TYPE/.clase/group/frame · §3 unidades p, % y sin unidad · §4 colores #RRGGBB y #AARRGGBB con paletas

---

## 1. Introduccion al CSS de XOne

### 1.1 Que es y que NO es

El sistema CSS de XOne es un **sistema de estilos propietario** inspirado en la sintaxis de CSS web, pero disenado especificamente para controlar la apariencia y el comportamiento de aplicaciones móviles nativas generadas para Android e iOS.

**Lo que ES:**

- Un lenguaje de estilos con sintaxis similar a CSS web (selectores, llaves, atributos con valor)
- Un sistema con atributos propietarios especificos para componentes UI móviles
- Un mecanismo de cascada con archivos por plataforma, orientación y tema
- Un sistema con herencia explicita mediante el atributo `extends`

**Lo que NO es:**

- **NO es CSS web estándar.** Aunque se parece, las reglas son distintas.
- **NO soporta** Flexbox, Grid, media queries, pseudo-clases, pseudo-elementos, transiciones, transformaciones, gradientes, ni selectores combinadores (`>`, `+`, `~`, espacio descendiente).
- **NO usa** las unidades `px`, `em`, `rem`, `vh`, `vw`, `vmin`, `vmax`.
- **NO permite** `@media`, `@keyframes`, `@font-face` (las fuentes se referencian directamente por nombre de archivo).

**Lo que SÍ es (subconjunto admitido por el parser):**

- **Variables CSS**: `:root { --color: #FF0000; }` + `var(--color)` con fallback. Globales en `:root` y locales con scope de bloque. Una variable puede referenciar a otra.
- **`calc(...)`**: aritmética con `+`, `-`, `*`, `/` y paréntesis sobre números puros (sin unidades).
- **`@import`**: para componer una hoja a partir de otras. Solo al inicio del archivo.
- **`@extend selector;`**: at-rule alternativa al atributo `extends:` tradicional. Copia las declaraciones en post-pasada del parser.
- **`!important` y `!default`**: control de cascada por declaración.
- **Comentarios** `/* */` y `//` (este último, de una sola línea).
- **Selectores múltiples**: `a, b, c { ... }` aplica el bloque a cada selector como instancia independiente.

**Diferencias clave con CSS web:**

| Concepto | CSS Web | CSS XOne |
|----------|---------|----------|
| Unidades de medida | `px`, `em`, `rem`, `vw`, `vh` | `p` (puntos), `%` (porcentaje) |
| Color con alpha | `rgba(0,0,0,0.5)` o `#00000080` | `#80000000` (formato **ARGB**, alpha primero) |
| Tamaño de fuente | `font-size: 14px` | `fontsize: 14` (sin unidad) |
| Margen superior | `margin-top: 10px` | `tmargin: 10p` |
| Negrita | `font-weight: bold` | `fontbold: true` |
| Nombre de fuente | `font-family: 'Roboto'` | `fontname: Roboto-Regular.ttf` |
| Color de fondo | `background-color: #fff` | `bgcolor: #FFFFFF` |
| Padding izquierdo | `padding-left: 20px` | `lpadding: 20p` |
| Bordes redondeados | `border-radius: 8px` | `border-corner-radius: 8` (sin unidad) |
| Ocultar elemento | `display: none` | `visible: 0` |
| Scroll | `overflow: scroll` | `scroll: true` |
| Posición fija | `position: fixed` | `fixed: true` |
| Herencia de estilos | Cascada automática | `extends: .nombreClase` o `@extend .nombreClase;` |
| Variables | `var(--mi-color)` | `:root { --mi-color: red; }` + `var(--mi-color)` (admite fallback y anidamiento) |
| Aritmética | `calc(8px * 2)` | `calc(8 * 2)` (sobre números puros, sin unidades) |
| Importación | `@import url("base.css")` | `@import "base.css";` (solo al inicio del archivo) |
| Responsive | `@media (max-width: 600px)` | NO SOPORTADO (archivos separados por plataforma) |
| Layout flexible | `display: flex` | NO SOPORTADO (usar `frame` y `group` en XML) |

> **Referencia cruzada:** Para entender como se aplican las clases CSS en el XML de XOne, consultar el tópico 02 - Estructura XML. Para la estructura general de archivos del proyecto, consultar el tópico 01 - Fundamentos.

### 1.2 Donde se define

Los estilos se definen en archivos `.css` ubicados en la **raiz del proyecto** XOne.

**Archivo obligatorio:**

| Archivo | Descripción | Obligatorio |
|---------|-------------|:-----------:|
| `default.css` | Estilos base globales de la aplicación | SI |

**Archivos opcionales (reconocidos automáticamente por convencion de nombre):**

| Archivo | Descripción |
|---------|-------------|
| `default-colors.css` / `colors.css` | Paleta de colores separada (facilita tematizacion) |
| `default_night.css` | Variante tema oscuro |
| `default_day.css` | Variante tema claro |
| `default_portrait.css` | Estilos para orientación vertical |
| `default_landscape.css` | Estilos para orientación horizontal |
| `default_ios.css` | Estilos especificos para iOS |
| `default_wear.css` | Estilos para wearables (smartwatch) |
| `básico.css` | Estilos básicos reutilizables |

**Declaración en `app.xml`:**

Solo se declara el archivo `default.css` en la configuración de la aplicación. Los archivos variantes se cargan automáticamente por convencion de nombres.

```xml
<app ...>
    <style url="default.css" encoding="UTF-8" />
</app>
```

> **Referencia cruzada:** Para conocer la configuración completa de `app.xml`, consultar el tópico 01 - Fundamentos.

### 1.3 Como se aplica

Los estilos CSS se aplican a los elementos XML mediante el atributo `class`:

```xml
<!-- Clase simple -->
<frame name="frmHeader" class="frameHeader">

<!-- Multiples clases separadas por espacio -->
<prop name="txtNombre" class="textoEditable inputTextoLinea">
```

**Sistema de cascada (de menor a mayor prioridad):**

```
1. default.css              (Estilos base - MENOR prioridad)
2. default_ios.css          (Especifico de plataforma)
3. default_portrait.css     (Especifico de orientacion)
4. default_night.css        (Especifico de tema)
5. Atributos inline en XML  (MAYOR prioridad)
```

Esto significa que un atributo definido directamente en el nodo XML siempre gana sobre cualquier clase CSS, y un estilo de tema (`default_night.css`) gana sobre un estilo de plataforma (`default_ios.css`).

---

## 2. Selectores

XOne soporta un conjunto limitado pero funcional de selectores CSS. A diferencia de CSS web, **no existen** selectores de etiqueta HTML, selectores de ID (`#`), selectores combinadores (`>`, `+`, `~`), selectores de atributo (`[attr]`), ni pseudo-clases/pseudo-elementos.

### 2.1 Selector de coleccion: `coll`

Aplica estilos a **todas las colecciones** del proyecto. Una coleccion equivale a una pantalla o vista en la aplicación.

```css
coll {
    notab: true;
    show-toolbar: false;
    group-swipe: false;
    editmask: 0;
    bgcolor: #FFFFFF;
    cell-bgcolor: #F2F2F2;
    cell-border: false;
    cell-tpadding: 2p;
    cell-bpadding: 2p;
    show-selected-item: false;
}
```

**Atributos aplicables al selector `coll`:**

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `notab` | `true`/`false` | Ocultar pestanas de navegación |
| `show-toolbar` | `true`/`false` | Mostrar barra de herramientas |
| `group-swipe` | `true`/`false` | Permitir swipe entre grupos |
| `editmask` | Número | Mascara de edición |
| `nomenmask` | Número | Mascara de nomenclatura |
| `dependent` | `true`/`false` | Coleccion dependiente |
| `check-owner` | `true`/`false` | Verificar propietario |
| `bgcolor` | `#RRGGBB` | Color de fondo de la coleccion |
| `viewmode` | `gridview`/`mapview`/`listview` | Modo de visualizacion |
| `gallery-columns` | Número | Columnas en modo galería |
| `cell-bgcolor` | `#RRGGBB` | Color de fondo de las celdas de lista |
| `cell-odd-color` | `#RRGGBB` | Color de celdas impares (alternancia) |
| `cell-even-color` | `#RRGGBB` | Color de celdas pares (alternancia) |
| `cell-border-color` | `#RRGGBB` | Color del borde de celda |
| `cell-border-width` | Número | Grosor del borde de celda |
| `cell-selected-bgcolor` | `#RRGGBB` / `#AARRGGBB` | Fondo de celda seleccionada |
| `cell-tpadding` | `Np` | Padding superior de celda |
| `cell-bpadding` | `Np` | Padding inferior de celda |
| `show-selected-item` | `true`/`false` | Mostrar item seleccionado |
| `selected-item-start-index` | Número | Índice inicial de selección (-1=ninguno) |
| `animation-in` | Token animación | Animación de entrada |
| `animation-out` | Token animación | Animación de salida |

**Ejemplo real (proyecto UseCars):**

```css
coll {
    notab: true;
    show-toolbar: false;
    group-swipe: false;
    editmask: 0;
    bgcolor: #FFFFFF;
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

### 2.2 Selector de propiedad: `prop`

Aplica estilos por defecto a **todas las propiedades** (campos/controles) de la aplicación. Este selector es fundamental para establecer la tipografía base y el comportamiento visual de todos los campos.

```css
prop {
    fontname: Roboto-Regular.ttf;
    fontsize: 11;
    labelbox: false;
    label-wrap: true;
    text-border: false;
    forecolor: #212121;
}
```

**Ejemplo real (proyecto MiMensajeria) con fontsize diferente y más propiedades base:**

```css
prop {
    fontname: Roboto-Regular.ttf;
    fontsize: 14;
    labelbox: false;
    label-wrap: true;
    text-border: false;
    forecolor: #212121;
    text-forecolor: #333333;
    text-forecolor-disabled: #909090;
    visible: 1;
    lmargin: 0;
    tmargin: 0;
    width: 96%;
    labelwidth: 7;
    imgsel: ;
}
```

> **IMPORTANTE:** Los valores definidos en el selector `prop` sirven como base que todas las propiedades heredan. Es la forma de establecer una tipografía y comportamiento coherente en toda la aplicación.

### 2.3 Selector por tipo: `prop:TYPE`

Permite definir estilos especificos según el tipo de campo. Solo aplica a las propiedades (`<prop>`) que tengan el atributo `type` correspondiente.

**Tabla de todos los tipos soportados:**

| Selector | Tipo | Descripción |
|----------|------|-------------|
| `prop:T` | Texto | Campo de texto simple |
| `prop:L` | Label | Etiqueta de texto de solo lectura (forma preferida; coincide con `type="L"`) |
| `prop:TL` | Label (alias legacy) | Selector legacy que coincide con `type="TL"`. El selector debe coincidir literalmente con el `type` declarado en el XML. |
| `prop:N` | Numérico | Campo numérico entero |
| `prop:N2` | Numérico decimal | Campo numérico con 2 decimales |
| `prop:NC` | Checkbox | Campo de selección / casilla de verificación |
| `prop:B` | Botón | Botón de acción |
| `prop:Z` | Zona/Área | Contents, mapas, calendarios, gráficos |
| `prop:IMG` | Imagen | Campo de imagen estática/dinámica |
| `prop:AT` | Adjunto | Campo de archivo adjunto |
| `prop:PH` | Foto | Campo de fotografía |
| `prop:VD` | Video | Campo de video |
| `prop:D` | Fecha | Campo de fecha |
| `prop:DT` | Fecha-Hora | Campo de fecha y hora |
| `prop:X` | Password | Campo de contrasena |
| `prop:DR` | Dibujo/Firma | Campo de firma digital |
| `prop:WEB` | Web | Navegador embebido |

**Ejemplo - Configurar botones globalmente:**

```css
prop:B {
    forecolor: #000000;
    bgcolor: #CCCCCC;
    img-sel: ;
}
```

**Ejemplo - Configurar campos de imagen:**

```css
prop:IMG {
    labelwidth: 0;
    img-sign: bt_Firma.png;
    img-sign-sel: bt_Firma_sel.png;
}
```

**Ejemplo - Configurar campos tipo Zona (contents, mapas, gráficos):**

```css
prop:Z {
    extends: prop;
    bgcolor: #F2F2F2;
    width: 96%;
    lmargin: 2%;
    tmargin: 2%;
}
```

**Ejemplo - Configurar campos tipo Checkbox:**

```css
prop:NC {
    extends: prop;
    apply-css: true;
    labelwidth: 1;
    img-width: 50p;
    text-bgcolor: #00000000;
}
```

**Ejemplo - Configurar campos tipo Adjunto:**

```css
prop:AT {
    img-att: bt_attach.png;
    img-att-sel: bt_attach_sel.png;
}
```

> **IMPORTANTE:** Los selectores `prop:TYPE` permiten establecer estilos globales por tipo de control. Esto es especialmente útil para configurar iconos del sistema (como los de adjunto, firma, camara) una sola vez, en lugar de repetirlos en cada campo individual.

### 2.4 Selector de clase: `.nombreClase`

Define estilos reutilizables que se aplican mediante el atributo `class` en los nodos XML. Este es el selector más utilizado para crear componentes visuales personalizados.

**Sintaxis:**

```css
.miClase {
    width: 100%;
    height: 50p;
    bgcolor: #FF0000;
    forecolor: #FFFFFF;
}
```

**Uso en XML:**

```xml
<frame name="frmEjemplo" class="miClase">
<prop name="txtCampo" class="miClase">
```

**Convenciones de nomenclatura recomendadas:**

| Prefijo | Proposito | Ejemplo |
|---------|-----------|---------|
| `frame` | Contenedores de layout | `.frameHeader`, `.frameBody`, `.frameFooter` |
| `btn` | Botones | `.btnPrimario`, `.btnSecundario`, `.btnPeligro` |
| `input` | Campos de texto editables | `.inputTexto`, `.inputBusqueda` |
| `texto` | Etiquetas y textos no editables | `.textoTitulo`, `.textoSecundario` |
| `tarjeta` | Tarjetas/cards | `.tarjeta`, `.tarjetaViaje` |
| `item` | Items de lista | `.itemLista`, `.itemEnvio` |
| `badge` | Badges de estado | `.badgeEstado`, `.badgePendiente` |
| `avatar` | Imágenes circulares de usuario | `.avatar`, `.avatarGrande` |
| `icono` | Iconos | `.iconoAccion`, `.iconoPequeno` |
| `group` | Grupos y tabs | `.groupNoTab`, `.groupConTab` |
| `separador` | Separadores de lista | `.separador`, `.separadorConMargen` |
| `color` | Definiciones de color (en colors.css) | `.colorPrimario`, `.colorExito` |
| `anim` | Clases de animación | `.animFadeIn`, `.animSlideRight` |

### 2.5 Selector de grupo: `group`

Aplica estilos a todos los elementos `<group>` de la aplicación. También se pueden aplicar estilos a grupos individuales mediante clases CSS (`.nombreClase`) asignadas con el atributo `class` en el XML del grupo.

```css
group {
    tab-visible: false;
}
```

**Atributos de grupo más comunes:**

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `tab-visible` | `true`/`false` | Mostrar pestanas |
| `tab-height` | `Np` | Altura de pestanas |
| `tab-fontsize` | Número | Tamaño fuente de pestanas |
| `tab-bgcolor` | `#RRGGBB` | Color de fondo de pestanas |
| `tab-forecolor` | `#RRGGBB` | Color de texto de pestanas |
| `tab-selected-forecolor` | `#RRGGBB` | Color texto pestana seleccionada |
| `tab-indicator-color` | `#RRGGBB` | Color del indicador de pestana |

**Ejemplo real - Grupo con tabs azules (proyecto UseCars):**

```css
.groupConTab {
    tab-visible: true;
    tab-height: 56p;
    tab-fontsize: 14;
    tab-bgcolor: #0D47A1;
    tab-forecolor: #BBDEFB;
    tab-selected-forecolor: #FFFFFF;
    tab-indicator-color: #FFFFFF;
}
```

**Ejemplo real - Grupo sin tabs (todos los proyectos):**

```css
.groupNoTab {
    tab-visible: false;
}
```

**Ejemplo - Grupos fijos como Header/Footer:**

```css
.groupfixed_header {
    fixed: true;
    orientation: top;
    width: 100%;
    height: 120p;
}

.groupfixed_footer {
    fixed: true;
    orientation: bottom;
    width: 100%;
    height: 120p;
}
```

```xml
<group name="HEADER" id="10" class="groupfixed_header">
    <frame name="frmtitulo" class="frmsuperior">
        <!-- contenido header -->
    </frame>
</group>

<group name="FOOTER" id="0" class="groupfixed_footer">
    <frame name="frmFooter" class="frmsuperior">
        <!-- contenido footer -->
    </frame>
</group>
```

### 2.6 Selector de frame: `frame`

Aplica estilos a todos los elementos `<frame>` de la aplicación. Al igual que con los grupos, se pueden aplicar estilos a frames individuales mediante clases CSS asignadas con el atributo `class`.

```css
frame {
    bgcolor: #FFFFFF;
    framebox: false;
}
```

**Ejemplo - Estilos por clase para frames especificos:**

```css
/* Frame principal con contenido dinamico */
.frmPrincipal {
    width: 100%;
    height: 100%;
    bgcolor: #333333;
    scroll: true;
}

/* Frame superior con color dinamico */
.frmsuperior {
    width: 100%;
    height: 120p;
    bgcolor: ##FLD_MAP_COLORACTIVO##;
    align: left|center;
}

/* Frame contenido con elevacion */
.frameContenido {
    width: 100%;
    bgcolor: #FFFFFF;
    framebox: true;
    border-corner-radius: 10;
    elevation: 5;
}
```

> **NOTA:** En la práctica es más común usar clases (`.frameHeader`, `.frameBody`, `.frameFooter`) que el selector global `frame`, ya que cada frame suele tener estilos muy diferentes.

### 2.7 Resumen de selectores

| Selector | Aplica a | Ejemplo |
|----------|----------|---------|
| `coll` | Todas las colecciones (pantallas) | `coll { bgcolor: #FFFFFF; }` |
| `prop` | Todas las propiedades (campos/controles) | `prop { fontsize: 11; }` |
| `prop:T` | Todas las propiedades tipo Texto | `prop:T { text-border: true; }` |
| `prop:N` | Todas las propiedades tipo Numérico | `prop:N { text-align: right; }` |
| `prop:B` | Todas las propiedades tipo Botón | `prop:B { bgcolor: #CCCCCC; }` |
| `prop:NC` | Todas las propiedades tipo Checkbox | `prop:NC { apply-css: true; }` |
| `prop:Z` | Todas las propiedades tipo Zona | `prop:Z { bgcolor: #F2F2F2; }` |
| `prop:IMG` | Todas las propiedades tipo Imagen | `prop:IMG { labelwidth: 0; }` |
| `prop:D` | Todas las propiedades tipo Fecha | `prop:D { img-date: ic_date.png; }` |
| `group` | Todos los grupos | `group { tab-visible: false; }` |
| `frame` | Todos los frames | `frame { framebox: false; }` |
| `.clase` | Elementos con `class="clase"` | `.miClase { width: 100%; }` |

---

## 3. Unidades de Medida

### 3.1 `p` (puntos) - Unidad absoluta

La unidad `p` representa **pixels en el dispositivo de referencia** definido por `resolution-width` y `resolution-height` en `app.xml`. En el dispositivo de referencia, `1p = 1px` real. En cualquier otro dispositivo, XOne escala automáticamente con la fórmula `tamaño_real_px = valor_p × (resolucion_real / resolution-width)`.

> **CRÍTICO: `p` ≠ Material `dp`.** Es un error común asumir que `p` equivale a `dp` (density-independent pixels) de Android. **NO lo es.** Para el dispositivo de referencia por defecto de XOne (1080×1920, xxhdpi, density 3×), Material `56dp` ≈ `168p`, NO `56p`. Aplicar valores Material directamente como `p` produce barras/botones ~3× más pequeños de lo necesario.

| Material | `dp` | XOne `p` (1080×1920) |
|---|---|---|
| Toolbar | 56 | **164p**–`168p` (workflow: 164p) |
| Botón estándar | 48 | **144p** |
| Botón CTA pill | — | **124p** (workflow) |
| Icono toolbar | 24 | **72p** |
| Avatar lista | 40 | **120p** |
| Item lista | 48 | **144p** |
| FAB | 56 | **168p** |
| Touch target mínimo | 48 | **144p** |

```css
/* CORRECTO — calibrado para 1080×1920 */
.frameHeader {
    width: 100%;
    height: 164p;        /* Material 56dp × 3 = ~168p; workflow estándar 164p */
}

.btnPrimario {
    width: 90%;
    height: 124p;        /* Workflow "pill" CTA */
    border-corner-radius: 62;
}
```

**Cuando usar `p`:**

- Alturas fijas de headers, footers, botones
- Tamaños de iconos y avatares
- Margenes y paddings fijos
- Radios de bordes (aunque estos van sin unidad)
- Dimensiones de componentes que no deben cambiar con el tamaño de pantalla

### 3.2 `%` (porcentaje) - Unidad relativa

El porcentaje es relativo al **contenedor padre** (frame o grupo). Es la unidad recomendada para anchos y alturas que deben adaptarse al tamaño de pantalla.

```css
/* CORRECTO */
.frameBody {
    width: 100%;
    height: 100%;
}

.tarjeta {
    width: 95%;
    lmargin: 2.5%;
}
```

**Cuando usar `%`:**

- Anchos de contenedores principales (body, cards)
- Layouts responsivos
- Margenes laterales proporcionales
- Alturas de áreas que deben ocupar el espacio disponible

### 3.3 Sin unidad (numéricos)

Algunos atributos aceptan valores numéricos sin unidad:

| Atributo | Ejemplo | Nota |
|----------|---------|------|
| `fontsize` | `fontsize: 14` | Tamaño de fuente relativo |
| `border-corner-radius` | `border-corner-radius: 28` | Radio de esquinas |
| `border-width` | `border-width: 2` | Grosor de borde |
| `labelwidth` | `labelwidth: 30` | Proporcion etiqueta (0-100) |
| `lines` | `lines: 3` | Número de lineas visibles |
| `visible` | `visible: 7` | Mascara de visibilidad |
| `gallery-columns` | `gallery-columns: 3` | Columnas de galería |
| `img-width` / `img-height` | `img-width: 28` | Tamaño de iconos del sistema |

### 3.4 PROHIBIDO: px, em, rem, vh, vw

Las siguientes unidades **NO están soportadas** en XOne CSS y su uso producira comportamiento inesperado o sera ignorado:

| Unidad prohibida | Alternativa correcta en XOne |
|------------------|------------------------------|
| `px` | `p` (pixel en el dispositivo de referencia). **NO usar `dp`** — XOne lo ignora o lo trata como `p`. Material `56dp` no es `56p`: en 1080×1920 son `~168p` |
| `em` | Valor numérico sin unidad para `fontsize` |
| `rem` | Valor numérico sin unidad para `fontsize` |
| `vh` | `%` (porcentaje del contenedor padre) |
| `vw` | `%` (porcentaje del contenedor padre) |
| `vmin` / `vmax` | No tiene equivalente directo |
| `pt` | `p` (puntos XOne) |
| `cm` / `mm` / `in` | `p` (puntos XOne) |

**Ejemplo de errores frecuentes:**

```css
/* INCORRECTO - Unidades web no soportadas */
.miClase {
    height: 56px;         /* MAL: px no soportado */
    fontsize: 1.2em;      /* MAL: em no soportado */
    width: 100vw;         /* MAL: vw no soportado */
    margin-top: 10rem;    /* MAL: rem no soportado, y el atributo es tmargin */
}

/* CORRECTO - Unidades XOne */
.miClase {
    height: 56p;          /* BIEN: puntos */
    fontsize: 14;         /* BIEN: sin unidad */
    width: 100%;          /* BIEN: porcentaje */
    tmargin: 10p;         /* BIEN: puntos con nombre correcto */
}
```

> **Nota técnica:** La knowledgebase menciona `px` como opción disponible (`width: Npx`), pero **no es recomendado** porque no escala entre dispositivos con diferentes densidades de pantalla. Usar siempre `p` en su lugar.

---

## 4. Colores

### 4.1 Formato #RRGGBB

El formato más común para definir colores en XOne. Usa 6 digitos hexadecimales que representan los componentes Rojo, Verde y Azul.

```css
.miClase {
    bgcolor: #FFFFFF;     /* Blanco */
    forecolor: #212121;   /* Gris casi negro */
    border-color: #E0E0E0; /* Gris claro */
}
```

**IMPORTANTE:** Siempre usar los 6 digitos completos. Las abreviaturas de 3 digitos (`#FFF`, `#333`) **no están garantizadas**. Usar siempre la forma completa:

```css
/* INCORRECTO - Abreviatura potencialmente no soportada */
.error {
    bgcolor: #FFF;
    forecolor: #333;
}

/* CORRECTO - Forma completa */
.correcto {
    bgcolor: #FFFFFF;
    forecolor: #333333;
}
```

### 4.2 Formato #AARRGGBB (con alpha)

XOne soporta transparencia en los colores mediante el formato **ARGB** (Alpha, Red, Green, Blue). **ATENCION:** a diferencia del formato CSS web `#RRGGBBAA` donde el alpha va al final, en XOne el componente **alpha va PRIMERO**.

```css
.elementoTransparente {
    bgcolor: #80000000;   /* Negro con 50% de opacidad */
}

.fondoSemiTransparente {
    bgcolor: #CC1565C0;   /* Azul con 80% de opacidad */
}

.totalmenteTransparente {
    bgcolor: #00000000;   /* Completamente transparente */
}

.totalmenteOpaco {
    bgcolor: #FFFFFFFF;   /* Blanco completamente opaco */
}
```

**Tabla de valores alpha comunes:**

| Opacidad | Hex Alpha | Negro con alpha | Blanco con alpha |
|:--------:|:---------:|:---------------:|:----------------:|
| 100% | `FF` | `#FF000000` | `#FFFFFFFF` |
| 95% | `F2` | `#F2000000` | `#F2FFFFFF` |
| 90% | `E6` | `#E6000000` | `#E6FFFFFF` |
| 85% | `D9` | `#D9000000` | `#D9FFFFFF` |
| 80% | `CC` | `#CC000000` | `#CCFFFFFF` |
| 75% | `BF` | `#BF000000` | `#BFFFFFFF` |
| 70% | `B3` | `#B3000000` | `#B3FFFFFF` |
| 65% | `A6` | `#A6000000` | `#A6FFFFFF` |
| 60% | `99` | `#99000000` | `#99FFFFFF` |
| 55% | `8C` | `#8C000000` | `#8CFFFFFF` |
| 50% | `80` | `#80000000` | `#80FFFFFF` |
| 45% | `73` | `#73000000` | `#73FFFFFF` |
| 40% | `66` | `#66000000` | `#66FFFFFF` |
| 35% | `59` | `#59000000` | `#59FFFFFF` |
| 30% | `4D` | `#4D000000` | `#4DFFFFFF` |
| 25% | `40` | `#40000000` | `#40FFFFFF` |
| 20% | `33` | `#33000000` | `#33FFFFFF` |
| 15% | `26` | `#26000000` | `#26FFFFFF` |
| 10% | `1A` | `#1A000000` | `#1AFFFFFF` |
| 5% | `0D` | `#0D000000` | `#0DFFFFFF` |
| 0% | `00` | `#00000000` | `#00FFFFFF` |

**Error frecuente - Orden del alpha:**

```css
/* INCORRECTO - Alpha al final (formato CSS web) */
.error {
    bgcolor: #00000080;   /* ESTO NO DA 50% transparencia en XOne */
}

/* CORRECTO - Alpha al principio (formato XOne ARGB) */
.correcto {
    bgcolor: #80000000;   /* ESTO SI da 50% transparencia */
}
```

### 4.3 Colores con nombre

XOne tiene soporte limitado para la palabra clave `transparent`:

```css
.elementoTransparente {
    bgcolor: transparent;
}
```

Sin embargo, es más fiable usar el formato hexadecimal `#00000000` para transparencia total. **No se garantiza** el soporte de otros nombres de color web como `red`, `blue`, `green`, etc.

```css
/* INCORRECTO - Nombres de color no garantizados */
.error {
    bgcolor: red;
    forecolor: white;
}

/* CORRECTO - Usar hexadecimal siempre */
.correcto {
    bgcolor: #F44336;
    forecolor: #FFFFFF;
}
```

### 4.4 Patrones de paleta de colores

Se recomienda crear un archivo `colors.css` separado del `default.css` para centralizar la paleta de colores. Esto facilita el cambio de tema o de identidad visual.

**Estructura recomendada de `colors.css`:**

```css
/* ============================================
   NOMBRE_PROYECTO - Paleta de Colores
   Tema basado en tonos de AZUL
   ============================================ */

/* ============================================
   COLORES PRIMARIOS
   ============================================ */

/* Color principal de marca - Mas oscuro */
.colorPrimario {
    bgcolor: #0D47A1;
}

/* Botones principales */
.colorPrimarioAccion {
    bgcolor: #1565C0;
}

/* Headers y elementos destacados */
.colorPrimarioMedio {
    bgcolor: #1976D2;
}

/* Elementos secundarios */
.colorPrimarioClaro {
    bgcolor: #1E88E5;
}

/* Fondos de tarjetas activas */
.colorPrimarioSuave {
    bgcolor: #42A5F5;
}

/* Fondos sutiles */
.colorPrimarioPastel {
    bgcolor: #64B5F6;
}

/* Fondos de pantalla */
.colorPrimarioHielo {
    bgcolor: #BBDEFB;
}

/* Fondos muy sutiles */
.colorPrimarioNieve {
    bgcolor: #E3F2FD;
}

/* ============================================
   COLORES DE ESTADO
   ============================================ */

.colorExito {
    bgcolor: #4CAF50;
}

.colorAdvertencia {
    bgcolor: #FFC107;
}

.colorError {
    bgcolor: #F44336;
}

.colorProgreso {
    bgcolor: #FF9800;
}

/* ============================================
   COLORES NEUTROS
   ============================================ */

.colorFondoBlanco {
    bgcolor: #FFFFFF;
}

.colorFondoGrisClaro {
    bgcolor: #F5F5F5;
}

.colorTextoOscuro {
    forecolor: #212121;
}

.colorTextoMedio {
    forecolor: #616161;
}

.colorTextoClaro {
    forecolor: #9E9E9E;
}

.colorTextoBlanco {
    forecolor: #FFFFFF;
}

.colorBorde {
    border-color: #E0E0E0;
}
```

**Ejemplo real de paleta temática por colores (proyecto XOneDelivery - rojo, proyecto UseCars - azul, proyecto SocialNetwork - amarillo):**

Los tres proyectos usan la misma estructura de clases (`.colorPrimario`, `.colorPrimarioAccion`, etc.) pero con colores diferentes, lo que demuestra la utilidad de separar la paleta en un archivo independiente.

