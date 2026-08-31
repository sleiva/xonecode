# XOne JavaScript — ui: navegación, mensajes y vista

> Fuente: `xone/v2/xone-help-docs/topics/03b-js-ui.md` §3.1–§3.4. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §3.1 navegación (openEditView, openMenu) · §3.2 mensajes y diálogos (msgBox, showToast, showSnackbar) · §3.3 refrescar y acceder a controles, showcase · §3.4 date/time pickers

---

### 3.1 Navegación

`ui.openEditView()` es el mecanismo principal de navegación en XOne. Sirve tanto para "abrir una pantalla" como para "editar un objeto existente":

```javascript
// === Abrir una pantalla (la forma habitual) ===
// Firma: ui.openEditView(target, [exit])
//   target : dataObject | string — un dataObject ya preparado, o el nombre de la coll destino
//   exit   : boolean — si true, cierra la vista origen al abrir la nueva (default false)

// Forma corta: pasar el nombre de la coll. XOne crea internamente un dataObject
// vacío de esa coll (createObject + addItem) y abre su vista de edición.
ui.openEditView("Productos");

// Pasar un objeto NUEVO con datos pre-rellenados
let coll = appData.getCollection("Productos");
let obj = new Productos({ MAP_CATEGORIA_ID: idCategoria });
coll.addItem(obj);
ui.openEditView(obj);

// Abrir un objeto EXISTENTE recuperado de la BD
let producto = appData.getCollection("Productos").findObject("ID = " + nId);
if (producto) {
    ui.openEditView(producto);
}

// Cerrar la vista origen al abrir la nueva (flujos lineales sin botón atrás)
ui.openEditView(obj, true);

// === Obtener la ventana actual ===
let window = ui.getView(self);   // Ventana del objeto actual
let window = ui.getView();       // Ventana actual sin parametro

// === Cerrar ventana actual ===
let window = ui.getView(self);
if (window) {
    window.exit();
}

// === Cerrar la aplicación ===
appData.exit();

// === Mostrar/ocultar grupos (tabs) ===
ui.showGroup(2);  // Mostrar grupo por indice

// Con animacion
ui.showGroup(2, "##ALPHA_IN##", 200, "##ALPHA_OUT##", 200);

// Ejemplo real: navegacion entre paginas con animacion
function mostrarGrupo(nGroup, sAnimIn, sAnimOut) {
    sAnimIn = sAnimIn || "##ALPHA_IN##";
    sAnimOut = sAnimOut || "##ALPHA_OUT##";
    ui.showGroup(nGroup, sAnimIn, 200, sAnimOut, 200);
}
```

**Animaciones predefinidas disponibles:**

| Constante | Descripción |
|-----------|-------------|
| `##ALPHA_IN##` / `##ALPHA_OUT##` | Entrada/salida con fundido |
| `##ZOOM_IN##` / `##ZOOM_OUT##` | Entrada/salida con zoom |
| `##LEFT_IN##` / `##LEFT_OUT##` | Deslizar desde/hacia la izquierda |
| `##RIGHT_IN##` / `##RIGHT_OUT##` | Deslizar desde/hacia la derecha |
| `##TOP_IN##` / `##TOP_OUT##` | Deslizar desde/hacia arriba |
| `##BOTTOM_IN##` / `##BOTTOM_OUT##` | Deslizar desde/hacia abajo |

#### Caso especial — abrir la LISTA de una coll directamente

`ui.openEditView()` siempre abre el EditView de un dataObject. Si lo que se necesita es lanzar directamente la **lista** de una coll como pantalla independiente (`MainListCollectionActivity` o `MainCalendarViewActivity` si tiene `viewmode="calendar"`), hay que recurrir al método legacy `ui.openMenu(collName, mask, mode)` con `mode=0`:

```javascript
// Lista con todas las opciones del menú (mode=0, mask=0xFFFFFF)
ui.openMenu("Productos", 0xFFFFFF, 0);

// Lista en modo sólo lectura (mask = MENU_MASK_VIEW)
ui.openMenu("Productos", 0x000200, 0);
```

Constantes `mask` (combinables con OR — JavaScript NO expone los nombres, usar el valor numérico): `ADD=0x01`, `EDIT=0x02`, `DELETE=0x04`, `EXIT=0x08`, `FILTRAR=0x10`, `SAVE=0x40`, `SORT=0x80`, `REFRESH=0x100`, `VIEW=0x200`, `FULLMASK=0xFFFFFF`.

> Para el resto de necesidades de navegación (abrir una pantalla nueva, abrir un objeto existente, abrir un detalle desde un `<selecteditem>`) usar siempre `ui.openEditView()`. Habitualmente las "listas" en XOne se muestran como `<contents>` embebido en una pantalla padre, no como activity independiente — por eso `mode=0` se necesita poco.

### 3.2 Mensajes y Dialogos

```javascript
// === Message Box clasico ===
// Tipo 0 = Solo botón OK
// Tipo 4 = Botones Si/No (retorna 6=Si, 7=No)
let nResult = ui.msgBox("Desea continuar?", "Confirmar", 4);
if (nResult == 6) {
    // Usuario pulso Si
}

// === Toast simple ===
ui.showToast("Mensaje rápido");

// === Toast personalizado ===
ui.showToast({
    color    : "#4CAF50",          // Color de fondo
    duration : "short",            // "short" o "long"
    text     : "Guardado correctamente",
    textColor: "#FFFFFF",          // Color del texto
    textFont : "Roboto-Regular.ttf",  // Fuente (debe estar en fonts/)
    textSize : 14,                 // Tamano de fuente
    rounded  : true                // Esquinas redondeadas
});

// === Snackbar simple (solo texto) ===
ui.showSnackbar("Registro eliminado");   // duración "long", texto blanco por defecto

// === Snackbar con acción ===
ui.showSnackbar({
    text           : "Registro eliminado", // OBLIGATORIO (vacío => excepción)
    color          : "#323232",
    duration       : "long",        // "short" | "long" | "indefinite" (otro valor => excepción)
    width          : "80%",         // "100%" => ancho completo
    textColor      : "#FFFFFF",
    actionText     : "Deshacer",    // solo se muestra si TAMBIÉN hay actionMethod
    actionTextColor: "#FFEB3B",
    maxLines       : 1,             // solo aplica si > 1
    align          : "center|bottom",
    height         : "10%",         // Altura del snackbar (opcional)
    actionMethod   : function() {   // se ejecuta en un hilo aparte, no en el de UI
        deshacerEliminacion();
    }
});

// Ocultar snackbar manualmente (oculta el último mostrado; false si no hay ninguno visible)
ui.hideSnackbar();

// NOTA: showSnackbar solo funciona dentro de una pantalla de edición.
// En otros contextos lanza una excepción.

// === msgBox con DataObject (dialogo completamente personalizado) ===

// Variante SINCRONA: bloquea hasta que el usuario pulsa
// La coll debe tener botones con button-option="N"
// ui.msgBox() devuelve el valor del button-option del botón pulsado
let msgBoxObj  = new MessageBoxNormal();
let nResult    = ui.msgBox(msgBoxObj);
// nResult == 1 -> pulsó Cancel (button-option="1")
// nResult == 2 -> pulsó OK     (button-option="2")

// Variante ASINCRONA con callbacks (no bloquea)
// La coll debe tener: hardware-accelerated="false", bgcolor="#00000000"
// y campos type="O" para los callbacks
function showMsgBoxAsync(callbackOk, callbackCancel) {
    let obj = new MessageBoxAsync({ MAP_CALLBACK_OK: callbackOk, MAP_CALLBACK_CANCEL: callbackCancel });
    ui.openEditView(obj);
}

// Uso:
showMsgBoxAsync(
    function() { ui.showToast("OK pulsado");     ui.getView(self).exit(); },
    function() { ui.showToast("Cancel pulsado"); ui.getView(self).exit(); }
);

// === Wait Dialog (indicador de carga) ===
ui.showWaitDialog("Cargando datos...");
ui.setWaitDialogText("Procesando registros...");
ui.hideWaitDialog();

// === Notificaciones ===
// Notificación simple
ui.showNotification(1, "Titulo", "Texto de la notificación");

// Notificación con ticker
ui.showNotification(2, "Titulo", "Texto", "Texto en barra de estado");

// Notificación con callback al pulsar
ui.showNotification(3, "Titulo", "Texto", "Ticker", self, "miNodoCallback");

// Notificación avanzada con botones
ui.showNotification({
    id             : 5000,
    title          : "Nueva tarea asignada",
    text           : "Tiene una nueva tarea pendiente",
    textHtml       : "<b>Tarea urgente</b>: Revision de inventario",
    icon           : "app_icon1",       // app_icon1 a app_icon10
    largeIcon      : "app_icon4",
    backgroundColor: "#1976D2",
    sound          : "notification.wav",
    cancelable     : true,
    dataObject     : self,
    nodeName       : "callbackNotificacion",
    parameters     : '{ "tareaId": "123" }',
    buttons        : [{
        id              : 5001,
        title           : "Responder",
        directReply     : true,
        directReplyLabel: "Escriba su respuesta...",
        dataObject      : self,
        nodeName        : "respuestaCallback"
    }]
});

// LED de notificación (solo Android)
ui.setNotificationLed("#00FF00", 1000, 1000);  // color, onMs, offMs
```

#### msgBox con DataObject (Dialogos Personalizados)

`ui.msgBox(dataObject)` permite abrir una coleccion XOne como dialogo completamente personalizado.

**Variante sincrona** — Los botones usan `button-option`. `ui.msgBox()` bloquea hasta que el usuario pulsa y devuelve el valor del `button-option` pulsado:

```javascript
let msgBoxObj  = new MessageBoxNormal();
let nResult    = ui.msgBox(msgBoxObj);
// nResult == 1 -> pulsó Cancel (button-option="1")
// nResult == 2 -> pulsó OK     (button-option="2")
```

La coll `MessageBoxNormal` requiere: `notab="true"`, `show-toolbar="false"`, `check-owner="false"`, `dependent="false"`, y botones con `button-option="N"`.

**Variante asíncrona con callbacks** — Los botones invocan `self.MAP_CALLBACK_OK()`. Usa campos `type="O"` para las funciones callback:

```javascript
function showMessageBoxDataObject(callbackOk, callbackCancel) {
    let newMsgBox = new MessageBoxAsync({ MAP_CALLBACK_OK: callbackOk, MAP_CALLBACK_CANCEL: callbackCancel });
    ui.openEditView(newMsgBox);
}

// Uso
showMessageBoxDataObject(
    function() { ui.showToast("OK pulsado");     ui.getView(self).exit(); },
    function() { ui.showToast("Cancel pulsado"); ui.getView(self).exit(); }
);
```

La coll `MessageBoxAsync` requiere además: `hardware-accelerated="false"` y `bgcolor="#00000000"` para fondo transparente sin fondo negro.

### 3.3 Vista - Refrescar y Acceder a Controles

```javascript
// === Obtener la ventana actual ===
let window = ui.getView(self);
let window = ui.getView();    // Sin parametro = ventana activa actual

// === Acceder a un control por nombre ===
let control = window["MAP_BOTON"];

// === getControl(name, [dataObject]) - función NATIVA global (recomendado) ===
// Disponible directamente, NO hace falta declarar el helper. Devuelve el control
// resuelto en la ventana destino:
//   - getControl(name)             → última ventana visible.
//   - getControl(name, dataObject) → ventana asociada a ese DataObject.
//
// Semántica ESTRICTA: lanza error si el nombre está vacío, el control no
// existe, no hay ventana destino, o el dataObject no es válido.
//
// Si un proyecto ya tiene "function getControl(...)" propia, esa sombrea a la
// nativa en su scope local (compatibilidad hacia atrás preservada).
let control = getControl("MAP_BOTON");
let controlEnOtraVentana = getControl("MAP_TITULO", objPadre);

// === Refrescar campos de la interfaz ===
ui.refresh();                           // Refrescar TODO (costoso, evitar)
ui.refresh("MAP_NOMBRE");              // Refrescar un campo específico
ui.refresh("MAP_NOMBRE,MAP_ESTADO");   // Refrescar multiples campos

// Solo actualizar el valor (sin reconstruir la vista del control)
ui.refreshValue("MAP_CAMPO");
// Multiples campos (cada uno como argumento)
let ventana = ui.getView(self);
ventana.refreshValue("MAP_CAMPO1", "MAP_CAMPO2", "MAP_CAMPO3");

// Refrescar una fila específica de un content
ui.refreshContentRow("MAP_CONTENT", 0);

// Refrescar la fila seleccionada de un content
ui.refreshContentSelectedRow("MAP_CONTENT");

// Refrescar usando la ventana directamente
window.refresh("MAP_CAMPO");
window.refreshAll("frmMiFrame");       // Refresca el frame y todos sus hijos

// === Grupos (tabs) y Drawers ===
// Mostrar un grupo por indice
ui.showGroup(2);
ui.showGroup(2, "##ALPHA_IN##", 300, "##ALPHA_OUT##", 300);  // Con animacion

// Comprobar si un grupo esta abierto (util para drawers)
if (window.isGroupOpen(999)) {
    window.hideGroup(999);  // Cerrar el drawer
}

// Patron: botón atrás cierra drawer antes de salir
function doOnBack() {
    let window = ui.getView();
    if (!window) return;
    if (window.isGroupOpen(999)) {
        window.hideGroup(999);
        return;
    }
    window.exit();
}

// === Nombre de la coleccion activa ===
function getCurrentCollectionName() {
    let window = ui.getView();
    if (!window) return "";
    let dataObject = window.getDataObject();
    if (!dataObject) return "";
    let coll = dataObject.getOwnerCollection();
    if (!coll) return "";
    return coll.getName();
}

// === Traer app al primer plano (desde handler de notificación) ===
ui.returnToForeground();

// === Scroll de Frames ===
let frame = window["frmScroll"];
frame.scrollToTop(true);     // true = animado
frame.scrollToBottom(true);

// === Bottom Sheet ===
// sFrame: nombre del frame con behavior="bottom-sheet"
// sState: "expanded" / "collapsed" / "hidden"
// bLockDrag: true = impedir que el usuario lo arrastre
window.setBottomSheetState("mi_panel", "expanded", false);
window.setBottomSheetState("mi_panel", "collapsed", true);  // Bloqueado
let sEstado = window.getBottomSheetState("mi_panel");

// === Progress Bar JS ===
let control = window["MAP_PROGRESS_BAR"];
control.setIndeterminate(true);    // Activar animacion continua
control.setIndeterminate(false);   // Desactivar, mostrar valor actual
control.toggleIndeterminate();     // Alternar estado
let bIndet = control.isIndeterminate();

// === Efectos visuales en frame: setBlur / setSaturation ===
// NO son API de XOne: los expone la vista nativa de Android/iOS que hay por debajo.
// Se llaman sobre el frame o el control, nunca sobre ui, y no hay ui.setBlur.
// Documentados en metodos-nativos-de-la-vista.md, con el envoltorio y el patron de slider.

// === Color de la barra de estado ===
window.setStatusBarColor("#1565C0");  // Color RRGGBB
window.setStatusBarColor(null);       // Restaurar color por defecto

// === Showcase (tutorial interactivo) ===
window.startShowcase({
    continueOnCancel: true,     // Si cancela un paso, ir al siguiente
    tapTargets: [{
        target              : "MAP_CAMPO1",
        title               : "Paso 1",
        description         : "Descripción del primer paso",
        cancelable          : true,
        transparentTarget   : true,
        targetRadius        : 90,
        outerCircleOpacity  : 96,
        outerCircleColor    : "#1565C0",
        targetCircleColor   : "#FF0000",
        dimColor            : "#CC000000",
        titleTextSize       : 20,
        descriptionTextSize : 15,
        textColor           : "#FFFFFF",
        titleTextColor      : "#FFFF00",
        descriptionTextColor: "#FFFFFF",
        textFont            : "MiFuente.ttf",
        drawShadow          : true
    }, {
        target     : "MAP_CAMPO2",
        title      : "Paso 2",
        description: "Segundo paso del tutorial",
        cancelable : true
    }]
});
```

### 3.4 Date/Time Pickers

```javascript
// Date Picker con callback
ui.showDatePicker({
    initialYear : 2024,
    initialMonth: 6,
    initialDay  : 15,
    title       : "Seleccione fecha",
    theme       : "holo_light",           // Tema visual del picker
    onDateSet   : function(nYear, nMonth, nDay) {
        self.MAP_FECHA = nDay + "/" + nMonth + "/" + nYear;
        ui.refresh("MAP_FECHA");
    }
});

// Date Picker que escribe directamente en un campo (sin callback)
ui.showDatePicker({
    targetProperty: "MAP_FECHA"           // El picker escribe aquí al confirmar
});

// Time Picker con callback
ui.showTimePicker({
    initialHour  : 17,
    initialMinute: 30,
    is24HoursMode: true,
    title        : "Seleccione hora",
    theme        : "holo_light",
    onTimeSet    : function(nHours, nMinutes) {
        let h = ("0" + nHours).slice(-2);
        let m = ("0" + nMinutes).slice(-2);
        self.MAP_HORA = h + ":" + m;
        ui.refresh("MAP_HORA");
    }
});

// Time Picker que escribe directamente en un campo
ui.showTimePicker({
    targetProperty: "MAP_HORA"
});
```

