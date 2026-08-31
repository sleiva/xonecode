# XOne CSS — Patrones Material Design, temas y CSS de ejemplo

> Fuente: `xone/v2/xone-help-docs/topics/04-css-styling-guide.md` §14–§16. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §14 patrones Material (header/body/footer, botones, inputs, tarjetas, FAB, toolbar, item de lista) · §15 temas light/dark y cambio dinámico · §16 default.css y colors.css completos y comentados

---

## 14. Patrones de Diseño Material Design

Esta sección presenta los patrones de diseño más comunes utilizados en los proyectos XOne reales, siguiendo los principios de Material Design.

### 14.1 Esqueleto base (coll + prop globales)

Todo proyecto XOne debe definir los selectores globales `coll` y `prop` como base. Este es el esqueleto mínimo presente en **todos** los proyectos de ejemplo:

```css
/* Configuración global de propiedades */
prop {
    fontname: Roboto-Regular.ttf;
    fontsize: 11;
    labelbox: false;
    label-wrap: true;
    text-border: false;
    forecolor: #212121;
}

/* Configuración global de colecciones */
coll {
    notab: true;
    show-toolbar: false;
    group-swipe: false;
    editmask: 0;
    bgcolor: #FFFFFF;
}
```

### 14.2 Clase de header (.frameHeader)

El header es el frame superior de cada pantalla. Suele contener el título, botones de navegación y acciones.

```css
/* Header estandar */
.frameHeader {
    width: 100%;
    height: 140p;
    bgcolor: #1565C0;      /* Color primario de marca */
    align: center;
}

/* Header secundario (mas bajo) */
.frameHeaderSecundario {
    width: 100%;
    height: 120p;
    bgcolor: #1976D2;
    align: center;
}

/* Header transparente (para pantallas con mapa) */
.frameHeaderTransparente {
    width: 100%;
    height: 100p;
    bgcolor: #00FFFFFF;
    align: center;
}
```

### 14.3 Clase de body (.frameBody con scroll)

El body es el área principal de contenido, normalmente con scroll habilitado.

```css
/* Body con scroll (el mas comun) */
.frameBody {
    width: 100%;
    height: 100%;
    scroll: true;
    bgcolor: #F5F5F5;
}

/* Body sin scroll */
.frameBodyFijo {
    width: 100%;
    height: 100%;
    scroll: false;
    bgcolor: #FFFFFF;
}

/* Body para pantallas con mapa */
.frameBodyMapa {
    width: 100%;
    height: 100%;
    scroll: false;
    bgcolor: #E3F2FD;
}
```

### 14.4 Clase de footer (.frameFooter)

El footer es el frame inferior, normalmente con botones de acción.

```css
/* Footer estandar con borde superior */
.frameFooter {
    width: 100%;
    height: 120p;
    bgcolor: #FFFFFF;
    align: center;
    border-top: true;
    border-top-color: #E0E0E0;
}

/* Footer fijo (no se mueve con el scroll) */
.frameFooterFijo {
    width: 100%;
    height: 120p;
    bgcolor: #FFFFFF;
    align: center;
    fixed: true;
    orientation: bottom;
}
```

### 14.5 Botones (.btnPrimario, .btnSecundario, .btnPeligro)

Los botones siguen el patron de Material Design con esquinas redondeadas y colores por estado:

```css
/* Boton primario - Accion principal */
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

/* Boton secundario - Outline */
.btnSecundario {
    width: 90%;
    height: 56p;
    bgcolor: #FFFFFF;
    forecolor: #1565C0;
    border: true;
    border-color: #1565C0;
    border-corner-radius: 28;
    text-align: center;
    fontsize: 16;
}

/* Boton de peligro - Accion destructiva */
.btnPeligro {
    width: 90%;
    height: 56p;
    bgcolor: #F44336;
    forecolor: #FFFFFF;
    border-corner-radius: 28;
    text-align: center;
    fontsize: 16;
}

/* Boton de exito - Confirmacion */
.btnExito {
    width: 90%;
    height: 56p;
    bgcolor: #4CAF50;
    forecolor: #FFFFFF;
    border-corner-radius: 28;
    text-align: center;
    fontsize: 16;
    fontname: Roboto-Bold.ttf;
}

/* Boton de acento */
.btnAcento {
    width: 90%;
    height: 56p;
    bgcolor: #00BCD4;
    forecolor: #FFFFFF;
    border-corner-radius: 28;
    text-align: center;
    fontsize: 16;
    fontname: Roboto-Bold.ttf;
}
```

### 14.6 Campos de texto (.textoEditable)

```css
/* Campo con borde inferior (Material Design) */
.textoEditable {
    width: 95%;
    height: 56p;
    labelwidth: 0;
    text-border: true;
    text-border-bottom: true;
    text-border-left: false;
    text-border-right: false;
    text-border-top: false;
    text-border-color: #BDBDBD;
    fontsize: 14;
}

/* Campo enfocado - Color del borde cambia */
.textoEditableEnfocado {
    extends: .textoEditable;
    text-border-color: #1565C0;
}

/* Campo con fondo gris (sin borde) */
.inputTexto {
    width: 95%;
    height: 56p;
    bgcolor: #F5F5F5;
    border-corner-radius: 8;
    text-border: false;
    fontsize: 14;
    lmargin: 15p;
}

/* Campo de busqueda redondeado */
.inputBusqueda {
    width: 95%;
    height: 56p;
    bgcolor: #FFFFFF;
    border-corner-radius: 28;
    border: true;
    border-color: #E0E0E0;
    lmargin: 15p;
    fontsize: 14;
}

/* Campo multilinea */
.textoEditableMulti {
    extends: .textoEditable;
    lines: 5;
    fixed-lines: false;
    text-border: true;
    text-border-bottom: true;
    text-border-left: true;
    text-border-right: true;
    text-border-top: true;
    border-corner-radius: 8;
}
```

### 14.7 Tarjetas (.frameCard)

Las tarjetas son contenedores blancos elevados que agrupan información relacionada:

```css
/* Tarjeta estandar */
.tarjeta {
    width: 95%;
    bgcolor: #FFFFFF;
    border-corner-radius: 12;
    tmargin: 10p;
    bmargin: 5p;
    lmargin: 10p;
    rmargin: 10p;
}

/* Tarjeta con borde */
.tarjetaConBorde {
    width: 95%;
    bgcolor: #FFFFFF;
    border-corner-radius: 16;
    border: true;
    border-color: #E0E0E0;
    tmargin: 10p;
}

/* Tarjeta seleccionada */
.tarjetaSeleccionada {
    width: 95%;
    bgcolor: #E3F2FD;
    border-corner-radius: 12;
    border: true;
    border-color: #1565C0;
}

/* Tarjeta con padding interno (proyecto SocialNetwork) */
.frameCard {
    width: 96%;
    lmargin: 2%;
    bgcolor: #FFFFFF;
    border-corner-radius: 12;
    tmargin: 10p;
    tpadding: 15p;
    bpadding: 15p;
    lpadding: 15p;
    rpadding: 15p;
}
```

### 14.8 FAB (Floating Action Button)

El FAB es un botón circular flotante que representa la acción principal de la pantalla:

```css
/* FAB estandar (56p) */
.btnFAB {
    width: 56p;
    height: 56p;
    bgcolor: #1565C0;
    border-corner-radius: 28;
}

/* FAB grande (64p) */
.btnFlotante {
    width: 64p;
    height: 64p;
    bgcolor: #1565C0;
    border-corner-radius: 32;
}

/* FAB extragrande con floating (proyecto SocialNetwork - 112p) */
.btnFABGrande {
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

### 14.9 Toolbar / Tab Bar

```css
/* Grupo sin tabs (el mas comun) */
.groupNoTab {
    tab-visible: false;
}

/* Grupo con tabs de navegacion */
.groupConTab {
    tab-visible: true;
    tab-height: 56p;
    tab-fontsize: 14;
    tab-bgcolor: #0D47A1;
    tab-forecolor: #BBDEFB;
    tab-selected-forecolor: #FFFFFF;
    tab-indicator-color: #FFFFFF;
}

/* Barra de navegacion inferior (proyecto SocialNetwork) */
.frameNavBar {
    width: 100%;
    height: 100p;
    bgcolor: #FFFFFF;
    align: center;
    fixed: true;
    orientation: bottom;
}

/* Item de navegacion */
.btnNavItem {
    width: 25%;
    height: 100%;
    bgcolor: #FFFFFF;
    labelwidth: 0;
    img-width: 48p;
    img-height: 48p;
    newline: false;
}

.btnNavItemActive {
    extends: .btnNavItem;
    bgcolor: #FFECB3;
}
```

### 14.10 Item de lista

```css
/* Item de lista estandar */
.itemLista {
    width: 100%;
    height: 72p;
    bgcolor: #FFFFFF;
    border-bottom: true;
    border-bottom-color: #EEEEEE;
}

/* Item de lista seleccionado */
.itemListaSeleccionado {
    width: 100%;
    height: 72p;
    bgcolor: #E3F2FD;
}

/* Separador de lista */
.separador {
    width: 100%;
    height: 1p;
    bgcolor: #EEEEEE;
}

/* Separador con margen lateral */
.separadorConMargen {
    width: 90%;
    height: 1p;
    bgcolor: #E0E0E0;
    align: center;
}

/* Separador con indentacion (estilo MiMensajeria) */
.frameDivider {
    width: 100%;
    height: 1p;
    bgcolor: #E0E0E0;
    lmargin: 72p;
}
```

---

## 15. Temas (Light y Dark)

### 15.1 Como estructurar temas

XOne soporta cambio de tema mediante archivos CSS separados que se cargan automáticamente según el tema activo del dispositivo:

- `default.css` - Tema base (normalmente light)
- `default_night.css` - Sobreescrituras para tema oscuro
- `default_day.css` - Sobreescrituras para tema claro (si el base es oscuro)

El sistema de cascada de XOne aplica automáticamente el archivo de tema sobre los estilos base. Solo es necesario sobreescribir los atributos de color que cambian.

### 15.2 Variables de color centralizadas

XOne admite variables CSS reales (`:root { --color: red; }` + `var(--color)`). Para temas el patrón recomendado es declarar la paleta en `:root` dentro de `colors.css` y referenciarla con `var(--...)` en el resto de hojas. Como alternativa equivalente — más antigua pero todavía válida — se pueden usar clases de color que encapsulan el valor:

**Patrón con variables CSS (recomendado):**

```css
/* default-colors.css */
:root {
    --color-primario: #1565C0;
    --color-fondo:    #FFFFFF;
    --color-texto:    #212121;
}

/* default.css */
.frameHeader {
    bgcolor:   var(--color-primario);
    forecolor: var(--color-fondo);
}

/* default_night.css — solo redefine las variables */
:root {
    --color-primario: #0D47A1;
    --color-fondo:    #121212;
    --color-texto:    #E0E0E0;
}
```

**Patrón clásico con clases (sigue funcionando):**

```css
/* default-colors.css - Tema Light */
.xnDarkBgcolor {
    bgcolor: #1565C0;
    forecolor: #FFFFFF;
}

.xnLightBgcolor {
    bgcolor: #F5F5F5;
    forecolor: #212121;
}

.xnTransparentBgcolor {
    bgcolor: #00000000;
}
```

### 15.3 Ejemplo de tema oscuro

**`default_night.css`:**

```css
/* Sobreescribir coleccion */
coll {
    bgcolor: #121212;
}

/* Sobreescribir propiedades globales */
prop {
    forecolor: #E0E0E0;
}

/* Sobreescribir layout */
.frameHeader {
    bgcolor: #1E1E1E;
}

.frameBody {
    bgcolor: #121212;
}

.frameFooter {
    bgcolor: #1E1E1E;
    border-top-color: #333333;
}

/* Sobreescribir tarjetas */
.tarjeta {
    bgcolor: #1E1E1E;
}

/* Sobreescribir inputs */
.inputTexto {
    bgcolor: #2C2C2C;
    text-forecolor: #E0E0E0;
}

/* Sobreescribir textos */
.textoTitulo {
    forecolor: #FFFFFF;
}

.textoSecundario {
    forecolor: #9E9E9E;
}
```

**`default_day.css` (ejemplo de la knowledgebase):**

```css
.cssDemo {
    bgcolor: #F8C471;
    forecolor: #000000;
    title: Modo dia;
}
```

**`default_night.css` (ejemplo de la knowledgebase):**

```css
.cssDemo {
    bgcolor: #000000;
    forecolor: #FFFFFF;
    title: Modo noche;
}
```

### 15.4 Cambio dinámico de CSS

Desde JavaScript se puede cargar un archivo CSS diferente en tiempo de ejecución, lo que permite implementar un cambio de tema manual por el usuario. Consultar la API JavaScript para los métodos disponibles.

> **Referencia cruzada:** Para los métodos JavaScript de cambio de CSS, consultar el tópico 03 - API JavaScript.

---

## 16. CSS Completo de Ejemplo

### Archivo `default.css` completo comentado

El siguiente ejemplo es un `default.css` completo para un proyecto XOne generico, basado en los patrones reales encontrados en los proyectos UseCars, XOneDelivery, MiMensajeria, SocialNetwork y GestionTareas:

```css
/* ============================================
   PROYECTO EJEMPLO - Estilos Globales
   Paleta: Azul #1565C0
   ============================================ */

/* ============================================
   CONFIGURACION GLOBAL
   Estos selectores aplican a TODOS los elementos
   ============================================ */

/* Tipografia y estilo base de todos los campos */
prop {
    fontname: Roboto-Regular.ttf;
    fontsize: 11;
    labelbox: false;
    label-wrap: true;
    text-border: false;
    forecolor: #212121;
}

/* Configuración base de todas las colecciones */
coll {
    notab: true;
    show-toolbar: false;
    group-swipe: false;
    editmask: 0;
    bgcolor: #FFFFFF;
}

/* ============================================
   ICONOS DEL SISTEMA
   Iconos para combos, busquedas, etc.
   ============================================ */

prop {
    img-spinner: ic_arrow_drop_down.png;
    img-spinner-sel: ic_arrow_drop_down.png;
    img-search: ic_search.png;
    img-search-sel: ic_search.png;
    img-delete: ic_delete.png;
    img-delete-sel: ic_delete.png;
    img-checked: ic_check_box.png;
    img-unchecked: ic_check_box_outline_blank.png;
    img-camera: ic_photo_camera.png;
    img-camera-sel: ic_photo_camera.png;
    img-date: ic_date_range.png;
    img-date-sel: ic_date_range.png;
    img-time: ic_access_time.png;
    img-time-sel: ic_access_time.png;
    img-att: ic_attach_file.png;
    img-att-sel: ic_attach_file.png;
    img-height: 28;
    img-width: 28;
}

/* ============================================
   FRAMES DE LAYOUT
   Estructura Header / Body / Footer
   ============================================ */

/* Header principal */
.frameHeader {
    width: 100%;
    height: 140p;
    bgcolor: #1565C0;
    align: center;
}

/* Body con scroll */
.frameBody {
    width: 100%;
    height: 100%;
    scroll: true;
    bgcolor: #F5F5F5;
}

/* Body sin scroll */
.frameBodyFijo {
    width: 100%;
    height: 100%;
    scroll: false;
    bgcolor: #FFFFFF;
}

/* Footer fijo */
.frameFooter {
    width: 100%;
    height: 120p;
    bgcolor: #FFFFFF;
    align: center;
    border-top: true;
    border-top-color: #E0E0E0;
}

/* ============================================
   TARJETAS
   ============================================ */

.tarjeta {
    width: 95%;
    bgcolor: #FFFFFF;
    border-corner-radius: 12;
    tmargin: 10p;
    bmargin: 5p;
    lmargin: 10p;
    rmargin: 10p;
}

.tarjetaSeleccionada {
    width: 95%;
    bgcolor: #E3F2FD;
    border-corner-radius: 12;
    border: true;
    border-color: #1565C0;
}

/* Panel inferior (modal) */
.panelInferior {
    width: 100%;
    bgcolor: #FFFFFF;
    border-corner-radius-top-left: 24;
    border-corner-radius-top-right: 24;
}

/* ============================================
   BOTONES
   ============================================ */

/* Primario */
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

/* Secundario (outline) */
.btnSecundario {
    width: 90%;
    height: 56p;
    bgcolor: #FFFFFF;
    forecolor: #1565C0;
    border: true;
    border-color: #1565C0;
    border-corner-radius: 28;
    text-align: center;
    fontsize: 16;
}

/* Peligro */
.btnPeligro {
    width: 90%;
    height: 56p;
    bgcolor: #F44336;
    forecolor: #FFFFFF;
    border-corner-radius: 28;
    text-align: center;
    fontsize: 16;
}

/* Exito */
.btnExito {
    width: 90%;
    height: 56p;
    bgcolor: #4CAF50;
    forecolor: #FFFFFF;
    border-corner-radius: 28;
    text-align: center;
    fontsize: 16;
    fontname: Roboto-Bold.ttf;
}

/* Icono circular */
.btnIcono {
    width: 56p;
    height: 56p;
    bgcolor: #FFFFFF;
    border-corner-radius: 28;
}

/* FAB */
.btnFlotante {
    width: 64p;
    height: 64p;
    bgcolor: #1565C0;
    border-corner-radius: 32;
}

/* Chip */
.btnChip {
    height: 40p;
    bgcolor: #E3F2FD;
    forecolor: #1565C0;
    border-corner-radius: 20;
    text-align: center;
    fontsize: 14;
    lmargin: 5p;
    rmargin: 5p;
}

.btnChipSeleccionado {
    height: 40p;
    bgcolor: #1565C0;
    forecolor: #FFFFFF;
    border-corner-radius: 20;
    text-align: center;
    fontsize: 14;
}

/* ============================================
   CAMPOS DE TEXTO
   ============================================ */

/* Con borde inferior (Material Design) */
.inputTextoLinea {
    width: 95%;
    height: 56p;
    bgcolor: #FFFFFF;
    text-border: true;
    text-border-bottom: true;
    text-border-left: false;
    text-border-right: false;
    text-border-top: false;
    text-border-color: #BDBDBD;
    fontsize: 14;
}

/* Enfocado */
.inputTextoLineaEnfocado {
    extends: .inputTextoLinea;
    text-border-color: #1565C0;
}

/* Con fondo gris */
.inputTexto {
    width: 95%;
    height: 56p;
    bgcolor: #F5F5F5;
    border-corner-radius: 8;
    text-border: false;
    fontsize: 14;
    lmargin: 15p;
}

/* Busqueda redondeada */
.inputBusqueda {
    width: 95%;
    height: 56p;
    bgcolor: #FFFFFF;
    border-corner-radius: 28;
    border: true;
    border-color: #E0E0E0;
    lmargin: 15p;
    fontsize: 14;
}

/* ============================================
   TEXTOS Y ETIQUETAS
   ============================================ */

.textoTituloGrande {
    fontsize: 28;
    fontname: Roboto-Bold.ttf;
    forecolor: #FFFFFF;
    text-align: center;
}

.textoTitulo {
    fontsize: 20;
    fontname: Roboto-Bold.ttf;
    forecolor: #212121;
    text-align: left;
}

.textoSubtitulo {
    fontsize: 16;
    forecolor: #616161;
}

.textoNormal {
    fontsize: 14;
    forecolor: #212121;
}

.textoSecundario {
    fontsize: 14;
    forecolor: #9E9E9E;
}

.textoPequeno {
    fontsize: 12;
    forecolor: #9E9E9E;
}

/* ============================================
   BADGES DE ESTADO
   ============================================ */

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

.badgeEntregado {
    extends: .badgeEstado;
    bgcolor: #4CAF50;
}

.badgeCancelado {
    extends: .badgeEstado;
    bgcolor: #9E9E9E;
}

.badgeError {
    extends: .badgeEstado;
    bgcolor: #F44336;
}

/* ============================================
   AVATARES
   ============================================ */

.avatar {
    width: 64p;
    height: 64p;
    border-corner-radius: 32;
}

.avatarGrande {
    width: 96p;
    height: 96p;
    border-corner-radius: 48;
}

.avatarPequeno {
    width: 48p;
    height: 48p;
    border-corner-radius: 24;
}

/* ============================================
   ICONOS
   ============================================ */

.iconoAccion {
    width: 48p;
    height: 48p;
}

.iconoPequeno {
    width: 24p;
    height: 24p;
}

/* ============================================
   LISTAS
   ============================================ */

.itemLista {
    width: 100%;
    height: 72p;
    bgcolor: #FFFFFF;
    border-bottom: true;
    border-bottom-color: #EEEEEE;
}

.separador {
    width: 100%;
    height: 1p;
    bgcolor: #EEEEEE;
}

/* ============================================
   GRUPOS Y TABS
   ============================================ */

.groupNoTab {
    tab-visible: false;
}

.groupConTab {
    tab-visible: true;
    tab-height: 56p;
    tab-fontsize: 14;
    tab-bgcolor: #1565C0;
    tab-forecolor: #BBDEFB;
    tab-selected-forecolor: #FFFFFF;
    tab-indicator-color: #FFFFFF;
}

/* ============================================
   FIRMA Y FOTO
   ============================================ */

.areaFirma {
    width: 100%;
    height: 200p;
    bgcolor: #FAFAFA;
    border: true;
    border-color: #E0E0E0;
    border-corner-radius: 8;
}

.fotoPreview {
    width: 100%;
    height: 200p;
    border-corner-radius: 8;
}

/* ============================================
   ANIMACIONES
   ============================================ */

.animSlideRight {
    animation-in: ##RIGHT_IN##;
    animation-in-delay: 200;
    animation-out: ##LEFT_OUT##;
    animation-out-delay: 200;
}

.animFadeIn {
    animation-in: ##ALPHA_IN##;
    animation-in-delay: 300;
}

.animSlideUp {
    animation-in: ##PUSH_IN##;
    animation-in-delay: 200;
}
```

### Archivo `colors.css` completo

```css
/* ============================================
   PROYECTO EJEMPLO - Paleta de Colores
   Tema basado en tonos de azul
   ============================================ */

/* ============================================
   COLORES PRIMARIOS
   ============================================ */

.colorPrimario {
    bgcolor: #0D47A1;
}

.colorPrimarioAccion {
    bgcolor: #1565C0;
}

.colorPrimarioMedio {
    bgcolor: #1976D2;
}

.colorPrimarioClaro {
    bgcolor: #1E88E5;
}

.colorPrimarioSuave {
    bgcolor: #42A5F5;
}

.colorPrimarioPastel {
    bgcolor: #64B5F6;
}

.colorPrimarioHielo {
    bgcolor: #BBDEFB;
}

.colorPrimarioNieve {
    bgcolor: #E3F2FD;
}

/* ============================================
   COLORES DE ACENTO
   ============================================ */

.colorAcento {
    bgcolor: #00BCD4;
}

.colorAcentoClaro {
    bgcolor: #4DD0E1;
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

.colorInfo {
    bgcolor: #2196F3;
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

.colorFondoGris {
    bgcolor: #EEEEEE;
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

.colorSeparador {
    bgcolor: #BDBDBD;
}
```

