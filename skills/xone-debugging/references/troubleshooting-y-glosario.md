# XOne — Troubleshooting y glosario

> Fuente: `xone/v2/xone-help-docs/topics/05-events-patterns-faq.md` §19–§20. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §19 troubleshooting completo por síntoma (incluye 19.14b: load no inicializa pantalla, usar before-edit) · §20 glosario de términos XOne

---

## 19. Troubleshooting

### 19.1 La pantalla no muestra datos

**Diagnostico:** Los datos existen en BD pero la pantalla aparece vacia.

**Posibles causas y soluciones:**

1. **Falta `loadAll()`** - Los contents no cargan automáticamente:
```javascript
self.getContents("miContent").loadAll();
```

2. **Falta `visible="7"` o `visible="4"`** - Los campos no son visibles en el modo actual.

3. **El content esta bloqueado** - Desbloquear antes de cargar:
```javascript
self.getContents("miContent").unlock();
self.getContents("miContent").loadAll();
self.getContents("miContent").lock();
```

4. **Falta `ui.refresh()`** - Después de modificar datos, refrescar la vista.

### 19.2 El botón no hace nada

**Diagnostico:** El botón no responde al toque.

**Posibles causas y soluciones:**

1. **Falta `visible="1"` o `visible="7"`** - El botón necesita ser visible en modo edición.

2. **Error en el atributo `method` o `onclick`** - Verificar sintaxis:
```xml
<!-- Correcto -->
<prop name="btn" type="B" method="ExecuteNode(miNodo)"/>
<!-- Incorrecto (falta ExecuteNode) -->
<prop name="btn" type="B" method="miNodo"/>
```

3. **Botón bloqueado por `disableedit`** - Verificar la condición:
```xml
<prop name="btn" type="B" disableedit="MAP_ESTADO=0"/>
```

4. **Solapamiento con otro elemento** - Un frame flotante puede estar encima.

### 19.3 Los estilos no se aplican

**Diagnostico:** La clase CSS no tiene efecto.

**Posibles causas y soluciones:**

1. **Usar unidades incorrectas** - No usar `px`, `em`, `rem`:
```css
/* Incorrecto */
.miClase { width:200px; }
/* Correcto */
.miClase { width:200p; }
```

2. **Nombre de clase incorrecto** - Verificar que coincida exactamente.

3. **Atributo inline sobreescribe la clase** - Los atributos en el XML tienen prioridad sobre el CSS.

4. **Archivo CSS no cargado** - El archivo debe llamarse `default.css` y estar en la raiz del proyecto.

### 19.4 La coleccion no carga datos

**Diagnostico:** `getCount()` retorna 0 después de `loadAll()`.

**Posibles causas y soluciones:**

1. **SQL incorrecto** - Verificar la consulta SQL en el atributo `sql` del `<coll>`.

2. **Tabla no existe** - Regenerar la base de datos:
```bash
xone-db-tools create-db mi_proyecto --overwrite
```

3. **Filtro demasiado restrictivo** - Verificar el `filter` del `<contents>`.

4. **Falta prefijo `##PREF##`** en la SQL:
```xml
<!-- Correcto -->
sql="SELECT * FROM ##PREF##MiTabla t1"
<!-- Incorrecto -->
sql="SELECT * FROM MiTabla t1"
```

### 19.5 Error de tabla no encontrada

**Diagnostico:** Error "no such table" al cargar datos.

**Solución:** Regenerar la base de datos. La tabla puede no haberse generado si:
- La coleccion no tiene `objname` o `updateobj`
- El archivo `.xne` no fue procesado por el generador
- El nombre de la tabla no coincide (recordar el prefijo `gen_`)

### 19.6 El GPS no funciona

**Diagnostico:** Las coordenadas siempre son 0 o null.

**Posibles causas y soluciones:**

1. **Falta `ui.startGps()`** - Iniciar el GPS antes de pedir coordenadas.

2. **Permisos no concedidos** - Verificar con:
```javascript
var status = ui.checkGpsStatus();
if (status == 0 || status == 3) {
    ui.askUserForGpsPermission({
        onEnabled: function() { ui.startGps(); },
        onDenied: function() { ui.showToast("Active el GPS"); }
    });
}
```

3. **Emulador sin GPS** - Probar en dispositivo físico.

### 19.7 La replica falla

**Diagnostico:** La sincronización con el servidor no se completa.

**Posibles causas:**
- Sin conexión a internet
- URL del servidor incorrecta
- Timeout en la conexión
- Datos corruptos en la cola de replica

**Solución:** Verificar la configuración de replica en `Empresas` y los logs del dispositivo.

### 19.8 La imagen no se muestra

**Diagnostico:** El espacio de la imagen aparece vacio.

**Posibles causas y soluciones:**

1. **Archivo no existe** - Verificar que el archivo esta en `icons/` o `files/`.

2. **Formato incorrecto** - XOne solo soporta PNG en produccion.

3. **Ruta incorrecta** - Usar `##APP##\icons\` para rutas absolutas:
```xml
<prop name="img" type="IMG" path="##APP##\icons\mi_icono.png"/>
```

4. **El campo esta vacio** - Verificar que el valor del campo contiene el nombre del archivo.

### 19.9 El contents esta vacio

**Diagnostico:** El área del content se muestra sin items.

**Posibles causas y soluciones:**

1. **Falta cargar los datos:**
```javascript
self.getContents("miContent").loadAll();
```

2. **Filtro incorrecto** en el `<contents>`:
```xml
<contents name="miContent" src="MiColeccion"
          filter="ID_PADRE=##FLD_MAP_ID##"/>
```
Verificar que `MAP_ID` tiene un valor valido.

3. **La coleccion fuente (`src`) no existe** - Verificar el nombre.

4. **El `<prop type="Z">` no referencia al content correcto:**
```xml
<prop name="@miContent" type="Z" contents="miContent"/>
<contents name="miContent" src="MiColeccion"/>
```

### 19.10 El onchange no se dispara

**Diagnostico:** Cambiar un campo no ejecuta el evento onchange.

**Posibles causas y soluciones:**

1. **Para campos tipo T (texto)**, el `onchange` del nodo se dispara al perder el foco, no en cada tecla. Para tiempo real usar `ontextchanged`:
```xml
<prop name="campo" type="T"
      ontextchanged="javascript:miFuncion(e);"/>
```

2. **El nombre del campo no coincide** en el `<field>`:
```xml
<onchange>
    <field name="MAP_CAMPO"> <!-- Debe coincidir exactamente -->
        <action name="runscript">
            <script language="javascript">
                // Código
            </script>
        </action>
    </field>
</onchange>
```

3. **Usando `onchange` como atributo** con valor incorrecto:
```xml
<!-- Correcto -->
<prop name="campo" type="N" onchange="Refresh"/>
<prop name="campo" type="N" onchange="refresh(campo1,campo2)"/>
<prop name="campo" type="N" onchange="ExecuteNode(miNodo)"/>

<!-- Incorrecto -->
<prop name="campo" type="N" onchange="true"/>
```

### 19.11 El refresh no funciona

**Diagnostico:** Se cambian datos desde JavaScript pero la pantalla no se actualiza.

**Posibles causas y soluciones:**

1. **Nombre del campo incorrecto** - Verificar que el nombre pasado a `ui.refresh()` coincida exactamente con el `name` del `<prop>`:
```javascript
// Si el campo se llama MAP_NOMBRE (no nombre, no NOMBRE)
ui.refresh("MAP_NOMBRE");
```

2. **Falta obtener la vista** - En callbacks asincranos, usar `ui.getView(self)`:
```javascript
var v = ui.getView(self);
if (v) {
    v.refresh("MAP_CAMPO");
}
```

3. **Contexto `self` perdido** - En callbacks de `$http` o eventos diferidos, `self` puede ser null. Guardar referencia antes:
```javascript
var miObjeto = self; // Guardar antes del callback
$http.get(url, request,
    function(sData) {
        miObjeto.MAP_RESULTADO = sData;
        ui.refresh("MAP_RESULTADO");
    }
);
```

### 19.12 self es null en callback

**Diagnostico:** Al acceder a `self` dentro de un callback, da error porque `self` es null o undefined.

**Solución:** Guardar la referencia a `self` en una variable local antes del callback:

```javascript
var contexto = self; // Guardar referencia
$http.get(url, request,
    function(sData) {
        // contexto funciona, self podria no funcionar aqui
        contexto.MAP_DATO = JSON.parse(sData).valor;
        ui.refresh("MAP_DATO");
    }
);
```

### 19.13 Coleccion vacia después de loadAll

**Diagnostico:** `coll.count()` retorna 0 después de llamar a `loadAll()`.

**Posibles causas y soluciones:**

1. **Filtro activo demasiado restrictivo** - Verificar y limpiar el filtro:
```javascript
coll.setFilter(""); // Limpiar filtro
coll.loadAll();
```

2. **Falta usar startBrowse/endBrowse** para colecciones accedidas externamente:
```javascript
var coll = appData.getCollection("MiColeccion");
try {
    coll.startBrowse();
    coll.loadAll();
    var count = coll.count();
    // ... usar datos ...
} finally {
    coll.endBrowse();
}
```

3. **La tabla no existe** en la base de datos. Regenerar con `xone-db-tools create-db`, o inspeccionarla con `xone-db-tools describe-table <db> <tabla> --json` —que devuelve las columnas con su tipo— y consultar el contenido con `xone-db-tools execute-sql <db> "SELECT …" --json`. **Sobre una copia**: `execute-sql` ejecuta lo que le pases y muta el fichero. Detalle de ambos en `xone-review`.

### 19.14 lock/unlock no funciona

**Diagnostico:** Se obtiene error al intentar modificar una coleccion bloqueada.

**Solución:** Verificar que se usa el patron try/finally correctamente:

```javascript
// INCORRECTO - si hay error, nunca se ejecuta lock()
coll.unlock();
var obj = coll.createObject();
coll.addItem(obj);
obj.save();
coll.lock();

// CORRECTO - lock() siempre se ejecuta en finally
try {
    coll.unlock();
    var obj = coll.createObject();
    coll.addItem(obj);
    obj.save();
} finally {
    coll.lock();
}
```

### 19.15 Evento no se dispara

**Diagnostico:** Un evento definido en XML no se ejecuta.

**Posibles causas y soluciones:**

1. **Nombre del evento incorrecto** - Los nombres de evento son case-sensitive. Verificar que coincida exactamente con el nodo XML.

2. **Atributo `refresh` impide ver el efecto** - Si el evento modifica datos pero `refresh="false"`, la UI no se actualiza:
```xml
<!-- Probar con refresh="true" para diagnosticar -->
<miEvento refresh="true" show-wait-dialog="false">
```

3. **El `method` no usa ExecuteNode** correctamente:
```xml
<!-- Incorrecto -->
<prop name="btn" type="B" method="miNodo"/>
<!-- Correcto -->
<prop name="btn" type="B" method="ExecuteNode(miNodo)"/>
```

4. **Error JavaScript silencioso** - Agregar `show-wait-dialog="true"` temporalmente para ver errores.

### 19.16 Campos MAP_ no se guardan

**Diagnostico:** Los campos con prefijo `MAP_` pierden su valor al cerrar y volver a abrir la pantalla.

**Explicacion:** Los campos `MAP_` son **transitorios** (campos calculados/virtuales). No se persisten en la base de datos. Solo existen en memoria mientras el objeto esta cargado.

**Solución:** Si necesitas persistir el dato, usa un campo sin prefijo `MAP_` que tenga su correspondiente columna en la tabla de la base de datos.

### 19.17 Error -8100

**Diagnostico:** Al intentar guardar un objeto, se obtiene el error `-8100`.

**Causa:** Campos obligatorios no completados. El framework valida que todos los campos marcados como obligatorios (`mandatory="true"` o equivalente) tengan valor.

**Solución:** Verificar que todos los campos obligatorios tienen un valor antes de llamar a `save()`.

### 19.18 Cerrar pantalla / cerrar app desde JavaScript

**Forma correcta:**

```javascript
// Cerrar pantalla actual (vuelve a la anterior)
ui.getView(self).exit();

// Cerrar toda la aplicación
appData.exit();
```

**Nota sobre código heredado:** En proyectos antiguos puede aparecer el patrón `appData.failWithMessage(-11888, "##EXIT##")` para cerrar la pantalla. Sigue funcionando (el código `-11888` con `##EXIT##` es interpretado por el framework como una orden de cierre, no como un error real), pero la forma preferida es `ui.getView(self).exit()`.

---

## 20. Glosario de Terminos XOne

| Termino | Descripción |
|---------|-------------|
| **action** | Bloque de ejecución dentro de un evento. Puede ser `runscript` (JavaScript) o `setval` (asignacion). |
| **appData** | Objeto global JavaScript para acceder a datos de la aplicación, colecciones y configuración. |
| **before-edit** | Evento de ciclo de vida que se ejecuta antes de entrar en modo edición. El más usado para inicialización. |
| **bind** | Método de `ui.getView()` para asignar eventos a controles por script en lugar de por atributo XML. |
| **coll** | Nodo raiz XML que define una coleccion. Puede representar una tabla de BD, una pantalla o un formulario. |
| **contents** | Nodo XML que define una relación padre-hijo entre colecciones, para embeber listas dentro de formularios. |
| **create** | Evento de ciclo de vida que se ejecuta al crear un nuevo objeto. |
| **CSS (XOne)** | Sistema de estilos propietario similar a CSS web pero con atributos y unidades propios (`p`, `%`). |
| **DataObject** | Objeto que representa un registro de datos en XOne. Se accede via `self` en scripts. |
| **disablevisible** | Atributo XML que condiciona la visibilidad de un elemento según el valor de un campo. |
| **Empresas** | Coleccion obligatoria en `mappings.xne`. Representa la configuración global de la aplicación. |
| **ExecuteNode** | Función para invocar un evento personalizado desde `method` o `onclick`. |
| **frame** | Contenedor visual XML para agrupar propiedades y otros frames en el layout. |
| **functions.js** | Archivo JavaScript global cuyas funciones están disponibles en todos los scripts del proyecto. |
| **gestion.db** | Archivo de base de datos SQLite local generado en la carpeta `bd/`. |
| **group** | Nodo XML que agrupa elementos. Se usa para pestanas, secciones y el header/footer fijo. |
| **group-swipe** | Atributo de `<coll>` que habilita la navegación entre grupos deslizando horizontalmente. |
| **loadAll()** | Método de coleccion que carga todos los registros desde la base de datos. |
| **lock/unlock** | Patron obligatorio para modificar contenidos de una coleccion o content. |
| **maintenance** | Nodo en `Empresas` para definir tareas programadas periódicas (replica, sincronización). |
| **MAP_** | Prefijo convencional para campos calculados/temporales que no se persisten en BD. |
| **mapcol** | Atributo para vincular un campo con una coleccion de datos (combo/selector). |
| **mappings.xne** | Archivo XML que contiene las colecciones `Empresas` y `Usuarios`. |
| **method** | Atributo de `<prop>` para vincular un botón con un evento custom via `ExecuteNode()`. |
| **notab** | Atributo de `<coll>` que oculta las pestanas de navegación. |
| **onback** | Evento que se dispara al presionar el botón de retroceso del dispositivo. |
| **onchange** | Evento que se dispara cuando cambia el valor de una propiedad. Como nodo permite `<field>`. |
| **onclick** | Atributo de evento que ejecuta JavaScript al hacer click/tap en un elemento. |
| **ontextchanged** | Atributo de evento que se dispara en tiempo real al escribir en un campo de texto. |
| **postonchange** | Atributo que ejecuta una acción después de un cambio de valor, en un segundo paso. |
| **prop** | Nodo XML que define una propiedad (campo de datos o control de UI). |
| **recyclerview** | ViewMode recomendado para listas con reciclaje de vistas, mejorando rendimiento. |
| **refresh** | Función/atributo para actualizar la interfaz de usuario después de cambiar datos. |
| **replica** | Sistema de sincronización bidireccional entre el dispositivo y el servidor. |
| **ROWID** | Campo interno de la plataforma (existe a nivel BD en toda coll persistida como GUID hex de 32 caracteres). NO se declara como `<prop>` ni se incluye en el SELECT del `sql=`. XOne lo gestiona automáticamente. |
| **runscript** | Tipo de acción dentro de un evento que ejecuta código JavaScript. |
| **self** | Objeto global JavaScript que referencia al DataObject actual en el contexto del script. |
| **setval** | Tipo de acción dentro de un evento que asigna un valor a un campo sin JavaScript. |
| **special** | Atributo de `<coll>`: el framework NO gestiona automáticamente los datos de esa coleccion — no ejecuta su `sql=` contra la BD ni contra su conexión. De ahí sus dos usos: una pantalla de puro UI (menú, buscador, coll base para `inherits`) y una coleccion que se llena desde script (por ejemplo con `addItem` tras llamar a una API) para pintarla en un `<contents>` o buscar sobre ella. **No confundir con `<entry-point>`**, que es el nodo de `app.xml` que dice qué coleccion se abre al entrar; esa coll suele ser `special`, pero son cosas distintas. Síntoma típico: `special` junto a `sql` da pantalla vacía, porque el `sql` no se ejecuta. |
| **sql** | Atributo de `<coll>` con la consulta SQL para cargar datos de la tabla. |
| **type** | Atributo de `<prop>` que define el tipo de dato/control (T, N, B, D, IMG, PH, Z, etc.). |
| **ui** | Objeto global JavaScript para interfaz de usuario: dialogos, navegación, GPS, camara. |
| **Usuarios** | Coleccion obligatoria en `mappings.xne` para la gestion de usuarios de la aplicación. |
| **viewmode** | Atributo de `<prop type="Z">` que define como se visualiza un content (recyclerview, mapview, etc.). |
| **visible** | Atributo bitmask (0-7) que controla en que modos se muestra una propiedad. |
| **xne** | Extensión de los archivos XML de XOne que definen colecciones y pantallas. |
| **##FLD_CAMPO##** | Macro que referencia el valor de un campo en filtros SQL de contents. |
| **##NOW_TIME##** | Macro del sistema que retorna la fecha y hora actual. |
| **##PREF##** | Macro que se reemplaza por el prefijo de tabla configurado (típicamente `gen_`). |
| **##USERID##** | Macro del sistema que retorna el ID del usuario logueado. |
