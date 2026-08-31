# Anti-patrones

> Referencia de `xone-development`. Sale del `SKILL.md` para que las reglas
> duras quepan en una lectura por omisión (100 líneas).

## Anti-patrones

### XML
| Incorrecto | Correcto |
|---|---|
| `<prop type="C">` (combo) | `type="T"` + `mapcol` + `mapfld` |
| `<prop type="M">` (mapa) | `type="Z" viewmode="mapview"` |
| `<prop type="A">` (autocomplete) | `type="T"` + `mapcol` + `mapfld` + `linkedfield` |
| `<prop type="IMG" readonly="false">` (firma obsoleta) | `<prop type="DR">` |
| `<prop type="L" labelwidth="0" title="X">` | `<prop type="L" title="X" label-align="center">` — con `labelwidth="0"` el título se pinta en un ancho de cero |
| `<prop type="L" title="...">` esperando que muestre el valor que actualiza el JS | `<prop type="L">` **sin `title`**: el label usa el valor del campo como fallback |
| `newline="false"` en el primer elemento de un frame | Solo en el segundo y siguientes |
| `<prop name="PASSWORD" type="X">` en Usuarios | `<prop name="PWD" type="X">` — el framework lo lee literalmente |
| `<prop name="ID_EMPRESA">` en Usuarios | `<prop name="IDEMPRESA">` — sin guion bajo |
| Dos `<group id="1">` en la misma coll | `id` único por coll |
| Dos `<prop name="X">` en la misma coll, aunque estén en grupos distintos | `name` único en la coll entera |
| `special="true"` junto con `sql` | Son excluyentes |
| Contents sin prefijo `@` | `contents="@MiContent"` |
| `loadall="true"` en tablas grandes | Carga bajo demanda |
| Mezclar `onclick` y `method` en un botón | Uno u otro |

### JavaScript: APIs y patrones
| Incorrecto | Correcto |
|---|---|
| `self("CAMPO")` | `self.CAMPO`, `self["CAMPO"]` o `self.getValue("CAMPO")` |
| `self.lock()` / `self.unlock()` | Son de la colección: `self.getContents("X").unlock()` |
| `coll.macro("##N##", v)` | `coll.setMacro("##N##", v)` / `getMacro` |
| `setMacro` sin declarar la macro en el XML | Declarar `<macro name="##N##" value="..." default="true" />` en la coll |
| `deviceInfo.getMobileNetworkSignalStrengh()` | `getMobileNetworkSignalStrength()` (sin el typo) |
| `ui.executeActionAfterDelay("X", 2000)` creyendo que son ms | El segundo parámetro va en **segundos**: `("X", 2)` |
| Encadenar `executeActionAfterDelay` como `setInterval` | `control.startChronometer({fromDate, dateFormat})` |
| `ui.startChronometer({...})` | Es del control: `getControl("MAP_T").startChronometer({...})` |
| `ui.setFieldPropertyValue(...)` / `ui.getFieldPropertyValue(...)` | Son de `self`. Y el cambio no repinta solo: llama a `ui.refresh(prop)` después |
| `self.X` dentro de un callback asíncrono | Guardar `var miSelf = self;` antes |
| `startBrowse()` sin `endBrowse()` en `finally` | `try { … } finally { coll.endBrowse(); }` |
| `appData.executeSql("… WHERE ID=" + id)` | `sqlManager.doRawQuery("… WHERE ID=?", id)` |
| `ui.setBlur(...)` / `ui.setSaturation(...)` | No son de `ui` ni de XOne: los expone la **vista nativa** que hay debajo. Se llaman sobre el frame o el control — `ui.getView(self)["mi_frame"].setBlur(8)`. Ver [métodos nativos de la vista](references/javascript/metodos-nativos-de-la-vista.md) |
| `GpsCollection` como colección built-in | La declara el proyecto con connector GPS |
| Variantes de `setCircularReveal` (Show/Hide, setXY, growAndShrink) | Solo existe `setCircularReveal(cx, cy, bReveal)` |

### JavaScript: creación de objetos
| Incorrecto | Correcto |
|---|---|
| `appData.createObject("XOneFileManager")` | `new FileManager()` |
| `appData.createObject("Http")` | Singleton `$http` |
| `appData.createObject("Crypto")` / `new Crypto()` | Singleton `crypto` |
| `appData.createObject("DeviceInfo")` / `new DeviceInfo()` | Singleton `deviceInfo` |
| `appData.createObject("SystemSettings")` / `new SystemSettings()` | Singleton `systemSettings` |
| `appData.createObject("XOneClipboard")` | Singleton `clipboard` |
| `appData.createObject("XOneBiometricsManager")` | Singleton `biometricsManager` |
| `appData.createObject("ScriptSensorManager")` | Singleton `sensorManager` |
| `appData.createObject("XOnePackageManager")` | Singleton `packageManager` |
| `appData.createObject("XOneWifiManager")` | `new WifiManager()` |
| `appData.createObject("ScriptOauth2")` | `new OAuth2()` |
| `appData.createObject("WebWorker")` | `new Worker()` |
| `appData.createObject("XOneSocket")` / `XOneWebSocket` / `XOneDebugTools` | `new Socket()` / `new WebSocket()` / `new DebugTools()` |
| `appData.createObject("Encoder")` | `new EncodingUtils()` — «Encoder» no existe |
| `new Packages.com.xone.android.script.runtimeobjects.IniParser()` | `new IniParser()` |

### CSS
| Incorrecto | Correcto |
|---|---|
| `font-size: 14px` | `fontsize: 14` |
| `bg-color: #FFF` | `bgcolor: #FFFFFF` |
| `#00000080` (alpha al final) | `#80000000` (ARGB) |
| `margin: 10p` | `tmargin: 10p; bmargin: 10p; …` |
| `div.header { }` | `.header { }` |
| Duplicar atributos entre clases | `extends: .base;` y sobrescribir |
| `display: none` | `visible` (bitmask) |
| `box-shadow` | `elevation` + `shadow-color` |

### Datos
| Incorrecto | Correcto |
|---|---|
| `gen_` literal en XML o SQL portable | `##PREF##` |
| SQL concatenado con entrada externa | Parámetros `?` |
| Cursor o conexión sin cerrar | `finally` |
| `allowUnsafeCertificates: true` en producción | Verificación TLS |
| Token en claro en logs o macros | Cifrado, limpieza y sin logging |

### Dispositivo
| Incorrecto | Correcto |
|---|---|
| Leer GPS sin iniciarlo ni pedir permiso | `startGps` + `checkGpsStatus` + permiso |
| Aceptar cualquier coordenada | `STATUS == 1` y longitud válida |
| `fingerprintManager` en código nuevo | `biometricsManager` |
| Bloquear la UI esperando | `ui.executeActionAfterDelay` |
| Dejar conexiones abiertas | `disconnect`/`close` al salir |
| Asumir que el simulador tiene datos de hardware | Configurar `mock/device.json` |
