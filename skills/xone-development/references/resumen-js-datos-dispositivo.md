# Resumen por capa: JavaScript, datos y dispositivo

> Referencia de `xone-development`. Sale del `SKILL.md` para que las reglas
> duras quepan en una lectura por omisión (100 líneas).

## JavaScript

JavaScript ejecutado en bloques `<script>` de los `.xne` y en `functions.js`. No es JavaScript de navegador ni de Node: no hay módulos (`require`/`import`) y el código compartido es global. Los LLMs inventan sistemáticamente `self.lock()`, `ui.startChronometer()` y variantes de `setCircularReveal` que no existen.

**Objetos globales.** `self` (DataObject actual, alias `dataobject`) · `selfDataColl` (su colección, alias `datacollection`) · `ui` · `appData` (alias `appdata`) · `err` (alias `error`) · `user`.

Singletons de acceso directo, **sin `new`**: `$http`, `crypto`, `clipboard`, `deviceInfo`, `systemSettings`, `packageManager`, `biometricsManager`, `fingerprintManager`, `bleManager`, `sensorManager`, `paymentManager`, `pushMessage`, `appBroadcastManager`, `replica`, `live`, `smsService`, `serial`, `bluetoothSerial`, `bleSerial`, `ml`, `ai`.

Objetos que se crean con `new` (o `createObject`): `FileManager`, `GpsTools`, `SqlManager`, `IniParser`, `EncodingUtils`, `AndroidIntent`, `DeviceManager`, `WifiManager`, `BluetoothSerialPort`, `OAuth2`, `Worker`, `Animation`, `Socket`, `WebSocket`, `DebugTools`, `IrManager`, `SoundManager`, `VibrationManager`, `WearableConnection`, `AccountManager`, `XOneNFC`, `ImageDrawing`, `BarcodeGenerator`, `XOnePrinter`, `XOnePDF`, `XOneOCR`, `XOneSigner` y los demás de la lista canónica.

**Acceso a datos.** `self.CAMPO`, `self["CAMPO"]` y `self.getValue("CAMPO")` son válidos. **`self("CAMPO")` no existe**: la notación de `self` como función no es parte del motor.

**Controles.** `getControl(name, [dataObject])` es una **función nativa global** del motor (Rhino y V8), no un método de `ui`. Con un solo argumento usa la última ventana visible; con `dataObject`, la ventana asociada a ese objeto. Lanza error si el nombre está vacío, si el control no existe en la ventana destino, si no hay ventana o si el `dataObject` no es válido. Si el proyecto define su propia `function getControl(...)`, esa sombrea a la nativa en su ámbito local.

Los métodos específicos (`getValue`/`setValue`/`setMin`/`setMax`/`setStepSize` de un stepper, `getOtpValue`/`clearOtp`/`focusOtp` de un OTP, `startChronometer`/`stopChronometer`) son métodos **del control**, no de `ui`.

**Patrones críticos.** Modifica colecciones dentro de `unlock()` y devuelve el estado con `lock()` en `finally`. `lock()` activa el modo solo lectura: con la bandera activa, `clear()` y `loadAll()` son no-op. Las colecciones nacen desbloqueadas, pero el convenio es dejarlas bloqueadas tras operar para que código posterior no las mute por accidente.

- `lock()`/`unlock()` son métodos de la **colección**, nunca de `self`. Para bloquear la de un contents: `self.getContents("X").unlock()`.
- Navega con `startBrowse()` y `endBrowse()` en `finally`. Para contents: `getContents(nombre)` → `unlock` → `createObject`/`addItem` → `lock` → `saveAll`. Cierra siempre cursores y conexiones SQL. Un `WaitDialog` abierto va dentro de `try/finally`.
- En callbacks asíncronos (`$http`, WebSocket, GPS) guarda el contexto **antes** de la llamada: `var miSelf = self;`.
- Para crear objetos, el patrón preferido es `new NombreColeccion({ PROP: valor })` (el parámetro es opcional). `coll.createObject()` queda para contents anidados —vincula al padre— o cuando el nombre de la colección es dinámico.

**APIs web y sus equivalentes.**

| API web | Equivalente XOne |
|---|---|
| `document.getElementById("X")` | `ui.getView(self)["X"]` o `getControl("X")` |
| `window.location` / `window.history` | `ui.openEditView("Coll")`, `ui.getView(self).exit()` |
| `localStorage` | `appData.getGlobalMacro("##X##")` / `setGlobalMacro` |
| `sessionStorage` | `coll.setVariable`/`getVariable` o variables de empresa |
| `new XMLHttpRequest()` | `$http.get(url, request, success, error)` |
| `alert` / `confirm` / `prompt` | `ui.msgBox(msg, título, 0)` o `ui.showToast(msg)` |
| `navigator.geolocation.getCurrentPosition` | `ui.startGps({nodeName: "callbackgps"})` |
| `require()` / `import` | `<include file="..."/>` o `<script src="..."/>` en `<app>`; dinámico solo con `appData.loadIncludeFile(...)` |

## Datos e integración

**Modelo local.** La BD es `gestion.db`, normalmente bajo `bd/`, y las tablas suelen llevar prefijo `gen_` en minúsculas. Usa siempre `##PREF##`, nunca el prefijo literal. Cada registro replicable tiene `ROWID` como GUID hexadecimal de 32 caracteres sin guiones, declarado `type="T" fieldsize="32"`. Las colecciones con `objname`/`updateobj` generan tabla; si falta, regenera con `python3 -m xone_db_generator mi_proyecto --overwrite`.

Macros habituales: `##PREF##`, `##ENTID##`, `##USERID##`, `##NOW##`, `##NOW_DATE##`, `##NOW_TIME##`, `##FLD_CAMPO##`. Guarda y restaura filtros con `try/finally` y limpia la colección antes de recargar.

**Seguridad.**

- Parametriza SQL: `sqlManager.doRawQuery("… WHERE ID=?", id)`. Nunca concatenes entrada de usuario. Si un filtro exige texto, escapa `'` como `''`; valida los numéricos antes de concatenar.
- Cierra cursor y conexión en `finally`.
- HTTPS siempre, con `allowUnsafeCertificates: false` en producción. Pinning con `enablePinning`/`allowedRootCas`; mTLS con `privateKey`/`certificateChain`.
- No hardcodees ni registres credenciales. Cifra los tokens antes de guardarlos en macros globales y límpialos al cerrar sesión.
- Valida obligatorios, longitud, rangos y formato antes de `save()`: un obligatorio vacío produce `-8100`.

**Integración y réplica.** `$http` devuelve respuestas string y futures cancelables: parsea con `try/catch`, preserva `self` antes del callback y cancela la búsqueda anterior antes de lanzar otra. OAuth2 se usa con `new OAuth2()`. `replica.processReplicatorQueue` sincroniza por `ROWID`; la configuración programada vive en el evento `maintenance` de `Empresas`. El error `-11888` con `##EXIT##` cierra la pantalla y con `##EXITAPP##` cierra la aplicación.

Para almacenamiento clave-valor, el equivalente de `localStorage` es `appData.setGlobalMacro`/`getGlobalMacro`; para datos de sesión, variables de colección (`setVariable`/`getVariable`).

Los **eventos** implicados en la sincronización y el provisionamiento (`maintenance`, `sys-message` con sus códigos detallados, eventos de réplica) están documentados en [eventos de sistema, login y personalizados](references/xml-ui/eventos-sistema-login-y-personalizados.md), porque se declaran en el XML.

Para probar integraciones sin backend, usa `mock/http.json` con `xone-simulator` (skill `xone-review`).

## Dispositivo

`xone-simulator` reproduce muchas capacidades con `mock/device.json` (skill `xone-review`).

- Pide y comprueba permisos antes de GPS, cámara, micrófono o biometría. Los permisos se solicitan con `systemSettings.requestPermissions`, que devuelve un future. En el simulador se conceden automáticamente.
- Declara los permisos que use la app en el nodo `<permissions>`: `location-foreground`, `location-background`, `camera`, `notifications`, `contacts`…
- GPS: `ui.startGps()` antes de leer la colección de GPS; recórrela con `startBrowse`/`endBrowse`, comprueba `STATUS == 1` y que `LONGITUD` no esté vacío. `ui.checkGpsStatus()` devuelve `0` sin hardware, `1` solo GPS, `2` solo redes, `3` ninguno y `4` GPS y redes.
- La colección de GPS (`GPSColl`/`GpsCollection`) **la declara el proyecto** con el connector GPS: no es built-in de XOne.
- En callbacks de cámara, GPS y escáner conserva `self` antes de la operación y refresca solo los campos modificados.
- Cierra Bluetooth y WebSocket al terminar. Prefiere `ui.executeActionAfterDelay()` (segundos) a una espera bloqueante.
- `biometricsManager` es el singleton actual; `fingerprintManager` es legacy.
- La firma se hace con `<prop type="DR">` (`stroke-color`, `stroke-width`, `apply-format-to-file`, `ui.saveDrawing`, `ui.clearDrawing`). `type="IMG" readonly="false"` es la forma **obsoleta**.
- En archivos, comprueba `fileExists(...) === 0`; `saveFile(..., false)` sobrescribe.

Del registro de GPS se leen `LATITUD`, `LONGITUD`, `ALTITUD`, `VELOCIDAD`, `RUMBO`, `FGPS`, `HGPS`, `STATUS`, `SATELITES`, `FUENTE`, `PRECISION` y el campo `FAKE`. Para cálculos hay `GpsTools` (`distanceBetweenCoordinates`, `getPositionFromAddress`, encode/decode, `simplifyPolyline`, `addExifLocationToFile`, `routeTo`).

Los métodos de los controles de cámara, vídeo, dibujo y escáner están en [métodos de los controles](references/javascript/metodos-de-los-controles.md). Los atributos XML de esos props, en [atributos-prop.md](references/xml-ui/atributos-prop.md).
