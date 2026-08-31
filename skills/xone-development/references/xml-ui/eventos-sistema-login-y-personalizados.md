# XOne — Eventos: interacción avanzada, login, sistema y personalizados

> Fuente: `xone/v2/xone-help-docs/topics/05-events-patterns-faq.md` §3A–§8. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §3A drawer y bottom sheet · §4 eventos de login · §5 eventos del sistema (onpushreceived, maintenance, sys-message) · §5A ciclo de aplicación · §5B inactividad · §5D códigos sys-message · §6 réplica · §7 eventos personalizados con ExecuteNode y param · §8 acciones runscript y setval

---

## 3A. Eventos Adicionales de Interaccion

### 3A.1 onlongpress - Pulsacion larga en un prop

**Ambito:** property | **Tipo:** atributo

Se dispara cuando el usuario mantiene pulsado un control individual (a diferencia de `onlongpressitem` que opera sobre items de lista).

```xml
<prop name="BTN_OPCIONES" type="B" title="Opciones"
      onlongpress="javascript:mostrarMenu();"/>
```

### 3A.2 onlongpressitem - Pulsacion larga en item de lista

**Ambito:** property | **Tipo:** atributo

Se dispara cuando el usuario mantiene pulsado un item dentro de un content/lista. Recibe la posición del item en `e.position`.

```xml
<prop name="@miLista" type="Z" contents="miLista"
      onlongpressitem="javascript:mostrarMenu(e.position);"/>
```

### 3A.3 oneditoraction - Acción de teclado (Done/Next)

**Ambito:** property | **Tipo:** atributo

Se dispara cuando el usuario pulsa la tecla Intro, Done o Siguiente en el teclado virtual. Útil para formularios de login o busqueda donde se quiere ejecutar una acción al confirmar.

```xml
<prop name="MAP_CONTRASENNA" type="X" title="Contraseña"
      oneditoraction="javascript:oneditoraction(self, 0, 'MAP_CONTRASENNA');"/>
```

```javascript
function oneditoraction(obj, action, fieldName) {
    if (fieldName == "MAP_CONTRASENNA") {
        obj.executeNode("doLogin");
    }
}
```

### 3A.4 oncodescanned - Código escaneado (QR/Barcode)

**Ambito:** property | **Tipo:** atributo

Se dispara cuando se completa el escaneo de un código QR o de barras.

```xml
<prop name="MAP_SCANNER" type="T"
      oncodescanned="procesarCodigo(e);"/>
```

```javascript
function procesarCodigo(e) {
    self.MAP_CODIGO = e.data;       // contenido del código (e.type indica el formato: qr, datamatrix, etc.)
    ui.refresh("MAP_CODIGO");
    ui.showToast("Código leído: " + e.data);
}
```

### 3A.5 ondateselected - Fecha seleccionada en calendario

**Ambito:** property (tipo Z con viewmode calendario) | **Tipo:** atributo

Se dispara cuando el usuario selecciona una fecha en un control de calendario. Recibe el parámetro `date`.

```xml
<prop name="MAP_CALENDARIO" type="Z" contents="contentCalendario"
      viewmode="calendarview"
      ondateselected="javascript:onFechaSeleccionada(e);"/>
```

**Ejemplo real** (del proyecto EspecialCalendario, como nodo):

```xml
<ondateselected show-wait-dialog="false">
    <action name="runscript">
        <param name="date"/>
        <script language="javascript">
            self.MAP_FECHA = date;
            cargarEventosFecha(date);
        </script>
    </action>
</ondateselected>
```

### 3A.6 onpageselected - Cambio de página (calendario/slideview/tabs)

**Ambito:** property (tipo Z con viewmode calendario o slideview) | **Tipo:** atributo

Se dispara cuando el usuario cambia de mes/página en un calendario o slideview. Recibe `startDate` y `endDate`.

```xml
<prop name="MAP_CALENDARIO" type="Z" contents="contentCalendario"
      viewmode="calendarview"
      onpageselected="javascript:onMesCambiado(e);"/>
```

**Ejemplo real** (del proyecto EspecialCalendario, como nodo):

```xml
<onpageselected show-wait-dialog="false">
    <action name="runscript">
        <param name="startDate"/>
        <param name="endDate"/>
        <script language="javascript">
            cargarEventosPeriodo(startDate, endDate);
        </script>
    </action>
</onpageselected>
```

### 3A.7 Eventos de mapa

Los props con `viewmode="mapview"` u `viewmode="openstreetmap"` soportan estos eventos:

| Evento | Descripción | Ejemplo |
|--------|-------------|---------|
| `onmapclicked` | Click en el mapa | `onmapclicked="onMapClicked(e);"` |
| `onmaplongclicked` | Click prolongado en el mapa | `onmaplongclicked="onMapLongClicked(e);"` |
| `onmarkerdragend` | Fin de arrastrar un marcador | `onmarkerdragend="onMarkerDraggedEnd(e);"` |
| `onmapready` | El mapa esta listo para usar | `onmapready="onMapReady(e);"` |
| `onlocationready` | Ubicación GPS lista | `onlocationready="handler(e);"` |
| `onlocationchanged` | Cambio de ubicación GPS | `onlocationchanged="handler(e);"` |

**Ejemplo real** (del proyecto EspecialMapa con OpenStreetMap):

```xml
<prop name="MAP_MAPA" show-compass="true" show-minimap="true"
      show-scale="true" zoom-to-pois="true"
      visible="1" type="Z"
      contents="ClientesCoord" viewmode="openstreetmap"
      width="100%" height="60%"
      onmapclicked="onMapClicked(e);"
      onmaplongclicked="onMapLongClicked(e);"
      onmarkerdragend="onMarkerDraggedEnd(e);"/>
```

### 3A.8 onscroll - Evento de scroll

**Ambito:** frame | **Tipo:** atributo

Se dispara cuando el usuario hace scroll dentro de un frame con `scroll="true"`. El objeto evento contiene `e.dy` (desplazamiento vertical acumulado).

```xml
<frame name="frmContenido" width="100%" height="100%"
       scroll="true"
       onscroll="javascript:scrollArrow(e, '2');">
    <!-- contenido scrollable -->
</frame>
```

```javascript
function scrollArrow(e, miparam) {
    if (e.dy <= 10 && self.MAP_VALORVER == 1) {
        self.MAP_VALORVER = 0;
        ui.getView(self).refresh("frmblotante");
    } else if (e.dy > 10 && self.MAP_VALORVER == 0) {
        self.MAP_VALORVER = 1;
        ui.getView(self).refresh("frmblotante");
    }
}
```

### 3A.9 Eventos del drawer lateral

**Ambito:** collection | **Tipo:** atributo

Hay cuatro eventos del drawer lateral, todos atributos del nodo `<coll>`. El objeto del evento llega en `e`:

| Evento | Cuándo se dispara | Propiedades de `e` |
|--------|-------------------|--------------------|
| `ondraweropened` | El drawer queda completamente abierto | `e.id` — id del grupo drawer |
| `ondrawerclosed` | El drawer queda completamente cerrado | `e.id` |
| `ondrawerslide` | Durante el deslizamiento (se llama repetidamente) | `e.id`, `e.slideOffset` (de `0.0` cerrado a `1.0` abierto) |
| `ondrawerstatechanged` | Cambia el estado de arrastre | `e.state`: `"idle"`, `"dragging"`, `"settling"` o `"unknown"` |

`e.id` permite distinguir qué drawer cambió cuando hay varios en la misma pantalla. `ondrawerstatechanged` no incluye `e.id`.

```xml
<coll name="PantallaConDrawer" notab="true"
      ondraweropened="onDrawerOpened(e);"
      ondrawerclosed="onDrawerClosed(e);"
      ondrawerslide="onDrawerSlide(e);"
      ondrawerstatechanged="onDrawerStateChanged(e);">
    <group name="Drawer" id="999"
           width="60%" drawer-orientation="left" bgcolor="#FFFFFF">
        <!-- Contenido del drawer -->
    </group>
    <group name="Contenido" id="1">
        <!-- Contenido principal -->
    </group>
</coll>
```

### 3A.10 onconsolemessage - Mensajes de consola del WebView

**Ambito:** property (`type="WEB"`) | **Tipo:** atributo

Se dispara con cada mensaje que el WebView reporta a su consola: errores JS, llamadas a `console.log`/`warn`/`error`, etc. Util para capturar fallos del contenido web sin tener que conectar el inspector remoto.

```xml
<prop name="MAP_WEB" type="WEB" visible="1"
      height="40%"
      title="Página Web"
      onconsolemessage="handleConsole(e);" />
```

```javascript
function handleConsole(e) {
    if (e.messageLevel === "ERROR") {
        ui.msgBox("Nivel: " + e.messageLevel +
            "\nMensaje: " + e.message +
            "\nLinea: " + e.lineNumber +
            "\nFuente: " + e.sourceId, "Error WebView", 0);
    }
}
```

**Propiedades del objeto evento (`e`):**

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `e.target` | string | Nombre del prop que disparo el evento |
| `e.objItem` | object | Referencia al DataObject que contiene el prop |
| `e.messageLevel` | string | Nivel del mensaje: `"LOG"`, `"DEBUG"`, `"WARNING"`, `"ERROR"`, `"TIP"` |
| `e.message` | string | Texto del mensaje |
| `e.lineNumber` | number | Linea del fuente donde se origino el mensaje |
| `e.sourceId` | string | URL/identificador del fuente que origino el mensaje |

---

### 3A.11 ontouchdown / ontouchup - Presionar y soltar un botón

**Ambito:** property (solo `type="B"`) | **Tipo:** atributo

Pareja de eventos táctiles de bajo nivel exclusivos de los botones (`type="B"`):

- **`ontouchdown`**: se dispara en el instante en que el dedo toca el botón (al presionar).
- **`ontouchup`**: se dispara al levantar el dedo o al cancelarse el gesto (al soltar).

A diferencia de `onclick` —que solo se dispara una vez completado el tap— estos eventos permiten **distinguir el momento de presionar del de soltar**, lo que habilita interacciones de tipo "mantener pulsado" (por ejemplo, iniciar una grabación mientras se mantiene el botón y detenerla al soltarlo). Su valor es JavaScript inline normal, igual que `onclick`.

```xml
<prop name="BTN_HABLAR" type="B" title="Mantener para hablar"
      ontouchdown="javascript:iniciarGrabacion();"
      ontouchup="javascript:detenerGrabacion();"/>
```

**Propiedades del objeto evento (`e`):**

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `e.target` | string | Nombre del prop (botón) que disparo el evento |
| `e.objItem` | object | Referencia al DataObject que contiene el prop |
| `e.x` | number | Coordenada X del toque, relativa al botón (px) |
| `e.y` | number | Coordenada Y del toque, relativa al botón (px) |

**Notas:**

- Conviven con `onclick`: si el botón define ambos, `onclick` se sigue disparando al soltar (después de `ontouchup`). Para un botón de tipo "mantener pulsado" lo habitual es no definir `onclick`.
- El botón debe estar habilitado y ser pulsable (es el caso normal de un botón con fondo). Sobre un botón deshabilitado no se disparan.

---

## 4. Eventos de Login

### 4.1 login-ok

**Ambito:** collection (login-coll) | **Tipo:** interno

Se dispara cuando el proceso de login es exitoso.

```xml
<login-ok refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            ui.showToast("Bienvenido!");
            cargarDatosUsuario();
        </script>
    </action>
</login-ok>
```

### 4.2 login-fail

**Ambito:** collection (login-coll) | **Tipo:** interno

Se dispara cuando el login falla. Permite acceder a la descripción del error.

```xml
<login-fail>
    <action name="runscript">
        <script language="javascript">
            var error = self.getVariable("##LOGIN_ERRORDESCRIPTION##");
            ui.showToast("Error: " + error);
        </script>
    </action>
</login-fail>
```

### 4.3 onlogon (nivel Empresas)

**Ambito:** application (Empresas) | **Tipo:** interno

Se dispara cuando el usuario inicia sesión en la aplicación. Se declara en la coleccion `Empresas` dentro de `mappings.xne`.

```xml
<onlogon>
    <action name="runscript">
        <script language="javascript">
            inicializarAplicacion();
        </script>
    </action>
</onlogon>
```

### 4.4 onlogoff (con replica)

**Ambito:** application (Empresas) | **Tipo:** interno

Se dispara cuando el usuario cierra sesión. Soporta atributos especiales para gestionar la replica de datos antes de salir.

```xml
<onlogoff with-replica="true" replica-retry="1" replica-fail-exit="true">
    <action name="runscript">
        <script language="javascript">
            limpiarDatosLocales();
        </script>
    </action>
</onlogoff>
```

**Atributos especiales de `onlogoff`:**

| Atributo | Tipo | Descripción |
|----------|------|-------------|
| `with-replica` | boolean | Ejecutar replica antes de cerrar sesión |
| `replica-retry` | number | Número de reintentos si la replica falla |
| `replica-fail-exit` | boolean | Salir igualmente si la replica falla |

---

## 5. Eventos del Sistema

### 5.1 onpushreceived - Notificación push recibida

**Ambito:** application (Empresas) | **Tipo:** interno

Se dispara cuando la aplicación recibe una notificación push.

```xml
<onpushreceived>
    <action name="runscript">
        <param name="message"/>
        <script language="javascript">
            ui.showToast("Push recibido: " + message.source);
            procesarNotificacion(message);
        </script>
    </action>
</onpushreceived>
```

### 5.2 onpushnotificationclick - Click en notificación

**Ambito:** application (Empresas) | **Tipo:** interno

Se dispara cuando el usuario hace click en una notificación push.

```xml
<onpushnotificationclick>
    <action name="runscript">
        <param name="message"/>
        <script language="javascript">
            if (ui.isInBackground()) {
                ui.returnToForeground();
            }
            abrirDetalle(message.data);
        </script>
    </action>
</onpushnotificationclick>
```

### 5.3 notification - Manejador general

**Ambito:** application | **Tipo:** interno

Manejador general de notificaciones locales. Recibe parámetros sobre la notificación disparada.

```xml
<notification refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <param name="id_notificacion"/>
        <param name="sDirectReply"/>
        <param name="parameters"/>
        <script language="javascript">
            procesarNotificacion(id_notificacion, parameters);
        </script>
    </action>
</notification>
```

### 5.4 sys-message - Mensaje del sistema (códigos 1000-1003)

**Ambito:** application (Empresas) | **Tipo:** interno

Se dispara cuando se recibe un mensaje del sistema, típicamente relacionado con actualizaciones o provisionamiento.

```xml
<sys-message>
    <action name="runscript">
        <param name="codigo"/>
        <param name="message"/>
        <param name="liveResponse"/>
        <script language="javascript">
            procesarMensajeSistema(codigo, message);
        </script>
    </action>
</sys-message>
```

**Ejemplo real** (función `sysMessage` del proyecto wiki):

```javascript
function sysMessage(codigo, message) {
    var cadena = "";
    switch (codigo) {
        case 1000:
            cadena = " Actualizacion descargandose.";
            break;
        case 1001:
            cadena = " Actualizacion aplicada.";
            break;
        case 1002:
            cadena = " Se han aplicado todas las actualizaciones.";
            break;
        case 1003:
            // Provisionamiento seguro
            ui.msgBox("Se ha programado una actualizacion de base de datos.",
                "Mensaje", 0);
            var bResult = replica.processReplicatorQueue(liveResponse);
            if (bResult) {
                appData.exit();
            } else {
                ui.showToast("Error al procesar la cola de salida");
            }
            break;
    }
}
```

**Códigos del sistema:**

| Código | Descripción |
|--------|-------------|
| 1000 | Actualización descargandose (uno por cada actualización) |
| 1001 | Actualización aplicada (uno por cada actualización) |
| 1002 | Todas las actualizaciones aplicadas |
| 1003 | Provisionamiento seguro - requiere replica y cierre |

### 5.5 maintenance - Tareas programadas (period, frecuency)

**Ambito:** application (Empresas) | **Tipo:** contenedor

Contenedor para definir tareas periódicas que se ejecutan automáticamente.

```xml
<maintenance>
    <!-- Tarea cada 10 minutos -->
    <action name="SincronizarDatos" type="runscript"
            period="S" frecuency="600" auto="true" show="false">
        <script language="javascript">
            sincronizarConServidor();
        </script>
    </action>

    <!-- Replica automática -->
    <action name="Replica" type="replica"
            frecuency="400" period="X" synchronize="true"/>
</maintenance>
```

**Atributos de action en maintenance:**

| Atributo | Tipo | Descripción | Valores |
|----------|------|-------------|---------|
| `name` | string | Nombre identificativo de la tarea | Cualquier texto |
| `type` | string | Tipo de acción | `runscript`, `replica` |
| `period` | string | Unidad de tiempo | `S` (segundos), `X` (minutos) |
| `frecuency` | number | Frecuencia en la unidad especificada | Ej: `600` (cada 600 seg) |
| `auto` | boolean | Ejecución automática al iniciar | `true`/`false` |
| `show` | boolean | Mostrar en la interfaz | `true`/`false` |
| `synchronize` | boolean | Sincronizar al ejecutar | `true`/`false` |

**Ejemplo de mantenimiento cada 24 horas:**

```xml
<maintenance>
    <action name="LimpiezaDiaria" type="runscript"
            period="X" frecuency="1440" auto="true" show="false">
        <script language="javascript">
            // Tareas periodicas de mantenimiento (cada 24h = 1440 min)
            limpiarRegistrosAntiguos();
            compactarBaseDeDatos();
        </script>
    </action>
</maintenance>
```

### 5.6 onrecovery - Recuperación

**Ambito:** application | **Tipo:** interno

Se dispara cuando la aplicación se recupera de un cierre inesperado o de un estado previo.

```xml
<onrecovery>
    <action name="runscript">
        <script language="javascript">
            verificarEstadoPendiente();
        </script>
    </action>
</onrecovery>
```

### 5.7 after-recovery-login - Login tras recuperación

**Ambito:** application | **Tipo:** interno

Se dispara después de que el usuario inicia sesión tras una recuperación de la aplicación (por crash o kill del sistema operativo).

```xml
<after-recovery-login>
    <action name="runscript">
        <script language="javascript">
            restaurarSesionAnterior();
        </script>
    </action>
</after-recovery-login>
```

---

## 5A. Eventos de Ciclo de Aplicación

### 5A.1 on-app-foreground - App vuelve a primer plano

**Ambito:** application (Empresas) | **Tipo:** interno

Se dispara cuando la aplicación vuelve al primer plano después de estar en segundo plano. Es el lugar ideal para verificar inactividad y forzar re-login si es necesario.

```xml
<on-app-foreground>
    <action name="runscript">
        <script language="javascript">
            verificarConexion();
            actualizarDatos();
        </script>
    </action>
</on-app-foreground>
```

**Ejemplo real con verificación de inactividad:**

```xml
<on-app-foreground refresh="false">
    <action name="runscript">
        <script language="javascript">
            var nTime = ui.getInactivityTime();
            if (nTime >= jsconst_oper.tiempoInactividad) {
                var objCrear = new LoginColl_Inactivity();
                ui.openEditView(objCrear);
            }
        </script>
    </action>
</on-app-foreground>
```

### 5A.2 on-app-background - App pasa a segundo plano

**Ambito:** application (Empresas) | **Tipo:** interno

Se dispara cuando la aplicación pasa a segundo plano (el usuario cambia de app o pulsa Home).

```xml
<on-app-background>
    <action name="runscript">
        <script language="javascript">
            guardarEstadoActual();
        </script>
    </action>
</on-app-background>
```

---

## 5B. Gestion de Inactividad

XOne proporciona funciones JavaScript para gestionar la inactividad del usuario, útiles para forzar re-login por seguridad.

### 5B.1 ui.setInactivityTimer(segundos, acción)

Configura un temporizador de inactividad. Cuando el usuario no interactua durante el tiempo especificado, se ejecuta la acción indicada.

```javascript
ui.setInactivityTimer(300, "verificarSesion"); // 5 minutos
```

### 5B.2 ui.getInactivityTime()

Obtiene el tiempo en segundos transcurrido desde la última interaccion del usuario.

```javascript
var tiempo = ui.getInactivityTime();
if (tiempo > 1800) {
    // Mas de 30 minutos inactivo
    forzarReLogin();
}
```

### 5B.3 ui.removeInactivityTimer()

Elimina el temporizador de inactividad activo.

```javascript
ui.removeInactivityTimer();
```

### 5B.4 Patron completo: re-login por inactividad

Combinar `on-app-foreground` con `getInactivityTime()` para forzar re-login:

```xml
<!-- En Empresas (mappings.xne) -->
<on-app-foreground refresh="false">
    <action name="runscript">
        <script language="javascript">
            var nTime = ui.getInactivityTime();
            if (nTime >= 1800) {
                var objCrear = new LoginColl_Inactivity();
                ui.openEditView(objCrear);
            }
        </script>
    </action>
</on-app-foreground>
```

---

## 5D. Códigos sys-message detallados

El evento `sys-message` recibe un parámetro `código` que indica el tipo de mensaje del sistema. Estos son los códigos documentados:

| Código | Categoría | Descripción |
|--------|-----------|-------------|
| 1000 | Actualización | Actualización descargandose (uno por cada actualización individual) |
| 1001 | Actualización | Actualización aplicada exitosamente (uno por cada actualización) |
| 1002 | Actualización | Todas las actualizaciones han sido aplicadas |
| 1003 | Provisionamiento | Provisionamiento seguro - requiere procesar cola de replica y reiniciar |

**Ejemplo completo de manejo de sys-message:**

```javascript
function sysMessage(codigo, message) {
    var cadena = "";
    switch (codigo) {
        case 1000:
            cadena = "Actualizacion descargandose.";
            ui.showToast(cadena);
            break;
        case 1001:
            cadena = "Actualizacion aplicada.";
            ui.showToast(cadena);
            break;
        case 1002:
            cadena = "Se han aplicado todas las actualizaciones.";
            ui.showToast(cadena);
            break;
        case 1003:
            // Provisionamiento seguro: procesar cola y reiniciar
            ui.msgBox("Se ha programado una actualizacion de base de datos.",
                "Mensaje", 0);
            var bResult = replica.processReplicatorQueue(liveResponse);
            if (bResult) {
                appData.exit();
            } else {
                ui.showToast("Error al procesar la cola de salida");
            }
            break;
    }
}
```

> **Nota:** El parámetro `liveResponse` esta disponible como tercer parámetro del evento `sys-message`. Se usa exclusivamente con el código 1003 para el provisionamiento seguro.

---

## 6. Eventos de Replica

### 6.1 replica-ok-{tabla}

**Ambito:** application (Empresas) | **Tipo:** interno

Se dispara cuando la replica de una tabla especifica es exitosa. El nombre del evento incluye el nombre de la tabla con prefijo.

```xml
<replica-ok-gen_ot_cabecera>
    <action name="runscript">
        <script language="javascript">
            actualizarListadoOT();
            ui.showToast("OTs sincronizadas");
        </script>
    </action>
</replica-ok-gen_ot_cabecera>
```

---

## 7. Eventos Personalizados (Custom)

### 7.1 Definición de eventos custom

Los eventos personalizados se definen como nodos XML con cualquier nombre dentro de la coleccion. Son el mecanismo principal para organizar la lógica de la aplicación en bloques reutilizables.

```xml
<GuardarFormulario refresh="true" show-wait-dialog="true"
                   wait-dialog-text="Guardando...">
    <action name="runscript">
        <script language="javascript">
            validarYGuardar();
        </script>
    </action>
</GuardarFormulario>
```

### 7.2 Invocación con ExecuteNode(nombre)

Se invocan desde atributos `method` o `onclick` de un `<prop>`:

```xml
<prop name="BTN_GUARDAR" type="B"
      method="ExecuteNode(GuardarFormulario)"/>
```

También se pueden invocar desde JavaScript:

```javascript
self.executeNode("GuardarFormulario");
```

### 7.3 Paso de parámetros ExecuteNode(nombre(param))

Se pueden pasar parámetros directamente en la invocación:

```xml
<prop name="BTN_MENU" type="B"
      method="executenode(CambiarMenu(3))"/>

<prop name="BTBUSCAR" type="B"
      method="ExecuteNode(buscar(1))"/>

<prop name="BTORDENAR" type="B"
      method="ExecuteNode(buscar(2))"/>
```

### 7.4 Usando `<param name="..."/>`

Los parámetros se reciben en el evento con nodos `<param>`:

```xml
<CambiarMenu refresh="true">
    <action name="runscript">
        <param name="opcion"/>
        <script language="javascript">
            cambiarAOpcion(opcion);
        </script>
    </action>
</CambiarMenu>
```

**Ejemplo real** (del proyecto EspecialContents - busqueda y ordenacion):

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
                        "NOMBRE like '%" + self.MAP_FILTRO.toString() + "%' OR "
                        + "DIRECCION like '%" + self.MAP_FILTRO.toString() + "%'"
                    );
                }
            } else {
                if (self.MAP_ORDEN == "ASC") {
                    self.MAP_ORDEN = "DESC";
                    self.MAP_BTORDEN = "sortZA.png";
                    self.MAP_BTORDENCLICK = "sortZA_click.png";
                } else {
                    self.MAP_ORDEN = "ASC";
                    self.MAP_BTORDEN = "sortAZ.png";
                    self.MAP_BTORDENCLICK = "sortAZ_click.png";
                }
                self.getContents("content4").sort =
                    "NOMBRE " + self.MAP_ORDEN.toString();
            }
            self.getContents("content4").unlock();
            self.getContents("content4").loadAll();
            self.getContents("content4").lock();
            ui.getView(self).refresh("@content4,BTORDENAR");
        </script>
    </action>
</buscar>
```

**Ejemplo real** (del proyecto EspecialContents - multiples parámetros con checkAll):

```xml
<checkAll refresh="false">
    <action name="runscript">
        <param name="activo"/>
        <script language="javascript">
            var objContent = self.getContents("ContentDatosFiltroMultiseleccion");
            if (activo == 1) {
                var vres = userMsgBox("OPCIONES",
                    "Confirme que desea marcar todos los registros", "2");
            } else {
                var vres = userMsgBox("OPCIONES",
                    "Confirme que desea DESmarcar todos los registros", "2");
            }
            if (vres == 1) {
                for (var i = 0; i < objContent.count(); i++) {
                    var item = objContent.get(i);
                    if (activo == 1) {
                        if (item.MAP_SELECTED == 1 && item.REALIZADA == 0) {
                            ReportarTareaPendiente2(item);
                            item.MAP_SELECTED = 0;
                        }
                    } else {
                        if (item.MAP_SELECTED == 1 && item.REALIZADA == 1) {
                            DesregistrarPendiente2(item);
                            item.MAP_SELECTED = 0;
                        }
                    }
                }
            }
            self.executeNode("applyfilter");
        </script>
    </action>
</checkAll>
```

---

## 8. Acciones dentro de Eventos

### 8.1 runscript - Ejecutar JavaScript

La acción `runscript` ejecuta un bloque de código JavaScript.

```xml
<action name="runscript">
    <param name="parametro"/>
    <script language="javascript">
        // Código JavaScript con acceso a 'parametro'
        ui.showToast("Parametro: " + parametro);
    </script>
</action>
```

Un evento puede contener multiples acciones `runscript` que se ejecutan en orden:

```xml
<before-edit>
    <action name="runscript">
        <script language="javascript">
            ui.getView(self).bind("SCVB", "onclick", "testClick");
        </script>
    </action>
    <action name="runscript">
        <script language="javascript">
            self.MAP_GROUP = 1;
            self.MAP_TOTAL_PAGES = 3;
        </script>
    </action>
</before-edit>
```

### 8.2 setval - Establecer valor a campo

La acción `setval` asigna un valor a un campo del objeto actual sin necesidad de JavaScript.

```xml
<action name="setval" field="CAMPO" value="valor"/>
<action name="setval" field="FECHA" value="##NOW_TIME##"/>
<action name="setval" field="MAP_IDENTIFICADOR" value="##DEVICEID##"/>
```

**Ejemplo real** (del proyecto EspecialDatosOnline):

```xml
<before-edit show-wait-dialog="false">
    <action name="setval" field="MAP_IDENTIFICADOR" value="##DEVICEID##"/>
    <action name="runscript">
        <script language="javascript">
            if (ComprobarConexion() == 1) {
                // continuar...
            }
        </script>
    </action>
</before-edit>
```

### 8.3 Macros en setval: ##NOW_TIME##, ##NOW_DATE##

Las macros del sistema se pueden usar como valores en `setval`:

| Macro | Descripción | Ejemplo de valor |
|-------|-------------|------------------|
| `##NOW_TIME##` | Fecha y hora actual | `2024-01-15 14:30:00` |
| `##NOW_DATE##` | Fecha actual sin hora | `2024-01-15` |
| `##USERID##` | ID del usuario logueado | `1` |
| `##DEVICEID##` | ID único del dispositivo | `abc123def456` |
| `##MID##` | MID del dispositivo | `device_mid_value` |
| `##VERSION##` | Versión de la aplicación | `1.0.0` |
| `##FRAME_VERSION##` | Versión del framework XOne | `4.8.1.33` |
| `##DEVICE_OS##` | Sistema operativo | `android` o `ios` |
| `##DEVICE_MODEL##` | Modelo del dispositivo | `Pixel 6` |

> **Referencia cruzada:** Para la lista completa de macros del sistema, consultar el tópico 03 sobre la API JavaScript.

