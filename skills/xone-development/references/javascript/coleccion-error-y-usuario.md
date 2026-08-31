# XOne JavaScript — selfDataColl, err y user

> Fuente: `xone/v2/xone-help-docs/topics/06-javascript-runtime-objects.md` §1–§4. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §1 objetos globales y sus alias · §2 API completa de la colección actual (información, acceso, crear/añadir/borrar, browse, filtros y orden, búsqueda full-text, macros y variables, metadatos, SQL directo y JSON) · §3 objeto de error global y excepciones del framework · §4 usuario logueado

---

## 1. Objetos Globales — Resumen

Los siguientes objetos se inyectan automáticamente en cada script de XOne:

| Nombre global | Alias | Que representa |
|---|---|---|
| `self` | `dataobject` | El objeto/registro actual sobre el que se ejecuta el script. API completa en tópico 03 sección 2. |
| `selfDataColl` | `datacollection` | La coleccion actual. API completa en §2 de este tópico. |
| `appData` | `appdata` | La aplicación (raiz). API en tópico 03 sección 4. |
| `user` | — | El usuario logueado. Hereda toda la API de `self`. Ver §4. |
| `err` | `error` | El último error producido por el framework. Ver §3. |
| `ui` | — | La interfaz de usuario y servicios del dispositivo. API en tópico 03 sección 3. |

> **Regla de nomenclatura:** Los alias (`dataobject`, `datacollection`, `appdata`, `error`) son equivalentes a los nombres principales. En JavaScript se recomienda usar los nombres principales (`self`, `selfDataColl`, `appData`, `err`).

---

## 2. selfDataColl / datacollection — Coleccion Actual

`selfDataColl` representa la coleccion sobre la que se ejecuta el script actual. Es el equivalente al concepto de "tabla" o "resultado de consulta" en memoria.

### 2.1 Información básica

| Método | Descripción |
|---|---|
| `getName()` / `name()` → `String` | Nombre de la coleccion (el atributo `name` del `<coll>`). |
| `getOwnerApp()` → `appData` | App propietaria. |
| `getOwnerObject()` / `ownerObject()` → `dataobject` | Objeto contenedor (en colecciones anidadas / contents). |
| `getCount()` / `count()` → `int` | Total de objetos cargados en memoria. |
| `isEmpty()` → `boolean` | Atajo equivalente a `getCount() == 0`. |
| `browseLength()` → `long` | Cantidad de filas del recorrido browse. **Solo devuelve un valor útil tras `startBrowse(true)`**; con `startBrowse()` por defecto devuelve `-1`. |
| `stringKey()` → `boolean` | `true` si la PK es de tipo texto. |
| `getMultipleKey()` → `boolean` | `true` si la PK es múltiple (varios campos clave). |
| `getCurrentItem()` → `dataobject` | Objeto actual del cursor browse. **El objeto devuelto es efímero**: su contenido se reemplaza con cada `moveNext()`. No guardar la referencia para usarla después; leer o copiar los campos dentro de la iteración. |
| `getIdFieldName()` → `String` | Nombre del campo PK de la coleccion. |
| `isFull()` → `boolean` | `true` si todos los registros están cargados en memoria. |
| `isLocked()` → `boolean` | `true` si la coleccion esta bloqueada (`lock()`). |
| `isBrowsing()` → `boolean` | `true` si hay un cursor browse activo. |
| `getXmlNode()` → `XmlNode` | Nodo XML que define la coleccion (acceso a metadatos del modelo). |
| `getConnection()` / `getDataConnector()` → `Connection` | Conexión de base de datos usada. |
| `getAccessString()` → `String` | SQL/objeto de acceso declarado en la coll. |
| `getDevelopedAccessString()` → `String` | SQL con macros expandidas. |
| `getDevelopedFilter()` → `String` | Filtro activo con macros expandidas. |
| `getDevelopedLinkFilter()` → `String` | Linkfilter con macros expandidas. |

### 2.2 Acceso a objetos

| Método | Descripción |
|---|---|
| `get(index)` / `getObject(index)` / `getItem(index)` → `dataobject` | Obtiene el objeto por índice (base 0). |
| `get(key)` / `getObject(key)` / `getItem(key)` → `dataobject` | Obtiene el objeto por valor de PK (clave). |
| `getItem(field, value)` → `dataobject` | Busca por par campo/valor (primero en memoria, luego en BD). Equivalente a `getObject(field, value)`. |
| `findObject(criteria)` → `dataobject` | Busca el primer objeto que cumple una cláusula WHERE SQL (p.ej. `"LOGIN='admin'"` o `"ID=5 AND ACTIVO=1"`). Lanza la búsqueda contra BD. |
| `findAllObjects(criteria)` → `Object[]` | Igual que `findObject` pero devuelve todas las coincidencias. |
| `getObjectIndex(item)` → `int` | Índice del objeto dentro de la coleccion. |
| `swapItems(a, b)` | Intercambia dos objetos de posición. Cada argumento puede ser índice, clave PK o `dataobject`. Si alguno no se encuentra en la coll, no hace nada. |

### 2.3 Crear, anadir, borrar

| Método | Descripción |
|---|---|
| `createObject(...)` → `dataobject` | Crea un nuevo objeto (no guardado en BD) (legacy; el patrón preferido es `new NombreColeccion({...})`). |
| `createClone()` → `datacollection` | Clona la coleccion (útil para filtrar sin afectar la original). |
| `addItem(item)` / `addItem(index, item)` → `boolean` | Anade un objeto a la lista en memoria. Con 2 params, el **índice va primero** y el item segundo. Si `index == -1` se añade al final. |
| `removeItem(idx \| key \| dataobject)` → `boolean` | Elimina un objeto **solo de la lista en memoria**. **NO** lo borra en BD. |
| `deleteItem(idx \| key \| dataobject)` → `boolean` | Elimina un objeto de la lista **Y de la base de datos**. |
| `clear()` → `boolean` | Vacia la coleccion en memoria. Si la coll está bloqueada con `lock()`, no hace nada. |
| `deleteAll()` → `boolean` | Borra todos los objetos en BD. |
| `browseDeleteAll()` → `boolean` | Borra todos recorriendo (lanza eventos por objeto). |
| `browseDeleteWithNoRules()` → `boolean` | Borra todos sin lanzar eventos. |
| `loadAll()` → `boolean` | Carga todos los registros en memoria. Usar con precaucion en datasets grandes. |
| `saveAll()` → `boolean` | Guarda todos los objetos modificados. |

### 2.4 Browse (cursor de navegación)

El browse es el patron correcto para recorrer grandes colecciones sin cargarlas todas en memoria.

| Método | Descripción |
|---|---|
| `startBrowse(...)` → `boolean` | Inicia el cursor browse. |
| `endBrowse()` → `boolean` | Finaliza el cursor. **Siempre en bloque `finally`**. |
| `moveFirst()` → `boolean` | Mueve al primer item. |
| `moveLast()` → `boolean` | Mueve al último item. |
| `moveNext()` → `boolean` | Avanza al siguiente item. Devuelve `false` al llegar al final. |
| `movePrevious()` → `boolean` | Retrocede al item anterior. |
| `lock()` / `unlock()` | Bloquea/desbloquea la coll. La coll nace **desbloqueada**. Estando bloqueada, `clear()` y `loadAll()` no hacen nada — útil para "congelar" el contenido de la coll mientras se opera sobre ella. `isLocked()` devuelve el estado actual. |

```js
// Patron correcto: startBrowse posiciona en el primer item; iterar con getCurrentItem+moveNext;
// siempre endBrowse() en finally.
var coll = appData.getCollection("Pedidos");
coll.setFilter("estado = 'pendiente'");
coll.startBrowse();
try {
    var item = coll.getCurrentItem();
    while (item != null) {
        item.setValue("revisado", 1);
        item.save();
        if (!coll.moveNext()) break;
        item = coll.getCurrentItem();
    }
} finally {
    coll.endBrowse();
}
```

### 2.5 Filtros y orden

| Método | Descripción |
|---|---|
| `getFilter()` → `String` | Filtro SQL activo. |
| `setFilter(value)` | Cambia el filtro SQL. |
| `getLinkFilter()` → `String` | Linkfilter activo. |
| `setLinkFilter(value)` | Cambia el linkfilter. |
| `getSort()` → `String` | Orden activo. |
| `setSort(value)` | Cambia el orden. |
| `doSort(expr?)` | Reordena los objetos **en memoria**. Acepta una expresión SQL-like (`"CAMPO asc, CAMPO2 desc"`); sin argumento usa el sort actual de la coll. |
| `reload(xmlNode, [forced])` → `boolean` | **NO recarga datos.** Recarga la **definición XML** de la coll en runtime. Requiere un nodo XML obligatorio; sin él falla. Para recargar los datos con el filtro actual usar `clear()`+`loadAll()` o un nuevo `startBrowse()`. |
| `rebuildLayout(...)` | Reconstruye el layout de propiedades visibles. |

### 2.6 Busqueda full-text

| Método | Descripción |
|---|---|
| `createSearchIndex(field/fields[]/table+fields[])` | Crea índice FTS para busqueda rápida. |
| `createPersistData(fields.../table+fields...)` | Crea tabla persistente de busqueda. |
| `doSearch(criteria)` / `doSearch(table, criteria)` | Ejecuta la busqueda full-text. |
| `generateRowId()` → `String` | Genera un nuevo ROWID (GUID) valido para un nuevo objeto. |

### 2.7 Macros y variables de coleccion

| Método | Descripción |
|---|---|
| `getMacro(name)` / `getMacro(index)` → `String` | Lee el valor de una macro. Acepta nombre (`"##X##"`) o índice numérico. |
| `setMacro(name, value)` / `setMacro(index, value)` | Asigna una macro. Igual: por nombre o por índice. |
| `getMacroCount()` → `int` | Número de macros declaradas. |
| `getAllMacros()` → `Map<String,Object>` | Todas las macros como mapa. |
| `getVariable(name)` → `Object` | Lee variable de scope (en memoria, no se persiste). |
| `setVariable(name, value)` | Asigna variable de scope. |
| `getVariables(name)` / `setVariables(name, value)` | **Obsoletos.** Alias de `getVariable`/`setVariable`; usar las formas en singular. |
| `getAllVariables()` → `Map<String,Object>` | Todas las variables. |

> **Importante:** Para usar `setMacro` hay que declarar previamente el nodo `<macro name="##X##" value="" default="true" />` como hijo directo de `<coll>`.

### 2.8 Metadatos y propiedades

| Método | Descripción |
|---|---|
| `getCollPropertyValue(attr)` → `String` | Lee un atributo XML del nodo `<coll>` (p.ej. `"sql"`, `"loadall"`). |
| `getGroupCount()` → `int` | Número de grupos. |
| `getGroup(index)` → `String` | Nombre del grupo por índice. |
| `getPropertyCount()` → `int` | Número de propiedades. |
| `getPropertyName(index)` / `propertyName(index)` → `String` | Nombre del campo por índice. |
| `getPropType(name)` / `propType(name)` → `String` | Tipo del campo (`T`, `TL`, `N`, `NC`, `Z`, `D`, etc.). |
| `getPropertyTitle(name)` → `String` | Título visible del campo. |
| `getPropertyGroup(name)` → `String` | Nombre del grupo al que pertenece el campo. |
| `getPropVisibility(name)` / `propVisibility(name)` → `String` | Visibilidad bitmask del campo. |
| `bind(...)` / `unbind(...)` | Vincula/desvincula eventos. |
| `clearCaches()` | Propaga `clearCaches()` a todos los objetos cargados en memoria (vacía la caché de atributos resueltos de cada uno). |

### 2.9 SQL directo y JSON

| Método | Descripción |
|---|---|
| `executeSqlString(sql)` → `Object` | Ejecuta SQL contra la conexión de la coll. **Las macros (`##X##`) se sustituyen automáticamente** en el SQL antes de ejecutarlo. |
| `toJson()` → `Object[]` | Serializa todos los objetos en memoria a un array. |
| `loadFromJson(jsonArray, [{strictMode: true}])` → `datacollection` | Hidrata la coleccion desde un array. **Vacía la coll antes de cargar.** Acepta un array JSON o un string parseable como JSON. Con `strictMode: true` ignora campos no declarados en el mapping. |

```js
// Ejemplo: clonar coleccion para filtrar sin afectar la original
var colOriginal = appData.getCollection("Articulos");
var colFiltrada = colOriginal.createClone();
colFiltrada.setFilter("activo = 1");
colFiltrada.reload();
appData.writeConsoleString("Articulos activos: " + colFiltrada.getCount());
```

---

## 3. err / error — Objeto de Error Global

`err` (alias `error`) es el objeto de error global del framework. Se actualiza automáticamente cuando se produce un error en operaciones de BD, guardado, etc.

| Método | Descripción |
|---|---|
| `getNumber()` → `int` | Código de error. `0` significa sin error. |
| `setNumber(value)` | Asigna un código de error personalizado. |
| `getDescription()` → `String` | Descripción/mensaje del error. |
| `setDescription(value)` | Asigna un mensaje de error personalizado. |
| `getFailedSql()` → `String` | La sentencia SQL que provoco el error (si aplica). |
| `clear()` | Limpia el estado de error (pone número a 0 y descripción a ""). |
| `toString()` → `String` | Serialización legible: `"[código] descripción"`. |

```js
// Patron de verificación de errores tras operación
self.save();
if (err.getNumber() != 0) {
    appData.writeConsoleString("Error " + err.getNumber() + ": " + err.getDescription());
    if (err.getFailedSql()) {
        appData.writeConsoleString("SQL: " + err.getFailedSql());
    }
    err.clear();
}
```

```js
// Usar failWithMessage para lanzar un error controlado
// (detiene la ejecución del flujo y propaga el código y mensaje)
if (!self.getValue("DNI")) {
    appData.failWithMessage(101, "El DNI es obligatorio");
}
```

### 3.1 Excepciones del framework

| Excepción | Causa típica |
|---|---|
| `XoneGenericException` | Error generico del framework. |
| `XoneFailWithMessageException` | Lanzada por `appData.failWithMessage(code, msg)`. |
| `XOneJavascriptException` | Error en el motor JS (sintaxis, variable no definida, etc.). |
| `FormulaParseException` | Error al parsear una formula de atributo XML. |
| `LocationNotFoundException` | No hay fix GPS disponible. |
| `PluginNotInstalledException` | Plugin requerido no esta instalado. |

```js
try {
    self.save();
} catch (e) {
    appData.writeConsoleString("Excepcion: " + e);
    err.setNumber(-1);
    err.setDescription(e.toString());
}
```

---

## 4. user — Usuario Logueado

`user` representa la fila del usuario que ha iniciado sesión. Hereda **toda la API de `self` / `dataobject`**: `getValue`, `setValue`, `save`, `executeNode`, `getOwnerCollection`, etc.

```js
var nombre   = user.getValue("NOMBRE");
var rol      = user.getValue("ROL");
var empresa  = user.getValue("IDEMPRESA");

// user tiene las mismas propiedades que cualquier dataobject
user.setValue("ULTIMO_ACCESO", new Date().toISOString());
user.save();
```

> **Nota:** Si el mapping no tiene coleccion de login configurada, `user` sera `null`. Verificar antes de usar en pantallas de acceso publico.

