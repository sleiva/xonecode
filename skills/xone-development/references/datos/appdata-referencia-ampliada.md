# XOne — appData: referencia ampliada

> Fuente: `xone/v2/xone-project-generator/references/xone-javascript-patterns-c-appdata-http.md` §2.2. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: segunda redacción del corpus para appData, con ejemplos adicionales

---

### 2.2 Objeto `appData`

El objeto `appData` gestiona datos, configuración y estado de la aplicación.

#### 2.2.1 Colecciones

**Crear objetos — patrón preferido (constructor `new`):** toda colección de la aplicación está disponible como constructor global. Acepta un parámetro opcional con los valores iniciales (cada propiedad se asigna igual que `obj.PROP = valor`, disparando sus `onchange`):

```javascript
// Crear un objeto nuevo con valores iniciales
let obj = new Clientes({ NOMBRE: "ACME", ACTIVO: 1 });

// El parámetro es opcional
let obj2 = new Clientes();

// Crear, añadir a la colección y guardar
let coll = appData.getCollection("Clientes");
let obj3 = new Clientes({ NOMBRE: "Nuevo registro" });
coll.addItem(obj3);
obj3.save();
```

Cuándo NO aplica el constructor:

- **Contents anidados**: para crear líneas de un content usa `self.Contents("Lineas").createObject()` — crear desde el content establece el vínculo con el objeto padre; el constructor crea sobre la colección global y no vincula.
- **Nombre de colección dinámico**: si el nombre llega en una variable, usa el patrón legacy `appData.getCollection(nombre).createObject()`.

El constructor solo crea objetos. No existen métodos estáticos tipo ORM (`Usuarios.find(...)`, `Usuarios.create(...)`, `Usuarios.findById(...)`); las consultas se hacen con `appData.getCollection("Usuarios").findObject(...)` y demás métodos de la colección.

```javascript
// Obtener una coleccion por nombre
let coll = appData.getCollection("NombreColeccion");

// Cargar todos los registros de la coleccion
coll.loadAll();

// Obtener cantidad de registros cargados
let nCount = coll.getCount();

// Obtener objeto por indice (base 0)
let obj = coll.get(0);

// Buscar un objeto con filtro SQL-like
let obj = coll.findObject("LOGIN = 'admin'");
let obj = coll.findObject("ID = 5 AND ACTIVO = 1");

// Buscar objeto por campo y valor
let obj = coll.getItem("MAP_CAMPO", valor);

// Crear un nuevo objeto en la coleccion (constructor preferido)
let newObj = new NombreColeccion({ MAP_NOMBRE: "Nuevo registro" });
coll.addItem(newObj);
newObj.save();

// Clonar coleccion (copia en memoria)
let collClone = coll.createClone();

// Aplicar filtro y recargar
coll.setFilter("ACTIVO = 1 AND TIPO = 'A'");
coll.clear();
coll.loadAll();

// Ordenar registros
coll.doSort("FECHA DESC");

// Borrar todos los registros de la BD
coll.browseDeleteAll();

// Guardar todos los registros modificados
coll.saveAll();
```

#### 2.2.2 Autenticación

```javascript
// Login
appData.login({
    userName          : "usuario",
    password          : "contraseña",
    entryPoint        : "MenuPrincipal",
    onLoginSuccessful : function() {
        ui.showToast("Bienvenido!");
    },
    onLoginFailed     : function() {
        ui.showToast("Credenciales incorrectas");
    }
});

// Logout
appData.logout();

// Salir de la aplicación
appData.exit();
```

#### 2.2.3 Rutas y Configuración

```javascript
// Obtener ruta base de la aplicación
let sAppPath = appData.getAppPath();

// Obtener ruta de la carpeta files/
let sFilesPath = appData.getFilesPath();

// Obtener macro global del sistema
let sDeviceOs = appData.getGlobalMacro("##DEVICE_OS##");
let sVersion = appData.getGlobalMacro("##VERSION##");
let sFrameVersion = appData.getGlobalMacro("##FRAME_VERSION##");

// Obtener/Establecer macros personalizadas
let valor = appData.getGlobalMacro("##MI_MACRO##");
appData.setGlobalMacro("##MI_MACRO##", "mi_valor");

// Escribir mensaje de debug
appData.writeConsoleString("Debug: valor = " + valor);

// Limpiar errores acumulados
appData.error().clear();
```

#### 2.2.4 Empresa Actual y Variables Globales de Sesión

```javascript
// Obtener la empresa actual del usuario logueado
var empresa = appData.getCurrentEnterprise();

// Almacenar variables globales de sesion (persisten durante la sesion)
appData.getCurrentEnterprise().setVariable("LATITUD", latitud);
appData.getCurrentEnterprise().setVariable("LONGITUD", longitud);
appData.getCurrentEnterprise().setVariable("MODO_DARK", true);

// Recuperar variables globales de sesion
var lat = appData.getCurrentEnterprise().getVariable("LATITUD");
var lng = appData.getCurrentEnterprise().getVariable("LONGITUD");
var debug = appData.getCurrentEnterprise().getVariable("Debug");
```

#### 2.2.5 Formateo y Utilidades Numéricas

```javascript
// Convertir cualquier valor (fecha, número, booleano, …) a string siguiendo
// las reglas de XOne (formato de fecha de la empresa, decimales, etc.).
// Segundo parámetro opcional: flags numéricos.
var sqlStr = appData.variantToString(valor);
var sFecha = appData.variantToString(new Date());

// Redondeo seguro (importante para evitar errores de precision con decimales/euros)
var precio = appData.safeRound(vPendiente, 2);
var total = appData.safeRound(cantidad * precioUnitario, 2);
```

#### 2.2.6 Cifrado y Descifrado (métodos de appData)

```javascript
// Cifrar una cadena de texto
var cifrado = appData.encryptString("texto sensible");

// Descifrar una cadena previamente cifrada
var descifrado = appData.decryptString(cifrado);

// Variantes con flags opcionales
var cifrado2 = appData.encrypt("texto", "flags_opcionales");
var descifrado2 = appData.decrypt(cifrado2, "flags_opcionales");
```

#### 2.2.7 Objeto error() - Control de Errores del Framework

El manejo de errores del framework se realiza a traves de `appData.error()`. Es fundamental verificar errores después de operaciones críticas.

```javascript
// Verificar si hubo error
if (appData.error().getNumber() != 0) {
    // Obtener descripción del error
    var desc = appData.error().getDescription();

    // Obtener SQL que fallo (si aplica)
    var sql = appData.error().getFailedSql();

    ui.msgBox("Error: " + desc, "ERROR", 0);
    if (sql) {
        ui.msgBox("SQL fallida: " + sql, "SQL", 0);
    }

    // Limpiar el error (importante: siempre limpiar después de manejar)
    appData.error().clear();
}

// Patron completo: verificar error después de operación
var coll = appData.getCollection("ArticulosBuscar");
var filtroOriginal = coll.getFilter();
coll.setFilter("CODARTICULO=" + codigoArticulo);
coll.startBrowse();

if (appData.error().getNumber() != 0) {
    ui.msgBox("Error: " + appData.error().getDescription(), "ERROR", 0);
    appData.error().clear();
} else {
    // Procesar resultados normalmente
    var item = coll.getCurrentItem();
}

coll.setFilter(filtroOriginal);
coll.endBrowse();
```

#### 2.2.8 Consola de Depuracion

```javascript
// Escribir en la consola de depuracion
appData.writeConsoleString("App_log_xone->Mensaje de depuracion");
appData.writeConsoleString("Debug: valor = " + JSON.stringify(datos));

// Patron de depuracion condicional con variables de empresa
function ShowMessageDebug(mode, stmsg) {
    if (appData.getCurrentEnterprise().getVariable("Debug") === true) {
        if (mode === "msgbox")
            ui.msgBox(stmsg, "App_log_xone!", 0);
        else if (mode === "showtoast")
            ui.showToast("App_log_xone->" + stmsg);
        else if (mode === "consola")
            appData.writeConsoleString("App_log_xone->" + stmsg);
    }
}
```

#### 2.2.9 Ejecución SQL Directa

**Firma:** `appData.executeSql(sql)`

- **Parámetros:** exactamente **1** — string SQL (no soporta placeholders `?` ni varargs; para parametrizar usar `SqlManager.doRawQuery()`).
- **Sustitución de macros:** sí, automática. Las macros del framework (`##USERID##`, `##NOW##`, etc.) se sustituyen en el SQL antes de ejecutarlo.
- **No usar para leer escalares**: para `SELECT` no devuelve el valor — devuelve un cursor inutilizable desde JS. Para leer datos usar `SqlManager.doRawQuery()` + cursor.
- **Uso recomendado:** sentencias de modificación (`UPDATE`/`INSERT`/`DELETE`) sobre la BBDD local, especialmente útil cuando hay cursores abiertos sobre la misma tabla y `CurrentItem` no puede modificarse desde la coll.
- **Seguridad:** **NUNCA concatenar input de usuario sin validar** (riesgo de SQL injection). Para consultas con parámetros usar `SqlManager.doRawQuery("... WHERE X=?", valor)`.

```javascript
// === UPDATE/DELETE: uso típico de executeSql ===
// IDUSUARIO viene de self (entero validado); concatenación segura
appData.executeSql("UPDATE Gen_Rutas SET VISITADO=0 WHERE IDUSUARIO=" + self.IDUSUARIO);

// === SELECT: NO usar executeSql para leer escalares ===
// Esto NO devuelve el número de filas (devuelve un cursor inutilizable desde JS)
// var resultado = appData.executeSql("SELECT COUNT(*) FROM Gen_Clientes WHERE ACTIVO=1"); // MAL

// Forma correcta para leer datos: SqlManager + cursor
let sqlManager = new SqlManager();
try {
    sqlManager.openDatabase({ databasePath: "gestion.db", useExistingConnection: true });
    let cursor = sqlManager.doRawQuery("SELECT COUNT(*) AS N FROM Gen_Clientes WHERE ACTIVO=?", 1);
    try {
        cursor.moveToFirst();
        var resultado = cursor.getInteger("N");
    } finally {
        cursor.close();
    }
} finally {
    sqlManager.close();
}
```

#### 2.2.10 Control de Replicación

```javascript
// Desactivar replicacion para operaciones de mantenimiento
appData.setIsReplicating(false);
// ... operaciones de mantenimiento que no deben sincronizarse
appData.setIsReplicating(true);

// Verificar estado de replicacion
var replicando = appData.isReplicating();
```

#### 2.2.10b Otros métodos de appData

```javascript
// === Conexiones ===
var conn = appData.getConnection("REMOTA");   // conexión por nombre
var s    = appData.getConnString();           // string de la conexión principal

// === Diagnóstico ===
var nColls = appData.getCollectionCount();    // total de colecciones registradas
var conds  = appData.getVisualConditions();   // string con las condiciones visuales activas
```

#### 2.2.11 Objeto `replica`

Además del control desde `appData`, existe un objeto global `replica` con más control: iniciar/detener el servicio, procesar la cola manualmente, consultar métricas en tiempo real y fijar restricciones.

**Catálogo completo de métodos:**

| Método | Descripción |
| --- | --- |
| **start** | Iniciar el servicio de réplica. |
| **stop** | Detener la réplica. |
| **processReplicatorQueue(arg)** | Procesar cola pendiente. El argumento NO es un callback: acepta el `LiveSecureProvisioningResponse` del evento `live`, un `string` con el nombre de la app, o un `{databasePath, appName, taskId}`. Devuelve `boolean`. |
| **getLog** | Obtener log de la réplica. |
| **getDatabaseId** | ID de la base de datos. |
| **getHostname** | Nombre de host del servidor. |
| **getLicense** | Licencia. |
| **getMid** | MID (identificador del dispositivo). |
| **getRecordsPend** | Registros pendientes por enviar. |
| **getRecordsRX** / **getRecordsTX** | Registros recibidos/enviados en la sesión actual. |
| **getTotalRecordsRX** / **getTotalRecordsTX** | Totales desde el inicio. |
| **setRestriction** | Ajustar una restricción de réplica (p.ej. solo wifi). |
| **clearRestrictions** | Quitar restricciones actuales. |
| **clearAllRestrictions** | Quitar todas las restricciones. |

```javascript
// Forzar replica manual y reportar metricas al terminar.
// El argumento es el liveResponse recibido en el evento live, o el nombre de la app.
function forzarReplica(liveResponse) {
    ui.showWaitDialog("Sincronizando...");
    let ok = replica.processReplicatorQueue(liveResponse);
    ui.hideWaitDialog();

    if (ok) {
        ui.msgBox(
            "Sincronización OK\n" +
            "TX: " + replica.getRecordsTX() + " / " + replica.getTotalRecordsTX() + "\n" +
            "RX: " + replica.getRecordsRX() + " / " + replica.getTotalRecordsRX() + "\n" +
            "Pendientes: " + replica.getRecordsPend(),
            "Replica", 0
        );
    } else {
        ui.showToast("Error en la replica");
    }
}
```

#### 2.2.12 Carga dinámica de scripts (`loadIncludeFile`) y declaración preferida

> **Regla general:** declara los scripts en el nodo `<app>` siempre que puedas. Reserva `loadIncludeFile()` para casos especiales que **realmente** necesiten cargar el fichero en runtime (carga condicional según usuario/empresa, scripts descargados dinámicamente, parches en caliente, etc.).

**Forma preferida — declarar en el nodo `<app>` (estática):**

```xml
<app default-language="javascript" ...>
    <!-- functions.js se carga automáticamente, no hace falta declararlo -->

    <!-- Forma <include>: encoding por defecto ISO-8859-1 -->
    <include file="scripts/utils.js" />
    <include url="scripts/api.js" encoding="UTF-8" />

    <!-- Forma <script> (alias estilo HTML): encoding por defecto UTF-8 -->
    <script src="scripts/auth.js" />
</app>
```

Atributos comunes a `<include>` y `<script>`:

| Atributo | Alias | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `file` | `url`, `src` | sí | — | Ruta del fichero |
| `language` | — | no | `default-language` del `<app>` | `"javascript"` o `"vbscript"` |
| `encoding` | `charset` | no | `ISO-8859-1` en `<include>` · `UTF-8` en `<script>` | Codificación del fichero |
| `delay-compilation` | — | no | `false` | Difiere la compilación hasta el primer uso |
| `compile` | — | no | `true` | Si `false`, registra el fichero pero no lo compila |

**Forma dinámica — `appData.loadIncludeFile()` (solo casos especiales):**

```javascript
appData.loadIncludeFile(fileName [, scriptLanguage] [, encoding] [, delayCompilation] [, compile]);
```

| # | Nombre | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| 1 | `fileName` | sí | — | Ruta del fichero igual que en el nodo XML `<include>` |
| 2 | `scriptLanguage` | no | `default-language` del nodo `<app>` | `"javascript"` o `"vbscript"` |
| 3 | `encoding` | no | `"ISO-8859-1"` | Codificación del fichero. **Atención: el default NO es UTF-8** |
| 4 | `delayCompilation` | no | `false` | Si `true`, difiere la compilación hasta el primer uso |
| 5 | `compile` | no | `true` | Si `false`, registra el fichero pero no lo compila |

```javascript
// Carga simple (asume default-language=javascript y encoding ISO-8859-1)
appData.loadIncludeFile("scripts/miModulo.js");

// Recomendado si el script tiene tildes/ñ guardadas como UTF-8
appData.loadIncludeFile("scripts/miModulo.js", "javascript", "UTF-8");
```

**Advertencia sobre el encoding:** el valor por defecto es `ISO-8859-1`, no UTF-8. Si tu script contiene caracteres no-ASCII (tildes, ñ, símbolos) y está guardado como UTF-8, **se romperán** salvo que pases `"UTF-8"` explícitamente como tercer parámetro.

Llamadas posteriores al mismo fichero **no recompilan**: el motor reutiliza el bytecode ya cargado.

#### 2.2.13 Carga dinámica de CSS (`loadCssFile` / `unloadCssFile`) y declaración preferida

> **Regla general:** declara las hojas de estilo en el nodo `<app>` siempre que puedas. Reserva `loadCssFile()` / `unloadCssFile()` para casos especiales (cambio de tema por usuario, modo oscuro/claro en runtime, A/B testing visual, etc.).

**Forma preferida — declarar en el nodo `<app>` (estática):**

```xml
<app ...>
    <style url="estilos.css" />
    <style url="temas/oscuro.css" encoding="UTF-8" conditions="##DEVICE_OS##='android'" strict-mode="true" />
</app>
```

Atributos del nodo `<style>`:

| Atributo | Obligatorio | Default | Descripción |
|---|---|---|---|
| `url` | sí | — | Ruta del fichero CSS |
| `encoding` | no | (depende del fichero) | Codificación del fichero |
| `conditions` | no | (sin condición) | Condición de carga evaluada al iniciar (p. ej. macros globales) |
| `strict-mode` | no | `false` | Si `true`, exige CSS bien formado (avisa de errores como falta de `;`). En modo estricto hay que escapar `:` en valores: `title:Hola\:Mundo;` |

**Forma dinámica — `appData.loadCssFile()` / `appData.unloadCssFile()` (solo casos especiales):**

```javascript
// Forma 1: argumentos posicionales
appData.loadCssFile(name [, encoding] [, conditions] [, strictMode]);

// Forma 2: objeto literal
appData.loadCssFile({ name: "...", encoding: "...", conditions: "...", strictMode: false });

// Descarga (un único argumento)
appData.unloadCssFile(name);
```

Parámetros de `loadCssFile`:

| # / clave | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|
| `name` | sí | — | Ruta del fichero CSS |
| `encoding` | no | `"UTF-8"` | Codificación del fichero (¡distinto de `loadIncludeFile`!) |
| `conditions` | no | (sin condición) | Condición de carga |
| `strictMode` | no | `false` | Modo estricto de parseo |

```javascript
// Ejemplo: cambio de tema en runtime
function aplicarTemaOscuro() {
    appData.unloadCssFile("temas/claro.css");
    appData.loadCssFile("temas/oscuro.css", "UTF-8");
    // El framework limpia caches de propiedades y refresca la cascada
}
```

`loadCssFile()` y `unloadCssFile()` invalidan automáticamente los caches internos de propiedades visuales (`ClearCollPropValueCaches()`), por lo que los cambios se reflejan en los siguientes renders sin reiniciar la app.

**Diferencia de encoding por defecto:**

| Método | Default encoding |
|---|---|
| `appData.loadCssFile()` | `"UTF-8"` |
| `appData.loadIncludeFile()` | `"ISO-8859-1"` |
| `<style>` en `<app>` | depende del fichero |
| `<include>` en `<app>` | `"ISO-8859-1"` |
| `<script>` en `<app>` | `"UTF-8"` |

