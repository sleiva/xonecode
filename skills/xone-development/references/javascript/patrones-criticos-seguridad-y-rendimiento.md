# XOne JavaScript — Patrones críticos, seguridad y rendimiento

> Fuente: `xone/v2/xone-help-docs/topics/03e-js-patrones-buenas-practicas.md` §9–§11. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §9 patrones críticos (lock/unlock, startBrowse/endBrowse, filter/restore, preservación de contexto en callbacks asíncronos) · §10 seguridad (prevención de SQL injection, validación de entrada, encriptación, manejo de credenciales) · §11 optimización y rendimiento

---

## 9. Patrones Críticos de Código

Patrones fundamentales que todo desarrollador XOne debe dominar. El uso incorrecto de estos patrones es la causa principal de errores y memory leaks.

### 9.1 Patron lock/unlock (Modificación de Colecciones)

**Siempre** usar `finally` para garantizar que se ejecute `lock()`, incluso si hay error:

```javascript
function agregarRegistro(nombreColl, datos) {
    var coll = appData.getCollection(nombreColl);
    coll.unlock();
    try {
        var obj = coll.createObject();
        for (var key in datos) {
            if (datos.hasOwnProperty(key)) {
                obj[key] = datos[key];
            }
        }
        coll.addItem(obj);
        obj.save();
        return true;
    } catch(error) {
        ui.showToast("Error: " + error);
        return false;
    } finally {
        coll.lock();  // SIEMPRE se ejecuta
    }
}
```

### 9.2 Patron startBrowse/endBrowse (Navegación de Colecciones)

**Siempre** usar `finally` para garantizar que se ejecute `endBrowse()`:

```javascript
function procesarColeccion(nombreColl) {
    var coll = appData.getCollection(nombreColl);
    coll.startBrowse();
    try {
        coll.moveFirst();
        while (coll.getCurrentItem() != null) {
            var obj = coll.getCurrentItem();
            console.log(obj.MAP_NOMBRE);
            coll.moveNext();
        }
    } finally {
        coll.endBrowse();  // SIEMPRE se ejecuta
    }
}
```

### 9.3 Patron filter/restore (Filtrado Seguro)

**Siempre** guardar el filtro original y restaurarlo después de usar, idealmente en `finally`:

```javascript
function procesarRegistrosActivos(nombreColl) {
    var coll = appData.getCollection(nombreColl);
    var filtroOriginal = coll.getFilter();

    try {
        coll.setFilter("ACTIVO = 1 AND ESTADO = 'PENDIENTE'");
        coll.loadAll();

        var count = coll.count();
        for (var i = 0; i < count; i++) {
            var obj = coll.get(i);
            // Procesar...
        }

        coll.clear();
    } finally {
        coll.setFilter(filtroOriginal);  // Restaurar SIEMPRE
    }
}
```

### 9.4 Patron de Preservacion de Contexto en Callbacks Asíncronos

En callbacks asíncronos de `$http`, `executeActionAfterDelay` y otros, el objeto `self` **puede cambiar de contexto**. Se debe guardar la referencia **antes** de la llamada:

```javascript
function cargarDatosServidor(url) {
    var contexto = self;  // GUARDAR referencia antes del callback

    $http.get(url,
        function(sData) {
            // INCORRECTO: self.MAP_DATO = sData;
            contexto.MAP_DATO = sData;
            ui.refresh("MAP_DATO");
        },
        function(nError, sDesc) {
            ui.showToast("Error: " + sDesc);
        }
    );
}
```

### 9.5 Patron WaitDialog Seguro

**Siempre** ocultar el WaitDialog en un bloque `finally`:

```javascript
function operacionLarga() {
    ui.showWaitDialog("Procesando...");
    try {
        var coll = appData.getCollection("Datos");
        coll.loadAll();
        // ...procesar...
    } catch(ex) {
        ui.showToast("Error: " + ex);
    } finally {
        ui.hideWaitDialog();
    }
}
```

### 9.6 Patron Cursor SQL Seguro

**Siempre** cerrar el cursor y la conexión en bloques `finally`:

```javascript
function consultarDatos(query, parametros) {
    var sqlManager = new SqlManager();
    try {
        sqlManager.openDatabase({
            databasePath: "gestion.db",
            useExistingConnection: true
        });

        var cursor = sqlManager.doRawQuery(query, parametros);
        try {
            if (cursor.getCount() > 0) {
                cursor.moveToFirst();
                return {
                    id: cursor.getInteger("ID"),
                    nombre: cursor.getString("NOMBRE")
                };
            }
            return null;
        } finally {
            cursor.close();
        }
    } finally {
        sqlManager.close();
    }
}
```

---

## 10. Seguridad en JavaScript XOne

### 10.1 Prevencion de SQL Injection

**Código VULNERABLE (NUNCA hacer esto):**

```javascript
// PELIGROSO: concatenacion directa de input del usuario
function buscarUsuario(loginUsuario) {
    let coll = appData.getCollection("Usuarios");
    // Si loginUsuario = "' OR 1=1 --" obtendria todos los registros
    let usuario = coll.findObject("LOGIN = '" + loginUsuario + "'");
    return usuario;
}

// PELIGROSO: SQL directo sin parametrizar
function eliminarRegistro(id) {
    appData.executeSql("DELETE FROM gen_productos WHERE ID = " + id);
}
```

**Código SEGURO (hacer SIEMPRE esto):**

```javascript
// SEGURO: SqlManager con parametros (consultas parametrizadas)
function buscarUsuarioSeguro(loginUsuario) {
    let sqlManager = new SqlManager();
    try {
        sqlManager.openDatabase({
            databasePath: "gestion.db",
            useExistingConnection: true
        });

        let cursor = sqlManager.doRawQuery(
            "SELECT * FROM gen_usuarios WHERE LOGIN=?",
            loginUsuario  // El parametro se escapa automaticamente
        );
        try {
            if (cursor.getCount() > 0) {
                cursor.moveToFirst();
                return {
                    id    : cursor.getInteger("ID"),
                    nombre: cursor.getString("NOMBRE"),
                    login : cursor.getString("LOGIN")
                };
            }
            return null;
        } finally {
            cursor.close();
        }
    } finally {
        sqlManager.close();
    }
}

// SEGURO: Escapar comillas simples para findObject
function buscarObjetoSeguro(nombreColl, campo, valor) {
    let valorEscapado = cstr(valor).replace(/'/g, "''");
    let coll = appData.getCollection(nombreColl);
    return coll.findObject(campo + "='" + valorEscapado + "'");
}

// SEGURO: Validar que sea numerico antes de concatenar
function eliminarRegistroSeguro(id) {
    let nId = parseInt(id);
    if (isNaN(nId) || nId <= 0) {
        ui.showToast("ID no valido");
        return;
    }
    appData.executeSql("DELETE FROM gen_productos WHERE ID = " + nId);
}
```

### 10.2 Validación de Entrada

```javascript
// === Funciones de validación esenciales ===

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

// === Sanitizacion ===
function sanearEntrada(valor, maxLength) {
    if (isEmpty(valor)) return "";
    let sValor = cstr(valor).trim();
    if (maxLength && sValor.length > maxLength) {
        sValor = sValor.substring(0, maxLength);
    }
    return sValor;
}

function validarEmail(email) {
    if (isEmpty(email)) return false;
    return email.indexOf("@") > 0 && email.indexOf(".") > 0;
}

function validarTelefono(telefono) {
    if (isEmpty(telefono)) return false;
    let limpio = telefono.replace(/[^\d+]/g, '');
    return limpio.length >= 9;
}

function validarRango(valor, min, max) {
    let num = cnum(valor);
    return num >= min && num <= max;
}

// === Patron completo antes de guardar ===
function validarFormulario() {
    if (isEmpty(self.MAP_NOMBRE)) {
        ui.showToast("El nombre es obligatorio");
        return false;
    }
    if (cstr(self.MAP_NOMBRE).length > 100) {
        ui.showToast("El nombre no puede superar 100 caracteres");
        return false;
    }
    if (cnum(self.MAP_CANTIDAD) <= 0) {
        ui.showToast("La cantidad debe ser mayor a 0");
        return false;
    }
    if (!validarEmail(self.MAP_EMAIL)) {
        ui.showToast("Email no valido");
        return false;
    }
    return true;
}
```

### 10.3 Encriptación de Datos Sensibles

```javascript
// === Encriptacion básica del framework ===
let encrypted = appData.encryptString("dato sensible");
let decrypted = appData.decryptString(encrypted);

// === API Crypto avanzada ===

// Hashing (unidireccional, para passwords)
function hashPassword(password) {
    return crypto.sha256({
        data        : password,
        outputFormat: "hex"
    });
}

// Cifrado simetrico AES
function cifrarDato(texto) {
    let aesKey = crypto.generateAesKey({
        alias           : "app_datos_key",
        keySize         : 256,
        useSecureHardware: true,
        useStrongBox    : true
    });

    return crypto.encrypt({
        data        : texto,
        dataFormat  : "string",
        algorithm   : "AES/GCM/NoPadding",
        key         : aesKey,
        outputFormat: "base64"
    });
}

function descifrarDato(textoCifrado) {
    let aesKey = crypto.generateAesKey({
        alias           : "app_datos_key",
        keySize         : 256,
        useSecureHardware: true
    });

    return crypto.decrypt({
        data        : textoCifrado,
        dataFormat  : "base64",
        algorithm   : "AES/GCM/NoPadding",
        key         : aesKey,
        outputFormat: "string"
    });
}

// Cifrar/descifrar archivos
crypto.encrypt({
    data: "documento.pdf", dataFormat: "file",
    algorithm: "AES/GCM/NoPadding", key: aesKey,
    outputFormat: "file", output: "documento.pdf.enc"
});

// Firma digital con clave pública/privada
let keyPair = crypto.generateKeyPair({
    alias: "firma_app", algorithm: "EC", keySize: 384,
    output: "key", outputFormat: "file", useSecureHardware: true
});

let signature = crypto.sign({
    data: "datos a firmar", algorithm: "SHA256withECDSA",
    privateKey: keyPair.getPrivateKey().toPem(), outputFormat: "base64"
});

// Encoding
let base64 = crypto.toBase64({ data: "texto", urlSafe: true });
let decoded = crypto.fromBase64({ data: base64 });

// Checksum
let crc32 = crypto.getChecksum({ type: "crc32", data: "texto" });
```

### 10.4 Manejo Seguro de Credenciales

```javascript
// INCORRECTO: hardcodear passwords / loguear datos sensibles
let password = "admin123";              // NUNCA
console.log("Password: " + password);   // NUNCA

// CORRECTO: macros globales encriptadas
function guardarTokenSesion(token) {
    let tokenCifrado = appData.encryptString(token);
    appData.setGlobalMacro("##SESSION_TOKEN##", tokenCifrado);
}

function obtenerTokenSesion() {
    let tokenCifrado = appData.getGlobalMacro("##SESSION_TOKEN##");
    if (isEmpty(tokenCifrado)) return null;
    return appData.decryptString(tokenCifrado);
}

// CORRECTO: limpiar credenciales al cerrar sesion
function cerrarSesion() {
    appData.setGlobalMacro("##SESSION_TOKEN##", "");
    appData.setGlobalMacro("##USERID##", "");
    appData.setGlobalMacro("##USERNAME##", "");
    appData.setGlobalMacro("##USERROLE##", "");
    appData.logout();
}

// CORRECTO: comunicaciones seguras
function crearRequestSeguro(token) {
    return {
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type" : "application/json"
        },
        parameters: {
            connectTimeout         : 30000,
            readTimeout            : 30000,
            allowUnsafeCertificates: false,  // NUNCA true en produccion
            enablePinning          : true
        }
    };
}
```

---

## 11. Optimización y Rendimiento

### 11.1 Minimizar Refreshes

```javascript
// INCORRECTO: multiples refresh individuales
self.MAP_NOMBRE = "Juan";
ui.refresh("MAP_NOMBRE");
self.MAP_ESTADO = "Activo";
ui.refresh("MAP_ESTADO");

// CORRECTO: un solo refresh con multiples campos
self.MAP_NOMBRE = "Juan";
self.MAP_ESTADO = "Activo";
ui.refresh("MAP_NOMBRE,MAP_ESTADO");

// Solo actualizar el valor sin reconstruir la vista
ui.refreshValue("MAP_CAMPO");
```

### 11.2 Gestion de Colecciones

```javascript
// Usar lock/unlock para evitar recargas innecesarias
function modificarContentEficiente(contentName, datos) {
    let content = self.getContents(contentName);
    content.unlock();
    try {
        let obj = content.createObject();
        for (let key in datos) obj[key] = datos[key];
        content.addItem(obj);
    } finally {
        content.lock();
    }
    content.saveAll();
    ui.refresh(contentName);
}

// findObject en lugar de loadAll cuando solo se busca uno
// INCORRECTO (carga TODOS los registros):
let coll = appData.getCollection("Productos");
coll.loadAll();
for (let i = 0; i < coll.getCount(); i++) {
    if (coll.get(i).CODIGO == "PROD001") { break; }
}

// CORRECTO (busca directamente en BD):
let coll = appData.getCollection("Productos");
let producto = coll.findObject("CODIGO = 'PROD001'");
```

### 11.3 Evitar Bucles Costosos

```javascript
// INCORRECTO: saveAll dentro de un bucle
for (let i = 0; i < items.length; i++) {
    let obj = coll.createObject();
    obj.MAP_NOMBRE = items[i].nombre;
    coll.addItem(obj);
    obj.save();  // Escribe en BD en cada iteracion
}

// CORRECTO: un solo saveAll al final
coll.unlock();
for (let i = 0; i < items.length; i++) {
    let obj = coll.createObject();
    obj.MAP_NOMBRE = items[i].nombre;
    coll.addItem(obj);
}
coll.lock();
coll.saveAll();

// CORRECTO: para inserciones masivas, usar batch SQL
let sqlManager = new SqlManager();
try {
    sqlManager.openDatabase({ databasePath: "gestion.db", useWal: true, useExistingConnection: true });
    let sqls = [];
    for (let i = 0; i < items.length; i++) {
        sqls.push("INSERT INTO gen_tabla (NOMBRE) VALUES ('" +
            items[i].nombre.replace(/'/g, "''") + "')");
    }
    sqlManager.doBatchParseSqls(sqls);
} finally {
    sqlManager.close();
}
```

### 11.4 Uso Eficiente de Contents

```javascript
// Filtrar para limitar la carga
let content = self.getContents("@Lineas");
content.setFilter("ACTIVO = 1");
content.unlock();
content.clear();
content.loadAll();
content.lock();

// Limitar registros para listas grandes
function cargarUltimosRegistros(nombreColl, limite) {
    limite = limite || 50;
    let coll = appData.getCollection(nombreColl);
    coll.clear();
    coll.loadAll();
    coll.doSort("FECHA DESC");

    let items = [];
    let count = Math.min(coll.getCount(), limite);
    for (let i = 0; i < count; i++) {
        items.push(coll.get(i));
    }
    return items;
}
```

### 11.5 Promesas para Operaciones Asíncronas

El motor XOne tiene una implementación custom de `Promise` compatible con ES2024 (`.then`, `.catch`, `.finally`, `Promise.all/allSettled/race/any/withResolvers`). Soporta ramificación (varias `.then` sobre la misma promesa producen cadenas independientes).

```javascript
function startUpdateGpsLoop() {
    new Promise((resolve, reject) => {
        let ventana = ui.getView(self);
        while (!bBreakUpdateGpsLoop) {
            if (!ventana) { reject(new Error("Sin ventana")); return; }
            try {
                actualizarGps();
            } catch (error) {
                reject(error);
                return;
            }
            ventana.refreshValue("MAP_LONGITUD", "MAP_LATITUD");
        }
        resolve();
    })
        .then(() => ui.showToast("GPS loop terminado OK"))
        .catch(err => ui.showToast("Error en GPS loop: " + err.message))
        .finally(() => console.log("cleanup"));
}
```

**Patrón con `Promise.all` (paralelo, fast-fail):**

```javascript
Promise.all([cargarUsuario(), cargarConfig(), cargarPermisos()])
    .then(([usuario, config, permisos]) => {
        pintarPantalla(usuario, config, permisos);
    })
    .catch(err => ui.msgBox("Error cargando datos: " + err));
```

**Patrón con `Promise.allSettled` (paralelo, espera todas):**

```javascript
Promise.allSettled([p1, p2, p3]).then(results => {
    results.forEach((r, i) => {
        if (r.status === "fulfilled") console.log("OK p" + i + ":", r.value);
        else console.log("FAIL p" + i + ":", r.reason);
    });
});
```

**Patrón con `Promise.withResolvers` (ES2024, evita la indirección del constructor):**

```javascript
const { promise, resolve, reject } = Promise.withResolvers();
// resolve/reject pueden invocarse desde cualquier callback posterior
ui.startGps(coords => resolve(coords));
return promise;
```
