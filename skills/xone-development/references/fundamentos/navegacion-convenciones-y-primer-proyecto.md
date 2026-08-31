# XOne — Navegación, convenciones y primer proyecto

> Fuente: `xone/v2/xone-help-docs/topics/01-xone-fundamentals.md` §7–§9. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §7 flujo de navegación · §8 convenciones de nomenclatura · §9 pasos para crear un proyecto básico

---

## 7. Flujo de Navegación

La navegación en XOne sigue un patron predecible. La app siempre arranca en la pantalla definida como `entry-point` en `app.xml`, típicamente `EntradaApp`.

### Flujo Típico

```
  Splash             Login            EntradaApp           Pantallas
  (splash.png)    (login-coll)      (entry-point)        (funcionales)
  +----------+    +----------+      +-------------+    +-------------+
  | Imagen   | -> | Usuario  | ->   | Bienvenida  | -> | ListaTareas |
  | de carga |    | Password |      | Opción 1 --+--> | DetalleTarea|
  | (fichero |    | [Entrar] |      | Opción 2 --+--> | ListaClient |
  |  splash) |    |          |      | Opción 3 --+--> | Reportes    |
  |          |    |          |      | [Salir]    |    |             |
  +----------+    +----------+      +-------------+    +-------------+
```

El **splash** lo gestiona el framework automáticamente cargando un fichero `splash.png` (u otros formatos, ver más abajo) de la raíz del proyecto durante la carga inicial. NO es una `<coll>` XML.

### Funciones de Navegación

```javascript
// Abrir una pantalla (forma corta: pasar el nombre de la coll)
// XOne crea internamente un dataObject vacío y abre su EditView.
ui.openEditView("MenuPrincipal");

// Abrir un objeto existente o pre-rellenado
ui.openEditView(dataObject);

// Cerrar la vista origen al abrir la nueva (flujos lineales sin botón atrás)
ui.openEditView(dataObject, true);

// Cerrar la pantalla actual y volver a la anterior
let window = ui.getView(self);
window.exit();

// Salir completamente de la aplicación
appData.exit();
```

> Para el caso especial de abrir directamente la **lista** de una coll (no su EditView), ver topics/03b-js-ui.md §3.1 → `ui.openMenu("Coll", mask, 0)`.

### Pasar Datos entre Pantallas

Para abrir una pantalla pasándole datos, el patrón canónico es **obtener un dataObject de la colección destino, asignarle propiedades y lanzarlo con `ui.openEditView()`**:

```javascript
// === En la pantalla ORIGEN: preparar el objeto destino y abrir su vista ===
let coll = appData.getCollection("DetalleTarea");
let obj = new DetalleTarea({ MAP_ID_TAREA: self.ID });
coll.addItem(obj);
ui.openEditView(obj);

// === Abrir un objeto EXISTENTE de la BD ===
let coll = appData.getCollection("Tareas");
let tarea = coll.findObject("ID = " + nId);
if (tarea) {
    ui.openEditView(tarea);
}
```

> **Forma corta:** `ui.openEditView("DetalleTarea")` crea un objeto vacío y lo abre en una sola llamada — útil cuando no hay que pre-rellenar nada. Detalles en topics/03c-js-appdata-http.md §4.3.

### Ejemplo Completo: EntradaApp con Navegación

```xml
<?xml version="1.0" encoding="utf-8"?>
<coll name="EntradaApp" title="Bienvenido"
      special="true" notab="true" show-toolbar="false">

    <create>
        <action name="runscript">
            <script language="javascript">
                // Inicialización al crear la pantalla
            </script>
        </action>
    </create>

    <group name="grpPrincipal" id="1" class="groupNoTab">
        <!-- Cabecera con logo -->
        <frame name="frmHeader" class="frameHeader">
            <prop name="imgLogo" type="IMG" visible="7"
                  width="200p" height="80p" align="center"
                  src="./icons/app_icon.png"/>
        </frame>

        <!-- Cuerpo con botón de entrada -->
        <frame name="frmBody" class="frameBody">
            <prop name="lblBienvenida" type="L" visible="7"
                  width="100%" height="50p" align="center"
                  class="textoTitulo" title="Bienvenido a Mi App"/>

            <prop name="btnEntrar" type="B" visible="7"
                  width="80%" height="50p" align="center"
                  class="btnPrimario" title="Entrar" tmargin="30p"
                  onclick="ui.openEditView('MenuPrincipal');" />
        </frame>
    </group>

    <!-- Manejo del botón atrás: confirmar antes de salir -->
    <onback>
        <action name="runscript">
            <script language="javascript">
                let nResult = ui.msgBox(
                    "¿Desea salir de la aplicación?",
                    "Confirmar salida",
                    4  // Tipo 4 = Si/No
                );
                if (nResult == 6) {  // 6 = Si
                    appData.exit();
                }
            </script>
        </action>
    </onback>
</coll>
```

> Para profundizar en los patrones de navegación avanzados y el uso de `contents`, consulta 02 - Estructura XML y Colecciones.

---

## 8. Convenciones de Nomenclatura

Seguir convenciones de nomenclatura consistentes es fundamental para mantener un proyecto XOne organizado y legible.

### Colecciones y Pantallas

| Elemento | Convencion | Ejemplos |
|----------|-----------|----------|
| Nombre de coleccion | **PascalCase** | `MenuPrincipal`, `DetalleTarea`, `ListaClientes` |
| Archivo de coleccion | **PascalCase.xne** | `MenuPrincipal.xne`, `Tareas.xne` |
| Pantallas de lista | Prefijo `Lista` | `ListaTareas`, `ListaClientes`, `ListaPedidos` |
| Pantallas de detalle | Prefijo `Detalle` | `DetalleTarea`, `DetalleCliente` |
| Pantalla de entrada | Siempre `EntradaApp` | `EntradaApp.xne` |

### Propiedades y Campos

| Tipo de campo | Convencion | Ejemplos |
|-------------|-----------|----------|
| Campos de BD | **MAYUSCULAS** | `CODIGO`, `NOMBRE`, `FECHA_CREACION` |
| Campos temporales (UI) | Prefijo **MAP_** | `MAP_BTN_GUARDAR`, `MAP_TOTAL`, `MAP_BUSQUEDA` |
| Botones | `MAP_BTN_` + acción | `MAP_BTN_GUARDAR`, `MAP_BTN_CANCELAR`, `MAP_BTN_BUSCAR` |
| Labels informativos | `MAP_LBL_` + nombre | `MAP_LBL_TITULO`, `MAP_LBL_SUBTITULO` |
| Propiedades con `title` | camelCase o descriptivo | `txtNombre`, `btnGuardar`, `lblTitulo` |

#### Qué significa `MAP_`, exactamente

El prefijo **no es cosmético ni una convención de estilo**: le dice al framework que ese prop
**no es una columna de la tabla de `objname`**, y por eso lo excluye de los `INSERT` y `UPDATE`.
El valor vive solo en memoria, dentro del DataObject.

**Regla de oro:** si el valor no viene de una columna de `objname`, el `name` empieza por
`MAP_`. Los tres casos:

1. **Alias de JOIN** en el `sql` de la coll. La FK real va sin prefijo; la descripción traída
   del JOIN, con él:

   ```xml
   <coll name="Pedidos" objname="pedidos" updateobj="pedidos"
         sql="SELECT p.ID, p.IDCLIENTE, c.NOMBRE AS MAP_NOMBRECLIENTE
              FROM ##PREF##pedidos p JOIN ##PREF##clientes c ON c.ID = p.IDCLIENTE">
     <group name="General" id="1">
       <prop name="IDCLIENTE" type="T" visible="0" />          <!-- columna: sin MAP_ -->
       <prop name="MAP_NOMBRECLIENTE" type="T" title="Cliente" /><!-- alias: con MAP_ -->
     </group>
   </coll>
   ```

2. **Descripción de un combo con `linkedto`**: el prop oculto que guarda el ID **es** columna y
   va sin prefijo; el visible que enseña la descripción lleva `MAP_`.

3. **Props puramente visuales**: etiquetas `L`, botones `B`, totales calculados, estados de UI,
   buscadores, imágenes decorativas, callbacks `O`. Nada de eso se persiste.

**El fallo es SIMÉTRICO, y las dos mitades duelen distinto:**

| Error | Qué pasa |
|---|---|
| `MAP_` a algo que **sí** es columna | **el dato se pierde al guardar** — la pantalla carga bien, así que no se nota hasta que falta |
| **omitirlo** en un alias de JOIN o en la descripción de un combo | **error SQL** al actualizar: se intenta escribir en una columna que no existe |

**No son de solo lectura.** Se leen y escriben con normalidad (`self.MAP_X`, `setval`,
`linkedto`), valen en `disablevisible`, en macros `##FLD_MAP_X##` y como destino de
`ui.refresh("MAP_X")`. El `locked="true"` que aparece en muchos ejemplos es una decisión de
interfaz, no una consecuencia del prefijo.

### Clases CSS

| Tipo de clase | Convencion | Ejemplos |
|-------------|-----------|----------|
| Frames | Prefijo descriptivo | `.frameHeader`, `.frameBody`, `.frameFooter` |
| Botones | Prefijo `.btn` | `.btnPrimario`, `.btnSecundario`, `.btnPeligro` |
| Texto | Prefijo `.texto` | `.textoTitulo`, `.textoSubtitulo`, `.textoEditable` |
| Iconos | Prefijo `.icono` | `.iconoAccion`, `.iconoMenu` |
| Grupos | Prefijo `.group` | `.groupNoTab`, `.groupConTab` |

### Funciones JavaScript

| Tipo de función | Convencion | Ejemplos |
|----------------|-----------|----------|
| Funciones generales | **camelCase** | `mostrarToast()`, `cerrarPantalla()` |
| Funciones de validación | Prefijo `validar` | `validarFormulario()`, `validarCampo()` |
| Funciones de negocio | Verbo descriptivo + sustantivo | `doLogin()`, `createPDF()`, `validateUserInput()` |
| Funciones de evento | Prefijo `on` o `do` | `onMapClicked()`, `doLogin()` |
| Callbacks | Prefijo `callback` | `callbackGps()`, `callbackHttp()` |

### Variables JavaScript

| Tipo de variable | Convencion | Ejemplos |
|-----------------|-----------|----------|
| Variables locales | **camelCase** | `userName`, `isConnected`, `maxRetries` |
| Constantes | **MAYUSCULAS con guion bajo** | `MAX_RETRY_ATTEMPTS`, `DEFAULT_TIMEOUT` |
| Campos de interfaz (en self) | Prefijo **MAP_** | `MAP_USER`, `MAP_PASSWORD`, `MAP_COLORACTIVO`, `MAP_LOADING` |
| Objetos de configuración | **MAYUSCULAS** | `APP_CONFIG`, `CONNECTION_STATUS` |

```javascript
// CORRECTO - Variables locales en camelCase
var userName = "admin";
var isConnected = false;
var maxRetries = 3;

// CORRECTO - Constantes en MAYUSCULAS
var MAX_RETRY_ATTEMPTS = 3;
var DEFAULT_TIMEOUT = 5000;

// CORRECTO - Campos de interfaz con MAP_
self.MAP_USER = "usuario";
self.MAP_PASSWORD = "clave";
self.MAP_LOADING = 0;

// CORRECTO - Funciones con verbos descriptivos
function doLogin(user, pass) { }
function createPDF(fileName, pdf) { }
function validateUserInput() { }

// INCORRECTO - Nombres ambiguos o genericos
function process() { }
function handle() { }
var x = "admin";
var flag = true;
```

### Nomenclatura de Iconos

```
[prefijo]_[descripcion].png

Prefijos estándar:
  ic_       Iconos de interfaz        ic_menu.png, ic_search.png
  app_      Icono de aplicación       app_icon.png
  avatar_   Fotos de perfil           avatar_default.png
```

> **Nota:** La carpeta `icons/` acepta PNG, JPG y SVG. El formato PNG es el más habitual, pero SVG es perfectamente valido y no necesita conversion.

---

## 9. Primeros Pasos - Crear un Proyecto Básico

A continuacion, un checklist paso a paso para crear tu primer proyecto XOne funcional:

### Checklist: Proyecto "Hola Mundo"

```
 1. [ ] Crear la estructura de carpetas
 2. [ ] Crear app.xml con configuracion basica
 3. [ ] Crear app.ini con metadatos
 4. [ ] Crear mappings.xne con Empresas y Usuarios
 5. [ ] Crear default.css con estilos base
 6. [ ] Crear functions.js con utilidades
 7. [ ] Crear EntradaApp.xne como punto de entrada
 8. [ ] Crear MenuPrincipal.xne
 9. [ ] Generar la base de datos
10. [ ] Insertar datos iniciales (Empresa + Usuario admin)
11. [ ] Generar iconos
```

### Archivos Mínimos Necesarios

Un proyecto XOne funcional mínimo necesita exactamente estos archivos:

```
MiPrimerProyecto/
|-- app.xml               # Configuración
|-- app.ini               # Metadatos
|-- mappings.xne          # Empresas + Usuarios
|-- default.css           # Estilos
|-- functions.js          # Funciones globales
|-- EntradaApp.xne        # Pantalla de entrada
|-- MenuPrincipal.xne     # Menu principal
|-- bd/
|   +-- gestion.db        # Base de datos (generada)
|-- icons/
|   +-- app_icon.png      # Al menos un icono
+-- files/                # Carpeta vacia (para runtime)
```

### Ejemplo: Proyecto "Hola Mundo" Completo

#### 1. app.xml

```xml
<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<xml>
    <app
        prefix="gen"
        version="1.0.0"
        debug="true"
        autologon="true"
        screen-orientation="portrait"
        resolution-width="1080"
        resolution-height="1920"
        scale-fontsize="true"
        android-font-factor="7"
        default-language="javascript">

        <entry-point>
            <item name="EntradaApp" conditions="" />
        </entry-point>

        <style url="default.css" encoding="UTF-8" />
        <include file="functions.js" language="javascript" encoding="UTF-8"/>
    </app>
</xml>
```

> Nota: `autologon="true"` salta el login para simplificar este ejemplo.

#### 2. app.ini

```ini
Name=HolaMundo
Title=Hola Mundo XOne
Caption=Mi primer proyecto XOne
Icon=app_icon.png
IconFolder=icons
FilesFolder=files
HideSplash=false
```

#### 3. mappings.xne (mínimo obligatorio)

```xml
<?xml version="1.0" encoding="utf-8"?>
<xml>
    <app prefix="gen" version="1.0.0" debug="true" default-language="javascript">
        <style url="default.css" />
    </app>

    <collprops type="general">
        <coll name="Empresas"
              sql="SELECT * FROM ##PREF##Empresas"
              objname="Empresas"
              updateobj="Empresas"
              loadall="true">
            <group name="General" id="1">
                <prop name="CODIGO" type="N" visible="7" />
                <prop name="NOMBRE" type="T" visible="7" fieldsize="150" />
            </group>
        </coll>

        <coll name="Usuarios"
              sql="SELECT * FROM ##PREF##Usuarios"
              objname="Usuarios"
              updateobj="Usuarios"
              loadall="true">
            <group name="General" id="1">
                <prop name="CODIGO" type="N" visible="7" />
                <prop name="NOMBRE" type="T" visible="7" fieldsize="100" />
                <prop name="IDEMPRESA" type="N" visible="7"
                      mapcol="Empresas" mapfld="ID" />
                <prop name="LOGIN" type="T" visible="7" fieldsize="50" />
                <prop name="PWD" type="X" visible="0" fieldsize="100" />
            </group>
        </coll>
    </collprops>
</xml>
```

#### 4. default.css (estilos básicos)

```css
/* Configuración global */
prop {
    fontname: Roboto-Regular.ttf;
    fontsize: 10;
    labelbox: false;
    label-wrap: true;
    text-border: false;
}

coll {
    notab: true;
    show-toolbar: false;
    group-swipe: false;
    editmask: 0;
}

/* Clases de layout */
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

/* Clases de botones */
.btnPrimario {
    width: 90%;
    height: 50p;
    bgcolor: #2196F3;
    forecolor: #FFFFFF;
    border-corner-radius: 8;
    text-align: center;
    fontsize: 14;
}

/* Clases de texto */
.textoTitulo {
    fontsize: 18;
    forecolor: #212121;
    text-align: center;
}

.textoSubtitulo {
    fontsize: 14;
    forecolor: #757575;
    text-align: center;
}

/* Grupos sin pestana */
.groupNoTab {
    tab-visible: false;
}
```

#### 5. functions.js

```javascript
/**
 * Funciones globales - Hola Mundo XOne
 */

/**
 * Verifica si un valor esta vacio
 */
function isEmpty(val) {
    return val === undefined || val === null || val === "";
}

/**
 * Muestra un mensaje de confirmacion Si/No
 */
function confirmar(mensaje, titulo) {
    titulo = titulo || "Confirmar";
    let nResult = ui.msgBox(mensaje, titulo, 4);
    return nResult == 6;
}

/**
 * Muestra un toast simple
 */
function mostrarToast(mensaje) {
    ui.showToast(mensaje);
}

/**
 * Cierra la pantalla actual
 */
function cerrarPantalla() {
    let window = ui.getView(self);
    if (window) {
        window.exit();
    }
}
```

#### 6. EntradaApp.xne

```xml
<?xml version="1.0" encoding="utf-8"?>
<coll name="EntradaApp" title="Hola Mundo"
      special="true" notab="true" show-toolbar="false">

    <create>
        <action name="runscript">
            <script language="javascript">
                // Ir directamente al menu
                ui.openEditView("MenuPrincipal");
            </script>
        </action>
    </create>

    <group name="grpPrincipal" id="1" class="groupNoTab">
        <frame name="frmBody" class="frameBody">
            <prop name="lblCargando" type="L" visible="7"
                  width="100%" height="50p" align="center"
                  class="textoTitulo" title="Cargando..."/>
        </frame>
    </group>

    <onback>
        <action name="runscript">
            <script language="javascript">
                if (confirmar("Desea salir?", "Salir")) {
                    appData.exit();
                }
            </script>
        </action>
    </onback>
</coll>
```

#### 7. MenuPrincipal.xne

```xml
<?xml version="1.0" encoding="utf-8"?>
<coll name="MenuPrincipal" title="Menu Principal"
      special="true" notab="true" show-toolbar="false">

    <group name="grpMenu" id="1" class="groupNoTab">
        <frame name="frmHeader" class="frameHeader">
            <prop name="lblTitulo" type="L" visible="7"
                  width="100%" height="60p" align="center"
                  forecolor="#FFFFFF" fontsize="20"
                  title="Hola Mundo XOne"/>
        </frame>

        <frame name="frmBody" class="frameBody">
            <prop name="lblMensaje" type="L" visible="7"
                  width="100%" height="80p" align="center"
                  class="textoTitulo" tmargin="40p"
                  title="Bienvenido a tu primer proyecto XOne!"/>

            <prop name="lblInfo" type="L" visible="7"
                  width="90%" height="60p" align="center"
                  class="textoSubtitulo" tmargin="20p"
                  title="Este es un proyecto básico de ejemplo."/>

            <prop name="btnSaludo" type="B" visible="7"
                  width="80%" height="50p" align="center"
                  class="btnPrimario" title="Saludar" tmargin="40p"
                  onclick="ui.showToast('Hola desde XOne!');" />
        </frame>
    </group>

    <onback>
        <action name="runscript">
            <script language="javascript">
                if (confirmar("¿Desea salir de la aplicación?", "Salir")) {
                    appData.exit();
                }
            </script>
        </action>
    </onback>
</coll>
```

> Para una guía completa de creación de proyectos con todas las tareas finales (generar BD, insertar datos, descargar iconos), consulta el tópico 05 - Eventos, Patrones y FAQ.

