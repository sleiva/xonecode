# XOne JavaScript — ui: GPS, cámara, firma, escáner y timers

> Fuente: `xone/v2/xone-help-docs/topics/03b-js-ui.md` §3.5–§3.9. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §3.5 GPS (startGps completo, GpsCollection, GpsTools) y cámara/archivos (startCamera, scanDocument, recognizeText) · §3.6 firma digital · §3.7 escáner QR/barcode · §3.8 sleep y timers · §3.9 otros

---

### 3.5 GPS

```javascript
// === Iniciar GPS (modo básico) ===
ui.startGps();

// === Iniciar GPS con configuración completa ===
ui.startGps({
    nodeName                  : "callbackgps",  // Handler en la coll que recibe las actualizaciones
    timeBetweenUpdates        : 10000,          // Milisegundos entre actualizaciones
    minimumMetersDistanceRange: 10,             // Metros minimos de desplazamiento para notificar
    maxUpdateDelayMillis      : 0,
    priority                  : "high",         // high / balanced / low_power / passive
    maxUpdates                : 1000,           // Máximo de actualizaciones
    durationMs                : 3600000,        // Duracion total del servicio (1 hora)
    granularity               : "permission_level",  // permission_level / fine / coarse
    waitForAccurateLocation   : true
});

// === Detener GPS ===
ui.stopGps();

// === Comprobar estado del GPS ===
let nStatus = ui.checkGpsStatus();
// 0: No hay hardware GPS
// 1: Solo GPS activado
// 2: Solo WiFi/redes activado
// 3: Ninguno activado (pedir permiso)
// 4: GPS y WiFi/redes activados (optimo)

// === Pedir permiso de GPS al usuario ===
ui.askUserForGpsPermission({
    onEnabled: function() {
        ui.showToast("GPS activado correctamente");
    },
    onDenied: function() {
        ui.showToast("Se necesita GPS para esta funcion");
    }
});

// === GpsCollection - Leer posicion actual del GPS ===
// Convencion: el proyecto declara una coll llamada "GpsCollection" con connector GPS.
// NO es una coll built-in del framework — hay que declararla en el mapping del proyecto.
// El patron correcto es loadAll() + get(0), NO startBrowse/endBrowse.
function actualizarGps() {
    let collGps = appData.getCollection("GpsCollection");
    collGps.loadAll();
    let objGps = collGps.get(0);

    if (!objGps) return false;           // GPS no disponible
    if (objGps.STATUS != 1) return false; // Sin señal GPS
    if (!objGps.LONGITUD) return false;   // Sin cobertura GPS

    self.MAP_FAKE      = objGps.FAKE;     // 1 = localización simulada (mock)
    self.MAP_LONGITUD  = objGps.LONGITUD;
    self.MAP_LATITUD   = objGps.LATITUD;
    self.MAP_ALTITUD   = objGps.ALTITUD;
    self.MAP_VELOCIDAD = objGps.VELOCIDAD;
    self.MAP_RUMBO     = objGps.RUMBO;
    self.MAP_FGPS      = objGps.FGPS;     // Fecha GPS
    self.MAP_HGPS      = objGps.HGPS;     // Hora GPS
    self.MAP_STATUS    = objGps.STATUS;
    self.MAP_SATELITES = objGps.SATELITES;
    self.MAP_FUENTE    = objGps.FUENTE;    // Proveedor: gps, network, etc.
    self.MAP_PRECISION = objGps.PRECISION;

    ui.refreshValue("MAP_LONGITUD", "MAP_LATITUD", "MAP_ALTITUD",
                    "MAP_VELOCIDAD", "MAP_RUMBO", "MAP_STATUS",
                    "MAP_SATELITES", "MAP_FUENTE", "MAP_PRECISION");
    return true;
}

// === GpsTools - Utilidades de geolocalizacion ===

// Distancia entre dos puntos (metros)
let nMetros = new GpsTools().distanceTo([
    { latitude: 38.8685452, longitude: -6.8170906 },
    { latitude: 40.4167747, longitude: -3.70379019 }
]);

// Distancia entre dos puntos (alternativa con dos objetos)
let nMetros2 = new GpsTools().distanceBetweenCoordinates(
    { latitude: 38.87, longitude: -6.97 },
    { latitude: 40.42, longitude: -3.70 }
);

// Geocodificacion inversa: coordenadas -> dirección
let result = new GpsTools().getAddressFromPosition("38.8862106, -7.0040345");
// result: { locality, subLocality, adminArea, subAdminArea, features,
//           country, countryCode, street, number, address, postal }

// Geocodificacion directa: dirección -> coordenadas
let pos = new GpsTools().getPositionFromAddress("Badajoz");
// pos: { latitude, longitude } o null si no se encuentra

// Verificar si un punto esta dentro de un poligono
let bDentro = new GpsTools().containsLocation(
    "40.3633442, -1.0893794",  // Punto a verificar
    ["38.8685452, -6.8170906", "40.4167747, -3.70379019", "41.3850632, 2.1734035"]
);

// Ultima posicion conocida
let location = new GpsTools().getLastKnownLocation();
// location: { latitude, longitude, accuracy, altitude, bearing, speed, time }

// Codificar array de coordenadas a polyline encoded
let sEncoded = new GpsTools().encode(["38.87, -6.82", "40.42, -3.70"]);

// Decodificar polyline encoded
let locations = new GpsTools().decode("moflFxmrh@kkmHca_R");
// locations: array de { latitude, longitude }

// Simplificar polyline (reducir puntos manteniendo la forma)
let simplified = new GpsTools().simplifyPolyline({
    polyline : [{ latitude: 43.104, longitude: -3.4261 }, /* ... */],
    tolerance: 3000   // En metros. Mayor = menos vertices
});

// Añadir metadatos EXIF de localización a una imagen
new GpsTools().addExifLocationToFile({
    file     : "foto.jpg",
    latitude : 40.4165000,
    longitude: -3.7025600
});

// Calcular ruta con app externa
new GpsTools().routeTo({
    sourceLatitude     : 40.4167747,
    sourceLongitude    : -3.70379019,
    destinationLatitude : 41.3850632,
    destinationLongitude: 2.1734035,
    source             : "google_maps"  // internal / external / google_maps / osmand / osmand_plus
});
```

### 3.5 Camara y Archivos

```javascript
// === Tomar foto con la camara (prop tipo VD) ===
function takePicture() {
    let control = getControl("MAP_CAMERA");
    if (!control) return;

    control.takePicture({
        filename     : "foto_" + Date.now() + ".jpg",
        saveToGallery: true,
        width        : 360,
        height       : 360,
        onFinished   : function(sFileName) {
            if (!sFileName) {
                ui.showToast("Error de camara");
            } else {
                ui.showToast("Foto capturada");
                ui.openFile(sFileName);
            }
        }
    });
}

// === Grabar video ===
function record() {
    let control = getControl("MAP_CAMERA");
    if (!control) return;

    control.record({
        quality     : 80,
        maxDuration : 10000,    // milisegundos
        maxFileSize : 10485760, // bytes (10MB)
        withMicAudio: true,
        onFinished  : function(sFileName) {
            if (sFileName) {
                ui.openFile(sFileName);
            }
        }
    });
}

// === Controles de camara ===
control.stopRecording();
control.startPreview();
control.stopPreview();
control.isCameraOpened();
control.isAutoFocus();
control.setAutoFocus(true);
control.getSupportedAspectRatios();

// === Flash modes ===
control.setFlashMode("on");    // Siempre encendido al tomar foto
control.setFlashMode("off");   // Siempre apagado
control.setFlashMode("torch"); // Siempre encendido (linterna)
control.setFlashMode("auto");  // Automático según sensor de luz
control.setFlashMode("red_eye"); // Anti ojos rojos
let mode = control.getFlashMode();

// === Cambiar camara frontal/trasera ===
let sCamera = control.getCamera();
control.setCamera(sCamera == "front" ? "back" : "front");

// === Seleccionar archivo del dispositivo ===
ui.pickFile({
    targetProperty        : "MAP_ADJUNTO",
    fileTypes             : "jpg,png,pdf",
    allowMultipleSelection: true,
    resolveFileName       : true,
    showSearch            : true,
    initialDirectory      : appData.getFilesPath(),
    onFinishPicking       : function(sAllFiles) {
        for (let sKey in sAllFiles) {
            let file = sAllFiles[sKey];
            console.log("Nombre: " + file.name + " Extension: " + file.extension);
        }
    }
});

// === Abrir un archivo con la app predeterminada ===
ui.openFile(sPath);

// === Abrir URL en navegador externo ===
ui.openUrl("https://www.ejemplo.com");

// === FileManager ===
let fm = new FileManager();
if (fm.fileExists("archivo.txt") === 0) {
    let contenido = fm.readFile("archivo.txt");
}
fm.saveFile("archivo.txt", "contenido", false);  // false = sobreescribir
fm.delete("temporal.txt");
let nSize = fm.getSize("archivo.txt");
```

#### startCamera(params) - Capturar una foto o un vídeo sobre un campo

Abre la cámara y guarda el resultado en el campo indicado. A diferencia de `control.takePicture()`, que necesita un control de cámara en la pantalla, aquí no hace falta pintar nada: la captura ocurre en su propia pantalla y al terminar el fichero queda en el campo.

```javascript
// Foto en movimiento, con la cámara del framework
ui.startCamera({
    propName         : "MAP_FOTO",
    type             : "photo",
    useInternalCamera: true,
    motionPhoto      : true,
    onSuccess        : function(sFileName) {
        ui.showToast("Foto guardada: " + sFileName);
    },
    onCancelled      : function() {
        ui.showToast("Captura cancelada");
    }
});

// Vídeo de 30 segundos como máximo
ui.startCamera({
    propName   : "MAP_VIDEO",
    type       : "video",
    maxDuration: 30
});

// Forma corta: nombre del campo y tipo
ui.startCamera("MAP_FOTO", "photo");
```

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `propName` | string | — | Campo donde se guarda el nombre del fichero capturado |
| `type` | string | `"photo"` | `"photo"`, `"video"` o `"attach"` (este último abre el selector de ficheros en vez de la cámara) |
| `useInternalCamera` | boolean | `false` | Captura con la cámara que trae el framework en vez de abrir la app de cámara del dispositivo |
| `motionPhoto` | boolean | `false` | Captura una **foto en movimiento**: un JPG con un clip de vídeo corto embebido detrás. Solo aplica a `type: "photo"` |
| `size` | number | `0` | Tamaño máximo del fichero en KB. `0` = sin límite |
| `width` | number | `-1` | Ancho máximo de la foto en píxeles |
| `height` | number | `-1` | Alto máximo de la foto en píxeles |
| `quality` | number | `90` | Calidad JPEG de la foto (0-100) |
| `maxDuration` | number | `-1` | Duración máxima del vídeo en segundos |
| `onSuccess` | function | — | Recibe el nombre del fichero capturado |
| `onCancelled` | function | — | Se invoca si el usuario cancela la captura |

> **Las fotos en movimiento necesitan `useInternalCamera: true`.** Así funcionan en cualquier versión de Android, porque la captura y el montaje del fichero los hace el propio framework. Sin ese parámetro se delega en la app de cámara del dispositivo, que solo puede atender la petición a partir de **Android 16** y únicamente si la implementa: a día de hoy no lo hace ninguna, ni siquiera la de los Pixel, con lo que se obtiene una foto normal sin más aviso.

Al capturar una foto en movimiento se **ignoran** `size`, `width`, `height` y `quality`, porque redimensionar o recomprimir la imagen se llevaría por delante el vídeo embebido. El fichero pesa lo que la foto más el clip, del orden de varios megas.

#### scanDocument(params) - Escáner de documentos en papel

Abre el escáner de documentos del sistema: guía al usuario para encuadrar el papel, detecta los bordes, recorta y endereza la imagen automáticamente, y permite reencuadrar, aplicar filtros y añadir más páginas antes de aceptar. Es asíncrono: devuelve el control de inmediato y el resultado llega por callback.

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `mode` | string | `"base"` | `"base"` (recorte, rotación y reencuadre), `"baseWithFilters"` (añade filtros de imagen), `"full"` (añade limpieza automática de la imagen: dedos, manchas). Cualquier otro valor da error |
| `pageLimit` | number | `1` | Máximo de páginas que se pueden escanear en una sesión |
| `allowGallery` | boolean | `false` | Permite importar la imagen desde la galería en lugar de capturarla con la cámara |
| `outputJpg` | boolean | `true` | Genera un JPG por página |
| `outputPdf` | boolean | `false` | Genera además un PDF con todas las páginas |
| `onSuccess` | function | — | Recibe un array con los nombres de los ficheros generados |
| `onError` | function | — | **Obligatorio**. Recibe el mensaje de error |
| `onCancelled` | function | — | **Obligatorio**. Se invoca si el usuario cancela el escaneo |

Hay que dejar activo al menos un formato de salida: si se ponen `outputJpg` y `outputPdf` a `false`, la llamada falla.

Los ficheros se escriben en la carpeta de ficheros de la aplicación (`appData.getFilesPath()`) con el prefijo `scan_`, y el array de `onSuccess` trae **solo el nombre del fichero**, no la ruta completa: primero los JPG (uno por página, en orden) y al final el PDF, si se pidió.

```javascript
ui.scanDocument({
    mode        : "baseWithFilters",
    pageLimit   : 3,
    allowGallery: true,
    outputJpg   : true,
    outputPdf   : true,
    onSuccess   : function(aFiles) {
        for (let i = 0; i < aFiles.length; i++) {
            console.log("Escaneado: " + aFiles[i]);
        }
        // Guardar la primera página en un campo de imagen
        self.MAP_DOCUMENTO = aFiles[0];
        self.save();
    },
    onError     : function(sMessage) {
        ui.showToast("Error al escanear: " + sMessage);
    },
    onCancelled : function() {
        ui.showToast("Escaneo cancelado");
    }
});
```

El escáner lo aporta Google Play Services y su módulo se descarga bajo demanda la primera vez que se usa; en dispositivos sin servicios de Google la llamada termina en `onError`.

#### recognizeText(params) - OCR de una imagen

Reconoce el texto (alfabeto latino) de una imagen del dispositivo. Asíncrono, el resultado llega por callback. Encaja detrás de `scanDocument` para digitalizar un papel y leer su contenido.

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `path` | string | — | **Obligatorio**. Imagen a reconocer |
| `onSuccess` | function | — | **Obligatorio**. Recibe el texto (o el objeto con las líneas, si `detail`) |
| `onError` | function | — | **Obligatorio**. Recibe el mensaje de error |
| `roi` | objeto | toda la imagen | Región a reconocer: `{left, top, width, height}`. Valores ≤ 1 se interpretan como fracción del tamaño de la imagen; mayores, como píxeles |
| `scale` | number | `1` | Amplía el recorte antes de reconocer |
| `grayscale` | boolean | `false` | Desatura la imagen antes de reconocer |
| `detail` | boolean | `false` | Devuelve un objeto con las líneas y su geometría en lugar de una cadena |

Sin `roi`, `scale` ni `grayscale` la imagen se reconoce tal cual, resolviendo su rotación EXIF. En cuanto se pide cualquiera de los tres, la imagen se decodifica, se rota según EXIF y se preprocesa antes de reconocerla.

**Recortar es la palanca principal cuando el texto es pequeño** (una matrícula, la banda de caracteres del reverso de un DNI): el reconocedor reescala la imagen internamente, así que cuanto menos sobre en el encuadre, más resolución le queda a cada carácter.

Con `detail: true`, `onSuccess` recibe:

```javascript
{
    text : "…",        // el texto completo, igual que sin detail
    lines: [           // ordenadas por posición vertical
        { text: "…", confidence: 0.87, angle: 0.4,
          left: 24, top: 512, width: 640, height: 28 }
    ]
}
```

Las líneas vienen **ordenadas por su coordenada vertical**, no en el orden de los bloques reconocidos: `text` sigue el orden de los bloques, que no tiene por qué coincidir con el orden de lectura de la página.

```javascript
// Reconocer sólo la banda inferior, ampliada al doble y en escala de grises
ui.recognizeText({
    path     : "scan_a1b2c3.jpg",
    roi      : { left: 0, top: 0.62, width: 1, height: 0.38 },
    scale    : 2,
    grayscale: true,
    detail   : true,
    onSuccess: function(result) {
        for (let i = 0; i < result.lines.length; i++) {
            console.log(result.lines[i].confidence + " -> " + result.lines[i].text);
        }
    },
    onError  : function(sMessage) { ui.showToast(sMessage); }
});
```

No se puede restringir el alfabeto reconocido: el modelo es de texto latino general y aplica su propio criterio, así que sobre secuencias que no son palabras (códigos, matrículas, caracteres de control) hay que validar el resultado por otra vía — un dígito de control, una expresión regular o un formato conocido.

### 3.6 Firma Digital

La firma digital se implementa con un campo de tipo `IMG` con `readonly=false`:

```xml
<!-- En el XML -->
<prop name="MAP_FIRMA" type="IMG" visible="7" class="propFirma" />
```

```css
/* En default.css (ver topico 02 para detalles de CSS) */
.propFirma {
    img-sign: bt_Firma.png;
    img-sign-sel: bt_Firma_sel.png;
    sign-title: "Firme aquí";
    sign-clear-text: "Borrar";
    sign-save-text: "Guardar";
}
```

```javascript
// En el <onchange> de MAP_FIRMA
function onFirmaCapturada() {
    let firma = self.MAP_FIRMA;
    if (isEmpty(firma)) {
        mostrarToast("Firma cancelada");
        return;
    }
    self.MAP_FECHA_FIRMA = new Date();
    self.save();
    ui.showToast("Firma capturada");
    ui.refresh("MAP_FIRMA");
}
```

### 3.7 QR/Barcode Scanner

```javascript
// === Escaneo con camara tipo VD ===
function doSetOnCodeScanned() {
    let control = getControl("MAP_CAMERA");
    if (!control) return;

    control.setOnCodeScanned(function(evento) {
        // evento.data = valor escaneado
        // evento.type = tipo de código (qr, datamatrix, barcode, etc.)
        let nResult = ui.msgBox(
            "Valor: " + evento.data + "\nTipo: " + evento.type,
            "Código escaneado. Correcto?", 4
        );
        if (nResult == 6) {
            return true;   // Aceptar y dejar de escanear
        } else {
            return false;  // Rechazar y seguir escaneando
        }
    });
}
```

### 3.8 Sleep y Timers

```javascript
// === Sleep - BLOQUEA la UI (usar con extremo cuidado) ===
ui.sleep(3);  // Pausa de 3 segundos

// === Ejecutar acción con retardo (PREFERIDO sobre sleep) ===
// USO CORRECTO: disparar UNA acción puntual tras un retardo corto.
ui.executeActionAfterDelay("miFuncion", 5);  // Ejecuta miFuncion() tras 5 segundos

// === ATENCION: NO encadenar executeActionAfterDelay como setInterval ===
// Para temporizadores continuos (relojes, contadores, polling regular)
// usar startChronometer. Encadenar executeActionAfterDelay cada segundo
// consume mucha memoria y ralentiza el dispositivo. Ver seccion 3.10.
```

### 3.9 Otros

```javascript
// Verificar si la app esta en background
let bBackground = ui.isInBackground();

// Traer la app al frente
ui.returnToForeground();

// Enviar email
ui.sendMail("destino@email.com", "copia@email.com", "Asunto", "Cuerpo", "adjunto.pdf");

// Hacer llamada telefonica
ui.makePhoneCall("+34123456789");

// Iniciar grabacion de audio (forma con objeto de parametros; ver seccion 3.10)
ui.startAudioRecord({
    onComplete: function(sPath) { self.MAP_AUDIO = sPath; ui.refresh("MAP_AUDIO"); },
    onError:    function(sError) { ui.showToast(sError); },
    timeout: 0, outputFormat: "mp4", audioEncoder: "he_aac"
});
ui.stopAudioRecord();

// Date Picker
ui.showDatePicker({
    initialYear: 2024, initialMonth: 6, initialDay: 15,
    title: "Seleccione fecha",
    onDateSet: function(nYear, nMonth, nDay) {
        self.MAP_FECHA = nDay + "/" + nMonth + "/" + nYear;
        ui.refresh("MAP_FECHA");
    }
});

// Time Picker
ui.showTimePicker({
    initialHour: 17, initialMinute: 30, is24HoursMode: true,
    onTimeSet: function(nHours, nMinutes) {
        let h = ("0" + nHours).slice(-2);
        let m = ("0" + nMinutes).slice(-2);
        self.MAP_HORA = h + ":" + m;
        ui.refresh("MAP_HORA");
    }
});

// Drag and Drop
let control = window["MAP_CONTROL"];
ui.startDrag(control, object);
```

