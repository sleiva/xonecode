# Generación XOne — Fase 7: pantallas de entidad y estructura

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` L3033–3521. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §7.8 lista de entidad · §7.9 detalle/formulario · §7.10 pantalla con mapa · §7.11 configuración · §7.12 estructura de pantalla estándar · §7.12b nodo group y pestañas · §7.12c nodo frame

---

### 7.8 Plantilla: Lista de Entidad

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
    Pantalla de lista de [Entidad]
-->
<coll name="Lista[Entidad]"
      sql="SELECT * FROM ##PREF##[Entidad]"
      loadall="true" objname="[Entidad]"
      notab="true" show-toolbar="false">

    <group name="grpLista" id="1" class="groupNoTab">
        <!-- Header -->
        <frame name="frmHeader" width="100%" height="80p"
               bgcolor="#2196F3" align="center">
            <prop name="btnAtras" type="B" visible="7"
                  width="48p" height="48p" lmargin="10p"
                  img="./icons/ic_arrow_back_white.png"
                  bgcolor="#00000000"
                  onclick="var w = ui.getView(self); if (w) w.exit();" />
            <prop name="lblTitulo" type="L" visible="7"
                  width="70%" height="48p" lmargin="10p"
                  newline="false" forecolor="#FFFFFF"
                  fontsize="16" title="Lista de [Entidad]" />
        </frame>

        <!-- Campos visibles en modo lista (visible="2" o "7") -->
        <prop name="NOMBRE" type="T" visible="7" title="Nombre" />
        <prop name="DESCRIPCION" type="T" visible="2" title="Descripción" />
    </group>

    <!-- Al seleccionar un item de la lista -->
    <selecteditem show-wait-dialog="false" refresh="false">
        <action name="runscript">
            <script language="javascript">
                ui.openEditView(self);
            </script>
        </action>
    </selecteditem>

    <onback show-wait-dialog="false" refresh="false">
        <action name="runscript">
            <script language="javascript">
                let window = ui.getView(self);
                if (window) window.exit();
            </script>
        </action>
    </onback>
</coll>
```

### 7.9 Plantilla: Detalle/Formulario de Entidad

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
    Pantalla de detalle/edicion de [Entidad]
-->
<coll name="Detalle[Entidad]" title="Detalle"
      notab="true" show-toolbar="false">

    <group name="grpDetalle" id="1" class="groupNoTab">
        <!-- Header -->
        <frame name="frmHeader" width="100%" height="80p"
               bgcolor="#2196F3" align="center">
            <prop name="btnAtras" type="B" visible="7"
                  width="48p" height="48p" lmargin="10p"
                  img="./icons/ic_arrow_back_white.png"
                  bgcolor="#00000000"
                  onclick="var w = ui.getView(self); if (w) w.exit();" />
            <prop name="lblTitulo" type="L" visible="7"
                  width="70%" height="48p" lmargin="10p"
                  newline="false" forecolor="#FFFFFF"
                  fontsize="16" title="Detalle" />
            <prop name="btnGuardar" type="B" visible="7"
                  width="48p" height="48p" rmargin="10p"
                  newline="false" img="./icons/ic_save_white.png"
                  bgcolor="#00000000"
                  method="executenode(guardar)" />
        </frame>

        <!-- Formulario -->
        <frame name="frmFormulario" width="100%" height="100%"
               scroll="true" bgcolor="#FFFFFF">
            <prop name="NOMBRE" type="T" visible="1"
                  width="90%" height="50p" align="center"
                  tmargin="15p" labelwidth="0"
                  floating-tooltip="true" tooltip="Nombre"
                  class="textoEditable" />
            <prop name="DESCRIPCION" type="T" visible="1"
                  width="90%" height="80p" align="center"
                  tmargin="15p" labelwidth="0" lines="3"
                  floating-tooltip="true" tooltip="Descripción"
                  class="textoEditable" />
            <!-- Agregar mas campos según el modelo de datos -->
        </frame>
    </group>

    <!-- Evento guardar -->
    <guardar>
        <action name="runscript">
            <script language="javascript">
                if (isEmpty(self.NOMBRE)) {
                    ui.showToast("El nombre es obligatorio");
                    return;
                }
                self.save();
                ui.showToast("Guardado correctamente");
                let window = ui.getView(self);
                if (window) window.exit();
            </script>
        </action>
    </guardar>

    <onback show-wait-dialog="false" refresh="false">
        <action name="runscript">
            <script language="javascript">
                let window = ui.getView(self);
                if (window) window.exit();
            </script>
        </action>
    </onback>
</coll>
```

### 7.10 Plantilla: Pantalla con Mapa

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
    Pantalla con mapa
-->
<coll name="Mapa[Entidad]" title="Mapa"
      notab="true" show-toolbar="false">

    <group name="grpMapa" id="1" class="groupNoTab">
        <frame name="frmHeader" width="100%" height="80p"
               bgcolor="#2196F3" align="center">
            <prop name="btnAtras" type="B" visible="7"
                  width="48p" height="48p" lmargin="10p"
                  img="./icons/ic_arrow_back_white.png"
                  bgcolor="#00000000"
                  onclick="var w = ui.getView(self); if (w) w.exit();" />
            <prop name="lblTitulo" type="L" visible="7"
                  width="70%" height="48p" lmargin="10p"
                  newline="false" forecolor="#FFFFFF"
                  fontsize="16" title="Mapa" />
        </frame>

        <!-- Mapa -->
        <prop name="MAP_MAPA" type="Z" visible="7"
              viewmode="mapview"
              contents="@Ubicaciones"
              width="100%" height="85%"
              show-user-location="true"
              zoom-to-pois="true"
              onmapclicked="onMapClicked(e);"
              onmapready="onMapReady(e);" />
    </group>

    <contents name="@Ubicaciones" src="UbicacionesColl" />

    <onback show-wait-dialog="false" refresh="false">
        <action name="runscript">
            <script language="javascript">
                let window = ui.getView(self);
                if (window) window.exit();
            </script>
        </action>
    </onback>
</coll>
```

### 7.11 Plantilla: Pantalla de Configuración

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
    Pantalla de configuración/ajustes
-->
<coll name="Configuración" title="Configuración"
      special="true" notab="true" show-toolbar="false">

    <group name="grpConfig" id="1" class="groupNoTab">
        <frame name="frmHeader" width="100%" height="80p"
               bgcolor="#2196F3" align="center">
            <prop name="btnAtras" type="B" visible="7"
                  width="48p" height="48p" lmargin="10p"
                  img="./icons/ic_arrow_back_white.png"
                  bgcolor="#00000000"
                  onclick="var w = ui.getView(self); if (w) w.exit();" />
            <prop name="lblTitulo" type="L" visible="7"
                  width="70%" height="48p" lmargin="10p"
                  newline="false" forecolor="#FFFFFF"
                  fontsize="16" title="Configuración" />
        </frame>

        <frame name="frmOpciones" width="100%" height="100%"
               scroll="true" bgcolor="#FFFFFF">

            <!-- Info del usuario -->
            <prop name="lblUsuario" type="L" visible="7"
                  width="90%" height="40p" align="center"
                  tmargin="20p" fontsize="14"
                  title="Usuario conectado" />

            <!-- Opciones -->
            <prop name="MAP_NOTIFICACIONES" type="NC" visible="7"
                  width="90%" height="50p" align="center"
                  tmargin="15p" title="Notificaciones"
                  check-type="toggle" />

            <!-- Botón cerrar sesion -->
            <prop name="btnCerrarSesion" type="B" visible="7"
                  width="80%" height="50p" align="center"
                  tmargin="40p" class="btnPeligro"
                  title="Cerrar Sesion"
                  onclick="if (confirmar('Desea cerrar sesion?', 'Cerrar Sesion')) { appData.logout(); };" />

            <!-- Versión -->
            <prop name="lblVersion" type="L" visible="7"
                  width="100%" height="30p" align="center"
                  tmargin="30p" class="textoSubtitulo"
                  title="Versión 1.0.0" />
        </frame>
    </group>

    <onback show-wait-dialog="false" refresh="false">
        <action name="runscript">
            <script language="javascript">
                let window = ui.getView(self);
                if (window) window.exit();
            </script>
        </action>
    </onback>
</coll>
```

### 7.12 Estructura de Pantalla Estándar

Toda pantalla debe seguir esta estructura básica:

```xml
<coll name="NombrePantalla" title="Título" class="xnCollBase">
    <!-- Eventos de ciclo de vida -->
    <create><!-- Se ejecuta una sola vez al crear un objeto nuevo --></create>
    <before-edit><!-- Se ejecuta al abrir el objeto para editar, antes de pintar la UI --></before-edit>
    <after-edit><!-- Se ejecuta al abrir el objeto para editar, una vez pintada la UI --></after-edit>

    <!-- Contenido visual -->
    <group name="grpPrincipal" id="1" class="groupNoTab">
        <frame name="frmHeader" class="frameHeader">...</frame>
        <frame name="frmBody" class="frameBody">...</frame>
        <frame name="frmFooter" class="frameFooter">...</frame>
    </group>

    <!-- Contents embebidos (si aplica) -->
    <contents name="@MiContenido" src="MiColeccion" />

    <!-- Eventos custom (invocados con ExecuteNode) -->
    <miEvento>
        <action name="runscript">
            <script language="javascript">
                // Lógica del evento
            </script>
        </action>
    </miEvento>

    <!-- Manejo del botón atrás -->
    <onback>
        <action name="runscript">
            <script language="javascript">
                let window = ui.getView(self);
                if (window) window.exit();
            </script>
        </action>
    </onback>
</coll>
```

### 7.12b Nodo GROUP — Pestanas y Grupos de Pantalla

El nodo `<group>` define las pestanas o áreas de contenido dentro de una coleccion. Cada group tiene un `id` único que lo identifica.

#### Atributos del nodo `<group>`

| Atributo | Descripción | Ejemplo |
|----------|-------------|---------|
| `name` | Caption que se muestra en la pestana | `"General"` |
| `id` | Identificador numérico único del grupo | `"1"` |
| `bgcolor` | Color de fondo del grupo | `"#FFFFFF"` |
| `imgbk` | Imagen de fondo del grupo | `"fondo.png"` |
| `disableedit` | Deshabilita edición de todos los campos SI se cumple la condición | `"ESTADO=2"` |
| `disablevisible` | Oculta el grupo entero SI se cumple la condición | `"TIPO=0"` |
| `align` | Alineacion del contenido dentro del group. Mismos valores y comportamiento que en `<frame>`: `center`, `left\|top`, `center\|center`, etc. | `"center\|top"` |
| `tab-width` | Ancho de la pestana. Por defecto `"33%"` | `"50%"` |
| `animation-in` | Animación al entrar al grupo | `"##ALPHA_IN##"` |
| `animation-out` | Animación al salir del grupo | `"##ALPHA_OUT##"` |
| `onfocus` | Evento que se ejecuta cuando el usuario selecciona el grupo | `"ExecuteNode(onfocusgrupo(1))"` |
| `below-drawer` | Si es `true`, el grupo queda por debajo del drawer. Usar en headers y footers fijos para que el drawer se superponga correctamente | `"true"` |
| `floating` | Si es `true`, el grupo se superpone sobre el contenido. Posicionar con `top` y `left` | `"true"` |

#### Grupo Fijo (Header/Footer)

Para crear cabeceras o pies fijos que no se desplazan con el scroll:

```xml
<!-- Header fijo en la parte superior -->
<group name="HEADER" id="10" fixed="true" orientation="top" width="100%" height="120p">
    <frame name="frmHeader" class="frmsuperior">
        <prop name="SALIR" type="B" class="btvolversuper" />
        <prop name="TITULO" type="L" class="tlsuper" title="MI PANTALLA" />
        <prop name="BTMENU" type="B" class="btmenuicon" method="ExecuteNode(onback)" />
    </frame>
</group>

<!-- Footer fijo en la parte inferior -->
<group name="FOOTER" id="0" fixed="true" orientation="bottom" width="100%" height="80p">
    <frame name="frmFooter">
        <prop name="BTN_CANCELAR" type="B" title="Cancelar" method="ExecuteNode(onback)"
              width="45%" height="80%" />
        <prop name="BTN_ACEPTAR" type="B" title="Aceptar" method="ExecuteNode(guardar)"
              width="45%" height="80%" newline="false" lmargin="6%" />
    </frame>
</group>

<!-- Contenido principal — ocupa el espacio restante tras los grupos fijos -->
<group name="General" id="1">
    <!-- ... -->
</group>
```

> **IMPORTANTE:** Una vez definidos los grupos fijos, el espacio restante se considera el 100% para los grupos de contenido. No hay que restar el alto de los grupos fijos.

#### Grupo Drawer (panel lateral deslizante)

```xml
<group name="Drawer" id="999" drawer-orientation="left" width="70%" height="100%">
    <prop name="MAP_BT_MENU1" type="B" title="Clientes" visible="1"
          onclick="javascript:ui.openEditView('ListaClientes'); ocultarGrupo(999);"
          class="xnTituloDrawerC" />
    <prop name="MAP_BT_MENU2" type="B" title="Pedidos" visible="1"
          onclick="javascript:ui.openEditView('ListaPedidos'); ocultarGrupo(999);"
          class="xnTituloDrawerC" />
    <prop name="MAP_BT_SALIR" type="B" title="Salir" visible="1"
          method="ExecuteNode(onback)" class="xnTituloDrawerC" />
</group>
```

**Métodos JavaScript para el Drawer:**

| Método | Descripción |
|--------|-------------|
| `ui.showGroup(id)` | Muestra el grupo |
| `ui.showGroup(id, animIn, durIn, animOut, durOut)` | Muestra el grupo con animación personalizada |
| `ui.hideGroup(id)` | Oculta el grupo |
| `ui.toggleGroup(id)` | Alterna entre mostrar y ocultar |
| `ui.lockGroup(id, close)` | Bloquea el grupo: `close=true` lo bloquea cerrado, `close=false` lo bloquea abierto |
| `ui.unlockGroup(id)` | Desbloquea el grupo para que vuelva a ser interactivo |

```javascript
// Abrir drawer con animacion
ui.showGroup(999, "##RIGHT_IN##", 300, "##LEFT_OUT##", 200);
// Cerrar
ui.hideGroup(999);
// Bloquear cerrado durante carga inicial
ui.lockGroup(999, true);
```

#### Macros de animación para grupos y frames

| Macro entrada | Macro salida | Efecto |
|---------------|--------------|--------|
| `##ALPHA_IN##` | `##ALPHA_OUT##` | Fundido de entrada/salida |
| `##RIGHT_IN##` | `##RIGHT_OUT##` | Desde/hacia la derecha |
| `##LEFT_IN##` | `##LEFT_OUT##` | Desde/hacia la izquierda |
| `##PUSH_IN##` | `##PUSH_OUT##` | Empuje desde abajo |
| `##PUSH_DOWN_IN##` | `##PUSH_DOWN_OUT##` | Empuje hacia abajo |
| `##ROTATE3D_IN##` | `##ROTATE3D_OUT##` | Rotación 3D |
| `##ZOOM_IN##` | `##ZOOM_OUT##` | Zoom de entrada/salida |

#### Atributos de COLL relacionados con grupos

| Atributo en coll | Descripción |
|------------------|-------------|
| `notab="true"` | Oculta las pestanas de los grupos |
| `group-swipe="true"` | Permite deslizar entre grupos con el dedo |
| `group-theme="material"` | Estilo Material Design para las pestanas |
| `tab-mode="fixed"` | Pestanas de ancho fijo distribuidas en pantalla |
| `tab-mode="scrollable"` | Pestanas con scroll si no caben en pantalla |

---

### 7.12c Nodo FRAME — Contenedores Visuales

El nodo `<frame>` es el equivalente al `<div>` de HTML. Permite organizar los props en áreas visuales dentro de un group. Los frames pueden anidarse sin limite.

> **REGLA CRITICA:** Un `<frame>` **solo se pinta si contiene al menos un `<prop>` visible**. Un frame vacio, o con todos sus props con `visible="0"`, no ocupa espacio ni se renderiza en pantalla. **No usar frames como espaciadores vacios** — no funcionan para crear espacio. Si se necesita separación visual, usar `tmargin`/`bmargin` en el prop anterior, o un `<prop type="L" title=" " height="20p" visible="1" />` como separador.

```xml
<frame name="frmContenido" width="100%" height="100%" scroll="true" bgcolor="#FFFFFF">
    <frame name="frmCabecera" width="100%" height="80p" bgcolor="#2196F3">
        <prop name="TITULO" type="L" title="Mi título" forecolor="#FFFFFF" labelwidth="0" />
    </frame>
    <frame name="frmCuerpo" width="90%" height="100%" lmargin="5%">
        <prop name="NOMBRE" type="T" visible="1" title="Nombre:" />
    </frame>
</frame>
```

#### Atributos del nodo `<frame>`

| Atributo | Descripción | Ejemplo |
|----------|-------------|---------|
| `name` | Identificador del frame | `"frmHeader"` |
| `width` | Ancho: `%`, `p` (puntos) o valor numérico DIP | `"100%"`, `"300p"` |
| `height` | Alto: `%`, `p` o DIP. `-2` = ajuste automático al contenido | `"120p"`, `-2` |
| `bgcolor` | Color de fondo | `"#2196F3"`, `"#00000000"` (transparente) |
| `imgbk` | Imagen de fondo | `"fondo.png"` |
| `framebox` | `false` oculta el borde del frame | `"false"` |
| `border-width` | Ancho del borde | `"1"` |
| `align` | Alineacion del contenido dentro del frame. Valores: `left`, `right`, `center`, `top`, `bottom`. Combinar horizontal y vertical con `\|`: `center\|center`, `left\|top`, `left\|center`, `center\|top`, `right\|center`. Mismo comportamiento en `<group>` y `<prop>` | `"center\|top"` |
| `newline` | Por defecto `true`. Con `false` el frame se coloca a la derecha del anterior en la misma línea. Los anchos deben sumar 100% o menos | `"false"` |
| `scroll` | `true` permite scroll si el contenido supera el alto | `"true"` |
| `lmargin`/`tmargin`/`rmargin`/`bmargin` | Margenes exteriores | `"5%"`, `"10p"` |
| `lpadding`/`tpadding`/`rpadding`/`bpadding` | Margenes interiores | `"15p"` |
| `disablevisible` | Oculta el frame SI se cumple la condición | `"ESTADO=0"` |
| `animation-in` | Animación de entrada | `"##ALPHA_IN##"` |
| `animation-out` | Animación de salida | `"##ALPHA_OUT##"` |
| `animation-in-delay` | Duración de la animación de entrada (ms) | `"300"` |
| `animation-out-delay` | Duración de la animación de salida (ms) | `"300"` |
| `elevation` | Elevacion / sombra Material Design. Valores de 1 a 24 | `"5"` |
| `border-corner-radius` | Radio de esquinas redondeadas | `"10"` |
| `ignore-touch-on-transparent-area` | En frames flotantes, los toques sobre áreas transparentes pasan al elemento que hay detras | `"true"` |

#### Frame Flotante

Un frame flotante se superpone sobre el resto de la pantalla sin afectar al layout de los demas elementos. Útil para FABs, menus contextuales, alertas:

```xml
<!-- Botón flotante en la esquina inferior derecha (FAB) -->
<frame name="frmFAB" floating="true" top="900p" left="610p" width="90p" height="90p">
    <prop name="BTN_ADD" type="B" visible="1" labelwidth="0"
          method="ExecuteNode(nuevo)" width="75p" img="add.png" imgsel="add_click.png" />
</frame>
```

| Atributo frame flotante | Descripción |
|------------------------|-------------|
| `floating="true"` | Activa el modo flotante |
| `top` | Coordenada Y en pixeles desde el borde superior |
| `left` | Coordenada X en pixeles desde el borde izquierdo |

> **NOTA:** En frames flotantes usar `p` (pixeles) para `top`, `left`, `width` y `height` para mejor funcionamiento. Evitar `%`.

#### Bottom Sheet (panel deslizante inferior)

```xml
<frame name="bottom_panel" floating="true" left="0" behavior="bottom-sheet"
       initial-state="collapsed" width="100%" height="50%">
    <prop name="TITULO" type="L" title="Panel inferior" labelwidth="0" width="100%" />
    <!-- contenido del panel -->
</frame>
```

| Estado `initial-state` | Descripción |
|------------------------|-------------|
| `expanded` | Aparece expandido al 100% de su tamaño |
| `collapsed` | Aparece minimizado mostrando solo una franja |
| `hidden` | Aparece oculto completamente |

**JavaScript:** `window.setBottomSheetState(sProp, "expanded")` para cambiar el estado.

#### Macros de animación disponibles

| Macro | Efecto |
|-------|--------|
| `##ALPHA_IN##` / `##ALPHA_OUT##` | Fade in / fade out |
| `##ZOOM_IN##` / `##ZOOM_OUT##` | Zoom in / zoom out |
| `##PUSH_IN##` / `##PUSH_OUT##` | Deslizar desde abajo / hacia abajo |
| `##PUSH_DOWN_IN##` / `##PUSH_DOWN_OUT##` | Deslizar desde arriba / hacia arriba |
| `##RIGHT_IN##` / `##LEFT_OUT##` | Entrar desde la derecha / salir hacia la izquierda |
| `##LEFT_IN##` / `##RIGHT_OUT##` | Entrar desde la izquierda / salir hacia la derecha |
| `##ROTATE3D_IN##` / `##ROTATE3D_OUT##` | Rotación 3D de entrada / salida |

