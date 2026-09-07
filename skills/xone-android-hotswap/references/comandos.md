# Comandos del servidor hotswap (WebSocket)

Referencia LITERAL de lo que implementa `handleClientResponse()` en la app XOneStudio de
Android; copiada de la documentación del framework, no reescrita. Todos los mensajes llegan
como un JSON con el campo `command`; las respuestas son subclases de `ResultMessage`.

Cómo se llega al servidor, y qué hacer cuando el puerto no responde:
[ficheros.md](ficheros.md).

## Tipos de respuesta

| Tipo | JSON resultante |
|---|---|
| `ResultMessage()` | `{ result: true, status: "" }` |
| `ResultMessage(string)` | `{ result: true, status: "<string>" }` |
| `ResultMessage(false, string)` | `{ result: false, status: "<string>" }` |
| `ResultMessage(exception)` | `{ result: false, exceptionClass: "...", exceptionMessage: "..." }` |
| `SqlMessage` | `{ result: true/false, sql: "...", data: [...filas...] }` |
| `ListDirectoryMessage` | `{ result: true, status: "listAppFiles", paths: [...] }` |
| `GetFileChecksumMessage` | `{ result: { "<archivo>": "<checksum>", ... } }` — *nota: `result` es un objeto, no boolean* |
| `FullLogMessage` | `{ result: true, basicInfo: {...}, logcat: "...", exception: "...", stackTrace: "..." }` |
| `DebugMessage` | JSON específico del depurador JS |

---

## Comandos de aplicación

### `launchApplication`

Lanza una aplicación XOne por nombre. Limpia la caché de imágenes antes de lanzar.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"launchApplication"` |
| `appName` | string | sí | Nombre de la aplicación (se normaliza a minúsculas y sin espacios) |

**Salida:** `ResultMessage()`
**Error:** `ResultMessage(false, "Empty app name")` si `appName` está vacío.

---

### `exitApplication`

Cierra la aplicación XOne actualmente en ejecución. No requiere parámetros adicionales.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"exitApplication"` |

**Salida:** `ResultMessage()`

---

### `directdownload`

Descarga una aplicación XOne completa desde el servidor cloud e instala sus ficheros en el dispositivo. Por defecto, la aplicación en ejecución se cierra durante el proceso (controlable con `exitApp`). La respuesta se envía una vez que se ha obtenido el manifiesto del servidor cloud y la descarga de ficheros queda encolada; el progreso se notifica mediante push messages.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"directdownload"` |
| `url` | string | sí | URL del servidor cloud donde se solicita el manifiesto de ficheros |
| `urlDF` | string | sí | URL base para la descarga de cada fichero individual |
| `token` | string | sí | Token de transacción que identifica la sesión de publicación |
| `id` | string | sí | Session ID de la sesión |
| `data` | object | sí | Objeto con campos `u` (usuario) y `pid` (project ID) |
| `exitApp` | boolean | no | Si `true` (valor por defecto), cierra la app en ejecución antes de instalar los ficheros. Pasar `false` para mantenerla abierta. |

**Salida:** `ResultMessage()` — confirmación de que el manifiesto fue obtenido y la descarga ha comenzado.

**Push messages durante la descarga:**

| Mensaje | Momento | Descripción |
|---|---|---|
| `FilesDownloadStateMessage` con `state.downloadFiles = "start"` | Al inicio | Indica que la descarga ha comenzado |
| `FilesDownloadStateMessage` con `state.downloadFiles = "end"` | Al finalizar | Indica que todos los ficheros han sido descargados |

**Errores:**

| Condición | Respuesta |
|---|---|
| `url` vacío | `{ result: false, status: "Empty url argument" }` |
| El servidor cloud devuelve error con mensaje | `{ result: false, status: "Remote cloud server returned error: <msg>" }` |
| El servidor cloud devuelve error sin mensaje | `{ result: false, status: "Unknown error returned by remote cloud server" }` |

#### Formato de respuesta del servidor cloud

El dispositivo hace un POST a `url` con el JSON del comando completo. La respuesta esperada del servidor cloud tiene esta estructura:

```json
{
  "hasError": false,
  "data": {
    "appname": "ventas",
    "files": [
      { "filename": "app.ini",      "token": "ft_001", "folder": "" },
      { "filename": "icon.png",     "token": "ft_002", "folder": "" },
      { "filename": "Clientes.xml", "token": "ft_003", "folder": "" },
      { "filename": "Pedidos.xne",  "token": "ft_004", "folder": "colecciones" }
    ]
  }
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `hasError` | boolean | `true` si el servidor encontró un error |
| `err` | string | Mensaje de error (solo presente si `hasError` es `true`) |
| `data.appname` | string | Nombre de la aplicación a instalar |
| `data.files` | array | Lista de ficheros a descargar |
| `data.files[].filename` | string | Nombre del fichero |
| `data.files[].token` | string | Token de autorización para descargar este fichero concreto |
| `data.files[].folder` | string | Subcarpeta dentro del directorio de la app (vacío = raíz) |

#### Ejemplo

**Comando enviado al dispositivo (con cierre de app, comportamiento por defecto):**

```json
{
  "command": "directdownload",
  "url": "https://cloud.xone.es/api/publish/getfiles",
  "urlDF": "https://cloud.xone.es/api/publish/download",
  "token": "a3f8c1d2e4b5",
  "id": "sess_9x2k",
  "data": {
    "u": "developer@empresa.com",
    "pid": "proj_42"
  }
}
```

**Comando enviado al dispositivo (sin cierre de app):**

```json
{
  "command": "directdownload",
  "exitApp": false,
  "url": "https://cloud.xone.es/api/publish/getfiles",
  "urlDF": "https://cloud.xone.es/api/publish/download",
  "token": "a3f8c1d2e4b5",
  "id": "sess_9x2k",
  "data": {
    "u": "developer@empresa.com",
    "pid": "proj_42"
  }
}
```

**Respuesta al comando:**

```json
{ "result": true, "status": "" }
```

#### Flujo

```
Cliente                          Dispositivo                   Servidor Cloud
   │                                  │                               │
   │──── directdownload ─────────────►│                               │
   │                                  │──── POST url (manifiesto) ───►│
   │                                  │◄─── { hasError, data } ───────│
   │                                  │  [cierra app si exitApp=true]  │
   │◄─── FilesDownloadStateMessage ───│  { state: { downloadFiles: "start" } }
   │◄─── ResultMessage() ────────────│  { result: true, status: "" }
   │                                  │
   │            [descarga de ficheros en background...]
   │                                  │
   │◄─── FilesDownloadStateMessage ───│  { state: { downloadFiles: "end" } }
```

---

## Comandos de colecciones y atributos

### `loadCollection`

Carga o recarga una colección XML en caliente. Si la colección ya existe la recarga y relayouts; si no existe la añade al nodo de configuración.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"loadCollection"` |
| `xmlNode` | string | sí | XML de la colección codificado en **Base64** |
| `encoding` | string | no | Encoding para decodificar el XML (default: `ISO-8859-15`) |

**Salida:** `ResultMessage()`
**Error:** `ResultMessage(exception)` si el XML es inválido. `ResultMessage(false, "App is not running")` si la app no está iniciada.

---

### `loadIncludeFile`

Carga un fichero de script (include) en caliente y lo compila opcionalmente.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"loadIncludeFile"` |
| `file` | string | sí | Nombre/ruta del fichero include |
| `language` | string | sí | Lenguaje del script (`"javascript"`, `"vbscript"`, etc.) |
| `encoding` | string | no | Encoding del fichero (default: `UTF-8`) |
| `delayCompilation` | boolean | no | Si `true`, retrasa la compilación (default: `false`) |
| `compile` | boolean | no | Si `false`, no compila tras cargar (default: `true`) |

**Salida:** `ResultMessage()`
**Error:** `ResultMessage(false, "Cannot load include file <nombre>")` si falla la carga.

---

### `setAttribute`

Modifica el valor de un atributo XML en el nodo de definición de un control dentro de su colección. Provoca relayout o refresh según el atributo modificado.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"setAttribute"` |
| `collectionName` | string | sí | Nombre de la colección |
| `nodeType` | string | sí | Tipo del nodo XML (p.ej. `"prop"`, `"frame"`) |
| `name` | string | sí | Valor del atributo `name` del nodo |
| `attributeName` | string | sí | Nombre del atributo a modificar |
| `attributeValue` | string | sí | Nuevo valor del atributo |

**Salida:** `ResultMessage()`

---

### `deleteAttribute`

Elimina un atributo XML del nodo de definición de un control. Provoca relayout o refresh según el atributo eliminado.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"deleteAttribute"` |
| `collectionName` | string | sí | Nombre de la colección |
| `nodeType` | string | sí | Tipo del nodo XML |
| `name` | string | sí | Valor del atributo `name` del nodo |
| `attributeName` | string | sí | Nombre del atributo a eliminar |

**Salida:** `ResultMessage()`

---

### `replaceProperty`

Reemplaza múltiples atributos de un nodo XML simultáneamente.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"replaceProperty"` |
| `collectionName` | string | sí | Nombre de la colección |
| `nodeType` | string | sí | Tipo del nodo XML |
| `name` | string | sí | Valor del atributo `name` del nodo |
| `attributeNames` | string[] | sí | Array con los nombres de los atributos |
| `attributeValues` | string[] | sí | Array con los valores correspondientes (mismo orden) |

**Salida:** `ResultMessage()`

---

### `setCssAttribute`

Modifica un atributo dentro de una clase CSS en un fichero CSS de la aplicación.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"setCssAttribute"` |
| `fileName` | string | sí | Nombre del fichero CSS |
| `className` | string | sí | Nombre de la clase CSS |
| `attributeName` | string | sí | Propiedad CSS a modificar |
| `attributeValue` | string | sí | Nuevo valor de la propiedad |

**Salida:** `ResultMessage()`

---

### `deleteCssAttribute`

Elimina una propiedad de una clase CSS en un fichero CSS de la aplicación.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"deleteCssAttribute"` |
| `fileName` | string | sí | Nombre del fichero CSS |
| `className` | string | sí | Nombre de la clase CSS |
| `attributeName` | string | sí | Propiedad CSS a eliminar |

**Salida:** `ResultMessage()`

---

### `refresh`

Refresca la visualización de uno o varios controles sin hacer un relayout completo.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"refresh"` |
| `collectionName` | string | no | Nombre de la colección (null = colección activa) |
| `nodeTypes` | string[] | no | Array de tipos de nodo a refrescar |
| `names` | string[] | no | Array de nombres de controles a refrescar |

**Salida:** `ResultMessage()`

---

### `relayout`

Realiza un relayout completo de una colección (reconstruye la UI desde el XML).

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"relayout"` |
| `collectionName` | string | no | Nombre de la colección (null = colección activa) |

**Salida:** `ResultMessage()`

---

## Comandos de ficheros

### `uploadFile`

Sube un fichero al directorio de datos de la aplicación en el dispositivo.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"uploadFile"` |
| `destinationPath` | string | sí | Ruta relativa dentro del directorio `data/` de la app |
| `fileData` | string | sí | Contenido del fichero codificado en **Base64** |

**Salida:** `ResultMessage()`
**Error:** `ResultMessage(exception)` si no se puede eliminar el fichero previo o escribir el nuevo.

---

### `listAppFiles`

Lista todos los ficheros del directorio de una aplicación XOne.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"listAppFiles"` |
| `appName` | string | sí | Nombre de la aplicación (se busca en `data/app_<appName>/`) |

**Salida:** `ListDirectoryMessage` → `{ result: true, status: "listAppFiles", paths: ["ruta/relativa/fichero1", ...] }`
**Error:** `ResultMessage(false, ...)` si el directorio no existe o no es un directorio.

---

### `getFileChecksum`

Calcula el checksum de una lista de ficheros de una aplicación XOne.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"getFileChecksum"` |
| `appName` | string | sí | Nombre de la aplicación |
| `checksumType` | string | no | Algoritmo de checksum (default: `"crc32"`) |
| `files` | string[] | sí | Lista de rutas relativas de ficheros a procesar |

**Salida:** `GetFileChecksumMessage` → `{ result: { "fichero.xml": "a1b2c3d4", ... } }`
*Nota: el campo `result` es un objeto JSON, no un booleano.*
**Error:** `ResultMessage(false, ...)` si faltan parámetros o el directorio no existe.

---

## Comandos de scripts y base de datos

### `runScript`

Ejecuta un bloque de script (JavaScript o VBScript) en el contexto del objeto de datos actualmente visible.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"runScript"` |
| `scriptLanguage` | string | sí | Lenguaje del script (`"javascript"`, `"vbscript"`, etc.) |
| `scriptText` | string | sí | Código fuente del script codificado en **Base64** |

**Salida:**
- `ResultMessage()` si el script no retorna valor
- `ResultMessage(valorRetornado.toString())` si el script retorna un valor
- `ResultMessage(exception)` si el script lanza una excepción

**Error:** `ResultMessage(false, "No edit view is visible")` si no hay actividad visible. `ResultMessage(false, "No data object found...")` si la actividad no tiene objeto de datos.

---

### `runSql`

Ejecuta una sentencia SQL arbitraria contra la base de datos de una aplicación XOne.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"runSql"` |
| `appName` | string | sí | Nombre de la aplicación |
| `sql` | string | sí | Sentencia SQL a ejecutar |

**Salida:** `SqlMessage` → `{ result: true, sql: "SELECT ...", data: [{col: valor, ...}, ...] }`
**Error:** `SqlMessage` con `result: false` y datos de la excepción si falla la ejecución.

---

### `getDatabaseTableNames`

Lista todas las tablas de la base de datos de una aplicación XOne (ejecuta `SELECT name FROM sqlite_master WHERE type='table'`).

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"getDatabaseTableNames"` |
| `appName` | string | sí | Nombre de la aplicación |

**Salida:** `SqlMessage` → `{ result: true, sql: "SELECT name FROM sqlite_master...", data: [{name: "tabla1"}, ...] }`

---

### `queryDatabaseTable`

Ejecuta `SELECT * FROM <tableName>` contra la base de datos de una aplicación XOne.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"queryDatabaseTable"` |
| `appName` | string | sí | Nombre de la aplicación |
| `tableName` | string | sí | Nombre de la tabla a consultar |

**Salida:** `SqlMessage` → `{ result: true, sql: "SELECT * FROM <tabla>", data: [{...}, ...] }`

---

## Comandos de logs

### `getLog`

Obtiene un volcado completo del log del dispositivo (logcat + información básica del sistema).

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"getLog"` |

**Salida:** `FullLogMessage` → `{ result: true, basicInfo: {...}, logcat: "...", exception: "...", stackTrace: "..." }`

---

### `enableDeviceLogging`

Activa el envío push de mensajes de log al cliente vía `LoggerMessage`. Cada línea de log genera un push al conectado.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"enableDeviceLogging"` |

**Salida:** `ResultMessage()`
**Push messages generados:** `LoggerMessage` → `{ result: true, logger: true, message: "...", id: "uuid", timestamp: "..." }`

---

### `disableDeviceLogging`

Desactiva el envío push de mensajes de log.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"disableDeviceLogging"` |

**Salida:** `ResultMessage()`

---

### `setLogEnabled`

Activa el streaming continuo del logcat del sistema (logcat propiamente dicho, no el logger interno de XOne). Lanza un hilo que lee logcat cada 3 segundos y envía líneas nuevas como `LoggerMessage`.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"setLogEnabled"` |

**Salida:** `ResultMessage()`
**Push messages generados:** `LoggerMessage` → `{ result: true, logger: true, message: "línea logcat", id: "uuid", timestamp: "..." }`

---

### `setLogDisabled`

Detiene el streaming de logcat iniciado por `setLogEnabled`.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"setLogDisabled"` |

**Salida:** `ResultMessage()`

---

## Comandos de pantalla

### `getScreenshot`

Captura la pantalla actual del dispositivo como imagen WebP comprimida.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"getScreenshot"` |

**Salida:** `ResultMessage(base64WebP)` → `{ result: true, status: "<base64 WebP lossy 50%>" }`
**Error:** `ResultMessage(false, ...)` si no hay actividad visible o no se puede obtener el tamaño del DecorView.

---

### `enableLiveEditionMode`

Activa el modo de edición visual en vivo: permite arrastrar y soltar controles XOne para modificar sus atributos `lmargin`, `tmargin` y `frame` en tiempo real. Al soltar un control, envía un `UpdateNodeMessage` push al cliente con los nuevos valores.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"enableLiveEditionMode"` |

**Salida:** `ResultMessage()`
**Push messages generados:** `UpdateNodeMessage` → `{ command: "updateNode", collectionName, nodeType, name, attributeNames[], attributeValues[] }`

---

### `disableLiveEditionMode`

Desactiva el modo de edición visual en vivo, eliminando los listeners de drag & drop.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"disableLiveEditionMode"` |

**Salida:** `ResultMessage()`

---

## Comandos de interacción UI (automatización)

### `click`

Hace click programático en un control XOne identificado por nombre. Requiere que el control esté habilitado.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"click"` |
| `name` | string | sí | Nombre del control XOne |

**Salida:** `ResultMessage()`
**Error:** `ResultMessage(false, "Element '<name>' not found or not enabled")`

---

### `tap`

Simula un toque táctil (ACTION_DOWN + ACTION_UP con 50ms de diferencia) sobre el centro de un control XOne.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"tap"` |
| `name` | string | sí | Nombre del control XOne |

**Salida:** `ResultMessage()`
**Error:** `ResultMessage(false, "Element '<name>' not found")`

---

### `doubleTap`

Simula un doble toque táctil (dos ciclos DOWN+UP separados 100ms) sobre el centro de un control XOne.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"doubleTap"` |
| `name` | string | sí | Nombre del control XOne |

**Salida:** `ResultMessage()`
**Error:** `ResultMessage(false, "Element '<name>' not found")`

---

### `longPress`

Simula una pulsación larga (`performLongClick()`) sobre un control XOne habilitado.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"longPress"` |
| `name` | string | sí | Nombre del control XOne |

**Salida:** `ResultMessage()`
**Error:** `ResultMessage(false, "Element '<name>' not found or not enabled")`

---

### `fill`

Escribe un valor en un campo de entrada XOne. Actualiza el `IXoneObject` subyacente y refresca la vista.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"fill"` |
| `name` | string | sí | Nombre del control XOne |
| `value` | string | no | Texto a escribir (default: `""`) |

**Salida:** `ResultMessage()`
**Error:** `ResultMessage(false, "Element '<name>' not found or not editable")` si el control no implementa `IXoneView` + `IViewAssignable`.

---

### `clear`

Borra el contenido de un campo de entrada XOne (establece el valor a `null`).

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"clear"` |
| `name` | string | sí | Nombre del control XOne |

**Salida:** `ResultMessage()`
**Error:** `ResultMessage(false, "Element '<name>' not found or not clearable")`

---

### `getText`

Obtiene el valor actual del campo de datos asociado a un control XOne.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"getText"` |
| `name` | string | sí | Nombre del control XOne |

**Salida:** `ResultMessage(texto)` → `{ result: true, status: "<valor del campo>" }`
**Error:** `ResultMessage(false, "Element '<name>' not found")`

---

### `getUiAttribute`

Lee el valor de un atributo XML en el nodo de definición de un control (no el valor en tiempo de ejecución, sino el del XML de la colección).

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"getUiAttribute"` |
| `collectionName` | string | sí | Nombre de la colección |
| `nodeType` | string | sí | Tipo del nodo XML (p.ej. `"prop"`) |
| `name` | string | sí | Valor del atributo `name` del nodo |
| `attributeName` | string | sí | Nombre del atributo XML a leer |

**Salida:** `ResultMessage(valor)` → `{ result: true, status: "<valor>" }`
Si el atributo no existe, `status` es `""`.

---

### `waitForElement`

Espera activamente (polling cada 250ms) hasta que un control XOne sea visible o se agote el timeout.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"waitForElement"` |
| `name` | string | sí | Nombre del control XOne |
| `timeout` | int | no | Timeout en milisegundos (default: `10000`) |

**Salida:** `ResultMessage()` cuando el elemento se vuelve visible.
**Error:** `ResultMessage(false, "Timeout waiting for element '<name>'")`

---

### `isVisible`

Comprueba si un control XOne está actualmente visible (`View.VISIBLE` y `isShown()`).

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"isVisible"` |
| `name` | string | sí | Nombre del control XOne |

**Salida:** `ResultMessage("true")` o `ResultMessage("false")` → `{ result: true, status: "true"/"false" }`

---

### `isEnabled`

Comprueba si un control XOne está actualmente habilitado (`isEnabled()`).

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"isEnabled"` |
| `name` | string | sí | Nombre del control XOne |

**Salida:** `ResultMessage("true")` o `ResultMessage("false")` → `{ result: true, status: "true"/"false" }`

---

### `scroll`

Realiza un gesto de scroll (swipe con múltiples eventos MOVE para activar el fling) sobre un control o su ancestro scrollable más cercano.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"scroll"` |
| `name` | string | sí | Nombre del control XOne |
| `direction` | string | no | Dirección: `"up"`, `"down"`, `"left"`, `"right"` (default: `"down"`) |
| `amount` | int | no | Píxeles de desplazamiento (default: `300`) |

**Salida:** `ResultMessage()`
**Error:** `ResultMessage(false, "Element '<name>' not found")`

---

### `pressKey`

Inyecta un evento de tecla (ACTION_DOWN + ACTION_UP) en la actividad actual.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"pressKey"` |
| `keyCode` | int | sí | Código de tecla Android (p.ej. `66` = KEYCODE_ENTER, `4` = KEYCODE_BACK) |

**Salida:** `ResultMessage()`
**Error:** `ResultMessage(false, "Argument 'keyCode' is missing or invalid")` si `keyCode <= 0`.

---

### `getAllElements`

Devuelve la información de los controles visibles en la actividad actual. El parámetro `format` elige el formato de la respuesta.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"getAllElements"` |
| `format` | string | no | `"xone"` (default) o `"uiautomator"`. Se normaliza a minúsculas y se recortan los espacios; vacío equivale a `"xone"` |

**Salida:** `ResultMessage(string)`, con el payload dentro de `status`.
**Error:** `ResultMessage(false, "App is not running")`, o `ResultMessage(false, "Unknown format '...', expected 'xone' or 'uiautomator'")`.

#### `format: "xone"`

Array JSON con un descriptor por cada control XOne visible, con lo que el framework sabe de él: `name`, `type`, `collectionName`, `visible`, `enabled`, `bounds` y `text` (si aplica). Recorre la vista de contenido (`android.R.id.content`) quedándose con las vistas que implementan `IXoneViewInfo`.

`{ result: true, status: "[{name,type,collectionName,visible,enabled,bounds,...},...]" }`

#### `format: "uiautomator"`

XML equivalente al que produce `uiautomator dump`, construido pidiéndole a cada vista de la jerarquía su `AccessibilityNodeInfo` con `View.createAccessibilityNodeInfo()`. Da el mismo juego de atributos que ve una herramienta externa de automatización, sin necesitar los permisos de shell que impiden invocar `uiautomator` desde dentro de la app.

```xml
<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.xone.android.framework" content-desc="" hint="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" displayed="true" bounds="[0,0][1080,2160]">
    <node index="0" text="" resource-id="xone:id/MAP_TYPED" class="android.widget.LinearLayout" ...>
      <node index="1" text="2026/09/02" resource-id="com.xone.android.framework:id/editdatetext" class="android.widget.TextView" ... />
    </node>
  </node>
</hierarchy>
```

Emite el juego clásico de 17 atributos (`index`, `text`, `resource-id`, `class`, `package`, `content-desc`, `checkable`, `checked`, `clickable`, `enabled`, `focusable`, `focused`, `scrollable`, `long-clickable`, `password`, `selected`, `bounds`) más `hint` y `displayed`.

Se recorre la jerarquía **sin filtrar por `isImportantForAccessibility()`**, porque `uiautomator` se conecta con `FLAG_INCLUDE_NOT_IMPORTANT_VIEWS` y su volcado trae también los contenedores intermedios. Sí se omiten las vistas que no están `VISIBLE`, igual que el árbol de accesibilidad.

El `resource-id` sale de dos sitios, en este orden: el `viewIdResourceName` que la vista haya publicado por su cuenta (es lo que hace `XoneBaseActivity.exposeControlNameForAutomation()` con el nombre del control XOne, `xone:id/<NOMBRE_PROP>`) y, si no hay ninguno, el nombre de recurso del `getId()` de la vista (`com.xone.android.framework:id/editdatetext`). Resolverlo a mano es necesario porque el `viewIdResourceName` de un nodo creado en proceso viene vacío: lo rellena el servicio de accesibilidad del sistema, no la vista.

Diferencias frente a un volcado real de ADB:

- Cubre **solo la ventana de la propia app**: no salen las ventanas de otras apps ni los hijos virtuales que publican por su cuenta las vistas con `AccessibilityNodeProvider` (el `WebView`, entre otras). Las barras del sistema sí aparecen cuando cuelgan del `decor view` de la app (`android:id/navigationBarBackground`).
- No se emiten `NAF`, que es una heurística del volcador y no una propiedad del nodo, ni `drawing-order`, cuyo valor en un nodo creado en proceso no es el relativo al padre que publica el sistema.
- Va indentado, mientras que el volcado real viene en una sola línea. Es indiferente para cualquier parser de XML.

Comprobado contra `adb shell uiautomator dump` en la misma pantalla (Pixel 3, Android 15): mismo número de nodos, misma profundidad, los mismos `resource-id` y ninguna diferencia en los 17 atributos clásicos ni en `hint`.

**Ejemplo:**

```json
{
  "command": "getAllElements",
  "format": "uiautomator"
}
```

---

## Comandos de datos mock

Permiten alimentar al framework con datos simulados de hardware (GPS, NFC, cámara) sin necesidad de hardware real. Varios tipos de mock pueden estar activos simultáneamente; cada subsistema consume únicamente los campos que le corresponden.

### `setMockData`

Establece los datos de prueba activos. Los campos son todos opcionales; se proporcionan únicamente los que se quieran simular.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"setMockData"` |
| `latitude` | double | no | Latitud GPS (default: `0.0`) |
| `longitude` | double | no | Longitud GPS (default: `0.0`) |
| `altitude` | double | no | Altitud en metros (default: `0.0`) |
| `accuracy` | float | no | Precisión en metros (default: `0.0`) |
| `bearing` | float | no | Orientación en grados 0–360 (default: `0.0`) |
| `speed` | float | no | Velocidad en m/s (default: `0.0`) |
| `date` | long | no | Timestamp en milisegundos epoch (default: `0`) |
| `tagId` | string | no | ID de tag NFC en hexadecimal, p.ej. `"A1B2C3D4"` (default: `""`) |
| `payload` | string | no | Payload del mensaje NDEF (default: `""`) |
| `imageData` | string | no | Imagen de cámara codificada en Base64 (default: `""`) |

**Salida:** `ResultMessage()`

**Ejemplo — solo GPS:**

```json
{
  "command": "setMockData",
  "latitude": 40.4168,
  "longitude": -3.7038,
  "accuracy": 5.0
}
```

**Ejemplo — GPS + NFC simultáneos:**

```json
{
  "command": "setMockData",
  "latitude": 40.4168,
  "longitude": -3.7038,
  "tagId": "04A1B2C3",
  "payload": "https://xone.cloud"
}
```

---

### `clearMockData`

Elimina los datos de prueba activos. A partir de este momento el framework vuelve a usar el hardware real.

**Entrada:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"clearMockData"` |

**Salida:** `ResultMessage()`

---

## Comando de depuración JavaScript

### `debug`

Comando contenedor para todas las operaciones de depuración JavaScript. El campo `action` determina la suboperación.

**Entrada base:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `command` | string | sí | `"debug"` |
| `action` | string | sí | Subcomando (ver tabla siguiente) |

**Salida:** `DebugMessage` en todos los casos.

#### Subcomandos

| `action` | Parámetros adicionales | Descripción |
|---|---|---|
| `init` | — | Inicializa el debugger JS y registra el listener WebSocket. Llama a `end` internamente primero. |
| `end` | — | Finaliza la sesión de depuración: limpia breakpoints, hace `go` para desbloquear ejecución, libera el debugger. |
| `breakpoints` | `breakpoints: { "<script>": [línea, ...] }`, `strict: bool` | Reemplaza todos los breakpoints activos con el conjunto recibido. |
| `break` | — | Solicita al motor JS que pause en el siguiente punto de ejecución posible. |
| `go` | — | Reanuda la ejecución del motor JS (sale del estado pausado). |
| `stepInto` | — | Ejecuta un paso entrando en las llamadas a función. |
| `stepOver` | — | Ejecuta un paso sin entrar en las llamadas a función. |
| `stepOut` | — | Ejecuta hasta salir de la función actual. |
| `expand` | JSON específico del debugger | Expande una variable en el inspector (encola una eval pendiente). |
| `eval` | JSON específico del debugger | Evalúa una expresión en el contexto de pausa actual (encola una eval pendiente). |
| `inspect` | JSON específico del debugger | Inspecciona el valor de una expresión (encola una eval pendiente). |
| `addBreakpoint` | `source: string`, `line: int`, `strict: bool` | Añade un único breakpoint en el fichero y línea indicados. |
| `removeBreakpoint` | `source: string`, `line: int` | Elimina un breakpoint específico. |

**Nota:** Los push messages de depuración son enviados de forma asíncrona por el motor JS vía el listener registrado en `init`, no como respuesta directa al comando.
