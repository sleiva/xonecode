# Generación XOne — Fase 7: asfilter e integraciones

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` L4652–4784. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §7.14 filtros de búsqueda con asfilter · §7.15 objetos complementarios como opciones de integración

---

### 7.14 Filtros de Busqueda con `<asfilter>`

Para pantallas de lista que requieran busqueda nativa, se puede usar el nodo `<asfilter>` dentro de la coleccion. Este nodo genera automáticamente una barra de filtros en la parte superior de la lista.

```xml
<coll name="Productos"
      sql="SELECT * FROM ##PREF##Productos"
      objname="Productos" loadall="true">

    <asfilter fontsize="8" left="12" sort="false">
        <field name="NOMBRE" fldname="NOMBRE"
               oper="##FLD## LIKE '##VAL##%'" width="15"
               tooltip="Buscar por nombre">NOMBRE</field>
        <field name="CODIGO" fldname="CODIGO"
               oper="##FLD## LIKE '##VAL##%'" width="10"
               tooltip="Buscar por código" newline="false">CODIGO</field>
    </asfilter>

    <group name="Lista" id="1">
        <!-- contenido de la lista -->
    </group>
</coll>
```

| Atributo `<asfilter>` | Descripción |
|-----------------------|-------------|
| `fontsize` | Tamaño de fuente de los campos del filtro |
| `left` | Margen izquierdo del filtro |
| `sort` | Habilita ordenamiento (`true`/`false`) |

| Atributo `<field>` | Descripción |
|--------------------|-------------|
| `name` | Nombre del campo de filtro |
| `fldname` | Nombre del campo real en la tabla |
| `oper` | Operador SQL. `##FLD##` = campo, `##VAL##` = valor introducido |
| `width` | Ancho del campo de filtro |
| `tooltip` | Texto de ayuda |
| `newline` | `false` = mismo renglon que el anterior |

### 7.15 Objetos Complementarios como Opciones de Integración

Al analizar los requisitos del proyecto (Fase 1), el agente debe identificar si se necesitan integraciones con hardware o servicios externos. XOne proporciona objetos complementarios que se deben incorporar al proyecto según la funcionalidad requerida.

#### Tabla de Integraciones Disponibles

| Objeto | Tipo de App | Impacto en Generación |
|--------|-------------|----------------------|
| **FileManager** | Apps con descarga/subida de archivos, exportacion de datos, gestion documental | Incluir funciones en `functions.js` para `download()`, `uploadFile()`, `readFile()`, `saveFile()`. Creación: `new FileManager()` |
| **XOnePDF** | Apps con reportes, tickets, albaranes, facturas en PDF | Incluir funciones de generación PDF en `functions.js`. Creación: `new XOnePDF()`. Patron: `create()` > `open()` > contenido > `close()` > `launchPDF()` |
| **XOnePrinter** | Apps de campo con impresion de etiquetas/tickets via Bluetooth (Zebra) | Incluir funciones de impresion en `functions.js`. Agregar permisos Bluetooth en `app.xml`. Creación: `new XOnePrinter()` |
| **BarcodeGenerator** | Apps con generación de códigos QR/barras para etiquetas, identificación | Incluir funciones de generación en `functions.js`. Tipos: `qrcode`, `code128`, `ean13`, `pdf417`, etc. Creación: `new BarcodeGenerator()` |
| **Escaner QR/barras** | Apps con lectura de códigos QR/barras desde camara | Agregar permiso `camera` en `app.xml`. Declarar `<prop type="VD" code-type="qr" oncodescanned="...">` en el XML; en JS usar `control.setOnCodeScanned(callback)` sobre el control obtenido con `getControl("MAP_CAMERA")`. El callback recibe `evento.data` y `evento.type` |
| **XOneNFC** | Apps con lectura de tarjetas NFC, DNI electrónico, tags MIFARE | Agregar permisos NFC en `app.xml`. Creación: `new XOneNFC()`. Métodos: `readNdefMessageAsync()`, `enableDnieReader()`. Para el DNIe, `enableDnieReader()` admite `enablePassiveAuthentication` (defecto `true`: comprueba la firma del país emisor y aborta por `onDnieReadError` si no cuadra), `trustedCountries` (emisoras admitidas, p. ej. `"ES"`) y `minimumSessionKeySize` (`112`/`128`/`192`/`256`) |
| **XOneOCR** | Apps con reconocimiento de texto en imágenes, lectura de matriculas | Creación: `new XOneOCR()`. Métodos: `scanLicensePlate()` (matrículas), `startScan({regex, onResult})` (validación por patrones). `scanText()` aún NO está implementado (lanza UnsupportedOperationException). Agregar permisos de camara |
| **BluetoothSerialPort** | Apps de campo con dispositivos Bluetooth (balanzas, sensores, terminales) | Singleton `bluetoothSerial`. Agregar permisos Bluetooth en `app.xml`. Métodos: `connect()`, `write()`, `read()` |
| **WifiManager** | Apps con configuración de redes WiFi, conexión a dispositivos | Creación: `new WifiManager()`. Agregar permisos WiFi en `app.xml`. Métodos: `scanAvailableNetworks()`, `connect()` |
| **GpsTools** | Apps con tracking GPS, calculo de distancias, geocodificacion | Creación: `new GpsTools()`. Métodos: `distanceTo()`, `getAddressFromPosition()`, `containsLocation()`, `getLastKnownLocation()` |
| **OAuth2** | Apps con autenticación externa (Google, Microsoft, SSO corporativo) | Creación: `new OAuth2()`. Configurar `authority`, `clientID`, `clientSecret`, `scope`, `redirectUri` en `functions.js` |
| **WebSocket** | Apps con comunicación en tiempo real (chat, notificaciones push, IoT) | Creación: `new WebSocket(request)`. Configurar callbacks: `onOpen`, `onMessage`, `onError`, `onClose`. Métodos: `send()`, `close()` |
| **fingerprintManager** | Apps con autenticación biometrica (huella dactilar, Face ID) | Singleton `fingerprintManager`. Configurar callbacks `onSuccess`/`onFailure`. Métodos: `listen()`, `stopListening()` |
| **Animation** | Apps con transiciones y animaciones personalizadas en controles | Creación: `new Animation()`. Configurar `setTarget()`, `setDuration()`, efectos (`setAlpha()`, `setRotation()`, `setX()`) |
| **Animación Lottie** | Apps con loaders, checks animados o ilustraciones en movimiento | Sin objeto JS: `<prop type="IMG">` apuntando a un `.json`, `.lottie` o `.tgs`; arranca sola en bucle infinito. `repeat-mode="reverse"` para ida y vuelta; desde JS, `playAnimation` / `stopAnimation` / `setAnimationFrame`. Las fuentes que use la animación van en `fonts/`. Detalle en [fase-6-colecciones.md](fase-6-colecciones.md) §6.8b |
| **ImageDrawing** | Apps con edición de imágenes, marca de agua, timestamps en fotos | Creación: `new ImageDrawing()`. Métodos: `create()`, `setBackground()`, `addTextSetXY()`, `save()` |

#### Regla de Decisión para Integraciones

```
Al analizar los requisitos del usuario:
1. Identificar funcionalidades que requieran hardware (GPS, camara, Bluetooth, NFC)
2. Identificar funcionalidades que requieran servicios (PDF, impresion, OAuth)
3. Para cada integracion identificada:
   a. Agregar las funciones necesarias en functions.js
   b. Agregar permisos requeridos en app.xml si aplica
   c. Incluir pantallas/botones que invoquen la funcionalidad
   d. Documentar la integracion en el README.md del proyecto
```

#### Ejemplo: Impacto de Integraciones en functions.js

```javascript
// === Si el proyecto necesita escaneo de codigos QR ===
// Requiere haber declarado en el XML:
//   <prop name="MAP_CAMERA" type="VD" code-type="qr" viewmode="camerapreview"
//         width="100%" height="300p"/>
function iniciarEscaneoQR() {
    let control = getControl("MAP_CAMERA");
    if (!control) {
        ui.showToast("Camara no disponible");
        return;
    }
    control.setOnCodeScanned(function(evento) {
        self.CODIGO_BARRAS = evento.data;
        ui.refresh("CODIGO_BARRAS");
        ui.showToast("Código leido: " + evento.data);
        return true; // true = parar escaneo; false = seguir leyendo
    });
}

// === Si el proyecto necesita generacion de PDF ===
function generarReportePDF(sNombreArchivo) {
    var pdf = new XOnePDF();
    pdf.create(sNombreArchivo);
    pdf.open();
    pdf.setFont("helvetica");
    pdf.setFontSize(14);
    pdf.setFontStyle("bold");
    pdf.addTextLine("Reporte generado: " + formatearFechaHora(new Date()));
    pdf.newLine();
    // ... contenido del reporte ...
    pdf.close();
    pdf.launchPDF();
}

// === Si el proyecto necesita autenticación biométrica ===
function activarBiometria() {
    var params = {
        onSuccess: function(result) {
            ui.showToast("Autenticación exitosa");
            abrirPantalla("MenuPrincipal");
        },
        onFailure: function(nError, sErrorMessage) {
            ui.showToast("Error: " + sErrorMessage);
        }
    };
    fingerprintManager.setCallback(params);
    fingerprintManager.listen();
}
```

---


## 9. Fase 8: Eventos y Reglas de Negocio

