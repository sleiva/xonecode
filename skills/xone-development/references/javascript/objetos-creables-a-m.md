# XOne JavaScript — Objetos creables (FileManager a Animation)

> Fuente: `xone/v2/xone-help-docs/topics/06-javascript-runtime-objects.md` L301–821. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §5.1 FileManager · §5.2 GpsTools · §5.3 SqlManager · §5.4 IniParser · §5.5 EncodingUtils · §5.6 AndroidIntent · §5.7 DeviceManager · §5.8 WifiManager · §5.9 BluetoothSerialPort · §5.10 OAuth2 · §5.11 Worker · §5.12 Animation

---

## 5. Objetos Creables con `new` o `createObject()`

XOne expone una serie de objetos que se instancian con `new NombreClase()` (forma preferida e idiomatica en JavaScript) o, alternativamente, con `appData.createObject("NombreClase")`. Ambas formas son equivalentes — `createObject` hace match **case-insensitive** internamente, pero los ejemplos usan PascalCase canonico.

```js
// Forma preferida — new
var fm = new FileManager();

// Alternativa equivalente
var fm = appData.createObject("FileManager");
```

> **IMPORTANTE:** Los objetos `crypto`, `clipboard`, `deviceInfo`, `systemSettings`, `biometricsManager`, `fingerprintManager`, `bleManager`, `sensorManager`, `packageManager`, `paymentManager`, `pushMessage`, `appBroadcastManager`, `$http` y otros **NO** son creables — son **singletons globales** y se acceden directamente por su nombre. Ver §6.

Además de estos objetos del runtime, **todas las colecciones de la aplicación** son creables con `new`: `new NombreColeccion()` crea un objeto nuevo de esa colección, con un parámetro opcional de valores iniciales. Es el patrón preferido para crear dataobjects:

```js
var obj = new Usuarios({ ID: 5, MAP_TITULO: "El titulo" });
// (legacy) Equivale a:
// var obj = appData.getCollection("Usuarios").createObject();
// obj.ID = 5; obj.MAP_TITULO = "El titulo";
```

Excepciones donde se mantiene el patrón clásico: contents anidados (`self.Contents("X").createObject()` vincula la línea al objeto padre; el constructor no) y nombres de colección dinámicos (`appData.getCollection(variable).createObject()`).

---

### 5.1 FileManager

Gestión completa de ficheros y directorios en el dispositivo. Convención: las funciones que retornan `int` siguen estilo C → **`0` = OK / existe**, **`-1` = error / no existe**.

| Método | Descripción |
|---|---|
| `readFile(path, [encoding])` → `String` | Lee texto del fichero (UTF-8 por defecto). |
| `saveFile(path, content, [append], [encoding])` → `boolean` | Escribe / añade contenido (acepta texto o `byte[]`). |
| `fileExists(path)` → `int` | **`0` si existe**, `-1` si no. |
| `directoryExists(path)` → `int` | **`0` si existe**, `-1` si no. |
| `getFileInfo(path)` → `Map` | `{size, creationDate, modificationDate, isHidden, canRead, canWrite, canExecute}`. |
| `getLastModifiedDate(path)` → `Date` | Fecha de última modificación. |
| `getSize(path)` → `long` | Tamaño del fichero o del árbol (si es directorio). |
| `isDirectoryEmpty(path)` → `boolean` | `true` si la carpeta no tiene contenido. |
| `listFiles(path \| {source, fileTypes, orderBy, dateFrom, dateTo})` → `Object[]` | Lista paths de ficheros con filtros opcionales. |
| `listDirectories(path)` → `Object[]` | Lista subdirectorios. |
| `createDirectory(path)` → `int` | `0` OK, `1` ya existe (dir), `2` existe como fichero, `-1` error. |
| `deleteDirectory(path)` → `int` | Borrado recursivo. |
| `copy(src, dst)` / `move(src, dst)` / `rename(src, dst)` → `int` | Operaciones de fichero. |
| `delete(path, ...)` → `int` | Borra uno o varios ficheros. |
| `zip(src, [dst])` → `int` | Comprime fichero o carpeta. |
| `zipAll(target \| {targetZip, password, files}, ...)` → `int` | Zip de múltiples ficheros (con password opcional). |
| `unzip(src, [dstDir], [password])` → `int` | Descomprime ZIP (con password si lo tiene). |
| `toBase64(path)` → `String` | Codifica fichero a Base64. |
| `toFile(base64, path)` → `int` | Decodifica Base64 a fichero. |
| `getChecksum(path, [type], [urlSafe])` → `String` | Tipos: `crc32` (default), `adler32`, `sha1`, `sha2`, `sha256`, `sha512`. |
| `download(url, dest) \| download({source, target, method, headers, parameters, onSuccess, onProgress, onError, ...})` → `int \| Future` | Síncrono (legacy) o asíncrono con Future. |
| `uploadFile({url, file, headers, parameters, onSuccess, onProgress, onError, ...})` → `Object` | Sube fichero multipart. |
| `downloadDatabase(url)` → `int` | Reemplaza atómicamente la BD por la remota. |
| `deleteDatabase(name)` → `int` | Borra `.db`, `.db-wal` y `.db-shm`. |
| `openFile(path)` → `int` | Abre con la app del sistema (ACTION_VIEW). |
| `getRootDirectory()` → `String` | `/data/data/<package>/`. |
| `getCacheDirectory()` → `String` | `/data/data/<package>/cache`. |
| `getCodeCacheDirectory()` → `String` | `/data/data/<package>/code_cache`. |
| `clearCache({maxSize?, olderThan?})` | Limpia caché por tamaño o por fecha. |
| `addOnDirectoryChangedListener(path, cb)` / `removeOnDirectoryChangedListener(path)` | Watcher de cambios (`cb(sEvent, sPath)`). |

Catálogo completo con ejemplos por área (lectura, listado, compresión, descarga/subida, watchers, etc.) en 03d-js-createobject.md §8.1.

```js
var fm = new FileManager();
var ruta = appData.getFilesPath() + "/backup.txt";
if (fm.fileExists(ruta) === 0) {
    var contenido = fm.readFile(ruta);
    appData.writeConsoleString(contenido);
} else {
    fm.saveFile(ruta, "datos iniciales");
}
```

---

### 5.2 GpsTools

Utilidades de calculo y gestion GPS avanzadas.

| Método | Descripción |
|---|---|
| `startGps(params)` → `boolean` | Inicia la escucha GPS con parámetros de precisión. |
| `stopGps(...)` → `boolean` | Detiene la escucha GPS. |
| `getLastKnownLocation()` → `Map` | Posición actual como mapa `{lat, lng, alt, accuracy, ...}`. |
| `distanceBetweenCoordinates(lat1, lng1, lat2, lng2)` → `double` | Distancia en metros entre dos puntos (4 args posicionales). |
| `distanceTo([{latitude, longitude}, {latitude, longitude}])` → `double` | Distancia en metros entre dos puntos (variante con un array de 2 coordenadas; equivalente a `distanceBetweenCoordinates`). |
| `bearingBetweenCoordinates(lat1, lng1, lat2, lng2)` → `double` | Rumbo (ángulo) entre dos puntos. |
| `simplifyPolyline(points, tolerance)` → `Object[]` | Simplifica una polilinia (algoritmo Douglas-Peucker). |
| `getArea(polygon)` → `double` | Calcula el área de un poligono (en m2). |
| `encode(points)` → `String` | Codifica puntos en formato Polyline encoded (Google). |
| `decode(polyline)` → `Object[]` | Decodifica un Polyline encoded a array de puntos. |
| `containsLocation(point, polygon)` → `boolean` | Comprueba si un punto esta dentro de un poligono. |
| `getAddressFromPosition({latitude, longitude})` → `Map` | Geocoding inverso. Toma **1 NativeObject** o un string `"lat,lng"`, NO dos argumentos posicionales. |
| `getPositionFromAddress(address)` → `Map` | Geocoding directo (dirección a coordenadas). |
| `launchMaps(...)` | Lanza la app de mapas del sistema. |
| `addExifLocationToFile({file, latitude, longitude, date?})` | Anade metadatos EXIF GPS a una imagen. Toma **1 NativeObject**, no `(file, lat, lng)`. |

```js
var gps = new GpsTools();
var dist = gps.distanceBetweenCoordinates(40.416775, -3.703790, 40.453191, -3.688344);
appData.writeConsoleString("Distancia: " + Math.round(dist) + " m");
```

---

### 5.3 SqlManager

Acceso a bases de datos SQLite a bajo nivel, para operaciones que la API de colecciones no cubre.

**Importante**: la mayoría de métodos toman **un único `NativeObject` de configuración** (no argumentos posicionales). Las claves son las que se indican en la columna "Firma".

| Método | Firma |
|---|---|
| `openDatabase({databasePath, enableWal?, readOnly?, createIfNeeded?, noLocalizedCollators?, useExistingConnection?, password?, onDatabaseCorrupted?})` | Abre la BD SQLite. **No** acepta `(path)` posicional. |
| `close()` | Cierra la base de datos. |
| `isOpen()` → `boolean` | `true` si la conexión esta abierta. |
| `doRawQuery(sql, [args])` → `Cursor` | Ejecuta una sentencia SQL (sí acepta argumentos posicionales: SQL + varargs). |
| `doBatchRawQueries(sqls)` / `doBatchParseSqls(sqls)` | Ejecución en lote. |
| `insert({tableName, fields})` → `long` | Inserta una fila. Devuelve el `rowid`. `fields` es un objeto `{col1: val1, col2: val2}`. |
| `update({tableName, fields, whereClause?, whereArguments?})` → `long` | Actualiza filas. |
| `delete({tableName, whereClause?, whereArguments?})` → `long` | Borra filas. |
| `getVersion()` / `setVersion(n)` | PRAGMA user_version. |
| `isReadOnly()` / `isInTransaction()` / `isDatabaseIntegrityOk()` → `boolean` | Estado de la BD. |
| `getAttachedDbs()` → `Object[]` | Lista de BDs adjuntadas (ATTACH). |
| `setLocale(locale)` / `setMaxSqlCacheSize(n)` / `setForeignKeyConstraintsEnabled(bool)` | Configuración. |
| `enableWriteAheadLogging()` / `disableWriteAheadLogging()` / `isWriteAheadLoggingEnabled()` / `doWalCheckpoint()` | Gestión del modo WAL. |
| `doVacuum()` → `boolean` | Ejecuta `VACUUM` para compactar la BD. |
| `dropIndex(name)` / `dropAllIndexes()` | Borrado de índices. |

**`Cursor`** expone: `getCount()`, `moveToFirst()`/`moveToNext()`/`moveToPrevious()`/`moveToLast()`/`moveToPosition(n)`, `getColumnNames()`, `getString(colName)`, `getInteger(colName)`, `getLong(colName)`, `getShort(colName)`, `getFloat(colName)`, `getDouble(colName)`, `getBlob(colName)`, `close()`.

> **AVISO**: los getters reciben el **nombre de columna como String**, NO el índice numérico. Y el método entero se llama `getInteger`, NO `getInt` (que es el nombre que usa la API Android `Cursor`).

```js
var db = new SqlManager();
// Apertura: SIEMPRE un objeto con `databasePath` (NO un string posicional)
db.openDatabase({
    databasePath  : appData.getFilesPath() + "/cache.db",
    createIfNeeded: true,
    enableWal     : true
});
try {
    var cursor = db.doRawQuery("SELECT id, nombre FROM articulos WHERE activo = ?", 1);
    if (cursor.moveToFirst()) {
        do {
            appData.writeConsoleString(cursor.getInteger("id") + ": " + cursor.getString("nombre"));
        } while (cursor.moveToNext());
    }
    cursor.close();

    // Insert / update / delete: NativeObject con `tableName` + `fields` + `whereClause` opcional
    var rowid = db.insert({
        tableName: "articulos",
        fields   : { nombre: "Nuevo", activo: 1 }
    });
    db.update({
        tableName    : "articulos",
        fields       : { activo: 0 },
        whereClause  : "id = ?",
        whereArguments: [rowid]
    });
    db.delete({
        tableName    : "articulos",
        whereClause  : "id = ?",
        whereArguments: [rowid]
    });
} finally {
    db.close();
}
```

---

### 5.4 IniParser

Lectura y escritura de ficheros de configuración en formato INI.

| Método | Descripción |
|---|---|
| `parseFromString(text)` | Parsea contenido INI desde un String. |
| `parseFromFile(path)` | Parsea desde un fichero. |
| `serialize()` → `String` | Vuelca el contenido a String INI. |
| `save(path)` | Guarda el contenido en un fichero. |
| `getValue(key)` → `String` | Lee el valor de una clave (sin sección). |
| `setValue(key, value)` | Asigna una clave. |
| `getValueBySection(section, key)` → `String` | Lee el valor de una clave dentro de una sección. |

```js
var ini = new IniParser();
ini.parseFromFile(appData.getFilesPath() + "/config.ini");
var servidor = ini.getValueBySection("Conexión", "servidor");
var puerto   = ini.getValueBySection("Conexión", "puerto");
```

---

### 5.5 EncodingUtils

Codificación y decodificacion Base64 y otros formatos.

| Método | Descripción |
|---|---|
| `toBase64(data, [opts])` → `String` | Codifica datos a Base64. |
| `fromBase64(text, [opts])` → `String` | Decodifica Base64 a datos. |

```js
var enc = new EncodingUtils();
var codificado = enc.toBase64("usuario:password");
// resultado: "dXN1YXJpbzpwYXNzd29yZA=="
```

> Para hashing (MD5, SHA, etc.) usar el singleton global `crypto`. Ver §6.

---

### 5.6 AndroidIntent

Wrapper sobre `android.content.Intent` para componer y lanzar intents desde JS. La mayoría de setters devuelven la propia instancia (encadenable); los lanzadores (`startActivity`, `startService`, broadcasts) devuelven `int` (siempre 0).

| Método | Parámetros | Retorno | Descripción |
|---|---|---|---|
| `setPackage(packageName)` | 1 String | `AndroidIntent` | Fija el paquete destino. |
| `setClassName(packageName, className)` | 2 Strings | `AndroidIntent` | Fija el componente destino (FQDN). |
| `setAction(action)` o `setAction(className, fieldName)` | 1 o 2 Strings | `AndroidIntent` | Fija acción. Con 2 args resuelve por reflexión el valor de la constante estática `className.fieldName`. |
| `setData(uriString)` | 1 String | `AndroidIntent` | Fija URI mediante `Uri.parse`. |
| `setDataFromFile(filePath)` | 1 String | `AndroidIntent` | Resuelve `filePath` dentro de la app y genera un FileProvider URI. |
| `setType(mimeType)` | 1 String | `AndroidIntent` | Fija el tipo MIME. |
| `setDataAndType(uriOrFile, mimeType)` | 2 Strings | `AndroidIntent` | Si el path existe como fichero usa FileProvider; si no, `Uri.parse`. |
| `addCategory(category)` o `addCategory(className, fieldName)` | 1 o 2 Strings | `AndroidIntent` | Añade categoría (literal o por reflexión). |
| `addFlag(flag)` o `addFlag(className, fieldName)` | 1 int o 2 Strings | `AndroidIntent` | Añade flag (literal int o por reflexión). |
| `putStringExtra(name, value)` | 2 Strings | `AndroidIntent` | Extra String. |
| `putStringArrayExtra(name, array)` | String + NativeArray | `AndroidIntent` | Extra `String[]`. |
| `putStringArrayListExtra(name, array)` | String + NativeArray | `AndroidIntent` | Extra `ArrayList<String>`. |
| `putCharSequenceArrayListExtra(name, array)` | String + NativeArray | `AndroidIntent` | Extra `ArrayList<CharSequence>`. |
| `putParcelableArrayListExtra(name, array)` | String + NativeArray | `AndroidIntent` | Extra `ArrayList<Parcelable>`. |
| `putIntegerExtra(name, value)` | String + int | `AndroidIntent` | Extra int. |
| `putIntegerArrayExtra(name, array)` | String + NativeArray | `AndroidIntent` | Extra `int[]`. |
| `putIntegerArrayListExtra(name, array)` | String + NativeArray | `AndroidIntent` | Extra `ArrayList<Integer>`. |
| `putLongExtra(name, value)` | String + long | `AndroidIntent` | Extra long. |
| `putFloatExtra(name, value)` | String + float | `AndroidIntent` | Extra float. |
| `putFloatArrayExtra(name, array)` | String + NativeArray | `AndroidIntent` | Extra `float[]`. |
| `putDoubleExtra(name, value)` | String + double | `AndroidIntent` | Extra double. |
| `putDoubleArrayExtra(name, array)` | String + NativeArray | `AndroidIntent` | Extra `double[]`. |
| `putBooleanExtra(name, value)` | String + String/boolean | `AndroidIntent` | Extra boolean (acepta string `"true"/"false"`). |
| `putBooleanArrayExtra(name, array)` | String + NativeArray | `AndroidIntent` | Extra `boolean[]`. |
| `putBundleExtra(name, bundleWrapper)` | String + `ScriptBundleWrapper` | `AndroidIntent` | Extra Bundle. El segundo arg debe ser un Bundle (`new Bundle()`). |
| `putFileExtra(name, filePath)` | 2 Strings | `AndroidIntent` | Localiza el fichero en la app y mete su FileProvider URI como extra. |
| `putExtra(name, value)` | String + Object | `AndroidIntent` | Extra genérico (auto-detecta tipo: String, Integer, Float, Double, Boolean, Parcelable, Serializable, etc.). |
| `getLaunchIntentForPackage(packageName)` | 1 String | `AndroidIntent` | Reemplaza el intent interno con el de lanzamiento del paquete. |
| `getMyPackageName()` | ninguno | `String` | Nombre de paquete del proceso actual. |
| `startActivity()` | ninguno | `int` (0) | Lanza el intent como Activity. |
| `startActivityForResult(callback)` / `startActivityForResult(callback, bundleExtras?)` / `startActivityForResult(dataObject, nodeName, bundleExtras?)` | 1..3 args | `int` (0) | Lanza esperando resultado. Si el primer arg es Function se invoca al volver con `(resultCode, ScriptBundleWrapper)`; si es un dataObject se ejecuta el nodo `nodeName`. |
| `startService()` | ninguno | `int` (0) | Llama `Context.startService`. |
| `stopService()` | ninguno | `int` (0) | Llama `Context.stopService`. |
| `sendBroadcast(receiverPermission?)` | 0 o 1 String | `int` (0) | Envía broadcast (opcionalmente con permission). |
| `sendOrderedBroadcast(receiverPermission?)` | 0 o 1 String | `int` (0) | Envía broadcast ordenado. |
| `registerBroadcastReceiver({action, permission?, exported?, onReceive})` | 1 NativeObject | `int` (0) | Registra `ScriptBroadcastReceiver` para la `action` (única por action). `exported` por defecto `true` (Android 13+). |
| `unregisterBroadcastReceiver(action)` | 1 String | `int` (0) | Desregistra el receiver de esa action. |
| `isReceiverRegistered(action)` | 1 String | `boolean` | Indica si hay receiver registrado para la action. |

```js
// Marcar teléfono
new AndroidIntent()
    .setAction("android.intent.action.DIAL")
    .setData("tel:" + self.getValue("TELEFONO"))
    .startActivity();

// Abrir URL con flag (resolución por reflexión)
new AndroidIntent()
    .setAction("android.intent.action.VIEW")
    .setData("https://www.xone.es")
    .addFlag("android.content.Intent", "FLAG_ACTIVITY_NEW_TASK")
    .startActivity();

// Pedir foto a la cámara y recoger el resultado
new AndroidIntent()
    .setAction("android.media.action.IMAGE_CAPTURE")
    .startActivityForResult(function(resultCode, extras) {
        appData.writeConsoleString("resultado: " + resultCode);
    });

// Registrar receiver de broadcast
new AndroidIntent().registerBroadcastReceiver({
    action   : "com.miempresa.MI_EVENTO",
    onReceive: function(intent) {
        ui.showToast("Evento recibido");
    }
});
```

---

### 5.7 DeviceManager

Funciones de administración del dispositivo (Device Owner / MDM): visibilidad de paquetes, certificados CA, gestión de claves criptográficas. Requiere que la app sea Device Owner o Profile Owner. Muchos métodos devuelven `false` silenciosamente en versiones de Android antiguas.

| Método | Parámetros | Retorno | Descripción |
|---|---|---|---|
| `setAppVisibility(packageName, visible)` | 2 (String, boolean) | `boolean` | Oculta o muestra un paquete (DPM `setApplicationHidden`). |
| `toggleAppVisibility(packageName)` | 1 String | `boolean` | Invierte el estado oculto del paquete. |
| `setSuspendedApps({packageNames, suspended})` | 1 NativeObject | `boolean` | Suspende/reanuda un array de paquetes (requiere API 24+). |
| `setUninstallBlocked({packageNames, blocked})` | 1 NativeObject | `boolean` | Bloquea o permite desinstalar los paquetes indicados (plural). |
| `getInstalledCaCerts()` | ninguno | `ScriptCertificate[]` | Lista certificados CA instalados por el DPM. |
| `installCaCertificates(value)` | 1 (String nombre fichero, NativeArrayBufferView, `ScriptCertificate` o `NativeArray` de cualquiera de los anteriores) | `boolean` | Instala uno o varios certificados CA. |
| `uninstallCaCertificates(value)` | 1 (mismas formas que install) | `boolean` | Desinstala certificados CA. |
| `getEnrollmentId()` | ninguno | `String` | ID de enrollment del DPM (Android 12+); en versiones previas devuelve `""`. |
| `generateKeyPair({alias, algorithm, keySize, purposes})` | 1 NativeObject | `ScriptKeyPairCertificate` o `null` | Genera par de claves en KeyStore. `purposes` es array con valores `"encrypt"`, `"decrypt"`, `"sign"`, `"verify"`, `"agree"` (API 31+), `"attest"` (API 31+), `"wrap"`. Requiere API 28+. |
| `installKeyPair({alias, privateKey, certificateChain, userSelectable?, requestAccess?})` | 1 NativeObject | `boolean` | Instala una clave privada con su cadena. `userSelectable` y `requestAccess` por defecto `true`. |
| `removeKeyPair({alias})` | 1 NativeObject | `boolean` | Elimina la clave del alias indicado. |
| `grantKeyPair({alias, packageName})` | 1 NativeObject | `boolean` | Concede a `packageName` acceso a la clave (API 30+). |
| `revokeKeyPair({alias, packageName})` | 1 NativeObject | `boolean` | Revoca el acceso (API 30+). |

```js
var dm = new DeviceManager();
dm.setAppVisibility("com.ejemplo.app", false);

// Suspender varias apps a la vez (NativeObject con packageNames PLURAL)
dm.setSuspendedApps({
    packageNames: ["com.facebook.katana", "com.instagram.android"],
    suspended   : true
});

// Bloquear desinstalación (también packageNames plural)
dm.setUninstallBlocked({
    packageNames: ["com.xone.android.framework"],
    blocked     : true
});

// Generar par de claves RSA 2048 para firma
dm.generateKeyPair({
    alias    : "miFirma",
    algorithm: "RSA",
    keySize  : 2048,
    purposes : ["sign", "verify"]
});

// Gestionar acceso de otras apps a la clave (API 30+)
dm.grantKeyPair({ alias: "miFirma", packageName: "com.ejemplo.app" });
```

---

### 5.8 WifiManager

Gestion de conexiones WiFi.

| Método | Descripción |
|---|---|
| `getAdapterMacAddress()` → `String` | Dirección MAC del adaptador WiFi. |
| `connect(ssid)` → `Object` | Conecta a la red WiFi cuyo SSID se pasa como **string** (NO un objeto de opciones). |
| `disconnect()` → `boolean` | Desconecta de la red WiFi actual. |
| `listSavedNetworks()` → `Object[]` | Lista las redes WiFi guardadas en el dispositivo. |
| `scanAvailableNetworks(...)` → `boolean` | Escanea redes WiFi disponibles. |
| `enableWifiAdapter()` | Enciende el adaptador WiFi. |
| `disableWifiAdapter()` | Apaga el adaptador WiFi. |
| `isWifiAdapterEnabled()` → `boolean` | `true` si el adaptador WiFi esta encendido. |
| `getActiveWifiInfo()` → `XOneWifiInfo` | Info de la conexión WiFi actual. |
| `getVpnInfo()` → `XOneVpnInfo` | Info de VPN activa. |
| `addNetwork(...)` / `removeNetwork(...)` / `enableNetwork(...)` / `disableNetwork(...)` | Gestion de redes guardadas. |
| `startLocalOnlyNetwork(...)` | Crea red local sin internet. |

```js
var wifi = new WifiManager();
var redes = wifi.listSavedNetworks();
```

---

### 5.9 BluetoothSerialPort

Cliente Bluetooth clásico (RFCOMM SPP, UUID `00001101-...`). Mantiene conexión persistente con un dispositivo. Operaciones síncronas con timeout configurable. La mayoría de métodos devuelven la propia instancia para encadenado.

| Método | Parámetros | Retorno | Descripción |
|---|---|---|---|
| `setMacAddress(mac)` | 1 String | `BluetoothSerialPort` | Fija la MAC objetivo (validada por `BluetoothAdapter.checkBluetoothAddress`). |
| `isDevicePaired()` | ninguno | `boolean` | Comprueba si la MAC actual (o la guardada en SharedPreferences `BluetoothSerialPort/address`) está emparejada. |
| `pairDevice()` | ninguno | `BluetoothSerialPort` | Inicia emparejamiento (`createBond`). |
| `removePairing()` | ninguno | `BluetoothSerialPort` | Elimina el emparejamiento (`removeBond` por reflexión). |
| `isEnabled()` | ninguno | `boolean` | Estado del adaptador Bluetooth. |
| `enable()` | ninguno | `BluetoothSerialPort` | Activa el adaptador (en Android 14+ lanza si no está ya activado). |
| `disable()` | ninguno | `BluetoothSerialPort` | Desactiva el adaptador. |
| `toggle()` | ninguno | `boolean` | Conmuta el estado del adaptador. |
| `connect(macAddress?)` | 0 o 1 String | `BluetoothSerialPort` | Abre socket RFCOMM inseguro al dispositivo (usa la MAC dada, la previamente fijada o la guardada). Persiste la última MAC en SharedPreferences. |
| `isConnected()` | ninguno | `boolean` | Si el socket está conectado. |
| `getSavedAddress()` | ninguno | `String` | MAC del último dispositivo conectado (puede ser `""`). |
| `setTimeout(timeoutSeconds)` | 1 long | `BluetoothSerialPort` | Timeout en **segundos** para read/write (`-1` = espera infinita). |
| `selectDevice()` | ninguno | `BluetoothSerialPort` | Lanza la actividad `BluetoothDeviceSelector` para elegir un dispositivo emparejado. |
| `selectBluetoothDevice()` | ninguno | `BluetoothSerialPort` | Alias obsoleto de `selectDevice`. |
| `getDiscoverableDevices()` | ninguno | `BluetoothDeviceScript[]` | Lanza descubrimiento BT clásico y devuelve la lista (espera a que termine). |
| `getDiscoverableBluetoothDevices()` | ninguno | `Object[]` | Alias obsoleto del anterior. |
| `write(data)` | 1 (String o `{data, offset?, endIndex?}`) | `boolean` | Escribe en el socket. Si es objeto, `data` es byte array; `endIndex` por defecto = longitud. |
| `read(size?)` | 0 o 1 int | `String` | Lee hasta `size` bytes (default 1) decodificados como String. |
| `readAll()` | ninguno | `String` | Lee todos los bytes disponibles (o bloquea hasta EOF). |
| `readBuffer(size)` | 1 int | `NativeInt8Array` o `null` | Lee `size` bytes y los devuelve como buffer JS. |
| `getAvailableBytes()` | ninguno | `int` | Bytes en buffer de entrada (0 si no hay conexión). |
| `sleep(ms)` | 1 long | `BluetoothSerialPort` | `Thread.sleep` en el hilo actual (default 100 ms). |
| `isOpen()` | ninguno | `boolean` | Si los streams están abiertos. |
| `setReadCallback(callback)` | 1 (callback o `null`) | `BluetoothSerialPort` | Registra callback JS que recibe los datos entrantes como String. Pasar `null` cancela. |
| `disconnect()` | ninguno | `BluetoothSerialPort` | Cierra streams y socket. |
| `requestEnableBluetooth({onEnabled, onDenied})` | 1 NativeObject | `BluetoothSerialPort` | Muestra el diálogo del sistema para activar Bluetooth e invoca el callback correspondiente. |

```js
var bt = new BluetoothSerialPort();
bt.setTimeout(5)
  .connect("00:11:22:33:44:55")
  .write("HOLA\r\n");
var resp = bt.readAll();
appData.writeConsoleString("Respuesta: " + resp);
bt.disconnect();

// Recepción asíncrona con callback
bt.setReadCallback(function(data) {
    appData.writeConsoleString("RX: " + data);
});
```

---

### 5.10 OAuth2

Autenticación OAuth2 y manejo de tokens JWT.

| Método | Descripción |
|---|---|
| `withOptions({clientId, oauthUri, tokenUri, redirectUri, scope, ...})` | Configura el cliente OAuth2. **Obligatorio antes de `authenticate`.** Las claves de URL son `oauthUri`/`tokenUri` (NO `authUrl`/`tokenUrl`). |
| `authenticate({onSuccess, onError, noHistory?})` | Lanza el flujo. **Solo lee onSuccess/onError/noHistory**; el resto de config se toma de `withOptions`. |
| `register(...)` | Registro de cliente dinamico. |
| `requestToken(opts)` | Solicita un token de acceso (refresh, etc.). |
| `parseJwt(jwt)` → `JSONObject` | Decodifica el payload de un token JWT (sin verificar firma). |
| `verifyJwt({token, key})` → `boolean` | Verifica firma JWT. Toma **1 NativeObject** con `token` y `key`/`publicKey`, NO `(jwt, key)`. |
| `logout(callback)` | Cierra sesion. Exige **1 callback**. |
| `isBrowserPresent()` / `getBrowserInfo()` / `fetchConfiguration(...)` | Utilidades del browser custom tab. |

```js
var oauth = new OAuth2();
oauth.withOptions({
    clientId   : "mi-client-id",
    oauthUri   : "https://auth.proveedor.com/oauth/authorize",  // NO "authUrl"
    tokenUri   : "https://auth.proveedor.com/oauth/token",      // NO "tokenUrl"
    redirectUri: "miapp://callback",
    scope      : "openid profile email"
});
oauth.authenticate({
    onSuccess: function(token) {
        appData.setGlobalMacro("##ACCESS_TOKEN##", token.access_token);
    },
    onError: function(e) {
        ui.showToast("Error OAuth2: " + e);
    }
});
```

---

### 5.11 Worker

Ejecuta funciones JavaScript en un hilo separado (worker), evitando bloquear la UI.

| Método | Descripción |
|---|---|
| `setCallback(fn)` | Define la **función a ejecutar** en el worker (es el callback, NO `setExecutor`). También se puede pasar al constructor: `new Worker(fn)`. |
| `setExecutor(name, [threadCount])` | Define un **nombre de pool de hilos** (string) compartido entre workers. Opcionalmente un `int` con el número de hilos. NO acepta una función. |
| `setSelfObject(obj)` | Define el objeto `self` disponible dentro del worker. |
| `start()` → `Future` | Lanza el worker. Devuelve un `Future` con el resultado. Lanza `IllegalStateException` si no se ha hecho `setCallback` y `setExecutor` antes. |

```js
// Forma recomendada: pasar la función al constructor
var worker = new Worker(function() {
    return calcularTotales();
});
worker.setExecutor("poolCalculo");           // nombre del pool (string)
var future = worker.start();
future.then(function(res) {
    self.setValue("MAP_TOTAL", res);
    ui.relayout();
});

// Forma equivalente con setCallback explícito
var worker2 = new Worker();
worker2.setCallback(function() { return calcularTotales(); });
worker2.setExecutor("poolCalculo", 2);       // 2 hilos en el pool
```

---

### 5.12 Animation

Animaciones programaticas sobre controles. API fluida (todos los setters devuelven la propia `Animation`).

| Método | Descripción                                                                              |
|---|------------------------------------------------------------------------------------------|
| `setTarget(propName)` | Nombre del prop a animar (String).                                                       |
| `setX(v)` / `setY(v)` / `setZ(v)` | Translación absoluta (no existe `setXY`).                                                |
| `setRelativeX(v)` / `setRelativeY(v)` / `setRelativeZ(v)` | Translacion relativa (1 parametro, no rango from/to).                                    |
| `setAlpha(v)`, `setRotation(grados)`, `setRelativeRotation(grados)` | Opacidad y rotacion.                                                                     |
| `setScaleX(v)` / `setScaleY(v)` / `setRelativeScaleX(v)` / `setRelativeScaleY(v)` | Escala.                                                                                  |
| `setWidth(v)` / `setHeight(v)` | Dimensiones.                                                                             |
| `setBackgroundColor(color)` / `setBgcolor(color)` | Color de fondo.                                                                          |
| `setCircularReveal(cx, cy, bReveal)` | Reveal circular UNICO (`bReveal`=true muestra, false oculta).                            |
| `setInterpolation(name)` | Tipo de interpolador (`BounceInterpolator`, etc.).                                       |
| `setDuration(ms)` | Duración en milisegundos.                                                                |
| `setRepeatCount(n)` / `setRepeatMode(mode)` | Repeticiones. `setRepeatMode` espera **int**: `1` = restart, `2` = reverse (NO strings). |
| `setStartCallback(fn)` / `setEndCallback(fn)` | Callbacks.                                                                               |
| `setEffect({effect})` | Efectos predefinidos (toma NativeObject con clave `effect`, NO un string suelto).        |
| `cancel()` / `stop(bCompleteFirst)` | `cancel()` cancela inmediatamente. `stop` requiere 1 boolean: `true` = completar la animación antes de cancelar, `false` = corte inmediato. |
| `start()` | Lanza la animación.                                                                      |

```js
var anim = new Animation();
anim.setTarget("MAP_BTN_ACEPTAR");
anim.setRelativeX(100);          // 1 parámetro (no from/to)
anim.setDuration(300);
anim.start();
```

