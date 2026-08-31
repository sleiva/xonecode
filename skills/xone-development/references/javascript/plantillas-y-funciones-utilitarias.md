# XOne JavaScript — Plantillas de código y funciones utilitarias

> Fuente: `xone/v2/xone-help-docs/topics/03e-js-patrones-buenas-practicas.md` §12–§13. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §12 plantillas completas: CRUD, filtrado, maestro-detalle, GPS, fotos, chat, QR, login personalizado · §13 funciones utilitarias recomendadas para functions.js

---

## 12. Patrones Comunes con Ejemplos

### 12.1 CRUD Completo

```javascript
// === CREAR ===
function crearProducto() {
    if (!validarRequerido(self.MAP_NOMBRE, "Nombre")) return;
    if (!validarRequerido(self.MAP_PRECIO, "Precio")) return;

    let coll = appData.getCollection("Productos");
    coll.unlock();
    try {
        let obj = new Productos({
            MAP_NOMBRE: cstr(self.MAP_NOMBRE),
            MAP_PRECIO: cnum(self.MAP_PRECIO),
            MAP_ACTIVO: 1,
            MAP_FECHA_ALTA: new Date()
        });
        coll.addItem(obj);
        obj.save();
        ui.showToast("Producto creado");
        cerrarPantalla();
    } catch(ex) {
        ui.showToast("Error: " + ex);
    } finally {
        coll.lock();
    }
}

// === LEER ===
function buscarProducto(codigo) {
    let coll = appData.getCollection("Productos");
    let escapado = cstr(codigo).replace(/'/g, "''");
    return coll.findObject("MAP_CODIGO = '" + escapado + "'");
}

function listarProductosActivos() {
    let coll = appData.getCollection("Productos");
    coll.setFilter("MAP_ACTIVO = 1");
    coll.clear();
    coll.loadAll();
    coll.doSort("MAP_NOMBRE ASC");

    let items = [];
    for (let i = 0; i < coll.getCount(); i++) {
        items.push(coll.get(i));
    }
    return items;
}

// === ACTUALIZAR ===
function actualizarProducto(producto) {
    if (!producto) return;
    producto.MAP_FECHA_MOD = new Date();
    producto.save();
    ui.showToast("Producto actualizado");
}

// === ELIMINAR ===
function eliminarProducto(producto) {
    if (!producto) return;
    if (!confirmar("Eliminar " + producto.MAP_NOMBRE + "?", "Eliminar")) return;

    let coll = appData.getCollection("Productos");
    for (let i = 0; i < coll.getCount(); i++) {
        if (coll.get(i).ID == producto.ID) {
            coll.deleteItem(i);
            break;
        }
    }
    ui.showToast("Producto eliminado");
}
```

### 12.2 Filtrado Dinámico

```javascript
function buscarProductos(criterio, precioMin, precioMax, activo) {
    let filtros = [];

    if (!isEmpty(criterio)) {
        let escapado = cstr(criterio).replace(/'/g, "''");
        filtros.push("MAP_NOMBRE LIKE '%" + escapado + "%'");
    }
    if (!isEmpty(precioMin)) filtros.push("MAP_PRECIO >= " + cnum(precioMin));
    if (!isEmpty(precioMax)) filtros.push("MAP_PRECIO <= " + cnum(precioMax));
    if (!isEmpty(activo))   filtros.push("MAP_ACTIVO = " + cnum(activo));

    let coll = appData.getCollection("Productos");
    coll.setFilter(filtros.length > 0 ? filtros.join(" AND ") : "");
    coll.clear();
    coll.loadAll();
    coll.doSort("MAP_NOMBRE ASC");
    ui.refresh("MAP_LISTA_PRODUCTOS");
}
```

### 12.3 Navegación Maestro-Detalle

```javascript
function onItemSeleccionado() {
    let collDetalle = appData.getCollection("DetalleProducto");
    let obj = new DetalleProducto({
        MAP_NOMBRE: self.MAP_NOMBRE,
        MAP_PRECIO: self.MAP_PRECIO,
        MAP_ID_PRODUCTO: self.ID
    });
    collDetalle.addItem(obj);

    ui.openEditView(obj);
}

function cargarDetalle() {
    let idProducto = self.MAP_ID_PRODUCTO;
    if (isEmpty(idProducto)) return;

    let coll = appData.getCollection("Productos");
    let producto = coll.findObject("ID = " + idProducto);
    if (producto) {
        let lineas = producto.getContents("@LineasProducto");
        lineas.unlock();
        lineas.clear();
        lineas.loadAll();
        lineas.lock();
    }
}
```

### 12.4 Manejo de GPS en Tiempo Real

```javascript
var rastreoActivo = false;

function iniciarRastreo() {
    let estadoGPS = ui.checkGpsStatus();
    if (estadoGPS == 0 || estadoGPS == 3) {
        ui.askUserForGpsPermission({
            onEnabled: function() { activarGPS(); },
            onDenied : function() { ui.showToast("Se necesita GPS"); }
        });
    } else {
        activarGPS();
    }
}

function activarGPS() {
    ui.startGps({
        nodeName                  : "onPosicionActualizada",
        timeBetweenUpdates        : 5000,
        minimumMetersDistanceRange: 10,
        foreground                : true,
        title                     : "Rastreo GPS",
        text                      : "Registrando ubicación..."
    });
    rastreoActivo = true;
    ui.showToast("Rastreo GPS iniciado");
}

function detenerRastreo() {
    ui.stopGps();
    rastreoActivo = false;
    ui.showToast("Rastreo GPS detenido");
}

// Callback GPS (nodo "onPosicionActualizada" en XML)
function onPosicionRecibida() {
    let collGps = appData.getCollection("GPSColl");
    collGps.startBrowse();
    try {
        let gps = collGps.getCurrentItem();
        if (!gps || gps.STATUS != 1) return;

        self.MAP_LATITUD = gps.LATITUD;
        self.MAP_LONGITUD = gps.LONGITUD;
        self.MAP_VELOCIDAD = gps.VELOCIDAD;
        ui.refresh("MAP_LATITUD,MAP_LONGITUD,MAP_VELOCIDAD");

        guardarPosicion(gps.LATITUD, gps.LONGITUD, gps.PRECISION);

        let mapControl = getControl("MAP_MAPA");
        if (mapControl) {
            mapControl.zoomTo(gps.LATITUD, gps.LONGITUD, 15);
        }
    } finally {
        collGps.endBrowse();
    }
}

function guardarPosicion(lat, lng, precision) {
    let coll = appData.getCollection("Posiciones");
    coll.unlock();
    try {
        let obj = new Posiciones({
            MAP_LATITUD: lat,
            MAP_LONGITUD: lng,
            MAP_PRECISION: precision,
            MAP_TIMESTAMP: new Date()
        });
        coll.addItem(obj);
        obj.save();
    } finally {
        coll.lock();
    }
}
```

### 12.5 Tomar y Mostrar Fotos

```javascript
// Foto con prop tipo PH (se activa automaticamente al pulsar)
// En <onchange> de MAP_FOTO:
function onFotoCapturada() {
    let foto = self.MAP_FOTO;
    if (isEmpty(foto)) {
        ui.showToast("Captura cancelada");
        return;
    }
    self.MAP_FECHA_FOTO = new Date();
    self.save();
    ui.showToast("Foto capturada");
    ui.refresh("MAP_FOTO");
}

// Foto con camara tipo VD (control manual)
function tomarFotoConCamara() {
    let control = getControl("MAP_CAMERA");
    if (!control) return;

    control.takePicture({
        filename     : "foto_" + Date.now() + ".jpg",
        saveToGallery: false,
        width        : 640,
        height       : 480,
        onFinished   : function(sFileName) {
            if (sFileName) {
                self.MAP_FOTO = sFileName;
                self.save();
                ui.refresh("MAP_FOTO");
                ui.showToast("Foto guardada");
            }
        }
    });
}
```

### 12.6 Sistema de Chat

```javascript
// Inicializar chat
function inicializarChat() {
    self.MAP_GRUPOSEL = 1;
    self.MAP_VERFLOTANTE = 0;
    self.MAP_RECORDON = 0;
    self.MAP_USERLOGIN = appData.getGlobalMacro("##USERNAME##");
    self.getContents("Chat").setMacro("##MACRO##", self.MAP_USERLOGIN);
}

// Crear un chat entre dos usuarios
function createChat(userFrom, userTo) {
    let coll = self.getContents("Chat");
    coll.unlock();
    let obj = coll.findObject(
        "(USUARIO='" + userFrom + "' AND USUARIO2='" + userTo + "') OR " +
        "(USUARIO='" + userTo + "' AND USUARIO2='" + userFrom + "')"
    );
    if (obj == null) {
        obj = coll.createObject();
        obj.USUARIO = userFrom;
        obj.USUARIO2 = userTo;
        obj.FECHA = new Date();
        obj.save();
    }
    let index = obj.getObjectIndex();
    coll.lock();
    return index;
}

// Enviar mensaje
function sendMessage(colMensajes, obj, titleField, isFromUser) {
    if (obj[titleField].length == 0) return;

    let msg = new MensajesReader();

    if (isFromUser) {
        msg.USUARIOTO = self.MAP_CCUSUARIO;
        msg.USUARIOFROM = appData.getGlobalMacro("##USERNAME##");
    } else {
        msg.USUARIOTO = appData.getGlobalMacro("##USERNAME##");
        msg.USUARIOFROM = self.MAP_CCUSUARIO;
    }

    msg.FECHA = new Date();
    msg.MENSAJE = self[titleField];
    msg.TIPO = self.MAP_TIPO;
    msg.IDCHAT = self.MAP_IDCHATSEL;
    msg.save();

    self[titleField] = "";
    ui.refresh("MensajesUsuarios," + titleField);
}
```

### 12.7 Escaneo QR/Barcode

```javascript
function iniciarEscaneoQR() {
    let control = getControl("MAP_CAMERA");
    if (!control) {
        ui.showToast("Control de camara no encontrado");
        return;
    }

    control.setOnCodeScanned(function(evento) {
        self.MAP_CODIGO_ESCANEADO = evento.data;
        self.MAP_TIPO_CODIGO = evento.type;
        ui.refresh("MAP_CODIGO_ESCANEADO,MAP_TIPO_CODIGO");

        let nResult = ui.msgBox(
            "Código: " + evento.data + "\nTipo: " + evento.type,
            "Lectura correcta?", 4
        );
        return (nResult == 6);
    });
}
```

### 12.8 Descarga de Archivos del Servidor

```javascript
function descargarDocumento(url, nombre) {
    ui.showWaitDialog("Descargando " + nombre + "...");

    let miObjeto = self;
    let request = {
        headers: { "Authorization": "Bearer " + obtenerToken() },
        parameters: { connectTimeout: 30000, readTimeout: 60000 }
    };

    $http.download(url, request,
        function(sPath, headers, nStatus) {
            ui.hideWaitDialog();
            miObjeto.MAP_ARCHIVO = sPath;
            miObjeto.save();
            ui.refresh("MAP_ARCHIVO");

            let nResult = ui.msgBox("Abrir archivo?", "Descarga completa", 4);
            if (nResult == 6) {
                ui.openFile(sPath);
            }
        },
        function(nError, sMessage) {
            ui.hideWaitDialog();
            ui.showToast("Error: " + sMessage);
        }
    );
}
```

### 12.9 Sincronización con Servidor

```javascript
function sincronizarPendientes(nombreColl, endpoint) {
    let coll = appData.getCollection(nombreColl);
    coll.setFilter("MAP_SINCRONIZADO = 0");
    coll.clear();
    coll.loadAll();

    let count = coll.getCount();
    if (count == 0) {
        ui.showToast("No hay registros pendientes");
        return;
    }

    ui.showWaitDialog("Sincronizando " + count + " registros...");

    let pendientes = [];
    for (let i = 0; i < count; i++) {
        pendientes.push(coll.get(i).toJson());
    }

    let miColl = coll;
    let request = {
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + obtenerToken()
        },
        parameters: { connectTimeout: 30000, readTimeout: 120000 },
        data: { registros: pendientes }
    };

    $http.post(endpoint, request,
        function(sData) {
            for (let i = 0; i < miColl.getCount(); i++) {
                let obj = miColl.get(i);
                obj.MAP_SINCRONIZADO = 1;
                obj.MAP_FECHA_SYNC = new Date();
                obj.save();
            }
            ui.hideWaitDialog();
            ui.showToast(count + " registros sincronizados");
        },
        function(nError, sDesc) {
            ui.hideWaitDialog();
            ui.showToast("Error sync: " + sDesc);
        }
    );
}
```

### 12.10 Login Personalizado

```javascript
function doLogin() {
    let usuario = cstr(self.MAP_LOGIN).trim();
    let password = cstr(self.MAP_PASSWORD).trim();

    // Solo validamos el usuario: en XOne puede haber cuentas sin contraseña
    // (invitado, kiosco) y, si la contraseña es incorrecta o falta cuando hace
    // falta, el backend la rechaza vía onLoginFailed (no la validamos en cliente).
    if (isEmpty(usuario)) { ui.showToast("Introduzca el usuario"); return; }

    appData.login({
        userName          : usuario,
        password          : password,
        entryPoint        : "MenuPrincipal",
        onLoginSuccessful : function() {
            appData.setGlobalMacro("##USERNAME##", usuario);
            ui.showToast("Bienvenido, " + usuario);
        },
        onLoginFailed     : function() {
            ui.showToast("Usuario o contraseña incorrectos");
            self.MAP_PASSWORD = "";
            ui.refresh("MAP_PASSWORD");
        }
    });
}

function doLogout() {
    if (confirmar("Cerrar sesion?", "Confirmar")) {
        appData.setGlobalMacro("##USERNAME##", "");
        appData.setGlobalMacro("##SESSION_TOKEN##", "");
        appData.logout();
    }
}
```

---

## 13. Funciones Utilitarias Recomendadas

Coleccion de funciones helper que todo proyecto XOne deberia incluir en `functions.js`.

```javascript
/**
 * Funciones Utilitarias para XOne
 * Incluir en functions.js de todo proyecto
 */

// ============================================
// CONVERSIONES Y VERIFICACIONES
// ============================================

function isEmpty(val) {
    return val === undefined || val === null || val === "";
}

function cstr(val) {
    if (val === undefined || val === null) return "";
    return val.toString();
}

function cnum(val) {
    if (val === undefined || val === null || val === "") return 0;
    let num = parseFloat(val);
    return isNaN(num) ? 0 : num;
}

function isNothing(obj) {
    return obj === null || obj === undefined || obj == "undefined";
}

// ============================================
// ACCESO A CONTROLES
// ============================================

// getControl(name, [dataObject]) es NATIVA del motor — NO declararla aquí.
// Si un proyecto ya tiene su propio "function getControl(...)" como helper
// legacy, lo respetamos: la declaración del script sombrea a la nativa en
// su scope local sin tocar la del global.

// ============================================
// NAVEGACION
// ============================================

function mostrarGrupo(nGroup, sAnimIn, sAnimOut) {
    sAnimIn = sAnimIn || "##ALPHA_IN##";
    sAnimOut = sAnimOut || "##ALPHA_OUT##";
    ui.showGroup(nGroup, sAnimIn, 200, sAnimOut, 200);
}

function cerrarPantalla() {
    let window = ui.getView(self);
    if (window) window.exit();
}

// ============================================
// MENSAJES Y DIALOGOS
// ============================================

function confirmar(mensaje, titulo) {
    titulo = titulo || "Confirmar";
    let nResult = ui.msgBox(mensaje, titulo, 4);
    return nResult == 6;
}

function mostrarToast(mensaje) {
    ui.showToast(mensaje);
}

function mostrarToastExito(mensaje) {
    ui.showToast({
        text: mensaje, color: "#4CAF50",
        textColor: "#FFFFFF", duration: "short"
    });
}

function mostrarToastError(mensaje) {
    ui.showToast({
        text: mensaje, color: "#F44336",
        textColor: "#FFFFFF", duration: "long"
    });
}

function mostrarCargando(mensaje) {
    ui.showWaitDialog(mensaje || "Cargando...");
}

function ocultarCargando() {
    ui.hideWaitDialog();
}

// ============================================
// COLECCIONES Y DATOS
// ============================================

function obtenerColeccion(nombreColl) {
    return appData.getCollection(nombreColl);
}

function crearObjeto(nombreColl) {
    let coll = appData.getCollection(nombreColl);
    let obj = coll.createObject();
    coll.addItem(obj);
    return obj;
}

function buscarObjeto(nombreColl, campo, valor) {
    let escapado = cstr(valor).replace(/'/g, "''");
    let coll = appData.getCollection(nombreColl);
    return coll.findObject(campo + "='" + escapado + "'");
}

// ============================================
// VALIDACIONES
// ============================================

function validarRequerido(valor, nombreCampo) {
    if (isEmpty(valor)) {
        mostrarToastError("El campo " + nombreCampo + " es obligatorio");
        return false;
    }
    return true;
}

function validarEmail(email) {
    if (isEmpty(email)) return false;
    return email.indexOf("@") > 0 && email.indexOf(".") > 0;
}

function sanearEntrada(valor, maxLength) {
    if (isEmpty(valor)) return "";
    let sValor = cstr(valor).trim();
    if (maxLength && sValor.length > maxLength) {
        sValor = sValor.substring(0, maxLength);
    }
    return sValor;
}

// ============================================
// FECHAS Y TIEMPO
// ============================================

function obtenerFechaActual() {
    let f = new Date();
    return ("0" + f.getDate()).slice(-2) + "/" +
           ("0" + (f.getMonth() + 1)).slice(-2) + "/" +
           f.getFullYear();
}

function obtenerHoraActual() {
    let f = new Date();
    return ("0" + f.getHours()).slice(-2) + ":" +
           ("0" + f.getMinutes()).slice(-2);
}

function obtenerAhora() {
    return new Date();
}

// ============================================
// CONVERSION BINARIA (NFC, Bluetooth, etc.)
// ============================================

function toUint8Array(str) {
    let arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
    return arr;
}

function toStringFromUint8Array(arr) {
    let str = "";
    for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
    return str;
}

// ============================================
// GUID
// ============================================

function generarGUID() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
```

