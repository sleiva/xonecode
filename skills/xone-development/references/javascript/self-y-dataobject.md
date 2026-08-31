# XOne JavaScript — self y el DataObject

> Fuente: `xone/v2/xone-help-docs/topics/03a-js-self.md` §2. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §2 acceso a campos, getOldValue, getOwnerCollection, getContents, setFieldPropertyValue, executeNode, save, JSON, métodos adicionales del DataObject, selfDataColl y métodos de DataCollection

---

## 2. Objeto Global `self` - El DataObject Actual

El objeto `self` representa la instancia actual del DataObject (registro/fila) en el contexto de ejecución del script. Es el puente entre la interfaz XML y la lógica JavaScript.

### 2.1 Acceso a Campos

Existen tres formas equivalentes de acceder a los campos del objeto actual:

```javascript
// Forma 1: Notacion de punto (mas comun y recomendada)
let nombre = self.MAP_NOMBRE;
self.MAP_NOMBRE = "Nuevo valor";

// Forma 2: Notacion de corchetes (util para nombres dinamicos)
let campo = "MAP_NOMBRE";
let nombre = self[campo];
self[campo] = "Nuevo valor";

// Forma 3: Metodos getValue/setValue (mas explicito)
let nombre = self.getValue("MAP_NOMBRE");
self.setValue("MAP_NOMBRE", "Nuevo valor");

// Asignar diferentes tipos de datos
self.MAP_TEXTO = "Texto";           // String (tipo T)
self.MAP_NUMERO = 42;               // Numerico (tipo N)
self.MAP_FECHA = new Date();         // Fecha (tipo D)
self.MAP_ACTIVO = 1;                 // Booleano (tipo B, 0 o 1)
self.MAP_FOTO = "ruta/imagen.jpg";   // Imagen (tipo IMG/PH)
```

### 2.2 getOldValue() - Valor Anterior

Permite obtener el valor que tenía un campo antes de la última modificación. Muy útil en eventos `<onchange>`:

```javascript
// Dentro de un <onchange> de la propiedad MAP_PRECIO
function onPrecioChanged() {
    let precioAnterior = self.getOldValue("MAP_PRECIO");
    let precioNuevo = self.MAP_PRECIO;

    if (precioNuevo > precioAnterior * 2) {
        ui.showToast("Advertencia: el precio se ha duplicado");
    }

    // Registrar el cambio
    console.log("Precio cambio de " + precioAnterior + " a " + precioNuevo);
}
```

### 2.3 getOwnerCollection() - Coleccion Propietaria

Permite obtener la coleccion a la que pertenece el objeto:

```javascript
// Obtener la coleccion propietaria
let coll = self.getOwnerCollection();
let nombreColl = coll.getName();
console.log("Este objeto pertenece a: " + nombreColl);

// Obtener la aplicación propietaria
let app = self.getOwnerApp();

// Verificar si el objeto es nuevo o existente
if (self.isNew()) {
    console.log("Es un registro nuevo, sin guardar en BD");
}

// Verificar si hay cambios sin guardar
if (self.getDirty()) {
    console.log("Hay cambios pendientes de guardar");
}

// Obtener indice del objeto en la coleccion
let indice = self.getObjectIndex();
```

### 2.4 getContents("nombre") - Acceso a Contents

Los contents son colecciones hijas (relación maestro-detalle) embebidas en un objeto:

```javascript
// Obtener un content
let lineas = self.getContents("@LineasPedido");

// Cargar datos del content
lineas.unlock();
lineas.clear();
lineas.loadAll();
lineas.lock();

// Contar items
let total = lineas.getCount();
console.log("Hay " + total + " lineas");

// Iterar los items
for (let i = 0; i < lineas.getCount(); i++) {
    let linea = lineas.get(i);
    console.log("Línea " + i + ": " + linea.MAP_DESCRIPCION);
}

// Agregar un item al content
lineas.unlock();
let nuevaLinea = lineas.createObject();
nuevaLinea.MAP_DESCRIPCION = "Producto nuevo";
nuevaLinea.MAP_CANTIDAD = 1;
nuevaLinea.MAP_PRECIO = 25.50;
lineas.addItem(nuevaLinea);
lineas.lock();
lineas.saveAll();

// Obtener todos los nombres de contents disponibles
let nombresContents = self.getAllContentNames();
```

### 2.5 setFieldPropertyValue() - Cambiar Atributos en Runtime

Permite modificar atributos visuales de las propiedades (controles) en tiempo de ejecución.

> ⚠️ **Método de último recurso.** Antes de usar `setFieldPropertyValue` valora siempre alternativas más limpias: cambiar la clase CSS con `getControl(...).setClass(...)`/`addClass(...)`, usar métodos específicos del control (p. ej. `control.setFlashMode(...)`), o expresar el comportamiento directamente en el XML/CSS. Sobrescribir atributos por cache rompe la trazabilidad respecto al XML original y obliga a recordar el `ui.refresh()` manual; úsalo solo cuando no exista una vía declarativa o un método de control equivalente.

**Firma:**

```javascript
self.setFieldPropertyValue(fieldName, attrName, value);  // 3 strings, devuelve null
self.getFieldPropertyValue(fieldName, attrName);         // 2 strings, devuelve string
```

- `fieldName`: nombre del prop (p. ej. `"MAP_TITULO"`). Obligatorio, string.
- `attrName`: atributo visual (`"width"`, `"img"`, `"visible"`, `"bgcolor"`, …). Obligatorio, string. Acepta alias CSS3 (p. ej. `"background-color"` se canonicaliza a `"bgcolor"`, así que escribir con uno y leer con el otro alias devuelven el mismo valor cacheado).
- `value`: valor como string. Pasar `null` borra el override y restaura el valor original del XML/CSS.

Lanza excepción si falta un parámetro o si alguno no es string.

**El cambio NO repinta solo — hay que llamar a `ui.refresh()`:**

`setFieldPropertyValue` actualiza la caché de atributos del objeto, pero el control en pantalla no se redibuja hasta llamar a `ui.refresh(prop)` (con el nombre del prop afectado) o `ui.refresh()` (refresca todo).

```javascript
// Cambiar la imagen de un botón
self.setFieldPropertyValue("MAP_BOTON", "img", "nuevo_icono.png");
ui.refresh("MAP_BOTON");  // <-- imprescindible para ver el cambio

// Cambiar el ancho de un campo
self.setFieldPropertyValue("MAP_TITULO", "width", "200p");
ui.refresh("MAP_TITULO");

// Leer un atributo actual
let ancho = self.getFieldPropertyValue("MAP_TITULO", "width");

// Cambiar visibilidad de un campo (ver topico 01 para valores bitmask)
self.setFieldPropertyValue("MAP_CAMPO_OCULTO", "visible", "7");
ui.refresh("MAP_CAMPO_OCULTO");

// Restaurar el valor original del XML/CSS (borrar el override)
self.setFieldPropertyValue("MAP_TITULO", "width", null);
ui.refresh("MAP_TITULO");

// Ejemplo real del wiki: togglear icono de flash de camara
function doToggleFlashMode() {
    let control = getControl("MAP_CAMERA");
    if (!control) return;

    let sFlashMode = control.getFlashMode();
    if (sFlashMode == "on") {
        control.setFlashMode("off");
        self.setFieldPropertyValue("MAP_TOGGLE_FLASH_MODE", "img", "flash-off.png");
    } else if (sFlashMode == "off") {
        control.setFlashMode("auto");
        self.setFieldPropertyValue("MAP_TOGGLE_FLASH_MODE", "img", "flash-auto.png");
    } else if (sFlashMode == "auto") {
        control.setFlashMode("torch");
        self.setFieldPropertyValue("MAP_TOGGLE_FLASH_MODE", "img", "flash-torch.png");
    } else if (sFlashMode == "torch") {
        control.setFlashMode("on");
        self.setFieldPropertyValue("MAP_TOGGLE_FLASH_MODE", "img", "flash-on.png");
    }
    ui.refresh("MAP_TOGGLE_FLASH_MODE");
}
```

### 2.6 executeNode("nodo") - Ejecutar Eventos Custom

Permite ejecutar nodos `<script>` con nombre definido en el XML:

```javascript
// En el XML:
// <script nodeName="applyfilter">
//     <script language="javascript">aplicarFiltro();</script>
// </script>

// Desde JavaScript:
self.executeNode("applyfilter");

// Ejemplo real del wiki: filtrar por texto
function FiltraMarcados(e) {
    self.MAP_BUSCAR_TEXT = e.newText;
    self.executeNode("applyfilter");
}
```

### 2.7 save() - Guardar Cambios

```javascript
// Guardar el objeto actual en la base de datos
self.save();

// Patron seguro con verificación de error
function guardarSeguro() {
    try {
        self.save();
        ui.showToast("Guardado correctamente");
    } catch(ex) {
        ui.showToast("Error al guardar: " + ex);
    }
}

// Verificar errores después de guardar
self.save();
let error = appData.error();
if (error.getNumber() != 0) {
    ui.showToast("Error: " + error.getDescription());
    error.clear();
}
```

### 2.8 Conversion a/desde JSON

```javascript
// Convertir el objeto actual a JSON
let jsonObj = self.toJson();          // Retorna objeto JS nativo
let jsonStr = self.toJsonString();    // Retorna string JSON

// Cargar datos desde JSON
self.loadFromJson('{"MAP_NOMBRE": "Test", "MAP_ACTIVO": 1}');

// Clonar un objeto
let copia = self.clone();
```

### 2.9 Métodos Adicionales del DataObject

```javascript
// === getParent() - Obtener el objeto padre (relacion maestro-detalle) ===
var padre = self.getParent();
if (padre) {
    console.log("Padre: " + padre.MAP_NOMBRE);
}

// === refresh() / refresh(sqlSentence) - Recargar los valores desde BD ===
// Vuelve a leer el registro de la base de datos (descarta cambios en memoria no guardados).
// NO refresca la UI — para eso usa ui.refresh(prop).
// Con argumento, ejecuta esa sentencia SQL en lugar de la del mapping.
self.refresh();
self.refresh("SELECT * FROM PRODUCTOS WHERE ID=" + self.MAP_ID);

// === setVariable(name, value) / getVariable(name) ===
// Variables de scope del objeto (en memoria, no se persisten en BD).
// Útil para pasar datos entre scripts del mismo objeto sin tocar la base.
self.setVariable("estadoCalculo", "ok");
var estado = self.getVariable("estadoCalculo");

// === isPropertyDirty(name) / getDirtyProperties() ===
// Para saber qué campos han cambiado desde la última carga/guardado.
if (self.isPropertyDirty("MAP_PRECIO")) {
    console.log("El precio ha cambiado");
}
var camposCambiados = self.getDirtyProperties();   // Array de nombres

// === Contents: metadatos ===
var nContents = self.getContentsCount();
var sql = self.getContentAttr("@LineasPedido", "sql");   // atributo XML del content

// === getOldItem(name) ===
// Como getOldValue, pero sin conversion de tipos Date/Calendar (devuelve el valor crudo).
var valorAntes = self.getOldItem("MAP_FECHA");

// === setNodePropertyValue / getNodePropertyValue ===
// Cambia en runtime un atributo de un nodo del layout, localizándolo por su TAG
// (frame, group, prop...) y el valor de su atributo "name". Para FRAMES es la vía
// correcta: setFieldPropertyValue solo actúa sobre props/campos, NO sobre frames.
// ⚠️ Método de último recurso: mismo criterio que setFieldPropertyValue (sección 2.5)
//    — antes valora cambiar la clase CSS, usar métodos del control, o dejarlo resuelto
//    en el XML/CSS desde el inicio. Sobrescribir atributos por caché obliga a refrescar
//    a mano y rompe la trazabilidad respecto al XML original.
// El cambio se aplica al renderizar; si la vista ya está creada, refrescar después
// (window.refresh / ui.refresh).
// Firma: (tagDelNodo, valorDelAtributoName, nombreAtributo, valor)
self.setNodePropertyValue("frame", "frmCabecera", "bgcolor", "#7C3AED");  // <frame name="frmCabecera">
var v = self.getNodePropertyValue("frame", "frmCabecera", "bgcolor");

// === bind(controlName, eventName, callback) / unbind(controlName, eventName) ===
// Vincula un callback a un evento de un control concreto del objeto.
self.bind("MAP_BOTON", "onclick", function(e) {
    ui.showToast("Pulsado");
});
self.unbind("MAP_BOTON", "onclick");

// === Metadatos de campos ===
var titulo = self.getPropertyTitle("MAP_NOMBRE");   // título visible del campo
var grupo  = self.getPropertyGroup("MAP_NOMBRE");   // grupo al que pertenece
var conValor = self.getPropertyNames();             // nombres de los campos que tienen valor cargado
                                                    // (no incluye los declarados sin valor)

// === clearCaches() - Vacía la caché de atributos resueltos ===
// Util si has cambiado atributos en el XML/CSS y quieres forzar re-evaluación
// la próxima vez que se lean.
self.clearCaches();
```

### 2.10 selfDataColl - Referencia Directa a la Coleccion

`selfDataColl` proporciona acceso directo a la coleccion contenedora del objeto `self`, sin necesidad de llamar a `getOwnerCollection()`:

```javascript
selfDataColl.loadAll();
var count = selfDataColl.count();
console.log("Total registros: " + count);
```

### 2.11 DataCollection - Métodos Adicionales

#### startBrowse() / endBrowse() - Navegación Browse

Inicia y finaliza una sesión de navegación por la coleccion. **Siempre** usar `endBrowse()` en un bloque `finally`:

```javascript
var coll = appData.getCollection("Datos");
coll.startBrowse();
try {
    coll.moveFirst();
    while (coll.getCurrentItem() != null) {
        var obj = coll.getCurrentItem();
        // procesar obj...
        coll.moveNext();
    }
} finally {
    coll.endBrowse();  // SIEMPRE en finally
}
```

#### deleteItem(index) - Eliminar Item por Índice

```javascript
var coll = appData.getCollection("Productos");
coll.deleteItem(2);  // Elimina el tercer elemento
```

#### findAllObjects(filter) - Buscar Todos los Objetos

Busca todos los objetos que cumplen un filtro. Retorna un array de DataObject:

```javascript
var encontrados = coll.findAllObjects("TIPO = 'A' AND ACTIVO = 1");
for (var i = 0; i < encontrados.length; i++) {
    console.log(encontrados[i].MAP_NOMBRE);
}
```

#### setMacro(name, value) / getMacro(name) - Macros de Coleccion

Las macros de coleccion permiten parametrizar filtros y consultas SQL definidos en el XML de la `<coll>`. Son distintas de las macros globales (`appData.setGlobalMacro`/`getGlobalMacro`): estas viven dentro de **una sola coleccion** y solo afectan a su SQL; las globales son variables de aplicación accesibles desde cualquier punto del código (equivalentes a `localStorage` del navegador).

> **API correcta:** `setMacro("##NOMBRE##", valor)` y `getMacro("##NOMBRE##")`. **NUNCA** `coll.macro(...)` — esa forma no existe en XOne y produce error.

> **Requisito XML:** Para que `setMacro` tenga efecto, la macro debe estar declarada en el XML de la coll con un nodo `<macro name="##NOMBRE##" value="..." default="true" />` **al mismo nivel que los `<group>`** (hijo directo de `<coll>`, no anidado). Si la macro no existe en el XML, `setMacro` no inyecta nada en el SQL. Ver el tópico 02, sección 7.5 para el detalle completo.

```javascript
// === Sobre un content de la pantalla actual ===
var contentGastos = self.getContents("Gastos");
contentGastos.setMacro("##TIPO##", "tg.NOMBRE LIKE '%" + self.MAP_FTTIPOGASTO + "%'");

// === Sobre una coleccion global ===
var coll = appData.getCollection("Ordenes");
coll.setMacro("##MACRO1##", "IDORDEN=" + numOrden);

// === Lectura ===
var filtroActual = contentGastos.getMacro("##TIPO##");
```

El **valor** que pasas a `setMacro` se inyecta tal cual en el SQL — puede ser un literal (`"1"`), un fragmento de WHERE (`"FILTRO='A'"`), o incluso una query SELECT entera si el atributo donde aparece la macro lo permite. Para "desactivar" un filtro sin reescribir la coll, el patron habitual es `coll.setMacro("##TIPO##", "1=1")`.

**Tip:** Después de un `setMacro`, suele hacer falta `ui.refresh()` (o `ui.refresh("nombreContent")`) para que el content recargue su SQL con el nuevo valor de la macro.

#### createSearchIndex(fields) / doSearch(query) - Busqueda Indexada

Permite busqueda rápida en memoria sobre campos indexados:

```javascript
// Crear indice sobre los campos deseados
coll.createSearchIndex(["NOMBRE", "DESCRIPCION"]);

// Buscar en el indice (tipicamente desde un evento onTextChanged)
function onBusquedaTexto(evento) {
    coll.doSearch(evento.newText);
}
```

#### lock() / unlock() - Bloqueo de Coleccion

Activa/desactiva el **modo solo lectura** de la coleccion:

- `lock()` activa la bandera de solo lectura. Con la bandera activa, `clear()`, `loadAll()` y similares son **no-ops silenciosos**: devuelven `true` sin hacer nada.
- `unlock()` desbloquea para poder modificar (vaciar, cargar, añadir items, etc.).
- `lock()`/`unlock()` son métodos de la **coleccion**; NO existen en `self` (DataObject).

Las colecciones **nacen desbloqueadas**, pero el convenio del proyecto es operar en bloque `unlock(); try {...} finally { lock(); }` para dejar la coll bloqueada después y evitar mutaciones accidentales desde código posterior:

```javascript
var coll = appData.getCollection("Clientes");
coll.unlock();
try {
    var obj = new Clientes({ MAP_NOMBRE: "Nuevo" });
    coll.addItem(obj);
} finally {
    coll.lock();  // SIEMPRE en finally
}
```

#### setVariable(name, value) / getVariable(name) - Variables de Coleccion

Almacena y recupera variables temporales asociadas a la coleccion (en memoria):

```javascript
coll.setVariable("totalProcesados", 0);
var total = coll.getVariable("totalProcesados");
```

#### Binding de Eventos en Coleccion

```javascript
var coll = appData.getCollection("MiColeccion");

coll.bind("onbeforeedit", function(e) {
    // Se ejecuta antes de entrar en edicion
});

coll.bind("ongroupselected", function(e) {
    // Se ejecuta al cambiar de pestana/grupo
});
```

