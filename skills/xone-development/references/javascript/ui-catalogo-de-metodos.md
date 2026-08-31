# XOne JavaScript — ui: métodos adicionales y catálogo completo

> Fuente: `xone/v2/xone-help-docs/topics/03b-js-ui.md` §3.10–§3.11. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §3.10 métodos adicionales (executeActionAfterDelay, startChronometer, API de controles Stepper y OTP, speak/recognizeSpeech, startAudioRecord) · §3.11 catálogo completo de métodos de ui

---

### 3.10 Métodos Adicionales de ui

#### refreshValue(fieldName) - Refrescar Valor de Campo

Refresca solo el valor de un campo especifico sin reconstruir la vista del control. Más ligero que `ui.refresh()`:

```javascript
ui.refreshValue("MAP_CAMPO");
```

#### refreshContentRow(contentName, index) - Refrescar Fila de Content

Refresca una fila especifica de un content sin recargar toda la lista:

```javascript
ui.refreshContentRow("@content", 0);  // Refresca la primera fila
ui.refreshContentSelectedRow("MAP_CONTENT");  // Refresca la fila seleccionada
```

#### captureImage(targetVariable, controlName) - Capturar Imagen

```javascript
ui.captureImage("variable_imagen", "nombre_control");
```

#### shareData(text, subject, attachment) - Compartir Datos

```javascript
ui.shareData("Texto a compartir", "Asunto del mensaje", "archivo_adjunto.jpg");
```

#### showDatePicker(params) / showTimePicker(params) - Selectores de Fecha y Hora

```javascript
ui.showDatePicker({
    initialYear: 2024,
    initialMonth: 6,
    initialDay: 15,
    title: "Seleccione fecha",
    onDateSet: function(nYear, nMonth, nDay) {
        self.MAP_FECHA = nDay + "/" + nMonth + "/" + nYear;
        ui.refresh("MAP_FECHA");
    }
});

ui.showTimePicker({
    initialHour: 17,
    initialMinute: 30,
    is24HoursMode: true,
    onTimeSet: function(nHours, nMinutes) {
        var h = ("0" + nHours).slice(-2);
        var m = ("0" + nMinutes).slice(-2);
        self.MAP_HORA = h + ":" + m;
        ui.refresh("MAP_HORA");
    }
});
```

#### speak(params) - Text-to-Speech

Sintetiza voz a partir de texto.

| Parámetro | Descripción |
| --- | --- |
| **language** | Idioma: `"es"`, `"en"`, ... |
| **text** | Texto que se va a pronunciar. |
| **speechRate** | Ritmo de habla en milisegundos. |
| **onCompleted** | Callback `function()` al terminar de hablar. |

```javascript
ui.speak({
    language   : "es",
    text       : "El proceso ha finalizado correctamente",
    speechRate : 120,
    onCompleted: function() {
        // p.ej. arrancar aquí el reconocimiento de la respuesta
    }
});
```

#### recognizeSpeech(params) - Speech-to-Text

| Parámetro | Descripción |
| --- | --- |
| **language** | Idioma del reconocedor (`"es"`, `"en"`, ...). |
| **timeoutAfterSilence** | Milisegundos de silencio antes de cortar la escucha. |
| **characterLimit** | *(Opcional)* Número máximo de caracteres a reconocer. |
| **onRecognize** | Callback `function(sText)` con el texto reconocido. |
| **onError** | Callback `function(nErrorCode, sError)` con el error. |
| **onPartialResults** | *(Opcional)* Callback `function(extras)` con resultados parciales. |
| **onEndOfSpeech** | *(Opcional)* Callback `function()` al terminar la locucion del usuario. |

```javascript
ui.recognizeSpeech({
    language: "es",
    timeoutAfterSilence: 10000,
    onRecognize: function(sText) {
        self.MAP_TEXT = sText;
        ui.refreshValue("MAP_TEXT");
    },
    onError: function(nErrorCode, sError) {
        ui.msgBox("Error " + nErrorCode + ": " + sError, "Reconocimiento", 0);
    }
});
```

> **Patron combinado (voz bidireccional):** usar `onCompleted` de `ui.speak` para arrancar `ui.recognizeSpeech`, de modo que el microfono solo empiece a escuchar cuando el dispositivo ha acabado de hablar (evita que el reconocedor capte la propia síntesis).

#### startAudioRecord(params) / stopAudioRecord() - Grabacion de Audio

| Parámetro | Descripción |
| --- | --- |
| **onComplete** | Callback `function(sPath)` con la ruta del fichero al terminar. |
| **onError** | Callback `function(sError)` con el mensaje de error. |
| **timeout** | Duración máxima en segundos. `0` = infinito. |
| **outputFormat** | *(Opcional)* `wav`, `3gp`, `mp4`, `amr_nb`, `amr_wb`, `aac_adts`, `mp2_ts`, `webm`, `ogg`. |
| **audioEncoder** | *(Opcional)* `amr_nb`, `amr_wb`, `aac`, `he_aac`, `aac_eld`, `vorbis`, `opus`. |

```javascript
ui.startAudioRecord({
    onComplete: function(sPath) {
        self.MAP_AUDIO = sPath;
        ui.refresh("MAP_AUDIO");
    },
    onError: function(sError) { ui.showToast("Error: " + sError); },
    timeout: 0,
    outputFormat: "mp4",
    audioEncoder: "he_aac"
});

ui.stopAudioRecord();
```

> **`stopAudioRecord()` finaliza la grabación de forma asíncrona.** No deja el fichero listo en la línea siguiente: corta la captura y cierra el archivo en segundo plano, y el audio solo está completo cuando se dispara `onComplete(sPath)`. Tanto si la grabación termina sola por `timeout` como si la paras a mano con `stopAudioRecord()`, el final pasa por el mismo `onComplete`; haz ahí cualquier uso del fichero (subirlo, reproducirlo, transcribirlo con la IA), nunca justo después de la llamada a `stopAudioRecord()`.

> **Para transcribir voz con la IA on-device (objeto `ai` / Gemma), graba en `wav`.** El formato por defecto es `mp4` (códec AAC), que el motor de IA **no admite**. Usa `outputFormat: "wav"` (produce WAV PCM de 16 bits, 16 kHz, mono, justo el formato recomendado por el modelo) y limita la duración con `timeout: 30` (máximo de audio que acepta Gemma). La ruta que llega al `onComplete` se pasa tal cual como `audio`:

```javascript
ui.startAudioRecord({
    outputFormat: "wav",          // imprescindible: el default mp4/AAC no lo acepta la IA
    timeout: 30,                  // segundos; 30 = máximo de audio que admite Gemma
    onComplete: function(sPath) {
        // el modelo debe estar cargado con audioBackend (ver objeto ai)
        var sTexto = ai.generate({ prompt: "Transcribe el audio en español.", audio: sPath });
        self.TRANSCRIPCION = sTexto;
        ui.refresh("TRANSCRIPCION");
    },
    onError: function(sError) { ui.showToast(sError); }
});
```

> `ai.generate` es síncrono y bloquea mientras transcribe; si el `onComplete` se ejecuta en el hilo de UI, lánzalo en segundo plano o usa `ai.chat({audio, onComplete})` para no congelar la pantalla.

#### addCalendarItem(params) - Agregar Evento al Calendario

```javascript
ui.addCalendarItem({
    title      : "Reunion con cliente",
    startDate  : "2024-06-15 10:00",
    endDate    : "2024-06-15 11:00",
    description: "Reunion de seguimiento",
    location   : "Oficina central"
});
```

#### executeActionAfterDelay(action, seconds) - Ejecución con Retardo

Ejecuta una acción (definida como nodo XML del mismo nombre, o función JS global) después de un retardo en **segundos**. Equivalente conceptual a `setTimeout()` **para un solo disparo**.

```javascript
// Uso correcto: una sola acción tras un retardo corto
ui.executeActionAfterDelay("miFuncion", 5);

// Típico de una pantalla de bienvenida: ejecutar una acción a los 2 segundos
ui.executeActionAfterDelay("irAMenuPrincipal", 2);
```

> **ATENCION — antipatron a evitar:** **NO** encadenar `executeActionAfterDelay` recursivamente para simular un `setInterval` (que la acción se vuelva a programar a si misma cada segundo). Aunque tecnicamente funcione, **consume mucha memoria y ralentiza el dispositivo** porque acumula overhead en cada iteración.
>
> **Cuándo usar `executeActionAfterDelay`:** acciones puntuales (un toast tras X segundos, redirigir desde una pantalla de bienvenida tras un retardo, mostrar un aviso único).
>
> **Cuando NO:** temporizadores continuos, relojes, polling regular. Para esos casos usar **`control.startChronometer`** (siguiente sección).

```javascript
// MAL — patron prohibido (auto-encadenado para repetir cada segundo)
function onSetTime() {
    actualizarTemporizador();
    if (self.MAP_ACTIVO == 1) {
        ui.executeActionAfterDelay("onSetTime", 1);  // <-- consume memoria, no hacer
    }
}

// BIEN — para reloj/cronometro continuo, usar control.startChronometer (siguiente seccion)
```

#### startChronometer / stopChronometer - Cronometros continuos

> **CLAVE:** `startChronometer` y `stopChronometer` **NO son métodos de `ui.*`**, son métodos de un **control** (un nodo `<prop>` de la pantalla, típicamente `type="T"`). Hay que obtener el control primero.

Es la API correcta para mostrar un cronometro/reloj continuo en pantalla **sin penalizar memoria** (lo gestiona la plataforma, no encadena timers JavaScript).

**Firma:**
```
control.startChronometer(jsOptions);  // arranca
control.stopChronometer();             // detiene
```

| Campo        | Tipo   | Descripción |
|--------------|--------|-------------|
| `fromDate`   | Date   | Fecha desde la que arranca el cronometro. Típico: `new Date()`. |
| `dateFormat` | string | Formato de visualizacion. Ej. `"mm:ss"`, `"HH:mm:ss"`. |

**Ejemplo completo (XML + JS):**

```xml
<coll name="Menu" notab="true" special="true">
    <group name="General" id="1" align="center">
        <prop name="MAP_T"     type="T" visible="7" labelwidth="0"
              width="80%" height="10%" />
        <prop name="MAP_START" type="B" visible="7"
              width="80%" height="10%" title="Start"
              onclick="start('MAP_T');" />
        <prop name="MAP_STOP"  type="B" visible="7"
              width="80%" height="10%" title="Stop"
              onclick="stop('MAP_T');" />
    </group>
</coll>
```

```javascript
function start(sPropName) {
    let control = getControl(sPropName);
    if (!control) return;
    let jsOptions = {
        fromDate  : new Date(),
        dateFormat: "mm:ss"
    };
    control.startChronometer(jsOptions);
}

function stop(sPropName) {
    let control = getControl(sPropName);
    if (!control) return;
    control.stopChronometer();
}
```

> **NO existe `ui.startChronometer(...)`** — es método del control, no del objeto global `ui`.

#### API de controles Stepper (`<prop type="N" viewmode="stepper">`)

Los controles con `viewmode="stepper"` exponen estos métodos:

| Método | Efecto |
|--------|--------|
| `control.getValue()` | Devuelve el valor actual como entero |
| `control.setValue(n)` | Asigna el valor (se clampa al rango `[min, max]`) |
| `control.setMin(n)` | Cambia el mínimo en runtime |
| `control.setMax(n)` | Cambia el máximo en runtime |
| `control.setStepSize(n)` | Cambia el incremento (debe ser `> 0`) |

```javascript
function onTipoChange() {
    var ctrl = getControl("CANTIDAD");
    if (self.TIPO === "PACK_GRANDE") {
        ctrl.setMin(10);
        ctrl.setMax(500);
        ctrl.setStepSize(10);
    } else {
        ctrl.setMin(1);
        ctrl.setMax(99);
        ctrl.setStepSize(1);
    }
}
```

Ver tópico 02 (sub-archivo 02b §5.9.17b) para el detalle XML.

#### API de controles OTP (props con `viewmode="otp"` sobre `type="T"` o `type="N"`)

| Método | Efecto |
|--------|--------|
| `control.getOtpValue()` | Devuelve el valor combinado de todas las cajas como string |
| `control.clearOtp()` | Limpia todas las cajas y pone el foco en la primera |
| `control.focusOtp()` | Pone el foco en la primera caja vacia |

```javascript
function onOtpChange() {
    var sCode = getControl("CODIGO_VERIFICACION").getOtpValue();
    if (sCode.length !== 6) return;
    if (sCode === self.CODIGO_ESPERADO) {
        ui.showToast("Código correcto");
        ui.openEditView("PantallaPrincipal");
    } else {
        ui.showToast("Código incorrecto");
        getControl("CODIGO_VERIFICACION").clearOtp();
    }
}
```

El valor se persiste en el `dataObject` como **string concatenado sin separadores** (ej. `"123456"`). Ver tópico 02 (sub-archivo 02b §5.9.17c) para la definición XML.

#### sleep(seconds) - Pausa de Ejecución

**Precaucion:** Bloquea la interfaz de usuario. Preferir `executeActionAfterDelay()`:

```javascript
ui.sleep(3);  // Pausa de 3 segundos (BLOQUEA la UI)
```

#### Otros Métodos Útiles

```javascript
var bBackground = ui.isInBackground();
ui.returnToForeground();
ui.makePhoneCall("+34123456789");
ui.sendMail("destino@email.com", "copia@email.com", "Asunto", "Cuerpo", "adjunto.pdf");

// Reproducir sonido y/o vibrar
ui.playSoundAndVibrate({ sound: "sonido.mp3", vibrate: true, continuePlaying: false });
ui.stopPlaySoundAndVibrate();
ui.vibrate();

// Verificar conectividad
var wifiOn = ui.isWifiEnabled();
var btStatus = ui.getBluetoothStatus();
ui.setBluetoothStatus(true);

// Iniciar replica desde ui
ui.startReplica();
```

### 3.11 Referencia completa: catálogo de métodos del objeto `ui`

La siguiente tabla lista **todos los métodos** expuestos por el objeto global `ui` con una descripción breve. Para los métodos con parámetros complejos consulta los ejemplos detallados en las secciones 3.1-3.10.

| Método | Descripción |
| --- | --- |
| **addCalendarItem** | Añadir item al calendario. |
| **askUserForGPSPermission** | Solicitar al usuario permiso para GPS. |
| **canMakePhoneCall** | Comprueba si se puede hacer una llamada de teléfono. |
| **captureImage** | Capturar imagen. |
| **checkGPSStatus** | Comprobar el status del GPS. |
| **clearDrawing** | Eliminar el dibujo/firma. |
| **createShortcut** | Crear acceso directo. |
| **deleteShortcut** | Borrar acceso directo. |
| **dismissNotification** | Rechazar/ocultar una notificación. |
| **drawMapRoute** | Dibujar ruta en el mapa. |
| **endPrint** | Finalizar impresión. |
| **ensureVisible** | Asegurar que el control sea visible (scroll). |
| **executeActionAfterDelay** | Ejecutar acción tras un retraso. |
| **getLastKnownLocation** | Obtener la última localización conocida. |
| **getLastKnownLocationAccuracy** | Precisión de la última localización conocida. |
| **getLastKnownLocationAltitude** | Altitud de la última localización conocida. |
| **getLastKnownLocationBearing** | Marcación de la última localización conocida. |
| **getLastKnownLocationDateTime** | Fecha y hora de la última localización conocida. |
| **getLastKnownLocationLatitude** | Latitud de la última localización conocida. |
| **getLastKnownLocationLongitude** | Longitud de la última localización conocida. |
| **getLastKnownLocationProvider** | Proveedor de la última localización conocida. |
| **getLastKnownLocationSpeed** | Velocidad de la última localización conocida. |
| **getMaxSoundVolumen** | Máximo volumen de sonido. |
| **getSoundVolumen** | Volumen de sonido actual. |
| **getView** | Obtener la vista actual (p.ej. `ui.getView(self)`). |
| **hideGroup** | Ocultar grupo. |
| **hideNavigationDrawer** | Ocultar cajón de navegación. |
| **hideSoftwareKeyboard** | Ocultar teclado del software. |
| **hideWaitDialog** | Ocultar diálogo de espera. |
| **injectJavascript** | Inyectar Javascript. |
| **isApplicationInstalled** | Comprobar si una aplicación está instalada. |
| **isOnCall** | Comprobar si el dispositivo está en llamada. |
| **isSuperuserAvailable** | Comprobar si hay super usuario disponible. |
| **isTaskKillerInstalled** | Comprobar si hay instalador de cierre de tareas. |
| **isWifiConnected** | Comprobar si la wifi está conectada. |
| **isWifiEnabled** | Comprobar si la wifi está activada. |
| **launchApp** | Lanzar aplicación. |
| **launchApplication** | Lanzar aplicación (alias). |
| **lineFeed** | Salto de línea (impresión). |
| **lockGroup** | Bloquear grupo. |
| **makePhoneCall** | Hacer una llamada desde el dispositivo. |
| **mergeImagesLeftToRight** | Fusionar imágenes de izquierda a derecha. |
| **msgBox** | Mostrar caja de mensaje. |
| **msgBoxWithSound** | Mostrar caja de mensaje con sonido. |
| **openEditView** | Abrir vista edición. |
| **openFile** | Abrir un archivo. |
| **openMenu** | **Legacy** — usar `openEditView` para abrir pantallas. Sólo útil para el caso especial de lanzar directamente la LISTA de una coll: `openMenu(collName, mask, 0)`. Ver §3.1. |
| **openUrl** | Abrir URL. |
| **pickFile** | Seleccionar archivo. |
| **playSoundAndVibrate** | Reproducir sonido y vibración. |
| **playSoundVolumen** | Reproducir con volumen de sonido. |
| **print** | Imprimir. |
| **printBarcode** | Imprimir código de barras. |
| **printBIDI** | Imprimir BIDI. |
| **printCommand** | Imprimir comando. |
| **printImage** | Imprimir imagen. |
| **printLine** | Línea de impresión. |
| **printPDF** | Imprimir PDF. |
| **quitApp** | Salir de la aplicación. |
| **recognizeSpeech** | Reconocimiento de voz. Ver sección 3.10. |
| **recognizeText** | OCR de una imagen del dispositivo (alfabeto latino). Ver sección 3.5. |
| **refresh** | Refrescar (se le pueden pasar nombres de props a refrescar). |
| **refreshContentRow** | Refrescar la línea de un content. |
| **refreshContentSelectedRow** | Refrescar el content en la fila seleccionada. |
| **refreshValue** | Refrescar el valor de un campo. |
| **relayout** | Rediseñar la página. |
| **restartApp** | Reiniciar la aplicación. |
| **returnToForeground** | Volver al primer plano. |
| **returnToMainMenu** | Volver al menú principal. |
| **saveDrawing** | Guardar dibujo/firma. |
| **scanDocument** | Escanear un documento en papel con la cámara (recorte y enderezado automáticos, JPG y/o PDF). Ver sección 3.5. |
| **sendMail** | Enviar un email. |
| **sendSMS** | Enviar SMS. |
| **setFeedMode** | Ajustar modo de alimentación (impresión). |
| **setLanguage** | Ajustar idioma. |
| **setMaxWaitDialog** | Establecer el máximo del diálogo de espera (progreso). |
| **setNotificationLed** | Ajustar LED de notificación. |
| **setSelection** | Ajustar selección. |
| **shareData** | Compartir datos. |
| **sharedData** | Datos compartidos. |
| **showConsoleReplica** | Mostrar la consola de réplica. |
| **showDatePicker** | Mostrar selector de fecha. |
| **showGroup** | Mostrar grupo. |
| **showNavigationDrawer** | Mostrar cajón de navegación. |
| **showNotification** | Mostrar notificación. |
| **showSnackbar** | Mostrar snackbar. |
| **showSoftwareKeyboard** | Mostrar teclado del software. |
| **showTimePicker** | Mostrar selector de hora. |
| **showToast** | Mostrar toast. |
| **showWaitDialog** | Mostrar diálogo de espera. |
| **signDataObject** | Firmar data object. |
| **sleep** | Dormir (pausa). |
| **speak** | Síntesis de voz (text-to-speech). Ver sección 3.10. |
| **startAudioRecord** | Comenzar grabación de audio. Ver sección 3.10. |
| **startCamera** | Abrir la cámara y guardar la foto o el vídeo en un campo, con opción de foto en movimiento. Ver sección 3.5. |
| **startGps** | Iniciar GPS. |
| **startGpsV1** | Iniciar Gpsv1. |
| **startGpsV2** | Iniciar Gpsv2. |
| **startKioskMode** | Iniciar modo kiosko. |
| **startPrint** | Comenzar la impresión. |
| **startReplica** | Comenzar la réplica. |
| **startSignature** | Iniciar firma. |
| **startWifi** | Iniciar la wifi. |
| **stopAudioRecord** | Detener grabación de audio. |
| **stopGps** | Detener GPS. |
| **stopGpsV1** | Detener Gpsv1. |
| **stopGpsV2** | Detener Gpsv2. |
| **stopKioskMode** | Detener modo kiosko. |
| **stopPlaySoundAndVibrate** | Detener reproducción de sonido y vibración. |
| **stopReplica** | Detener réplica. |
| **stopWifi** | Para detener la wifi. |
| **takePhoto** | Tomar foto. |
| **toggleGroup** | Cambiar el estado de la visibilidad del grupo. |
| **uninstallApplication** | Desinstalar la aplicación. |
| **unlockGroup** | Desbloquear grupo. |
| **updateWaitDialog** | Actualizar diálogo de espera. |
| **useLastPrinter** | Utilizar la última impresora. |

