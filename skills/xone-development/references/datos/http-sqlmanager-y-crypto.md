# XOne — $http, SqlManager y crypto: referencia ampliada

> Fuente: `xone/v2/xone-project-generator/references/xone-javascript-patterns-c-appdata-http.md` §2.6–§2.9. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: segunda redacción del corpus para $http, más SqlManager y la API crypto

---

### 2.6 API HTTP (`$http`)

#### 2.6.1 Estructura del objeto request

Todos los métodos `$http` reciben un objeto `request` con la siguiente estructura. Todos los campos son opcionales según el caso de uso:

```javascript
let request = {
    // Cabeceras HTTP
    headers: {
        "Content-Type" : "application/json",
        "Authorization": "Bearer " + token,
        "Accept-Encoding": "br"         // Para Brotli
    },
    // Parametros de la peticion
    parameters: {
        connectTimeout         : 120000, // ms espera conexión (recomendado: 120000)
        readTimeout            : 120000, // ms espera respuesta (recomendado: 120000)
        allowUnsafeCertificates: false,  // true = acepta certificados autofirmados
        allowedRootCas         : ["mi_ca.crt"],  // CAs propias de confianza
        enablePinning          : true,   // Activar certificate pinning
    },
    // Cuerpo / parametros de la peticion
    // En GET: se añaden como query string (?clave=valor)
    // En POST/PUT/PATCH/DELETE: se envian como body
    // Puede ser un objeto JS (se serializa a JSON) o una cadena (XML, etc.)
    data: {
        campo1: "valor1",
        campo2: "valor2"
    },
    // Certificado de cliente (mutual TLS)
    privateKey      : authenticationKey,        // Obtenido con KeyStore
    certificateChain: certificateChain,         // Obtenido con KeyStore
    // Ruta donde volcar la cadena de certificacion del servidor (solo depuracion)
    dumpCertificateChainPath: "/sdcard/Download/"
};
```

**Callbacks de respuesta:**

```javascript
// Success: (sData, responseHeaders, nHttpStatusCode, fromCache, fromCacheDate)
// - sData: cuerpo de la respuesta como string
// - responseHeaders: objeto con las cabeceras de respuesta
// - nHttpStatusCode: código HTTP (200, 404, etc.)
// - fromCache: true si sData viene de la caché offline (ver más abajo); false en éxito de red
// - fromCacheDate: Date de la entrada cacheada (solo informado cuando fromCache es true)
// Error: (nError, sErrorDesc)
```

**Caché de disco para offline (`cacheData`):** opt-in por petición. Guarda la última respuesta exitosa y, si una petición posterior **falla por error de conexión o por un 5xx**, sirve esa respuesta cacheada de forma transparente (los 4xx van por el flujo de error normal). Aplica a todos los verbos.

```javascript
$http.post("https://api.example.com/datos", {
        data       : { id: 1 },
        cacheData  : true,      // activa la caché para esta petición
        cacheTTL   : 3600,      // opcional: segundos de validez (sin él o <=0 = no caduca)
        cacheSetting: {
            // Campos del body (rutas con punto) excluidos de la clave, para que dos llamadas que
            // solo difieren en ellos compartan entrada. Si se pasa, REEMPLAZA por completo a los
            // defaults ["transacid", "data.headers"].
            ignoreBodyFields: ["transacid", "data.headers"]
        }
    },
    function(sData, headers, statusCode, fromCache, fromCacheDate) {
        if (fromCache) {
            ui.showToast("Datos offline de " + fromCacheDate);
        }
    },
    function(nError, sErrorDesc) {
        // Solo si NO hay entrada válida en caché
    }
);
// Solo se cachean respuestas de datos (JSON/texto); las descargas no. Sin cacheData, sin cambios.
```

---

#### 2.6.2 GET

```javascript
// GET básico con parametros en query string
let request = {
    parameters: {
        connectTimeout: 120000,
        readTimeout   : 120000
    },
    data: {
        format: "json"    // Se añade como ?format=json
    }
};

let miObjeto = self;  // Guardar referencia a self antes del callback

$http.get("https://api.ipify.org", request,
    function(sData, responseHeaders, nHttpStatusCode) {
        let json = JSON.parse(sData);
        miObjeto.MAP_IP = json.ip;
        ui.refreshValue("MAP_IP");
    },
    function(nError, sErrorDesc) {
        ui.showToast("Error " + nError + ": " + sErrorDesc);
    }
);
```

```javascript
// GET con lectura de cabeceras de respuesta
$http.get("https://api.example.com/datos", request,
    function(sData, responseHeaders) {
        // responseHeaders es un objeto con todas las cabeceras
        let fecha = new Date(responseHeaders.Date).getDate();
        let contentType = responseHeaders["Content-Type"];
    },
    function(nError, sErrorDesc) {}
);
```

```javascript
// GET con compresion Brotli
let request = {
    parameters: { connectTimeout: 120000, readTimeout: 120000 },
    headers   : { "Accept-Encoding": "br" }
};
$http.get("https://api.example.com/datos", request,
    function(sData) { showData(self, sData); },
    function(nError, sErrorDesc) {}
);
```

---

#### 2.6.3 POST

```javascript
// POST con body JSON
let request = {
    headers   : { "Content-Type": "application/json" },
    parameters: { connectTimeout: 120000, readTimeout: 120000 },
    data      : { nombre: "Juan", activo: true }
};

ui.showWaitDialog("Enviando...");
$http.post("https://api.example.com/usuarios", request,
    function(sData, headers, nHttpStatusCode) {
        let resultado = JSON.parse(sData);
        ui.showToast("Creado con ID: " + resultado.id);
        ui.hideWaitDialog();
    },
    function(nError, sErrorDesc) {
        ui.showToast("Error: " + sErrorDesc);
        ui.hideWaitDialog();
    }
);
```

```javascript
// POST con body XML (data como string, no objeto)
let request = {
    headers   : { "Content-Type": "application/xml" },
    parameters: { connectTimeout: 120000, readTimeout: 120000 },
    data      : "<note><to>Tove</to><from>Jani</from></note>"
};
$http.post("https://api.example.com/xml", request,
    function(sData) {},
    function(nError, sErrorDesc) {}
);
```

```javascript
// POST con timeout intencionadamente corto
let request = {
    parameters: { connectTimeout: 3000, readTimeout: 3000 }
};
$http.post("https://api.example.com/lenta", request,
    function(sData) {},
    function(nError, sErrorDesc) {
        // nError será de timeout si el servidor tarda mas de 3 segundos
        ui.showToast("Timeout: " + sErrorDesc);
    }
);
```

---

#### 2.6.4 PUT / DELETE / PATCH

```javascript
let request = {
    headers   : { "Content-Type": "application/json" },
    parameters: { connectTimeout: 120000, readTimeout: 120000 },
    data      : { campo: "valor" }
};

$http.put("https://api.example.com/recurso/1",    request, successCb, errorCb);
$http.delete("https://api.example.com/recurso/1", request, successCb, errorCb);
$http.patch("https://api.example.com/recurso/1",  request, successCb, errorCb);
```

---

#### 2.6.5 Descarga de fichero

```javascript
// Descarga con GET (por defecto)
$http.download("https://example.com/documento.pdf", {},
    function(sPath, headers, nHttpStatusCode) {
        // sPath: ruta local donde se ha guardado el fichero descargado
        ui.openFile(sPath);
    },
    function(nError, sMessage) {
        ui.showToast("Error en descarga: " + sMessage);
    }
);

// Descarga con POST (añadir method y data al request)
$http.download("https://example.com/informe", {
        // method: "POST",
        // data: { token: "abc", tipo: "pdf" }
    },
    function(sPath, headers, nHttpStatusCode) {
        ui.openFile(sPath);
    },
    function(nError, sMessage) {
        ui.showToast("Error: " + sMessage);
    }
);
```

---

#### 2.6.6 Futures: llamadas en paralelo

Un `Future` es el objeto que devuelve cualquier método `$http`. Permite lanzar varias llamadas en paralelo y recoger los resultados cuando todas hayan terminado.

- **`future.getResult()`** — devuelve el cuerpo de la respuesta como **string**
- **`future.get()`** — devuelve el cuerpo **parseado a objeto JS** cuando es posible. **Preferible en la mayoría de casos**
- **`future.cancel()`** — cancela la peticion si aún no ha terminado

```javascript
// Lanzar tres peticiones en paralelo (sin callbacks)
// Las tres se ejecutan simultaneamente
let future1 = $http.get("https://api.example.com/datos1", { data: { id: 1 } });
let future2 = $http.get("https://api.example.com/datos2", { data: { id: 2 } });
let future3 = $http.get("https://api.example.com/datos3", { data: { id: 3 } });

// getResult() bloquea hasta que cada peticion termina
let sValor1 = future1.getResult();  // string
let sValor2 = future2.getResult();
let sValor3 = future3.getResult();

// get() devuelve objeto JS si la respuesta es JSON parseable
let oValor1 = future1.get();        // objeto JS (preferible)
```

```javascript
// Futures con callbacks Y recogida de resultado
// Los callbacks se ejecutan cuando cada peticion termina
// getResult() sigue siendo util para esperar todas antes de continuar
let future1 = $http.get("https://api.example.com/datos1", { data: { text: "uno" } },
    function(sData, responseHeaders) { ui.showToast("Callback OK #1"); },
    function(nError, sErrorDesc)     { ui.showToast("Callback error #1"); }
);
let future2 = $http.get("https://api.example.com/datos2", { data: { text: "dos" } },
    function(sData, responseHeaders) { ui.showToast("Callback OK #2"); },
    function(nError, sErrorDesc)     { ui.showToast("Callback error #2"); }
);

// Esperar a que ambas terminen y recoger resultado
let sValor1 = future1.getResult();
let sValor2 = future2.getResult();
```

---

#### 2.6.7 Cancelar request

```javascript
let future = $http.post("https://api.example.com/lenta", {},
    function(sData) {},
    function(nError, sErrorDesc) {
        // Se llamara con error de cancelacion
    }
);
// Cancelar inmediatamente (o en cualquier momento antes de que termine)
future.cancel();
```

---

#### 2.6.8 Seguridad SSL/TLS

##### Certificados autofirmados (unsafe)

Solo para entornos de desarrollo/pruebas. **Nunca en produccion.**

```javascript
let request = {
    parameters: {
        allowUnsafeCertificates: true,
        connectTimeout: 120000,
        readTimeout   : 120000
    }
};
$http.get("https://servidor-con-cert-autofirmado.com", request,
    function(sData) {},
    function(nError, sErrorDesc) {}
);
```

##### CA propia (certificate pinning)

Para servidores con certificado de una CA no publica. El fichero `.crt` debe estar en la carpeta de la app.

```javascript
let request = {
    parameters: {
        allowedRootCas: ["mi_ca_root.crt"],  // Array de ficheros .crt en la app
        enablePinning : true,
        connectTimeout: 120000,
        readTimeout   : 120000
    }
};
$http.get("https://servidor-interno.example.com", request,
    function(sData) {},
    function(nError, sErrorDesc) {}
);
```

##### Certificado de cliente (mutual TLS)

Usa `KeyStore` para cargar el certificado desde un fichero `.p12`. Formatos soportados: `pkcs12`, `bks`, `jks`. Se recomienda `pkcs12` por compatibilidad.

```javascript
ui.showWaitDialog("Abriendo keystore...");
try {
    let keyStore = new KeyStore();
    keyStore.open({
        file    : "certificado_cliente.p12",
        type    : "pkcs12",      // pkcs12 recomendado. También: bks, jks
        password: "password"
    });
    let privateKey       = keyStore.getKey("alias");
    let certificateChain = keyStore.getCertificateChain("alias");

    let request = {
        headers         : { "Content-Type": "application/json" },
        parameters      : { connectTimeout: 120000, readTimeout: 120000 },
        data            : { campo: "valor" },
        privateKey      : privateKey,
        certificateChain: certificateChain
    };
    $http.post("https://servidor-con-mutual-tls.com", request,
        function(sData, headers, nHttpStatusCode) {
            ui.hideWaitDialog();
        },
        function(nHttpStatusCode, sError) {
            ui.hideWaitDialog();
        }
    );
} catch(ex) {
    ui.hideWaitDialog();
    throw ex;
}
```

##### Obtener la cadena de certificacion del servidor (depuracion)

Útil para obtener el `.crt` de un servidor y añadirlo como `allowedRootCas`.

```javascript
$http.get("https://servidor.example.com", {
    parameters: { connectTimeout: 120000, readTimeout: 120000 },
    dumpCertificateChainPath: "/sdcard/Download/"  // Carpeta donde se guardaran los .crt
}, function(sData) {
    ui.showToast("Certificados guardados en /sdcard/Download/");
}, function(nError, sErrorDesc) {});
```

##### TLS: versión mínima

XOne negocia automáticamente la mejor versión disponible. Si el servidor requiere una versión especifica (TLS 1.0, 1.1, 1.2) se negocia sin configuración adicional — solo afecta si la versión requerida esta deshabilitada en el sistema operativo del dispositivo.

---

#### 2.6.9 Proxy

Configura un proxy global para **toda la app**, incluido XOneLive y el replicador. Llamar con `null` para eliminar el proxy.

```javascript
// Establecer proxy HTTP
$http.setProxy({
    host: "192.168.1.100",
    port: 8080,
    type: "http"    // "http" o "socks"
    // enabledHosts: ["api.example.com"]  // Solo estos hosts pasan por el proxy
    // skipHosts   : ["internal.example.com"]  // Estos hosts NO pasan por el proxy
    // NOTA: enabledHosts y skipHosts son mutuamente excluyentes
});

// Eliminar proxy
$http.setProxy(null);
```

---

#### 2.6.10 Verificar si HTTP (cleartext) esta permitido

En Android, por defecto solo se permiten conexiones HTTPS. Para usar HTTP se debe configurar `network_security_config.xml` en el proyecto nativo.

```javascript
let bPermitido = systemSettings.isClearTextTrafficAllowed();
// true  = HTTP sin cifrar permitido
// false = Solo HTTPS (por defecto en Android moderno)
```

---

#### 2.6.11 WebSocket

`WebSocket` permite comunicación bidireccional en tiempo real. Se instancia con `new WebSocket(opciones)`.

```javascript
let ws;
let dataObject = self;  // Guardar referencia antes de los callbacks

function conectarWebSocket() {
    let opciones = {
        url     : "wss://servidor.example.com/canal",
        // protocol: "mi_protocolo",        // Subprotocolo opcional
        // certificate: "servidor.crt",     // Certificado para WSS con CA propia
        // verifyWithSystemTrustManagers: true,

        onOpen: function() {
            ui.showToast("Conectado");
            // Enviar mensaje inicial si es necesario
            ws.send(JSON.stringify({ command: "login", user: "usuario" }));
        },
        onMessage: function(sData) {
            // sData: mensaje recibido como string
            dataObject.MAP_CHAT = dataObject.MAP_CHAT + sData + "\n";
            ui.refreshValue("MAP_CHAT");
        },
        onError: function(error) {
            ui.showToast("Error: " + error.message);
            ws = null;
        },
        onClose: function() {
            ui.showToast("Conexión cerrada");
            ws = null;
        }
    };
    // Cerrar conexión anterior si existe
    if (ws) {
        ws.close();
        ws = null;
    }
    ws = new WebSocket(opciones);
}

function enviarMensaje(sTexto) {
    if (!ws) {
        throw "Conecte el WebSocket primero";
    }
    ws.send(JSON.stringify(sTexto));
}

function cerrarWebSocket() {
    if (ws) {
        ws.close();
        ws = null;
    }
}
```

> **Nota:** Guardar siempre `self` en una variable local (`dataObject`) antes de definir los callbacks. Dentro de `onMessage`, `onOpen`, etc., `self` puede no estar disponible o no ser el objeto correcto.

---

#### 2.6.12 loadFromJson / toJson

Permiten cargar datos JSON directamente en objetos y colecciones XOne, y serializar colecciones a JSON.

```javascript
// Cargar datos en un OBJETO individual desde un string JSON
// El framework mapea las claves del JSON a los campos del objeto
let obj = new Productos();
obj.loadFromJson('{"ID": 1, "NOMBRE": "Tornillo", "PRECIO": 0.15}');
// Ahora obj.ID == 1, obj.NOMBRE == "Tornillo", obj.PRECIO == 0.15
```

```javascript
// Cargar datos en una COLECCION desde un array JSON
// Crea un objeto por cada elemento del array
let coll = appData.getCollection("Productos");
coll.loadFromJson('[{"ID": 1, "NOMBRE": "Tornillo"}, {"ID": 2, "NOMBRE": "Tuerca"}]');
let nTotal = coll.getCount();  // 2
let primero = coll.get(0);
// primero.ID == 1, primero.NOMBRE == "Tornillo"
```

```javascript
// Serializar una coleccion a array JS nativo
let coll   = appData.getCollection("Usuarios");
coll.loadAll();
let jsArray = coll.toJson();           // Array de objetos JS nativos
let sJson   = JSON.stringify(jsArray, null, 4);  // Para enviar o mostrar

// Serializar un objeto individual
let obj       = coll.get(0);
let jsObjeto  = obj.toJson();          // Objeto JS nativo
let sObjJson  = obj.toJsonString();    // String JSON directamente
```

> **Caso de uso típico:** recibir datos de una API REST con `$http.get` o `$http.post`, y cargarlos directamente en una coleccion con `loadFromJson` sin necesidad de iterar campo a campo.

---

### 2.8 SqlManager

#### 2.8.1 Abrir Base de Datos

```javascript
let sqlManager = new SqlManager();
let jsParams = {
    databasePath         : "gestion.db",
    useWal               : true,
    readOnly             : false,
    useExistingConnection: true,
    onDatabaseCorrupted  : function() {
        ui.showToast("Error: Base de datos corrupta");
    }
};
sqlManager.openDatabase(jsParams);
```

#### 2.8.2 Consultas con Parámetros

```javascript
try {
    let cursor = sqlManager.doRawQuery(
        "SELECT * FROM gen_usuarios WHERE LOGIN=? AND ACTIVO=?",
        "admin", 1
    );
    try {
        let nCount = cursor.getCount();
        if (nCount > 0) {
            cursor.moveToFirst();
            let sNombre = cursor.getString("NOMBRE");
            let nId = cursor.getInteger("ID");
        }
    } finally {
        cursor.close();  // SIEMPRE cerrar el cursor
    }
} finally {
    sqlManager.close();  // SIEMPRE cerrar la conexión
}
```

#### 2.8.3 Insertar con Parámetros Seguros

```javascript
let jsInsertParams = {
        tableName: "gen_productos",
    fields   : {
        CODIGO : "PROD001",
        NOMBRE : "Producto de prueba",
        PRECIO : 29.99,
        ACTIVO : 1
    }
};
let nIndex = sqlManager.insert(jsInsertParams);
```

#### 2.8.4 Batch de SQLs

```javascript
let sqls = [];
sqls.push("UPDATE gen_productos SET ACTIVO=0 WHERE STOCK=0");
sqls.push("DELETE FROM gen_log WHERE FECHA < '2024-01-01'");
sqlManager.doBatchParseSqls(sqls);
```

#### 2.8.5 Mantenimiento de Base de Datos

```javascript
sqlManager.doWalCheckpoint();  // Consolidar WAL
sqlManager.doVacuum();         // Compactar BD
sqlManager.dropAllIndexes();   // Eliminar indices
```

---

### 2.9 API Crypto

#### 2.9.1 Hashing

```javascript
let hash = crypto.hash({
    data        : "texto a hashear",
    algorithm   : "SHA-256",  // MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512
    outputFormat: "hex",      // "hex" o "base64"
    key         : "clave_hmac"  // Opcional: para HMAC
});

let md5 = crypto.md5({ data: "texto", outputFormat: "hex" });
let sha1 = crypto.sha1({ data: "texto", outputFormat: "hex" });
let sha256 = crypto.sha256({ data: "texto", outputFormat: "hex" });
let sha512 = crypto.sha512({ data: "texto", outputFormat: "hex" });
```

#### 2.9.2 Encoding

```javascript
let encoded = crypto.toBase64({ data: "texto plano", urlSafe: true });
let decoded = crypto.fromBase64({ data: encoded });

let b58 = crypto.toBase58({ data: "texto" });
let decoded58 = crypto.fromBase58({ data: b58 });

let b45 = crypto.toBase45({ data: "texto" });
let b32 = crypto.toBase32({ data: "texto" });
```

#### 2.9.3 Cifrado Simetrico (AES)

```javascript
let aesKey = crypto.generateAesKey({
    alias            : "mi_clave_aes",
    keySize          : 256,
    useSecureHardware: true,
    useStrongBox     : true
});

let derivedKey = crypto.derivePassword({
    algorithm : "PBKDF2WithHmacSHA1",
    password  : "miPasswordSeguro",
    salt      : "salt_aleatorio_unico",
    iterations: 1000,
    keyLength : 256
});

let encrypted = crypto.encrypt({
    data        : "texto secreto",
    dataFormat  : "string",
    algorithm   : "AES/GCM/NoPadding",
    key         : aesKey,
    outputFormat: "base64"
});

let decrypted = crypto.decrypt({
    data        : encrypted,
    dataFormat  : "base64",
    algorithm   : "AES/GCM/NoPadding",
    key         : aesKey,
    outputFormat: "string"
});
```

#### 2.9.4 Cifrado de Archivos

```javascript
crypto.encrypt({
    data: "documento.pdf", dataFormat: "file",
    algorithm: "AES/GCM/NoPadding", key: aesKey,
    outputFormat: "file", output: "documento.pdf.crypt"
});

crypto.decrypt({
    data: "documento.pdf.crypt", dataFormat: "file",
    algorithm: "AES/GCM/NoPadding", key: aesKey,
    outputFormat: "file", output: "documento.pdf"
});
```

#### 2.9.5 Firma Digital

```javascript
let keyPair = crypto.generateKeyPair({
    alias: "mi_par_claves", algorithm: "EC",
    keySize: 384, output: "key", outputFormat: "file",
    useSecureHardware: true
});

let publicKeyPem = keyPair.getPublicKey().toPem();
let privateKeyPem = keyPair.getPrivateKey().toPem();

let signature = crypto.sign({
    data: "datos a firmar", algorithm: "SHA256withECDSA",
    privateKey: privateKeyPem, outputFormat: "base64"
});

let bValid = crypto.isJwtSignatureValid({
    data: jwtToken, publicKey: publicKeyPem
});
```

#### 2.9.6 Checksum

```javascript
let crc32 = crypto.getChecksum({ type: "crc32", data: "texto" });
let crc32File = crypto.getChecksum({ type: "crc32", file: "archivo.dat" });
```

#### 2.9.7 Listar Algoritmos Disponibles

```javascript
let digestAlgorithms = crypto.getAvailableDigestAlgorithms();
let cipherAlgorithms = crypto.getAvailableCipherAlgorithms();
let signatureAlgorithms = crypto.getAvailableSignatureAlgorithms();
let sslProtocols = crypto.getAvailableSslProtocols();
```
