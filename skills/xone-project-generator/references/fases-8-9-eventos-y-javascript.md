# Generación XOne — Fases 8-9: eventos, permisos y JavaScript

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` §9–§10. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §9 Fase 8 eventos de ciclo de vida, navegación, colección Empresas, aplicación, inactividad, bind en controles, permisos Android y referencia rápida por ubicación · §10 Fase 9 plantilla functions.js y referencia rápida de API

---

## 9. Fase 8: Eventos y Reglas de Negocio

### 8.1 Objetivo

Los eventos son el mecanismo principal para dar vida a la aplicación. Permiten ejecutar lógica de negocio en respuesta a acciones del usuario o del sistema. A diferencia del JavaScript de organización (funciones generales), los eventos están ligados directamente al ciclo de vida de las colecciones, controles y la propia aplicación.

> **IMPORTANTE:** Los eventos pueden ocurrir por una acción ejecutada por el usuario en la interfaz visual o por un script creado por el programador.

### 8.2 Estructura General de un Evento

Todo evento en XOne sigue esta estructura XML:

```xml
<nombre-evento refresh="true|false" show-wait-dialog="true|false">
    <action name="runscript">
        <script language="javascript">
            // Código JavaScript aquí
        </script>
    </action>
</nombre-evento>
```

**Atributos comunes a todos los eventos:**

| Atributo | Valores | Descripción |
|----------|---------|-------------|
| `refresh` | `true` / `false` | Si se refresca la UI después de ejecutar el evento |
| `show-wait-dialog` | `true` / `false` | Si se muestra dialogo de espera durante la ejecución |

---

### 8.3 Eventos de Ciclo de Vida de Coleccion

Estos eventos se definen dentro de cualquier coleccion `.xne` y responden al ciclo de vida de sus objetos.

| Evento | Cuando se ejecuta |
|--------|-------------------|
| `create` | Cuando se crea un objeto nuevo (por acción del framework o por script) |
| `insert` | Cuando el usuario guarda un objeto (insercion nueva o actualización) |
| `before-edit` | Al ir a editar un objeto, **antes** de que se pinte la pantalla |
| `after-edit` | Al ir a editar un objeto, **una vez** que ya esta pintado el UI |
| `onchange` | Cuando cambia el valor de un campo monitoreado |
| `delete` | Cuando se va a borrar un objeto |

#### `create` — Inicializar valores al crear

```xml
<create refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // Inicializar campos por defecto al crear un objeto nuevo
            self.FECHA = new Date();
            self.ESTADO = "PENDIENTE";
            self.ID_USUARIO = appData.getGlobalMacro("##USERID##");
        </script>
    </action>
</create>
```

#### `insert` — Validar antes de guardar

```xml
<insert refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // Validar campos obligatorios antes de guardar
            if (!self.NOMBRE || self.NOMBRE.trim() === "") {
                appData.failWithMessage(-8100, "El campo NOMBRE es obligatorio.");
            }
            if (!self.FECHA) {
                appData.failWithMessage(-8100, "La fecha no puede estar vacia.");
            }
        </script>
    </action>
</insert>
```

#### `before-edit` — Preparar datos antes de mostrar pantalla

```xml
<before-edit refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // Se ejecuta antes de pintar la UI
            // Util para cargar datos externos o calcular valores previos
            self.MAP_TITULO = "Editando: " + self.NOMBRE;
        </script>
    </action>
</before-edit>
```

#### Refresco de disablevisible por script

Cuando un campo referenciado en `disablevisible` cambia por código, hay que refrescar para que se reevalue:

```javascript
// Refrescar un prop específico
ui.refresh("MAP_CAMPO");

// Refrescar toda la pantalla
ui.refresh();

// Con referencia explicita a la vista
var view = ui.getView(self);
view.refresh("MAP_CAMPO");  // prop específico
view.refresh();              // toda la pantalla
```

#### `after-edit` — Inicializar UI tras pintar pantalla

```xml
<after-edit refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // La pantalla ya esta pintada, se pueden refrescar controles
            ui.refresh("MAP_TITULO", "ESTADO");
            // Mostrar version de la app en campos de display
            self.MAP_VERSION = "v" + appData.getGlobalMacro("##VERSION##");
        </script>
    </action>
</after-edit>
```

#### `onchange` — Reaccionar al cambio de un campo

```xml
<onchange>
    <prop name="ESTADO">
        <action name="runscript">
            <script language="javascript">
                // Se ejecuta cuando cambia el campo ESTADO
                if (self.ESTADO === "CERRADO") {
                    self.FECHA_CIERRE = new Date();
                    ui.refresh("FECHA_CIERRE");
                }
            </script>
        </action>
    </prop>
    <prop name="CANTIDAD">
        <action name="runscript">
            <script language="javascript">
                // Recalcular total al cambiar cantidad
                self.TOTAL = self.CANTIDAD * self.PRECIO;
                ui.refresh("TOTAL");
            </script>
        </action>
    </prop>
</onchange>
```

#### `delete` — Validar o limpiar antes de borrar

```xml
<delete refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // Impedir borrado si el objeto esta en estado activo
            if (self.ESTADO === "ACTIVO") {
                appData.failWithMessage(-8100, "No se puede eliminar un registro en estado ACTIVO.");
            }
        </script>
    </action>
</delete>
```

#### `load` — Procesamiento por cada registro al cargar un contents

> **Uso poco frecuente.** Se ejecuta una vez por cada registro en el momento en que la coleccion se carga como fuente de datos de un contents. **No tiene relación con la edición** — para eso se usan `before-edit` y `after-edit`. Útil para calcular campos visuales (`MAP_`) que dependen de lógica compleja que no puede resolverse en el SQL.

```xml
<load refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // Se ejecuta para cada fila al cargar el contents
            // Util para calcular campos MAP_ de visualización
            if (self.STOCK <= self.STOCK_MINIMO) {
                self.MAP_COLOR_ALERTA = "#FFCCCC";
            } else {
                self.MAP_COLOR_ALERTA = "#FFFFFF";
            }
        </script>
    </action>
</load>
```

---

### 8.4 Eventos de Navegación

#### `onback` — Controlar el botón Atrás (solo Android)

Obligatorio en toda pantalla. Controla el comportamiento del botón físico/gesto de volver atrás del sistema.

```xml
<onback show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            ui.getView(self).exit();
        </script>
    </action>
</onback>
```

#### `selecteditem` — Selección en contents (subgrid)

Se ejecuta cuando se selecciona un elemento de un contents. Solo disponible en colecciones mostradas como contents.

```xml
<selecteditem refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // self es el objeto seleccionado en el contents
            ui.openEditView(self);
        </script>
    </action>
</selecteditem>
```

#### `auto-selecteditem` — Paso automático de slides

Exclusivo para contents con `viewmode="slideview"`. Se ejecuta conforme van pasando automáticamente las presentaciones sin interaccion del usuario.

```xml
<auto-selecteditem refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // Lógica al cambiar de slide automaticamente
        </script>
    </action>
</auto-selecteditem>
```

---

### 8.5 Eventos de la Coleccion Empresas

Estos eventos son **exclusivos de la coleccion Empresas** en `mappings.xne` y controlan el ciclo de vida global de la aplicación.

| Evento | Descripción |
|--------|-------------|
| `onlogon` | Cuando el usuario entra en la aplicación (login correcto) |
| `onlogoff` | Cuando el usuario sale de la aplicación |
| `maintenance` | Tareas programadas que se ejecutan en segundo plano periódicamente |
| `replica-ok` | Cuando se completa la replica de una tabla concreta de la BD |
| `sys-message` | Para recibir eventos de XOneLive |
| `onpushnotificationclick` | Cuando el usuario pulsa en una notificación PUSH |
| `onmessage` | Procesamiento de intents del sistema |
| `onrecovery` | Chequea si el usuario ya estaba validado (sesión recuperada) |
| `after-recovery-login` | Tras recuperar sesión de login |

```xml
<!-- En mappings.xne, dentro de la coleccion Empresas -->
<onlogon refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // Inicializar variables globales al entrar en la app
            ui.showToast("Bienvenido, " + appData.getGlobalMacro("##USERNAME##"));
        </script>
    </action>
</onlogon>

<onlogoff refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // Limpiar datos al salir
        </script>
    </action>
</onlogoff>

<maintenance interval="300000" refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // Tarea que se ejecuta cada 5 minutos (300000 ms) en segundo plano
            replica.start();
        </script>
    </action>
</maintenance>

<replica-ok table="Pedidos" refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // Se ejecuta cuando termina la replica de la tabla Pedidos
            ui.showToast("Pedidos sincronizados");
        </script>
    </action>
</replica-ok>
```

---

### 8.6 Eventos Especiales de Aplicación

Estos eventos controlan el comportamiento global de la app cuando cambia de estado en el sistema operativo.

#### `on-app-foreground` — App vuelve a primer plano

```xml
<on-app-foreground refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // La app vuelve al primer plano
            // Comprobar inactividad y relanzar timer si procede
            let nTime = ui.getInactivityTime();
            if (nTime >= jsconst_oper.tiempoInactividad) {
                var objVisible = getLoginInStack();
                if (isNothing(objVisible)) {
                    let objCrear = new LoginColl_Inactivity();
                    ui.openEditView(objCrear);
                }
            }
            let inactividad = setInactivityTimer(jsconst_oper.tiempoInactividad);
        </script>
    </action>
</on-app-foreground>
```

#### `on-app-background` — App pasa a segundo plano

```xml
<on-app-background refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // La app pasa a segundo plano
            // Detener el timer de inactividad
            ui.removeInactivityTimer();
        </script>
    </action>
</on-app-background>
```

---

### 8.7 Inactividad de Sesión

Para implementar bloqueo por inactividad, definir el código en el nodo `entryPoint` o en `onlogon`:

```javascript
// Lanzar el contador de inactividad
function setInactivityTimer(nValue) {
    ui.setInactivityTimer({
        timeout: nValue,  // Tiempo en milisegundos
        callback: function() {
            var objVisible = getLoginInStack();
            if (isNothing(objVisible)) {
                let objCrear = new LoginColl_Inactivity();
                ui.openEditView(objCrear);
            }
            return 3;
        }
    });
}

// Obtener tiempo de inactividad actual
let nTime = ui.getInactivityTime();

// Detener el timer
ui.removeInactivityTimer();
```

---

### 8.8 Eventos en Controles (bind)

Los eventos de controles especificos se definen como atributos en el prop o mediante `bind()` en JavaScript.

> Los eventos se nombran todo en **minuscula** cuando se definen como atributos XML, y es indiferente cuando se usa `bind()`.

**Propiedades comunes a todos los objetos de eventos:**

| Propiedad | Descripción |
|-----------|-------------|
| `target` | Propiedad objetivo que lanzo el evento |
| `objItem` | DataObject que lanzo el evento |
| `data` | Objeto JavaScript extra definido por el usuario al hacer `bind()` |

#### Eventos por tipo de control

| Control | Evento | Descripción |
|---------|--------|-------------|
| `prop type="B"` | `onclick` | Clic en botón. Parámetros: `x`, `y` (posición en pantalla) |
| `prop type="B"` | `onlongpress` | Pulsación larga en botón. Parámetros: `x`, `y` |
| `contents` | `onlongpressitem` | Pulsación larga en elemento de lista. Parámetro: `position` |
| `contents` | `onselecteditem` | Selección de elemento en lista. Parámetro: `position` |
| `prop type="T"` | `ontextchanged` | Cambio de texto. Parámetros: `target`, `keyPressed`, `oldText`, `newText` |
| `prop type="T"` | `ontextlengthchanged` | Cambio de longitud del texto. Parámetro: `length` |
| `prop type="T"` | `onfocuschanged` | Cambio de foco. Parámetro: `isFocused` |
| `prop type="T"` | `oneditoraction` | Pulsación de tecla intro/siguiente en teclado |
| `prop type="WEB"` | `onconsolemessage` | Errores del WebView. Parámetros: `messageLevel`, `message`, `lineNumber`, `sourceId` |
| `frame` | `onscroll` | Scroll en frame. Parámetros: `dx`, `dy`, `scrollX`, `scrollY`, `width`, `height` |
| `contents viewmode="picturemap"` | `ontouch` | Toque en mapa de imagen. Parámetros: `x`, `y`, `translateX`, `translateY`, `scale` |

**Ejemplo `ontextchanged`:**

```javascript
function eventoOnTextChanged(evento) {
    ui.showToast("Cambio en: " + evento.target +
        " | Tecla: " + evento.keyPressed +
        " | Texto anterior: " + evento.oldText +
        " | Texto nuevo: " + evento.newText);
}
```

**Ejemplo `onconsolemessage` para errores WebView:**

```xml
<prop type="WEB" onconsolemessage="handleError(e);" ... />
```
```javascript
function handleError(e) {
    if (e.messageLevel === "ERROR") {
        ui.msgBox("Nivel: " + e.messageLevel +
            "\nMensaje: " + e.message +
            "\nLinea: " + e.lineNumber, "Error WebView", 0);
    }
}
```

---

### 8.9 Permisos de la Aplicación (solo Android)

A partir de Android 6.x los permisos no se conceden al instalar la app sino en tiempo de ejecución (runtime). XOne solicita los permisos automáticamente antes de ejecutar `openEditView` si la coleccion tiene definido el nodo `<permissions>`.

**Regla:** Poner `<permissions>` en la coleccion `login-coll` o en el `entry-point` para que estén disponibles desde el inicio. Si un permiso ya fue concedido, no se vuelve a solicitar.

> Los permisos son **obligatorios**: si el usuario los deniega, no puede entrar en la coleccion donde se solicitaron.

#### Nodo `<permissions>` — lista de permisos disponibles

```xml
<permissions>
    <!-- Acceso a almacenamiento externo/SDCard. Necesario para replica y funcionamiento general -->
    <permission name="external-storage" />

    <!-- Acceso al hardware de telefonia: llamadas, IMEI y otros identificadores -->
    <permission name="phone" />

    <!-- Acceso a la camara. Necesario para foto, QR, OCR, etc. -->
    <permission name="camera" />

    <!-- GPS y localización por wifi. Permanece activo aunque la app este en segundo plano -->
    <permission name="location" />

    <!-- Solo coordenadas en primer plano (menos intrusivo que location) -->
    <permission name="location-foreground" />

    <!-- Leer y escribir eventos en el calendario del usuario -->
    <permission name="calendar" />

    <!-- Leer los contactos del dispositivo -->
    <permission name="contacts" />

    <!-- Acceso al microfono -->
    <permission name="microphone" />

    <!-- Recibir notificaciones push. OBLIGATORIO para Android >= 13 en instalaciones nuevas -->
    <permission name="notifications" />

    <!-- Bluetooth. OBLIGATORIO para Android >= 12 si se usan impresoras u otros dispositivos BT -->
    <permission name="bluetooth" />

    <!-- SMS: lectura y envio. CUIDADO: Google Play NO permite este permiso salvo causa justificada -->
    <!-- <permission name="sms" /> -->
</permissions>
```

#### Tabla de permisos y cuando usarlos

| Permiso | Cuando es necesario |
|---------|---------------------|
| `external-storage` | Siempre que haya replica o se gestionen ficheros |
| `phone` | Para obtener IMEI/identificador de dispositivo |
| `camera` | Fotos (`type="PH"`), lector QR (`type="VD" code-type="qr"`), OCR (`XOneOCR`) |
| `location` | GPS en segundo plano, tracking de posición |
| `location-foreground` | GPS solo mientras la app esta en pantalla |
| `calendar` | Integración con el calendario del dispositivo |
| `contacts` | Acceso a contactos del dispositivo. Necesario para la fuente de datos `Contacts` (ver §"Leer y escribir los contactos del teléfono") |
| `microphone` | Grabacion de audio/voz |
| `notifications` | Android >= 13, instalaciones nuevas |
| `bluetooth` | Android >= 12, impresoras BT (`XOnePrinter`), dispositivos serie |

#### Funciones JavaScript relacionadas con permisos y seguridad

**Desactivar optimización de batería** — necesario para apps que deben seguir ejecutandose en segundo plano (GPS, replica periódica, notificaciones):

```javascript
function requestIgnoreBatteryOptimizations() {
    var bResult = systemSettings.isIgnoringBatteryOptimizations();
    if (!bResult) {
        ui.showToast("Por favor desactive el ahorro de bateria para la aplicación");
        systemSettings.requestIgnoreBatteryOptimizations();
    }
}
```

**Comprobar estado del GPS** — verificar si el usuario tiene la localización activada antes de usarla:

```javascript
function comprobarEstadoGps() {
    var sDeviceOs = appData.getGlobalMacro("##DEVICE_OS##");
    if (sDeviceOs === "android") {
        var nStatus = ui.checkGpsStatus();
        switch (nStatus) {
            case 0:
                ui.showToast("No hay GPS, no se puede activar.");
                break;
            case 1:
                // Localización GPS activa — OK
                break;
            case 2:
                // Localización por redes wifi/telefonia activa — OK
                break;
            case 3:
                // Sin GPS ni redes: pedir al usuario que lo active
                ui.showToast("No esta activado el GPS ni la ubicación por redes. Activelo.");
                ui.askUserForGpsPermission();
                break;
            case 4:
                // GPS + redes activos — OK
                break;
            default:
                break;
        }
    }
}
```

| Valor `checkGpsStatus()` | Significado |
|--------------------------|-------------|
| `0` | Sin GPS en el dispositivo |
| `1` | GPS activo |
| `2` | Localización por wifi/redes activa |
| `3` | Sin localización activada → llamar a `askUserForGpsPermission()` |
| `4` | GPS + redes activos |
| `-1` | Error inesperado |

---

### 8.10 Referencia Rápida de Eventos por Ubicación

| Ubicación | Eventos disponibles |
|-----------|---------------------|
| **Cualquier coleccion** | `create`, `insert`, `before-edit`, `after-edit`, `onchange`, `delete`, `onback`, `selecteditem`, `load`, `auto-selecteditem` |
| **Solo coleccion Empresas** | `onlogon`, `onlogoff`, `maintenance`, `replica-ok`, `sys-message`, `onpushnotificationclick`, `onmessage`, `onrecovery`, `after-recovery-login` |
| **Solo Android (cualquier coll)** | `onback` |
| **Coleccion con entryPoint** | `on-app-foreground`, `on-app-background` |
| **Controles (atributo o bind)** | `onclick`, `onlongpress`, `ontextchanged`, `onfocuschanged`, `oneditoraction`, `onscroll`, `onconsolemessage`, `ontouch` |

---

## 10. Fase 9: Funciones JavaScript

### 9.1 Objetivo

Crear el archivo `functions.js` con las funciones JavaScript globales de la aplicación.

### 9.2 Reglas Obligatorias

1. **Solo usar API documentada**: `ui.*`, `appData.*`, `self.*`, `$http.*`, `crypto.*`
2. **NO usar APIs web del DOM**: `document.*`, `window.*`, `localStorage.*`, `XMLHttpRequest`, `navigator.*`
3. **Async**: el patrón XOne idiomático son callbacks. Si la situación lo requiere, también está disponible `Promise` (ES2024 completo) o `fetch`. `async`/`await` todavía NO es parseable.
4. **Objeto `self`**: Referencia al DataObject actual en el contexto del script

### 9.3 Plantilla: functions.js

```javascript
/**
 * Funciones globales del proyecto
 * NombreProyecto - v1.0.0
 */

// ============================================
// CONSTANTES DEL PROYECTO
// ============================================

var APP_VERSION = "1.0.0";
var COLOR_PRIMARIO = "#2196F3";
var COLOR_EXITO = "#4CAF50";
var COLOR_ERROR = "#F44336";

// ============================================
// UTILIDADES GENERALES
// ============================================

/**
 * Verifica si un valor esta vacio
 * @param {*} val - Valor a verificar
 * @returns {boolean}
 */
function isEmpty(val) {
    return val === undefined || val === null || val === "";
}

/**
 * Conversion segura a string
 * @param {*} val - Valor a convertir
 * @returns {string}
 */
function cstr(val) {
    if (val === undefined || val === null) return "";
    return val.toString();
}

/**
 * Conversion segura a numero
 * @param {*} val - Valor a convertir
 * @returns {number}
 */
function cnum(val) {
    if (val === undefined || val === null) return 0;
    var n = parseFloat(val);
    return isNaN(n) ? 0 : n;
}

// getControl(name, [dataObject]) es NATIVA del motor (Rhino y V8).
// NO declararla en functions.js. Firma:
//   getControl(name)             → control en la última ventana visible.
//   getControl(name, dataObject) → control en la ventana asociada a ese DataObject.
// Semántica estricta: lanza error si el nombre está vacío, el control no existe,
// no hay ventana destino, o el dataObject no es válido.
// Si un proyecto legacy ya tiene su propio "function getControl(...)", esa
// declaración sombrea a la nativa en su scope local sin tocar la global.

// ============================================
// NAVEGACION
// ============================================

/**
 * Abre una pantalla/colección
 * @param {string} sNombreColl - Nombre de la colección a abrir
 */
function abrirPantalla(sNombreColl) {
    ui.openEditView(sNombreColl);  // crea internamente el dataObject + AddItem y abre su EditView
}

/**
 * Cierra la pantalla actual
 */
function cerrarPantalla() {
    var window = ui.getView(self);
    if (window) {
        window.exit();
    }
}

/**
 * Muestra un grupo con animacion
 * @param {number} nGroup - Indice del grupo (base 0)
 * @param {string} sAnimIn - Animacion de entrada
 * @param {string} sAnimOut - Animacion de salida
 */
function mostrarGrupo(nGroup, sAnimIn, sAnimOut) {
    sAnimIn = sAnimIn || "##ALPHA_IN##";
    sAnimOut = sAnimOut || "##ALPHA_OUT##";
    ui.showGroup(nGroup, sAnimIn, 200, sAnimOut, 200);
}

// ============================================
// MENSAJES Y DIALOGOS
// ============================================

/**
 * Muestra un mensaje de confirmacion Si/No
 * @param {string} sMensaje - Mensaje a mostrar
 * @param {string} sTitulo - Titulo del dialogo
 * @returns {boolean} - true si el usuario acepto
 */
function confirmar(sMensaje, sTitulo) {
    sTitulo = sTitulo || "Confirmar";
    var nResult = ui.msgBox(sMensaje, sTitulo, 4);
    return nResult == 6; // 6=Si, 7=No
}

/**
 * Muestra un toast simple
 * @param {string} sMensaje - Mensaje a mostrar
 */
function mostrarToast(sMensaje) {
    ui.showToast(sMensaje);
}

/**
 * Muestra un mensaje informativo
 * @param {string} sMensaje - Mensaje a mostrar
 * @param {string} sTitulo - Titulo del dialogo
 */
function mostrarMensaje(sMensaje, sTitulo) {
    sTitulo = sTitulo || "Información";
    ui.msgBox(sMensaje, sTitulo, 0);
}

// ============================================
// COLECCIONES Y DATOS
// ============================================

/**
 * Obtiene una coleccion por nombre
 * @param {string} sNombreColl - Nombre de la coleccion
 * @returns {object}
 */
function obtenerColeccion(sNombreColl) {
    return appData.getCollection(sNombreColl);
}

/**
 * Crea un nuevo objeto en una coleccion
 * @param {string} sNombreColl - Nombre de la coleccion
 * @returns {object} - Nuevo objeto creado
 */
function crearObjeto(sNombreColl) {
    var coll = appData.getCollection(sNombreColl);
    var obj = coll.createObject();
    coll.addItem(obj);
    return obj;
}

/**
 * Busca un objeto en una coleccion
 * @param {string} sNombreColl - Nombre de la coleccion
 * @param {string} sFiltro - Condicion SQL de busqueda
 * @returns {object|null}
 */
function buscarObjeto(sNombreColl, sFiltro) {
    var coll = appData.getCollection(sNombreColl);
    return coll.findObject(sFiltro);
}

// ============================================
// VALIDACIONES
// ============================================

/**
 * Valida que los campos obligatorios no esten vacios
 * @param {object} obj - Objeto a validar
 * @param {array} aCampos - Array de nombres de campos
 * @returns {boolean} - true si todos tienen valor
 */
function validarObligatorios(obj, aCampos) {
    for (var i = 0; i < aCampos.length; i++) {
        if (isEmpty(obj[aCampos[i]])) {
            ui.showToast("El campo " + aCampos[i] + " es obligatorio");
            return false;
        }
    }
    return true;
}

/**
 * Valida formato de email basico
 * @param {string} sEmail - Email a validar
 * @returns {boolean}
 */
function validarEmail(sEmail) {
    if (isEmpty(sEmail)) return false;
    return sEmail.indexOf("@") > 0 && sEmail.indexOf(".") > 0;
}

// ============================================
// FORMATO DE FECHAS
// ============================================

/**
 * Formatea una fecha como DD/MM/YYYY
 * @param {Date} dFecha - Fecha a formatear
 * @returns {string}
 */
function formatearFecha(dFecha) {
    if (!dFecha) return "";
    var dd = dFecha.getDate();
    var mm = dFecha.getMonth() + 1;
    var yyyy = dFecha.getFullYear();
    if (dd < 10) dd = "0" + dd;
    if (mm < 10) mm = "0" + mm;
    return dd + "/" + mm + "/" + yyyy;
}

/**
 * Formatea una fecha como DD/MM/YYYY HH:MM
 * @param {Date} dFecha - Fecha a formatear
 * @returns {string}
 */
function formatearFechaHora(dFecha) {
    if (!dFecha) return "";
    var sFecha = formatearFecha(dFecha);
    var hh = dFecha.getHours();
    var mi = dFecha.getMinutes();
    if (hh < 10) hh = "0" + hh;
    if (mi < 10) mi = "0" + mi;
    return sFecha + " " + hh + ":" + mi;
}
```

### 9.4 Referencia Rápida de API JavaScript XOne

#### Objeto `ui` (Interfaz de Usuario)

| Función | Descripción |
|---------|-------------|
| `ui.msgBox(msg, título, tipo)` | Dialogo (tipo 4=Si/No, retorna 6=Si) |
| `ui.showToast(msg)` | Mensaje rápido |
| `ui.showWaitDialog(msg)` | Indicador de carga |
| `ui.hideWaitDialog()` | Ocultar indicador |
| `ui.getView(self)` | Obtener ventana actual |
| `ui.openEditView(obj)` | Abrir pantalla. Acepta un dataObject (lo abre en EditView) o un nombre de coll (crea internamente el objeto y abre su EditView). 2º arg `exit=true` cierra la vista origen. **Patrón principal de navegación**. |
| `ui.openMenu(coll, mask, 0)` | Caso especial: abrir directamente la LISTA (`MainListCollectionActivity`) de una coll en vez de su EditView. Constantes `mask`: ADD=0x01, EDIT=0x02, DELETE=0x04, VIEW=0x200, FULLMASK=0xFFFFFF |
| `ui.refresh()` | Refrescar UI |
| `ui.refresh("campo")` | Refrescar campo |
| `ui.showGroup(n)` | Mostrar grupo/tab |
| `ui.startGps(options)` | Iniciar GPS |
| `ui.showDatePicker(options)` | Selector de fecha |
| `ui.showTimePicker(options)` | Selector de hora |
| `ui.scanDocument(params)` | Escáner de documentos del sistema (encuadre guiado, recorte, filtros, varias páginas). Params: `mode` (`"base"`/`"baseWithFilters"`/`"full"`), `pageLimit`, `allowGallery`, `outputJpg`/`outputPdf` (al menos uno activo), callbacks `onSuccess` (array de nombres de fichero en `appData.getFilesPath()` con prefijo `scan_`), `onError` y `onCancelled` (ambos obligatorios). Requiere Google Play Services |
| `ui.recognizeText(params)` | OCR (alfabeto latino) de una imagen del dispositivo. Params: `path` (obligatorio), `onSuccess`/`onError` (obligatorios), `roi` (`{left, top, width, height}`), `scale`, `grayscale`, `detail` (devuelve líneas con `confidence` y posición). Encaja detrás de `scanDocument` para leer lo escaneado |

#### Objeto `appData` (Datos de Aplicación)

| Función | Descripción |
|---------|-------------|
| `appData.getCollection(nombre)` | Obtener coleccion |
| `appData.login(options)` | Iniciar sesión |
| `appData.logout()` | Cerrar sesión |
| `appData.exit()` | Salir de la app |
| `appData.getAppPath()` | Ruta de la app |
| `appData.getFilesPath()` | Ruta de archivos |
| `appData.getGlobalMacro(macro)` | Obtener macro global |
| `appData.failWithMessage(code, msg)` | Fallo controlado |

#### Objeto `self` (Objeto de Datos Actual)

| Propiedad/Función | Descripción |
|-------------------|-------------|
| `self.CAMPO` | Leer/escribir campo |
| `self.save()` | Guardar cambios |
| `self.getOwnerCollection()` | Obtener coleccion |
| `self.getContents("@nombre")` | Obtener contents |
| `self.toJsonString()` | Convertir a JSON |

#### Colecciones

| Función | Descripción |
|---------|-------------|
| `coll.loadAll()` | Cargar todos los registros |
| `coll.getCount()` | Cantidad de registros |
| `coll.get(índice)` | Obtener por índice |
| `coll.findObject(filtro)` | Buscar objeto |
| `coll.createObject()` | Crear objeto (legacy; el patrón preferido es `new NombreColeccion({...})`) |
| `coll.addItem(obj)` | Agregar objeto |
| `coll.deleteItem(índice)` | Eliminar objeto |
| `coll.setFilter(filtro)` | Aplicar filtro |
| `coll.doSort(campo)` | Ordenar |
| `coll.lock()` / `coll.unlock()` | Bloquear/desbloquear |
| `coll.saveAll()` | Guardar todos |

