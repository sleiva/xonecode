# XOne — systemSettings: referencia ampliada

> Fuente: `xone/v2/xone-project-generator/references/xone-javascript-patterns-d-createobject.md` §2.12.16b. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: segunda redacción del corpus para systemSettings, más extensa que la anterior

---

#### 2.12.16b systemSettings - Configuración y Estado del Sistema

`systemSettings` es un **singleton global** (no requiere instanciacion). Solo Android salvo indicacion.

##### Pantalla y brillo

```javascript
systemSettings.setBrightness(75);              // 0-100 (se clampa)
let nBrillo = systemSettings.getBrightness();  // 0-100 (no 0-1)
systemSettings.setBrightnessMode("automatic"); // Brillo automático
systemSettings.setBrightnessMode("manual");    // Brillo manual
let sModoBrillo = systemSettings.getBrightnessMode(); // "manual" o "automatic"

// Color de la barra de estado (status bar)
let ventana = ui.getView(self);
ventana.setStatusBarColor("#00FF00"); // Color RRGGBB
ventana.setStatusBarColor(null);      // Restaurar color por defecto
```

##### Red y conectividad

```javascript
let bAvion     = systemSettings.isAirplaneMode();       // true si modo avion activo
let bDatosMov  = systemSettings.isMobileDataEnabled();  // Puede mentir en algunos dispositivos
let bHttp      = systemSettings.isClearTextTrafficAllowed(); // true si HTTP sin cifrar esta permitido

// Hora de red (NTP)
let fecha = systemSettings.getNetworkTime();
// Con servidor NTP personalizado:
// let fecha = systemSettings.getNetworkTime({ ntpServer: "time.google.com" });
ui.showToast(fecha.toString());

// Proveedores de localización disponibles
let bLocalizacion = systemSettings.hasLocationFeature();
let bRedLoc       = systemSettings.hasNetworkLocationFeature();
let bGpsLoc       = systemSettings.hasGpsLocationFeature();
```

##### Batería y optimizaciones

```javascript
// Comprobar si la app esta exenta de optimizaciones de bateria
let bExenta = systemSettings.isIgnoringBatteryOptimizations();

// Pedir al usuario que exima la app (muestra dialogo del sistema)
if (!systemSettings.isIgnoringBatteryOptimizations()) {
    systemSettings.requestIgnoreBatteryOptimizations(true);
}

// Optimizaciones especificas de fabricante (Xiaomi, Huawei, etc.)
// No se puede consultar el estado, solo solicitar la exencion
systemSettings.requestIgnoreSpecialBatteryOptimizations();
```

##### Permisos en runtime

```javascript
// Consultar permisos declarados/concedidos/no concedidos
let aTodos       = systemSettings.getDeclaredPermissions();   // array de strings
let aConcedidos  = systemSettings.getGrantedPermissions();
let aNoConcedidos= systemSettings.getNotGrantedPermissions();

// Comprobar un permiso concreto (nombre corto XOne o nombre completo Android)
let bCamara = systemSettings.isPermissionGranted("camera");
let bBateria= systemSettings.isPermissionGranted("android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS");

// Solicitar permisos en runtime
let future = systemSettings.requestPermissions({
    requestMessage: "Por favor habilite estos permisos para usar la aplicación",
    mandatory     : false,          // false = puede continuar sin concederlos
    permissions   : ["bluetooth"]   // nombres cortos XOne
});
let bConcedidos = future.get();     // bloquea hasta respuesta del usuario

// Revocar permisos (Android >= 13)
systemSettings.revokePermissions("microphone", "camera", "phone");

// Permiso de almacenamiento externo completo (Android >= 11)
let futureStorage = systemSettings.requestExternalStoragePermission();
let bStorage = futureStorage.get();

// Permiso overlay (dibujar sobre otras apps): consultar antes de solicitar
let bOverlay = systemSettings.hasOverlayPermission();
if (!bOverlay) {
    let futureOverlay = systemSettings.requestOverlayPermission();
    bOverlay = futureOverlay.get();
}

// Permiso alarmas exactas
let futureAlarm = systemSettings.requestScheduleExactAlarmPermission();
let bAlarm = futureAlarm.get();

// Auto-revocacion de permisos (Android apaga permisos de apps sin uso)
let bAutoRevoke = systemSettings.isPermissionAutoRevokeEnabled();
if (bAutoRevoke) {
    systemSettings.requestDisablePermissionAutoRevoke();
}

// Comprobar si tiene gestion completa de almacenamiento externo
let bManager = systemSettings.isExternalStorageManager();
let bManagerPath = systemSettings.isExternalStorageManager("/sdcard/");
```

##### Memoria y rendimiento

```javascript
// Nivel de memoria actual del dispositivo
let sLevel = systemSettings.getMemoryLevel();
// Valores posibles:
// "background"       -> Uso muy ligero, app prescindible
// "moderate"         -> Uso moderado, app prescindible
// "ui_hidden"        -> Uso ligero, limpiar algunos recursos
// "running_moderate" -> Uso moderado, app visible
// "running_low"      -> Uso alto, app visible
// "running_critical" -> Uso muy alto, app visible
// "complete"         -> Dispositivo casi sin memoria

// Patron comun: solo actuar en niveles criticos
try {
    let sNivel = systemSettings.getMemoryLevel();
    if (sNivel === "running_low" || sNivel === "running_critical" || sNivel === "complete") {
        ui.showToast("El dispositivo se esta quedando sin memoria");
    }
} catch(err) {
    // Puede no estar disponible en todas las versiones
}

// Memoria de la JVM (en bytes)
let nMax   = systemSettings.getMaxMemory();
let nFree  = systemSettings.getFreeMemory();
let sMsg   = "Max: " + Math.round(nMax / 1024 / 1024) + " MB"
           + " | Libre: " + Math.round(nFree / 1024 / 1024) + " MB";

// RAM física del dispositivo (en bytes)
let nRamTotal = systemSettings.getTotalMemory();      // RAM física total instalada
let nRamLibre = systemSettings.getAvailableMemory();  // RAM física disponible ahora

// Espacio en disco (en bytes) — comprobar antes de descargas/exportaciones grandes
let nDiscoLibre = systemSettings.getInternalFreeSpace();   // libre en almacenamiento interno (app + BD)
let nDiscoTotal = systemSettings.getInternalTotalSpace();  // total del almacenamiento interno
let nExtLibre   = systemSettings.getExternalFreeSpace();   // libre en almacenamiento externo (0 si no está montado)
let nExtTotal   = systemSettings.getExternalTotalSpace();  // total del almacenamiento externo

let nMbLibres = Math.round(systemSettings.getInternalFreeSpace() / 1024 / 1024);
if (nMbLibres < 100) {
    ui.showToast("Quedan solo " + nMbLibres + " MB libres en disco");
}

// Forzar garbage collector (solicitud, no garantiza ejecución inmediata)
systemSettings.garbageCollect();

// Limpiar cache de todas las apps (requiere permiso de sistema)
systemSettings.clearAllAppsCache();

// Borrar todos los datos de la app (equivale a "Borrar datos" en ajustes)
systemSettings.clearApplicationData();

// Limpiar caches internas del framework
systemSettings.clearJavascriptCache();
systemSettings.clearBitmapCache();

// Compactar los .dex cacheados del motor JS (optimización del arranque tras muchos scripts nuevos)
systemSettings.mergeJavascriptCache();
```

##### Información del dispositivo y hardware

```javascript
// IDs de hardware
let ids = systemSettings.getHardwareIds();
// ids.deviceIdCount -> número de IDs de dispositivo
// ids.deviceId0, ids.deviceId1, ... -> IMEI u otros IDs
// ids.wifiMacAddress -> MAC WiFi (puede ser null)
// ids.androidId -> Android ID unico por instalacion

// Device ID propio del framework XOne
let sDeviceId = systemSettings.getDeviceId();
systemSettings.setDeviceId("nuevo_id"); // Solo para casos especiales

// Tiempo encendido del dispositivo
let uptime = systemSettings.getDeviceUptime();
// uptime.ms, uptime.days, uptime.hours, uptime.minutes

// Features del hardware disponibles (array de strings tipo "android.hardware.camera")
let aFeatures = systemSettings.getFeatures();

// Teclado fisico
let bTeclado  = systemSettings.hasHardwareKeyboard();  // Tiene teclado fisico
let bQwerty   = systemSettings.hasQwertyKeyboard();    // Es estilo QWERTY
let b12Teclas = systemSettings.hasTwelveKeysKeyboard();// Es estilo 12 teclas
// Devuelven true si tiene el hardware, independientemente de si usa el virtual

// Arquitectura del proceso
let b64Bit = systemSettings.is64Bit(); // true en Android M+ con proceso 64 bits

// Nombres de la app
let sPackage     = systemSettings.getPackageName();   // ej: "com.empresa.app"
let sSharedUserId= systemSettings.getSharedUserId();
```

##### Versiones de SO y de la app

```javascript
let nApiLevel    = systemSettings.getApiLevel();         // API level del SO (Build.VERSION.SDK_INT)
let sAndroidVer  = systemSettings.getAndroidVersion();   // Versión Android (Build.VERSION.RELEASE, ej: "14")
let nTargetSdk   = systemSettings.getTargetSdkVersion(); // targetSdk declarado por el APK
let nMinSdk      = systemSettings.getMinSdkVersion();    // minSdk del APK (Android >= 7 / API 24, lanza si menor)
let nVersionCode = systemSettings.getVersionCode();      // versionCode entero del APK instalado
```

##### Proceso del sistema

```javascript
let nPid      = systemSettings.getPid();            // ID del proceso actual (Process.myPid)
let nUid      = systemSettings.getUid();            // UID Linux del proceso (Process.myUid)
let nTid      = systemSettings.getTid();            // ID del hilo actual (Process.myTid)
let nPriority = systemSettings.getThreadPriority(); // Prioridad nice del hilo actual

// Matar un proceso por PID (uso avanzado: tareas de mantenimiento, reinicios programáticos)
systemSettings.killProcess(nPid);
```

##### Seguridad del dispositivo

```javascript
// Dispositivo con PIN/patron/password de bloqueo configurado.
// Si la app es Device Owner/Profile Owner consulta DevicePolicyManager;
// si no, usa KeyguardManager.isDeviceSecure().
let bSecured = systemSettings.isPasswordSecured();
```

##### Rutas del sistema de ficheros

```javascript
let sExternal     = systemSettings.getExternalStoragePath();
let sGaleria      = systemSettings.getGalleryPath();
let sDocumentos   = systemSettings.getDocumentsPath();
let sMusica       = systemSettings.getMusicPath();
let sDescargas    = systemSettings.getDownloadsPath();
let sCapturas     = systemSettings.getScreenshotsPath();
let sTonos        = systemSettings.getRingtonesPath();
let sAlarmas      = systemSettings.getAlarmsPath();
```

##### Wallpaper

```javascript
systemSettings.setWallpaper("wallpaper.png");  // Fichero en carpeta de la app
systemSettings.getWallpaper(appData.getAppPath() + "files/wallpaper_guardado.png");
// getWallpaper guarda el wallpaper actual en la ruta indicada
```

##### Acceso directo en pantalla de inicio (Pin Shortcut)

```javascript
systemSettings.addPinShortcut({
    id   : 1000,
    label: "Nombre del acceso directo",
    icon : "icono.png",         // Fichero PNG en carpeta de la app
    extras: {                   // Datos extra que recibira la app al pulsar
        parametro1: "valor1",
        parametro2: "valor2"
    }
});
```

##### Estado de la app y restricciones

```javascript
let bRestringida  = systemSettings.isBackgroundRestricted();    // Ejecución en background restringida
let bDatosRestr   = systemSettings.isBackgroundDataDisabled();  // Datos en background restringidos
let bInactiva     = systemSettings.isAppInactive();             // App marcada como inactiva por el SO
let sRestriction  = systemSettings.getAppRestrictionStatus();   // Estado de restriccion de la app
systemSettings.showAppSettingsWindow();                         // Abre los ajustes de la app en el sistema (devuelve el propio systemSettings, encadenable)

// Actualizacion desde Google Play
// Devuelve true si hay actualizacion pendiente (y lanza el dialogo de actualizacion)
// Detener el script si devuelve true para no continuar con la app desactualizada
// Parametro opcional: "immediate" (obligatoria) o "flexible" (se puede posponer)
let bUpdate = systemSettings.checkMarketUpdate();
// let bUpdate = systemSettings.checkMarketUpdate("flexible");
if (bUpdate) {
    return; // Detener ejecución hasta que el usuario actualice
}
```

##### Perfil de trabajo y MDM

```javascript
let bWorkProfile  = systemSettings.isRunningInWorkProfile();    // MDM con perfil de trabajo XOne
let bDeviceOwner  = systemSettings.isRunningWithDeviceOwner();  // MDM en modo kiosko XOne
let bHayMdm       = systemSettings.isRunningInMdm();            // Cualquier MDM activo
let bIntune       = systemSettings.isRunningInMdm("com.microsoft.windowsintune.companyportal");
let bXoneMdm      = systemSettings.isRunningInMdm("com.xone.live.services");
// isRunningInMdm acepta el package name del MDM a comprobar
```

##### XOneLive: widgets y configuración

```javascript
// Widgets de la barra de notificaciones
systemSettings.enableReplicatorWidget();
systemSettings.disableReplicatorWidget();
systemSettings.enableLiveWidget();
systemSettings.disableLiveWidget();

// Configuración actual de XOneLive (objeto JS con todos los parametros)
let jsConfig = systemSettings.getLiveConfig();
```

##### Depuracion e integridad

```javascript
// Integridad del dispositivo (detecta root, emuladores, manipulacion)
let bIntegro = systemSettings.isDeviceIntegrityOk();

// Token de integridad de Google Play (para verificar en servidor)
let sToken = systemSettings.getIntegrityToken("nonce_unico_por_peticion");

// Depurador conectado (util para detectar manipulacion en produccion)
let bDebugger = systemSettings.isDebuggerConnected();

// Activar/desactivar modo debug del framework en tiempo de ejecución
let bDebugMode = !appData.isDebugMode();
appData.setDebugMode(bDebugMode);
```

##### Accesibilidad

```javascript
let bAccesibilidad   = systemSettings.isAccessibilityEnabled();
let bTalkBack        = systemSettings.isTouchExplorationEnabled(); // TalkBack activo
let bAutoStart       = systemSettings.isAutoStartEnabled();        // App en autoarranque
```

##### Ajustes del sistema (propiedades directas)

```javascript
// AUTO_TIME: hora automática de red
// Solo se puede escribir en Android < 4.2 (SDK < 17). En versiones superiores es de solo lectura.
let nSdkVersion = appData.getGlobalMacro("##DEVICE_OSSDKCODE##");
if (nSdkVersion < 17) {
    systemSettings.AUTO_TIME = 1; // Forzar hora automática
} else {
    let nAutoTime = systemSettings.AUTO_TIME; // Solo lectura
    // Equivalente: systemSettings.isNetworkAutoTimeEnabled()
}
```

##### Certificados (solo Android < 11)

```javascript
systemSettings.installCertificate({
    name: "Nombre descriptivo del certificado",
    file: "certificado.pem"  // Fichero en carpeta de la app
});
```

##### Intune (Microsoft Intune MDM)

```javascript
let bIntune      = systemSettings.isIntuneCompilation();           // App compilada con soporte Intune
let sPinRequired = systemSettings.isIntunePinRequired();           // PIN de Intune requerido
let sIntuneId    = systemSettings.getIntuneId();                   // ID del dispositivo en Intune
let bOutdated    = systemSettings.isIntuneAgentOutdated();         // Agente Intune desactualizado
let sMsg         = systemSettings.getIntuneAgentOutdatedMessage(); // Mensaje de actualizacion
```

##### Firebase Analytics

Sólo funciona en flavors compilados con Firebase Analytics. En builds sin Analytics ambos métodos devuelven `false` y registran un aviso en log.

```javascript
// Activar / desactivar Analytics en runtime (cumplir RGPD/opt-out del usuario)
systemSettings.setAnalyticsEnabled(true);
systemSettings.setAnalyticsEnabled(false);

// Registrar evento personalizado:
//   - La clave "eventTag" del objeto es el nombre del evento Firebase
//   - El resto de claves se envían como parámetros del evento
systemSettings.logAnalyticsEvent({
    eventTag : "purchase_completed",
    sku      : "item_001",
    amount   : 9.99,
    currency : "EUR"
});
```

