# XOne — Patrones de navegación, datos y código

> Fuente: `xone/v2/xone-help-docs/topics/05-events-patterns-faq.md` §9–§10A. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §9 patrones de navegación · §10 patrones de datos · §10A patrones críticos de código

---

## 9. Patrones de Navegación

### 9.1 Pantalla de Login

Plantilla mínima de coll de login (el framework la muestra automáticamente al arrancar la app cuando no hay sesión activa; tras un `appData.logout()` también vuelve a esta pantalla).

```xml
<coll name="Login" title="Iniciar Sesion"
      notab="true" show-toolbar="false">

    <create>
        <script>
            self.MAP_EMAIL = "";
            self.MAP_PASSWORD = "";
        </script>
    </create>

    <group name="grpPrincipal" id="1" class="groupNoTab">
        <frame name="frmFormulario" width="100%" bgcolor="#FFFFFF">
            <prop name="MAP_EMAIL" type="T" visible="7"
                  width="90%" height="56p" align="center"
                  hint="tu@email.com"/>
            <prop name="MAP_PASSWORD" type="X" visible="7"
                  width="90%" height="56p" align="center"
                  hint="Tu contraseña"/>
            <prop name="btnLogin" type="B" visible="7"
                  width="90%" height="56p" align="center" tmargin="30p"
                  title="Iniciar Sesion"
                  onclick="realizarLogin();" />
        </frame>
    </group>

    <onback>
        <script>
            cerrarPantalla();
        </script>
    </onback>
</coll>
```

### 9.2 Lista -> Detalle (maestro-detalle)

Patron para navegar de una lista a los detalles de un registro seleccionado.

**Coleccion lista con selecteditem:**

```xml
<coll name="ListaProductos" sql="SELECT * FROM ##PREF##Productos"
      loadall="true">
    <group name="General" id="1">
        <prop name="MAP_NOMBRE" type="T" visible="4"/>
        <prop name="MAP_PRECIO" type="N2" visible="4"/>
    </group>

    <selecteditem refresh="false" show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">
                ui.openEditView(self);
            </script>
        </action>
    </selecteditem>
</coll>
```

**Content embebido en la pantalla padre:**

```xml
<prop name="@listaProductos" type="Z" contents="listaProductos"
      width="100%" height="70%" viewmode="recyclerview"/>
<contents name="listaProductos" src="ListaProductos"/>
```

### 9.3 Menu con tarjetas

Patron de menu principal con tarjetas de acceso rápido.

```xml
<coll name="MenuPrincipal" special="true" notab="true">
    <group name="grpPrincipal" id="1" class="groupNoTab">
        <frame name="frmHeader" width="100%" height="120p" bgcolor="#1565C0">
            <prop name="lblTitulo" type="L" visible="7"
                  width="100%" height="40p" align="center"
                  forecolor="#FFFFFF" fontsize="20" title="Menu Principal"/>
        </frame>

        <frame name="frmTarjetas" width="100%" scroll="true" tmargin="10p">
            <!-- Tarjeta 1 -->
            <frame name="frmTarjeta1" width="47%" height="150p"
                   lmargin="2%" tmargin="10p" bgcolor="#FFFFFF"
                   border-corner-radius="12" framebox="true"
                   onclick="javascript:abrirModulo('Inventario');">
                <prop name="imgTarjeta1" type="IMG" visible="7"
                      width="48p" height="48p" align="center" tmargin="20p"
                      src="./icons/ic_inventory.png"/>
                <prop name="lblTarjeta1" type="L" visible="7"
                      width="100%" height="30p" align="center" tmargin="10p"
                      fontsize="14" title="Inventario"/>
            </frame>

            <!-- Tarjeta 2 -->
            <frame name="frmTarjeta2" width="47%" height="150p"
                   lmargin="2%" tmargin="10p" newline="false"
                   bgcolor="#FFFFFF" border-corner-radius="12" framebox="true"
                   onclick="javascript:abrirModulo('Pedidos');">
                <prop name="imgTarjeta2" type="IMG" visible="7"
                      width="48p" height="48p" align="center" tmargin="20p"
                      src="./icons/ic_orders.png"/>
                <prop name="lblTarjeta2" type="L" visible="7"
                      width="100%" height="30p" align="center" tmargin="10p"
                      fontsize="14" title="Pedidos"/>
            </frame>
        </frame>
    </group>
</coll>
```

### 9.4 Navegación con pestanas (group-swipe)

```xml
<coll name="PantallaConTabs" special="true" group-swipe="true">
    <group name="HEADER" id="10" class="groupfixed_header">
        <frame name="frmtitulo" class="frmsuperior">
            <prop name="MENU" type="L" title="MI PANTALLA"/>
        </frame>
    </group>

    <group name="Tab1" id="1" onfocus="ExecuteNode(onfocusgrupo(1))">
        <!-- Contenido pestana 1 -->
    </group>

    <group name="Tab2" id="2" onfocus="ExecuteNode(onfocusgrupo(2))">
        <!-- Contenido pestana 2 -->
    </group>

    <group name="Tab3" id="3" onfocus="ExecuteNode(onfocusgrupo(3))">
        <!-- Contenido pestana 3 -->
    </group>

    <onfocusgrupo show-wait-dialog="false">
        <action name="runscript">
            <param name="index"/>
            <script language="javascript">
                self.MAP_GROUP = index;
            </script>
        </action>
    </onfocusgrupo>

    <before-edit>
        <action name="runscript">
            <script language="javascript">
                self.MAP_GROUP = 1;
                self.MAP_TOTAL_PAGES = 3;
            </script>
        </action>
    </before-edit>
</coll>
```

### 9.5 Drawer lateral

```xml
<coll name="PantallaConDrawer" notab="true"
      ondraweropened="onDrawerOpened(e);"
      ondrawerclosed="onDrawerClosed(e);">

    <group name="Drawer" id="999"
           width="60%" drawer-orientation="left" bgcolor="#FFFFFF">
        <frame name="header_drawer" width="100%" height="25%"
               bgcolor="#2B3E51" align="bottom">
            <prop name="lblUsuario" type="L" visible="7"
                  forecolor="#FFFFFF" title="Nombre Usuario"/>
        </frame>
        <prop name="btnOpcion1" type="B" visible="7"
              width="100%" height="60p" title="Inventario"
              onclick="javascript:abrirModulo('Inventario');"/>
        <prop name="btnOpcion2" type="B" visible="7"
              width="100%" height="60p" title="Pedidos"
              onclick="javascript:abrirModulo('Pedidos');"/>
    </group>

    <group name="Contenido" id="1">
        <!-- Contenido principal -->
    </group>
</coll>
```

### 9.6 Volver atrás con confirmacion

```xml
<onback show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            var ok = ui.msgBox("Desea salir sin guardar?", "Confirmar", 4);
            if (ok == 6) {
                ui.getView(self).exit();
            }
        </script>
    </action>
</onback>
```

---

## 10. Patrones de Datos

### 10.1 CRUD completo (crear, leer, actualizar, eliminar)

**Crear:**

```javascript
var coll = appData.getCollection("Productos");
var obj = new Productos({
    NOMBRE: "Producto nuevo",
    PRECIO: 29.99,
    ACTIVO: 1,
    FECHA_ALTA: new Date()
});
coll.addItem(obj);
obj.save();
ui.openEditView(obj); // Abrir en edición
```

**Leer (lista con selecteditem + openEditView):**

```xml
<selecteditem refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            ui.openEditView(self);
        </script>
    </action>
</selecteditem>
```

**Actualizar (formulario con save):**

```javascript
// Dentro de un evento custom "guardar"
self.NOMBRE = self.MAP_NOMBRE;
self.PRECIO = self.MAP_PRECIO;
self.FECHA_MOD = new Date();
self.save();
ui.showToast("Guardado correctamente");
ui.getView(self).exit();
```

**Eliminar (confirmar + deleteItem):**

```xml
<eliminar show-wait-dialog="false" refresh="true">
    <action name="runscript">
        <script language="javascript">
            var ok = ui.msgBox("Desea eliminar el registro seleccionado?",
                "Aviso", 4);
            if (ok === 6) {
                var CollCal = appData.getCollection("ContentdatosCalendario");
                CollCal.deleteItem(self.MAP_IDTAREASELECTED.toString());
                self.MAP_IDTAREASELECTED = 0;
                CollCal = null;
                ui.showToast("Elemento borrado correctamente.");
            } else {
                ui.showToast("Se ha cancelado la acción.");
            }
        </script>
    </action>
</eliminar>
```

### 10.2 Maestro-detalle con contents

**XML del maestro con content embebido:**

```xml
<frame name="c1" width="98%" height="78%"
       framebox="true" border-corner-radius="10" lmargin="1%">
    <prop name="MAP_content1" height="96%" type="Z"
          contents="content1" forceonchange="true" bgcolor="#FFFFFF"
          onchange="refresh(@content1)"/>
    <contents name="content1" src="ContentDatos"/>
</frame>
```

**Agregar item al content (ejemplo real de EspecialContents):**

```xml
<nuevo show-wait-dialog="false" refresh="false">
    <action name="runscript">
        <script language="javascript">
            var coll = self.getContents("content1");
            var obj = coll.createObject();
            obj.setValue("ID", MAP_COUNTER_EXT);
            obj.NOMBRE = "Hola " + MAP_COUNTER_EXT.toString();
            obj.DIRECCION = "dirección " + MAP_COUNTER_EXT.toString();
            obj.IMAGEN = "campanon.jpg";
            MAP_COUNTER_EXT = MAP_COUNTER_EXT + 1;
            let view = ui.getView(self);
            view.MAP_content1.addItem(obj);
        </script>
    </action>
</nuevo>
```

### 10.3 Filtrado dinámico de listas

**Ejemplo real** (del proyecto EspecialContents):

```xml
<buscar show-wait-dialog="false" refresh="false">
    <action name="runscript">
        <param name="param"/>
        <script language="javascript">
            if (param == "1") {
                if (self.MAP_FILTRO.length == 0) {
                    self.getContents("content4").setFilter("");
                } else {
                    self.getContents("content4").setFilter(
                        "NOMBRE like '%" + self.MAP_FILTRO.toString()
                        + "%' OR DIRECCION like '%"
                        + self.MAP_FILTRO.toString() + "%'"
                    );
                }
            }
            self.getContents("content4").unlock();
            self.getContents("content4").loadAll();
            self.getContents("content4").lock();
            ui.getView(self).refresh("@content4");
        </script>
    </action>
</buscar>
```

**Filtro en XML con macros de campo:**

```xml
<contents name="ContentDatosFiltroMultiseleccion"
          src="ContentDatosFiltroMultiseleccion"
          filter="((t1.MARCADO=1 AND 1=##FLD_MAP_BUSCAR_MARCADOS##)
                  OR (t1.MARCADO=0 AND 1=##FLD_MAP_BUSCAR_NOMARCADOS##))
                  AND (ifnull(t1.NOMBRE,'') LIKE ##FLD_MAP_BUSCAR_TEXT##
                  OR ifnull(t1.DIRECCION,'') LIKE ##FLD_MAP_BUSCAR_TEXT##)"/>
```

### 10.4 Busqueda en tiempo real con ontextchanged

```xml
<prop name="MAP_BUSCAR_TEXT"
      ontextchanged="javascript:FiltraMarcados(e);"
      labelwidth="0" text-border="true" type="T"
      width="98%" height="60p" tooltip="Texto a buscar"/>
```

```javascript
function FiltraMarcados(e) {
    self.MAP_BUSCAR_TEXT = e.newText;
    self.executeNode("applyfilter");
}
```

```xml
<applyfilter>
    <action name="runscript">
        <script language="javascript">
            self.getContents("ContentDatosFiltroMultiseleccion").clear();
            self.getContents("ContentDatosFiltroMultiseleccion").loadAll();
            ui.refresh("@ContentDatosFiltroMultiseleccion");
        </script>
    </action>
</applyfilter>
```

### 10.5 Ordenamiento ASC/DESC

```javascript
if (self.MAP_ORDEN == "ASC") {
    self.MAP_ORDEN = "DESC";
    self.MAP_BTORDEN = "sortZA.png";
    self.MAP_BTORDENCLICK = "sortZA_click.png";
} else {
    self.MAP_ORDEN = "ASC";
    self.MAP_BTORDEN = "sortAZ.png";
    self.MAP_BTORDENCLICK = "sortAZ_click.png";
}
self.getContents("content4").sort = "NOMBRE " + self.MAP_ORDEN.toString();
self.getContents("content4").unlock();
self.getContents("content4").loadAll();
self.getContents("content4").lock();
ui.getView(self).refresh("@content4,BTORDENAR");
```

### 10.6 Multiseleccion en lista

**XML con checkbox en cada fila:**

```xml
<prop name="MAP_BUSCAR_MARCADOS" title="Done" labelwidth="5"
      type="NC" width="49%" height="60p"/>
<prop name="MAP_BUSCAR_NOMARCADOS" title="Not done" labelwidth="8"
      type="NC" width="49%" height="60p" newline="false"/>

<prop name="MAP_DONE_PENDIENTES_BT" title="Marcar seleccionados"
      method="Executenode(checkAll(1))" type="B" width="48%"/>
<prop name="MAP_NOTDONE_PENDIENTES_BT" title="Desmarcar seleccionados"
      method="Executenode(checkAll(0))" type="B" width="48%" newline="false"/>
```

### 10.7 Paginación

XOne carga datos de forma paginada por defecto. Para controlar la paginación:

```xml
<!-- Desactivar paginacion (cargar todo) -->
<coll name="MiColeccion" page-limit-off="1" loadall="true">

<!-- O usar loadAll desde script -->
```

```javascript
var coll = self.getContents("miContent");
coll.clear();
coll.loadAll();
```

---

## 10A. Patrones Críticos de Código

### 10A.1 Patron lock/unlock para escritura en colecciones

**Regla fundamental:** Siempre usar `unlock()` antes de modificar y `lock()` en un bloque `finally` para garantizar que la coleccion se bloquea incluso si hay error.

```javascript
function agregarItem(nombreColeccion, datos) {
    var coll = appData.getCollection(nombreColeccion);
    try {
        coll.unlock();
        var newObj = coll.createObject();
        for (var key in datos) {
            if (datos.hasOwnProperty(key)) {
                newObj[key] = datos[key];
            }
        }
        coll.addItem(newObj);
        newObj.save();
        return true;
    } catch(error) {
        ui.showToast("Error: " + error.message);
        return false;
    } finally {
        coll.lock();
    }
}
```

**Para contents embebidos:**

```javascript
var content = self.getContents("content4");
try {
    content.unlock();
    content.loadAll();
    // ... modificar datos ...
} finally {
    content.lock();
}
ui.getView(self).refresh("@content4");
```

### 10A.2 Patron startBrowse/endBrowse para iteracion

**Regla:** `startBrowse()`/`endBrowse()` solo son necesarios cuando vas a **iterar** la coleccion (recorrer registros con `moveNext()`/`movePrevious()`). Abren un cursor en BD que hay que cerrar siempre en un `finally`.

**Cómo se itera correctamente:**

- `startBrowse()` ya deja el cursor en el **primer** item — no hace falta `moveFirst()` después.
- `getCurrentItem()` devuelve el `dataobject` de la fila actual.
- `moveNext()` devuelve `boolean`: `true` si pudo avanzar, `false` cuando ya no hay más filas. **No existe `coll.eof()`** en el JS API.
- **El objeto devuelto por `getCurrentItem()` es efímero**: el mismo objeto se reutiliza en el siguiente `moveNext()`, su contenido se reemplaza. No guardes la referencia en una variable para usarla más tarde; lee lo que necesites en la iteración o haz una copia (p.ej. con `JSON.stringify`/`JSON.parse` o copiando campo a campo en un objeto plano).
- `coll.MAP_XXX` **no** lee del item actual: las colecciones no exponen campos del objeto; siempre acceder vía `coll.getCurrentItem().MAP_XXX`.

```javascript
function listarUsuariosActivos() {
    var coll = appData.getCollection("Usuarios");
    var lista = [];
    coll.startBrowse();
    try {
        var obj = coll.getCurrentItem();
        while (obj != null) {
            // Copia el campo (no guardes obj — se reutiliza en el siguiente moveNext)
            lista.push(obj.MAP_LOGIN);
            if (!coll.moveNext()) break;
            obj = coll.getCurrentItem();
        }
    } finally {
        coll.endBrowse();
    }
    return lista;
}
```

**No requieren `startBrowse`:**

- `findObject(criteria)` y `findAllObjects(criteria)` — ejecutan su propia SQL independiente del cursor.
- `get(index)` / `getItem(index)` / `getItem(field, value)` — acceso directo sin cursor.
- `loadAll()` seguido de `getCount()` + `get(i)` — `loadAll` carga la lista en memoria y se accede por índice.

```javascript
// CORRECTO: findObject NO necesita startBrowse/endBrowse
function obtenerUsuario(userId) {
    var coll = appData.getCollection("Usuarios");
    var escapado = cstr(userId).replace(/'/g, "''");
    return coll.findObject("LOGIN='" + escapado + "'");
}
```

### 10A.3 Patron filtro con restauracion

Siempre guardar y restaurar el filtro original en un bloque `finally`:

```javascript
function procesarDatosFiltrados(coll, filtro) {
    var filtroOriginal = coll.getFilter();
    try {
        coll.setFilter(filtro);
        coll.loadAll();
        var count = coll.count();
        // ... procesar datos filtrados ...
        return count;
    } finally {
        coll.setFilter(filtroOriginal);
    }
}
```

### 10A.4 Patron GPS: iniciar, leer, detener

```javascript
function obtenerPosicionGPS() {
    ui.startGps();

    var lat = ui.getGpsLatitude();
    var lng = ui.getGpsLongitude();

    if (lat != 0 && lng != 0) {
        self.MAP_LATITUD = lat;
        self.MAP_LONGITUD = lng;
        ui.refresh("MAP_LATITUD,MAP_LONGITUD");
    }
}
```

**GPS con callback para tracking continuo:**

```javascript
function iniciarTracking() {
    var jsParams = {
        nodeName: "callbackgps",
        timeBetweenUpdates: 10000,
        minimumMetersDistanceRange: 10,
        foreground: true,
        title: "Mi App GPS",
        text: "Rastreando ubicación..."
    };
    ui.startGps(jsParams);
}

function detenerTracking() {
    ui.stopGps();
}
```

**GPS con variables de empresa para compartir coordenadas:**

```javascript
function GetPosGPS(tipo, auxcollobj) {
    var latitud = 0, longitud = 0;
    ui.startGps();

    var collGPS = appData.getCollection("ContentConectarGPS");
    collGPS.startBrowse();
    var x = collGPS.getCurrentItem();
    if (typeof x !== "undefined" && x !== null) {
        if (x.STATUS == 1 && x.HGPS.length > 0) {
            if (x.LATITUD !== "") latitud = parseFloat(x.LATITUD);
            if (x.LONGITUD.length > 0) longitud = parseFloat(x.LONGITUD);
        }
    }

    // Guardar en variable global
    appData.getCurrentEnterprise().setVariable("LATITUD", latitud);
    appData.getCurrentEnterprise().setVariable("LONGITUD", longitud);
}
```

### 10A.5 Patron de chat/mensajeria (resumen)

El chat en XOne se implementa con 4 colecciones: pantalla principal, lista de conversaciones, usuarios y mensajes. Patron clave:

```javascript
function enviarMensaje(obj, tipo) {
    if (obj.MAP_MENSAJE.length > 0 || tipo > 0) {
        var contentChatear = obj.getContents("ContentChatear");
        try {
            contentChatear.lock();
            var msgObj = contentChatear.createObject();
            contentChatear.addItem(msgObj);
            msgObj.IDCHAT = obj.MAP_IDCHAT;
            msgObj.USUARIO = appData.getGlobalMacro("##MACRO##");
            msgObj.TIPO = tipo;
            msgObj.FECHA = new Date();
            if (tipo === 0) {
                msgObj.MENSAJE = obj.MAP_MENSAJE;
                obj.MAP_MENSAJE = "";
            }
            msgObj.save();
        } finally {
            contentChatear.unlock();
        }
        ui.refresh("ContentChatear", "MAP_MENSAJE");
    }
}
```

**Atributo clave para chat:** `start-from-bottom="true"` en el prop del content para que los mensajes se muestren desde abajo (estilo WhatsApp).

### 10A.6 Patron de dialogo modal (coleccion como modal)

Abrir una coleccion como dialogo modal usando `ui.openEditView()`:

```javascript
function abrirDialogoModal() {
    var coll = appData.getCollection("MiDialogo");
    var obj = new MiDialogo({ MAP_TITULO: "Titulo del dialogo", MAP_MENSAJE: "Contenido" });
    coll.addItem(obj);
    ui.openEditView(obj);
}
```

**Alternativa con frame flotante y modal:**

```xml
<frame name="frmModal"
       animation-in-delay="250" animation-out-delay="250"
       animation-in="##RIGHT_IN##" animation-out="##LEFT_OUT##"
       disablevisible="MAP_VERMODAL=0"
       bgcolor="#ffffff" modal="true" floating="true"
       top="0" left="0" width="100%" height="100%">
    <!-- Contenido del modal -->
    <prop name="btnCerrar" type="B" title="Cerrar"
          onclick="self.MAP_VERMODAL=0; ui.refresh('frmModal');"/>
</frame>
```

### 10A.7 Patron custom msgbox (coleccion como msgbox)

Usar una coleccion como cuadro de dialogo personalizado en lugar del `ui.msgBox()` nativo:

```javascript
function userMsgBox(title, msg, type) {
    var collMsgBox = appData.getCollection("EspecialMsgbox").createClone();
    var objMsgBox = collMsgBox.createObject();
    collMsgBox.addItem(objMsgBox);
    objMsgBox.MAP_TITULO = title;
    objMsgBox.MAP_MENSAJE = msg;
    objMsgBox.MAP_TIPO = type;
    var nResult = ui.msgBox(objMsgBox);
    return nResult;
}
```

**La coleccion del msgbox usa atributos especiales:**
- `cancelable="false"` - No se puede cerrar pulsando fuera
- `cancelable-outside="false"` - No se puede cerrar tocando fuera
- `button-option="10"` en el botón OK, `button-option="1"` en SI, `button-option="2"` en NO
- `height="-2"` para altura automática basada en contenido

### 10A.8 Patron wizard (formulario multi-paso con groups)

Usar `group-swipe="true"` y grupos numerados para crear un asistente paso a paso:

```xml
<coll name="FormularioWizard" special="true" group-swipe="true">
    <group name="HEADER" id="10" class="groupfixed_header">
        <frame name="frmtitulo" class="frmsuperior">
            <prop name="MENU" type="L" title="Formulario"/>
            <prop name="MAP_LAST" type="B" img="atras.png"
                  method="ExecuteNode(ir(-1))"
                  disablevisible="MAP_GROUP=1"/>
            <prop name="MAP_NEXT" type="B" img="siguiente.png"
                  method="ExecuteNode(ir(1))"
                  disablevisible="MAP_GROUP=MAP_TOTAL_PAGES"
                  newline="false"/>
        </frame>
    </group>

    <group name="Paso1" id="1" onfocus="ExecuteNode(onfocusgrupo(1))">
        <!-- Datos personales -->
    </group>
    <group name="Paso2" id="2" onfocus="ExecuteNode(onfocusgrupo(2))">
        <!-- Dirección -->
    </group>
    <group name="Paso3" id="3" onfocus="ExecuteNode(onfocusgrupo(3))">
        <!-- Confirmación -->
    </group>

    <before-edit>
        <action name="runscript">
            <script language="javascript">
                self.MAP_GROUP = 1;
                self.MAP_TOTAL_PAGES = 3;
            </script>
        </action>
    </before-edit>

    <onfocusgrupo show-wait-dialog="false">
        <action name="runscript">
            <param name="index"/>
            <script language="javascript">
                self.MAP_GROUP = index;
            </script>
        </action>
    </onfocusgrupo>

    <ir show-wait-dialog="false">
        <action name="runscript">
            <param name="direccion"/>
            <script language="javascript">
                let nuevo = parseInt(self.MAP_GROUP) + parseInt(direccion);
                if (nuevo >= 1 && nuevo <= self.MAP_TOTAL_PAGES) {
                    ui.showGroup(nuevo);
                }
            </script>
        </action>
    </ir>
</coll>
```

**Elementos clave del patron wizard:**
- `group-swipe="true"` habilita deslizar entre pasos
- `MAP_GROUP` rastrea el paso actual
- `MAP_TOTAL_PAGES` almacena el número total de pasos
- `disablevisible="MAP_GROUP=1"` oculta el botón "Atrás" en el primer paso
- `disablevisible="MAP_GROUP=MAP_TOTAL_PAGES"` oculta "Siguiente" en el último paso

