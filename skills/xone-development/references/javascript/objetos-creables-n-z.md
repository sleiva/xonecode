# XOne JavaScript — Objetos creables (Socket a XOneSigner) y lista canónica

> Fuente: `xone/v2/xone-help-docs/topics/06-javascript-runtime-objects.md` L822–1197. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §5.13 Socket/WebSocket · §5.14 DebugTools · §5.15 IrManager · §5.16 SoundManager · §5.17 VibrationManager · §5.18 WearableConnection · §5.19 AccountManager · §5.20 XOneNFC · §5.21 ImageDrawing · §5.22 BarcodeGenerator · §5.23 XOnePrinter · §5.24 XOnePDF · §5.25 XOneOCR · §5.26 XOneSigner · §5.28 AccessibilityManager · §5.27 lista completa de creables

---

### 5.13 Socket / WebSocket

- **`Socket`** — Cliente socket TCP/IP bruto. Métodos: `setProtocol`, `setAddress`, `setPort`, `setTimeout`, `connect`, `send`, `receive`, `receiveAll`, `disconnect`.
- **`WebSocket`** — Cliente WebSocket (`ws://` y `wss://`), soporta certificados y subprotocolos. La configuración va en el **constructor**; los únicos métodos del objeto son `send(data)` y `close()`.

```js
// Toda la configuración se pasa al constructor (NO existe ws.connect())
var ws = new WebSocket({
    url: "wss://servidor.empresa.com/ws",
    onMessage: function(msg) { console.log("WS recibido: " + msg); },
    onError:   function(e)   { console.log("WS error: " + e); }
});
ws.send("hola");
// ws.close();
```

---

### 5.14 DebugTools

Herramientas de envío de información de depuración (logs, BD) al servidor de soporte.

Métodos: `getDeviceId()`, `getLog()`, `sendLog()`, `sendDatabase()`, `sendReplicaDebugDatabase()`, `sendReplicaFilesDatabase()`.

```js
var debug = new DebugTools();
debug.sendLog();             // Envia el logcat al servidor de soporte
// debug.sendDatabase();     // Envia la BD principal
// debug.sendReplicaDebugDatabase();
// debug.sendReplicaFilesDatabase();
// var sId = debug.getDeviceId();
// var sLog = debug.getLog();
```

---

### 5.15 IrManager

Control de infrarrojos (IR blaster) para dispositivos compatibles.

```js
var ir = new IrManager();
ir.transmit(38000, [9000, 4500, 560, 560]);
```

---

### 5.16 SoundManager

Reproducción y gestion de audio (alternativa a métodos de `ui`).

```js
var snd = new SoundManager();
snd.play(appData.getFilesPath() + "/alerta.mp3");
```

---

### 5.17 VibrationManager

Control de vibracion del dispositivo.

```js
var vib = new VibrationManager();
vib.vibrate([0, 200, 100, 200]);   // patron pausa/vibracion (ms)
```

---

### 5.18 WearableConnection

Comunicación con dispositivos Wear OS emparejados.

Métodos disponibles: `setCallbacks(callbacks)`, `removeCallbacks()`, `send(path, data)`.

```js
var wear = new WearableConnection();
wear.setCallbacks({
    onMessageReceived: function(msg) { /* ... */ }
});
wear.send("/path/notificacion", "Pedido listo");   // método se llama send, no sendMessage
```

---

### 5.19 AccountManager

Gestion de cuentas de Android (Google, Microsoft, etc.) almacenadas en el dispositivo.

Métodos disponibles: `getAccounts()` (sin argumentos, devuelve TODAS), `getAccountsByType(type)`, `chooseAccount(...)`, `addAccount(...)`, `getUserData(account, key)`, `getAuthToken(...)`, `getAuthenticatorTypes()`.

```js
var am = new AccountManager();
var todas    = am.getAccounts();                  // todas las cuentas del dispositivo
var google   = am.getAccountsByType("com.google");// filtrar por tipo (NO usar getAccounts con argumento)
```

---

### 5.20 XOneNFC

Lectura y escritura de tags NFC (NDEF, Mifare Classic/Ultralight), emulación HCE, DNI electrónico y operaciones MDM. Requiere `<permission name="nfc"/>` dentro del nodo `<permissions>` de la coll y dispositivo con hardware NFC. Implementación en `xonenfc_lib`. Todos los métodos devuelven la propia instancia (encadenable).

**Patrón de callbacks de las operaciones `*Async`**: estas operaciones reciben el **nombre del nodo XML** a ejecutar como callback (un String), NO un objeto con `onSuccess`/`onError`. El framework invoca ese nodo cuando se detecta el tag y completa la operación.

| Método | Parámetros | Descripción |
|---|---|---|
| `isAvailable()` | ninguno | `true` si el dispositivo tiene chip NFC. |
| `isEnabled()` | ninguno | `true` si NFC está activado. |
| `getAntennaInfo()` | ninguno | NativeObject con info de la antena NFC (nullable). |
| `clearAllPendingOperations()` | ninguno | Cancela todas las operaciones asíncronas pendientes. |
| `setOnTagDiscoveredCallback(callback)` o `setOnTagDiscoveredCallback({callback, window?})` | 1 (Function o NativeObject) | Registra callback que recibe el tag detectado. Si es objeto, la clave es **`callback`** (no `onTagDiscovered`); `callback` puede ser una función o el nombre de un nodo XML. Pasar `null` desactiva el reader. |
| `readNdefMessageAsync(callbackName)` | 1 String | Lee mensaje NDEF del próximo tag detectado. `callbackName` es el nombre del nodo XML a ejecutar al leer. |
| `writeNdefMessageAsync(data, callbackName)` | 2 Strings | Escribe `data` como mensaje NDEF al próximo tag. |
| `formatNdefTagAsync(callbackName)` | 1 String | Formatea un tag virgen como NDEF. |
| `writeNdefFormatableAsync(data, callbackName)` | 2 Strings | Escribe NDEF en un tag formatable. |
| `readMifareClassicAsync(blocks, callbackName, [keyMapJson])` | 2-3 args | Lee los bloques indicados (array de ints) del próximo tag Mifare Classic. `keyMapJson` opcional: ruta a un fichero JSON con las claves A/B por sector. |
| `writeMifareClassicAsync(blocks, data, callbackName, [keyMapJson])` | 3-4 args | Escribe `data` (array) en los `blocks` (array) indicados. |
| `readMifareUltralightAsync(pageIndex, callbackName)` | 2 args (int, String) | Lee desde `pageIndex` el próximo tag Mifare Ultralight/NTAG. |
| `writeMifareUltralightAsync(data, callbackName)` | 2 args (array, String) | Escribe páginas Mifare Ultralight. |
| `startNdefTagEmulation({ndefType, ndefData, oneShot?, password?, readAllowed?, writeAllowed?, size?})` | 1 NativeObject | Inicia emulación HCE como tag NDEF. `ndefType` ∈ `"text"`/`"uri"`. |
| `stopNdefTagEmulation()` | ninguno | Detiene la emulación HCE. |
| `enableDnieReader({onDnieRead, onDnieReadError, onProgressUpdated, authMode?, canNumber? \| mrz? \| (documentNumber+dateOfBirth+dateOfExpiry), readEfcom?, readProfileData?, readUserImage?, readSignatureImage?, readAuthenticationCertificate?, readSignatureCertificate?, enablePassiveAuthentication?, trustedCountries?, minimumSessionKeySize?, password?, timeout?})` | 1 NativeObject | Activa el lector de DNI electrónico. **Obligatorios**: `onDnieRead`, `onDnieReadError` y la clave de acceso (CAN o MRZ). `authMode` por defecto `"PACE"`. `minimumSessionKeySize` exige que la clave de sesión negociada tenga al menos esos bits (`112`, `128`, `192` o `256`); sin especificar se acepta la variante más fuerte que ofrezca el documento. `enablePassiveAuthentication` (por defecto `true`) comprueba que los datos del documento están firmados por el país emisor y, si algo no cuadra, aborta la lectura por `onDnieReadError` sin entregar ningún dato; se reconocen los emisores de más de cien países, y para leer un documento de un emisor que no esté hay que desactivarla. `trustedCountries` acota los emisores que se admiten a una lista de códigos de país separados por comas, por ejemplo `"ES"` para no dar por bueno más que el documento español. |
| `disableDnieReader()` | ninguno | Desactiva el lector de DNIe. |
| `installMdm({method, ...})` | 1 NativeObject | Provisiona MDM via NFC. `method` ∈ `"any"` (default), `"android_beam"`, `"emulate_tag"`. |
| `generateMdmQrCode({targetFile, ...})` | 1 NativeObject | Genera QR de enrolamiento MDM en `targetFile` (640×480 px). |
| `writeMdmTag({...})` | 1 NativeObject | Escribe tag NFC con configuración MDM. |

```js
var nfc = new XOneNFC();
if (!nfc.isAvailable() || !nfc.isEnabled()) {
    ui.msgBox("NFC no disponible o desactivado");
    return;
}

// Escuchar tags: el callback puede ser una función o el nombre de un nodo XML
nfc.setOnTagDiscoveredCallback({
    callback: function(tag) {
        appData.writeConsoleString("Tag detectado: " + tag.getHexId());
    }
});

// O directamente la función:
// nfc.setOnTagDiscoveredCallback(function(tag) { ... });

// Leer NDEF: callbackName es el nombre del nodo XML que se ejecutará
nfc.readNdefMessageAsync("onTagRead");

// Escribir NDEF: data + nombre del nodo callback
nfc.writeNdefMessageAsync("Hola mundo", "onTagWritten");

// Leer DNI electrónico con CAN (claves obligatorias: onDnieRead + onDnieReadError + CAN o MRZ)
nfc.enableDnieReader({
    canNumber       : "123456",
    onDnieRead      : function(result) {
        appData.writeConsoleString("DNI: " + result.getDniNumber());
    },
    onDnieReadError : function(err) { ui.showToast("Error DNIe: " + err); },
    onProgressUpdated: function(progress, message) { /* progreso 0-100 */ },
    readUserImage   : true,
    readProfileData : true,
    // Se comprueba que el documento lo firmó el país emisor salvo que se desactive; acotar los
    // emisores admitidos es lo que impide dar por bueno un pasaporte extranjero auténtico
    trustedCountries : "ES"
});
```

---

### 5.21 ImageDrawing

Manipulación programatica de imágenes: cargar imagen base, anadir texto/superpuestos, rotar, censurar caras.

Métodos disponibles: `create(...)`, `setBackground(path)`, `setBackgroundColor(color)`, `setFont(name)`, `setFontSize(size)`, `setFontColor(color)`, `setFontStyle(style)`, `setGrayscale(bool)`, `addTextSetXY(text, x, y)`, `addImageSetXY(path, x, y)`, `getImageInfo(path)`, `save(path)`, `rotate(grados)`, `copyExifMetadata(src, dst)`, `censorFaces(path)`, `extractFace(path)`.

```js
// IMPORTANTE: setBackground exige que el lienzo este creado con create(w, h).
// Sin create() previo lanza IllegalArgumentException("Width not set").
var img  = new ImageDrawing();
var info = img.getImageInfo(appData.getFilesPath() + "/foto.jpg");
img.create(info.getWidth(), info.getHeight());              // dimensionar lienzo PRIMERO
img.setBackground(appData.getFilesPath() + "/foto.jpg");    // cargar imagen base (NO existe img.load)
img.setFontSize(32);
img.setFontColor("#FF0000");
img.addTextSetXY("ENVIADO", 50, 50);                        // anadir texto (NO existe img.drawText)
img.save(appData.getFilesPath() + "/foto_marcada.jpg");
```

---

### 5.22 BarcodeGenerator

Generación de códigos de barras 1D (EAN, Code128, UPC, etc.) y 2D (incluye QR).

La configuración va por **setters previos**; `generate()` toma **solo el texto a codificar** (un único String), NO un objeto.

```js
var bc = new BarcodeGenerator();
bc.setType("qrcode");                                       // "qrcode", "code128", "ean13", etc.
bc.setResolution(300, 100);                                  // ancho x alto en px
bc.setDestinationFile(appData.getFilesPath() + "/barcode.png");
// Opcionales: setMargin, setRotation, setTextFontSize, setLabelVisibility, setErrorCorrectionLevel
bc.generate("1234567890");                                   // SOLO el texto (NO un objeto)
```

---

### 5.23 XOnePrinter

Impresion en impresoras Bluetooth, USB o de red. Soporta ESC/POS y PDF.

La configuración va por **setters previos**; `connect()` solo acepta un número de reintentos opcional.

```js
var printer = new XOnePrinter();
printer.setDriver("zebra");                                  // o "esc-pos", "datamax", etc.
printer.setMacAddress("AA:BB:CC:DD:EE:FF");                  // o setIpAddress(...) + setPort(...)
printer.connect();                                            // sin argumentos (o connect(3) para 3 reintentos)
printer.print("Ticket de venta\n");                          // print, NO printText
printer.printLineCentered("--------------");
printer.print("Total: 25,00€");
printer.cutPaper();                                           // cutPaper, NO cut
printer.disconnect();
```

---

### 5.24 XOnePDF

Generación de documentos PDF. La API usa `create(path)` + setters + `addText*`/`addImage*` + `newPage()` + `close()` (NO existen `addPage`/`drawText`/`drawImage`/`save`).

```js
var pdf = new XOnePDF();
pdf.create(appData.getFilesPath() + "/factura.pdf");         // ruta de salida
pdf.open();
pdf.setFont("Helvetica");
pdf.setFontSize(12);
pdf.setFontColor("#000000");
pdf.addTextSetXY("Factura N." + self.getValue("NUM"), 50, 50);  // addTextSetXY (NO drawText)
pdf.addImageSetXY(appData.getFilesPath() + "/logo.png", 400, 30, 0.5, 0.5);  // addImageSetXY (NO drawImage)
// pdf.newPage();    // para pagina nueva (NO addPage)
pdf.close();                                                  // close (NO save)
// pdf.launchPDF();  // opcional, abre el PDF generado
```

**Leer / extraer texto de un PDF existente.** `extractText(rutaPdf)` devuelve el texto plano del PDF; `extractTextToFile(rutaPdf, rutaTxt)` lo vuelca a un `.txt` en UTF-8 y devuelve la ruta del fichero generado. Solo extraen la **capa de texto**: un PDF escaneado (imágenes sin texto) devuelve vacío, no hacen OCR. Ambos son síncronos.

```js
var pdf = new XOnePDF();
var texto = pdf.extractText(appData.getFilesPath() + "/documento.pdf");           // a variable
var ruta  = pdf.extractTextToFile(appData.getFilesPath() + "/documento.pdf",      // a fichero .txt
                                  appData.getFilesPath() + "/documento.txt");
```

---

### 5.25 XOneOCR

Reconocimiento óptico de caracteres sobre imágenes o regiones.

Métodos disponibles:
- `scanLicensePlate(imagePath, [{mode, region, withCamera, licensePlateWidth, licensePlateHeight, onResult}])` → `String` con la matrícula.
- `startScan({onResult, regex, oneShot})` — escáner asíncrono con regex.
- `scanText(imagePath, [params])` — **actualmente lanza `UnsupportedOperationException`** (no implementado).

```js
var ocr = new XOneOCR();

// Reconocer matrícula a partir de fichero
var matricula = ocr.scanLicensePlate(appData.getFilesPath() + "/matricula.jpg");
appData.writeConsoleString("Matrícula: " + matricula);

// Escáner asíncrono con regex
ocr.startScan({
    onResult: function(texto) { ui.showToast("Detectado: " + texto); },
    regex   : "\\d{4}[A-Z]{3}",
    oneShot : true
});
```

> **AVISO**: `ocr.recognize(path)` **no existe**. Para OCR genérico no hay método actualmente implementado (`scanText` lanza `UnsupportedOperationException`).

---

### 5.26 XOneSigner

Helper de firma electrónica y primitivas criptográficas básicas (XOR, RC2, Base64, firma CMS de datos, timestamping TSP). Se instancia con `new XOneSigner()`.

| Método | Parámetros | Retorno | Descripción |
|---|---|---|---|
| `xorCipher(value, key)` | 2 (String, String) | `String` | Cifra/descifra XOR el `value` con la `key` (carácter a carácter). |
| `rc2Cipher(mode, value, key, vectorI)` | 4 (int, value, String, String) | `byte[]` | RC2 con `mode=1` (cifrar) o `mode=0` (descifrar); `value` puede ser String o `byte[]`. |
| `encryptRc2(value, key, iv)` | 3 (value, String, String) | `NativeInt8Array` | RC2 cifrado, `value` admite String, `byte[]` o `NativeArrayBufferView`. |
| `decryptRc2(value, key, iv)` | 3 (value, String, String) | `NativeInt8Array` | RC2 descifrado. |
| `base64Encode(value)` | 1 (String o `byte[]`) | `String` | Codifica a Base64 sin saltos de línea. |
| `base64Decode(value)` | 1 String | `byte[]` | Decodifica Base64. |
| `signDataObject({privateKey, certificateChain, data?, dataFile?, templateFile, keystoreFile?, keystorePassword?, certificateAlias?, digestAlgorithm, timeStampServerUrl?, timeStampServerUserName?, timeStampServerPassword?, timeStampDigestAlgorithm?, connectTimeout?, readTimeout?})` | 1 NativeObject | `String` o `null` | Firma CMS según la plantilla XML. Acepta DNIe (`privateKey`+`certificateChain`) o keystore PKCS12 (`keystoreFile`+`keystorePassword`+`certificateAlias`). Opcionalmente añade timestamp TSP. |
| `signDataObject(data, mask)` | 2 (String, int) | `String` o `null` | **Forma legacy**: usa el keystore por defecto, pide PIN con un diálogo del sistema, firma con SHA-1. `mask=0` firma `data` como String, `mask=1` firma el contenido del fichero `data`. |
| `doTimeStampRequest({url, userName?, password?, digestAlgorithm, dataFile? \| data?, connectTimeout?, readTimeout?})` | 1 NativeObject | `TimeStampResponse` | Solicita un token TSP al servidor indicado para los `data`/`dataFile` aportados. |

```js
// Firmar CMS con DNIe (privateKey y certificateChain previos)
var signer = new XOneSigner();
var firma = signer.signDataObject({
    privateKey       : dnie.privateKey,
    certificateChain : dnie.certificateChain,
    data             : "contenido a firmar",
    templateFile     : "template.xml",
    digestAlgorithm  : "SHA-256",
    timeStampServerUrl     : "https://tsa.example.com/tsa",
    timeStampDigestAlgorithm: "SHA-256",
    connectTimeout   : 10000,
    readTimeout      : 30000
});

// Firmar con keystore PKCS12
var firma2 = signer.signDataObject({
    keystoreFile     : "cert.p12",
    keystorePassword : "1234",
    certificateAlias : "miAlias",
    dataFile         : appData.getFilesPath() + "/documento.bin",
    templateFile     : "template.xml",
    digestAlgorithm  : "SHA-256"
});

// Primitivas auxiliares
var b64    = signer.base64Encode("texto plano");
var llano  = signer.base64Decode(b64);
var oculto = signer.xorCipher("secreto", "clave123");
```

> Para **firmar PDFs** completos (no datos CMS arbitrarios) usar `XOnePDF.signPdf(...)` o `XOnePDF.signPdfWithKey(source, dest, keystorePath, keystorePassword, keyAlias, keyPassword)` (6 args posicionales).

---

### 5.28 AccessibilityManager

Wrapper mínimo del servicio de accesibilidad de Android. Permite consultar el estado y emitir anuncios para TalkBack.

| Método | Parámetros | Retorno | Descripción |
|---|---|---|---|
| `isEnabled()` | ninguno | `boolean` | Si el servicio de accesibilidad está activo. |
| `isTouchExplorationEnabled()` | ninguno | `boolean` | Si "explorar por toque" está activo (API 14+; antes devuelve `false`). |
| `sendText(text)` | 1 String | `boolean` | Envía un evento `TYPE_ANNOUNCEMENT` con el texto (API 16+). Devuelve `false` si el servicio está desactivado. |
| `interrupt()` | ninguno | `null` | Llama `AccessibilityManager.interrupt()` para cortar anuncios en curso. |

```js
var a11y = new AccessibilityManager();
if (a11y.isEnabled()) {
    a11y.sendText("Pedido guardado correctamente");
} else {
    appData.writeConsoleString("Accesibilidad desactivada (explorar por toque: " +
        a11y.isTouchExplorationEnabled() + ")");
}
a11y.interrupt();
```

---

### 5.27 Lista completa de creables

Lista canonica de todos los objetos creables, según el registro en `RhinoJavascriptEngine.addCreateObjects()`. **El match es case-insensitive** (`new FileManager()` y `createObject("filemanager")` son equivalentes), pero los ejemplos usan PascalCase canonico.

```
FileManager, WebSocket, XOneNFC, DebugTools, ImageDrawing,
BluetoothSerialPort, SerialPort, AndroidIntent, Bundle, IniParser,
WifiManager, WifiConfiguration, WifiP2p, Animation, SqlManager,
SystemDebug, AccountManager, GpsTools, Worker, OAuth2, IrManager,
Socket, EncodingUtils, XOnePrinter, XOnePDF, BarcodeGenerator,
QRGenerator, XOneOCR, XOneSigner, KeyStore, AccessibilityManager,
PinpadPayment, Loomis, TensorFlow, VeridasManager, RTCClient,
GeoTabKeyless, MobbSign, BeaconyManager, SoundManager, VibrationManager,
WearableConnection, ItronDeviceManager, DeviceManager
```

> Los objetos no documentados arriba (KeyStore, TensorFlow, VeridasManager, PinpadPayment, Loomis, MobbSign, GeoTabKeyless, RTCClient, BeaconyManager, ItronDeviceManager, SystemDebug, Bundle, WifiConfiguration, WifiP2p, SerialPort, QRGenerator) son creables y siguen el mismo patrón de instanciación. Para su API completa consultar el código del módulo. `AccessibilityManager` está en §5.28; `bleSerial` (BLE) es un singleton — ver §6.

