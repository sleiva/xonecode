# XOne JavaScript — Singletons globales

> Fuente: `xone/v2/xone-help-docs/topics/06-javascript-runtime-objects.md` §6. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §6 catálogo completo y API de los singletons: crypto, clipboard, deviceInfo, systemSettings, packageManager, biometricsManager/fingerprintManager, bleManager, bleSerial, sensorManager, paymentManager, pushMessage, appBroadcastManager, replica, live, smsService, serial/bluetoothSerial, ml y ai

---

## 6. Singletons Globales

Los siguientes objetos son **singletons** registrados automáticamente en el scope global. Se acceden directamente por su nombre, **sin `new` y sin `createObject`**. Llamar `new` o `createObject` con estos nombres lanza error o devuelve null.

### 6.1 Catálogo completo

Registrados en `RhinoJavascriptEngine.addReservedObjects()`:

| Singleton | Proposito | Doc detallada |
|-----------|-----------|---------------|
| `$http` | Cliente HTTP con Futures | Tópico 03 §5 |
| `crypto` | Hashing (MD5, SHA), cifrado simetrico/asimetrico | §6.2 |
| `clipboard` | Portapapeles del dispositivo | §6.3 |
| `deviceInfo` | Info hardware: batería, red, sensores físicos | §6.4 |
| `systemSettings` | Ajustes del sistema: brillo, permisos, MDM | §6.5 |
| `packageManager` | Consulta de apps instaladas | §6.6 |
| `biometricsManager` | Biometria moderna (huella, face ID) | §6.7 |
| `fingerprintManager` | Huella legacy (deprecado) | §6.7 |
| `bleManager` | Bluetooth Low Energy | §6.8 |
| `sensorManager` | Sensores físicos (acelerometro, giroscopio, etc.) | §6.9 |
| `paymentManager` | Pasarelas de pago: Google Pay, Redsys, Smartphone TPV (Comercia), BBVA Cobros | §6.10 |
| `pushMessage` | Mensajeria push (FCM) | §6.11 |
| `push` | Alias legacy de pushMessage | §6.11 |
| `appBroadcastManager` | Broadcasts entre apps XOne | §6.12 |
| `replica` | Sistema de replica/sincronización | §6.14 |
| `live` | Sistema de Live Update | §6.15 |
| `smsService` | Envio/recepcion SMS | §6.16 |
| `serial` | Puerto serie generico | §6.17 |
| `bluetoothSerial` | Puerto serie via Bluetooth | §6.17 |
| `bleSerial` | Puerto serie via BLE | §6.17 |
| `efiDiagItv` | Diagnostico EFI / ITV (Itron) | §6.18 |
| `ml` | Machine Learning generico (TensorFlow Lite) | §6.19 |
| `ai` | IA generativa | §6.20 |

### 6.2 crypto

Hashing y criptografía. **Casi todos los métodos toman un único `NativeObject` como argumento** (NO strings sueltos): `{ data: "...", outputFormat: "hex"|"base64"|"buffer", key?: "hmacKey", output?: "fichero.bin" }`.

Métodos disponibles (57): hashes (`md5`, `sha1`, `sha224`, `sha256`, `sha384`, `sha512`), codificación (`toBase64`/`fromBase64`, `toBase58`, `toBase45`, `toBase32`), compresión (`inflate`, `deflate`), keystore (`getCertificate`, `getRsaPublicKey`/`getRsaPrivateKey`, `getEcPublicKey`/`getEcPrivateKey`, `installKeyPairOnKeyStore`, etc.), COSE/CBOR (`decodeCose`/`decodeCbor`/`encodeCbor`/`validateCose`), random (`getRandomString`, `getRandomInt`, `getRandomDouble`, `getNewUuid`), criptografía (`hash`, `sign`, `encrypt`, `decrypt`, `derivePassword`, `generateKeyPair`, `generateAesKey`/`installAesKey`/`getAesKey`), JWT (`isJwtSignatureValid`), BD (`getDatabaseKey`), checksum (`getChecksum`).

```js
// FIRMA CORRECTA: objeto con `data` y `outputFormat`
var hashHex    = crypto.md5({ data: "texto", outputFormat: "hex" });
var hashB64    = crypto.sha256({ data: "texto", outputFormat: "base64" });
var hashBuffer = crypto.sha512({ data: "texto" });   // outputFormat por defecto "buffer"

// HMAC: añadir la clave en `key`
var hmac = crypto.sha256({ data: "texto", key: "miSecretoHmac", outputFormat: "hex" });

// Volcar a fichero
crypto.sha256({ data: "texto", output: appData.getFilesPath() + "/hash.bin" });

// Otros patrones (mismo objeto-argumento, claves según cada método)
var nuevoUuid = crypto.getNewUuid();             // sin args
var num       = crypto.getRandomInt({ min: 0, max: 100 });
var b64       = crypto.toBase64({ data: "hola", outputFormat: "string" });
```

> **AVISO**: `crypto.md5("texto")` con un String literal **lanza `ClassCastException`**. Siempre pasar el objeto.

### 6.3 clipboard

```js
clipboard.setText(self.getValue("CODIGO"));
ui.showToast("Código copiado: " + clipboard.getText());
```

### 6.4 deviceInfo

| Método | Descripción |
|---|---|
| `getBatteryLevelPercentage()` → `int` | Porcentaje de batería. |
| `getBatteryTemperature()` → `float` | Temperatura de batería (°C). |
| `getMobileNetworkSignalStrength()` → `int` | Intensidad de señal móvil. |
| `getConnectedMobileNetworkType()` → `String` | Tipo de red (`"4G"`, `"5G"`, `"WiFi"`...). |
| `getOpenGlVersion()` → `double` | Versión OpenGL ES. |
| `isArCompatible()` → `boolean` | Compatibilidad ARCore. |

```js
appData.writeConsoleString("Bateria: " + deviceInfo.getBatteryLevelPercentage() + "%");
```

### 6.5 systemSettings

| Método | Descripción |
|---|---|
| `isRunningInMdm(...)` → `boolean` | `true` si la app está gestionada por MDM. |
| `isPasswordSecured()` → `boolean` | Dispositivo con PIN/password configurado. |
| `getBrightness()` → `double` | Brillo de la pantalla, rango **0 - 100**. |
| `setBrightness(value)` → `boolean` | Cambia el brillo. Acepta 0 - 100 (se clampa fuera de rango). |
| `getBrightnessMode()` / `setBrightnessMode(mode)` | Modo de brillo: `"manual"` o `"automatic"`. |
| `getDeviceId()` → `String` | Identificador único del dispositivo. |
| `getHardwareIds()` → `Map` | Mapa con todos los identificadores hardware. |
| `requestPermissions(...)` → `Future` | Solicita permisos en runtime. |
| `getApiLevel()` / `getAndroidVersion()` | API level (`Build.VERSION.SDK_INT`) y versión Android (string). |
| `getManufacturer()` / `getDeviceModel()` / `getBrand()` → `String` | Fabricante, modelo y marca del dispositivo. Equivalen a las macros `##DEVICE_MANUFACTURER##` / `##DEVICE_MODEL##`. |
| `getMemoryLevel()` → `String` | Nivel de presión de memoria del SO. Ver §8.11b. |
| `getInternalFreeSpace()` / `getInternalTotalSpace()` → `long` | Espacio libre / total (en bytes) del almacenamiento **interno** (la partición de datos donde residen la app y su BD). |
| `getExternalFreeSpace()` / `getExternalTotalSpace()` → `long` | Espacio libre / total (en bytes) del almacenamiento **externo** principal. Devuelven `0` si no está montado. |

Catálogo completo de métodos por área (brillo, red, batería, permisos, memoria, hardware, rutas, MDM, XOneLive, Intune, Analytics, etc.) en 03d-js-createobject.md §8.11b.

```js
if (systemSettings.getBrightness() < 50) systemSettings.setBrightness(80);
```

### 6.6 packageManager

Métodos disponibles: `getPackageInfo(pkg)`, `isInstalled(pkg)`, `getInstalledPackages()`, `getInstalledPackageNames()`, `installPackage(...)`, `getRunningApps()`, `isPackageInstallPermissionGranted()`, `isAppSuspended(pkg)`, `getInstalledModules()`, `getAllPermissionGroups()`, `getPermissionsByGroup(group)`, `getPackageName()`, `getInstallerPackageName(pkg)`.

```js
// getInstalledApps() NO existe — usar getInstalledPackages() o getInstalledPackageNames()
var apps    = packageManager.getInstalledPackages();
var nombres = packageManager.getInstalledPackageNames();
var isInstalled = packageManager.isInstalled("com.empresa.otra");
```

### 6.7 biometricsManager / fingerprintManager

- **`biometricsManager`** — API moderna (preferida). Huella, face ID, firma biometrica.
- **`fingerprintManager`** — API legacy. Usar `biometricsManager` en nuevos desarrollos.

| Método | Descripción |
|---|---|
| `isHardwareAvailable()` → `boolean` | Hardware biometrico presente. |
| `hasEnrolledFingerprints()` → `boolean` | Hay huellas registradas. |
| `launch()` | Lanza el dialogo de autenticación. |
| `listen()` / `stopListening()` | Escucha continua de eventos biometricos. |

```js
if (biometricsManager.isHardwareAvailable() && biometricsManager.hasEnrolledFingerprints()) {
    biometricsManager.launch();
}
```

### 6.8 bleManager

```js
bleManager.startScan({
    onDeviceFound: function(device) {
        appData.writeConsoleString("BLE: " + device.name + " " + device.address);
    }
});
```

### 6.8b bleSerial (BleSerialPort)

Cliente Bluetooth Low Energy basado en el manager Telit, expuesto como **singleton** (acceso directo `bleSerial`, sin `new`). Solo accesible desde JavaScript. Requiere API 18+.

| Método | Parámetros | Retorno | Descripción |
|---|---|---|---|
| `setDebugMode(enabled)` | 1 boolean | `void` | Activa logs verbosos en el manager Telit. |
| `startLeScan(callback, timeout?)` o `startLeScan({callback, timeout?})` | 1..2 args | `void` | Inicia escaneo BLE. `callback(name, macAddress)` se invoca con el primer dispositivo encontrado y entonces el scan se detiene. `timeout` en ms (0 = sin límite). |
| `stopLeScan()` | ninguno | `void` | Detiene el escaneo. |
| `connect(macAddress, timeoutMs?)` o `connect({macAddress, timeout?, onConnected?, onError?})` | 1..4 args | `void` | Conecta al dispositivo BLE. Sin callbacks es síncrono; con `onConnected`/`onError` es asíncrono. Timeout por defecto 10000 ms. |
| `disconnect()` | ninguno | `void` | Encola un `DisconnectRequest` en el manager. |
| `write(value)` | 1 (String o Number) | `void` | Envía a la característica de escritura. Strings vía `writeString`; números vía `writeUint8`. |
| `setNotificationCallback(uuid, callback)` | 2 (String, Function) | `void` | Suscribe notificaciones de la característica `uuid`; el callback recibe el String recibido. Habilita notificaciones automáticamente. |
| `readString(callback?)` | 0..1 args | `String` | Lee un String de la característica de lectura (trim de `\r\n` final). |
| `readUint8(callback?)` | 0..1 args | `int` | Lee un byte como int sin signo. |

```js
// bleSerial es singleton: NO se hace `new BleSerialPort()`
bleSerial.startLeScan(function(name, mac) {
    appData.writeConsoleString("Encontrado " + name + " (" + mac + ")");
    bleSerial.connect({
        macAddress: mac,
        timeout   : 8000,
        onConnected: function() {
            bleSerial.setNotificationCallback(
                "0000ffe1-0000-1000-8000-00805f9b34fb",
                function(data) { appData.writeConsoleString("RX: " + data); }
            );
            bleSerial.write("AT\r\n");
        },
        onError: function(status) { appData.writeConsoleString("Error " + status); }
    });
}, 15000);
```

### 6.9 sensorManager

| Método | Descripción |
|---|---|
| `getSensorList()` → `Object[]` | Lista de sensores disponibles. |
| `getSensor(type)` | Obtener un sensor concreto. |
| `getDisplayOrientation()` → `int` | Orientacion de la pantalla en grados. |
| `listen({type, onSensorChanged, onSensorAccuracyChanged?, sampling?})` | Inicia escucha. **Toma 1 NativeObject**, NO `(sensor, callback)`. |
| `stopListening({type})` o `stopListening()` | Si pasas `{type}` desuscribe ese sensor; sin argumento (o con string) desuscribe **TODOS**. |
| `listenForFalls({onFallDetected, sensitivity?, sampling?})` | Activa detección de caídas. Toma 1 NativeObject, no una funcion suelta. |
| `stopListeningForFalls()` | Desactiva. |

```js
// Firma correcta: objeto de configuración con clave `type` y callback `onSensorChanged`
sensorManager.listen({
    type: "accelerometer",
    onSensorChanged: function(event) {
        appData.writeConsoleString("X:" + event.x + " Y:" + event.y + " Z:" + event.z);
    }
});
// sensorManager.stopListening({ type: "accelerometer" }); // sólo ese sensor
```

### 6.10 paymentManager

Pasarelas de pago. Singleton global: se obtiene un proveedor concreto con
`paymentManager.getProvider(nombre)` y se opera sobre él. Proveedores disponibles: `"redsys"`,
`"googlepay"`, `"tpv_comercia"` (Smartphone TPV de Comercia / Global Payments) y `"bbva_cobros"`
(BBVA Cobros).

Patrón común a todos: `setupProvider({...})` una vez para configurar, y después las operaciones,
que reciben callbacks **asíncronos** `onResult(self, r)` y `onError(self, e)` (el resultado llega
cuando la pasarela responde, no en la misma línea).

#### Proveedor "tpv_comercia" (Smartphone TPV — App2App)

Convierte el propio móvil en datáfono por NFC. No usa ninguna librería de pago: delega en una
**app externa** de Comercia (`com.comercia.app`), que debe estar instalada; el framework se
comunica con ella y entrega la respuesta a los callbacks.

**Requisitos:** Android 9 o superior, dispositivo con NFC, la app de Smartphone TPV instalada, y el
APK del comercio firmado con una clave cuyo SHA‑256 esté dado de alta en la whitelist de Comercia
(paso de alta previo imprescindible; sin él la comunicación se rechaza).

**Configuración** (`setupProvider`, una vez) — los valores de registro los **asigna Comercia** en
el alta del comercio/terminal:

| Parámetro | Descripción |
|---|---|
| `merchantId` | Número de comercio (obligatorio) |
| `terminalId` | Número de terminal (obligatorio) |
| `activationCode` | Código de activación (obligatorio) |
| `packageName` | Paquete de la app externa (opcional; por defecto `com.comercia.app`) |
| `appName` | Nombre visible de la app externa (opcional) |

**Operaciones** (todas admiten `onResult`/`onError`):

| Método | Qué hace |
|---|---|
| `payment({...})` | Venta o devolución. `transactionType`: `"200"` venta (por defecto), `"300"` devolución (requiere `transactionId`). `amount` en la unidad menor (p.ej. `"1400"` = 14,00 €). Opcionales: `orderId`, `configParameters` (visibilidad de botones: `drawerMenu`, `salesButton`, `voidButton`, `refundButton`, `historyButton`, `settingsButton`, `tipScreen`, `userPhoto`), `customMessage` |
| `getLastTransaction({...})` | Consulta la última transacción |
| `gotoList({...})` | Abre un listado. `listType`: `"3000"` devoluciones, `"5000"` historial |
| `onlyRegister({...})` | Registra el terminal sin realizar cobro |
| `manualSettlement({...})` | Cierre / liquidación manual |

`requestPaymentReference` no aplica a este proveedor (no hay pre‑autorización por referencia).

En `onResult` de un pago llega un objeto con `transactionStatus` (`"success"`/`"decline"`),
`transactionId`, `amount`, `maskedPan`, `refusalCode`, `transactionDate`, `transactionType`…; en
`onError`, el código/mensaje `a2aCode`/`a2aMessage` (o el detalle de la operación declinada).

```js
var tpv = paymentManager.getProvider("tpv_comercia");
tpv.setupProvider({
    merchantId: "329811087",
    terminalId: "00000025",
    activationCode: "000000"
});
var miSelf = self;                               // preservar self para el callback asíncrono
tpv.payment({
    amount: "1400",                              // 14,00 EUR (unidad menor)
    transactionType: "200",                      // venta
    orderId: "" + (new Date()).getTime(),
    configParameters: { refundButton: "1", tipScreen: "0" },
    onResult: function (s, r) { miSelf.MAP_RESP = r.transactionStatus + " " + r.transactionId; ui.refresh("MAP_RESP"); },
    onError:  function (s, e) { miSelf.MAP_RESP = "Error: " + e.a2aMessage; ui.refresh("MAP_RESP"); }
});
```

#### Proveedor "bbva_cobros" (BBVA Cobros — App2App)

Más simple que `tpv_comercia`: lanza la app externa de BBVA Cobros por intent y recibe el resultado
por broadcast; sin servicio, sin handshake y **sin credenciales** que configurar (BBVA Cobros ya va
contratado en el dispositivo, con el acceso automático activo).

**Importante:** el importe va en **euros** (p.ej. `"12.50"` = 12,50 €), **no** en la unidad menor
(al contrario que `tpv_comercia`).

**Operaciones** (todas admiten `onResult`/`onError`):

| Método | Qué hace |
|---|---|
| `payment({...})` | Venta. `amount` en euros (obligatorio) |
| `refund({...})` | Devolución. `amount` (euros) + `idRTS` (el RTS de la venta original), obligatorios |
| `getFuc({...})` | Consulta el FUC y el terminal (devuelve `id_fuc`, `id_terminal`) |

No necesita `setupProvider` (sin credenciales ni configuración; el paquete de la app de BBVA es
fijo). `requestPaymentReference` no aplica.

La respuesta trae `SmartPay_Payment_Result` (`"OK"`/`"KO"`/`"UNKNOWN"`; `OK` dispara `onResult`, el
resto `onError`), `Amount`, `IdRTS`, `id_terminal`, `id_fuc`.

```js
var bbva = paymentManager.getProvider("bbva_cobros");
var miSelf = self;
bbva.payment({
    amount: "12.50",                             // euros, NO céntimos
    onResult: function (s, r) { miSelf.MAP_RESP = r.SmartPay_Payment_Result + " RTS:" + r.IdRTS; ui.refresh("MAP_RESP"); },
    onError:  function (s, e) { miSelf.MAP_RESP = "KO: " + e.SmartPay_Payment_Result; ui.refresh("MAP_RESP"); }
});
// Devolución con el RTS de la venta:  bbva.refund({ amount: "12.50", idRTS: "0750022...", onResult: ..., onError: ... });
// Consulta del FUC:                   bbva.getFuc({ onResult: function (s, r) { /* r.id_fuc, r.id_terminal */ } });
```

### 6.11 pushMessage / push

Mensajeria push via Firebase Cloud Messaging.

Métodos disponibles: `getToken()`, `getFirebaseInstanceId()`, `sendMessageFirebase(...)`.

> **Nota**: NO existe `pushMessage.subscribe(topic)`. La suscripcion a topics se gestiona en el backend o registrando el token mediante la consola de Firebase. El cliente solo expone el token.

```js
var token = pushMessage.getToken();              // obtener token FCM
var instanceId = pushMessage.getFirebaseInstanceId();
// pushMessage.sendMessageFirebase(...);          // envio device-to-device
```

### 6.12 appBroadcastManager

Broadcasts entre diferentes apps XOne instaladas en el dispositivo.

### 6.14 replica

Sistema de replicación / sincronización XOne.

### 6.15 live

Sistema de Live Update — gestion de actualizaciones en caliente del proyecto.

### 6.16 smsService

Envío y recepción de SMS. Requiere `<permission name="sms"/>` dentro del nodo `<permissions>` de la coll.

### 6.17 serial / bluetoothSerial / bleSerial

Puertos serie genericos:
- `serial` — Serie USB / RS232.
- `bluetoothSerial` — Serie sobre Bluetooth clasico.
- `bleSerial` — Serie sobre BLE.

### 6.18 efiDiagItv

Diagnostico EFI / ITV (especifico de equipos Itron).

### 6.19 ml

API de Machine Learning generico (TensorFlow Lite).

### 6.20 ai

IA generativa **local** (LLM on-device): ejecuta modelos de lenguaje dentro del dispositivo, sin servidor. Singleton global. API extensa (descarga de modelos, carga, generación, chat con streaming, herramientas, skills, multimodal imagen/audio). Documentación completa en su propio archivo: 08-objeto-ai.md.

