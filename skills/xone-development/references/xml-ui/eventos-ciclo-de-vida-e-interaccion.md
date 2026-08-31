# XOne — Eventos: sistema, ciclo de vida e interacción

> Fuente: `xone/v2/xone-help-docs/topics/05-events-patterns-faq.md` §1–§3. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §1 cómo funciona el sistema de eventos · §2 eventos de ciclo de vida (create, before-edit, after-edit, load) · §3 eventos de interacción (onclick, onchange, selecteditem, onlongpressitem, onback)

---

## 1. Sistema de Eventos en XOne

### 1.1 Como funciona el sistema de eventos

XOne utiliza un sistema de eventos declarativo en XML. Los eventos se definen como nodos dentro de una coleccion (`<coll>`) y contienen acciones que se ejecutan cuando el evento se dispara.

El flujo básico es:

```
Evento disparado --> Nodo XML del evento --> Accion(es) --> Script JavaScript
```

Las acciones principales dentro de un evento son:

- **`runscript`** - Ejecuta código JavaScript
- **`setval`** - Establece un valor en un campo

Ejemplo básico de un evento con acción:

```xml
<create refresh="true" show-wait-dialog="false">
    <action name="setval" field="FECHA" value="##NOW_TIME##"/>
    <action name="runscript">
        <script language="javascript">
            inicializarFormulario();
        </script>
    </action>
</create>
```

> **Referencia cruzada:** Para la estructura XML de los nodos de eventos, consultar el tópico 02 sobre estructura XML.

### 1.2 Ambitos de eventos

Los eventos en XOne operan en cuatro ambitos distintos:

| Ambito | Descripción | Donde se declara | Ejemplos |
|--------|-------------|------------------|----------|
| **application** | Nivel de aplicación completa | Coleccion `Empresas` en `mappings.xne` | `onlogon`, `maintenance`, `onpushreceived`, `sys-message` |
| **collection** | Nivel de coleccion | Dentro del nodo `<coll>` | `selecteditem`, `onlongpressitem`, `login-ok`, `login-fail` |
| **object** | Nivel de objeto individual | Dentro del nodo `<coll>` | `create`, `load`, `before-edit`, `after-edit`, `onback`, `onrefresh` |
| **property** | Nivel de propiedad/campo | Como atributo en `<prop>` | `onclick`, `onchange`, `ontextchanged`, `onfocuschanged` |

### 1.3 Atributos comunes de eventos

Todos los nodos de evento soportan los siguientes atributos de configuración:

| Atributo | Tipo | Descripción | Valor por defecto |
|----------|------|-------------|-------------------|
| `refresh` | boolean | Refrescar la UI después de ejecutar el evento | `true` |
| `show-wait-dialog` | boolean | Mostrar un dialogo de espera mientras se ejecuta | `true` |
| `wait-dialog-text` | string | Texto personalizado del dialogo de espera | (vacio) |

Ejemplo con todos los atributos:

```xml
<GuardarDatos refresh="true" show-wait-dialog="true" wait-dialog-text="Guardando...">
    <action name="runscript">
        <script language="javascript">
            guardarFormulario();
        </script>
    </action>
</GuardarDatos>
```

**Buena práctica:** Establece `refresh="false"` y `show-wait-dialog="false"` en eventos que no modifican la UI para evitar parpadeos innecesarios.

---

## 2. Eventos de Ciclo de Vida

### 2.1 create - Al crear objeto nuevo

**Ambito:** object | **Tipo:** interno

Se dispara una única vez cuando se crea un nuevo objeto en la coleccion. Es ideal para inicializar valores por defecto.

```xml
<create refresh="true" show-wait-dialog="false">
    <action name="setval" field="FECHA" value="##NOW_TIME##"/>
    <action name="runscript">
        <script language="javascript">
            inicializarFormulario();
        </script>
    </action>
</create>
```

**Ejemplo real** (del proyecto EspecialCalendario):

```xml
<create>
    <action name="runscript">
        <script language="javascript">
            self.MAP_CTN_TITLE_FECHA = "FECHA";
            self.MAP_CTN_TITLE_TIPO = "TIPO";
            self.MAP_CTN_TITLE_DESCRIPCION = "DESCRIPCION";
        </script>
    </action>
</create>
```

**Ejemplo real** (del proyecto ContentCoordenadasGPS, con `setval` y `mapval`):

```xml
<create>
    <action name="setval" field="FECHA" value="##NOW_TIME##"/>
    <action name="mapval" field="USUARIO" coll="Usuarios"
            mapfld="ID" mapvalue="##USERID##" targetfld="LOGIN"/>
</create>
```

### 2.2 load - Al cargar cada DataObject

**Ambito:** object | **Tipo:** interno

Se dispara **por cada DataObject** al cargarse desde la base de datos (en `loadAll()`, `startBrowse()` o cuando se hidrata un item de `<contents>`). Se ejecuta después de `create` si el objeto es nuevo.

> **NUNCA usar `<load>` para inicializar una pantalla** — usar `<before-edit>`. En una pantalla `special="true"` sin coleccion de datos, `<load>` no se dispara nunca; en pantallas con coleccion, se dispara una vez por cada item cargado y penaliza rendimiento.

### 2.3 before-edit - Antes de entrar en edición

**Ambito:** object | **Tipo:** interno

Se dispara antes de que la vista entre en modo edición. Es el evento más utilizado para preparar la pantalla, inicializar variables MAP y configurar contents.

```xml
<before-edit refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            self.MAP_USER = self.getOwnerCollection().getVariable("##LOGIN_LASTUSER##");
        </script>
    </action>
</before-edit>
```

**Ejemplo real** (del proyecto EspecialContents):

```xml
<before-edit refresh="true">
    <action name="runscript">
        <script language="javascript">
            self.MAP_GROUP = 1;
            self.MAP_TOTAL_PAGES = 5;
            self.MAP_ORDEN = "ASC";
            self.MAP_BTORDEN = "sortAZ.png";
            self.MAP_BTORDENCLICK = "sortAZ_click.png";
            self.getContents("content4").sort = "NOMBRE ASC";
            self.getContents("content4").loadAll();
            self.getContents("content4").lock();

            self.getContents("content1").clear();
            self.getContents("content1").lock();

            ui.startGps();
            self.MAP_NOMBRESEL = "";
        </script>
    </action>
</before-edit>
```

**Ejemplo real** (del proyecto EspecialEventos, con `bind` para eventos por script):

```xml
<before-edit>
    <action name="runscript">
        <script language="javascript">
            var v = ui.getView(self);
            v.bind("MAP_ONTEXTCHANGED", "ontextchanged", eventoOnTextChanged);
            v.bind("MAP_ONFOCUSCHANGED01", "onfocuschanged", eventoOnFocusChanged);

            v.bind("SCJAVA", "onclick",
                {title:'valor desde fuera', msg:'LLamada inline'},
                function(e) {
                    ui.msgBox(e.target + ":" + e.data.msg, e.data.title, 0);
                });

            v.bind("SCJAVA1", "onclick", "EspecialcollTest1", jstestClick);
        </script>
    </action>
</before-edit>
```

### 2.4 after-edit - Después de entrar en edición

**Ambito:** object | **Tipo:** interno

Se dispara después de que la vista ha entrado en modo edición y se ha pintado la interfaz. Útil para operaciones que requieren que la UI ya este renderizada.

```xml
<after-edit show-wait-dialog="false" refresh="false">
    <action name="runscript">
        <script language="javascript">
            if (appData.getGlobalMacro("##DEVICE_OS##") == "android")
                requestIgnoreBatteryOptimizations();
        </script>
    </action>
</after-edit>
```

**Ejemplo real** (del proyecto EspecialChat):

```xml
<after-edit show-wait-dialog="false" refresh="false">
    <action name="runscript">
        <script language="javascript">
            lockContents(["Chat", "nUsuarios", "Chatear"]);
        </script>
    </action>
</after-edit>
```

### 2.5 Orden de ejecución de lifecycle

El orden de ejecución de los eventos de ciclo de vida es:

**Para un objeto nuevo:**
1. `create` - Se inicializa el objeto
2. `before-edit` - Se prepara la vista
3. (Se pinta la interfaz)
4. `after-edit` - La vista esta renderizada

**Para un objeto existente:**
1. `load` - Se carga desde BD
2. `before-edit` - Se prepara la vista
3. (Se pinta la interfaz)
4. `after-edit` - La vista esta renderizada

**Al salir:**
1. `onback` - El usuario pulsa atrás

---

## 3. Eventos de Interaccion

### 3.1 onclick (atributo) - Click/tap en elemento

**Ambito:** property | **Tipo:** atributo

Se dispara cuando el usuario hace click o tap en un elemento. Se declara como atributo en el nodo `<prop>`.

```xml
<prop type="B" name="BTN_LOGIN" title="Login"
      onclick="doLogin();"/>

<prop name="BTN_ACCION" type="B"
      onclick="self.MAP_QR=1; ui.refresh('frmCamera'); ui.sleep(0.1);"/>
```

**Ejemplo real** (del proyecto EspecialEventos, llamada inline con parámetros):

```xml
<prop name="ATTJAVA" title="No abre coleccion"
      onclick="javascript:(function(e, data) {
          ui.msgBox(e.target + ':' + data.msg, data.title, 0);
      })(e, {title:'valor desde fuera', msg:'LLamada inline'});"
      type="B" visible="1" width="300p" height="150p"
      labelwidth="1" bgcolor="#666666" forecolor="#F2F2F2"/>
```

**Ejemplo real** (del proyecto EspecialEventos, llamada a función con datos):

```xml
<prop name="ATTJAVA1" title="Abrir coleccion 1"
      onclick="javascript:jstestClickNode(e, 'EspecialcollTest1');"
      type="B" visible="1" width="300p" height="150p"/>

<prop name="ATTJAVA2" title="Abrir coleccion 2"
      onclick="javascript:jstestClickNode(e, {
          title:'valor desde fuera',
          msg:'Abre un nuevo objeto',
          collName: 'EspecialcollTest2'
      });"
      type="B" visible="1" width="300p" height="150p"/>
```

### 3.2 onchange (nodo y atributo) - Cambio de valor

**Ambito:** property/object | **Tipo:** interno/atributo

Se dispara cuando cambia el valor de una propiedad. Puede usarse de dos formas:

**Como nodo `<onchange>` con campos `<field>` especificos:**

```xml
<onchange show-wait-dialog="false" refresh="false">
    <field name="MAP_TIPO">
        <action name="runscript">
            <script language="javascript">
                actualizarPorTipo();
            </script>
        </action>
    </field>
</onchange>
```

**Ejemplo real** (del proyecto EspecialMacros, con multiples campos):

```xml
<onchange>
    <field name="MAP_TIPO">
        <action name="runscript">
            <script language="javascript">
                var coll = self.getContents("content1");
                if (self.TIPO == "TODOS") {
                    coll.setMacro("##TIPO##", "1=1");
                } else {
                    coll.setMacro("##TIPO##", "FILTRO='" + self.TIPO.toString() + "'");
                }
                ui.refresh();
            </script>
        </action>
    </field>
    <field name="MAP_TIPO1">
        <action name="runscript">
            <script language="javascript">
                var coll = self.getContents("content2");
                if (self.TIPO1 == "TODOS") {
                    coll.setMacro("##TIPO##",
                        "SELECT ID,TITULO,FILTRO FROM GEN_CONTROLES");
                } else {
                    coll.setMacro("##TIPO##",
                        "SELECT ID,TITULO,FILTRO FROM GEN_CONTROLES WHERE FILTRO='"
                        + self.TIPO1.toString() + "'");
                }
                ui.refresh();
            </script>
        </action>
    </field>
</onchange>
```

**Ejemplo real** (del proyecto EspecialChat, escuchando cambios en foto y adjunto):

```xml
<onchange>
    <field name="MAP_FOTO">
        <action name="runscript">
            <script language="javascript">
                AccionesChatEspecial('enviar');
            </script>
        </action>
    </field>
    <field name="MAP_ADJUNTO">
        <action name="runscript">
            <script language="javascript">
                AccionesChatEspecial('adjuntoguardar', e);
            </script>
        </action>
    </field>
</onchange>
```

**Como atributo en `<prop>` (forma simplificada):**

```xml
<prop name="CANTIDAD" type="N" onchange="Refresh"/>
<prop name="MAP_TEXT" type="T" onchange="ExecuteNode(oldvalue)"/>
<prop name="Calendario" type="Z" onchange="refresh" postonchange="refresh"/>
```

El valor `"Refresh"` o `"refresh"` hace un refresco automático de la pantalla. También puede usarse `"refresh(campo1,campo2)"` para refrescar campos especificos.

#### onvaluechanged (atributo) — Cambio de valor en la capa de datos

`onvaluechanged` se dispara cuando el valor de un campo cambia. Tiene dos características que lo distinguen:

1. **Su valor es JavaScript inline normal** (igual que `onclick`): escribes directamente el código a ejecutar.
2. **Se dispara desde la capa de datos**, así que salta siempre que el valor del campo cambie de verdad, **aunque no haya ninguna ventana abierta** (cambios provocados por scripts de fondo, réplica, tareas programadas, etc.).

Recibe un objeto de evento `e` con estas propiedades:

| Propiedad | Descripción |
|-----------|-------------|
| `e.value` | Nuevo valor del campo (después del cambio) |
| `e.oldValue` | Valor que tenía el campo antes del cambio |
| `e.target` | Nombre del campo que ha cambiado |
| `e.objItem` | Objeto de datos sobre el que se ha producido el cambio |
| `e.data` | Dato libre asociado al binding (normalmente vacío) |

```xml
<!-- Recalcular un total al cambiar la cantidad, haya o no pantalla abierta -->
<prop name="CANTIDAD" type="N" visible="1"
      onvaluechanged="self.TOTAL = e.value * self.PRECIO;" />

<!-- Registrar el cambio en una auditoría -->
<prop name="ESTADO" type="T" visible="1"
      onvaluechanged="registrarCambio(e.target, e.oldValue, e.value);" />
```

También se puede registrar dinámicamente desde JavaScript:

```javascript
self.bind("CANTIDAD", "onvaluechanged", function (e) {
    self.TOTAL = e.value * self.PRECIO;
});
```

**Solo JavaScript.** Se dispara únicamente cuando el valor cambia de verdad (reasignar el mismo valor no lo dispara) y nunca durante la carga del objeto desde la base de datos.

Es ideal para lógica que debe ejecutarse siempre que el dato cambie (recalcular campos, `Save()`, auditoría, sincronización), haya o no una pantalla abierta.

### 3.3 selecteditem - Selección en lista

**Ambito:** collection | **Tipo:** interno

Se dispara cuando el usuario selecciona un item de una lista o content.

```xml
<selecteditem refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            onSelectedItem(self);
        </script>
    </action>
</selecteditem>
```

> **Referencia cruzada:** Para ver como se implementa la selección en listas con contents, ver el tópico 02 sobre estructura XML y el patron maestro-detalle en la sección 10.2.

### 3.4 onlongpressitem - Pulsacion larga

**Ambito:** collection | **Tipo:** interno

Se dispara cuando el usuario hace una pulsacion larga sobre un item de una lista.

```xml
<onlongpressitem refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            mostrarMenuContextual(self);
        </script>
    </action>
</onlongpressitem>
```

### 3.5 onback - Botón retroceso

**Ambito:** object | **Tipo:** interno

Se dispara cuando el usuario presiona el botón de retroceso del dispositivo. Permite controlar la navegación hacia atrás.

```xml
<onback refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            if (hayDatosSinGuardar()) {
                confirmarSalida();
            } else {
                ui.closeApp();
            }
        </script>
    </action>
</onback>
```

**Ejemplo real** (patron estándar en todos los proyectos del wiki):

```xml
<onback show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            ui.getView(self).exit();
        </script>
    </action>
</onback>
```

**Ejemplo real** (del proyecto UseCars - EntradaApp, con confirmacion):

```xml
<onback>
    <script>
        if (confirmar("¿Desea salir de la aplicación?", "Salir")) {
            appData.exit();
        }
    </script>
</onback>
```

**Ejemplo real** (del proyecto EspecialChat, lógica condicional):

```xml
<onback show-wait-dialog="false" refresh="false">
    <action name="runscript">
        <script language="javascript">
            salir();
        </script>
    </action>
</onback>
```

### 3.6 onrefresh - Al refrescar vista

**Ambito:** object | **Tipo:** interno

Se dispara cuando se refresca la vista del objeto.

```xml
<onrefresh>
    <action name="runscript">
        <script language="javascript">
            actualizarContadores();
        </script>
    </action>
</onrefresh>
```

### 3.7 postonchange (atributo) - Post-cambio

**Ambito:** property | **Tipo:** atributo

Se ejecuta después de que cambia el valor de una propiedad. A diferencia de `onchange`, se ejecuta en un segundo paso, permitiendo realizar acciones de post-procesamiento como refrescar la UI o ejecutar otro nodo.

```xml
<prop name="FOTO" type="IMG"
      method="executenode(HacerFoto)"
      postonchange="actualizarGaleria();"/>

<prop name="BNew" type="B" img="nuevo.png"
      method="ExecuteNode(nuevo)"
      postonchange="refresh"/>

<prop name="EGECUTARYREFRES" type="B"
      method="executeNode(pulsaronchange('EspecialColeccionDePegaOnchange'))"
      postonchange="ExecuteNode(postpulsaronchange)"/>
```

### 3.8 ontextchanged - Cambio de texto en tiempo real

**Ambito:** property | **Tipo:** atributo

Se dispara cada vez que el usuario escribe o borra un carácter en un campo de texto. Recibe un objeto evento con información sobre el cambio.

```xml
<prop name="MAP_ONTEXTCHANGED" title="onTextChanged" type="T"
      ontextchanged="javascript:eventoOnTextChanged(e);"/>
```

**Ejemplo real** (del proyecto EspecialEventos - la función receptora en JS):

```javascript
function eventoOnTextChanged(evento) {
    self["MAP_DESCRIPCIONEVENTO"] = "onTextChanged! target: " + evento.target
        + "\nObjItem: " + evento.objItem
        + "\nTecla pulsada: " + evento.keyPressed
        + "\noldText: " + evento.oldText
        + "\nnewText: " + evento.newText;
    ui.getView(self).refresh("MAP_DESCRIPCIONEVENTO");
}
```

**Ejemplo real** (del proyecto EspecialContents, filtrado en tiempo real):

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

**Propiedades del objeto evento (`e`):**

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `e.target` | string | Nombre del campo que disparo el evento |
| `e.objItem` | object | Referencia al objeto que contiene el campo |
| `e.keyPressed` | string | Tecla pulsada |
| `e.oldText` | string | Texto anterior al cambio |
| `e.newText` | string | Texto nuevo después del cambio |

### 3.9 onfocuschanged - Cambio de foco

**Ambito:** property | **Tipo:** atributo

Se dispara cuando un campo gana o pierde el foco.

```xml
<prop name="MAP_ONFOCUSCHANGED01"
      onfocuschanged="javascript:eventoOnFocusChanged(e);"
      title="Evento onFocus" type="T"/>
```

**Ejemplo real** (del proyecto EspecialEventos):

```javascript
function eventoOnFocusChanged(evento) {
    self.MAP_DESCRIPCIONEVENTO = "onFocusChanged! target: " + evento.target
        + "\nObjItem: " + evento.objItem
        + "\nTiene foco: " + evento.isFocused;
    ui.getView(self).refresh("MAP_DESCRIPCIONEVENTO");
}
```

**Ejemplo real** (del proyecto EspecialChat, en campo de texto del chat):

```xml
<prop name="MAP_TITLE"
      onfocuschanged="javascript:AccionesChatEspecial('foco', e);"
      ontextchanged="javascript:AccionesChatEspecial('textoChange', e);"
      type="T" visible="1" width="424p" height="80p"/>
```

**Propiedades del objeto evento (`e`):**

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `e.target` | string | Nombre del campo |
| `e.objItem` | object | Referencia al objeto |
| `e.isFocused` | boolean | `true` si gano el foco, `false` si lo perdio |

### 3.10 onscroll - Al hacer scroll

**Ambito:** frame | **Tipo:** atributo

Se dispara cuando el usuario hace scroll dentro de un frame con `scroll="true"`.

```xml
<frame name="atttop" align="top" height="100%" width="100%"
       scroll="true"
       onscroll="javascript:scrollArrow(e, '2');">
    <!-- contenido -->
</frame>
```

**Ejemplo real** (del proyecto EspecialEventos, mostrar/ocultar flecha de scroll):

```javascript
function scrollArrow(e, miparam) {
    if (miparam == 1) {
        if (e.dy <= 10 && self.MAP_VALORVER == 1) {
            self.MAP_VALORVER = 0;
            ui.getView(self).refresh("frmblotante");
        } else if (e.dy > 10 && self.MAP_VALORVER == 0) {
            self.MAP_VALORVER = 1;
            ui.getView(self).refresh("frmblotante");
        }
    }
}
```

**También se puede usar `bind` en `before-edit` para asignar el evento por script:**

```javascript
v.bind("sctop", "onscroll", function(e) {
    if (e.dy <= 10 && self.MAP_SCSHOWOVERSCROLL == 1) {
        self.MAP_SCSHOWOVERSCROLL = 0;
        ui.getView(self).refresh("scfroverscroll");
    } else if (e.dy > 10 && self.MAP_SCSHOWOVERSCROLL == 0) {
        self.MAP_SCSHOWOVERSCROLL = 1;
        ui.getView(self).refresh("scfroverscroll");
    }
});
```

**Propiedades del objeto evento (`e`):**

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `e.dy` | number | Desplazamiento vertical acumulado |

### 3.11 onfocus (grupo) - Al enfocar un grupo

**Ambito:** group | **Tipo:** atributo

Se dispara cuando un grupo (pestana) recibe el foco, típicamente al cambiar de tab con `group-swipe="true"`.

```xml
<group name="Group1" id="1" onfocus="ExecuteNode(onfocusgrupo(1))">
    <!-- contenido -->
</group>
<group name="Group2" id="2" onfocus="ExecuteNode(onfocusgrupo(2))">
    <!-- contenido -->
</group>
```

**Ejemplo real** (nodo custom asociado, presente en todos los proyectos del wiki):

```xml
<onfocusgrupo show-wait-dialog="false">
    <action name="runscript">
        <param name="index"/>
        <script language="javascript">
            self.MAP_GROUP = index;
        </script>
    </action>
</onfocusgrupo>
```

