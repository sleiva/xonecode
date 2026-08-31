# XOne — appData: colecciones, sesión, macros y SQL

> Fuente: `xone/v2/xone-help-docs/topics/03c-js-appdata-http.md` §4. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §4 appData completo: getCollection y operaciones, login/logout, paso de datos entre pantallas, macros globales, SQL directo, detección de dispositivo, loadIncludeFile y loadCssFile

---

## 4. Objeto Global `appData` - Aplicación

El objeto global `appData` gestiona datos, configuración, sesión y estado de la aplicación.

### 4.1 Colecciones

#### Crear objetos: patrón preferido (constructor `new`)

Toda colección de la aplicación está disponible como constructor global. `new NombreColeccion()` crea un objeto nuevo de esa colección y acepta un parámetro opcional con los valores iniciales (cada propiedad se asigna igual que `obj.PROP = valor`, disparando sus `onchange`):

```javascript
// Crear un objeto nuevo con valores iniciales
let obj = new Clientes({ NOMBRE: "ACME", ACTIVO: 1 });

// El parámetro es opcional
let obj2 = new Clientes();

// Crear, añadir a la colección y guardar
let coll = appData.getCollection("Clientes");
let obj3 = new Clientes({ NOMBRE: "Nuevo registro" });
coll.addItem(obj3);
obj3.save();
```

Cuándo NO aplica el constructor:

- **Contents anidados**: para crear líneas de un content usa `self.Contents("Lineas").createObject()` — crear desde el content establece el vínculo con el objeto padre; el constructor crea sobre la colección global y no vincula.
- **Nombre de colección dinámico**: si el nombre llega en una variable, usa el patrón legacy `appData.getCollection(nombre).createObject()`.

El constructor solo crea objetos. No existen métodos estáticos tipo ORM (`Usuarios.find(...)`, `Usuarios.create(...)`, `Usuarios.findById(...)`); las consultas se hacen con `appData.getCollection("Usuarios").findObject(...)` y demás métodos de la colección.

```javascript
// (legacy) Patrón antiguo de creación — sigue funcionando, pero el preferido es el constructor
let coll = appData.getCollection("Clientes");
let obj = coll.createObject();
obj.NOMBRE = "ACME";
obj.ACTIVO = 1;
```

#### API de colecciones

```javascript
// === Obtener una coleccion por nombre ===
let coll = appData.getCollection("NombreColeccion");

// === Crear nuevo objeto y agregarlo ===
let obj = new NombreColeccion({ MAP_NOMBRE: "Nuevo registro" });
coll.addItem(obj);
obj.save();

// === Cargar todos los registros ===
coll.loadAll();
let nCount = coll.getCount();  // Número de registros cargados

// === Iterar registros ===
for (let i = 0; i < coll.getCount(); i++) {
    let obj = coll.get(i);
    console.log(obj.MAP_NOMBRE);
}

// === Navegacion con browse ===
coll.startBrowse();
let item = coll.getCurrentItem();
coll.moveFirst();
while (coll.getCurrentItem() != null) {
    // Procesar item
    coll.moveNext();
}
coll.endBrowse();

// === Buscar objetos ===
let obj = coll.findObject("LOGIN = 'admin'");
let obj2 = coll.findObject("ID = 5 AND ACTIVO = 1");
let obj3 = coll.getItem("MAP_CAMPO", valor);
let todos = coll.findAllObjects("TIPO = 'A'");

// === Filtrar y ordenar ===
coll.setFilter("ACTIVO = 1 AND TIPO = 'A'");
coll.clear();
coll.loadAll();
coll.doSort("NOMBRE ASC");

// === Eliminar registros ===
coll.deleteItem(indice);        // Eliminar por indice
coll.browseDeleteAll();         // Eliminar todos de la BD
coll.clear();                   // Limpiar solo memoria

// === Guardar todos los registros modificados ===
coll.saveAll();

// === Bloquear/desbloquear para modificaciones ===
coll.lock();
coll.unlock();

// === Clonar coleccion ===
let collClone = coll.createClone();

// === Cargar desde JSON ===
coll.loadFromJson("[{'ID': 1, 'NOMBRE': 'Item1'}, {'ID': 2, 'NOMBRE': 'Item2'}]");

// === Variables y macros de coleccion ===
coll.setVariable("totalProcesados", 0);
let total = coll.getVariable("totalProcesados");
coll.setMacro("##FILTRO##", "activo=1");
let filtro = coll.getMacro("##FILTRO##");

// === Busqueda en memoria ===
coll.createSearchIndex(["NOMBRE", "DESCRIPCION"]);
coll.doSearch("texto a buscar");

// === Información de la coleccion ===
let nombre = coll.getName();
let propCount = coll.getPropertyCount();
let propName = coll.propertyName(0);
let propType = coll.getPropType("MAP_CAMPO");

// === Generar ROWID ===
let rowid = coll.generateRowId();
```

### 4.2 Autenticación

```javascript
// === Login ===
appData.login({
    userName          : self.MAP_USER,
    password          : self.MAP_PASSWORD,
    entryPoint        : "MenuPrincipal",
    onLoginSuccessful : function() {
        ui.showToast("Login OK!");
    },
    onLoginFailed     : function() {
        ui.showToast("Login failed!");
    }
});

// === Logout ===
appData.logout();

// === Salir de la app ===
appData.exit();

// === Reiniciar la app ===
appData.restart();

// === Obtener empresa y usuario actual ===
let empresa = appData.getCurrentEnterprise();
let empresas = appData.getAllowedEnterprises();
let usuarios = appData.getAllowedUsers();
```

### 4.3 Navegación entre Pantallas con Datos

Para abrir una pantalla pasándole datos, se usa el patrón **dataObject + `ui.openEditView()`**:

1. Obtener (o crear) un **dataObject** de la colección destino.
2. Asignar los valores deseados a sus propiedades (`obj.MAP_X = valor`).
3. Llamar a `ui.openEditView(dataObject)` — XOne abre la vista de edición de ese objeto.

```javascript
// === Pasar un objeto NUEVO a la pantalla destino ===
let coll = appData.getCollection("DetalleCliente");
let obj = new DetalleCliente({ MAP_CLIENTE_ID: clienteId, MAP_MODO: "consulta" });
coll.addItem(obj);
ui.openEditView(obj);

// === Abrir un objeto EXISTENTE recuperado de la BD ===
let coll = appData.getCollection("Clientes");
let cliente = coll.findObject("ID = " + clienteId);
if (cliente) {
    ui.openEditView(cliente);
}
```

**Forma corta — crear + abrir en una sola llamada:**

Si solo necesitas abrir un objeto nuevo sin preparar nada de antemano, basta con pasar el nombre de la colección. XOne hace internamente `createObject()` + `addItem()`:

```javascript
ui.openEditView("DetalleCliente");
```

**Cerrar la vista actual al abrir la nueva:**

`openEditView` admite un segundo argumento booleano para terminar la vista origen tras abrir la siguiente (flujos lineales sin botón atrás):

```javascript
ui.openEditView(obj, true);  // cierra la vista origen al abrir la nueva
```

### 4.4 Macros Globales

Las macros globales son pares clave-valor accesibles desde toda la aplicación. Son la alternativa de XOne a `localStorage`:

```javascript
// === Establecer y leer macros personalizadas ===
appData.setGlobalMacro("##MI_TOKEN##", "abc123");
let token = appData.getGlobalMacro("##MI_TOKEN##");

// === Macros del sistema ===
let deviceOs = appData.getGlobalMacro("##DEVICE_OS##");     // "android" o "ios"
let version = appData.getGlobalMacro("##VERSION##");
let frameVersion = appData.getGlobalMacro("##FRAME_VERSION##");

// === Obtener todas las macros ===
let todasMacros = appData.getAllGlobalMacros();

// === Patron comun: almacenar datos de sesion ===
function guardarSesion(usuario) {
    appData.setGlobalMacro("##USERID##", usuario.ID);
    appData.setGlobalMacro("##USERNAME##", usuario.NOMBRE);
    appData.setGlobalMacro("##USERROLE##", usuario.ROL);
}

function limpiarSesion() {
    appData.setGlobalMacro("##USERID##", "");
    appData.setGlobalMacro("##USERNAME##", "");
    appData.setGlobalMacro("##USERROLE##", "");
}
```

### 4.5 SQL Directo

**Firma:** `appData.executeSql(sql)`

- Acepta **exactamente 1 parámetro** (string SQL); no admite placeholders `?` ni varargs.
- **Sustituye automáticamente** las macros del framework (`##USERID##`, `##NOW##`, etc.) en el SQL antes de ejecutar.
- **No usar para leer escalares**: para `SELECT` no devuelve el valor, devuelve un cursor inutilizable desde JS. Para leer datos usar `SqlManager.doRawQuery()` + cursor.
- Casos de uso: sentencias de modificación masiva, sobre todo cuando hay cursores abiertos sobre la misma tabla y `CurrentItem` no puede modificarse desde la coll.

```javascript
// === Ejecutar SQL directo (UPDATE/INSERT/DELETE) ===
appData.executeSql("UPDATE gen_productos SET ACTIVO=0 WHERE STOCK=0");

// NO usar executeSql para leer escalares: no devuelve el COUNT, devuelve un ResultSet
// var n = appData.executeSql("SELECT COUNT(*) FROM gen_clientes"); // MAL

// === SqlManager para consultas avanzadas ===
let sqlManager = new SqlManager();
try {
    sqlManager.openDatabase({
        databasePath         : "gestion.db",
        useWal               : true,
        readOnly             : false,
        useExistingConnection: true,
        onDatabaseCorrupted  : function() {
            ui.showToast("Base de datos corrupta");
        }
    });

    // Consulta con parametros (SEGURO contra SQL injection)
    let cursor = sqlManager.doRawQuery(
        "SELECT * FROM gen_usuarios WHERE LOGIN=? AND ACTIVO=?",
        "admin", 1
    );
    try {
        if (cursor.getCount() > 0) {
            cursor.moveToFirst();
            let nombre = cursor.getString("NOMBRE");
            let id = cursor.getInteger("ID");
        }
    } finally {
        cursor.close();  // SIEMPRE cerrar el cursor
    }

    // Insertar con parametros seguros
    sqlManager.insert({
        tableName: "gen_productos",
        fields: {
            CODIGO: "PROD001",
            NOMBRE: "Producto nuevo",
            PRECIO: 29.99,
            ACTIVO: 1
        }
    });

    // Batch de SQLs
    let sqls = [];
    sqls.push("UPDATE gen_productos SET PROCESADO=1 WHERE FECHA < '2024-01-01'");
    sqls.push("DELETE FROM gen_log WHERE FECHA < '2023-01-01'");
    sqlManager.doBatchParseSqls(sqls);

    // Mantenimiento
    sqlManager.doWalCheckpoint();
    sqlManager.doVacuum();

} finally {
    sqlManager.close();  // SIEMPRE cerrar la conexión
}
```

### 4.6 Encriptación (Básica)

```javascript
// Encriptar string (encriptacion simple del framework)
let encrypted = appData.encryptString("texto secreto");

// Desencriptar string
let decrypted = appData.decryptString(encrypted);
```

Para encriptación avanzada (AES, RSA, firma digital), usar el objeto `crypto` documentado más adelante en la sección de Seguridad.

### 4.7 Deteccion de Dispositivo

```javascript
// Tipo de dispositivo
if (appData.isPhone()) { /* Teléfono */ }
if (appData.isTablet()) { /* Tablet */ }
if (appData.isWatch()) { /* Smartwatch */ }
if (appData.isWatchRound()) { /* Reloj redondo */ }
if (appData.isWatchSquare()) { /* Reloj cuadrado */ }

// Subtipos de teléfono
appData.isMiniPhone();  // Teléfono pequeño
appData.isMidPhone();   // Teléfono mediano
appData.isHiPhone();    // Teléfono grande

// Orientacion
if (appData.isVertical()) { /* Modo vertical (portrait) */ }
if (appData.isHorizontal()) { /* Modo horizontal (landscape) */ }

// Sistema operativo
let so = appData.getGlobalMacro("##DEVICE_OS##");  // "android" o "ios"
```

### 4.8 Push Notifications

`appData.registerPush(...)` admite tres firmas:

```javascript
// Forma 1: objeto con callbacks (los nombres correctos son onSuccess/onFailure/onPushReceived,
// NO "onRegistered"; el motor lee exactamente esos tres)
appData.registerPush({
    onSuccess: function(event) {
        let pushToken = event.pushToken;      // EventOnPushRegistered.pushToken
        console.log("Push token: " + pushToken);
        // Enviar token al servidor
    },
    onFailure: function(ex) {
        console.error("Push registration failed:", ex);
    },
    onPushReceived: function(message) {
        // Manejar la notificación recibida
    }
});

// Forma 2: una función (callback de éxito)
appData.registerPush(function(event) { /* event.pushToken */ });

// Forma 3: dos funciones posicionales (éxito, fallo)
appData.registerPush(function(event) { /* OK */ },
                     function(ex)    { /* error */ });
```

> Las notificaciones entrantes también se manejan con el nodo `<onpushreceived>` declarado en la `<coll Empresas>`.

### 4.9 Otros Métodos Importantes

```javascript
// === Cerrar la app ===
appData.exit();

// === Cerrar la ventana actual ===
ui.getView(self).exit();

// === Escribir en consola de debug ===
appData.writeConsoleString("Debug: valor = " + valor);

// === Cargar archivos include (solo para casos dinámicos — preferir <include>/<script> en <app>; ver 4.11) ===
appData.loadIncludeFile("scripts/miModulo.js", "javascript", "UTF-8");

// === Cargar/descargar archivos CSS en runtime (solo para casos dinámicos — preferir <style> en <app>; ver 4.12) ===
appData.loadCssFile("temas/oscuro.css");
appData.unloadCssFile("temas/oscuro.css");

// === Rutas del sistema ===
let appPath = appData.getAppPath();      // Ruta base de la aplicación
let filesPath = appData.getFilesPath();  // Ruta de carpeta files/

// === Manejo de errores ===
let error = appData.error();
if (error.getNumber() != 0) {
    console.log("Error: " + error.getDescription());
    console.log("SQL fallido: " + error.getFailedSql());
    error.clear();
}

// === Limpiar caches ===
appData.clearCaches();

// === Crear objetos especiales ===
let pdf = new XOnePDF();
let ocr = new XOneOCR();
let nfc = new XOneNFC();
let printer = new XOnePrinter();
let wifiMgr = new WifiManager();

// === Redondeo seguro ===
let resultado = appData.safeRound(3.14159, 2);  // 3.14

// === Replicacion ===
let isReplicating = appData.isReplicating();
let replicationId = appData.getReplicationId();
```

### 4.10 Métodos Adicionales de appData

#### getCurrentEnterprise() - Empresa Actual

```javascript
var empresa = appData.getCurrentEnterprise();

// Almacenar variables de sesion en la empresa
empresa.setVariable("GPSTime", new Date().toString());
empresa.setVariable("LATITUD", latitud);
empresa.setVariable("MIUBICACION", 0);

// Recuperar variables de la empresa
var valor = empresa.getVariable("GPSTime");
var lat = empresa.getVariable("LATITUD");
var debug = empresa.getVariable("Debug");
```

#### safeRound(value, decimals) - Redondeo Seguro

```javascript
var precio = appData.safeRound(vPendiente, 2);
var total = appData.safeRound(cantidad * precioUnitario, 2);
```

#### encryptString(text) / decryptString(text) - Cifrado/Descifrado

```javascript
var cifrado = appData.encryptString("texto sensible");
var descifrado = appData.decryptString(cifrado);
```

#### error() - Objeto de Error del Framework

```javascript
var error = appData.error();
if (error.getNumber() != 0) {
    console.log("Código: " + error.getNumber());
    console.log("Descripción: " + error.getDescription());
    console.log("SQL fallido: " + error.getFailedSql());
    error.clear();
}
```

#### writeConsoleString(message) - Consola de Depuracion

```javascript
appData.writeConsoleString("App_log_xone->Mensaje de depuracion");
```

#### setIsReplicating(boolean) - Control de Replicación

```javascript
appData.setIsReplicating(false);
// ... operaciones de mantenimiento local
appData.setIsReplicating(true);
```

#### Conexiones

```javascript
// Conexión por nombre (útil cuando la app declara varias conexiones)
var conn = appData.getConnection("REMOTA");

// String de la conexión PRINCIPAL (la por defecto)
var s = appData.getConnString();
```

#### getCollectionCount() / getVisualConditions()

```javascript
var nColls = appData.getCollectionCount();          // total de colecciones registradas
var conds  = appData.getVisualConditions();         // string con las condiciones visuales activas
```

### 4.11 Carga dinámica de scripts (`loadIncludeFile`) y declaración preferida

> **Regla general:** declara los scripts en el nodo `<app>` siempre que puedas. Reserva `loadIncludeFile()` para casos especiales que **realmente** necesiten cargar el fichero en runtime (carga condicional según usuario/empresa, scripts descargados dinámicamente, parches en caliente, etc.).

#### Forma preferida: declarar en el nodo `<app>` (estática)

```xml
<app default-language="javascript" ...>
    <!-- functions.js se carga automáticamente, no hace falta declararlo -->

    <!-- Forma <include>: encoding por defecto ISO-8859-1 -->
    <include file="scripts/utils.js" />
    <include url="scripts/api.js" encoding="UTF-8" />

    <!-- Forma <script> (alias estilo HTML): encoding por defecto UTF-8 -->
    <script src="scripts/auth.js" />
</app>
```

**Atributos comunes a `<include>` y `<script>`:**

| Atributo | Alias | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `file` | `url`, `src` | sí | — | Ruta del fichero |
| `language` | — | no | `default-language` del `<app>` | `"javascript"` o `"vbscript"` |
| `encoding` | `charset` | no | `ISO-8859-1` en `<include>` · `UTF-8` en `<script>` | Codificación del fichero |
| `delay-compilation` | — | no | `false` | Difiere la compilación hasta el primer uso |
| `compile` | — | no | `true` | Si `false`, registra el fichero pero no lo compila |

#### Forma dinámica: `appData.loadIncludeFile()` (solo casos especiales)

```javascript
appData.loadIncludeFile(fileName [, scriptLanguage] [, encoding] [, delayCompilation] [, compile]);
```

| # | Nombre | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| 1 | `fileName` | sí | — | Ruta del fichero igual que en el nodo XML `<include>` |
| 2 | `scriptLanguage` | no | `default-language` del nodo `<app>` | `"javascript"` o `"vbscript"` |
| 3 | `encoding` | no | `"ISO-8859-1"` | Codificación del fichero. **Atención: el default NO es UTF-8** |
| 4 | `delayCompilation` | no | `false` | Si `true`, difiere la compilación hasta el primer uso |
| 5 | `compile` | no | `true` | Si `false`, registra el fichero pero no lo compila |

```javascript
// Carga simple (asume default-language=javascript y encoding ISO-8859-1)
appData.loadIncludeFile("scripts/miModulo.js");

// Recomendado si el script tiene tildes/ñ guardadas como UTF-8
appData.loadIncludeFile("scripts/miModulo.js", "javascript", "UTF-8");
```

**Advertencia sobre el encoding:** el valor por defecto es `ISO-8859-1`, no UTF-8. Si tu script contiene caracteres no-ASCII (tildes, ñ, símbolos) y está guardado como UTF-8, **se romperán** salvo que pases `"UTF-8"` explícitamente como tercer parámetro.

Llamadas posteriores al mismo fichero **no recompilan**: el motor reutiliza el bytecode ya cargado.

### 4.12 Carga dinámica de CSS (`loadCssFile` / `unloadCssFile`) y declaración preferida

> **Regla general:** declara las hojas de estilo en el nodo `<app>` siempre que puedas. Reserva `loadCssFile()` / `unloadCssFile()` para casos especiales (cambio de tema por usuario, modo oscuro/claro en runtime, A/B testing visual, etc.).

#### Forma preferida: declarar en el nodo `<app>` (estática)

```xml
<app ...>
    <style url="estilos.css" />
    <style url="temas/oscuro.css" encoding="UTF-8" conditions="##DEVICE_OS##='android'" strict-mode="true" />
</app>
```

**Atributos del nodo `<style>`:**

| Atributo | Obligatorio | Default | Descripción |
|---|---|---|---|
| `url` | sí | — | Ruta del fichero CSS |
| `encoding` | no | (depende del fichero) | Codificación del fichero |
| `conditions` | no | (sin condición) | Condición de carga evaluada al iniciar (p. ej. macros globales) |
| `strict-mode` | no | `false` | Si `true`, exige CSS bien formado (avisa de errores como falta de `;`). En modo estricto hay que escapar `:` en valores: `title:Hola\:Mundo;` |

#### Forma dinámica: `appData.loadCssFile()` / `appData.unloadCssFile()` (solo casos especiales)

**Firmas:**

```javascript
// Forma 1: argumentos posicionales
appData.loadCssFile(name [, encoding] [, conditions] [, strictMode]);

// Forma 2: objeto literal
appData.loadCssFile({ name: "...", encoding: "...", conditions: "...", strictMode: false });

// Descarga (un único argumento)
appData.unloadCssFile(name);
```

**Parámetros de `loadCssFile`:**

| # / clave | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|
| `name` | sí | — | Ruta del fichero CSS |
| `encoding` | no | `"UTF-8"` | Codificación del fichero (¡distinto de `loadIncludeFile`!) |
| `conditions` | no | (sin condición) | Condición de carga |
| `strictMode` | no | `false` | Modo estricto de parseo |

**Ejemplo (cambio de tema en runtime):**

```javascript
function aplicarTemaOscuro() {
    appData.unloadCssFile("temas/claro.css");
    appData.loadCssFile("temas/oscuro.css", "UTF-8");
    // El framework limpia caches de propiedades y refresca la cascada
}
```

`loadCssFile()` y `unloadCssFile()` invalidan automáticamente los caches internos de propiedades visuales (`ClearCollPropValueCaches()`), por lo que los cambios se reflejan en los siguientes renders sin reiniciar la app.

**Diferencia de encoding por defecto:**

| Método | Default encoding |
|---|---|
| `appData.loadCssFile()` | `"UTF-8"` |
| `appData.loadIncludeFile()` | `"ISO-8859-1"` |
| `<style>` en `<app>` | depende del fichero |
| `<include>` en `<app>` | `"ISO-8859-1"` |
| `<script>` en `<app>` | `"UTF-8"` |
