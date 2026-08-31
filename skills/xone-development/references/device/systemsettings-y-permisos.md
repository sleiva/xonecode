# XOne — systemSettings: permisos, estado del sistema y MDM

> Fuente: `xone/v2/xone-help-docs/topics/03d-js-createobject.md` §8.11b. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §8.11b systemSettings: permisos en runtime con futures, brillo, red, batería, memoria y espacio, hardware, rutas, MDM, XOneLive e Intune

---

### 8.11b systemSettings - Configuración y Estado del Sistema

`systemSettings` es un **singleton global** — no requiere instanciacion. Solo Android salvo indicacion expresa.

#### Pantalla y brillo

```javascript
systemSettings.setBrightness(75);              // 0-100
let nBrillo = systemSettings.getBrightness();  // 0-100
systemSettings.setBrightnessMode("automatic"); // Brillo automático
systemSettings.setBrightnessMode("manual");    // Brillo manual
let sModo   = systemSettings.getBrightnessMode(); // "manual" o "automatic"

// Color de la barra de estado
let ventana = ui.getView(self);
ventana.setStatusBarColor("#1565C0");  // Color RRGGBB
ventana.setStatusBarColor(null);       // Restaurar color por defecto
```

#### Red y conectividad

```javascript
let bAvion    = systemSettings.isAirplaneMode();
let bDatosMov = systemSettings.isMobileDataEnabled(); // Puede mentir en algunos dispositivos
let bHttp     = systemSettings.isClearTextTrafficAllowed();

// Hora de red NTP
let fecha = systemSettings.getNetworkTime();
// Con servidor personalizado:
// let fecha = systemSettings.getNetworkTime({ ntpServer: "time.google.com" });

// Proveedores de localización disponibles
let bLoc  = systemSettings.hasLocationFeature();
let bRed  = systemSettings.hasNetworkLocationFeature();
let bGps  = systemSettings.hasGpsLocationFeature();
```

#### Batería y optimizaciones

```javascript
let bExenta = systemSettings.isIgnoringBatteryOptimizations();

// Pedir exencion de optimizaciones de bateria
if (!systemSettings.isIgnoringBatteryOptimizations()) {
    systemSettings.requestIgnoreBatteryOptimizations(true);
}

// Optimizaciones especificas de fabricante
systemSettings.requestIgnoreSpecialBatteryOptimizations();
```

#### Permisos en runtime

```javascript
// Consultar permisos
let aTodos        = systemSettings.getDeclaredPermissions();
let aConcedidos   = systemSettings.getGrantedPermissions();
let aNoConcedidos = systemSettings.getNotGrantedPermissions();

// Comprobar permiso (nombre corto XOne o nombre completo Android)
let bCamara  = systemSettings.isPermissionGranted("camera");
let bBateria = systemSettings.isPermissionGranted("android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS");

// Solicitar permisos en runtime — future.get() bloquea hasta respuesta del usuario
let future = systemSettings.requestPermissions({
    requestMessage: "Habilite estos permisos para usar la aplicación",
    mandatory     : false,
    permissions   : ["bluetooth"]
});
let bConcedidos = future.get();

// Revocar permisos (Android >= 13) — devuelve el propio systemSettings (encadenable)
systemSettings.revokePermissions("microphone", "camera");

// Permisos especiales (cada uno devuelve un Future)
let futureStorage = systemSettings.requestExternalStoragePermission();
let bStorage      = futureStorage.get();

// Overlay (dibujar sobre otras apps): primero consultar, después solicitar
let bOverlay = systemSettings.hasOverlayPermission();
if (!bOverlay) {
    let futureOverlay = systemSettings.requestOverlayPermission();
    bOverlay = futureOverlay.get();
}

let futureAlarm   = systemSettings.requestScheduleExactAlarmPermission();
let bAlarm        = futureAlarm.get();

// Auto-revocacion de permisos
if (systemSettings.isPermissionAutoRevokeEnabled()) {
    systemSettings.requestDisablePermissionAutoRevoke();
}

let bManager = systemSettings.isExternalStorageManager();
```

#### Memoria y rendimiento

```javascript
// Nivel de memoria actual
let sLevel = systemSettings.getMemoryLevel();
// Valores: "background", "moderate", "ui_hidden",
//          "running_moderate", "running_low", "running_critical", "complete"

try {
    let sNivel = systemSettings.getMemoryLevel();
    if (sNivel === "running_low" || sNivel === "running_critical" || sNivel === "complete") {
        ui.showToast("El dispositivo se esta quedando sin memoria");
    }
} catch(err) { /* puede no estar disponible en todas las versiones */ }

// Memoria de la JVM (en bytes)
let nMax  = systemSettings.getMaxMemory();
let nFree = systemSettings.getFreeMemory();

// RAM física del dispositivo (en bytes)
let nRamTotal = systemSettings.getTotalMemory();      // RAM física total instalada
let nRamLibre = systemSettings.getAvailableMemory();  // RAM física disponible ahora

// Espacio en disco (en bytes) — útil antes de descargas/exportaciones grandes
let nDiscoLibre = systemSettings.getInternalFreeSpace();   // libre en almacenamiento interno (app + BD)
let nDiscoTotal = systemSettings.getInternalTotalSpace();  // total del almacenamiento interno
let nExtLibre   = systemSettings.getExternalFreeSpace();   // libre en almacenamiento externo (0 si no está montado)
let nExtTotal   = systemSettings.getExternalTotalSpace();  // total del almacenamiento externo

let nMbLibres = Math.round(systemSettings.getInternalFreeSpace() / 1024 / 1024);
if (nMbLibres < 100) {
    ui.showToast("Quedan solo " + nMbLibres + " MB libres en disco");
}

systemSettings.garbageCollect();    // Devuelve el propio systemSettings (encadenable)
systemSettings.clearAllAppsCache();
systemSettings.clearApplicationData();
systemSettings.clearJavascriptCache();
systemSettings.clearBitmapCache();
systemSettings.mergeJavascriptCache(); // Compacta los .dex cacheados del motor JS
```

#### Información del dispositivo y hardware

```javascript
// Fabricante, modelo y marca del dispositivo
let sFabricante = systemSettings.getManufacturer(); // ej: "samsung"
let sModelo     = systemSettings.getDeviceModel();  // ej: "SM-G991B"
let sMarca      = systemSettings.getBrand();        // ej: "samsung"
// (equivalen a las macros globales ##DEVICE_MANUFACTURER## y ##DEVICE_MODEL##)

// IDs de hardware
let ids = systemSettings.getHardwareIds();
// ids.deviceIdCount, ids.deviceId0, ids.deviceId1, ... (IMEI)
// ids.wifiMacAddress, ids.androidId

let sDeviceId = systemSettings.getDeviceId();
systemSettings.setDeviceId("nuevo_id");

// Dispositivo con PIN/patron/password de bloqueo configurado
// Si la app es Device Owner / Profile Owner consulta DevicePolicyManager,
// si no, usa KeyguardManager.isDeviceSecure().
let bSecured = systemSettings.isPasswordSecured();

// Tiempo encendido del dispositivo
let uptime = systemSettings.getDeviceUptime();
// uptime.ms, uptime.days, uptime.hours, uptime.minutes

// Hardware disponible
let aFeatures = systemSettings.getFeatures();

// Teclado fisico
let bTeclado  = systemSettings.hasHardwareKeyboard();
let bQwerty   = systemSettings.hasQwertyKeyboard();
let b12Teclas = systemSettings.hasTwelveKeysKeyboard();

// Arquitectura del proceso
let b64Bit = systemSettings.is64Bit();

// Nombres de la app
let sPackage     = systemSettings.getPackageName();
let sSharedUserId= systemSettings.getSharedUserId();
```

#### Versiones de SO y de la app

```javascript
let nApiLevel    = systemSettings.getApiLevel();         // API level del SO (Build.VERSION.SDK_INT)
let sAndroidVer  = systemSettings.getAndroidVersion();   // Build.VERSION.RELEASE (ej: "14")
let nTargetSdk   = systemSettings.getTargetSdkVersion(); // targetSdk del APK
let nMinSdk      = systemSettings.getMinSdkVersion();    // minSdk del APK (Android >= 7 / API 24)
let nVersionCode = systemSettings.getVersionCode();      // versionCode del APK instalado
```

#### Proceso del sistema

```javascript
let nPid      = systemSettings.getPid();            // ID del proceso actual (Process.myPid)
let nUid      = systemSettings.getUid();            // UID Linux del proceso (Process.myUid)
let nTid      = systemSettings.getTid();            // ID del hilo actual (Process.myTid)
let nPriority = systemSettings.getThreadPriority(); // Prioridad nice del hilo actual

systemSettings.killProcess(nPid); // Mata el proceso indicado (uso avanzado)
```

#### Rutas del sistema de ficheros

```javascript
let sExternal   = systemSettings.getExternalStoragePath();
let sGaleria    = systemSettings.getGalleryPath();
let sDocumentos = systemSettings.getDocumentsPath();
let sMusica     = systemSettings.getMusicPath();
let sDescargas  = systemSettings.getDownloadsPath();
let sCapturas   = systemSettings.getScreenshotsPath();
let sTonos      = systemSettings.getRingtonesPath();
let sAlarmas    = systemSettings.getAlarmsPath();
```

#### Wallpaper

```javascript
systemSettings.setWallpaper("wallpaper.png");
systemSettings.getWallpaper(appData.getAppPath() + "files/wallpaper_guardado.png");
```

#### Acceso directo en pantalla de inicio

```javascript
systemSettings.addPinShortcut({
    id   : 1000,
    label: "Mi acceso directo",
    icon : "icono.png",
    extras: { parametro1: "valor1" }
});
```

#### Estado de la app y restricciones

```javascript
let bRestringida = systemSettings.isBackgroundRestricted();
let bDatosRestr  = systemSettings.isBackgroundDataDisabled();
let bInactiva    = systemSettings.isAppInactive();
let sRestriction = systemSettings.getAppRestrictionStatus();
systemSettings.showAppSettingsWindow();  // Devuelve el propio systemSettings (encadenable)

// Actualizacion desde Google Play
let bUpdate = systemSettings.checkMarketUpdate();
// let bUpdate = systemSettings.checkMarketUpdate("flexible"); // Posponer
if (bUpdate) { return; }
```

#### Perfil de trabajo y MDM

```javascript
let bWorkProfile = systemSettings.isRunningInWorkProfile();    // MDM perfil trabajo
let bDeviceOwner = systemSettings.isRunningWithDeviceOwner();  // MDM kiosko
let bHayMdm      = systemSettings.isRunningInMdm();
let bIntune      = systemSettings.isRunningInMdm("com.microsoft.windowsintune.companyportal");
let bXoneMdm     = systemSettings.isRunningInMdm("com.xone.live.services");
```

#### XOneLive

```javascript
systemSettings.enableReplicatorWidget();
systemSettings.disableReplicatorWidget();
systemSettings.enableLiveWidget();
systemSettings.disableLiveWidget();
let jsConfig = systemSettings.getLiveConfig();  // Objeto JS con config actual de XOneLive
```

#### Depuracion e integridad

```javascript
let bIntegro   = systemSettings.isDeviceIntegrityOk();           // Detecta root/emulador
let sToken     = systemSettings.getIntegrityToken("nonce_unico"); // Token Google Play
let bDebugger  = systemSettings.isDebuggerConnected();
appData.setDebugMode(!appData.isDebugMode());
```

#### Accesibilidad

```javascript
let bAccesib   = systemSettings.isAccessibilityEnabled();
let bTalkBack  = systemSettings.isTouchExplorationEnabled();
let bAutoStart = systemSettings.isAutoStartEnabled();
```

#### Ajustes del sistema (propiedades directas)

```javascript
// AUTO_TIME: hora automática de red
// Solo escribible en Android < 4.2 (SDK < 17). Superior: solo lectura.
let nSdk = appData.getGlobalMacro("##DEVICE_OSSDKCODE##");
if (nSdk < 17) {
    systemSettings.AUTO_TIME = 1;
} else {
    let nAutoTime = systemSettings.AUTO_TIME;
    // Equivalente: systemSettings.isNetworkAutoTimeEnabled()
}
```

#### Certificados (solo Android < 11)

```javascript
systemSettings.installCertificate({
    name: "Nombre descriptivo",
    file: "certificado.pem"
});
```

#### Intune (Microsoft Intune MDM)

```javascript
let bCompilacion = systemSettings.isIntuneCompilation();
let sPinRequired = systemSettings.isIntunePinRequired();
let sIntuneId    = systemSettings.getIntuneId();
let bOutdated    = systemSettings.isIntuneAgentOutdated();
let sMsg         = systemSettings.getIntuneAgentOutdatedMessage();
```

#### Firebase Analytics

Sólo funciona si el flavor de la app incluye Firebase Analytics; en builds sin Analytics ambos métodos devuelven `false`.

```javascript
systemSettings.setAnalyticsEnabled(true);  // Activar
systemSettings.setAnalyticsEnabled(false); // Desactivar (cumplir RGPD/opt-out)

// Registrar un evento (la clave "eventTag" del objeto es el nombre del evento; el resto, parámetros)
systemSettings.logAnalyticsEvent({
    eventTag : "purchase_completed",
    sku      : "item_001",
    amount   : 9.99,
    currency : "EUR"
});
```

