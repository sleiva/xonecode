# XOne — $http: peticiones, futures, TLS y WebSocket

> Fuente: `xone/v2/xone-help-docs/topics/03c-js-appdata-http.md` §5. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §5 $http: GET, POST, PUT, DELETE, PATCH, descarga de fichero, futures y llamadas en paralelo, seguridad SSL/TLS (mutual TLS, pinning, allowedRootCas), proxy y WebSocket

---

## 5. Objeto Global `$http` - Peticiones HTTP

`$http` es el cliente HTTP de XOne. Todos los métodos devuelven un `Future` que permite lanzar peticiones en paralelo. Los callbacks son opcionales.

### 5.1 Estructura del objeto request

```javascript
let request = {
    headers: {
        "Content-Type" : "application/json",
        "Authorization": "Bearer " + token,
        "Accept-Encoding": "br"          // Para Brotli
    },
    parameters: {
        connectTimeout         : 120000, // ms espera conexión
        readTimeout            : 120000, // ms espera respuesta
        allowUnsafeCertificates: false,  // true = acepta certs autofirmados (solo dev)
        allowedRootCas         : ["mi_ca.crt"],  // CA propia en carpeta de la app
        enablePinning          : true,   // Certificate pinning
    },
    // En GET: se añaden como ?clave=valor en la URL
    // En POST/PUT/PATCH/DELETE: van como body JSON
    // Puede ser objeto JS o string (para XML, etc.)
    data: { campo1: "valor1", campo2: "valor2" },
    // Certificado de cliente (mutual TLS)
    privateKey      : authenticationKey,        // Obtenido con KeyStore
    certificateChain: certificateChain,         // Obtenido con KeyStore
    // Volcar cadena de certificacion del servidor (solo depuracion)
    dumpCertificateChainPath: "/sdcard/Download/"
};
```

#### Caché de disco para offline (`cacheData`)

Opt-in por petición: guarda en disco la última respuesta exitosa y, si una petición posterior **falla por error de conexión o por un 5xx del servidor**, sirve esa respuesta cacheada de forma transparente para que la app siga funcionando offline. Los 4xx se tratan como respuesta real y van por el flujo de error normal. Aplica a `get`, `post`, `put`, `delete`, `patch` y `request`.

```javascript
$http.post("https://api.ejemplo.com/datos", {
        data       : { id: 1 },
        cacheData  : true,      // activa la caché de disco para esta petición
        cacheTTL   : 3600,      // opcional: segundos de validez (sin él o <=0 = no caduca)
        cacheSetting: {         // opcional: ajustes finos de la clave de caché
            // Campos del body (rutas con punto) que se excluyen de la clave para que dos
            // llamadas que solo difieren en ellos compartan entrada. Si se pasa, REEMPLAZA
            // por completo a los defaults ["transacid", "data.headers"].
            ignoreBodyFields: ["transacid", "data.headers", "miCampoVolatil"]
        }
    },
    function(sData, headers, statusCode, fromCache, fromCacheDate) {
        // fromCache === true  -> sData viene de la caché offline
        // fromCacheDate       -> Date de la última respuesta exitosa (solo si fromCache es true)
        if (fromCache) {
            ui.showToast("Mostrando datos offline de " + fromCacheDate);
        }
        let json = JSON.parse(sData);
    },
    function(nError, sErrorDesc) {
        // Solo se llama si NO hay entrada válida en caché
    }
);
```

Notas:
- El callback de éxito recibe dos parámetros extra al final, `fromCache` (booleano) y `fromCacheDate` (Date). En un éxito de red normal `fromCache` es `false` y `fromCacheDate` viene `undefined`. Los callbacks que no los declaran los ignoran sin problema.
- Solo se cachean respuestas de datos (JSON/texto). Las descargas de fichero no se cachean.
- Sin `cacheData`, el comportamiento es exactamente el de siempre: no se escribe ni se lee nada.

### 5.2 GET

```javascript
let miObjeto = self;  // Guardar contexto ANTES del callback asincrono

$http.get("https://api.ejemplo.com/datos", {
        parameters: { connectTimeout: 120000, readTimeout: 120000 },
        data: { pagina: 1, limite: 50 }  // Se añaden como query string
    },
    function(sData, responseHeaders, nHttpStatusCode) {
        let json = JSON.parse(sData);
        miObjeto.MAP_RESULTADO = json.total;
        ui.refreshValue("MAP_RESULTADO");
    },
    function(nError, sErrorDesc) {
        ui.showToast("Error " + nError + ": " + sErrorDesc);
    }
);

// GET con lectura de cabeceras de respuesta
$http.get("https://api.ejemplo.com", request,
    function(sData, responseHeaders) {
        let contentType = responseHeaders["Content-Type"];
        let fecha = new Date(responseHeaders.Date).getDate();
    },
    function(nError, sErrorDesc) {}
);
```

### 5.3 POST

```javascript
// POST con body JSON
ui.showWaitDialog("Enviando...");
$http.post("https://api.ejemplo.com/usuarios", {
        headers   : { "Content-Type": "application/json" },
        parameters: { connectTimeout: 120000, readTimeout: 120000 },
        data      : { nombre: "Juan", activo: true }
    },
    function(sData, headers, nHttpStatusCode) {
        let resultado = JSON.parse(sData);
        ui.hideWaitDialog();
        ui.showToast("Creado con ID: " + resultado.id);
    },
    function(nError, sErrorDesc) {
        ui.hideWaitDialog();
        ui.showToast("Error: " + sErrorDesc);
    }
);

// POST con body XML (data como string)
$http.post("https://api.ejemplo.com/xml", {
        headers: { "Content-Type": "application/xml" },
        data   : "<nota><de>Juan</de><para>Pedro</para></nota>"
    },
    function(sData) {},
    function(nError, sErrorDesc) {}
);
```

### 5.4 PUT / DELETE / PATCH

```javascript
let request = {
    headers   : { "Content-Type": "application/json" },
    parameters: { connectTimeout: 120000, readTimeout: 120000 },
    data      : { campo: "valor" }
};

$http.put("https://api.ejemplo.com/recurso/1",    request, successCb, errorCb);
$http.delete("https://api.ejemplo.com/recurso/1", request, successCb, errorCb);
$http.patch("https://api.ejemplo.com/recurso/1",  request, successCb, errorCb);
```

### 5.5 Descarga de fichero

```javascript
$http.download("https://ejemplo.com/documento.pdf", {},
    function(sPath, headers, nHttpStatusCode) {
        // sPath: ruta local donde se guardo el fichero descargado
        ui.openFile(sPath);
    },
    function(nError, sMessage) {
        ui.showToast("Error en descarga: " + sMessage);
    }
);
```

### 5.6 Futures — llamadas en paralelo

Un `Future` es el objeto que devuelve cualquier método `$http`. Permite lanzar varias llamadas a la vez y recoger los resultados cuando todas terminen.

- **`future.getResult()`** — devuelve el cuerpo como **string**
- **`future.get()`** — devuelve el cuerpo **parseado a objeto JS** si es posible. **Preferible**
- **`future.cancel()`** — cancela la peticion

```javascript
// Lanzar tres peticiones en paralelo
let future1 = $http.get("https://api.ejemplo.com/datos1", { data: { id: 1 } });
let future2 = $http.get("https://api.ejemplo.com/datos2", { data: { id: 2 } });
let future3 = $http.get("https://api.ejemplo.com/datos3", { data: { id: 3 } });

// getResult() bloquea hasta que cada peticion termina
let sValor1 = future1.getResult();  // string
let oValor2 = future2.get();        // objeto JS parseado (preferible)
let oValor3 = future3.get();

// Futures con callbacks (se ejecutan al terminar) y recogida posterior
let f1 = $http.get(url1, {},
    function(sData) { ui.showToast("OK #1"); },
    function(nErr, sDesc) { ui.showToast("Error #1"); }
);
let f2 = $http.get(url2, {},
    function(sData) { ui.showToast("OK #2"); },
    function(nErr, sDesc) { ui.showToast("Error #2"); }
);
// Esperar a que ambas terminen
let r1 = f1.getResult();
let r2 = f2.getResult();
```

### 5.7 Cancelar request

```javascript
let future = $http.post("https://api.ejemplo.com/lenta", {},
    function(sData) {},
    function(nError, sErrorDesc) { /* se llama con error de cancelacion */ }
);
future.cancel();

// Patron: cancelar peticion anterior antes de lanzar nueva
var requestActual = null;
function buscarEnAPI(termino) {
    if (requestActual) requestActual.cancel();
    requestActual = $http.get(url + "?q=" + termino, {},
        function(sData) { requestActual = null; procesarResultados(sData); },
        function(nError, sDesc) { requestActual = null; }
    );
}
```

### 5.8 Seguridad SSL/TLS

```javascript
// Certificados autofirmados — SOLO desarrollo, nunca produccion
let request = {
    parameters: { allowUnsafeCertificates: true, connectTimeout: 120000, readTimeout: 120000 }
};

// CA propia con certificate pinning
// El fichero .crt debe estar en la carpeta de la app
let request = {
    parameters: {
        allowedRootCas: ["mi_ca_root.crt"],
        enablePinning : true,
        connectTimeout: 120000, readTimeout: 120000
    }
};

// Mutual TLS con certificado de cliente
// Soporta: pkcs12 (recomendado), bks, jks
ui.showWaitDialog("Conectando...");
try {
    let keyStore = new KeyStore();
    keyStore.open({ file: "cert_cliente.p12", type: "pkcs12", password: "" });
    let request = {
        headers         : { "Content-Type": "application/json" },
        parameters      : { connectTimeout: 120000, readTimeout: 120000 },
        data            : { campo: "valor" },
        privateKey      : keyStore.getKey("alias"),
        certificateChain: keyStore.getCertificateChain("alias")
    };
    $http.post("https://servidor-mutual-tls.com", request,
        function(sData) { ui.hideWaitDialog(); },
        function(nCode, sError) { ui.hideWaitDialog(); }
    );
} catch(ex) {
    ui.hideWaitDialog();
    throw ex;
}

// Volcar cadena de certificacion para depuracion
$http.get("https://servidor.com", {
    parameters: { connectTimeout: 120000, readTimeout: 120000 },
    dumpCertificateChainPath: "/sdcard/Download/"
}, function(sData) {
    ui.showToast("Certificados guardados en /sdcard/Download/");
}, function(nError, sErrorDesc) {});
```

### 5.9 Proxy

Configura un proxy global para toda la app, incluyendo XOneLive y el replicador.

```javascript
// Establecer proxy
$http.setProxy({
    host: "192.168.1.100",
    port: 8080,
    type: "http"  // "http" o "socks"
    // enabledHosts: ["api.ejemplo.com"]
    // skipHosts   : ["interno.ejemplo.com"]
});

// Eliminar proxy
$http.setProxy(null);
```

### 5.10 Cleartext HTTP

Por defecto Android solo permite HTTPS. Para saber si HTTP sin cifrar esta permitido:

```javascript
let bPermitido = systemSettings.isClearTextTrafficAllowed();
```

### 5.11 WebSocket

```javascript
let ws;
let dataObject = self;  // Guardar referencia ANTES de los callbacks

function conectarWebSocket() {
    let opciones = {
        url        : "wss://servidor.ejemplo.com/canal",
        // protocol: "mi_protocolo",
        // certificate: "servidor.crt",
        // verifyWithSystemTrustManagers: true,
        onOpen: function() {
            ui.showToast("Conectado");
            ws.send(JSON.stringify({ command: "login", user: "usuario" }));
        },
        onMessage: function(sData) {
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
    if (ws) { ws.close(); ws = null; }
    ws = new WebSocket(opciones);
}

function enviarMensaje(sTexto) {
    if (!ws) throw "Conecte el WebSocket primero";
    ws.send(JSON.stringify(sTexto));
}

function cerrarWebSocket() {
    if (ws) { ws.close(); ws = null; }
}
```

> **Nota**: Guardar `self` en una variable local (`dataObject`) antes de los callbacks. Dentro de `onMessage` y `onOpen`, `self` puede no estar disponible.

### 5.12 loadFromJson / toJson

```javascript
// Cargar datos en un OBJETO individual desde string JSON
let obj = new Productos();
obj.loadFromJson('{"ID": 1, "NOMBRE": "Tornillo", "PRECIO": 0.15}');

// Cargar datos en una COLECCION desde array JSON
let coll = appData.getCollection("Productos");
coll.loadFromJson('[{"ID": 1, "NOMBRE": "Tornillo"}, {"ID": 2, "NOMBRE": "Tuerca"}]');
let nTotal = coll.getCount();  // 2

// Serializar coleccion a array JS nativo
let jsArray = coll.toJson();
let sJson   = JSON.stringify(jsArray, null, 4);

// Serializar objeto individual
let jsObj  = obj.toJson();
let sObjJs = obj.toJsonString();

// Caso de uso tipico: recibir de API y cargar en coleccion
$http.get("https://api.ejemplo.com/productos", {},
    function(sData) {
        let coll = appData.getCollection("Productos");
        coll.loadFromJson(sData);
    },
    function(nError, sErrorDesc) {}
);
```

